import { randomUUID } from "node:crypto";
import {
  AgentEventSchema,
  boundedText,
  type AgentEvent,
  type EventData,
  type EventKind,
  type Provider,
} from "@agentwatch/shared";

type Dict = Record<string, unknown>;
export type EventMeta = {
  id?: string;
  observedAt: number;
  occurredAt?: number;
  sessionId?: string;
  live?: boolean;
};
const obj = (v: unknown): Dict =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {};
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.length ? v : undefined;
const stamp = (v: unknown, fallback: number) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? Date.parse(v)
    : fallback;

function event(
  provider: Provider,
  sessionId: string | undefined,
  kind: EventKind,
  source: AgentEvent["source"],
  meta: EventMeta,
  data: EventData = {},
  ids: { turnId?: string; callId?: string } = {},
): AgentEvent[] {
  if (!sessionId || sessionId.length > 256) return [];
  let truncated = false;
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      const t = boundedText(v);
      safe[k] = t.text;
      truncated ||= t.truncated;
    } else safe[k] = v;
  }
  if (truncated) safe.truncated = true;
  const stable =
    ids.callId && (kind === "tool.start" || kind === "tool.end")
      ? `${provider}:${sessionId}:${kind}:${ids.callId}`
      : `${provider}:${sessionId}:${meta.id ?? randomUUID()}`;
  const parsed = AgentEventSchema.safeParse({
    schemaVersion: 1,
    id: stable,
    provider,
    sessionId,
    sessionKey: `${provider}:${sessionId}`,
    kind,
    source,
    occurredAt: meta.occurredAt ?? meta.observedAt,
    observedAt: meta.observedAt,
    ...ids,
    data: safe,
  });
  return parsed.success ? [parsed.data] : [];
}

function toolData(raw: Dict): EventData {
  let input = obj(raw.tool_input);
  if (typeof raw.arguments === "string") {
    try {
      input = obj(JSON.parse(raw.arguments));
    } catch {
      /* unsupported arguments */
    }
  }
  const output = boundedText(raw.tool_response ?? raw.output);
  return {
    toolName: str(raw.tool_name ?? raw.name),
    command: str(input.command ?? input.cmd),
    path: str(input.file_path ?? input.path ?? input.target_file),
    result: output.text,
    error: raw.error ? boundedText(raw.error).text : undefined,
    truncated: output.truncated || undefined,
  };
}

export function normalizeHook(
  provider: Provider,
  input: unknown,
  meta: EventMeta,
): AgentEvent[] {
  const raw = obj(input),
    sessionId = str(raw.session_id),
    name = str(raw.hook_event_name);
  const common: EventData = {
    cwd: str(raw.cwd),
    subagentId: str(raw.agent_id),
  };
  const ids = {
    turnId: str(raw.turn_id ?? raw.prompt_id),
    callId: str(raw.tool_use_id),
  };
  const emit = (kind: EventKind, data: EventData = {}) =>
    event(provider, sessionId, kind, "hook", meta, { ...common, ...data }, ids);
  switch (name) {
    case "SessionStart":
      return emit("session.start", {
        confirmed: true,
        reason: str(raw.source),
        origin: provider === "claude" ? "cli" : undefined,
      });
    case "SessionEnd":
      return emit("session.end", { confirmed: true, reason: str(raw.reason) });
    case "UserPromptSubmit":
      return emit("turn.start", { task: str(raw.prompt), confirmed: true });
    case "PreToolUse":
      return emit("tool.start", toolData(raw));
    case "PostToolUse":
      return emit("tool.end", toolData(raw));
    case "PostToolUseFailure":
      return emit("tool.end", {
        ...toolData(raw),
        error: boundedText(raw.error ?? raw.tool_response ?? "Tool failed")
          .text,
      });
    case "Stop":
      return emit("turn.end");
    case "StopFailure":
      return emit("turn.end", { error: boundedText(raw.error).text });
    case "Interrupt":
      return emit("turn.end", { reason: "interrupted" });
    case "PermissionRequest":
      return emit("permission.request", {
        ...toolData(raw),
        confirmed: false,
        reason: "approval_pending",
      });
    case "Notification":
      if (
        [
          "permission_prompt",
          "elicitation_dialog",
          "elicitation_url_dialog",
          "agent_needs_input",
        ].includes(String(raw.notification_type))
      )
        return emit("attention", {
          confirmed: true,
          reason: str(raw.notification_type),
        });
      return [];
    case "SubagentStart":
      return emit("subagent.start", {
        agentId: str(raw.agent_id),
        agentType: str(raw.agent_type),
        childSessionId: str(raw.agent_session_id),
        parentSessionId: str(raw.parent_session_id),
        task: str(raw.prompt),
      });
    case "SubagentStop":
      return emit("subagent.end", {
        agentId: str(raw.agent_id),
        agentType: str(raw.agent_type),
        childSessionId: str(raw.agent_session_id),
      });
    default:
      return [];
  }
}

export function normalizeCodexRecord(
  input: unknown,
  meta: EventMeta,
): AgentEvent[] {
  const raw = obj(input),
    p = obj(raw.payload),
    type = str(raw.type);
  const sessionId = str(
    type === "session_meta"
      ? (p.id ?? p.session_id)
      : (p.thread_id ?? meta.sessionId),
  );
  const m = {
    ...meta,
    occurredAt: stamp(raw.timestamp, meta.occurredAt ?? meta.observedAt),
  };
  const ids = {
    turnId: str(p.turn_id ?? p.root_turn_id),
    callId: str(p.call_id),
  };
  const emit = (kind: EventKind, data: EventData = {}) =>
    event("codex", sessionId, kind, "log", m, data, ids);
  if (type === "session_meta") {
    const source = obj(p.source),
      subagent = obj(source.subagent),
      git = obj(p.git);
    return emit("session.metadata", {
      cwd: str(p.cwd),
      gitBranch: str(git.branch),
      origin: /desktop/i.test(String(p.originator))
        ? "desktop"
        : p.source === "cli"
          ? "cli"
          : "unknown",
      parentSessionId: str(subagent.parent_thread_id),
    });
  }
  if (type === "turn_context")
    return emit("session.metadata", { cwd: str(p.cwd) });
  if (type === "event_msg") {
    switch (p.type) {
      case "task_started":
        return emit("turn.start", { confirmed: meta.live === true });
      case "task_complete":
      case "task_completed":
        return emit("turn.end", {
          error: boundedText(p.error).text,
          confirmed: meta.live === true,
        });
      case "turn_aborted":
        return emit("turn.end", {
          reason: "interrupted",
          confirmed: meta.live === true,
        });
      case "user_message":
        return emit("turn.start", {
          task: str(p.message),
          confirmed: meta.live === true,
        });
      case "error":
        return emit("error", { error: str(p.message) });
      default:
        return [];
    }
  }
  if (type !== "response_item") return [];
  if (p.type === "function_call" || p.type === "custom_tool_call") {
    const data = toolData(p);
    if (
      !data.command &&
      p.type === "custom_tool_call" &&
      typeof p.input === "string"
    )
      data.command = p.input;
    return emit("tool.start", { ...data, confirmed: meta.live === true });
  }
  if (p.type === "function_call_output" || p.type === "custom_tool_call_output")
    return emit("tool.end", { ...toolData(p), confirmed: meta.live === true });
  // Message records may include injected instructions. Only the dedicated user_message
  // event or UserPromptSubmit hook is accepted as a task; reasoning is never imported.
  return [];
}

export function normalizeClaudeRecord(
  input: unknown,
  meta: EventMeta,
): AgentEvent[] {
  const raw = obj(input),
    sessionId = str(raw.sessionId ?? meta.sessionId),
    msg = obj(raw.message);
  if (!["user", "assistant"].includes(String(raw.type))) return [];
  const m = {
    ...meta,
    occurredAt: stamp(raw.timestamp, meta.occurredAt ?? meta.observedAt),
  };
  const content = msg.content;
  const result: AgentEvent[] = [];
  if (raw.type === "user" && typeof content === "string" && !raw.isMeta) {
    return event(
      "claude",
      sessionId,
      "turn.start",
      "log",
      m,
      { task: content, cwd: str(raw.cwd), confirmed: meta.live === true },
      { turnId: str(raw.promptId) },
    );
  }
  if (!Array.isArray(content)) return [];
  for (let i = 0; i < content.length; i++) {
    const part = obj(content[i]),
      ids = {
        callId: str(part.id ?? part.tool_use_id),
        turnId: str(raw.promptId),
      };
    if (part.type === "tool_use")
      result.push(
        ...event(
          "claude",
          sessionId,
          "tool.start",
          "log",
          { ...m, id: `${m.id}:${i}` },
          {
            ...toolData({ name: part.name, tool_input: part.input }),
            cwd: str(raw.cwd),
            confirmed: meta.live === true,
            subagentId: str(raw.agentId),
          },
          ids,
        ),
      );
    if (part.type === "tool_result")
      result.push(
        ...event(
          "claude",
          sessionId,
          "tool.end",
          "log",
          { ...m, id: `${m.id}:${i}` },
          {
            result: boundedText(part.content).text,
            error: part.is_error ? boundedText(part.content).text : undefined,
            confirmed: meta.live === true,
            subagentId: str(raw.agentId),
          },
          ids,
        ),
      );
    if (
      raw.type === "user" &&
      part.type === "text" &&
      !raw.isMeta &&
      !raw.isSidechain
    ) {
      result.push(
        ...event(
          "claude",
          sessionId,
          "turn.start",
          "log",
          { ...m, id: `${m.id}:${i}` },
          {
            task: str(part.text),
            cwd: str(raw.cwd),
            confirmed: meta.live === true,
          },
          { turnId: str(raw.promptId) },
        ),
      );
    }
  }
  return result;
}

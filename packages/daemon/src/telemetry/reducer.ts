import {
  officeVisible,
  type AgentEvent,
  type Session,
} from "@agentwatch/shared";

export const visibleInOffice = officeVisible;
const projectName = (cwd?: string) =>
  cwd?.split("/").filter(Boolean).at(-1) ?? "Невідомий проєкт";

export function reduceSession(
  previous: Session | undefined,
  event: AgentEvent,
): Session {
  const d = event.data,
    at = event.occurredAt;
  const s: Session = previous
    ? structuredClone(previous)
    : {
        key: event.sessionKey,
        sessionId: event.sessionId,
        provider: event.provider,
        project: projectName(d.cwd),
        origin: d.origin ?? "unknown",
        lifecycle: "unknown",
        activity: "unknown",
        freshness: "fresh",
        requiresAttention: false,
        lastActivityAt: at,
        lastObservedAt: event.observedAt,
        stateAt: 0,
        activeTools: [],
        subagents: [],
        sources: [],
      };
  if (d.model) s.model = d.model;
  if (d.parentSessionId && d.parentSessionId !== event.sessionId)
    s.parentSessionKey = `${event.provider}:${d.parentSessionId}`;
  // Usage supplies metadata, never liveness or activity evidence.
  if (event.kind === "usage") return s;
  s.lastObservedAt = Math.max(s.lastObservedAt, event.observedAt);
  if (!s.sources.includes(event.source)) s.sources.push(event.source);
  const subagentEvent =
    event.kind === "subagent.start" || event.kind === "subagent.end";
  if (subagentEvent || (d.subagentId && d.subagentId !== event.sessionId)) {
    const id = subagentEvent ? d.agentId : d.subagentId;
    if (id) {
      let child = s.subagents.find((a) => a.id === id);
      if (!child) {
        child = { id, activity: "unknown", lifecycle: "unknown", updatedAt: 0 };
        s.subagents.push(child);
      }
      if (d.agentType) child.type ??= d.agentType;
      if (d.childSessionId)
        child.sessionKey = `${event.provider}:${d.childSessionId}`;
      if (at >= (child.updatedAt ?? 0)) {
        child.updatedAt = at;
        if (d.task) child.task = d.task;
        if (event.kind === "subagent.end") child.lifecycle = "ended";
        else if (
          (event.source === "hook" || d.confirmed) &&
          event.kind !== "turn.end"
        )
          child.lifecycle = "open";
        if (event.kind === "subagent.end" || event.kind === "turn.end")
          child.activity = "idle";
        else if (event.kind === "attention") child.activity = "waiting";
        else if (
          ["subagent.start", "turn.start", "tool.start", "tool.end"].includes(
            event.kind,
          )
        )
          child.activity = "working";
      }
      if (s.lifecycle !== "ended" && (event.source === "hook" || d.confirmed))
        s.lifecycle = "open";
      s.lastActivityAt = Math.max(s.lastActivityAt, at);
    }
    return s;
  }
  // Metadata may enrich recovered sessions, but must not overwrite a newer cwd.
  if (d.gitBranch && (!s.gitBranch || at >= s.stateAt))
    s.gitBranch = d.gitBranch;
  if (d.origin && d.origin !== "unknown") s.origin = d.origin;
  if (d.cwd && (!s.cwd || at >= s.stateAt)) {
    s.cwd = d.cwd;
    s.project = projectName(d.cwd);
  }
  if (event.kind === "session.metadata") return s;
  const sameTurn =
    !event.turnId || !s.activeTurnId || event.turnId === s.activeTurnId;
  const rememberCompletion = () => {
    if (event.callId && sameTurn)
      s.completedToolIds = [
        ...new Set([...(s.completedToolIds ?? []), event.callId]),
      ].slice(-2048);
  };
  if (at < s.stateAt) {
    // Independent calls can finish out of order while a newer call or approval
    // remains active. Reconcile that call without changing the newer activity.
    if (
      event.kind === "tool.end" &&
      event.callId &&
      (!event.turnId || !s.activeTurnId || event.turnId === s.activeTurnId)
    ) {
      rememberCompletion();
      const active = s.activeTools.find((t) => t.id === event.callId);
      if (active && at >= active.startedAt) {
        s.activeTools = s.activeTools.filter((t) => t.id !== event.callId);
        if (!s.lastTool?.endedAt || at >= s.lastTool.endedAt)
          s.lastTool = {
            ...active,
            endedAt: at,
            result: d.result,
            error: d.error,
            truncated: d.truncated,
          };
      }
    }
    if (event.kind === "tool.start" && event.callId) {
      const active = s.activeTools.find((t) => t.id === event.callId);
      if (active) {
        active.command ??= d.command;
        active.path ??= d.path;
      } else if (
        sameTurn &&
        s.lifecycle === "open" &&
        ["working", "waiting"].includes(s.activity) &&
        at >= (s.turnStartedAt ?? s.startedAt ?? 0) &&
        !(s.completedToolIds ?? []).includes(event.callId)
      ) {
        s.activeTools.push({
          id: event.callId,
          name: d.toolName ?? "Інструмент",
          startedAt: at,
          command: d.command,
          path: d.path,
        });
      }
    }
    return s;
  }
  if (
    event.kind === "turn.end" &&
    event.turnId &&
    s.activeTurnId &&
    event.turnId !== s.activeTurnId
  )
    return s;
  if (
    s.lifecycle === "ended" &&
    event.kind !== "session.start" &&
    event.kind !== "turn.start"
  )
    return s;
  s.stateAt = at;
  s.lastActivityAt = Math.max(s.lastActivityAt, at);
  s.freshness = "fresh";
  if (
    (event.source === "hook" || d.confirmed) &&
    !["session.end", "process.exit"].includes(event.kind)
  )
    s.lifecycle = "open";
  const clearWait = () => {
    s.requiresAttention = false;
    delete s.waitingReason;
  };
  switch (event.kind) {
    case "session.start":
      if (d.reason === "compact" && previous?.lifecycle === "open") break;
      s.lifecycle = d.confirmed ? "open" : "unknown";
      s.activity = "idle";
      s.startedAt ??= at;
      delete s.endedAt;
      clearWait();
      break;
    case "session.end":
      if (d.confirmed) {
        s.lifecycle = "ended";
        s.endedAt = at;
        s.activeTools = [];
        s.activity = "idle";
        clearWait();
      }
      break;
    case "turn.start": {
      const newTurn = event.turnId
        ? event.turnId !== s.activeTurnId
        : at > (s.turnStartedAt ?? 0);
      if (newTurn) {
        s.activeTools = [];
        s.completedToolIds = [];
        s.turnStartedAt = at;
      }
      if (event.turnId) s.activeTurnId = event.turnId;
      if (
        d.task &&
        (!s.task ||
          at > s.task.updatedAt ||
          (at === s.task.updatedAt && event.source === "hook"))
      )
        s.task = { text: d.task, source: event.source, updatedAt: at };
      s.activity = "working";
      delete s.endedAt;
      clearWait();
      break;
    }
    case "turn.end":
      s.activity = "idle";
      s.activeTools = [];
      clearWait();
      break;
    case "tool.start": {
      const id = event.callId ?? event.id;
      if ((s.completedToolIds ?? []).includes(id)) break;
      const active = s.activeTools.find((t) => t.id === id);
      if (!active)
        s.activeTools.push({
          id,
          name: d.toolName ?? "Інструмент",
          startedAt: at,
          command: d.command,
          path: d.path,
          truncated: d.truncated,
        });
      else {
        active.name = d.toolName ?? active.name;
        active.command = d.command ?? active.command;
        active.path = d.path ?? active.path;
      }
      s.activity = "working";
      clearWait();
      break;
    }
    case "tool.end": {
      rememberCompletion();
      const active = s.activeTools.find((t) => t.id === event.callId);
      s.lastTool = {
        ...active,
        id: event.callId ?? event.id,
        name: d.toolName ?? active?.name ?? "Інструмент",
        startedAt: active?.startedAt ?? at,
        endedAt: at,
        command: d.command ?? active?.command,
        path: d.path ?? active?.path,
        result: d.result,
        error: d.error,
        truncated: d.truncated,
      };
      s.activeTools = s.activeTools.filter((t) => t.id !== event.callId);
      s.activity = "working";
      clearWait();
      break;
    }
    case "permission.request":
      s.waitingReason = "approval_pending";
      break;
    case "attention":
      s.activity = "waiting";
      s.waitingReason = d.reason;
      s.requiresAttention = d.confirmed === true;
      break;
    case "subagent.start":
      if (d.agentId && !s.subagents.some((a) => a.id === d.agentId))
        s.subagents.push({
          id: d.agentId,
          type: d.agentType,
          task: d.task,
          activity: "working",
          sessionKey: d.childSessionId
            ? `${event.provider}:${d.childSessionId}`
            : undefined,
        });
      break;
    case "subagent.end": {
      const a = s.subagents.find((a) => a.id === d.agentId);
      if (a) a.activity = "idle";
      break;
    }
    case "process.observed":
      if (d.pid && d.processStartedAt !== undefined)
        s.process = {
          pid: d.pid,
          startedAt: d.processStartedAt,
          cpuPercent: d.cpuPercent,
          memoryBytes: d.memoryBytes,
        };
      break;
    case "process.exit":
      if (
        s.process &&
        s.process.pid === d.pid &&
        s.process.startedAt === d.processStartedAt
      ) {
        s.lifecycle = "ended";
        s.endedAt = at;
        s.activity = "idle";
        s.activeTools = [];
        clearWait();
      }
      break;
    case "error":
      break;
  }
  return s;
}

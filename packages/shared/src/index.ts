import { z } from "zod";
export {
  parseProcessTable,
  exclusiveBindings,
  type ProcessRow,
} from "./processes.js";

export const ProviderSchema = z.enum(["codex", "claude"]);
export type Provider = z.infer<typeof ProviderSchema>;
export const MAX_TEXT = 65_536;
export const MAX_HOOK_BYTES = 2 * 1024 * 1024;
export const ENDED_VISIBLE_MS = 60_000;
export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_PORT = 4317;

export const EventKindSchema = z.enum([
  "session.start",
  "session.end",
  "session.metadata",
  "turn.start",
  "turn.end",
  "tool.start",
  "tool.end",
  "permission.request",
  "attention",
  "subagent.start",
  "subagent.end",
  "process.observed",
  "process.exit",
  "error",
]);
export type EventKind = z.infer<typeof EventKindSchema>;

export const EventDataSchema = z.object({
  cwd: z.string().optional(),
  gitBranch: z.string().optional(),
  task: z.string().optional(),
  toolName: z.string().optional(),
  command: z.string().optional(),
  path: z.string().optional(),
  result: z.string().optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  confirmed: z.boolean().optional(),
  truncated: z.boolean().optional(),
  origin: z.enum(["desktop", "cli", "unknown"]).optional(),
  parentSessionId: z.string().optional(),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
  childSessionId: z.string().optional(),
  subagentId: z.string().optional(),
  pid: z.number().int().positive().optional(),
  processStartedAt: z.number().optional(),
  cpuPercent: z.number().nonnegative().optional(),
  memoryBytes: z.number().nonnegative().optional(),
});
export type EventData = z.infer<typeof EventDataSchema>;
export const AgentEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(1024),
  sessionKey: z.string().min(1).max(512),
  sessionId: z.string().min(1).max(256),
  provider: ProviderSchema,
  kind: EventKindSchema,
  source: z.enum(["hook", "log", "process"]),
  occurredAt: z.number().finite(),
  observedAt: z.number().finite(),
  turnId: z.string().max(256).optional(),
  callId: z.string().max(256).optional(),
  data: EventDataSchema,
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export const HookEnvelopeSchema = z.object({
  eventId: z.string().min(1).max(256),
  occurredAt: z.number().finite(),
  payload: z.record(z.string(), z.unknown()),
  ancestors: z
    .array(
      z.object({ pid: z.number().int().positive(), startedAt: z.number() }),
    )
    .max(12)
    .optional(),
});
export type HookEnvelope = z.infer<typeof HookEnvelopeSchema>;
export type Activity = "working" | "waiting" | "idle" | "unknown";
export type Lifecycle = "open" | "ended" | "unknown";
export type Freshness = "fresh" | "stale" | "unavailable";
export type ToolCall = {
  id: string;
  name: string;
  startedAt: number;
  command?: string;
  path?: string;
  result?: string;
  error?: string;
  truncated?: boolean;
  endedAt?: number;
};
export type Subagent = {
  updatedAt?: number;
  id: string;
  type?: string;
  task?: string;
  activity: Activity;
  sessionKey?: string;
};
export type ProcessBinding = {
  pid: number;
  startedAt: number;
  cpuPercent?: number;
  memoryBytes?: number;
};
export type Session = {
  revision?: number;
  isSummary?: boolean;
  activeToolCount?: number;
  key: string;
  sessionId: string;
  provider: Provider;
  project: string;
  cwd?: string;
  gitBranch?: string;
  origin: "desktop" | "cli" | "unknown";
  lifecycle: Lifecycle;
  activity: Activity;
  freshness: Freshness;
  requiresAttention: boolean;
  waitingReason?: string;
  startedAt?: number;
  endedAt?: number;
  lastActivityAt: number;
  lastObservedAt: number;
  stateAt: number;
  activeTurnId?: string;
  turnStartedAt?: number;
  task?: { text: string; source: AgentEvent["source"]; updatedAt: number };
  activeTools: ToolCall[];
  completedToolIds?: string[];
  lastTool?: ToolCall;
  subagents: Subagent[];
  process?: ProcessBinding;
  sources: AgentEvent["source"][];
};
export type CollectorHealth = {
  id: string;
  provider?: Provider;
  state: "ready" | "unavailable" | "error";
  message: string;
  lastCheckedAt: number;
  lastEventAt?: number;
  droppedEvents: number;
};
export type StateSnapshot = {
  omittedSessions?: number;
  revision: number;
  sessions: Session[];
  collectors: CollectorHealth[];
  serverTime: number;
};
export type StateDelta = {
  omittedSessions?: number;
  revision: number;
  session?: Session;
  event?: AgentEvent;
  collectors?: CollectorHealth[];
  removedKeys?: string[];
};
export type StreamMessage =
  | { type: "snapshot"; data: StateSnapshot }
  | { type: "delta"; data: StateDelta };
export type EventPage = { events: AgentEvent[]; nextCursor: string | null };
export type RuntimeConfig = {
  version: 1;
  port: number;
  uiToken: string;
  hookToken: string;
  codexHome: string;
  claudeHome: string;
};

export function redact(input: string): string {
  return input
    .replace(
      /(authorization\s*[:=]\s*["']?(?:bearer|basic)\s+)[^\s"'\\]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED]",
    )
    .replace(
      /(\b[A-Z0-9_-]{0,64}(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)["']?\s*[:=]\s*)["']?[^\s,"'\\]+["']?/gi,
      "$1[REDACTED]",
    )
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[REDACTED]@");
}

export function boundedText(value: unknown): {
  text: string | undefined;
  truncated: boolean;
} {
  if (value === undefined || value === null)
    return { text: undefined, truncated: false };
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const text = redact(raw ?? "");
  return { text: text.slice(0, MAX_TEXT), truncated: text.length > MAX_TEXT };
}

export function sessionStatus(session: Session): Activity | "ended" {
  return session.lifecycle === "ended"
    ? "ended"
    : session.lifecycle === "unknown" || session.freshness === "stale"
      ? "unknown"
      : session.activity;
}

export function officeVisible(session: Session, now = Date.now()): boolean {
  return (
    session.lifecycle !== "ended" ||
    now - (session.endedAt ?? 0) < ENDED_VISIBLE_MS
  );
}

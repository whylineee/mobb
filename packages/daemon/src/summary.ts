import type { Session, ToolCall } from "@agentwatch/shared";

export const MAX_OVERVIEW_SESSIONS = 200;
const clip = (text: string | undefined, size: number) =>
  text && text.length > size ? text.slice(0, size - 1) + "…" : text;
const toolPreview = (tool: ToolCall): ToolCall => ({
  ...tool,
  name: clip(tool.name, 128)!,
  command: clip(tool.command, 160),
  path: clip(tool.path, 160),
  result: clip(tool.result, 240),
  error: clip(tool.error, 240),
});

// The overview must fit independently of the volume of private tool results.
// Full, unshortened fields remain available from GET /api/sessions/:id.
export function summarizeSession(session: Session): Session {
  const { completedToolIds: _privateCallState, ...publicState } = session;
  const summary: Session = {
    ...publicState,
    isSummary: true,
    activeToolCount: session.activeTools.length,
    cwd: clip(session.cwd, 500),
    gitBranch: clip(session.gitBranch, 120),
    project: clip(session.project, 120)!,
    waitingReason: clip(session.waitingReason, 120),
    task: session.task
      ? { ...session.task, text: clip(session.task.text, 240)! }
      : undefined,
    activeTools: session.activeTools.slice(0, 8).map(toolPreview),
    lastTool: session.lastTool ? toolPreview(session.lastTool) : undefined,
    subagents: session.subagents
      .slice(0, 4)
      .map((a) => ({ ...a, type: clip(a.type, 80), task: clip(a.task, 160) })),
  };
  if (Buffer.byteLength(JSON.stringify(summary)) <= 8192) return summary;
  // Even unusually long IDs or Unicode strings cannot inflate an initial frame.
  return {
    revision: session.revision,
    key: session.key,
    sessionId: session.sessionId,
    provider: session.provider,
    project: clip(session.project, 80)!,
    origin: session.origin,
    lifecycle: session.lifecycle,
    activity: session.activity,
    freshness: session.freshness,
    requiresAttention: session.requiresAttention,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastActivityAt: session.lastActivityAt,
    lastObservedAt: session.lastObservedAt,
    stateAt: session.stateAt,
    activeTurnId: session.activeTurnId,
    turnStartedAt: session.turnStartedAt,
    task: session.task
      ? { ...session.task, text: clip(session.task.text, 80)! }
      : undefined,
    activeTools: [],
    subagents: [],
    process: session.process,
    sources: session.sources,
    isSummary: true,
    activeToolCount: session.activeTools.length,
  };
}

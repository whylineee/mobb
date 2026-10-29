import type { Session } from "@agentwatch/shared";

// Keep this visual projection aligned with Desk, its tooltip, and AgentMascot.
// Process samples and unrelated timestamps belong to the DOM panels.
export function sameSceneSessions(previous: Session[], next: Session[]) {
  return (
    previous === next ||
    (previous.length === next.length &&
      previous.every((session, index) => {
        const candidate = next[index]!;
        return (
          session === candidate ||
          (session.key === candidate.key &&
            session.sessionId === candidate.sessionId &&
            session.provider === candidate.provider &&
            session.project === candidate.project &&
            session.cwd === candidate.cwd &&
            session.parentSessionKey === candidate.parentSessionKey &&
            session.subagents.length === candidate.subagents.length &&
            session.subagents.every(
              (agent, i) =>
                agent.sessionKey === candidate.subagents[i]?.sessionKey &&
                agent.lifecycle === candidate.subagents[i]?.lifecycle,
            ) &&
            session.requiresAttention === candidate.requiresAttention &&
            session.turnStartedAt === candidate.turnStartedAt &&
            session.activeTools[0]?.name === candidate.activeTools[0]?.name &&
            session.lifecycle === candidate.lifecycle &&
            session.activity === candidate.activity &&
            session.freshness === candidate.freshness &&
            session.task?.text === candidate.task?.text)
        );
      }))
  );
}

import type { Session } from "@agentwatch/shared";

// Keep this visual projection aligned with Desk, its tooltip, and AgentMascot.
// Tool history, process samples and timestamps belong to the DOM panels.
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
            session.lifecycle === candidate.lifecycle &&
            session.activity === candidate.activity &&
            session.freshness === candidate.freshness &&
            session.task?.text === candidate.task?.text)
        );
      }))
  );
}

import { expect, it } from "vitest";
import type { Session } from "@agentwatch/shared";
import { sessionOverview, turnDuration } from "./overview";

const session = (key: string, changes: Partial<Session> = {}): Session => ({
  key,
  sessionId: key,
  provider: "codex",
  project: "Office",
  origin: "cli",
  lifecycle: "open",
  activity: "working",
  freshness: "fresh",
  requiresAttention: false,
  lastActivityAt: 1000,
  lastObservedAt: 1000,
  stateAt: 1000,
  activeTools: [],
  subagents: [],
  sources: ["hook"],
  ...changes,
});

it("uses the same open-session population for board, counts and providers", () => {
  const sessions = [
    session("work"),
    session("wait", { activity: "waiting", provider: "claude" }),
    session("idle", { activity: "idle" }),
    session("stale", { freshness: "stale" }),
    session("ended", { lifecycle: "ended" }),
    session("historic", { lifecycle: "unknown" }),
  ];
  const overview = sessionOverview(
    Object.fromEntries(sessions.map((s) => [s.key, s])),
  );
  expect(overview.open).toHaveLength(4);
  expect(
    Object.values(overview.groups).map((group) => group.map((s) => s.key)),
  ).toEqual([["work"], ["wait"], ["idle"], ["stale"]]);
  expect(overview.providers).toEqual({ codex: 3, claude: 1 });
});

it("moves a stopped turn to waiting for a prompt without claiming task completion", () => {
  const current = session("work", {
    task: { text: "Fix parser", source: "hook", updatedAt: 1000 },
  });
  const overview = sessionOverview({ work: { ...current, activity: "idle" } });
  expect(overview.groups.idle[0]?.task?.text).toBe("Fix parser");
  expect(overview.groups.working).toHaveLength(0);
});

it("shows duration only for a current turn with trustworthy time", () => {
  expect(turnDuration(session("work", { turnStartedAt: 1000 }), 62000)).toBe(
    "1 хв 1 с",
  );
  expect(turnDuration(session("work"), 62000)).toBe("Недоступно");
  expect(
    turnDuration(
      session("work", { turnStartedAt: 1000, freshness: "stale" }),
      62000,
    ),
  ).toBe("Недоступно");
  expect(
    turnDuration(
      session("work", { turnStartedAt: 1000, activity: "idle" }),
      62000,
    ),
  ).toBe("Недоступно");
});

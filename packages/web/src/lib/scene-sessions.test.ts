import { expect, it } from "vitest";
import type { Session } from "@agentwatch/shared";
import { sameSceneSessions } from "./scene-sessions";

const session: Session = {
  key: "codex:one",
  sessionId: "one",
  provider: "codex",
  project: "test",
  origin: "cli",
  lifecycle: "open",
  activity: "waiting",
  freshness: "fresh",
  requiresAttention: true,
  stateAt: 1,
  lastObservedAt: 1,
  lastActivityAt: 1,
  activeTools: [],
  subagents: [],
  sources: ["hook"],
};
it("does not redraw the room for process samples, timestamps or tool history", () => {
  expect(
    sameSceneSessions(
      [session],
      [
        {
          ...session,
          lastObservedAt: 5,
          lastActivityAt: 5,
          process: { pid: 1, startedAt: 1, cpuPercent: 40 },
          lastTool: { id: "one", name: "Read", startedAt: 1 },
        },
      ],
    ),
  ).toBe(true);
});
it("redraws for status, appearance, tooltip and seat membership changes", () => {
  for (const update of [
    { activity: "working" },
    { provider: "claude" },
    { project: "new" },
    { task: { text: "new prompt", source: "hook", updatedAt: 2 } },
    { freshness: "stale" },
    { requiresAttention: false },
    { parentSessionKey: "codex:parent" },
    { cwd: "/new" },
    { turnStartedAt: 100 },
    { activeTools: [{ id: "1", name: "Read", startedAt: 1 }] },
    { key: "codex:two" },
  ]) {
    expect(
      sameSceneSessions([session], [{ ...session, ...update } as Session]),
    ).toBe(false);
  }
  expect(sameSceneSessions([session], [])).toBe(false);
  expect(
    sameSceneSessions(
      [session, { ...session, key: "two" }],
      [{ ...session, key: "two" }, session],
    ),
  ).toBe(false);
});

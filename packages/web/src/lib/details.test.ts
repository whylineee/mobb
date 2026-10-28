import { expect, it } from "vitest";
import type { Session } from "@agentwatch/shared";
import { mergeDetails } from "./details.js";

const summary: Session = {
  key: "codex:s1",
  sessionId: "s1",
  provider: "codex",
  project: "test",
  origin: "cli",
  lifecycle: "open",
  activity: "working",
  freshness: "fresh",
  requiresAttention: false,
  lastActivityAt: 1000,
  lastObservedAt: 1000,
  stateAt: 1000,
  activeTools: [],
  subagents: [{ id: "child", activity: "idle" }],
  sources: ["hook"],
  isSummary: true,
  revision: 10,
};
it("does not overwrite same-clock live updates with an older full-detail response", () => {
  const old = {
    ...summary,
    isSummary: false,
    revision: 9,
    subagents: [{ id: "child", activity: "working" as const }],
  };
  expect(mergeDetails(summary, old).subagents[0]?.activity).toBe("idle");
});
it("uses full text at a current revision while retaining newer process samples", () => {
  const full = {
    ...summary,
    isSummary: false,
    revision: 11,
    task: {
      text: "full prompt ".repeat(100),
      source: "hook" as const,
      updatedAt: 900,
    },
    process: { pid: 1, startedAt: 1, cpuPercent: 1 },
  };
  const live = {
    ...summary,
    task: { text: "full prompt…", source: "hook" as const, updatedAt: 900 },
    process: { pid: 1, startedAt: 1, cpuPercent: 5 },
  };
  const merged = mergeDetails(live, full);
  expect(merged.task?.text).toHaveLength(1200);
  expect(merged.process?.cpuPercent).toBe(5);
});

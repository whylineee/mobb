import { describe, expect, it } from "vitest";
import { createTelemetryStore } from "./store.js";
import type { AgentEvent, Session } from "@agentwatch/shared";
const session: Session = {
  key: "codex:s1",
  sessionId: "s1",
  provider: "codex",
  project: "test",
  origin: "cli",
  lifecycle: "open",
  activity: "idle",
  freshness: "fresh",
  requiresAttention: false,
  lastActivityAt: 1,
  lastObservedAt: 1,
  stateAt: 1,
  activeTools: [],
  subagents: [],
  sources: ["hook"],
};
const event: AgentEvent = {
  schemaVersion: 1,
  id: "e1",
  sessionKey: session.key,
  sessionId: "s1",
  provider: "codex",
  kind: "turn.start",
  source: "hook",
  occurredAt: 2,
  observedAt: 2,
  data: { task: "new" },
};
describe("live UI state", () => {
  it("preserves selection across snapshots and merges racing history without duplicates", () => {
    const store = createTelemetryStore();
    store.getState().applySnapshot({
      revision: 1,
      sessions: [session],
      collectors: [],
      serverTime: 1,
    });
    store.getState().select(session.key);
    store.getState().applyDelta({
      revision: 2,
      session: { ...session, activity: "working" },
      event,
    });
    store
      .getState()
      .mergeHistory(session.key, { events: [event], nextCursor: null });
    expect(store.getState().events).toHaveLength(1);
    store.getState().applySnapshot({
      revision: 2,
      sessions: [{ ...session, activity: "working" }],
      collectors: [],
      serverTime: 2,
    });
    expect(store.getState().selectedKey).toBe(session.key);
    expect(store.getState().events).toHaveLength(1);
  });
  it("ignores old deltas and requests resync on a revision gap", () => {
    const store = createTelemetryStore();
    store.getState().applySnapshot({
      revision: 5,
      sessions: [session],
      collectors: [],
      serverTime: 1,
    });
    store.getState().applyDelta({
      revision: 4,
      session: { ...session, activity: "working" },
    });
    expect(store.getState().sessions[session.key]?.activity).toBe("idle");
    store.getState().applyDelta({
      revision: 7,
      session: { ...session, activity: "working" },
    });
    expect(store.getState().needsResync).toBe(true);
  });
  it("keeps a selected ended panel after removal and drops irrelevant live history", () => {
    const store = createTelemetryStore();
    store.getState().applySnapshot({
      revision: 1,
      sessions: [{ ...session, lifecycle: "ended", endedAt: 2 }],
      collectors: [],
      serverTime: 2,
    });
    store.getState().select(session.key);
    store.getState().applyDelta({ revision: 2, removedKeys: [session.key] });
    expect(store.getState().selectedKey).toBe(session.key);
    expect(store.getState().sessions[session.key]?.lifecycle).toBe("ended");
    store.getState().select(null);
    store.getState().applyDelta({ revision: 3, event });
    expect(store.getState().events).toEqual([]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentService } from "./service.js";
import { normalizeCodexRecord, normalizeHook } from "./telemetry/providers.js";
import type { AgentEvent } from "@agentwatch/shared";

const services: AgentService[] = [],
  roots: string[] = [];
let clock = Date.UTC(2026, 9, 28, 10);
const make = (path = ":memory:") => {
  const s = new AgentService({ dbPath: path, now: () => clock });
  services.push(s);
  return s;
};
const hook = (id: string, name = "UserPromptSubmit", extra = {}) =>
  normalizeHook(
    "codex",
    { session_id: id, hook_event_name: name, cwd: "/work/mobb", ...extra },
    { id: `${id}:${name}:${clock}`, occurredAt: clock, observedAt: clock },
  )[0]!;
const usage = (
  value: number,
  live: boolean,
  key = "s",
  output = 10,
): AgentEvent =>
  normalizeCodexRecord(
    {
      type: "event_msg",
      timestamp: new Date(clock).toISOString(),
      payload: {
        type: "token_count",
        info: {
          total_token_usage: {
            input_tokens: value,
            cached_input_tokens: 0,
            output_tokens: output,
            reasoning_output_tokens: 0,
            total_tokens: value + output,
          },
        },
      },
    },
    { id: `${key}:${clock}:${value}`, sessionId: key, observedAt: clock, live },
  )[0]!;
afterEach(() => {
  services.splice(0).forEach((s) => s.close());
  roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true }));
});

describe("persistent analytics", () => {
  it("lists only confirmed open sessions while preserving idle sessions after a turn ends", () => {
    const s = make();
    s.ingest(usage(100, false, "history"));
    s.ingest(hook("working"));
    s.ingest(hook("idle"));
    s.ingest(hook("idle", "Stop"));
    s.ingest(hook("closed"));
    s.ingest(hook("closed", "SessionEnd"));
    expect(s.agents().agents.map((row) => [row.key, row.status])).toEqual([
      ["codex:idle", "idle"],
      ["codex:working", "working"],
    ]);
    expect(s.statistics().counts).toMatchObject({
      total: 2,
      sessions: 2,
      idle: 1,
      working: 1,
      unknown: 0,
    });
  });

  it("does not expose an unconfirmed parent as context for a confirmed child", () => {
    const root = mkdtempSync(join(tmpdir(), "agentwatch-parent-context-"));
    roots.push(root);
    const path = join(root, "state.sqlite"),
      s = make(path);
    s.ingest(hook("parent"));
    s.close();
    clock += 1000;
    const next = make(path);
    next.ingest(hook("parent", "SubagentStart", { agent_id: "new-child" }));
    const page = next.agents();
    expect(page.agents).toHaveLength(1);
    expect(page.agents[0]?.kind).toBe("subagent");
    expect(page.ancestors).toHaveLength(0);
  });
  it("preserves project filtering, per-agent totals, and all project choices", () => {
    const s = make();
    s.ingest(hook("a", "UserPromptSubmit", { cwd: "/work/alpha" }));
    s.ingest(hook("b", "UserPromptSubmit", { cwd: "/work/beta" }));
    s.ingest(usage(100, false, "a"));
    s.ingest(usage(200, false, "b"));
    clock += 1000;
    s.ingest(usage(130, true, "a"));
    s.ingest(usage(240, true, "b"));

    const stats = s.statistics({ project: "alpha" });
    expect(stats.tokens.total).toBe(30);
    expect(stats.breakdowns.project).toMatchObject([
      { name: "alpha", tokens: { total: 30 } },
    ]);
    expect(stats.projects).toEqual(["alpha", "beta"]);
    expect(s.agents({ project: "alpha" }).agents).toMatchObject([
      { key: "codex:a", tokens: { total: 30 } },
    ]);
  });
  it("replaces a corrected positive usage record with a measured zero", () => {
    const s = make();
    s.ingest(usage(100, false));
    clock += 1000;
    s.ingest(usage(150, true));
    expect(s.statistics().tokens.total).toBe(50);
    s.ingest(usage(100, true));
    expect(s.statistics().tokens.total).toBe(0);
  });
  it("counts a newly confirmed child independently of its stale parent", () => {
    const root = mkdtempSync(join(tmpdir(), "agentwatch-child-live-"));
    roots.push(root);
    const path = join(root, "state.sqlite");
    const s = make(path);
    s.ingest(hook("parent"));
    s.close();
    clock += 1000;
    const next = make(path);
    next.ingest(hook("parent", "SubagentStart", { agent_id: "new-child" }));
    expect(next.statistics().counts).toMatchObject({
      total: 1,
      working: 1,
      subagents: 1,
      unknown: 0,
    });
  });
  it("counts the first response of a confirmed new startup without importing resumed totals", () => {
    const s = make();
    s.ingest(hook("s", "SessionStart", { source: "startup" }));
    clock += 1000;
    s.ingest(usage(100, false));
    expect(s.statistics().tokens.total).toBe(110);
  });
  it("replaces corrected counters in their original bucket and ignores older records", () => {
    const s = make();
    s.ingest(usage(100, false));
    clock += 1000;
    s.ingest(usage(130, true, "s", 20));
    s.ingest(usage(140, true, "s", 25));
    expect(s.statistics().tokens.total).toBe(55);
    const old = usage(120, true, "s", 15);
    old.occurredAt -= 500;
    s.ingest(old);
    expect(s.statistics().tokens.total).toBe(55);
  });
  it("deduplicates Claude inputs, excludes historical IDs and exposes missing output", () => {
    const s = make();
    const message = (id: string, input: number, live: boolean) =>
      ({
        schemaVersion: 1,
        id: `line:${id}:${input}`,
        sessionKey: "claude:c",
        sessionId: "c",
        provider: "claude",
        kind: "usage",
        source: "log",
        occurredAt: clock,
        observedAt: clock,
        data: {
          usage: {
            key: id,
            mode: "message",
            live,
            input,
            output: null,
            total: null,
            cacheRead: 0,
            cacheWrite: 0,
            reasoning: null,
          },
        },
      }) as AgentEvent;
    s.ingest(message("old", 100, false));
    s.ingest(message("old", 200, true));
    s.ingest(message("new", 30, true));
    s.ingest(message("new", 35, true));
    expect(s.statistics().tokens).toMatchObject({
      input: 35,
      output: null,
      total: null,
      partial: true,
    });
    expect(s.get("claude:c")?.lifecycle).toBe("unknown");
  });
  it("keeps a linked child's key stable when its separate session appears", () => {
    const s = make();
    s.ingest(hook("parent"));
    s.ingest(
      hook("parent", "SubagentStart", {
        agent_id: "child",
        agent_session_id: "child-session",
      }),
    );
    const key = s.agents().agents.find((r) => r.kind === "subagent")!.key;
    s.ingest(hook("child-session"));
    expect(s.agents().agents.find((r) => r.kind === "subagent")!.key).toBe(key);
  });
  it("does not resurrect retained logical children when only their parent resumes", () => {
    const root = mkdtempSync(join(tmpdir(), "agentwatch-child-restart-"));
    roots.push(root);
    const path = join(root, "state.sqlite"),
      s = make(path);
    s.ingest(hook("parent"));
    s.ingest(hook("parent", "SubagentStart", { agent_id: "child" }));
    expect(s.statistics().counts.total).toBe(2);
    s.close();
    clock += 1000;
    const next = make(path);
    next.ingest(hook("parent"));
    expect(next.statistics().counts).toMatchObject({
      total: 1,
      subagents: 0,
      unknown: 0,
    });
  });
  it("uses historical counters as baseline and never adds cumulative totals twice", () => {
    const s = make();
    s.ingest(usage(1000, false));
    clock += 1000;
    s.ingest(usage(1100, true, "s", 30));
    const duplicate = usage(1100, true, "s", 30);
    s.ingest({ ...duplicate, id: "another-file" });
    expect(s.statistics({ range: "24h" }).tokens).toMatchObject({
      input: 100,
      output: 20,
      total: 120,
    });
    expect(s.get("codex:s")?.lifecycle).toBe("unknown");
    clock += 1000;
    s.ingest(usage(5, true, "s", 1));
    clock += 1000;
    s.ingest(usage(15, true, "s", 3));
    expect(s.statistics({ range: "24h" }).tokens.total).toBe(132);
  });
  it("counts all sessions beyond overview cap and collapses linked child identities", () => {
    const s = make();
    for (let i = 0; i < 205; i++) s.ingest(hook(`s${i}`));
    s.ingest(
      hook("s0", "SubagentStart", { agent_id: "a", agent_session_id: "child" }),
    );
    s.ingest(hook("child"));
    expect(s.statistics({ range: "24h" }).counts).toMatchObject({
      total: 206,
      sessions: 205,
      subagents: 1,
    });
    expect(s.agents({ limit: 100 }).total).toBe(206);
    s.ingest(
      hook("s0", "SubagentStop", { agent_id: "a", agent_session_id: "child" }),
    );
    s.ingest(hook("child", "SessionEnd"));
    expect(s.statistics({ range: "24h" }).counts.total).toBe(205);
  });
  it("retains usage independently of raw events and rebases on restart", () => {
    const root = mkdtempSync(join(tmpdir(), "agentwatch-analytics-"));
    roots.push(root);
    const path = join(root, "state.sqlite");
    const s = make(path);
    s.ingest(usage(100, false));
    clock += 1000;
    s.ingest(usage(150, true, "s", 20));
    s.close();
    clock += 60_000;
    const next = make(path);
    next.ingest(usage(500, false, "s", 100));
    clock += 1000;
    next.ingest(usage(510, true, "s", 102));
    expect(next.statistics({ range: "24h" }).tokens.total).toBe(72);
    clock += 8 * 86_400_000;
    next.cleanup();
    expect(next.statistics({ range: "7d" }).tokens.total).toBeNull();
  });
  it("persists minute samples and shows gaps instead of invented history", () => {
    const s = make();
    s.ingest(hook("s"));
    s.sampleActivity();
    let stats = s.statistics({ range: "1h" });
    expect(stats.buckets.at(-1)?.working).toBe(1);
    expect(stats.buckets.at(-1)?.tokens).toBeNull();
    expect(stats.buckets.at(-1)?.output).toBeNull();
    expect(stats.buckets[0]?.working).toBeNull();
    clock += 120_000;
    s.sampleActivity();
    stats = s.statistics({ range: "1h" });
    expect(stats.buckets.at(-2)?.working).toBeNull();
    expect(stats.buckets.at(-1)?.working).toBe(1);
  });
});

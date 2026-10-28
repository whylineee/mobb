import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { AgentService } from "./service.js";
import { normalizeHook } from "./telemetry/providers.js";
import { SessionStorage } from "./storage.js";
import { reduceSession } from "./telemetry/reducer.js";

const day = 86_400_000;
let now = 20 * day;
const services: AgentService[] = [];
const roots: string[] = [];
const make = (
  dbPath = ":memory:",
  limits = { perSessionEvents: 3, totalEvents: 5, cachedSessions: 2 },
) => {
  const service = new AgentService({ dbPath, now: () => now, limits });
  services.push(service);
  return service;
};
const event = (
  session: string,
  id: string,
  at = now,
  name = "UserPromptSubmit",
) =>
  normalizeHook(
    "codex",
    { session_id: session, hook_event_name: name, prompt: id },
    { id, occurredAt: at, observedAt: now },
  )[0]!;
afterEach(() => {
  for (const s of services.splice(0)) s.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  now = 20 * day;
});

it("expires an open session's old history while keeping its current task and lifecycle", () => {
  const s = make();
  s.ingest(event("open", "old task", now - 8 * day));
  s.cleanup();
  expect(s.events("codex:open").events).toEqual([]);
  expect(s.get("codex:open")).toMatchObject({
    lifecycle: "open",
    task: { text: "old task" },
  });
});

it("keeps the newest per-session events, including when an older event arrives late", () => {
  const s = make();
  for (let i = 1; i <= 5; i++) s.ingest(event("a", String(i), now + i));
  s.ingest(event("a", "late", now));
  expect(s.events("codex:a").events.map((e) => e.data.task)).toEqual([
    "5",
    "4",
    "3",
  ]);
  expect(s.get("codex:a")?.task?.text).toBe("5");
});

it("enforces the global history budget without deleting session state", () => {
  const s = make();
  for (let i = 1; i <= 8; i++) s.ingest(event(String(i), String(i), now + i));
  const all = Array.from(
    { length: 8 },
    (_, i) => s.events(`codex:${i + 1}`).events,
  ).flat();
  expect(all.map((e) => e.data.task)).toEqual(["4", "5", "6", "7", "8"]);
  expect(s.get("codex:1")?.task?.text).toBe("1");
});

it("does not resurrect pruned history when an old transcript is replayed", () => {
  const s = make();
  const first = event("a", "first", now);
  s.ingest(first);
  for (let i = 1; i <= 4; i++) s.ingest(event("a", String(i), now + i));
  expect(
    s.ingest({
      ...first,
      source: "log",
      data: { ...first.data, confirmed: false },
    }),
  ).toBe(false);
  expect(s.events("codex:a").events.map((e) => e.data.task)).toEqual([
    "4",
    "3",
    "2",
  ]);
});

it("retains pagination cursors across pruning and reads sessions beyond the cache and overview", () => {
  const s = make(":memory:", {
    perSessionEvents: 10,
    totalEvents: 1000,
    cachedSessions: 2,
  });
  for (let i = 0; i < 205; i++) s.ingest(event(String(i), String(i), now + i));
  expect(s.snapshot().sessions).toHaveLength(200);
  expect(s.snapshot().omittedSessions).toBe(5);
  expect(s.get("codex:0")?.task?.text).toBe("0");
  s.updateProcess("codex:0", { pid: 7, startedAt: now, cpuPercent: 3 });
  expect(s.get("codex:0")?.process?.cpuPercent).toBe(3);
  s.ingest(event("0", "second", now + 1000));
  const first = s.events("codex:0", undefined, 1);
  s.cleanup();
  expect(s.events("codex:0", first.nextCursor!, 1).events[0]?.data.task).toBe(
    "0",
  );
});

it("revalidates persisted sessions outside the cache and migrates existing history at startup", () => {
  const root = mkdtempSync(join(tmpdir(), "agentwatch-bounds-"));
  roots.push(root);
  const path = join(root, "state.sqlite");
  const s = make(path, {
    perSessionEvents: 100,
    totalEvents: 1000,
    cachedSessions: 2,
  });
  for (let i = 0; i < 5; i++) s.ingest(event(String(i), String(i), now + i));
  for (let i = 0; i < 8; i++) s.ingest(event("0", `task-${i}`, now + 100 + i));
  s.close();
  const restored = make(path);
  expect(restored.get("codex:1")).toMatchObject({
    lifecycle: "unknown",
    freshness: "stale",
  });
  expect(restored.get("codex:0")?.task?.text).toBe("task-7");
  expect(restored.events("codex:0").events).toHaveLength(3);
  const db = new Database(path, { readonly: true });
  expect(
    (
      db.prepare("SELECT count(*) AS count FROM events").get() as {
        count: number;
      }
    ).count,
  ).toBe(5);
  db.close();
});

it("evicts the least recently used cached value while preserving its SQLite record", () => {
  const storage = new SessionStorage(":memory:", { cachedSessions: 2 });
  try {
    for (const id of ["a", "b", "c"])
      storage.save(reduceSession(undefined, event(id, id)));
    const a = storage.get("codex:a"),
      b = storage.get("codex:b");
    expect(storage.get("codex:a")).toBe(a);
    storage.get("codex:c");
    expect(storage.get("codex:a")).toBe(a);
    const reloaded = storage.get("codex:b");
    expect(reloaded).not.toBe(b);
    expect(reloaded?.task?.text).toBe("b");
  } finally {
    storage.close();
  }
});

it("upgrades a version-one database without discarding its current session snapshot", () => {
  const root = mkdtempSync(join(tmpdir(), "agentwatch-legacy-"));
  roots.push(root);
  const path = join(root, "state.sqlite");
  const db = new Database(path);
  db.exec(
    "CREATE TABLE sessions (key TEXT PRIMARY KEY,lifecycle TEXT NOT NULL,last_activity INTEGER NOT NULL,data TEXT NOT NULL)",
  );
  const session = reduceSession(
    undefined,
    event("legacy", "kept task", now - 8 * day),
  );
  db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
    session.key,
    session.lifecycle,
    session.lastActivityAt,
    JSON.stringify(session),
  );
  db.close();
  const service = make(path);
  expect(service.get("codex:legacy")).toMatchObject({
    lifecycle: "unknown",
    freshness: "stale",
    task: { text: "kept task" },
  });
  expect(service.snapshot().sessions[0]?.key).toBe("codex:legacy");
});

it("preserves an old open snapshot across restart until a confirmed end releases retention protection", () => {
  const root = mkdtempSync(join(tmpdir(), "agentwatch-protected-"));
  roots.push(root);
  const path = join(root, "state.sqlite");
  const initial = make(path);
  initial.ingest(event("open", "current task", now - 8 * day));
  initial.close();
  let restored = make(path);
  expect(restored.get("codex:open")).toMatchObject({
    lifecycle: "unknown",
    freshness: "stale",
    task: { text: "current task" },
  });
  expect(restored.events("codex:open").events).toEqual([]);
  restored.close();
  restored = make(path);
  restored.cleanup();
  expect(restored.get("codex:open")?.task?.text).toBe("current task");
  restored.ingest(event("open", "end", now, "SessionEnd"));
  now += 8 * day;
  restored.cleanup();
  expect(restored.get("codex:open")).toBeUndefined();
});

it("batches large cleanup notifications instead of collecting every expired session at once", () => {
  const service = make(":memory:", {
    perSessionEvents: 3,
    totalEvents: 1000,
    cachedSessions: 2,
  });
  for (let i = 0; i < 600; i++)
    service.ingest(event(String(i), String(i), now - 8 * day, "SessionEnd"));
  const batches: string[][] = [];
  service.subscribe((message) => {
    if (message.type === "delta" && message.data.removedKeys)
      batches.push(message.data.removedKeys);
  });
  service.cleanup();
  expect(batches.every((batch) => batch.length <= 256)).toBe(true);
  expect(new Set(batches.flat()).size).toBe(600);
  expect(service.snapshot().sessions).toEqual([]);
  expect(service.snapshot().omittedSessions).toBe(0);
});

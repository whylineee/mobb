import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeHook,
  normalizeClaudeRecord,
  normalizeCodexRecord,
} from "./telemetry/providers.js";
import { reduceSession } from "./telemetry/reducer.js";
import { JsonlTailer } from "./collectors/jsonl.js";
import { AgentService } from "./service.js";
import { loadConfig, writePrivateJson } from "./config.js";
import { createApp } from "./server.js";

const roots: string[] = [];
const services: AgentService[] = [];
const temp = () => {
  const p = mkdtempSync(join(tmpdir(), "agentwatch-review-"));
  roots.push(p);
  return p;
};
afterEach(() => {
  for (const s of services.splice(0)) s.close();
  for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true });
});
const hook = (
  name: string,
  time: number,
  extra: Record<string, unknown> = {},
  sessionId = "s1",
) =>
  normalizeHook(
    "codex",
    { session_id: sessionId, hook_event_name: name, ...extra },
    { id: `${sessionId}:${name}:${time}`, occurredAt: time, observedAt: time },
  )[0]!;

describe("review: parallel call ordering", () => {
  it("never attributes a delayed subagent tool to the parent", () => {
    let s = reduceSession(
      undefined,
      hook("UserPromptSubmit", 1000, { turn_id: "t1" }),
    );
    s = reduceSession(
      s,
      hook("SubagentStart", 1050, { agent_id: "child", agent_type: "Explore" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1200, { turn_id: "t1", tool_use_id: "parent-tool" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1150, {
        agent_id: "child",
        tool_use_id: "child-tool",
      }),
    );
    expect(s.activeTools.map((t) => t.id)).toEqual(["parent-tool"]);
    expect(s.stateAt).toBe(1200);
  });
  it("reconciles child lifecycle independently from the parent activity clock", () => {
    let s = reduceSession(
      undefined,
      hook("UserPromptSubmit", 1000, { turn_id: "t1" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1400, { turn_id: "t1", tool_use_id: "parent-tool" }),
    );
    s = reduceSession(s, hook("SubagentStop", 1300, { agent_id: "child" }));
    s = reduceSession(
      s,
      hook("SubagentStart", 1100, { agent_id: "child", agent_type: "Explore" }),
    );
    expect(s.subagents).toContainEqual(
      expect.objectContaining({ id: "child", activity: "idle" }),
    );
    expect(s.activity).toBe("working");
    expect(s.stateAt).toBe(1400);
  });
  it("adds a delayed parallel start without changing a newer waiting state", () => {
    let s = reduceSession(
      undefined,
      hook("UserPromptSubmit", 1000, { turn_id: "t1" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1200, {
        turn_id: "t1",
        tool_use_id: "b",
        tool_name: "Bash",
      }),
    );
    s = reduceSession(s, {
      ...hook("PreToolUse", 1300),
      kind: "attention",
      data: { confirmed: true },
    });
    s = reduceSession(
      s,
      hook("PreToolUse", 1100, {
        turn_id: "t1",
        tool_use_id: "a",
        tool_name: "Read",
      }),
    );
    expect(s.activeTools.map((t) => t.id).sort()).toEqual(["a", "b"]);
    expect(s.activity).toBe("waiting");
    expect(s.stateAt).toBe(1300);
  });
  it("never resurrects a call whose completion arrived before its start", () => {
    let s = reduceSession(
      undefined,
      hook("UserPromptSubmit", 1000, { turn_id: "t1" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1400, { turn_id: "t1", tool_use_id: "b" }),
    );
    s = reduceSession(
      s,
      hook("PostToolUse", 1300, { turn_id: "t1", tool_use_id: "a" }),
    );
    s = reduceSession(
      s,
      hook("PreToolUse", 1100, { turn_id: "t1", tool_use_id: "a" }),
    );
    expect(s.activeTools.map((t) => t.id)).toEqual(["b"]);
  });
});

it("review: replacement/bootstrap bytes are historical, only subsequent appends are live", async () => {
  const p = join(temp(), "log.jsonl"),
    flags: boolean[] = [];
  const tailer = new JsonlTailer((_raw, info) => {
    flags.push(info.live);
  });
  writeFileSync(p, '{"n":1}\n');
  await tailer.read(p, true);
  appendFileSync(p, '{"n":2}\n');
  await tailer.read(p, true);
  renameSync(p, p + ".old");
  writeFileSync(p, '{"n":3}\n');
  await tailer.read(p, true);
  writeFileSync(p, '{"n":4}\n');
  await tailer.read(p, true);
  expect(flags).toEqual([false, true, false, false]);
});

it("review: large valid session details do not prevent SSE reconnection", async () => {
  const service = new AgentService({ dbPath: ":memory:" });
  services.push(service);
  const text = "x".repeat(65536);
  for (let i = 0; i < 20; i++) {
    const sid = `large-${i}`;
    service.ingest(hook("UserPromptSubmit", 1000, { prompt: text }, sid));
    service.ingest(
      hook(
        "PreToolUse",
        1100,
        {
          tool_name: "Bash",
          tool_use_id: "previous",
          tool_input: { command: text },
        },
        sid,
      ),
    );
    service.ingest(
      hook(
        "PostToolUse",
        1200,
        { tool_use_id: "previous", tool_response: text },
        sid,
      ),
    );
    service.ingest(
      hook(
        "PreToolUse",
        1300,
        {
          tool_name: "Bash",
          tool_use_id: "current",
          tool_input: { command: text },
        },
        sid,
      ),
    );
  }
  const config = loadConfig(temp()),
    app = createApp({ config, service });
  const response = await app.request("http://127.0.0.1:4317/api/stream", {
    headers: { Authorization: `Bearer ${config.uiToken}` },
  });
  const reader = response.body!.getReader();
  const first = await reader.read();
  const frame = new TextDecoder().decode(first.value);
  expect(frame).toContain("event: snapshot");
  expect(frame.length).toBeLessThan(1024 * 1024);
  await reader.cancel();
  const detail = await app.request(
    "http://127.0.0.1:4317/api/sessions/codex%3Alarge-0",
    { headers: { Authorization: `Bearer ${config.uiToken}` } },
  );
  expect((await detail.json()).task.text).toHaveLength(65536);
});

it("review: setup waits for the configuration transaction lock held by another process", async () => {
  const root = temp(),
    home = join(root, "watch"),
    c = loadConfig(home);
  c.codexHome = join(root, "codex");
  c.claudeHome = join(root, "claude");
  writePrivateJson(join(home, "config.json"), c);
  mkdirSync(c.codexHome, { recursive: true });
  const settings = join(c.codexHome, "hooks.json");
  const held = new Database(settings + ".agentwatch-lock.sqlite");
  held.exec("BEGIN IMMEDIATE");
  const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
  const child = spawn(process.execPath, [cli, "setup"], {
    env: { ...process.env, AGENTWATCH_HOME: home },
    stdio: "ignore",
  });
  let exited = false;
  const completion = new Promise<number | null>((r) =>
    child.on("close", (code) => {
      exited = true;
      r(code);
    }),
  );
  try {
    await new Promise((r) => setTimeout(r, 300));
    expect(exited).toBe(false);
    expect(existsSync(settings)).toBe(false);
  } finally {
    held.exec("ROLLBACK");
    held.close();
    await completion;
  }
  expect(existsSync(settings)).toBe(true);
});

it("review: child sidechain strings cannot become parent user prompts", () => {
  expect(
    normalizeClaudeRecord(
      {
        type: "user",
        sessionId: "parent",
        agentId: "child",
        isSidechain: true,
        message: { content: "Child internal task" },
      },
      { id: "sidechain", observedAt: 1000 },
    ),
  ).toEqual([]);
});

it("integration: explicit exec source outranks inherited Desktop originator", () => {
  const [e] = normalizeCodexRecord(
    {
      type: "session_meta",
      payload: { id: "cli", source: "exec", originator: "Codex Desktop" },
    },
    { id: "origin", observedAt: 1000 },
  );
  expect(e?.data.origin).toBe("cli");
});

import { afterEach, describe, expect, it } from "vitest";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlTailer } from "./jsonl.js";
import { installHooks, uninstallHooks } from "../hooks.js";
import { parseProcessTable, exclusiveBindings } from "./processes.js";
import { loadConfig } from "../config.js";
import { FileCollectors } from "./files.js";
import { AgentService } from "../service.js";

const roots: string[] = [];
const temp = () => {
  const p = mkdtempSync(join(tmpdir(), "agentwatch-collect-"));
  roots.push(p);
  return p;
};
afterEach(() => {
  for (const p of roots.splice(0)) rmSync(p, { force: true, recursive: true });
});

describe("bounded JSONL tailer", () => {
  it("buffers partial UTF-8 lines and does not replay unchanged files", async () => {
    const p = join(temp(), "session.jsonl"),
      lines: unknown[] = [];
    const tailer = new JsonlTailer((raw) => {
      lines.push(raw);
    });
    const bytes = Buffer.from('{"text":"привіт"}\n');
    writeFileSync(p, bytes.subarray(0, 12));
    await tailer.read(p, false);
    expect(lines).toEqual([]);
    appendFileSync(p, bytes.subarray(12));
    await tailer.read(p, true);
    expect(lines).toEqual([{ text: "привіт" }]);
    await tailer.read(p, true);
    expect(lines).toHaveLength(1);
  });
  it("continues past malformed/oversized lines and recovers from rotation and truncation", async () => {
    const p = join(temp(), "session.jsonl"),
      lines: unknown[] = [],
      errors: string[] = [];
    const tailer = new JsonlTailer(
      (raw) => {
        lines.push(raw);
      },
      (error) => {
        errors.push(error);
      },
      { maxLineBytes: 100 },
    );
    writeFileSync(p, "bad\n" + "x".repeat(130) + '\n{"n":1}\n');
    await tailer.read(p, false);
    expect(lines).toEqual([{ n: 1 }]);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    renameSync(p, p + ".old");
    writeFileSync(p, '{"n":2}\n');
    await tailer.read(p, true);
    writeFileSync(p, "{}\n");
    await tailer.read(p, true);
    expect(lines).toEqual([{ n: 1 }, { n: 2 }, {}]);
  });
  it("detects an in-place rewrite even when the new file has the same length", async () => {
    const p = join(temp(), "session.jsonl"),
      lines: unknown[] = [];
    const tailer = new JsonlTailer((raw) => {
      lines.push(raw);
    });
    writeFileSync(p, '{"n":1}\n');
    await tailer.read(p, false);
    writeFileSync(p, '{"n":2}\n');
    await tailer.read(p, true);
    expect(lines).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe("hook configuration ownership", () => {
  it("installs idempotently and uninstalls only owned entries while retaining later changes", async () => {
    const root = temp(),
      config = loadConfig(join(root, "watch"));
    const path = join(root, "settings.json");
    const original = {
      theme: "dark",
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "existing-check" }],
          },
        ],
      },
    };
    writeFileSync(path, JSON.stringify(original));
    const options = {
      provider: "claude" as const,
      configPath: path,
      home: join(root, "watch"),
      hookCliPath: "/work/my project/hook.js",
      nodePath: process.execPath,
      config,
    };
    await installHooks(options);
    await installHooks(options);
    let d = JSON.parse(readFileSync(path, "utf8"));
    expect(d.hooks.PreToolUse).toHaveLength(2);
    expect(d.hooks.PreToolUse[0].hooks[0].command).toBe("existing-check");
    expect(d.hooks.PreToolUse[1].hooks[0].args).toContain(
      "/work/my project/hook.js",
    );
    d.theme = "light";
    d.extra = "later edit";
    writeFileSync(path, JSON.stringify(d));
    await uninstallHooks(options);
    d = JSON.parse(readFileSync(path, "utf8"));
    expect(d).toMatchObject({
      theme: "light",
      extra: "later edit",
      hooks: original.hooks,
    });
  });
  it("quotes Codex command paths and refuses malformed existing configuration", async () => {
    const root = temp(),
      config = loadConfig(join(root, "watch"));
    const path = join(root, "hooks.json"),
      options = {
        provider: "codex" as const,
        configPath: path,
        home: join(root, "watch"),
        hookCliPath: "/a b/it's/hook.js",
        nodePath: process.execPath,
        config,
      };
    await installHooks(options);
    const d = JSON.parse(readFileSync(path, "utf8"));
    expect(d.hooks.SessionStart[0].hooks[0].command).toContain("'\\''");
    expect(d.hooks.SessionEnd[0].hooks[0].async).not.toBe(true);
    writeFileSync(path, "{invalid");
    await expect(installHooks(options)).rejects.toThrow();
    expect(readFileSync(path, "utf8")).toBe("{invalid");
  });
});

describe("process evidence", () => {
  it("parses start identity and only assigns exclusive session metrics", () => {
    const table = parseProcessTable(
      " 123 1 Tue Oct 27 12:00:00 2026 2.5 2048 /opt/bin/codex\n 124 1 Tue Oct 27 12:01:00 2026 0.0 1024 /opt/bin/claude\n",
    );
    expect(table.get(123)).toMatchObject({
      pid: 123,
      ppid: 1,
      cpuPercent: 2.5,
      memoryBytes: 2097152,
    });
    const claims = new Map([
      ["codex:a", 123],
      ["codex:b", 123],
      ["claude:c", 124],
    ]);
    expect([...exclusiveBindings(claims, table).keys()]).toEqual(["claude:c"]);
  });
});

it("recovers a real rollout as unknown, then processes new file activity live", async () => {
  const root = temp(),
    home = join(root, "watch"),
    config = loadConfig(home);
  config.codexHome = join(root, "codex");
  config.claudeHome = join(root, "claude");
  const sessions = join(config.codexHome, "sessions");
  mkdirSync(sessions, { recursive: true });
  const path = join(
    sessions,
    "rollout-12345678-1234-1234-1234-123456789abc.jsonl",
  );
  const record = (type: string, payload: unknown) =>
    JSON.stringify({ type, timestamp: new Date().toISOString(), payload }) +
    "\n";
  writeFileSync(
    path,
    record("session_meta", {
      id: "existing",
      cwd: "/work/project",
      originator: "Codex Desktop",
    }),
  );
  const service = new AgentService({ dbPath: ":memory:" }),
    files = new FileCollectors(service, config, home);
  files.start();
  try {
    await expect
      .poll(() => service.get("codex:existing")?.lifecycle)
      .toBe("unknown");
    expect(service.events("codex:existing").events).toHaveLength(1);
    expect(
      service.snapshot().collectors.find((c) => c.id === "codex-logs")
        ?.lastEventAt,
    ).toBeUndefined();
    appendFileSync(
      path,
      record("event_msg", { type: "task_started", turn_id: "live" }),
    );
    await expect
      .poll(() => service.get("codex:existing")?.lifecycle)
      .toBe("open");
    await expect
      .poll(
        () =>
          service.snapshot().collectors.find((c) => c.id === "codex-logs")
            ?.lastEventAt,
        { timeout: 8000 },
      )
      .toBeTypeOf("number");
    appendFileSync(
      path,
      record("event_msg", { type: "task_complete", turn_id: "live" }),
    );
    await expect
      .poll(() => service.get("codex:existing")?.activity)
      .toBe("idle");
  } finally {
    await files.close();
    service.close();
  }
});

it("recovers appended activity when the file watcher misses a change", async () => {
  const root = temp(),
    home = join(root, "watch"),
    config = loadConfig(home);
  const path = join(root, "session.jsonl");
  const record = (type: string, payload: unknown) =>
    JSON.stringify({ type, timestamp: new Date().toISOString(), payload }) +
    "\n";
  writeFileSync(path, record("session_meta", { id: "existing" }));
  const service = new AgentService({ dbPath: ":memory:" });
  const files = new FileCollectors(service, config, home);
  try {
    files.register("codex", path, "existing");
    await expect
      .poll(() => service.events("codex:existing").events.length)
      .toBe(1);
    appendFileSync(path, record("event_msg", { type: "task_started" }));
    await files.reconcile();
    expect(service.get("codex:existing")?.lifecycle).toBe("open");
    expect(service.get("codex:existing")?.activity).toBe("working");
  } finally {
    await files.close();
    service.close();
  }
});

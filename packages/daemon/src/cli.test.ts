import { afterEach, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
let root: string | undefined;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});
it("runs setup and scoped uninstall through the built CLI in an isolated home", () => {
  root = mkdtempSync(join(tmpdir(), "agentwatch-cli-"));
  const env = {
    ...process.env,
    AGENTWATCH_HOME: join(root, "watch"),
    CODEX_HOME: join(root, "codex"),
    CLAUDE_CONFIG_DIR: join(root, "claude"),
  };
  const setup = spawnSync(process.execPath, [cli, "setup"], {
    encoding: "utf8",
    env,
  });
  expect(setup.stderr).toBe("");
  expect(setup.status).toBe(0);
  const d = JSON.parse(
    readFileSync(join(root, "claude/settings.json"), "utf8"),
  );
  expect(existsSync(d.hooks.SessionStart[0].hooks[0].args[0])).toBe(true);
  const remove = spawnSync(process.execPath, [cli, "hooks", "uninstall"], {
    encoding: "utf8",
    env,
  });
  expect(remove.status).toBe(0);
  expect(
    JSON.parse(readFileSync(join(root, "claude/settings.json"), "utf8")).hooks,
  ).toEqual({});
});
it("rejects a non-interactive TUI before creating config or starting a daemon", () => {
  root = mkdtempSync(join(tmpdir(), "agentwatch-nontty-"));
  const watchHome = join(root, "watch");
  const result = spawnSync(process.execPath, [cli, "tui"], {
    encoding: "utf8",
    env: { ...process.env, AGENTWATCH_HOME: watchHome },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("interactive terminal");
  expect(existsSync(watchHome)).toBe(false);
});

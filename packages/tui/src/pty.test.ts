import { expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { loadConfig, writePrivateJson } from "../../daemon/src/config.js";
import { stopDaemon } from "../../daemon/src/lifecycle.js";
it("runs the actual TUI in real PTYs and restores the terminal without stopping agents", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentwatch-pty-"));
  const config = loadConfig(home);
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  config.port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  config.codexHome = join(home, "codex");
  config.claudeHome = join(home, "claude");
  writePrivateJson(join(home, "config.json"), config);
  try {
    const result = await promisify(execFile)(
      "python3",
      [
        fileURLToPath(new URL("../../../tests/tui-pty.py", import.meta.url)),
        process.execPath,
        fileURLToPath(new URL("../../daemon/dist/cli.js", import.meta.url)),
        home,
      ],
      { timeout: 50_000, maxBuffer: 1024 * 1024 },
    );
    expect(result.stdout).toContain("PTY PASS");
  } finally {
    await stopDaemon(config).catch(() => {});
    const end = Date.now() + 3000;
    while (existsSync(join(home, "daemon.lock")) && Date.now() < end)
      await new Promise((r) => setTimeout(r, 30));
    rmSync(home, { recursive: true, force: true });
  }
}, 60_000);

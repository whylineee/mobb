import { afterEach, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { loadConfig, writePrivateJson } from "./config.js";
import { ensureDaemon, daemonAvailable, stopDaemon } from "./lifecycle.js";
const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const roots: string[] = [];
afterEach(() =>
  roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })),
);
it("initializes one atomic shared configuration under concurrent first use", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentwatch-config-race-"));
  roots.push(root);
  const code = `import {loadConfig} from ${JSON.stringify(fileURLToPath(new URL("./config.ts", import.meta.url)))}; console.log(loadConfig(process.argv[1]).uiToken);`;
  const results = await Promise.all(
    Array.from(
      { length: 6 },
      () =>
        new Promise<string>((resolve, reject) => {
          const child = spawn(
            process.execPath,
            ["--import", "tsx", "--input-type=module", "-e", code, root],
            { stdio: ["ignore", "pipe", "pipe"] },
          );
          let output = "",
            error = "";
          child.stdout.on("data", (d) => (output += String(d)));
          child.stderr.on("data", (d) => (error += String(d)));
          child.on("error", reject);
          child.on("close", (code) =>
            code === 0 ? resolve(output.trim()) : reject(new Error(error)),
          );
        }),
    ),
  );
  expect(new Set(results).size).toBe(1);
  expect(
    JSON.parse(readFileSync(join(root, "config.json"), "utf8")).uiToken,
  ).toBe(results[0]);
});
it("concurrent clients start one background daemon and can stop it through authenticated HTTP", async () => {
  const root = mkdtempSync(join(tmpdir(), "agentwatch-background-"));
  roots.push(root);
  const config = loadConfig(root);
  config.codexHome = join(root, "codex");
  config.claudeHome = join(root, "claude");
  const portServer = createServer();
  await new Promise<void>((r) => portServer.listen(0, "127.0.0.1", r));
  config.port = (portServer.address() as { port: number }).port;
  await new Promise<void>((r) => portServer.close(() => r()));
  writePrivateJson(join(root, "config.json"), config);
  // ensureDaemon passes its selected home, independently of this test runner's environment.
  try {
    await Promise.all([
      ensureDaemon(config, root, cli),
      ensureDaemon(config, root, cli),
    ]);
    expect(await daemonAvailable(config)).toBe(true);
    const pid = Number(readFileSync(join(root, "daemon.lock"), "utf8"));
    expect(pid).toBeGreaterThan(0);
    expect(readFileSync(join(root, "daemon.log"), "utf8")).not.toContain(
      config.uiToken,
    );
  } finally {
    await stopDaemon(config);
    const end = Date.now() + 3000;
    while (existsSync(join(root, "daemon.lock")) && Date.now() < end)
      await new Promise((r) => setTimeout(r, 30));
  }
  expect(existsSync(join(root, "daemon.lock"))).toBe(false);
});

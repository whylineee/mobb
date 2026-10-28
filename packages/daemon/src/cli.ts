import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { serve } from "@hono/node-server";
import { agentwatchHome, loadConfig } from "./config.js";
import { AgentService } from "./service.js";
import { createApp } from "./server.js";
import { installHooks, uninstallHooks } from "./hooks.js";
import { FileCollectors } from "./collectors/files.js";
import { ProcessCollector } from "./collectors/processes.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const home = agentwatchHome(),
  config = loadConfig(home);
const command = process.argv[2] ?? "help";
const hookCliPath = resolve(root, "hook-cli/dist/cli.js");
const hookOptions = (provider: "codex" | "claude") => ({
  provider,
  home,
  config,
  hookCliPath,
  nodePath: process.execPath,
  configPath:
    provider === "codex"
      ? join(config.codexHome, "hooks.json")
      : join(config.claudeHome, "settings.json"),
});

try {
  if (command === "setup") {
    if (!existsSync(hookCliPath))
      throw new Error("Build the project first: pnpm build");
    for (const provider of ["codex", "claude"] as const) {
      await installHooks(hookOptions(provider));
      console.log(
        `${provider}: AgentWatch hooks installed; existing hooks preserved.`,
      );
    }
    console.log("Ready. Run: pnpm agentwatch start");
  } else if (command === "hooks" && process.argv[3] === "uninstall") {
    for (const provider of ["codex", "claude"] as const)
      await uninstallHooks(hookOptions(provider));
    console.log(
      "AgentWatch hooks removed. Other hooks and local history preserved.",
    );
  } else if (command === "doctor") {
    console.log(
      `AgentWatch home: ${home}\nNode: ${process.version}\nListener: 127.0.0.1:${config.port}`,
    );
    for (const provider of ["codex", "claude"] as const) {
      let version = "not found";
      try {
        version = execFileSync(provider, ["--version"], {
          encoding: "utf8",
          timeout: 5000,
        }).trim();
      } catch {
        /* unavailable */
      }
      const o = hookOptions(provider);
      console.log(
        `${provider}: ${version}; hooks manifest: ${existsSync(join(home, `hooks-${provider}.json`)) ? "installed" : "not installed"}; config: ${existsSync(o.configPath) ? "available" : "missing"}`,
      );
    }
    console.log(
      "Existing sessions without a live signal remain unknown. Restart/resume an agent if its version does not reload hooks.",
    );
  } else if (command === "start") {
    const lock = join(home, "daemon.lock");
    if (existsSync(lock)) {
      const pid = Number(readFileSync(lock, "utf8"));
      let alive = false;
      if (Number.isSafeInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          /* stale */
        }
      }
      if (alive)
        throw new Error(
          "Another AgentWatch process is running. Use its dashboard or stop it in its terminal.",
        );
      unlinkSync(lock);
    }
    writeFileSync(lock, String(process.pid), { flag: "wx", mode: 0o600 });
    const service = new AgentService({ dbPath: join(home, "state.sqlite") });
    const files = new FileCollectors(service, config, home),
      processes = new ProcessCollector(service);
    const app = createApp({
      config,
      service,
      webRoot: resolve(root, "web/out"),
      onHook(provider, raw, ancestors) {
        const p = raw as Record<string, unknown>;
        if (
          typeof p.session_id !== "string" ||
          (provider !== "codex" && provider !== "claude")
        )
          return;
        if (typeof p.transcript_path === "string")
          files.register(provider, p.transcript_path, p.session_id);
        if (ancestors?.length)
          processes.claim(provider, p.session_id, ancestors);
      },
    });
    const server = serve(
      { fetch: app.fetch, hostname: "127.0.0.1", port: config.port },
      () => {
        console.log(
          `AgentWatch → http://127.0.0.1:${config.port}/#token=${config.uiToken}`,
        );
        console.log(
          "Local, read-only monitoring. Ctrl+C stops AgentWatch, never your agents.",
        );
        files.start();
        processes.start();
      },
    );
    service.cleanup();
    const cleanup = setInterval(() => service.cleanup(), 3_600_000);
    cleanup.unref();
    let shuttingDown = false;
    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      clearInterval(cleanup);
      processes.close();
      await files.close();
      if ("closeAllConnections" in server) server.closeAllConnections();
      server.close();
      service.close();
      try {
        if (readFileSync(lock, "utf8") === String(process.pid))
          unlinkSync(lock);
      } catch {
        /* already removed */
      }
    };
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());
    server.on("error", (error) => {
      console.error(`Cannot start AgentWatch: ${error.message}`);
      void shutdown();
      process.exitCode = 1;
    });
  } else
    console.log(
      "AgentWatch\n  pnpm agentwatch setup\n  pnpm agentwatch start\n  pnpm agentwatch doctor\n  pnpm agentwatch hooks uninstall",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : "AgentWatch failed");
  process.exitCode = 1;
}

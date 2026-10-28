import { spawn } from "node:child_process";
import { closeSync, openSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { RuntimeConfig } from "@agentwatch/shared";

export async function daemonAvailable(config: RuntimeConfig): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch(`http://127.0.0.1:${config.port}/api/state`, {
      headers: { Authorization: `Bearer ${config.uiToken}` },
      signal: AbortSignal.timeout(750),
    });
  } catch {
    return false;
  }
  if (response.status === 401)
    throw new Error("Daemon authentication failed. Check AGENTWATCH_HOME.");
  if (!response.ok) throw new Error(`Daemon unavailable (${response.status}).`);
  const state = (await response.json()) as {
    revision?: number;
    sessions?: unknown[];
  };
  if (!Number.isSafeInteger(state.revision) || !Array.isArray(state.sessions))
    throw new Error("Unexpected service on the AgentWatch port.");
  return true;
}

export async function ensureDaemon(
  config: RuntimeConfig,
  home: string,
  cli: string,
): Promise<void> {
  if (await daemonAvailable(config)) return;
  const path = join(home, "daemon.log");
  const log = openSync(path, "a", 0o600);
  chmodSync(path, 0o600);
  try {
    const child = spawn(process.execPath, [cli, "start", "--background"], {
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, AGENTWATCH_HOME: home },
    });
    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", reject);
    });
    child.unref();
  } finally {
    closeSync(log);
  }
  const until = Date.now() + 10_000;
  while (Date.now() < until) {
    if (await daemonAvailable(config)) return;
    await delay(100);
  }
  throw new Error(`Daemon did not start. Inspect ${path}`);
}

export async function stopDaemon(config: RuntimeConfig): Promise<void> {
  if (!(await daemonAvailable(config))) return;
  const response = await fetch(
    `http://127.0.0.1:${config.port}/api/daemon/stop`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${config.uiToken}` },
      signal: AbortSignal.timeout(3000),
    },
  );
  if (!response.ok) throw new Error(`Cannot stop daemon (${response.status}).`);
}

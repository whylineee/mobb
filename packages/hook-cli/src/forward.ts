import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { parseProcessTable, type Provider } from "@agentwatch/shared";

export function recordFailure(
  home: string,
  provider: string,
  reason: string,
): void {
  try {
    const path = join(home, "hook-failures.jsonl");
    if (existsSync(path) && statSync(path).size > 1024 * 1024)
      writeFileSync(path, "", { mode: 0o600 });
    appendFileSync(
      path,
      JSON.stringify({ at: Date.now(), provider, reason }) + "\n",
      { mode: 0o600 },
    );
  } catch {
    /* telemetry must never interfere with the agent */
  }
}

async function ancestors(): Promise<{ pid: number; startedAt: number }[]> {
  return new Promise((resolve) => {
    execFile(
      "/bin/ps",
      ["-axo", "pid=,ppid=,lstart=,%cpu=,rss=,comm="],
      {
        timeout: 150,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, LC_ALL: "C" },
      },
      (error, stdout) => {
        if (error) return resolve([]);
        const table = parseProcessTable(stdout),
          result: { pid: number; startedAt: number }[] = [];
        let pid = process.ppid;
        for (let i = 0; i < 12; i++) {
          const row = table.get(pid);
          if (!row) break;
          result.push({ pid, startedAt: row.startedAt });
          pid = row.ppid;
        }
        resolve(result);
      },
    );
  });
}

export async function forwardHook(options: {
  provider: Provider;
  home: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { home, provider, payload } = options;
  try {
    const { port, hookToken } = JSON.parse(
      readFileSync(join(home, "config.json"), "utf8"),
    ) as { port: number; hookToken: string };
    if (
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      typeof hookToken !== "string"
    )
      throw new Error("configuration");
    const occurredAt = Date.now();
    const parents =
      payload.hook_event_name === "SessionStart"
        ? await ancestors()
        : undefined;
    const body = JSON.stringify({
      eventId: randomUUID(),
      occurredAt,
      payload,
      ancestors: parents,
    });
    await new Promise<void>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: `/api/hooks/${provider}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${hookToken}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          res.resume();
          res.on("end", () =>
            res.statusCode && res.statusCode >= 200 && res.statusCode < 300
              ? resolve()
              : reject(new Error("rejected")),
          );
        },
      );
      const deadline = setTimeout(() => req.destroy(new Error("timeout")), 250);
      req.on("error", reject);
      req.on("close", () => clearTimeout(deadline));
      req.end(body);
    });
  } catch {
    recordFailure(home, provider, "delivery_failed");
  }
}

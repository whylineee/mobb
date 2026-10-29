import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { CodexLimits } from "@agentwatch/shared";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export function parseCodexLimits(value: unknown, now: number): CodexLimits {
  const limits = object(object(value).rateLimits);
  const windows = [object(limits.primary), object(limits.secondary)];
  const window = (minutes: number) => {
    const item = windows.find((w) => w.windowDurationMins === minutes);
    if (
      !item ||
      typeof item.usedPercent !== "number" ||
      !Number.isFinite(item.usedPercent) ||
      item.usedPercent < 0 ||
      item.usedPercent > 100
    )
      return null;
    return {
      remainingPercent: 100 - item.usedPercent,
      resetsAt:
        typeof item.resetsAt === "number" &&
        Number.isFinite(item.resetsAt) &&
        item.resetsAt > 0
          ? item.resetsAt * 1000
          : null,
    };
  };
  const fiveHour = window(300),
    weekly = window(10080);
  return fiveHour || weekly
    ? { state: "ready", updatedAt: now, fiveHour, weekly }
    : { state: "unavailable" };
}

export class CodexLimitsCollector {
  private timer?: ReturnType<typeof setInterval>;
  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  constructor(
    private codexHome: string,
    private update: (value: CodexLimits) => void,
    private command = "codex",
  ) {}
  poll(): void {
    if (this.closed || this.child) return;
    const child = spawn(this.command, ["app-server"], {
      env: { ...process.env, CODEX_HOME: this.codexHome },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    let buffer = "",
      done = false;
    const finish = (value: CodexLimits) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (this.child === child) this.child = undefined;
      child.kill();
      if (!this.closed) this.update(value);
    };
    const timeout = setTimeout(() => finish({ state: "unavailable" }), 10000);
    child.stderr.resume();
    child.on("error", () => finish({ state: "unavailable" }));
    child.on("exit", () => finish({ state: "unavailable" }));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return finish({ state: "unavailable" });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const message = object(JSON.parse(raw));
          if (message.id === 1) {
            if (message.error) return finish({ state: "unavailable" });
            child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
            child.stdin.write(
              JSON.stringify({ id: 2, method: "account/rateLimits/read" }) +
                "\n",
            );
          } else if (message.id === 2) {
            return finish(
              message.error
                ? { state: "unavailable" }
                : parseCodexLimits(message.result, Date.now()),
            );
          }
        } catch {
          /* ignore malformed output */
        }
      }
    });
    child.stdin.on("error", () => finish({ state: "unavailable" }));
    child.stdin.write(
      JSON.stringify({
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "agentwatch", version: "0.1.0" } },
      }) + "\n",
    );
  }
  start(): void {
    this.poll();
    this.timer = setInterval(() => this.poll(), 5 * 60_000);
    this.timer.unref();
  }
  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.child?.kill();
  }
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { basename } from "node:path";
import {
  exclusiveBindings,
  parseProcessTable,
  type ProcessRow,
  type Provider,
  type AgentEvent,
} from "@agentwatch/shared";
import { AgentService } from "../service.js";
export { parseProcessTable, exclusiveBindings };

const run = promisify(execFile);
export async function processTable(): Promise<Map<number, ProcessRow>> {
  const { stdout } = await run(
    "/bin/ps",
    ["-axo", "pid=,ppid=,lstart=,%cpu=,rss=,comm="],
    {
      env: { ...process.env, LC_ALL: "C" },
      timeout: 1500,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return parseProcessTable(stdout);
}

export class ProcessCollector {
  private claims = new Map<string, { pid: number; startedAt: number }>();
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private service: AgentService) {}

  claim(
    provider: Provider,
    sessionId: string,
    ancestors: { pid: number; startedAt: number }[],
  ): void {
    // Desktop and shared daemon hosts cannot establish exclusive per-session CPU.
    void processTable()
      .then((table) => {
        for (const ancestor of ancestors) {
          const p = table.get(ancestor.pid);
          if (!p || p.startedAt !== ancestor.startedAt) continue;
          if (
            basename(p.command) !== (provider === "claude" ? "claude" : "codex")
          )
            continue;
          if (/\.app\/|app-server-daemon/.test(p.command)) return;
          this.claims.set(`${provider}:${sessionId}`, {
            pid: p.pid,
            startedAt: p.startedAt,
          });
          break;
        }
      })
      .catch(() => {});
  }

  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const table = await processTable(),
        now = Date.now();
      const valid = new Map<string, number>();
      for (const [key, claim] of this.claims) {
        const row = table.get(claim.pid),
          s = this.service.get(key);
        if (!s || s.lifecycle === "ended") {
          this.claims.delete(key);
          continue;
        }
        if (!row || row.startedAt !== claim.startedAt) {
          if (
            s.process?.pid === claim.pid &&
            s.process.startedAt === claim.startedAt
          ) {
            const e: AgentEvent = {
              schemaVersion: 1,
              id: `process-exit:${key}:${claim.pid}:${claim.startedAt}`,
              sessionKey: key,
              sessionId: s.sessionId,
              provider: s.provider,
              source: "process",
              kind: "process.exit",
              occurredAt: now,
              observedAt: now,
              data: { pid: claim.pid, processStartedAt: claim.startedAt },
            };
            this.service.ingest(e);
          }
          this.claims.delete(key);
          continue;
        }
        valid.set(key, row.pid);
      }
      const bindings = exclusiveBindings(valid, table);
      for (const key of valid.keys()) {
        const row = bindings.get(key);
        this.service.updateProcess(
          key,
          row
            ? {
                pid: row.pid,
                startedAt: row.startedAt,
                cpuPercent: row.cpuPercent,
                memoryBytes: row.memoryBytes,
              }
            : undefined,
        );
      }
      this.service.health({
        id: "processes",
        state: "ready",
        message: `${table.size} процесів перевірено; метрики лише за точного зіставлення`,
        lastCheckedAt: now,
        droppedEvents: 0,
      });
    } catch {
      this.service.health({
        id: "processes",
        state: "unavailable",
        message: "Не вдалося прочитати процеси; стан сесій не вигадується",
        lastCheckedAt: Date.now(),
        droppedEvents: 0,
      });
    } finally {
      this.busy = false;
    }
  }
  start(): void {
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 1000);
    this.timer.unref();
  }
  close(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

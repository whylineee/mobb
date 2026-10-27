import { existsSync, readFileSync, statSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { watch, type FSWatcher } from "chokidar";
import {
  RETENTION_MS,
  type Provider,
  type RuntimeConfig,
} from "@agentwatch/shared";
import { AgentService } from "../service.js";
import {
  normalizeClaudeRecord,
  normalizeCodexRecord,
} from "../telemetry/providers.js";
import { JsonlTailer, type LineInfo } from "./jsonl.js";

type FileContext = { provider: Provider; sessionId?: string };
export class FileCollectors {
  private watchers: FSWatcher[] = [];
  private context = new Map<string, FileContext>();
  private tailer: JsonlTailer;
  private ready = new Map<Provider, boolean>();
  private dropped = new Map<Provider, number>();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  private roots: Record<Provider, string>;

  constructor(
    private service: AgentService,
    private config: RuntimeConfig,
    private home: string,
  ) {
    this.roots = {
      codex: join(config.codexHome, "sessions"),
      claude: join(config.claudeHome, "projects"),
    };
    this.tailer = new JsonlTailer(
      (raw, info) => this.consume(raw, info),
      () => {
        this.parseErrors++;
      },
    );
  }
  private parseErrors = 0;

  private consume(raw: unknown, info: LineInfo): void {
    if (this.closed) return;
    const context = this.context.get(info.path);
    if (!context) return;
    const d = raw as Record<string, unknown>;
    if (
      d &&
      d.type === "session_meta" &&
      d.payload &&
      typeof d.payload === "object"
    ) {
      const p = d.payload as Record<string, unknown>;
      if (typeof p.id === "string") context.sessionId = p.id;
    }
    if (d && typeof d.sessionId === "string") context.sessionId = d.sessionId;
    const meta = {
      id: info.id,
      observedAt: Date.now(),
      sessionId: context.sessionId,
      live: info.live,
    };
    const events =
      context.provider === "codex"
        ? normalizeCodexRecord(raw, meta)
        : normalizeClaudeRecord(raw, meta);
    for (const event of events) this.service.ingest(event);
  }

  private async readFile(
    provider: Provider,
    path: string,
    live: boolean,
  ): Promise<void> {
    if (this.closed || !path.endsWith(".jsonl")) return;
    try {
      const fileStat = await stat(path);
      if (!live && fileStat.mtimeMs < Date.now() - RETENTION_MS) return;
      if (!this.context.has(path)) {
        const id = path.match(
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i,
        )?.[1];
        this.context.set(path, { provider, sessionId: id });
        // Bootstrap the identity even when a large rollout is tailed near its end.
        if (provider === "codex" && fileStat.size > 2 * 1024 * 1024) {
          const file = await open(path, "r");
          try {
            const b = Buffer.alloc(256 * 1024),
              { bytesRead } = await file.read(b, 0, b.length, 0),
              end = b.indexOf(10);
            if (end >= 0 && end < bytesRead) {
              try {
                this.consume(JSON.parse(b.subarray(0, end).toString("utf8")), {
                  path,
                  id: `metadata:${path}`,
                  live: false,
                  offset: 0,
                });
              } catch {
                /* handled by tailer */
              }
            }
          } finally {
            await file.close();
          }
        }
      }
      const before = this.parseErrors;
      await this.tailer.read(path, live);
      this.dropped.set(
        provider,
        (this.dropped.get(provider) ?? 0) + this.parseErrors - before,
      );
    } catch {
      /* disappearance during rotation is expected */
    }
  }

  register(provider: Provider, path: string, sessionId: string): void {
    if (this.closed || !path.endsWith(".jsonl")) return;
    const full = resolve(path);
    this.context.set(full, { provider, sessionId });
    this.watchers[provider === "codex" ? 0 : 1]?.add(full);
    void this.readFile(provider, full, false);
  }

  start(): void {
    for (const provider of ["codex", "claude"] as const) {
      this.ready.set(provider, false);
      const watcher = watch(this.roots[provider], {
        ignoreInitial: false,
        persistent: true,
        followSymlinks: false,
        ignored: (path, stats) =>
          Boolean(stats?.isFile() && !path.endsWith(".jsonl")),
      });
      watcher.on(
        "add",
        (path) =>
          void this.readFile(provider, path, this.ready.get(provider) === true),
      );
      watcher.on("change", (path) => void this.readFile(provider, path, true));
      watcher.on("unlink", (path) => {
        this.tailer.forget(path);
        this.context.delete(path);
      });
      watcher.on("ready", () => {
        this.ready.set(provider, true);
        this.report();
      });
      watcher.on("error", () => {
        this.dropped.set(provider, (this.dropped.get(provider) ?? 0) + 1);
      });
      this.watchers.push(watcher);
    }
    this.report();
    this.timer = setInterval(() => this.report(), 5000);
    this.timer.unref();
  }

  private report(): void {
    if (this.closed) return;
    for (const provider of ["codex", "claude"] as const) {
      const available = existsSync(this.roots[provider]);
      this.service.health({
        id: `${provider}-logs`,
        provider,
        state: available ? "ready" : "unavailable",
        message: available
          ? "Транскрипти доступні; історичні записи не підтверджують відкритість"
          : "Транскриптів ще немає; hooks можуть передавати події незалежно",
        lastCheckedAt: Date.now(),
        droppedEvents: this.dropped.get(provider) ?? 0,
      });
    }
    const path = join(this.home, "hook-failures.jsonl");
    if (existsSync(path)) {
      try {
        if (statSync(path).size <= 2 * 1024 * 1024) {
          const records = readFileSync(path, "utf8")
            .trim()
            .split("\n")
            .filter(Boolean);
          this.service.health({
            id: "hook-delivery",
            state: records.length ? "error" : "ready",
            message: records.length
              ? `${records.length} недоставлених подій у локальній діагностиці`
              : "Помилок доставки не зафіксовано",
            lastCheckedAt: Date.now(),
            droppedEvents: records.length,
          });
        }
      } catch {
        /* diagnostic file can be rotated concurrently */
      }
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await Promise.all(this.watchers.map((w) => w.close()));
  }
}

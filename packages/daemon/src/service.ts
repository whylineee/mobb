import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  RETENTION_MS,
  type AgentEvent,
  type CollectorHealth,
  type EventPage,
  type Session,
  type StateSnapshot,
  type StreamMessage,
  type ProcessBinding,
} from "@agentwatch/shared";
import { reduceSession } from "./telemetry/reducer.js";
import { MAX_OVERVIEW_SESSIONS, summarizeSession } from "./summary.js";

type Listener = (message: StreamMessage) => void;
type Row = { data: string };

export class AgentService {
  private db: Database.Database;
  private sessions = new Map<string, Session>();
  private listeners = new Set<Listener>();
  private collectors = new Map<string, CollectorHealth>();
  private revision = 0;
  private closed = false;
  private now: () => number;

  constructor(options: { dbPath: string; now?: () => number }) {
    this.now = options.now ?? Date.now;
    if (options.dbPath !== ":memory:")
      mkdirSync(dirname(options.dbPath), { recursive: true, mode: 0o700 });
    this.db = new Database(options.dbPath);
    if (options.dbPath !== ":memory:") chmodSync(options.dbPath, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 3000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, lifecycle TEXT NOT NULL, last_activity INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, session_key TEXT NOT NULL, occurred_at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_session_seq ON events(session_key, seq DESC);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO meta VALUES ('revision', 0);
      INSERT OR IGNORE INTO migrations VALUES (1);
    `);
    this.revision = (
      this.db.prepare("SELECT value FROM meta WHERE key='revision'").get() as {
        value: number;
      }
    ).value;
    for (const row of this.db
      .prepare("SELECT data FROM sessions")
      .all() as Row[]) {
      const s = JSON.parse(row.data) as Session;
      if (s.lifecycle !== "ended") {
        s.lifecycle = "unknown";
        s.activity = "unknown";
        s.freshness = "stale";
        s.activeTools = [];
        s.requiresAttention = false;
        delete s.process;
      }
      this.sessions.set(s.key, s);
      this.saveSession(s);
    }
  }

  private saveSession(s: Session): void {
    this.db
      .prepare(
        "INSERT INTO sessions(key,lifecycle,last_activity,data) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET lifecycle=excluded.lifecycle,last_activity=excluded.last_activity,data=excluded.data",
      )
      .run(s.key, s.lifecycle, s.lastActivityAt, JSON.stringify(s));
  }

  ingest(event: AgentEvent): boolean {
    if (this.closed) return false;
    let next: Session | undefined;
    let published = event;
    const changed = this.db.transaction(() => {
      const result = this.db
        .prepare(
          "INSERT OR IGNORE INTO events(event_id,session_key,occurred_at,data) VALUES (?,?,?,?)",
        )
        .run(
          event.id,
          event.sessionKey,
          event.occurredAt,
          JSON.stringify(event),
        );
      let applied = event;
      if (!result.changes) {
        const existing = JSON.parse(
          (
            this.db
              .prepare("SELECT data FROM events WHERE event_id=?")
              .get(event.id) as Row
          ).data,
        ) as AgentEvent;
        const strong =
            existing.source === "hook" && event.source !== "hook"
              ? existing
              : event,
          weak = strong === event ? existing : event;
        const merged: AgentEvent = {
          ...weak,
          ...strong,
          data: { ...weak.data, ...strong.data },
        };
        published = merged;
        if (
          JSON.stringify(existing.data) === JSON.stringify(merged.data) &&
          existing.source === merged.source
        )
          return false;
        this.db
          .prepare("UPDATE events SET data=? WHERE event_id=?")
          .run(JSON.stringify(merged), event.id);
        // Replayed log enrichment must never inherit the liveness authority of
        // a hook persisted in a previous daemon run.
        applied = {
          ...merged,
          source: event.source,
          observedAt: event.observedAt,
          data: { ...merged.data, confirmed: event.data.confirmed },
        };
      }
      next = reduceSession(this.sessions.get(event.sessionKey), applied);
      this.saveSession(next);
      this.db
        .prepare("UPDATE meta SET value=value+1 WHERE key='revision'")
        .run();
      return true;
    })();
    if (!changed || !next) return false;
    this.sessions.set(next.key, next);
    this.revision++;
    this.publish({
      type: "delta",
      data: { revision: this.revision, session: next, event: published },
    });
    return true;
  }

  get(key: string): Session | undefined {
    const s = this.sessions.get(key);
    return s ? { ...structuredClone(s), revision: this.revision } : undefined;
  }
  updateProcess(key: string, binding: ProcessBinding | undefined): void {
    const previous = this.sessions.get(key);
    if (!previous || this.closed) return;
    if (JSON.stringify(previous.process) === JSON.stringify(binding)) return;
    const session = { ...previous, process: binding };
    this.sessions.set(key, session);
    this.saveSession(session);
    this.revision++;
    this.db
      .prepare("UPDATE meta SET value=? WHERE key='revision'")
      .run(this.revision);
    this.publish({ type: "delta", data: { revision: this.revision, session } });
  }
  snapshot(): StateSnapshot {
    return {
      revision: this.revision,
      sessions: [...this.sessions.values()]
        .sort(
          (a, b) =>
            Number(b.lifecycle === "open") - Number(a.lifecycle === "open") ||
            b.lastObservedAt - a.lastObservedAt,
        )
        .slice(0, MAX_OVERVIEW_SESSIONS)
        .map((s) => summarizeSession({ ...s, revision: this.revision })),
      omittedSessions: Math.max(0, this.sessions.size - MAX_OVERVIEW_SESSIONS),
      collectors: structuredClone([...this.collectors.values()]),
      serverTime: this.now(),
    };
  }

  events(key: string, cursor?: string, limit = 50): EventPage {
    const rows = this.db
      .prepare(
        "SELECT seq,data FROM events WHERE session_key=? AND seq<? ORDER BY seq DESC LIMIT ?",
      )
      .all(
        key,
        cursor ? Number(cursor) : Number.MAX_SAFE_INTEGER,
        Math.min(100, Math.max(1, limit)) + 1,
      ) as (Row & { seq: number })[];
    const more = rows.length > limit,
      page = rows.slice(0, limit);
    return {
      events: page.map((row) => JSON.parse(row.data) as AgentEvent),
      nextCursor: more ? String(page.at(-1)!.seq) : null,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    try {
      listener({ type: "snapshot", data: this.snapshot() });
    } catch {
      this.listeners.delete(listener);
    }
    return () => this.listeners.delete(listener);
  }

  private publish(message: StreamMessage): void {
    if (message.type === "delta")
      message = {
        ...message,
        data: {
          ...message.data,
          session: message.data.session
            ? summarizeSession({
                ...message.data.session,
                revision: message.data.revision,
              })
            : undefined,
          omittedSessions: Math.max(
            0,
            this.sessions.size - MAX_OVERVIEW_SESSIONS,
          ),
        },
      };
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        this.listeners.delete(listener);
      }
    }
  }

  health(health: CollectorHealth): void {
    if (this.closed) return;
    this.collectors.set(health.id, health);
    this.revision++;
    this.db
      .prepare("UPDATE meta SET value=? WHERE key='revision'")
      .run(this.revision);
    this.publish({
      type: "delta",
      data: {
        revision: this.revision,
        collectors: [...this.collectors.values()],
      },
    });
  }

  cleanup(): void {
    const cutoff = this.now() - RETENTION_MS;
    const removed = [...this.sessions.values()]
      .filter((s) => s.lifecycle !== "open" && s.lastActivityAt < cutoff)
      .map((s) => s.key);
    this.db.transaction(() => {
      this.db
        .prepare(
          "DELETE FROM events WHERE occurred_at<? AND session_key NOT IN (SELECT key FROM sessions WHERE lifecycle='open')",
        )
        .run(cutoff);
      for (const key of removed) {
        this.db.prepare("DELETE FROM events WHERE session_key=?").run(key);
        this.db.prepare("DELETE FROM sessions WHERE key=?").run(key);
      }
    })();
    for (const key of removed) this.sessions.delete(key);
    if (removed.length) {
      this.revision++;
      this.db
        .prepare("UPDATE meta SET value=? WHERE key='revision'")
        .run(this.revision);
      this.publish({
        type: "delta",
        data: { revision: this.revision, removedKeys: removed },
      });
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.listeners.clear();
      this.db.close();
    }
  }
}

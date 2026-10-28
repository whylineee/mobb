import Database from "better-sqlite3";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  RETENTION_MS,
  type AgentEvent,
  type Session,
} from "@agentwatch/shared";

export type StorageLimits = {
  cachedSessions: number;
  perSessionEvents: number;
  totalEvents: number;
};
export const DEFAULT_STORAGE_LIMITS: StorageLimits = {
  cachedSessions: 256,
  perSessionEvents: 10_000,
  totalEvents: 100_000,
};
type Row = { data: string };

// SQLite owns session truth. This cache may evict even a currently open session.
export class SessionStorage {
  readonly db: Database.Database;
  readonly limits: StorageLimits;
  private cache = new Map<string, Session>();

  constructor(dbPath: string, limits: Partial<StorageLimits> = {}) {
    this.limits = { ...DEFAULT_STORAGE_LIMITS, ...limits };
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error("Storage limits must be positive safe integers");
    if (dbPath !== ":memory:")
      mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    this.db = new Database(dbPath);
    if (dbPath !== ":memory:") chmodSync(dbPath, 0o600);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 3000");
    this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS sessions (key TEXT PRIMARY KEY, lifecycle TEXT NOT NULL, last_activity INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, session_key TEXT NOT NULL, occurred_at INTEGER NOT NULL, data TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS events_session_seq ON events(session_key, seq DESC);
        CREATE INDEX IF NOT EXISTS events_session_time ON events(session_key, occurred_at, seq);
        CREATE INDEX IF NOT EXISTS events_time ON events(occurred_at, seq);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
        INSERT OR IGNORE INTO meta VALUES ('revision', 0);
        INSERT OR IGNORE INTO migrations VALUES (1);
        CREATE TABLE IF NOT EXISTS history_floors (session_key TEXT PRIMARY KEY, occurred_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS event_counts (session_key TEXT PRIMARY KEY, count INTEGER NOT NULL);
      `);
      const columns = this.db.prepare("PRAGMA table_info(sessions)").all() as {
        name: string;
      }[];
      if (!columns.some((c) => c.name === "last_observed")) {
        this.db.exec(
          "ALTER TABLE sessions ADD COLUMN last_observed INTEGER NOT NULL DEFAULT 0",
        );
        this.db.exec(
          "UPDATE sessions SET last_observed=coalesce(json_extract(data,'$.lastObservedAt'),last_activity)",
        );
      }
      if (!columns.some((c) => c.name === "protected_open")) {
        this.db.exec(
          "ALTER TABLE sessions ADD COLUMN protected_open INTEGER NOT NULL DEFAULT 0",
        );
        this.db.exec("UPDATE sessions SET protected_open=(lifecycle='open')");
      }
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS sessions_overview ON sessions((lifecycle='open') DESC,last_observed DESC,key);
        INSERT OR REPLACE INTO event_counts SELECT session_key,count(*) FROM events GROUP BY session_key;
        INSERT OR REPLACE INTO event_counts SELECT '*',count(*) FROM events;
        CREATE TRIGGER IF NOT EXISTS events_count_insert AFTER INSERT ON events BEGIN
          INSERT INTO event_counts VALUES (NEW.session_key,1) ON CONFLICT(session_key) DO UPDATE SET count=count+1;
          UPDATE event_counts SET count=count+1 WHERE session_key='*';
        END;
        CREATE TRIGGER IF NOT EXISTS events_count_delete AFTER DELETE ON events BEGIN
          UPDATE event_counts SET count=count-1 WHERE session_key=OLD.session_key OR session_key='*';
        END;
      `);
      const reset = this.db
        .prepare(
          `UPDATE sessions SET lifecycle='unknown',data=json_remove(json_set(data,
          '$.detailsRevision',(SELECT value+1 FROM meta WHERE key='revision'),
          '$.lifecycle','unknown','$.activity','unknown','$.freshness','stale',
          '$.activeTools',json('[]'),'$.requiresAttention',json('false')),'$.process')
          WHERE lifecycle!='ended'`,
        )
        .run();
      if (reset.changes)
        this.db
          .prepare("UPDATE meta SET value=value+1 WHERE key='revision'")
          .run();
      // A fresh signal for a parent does not reconfirm children from a previous run.
      this.db.exec(`UPDATE sessions SET data=json_set(data,'$.subagents',json((
        SELECT json_group_array(json(CASE WHEN json_extract(value,'$.lifecycle')='ended' THEN value
          ELSE json_set(value,'$.lifecycle','unknown','$.activity','unknown') END))
        FROM json_each(sessions.data,'$.subagents')
      ))) WHERE json_array_length(data,'$.subagents')>0`);
      this.db.exec("INSERT OR IGNORE INTO migrations VALUES (2), (3)");
    })();
  }

  remember(session: Session): void {
    this.cache.delete(session.key);
    this.cache.set(session.key, session);
    if (this.cache.size > this.limits.cachedSessions)
      this.cache.delete(this.cache.keys().next().value!);
  }
  get(key: string): Session | undefined {
    let session = this.cache.get(key);
    if (!session) {
      const row = this.db
        .prepare("SELECT data FROM sessions WHERE key=?")
        .get(key) as Row | undefined;
      if (!row) return undefined;
      session = JSON.parse(row.data) as Session;
    }
    this.remember(session);
    return session;
  }
  save(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions(key,lifecycle,last_activity,data,last_observed,protected_open) VALUES (?,?,?,?,?,?)
      ON CONFLICT(key) DO UPDATE SET lifecycle=excluded.lifecycle,last_activity=excluded.last_activity,data=excluded.data,last_observed=excluded.last_observed,
        protected_open=CASE WHEN excluded.lifecycle='unknown' THEN sessions.protected_open ELSE excluded.protected_open END`,
      )
      .run(
        session.key,
        session.lifecycle,
        session.lastActivityAt,
        JSON.stringify(session),
        session.lastObservedAt,
        Number(session.lifecycle === "open"),
      );
  }
  count(): number {
    return (
      this.db.prepare("SELECT count(*) AS count FROM sessions").get() as {
        count: number;
      }
    ).count;
  }
  overview(limit: number): Session[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM sessions ORDER BY (lifecycle='open') DESC,last_observed DESC,key LIMIT ?",
        )
        .all(limit) as Row[]
    ).map((row) => JSON.parse(row.data) as Session);
  }
  analyticsSessions(): Session[] {
    return (
      this.db
        .prepare(
          "SELECT json_remove(data,'$.task','$.activeTools','$.lastTool','$.completedToolIds') AS data FROM sessions",
        )
        .all() as Row[]
    ).map((row) => JSON.parse(row.data) as Session);
  }
  isPrunedReplay(event: AgentEvent): boolean {
    if (event.source !== "log" || event.data.confirmed) return false;
    const floor = this.db
      .prepare(
        "SELECT max(occurred_at) AS at FROM history_floors WHERE session_key IN (?, '*')",
      )
      .get(event.sessionKey) as { at: number | null };
    return (
      floor.at !== null &&
      event.occurredAt <= floor.at &&
      !this.db.prepare("SELECT 1 FROM events WHERE event_id=?").get(event.id)
    );
  }
  private floor(key: string, at: number): void {
    this.db
      .prepare(
        "INSERT INTO history_floors VALUES (?,?) ON CONFLICT(session_key) DO UPDATE SET occurred_at=max(occurred_at,excluded.occurred_at)",
      )
      .run(key, at);
  }
  private trim(key: string, limit: number): void {
    const count =
      (
        this.db
          .prepare("SELECT count FROM event_counts WHERE session_key=?")
          .get(key) as { count: number } | undefined
      )?.count ?? 0;
    if (count <= limit) return;
    const where = key === "*" ? "" : "WHERE session_key=?";
    const args = key === "*" ? [count - limit] : [key, count - limit];
    const select = `SELECT seq FROM events ${where} ORDER BY occurred_at,seq LIMIT ?`;
    const boundary = this.db
      .prepare(
        `SELECT max(occurred_at) AS at FROM events WHERE seq IN (${select})`,
      )
      .get(...args) as { at: number };
    this.floor(key, boundary.at);
    this.db.prepare(`DELETE FROM events WHERE seq IN (${select})`).run(...args);
  }
  trimHistory(key: string): void {
    this.trim(key, this.limits.perSessionEvents);
    this.trim("*", this.limits.totalEvents);
  }
  cleanup(now: number, onRemoved?: (keys: string[]) => void): void {
    const cutoff = now - RETENTION_MS;
    this.db.transaction(() => {
      this.floor("*", cutoff - 1);
      this.db.prepare("DELETE FROM events WHERE occurred_at<?").run(cutoff);
      for (;;) {
        const over = this.db
          .prepare(
            "SELECT session_key FROM event_counts WHERE session_key!='*' AND count>? LIMIT 256",
          )
          .all(this.limits.perSessionEvents) as { session_key: string }[];
        if (!over.length) break;
        for (const row of over)
          this.trim(row.session_key, this.limits.perSessionEvents);
      }
      this.trim("*", this.limits.totalEvents);
      this.db
        .prepare(
          "DELETE FROM events WHERE session_key IN (SELECT key FROM sessions WHERE lifecycle!='open' AND protected_open=0 AND last_activity<?)",
        )
        .run(cutoff);
    })();
    for (;;) {
      // The startup path uses the same bounded batches without collecting a
      // complete removal list. Liveness stays unknown until a fresh signal;
      // protection of a previously open snapshot is a separate concern.
      const rows = this.db
        .prepare(
          `DELETE FROM sessions WHERE key IN (
        SELECT key FROM sessions WHERE lifecycle!='open' AND protected_open=0 AND last_activity<? LIMIT 256
      ) RETURNING key`,
        )
        .all(cutoff) as { key: string }[];
      if (!rows.length) break;
      const removed = rows.map((row) => row.key);
      for (const key of removed) this.cache.delete(key);
      onRemoved?.(removed);
    }
    this.db.exec(
      "DELETE FROM event_counts WHERE session_key!='*' AND count=0 AND session_key NOT IN (SELECT key FROM sessions)",
    );
    this.db.exec(
      "DELETE FROM history_floors WHERE session_key!='*' AND session_key NOT IN (SELECT key FROM sessions)",
    );
  }
  close(): void {
    this.cache.clear();
    this.db.close();
  }
}

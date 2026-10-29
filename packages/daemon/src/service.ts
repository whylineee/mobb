import Database from "better-sqlite3";
import {
  type AgentEvent,
  type CollectorHealth,
  type EventPage,
  type Session,
  type StateSnapshot,
  type StreamMessage,
  type ProcessBinding,
  type AnalyticsFilter,
  type AgentQuery,
  type CodexLimits,
} from "@agentwatch/shared";
import { reduceSession } from "./telemetry/reducer.js";
import { MAX_OVERVIEW_SESSIONS, summarizeSession } from "./summary.js";

import { SessionStorage, type StorageLimits } from "./storage.js";
import { Analytics } from "./analytics.js";

type Listener = (message: StreamMessage) => void;
type Row = { data: string };

export class AgentService {
  private db: Database.Database;
  private storage: SessionStorage;
  private listeners = new Set<Listener>();
  private collectors = new Map<string, CollectorHealth>();
  private revision = 0;
  private closed = false;
  private now: () => number;
  private analytics: Analytics;
  private limits: CodexLimits = { state: "loading" };

  constructor(options: {
    dbPath: string;
    now?: () => number;
    limits?: Partial<StorageLimits>;
  }) {
    this.now = options.now ?? Date.now;
    this.storage = new SessionStorage(options.dbPath, options.limits);
    this.db = this.storage.db;
    this.analytics = new Analytics(
      this.db,
      () => this.storage.analyticsSessions(),
      this.now,
    );
    this.revision = (
      this.db.prepare("SELECT value FROM meta WHERE key='revision'").get() as {
        value: number;
      }
    ).value;
    this.storage.cleanup(this.now());
  }

  private saveSession(s: Session): void {
    this.storage.save(s);
  }

  ingest(event: AgentEvent): boolean {
    if (event.kind === "usage") {
      if (this.closed) return false;
      const previous = this.storage.get(event.sessionKey);
      const changed = this.analytics.ingest(event, previous);
      const next = reduceSession(previous, event);
      this.storage.save(next);
      this.storage.remember(next);
      if (changed) {
        this.revision++;
        this.db
          .prepare("UPDATE meta SET value=? WHERE key='revision'")
          .run(this.revision);
        this.publish({
          type: "delta",
          data: { revision: this.revision, session: next },
        });
      }
      return changed;
    }
    if (this.closed || this.storage.isPrunedReplay(event)) return false;
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
      next = reduceSession(this.storage.get(event.sessionKey), applied);
      next.detailsRevision = this.revision + 1;
      this.saveSession(next);
      this.storage.trimHistory(event.sessionKey);
      this.db
        .prepare("UPDATE meta SET value=value+1 WHERE key='revision'")
        .run();
      return true;
    })();
    if (!changed || !next) return false;
    this.analytics.begin(event);
    this.storage.remember(next);
    this.revision++;
    this.publish({
      type: "delta",
      data: { revision: this.revision, session: next, event: published },
    });
    return true;
  }

  get(key: string): Session | undefined {
    const s = this.storage.get(key);
    return s ? { ...structuredClone(s), revision: this.revision } : undefined;
  }
  updateProcess(key: string, binding: ProcessBinding | undefined): void {
    const previous = this.storage.get(key);
    if (!previous || this.closed) return;
    if (JSON.stringify(previous.process) === JSON.stringify(binding)) return;
    const session = { ...previous, process: binding };
    this.storage.remember(session);
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
      sessions: this.storage
        .overview(MAX_OVERVIEW_SESSIONS)
        .map((s) => summarizeSession({ ...s, revision: this.revision })),
      omittedSessions: Math.max(
        0,
        this.storage.count() - MAX_OVERVIEW_SESSIONS,
      ),
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
            this.storage.count() - MAX_OVERVIEW_SESSIONS,
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
    this.analytics.cleanup();
    this.storage.cleanup(this.now(), (removed) => {
      this.revision++;
      this.db
        .prepare("UPDATE meta SET value=? WHERE key='revision'")
        .run(this.revision);
      this.publish({
        type: "delta",
        data: { revision: this.revision, removedKeys: removed },
      });
    });
  }

  agents(query: AgentQuery = {}) {
    return this.analytics.agents(query);
  }
  codexLimits(): CodexLimits {
    return structuredClone(this.limits);
  }
  setCodexLimits(limits: CodexLimits): void {
    if (!this.closed) this.limits = limits;
  }
  statistics(query: AnalyticsFilter = {}) {
    const result = this.analytics.statistics(query);
    if (
      [...this.collectors.values()].some(
        (c) =>
          c.state !== "ready" ||
          (c.droppedEvents !== null && c.droppedEvents > 0),
      )
    ) {
      result.coverage.partial = true;
      result.coverage.reasons.push("Джерела недоступні або мають пропуски");
    }
    return result;
  }
  sampleActivity(): void {
    if (!this.closed) this.analytics.sample();
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.listeners.clear();
      this.storage.close();
    }
  }
}

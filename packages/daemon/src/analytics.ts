import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  RETENTION_MS,
  sessionStatus,
  type AgentEvent,
  type AgentRow,
  type AgentCounts,
  type AgentPage,
  type AgentQuery,
  type AnalyticsFilter,
  type Session,
  type Statistics,
  type TokenTotals,
  type Usage,
} from "@agentwatch/shared";

const MINUTE = 60_000;
const fields = [
  "input",
  "output",
  "cacheRead",
  "cacheWrite",
  "reasoning",
  "total",
] as const;
const empty = (): TokenTotals => ({
  input: null,
  output: null,
  cacheRead: null,
  cacheWrite: null,
  reasoning: null,
  total: null,
  partial: true,
});
function sum(values: TokenTotals[]): TokenTotals {
  if (!values.length) return empty();
  const result = empty();
  for (const field of fields) {
    const known = values
      .map((v) => v[field])
      .filter((v): v is number => v !== null);
    result[field] = known.length ? known.reduce((a, b) => a + b, 0) : null;
  }
  result.partial = values.some((v) => v.partial);
  return result;
}
const totals = (usage: Usage): TokenTotals =>
  ({
    ...Object.fromEntries(fields.map((k) => [k, usage[k]])),
    partial:
      usage.input === null || usage.output === null || usage.total === null,
  }) as TokenTotals;
type Checkpoint = {
  sessionKey: string;
  usage: Usage;
  at: number;
  run: string;
  baseline: boolean;
  before?: Usage;
  ledgerKey?: string;
  recordedAt?: number;
};
type Ledger = {
  key: string;
  entity: string;
  sessionKey: string;
  provider: Session["provider"];
  project: string;
  model?: string;
  at: number;
  tokens: TokenTotals;
};
type Sample = { at: number; data: string };
const logicalKey = (session: string, agent: string) =>
  `subagent:${JSON.stringify([session, agent])}`;
const matches = (
  row: { provider: string; project: string },
  query: AnalyticsFilter,
) =>
  (!query.provider || row.provider === query.provider) &&
  (!query.project || row.project === query.project);

/** Separate, transactional accounting; raw event retention never changes token totals. */
export class Analytics {
  private run = randomUUID();
  private newSessions = new Map<string, number>();
  readonly startedAt: number;
  constructor(
    private db: Database.Database,
    private sessions: () => Session[],
    private now: () => number,
  ) {
    this.startedAt = now();
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_checkpoints (key TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS usage_ledger (key TEXT PRIMARY KEY, at INTEGER NOT NULL, data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS usage_ledger_time ON usage_ledger(at);
      CREATE TABLE IF NOT EXISTS activity_samples (at INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analytics_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
      INSERT OR IGNORE INTO migrations VALUES (4);
    `);
    db.prepare(
      "INSERT OR IGNORE INTO analytics_meta VALUES ('monitoring_since',?)",
    ).run(this.startedAt);
  }

  ingest(event: AgentEvent, session?: Session): boolean {
    const usage = event.data.usage;
    if (!usage) return false;
    const entity =
      event.data.subagentId && event.data.subagentId !== event.sessionId
        ? logicalKey(event.sessionKey, event.data.subagentId)
        : event.sessionKey;
    const key = JSON.stringify([
      entity,
      usage.mode === "cumulative" ? "counter" : usage.key,
    ]);
    const live =
      usage.live ||
      (this.newSessions.has(event.sessionKey) &&
        event.occurredAt >= this.newSessions.get(event.sessionKey)!);
    return this.db.transaction(() => {
      const row = this.db
        .prepare("SELECT data FROM usage_checkpoints WHERE key=?")
        .get(key) as { data: string } | undefined;
      const previous = row ? (JSON.parse(row.data) as Checkpoint) : undefined;
      if (previous && event.occurredAt < previous.at) return false;
      if (!live && previous?.run === this.run && !previous.baseline)
        return false;
      let value = totals(usage);
      let baseline = !live;
      let before: Usage | undefined;
      let ledgerKey = `${key}:${event.occurredAt}`;
      let recordedAt = event.occurredAt;
      if (usage.mode === "cumulative") {
        // First cumulative record of each run is a baseline unless historical recovery seeded it.
        baseline ||= !previous || previous.run !== this.run;
        const sameRecord =
          previous?.at === event.occurredAt && previous.ledgerKey;
        before = sameRecord ? previous.before : previous?.usage;
        if (
          before &&
          fields.some(
            (f) =>
              usage[f] !== null &&
              before![f] !== null &&
              usage[f]! < before![f]!,
          )
        )
          baseline = true;
        if (!baseline && before) {
          value = { ...value };
          for (const f of fields)
            value[f] =
              usage[f] === null || before[f] === null
                ? null
                : usage[f]! - before[f]!;
          if (sameRecord) ledgerKey = previous!.ledgerKey!;
        }
      } else {
        // Historical IDs remain excluded even if a resumed writer emits them again.
        baseline ||= previous?.baseline === true;
        ledgerKey = key;
        recordedAt = previous?.recordedAt ?? recordedAt;
      }
      const checkpoint: Checkpoint = {
        sessionKey: event.sessionKey,
        usage,
        at: event.occurredAt,
        run: this.run,
        baseline,
        before,
        ledgerKey: baseline ? undefined : ledgerKey,
        recordedAt,
      };
      if (row?.data === JSON.stringify(checkpoint)) return false;
      this.db
        .prepare(
          "INSERT INTO usage_checkpoints VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at,data=excluded.data",
        )
        .run(key, event.observedAt, JSON.stringify(checkpoint));
      if (baseline) return false;
      const existing = this.db
        .prepare("SELECT data FROM usage_ledger WHERE key=?")
        .get(ledgerKey) as { data: string } | undefined;
      if (
        !existing &&
        usage.mode === "cumulative" &&
        fields.every((f) => value[f] === null || value[f] === 0)
      )
        return false;
      const original = existing
        ? (JSON.parse(existing.data) as Ledger)
        : undefined;
      const entry: Ledger = {
        key: ledgerKey,
        entity,
        sessionKey: event.sessionKey,
        provider: event.provider,
        project:
          original?.project ??
          session?.project ??
          event.data.cwd?.split("/").filter(Boolean).at(-1) ??
          "Невідомий проєкт",
        model: original?.model ?? event.data.model ?? session?.model,
        at: original?.at ?? recordedAt,
        tokens: value,
      };
      if (existing?.data === JSON.stringify(entry)) return false;
      this.db
        .prepare(
          "INSERT INTO usage_ledger VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data",
        )
        .run(ledgerKey, entry.at, JSON.stringify(entry));
      return true;
    })();
  }

  begin(event: AgentEvent): void {
    if (
      event.provider !== "codex" ||
      event.kind !== "session.start" ||
      event.source !== "hook" ||
      event.data.reason !== "startup" ||
      event.occurredAt < this.startedAt
    )
      return;
    const key = JSON.stringify([event.sessionKey, "counter"]);
    if (this.db.prepare("SELECT 1 FROM usage_checkpoints WHERE key=?").get(key))
      return;
    const usage: Usage = {
      key: "counter",
      mode: "cumulative",
      live: false,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 0,
    };
    const cp: Checkpoint = {
      sessionKey: event.sessionKey,
      usage,
      at: event.occurredAt,
      run: this.run,
      baseline: true,
    };
    this.db
      .prepare("INSERT INTO usage_checkpoints VALUES (?,?,?)")
      .run(key, event.observedAt, JSON.stringify(cp));
    this.newSessions.set(event.sessionKey, event.occurredAt);
  }

  private entities(): { rows: AgentRow[]; aliases: Map<string, string> } {
    const sessions = this.sessions();
    const sessionByKey = new Map(
      sessions.map((session) => [session.key, session]),
    );
    const rows = new Map<string, AgentRow>();
    const aliases = new Map<string, string>();
    for (const session of sessions)
      rows.set(session.key, {
        key: session.key,
        sessionKey: session.key,
        parentKey: session.parentSessionKey,
        name: session.sessionId,
        provider: session.provider,
        project: session.project,
        model: session.model,
        kind: session.parentSessionKey ? "subagent" : "session",
        lifecycle: session.lifecycle,
        status: sessionStatus(session),
        lastObservedAt: session.lastObservedAt,
        tokens: null,
      });
    for (const parent of sessions)
      for (const child of parent.subagents) {
        const logical = logicalKey(parent.key, child.id);
        const canonical = child.sessionKey ?? logical;
        aliases.set(logical, canonical);
        const linked = child.sessionKey
          ? rows.get(child.sessionKey)
          : undefined;
        if (linked) {
          aliases.set(logical, linked.key);
          linked.parentKey = parent.key;
          linked.kind = "subagent";
          linked.name = child.type ? `${child.type} · ${child.id}` : child.id;
          const session = sessionByKey.get(linked.key)!;
          if (
            child.lifecycle === "ended" &&
            (child.updatedAt ?? 0) >= session.stateAt
          ) {
            linked.lifecycle = "ended";
            linked.status = "ended";
          }
        } else {
          const lifecycle =
            child.lifecycle === "ended"
              ? "ended"
              : parent.lifecycle === "open"
                ? (child.lifecycle ?? "unknown")
                : "unknown";
          rows.set(canonical, {
            key: canonical,
            parentKey: parent.key,
            sessionKey: parent.key,
            logicalAgentId: child.id,
            name: child.type ? `${child.type} · ${child.id}` : child.id,
            provider: parent.provider,
            project: parent.project,
            kind: "subagent",
            lifecycle,
            status:
              lifecycle === "ended"
                ? "ended"
                : lifecycle === "unknown"
                  ? "unknown"
                  : child.activity,
            lastObservedAt: child.updatedAt ?? parent.lastObservedAt,
            tokens: null,
          });
        }
      }
    return { rows: [...rows.values()], aliases };
  }

  private counts(rows: AgentRow[]): AgentCounts {
    const open = rows.filter(
      (r) => r.lifecycle === "open" && r.status !== "unknown",
    );
    return {
      total: open.length,
      sessions: open.filter((r) => r.kind === "session").length,
      subagents: open.filter((r) => r.kind === "subagent").length,
      working: open.filter((r) => r.status === "working").length,
      waiting: open.filter((r) => r.status === "waiting").length,
      idle: open.filter((r) => r.status === "idle").length,
      unknown: rows.filter((r) => r.status === "unknown").length,
    };
  }

  private window(query: AnalyticsFilter) {
    const range = query.range ?? "24h",
      to = this.now();
    return {
      range,
      to,
      from:
        to - { "1h": 3_600_000, "24h": 86_400_000, "7d": RETENTION_MS }[range],
    };
  }
  private ledger(from: number, to: number): Ledger[] {
    return (
      this.db
        .prepare(
          "SELECT data FROM usage_ledger WHERE at>=? AND at<=? ORDER BY at",
        )
        .all(from, to) as { data: string }[]
    ).map((r) => JSON.parse(r.data) as Ledger);
  }

  agents(query: AgentQuery): AgentPage {
    const { rows, aliases } = this.entities();
    const { from, to } = this.window(query);
    const amounts = new Map<string, TokenTotals[]>();
    for (const entry of this.ledger(from, to)) {
      const key = aliases.get(entry.entity) ?? entry.entity;
      const values = amounts.get(key);
      if (values) values.push(entry.tokens);
      else amounts.set(key, [entry.tokens]);
    }
    for (const row of rows)
      row.tokens = amounts.has(row.key) ? sum(amounts.get(row.key)!) : null;
    const all = new Map(rows.map((r) => [r.key, r]));
    const filtered = rows
      .filter(
        (r) =>
          matches(r, query) &&
          (!query.status || r.status === query.status) &&
          (!query.search ||
            `${r.name} ${r.project} ${r.model ?? ""}`
              .toLocaleLowerCase()
              .includes(query.search.toLocaleLowerCase())),
      )
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const cursor = query.cursor
      ? Buffer.from(query.cursor, "base64url").toString("utf8")
      : undefined;
    const remaining = cursor
      ? filtered.filter((r) => r.key > cursor)
      : filtered;
    const page = remaining.slice(0, query.limit ?? 100),
      ancestors = new Map<string, AgentRow>();
    for (const row of page) {
      let key = row.parentKey;
      const seen = new Set([row.key]);
      while (key && !seen.has(key)) {
        seen.add(key);
        const parent = all.get(key);
        if (!parent) break;
        ancestors.set(key, parent);
        key = parent.parentKey;
      }
    }
    return {
      agents: page,
      ancestors: [...ancestors.values()].filter(
        (r) => !page.some((p) => p.key === r.key),
      ),
      total: filtered.length,
      nextCursor:
        remaining.length > page.length && page.length
          ? Buffer.from(page.at(-1)!.key).toString("base64url")
          : null,
    };
  }

  sample(): void {
    const groups = new Map<
      string,
      { provider: string; project: string; working: number }
    >();
    for (const row of this.entities().rows)
      if (row.lifecycle === "open" && row.status === "working") {
        const key = JSON.stringify([row.provider, row.project]);
        const group = groups.get(key) ?? {
          provider: row.provider,
          project: row.project,
          working: 0,
        };
        group.working++;
        groups.set(key, group);
      }
    this.db
      .prepare(
        "INSERT INTO activity_samples VALUES (?,?) ON CONFLICT(at) DO UPDATE SET data=excluded.data",
      )
      .run(
        Math.floor(this.now() / MINUTE) * MINUTE,
        JSON.stringify([...groups.values()]),
      );
  }

  statistics(query: AnalyticsFilter): Statistics {
    const { range, from, to } = this.window(query);
    const step =
      range === "1h" ? MINUTE : range === "24h" ? 15 * MINUTE : 60 * MINUTE;
    const rows = this.entities().rows;
    const allLedger = this.ledger(from, to);
    const ledger = allLedger.filter((r) => matches(r, query));
    const measured = sum(ledger.map((r) => r.tokens));
    const samples = this.db
      .prepare(
        "SELECT at,data FROM activity_samples WHERE at>=? AND at<=? ORDER BY at",
      )
      .all(Math.floor(from / MINUTE) * MINUTE, to) as Sample[];
    const buckets: Statistics["buckets"] = [];
    for (let at = Math.floor(from / step) * step; at <= to; at += step) {
      const usage = ledger.filter((r) => r.at >= at && r.at < at + step);
      const observed = samples.filter((s) => s.at >= at && s.at < at + step);
      const amounts = sum(usage.map((r) => r.tokens));
      const working = observed.length
        ? observed.reduce(
            (total, s) =>
              total +
              (
                JSON.parse(s.data) as {
                  provider: string;
                  project: string;
                  working: number;
                }[]
              )
                .filter((g) => matches(g, query))
                .reduce((a, g) => a + g.working, 0),
            0,
          ) / observed.length
        : null;
      buckets.push({
        at,
        tokens: usage.length
          ? amounts.total
          : observed.length && measured.total !== null
            ? 0
            : null,
        input: usage.length
          ? amounts.input
          : observed.length && measured.input !== null
            ? 0
            : null,
        output: usage.length
          ? amounts.output
          : observed.length && measured.output !== null
            ? 0
            : null,
        working,
        samples: observed.length,
      });
    }
    const breakdowns = {} as Statistics["breakdowns"];
    for (const dimension of ["provider", "project", "model"] as const) {
      const grouped = new Map<string, TokenTotals[]>();
      for (const entry of ledger) {
        const name = entry[dimension] ?? "Невідома модель";
        const values = grouped.get(name);
        if (values) values.push(entry.tokens);
        else grouped.set(name, [entry.tokens]);
      }
      breakdowns[dimension] = [...grouped]
        .map(([name, values]) => ({ name, tokens: sum(values) }))
        .sort(
          (a, b) =>
            (b.tokens.total ?? b.tokens.input ?? 0) -
            (a.tokens.total ?? a.tokens.input ?? 0),
        );
    }
    const monitoringSince = (
      this.db
        .prepare(
          "SELECT value FROM analytics_meta WHERE key='monitoring_since'",
        )
        .get() as { value: number }
    ).value;
    const reasons: string[] = [];
    if (from < monitoringSince)
      reasons.push("Дані лише від початку моніторингу");
    const expectedSamples = Math.floor((to - from) / MINUTE) + 1;
    if (samples.length < expectedSamples)
      reasons.push("Є перерви спостереження");
    if (!ledger.length) reasons.push("Usage ще не отримано");
    if (ledger.some((r) => r.tokens.partial))
      reasons.push("Частина usage недоступна");
    return {
      serverTime: to,
      monitoringSince,
      range,
      from,
      to,
      counts: this.counts(rows),
      tokens: sum(ledger.map((r) => r.tokens)),
      buckets,
      breakdowns,
      projects: [
        ...new Set([
          ...rows.map((r) => r.project),
          ...allLedger.map((r) => r.project),
        ]),
      ].sort(),
      coverage: {
        partial: reasons.length > 0,
        reasons,
        samples: samples.length,
        expectedSamples,
      },
    };
  }

  cleanup(): void {
    const cutoff = this.now() - RETENTION_MS;
    this.db.prepare("DELETE FROM usage_ledger WHERE at<?").run(cutoff);
    this.db.prepare("DELETE FROM activity_samples WHERE at<?").run(cutoff);
    // Keep checkpoints for retained sessions so replay cannot resurrect pruned usage.
    this.db
      .prepare(
        "DELETE FROM usage_checkpoints WHERE at<? AND json_extract(data,'$.run')!=? AND NOT EXISTS (SELECT 1 FROM sessions WHERE sessions.key=json_extract(usage_checkpoints.data,'$.sessionKey'))",
      )
      .run(cutoff, this.run);
  }
}

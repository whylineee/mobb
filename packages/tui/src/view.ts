import stringWidth from "string-width";
import type { AgentRow } from "@agentwatch/shared";
import type { UiState } from "./state.js";

export type FrameLine = {
  text: string;
  color?: string;
  bold?: boolean;
  inverse?: boolean;
  segments?: {
    text: string;
    color?: string;
    bold?: boolean;
    inverse?: boolean;
  }[];
};
// Strip ANSI/OSC and controls from untrusted session names, projects and tool output.
export function clean(value: string): string {
  return value
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ");
}
export function fit(value: string, width: number): string {
  width = Math.max(0, width);
  const text = clean(value);
  let out = "",
    size = 0;
  for (const char of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(text)) {
    const n = stringWidth(char.segment);
    if (size + n > width) break;
    out += char.segment;
    size += n;
  }
  return out + " ".repeat(width - size);
}
export const number = (value: number | null | undefined) =>
  value === null || value === undefined
    ? "—"
    : value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1000
        ? `${(value / 1000).toFixed(1)}K`
        : Number.isInteger(value)
          ? String(value)
          : value.toFixed(1);
export function sparkline(
  values: (number | null)[],
  width: number,
  ascii: boolean,
): string {
  if (!width) return "";
  const chars = ascii ? "._-:=+*#" : "▁▂▃▄▅▆▇█";
  const max = Math.max(1, ...values.filter((v): v is number => v !== null));
  const points =
    values.length > width
      ? Array.from({ length: width }, (_, i) => {
          const group = values.slice(
            Math.floor((i * values.length) / width),
            Math.floor(((i + 1) * values.length) / width),
          );
          // A missing interval remains visible, rather than connecting across a gap.
          return group.some((v) => v === null)
            ? null
            : group.reduce<number>((a, b) => a + (b ?? 0), 0) / group.length;
        })
      : values;
  return points
    .map((v) =>
      v === null
        ? " "
        : chars[
            Math.min(
              chars.length - 1,
              Math.floor((v / max) * (chars.length - 1)),
            )
          ],
    )
    .join("");
}
export function treeRows(
  rows: AgentRow[],
  collapsed: Set<string>,
): { row: AgentRow; depth: number }[] {
  const all = new Map(rows.map((r) => [r.key, r])),
    children = new Map<string, AgentRow[]>();
  for (const row of rows)
    if (row.parentKey && all.has(row.parentKey))
      children.set(row.parentKey, [
        ...(children.get(row.parentKey) ?? []),
        row,
      ]);
  const result: { row: AgentRow; depth: number }[] = [],
    seen = new Set<string>();
  const visit = (row: AgentRow, depth: number) => {
    if (seen.has(row.key)) return;
    seen.add(row.key);
    result.push({ row, depth });
    if (!collapsed.has(row.key))
      for (const child of children.get(row.key) ?? [])
        visit(child, Math.min(depth + 1, 8));
    else {
      const hide = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        for (const child of children.get(key) ?? []) hide(child.key);
      };
      for (const child of children.get(row.key) ?? []) hide(child.key);
    }
  };
  for (const row of rows)
    if (!row.parentKey || !all.has(row.parentKey)) visit(row, 0);
  for (const row of rows) if (!seen.has(row.key)) visit(row, 0);
  return result;
}
const labels: Record<AgentRow["status"], string> = {
  working: "Працює",
  waiting: "Потрібна увага",
  idle: "Очікує запиту",
  unknown: "Невідомо",
  ended: "Завершено",
};
const line = (text: string, color?: string, bold = false): FrameLine => ({
  text,
  color,
  bold,
});
const amount = (r: AgentRow) =>
  r.tokens?.total !== null && r.tokens?.total !== undefined
    ? number(r.tokens.total)
    : r.tokens?.input !== null && r.tokens?.input !== undefined
      ? `in:${number(r.tokens.input)}`
      : "—";
const codexLimitLine = (state: UiState): string => {
  const limits = state.codexLimits;
  if (limits.state === "loading") return "Codex ліміти: завантаження…";
  if (limits.state !== "ready") return "Codex ліміти: недоступні";
  const show = (value: typeof limits.fiveHour) => {
    if (!value) return "—";
    const remaining = `${number(value.remainingPercent)}%`;
    if (value.resetsAt === null) return remaining;
    const reset = new Date(value.resetsAt).toLocaleString([], {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${remaining} (скид ${reset})`;
  };
  return `Codex ліміти · 5г: ${show(limits.fiveHour)} · 7д: ${show(limits.weekly)}${state.online ? "" : " · останні дані"}`;
};
const age = (at: number, now: number) => {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  return s < 60
    ? `${s}с`
    : s < 3600
      ? `${Math.floor(s / 60)}хв`
      : `${Math.floor(s / 3600)}год`;
};

function graph(
  state: UiState,
  kind: number,
  width: number,
  height: number,
): string[] {
  const stats = state.statistics,
    buckets = stats?.buckets ?? [],
    out: string[] = [];
  if (kind === 1) {
    out.push(
      `1 Токени / ${state.range}`,
      `Input  max ${number(buckets.some((b) => b.input !== null) ? Math.max(0, ...buckets.map((b) => b.input ?? 0)) : null)}`,
    );
    out.push(
      sparkline(
        buckets.map((b) => b.input),
        width,
        state.ascii,
      ),
    );
    out.push(
      `Output max ${number(buckets.some((b) => b.output !== null) ? Math.max(0, ...buckets.map((b) => b.output ?? 0)) : null)}`,
    );
    out.push(
      sparkline(
        buckets.map((b) => b.output),
        width,
        state.ascii,
      ),
    );
    out.push(
      `${stats ? new Date(stats.from).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"} ${" ".repeat(Math.max(0, width - 15))} зараз`,
    );
  } else if (kind === 2) {
    out.push(
      `2 Працюючі агенти / ${state.range}`,
      state.range === "1h"
        ? "Щохвилинні знімки"
        : "Середнє за спостережені хвилини",
    );
    out.push(
      sparkline(
        buckets.map((b) => b.working),
        width,
        state.ascii,
      ),
    );
    out.push(
      `max ${number(buckets.some((b) => b.working !== null) ? Math.max(...buckets.map((b) => b.working ?? 0)) : null)}`,
    );
    out.push("Пробіли = немає спостереження");
  } else {
    const items = stats?.breakdowns[state.dimension] ?? [];
    out.push(`3 Токени: ${state.dimension} [b змінити]`);
    const max = Math.max(
      1,
      ...items.map((i) => i.tokens.total ?? i.tokens.input ?? 0),
    );
    for (const item of items.slice(0, Math.max(1, height - 2))) {
      const n = item.tokens.total ?? item.tokens.input,
        nameWidth = Math.min(20, Math.floor(width * 0.4)),
        barWidth = Math.max(1, width - nameWidth - 13);
      out.push(
        `${fit(item.name, nameWidth)} ${fit((state.ascii ? "#" : "█").repeat(Math.round(((n ?? 0) / max) * barWidth)), barWidth)} ${item.tokens.total === null ? "in:" : ""}${number(n)}`,
      );
    }
    if (!items.length) out.push("Usage ще не отримано");
  }
  while (out.length < height) out.push("");
  return out.slice(0, height).map((v) => fit(v, width));
}

export function detailContent(state: UiState): string[] {
  const selected = state.agents.find((r) => r.key === state.detailKey),
    session =
      state.detail?.key === selected?.sessionKey ? state.detail : undefined;
  const raw: string[] = [
    `ДЕТАЛІ · ${selected?.name ?? ""}`,
    `Стан: ${selected ? labels[selected.status] : "—"}   Модель: ${selected?.model ?? "—"}`,
    `Проєкт: ${selected?.project ?? "—"}`,
    `Власні токени (${state.range}): ${selected ? amount(selected) : "—"}`,
    "",
  ];
  if (!session)
    raw.push(
      state.detailError
        ? `Деталі недоступні: ${state.detailError}`
        : "Завантаження деталей…",
    );
  else {
    const logical = selected?.logicalAgentId;
    const child = logical
      ? session.subagents.find((s) => s.id === logical)
      : undefined;
    raw.push(
      "ЗАДАЧА",
      child?.task ??
        (logical
          ? "Немає даних про задачу субагента"
          : (session.task?.text ?? "—")),
      "",
      `cwd: ${session.cwd ?? "—"}`,
      `Гілка: ${session.gitBranch ?? "—"}`,
    );
    if (!logical)
      for (const tool of session.activeTools)
        raw.push(
          "",
          `Інструмент: ${tool.name}`,
          tool.command ?? tool.path ?? "",
        );
    if (!logical && session.lastTool)
      raw.push(
        "",
        `Останній інструмент: ${session.lastTool.name}`,
        session.lastTool.error ?? session.lastTool.result ?? "—",
      );
    if (!logical)
      for (const event of state.events?.events ?? [])
        raw.push(
          `${new Date(event.occurredAt).toLocaleTimeString()} ${event.kind}`,
        );
  }
  return raw.flatMap((text) => wrap(clean(text), state.columns));
}

function detailLines(state: UiState): FrameLine[] {
  const wrapped = detailContent(state);
  const height = state.rows - 3,
    offset = Math.min(state.detailScroll, Math.max(0, wrapped.length - height));
  return [
    line("AgentWatch / Деталі", "cyan", true),
    ...wrapped.slice(offset, offset + height).map((t) => line(t)),
    line("↑↓ / PgUp/PgDn прокрутка · Esc назад · q вихід", "gray"),
  ];
}

function wideDashboard(state: UiState): FrameLine[] {
  const width = state.columns,
    height = state.rows;
  const stats = state.statistics,
    counts = stats?.counts;
  const border = state.ascii ? "|" : "│",
    dash = state.ascii ? "-" : "─";
  const left = Math.floor((width - 10) * 0.32),
    middle = Math.floor((width - 10) * 0.34),
    right = width - 10 - left - middle;
  const visible = treeRows(state.agents, state.collapsed);
  const selectedIndex = Math.max(
    0,
    visible.findIndex((v) => v.row.key === state.selectedKey),
  );
  const selected = visible[selectedIndex]?.row;
  const session =
    state.detail?.key === selected?.sessionKey ? state.detail : undefined;
  const child = selected?.logicalAgentId
    ? session?.subagents.find((s) => s.id === selected.logicalAgentId)
    : undefined;
  const out: FrameLine[] = [
    line(
      `${state.ascii ? "*" : "◈"} AGENTWATCH / LIVE MONITOR${" ".repeat(Math.max(1, width - 58))}${state.online ? "LIVE" : "OFFLINE · останні дані"}`,
      state.online ? "cyan" : "yellow",
      true,
    ),
    line(
      `ПРАЦЮЮТЬ ${number(counts?.working)}    УВАГА ${number(counts?.waiting)}    ОЧІКУЮТЬ ${number(counts?.idle)}    ВСЬОГО ${number(counts?.total)}    ТОКЕНИ [${state.range}] ${number(stats?.tokens.total)}${stats?.tokens.partial || stats?.coverage.partial ? " · частково" : ""}`,
      "magenta",
      true,
    ),
    line(
      `[t] ${state.range}   [p] ${state.provider ?? "усі"}   [j] ${state.project ?? "усі проєкти"}   [s] ${state.status ? labels[state.status] : "усі стани"}   ${state.searching ? "ПОШУК >" : "[/]"} ${state.search}${state.searching ? "_" : ""}`,
      "cyan",
    ),
    line(codexLimitLine(state), "green", true),
    line("Відкриті раніше сесії можуть бути не виявлені", "yellow"),
  ];
  const panelHeight = Math.max(1, height - out.length - 4);
  const listHeight = Math.max(1, Math.floor((panelHeight - 1) / 2));
  const start = Math.max(
    0,
    Math.min(
      Math.max(0, visible.length - listHeight),
      selectedIndex - listHeight + 1,
    ),
  );
  const list: {
    text: string;
    color?: string;
    bold?: boolean;
    inverse?: boolean;
  }[] = [
    {
      text: `АГЕНТИ · ${state.loading ? "оновлення…" : state.total}`,
      color: "cyan",
      bold: true,
    },
  ];
  for (const { row, depth } of visible.slice(start, start + listHeight)) {
    const marker = state.ascii
      ? row.status === "working"
        ? "*"
        : row.status === "waiting"
          ? "!"
          : "o"
      : row.status === "working"
        ? "●"
        : row.status === "waiting"
          ? "◆"
          : "○";
    const hasChildren = state.agents.some((r) => r.parentKey === row.key);
    const tree = hasChildren
      ? state.collapsed.has(row.key)
        ? "+"
        : "-"
      : depth
        ? state.ascii
          ? "+"
          : "└"
        : " ";
    const color =
      row.status === "working"
        ? "green"
        : row.status === "waiting"
          ? "yellow"
          : "cyan";
    list.push({
      text: `${row.key === state.selectedKey ? ">" : " "}${" ".repeat(depth * 2)}${tree} ${marker} ${row.provider} · ${row.name}`,
      color,
      bold: row.key === state.selectedKey,
      inverse: row.key === state.selectedKey,
    });
    list.push({
      text: `   ${labels[row.status]} · ${row.project} · ${amount(row)}`,
      color,
    });
  }
  if (!visible.length)
    list.push({ text: "Немає відкритих агентів", color: "gray" });
  const details: string[] = ["ДЕТАЛІ · ВИБРАНИЙ АГЕНТ"];
  if (!selected) details.push("Виберіть агента зі списку");
  else {
    details.push(
      selected.name,
      `${labels[selected.status]}  ·  ${selected.provider}`,
      `Проєкт: ${selected.project}`,
      `Модель: ${selected.model ?? "—"}`,
      `Токени: ${amount(selected)}`,
      "",
      "ЗАДАЧА",
    );
    if (!session)
      details.push(
        state.detailError
          ? `Деталі недоступні: ${state.detailError}`
          : "Завантаження деталей…",
      );
    else {
      const task =
        child?.task ??
        (selected.logicalAgentId
          ? "Немає даних про задачу субагента"
          : (session.task?.text ?? "—"));
      details.push(
        ...clean(task)
          .split(/\n/)
          .flatMap((s) => wrap(s, middle))
          .slice(0, 4),
      );
      details.push("", "ОСТАННІ ПОДІЇ");
      if (selected.logicalAgentId) details.push("Події субагента недоступні");
      else
        for (const event of (state.events?.events ?? []).slice(0, 5))
          details.push(
            `${new Date(event.occurredAt).toLocaleTimeString()} ${event.kind}`,
          );
    }
  }
  const graphRows = [
    "ГРАФІКИ · [1/2/3] [b]",
    ...graph(state, state.chart === 2 ? 2 : 1, right, 6),
    "",
    ...graph(
      state,
      state.chart === 3 ? 3 : state.chart === 2 ? 1 : 2,
      right,
      Math.max(6, panelHeight - 8),
    ),
  ];
  for (let i = 0; i < panelHeight; i++) {
    const item = list[i] ?? { text: "" };
    const segments = [
      { text: `${border} `, color: "magenta" },
      { ...item, text: fit(item.text, left) },
      { text: ` ${border} `, color: "magenta" },
      {
        text: fit(details[i] ?? "", middle),
        color: i === 0 ? "cyan" : undefined,
        bold: i === 0,
      },
      { text: ` ${border} `, color: "magenta" },
      { text: fit(graphRows[i] ?? "", right), color: "cyan", bold: i === 0 },
      { text: ` ${border}`, color: "magenta" },
    ];
    out.push({ text: segments.map((s) => s.text).join(""), segments });
  }
  out.push(line(dash.repeat(width), "magenta"));
  out.push(
    line(
      `Дані: ${stats?.coverage.reasons.join("; ") || "поточне спостереження"}`,
      "gray",
    ),
  );
  out.push(
    line(
      state.error
        ? `Помилка: ${state.error}`
        : "↑↓ агент · ←→ дерево · Enter деталі · / пошук · t/p/j/s фільтри · 1/2/3 графіки · ? · q",
      "gray",
    ),
  );
  return out;
}

function wrap(value: string, width: number): string[] {
  if (width <= 0) return [];
  const chunks: string[] = [];
  let chunk = "",
    size = 0;
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(value)) {
    const length = stringWidth(segment);
    if (size + length > width && chunk) {
      chunks.push(chunk);
      chunk = "";
      size = 0;
    }
    chunk += segment;
    size += length;
  }
  return [...chunks, chunk];
}

export function renderDashboard(state: UiState): FrameLine[] {
  const { columns: width, rows: height } = state;
  let out: FrameLine[] = [];
  if (width < 80 || height < 24)
    out = [
      line("AgentWatch — збільште термінал до 80×24", "yellow"),
      line("Моніторинг триває. q — вихід."),
    ];
  else if (state.help)
    out = [
      line("AgentWatch / Довідка", "cyan", true),
      ...[
        "↑↓ / PgUp/PgDn  вибір агента та прокрутка",
        "←→              згорнути / розгорнути дерево",
        "Enter           деталі сесії або субагента",
        "/               пошук (Enter застосувати, Esc повернутися)",
        "t               період 1h / 24h / 7d",
        "p / j           провайдер / проєкт",
        "s               стан (лише таблиця)",
        "r               скинути фільтри та пошук",
        "1 / 2 / 3       токени / працюючі / розбивка",
        "g               відкрити / закрити графіки",
        "b               розбивка: проєкт / провайдер / модель",
        "Tab             фокус таблиці / графіків",
        "Esc             закрити деталі або довідку",
        "q / Ctrl+C      вихід; daemon та агенти продовжують роботу",
        "",
        "Токени рядка — власні. in: — відомий input, total недоступний.",
        "— немає даних; 0 виміряний нуль; частково — неповне охоплення.",
        "Поточні глобальні лічильники не залежать від фільтрів.",
        "Запуск: agentwatch tui [--ascii] [--mono]",
        "Зупинка монітора: agentwatch stop",
      ].map((t) => line(t)),
    ];
  else if (state.detailKey) out = detailLines(state);
  else if (state.chartsOpen) {
    const chartHeight = Math.max(6, height - 5);
    out = [
      line("AGENTWATCH / ГРАФІКИ", "magenta", true),
      line(`[1/2/3] графік · [t] ${state.range} · [b] розбивка`, "cyan"),
      ...graph(state, state.chart, width, chartHeight).map((text) =>
        line(text, "cyan"),
      ),
      line("g / Esc назад · q вихід", "gray"),
    ];
  } else if (width >= 140 && height >= 30) out = wideDashboard(state);
  else {
    const stats = state.statistics,
      c = stats?.counts;
    const network = state.online ? "LIVE" : "OFFLINE · останні дані";
    out.push(
      line(
        `${fit("AgentWatch / Огляд", Math.max(0, width - network.length - 1))} ${network}`,
        state.online ? "cyan" : "yellow",
        true,
      ),
    );
    out.push(
      line(
        `ВІДКРИТІ АГЕНТИ ${number(c?.total)}    Сесії ${number(c?.sessions)}    Субагенти ${number(c?.subagents)}`,
        "white",
        true,
      ),
    );
    out.push(
      line(
        `Працюють ${number(c?.working)}    Увага ${number(c?.waiting)}    Очікують ${number(c?.idle)}`,
      ),
    );
    out.push(
      line(
        `Токени [${state.range}] ${number(stats?.tokens.total)}${stats?.tokens.partial || stats?.coverage.partial ? " · частково" : ""}    Input ${number(stats?.tokens.input)}    Output ${number(stats?.tokens.output)}`,
        "green",
        true,
      ),
    );
    out.push(
      line(
        `Cache read ${number(stats?.tokens.cacheRead)} / write ${number(stats?.tokens.cacheWrite)} · входять в Input`,
      ),
    );
    out.push(line(codexLimitLine(state), "green", true));
    out.push(line("Відкриті раніше сесії можуть бути не виявлені", "yellow"));
    out.push(
      line(
        `[t] ${state.range}  [p] ${state.provider ?? "усі"}  [j] ${state.project ?? "усі проєкти"}  [s] ${state.status ? labels[state.status] : "усі стани"}`,
        "cyan",
      ),
    );
    out.push(
      line(
        `${state.searching ? "ПОШУК >" : "[/] Пошук:"} ${state.search}${state.searching ? "_" : ""}  ${state.loading ? "оновлення…" : `${state.total} сутностей`}`,
        state.searching ? "yellow" : "gray",
      ),
    );
    out.push(
      line(
        (state.ascii ? "-" : "─").repeat(width),
        state.focus === 0 ? "cyan" : "gray",
      ),
    );
    const wide = width >= 120 && height >= 36;
    const widths = wide
      ? [width - 74, 14, 16, 16, 12, 11]
      : [width - 42, 14, 15, 10];
    const cells = (values: string[]) =>
      values.map((v, i) => fit(v, widths[i]!)).join(" ");
    out.push(
      line(
        cells(
          wide
            ? [
                "Агент / дерево",
                "Стан",
                "Проєкт",
                "Модель",
                "Власні токени",
                "Оновлено",
              ]
            : ["Агент / дерево", "Стан", "Проєкт", "Токени"],
        ),
        "gray",
        true,
      ),
    );
    const tableHeight = Math.max(1, height - out.length - 4);
    const visible = treeRows(state.agents, state.collapsed),
      selected = Math.max(
        0,
        visible.findIndex((r) => r.row.key === state.selectedKey),
      );
    const start = Math.max(
      0,
      Math.min(
        Math.max(0, visible.length - tableHeight),
        selected - tableHeight + 1,
      ),
    );
    for (let i = 0; i < tableHeight; i++) {
      const entry = visible[start + i];
      if (!entry) {
        out.push(
          line(
            i === 0 && !visible.length ? "Немає агентів за цими фільтрами" : "",
          ),
        );
        continue;
      }
      const { row, depth } = entry,
        chosen = row.key === state.selectedKey,
        hasChildren = state.agents.some((r) => r.parentKey === row.key);
      const marker = hasChildren
        ? state.collapsed.has(row.key)
          ? ">"
          : "v"
        : depth
          ? state.ascii
            ? "+-"
            : "└─"
          : " ";
      const name = `${chosen ? ">" : " "}${" ".repeat(depth * 2)}${marker} ${row.kind === "session" ? `${row.provider} · ` : ""}${row.name}${state.ancestors.has(row.key) ? " (контекст)" : ""}`;
      const values = [name, labels[row.status], row.project];
      if (wide) values.push(row.model ?? "—");
      values.push(amount(row));
      if (wide)
        values.push(age(row.lastObservedAt, stats?.serverTime ?? Date.now()));
      out.push({
        ...line(
          cells(values),
          row.status === "waiting"
            ? "yellow"
            : row.status === "working"
              ? "green"
              : row.status === "unknown"
                ? "gray"
                : undefined,
        ),
        inverse: chosen,
      });
    }
    out.push(
      line(
        (state.ascii ? "-" : "─").repeat(width),
        state.focus === 1 ? "cyan" : "gray",
      ),
    );
    const since = stats
      ? new Date(stats.monitoringSince).toLocaleString()
      : "—";
    out.push(
      line(
        `Від ${since} · ${stats?.coverage.reasons.join("; ") ?? "Підключення до daemon…"}`,
        "gray",
      ),
    );
    out.push(
      line(
        state.error
          ? `Помилка: ${state.error}`
          : "↑↓ вибір · Enter деталі · g графіки · / пошук · t/p/j/s фільтри · ? · q",
        "gray",
      ),
    );
  }
  while (out.length < height) out.push(line(""));
  return out.slice(0, height).map((v) => ({ ...v, text: fit(v.text, width) }));
}

import { expect, it } from "vitest";
import stringWidth from "string-width";
import { fit, sparkline, renderDashboard, treeRows } from "./view.js";
import { applyPage, initialState, reduceUi, type UiState } from "./state.js";
import type { AgentRow, Session } from "@agentwatch/shared";
const row = (key: string, parentKey?: string): AgentRow => ({
  key,
  parentKey,
  sessionKey: key,
  name: key,
  provider: "codex",
  project: "mobb",
  kind: parentKey ? "subagent" : "session",
  lifecycle: "open",
  status: "working",
  lastObservedAt: 1,
  tokens: null,
});
const detailState = (task: string): UiState => ({
  ...initialState(),
  agents: [row("agent")],
  selectedKey: "agent",
  detailKey: "agent",
  detail: {
    key: "agent",
    sessionId: "agent",
    provider: "codex",
    project: "mobb",
    origin: "cli",
    lifecycle: "open",
    activity: "working",
    freshness: "fresh",
    requiresAttention: false,
    lastActivityAt: 1,
    lastObservedAt: 1,
    stateAt: 1,
    task: { text: task, source: "hook", updatedAt: 1 },
    activeTools: [],
    subagents: [],
    sources: ["hook"],
  } satisfies Session,
});
it("scrolls up immediately after repeated attempts to scroll past the end", () => {
  let state = detailState("x".repeat(80 * 40));
  for (let i = 0; i < 20; i++) state = reduceUi(state, "pagedown");
  const bottom = renderDashboard(state).map((line) => line.text);
  state = reduceUi(state, "pageup");
  expect(renderDashboard(state).map((line) => line.text)).not.toEqual(bottom);
});
it("preserves task text after a full line of indentation", () => {
  const state = detailState(" ".repeat(80) + "visible-task-tail");
  expect(
    renderDashboard(state)
      .map((line) => line.text)
      .join("\n"),
  ).toContain("visible-task-tail");
});
it("fits Unicode names and removes terminal control sequences", () => {
  const value = fit("\u001b[31m危険🙂\u001b]52;c;secret\u0007\nname", 12);
  expect(stringWidth(value)).toBe(12);
  expect(value).not.toContain("\u001b");
  expect(value).not.toContain("secret");
  expect(value).not.toContain("\n");
});
it("preserves gaps in sparklines and supports ASCII", () => {
  expect(sparkline([1, null, 2], 3, true)).toMatch(/^. .$/);
  expect(sparkline([null, null], 2, false)).toBe("  ");
});
it("renders bounded frames at 120x36 and 80x24 and recovers after resize", () => {
  for (const [columns, rows] of [
    [120, 36],
    [80, 24],
    [60, 18],
  ]) {
    const frame = renderDashboard({
      ...initialState(),
      columns,
      rows,
      agents: [row("危険🙂".repeat(60))],
      online: false,
    });
    expect(frame).toHaveLength(rows);
    expect(frame.every((l) => stringWidth(l.text) <= columns)).toBe(true);
    expect(frame.map((l) => l.text).join("\n")).toContain(
      columns < 80 ? "80×24" : "AgentWatch",
    );
  }
});
it("explains that already-open sessions may not be detected", () => {
  const frame = renderDashboard({ ...initialState(), columns: 120, rows: 36 });
  expect(frame.map((line) => line.text).join("\n")).toContain(
    "Відкриті раніше сесії можуть бути не виявлені",
  );
});
it("shows remaining Codex limits on both wide and compact screens", () => {
  for (const columns of [80, 160]) {
    const text = renderDashboard({
      ...initialState(),
      columns,
      rows: 36,
      codexLimits: {
        state: "ready",
        updatedAt: Date.now(),
        fiveHour: { remainingPercent: 75, resetsAt: null },
        weekly: { remainingPercent: 42, resetsAt: null },
      },
    })
      .map((l) => l.text)
      .join("\n");
    expect(text).toContain("5г: 75%");
    expect(text).toContain("7д: 42%");
  }
});
it("shows unavailable Codex limits without inventing zero", () => {
  const text = renderDashboard({
    ...initialState(),
    columns: 80,
    rows: 24,
    codexLimits: { state: "unavailable" },
  })
    .map((l) => l.text)
    .join("\n");
  expect(text).toContain("Codex ліміти: недоступні");
});
it("shows agents, selected details and both graphs in three columns on wide terminals", () => {
  const selected = row("agent-a");
  const frame = renderDashboard({
    ...initialState(),
    columns: 160,
    rows: 36,
    agents: [selected],
    selectedKey: selected.key,
  });
  const text = frame.map((l) => l.text).join("\n");
  expect(text).toContain("АГЕНТИ");
  expect(text).toContain("ДЕТАЛІ");
  expect(text).toContain("ГРАФІКИ");
  expect(text).toContain("agent-a");
  expect(text).toContain("Токени / 24h");
  expect(text).toContain("Працюючі агенти / 24h");
  expect(frame.every((l) => stringWidth(l.text) <= 160)).toBe(true);
  const activityFirst = renderDashboard({
    ...initialState(),
    columns: 160,
    rows: 36,
    chart: 2,
  })
    .map((l) => l.text)
    .join("\n");
  expect(activityFirst.indexOf("2 Працюючі агенти")).toBeLessThan(
    activityFirst.indexOf("1 Токени"),
  );
});
it("opens and closes the charts view with the keyboard on narrow terminals", () => {
  const state = reduceUi(initialState(), "g");
  expect(
    renderDashboard(state)
      .map((l) => l.text)
      .join("\n"),
  ).toContain("ГРАФІКИ");
  const restored = reduceUi(state, "escape");
  expect(
    renderDashboard(restored)
      .map((l) => l.text)
      .join("\n"),
  ).toContain("АГЕНТИ");
});
it("keeps detail scrolling available when pressing g inside details", () => {
  let state: UiState = {
    ...detailState("x".repeat(80 * 40)),
    detailKey: undefined,
  };
  state = reduceUi(state, "enter");
  state = reduceUi(state, "g");
  state = reduceUi(state, "down");
  expect(state.detailScroll).toBe(1);
  expect(state.chartsOpen).toBe(false);
});
it("shows the search input when search starts from charts", () => {
  let state = reduceUi(initialState(), "g");
  state = reduceUi(state, "/");
  state = reduceUi(state, "text:agent");
  expect(
    renderDashboard(state)
      .map((l) => l.text)
      .join("\n"),
  ).toContain("ПОШУК > agent");
});
it("returns to the list when a selected open session disappears", () => {
  const selected = row("agent");
  const state = reduceUi(
    { ...initialState(), agents: [selected], selectedKey: selected.key },
    "enter",
  );
  const refreshed = applyPage(state, {
    agents: [],
    ancestors: [],
    total: 0,
    nextCursor: null,
  });
  expect(refreshed.detailKey).toBeUndefined();
  expect(refreshed.selectedKey).toBeUndefined();
});
it("collapses children without losing context and survives malformed cycles", () => {
  const rows = [row("parent"), row("child", "parent")];
  expect(treeRows(rows, new Set()).map((r) => r.row.key)).toEqual([
    "parent",
    "child",
  ]);
  expect(treeRows(rows, new Set(["parent"])).map((r) => r.row.key)).toEqual([
    "parent",
  ]);
  expect(treeRows([row("a", "b"), row("b", "a")], new Set())).toHaveLength(2);
});
it("routes keyboard input through search, filters, charts and stable selection", () => {
  let state = { ...initialState(), agents: [row("a"), row("b")] };
  state = reduceUi(state, "down");
  expect(state.selectedKey).toBe("b");
  state = reduceUi(state, "/");
  state = reduceUi(state, "text:q");
  expect(state.search).toBe("q");
  expect(state.exit).toBe(false);
  state = reduceUi(state, "escape");
  state = reduceUi(state, "3");
  expect(state.chart).toBe(3);
  state = reduceUi(state, "p");
  expect(state.provider).toBe("codex");
  state = reduceUi(state, "q");
  expect(state.exit).toBe(true);
});
it("accepts batched search keystrokes without treating q as exit", () => {
  const state = reduceUi(initialState(), "/q");
  expect(state.searching).toBe(true);
  expect(state.search).toBe("q");
  expect(reduceUi(reduceUi(initialState(), "/"), "q").search).toBe("q");
});

import { expect, it } from "vitest";
import stringWidth from "string-width";
import { fit, sparkline, renderDashboard, treeRows } from "./view.js";
import { initialState, reduceUi } from "./state.js";
import type { AgentRow } from "@agentwatch/shared";
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

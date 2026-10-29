import type {
  AgentPage,
  AgentRow,
  Session,
  Statistics,
  TimeRange,
  EventPage,
  CodexLimits,
  CollectorHealth,
} from "@agentwatch/shared";
import { detailContent, sourceContent, treeRows } from "./view.js";

export type UiState = {
  columns: number;
  rows: number;
  ascii: boolean;
  monochrome: boolean;
  agents: AgentRow[];
  ancestors: Set<string>;
  selectedKey?: string;
  collapsed: Set<string>;
  range: TimeRange;
  provider?: "codex" | "claude";
  project?: string;
  status?: AgentRow["status"];
  search: string;
  searching: boolean;
  chart: number;
  dimension: "project" | "provider" | "model";
  focus: number;
  help: boolean;
  chartsOpen: boolean;
  sourcesOpen: boolean;
  sourcesScroll: number;
  collectors?: CollectorHealth[];
  sourcesError?: string;
  detailKey?: string;
  detail?: Session;
  events?: EventPage;
  detailError?: string;
  detailScroll: number;
  statistics?: Statistics;
  codexLimits: CodexLimits;
  online: boolean;
  error?: string;
  loading: boolean;
  total: number;
  nextCursor: string | null;
  pageCount: number;
  exit: boolean;
};
export const initialState = (): UiState => ({
  columns: 80,
  rows: 24,
  ascii: false,
  monochrome: false,
  agents: [],
  ancestors: new Set(),
  collapsed: new Set(),
  range: "24h",
  search: "",
  searching: false,
  chart: 1,
  dimension: "project",
  focus: 0,
  help: false,
  chartsOpen: false,
  sourcesOpen: false,
  sourcesScroll: 0,
  codexLimits: { state: "loading" },
  detailScroll: 0,
  online: false,
  loading: true,
  total: 0,
  nextCursor: null,
  pageCount: 1,
  exit: false,
});

const cycle = <T>(values: T[], current: T) =>
  values[(values.indexOf(current) + 1) % values.length]!;
export function applyPage(state: UiState, page: AgentPage): UiState {
  const agents = [
    ...new Map(
      [...page.ancestors, ...page.agents].map((r) => [r.key, r]),
    ).values(),
  ];
  const visible = treeRows(agents, state.collapsed);
  return {
    ...state,
    agents,
    ancestors: new Set(page.ancestors.map((r) => r.key)),
    detailKey:
      state.detailKey && agents.some((r) => r.key === state.detailKey)
        ? state.detailKey
        : undefined,
    total: page.total,
    nextCursor: page.nextCursor,
    selectedKey: visible.some((r) => r.row.key === state.selectedKey)
      ? state.selectedKey
      : visible[0]?.row.key,
  };
}
export function reduceUi(state: UiState, action: string): UiState {
  if (action === "interrupt") return { ...state, exit: true };
  if (action === "escape")
    return {
      ...state,
      searching: false,
      help: false,
      chartsOpen: false,
      sourcesOpen: false,
      sourcesScroll: 0,
      detailKey: undefined,
      detailScroll: 0,
    };
  if (state.searching) {
    if (action === "enter") return { ...state, searching: false };
    if (action === "backspace")
      return {
        ...state,
        search: [...state.search].slice(0, -1).join(""),
        pageCount: 1,
      };
    if (
      !["up", "down", "left", "right", "tab", "pageup", "pagedown"].includes(
        action,
      )
    )
      return {
        ...state,
        search: (
          state.search + (action.startsWith("text:") ? action.slice(5) : action)
        ).slice(0, 256),
        pageCount: 1,
      };
    return state;
  }
  if (action === "q" || action === "interrupt") return { ...state, exit: true };
  if (action === "?") return { ...state, help: !state.help };
  if (state.help) return state;
  if (action === "h")
    return {
      ...state,
      sourcesOpen: !state.sourcesOpen,
      sourcesScroll: 0,
      collectors: state.sourcesOpen ? state.collectors : undefined,
      sourcesError: undefined,
      chartsOpen: false,
      detailKey: undefined,
    };
  if (state.sourcesOpen) {
    if (["up", "down", "pageup", "pagedown"].includes(action)) {
      const limit = Math.max(0, sourceContent(state).length - (state.rows - 3));
      const direction = action === "down" || action === "pagedown" ? 1 : -1;
      const step = action.startsWith("page") ? 8 : 1;
      return {
        ...state,
        sourcesScroll: Math.max(
          0,
          Math.min(limit, state.sourcesScroll + direction * step),
        ),
      };
    }
    return state;
  }
  if (state.detailKey) {
    const limit = Math.max(0, detailContent(state).length - (state.rows - 3));
    const scroll = Math.min(state.detailScroll, limit);
    if (action === "down" || action === "pagedown")
      return {
        ...state,
        detailScroll: Math.min(limit, scroll + (action === "pagedown" ? 8 : 1)),
      };
    if (action === "up" || action === "pageup")
      return {
        ...state,
        detailScroll: Math.max(0, scroll - (action === "pageup" ? 8 : 1)),
      };
    return state;
  }
  if (action === "g") return { ...state, chartsOpen: !state.chartsOpen };
  if (
    state.chartsOpen &&
    ["up", "down", "left", "right", "pageup", "pagedown", "enter"].includes(
      action,
    )
  )
    return state;
  if (["1", "2", "3"].includes(action))
    return {
      ...state,
      chart: Number(action),
      focus: 1,
      chartsOpen: state.chartsOpen || state.columns < 140 || state.rows < 30,
    };
  if (action === "tab") return { ...state, focus: 1 - state.focus };
  if (action.startsWith("/"))
    return {
      ...state,
      searching: true,
      chartsOpen: false,
      search: (state.search + action.slice(1)).slice(0, 256),
      pageCount: 1,
    };
  if (action === "t")
    return {
      ...state,
      range: cycle<TimeRange>(["1h", "24h", "7d"], state.range),
    };
  if (action === "p")
    return {
      ...state,
      provider: cycle<UiState["provider"]>(
        [undefined, "codex", "claude"],
        state.provider,
      ),
      pageCount: 1,
    };
  if (action === "j")
    return {
      ...state,
      project: cycle(
        [undefined, ...(state.statistics?.projects ?? [])],
        state.project,
      ),
      pageCount: 1,
    };
  if (action === "s")
    return {
      ...state,
      status: cycle<UiState["status"]>(
        [undefined, "working", "waiting", "idle"],
        state.status,
      ),
      pageCount: 1,
    };
  if (action === "b")
    return {
      ...state,
      dimension: cycle(
        ["project", "provider", "model"] as UiState["dimension"][],
        state.dimension,
      ),
    };
  if (action === "r")
    return {
      ...state,
      provider: undefined,
      project: undefined,
      status: undefined,
      search: "",
      pageCount: 1,
    };
  const visible = treeRows(state.agents, state.collapsed);
  const index = Math.max(
    0,
    visible.findIndex((r) => r.row.key === state.selectedKey),
  );
  const current = visible[index]?.row;
  if (
    action === "down" ||
    action === "up" ||
    action === "pagedown" ||
    action === "pageup"
  ) {
    const direction = action === "down" || action === "pagedown" ? 1 : -1;
    const next = Math.max(
      0,
      Math.min(
        visible.length - 1,
        index + direction * (action.startsWith("page") ? 10 : 1),
      ),
    );
    if (next === index && direction === 1 && state.nextCursor)
      return { ...state, pageCount: state.pageCount + 1 };
    return { ...state, selectedKey: visible[next]?.row.key };
  }
  if (action === "enter" && current)
    return {
      ...state,
      detailKey: current.key,
      detailScroll: 0,
    };
  if (action === "left" && current) {
    if (
      !state.collapsed.has(current.key) &&
      state.agents.some((r) => r.parentKey === current.key)
    )
      return {
        ...state,
        collapsed: new Set([...state.collapsed, current.key]),
      };
    if (current.parentKey) return { ...state, selectedKey: current.parentKey };
  }
  if (action === "right" && current) {
    const collapsed = new Set(state.collapsed);
    collapsed.delete(current.key);
    return { ...state, collapsed };
  }
  return state;
}

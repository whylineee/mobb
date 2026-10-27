import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type {
  AgentEvent,
  CollectorHealth,
  EventPage,
  Session,
  StateDelta,
  StateSnapshot,
} from "@agentwatch/shared";

type WatchState = {
  sessions: Record<string, Session>;
  revision: number;
  collectors: CollectorHealth[];
  selectedKey: string | null;
  events: AgentEvent[];
  nextCursor: string | null;
  connection: "connecting" | "online" | "offline" | "unauthorized";
  needsResync: boolean;
  syncVersion: number;
  applySnapshot: (snapshot: StateSnapshot) => void;
  applyDelta: (delta: StateDelta) => void;
  select: (key: string | null) => void;
  mergeHistory: (key: string, page: EventPage) => void;
  setConnection: (connection: WatchState["connection"]) => void;
};

const mergeEvents = (current: AgentEvent[], incoming: AgentEvent[]) => {
  const byId = new Map([...current, ...incoming].map((e) => [e.id, e]));
  return [...byId.values()]
    .sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id))
    .slice(0, 200);
};

export function createTelemetryStore() {
  return createStore<WatchState>((set, get) => ({
    sessions: {},
    revision: 0,
    collectors: [],
    selectedKey: null,
    events: [],
    nextCursor: null,
    connection: "connecting",
    needsResync: false,
    syncVersion: 0,
    applySnapshot(snapshot) {
      set((state) => {
        const sessions = Object.fromEntries(
          snapshot.sessions.map((s) => [s.key, s]),
        );
        if (
          state.selectedKey &&
          !sessions[state.selectedKey] &&
          state.sessions[state.selectedKey]
        )
          sessions[state.selectedKey] = state.sessions[state.selectedKey]!;
        return {
          sessions,
          revision: snapshot.revision,
          collectors: snapshot.collectors,
          connection: "online",
          needsResync: false,
          syncVersion: state.syncVersion + 1,
        };
      });
    },
    applyDelta(delta) {
      const state = get();
      if (delta.revision <= state.revision) return;
      if (delta.revision !== state.revision + 1) {
        set({ needsResync: true });
        return;
      }
      set((state) => {
        const sessions =
          delta.session || delta.removedKeys?.length
            ? { ...state.sessions }
            : state.sessions;
        if (delta.session) sessions[delta.session.key] = delta.session;
        for (const key of delta.removedKeys ?? [])
          if (key !== state.selectedKey) delete sessions[key];
        return {
          sessions,
          revision: delta.revision,
          collectors: delta.collectors ?? state.collectors,
          events:
            delta.event && delta.event.sessionKey === state.selectedKey
              ? mergeEvents(state.events, [delta.event])
              : state.events,
        };
      });
    },
    select(key) {
      if (get().selectedKey !== key)
        set({ selectedKey: key, events: [], nextCursor: null });
    },
    mergeHistory(key, page) {
      if (get().selectedKey === key)
        set((state) => ({
          events: mergeEvents(state.events, page.events),
          nextCursor: page.nextCursor,
        }));
    },
    setConnection(connection) {
      set({ connection });
    },
  }));
}

export const telemetryStore = createTelemetryStore();
export const useTelemetry = <T>(selector: (state: WatchState) => T) =>
  useStore(telemetryStore, selector);

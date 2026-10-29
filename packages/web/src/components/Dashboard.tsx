"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, Home, Columns3, ChartNoAxesCombined, Radio } from "lucide-react";
import { officeVisible } from "@agentwatch/shared";
import { bootstrapToken, connect } from "../lib/client";
import { telemetryStore, useTelemetry } from "../lib/store";
import { Login } from "./Login";
import { SessionList } from "./SessionList";
import SessionPanel from "./SessionPanel";
import {
  OfficePanel,
  TaskBoard,
  Statistics,
  SourceHealth,
} from "./OfficePanels";
import { BOARD_STATUSES, BOARD_LABELS, sessionOverview } from "../lib/overview";

const Office = dynamic(() => import("./Office"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading">
      <span className="loader" />
      Готуємо робочі місця…
    </div>
  ),
});
const connectionLabels = {
  connecting: "З’єднання…",
  online: "Підключено",
  offline: "Демон недоступний",
  unauthorized: "Потрібен локальний ключ",
};

export default function Dashboard() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(0);
  const [leftPanel, setLeftPanel] = useState<"agents" | "tasks" | null>(null);
  const [rightPanel, setRightPanel] = useState<"stats" | "sources" | null>(
    null,
  );
  const [panelTop, setPanelTop] = useState<"left" | "right">("left");
  const [resetId, setResetId] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reduced, setReduced] = useState(false);
  const selectionOpener = useRef<HTMLElement | null>(null);
  const selectionSide = useRef<"left" | "right">("left");
  const navigation = useRef<HTMLButtonElement | null>(null);
  const rightOpener = useRef<HTMLElement | null>(null);
  const leftOpener = useRef<HTMLElement | null>(null);
  const sessions = useTelemetry((s) => s.sessions);
  const collectors = useTelemetry((s) => s.collectors);
  const selectedKey = useTelemetry((s) => s.selectedKey);
  const connection = useTelemetry((s) => s.connection);
  const omittedSessions = useTelemetry((s) => s.omittedSessions);

  useEffect(() => {
    setToken(bootstrapToken());
    setNow(Date.now());
    setLeftPanel(
      new URLSearchParams(location.search).get("view") === "list"
        ? "agents"
        : null,
    );
    const viewport = matchMedia("(max-width: 1000px)");
    const updateViewport = () => setNarrow(viewport.matches);
    updateViewport();
    viewport.addEventListener("change", updateViewport);
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      viewport.removeEventListener("change", updateViewport);
      motion.removeEventListener("change", updateMotion);
    };
  }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void connect(token, controller.signal);
    return () => controller.abort();
  }, [token]);

  const visible = useMemo(
    () => Object.values(sessions).filter(officeVisible),
    [sessions],
  );
  const overview = useMemo(() => sessionOverview(sessions), [sessions]);
  const selected = selectedKey ? sessions[selectedKey] : undefined;
  const restoreFocus = (element: HTMLElement | null) =>
    requestAnimationFrame(() => {
      (element?.isConnected
        ? element
        : ((element?.id ? document.getElementById(element.id) : null) ??
          leftOpener.current ??
          navigation.current)
      )?.focus({
        preventScroll: true,
      });
    });
  const closeDetails = useCallback(() => {
    telemetryStore.getState().select(null);
    setPanelTop(selectionSide.current);
    restoreFocus(selectionOpener.current);
  }, []);
  const selectSession = useCallback(
    (key: string | null) => {
      if (!key) {
        closeDetails();
        return;
      }
      selectionSide.current = panelTop;
      selectionOpener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      telemetryStore.getState().select(key);
      setPanelTop("right");
    },
    [closeDetails, panelTop],
  );
  const closeLeft = useCallback(() => {
    setLeftPanel(unavailable ? "agents" : null);
    restoreFocus(leftOpener.current);
  }, [unavailable]);
  const closeRight = useCallback(() => {
    setRightPanel(null);
    restoreFocus(rightOpener.current);
  }, []);
  const fallback = useCallback(() => {
    setUnavailable(true);
    setLeftPanel("agents");
    setPanelTop("left");
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (selectedKey) closeDetails();
      else if (rightPanel && (panelTop === "right" || !leftPanel)) closeRight();
      else if (leftPanel) closeLeft();
      else if (rightPanel) closeRight();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [
    selectedKey,
    rightPanel,
    leftPanel,
    panelTop,
    closeDetails,
    closeLeft,
    closeRight,
  ]);
  const showLeft =
    !!leftPanel &&
    (!narrow || (!selected && (!rightPanel || panelTop === "left")));
  const showRight =
    !!rightPanel &&
    !selected &&
    (!narrow || !leftPanel || panelTop === "right");
  const insets = useMemo(
    () => ({
      left: narrow ? 14 : showLeft ? 640 : 80,
      right: narrow ? 14 : selected || showRight ? 456 : 80,
      top: narrow ? 190 : 48,
      bottom: narrow ? 160 : 100,
    }),
    [narrow, showLeft, showRight, !!selected],
  );
  const home = () => {
    telemetryStore.getState().select(null);
    setLeftPanel(unavailable ? "agents" : null);
    setRightPanel(null);
    setResetId((id) => id + 1);
  };
  const openLeft = (panel: "agents" | "tasks", button: HTMLButtonElement) => {
    leftOpener.current = button;
    if (narrow) telemetryStore.getState().select(null);
    setLeftPanel((current) =>
      current === panel && showLeft && !unavailable ? null : panel,
    );
    setPanelTop("left");
  };
  const openRight = (panel: "stats" | "sources", button: HTMLButtonElement) => {
    rightOpener.current = button;
    telemetryStore.getState().select(null);
    setRightPanel((current) => (current === panel && showRight ? null : panel));
    setPanelTop("right");
  };

  if (token === undefined)
    return (
      <div className="scene-loading full-loading">
        <span className="loader" />
        AgentWatch
      </div>
    );
  if (!token || connection === "unauthorized")
    return (
      <Login
        onToken={(value) => {
          telemetryStore.getState().setConnection("connecting");
          setToken(value);
        }}
      />
    );

  return (
    <main
      className={`office-screen ${reduced ? "reduced-motion" : ""}`}
      aria-label="Інтерактивний 3D-офіс"
    >
      <h1 className="sr-only">AgentWatch</h1>
      <p id="office-instructions" className="sr-only">
        Перетягуйте, щоб переміщуватися в межах офісу після наближення. Колесо
        миші змінює масштаб. На телефоні переміщуйте одним пальцем і наближайте
        двома. Кут огляду зафіксовано. Виберіть агента, щоб відкрити деталі. Для
        роботи з клавіатури відкрийте список сесій.
      </p>
      <div
        className="office-stage"
        data-testid="office-stage"
        aria-describedby="office-instructions"
      >
        {!unavailable && (
          <Office
            sessions={visible}
            allSessions={visible}
            selectedKey={selectedKey}
            labels
            reducedMotion={reduced}
            online={connection === "online"}
            onSelect={selectSession}
            onFallback={fallback}
            insets={insets}
            resetId={resetId}
          />
        )}
      </div>
      <nav
        className="office-rail office-rail-left"
        aria-label="Робочий простір"
      >
        <button
          title="Офіс"
          aria-label="Офіс"
          aria-pressed={!leftPanel && !rightPanel && !selected}
          onClick={home}
        >
          <Home size={20} />
        </button>
        <button
          ref={navigation}
          title="Агенти"
          aria-label="Список"
          aria-pressed={leftPanel === "agents" && showLeft}
          aria-expanded={leftPanel === "agents" && showLeft}
          aria-controls="office-sessions"
          onClick={(e) => openLeft("agents", e.currentTarget)}
        >
          <List size={20} />
        </button>
        <button
          title="Таскборд"
          aria-label="Таскборд"
          aria-pressed={leftPanel === "tasks" && showLeft}
          aria-expanded={leftPanel === "tasks" && showLeft}
          aria-controls="office-tasks"
          onClick={(e) => openLeft("tasks", e.currentTarget)}
        >
          <Columns3 size={20} />
          {visible.filter((session) => session.requiresAttention).length >
            0 && (
            <span
              className="attention-count"
              aria-label={`${visible.filter((session) => session.requiresAttention).length} потребують уваги`}
            >
              {visible.filter((session) => session.requiresAttention).length}
            </span>
          )}
        </button>
      </nav>
      <nav className="office-rail office-rail-right" aria-label="Моніторинг">
        <button
          title="Статистика"
          aria-label="Статистика"
          aria-pressed={rightPanel === "stats" && showRight}
          aria-expanded={rightPanel === "stats" && showRight}
          aria-controls="office-stats"
          onClick={(e) => openRight("stats", e.currentTarget)}
        >
          <ChartNoAxesCombined size={20} />
        </button>
        <button
          title="Стан джерел"
          aria-label="Стан джерел"
          aria-pressed={rightPanel === "sources" && showRight}
          aria-expanded={rightPanel === "sources" && showRight}
          aria-controls="office-sources"
          onClick={(e) => openRight("sources", e.currentTarget)}
        >
          <Radio size={20} />
        </button>
      </nav>
      {visible.length === 0 && !leftPanel && connection === "online" && (
        <div className="office-empty-note" role="status">
          <strong>Офіс поки порожній</strong>
          <span>
            Дайте задачу Claude Code або Codex — активна сесія з’явиться тут.
          </span>
        </div>
      )}
      <div className="office-status-strip" aria-label="Поточний стан офісу">
        {BOARD_STATUSES.map((status) => (
          <span key={status} data-testid={`count-${status}`}>
            <i className={`board-dot status-${status}`} />
            {overview.groups[status].length} <span>{BOARD_LABELS[status]}</span>
          </span>
        ))}
        <span className={`connection-state connection-${connection}`}>
          {connection === "connecting"
            ? "Підключення"
            : connectionLabels[connection]}
        </span>
      </div>
      {(connection !== "online" || omittedSessions > 0) && (
        <div className="office-notice" role="status">
          {connection === "offline"
            ? "З’єднання втрачено. Показано останні дані. Перепідключення автоматичне."
            : connection === "connecting"
              ? connectionLabels.connecting
              : null}
          {omittedSessions > 0 &&
            ` Показано ${Object.keys(sessions).length} сесій. Ще ${omittedSessions} збережено локально.`}
        </div>
      )}
      {showLeft && leftPanel === "agents" && (
        <OfficePanel
          id="office-sessions"
          title="Сесії агентів"
          side="left"
          onClose={closeLeft}
        >
          <p className="office-tool-note">
            Відкритих сесій: {overview.open.length}
          </p>
          {unavailable && (
            <p className="office-list-message" role="status">
              3D недоступне у цьому браузері. Сесії доступні у списку.
            </p>
          )}
          {overview.open.length ? (
            <SessionList
              sessions={overview.open}
              now={now}
              onSelect={selectSession}
            />
          ) : (
            <p className="office-list-message">
              Офіс поки порожній. Запустіть задачу в Claude Code або Codex.
            </p>
          )}
        </OfficePanel>
      )}
      {showLeft && leftPanel === "tasks" && (
        <OfficePanel
          id="office-tasks"
          title="Таскборд"
          side="left"
          onClose={closeLeft}
        >
          <TaskBoard
            overview={overview}
            now={now}
            selectedKey={selectedKey}
            onSelect={selectSession}
          />
        </OfficePanel>
      )}
      {showRight && (
        <OfficePanel
          id={`office-${rightPanel}`}
          title={rightPanel === "stats" ? "Статистика" : "Стан джерел"}
          side="right"
          onClose={closeRight}
        >
          {rightPanel === "stats" ? (
            <Statistics overview={overview} now={now} />
          ) : (
            <SourceHealth collectors={collectors} now={now} />
          )}
        </OfficePanel>
      )}
      {selected && (
        <SessionPanel
          key={selected.key}
          session={selected}
          token={token}
          onClose={closeDetails}
        />
      )}
    </main>
  );
}

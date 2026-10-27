"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Bot, Code2, List, LockKeyhole, X } from "lucide-react";
import { officeVisible, type Session } from "@agentwatch/shared";
import { bootstrapToken, connect, TOKEN_KEY } from "../lib/client";
import { telemetryStore, useTelemetry } from "../lib/store";
import { agentName, relativeTime, Status } from "./Status";
import SessionPanel from "./SessionPanel";

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

function Login({ onToken }: { onToken: (token: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand-mark">
          <Bot size={26} />
        </div>
        <h1>AgentWatch</h1>
        <p>Ваш локальний простір для спостереження за агентами.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) {
              sessionStorage.setItem(TOKEN_KEY, value.trim());
              onToken(value.trim());
            }
          }}
        >
          <label htmlFor="local-token">Локальний ключ</label>
          <input
            id="local-token"
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ключ із посилання у терміналі"
          />
          <button className="primary-button" type="submit">
            Відкрити офіс <ArrowUpRight size={16} />
          </button>
        </form>
        <p className="login-hint">
          Запустіть <code>pnpm agentwatch start</code> та відкрийте посилання з
          термінала.
        </p>
        <span className="privacy-note">
          <LockKeyhole size={12} /> Усе залишається на цьому Mac
        </span>
      </div>
    </div>
  );
}

function SessionList({ sessions, now }: { sessions: Session[]; now: number }) {
  const selected = useTelemetry((s) => s.selectedKey);
  return (
    <div className="session-list">
      <div className="list-header">
        <span>АГЕНТ / СЕСІЯ</span>
        <span>ПРОЄКТ І ЗАДАЧА</span>
        <span>СТАН</span>
      </div>
      {sessions.map((s) => (
        <button
          key={s.key}
          className={`session-row ${selected === s.key ? "selected" : ""}`}
          data-testid={`session-${s.key}`}
          onClick={() => telemetryStore.getState().select(s.key)}
        >
          <span className="row-identity">
            <span className={`agent-avatar avatar-${s.provider}`}>
              <Code2 size={19} />
            </span>
            <span>
              <strong>{agentName(s.provider)}</strong>
              <small className="mono">{s.sessionId.slice(0, 12)}</small>
            </span>
          </span>
          <span className="row-task">
            <strong>{s.project}</strong>
            <small>{s.task?.text.slice(0, 90) ?? "Задача поки невідома"}</small>
          </span>
          <span className="row-status">
            <Status session={s} />
            <small>{relativeTime(s.lastActivityAt, now)}</small>
          </span>
          <ArrowUpRight size={15} className="row-arrow" />
        </button>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(0);
  const [listOpen, setListOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reduced, setReduced] = useState(false);
  const sessions = useTelemetry((s) => s.sessions);
  const selectedKey = useTelemetry((s) => s.selectedKey);
  const connection = useTelemetry((s) => s.connection);
  const omittedSessions = useTelemetry((s) => s.omittedSessions);

  useEffect(() => {
    setToken(bootstrapToken());
    setNow(Date.now());
    setListOpen(new URLSearchParams(location.search).get("view") === "list");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(motion.matches);
    updateMotion();
    motion.addEventListener("change", updateMotion);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      motion.removeEventListener("change", updateMotion);
    };
  }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void connect(token, controller.signal);
    return () => controller.abort();
  }, [token]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !telemetryStore.getState().selectedKey &&
        !unavailable
      )
        setListOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [unavailable]);

  const visible = useMemo(
    () => Object.values(sessions).filter(officeVisible),
    [sessions],
  );
  const selected = selectedKey ? sessions[selectedKey] : undefined;
  const selectSession = useCallback(
    (key: string | null) => telemetryStore.getState().select(key),
    [],
  );
  const fallback = useCallback(() => {
    setUnavailable(true);
    setListOpen(true);
  }, []);

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
        Перетягуйте, щоб обертати офіс. Колесо миші змінює масштаб. Права кнопка
        миші переміщує камеру. На телефоні обертайте одним пальцем, переміщуйте
        й наближайте двома. Виберіть агента, щоб відкрити деталі. Для роботи з
        клавіатури відкрийте список сесій.
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
            onSelect={selectSession}
            onFallback={fallback}
          />
        )}
      </div>
      <button
        className="office-list-toggle"
        aria-label="Список"
        aria-pressed={listOpen}
        aria-expanded={listOpen}
        aria-controls="office-sessions"
        title="Список сесій"
        onClick={() => setListOpen((open) => unavailable || !open)}
      >
        <List size={19} />
      </button>
      {visible.length === 0 && !listOpen && connection === "online" && (
        <div className="office-empty-note" role="status">
          <strong>Офіс поки порожній</strong>
          <span>
            Дайте задачу Claude Code або Codex — активна сесія з’явиться тут.
          </span>
        </div>
      )}
      {(connection !== "online" || omittedSessions > 0) && (
        <div className="office-notice" role="status">
          {connection === "offline"
            ? "З’єднання втрачено. Показано останні дані. Перепідключення автоматичне."
            : connection === "connecting"
              ? connectionLabels.connecting
              : null}
          {omittedSessions > 0 &&
            ` Показано ${visible.length} сесій. Ще ${omittedSessions} збережено локально.`}
        </div>
      )}
      {listOpen && (
        <section
          id="office-sessions"
          className="office-sessions"
          aria-label="Сесії агентів"
        >
          <header>
            <h2>
              Сесії агентів <span>{visible.length}</span>
            </h2>
            {!unavailable && (
              <button
                aria-label="Закрити список"
                onClick={() => setListOpen(false)}
              >
                <X size={18} />
              </button>
            )}
          </header>
          {unavailable && (
            <p className="office-list-message" role="status">
              3D недоступне у цьому браузері. Сесії доступні у списку.
            </p>
          )}
          {visible.length ? (
            <SessionList sessions={visible} now={now} />
          ) : (
            <p className="office-list-message">
              Офіс поки порожній. Запустіть задачу в Claude Code або Codex.
            </p>
          )}
        </section>
      )}
      {selected && (
        <SessionPanel key={selected.key} session={selected} token={token} />
      )}
    </main>
  );
}

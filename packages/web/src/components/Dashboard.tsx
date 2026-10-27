"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  ChevronDown,
  CircleHelp,
  Code2,
  Coffee,
  Folder,
  LayoutGrid,
  List,
  LockKeyhole,
  Monitor,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Terminal,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { officeVisible, sessionStatus, type Session } from "@agentwatch/shared";
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
  const [token, setToken] = useState<string | null | undefined>(undefined),
    [now, setNow] = useState(0);
  const [view, setView] = useState<"office" | "list">("office"),
    [search, setSearch] = useState(""),
    [provider, setProvider] = useState("all"),
    [project, setProject] = useState("all");
  const [labels, setLabels] = useState(true),
    [reduced, setReduced] = useState(false),
    [diagnostics, setDiagnostics] = useState(false);
  const sessions = useTelemetry((s) => s.sessions),
    selectedKey = useTelemetry((s) => s.selectedKey),
    connection = useTelemetry((s) => s.connection),
    collectors = useTelemetry((s) => s.collectors);
  useEffect(() => {
    setToken(bootstrapToken());
    setNow(Date.now());
    if (new URLSearchParams(location.search).get("view") === "list")
      setView("list");
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(motion.matches);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void connect(token, controller.signal);
    return () => controller.abort();
  }, [token]);
  const allVisible = useMemo(
    () => Object.values(sessions).filter((s) => officeVisible(s, now)),
    [sessions, now],
  );
  const filtered = useMemo(
    () =>
      allVisible.filter(
        (s) =>
          (provider === "all" || s.provider === provider) &&
          (project === "all" || s.project === project) &&
          `${s.project} ${s.sessionId} ${s.task?.text ?? ""} ${s.provider}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [allVisible, provider, project, search],
  );
  const projects = useMemo(
    () => [...new Set(allVisible.map((s) => s.project))].sort(),
    [allVisible],
  );
  const selected = selectedKey ? sessions[selectedKey] : undefined;
  const selectSession = useCallback(
    (key: string | null) => telemetryStore.getState().select(key),
    [],
  );
  const fallback = useCallback(() => setView("list"), []);
  const counts = { working: 0, waiting: 0, idle: 0, unknown: 0, ended: 0 };
  for (const s of allVisible) counts[sessionStatus(s)]++;
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
    <div className={`app-shell ${reduced ? "reduced-motion" : ""}`}>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="AgentWatch головна">
          <span className="brand-mark">
            <Bot size={24} />
          </span>
          <span>
            <h1>AgentWatch</h1>
            <small>YOUR AGENTS, AT WORK</small>
          </span>
        </a>
        <div className="workspace-chip">
          <span className="workspace-icon">
            <Monitor size={17} />
          </span>
          <span>
            <strong>Мій робочий простір</strong>
            <small>Локальний Mac</small>
          </span>
          <span className="tiny-dot" />
        </div>
        <span className="nav-label">МОНІТОРИНГ</span>
        <nav aria-label="Основна навігація">
          <button
            className={view === "office" ? "nav-item active" : "nav-item"}
            onClick={() => setView("office")}
          >
            <LayoutGrid size={17} />
            Віртуальний офіс<span>{allVisible.length}</span>
          </button>
          <button
            className={view === "list" ? "nav-item active" : "nav-item"}
            onClick={() => setView("list")}
          >
            <List size={17} />
            Усі сесії<span>{allVisible.length}</span>
          </button>
        </nav>
        <div className="nav-section-head">
          <span className="nav-label">ПРОЄКТИ</span>
          <span className="project-count">{projects.length}</span>
        </div>
        <nav className="projects-nav" aria-label="Проєкти">
          <button
            className={`project-item ${project === "all" ? "active-project" : ""}`}
            onClick={() => setProject("all")}
          >
            <span className="project-dot" />
            Усі проєкти
          </button>
          {projects.map((p, i) => (
            <button
              key={p}
              className={`project-item ${project === p ? "active-project" : ""}`}
              onClick={() => setProject(p)}
            >
              <Folder
                size={15}
                style={{ color: ["#71bfa8", "#d7ab78", "#9392c7"][i % 3] }}
              />
              <span>{p}</span>
              <small>{allVisible.filter((s) => s.project === p).length}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-card">
            <ShieldCheck size={19} />
            <strong>Тільки на вашому Mac</strong>
            <p>
              Приватні сесії.
              <br />
              Жодних хмарних сервісів.
            </p>
            <span>
              <i />
              LOCAL FIRST
            </span>
          </div>
          <button
            className="nav-item diagnostic-toggle"
            onClick={() => setDiagnostics((v) => !v)}
          >
            <Settings2 size={16} />
            Стан джерел
            <CircleHelp size={14} />
          </button>
          <div className="sidebar-version">
            <span>AGENTWATCH</span>
            <span>v0.1.0</span>
          </div>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Робочий простір</span>
            <span>/</span>
            <strong>
              {view === "office" ? "Віртуальний офіс" : "Усі сесії"}
            </strong>
          </div>
          <div className={`connection connection-${connection}`}>
            {connection === "online" ? (
              <Radio size={13} />
            ) : (
              <WifiOff size={13} />
            )}
            <span>{connectionLabels[connection]}</span>
            <i />
          </div>
        </header>
        <div className={`workspace-body ${selected ? "has-panel" : ""}`}>
          <section className="workspace-content">
            <div className="intro">
              <div>
                <div className="eyebrow intro-eyebrow">
                  <span className="tiny-dot" />
                  LIVE WORKSPACE
                </div>
                <h2>
                  Ваші агенти, за роботою<span>.</span>
                </h2>
                <p>Усе, над чим вони працюють — в одному просторі.</p>
              </div>
              <span className="date-label">
                <span>СЬОГОДНІ</span>
                {now
                  ? new Date(now).toLocaleDateString("uk-UA", {
                      day: "numeric",
                      month: "long",
                    })
                  : ""}
              </span>
            </div>
            <div className="metrics">
              <div className="metric-card">
                <span className="metric-icon mint">
                  <Activity size={18} />
                </span>
                <div>
                  <span>Працюють</span>
                  <strong>{counts.working.toString().padStart(2, "0")}</strong>
                </div>
                <span className="metric-status">
                  <i className="working" />
                  LIVE
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-icon amber">
                  <Users size={18} />
                </span>
                <div>
                  <span>Потребують уваги</span>
                  <strong>{counts.waiting.toString().padStart(2, "0")}</strong>
                </div>
                {counts.waiting > 0 && (
                  <span className="attention-pill">ПЕРЕВІРТЕ</span>
                )}
              </div>
              <div className="metric-card">
                <span className="metric-icon blue">
                  <Coffee size={18} />
                </span>
                <div>
                  <span>Очікують запиту</span>
                  <strong>{counts.idle.toString().padStart(2, "0")}</strong>
                </div>
              </div>
              <div className="metric-card total-card">
                <span className="metric-icon gray">
                  <Bot size={18} />
                </span>
                <div>
                  <span>Сесій в офісі</span>
                  <strong>
                    {allVisible.length.toString().padStart(2, "0")}
                  </strong>
                </div>
              </div>
            </div>
            <div className="office-card">
              <div className="office-header">
                <div>
                  <span className="office-heading-icon">
                    <LayoutGrid size={16} />
                  </span>
                  <strong>
                    {view === "office" ? "Віртуальний офіс" : "Сесії агентів"}
                  </strong>
                  <span className="live-pill">
                    <i />
                    LIVE
                  </span>
                </div>
                <div
                  className="view-switch"
                  role="group"
                  aria-label="Режим перегляду"
                >
                  <button
                    aria-label="Офіс"
                    aria-pressed={view === "office"}
                    onClick={() => setView("office")}
                  >
                    <LayoutGrid size={14} />
                    <span>Офіс</span>
                  </button>
                  <button
                    aria-label="Список"
                    aria-pressed={view === "list"}
                    onClick={() => setView("list")}
                  >
                    <List size={15} />
                    <span>Список</span>
                  </button>
                </div>
              </div>
              <div className="office-filters">
                <label className="search-box">
                  <Search size={15} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Знайти сесію…"
                    aria-label="Знайти сесію"
                  />
                  <kbd>⌕</kbd>
                </label>
                <label className="provider-filter">
                  <Code2 size={14} />
                  <select
                    aria-label="Тип агента"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="all">Усі агенти</option>
                    <option value="codex">Codex</option>
                    <option value="claude">Claude Code</option>
                  </select>
                  <ChevronDown size={13} />
                </label>
                <span className="filter-count">
                  {filtered.length} {filtered.length === 1 ? "сесія" : "сесій"}
                </span>
              </div>
              <div
                className={`office-viewport ${view === "list" ? "list-viewport" : ""}`}
              >
                {view === "office" && (
                  <Office
                    sessions={filtered}
                    allSessions={allVisible}
                    selectedKey={selectedKey}
                    labels={labels}
                    reducedMotion={reduced}
                    onSelect={selectSession}
                    onFallback={fallback}
                  />
                )}
                {view === "list" && (
                  <SessionList sessions={filtered} now={now} />
                )}
                {filtered.length === 0 && (
                  <div className="empty-office">
                    <span className="empty-icon">
                      <Bot size={30} />
                    </span>
                    <h3>
                      {allVisible.length
                        ? "Сесій за цим фільтром немає"
                        : "Офіс поки порожній"}
                    </h3>
                    <p>
                      {allVisible.length
                        ? "Спробуйте інший запит або проєкт."
                        : "Запустіть Claude Code або Codex. Сесії з’являться тут автоматично."}
                    </p>
                    {!allVisible.length && (
                      <span className="empty-hint">
                        <Terminal size={12} />
                        Hooks + локальні транскрипти
                      </span>
                    )}
                  </div>
                )}
                {view === "office" && (
                  <div className="scene-options">
                    <button
                      className={labels ? "option-active" : ""}
                      onClick={() => setLabels((v) => !v)}
                      aria-pressed={labels}
                    >
                      Підписи
                    </button>
                    <span />
                    <button
                      className={reduced ? "option-active" : ""}
                      onClick={() => setReduced((v) => !v)}
                      aria-pressed={reduced}
                    >
                      Менше руху
                    </button>
                  </div>
                )}
              </div>
              <div className="office-legend">
                <div>
                  <span>
                    <i className="legend-dot dot-working" />
                    Працює
                  </span>
                  <span>
                    <i className="legend-dot dot-waiting" />
                    Потрібна увага
                  </span>
                  <span>
                    <i className="legend-dot dot-idle" />
                    Очікує
                  </span>
                  {counts.unknown > 0 && (
                    <span>
                      <i className="legend-dot dot-unknown" />
                      Невідомо: {counts.unknown}
                    </span>
                  )}
                </div>
                <span className="scene-tip">
                  {view === "office"
                    ? "Клік — деталі · Перетягування — огляд"
                    : "Виберіть сесію для деталей"}
                  <ArrowUpRight size={12} />
                </span>
              </div>
            </div>
            {connection === "offline" && (
              <div className="connection-banner">
                <WifiOff size={15} />
                <span>
                  З’єднання втрачено. Показано останні отримані дані;
                  перепідключення автоматичне.
                </span>
              </div>
            )}
            {diagnostics && (
              <div className="diagnostics">
                <strong>Стан джерел</strong>
                {collectors.length ? (
                  collectors.map((c) => (
                    <div key={c.id}>
                      <span
                        className={`legend-dot ${c.state === "ready" ? "dot-working" : "dot-waiting"}`}
                      />
                      <span>
                        <b>{c.id}</b>
                        {c.message}
                      </span>
                      {c.droppedEvents > 0 && (
                        <small>Втрачено: {c.droppedEvents}</small>
                      )}
                    </div>
                  ))
                ) : (
                  <p>Колектори ще не передали стан.</p>
                )}
              </div>
            )}
            <footer className="workspace-footer">
              <span>
                <LockKeyhole size={12} />
                Лише перегляд. Дані залишаються на цьому комп’ютері.
              </span>
              <span>
                <Wifi size={12} />
                127.0.0.1 <i />
                Локальне з’єднання
              </span>
            </footer>
          </section>
          {selected && (
            <SessionPanel key={selected.key} session={selected} token={token} />
          )}
        </div>
      </main>
    </div>
  );
}

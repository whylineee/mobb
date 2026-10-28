"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Code2,
  FileCode2,
  GitBranch,
  Info,
  Layers,
  Terminal,
  X,
} from "lucide-react";
import type { AgentEvent, Session } from "@agentwatch/shared";
import { useTelemetry, telemetryStore } from "../lib/store";
import { sessionEvents } from "../lib/client";
import { useSessionDetails } from "../lib/use-session-details";
import { agentName, relativeTime, Status } from "./Status";

const eventLabels: Record<AgentEvent["kind"], string> = {
  "session.start": "Сесію відкрито",
  "session.end": "Сесію завершено",
  "session.metadata": "Дані сесії",
  "turn.start": "Новий запит",
  "turn.end": "Відповідь завершено",
  "tool.start": "Виклик інструмента",
  "tool.end": "Результат інструмента",
  "permission.request": "Перевірка дозволу",
  attention: "Очікує вашої дії",
  "subagent.start": "Субагент почав роботу",
  "subagent.end": "Субагент завершив роботу",
  "process.observed": "Процес виявлено",
  "process.exit": "Процес завершився",
  error: "Помилка",
};
function Expandable({
  text,
  label,
  testId,
}: {
  text: string;
  label: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="expandable">
      <p
        className={open ? "expanded-text" : "preview-text"}
        data-testid={testId}
      >
        {open ? text : text.slice(0, 170) + (text.length > 170 ? "…" : "")}
      </p>
      {text.length > 170 && (
        <button
          className="text-button"
          aria-label={`Розгорнути ${label}`}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Згорнути" : "Показати повністю"}
          <ChevronDown size={13} className={open ? "rotate" : ""} />
        </button>
      )}
    </div>
  );
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button"
      aria-label="Скопіювати"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check size={14} /> : <Clipboard size={14} />}
    </button>
  );
}
function Field({
  name,
  value,
  mono = false,
}: {
  name: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="detail-field">
      <span>{name}</span>
      <span className={mono ? "mono" : ""}>{value ?? "Не визначено"}</span>
    </div>
  );
}
function TimelineEvent({ event }: { event: AgentEvent }) {
  const [open, setOpen] = useState(false),
    detail =
      event.data.task ??
      event.data.command ??
      event.data.path ??
      event.data.result ??
      event.data.error;
  return (
    <article
      className={`timeline-event ${event.data.error ? "event-error" : ""}`}
      data-testid="timeline-event"
    >
      <div className="timeline-dot">
        <span />
      </div>
      <div className="timeline-entry">
        <div className="timeline-heading">
          <strong>{event.data.toolName ?? eventLabels[event.kind]}</strong>
          <time>
            {new Date(event.occurredAt).toLocaleTimeString("uk-UA", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </time>
        </div>
        <p>
          {eventLabels[event.kind]}{" "}
          <span className="source-tag">{event.source}</span>
        </p>
        {detail && (
          <>
            <button
              className="event-preview"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
            >
              {open
                ? "Згорнути деталі"
                : detail.slice(0, 100) + (detail.length > 100 ? "…" : "")}
            </button>
            {open && <pre>{detail}</pre>}
          </>
        )}
        {event.data.truncated && (
          <small className="muted">
            Великий запис скорочено до локального ліміту.
          </small>
        )}
      </div>
    </article>
  );
}

export default function SessionPanel({
  session: summary,
  token,
  onClose,
}: {
  session: Session;
  token: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "activity" | "details">(
    "overview",
  );
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(false);
  const syncVersion = useTelemetry((s) => s.syncVersion),
    events = useTelemetry((s) => s.events),
    nextCursor = useTelemetry((s) => s.nextCursor);
  const session = useSessionDetails(summary, token, syncVersion);
  const close = onClose;
  const scroll = useRef<HTMLDivElement>(null),
    closeButton = useRef<HTMLButtonElement>(null);
  const following = useRef(true);
  const autoPosition = useRef<number | null>(null);
  const [followLive, setFollowLive] = useState(true);
  useLayoutEffect(() => {
    if (tab !== "activity" || !following.current || !scroll.current) return;
    const el = scroll.current;
    if (
      autoPosition.current !== null &&
      Math.abs(el.scrollTop - autoPosition.current) > 2
    ) {
      following.current = false;
      setFollowLive(false);
      return;
    }
    el.scrollTop = el.scrollHeight;
    autoPosition.current = el.scrollTop;
  }, [events, tab]);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setLoading(true);
    void sessionEvents(session.key, token, undefined, controller.signal)
      .then((page) => telemetryStore.getState().mergeHistory(session.key, page))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session.key, token, syncVersion]);
  const tool = session.activeTools[0] ?? session.lastTool;
  return (
    <aside
      className="session-panel"
      data-testid="session-panel"
      aria-label={`Сесія ${session.sessionId}`}
    >
      <div className="panel-top">
        <span className="eyebrow">ДЕТАЛІ СЕСІЇ</span>
        <button
          ref={closeButton}
          className="icon-button"
          aria-label="Закрити панель"
          onClick={close}
        >
          <X size={18} />
        </button>
      </div>
      <div className="panel-identity">
        <div className={`agent-avatar avatar-${session.provider}`}>
          <Code2 size={25} />
        </div>
        <div>
          <h2>{agentName(session.provider)}</h2>
          <span className="mono session-short-id">
            {session.sessionId.slice(0, 12)}
          </span>
        </div>
        <span className={`provider-pill ${session.provider}`}>
          {session.origin === "desktop"
            ? "DESKTOP"
            : session.origin === "cli"
              ? "CLI"
              : session.provider.toUpperCase()}
        </span>
      </div>
      <div className="panel-state">
        <Status session={session} panel />
        <span>{relativeTime(session.lastActivityAt)}</span>
      </div>
      <div className="panel-tabs" role="tablist" aria-label="Дані сесії">
        {(
          [
            ["overview", "Огляд"],
            ["activity", "Активність"],
            ["details", "Деталі"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              following.current = true;
              autoPosition.current = null;
              setFollowLive(true);
              setTab(key);
            }}
          >
            {label}
            {key === "activity" && events.length > 0 && (
              <small>{events.length}</small>
            )}
          </button>
        ))}
      </div>
      <div
        className="panel-scroll"
        ref={scroll}
        data-testid="activity-scroll"
        onScroll={(e) => {
          if (tab !== "activity") return;
          const el = e.currentTarget,
            nearBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 40;
          following.current = nearBottom;
          if (nearBottom) autoPosition.current = el.scrollTop;
          setFollowLive(nearBottom);
        }}
      >
        {tab === "overview" && (
          <>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <FileCode2 size={14} />
                  ПРОЄКТ
                </span>
              </div>
              <h3 className="project-title">{session.project}</h3>
              <p className="path-text mono">
                {session.cwd ?? "Робоча директорія недоступна"}
              </p>
              {session.gitBranch && (
                <span className="branch">
                  <GitBranch size={12} />
                  {session.gitBranch}
                </span>
              )}
            </div>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <Terminal size={14} />
                  ПОТОЧНА ЗАДАЧА
                </span>
                {session.task && <CopyButton text={session.task.text} />}
              </div>
              {session.task ? (
                <>
                  <Expandable
                    key={`${session.key}:${session.task.updatedAt}`}
                    text={session.task.text}
                    label="запит"
                    testId="task-text"
                  />
                  <span className="source-note">
                    Останній запит користувача · {session.task.source}
                  </span>
                </>
              ) : (
                <p className="empty-copy">
                  Задача поки невідома. Вона з’явиться, коли джерело передасть
                  запит.
                </p>
              )}
            </div>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <Activity size={14} />
                  {session.activeTools.length
                    ? "ЗАРАЗ ВИКОНУЄ"
                    : "ОСТАННІЙ ІНСТРУМЕНТ"}
                </span>
                {session.activeTools.length > 1 && (
                  <small>{session.activeTools.length} паралельно</small>
                )}
              </div>
              {tool ? (
                <div className="tool-stack">
                  {(session.activeTools.length
                    ? session.activeTools
                    : [tool]
                  ).map((t) => (
                    <div className="tool-card" key={t.id}>
                      <div>
                        <span className="tool-icon">
                          <Terminal size={15} />
                        </span>
                        <strong>{t.name}</strong>
                        {!t.endedAt && <span className="tool-live">LIVE</span>}
                      </div>
                      {(t.path ?? t.command) && (
                        <Expandable
                          text={t.path ?? t.command!}
                          label="команду"
                        />
                      )}
                      {t.result && (
                        <details>
                          <summary>Результат</summary>
                          <pre>{t.result}</pre>
                        </details>
                      )}
                      {t.error && <p className="error-text">{t.error}</p>}
                      {t.truncated && (
                        <small className="muted">Запис скорочено</small>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">Викликів інструментів ще немає.</p>
              )}
              {session.waitingReason === "approval_pending" &&
                !session.requiresAttention && (
                  <p className="hint">
                    <Info size={14} />
                    Дозвіл перевіряється. Очікування користувача ще не
                    підтверджено.
                  </p>
                )}
            </div>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <Layers size={14} />
                  СУБАГЕНТИ
                </span>
              </div>
              {session.subagents.length ? (
                session.subagents.map((a) => (
                  <div className="subagent" key={a.id}>
                    <span>
                      <Code2 size={16} />
                      {a.type ?? a.id}
                    </span>
                    {a.sessionKey && (
                      <button
                        className="text-button"
                        onClick={() =>
                          telemetryStore.getState().select(a.sessionKey!)
                        }
                      >
                        Відкрити <ArrowUpRight size={13} />
                      </button>
                    )}
                    <small>
                      {a.activity === "working" ? "Працює" : "Завершив задачу"}
                    </small>
                  </div>
                ))
              ) : (
                <p className="empty-copy">
                  Субагентів не виявлено або джерело не передає зв’язки.
                </p>
              )}
            </div>
          </>
        )}
        {tab === "activity" && (
          <div className="panel-section timeline-section">
            <div className="section-label">
              <span>
                <Clock3 size={14} />
                ХРОНОЛОГІЯ
              </span>
              <span className="live-caption">ОНОВЛЮЄТЬСЯ LIVE</span>
            </div>
            {loading && !events.length && (
              <p className="empty-copy">Завантаження подій…</p>
            )}
            {error && (
              <p className="error-text">
                Не вдалося отримати історію. Перевірте з’єднання.
              </p>
            )}
            {!events.length && !loading && (
              <p className="empty-copy">Подій поки немає.</p>
            )}
            {nextCursor && events.length < 200 && (
              <button
                className="secondary-button load-more"
                disabled={loading}
                onClick={() => {
                  following.current = false;
                  setFollowLive(false);
                  setLoading(true);
                  void sessionEvents(session.key, token, nextCursor)
                    .then((page) =>
                      telemetryStore.getState().mergeHistory(session.key, page),
                    )
                    .catch(() => setError(true))
                    .finally(() => setLoading(false));
                }}
              >
                Завантажити попередні події
              </button>
            )}
            {events.toReversed().map((e) => (
              <TimelineEvent key={e.id} event={e} />
            ))}
            {!followLive && (
              <button
                className="secondary-button load-more"
                onClick={() => {
                  following.current = true;
                  setFollowLive(true);
                  if (scroll.current) {
                    scroll.current.scrollTop = scroll.current.scrollHeight;
                    autoPosition.current = scroll.current.scrollTop;
                  }
                }}
              >
                До нових подій ↓
              </button>
            )}
            {events.length >= 200 && (
              <p className="source-note">
                Показано до 200 останніх завантажених подій.
              </p>
            )}
          </div>
        )}
        {tab === "details" && (
          <>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <Info size={14} />
                  СЕСІЯ ТА ДЖЕРЕЛА
                </span>
              </div>
              <Field name="Session ID" value={session.sessionId} mono />
              <Field name="Агент" value={agentName(session.provider)} />
              <Field name="Джерела" value={session.sources.join(", ")} />
              <Field
                name="Відкритість"
                value={
                  session.lifecycle === "open"
                    ? "Підтверджена"
                    : session.lifecycle === "ended"
                      ? "Завершена"
                      : "Не підтверджена"
                }
              />
              <Field
                name="Актуальність"
                value={
                  session.freshness === "fresh"
                    ? "Доступні дані"
                    : "Потребує перевірки"
                }
              />
              <Field
                name="Старт"
                value={
                  session.startedAt
                    ? new Date(session.startedAt).toLocaleString("uk-UA")
                    : undefined
                }
              />
              <Field
                name="Завершення"
                value={
                  session.endedAt
                    ? new Date(session.endedAt).toLocaleString("uk-UA")
                    : undefined
                }
              />
            </div>
            <div className="panel-section">
              <div className="section-label">
                <span>
                  <Terminal size={14} />
                  ПРОЦЕС
                </span>
              </div>
              <Field
                name="PID"
                value={
                  session.process ? String(session.process.pid) : undefined
                }
                mono
              />
              <Field
                name="CPU"
                value={
                  session.process?.cpuPercent !== undefined
                    ? `${session.process.cpuPercent.toFixed(1)} %`
                    : undefined
                }
              />
              <Field
                name="Пам’ять"
                value={
                  session.process?.memoryBytes !== undefined
                    ? `${(session.process.memoryBytes / 1024 / 1024).toFixed(1)} MB`
                    : undefined
                }
              />
              {!session.process && (
                <p className="hint">
                  <Info size={14} />
                  Метрики доступні лише за точного зіставлення процесу з цією
                  сесією.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <div className="panel-footer">
        <span className="tiny-dot" />
        Лише перегляд · дані на цьому Mac
      </div>
    </aside>
  );
}

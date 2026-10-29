import { useEffect, useRef, type ReactNode } from "react";
import type { CollectorHealth } from "@agentwatch/shared";
import { X } from "lucide-react";
import {
  BOARD_LABELS,
  BOARD_STATUSES,
  sessionOverview,
  turnDuration,
} from "../lib/overview";
import { agentName, relativeTime } from "./Status";

export type Overview = ReturnType<typeof sessionOverview>;

export function OfficePanel({
  id,
  title,
  side,
  onClose,
  children,
}: {
  id: string;
  title: string;
  side: "left" | "right";
  onClose: () => void;
  children: ReactNode;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus({ preventScroll: true });
  }, []);
  return (
    <section
      id={id}
      className={`office-tool-panel tool-panel-${side}`}
      aria-label={title}
    >
      <header>
        <h2>{title}</h2>
        <button
          ref={closeButton}
          aria-label={
            id === "office-sessions" ? "Закрити список" : `Закрити: ${title}`
          }
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="office-tool-content">{children}</div>
    </section>
  );
}

export function TaskBoard({
  overview,
  now,
  selectedKey,
  onSelect,
}: {
  overview: Overview;
  now: number;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="task-board" data-testid="task-board">
      {!overview.open.length && (
        <p className="office-tool-note">
          Відкритих сесій поки немає. Дайте задачу Claude Code або Codex.
        </p>
      )}
      {BOARD_STATUSES.map((status) => (
        <section
          className="task-column"
          key={status}
          data-testid={`tasks-${status}`}
          aria-label={BOARD_LABELS[status]}
        >
          <h3>
            <i className={`board-dot status-${status}`} />
            {BOARD_LABELS[status]} <span>{overview.groups[status].length}</span>
          </h3>
          {overview.groups[status].map((session) => (
            <button
              className={`task-card ${selectedKey === session.key ? "selected" : ""}`}
              key={session.key}
              id={`task-${session.key}`}
              data-testid={`task-${session.key}`}
              onClick={() => onSelect(session.key)}
            >
              <span className="task-card-agent">
                {agentName(session.provider)}{" "}
                <small>{session.sessionId.slice(0, 12)}</small>
              </span>
              <strong>{session.project}</strong>
              <span className="task-card-text">
                {session.task?.text || "Задача поки невідома"}
              </span>
              <small>
                Оновлено {relativeTime(session.lastActivityAt, now)}
              </small>
            </button>
          ))}
          {!overview.groups[status].length && (
            <p className="task-column-empty">Немає сесій</p>
          )}
        </section>
      ))}
    </div>
  );
}

export function Statistics({
  overview,
  now,
}: {
  overview: Overview;
  now: number;
}) {
  return (
    <div className="office-statistics">
      <p className="office-tool-note">
        Підтверджено відкриті сесії:{" "}
        <strong data-testid="open-session-count">{overview.open.length}</strong>
      </p>
      <dl className="office-stat-totals">
        {BOARD_STATUSES.map((status) => (
          <div key={status}>
            <dt>{BOARD_LABELS[status]}</dt>
            <dd>{overview.groups[status].length}</dd>
          </div>
        ))}
        <div>
          <dt>Codex</dt>
          <dd>{overview.providers.codex}</dd>
        </div>
        <div>
          <dt>Claude Code</dt>
          <dd>{overview.providers.claude}</dd>
        </div>
      </dl>
      <h3>Поточні ходи й процеси</h3>
      {!overview.open.length && (
        <p className="office-tool-note">Немає відкритих сесій.</p>
      )}
      {overview.open.map((session) => (
        <section className="session-metrics" key={session.key}>
          <h4>
            {agentName(session.provider)}{" "}
            <small>{session.sessionId.slice(0, 12)}</small>
          </h4>
          <p>{session.project}</p>
          <dl className="office-stat-totals">
            <div>
              <dt>Поточний хід</dt>
              <dd>{turnDuration(session, now)}</dd>
            </div>
            <div>
              <dt>CPU</dt>
              <dd>
                {session.process?.cpuPercent === undefined
                  ? "Недоступно"
                  : `${session.process.cpuPercent.toFixed(1)} %`}
              </dd>
            </div>
            <div>
              <dt>RAM</dt>
              <dd>
                {session.process?.memoryBytes === undefined
                  ? "Недоступно"
                  : `${(session.process.memoryBytes / 1024 / 1024).toFixed(1)} MB`}
              </dd>
            </div>
          </dl>
        </section>
      ))}
      <p className="office-tool-note">
        Метрики процесу доступні лише за підтвердженого зіставлення із сесією.
      </p>
    </div>
  );
}

export function SourceHealth({
  collectors,
  now,
}: {
  collectors: CollectorHealth[];
  now: number;
}) {
  return (
    <div className="source-health">
      {!collectors.length && (
        <p className="office-tool-note">Дані про джерела поки недоступні.</p>
      )}
      {collectors.map((collector) => (
        <section className="collector-health" key={collector.id}>
          <h3>
            {collector.id}{" "}
            <span className={`collector-state collector-${collector.state}`}>
              {
                {
                  ready:
                    collector.id.endsWith("-hooks") &&
                    collector.lastEventAt !== undefined
                      ? "Сигнал отримано"
                      : "Готове",
                  unavailable: "Недоступне",
                  error: "Помилка",
                }[collector.state]
              }
            </span>
          </h3>
          <p>{collector.message}</p>
          <dl className="office-stat-totals">
            {!(
              collector.id.endsWith("-hooks") &&
              collector.lastEventAt !== undefined
            ) && (
              <div>
                <dt>Перевірено</dt>
                <dd>{relativeTime(collector.lastCheckedAt, now)}</dd>
              </div>
            )}
            <div>
              <dt>Останній сигнал</dt>
              <dd>
                {collector.lastEventAt === undefined
                  ? "Недоступно"
                  : relativeTime(collector.lastEventAt, now)}
              </dd>
            </div>
            {!(
              collector.id.endsWith("-hooks") &&
              collector.lastEventAt !== undefined
            ) && (
              <div>
                <dt>Пропущено подій</dt>
                <dd>{collector.droppedEvents ?? "Недоступно"}</dd>
              </div>
            )}
          </dl>
        </section>
      ))}
    </div>
  );
}

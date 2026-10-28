"use client";
import { useState } from "react";
import { Clock3 } from "lucide-react";
import type { AgentEvent } from "@agentwatch/shared";
const eventLabels: Record<AgentEvent["kind"], string> = {
  usage: "Використання токенів",
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

export function SessionActivity({
  events,
  loading,
  error,
  nextCursor,
  followLive,
  onLoadMore,
  onFollowLive,
}: {
  events: AgentEvent[];
  loading: boolean;
  error: boolean;
  nextCursor: string | null;
  followLive: boolean;
  onLoadMore: () => void;
  onFollowLive: () => void;
}) {
  return (
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
          onClick={onLoadMore}
        >
          Завантажити попередні події
        </button>
      )}
      {events.toReversed().map((e) => (
        <TimelineEvent key={e.id} event={e} />
      ))}
      {!followLive && (
        <button className="secondary-button load-more" onClick={onFollowLive}>
          До нових подій ↓
        </button>
      )}
      {events.length >= 200 && (
        <p className="source-note">
          Показано до 200 останніх завантажених подій.
        </p>
      )}
    </div>
  );
}

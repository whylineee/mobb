"use client";
import { Info, Terminal } from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { agentName } from "../Status";
import { Field } from "./elements";
export function SessionDetails({ session }: { session: Session }) {
  return (
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
          value={session.process ? String(session.process.pid) : undefined}
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
            Метрики доступні лише за точного зіставлення процесу з цією сесією.
          </p>
        )}
      </div>
    </>
  );
}

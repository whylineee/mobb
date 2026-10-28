"use client";
import { ArrowUpRight, Code2 } from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { useTelemetry } from "../lib/store";
import { agentName, relativeTime, Status } from "./Status";
export function SessionList({
  sessions,
  now,
  onSelect,
}: {
  sessions: Session[];
  now: number;
  onSelect: (key: string) => void;
}) {
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
          id={`session-${s.key}`}
          data-testid={`session-${s.key}`}
          onClick={() => onSelect(s.key)}
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

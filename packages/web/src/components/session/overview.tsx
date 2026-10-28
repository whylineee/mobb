"use client";
import {
  Activity,
  ArrowUpRight,
  Code2,
  FileCode2,
  GitBranch,
  Info,
  Layers,
  Terminal,
} from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { telemetryStore } from "../../lib/store";
import { CopyButton, Expandable } from "./elements";
export function SessionOverview({ session }: { session: Session }) {
  const tool = session.activeTools[0] ?? session.lastTool;
  return (
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
            Задача поки невідома. Вона з’явиться, коли джерело передасть запит.
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
            {(session.activeTools.length ? session.activeTools : [tool]).map(
              (t) => (
                <div className="tool-card" key={t.id}>
                  <div>
                    <span className="tool-icon">
                      <Terminal size={15} />
                    </span>
                    <strong>{t.name}</strong>
                    {!t.endedAt && <span className="tool-live">LIVE</span>}
                  </div>
                  {(t.path ?? t.command) && (
                    <Expandable text={t.path ?? t.command!} label="команду" />
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
              ),
            )}
          </div>
        ) : (
          <p className="empty-copy">Викликів інструментів ще немає.</p>
        )}
        {session.waitingReason === "approval_pending" &&
          !session.requiresAttention && (
            <p className="hint">
              <Info size={14} />
              Дозвіл перевіряється. Очікування користувача ще не підтверджено.
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
  );
}

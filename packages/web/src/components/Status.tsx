import { sessionStatus, type Session } from "@agentwatch/shared";

export const STATUS_LABELS = {
  working: "Працює",
  waiting: "Потрібна увага",
  idle: "Очікує запиту",
  ended: "Завершено",
  unknown: "Стан невідомий",
};
export function Status({
  session,
  panel = false,
}: {
  session: Session;
  panel?: boolean;
}) {
  const status = sessionStatus(session);
  return (
    <span className={`status status-${status}`}>
      <i aria-hidden="true" />
      <span data-testid={panel ? "panel-status" : undefined}>
        {STATUS_LABELS[status]}
      </span>
    </span>
  );
}
export function agentName(provider: Session["provider"]) {
  return provider === "codex" ? "Codex" : "Claude Code";
}
export function relativeTime(time: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 10) return "щойно";
  if (seconds < 60) return `${seconds} с тому`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} хв тому`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} год тому`;
  return `${Math.floor(seconds / 86400)} дн тому`;
}

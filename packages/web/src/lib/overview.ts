import { sessionStatus, type Session } from "@agentwatch/shared";

export const BOARD_STATUSES = [
  "working",
  "waiting",
  "idle",
  "unknown",
] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];
export const BOARD_LABELS: Record<BoardStatus, string> = {
  working: "Працюють",
  waiting: "Потрібна увага",
  idle: "Очікують запиту",
  unknown: "Стан невідомий",
};

export function sessionOverview(sessions: Record<string, Session>) {
  const open = Object.values(sessions)
    .filter((session) => session.lifecycle === "open")
    .sort(
      (a, b) =>
        b.lastActivityAt - a.lastActivityAt || a.key.localeCompare(b.key),
    );
  const groups = Object.fromEntries(
    BOARD_STATUSES.map((status) => [status, [] as Session[]]),
  ) as Record<BoardStatus, Session[]>;
  for (const session of open) {
    const status = sessionStatus(session);
    if (status !== "ended") groups[status].push(session);
  }
  return {
    open,
    groups,
    providers: {
      codex: open.filter((session) => session.provider === "codex").length,
      claude: open.filter((session) => session.provider === "claude").length,
    },
  };
}

export function turnDuration(session: Session, now: number) {
  if (
    sessionStatus(session) !== "working" ||
    session.turnStartedAt === undefined
  )
    return "Недоступно";
  const seconds = Math.max(0, Math.floor((now - session.turnStartedAt) / 1000));
  return seconds < 60
    ? `${seconds} с`
    : `${Math.floor(seconds / 60)} хв ${seconds % 60} с`;
}

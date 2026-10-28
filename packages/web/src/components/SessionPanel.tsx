"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Code2, X } from "lucide-react";
import type { Session } from "@agentwatch/shared";
import { useTelemetry, telemetryStore } from "../lib/store";
import { sessionEvents } from "../lib/client";
import { useSessionDetails } from "../lib/use-session-details";
import { agentName, relativeTime, Status } from "./Status";
import { SessionOverview } from "./session/overview";
import { SessionActivity } from "./session/activity";
import { SessionDetails } from "./session/details";
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
        {tab === "overview" && <SessionOverview session={session} />}
        {tab === "activity" && (
          <SessionActivity
            events={events}
            loading={loading}
            error={error}
            nextCursor={nextCursor}
            followLive={followLive}
            onLoadMore={() => {
              following.current = false;
              setFollowLive(false);
              setLoading(true);
              void sessionEvents(session.key, token, nextCursor!)
                .then((page) =>
                  telemetryStore.getState().mergeHistory(session.key, page),
                )
                .catch(() => setError(true))
                .finally(() => setLoading(false));
            }}
            onFollowLive={() => {
              following.current = true;
              setFollowLive(true);
              if (scroll.current) {
                scroll.current.scrollTop = scroll.current.scrollHeight;
                autoPosition.current = scroll.current.scrollTop;
              }
            }}
          />
        )}
        {tab === "details" && <SessionDetails session={session} />}
      </div>
      <div className="panel-footer">
        <span className="tiny-dot" />
        Лише перегляд · дані на цьому Mac
      </div>
    </aside>
  );
}

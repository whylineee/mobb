"use client";
import { useEffect, useState } from "react";
import type { Session } from "@agentwatch/shared";
import { sessionDetails } from "./client";
import { mergeDetails } from "./details";

export function useSessionDetails(
  summary: Session,
  token: string,
  syncVersion: number,
): Session {
  const [full, setFull] = useState<Session | null>(null);
  // Old servers/persisted fixtures use the original stream watermark.
  const version =
    summary.detailsRevision ??
    summary.revision ??
    `${summary.stateAt}:${summary.lastObservedAt}`;
  useEffect(() => {
    const controller = new AbortController();
    void sessionDetails(summary.key, token, controller.signal)
      .then((details) => {
        if (!controller.signal.aborted) setFull(details);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [summary.key, version, token, syncVersion]);
  return mergeDetails(summary, full);
}

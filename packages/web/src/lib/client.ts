import { createParser } from "eventsource-parser";
import type {
  EventPage,
  Session,
  StateDelta,
  StateSnapshot,
} from "@agentwatch/shared";
import { telemetryStore } from "./store";

export const TOKEN_KEY = "agentwatch.local-token";
export function bootstrapToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1)),
    token = params.get("token");
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return token ?? sessionStorage.getItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  token: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
    cache: "no-store",
  });
  if (response.status === 401) {
    telemetryStore.getState().setConnection("unauthorized");
    throw new Error("unauthorized");
  }
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export const sessionEvents = (
  key: string,
  token: string,
  cursor?: string,
  signal?: AbortSignal,
) =>
  api<EventPage>(
    `/api/sessions/${encodeURIComponent(key)}/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    token,
    signal,
  );
export const sessionDetails = (
  key: string,
  token: string,
  signal?: AbortSignal,
) => api<Session>(`/api/sessions/${encodeURIComponent(key)}`, token, signal);

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      window.removeEventListener("online", done);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    window.addEventListener("online", done, { once: true });
  });
}

export async function connect(
  token: string,
  signal: AbortSignal,
): Promise<void> {
  let backoff = 300;
  while (!signal.aborted) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch("/api/stream", {
        headers: { Authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      });
      if (response.status === 401) {
        telemetryStore.getState().setConnection("unauthorized");
        return;
      }
      if (!response.ok || !response.body)
        throw new Error("Connection unavailable");
      const parser = createParser({
        maxBufferSize: 4 * 1024 * 1024,
        onEvent(message) {
          if (message.event === "snapshot") {
            const snapshot = JSON.parse(message.data) as StateSnapshot;
            if (
              !Array.isArray(snapshot.sessions) ||
              !Number.isSafeInteger(snapshot.revision)
            )
              throw new Error("Invalid snapshot");
            telemetryStore.getState().applySnapshot(snapshot);
            backoff = 300;
          } else if (message.event === "delta") {
            telemetryStore
              .getState()
              .applyDelta(JSON.parse(message.data) as StateDelta);
            if (telemetryStore.getState().needsResync)
              throw new Error("Revision gap");
          }
        },
      });
      const decoder = new TextDecoder();
      reader = response.body.getReader();
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
    } catch {
      /* reconnect with a complete snapshot */
    } finally {
      await reader?.cancel().catch(() => {});
    }
    if (signal.aborted) return;
    telemetryStore.getState().setConnection("offline");
    await wait(backoff, signal);
    backoff = Math.min(8000, backoff * 2);
  }
}

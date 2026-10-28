import { createParser } from "eventsource-parser";
import { setTimeout as delay } from "node:timers/promises";
import type {
  AgentPage,
  AgentQuery,
  EventPage,
  Session,
  Statistics,
} from "@agentwatch/shared";
export type ConnectionOptions = { baseUrl: string; token: string };
export class TuiClient {
  constructor(private options: ConnectionOptions) {}
  private async request<T>(path: string, signal: AbortSignal): Promise<T> {
    const response = await fetch(`${this.options.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.options.token}` },
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (response.status === 401)
      throw new Error("Ключ недійсний. Перезапустіть TUI.");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  async load(
    query: AgentQuery,
    pages: number,
    signal: AbortSignal,
  ): Promise<{ statistics: Statistics; page: AgentPage }> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== "") params.set(k, String(v));
    const statsParams = new URLSearchParams(params);
    statsParams.delete("status");
    statsParams.delete("search");
    const statistics = this.request<Statistics>(
      `/api/statistics?${statsParams}`,
      signal,
    );
    const agents = async () => {
      let page: AgentPage = {
        agents: [],
        ancestors: [],
        total: 0,
        nextCursor: null,
      };
      for (let i = 0; i < pages; i++) {
        if (page.nextCursor) params.set("cursor", page.nextCursor);
        const next = await this.request<AgentPage>(
          `/api/agents?${params}`,
          signal,
        );
        page = {
          ...next,
          agents: [...page.agents, ...next.agents],
          ancestors: [...page.ancestors, ...next.ancestors],
        };
        if (!next.nextCursor) break;
      }
      const own = new Set(page.agents.map((r) => r.key));
      page.ancestors = [
        ...new Map(
          page.ancestors.filter((r) => !own.has(r.key)).map((r) => [r.key, r]),
        ).values(),
      ];
      return page;
    };
    const [stats, page] = await Promise.all([statistics, agents()]);
    return { statistics: stats, page };
  }
  async details(key: string, signal: AbortSignal) {
    const path = `/api/sessions/${encodeURIComponent(key)}`;
    const [session, events] = await Promise.all([
      this.request<Session>(path, signal),
      this.request<EventPage>(`${path}/events`, signal),
    ]);
    return { session, events };
  }
  async watch(signal: AbortSignal, invalidate: () => void): Promise<void> {
    let backoff = 300;
    while (!signal.aborted) {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await fetch(`${this.options.baseUrl}/api/stream`, {
          headers: { Authorization: `Bearer ${this.options.token}` },
          signal: AbortSignal.any([signal, AbortSignal.timeout(35_000)]),
        });
        if (response.status === 401) return;
        if (!response.ok || !response.body) throw new Error("SSE unavailable");
        const parser = createParser({
          maxBufferSize: 4 * 1024 * 1024,
          onEvent: (event) => {
            if (event.event === "snapshot" || event.event === "delta") {
              invalidate();
              backoff = 300;
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
        /* HTTP polling preserves state while SSE reconnects. */
      } finally {
        await reader?.cancel().catch(() => {});
      }
      if (!signal.aborted)
        await delay(backoff, undefined, { signal }).catch(() => {});
      backoff = Math.min(8000, backoff * 2);
    }
  }
}

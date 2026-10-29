import { expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { setTimeout as realDelay } from "node:timers/promises";
import { TuiClient } from "./client.js";
it("loads paginated agents and coalesces ancestor context", async () => {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url!);
    expect(req.headers.authorization).toBe("Bearer local-test");
    res.setHeader("Content-Type", "application/json");
    if (req.url!.startsWith("/api/statistics"))
      res.end(JSON.stringify({ counts: { total: 201 } }));
    else {
      const cursor = new URL(req.url!, "http://localhost").searchParams.get(
        "cursor",
      );
      res.end(
        JSON.stringify({
          agents: [{ key: cursor ? "child" : "parent" }],
          ancestors: cursor ? [{ key: "parent" }] : [],
          total: 2,
          nextCursor: cursor ? null : "next",
        }),
      );
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const address = server.address() as { port: number };
    const client = new TuiClient({
      baseUrl: `http://127.0.0.1:${address.port}`,
      token: "local-test",
    });
    const result = await client.load(
      { range: "24h", project: "work space" },
      2,
      new AbortController().signal,
    );
    expect(result.page.agents.map((r) => r.key)).toEqual(["parent", "child"]);
    expect(result.page.ancestors).toEqual([]);
    expect(requests.some((r) => r.includes("project=work+space"))).toBe(true);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
it("keeps a stream alive with heartbeats and reconnects only after inactivity", async () => {
  vi.useFakeTimers();
  let stream: ReadableStreamDefaultController<Uint8Array> | undefined;
  let disconnected = 0;
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) => {
      const signal = init?.signal as AbortSignal;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller;
          signal.addEventListener(
            "abort",
            () => {
              disconnected++;
              controller.error(new Error("aborted"));
            },
            { once: true },
          );
        },
      });
      return new Response(body, { status: 200 });
    });
  const abort = new AbortController();
  try {
    const client = new TuiClient({
      baseUrl: "http://127.0.0.1:1234",
      token: "test",
    });
    const watch = client.watch(abort.signal, () => {});
    await vi.advanceTimersByTimeAsync(20_000);
    stream!.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(disconnected).toBe(0);
    stream!.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
    await vi.advanceTimersByTimeAsync(35_301);
    expect(disconnected).toBe(1);
    await realDelay(400);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    abort.abort();
    await watch;
  } finally {
    abort.abort();
    fetchMock.mockRestore();
    vi.useRealTimers();
  }
});

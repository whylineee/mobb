import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  HookEnvelopeSchema,
  MAX_HOOK_BYTES,
  ProviderSchema,
  type RuntimeConfig,
} from "@agentwatch/shared";
import { AgentService } from "./service.js";
import { normalizeHook } from "./telemetry/providers.js";

const tokenEqual = (a: string, b: string) => {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
};

export function createApp(options: {
  config: RuntimeConfig;
  service: AgentService;
  webRoot?: string;
  onHook?: (
    provider: string,
    payload: unknown,
    ancestors?: { pid: number; startedAt: number }[],
  ) => void;
}) {
  const { config, service } = options,
    app = new Hono();
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url),
      expectedHost = `127.0.0.1:${config.port}`;
    const host = c.req.header("host") ?? url.host;
    if (host !== expectedHost || url.hostname !== "127.0.0.1")
      return c.json({ error: "Local host required" }, 403);
    const origin = c.req.header("origin");
    if (origin && origin !== `http://${expectedHost}`)
      return c.json({ error: "Origin rejected" }, 403);
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "no-referrer");
    c.header("X-Frame-Options", "DENY");
    await next();
  });
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const token = c.req.header("authorization")?.replace(/^Bearer /, "") ?? "";
    const expected = c.req.path.startsWith("/api/hooks/")
      ? config.hookToken
      : config.uiToken;
    if (!tokenEqual(token, expected))
      return c.json({ error: "Authentication required" }, 401);
    await next();
  });
  app.use(
    "/api/hooks/*",
    bodyLimit({
      maxSize: MAX_HOOK_BYTES,
      onError: (c) => c.json({ error: "Payload too large" }, 413),
    }),
  );
  app.get("/api/state", (c) => c.json(service.snapshot()));
  app.get("/api/sessions/:id/events", (c) => {
    const cursor = c.req.query("cursor"),
      limit = Number(c.req.query("limit") ?? 50);
    if (
      (cursor && !/^[1-9]\d{0,15}$/.test(cursor)) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return c.json({ error: "Invalid pagination" }, 400);
    return c.json(service.events(c.req.param("id"), cursor, limit));
  });
  app.get("/api/sessions/:id", (c) => {
    const session = service.get(c.req.param("id"));
    return session
      ? c.json(session)
      : c.json({ error: "Session not found" }, 404);
  });
  app.post("/api/hooks/:provider", async (c) => {
    const provider = ProviderSchema.safeParse(c.req.param("provider"));
    if (!provider.success)
      return c.json({ error: "Unsupported provider" }, 400);
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const envelope = HookEnvelopeSchema.safeParse(raw);
    if (!envelope.success)
      return c.json({ error: "Invalid hook envelope" }, 400);
    const { payload, eventId, occurredAt, ancestors } = envelope.data;
    const now = Date.now();
    if (Math.abs(occurredAt - now) > 86_400_000)
      return c.json({ error: "Invalid event time" }, 400);
    const events = normalizeHook(provider.data, payload, {
      id: eventId,
      occurredAt,
      observedAt: now,
    });
    for (const event of events) service.ingest(event);
    options.onHook?.(provider.data, payload, ancestors);
    return c.json({ accepted: events.length }, 202);
  });
  app.get("/api/stream", (c) => {
    const encoder = new TextEncoder();
    let off: (() => void) | undefined,
      timer: ReturnType<typeof setInterval> | undefined,
      ended = false;
    const stop = () => {
      if (ended) return;
      ended = true;
      off?.();
      if (timer) clearInterval(timer);
    };
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          const push = (text: string) => {
            if (ended) return;
            const bytes = encoder.encode(text);
            if ((controller.desiredSize ?? 0) < bytes.byteLength) {
              stop();
              controller.error(
                new Error("Slow consumer; reconnect for a fresh snapshot"),
              );
              return;
            }
            controller.enqueue(bytes);
          };
          off = service.subscribe((message) =>
            push(
              `id: ${message.data.revision}\nevent: ${message.type}\ndata: ${JSON.stringify(message.data)}\n\n`,
            ),
          );
          if (ended) off();
          else {
            timer = setInterval(() => push(": heartbeat\n\n"), 15_000);
            timer.unref();
          }
          c.req.raw.signal.addEventListener(
            "abort",
            () => {
              stop();
              try {
                controller.close();
              } catch {
                /* already cancelled */
              }
            },
            { once: true },
          );
        },
        cancel: stop,
      },
      { highWaterMark: 4 * 1024 * 1024, size: (chunk) => chunk.byteLength },
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        Connection: "keep-alive",
      },
    });
  });
  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
  if (options.webRoot) {
    app.use("/*", serveStatic({ root: options.webRoot }));
    app.get("/", serveStatic({ root: options.webRoot, path: "index.html" }));
  }
  app.notFound((c) =>
    c.json(
      { error: "Not found. Build the web interface with pnpm build." },
      404,
    ),
  );
  app.onError((_error, c) =>
    c.json({ error: "Internal error; inspect local daemon diagnostics" }, 500),
  );
  return app;
}

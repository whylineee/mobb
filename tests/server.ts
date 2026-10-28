import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { AgentService } from "../packages/daemon/src/service.js";
import { createApp } from "../packages/daemon/src/server.js";
import type { RuntimeConfig } from "@agentwatch/shared";

const config: RuntimeConfig = {
  version: 1,
  port: 4318,
  uiToken: "agentwatch-e2e-ui-token-not-a-real-credential",
  hookToken: "agentwatch-e2e-hook-token-not-a-real-credential",
  codexHome: "/nonexistent",
  claudeHome: "/nonexistent",
};
let service = new AgentService({ dbPath: ":memory:" });
const makeApp = () =>
  createApp({ config, service, webRoot: resolve("packages/web/out") });
let app = makeApp();
const testApp = new Hono();
testApp.get("/__test/ready", (c) => c.text("ready"));
testApp.post("/__test/reset", (c) => {
  if (c.req.header("authorization") !== `Bearer ${config.hookToken}`)
    return c.text("unauthorized", 401);
  service.close();
  service = new AgentService({ dbPath: ":memory:" });
  app = makeApp();
  return c.json({ ok: true });
});
testApp.all("*", (c) => app.fetch(c.req.raw));
serve({ fetch: testApp.fetch, hostname: "127.0.0.1", port: config.port });

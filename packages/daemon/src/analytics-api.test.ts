import { afterEach, expect, it } from "vitest";
import { AgentService } from "./service.js";
import { createApp } from "./server.js";
import { normalizeHook } from "./telemetry/providers.js";
import type { RuntimeConfig } from "@agentwatch/shared";
const service = () => new AgentService({ dbPath: ":memory:" });
const services: AgentService[] = [];
const config: RuntimeConfig = {
  version: 1,
  port: 4318,
  uiToken: "test-ui",
  hookToken: "test-hook",
  codexHome: "/none",
  claudeHome: "/none",
};
afterEach(() => services.splice(0).forEach((s) => s.close()));
it("authenticates and validates analytics filters and pagination", async () => {
  const s = service();
  services.push(s);
  const app = createApp({ config, service: s });
  const request = (path: string, auth = true) =>
    app.request(`http://127.0.0.1:4318${path}`, {
      headers: auth ? { Authorization: "Bearer test-ui" } : {},
    });
  expect((await request("/api/statistics", false)).status).toBe(401);
  for (const path of [
    "/api/statistics?range=forever",
    "/api/agents?limit=101",
    "/api/agents?limit=0",
    "/api/agents?provider=other",
    "/api/agents?status=bad",
    "/api/agents?cursor=!!!",
  ])
    expect((await request(path)).status).toBe(400);
  expect((await request("/api/statistics?range=1h")).status).toBe(200);
  expect((await request("/api/codex-limits", false)).status).toBe(401);
  expect(await (await request("/api/codex-limits")).json()).toEqual({
    state: "loading",
  });
});
it("returns ancestor context for a filtered child and unfiltered global counts", async () => {
  const s = service();
  services.push(s);
  for (const raw of [
    {
      session_id: "parent",
      hook_event_name: "UserPromptSubmit",
      cwd: "/work/p",
    },
    {
      session_id: "parent",
      hook_event_name: "SubagentStart",
      agent_id: "a",
      agent_type: "Designer",
    },
  ])
    for (const e of normalizeHook("codex", raw, { observedAt: Date.now() }))
      s.ingest(e);
  const app = createApp({ config, service: s });
  const headers = { Authorization: "Bearer test-ui" };
  const page = await (
    await app.request(
      "http://127.0.0.1:4318/api/agents?search=Designer&limit=1",
      { headers },
    )
  ).json();
  expect(page.agents).toHaveLength(1);
  expect(page.ancestors[0].key).toBe("codex:parent");
  const stats = await (
    await app.request("http://127.0.0.1:4318/api/statistics?project=absent", {
      headers,
    })
  ).json();
  expect(stats.counts.total).toBe(2);
});
it("only accepts authenticated POST for orderly daemon shutdown", async () => {
  const s = service();
  services.push(s);
  let stopped = false;
  const app = createApp({
    config,
    service: s,
    onShutdown: () => {
      stopped = true;
    },
  });
  expect(
    (
      await app.request("http://127.0.0.1:4318/api/daemon/stop", {
        method: "POST",
      })
    ).status,
  ).toBe(401);
  expect(stopped).toBe(false);
  expect(
    (
      await app.request("http://127.0.0.1:4318/api/daemon/stop", {
        method: "POST",
        headers: { Authorization: "Bearer test-ui" },
      })
    ).status,
  ).toBe(202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(stopped).toBe(true);
});

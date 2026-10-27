import { test, expect, type APIRequestContext } from "@playwright/test";
const UI_TOKEN = "agentwatch-e2e-ui-token-not-a-real-credential";
const HOOK_TOKEN = "agentwatch-e2e-hook-token-not-a-real-credential";
const hook = async (
  request: APIRequestContext,
  session: string,
  name: string,
  extra: Record<string, unknown> = {},
  provider = "codex",
) => {
  const response = await request.post(`/api/hooks/${provider}`, {
    headers: { Authorization: `Bearer ${HOOK_TOKEN}` },
    data: {
      eventId: crypto.randomUUID(),
      occurredAt: Date.now(),
      payload: {
        session_id: session,
        hook_event_name: name,
        cwd: "/work/AgentWatch",
        ...extra,
      },
    },
  });
  expect(response.status()).toBe(202);
};
test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset", {
    headers: { Authorization: `Bearer ${HOOK_TOKEN}` },
  });
});

test("empty office and accessible fallback do not require external requests", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4318") &&
      !r.url().startsWith("data:") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(
    page.getByRole("heading", { name: "AgentWatch", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Офіс поки порожній")).toBeVisible();
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Список", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(external).toEqual([]);
  expect(page.url()).not.toContain("token=");
});

test("two same-project sessions have distinct selection and live state; text expands on click", async ({
  page,
  request,
}) => {
  await hook(request, "alpha", "SessionStart");
  await hook(request, "bravo", "SessionStart");
  const task =
    "Перевірити обробку даних. ".repeat(15) + "УНІКАЛЬНИЙ КІНЕЦЬ ЗАПИТУ";
  await hook(request, "alpha", "UserPromptSubmit", {
    prompt: task,
    turn_id: "t1",
  });
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:alpha").click();
  await expect(page.getByTestId("session-panel")).toContainText("alpha");
  await expect(
    page.getByText("УНІКАЛЬНИЙ КІНЕЦЬ ЗАПИТУ", { exact: false }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Розгорнути запит" }).click();
  await expect(page.getByTestId("task-text")).toContainText(
    "УНІКАЛЬНИЙ КІНЕЦЬ ЗАПИТУ",
  );
  await hook(request, "alpha", "PreToolUse", {
    tool_name: "Read",
    tool_use_id: "a",
    turn_id: "t1",
    tool_input: { file_path: "/work/parser.ts" },
  });
  await expect(page.getByTestId("session-panel")).toContainText(
    "/work/parser.ts",
  );
  await hook(request, "alpha", "Stop", { turn_id: "t1" });
  await expect(page.getByTestId("panel-status")).toHaveText("Очікує запиту");
  await page.getByTestId("session-codex:bravo").click();
  await expect(page.getByTestId("session-panel")).toContainText("bravo");
  await expect(page.getByTestId("session-panel")).not.toContainText(
    "УНІКАЛЬНИЙ КІНЕЦЬ ЗАПИТУ",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-panel")).not.toBeVisible();
});

test("reconnect resyncs without duplicate sessions or timeline events", async ({
  page,
  context,
  request,
}) => {
  await hook(request, "alpha", "SessionStart");
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:alpha").click();
  await context.setOffline(true);
  await hook(request, "alpha", "UserPromptSubmit", {
    prompt: "Нова задача після розриву",
    turn_id: "reconnect",
  });
  await context.setOffline(false);
  await expect(page.getByTestId("session-panel")).toContainText(
    "Нова задача після розриву",
    { timeout: 10000 },
  );
  await expect(page.getByTestId("session-codex:alpha")).toHaveCount(1);
  await page.getByRole("tab", { name: "Активність" }).click();
  await expect(page.getByTestId("timeline-event")).toHaveCount(2);
});

test("ended robots disappear after 60 seconds while their drawer stays open", async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date() });
  await hook(request, "alpha", "SessionStart");
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:alpha").click();
  await hook(request, "alpha", "SessionEnd");
  await expect(page.getByTestId("panel-status")).toHaveText("Завершено");
  await page.clock.fastForward(61000);
  await expect(page.getByTestId("session-codex:alpha")).toHaveCount(0);
  await expect(page.getByTestId("session-panel")).toContainText("alpha");
});

test("renders twenty robots and allows scene selection", async ({
  page,
  request,
}) => {
  for (let i = 0; i < 20; i++)
    await hook(
      request,
      `robot-${String(i).padStart(2, "0")}`,
      "SessionStart",
      {},
      i % 2 ? "claude" : "codex",
    );
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("robot-label")).toHaveCount(20, {
    timeout: 15000,
  });
  await page.waitForFunction(
    () =>
      (window as unknown as { __agentwatchPerformance?: { frames: number } })
        .__agentwatchPerformance?.frames! > 180,
  );
  const performance = await page.evaluate(
    () =>
      (
        window as unknown as {
          __agentwatchPerformance: { fps: number; calls: number };
        }
      ).__agentwatchPerformance,
  );
  console.log("20-session office benchmark:", JSON.stringify(performance));
  expect(performance.fps).toBeGreaterThanOrEqual(30);
  await page.getByTestId("robot-label").first().click();
  await expect(page.getByTestId("session-panel")).toBeVisible();
  await page.screenshot({ path: "test-results/agentwatch-office.png" });
});

test("falls back to the same session list when WebGL is unavailable", async ({
  page,
  request,
}) => {
  await hook(request, "fallback", "SessionStart");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.includes("webgl")) return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(page.getByTestId("session-codex:fallback")).toBeVisible({
    timeout: 15000,
  });
  await page.getByTestId("session-codex:fallback").click();
  await expect(page.getByTestId("session-panel")).toContainText("fallback");
});

test("live events keep panel scroll and selection stable", async ({
  page,
  request,
}) => {
  await hook(request, "alpha", "SessionStart");
  for (let i = 0; i < 35; i++)
    await hook(request, "alpha", "PreToolUse", {
      tool_use_id: `call-${i}`,
      tool_name: "Read",
    });
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:alpha").click();
  await page.getByRole("tab", { name: "Активність" }).click();
  const scroll = page.getByTestId("activity-scroll");
  await expect(page.getByTestId("timeline-event")).toHaveCount(36);
  await scroll.evaluate((e) => {
    e.scrollTop = 300;
  });
  const before = await scroll.evaluate((e) => e.scrollTop);
  await hook(request, "alpha", "PostToolUse", {
    tool_use_id: "call-0",
    tool_name: "Read",
  });
  await expect(page.getByTestId("timeline-event")).toHaveCount(37);
  expect(
    Math.abs((await scroll.evaluate((e) => e.scrollTop)) - before),
  ).toBeLessThan(2);
  await expect(page.getByTestId("session-panel")).toContainText("alpha");
});

test("observed hook changes reach the panel within the latency budget", async ({
  page,
  request,
}) => {
  await hook(request, "latency", "SessionStart");
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:latency").click();
  const samples: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    await hook(request, "latency", "UserPromptSubmit", {
      prompt: `latency-sample-${i}`,
      turn_id: `latency-${i}`,
    });
    await expect(page.getByTestId("task-text")).toHaveText(
      `latency-sample-${i}`,
    );
    samples.push(Date.now() - start);
  }
  const p95 = samples.sort((a, b) => a - b)[18]!;
  console.log("Hook → visible panel p95 upper bound:", p95, "ms");
  expect(p95).toBeLessThanOrEqual(1000);
});

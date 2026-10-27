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

test.describe("compact markers and sharp Retina rendering", () => {
  test.use({ viewport: { width: 702, height: 762 }, deviceScaleFactor: 2 });

  test("twenty markers leave the office visible", async ({ page, request }) => {
    for (let i = 0; i < 20; i++)
      await hook(request, `compact-${i}`, "UserPromptSubmit");
    await page.goto(`/#token=${UI_TOKEN}`);
    const markers = page.getByTestId("robot-label");
    await expect(markers).toHaveCount(20);
    const bounds = await markers.evaluateAll((items) =>
      items.map((item) => {
        const { x, y, width, height } = item.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(bounds.every((b) => b.width <= 26 && b.height <= 26)).toBe(true);
    for (let i = 0; i < bounds.length; i++)
      for (let j = i + 1; j < bounds.length; j++) {
        const a = bounds[i]!,
          b = bounds[j]!;
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
      }
    await page.screenshot({ path: "test-results/office-compact-retina.png" });
    const marker = page.getByRole("button", {
      name: "Вибрати Codex compact-0",
      exact: true,
    });
    await marker.hover();
    await expect(marker.locator(".robot-tooltip")).toContainText("compact-0");
    await marker.click();
    await expect(page.getByTestId("session-panel")).toBeVisible();
  });

  test("Retina stays sharp after the performance monitor samples frames", async ({
    page,
    request,
  }) => {
    for (let i = 0; i < 20; i++)
      await hook(request, `sharp-${i}`, "UserPromptSubmit");
    await page.goto(`/#token=${UI_TOKEN}`);
    await expect(page.getByTestId("robot-label")).toHaveCount(20);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveJSProperty("clientWidth", 702);
    await expect(canvas).toHaveJSProperty("width", 1404);
    await expect(canvas).toHaveJSProperty("height", 1524);
    await page.waitForFunction(
      () =>
        (window as unknown as { __agentwatchPerformance?: { frames: number } })
          .__agentwatchPerformance?.frames! > 180,
    );
    await expect(canvas).toHaveJSProperty("width", 1404);
    await expect(canvas).toHaveJSProperty("height", 1524);
    await page.screenshot({ path: "test-results/office-sharp-retina.png" });
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
    page.getByRole("main", { name: "Інтерактивний 3D-офіс" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() => page.locator("canvas").boundingBox())
    .toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
  await expect(
    page.locator(".sidebar, .topbar, .metrics, .intro, .office-card"),
  ).toHaveCount(0);
  await expect(page.getByTestId("session-panel")).toHaveCount(0);
  await expect(page.locator("img")).toHaveCount(0);
  await expect(page.getByText("Офіс поки порожній")).toBeVisible();
  await page.getByRole("button", { name: "Список", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Список", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(external).toEqual([]);
  expect(page.url()).not.toContain("token=");
});

test("office camera orbits, zooms and resets without changing the full-screen layout", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveJSProperty("clientWidth", 1440);
  await page.waitForFunction(
    () =>
      (window as unknown as { __agentwatchPerformance?: { frames: number } })
        .__agentwatchPerformance?.frames! >= 3,
  );
  await page.getByRole("button", { name: "Показати весь офіс" }).click();
  const home = await canvas.screenshot({
    path: "test-results/camera-home.png",
  });
  await page.mouse.move(760, 600);
  await page.mouse.down();
  await page.mouse.move(960, 650, { steps: 16 });
  await page.mouse.up();
  const rotated = await canvas.screenshot();
  expect(rotated.equals(home)).toBe(false);
  await page.getByRole("button", { name: "Наблизити", exact: true }).click();
  expect((await canvas.screenshot()).equals(rotated)).toBe(false);
  await page.getByRole("button", { name: "Показати весь офіс" }).click();
  expect(
    (await canvas.screenshot({ path: "test-results/camera-reset.png" })).equals(
      home,
    ),
  ).toBe(true);
  await expect(canvas).toHaveJSProperty("clientWidth", 1440);
  await page.screenshot({ path: "test-results/office-3d-desktop.png" });
});

test("portrait office fills the viewport and the session list is keyboard accessible", async ({
  page,
  request,
}) => {
  await hook(request, "portrait", "UserPromptSubmit");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  expect(await page.locator("canvas").boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "test-results/office-3d-mobile.png" });
  await page.getByRole("button", { name: "Список", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("session-codex:portrait")).toBeVisible();
  await page.getByTestId("session-codex:portrait").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("session-panel")).toBeVisible();
  expect(await page.locator("canvas").boundingBox()).toEqual({
    x: 0,
    y: 0,
    width: 390,
    height: 844,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("session-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Закрити список" }).click();
  await expect(page.getByRole("region", { name: "Сесії агентів" })).toHaveCount(
    0,
  );
});

test("local key opens the office and connection failures preserve the room", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Локальний ключ")).toBeVisible();
  await page.getByLabel("Локальний ключ").fill(UI_TOKEN);
  await page.getByRole("button", { name: "Відкрити офіс" }).click();
  await expect(page.locator("canvas")).toHaveJSProperty("clientWidth", 1440);
  await expect(page.getByText("Офіс поки порожній")).toBeVisible();
  await page.route("**/api/stream", (route) => route.abort("failed"));
  await page.reload();
  await expect(page.getByText(/З’єднання втрачено/)).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/office-offline.png" });
});

test("connecting and partial telemetry are disclosed without hiding the office", async ({
  page,
}) => {
  let release: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/stream", async (route) => {
    await ready;
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: snapshot\ndata: ${JSON.stringify({ sessions: [], revision: 0, collectors: [], omittedSessions: 7 })}\n\n`,
    });
  });
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(page.getByText("З’єднання…", { exact: true })).toBeVisible();
  await expect(page.locator("canvas")).toHaveJSProperty("clientWidth", 1440);
  release();
  await expect(page.getByText(/Ще 7 збережено локально/)).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.screenshot({ path: "test-results/office-partial.png" });
});

test("two same-project sessions have distinct selection and live state; text expands on click", async ({
  page,
  request,
}) => {
  await hook(request, "alpha", "UserPromptSubmit");
  await hook(request, "bravo", "UserPromptSubmit");
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
  await hook(request, "alpha", "UserPromptSubmit");
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
  await hook(request, "alpha", "UserPromptSubmit");
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
      "UserPromptSubmit",
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
  await hook(request, "fallback", "UserPromptSubmit");
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
  await hook(request, "alpha", "UserPromptSubmit");
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
  await hook(request, "latency", "UserPromptSubmit");
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

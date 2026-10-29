import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
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
// UI panels can render before the deferred 3D module finishes loading.
const renderedScene = async (page: Page) => {
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(
    () =>
      (window as unknown as { __agentwatchPerformance?: { frames: number } })
        .__agentwatchPerformance?.frames! >= 1,
  );
};
// Two FPS samples are enough for the adaptive-quality monitor to react. Waiting
// for a fixed frame count makes this check depend on the runner's render speed.
const sampledScene = async (page: Page) => {
  const performance = () => page.evaluate(() => window.__agentwatchPerformance);
  await expect
    .poll(async () => (await performance())?.fps ?? 0, {
      timeout: 15000,
    })
    .toBeGreaterThan(0);
  await page.waitForTimeout(1100);
  const frames = (await performance())!.frames;
  await expect
    .poll(async () => (await performance())?.frames ?? 0, {
      timeout: 15000,
    })
    .toBeGreaterThan(frames);
};
test.beforeEach(async ({ request }) => {
  await request.post("/__test/reset", {
    headers: { Authorization: `Bearer ${HOOK_TOKEN}` },
  });
});

test("process samples keep full panel text without reloading semantic details", async ({
  page,
  request,
}) => {
  const prompt = "Original task " + "full private text ".repeat(30);
  await hook(request, "details-budget", "UserPromptSubmit", {
    prompt,
    turn_id: "details-1",
  });
  let detailRequests = 0;
  page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/sessions/codex%3Adetails-budget")
      detailRequests++;
  });
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:details-budget").click();
  await page.getByRole("button", { name: "Розгорнути запит" }).click();
  await expect(page.getByTestId("task-text")).toHaveText(prompt);
  expect(detailRequests).toBe(1);
  await page.getByRole("tab", { name: "Деталі", exact: true }).click();
  await request.post("/__test/process", {
    headers: { Authorization: `Bearer ${HOOK_TOKEN}` },
    data: { key: "codex:details-budget", cpuPercent: 5 },
  });
  await expect(page.getByTestId("session-panel")).toContainText("5.0 %");
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(detailRequests).toBe(1);
  await hook(request, "details-budget", "UserPromptSubmit", {
    prompt: "New task " + "new full text ".repeat(30),
    turn_id: "details-2",
  });
  await expect.poll(() => detailRequests).toBe(2);
  await page.getByRole("tab", { name: "Огляд", exact: true }).click();
  await page.getByRole("button", { name: "Розгорнути запит" }).click();
  await expect(page.getByTestId("task-text")).toHaveText(
    "New task " + "new full text ".repeat(30),
  );
});

test("open sessions stay in the office between turns", async ({
  page,
  request,
}) => {
  await hook(request, "current-work", "SessionStart");
  await page.goto(`/#token=${UI_TOKEN}`);
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  await expect(
    page.getByTestId("robot-label").locator(".robot-caption"),
  ).toContainText("Очікує запиту");
  await hook(request, "current-work", "UserPromptSubmit", {
    prompt: "Поточна задача",
    turn_id: "current",
  });
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  await page.getByTestId("robot-label").click();
  await expect(page.getByTestId("session-panel")).toContainText(
    "Поточна задача",
  );
  await hook(request, "current-work", "Stop", { turn_id: "current" });
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  await expect(
    page.getByTestId("robot-label").locator(".robot-caption"),
  ).toContainText("Очікує запиту");
  await expect(page.getByTestId("panel-status")).toHaveText("Очікує запиту");
  await expect(page.getByTestId("session-panel")).toContainText(
    "Поточна задача",
  );
  await hook(request, "current-work", "UserPromptSubmit", {
    prompt: "Нова задача",
    turn_id: "next",
  });
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  await hook(request, "current-work", "SessionEnd");
  await expect(page.getByTestId("robot-label")).toHaveCount(0);
  await expect(page.getByTestId("panel-status")).toHaveText("Завершено");
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
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (let i = 0; i < 20; i++)
      await hook(request, `sharp-${i}`, "UserPromptSubmit");
    await page.goto(`/#token=${UI_TOKEN}`);
    await expect(page.getByTestId("robot-label")).toHaveCount(20);
    const canvas = page.locator("canvas");
    await expect(canvas).toHaveJSProperty("clientWidth", 702);
    await expect(canvas).toHaveJSProperty("width", 1404);
    await expect(canvas).toHaveJSProperty("height", 1524);
    await sampledScene(page);
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

test("office camera locks its angle, bounds panning, zooms and resets", async ({
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
        .__agentwatchPerformance?.frames! >= 1,
  );
  await page.getByRole("button", { name: "Показати весь офіс" }).click();
  await page.mouse.move(760, 900);
  const home = await canvas.screenshot({
    path: "test-results/camera-home.png",
  });
  await page.mouse.move(760, 600);
  await page.mouse.down();
  await page.mouse.move(960, 650, { steps: 16 });
  await page.mouse.up();
  await page.mouse.move(760, 900);
  const locked = await canvas.screenshot();
  expect(locked.equals(home)).toBe(true);
  await page.getByRole("button", { name: "Наблизити", exact: true }).click();
  await page.mouse.move(760, 900);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(home))
    .toBe(false);
  const zoomed = await canvas.screenshot();
  await page.mouse.move(760, 600);
  await page.mouse.down();
  await page.mouse.move(1260, 800, { steps: 12 });
  await page.mouse.up();
  await page.mouse.move(760, 900);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(zoomed))
    .toBe(false);
  await page.getByRole("button", { name: "Показати весь офіс" }).click();
  await page.mouse.move(760, 900);
  await expect
    .poll(async () => (await canvas.screenshot()).equals(home))
    .toBe(true);
  await canvas.screenshot({ path: "test-results/camera-reset.png" });
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
  await page.screenshot({ path: "test-results/office-login.png" });
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
  await page.screenshot({ path: "test-results/office-connecting.png" });
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

test("ended robots disappear immediately while their drawer stays open", async ({
  page,
  request,
}) => {
  await hook(request, "alpha", "UserPromptSubmit");
  await page.goto(`/?view=list#token=${UI_TOKEN}`);
  await page.getByTestId("session-codex:alpha").click();
  await hook(request, "alpha", "SessionEnd");
  await expect(page.getByTestId("panel-status")).toHaveText("Завершено");
  await expect(page.getByTestId("session-codex:alpha")).toHaveCount(0);
  await expect(page.getByTestId("session-panel")).toContainText("alpha");
});

test("renders twenty mascot agents within the animation budget and allows selection", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
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
  await sampledScene(page);
  const performance = await page.evaluate(
    () =>
      (
        window as unknown as {
          __agentwatchPerformance: {
            fps: number;
            calls: number;
            animationFps: number;
          };
        }
      ).__agentwatchPerformance,
  );
  console.log("20-session office benchmark:", JSON.stringify(performance));
  expect(performance.animationFps).toBe(20);
  // FPS is reported, but a shared software-rendering runner cannot guarantee a
  // hardware-independent minimum. Liveness and the render-call cap still apply.
  expect(performance.fps).toBeGreaterThan(0);
  expect(performance.fps).toBeLessThanOrEqual(24);
  expect(performance.calls).toBeLessThanOrEqual(12);
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

test("task board tracks current sessions and shares counters with statistics", async ({
  page,
  request,
}) => {
  await hook(request, "board-work", "UserPromptSubmit", {
    prompt: "Перевірити офіс " + "довгий текст ".repeat(50),
    turn_id: "board-turn",
  });
  await hook(request, "board-idle", "SessionStart", {}, "claude");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await page.getByRole("button", { name: "Таскборд", exact: true }).click();
  await expect(
    page.getByTestId("tasks-working").getByTestId("task-codex:board-work"),
  ).toBeVisible();
  await expect(
    page.getByTestId("tasks-idle").getByTestId("task-claude:board-idle"),
  ).toBeVisible();
  await expect(page.getByTestId("task-claude:board-idle")).toContainText(
    "Задача поки невідома",
  );
  await expect(page.getByTestId("count-working")).toContainText("1");
  await hook(request, "board-work", "Notification", {
    notification_type: "permission_prompt",
  });
  await expect(
    page.getByTestId("tasks-waiting").getByTestId("task-codex:board-work"),
  ).toBeVisible();
  await hook(request, "board-work", "Stop", { turn_id: "board-turn" });
  await expect(
    page.getByTestId("tasks-idle").getByTestId("task-codex:board-work"),
  ).toBeVisible();
  await expect(page.getByTestId("count-idle")).toContainText("2");
  await renderedScene(page);
  await page.screenshot({ path: "test-results/office-taskboard-desktop.png" });
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await expect(page.getByTestId("open-session-count")).toHaveText("2");
  await expect(page.locator("#office-stats")).toContainText("Недоступно");
  await hook(request, "board-work", "SessionEnd");
  await expect(page.getByTestId("task-codex:board-work")).toHaveCount(0);
  await expect(page.getByTestId("open-session-count")).toHaveText("1");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Статистика", exact: true }),
  ).toBeFocused();
  await expect(page.getByTestId("task-board")).toBeVisible();
  await page.getByRole("button", { name: "Стан джерел", exact: true }).click();
  const hookHealth = page
    .locator("#office-sources .collector-health")
    .filter({ hasText: "codex-hooks" });
  await expect(hookHealth).toContainText("Сигнал отримано");
  await expect(hookHealth).toContainText(
    "поточний стан налаштування невідомий",
  );
  await expect(hookHealth).not.toContainText("Пропущено подій");
  await page.getByRole("button", { name: "Офіс", exact: true }).click();
  await expect(page.locator(".office-tool-panel")).toHaveCount(0);
});

test("mobile task details return to the previous panel and restore keyboard focus", async ({
  page,
  request,
}) => {
  await hook(request, "mobile-task", "UserPromptSubmit", {
    prompt: "Мобільна задача",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await page.getByRole("button", { name: "Таскборд", exact: true }).click();
  const task = page.getByTestId("task-codex:mobile-task");
  await task.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("session-panel")).toContainText(
    "Мобільна задача",
  );
  await expect(page.locator(".office-tool-panel")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("task-board")).toBeVisible();
  await expect(task).toBeFocused();
  await expect(page.locator(".office-tool-panel")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({ path: "test-results/office-taskboard-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Таскборд", exact: true }),
  ).toBeFocused();
});

test("edge agent focus remains between panels after viewport changes", async ({
  page,
  request,
}) => {
  for (let i = 0; i < 20; i++)
    await hook(request, `edge-${i}`, "UserPromptSubmit");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await page.getByRole("button", { name: "Таскборд", exact: true }).click();
  await page.getByTestId("task-codex:edge-19").click();
  const marker = page.getByRole("button", {
    name: "Вибрати Codex edge-19",
    exact: true,
  });
  await expect(page.getByTestId("session-panel")).toBeVisible();
  for (const width of [1440, 1680]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(async () => {
        const bounds = await marker.boundingBox();
        return (
          !!bounds &&
          bounds.x > 622 &&
          bounds.x + bounds.width < width - 438 &&
          bounds.y > 48 &&
          bounds.y + bounds.height < 900
        );
      })
      .toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/office-panels-focus.png" });
});

test("partial statistics and collector health use available evidence", async ({
  page,
}) => {
  const now = Date.now();
  const common = {
    provider: "codex",
    origin: "cli",
    project: "Evidence",
    lifecycle: "open",
    activity: "working",
    freshness: "fresh",
    requiresAttention: false,
    lastActivityAt: now,
    lastObservedAt: now,
    stateAt: now,
    activeTools: [],
    subagents: [],
    sources: ["hook"],
  };
  await page.route("**/api/stream", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: snapshot\ndata: ${JSON.stringify({
        sessions: [
          {
            ...common,
            key: "codex:metrics",
            sessionId: "metrics",
            turnStartedAt: now - 65000,
            task: { text: "Зібрати метрики", source: "hook", updatedAt: now },
            process: {
              pid: 7,
              startedAt: now - 65000,
              cpuPercent: 12.5,
              memoryBytes: 134217728,
            },
          },
          {
            ...common,
            key: "codex:stale",
            sessionId: "stale",
            freshness: "stale",
          },
        ],
        revision: 1,
        serverTime: now,
        omittedSessions: 3,
        collectors: [
          {
            id: "codex-log",
            state: "ready",
            message: "Журнал доступний",
            lastCheckedAt: now,
            lastEventAt: now,
            droppedEvents: 0,
          },
          {
            id: "claude-hooks",
            state: "unavailable",
            message: "Hooks недоступні",
            lastCheckedAt: now,
            droppedEvents: 2,
          },
          {
            id: "process",
            state: "error",
            message: "Не вдалося прочитати процеси",
            lastCheckedAt: now,
            droppedEvents: 1,
          },
        ],
      })}\n\n`,
    }),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await page.getByRole("button", { name: "Таскборд", exact: true }).click();
  await expect(page.getByTestId("tasks-unknown")).toContainText("stale");
  await expect(page.getByTestId("count-unknown")).toContainText("1");
  await expect(page.getByText(/Ще 3 збережено локально/)).toBeVisible();
  await page.getByRole("button", { name: "Статистика", exact: true }).click();
  await expect(page.getByTestId("open-session-count")).toHaveText("2");
  await expect(page.locator("#office-stats")).toContainText("12.5 %");
  await expect(page.locator("#office-stats")).toContainText("128.0 MB");
  await expect(page.locator("#office-stats")).toContainText("1 хв");
  await expect(page.locator("#office-stats")).toContainText("Недоступно");
  await renderedScene(page);
  await page.screenshot({ path: "test-results/office-statistics.png" });
  await page.getByRole("button", { name: "Стан джерел", exact: true }).click();
  await expect(page.locator("#office-sources")).toContainText("Готове");
  await expect(page.locator("#office-sources")).toContainText(
    "Hooks недоступні",
  );
  await expect(page.locator("#office-sources")).toContainText(
    "Не вдалося прочитати процеси",
  );
  await expect(page.locator("#office-sources")).toContainText(
    "Пропущено подій",
  );
  await page.screenshot({ path: "test-results/office-sources.png" });
});

test("mascot agents face their workstations and preserve attention selection", async ({
  page,
  request,
}) => {
  await hook(request, "mascot", "UserPromptSubmit", {
    prompt: "Перевірити нову модель агента",
    turn_id: "mascot-turn",
  });
  await hook(request, "mascot-second", "UserPromptSubmit", {
    prompt: "Перевірити нову модель агента",
    turn_id: "mascot-turn",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  await renderedScene(page);
  const marker = page.getByRole("button", {
    name: "Вибрати Codex mascot",
    exact: true,
  });
  await marker.click();
  await expect(page.getByTestId("session-panel")).toContainText(
    "Перевірити нову модель агента",
  );
  await page.screenshot({ path: "test-results/mascot-office-desktop.png" });
  for (let i = 0; i < 6; i++)
    await page.getByRole("button", { name: "Наблизити", exact: true }).click();
  const bounds = await marker.boundingBox();
  expect(bounds).not.toBeNull();
  await page.screenshot({
    path: "test-results/mascot-closeup.png",
    clip: {
      x: Math.max(0, Math.min(940, bounds!.x - 210)),
      y: Math.max(0, Math.min(500, bounds!.y - 50)),
      width: 500,
      height: 500,
    },
  });
  await hook(request, "mascot", "Notification", {
    notification_type: "permission_prompt",
  });
  await expect(page.getByTestId("panel-status")).toHaveText("Потрібна увага");
  await page.screenshot({ path: "test-results/mascot-attention.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Показати весь офіс" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(marker).toBeVisible();
  await page.screenshot({ path: "test-results/mascot-office-mobile.png" });
});

test("scene sleeps when static, stops in the background, and caps typing frames", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const frames = () =>
    page.evaluate(
      () =>
        (window as unknown as { __agentwatchPerformance: { frames: number } })
          .__agentwatchPerformance.frames,
    );
  await page.goto(`/#token=${UI_TOKEN}`);
  await renderedScene(page);
  await page.waitForTimeout(250);
  const idleStart = await frames();
  await page.waitForTimeout(1200);
  expect((await frames()) - idleStart).toBe(0);
  await hook(request, "render-budget", "UserPromptSubmit");
  await expect(page.getByTestId("robot-label")).toHaveCount(1);
  await expect
    .poll(async () =>
      page.evaluate(() => window.__agentwatchPerformance?.animationFps),
    )
    .toBe(20);
  const workingStart = await frames();
  const shadowStart = await page.evaluate(
    () =>
      (
        window as unknown as {
          __agentwatchPerformance: { shadowUpdates: number };
        }
      ).__agentwatchPerformance.shadowUpdates,
  );
  await page.waitForTimeout(1200);
  const animatedFrames = (await frames()) - workingStart;
  expect(animatedFrames).toBeLessThanOrEqual(30);
  await expect
    .poll(frames, { timeout: 10000 })
    .toBeGreaterThanOrEqual(workingStart + 2);
  const shadowRefreshes =
    (await page.evaluate(
      () =>
        (
          window as unknown as {
            __agentwatchPerformance: { shadowUpdates: number };
          }
        ).__agentwatchPerformance.shadowUpdates,
    )) - shadowStart;
  expect(shadowRefreshes).toBe(0);
  console.log(
    "Render budget over 1.2s:",
    JSON.stringify({ idleFrames: 0, animatedFrames, shadowRefreshes }),
  );
  await hook(request, "render-budget", "Notification", {
    notification_type: "permission_prompt",
  });
  await expect(
    page.getByTestId("robot-label").locator(".dot-waiting"),
  ).toHaveCount(1);
  await expect
    .poll(async () =>
      page.evaluate(() => window.__agentwatchPerformance?.animationFps),
    )
    .toBe(0);
  const waitingStart = await frames();
  // Identical live signals update timestamps, not the 3D appearance.
  for (let i = 0; i < 3; i++)
    await hook(request, "render-budget", "Notification", {
      notification_type: "permission_prompt",
    });
  await page.waitForTimeout(1200);
  expect((await frames()) - waitingStart).toBe(0);
  await hook(request, "render-budget", "UserPromptSubmit");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Let the visibility update commit and any already queued frame drain before
  // measuring the hidden scene, even when the browser draws very slowly.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  const hiddenStart = await frames();
  await page.waitForTimeout(1200);
  expect((await frames()) - hiddenStart).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(frames).toBeGreaterThan(hiddenStart);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(async () =>
      page.evaluate(() => window.__agentwatchPerformance?.animationFps),
    )
    .toBe(0);
  const reducedStart = await frames();
  await page.waitForTimeout(1200);
  expect((await frames()) - reducedStart).toBe(0);
});

test("office labels show current work and confirmed attention", async ({
  page,
  request,
}) => {
  await hook(request, "office-label", "UserPromptSubmit", {
    prompt: "Перевірити проєкт",
    turn_id: "label-turn",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/#token=${UI_TOKEN}`);
  const marker = page.getByRole("button", {
    name: "Вибрати Codex office-label",
    exact: true,
  });
  await expect(marker.locator(".robot-caption")).toContainText("AgentWatch");
  await expect(marker.locator(".robot-caption")).toContainText("Працює");
  await expect(marker).toHaveAccessibleDescription("AgentWatch. Працює.");
  await expect(page.locator(".office-project-zone")).toContainText(
    "AgentWatch",
  );
  await hook(request, "office-label", "Notification", {
    notification_type: "permission_prompt",
  });
  await expect(marker).toHaveClass(/robot-attention/);
  await expect(marker).toHaveAccessibleDescription(
    "AgentWatch. Потрібна увага.",
  );
  await expect(marker.locator(".robot-caption")).toContainText(
    "Потрібна увага",
  );
  await expect(page.locator(".attention-count")).toHaveText("1");
  await hook(request, "office-label", "Stop", { turn_id: "label-turn" });
  await expect(page.locator(".attention-count")).toHaveCount(0);
});

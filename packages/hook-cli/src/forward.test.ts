import { afterEach, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardHook } from "./forward.js";

let server: Server | undefined;
let root: string | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = undefined;
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});
const setup = (port: number) => {
  root = mkdtempSync(join(tmpdir(), "agentwatch-hook-"));
  writeFileSync(
    join(root, "config.json"),
    JSON.stringify({ port, hookToken: "test-hook-token" }),
  );
  return root;
};

it("sends authenticated hook data without returning any agent decisions", async () => {
  let authorization: string | undefined,
    body = "";
  server = createServer((req, res) => {
    authorization = req.headers.authorization;
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.writeHead(202);
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  await forwardHook({
    provider: "claude",
    home: setup(port),
    payload: { session_id: "s1", hook_event_name: "PreToolUse" },
  });
  expect(authorization).toBe("Bearer test-hook-token");
  expect(JSON.parse(body).payload.hook_event_name).toBe("PreToolUse");
  expect(JSON.parse(body).eventId).toBeTruthy();
});

it("bounds a hanging daemon request and records loss without private payloads", async () => {
  server = createServer(() => {});
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port,
    home = setup(port),
    start = performance.now();
  await expect(
    forwardHook({
      provider: "codex",
      home,
      payload: {
        session_id: "s1",
        hook_event_name: "UserPromptSubmit",
        prompt: "private task",
      },
    }),
  ).resolves.toBeUndefined();
  expect(performance.now() - start).toBeLessThan(1000);
  const failures = readFileSync(join(home, "hook-failures.jsonl"), "utf8");
  expect(failures).not.toContain("private task");
  expect(failures).toContain("codex");
});

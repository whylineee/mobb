import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexLimitsCollector, parseCodexLimits } from "./codex-limits.js";
import type { CodexLimits } from "@agentwatch/shared";

describe("Codex account limits", () => {
  it("maps five-hour and weekly windows to remaining percentages and reset times", () => {
    expect(
      parseCodexLimits(
        {
          rateLimits: {
            primary: {
              usedPercent: 23.5,
              windowDurationMins: 300,
              resetsAt: 1793286000,
            },
            secondary: {
              usedPercent: 64,
              windowDurationMins: 10080,
              resetsAt: 1793800000,
            },
          },
        },
        1234,
      ),
    ).toEqual({
      state: "ready",
      updatedAt: 1234,
      fiveHour: { remainingPercent: 76.5, resetsAt: 1793286000000 },
      weekly: { remainingPercent: 36, resetsAt: 1793800000000 },
    });
  });
  it("does not invent missing windows or accept invalid values", () => {
    expect(
      parseCodexLimits(
        {
          rateLimits: {
            primary: { usedPercent: 110, windowDurationMins: 300 },
            secondary: { usedPercent: 1, windowDurationMins: 60 },
          },
        },
        1,
      ),
    ).toEqual({ state: "unavailable" });
  });
  it("reads a JSON-RPC response through the spawned app server", async () => {
    const root = mkdtempSync(join(tmpdir(), "agentwatch-limits-"));
    const executable = join(root, "codex");
    writeFileSync(
      executable,
      `#!${process.execPath}
const readline = require("node:readline");
readline.createInterface({input:process.stdin}).on("line", (line) => {
 const m=JSON.parse(line);
 if(m.id===1) console.log(JSON.stringify({id:1,result:{}}));
 if(m.id===2) console.log(JSON.stringify({id:2,result:{rateLimits:{primary:{usedPercent:30,windowDurationMins:300,resetsAt:1800000000}}}}));
});
`,
      { mode: 0o700 },
    );
    let result: CodexLimits = { state: "loading" };
    const collector = new CodexLimitsCollector(
      root,
      (value) => {
        result = value;
      },
      executable,
    );
    try {
      collector.poll();
      await expect.poll(() => result.state).toBe("ready");
      expect(result.fiveHour?.remainingPercent).toBe(70);
      expect(result.weekly).toBeNull();
    } finally {
      collector.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

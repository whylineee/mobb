import { describe, expect, it } from "vitest";
import { normalizeClaudeRecord, normalizeCodexRecord } from "./providers.js";

describe("usage adapters", () => {
  it("normalizes cumulative Codex counters without turning usage into liveness", () => {
    const events = normalizeCodexRecord(
      {
        type: "event_msg",
        timestamp: "2026-10-28T10:00:00Z",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 80,
              output_tokens: 20,
              reasoning_output_tokens: 5,
              total_tokens: 120,
            },
          },
        },
      },
      { sessionId: "s", id: "line", observedAt: Date.now(), live: true },
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("usage");
    expect(events[0]?.data.usage).toMatchObject({
      mode: "cumulative",
      input: 100,
      output: 20,
      cacheRead: 80,
      reasoning: 5,
      total: 120,
    });
    expect(events[0]?.data.confirmed).toBeUndefined();
  });
  it("deduplicates Claude message usage identity and leaves placeholder output unavailable", () => {
    const raw = {
      type: "assistant",
      sessionId: "c",
      timestamp: "2026-10-28T10:00:00Z",
      message: {
        id: "msg1",
        model: "claude-model",
        content: [{ type: "text", text: "answer" }],
        usage: {
          input_tokens: 10,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 5,
          output_tokens: 1,
        },
      },
    };
    const a = normalizeClaudeRecord(raw, {
      observedAt: Date.now(),
      id: "a",
      live: true,
    });
    const b = normalizeClaudeRecord(raw, {
      observedAt: Date.now(),
      id: "b",
      live: true,
    });
    expect(a.find((e) => e.kind === "usage")?.data.usage).toMatchObject({
      key: "msg1",
      input: 45,
      cacheRead: 30,
      cacheWrite: 5,
      output: null,
      total: null,
    });
    expect(b.find((e) => e.kind === "usage")?.data.usage?.key).toBe("msg1");
  });
  it("rejects malformed counters rather than showing zero", () => {
    const events = normalizeCodexRecord(
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: -1,
              output_tokens: 2,
              total_tokens: 1,
            },
          },
        },
      },
      { sessionId: "s", observedAt: Date.now(), live: true },
    );
    expect(events).toEqual([]);
  });
});

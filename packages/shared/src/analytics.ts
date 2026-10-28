export type TimeRange = "1h" | "24h" | "7d";
export type TokenTotals = {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  reasoning: number | null;
  total: number | null;
  partial: boolean;
};
export type AgentRow = {
  key: string;
  sessionKey?: string;
  logicalAgentId?: string;
  parentKey?: string;
  name: string;
  provider: "codex" | "claude";
  project: string;
  model?: string;
  kind: "session" | "subagent";
  lifecycle: "open" | "ended" | "unknown";
  status: "working" | "waiting" | "idle" | "unknown" | "ended";
  lastObservedAt: number;
  tokens: TokenTotals | null;
};
export type AnalyticsFilter = {
  range?: TimeRange;
  provider?: "codex" | "claude";
  project?: string;
};
export type AgentQuery = AnalyticsFilter & {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: AgentRow["status"];
};
export type AgentPage = {
  agents: AgentRow[];
  ancestors: AgentRow[];
  total: number;
  nextCursor: string | null;
};
export type AgentCounts = {
  total: number;
  sessions: number;
  subagents: number;
  working: number;
  waiting: number;
  idle: number;
  unknown: number;
};
export type Statistics = {
  serverTime: number;
  monitoringSince: number;
  range: TimeRange;
  from: number;
  to: number;
  counts: AgentCounts;
  tokens: TokenTotals;
  buckets: {
    at: number;
    tokens: number | null;
    input: number | null;
    output: number | null;
    working: number | null;
    samples: number;
  }[];
  breakdowns: Record<
    "provider" | "project" | "model",
    { name: string; tokens: TokenTotals }[]
  >;
  projects: string[];
  coverage: {
    partial: boolean;
    reasons: string[];
    samples: number;
    expectedSamples: number;
  };
};

# Terminal dashboard implementation ledger

Plan: docs/superpowers/plans/2026-10-28-terminal-dashboard.md

Working branch: codex/terminal-dashboard, base d0083b2. Existing checkout reused; no unrelated edits were present.

Pre-flight: shared usage/agent contracts feed daemon aggregation and TUI; daemon HTTP authentication and existing web SSE contracts remain compatible.

Ruling: minute working counts are simultaneous samples grouped by provider/project, averaged into wider buckets, rather than sums of independent peaks. This preserves accurate filtered charts.

Completed implementation:

- Shared usage/analytics contracts, metadata parent links and child lifecycle; startup clears retained child liveness.
- Separate SQLite ledger/checkpoints and activity samples; historical baseline/restart, Claude partial usage, corrections, reset and duplicate handling.
- Full-database paginated agents/ancestor API, statistics and authenticated daemon shutdown.
- Ink package, Unicode-safe fixed-width frames, tree, filters/search, three charts, details, mono/ASCII, resize and SSE/poll recovery.
- Atomic first-use config, isolated background startup, non-TTY preflight and daemon stop command.

Independent review found two P2 issues, both reproduced before fixing: zero corrections retained a previous positive charge; newly confirmed children depended on a stale parent's freshness. Both now have passing regression tests. No other confirmed P1/P2 findings were reported.

Testing notes: PTY tests initially exposed batched search input handling. The PTY harness also needed to drain terminal output while awaiting exit, matching real terminal behavior. Startup integration exposed a missing AGENTWATCH_HOME child environment; the single test-launched default-home daemon was stopped and startup now explicitly passes the selected home. All subsequent lifecycle/PTY tests use isolated temporary homes and ports.

Limitations: Claude input/cache is supported through documented fixtures, while final output remains unavailable; no real authenticated local Claude sample is present. No historical usage import is performed.

## Final verification — 2026-10-29

- `pnpm test`: 103/103 tests, 20 files, including isolated real PTY acceptance and daemon restart/reconnection.
- `pnpm typecheck`: passed.
- `pnpm build`: passed, including the new TUI bundle and static Next.js web build.
- `pnpm test:e2e`: 22/22 scenarios passed (43.7 seconds).
- `pnpm format:check` and `git diff --check`: passed.
- No test-launched background daemon remained after cleanup.

Ready locally on `codex/terminal-dashboard`. Launch with `pnpm agentwatch tui`; optional `--ascii --mono`. Exit closes the TUI; use `pnpm agentwatch stop` to stop the daemon.

## CI and review follow-up — 2026-10-29

- GitHub Actions ran with `CI=true`, which makes Ink 8 default to non-interactive rendering even on a PTY. AgentWatch now explicitly enables interactive rendering after checking that both streams are terminals. The PTY regression test always exercises the CI environment, and startup failures include a redacted daemon-log excerpt.
- The TUI SSE connection uses a 35-second idle timeout that resets on every chunk. Unrelated services on the daemon port produce a clear error. Analytics reuse loaded ledger rows and avoid repeated array copies and session scans.
- `CI=true pnpm test`: 106/106 passed; the PTY test also passed three additional consecutive runs. `pnpm typecheck` and `pnpm format:check` passed. `CI=true pnpm build` and `CI=true pnpm test:e2e` passed, including 22/22 browser scenarios.

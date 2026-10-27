# AgentWatch MVP Implementation Plan

Goal: Implement the approved local, read-only macOS agent office in the current checkout.
Spec: ../specs/2026-10-27-agentwatch-design.md and agentwatch-original.md (visual requirements).

## Global constraints
- TypeScript strict; Node 24; pnpm; four workspace packages.
- Codex desktop + Codex CLI + Claude Code CLI. One robot per stable provider/session ID.
- Manual start; 127.0.0.1:4317; same-origin static Next export, Hono API and fetch SSE.
- Keep idle sessions; only confirmed session end starts the 60-second removal timer.
- SQLite persistence, seven-day retention, protect confirmed open sessions.
- Read-only, local data, separate UI/ingestion tokens, no external UI resources.

## Review focus
- Recovery must not turn archived logs into confirmed live sessions.
- Shared host PID must not attribute unrelated session metrics or false termination.
- Delayed/duplicate hook and log events must not regress current turns.
- A disconnected or slow SSE client must not retain unbounded memory or lose resync.
- Installing/uninstalling hooks must preserve unrelated and concurrently changed config.

### Task 1: Contracts, normalization, and reducer
- Define shared schemas and pure event normalization for both agents.
- Test and implement identity, turn vs session lifecycle, parallel tools, stale events, redaction and unsupported fields.
- Verify: pnpm test

### Task 2: Persistent service, API, and SSE
- Implement private config, SQLite migrations/retention, service state, protected API, atomic SSE snapshots and bounded clients.
- Verify persistence, retention, authorization, pagination, duplicate handling, reconnect and stream bounds.
- Verify: pnpm test

### Task 3: Collectors, hooks and commands
- Implement bounded JSONL tailing, startup reconciliation, process evidence, hooks forwarding and safe configuration install/uninstall.
- Implement setup/start/doctor commands and capability matrix.
- Verify real files and subprocesses with isolated temporary homes; no tests touch actual agent settings.
- Verify: pnpm test

### Task 4: Accessible live UI and detail panel
- Implement authenticated SSE client, session list, filters and stable detail panel with history pagination.
- Verify selection, scroll, reconnection, privacy expansion, error states and WebGL fallback.
- Verify: pnpm test; pnpm test:e2e

### Task 5: Virtual Office
- Implement procedural cozy low-poly office, per-session robots, state animations, picking and camera controls.
- Integrate the same selection and telemetry store; support reduced motion and stable placement.
- Verify 20 sessions and 3D interactions in browser.
- Verify: pnpm test:e2e

### Task 6: Verification and delivery
- Build and typecheck, run complete tests, review branch and repair significant findings.
- Validate setup/uninstall against isolated configs before actual installation.
- Measure latency and FPS; document real integration limits and launch instructions.
- Verify: pnpm test; pnpm typecheck; pnpm build; pnpm test:e2e

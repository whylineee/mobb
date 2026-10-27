# AgentWatch delivery verification — 2026-10-27

Implemented on branch `codex/agentwatch-mvp` in the existing checkout, as requested. No remote push or merge was performed.

## Checks

- 49 Vitest unit/integration tests pass, including actual SQLite, files, authenticated HTTP/SSE, child-process CLI setup and cross-process hook transaction locking.
- 8 Playwright browser scenarios pass: empty office, distinct sessions and private-text expansion, reconnection without duplicates, 60-second removal with retained drawer, 20 robots and picking, WebGL fallback, stable manual timeline scroll, and visible-update latency.
- Strict TypeScript check, production static build, and Prettier check pass.
- A settled 20-session office measured 31–32 FPS / 106 render calls in Chromium with SwiftShader software rendering and adaptive quality. This is a local software-renderer measurement, not a claim about physical Mac GPU performance.
- The final twenty browser samples measured an observed-hook-to-visible-panel p95 upper bound of 7 ms. A separate compiled hook CLI → actual daemon smoke took 65 ms including process startup and returned exactly `{}`.

## Independent review and regression fixes

A fresh read-only reviewer examined the complete branch. No Critical findings; all five Important findings were reproduced and fixed:

1. Delayed parallel tool starts now reconcile within the current turn without changing newer activity. Completed-call tombstones prevent resurrection after a delayed start.
2. Initial and replacement JSONL bytes are historical regardless of watcher readiness. Only later appended, timestamped records can provide live evidence.
3. SSE uses compact, byte-bounded session summaries and a bounded overview of 200 sessions. Full selected-session text is fetched separately. A regression exercises 20 sessions whose full state exceeds 5 MiB and verifies successful streaming plus intact full-detail retrieval.
4. A SQLite OS-lock serializes the complete hooks ownership/settings transaction across processes. Ownership remains recoverable if writing settings fails. A child-process regression verifies that setup does not mutate settings while a peer holds the lock.
5. Claude sidechain string messages cannot overwrite a parent's task or clear its tools. Delayed child tools and lifecycle events are also reconciled independently, without becoming parent tools or advancing the parent's activity clock.

Full-detail responses carry a revision watermark. An older HTTP response cannot overwrite newer SSE state even when two updates have identical timestamps; unchanged full task text can remain visible while fresh details load.

The reviewer also noted a minor origin-label error. Real CLI evidence established `source: exec` with inherited `originator: Codex Desktop`; the adapter now prioritizes the explicit source. This is an evidence-based correctness decision. If an unsupported source is encountered, origin remains unknown rather than inferred from process identity.

All fixes have regression tests. The fix pass was verified with the full suite rather than a second reviewer.

## Real machine checks

- Actual setup preserved existing Claude/Codex hooks. Local versions: Codex CLI 0.164.0, Codex desktop writer 0.164.0-alpha.11.1, Claude Code 2.1.310, Node 24.22.1.
- Standard `codex exec` completed a tool-free `AGENTWATCH_OK` check successfully; its rollout was observed. The already-running shared daemon had initially cached hooks.
- A separate `codex --disable daemon_auto_start exec` check loaded the new hooks without restarting any existing agents. It completed successfully in 6.4 seconds; AgentWatch observed both hooks and logs, the task, and confirmed session end.
- The currently running Codex desktop session was also observed through both hooks and logs; a local check saw its latest event about 40 ms after receipt.
- Real Claude Code invocation returned `Not logged in · Please run /login`. Authenticated Claude live verification requires the user's login. Claude normalization, forwarding, configuration and browser behavior are covered by fixtures and integration tests.

## Deliberate limits

- Previously open idle sessions cannot be confirmed from historical file presence alone. Their status remains unknown until an actual live signal appears.
- Shared/unbound runtime CPU and RAM are omitted. Parent-child relations are shown only when provided by telemetry.
- Startup scans recover the last 2 MiB per transcript; they do not import every historical record. Full archive UI, raw logs, IDE/SDK support and notifications remain deferred as approved.
- Private prompts and commands remain local. Known credential patterns are masked before storage, but arbitrary secrets in natural language cannot be guaranteed detectable.

The original specification and approved implementation plan are preserved under `docs/superpowers/`.

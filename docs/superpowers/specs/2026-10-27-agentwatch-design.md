# AgentWatch approved design

The user's original visual specification is preserved in agentwatch-original.md.
This document records approved changes and takes precedence over its unresolved questions.

- Local macOS read-only dashboard; TypeScript, Node 24 and pnpm.
- Providers: Codex desktop, Codex CLI, Claude Code CLI. One robot = provider:sessionId.
- Display all confirmed open sessions, including idle ones. Target 20 simultaneous sessions.
- End of response means idle. Confirmed session end means ended; remove robot after 60 seconds, keep selected drawer.
- SQLite persists sessions and normalized events; retain seven days, protect confirmed open sessions. Archive screen deferred.
- Manual single-command start; closing browser does not stop daemon. No launch agent.
- Full prompt/command/output text expands on click. Missing data stays unknown.
- Separate lifecycle (open/ended/unknown), activity (working/waiting/idle/unknown), freshness and evidence.
- Hooks first for BOTH providers, logs for recovery and enrichment, process scan every second.
- No CPU/RAM without exact process binding; shared runtimes are not session-specific metrics.
- SSE snapshot + deltas with revisions, stable events and bounded clients. Reconnect uses fresh snapshot.
- Hono serves Next static export and same-origin API on 127.0.0.1:4317.
- ~/.agentwatch permissions 0700; data and token files 0600; separate UI and ingest credentials.
- UI auth bootstrap in URL fragment, fetch SSE uses Authorization header. Host/Origin validation; no open CORS.
- Preserve existing hooks; idempotent install, scoped uninstall, atomic writes and conflict detection.
- Hook failures never issue approval/continuation decisions. Short transport timeout; async where supported.
- No internal instructions or reasoning imported; mask known secrets before storage. Bounded payloads and explicit truncation.
- Cozy procedural low-poly isometric office, orthographic camera, warm lights and dark background.
- Per-session robots/desks, stable placement, four state animations, unknown indication, picking, tooltip, pan/zoom/reset.
- Drawer: identity/project/status, current task, parallel tools, Activity, Details, evidenced subagents.
- Stable selection, scroll and camera during updates; keyboard, reduced-motion, mobile adaptation and 2D fallback.
- API: GET /api/state, /api/stream, /api/sessions/:id, /api/sessions/:id/events?cursor; POST /api/hooks/:provider.
- Targets: p95 <=1s observed event to UI; <=3s process-detected changes; >=30FPS at 20 sessions on target Mac.
- Deferred: IDE/SDK, archive screen, notifications, menubar, raw logs, multi-room and elaborate movement.

## Execution acceptance
Two sessions in one directory stay distinct. Resume reuses identity; fork creates identity.
No regressions from delayed/duplicate events. Parallel tools remain separate.
Restart/reconnect preserves data without duplicating robots. Uncertain recovered sessions remain unknown.
Malformed/rotated/truncated logs and unavailable sources do not crash collectors.
Unavailable daemon and hook timeouts do not change agent behavior.
Setup/uninstall preserve unrelated configuration. Unauthorized requests are rejected.
No externally loaded UI assets. Fallback monitoring works without WebGL.

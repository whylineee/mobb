# Telemetry capabilities and evidence

Baseline inspected on 2026-10-27: Node 24.22.1, Codex CLI 0.164.0, Codex desktop rollout writer 0.164.0-alpha.11.1, Claude Code 2.1.310. Internal transcript formats are version-dependent; unknown records are skipped.

| Field / behavior | Codex desktop | Codex CLI | Claude Code CLI | Evidence / confidence |
| --- | --- | --- | --- | --- |
| Stable session identity | Hook `session_id`, rollout `session_meta.id` | Same | Hook `session_id`, transcript `sessionId` | Codex local samples: 11/11 `id == session_id`; hook schemas documented |
| Start / resume / fork | `SessionStart.source` | Same | `SessionStart` | Documented; resume identity comes from ID, not PID |
| Current request | `UserPromptSubmit.prompt` | Same | Same | Documented; Codex injected user-role context is deliberately not guessed into a task |
| Tool begin / end | `PreToolUse` / `PostToolUse`, rollout call IDs | Same | Hooks + transcript `tool_use` / `tool_result` | Codex local call records inspected; sanitized fixtures exercise both formats |
| Turn completion | `Stop`, rollout `task_complete` | Same | `Stop` / `StopFailure` | Turn completion is not session completion; other hooks can request continuation |
| Permission check | `PermissionRequest` | Same | Same | Does not alone prove human attention; another hook may handle the decision |
| Confirmed attention | Only explicit supported signals | Same | `Notification.permission_prompt` / elicitation events | Claude permission notification can be delayed; no sub-second guarantee for upstream notifications |
| Session completion | `SessionEnd`; runtime lifecycle | Same | `SessionEnd`; exclusive process exit | Codex may retain disconnected threads for 30 minutes; no end inferred from silence |
| cwd / Git branch | Hook cwd, rollout metadata | Same | Hook cwd; branch optional | Only fields actually supplied are shown |
| PID / CPU / RAM | Shared runtime: unavailable per session | Exact native process binding only | Exact native process binding only | Ancestor identity checked against PID + start time; shared claims excluded |
| Subagents | Hook `agent_id` / type; child session only when separately evidenced | Same | Same, often logical child only | Parent PID is not used to invent parent-child session relationships |
| Previously open idle sessions | Unknown until a live signal or exact runtime evidence | Same | Same | Historical file presence alone cannot prove openness |

## Collection behavior

- JSONL tailing buffers partial UTF-8 lines, bounds records, resumes offsets, detects rotation, truncation and in-place rewrites. Startup reads at most the last 2 MiB per file, plus identity metadata for large Codex rollouts. This is recovery, not a complete import of old transcripts.
- Existing bytes in every newly discovered or replaced file are historical, even after the watcher is ready. Only later appends with valid timestamps after collector startup can establish log-based liveness. Hooks remain the immediate source for a newly created session.
- File changes are watched with chokidar. Runtime processes are sampled every second; transcript errors cannot stop other collectors.
- Native CLI ancestor capture is attempted at `SessionStart`. Node wrappers or a shared daemon can prevent exact attribution; metrics then remain absent.
- Hooks run asynchronously where supported, with one-second outer timeout and 250 ms HTTP deadline. `SessionEnd` is synchronous. CLI stdout is always `{}`; no policy output is generated.
- Codex currently limits background hook concurrency and may cancel unfinished hooks at session end. Log recovery complements hooks but does not turn loss into a false guarantee.
- UI never loads a new Codex app-server or resumes threads to observe them. A separate app-server cannot report another process's in-memory thread state; attaching or subscribing in a way that changes thread lifetime would violate passive monitoring.
- There are no standalone Claude transcript samples on the initial machine inspection. Claude adapter fixtures use the documented hook/transcript schema; actual installation checks are recorded separately during delivery verification.

## Authoritative documentation consulted

- [Codex hooks](https://developers.openai.com/codex/hooks/)
- [Codex app-server lifecycle](https://developers.openai.com/codex/app-server/)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)

## Automated acceptance coverage

The suite exercises distinct sessions, resume, compaction, delayed and parallel calls, correlated-source enrichment, retention, restart, bounded UTF-8 tailing, scoped hook ownership, authentication, SSE recovery and slow consumers. Browser tests exercise both views, 20 robots, selection, full-text expansion, scroll preservation, end visibility, reconnect, WebGL fallback and observed-event latency.

The FPS benchmark uses Chromium's SwiftShader software renderer in this environment, with automatic quality adaptation. Results are measurements of that run, not a hardware-independent performance guarantee. Bare Node startup measured during planning was 18–31 ms; that is not a full hook latency measurement.

## Delivery checks on the local machine

- Setup installed owned hooks for both providers while preserving existing entries; doctor detected Codex 0.164.0 and Claude Code 2.1.310.
- Real `codex exec --json` returned `AGENTWATCH_OK` successfully in about 7 seconds. Its rollout was observed through the log collector. It reported `source: exec` with inherited `originator: Codex Desktop`; explicit source takes precedence in the adapter.
- The compiled hook CLI delivered a real local smoke event in 65 ms, returned exactly `{}`, and its session was then explicitly ended.
- The already-running shared Codex daemon had not reloaded the new hook configuration during the first check. AgentWatch does not restart agents to force configuration reload.
- A later isolated `codex --disable daemon_auto_start exec` run completed in 6.4 seconds and was observed through both hooks and logs, including its prompt and confirmed session end. This command-line override did not restart existing agents or change persistent Codex settings.
- The active Codex desktop session subsequently also supplied hooks and log events, confirming desktop telemetry on this machine.
- Real Claude Code invocation returned `Not logged in · Please run /login`. Authenticated Claude live verification remains dependent on user login; schema and fixture integration tests pass independently.

# Maintenance verification — 2026-10-28

Branch: `codex/maintenance-bounds`, based on `accfacf`. The approved design and implementation plan are in `docs/superpowers/`.

## Changes

- SQLite remains authoritative; the full-session cache holds at most 256 values with least-recently-used eviction. The overview queries at most 200 rows and counts omitted sessions from SQLite.
- History expires after 7 days even for open sessions, with additional limits of 10,000 events per session and 100,000 globally. Current open-session snapshots survive history pruning. Persistent timestamp floors suppress replay of pruned historical transcript records; retained events still support correlated hook/log enrichment.
- The existing database schema migrates in place. Startup revalidates persisted openness without loading the whole sessions table into JavaScript. Current snapshots remain available after cache eviction.
- Session details have a separate persisted revision. Process samples do not trigger another full-text request; semantic events do. Restart revalidation advances the detail revision, and stale HTTP responses cannot override a newer semantic state.
- Office primitives/instances, furniture, room, desks, camera and fallback boundary have separate modules. Session overview/activity/details and reusable text controls are separated; Dashboard delegates login and session list rendering.
- Every `latest` package specifier is pinned to its existing lockfile resolution. The lockfile packages and snapshots sections are unchanged.
- GitHub Actions checks install, tests, types, formatting, build and Chromium E2E on macOS. Dependabot proposes weekly npm/GitHub Actions updates without automatic merging.
- README now documents immediate robot removal, the UTF-16 text limit, retained Retina DPR, and bounded history/cache. The original delivery report is explicitly historical.

## Local checks

- Node.js 24.22.1; pnpm 11.25.0.
- `pnpm install --frozen-lockfile`: passed, resolutions unchanged.
- `pnpm test`: 72 tests passed across 13 files.
- `pnpm typecheck`: passed.
- `pnpm format:check`: passed.
- `pnpm build`: passed, static Next.js export.
- `pnpm test:e2e`: 22 scenarios passed after UI extraction, including the new process-only request-budget regression.
- Workflow and Dependabot YAML parsed successfully; triggers, read-only permissions and macOS platform checked. The selected action tags were verified against their official repositories, with API usage checked through Context7.

New behavioral checks were first observed failing for retention limits, replay suppression, semantic detail revisions, stale same-clock responses and unnecessary browser detail requests, then passed after implementation. Additional compatibility coverage exercises version-one SQLite migration, least-recently-used eviction, disk read-through, startup trimming, pagination and process updates outside the cache.

The local software-renderer sample after extraction measured 20 agents at 18 FPS, 11 render calls, a 20 FPS animation target, and 0 shadow refreshes during the sampled typing animation. The observed hook-to-panel p95 upper bound was 281 ms. These are measurements of one local Chromium/SwiftShader run, not a hardware-independent performance guarantee.

## Boundaries

- History limits count records, not bytes. Current snapshots of open sessions remain persistent and may retain private task/tool text older than the timeline. SQLite file size can retain free pages after row deletion; this change does not promise an exact disk/RAM quota.
- The 7-day age sweep runs at startup and hourly; count limits are applied as events are ingested.
- Real Claude/Codex settings and hooks were not changed for these checks. Tests use temporary directories and a separate fixture server; live authenticated external agents were not revalidated.
- GitHub-hosted CI has not run locally. Its actual hosted status will be available after the branch is pushed.
- The current codebase-memory transport is unavailable. Structural changes were checked against direct source reads and type/unit/browser checks; current graph completeness is not asserted.

## Final review

A fresh whole-branch review is the remaining delivery gate; its result and any verified fixes will be recorded here before delivery.

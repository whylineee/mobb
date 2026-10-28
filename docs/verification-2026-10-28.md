# Maintenance verification — 2026-10-28

Branch: `codex/maintenance-bounds`, based on `accfacf`. The approved design and implementation plan are in `docs/superpowers/`.

## Changes

- SQLite remains authoritative; the full-session cache holds at most 256 values with least-recently-used eviction. The overview queries at most 200 rows and counts omitted sessions from SQLite.
- History expires after 7 days even for open sessions, with additional limits of 10,000 events per session and 100,000 globally. Current open-session snapshots survive history pruning and repeated restart through a separate persisted retention-protection flag; liveness still requires fresh confirmation. Persistent timestamp floors suppress replay of pruned historical transcript records; retained events still support correlated hook/log enrichment.
- The existing database schema migrates in place. Startup revalidates persisted openness without loading the whole sessions table into JavaScript. Current snapshots remain available after cache eviction.
- Session details have a separate persisted revision. Process samples do not trigger another full-text request; semantic events do. Restart revalidation advances the detail revision, and stale HTTP responses cannot override a newer semantic state.
- Office primitives/instances, furniture, room, desks, camera and fallback boundary have separate modules. Session overview/activity/details and reusable text controls are separated; Dashboard delegates login and session list rendering.
- Every `latest` package specifier is pinned to its existing lockfile resolution. The lockfile packages and snapshots sections are unchanged.
- GitHub Actions checks install, tests, types, formatting, build and Chromium E2E on macOS. Dependabot proposes weekly npm/GitHub Actions updates without automatic merging.
- README now documents immediate robot removal, the UTF-16 text limit, retained Retina DPR, and bounded history/cache. The original delivery report is explicitly historical.

## Local checks

- Node.js 24.22.1; pnpm 11.25.0.
- `pnpm install --frozen-lockfile`: passed, resolutions unchanged.
- `pnpm test`: 75 tests passed across 13 files after the final regression fix pass.
- `pnpm typecheck`: passed.
- `pnpm format:check`: passed.
- `pnpm build`: passed, static Next.js export.
- `pnpm test:e2e`: 22 scenarios passed after UI extraction and the final regression fixes, including the new process-only request-budget regression.
- Workflow and Dependabot YAML parsed successfully; triggers, read-only permissions and macOS platform checked. The selected action tags were verified against their official repositories, with API usage checked through Context7.

New behavioral checks were first observed failing for retention limits, replay suppression, semantic detail revisions, stale same-clock responses and unnecessary browser detail requests, then passed after implementation. Additional compatibility coverage exercises version-one SQLite migration, least-recently-used eviction, disk read-through, startup trimming, pagination and process updates outside the cache.

The local software-renderer sample after extraction measured 20 agents at 17 FPS, 11 render calls, a 20 FPS animation target, and 0 shadow refreshes during the sampled typing animation. The observed hook-to-panel p95 upper bound was 131 ms. These are measurements of one local Chromium/SwiftShader run, not a hardware-independent performance guarantee.

## Boundaries

- History limits count records, not bytes. Current snapshots of open sessions remain persistent and may retain private task/tool text older than the timeline. SQLite file size can retain free pages after row deletion; this change does not promise an exact disk/RAM quota.
- The 7-day age sweep runs at startup and hourly; count limits are applied as events are ingested.
- Real Claude/Codex settings and hooks were not changed for these checks. Tests use temporary directories and a separate fixture server; live authenticated external agents were not revalidated.
- GitHub-hosted CI has not run locally. Its actual hosted status will be available after the branch is pushed.
- The implementation session’s codebase-memory transport was unavailable. The independent reviewer refreshed its graph to generation 2026-10-28T17:49:15Z and checked relevant source paths (metadata_match, no recorded issue). Final regression fixes were checked directly and with type/unit/browser checks; absolute graph completeness is not asserted.

## Final review

GPT-6.1 Sol independently reviewed `accfacf…1168bd8`. No Critical findings; two Important findings and one bulk-cleanup memory finding were reproduced and fixed:

1. An aged open snapshot could be deleted after restart/migration reset lifecycle to unknown. A separate persistent retention-protection flag now survives repeated restart; confirmed session end releases it. Regressions cover old-schema migration, repeated restart and eventual expiration after confirmed end.
2. Matching task timestamps and preview prefixes could reuse an old full prompt across conflicting semantic revisions. The fallback now requires matching detail versions; a same-clock hidden-suffix edit regression first failed, then passed.
3. Cleanup collected all deleted keys in one array. Although originally graded Minor by the reviewer, this was treated as Important because it contradicted bounded startup memory. Cleanup now deletes and notifies in batches of at most 256 keys; startup does not collect the batches. A 600-session regression first failed, then passed.

The fix pass is verified by regression tests and the complete checks, without a second review. The original Astra reviewer was interrupted at the user's request and replaced by GPT-6.1 Sol; no Astra review was used as the delivery verdict.

Delivery choices: reuse the existing checkout on a local feature branch rather than create another checkout; execute the approved plan natively without another permission round; leave integration/push outside this task. Preserve previously open snapshots independently of unknown liveness after restart (this can retain a snapshot until confirmed end); treat bulk-cleanup arrays as an Important bounded-memory issue and fix them. No review findings remain deferred.

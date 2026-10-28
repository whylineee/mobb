# AgentWatch Maintenance Implementation Plan

> **For agentic workers:** Execute task-by-task using superpowers:executing-plans. Steps use checkbox syntax for progress.

**Goal:** Fix the five approved maintenance findings without changing the office UX.
**Architecture:** SQLite remains authoritative; a bounded session cache and bounded event history control growth. A separate detailsRevision avoids fetching full text for process samples. UI components are extracted along existing responsibility boundaries.
**Tech Stack:** Node 24, pnpm 11.25.0, TypeScript, SQLite/better-sqlite3, React/Next.js, GitHub Actions.
**Spec:** docs/superpowers/specs/2026-10-28-maintenance-design.md (approved by user: “давай”).

## Global Constraints

- Event retention: 7 days, 10,000 events/session, 100,000 globally; current open-session state survives history pruning.
- Session cache: 256; overview: 200. Cache eviction never deletes persistent sessions.
- Preserve restart revalidation, correlated-source deduplication, revision ordering, auth, camera, DOM/accessibility, and animation budgets.
- Keep real agent settings untouched; use isolated fixtures.
- Pin latest dependencies to existing resolved versions; do not upgrade packages.
- CI uses macOS, Node 24, pnpm 11.25.0, read-only repository permission.

## Review Focus

- A pruned event replayed from a transcript must not regrow history or undo newer state.
- Evicted sessions must retain details and receive process updates correctly; all persisted sessions must revalidate on restart.
- Same-clock semantic updates must invalidate full details; metric-only changes must not.
- Existing SQLite databases must migrate without deleting current open-session snapshots.
- Extraction must preserve instancing context, geometry disposal, focus, and timeline scroll.

### Task 1: Bounded storage

Files: daemon/src/service.ts; new daemon/src/storage.ts and storage.test.ts; daemon/src/service.test.ts.
Interfaces: storage owns SQLite schema, bounded cache and retention; AgentService retains public get/ingest/events/snapshot/subscribe/updateProcess/cleanup/close contracts. Defaults are the exact approved limits; constructor overrides allow embedding with smaller budgets and deterministic tests.

- [x] Add failing retention/cache/restart/replay/pagination tests using real SQLite.
- [x] Run pnpm exec vitest run packages/daemon/src/storage.test.ts; expect behavior failures.
- [x] Implement bounded storage and migrate existing schema; integrate service.
- [x] Run pnpm test; expect all tests pass with the intentionally updated retention expectation.
- [x] Commit the independently verified storage deliverable.

### Task 2: Detail revisions and panel loading

Files: shared/src/index.ts; daemon/src/service.ts and summary.ts; web/src/lib/details.ts and details.test.ts; new web/src/lib/use-session-details.ts; SessionPanel.tsx; tests/e2e/office.spec.ts.
Interfaces: optional Session.detailsRevision persists semantic revision, stays stable for updateProcess; summary/full carry it. Panel hook depends on key/detailsRevision/syncVersion with legacy fallback; mergeDetails rejects old semantic data and retains current summary process.

- [x] Add failing tests for stable metric-only revision, changing semantic revision, stale same-clock response and no redundant UI detail request.
- [x] Run targeted Vitest tests; expect new behavior failures.
- [x] Implement revision propagation, merge and extracted hook.
- [x] Run pnpm test and relevant browser regression after production build; expect pass.
- [x] Commit verified revision/loading deliverable.

### Task 3: UI responsibility boundaries

Files: components/Office.tsx, SessionPanel.tsx, Dashboard.tsx; new components/office/{primitives,furniture,camera,boundary}.tsx, components/session/{elements,overview,activity,details}.tsx, Login.tsx and SessionList.tsx.
Interfaces: preserve existing component props and DOM; share instancing context through one primitives module; keep camera geometry/helpers unchanged.

- [x] Extract pure existing components after the green baseline; no behavior changes.
- [x] Run pnpm typecheck, pnpm test, pnpm build, pnpm test:e2e; expect pass.
- [x] Commit verified extraction.

### Task 4: Dependencies, CI and documentation

Files: package.json, packages/*/package.json, pnpm-lock.yaml; new .github/workflows/ci.yml and .github/dependabot.yml; README.md, docs/verification.md and new docs/verification-2026-10-28.md.
Interfaces: exact versions match current lockfile resolutions; CI runs frozen install/test/typecheck/format/build/Chromium E2E; Dependabot proposes weekly updates without merging.

- [x] Replace latest and synchronize lockfile specifiers without package upgrades.
- [x] Add CI/Dependabot using documented current actions versions and upload failure artifacts.
- [x] Update lifecycle/text/DPR/retention docs and mark old verification as historical.
- [x] Run frozen install and every local check, validate workflow YAML, record actual results.
- [x] Commit verified tooling/docs deliverable.

## Completion

- [x] Fresh whole-branch review against spec, review focus and ledger; fix important findings with RED→GREEN tests and a green suite.
- [x] Report actual checks, external CI limitation and local branch state; do not push or merge.

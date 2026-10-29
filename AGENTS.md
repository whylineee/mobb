# AgentWatch agent guide

AgentWatch is a local, read-only monitor for Claude Code and Codex on macOS.
Read `README.md` for current product behavior and development commands.

## Repository guidance

Read `/Users/msa/.codex/RTK.md` for command-output handling on this machine.

### Context7

Use Context7 MCP for current documentation whenever a task depends on a library,
framework, SDK, API, CLI tool, or cloud service, including syntax, configuration,
migration, setup, and platform-specific debugging. Use it even for familiar APIs;
prefer it over web search for library documentation. General programming concepts
and code work independent of these APIs do not require Context7.

1. Start with `resolve-library-id`, providing the library name and documentation
   question, unless the user supplied an exact `/org/project` library ID.
2. Choose by exact name, relevance, snippet coverage, source reputation, and
   benchmark score. Use a version-specific ID when a version is requested; retry
   with alternate names or queries when matches are poor.
3. Call `query-docs` with the selected ID and a specific question. Query distinct
   concepts separately unless their interaction is the question.
4. Base API guidance and implementation decisions on the fetched documentation.

### CodeGraph

When `.codegraph/` exists, use `codegraph_explore` before text searches or file
reads to locate or understand indexed code. Name files or symbols to retrieve
their current source and call paths. The shell fallback is
`codegraph explore "<symbols or question>"`.

Use direct reads for documentation, configuration, or details absent from the
graph. If the index is unavailable or stale, inspect the relevant files directly.
When `.codegraph/` is absent, skip CodeGraph; indexing is the user's decision.

## Where changes belong

- `packages/shared`: validated telemetry contracts, session types, process and
  analytics contracts shared by the daemon and clients.
- `packages/daemon`: collectors, telemetry reduction, SQLite persistence,
  analytics, hook installation, CLI, and authenticated HTTP/SSE endpoints.
- `packages/hook-cli`: bounded, fail-open hook delivery to the daemon.
- `packages/web`: statically exported Next.js UI, Zustand telemetry state, and
  React Three Fiber office. Office components live in `components/office/`;
  session-panel tabs live in `components/session/`.
- `packages/tui`: Ink terminal dashboard, client connection, state, and views.

Before changing collection, liveness, or token accounting, read
`docs/telemetry-sources.md`. For office rendering or camera changes, read
`docs/office-3d-design.md`. Designs and implementation plans live in
`docs/superpowers/`; verification reports record historical runs, not current
test results.

## Behavioral constraints

- Keep monitoring passive: observing an agent must preserve its execution,
  permissions, and session lifetime. Hooks return `{}` and must not block agents
  when the daemon is unavailable.
- Keep the daemon bound to loopback, preserve separate UI/hook authentication,
  Host/Origin checks, private file permissions, and redaction before persistence.
  Keep UI assets local and preserve the absence of external analytics.
- Use temporary homes, agent settings, and ports for tests. Setup and hook
  uninstall modify provider settings; exercise them against isolated fixtures
  unless the task explicitly calls for changing the user's installation.
- Session identity is `provider:sessionId`. Historical transcripts, silence,
  permission checks, and shared processes cannot alone establish live sessions,
  human attention, session completion, or per-session process metrics. Represent
  unsupported observations as unknown or unavailable.
- Token counters need deduplication, historical baselines, restart handling, and
  correction handling. Cache is included in input and reasoning in output;
  preserve partial usage instead of inventing totals. Observation gaps stay gaps.
- SQLite is authoritative. Cache eviction and overview limits must not delete
  sessions or restrict global analytics. Retain protected current snapshots
  independently of event-history pruning and require fresh liveness evidence
  after restart.
- Preserve Ukrainian user-facing copy, keyboard access, reduced motion, WebGL
  fallback, and bounded rendering work when changing the UI.

## Validation

Use Node.js 24 and the pnpm version pinned in `package.json`. Install dependencies
with `pnpm install --frozen-lockfile`. Keep dependency changes reflected in
`pnpm-lock.yaml`.

- `pnpm test` builds server bundles and runs colocated `*.test.ts` tests,
  including isolated lifecycle and PTY checks.
- `pnpm typecheck` checks packages, scripts, and tests.
- `pnpm format:check` checks `packages`, `scripts`, and `tests`; target formatting
  to changed files when fixing failures.
- `pnpm build` builds all bundles and the static web export. The regular daemon
  serves this export, so rebuild UI changes before browser tests.
- `pnpm test:e2e` runs browser scenarios with the fixture server on
  `127.0.0.1:4318`. Install Chromium with
  `pnpm exec playwright install chromium` when needed.

For code changes, run the affected tests and applicable checks above; the full
CI sequence is authoritative in `.github/workflows/ci.yml`. For documentation-only
changes, check referenced paths and commands and run `git diff --check`.
Report the checks actually run and any failures or verification limits.

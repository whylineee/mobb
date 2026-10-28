# AgentWatch terminal dashboard

Approved specification: the implementation request in this chat, 2026-10-28.

- [x] Usage normalization, persistent checkpoints and evidence-based agent identities.
- [x] Seven-day statistics, paginated agents API and daemon lifecycle commands.
- [x] Ink terminal dashboard, filters, charts, details and responsive keyboard navigation.
- [x] PTY integration, existing regression suite, typecheck, build, format and independent review.

Defaults: 24h selected; 1h/24h/7d available; no historical usage import; own tokens per row; global current counts unfiltered. Node24, React19.3.1, Ink8. Daemon outlives the TUI. Unknown usage remains unavailable/partial.

Implementation notes and validation are recorded in docs/verification-terminal-dashboard.md.

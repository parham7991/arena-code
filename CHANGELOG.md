# Changelog

All notable changes to **Arena Code** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Changes are grouped as **Added**,
**Changed**, **Fixed**, and **Removed**.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

- (placeholder for the next release)

---

## [0.1.0] - 2026-08-03

Initial release of **Arena Code** — a terminal coding-agent harness that drives
the local [arena-account-bridge](https://github.com/parham7991/arena-account-bridge)
and executes tools on your local files.

### Added

- **M1 — Core harness**
  - Local tools: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` with a central registry.
  - Agent loop (`runAgent`): reason → execute tool → feed result back → repeat, with a `maxTurns` cap.
  - System prompt and OpenAI-format tool schemas.
  - Mock bridge for offline development.
  - CLI one-shot mode.

- **M2 — Bridge client + streaming**
  - `BridgeClient.chat()` and `chatStream()` (SSE) for the OpenAI-compatible endpoint.
  - Automatic backoff on `429`/`503` using `Retry-After` + exponential backoff.
  - `x-codex-session-id` header support.
  - JSONL session persistence (`SessionStore`), `--continue`, `--session`.

- **M3 — Interactive TUI**
  - `ink`/React TUI: multiline input (Shift+Enter), "Thinking…" spinner, live tool rows, collapsible tool results.
  - Slash commands `/help`, `/clear`, `/quit`.

- **M4 — Sessions + project memory + context**
  - Auto-save after every turn; `--sessions` listing; `--session-id` alias.
  - `ARENA_CODE.md` project memory folded into the system prompt.
  - Token estimation and tool-message pruning.

- **M5 — Full context management**
  - LLM-based compaction (`compactMessagesWithLLM`) with a deterministic fallback.
  - Prune-first pipeline (`manageContextAsync`).
  - Live token counter in the TUI header.

- **M6 — Multi-agent Team Leader**
  - `arena-code team "<task>"`: plan → spawn sub-agents (each with a distinct `x-codex-session-id`) → merge results.
  - Concurrency limit (`ARENA_TEAM_CONCURRENCY`).

- **M7 — Release prep**
  - Bilingual (EN + FA) README, `LICENSE`, `.gitignore`, `.npmignore`.
  - `CONTRIBUTING.md` and this `CHANGELOG.md`.
  - npm release metadata (`files`, `exports`, `bin`, `prepublishOnly`).

### Changed

- CLI entry point and shared engine (`createEngine`) used by both one-shot and TUI modes.
- Context compaction upgraded from deterministic-only to LLM-backed with fallback.

### Fixed

- `**` glob patterns now match across zero or more directories.
- `node --test` scoped to explicit test files so the mock bridge doesn't hang the runner.

### Security

- Tools return errors rather than throwing; `Bash` has a timeout and output cap.
- All communication stays on the local bridge (`127.0.0.1`).

---

[Unreleased]: https://github.com/parham7991/arena-code/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/parham7991/arena-code/releases/tag/v0.1.0

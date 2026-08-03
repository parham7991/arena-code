# Contributing to Arena Code

Thanks for helping improve **Arena Code**! This guide covers how to contribute,
how the project is structured, and the conventions we follow.

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Project overview](#project-overview)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Conventions](#conventions)
- [Running tests](#running-tests)
- [How to contribute](#how-to-contribute)
- [Release process](#release-process)

## Code of conduct

Be kind and constructive. This is a friendly open-source project. Harassment,
trolling, or gatekeeping are not welcome.

## Project overview

Arena Code is a **terminal coding-agent harness** (in the spirit of Claude Code /
Codex / OpenCode). It does **not** contain a model — it drives a local
[arena-account-bridge](https://github.com/parham7991/arena-account-bridge), which
logs into your own Arena account and exposes an OpenAI-compatible API. Arena Code
provides the agent loop, the local tool layer, the TUI, sessions, context
management, and the multi-agent team leader.

It is written in **plain ESM JavaScript (`.mjs`)** on **Node.js ≥ 18**, with the
interactive TUI built on **ink/React**.

## Development setup

```bash
git clone https://github.com/parham7991/arena-code.git
cd arena-code
npm install          # installs ink / react / @inkjs/ui
npm test             # runs the full test suite
```

To run the CLI from the repo:

```bash
node src/cli.mjs --help
```

For offline work, start the included mock bridge and point Arena Code at it:

```bash
node test/mock-bridge.mjs --port 20141
ARENA_BRIDGE_URL=http://127.0.0.1:20141 node src/cli.mjs -p "hello" --cwd ./some-project
```

## Project layout

```
arena-code/
├── package.json          # bin, exports, scripts, release metadata
├── docs/ARCHITECTURE.md  # full design doc
├── src/
│   ├── cli.mjs           # entry point (TUI / one-shot / team / sessions)
│   ├── config.mjs        # env config
│   ├── bridge.mjs        # BridgeClient: chat + chatStream (SSE), backoff
│   ├── agent.mjs         # the core agent loop
│   ├── session.mjs       # JSONL session persistence
│   ├── context.mjs       # token estimate, pruning, compaction
│   ├── team.mjs          # multi-agent Team Leader
│   ├── prompts/          # system prompt + ARENA_CODE.md memory
│   ├── tools/            # Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
│   └── ui/               # ink/React TUI components
└── test/                 # node:test suites + mock bridge
```

## Conventions

- **ESM only** — every source file is `.mjs` with `import`/`export`. No CommonJS.
- **No external runtime deps** except the TUI stack (`ink`, `react`, `@inkjs/ui`).
  Keep `src/` free of other dependencies.
- **Strict error handling** — tools return `{ error: "..." }` rather than throwing.
- **Paths resolve against `ctx.projectRoot`** — never trust raw paths from the model.
- **Tests use `node:test`** (no extra test framework).
- Keep functions small, documented (JSDoc), and side-effect-free where possible.

## Running tests

```bash
npm test
```

The suite covers: tools, the agent loop, streaming + backoff, sessions, the UI
(rendered via `renderToString`), context management + project memory, and the
team leader.

## How to contribute

1. **Open an issue** describing the bug or feature you intend to work on.
2. **Fork** the repo and create a branch (`feat/...` or `fix/...`).
3. Write a failing test, then implement the change.
4. Ensure `npm test` passes.
5. Open a **pull request** referencing the issue.

### Guidelines

- For new tools: follow the `{ schema, execute }` shape in `src/tools/` and
  register them in `src/tools/registry.mjs`. Add unit tests.
- For new CLI flags: update `parseArgs`, `printHelp`, and the README.
- Keep the architecture doc in `docs/ARCHITECTURE.md` in sync if the design changes.

## Release process

Maintainers use the following flow to publish to npm:

```bash
# 1. Bump the version (semver)
npm version patch   # or minor / major

# 2. Update CHANGELOG.md under "Unreleased" -> the new version

# 3. Dry-run the package contents
npm pack --dry-run

# 4. Publish (runs `prepublishOnly` -> `npm test` first)
npm publish

# 5. Tag the release on GitHub
git tag v0.1.0
git push origin main --tags
```

> `prepublishOnly` runs the test suite automatically, so a broken build cannot
> be published.

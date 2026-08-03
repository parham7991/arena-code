<div align="center">

# Arena Code

**A Claude Code / Codex / OpenCode-style terminal coding agent, powered by your own Arena account.**

<br/>

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-339933.svg)](package.json)
[![Tests](https://img.shields.io/badge/Tests-107%20passing-10B981.svg)](#-tests)
[![Made by](https://img.shields.io/badge/Made%20by-AraTmDev-F43F5E.svg)](https://github.com/parham7991)

</div>

---

Arena Code connects to your **own** [arena-account-bridge](https://github.com/parham7991/arena-account-bridge)
(which logs into your Arena account and exposes an OpenAI-compatible API) and gives you a
**coding-agent harness**: an interactive terminal, a tool layer that edits **your real local files**,
persistent sessions, context management, and a multi-agent team leader.

**English** · [فارسی](#-فارسی)

---

## ✨ Features

- **Interactive TUI** — multiline input, live "Thinking…" spinner, live tool rows, collapsible tool results, slash commands.
- **One-shot mode** — `arena-code -p "task"` for scripts and CI.
- **Real local tools** — `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion` execute on your machine.
- **SSE streaming** with automatic **backoff** on `429`/`503`.
- **Persistent sessions** — auto-saved after every turn, `--continue` / `--session-id` / `--sessions`.
- **Project memory** — `ARENA_CODE.md` is folded into the system prompt (like `CLAUDE.md` / `AGENTS.md`).
- **Context management** — token estimate, automatic pruning of large tool results, and `/compact` with LLM-based summarization.
- **Multi-agent Team Leader** — `arena-code team "task"` breaks the work into sub-tasks and runs them in parallel.
- **Skills** — reusable workflows (code-review, refactor, debug, test, …) as YAML in `.arena-code/skills/`.
- **Plugins** — add tools/commands/hooks; built-ins include git, snapshot, linter, testing, telemetry, docker, database, ci, web.
- **Hooks/Events bus** — plugins/skills can subscribe to lifecycle events.
- **MCP client** — connect MCP stdio servers via `.arena-code/mcp.json`.
- **Diff viewer, file watcher, sub-agents, i18n (en/fa), themes**, and a full slash-command set.

---

## 🚀 Install (easy, like Claude Code)

After install, just type **`arena`** in a terminal to open the interactive UI.

### One-line installer

```bash
# Install from the repo (sets up `arena` command + optional bridge + WARP)
curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh | bash

# With the bridge + WARP proxy (recommended for real usage):
curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh | \
  ARENA_EMAIL=you@example.com ARENA_PASSWORD='your-password' bash -s -- --bridge --warp
```

### Global / npx

```bash
npm install -g arena-code          # global install (provides `arena` AND `arena-code`)
npx arena --help                   # or run via npx without installing
npx arena --selftest               # verify everything works (offline)
```

### From source (development)

```bash
git clone https://github.com/parham7991/arena-code.git
cd arena-code
npm install                          # ink / react / @inkjs/ui / js-yaml
npm link                             # make `arena` available on PATH
npm test                             # 107 tests
node src/cli.mjs --selftest          # offline self-check
```

### Shell completion (optional)

```bash
# bash
echo 'source ~/.local/share/arena/completions/arena.bash' >> ~/.bashrc
# zsh
echo 'fpath+=(path/to/arena/completions)' >> ~/.zshrc  # and `autoload -U compinit; compinit`
```

### WARP proxy (avoid Cloudflare challenges)

Arena Code includes a **pure-Node WARP setup** that registers a free Cloudflare
WARP account and starts a SOCKS5 proxy on `127.0.0.1:40000`, so the bridge avoids
Cloudflare "Just a moment…" checks.

```bash
bash warp.sh            # register WARP account + start proxy
# Then run the bridge with:
export ARENA_AGENT_PROXY=socks5://127.0.0.1:40000
```

You can also install with `--warp` to set it up automatically:

### Prerequisite: the bridge

Arena Code is a **harness**; it needs the [arena-account-bridge](https://github.com/parham7991/arena-account-bridge)
running locally so it can talk to your Arena account.

```bash
# 1. Install the bridge (logs into your arena.ai account with email/password)
git clone https://github.com/parham7991/arena-account-bridge.git
cd arena-account-bridge
bash install.sh --warp --email you@example.com --password 'your-password'

# 2. It starts on http://127.0.0.1:20140
```

For **offline development** you can run the included mock bridge instead:

```bash
node test/mock-bridge.mjs --port 20141
```

---

## 🖥 Usage

```bash
# Interactive TUI (needs a real terminal)
arena-code --cwd ./some-project
#     In the TUI: type a task, Enter to send, Shift+Enter for a newline,
#     Tab/e to expand a tool result, /help, /clear, /compact, /quit, Ctrl+C.

# One-shot (streaming by default)
arena-code -p "Create a greeting file" --cwd ./some-project

# Resume the last session for a project
arena-code -p "continue fixing bugs" --continue --cwd ./some-project

# Continue a specific session, or list sessions
arena-code -p "..." --session-id <id> --cwd ./some-project
arena-code --sessions --cwd ./some-project

# Multi-agent team
arena-code team "Build a small web app" --cwd ./some-project
```

### Options

| Flag | Description |
| --- | --- |
| `-p, --prompt <text>` | The task for the agent. |
| `team "<task>"` | Run as a multi-agent team leader. |
| `-c, --cwd <dir>` | Project directory (default: current dir). |
| `-k, --key <key>` | Bridge API key (`ARENA_BRIDGE_KEY`). |
| `-u, --url <url>` | Bridge URL (default `http://127.0.0.1:20140`). |
| `-m, --max-turns <n>` | Max agent turns (default 60). |
| `-t, --team-concurrency <n>` | Max parallel sub-agents (default 3). |
| `-a, --autonomy <ask\|auto>` | Tool approval policy (default `ask`). |
| `--stream` / `--no-stream` | Toggle streaming in one-shot mode. |
| `--continue` | Resume the most recent session. |
| `--session / --session-id <id>` | Continue a specific session. |
| `--sessions` | List saved sessions and exit. |
| `-h, --help` | Show help. |

### Environment

| Variable | Default |
| --- | --- |
| `ARENA_BRIDGE_URL` | `http://127.0.0.1:20140` |
| `ARENA_BRIDGE_KEY` | *(empty)* |
| `ARENA_AUTONOMY` | `ask` |
| `ARENA_MAX_TURNS` | `60` |
| `ARENA_TEAM_CONCURRENCY` | `3` |
| `ARENA_CODE_DIR` | `~/.arena-code` |

---

## 🧠 How it works

```
You ──▶ Arena Code TUI ──▶ arena-bridge (127.0.0.1:20140) ──▶ your Arena account
        │                          ▲
        │                          │  reasoning + tool_calls
        ▼                          │
   Local tool harness              │
   (Read/Write/Edit/Bash/...)      │
   edits YOUR real files ◀─────────┘
```

The bridge turns your Arena agent session into an OpenAI-compatible API. Arena Code is the
**harness**: it runs the agent loop, executes the model's tool calls on your real machine, and
feeds results back, looping until the task is done.

---

## 🧠 Skills, Plugins, MCP (M4+)

### Skills

Skills are reusable workflows. Built-ins (loaded by default, run on demand):

`code-review`, `refactor`, `debug`, `test`, `scaffold`, `deploy`, `security-audit`,
`docs`, `translate`, `explain`.

```bash
# In the TUI
/skills            # list skills
/skill code-review # run a skill
/skill-create      # wizard to create a new skill
```

Add your own skills as YAML (or JSON) in:
- project: `.arena-code/skills/*.yaml` (highest priority)
- user: `~/.arena-code/skills/*.yaml`
- built-in: `src/skills/built-in/*.yaml`

```yaml
name: my-skill
description: Does something useful
trigger: "/my"
system_prompt_extension: |
  You are an expert at this thing.
steps:
  - name: step 1
    prompt: Do the first thing.
```

### Plugins

Plugins add tools/commands/hooks. Built-ins are enabled by default and can be
disabled via `.arena-code/plugins.json`. Load sources: project
`.arena-code/plugins/*.mjs`, user `~/.arena-code/plugins/`, and npm
`arena-code-plugin-*`.

```bash
/plugins            # list loaded plugins
```

Built-in plugins: `git` (status/diff/log/commit/push + `/git`, `/commit`, `/push`),
`snapshot` (`/snap`, `/rollback`), `linter` (`Lint`, `Format`), `testing`
(`/test`, `/coverage`), `telemetry` (`/stats`), plus `docker`, `database`, `ci`, `web`.

### Hooks / Events

Plugins and skills subscribe to lifecycle events through a shared bus:
`onSessionStart/End`, `onTurnStart/End`, `onToolBefore/After`, `onBridgeBefore/After`,
`onMessageAdd`, `onContextPrune/Compact`, `onSkillStart/End`, `onError`,
`onExternalChange`, `onSlashCommand`.

### MCP

Connect MCP servers (stdio transport) in `.arena-code/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-server-filesystem", "/path/to/project"],
      "transport": "stdio"
    }
  }
}
```

Their tools are converted to OpenAI function-calling and merged with the built-ins
(see `src/mcp/`).

---

## 🧪 Tests

```bash
npm test        # 107 tests: tools + agent loop + streaming/backoff + sessions + UI + context + team + hooks + skills + plugins + MCP + diff + theme/i18n + commands + subagents
```

> The interactive TUI requires a real terminal (TTY) because ink uses raw keyboard input.

---

## 🔒 Security

- Talks only to your local bridge on `127.0.0.1`; never exposes the port publicly.
- Credentials and cookies are stored encrypted by the bridge (AES-256-GCM).
- `Bash` has a timeout and output cap; destructive commands require approval by default.
- Session history is stored locally under `~/.arena-code/`.

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📜 License

[MIT](LICENSE) © AraTmDev.

---

## <a id="فارسی"></a> فارسی

### این ابزار چیه؟

**Arena Code** یک کدینگ-اجنت ترمینالی (شبیه Claude Code / Codex / OpenCode) است که به
بریج لوکال [arena-account-bridge](https://github.com/parham7991/arena-account-bridge) وصل
می‌شود و ابزارها را روی **فایل‌های واقعیِ محلیِ تو** اجرا می‌کند.

### نصب

```bash
npm install -g arena-code      # نصب سراسری
npx arena-code --help          # یا اجرا با npx
```

پیش‌نیاز: بریج ارنا را بالا بیاور (لاگین با ایمیل/پسورد روی arena.ai، روی پورت 20140).

### استفاده

```bash
arena-code --cwd ./پروژه-من                # حالت تعاملی
arena-code -p "یک فایل خوش‌آمد بساز"        # یک‌باره
arena-code team "یک وب‌اپ بساز"            # چند-آژنتی (تیم‌لیدر)
arena-code -p "ادامه بده" --continue       # ادامه آخرین سشن
arena-code --sessions --cwd ./پروژه-من     # لیست سشن‌ها
```

### امکانات

- TUI تعاملی با ورودی چندخطی، اسپینر، نمایش زنده ابزارها و دستورات `/compact`, `/clear`, `/quit`.
- ابزارهای محلی واقعی: `Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `AskUserQuestion`.
- استریم SSE با backoff خودکار، سشن‌های ماندگار، پروژه-مموری `ARENA_CODE.md`، و مدیریت کانتکست.
- تیم‌لیدر چند-آژنتی با `x-codex-session-id` مجزا برای هر زیر-آژنت.

### امنیت

فقط با بریج لوکال روی `127.0.0.1` ارتباط برقرار می‌کند؛ تاریخچه سشن به‌صورت محلی ذخیره می‌شود؛
و دستورهای خطرناک به‌صورت پیش‌فرض نیاز به تأیید دارند.

---

<div align="center">

**Made with 💜 by [AraTmDev](https://github.com/parham7991)** · [MIT](LICENSE)

⭐ Star this repo if you find it useful · 🍴 Fork it to make it yours

</div>

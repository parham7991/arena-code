#!/usr/bin/env bash
# Arena Code — one-shot installer.
#
#   bash install.sh                          # install arena (local dev build)
#   bash install.sh --global                 # install arena globally via npm
#   bash install.sh --bridge                 # also install the arena-account-bridge
#   bash install.sh --warp                   # set up WARP proxy (avoid Cloudflare)
#   bash install.sh --email you@x.com --password '...'   # log into the bridge
#
# After install, just type `arena` in a terminal (optionally add --alias).
set -euo pipefail

ARENA_DIR="${ARENA_DIR:-$HOME/.arena-code}"
NODE_MIN=18

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ---- flags ----
GLOBAL=0
WITH_BRIDGE=0
WITH_WARP=0
EMAIL=""
PASSWORD=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --global) GLOBAL=1 ;;
    --bridge) WITH_BRIDGE=1 ;;
    --warp) WITH_WARP=1 ;;
    --email) EMAIL="$2"; shift ;;
    --password) PASSWORD="$2"; shift ;;
    --alias)
      warn "Arena Code is already available as the 'arena' command after install. "
      ;;
    *) ;;
  esac
  shift
done

say "┌─────────────────────────────────────────────┐"
say "│          Arena Code installer v0.2          │"
say "└─────────────────────────────────────────────┘"

# ---- 1. Node check ----
if ! command -v node >/dev/null 2>&1; then
  err "Node.js >= $NODE_MIN not found. Install it from https://nodejs.org and re-run."
  exit 1
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < NODE_MIN )); then
  err "Node.js $NODE_MIN+ required (found $(node --version))."
  exit 1
fi
say "✔ Node $(node --version) detected"

# ---- 2. Install arena-code ----
mkdir -p "$ARENA_DIR"
THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if (( GLOBAL )); then
  say "Installing arena-code globally via npm…"
  npm install -g ./ 2>/dev/null || npm install -g arena-code 2>/dev/null || warn "npm global install failed; using local."
  npm link --force >/dev/null 2>&1 || true
else
  (cd "$THIS_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || warn "npm install skipped/partially failed")
  chmod +x "$THIS_DIR/src/cli.mjs"
fi

# Make `arena` available in PATH for this shell / add to profile if missing.
if ! command -v arena >/dev/null 2>&1; then
  if [[ -f "$HOME/.local/bin/arena" || -f "$ARENA_DIR/bin/arena" ]]; then :; fi
  mkdir -p "$HOME/.local/bin"
  ln -sf "$THIS_DIR/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || true
  case ":$PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) export PATH="$HOME/.local/bin:$PATH"
       warn "Added $HOME/.local/bin to PATH for this session. Add it to your shell profile:"
       warn '  echo '\''export PATH="$HOME/.local/bin:$PATH"'\'' >> ~/.bashrc' ;;
  esac
fi
say "✔ 'arena' command ready"

# ---- 3. Bridge (optional) ----
if (( WITH_BRIDGE )); then
  if [[ -d "$ARENA_DIR/arena-account-bridge" ]]; then
    say "Bridge already present at $ARENA_DIR/arena-account-bridge"
  else
    say "Cloning arena-account-bridge…"
    git clone --depth 1 https://github.com/parham7991/arena-account-bridge.git "$ARENA_DIR/arena-account-bridge" 2>/dev/null \
      || warn "Could not clone bridge (no git/network). You can run the bridge yourself."
  fi
  BRIDGE_DIR="$ARENA_DIR/arena-account-bridge"
  if [[ -d "$BRIDGE_DIR" ]]; then
    (cd "$BRIDGE_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
    if [[ -n "$EMAIL" && -n "$PASSWORD" ]]; then
      say "Logging into the bridge with the provided account…"
      (cd "$BRIDGE_DIR" && node bin/login.mjs --email "$EMAIL" --password "$PASSWORD" 2>/dev/null \
        || warn "Login could not complete here — run it on a machine with network access to arena.ai.")
    else
      warn "No credentials given. Log in later with: node bin/login.mjs --email you@x.com --password '...'"
    fi
  fi
fi

# ---- 4. WARP (optional) ----
if (( WITH_WARP )); then
  say "Setting up Cloudflare WARP proxy…"
  bash "$THIS_DIR/warp.sh" || warn "WARP setup incomplete (needs network). See warp.sh."
fi

say ""
say "Done! 🎉"
say "   Start coding:   arena"
say "   Help:           arena --help"
say "   Sessions:       arena --sessions"
say "   Team mode:      arena team \"your task\""
say ""
if (( WITH_WARP )); then
  say "   WARP SOCKS5 proxy: socks5://127.0.0.1:40000  (set ARENA_AGENT_PROXY for the bridge)"
fi

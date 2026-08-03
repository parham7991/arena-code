#!/usr/bin/env bash
# Arena Code — one-shot SERVER installer + first-run wizard.
#
#   bash setup-server.sh
#   bash setup-server.sh --warp-on    # ensure WARP proxy is running (warp-svc / wireproxy on 40000)
#
# Installs Node 20+ (if needed), the arena-code CLI, the arena-account-bridge,
# Chromium, logs into Arena (or prompts via `arena setup`), and starts a bridge
# on an available port. On servers with a Cloudflare WARP service, it uses the
# WARP SOCKS5 proxy so the real agent works (avoids 403 reCAPTCHA).
set -euo pipefail

ARENA_DIR="${ARENA_DIR:-$HOME/.arena-code}"
WARP_PORT="${ARENA_WARP_PORT:-40000}"
BRIDGE_PORT="${ARENA_BRIDGE_PORT:-20999}"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

WARP_ON=0
for a in "$@"; do [[ "$a" == "--warp-on" ]] && WARP_ON=1; done

# ---- 0. Detect an existing Cloudflare WARP service/proxy ----
HAS_WARP=0
if ss -ltnp 2>/dev/null | grep -q ":$WARP_PORT "; then
  HAS_WARP=1
  say "✔ WARP proxy detected on 127.0.0.1:$WARP_PORT"
elif command -v warp-svc >/dev/null 2>&1 || systemctl list-units 2>/dev/null | grep -qi warp; then
  HAS_WARP=1
  say "✔ Cloudflare WARP service detected"
elif (( WARP_ON )); then
  say "Attempting to set up WARP proxy (bash warp.sh)…"
  bash "$(dirname "$0")/warp.sh" || warn "WARP setup failed; continuing without proxy."
  if ss -ltnp 2>/dev/null | grep -q ":$WARP_PORT "; then HAS_WARP=1; fi
else
  warn "No WARP proxy detected on :$WARP_PORT. The real agent may hit 403 reCAPTCHA."
  warn "On datacenter IPs, run with --warp-on or ensure a Cloudflare WARP service is running."
fi

# ---- 1. Node 20+ ----
if ! command -v node >/dev/null 2>&1; then
  err "node not found."
  exit 1
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])")
if (( NODE_MAJOR < 20 )); then
  say "Upgrading Node to 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi
say "✔ Node $(node --version)"

# ---- 2. arena-code CLI ----
mkdir -p "$ARENA_DIR"
THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$THIS_DIR/src" && -f "$THIS_DIR/package.json" ]]; then
  (cd "$THIS_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
  ln -sf "$THIS_DIR/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || (mkdir -p "$HOME/.local/bin" && ln -sf "$THIS_DIR/src/cli.mjs" "$HOME/.local/bin/arena")
else
  git clone --depth 1 https://github.com/parham7991/arena-code.git "$ARENA_DIR/repo" 2>/dev/null || true
  (cd "$ARENA_DIR/repo" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
  ln -sf "$ARENA_DIR/repo/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || true
fi
chmod +x "$HOME/.local/bin/arena" 2>/dev/null || true
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH";; esac
say "✔ arena command ready"

# ---- 3. arena-account-bridge ----
BRIDGE_DIR="$ARENA_DIR/arena-account-bridge"
if [[ ! -d "$BRIDGE_DIR" ]]; then
  say "Cloning arena-account-bridge…"
  git clone --depth 1 https://github.com/parham7991/arena-account-bridge.git "$BRIDGE_DIR" 2>/dev/null || warn "bridge clone failed"
fi
if [[ -d "$BRIDGE_DIR" ]]; then
  (cd "$BRIDGE_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
  (cd "$BRIDGE_DIR" && npx playwright install chromium >/dev/null 2>&1 || true)
  (cd "$BRIDGE_DIR" && npx playwright install-deps chromium >/dev/null 2>&1 || true)
  say "✔ Bridge + Chromium installed"
fi

# ---- 4. First-run setup (theme + email + password) ----
say ""
say "Now running the first-run wizard:"
say "  * Choose a theme"
say "  * Enter your Arena email"
say "  * Enter your Arena password (stored encrypted)"
say ""
# `arena setup` asks interactively and attempts a bridge login.
arena setup || warn "Setup wizard did not complete (are you on a TTY?). Use: arena setup"

# ---- 5. Start bridge (with WARP proxy if available) ----
KEY=$(grep "^ARENA_AGENT_BRIDGE_KEY=" "$ARENA_DIR"/arena-account-bridge/../ 2>/dev/null || true)
DATA_DIR_BRIDGE="${DATA_DIR_BRIDGE:-$HOME/.arena-bridge}"
if [[ -f "$DATA_DIR_BRIDGE/credentials.json" ]]; then
  # ensure a bridge key exists
  if ! grep -q "^ARENA_AGENT_BRIDGE_KEY=" "$DATA_DIR_BRIDGE/.env" 2>/dev/null; then
    echo "ARENA_AGENT_BRIDGE_KEY=arena-$(openssl rand -hex 16)" >> "$DATA_DIR_BRIDGE/.env"
  fi
  # pick a free port
  pkill -f "arena-account-bridge/src/index.mjs" 2>/dev/null || true
  sleep 1
  cd "$BRIDGE_DIR"
  export DATA_DIR="$DATA_DIR_BRIDGE"
  export PORT="$BRIDGE_PORT"
  export ARENA_AGENT_BRIDGE_KEY=$(grep "^ARENA_AGENT_BRIDGE_KEY=" "$DATA_DIR_BRIDGE/.env" | cut -d= -f2)
  if (( HAS_WARP )); then
    export ARENA_AGENT_PROXY="socks5://127.0.0.1:$WARP_PORT"
    say "Using WARP proxy socks5://127.0.0.1:$WARP_PORT"
  fi
  nohup node src/index.mjs > /tmp/arena-bridge.log 2>&1 &
  sleep 8
  if curl -s --max-time 5 "http://127.0.0.1:$BRIDGE_PORT/health" | grep -q '"ok":true'; then
    say "✔ Bridge running on http://127.0.0.1:$BRIDGE_PORT"
  else
    warn "Bridge did not come up. Check /tmp/arena-bridge.log"
  fi
  # tell arena-code which bridge to use
  grep -q '^export ARENA_BRIDGE_URL=' "$HOME/.bashrc" 2>/dev/null || echo "export ARENA_BRIDGE_URL=\"http://127.0.0.1:$BRIDGE_PORT\"" >> "$HOME/.bashrc"
  grep -q '^export ARENA_BRIDGE_KEY=' "$HOME/.bashrc" 2>/dev/null || echo "export ARENA_BRIDGE_KEY=\"$ARENA_AGENT_BRIDGE_KEY\"" >> "$HOME/.bashrc"
else
  warn "No credentials yet — run 'arena setup' after the bridge is installed."
fi

say ""
say "Done! 🎉"
say "   Run:   arena"
say "   One-shot:   arena -p \"your task\""
say "   Re-login:   arena setup"
say ""
if (( HAS_WARP )); then
  say "   WARP proxy: socks5://127.0.0.1:$WARP_PORT (used by the bridge)"
fi

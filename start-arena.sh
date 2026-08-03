#!/usr/bin/env bash
# start-arena.sh — ensure the bridge is running, then launch `arena`.
# Use this when `arena` says "bridge not reachable".
#   bash start-arena.sh          # start bridge (if needed) + open interactive arena
#   bash start-arena.sh -p "task"  # start bridge + run one-shot
set -euo pipefail

BRIDGE_DIR="${BRIDGE_DIR:-$HOME/.arena-code/arena-account-bridge}"
DATA_DIR="${DATA_DIR:-$HOME/.arena-bridge}"
BRIDGE_PORT="${ARENA_BRIDGE_PORT:-20999}"
ARENA_BIN="$(command -v arena 2>/dev/null || echo "$HOME/.local/bin/arena")"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# 1. Make sure bridge dir + creds exist.
if [[ ! -d "$BRIDGE_DIR" ]]; then
  err "Bridge not installed. Run: bash <(curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh)"
  exit 1
fi
if [[ ! -f "$DATA_DIR/credentials.json" ]]; then
  err "No credentials yet. Run: arena setup"
  exit 1
fi

# 2. Start the bridge if not already listening.
if ! curl -s --max-time 3 "http://127.0.0.1:$BRIDGE_PORT/health" 2>/dev/null | grep -q '"ok":true'; then
  say "Starting arena bridge on :$BRIDGE_PORT…"
  pkill -f "arena-account-bridge/src/index.mjs" 2>/dev/null || true
  sleep 1
  cd "$BRIDGE_DIR"
  export DATA_DIR ARENA_AGENT_BRIDGE_KEY
  ARENA_AGENT_BRIDGE_KEY=$(grep "^ARENA_AGENT_BRIDGE_KEY=" "$DATA_DIR/.env" 2>/dev/null | cut -d= -f2 || true)
  # use WARP proxy if available
  if ss -ltnp 2>/dev/null | grep -q ':40000 '; then
    export ARENA_AGENT_PROXY="socks5://127.0.0.1:40000"
  fi
  nohup setsid node src/index.mjs > /tmp/arena-bridge.log 2>&1 < /dev/null &
  disown 2>/dev/null || true
  sleep 7
fi

# 3. Confirm.
if curl -s --max-time 5 "http://127.0.0.1:$BRIDGE_PORT/health" 2>/dev/null | grep -q '"ok":true'; then
  say "✔ Bridge running on :$BRIDGE_PORT"
else
  warn "Bridge not up — check /tmp/arena-bridge.log"
fi

# 4. Run arena with the right env.
export ARENA_BRIDGE_URL="http://127.0.0.1:$BRIDGE_PORT"
export ARENA_CODE_DIR="${ARENA_CODE_DIR:-$HOME/.arena-code}"
exec "$ARENA_BIN" "$@"

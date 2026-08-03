#!/usr/bin/env bash
# Arena Code — Cloudflare WARP proxy setup (avoid Cloudflare challenges).
# Registers a free WARP account and starts a SOCKS5 proxy on 127.0.0.1:40000.
#
#   bash warp.sh            # register + start
#   bash warp.sh register   # only register (write config)
#   bash warp.sh start      # only start the proxy
set -euo pipefail

ARENA_DIR="${ARENA_DIR:-$HOME/.arena-code}"
WARP_DIR="$ARENA_DIR/warp"
PORT="${ARENA_WARP_PORT:-40000}"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

CMD="${1:-all}"
mkdir -p "$WARP_DIR"

# Ensure node is available for the pure-Node registration.
if ! command -v node >/dev/null 2>&1; then
  err "node is required for WARP setup."
  exit 1
fi

# Locate warp-setup.mjs (from repo or installed).
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/src/warp-setup.mjs"
if [[ ! -f "$SCRIPT" ]]; then
  SCRIPT="$(npm root -g 2>/dev/null || echo "")/arena-code/src/warp-setup.mjs"
fi

# Prefer an already-running official Cloudflare WARP service (warp-svc) — it is
# the most reliable with Chromium. Only fall back to wireproxy if absent.
HAS_OFFICIAL=0
if command -v warp-cli >/dev/null 2>&1; then HAS_OFFICIAL=1; say "Official Cloudflare WARP CLI detected."; fi
if ss -ltnp 2>/dev/null | grep -q ":$PORT "; then
  HAS_OFFICIAL=1; say "✔ A proxy is already listening on 127.0.0.1:$PORT"
fi

# Download wireproxy only if no official WARP service is present.
if (( ! HAS_OFFICIAL )); then
  if ! command -v wireproxy >/dev/null 2>&1 && [[ ! -f "$WARP_DIR/wireproxy" ]]; then
    say "Downloading wireproxy…"
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    case "$ARCH" in x86_64) ARCH="amd64";; aarch64|arm64) ARCH="arm64";; esac
    # Correct asset name uses underscores, e.g. wireproxy_linux_amd64.tar.gz
    URL="https://github.com/octeep/wireproxy/releases/latest/download/wireproxy_${OS}_${ARCH}.tar.gz"
    if curl -fsSL "$URL" -o "$WARP_DIR/wireproxy.tar.gz" 2>/dev/null; then
      (cd "$WARP_DIR" && tar -xzf wireproxy.tar.gz 2>/dev/null || tar -xzf wireproxy.tar.gz -C "$WARP_DIR" --strip-components=1 2>/dev/null || true)
      # binary may be named 'wireproxy' or similar after extraction
      chmod +x "$WARP_DIR/wireproxy" 2>/dev/null || true
      ls "$WARP_DIR" 2>/dev/null | head
      rm -f "$WARP_DIR/wireproxy.tar.gz"
      say "wireproxy downloaded."
    else
      warn "Could not auto-download wireproxy. Install it manually: https://github.com/octeep/wireproxy"
    fi
  fi
fi

case "$CMD" in
  register)
    ARENA_CODE_DIR="$ARENA_DIR" node "$SCRIPT" register "$@"
    ;;
  start)
    ARENA_CODE_DIR="$ARENA_DIR" node "$SCRIPT" start
    ;;
  all)
    ARENA_CODE_DIR="$ARENA_DIR" node "$SCRIPT" register || warn "Registration failed (network?)."
    ARENA_CODE_DIR="$ARENA_DIR" node "$SCRIPT" start
    ;;
esac

say "WARP SOCKS5 proxy ready on 127.0.0.1:$PORT"
say "Point the bridge at it:  ARENA_AGENT_PROXY=socks5://127.0.0.1:$PORT"

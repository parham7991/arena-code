#!/usr/bin/env bash
# Arena Code — ONE-LINE INSTALLER. Run this and it installs everything:
#   Node 20+ (if missing), the `arena` command, the arena-account-bridge,
#   Chromium + system deps, WARP proxy (best-effort), and runs the interactive
#   setup wizard (theme + email + password, saved securely for re-login).
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh)
#   ARENA_EMAIL=you@x.com ARENA_PASSWORD='...' bash <(curl -fsSL ...)   # non-interactive login
#
# After it finishes: open a NEW terminal (or `source ~/.bashrc`) and type `arena`.
set -euo pipefail

ARENA_URL="${ARENA_URL:-https://github.com/parham7991/arena-code.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.arena-code/repo}"
WARP_PORT="${ARENA_WARP_PORT:-40000}"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# ---------- 0. Preflight ----------
command -v git >/dev/null 2>&1 || { err "git is required."; exit 1; }
command -v curl >/dev/null 2>&1 || { err "curl is required."; exit 1; }

# ---------- 1. Node 20+ ----------
if ! command -v node >/dev/null 2>&1; then
  say "Installing Node.js…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi
NODE_MAJOR=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
if (( NODE_MAJOR < 20 )); then
  say "Upgrading Node to 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1 || true
  apt-get install -y nodejs >/dev/null 2>&1 || true
fi
say "✔ Node $(node --version)"

# ---------- 2. Clone / update arena-code ----------
mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  say "Cloning arena-code…"
  git clone --depth 1 "$ARENA_URL" "$INSTALL_DIR" 2>/dev/null || { err "Clone failed."; exit 1; }
else
  say "Updating arena-code…"
  (cd "$INSTALL_DIR" && git fetch --depth 1 origin 2>/dev/null && git reset --hard -q origin/main 2>/dev/null) || true
fi
cd "$INSTALL_DIR"

# ---------- 3. Install arena-code deps ----------
(cd "$INSTALL_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || warn "npm install skipped")

# ---------- 4. Link `arena` + persist PATH ----------
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || true
chmod +x "$INSTALL_DIR/src/cli.mjs"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH";; esac
LINE='export PATH="$HOME/.local/bin:$PATH"'
for RC in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
  if [[ -f "$RC" ]] && ! grep -qF "$LINE" "$RC" 2>/dev/null; then
    echo "$LINE" >> "$RC" 2>/dev/null && { say "✔ Added arena to PATH in $RC"; break; }
  fi
done
say "✔ arena command ready"

# ---------- 5. arena-account-bridge + Chromium ----------
BRIDGE_DIR="$HOME/.arena-code/arena-account-bridge"
if [[ ! -d "$BRIDGE_DIR" ]]; then
  say "Cloning arena-account-bridge…"
  git clone --depth 1 https://github.com/parham7991/arena-account-bridge.git "$BRIDGE_DIR" 2>/dev/null || warn "bridge clone failed"
fi
if [[ -d "$BRIDGE_DIR" ]]; then
  (cd "$BRIDGE_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)
  say "Installing Chromium…"
  (cd "$BRIDGE_DIR" && npx playwright install chromium >/dev/null 2>&1 || true)
  (cd "$BRIDGE_DIR" && npx playwright install-deps chromium >/dev/null 2>&1 || true)
  say "✔ Bridge + Chromium ready"
fi

# ---------- 6. WARP proxy (best-effort, avoid 403 reCAPTCHA) ----------
HAS_WARP=0
if ss -ltnp 2>/dev/null | grep -q ":$WARP_PORT "; then
  HAS_WARP=1; say "✔ WARP proxy detected on :$WARP_PORT"
elif command -v warp-svc >/dev/null 2>&1 || systemctl list-units 2>/dev/null | grep -qi warp; then
  HAS_WARP=1; say "✔ Cloudflare WARP service detected"
else
  warn "No WARP proxy on :$WARP_PORT. On datacenter IPs the real agent may hit 403 reCAPTCHA."
fi

# ---------- 7. First-run setup (interactive, unless env credentials given) ----------
if [[ -n "${ARENA_EMAIL:-}" && -n "${ARENA_PASSWORD:-}" ]]; then
  say "Logging in with provided credentials…"
  arena setup --email "$ARENA_EMAIL" --password "$ARENA_PASSWORD" 2>/dev/null || true
else
  say ""
  say "──────────────────────────────────────────────"
  say "  First-run setup — pick a theme, enter your"
  say "  Arena email + password (stored encrypted)."
  say "──────────────────────────────────────────────"
  arena setup 2>&1 || warn "Setup wizard needs a terminal (TTY). Run 'arena setup' yourself."
fi

# ---------- 8. Start bridge ----------
if [[ -f "$HOME/.arena-bridge/credentials.json" ]]; then
  pkill -f "arena-account-bridge/src/index.mjs" 2>/dev/null || true
  sleep 1
  cd "$BRIDGE_DIR"
  export DATA_DIR="$HOME/.arena-bridge"
  BRIDGE_PORT="${ARENA_BRIDGE_PORT:-20999}"
  export PORT="$BRIDGE_PORT"
  [[ -f "$DATA_DIR/.env" ]] && export ARENA_AGENT_BRIDGE_KEY=$(grep "^ARENA_AGENT_BRIDGE_KEY=" "$DATA_DIR/.env" | cut -d= -f2)
  if (( HAS_WARP )); then export ARENA_AGENT_PROXY="socks5://127.0.0.1:$WARP_PORT"; fi
  nohup node src/index.mjs > /tmp/arena-bridge.log 2>&1 &
  sleep 6
  curl -s --max-time 5 "http://127.0.0.1:$BRIDGE_PORT/health" | grep -q '"ok":true' \
    && say "✔ Bridge running" || warn "Bridge not up — check /tmp/arena-bridge.log"

  # Persist bridge URL + PORT + key into the bridge .env so `arena` auto-discovers
  # them without needing a freshly sourced shell (fixes 401 Invalid bridge key).
  if [[ -f "$DATA_DIR/.env" ]]; then
    grep -q '^PORT=' "$DATA_DIR/.env" 2>/dev/null || echo "PORT=$BRIDGE_PORT" >> "$DATA_DIR/.env"
    grep -q '^ARENA_AGENT_BRIDGE_URL=' "$DATA_DIR/.env" 2>/dev/null || echo "ARENA_AGENT_BRIDGE_URL=http://127.0.0.1:$BRIDGE_PORT" >> "$DATA_DIR/.env"
  fi
  grep -q '^export ARENA_BRIDGE_URL=' "$HOME/.bashrc" 2>/dev/null || echo "export ARENA_BRIDGE_URL=\"http://127.0.0.1:$BRIDGE_PORT\"" >> "$HOME/.bashrc"
  [[ -n "${ARENA_AGENT_BRIDGE_KEY:-}" ]] && { grep -q '^export ARENA_BRIDGE_KEY=' "$HOME/.bashrc" 2>/dev/null || echo "export ARENA_BRIDGE_KEY=\"$ARENA_AGENT_BRIDGE_KEY\"" >> "$HOME/.bashrc"; }
fi

say ""
say "🎉 Done! Open a NEW terminal (or run: source ~/.bashrc) and type:  arena"
say "   One-shot:   arena -p \"your task\""
say "   Re-login:   arena setup"

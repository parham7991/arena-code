#!/usr/bin/env bash
# Arena Code — one-line bootstrap installer.
#
#   curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh | bash
#   curl -fsSL ... | ARENA_EMAIL=you@x.com ARENA_PASSWORD='...' bash -s -- --warp --bridge
set -euo pipefail

ARENA_URL="${ARENA_URL:-https://github.com/parham7991/arena-code.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.arena-code/repo}"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
err() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

if ! command -v git >/dev/null 2>&1; then
  err "git is required for bootstrap."
  exit 1
fi

mkdir -p "$(dirname "$INSTALL_DIR")"
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  say "Cloning arena-code…"
  git clone --depth 1 "$ARENA_URL" "$INSTALL_DIR" 2>/dev/null || {
    err "Clone failed. Check network / URL."
    exit 1
  }
else
  say "Updating arena-code (git pull)…"
  (cd "$INSTALL_DIR" && git pull --ff-only 2>/dev/null || warn "Could not update; using existing copy.")
fi

cd "$INSTALL_DIR"

# Re-link the `arena` command to the current source.
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || true
chmod +x "$INSTALL_DIR/src/cli.mjs"
# Ensure PATH includes ~/.local/bin (persist to profile once).
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:$PATH" ;;
esac

# Forward ARENA_EMAIL / ARENA_PASSWORD as --email/--password flags so the
# bridge login actually receives the credentials.
EXTRA=()
if [[ -n "${ARENA_EMAIL:-}" ]]; then EXTRA+=(--email "$ARENA_EMAIL"); fi
if [[ -n "${ARENA_PASSWORD:-}" ]]; then EXTRA+=(--password "$ARENA_PASSWORD"); fi

bash install.sh "$@" "${EXTRA[@]}"

say "Bootstrap complete."
echo ""
echo "Add 'arena' to your PATH for future shells (once):"
echo "  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
echo "Then run:  arena"

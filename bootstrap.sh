#!/usr/bin/env bash
# Arena Code — one-line bootstrap installer.
#
#   curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh | bash
#   curl -fsSL ... | ARENA_EMAIL=you@x.com ARENA_PASSWORD='...' bash -s -- --warp --bridge
set -euo pipefail

ARENA_URL="${ARENA_URL:-https://github.com/parham7991/arena-code.git}"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.arena-code/repo}"

say() { printf '\033[1;32m%s\033[0m\n' "$*"; }
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
fi

cd "$INSTALL_DIR"
bash install.sh "$@"

say "Bootstrap complete. Run:  arena"

#!/usr/bin/env bash
# update.sh — update arena-code to the latest version and re-link the `arena`
# command. Run this after a code change so `arena` uses the new code.
#   bash update.sh
set -euo pipefail
say(){ printf '\033[1;32m%s\033[0m\n' "$*"; }

INSTALL_DIR="${INSTALL_DIR:-$HOME/.arena-code/repo}"
if [[ ! -d "$INSTALL_DIR/.git" ]]; then
  say "arena-code not cloned yet; running bootstrap…"
  bash <(curl -fsSL https://raw.githubusercontent.com/parham7991/arena-code/main/bootstrap.sh)
  exit 0
fi

say "Updating arena-code…"
(cd "$INSTALL_DIR" && git fetch --depth 1 origin 2>/dev/null && git reset --hard -q origin/main 2>/dev/null)
(cd "$INSTALL_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 || true)

# Re-link arena (also ensure ~/.local/bin path).
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/src/cli.mjs" "$HOME/.local/bin/arena" 2>/dev/null || true
chmod +x "$INSTALL_DIR/src/cli.mjs"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH";; esac

say "✔ arena updated. Version: $(node "$INSTALL_DIR/src/cli.mjs" --help 2>&1 | head -1)"

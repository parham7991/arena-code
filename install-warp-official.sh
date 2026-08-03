#!/usr/bin/env bash
# Install the official Cloudflare WARP client (warp-svc) which provides a
# working SOCKS5 proxy on 127.0.0.1:40000 that Chromium can use (unlike wireproxy).
# This is the reliable way to avoid 403 reCAPTCHA on datacenter IPs.
set -euo pipefail
say(){ printf '\033[1;32m%s\033[0m\n' "$*"; }
err(){ printf '\033[1;31m%s\033[0m\n' "$*" >&2; }

# Already installed + running?
if command -v warp-cli >/dev/null 2>&1; then
  say "warp-cli already present"
fi
if ss -ltnp 2>/dev/null | grep -q ':40000 '; then
  say "✔ WARP proxy already listening on 127.0.0.1:40000"
  warp-cli --accept-tos mode 2>/dev/null | head -1 || true
  exit 0
fi

# 1. Add Cloudflare apt repo (official)
if ! command -v warp-cli >/dev/null 2>&1; then
  say "Adding Cloudflare WARP apt repo…"
  curl -fsSL https://pkg.cloudflareclient.com/pubkey.gpg | gpg --yes --dearmor --output /usr/share/keyrings/cloudflare-warp-archive-keyring.gpg 2>/dev/null || true
  echo "deb [arch=amd64 signed-by=/usr/share/keyrings/cloudflare-warp-archive-keyring.gpg] https://pkg.cloudflareclient.com/ jammy main" > /etc/apt/sources.list.d/cloudflare-client.list
  apt-get update -qq 2>/dev/null || true
fi

# 2. Install cloudflare-warp
if ! command -v warp-cli >/dev/null 2>&1; then
  say "Installing cloudflare-warp…"
  apt-get install -y cloudflare-warp 2>&1 | tail -3 || { err "install failed"; exit 1; }
fi
say "✔ cloudflare-warp installed"

# 3. Register + configure proxy mode + connect
say "Registering WARP…"
warp-cli --accept-tos registration new 2>&1 | tail -2 || true
warp-cli --accept-tos mode proxy 2>&1 | tail -2 || true
say "Connecting…"
warp-cli --accept-tos connect 2>&1 | tail -2 || true
sleep 4

# 4. Verify
if ss -ltnp 2>/dev/null | grep -q ':40000 '; then
  say "✔ WARP SOCKS5 proxy ready on 127.0.0.1:40000"
else
  err "WARP did not start a proxy on 40000. Status:"
  warp-cli --accept-tos status 2>&1 | head -6 || true
  exit 1
fi

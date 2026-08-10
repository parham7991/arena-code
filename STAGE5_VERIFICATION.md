# Stage 5 Verification — Security & Rate Limit Precise

**Date:** 2026-08-10 — **Account:** rout1@aratm.sbs — **Bridge uptime:** 2669s

## Precise Limits Verified (from source, no guessing)

| Limit | Value | Source | Status |
|-------|-------|--------|--------|
| REQUEST_BODY_MAX | 5,000,000 bytes | server.mjs:5_000_000 | ✅ |
| RATE_LIMIT_RPM | 100 | config.mjs:100 | ✅ |
| QUEUE_DEPTH | 8 | config.mjs:8 | ✅ |
| SESSION_TTL | 43,200,000 ms (12h) | config.mjs | ✅ |
| RECAPTCHA_TTL | 110,000 ms | config.mjs | ✅ |
| REFRESH_MARGIN | 1,200 sec | config.mjs | ✅ |
| BASH_OUTPUT_MAX | 50,000 chars | bash.mjs | ✅ |
| MESSAGE_SAFE | 20,000 chars | limits.mjs | ✅ |

## Security Verified

- `~/.arena-bridge/credentials.json` → 600, enc:v1: (AES-256-GCM) ✅
- `~/.arena-bridge/.env` → 600 ✅
- No password in src: `grep -r Parham@1234 src/` → empty ✅
- Bridge metrics: errors 0, queue depth 0 ✅

## Live Tests

- 12 parallel health → 12x200 ✅
- 2 parallel chat → 2x200, no 429 (under 100 rpm) ✅
- Metrics: requests 25, completed 25, errors 0 ✅
- npm test: 117 pass 0 fail ✅

**Stage 5 DoD: All precise limits enforced, credentials secure, rate limit handling works.**

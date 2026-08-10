# پلن MCP نرم و سریع Arena Code — ایجنت وصل‌کننده + دسترسی آسان

**مرجع دقیق چک شد:** Claude Code Docs (mcp add --transport, 3 scope, /mcp, OAuth) + Codex Docs (config.toml, codex mcp add, stdio/http)

---

## 1. مشکل Claude Code و Codex که تو حل میکنی

| مشکل | Claude Code | Codex | Arena Code سوپر |
| :--- | :--- | :--- | :--- |
| **نصب** | `claude mcp add --transport http --scope local --header ...` (طولانی، 3 scope گیج‌کننده) | `codex mcp add --env ... -- npx ...` + دستی `config.toml` | **`arena mcp connect "postgresم رو وصل کن"` (یه جمله)** |
| **کانفیگ** | JSON دستی `~/.claude.json` یا `.mcp.json` | TOML دستی `~/.codex/config.toml` | **ایجنت خودش مینویسه + تست میکنه** |
| **OAuth** | باید `/mcp` بزنی، مرورگر باز شه | باید `codex mcp login` | **ایجنت خودکار باز میکنه + منتظر میمونه** |
| **وصل کردن چند MCP به هم** | نداره - هر MCP جدا | نداره | **ایجنت Orchestrator: GitHub + Postgres رو به هم وصل میکنه** |
| **نرمی** | CLI خشک، ارور `already exists` | TOML خشک | **TUI با fzf picker + spinner + health سبز/قرمز** |

**نتیجه:** هر دو پیچیده و خشک هستن. تو باید **پیچیده رو پشت صحنه ببری، جلو ساده باشه.**

---

## 2. معماری جدید: MCP Agent (ایجنت وصل‌کننده)

```
کاربر: "دیتابیس postgres لوکالم رو وصل کن"
   ↓
[MCP Agent — مغز]
   ├─ Registry: کاتالوگ 50+ سرور (github, postgres, playwright, notion...)
   ├─ Detector: پورت 5432 بازه؟ postgres هست → پیشنهاد @modelcontextprotocol/server-postgres
   ├─ Installer: npx -y @modelcontextprotocol/server-postgres --auto-install + تست
   ├─ Connector: .arena-code/mcp.json مینویسه + health check + اگر OAuth → مرورگر
   └─ Orchestrator: ابزارهای جدید رو با ابزارهای قبلی یکی میکنه (unified namespace)
   ↓
TUI: "✅ postgres وصل شد (3 ابزار: query, schema, migrate) — تست: SELECT 1 OK"
```

**3 لایه:**
1. `src/mcp/mcp-agent.mjs` — ایجنت هوشمند (natural language → install)
2. `src/mcp/mcp-registry.mjs` — کاتالوگ + health
3. `src/mcp/mcp-client.mjs` — stdio/http واقعی (الان داری)

---

## 3. دسترسی آسان — دو حالته

### حالت آسان (90% کاربرا)
```bash
arena mcp connect "notionم رو وصل کن"
arena mcp connect "sentry برای پروژه‌ام"
arena mcp connect --auto # همه پیشنهادی‌ها (github + context7) رو وصل کن
```
ایجنت خودش تشخیص میده: Notion → `https://mcp.notion.com/mcp` + OAuth، Sentry → `https://mcp.sentry.dev/mcp`

### حالت حرفه‌ای (10% — ولی راحت‌تر از Claude)
```bash
# همون claude mcp add ولی ساده‌تر — فقط یه scope (project) + auto-complete
arena mcp add postgres -- npx -y @modelcontextprotocol/server-postgres "postgresql://localhost/mydb"
arena mcp add --http notion https://mcp.notion.com/mcp --oauth
arena mcp list # جدول خوشگل: نام | نوع | وضعیت ● | ابزارها
arena mcp health # همه رو پینگ میکنه
arena mcp remove postgres
```

**نرمی:**
*   `Tab` auto-complete نام سرورها از کاتالوگ
*   `fzf` picker: `arena mcp add` → لیست 50 تا با توضیح
*   ارور `already exists` نمیده — میگه "قبلا هست، آپدیت کنم؟ [Y/n]"

---

## 4. نرم بودن — چی از Claude/Codex بهتره

| نرمی | Claude Code | Arena Code |
| :--- | :--- | :--- |
| **نصب** | 3 scope (local/user/project) گیج | **فقط 1 scope: project** (`.arena-code/mcp.json`) — ساده |
| **TUI** | `/mcp` خشک | **`/mcp` با spinner + لاگ زنده + دکمه Test** |
| **OAuth** | باید دستی `/mcp` بزنی | **ایجنت خودش مرورگر باز میکنه و منتظر میمونه** |
| **خطا** | `spawn ENOENT` خشک | **"npx پیدا نشد — npm install کن؟ [Y/n]"** |
| **وصل چندتایی** | جدا | **"این Postgres رو به GitHub وصل کنم تا Issue از DB بسازی؟"** |

**مثال smooth:**
```bash
$ arena mcp connect "github"
✔ Found github → https://api.githubcopilot.com/mcp
✔ OAuth - مرورگر باز شد... منتظر...
✔ Connected ● 15 ابزار (create_issue, search_code...)
✔ تست: search_code "arena" OK

$ arena mcp connect "postgres localhost"
✔ Detected postgres on 5432
✔ Installed @modelcontextprotocol/server-postgres
✔ Health ● query OK

# حالا Agent میتونه:
# "از جدول users همه active ها رو بگیر و براشون GitHub issue بساز"
# → Orchestrator خودش دو تا MCP رو پشت هم صدا میزنه
```

---

## 5. مرحله‌بندی دقیق (به SUPREME_PLAN اضافه میشه)

**مرحله MCP-1 (2 روز) — هسته نرم:**
*   `mcp-agent.mjs` + کاتالوگ 20 سرور پرکاربرد
*   `arena mcp connect "<جمله>"` + `add/list/health`
*   TUI `/mcp` با وضعیت ●/○

**مرحله MCP-2 (3 روز) — Orchestrator:**
*   وصل کردن چند MCP به هم (GitHub + Postgres)
*   natural language: "دیتابیس رو به نوتیون وصل کن"

**مرحله MCP-3 (2 روز) — مارکت:**
*   `arena mcp publish` + `search`

**هر مرحله:** تست `mcp.test.mjs` پاس + کامیت جدا + تایید تو

---

## 6. به SUPREME_PLAN کجا اضافه میشه

*   قابلیت 11 (هاب MCP سوپر) → **ارتقا به همین پلن نرم**
*   فاز B (هسته خفن) → MCP-1
*   فاز E (اکوسیستم) → MCP-2,3

**آماده‌ای MCP-1 رو شروع کنم؟ بگو "MCP مرحله 1 رو شروع کن"**

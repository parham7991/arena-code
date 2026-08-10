# پلن قابلیت‌های سوپر Arena Code — خیلی خفن‌تر از Claude Code و Codex
**هدف نهایی: پروژه رسمی Arena.ai**

> مرجع: Claude Code (Anthropic) + Codex (OpenAI) — ما باید هر چی اونا دارن رو داشته باشیم + 10 قابلیت که اونا ندارن
> تاریخ: 2026-08-10 — هر قابلیت: به چه درد میخوره + مثال + معماری + مرحله

---

## مقایسه مرجع (چک‌لیست)

| قابلیت | Claude Code | Codex | Arena Code الان | Arena Code سوپر (هدف) |
| :--- | :--- | :--- | :--- | :--- |
| ابزار هسته (Read/Write/Bash) | 7 | 8 | 10 ✅ | 35 |
| TUI تعاملی | ✅ | ✅ | ✅ | ✅ + سینمایی |
| سشن ماندگار | ✅ | ✅ | ✅ | ✅ + شاخه‌ای |
| Skills | ✅ | ❌ | ✅ 10 تا | ✅ 50+ + مارکت |
| MCP | ✅ | ✅ | ✅ | ✅ سوپرهاب 10 تایی |
| Sub-agent | ✅ | ✅ | ✅ team | ✅ 13 نقش + گراف |
| Plan Mode | ✅ | ❌ | ❌ | ✅ |
| LSP/Diagnostics | ❌ | ❌ | ✅ | ✅ لایو |
| Self-Healing | ❌ | ❌ | ❌ | ✅ |
| 300 مدل رایگان | ❌ | ❌ | ❌ | ✅ Direct Mode |
| Design System | ❌ | ❌ | ✅ ui-ux-pro-max | ✅ |

---

## 15 قابلیت کلیدی که باید اضافه بشه (هر کدوم بی‌نقص)

### قابلیت 1: چانکر دقیق وب (Web Chunker) — فونداسیون
**به چه درد میخوره:** Arena پیام بالای 24k رو بی‌صدا کوتاه میکنه (`...[compacted]`). فایل 100KB نصفه میرسه و باگ میشه.
**مثال:** `src/app.ts` 85KB -> الان نصفه میره، بعد 5 تیکه 20k با `[[PART 1/5]]` کامل میره.
**معماری:**
```
[Write 85KB] -> chunker.mjs (smartChunk 20k روی مرز ```) -> 5x POST /append -> Arena cat *.part -> sha256 چک
```
`LIMITS.MESSAGE_SAFE=20_000` (از format.mjs: 24k - 4k margin) + `LIMITS.BASH=50k`
**مرحله:** 1 (فونداسیون) — 1 روز

### قابلیت 2: سوپر-ابزارها (35 ابزار) — قلب
**به چه درد میخوره:** Claude 7 ابزار داره، تو با 7 تا نمیتونی پروژه بزرگ بزنی. باید LSP, Test, Process داشته باشی.
**مثال:** بعد `Write` خودکار `Diagnostics` بزنه، اگر `tsc` ارور داد همونجا فیکس کنه.
**معماری:**
```
src/tools/
  lsp.mjs (tsc --noEmit) — NEW
  git.mjs (status/diff/commit) — NEW
  test.mjs (npm test) — DONE
  process.mjs (dev server) — DONE
  diagnostics.mjs (lint) — DONE
  + 25 تای دیگه (docker, db, browser...)
registry.mjs -> getToolSchemas() -> 35 تا
```
**مرحله:** 2 (Core) — 2 روز — الان 10 تا داریم، 5 تا جدید

### قابلیت 3: حلقه بی‌نقص 5 مرحله‌ای (Flawless Loop)
**به چه درد میخوره:** Claude مینویسه و ول میکنه، تو باید بنویسه→چک→تست→ران→تحویل، تا بی‌نقص نشه ول نکنه.
**مثال:** `Write login.ts` -> `Diagnostics` فیل (import اشتباه) -> خودکار `Edit` -> `Test` فیل -> فیکس -> `Process logs` 200 OK -> تحویل
**معماری:**
```js
// src/agent.mjs hook onToolAfter
if (tool==='Write') {
  const diag = await Diagnostics(); if (!diag.passed) return fix(diag);
  const test = await Test(); if (!test.passed) return heal(test);
}
```
**مرحله:** 3 (Self-Healing) — 3 روز

### قابلیت 4: گراف دانش پروژه (Knowledge Graph)
**به چه درد میخوره:** پروژه 500k خطی رو نمیشه هر بار Grep کرد. گراف در 0.1s میگه `login کجاست؟`
**مثال:** `arena ask "تابع پرداخت کجاست؟"` -> گراف -> `src/pay/stripe.ts:42`
**معماری:**
```
src/graph.mjs (tree-sitter) -> SQLite FTS -> watcher.mjs (تغییر فایل -> آپدیت گراف)
```
**مرحله:** 4 (Memory) — 5 روز — بعد از فونداسیون

### قابلیت 5: مسیریاب هوشمند مدل (Model Router)
**به چه درد میخوره:** تو 300 مدل رایگان داری، Claude فقط 1 مدل. هر نقش با بهترین مدل.
**مثال:** `ARCHITECT -> Claude Opus 4`, `CODER -> GPT-5`, `REVIEWER -> Gemini 3`
**معماری:**
```
roles/architect.md: model: claude-opus-4
bridge.mjs: if (role.model) POST /v1/chat/completions {model: role.model} via Direct Mode
```
نیاز به Direct Mode (flay-o style) بدون افزونه.
**مرحله:** 4 (همزمان با گراف)

### قابلیت 6: پلن مود تعاملی (Plan Mode)
**به چه درد میخوره:** Claude Code قبل کدنویسی پلن مینویسه و تو تایید میکنی — بدون پلن پروژه بزرگ بهم میریزه.
**مثال:** `arena plan "مارکت‌پلیس بساز"` -> فقط `PLAN.md` مینویسه -> تو `Tab` تایید -> بعد `arena team`
**معماری:**
```
src/commands/plan.mjs -> فقط Read/Grep + Write PLAN.md (بدون Edit)
```
**مرحله:** 2 (سریع)

### قابلیت 7: TUI سینمایی + دیزاین سیستم
**به چه درد میخوره:** همه اسکرین‌شات میگیرن و ویروسی میشه. Claude خشک و سفیده.
**مثال:** diff سبز/قرمز زنده + درخت فایل + تم `Cyberpunk` از `arena-ui-ux-pro-max` (84 استایل)
**معماری:**
```
src/ui/app.mjs (ink) + src/theme.mjs (20 تم) + ui-ux-pro-max tokens
```
**مرحله:** 2 (همزمان)

### قابلیت 8: تست خود-ترمیم + کاورج
**به چه درد میخوره:** Claude تست نمیسازه. تو خودت تست میسازی و تا سبز نشه ول نمیکنی.
**مثال:** `Write api.ts` -> `Test` فیل -> `Test_Generate` تست میسازه -> دوباره `Test` پاس
**معماری:** `src/tools/test.mjs` + `vitest --coverage`
**مرحله:** 3

### قابلیت 9: پروسس پایدار + Playwright
**به چه درد میخوره:** `npm run dev` باید روشن بمونه و e2e چک شه.
**مثال:** `Process start "npm run dev"` -> `logs` -> `HTTP_Fetch localhost:3000` -> `Browser` اسکرین‌شات
**معماری:** `process.mjs` (spawn) + `mcp/playwright`
**مرحله:** 3

### قابلیت 10: مارکت‌پلیس Skills
**به چه درد میخوره:** Claude Code تازه Skills آورده، تو میتونی مارکت بسازی.
**مثال:** `arena publish my-skill` -> دیگران `arena skill install my-skill`
**معماری:** `src/skills/registry` + `npm` + `github`
**مرحله:** 5 (اکوسیستم)

### قابلیت 11: هاب MCP سوپر (10 سرور همزمان)
**به چه درد میخوره:** Claude 1 MCP، تو 10 تا (postgres + playwright + slack + notion همزمان)
**مثال:** `.arena-code/mcp.json` 10 سرور -> همه ابزارها یکی میشن
**معماری:** `src/mcp/mcp-registry.mjs` (الان داری، فقط سوپرهاب کن)
**مرحله:** 5

### قابلیت 12: شاخه‌ای و Night Coder
**به چه درد میخوره:** هر Agent تو branch جدا، شب‌ها Issue رو خودکار فیکس کنه.
**مثال:** `arena team --isolate` -> هر Agent `git worktree` جدا
**معماری:** `src/subagent.mjs` + `git worktree` + `daemon.mjs`
**مرحله:** 5

### قابلیت 13: امنیت و ریت‌لیمیت دقیق
**به چه درد میخوره:** Arena تو رو بن نکنه.
**مثال:** 20 درخواست موازی -> 8 تا صف، 12 تا با `Retry-After 10s`
**معماری:** `limits.mjs` (RATE 100, QUEUE 8) + `bridge.mjs` queue
**مرحله:** 1

### قابلیت 14: Direct Mode (300 مدل)
**به چه درد میخوره:** بدون Direct فقط 15 مدل Agent داری.
**مثال:** `arena --mode direct --model "Grok 4" -p "کد بزن"`
**معماری:** `src/direct-bridge.mjs` (مثل flay-o ولی با Playwright بدون افزونه)
**مرحله:** 2

### قابلیت 15: بنچمارک علنی
**به چه درد میخوره:** عدد ویروسی میشه: "Arena Code 98% vs Claude 87%"
**مثال:** `arena bench` روی 50 تسک -> HTML خوشگل
**معماری:** `scripts/bench.mjs`
**مرحله:** 5

---

## مرحله‌بندی نهایی (تو تایید میکنی)

**فاز A — فونداسیون بی‌نقص (هفته 1):**
1. چانکر 20k + لیمیت دقیق + امنیت ریت

**فاز B — هسته خفن (هفته 2-3):**
2. سوپر-ابزار 35 + پلن مود + TUI سینمایی + Direct Mode

**فاز C — هوش بی‌نقص (هفته 4-5):**
3. حلقه خود-ترمیم + تست خودکار + پروسس پایدار

**فاز D — حافظه نامحدود (هفته 6-7):**
4. گراف دانش + مسیریاب مدل (300 مدل)

**فاز E — اکوسیستم جهانی (هفته 8-10):**
5. مارکت Skills + سوپرهاب MCP + بنچمارک + Night Coder

**هر فاز = چند مرحله بالا — هر مرحله جدا کامیت + تست + تایید تو**

---

## برای رسمی شدن با Arena

وقتی فاز C تموم شد (بی‌نقص + 35 ابزار + Direct)، نامه به Arena:
> "We built the official Claude Code for Arena — 300 free models, flawless delivery, MIT. Let's make it official: arena.ai/code"

**آماده‌ای؟ بگو "فاز A مرحله 1 رو شروع کن" تا چانکر دقیق رو نهایی و کامیت کنم.**

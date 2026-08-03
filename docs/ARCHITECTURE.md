# Arena Code — سند معماری

**نسخه:** v0.1 (دریفت اول، برای بحث و تثبیت قبل از کد)
**پروژه:** یک کدینگ-اجنت ترمینالی (شبیه Claude Code / OpenAI Codex / OpenCode)
**بکند:** [`arena-account-bridge`](https://github.com/parham7991/arena-account-bridge) (بریج لوکال به arena.ai)
**استک:** Node.js (≥18) → رابط ترمینالی تعاملی (TUI) → اجرای ابزارها به‌صورت **محلی** روی ماشین کاربر

---

## ۰) خلاصه یک‌خطی

> یک CLI تعاملی ترمینال می‌سازیم که در دایرکتوری پروژه‌ی کاربر اجرا می‌شود، پرامپت را
> به بریج ارنا می‌فرستد، آژنت ارنا «استدلال» می‌کند و درخواست ابزار (`Bash`, `Read`,
> `Write`, `Edit`, `Glob`, `Grep`) برمی‌گرداند؛ ما آن ابزارها را **روی فایل‌های واقعیِ
> همان پروژه‌ی کاربر** اجرا می‌کنیم و نتیجه را برمی‌گردانیم؛ حلقه ادامه می‌یابد تا
> `finish_reason="stop"`. خروجی نهایی در ترمینال با UI رنگی و زنده نمایش داده می‌شود.

---

## ۱) چرا این «هارنس» لازم است (نقش ما)

بریج دو کار را قبلاً انجام می‌دهد:
1. لاگین به arena.ai با ایمیل/پسورد (کوکی رمزنگاری‌شده، AES-256-GCM).
2. اجرای سشن واقعی Agent ارنا و تبدیلش به **API سازگار با OpenAI** با `tool_calls`.

اما بریج یک **هارنس کدینگ** نیست. Claude Code / Codex / OpenCode هارنس را فراهم می‌کنند:
حلقه‌ی agent، اجرای ابزار روی ماشین محلی، UI، سشن، مدیریت کانتکست، اجازه‌ها. **ما دقیقاً
همین لایه را می‌سازیم** و بریج را به‌عنوان «مدل/بکند» به آن وصل می‌کنیم. بریج به ما
یک سرویس `OpenAI-compatible` می‌دهد که می‌توانیم هر ابزاری را به شکل function-call به آن
بدهیم و آژنت ارنا استدلال کند.

---

## ۲) معماری سطح بالا

```
┌───────────────────────────────  ماشین محلی  ───────────────────────────────┐
│                                                                            │
│  ┌───────────────┐   درخواست   ┌──────────────────┐  استدلال + tool_calls  │
│  │  Arena Code   │ ──────────► │  arena-bridge    │ ◄────────────────────  │
│  │   (TUI/CLI)   │            │  (127.0.0.1:20140)│                       │
│  │               │ ◄────────── │   /v1/chat/...   │ ─────► arena.ai       │
│  │  ┌─────────┐  │  پاسخ       └────────┬─────────┘   (رئال سشن Agent)    │
│  │  │ Agent   │  │                      │                                 │
│  │  │ Loop    │  │   tool_calls         │                                 │
│  │  └────┬────┘  │   (Bash, Write, ...) │                                 │
│  │       │       │                      │                                 │
│  │       ▼       │                      │                                 │
│  │  ┌─────────┐  │                      │                                 │
│  │  │ Tool    │  │  اجرای ابزار روی پروژهی محلی کاربر                       │
│  │  │ Harness │  │  (read/write/edit/glob/grep/bash + پرسش از کاربر)        │
│  │  └────┬────┘  │                                                         │
│  │       │       │  نتیجهی ابزار (tool message)                            │
│  │       └───────┘  برمیگردد به حلقه و دوباره به بریج فرستاده میشود          │
│  └────────────────────────────────────────────────────────────────────────┘
│
│  ریشهی پروژهی کاربر  =  کاری که آژنت روی آن کار میکند (محلی، واقعی)
└────────────────────────────────────────────────────────────────────────────┘
```

**نکته‌ی کلیدی:** بریج همیشه `finish_reason` را به‌صورت `"tool_calls"` (وقتی آژنت می‌خواهد
ابزار صدا بزند) یا `"stop"` (وقتی کار تمام است) برمی‌گرداند. ما موظفیم وقتی `tool_calls`
می‌بینیم، ابزار را اجرا کنیم و یک پیام `role:"tool"` با همان `tool_call_id` برگردانیم.

---

## ۳) اجزای نرم‌افزار (ماژول‌ها)

داخل پکیج `arena-code` (نود جدا از بریج، ولی از آن استفاده می‌کند):

| ماژول | مسئولیت |
|---|---|
| `src/cli.mjs` | ورودی CLI، فلگ‌ها، راه‌اندازی TUI یا حالت یک‌باره (`-p/--prompt`) |
| `src/config.mjs` | خواندن `.env` / env / پراپرتی‌ها: آدرس بریج، کلید، پروفایل |
| `src/bridge.mjs` | کلاینت HTTP به `/v1/chat/completions`؛ ارسال پیام + ابزارها، دریافت پاسخ (استریم یا عادی) |
| `src/agent.mjs` | حلقه‌ی اصلی agent: استدلال ← اجرای ابزار ← نتیجه ← تکرار |
| `src/tools/*.mjs` | هر ابزار محلی به‌صورت `{schema, execute}` |
| `src/tools/registry.mjs` | ثبت ابزارها و تبدیل به آرایه‌ی `tools[]` (فرمت OpenAI) |
| `src/session.mjs` | سشن و تاریخچه (ذخیره/بازیابی/compact) |
| `src/context.mjs` | مدیریت کانتکست، prune/compact وقتی نزدیک سقف هستیم |
| `src/ui/` | TUI: رندر، spinner، نمایش زنده‌ی ابزارها، ورودی چندخطی |
| `src/prompts/sys.mjs` | system prompt (دستورالعمل کدینگ + توضیح ابزارها) |
| `src/hooks.mjs` | رویدادها/هوک‌ها (اختیاری، برای پیشرفت) |
| `test/` | تست‌های واحد + یک ماسک mock بریج برای توسعه‌ی آفلاین |

---

## ۴) قرارداد API با بریج (ثبت‌شده از سورس)

بریج یک پیاده‌سازی OpenAI-compatible است. قرارداد دقیق:

```
POST http://127.0.0.1:20140/v1/chat/completions
Headers:
  Authorization: Bearer $ARENA_AGENT_BRIDGE_KEY   // از ~/.arena-bridge/.env
  Content-Type:  application/json
  x-codex-session-id: <اختیاری، برای سشن پایدار/چند-آژنتی>
Body (OpenAI):
{
  "model": "agent",
  "messages": [...],            // system + user + assistant + tool
  "tools":   [...],             // تعریف ابزارها (function calling)
  "stream":  true/false,
  "max_tokens": ...,
  "temperature": ...
}
```

**پاسخ عادی:**
```json
{
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "...",
      "tool_calls": [
        { "id": "arena_agent_...", "type": "function",
          "function": { "name": "Write", "arguments": "{\"file_path\":\"a.js\",\"content\":\"...\"}" } }
      ]
    },
    "finish_reason": "tool_calls" | "stop"
  }]
}
```

**قوانین مهمی که از بریج برداشتیم:**
- رول‌های مجاز پیام: `system`, `developer`, `user`, `assistant`, `tool`.
- مدل همیشه `"agent"`.
- آژنت ارنا در سندباکسِ خودش هم ابزارها را «می‌بیند»، اما بریج در حالت
  `stateless-claude-tools` درخواست‌ها را به‌صورت `tool_calls` برای **ما** گزارش می‌کند؛
  **ما** ابزار را روی ماشین محلی اجرا می‌کنیم و نتیجه را برمی‌گردانیم. (این موضوع در §۶
  با یک تست عملی قطعی می‌شود.)
- ابزارهای ساپورت‌شده: `Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `WebSearch`,
  `WebFetch`, `AskUserQuestion`.
- `GET /health` → `{"ok":true,...}` برای چک قبل از شروع.
- اشتباهات با `Retry-After` برمی‌گردند (۴۲۹/۵۰۳) — باید backoff داشته باشیم.

---

## ۵) حلقه‌ی Agent (الگوریتم اصلی)

```
function runTurn(userPrompt):
  messages = loadSession()           // یا از نو
  append messages: system + user
  loop (maxTurns = 60):
    resp = bridge.chat({messages, tools, stream:true})
    if resp.finish_reason == "stop":
        render final content; saveSession; return

    if resp.tool_calls:
        for each call (پیشنهاد اجرای موازی تا N):
            show "▶ running <name>(<args-خلاصه>)" در UI
            if needsApproval(name, args, policy):   // برای ابزارهای حساس
                 user = askUser(name, args)         // accept / edit / reject
                 if reject: toolResult = {error:"rejected by user"}
                 else:      toolResult = toolRegistry.run(call)
            else:
                 toolResult = toolRegistry.run(call)   // اجرای محلی واقعی
            append messages: {role:"tool", tool_call_id:call.id,
                              name, content: JSON.stringify(toolResult)}
        continue loop
```

- **پایان وقتی** هیچ `tool_calls` نباشد و `finish_reason=="stop"`.
- **پایان اجباری/امن:** سقف turn ها، دستور کاربر (Esc/Ctrl+C)، یا error بحرانی.
- **خطای ابزار** باید در `content` پیام tool بیاید (نه throw) تا آژنت بتواند خودش را
  اصلاح کند. اگر ابزار «نگذرد» (مثلاً فایل نوشتن در مسیر ممنوع) همان پیام خطا کافی است.

---

## ۶) ابزارهای محلی (Tool Harness)

هر ابزار یک «ثبت‌نام» است:

```js
export const writeTool = {
  schema: {
    name: "Write",
    description: "Create or overwrite a UTF-8 file. Creates parent dirs.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Abs or cwd-relative path" },
        content:   { type: "string", description: "Full file content" },
      },
      required: ["file_path", "content"],
    },
  },
  execute: async (args, ctx) => { ... نوشتن واقعی روی دیسک ... },
};
```

### پیشنهاد اولیه برای ابزارها (زیرمجموعه‌ی ساپورت بریج)
| ابزار | اجرای محلی | خروجی به آژنت |
|---|---|---|
| `Bash` | اجرای `sh -c` در ریشه‌ی پروژه (یا dir مشخص)، با timeout و سقف خروجی | stdout/stderr، exit code |
| `Read` | خواندن فایل (UTF-8، آفست/خط برای فایل‌های بزرگ) | محتوای متن |
| `Write` | نوشتن کامل فایل + ساخت پوشه‌ی والد | مسیر + بایت‌ها |
| `Edit` | جایگزینی یک block متنی قدیم→جدید (یک‌بار)، یا diff-based | نتیجه + تأیید match |
| `Glob` | پیدا کردن فایل با pattern در پروژه | لیست مسیرها |
| `Grep` | جستجوی regex در فایل‌ها | مسیرها + خطوط |
| `WebSearch` | فراخوانی یک جست‌وجوی وب (اختیاری؛ می‌توانیم خاموش کنیم) | نتایج |
| `WebFetch` | fetch یک URL | متن |
| `AskUserQuestion` | پرسیدن از کاربر در ترمینال (اختیاری/تعاملی) | پاسخ کاربر |

> **مرز امنیت:** ابزارهای «فقط-خوان» (`Read`, `Glob`, `Grep`) بدون تأیید اجرا می‌شوند؛
> `Bash` و `Write`/`Edit` بسته به سیاست، یا تأیید می‌خواهند یا با `--yes`/autonomy
> آزادند. برای میل‌استون اول، `Bash` را با تأیید پیش‌فرض و بقیه را آزاد نگه می‌داریم.

### سوال باز (برای تست عملی اول)
بریج در حالت `stateless-claude-tools`، آیا وقتی آژنت ارنا ابزاری را در سندباکسِ خودش
اجرا می‌کند، نتیجه‌ی همان ابزار در `content` پیام می‌آید؟ یا فقط `tool_calls` را
برمی‌گرداند و ما باید خودمان اجرا کنیم؟ این را در میل‌استون ۱ با یک درخواست تستی واقعی
به بریج قطعی می‌کنیم. (معماری ما برای هر دو حالت آماده است: اگر نتیجه در `content`
بیاید، `content` را نگه می‌داریم؛ اگر نه، ابزار را محلی اجرا می‌کنیم.)

---

## ۷) مدیریت کانتکست (Context)

- قبل از هر turn، مجموع توکن‌های تقریبی تاریخچه را حساب می‌کنیم.
- وقتی نزدیک سقف هستیم:
  1. اول پیام‌های `tool` پرحجم و قدیمی را prune کنیم (خلاصه‌شان را نگه داریم).
  2. اگر کافی نبود، **compact**: خلاصه‌ای از تاریخچه با یک درخواست جدا به آژنت بسازیم و
     با `system`/`user` جایگزین کنیم. (شبیه `/compact` کلودکد)
- یک **پروژه‌مموری** ساده: `ARENA_CODE.md` در ریشه (شبیه `CLAUDE.md`/`AGENTS.md`) که
  اول هر جلسه داخل system prompt برود و آژنت بتواند به‌روزش کند.

---

## ۸) سشن و پایداری

- هر جلسه یک id دارد؛ تاریخچه به‌صورت JSON/JSONL در
  `~/.arena-code/sessions/<projectHash>/<sessionId>.jsonl` ذخیره می‌شود.
- برای چند-آژنتی: همان مکانیزم `x-codex-session-id` بریج → هر آژنت یک سشن مستقل در
  بریج دارد؛ ما فقط id ها را مدیریت می‌کنیم.
- دستور `arena-code --continue` ادامه‌ی آخرین سشن پروژه.

---

## ۹) TUI (رابط ترمینال تعاملی)

**انتخاب کتابخانه:** `ink` (React برای ترمینال، ماژولار و قابل تست) + `@inkjs/ui`، یا
`blessed`/`neo-blessed` برای کنترل کامل‌تر. پیشنهاد اولیه: **ink** (هم‌خانواده با اکوسیستم
Node، آسان برای استریم و رندر بخشی). ورودی چندخطی با `prompts`/`enquirer` یا یک کامپوننت
سفارشی.

**عناصر UI (مثل Claude Code):**
- خط ورودی پایین (`❯ ...`) با حالت چندخطی (Shift+Enter).
- هنگام استدلال: اسپینر + متن reasoning زنده (اگر بریج بدهد).
- نمایش ابزارها به‌صورت زنده:
  ```
  ▶ Running Write       📄 src/agent.mjs
  ▶ Running Bash        npm test (finished 4.2s)
  ```
- بعد از هر ابزار: نتیجه به‌صورت collapsible (خلاصه + دکمه/کلید برای گسترش).
- خروجی نهایی آژنت: بلوک متن با سینتکس‌هایپرلایت‌شده.
- کلیدها: `Esc`/`Ctrl+C` (توقف/انصراف)، `T` (تغییر سشن)، `/help`, `/compact`, `/quit`.
- اسلش-کامندها: `/help`, `/compact`, `/clear`, `/model` (اختیاری), `/session`.

---

## ۱۰) چند-آژنتی / Team Leader (آینده)

با `x-codex-session-id` بریج چند آژنت موازی اجرا می‌کنیم:
- `arena-code team "بک‌اند و فرانت را جدا انجام بده"` → لیدر مأموریت‌ها را می‌شکند،
  زیر-آژنت‌ها را spawn می‌کند (هرکدام سشن و پیام‌های مستقل)، نتایج را جمع می‌کند.
- این مرحله بعد از MVP است؛ در این سند فقط معماری را ثبت می‌کنیم.

---

## ۱۱) کانفیگ و محیط (Config)

```
ARENA_BRIDGE_URL      = http://127.0.0.1:20140        (پیش‌فرض)
ARENA_BRIDGE_KEY      = (از ~/.arena-bridge/.env، ورود یا --key)
ARENA_CODE_DIR        = ~/.arena-code                 (دادهی ما)
ARENA_AUTONOMY        = ask | auto                    (سیاست تأیید ابزار)
ARENA_PROMPT          = مسیر فایل پرامپت سفارشی
ARENA_MAX_TURNS       = 60
```

بریج را می‌توان به‌عنوان یک **پیش‌نیاز** با `npm run bridge:start` یا راهنمای README بالا
آورد؛ ما حتی می‌توانیم یک `npm script` برای `healthcheck` بگذاریم.

---

## ۱۲) امنیت

- فقط با `127.0.0.1` و کلید Bearer کار کنیم؛ هرگز پورت را public نکنیم.
- `Bash` با timeout و سقف خروجی؛ پیش‌فرض در ابتدا «تأیید» برای دستورهای خطرناک.
- مسیرهای حساس (`~/.arena-bridge`, `~/.arena-code`, `.git`) را از خواندن/نوشتن ابزارها
  پیش‌فرض مستثنی کنیم مگر کاربر صریحاً اجازه دهد.
- تاریخچه و سشن روی دیسک محلی؛ کلیدها را در جای حساس نگه نداریم.

---

## ۱۳) ساختار ریپوی پیشنهادی

```
arena-code/
├── package.json           # type:module, bin: arena-code
├── README.md              # راهنما (EN+FA)
├── docs/
│   └── ARCHITECTURE.md    # همین سند
├── src/
│   ├── cli.mjs
│   ├── config.mjs
│   ├── bridge.mjs
│   ├── agent.mjs
│   ├── session.mjs
│   ├── context.mjs
│   ├── tools/{index,write,edit,read,glob,grep,bash,ask}.mjs
│   ├── ui/{app,spinner,tools,multiline}.mjs
│   └── prompts/sys.mjs
└── test/
    ├── tools.test.mjs
    ├── agent.test.mjs
    ├── bridge.test.mjs
    └── mock-bridge.mjs     # سرور mock برای توسعه آفلاین
```

---

## ۱۴) استراتژی تست (توسعه بدون لاگین واقعی)

بریج واقعی نیاز به لاگین و اینترنت دارد؛ برای توسعه‌ی سریع، یک **mock بریج** می‌سازیم
که همان قرارداد OpenAI را روی پورت محلی سرو می‌کند:
- در حالت `tools`: یک ابزار ساختگی (مثلاً `Read`/`Bash`) صدا می‌زند، بعد `stop`.
- این به ما اجازه می‌دهد TUI، حلقه، و هارنس ابزار را بدون اکانت ارنا تست کنیم.
- تست واقعی انتها-به-انتها با بریج واقعی به‌صورت دستی/CI اختیاری.

---

## ۱۵) میل‌استون‌ها

| # | میل‌استون | خروجی |
|---|---|---|
| **M0** | (همین) تثبیت معماری | این سند + تایید قرارداد بریج |
| **M1** | هارنس ابزار + حلقه‌ی بدون UI | `agent.mjs` + `tools/*` + mock بریج + تست‌ها |
| **M2** | کلاینت بریج + استریم | `bridge.mjs`، healthcheck، backoff |
| **M3** | TUI ساده (ink) | ورودی چندخطی، اسپینر، نمایش ابزار، خروجی نهایی |
| **M4** | سشن + ادامه + پروژه‌مموری | `/continue`, `ARENA_CODE.md`, persist |
| **M5** | مدیریت کانتکست + `/compact` | prune + compact |
| **M6** | چند-آژنتی Team Leader | `x-codex-session-id` + لیدر |
| **M7** | انتشار: README، `npx`، نصب | مستند کامل + ریلیز |

---

## ۱۶) ریسک‌ها و سوالات باز

1. **رفتار tool_calls بریج در عمل** — آیا ابزار در سندباکس ارنا هم اجرا می‌شود یا فقط
   به ما گزارش می‌شود؟ (با تست واقعی در M1 قطعی می‌شود؛ معماری هر دو را پوشش می‌دهد).
2. **بازه‌های ریس‌ریت/مدل** — استریم و چند-آژنتی ممکن است محدودیت داشته باشد؛ backoff و
   صف لازم است.
3. **زمان پاسخ** — سشن‌های واقعی ارنا کندترند؛ UI باید استریم/حالت انتظار را خوب نشان دهد.
4. **نام پروژه** — `arena-code` پیشنهادی؛ می‌توانیم عوض کنیم.
5. **مدل‌ها** — فعلاً فقط `agent`؛ شاید بعدا `agent-fast`/انتخاب مدل.

---

*ساخته‌شده برای ساخت مشترک؛ هر بخشی را که دوست داری اول عمیق‌تر کنیم، بگو.*

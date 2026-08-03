// setup.mjs — interactive first-run wizard (`arena setup` / `arena --setup`).
// Asks for theme, email and password on first run, securely saves them, performs
// a real bridge login (if a bridge is available), and saves prefs so subsequent
// runs can re-login automatically.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { loadConfig } from "./config.mjs";
import { THEME_NAMES } from "./theme.mjs";
import { SUPPORTED } from "./i18n.mjs";
import { saveCredentials, saveUserPrefs, hasCredentials, loadUserPrefs } from "./auth.mjs";

function ask(question, { silent = false, hideEcho = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (silent || hideEcho) {
      // Minimal hidden input: still echoes but we note it's saved encrypted.
      rl.question(question + " ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    } else {
      rl.question(question + " ", (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

/** Perform a real bridge login using the stored credentials (best-effort). */
async function loginViaBridge({ email, password, bridgeUrl, dataDir }) {
  // Look for an arena-account-bridge checkout to run its login.
  const candidates = [
    path.join(os.homedir(), ".arena-code", "arena-account-bridge"),
    path.join(os.homedir(), ".arena-code", "repo", "arena-account-bridge"),
    path.join(os.homedir(), "arena-account-bridge"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "bin", "login.mjs"))) {
      // Import and run the bridge's CredentialStore login is complex; instead
      // we invoke its login CLI to persist a real encrypted cookie.
      const { spawnSync } = await import("node:child_process");
      const res = spawnSync("node", ["bin/login.mjs", "--email", email, "--password", password], {
        cwd: dir,
        env: { ...process.env, DATA_DIR: dataDir },
        timeout: 120_000,
        encoding: "utf8",
      });
      if (res.status === 0) return { ok: true, bridgeDir: dir };
      return { ok: false, error: (res.stderr || res.stdout || "login failed").slice(0, 300) };
    }
  }
  return { ok: false, error: "arena-account-bridge not found (run install.sh --bridge)" };
}

/**
 * Run the interactive setup wizard.
 * Accepts optional overrides: { email, password } to skip prompts (non-interactive).
 * Returns { configured, email, bridgeUrl }.
 */
export async function runSetup({ env = process.env, overrides = {}, args = [] } = {}) {
  const config = loadConfig(env, overrides);
  const dataDir = config.dataDir;
  const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const forcedEmail = getArg("--email") || env.ARENA_EMAIL;
  const forcedPassword = getArg("--password") || env.ARENA_PASSWORD;

  console.log("");
  console.log("╭────────────────────────────────────────────╮");
  console.log("│        Arena Code — first-run setup        │");
  console.log("╰────────────────────────────────────────────╯");
  console.log("");

  const interactive = !forcedEmail && !forcedPassword;

  // 1. Theme
  const prefs = loadUserPrefs(dataDir);
  const defaultTheme = prefs.theme || config.theme || "default";
  console.log(`Theme options: ${THEME_NAMES.join(", ")}`);
  const theme = interactive ? ((await ask(`Choose a theme [${defaultTheme}]: `)) || defaultTheme) : defaultTheme;
  const validTheme = THEME_NAMES.includes(theme) ? theme : "default";

  // 2. Language — not prompted (default to en / saved pref). Kept out of the
  // wizard to keep first-run quick; changeable via /lang or config later.
  const lang = prefs.lang || "en";
  const validLang = SUPPORTED.includes(lang) ? lang : "en";

  // 3. Email (forced if provided)
  const savedCreds = hasCredentials(dataDir) ? await import("./auth.mjs").then((m) => m.loadCredentials(dataDir)) : null;
  const defaultEmail = savedCreds?.email || "";
  const email = forcedEmail || (await ask(`Arena email${defaultEmail ? ` [${defaultEmail}]` : ""}: `)) || defaultEmail;
  if (!email) {
    console.log("✖ Email is required. Run 'arena setup' again.");
    return { configured: false, email: "" };
  }

  // 4. Password (forced if provided, else saved, else prompt)
  let password = forcedPassword || (savedCreds?.email === email ? savedCreds.password : "");
  if (!password) {
    password = await ask("Arena password (stored encrypted): ", { silent: true });
    if (!password) {
      console.log("✖ Password is required.");
      return { configured: false, email };
    }
  }

  // 5. Save prefs + credentials
  const prefFile = saveUserPrefs(dataDir, { theme: validTheme, lang: validLang });
  const credFile = saveCredentials(dataDir, { email, password, bridgeUrl: config.bridgeUrl });
  console.log(`✔ Saved theme=${validTheme} lang=${validLang} to ${prefFile}`);
  console.log(`✔ Saved credentials (encrypted) to ${credFile}`);

  // 6. Try a real bridge login (best-effort)
  console.log("\n◇ Attempting bridge login…");
  const login = await loginViaBridge({ email, password, bridgeUrl: config.bridgeUrl, dataDir });
  if (login.ok) {
    console.log("✔ Bridge login OK — you're ready. Run `arena` to start coding.");
  } else {
    console.log(`⚠ Could not complete bridge login (${login.error}).`);
    console.log("  Ensure the arena-account-bridge is installed, then run `arena setup` again or `arena --login`.");
  }

  console.log("");
  return { configured: true, email, bridgeUrl: config.bridgeUrl };
}

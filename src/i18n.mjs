// i18n.mjs — internationalization for Arena Code.
// Language detection: config.lang > ARENA_LANG > LANG env > 'en'.
import en from "./i18n/locales/en.mjs";
import fa from "./i18n/locales/fa.mjs";

export const LOCALES = { en, fa };
export const SUPPORTED = Object.keys(LOCALES);

function detectLang(env = {}) {
  const fromEnv = (env.ARENA_LANG || env.LANG || "").toLowerCase();
  if (fromEnv.startsWith("fa") || fromEnv.includes("fa_")) return "fa";
  if (fromEnv.startsWith("en")) return "en";
  return "en";
}

export function initI18n(lang) {
  const code = lang && LOCALES[lang] ? lang : detectLang(process.env);
  const locale = LOCALES[code] || en;
  return {
    code,
    t: (key) => {
      const parts = key.split(".");
      let cur = locale;
      for (const p of parts) {
        if (cur == null) return key;
        cur = cur[p];
      }
      return typeof cur === "string" ? cur : key;
    },
    locale,
  };
}

/** Getter with caching per code. */
const cache = new Map();
export function getI18n(lang) {
  const code = lang || detectLang(process.env);
  if (cache.has(code)) return cache.get(code);
  const i18n = initI18n(code);
  cache.set(code, i18n);
  return i18n;
}

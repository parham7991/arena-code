// theme.mjs — terminal color themes for the TUI.
// Each theme maps semantic roles to ink colors. Loadable from ~/.arena-code/theme.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const THEMES = {
  default: { primary: "magenta", secondary: "cyan", success: "green", error: "red", warning: "yellow", muted: "gray", bg: "", border: "white" },
  dark: { primary: "blue", secondary: "cyan", success: "green", error: "red", warning: "yellow", muted: "gray", bg: "black", border: "white" },
  light: { primary: "blueBright", secondary: "cyanBright", success: "greenBright", error: "redBright", warning: "yellowBright", muted: "gray", bg: "", border: "black" },
  monokai: { primary: "magentaBright", secondary: "cyanBright", success: "greenBright", error: "redBright", warning: "yellowBright", muted: "gray", bg: "", border: "white" },
  solarized: { primary: "cyan", secondary: "blue", success: "green", error: "red", warning: "yellow", muted: "gray", bg: "", border: "white" },
  nord: { primary: "blueBright", secondary: "cyan", success: "green", error: "red", warning: "yellow", muted: "gray", bg: "", border: "white" },
  dracula: { primary: "magentaBright", secondary: "cyanBright", success: "greenBright", error: "redBright", warning: "yellowBright", muted: "gray", bg: "", border: "white" },
};

export const THEME_NAMES = Object.keys(THEMES);

export function getTheme(name) {
  return THEMES[name] || THEMES.default;
}

/** Load a theme from ~/.arena-code/theme.json or a --theme name. */
export function loadTheme(themeName, dataDir) {
  // explicit name first
  if (themeName && THEMES[themeName]) return { name: themeName, colors: THEMES[themeName] };
  // try user theme.json
  const file = path.join(dataDir || path.join(os.homedir(), ".arena-code"), "theme.json");
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const name = parsed.name || "custom";
      const colors = { ...THEMES.default, ...parsed.colors };
      return { name, colors };
    }
  } catch {
    /* ignore */
  }
  return { name: "default", colors: THEMES.default };
}

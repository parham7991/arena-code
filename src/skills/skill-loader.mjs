// skill-loader.mjs — load skills from three sources with priority
// (highest first): project, user, built-in. YAML parsed with js-yaml.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_DIR = path.join(__dirname, "built-in");

/** Parse a skill from a YAML or JSON string. Returns null on failure. */
export function parseSkill(raw, source = "") {
  try {
    let obj;
    const trimmed = String(raw).trim();
    if (trimmed.startsWith("{")) obj = JSON.parse(trimmed);
    else obj = yaml.load(trimmed);
    if (!obj || typeof obj.name !== "string" || !obj.name.trim()) return null;
    return normalizeSkill(obj, source);
  } catch {
    return null;
  }
}

function normalizeSkill(obj, source) {
  return {
    name: obj.name,
    description: String(obj.description || ""),
    trigger: obj.trigger ?? "",
    system_prompt_extension: String(obj.system_prompt_extension || ""),
    tools_override: Array.isArray(obj.tools_override) ? obj.tools_override : null,
    tools_extra: Array.isArray(obj.tools_extra) ? obj.tools_extra : [],
    steps: Array.isArray(obj.steps) ? obj.steps : [],
    config: {
      auto_trigger: Boolean(obj.config?.auto_trigger ?? false),
      requires_git: Boolean(obj.config?.requires_git ?? false),
      priority: Number(obj.config?.priority ?? 10),
    },
    source: source || "built-in",
  };
}

/** List skill files in a directory (yaml/json). */
function listSkillFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => /\.(ya?ml|json)$/i.test(n));
}

/** Load skills from one directory. */
function loadFromDir(dir, sourceLabel) {
  const out = new Map();
  for (const file of listSkillFiles(dir)) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const skill = parseSkill(raw, sourceLabel);
      if (skill) out.set(skill.name, skill);
    } catch {
      /* skip unreadable skill */
    }
  }
  return out;
}

/** Load a single skill object from a raw string (used by plugin skills). */
export function skillFromObject(obj, source = "plugin") {
  return normalizeSkill(obj, source);
}

/**
 * Load all skills merged from the three sources (project > user > built-in).
 * Returns a Map<name, skill>.
 */
export function loadSkills({ projectRoot, dataDir } = {}) {
  const merged = new Map();

  const projectDir = projectRoot ? path.join(projectRoot, ".arena-code", "skills") : null;
  const userDir = (dataDir || path.join(os.homedir(), ".arena-code"))
    ? path.join(dataDir || path.join(os.homedir(), ".arena-code"), "skills")
    : null;

  // built-in (lowest priority)
  for (const [k, v] of loadFromDir(BUILTIN_DIR, "built-in")) merged.set(k, v);
  // user
  if (userDir) for (const [k, v] of loadFromDir(userDir, "user")) merged.set(k, v);
  // project (highest)
  if (projectDir) for (const [k, v] of loadFromDir(projectDir, "project")) merged.set(k, v);

  return merged;
}

/** Export for testability / reuse. */
export function builtinSkillsDir() {
  return BUILTIN_DIR;
}

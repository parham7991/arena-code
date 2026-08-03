// memory.mjs — project memory ("ARENA_CODE.md"), like CLAUDE.md / AGENTS.md.
// If the file exists in the project root, its content is folded into the
// system prompt so the agent treats it as durable project instructions. The
// agent can also update the file with Write/Edit.
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_PROMPT } from "./sys.mjs";

export const MEMORY_FILE = "ARENA_CODE.md";

/** Read ARENA_CODE.md from the project root, or null if absent/unreadable. */
export function loadProjectMemory(projectRoot) {
  const fp = path.join(projectRoot || "", MEMORY_FILE);
  try {
    if (fs.existsSync(fp)) {
      const content = fs.readFileSync(fp, "utf8");
      return content.trim();
    }
  } catch {
    /* ignore read errors */
  }
  return null;
}

/** Build the full system prompt, appending project memory when present. */
export function buildSystemPrompt(projectRoot) {
  const memory = loadProjectMemory(projectRoot);
  if (!memory) return SYSTEM_PROMPT;
  return `${SYSTEM_PROMPT}\n\n# Project memory (${MEMORY_FILE})\n${memory}`;
}

/**
 * Ensure the agent is instructed about the memory file so it can maintain it.
 * Returns the system prompt with a maintenance note appended (dedup-aware).
 */
export function systemPromptWithMemoryNote(projectRoot) {
  const base = buildSystemPrompt(projectRoot);
  if (!loadProjectMemory(projectRoot)) return base;
  return `${base}\n\n# Memory maintenance\nYou may update ${MEMORY_FILE} at the project root to record conventions, decisions, or facts you want remembered across sessions. Keep it concise and useful.`;
}

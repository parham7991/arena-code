// healing.mjs — Stage 3: Self-Healing Loop (precise, no guessing)
// After Write/Edit, runs Diagnostics + Test, returns healing hint for next turn
import { diagnosticsTool } from "./tools/diagnostics.mjs";
import { testTool } from "./tools/test.mjs";

const MAX_HEAL_RETRIES = 3;
const healCounts = new Map(); // file_path -> count

export function shouldHeal(toolName) {
  return ["Write", "Edit"].includes(toolName);
}

export async function healIfNeeded(toolName, args, ctx) {
  if (!shouldHeal(toolName)) return null;

  const filePath = args?.file_path;
  const key = filePath || "global";
  const count = healCounts.get(key) || 0;
  if (count >= MAX_HEAL_RETRIES) {
    healCounts.set(key, 0);
    return null; // avoid infinite loop
  }

  // 1. Diagnostics (tsc + eslint) — precise 30s timeout inside tool
  const diag = await diagnosticsTool.execute({}, ctx);
  if (!diag.passed && diag.checks?.length) {
    healCounts.set(key, count + 1);
    const fails = diag.checks.filter((c) => !c.ok).map((c) => `- ${c.name}: ${c.output.slice(0, 800)}`).join("\n");
    return {
      kind: "diagnostics",
      passed: false,
      hint: `[AUTO-HEAL ${count + 1}/${MAX_HEAL_RETRIES}] Diagnostics failed after ${toolName} ${filePath}:\n${fails}\n\nFix the errors above with Edit/Write before proceeding. Do not ignore.`,
    };
  }

  // 2. Test — only if Diagnostics passed and project has tests
  // We run Test only if file is not a test file itself to avoid loop
  if (filePath && !filePath.includes(".test.") && !filePath.includes("__tests__")) {
    // Only run Test if project has a test command (quick check)
    const test = await testTool.execute({}, ctx);
    // If no test command, testTool returns ok:true with hint "No diagnostics configured" — we skip
    if (test.passed === false) {
      healCounts.set(key, count + 1);
      return {
        kind: "test",
        passed: false,
        hint: `[AUTO-HEAL ${count + 1}/${MAX_HEAL_RETRIES}] Tests failed after ${toolName}:\n${String(test.output || "").slice(0, 1500)}\n\nFix the failing tests with Edit/Write. Do not deliver failing code.`,
      };
    }
  }

  // Passed — reset counter
  healCounts.set(key, 0);
  return { kind: "ok", passed: true, hint: "[AUTO-HEAL] Diagnostics + Tests passed ✅" };
}

export function resetHeal(filePath) {
  if (filePath) healCounts.delete(filePath);
  else healCounts.clear();
}

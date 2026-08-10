// diagnostics.mjs — Diagnostics tool: run typecheck/lint in one go for flawless delivery
import { exec } from "node:child_process";
import fs from "node:fs";
import { resolvePath } from "./path.mjs";

const MAX_OUT = 30_000;
function trunc(s) {
  const t = String(s || "");
  return t.length > MAX_OUT ? t.slice(0, MAX_OUT) + "\n…[truncated]" : t;
}

function detectCommands(cwd) {
  const cmds = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(`${cwd}/package.json`, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.typescript || fs.existsSync(`${cwd}/tsconfig.json`)) cmds.push({ name: "typecheck", cmd: "npx tsc --noEmit", kind: "typecheck" });
    if (deps.eslint || fs.existsSync(`${cwd}/.eslintrc` ) || fs.existsSync(`${cwd}/eslint.config.js`)) cmds.push({ name: "eslint", cmd: "npx eslint . --max-warnings 0", kind: "lint" });
    else if (deps.biome || fs.existsSync(`${cwd}/biome.json`)) cmds.push({ name: "biome", cmd: "npx biome check .", kind: "lint" });
    if (fs.existsSync(`${cwd}/.prettierrc`) || deps.prettier) cmds.push({ name: "prettier", cmd: "npx prettier --check .", kind: "format" });
  } catch {}
  return cmds;
}

export const diagnosticsTool = {
  schema: {
    name: "Diagnostics",
    description:
      "Run project diagnostics (typecheck + lint) in one call. Auto-detects tsc/eslint/biome from package.json. Returns pass/fail per check — use before delivery to guarantee flawless code.",
    parameters: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory" },
        checks: {
          type: "array",
          items: { type: "string", enum: ["typecheck", "lint", "format"] },
          description: "Which checks to run (default: auto-detect)",
        },
      },
      required: [],
    },
  },

  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) {
      try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: `invalid cwd` }; }
    }
    let cmds = detectCommands(cwd);
    if (Array.isArray(args.checks) && args.checks.length) {
      cmds = cmds.filter((c) => args.checks.includes(c.kind));
    }
    if (cmds.length === 0) return { ok: true, passed: true, checks: [], hint: "No diagnostics configured (no tsc/eslint found)" };

    const results = [];
    for (const c of cmds) {
      const res = await new Promise((resolve) => {
        exec(c.cmd, { cwd, timeout: 30_000, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
          const out = trunc(String(stdout || "") + String(stderr || ""));
          resolve({ name: c.name, command: c.cmd, kind: c.kind, ok: !err, exitCode: err?.code ?? 0, output: out });
        });
      });
      results.push(res);
    }
    const allPassed = results.every((r) => r.ok);
    return {
      ok: true,
      passed: allPassed,
      checks: results,
      hint: allPassed ? "All diagnostics passed" : "Fix diagnostics errors before delivery",
    };
  },
};

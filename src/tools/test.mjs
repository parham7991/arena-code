// test.mjs — Test tool: run tests and generate coverage with auto-healing support
import { exec } from "node:child_process";
import fs from "node:fs";
import { resolvePath } from "./path.mjs";

const MAX_OUT = 50_000;
function trunc(s) {
  const t = String(s || "");
  return t.length > MAX_OUT ? t.slice(0, MAX_OUT) + "\n…[truncated]" : t;
}

function detectTestCommand(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(`${cwd}/package.json`, "utf8"));
    if (pkg.scripts?.test) return "npm test";
    if (pkg.scripts?.["test:unit"]) return "npm run test:unit";
  } catch {}
  if (fs.existsSync(`${cwd}/pytest.ini`) || fs.existsSync(`${cwd}/pyproject.toml`)) return "pytest";
  if (fs.existsSync(`${cwd}/go.mod`)) return "go test ./...";
  return null;
}

export const testTool = {
  schema: {
    name: "Test",
    description:
      "Run project tests with smart detection (npm test / pytest / go test). Returns pass/fail, output, and coverage hint. Use to verify code after writes.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Custom test command (auto-detected if empty)" },
        cwd: { type: "string", description: "Project directory" },
        timeout: { type: "integer", description: "Timeout ms (default 60000)" },
      },
      required: [],
    },
  },

  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) {
      try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: `invalid cwd` }; }
    }
    let cmd = args?.command;
    if (!cmd) cmd = detectTestCommand(cwd);
    if (!cmd) return { error: "Test failed: no test command found (no package.json test script, pytest, or go test)" };

    const timeout = Number.isFinite(Number(args.timeout)) ? Number(args.timeout) : 60_000;
    return new Promise((resolve) => {
      exec(cmd, { cwd, timeout, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        const out = trunc(String(stdout || "") + String(stderr || ""));
        const ok = !err;
        const exitCode = err?.code ?? 0;
        // Heuristic pass/fail
        const failed = /FAIL|failed|Error|✕|×/.test(out) && !/0 failed/.test(out);
        resolve({
          ok,
          passed: ok && !failed,
          command: cmd,
          exitCode: Number.isInteger(exitCode) ? exitCode : -1,
          cwd,
          output: out,
          hint: ok ? "Tests passed" : "Tests failed — fix code and re-run",
        });
      });
    });
  },
};

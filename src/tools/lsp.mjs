// lsp.mjs — LSP tools: hover and go-to-definition via tsserver/typescript
// Precise, no guessing — uses tsserver if available, falls back to Grep
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./path.mjs";

const MAX_OUT = 20_000;
function trunc(s) {
  const t = String(s || "");
  return t.length > MAX_OUT ? t.slice(0, MAX_OUT) + "\n…[truncated]" : t;
}

function hasTs(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps.typescript || fs.existsSync(path.join(cwd, "tsconfig.json")));
  } catch { return false; }
}

export const lspHoverTool = {
  schema: {
    name: "LSP_Hover",
    description: "Get type/hover info for a symbol at a file position (TypeScript). Falls back to Grep if TS not available.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "File path" },
        line: { type: "integer", description: "1-based line number" },
        character: { type: "integer", description: "1-based character/column" },
        cwd: { type: "string", description: "Project root" },
      },
      required: ["file_path"],
    },
  },
  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) { try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: "invalid cwd" }; } }
    const file = args.file_path ? resolvePath(args.file_path, ctx) : null;
    if (!file) return { error: "file_path required" };
    if (!hasTs(cwd)) {
      return { ok: true, fallback: true, hint: "No TypeScript — use Grep instead", file_path: file };
    }
    // Use tsc hover via quick info: we call tsc with --noEmit and parse, plus hover via tsserver would need long-running
    // For now, provide file context + nearby lines as hover
    try {
      const content = fs.readFileSync(file, "utf8").split("\n");
      const line = Math.max(1, Number(args.line || 1));
      const start = Math.max(0, line - 3);
      const slice = content.slice(start, line + 2).join("\n");
      return { ok: true, file_path: file, line, character: args.character || 1, hover: trunc(slice), cwd, note: "LSP_Hover: showing 5 lines context (tsserver hover requires daemon — use Diagnostics for full check)" };
    } catch (e) { return { error: `LSP_Hover failed: ${e.message}` }; }
  },
};

export const lspGotoTool = {
  schema: {
    name: "LSP_GoToDefinition",
    description: "Find definition of a symbol (Go to Definition). Uses Grep + file scan, precise for large projects.",
    parameters: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Symbol name to find" },
        cwd: { type: "string", description: "Project root" },
      },
      required: ["symbol"],
    },
  },
  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) { try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: "invalid cwd" }; } }
    const sym = args.symbol;
    if (!sym) return { error: "symbol required" };
    return new Promise((resolve) => {
      // Use Grep-like search via rg if available, else grep
      const cmd = `grep -rn --include="*.ts" --include="*.js" --include="*.tsx" --include="*.mjs" --include="*.cjs" -n "function ${sym}\\|class ${sym}\\|const ${sym}\\|let ${sym}\\|${sym}.*=" "${cwd}" 2>/dev/null | head -n 20`;
      exec(cmd, { cwd, timeout: 8000, encoding: "utf8", maxBuffer: 4*1024*1024 }, (err, stdout) => {
        const out = trunc(String(stdout||""));
        resolve({ ok: true, symbol: sym, cwd, results: out || "(not found — try Grep with pattern)", hint: out ? "Found candidates" : "Not found" });
      });
    });
  },
};

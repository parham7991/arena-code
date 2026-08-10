// deps.mjs — Deps tool: check if dependencies are installed and which are missing
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./path.mjs";

export const depsTool = {
  schema: {
    name: "Deps_Check",
    description: "Check if project dependencies are installed (node_modules, package.json). Returns missing packages — use before npm run.",
    parameters: {
      type: "object",
      properties: {
        cwd: { type: "string", description: "Project directory" },
      },
      required: [],
    },
  },
  async execute(args, ctx) {
    let cwd = ctx.cwd || ctx.projectRoot || process.cwd();
    if (args.cwd) { try { cwd = resolvePath(args.cwd, ctx); } catch { return { error: "invalid cwd" }; } }
    try {
      const pkgPath = path.join(cwd, "package.json");
      if (!fs.existsSync(pkgPath)) return { ok: true, hasPackageJson: false, hint: "No package.json — not a Node project" };
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const names = Object.keys(deps);
      const missing = [];
      for (const name of names) {
        const modPath = path.join(cwd, "node_modules", name);
        if (!fs.existsSync(modPath)) missing.push(name);
      }
      const hasNodeModules = fs.existsSync(path.join(cwd, "node_modules"));
      return {
        ok: true,
        cwd,
        hasPackageJson: true,
        hasNodeModules,
        totalDeps: names.length,
        missingCount: missing.length,
        missing: missing.slice(0, 20),
        hint: missing.length ? `Missing ${missing.length} deps — run: npm install` : "All deps installed",
      };
    } catch (e) { return { error: `Deps_Check failed: ${e.message}` }; }
  },
};

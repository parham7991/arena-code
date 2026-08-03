// glob.mjs — Glob tool: find files matching a simple glob pattern.
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./path.mjs";

/** Convert a simple glob (supports *, **, ?) into a RegExp. */
export function globToRegExp(pattern) {
  let out = "";
  const n = pattern.length;
  for (let i = 0; i < n; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        if (pattern[i + 2] === "/") {
          // **/  => optional span across zero or more directories
          out += "(?:.*/)?";
          i += 2;
        } else {
          // trailing **  => match anything (including across slashes)
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "/") {
      out += "/";
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp("^" + out + "$");
}

/** Recursively list files under a directory (no symlink following). */
function listFiles(dir, base, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full);
    if (entry.isDirectory()) {
      // skip hidden dirs and node_modules by default to keep results sane
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      listFiles(full, base, out);
    } else if (entry.isFile()) {
      out.push(rel.split(path.sep).join("/"));
    }
  }
}

export const globTool = {
  schema: {
    name: "Glob",
    description:
      "Find files under a directory (or the project root) matching a simple glob. Supports *, **, ?.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern, e.g. 'src/**/*.mjs'." },
        path: {
          type: "string",
          description: "Directory to search under (defaults to project root).",
        },
      },
      required: ["pattern"],
    },
  },

  async execute(args, ctx) {
    const { pattern } = args || {};
    if (typeof pattern !== "string" || pattern.length === 0) {
      return { error: "Glob failed: 'pattern' must be a non-empty string" };
    }
    try {
      const base = args.path ? resolvePath(args.path, ctx) : ctx.projectRoot || ctx.cwd;
      const files = [];
      listFiles(base, base, files);

      const re = globToRegExp(pattern);
      const matches = files.filter((f) => re.test(f));
      return {
        ok: true,
        pattern,
        base: path.resolve(base),
        matches,
        count: matches.length,
      };
    } catch (error) {
      return { error: `Glob failed: ${error.message}` };
    }
  },
};

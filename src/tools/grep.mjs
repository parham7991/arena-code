// grep.mjs — Grep tool: search files for a regex, returning line matches.
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./path.mjs";
import { globToRegExp } from "./glob.mjs";

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
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      listFiles(full, base, out);
    } else if (entry.isFile()) {
      out.push({ abs: full, rel: rel.split(path.sep).join("/") });
    }
  }
}

const MAX_MATCHES = 2000;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const grepTool = {
  schema: {
    name: "Grep",
    description:
      "Search files for a regular expression, returning matched lines with file and line number.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regular expression to search for." },
        path: {
          type: "string",
          description: "Directory to search (defaults to project root).",
        },
        include: {
          type: "string",
          description: "Optional glob to filter filenames, e.g. '**/*.mjs'.",
        },
      },
      required: ["pattern"],
    },
  },

  async execute(args, ctx) {
    const { pattern, include } = args || {};
    if (typeof pattern !== "string" || pattern.length === 0) {
      return { error: "Grep failed: 'pattern' must be a non-empty string" };
    }
    let re;
    try {
      re = new RegExp(pattern);
    } catch {
      return { error: `Grep failed: invalid regular expression '${pattern}'` };
    }

    const base = args.path ? resolvePath(args.path, ctx) : ctx.projectRoot || ctx.cwd;
    const includeRe = include ? globToRegExp(include) : null;

    const files = [];
    listFiles(base, base, files);

    const matches = [];
    for (const file of files) {
      if (matches.length >= MAX_MATCHES) break;
      if (includeRe && !includeRe.test(file.rel)) continue;
      let text;
      try {
        const stat = fs.statSync(file.abs);
        if (stat.size > MAX_FILE_BYTES) continue;
        text = fs.readFileSync(file.abs, "utf8");
      } catch {
        continue;
      }
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          matches.push({ file: file.rel, line: i + 1, text: lines[i] });
          if (matches.length >= MAX_MATCHES) break;
        }
      }
    }

    return { ok: true, pattern, base: path.resolve(base), matches, count: matches.length };
  },
};

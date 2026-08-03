// read.mjs — Read tool: read a UTF-8 file, optionally a slice of lines.
import fs from "node:fs";
import { resolvePath } from "./path.mjs";

export const readTool = {
  schema: {
    name: "Read",
    description:
      "Read a UTF-8 text file. Returns the full content, or a slice of lines when offset/limit are given. Lines are 1-based.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path or path relative to the project root.",
        },
        offset: {
          type: "integer",
          description: "1-based line number to start reading from (inclusive).",
        },
        limit: {
          type: "integer",
          description: "Maximum number of lines to return.",
        },
      },
      required: ["file_path"],
    },
  },

  async execute(args, ctx) {
    const { file_path: filePath } = args || {};
    try {
      const abs = resolvePath(filePath, ctx);
      const raw = fs.readFileSync(abs, "utf8");

      const lines = raw.split("\n");
      if (lines[lines.length - 1] === "") lines.pop(); // ignore trailing newline

      if (args.offset === undefined && args.limit === undefined) {
        return { ok: true, file_path: abs, line_count: lines.length, content: raw };
      }
      const offset = Math.max(1, Number(args.offset || 1));
      const limit = Number.isFinite(Number(args.limit)) ? Number(args.limit) : lines.length;
      const start = offset - 1;
      const slice = lines.slice(start, start + limit);
      return {
        ok: true,
        file_path: abs,
        offset,
        limit,
        returned_lines: slice.length,
        total_lines: lines.length,
        content: slice.join("\n"),
      };
    } catch (error) {
      return { error: `Read failed: ${error.message}` };
    }
  },
};

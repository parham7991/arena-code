// write.mjs — Write tool: create/overwrite a UTF-8 file, creating parent dirs.
import fs from "node:fs";
import path from "node:path";
import { resolvePath } from "./path.mjs";

export const writeTool = {
  schema: {
    name: "Write",
    description: "Create or overwrite a UTF-8 file. Creates parent directories as needed.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path or path relative to the project root.",
        },
        content: {
          type: "string",
          description: "Full content of the file.",
        },
      },
      required: ["file_path", "content"],
    },
  },

  async execute(args, ctx) {
    const { file_path: filePath, content } = args || {};
    if (typeof content !== "string") {
      return { error: "Write failed: 'content' must be a string" };
    }
    try {
      const abs = resolvePath(filePath, ctx);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
      return {
        ok: true,
        file_path: abs,
        bytes: Buffer.byteLength(content, "utf8"),
        chars: content.length,
      };
    } catch (error) {
      return { error: `Write failed: ${error.message}` };
    }
  },
};

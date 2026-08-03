// edit.mjs — Edit tool: replace the first occurrence of old_text with new_text.
import fs from "node:fs";
import { resolvePath } from "./path.mjs";

export const editTool = {
  schema: {
    name: "Edit",
    description:
      "Replace the FIRST exact occurrence of old_text with new_text in a UTF-8 file. Returns an error if old_text is not found.",
    parameters: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Absolute path or path relative to the project root.",
        },
        old_text: {
          type: "string",
          description: "The exact text to find (must exist).",
        },
        new_text: {
          type: "string",
          description: "The replacement text.",
        },
      },
      required: ["file_path", "old_text", "new_text"],
    },
  },

  async execute(args, ctx) {
    const { file_path: filePath, old_text: oldText, new_text: newText } = args || {};
    try {
      const abs = resolvePath(filePath, ctx);
      const raw = fs.readFileSync(abs, "utf8");

      const idx = raw.indexOf(oldText);
      if (idx === -1) {
        return {
          error: `Edit failed: old_text not found in ${abs}. ` +
            "Use Read to inspect the current file content, then provide an exact match.",
        };
      }

      const updated = raw.slice(0, idx) + newText + raw.slice(idx + oldText.length);
      fs.writeFileSync(abs, updated, "utf8");

      return {
        ok: true,
        file_path: abs,
        replaced_chars: oldText.length - newText.length,
        occurrences: 1,
      };
    } catch (error) {
      return { error: `Edit failed: ${error.message}` };
    }
  },
};

// ask.mjs — AskUserQuestion tool: ask the user a question and read their answer
// from stdin. Used for decisions that need human input mid-task.
import readline from "node:readline";

/**
 * Read a single line from stdin with an optional timeout.
 * Returns null on timeout / non-interactive input.
 */
function readLine(prompt, timeoutMs) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let settled = false;
    const timer =
      timeoutMs && timeoutMs > 0
        ? setTimeout(() => {
            if (!settled) {
              settled = true;
              rl.close();
              resolve(null);
            }
          }, timeoutMs)
        : null;

    rl.question(prompt, (answer) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      rl.close();
      resolve(answer);
    });
  });
}

export const askTool = {
  schema: {
    name: "AskUserQuestion",
    description:
      "Ask the user a question in the terminal. Use only when you genuinely need a decision or information that only the user can provide.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question to ask." },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional suggested options.",
        },
      },
      required: ["question"],
    },
  },

  async execute(args, ctx) {
    const { question, options } = args || {};
    if (typeof question !== "string" || question.length === 0) {
      return { error: "AskUserQuestion failed: 'question' must be a non-empty string" };
    }

    let promptText = question;
    if (Array.isArray(options) && options.length > 0) {
      promptText += "\nOptions: " + options.map((o, i) => `${i + 1}. ${o}`).join("  ");
    }
    promptText += "\n❯ ";

    const timeout = ctx?.askTimeoutMs ?? 120_000;
    const answer = await readLine(promptText, timeout);
    if (answer === null) {
      return { error: "AskUserQuestion timed out waiting for user input." };
    }
    return { ok: true, answer: answer.trim() };
  },
};

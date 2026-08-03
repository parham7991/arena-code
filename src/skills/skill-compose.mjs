// skill-compose.mjs — chain multiple skills so the output of one becomes the
// input of the next (e.g. /review -> /refactor -> /test).
import { runSkill } from "./skill-runner.mjs";
import { loadSkills } from "./skill-loader.mjs";

/**
 * Run a chain of skills in order, feeding each skill's output into the next
 * as context.
 *
 * @param {string[]} skillNames
 * @param {object} opts  same options as runSkill, plus `task` (initial input)
 */
export async function composeSkills(skillNames, { task, ...opts } = {}) {
  if (!Array.isArray(skillNames) || skillNames.length === 0) return { results: [], finalContent: "" };
  const skills = opts.skills || loadSkills({ projectRoot: opts.ctx?.projectRoot });
  const results = [];
  let carry = task || "";

  for (const name of skillNames) {
    const result = await runSkill(name, { ...opts, skills, taskOverride: carry });
    results.push({ name, content: result.content });
    carry = result.content || "";
  }

  return { results, finalContent: carry };
}

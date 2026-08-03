// skill-runner.mjs — execute a skill: augment system prompt, optionally run
// guided steps as sub-turns, apply tool overrides, and emit hooks.
import { loadSkills } from "./skill-loader.mjs";
import { runAgent } from "../agent.mjs";
import { getToolSchemas } from "../tools/registry.mjs";
import { hookBus } from "../hooks.mjs";

/** Match an input (e.g. "/review" or "review the code") to a skill by trigger. */
export function matchSkill(input, skills) {
  const text = String(input || "").trim();
  const norm = text.replace(/^\//, "").toLowerCase();
  for (const skill of skills.values()) {
    const triggers = String(skill.trigger || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    const names = [skill.name.toLowerCase()];
    if (triggers.some((t) => norm === t.replace(/^\//, "")) || names.includes(norm)) {
      return skill;
    }
  }
  return null;
}

/** List skills as [{name, description, trigger}] sorted by priority. */
export function listSkills(skills) {
  return [...skills.values()]
    .sort((a, b) => b.config.priority - a.config.priority)
    .map((s) => ({ name: s.name, description: s.description, trigger: s.trigger, source: s.source }));
}

/** Resolve the effective tool list for a skill (tools_override / tools_extra). */
export function resolveSkillTools(skill, allSchemas) {
  if (skill.tools_override) {
    const names = skill.tools_override;
    return allSchemas.filter((t) => names.includes(t.function.name));
  }
  if (skill.tools_extra && skill.tools_extra.length) {
    const extra = new Set(skill.tools_extra);
    return allSchemas.filter((t) => extra.has(t.function.name));
  }
  return allSchemas;
}

/**
 * Run a skill.
 * @param {string} skillName
 * @param {object} opts { bridgeClient, ctx, maxTurns, sessionId, skills (optional map), baseSystemPrompt, onChunk }
 */
export async function runSkill(skillName, opts = {}) {
  const {
    bridgeClient,
    ctx = {},
    maxTurns = 60,
    sessionId,
    skills,
    baseSystemPrompt,
    onChunk,
    tools,
    taskOverride,
  } = opts;

  const skillMap = skills || loadSkills({ projectRoot: ctx.projectRoot });
  const skill = skillMap.get(skillName) || matchSkill(skillName, skillMap);
  if (!skill) throw new Error(`Skill not found: ${skillName}`);

  await hookBus.emit("onSkillStart", { skill, ctx });

  const allSchemas = tools || getToolSchemas();
  const skillTools = resolveSkillTools(skill, allSchemas);
  const systemPrompt = [
    baseSystemPrompt || "",
    skill.system_prompt_extension ? `\n\n# Skill: ${skill.name}\n${skill.system_prompt_extension}` : "",
  ].join("").trim();

  let content = "";
  // If the skill has guided steps, run each as a sub-turn, chaining outputs.
  if (Array.isArray(skill.steps) && skill.steps.length) {
    const messages = [];
    let stepResult = taskOverride || "";
    for (const step of skill.steps) {
      const prompt = `${step.prompt || ""}\n${stepResult ? `\nContext:\n${stepResult}` : ""}`.trim();
      const r = await runAgent({
        messages: [...messages, { role: "user", content: prompt }],
        tools: skillTools,
        bridgeClient,
        maxTurns,
        ctx,
        stream: true,
        sessionId,
        systemPrompt,
        onChunk,
      });
      messages.push(...r.messages);
      stepResult = r.content || "";
      content = stepResult;
    }
  } else {
    // No steps: run a single agent pass with the augmented system prompt.
    const r = await runAgent({
      messages: [{ role: "user", content: taskOverride || skill.description || `Run the ${skill.name} skill.` }],
      tools: skillTools,
      bridgeClient,
      maxTurns,
      ctx,
      stream: true,
      sessionId,
      systemPrompt,
      onChunk,
    });
    content = r.content || "";
  }

  await hookBus.emit("onSkillEnd", { skill, content, ctx });
  return { skill, content, tools: skillTools };
}

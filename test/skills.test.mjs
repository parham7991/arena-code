import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseSkill, loadSkills, builtinSkillsDir } from "../src/skills/skill-loader.mjs";
import { listSkills, matchSkill, resolveSkillTools } from "../src/skills/skill-runner.mjs";
import { composeSkills } from "../src/skills/skill-compose.mjs";
import { resetHooks } from "../src/hooks.mjs";

test("parseSkill parses YAML skill", () => {
  const skill = parseSkill("name: code-review\ndescription: Review\nsystem_prompt_extension: |\n  You are a reviewer.\nsteps:\n  - name: s1\n    prompt: do it\n");
  assert.ok(skill);
  assert.equal(skill.name, "code-review");
  assert.match(skill.system_prompt_extension, /reviewer/);
  assert.equal(skill.steps.length, 1);
});

test("parseSkill handles JSON and invalid input", () => {
  const j = parseSkill('{"name":"x","description":"d"}');
  assert.equal(j.name, "x");
  assert.equal(parseSkill(""), null);
  assert.equal(parseSkill("not: [valid"), null);
});

test("built-in skills load", () => {
  const skills = loadSkills({ projectRoot: os.tmpdir(), dataDir: os.tmpdir() });
  for (const name of ["code-review", "refactor", "debug", "test", "scaffold", "deploy", "security-audit", "docs", "translate", "explain"]) {
    assert.ok(skills.has(name), `expected built-in skill ${name}`);
  }
});

test("listSkills returns sorted entries with descriptions", () => {
  const skills = loadSkills({ projectRoot: os.tmpdir(), dataDir: os.tmpdir() });
  const list = listSkills(skills);
  assert.ok(list.length >= 10);
  assert.ok(list.every((s) => s.name && typeof s.description === "string"));
});

test("matchSkill matches by trigger and name", () => {
  const skills = loadSkills({ projectRoot: os.tmpdir(), dataDir: os.tmpdir() });
  assert.equal(matchSkill("/review", skills).name, "code-review");
  assert.equal(matchSkill("code-review", skills).name, "code-review");
  assert.equal(matchSkill("/nope", skills), null);
});

test("resolveSkillTools applies tools_override", () => {
  const all = [
    { function: { name: "Read" } },
    { function: { name: "Write" } },
    { function: { name: "Bash" } },
  ];
  const skill = { tools_override: ["Read", "Write"] };
  const resolved = resolveSkillTools(skill, all);
  assert.deepEqual(resolved.map((t) => t.function.name), ["Read", "Write"]);
});

test("project skills override built-in by name", () => {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), "arena-skill-proj-"));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-skill-data-"));
  fs.mkdirSync(path.join(proj, ".arena-code", "skills"), { recursive: true });
  fs.writeFileSync(path.join(proj, ".arena-code", "skills", "code-review.yaml"), "name: code-review\ndescription: PROJECT override\n");
  const skills = loadSkills({ projectRoot: proj, dataDir });
  assert.equal(skills.get("code-review").description, "PROJECT override");
  assert.equal(skills.get("code-review").source, "project");
});

test("composeSkills runs skills in sequence (with a fake bridge)", async () => {
  resetHooks();
  // A fake bridge that returns a deterministic stop answer.
  const bridge = {
    async chat() {
      return { choices: [{ message: { role: "assistant", content: "STEP-DONE" }, finish_reason: "stop" }] };
    },
  };
  const skills = new Map();
  skills.set("a", { name: "a", description: "A", system_prompt_extension: "A", steps: [], tools_override: null, tools_extra: [], config: { auto_trigger: false } });
  skills.set("b", { name: "b", description: "B", system_prompt_extension: "B", steps: [], tools_override: null, tools_extra: [], config: { auto_trigger: false } });
  const result = await composeSkills(["a", "b"], { bridgeClient: bridge, ctx: { projectRoot: os.tmpdir() }, maxTurns: 3, skills });
  assert.equal(result.results.length, 2);
  assert.equal(result.finalContent, "STEP-DONE");
});

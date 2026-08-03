// team.mjs — multi-agent Team Leader orchestration.
//
//   arena-code team "task"
//
// The leader (via the bridge) breaks the task into concrete sub-tasks, then
// spawns sub-agents — each with its own x-codex-session-id so every sub-agent
// has an independent persistent session on the bridge — runs them (with a
// concurrency cap), collects their reports, and synthesizes a final combined
// result.
import { runAgent } from "./agent.mjs";
import { getToolSchemas } from "./tools/registry.mjs";
import { SYSTEM_PROMPT } from "./prompts/sys.mjs";

const PLANNER_SYSTEM_PROMPT = `You are the Team Leader for a coding-agent team.
Break the user's task into a small number (1 to 6) of concrete, independently-runnable sub-tasks.
Respond with ONLY a JSON array, no code fences and no other text.
Each element is an object: {"name": "<short label>", "task": "<self-contained mission for a sub-agent>"}.`;

const SYNTHESIZER_SYSTEM_PROMPT = `You are the final synthesizer for a team of coding agents.
Given the original task and each sub-agent's report, produce ONE final combined report:
what each sub-agent did, any files touched, commands run, and the overall status of the task.
Be concrete and concise.`;

/** Extract a JSON array from an LLM response, tolerating code fences/extra text. */
export function parsePlan(text) {
  const raw = String(text || "");
  if (!raw.trim()) return null;
  // Strip markdown code fences.
  const noFences = raw.replace(/```[a-zA-Z]*\n?/g, "").trim();
  const start = noFences.indexOf("[");
  const end = noFences.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  let arr;
  try {
    arr = JSON.parse(noFences.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(arr)) return null;
  return arr
    .filter((it) => it && typeof it.task === "string" && it.task.trim())
    .map((it) => ({ name: String(it.name || "agent").trim() || "agent", task: it.task.trim() }));
}

function slugify(s) {
  return String(s || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "agent";
}

/** Simple concurrency-limited pool. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

export class TeamLeader {
  constructor({ bridge, tools, ctx, maxTurns, concurrency = 3, systemPrompt = SYSTEM_PROMPT }) {
    this.bridge = bridge;
    this.tools = tools || getToolSchemas();
    this.ctx = ctx || {};
    this.maxTurns = maxTurns;
    this.concurrency = concurrency;
    this.systemPrompt = systemPrompt;
  }

  async ask(prompt, system) {
    const resp = await this.bridge.chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    return resp?.choices?.[0]?.message?.content?.trim() ?? "";
  }

  /** Have the leader break the task into sub-tasks. */
  async plan(task) {
    const text = await this.ask(task, PLANNER_SYSTEM_PROMPT);
    const plan = parsePlan(text);
    if (!plan || plan.length === 0) {
      // Fallback: treat the whole task as one sub-task.
      return [{ name: "main", task }];
    }
    return plan;
  }

  /** Run one sub-agent with its own session id. */
  async runSubAgent(sub, i) {
    const sessionId = `team-${slugify(sub.name)}-${i}-${Date.now()}`;
    const chunks = [];
    const result = await runAgent({
      messages: [{ role: "user", content: sub.task }],
      tools: this.tools,
      bridgeClient: this.bridge,
      maxTurns: this.maxTurns,
      ctx: this.ctx,
      stream: true,
      sessionId,
      systemPrompt: this.systemPrompt,
      onChunk: (c) => chunks.push(c),
    });
    return { ...sub, index: i, sessionId, content: result.content, status: result.status, turns: result.turns };
  }

  /** Synthesize the final combined report from all sub-agent results. */
  async synthesize(task, results) {
    const reports = results
      .map((r, i) => `## Sub-agent ${i + 1}: ${r.name} (session ${r.sessionId})\n${r.content || "(no output)"}`)
      .join("\n\n");
    const text = await this.ask(`Original task:\n${task}\n\nSub-agent reports:\n\n${reports}`, SYNTHESIZER_SYSTEM_PROMPT);
    return text;
  }

  /** Full team run: plan -> spawn sub-agents (concurrency-capped) -> synthesize. */
  async run(task, cb = {}) {
    cb.onPlanStart?.();
    const plan = await this.plan(task);
    cb.onPlan?.(plan);

    const results = await mapLimit(plan, this.concurrency, async (sub, i) => {
      cb.onSubStart?.(sub, i);
      const r = await this.runSubAgent(sub, i);
      cb.onSubResult?.(r, i);
      return r;
    });

    cb.onSynthesizeStart?.(results);
    const finalReport = await this.synthesize(task, results);
    cb.onSynthesis?.(finalReport);

    return { task, plan, results, finalReport, status: results.every((r) => r.status === "done") ? "done" : "partial" };
  }
}

/** Convenience one-shot runner. */
export async function runTeam({ task, bridge, ctx, maxTurns = 60, concurrency = 3, systemPrompt, callbacks = {} }) {
  const leader = new TeamLeader({ bridge, ctx, maxTurns, concurrency, systemPrompt });
  return leader.run(task, callbacks);
}

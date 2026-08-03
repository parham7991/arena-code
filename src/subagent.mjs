// subagent.mjs — spawn a sub-agent with its own x-codex-session-id and return
// its result to the main agent. Up to `maxConcurrent` sub-agents run in parallel.
import { runAgent } from "./agent.mjs";
import { getToolSchemas } from "./tools/registry.mjs";

function slug(s) {
  return String(s || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "agent";
}

/**
 * Spawn one sub-agent.
 * @returns {Promise<{content, sessionId, status, turns}>}
 */
export async function spawnSubAgent({ task, tools, systemPrompt, ctx, bridgeClient, maxTurns = 30, name = "agent" }) {
  const sessionId = `sub-${slug(name)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const chunks = [];
  const result = await runAgent({
    messages: [{ role: "user", content: task }],
    tools: tools || getToolSchemas(),
    bridgeClient,
    maxTurns,
    ctx,
    stream: true,
    sessionId,
    systemPrompt,
    onChunk: (c) => chunks.push(c),
  });
  return { content: result.content, sessionId, status: result.status, turns: result.turns };
}

/** Concurrency-limited pool. */
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

/**
 * Run several sub-agents in parallel (default max 3).
 * @param {Array<{task,name}>} tasks
 */
export async function runSubAgents(tasks, { bridgeClient, ctx, tools, systemPrompt, maxTurns = 30, maxConcurrent = 3 } = {}) {
  return mapLimit(tasks, maxConcurrent, (t, i) => spawnSubAgent({ ...t, tools, systemPrompt, ctx, bridgeClient, maxTurns, name: t.name || `agent-${i}` }));
}

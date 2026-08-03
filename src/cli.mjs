#!/usr/bin/env node
// cli.mjs — Arena Code CLI (M3).
//
//   arena-code                        -> interactive TUI
//   arena-code -p "build a parser"    -> one-shot (streaming)
//   arena-code "build a parser"       -> one-shot
//   arena-code -p "..." --continue    -> resume last session
//   arena-code -p "..." --session <id>
//
// Checks bridge health, loads/creates a session, runs the agent loop, persists
// history. Without a prompt it launches the ink-based interactive TUI.
import path from "node:path";
import React, { createElement as h } from "react";
import { render } from "ink";
import { loadConfig } from "./config.mjs";
import { BridgeClient } from "./bridge.mjs";
import { runAgent } from "./agent.mjs";
import { SessionStore } from "./session.mjs";
import { getToolSchemas } from "./tools/registry.mjs";
import { systemPromptWithMemoryNote, loadProjectMemory } from "./prompts/memory.mjs";
import { manageContextAsync, compactMessagesWithLLM, messagesTokens, pruneToolMessages } from "./context.mjs";
import { runTeam } from "./team.mjs";
import { ArenaApp } from "./ui/app.mjs";

function printHelp() {
  console.log(`Arena Code — terminal coding agent (M6)

USAGE:
  arena-code                     Interactive TUI.
  arena-code -p <prompt> [opts]  One-shot task.
  arena-code "<prompt>" [opts]   One-shot task.
  arena-code team "<task>"       Break a task into sub-tasks and run them as a team.
  arena-code --sessions          List this project's saved sessions.

OPTIONS:
  -p, --prompt <text>    The task for the agent.
  team <task>            Run as a multi-agent team (leader plans, spawns sub-agents).
  -c, --cwd <dir>        Project directory to work in (default: current dir).
  -k, --key <key>        Bridge API key (ARENA_BRIDGE_KEY).
  -u, --url <url>        Bridge URL (ARENA_BRIDGE_URL, default http://127.0.0.1:20140).
  -m, --max-turns <n>    Max agent turns (default 60).
  -a, --autonomy <ask|auto>  Tool approval policy (default ask).
  -t, --team-concurrency <n>  Max sub-agents running in parallel (default 3).
      --stream           Stream output (default in one-shot mode).
      --no-stream        Return whole answers instead of streaming.
      --continue         Continue the most recent session for this project.
      --session <id>     Continue a specific session id (alias: --session-id).
      --sessions         List this project's saved sessions and exit.
  -h, --help             Show this help.

ENV:
  ARENA_BRIDGE_URL, ARENA_BRIDGE_KEY, ARENA_AUTONOMY, ARENA_MAX_TURNS, ARENA_TEAM_CONCURRENCY, ARENA_CODE_DIR

PROJECT MEMORY:
  If ARENA_CODE.md exists in the project root, its contents are added to the
  agent's system prompt (like CLAUDE.md / AGENTS.md). The agent may update it.`);
}

function parseArgs(argv) {
  const out = { prompt: "", cwd: process.cwd(), stream: null, cont: false, session: null, sessions: false, team: false, teamTask: "" };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "-p" || a === "--prompt") out.prompt = rest.shift() ?? "";
    else if (a === "team") {
      out.team = true;
      out.teamTask = rest.shift() ?? "";
    } else if (a === "-c" || a === "--cwd") out.cwd = rest.shift() ?? process.cwd();
    else if (a === "-k" || a === "--key") out.key = rest.shift() ?? "";
    else if (a === "-u" || a === "--url") out.url = rest.shift() ?? "";
    else if (a === "-m" || a === "--max-turns") out.maxTurns = Number(rest.shift());
    else if (a === "-t" || a === "--team-concurrency") out.teamConcurrency = Number(rest.shift());
    else if (a === "-a" || a === "--autonomy") out.autonomy = rest.shift() ?? "";
    else if (a === "--stream") out.stream = true;
    else if (a === "--no-stream") out.stream = false;
    else if (a === "--continue") out.cont = true;
    else if (a === "--session" || a === "--session-id") out.session = rest.shift() ?? "";
    else if (a === "--sessions") out.sessions = true;
    else if (a.startsWith("-")) { /* unknown flag */ }
    else if (!out.prompt) out.prompt = a;
  }
  return out;
}

/** Build the shared engine that drives runAgent, persists, and manages context. */
function createEngine({ bridge, store, sessionId, tools, ctx, maxTurns, initialMessages = [], systemPrompt }) {
  const state = { messages: [...initialMessages] };
  return {
    get sessionId() {
      return sessionId;
    },
    get messages() {
      return state.messages;
    },
    tokenEstimate() {
      return messagesTokens(state.messages);
    },
    persist() {
      return store.dump(sessionId, state.messages);
    },
    /** Prune + auto-compact (LLM-backed) if over budget. Async. */
    async manageContext() {
      const before = messagesTokens(state.messages);
      const res = await manageContextAsync(state.messages, {
        limitTokens: 128_000,
        targetTokens: 90_000,
        bridgeClient: bridge,
        sessionId,
      });
      state.messages = res.messages;
      this.persist();
      return {
        pruned: res.pruned,
        compacted: Boolean(res.compacted),
        mode: res.compacted?.mode || "none",
        before,
        after: messagesTokens(state.messages),
      };
    },
    /** Compact history with an LLM summary via the bridge (async). */
    async compact() {
      const before = messagesTokens(state.messages);
      const res = await compactMessagesWithLLM(state.messages, { bridgeClient: bridge, keepRecent: 8, sessionId });
      state.messages = res.messages;
      this.persist();
      return { before, after: res.tokensAfter, summary: res.summary, mode: res.mode };
    },
    async run(prompt, cb = {}) {
      state.messages.push({ role: "user", content: prompt });
      // Auto-prune old/large tool messages if history is near the context limit.
      if (messagesTokens(state.messages) > 110_000) {
        const pruned = pruneToolMessages(state.messages, { limitTokens: 128_000, keepRecent: 6 });
        state.messages = pruned.messages;
        this.persist();
        if (pruned.pruned > 0) cb.onPruned?.(pruned.pruned);
      }
      cb.onTokens?.(messagesTokens(state.messages));
      return runAgent({
        messages: state.messages,
        tools,
        bridgeClient: bridge,
        maxTurns,
        ctx,
        stream: true,
        sessionId,
        systemPrompt,
        onChunk: cb.onChunk,
        onTurn: cb.onTurn,
        onToolCall: cb.onToolCall,
        onToolResult: cb.onToolResult,
        onContent: cb.onContent,
        onSave: () => this.persist(),
      });
    },
    save(messages) {
      state.messages = messages;
      return store.dump(sessionId, messages);
    },
  };
}

/** Run a multi-agent team and print progress + final merged report. */
async function runTeamCli({ task, bridge, ctx, maxTurns, teamConcurrency, systemPrompt, projectRoot }) {
  console.log(`● Arena Code — team leader · cwd ${projectRoot}`);
  console.log(`  concurrency=${teamConcurrency} · maxTurns=${maxTurns}\n`);

  let planLen = 0;
  const result = await runTeam({
    task,
    bridge,
    ctx,
    maxTurns,
    concurrency: teamConcurrency,
    systemPrompt,
    callbacks: {
      onPlanStart: () => console.log("◇ Planning…"),
      onPlan: (plan) => {
        planLen = plan.length;
        console.log(`◇ Plan (${plan.length} sub-task${plan.length === 1 ? "" : "s"}):`);
        plan.forEach((s, i) => console.log(`    ${i + 1}. ${s.name} — ${s.task.slice(0, 90)}`));
        console.log("");
      },
      onSubStart: (sub, i) => {
        console.log(`▶ [${i + 1}/${planLen}] starting ${sub.name}`);
      },
      onSubResult: (r, i) => {
        console.log(`  ✔ [${i + 1}] ${r.name} (${r.turns} turns, status ${r.status})`);
      },
      onSynthesizeStart: () => console.log("\n◇ Merging sub-agent results…\n"),
      onSynthesis: (text) => {
        console.log("— Final combined report —\n");
        console.log(text);
      },
    },
  });

  console.log(`\n— team done (${result.plan.length} sub-agents, status ${result.status}) —`);
  return result;
}

/** Launch the interactive ink TUI. */
function runInteractive({ engine, sessionId, projectRoot, autonomy }) {
  if (!process.stdin.isTTY) {
    console.error("✖ Interactive mode needs a terminal (TTY) for keyboard input.");
    console.error("  Use one-shot mode instead: arena-code -p \"your prompt\" --cwd <dir>");
    process.exitCode = 2;
    return;
  }
  const instance = render(
    h(ArenaApp, { engine, sessionId, projectRoot, autonomy }),
    { exitOnCtrlC: false }
  );
  const onSigint = () => {
    instance.unmount();
    process.exit(0);
  };
  process.on("SIGINT", onSigint);
  instance.waitUntilExit().then(() => {
    process.removeListener("SIGINT", onSigint);
    process.exit(0);
  });
  return instance;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const config = loadConfig({ ...process.env });
  const bridgeUrl = args.url || config.bridgeUrl;
  const bridgeKey = args.key || config.bridgeKey;
  const maxTurns = Number.isInteger(args.maxTurns) ? args.maxTurns : config.maxTurns;
  const autonomy = ["ask", "auto"].includes(args.autonomy) ? args.autonomy : config.autonomy;

  const projectRoot = path.resolve(args.cwd);
  const bridge = new BridgeClient({ url: bridgeUrl, apiKey: bridgeKey, timeoutMs: config.requestTimeoutMs });

  const health = await bridge.healthcheck();
  if (!health.ok) {
    console.error(`✖ Arena bridge not reachable at ${bridgeUrl}.`);
    console.error(`  ${health.error ? `(${health.error})` : `HTTP ${health.status}`}`);
    console.error("  Start it with the arena-account-bridge (node src/index.mjs) and try again.");
    process.exitCode = 1;
    return;
  }

  const store = new SessionStore({ dataDir: config.dataDir, projectRoot });

  // List sessions and exit.
  if (args.sessions) {
    const list = store.listSessions();
    if (!list.length) {
      console.log("No sessions saved for this project.");
    } else {
      console.log(`Sessions for ${projectRoot}:`);
      for (const s of list) {
        const date = new Date(s.updatedAt).toISOString();
        console.log(`  ${s.id.padEnd(18)} ${s.messageCount} msgs · ${s.size} B · ${date}`);
      }
    }
    return;
  }

  let sessionId = args.session;
  let initialMessages = [];
  if (args.session) {
    initialMessages = store.load(args.session).messages;
  } else if (args.cont) {
    const last = store.continueLast();
    if (last) {
      sessionId = last.id;
      initialMessages = last.messages;
    }
  }
  if (!sessionId) sessionId = `s-${Date.now()}`;

  // Project memory folded into the system prompt (ARENA_CODE.md).
  const systemPrompt = systemPromptWithMemoryNote(projectRoot);
  const memoryActive = Boolean(loadProjectMemory(projectRoot));

  // When continuing, refresh the leading system message with the current prompt.
  if (initialMessages[0]?.role === "system") {
    initialMessages[0].content = systemPrompt;
  }

  const ctx = { cwd: projectRoot, projectRoot, autonomy };
  const tools = getToolSchemas();
  const engine = createEngine({ bridge, store, sessionId, tools, ctx, maxTurns, initialMessages, systemPrompt });
  engine.memoryActive = memoryActive;

  // --- Team mode ---
  if (args.team) {
    if (!args.teamTask) {
      console.error("✖ Team mode needs a task: arena-code team \"your task\"");
      process.exitCode = 2;
      return;
    }
    const teamConcurrency = Number.isInteger(args.teamConcurrency) ? args.teamConcurrency : config.teamConcurrency;
    return runTeamCli({ task: args.teamTask, bridge, ctx, maxTurns, teamConcurrency, systemPrompt, projectRoot });
  }

  // --- Interactive mode ---
  if (!args.prompt) {
    console.log(`● Arena Code — bridge ${health.status === 200 ? "OK" : "UP"} · session ${sessionId}${memoryActive ? " · memory ✔" : ""}`);
    return runInteractive({ engine, sessionId, projectRoot, autonomy });
  }

  // --- One-shot mode ---
  const stream = args.stream ?? true;
  console.log(`● Arena Code — bridge ${health.status === 200 ? "OK" : "UP"} · cwd ${projectRoot}`);
  console.log(`  session=${sessionId} · maxTurns=${maxTurns} · autonomy=${autonomy} · stream=${stream} · tools=${tools.length}${memoryActive ? " · ARENA_CODE.md ✔" : ""}\n`);

  const result = await engine.run(args.prompt, {
    onChunk: (text) => {
      if (stream) process.stdout.write(text);
    },
    onContent: (content) => {
      if (content && !stream) console.log(content);
    },
    onToolCall: ({ name, args }) => {
      if (stream) process.stdout.write("\n");
      console.log(`  ▶ ${name} ${JSON.stringify(args).slice(0, 80)}`);
    },
    onToolResult: ({ name, result: r }) => {
      const tag = r && r.error ? "✖" : "✔";
      const err = r && r.error ? ` — ${String(r.error).slice(0, 120)}` : "";
      console.log(`    ${tag} ${name}${err}`);
    },
  });

  const saved = engine.save(result.messages);
  console.log(`\n— done (${result.status}, ${result.turns} turns, saved ${saved.count} msgs) —`);
}

main().catch((error) => {
  console.error(`✖ Error: ${error.message}`);
  process.exitCode = 1;
});

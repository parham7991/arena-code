// built-in telemetry plugin — track tool/session metrics and expose /stats.
import { definePlugin } from "../plugin-api.mjs";

function makeStore() {
  return { tools: new Map(), sessions: 0, startedAt: Date.now() };
}

export default definePlugin({
  name: "telemetry",
  version: "1.0.0",
  description: "Telemetry and usage metrics",
  tools: [
    {
      schema: {
        name: "Stats",
        description: "Show session usage stats (tokens, time, tool counts).",
        parameters: { type: "object", properties: {}, required: [] },
      },
      async execute() {
        const s = telemetryStore;
        const toolEntries = [...s.tools.entries()].map(([k, v]) => ({ tool: k, count: v.count, totalMs: v.totalMs }));
        return {
          ok: true,
          uptimeMs: Date.now() - s.startedAt,
          sessions: s.sessions,
          toolCalls: toolEntries.reduce((a, b) => a + b.count, 0),
          tools: toolEntries,
        };
      },
    },
  ],
  commands: [
    {
      name: "stats",
      description: "Show usage stats.",
      handler: async () => {
        const s = telemetryStore;
        return {
          uptimeMs: Date.now() - s.startedAt,
          sessions: s.sessions,
          tools: [...s.tools.entries()].map(([k, v]) => `${k}: ${v.count}`).join(", "),
        };
      },
    },
  ],
  hooks: {
    onToolBefore(data) {
      telemetryStore.tools.set(data?.tool || "?", { count: (telemetryStore.tools.get(data?.tool)?.count || 0) + 1, totalMs: 0 });
    },
    onSessionStart() {
      telemetryStore.sessions += 1;
    },
  },
});

const telemetryStore = makeStore();

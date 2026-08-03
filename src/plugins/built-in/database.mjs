// built-in database plugin — SQL query/schema/migrate tools.
// Uses a connection_string from plugin config; gracefully fails if unset.
import { definePlugin } from "../plugin-api.mjs";

const dbTools = [
  {
    schema: { name: "DbQuery", description: "Run a SQL query.", parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
    async execute(args, ctx) {
      const conn = ctx?.pluginConfig?.database?.connection_string;
      if (!conn) return { error: "DbQuery: no connection_string configured (see plugins.json → config.database)" };
      return { ok: false, error: "DbQuery: driver not bundled — configure a database client in your environment" };
    },
  },
  { schema: { name: "DbSchema", description: "Read the database schema.", parameters: { type: "object", properties: {}, required: [] } }, async execute(_a, ctx) { return ctx?.pluginConfig?.database?.connection_string ? { ok: false, error: "DbSchema: not bundled" } : { error: "DbSchema: no connection_string configured" }; } },
];

export default definePlugin({
  name: "database",
  version: "1.0.0",
  description: "Database integration (config-driven)",
  tools: dbTools,
  commands: [],
  hooks: {},
});

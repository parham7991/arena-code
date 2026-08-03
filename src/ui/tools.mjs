// tools.mjs — live view of the tools the agent is executing.
// Each tool row shows status, name and a brief arg summary; expanded rows show
// the full result (toggled with the expand key in the app).
import React from "react";
import { Box, Text } from "ink";
import { createElement as h } from "react";

/** Build a short human-readable summary of a tool call's arguments. */
export function toolSummary(name, args = {}) {
  if (args?.file_path) return args.file_path;
  if (args?.command) return String(args.command).slice(0, 60);
  if (args?.pattern) return args.pattern;
  if (args?.question) return String(args.question).slice(0, 40);
  const entries = Object.entries(args).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 30)}`).join(" ");
}

function statusMeta(status) {
  if (status === "running") return { icon: "▶", color: "cyan" };
  if (status === "error") return { icon: "✖", color: "red" };
  if (status === "done") return { icon: "✔", color: "green" };
  return { icon: "·", color: "gray" };
}

export function ToolList({ tools = [], expandedId, onToggle }) {
  if (!tools.length) return null;
  return h(
    Box,
    { flexDirection: "column", marginBottom: 0 },
    tools.map((tool) => {
      const meta = statusMeta(tool.status);
      const summary = toolSummary(tool.name, tool.args);
      const hasResult = tool.result !== undefined && tool.result !== null;
      const isExpanded = tool.id === expandedId;
      const resultText = typeof tool.result === "string"
        ? tool.result
        : JSON.stringify(tool.result, null, 2);

      return h(
        Box,
        { key: tool.id, flexDirection: "column" },
        h(
          Text,
          { color: meta.color },
          `${meta.icon} ${tool.name}${summary ? " " + summary : ""}` +
            (hasResult ? (isExpanded ? " [−]" : " [+]") : tool.status === "running" ? " …" : "")
        ),
        isExpanded && hasResult
          ? h(Text, { dimColor: true }, resultText.slice(0, 2000))
          : null
      );
    })
  );
}

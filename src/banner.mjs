// banner.mjs — the ASCII art startup banner for Arena Code.
import { VERSION, FULL_NAME } from "./version.mjs";

export const BANNER = `
   █████╗ ██████╗ ███████╗███╗   ██╗ █████╗
  ██╔══██╗██╔══██╗██╔════╝████╗  ██║██╔══██╗
  ███████║██████╔╝█████╗  ██╔██╗ ██║███████║
  ██╔══██║██╔══██╗██╔══╝  ██║╚██╗██║██╔══██║
  ██║  ██║██║  ██║███████╗██║ ╚████║██║  ██║
  ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝`;

export function formatBanner({ sessionId, projectRoot, autonomy, memoryActive, pluginCount, bridgeStatus, toolCount, theme, lang, warp }) {
  const lines = [];
  lines.push(`  ${FULL_NAME} v${VERSION}  —  a coding agent on your own Arena account`);
  lines.push(`  ${"─".repeat(58)}`);
  lines.push(`  bridge   ${bridgeStatus}`);
  lines.push(`  project  ${projectRoot}`);
  lines.push(`  session  ${sessionId}${memoryActive ? "  ·  memory ✔" : ""}`);
  lines.push(`  autonomy ${autonomy}  ·  tools ${toolCount}  ·  plugins ${pluginCount}`);
  lines.push(`  theme    ${theme}  ·  lang ${lang}${warp ? "  ·  warp ✔" : ""}`);
  lines.push(`  ${"─".repeat(58)}`);
  lines.push(`  type a task or a command. try /help, /skills, /plugins`);
  return lines.join("\n");
}

#!/usr/bin/env node
/**
 * CLI, for agents that can run shell commands (Codex CLI, Aider, local agents).
 *   indie-alternatives search "add a background to screenshots"
 *   indie-alternatives details shottr
 *   indie-alternatives log "turn meeting recordings into notes"
 *   indie-alternatives needs
 * Output is always JSON.
 */
import { fromEnv } from "./sources.js";
import { runTool } from "./core.js";

const [cmd, ...rest] = process.argv.slice(2);
const text = rest.join(" ");
const map: Record<string, [string, Record<string, unknown>]> = {
  search: ["search_tools", { query: text }],
  details: ["get_tool_details", { id: text }],
  log: ["log_unmet_need", { need: text }],
  needs: ["list_unmet_needs", {}],
};

if (!cmd || !map[cmd]) {
  console.error("Usage: indie-alternatives <search|details|log|needs> [text]");
  process.exit(2);
}
try {
  const [tool, args] = map[cmd];
  console.log(JSON.stringify(await runTool(await fromEnv(), tool, args, "cli"), null, 2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

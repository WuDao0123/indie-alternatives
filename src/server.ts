import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { INSTRUCTIONS, VERSION, enabledTools, indexFor, runTool, type Deps } from "./core.js";
import type { jsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";

export { INSTRUCTIONS };

/** MCP server: Claude, ChatGPT, Cursor, VS Code, Gemini CLI and every other MCP client */
export function createServer(deps: Deps, opts: { jsonSchemaValidator?: jsonSchemaValidator } = {}): McpServer {
  const server = new McpServer(
    { name: "indie-alternatives", version: VERSION },
    { instructions: INSTRUCTIONS, ...(opts.jsonSchemaValidator ? { jsonSchemaValidator: opts.jsonSchemaValidator } : {}) },
  );

  for (const tool of enabledTools(deps)) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: tool.readOnly
          ? { readOnlyHint: true, openWorldHint: false }
          : { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args: Record<string, unknown>) => {
        try {
          const data = await runTool(deps, tool.name, args, "mcp");
          return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], structuredContent: data };
        } catch (e) {
          return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true };
        }
      },
    );
  }

  server.registerResource(
    "catalog-categories",
    "indiealt://categories",
    { title: "Catalog categories", description: "All categories in the catalog", mimeType: "application/json" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify((await indexFor(deps.catalog)).categories()) }],
    }),
  );

  return server;
}

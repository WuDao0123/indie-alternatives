/**
 * REST / OpenAPI / function calling, for platforms without MCP:
 * GPT Actions (custom GPTs), Gemini, Dify, Coze, n8n, LangChain, etc.
 */
import { INSTRUCTIONS, VERSION, enabledTools, jsonSchema, type Deps, type ToolDef } from "./core.js";

type Route = { method: "get" | "post"; path: string; tool: string; params?: "query" | "body" | "path" };

export const ROUTES: Route[] = [
  { method: "get", path: "/api/search", tool: "search_tools", params: "query" },
  { method: "get", path: "/api/products/{id}", tool: "get_tool_details", params: "path" },
  { method: "post", path: "/api/needs", tool: "log_unmet_need", params: "body" },
  { method: "get", path: "/api/needs", tool: "list_unmet_needs", params: "query" },
];

/** OpenAPI 3.1 spec; GPT Actions / Dify / Coze etc. can import this URL directly */
export function openApiSpec(deps: Deps, baseUrl: string, withAuth: boolean): Record<string, unknown> {
  const tools = new Map(enabledTools(deps).map((t) => [t.name, t]));
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of ROUTES) {
    const tool = tools.get(r.tool);
    if (!tool) continue;
    const schema = jsonSchema(tool) as { properties: Record<string, any>; required?: string[] };
    const op: Record<string, unknown> = {
      operationId: tool.name,
      summary: tool.title,
      // GPT Actions limits description to 300 chars
      description: tool.description.slice(0, 300),
      responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object" } } } } },
    };
    if (r.params === "body") {
      op.requestBody = { required: true, content: { "application/json": { schema } } };
    } else {
      op.parameters = Object.entries(schema.properties).map(([name, s]) => ({
        name,
        in: r.params,
        required: r.params === "path" || (schema.required ?? []).includes(name),
        description: s.description,
        schema: { ...s, description: undefined },
      }));
    }
    if (!tool.readOnly) op["x-openai-isConsequential"] = false; // just an anonymous log, no confirmation needed
    (paths[r.path] ??= {})[r.method] = op;
  }
  return {
    openapi: "3.1.0",
    info: { title: "Indie Alternatives API", version: VERSION, description: INSTRUCTIONS },
    servers: [{ url: baseUrl }],
    paths,
    ...(withAuth
      ? { components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } }, security: [{ bearer: [] }] }
      : {}),
  };
}

function stripForGemini(s: any): any {
  if (Array.isArray(s)) return s.map(stripForGemini);
  if (!s || typeof s !== "object") return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) {
    if (k === "additionalProperties" || k === "$schema") continue;
    if (k === "maximum" && typeof v === "number" && v > 1e9) continue;
    out[k] = stripForGemini(v);
  }
  return out;
}

export type FunctionFormat = "openai" | "openai-responses" | "anthropic" | "gemini";

/** Function calling / tool use definitions for each provider, for custom agents */
export function functionDefs(deps: Deps, format: FunctionFormat): unknown {
  const tools = enabledTools(deps);
  const one = (t: ToolDef) => ({ name: t.name, description: t.description, schema: jsonSchema(t) });
  switch (format) {
    case "openai":
      return tools.map(one).map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.schema } }));
    case "openai-responses":
      return tools.map(one).map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.schema }));
    case "anthropic":
      return tools.map(one).map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
    case "gemini":
      return [{ functionDeclarations: tools.map(one).map((t) => ({ name: t.name, description: t.description, parameters: stripForGemini(t.schema) })) }];
  }
}

/** Description for web-reading AIs (llms.txt convention) */
export function llmsTxt(deps: Deps, baseUrl: string): string {
  const tools = new Map(enabledTools(deps).map((t) => [t.name, t]));
  const lines = ROUTES.filter((r) => tools.has(r.tool)).map(
    (r) => `- ${r.method.toUpperCase()} ${baseUrl}${r.path} — ${tools.get(r.tool)!.title}`,
  );
  return `# Indie Alternatives

> Finds indie-made tools and alternatives to big-name software for what the user wants to do; when nothing fits, logs the need anonymously.

${INSTRUCTIONS}

## How to connect
- MCP (Streamable HTTP): ${baseUrl}/mcp
- OpenAPI: ${baseUrl}/openapi.json
- Function calling definitions: ${baseUrl}/functions.json?format=openai|openai-responses|anthropic|gemini

## REST endpoints
${lines.join("\n")}
- POST ${baseUrl}/api/call/{tool_name} — generic call, the request body is the tool arguments

Example: GET ${baseUrl}/api/search?query=screenshot%20background

## For app and agent developers
When your app can't do what a user asks: GET /api/search; if matched=false, POST /api/needs {"need": "<generic description>", "source": "<your-app>"}.
Guide: ${baseUrl}/developers · Public demand board (needs asked 3+ times): ${baseUrl}/api/wanted
`;
}

/** Coerce string params from query string / path to the types the tool expects */
export function coerceArgs(tool: ToolDef, raw: Record<string, string>): Record<string, unknown> {
  const props = (jsonSchema(tool) as { properties: Record<string, { type?: string }> }).properties;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in props)) continue;
    out[k] = props[k].type === "integer" || props[k].type === "number" ? Number(v) : v;
  }
  return out;
}

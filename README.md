# Indie Alternatives

English | [中文](README.zh-CN.md) · [indiealternatives.dev](https://indiealternatives.dev) · [List your product](https://indiealternatives.dev/submit)

Indie-made alternatives to big-name software, inside **any AI assistant**:

1. When a user asks "is there a tool that does X?" or "what's an alternative to Typeform?", the AI searches a **catalog of products made by indie makers** and recommends the best matches.
2. When nothing fits, the need is **logged anonymously**, so indie makers can see what people want that doesn't exist yet.

## Quick start

Add this MCP server URL to your AI assistant. No install, no API key:

```
https://indiealternatives.dev/mcp
```

| Client | How |
| --- | --- |
| ChatGPT | Settings → Apps & Connectors → Advanced → Developer mode → Create → paste the URL, auth "None" |
| Claude (web / desktop) | Settings → Connectors → Add custom connector → paste the URL |
| Claude Code | `claude mcp add --transport http indie-alternatives https://indiealternatives.dev/mcp` |
| Cursor / Windsurf / Gemini CLI | `{ "mcpServers": { "indie-alternatives": { "url": "https://indiealternatives.dev/mcp" } } }` |
| VS Code | `{ "servers": { "indie-alternatives": { "type": "http", "url": "https://indiealternatives.dev/mcp" } } }` in `.vscode/mcp.json` |

Then ask: *"What's a good alternative to Typeform?"* or *"Is there a tool that turns screenshots into nice social images?"*

Makers: [list your product for free](https://indiealternatives.dev/submit).

## All integration styles

One codebase, every integration style:

| Integration | Endpoint / entry | Works with |
| --- | --- | --- |
| **MCP (local stdio)** | `node dist/src/stdio.js` (from a clone; npm package coming soon) | Claude Desktop, Claude Code, Cursor, Windsurf, VS Code Copilot, Cline, Gemini CLI, Codex CLI, Zed, LM Studio, … |
| **MCP (remote HTTP)** | `https://indiealternatives.dev/mcp` | ChatGPT (developer mode / apps), Claude custom connectors, Le Chat, Copilot Studio, and every client above that supports remote MCP |
| **REST + OpenAPI** | `https://indiealternatives.dev/openapi.json` | Custom GPTs (GPT Actions), Gemini / Vertex AI, Dify, n8n, Zapier, LangChain, … |
| **Function calling** | `https://indiealternatives.dev/functions.json?format=…` | Your own agent on the OpenAI / Anthropic / Gemini APIs |
| **CLI** | `indie-alternatives search "…"` | Any agent that can run shell commands |

`https://indiealternatives.dev/llms.txt` describes the service for AIs that read web pages.

## Tools

| Tool | REST | What it does |
| --- | --- | --- |
| `search_tools` | `GET /api/search?query=…` | Match a need (any language) against the catalog, with optional category / pricing / platform filters. `matched: false` means nothing suitable was found. |
| `get_tool_details` | `GET /api/products/{id}` | Full description of a product. |
| `log_unmet_need` | `POST /api/needs` | Record an unmet need anonymously. |
| `list_unmet_needs` | `GET /api/needs` | Aggregated needs, most requested first (hide with `HIDE_NEEDS_LIST=1`). |

Every tool can also be called with `POST /api/call/{tool_name}`, with the arguments as the request body.

The service tells the AI how to use it (MCP `instructions`, OpenAPI `info.description`, llms.txt): when to search, when to log, and to strip personal info before logging.

## Privacy

- A record contains **only**: a random id, the need text, optional domain / platform / budget, the date (day only), and a fingerprint used to group similar needs.
- **Never stored**: user identity, conversation content, IP, User-Agent, exact timestamps. The HTTP server keeps no access log.
- The server redacts again before writing: emails, phone numbers, links, IPs, ID and card numbers, @handles, messenger IDs and "my name is …" are replaced with placeholders like `[email]` and `[phone]`.
- The tool description asks the AI to rewrite the need generically first, and not to log if the user declines.
- **Local installs** (`npx indie-alternatives-mcp`, the CLI) read the latest catalog from `https://indiealternatives.dev/catalog.json` (falling back to the bundled copy) and send unmet needs to `https://indiealternatives.dev/api/needs`, so needs from every install are pooled for makers. Only the redacted need fields are sent. Set `INDIE_ALT_OFFLINE=1` to keep everything on your machine.
- Usage stats on the hosted service are **daily counters only** (e.g. "searches today", "searches with no match", "connections from client X"). Nothing per user or per request is stored.
- Makers' optional contact email from the submission form is kept private and used only for the review.

## Install

Node.js 18+.

```bash
npm install
npm run build
npm test
```

## 1. Local MCP clients (run it yourself)

Most people should use the hosted URL above. To run locally from a clone (`npm install && npm run build`), almost every MCP client uses the same config, in a different file. The npm package (`npx -y indie-alternatives-mcp`) is coming soon:

```json
{
  "mcpServers": {
    "indie-alternatives": {
      "command": "node",
      "args": ["/absolute/path/indie-alternatives/dist/src/stdio.js"]
    }
  }
}
```

(Once the npm package is out: `"command": "npx", "args": ["-y", "indie-alternatives-mcp"]`.)

| Client | How |
| --- | --- |
| Claude Desktop | Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), paste the config, restart |
| Claude Code | `claude mcp add indie-alternatives -- node /absolute/path/indie-alternatives/dist/src/stdio.js` |
| Cursor | `.cursor/mcp.json` in the project or `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| VS Code (GitHub Copilot) | `.vscode/mcp.json`: rename `mcpServers` to `servers` and add `"type": "stdio"` |
| Cline / Roo Code | MCP Servers panel → Configure |
| Gemini CLI | `~/.gemini/settings.json` |
| Codex CLI | `~/.codex/config.toml`:<br>`[mcp_servers.indie-alternatives]`<br>`command = "node"`<br>`args = ["/absolute/path/indie-alternatives/dist/src/stdio.js"]` |
| Zed | `context_servers` in `settings.json` |
| LM Studio | Program → Install → Edit mcp.json |

Config locations change often; check each client's docs.

To collect needs from everyone's local installs in one place, add `"env": { "NEEDS_WEBHOOK_URL": "https://indiealternatives.dev/api/needs" }`.

## 2. Deploy the remote server

### Cloudflare Workers + D1 (what indiealternatives.dev runs on)

```bash
npx wrangler login
npx wrangler d1 create indie-alternatives          # copy the database_id into wrangler.jsonc
npm run db:migrate                                  # create the tables in D1
npx wrangler secret put ADMIN_TOKEN                 # a long random string, for the review API
npm run deploy
```

Workers Logs are disabled in `wrangler.jsonc` to keep the no-access-log promise. To serve on your own domain, add it to Cloudflare DNS and uncomment `routes` in `wrangler.jsonc`.

Local development, no Cloudflare account needed: `npm run db:migrate:local && npm run dev:worker` (put `ADMIN_TOKEN=…` in `.dev.vars`).

### Node / Docker (self-hosting)

```bash
PORT=8787 PUBLIC_URL=https://your-domain DATABASE_FILE=./data.db ADMIN_TOKEN=… npm run start:http
```

`DATABASE_FILE` (SQLite via `node:sqlite`, Node 22.5+) enables maker submissions, the review API and stats; without it, needs go to a JSONL file. Or with Docker:

```bash
docker build -t indie-alternatives .
docker run -d -p 8787:8787 -e PUBLIC_URL=https://your-domain -e ADMIN_TOKEN=… -v indie-alternatives-data:/data indie-alternatives
```

For local testing, `ngrok http 8787` or `cloudflared tunnel --url http://localhost:8787` gives you a temporary HTTPS URL.

`/healthz` should return `{"ok": true}`.

## Makers: submissions and review

Makers submit at `/submit` (HTML form) or `POST /api/submissions` (JSON: `name`, `url`, `tagline`, optional `description`, `categories`, `tags`, `pricing`, `platforms`, `maker`, `contact`). Submissions wait for review; duplicates and already-listed URLs are rejected. After approval the product is searchable immediately, and makers can show the badge at `/badge.svg`.

Review API (`Authorization: Bearer $ADMIN_TOKEN`):

```bash
curl -H "authorization: Bearer $ADMIN_TOKEN" https://indiealternatives.dev/api/admin/submissions            # ?status=pending|approved|rejected|all
curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
     -d '{"tags":["typeform alternative","online form"]}' https://indiealternatives.dev/api/admin/submissions/<id>/approve   # body: optional field fixes
curl -X POST -H "authorization: Bearer $ADMIN_TOKEN" -d '{"note":"not indie"}' https://indiealternatives.dev/api/admin/submissions/<id>/reject
curl -X DELETE -H "authorization: Bearer $ADMIN_TOKEN" https://indiealternatives.dev/api/admin/products/<id>
curl -H "authorization: Bearer $ADMIN_TOKEN" "https://indiealternatives.dev/api/admin/stats?days=30"       # anonymous daily counters
curl -H "authorization: Bearer $ADMIN_TOKEN" https://indiealternatives.dev/api/admin/needs                  # all unmet needs, grouped
```

The home page shows the most requested unmet needs publicly, but only needs asked at least 3 times.

## 3. Remote MCP clients

| Client | How |
| --- | --- |
| ChatGPT | Settings → Apps & Connectors → Advanced, enable developer mode → Create, URL `https://indiealternatives.dev/mcp`, auth "None" |
| Claude (web / desktop) | Settings → Connectors → Add custom connector, URL `https://indiealternatives.dev/mcp` |
| Cursor / VS Code / Windsurf / Gemini CLI | Use `"url": "https://indiealternatives.dev/mcp"` instead of `command` + `args` (VS Code also needs `"type": "http"`) |
| Le Chat, Copilot Studio, … | Add the same URL in their connector / MCP settings |

## 4. Platforms without MCP: import OpenAPI

**Custom GPT (GPT Actions)**: Create a GPT → Configure → Create new action → Import from URL: `https://indiealternatives.dev/openapi.json`. Auth "None" (or "API Key / Bearer" if you set `MCP_AUTH_TOKEN`). Add to the GPT instructions:

> When the user asks whether there is a tool for something, call search_tools first. If nothing fits, call log_unmet_need to record the need anonymously, after removing all personal information.

**Dify**: Tools → Custom → Create custom tool → import `https://indiealternatives.dev/openapi.json`.

**n8n / Zapier / others**: call the REST endpoints with an HTTP node, or import the OpenAPI spec.

**Gemini (Vertex AI Agent Builder)**: add an OpenAPI tool with the same URL.

## 5. Your own agent: function calling definitions

```bash
curl https://indiealternatives.dev/functions.json?format=openai            # OpenAI Chat Completions tools
curl https://indiealternatives.dev/functions.json?format=openai-responses  # OpenAI Responses API tools
curl https://indiealternatives.dev/functions.json?format=anthropic         # Claude Messages API tools
curl https://indiealternatives.dev/functions.json?format=gemini            # Gemini functionDeclarations
```

These also work with any OpenAI-compatible model API. When the model returns a tool call, `POST` the arguments to `https://indiealternatives.dev/api/call/{tool_name}` and hand the result back to the model.

Example (Python, OpenAI format):

```python
import json, requests
from openai import OpenAI

BASE = "https://indiealternatives.dev"
tools = requests.get(f"{BASE}/functions.json?format=openai").json()
client = OpenAI()
messages = [{"role": "user", "content": "Is there a tool that adds nice backgrounds to screenshots?"}]

while True:
    msg = client.chat.completions.create(model="gpt-5", messages=messages, tools=tools).choices[0].message
    messages.append(msg)
    if not msg.tool_calls:
        print(msg.content)
        break
    for call in msg.tool_calls:
        result = requests.post(f"{BASE}/api/call/{call.function.name}", json=json.loads(call.function.arguments)).json()
        messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
```

## 6. CLI

```bash
npm link    # optional: install indie-alternatives as a global command
indie-alternatives search "add a nice background to screenshots"
indie-alternatives details shottr
indie-alternatives log "turn meeting recordings into notes with action items"
indie-alternatives needs
```

Output is JSON, so any agent that runs shell commands can use it.

## Configuration (environment variables)

| Variable | Default | Description |
| --- | --- | --- |
| `CATALOG_FILE` | bundled `data/products.json` | Catalog JSON file path(s), comma-separated |
| `CATALOG_URL` | local installs: `https://indiealternatives.dev/catalog.json` | Remote catalog JSON URL(s), cached 10 minutes, comma-separated; can be combined with `CATALOG_FILE` |
| `NEEDS_FILE` | `~/.indie-alternatives/needs.jsonl` | Where anonymous needs are written (when no database is used) |
| `NEEDS_WEBHOOK_URL` | local installs: `https://indiealternatives.dev/api/needs` | Also POST every need here, to aggregate needs from many installs |
| `INDIE_ALT_OFFLINE` | — | `1` makes local installs use only the bundled catalog and never send needs anywhere |
| `DATABASE_FILE` | — | Node HTTP server: SQLite file for needs, stats, submissions and approved products |
| `ADMIN_TOKEN` | — | Enables the review / stats API at `/api/admin/*` |
| `HIDE_NEEDS_LIST` | — | `1` disables `list_unmet_needs` (recommended for public deployments) |
| `PORT` / `HOST` | `8787` / `0.0.0.0` | HTTP listen address |
| `PUBLIC_URL` | inferred from headers | Public base URL used in OpenAPI and llms.txt; set it behind a reverse proxy |
| `MCP_AUTH_TOKEN` | — | Require `Authorization: Bearer <token>` on `/mcp` and `/api/*`; docs (`/openapi.json`, `/functions.json`, `/llms.txt`) stay public. ChatGPT connectors can't send a fixed token, so leave it unset for ChatGPT |

## Bring your own catalog

`data/products.json` is the catalog served at indiealternatives.dev (1,500+ products). To run your own directory, replace it with an array (or `{ "products": [...] }`) of:

```json
{
  "id": "unique-id",
  "name": "Product name",
  "url": "https://...",
  "tagline": "One-line pitch",
  "description": "Longer description",
  "categories": ["Category"],
  "tags": ["keywords drive matching", "add synonyms", "in any language"],
  "pricing": "free | freemium | paid | commission",
  "platforms": ["web", "macos", "windows", "linux", "ios", "android", "self-hosted"],
  "maker": "optional: who made it"
}
```

To use a database or another API, implement `CatalogSource` in `src/types.ts` (a single `load()` method). Same for need storage: implement `NeedStore` (`append()` / `list()`), e.g. with Postgres or Supabase.

`NEEDS_WEBHOOK_URL` receives one record per request:

```json
{ "id": "…", "need": "auto-generate subtitles for videos", "category": "Video", "day": "2026-11-05", "fingerprint": "373ca764a387d209" }
```

## How matching works

No external services, everything runs locally: Latin-script text is split into words, CJK text into bigrams, filler words ("is there a tool", "recommend") are dropped, and products are scored with weights name > tags > tagline > categories > description. `matched` requires at least 60% of the meaningful part of the query to be covered. For a large catalog, swap `src/search.ts` for vector search; the interface stays the same.

## Layout

```
src/
  core.ts      tool definitions and implementation (shared by every integration)
  server.ts    MCP server
  stdio.ts     local MCP entry
  app.ts       HTTP app on web-standard Request/Response: /mcp, /api/*, docs, pages, submissions, admin
  http.ts      Node HTTP entry (adapts node:http to app.ts)
  worker.ts    Cloudflare Workers entry (D1 storage)
  pages.ts     home page, submission form, badge
  rest.ts      OpenAPI, function calling and llms.txt generation
  catalog.ts   runtime-neutral catalog helpers
  sql.ts       D1 / SQLite stores (needs, stats, submissions, products)
  sqlite-node.ts  node:sqlite adapter
  cli.ts       CLI entry
  search.ts    scoring
  text.ts      tokenizer (Latin + CJK)
  privacy.ts   redaction and need fingerprints
  sources.ts   catalog sources and need stores (file, URL, webhook)
migrations/          D1 schema
wrangler.jsonc       Cloudflare Workers config
data/products.json   sample catalog
test/                tests
Dockerfile           container build
```

## License

MIT

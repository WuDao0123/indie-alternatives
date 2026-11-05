/**
 * The HTTP app on web-standard Request/Response, shared by the Node server (http.ts) and Cloudflare Workers (worker.ts).
 *
 *   /mcp                 MCP (Streamable HTTP, stateless)
 *   /api/*               REST tools (see rest.ts)
 *   /openapi.json, /functions.json, /llms.txt
 *   /catalog.json        full catalog (local installs read this)
 *   /, /submit           human pages: home and the maker submission form
 *   /badge.svg           "Listed on Indie Alternatives" badge
 *   /api/submissions     maker submissions (JSON)
 *   /api/admin/*         review queue and stats (requires ADMIN_TOKEN)
 */
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { jsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";
import { createServer } from "./server.js";
import { NotFoundError, TOOLS, ValidationError, count, enabledTools, indexFor, invalidateIndex, runTool, type Deps } from "./core.js";
import { ROUTES, coerceArgs, functionDefs, llmsTxt, openApiSpec, type FunctionFormat } from "./rest.js";
import { cleanSubmittedProduct, slugify, urlKey } from "./catalog.js";
import { redact } from "./privacy.js";
import { badgeSvg, homePage, submitPage, thanksPage } from "./pages.js";
import type { Product, ProductStore, Submission, SubmissionStatus, SubmissionStore } from "./types.js";

export interface AppDeps extends Deps {
  submissions?: SubmissionStore;
  products?: ProductStore;
}

export interface AppConfig {
  /** public base URL, e.g. https://indiealternatives.dev (otherwise inferred from the request) */
  publicUrl?: string;
  /** when set, /mcp and /api/* (except submissions) require Authorization: Bearer <token> */
  authToken?: string;
  /** enables /api/admin/* with Authorization: Bearer <adminToken> */
  adminToken?: string;
  /** Workers can't run ajv; pass the cfworker validator there */
  jsonSchemaValidator?: jsonSchemaValidator;
  /** a need is shown publicly on the home page only after this many requests (k-anonymity) */
  publicNeedsMin?: number;
}

class ConflictError extends Error {}
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_BODY = 1_000_000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-session-id, mcp-protocol-version",
  "access-control-expose-headers": "mcp-session-id",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });
}
const text = (body: string, type: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": `${type}; charset=utf-8`, ...extra } });

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) h.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** constant-time string comparison */
function sameSecret(got: string, want: string): boolean {
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
const bearer = (req: Request, token?: string) => !token || sameSecret(req.headers.get("authorization") ?? "", `Bearer ${token}`);

async function readBody(req: Request): Promise<string> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw new HttpError(413, "Request body too large");
  const s = await req.text();
  if (s.length > MAX_BODY) throw new HttpError(413, "Request body too large");
  return s;
}
async function readJson(req: Request): Promise<unknown> {
  const s = await readBody(req);
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    throw new ValidationError("Request body is not valid JSON");
  }
}

const today = () => new Date().toISOString().slice(0, 10);
const sameUrl = (a: string, b: string) => urlKey(a) === urlKey(b);

/** client name from an MCP initialize request, as a coarse anonymous label */
function clientLabel(body: unknown): string | undefined {
  const msgs = Array.isArray(body) ? body : [body];
  const init = msgs.find((m: any) => m?.method === "initialize");
  if (!init) return undefined;
  const name = String((init as any).params?.clientInfo?.name ?? "unknown").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 40);
  return name || "unknown";
}

export function createApp(deps: AppDeps, config: AppConfig = {}): (req: Request) => Promise<Response> {
  const publicNeedsMin = config.publicNeedsMin ?? 3;
  const baseUrl = (req: Request) => {
    if (config.publicUrl) return config.publicUrl.replace(/\/+$/, "");
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0] ?? u.protocol.replace(":", "");
    return `${proto}://${req.headers.get("x-forwarded-host") ?? u.host}`;
  };

  async function publicNeeds() {
    const t = TOOLS.find((x) => x.name === "list_unmet_needs")!;
    const r = (await t.run(deps, { limit: 100 })) as { needs: { need: string; count: number }[] };
    return r.needs.filter((n) => n.count >= publicNeedsMin).slice(0, 10);
  }

  async function handleMcp(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, 405);
    const body = await readJson(req);
    const client = clientLabel(body);
    if (client) await count(deps, ["mcp:initialize", `client:${client}`]);
    // stateless: a fresh server + transport per request, so it scales horizontally and runs on serverless
    const server = createServer(deps, { jsonSchemaValidator: config.jsonSchemaValidator });
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      return await transport.handleRequest(req, { parsedBody: body });
    } finally {
      void server.close();
    }
  }

  function matchRoute(method: string, pathname: string) {
    for (const r of ROUTES) {
      if (r.method !== method) continue;
      const re = new RegExp("^" + r.path.replace(/\{(\w+)\}/g, "(?<$1>[^/]+)") + "$");
      const m = pathname.match(re);
      if (m) return { route: r, pathArgs: Object.fromEntries(Object.entries(m.groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)])) };
    }
    return undefined;
  }

  async function handleApi(req: Request, url: URL): Promise<Response> {
    const method = req.method.toLowerCase();
    const call = url.pathname.match(/^\/api\/call\/([\w-]+)$/);
    if (call && method === "post") return json(await runTool(deps, call[1], await readJson(req), "rest"));
    const hit = matchRoute(method, url.pathname);
    if (!hit) return json({ error: "No such endpoint, see /openapi.json" }, 404);
    const tool = enabledTools(deps).find((t) => t.name === hit.route.tool);
    if (!tool) return json({ error: "This endpoint is disabled" }, 404);
    const args = hit.route.params === "body" ? await readJson(req) : coerceArgs(tool, { ...Object.fromEntries(url.searchParams), ...hit.pathArgs });
    return json(await runTool(deps, tool.name, args, "rest"));
  }

  // ---------- maker submissions ----------

  async function submit(raw: any): Promise<Submission> {
    if (!deps.submissions) throw new HttpError(404, "Submissions are not enabled on this server");
    const product = cleanSubmittedProduct(raw);
    if (!product.name) throw new ValidationError("name is required");
    if (!product.tagline) throw new ValidationError("tagline is required");
    let parsed: URL;
    try {
      parsed = new URL(product.url);
    } catch {
      throw new ValidationError("url must be a valid http(s) URL");
    }
    if (!/^https?:$/.test(parsed.protocol)) throw new ValidationError("url must be a valid http(s) URL");
    product.url = parsed.href;
    const contact = typeof raw?.contact === "string" ? raw.contact.trim().slice(0, 120) : "";
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new ValidationError("contact must be an email address");
    // the description is published; don't let it carry contact details by accident
    product.description = redact(product.description);

    const listed = (await indexFor(deps.catalog)).all().some((p) => sameUrl(p.url, product.url));
    if (listed || (await deps.submissions.hasUrl(product.url))) throw new ConflictError("This product is already listed or waiting for review");

    const s: Submission = { id: randomUUID(), status: "pending", day: today(), product, contact: contact || undefined };
    await deps.submissions.add(s);
    await count(deps, ["submission"]);
    return s;
  }

  async function handleSubmitForm(req: Request, base: string): Promise<Response> {
    const form = new URLSearchParams(await readBody(req));
    const values: Record<string, string> = { ...Object.fromEntries(form), platforms: form.getAll("platforms").join(",") };
    // honeypot: humans never see this field
    if (values.website) return text(thanksPage(base), "text/html");
    try {
      await submit({ ...values, categories: values.categories, tags: values.tags, platforms: form.getAll("platforms") });
      return text(thanksPage(base), "text/html");
    } catch (e) {
      if (e instanceof ValidationError || e instanceof ConflictError) return text(submitPage(base, (e as Error).message, values), "text/html", 400);
      throw e;
    }
  }

  // ---------- admin ----------

  async function handleAdmin(req: Request, url: URL): Promise<Response> {
    if (!config.adminToken) return json({ error: "Not found" }, 404);
    if (!bearer(req, config.adminToken)) return json({ error: "unauthorized" }, 401);
    const m = req.method;
    const p = url.pathname.replace(/^\/api\/admin/, "");

    if (m === "GET" && p === "/stats") {
      if (!deps.stats) return json({ error: "Stats are not enabled" }, 404);
      const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30) || 30, 1), 365);
      const rows = await deps.stats.summary(days);
      const totals: Record<string, number> = {};
      const byDay: Record<string, Record<string, number>> = {};
      for (const r of rows) {
        totals[r.key] = (totals[r.key] ?? 0) + r.n;
        (byDay[r.day] ??= {})[r.key] = r.n;
      }
      return json({ days, totals, by_day: byDay });
    }
    if (m === "GET" && p === "/needs") {
      const limit = Number(url.searchParams.get("limit") ?? 100) || 100;
      return json(await TOOLS.find((t) => t.name === "list_unmet_needs")!.run(deps, { limit: Math.min(limit, 1000) }));
    }
    if (!deps.submissions || !deps.products) return json({ error: "Submissions are not enabled" }, 404);
    if (m === "GET" && p === "/submissions") {
      const status = (url.searchParams.get("status") ?? "pending") as SubmissionStatus | "all";
      return json({ submissions: await deps.submissions.list(status === "all" ? undefined : status) });
    }
    const action = p.match(/^\/submissions\/([\w-]+)\/(approve|reject)$/);
    if (m === "POST" && action) {
      const [, id, verb] = action;
      const s = await deps.submissions.get(id);
      if (!s) throw new NotFoundError(`No submission ${id}`);
      const body = ((await readJson(req)) ?? {}) as Record<string, any>;
      if (verb === "reject") {
        await deps.submissions.setStatus(id, "rejected", typeof body.note === "string" ? body.note.slice(0, 500) : undefined);
        return json({ ok: true, id, status: "rejected" });
      }
      // admin may correct fields (tags, categories, …) while approving
      const fixed = { ...s.product, ...cleanSubmittedProduct({ ...s.product, ...body }) };
      const index = await indexFor(deps.catalog);
      let pid = typeof body.id === "string" && body.id ? slugify(body.id) : slugify(fixed.name);
      for (let i = 2; index.get(pid) && !sameUrl(index.get(pid)!.url, fixed.url); i++) pid = `${slugify(fixed.name)}-${i}`;
      const product: Product = { ...fixed, id: pid };
      await deps.products.upsert(product);
      await deps.submissions.setStatus(id, "approved");
      invalidateIndex(deps.catalog);
      return json({ ok: true, id, status: "approved", product });
    }
    const del = p.match(/^\/products\/([\w-]+)$/);
    if (m === "DELETE" && del) {
      await deps.products.remove(del[1]);
      invalidateIndex(deps.catalog);
      return json({ ok: true, removed: del[1] });
    }
    return json({ error: "No such admin endpoint" }, 404);
  }

  // ---------- router ----------

  async function route(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const base = baseUrl(req);
    const path = url.pathname;
    const get = req.method === "GET" || req.method === "HEAD";

    if (get && path === "/healthz") return json({ ok: true });
    if (get && path === "/openapi.json") return json(openApiSpec(deps, base, Boolean(config.authToken)));
    if (get && path === "/functions.json") {
      const format = (url.searchParams.get("format") ?? "openai") as FunctionFormat;
      if (!["openai", "openai-responses", "anthropic", "gemini"].includes(format))
        return json({ error: "format must be one of openai / openai-responses / anthropic / gemini" }, 400);
      return json(functionDefs(deps, format));
    }
    if (get && path === "/llms.txt") return text(llmsTxt(deps, base), "text/plain");
    if (get && path === "/") {
      if (!(req.headers.get("accept") ?? "").includes("text/html")) return text(llmsTxt(deps, base), "text/plain");
      const index = await indexFor(deps.catalog);
      return text(homePage(base, { products: index.size, needs: await publicNeeds(), submissions: Boolean(deps.submissions) }), "text/html");
    }
    if (get && path === "/submit") return text(submitPage(base), "text/html");
    if (req.method === "POST" && path === "/submit") return handleSubmitForm(req, base);
    if (get && path === "/badge.svg") return text(badgeSvg(), "image/svg+xml", 200, { "cache-control": "public, max-age=86400" });
    if (get && path === "/catalog.json") {
      await count(deps, ["catalog:fetch"]);
      const index = await indexFor(deps.catalog);
      return json({ products: index.all() }, 200, { "cache-control": "public, max-age=300" });
    }
    if (path.startsWith("/api/admin/")) return handleAdmin(req, url);
    if (req.method === "POST" && path === "/api/submissions") {
      const s = await submit(await readJson(req));
      return json({ ok: true, id: s.id, status: s.status, message: "Thanks! We review submissions by hand, usually within a few days." }, 201);
    }
    // the docs above are public; real calls below require auth (if a token is set)
    if (path === "/mcp" || path.startsWith("/api/")) {
      if (!bearer(req, config.authToken)) return json({ error: "unauthorized" }, 401);
      return path === "/mcp" ? handleMcp(req) : handleApi(req, url);
    }
    return json({ error: "Not found, see /llms.txt" }, 404);
  }

  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      return withCors(await route(req));
    } catch (e) {
      const status =
        e instanceof HttpError ? e.status : e instanceof ValidationError ? 400 : e instanceof NotFoundError ? 404 : e instanceof ConflictError ? 409 : 500;
      if (status === 500) console.error("[indie-alternatives]", e);
      return withCors(json({ error: status === 500 ? "Internal error" : (e as Error).message }, status));
    }
  };
}

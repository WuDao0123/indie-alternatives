/**
 * The HTTP app on web-standard Request/Response, shared by the Node server (http.ts) and Cloudflare Workers (worker.ts).
 *
 *   /mcp                 MCP (Streamable HTTP, stateless)
 *   /api/*               REST tools (see rest.ts)
 *   /openapi.json, /functions.json, /llms.txt
 *   /catalog.json        full catalog (local installs read this)
 *   /, /submit           human pages: home and the maker submission form
 *   /alternatives[/{x}], /category/{c}, /product/{id}, /sitemap.xml, /robots.txt   SEO landing pages (seo.ts)
 *   /search, /search/none, /wanted, /api/wanted, /developers   people's searches as demand signals, and the public board (demand.ts)
 *   /badge.svg           "Listed on Indie Alternatives" badge
 *   /api/submissions     maker submissions (JSON)
 *   /api/admin/*         review queue and stats (requires ADMIN_TOKEN)
 */
import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { jsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/types.js";
import { createServer } from "./server.js";
import { NotFoundError, TOOLS, groupNeeds, groupNeedsAdmin, ValidationError, count, enabledTools, indexFor, invalidateIndex, runTool, type Deps } from "./core.js";
import { ROUTES, coerceArgs, functionDefs, llmsTxt, openApiSpec, type FunctionFormat } from "./rest.js";
import { cleanSubmittedProduct, slugify, urlKey } from "./catalog.js";
import { redact } from "./privacy.js";
import { developersPage, searchPage, wantedPage, type PublicNeed } from "./demand.js";
import { fingerprint } from "./privacy.js";
import { adminPage } from "./admin.js";
import { alternatesFor, isLang, localizedAlternative, localizedCategory, localizedHome, localizedIndex, localizedProduct, localizedWanted } from "./localized.js";
import { badgeSvg, homePage, submitPage, thanksPage } from "./pages.js";
import { botName } from "./bots.js";
import { INDEXNOW_KEY, isIndexable, similarTo, alternativePage, alternativesIndexPage, categoryPage, productPage, robotsTxt, seoData, sitemapXml } from "./seo.js";
import type { Product, ProductStore, Submission, SubmissionStatus, SubmissionStore } from "./types.js";

export interface AppDeps extends Deps {
  submissions?: SubmissionStore;
  products?: ProductStore;
  /** today's random salt for reporter codes (deleted after the day) */
  salts?: { today(): Promise<string> };
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
  /** edge rate limit for logging needs, keyed by client address; true = allowed (Workers rate-limit binding) */
  needLimiter?: (key: string) => Promise<boolean>;
}

class ConflictError extends Error {}
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const MAX_BODY = 1_000_000;
/** landing pages change only when the catalog does */
const PAGE_CACHE = { "cache-control": "public, max-age=3600" };
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

  /** needs asked at least publicNeedsMin times: safe to show publicly */
  async function publicNeeds(limit = 10, category?: string) {
    const all = await deps.needs.list();
    const hidden = (await deps.needs.hidden?.()) ?? new Set<string>();
    const groups = groupNeeds(all, { hidden }).filter((n) => n.count >= publicNeedsMin);
    // categories offered as filters: only those of needs that are public anyway
    const categories = [...new Set(groups.flatMap((g) => g.categories))].sort();
    const shown = category ? groups.filter((g) => g.categories.some((c) => c.toLowerCase() === category.toLowerCase())) : groups;
    return { needs: shown.slice(0, limit) as PublicNeed[], categories, records: all.length, distinct: groupNeeds(all).length };
  }

  // ---------- people searching on the site ----------

  /** a search worth logging: has letters, not a URL, sane length */
  const loggable = (q: string) => q.length >= 3 && q.length <= 200 && /\p{L}{2}/u.test(q) && !/https?:\/\/|www\./i.test(q);
  const LOGGED = "ia_logged";
  /** don't count a reload of the same search twice: the cookie holds only short hashes of what this browser already logged */
  const loggedBefore = (req: Request) => new Set((req.headers.get("cookie") ?? "").match(new RegExp(`${LOGGED}=([\\w.]*)`))?.[1].split(".").filter(Boolean) ?? []);
  function rememberLogged(seen: Set<string>, fp: string) {
    const list = [...seen, fp].slice(-20).join(".");
    return { "set-cookie": `${LOGGED}=${list}; Path=/search; Max-Age=86400; SameSite=Lax; Secure; HttpOnly` };
  }

  /** rough domain of a search: the most common catalog category among the 5 closest results (needs 2+) */
  function categoryOf(hits: Product[]): string | undefined {
    const n = new Map<string, number>();
    for (const p of hits.slice(0, 5)) for (const c of p.categories) n.set(c, (n.get(c) ?? 0) + 1);
    const [best] = [...n].sort((a, b) => b[1] - a[1]);
    return best && best[1] >= 2 ? best[0] : undefined;
  }

  async function searchHits(q: string) {
    const r = (await runTool(deps, "search_tools", { query: q, limit: 8 }, "web")) as { matched: boolean; results: { id: string }[] };
    const index = await indexFor(deps.catalog);
    return { matched: r.matched, hits: r.results.map((x) => index.get(x.id)).filter((p): p is Product => Boolean(p)) };
  }

  async function logWebNeed(
    req: Request,
    q: string,
    key: string,
    extra: { category?: string; kind?: "partial" } = {},
  ): Promise<{ logged: boolean; headers: Record<string, string> }> {
    if (!loggable(q)) return { logged: false, headers: {} };
    const fp = fingerprint(q).slice(0, 8);
    const seen = loggedBefore(req);
    if (seen.has(fp)) return { logged: true, headers: {} };
    const r = (await runTool(forRequest(req), "log_unmet_need", { need: q, ...extra }, "web")) as { logged: boolean };
    if (!r.logged) return { logged: false, headers: {} };
    await count(deps, [key]);
    return { logged: true, headers: rememberLogged(seen, fp) };
  }

  async function handleSearch(req: Request, url: URL, base: string): Promise<Response> {
    const html = (body: string, status = 200, h: Record<string, string> = {}) => text(body, "text/html", status, { "cache-control": "no-store", ...h });
    if (req.method === "POST") {
      const q = (new URLSearchParams(await readBody(req)).get("q") ?? "").trim().slice(0, 200);
      const { hits } = loggable(q) ? await searchHits(q) : { hits: [] };
      const r = await logWebNeed(req, q, "web:none-fit", { kind: "partial", category: categoryOf(hits) });
      return html(searchPage(base, q, { matched: false, hits: [], logged: r.logged, reported: true }), 200, r.headers);
    }
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (!q) return html(searchPage(base, "", { matched: false, hits: [], logged: false }));
    const r = await searchHits(q);
    const hits = r.hits;
    const shown = r.matched ? hits : hits.slice(0, 3); // weak matches: a few, but still offer "none fit"
    // re-running a need from the board is a developer checking, not a new person asking
    const fromBoard = url.searchParams.get("from") === "wanted";
    const logged = r.matched || fromBoard ? { logged: false, headers: {} } : await logWebNeed(req, q, "web:unmatched", { category: categoryOf(hits) });
    return html(searchPage(base, q, { matched: r.matched, hits: shown, logged: logged.logged }), 200, logged.headers);
  }

  /** POST /need: the "not quite what you need?" box on landing pages; logged as "exists but doesn't fit" */
  async function handleNeed(req: Request, base: string): Promise<Response> {
    const form = new URLSearchParams(await readBody(req));
    const need = (form.get("need") ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const about = (form.get("about") ?? "").slice(0, 120);
    const data = seoData(await indexFor(deps.catalog));
    const [kind, id] = about.split(":", 2);
    let name: string | undefined;
    let category: string | undefined;
    if (kind === "alt") {
      const t = data.targetBySlug.get(id);
      name = t?.name;
      category = t?.categories[0];
    } else if (kind === "product") {
      const p = data.index.get(id);
      name = p?.name;
      category = p?.categories[0];
    } else if (kind === "cat") category = data.categoryBySlug.get(id)?.name;
    // "Notion alternative: works offline" reads like a search and groups with them on the board
    const q = name && !need.toLowerCase().includes(name.toLowerCase()) ? `${name} alternative: ${need}` : need;
    const r = loggable(need) ? await logWebNeed(req, q, "web:page-need", { kind: "partial", category }) : { logged: false, headers: {} };
    if ((req.headers.get("accept") ?? "").includes("application/json")) return json({ logged: r.logged }, 200, r.headers);
    return text(searchPage(base, need, { matched: false, hits: [], logged: r.logged, reported: true }), "text/html", 200, { "cache-control": "no-store", ...r.headers });
  }

  /** the client address, only ever used transiently: hashed with today's salt, and as the rate-limit key */
  const clientIp = (req: Request) => req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";

  async function reporterCode(ip: string): Promise<string | undefined> {
    if (!ip || !deps.salts) return undefined;
    const salt = await deps.salts.today();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${ip}`));
    return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /** deps for one request: who (as a daily code) and whether they may log more needs right now */
  function forRequest(req: Request): AppDeps {
    const ip = clientIp(req);
    return {
      ...deps,
      ctx: {
        reporter: () => reporterCode(ip),
        allowNeed: config.needLimiter && ip ? () => config.needLimiter!(ip) : undefined,
      },
    };
  }

  async function handleMcp(req: Request): Promise<Response> {
    if (req.method !== "POST") return json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null }, 405);
    const body = await readJson(req);
    const client = clientLabel(body);
    if (client) await count(deps, ["mcp:initialize", `client:${client}`]);
    // stateless: a fresh server + transport per request, so it scales horizontally and runs on serverless
    const server = createServer(forRequest(req), { jsonSchemaValidator: config.jsonSchemaValidator });
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
    if (call && method === "post") return json(await runTool(forRequest(req), call[1], await readJson(req), "rest"));
    const hit = matchRoute(method, url.pathname);
    if (!hit) return json({ error: "No such endpoint, see /openapi.json" }, 404);
    const tool = enabledTools(deps).find((t) => t.name === hit.route.tool);
    if (!tool) return json({ error: "This endpoint is disabled" }, 404);
    const args = hit.route.params === "body" ? await readJson(req) : coerceArgs(tool, { ...Object.fromEntries(url.searchParams), ...hit.pathArgs });
    const result = (await runTool(forRequest(req), tool.name, args, "rest")) as { rate_limited?: boolean };
    return json(result, result?.rate_limited ? 429 : 200);
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
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 1000);
      const all = await deps.needs.list();
      const groups = groupNeedsAdmin(all, { hidden: (await deps.needs.hidden?.()) ?? new Set() });
      return json({ total_records: all.length, distinct_needs: groups.length, needs: groups.slice(0, limit) });
    }
    const hideAction = p.match(/^\/needs\/(hide|unhide)$/);
    if (m === "POST" && hideAction) {
      if (!deps.needs.hide || !deps.needs.unhide) return json({ error: "Hiding is not supported by this need store" }, 404);
      const body = ((await readJson(req)) ?? {}) as { fingerprints?: unknown; note?: unknown };
      const fps = Array.isArray(body.fingerprints) ? body.fingerprints.filter((f): f is string => typeof f === "string" && /^[0-9a-f]{16}$/.test(f)) : [];
      if (!fps.length) throw new ValidationError("fingerprints: a list of need fingerprints is required");
      if (hideAction[1] === "hide") await deps.needs.hide(fps, typeof body.note === "string" ? body.note.slice(0, 200) : undefined);
      else await deps.needs.unhide(fps);
      return json({ ok: true, [hideAction[1] === "hide" ? "hidden" : "unhidden"]: fps.length });
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

  // ---------- SEO landing pages ----------

  /** /{lang}/…: the localized home, index, alternatives and category pages */
  /** landing page views: people under page:*, crawlers and scripts under bot:* */
  const pageCount = (req: Request, keys: string[]) => {
    const bot = botName(req.headers.get("user-agent"));
    return count(deps, bot ? ["bot:page", `bot:${bot}`] : keys);
  };

  async function handleLocalized(req: Request, path: string, base: string, url: URL): Promise<Response | undefined> {
    const m = path.match(/^\/([a-z]{2})(\/.*)?$/);
    if (!m || !isLang(m[1])) return undefined;
    const l = m[1];
    const rest = m[2] ?? "/";
    if (rest === "/" && !path.endsWith("/")) return new Response(null, { status: 301, headers: { location: `/${l}/` } });
    const index = await indexFor(deps.catalog);
    const data = seoData(index);
    const html = (s: string) => text(s, "text/html", 200, PAGE_CACHE);
    if (rest === "/") return html(localizedHome(base, l, data, index.size));
    if (/^\/alternatives\/?$/.test(rest)) return html(localizedIndex(base, l, data));
    const alt = rest.match(/^\/alternatives\/([a-z0-9-]+)\/?$/);
    const t = alt && data.targetBySlug.get(alt[1]);
    if (t) {
      await pageCount(req, ["page:alternatives", `lang:${l}`]);
      return html(localizedAlternative(base, l, data, t));
    }
    const prod = rest.match(/^\/product\/([\w-]+)\/?$/);
    const p = prod && data.index.get(prod[1]);
    if (p) {
      await pageCount(req, ["page:product", `lang:${l}`]);
      return html(localizedProduct(base, l, data, p, similarTo(data, p), !isIndexable(p)));
    }
    if (/^\/wanted\/?$/.test(rest)) {
      const category = url.searchParams.get("category")?.slice(0, 60) || undefined;
      const pn = await publicNeeds(500, category);
      await pageCount(req, ["page:wanted", `lang:${l}`]);
      return text(localizedWanted(base, l, pn.needs, publicNeedsMin, { records: pn.records, distinct: pn.distinct }, pn.categories, category), "text/html", 200, { "cache-control": "public, max-age=600" });
    }
    const cat = rest.match(/^\/category\/([a-z0-9-]+)\/?$/);
    const c = cat && data.categoryBySlug.get(cat[1]);
    if (c) {
      await pageCount(req, ["page:category", `lang:${l}`]);
      return html(localizedCategory(base, l, data, c));
    }
    return undefined;
  }

  async function handleSeo(req: Request, path: string, base: string, url: URL): Promise<Response | undefined> {
    const loc = await handleLocalized(req, path, base, url);
    if (loc) return loc;
    if (path === "/robots.txt") return text(robotsTxt(base), "text/plain", 200, PAGE_CACHE);
    // share images are static assets on Workers; one not rendered yet (e.g. a page from a newly approved product) gets the default
    if (/^\/og\/(alt|cat)\/[a-z0-9-]+\.png$/.test(path)) return new Response(null, { status: 302, headers: { location: "/og/default.png" } });
    if (path === `/${INDEXNOW_KEY}.txt`) return text(INDEXNOW_KEY, "text/plain");
    const alt = path.match(/^\/alternatives(?:\/([a-z0-9-]+))?\/?$/);
    const cat = path.match(/^\/category\/([a-z0-9-]+)\/?$/);
    const prod = path.match(/^\/product\/([\w-]+)\/?$/);
    if (!alt && !cat && !prod && path !== "/sitemap.xml") return undefined;
    const data = seoData(await indexFor(deps.catalog));
    if (prod) {
      const p = data.index.get(prod[1]);
      if (!p) return undefined;
      await pageCount(req, ["page:product"]);
      return text(productPage(base, data, p), "text/html", 200, PAGE_CACHE);
    }
    if (path === "/sitemap.xml") return text(sitemapXml(base, data), "application/xml", 200, PAGE_CACHE);
    if (alt && !alt[1]) return text(alternativesIndexPage(base, data), "text/html", 200, PAGE_CACHE);
    const t = alt ? data.targetBySlug.get(alt[1]) : undefined;
    const c = cat ? data.categoryBySlug.get(cat[1]) : undefined;
    if (!t && !c) return undefined; // falls through to the normal 404
    await pageCount(req, [t ? "page:alternatives" : "page:category"]);
    return text(t ? alternativePage(base, data, t) : categoryPage(base, data, c!), "text/html", 200, PAGE_CACHE);
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
      const seo = seoData(index);
      const popular = seo.targets.slice(0, 10);
      return text(
        homePage(base, { products: index.size, needs: (await publicNeeds()).needs, submissions: Boolean(deps.submissions), popular, pages: seo.targets.length, alternates: alternatesFor(base, "/") }),
        "text/html",
      );
    }
    if (get) {
      const seo = await handleSeo(req, path, base, url);
      if (seo) return seo;
    }
    if (path === "/search" || (req.method === "POST" && path === "/search/none")) return handleSearch(req, url, base);
    if (req.method === "POST" && path === "/need") return handleNeed(req, base);
    if (get && (path === "/wanted" || path === "/api/wanted")) {
      const category = url.searchParams.get("category")?.slice(0, 60) || undefined;
      const p = await publicNeeds(500, category);
      if (path === "/wanted") await pageCount(req, ["page:wanted"]);
      if (path === "/api/wanted")
        return json({ min_count: publicNeedsMin, total_records: p.records, distinct_needs: p.distinct, categories: p.categories, needs: p.needs }, 200, { "cache-control": "public, max-age=600" });
      return text(wantedPage(base, p.needs, publicNeedsMin, { records: p.records, distinct: p.distinct }, p.categories, category), "text/html", 200, { "cache-control": "public, max-age=600" });
    }
    if (get && path === "/admin") return text(adminPage(base), "text/html", 200, { "cache-control": "no-store" });
    if (get && path === "/developers") return text(developersPage(base), "text/html", 200, { "cache-control": "public, max-age=3600" });
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

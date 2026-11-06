/**
 * Core logic and tool definitions, shared by MCP, REST/OpenAPI and function calling.
 */
import { z } from "zod";
import type { CatalogSource, NeedKind, NeedRecord, NeedStore, Product, StatsStore } from "./types.js";
import { tokenize } from "./text.js";
import { ProductIndex } from "./search.js";
import { makeNeedRecord } from "./privacy.js";

export const VERSION = "0.2.0";

export const INSTRUCTIONS = `Indie Alternatives: a catalog of products made by independent developers (indie makers).
- When the user asks "is there a tool / app / service that does X", "what's an alternative to <product>", "recommend software for X", or describes a task they want a tool for, call search_tools first.
- Also call search_tools when helping pick a hosted service or app for a project (auth, transactional email, analytics, error or uptime monitoring, forms, payments, feature flags, status pages…), to offer indie options next to the big names.
- For "alternative to <product>", search with what that product does (e.g. "online forms and surveys" for Typeform) plus "<product> alternative".
- Condense the request into a few keywords (any language works). If results are weak, retry once or twice with synonyms.
- If search_tools returns matched=false, or the results clearly don't fit, call log_unmet_need to record the need anonymously, and tell the user it was logged anonymously so indie makers might build it.
- Before logging, rewrite the need as a generic description: remove names, company names, contact details, links and any other personal information. If the user declines, do not log.
- Reply to the user in their own language.`;

export interface Deps {
  catalog: CatalogSource;
  needs: NeedStore;
  exposeNeedsList?: boolean;
  /** optional anonymous daily counters (hosted service) */
  stats?: StatsStore;
}

/** How a tool call arrived; only used for anonymous counters */
export type Channel = "mcp" | "rest" | "cli" | "web";

/** Record counters without ever failing the request */
export async function count(deps: Deps, keys: string[]): Promise<void> {
  if (!deps.stats) return;
  try {
    await deps.stats.record(keys);
  } catch (e) {
    console.error("[indie-alternatives] stats failed:", (e as Error).message);
  }
}

// ---------- Parameters (single source of truth) ----------

export const searchInput = {
  query: z.string().min(1).max(300).describe("What the user wants to do, e.g. \"add a nice background to screenshots\" or \"self-hosted uptime monitoring\""),
  category: z.string().optional().describe("Optional: only search within this category"),
  pricing: z.enum(["free", "freemium", "paid", "commission"]).optional().describe("Optional: pricing model"),
  platform: z.string().optional().describe("Optional: platform, e.g. web, macos, windows, linux, ios, android, self-hosted"),
  limit: z.number().int().min(1).max(20).optional().describe("Number of results, default 5"),
};
export const detailsInput = { id: z.string().min(1).describe("Product id returned by search_tools") };
export const logNeedInput = {
  need: z.string().min(4).max(500).describe("Generic description of the need, e.g. \"turn meeting recordings into notes with action items\""),
  category: z.string().max(50).optional().describe("Optional: rough domain of the need"),
  platform: z.string().max(50).optional().describe("Optional: preferred platform"),
  budget: z.string().max(50).optional().describe("Optional: rough budget, e.g. \"free\" or \"under $10/month\""),
  kind: z
    .enum(["missing", "partial"])
    .optional()
    .describe("Optional: \"partial\" when search_tools returned tools but none fit the need; default \"missing\" (nothing like it exists)"),
  source: z
    .string()
    .max(40)
    .regex(/^[a-z0-9][a-z0-9._-]*$/i)
    .optional()
    .describe("Optional, for apps that forward their users' needs: a short name of your app, e.g. \"my-notes-app\". Only counted, never shown with the need."),
};
export const listNeedsInput = {
  limit: z.number().int().min(1).max(1000).optional().describe("Number of results, default 20"),
  keyword: z.string().optional().describe("Optional: only needs containing this keyword"),
  category: z.string().optional().describe("Optional: only needs in this category"),
};

export interface ToolDef {
  name: string;
  title: string;
  description: string;
  input: z.ZodRawShape;
  readOnly: boolean;
  run: (deps: Deps, args: any) => Promise<Record<string, unknown>>;
}

// ---------- Implementation ----------

const indexCache = new WeakMap<CatalogSource, { at: number; index: Promise<ProductIndex> }>();
const INDEX_TTL_MS = 5 * 60 * 1000;
export function invalidateIndex(catalog: CatalogSource): void {
  indexCache.delete(catalog);
}
export function indexFor(catalog: CatalogSource): Promise<ProductIndex> {
  const hit = indexCache.get(catalog);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.index;
  const index = catalog.load().then((ps) => new ProductIndex(ps));
  index.catch(() => indexCache.delete(catalog)); // retry next time on failure
  indexCache.set(catalog, { at: Date.now(), index });
  return index;
}

function brief(p: Product) {
  return { id: p.id, name: p.name, url: p.url, tagline: p.tagline, pricing: p.pricing, platforms: p.platforms, categories: p.categories };
}

export class NotFoundError extends Error {}

export const TOOLS: ToolDef[] = [
  {
    name: "search_tools",
    title: "Find indie-made tools and alternatives",
    description:
      "Call when the user asks whether there is a tool for X, or for an alternative to a product. Matches the need against a catalog of indie-made products and returns the most relevant ones. " +
      "matched=false means nothing suitable was found; then call log_unmet_need to record the need anonymously.",
    input: searchInput,
    readOnly: true,
    async run(deps, { query, category, pricing, platform, limit }) {
      const r = (await indexFor(deps.catalog)).search(query, { category, pricing, platform, limit });
      return {
        query,
        matched: r.matched,
        results: r.hits.map((h) => ({ ...brief(h.product), relevance: h.score, coverage: Math.round(h.coverage * 100) / 100 })),
        hint: r.matched
          ? "Present the most relevant products to the user with their links. If none fit, call log_unmet_need."
          : "No suitable tool in the catalog. Rewrite the need as a generic description without personal info, call log_unmet_need, and tell the user it was logged anonymously.",
      };
    },
  },
  {
    name: "get_tool_details",
    title: "Get tool details",
    description: "Get the full description of a product by the id returned from search_tools.",
    input: detailsInput,
    readOnly: true,
    async run(deps, { id }) {
      const p = (await indexFor(deps.catalog)).get(id);
      if (!p) throw new NotFoundError(`No product with id ${id}`);
      return { ...p };
    },
  },
  {
    name: "log_unmet_need",
    title: "Log an unmet need anonymously",
    description:
      "Call when no tool in the catalog meets the user's need. Records the need anonymously so indie makers can discover what to build. " +
      "Send only the need itself: no names, company names, contact details, links or account handles. The server redacts again and never stores identity, IP or exact time.",
    input: logNeedInput,
    readOnly: false,
    async run(deps, input) {
      const record = makeNeedRecord(input);
      await deps.needs.append(record);
      if (input.source) await count(deps, [`source:${String(input.source).toLowerCase()}`]);
      const similar = (await deps.needs.list()).filter((r) => r.fingerprint === record.fingerprint).length;
      return { logged: true, stored_text: record.need, similar_requests: Math.max(similar, 1), message: "Need logged anonymously (no personal information stored)." };
    },
  },
  {
    name: "list_unmet_needs",
    title: "List tools people want that don't exist yet",
    description: "Aggregated anonymous unmet needs, sorted by how often they were requested. Useful for indie makers looking for product ideas.",
    input: listNeedsInput,
    readOnly: true,
    async run(deps, { limit = 20, keyword, category }) {
      const all = await deps.needs.list();
      const groups = groupNeeds(all, { keyword, category });
      return { total_records: all.length, distinct_needs: groups.length, needs: groups.slice(0, limit) };
    },
  },
];

export interface NeedGroup {
  need: string;
  count: number;
  first_seen: string;
  last_seen: string;
  categories: string[];
  kind: NeedKind;
}

/** words that carry the need, for comparing phrasings */
const needTokens = (s: string) => new Set<string>(tokenize(s, { stripFillers: true }));
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n / (a.size + b.size - n);
}

/**
 * Group needs that say the same thing in different words: same fingerprint, or ≥ 60% shared words.
 * "missing" and "partial" needs are kept apart. Sorted by count, then most recent.
 */
export function groupNeeds(records: NeedRecord[], opts: { keyword?: string; category?: string } = {}): NeedGroup[] {
  const kw = opts.keyword?.toLowerCase();
  const cat = opts.category?.toLowerCase();
  type G = NeedGroup & { tokens: Set<string>; fps: Set<string>; texts: Map<string, number>; cats: Map<string, number> };
  const groups: G[] = [];
  for (const r of [...records].sort((a, b) => a.day.localeCompare(b.day))) {
    if (kw && !r.need.toLowerCase().includes(kw)) continue;
    if (cat && (r.category ?? "").toLowerCase() !== cat) continue;
    const kind: NeedKind = r.kind === "partial" ? "partial" : "missing";
    const toks = needTokens(r.need);
    const g = groups.find((x) => x.kind === kind && (x.fps.has(r.fingerprint) || jaccard(x.tokens, toks) >= 0.6));
    if (g) {
      g.count++;
      g.last_seen = r.day > g.last_seen ? r.day : g.last_seen;
      g.fps.add(r.fingerprint);
      g.texts.set(r.need, (g.texts.get(r.need) ?? 0) + 1);
      if (r.category) g.cats.set(r.category, (g.cats.get(r.category) ?? 0) + 1);
    } else {
      groups.push({
        need: r.need, count: 1, first_seen: r.day, last_seen: r.day, categories: [], kind,
        tokens: toks, fps: new Set([r.fingerprint]), texts: new Map([[r.need, 1]]), cats: new Map(r.category ? [[r.category, 1]] : []),
      });
    }
  }
  const top = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return groups
    .map(({ tokens, fps, texts, cats, ...g }) => ({ ...g, need: top(texts)[0], categories: top(cats).slice(0, 3) }))
    .sort((a, b) => b.count - a.count || b.last_seen.localeCompare(a.last_seen));
}

export function enabledTools(deps: Deps): ToolDef[] {
  return TOOLS.filter((t) => t.name !== "list_unmet_needs" || deps.exposeNeedsList !== false);
}

/** Validate args and run; throws ValidationError on bad input */
export class ValidationError extends Error {}
export async function runTool(deps: Deps, name: string, args: unknown, channel: Channel = "rest") {
  const tool = enabledTools(deps).find((t) => t.name === name);
  if (!tool) throw new NotFoundError(`No tool named ${name}`);
  const parsed = z.object(tool.input).safeParse(args ?? {});
  if (!parsed.success) throw new ValidationError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const result = await tool.run(deps, parsed.data);
  const keys = [`tool:${name}`, `channel:${channel}`];
  if (name === "search_tools") keys.push(result.matched ? "search:matched" : "search:unmatched");
  await count(deps, keys);
  return result;
}

/** JSON Schema of the params (without $schema, for function-calling defs) */
export function jsonSchema(tool: ToolDef): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(z.object(tool.input)) as Record<string, unknown>;
  return rest;
}

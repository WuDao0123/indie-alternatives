import { readFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { CatalogSource, NeedRecord, NeedStore, Product, ProductStore, StatsStore, SubmissionStore } from "./types.js";
import { FallbackSource, MergedSource, validateProducts } from "./catalog.js";

export { MergedSource, StaticSource, FallbackSource } from "./catalog.js";

/** The hosted service; local installs use it for the latest catalog and to pool unmet needs */
export const HOSTED_URL = "https://indiealternatives.dev";

/** Local JSON file catalog */
export class JsonFileSource implements CatalogSource {
  readonly name: string;
  constructor(private path: string) {
    this.name = `file:${path}`;
  }
  async load(): Promise<Product[]> {
    return validateProducts(JSON.parse(await readFile(this.path, "utf8")), this.path);
  }
}

/** Remote JSON catalog (e.g. your own catalog API), with a simple cache */
export class HttpJsonSource implements CatalogSource {
  readonly name: string;
  private cache?: { at: number; data: Product[] };
  constructor(private url: string, private ttlMs = 10 * 60 * 1000) {
    this.name = `url:${url}`;
  }
  async load(): Promise<Product[]> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.data;
    try {
      const res = await fetch(this.url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`${this.url}: HTTP ${res.status}`);
      const data = validateProducts(await res.json(), this.url);
      this.cache = { at: Date.now(), data };
      return data;
    } catch (e) {
      if (this.cache) {
        this.cache.at = Date.now(); // keep serving the stale copy, retry after the TTL
        return this.cache.data;
      }
      throw e;
    }
  }
}

/** Need store that appends to a JSONL file */
export class JsonlNeedStore implements NeedStore {
  readonly name: string;
  constructor(private path: string) {
    this.name = `file:${path}`;
  }
  async append(r: NeedRecord): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(r) + "\n", "utf8");
  }
  async list(): Promise<NeedRecord[]> {
    try {
      const text = await readFile(this.path, "utf8");
      return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
}

/** Forwards needs to your collector endpoint (aggregates needs from many local installs) */
export class WebhookNeedStore implements NeedStore {
  readonly name: string;
  constructor(private url: string, private local?: NeedStore) {
    this.name = `webhook:${new URL(url).host}`;
  }
  async append(r: NeedRecord): Promise<void> {
    await this.local?.append(r);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ need: r.need, category: r.category, platform: r.platform, budget: r.budget, kind: r.kind }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      // the local copy is kept; a network problem must not break the user's conversation
      if (!this.local) throw e;
      console.error(`[indie-alternatives] forwarding need failed: ${(e as Error).message}`);
    }
  }
  async list(): Promise<NeedRecord[]> {
    return this.local ? this.local.list() : [];
  }
}

export const BUNDLED_CATALOG = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/products.json");

export interface EnvDeps {
  catalog: CatalogSource;
  needs: NeedStore;
  exposeNeedsList: boolean;
  stats?: StatsStore;
  submissions?: SubmissionStore;
  products?: ProductStore;
}

const list = (v?: string) => v?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];

/**
 * Build stores from environment variables.
 * - "local" (stdio MCP, CLI): by default reads the latest catalog from the hosted service (bundled copy as fallback)
 *   and forwards unmet needs there, so needs from every install are pooled. INDIE_ALT_OFFLINE=1 turns this off.
 * - "server" (self-hosted HTTP): bundled catalog unless configured; DATABASE_FILE enables SQLite storage,
 *   usage stats and maker submissions.
 */
export async function fromEnv(env: Record<string, string | undefined> = process.env, mode: "local" | "server" = "local"): Promise<EnvDeps> {
  const offline = env.INDIE_ALT_OFFLINE === "1";
  const files = list(env.CATALOG_FILE);
  let urls = list(env.CATALOG_URL);
  const bundled = new JsonFileSource(BUNDLED_CATALOG);
  const sources: CatalogSource[] = files.map((f) => new JsonFileSource(resolve(f)));
  for (const u of urls) sources.push(new HttpJsonSource(u));

  let catalog: CatalogSource;
  if (!sources.length && mode === "local" && !offline) catalog = new FallbackSource(new HttpJsonSource(`${HOSTED_URL}/catalog.json`), bundled);
  else if (!sources.length) catalog = bundled;
  else catalog = sources.length === 1 ? sources[0] : new MergedSource(sources);

  const out: EnvDeps = { catalog, needs: undefined as unknown as NeedStore, exposeNeedsList: env.HIDE_NEEDS_LIST !== "1" };

  if (mode === "server" && env.DATABASE_FILE) {
    const { openSqlite } = await import("./sqlite-node.js");
    const { SqlNeedStore, SqlStatsStore, SqlSubmissionStore, SqlProductStore } = await import("./sql.js");
    const db = await openSqlite(resolve(env.DATABASE_FILE));
    out.needs = new SqlNeedStore(db);
    out.stats = new SqlStatsStore(db);
    out.submissions = new SqlSubmissionStore(db);
    out.products = new SqlProductStore(db);
    out.catalog = new MergedSource([catalog, out.products]);
  } else {
    out.needs = new JsonlNeedStore(resolve(env.NEEDS_FILE ?? `${homedir()}/.indie-alternatives/needs.jsonl`));
  }

  const webhook = env.NEEDS_WEBHOOK_URL ?? (mode === "local" && !offline ? `${HOSTED_URL}/api/needs` : undefined);
  if (webhook) out.needs = new WebhookNeedStore(webhook, out.needs);
  return out;
}

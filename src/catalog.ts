/** Catalog helpers with no Node-only imports, so they also run on Cloudflare Workers */
import type { CatalogSource, Product } from "./types.js";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const strs = (v: unknown, max: number, n: number) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [])
    .map((x) => str(x, max))
    .filter(Boolean)
    .slice(0, n);

/** Normalize one product-like object; returns undefined if it lacks id or name */
export function toProduct(p: any): Product | undefined {
  if (!p || typeof p.id !== "string" || typeof p.name !== "string") return undefined;
  return {
    id: p.id,
    name: p.name,
    url: p.url ?? "",
    tagline: p.tagline ?? "",
    description: p.description ?? "",
    categories: Array.isArray(p.categories) ? p.categories : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
    pricing: p.pricing,
    platforms: p.platforms,
    maker: p.maker,
  };
}

export function validateProducts(raw: unknown, origin: string): Product[] {
  const list = Array.isArray(raw) ? raw : (raw as { products?: unknown })?.products;
  if (!Array.isArray(list)) throw new Error(`${origin}: catalog must be an array or { products: [...] }`);
  return list.map(toProduct).filter((p): p is Product => Boolean(p));
}

/** Clean up untrusted product fields from a maker submission */
export function cleanSubmittedProduct(raw: any): Omit<Product, "id"> {
  return {
    name: str(raw?.name, 80),
    url: str(raw?.url, 300),
    tagline: str(raw?.tagline, 140),
    description: str(raw?.description, 1000),
    categories: strs(raw?.categories, 40, 3),
    tags: strs(raw?.tags, 40, 20),
    pricing: ["free", "freemium", "paid", "commission"].includes(raw?.pricing) ? raw.pricing : undefined,
    platforms: strs(raw?.platforms, 20, 8).map((s) => s.toLowerCase()),
    maker: str(raw?.maker, 80) || undefined,
  };
}

/** Canonical form of a product URL for duplicate checks: no scheme, no www, no trailing slash, lowercase */
export function urlKey(u: string): string {
  return u.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#]+$/, "");
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "product"
  );
}

/** Products held in memory (e.g. the bundled catalog imported as JSON) */
export class StaticSource implements CatalogSource {
  readonly name: string;
  private products: Product[];
  constructor(products: unknown, name = "static") {
    this.products = validateProducts(products, name);
    this.name = name;
  }
  async load(): Promise<Product[]> {
    return this.products;
  }
}

/** Merge several catalogs; later sources win on duplicate ids. Failing sources are skipped if `tolerant`. */
export class MergedSource implements CatalogSource {
  readonly name: string;
  constructor(private sources: CatalogSource[], private tolerant = false) {
    this.name = sources.map((s) => s.name).join(" + ");
  }
  async load(): Promise<Product[]> {
    const map = new Map<string, Product>();
    for (const s of this.sources) {
      let list: Product[];
      try {
        list = await s.load();
      } catch (e) {
        if (!this.tolerant) throw e;
        continue;
      }
      for (const p of list) map.set(p.id, p);
    }
    return [...map.values()];
  }
}

/** Use `primary`, fall back to `fallback` when it fails (e.g. remote catalog with bundled copy) */
export class FallbackSource implements CatalogSource {
  readonly name: string;
  constructor(private primary: CatalogSource, private fallback: CatalogSource) {
    this.name = `${primary.name} (fallback ${fallback.name})`;
  }
  async load(): Promise<Product[]> {
    try {
      return await this.primary.load();
    } catch {
      return this.fallback.load();
    }
  }
}

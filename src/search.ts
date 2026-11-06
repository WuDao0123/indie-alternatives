import type { Product } from "./types.js";
import { analyze, normalize, tokenize } from "./text.js";

export interface SearchOptions {
  limit?: number;
  category?: string;
  pricing?: string;
  platform?: string;
}

export interface SearchHit {
  product: Product;
  score: number;
  /** Share of the query that was matched, 0..1 */
  coverage: number;
  matchedTerms: string[];
}

export interface SearchResult {
  query: string;
  hits: SearchHit[];
  /** Whether there is a good enough match; if false, log an unmet need */
  matched: boolean;
}

const WEIGHTS = { name: 5, tags: 4, tagline: 3, categories: 2, description: 1 } as const;
type Field = keyof typeof WEIGHTS;

/** Coverage needed to count as "found" */
export const MATCH_THRESHOLD = 0.6;

interface Indexed {
  product: Product;
  fields: Record<Field, Set<string>>;
  phrases: string[];
}

export class ProductIndex {
  private items: Indexed[];

  constructor(products: Product[]) {
    this.items = products.map((p) => ({
      product: p,
      fields: {
        name: new Set(tokenize(p.name)),
        tags: new Set(p.tags.flatMap((t) => tokenize(t))),
        tagline: new Set(tokenize(p.tagline)),
        categories: new Set(p.categories.flatMap((c) => tokenize(c))),
        description: new Set(tokenize(p.description)),
      },
      phrases: [p.name, ...p.tags].map(normalize).filter((s) => s.length >= 2),
    }));
  }

  get size(): number {
    return this.items.length;
  }

  all(): Product[] {
    return this.items.map((i) => i.product);
  }

  get(id: string): Product | undefined {
    return this.items.find((i) => i.product.id === id)?.product;
  }

  categories(): string[] {
    return [...new Set(this.items.flatMap((i) => i.product.categories))].sort();
  }

  search(query: string, opts: SearchOptions = {}): SearchResult {
    // "alternative to X" where X is in the catalog: search for what X does, minus X itself
    const target = alternativeTarget(normalize(query));
    const known = target.length ? this.items.find((i) => namesProduct(target, i.product.name)) : undefined;
    if (known) {
      const p = known.product;
      const what = [p.tagline, ...p.categories, ...p.tags.filter((t) => !/alternative/.test(t)).slice(0, 8)].join(" ");
      const r = this.searchRaw(what, opts, p.id);
      // only count it as found when an alternative is like X: same category, or at least 2 shared tags
      const xTags = new Set(p.tags.filter((t) => !/alternative/.test(t)));
      const matched = r.hits.some(
        (h) => h.product.categories.some((c) => p.categories.includes(c)) || h.product.tags.filter((t) => xTags.has(t)).length >= 2,
      );
      return { query, hits: r.hits, matched };
    }
    const r = this.searchRaw(query, opts);
    // "X alternative" for an X that isn't in the catalog but that products name as what they replace:
    // only those products, and ones in their categories, can make it a match ("typeform alternative that works offline"
    // must not count as found because a password manager works offline)
    if (target.length && r.matched) {
      const tagged = this.items.filter((i) => i.product.tags.some((t) => namesTarget(target, t)));
      if (tagged.length) {
        const cats = new Set(tagged.flatMap((i) => i.product.categories));
        const ids = new Set(tagged.map((i) => i.product.id));
        const related = (p: Product) => ids.has(p.id) || p.categories.some((c) => cats.has(c));
        r.matched = r.hits.some((h) => related(h.product) && h.coverage >= MATCH_THRESHOLD);
      }
    }
    return r;
  }

  private searchRaw(query: string, opts: SearchOptions, excludeId?: string): SearchResult {
    const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);
    const { tokens: qSpans, content } = analyze(query, { stripFillers: true });
    const qTokens = [...new Set(qSpans.map((t) => t.text))];
    const qNorm = normalize(query);
    const hits: SearchHit[] = [];

    for (const item of this.items) {
      const p = item.product;
      if (p.id === excludeId) continue;
      if (opts.category && !p.categories.some((c) => normalize(c).includes(normalize(opts.category!)))) continue;
      if (opts.pricing && p.pricing !== opts.pricing) continue;
      if (opts.platform && !(p.platforms ?? []).some((x) => normalize(x) === normalize(opts.platform!))) continue;

      let score = 0;
      const matched: string[] = [];
      for (const tok of qTokens) {
        let best = 0;
        for (const f of Object.keys(WEIGHTS) as Field[]) {
          if (item.fields[f].has(tok)) best = Math.max(best, WEIGHTS[f]);
        }
        if (best > 0) {
          score += best;
          matched.push(tok);
        }
      }
      // bonus when a whole tag / product name appears in the query
      for (const ph of item.phrases) if (qNorm.includes(ph)) score += 3;

      if (score === 0) continue;
      // coverage = share of meaningful query characters covered by matched terms
      const hitSet = new Set(matched);
      const covered = new Set<number>();
      for (const sp of qSpans) if (hitSet.has(sp.text)) for (let i = sp.start; i < sp.end; i++) if (content.has(i)) covered.add(i);
      const coverage = content.size ? covered.size / content.size : 0;
      hits.push({ product: p, score: Math.round(score * (0.5 + coverage) * 100) / 100, coverage, matchedTerms: matched });
    }

    // "X alternative" for an X that is not in the catalog: still never return something named X
    const target = alternativeTarget(qNorm);
    if (target.length) for (let i = hits.length - 1; i >= 0; i--) if (namesProduct(target, hits[i].product.name)) hits.splice(i, 1);

    hits.sort((a, b) => b.score - a.score || b.coverage - a.coverage);
    const top = hits.slice(0, limit);
    return { query, hits: top, matched: top.some((h) => h.coverage >= MATCH_THRESHOLD) };
  }
}

/** Tokens of the product named in "X alternative(s)" / "alternative(s) to|for X", if any */
export function alternativeTarget(q: string): string[] {
  // a dot ends a sentence only when followed by a space, so "cal.com alternative" keeps "cal.com"
  const m = q.match(/alternatives?\s+(?:to|for)\s+((?:[^,?!.]|\.(?!\s|$))+)/) ?? q.match(/(?:^|[,?!]\s*|\.\s+)((?:[^,?!.]|\.(?!\s|$))+?)\s+alternatives?\b/);
  if (!m) return [];
  return tokenize(m[1], { stripFillers: true }).slice(0, 4);
}

/** Is this tag "X alternative(s)" / "alternative(s) to X" for the X of the query? */
function namesTarget(target: string[], tag: string): boolean {
  const t = normalize(tag);
  const m = t.match(/^(.+?)\s+alternatives?$/) ?? t.match(/^alternatives?\s+(?:to|for)\s+(.+)$/);
  if (!m) return false;
  const toks = tokenize(m[1]);
  return toks.length > 0 && toks.length === target.length && toks.every((x, i) => x === target[i]);
}

/** Does the "X" of an "X alternative" query name this product? ("plausible" ↔ "Plausible Analytics", "cheaper gumroad" ↔ "Gumroad") */
function namesProduct(target: string[], name: string): boolean {
  const toks = tokenize(name);
  if (!toks.length) return false;
  const set = new Set(toks);
  return target.every((t) => set.has(t)) || toks.every((t) => target.includes(t));
}

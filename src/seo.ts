/**
 * Search-engine landing pages, built from the catalog:
 *
 *   /alternatives                index of every "alternatives to X" page and every category
 *   /alternatives/{slug}         "Indie alternatives to X", for each X named by ≥ MIN_ALTERNATIVES products' tags ("x alternative")
 *   /category/{slug}             every product in a category
 *   /sitemap.xml, /robots.txt
 *
 * Pages are derived from the live index (bundled catalog + approved submissions), memoized per index object.
 */
import { slugify } from "./catalog.js";
import { esc, layout, type PageMeta } from "./pages.js";
import type { ProductIndex } from "./search.js";
import type { Product } from "./types.js";

/** IndexNow key (public by design: search engines fetch /{key}.txt to confirm we own the site) */
export const INDEXNOW_KEY = "db4f06c6a7cea6e7090ee71c3419f713";

/** fewer listed alternatives than this and the page would be thin, so it isn't published */
export const MIN_ALTERNATIVES = 3;

export interface Target {
  slug: string;
  /** display name, e.g. "Google Analytics" */
  name: string;
  products: Product[];
  categories: string[];
}
export interface Category {
  slug: string;
  name: string;
  products: Product[];
}
export interface SeoData {
  targets: Target[];
  targetBySlug: Map<string, Target>;
  categories: Category[];
  categoryBySlug: Map<string, Category>;
}

/** brand spellings that plain title case gets wrong; also disambiguates generic words */
const BRANDS: Record<string, string> = {
  chatgpt: "ChatGPT", github: "GitHub", "github actions": "GitHub Actions", "github desktop": "GitHub Desktop", "github copilot": "GitHub Copilot",
  gitlab: "GitLab", gitkraken: "GitKraken", gitbook: "GitBook", sourcetree: "Sourcetree", iterm2: "iTerm2", "vs code": "VS Code",
  sendgrid: "SendGrid", "hubspot crm": "HubSpot CRM", hubspot: "HubSpot", "1password": "1Password", lastpass: "LastPass",
  textexpander: "TextExpander", cleanshot: "CleanShot X", tinypng: "TinyPNG", "remove.bg": "remove.bg", ynab: "YNAB", quickbooks: "QuickBooks",
  freshbooks: "FreshBooks", honeybook: "HoneyBook", bamboohr: "BambooHR", docusign: "DocuSign", livechat: "LiveChat", "zendesk guide": "Zendesk Guide",
  convertkit: "ConvertKit", activecampaign: "ActiveCampaign", zoominfo: "ZoomInfo", optinmonster: "OptinMonster", "testimonial.to": "Testimonial.to",
  "copy.ai": "Copy.ai", capcut: "CapCut", "fl studio": "FL Studio", obs: "OBS Studio", elevenlabs: "ElevenLabs", myfitnesspal: "MyFitnessPal",
  nordvpn: "NordVPN", expressvpn: "ExpressVPN", langsmith: "LangSmith", launchdarkly: "LaunchDarkly", "hashicorp vault": "HashiCorp Vault",
  uservoice: "UserVoice", wordpress: "WordPress", youtube: "YouTube", linkedin: "LinkedIn", tiktok: "TikTok", garageband: "GarageBand", powerpoint: "PowerPoint",
  "fusion 360": "Fusion 360", autocad: "AutoCAD", solidworks: "SolidWorks", xmind: "XMind", fullstory: "FullStory", "font awesome": "Font Awesome",
  word: "Microsoft Word", excel: "Microsoft Excel", teams: "Microsoft Teams", outlook: "Microsoft Outlook", visio: "Microsoft Visio",
  "microsoft to do": "Microsoft To Do", make: "Make.com", monday: "monday.com", impact: "impact.com", things: "Things 3", premiere: "Premiere Pro",
  audition: "Adobe Audition", animate: "Adobe Animate", illustrator: "Adobe Illustrator", photoshop: "Photoshop", lightroom: "Lightroom",
  "after effects": "After Effects", "adobe reader": "Adobe Reader", otter: "Otter.ai", rev: "Rev", "toon boom": "Toon Boom", "docker desktop": "Docker Desktop",
  motion: "Motion", runway: "Runway", "time machine": "Time Machine", "apple mail": "Apple Mail", "apple notes": "Apple Notes", senja: "Senja",
  "viral loops": "Viral Loops", "facebook groups": "Facebook Groups", "epidemic sound": "Epidemic Sound", gmail: "Gmail",
};

const titleCase = (s: string) => s.replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** "x alternative(s)" / "alternative(s) to|for x" → "x" */
function targetOf(tag: string): string | undefined {
  const t = tag.trim().toLowerCase();
  const m = t.match(/^(.+?)\s+alternatives?$/) ?? t.match(/^alternatives?\s+(?:to|for)\s+(.+)$/);
  return m?.[1].trim() || undefined;
}

const cache = new WeakMap<ProductIndex, SeoData>();

export function seoData(index: ProductIndex): SeoData {
  const hit = cache.get(index);
  if (hit) return hit;
  const all = index.all();
  const byName = new Map(all.map((p) => [p.name.toLowerCase(), p.name]));

  const groups = new Map<string, Product[]>();
  for (const p of all) {
    for (const key of new Set(p.tags.map(targetOf).filter((k): k is string => Boolean(k)))) {
      if (p.name.toLowerCase() === key) continue; // never list X as an alternative to itself
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
    }
  }
  const targets: Target[] = [];
  const seen = new Set<string>();
  for (const [key, products] of groups) {
    const slug = slugify(key);
    if (products.length < MIN_ALTERNATIVES || seen.has(slug)) continue;
    seen.add(slug);
    targets.push({ slug, name: BRANDS[key] ?? byName.get(key) ?? titleCase(key), products: rank(products), categories: topCategories(products) });
  }
  targets.sort((a, b) => b.products.length - a.products.length || a.name.localeCompare(b.name));

  const cats = new Map<string, Product[]>();
  for (const p of all) for (const c of p.categories) (cats.get(c) ?? cats.set(c, []).get(c)!).push(p);
  const categories = [...cats]
    .map(([name, products]) => ({ slug: slugify(name), name, products: [...products].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const data: SeoData = {
    targets,
    targetBySlug: new Map(targets.map((t) => [t.slug, t])),
    categories,
    categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
  };
  cache.set(index, data);
  return data;
}

/** free / open-source first (what people searching "alternative" usually want), then by name */
function rank(ps: Product[]): Product[] {
  const w = (p: Product) => ({ "open-source": 0, free: 0, freemium: 1, commission: 2, paid: 3 })[p.pricing ?? ""] ?? 2;
  return [...ps].sort((a, b) => w(a) - w(b) || a.name.localeCompare(b.name));
}

function topCategories(ps: Product[]): string[] {
  const n = new Map<string, number>();
  for (const p of ps) for (const c of p.categories) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 3);
}

/** other targets sharing a top category, most similar first */
function related(data: SeoData, t: Target, max = 8): Target[] {
  const mine = new Set(t.categories);
  return data.targets
    .filter((o) => o !== t)
    .map((o) => ({ o, s: o.categories.filter((c) => mine.has(c)).length }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.o.products.length - a.o.products.length)
    .slice(0, max)
    .map((x) => x.o);
}

// ---------- rendering ----------

const year = () => new Date().getUTCFullYear();
const PRICING: Record<string, string> = { free: "Free", freemium: "Free plan", paid: "Paid", commission: "Commission", "open-source": "Open source" };

function productCard(p: Product, n?: number): string {
  const meta = [p.pricing && (PRICING[p.pricing] ?? p.pricing), (p.platforms ?? []).join(", ")].filter(Boolean).map(esc).join(" · ");
  return `<div class="card" id="${esc(p.id)}"><h3>${n ? `${n}. ` : ""}<a href="${esc(p.url)}" rel="noopener">${esc(p.name)}</a></h3>
<p><strong>${esc(p.tagline)}</strong></p>${p.description && p.description !== p.tagline ? `<p>${esc(p.description)}</p>` : ""}
${meta ? `<p class="count">${meta}</p>` : ""}</div>`;
}

function itemListLd(base: string, path: string, name: string, ps: Product[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        name,
        url: base + path,
        numberOfItems: ps.length,
        itemListElement: ps.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "SoftwareApplication", name: p.name, url: p.url, description: p.tagline, applicationCategory: p.categories[0] } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Indie Alternatives", item: base + "/" },
          { "@type": "ListItem", position: 2, name: "Alternatives", item: base + "/alternatives" },
          { "@type": "ListItem", position: 3, name, item: base + path },
        ],
      },
    ],
  };
}

const askYourAi = (q: string) => `<div class="card"><h3>Ask your AI instead</h3>
<p>Add Indie Alternatives to ChatGPT, Claude or Cursor and ask <em>“${esc(q)}”</em> in your own words, with your budget and platform. <a href="/#add">Set it up</a></p></div>`;

export function alternativePage(base: string, data: SeoData, t: Target): string {
  const path = `/alternatives/${t.slug}`;
  const n = t.products.length;
  const free = t.products.filter((p) => ["free", "freemium", "open-source"].includes(p.pricing ?? "")).length;
  const title = `${n} Indie Alternatives to ${t.name} (${year()})`;
  const names = t.products.slice(0, 3).map((p) => p.name).join(", ");
  const desc = `${n} independent alternatives to ${t.name}, including ${names}.${free ? ` ${free} with a free plan.` : ""} Built by indie makers, not big companies.`;
  const rel = related(data, t);
  const meta: PageMeta = { canonical: base + path, jsonLd: itemListLd(base, path, `Alternatives to ${t.name}`, t.products) };
  return layout(
    title,
    desc,
    `<p class="count"><a href="/alternatives">All alternatives</a> › ${esc(t.name)}</p>
<h1>Indie alternatives to ${esc(t.name)}</h1>
<p class="lead">${n} products made by independent developers and small teams that do what ${esc(t.name)} does${free ? `, ${free} of them with a free plan` : ""}. Free and open-source options come first.</p>
${t.products.map((p, i) => productCard(p, i + 1)).join("\n")}
${askYourAi(`a cheaper ${t.name} alternative that works on my Mac`)}
${rel.length ? `<h2>Related</h2><ul class="needs">${rel.map((o) => `<li><a href="/alternatives/${o.slug}">Alternatives to ${esc(o.name)}</a> <span class="count">· ${o.products.length}</span></li>`).join("")}</ul>` : ""}
${t.categories.length ? `<p class="muted">Browse: ${t.categories.map((c) => `<a href="/category/${slugify(c)}">${esc(c)}</a>`).join(" · ")}</p>` : ""}
<p class="muted">Made one? <a href="/submit">List your product</a>, it's free.</p>`,
    meta,
  );
}

export function categoryPage(base: string, data: SeoData, c: Category): string {
  const path = `/category/${c.slug}`;
  const n = c.products.length;
  const alts = data.targets.filter((t) => t.categories[0] === c.name).slice(0, 12);
  const desc = `${n} indie ${c.name.toLowerCase()} tools made by independent makers, including ${c.products.slice(0, 3).map((p) => p.name).join(", ")}.`;
  return layout(
    `${n} Indie ${c.name} Tools (${year()}) · Indie Alternatives`,
    desc,
    `<p class="count"><a href="/alternatives">All categories</a> › ${esc(c.name)}</p>
<h1>Indie ${esc(c.name)} tools</h1>
<p class="lead">${n} ${esc(c.name.toLowerCase())} products built by independent developers and small teams.</p>
${alts.length ? `<p>Looking to replace something? ${alts.map((t) => `<a href="/alternatives/${t.slug}">${esc(t.name)}</a>`).join(" · ")}</p>` : ""}
${c.products.map((p) => productCard(p)).join("\n")}
${askYourAi(`an indie ${c.name.toLowerCase()} tool that's free for small teams`)}`,
    { canonical: base + path, jsonLd: itemListLd(base, path, `Indie ${c.name} tools`, c.products) },
  );
}

export function alternativesIndexPage(base: string, data: SeoData): string {
  return layout(
    `Indie Alternatives to ${data.targets.length} Popular Apps · Indie Alternatives`,
    `Find indie-made alternatives to ${data.targets.slice(0, 5).map((t) => t.name).join(", ")} and ${data.targets.length - 5} more popular apps.`,
    `<h1>Alternatives to popular apps</h1>
<p class="lead">Indie-made replacements for ${data.targets.length} well-known products, plus every category in the catalog.</p>
<h2>By app</h2>
<p>${data.targets.map((t) => `<a href="/alternatives/${t.slug}">${esc(t.name)}</a>&nbsp;<span class="count">${t.products.length}</span>`).join(" · ")}</p>
<h2>By category</h2>
<p>${data.categories.map((c) => `<a href="/category/${c.slug}">${esc(c.name)}</a>&nbsp;<span class="count">${c.products.length}</span>`).join(" · ")}</p>`,
    { canonical: base + "/alternatives" },
  );
}

export function siteUrls(data: SeoData): string[] {
  return ["/", "/alternatives", "/submit", ...data.targets.map((t) => `/alternatives/${t.slug}`), ...data.categories.map((c) => `/category/${c.slug}`)];
}

export function sitemapXml(base: string, data: SeoData): string {
  const urls = siteUrls(data);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join("\n")}
</urlset>
`;
}

export function robotsTxt(base: string): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /mcp

Sitemap: ${base}/sitemap.xml
`;
}

// Downloads each product's icon once and stores it as public/logo/{id}.png (80×80), plus data/logos.json
// (ids that have one, bundled into the Worker). Visitors never hit third-party servers: icons are our static assets.
// Run when the catalog changes: npm run logos   (only fetches missing ones; --force refetches all)
import { mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import sharp from "sharp";

const root = new URL("../", import.meta.url);
const outDir = new URL("public/logo/", root);
const products = JSON.parse(await readFile(new URL("data/products.json", root), "utf8"));
const force = process.argv.includes("--force");
const UA = "Mozilla/5.0 (compatible; IndieAlternativesBot/1.0; +https://indiealternatives.dev)";
await mkdir(outDir, { recursive: true });

const get = (url, ms = 8000) => fetch(url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(ms) });

/** icon candidates from the homepage <head>, best first: apple-touch-icon, then the largest declared icon */
async function fromHtml(site) {
  const res = await get(site);
  if (!res.ok) return [];
  const html = (await res.text()).slice(0, 200_000);
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = tag.match(/\brel=["']?([^"'>]+)/i)?.[1].toLowerCase() ?? "";
    const href = tag.match(/\bhref=["']?([^"' >]+)/i)?.[1];
    if (!href || !/icon/.test(rel) || /mask-icon/.test(rel)) continue;
    const size = Number(tag.match(/\bsizes=["']?(\d+)/i)?.[1] ?? (/apple/.test(rel) ? 180 : 32));
    out.push({ url: new URL(href.replace(/&amp;/g, "&"), res.url).href, score: (/apple/.test(rel) ? 1000 : 0) + size });
  }
  return out.sort((a, b) => b.score - a.score).map((c) => c.url);
}

async function toPng(url) {
  const res = await get(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) return null;
  try {
    const img = sharp(buf, { density: 300 });
    const meta = await img.metadata();
    if (!meta.width || meta.width < 32) return null; // a 16px favicon looks blurry scaled up
    return await img.resize(80, 80, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
  } catch {
    return null; // .ico and other formats sharp can't read: try the next candidate
  }
}

// code hosts and stores: their icon is the platform's, not the product's
const PLATFORM = /(^|\.)(github\.com|gitlab\.com|codeberg\.org|sourceforge\.net|bitbucket\.org|apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com|addons\.mozilla\.org|marketplace\.visualstudio\.com|npmjs\.com|pypi\.org|notion\.site|framer\.website|carrd\.co|gumroad\.com|itch\.io)$/;

async function logoFor(p) {
  if (PLATFORM.test(new URL(p.url).hostname)) return null;
  const candidates = [];
  try {
    candidates.push(...(await fromHtml(p.url)));
  } catch {}
  const host = new URL(p.url).hostname;
  // Google's favicon service returns 404 when it has nothing, so a hit is a real icon
  candidates.push(`https://www.google.com/s2/favicons?domain=${host}&sz=128`);
  for (const c of candidates) {
    try {
      const png = await toPng(c);
      if (png) return png;
    } catch {}
  }
  return null;
}

const exists = (f) => access(f).then(() => true, () => false);
const have = [];
let fetched = 0, failed = 0, i = 0;
async function worker() {
  while (i < products.length) {
    const p = products[i++];
    const file = new URL(`${p.id}.png`, outDir);
    if (PLATFORM.test(new URL(p.url).hostname)) {
      await rm(file, { force: true });
      failed++;
      continue;
    }
    if (!force && (await exists(file))) {
      have.push(p.id);
      continue;
    }
    const png = await logoFor(p);
    if (png) {
      await writeFile(file, png);
      have.push(p.id);
      fetched++;
    } else failed++;
    if ((fetched + failed) % 100 === 0) console.log(`… ${fetched} fetched, ${failed} without icon`);
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
await writeFile(new URL("data/logos.json", root), JSON.stringify(have.sort()) + "\n");
console.log(`logos: ${have.length}/${products.length} (${fetched} new, ${failed} without icon) → public/logo/, data/logos.json`);

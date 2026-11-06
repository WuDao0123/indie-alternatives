// Renders Open Graph share images (1200×630 PNG) into public/og/, served as Workers static assets.
//   public/og/default.png, public/og/alt/{slug}.png, public/og/cat/{slug}.png
// Runs before every deploy (npm run deploy). Needs a build first (npm run build).
import { mkdir, readFile, rm } from "node:fs/promises";
import sharp from "sharp";
import { ProductIndex } from "../dist/src/search.js";
import { seoData } from "../dist/src/seo.js";

const root = new URL("../", import.meta.url);
const out = new URL("public/og/", root);
const raw = JSON.parse(await readFile(new URL("data/products.json", root), "utf8"));
const data = seoData(new ProductIndex(Array.isArray(raw) ? raw : raw.products));

const x = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

/** greedy word wrap by an approximate character budget */
function wrap(text, max) {
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if (cur && (cur + " " + w).length > max) (lines.push(cur), (cur = w));
    else cur = cur ? cur + " " + w : w;
  }
  return cur ? [...lines, cur] : lines;
}

function card({ kicker, title, sub }) {
  // fixed rows: brand 100, kicker 200, title from 290, subtitle below, footer 570
  let size = 76;
  let lines = wrap(title, 25);
  if (lines.length > 1) (size = 64), (lines = wrap(title, 30).slice(0, 3));
  const top = 290;
  const subTop = top + (lines.length - 1) * size * 1.1 + 70;
  const subLines = sub ? wrap(sub, 58).slice(0, lines.length > 2 ? 1 : 2) : [];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#14130f"/>
<rect x="0" y="0" width="12" height="630" fill="#fb923c"/>
<text x="80" y="100" ${FONT} font-size="34" font-weight="700" fill="#ece8df">Indie <tspan fill="#fb923c">Alternatives</tspan></text>
${kicker ? `<text x="80" y="200" ${FONT} font-size="26" fill="#a39d90" letter-spacing="2">${x(kicker.toUpperCase())}</text>` : ""}
${lines.map((l, i) => `<text x="80" y="${top + i * size * 1.1}" ${FONT} font-size="${size}" font-weight="700" fill="#ffffff">${x(l)}</text>`).join("\n")}
${subLines.map((l, i) => `<text x="80" y="${subTop + i * 42}" ${FONT} font-size="32" fill="#a39d90">${x(l)}</text>`).join("\n")}
<text x="80" y="570" ${FONT} font-size="26" fill="#a39d90">indiealternatives.dev · built by independent makers</text>
</svg>`;
}

const more = (ps, n = 3) => ps.slice(0, n).map((p) => p.name).join(", ") + (ps.length > n ? ` and ${ps.length - n} more` : "");
const jobs = [
  ["default.png", { title: "Indie alternatives to big-name software", sub: `${data.index.size} products made by independent makers, right inside your AI` }],
  ...data.targets.map((t) => [`alt/${t.slug}.png`, { kicker: `${t.products.length} indie alternatives`, title: `Alternatives to ${t.name}`, sub: more(t.products) }]),
  ...data.categories.map((c) => [`cat/${c.slug}.png`, { kicker: `${c.products.length} indie tools`, title: c.name, sub: more(c.products) }]),
];

await rm(out, { recursive: true, force: true });
await mkdir(new URL("alt/", out), { recursive: true });
await mkdir(new URL("cat/", out), { recursive: true });
for (let i = 0; i < jobs.length; i += 16)
  await Promise.all(jobs.slice(i, i + 16).map(([file, c]) => sharp(Buffer.from(card(c))).png({ compressionLevel: 9, palette: true }).toFile(new URL(file, out).pathname)));
console.log(`og: ${jobs.length} images → public/og/`);

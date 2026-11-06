import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { MergedSource } from "../src/catalog.js";
import { JsonFileSource, BUNDLED_CATALOG, fromEnv } from "../src/sources.js";
import { MIGRATIONS, SCHEMA, SqlNeedStore, SqlProductStore, SqlStatsStore, SqlSubmissionStore } from "../src/sql.js";
import { openSqlite } from "../src/sqlite-node.js";

const db = await openSqlite(":memory:");
const products = new SqlProductStore(db);
const deps = {
  catalog: new MergedSource([new JsonFileSource(BUNDLED_CATALOG), products]),
  needs: new SqlNeedStore(db),
  stats: new SqlStatsStore(db),
  submissions: new SqlSubmissionStore(db),
  products,
  exposeNeedsList: false,
};
const app = createApp(deps, { publicUrl: "https://example.test", adminToken: "secret", publicNeedsMin: 2 });
const B = "https://example.test";
const call = (path: string, init: RequestInit & { json?: unknown; admin?: boolean } = {}) => {
  const headers = new Headers(init.headers);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  if (init.admin) headers.set("authorization", "Bearer secret");
  return app(new Request(B + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body }));
};

test("migration file matches the schema used by Node", async () => {
  assert.equal(await readFile(new URL("../../migrations/0001_init.sql", import.meta.url), "utf8"), SCHEMA);
  for (const [file, sql] of Object.entries(MIGRATIONS)) assert.equal(await readFile(new URL(`../../migrations/${file}`, import.meta.url), "utf8"), sql);
});

test("submission → review → approve → searchable", async () => {
  const bad = await call("/api/submissions", { method: "POST", json: { name: "X", url: "javascript:alert(1)", tagline: "t" } });
  assert.equal(bad.status, 400);

  const ok = await call("/api/submissions", {
    method: "POST",
    json: { name: "Formly", url: "https://formly.test", tagline: "Forms for static sites", tags: "formbackend for jamstack, form backend", description: "Email me at a@b.com", contact: "me@formly.test" },
  });
  assert.equal(ok.status, 201);
  const { id } = await ok.json();

  assert.equal((await call("/api/submissions", { method: "POST", json: { name: "F", url: "https://www.formly.test/", tagline: "t" } })).status, 409);
  assert.equal((await call("/api/submissions", { method: "POST", json: { name: "Tally", url: "https://tally.so", tagline: "t" } })).status, 409);

  assert.equal((await call("/api/admin/submissions")).status, 401);
  const pending = (await (await call("/api/admin/submissions", { admin: true })).json()).submissions;
  assert.equal(pending.length, 1);
  assert.ok(!pending[0].product.description.includes("a@b.com"), "published description is redacted");

  const ap = await (await call(`/api/admin/submissions/${id}/approve`, { method: "POST", admin: true, json: { categories: ["Forms & Surveys"] } })).json();
  assert.equal(ap.product.id, "formly");
  assert.deepEqual(ap.product.categories, ["Forms & Surveys"]);
  assert.equal("contact" in ap.product, false, "contact is never published");

  const s = await (await call("/api/search?query=formbackend%20for%20jamstack")).json();
  assert.equal(s.results[0].id, "formly");
  const cat = await (await call("/catalog.json")).json();
  assert.ok(cat.products.some((p: any) => p.id === "formly"));

  await call("/api/admin/products/formly", { method: "DELETE", admin: true });
  const s2 = await (await call("/api/search?query=formbackend%20for%20jamstack")).json();
  assert.ok(!s2.results.some((r: any) => r.id === "formly"));
});

test("HTML form: validation errors, honeypot, escaping", async () => {
  const err = await call("/submit", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=%3Cscript%3E&url=nope&tagline=x" });
  assert.equal(err.status, 400);
  const html = await err.text();
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"));

  const before = (await deps.submissions.list()).length;
  const bot = await call("/submit", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "name=Bot&url=https://bot.test&tagline=x&website=spam" });
  assert.equal(bot.status, 200);
  assert.equal((await deps.submissions.list()).length, before, "honeypot submissions are dropped");
});

test("anonymous stats and public needs threshold", async () => {
  await call("/api/needs", { method: "POST", json: { need: "turn whiteboard photos into editable diagrams" } });
  const home1 = await (await call("/", { headers: { accept: "text/html" } })).text();
  assert.ok(!home1.includes("whiteboard photos"), "a need asked once is not shown publicly");
  await call("/api/needs", { method: "POST", json: { need: "turn whiteboard photos into editable diagrams" } });
  const home2 = await (await call("/", { headers: { accept: "text/html" } })).text();
  assert.ok(home2.includes("whiteboard photos"));

  assert.equal((await call("/api/needs")).status, 404, "needs list hidden publicly");
  await call("/mcp", {
    method: "POST",
    headers: { accept: "application/json, text/event-stream" },
    json: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "Claude AI", version: "1" } } },
  });
  const st = await (await call("/api/admin/stats?days=7", { admin: true })).json();
  assert.ok(st.totals["tool:search_tools"] >= 2);
  assert.ok(st.totals["submission"] >= 1);
  assert.equal(st.totals["client:claude-ai"], 1);
  assert.ok(Object.keys(st.totals).every((k) => /^[a-z:_.-]+$/.test(k)), "only coarse keys, nothing personal");
});

test("local installs default to the hosted service; INDIE_ALT_OFFLINE turns it off", async () => {
  const local = await fromEnv({}, "local");
  assert.match(local.catalog.name, /indiealternatives\.dev\/catalog\.json/);
  assert.match(local.needs.name, /indiealternatives\.dev/);
  const off = await fromEnv({ INDIE_ALT_OFFLINE: "1" }, "local");
  assert.ok(!off.catalog.name.includes("indiealternatives") && !off.needs.name.includes("indiealternatives"));
  const server = await fromEnv({}, "server");
  assert.ok(!server.needs.name.includes("indiealternatives"), "self-hosted servers never forward by default");
});

test("SEO landing pages, sitemap and robots", async () => {
  const idx = await call("/alternatives");
  assert.equal(idx.status, 200);
  const html = await idx.text();
  assert.match(html, /href="\/alternatives\/notion"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/alternatives">/);

  const notion = await call("/alternatives/notion");
  assert.equal(notion.status, 200);
  const page = await notion.text();
  assert.match(page, /<h1>Indie alternatives to Notion<\/h1>/);
  assert.match(page, /application\/ld\+json/);
  assert.doesNotMatch(page, /<h3>\d+\. <a [^>]*>Notion<\/a>/, "X is never listed as its own alternative");

  assert.equal((await call("/alternatives/no-such-app")).status, 404);
  assert.equal((await call("/category/developer-tools")).status, 200);

  const map = await (await call("/sitemap.xml")).text();
  assert.match(map, /<loc>https:\/\/example.test\/alternatives\/notion<\/loc>/);
  assert.match(map, /<loc>https:\/\/example.test\/category\/developer-tools<\/loc>/);
  assert.match(await (await call("/robots.txt")).text(), /Sitemap: https:\/\/example.test\/sitemap.xml/);

  const home = await (await call("/", { headers: { accept: "text/html" } })).text();
  assert.match(home, /alternatives<\/a>/);
});

test("product pages, share images", async () => {
  const res = await call("/product/docmost");
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /<h1>Docmost<\/h1>/);
  assert.match(html, /href="\/alternatives\/notion"/, "links the targets it replaces");
  assert.match(html, /Similar to Docmost/);
  assert.doesNotMatch(html, /noindex/);
  assert.match(html, /og:image" content="https:\/\/example.test\/og\/default.png"/);
  assert.equal((await call("/product/no-such-product")).status, 404);

  const alt = await (await call("/alternatives/notion")).text();
  assert.match(alt, /og:image" content="https:\/\/example.test\/og\/alt\/notion.png"/);
  assert.match(alt, /href="\/product\/docmost"/, "cards link to product pages");

  const missing = await call("/og/alt/brand-new.png");
  assert.equal(missing.status, 302);
  assert.equal(missing.headers.get("location"), "/og/default.png");

  const map = await (await call("/sitemap.xml")).text();
  assert.match(map, /\/product\/docmost<\/loc>/);
});

test("data/thin-products.json is current (npm run og regenerates it)", async () => {
  const { ProductIndex } = await import("../src/search.js");
  const { seoData, isThin } = await import("../src/seo.js");
  const raw = JSON.parse(await readFile(new URL("../../data/products.json", import.meta.url), "utf8"));
  const data = seoData(new ProductIndex(raw));
  const want = data.index.all().filter((p) => isThin(data, p)).map((p) => p.id).sort();
  const got = JSON.parse(await readFile(new URL("../../data/thin-products.json", import.meta.url), "utf8"));
  assert.deepEqual(got, want);
});

test("site search: unmatched searches become anonymous needs, shown on /wanted at k>=2", async () => {
  const q = "zxqv quantum knitting pattern planner";
  const first = await call(`/search?q=${encodeURIComponent(q)}`);
  assert.equal(first.status, 200);
  const html = await first.text();
  assert.match(html, /saved your search anonymously/);
  assert.match(html, /noindex/);
  const cookie = first.headers.get("set-cookie")!;
  assert.match(cookie, /ia_logged=/);

  // a reload from the same browser is not counted again
  await call(`/search?q=${encodeURIComponent(q)}`, { headers: { cookie: cookie.split(";")[0] } });
  let wanted = await (await call("/api/wanted")).json();
  assert.ok(!wanted.needs.some((n: any) => n.need === q), "one person is not shown publicly");

  // a second person
  await call(`/search?q=${encodeURIComponent(q)}`);
  wanted = await (await call("/api/wanted")).json();
  assert.ok(wanted.needs.some((n: any) => n.need === q && n.count === 2));
  assert.match(await (await call("/wanted")).text(), /quantum knitting/);

  // contact details never reach the board
  await call(`/search?q=${encodeURIComponent("invoice tool for plumbers mail me a@b.com")}`);
  const admin = await (await call("/api/admin/needs", { admin: true })).json();
  assert.ok(!JSON.stringify(admin).includes("a@b.com"));

  // matched searches show products and offer "none of these fit"
  const found = await (await call("/search?q=typeform+alternative")).text();
  assert.match(found, /None of these fit/);
  const none = await call("/search/none", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "q=typeform+alternative+with+offline+mode" });
  assert.match(await none.text(), /Thanks, noted/);

  // junk is not logged
  const before = (await (await call("/api/admin/needs", { admin: true })).json()).total_records;
  await call("/search?q=" + encodeURIComponent("https://spam.example"));
  await call("/search?q=ab");
  assert.equal((await (await call("/api/admin/needs", { admin: true })).json()).total_records, before);
});

test("developers guide, and the source label is counted but not stored with the need", async () => {
  const page = await call("/developers");
  assert.equal(page.status, 200);
  assert.match(await page.text(), /\/api\/needs/);
  const r = await call("/api/needs", { method: "POST", json: { need: "export kindle highlights to anki cards", source: "notes-app" } });
  assert.equal(r.status, 200);
  const stats = await (await call("/api/admin/stats", { admin: true })).json();
  assert.equal(stats.totals["source:notes-app"], 1);
  const needs = await (await call("/api/admin/needs", { admin: true })).json();
  assert.ok(!JSON.stringify(needs).includes("notes-app"));
  assert.equal((await call("/api/needs", { method: "POST", json: { need: "something useful here", source: "bad source!" } })).status, 400);
});

test("wanted board: similar wordings group, partial needs apart, category filter", async () => {
  const { groupNeeds } = await import("../src/core.js");
  const { makeNeedRecord } = await import("../src/privacy.js");
  const g = groupNeeds([
    makeNeedRecord({ need: "invoice app for plumbers" }),
    makeNeedRecord({ need: "invoicing tool for plumbers and electricians" }),
    makeNeedRecord({ need: "plumbers invoice" }),
    makeNeedRecord({ need: "invoice app for plumbers", kind: "partial" }),
    makeNeedRecord({ need: "habit tracker for cats" }),
  ]);
  assert.equal(g[0].count, 3);
  assert.equal(g[0].kind, "missing");
  assert.ok(g.some((x) => x.kind === "partial" && x.count === 1));
  assert.equal(g.length, 3);

  // "none of these fit" lands in the partial section with an inferred category
  for (let i = 0; i < 2; i++)
    await call("/search/none", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "q=" + encodeURIComponent("typeform alternative that works offline") });
  const w = await (await call("/api/wanted")).json();
  const n = w.needs.find((x: any) => x.need === "typeform alternative that works offline");
  assert.equal(n.kind, "partial");
  assert.deepEqual(n.categories, ["Forms & Surveys"]);
  assert.ok(w.categories.includes("Forms & Surveys"));
  const filtered = await (await call("/api/wanted?category=" + encodeURIComponent("Forms & Surveys"))).json();
  assert.ok(filtered.needs.every((x: any) => x.categories.includes("Forms & Surveys")));
  const html = await (await call("/wanted")).text();
  assert.match(html, /Exists, but doesn't fit/);

  // checking a need from the board doesn't count as someone asking again
  const before = (await (await call("/api/admin/needs", { admin: true })).json()).total_records;
  await call("/search?q=" + encodeURIComponent("zzkq orbital beekeeping ledger") + "&from=wanted");
  assert.equal((await (await call("/api/admin/needs", { admin: true })).json()).total_records, before);
});

test("product cards show an icon or a letter", async () => {
  const logos: string[] = JSON.parse(await readFile(new URL("../../data/logos.json", import.meta.url), "utf8"));
  const html = await (await call("/alternatives/notion")).text();
  if (logos.includes("affine")) assert.match(html, /<img class="logo" src="\/logo\/affine.png"/);
  assert.ok(/class="logo/.test(html));
});

test("admin dashboard page is public but holds no data; its APIs need the token", async () => {
  const page = await call("/admin");
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /noindex/);
  assert.doesNotMatch(html, /secret/);
  assert.equal((await call("/api/admin/stats")).status, 401);
});

test("landing pages carry a comparison table and data-backed FAQ", async () => {
  const alt = await (await call("/alternatives/notion")).text();
  assert.match(alt, /<table class="compare">/);
  assert.match(alt, /Is there a free alternative to Notion\?/);
  assert.match(alt, /"@type":"FAQPage"/);
  const prod = await (await call("/product/docmost")).text();
  assert.match(prod, /Is Docmost open source\?/);
  assert.match(prod, /Docmost compared with similar tools/);
});

test("localized landing pages with hreflang", async () => {
  const es = await call("/es/alternatives/notion");
  assert.equal(es.status, 200);
  const html = await es.text();
  assert.match(html, /<html lang="es">/);
  assert.match(html, /Alternativas indie a Notion/);
  assert.match(html, /hreflang="ja" href="https:\/\/example.test\/ja\/alternatives\/notion"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/example.test\/alternatives\/notion"/);
  for (const l of ["de", "fr", "pt", "ja"]) assert.equal((await call(`/${l}/alternatives/notion`)).status, 200);
  assert.equal((await call("/ja/")).status, 200);
  assert.equal((await call("/de")).status, 301);
  assert.equal((await call("/fr/category/developer-tools")).status, 200);
  assert.equal((await call("/xx/alternatives/notion")).status, 404);
  const en = await (await call("/alternatives/notion")).text();
  assert.match(en, /hreflang="de" href="https:\/\/example.test\/de\/alternatives\/notion"/);
  const map = await (await call("/sitemap.xml")).text();
  assert.match(map, /\/pt\/alternatives\/notion<\/loc>/);
});

test("every bundled product and category has a translation in each language (re-run the translation step when the catalog grows)", async () => {
  const products: { id: string; categories: string[] }[] = JSON.parse(await readFile(new URL("../../data/products.json", import.meta.url), "utf8"));
  for (const l of ["es", "de", "fr", "pt", "ja"]) {
    const d = JSON.parse(await readFile(new URL(`../../data/i18n/${l}.json`, import.meta.url), "utf8"));
    const missing = products.filter((p) => !d.taglines[p.id]).map((p) => p.id);
    assert.deepEqual(missing, [], `${l}: taglines missing`);
    const cats = [...new Set(products.flatMap((p) => p.categories))].filter((c) => !d.categories[c]);
    assert.deepEqual(cats, [], `${l}: categories missing`);
    const noDesc = products.filter((p: any) => p.description && p.description !== p.tagline && !d.descriptions?.[p.id]).map((p) => p.id);
    assert.deepEqual(noDesc, [], `${l}: descriptions missing`);
  }
});

test("localized product pages and demand board", async () => {
  const p = await call("/ja/product/docmost");
  assert.equal(p.status, 200);
  const html = await p.text();
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /Docmost を見る/);
  assert.match(html, /href="\/ja\/alternatives\/notion"/);
  assert.match(html, /hreflang="en" href="https:\/\/example.test\/product\/docmost"/);
  assert.equal((await call("/de/product/no-such-thing")).status, 404);
  const w = await call("/es/wanted");
  assert.equal(w.status, 200);
  assert.match(await w.text(), /Nadie lo ha creado todavía/);
  const alt = await (await call("/fr/alternatives/notion")).text();
  assert.match(alt, /href="\/fr\/product\/docmost"/);
  const map = await (await call("/sitemap.xml")).text();
  assert.match(map, /\/pt\/product\/docmost<\/loc>/);
  assert.match(map, /\/de\/wanted<\/loc>/);
});

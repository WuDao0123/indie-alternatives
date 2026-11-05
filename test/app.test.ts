import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createApp } from "../src/app.js";
import { MergedSource } from "../src/catalog.js";
import { JsonFileSource, BUNDLED_CATALOG, fromEnv } from "../src/sources.js";
import { SCHEMA, SqlNeedStore, SqlProductStore, SqlStatsStore, SqlSubmissionStore } from "../src/sql.js";
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
});

test("submission → review → approve → searchable", async () => {
  const bad = await call("/api/submissions", { method: "POST", json: { name: "X", url: "javascript:alert(1)", tagline: "t" } });
  assert.equal(bad.status, 400);

  const ok = await call("/api/submissions", {
    method: "POST",
    json: { name: "Formly", url: "https://formly.test", tagline: "Forms for static sites", tags: "formspree alternative, form backend", description: "Email me at a@b.com", contact: "me@formly.test" },
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

  const s = await (await call("/api/search?query=formspree%20alternative")).json();
  assert.equal(s.results[0].id, "formly");
  const cat = await (await call("/catalog.json")).json();
  assert.ok(cat.products.some((p: any) => p.id === "formly"));

  await call("/api/admin/products/formly", { method: "DELETE", admin: true });
  const s2 = await (await call("/api/search?query=formspree%20alternative")).json();
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

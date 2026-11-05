import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = await mkdtemp(join(tmpdir(), "ftm-http-"));
const proc = spawn(process.execPath, [fileURLToPath(new URL("../src/http.js", import.meta.url))], {
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", NEEDS_FILE: join(dir, "needs.jsonl") },
  stdio: ["ignore", "ignore", "pipe"],
});
await new Promise<void>((ok) => proc.stderr!.on("data", (d) => String(d).includes("listening") && ok()));
after(() => proc.kill());

const get = async (path: string) => {
  const r = await fetch(BASE + path);
  return { status: r.status, body: r.headers.get("content-type")?.includes("json") ? await r.json() : await r.text() };
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

test("REST: search, details, log, list", async () => {
  const s = await get("/api/search?query=" + encodeURIComponent("Mac 滚动截图") + "&limit=2");
  assert.equal(s.status, 200);
  assert.equal(s.body.results[0].id, "shottr");
  assert.equal(s.body.results.length <= 2, true);

  assert.equal((await get("/api/products/shottr")).body.name, "Shottr");
  assert.equal((await get("/api/products/nope")).status, 404);

  const l = await post("/api/needs", { need: "宠物医院预约排班，电话 13812345678" });
  assert.equal(l.status, 200);
  assert.ok(!l.body.stored_text.includes("13812345678"));
  assert.equal((await post("/api/needs", { need: "" })).status, 400);

  const n = await get("/api/needs");
  assert.equal(n.body.total_records, 1);

  const c = await post("/api/call/search_tools", { query: "privacy analytics" });
  assert.equal(c.body.results[0].id, "plausible");
});

test("OpenAPI / function definitions / llms.txt", async () => {
  const spec = (await get("/openapi.json")).body;
  assert.equal(spec.openapi, "3.1.0");
  const ops = Object.values(spec.paths).flatMap((p: any) => Object.values(p).map((o: any) => o.operationId)).sort();
  assert.deepEqual(ops, ["get_tool_details", "list_unmet_needs", "log_unmet_need", "search_tools"]);
  for (const p of Object.values(spec.paths) as any[]) for (const o of Object.values(p) as any[]) assert.ok(o.description.length <= 300);

  const oa = (await get("/functions.json?format=openai")).body;
  assert.equal(oa[0].type, "function");
  assert.equal(oa[0].function.parameters.type, "object");
  assert.ok((await get("/functions.json?format=anthropic")).body[0].input_schema);
  const gm = JSON.stringify((await get("/functions.json?format=gemini")).body);
  assert.ok(!gm.includes("additionalProperties"));
  assert.match((await get("/llms.txt")).body, /openapi\.json/);
});

test("MCP endpoint works", async () => {
  const r = await fetch(BASE + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_tools", arguments: { query: "落地页" } } }),
  });
  const j: any = await r.json();
  assert.equal(j.result.structuredContent.results[0].id, "carrd");
});

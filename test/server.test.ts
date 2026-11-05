import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/server.js";
import { JsonFileSource, JsonlNeedStore, BUNDLED_CATALOG } from "../src/sources.js";

const dir = await mkdtemp(join(tmpdir(), "ftm-"));
const needsFile = join(dir, "needs.jsonl");
const server = createServer({ catalog: new JsonFileSource(BUNDLED_CATALOG), needs: new JsonlNeedStore(needsFile) });
const client = new Client({ name: "test", version: "0" });
const [a, b] = InMemoryTransport.createLinkedPair();
await Promise.all([server.connect(a), client.connect(b)]);
const call = async (name: string, args: Record<string, unknown>) =>
  (await client.callTool({ name, arguments: args })).structuredContent as any;

test("lists 4 tools with usage instructions", async () => {
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["get_tool_details", "list_unmet_needs", "log_unmet_need", "search_tools"]);
  assert.match(client.getInstructions() ?? "", /search_tools/);
});

test("found → products; not found → anonymous need → aggregated", async () => {
  const hit = await call("search_tools", { query: "Mac 窗口分屏快捷键" });
  assert.equal(hit.matched, true);
  assert.equal(hit.results[0].id, "rectangle");
  assert.equal((await call("get_tool_details", { id: "rectangle" })).name, "Rectangle");

  const miss = await call("search_tools", { query: "会议录音自动整理成纪要" });
  assert.equal(miss.matched, false);

  const logged = await call("log_unmet_need", { need: "会议录音自动整理成纪要，联系我 a@b.com" });
  assert.equal(logged.logged, true);
  assert.ok(!logged.stored_text.includes("a@b.com"));
  await call("log_unmet_need", { need: "会议录音自动整理成纪要，联系我 a@b.com" });

  const raw = await readFile(needsFile, "utf8");
  assert.ok(!raw.includes("a@b.com"));
  const summary = await call("list_unmet_needs", {});
  assert.equal(summary.needs[0].count, 2);
});

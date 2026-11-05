import { test } from "node:test";
import assert from "node:assert/strict";
import { ProductIndex } from "../src/search.js";
import { JsonFileSource, BUNDLED_CATALOG } from "../src/sources.js";

const index = new ProductIndex(await new JsonFileSource(BUNDLED_CATALOG).load());
const top = (q: string, opts = {}) => index.search(q, opts);

test("Chinese queries match the right product", () => {
  const cases: [string, string][] = [
    ["有没有工具能在 Mac 上滚动截图", "shottr"],
    ["推荐一个做落地页的工具", "carrd"],
    ["想找个注重隐私的网站流量统计", "plausible"],
    ["有什么录屏做产品演示视频的软件", "screen-studio"],
    ["我需要收集用户好评放在官网上", "senja"],
    ["有没有能卖电子书收款的平台", "gumroad"],
    ["自托管的网站宕机监控", "uptime-kuma"],
    ["帮我找个美化截图的", "pika-style"],
  ];
  for (const [q, id] of cases) {
    const r = top(q);
    assert.equal(r.hits[0]?.product.id, id, `${q} → ${r.hits.map((h) => h.product.id).join(",")}`);
    assert.ok(r.matched, `${q} should match`);
  }
});

test("English queries match", () => {
  assert.equal(top("is there a tool for privacy friendly analytics").hits[0].product.id, "plausible");
  assert.equal(top("open source backend with auth and database").hits[0].product.id, "pocketbase");
  assert.equal(top("schedule twitter threads").hits[0].product.id, "typefully");
  assert.equal(top("scrolling screenshot app for mac").hits[0].product.id, "shottr");
  assert.equal(top("sell ebooks and courses online").hits[0].product.id, "gumroad");
  assert.ok(top("is there an app to turn meeting recordings into notes").matched === false);
});

test("English word variants and hyphenated words match", () => {
  const cases: [string, string][] = [
    ["beautify screenshots for twitter", "pika-style"],
    ["record a product demo video on mac", "screen-studio"],
    ["monitor if my website is down", "uptime-kuma"],
    ["build a landing page without code", "carrd"],
    ["AI headshot generator", "photo-ai"],
    ["no-code form builder", "tally"],
    ["tile windows on macos", "rectangle"],
  ];
  for (const [q, id] of cases) {
    const r = top(q);
    assert.equal(r.hits[0]?.product.id, id, `${q} → ${r.hits.map((h) => h.product.id).join(",")}`);
    assert.ok(r.matched, `${q} should match`);
  }
});

test("\"alternative to X\" queries match", () => {
  assert.equal(top("typeform alternative").hits[0].product.id, "tally");
  assert.equal(top("google analytics alternative").hits[0].product.id, "plausible");
  assert.equal(top("firebase alternative").hits[0].product.id, "pocketbase");
});

test("needs not in the catalog return matched=false", () => {
  for (const q of ["有没有工具能把会议录音自动整理成纪要", "宠物医院预约排班系统", "a tool to translate sign language from webcam"]) {
    assert.equal(top(q).matched, false, `${q} should not match: ${top(q).hits.map((h) => `${h.product.id}:${h.coverage}`).join(",")}`);
  }
});

test("filters work", () => {
  const r = top("截图", { platform: "web" });
  assert.ok(r.hits.every((h) => h.product.platforms?.includes("web")));
  assert.ok(top("开源", { pricing: "free" }).hits.every((h) => h.product.pricing === "free"));
  const dev = top("open source", { category: "developer tools" });
  assert.ok(dev.hits.length > 0 && dev.hits.every((h) => h.product.categories.includes("Developer Tools")));
});

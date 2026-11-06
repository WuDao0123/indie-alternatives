// Tell IndexNow search engines (Bing, Yandex, Seznam, Naver…) about every URL in the live sitemap.
// Run after a deploy that adds or changes pages: node tools/indexnow.mjs
const BASE = "https://indiealternatives.dev";
const KEY = "db4f06c6a7cea6e7090ee71c3419f713"; // same as INDEXNOW_KEY in src/seo.ts

const keyCheck = await fetch(`${BASE}/${KEY}.txt`);
if (!keyCheck.ok || (await keyCheck.text()).trim() !== KEY) throw new Error(`${BASE}/${KEY}.txt is not live yet; deploy first`);

const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: new URL(BASE).host, key: KEY, keyLocation: `${BASE}/${KEY}.txt`, urlList }),
});
console.log(`IndexNow: ${urlList.length} URLs → HTTP ${res.status} ${await res.text()}`);

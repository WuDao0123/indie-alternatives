/** Human-facing pages. Everything user-supplied goes through esc(). */

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#fbfaf7;--fg:#1d1b16;--muted:#6b665c;--line:#e6e2d9;--card:#fff;--accent:#c2410c;--accent-fg:#fff;--code:#f3f0ea;--ok:#15803d;--err:#b91c1c}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#14130f;--fg:#ece8df;--muted:#a39d90;--line:#2c2a24;--card:#1c1a16;--accent:#fb923c;--accent-fg:#1a1208;--code:#24221c;--ok:#4ade80;--err:#f87171}}
:root[data-theme="dark"]{--bg:#14130f;--fg:#ece8df;--muted:#a39d90;--line:#2c2a24;--card:#1c1a16;--accent:#fb923c;--accent-fg:#1a1208;--code:#24221c;--ok:#4ade80;--err:#f87171}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:48px 16px 64px}
a{color:var(--accent)}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:0 0 16px;letter-spacing:-.02em}
h2{font-size:20px;margin:48px 0 12px}
h3{font-size:16px;margin:20px 0 6px}
p.lead{font-size:18px;color:var(--muted);margin:0 0 28px}
.brand{font-weight:700;text-decoration:none;color:var(--fg);display:inline-block;margin-bottom:40px}
.brand span{color:var(--accent)}
code,pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);border-radius:6px}
code{padding:2px 5px}
pre{padding:12px 14px;overflow-x:auto;margin:6px 0 0;white-space:pre}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:12px 0}
.card.product{display:flex;gap:14px;align-items:flex-start}.card.product .body{min-width:0;flex:1}.card.product .body>:first-child{margin-top:0}.card.product .body>:last-child{margin-bottom:0}
.logo{flex:none;border-radius:10px;background:#fff;border:1px solid var(--line);object-fit:contain}
.logo.letter{display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:hsl(var(--h) 45% 30%);background:hsl(var(--h) 60% 92%);border-color:transparent}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .logo.letter{color:hsl(var(--h) 60% 82%);background:hsl(var(--h) 30% 22%)}}
:root[data-theme="dark"] .logo.letter{color:hsl(var(--h) 60% 82%);background:hsl(var(--h) 30% 22%)}
.phead{display:flex;gap:18px;align-items:center;margin-bottom:8px}.phead h1{margin:0 0 4px}.phead .lead{margin:0}.phead .logo{border-radius:14px}
.card>:first-child{margin-top:0}.card>:last-child{margin-bottom:0}.card h3{margin-bottom:4px}.card p{margin:6px 0}
.btn{display:inline-block;background:var(--accent);color:var(--accent-fg);padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;border:0;font-size:16px;cursor:pointer}
.muted{color:var(--muted)}
ul.needs{padding-left:20px}ul.needs li{margin:4px 0}
.count{color:var(--muted);font-size:14px}
label{display:block;font-weight:600;margin:16px 0 4px}
label small{font-weight:400;color:var(--muted)}
input[type=text],input[type=url],input[type=email],textarea,select{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--fg);font:inherit}
textarea{min-height:90px}
.checks{display:flex;flex-wrap:wrap;gap:6px 16px}.checks label{font-weight:400;margin:0;display:flex;gap:6px;align-items:center}
.hp{position:absolute;left:-9999px}
.error{color:var(--err);font-weight:600}
.top{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;justify-content:space-between;margin-bottom:40px}.top .brand{margin:0}
.search{display:flex;gap:6px;flex:1 1 260px;max-width:420px}.search input{flex:1;min-width:0;padding:8px 11px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--fg);font:inherit}
.search button{padding:8px 14px;border:0;border-radius:7px;background:var(--accent);color:var(--accent-fg);font:inherit;font-weight:600;cursor:pointer}
.hero{margin:0 0 8px}.hero h1{max-width:640px}
.search.big{max-width:none;margin:8px 0 18px}.search.big input{padding:13px 15px;font-size:17px;border-width:2px}.search.big button{padding:13px 22px;font-size:16px}
.search input:focus{outline:2px solid var(--accent);outline-offset:1px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 16px}
.chip{display:inline-block;padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--fg);text-decoration:none;font-size:14px}
.chip.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
ol.wanted{list-style:none;padding:0;margin:8px 0;counter-reset:w}ol.wanted li{padding:12px 0;border-bottom:1px solid var(--line)}
ol.wanted .need{font-weight:600}.pill{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--code);color:var(--fg);font-weight:600}
.chip:hover{border-color:var(--accent);color:var(--accent)}
.missing textarea{min-height:64px;margin:4px 0 10px}.missing h3{margin-top:0}.missing .note{font-size:13px;margin:8px 0 0}
.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:32px 0 0}.split .card{margin:0}.split h3{margin-top:0}
details.card summary{cursor:pointer}details.card[open] summary{margin-bottom:8px}
table.compare{width:100%;min-width:620px;border-collapse:collapse;font-size:14px;background:var(--card);border:1px solid var(--line);border-radius:10px}
table.compare th,table.compare td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
table.compare th{color:var(--muted);font-weight:600;white-space:nowrap}table.compare tr:last-child td{border-bottom:0}
table.compare tr.me td{background:var(--code);font-weight:600}table.compare a{color:var(--fg)}
.yes{color:var(--ok);font-weight:600}.nw{white-space:nowrap}.scroll{overflow-x:auto}
.langs{margin:8px 0 0}
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
`;

export interface PageMeta {
  canonical?: string;
  jsonLd?: unknown;
  /** og:image URL */
  image?: string;
  /** page language (default en) */
  lang?: string;
  /** the same page in other languages: hreflang → absolute URL (include the page itself); shown as a language switcher */
  alternates?: { lang: string; href: string }[];
  /** localized chrome: search placeholder/button and footer links */
  chrome?: Chrome;
  /** the page has its own big search box */
  hideSearch?: boolean;
  /** keep thin pages out of search indexes */
  noindex?: boolean;
}

export interface Chrome {
  home: string;
  placeholder: string;
  button: string;
  footer: { href: string; label: string }[];
}

const EN_CHROME: Chrome = {
  home: "/",
  placeholder: "What do you need a tool for?",
  button: "Search",
  footer: [
    { href: "/wanted", label: "Wanted: what people look for" },
    { href: "/alternatives", label: "Browse alternatives" },
    { href: "/developers", label: "For developers" },
    { href: "/submit", label: "List your product" },
    { href: "/llms.txt", label: "llms.txt" },
    { href: "/openapi.json", label: "OpenAPI" },
  ],
};

/** the "what's missing?" box on landing pages; posts to /need, without a reload when JS runs */
export interface MissingText {
  h: string;
  p: string;
  placeholder: string;
  button: string;
  thanks: string;
  note: string;
}

export const EN_MISSING: MissingText = {
  h: "Not quite what you need?",
  p: "Tell independent developers what's missing: a feature, a price, a platform. Makers read this to decide what to build next.",
  placeholder: "e.g. works offline, one-time price, has an Android app",
  button: "Send",
  thanks: "Thanks, noted. When enough people ask for the same thing, it shows up on the public board.",
  note: "Anonymous: only the text and the date are kept.",
};

export function missingBox(about: string, lang: string, m: MissingText): string {
  return `<form class="card missing" method="post" action="/need" data-thanks="${esc(m.thanks)}">
<h3>${esc(m.h)}</h3><label for="need-text">${esc(m.p)}</label>
<textarea id="need-text" name="need" maxlength="200" required placeholder="${esc(m.placeholder)}"></textarea>
<input type="hidden" name="about" value="${esc(about)}"><input type="hidden" name="lang" value="${esc(lang)}">
<button class="btn" type="submit">${esc(m.button)}</button> <p class="muted note">${esc(m.note)} <a href="/wanted">/wanted</a></p></form>
<script>document.querySelectorAll("form.missing").forEach(function(f){f.addEventListener("submit",function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;fetch("/need",{method:"POST",headers:{accept:"application/json"},body:new URLSearchParams(new FormData(f))}).then(function(r){return r.json()}).then(function(){var p=document.createElement("p");p.className="lead";p.textContent=f.dataset.thanks;f.replaceChildren(p)}).catch(function(){f.submit()})})})</script>`;
}

export const LANG_NAMES: Record<string, string> = { en: "English", es: "Español", de: "Deutsch", fr: "Français", pt: "Português", ja: "日本語" };

export function layout(title: string, description: string, body: string, meta: PageMeta = {}, q = ""): string {
  // "<" escaped so catalog text can never close the script tag
  // every page gets a share image; landing pages pass their own (tools/og.mjs renders them)
  const chrome = meta.chrome ?? EN_CHROME;
  const image = meta.image ?? (meta.canonical ? new URL("/og/default.png", meta.canonical).href : undefined);
  const ld = meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c")}</script>` : "";
  return `<!doctype html>
<html lang="${esc(meta.lang ?? "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
${meta.canonical ? `<link rel="canonical" href="${esc(meta.canonical)}"><meta property="og:url" content="${esc(meta.canonical)}">` : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="Indie Alternatives">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : `<meta name="twitter:card" content="summary">`}
${meta.noindex ? `<meta name="robots" content="noindex,follow">` : ""}
${(meta.alternates ?? []).map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.href)}">`).join("")}${
    meta.alternates?.length ? `<link rel="alternate" hreflang="x-default" href="${esc(meta.alternates.find((a) => a.lang === "en")?.href ?? meta.alternates[0].href)}">` : ""
  }
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<style>${CSS}</style>${ld}</head>
<body><main><div class="top"><a class="brand" href="${esc(chrome.home)}">Indie <span>Alternatives</span></a>
${meta.hideSearch ? "" : `<form class="search" method="get" action="/search" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(chrome.placeholder)}" aria-label="${esc(chrome.placeholder)}" maxlength="200"><button type="submit">${esc(chrome.button)}</button></form>`}</div>
${body}
<footer>Indie Alternatives · ${chrome.footer.map((f) => `<a href="${esc(f.href)}">${esc(f.label)}</a>`).join(" · ")}${
    meta.alternates && meta.alternates.length > 1
      ? `<p class="langs">${meta.alternates.map((a) => (a.lang === (meta.lang ?? "en") ? `<strong>${esc(LANG_NAMES[a.lang] ?? a.lang)}</strong>` : `<a href="${esc(a.href)}" hreflang="${esc(a.lang)}" lang="${esc(a.lang)}">${esc(LANG_NAMES[a.lang] ?? a.lang)}</a>`)).join(" · ")}</p>`
      : ""
  }</footer>
</main></body></html>`;
}

const EXAMPLES = ["notion alternative", "self-hosted uptime monitoring", "invoice app for freelancers", "add a nice background to screenshots", "privacy-friendly analytics"];

export function homePage(
  base: string,
  opts: {
    products: number;
    needs: { need: string; count: number }[];
    submissions: boolean;
    popular?: { slug: string; name: string }[];
    pages?: number;
    logged?: number;
    alternates?: { lang: string; href: string }[];
  },
): string {
  const mcp = `${base}/mcp`;
  const chips = (items: { href: string; label: string }[]) => `<p class="chips">${items.map((i) => `<a class="chip" href="${esc(i.href)}">${esc(i.label)}</a>`).join("")}</p>`;
  const client = (name: string, body: string, open = false) => `<details class="card"${open ? " open" : ""}><summary><strong>${name}</strong></summary>${body}</details>`;
  const wanted = opts.needs.length
    ? `<ol class="needs">${opts.needs.map((n) => `<li>${esc(n.need)} <span class="count">· asked ${n.count}×</span></li>`).join("")}</ol>
<p><a href="/wanted">See the full board</a></p>`
    : `<p class="muted">The board is filling up: a need appears once 3 or more people have searched for it without finding a tool. <a href="/wanted">How it works</a></p>`;
  return layout(
    "Indie Alternatives: Find Indie-Made Tools, See What People Need",
    "Search indie-made alternatives to big-name software. Searches that find nothing become a public demand board for independent developers.",
    `<section class="hero">
<h1>Find a tool made by an independent developer.</h1>
<p class="lead">Describe what you want to do, or name an app you want to replace. ${opts.products.toLocaleString("en-US")} indie-made products${opts.pages ? ` and ${opts.pages} “alternatives to” guides` : ""}.</p>
<form class="search big" method="get" action="/search" role="search"><input type="search" name="q" placeholder="e.g. a cheaper Calendly for a small clinic" aria-label="What do you need a tool for?" maxlength="200" autofocus><button type="submit">Search</button></form>
<p class="count">Try:</p>
${chips(EXAMPLES.map((e) => ({ href: `/search?q=${encodeURIComponent(e)}`, label: e })))}
${opts.popular?.length ? `<p class="count">Popular alternatives:</p>${chips([...opts.popular.map((t) => ({ href: `/alternatives/${t.slug}`, label: t.name })), { href: "/alternatives", label: "All →" }])}` : ""}
</section>

<div class="split">
<div class="card"><h3>Can't find it?</h3><p>Your search is saved anonymously and shown to independent developers, who use it to decide what to build next.</p></div>
<div class="card"><h3>Building something?</h3><p>See <a href="/wanted">what people searched for and couldn't find</a>, forward your own users' needs with <a href="/developers">two HTTP calls</a>, and <a href="/submit">list your product</a> for free.</p></div>
</div>

<h2>Wanted: what people couldn't find</h2>
${wanted}

<h2 id="add">Use it inside your AI</h2>
<p>Ask ChatGPT, Claude or Cursor <em>“what's an alternative to Typeform?”</em> or <em>“is there a tool that…”</em> and get indie-made products. Add this URL as a connector:</p>
<pre>${esc(mcp)}</pre>
${client("ChatGPT", `<p>Settings → Apps &amp; Connectors → Advanced → enable Developer mode → Create, then paste the URL above.</p>`)}
${client("Claude (web &amp; desktop)", `<p>Settings → Connectors → Add custom connector, then paste the URL above.</p>`)}
${client("Claude Code", `<pre>claude mcp add --transport http indie-alternatives ${esc(mcp)}</pre>`)}
${client("Cursor, Windsurf, VS Code, Gemini CLI and other MCP clients", `<pre>${esc(JSON.stringify({ mcpServers: { "indie-alternatives": { url: mcp } } }, null, 2))}</pre><p class="muted">Local install instead: <code>npx -y indie-alternatives-mcp</code></p>`)}
${client("Custom GPTs, Dify, n8n, your own agent", `<p>Import <a href="/openapi.json">${esc(base)}/openapi.json</a>, or get function-calling definitions from <code>${esc(base)}/functions.json?format=openai|anthropic|gemini</code>. More in the <a href="/developers">developer guide</a>.</p>`)}

<h2>Privacy</h2>
<p class="muted">When a search on this site finds nothing, or no tool fits in an AI assistant, the need is logged so makers can see demand. We store only the need text (with contact details stripped), an optional category and the date. To count people rather than clicks, we also keep a short code made from your IP address and a random key that is replaced every day; once the day is over the key is deleted, so the code can't be traced back to you or linked to other days. We never store the IP address itself, accounts or conversation content.</p>`,
    { canonical: base + "/", hideSearch: true, alternates: opts.alternates },
  );
}

const PLATFORMS = ["web", "macos", "windows", "linux", "ios", "android", "self-hosted", "api", "browser-extension"];

export function submitPage(base: string, error?: string, v: Record<string, string> = {}): string {
  const val = (k: string) => `value="${esc(v[k])}"`;
  const plats = new Set((v.platforms ?? "").split(","));
  return layout(
    "List your product · Indie Alternatives",
    "List your indie product for free so AI assistants can recommend it.",
    `<h1>List your product</h1>
<p class="lead">Free. We review every submission by hand, usually within a few days.</p>
${error ? `<p class="error">${esc(error)}</p>` : ""}
<form method="post" action="/submit" class="card">
<label for="name">Product name</label><input type="text" id="name" name="name" required maxlength="80" ${val("name")}>
<label for="url">Website</label><input type="url" id="url" name="url" required placeholder="https://" ${val("url")}>
<label for="tagline">One-line pitch</label><input type="text" id="tagline" name="tagline" required maxlength="140" ${val("tagline")}>
<label for="description">Description <small>what it does, who it's for</small></label><textarea id="description" name="description" maxlength="1000">${esc(v.description)}</textarea>
<label for="categories">Categories <small>comma-separated, up to 3, e.g. Forms &amp; Surveys</small></label><input type="text" id="categories" name="categories" ${val("categories")}>
<label for="tags">Keywords <small>what people would type, comma-separated, e.g. typeform alternative, online form, survey</small></label><input type="text" id="tags" name="tags" ${val("tags")}>
<label for="pricing">Pricing</label><select id="pricing" name="pricing">
${["", "free", "freemium", "paid", "commission"].map((p) => `<option value="${p}"${v.pricing === p ? " selected" : ""}>${p || "—"}</option>`).join("")}
</select>
<label>Platforms</label><div class="checks">${PLATFORMS.map((p) => `<label><input type="checkbox" name="platforms" value="${p}"${plats.has(p) ? " checked" : ""}> ${p}</label>`).join("")}</div>
<label for="maker">Maker <small>optional, shown publicly</small></label><input type="text" id="maker" name="maker" maxlength="80" ${val("maker")}>
<label for="contact">Your email <small>optional, private, only to reach you about the review</small></label><input type="email" id="contact" name="contact" maxlength="120" ${val("contact")}>
<div class="hp" aria-hidden="true"><label for="website">Leave empty</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>
<p style="margin-top:24px"><button class="btn" type="submit">Submit for review</button></p>
</form>
<p class="muted">Prefer an API? <code>POST ${esc(base)}/api/submissions</code> with the same fields as JSON.</p>`,
  );
}

export function thanksPage(base: string): string {
  const snippet = `<a href="${base}"><img src="${base}/badge.svg" alt="Listed on Indie Alternatives" width="190" height="36"></a>`;
  return layout(
    "Thanks · Indie Alternatives",
    "Submission received.",
    `<h1>Thanks, we got it.</h1>
<p class="lead">We'll review your product soon. Once approved, AI assistants using Indie Alternatives can recommend it.</p>
<h2>Show the badge</h2>
<p><img src="/badge.svg" alt="Listed on Indie Alternatives" width="190" height="36"></p>
<pre>${esc(snippet)}</pre>
<p><a href="/">Back to home</a></p>`,
  );
}

export function badgeSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="190" height="36" viewBox="0 0 190 36" role="img" aria-label="Listed on Indie Alternatives">
<rect width="190" height="36" rx="8" fill="#1d1b16"/>
<text x="14" y="15" fill="#a39d90" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="9" letter-spacing=".06em">LISTED ON</text>
<text x="14" y="28" fill="#fff" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="13" font-weight="700">Indie <tspan fill="#fb923c">Alternatives</tspan></text>
</svg>`;
}

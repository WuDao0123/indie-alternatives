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
footer{margin-top:56px;padding-top:16px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
`;

function layout(title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
<style>${CSS}</style></head>
<body><main><a class="brand" href="/">Indie <span>Alternatives</span></a>
${body}
<footer>Indie Alternatives · <a href="/submit">List your product</a> · <a href="/llms.txt">llms.txt</a> · <a href="/openapi.json">OpenAPI</a></footer>
</main></body></html>`;
}

export function homePage(base: string, opts: { products: number; needs: { need: string; count: number }[]; submissions: boolean }): string {
  const mcp = `${base}/mcp`;
  const needs = opts.needs.length
    ? `<h2>Wanted: tools people asked for that don't exist yet</h2>
<p class="muted">Anonymous requests from AI conversations where no tool fit. Build one and <a href="/submit">list it</a>.</p>
<ul class="needs">${opts.needs.map((n) => `<li>${esc(n.need)} <span class="count">· asked ${n.count}×</span></li>`).join("")}</ul>`
    : "";
  return layout(
    "Indie Alternatives",
    "Indie-made alternatives to big-name software, right inside ChatGPT, Claude, Cursor and any AI assistant.",
    `<h1>Indie alternatives to big-name software, right inside your AI.</h1>
<p class="lead">Ask ChatGPT, Claude or Cursor <em>“what's an alternative to Typeform?”</em> or <em>“is there a tool that…”</em> and get products built by independent makers.</p>

<h2>Add it to your AI</h2>
<div class="card"><h3>ChatGPT</h3>
<p>Settings → Apps &amp; Connectors → Advanced → enable Developer mode → Create. URL:</p><pre>${esc(mcp)}</pre></div>
<div class="card"><h3>Claude (web &amp; desktop)</h3>
<p>Settings → Connectors → Add custom connector. URL:</p><pre>${esc(mcp)}</pre></div>
<div class="card"><h3>Claude Code</h3><pre>claude mcp add --transport http indie-alternatives ${esc(mcp)}</pre></div>
<div class="card"><h3>Cursor, Windsurf, VS Code, Gemini CLI and other MCP clients</h3>
<pre>${esc(JSON.stringify({ mcpServers: { "indie-alternatives": { url: mcp } } }, null, 2))}</pre>
<p class="muted">Local install instead: <code>npx -y indie-alternatives-mcp</code></p></div>
<div class="card"><h3>Custom GPTs, Dify, n8n, your own agent</h3>
<p>Import <a href="/openapi.json">${esc(base)}/openapi.json</a>, or get function-calling definitions from <code>${esc(base)}/functions.json?format=openai|anthropic|gemini</code>.</p></div>

<h2>For makers</h2>
<p>${opts.products} products listed so far. Listing is free: when someone asks their AI for a tool like yours, it can recommend you.</p>
${opts.submissions ? `<p><a class="btn" href="/submit">List your product</a></p>` : ""}
${needs}

<h2>Privacy</h2>
<p class="muted">When no tool fits, the AI may log the need so makers can see demand. We store only the need text (with contact details stripped), an optional category and the date. No accounts, no IP addresses, no conversation content.</p>`,
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

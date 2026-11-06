/**
 * Demand signals from people on the website, and the public board developers read.
 *
 *   GET  /search?q=          search page for people; a search that finds nothing is logged as an anonymous need
 *   POST /search/none        "none of these fit": logs the search as a need even though results came back
 *   GET  /wanted             public board of needs asked for ≥ publicNeedsMin times (k-anonymity)
 */
import { esc, layout } from "./pages.js";
import type { Product } from "./types.js";

export interface PublicNeed {
  need: string;
  count: number;
  first_seen: string;
  last_seen: string;
  categories: string[];
  kind: "missing" | "partial";
}

const PRICING: Record<string, string> = { free: "Free", freemium: "Free plan", paid: "Paid", commission: "Commission", "open-source": "Open source" };

function hit(p: Product): string {
  const meta = [p.pricing && (PRICING[p.pricing] ?? p.pricing), (p.platforms ?? []).join(", ")].filter(Boolean).map(esc).join(" · ");
  return `<div class="card"><h3><a href="/product/${esc(p.id)}">${esc(p.name)}</a></h3><p>${esc(p.tagline)}</p>
<p class="count">${meta ? `${meta} · ` : ""}<a href="${esc(p.url)}" rel="noopener">Website ↗</a></p></div>`;
}

const PRIVACY = `<p class="count">Searches that find nothing are saved anonymously (only the text, contact details stripped, and the date) so independent developers can see what people need. <a href="/wanted">See what people are looking for</a>.</p>`;

export function searchPage(base: string, q: string, r: { matched: boolean; hits: Product[]; logged: boolean; reported?: boolean }): string {
  const body = !q
    ? `<h1>Find a tool</h1><p class="lead">Describe what you want to do, or name an app you want to replace.</p>${PRIVACY}`
    : r.reported
      ? `<h1>Thanks, noted.</h1>
<p class="lead">“${esc(q)}” is now on the list independent developers read. When enough people ask for the same thing, it shows up on <a href="/wanted">the public board</a>.</p>`
      : `<h1>${r.matched ? `Tools for “${esc(q)}”` : `Nothing yet for “${esc(q)}”`}</h1>
${
  r.hits.length
    ? (!r.matched
        ? `<p class="lead">Nothing in the catalog is a close match, so these are only loosely related.${r.logged ? " We saved your search anonymously, so independent developers can see that people want it." : ""}</p>`
        : "") +
      r.hits.map(hit).join("\n") +
      `<form method="post" action="/search/none" class="card"><input type="hidden" name="q" value="${esc(q)}">
<p><strong>None of these fit?</strong> Tell independent developers this is still missing.</p>
<button class="btn" type="submit">None of these fit</button></form>`
    : `<p class="lead">No tool in the catalog does this yet.${r.logged ? " We saved your search anonymously, so independent developers can see that people want it." : ""}</p>
<p>Know a tool that does it? <a href="/submit">Add it</a>. Want to build it? See <a href="/wanted">what else people are looking for</a>.</p>`
}
${PRIVACY}`;
  return layout(q ? `${q} · Search · Indie Alternatives` : "Search · Indie Alternatives", "Search indie-made tools.", body, { canonical: base + "/search", noindex: true }, q);
}

function needList(needs: PublicNeed[]): string {
  return `<ol class="wanted">${needs
    .map(
      (n) => `<li><div class="need">${esc(n.need)}</div>
<div class="count"><span class="pill">${n.count}× asked</span> ${n.first_seen === n.last_seen ? esc(n.last_seen) : `${esc(n.first_seen)} → ${esc(n.last_seen)}`}${
        n.categories.length ? ` · ${n.categories.map((c) => `<a href="/wanted?category=${encodeURIComponent(c)}">${esc(c)}</a>`).join(", ")}` : ""
      } · <a href="/search?q=${encodeURIComponent(n.need)}&amp;from=wanted" rel="nofollow">search it</a></div></li>`,
    )
    .join("\n")}</ol>`;
}

export function wantedPage(
  base: string,
  needs: PublicNeed[],
  min: number,
  totals: { records: number; distinct: number },
  categories: string[] = [],
  category?: string,
): string {
  const missing = needs.filter((n) => n.kind !== "partial");
  const partial = needs.filter((n) => n.kind === "partial");
  const filters = categories.length
    ? `<p class="chips"><a class="chip${category ? "" : " on"}" href="/wanted">All</a>${categories
        .map((c) => `<a class="chip${c.toLowerCase() === category?.toLowerCase() ? " on" : ""}" href="/wanted?category=${encodeURIComponent(c)}">${esc(c)}</a>`)
        .join("")}</p>`
    : "";
  const empty = `<div class="card"><p><strong>${category ? `Nothing in ${esc(category)} yet.` : "Collecting."}</strong> A need appears here once ${min} or more people have asked for it, so no single person can be identified.</p></div>`;
  return layout(
    category ? `Wanted: ${category} Tools People Are Looking For · Indie Alternatives` : "Wanted: Software People Are Looking For · Indie Alternatives",
    "Tools people searched for that don't exist yet, from anonymous searches on this site and in AI assistants. Product ideas for indie developers.",
    `<h1>Wanted: tools people are looking for</h1>
<p class="lead">Real searches from people on this site and in ChatGPT, Claude and Cursor. Sorted by how many people asked. Build one and <a href="/submit">list it</a>, and the people who search next will find you.</p>
${filters}
<h2>Nobody has built this yet</h2>
<p class="muted">Searches where no tool came close.</p>
${missing.length ? needList(missing) : empty}
<h2>Exists, but doesn't fit</h2>
<p class="muted">Tools came back, and people said none of them fit. Room for a better or more focused product.</p>
${partial.length ? needList(partial) : empty}
<p class="muted">${totals.records} searches logged so far, ${totals.distinct} distinct needs (similar wordings are grouped). Only needs asked ${min}+ times are shown. Developers: the same list as JSON is at <a href="/api/wanted">/api/wanted</a>${category ? ` (add <code>?category=${esc(category)}</code>)` : ""}.</p>
<h2>How this works</h2>
<p class="muted">When a search here or in an AI assistant finds nothing, or someone says none of the results fit, we save only the need text (contact details stripped), a rough category and the date. No accounts, no IP addresses, no conversation content.</p>`,
    { canonical: category ? `${base}/wanted?category=${encodeURIComponent(category)}` : base + "/wanted", noindex: Boolean(category) && needs.length === 0 },
  );
}

/** integration guide for apps, agents and MCP servers that want to forward their users' unmet needs */
export function developersPage(base: string): string {
  const js = `// when your app or agent can't do what the user asked:
const API = "${base}/api";

async function suggestTools(need) {
  const r = await fetch(\`\${API}/search?query=\${encodeURIComponent(need)}&limit=3\`).then((r) => r.json());
  if (!r.matched) {
    // nothing fits: forward the need (generic text only, no user info)
    await fetch(\`\${API}/needs\`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ need, source: "your-app-name" }),
    });
  }
  return r.results; // [{ name, url, tagline, pricing, ... }] to show your user
}`;
  const py = `import json, urllib.parse, urllib.request

API = "${base}/api"

def suggest_tools(need: str):
    q = urllib.parse.urlencode({"query": need, "limit": 3})
    r = json.load(urllib.request.urlopen(f"{API}/search?{q}"))
    if not r["matched"]:
        body = json.dumps({"need": need, "source": "your-app-name"}).encode()
        req = urllib.request.Request(f"{API}/needs", body, {"content-type": "application/json"})
        urllib.request.urlopen(req)
    return r["results"]`;
  const curl = `curl -X POST ${base}/api/needs \\
  -H 'content-type: application/json' \\
  -d '{"need":"turn voice memos into a weekly journal","source":"your-app-name"}'`;
  return layout(
    "For Developers: Forward Unmet Needs · Indie Alternatives",
    "Two HTTP calls let your app, agent or MCP server recommend indie tools when it can't help, and forward what users asked for to the public demand board.",
    `<h1>Turn “I can't do that” into a useful answer</h1>
<p class="lead">When your app, AI agent or MCP server gets a request it can't handle, ask Indie Alternatives. Your user gets a tool that does it. If no tool exists, the need goes on the <a href="/wanted">public demand board</a> that independent developers read when they decide what to build.</p>
<p>Free, no API key, no sign-up. Two HTTP calls.</p>

<h2>1. Search</h2>
<pre>GET ${esc(base)}/api/search?query=&lt;what the user wants&gt;&amp;limit=3</pre>
<p class="muted">Returns <code>matched</code> (is anything a good fit) and <code>results</code> with name, url, tagline, pricing and platforms.</p>

<h2>2. Forward the need when nothing fits</h2>
<pre>${esc(curl)}</pre>
<p class="muted"><code>source</code> is optional: a short name for your app. We only count it (so we can see which apps send demand); it is never shown next to the need.</p>

<h2>JavaScript / TypeScript</h2>
<pre>${esc(js)}</pre>
<h2>Python</h2>
<pre>${esc(py)}</pre>

<h2>No-code agents and AI platforms</h2>
<div class="card"><h3>Dify, Coze, n8n, custom GPTs</h3><p>Import <a href="/openapi.json">${esc(base)}/openapi.json</a> as a tool. Tell the agent: “When you can't do what the user asks, call search_tools; if matched is false, call log_unmet_need with a generic description of the need.”</p></div>
<div class="card"><h3>MCP clients and agents</h3><p>Add the server next to your own: <code>${esc(base)}/mcp</code>. Its instructions already tell the model when to search and when to log.</p></div>
<div class="card"><h3>Function calling</h3><p>Ready-made definitions: <code>${esc(base)}/functions.json?format=openai|anthropic|gemini</code></p></div>

<h2>Privacy rules</h2>
<p>Send only the need itself, rewritten as a generic description: no user ids, names, emails, company names or links. The server strips contact details again and stores only the text, an optional category and the date. Never send conversation transcripts.</p>

<h2>Read the demand</h2>
<p>Needs asked for 3 or more times are public at <a href="/wanted">/wanted</a> and as JSON at <a href="/api/wanted">/api/wanted</a>. Building something from it? <a href="/submit">List it</a> and the people searching next will find you.</p>`,
    { canonical: base + "/developers" },
  );
}

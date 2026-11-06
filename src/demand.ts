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

export function wantedPage(base: string, needs: PublicNeed[], min: number, totals: { records: number; distinct: number }): string {
  const rows = needs.length
    ? `<ol class="needs">${needs
        .map(
          (n) =>
            `<li><strong>${esc(n.need)}</strong> <span class="count">· asked ${n.count}× · ${esc(n.first_seen)} → ${esc(n.last_seen)}${n.categories.length ? ` · ${n.categories.map(esc).join(", ")}` : ""}</span></li>`,
        )
        .join("\n")}</ol>`
    : `<div class="card"><p><strong>Collecting.</strong> A need appears here once ${min} or more people have asked for it, so no single person can be identified.</p></div>`;
  return layout(
    "Wanted: Software People Are Looking For · Indie Alternatives",
    "Tools people searched for that don't exist yet, from anonymous searches on this site and in AI assistants. Product ideas for indie developers.",
    `<h1>Wanted: tools people are looking for</h1>
<p class="lead">Real searches from people on this site and in ChatGPT, Claude and Cursor where no existing tool fit. Sorted by how many people asked. Build one and <a href="/submit">list it</a>, and the people who search next will find you.</p>
${rows}
<p class="muted">${totals.records} searches logged so far, ${totals.distinct} distinct needs. Only needs asked ${min}+ times are shown. Developers: the same list as JSON is at <a href="/api/wanted">/api/wanted</a>.</p>
<h2>How this works</h2>
<p class="muted">When a search here or in an AI assistant finds nothing, we save only the need text (contact details stripped), an optional category and the date. No accounts, no IP addresses, no conversation content.</p>`,
    { canonical: base + "/wanted" },
  );
}

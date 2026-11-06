/**
 * /admin: a dashboard over the anonymous counters and needs. The page itself is static and public (no data in it);
 * it asks for the admin token, keeps it in sessionStorage, and calls /api/admin/* with it.
 */
import { layout } from "./pages.js";

const CSS = `
.viz{--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70}}
:root[data-theme="dark"] .viz{--s1:#3987e5;--s2:#d95926;--s3:#199e70}
main{max-width:1040px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.tile .v{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.1}
.tile .k{font-size:13px;color:var(--muted)}
.range{display:flex;gap:6px;align-items:center;margin:8px 0 0}
.range button{padding:5px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--fg);font:inherit;font-size:14px;cursor:pointer}
.range button[aria-pressed=true]{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.chart{position:relative;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px 8px;margin:12px 0}
.chart svg{display:block;width:100%;height:auto;overflow:visible}
.chart .grid line{stroke:var(--line)}
.chart text{fill:var(--muted);font-size:11px}
.legend{display:flex;gap:16px;font-size:13px;color:var(--fg);margin:0 0 6px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.tip{position:absolute;pointer-events:none;background:var(--fg);color:var(--bg);font-size:12px;line-height:1.5;padding:6px 9px;border-radius:6px;white-space:nowrap;display:none;z-index:2}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--muted);font-weight:600}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
tr.off td{opacity:.45}tr.off td:last-child{opacity:1}
.flag{display:inline-block;font-size:12px;padding:1px 7px;border-radius:999px;background:var(--code);color:var(--err);white-space:nowrap;margin:1px 0}
button.hide{padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--fg);font:inherit;font-size:13px;cursor:pointer}
.two{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.scroll{overflow-x:auto}
#login{max-width:420px}
`;

const SCRIPT = String.raw`
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n || 0).toLocaleString("en-US");
let token = "";
try { token = sessionStorage.getItem("ia_admin") || ""; } catch {}
// /admin#token=… (the hash never reaches the server); stored for this tab, then removed from the address bar
const fromHash = new URLSearchParams(location.hash.slice(1)).get("token");
if (fromHash) { token = fromHash; try { sessionStorage.setItem("ia_admin", token); } catch {} history.replaceState(null, "", location.pathname); }
let days = 30;

async function api(path) {
  const r = await fetch(path, { headers: { authorization: "Bearer " + token } });
  if (r.status === 401) throw new Error("unauthorized");
  return r.json();
}

$("#login").addEventListener("submit", (e) => {
  e.preventDefault();
  token = $("#token").value.trim();
  try { sessionStorage.setItem("ia_admin", token); } catch {}
  load();
});
document.querySelectorAll(".range button").forEach((b) => b.addEventListener("click", () => {
  days = Number(b.dataset.days);
  document.querySelectorAll(".range button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  load();
}));

function series(byDay, keys, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = byDay[d] || {};
    out.push({ day: d, v: keys.map((k) => [].concat(k).reduce((s, kk) => s + (row[kk] || 0), 0)) });
  }
  return out;
}

/** stacked daily bars, one y-axis; names/colors in fixed order */
function bars(el, rows, names, colors) {
  const W = 960, H = 220, L = 34, B = 22, T = 8;
  const max = Math.max(1, ...rows.map((r) => r.v.reduce((a, b) => a + b, 0)));
  // 4 gridlines at a round step: 1, 2 or 5 × 10^k
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const stepV = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw));
  const nice = stepV * 4;
  const step = (W - L) / rows.length, bw = Math.max(2, step - 3);
  const y = (v) => H - B - (v / nice) * (H - B - T);
  let g = '<g class="grid">';
  for (let i = 0; i <= 4; i++) { const v = (nice * i) / 4, yy = y(v); g += '<line x1="' + L + '" x2="' + W + '" y1="' + yy + '" y2="' + yy + '"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + fmt(v) + "</text>"; }
  g += "</g>";
  let m = "";
  rows.forEach((r, i) => {
    let base = 0;
    const x = L + i * step + 1.5;
    r.v.forEach((v, s) => {
      if (!v) return;
      const y0 = y(base), y1 = y(base + v);
      // 2px surface gap between stacked segments; rounded top only on the last segment
      const h = Math.max(1, y0 - y1 - (base ? 2 : 0));
      m += '<rect x="' + x + '" y="' + y1 + '" width="' + bw + '" height="' + h + '" rx="' + (s === r.v.length - 1 || !r.v.slice(s + 1).some(Boolean) ? 3 : 0) + '" fill="var(' + colors[s] + ')"/>';
      base += v;
    });
    m += '<rect class="hit" data-i="' + i + '" x="' + (L + i * step) + '" y="' + T + '" width="' + step + '" height="' + (H - B - T) + '" fill="transparent"/>';
    if (rows.length <= 31 ? i % Math.ceil(rows.length / 8) === 0 : i % 14 === 0) m += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + r.day.slice(5) + "</text>";
  });
  const legend = names.length > 1 ? '<div class="legend">' + names.map((n, i) => '<span><i style="background:var(' + colors[i] + ')"></i>' + esc(n) + "</span>").join("") + "</div>" : "";
  el.innerHTML = legend + '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Daily chart">' + g + m + '</svg><div class="tip"></div>';
  const tip = el.querySelector(".tip");
  el.querySelectorAll(".hit").forEach((h) => {
    h.addEventListener("mousemove", (e) => {
      const r = rows[h.dataset.i];
      tip.innerHTML = "<b>" + r.day + "</b><br>" + names.map((n, s) => esc(n) + ": " + fmt(r.v[s])).join("<br>");
      const box = el.getBoundingClientRect();
      tip.style.display = "block";
      tip.style.left = Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth - 4) + "px";
      tip.style.top = e.clientY - box.top - 10 + "px";
    });
    h.addEventListener("mouseleave", () => (tip.style.display = "none"));
  });
}

function table(rows, cols) {
  if (!rows.length) return '<p class="muted">Nothing yet.</p>';
  return '<div class="scroll"><table><thead><tr>' + cols.map((c) => "<th" + (c.n ? ' class="n"' : "") + ">" + c.h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map((r) => "<tr>" + cols.map((c) => "<td" + (c.n ? ' class="n"' : "") + ">" + (c.n ? fmt(c.f(r)) : esc(c.f(r))) + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}

async function load() {
  if (!token) return;
  let stats, needs, subs;
  try {
    [stats, needs, subs] = await Promise.all([api("/api/admin/stats?days=" + days), api("/api/admin/needs?limit=100"), api("/api/admin/submissions").catch(() => ({ submissions: [] }))]);
  } catch (e) {
    $("#err").textContent = e.message === "unauthorized" ? "Wrong token." : "Could not load: " + e.message;
    $("#login").hidden = false; $("#dash").hidden = true;
    return;
  }
  $("#err").textContent = ""; $("#login").hidden = true; $("#dash").hidden = false;
  const t = stats.totals, sum = (re) => Object.entries(t).filter(([k]) => re.test(k)).reduce((s, [, v]) => s + v, 0);
  const searches = (t["search:matched"] || 0) + (t["search:unmatched"] || 0);
  const pages = sum(/^page:/);
  $("#tiles").innerHTML = [
    ["Searches", fmt(searches)],
    ["Found nothing", searches ? Math.round(((t["search:unmatched"] || 0) / searches) * 100) + "%" : "–"],
    ["Needs logged", fmt(t["tool:log_unmet_need"] || 0)],
    ["“None fit” clicks", fmt(t["web:none-fit"] || 0)],
    ["Landing page views", fmt(pages)],
    ["Pending submissions", fmt((subs.submissions || []).length)],
  ].map(([k, v]) => '<div class="tile"><div class="v">' + v + '</div><div class="k">' + k + "</div></div>").join("");

  const s = series(stats.by_day, [["search:web"], ["search:mcp"], ["search:rest", "search:cli"]], days);
  bars($("#c-search"), s, ["Website", "AI assistants (MCP)", "API"], ["--s1", "--s2", "--s3"]);
  const p = series(stats.by_day, [["page:alternatives", "page:category", "page:product", "page:wanted"]], days);
  bars($("#c-pages"), p, ["Landing page views"], ["--s1"]);
  $("#t-daily").innerHTML = table(s.map((r, i) => ({ day: r.day, w: r.v[0], m: r.v[1], a: r.v[2], p: p[i].v[0] })).reverse(),
    [{ h: "Day", f: (r) => r.day }, { h: "Website", n: 1, f: (r) => r.w }, { h: "MCP", n: 1, f: (r) => r.m }, { h: "API", n: 1, f: (r) => r.a }, { h: "Page views", n: 1, f: (r) => r.p }]);

  const top = (re, n) => Object.entries(t).filter(([k]) => re.test(k)).map(([k, v]) => ({ k: k.replace(re, ""), v })).sort((a, b) => b.v - a.v).slice(0, n);
  $("#t-sources").innerHTML = table(top(/^source:/, 20), [{ h: "App (source)", f: (r) => r.k }, { h: "Needs", n: 1, f: (r) => r.v }]);
  $("#t-clients").innerHTML = table(top(/^client:/, 20), [{ h: "MCP client", f: (r) => r.k }, { h: "Connections", n: 1, f: (r) => r.v }]);
  $("#t-needs").innerHTML = needs.needs.length ? '<div class="scroll"><table><thead><tr><th>Need</th><th>Type</th><th>Category</th><th>Last seen</th><th class="n">People</th><th class="n">Requests</th><th>Via</th><th>Check</th><th></th></tr></thead><tbody>' +
    needs.needs.map((r, i) => '<tr' + (r.hidden ? ' class="off"' : "") + "><td>" + esc(r.need) + "</td><td>" + (r.kind === "partial" ? "doesn't fit" : "missing") + "</td><td>" + esc((r.categories || []).join(", ")) +
      "</td><td>" + esc(r.last_seen) + '</td><td class="n">' + fmt(r.count) + '</td><td class="n">' + fmt(r.records) + "</td><td>" + esc(Object.entries(r.channels || {}).map(([k, v]) => k + " " + v).join(", ")) +
      "</td><td>" + (r.flags || []).map((f) => '<span class="flag">⚠ ' + esc(f) + "</span>").join(" ") +
      '</td><td><button type="button" class="hide" data-i="' + i + '">' + (r.hidden ? "Unhide" : "Hide") + "</button></td></tr>").join("") + "</tbody></table></div>" : '<p class="muted">Nothing yet.</p>';
  document.querySelectorAll("#t-needs button.hide").forEach((b) => b.addEventListener("click", async () => {
    const r = needs.needs[b.dataset.i];
    b.disabled = true;
    const res = await fetch("/api/admin/needs/" + (r.hidden ? "unhide" : "hide"), { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify({ fingerprints: r.fingerprints }) });
    if (res.ok) load(); else { b.disabled = false; $("#err").textContent = "Could not update: HTTP " + res.status; }
  }));
  $("#needs-total").textContent = fmt(needs.total_records) + " requests, " + fmt(needs.distinct_needs) + " distinct needs. People = one per person per day. All needs, including those below the public threshold and hidden ones (greyed out); private.";
}
load();
`;

export function adminPage(base: string): string {
  return layout(
    "Dashboard · Indie Alternatives",
    "Admin dashboard.",
    `<style>${CSS}</style>
<h1>Dashboard</h1>
<p id="err" class="error"></p>
<form id="login" class="card"><label for="token">Admin token</label><input type="text" id="token" autocomplete="off" spellcheck="false">
<p style="margin-top:12px"><button class="btn" type="submit">Open</button></p><p class="count">Kept in this tab only (sessionStorage).</p></form>
<div id="dash" class="viz" hidden>
<div class="range" role="group" aria-label="Time range"><span class="count">Range:</span>
<button type="button" data-days="7" aria-pressed="false">7 days</button><button type="button" data-days="30" aria-pressed="true">30 days</button><button type="button" data-days="90" aria-pressed="false">90 days</button></div>
<div id="tiles" class="tiles"></div>
<h2>Searches per day</h2><div id="c-search" class="chart"></div>
<h2>Landing page views per day</h2><div id="c-pages" class="chart"></div>
<details class="card"><summary><strong>Daily numbers (table)</strong></summary><div id="t-daily"></div></details>
<h2>Needs</h2><p id="needs-total" class="count"></p><div id="t-needs" class="card"></div>
<div class="two"><div><h2>Apps forwarding needs</h2><div id="t-sources" class="card"></div></div><div><h2>MCP clients</h2><div id="t-clients" class="card"></div></div></div>
</div>
<script>${SCRIPT}</script>`,
    { canonical: base + "/admin", noindex: true, hideSearch: true },
  );
}

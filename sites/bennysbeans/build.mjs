// Re-syncs the shared header and footer into every page and fingerprints CSS/JS links.
// Pages are plain HTML (source and output): content between <!--bb:header-->…<!--/bb:header-->
// and <!--bb:footer-->…<!--/bb:footer--> is rewritten. Run: node sites/bennysbeans/build.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const NAV = [["shop/", "Shop"], ["subscribe/", "Subscribe"], ["brew/", "Brew"], ["wholesale/", "Wholesale"], ["find-us/", "Find us"]];
const MOBILE = [...NAV, ["gifts/", "Gifts"], ["story/", "Our story"]];
const TICKER = ["Roasting days: Monday + Wednesday", "Ships the next day", "Free shipping on $60+", "Will-call pickup at True Value, Guerneville", "Occidental Farmers Market · Thu 4–8", "Cloverdale Farmers Market · Sun 9:30–1", "Text Benny 707-899-4183"];

function header(p, page) {
  const nav = NAV.map(([h, l]) => `<a href="${p}${h}"${page === h ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const mnav = MOBILE.map(([h, l]) => `<a href="${p}${h}">${l}</a>`).join("");
  const tick = TICKER.map((t) => `<span>${t}</span>`).join("");
  return `<!--bb:header-->
<a class="skip" href="#main">Skip to content</a>
<div class="concept"><div class="wrap"><span>Concept site by <b>Future Basics</b> for Benny's Beans · checkout and demo data are illustrative · <a href="${p}roaster/">See the roaster console →</a></span><button type="button" aria-label="Hide this note">×</button></div></div>
<div class="ticker" aria-hidden="true"><div class="track">${tick}${tick}</div></div>
<header class="site-head">
  <div class="wrap head-row">
    <nav class="nav" aria-label="Main">${nav}</nav>
    <a class="brand" href="${p}" aria-label="Benny's Beans home"><span data-ring></span><span><b>Benny's Beans</b><small>Russian River Roastery</small></span></a>
    <div class="head-cta">
      <a class="roast-pill" href="${p}shop/"><i></i>Next roast <span data-next-roast></span></a>
      <button class="cart-btn" type="button" aria-label="Your bag"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg><span class="count">0</span></button>
      <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mnav"><span></span></button>
    </div>
    <nav class="mobile-nav" id="mnav" aria-label="Mobile">${mnav}<a class="mn-meta" href="sms:+17078994183">Text Benny 707-899-4183 · Roasts Mon + Wed</a></nav>
  </div>
</header>
<!--/bb:header-->`;
}

function footer(p) {
  return `<!--bb:footer-->
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <p style="font-weight:900;font-variation-settings:'wdth' 125;text-transform:uppercase;font-size:30px;line-height:1;color:#fbf8f2;margin-bottom:16px">Roasted after<br>you order. <span style="color:var(--cherry)">Always.</span></p>
        <p>Small-batch single origins roasted in Guerneville on the Russian River. Est. 2023.</p>
        <form class="news" data-news><label class="sr" for="news-email">Email</label><input id="news-email" type="email" placeholder="Roast-day emails" required><button class="btn btn-red" type="submit">Join</button></form>
        <p class="tiny" style="color:#8d8174;margin-top:8px">One email per new coffee. No spam, ever.</p>
      </div>
      <div><h4>Coffee</h4><ul><li><a href="${p}shop/">Shop all coffee</a></li><li><a href="${p}subscribe/">Subscriptions</a></li><li><a href="${p}brew/">Brew guides &amp; bean quiz</a></li><li><a href="${p}gifts/">Gifts &amp; coasters</a></li></ul></div>
      <div><h4>Benny's</h4><ul><li><a href="${p}story/">Our story</a></li><li><a href="${p}wholesale/">Wholesale &amp; rentals</a></li><li><a href="${p}find-us/">Markets &amp; pickup</a></li><li><a href="${p}coffee-roaster-guerneville/">Coffee roaster in Guerneville</a></li></ul></div>
      <div><h4>Talk coffee</h4><p><a href="sms:+17078994183" style="font-size:22px;font-weight:800;color:#fbf8f2">707-899-4183</a><br><span class="tiny" style="color:#8d8174">Text any time</span></p><p class="small">Will-call: True Value Hardware<br>15600 River Rd, Guerneville</p><p class="small">Roasting Mon + Wed<br>Ships Tue + Thu</p></div>
    </div>
    <div class="foot-big" aria-hidden="true">Benny's<br><em>Beans</em></div>
    <div class="foot-base"><span>© <span data-year>2026</span> Benny's Beans · Russian River Roastery · Concept by Future Basics</span><span><a href="${p}roaster/">Roaster console (demo)</a></span></div>
  </div>
</footer>
<script src="${p}assets/site.js" defer></script>
<!--/bb:footer-->`;
}

const FINGERPRINT = ["assets/site.css", "assets/site.js", "roaster/roaster.css", "roaster/roaster.js"];
const version = Object.fromEntries(FINGERPRINT.flatMap((f) => {
  try { return [[f.split("/").pop(), createHash("sha1").update(readFileSync(join(root, f))).digest("hex").slice(0, 8)]]; } catch { return []; }
}));
const stamp = (html) => html.replace(/((?:href|src)="[^"]*?\b(site\.css|site\.js|roaster\.css|roaster\.js))(\?v=[0-9a-f]+)?"/g, (m, url, name) => version[name] ? `${url}?v=${version[name]}"` : m);

function pages(dir) {
  return readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) return f === "assets" ? [] : pages(full);
    return f.endsWith(".html") ? [full] : [];
  });
}
for (const file of pages(root)) {
  const rel = relative(root, file);
  const depth = rel.split(sep).length - 1;
  const p = depth ? "../".repeat(depth) : "./";
  const page = depth ? rel.split(sep).slice(0, -1).join("/") + "/" : "";
  let html = readFileSync(file, "utf8")
    .replace(/<!--bb:header-->[\s\S]*?<!--\/bb:header-->/, header(p, page))
    .replace(/<!--bb:footer-->[\s\S]*?<!--\/bb:footer-->/, footer(p));
  writeFileSync(file, stamp(html));
  console.log("synced", rel);
}

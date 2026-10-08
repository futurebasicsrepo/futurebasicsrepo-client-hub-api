// Re-syncs the shared header and footer into every page and fingerprints CSS/JS links.
// Pages are plain HTML (source and output): content between <!--md:header-->…<!--/md:header-->
// and <!--md:footer-->…<!--/md:footer--> is rewritten. Run: node sites/modish/build.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const NAV = [["menu/", "Menu"], ["looks/", "Looks"], ["gift-cards/", "Gift cards"], ["parties/", "Parties"]];

function header(p, page) {
  const nav = NAV.map(([h, l]) => `<a href="${p}${h}"${page === h ? ' aria-current="page"' : ""}>${l}</a>`).join("");
  const mnav = NAV.map(([h, l]) => `<a href="${p}${h}">${l}</a>`).join("");
  return `<!--md:header-->
<a class="skip" href="#main">Skip to content</a>
<div class="concept"><div class="wrap"><span>Concept site by <b>Future Basics</b> for Modish Nail Spa · booking and demo data are illustrative · <a href="${p}owner/">See the salon console →</a></span><button type="button" aria-label="Hide this note">×</button></div></div>
<header class="site-head">
  <div class="wrap head-row">
    <nav class="nav" aria-label="Main">${nav}</nav>
    <a class="wordmark" href="${p}" aria-label="Modish Nail Spa home"><b>MODISH</b><span>Nail Spa</span></a>
    <div class="head-cta">
      <a class="phone" href="tel:+12673355234">267-335-5234</a>
      <a class="btn btn-dark btn-sm" href="${p}book/">Book</a>
      <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="mnav"><span></span></button>
    </div>
    <nav class="mobile-nav" id="mnav" aria-label="Mobile">${mnav}<a href="${p}book/"><em>Book a visit</em></a><a class="mn-meta" href="tel:+12673355234">Call 267-335-5234 · Mon–Sat 9:30–7</a></nav>
  </div>
</header>
<!--/md:header-->`;
}

function footer(p) {
  return `<!--md:footer-->
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <p style="font-family:var(--serif);font-size:30px;line-height:1.15;color:#fff8ec;margin-bottom:18px">Polished, <em style="color:var(--gold-hi)">with a pour.</em></p>
        <p>Manicures, gel, SNS dip, acrylics and spa pedicures in Roxborough and Conshohocken, with complimentary wine, beer and soft drinks.</p>
        <p><a href="tel:+12673355234" style="font-size:20px">267-335-5234</a><br><a href="mailto:modishnailsparox@gmail.com" class="tiny">modishnailsparox@gmail.com</a></p>
      </div>
      <div><h4>Visit</h4><ul><li><a href="${p}book/">Book a visit</a></li><li><a href="${p}menu/">Menu &amp; prices</a></li><li><a href="${p}looks/">Lookbook</a></li><li><a href="${p}#waitlist">Walk-in waitlist</a></li></ul></div>
      <div><h4>Treat someone</h4><ul><li><a href="${p}gift-cards/">Gift cards</a></li><li><a href="${p}parties/">Parties &amp; bridal</a></li><li><a href="https://www.google.com/search?q=Modish+Nail+Spa+7126+Ridge+Ave+Philadelphia+PA+19128">Google reviews</a></li><li><a href="https://www.yelp.com/biz/modish-nail-spa-philadelphia">Yelp</a> · <a href="https://www.facebook.com/ModishNailSpaRox/">Facebook</a></li></ul></div>
      <div><h4>Spas</h4><p class="small"><a href="${p}nail-salon-roxborough/">7126 Ridge Ave<br>Roxborough, Philadelphia 19128</a></p><p class="small">34 Ridge Pike<br>Conshohocken, PA 19428</p><p class="small">Mon–Sat 9:30 am – 7 pm<br>Sunday closed</p></div>
    </div>
    <div class="foot-mark" aria-hidden="true">MODISH</div>
    <div class="foot-base"><span>© <span data-year>2026</span> Modish Nail Spa · Concept by Future Basics</span><span>Complimentary wine &amp; beer for guests 21+</span></div>
  </div>
</footer>
<script src="${p}assets/site.js" defer></script>
<!--/md:footer-->`;
}

const FINGERPRINT = ["assets/site.css", "assets/site.js", "owner/owner.css", "owner/owner.js"];
const version = Object.fromEntries(FINGERPRINT.flatMap((f) => {
  try { return [[f.split("/").pop(), createHash("sha1").update(readFileSync(join(root, f))).digest("hex").slice(0, 8)]]; } catch { return []; }
}));
const stamp = (html) => html.replace(/((?:href|src)="[^"]*?\b(site\.css|site\.js|owner\.css|owner\.js))(\?v=[0-9a-f]+)?"/g, (m, url, name) => version[name] ? `${url}?v=${version[name]}"` : m);

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
    .replace(/<!--md:header-->[\s\S]*?<!--\/md:header-->/, header(p, page))
    .replace(/<!--md:footer-->[\s\S]*?<!--\/md:footer-->/, footer(p));
  writeFileSync(file, stamp(html));
  console.log("synced", rel);
}

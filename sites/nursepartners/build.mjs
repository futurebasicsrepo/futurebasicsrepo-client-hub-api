// Re-syncs the shared header, footer and scripts into every page.
// Pages are plain HTML and are both the source and the output: anything between
// <!--np:header--> … <!--/np:header--> (and the footer pair) is rewritten.
// Run: node sites/nursepartners/build.mjs
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const NAV = [
  ["south-philadelphia-home-care/", "Home Care"],
  ["dementia-care/", "Dementia Care"],
  ["paying-for-care/", "Paying for Care"],
  ["referral-partners/", "For Professionals"],
  ["careers/", "Careers"],
];
const I = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>',
};

function header(p, page) {
  const nav = NAV.map(([href, label]) => `<a href="${p}${href}"${page === href ? ' aria-current="page"' : ""}>${label}</a>`).join("\n      ");
  return `<!--np:header-->
<a class="skip" href="#main">Skip to content</a>
<div class="concept"><div class="wrap"><span>Concept site by <b>Future Basics</b> for NursePartners · rates and demo data are illustrative · <a href="${p}agency-console/">See the agency console →</a></span><button type="button" aria-label="Hide this note">×</button></div></div>
<header class="site-head">
  <div class="wrap head-row">
    <a class="logo" href="${p}" aria-label="NursePartners home"><img src="${p}assets/logo.png" alt="NursePartners" width="219" height="34"></a>
    <nav class="nav" id="nav" aria-label="Main">
      ${nav}
      <a class="nav-phone" href="tel:+16103239800">Call (610) 323-9800</a>
    </nav>
    <div class="head-cta">
      <a class="phone-link" href="tel:+16103239800"><small><span class="dot"></span><span data-office>Nurse on call 24/7</span></small>(610) 323-9800</a>
      <a class="btn btn-primary btn-sm" href="${p}free-assessment/">Free assessment</a>
    </div>
    <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav"><span></span></button>
  </div>
</header>
<!--/np:header-->`;
}

function footer(p) {
  return `<!--np:footer-->
<footer class="site-foot">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a class="foot-logo" href="${p}"><img src="${p}assets/logo.png" alt="NursePartners" width="168" height="26"></a>
        <p>Nurse-led, CNA-only home care and dementia care across Philadelphia and its suburbs since 2002. Licensed by the Pennsylvania Department of Health. Woman-owned.</p>
        <p><a href="tel:+16103239800" style="font-weight:800;font-size:20px">${I.phone.replace("<svg", '<svg width="18" height="18" style="vertical-align:-3px;margin-right:6px"')}(610) 323-9800</a><br><span class="tiny">Answered 24/7 by a clinician on call</span></p>
        <div class="affils"><span>PA Health Care Association</span><span>WBE Certified</span><span>Positive Approach to Care</span><span>Independence Business Alliance</span></div>
      </div>
      <div>
        <h4>Care</h4>
        <ul>
          <li><a href="${p}south-philadelphia-home-care/">Home care in South Philly</a></li>
          <li><a href="${p}dementia-care/">Dementia care (GEMS)</a></li>
          <li><a href="${p}free-assessment/">Free in-home assessment</a></li>
          <li><a href="${p}family-updates/">Weekly family updates</a></li>
        </ul>
      </div>
      <div>
        <h4>Help</h4>
        <ul>
          <li><a href="${p}paying-for-care/">Paying for care</a></li>
          <li><a href="${p}paying-for-care/#calculator">Cost calculator</a></li>
          <li><a href="${p}paying-for-care/#eligibility">Benefits checker</a></li>
          <li><a href="${p}referral-partners/">Refer a patient</a></li>
          <li><a href="${p}careers/">CNA careers</a></li>
        </ul>
      </div>
      <div>
        <h4>Offices</h4>
        <p class="small">100 E. Penn Square, Suite 400<br>Philadelphia, PA 19107</p>
        <p class="small">1200 East High Street, Suite 109<br>Pottstown, PA 19464</p>
      </div>
    </div>
    <div class="foot-mark" aria-hidden="true">Still home<i>.</i></div>
    <div class="foot-base">
      <span>© <span data-year>2026</span> NursePartners, Inc. · Concept by Future Basics</span>
      <span>Please don't send medical information by text, chat or email. We'll ask privately at your assessment.</span>
    </div>
  </div>
</footer>
<script src="${p}assets/site.js" defer></script>
<!--/np:footer-->`;
}

function pages(dir) {
  return readdirSync(dir).flatMap((f) => {
    const full = join(dir, f);
    if (statSync(full).isDirectory()) return f.startsWith("_") || f === "assets" ? [] : pages(full);
    return f.endsWith(".html") ? [full] : [];
  });
}

// Fingerprint CSS/JS links with a hash of their contents (site.css?v=3fa9c1), so a browser
// holding an old copy fetches the new file the moment it changes. Run this after editing them.
const FINGERPRINT = ["assets/site.css", "assets/site.js", "agency-console/console.css", "agency-console/console.js"];
const version = Object.fromEntries(FINGERPRINT.map((f) => [f.split("/").pop(), createHash("sha1").update(readFileSync(join(root, f))).digest("hex").slice(0, 8)]));
const stamp = (html) => html.replace(/((?:href|src)="[^"]*?\b(site\.css|site\.js|console\.css|console\.js))(\?v=[0-9a-f]+)?"/g, (_, url, name) => `${url}?v=${version[name]}"`);

for (const file of pages(root)) {
  const rel = relative(root, file);
  const depth = rel.split(sep).length - 1;
  const p = depth ? "../".repeat(depth) : "./";
  const page = depth ? rel.split(sep).slice(0, -1).join("/") + "/" : "";
  let html = readFileSync(file, "utf8");
  html = html
    .replace(/<!--np:header-->[\s\S]*?<!--\/np:header-->/, header(p, page))
    .replace(/<!--np:footer-->[\s\S]*?<!--\/np:footer-->/, footer(p));
  html = stamp(html);
  writeFileSync(file, html);
  console.log("synced", rel);
}

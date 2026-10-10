// Server-rendered pages. No build step: each page is one HTML string with
// inline CSS and a small inline script. Everything interpolated from a cart
// goes through esc(), and data handed to scripts goes through json().
import { HOME_SCREEN_TAGS } from './appicon.js';
import { AUTH_TOLERANCE_BPS, AUTH_TOLERANCE_MAX_CENTS, cssSafe, usd } from './cart.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Safe inside <script>: blocks </script> and HTML comment tricks.
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const CSS = `
:root{--bg:#fbf7f1;--card:#fff;--ink:#1b1712;--muted:#6f675c;--line:#e8e0d4;--spot:#ff5a36;--spot-ink:#fff;--ok:#1d8a52;--warn:#b25b00;--radius:18px}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--card:#1e1b18;--ink:#f4efe8;--muted:#a79e92;--line:#322d27;--spot:#ff6a47}}
*{box-sizing:border-box}[hidden]{display:none!important}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 ui-sans-serif,-apple-system,"SF Pro Text",Inter,system-ui,sans-serif}
main{max-width:520px;margin:0 auto;padding:20px 16px 64px}
a{color:inherit}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:-.02em;font-size:20px;text-decoration:none}
.dot{width:22px;height:22px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 5px color-mix(in srgb,var(--spot) 22%,transparent)}
h1{font-size:34px;line-height:1.05;letter-spacing:-.03em;margin:28px 0 10px}
h2{font-size:18px;margin:0 0 12px;letter-spacing:-.01em}
p.lead{color:var(--muted);margin:0 0 22px;font-size:17px}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px;margin:14px 0}
.tabs{display:flex;gap:6px;background:var(--line);padding:4px;border-radius:14px;margin-bottom:14px}
.tabs button{flex:1;border:0;background:transparent;padding:10px 6px;border-radius:10px;font:inherit;font-weight:600;color:var(--muted);cursor:pointer}
.tabs button[aria-selected=true]{background:var(--card);color:var(--ink);box-shadow:0 1px 2px #0001}
label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px}
input,textarea,select{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:12px}
input:focus,textarea:focus{outline:2px solid var(--spot);outline-offset:1px;border-color:transparent}
.row{display:flex;gap:10px}.row>*{flex:1;min-width:0}
.btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:14px;padding:15px 18px;font:inherit;font-weight:700;font-size:17px;cursor:pointer;text-decoration:none;background:var(--spot);color:var(--spot-ink);margin-top:14px}
.btn.dark{background:var(--ink);color:var(--bg)}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
.btn:disabled{opacity:.5;cursor:default}
.btn.small{padding:9px 12px;font-size:14px;width:auto;margin:0}
.items{list-style:none;margin:0;padding:0}
.item{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.item:last-child{border-bottom:0}
.thumb{width:56px;height:56px;border-radius:12px;background:var(--line) center/cover no-repeat;flex:none}
.item .t{font-weight:600}.item .v{color:var(--muted);font-size:14px}
.item .p{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.sum{display:flex;justify-content:space-between;color:var(--muted);padding:3px 0;font-variant-numeric:tabular-nums}
.sum.total{color:var(--ink);font-weight:800;font-size:20px;padding-top:10px;border-top:1px solid var(--line);margin-top:8px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:5px 10px;border-radius:99px;background:var(--line)}
.pill.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}
.pill.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.muted{color:var(--muted)}.small{font-size:13px}
.err{color:#c62828;font-weight:600;margin-top:10px;min-height:1em}
.edit-item{display:grid;grid-template-columns:1fr 64px 34px;gap:6px;align-items:center;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid var(--line)}
.edit-item [data-f=title]{grid-column:1/-1}
.found{border:1px solid var(--line);border-radius:14px;padding:10px;margin:4px 0 6px}.found .thumb{width:72px;height:72px}.found a{font-size:13px;font-weight:600;color:var(--muted)}
.edit-item input{padding:10px}
.x{border:0;background:transparent;font-size:20px;color:var(--muted);cursor:pointer}
.linkbox{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:10px 12px;word-break:break-all;font-weight:600}
.cc{border-radius:16px;padding:18px;color:#fff;background:linear-gradient(135deg,#ff5a36,#ff8a3d 60%,#ffb347);font-family:ui-monospace,Menlo,monospace;box-shadow:0 10px 30px #ff5a3640}
.cc .n{font-size:20px;letter-spacing:.08em;margin:22px 0 10px}
.cc .meta{display:flex;justify-content:space-between;font-size:13px;opacity:.9}
.hero-note{display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,var(--spot) 10%,transparent);border-radius:14px;padding:12px 14px;margin:12px 0;font-size:14px}
.bmhow{margin-top:12px;font-size:14px}.bmhow ol{margin:0 0 10px;padding-left:20px}.bmhow li{margin:4px 0}
.bm{display:inline-block;padding:8px 12px;border-radius:10px;background:var(--ink);color:var(--bg);font-weight:700;text-decoration:none;font-size:14px}
footer{margin-top:32px;color:var(--muted);font-size:13px;text-align:center}
.sandbox{background:#fff3cd;color:#6b4e00;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin:10px 0}
@media (prefers-color-scheme:dark){.sandbox{background:#3a2f10;color:#ffd97a}}
.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--spot);border-radius:50%;animation:rot .8s linear infinite;vertical-align:-1px}@keyframes rot{to{transform:rotate(360deg)}}
`;

function shell({ title, head = '', body, script = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="theme-color" content="#ff5a36">${HOME_SCREEN_TAGS}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%23ff5a36'/%3E%3C/svg%3E">
${head}<style>${CSS}</style></head><body><main>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

const SHARED_JS = `
const $=(s,r=document)=>r.querySelector(s);
const usd=c=>'$'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function api(path,body,method){const r=await fetch(path,{method:method||(body?'POST':'GET'),headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Error '+r.status));return j}
`;

// ─── Home: the composer ─────────────────────────────────────────────────────
// One box, then one Send. The behaviour lives in src/client/home.js.
const HOME_CSS = `
.hero{display:flex;align-items:center;gap:12px;margin:18px 0 14px}
.hero svg{width:74px;height:74px;flex:none;animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-4px)}}
.hero .say{background:var(--card);border:1px solid var(--line);border-radius:20px 20px 20px 6px;padding:11px 15px;font-weight:800;font-size:19px;letter-spacing:-.01em}
.box{background:var(--card);border:2px solid var(--line);border-radius:22px;padding:12px;transition:border-color .15s}
.box:focus-within,.box.drop{border-color:var(--spot)}
.box textarea{border:0;background:transparent;resize:none;font-size:18px;padding:6px 4px;min-height:56px;outline:none}
.box textarea:focus{outline:none}
.boxrow{display:flex;align-items:center;gap:8px;margin-top:6px}
.iconbtn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:12px;padding:9px 12px;font-weight:600;font-size:14px;color:var(--muted);cursor:pointer;margin:0}
.boxrow .btn{margin:0 0 0 auto;width:auto;padding:11px 20px}
.chipbar{display:flex;align-items:center;gap:8px;background:var(--bg);border-radius:10px;padding:6px 10px;font-size:14px;margin-bottom:6px}
.chipbar button{margin-left:auto;border:0;background:none;font-size:18px;color:var(--muted);cursor:pointer}
.hint{color:var(--muted);font-size:14px;margin:10px 4px 0}
.shareimg{width:100%;aspect-ratio:1200/630;border-radius:18px;display:block;background:var(--line);border:1px solid var(--line)}
.people{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.chip{display:inline-flex;align-items:center;padding:10px 14px;border-radius:99px;background:var(--ink);color:var(--bg);font-weight:700;font-size:15px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
.chip.ghost{background:transparent;color:var(--ink);border:1px dashed var(--line)}
.sendrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px}
.sendrow .btn{margin:0;font-size:15px;padding:12px 8px}
.mine-row{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);text-decoration:none}
.mine-row:last-child{border-bottom:0}
.textlink{background:none;border:0;padding:0;color:var(--muted);text-decoration:underline;font:inherit;font-size:14px;cursor:pointer}
details.more{margin-top:14px}details.more summary{cursor:pointer;font-weight:600;color:var(--muted)}
@media (hover:none){.desktop-only{display:none}}
@media (prefers-reduced-motion:reduce){.hero svg{animation:none}}
`;

export function homePage({ origin, provider, cfg }) {
  const bookmarklet = `javascript:location.href=${JSON.stringify(`${origin}/new?url=`)}+encodeURIComponent(location.href)`;
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div class="hero">${buddySvg(false)}<div class="say" id="say" aria-live="polite">what do you want?</div></div>
${provider === 'sandbox' ? '<div class="sandbox">Test mode: no real money moves.</div>' : ''}

<section id="compose">
  <div class="box" id="box">
    <div class="chipbar" id="chip" hidden><span id="chipName"></span><button id="chipX" aria-label="Remove screenshot">×</button></div>
    <textarea id="q" rows="2" autocomplete="off" placeholder="paste a link, drop a screenshot, or say what you want" aria-label="What do you want?"></textarea>
    <div class="boxrow">
      <label class="iconbtn" for="shot">📷 screenshot</label><input id="shot" type="file" accept="image/*" hidden>
      <button class="btn" id="go">Spot it</button>
    </div>
  </div>
  <div class="err" id="capErr"></div>
  <div class="card" id="basket" hidden></div>
  <p class="hint">Someone taps your link and covers it, and the store gets the order. You can put carts from up to 5 stores in one link.</p>
</section>

<section id="check" hidden>
  <div class="card">
    <p class="small" id="checkMsg" style="margin:0 0 6px;color:var(--warn)"></p>
    <div class="item found" id="found" hidden></div>
    <label for="merchant">Store</label><input id="merchant" placeholder="Store name">
    <label>Items</label><div id="items"></div>
    <button class="btn ghost small" id="addItem" type="button">+ Add item</button>
    <label for="extras">Shipping + tax estimate</label><input id="extras" inputmode="decimal" placeholder="0.00">
    <div id="totals" style="margin-top:12px"></div>
    <div id="nameRow"><label for="name">Your name</label><input id="name" autocomplete="given-name" placeholder="so they know who's asking"></div>
    <details class="more"><summary>more options</summary>
      <label for="settle">How the money reaches you</label>
      <select id="settle"><option value="direct" id="optDirect" hidden>They pay the store directly (no Spot fee)</option><option value="card">Spot buys it and ships it to me</option><option value="handoff">Straight to my Venmo / Cash App</option></select>
      <div class="row"><div><label for="venmo">Venmo</label><input id="venmo" placeholder="@handle"></div><div><label for="cashtag">Cash App</label><input id="cashtag" placeholder="$cashtag"></div></div>
      <label for="note">Note for them</label><input id="note" maxlength="280" placeholder="birthday list 🎂">
      <label for="email">Email (optional, for updates)</label><input id="email" type="email" autocomplete="email">
      <p class="small"><button class="textlink" id="notMe" type="button">change my name</button></p>
    </details>
    <button class="btn" id="saveCheck">Looks good →</button>
    <button class="btn ghost" id="addStore" type="button">+ Add a cart from another store</button>
    <div class="err" id="checkErr"></div>
  </div>
</section>

<section id="ready" hidden>
  <img id="card" class="shareimg" alt="Your Spot share card">
  <div class="linkbox" style="margin-top:10px"><span id="linkText"></span></div>
  <button class="btn" id="send">Send</button>
  <div class="people" id="people"></div>
  <form id="personForm" class="card" hidden style="margin-top:10px">
    <div class="row"><div><label for="pName">Name</label><input id="pName" placeholder="Mom"></div><div><label for="pPhone">Phone</label><input id="pPhone" type="tel" inputmode="tel" placeholder="(555) 123-4567"></div></div>
    <button class="btn dark small" style="margin-top:10px">Save</button>
  </form>
  <div class="sendrow"><a class="btn ghost" id="txt">Text</a><a class="btn ghost" id="wa" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost" id="copy">Copy</button></div>
  <p class="small" id="shipNudge" hidden style="margin-top:12px">📦 One step before they can pay: <a id="shipLink" href="#">add where it ships</a>. They'll pay the store directly.</p>
  <p class="small muted" style="margin-top:14px;display:flex;justify-content:space-between;gap:10px"><button class="textlink" id="edit">edit cart</button><a id="manageLink" href="#">see who pays →</a><button class="textlink" id="again">start another</button></p>
</section>

<section id="mine" class="card" hidden><h2>My Spots</h2><div id="mineList"></div></section>

<section class="card desktop-only">
  <h2>Spot from any page</h2>
  <p class="small muted" style="margin-top:0">Drag this to your bookmarks bar. On any product page, click it.</p>
  <div data-bmwrap><a class="bm" href="${esc(bookmarklet)}" draggable="true" data-bm>● Spot this</a><div class="bmhow" hidden><ol><li>Show your bookmarks bar: <b>⌘ Shift B</b> (Mac) or <b>Ctrl Shift B</b> (Windows).</li><li>Drag <b>● Spot this</b> onto it.</li><li>Won’t drag? Right-click the bookmarks bar → <b>Add page…</b>, name it <b>Spot this</b>, and paste the code below as the URL.</li></ol><button type="button" class="btn ghost bmcopy">Copy the code</button></div></div><script>document.querySelectorAll('[data-bm]').forEach(a=>{const how=a.closest('[data-bmwrap]').querySelector('.bmhow');a.addEventListener('click',e=>{e.preventDefault();how.hidden=false});how.querySelector('.bmcopy').addEventListener('click',async ev=>{try{await navigator.clipboard.writeText(a.getAttribute('href'));ev.target.textContent='Copied ✓ now paste it as the URL'}catch{prompt('Copy this, then paste it as the bookmark URL:',a.getAttribute('href'))}})})</script>
</section>
<footer>Spot · cart links for anyone, anywhere<br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>
<script>window.SPOT=${json({ feeBps: cfg.feeBps, feeFixed: cfg.feeFixedCents, cardPct: cfg.cardPctBps || 0, cardFixed: cfg.cardFixedCents || 0, max: cfg.maxCartCents, cushionBps: AUTH_TOLERANCE_BPS, cushionMax: AUTH_TOLERANCE_MAX_CENTS, provider })}</script>
<script src="/client/home.js" defer></script>`;
  return shell({ title: 'Spot: cover my cart', body, head: `<meta name="description" content="Turn any cart into a link someone else can pay."><style>${HOME_CSS}</style>` });
}

// ─── Pay page (the link that gets shared) ───────────────────────────────────
// Spot, the mascot, does the asking: a short chat that says who wants what,
// then one big button. Money details sit behind "how this works".
const PAY_CSS = `
.chat{display:flex;flex-direction:column;gap:8px;margin:18px 0 6px}
.bub{align-self:flex-start;max-width:86%;background:var(--card);border:1px solid var(--line);padding:11px 15px;border-radius:20px 20px 20px 6px;font-size:17px;opacity:0;transform:translateY(8px) scale(.98);animation:pop .35s cubic-bezier(.2,.9,.3,1.2) forwards}
.bub.quote{background:color-mix(in srgb,var(--spot) 10%,var(--card));border-color:transparent;font-style:italic}
.bub.big{font-weight:800;font-size:20px;letter-spacing:-.01em}
@keyframes pop{to{opacity:1;transform:none}}
.buddy{display:flex;align-items:flex-end;gap:12px;margin-top:22px}
.buddy svg{width:92px;height:92px;flex:none;animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-4px)}}
.buddy .hi{font-weight:800;font-size:28px;letter-spacing:-.02em;line-height:1.05;padding-bottom:10px}
.pcard{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:10px;margin:0}
.pcard .thumb{width:72px;height:72px}
.pcard .t{font-weight:700;line-height:1.2}.pcard .v{color:var(--muted);font-size:14px}
.pcard .p{margin-left:auto;font-weight:800;font-variant-numeric:tabular-nums}
.act{padding:10px 0 4px}
.bub.costs{display:block;width:100%;max-width:none;box-sizing:border-box;padding:12px 16px}
.costs .cl{display:flex;justify-content:space-between;gap:12px;padding:4px 0;font-size:15px;font-variant-numeric:tabular-nums}
.costs .cl span{color:var(--muted)}.costs .cl small{display:block;font-size:12px;opacity:.85}
.costs .cl b{white-space:nowrap}.costs .tot{border-top:1px solid var(--line);margin-top:6px;padding-top:8px;font-size:16px}.costs .tot span{color:var(--ink);font-weight:700}
.nope{display:block;margin:10px auto 0;background:none;border:0;color:var(--muted);font:inherit;font-size:15px;text-decoration:underline;cursor:pointer;padding:4px 8px}
/* The pay button rides along at the bottom, so it's one tap from opening the link. */
.act.stick{position:sticky;bottom:0;z-index:5;margin:0 -16px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(to bottom,transparent,var(--bg) 18px)}
.act.stick:has(details[open]),.act.stick:has(input:focus){position:static;margin:0;padding:10px 0 4px;background:none}
.btn.go{font-size:19px;padding:17px;border-radius:18px;box-shadow:0 10px 24px color-mix(in srgb,var(--spot) 35%,transparent)}
.btn.go:active{transform:scale(.98)}
.namefield{display:flex;gap:8px;align-items:center;margin-top:6px}
.namefield input{padding:10px 12px}
details{margin-top:8px;color:var(--muted);font-size:14px}
details summary{cursor:pointer;font-weight:600}
details .sum{font-size:14px}
.or{text-align:center;color:var(--muted);font-size:14px;margin:10px 0}
#cardBox summary::-webkit-details-marker{display:none}
.bub.who{background:transparent;border:0;padding:2px 0;max-width:100%}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:700;padding:6px 10px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.chip.ai{background:color-mix(in srgb,#4b7bff 12%,var(--card));border-color:transparent}
.chip.ok{background:color-mix(in srgb,var(--ok,#1d8a52) 14%,var(--card));border-color:transparent;color:var(--ok,#1d8a52)}
.whynote{font-size:13px;color:var(--muted);margin:6px 2px 0}
.lock{margin:14px 0 4px;padding:14px;border-radius:20px;background:var(--card);border:1px solid var(--line)}
.lock.direct{padding:12px 14px}
.lk-row{display:flex;gap:10px;align-items:flex-start;font-size:15px}
.lk-i{font-size:18px}
.lk-card{position:relative;overflow:hidden;border-radius:16px;padding:14px 16px;color:#fff;background:linear-gradient(135deg,#221d18 0%,#3a2a20 60%,var(--spot) 160%);box-shadow:0 12px 26px -14px rgba(0,0,0,.6);aspect-ratio:1.9/1;max-height:180px;display:flex;flex-direction:column;justify-content:space-between}
.lk-card:after{content:'';position:absolute;right:-30px;top:-30px;width:120px;height:120px;border-radius:50%;background:var(--spot);opacity:.35}
.lk-top{display:flex;align-items:center;gap:8px;font-weight:700;font-size:13px;letter-spacing:.02em;opacity:.9}
.lk-top .dot{width:14px;height:14px;border-radius:50%;background:var(--spot);display:inline-block}
.lk-store{font-weight:800;font-size:22px;letter-spacing:-.01em;position:relative}
.lk-bot{display:flex;justify-content:space-between;font-size:13px;opacity:.85;font-variant-numeric:tabular-nums;position:relative}
.lk-list{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:7px;font-size:14px}
.lk-list li{position:relative;padding-left:24px;line-height:1.35}
.lk-list li:before{content:'✓';position:absolute;left:0;top:0;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;color:#fff;background:var(--ok,#1d8a52)}
.confetti{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.confetti i{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:fall 1.6s ease-in forwards}
@keyframes fall{to{transform:translateY(105vh) rotate(540deg);opacity:.8}}
@media (prefers-reduced-motion:reduce){.bub{animation:none;opacity:1;transform:none}.buddy svg{animation:none}}
`;

// Inline, animatable version of the mascot: pupils follow the pointer
// (desktop) or glance at the button (phone); swaps to a happy face on pay.
export function buddySvg(happy) {
  return `<svg viewBox="0 0 200 200" aria-hidden="true" id="buddy" class="${happy ? 'happy' : ''}">
<ellipse cx="100" cy="188" rx="50" ry="7" fill="currentColor" opacity=".08"/>
<circle cx="100" cy="100" r="78" fill="var(--spot)"/><circle cx="72" cy="68" r="20" fill="#fff" opacity=".18"/>
<g class="open" ${happy ? 'style="display:none"' : ''}>
<ellipse cx="78" cy="90" rx="15" ry="17" fill="#fff"/><ellipse cx="122" cy="90" rx="15" ry="17" fill="#fff"/>
<g class="pupils"><circle cx="78" cy="92" r="8" fill="#1b1712"/><circle cx="122" cy="92" r="8" fill="#1b1712"/><circle cx="81" cy="89" r="2.6" fill="#fff"/><circle cx="125" cy="89" r="2.6" fill="#fff"/></g>
<path d="M88 122 q12 9 24 0" stroke="#1b1712" stroke-width="5" fill="none" stroke-linecap="round"/></g>
<g class="joy" ${happy ? '' : 'style="display:none"'}>
<path d="M67 92 q11 -13 22 0M111 92 q11 -13 22 0" stroke="#1b1712" stroke-width="6" fill="none" stroke-linecap="round"/>
<path d="M82 118 q18 24 36 0" fill="#1b1712"/></g>
<circle cx="60" cy="116" r="9" fill="#ff9a7e"/><circle cx="140" cy="116" r="9" fill="#ff9a7e"/></svg>`;
}

export function payPage({ cart, links, provider, pageUrl, commission = false }) {
  const name = cart.requester.name;
  const open = cart.status === 'open';
  const covered = ['paid', 'card_issued', 'completed'].includes(cart.status);
  const first = cart.items[0];
  const total = usd(cart.settle === 'card' ? cart.total_cents : cart.cart_cents);
  const ogTitle = covered ? `${cart.payer_name || 'Someone'} spotted ${name}! 🎉` : `psst… can you spot ${name} ${total}?`;
  const ogDesc = `${first.title}${cart.items.length > 1 ? ` + ${cart.items.length - 1} more` : ''} from ${cart.merchant.name} · ${total} all in · ${cart.settle === 'direct' ? 'pay the store in one tap' : 'one tap with Apple Pay'}`;
  const head = `
<meta property="og:type" content="website"><meta property="og:site_name" content="Spot">
<meta property="og:title" content="${esc(ogTitle)}"><meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(pageUrl)}/card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(`${ogTitle} ${ogDesc}`)}">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<style>${PAY_CSS}</style>
${provider === 'stripe' && cart.settle === 'card' && open ? '<script src="https://js.stripe.com/v3/"></script>' : ''}`;

  const products = cart.items
    .map(
      (i) => `<div class="pcard bub"><div class="thumb" ${i.image_url ? `style="background-image:url('${esc(cssSafe(i.image_url))}')"` : ''}></div>
<div><div class="t">${esc(i.title)}</div><div class="v">${esc([i.variant, i.quantity > 1 ? `×${i.quantity}` : ''].filter(Boolean).join(' · '))}</div></div>
<div class="p">${usd(i.price_cents * i.quantity)}</div></div>`,
    )
    .join('');

  let lines;
  if (covered) {
    lines = [`<div class="bub big">${esc(cart.payer_name || 'Someone')} already spotted ${esc(name)} 🎉</div>`, `<div class="bub">nothing left to do here. you're all good.</div>`];
  } else if (!open) {
    const why = { expired: 'this link expired', canceled: `${esc(name)} canceled this one`, refunded: 'this one was refunded' }[cart.status] || 'this link is closed';
    lines = [`<div class="bub big">oh! ${why}.</div>`, `<div class="bub">ask ${esc(name)} for a fresh one 🙂</div>`];
  } else {
    lines = [
      `<div class="bub">${esc(name)} found something at <b>${esc(cart.merchant.name)}</b> and is hoping you'll spot them</div>`,
      cart.note ? `<div class="bub quote">“${esc(cart.note)}” — ${esc(name)}</div>` : '',
      whoBox(cart),
      products,
      costs(cart),
      `<div class="bub big">it's ${total} all in. want to cover it?</div>`,
    ];
  }
  // stagger the pop-in
  let n = 0;
  const chat = lines.join('').replace(/class="(pcard )?bub/g, (m) => `style="animation-delay:${(0.15 + 0.32 * n++).toFixed(2)}s" ${m}`);

  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div class="buddy">${buddySvg(covered)}<div class="hi">${covered ? 'yay!' : open ? 'hey 👋' : 'hmm…'}</div></div>
<div class="chat" id="chat">${chat}</div>
${open ? lockCard(cart) : ''}
${open ? `<div class="act${cart.settle === 'handoff' ? '' : ' stick'}" id="act">${actionBox(cart, links, provider, total)}${commission ? `<p class="small muted" style="text-align:center;margin:6px 0 0">Spot may earn a commission from ${esc(cart.merchant.name)}. Your price is the same.</p>` : ''}${cart.for === 'self' || cart.kind === 'flight' || cart.kind === 'train' || cart.bundle_id ? '' : '<button type="button" class="nope" id="nope">Not this time</button>'}</div>` : ''}
${open && cart.settle === 'card' && provider === 'sandbox' ? '<div class="sandbox">Test mode: no real money moves.</div>' : ''}
${open ? detailsBox(cart) : ''}
<footer>By paying you agree to Spot’s <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>.<br><a href="/">make your own Spot</a></footer>`;

  const script = `${SHARED_JS}
const buddy=$('#buddy'),pupils=buddy&&buddy.querySelector('.pupils');
function look(x,y){if(!pupils)return;const r=buddy.getBoundingClientRect(),dx=x-(r.left+r.width/2),dy=y-(r.top+r.height/2),d=Math.hypot(dx,dy)||1,k=Math.min(7,d/30);pupils.setAttribute('transform','translate('+(dx/d*k).toFixed(1)+' '+(dy/d*k).toFixed(1)+')')}
addEventListener('pointermove',e=>look(e.clientX,e.clientY),{passive:true});
const go=$('#go');if(go){const g=()=>{const r=go.getBoundingClientRect();look(r.left+r.width/2,r.top+r.height/2)};setTimeout(g,1600)}
function celebrate(payer){
  buddy.querySelector('.open').style.display='none';buddy.querySelector('.joy').style.display='';
  $('.buddy .hi').textContent='yay!';
  $('#chat').insertAdjacentHTML('beforeend','<div class="bub big" style="animation-delay:.1s">you\\'re the best'+(payer?', '+esc(payer):'')+' 🧡</div><div class="bub" style="animation-delay:.45s">I just told '+${json(esc(name))}+'. '+${json(cart.settle === 'direct' ? 'the store has the order.' : 'Spot orders it for them now.')}+'</div>');
  const a=$('#act');if(a)a.remove();const d=$('details');if(d)d.remove();
  const c=document.createElement('div');c.className='confetti';const cols=['#ff5a36','#ffb347','#1d8a52','#4b7bff','#ffd23f'];
  for(let i=0;i<70;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'vw';p.style.background=cols[i%cols.length];p.style.animationDelay=Math.random()*.4+'s';p.style.animationDuration=1.2+Math.random()+'s';c.appendChild(p)}
  document.body.appendChild(c);setTimeout(()=>c.remove(),3000);scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
}
const nope=$('#nope');if(nope)nope.onclick=async()=>{if(!confirm('Let '+${json(name)}+' know you can’t spot this one?'))return;nope.disabled=true;
  try{const nm=$('#payer');await api('/v1/carts/'+${json(cart.token)}+'/decline',{name:nm?nm.value:''});
    const a=$('#act');if(a)a.remove();const d=$('details');if(d)d.remove();const l=document.querySelector('.lock');if(l)l.remove();
    $('#chat').insertAdjacentHTML('beforeend','<div class="bub big" style="animation-delay:.1s">no worries 💛</div><div class="bub" style="animation-delay:.45s">I let '+${json(esc(name))}+' know. nothing was charged.</div>')}
  catch(e){nope.disabled=false;alert(e.message)}};
${open && cart.settle === 'card' ? payScript(cart, provider) : ''}
${open && cart.settle === 'direct' ? directScript(cart) : ''}`;
  return shell({ title: ogTitle, head, body, script });
}

// Where every dollar goes, shown before anyone pays: the items, the
// store's shipping and tax, the room for tax that comes back, card
// processing, and Spot's own fee.
function costs(cart) {
  const row = (label, cents, note) => `<div class="cl"><span>${label}${note ? `<small>${note}</small>` : ''}</span><b>${usd(cents)}</b></div>`;
  const store = esc(cart.merchant.name);
  const card = cart.settle === 'card';
  const rows = [row(cart.items.length > 1 ? `${cart.items.length} items` : 'Item', cart.subtotal_cents)];
  if (cart.extras_cents) rows.push(row('Shipping + tax', cart.extras_cents, cart.settle === 'direct' ? `${store} shows the exact amount` : `${store}’s estimate`));
  if (card && cart.cushion_cents) rows.push(row('Room for price changes', cart.cushion_cents, 'unused comes back to you'));
  if (card && cart.fee_cents) {
    const keep = cart.fee_keep_cents;
    if (keep != null && keep < cart.fee_cents) {
      rows.push(row('Card processing', cart.fee_cents - keep, 'card network, not Spot'));
      rows.push(row('Spot fee', keep));
    } else rows.push(row('Spot fee', cart.fee_cents, 'includes card processing'));
  } else rows.push(`<div class="cl"><span>Spot fee</span><b>none</b></div>`);
  const total = card ? cart.total_cents : cart.cart_cents;
  return `<div class="bub costs" aria-label="Where your money goes">${rows.join('')}<div class="cl tot"><span>Total</span><b>${usd(total)}</b></div></div>`;
}

// Who's behind this ask: the AI that found it, the person who sent it (and
// whether their account is verified), or the store button it came from.
function whoBox(cart) {
  const name = esc(cart.requester.name);
  const chips = [];
  if (cart.built_by) chips.push(`<span class="chip ai">🤖 Found by ${esc(cart.built_by.charAt(0).toUpperCase() + cart.built_by.slice(1))}</span>`);
  if (cart.source) chips.push(`<span class="chip">🛍️ From ${esc(cart.source.name || cart.merchant.name)}’s checkout${cart.source.verified ? ' ✓' : ''}</span>`);
  chips.push(`<span class="chip${cart.requester_verified ? ' ok' : ''}">${cart.requester_verified ? '✓' : '🙋'} Sent by ${name}${cart.requester_verified ? ' · verified' : ''}</span>`);
  const note = cart.via_approver
    ? `${name}’s spending rules sent this to you to OK. Nothing is bought unless you pay.`
    : cart.requester_verified
      ? `${name} signed in to Spot with a code to their phone or email.`
      : '';
  return `<div class="bub who"><div class="chips">${chips.join('')}</div>${note ? `<div class="whynote">${note}</div>` : ''}</div>`;
}

// What the payer's money can do, shown as the card itself: Spot's one-time
// card is locked to this store, capped at this order and closed after one
// use, and whatever the store doesn't charge comes back. Paying the store
// directly: Spot never touches the money at all.
function lockCard(cart) {
  const store = esc(cart.merchant.name);
  if (cart.settle === 'direct') {
    return `<div class="lock direct"><div class="lk-row"><span class="lk-i">🔒</span><span>You pay <b>${store}</b> on its own checkout. Spot never touches your money.</span></div></div>`;
  }
  if (cart.settle !== 'card' || !cart.card_limit_cents) return '';
  return `<div class="lock" aria-label="Where your money goes">
<div class="lk-card"><div class="lk-top"><span class="dot"></span>Spot · one-time card</div>
<div class="lk-store">only at ${store}</div>
<div class="lk-bot"><span>max ${usd(cart.card_limit_cents)}</span><span>for ${esc(cart.requester.name)}</span></div></div>
<ul class="lk-list">
<li>Spot buys exactly these items. Your money can’t become cash or anything else.</li>
<li>Works once, only at ${store}, for up to ${usd(cart.card_limit_cents)}: the items plus room for tax. Then it’s closed.</li>
<li>Whatever ${store} doesn’t charge comes back to you, automatically.</li>
<li>Not ordered within 3 days? You get it all back.</li>
</ul></div>`;
}

function actionBox(cart, links, provider, total) {
  const name = esc(cart.requester.name);
  if (cart.settle === 'handoff') {
    return links
      .map((l, i) => `<a class="btn go ${i ? 'dark' : ''}" ${i ? '' : 'id="go"'} href="${esc(l.url)}" rel="noopener">Send ${total} on ${l.kind === 'venmo' ? 'Venmo' : 'Cash App'}</a>`)
      .join('');
  }
  if (cart.settle === 'direct') {
    const store = esc(cart.merchant.name);
    const alt = links.length ? `<p class="small muted" style="text-align:center;margin:10px 0 0">or send it straight to them: ${links.map((l) => `<a href="${esc(l.url)}">${l.kind === 'venmo' ? 'Venmo' : 'Cash App'}</a>`).join(' · ')}</p>` : '';
    if (!cart.pay_at_store?.ready) {
      return `<button class="btn go" id="go" disabled>Waiting for ${name} to add where it ships</button><p class="small muted" style="text-align:center;margin:10px 0 0">Check back in a bit. This page updates by itself.</p>${alt}`;
    }
    return `<div class="namefield"><input id="payer" maxlength="60" placeholder="your name (optional)" aria-label="Your name (optional)"></div>
<button class="btn go" id="go">Pay ${store} ${total}</button>
<p class="small muted" style="text-align:center;margin:10px 0 0">You pay ${store} on its own checkout, with its shipping to ${name} already filled in. Spot never touches your money and adds no fee.</p><div class="err" id="payErr"></div>${alt}`;
  }
  const fallback = links.length ? `<p class="small muted" style="text-align:center;margin:10px 0 0">or send it straight to them: ${links.map((l) => `<a href="${esc(l.url)}">${l.kind === 'venmo' ? 'Venmo' : 'Cash App'}</a>`).join(' · ')}</p>` : '';
  if (provider === 'sandbox') {
    return `<div class="namefield"><input id="payer" maxlength="60" placeholder="your name (optional)" aria-label="Your name (optional)"></div>
<button class="btn go" id="go">Spot ${name} ${total}</button><div class="err" id="payErr"></div>${fallback}`;
  }
  // Wallet buttons first: one tap, and the wallet supplies the payer's name.
  return `<div id="express"></div><div class="or" id="orCard" hidden>or pay with card</div>
<details id="cardBox"><summary class="btn ghost" style="list-style:none">Pay with card</summary><div id="stripeEl" style="margin-top:12px"></div><button class="btn go" id="go" disabled>Spot ${name} ${total}</button></details>
<div class="err" id="payErr"></div>${fallback}`;
}

function detailsBox(cart) {
  const card = cart.settle === 'card';
  if (cart.settle === 'direct') {
    return `<details><summary>how this works</summary>
<p>You pay ${esc(cart.merchant.name)} directly, on its own checkout page. Spot sets it up with exactly these items shipped to ${esc(cart.requester.name)}, so you'll see their shipping address there. ${esc(cart.merchant.name)} is the seller: its receipt, returns and support apply, and Spot never holds your money or card.</p>
<div class="sum"><span>Items</span><span>${usd(cart.subtotal_cents)}</span></div>
${cart.extras_cents ? `<div class="sum"><span>Shipping + tax (est.)</span><span>${usd(cart.extras_cents)}</span></div>` : ''}
<div class="sum"><span>Spot fee</span><span>none</span></div>
<div class="sum"><b>About</b><b>${usd(cart.cart_cents)}</b></div><p class="small muted" style="margin:6px 0 0">${esc(cart.merchant.name)} shows the exact total before you pay.</p></details>`;
  }
  return `<details><summary>how this works</summary>
<p>${card ? (cart.kind === 'flight' ? `You're buying this ticket from Spot, and Spot books it with ${esc(cart.merchant.name)}.` : `You're buying this from Spot as a gift for ${esc(cart.requester.name)}. Spot orders exactly these items from ${esc(cart.merchant.name)} and ships them to ${esc(cart.requester.name)}. Nobody gets cash or a card. Changed your mind? Cancel for a full refund until it's ordered, from the link in your receipt.`) : `This goes straight to ${esc(cart.requester.name)}. Spot never touches the money and charges nothing.`}</p>
<div class="sum"><span>Items</span><span>${usd(cart.subtotal_cents)}</span></div>
${cart.extras_cents ? `<div class="sum"><span>Shipping + tax (est.)</span><span>${usd(cart.extras_cents)}</span></div>` : ''}
${cart.cushion_cents ? `<div class="sum"><span>Tax and price changes (unused comes back)</span><span>up to ${usd(cart.cushion_cents)}</span></div>` : ''}
${cart.fee_cents ? `<div class="sum"><span>Spot fee</span><span>${usd(cart.fee_cents)}</span></div>` : ''}
<div class="sum"><b>Total</b><b>${usd(card ? cart.total_cents : cart.cart_cents)}</b></div></details>`;
}

// Pay at the store: Spot builds the store's checkout, then this page sends
// the payer there. Back on this page, it watches for the store's order.
function directScript(cart) {
  return `const T=${json(cart.token)};
const watch=async()=>{for(let i=0;i<240;i++){try{const r=await api('/v1/carts/'+T+'/direct/status');if(r.cart.status==='completed'){celebrate(r.cart.payer_name||'');return}}catch{}await new Promise(z=>setTimeout(z,5000))}};
${cart.pay_at_store?.started ? 'watch();' : ''}
${cart.pay_at_store?.ready ? '' : "setTimeout(()=>location.reload(),15000);"}
if(go&&!go.disabled)go.onclick=async()=>{go.disabled=true;go.textContent='opening '+${json(cart.merchant.name)}+'…';$('#payErr').textContent='';
  try{const r=await api('/v1/carts/'+T+'/direct/start',{name:$('#payer').value.trim()});watch();location.href=r.continue_url}
  catch(e){$('#payErr').textContent=e.message;go.disabled=false;go.textContent='Try again'}};`;
}

function payScript(cart, provider, base = '/v1/carts/') {
  if (provider === 'sandbox') {
    return `$('#go').onclick=async()=>{const b=$('#go');b.disabled=true;b.textContent='spotting…';try{const name=$('#payer').value.trim();await api(${json(base)}+${json(cart.token)}+'/sandbox-pay',{payer_name:name});celebrate(name)}catch(e){$('#payErr').textContent=e.message;b.disabled=false;b.textContent='Try again'}};`;
  }
  return `(async()=>{try{
  const T=${json(cart.token)},B=${json(base)};const c=await api(B+T+'/pay',{});
  const stripe=Stripe(c.publishable_key);
  const elements=stripe.elements({clientSecret:c.client_secret,appearance:{theme:matchMedia('(prefers-color-scheme: dark)').matches?'night':'stripe',variables:{colorPrimary:'#ff5a36',borderRadius:'12px'}}});
  const settle=async(payer)=>{$('#payErr').textContent='';
    const {error}=await stripe.confirmPayment({elements,redirect:'if_required',confirmParams:{return_url:location.href}});
    if(error){$('#payErr').textContent=error.message;return false}
    for(let i=0;i<20;i++){const r=await api(B+T);if((r.cart||r.bundle).status!=='open')break;await new Promise(z=>setTimeout(z,1500))}
    celebrate(payer||'');return true};
  // Apple Pay / Google Pay / Link: shown only on devices that have one.
  const ex=elements.create('expressCheckout',{buttonHeight:52,buttonTheme:{applePay:'black',googlePay:'black'},buttonType:{applePay:'plain',googlePay:'plain'}});
  ex.on('ready',({availablePaymentMethods})=>{if(availablePaymentMethods){$('#orCard').hidden=false}else{$('#cardBox').open=true}});
  ex.on('confirm',async(ev)=>{const ok=await settle((ev.billingDetails?.name||'').split(' ')[0]);if(!ok)ev.paymentFailed&&ev.paymentFailed()});
  ex.mount('#express');
  elements.create('payment',{layout:'tabs',wallets:{applePay:'never',googlePay:'never'}}).mount('#stripeEl');$('#go').disabled=false;
  $('#go').onclick=async()=>{$('#go').disabled=true;$('#go').textContent='confirming…';if(!await settle('')){$('#go').disabled=false;$('#go').textContent='Try again'}};
}catch(e){$('#payErr').textContent=e.message}})();`;
}

// ─── The thank-you moment ───────────────────────────────────────────────────
// The requester writes it on their page; the payer sees it on their receipt.
const THX_CSS = `
.thx{background:color-mix(in srgb,var(--spot) 7%,var(--card));border-color:color-mix(in srgb,var(--spot) 22%,var(--line))}
.thx h2{font-size:20px;margin-bottom:4px}
.thx-row{display:flex;gap:8px;margin:12px 0 10px}
.thx-pick{flex:1;min-width:0;height:48px;font-size:24px;line-height:1;border-radius:14px;border:1px solid var(--line);background:var(--card);cursor:pointer;transition:transform .15s}
.thx-pick.on{border-color:var(--spot);background:color-mix(in srgb,var(--spot) 14%,var(--card));box-shadow:0 0 0 2px color-mix(in srgb,var(--spot) 35%,transparent)}
.thx-pick:active{transform:scale(.94)}
.thx textarea{resize:none;background:var(--card);font-size:17px;line-height:1.4}
.thx-meta{display:flex;justify-content:flex-end;font-size:12px;color:var(--muted);min-height:16px;margin-top:4px}
.thx-quote{display:flex;gap:12px;align-items:flex-start;background:var(--card);border:1px solid var(--line);border-radius:20px 20px 20px 6px;padding:14px 16px;font-size:18px;line-height:1.4;overflow-wrap:anywhere}
.thx-e{font-size:30px;line-height:1;flex:none}
.thx-from{font-size:13px;color:var(--muted);margin:10px 2px 0}
@media (prefers-reduced-motion:reduce){.thx-pick{transition:none}}
`;

// ─── Requester page ─────────────────────────────────────────────────────────
export function managePage({ token, provider }) {
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div id="app"><p class="muted" style="margin-top:28px">Loading…</p></div>
<footer>Keep this page private. Anyone with it can manage this Spot.<br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>`;
  const script = `${SHARED_JS}
const TOKEN=${json(token)},K=new URLSearchParams(location.search).get('k'),MODE=${json(provider)};
const STATUS={open:['Waiting for someone to cover it',''],paid:['Paid! getting ready to order…','warn'],card_issued:['Covered! Ready to order','ok'],completed:['Ordered','ok'],canceled:['Canceled',''],expired:['Expired',''],refunding:['Refunding…','warn'],refunded:['Refunded','']};
const FLIGHT_STATUS={open:['Ready for you',''],paid:['Paid, booking…','warn'],completed:['Booked','ok'],canceled:['Canceled',''],expired:['Expired',''],refunded:['Not booked, refunded','']};
const SELF_STATUS={open:['Ready for you',''],paid:['Paid! getting ready to order…','warn'],card_issued:['Paid, ordering it for you','ok'],completed:['Ordered','ok'],canceled:['Canceled',''],expired:['Expired',''],refunding:['Refunding…','warn'],refunded:['Refunded','']};
let tick=null,PROFILE=null,SAVED=null,SHARE=null;
// The thank-you draft survives the page's refreshes.
const THX_EMOJI=['🙏','❤️','🎉','😭','🥹'],THX={msg:null,emoji:'🙏'};
const firstName=n=>String(n||'').trim().split(/\\s+/)[0];
function thanksBox(c){
  const fn=c.payer_name?esc(firstName(c.payer_name)):'';
  if(c.thanks)return '<section class="card thx" id="thx"><h2>💌 Thank-you sent</h2><p class="small muted" style="margin:0 0 12px">'+(fn?fn+' can':'They can')+' see it on their receipt.</p><div class="thx-quote">'+(c.thanks.emoji?'<span class="thx-e">'+esc(c.thanks.emoji)+'</span>':'')+'<span>'+esc(c.thanks.message)+'</span></div></section>';
  if(!c.can_thank)return '';
  if(THX.msg===null)THX.msg='Thank you so much. You made my day.';
  return '<section class="card thx" id="thx"><h2>'+(fn||'Someone')+' spotted you 🧡</h2><p class="small muted" style="margin:0">Send a quick thank-you. It shows on their receipt.</p>'
    +'<div class="thx-row" role="group" aria-label="Add an emoji (optional)">'+THX_EMOJI.map(e=>'<button type="button" class="thx-pick'+(THX.emoji===e?' on':'')+'" data-e="'+e+'" aria-pressed="'+(THX.emoji===e)+'">'+e+'</button>').join('')+'</div>'
    +'<textarea id="thxMsg" maxlength="280" rows="3" aria-label="Your thank-you">'+esc(THX.msg)+'</textarea><div class="thx-meta"><span id="thxLeft"></span></div>'
    +'<button class="btn" id="thxSend">Send '+(fn||'them')+' a thank-you</button><div class="err" id="thxErr"></div></section>';
}
function wireThanks(){
  const box=$('#thx'),ta=$('#thxMsg');if(!box||!ta)return;
  const left=()=>{const n=280-[...ta.value].length;$('#thxLeft').textContent=n<=40?n+' left':''};left();
  ta.oninput=()=>{THX.msg=ta.value;left()};
  box.querySelectorAll('.thx-pick').forEach(b=>b.onclick=()=>{THX.emoji=THX.emoji===b.dataset.e?null:b.dataset.e;box.querySelectorAll('.thx-pick').forEach(x=>{const on=x.dataset.e===THX.emoji;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on)})});
  $('#thxSend').onclick=async()=>{const b=$('#thxSend');const msg=ta.value.trim();if(!msg){$('#thxErr').textContent='Write a few words first.';return}
    b.disabled=true;b.textContent='sending…';$('#thxErr').textContent='';
    try{await api('/v1/carts/'+TOKEN+'/manage/thanks',{k:K,message:msg,emoji:THX.emoji});THX.msg=null;draw()}catch(e){$('#thxErr').textContent=e.message;b.disabled=false;b.textContent='Try again'}};
}
// "For me" carts: an agent (or you) put this together; finish it here.
function finishPanel(c,notice){
  const fl=c.kind==='flight',tr=c.kind==='train';
  const s=Object.assign({name:c.requester.name,email:c.requester.email||''},PROFILE?{email:PROFILE.email,name:PROFILE.name||c.requester.name,phone:PROFILE.shipping?.phone||''}:{},saved(),PROFILE?.shipping||{},c.requester.shipping||{},c.contact||{});
  const left=c.expires_at-Date.now(),held=left<24*3600e3;
  const field=(n,ph,ac,extra)=>'<input name="'+n+'" placeholder="'+ph+'" autocomplete="'+ac+'" value="'+esc(s[n]||'')+'" '+(extra||'')+'>';
  let h='<h1 style="font-size:32px;margin-top:22px">'+(fl?'Your flight is ready ✈️':tr?'Your train is ready 🚆':'Your cart is ready 🛒')+'</h1><p class="muted" style="margin:6px 0 0">'+esc(c.merchant.name)+' · '+(fl||tr?'found for you':'put together for you')+(c.note?' · “'+esc(c.note)+'”':'')+'</p>';
  if(held)h+='<div class="pill warn" style="margin-top:12px" id="hold">⏳ '+(fl?'fare':'price')+' held for <span id="left"></span></div>';
  if(notice)h+='<p class="small" style="color:var(--warn);margin:12px 0 0">'+esc(notice)+'</p>';
  if(c.pay_at_store&&c.pay_at_store.started)h+='<p class="small" style="margin:12px 0 0">Paying at '+esc(c.merchant.name)+'? This page updates as soon as the store confirms your order.</p>';
  if(fl)h+='<section class="card">'+itinerary(c.flight)+totals(c)+'</section>';
  else if(tr)h+='<section class="card">'+trainCard(c.train)+totals(c)+'</section>';
  else h+='<section class="card">'+c.items.map(i=>'<div class="item"><div class="thumb" '+(i.image_url?'style="background-image:url(&quot;'+esc(String(i.image_url).replace(/["'()\\\\\\s]/g,function(c){return '%'+c.charCodeAt(0).toString(16).padStart(2,'0')}))+'&quot;)"':'')+'></div><div><div class="t">'+esc(i.title)+'</div><div class="v">'+esc([i.variant,i.quantity>1?'Qty '+i.quantity:''].filter(Boolean).join(' · '))+'</div></div><div class="p">'+usd(i.price_cents*i.quantity)+'</div></div>').join('')
    +'<div style="margin-top:8px">'+(c.extras_cents?'<div class="sum"><span>Shipping + tax (est.)</span><span>'+usd(c.extras_cents)+'</span></div>':'')+(c.cushion_cents?'<div class="sum"><span>Tax and price changes (unused comes back)</span><span>up to '+usd(c.cushion_cents)+'</span></div>':'')+(c.fee_cents?'<div class="sum"><span>Spot fee</span><span>'+usd(c.fee_cents)+'</span></div>':'')+'<div class="sum total"><span>Total</span><span>'+usd(c.total_cents)+'</span></div></div></section>';
  const payLabel=(MODE==='sandbox'?'Pay '+usd(c.total_cents)+' (test)':'Continue to pay '+usd(c.total_cents));
  if(fl)h+='<section class="card"><h2>Who’s flying</h2><form id="finish">'+travelersForm(c,s)
    +'<div id="payEl" style="margin-top:12px"></div><button class="btn" id="payBtn">'+payLabel+'</button><div class="err" id="finErr"></div></form>'
    +'<p class="small muted">Spot re-checks the fare with '+esc(c.merchant.name)+' before you pay, then books it the moment you do. You’ll get the confirmation code right here.</p></section>'
    +'<button class="btn ghost" id="cancel">Not now</button>';
  else h+='<section class="card">'+(tr?'<h2>Who’s riding</h2><form id="finish">'+ridersForm(c,s):'<h2>Ship it to</h2><form id="finish">'+field('name','Full name','name','required')+'<div style="height:6px"></div>'+field('line1','Street','address-line1','required')+'<div style="height:6px"></div>'+field('line2','Apt, suite (optional)','address-line2')
    +'<div class="row" style="margin-top:6px">'+field('city','City','address-level2','required')+field('state','State','address-level1','required')+field('postal_code','ZIP','postal-code','required inputmode="numeric"')+'</div>'
    +'<div class="row" style="margin-top:6px">'+field('email','Email for the receipt','email','required type="email"')+field('phone','Phone (optional)','tel','type="tel"')+'</div>')
    +'<div id="payEl" style="margin-top:12px"></div><button class="btn" id="payBtn">'+(SAVED?'Approve '+usd(c.total_cents)+' · '+esc(SAVED.label):c.settle==='direct'?'Pay at '+esc(c.merchant.name):MODE==='sandbox'?'Pay '+usd(c.total_cents)+' (test)':'Continue to pay '+usd(c.total_cents))+'</button>'+(SAVED?'<button type="button" id="otherPay" style="display:block;margin:10px auto 0;background:none;border:0;color:var(--muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer">Pay another way</button>':'')+'<div class="err" id="finErr"></div></form>'
    +(SAVED?'<p class="small muted">Your '+esc(SAVED.label)+' pays Spot. Spot gets a card just for this order, capped at this total and locked to '+esc(c.merchant.name)+', buys it and ships it to you. You see the store’s total before anything is ordered.</p></section>':c.settle==='direct'?'<p class="small muted">You pay '+esc(c.merchant.name)+' on its own checkout, with this cart and address filled in. Spot never touches your money or card and adds no fee.</p></section>':(tr?'<p class="small muted">After you pay, Spot buys this exact train on '+esc(c.merchant.name)+' with a card just for this ticket. You see '+esc(c.merchant.name)+'’s total first; nothing is bought until you tap Place order. '+esc(c.merchant.name)+' emails your e-ticket.</p></section>':'<p class="small muted">After you pay, Spot buys it from '+esc(c.merchant.name)+' and ships it to you. You see the store’s total first; nothing is ordered until you tap Place order.</p></section>'))
    +(!tr&&!c.bundle_id&&['card','direct'].includes(c.settle)?'<button class="btn ghost" id="reassign">Ask someone else to pay 💸</button>':'')
    +'<button class="btn ghost" id="cancel">Not now</button>';
  $('#app').innerHTML=h;
  clearInterval(tick);
  if(held){const upd=()=>{const el=$('#left');if(!el)return clearInterval(tick);const ms=c.expires_at-Date.now();if(ms<=0){clearInterval(tick);return draw()}const m=Math.floor(ms/60000),sec=Math.floor(ms/1000)%60;el.textContent=(m>=60?Math.floor(m/60)+'h '+(m%60)+'m':m+':'+String(sec).padStart(2,'0'))};upd();tick=setInterval(upd,1000)}
  const on=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn};
  on('cancel',async()=>{if(confirm('Drop this cart?')){await api('/v1/carts/'+TOKEN+'/manage/cancel',{k:K});draw()}});
  on('otherPay',()=>{SAVED=false;finishPanel(c)});
  on('reassign',async()=>{const b=$('#reassign');b.disabled=true;try{SHARE=await api('/v1/carts/'+TOKEN+'/manage/reassign',{k:K});draw()}catch(e){b.disabled=false;$('#finErr').textContent=e.message}});
  let stripeReady=null;
  $('#finish').onsubmit=async(e)=>{e.preventDefault();const f=e.target,b=$('#payBtn');$('#finErr').textContent='';b.disabled=true;
    const v=Object.fromEntries(new FormData(f));try{localStorage.setItem('spot:ship',JSON.stringify(fl||tr?{...saved(),email:v.email,phone:v.phone}:v))}catch{}
    try{
      if(!stripeReady&&fl){const r=await api('/v1/carts/'+TOKEN+'/manage/travelers',{k:K,travelers:c.flight.passengers_list.map((_,i)=>({given_name:v['g'+i],family_name:v['f'+i],born_on:v['b'+i],gender:v['x'+i],loyalty:v['ln'+i]?[{airline:v['la'+i],number:v['ln'+i]}]:[]})),contact:{email:v.email,phone:v.phone}});
        if(r.price_changed)return finishPanel(r.cart,'Heads up: '+c.merchant.name+' changed the fare. The new total is '+usd(r.price_changed.to_cents)+'. Tap pay again if it still works for you.');v.name=v.g0||''}
      else if(!stripeReady&&tr){await api('/v1/carts/'+TOKEN+'/manage/riders',{k:K,riders:Array.from({length:c.train.passengers},(_,i)=>({given_name:v['g'+i],family_name:v['f'+i]})),contact:{email:v.email,phone:v.phone}});v.name=v.g0||''}
      else if(!stripeReady){await api('/v1/carts/'+TOKEN+'/manage/prepare',{k:K,shipping:v})}
      if(SAVED){b.textContent='approving…';const r=await api('/v1/carts/'+TOKEN+'/manage/pay-saved',{});
        if(r.action){const stripe=Stripe(r.action.publishable_key);const {error}=await stripe.handleNextAction({clientSecret:r.action.client_secret});if(error)throw error;
          for(let i=0;i<20;i++){const x=await api('/v1/carts/'+TOKEN+'/manage?k='+encodeURIComponent(K));if(x.cart.status!=='open')break;await new Promise(z=>setTimeout(z,1500))}}
        return draw()}
      if(c.settle==='direct'){b.textContent='opening '+c.merchant.name+'…';const r=await api('/v1/carts/'+TOKEN+'/direct/start',{email:v.email,name:v.name});location.href=r.continue_url;return}
      if(MODE==='sandbox'){b.textContent='paying…';await api('/v1/carts/'+TOKEN+'/sandbox-pay',{payer_name:v.name.split(' ')[0]});return draw()}
      if(!stripeReady){const p=await api('/v1/carts/'+TOKEN+'/pay',{});const stripe=Stripe(p.publishable_key);
        const elements=stripe.elements({clientSecret:p.client_secret,appearance:{variables:{colorPrimary:'#ff5a36',borderRadius:'12px'}}});
        const ex=elements.create('expressCheckout',{buttonHeight:52});ex.mount('#payEl');elements.create('payment',{layout:'tabs',wallets:{applePay:'never',googlePay:'never'}}).mount('#payEl');
        const confirmPay=async()=>{const {error}=await stripe.confirmPayment({elements,redirect:'if_required',confirmParams:{return_url:location.href}});if(error)throw error;
          for(let i=0;i<20;i++){const r=await api('/v1/carts/'+TOKEN+'/manage?k='+encodeURIComponent(K));if(r.cart.status!=='open')break;await new Promise(z=>setTimeout(z,1500))}draw()};
        ex.on('confirm',()=>confirmPay().catch(err=>{$('#finErr').textContent=err.message}));
        stripeReady=confirmPay;b.disabled=false;b.textContent='Pay '+usd(c.total_cents);return}
      b.textContent='paying…';await stripeReady();
    }catch(err){$('#finErr').textContent=err.message;b.disabled=false;b.textContent='Try again'}};
}

const saved=()=>{try{return JSON.parse(localStorage.getItem('spot:ship'))||{}}catch{return {}}};
// Flights: Duffel times are local to each airport, so show them as written.
const dday=(t)=>new Date(t.slice(0,10)+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',timeZone:'UTC'});
const dtime=(t)=>{const h=+t.slice(11,13),m=t.slice(14,16);return (h%12||12)+':'+m+(h<12?' am':' pm')};
function itinerary(f){
  return f.slices.map((sl,i)=>'<div class="leg"><div class="small muted">'+(f.slices.length>1?(i?'Return':'Out')+' · ':'')+dday(sl.departing_at)+'</div>'
    +'<div class="route"><div><b>'+dtime(sl.departing_at)+'</b><span>'+esc(sl.from)+'</span></div><div class="line"><i></i><em>'+(sl.stops?sl.stops+' stop'+(sl.stops>1?'s':'')+' · '+esc(sl.segments.slice(0,-1).map(g=>g.to).join(', ')):'nonstop')+'</em></div><div style="text-align:right"><b>'+dtime(sl.arriving_at)+(sl.arriving_at.slice(0,10)!==sl.departing_at.slice(0,10)?'<sup>+1</sup>':'')+'</b><span>'+esc(sl.to)+'</span></div></div>'
    +'<div class="small muted">'+esc([f.airline.name,sl.segments.map(g=>g.flight).join(' · '),f.cabin&&f.cabin!=='economy'?f.cabin.replace('_',' '):''].filter(Boolean).join(' · '))+'</div></div>').join('')
    +'<div class="small muted" style="margin-top:8px">'+(f.conditions.refundable?'✓ refundable':'Non-refundable')+(f.conditions.changeable?' · changes allowed':'')+(f.passengers>1?' · '+f.passengers+' travelers':'')+'</div>';
}
const totals=(c)=>'<div style="margin-top:8px"><div class="sum"><span>Fare</span><span>'+usd(c.cart_cents)+'</span></div>'+(c.cushion_cents?'<div class="sum"><span>Fare changes (unused comes back)</span><span>up to '+usd(c.cushion_cents)+'</span></div>':'')+(c.fee_cents?'<div class="sum"><span>Spot fee</span><span>'+usd(c.fee_cents)+'</span></div>':'')+'<div class="sum total"><span>Total</span><span>'+usd(c.total_cents)+'</span></div></div>';
function travelersForm(c,s){
  const t=c.travelers||[];const n=c.flight.passengers;c.flight.passengers_list=Array.from({length:n});
  const inp=(nm,ph,val,extra)=>'<input name="'+nm+'" placeholder="'+ph+'" value="'+esc(val||'')+'" '+(extra||'')+'>';
  const first=(s.name||'').split(' ');
  const pt=PROFILE?.travelers||[];
  return c.flight.passengers_list.map((_,i)=>{const p=t[i]||pt[i]||(i===0&&!t.length?{given_name:first[0],family_name:first.slice(1).join(' ')}:{});
    return (n>1?'<div class="small muted" style="margin:'+(i?'14px':'0')+' 0 6px">Traveler '+(i+1)+'</div>':'')
      +'<div class="row">'+inp('g'+i,'First name',p.given_name,'required autocomplete="'+(i?'off':'given-name')+'"')+inp('f'+i,'Last name',p.family_name,'required autocomplete="'+(i?'off':'family-name')+'"')+'</div>'
      +'<div class="row trav" style="margin-top:6px;align-items:flex-end"><label class="dob"><span>Date of birth</span>'+inp('b'+i,'',p.born_on,'type="date" required max="'+new Date().toISOString().slice(0,10)+'"')+'</label><select name="x'+i+'" required aria-label="Gender on ID"><option value="">Gender on ID</option><option value="f"'+(p.gender==='f'?' selected':'')+'>Female</option><option value="m"'+(p.gender==='m'?' selected':'')+'>Male</option></select></div>'
      // Frequent flyer: their number for this airline if saved, else the first one saved.
      +(function(){const code=(c.flight.airline&&c.flight.airline.code)||'';const ls=p.loyalty||[];const l=ls.find(x=>x.airline===code)||ls[0]||{airline:code,number:''};
        return '<div class="row" style="margin-top:6px">'+inp('la'+i,'Airline',l.airline,'maxlength="2" autocapitalize="characters" aria-label="Frequent flyer airline code" style="max-width:90px"')+inp('ln'+i,'Frequent flyer # (optional)',l.number,'autocapitalize="characters" autocomplete="off" aria-label="Frequent flyer number"')+'</div>'})()}).join('')
    +'<p class="small muted" style="margin:8px 0 12px">Names exactly as on the ID you’ll travel with.</p>'
    +inp('email','Email for the e-ticket',s.email,'type="email" required autocomplete="email"')+'<div style="height:6px"></div>'+inp('phone','Mobile, for gate changes',s.phone,'type="tel" required autocomplete="tel"');
}
// Trains: times are local to each station, so show them as written.
function trainCard(t){
  return '<div class="leg"><div class="small muted">'+dday(t.depart_at)+'</div>'
    +'<div class="route rail"><div><b>'+dtime(t.depart_at)+'</b><span>'+esc(t.from)+'</span></div><div class="line"><i></i></div><div style="text-align:right"><b>'+(t.arrive_at?dtime(t.arrive_at):'')+'</b><span>'+esc(t.to)+'</span></div></div>'
    +'<div class="small muted">'+esc([[t.service,t.number].filter(Boolean).join(' '),t.fare_class,t.passengers>1?t.passengers+' passengers':'1 passenger','one-way'].filter(Boolean).join(' · '))+'</div></div>';
}
function ridersForm(c,s){
  const t=c.riders||[],pt=PROFILE?.travelers||[],first=(s.name||'').split(' ');
  const inp=(nm,ph,val,extra)=>'<input name="'+nm+'" placeholder="'+ph+'" value="'+esc(val||'')+'" '+(extra||'')+'>';
  return Array.from({length:c.train.passengers},(_,i)=>{const p=t[i]||pt[i]||(i===0?{given_name:first[0],family_name:first.slice(1).join(' ')}:{});
    return (c.train.passengers>1?'<div class="small muted" style="margin:'+(i?'14px':'0')+' 0 6px">Rider '+(i+1)+'</div>':'')
      +'<div class="row">'+inp('g'+i,'First name',p.given_name,'required autocomplete="'+(i?'off':'given-name')+'"')+inp('f'+i,'Last name',p.family_name,'required autocomplete="'+(i?'off':'family-name')+'"')+'</div>'}).join('')
    +'<p class="small muted" style="margin:8px 0 12px">Names as on the ID you’ll travel with.</p>'
    +inp('email','Email for the e-ticket',s.email,'type="email" required autocomplete="email"')+'<div style="height:6px"></div>'+inp('phone','Mobile (optional), for delays',s.phone,'type="tel" autocomplete="tel"');
}
function orderBox(c,f,agentOn){
  const st=f&&f.state;
  const tr=c.kind==='train';
  if(st==='placed')return (tr?'<h2>🚆 Booked!</h2><p class="muted" style="margin:0">'+esc(c.merchant.name)+' confirmed your ticket'+(f.order_number?' <b>'+esc(f.order_number)+'</b>':'')+'. Your e-ticket is on its way to '+esc(c.contact?.email||'your email')+'.</p>':'<h2>📦 Ordered!</h2><p class="muted" style="margin:0">'+esc(c.merchant.name)+' confirmed your order'+(f.order_number?' <b>#'+esc(f.order_number)+'</b>':'')+'. Watch your email for tracking.</p>')+(f.order_url?'<a class="btn dark" href="'+esc(f.order_url)+'" target="_blank" rel="noopener">View your order</a>':'');
  if(st==='awaiting_confirm')return '<h2>Place your order?</h2>'+(f.has_shot?'<img src="/v1/carts/'+TOKEN+'/manage/order/shot.png?k='+encodeURIComponent(K)+'&t='+f.updated_at+'" alt="The store checkout, filled in" style="width:100%;border-radius:12px;border:1px solid var(--line)">':'')
    +'<div class="sum total"><span>'+esc(c.merchant.name)+' total</span><span>'+usd(f.total_cents)+'</span></div><p class="small muted">'+esc(f.summary||'')+'</p><button class="btn" id="placeIt">Place order</button><button class="btn ghost" id="notYet">Not yet</button>';
  if(st==='starting'||st==='working')return '<h2><span class="spin"></span> '+(tr?'Buying your ticket on ':'Ordering at ')+esc(c.merchant.name)+'…</h2>'+(f.steps||[]).map(x=>'<div class="sum"><span>'+esc(x.text)+'</span><span>✓</span></div>').join('')+'<p class="small muted">Spot is filling in the store’s checkout. You’ll confirm before anything is placed.</p>';
  const s=Object.assign({name:c.requester.name,email:c.requester.email||''},PROFILE?.shipping||{},c.requester.shipping||saved());
  const note=st==='needs_you'?'<p class="small" style="color:var(--warn);margin-top:0">'+esc(f.reason||'Spot couldn’t place this one automatically.')+'</p><p class="small muted">Try again below. If Spot can’t order it within 3 days, '+(c.for==='self'?'you’re':esc(c.payer_name||'the payer')+' is')+' refunded in full automatically.</p>':(st==='cancelled'?'<p class="small muted" style="margin-top:0">Nothing was ordered. Start again whenever you’re ready.</p>':'');
  const field=(n,ph,ac,extra)=>'<input name="'+n+'" placeholder="'+ph+'" autocomplete="'+ac+'" value="'+esc(s[n]||'')+'" '+(extra||'')+'>';
  if(tr)return '<h2>'+(st?'Buy the ticket':'Getting your ticket')+'</h2>'+note+'<form id="shipForm"><button class="btn">'+(st==='needs_you'||st==='cancelled'?'Try again':'Buy it')+'</button><div class="err" id="shipErr"></div></form>'
    +'<p class="small muted">Spot buys this train on '+esc(c.merchant.name)+' with its own card for '+esc((c.riders||[]).map(r=>r.given_name+' '+r.family_name).join(', ')||'you')+'. You see the total first; nothing is bought until you tap Place order.</p>';
  return '<h2>Where should it ship?</h2>'+note
    +'<form id="shipForm">'+field('name','Full name','name','required')+'<div style="height:6px"></div>'+field('line1','Street','address-line1','required')+'<div style="height:6px"></div>'+field('line2','Apt, suite (optional)','address-line2')
    +'<div class="row" style="margin-top:6px">'+field('city','City','address-level2','required')+field('state','State','address-level1','required')+field('postal_code','ZIP','postal-code','required inputmode="numeric"')+'</div>'
    +'<div class="row" style="margin-top:6px">'+field('email','Email for the receipt','email','required type="email"')+field('phone','Phone (optional)','tel','type="tel"')+'</div>'
    +'<button class="btn">'+(st==='needs_you'||st==='cancelled'?'Try again':'Order it')+'</button><div class="err" id="shipErr"></div></form>'
    +'<p class="small muted">Spot buys it from '+esc(c.merchant.name)+' with its own card and ships it to you. You see the store’s total first; nothing is placed until you tap Place order.</p>';
}
async function draw(){
  const r=await api('/v1/carts/'+TOKEN+'/manage'+(K?'?k='+encodeURIComponent(K):''));const c=r.cart;PROFILE=r.profile||null;if(SAVED!==false)SAVED=r.saved_card||null;
  clearInterval(tick);
  const self=c.for==='self';
  if(self&&c.status==='open'){finishPanel(c);if(c.pay_at_store&&c.pay_at_store.started)setTimeout(()=>{if(document.activeElement?.tagName!=='INPUT')draw()},5000);return}
  const fl=c.kind==='flight'?c.flight:null;
  const [label,tone]=(fl?FLIGHT_STATUS:self?SELF_STATUS:STATUS)[c.status]||[c.status,''];
  let h='<h1 style="font-size:28px">'+(fl?'Your trip':c.kind==='train'?'Your '+esc(c.merchant.name)+' ticket':self?'Your '+esc(c.merchant.name)+' order':esc(c.merchant.name)+' cart')+'</h1><span class="pill '+tone+'">'+label+'</span>';
  if(self&&c.status==='expired')h+='<section class="card"><h2>This one timed out ⏳</h2><p class="muted" style="margin:0">'+(fl?'Airlines only hold a fare for a little while.':'The price was only held for a little while.')+' Ask your assistant to find it again.</p></section>';
  if(c.held&&c.status==='paid')h+='<section class="card"><h2>Quick check 🔍</h2><p class="muted" style="margin:0">We’re double-checking this payment. It usually takes a few minutes, and there’s nothing you need to do. '+(fl?'Your trip':'Your card')+' will appear here.</p></section>';
  else if(fl&&c.status==='paid')h+='<section class="card"><h2><span class="spin"></span> Booking with '+esc(c.merchant.name)+'…</h2><p class="muted" style="margin:0">Paid. This usually takes a few seconds.</p></section>';
  if(fl&&c.status==='completed')h+='<section class="card booked"><div class="small muted">Confirmation code</div><div class="pnr">'+esc(fl.booking_reference)+'</div><h2 style="margin-top:6px">✈️ You’re booked!</h2><p class="muted" style="margin:0">'+esc(c.merchant.name)+' will email your e-ticket to '+esc(c.contact?.email||'you')+'. Use the code to check in.</p></section>';
  if(fl&&c.status==='refunded')h+='<section class="card"><h2>We couldn’t book this one</h2><p class="muted" style="margin:0">'+esc(fl.error||'The airline said no.')+' You’ve been refunded in full. Ask your assistant to find another.</p></section>';
  if(fl)h+='<section class="card">'+itinerary(fl)+totals(c)+'</section>';
  if(c.kind==='train'&&c.train)h+='<section class="card">'+trainCard(c.train)+totals(c)+'</section>';
  if(!self)h+='<section class="card">'+(SHARE&&c.status==='open'?'<h2>Send it to whoever’s paying 💸</h2><p class="small muted" style="margin-top:0">They pay on this link, then you tell Spot where it ships.</p>':'')+'<div class="small muted">Your link</div><div class="linkbox" style="margin-top:6px">'+esc(r.link)+'</div>'+(c.status==='open'?'<button class="btn" id="share">'+(navigator.share?'Share link':'Copy link')+'</button>':'')+(c.status==='open'&&!c.bundle_id&&!c.approver&&['card','direct'].includes(c.settle)?'<button class="btn ghost" id="claim">Pay it yourself</button><div class="err" id="claimErr"></div>':'')+'<div class="sum total"><span>'+(c.settle==='card'?'Your cart':'You get')+'</span><span>'+usd(c.cart_cents)+'</span></div></section>';
  if(c.settle==='direct'&&c.status==='open'&&!self){
    const sh=c.requester.shipping;
    h+='<section class="card" id="shipDirect"><h2>'+(sh?'Ships to':'Where should it ship?')+'</h2>'
      +(sh?'<p class="muted" style="margin:0">'+esc(sh.name)+', '+esc(sh.line1)+', '+esc(sh.city)+' '+esc(sh.state)+'</p><button class="btn ghost" id="editShip">Change</button>':'')
      +'<form id="dShip" '+(sh?'hidden':'')+'>'+['name|Full name|name','line1|Street|address-line1','line2|Apt, suite (optional)|address-line2','city|City|address-level2','state|State|address-level1','postal_code|ZIP|postal-code','email|Email for shipping updates|email','phone|Phone (optional)|tel'].map(x=>{const [n,ph,ac]=x.split('|');return '<input name="'+n+'" placeholder="'+ph+'" autocomplete="'+ac+'" value="'+esc((sh||PROFILE?.shipping||{})[n]||(n==='name'?c.requester.name:''))+'" '+(['line2','phone'].includes(n)?'':'required')+' style="margin-top:6px">'}).join('')
      +'<button class="btn">Save</button><div class="err" id="dShipErr"></div></form>'
      +'<p class="small muted">Whoever pays checks out on '+esc(c.merchant.name)+'’s own page and pays the store directly, so they’ll see this address there.</p></section>';
  }
  const f=c.fulfillment;
  if(c.status==='card_issued'||(f&&f.state==='placed')){
    h+='<section class="card" id="orderBox">'+orderBox(c,f,r.agent_enabled)+'</section>';
  }
  if(!self)h+=thanksBox(c);
  if(MODE==='sandbox'&&!fl&&['card_issued','completed'].includes(c.status)){
    h+='<section class="card"><h2>Test the store’s side</h2><p class="small muted" style="margin-top:0">Sandbox only: play what the store does with Spot’s card.</p>'
      +(c.status==='card_issued'?'<label>Merchant name as the card network sees it</label><input id="sm" value="'+esc(c.merchant.name.toUpperCase())+'"><label>Amount</label><input id="sa" inputmode="decimal" value="'+(c.cart_cents/100).toFixed(2)+'"><button class="btn" id="sim">Run test charge</button>'
        :'<label>Amount</label><input id="sa" inputmode="decimal" value="'+((c.spent_cents||c.cart_cents)/100).toFixed(2)+'"><div class="row"><button class="btn" id="cap">Store captures</button><button class="btn ghost" id="ret">Store refunds a return</button></div><button class="btn ghost" id="rel">Store releases the charge</button>')
      +'<div id="simOut" class="err"></div></section>';
  }
  if(c.status==='completed'&&!fl&&c.settle==='handoff'){h+='<section class="card"><h2>🎉 All done</h2><p class="muted" style="margin:0">Marked as received.</p></section>'}
  if(c.status==='refunded'&&!fl)h+='<section class="card"><h2>Refunded</h2><p class="muted" style="margin:0">'+({payer_canceled:esc(c.payer_name||'The payer')+' canceled before it was ordered.',requester_canceled:'You canceled before it was ordered.',not_ordered:'Spot couldn’t order it in time.',store_reversed:esc(c.merchant.name)+' canceled the charge.',store_released:esc(c.merchant.name)+' didn’t charge for it.',store_never_charged:esc(c.merchant.name)+' never charged for it.',risk:'This payment didn’t pass our checks.'}[c.refund_reason]||'This one was refunded.')+' '+(c.for==='self'?'You were':esc(c.payer_name||'The payer')+' was')+' refunded '+usd(c.total_cents)+'.</p></section>';
  if(c.refunds&&c.refunds.length)h+='<section class="card"><h2>Money sent back</h2>'+c.refunds.map(x=>'<div class="sum"><span>'+(x.reason==='store_refund'?'Return refunded':'Unused, sent back')+(x.state==='failed'?' (retrying)':'')+'</span><span>'+usd(x.amount_cents)+'</span></div>').join('')+'</section>';
  if(c.settle==='handoff'&&c.items[0]&&c.items[0].url&&c.status!=='canceled'&&c.status!=='expired')h+='<a class="btn ghost" href="/c/'+TOKEN+'/buy/0'+(K?'?k='+encodeURIComponent(K):'')+'" target="_blank" rel="noopener">Buy it at '+esc(c.merchant.name)+' →</a><p class="small muted" style="text-align:center;margin:6px 0 0">Spot may earn a commission from '+esc(c.merchant.name)+'. Your price is the same.</p>';
  if(c.status==='open'&&c.settle==='handoff')h+='<button class="btn" id="got">I got the money</button>';
  if(c.status==='open')h+='<button class="btn ghost" id="cancel">Cancel this link</button>';
  const busy=f&&['starting','working','awaiting_confirm','placed'].includes(f.state);
  if(['paid','card_issued'].includes(c.status)&&!busy&&!fl)h+='<button class="btn ghost" id="refund">Cancel and refund '+(c.for==='self'?'me':esc(c.payer_name||'the payer'))+'</button>';
  h+='<section class="card"><h2>Activity</h2>'+r.events.map(e=>'<div class="sum"><span>'+esc(e.kind.replace(/_/g,' '))+'</span><span>'+new Date(e.at).toLocaleString()+'</span></div>').join('')+'</section>';
  $('#app').innerHTML=h;
  wireThanks();
  const on=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn};
  const ds=$('#dShip');if(ds)ds.onsubmit=async(e)=>{e.preventDefault();try{await api('/v1/carts/'+TOKEN+'/manage/prepare',{k:K,shipping:Object.fromEntries(new FormData(ds))});draw()}catch(err){$('#dShipErr').textContent=err.message}};
  on('editShip',()=>{$('#dShip').hidden=false;$('#editShip').remove()});
  on('claim',async()=>{const b=$('#claim');b.disabled=true;try{await api('/v1/carts/'+TOKEN+'/manage/pay-yourself',{k:K});SHARE=null;draw()}catch(e){b.disabled=false;$('#claimErr').textContent=e.message}});
  on('share',async()=>{const text=(SHARE&&SHARE.share_message)||('psst… can you spot me? 👀 '+(c.items[0]?.title||'')+' from '+c.merchant.name+'\\n'+r.link);try{if(navigator.share)await navigator.share({text});else{await navigator.clipboard.writeText(text);$('#share').textContent='Copied ✓'}}catch{}});
  const sim=async(type)=>{const cents=Math.round(parseFloat($('#sa').value)*100);try{await api('/v1/sandbox/issuing',{token:TOKEN,k:K,type,amount_cents:cents});draw()}catch(e){$('#simOut').textContent=e.message}};
  on('cap',()=>sim('capture'));on('ret',()=>sim('refund'));on('rel',()=>sim('closed'));
  on('sim',async()=>{const cents=Math.round(parseFloat($('#sa').value)*100);try{const d=await api('/v1/sandbox/authorize',{token:TOKEN,k:K,merchant_name:$('#sm').value,amount_cents:cents});$('#simOut').textContent=d.approved?'':'Declined: '+d.reason.replace(/_/g,' ');if(d.approved)draw()}catch(e){$('#simOut').textContent=e.message}});
  const ship=$('#shipForm');if(ship)ship.onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(ship));if(Object.keys(v).length)try{localStorage.setItem('spot:ship',JSON.stringify(v))}catch{}
    const b=ship.querySelector('button');b.disabled=true;b.textContent='starting…';
    try{await api('/v1/carts/'+TOKEN+'/manage/order',{k:K,shipping:v});draw()}catch(err){$('#shipErr').textContent=err.message;b.disabled=false;b.textContent='Try again'}};
  on('placeIt',async()=>{$('#placeIt').disabled=true;$('#placeIt').textContent='placing…';await api('/v1/carts/'+TOKEN+'/manage/order/confirm',{k:K,place:true});draw()});
  on('notYet',async()=>{await api('/v1/carts/'+TOKEN+'/manage/order/confirm',{k:K,place:false});draw()});
  on('got',async()=>{await api('/v1/carts/'+TOKEN+'/manage/received',{k:K});draw()});
  on('cancel',async()=>{if(confirm('Cancel this link?')){await api('/v1/carts/'+TOKEN+'/manage/cancel',{k:K});draw()}});
  on('refund',async()=>{if(confirm('Cancel this order and refund the payment in full?')){try{await api('/v1/carts/'+TOKEN+'/manage/refund',{k:K})}catch(e){alert(e.message)}draw()}});
  // keep watching for payment, but never redraw under someone typing
  const live=f&&['starting','working','awaiting_confirm'].includes(f.state);
  if(['open','paid','refunding'].includes(c.status)||live)setTimeout(function again(){const typing=['INPUT','TEXTAREA'].includes(document.activeElement?.tagName);typing?setTimeout(again,4000):draw()},live?2000:4000);
}
draw().catch(e=>{$('#app').innerHTML=K?'<p class="err">'+esc(e.message)+'</p>':'<section class="card"><h2>Sign in to see this Spot</h2><p class="muted">It’s in your Spot account.</p><a class="btn" href="/signin?next='+encodeURIComponent(location.pathname)+'">Sign in</a></section>'});`;
  return shell({ title: 'My Spot', body, script, head: `<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">${provider === 'stripe' ? '<script src="https://js.stripe.com/v3/"></script>' : ''}<style>${THX_CSS}.pill.warn{background:color-mix(in srgb,var(--warn) 16%,transparent);color:var(--warn)}
.leg{padding:10px 0;border-bottom:1px dashed var(--line)}.leg:last-of-type{border-bottom:0}
.route{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;margin:6px 0}.route b{display:block;font-size:20px}.route span{font-size:13px;color:var(--muted);font-weight:700;letter-spacing:.04em}
.route .line{position:relative;text-align:center;min-width:0}.route .line i{display:block;height:2px;background:var(--line);margin:0 4px;position:relative}.route .line i::after{content:'✈';position:absolute;right:-4px;top:-10px;font-style:normal;font-size:14px;color:var(--accent,#ff5a36)}
.route.rail .line i::after{content:'🚆';top:-11px}
.route .line em{font-style:normal;font-size:12px;color:var(--muted);display:block;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dob{flex:1;display:flex;flex-direction:column;font-size:12px;color:var(--muted);min-width:0}.dob input{margin-top:2px}
.trav input,.trav select{height:48px}
.booked .pnr{font:800 44px/1 ui-monospace,monospace;letter-spacing:.12em;margin-top:4px}</style>` });
}

// The payer's receipt from Spot, linked from their receipt email. Spot is
// the seller, so this is where a payer cancels (until it's ordered).
export function receiptPage({ token }) {
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div id="app"><p class="muted" style="margin-top:28px">Loading…</p></div>
<footer>Questions or returns: <a href="mailto:${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}">${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}</a><br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>`;
  const script = `${SHARED_JS}
const TOKEN=${json(token)},P=new URLSearchParams(location.search).get('p');
const WHY={payer_canceled:'You canceled it before it was ordered.',requester_canceled:'It was canceled before it was ordered.',not_ordered:'Spot couldn’t order it in time.',store_reversed:'The store canceled the charge.',store_released:'The store didn’t charge for it.',store_never_charged:'The store never charged for it.'};
async function draw(){
  const r=await api('/v1/carts/'+TOKEN+'/receipt?p='+encodeURIComponent(P));const c=r.cart;
  const status=c.status==='refunded'?'Refunded':c.status==='refunding'?'Refunding…':r.ordered||c.status==='completed'?(c.kind==='flight'?'Booked':'Ordered'):['paid','card_issued'].includes(c.status)?'Paid, not ordered yet':c.status;
  let h='<h1 style="font-size:28px">🧾 Your Spot receipt</h1><span class="pill">'+esc(status)+'</span>'
    +'<section class="card"><p class="muted" style="margin-top:0">'+(c.kind==='flight'?'You bought this ticket from Spot.':'You bought this from Spot as a gift for '+esc(c.requester.name)+'. Spot orders it from '+esc(c.merchant.name)+' and ships it to them.')+'</p>'
    +c.items.map(i=>'<div class="sum"><span>'+esc(i.title)+(i.quantity>1?' ×'+i.quantity:'')+'</span><span>'+usd(i.price_cents*i.quantity)+'</span></div>').join('')
    +(c.extras_cents?'<div class="sum"><span>Shipping + tax (est.)</span><span>'+usd(c.extras_cents)+'</span></div>':'')
    +(c.cushion_cents?'<div class="sum"><span>Tax and price changes (unused comes back)</span><span>'+usd(c.cushion_cents)+'</span></div>':'')
    +'<div class="sum"><span>Spot fee</span><span>'+usd(c.fee_cents)+'</span></div><div class="sum total"><span>Paid</span><span>'+usd(c.total_cents)+'</span></div>'
    +(r.ordered?'<p class="small muted">Ordered'+(r.ordered.order_number?' · order #'+esc(r.ordered.order_number):'')+'. Returns go through Spot: reply to your receipt email.</p>':'')
    +'</section>'
    +(r.thanks?'<section class="card thx" id="thx"><h2>💌 '+esc(String(r.thanks.from||'').trim().split(/\\s+/)[0]||'They')+' says thanks</h2><div class="thx-quote">'+(r.thanks.emoji?'<span class="thx-e">'+esc(r.thanks.emoji)+'</span>':'')+'<span>'+esc(r.thanks.message)+'</span></div><p class="thx-from">'+new Date(r.thanks.at).toLocaleDateString('en-US',{month:'short',day:'numeric'})+' · for '+esc(c.items[0]?.title||'your gift')+'</p></section>':'')
    +(c.built_by||r.approvals.length?'<section class="card"><h2>Who did what</h2>'+(c.built_by?'<p class="small" style="margin-top:0">🤖 Put together by <b>'+esc(c.built_by)+'</b> for '+esc(c.requester.name)+'</p>':'')+r.approvals.map(a=>'<p class="small">✅ Approved by '+(a.approved_by==='requester'?esc(c.requester.name):'you')+' · '+new Date(a.at).toLocaleString()+' · <a href="'+esc(a.url)+'">signed approval</a></p>').join('')+'</section>':'');
  if(c.status==='refunded')h+='<section class="card"><h2>Refunded</h2><p class="muted" style="margin:0">'+(WHY[c.refund_reason]||'')+' '+usd(c.total_cents)+' went back to your card. It usually shows in 5–10 business days.</p></section>';
  if(r.refunds.length)h+='<section class="card"><h2>Money sent back</h2>'+r.refunds.map(x=>'<div class="sum"><span>'+(x.reason==='store_refund'?'Return refunded':'Unused, sent back')+'</span><span>'+usd(x.amount_cents)+'</span></div>').join('')+'</section>';
  if(r.can_cancel)h+='<button class="btn ghost" id="cancel">Cancel and get a full refund</button><p class="small muted">Until Spot places the order. The Spot fee is refunded too.</p>';
  $('#app').innerHTML=h;
  const b=$('#cancel');if(b)b.onclick=async()=>{if(!confirm('Cancel this and refund '+usd(c.total_cents)+' to your card?'))return;b.disabled=true;try{await api('/v1/carts/'+TOKEN+'/receipt/cancel',{p:P})}catch(e){alert(e.message)}draw()};
}
draw().catch(e=>{$('#app').innerHTML='<p class="err">'+esc(e.message)+'</p>'});`;
  return shell({ title: 'Your Spot receipt', body, script, head: `<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><style>${THX_CSS}</style>` });
}

// ─── Multi-store asks (bundles) ─────────────────────────────────────────────
// One link, one payment; a section per store. Spot buys each store's cart
// with its own card and orders them separately.
export function bundlePayPage({ bundle: b, provider, pageUrl, cardUrl }) {
  const name = b.requester.name;
  const open = b.status === 'open';
  const covered = ['paid', 'completed'].includes(b.status);
  const n = b.stores.length;
  const ogTitle = covered ? `${b.payer_name || 'Someone'} spotted ${name}! 🎉` : `psst… can you spot ${name}?`;
  const ogDesc = `${b.items.length} things from ${n} stores · ${usd(b.cart_cents)} · tap to cover it`;
  const head = `
<meta property="og:type" content="website"><meta property="og:site_name" content="Spot">
<meta property="og:title" content="${esc(ogTitle)}"><meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${esc(pageUrl)}"><meta property="og:image" content="${esc(cardUrl)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="robots" content="noindex">
<style>${PAY_CSS}.store-h{font-weight:800;margin:14px 0 4px;font-size:15px;color:var(--muted)}</style>
${provider === 'stripe' && open ? '<script src="https://js.stripe.com/v3/"></script>' : ''}`;
  const section = (st) => `<div class="store-h bub">🛍️ ${esc(st.merchant.name)} · ${usd(st.cart_cents)}</div>${st.items
    .map((i) => `<div class="pcard bub"><div class="thumb" ${i.image_url ? `style="background-image:url('${esc(cssSafe(i.image_url))}')"` : ''}></div>
<div><div class="t">${esc(i.title)}</div><div class="v">${esc([i.variant, i.quantity > 1 ? `×${i.quantity}` : ''].filter(Boolean).join(' · '))}</div></div>
<div class="p">${usd(i.price_cents * i.quantity)}</div></div>`)
    .join('')}`;
  let lines;
  if (covered) lines = [`<div class="bub big">${esc(b.payer_name || 'Someone')} already spotted ${esc(name)} 🎉</div>`, `<div class="bub">nothing left to do here. you're all good.</div>`];
  else if (!open) lines = [`<div class="bub big">oh! ${b.status === 'expired' ? 'this link expired' : 'this one is closed'}.</div>`, `<div class="bub">ask ${esc(name)} for a fresh one 🙂</div>`];
  else {
    lines = [
      `<div class="bub">${esc(name)} put together a cart from <b>${n} stores</b> and is hoping you'll spot them</div>`,
      b.note ? `<div class="bub quote">“${esc(b.note)}” — ${esc(name)}</div>` : '',
      b.built_by ? `<div class="bub">🤖 put together by ${esc(name)}’s AI (${esc(b.built_by)})</div>` : '',
      ...b.stores.map(section),
      `<div class="bub big">it's ${usd(b.total_cents)} all in, one payment. want to cover it?</div>`,
    ];
  }
  let k = 0;
  const chat = lines.join('').replace(/class="(pcard |store-h )?bub/g, (m) => `style="animation-delay:${(0.15 + 0.22 * k++).toFixed(2)}s" ${m}`);
  const who = esc(name);
  const action = provider === 'sandbox'
    ? `<div class="namefield"><input id="payer" maxlength="60" placeholder="your name (optional)" aria-label="Your name (optional)"></div><button class="btn go" id="go">Spot ${who} ${usd(b.total_cents)}</button><div class="err" id="payErr"></div>`
    : `<div id="express"></div><div class="or" id="orCard" hidden>or pay with card</div><details id="cardBox"><summary class="btn ghost" style="list-style:none">Pay with card</summary><div id="stripeEl" style="margin-top:12px"></div><button class="btn go" id="go" disabled>Spot ${who} ${usd(b.total_cents)}</button></details><div class="err" id="payErr"></div>`;
  const details = `<details><summary>how this works</summary>
<p>You're buying these from Spot as a gift for ${who}, in one payment. Spot orders each store's items from that store and ships them to ${who}. Nobody gets cash or a card. If a store can't be ordered, you get that store's share back automatically. Changed your mind? Cancel for a refund of anything not ordered yet, from the link in your receipt.</p>
${b.stores.map((st) => `<div class="sum"><span>${esc(st.merchant.name)}</span><span>${usd(st.cart_cents)}</span></div>`).join('')}
${b.cushion_cents ? `<div class="sum"><span>Tax and price changes (unused comes back)</span><span>up to ${usd(b.cushion_cents)}</span></div>` : ''}
${b.fee_cents ? `<div class="sum"><span>Spot fee</span><span>${usd(b.fee_cents)}</span></div>` : ''}
<div class="sum"><b>Total</b><b>${usd(b.total_cents)}</b></div></details>`;
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div class="buddy">${buddySvg(covered)}<div class="hi">${covered ? 'yay!' : open ? 'hey 👋' : 'hmm…'}</div></div>
<div class="chat" id="chat">${chat}</div>
${open ? `<div class="act" id="act">${action}</div>` : ''}
${open && provider === 'sandbox' ? '<div class="sandbox">Test mode: no real money moves.</div>' : ''}
${open ? details : ''}
<footer>By paying you agree to Spot’s <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a>.<br><a href="/">make your own Spot</a></footer>`;
  const script = `${SHARED_JS}
function celebrate(payer){
  $('#chat').insertAdjacentHTML('beforeend','<div class="bub big" style="animation-delay:.1s">you\\'re the best'+(payer?', '+esc(payer):'')+' 🧡</div><div class="bub" style="animation-delay:.45s">I just told '+${json(esc(name))}+'. Spot orders from each store now.</div>');
  const a=$('#act');if(a)a.remove();const d=$('details');if(d)d.remove();scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
}
${open ? payScript(b, provider, '/v1/bundles/') : ''}`;
  return shell({ title: ogTitle, head, body, script });
}

// The requester's page for a multi-store ask: shipping once for every
// store, then each store's own page to follow (and confirm) its order.
export function bundleManagePage({ token }) {
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div id="app"><p class="muted" style="margin-top:28px">Loading…</p></div>
<footer>Keep this page private. Anyone with it can manage this Spot.<br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>`;
  const script = `${SHARED_JS}
const TOKEN=${json(token)},K=new URLSearchParams(location.search).get('k');
const ST={open:'Waiting',paid:'Paid, getting ready',card_issued:'Covered! Ready to order',completed:'Ordered',canceled:'Canceled',expired:'Expired',refunding:'Refunding…',refunded:'Refunded'};
const q='?k='+encodeURIComponent(K||'');
async function draw(){
  const r=await api('/v1/bundles/'+TOKEN+'/manage'+q);const b=r.bundle;
  let h='<h1 style="font-size:30px;margin-top:22px">'+(b.status==='open'?'Your multi-store Spot':b.status==='paid'?'🎉 '+esc(b.payer_name||'Someone')+' spotted you!':b.status==='completed'?'All done 📦':'This Spot is '+esc(b.status))+'</h1>'
    +'<p class="muted" style="margin:6px 0 0">'+b.stores.length+' stores · '+usd(b.total_cents)+' total</p>'
    +(b.for==='self'?'':'<section class="card"><p class="small muted" style="margin-top:0">Share this link. One payment covers every store.</p><div class="row"><input readonly value="'+esc(location.origin+'/b/'+TOKEN)+'" id="link"><button class="btn ghost" id="copy" style="width:auto">Copy</button></div></section>');
  const ship=r.stores[0].requester.shipping;
  if(b.status==='open'){
    const s=ship||{};const f=(n,ph,ac,x)=>'<input name="'+n+'" placeholder="'+ph+'" autocomplete="'+ac+'" value="'+esc(s[n]||'')+'" '+(x||'')+'>';
    h+='<section class="card"><h2>Ship everything to</h2><form id="ship">'+f('name','Full name','name','required')+'<div style="height:6px"></div>'+f('line1','Street','address-line1','required')+'<div style="height:6px"></div>'+f('line2','Apt, suite (optional)','address-line2')
      +'<div class="row" style="margin-top:6px">'+f('city','City','address-level2','required')+f('state','State','address-level1','required')+f('postal_code','ZIP','postal-code','required inputmode="numeric"')+'</div><div class="row" style="margin-top:6px">'+f('email','Email','email','required type="email"')+f('phone','Phone (optional)','tel','type="tel"')+'</div>'
      +'<button class="btn" style="margin-top:10px">'+(ship?'Update address':'Save address')+'</button><div class="err" id="shipErr"></div></form></section>';
    // Your own multi-store cart: pay once for everything, then confirm each store.
    if(b.for==='self'&&ship)h+='<a class="btn" href="/b/'+esc(TOKEN)+'">Pay '+usd(b.total_cents)+' for all '+b.stores.length+' stores →</a>';
  }
  h+=r.stores.map(c=>'<section class="card"><div class="sum"><b>🛍️ '+esc(c.merchant.name)+'</b><span class="pill">'+esc(ST[c.status]||c.status)+'</span></div>'
    +c.items.map(i=>'<div class="sum"><span>'+esc(i.title)+(i.quantity>1?' ×'+i.quantity:'')+'</span><span>'+usd(i.price_cents*i.quantity)+'</span></div>').join('')
    +(c.fulfillment&&c.fulfillment.order_number?'<p class="small">Order #'+esc(c.fulfillment.order_number)+'</p>':'')
    +(c.refund_reason?'<p class="small muted">Refunded to whoever paid.</p>':'')
    +(['card_issued','paid','completed'].includes(c.status)?'<a class="btn ghost" href="/c/'+esc(c.token)+'/manage'+q+'">'+(c.status==='card_issued'?'Order from '+esc(c.merchant.name)+' →':'Details')+'</a>':'')+'</section>').join('');
  if(b.status==='open')h+='<button class="btn ghost" id="cancel">Cancel this Spot</button>';
  if(r.stores.some(c=>['paid','card_issued'].includes(c.status)))h+='<button class="btn ghost" id="refund">Cancel what isn’t ordered yet (refunds the payer)</button>';
  $('#app').innerHTML=h;
  if($('#copy'))$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText($('#link').value);$('#copy').textContent='Copied'}catch{}};
  const sf=$('#ship');if(sf)sf.onsubmit=async e=>{e.preventDefault();try{await api('/v1/bundles/'+TOKEN+'/manage/prepare',{k:K,shipping:Object.fromEntries(new FormData(sf))});draw()}catch(err){$('#shipErr').textContent=err.message}};
  const c=$('#cancel');if(c)c.onclick=async()=>{if(!confirm('Cancel this Spot?'))return;await api('/v1/bundles/'+TOKEN+'/manage/cancel',{k:K});draw()};
  const rf=$('#refund');if(rf)rf.onclick=async()=>{if(!confirm('Cancel everything not ordered yet and refund the payer for it?'))return;try{await api('/v1/bundles/'+TOKEN+'/manage/refund',{k:K})}catch(err){alert(err.message)}draw()};
}
draw().catch(e=>{$('#app').innerHTML='<p class="err">'+esc(e.message)+'</p>'});
setInterval(()=>{if(!document.querySelector('input:focus'))draw().catch(()=>{})},15000);`;
  return shell({ title: 'Your Spot', body, script, head: '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">' });
}

// The payer's receipt for a multi-store ask.
export function bundleReceiptPage({ token }) {
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div id="app"><p class="muted" style="margin-top:28px">Loading…</p></div>
<footer>Questions or returns: <a href="mailto:${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}">${esc(process.env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com')}</a><br><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></footer>`;
  const script = `${SHARED_JS}
const TOKEN=${json(token)},P=new URLSearchParams(location.search).get('p');
const ST={paid:'Paid, not ordered yet',card_issued:'Paid, not ordered yet',completed:'Ordered',refunding:'Refunding…',refunded:'Refunded'};
async function draw(){
  const r=await api('/v1/bundles/'+TOKEN+'/receipt?p='+encodeURIComponent(P));const b=r.bundle;
  let h='<h1 style="font-size:28px">🧾 Your Spot receipt</h1><p class="muted">A gift for '+esc(b.requester.name)+' from '+b.stores.length+' stores, in one payment. Spot orders each store’s items and ships them to them.</p>';
  h+=b.stores.map((st,i)=>{const x=r.stores[i];return '<section class="card"><div class="sum"><b>'+esc(st.merchant.name)+'</b><span class="pill">'+esc(ST[x.status]||x.status)+'</span></div>'
    +st.items.map(it=>'<div class="sum"><span>'+esc(it.title)+(it.quantity>1?' ×'+it.quantity:'')+'</span><span>'+usd(it.price_cents*it.quantity)+'</span></div>').join('')
    +'<div class="sum total"><span>This store</span><span>'+usd(st.total_cents)+'</span></div>'
    +(x.ordered?'<p class="small muted">Ordered'+(x.ordered.order_number?' · order #'+esc(x.ordered.order_number):'')+'</p>':'')
    +(x.status==='refunded'?'<p class="small muted">'+usd(st.total_cents)+' went back to your card.</p>':'')
    +x.approvals.map(a=>'<p class="small"><a href="'+esc(a.url)+'">✅ signed approval</a></p>').join('')+'</section>'}).join('');
  h+='<section class="card"><div class="sum total"><span>Paid</span><span>'+usd(b.total_cents)+'</span></div></section>';
  if(r.stores.some(x=>x.can_cancel))h+='<button class="btn ghost" id="cancel">Cancel what isn’t ordered yet</button><p class="small muted">You get those stores’ share back, Spot fee included.</p>';
  $('#app').innerHTML=h;
  const c=$('#cancel');if(c)c.onclick=async()=>{if(!confirm('Cancel everything not ordered yet and get a refund for it?'))return;c.disabled=true;try{await api('/v1/bundles/'+TOKEN+'/receipt/cancel',{p:P})}catch(e){alert(e.message)}draw()};
}
draw().catch(e=>{$('#app').innerHTML='<p class="err">'+esc(e.message)+'</p>'});`;
  return shell({ title: 'Your Spot receipt', body, script, head: '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">' });
}

// A signed approval, readable by a person. The same record is at
// /v1/approvals/:id as a JWS anyone can check against /.well-known/spot-keys.json.
const HOW = { paid_spot: 'paid with Spot', paid_at_store: 'paid the store directly', placed_order: 'tapped Place order' };
export function approvalPage({ id, payload: p, jws }) {
  const who = p.approved_by === 'requester' ? 'The person it was for' : 'The person who paid';
  const when = new Date(p.iat * 1000).toUTCString();
  const rows = (p.items || []).map((i) => `<div class="sum"><span>${esc(i.title)}${i.variant ? ` · ${esc(i.variant)}` : ''}${i.quantity > 1 ? ` ×${i.quantity}` : ''}</span><span>${usd(i.price_cents * i.quantity)}</span></div>`).join('');
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<h1 style="font-size:28px">✅ Approved by a person</h1>
<span class="pill">Signature checks out</span>
<section class="card">
<p style="margin-top:0"><b>${esc(who)}</b> ${esc(HOW[p.how] || 'approved it')} on ${esc(when)}.</p>
${p.agent ? `<p class="muted">🤖 Put together by <b>${esc(p.agent)}</b>, an AI assistant. A person said yes to exactly this.</p>` : ''}
<p class="muted">From <b>${esc(p.merchant?.name)}</b></p>
${rows}
<div class="sum total"><span>Approved amount</span><span>${usd(p.amount_cents || 0)}</span></div>
</section>
<section class="card">
<h2>Check it yourself</h2>
<p class="small muted">Spot signs every approval with an Ed25519 key (a JWS). Anyone, whether a store, an AI agent or you, can verify it against Spot's public keys. Nothing here is a card number or an address.</p>
<p class="small"><a href="/v1/approvals/${esc(id)}">Signed record (JSON)</a> · <a href="/.well-known/spot-keys.json">Spot's public keys</a></p>
<details class="more"><summary>Raw signature</summary><p class="small" style="word-break:break-all;font-family:ui-monospace,Menlo,monospace">${esc(jws)}</p></details>
</section>
<footer><a href="/#trust">How Spot keeps AI shopping honest</a> · <a href="/terms">Terms</a></footer>`;
  return shell({ title: 'Spot: signed approval', body, head: '<meta name="robots" content="noindex">' });
}

export function notFoundPage() {
  return shell({
    title: 'Spot: not found',
    body: '<a class="brand" href="/"><span class="dot"></span>Spot</a><h1>This link doesn\'t exist</h1><p class="lead">Double-check it, or <a href="/">make your own Spot</a>.</p>',
  });
}

// Server-rendered pages. No build step: each page is one HTML string with
// inline CSS and a small inline script. Everything interpolated from a cart
// goes through esc(), and data handed to scripts goes through json().
import { usd } from './cart.js';

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
.edit-item input{padding:10px}
.x{border:0;background:transparent;font-size:20px;color:var(--muted);cursor:pointer}
.linkbox{display:flex;gap:8px;align-items:center;background:var(--bg);border:1px dashed var(--line);border-radius:12px;padding:10px 12px;word-break:break-all;font-weight:600}
.cc{border-radius:16px;padding:18px;color:#fff;background:linear-gradient(135deg,#ff5a36,#ff8a3d 60%,#ffb347);font-family:ui-monospace,Menlo,monospace;box-shadow:0 10px 30px #ff5a3640}
.cc .n{font-size:20px;letter-spacing:.08em;margin:22px 0 10px}
.cc .meta{display:flex;justify-content:space-between;font-size:13px;opacity:.9}
.hero-note{display:flex;gap:10px;align-items:flex-start;background:color-mix(in srgb,var(--spot) 10%,transparent);border-radius:14px;padding:12px 14px;margin:12px 0;font-size:14px}
.bm{display:inline-block;padding:8px 12px;border-radius:10px;background:var(--ink);color:var(--bg);font-weight:700;text-decoration:none;font-size:14px}
footer{margin-top:32px;color:var(--muted);font-size:13px;text-align:center}
.sandbox{background:#fff3cd;color:#6b4e00;border-radius:10px;padding:8px 12px;font-size:13px;font-weight:600;margin:10px 0}
@media (prefers-color-scheme:dark){.sandbox{background:#3a2f10;color:#ffd97a}}
.spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--spot);border-radius:50%;animation:rot .8s linear infinite;vertical-align:-1px}@keyframes rot{to{transform:rotate(360deg)}}
`;

function shell({ title, head = '', body, script = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="theme-color" content="#ff5a36">
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
  <p class="hint">Someone taps your link, covers it, and you check out with a card that only works at that store.</p>
</section>

<section id="check" hidden>
  <div class="card">
    <p class="small" id="checkMsg" style="margin:0 0 6px;color:var(--warn)"></p>
    <label for="merchant">Store</label><input id="merchant" placeholder="Store name">
    <label>Items</label><div id="items"></div>
    <button class="btn ghost small" id="addItem" type="button">+ Add item</button>
    <label for="extras">Shipping + tax estimate</label><input id="extras" inputmode="decimal" placeholder="0.00">
    <div id="totals" style="margin-top:12px"></div>
    <div id="nameRow"><label for="name">Your name</label><input id="name" autocomplete="given-name" placeholder="so they know who's asking"></div>
    <details class="more"><summary>more options</summary>
      <label for="settle">How the money reaches you</label>
      <select id="settle"><option value="card">One-time card for this store</option><option value="handoff">Straight to my Venmo / Cash App</option></select>
      <div class="row"><div><label for="venmo">Venmo</label><input id="venmo" placeholder="@handle"></div><div><label for="cashtag">Cash App</label><input id="cashtag" placeholder="$cashtag"></div></div>
      <label for="note">Note for them</label><input id="note" maxlength="280" placeholder="birthday list 🎂">
      <label for="email">Email (optional, for updates)</label><input id="email" type="email" autocomplete="email">
      <p class="small"><button class="textlink" id="notMe" type="button">change my name</button></p>
    </details>
    <button class="btn" id="saveCheck">Looks good →</button>
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
  <p class="small muted" style="margin-top:14px;display:flex;justify-content:space-between;gap:10px"><button class="textlink" id="edit">edit cart</button><a id="manageLink" href="#">see who pays →</a><button class="textlink" id="again">start another</button></p>
</section>

<section id="mine" class="card" hidden><h2>My Spots</h2><div id="mineList"></div></section>

<section class="card desktop-only">
  <h2>Spot from any page</h2>
  <p class="small muted" style="margin-top:0">Drag this to your bookmarks bar. On any product page, click it.</p>
  <a class="bm" href="${esc(bookmarklet)}" onclick="event.preventDefault();alert('Drag this button to your bookmarks bar.')">● Spot this</a>
</section>
<footer>Spot · cart links for anyone, anywhere</footer>
<script>window.SPOT=${json({ feeBps: cfg.feeBps, feeFixed: cfg.feeFixedCents, max: cfg.maxCartCents, provider })}</script>
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
.btn.go{font-size:19px;padding:17px;border-radius:18px;box-shadow:0 10px 24px color-mix(in srgb,var(--spot) 35%,transparent)}
.btn.go:active{transform:scale(.98)}
.namefield{display:flex;gap:8px;align-items:center;margin-top:6px}
.namefield input{padding:10px 12px}
details{margin-top:8px;color:var(--muted);font-size:14px}
details summary{cursor:pointer;font-weight:600}
details .sum{font-size:14px}
.or{text-align:center;color:var(--muted);font-size:14px;margin:10px 0}
#cardBox summary::-webkit-details-marker{display:none}
.confetti{position:fixed;inset:0;pointer-events:none;overflow:hidden}
.confetti i{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;animation:fall 1.6s ease-in forwards}
@keyframes fall{to{transform:translateY(105vh) rotate(540deg);opacity:.8}}
@media (prefers-reduced-motion:reduce){.bub{animation:none;opacity:1;transform:none}.buddy svg{animation:none}}
`;

// Inline, animatable version of the mascot: pupils follow the pointer
// (desktop) or glance at the button (phone); swaps to a happy face on pay.
function buddySvg(happy) {
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

export function payPage({ cart, links, provider, pageUrl }) {
  const name = cart.requester.name;
  const open = cart.status === 'open';
  const covered = ['paid', 'card_issued', 'completed'].includes(cart.status);
  const first = cart.items[0];
  const total = usd(cart.settle === 'card' ? cart.total_cents : cart.cart_cents);
  const ogTitle = covered ? `${cart.payer_name || 'Someone'} spotted ${name}! 🎉` : `psst… can you spot ${name}?`;
  const ogDesc = `${first.title}${cart.items.length > 1 ? ` + ${cart.items.length - 1} more` : ''} from ${cart.merchant.name} · ${usd(cart.cart_cents)} · tap to cover it`;
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
      (i) => `<div class="pcard bub"><div class="thumb" ${i.image_url ? `style="background-image:url('${esc(i.image_url)}')"` : ''}></div>
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
      products,
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
${open ? `<div class="act" id="act">${actionBox(cart, links, provider, total)}</div>` : ''}
${open && cart.settle === 'card' && provider === 'sandbox' ? '<div class="sandbox">Test mode: no real money moves.</div>' : ''}
${open ? detailsBox(cart) : ''}
<footer><a href="/">make your own Spot</a></footer>`;

  const script = `${SHARED_JS}
const buddy=$('#buddy'),pupils=buddy&&buddy.querySelector('.pupils');
function look(x,y){if(!pupils)return;const r=buddy.getBoundingClientRect(),dx=x-(r.left+r.width/2),dy=y-(r.top+r.height/2),d=Math.hypot(dx,dy)||1,k=Math.min(7,d/30);pupils.setAttribute('transform','translate('+(dx/d*k).toFixed(1)+' '+(dy/d*k).toFixed(1)+')')}
addEventListener('pointermove',e=>look(e.clientX,e.clientY),{passive:true});
const go=$('#go');if(go){const g=()=>{const r=go.getBoundingClientRect();look(r.left+r.width/2,r.top+r.height/2)};setTimeout(g,1600)}
function celebrate(payer){
  buddy.querySelector('.open').style.display='none';buddy.querySelector('.joy').style.display='';
  $('.buddy .hi').textContent='yay!';
  $('#chat').insertAdjacentHTML('beforeend','<div class="bub big" style="animation-delay:.1s">you\\'re the best'+(payer?', '+esc(payer):'')+' 🧡</div><div class="bub" style="animation-delay:.45s">I just told '+${json(esc(name))}+'. they can check out now.</div>');
  const a=$('#act');if(a)a.remove();const d=$('details');if(d)d.remove();
  const c=document.createElement('div');c.className='confetti';const cols=['#ff5a36','#ffb347','#1d8a52','#4b7bff','#ffd23f'];
  for(let i=0;i<70;i++){const p=document.createElement('i');p.style.left=Math.random()*100+'vw';p.style.background=cols[i%cols.length];p.style.animationDelay=Math.random()*.4+'s';p.style.animationDuration=1.2+Math.random()+'s';c.appendChild(p)}
  document.body.appendChild(c);setTimeout(()=>c.remove(),3000);scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
}
${open && cart.settle === 'card' ? payScript(cart, provider) : ''}`;
  return shell({ title: ogTitle, head, body, script });
}

function actionBox(cart, links, provider, total) {
  const name = esc(cart.requester.name);
  if (cart.settle === 'handoff') {
    return links
      .map((l, i) => `<a class="btn go ${i ? 'dark' : ''}" ${i ? '' : 'id="go"'} href="${esc(l.url)}" rel="noopener">Send ${total} on ${l.kind === 'venmo' ? 'Venmo' : 'Cash App'}</a>`)
      .join('');
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
  return `<details><summary>how this works</summary>
<p>${card ? `Your money goes onto a one-time card that ${esc(cart.requester.name)} can only use at ${esc(cart.merchant.name)}, for this amount. It can't be cashed out, and if it isn't used you get refunded.` : `This goes straight to ${esc(cart.requester.name)}. Spot never touches the money and charges nothing.`}</p>
<div class="sum"><span>Items</span><span>${usd(cart.subtotal_cents)}</span></div>
${cart.extras_cents ? `<div class="sum"><span>Shipping + tax (est.)</span><span>${usd(cart.extras_cents)}</span></div>` : ''}
${cart.fee_cents ? `<div class="sum"><span>Spot fee</span><span>${usd(cart.fee_cents)}</span></div>` : ''}
<div class="sum"><b>Total</b><b>${usd(card ? cart.total_cents : cart.cart_cents)}</b></div></details>`;
}

function payScript(cart, provider) {
  if (provider === 'sandbox') {
    return `$('#go').onclick=async()=>{const b=$('#go');b.disabled=true;b.textContent='spotting…';try{const name=$('#payer').value.trim();await api('/v1/carts/'+${json(cart.token)}+'/sandbox-pay',{payer_name:name});celebrate(name)}catch(e){$('#payErr').textContent=e.message;b.disabled=false;b.textContent='Try again'}};`;
  }
  return `(async()=>{try{
  const T=${json(cart.token)};const c=await api('/v1/carts/'+T+'/pay',{});
  const stripe=Stripe(c.publishable_key);
  const elements=stripe.elements({clientSecret:c.client_secret,appearance:{theme:matchMedia('(prefers-color-scheme: dark)').matches?'night':'stripe',variables:{colorPrimary:'#ff5a36',borderRadius:'12px'}}});
  const settle=async(payer)=>{$('#payErr').textContent='';
    const {error}=await stripe.confirmPayment({elements,redirect:'if_required',confirmParams:{return_url:location.href}});
    if(error){$('#payErr').textContent=error.message;return false}
    for(let i=0;i<20;i++){const r=await api('/v1/carts/'+T);if(r.cart.status!=='open')break;await new Promise(z=>setTimeout(z,1500))}
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

// ─── Requester page ─────────────────────────────────────────────────────────
export function managePage({ token, provider }) {
  const body = `
<a class="brand" href="/"><span class="dot"></span>Spot</a>
<div id="app"><p class="muted" style="margin-top:28px">Loading…</p></div>
<footer>Keep this page private. Anyone with it can see your card.</footer>`;
  const script = `${SHARED_JS}
const TOKEN=${json(token)},K=new URLSearchParams(location.search).get('k'),MODE=${json(provider)};
const STATUS={open:['Waiting for someone to cover it',''],paid:['Paid! setting up your card…','warn'],card_issued:['Covered! Your card is ready','ok'],completed:['Done','ok'],canceled:['Canceled',''],expired:['Expired',''],refunded:['Refunded','']};
let reveal=null;
const saved=()=>{try{return JSON.parse(localStorage.getItem('spot:ship'))||{}}catch{return {}}};
function orderBox(c,f,agentOn){
  const st=f&&f.state;
  if(st==='placed')return '<h2>📦 Ordered!</h2><p class="muted" style="margin:0">'+esc(c.merchant.name)+' confirmed your order'+(f.order_number?' <b>#'+esc(f.order_number)+'</b>':'')+'. Watch your email for tracking.</p>';
  if(st==='awaiting_confirm')return '<h2>Place your order?</h2>'+(f.has_shot?'<img src="/v1/carts/'+TOKEN+'/manage/order/shot.png?k='+encodeURIComponent(K)+'&t='+f.updated_at+'" alt="The store checkout, filled in" style="width:100%;border-radius:12px;border:1px solid var(--line)">':'')
    +'<div class="sum total"><span>'+esc(c.merchant.name)+' total</span><span>'+usd(f.total_cents)+'</span></div><p class="small muted">'+esc(f.summary||'')+'</p><button class="btn" id="placeIt">Place order</button><button class="btn ghost" id="notYet">Not yet</button>';
  if(st==='starting'||st==='working')return '<h2><span class="spin"></span> Ordering at '+esc(c.merchant.name)+'…</h2>'+(f.steps||[]).map(x=>'<div class="sum"><span>'+esc(x.text)+'</span><span>✓</span></div>').join('')+'<p class="small muted">Spot is filling in the store’s checkout. You’ll confirm before anything is placed.</p>';
  const s=Object.assign({name:c.requester.name,email:c.requester.email||''},c.requester.shipping||saved());
  const note=st==='needs_you'?'<p class="small" style="color:var(--warn);margin-top:0">'+esc(f.reason||'This one needs you.')+'</p>'+(f.manual_url?'<a class="btn dark" href="'+esc(f.manual_url)+'" target="_blank" rel="noopener">Open checkout at '+esc(c.merchant.name)+'</a><p class="small muted">'+(f.method==='shopify'?'Your cart and address are already filled in. ':'')+'Pay with your one-time card below.</p>':''):(st==='cancelled'?'<p class="small muted" style="margin-top:0">Nothing was ordered. Start again whenever you’re ready.</p>':'');
  const field=(n,ph,ac,extra)=>'<input name="'+n+'" placeholder="'+ph+'" autocomplete="'+ac+'" value="'+esc(s[n]||'')+'" '+(extra||'')+'>';
  return '<h2>'+(agentOn?'Want Spot to order it for you?':'Ship it to you')+'</h2>'+note
    +'<form id="shipForm">'+field('name','Full name','name','required')+'<div style="height:6px"></div>'+field('line1','Street','address-line1','required')+'<div style="height:6px"></div>'+field('line2','Apt, suite (optional)','address-line2')
    +'<div class="row" style="margin-top:6px">'+field('city','City','address-level2','required')+field('state','State','address-level1','required')+field('postal_code','ZIP','postal-code','required inputmode="numeric"')+'</div>'
    +'<div class="row" style="margin-top:6px">'+field('email','Email for the receipt','email','required type="email"')+field('phone','Phone (optional)','tel','type="tel"')+'</div>'
    +'<button class="btn">'+(agentOn?'Order it for me':'Get my checkout link')+'</button><div class="err" id="shipErr"></div></form>'
    +(agentOn?'<p class="small muted">Spot fills in '+esc(c.merchant.name)+'’s checkout with your one-time card, then shows you the total. Nothing is placed until you tap Place order.</p>':'');
}
async function draw(){
  const r=await api('/v1/carts/'+TOKEN+'/manage?k='+encodeURIComponent(K));const c=r.cart;const [label,tone]=STATUS[c.status]||[c.status,''];
  let h='<h1 style="font-size:28px">'+esc(c.merchant.name)+' cart</h1><span class="pill '+tone+'">'+label+'</span>';
  h+='<section class="card"><div class="small muted">Your link</div><div class="linkbox" style="margin-top:6px">'+esc(r.link)+'</div><div class="sum total"><span>'+(c.settle==='card'?'Card limit':'You get')+'</span><span>'+usd(c.cart_cents)+'</span></div></section>';
  if(r.needs_billing){
    h+='<section class="card"><h2>'+(c.status==='paid'?'🎉 '+esc(c.payer_name||'Someone')+' spotted you!':'One thing for your card')+'</h2><p class="small muted" style="margin-top:0">'+(c.status==='paid'?'Add your billing address and your card is ready right away.':'Add your billing address now so your card is ready the moment someone pays.')+'</p><form id="bill"><input id="b1" placeholder="Street" autocomplete="address-line1" required><div class="row" style="margin-top:6px"><input id="b2" placeholder="City" autocomplete="address-level2" required><input id="b3" placeholder="State" autocomplete="address-level1" required><input id="b4" placeholder="ZIP" autocomplete="postal-code" inputmode="numeric" required></div><button class="btn">'+(c.status==='paid'?'Get my card':'Save')+'</button><div class="err" id="billErr"></div></form></section>';
  }
  const f=c.fulfillment;
  if(c.status==='card_issued'||(f&&f.state==='placed')){
    h+='<section class="card" id="orderBox">'+orderBox(c,f,r.agent_enabled)+'</section>';
  }
  if(c.status==='card_issued'&&c.card){
    h+='<section class="card"><h2>Check out at '+esc(c.merchant.name)+'</h2><div class="cc"><div>SPOT · one-time</div><div class="n" id="ccn">•••• •••• •••• '+esc(c.card.last4)+'</div><div class="meta"><span>'+esc(c.requester.name)+'</span><span>'+String(c.card.exp_month).padStart(2,'0')+'/'+String(c.card.exp_year).slice(-2)+'</span><span id="cvc">CVC •••</span></div></div>';
    h+='<button class="btn dark" id="rev">Show card number</button><p class="small muted">Works once, only at '+esc(c.merchant.name)+', up to '+usd(c.cart_cents)+' plus a little for tax changes.</p></section>';
    if(MODE==='sandbox')h+='<section class="card"><h2>Test checkout</h2><p class="small muted" style="margin-top:0">Simulate the store charging your card.</p><label>Merchant name as the card network sees it</label><input id="sm" value="'+esc(c.merchant.name.toUpperCase())+'"><label>Amount</label><input id="sa" inputmode="decimal" value="'+(c.cart_cents/100).toFixed(2)+'"><button class="btn" id="sim">Run test charge</button><div id="simOut" class="err"></div></section>';
  }
  if(c.status==='completed'){h+='<section class="card"><h2>🎉 All done</h2><p class="muted" style="margin:0">'+(c.spent_cents?'Card used at '+esc(c.spent_merchant)+' for '+usd(c.spent_cents)+'.':'Marked as received.')+'</p></section>'}
  if(c.status==='open'&&c.settle==='handoff')h+='<button class="btn" id="got">I got the money</button>';
  if(c.status==='open')h+='<button class="btn ghost" id="cancel">Cancel this link</button>';
  if(c.status==='card_issued')h+='<button class="btn ghost" id="refund">Refund the payer</button>';
  h+='<section class="card"><h2>Activity</h2>'+r.events.map(e=>'<div class="sum"><span>'+esc(e.kind.replace(/_/g,' '))+'</span><span>'+new Date(e.at).toLocaleString()+'</span></div>').join('')+'</section>';
  $('#app').innerHTML=h;
  const on=(id,fn)=>{const el=$('#'+id);if(el)el.onclick=fn};
  on('rev',async()=>{try{reveal=reveal||await api('/v1/carts/'+TOKEN+'/manage/reveal',{k:K});$('#ccn').textContent=reveal.number.replace(/(.{4})/g,'$1 ').trim();$('#cvc').textContent='CVC '+reveal.cvc;$('#rev').textContent='Copy number';$('#rev').onclick=()=>navigator.clipboard.writeText(reveal.number)}catch(e){alert(e.message)}});
  on('sim',async()=>{const cents=Math.round(parseFloat($('#sa').value)*100);try{const d=await api('/v1/sandbox/authorize',{token:TOKEN,k:K,merchant_name:$('#sm').value,amount_cents:cents});$('#simOut').textContent=d.approved?'':'Declined: '+d.reason.replace(/_/g,' ');if(d.approved)draw()}catch(e){$('#simOut').textContent=e.message}});
  const ship=$('#shipForm');if(ship)ship.onsubmit=async(e)=>{e.preventDefault();const v=Object.fromEntries(new FormData(ship));try{localStorage.setItem('spot:ship',JSON.stringify(v))}catch{}
    const b=ship.querySelector('button');b.disabled=true;b.textContent='starting…';
    try{await api('/v1/carts/'+TOKEN+'/manage/order',{k:K,shipping:v});draw()}catch(err){$('#shipErr').textContent=err.message;b.disabled=false;b.textContent='Try again'}};
  on('placeIt',async()=>{$('#placeIt').disabled=true;$('#placeIt').textContent='placing…';await api('/v1/carts/'+TOKEN+'/manage/order/confirm',{k:K,place:true});draw()});
  on('notYet',async()=>{await api('/v1/carts/'+TOKEN+'/manage/order/confirm',{k:K,place:false});draw()});
  const bill=$('#bill');if(bill)bill.onsubmit=async(e)=>{e.preventDefault();try{await api('/v1/carts/'+TOKEN+'/manage/billing',{k:K,billing:{line1:$('#b1').value,city:$('#b2').value,state:$('#b3').value,postal_code:$('#b4').value}});draw()}catch(err){$('#billErr').textContent=err.message}};
  on('got',async()=>{await api('/v1/carts/'+TOKEN+'/manage/received',{k:K});draw()});
  on('cancel',async()=>{if(confirm('Cancel this link?')){await api('/v1/carts/'+TOKEN+'/manage/cancel',{k:K});draw()}});
  on('refund',async()=>{if(confirm('Refund the payer and cancel your card?')){await api('/v1/carts/'+TOKEN+'/manage/refund',{k:K});draw()}});
  // keep watching for payment, but never redraw under someone typing
  const live=f&&['starting','working','awaiting_confirm'].includes(f.state);
  if(['open','paid'].includes(c.status)||live)setTimeout(function again(){const typing=document.activeElement?.tagName==='INPUT'||[...document.querySelectorAll('#bill input')].some(i=>i.value);typing?setTimeout(again,4000):draw()},live?2000:4000);
}
draw().catch(e=>{$('#app').innerHTML='<p class="err">'+esc(e.message)+'</p>'});`;
  return shell({ title: 'My Spot', body, script, head: '<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">' });
}

export function notFoundPage() {
  return shell({
    title: 'Spot: not found',
    body: '<a class="brand" href="/"><span class="dot"></span>Spot</a><h1>This link doesn\'t exist</h1><p class="lead">Double-check it, or <a href="/">make your own Spot</a>.</p>',
  });
}

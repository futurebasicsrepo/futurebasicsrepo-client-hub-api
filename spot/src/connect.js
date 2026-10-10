// /connect: the shortest path from "I use Claude or ChatGPT" to "my AI can
// shop with Spot". Copy one link, paste it in the app, sign in and Allow
// (with spending caps already filled in), then just ask.
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Things to say once it's connected: tap one to copy it.
const PROMPTS = [
  ['🏀', 'Find a highly rated over-the-door basketball hoop under $100 and send me a Spot.'],
  ['🚆', 'Earliest train to New York on Saturday morning. Hold it and send it to me.'],
  ['👟', 'Find black trail runners in my size and ask my mom to get them for my birthday.'],
  ['✈️', 'Nonstop flight to SFO on the 17th, morning. Hold the fare for me.'],
];

const APPS = {
  claude: {
    name: 'Claude',
    open: 'https://claude.ai/settings/connectors',
    steps: ['Open <b>Settings → Connectors</b>.', 'Tap <b>Add custom connector</b>, paste the link, tap <b>Add</b>.', 'Tap <b>Connect</b>.'],
  },
  chatgpt: {
    name: 'ChatGPT',
    open: 'https://chatgpt.com/',
    steps: ['Open <b>Settings → Apps &amp; Connectors</b>. Don’t see Create? Turn on <b>Developer mode</b> under Advanced.', 'Tap <b>Create</b>, paste the link, choose <b>OAuth</b>.', 'Tap <b>Connect</b>.'],
  },
  other: {
    name: 'another app',
    open: null,
    steps: ['Add a remote <b>MCP server</b> with the link.', 'If it asks how to sign in, choose <b>OAuth</b>.', 'No sign-in option? Get a key under <a href="/account#ai">AI &amp; card</a> instead.'],
  },
};

const CSS = `
.cx{padding:34px 0 70px}
.cx .wrap{max-width:760px}
.cx h1{font-size:clamp(34px,7vw,56px);letter-spacing:-.03em;line-height:1.02;margin:10px 0 10px}
.cx .lead{color:var(--muted);font-size:clamp(17px,2.4vw,20px);margin:0 0 22px}
.cx .apps{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.cx .apps button{font:700 15px Bricolage,system-ui,sans-serif;border:1.5px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:10px 16px;cursor:pointer}
.cx .apps button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.cx .step{display:grid;grid-template-columns:40px 1fr;gap:14px;background:var(--card);border:1.5px solid var(--line);border-radius:22px;padding:18px;margin:0 0 10px}
.cx .num{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--spot);color:#fff;font-weight:800;font-size:18px}
.cx .step h2{font-size:19px;margin:6px 0 6px;letter-spacing:-.01em}
.cx .step p,.cx .step li{color:var(--muted);font-size:15px;margin:0}
.cx .step ol{margin:0;padding-left:18px;display:grid;gap:4px}
.cx .linkbox{display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap}
.cx .linkbox code{flex:1;min-width:0;overflow-wrap:anywhere;background:var(--bg);border:1.5px dashed var(--line);border-radius:12px;padding:12px 14px;font-size:15px;color:var(--ink)}
.cx .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.cx .say{display:grid;gap:8px;margin-top:10px}
.cx .say button{display:flex;gap:10px;align-items:flex-start;text-align:left;font:inherit;font-size:15px;background:var(--bg);color:var(--ink);border:1.5px solid var(--line);border-radius:16px;padding:12px 14px;cursor:pointer}
.cx .say button:hover{border-color:var(--spot)}
.cx .say button em{font-style:normal;margin-left:auto;color:var(--muted);font-size:13px;white-space:nowrap;padding-left:8px}
.cx .say button.ok em{color:var(--ok)}
.cx .safe{list-style:none;padding:0;margin:18px 0 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}
.cx .safe li{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 14px 12px 40px;position:relative;font-size:15px}
.cx .safe li::before{content:"✓";position:absolute;left:14px;top:11px;color:var(--ok);font-weight:800}
.cx .alt{margin-top:22px;color:var(--muted);font-size:15px}
.cx .alt a{color:var(--ink)}
@media (max-width:520px){.cx .step{grid-template-columns:30px 1fr;gap:10px;padding:16px 14px}.cx .num{width:30px;height:30px;font-size:15px}.cx .step h2{margin-top:2px}}
`;

export function connectPage({ origin }) {
  const link = `${origin}/mcp`;
  const steps = (k) => `<ol>${APPS[k].steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
  return `${siteHead({ title: 'Add Spot to your AI · Spot', desc: 'Add Spot to Claude or ChatGPT in about a minute. Your AI shops, you say yes.', origin, path: '/connect', extraCss: CSS })}
${siteNav('connect')}
<main class="cx"><div class="wrap">
  <p class="kicker">About a minute, once</p>
  <h1>Add Spot to your AI</h1>
  <p class="lead">Then just ask for things. Your AI finds them, and nothing is bought until you, or whoever’s paying, says yes.</p>
  <div class="apps" role="group" aria-label="Which app">${Object.entries(APPS).map(([k, a], i) => `<button type="button" data-app="${k}" aria-pressed="${i === 0}">${k === 'other' ? 'Other MCP apps' : esc(a.name)}</button>`).join('')}</div>

  <section class="step"><span class="num">1</span><div><h2>Copy your Spot link</h2><p>It’s the same for everyone. Signing in comes next.</p>
    <div class="linkbox"><code id="mcpLink">${esc(link)}</code><button class="btn primary" type="button" id="copyLink">Copy</button></div></div></section>

  <section class="step"><span class="num">2</span><div><h2>Paste it in <span id="appName">Claude</span></h2>
    ${Object.keys(APPS).map((k, i) => `<div data-steps="${k}"${i ? ' hidden' : ''}>${steps(k)}${APPS[k].open ? `<div class="row"><a class="btn ghost" href="${APPS[k].open}" target="_blank" rel="noopener">Open ${esc(APPS[k].name)} ↗</a></div>` : ''}</div>`).join('')}
  </div></section>

  <section class="step"><span class="num">3</span><div><h2>Sign in to Spot and tap Allow</h2><p>A code to your email or phone, no password. Spending caps are already filled in: <b>$100 an order, $500 a month</b>. Change them right there, or later.</p></div></section>

  <section class="step"><span class="num">4</span><div><h2>Just ask</h2><p>Tap one to copy it, then paste it in your chat.</p>
    <div class="say">${PROMPTS.map(([e, p]) => `<button type="button" data-copy="${esc(p)}"><span aria-hidden="true">${e}</span><span>${esc(p)}</span><em>Copy</em></button>`).join('')}</div></div></section>

  <ul class="safe" aria-label="What keeps it safe">
    <li>Your AI never sees a card number</li>
    <li>Every purchase waits for a yes, unless you turn on auto-pay</li>
    <li>Caps per order and per month, and only the stores you pick</li>
    <li>Stop all AI spending with one tap</li>
  </ul>
  <p class="alt">No AI? <a href="/new">Make a Spot link by hand</a> · Building an agent? <a href="/integrations#builders">Developer docs</a> · <a href="/standards">Open standards Spot supports</a></p>
</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}
const NAMES=${JSON.stringify(Object.fromEntries(Object.entries(APPS).map(([k, a]) => [k, a.name])))};
const copy=async(text,btn,label)=>{try{await navigator.clipboard.writeText(text)}catch{const r=document.createRange();const n=document.getElementById('mcpLink');r.selectNodeContents(n);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('copy')}
  const t=btn.querySelector('em')||btn;const old=t.textContent;t.textContent='Copied ✓';btn.classList.add('ok');setTimeout(()=>{t.textContent=old;btn.classList.remove('ok')},1800)};
document.getElementById('copyLink').onclick=e=>copy(document.getElementById('mcpLink').textContent,e.currentTarget);
document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>copy(b.dataset.copy,b));
const pick=k=>{document.querySelectorAll('[data-app]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.app===k)));
  document.querySelectorAll('[data-steps]').forEach(d=>d.hidden=d.dataset.steps!==k);document.getElementById('appName').textContent=NAMES[k];try{history.replaceState(null,'','#'+k)}catch{}};
document.querySelectorAll('[data-app]').forEach(b=>b.onclick=()=>pick(b.dataset.app));
const h=location.hash.slice(1);if(NAMES[h])pick(h);
})();</script>
</body></html>`;
}

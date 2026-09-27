// /integrations: every way to Spot something, marked honestly as available
// now or coming soon. "Coming soon" items take a notify-me signup.
import { EXTENSION_VERSION } from './extension.js';
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const COMING_SOON = [
  { slug: 'shopify-app', icon: '🛍️', name: 'Shopify app', text: 'One-click install for stores: a “Spot it” button on product pages and at checkout, with no theme editing.' },
  { slug: 'marketplace', icon: '🏷️', name: 'Facebook Marketplace', text: 'Spot a Marketplace listing and have someone else cover it.' },
  { slug: 'ios', icon: '📱', name: 'iPhone share sheet', text: 'Share any product from any app straight to Spot. Screenshots too.' },
  { slug: 'safari-firefox', icon: '🧭', name: 'Safari & Firefox', text: 'The Spot this extension for the other big browsers.' },
  { slug: 'chatgpt', icon: '💬', name: 'ChatGPT app', text: 'Ask someone to pay without leaving the chat.' },
  { slug: 'woocommerce', icon: '🧩', name: 'WooCommerce & BigCommerce', text: 'The store button for more platforms.' },
];

const CSS = `
.ihero{padding:70px 0 40px}
.ihero h1{font-size:clamp(40px,6vw,68px)}
.jump{display:flex;flex-wrap:wrap;gap:8px;margin-top:26px}
.jump a{padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);text-decoration:none;font-weight:600;font-size:14px}
.igrid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:30px}
.icard{min-width:0;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:28px;display:flex;flex-direction:column;gap:12px;scroll-margin-top:90px}
.icard.wide{grid-column:1/-1}
.icard .top{display:flex;align-items:center;gap:12px}
.icard .ic{width:48px;height:48px;border-radius:14px;background:var(--bg2);display:grid;place-items:center;font-size:24px;flex:none}
.badge{margin-left:auto;font-size:12px;font-weight:800;padding:4px 10px;border-radius:99px;letter-spacing:.02em}
.badge.live{background:color-mix(in srgb,var(--ok) 15%,transparent);color:var(--ok)}
.badge.soon{background:var(--bg2);color:var(--muted)}
.icard p{color:var(--muted)}
.icard ol{margin:0;padding-left:20px;color:var(--muted)}.icard ol li{margin:4px 0}
.icard code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;background:var(--bg2);padding:1px 6px;border-radius:6px}
.codebox{position:relative}
.codebox pre{background:var(--night2);color:#e9e2d8;border-radius:14px;padding:44px 18px 18px;overflow-x:auto;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;margin:0;border:1px solid #2e2821}
.codebox .copy{position:absolute;top:10px;right:10px;border:0;border-radius:8px;padding:6px 10px;font:600 13px Bricolage,system-ui;background:#3a322a;color:#f4efe8;cursor:pointer}
.row2{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.soon-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:30px}
.soon{min-width:0;background:var(--card);border:1px dashed var(--line);border-radius:18px;padding:20px;display:flex;flex-direction:column;gap:8px}
.soon .top{display:flex;gap:10px;align-items:center;font-weight:800;line-height:1.2}
.soon .badge{padding:3px 8px;flex:none}
.soon p{color:var(--muted);font-size:15px}
.soon form{display:flex;gap:6px;margin-top:auto}
.soon input{flex:1;min-width:0;font:inherit;font-size:14px;padding:9px 12px;border-radius:99px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
.soon button{border:0;border-radius:99px;padding:9px 14px;font:700 14px Bricolage,system-ui;background:var(--ink);color:var(--bg);cursor:pointer}
.soon .ok{color:var(--ok);font-weight:700;font-size:14px}
.demo-btn{display:inline-flex;align-items:center;gap:8px;background:#ff5a36;color:#fff;border-radius:10px;padding:11px 16px;font-weight:700;text-decoration:none}
@media (max-width:860px){.igrid{grid-template-columns:1fr}.soon-grid{grid-template-columns:1fr}}
`;

const code = (id, text) => `<div class="codebox"><pre id="${id}">${esc(text)}</pre><button class="copy" data-copy="${id}">Copy</button></div>`;

export function integrationsPage({ origin }) {
  const mcp = JSON.stringify({ mcpServers: { spot: { url: `${origin}/mcp`, headers: { Authorization: 'Bearer YOUR_SPOT_KEY' } } } }, null, 2);
  const rest = `curl -X POST ${origin}/v1/agent/asks \\
  -H "Authorization: Bearer YOUR_SPOT_KEY" \\
  -H "content-type: application/json" \\
  -d '{"requester":{"name":"Kyle"},"url":"https://store.example/products/jacket"}'`;
  const shopify = `{%- comment -%} Spot: let shoppers ask someone else to pay {%- endcomment -%}
<a href="${origin}/new?url={{ shop.url | append: product.url | url_encode }}"
   target="_blank" rel="noopener"
   style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:12px 18px;border-radius:10px;background:#ff5a36;color:#fff;font-weight:700;text-decoration:none">
  <span style="width:10px;height:10px;border-radius:50%;background:#fff"></span>
  Ask someone to spot me
</a>`;
  const anySite = `<a href="#" onclick="window.open('${origin}/new?url='+encodeURIComponent(location.href),'_blank');return false"
   style="display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:10px;background:#ff5a36;color:#fff;font-weight:700;text-decoration:none">
  <span style="width:10px;height:10px;border-radius:50%;background:#fff"></span>
  Ask someone to spot me
</a>`;
  const bookmarklet = `javascript:location.href=${JSON.stringify(`${origin}/new?url=`)}+encodeURIComponent(location.href)`;

  const body = `${siteNav('integrations')}
<header class="ihero"><div class="wrap">
  <p class="kicker">Integrations</p>
  <h1>Spot from anywhere.</h1>
  <p class="lead">Your browser, your store, your AI assistant. Every way to turn “I want this” into a link someone else can pay.</p>
  <div class="jump"><a href="#extension">Browser extension</a><a href="#mcp">AI assistants (MCP)</a><a href="#api">REST API</a><a href="#shopify">Shopify button</a><a href="#website">Any website</a><a href="#bookmarklet">Bookmarklet</a><a href="#soon">Coming soon</a></div>
</div></header>

<section style="padding-bottom:60px"><div class="wrap"><div class="igrid">

  <div class="icard wide reveal" id="extension">
    <div class="top"><div class="ic">🧩</div><h3>Spot this: browser extension</h3><span class="badge live">Available · v${EXTENSION_VERSION}</span></div>
    <p>One click (or <code>Alt</code>+<code>Shift</code>+<code>S</code>) on any product page and it’s a Spot. Right-click a link to Spot it, or highlight text like “black trail runners 10.5” to have Spot find it. Works in Chrome, Edge, Brave and Arc. It reads nothing on the page: it only sends the address to Spot.</p>
    <div class="row2"><a class="btn primary" href="/downloads/spot-extension.zip" download>Download for Chrome →</a><span class="muted" style="font-size:14px">Chrome Web Store listing coming soon</span></div>
    <ol><li>Unzip the download somewhere you’ll keep it.</li><li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b>.</li><li>Click <b>Load unpacked</b>, choose the folder, and pin <b>Spot this</b> to your toolbar.</li></ol>
  </div>

  <div class="icard reveal" id="mcp">
    <div class="top"><div class="ic">🤖</div><h3>AI assistants (MCP)</h3><span class="badge live">Available</span></div>
    <p>Give Claude, or any app that speaks MCP, three tools: <code>create_spot_ask</code>, <code>get_spot_ask</code> and <code>order_spot_ask</code>. Your assistant finds it, asks someone to pay, and orders it once they do.</p>
    ${code('mcpcfg', mcp)}
    <div class="row2"><a class="btn ghost" href="/#join" data-kind="agent">Get an API key</a></div>
  </div>

  <div class="icard reveal" id="api">
    <div class="top"><div class="ic">⚡️</div><h3>REST API</h3><span class="badge live">Available</span></div>
    <p>The same three actions over HTTP: <code>POST /v1/agent/asks</code>, <code>GET /v1/agent/asks/:id</code>, <code>POST /v1/agent/asks/:id/order</code>. Send items, a product link, or a plain description.</p>
    ${code('restcurl', rest)}
  </div>

  <div class="icard reveal" id="shopify">
    <div class="top"><div class="ic">🛍️</div><h3>Shopify store button</h3><span class="badge live">Available</span></div>
    <p>Let shoppers ask someone else to pay: a friend or parent covers it, and you still get the order. Paste this into your product template (<b>Online Store → Themes → Edit code</b>, e.g. <code>main-product.liquid</code>, below the buy buttons).</p>
    ${code('shopifycode', shopify)}
    <p style="font-size:14px">A one-click Shopify app is <a href="#soon">coming soon</a>.</p>
  </div>

  <div class="icard reveal" id="website">
    <div class="top"><div class="ic">🌐</div><h3>Button for any website</h3><span class="badge live">Available</span></div>
    <p>Any store platform, any page: this button sends the current page to Spot.</p>
    ${code('anysite', anySite)}
    <p style="font-size:14px">Try it: <a class="demo-btn" href="/new?url=${encodeURIComponent(`${origin}/`)}">● Ask someone to spot me</a></p>
  </div>

  <div class="icard wide reveal" id="bookmarklet">
    <div class="top"><div class="ic">🔖</div><h3>Bookmarklet</h3><span class="badge live">Available</span></div>
    <p>No install at all: drag this to your bookmarks bar, then click it on any product page. Works in every desktop browser.</p>
    <div class="row2"><a class="btn primary" href="${esc(bookmarklet)}" onclick="event.preventDefault();alert('Drag this button to your bookmarks bar.')">● Spot this</a><span class="muted" style="font-size:14px">← drag me</span></div>
  </div>

</div>

<h2 class="reveal" id="soon" style="margin-top:90px;scroll-margin-top:90px">Coming soon</h2>
<p class="lead reveal">Tell us which you want first. We’ll email you when it’s ready.</p>
<div class="soon-grid">
${COMING_SOON.map(
  (c) => `  <div class="soon reveal"><div class="top"><span>${c.icon}</span>${esc(c.name)}<span class="badge soon" style="margin-left:auto">Soon</span></div><p>${esc(c.text)}</p>
    <form data-notify="${c.slug}"><input type="email" required placeholder="you@email.com" aria-label="Email for ${esc(c.name)} updates"><button>Notify me</button></form></div>`,
).join('\n')}
</div>
</div></section>
${siteFooter()}
<script>
(()=>{
${SITE_JS}
  document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy',1600)}catch{}
  }));
  document.querySelectorAll('form[data-notify]').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const btn=f.querySelector('button');btn.disabled=true;
    try{await joinList({email:f.querySelector('input').value,kind:'notify:'+f.dataset.notify});f.outerHTML='<p class="ok">You’re on the list 🧡</p>'}catch(err){btn.disabled=false;btn.textContent='Try again'}}));
})();
</script>
</body></html>`;

  return siteHead({
    title: 'Spot integrations: browser extension, AI assistants, Shopify and more',
    desc: 'Spot from anywhere: a Chrome extension, an MCP server for AI assistants, a REST API, a Shopify store button, and more on the way.',
    origin,
    path: '/integrations',
    extraCss: CSS,
  }) + body;
}

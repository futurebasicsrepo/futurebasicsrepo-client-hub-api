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
.keyform{display:flex;gap:8px;flex-wrap:wrap}.keyform input{font:inherit;font-size:15px;padding:11px 14px;border-radius:999px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);flex:1 1 180px;min-width:0}.keyform[hidden]{display:none}
.keyout{margin:0;font-weight:600;color:var(--spot);font-size:15px}.keyout:empty{display:none}
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
  const button = `<!-- Spot: put this by your checkout -->
<div data-spot-button></div>
<script src="${origin}/embed/button.js" data-key="spk_YOUR_KEY" async></script>
<script>
  // Tell Spot what's in the cart when the shopper taps the button.
  window.SpotCart = () => ({
    items: [{ title: "Trail Jacket", variant: "M", quantity: 1, price_cents: 18900,
              url: "https://yourstore.com/products/trail-jacket" }],
    extras_cents: 800 // shipping + tax estimate
  });
</script>`;
  const verify = `https://yourstore.com/.well-known/spot-merchant.txt
spot-merchant=mer_…   (from your registration)`;
  const bookmarklet = `javascript:location.href=${JSON.stringify(`${origin}/new?url=`)}+encodeURIComponent(location.href)`;

  const body = `${siteNav('integrations')}
<header class="ihero"><div class="wrap">
  <p class="kicker">Integrations</p>
  <h1>The yes button, everywhere.</h1>
  <p class="lead">For AI builders, for stores, and for shoppers. Every way to turn “I want this” into a yes from the right person.</p>
  <div class="jump"><a href="#builders">For AI builders</a><a href="#stores">For stores</a><a href="#shoppers">For shoppers</a><a href="#soon">Coming soon</a></div>
</div></header>

<section style="padding-bottom:60px"><div class="wrap">
<h2 class="reveal" id="builders" style="scroll-margin-top:90px">For AI builders</h2>
<p class="lead reveal">Your agent builds the cart. Spot gets a person’s yes, enforces your user’s rules, and hands back signed proof. Your agent never touches a card number.</p>
<div class="igrid">







  <div class="icard reveal" id="mcp">
    <div class="top"><div class="ic">🤖</div><h3>AI assistants (MCP)</h3><span class="badge live">Available</span></div>
    <p>Give Claude, or any app that speaks MCP, Spot’s tools. Your assistant can ask someone else to pay (<code>create_spot_ask</code>), text you a cart or a flight to finish on your phone (<code>for_me</code>, <code>search_flights</code>, <code>create_flight_ask</code>), and order once it’s paid (<code>order_spot_ask</code>).</p>
    <p><b>In Claude or ChatGPT, no key needed:</b> add a custom connector with <code>${origin}/mcp</code>. You sign in to Spot and tap Allow. In Claude: Settings → Connectors → Add custom connector. In ChatGPT: Settings → Apps &amp; Connectors → Create, with OAuth. Spot supports MCP OAuth with dynamic client registration and PKCE.</p>
    <p style="margin-bottom:6px"><b>Other apps:</b> get a key and paste the config below.</p>
    <form class="keyform" id="keyForm"><input type="email" name="email" required placeholder="you@email.com" aria-label="Email" autocomplete="email"><input name="agent_name" placeholder="Agent name (optional)" aria-label="Agent name" maxlength="24"><button class="btn primary">Get a free key</button></form>
    <p class="keyout" id="keyOut" aria-live="polite"></p>
    ${code('mcpcfg', mcp)}
    <p style="font-size:14px">Free keys cover 100 asks and 20 texts or emails a day. Your key is shown once, so paste it somewhere safe.</p>
  </div>
  <div class="icard reveal" id="api">
    <div class="top"><div class="ic">⚡️</div><h3>REST API</h3><span class="badge live">Available</span></div>
    <p>The same actions over HTTP: <code>POST /v1/agent/asks</code>, <code>GET /v1/agent/asks/:id</code>, <code>POST /v1/agent/asks/:id/order</code>. Send items, a product link, or a plain description.</p>
    ${code('restcurl', rest)}
  </div>
  <div class="icard wide reveal" id="trust">
    <div class="top"><div class="ic">🔏</div><h3>Rules, approvals and signatures</h3><span class="badge live">Available</span></div>
    <ol>
      <li><b>Your user’s rules are enforced for you.</b> Keys made from a Spot account carry that person’s limits (per order, per month, allowed stores). Outside them, <code>create_spot_ask</code> returns <code>403</code> with the reason, or sends the ask to their approver and says so in <code>sent_to_approver</code>.</li>
      <li><b>Several stores, one ask.</b> Pass <code>stores</code> (2–5, each with its own items) instead of <code>items</code>: one link and one payment, and Spot orders from each store. <code>get_spot_ask</code> shows each store’s status and order.</li>
      <li><b>Pay at the store.</b> For stores that support agent checkout (UCP), asks default to <code>pay_at_store</code>: the payer pays the store on its own checkout, and there’s no Spot fee.</li>
      <li><b>Signed approvals.</b> Once a person pays or places the order, <code>get_spot_ask</code> returns <code>approvals</code> and <code>approval_url</code>: an EdDSA-signed JWS of exactly what was approved. Verify it against <a href="/.well-known/spot-keys.json"><code>/.well-known/spot-keys.json</code></a>.</li>
      <li><b>Personal Agent Protocol.</b> PAP agents find Spot at <a href="/.well-known/poppy.json"><code>/.well-known/poppy.json</code></a> (draft 0.1): sign in with an https <code>client_id</code> and <code>private_key_jwt</code>, start a session with the JWT bearer grant, and call the MCP server. Guest sessions can send asks; signing in applies the person’s rules. Signed approvals are the <code>spotmeplease.com/approvals</code> extension.</li>
      <li><b>Signed requests.</b> Spot signs its requests to stores with HTTP Message Signatures (RFC 9421, Web Bot Auth). Keys: <a href="/.well-known/http-message-signatures-directory"><code>/.well-known/http-message-signatures-directory</code></a>.</li>
    </ol>
  </div>
</div>

<h2 class="reveal" id="stores" style="margin-top:90px;scroll-margin-top:90px">For stores</h2>
<p class="lead reveal">Don’t lose the sale to “I’ll ask my mom.” Let shoppers send the cart to whoever’s paying, and you get the order.</p>
<div class="igrid">
  <div class="icard wide reveal" id="storebutton">
    <div class="top"><div class="ic">🛍️</div><h3>“Ask someone to pay” button</h3><span class="badge live">Available</span></div>
    <p>Shoppers who’d otherwise leave to “ask my mom” tap this instead. Their cart, at your prices, opens in Spot ready to send. If your store supports agent checkout (UCP), the payer pays you directly on your own checkout, so you’re the seller and there’s no Spot fee. Otherwise Spot buys it from you and ships it to them.</p>
    <form class="keyform" id="merchForm"><input name="name" required placeholder="Store name" aria-label="Store name" maxlength="60"><input name="domain" required placeholder="yourstore.com" aria-label="Store domain"><input type="email" name="email" required placeholder="you@yourstore.com" aria-label="Email" autocomplete="email"><button class="btn primary">Get a key</button></form>
    <p class="keyout" id="merchOut" aria-live="polite"></p>
    ${code('buttoncode', button)}
    <p style="font-size:14px">The key is publishable: it only works from pages on your domain. Or set <code>data-items</code> on the div instead of <code>window.SpotCart</code>.</p>
    <h4 style="margin:6px 0 0">Verify your domain for a ✓</h4>
    <p>Put a text file here with the line from your registration, then press Verify. Payers see “sent from Your Store’s checkout ✓”.</p>
    ${code('verifycode', verify)}
    <div class="row2"><button class="btn ghost" id="verifyBtn" hidden>Verify my domain</button><span class="keyout" id="verifyOut"></span></div>
  </div>
  <div class="icard reveal" id="shopify">
    <div class="top"><div class="ic">🛍️</div><h3>Shopify: no-code link</h3><span class="badge live">Available</span></div>
    <p>A simpler link that sends the product page to Spot, with no key. Paste this into your product template (<b>Online Store → Themes → Edit code</b>, e.g. <code>main-product.liquid</code>, below the buy buttons).</p>
    ${code('shopifycode', shopify)}
    <p style="font-size:14px">A one-click Shopify app is <a href="#soon">coming soon</a>.</p>
  </div>
  <div class="icard reveal" id="website">
    <div class="top"><div class="ic">🌐</div><h3>Button for any website</h3><span class="badge live">Available</span></div>
    <p>Any store platform, any page: this button sends the current page to Spot.</p>
    ${code('anysite', anySite)}
    <p style="font-size:14px">Try it: <a class="demo-btn" href="/new?url=${encodeURIComponent(`${origin}/`)}">● Ask someone to spot me</a></p>
  </div>
</div>

<h2 class="reveal" id="shoppers" style="margin-top:90px;scroll-margin-top:90px">For shoppers</h2>
<div class="igrid">
  <div class="icard wide reveal" id="extension">
    <div class="top"><div class="ic">🧩</div><h3>Spot this: browser extension</h3><span class="badge live">Available · v${EXTENSION_VERSION}</span></div>
    <p>One click (or <code>Alt</code>+<code>Shift</code>+<code>S</code>) on any product page and it’s a Spot. Right-click a link to Spot it, or highlight text like “black trail runners 10.5” to have Spot find it. Works in Chrome, Edge, Brave and Arc. It reads nothing on the page: it only sends the address to Spot.</p>
    <div class="row2"><a class="btn primary" href="/downloads/spot-extension.zip" download>Download for Chrome →</a><span class="muted" style="font-size:14px">Chrome Web Store listing coming soon</span></div>
    <ol><li>Unzip the download somewhere you’ll keep it.</li><li>Open <code>chrome://extensions</code> and turn on <b>Developer mode</b>.</li><li>Click <b>Load unpacked</b>, choose the folder, and pin <b>Spot this</b> to your toolbar.</li></ol>
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
  const kf=document.getElementById('keyForm'),ko=document.getElementById('keyOut');
  kf&&kf.addEventListener('submit',async e=>{e.preventDefault();const b=kf.querySelector('button');b.disabled=true;ko.textContent='';
    try{const r=await fetch('/v1/agent/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(kf)))});const d=await r.json();if(!r.ok)throw new Error(d.error||'Try again');
      const pre=document.getElementById('mcpcfg');pre.textContent=pre.textContent.replace(/Bearer [^"]+/,'Bearer '+d.api_key);
      ko.innerHTML='Your key is in the config below. It’s shown once, so copy it now 🧡';kf.hidden=true}
    catch(err){ko.textContent=err.message;b.disabled=false}});
  const mf=document.getElementById('merchForm'),mo=document.getElementById('merchOut'),vb=document.getElementById('verifyBtn'),vo=document.getElementById('verifyOut');let merchant=null;
  mf&&mf.addEventListener('submit',async e=>{e.preventDefault();const b=mf.querySelector('button');b.disabled=true;mo.textContent='';
    try{const r=await fetch('/v1/merchants',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(mf)))});const d=await r.json();if(!r.ok)throw new Error(d.error||'Try again');merchant=d;
      const pre=document.getElementById('buttoncode');pre.textContent=pre.textContent.replace(/spk_YOUR_KEY/,d.publishable_key).split('https://yourstore.com').join('https://'+d.verify.url.split('/')[2]);
      document.getElementById('verifycode').textContent=d.verify.url+'\\n'+d.verify.content;
      mo.textContent='Your key is in the snippet below. Next, verify your domain for the ✓.';mf.hidden=true;vb.hidden=false}
    catch(err){mo.textContent=err.message;b.disabled=false}});
  vb&&vb.addEventListener('click',async()=>{vb.disabled=true;vo.textContent='';
    try{const r=await fetch('/v1/merchants/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({merchant_id:merchant.merchant_id})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Try again');vo.textContent='Verified ✓ '+d.domain;vb.hidden=true}
    catch(err){vo.textContent=err.message;vb.disabled=false}});
  document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(document.getElementById(b.dataset.copy).textContent);b.textContent='Copied ✓';setTimeout(()=>b.textContent='Copy',1600)}catch{}
  }));
  document.querySelectorAll('form[data-notify]').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const btn=f.querySelector('button');btn.disabled=true;
    try{await joinList({email:f.querySelector('input').value,kind:'notify:'+f.dataset.notify});f.outerHTML='<p class="ok">You’re on the list 🧡</p>'}catch(err){btn.disabled=false;btn.textContent='Try again'}}));
})();
</script>
</body></html>`;

  return siteHead({
    title: 'Spot integrations: for AI builders, stores and shoppers',
    desc: 'The yes button for AI shopping: an MCP server and REST API with rules, approvals and signed receipts for AI builders; an “Ask someone to pay” button for stores; an extension for shoppers.',
    origin,
    path: '/integrations',
    extraCss: CSS,
  }) + body;
}

// The public website at "/". The app itself lives at /new.
// Visuals are the real product: the share card is rendered by sharecard.js
// (/site/card-*.png) and the mascot is the same SVG the app uses.
import { buddySvg } from './pages.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-400.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-600.woff2) format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-800.woff2) format('woff2');font-weight:800;font-display:swap}
:root{--bg:#fbf7f1;--bg2:#f4ece1;--card:#fff;--ink:#1b1712;--muted:#6f675c;--line:#e8e0d4;--spot:#ff5a36;--spot2:#ffb347;--ok:#1d8a52;--night:#16130f;--night2:#221d18;--radius:22px}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--bg2:#1b1814;--card:#1f1b17;--ink:#f4efe8;--muted:#a79e92;--line:#322d27;--spot:#ff6a47;--night:#0e0c0a;--night2:#1a1612}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 Bricolage,ui-sans-serif,-apple-system,system-ui,sans-serif;overflow-x:hidden}
a{color:inherit}img{max-width:100%;height:auto;display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-weight:800;letter-spacing:-.035em;line-height:1.02;margin:0}
h1{font-size:clamp(44px,7.4vw,86px)}h2{font-size:clamp(34px,5vw,56px)}h3{font-size:22px;letter-spacing:-.02em;line-height:1.15}
p{margin:0}.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:15px 24px;font-weight:800;font-size:17px;text-decoration:none;border:0;cursor:pointer;font-family:inherit;transition:transform .15s}
.btn:active{transform:scale(.97)}
.btn.primary{background:var(--spot);color:#fff;box-shadow:0 10px 28px color-mix(in srgb,var(--spot) 35%,transparent)}
.btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.pill{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;padding:7px 13px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.pill i{width:8px;height:8px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 4px color-mix(in srgb,var(--spot) 22%,transparent)}
.sec{padding:110px 0}.sec.alt{background:var(--bg2)}
.kicker{font-weight:600;color:var(--spot);letter-spacing:.02em;margin-bottom:14px;font-size:15px}
.lead{font-size:clamp(18px,2vw,21px);color:var(--muted);max-width:640px;margin-top:18px}

/* nav */
nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .2s}
nav.scrolled{border-bottom-color:var(--line)}
nav .wrap{display:flex;align-items:center;gap:22px;height:66px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;letter-spacing:-.03em;text-decoration:none}
.logo span{width:22px;height:22px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 5px color-mix(in srgb,var(--spot) 22%,transparent)}
nav .links{display:flex;gap:22px;margin-left:auto;font-weight:600;font-size:15px}
nav .links a{text-decoration:none;color:var(--muted)}nav .links a:hover{color:var(--ink)}
nav .btn{padding:10px 18px;font-size:15px}
@media (max-width:760px){nav .links{display:none}nav .btn{margin-left:auto}}

/* hero */
.hero{padding:64px 0 90px;position:relative}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
.hero h1 em{font-style:normal;color:var(--spot)}
.hero .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.hero .fine{margin-top:16px;font-size:14px;color:var(--muted)}
.hero .buddy{position:absolute;right:max(2vw,8px);top:14px;width:84px;height:84px;animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-6px)}}
@media (max-width:900px){.hero .grid{grid-template-columns:1fr}.hero .buddy{display:none}.hero{padding-top:36px}}

/* phone */
.phone{width:min(360px,100%);margin:0 auto;border-radius:48px;background:#0d0d0f;padding:12px;box-shadow:0 40px 80px rgba(27,23,18,.22),0 0 0 1px rgba(0,0,0,.08);transform:rotate(2deg)}
.screen{background:#fff;border-radius:38px;height:620px;overflow:hidden;position:relative;color:#000;font-family:-apple-system,system-ui,sans-serif}
.screen .top{display:flex;flex-direction:column;align-items:center;padding:30px 0 10px;border-bottom:1px solid #eee;background:#f8f8f8}
.screen .avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#b8a99a,#8c7b6b);color:#fff;display:grid;place-items:center;font-weight:600}
.screen .who{font-size:12px;margin-top:4px;color:#333}
.thread{padding:14px 12px;display:flex;flex-direction:column;gap:7px}
.b{max-width:78%;padding:8px 13px;border-radius:19px;font-size:15px;line-height:1.3;opacity:0;transform:translateY(8px) scale(.97);transition:all .35s cubic-bezier(.2,.9,.3,1.2)}
.b.me{align-self:flex-end;background:#0a84ff;color:#fff}.b.them{align-self:flex-start;background:#e9e9eb}
.b.shown{opacity:1;transform:none}
.b.linkcard{padding:0;overflow:hidden;background:#e9e9eb;width:82%;max-width:82%}
.linkcard .imgs{position:relative;aspect-ratio:1200/630}
.linkcard .imgs img{position:absolute;inset:0;width:100%;height:100%;transition:opacity .6s}
.linkcard .imgs .covered{opacity:0}.linkcard.flip .imgs .covered{opacity:1}
.linkcard .cap{padding:7px 11px;font-size:13px;font-weight:600;color:#111}.linkcard .cap small{display:block;color:#888;font-weight:400}
@media (prefers-reduced-motion:reduce){.b{opacity:1;transform:none;transition:none}.hero .buddy{animation:none}}

/* chips */
.strip{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:10px}
.strip span{padding:9px 15px;border-radius:99px;border:1px solid var(--line);background:var(--card);font-weight:600;font-size:15px;color:var(--muted)}

/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:54px}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:26px;display:flex;flex-direction:column;gap:12px}
.step .n{width:38px;height:38px;border-radius:50%;background:var(--spot);color:#fff;display:grid;place-items:center;font-weight:800}
.step .vis{margin-top:auto;border-radius:16px;background:var(--bg);border:1px solid var(--line);padding:14px;font-size:15px;min-height:128px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.fake-input{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:10px 12px;color:var(--muted)}
.fake-input b{color:var(--ink);font-weight:600}
.fake-btn{align-self:flex-end;background:var(--spot);color:#fff;font-weight:800;border-radius:10px;padding:6px 12px;font-size:14px}
.ordered{display:flex;align-items:center;gap:10px;font-weight:800}.ordered i{font-style:normal;font-size:26px}
@media (max-width:860px){.steps{grid-template-columns:1fr}}

/* features */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:54px}
.feat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:30px}
.feat .ic{font-size:30px;margin-bottom:14px}
.feat p{color:var(--muted);margin-top:10px}
@media (max-width:760px){.feats{grid-template-columns:1fr}}

/* compare */
.tablewrap{margin-top:46px;overflow-x:auto;border-radius:var(--radius);border:1px solid var(--line);background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:16px}
th,td{padding:16px 18px;text-align:center;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;font-weight:600}
tr:last-child td{border-bottom:0}
thead th{font-size:15px;color:var(--muted);font-weight:600}
thead th.us{color:var(--spot);font-weight:800;font-size:17px}
td.us{background:color-mix(in srgb,var(--spot) 7%,transparent);font-weight:800}
.y{color:var(--ok);font-weight:800}.n{color:var(--muted)}

/* uses */
.uses{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:54px}
.use{border-radius:var(--radius);padding:26px;color:#fff;min-height:250px;display:flex;flex-direction:column;gap:12px}
.use:nth-child(1){background:linear-gradient(150deg,#ff5a36,#ff8a3d)}
.use:nth-child(2){background:linear-gradient(150deg,#2a6df4,#6a5cff)}
.use:nth-child(3){background:linear-gradient(150deg,#1d8a52,#3cb371)}
.use .q{margin-top:auto;background:rgba(255,255,255,.18);border-radius:16px 16px 16px 5px;padding:10px 14px;font-weight:600;align-self:flex-start}
.use p{opacity:.92}
@media (max-width:860px){.uses{grid-template-columns:1fr}}

/* agents */
.agents{background:var(--night);color:#f4efe8}
.agents .grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.agents .lead{color:#b9afa3}
.tools{margin-top:26px;display:flex;flex-direction:column;gap:12px}
.tool{display:flex;gap:14px;align-items:baseline}
.tool code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--spot2);font-size:15px;white-space:nowrap}
.tool span{color:#b9afa3;font-size:15px}
pre{margin:0;background:var(--night2);border:1px solid #2e2821;border-radius:18px;padding:22px;overflow-x:auto;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e9e2d8}
pre .k{color:#ffb347}pre .s{color:#8fd6a8}pre .c{color:#7d7368}
.agents .btn.ghost{color:#f4efe8;border-color:#3a332b}
@media (max-width:900px){.agents .grid{grid-template-columns:1fr}pre{font-size:12px;padding:16px}}

/* safety */
.safe{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:46px}
.safe div{border-top:3px solid var(--spot);padding-top:16px}
.safe p{color:var(--muted);margin-top:8px;font-size:16px}
@media (max-width:860px){.safe{grid-template-columns:1fr 1fr}}@media (max-width:520px){.safe{grid-template-columns:1fr}}

/* faq */
.faq{max-width:780px;margin:46px auto 0}
details{border-bottom:1px solid var(--line);padding:20px 0}
summary{cursor:pointer;font-weight:800;font-size:20px;letter-spacing:-.015em;list-style:none;display:flex;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}
summary::after{content:'+';color:var(--spot);font-size:26px;line-height:1;transition:transform .2s}
details[open] summary::after{transform:rotate(45deg)}
details p{color:var(--muted);margin-top:12px}

/* signup */
.join{text-align:center}
.join form{display:flex;gap:10px;max-width:560px;margin:30px auto 0;flex-wrap:wrap;justify-content:center}
.join input,.join select{font:inherit;font-size:16px;padding:14px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);flex:1 1 220px;min-width:0}
.join select{flex:0 1 auto}
.join .msg{margin-top:14px;font-weight:600;min-height:1.5em}
.hp{position:absolute;left:-9999px}

footer{padding:40px 0 60px;color:var(--muted);font-size:15px}
footer .wrap{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
footer a{text-decoration:none}footer .sp{margin-left:auto}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s,transform .6s}.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
`;

const check = '<span class="y">✓</span>';
const cross = '<span class="n">—</span>';

export function sitePage({ origin, provider }) {
  const mcp = `{
  <span class="k">"mcpServers"</span>: {
    <span class="k">"spot"</span>: {
      <span class="k">"url"</span>: <span class="s">"${esc(origin)}/mcp"</span>,
      <span class="k">"headers"</span>: { <span class="k">"Authorization"</span>: <span class="s">"Bearer YOUR_SPOT_KEY"</span> }
    }
  }
}`;
  const title = 'Spot: your cart, anywhere. Someone else’s tap.';
  const desc = 'Turn any cart into a link. They tap Apple Pay, and it gets ordered on a one-time card that only works at that store.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#ff5a36">
<meta property="og:type" content="website"><meta property="og:site_name" content="Spot"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin)}/"><meta property="og:image" content="${esc(origin)}/site/card-open.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%23ff5a36'/%3E%3C/svg%3E">
<link rel="preload" href="/fonts/bricolage-800.woff2" as="font" type="font/woff2" crossorigin>
<style>${CSS}</style></head><body>

<nav id="nav"><div class="wrap">
  <a class="logo" href="/"><span></span>Spot</a>
  <div class="links"><a href="#how">How it works</a><a href="#why">Why Spot</a><a href="#agents">For AI agents</a><a href="#faq">FAQ</a></div>
  <a class="btn primary" href="/new" id="navCta">Make a Spot</a>
</div></nav>

<header class="hero"><div class="wrap">
  <div class="buddy" aria-hidden="true">${buddySvg(false)}</div>
  <div class="grid">
    <div>
      <span class="pill"><i></i>Early access${provider === 'sandbox' ? ' · test mode' : ''}</span>
      <h1 style="margin-top:22px">Your cart, anywhere. <em>Someone else’s tap.</em></h1>
      <p class="lead">Turn any cart into a link. They tap Apple Pay, and it gets ordered, on a one-time card that only works at that store.</p>
      <div class="cta"><a class="btn primary" href="/new">Make a Spot →</a><a class="btn ghost" href="#how">See how it works</a></div>
      <p class="fine">Nothing to download. The person paying doesn’t need an account.</p>
    </div>
    <div class="phone" aria-label="A Spot link being sent in a text message and getting paid">
      <div class="screen">
        <div class="top"><div class="avatar">M</div><div class="who">Mom</div></div>
        <div class="thread" id="thread">
          <div class="b me">ok don’t laugh 🙈</div>
          <div class="b me linkcard" id="lc"><div class="imgs"><img src="/site/card-open.png" alt="Share card: psst… can you spot Kyle? Super Puff jacket, $271, tap to spot" width="1200" height="630"><img class="covered" src="/site/card-covered.png" alt="Share card after paying: Mom spotted Kyle!" width="1200" height="630"></div><div class="cap">psst… can you spot Kyle?<small>spot</small></div></div>
          <div class="b them">omg fine 😂</div>
          <div class="b them">done ✅</div>
          <div class="b me">ILY 🧡 it’s ordered</div>
        </div>
      </div>
    </div>
  </div>
</div></header>

<section class="sec alt" id="how"><div class="wrap">
  <p class="kicker reveal">How it works</p>
  <h2 class="reveal">Three taps between<br>“I want this” and “it’s coming.”</h2>
  <div class="steps">
    <div class="step reveal"><div class="n">1</div><h3>Spot it</h3><p class="muted">Paste a link, drop a screenshot, or just say what you want. Spot finds the item, the size and the price.</p>
      <div class="vis"><div class="fake-input"><b>black salomon xt-6, size 10.5</b></div><div class="fake-btn">Spot it</div></div></div>
    <div class="step reveal"><div class="n">2</div><h3>Send it</h3><p class="muted">One tap sends a card to Mom, your partner or the group chat, in iMessage, WhatsApp, anywhere.</p>
      <div class="vis" style="padding:0;overflow:hidden"><img src="/site/card-open.png" alt="The Spot share card" loading="lazy" width="1200" height="630"></div></div>
    <div class="step reveal"><div class="n">3</div><h3>They tap. It ships.</h3><p class="muted">They pay with Apple Pay. Spot fills in the store’s checkout with a one-time card, and you tap Place order.</p>
      <div class="vis"><div class="ordered"><i>📦</i><span>Ordered! #1042</span></div><span class="muted" style="font-size:14px">Tracking is on its way to your inbox.</span></div></div>
  </div>
</div></section>

<section class="sec" id="why"><div class="wrap">
  <p class="kicker reveal">Why Spot</p>
  <h2 class="reveal">Asking is awkward.<br>Spot makes it a tap.</h2>
  <div class="feats">
    <div class="feat reveal"><div class="ic">🔒</div><h3>It can only buy that.</h3><p>Their money goes onto a one-time card locked to that store and that amount. It can’t be cashed out, so saying yes is easy.</p></div>
    <div class="feat reveal"><div class="ic">📱</div><h3>Nothing to download.</h3><p>They open your link and pay with Apple Pay, Google Pay or a card. No app, no sign-up, no “what’s your Venmo?”</p></div>
    <div class="feat reveal"><div class="ic">🛍️</div><h3>Any store.</h3><p>Links, screenshots, or a few words. If you can buy it online, you can Spot it.</p></div>
    <div class="feat reveal"><div class="ic">✅</div><h3>You confirm the order.</h3><p>Spot’s checkout assistant fills in the store’s checkout for you, then waits. Nothing is placed until you tap.</p></div>
  </div>
  <div class="tablewrap reveal"><table>
    <thead><tr><th></th><th class="us">Spot</th><th>Payment requests</th><th>Shared-cart links</th><th>Wishlists</th></tr></thead>
    <tbody>
      <tr><td>Works with any store</td><td class="us">${check}</td><td>${cross}</td><td>Some</td><td>${check}</td></tr>
      <tr><td>Payer just taps, no checkout</td><td class="us">${check}</td><td>${check}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Money can only buy the item</td><td class="us">${check}</td><td>${cross}</td><td>${check}</td><td>${check}</td></tr>
      <tr><td>Ask in the moment</td><td class="us">${check}</td><td>${check}</td><td>${check}</td><td>${cross}</td></tr>
      <tr><td>Ordered for you</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>Some</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="sec alt"><div class="wrap">
  <p class="kicker reveal">Made for</p>
  <h2 class="reveal">Every “can you get me this?”</h2>
  <div class="uses">
    <div class="use reveal"><h3>Family</h3><p>Birthday lists, back-to-school, “the good headphones.” Parents see exactly what they’re buying.</p><div class="q">“Mom, can you spot me? 👀”</div></div>
    <div class="use reveal"><h3>Partners & friends</h3><p>Send a treat-me without the screenshot-and-Venmo dance. It shows up at the door.</p><div class="q">“it’s on me 🧡”</div></div>
    <div class="use reveal"><h3>Creators</h3><p>Put a Spot in your bio. Fans cover the gear you actually need, from any store.</p><div class="q">“new mic fund 🎙️”</div></div>
  </div>
</div></section>

<section class="sec agents" id="agents"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">For AI agents</p>
    <h2 class="reveal">The pay-for-me layer for AI shopping.</h2>
    <p class="lead reveal">Shopping agents can build a cart, but they can’t ask someone else to pay for it. Spot gives any agent three tools, over MCP or REST.</p>
    <div class="tools reveal">
      <div class="tool"><code>create_spot_ask</code><span>cart, link or description → a pay link and a message to send</span></div>
      <div class="tool"><code>get_spot_ask</code><span>waiting, paid, ordering, ordered</span></div>
      <div class="tool"><code>order_spot_ask</code><span>once paid, place the order at the store</span></div>
    </div>
    <div class="cta" style="margin-top:30px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="#join" data-kind="agent">Get an API key</a></div>
  </div>
  <pre class="reveal" aria-label="MCP configuration"><span class="c">// Add Spot to any MCP client</span>
${mcp}</pre>
</div></div></section>

<section class="sec"><div class="wrap">
  <p class="kicker reveal">Safety</p>
  <h2 class="reveal">Built so saying yes is safe.</h2>
  <div class="safe">
    <div class="reveal"><h3>Locked cards</h3><p>One store, one amount, one use. Other charges are declined.</p></div>
    <div class="reveal"><h3>No cash-outs</h3><p>Money can’t be turned into cash, which keeps stolen cards out.</p></div>
    <div class="reveal"><h3>Card stays hidden</h3><p>Spot’s checkout assistant fills the card in without ever seeing the number.</p></div>
    <div class="reveal"><h3>You have the last tap</h3><p>Nothing is ordered until you confirm. Changed your mind? Refund in one tap.</p></div>
  </div>
</div></section>

<section class="sec alt" id="faq"><div class="wrap">
  <p class="kicker reveal" style="text-align:center">FAQ</p>
  <h2 class="reveal" style="text-align:center">Questions</h2>
  <div class="faq">
    <details><summary>What does it cost?</summary><p>The person paying adds a 4% Spot fee, shown before they pay. Choosing “send it straight to my Venmo or Cash App” is free, because the money never goes through Spot.</p></details>
    <details><summary>Which stores work?</summary><p>Any online store. Spot reads links, screenshots and plain descriptions. Shopify stores are the smoothest. Some stores block automatic checkout, and then Spot hands you a ready-to-go checkout link and your one-time card instead.</p></details>
    <details><summary>Does the person paying need an account?</summary><p>No. They open your link and pay with Apple Pay, Google Pay or a card. That’s it.</p></details>
    <details><summary>Why a one-time card instead of cash?</summary><p>It’s what makes people comfortable saying yes: the money can only buy what you asked for. It also shuts out the fraud that plagues cash transfers.</p></details>
    <details><summary>What if I don’t end up buying it?</summary><p>You can refund the person who paid in one tap from your Spot page.</p></details>
    <details><summary>Is Spot live?</summary><p>Spot is in early access. ${provider === 'sandbox' ? 'Right now it runs in test mode, so no real money moves. Try the whole flow for free.' : 'Payments run on Stripe.'}</p></details>
  </div>
</div></section>

<section class="sec join" id="join"><div class="wrap">
  <h2 class="reveal">Want in early?</h2>
  <p class="lead reveal" style="margin-left:auto;margin-right:auto">Leave your email and we’ll let you know when real payments go live, or send you an API key for your agent.</p>
  <form id="joinForm" class="reveal">
    <input type="email" name="email" required placeholder="you@email.com" aria-label="Email" autocomplete="email">
    <select name="kind" aria-label="I am"><option value="asker">I want to ask</option><option value="agent">I’m building an agent</option><option value="creator">I’m a creator</option></select>
    <input class="hp" name="company_fax" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn primary">Join</button>
  </form>
  <p class="msg" id="joinMsg" aria-live="polite"></p>
  <p style="margin-top:26px"><a class="btn ghost" href="/new">Or try it now →</a></p>
</div></section>

<footer><div class="wrap"><a class="logo" href="/" style="font-size:18px"><span style="width:16px;height:16px"></span>Spot</a><span>Your cart, anywhere.</span><span class="sp"></span><a href="/new">Make a Spot</a><a href="#agents">For agents</a><a href="#faq">FAQ</a></div></footer>

<script>
(()=>{
  const nav=document.getElementById('nav');
  addEventListener('scroll',()=>nav.classList.toggle('scrolled',scrollY>8),{passive:true});
  // Returning users go straight to their Spots.
  try{if(localStorage.getItem('spot:me'))document.getElementById('navCta').textContent='Open Spot'}catch{}
  // Reveal on scroll.
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  // Hero conversation: plays, flips the card to "covered", loops.
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bubbles=[...document.querySelectorAll('#thread .b')],lc=document.getElementById('lc');
  if(reduce){bubbles.forEach(b=>b.classList.add('shown'));lc.classList.add('flip')}
  else{
    const play=()=>{bubbles.forEach(b=>b.classList.remove('shown'));lc.classList.remove('flip');
      const t=[400,1300,3000,4300,4700,5600];
      bubbles.forEach((b,i)=>setTimeout(()=>b.classList.add('shown'),t[i]));
      setTimeout(()=>lc.classList.add('flip'),t[3]);
      setTimeout(play,10500)};
    play();
  }
  // Mascot watches the pointer.
  const svg=document.querySelector('.buddy svg'),pupils=svg&&svg.querySelector('.pupils');
  addEventListener('pointermove',e=>{if(!pupils)return;const r=svg.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.hypot(dx,dy)||1,k=Math.min(7,d/30);pupils.setAttribute('transform','translate('+(dx/d*k).toFixed(1)+' '+(dy/d*k).toFixed(1)+')')},{passive:true});
  // "Get an API key" preselects the agent option.
  document.querySelectorAll('[data-kind]').forEach(a=>a.addEventListener('click',()=>{document.querySelector('#joinForm [name=kind]').value=a.dataset.kind}));
  // Early access form.
  const f=document.getElementById('joinForm'),msg=document.getElementById('joinMsg');
  f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
    try{const r=await fetch('/v1/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||'Something went wrong');msg.textContent='You’re on the list 🧡';f.reset()}
    catch(err){msg.textContent=err.message}finally{b.disabled=false}});
})();
</script>
</body></html>`;
}

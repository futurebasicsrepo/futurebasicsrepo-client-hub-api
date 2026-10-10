// /agent-card: give your AI a card that isn't yours (funding.js).
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

const CSS = `
.ac-hero{padding:56px 0 40px}
.ac-hero h1{font-size:clamp(40px,7vw,76px);letter-spacing:-.035em;line-height:1;margin:0 0 18px}
.ac-hero .lead{max-width:560px}
.ac-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
@media (max-width:860px){.ac-grid{grid-template-columns:1fr;gap:32px}}
.vcard{position:relative;aspect-ratio:1.586;max-width:460px;width:100%;margin:0 auto;border-radius:22px;padding:24px 26px;background:linear-gradient(150deg,#16203b,#0d1428 70%);color:#e9ecf5;box-shadow:0 30px 60px -20px rgba(13,20,40,.55),0 2px 0 rgba(255,255,255,.06) inset;display:flex;flex-direction:column;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.vcard .top{display:flex;justify-content:space-between;align-items:flex-start;font-family:Bricolage,system-ui,sans-serif}
.vcard .brand{font-weight:800;font-size:19px;letter-spacing:-.01em}.vcard .brand i{display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5a36;margin-right:7px;vertical-align:0}
.vcard .kind{font-size:11px;letter-spacing:.18em;opacity:.7;text-transform:uppercase}
.vcard .chip{width:46px;height:34px;border-radius:7px;background:linear-gradient(135deg,#d8c27a,#a98f45);margin:16px 0 12px}
.vcard .num{font-size:clamp(17px,3.6vw,22px);letter-spacing:.12em;opacity:.95}
.vcard .rows{margin-top:auto;display:grid;grid-template-columns:auto 1fr;gap:4px 16px;font-size:12px;letter-spacing:.06em}
.vcard .rows span{opacity:.65;text-transform:uppercase}.vcard .rows b{text-align:right;font-weight:600}
.vcard .foot{margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.14);font-size:10.5px;letter-spacing:.16em;opacity:.65;text-transform:uppercase}
.vcard .live{color:#7be3a6}
.pmodes{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:28px}
@media (max-width:760px){.pmodes{grid-template-columns:1fr}}
.pmode{background:var(--card);border:1.5px solid var(--line);border-radius:var(--radius);padding:22px}
.pmode h3{margin:0 0 6px;font-size:22px;letter-spacing:-.02em}.pmode .tag{display:inline-block;font-size:12px;font-weight:700;border-radius:99px;padding:3px 10px;margin-bottom:10px;background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}
.pmode .tag.opt{background:color-mix(in srgb,var(--spot2) 32%,transparent);color:var(--ink)}
.pmode p{margin:0 0 10px;color:var(--muted)}.pmode ul{margin:0;padding-left:18px}.pmode li{margin:5px 0}
.vs{width:100%;border-collapse:collapse;margin-top:22px;font-size:15px}
.vs th,.vs td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.vs th{font-size:13px;color:var(--muted);font-weight:600}.vs td:first-child{font-weight:600}
.vs .y{color:var(--ok);font-weight:700}
@media (max-width:620px){.vs{font-size:14px}.vs th,.vs td{padding:10px 6px}}
.steps3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:26px;counter-reset:s}
@media (max-width:760px){.steps3{grid-template-columns:1fr}}
.steps3 div{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px}
.steps3 div::before{content:counter(s);display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--spot);color:#fff;font-weight:800;margin-bottom:10px}
.steps3 b{display:block;font-size:17px;margin-bottom:4px}.steps3 span{color:var(--muted)}
`;

export function agentCardPage({ origin }) {
  return `${siteHead({ title: 'Your AI’s card · Spot', desc: 'Let your AI shop without holding your card. Every purchase gets its own Spot card: capped at the order, locked to one store, closed after. You approve with a tap, and a kill switch stops every AI at once.', origin, path: '/agent-card', extraCss: CSS })}
${siteNav('card')}
<main>
<section class="ac-hero"><div class="wrap ac-grid">
  <div>
    <p class="kicker reveal">Your AI’s card</p>
    <h1 class="reveal">Let your AI shop.<br>Not with your card.</h1>
    <p class="lead reveal">Save your card once, with Spot. Your AI never sees it. Every purchase it makes gets its own Spot card: capped at that order, locked to that store, and closed the moment it’s used. No new credit card to apply for.</p>
    <div class="cta reveal" style="margin-top:26px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/account#ai-card">Set up your AI’s card →</a><a class="btn ghost" href="/integrations#mcp">Connect your AI</a></div>
  </div>
  <div class="reveal">
    <div class="vcard" role="img" aria-label="Example: a Spot card for one AI purchase, capped at $84, locked to nike.com, closes after use">
      <div class="top"><span class="brand"><i></i>Spot</span><span class="kind">Agent card · virtual</span></div>
      <div class="chip" aria-hidden="true"></div>
      <div class="num">•••• •••• •••• 0417</div>
      <div class="rows"><span>Spend cap</span><b>$84 / this order</b><span>Store lock</span><b>nike.com only</b><span>Approved by</span><b>you, one tap</b><span>Kill switch</span><b class="live">armed</b></div>
      <div class="foot">Closes after this purchase</div>
    </div>
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <p class="kicker reveal">How it works</p>
  <h2 class="reveal">One card per task.</h2>
  <div class="steps3 reveal">
    <div><b>Your AI picks it</b><span>Claude, or any app that speaks MCP, builds the cart and asks Spot. Your rules check it first: a max per order and per month, and only the stores you allow.</span></div>
    <div><b>You approve it</b><span>A text or email: “Approve $84 at Nike with your Visa •4242?” One tap. Nothing is charged unless you tap.</span></div>
    <div><b>Spot buys it</b><span>Spot gets a card just for this order, buys exactly that cart, ships it to you, and the card closes. Unused money comes back to you.</span></div>
  </div>
</div></section>

<section class="sec"><div class="wrap">
  <p class="kicker reveal">Two ways to pay</p>
  <h2 class="reveal">You decide how much your AI decides.</h2>
  <div class="pmodes reveal">
    <div class="pmode"><span class="tag">Default</span><h3>Approve with a tap</h3><p>A person says yes to every purchase.</p><ul><li>Your AI asks; you get the Approve button by text or email.</li><li>Your saved card pays only when you tap.</li><li>You see the store’s real total before anything is ordered.</li></ul></div>
    <div class="pmode"><span class="tag opt">Opt in</span><h3>Pay automatically</h3><p>For the errands you’d approve anyway. Off until you turn it on, for each AI.</p><ul><li>Inside your rules, Spot pays and orders without a tap.</li><li>Needs a max per order: every card is capped at it.</li><li>Over the cap, or outside your stores? It comes to you, or it’s refused.</li></ul></div>
  </div>
</div></section>

<section class="sec alt"><div class="wrap">
  <p class="kicker reveal">Safer than handing over a card</p>
  <h2 class="reveal">Built for agents, not adapted for them.</h2>
  <div class="tablewrap reveal" style="margin-top:28px"><table class="vs">
    <thead><tr><th></th><th>Your card, saved in an AI</th><th>A bank’s virtual card</th><th>Spot</th></tr></thead>
    <tbody>
      <tr><td>Spend cap</td><td>Your credit limit</td><td>One you set by hand</td><td class="y">Each card capped at its order</td></tr>
      <tr><td>Store lock</td><td>None</td><td>Sometimes</td><td class="y">Locked to one store</td></tr>
      <tr><td>A new card per task</td><td>No</td><td>By hand</td><td class="y">Automatic, closed after use</td></tr>
      <tr><td>Rules per AI</td><td>No</td><td>No</td><td class="y">Limits, stores, an approver</td></tr>
      <tr><td>Kill switch</td><td>Cancel your card</td><td>Freeze the card</td><td class="y">One tap stops every AI and refunds unused cards</td></tr>
      <tr><td>Proof of who said yes</td><td>No</td><td>No</td><td class="y">Every yes is signed</td></tr>
      <tr><td>Apply for credit</td><td>Already have it</td><td>Yes</td><td class="y">No: save the card you have</td></tr>
    </tbody>
  </table></div>
</div></section>

<section class="sec"><div class="wrap" style="max-width:760px">
  <p class="kicker reveal">The kill switch</p>
  <h2 class="reveal">If your AI goes rogue, it’s one tap.</h2>
  <p class="lead reveal">“Stop all AI spending” on your account refuses every ask from every AI you’ve connected, right away, and cancels and refunds any Spot card your AI got that hasn’t been used yet. Turn it back on when you’re ready. Disconnecting a single AI works the same way.</p>
  <div class="cta reveal" style="margin-top:24px"><a class="btn primary" href="/account#ai-card">Set up your AI’s card →</a></div>
</div></section>
</main>
${siteFooter()}
<script>(()=>{${SITE_JS}})();</script>
</body></html>`;
}

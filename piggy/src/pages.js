// Server-rendered pages. No build step: each page is one HTML string with its
// own inline script, so what the NFC tap opens is a single fast request.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

const PIG = `<svg viewBox="0 0 64 64" aria-hidden="true" class="pig"><ellipse cx="32" cy="36" rx="24" ry="20" fill="var(--pig)"/><path d="M14 22 L12 8 L24 17Z M50 22 L52 8 L40 17Z" fill="var(--pig-ear)"/><ellipse cx="32" cy="41" rx="9" ry="6.5" fill="var(--pig-ear)"/><circle cx="29" cy="41" r="1.8" fill="var(--ink)" opacity=".55"/><circle cx="35" cy="41" r="1.8" fill="var(--ink)" opacity=".55"/><circle cx="23" cy="30" r="2.6" fill="var(--ink)"/><circle cx="41" cy="30" r="2.6" fill="var(--ink)"/><rect x="26" y="15" width="12" height="2.6" rx="1.3" fill="var(--ink)" opacity=".35"/></svg>`;

const BASE_CSS = `
:root{--bg:#fbf6f1;--card:#fff;--ink:#2a1a17;--muted:#7d6b66;--line:#ecdfd6;--brand:#7a1014;--brand-ink:#fff;--pig:#f4b3a4;--pig-ear:#ea8f7d;--chip:#fff;--chip-on:#7a1014;--glow:#ffb547;--ok:#1f7a4a}
@media (prefers-color-scheme:dark){:root{--bg:#171110;--card:#221a18;--ink:#f6ece7;--muted:#b19f99;--line:#3a2d2a;--brand:#e2606a;--brand-ink:#1b0d0e;--chip:#221a18;--chip-on:#e2606a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,.serif{font-family:Fraunces,Georgia,serif;letter-spacing:-.02em}
a{color:var(--brand)}
.wrap{max-width:460px;margin:0 auto;padding:20px 16px 40px}
.pig{width:56px;height:56px;flex:none}
.muted{color:var(--muted)}
.btn{display:block;width:100%;border:0;border-radius:14px;padding:16px;font:600 17px/1 Inter,system-ui,sans-serif;background:var(--brand);color:var(--brand-ink);cursor:pointer}
.btn:disabled{opacity:.45;cursor:default}
.err{color:#c0392b;min-height:1.2em;font-size:14px;margin:8px 0 0}
.badge{display:inline-block;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}`;

function shell(title, body, { css = '', head = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#7a1014"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}${css}</style>${head}</head><body>${body}</body></html>`;
}

// ─── Tap page: what the phone opens when it touches the jar ─────────────────
const TAP_CSS = `
.top{display:flex;gap:14px;align-items:center;margin:6px 0 20px}
.top h1{font-size:26px;line-height:1.1;margin:2px 0}
.goal{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin-bottom:20px}
.bar{height:10px;border-radius:99px;background:var(--line);overflow:hidden;margin-top:8px}.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--pig-ear),var(--brand));border-radius:99px;transition:width .6s}
h2{font-size:20px;margin:0 0 12px}
.chips{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.chip{appearance:none;border:2px solid var(--line);background:var(--chip);color:var(--ink);border-radius:16px;padding:18px 0;font:700 22px/1 Inter,system-ui,sans-serif;cursor:pointer;transition:transform .1s,background .15s}
.chip.small{font-size:16px}.chip:active{transform:scale(.96)}
.chip[aria-pressed=true]{background:var(--chip-on);border-color:var(--chip-on);color:var(--brand-ink)}
.custom{display:none;margin-top:12px;position:relative}.custom.on{display:block}
.custom span{position:absolute;left:18px;top:50%;transform:translateY(-50%);font:700 26px Inter,sans-serif;color:var(--muted)}
.custom input{width:100%;border:2px solid var(--brand);border-radius:16px;padding:16px 16px 16px 40px;font:700 26px Inter,sans-serif;background:var(--card);color:var(--ink);outline:0}
.total{display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 12px}
.total b{font:800 34px/1 Fraunces,Georgia,serif}
#express{min-height:56px}
details{margin-top:14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
summary{padding:14px 16px;cursor:pointer;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}
details .in{padding:0 16px 16px}
.demo{border:1px dashed var(--brand);border-radius:14px;padding:12px 14px;font-size:14px;margin-bottom:12px}
.secure{display:flex;gap:6px;align-items:center;justify-content:center;font-size:13px;margin-top:18px}
.done{position:fixed;inset:0;background:var(--bg);display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;z-index:9}
.done.on{display:flex;animation:fade .3s}
.done .amt{font:800 56px/1 Fraunces,Georgia,serif;color:var(--brand);margin:8px 0}
.done .glow{margin:22px 0;padding:14px 26px;border-radius:18px;background:#1c1210;color:var(--glow);font:700 34px/1 Inter,sans-serif;text-shadow:0 0 18px rgba(255,181,71,.8)}
.coin{width:64px;height:64px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#ffe08a,#e9a920);box-shadow:inset 0 -4px 0 rgba(0,0,0,.15);display:grid;place-items:center;font:800 28px Fraunces,serif;color:#7a4d00;animation:drop .7s cubic-bezier(.3,1.4,.6,1)}
@keyframes drop{from{transform:translateY(-120px) rotate(-30deg);opacity:0}to{transform:none;opacity:1}}
@keyframes fade{from{opacity:0}}`;

export function tapPage({ jar, kind, live, publishable_key, min_cents, max_cents }) {
  const presets = jar.presets;
  const start = presets[Math.min(1, presets.length - 1)];
  const goal = jar.goal_cents
    ? `<div class="goal"><div style="display:flex;justify-content:space-between"><b id="bal">${money(jar.balance_cents)}</b><span class="muted">of ${money(jar.goal_cents)} goal</span></div><div class="bar"><i id="barFill" style="width:${Math.min(100, (100 * jar.balance_cents) / jar.goal_cents)}%"></i></div></div>`
    : '';
  const body = `
<main class="wrap">
  <div class="top">${PIG}<div><span class="badge">${esc(kind.label)}</span><h1>${esc(jar.name)}</h1>${jar.tagline ? `<div class="muted">${esc(jar.tagline)}</div>` : ''}</div></div>
  ${goal}
  <h2>How much?</h2>
  <div class="chips" role="group" aria-label="Amount">
    ${presets.map((c) => `<button class="chip" data-c="${c}" aria-pressed="${c === start}">${money(c)}</button>`).join('')}
    <button class="chip small" data-c="custom" aria-pressed="false">Other</button>
  </div>
  <label class="custom" id="customBox"><span>$</span><input id="custom" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Custom amount"></label>
  <div class="total"><span class="muted">${esc(kind.verb)}</span><b id="total">${money(start)}</b></div>
  ${live
    ? `<div id="express"></div>
  <details id="cardBox"><summary>Pay with card instead</summary><div class="in"><div id="payEl"></div><button class="btn" id="cardGo" style="margin-top:14px" disabled>${esc(kind.verb)} <span class="amtLabel">${money(start)}</span></button></div></details>`
    : `<div class="demo"><b>Demo mode.</b> No Stripe keys are set, so this button stands in for Apple Pay / Google Pay and no card is charged.</div>
  <button class="btn" id="demoGo">${esc(kind.verb)} <span class="amtLabel">${money(start)}</span></button>`}
  <p class="err" id="err" role="alert"></p>
  <div class="secure muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>Payments processed securely by Stripe</div>
</main>
<div class="done" id="done" aria-live="polite">
  <div class="coin">$</div>
  <div class="amt" id="doneAmt"></div>
  <div id="doneMsg" style="font-size:18px"></div>
  <div class="glow" id="doneBal"></div>
  <button class="btn" style="max-width:280px" onclick="location.replace(location.pathname)">Done</button>
</div>`;

  const script = `
const JAR=${json(jar)},KIND=${json(kind)},MIN=${min_cents},MAX=${max_cents};
const $=(s)=>document.querySelector(s);
const fmt=(c)=>'$'+(c/100).toFixed(c%100?2:0);
let amount=${start},valid=true;
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong');return j}
function err(m){$('#err').textContent=m||''}
function setAmount(c){
  valid=Number.isInteger(c)&&c>=MIN&&c<=MAX;amount=valid?c:amount;
  $('#total').textContent=valid?fmt(c):'—';
  document.querySelectorAll('.amtLabel').forEach(e=>e.textContent=valid?fmt(c):'');
  err(valid||!c?'':'Pick between '+fmt(MIN)+' and '+fmt(MAX));
  onAmount&&onAmount(valid);
}
let onAmount=null;
document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.chip').forEach(x=>x.setAttribute('aria-pressed',x===b));
  const custom=b.dataset.c==='custom';$('#customBox').classList.toggle('on',custom);
  if(custom){$('#custom').focus();setAmount(Math.round(parseFloat($('#custom').value||'0')*100))}else setAmount(Number(b.dataset.c));
  navigator.vibrate&&navigator.vibrate(8);
});
$('#custom').oninput=(e)=>{e.target.value=e.target.value.replace(/[^0-9.]/g,'').replace(/(\\..*)\\./g,'$1').replace(/(\\.\\d{2}).+/,'$1');setAmount(Math.round(parseFloat(e.target.value||'0')*100))};
function success(r){
  $('#doneAmt').textContent=fmt(r.amount_cents);
  $('#doneMsg').textContent={piggy:'added to '+JAR.owner+"'s piggy bank",tip:'tip sent to '+JAR.owner+'. Thank you!',plate:'given to '+JAR.owner+'. Thank you!'}[JAR.kind];
  $('#doneBal').textContent=JAR.kind==='piggy'?fmt(r.jar.balance_cents):'✓';
  $('#done').classList.add('on');navigator.vibrate&&navigator.vibrate([20,60,30]);
}
${live ? liveScript(jar, kind, publishable_key) : `$('#demoGo').onclick=async()=>{if(!valid)return;const b=$('#demoGo');b.disabled=true;err();try{success(await api('/api/jars/'+JAR.slug+'/demo-pay',{amount_cents:amount}))}catch(e){err(e.message)}b.disabled=false};
onAmount=(ok)=>{$('#demoGo').disabled=!ok};`}`;
  return shell(`${kind.verb} · ${jar.name}`, body + `<script${live ? '' : ''}>${script}</script>`, {
    css: TAP_CSS,
    head: live ? '<script src="https://js.stripe.com/v3/"></script>' : '',
  });
}

// Apple Pay / Google Pay through Stripe's Express Checkout Element in
// deferred-intent mode: the button renders before any PaymentIntent exists,
// follows the chosen amount, and the intent is created on confirm.
function liveScript(jar, kind, pk) {
  const apple = { piggy: 'add-money', tip: 'tip', plate: 'plain' }[jar.kind];
  return `
const stripe=Stripe(${json(pk)});
const dark=matchMedia('(prefers-color-scheme: dark)').matches;
const elements=stripe.elements({mode:'payment',amount,currency:JAR.currency,appearance:{theme:dark?'night':'stripe',variables:{colorPrimary:dark?'#e2606a':'#7a1014',borderRadius:'12px',fontFamily:'Inter, system-ui, sans-serif'}},fonts:[{cssSrc:'https://fonts.googleapis.com/css2?family=Inter:wght@400;600'}]});
const ex=elements.create('expressCheckout',{buttonHeight:56,buttonTheme:{applePay:dark?'white':'black',googlePay:dark?'white':'black'},buttonType:{applePay:${json(apple)},googlePay:'plain'},paymentMethods:{applePay:'always',googlePay:'always',link:'never',amazonPay:'never',paypal:'never'}});
ex.on('ready',({availablePaymentMethods})=>{if(!availablePaymentMethods){$('#express').style.display='none';$('#cardBox').open=true}});
ex.on('confirm',async(ev)=>{const ok=await pay();if(!ok)ev.paymentFailed({reason:'fail'})});
ex.mount('#express');
const pe=elements.create('payment',{layout:'tabs',wallets:{applePay:'never',googlePay:'never'}});pe.mount('#payEl');pe.on('ready',()=>{$('#cardGo').disabled=!valid});
$('#cardGo').onclick=async()=>{const b=$('#cardGo');b.disabled=true;await pay();b.disabled=!valid};
onAmount=(ok)=>{if(ok)elements.update({amount});$('#cardGo').disabled=!ok};
async function pay(){
  err();if(!valid){err('Pick an amount first');return false}
  try{
    const {error:se}=await elements.submit();if(se){err(se.message);return false}
    const pi=await api('/api/jars/'+JAR.slug+'/intents',{amount_cents:amount});
    const {error,paymentIntent}=await stripe.confirmPayment({elements,clientSecret:pi.client_secret,redirect:'if_required',confirmParams:{return_url:location.origin+location.pathname}});
    if(error){err(error.message);return false}
    await finish(paymentIntent.id);return true;
  }catch(e){err(e.message);return false}
}
async function finish(id){
  for(let i=0;i<10;i++){const r=await api('/api/payments/'+id+'/sync');if(r.status==='succeeded'&&r.jar)return success(r);if(r.status!=='processing')break;await new Promise(z=>setTimeout(z,1200))}
  err('Payment is still processing. It will show up shortly.');
}
// Back from a redirect-based method (rare for wallets, possible for 3-D Secure).
const back=new URLSearchParams(location.search).get('payment_intent');if(back)finish(back).catch(e=>err(e.message));`;
}

// ─── Display: the backlit balance on the bottom of the pig ──────────────────
const DISPLAY_CSS = `
body{background:#0e0908;color:#f6ece7;min-height:100vh}
.stage{max-width:520px;margin:0 auto;padding:28px 16px;text-align:center}
.belly{position:relative;margin:26px auto;width:min(86vw,360px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 40%,#f2b2a1,#d98a78 70%,#b8695a);box-shadow:inset 0 -18px 40px rgba(0,0,0,.25),0 20px 60px rgba(0,0,0,.5);display:grid;place-items:center}
.belly .foot{position:absolute;width:22%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 40% 35%,#5a3328,#2b1510);box-shadow:inset 0 -4px 8px rgba(0,0,0,.4)}
.f1{top:6%;left:6%}.f2{top:6%;right:6%}.f3{bottom:6%;left:6%}.f4{bottom:6%;right:6%}
.digits{font:800 clamp(48px,16vw,84px)/1 Inter,system-ui,sans-serif;color:#ffcf73;text-shadow:0 0 12px rgba(255,170,60,.95),0 0 36px rgba(255,140,30,.7);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pop{position:absolute;top:22%;left:50%;transform:translateX(-50%);font:800 28px Inter,sans-serif;color:#fff;text-shadow:0 0 14px #ffb547;opacity:0}
.pop.go{animation:pop 1.8s ease-out}
@keyframes pop{0%{opacity:0;transform:translate(-50%,20px)}15%{opacity:1}100%{opacity:0;transform:translate(-50%,-50px)}}
.digits.bump{animation:bump .5s}@keyframes bump{40%{transform:scale(1.12)}}
h1{font-size:24px;margin:6px 0 0}.muted{color:#b19f99}
ul{list-style:none;padding:0;margin:22px auto 0;max-width:340px;text-align:left}
li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2c211f;font-size:15px}
.tap{display:inline-block;margin-top:24px;padding:12px 18px;border:1px solid #3a2d2a;border-radius:12px;color:#f6ece7;text-decoration:none;font-weight:600}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3ad07a;margin-right:6px;box-shadow:0 0 8px #3ad07a}`;

export function displayPage({ jar, kind, recent }) {
  const when = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const body = `
<main class="stage">
  <span class="badge" style="color:#b19f99">${esc(kind.label)} · bottom display</span>
  <h1 class="serif">${esc(jar.name)}</h1>
  <div class="belly"><i class="foot f1"></i><i class="foot f2"></i><i class="foot f3"></i><i class="foot f4"></i>
    <div class="digits" id="digits">$${Math.floor(jar.balance_cents / 100)}</div><div class="pop" id="pop"></div></div>
  <div class="muted"><span class="dot"></span>Live. Updates the moment a phone pays.</div>
  ${jar.goal_cents ? `<div class="muted" style="margin-top:6px" id="goal">${Math.floor((100 * jar.balance_cents) / jar.goal_cents)}% of the ${money(jar.goal_cents)} goal</div>` : ''}
  <ul id="list">${recent.map((p) => `<li><span>${money(p.amount_cents)}${p.method ? ` <span class="muted">· ${esc(p.method.replace('_', ' '))}</span>` : ''}</span><span class="muted">${when(p.created_at)}</span></li>`).join('')}</ul>
  <a class="tap" href="/j/${esc(jar.slug)}">Open the tap page →</a>
</main>`;
  const script = `
const GOAL=${json(jar.goal_cents)};const $=(s)=>document.querySelector(s);let first=true;
const es=new EventSource('/api/jars/${jar.slug}/stream');
es.onmessage=(m)=>{const e=JSON.parse(m.data);$('#digits').textContent='$'+Math.floor(e.balance_cents/100);
  if(GOAL&&$('#goal'))$('#goal').textContent=Math.floor(100*e.balance_cents/GOAL)+'% of the $'+GOAL/100+' goal';
  if(first){first=false;return}
  if(e.amount_cents){const p=$('#pop');p.textContent='+$'+(e.amount_cents/100).toFixed(e.amount_cents%100?2:0);p.classList.remove('go');void p.offsetWidth;p.classList.add('go');
    const d=$('#digits');d.classList.remove('bump');void d.offsetWidth;d.classList.add('bump');
    const li=document.createElement('li');li.innerHTML='<span>'+p.textContent.slice(1)+'</span><span class="muted">just now</span>';$('#list').prepend(li)}};`;
  return shell(`Display · ${jar.name}`, body + `<script>${script}</script>`, { css: DISPLAY_CSS });
}

// ─── Home: the concept, with the three demo devices ─────────────────────────
const HOME_CSS = `
.wrap{max-width:880px}
.hero{padding:28px 0 10px}.hero h1{font-size:clamp(40px,9vw,68px);line-height:.95;margin:0;color:var(--brand)}
.hero p{font-size:19px;max-width:560px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:24px 0}
.step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.step b{display:block;font-family:Fraunces,serif;font-size:20px;margin-bottom:4px}
.jars{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px}
.jar{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:10px}
.jar h3{margin:0;font-family:Fraunces,serif;font-size:20px}
.row{display:flex;gap:8px}.row a{flex:1;text-align:center;padding:12px;border-radius:12px;text-decoration:none;font-weight:600}
.row .p{background:var(--brand);color:var(--brand-ink)}.row .s{border:1px solid var(--line);color:var(--ink)}
.mode{display:inline-block;padding:6px 10px;border-radius:99px;font-size:13px;font-weight:600;background:var(--line)}
pre{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;overflow:auto;font-size:13px}`;

export function homePage({ jars, live }) {
  const body = `
<main class="wrap">
  <section class="hero"><span class="mode">${live ? 'Live: Stripe connected' : 'Demo mode: no cards charged'}</span>
    <h1>Tap. Pick.<br>Drop it in.</h1>
    <p class="muted">A piggy bank, tip jar or collection plate that takes Apple Pay and Google Pay. Touch your phone to it, pick $1, $3, $5 or your own amount, and confirm with Face ID or your fingerprint. No app to install.</p></section>
  <div class="steps">
    <div class="step"><b>1. Tap</b><span class="muted">An NFC tag inside the jar (and a QR code on the bottom) opens its page in the phone's browser.</span></div>
    <div class="step"><b>2. Pick</b><span class="muted">$1, $3, $5 or Other. Amounts are set per jar.</span></div>
    <div class="step"><b>3. Pay</b><span class="muted">Apple Pay or Google Pay through Stripe. Card entry is a fallback.</span></div>
    <div class="step"><b>4. Glow</b><span class="muted">The jar's backlit display ticks up the moment the payment clears.</span></div>
  </div>
  <h2 class="serif">Try a device</h2>
  <p class="muted">Open “Display” on a laptop, then “Tap” on your phone (or the same screen). Each tap page is the URL you'd write to that device's NFC tag.</p>
  <div class="jars">${jars.map((j) => `
    <div class="jar"><div style="display:flex;gap:12px;align-items:center">${PIG}<div><span class="badge">${esc(j.label)}</span><h3>${esc(j.name)}</h3></div></div>
      <div class="muted">${esc(j.tagline || '')}</div>
      <div class="row"><a class="p" href="/j/${esc(j.slug)}">Tap</a><a class="s" href="/d/${esc(j.slug)}">Display</a></div></div>`).join('')}
  </div>
  <h2 class="serif" style="margin-top:36px">For the hardware</h2>
  <p class="muted">The jar's microcontroller polls its balance over Wi-Fi with the key it was provisioned with:</p>
  <pre>GET /api/device/&lt;slug&gt;
x-device-key: &lt;device key&gt;

{ "balance_cents": 7300, "display": "$73", "goal_cents": 15000,
  "last_payment": { "amount_cents": 500, "at": 1760000000000 } }</pre>
</main>`;
  return shell('Piggy · Tap to give', body, { css: HOME_CSS });
}

export const notFoundPage = () =>
  shell('Not found', `<main class="wrap" style="text-align:center;padding-top:80px">${PIG}<h1 class="serif">This jar isn't set up yet</h1><p class="muted">The tag you tapped doesn't point to an active jar.</p><a href="/">Go home</a></main>`);

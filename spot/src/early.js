// Early access: the page people see while the site is gated, and the gate.
//
//   SITE_GATE         "on" shows this page instead of the marketing pages
//                     ("/", /new, /connect, /integrations, /standards,
//                     /agent-card); "off" opens the site. Unset: on when
//                     running on Railway, off everywhere else (local, tests).
//   SITE_PREVIEW_KEY  optional, 16+ characters: opening any page with
//                     ?preview=<key> lets that browser see the full site for
//                     30 days (for people outside the company).
//
// Staff (signed in with a confirmed company email, staff.js) always see the
// full site, and so does anyone the team invited (invites.js): through their
// personal link (/invite/<token>), or signed in with the invited email; once
// an invited browser is signed in, that account is in on every device. Everything else stays open: pay links, receipts, approvals,
// sign-in, accounts, /admin, the API and MCP, /texts (the SMS opt-in page
// carriers review), /terms and /privacy.
import { createHash, timingSafeEqual } from 'node:crypto';
import { assetUrl } from './assets.js';
import { siteHead } from './site.js';
import { FX_JS } from './sitefx.js';
import { spotBuddy } from './spotfx.js';
import { sessionUserId } from './accounts.js';
import { isStaff } from './staff.js';
import { INVITE_COOKIE, inviteCookieOf, maskEmail } from './invites.js';

export const GATED = new Set(['/', '/new', '/connect', '/integrations', '/standards', '/agent-card', '/for-stores']);
const COOKIE = 'spot_preview';
const DAYS = 30;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

export function gateOn(env, behindEdge) {
  const v = String(env.SITE_GATE || '').trim().toLowerCase();
  if (v) return !['off', '0', 'false', 'no'].includes(v);
  return Boolean(behindEdge);
}

export function registerGate(app, { db, env, behindEdge, origin, invites }) {
  // An invite link from the email: remember this browser, then show the site.
  // It works whether or not the gate is on (after launch it just opens Spot).
  app.get('/invite/:token', async (req, reply) => {
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    const token = String(req.params.token || '');
    const r = invites.open(token, { known: inviteCookieOf(req) === token });
    if (!r.ok) {
      const notice = r.reason === 'used'
        ? `This invite has already been opened on a few devices. Sign in with the email it was sent to (${maskEmail(r.email)}) and you’re in.`
        : 'That invite link doesn’t work anymore. If you were invited, sign in with the email it went to.';
      return reply.code(r.reason === 'used' ? 200 : 404).type('text/html; charset=utf-8').send(earlyAccessPage({ origin: origin(req), notice }));
    }
    invites.admit(sessionUserId(db, req), r.email);
    reply.header('set-cookie', `${INVITE_COOKIE}=${token}; Path=/; Max-Age=${365 * 86400}; HttpOnly; SameSite=Lax${behindEdge ? '; Secure' : ''}`);
    return reply.redirect('/?welcome=1', 302);
  });
  if (!gateOn(env, behindEdge)) return;
  const key = env.SITE_PREVIEW_KEY && env.SITE_PREVIEW_KEY.length >= 16 ? env.SITE_PREVIEW_KEY : null;
  const proof = key ? sha(`preview:${key}`) : null;
  const previewing = (req) => {
    if (!proof) return false;
    const c = (String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)) || [])[1];
    return Boolean(c) && timingSafeEqual(Buffer.from(c), Buffer.from(proof));
  };
  app.addHook('onRequest', async (req, reply) => {
    if (!['GET', 'HEAD'].includes(req.method)) return;
    const url = new URL(req.url, 'http://x');
    if (!GATED.has(url.pathname)) return;
    // A preview link: remember this browser, then show the clean URL.
    const p = url.searchParams.get('preview');
    if (key && p) {
      const a = Buffer.from(sha(p)), b = Buffer.from(sha(key));
      if (a.length === b.length && timingSafeEqual(a, b)) {
        url.searchParams.delete('preview');
        reply.header('set-cookie', `${COOKIE}=${proof}; Path=/; Max-Age=${DAYS * 86400}; HttpOnly; SameSite=Lax${behindEdge ? '; Secure' : ''}`);
        return reply.redirect(url.pathname + (url.search || ''), 302);
      }
    }
    const userId = sessionUserId(db, req);
    if (previewing(req)) return void invites.admitPreview(userId);
    // An invited browser that's signed in lets the account in everywhere.
    const invited = invites.cookieEmail(inviteCookieOf(req));
    if (invited) return void invites.admit(userId, invited);
    if (isStaff(db, env, userId) || invites.userOk(userId)) return;
    reply.header('cache-control', 'no-store');
    return reply.type('text/html; charset=utf-8').send(earlyAccessPage({ origin: origin(req) }));
  });
}

const EA_CSS = `
.ea-wrapbody{min-height:100svh;display:flex;flex-direction:column;overflow-x:hidden}
.ea-top{display:flex;align-items:center;justify-content:space-between;height:72px;width:100%;box-sizing:border-box}
.ea-top .logo span{width:30px;height:30px}
.ea-in{font-weight:700;font-size:15px;color:var(--muted);text-decoration:none;padding:10px 4px}.ea-in:hover{color:var(--ink)}
.ea-main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding-top:8px;padding-bottom:40px;width:100%;box-sizing:border-box}
.ea-spot{position:relative;width:min(230px,56vw);margin-bottom:-6px;cursor:pointer}
.ea-spot .spot3d{display:block;width:100%;height:auto}
.ea-spot.has3d .spotimg{display:none}
.ea-main h1{font-size:clamp(40px,7vw,80px);line-height:.98;letter-spacing:-.045em;margin-top:18px}
.ea-main .lead{margin:18px auto 0;max-width:560px}
.ea-form{width:100%;max-width:520px;margin-top:30px}
.ea-ex{list-style:none;margin:26px auto 0;padding:0;width:100%;max-width:520px;display:grid;gap:10px;text-align:left}
.ea-ex li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:var(--card);border:1px solid var(--line);box-shadow:var(--sh-1)}
.ea-ex .n{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:var(--spot);color:#fff;font-weight:800;font-size:14px;margin-top:1px}
.ea-ex li>div{display:flex;flex-direction:column;gap:6px;min-width:0}
.ea-ex b{font-size:16px;letter-spacing:-.01em}
.ea-ex small{color:var(--muted);font-size:13.5px;line-height:1.4}
.ea-ex .bub{align-self:flex-start;background:var(--ink);color:var(--bg);font-weight:600;font-size:14.5px;padding:8px 12px;border-radius:16px 16px 16px 4px}
.ea-ex .it{display:flex;gap:10px;align-items:center;font-weight:700;font-size:14.5px}
.ea-ex .it i{font-style:normal;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--bg2);font-size:22px;flex:none}
.ea-ex .it span{display:flex;flex-direction:column}
.ea-ex .yes{align-self:flex-start;background:var(--spot);color:#fff;font-weight:800;font-size:14.5px;padding:8px 16px;border-radius:999px}
.ea-row{display:flex;gap:8px;padding:6px;border-radius:999px;background:var(--card);border:1px solid var(--line);box-shadow:0 18px 40px -24px rgba(27,23,18,.35);transition:border-color .2s,box-shadow .2s}
.ea-row:focus-within{border-color:color-mix(in srgb,var(--spot) 55%,var(--line));box-shadow:0 0 0 4px color-mix(in srgb,var(--spot) 16%,transparent),0 18px 40px -24px rgba(27,23,18,.35)}
.ea-row input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-size:17px;padding:0 16px;color:var(--ink);outline:none}
.ea-row .btn{min-height:50px;flex:none}
.ea-kinds{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:14px;border:0;padding:0}
.ea-kinds legend{width:100%;font-size:13px;font-weight:700;color:var(--muted);margin-bottom:8px;padding:0}
.ea-kinds label{position:relative;cursor:pointer}
.ea-kinds input{position:absolute;opacity:0;pointer-events:none}
.ea-kinds span{display:inline-block;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);font-weight:600;font-size:14.5px;color:var(--muted);transition:background .2s,color .2s,border-color .2s}
.ea-kinds input:checked+span{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.ea-kinds input:focus-visible+span{outline:2px dashed var(--spot);outline-offset:3px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.ea-msg{min-height:24px;margin:14px 0 0;font-weight:700}
.ea-notice{margin:24px auto 0;max-width:520px;padding:14px 18px;border-radius:16px;background:var(--card);border:1px solid color-mix(in srgb,var(--spot) 40%,var(--line));font-weight:600;line-height:1.45}
.ea-notice a{color:var(--spot);font-weight:800}
.ea-msg.err{color:#c4321a}
.ea-done{display:none;margin-top:30px;padding:22px 26px;border-radius:22px;background:var(--card);border:1px solid var(--line);max-width:460px;box-shadow:0 18px 40px -24px rgba(27,23,18,.35)}
.ea-done b{display:block;font-size:22px;letter-spacing:-.02em}.ea-done p{margin:6px 0 0;color:var(--muted)}
body.joined .ea-form{display:none}body.joined .ea-done{display:block;animation:pop .45s cubic-bezier(.2,1.3,.4,1)}
.ea-proof{list-style:none;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 22px;padding:0;margin:34px 0 0;color:var(--muted);font-size:14.5px;font-weight:600}
.ea-proof li::before{content:'✓';color:var(--spot);font-weight:900;margin-right:7px}
.ea-say{position:absolute;right:62%;top:8%;z-index:3;width:max-content;max-width:170px;background:var(--ink);color:var(--bg);font-weight:700;font-size:13.5px;line-height:1.3;border-radius:16px 16px 4px 16px;padding:8px 12px;opacity:0;transform:translateY(6px) scale(.85);transform-origin:100% 100%;transition:opacity .2s,transform .32s cubic-bezier(.2,1.5,.4,1);pointer-events:none;text-align:left}
.ea-say.show{opacity:1;transform:none}
.ea-foot{display:flex;flex-wrap:wrap;gap:6px 20px;justify-content:center;padding-top:18px;padding-bottom:26px;font-size:14px;color:var(--muted);width:100%;box-sizing:border-box}
.ea-foot a{color:inherit;text-decoration:none}.ea-foot a:hover{color:var(--ink)}
@media (max-width:520px){.ea-row{flex-direction:column;border-radius:22px}.ea-row input{min-height:48px}.ea-say{right:56%;max-width:140px;font-size:12.5px}}
`;

// One plain example, start to finish: what Spot is, without having to work it out.
function example() {
  return `<ol class="ea-ex" aria-label="An example, start to finish">
    <li><span class="n">1</span><div><b>You ask Spot or your AI</b><span class="bub">“white sneakers, size 10, under $150”</span></div></li>
    <li><span class="n">2</span><div><b>It finds a pair, already checked</b><span class="it"><i aria-hidden="true">👟</i><span>Court Sneaker, White, 10<small>Trailhead Supply · $129 · free returns · arrives Thursday</small></span></span></div></li>
    <li><span class="n">3</span><div><b>You tap yes</b><span class="yes" aria-hidden="true">Yes, buy it · $129</span></div></li>
    <li><span class="n">4</span><div><b>Spot buys it. It ships to you.</b><small>Or send the yes to someone else, like your mom or your boss, and they pay.</small></div></li>
    <li><span class="n">5</span><div><b>The price drops? You get the difference.</b><small>Spot keeps watching after you buy, and tracks it to your door.</small></div></li>
  </ol>`;
}

export function earlyAccessPage({ origin, notice = '' }) {
  const title = 'Spot: early access';
  const desc = 'Ask Spot or your AI for something. See the store’s own policy, delivery date and best price, tap yes, and Spot buys it for you, or sends the yes to whoever’s paying. Get early access.';
  return `${siteHead({ title, desc, origin, path: '/', extraCss: EA_CSS, image: 'og-early.jpg' })}
<div class="ea-wrapbody">
<header class="ea-top wrap"><a class="logo" href="/"><span></span>Spot</a><a class="ea-in" href="/signin">Sign in</a></header>
<main class="ea-main wrap">
  <div class="ea-spot" id="eaSpot" aria-hidden="true">${spotBuddy('ea')}<div class="ea-say" id="eaSay"></div></div>
  <span class="pill"><i></i>Early access</span>
  <h1>The yes button<br>for AI shopping.</h1>
  <p class="lead">Ask Spot, Claude or ChatGPT for something. You see the store’s own return policy, when it arrives and the best price, you tap yes, and Spot buys it for you. We’re letting people in a few at a time.</p>
  ${example()}
  ${notice ? `<p class="ea-notice" role="status">${esc(notice)} <a href="/signin?next=/">Sign in</a></p>` : ''}
  <form class="ea-form" id="eaForm" novalidate>
    <div class="ea-row"><input type="email" name="email" id="eaEmail" required placeholder="you@email.com" autocomplete="email" inputmode="email" aria-label="Your email"><button class="btn primary" type="submit" id="eaGo">Get early access</button></div>
    <fieldset class="ea-kinds"><legend>I’m here to…</legend>
      <label><input type="radio" name="kind" value="asker" checked><span>Shop with my AI</span></label>
      <label><input type="radio" name="kind" value="agent"><span>Build AI agents</span></label>
      <label><input type="radio" name="kind" value="store"><span>Sell in my store</span></label>
    </fieldset>
    <input class="hp" name="company_fax" tabindex="-1" autocomplete="off" aria-hidden="true">
    <p class="ea-msg" id="eaMsg" role="status" aria-live="polite"></p>
  </form>
  <div class="ea-done" id="eaDone" role="status"><b>You’re on the list 🧡</b><p>We’ll email you when your spot opens. Tell a friend who’s always asking “can you get me this?”</p></div>
  <ul class="ea-proof"><li>Works in Claude and ChatGPT</li><li>A one-time card for every order</li><li>Watches the price after you buy</li></ul>
</main>
<footer class="ea-foot wrap"><span>© Spot</span><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/texts">Texts</a><a href="/signin">Sign in</a></footer>
</div>
<script>
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
${FX_JS}
  const box=document.getElementById('eaSpot'),say=document.getElementById('eaSay'),form=document.getElementById('eaForm'),email=document.getElementById('eaEmail'),go=document.getElementById('eaGo'),msg=document.getElementById('eaMsg');
  let s3=null,sayT=0;
  const hSay=(t,ms=2400)=>{if(!t)return;say.textContent=t;say.classList.remove('show');void say.offsetWidth;say.classList.add('show');clearTimeout(sayT);sayT=setTimeout(()=>say.classList.remove('show'),ms)};
  const LINES={poke:['boop!','hehe','eep!'],dizzy:['whoa… 💫'],shy:['oh! hi… 🙈'],yawn:['*yaaawn* 🥱'],wake:['oh! I’m up 👀'],back:['you’re back! 👋']};const said={};
  const line=k=>{const a=LINES[k]||[];said[k]=(said[k]??-1)+1;return a[said[k]%a.length]||''};
  if(!(navigator.connection&&navigator.connection.saveData))import(${JSON.stringify(assetUrl('spot3d.js'))}).then(m=>{s3=m.mountSpot3D(box,{onCue:c=>hSay(line(c))});if(!s3)return;box.classList.add('has3d');setTimeout(()=>{s3.play('wave');hSay('almost ready! 👋',2600)},800)}).catch(()=>{});
  box.addEventListener('click',e=>{if(!s3)return;const r=box.getBoundingClientRect();s3.poke((e.clientX-(r.left+r.width/2))/(r.width/2))});
  // He watches you type, and leans in for the button.
  email.addEventListener('focus',()=>s3&&s3.anticipate(true));email.addEventListener('blur',()=>s3&&s3.anticipate(false));
  go.addEventListener('pointerenter',()=>s3&&s3.anticipate(true));go.addEventListener('pointerleave',()=>s3&&document.activeElement!==email&&s3.anticipate(false));
  form.addEventListener('submit',async e=>{e.preventDefault();msg.textContent='';msg.classList.remove('err');
    const v=email.value.trim();if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(v)){msg.textContent='That email looks wrong';msg.classList.add('err');email.focus();return}
    go.disabled=true;go.textContent='Adding you…';
    try{const r=await fetch('/v1/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:v,kind:form.kind.value,company_fax:form.company_fax.value})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong. Try again?');
      document.body.classList.add('joined');if(s3){s3.anticipate(false);s3.hop();s3.happy(true);setTimeout(()=>s3.happy(false),2200)}hSay('yay! see you soon 🧡',3000);spotConfetti(document.body,'50%','30%',60);
    }catch(err){msg.textContent=err.message;msg.classList.add('err');go.disabled=false;go.textContent='Get early access'}});
</script>
</body></html>`;
}

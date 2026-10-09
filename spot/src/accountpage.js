// /signin and /account pages. Data comes from /v1/auth/* and /v1/me.
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';
import { PASSKEY_JS } from './passkeys.js';
import { SMS_CONSENT } from './notify.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
.acct{padding:40px 0 90px}
.acct .wrap{max-width:820px}
.acct h1{font-size:clamp(34px,6vw,54px)}
.acct h2{font-size:24px;letter-spacing:-.02em;margin:0 0 4px}
.acct .sub{color:var(--muted);margin:0 0 14px;font-size:15px}
.acct section{margin-top:34px}
.box{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px}
.ready{display:grid;gap:10px}
.rcard{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;background:var(--card);border:1.5px solid var(--spot);border-radius:18px;padding:14px 16px;text-decoration:none;color:var(--ink)}
.rcard b{display:block}.rcard small{color:var(--muted)}
.rcard .go{background:var(--spot);color:#fff;font-weight:700;border-radius:999px;padding:10px 16px;white-space:nowrap}
.list{display:grid;gap:0}
.item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:12px 4px;border-bottom:1px solid var(--line);text-decoration:none;color:var(--ink)}
.item:last-child{border-bottom:0}
.item small{display:block;color:var(--muted);font-size:13px}
.item .amt{font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.st{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--line);margin-left:6px;vertical-align:1px}
.st.ok{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.st.warn{background:color-mix(in srgb,var(--spot2) 30%,transparent)}
.f{display:grid;gap:8px}.f[hidden]{display:none}.f .two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.f .three{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px}
@media (max-width:560px){.f .two,.f .three{grid-template-columns:1fr}}
.f input,.f select{font:inherit;font-size:16px;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);min-width:0;width:100%}
.btnrow{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px}
.ok-msg{color:var(--ok);font-weight:600;font-size:14px}.err{color:var(--spot);font-weight:600;font-size:14px;min-height:1.2em}
.keyc{padding:10px 0;border-bottom:1px solid var(--line)}.keyc:last-child{border-bottom:0}.acts{margin:6px 0 0;padding-left:18px;font-size:14px}.acts li{margin:4px 0}details.more summary{cursor:pointer;font-weight:600;color:var(--muted);font-size:14px}
.trav{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.linkbtn{background:none;border:0;color:var(--spot);font:600 14px Bricolage,system-ui,sans-serif;cursor:pointer;padding:4px}
.connect .mcpurl{display:flex;gap:8px;align-items:center;background:var(--bg);border:1.5px solid var(--line);border-radius:12px;padding:8px 8px 8px 14px}.connect .mcpurl code{flex:1;min-width:0;overflow-wrap:anywhere;font-size:15px}
.connect .steps{margin:12px 0 0;padding-left:20px}.connect .steps li{margin:6px 0}
pre{background:var(--night);color:#f4efe8;border-radius:14px;padding:14px;overflow-x:auto;font-size:13px}
.signin{max-width:460px;margin:30px auto 0}
.code{letter-spacing:.4em;font:800 28px ui-monospace,monospace!important;text-align:center}
.seg{display:grid;grid-template-columns:1fr 1fr;background:var(--bg);border:1.5px solid var(--line);border-radius:999px;padding:4px;margin:14px 0 10px}.seg[hidden]{display:none}
.seg.three{grid-template-columns:repeat(3,1fr)}
.st.ai{background:color-mix(in srgb,var(--spot) 14%,transparent);color:var(--ink)}
.seg button{font:600 15px Bricolage,system-ui,sans-serif;border:0;background:none;color:var(--muted);padding:9px;border-radius:999px;cursor:pointer}
.seg button[aria-selected=true]{background:var(--card);color:var(--ink);box-shadow:0 1px 4px rgba(27,23,18,.12)}
.seg button:focus-visible{outline:3px solid var(--spot);outline-offset:1px}
.f input[hidden]{display:none}
.f .fl{display:grid;gap:4px;font-size:13px;font-weight:600;color:var(--muted);min-width:0}
.f input[type=date]{-webkit-appearance:none;appearance:none;display:block;min-height:50px;text-align:left}
.f input[type=date]::-webkit-date-and-time-value{text-align:left}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);font-size:14px;margin:18px 0 12px}.or::before,.or::after{content:"";flex:1;height:1px;background:var(--line)}
.sso{display:grid;gap:10px}.sso[hidden],.or[hidden]{display:none}
.sso-b{display:flex;align-items:center;justify-content:center;gap:10px;min-height:50px;border-radius:999px;font-weight:600;font-size:16px;text-decoration:none;border:1.5px solid var(--line)}
.sso-b.google{background:#fff;color:#1f1f1f;border-color:#dadce0}
.sso-b.facebook{background:#1877F2;color:#fff;border-color:#1877F2}
.sso-b:focus-visible{outline:3px solid var(--spot);outline-offset:2px}
.pk-b{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px}.pk-b[hidden]{display:none}
.meth{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line)}
.meth:last-child{border-bottom:0}.meth .ic{font-size:20px;width:28px;text-align:center}.meth small{display:block;color:var(--muted);font-size:13px}
.addf{display:grid;gap:8px;padding:10px 0 4px}.addf[hidden]{display:none}.addf .row{display:grid;grid-template-columns:1fr auto;gap:8px}
.addf input{font:inherit;font-size:16px;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);min-width:0}
.aicard{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center}
.aicard .chip{width:46px;height:32px;border-radius:7px;background:linear-gradient(135deg,#d8c27a,#b39a4e)}
.stop{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-top:12px}
.btn.danger{background:#c8321b;color:#fff;border-color:#c8321b}
.agree{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin:8px 0}.agree[hidden]{display:none}.agree input{width:18px;height:18px;margin-top:2px;flex:none}
.hint{background:color-mix(in srgb,var(--spot2) 25%,transparent);border-radius:12px;padding:10px 12px;font-size:14px}
`;

function page({ origin, path, title, body, script, head = '' }) {
  return `${siteHead({ title, desc: 'Your Spot account', origin, path, extraCss: CSS }).replace('<head>', `<head><meta name="robots" content="noindex">${head}`)}
${siteNav()}
<main class="acct"><div class="wrap">${body}</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Something went wrong');return d};
${script}
})();</script>
</body></html>`;
}

const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
const FB_F = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>';
const ERRORS = {
  cancelled: 'Sign-in was cancelled. Try again, or use your email.',
  expired: 'That sign-in took too long or started in another browser. Try again.',
  failed: 'We couldn’t reach that sign-in service. Try again, or use your email.',
  no_email: 'That account didn’t share an email address with us. Use email sign-in instead.',
  unavailable: 'That sign-in option isn’t set up yet. Use your email.',
};

// The SMS opt-in: an unticked box with the full disclosure, next to every phone field.
const smsAgree = (id, hidden) => `<label class="agree" id="${id}Box"${hidden ? ' hidden' : ''}><input type="checkbox" id="${id}" name="sms_consent" value="yes"><span>I agree to receive texts from Spot. ${esc(SMS_CONSENT.replace(/^By entering your number you agree to receive texts from Spot: /, 'Texts are '))} <a href="/terms#texts">Terms</a> · <a href="/privacy">Privacy</a></span></label>`;

// /signin, and /texts: the same page opened on the text option, readable
// without clicking anything (the SMS opt-in carriers review).
export function signinPage({ origin, providers = {}, texts = false }) {
  return page({
    origin,
    path: texts ? '/texts' : '/signin',
    title: texts ? 'Get Spot by text · Spot' : 'Sign in · Spot',
    body: `<div class="signin box">
  <h1 style="font-size:38px">${texts ? 'Get Spot by text' : 'Sign in'}</h1>
  <p class="sub" id="lead">${texts ? 'Spot texts you a sign-in code, and updates about your own orders: when someone pays for your cart, when your AI asks you to approve something, and when it’s ordered or booked. No marketing.' : 'We’ll send you a 6-digit code. No password needed.'}</p>
  <div class="seg" role="tablist" aria-label="Send the code by" id="seg"${texts ? ' hidden' : ''}><button type="button" role="tab" aria-selected="${!texts}" data-mode="email">Email</button><button type="button" role="tab" aria-selected="${texts}" data-mode="phone">Text</button></div>
  <form class="f" id="emailForm" ${texts ? 'name="sms_optin"' : 'name="signin"'}>${texts ? '' : '<input type="email" id="email" name="email" required placeholder="you@email.com" autocomplete="email webauthn" aria-label="Email">'}${texts ? '<label for="phone" class="sub" style="margin:0;font-weight:600">Mobile phone number</label>' : ''}<input type="tel" id="phone" name="phone" placeholder="Mobile number" autocomplete="tel" inputmode="tel" aria-label="Mobile phone number" ${texts ? 'required' : 'hidden'}>${smsAgree('smsOk', !texts)}<button class="btn primary" id="sendBtn">${texts ? 'Text me a code' : 'Email me a code'}</button></form>
  <form class="f" id="codeForm" hidden><p class="hint" id="devCode" hidden></p><input id="code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="••••••" aria-label="6-digit code"><button class="btn primary">Sign in</button><button type="button" class="linkbtn" id="again">Start over</button></form>
  <div class="or" id="or"${texts ? ' hidden' : ''}><span>or</span></div><div class="sso" id="sso"${texts ? ' hidden' : ''}><button type="button" class="btn ghost pk-b" id="pkBtn" hidden>🔑 Use Face ID or a passkey</button>${providers.google ? `<a class="sso-b google" data-p="google" href="/auth/google/start">${GOOGLE_G}Continue with Google</a>` : ''}${providers.facebook ? `<a class="sso-b facebook" data-p="facebook" href="/auth/facebook/start">${FB_F}Continue with Facebook</a>` : ''}</div>
  <p class="err" id="err"></p>
  <p class="sub" style="font-size:13px;margin:14px 0 0">By continuing you agree to Spot’s <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>
</div>`,
    script: `${PASSKEY_JS}
const ERRORS=${JSON.stringify(ERRORS)};
let pkAbort=null;
const q=new URLSearchParams(location.search);if(ERRORS[q.get('error')])$('#err').textContent=ERRORS[q.get('error')];
const next=(()=>{const n=new URLSearchParams(location.search).get('next')||'/account';return n.startsWith('/')&&!n.startsWith('//')?n:'/account'})();
let mode=${JSON.stringify(texts ? 'phone' : 'email')},who='';
const setMode=m=>{mode=m;document.querySelectorAll('#seg button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.mode===m)));
  const ph=m==='phone',em=$('#email');if(em){em.hidden=ph;em.required=!ph}$('#phone').hidden=!ph;$('#phone').required=ph;$('#smsOkBox').hidden=!ph;$('#smsOk').required=ph;
  $('#sendBtn').textContent=ph?'Text me a code':'Email me a code';(ph?$('#phone'):em)?.focus();try{localStorage.setItem('spot:signin',m)}catch{}};
$('#seg').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setMode(b.dataset.mode)});
${texts ? "setMode('phone');" : "try{if(localStorage.getItem('spot:signin')==='phone')setMode('phone')}catch{}"}
$('#emailForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';if(pkAbort){pkAbort.abort();pkAbort=null}const b=$('#sendBtn');b.disabled=true;
  try{who=(mode==='phone'?$('#phone'):$('#email')).value.trim();const r=await post('/v1/auth/start',mode==='phone'?{phone:who,sms_consent:$('#smsOk').checked}:{email:who});
    $('#seg').hidden=true;$('#emailForm').hidden=true;$('#codeForm').hidden=false;$('#or').hidden=true;$('#sso').hidden=true;$('#lead').textContent='Enter the code we '+(mode==='phone'?'texted to ':'sent to ')+who+'.';
    if(r.code){$('#devCode').hidden=false;$('#devCode').textContent='Test mode (no '+(mode==='phone'?'texting':'email')+' service yet): your code is '+r.code;$('#code').value=r.code}
    $('#code').focus()}catch(err){$('#err').textContent=err.message}finally{b.disabled=false}});
$('#codeForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const b=e.target.querySelector('button');b.disabled=true;
  try{await post('/v1/auth/verify',{[mode==='phone'?'phone':'email']:who,code:$('#code').value});signedIn();location.href=next}catch(err){$('#err').textContent=err.message;b.disabled=false}});
// Phones that support it fill the code straight from the text (WebOTP).
if('OTPCredential' in window){const ac=new AbortController();$('#codeForm').addEventListener('submit',()=>ac.abort());
  $('#emailForm').addEventListener('submit',()=>{if(mode==='phone')navigator.credentials.get({otp:{transport:['sms']},signal:ac.signal}).then(o=>{if(o&&o.code){$('#code').value=o.code;$('#codeForm').requestSubmit()}}).catch(()=>{})})}
document.querySelectorAll('.sso-b').forEach(a=>{a.href='/auth/'+a.dataset.p+'/start?next='+encodeURIComponent(next)});
// Passkeys: a button, plus the browser's autofill offering saved passkeys
// right in the email box (conditional UI).
const signedIn=()=>{try{localStorage.setItem('spot:in','1')}catch{}};
const pkDone=()=>{signedIn();location.href=next};
if(${!texts}&&pkOK()){$('#pkBtn').hidden=false;
  // A fresh challenge ready before the tap (they last 5 minutes).
  let pkPre=null;const pkLoad=()=>pkOptions().then(o=>{pkPre=o}).catch(()=>{pkPre=null});pkLoad();setInterval(pkLoad,4*60_000);
  $('#pkBtn').onclick=async()=>{$('#err').textContent='';if(pkAbort)pkAbort.abort();pkAbort=null;
    const pre=pkPre;pkPre=null;
    try{await pkSignIn(undefined,undefined,pre);pkDone()}catch(err){
      $('#err').textContent=err.name==='NotAllowedError'||err.name==='AbortError'||err.message==='cancelled'?'Face ID didn’t finish, or this device has no Spot passkey. Try again, or get a code.':err.message;
    }finally{if(!pkPre)pkLoad()}};
  (async()=>{try{if(!(await PublicKeyCredential.isConditionalMediationAvailable?.())) return;pkAbort=new AbortController();
    await pkSignIn('conditional',pkAbort.signal);pkDone()}catch(err){if(err.name!=='AbortError'&&err.name!=='NotAllowedError'&&err.message!=='cancelled')$('#err').textContent=err.message}})()}
const altOK=()=>!$('#pkBtn').hidden||Boolean(document.querySelector('.sso-b'));
$('#or').hidden=${texts}||!altOK();
$('#again').onclick=()=>{$('#codeForm').hidden=true;$('#seg').hidden=false;$('#emailForm').hidden=false;$('#or').hidden=${texts}||!altOK();$('#sso').hidden=${texts};$('#lead').textContent='We’ll send you a 6-digit code. No password needed.'};`,
  });
}

export function accountPage({ origin, provider = 'sandbox' }) {
  return page({
    origin,
    head: provider === 'stripe' ? '<script src="https://js.stripe.com/v3/"></script>' : '',
    path: '/account',
    title: 'Your account · Spot',
    body: `<div class="btnrow" style="justify-content:space-between"><h1 id="hi">Your Spot</h1><button class="btn ghost" id="out">Sign out</button></div>
<p class="sub" id="who"></p>
<section id="readySec" hidden><h2>Ready for you</h2><p class="sub">Carts and flights your AI put together. Tap to check and finish.</p><div class="ready" id="ready"></div></section>
<section><h2>Your Spots</h2><p class="sub">Everything you’ve asked for, on any device, including what your AI bought or asked for.</p><div class="seg three" role="tablist" aria-label="Show" id="cartSeg" hidden><button type="button" role="tab" aria-selected="true" data-f="all">All</button><button type="button" role="tab" aria-selected="false" data-f="ai">By your AI</button><button type="button" role="tab" aria-selected="false" data-f="you">By you</button></div><div class="box list" id="carts"></div></section>
<section><h2>Saved details</h2><p class="sub">Filled in for you at checkout.</p>
  <form class="box f" id="shipForm">
    <input name="name" placeholder="Full name" autocomplete="name" aria-label="Full name">
    <input name="line1" placeholder="Street" autocomplete="address-line1" aria-label="Street">
    <input name="line2" placeholder="Apt, suite (optional)" autocomplete="address-line2" aria-label="Apt or suite">
    <div class="three"><input name="city" placeholder="City" autocomplete="address-level2" aria-label="City"><input name="state" placeholder="State" autocomplete="address-level1" aria-label="State"><input name="postal_code" placeholder="ZIP" autocomplete="postal-code" inputmode="numeric" aria-label="ZIP"></div>
    <input name="phone" type="tel" placeholder="Phone (optional)" autocomplete="tel" aria-label="Phone">
    <input name="email" type="email" placeholder="Email for receipts" autocomplete="email" aria-label="Email for receipts">
    <div class="btnrow"><button class="btn primary">Save address</button><span class="ok-msg" id="shipOk"></span></div>
  </form>
  <form class="box f" id="payForm" style="margin-top:12px"><h3 style="font-size:18px;margin:0">Get paid on Venmo or Cash App</h3><p class="sub" style="margin:0">For stores Spot can’t buy from, like Amazon: whoever pays sends the money here and you buy it yourself.</p>
    <div class="two"><input name="venmo" placeholder="Venmo @handle" autocapitalize="off" aria-label="Venmo handle"><input name="cashtag" placeholder="Cash App $cashtag" autocapitalize="off" aria-label="Cash App cashtag"></div>
    <div class="btnrow"><button class="btn primary">Save</button><span class="ok-msg" id="payOk"></span></div>
  </form>
  <div class="box" style="margin-top:12px"><h3 style="font-size:18px;margin:0 0 6px">Travelers</h3><p class="sub" style="margin:0">Names exactly as on their ID.</p><div id="travs"></div>
    <form class="f" id="travForm" style="margin-top:10px"><div class="two"><input name="given_name" placeholder="First name" required aria-label="First name"><input name="family_name" placeholder="Last name" required aria-label="Last name"></div><div class="two"><label class="fl">Date of birth<input name="born_on" type="date" required></label><label class="fl">Gender on ID<select name="gender" required><option value="">Choose</option><option value="f">Female</option><option value="m">Male</option></select></label></div><div class="btnrow"><button class="btn ghost">Add traveler</button></div></form>
  </div>
</section>
<section id="signinSec"><h2>Sign-in methods</h2><p class="sub">Every way you can get into this account. Add your phone and email so either one works.</p>
  <div class="box"><div id="methods"></div>
    <form class="addf" id="addForm" hidden><label class="sub" id="addLabel" for="addVal" style="margin:0"></label><div class="row"><input id="addVal" aria-describedby="addLabel"><button class="btn primary" id="addSend">Send code</button></div>${smsAgree('addSmsOk', true)}</form>
    <form class="addf" id="addCode" hidden><p class="hint" id="addDev" hidden></p><label class="sub" id="addCodeLabel" for="addCodeVal" style="margin:0"></label><div class="row"><input id="addCodeVal" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="••••••"><button class="btn primary">Verify</button></div><button type="button" class="linkbtn" id="addCancel" style="justify-self:start">Cancel</button></form>
    <p class="ok-msg" id="addOk"></p>
  </div>
  <div class="box" style="margin-top:12px"><h3 style="font-size:18px;margin:0 0 6px">Face ID &amp; passkeys</h3><p class="sub" style="margin:0">Sign in with a glance or a touch instead of waiting for a code. Your fingerprint or face never leaves your device.</p><div id="pks"></div>
    <div class="btnrow" style="margin-top:10px"><button class="btn primary" id="addPk" hidden>Add Face ID or a passkey</button></div><p class="sub" id="pkNo" style="margin:10px 0 0" hidden>This browser doesn’t support passkeys.</p></div>
</section>
<section id="ai-card"><h2>Your AI’s card</h2><p class="sub">Save your card once and your AI never needs it. Each purchase gets its own Spot card, capped at that order and locked to that store, then closed. You approve each one with a tap, unless you choose otherwise.</p>
  <div class="box"><div id="fundCard"></div>
    <form class="f" id="fundForm" hidden style="margin-top:10px"><div id="fundEl"></div><select id="fundTest" hidden aria-label="Test card"><option value="4242">Test card •4242 (works)</option><option value="0002">Test card •0002 (declined)</option><option value="3155">Test card •3155 (bank checks it)</option></select><div class="btnrow"><button class="btn primary" id="fundSave">Save card</button><button type="button" class="linkbtn" id="fundCancel">Cancel</button></div></form>
    <div id="autoBox" hidden style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"></div>
    <div class="stop" id="stopBox"></div>
  </div>
</section>
<section><h2>Your AI</h2><p class="sub">Connect Claude or any MCP app. Anything it hands back to you shows up above under “Ready for you”. Set rules for each one, see everything it did, and disconnect it any time. Your AI never gets a card number.</p>
  <div class="box"><div id="keys"></div><div class="btnrow" style="margin-top:10px"><button class="btn primary" id="connectAi">Connect a new AI</button></div>
    <div id="connectOut" class="connect" hidden>
      <p style="margin:14px 0 6px"><b>Add Spot to your AI app, then tap Allow.</b> No key to copy.</p>
      <div class="mcpurl"><code id="mcpUrl"></code><button class="btn ghost" id="copyUrl">Copy</button></div>
      <ol class="steps"><li><b>Claude</b>: Settings → Connectors → Add custom connector. Paste the link and tap Add, then Connect.</li><li><b>ChatGPT</b>: Settings → Apps &amp; Connectors → Create (turn on Developer mode under Advanced if you don’t see it). Paste the link and choose OAuth.</li></ol>
      <p class="sub" style="margin:8px 0 0">Spot asks you to sign in and Allow. The app then shows up here, where you can set its rules.</p>
      <p class="sub" style="margin:10px 0 0">Another app, or one without sign-in? <button type="button" class="linkbtn" id="newKey">Get a key to paste instead</button></p>
      <div id="newKeyOut" hidden><p class="ok-msg" style="margin-top:12px">Paste this into your AI app’s MCP settings. The key is shown once.</p><pre id="cfg"></pre><button class="btn ghost" id="copyCfg">Copy</button></div>
    </div></div>
</section>
<section><h2>Your approver</h2><p class="sub">Someone who pays for, or turns down, what your AI asks for when your rules say so: a parent, a partner, your finance inbox. They agree by email first.</p>
  <div class="box"><div id="apv"></div>
    <form class="f" id="apvForm" style="margin-top:10px"><div class="two"><input name="name" placeholder="Their name" aria-label="Approver name"><input name="email" type="email" placeholder="Their email" required aria-label="Approver email"></div><div class="btnrow"><button class="btn primary">Ask them</button><span class="ok-msg" id="apvOk"></span></div></form>
  </div>
</section>
<p class="err" id="err"></p>`,
    script: `${PASSKEY_JS}
const usd=c=>'$'+(c/100).toFixed(2);
const fmtPhone=p=>{const m=/^\\+1(\\d{3})(\\d{3})(\\d{4})$/.exec(p||'');return m?'('+m[1]+') '+m[2]+'-'+m[3]:p};
const LABEL={open:['waiting',''],paid:['paid','warn'],card_issued:['paid','ok'],completed:['done','ok'],canceled:['canceled',''],expired:['expired',''],refunded:['refunded','']};
let me=null;
async function load(){
  const r=await fetch('/v1/me');if(r.status===401){try{localStorage.removeItem('spot:in')}catch{}location.href='/signin?next=/account';return}try{localStorage.setItem('spot:in','1')}catch{}const na=document.getElementById('navAcct');if(na){na.textContent='My Spots';na.href='/account'}
  me=await r.json();const u=me.user;
  $('#hi').textContent=u.name?'Hi, '+u.name.split(' ')[0]:'Your Spot';$('#who').textContent='Signed in as '+(u.email||fmtPhone(u.phone));
  $('#readySec').hidden=!me.ready.length;
  $('#ready').innerHTML=me.ready.map(c=>'<a class="rcard" href="'+esc(c.manage_url)+'"><span><b>'+(c.kind==='flight'?'✈️ ':c.kind==='train'?'🚆 ':'🛒 ')+esc(c.items[0]?.title||'Your cart')+'</b><small>'+esc(c.merchant.name)+' · '+usd(c.total_cents)+' · held until '+new Date(c.expires_at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+'</small></span><span class="go">Finish →</span></a>').join('');
  renderCarts();
  const s=Object.assign({name:u.name||'',email:u.email||'',phone:u.phone||''},u.shipping||{});for(const el of $('#shipForm').elements)if(el.name)el.value=s[el.name]||'';$('#payForm').venmo.value=u.venmo?'@'+u.venmo:'';$('#payForm').cashtag.value=u.cashtag?'$'+u.cashtag:'';
  $('#travs').innerHTML=u.travelers.map((t,i)=>'<div class="trav"><span>'+esc(t.given_name+' '+t.family_name)+(t.born_on?' <small class="sub">· '+esc(t.born_on)+'</small>':'')+'</span><button class="linkbtn" data-rm="'+i+'">Remove</button></div>').join('');
  const row=(ic,title,sub,btn)=>'<div class="meth"><span class="ic" aria-hidden="true">'+ic+'</span><span>'+title+(sub?'<small>'+sub+'</small>':'')+'</span>'+(btn||'')+'</div>';
  const NAMES={google:'Google',facebook:'Facebook'};
  $('#methods').innerHTML=row('✉️',u.email?esc(u.email):'Email',u.email?'Sign-in codes and receipts':'Not added yet',u.email?'<button class="linkbtn" data-add="email">Change</button>':'<button class="btn ghost" data-add="email">Add email</button>')
    +row('📱',u.phone?esc(fmtPhone(u.phone)):'Phone',u.phone?'Sign-in codes by text':'Not added yet',u.phone?'<button class="linkbtn" data-add="phone">Change</button>':'<button class="btn ghost" data-add="phone">Add phone</button>')
    +me.linked.map(p=>row(p==='google'?'🟢':'🔵',esc(NAMES[p]||p),'Connected','')).join('');
  $('#pks').innerHTML=me.passkeys.map(k=>'<div class="trav"><span>🔑 '+esc(k.name||'Passkey')+' <small class="sub">· added '+new Date(k.created_at).toLocaleDateString()+(k.used_at?', last used '+new Date(k.used_at).toLocaleDateString():'')+'</small></span><button class="linkbtn" data-pk="'+esc(k.id)+'">Remove</button></div>').join('');
  $('#addPk').hidden=!pkOK();$('#pkNo').hidden=pkOK();
  drawFunding();
  $('#keys').innerHTML=me.keys.length?me.keys.map(keyRow).join(''):'<p class="sub" style="margin:0">No AI connected yet.</p>';
  const a=me.approver;
  $('#apv').innerHTML=a?'<div class="trav"><span>'+esc(a.name||a.email)+' <small class="sub">· '+esc(a.email)+' · '+(a.confirmed?'confirmed':'waiting for them to agree')+'</small></span><button class="linkbtn" id="apvRm">Remove</button></div>':'<p class="sub" style="margin:0">No approver yet.</p>';
  $('#apvForm').hidden=Boolean(a&&a.confirmed);
  const rm=$('#apvRm');if(rm)rm.onclick=async()=>{if(!confirm('Remove your approver? AI keys that sent asks to them will refuse instead.'))return;try{await post('/v1/me/approver/remove');load()}catch(err){$('#err').textContent=err.message}};
}
// One AI key: its rules, this month, what it did, and the off switch.
// Your Spots, with who made each one: you, or one of your AIs.
const AI_NAME={claude:'Claude',chatgpt:'ChatGPT','my-ai':'Your AI'};
const aiName=n=>AI_NAME[n]||n;
let cartFilter='all';
function renderCarts(){
  const all=me.carts,mine=all.filter(c=>cartFilter==='all'||(cartFilter==='ai')===Boolean(c.built_by));
  $('#cartSeg').hidden=!all.some(c=>c.built_by);
  $('#carts').innerHTML=mine.length?mine.map(c=>{const [l,t]=LABEL[c.status]||[c.status,''];return '<a class="item" href="'+esc(c.manage_url)+'"><span>'+esc(c.items[0]?.title||'Cart')+(c.items.length>1?' +'+(c.items.length-1):'')+'<span class="st '+(c.held?'warn':t)+'">'+(c.held?'checking':l)+'</span>'+(c.built_by?'<span class="st ai">🤖 '+esc(aiName(c.built_by))+'</span>':'')+'<small>'+esc(c.merchant.name)+(c.for==='self'?' · for you':' · '+(c.payer_name?esc(c.payer_name)+' spotted you':'someone else pays'))+' · '+new Date(c.created_at).toLocaleDateString()+'</small></span><span class="amt">'+usd(c.total_cents)+'</span></a>'}).join('')
    :all.length?'<p class="sub" style="margin:0">'+(cartFilter==='ai'?'Your AI hasn’t asked for anything yet.':'Nothing you made yourself yet.')+'</p>':'<p class="sub" style="margin:0">No Spots yet. <a href="/new">Make one</a>, or ask your AI.</p>';
}
$('#cartSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cartFilter=b.dataset.f;document.querySelectorAll('#cartSeg button').forEach(x=>x.setAttribute('aria-selected',String(x===b)));renderCarts()});
const ACT={connected:'Connected',ask_created:'Asked',ask_routed:'Sent to your approver',blocked_by_rule:'Blocked',flight_ask:'Held a flight',order_started:'Started the order',message_sent:'Sent you a link',rules_changed:'Rules changed',disconnected:'Disconnected',paid_from_card:'Paid from your card',autopay_failed:'Couldn’t pay on its own, sent you Approve',ai_stopped:'Stopped by your kill switch',ai_resumed:'Turned back on'};
const PAY={link:'send me a link to pay',tap:'charge my card when I tap Approve',auto:'pay automatically (no tap)'};
const APV={never:'refuse',over_limit:'send to my approver',always:'always send to my approver'};
function keyRow(k){
  const r=k.rules||{};
  const rules=[r.max_order_cents?'up to '+usd(r.max_order_cents)+' an order':'',r.monthly_cents?usd(r.monthly_cents)+' a month':'',r.stores&&r.stores.length?'only '+r.stores.join(', '):'',r.approver&&r.approver!=='never'?(r.approver==='always'?'every ask goes to your approver':'over the limit goes to your approver'):'',r.pay==='tap'?'you approve each with a tap':r.pay==='auto'?'pays automatically inside these rules':''].filter(Boolean).join(' · ')||'No rules yet';
  const acts=(k.activity||[]).map(e=>{const d=e.detail||{};return '<li><b>'+esc(ACT[e.kind]||e.kind)+'</b> '+esc([d.item,d.merchant,d.cents!=null?usd(d.cents):'',d.reason].filter(Boolean).join(' · '))+' <small class="sub">'+new Date(e.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</small></li>'}).join('');
  if(k.revoked)return '<div class="trav"><span>'+esc(k.name)+' <small class="sub">· disconnected</small></span></div>';
  return '<div class="keyc"><div class="trav" style="border:0"><span><b>🤖 '+esc(k.name)+'</b> <small class="sub">· connected '+new Date(k.created_at).toLocaleDateString()+' · '+usd(k.month_cents||0)+' asked this month</small></span><button class="linkbtn" data-revoke="'+esc(k.name)+'">Disconnect</button></div>'
    +'<p class="sub" style="margin:0 0 6px">'+esc(rules)+'</p>'
    +'<details class="more"><summary>Rules</summary><form class="f" data-rules="'+esc(k.name)+'" style="margin-top:8px"><div class="two"><input name="max" inputmode="decimal" placeholder="Max per order, $" value="'+(r.max_order_cents?r.max_order_cents/100:'')+'" aria-label="Max per order in dollars"><input name="month" inputmode="decimal" placeholder="Max per month, $" value="'+(r.monthly_cents?r.monthly_cents/100:'')+'" aria-label="Max per month in dollars"></div><input name="stores" placeholder="Only these stores (e.g. target.com, nike.com)" value="'+esc((r.stores||[]).join(', '))+'" aria-label="Allowed stores"><select name="approver" aria-label="When a rule is broken">'+Object.entries(APV).map(([v,l])=>'<option value="'+v+'"'+((r.approver||'never')===v?' selected':'')+'>When over a limit: '+l+'</option>').join('')+'</select><select name="pay" aria-label="How it pays">'+Object.entries(PAY).map(([v,l])=>'<option value="'+v+'"'+((r.pay||'link')===v?' selected':'')+((v!=='link'&&!(me.funding&&me.funding.card))||(v==='auto'&&!(me.funding&&me.funding.auto_ok))?' disabled':'')+'>Inside the rules: '+l+'</option>').join('')+'</select><div class="btnrow"><button class="btn ghost">Save rules</button></div></form></details>'
    +(acts?'<details class="more"><summary>Activity</summary><ul class="acts">'+acts+'</ul></details>':'<p class="sub" style="margin:0">No activity yet.</p>')+'</div>';
}
document.addEventListener('submit',async e=>{const f=e.target.closest('[data-rules]');if(!f)return;e.preventDefault();$('#err').textContent='';const v=Object.fromEntries(new FormData(f));
  const c=x=>x.trim()?Math.round(parseFloat(x.replace(/[$,]/g,''))*100):null;
  try{await post('/v1/me/keys/'+encodeURIComponent(f.dataset.rules)+'/rules',{max_order_cents:c(v.max),monthly_cents:c(v.month),stores:v.stores.split(/[\s,]+/).filter(Boolean),approver:v.approver,pay:v.pay});load()}catch(err){$('#err').textContent=err.message}});
$('#apvForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const v=Object.fromEntries(new FormData(e.target));
  try{const r=await post('/v1/me/approver',v);$('#apvOk').textContent=r.confirm_link?'Test mode: they would get this link by email.':'Sent. They need to tap Yes in the email.';if(r.confirm_link)console.log(r.confirm_link);e.target.reset();load()}catch(err){$('#err').textContent=err.message}});
// Spots made on this device before signing in join the account.
async function claimLocal(){let mine=[];try{mine=JSON.parse(localStorage.getItem('spot:mine'))||[]}catch{}
  const links=mine.map(m=>{try{const u=new URL(m.manage,location.origin);return {token:u.pathname.split('/')[2],k:u.searchParams.get('k')}}catch{return null}}).filter(l=>l&&l.k);
  if(links.length){try{await post('/v1/me/claim',{links})}catch{}}}
$('#shipForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const v=Object.fromEntries(new FormData(e.target));const name=v.name;
  try{await post('/v1/me',{name,shipping:v.line1?{...v}:null});$('#shipOk').textContent='Saved';setTimeout(()=>$('#shipOk').textContent='',2000);load()}catch(err){$('#err').textContent=err.message}});
$('#payForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const v=Object.fromEntries(new FormData(e.target));
  try{await post('/v1/me',{venmo:v.venmo,cashtag:v.cashtag});$('#payOk').textContent='Saved';setTimeout(()=>$('#payOk').textContent='',2000);load()}catch(err){$('#err').textContent=err.message}});
$('#travForm').addEventListener('submit',async e=>{e.preventDefault();const t=Object.fromEntries(new FormData(e.target));try{await post('/v1/me',{travelers:[...me.user.travelers,t]});e.target.reset();load()}catch(err){$('#err').textContent=err.message}});
document.addEventListener('click',async e=>{const rm=e.target.closest('[data-rm]'),rv=e.target.closest('[data-revoke]');
  try{if(rm){await post('/v1/me',{travelers:me.user.travelers.filter((_,i)=>i!==+rm.dataset.rm)});load()}
    if(rv){if(!confirm('Disconnect this AI? It stops working right away.'))return;await post('/v1/me/keys/'+encodeURIComponent(rv.dataset.revoke)+'/revoke');load()}}catch(err){$('#err').textContent=err.message}});
$('#mcpUrl').textContent=location.origin+'/mcp';
$('#connectAi').onclick=()=>{$('#connectOut').hidden=!$('#connectOut').hidden};
$('#copyUrl').onclick=async()=>{try{await navigator.clipboard.writeText($('#mcpUrl').textContent);$('#copyUrl').textContent='Copied'}catch{}};
$('#newKey').onclick=async()=>{try{const k=await post('/v1/me/keys',{agent_name:'my-ai'});$('#cfg').textContent=JSON.stringify({mcpServers:{spot:{url:k.mcp_url,headers:{Authorization:'Bearer '+k.api_key}}}},null,2);$('#newKeyOut').hidden=false;load()}catch(err){$('#err').textContent=err.message}};
$('#copyCfg').onclick=async()=>{try{await navigator.clipboard.writeText($('#cfg').textContent);$('#copyCfg').textContent='Copied'}catch{}};
// Adding an email or phone: send a code to it, then type the code.
let adding=null,addWhat='';
const addReset=()=>{adding=null;$('#addForm').hidden=true;$('#addCode').hidden=true;$('#addDev').hidden=true};
document.addEventListener('click',e=>{const b=e.target.closest('[data-add]');if(!b)return;adding=b.dataset.add;$('#addOk').textContent='';$('#addCode').hidden=true;
  const ph=adding==='phone',v=$('#addVal');v.type=ph?'tel':'email';v.autocomplete=ph?'tel':'email';v.inputMode=ph?'tel':'email';v.placeholder=ph?'Mobile number':'you@email.com';v.value='';
  $('#addLabel').textContent=ph?'We’ll text a code to confirm it’s yours.':'We’ll email a code to confirm it’s yours.';$('#addSmsOkBox').hidden=!ph;$('#addSmsOk').required=ph;$('#addSmsOk').checked=false;
  $('#addForm').hidden=false;v.focus()});
$('#addForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const b=$('#addSend');b.disabled=true;
  try{addWhat=$('#addVal').value.trim();const r=await post('/v1/me/link/start',adding==='phone'?{phone:addWhat,sms_consent:$('#addSmsOk').checked}:{email:addWhat});$('#addForm').hidden=true;$('#addCode').hidden=false;
    $('#addCodeLabel').textContent='Enter the code we '+(adding==='phone'?'texted to ':'sent to ')+addWhat+'.';
    if(r.code){$('#addDev').hidden=false;$('#addDev').textContent='Test mode: your code is '+r.code;$('#addCodeVal').value=r.code}else $('#addCodeVal').value='';
    $('#addCodeVal').focus()}catch(err){$('#err').textContent=err.message}finally{b.disabled=false}});
$('#addCode').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';
  try{const r=await post('/v1/me/link/verify',{[adding]:addWhat,code:$('#addCodeVal').value});const what=adding==='phone'?'Phone':'Email';addReset();
    $('#addOk').textContent=r.merged?what+' added. It had its own Spot account, so we moved everything from it into this one.':what+' added. You can sign in with it now.';load()}catch(err){$('#err').textContent=err.message}});
$('#addCancel').onclick=addReset;
$('#addPk').onclick=async()=>{$('#err').textContent='';try{await pkRegister(pkDeviceName());$('#addOk').textContent='';load()}
  catch(err){if(err.name==='InvalidStateError')$('#err').textContent='This device already has a Spot passkey.';else if(err.name!=='NotAllowedError'&&err.name!=='AbortError')$('#err').textContent=err.message}};
document.addEventListener('click',async e=>{const b=e.target.closest('[data-pk]');if(!b)return;if(!confirm('Remove this passkey? You can still sign in with a code.'))return;
  try{await post('/v1/me/passkeys/'+encodeURIComponent(b.dataset.pk)+'/remove');load()}catch(err){$('#err').textContent=err.message}});

// Your AI's card: save it, the separate automatic opt-in, and the kill switch.
const MODE=${JSON.stringify(provider)};
let fundStripe=null;
function drawFunding(){
  const f=me.funding||{};const c=f.card;
  $('#fundCard').innerHTML=c?'<div class="aicard"><span class="chip" aria-hidden="true"></span><span><b>'+esc(c.label)+'</b><small class="sub" style="display:block;margin:0">Pays for what your AI asks for, only when your rules say so</small></span><button class="linkbtn" id="fundRm">Remove</button></div>'
    :'<div class="trav" style="border:0"><span class="sub" style="margin:0">No card saved. Your AI’s asks come to you as a link to pay.</span><button class="btn primary" id="fundAdd">Add a card</button></div>';
  $('#autoBox').hidden=!c;
  $('#autoBox').innerHTML=!c?'':f.auto_ok
    ?'<b>Your AI can pay without asking</b><p class="sub" style="margin:4px 0 8px">For AIs you set to “Pay automatically”: inside their rules, Spot charges your card and places the order without a tap, as long as the store’s total is inside the card’s cap. Anything over goes to you.</p><button class="btn ghost" id="autoOff">Turn off</button>'
    :'<b>Let your AI pay without asking? <small class="sub">(optional)</small></b><p class="sub" style="margin:4px 0 8px">Off by default. When it’s on, AIs you set to “Pay automatically” buy inside their rules without a tap: a max per order is required, and every card is still capped and locked to one store.</p><label class="agree"><input type="checkbox" id="autoAgree"><span>I agree my AI can charge my '+esc(c.label)+' without asking me each time, inside the rules I set. I can turn this off, or stop all AI spending, any time.</span></label><button class="btn ghost" id="autoOn">Turn on</button>';
  $('#stopBox').innerHTML=f.ai_stopped
    ?'<span><b>🛑 AI spending is stopped</b><small class="sub" style="display:block;margin:0">Every AI on your account is refused until you turn it back on.</small></span><button class="btn primary" id="aiResume">Turn back on</button>'
    :'<span><b>Kill switch</b><small class="sub" style="display:block;margin:0">Stops every AI on your account at once, and refunds cards not used yet.</small></span><button class="btn danger" id="aiStop">Stop all AI spending</button>';
}
document.addEventListener('click',async e=>{const id=e.target.id;if(!['fundAdd','fundRm','fundCancel','autoOn','autoOff','aiStop','aiResume'].includes(id))return;$('#err').textContent='';
  try{
    if(id==='fundAdd'){$('#fundForm').hidden=false;$('#fundTest').hidden=MODE!=='sandbox';
      if(MODE==='stripe'){const s=await post('/v1/me/funding/setup');const stripe=Stripe(s.publishable_key);const elements=stripe.elements({clientSecret:s.client_secret,appearance:{variables:{colorPrimary:'#ff5a36',borderRadius:'12px'}}});elements.create('payment',{layout:'tabs',wallets:{applePay:'never',googlePay:'never'}}).mount('#fundEl');fundStripe={stripe,elements}}}
    if(id==='fundCancel'){$('#fundForm').hidden=true;$('#fundEl').innerHTML='';fundStripe=null}
    if(id==='fundRm'){if(!confirm('Remove this card? Your AI’s asks go back to coming as a link to pay.'))return;me.funding=await post('/v1/me/funding/remove');load()}
    if(id==='autoOn'){me.funding=await post('/v1/me/funding/auto',{on:true,agree:$('#autoAgree').checked});load()}
    if(id==='autoOff'){me.funding=await post('/v1/me/funding/auto',{on:false});load()}
    if(id==='aiStop'){if(!confirm('Stop every AI on your account? New asks are refused, and cards not used yet are canceled and refunded.'))return;const r=await post('/v1/me/ai/stop');$('#addOk').textContent='';alert('Stopped. '+(r.refunded?r.refunded+' unused card'+(r.refunded>1?'s':'')+' canceled and refunded.':'Nothing was waiting to be bought.')+(r.still_ordering?' '+r.still_ordering+' order'+(r.still_ordering>1?'s are':' is')+' already being placed.':''));load()}
    if(id==='aiResume'){await post('/v1/me/ai/resume');load()}
  }catch(err){$('#err').textContent=err.message}});
$('#fundForm').addEventListener('submit',async e=>{e.preventDefault();$('#err').textContent='';const b=$('#fundSave');b.disabled=true;
  try{let body;
    if(MODE==='stripe'){const {error,setupIntent}=await fundStripe.stripe.confirmSetup({elements:fundStripe.elements,redirect:'if_required',confirmParams:{return_url:location.href}});if(error)throw error;body={setup_intent:setupIntent.id}}
    else body={test_card:$('#fundTest').value};
    me.funding=await post('/v1/me/funding',body);$('#fundForm').hidden=true;$('#fundEl').innerHTML='';load()}catch(err){$('#err').textContent=err.message}finally{b.disabled=false}});
$('#out').onclick=async()=>{await post('/v1/auth/logout');try{localStorage.removeItem('spot:in')}catch{}location.href='/'};
claimLocal().then(load).catch(err=>{$('#err').textContent=err.message});`,
  });
}

// The approver's "yes" page, from the email. A button, so link scanners
// that open emails can't agree on someone's behalf.
export function approverConfirmPage({ origin }) {
  return page({
    origin,
    path: '/approver/confirm',
    title: 'Be an approver · Spot',
    body: `<div style="max-width:560px">
<h1>Be the approver?</h1>
<p class="sub">When their rules say so, their AI’s picks come to you by email: exactly what it chose, from which store, for how much. You pay for it, or turn it down. Nothing is charged unless you pay, and every yes is signed so there’s a record of who agreed to what.</p>
<div class="btnrow"><button class="btn primary" id="yes">Yes, I’ll approve</button></div>
<p class="ok-msg" id="ok"></p><p class="err" id="err"></p></div>`,
    script: `const q=new URLSearchParams(location.search);
$('#yes').onclick=async()=>{try{const r=await post('/v1/approver/confirm',{u:q.get('u'),t:q.get('t')});$('#ok').textContent='Done. You’re '+r.for+'’s approver. Each ask comes by email, and you can say no to any of them.';$('#yes').hidden=true}catch(e){$('#err').textContent=e.message}};`,
  });
}

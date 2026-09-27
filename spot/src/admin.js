// /admin: the operator's view. Held payments to release or refund, recent
// carts, block lists, API keys and signups.
//
//   SPOT_ADMIN_TOKEN   long random secret (16+ characters). Unset → /admin is
//                      a 404. Sign in once per browser; API calls can also
//                      send "Authorization: Bearer <token>".
//
// The session cookie is HttpOnly and SameSite=Strict, and every write takes a
// JSON body, so another site can't drive these actions from a visitor's
// browser.
import { createHash, timingSafeEqual } from 'node:crypto';
import { CartError } from './cart.js';
import { SITE_JS, siteHead } from './site.js';

const COOKIE = 'spot_admin';
const KINDS = ['card', 'email', 'ip', 'phone'];
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

export function registerAdmin(app, { db, spot, env, urlFor }) {
  const token = env.SPOT_ADMIN_TOKEN && env.SPOT_ADMIN_TOKEN.length >= 16 ? env.SPOT_ADMIN_TOKEN : null;
  const want = token ? Buffer.from(sha(token)) : null;
  const same = (v) => {
    const got = Buffer.from(sha(v));
    return want && got.length === want.length && timingSafeEqual(got, want);
  };
  const cookieOf = (req) => (String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)) || [])[1];

  function authed(req) {
    if (!token) return false;
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (bearer) return same(bearer.trim());
    const c = cookieOf(req);
    // The cookie holds sha256(sha256(token)): proof of sign-in, not the token.
    return Boolean(c) && c.length === 64 && timingSafeEqual(Buffer.from(c), Buffer.from(sha(sha(token))));
  }
  const guard = (req) => {
    if (!token) throw new CartError('Not found', 404);
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
    if (!authed(req)) throw new CartError('Sign in first', 401);
  };

  app.get('/admin', async (req, reply) => {
    if (!token) return reply.code(404).type('text/plain').send('Not found');
    return reply.type('text/html').header('cache-control', 'no-store').send(adminPage({ origin: urlFor(req, ''), signedIn: authed(req) }));
  });

  app.post('/admin/login', async (req, reply) => {
    if (!token) throw new CartError('Not found', 404);
    if (!same(String(req.body?.token || ''))) {
      await new Promise((r) => setTimeout(r, 400));
      throw new CartError('That token doesn’t match', 401);
    }
    const secure = urlFor(req, '').startsWith('https:') ? '; Secure' : '';
    reply.header('set-cookie', `${COOKIE}=${sha(sha(token))}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${7 * 86400}${secure}`);
    return { ok: true };
  });

  app.post('/admin/logout', async (req, reply) => {
    reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    return { ok: true };
  });

  const summary = (c) => {
    const pay = db.risk.paymentFor(c.id);
    return {
      id: c.id,
      token: c.token,
      status: c.status,
      kind: c.kind || 'goods',
      for: c.for || 'other',
      merchant: c.merchant?.name,
      item: c.items?.[0]?.title || null,
      items: c.items?.length || 0,
      total_cents: c.total_cents,
      created_at: c.created_at,
      requester: c.requester?.name,
      payer: c.payer?.name || null,
      agent: c.agent || null,
      hold: c.hold?.reason || null,
      risk: c.risk?.reason || null,
      order: c.fulfillment?.state || null,
      booking: c.flight?.booking?.booking_reference || null,
      fingerprint: pay?.fingerprint || null,
      payer_email: pay?.payer_email || null,
      requester_ip: c.requester_ip || null,
    };
  };

  app.get('/v1/admin/overview', async (req, reply) => {
    guard(req);
    reply.header('cache-control', 'no-store');
    const recent = db.admin.recent(200).map(summary);
    const signups = db.waitlist();
    return {
      counts: db.admin.statusCounts(),
      held: recent.filter((c) => c.hold && c.status === 'paid'),
      recent: recent.slice(0, 60),
      blocks: db.blocks.list(),
      keys: db.admin.keys(),
      signups: signups.slice(0, 300),
      signup_total: signups.length,
    };
  });

  app.post('/v1/admin/carts/:id/release', async (req) => {
    guard(req);
    return { cart: summary(await spot.release(req.params.id)) };
  });
  app.post('/v1/admin/carts/:id/refund', async (req) => {
    guard(req);
    return { cart: summary(await spot.adminRefund(req.params.id)) };
  });

  app.post('/v1/admin/blocks', async (req) => {
    guard(req);
    const kind = String(req.body?.kind || '');
    const value = String(req.body?.value || '').trim().toLowerCase().slice(0, 200);
    if (!KINDS.includes(kind) || !value) throw new CartError(`Block needs a kind (${KINDS.join(', ')}) and a value`);
    db.blocks.add(kind, value, String(req.body?.reason || '').slice(0, 200) || null);
    return { blocks: db.blocks.list() };
  });
  app.post('/v1/admin/blocks/remove', async (req) => {
    guard(req);
    db.blocks.remove(String(req.body?.kind || ''), String(req.body?.value || '').toLowerCase());
    return { blocks: db.blocks.list() };
  });

  app.post('/v1/admin/keys/:name/revoke', async (req) => {
    guard(req);
    if (!db.admin.revokeKey(req.params.name)) throw new CartError('No key with that name', 404);
    return { keys: db.admin.keys() };
  });
}

const CSS = `
body{background:var(--bg)}
.adm{padding:34px 0 80px}
.adm h1{font-size:clamp(32px,5vw,46px)}
.adm h2{font-size:22px;letter-spacing:-.02em;margin:0 0 12px}
.adm .bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:22px 0 8px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.stat b{display:block;font-size:26px;font-variant-numeric:tabular-nums}.stat span{font-size:13px;color:var(--muted)}
.panel{margin-top:30px}
.held{display:grid;gap:10px}
.hcard{background:var(--card);border:1.5px solid var(--spot);border-radius:16px;padding:14px 16px;display:grid;gap:6px}
.hcard .why{font-weight:700;color:var(--spot)}
.hcard .meta{font-size:14px;color:var(--muted)}
.row{display:flex;gap:8px;flex-wrap:wrap}
.ab{font:600 14px Bricolage,system-ui,sans-serif;border-radius:999px;padding:8px 14px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.ab.go{background:var(--ok);border-color:var(--ok);color:#fff}.ab.no{border-color:var(--spot);color:var(--spot)}
.ab:disabled{opacity:.5}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--card)}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
td.num{text-align:right;font-variant-numeric:tabular-nums}
tr:last-child td{border-bottom:0}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--line)}
.pill.completed,.pill.card_issued{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.pill.paid{background:color-mix(in srgb,var(--spot2) 30%,transparent)}
.pill.refunded,.pill.canceled,.pill.expired{color:var(--muted)}
.pill.hold{background:var(--spot);color:#fff}
form.inline{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
form.inline input,form.inline select{font:inherit;font-size:15px;padding:9px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);min-width:0;flex:1 1 140px}
.muted{color:var(--muted)}.err{color:var(--spot);font-weight:600;min-height:1.2em}
.login{max-width:420px;margin:60px auto;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:26px}
.login input{width:100%;font:inherit;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);margin:14px 0}
`;

function adminPage({ origin, signedIn }) {
  const head = siteHead({ title: 'Spot admin', desc: 'Spot operator view', origin, path: '/admin', extraCss: CSS }).replace('<head>', '<head><meta name="robots" content="noindex">');
  if (!signedIn) {
    return `${head}
<main class="wrap"><form class="login" id="login"><h1 style="font-size:32px">Spot admin</h1><p class="muted" style="margin:6px 0 0">Paste the admin token from Railway (SPOT_ADMIN_TOKEN).</p>
<input type="password" name="token" id="token" autocomplete="current-password" required aria-label="Admin token"><button class="ab go" style="width:100%">Sign in</button><p class="err" id="err"></p></form></main>
<script>(()=>{${SITE_JS}
document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:document.getElementById('token').value})});if(r.ok)location.reload();else document.getElementById('err').textContent=(await r.json().catch(()=>({}))).error||'Try again'})})();</script>
</body></html>`;
  }
  return `${head}
<main class="adm"><div class="wrap">
  <div class="bar"><h1>Spot admin</h1><div class="row"><button class="ab" id="refresh">Refresh</button><button class="ab" id="logout">Sign out</button></div></div>
  <div class="stats" id="stats"></div>
  <section class="panel"><h2>Needs you</h2><div class="held" id="held"><p class="muted">Loading…</p></div></section>
  <section class="panel"><h2>Recent carts</h2><div class="tw"><table><thead><tr><th>When</th><th>Status</th><th>What</th><th>Store</th><th>Requester</th><th>Payer</th><th class="num">Total</th><th>Notes</th><th></th></tr></thead><tbody id="recent"></tbody></table></div></section>
  <section class="panel"><h2>Block list</h2>
    <form class="inline" id="blockForm"><select name="kind" aria-label="What to block"><option value="card">Card fingerprint</option><option value="email">Payer email</option><option value="ip">IP address</option><option value="phone">Phone</option></select><input name="value" placeholder="Value" required aria-label="Value"><input name="reason" placeholder="Reason (optional)" aria-label="Reason"><button class="ab no">Block</button></form>
    <div class="tw"><table><thead><tr><th>Kind</th><th>Value</th><th>Reason</th><th>Since</th><th></th></tr></thead><tbody id="blocks"></tbody></table></div></section>
  <section class="panel"><h2>API keys</h2><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody id="keys"></tbody></table></div></section>
  <section class="panel"><h2>Signups <span class="muted" id="signupTotal"></span></h2><div class="tw"><table><thead><tr><th>Email</th><th>Interest</th><th>When</th></tr></thead><tbody id="signups"></tbody></table></div></section>
  <p class="err" id="err"></p>
</div></main>
<script>(()=>{${SITE_JS}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2),when=t=>new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Failed');return d};
async function load(){
  const r=await fetch('/v1/admin/overview');if(r.status===401)return location.reload();const d=await r.json();
  const c=d.counts,n=k=>c[k]||0;
  $('#stats').innerHTML=[['Needs you',d.held.length],['Open',n('open')],['Paid',n('paid')+n('card_issued')],['Done',n('completed')],['Refunded',n('refunded')],['Signups',d.signup_total]].map(([l,v])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join('');
  $('#held').innerHTML=d.held.length?d.held.map(h=>'<div class="hcard"><div class="why">'+esc(h.hold)+'</div><div><b>'+usd(h.total_cents)+'</b> · '+esc(h.item||'cart')+' at '+esc(h.merchant)+'</div><div class="meta">'+esc(h.requester)+' asked'+(h.payer?' · '+esc(h.payer)+' paid':'')+' · '+when(h.created_at)+(h.fingerprint?' · card '+esc(h.fingerprint):'')+(h.payer_email?' · '+esc(h.payer_email):'')+'</div><div class="row"><button class="ab go" data-act="release" data-id="'+h.id+'">Looks fine, release</button><button class="ab no" data-act="refund" data-id="'+h.id+'">Refund</button>'+(h.fingerprint?'<button class="ab" data-act="blockcard" data-v="'+esc(h.fingerprint)+'" data-id="'+h.id+'">Refund + block card</button>':'')+'</div></div>').join(''):'<p class="muted">Nothing held. 🎉</p>';
  $('#recent').innerHTML=d.recent.map(x=>'<tr><td>'+when(x.created_at)+'</td><td><span class="pill '+(x.hold&&x.status==='paid'?'hold':x.status)+'">'+(x.hold&&x.status==='paid'?'held':x.status.replace('_',' '))+'</span></td><td>'+(x.kind==='flight'?'✈️ ':'')+esc(x.item||'')+(x.items>1?' +'+(x.items-1):'')+'</td><td>'+esc(x.merchant)+'</td><td>'+esc(x.requester)+(x.agent?' <span class="muted">via '+esc(x.agent)+'</span>':'')+'</td><td>'+esc(x.payer||'')+'</td><td class="num">'+usd(x.total_cents)+'</td><td>'+esc([x.for==='self'?'for me':'',x.order,x.booking,x.risk].filter(Boolean).join(' · '))+'</td><td>'+(['paid','card_issued'].includes(x.status)?'<button class="ab no" data-act="refund" data-id="'+x.id+'">Refund</button>':'')+'</td></tr>').join('')||'<tr><td colspan="9" class="muted">No carts yet.</td></tr>';
  $('#blocks').innerHTML=d.blocks.map(b=>'<tr><td>'+esc(b.kind)+'</td><td>'+esc(b.value)+'</td><td>'+esc(b.reason||'')+'</td><td>'+when(b.at)+'</td><td><button class="ab" data-act="unblock" data-k="'+esc(b.kind)+'" data-v="'+esc(b.value)+'">Remove</button></td></tr>').join('')||'<tr><td colspan="5" class="muted">Nothing blocked.</td></tr>';
  $('#keys').innerHTML=d.keys.map(k=>'<tr><td>'+esc(k.name)+'</td><td>'+esc(k.email)+'</td><td>'+when(k.created_at)+'</td><td>'+(k.revoked?'revoked':'active')+'</td><td>'+(k.revoked?'':'<button class="ab no" data-act="revoke" data-v="'+esc(k.name)+'">Revoke</button>')+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">No self-serve keys yet.</td></tr>';
  $('#signupTotal').textContent='('+d.signup_total+')';
  $('#signups').innerHTML=d.signups.map(s=>'<tr><td>'+esc(s.email)+'</td><td>'+esc(s.kind)+'</td><td>'+when(s.at)+'</td></tr>').join('')||'<tr><td colspan="3" class="muted">No signups yet.</td></tr>';
}
const armed=new Set();
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const a=b.dataset.act;
  // Money moves take two taps: the first arms the button.
  if(['refund','blockcard','revoke'].includes(a)&&!armed.has(b)){armed.add(b);b.dataset.label=b.textContent;b.textContent='Tap again to confirm';setTimeout(()=>{armed.delete(b);if(b.isConnected)b.textContent=b.dataset.label},4000);return}
  b.disabled=true;$('#err').textContent='';
  try{
    if(a==='release')await post('/v1/admin/carts/'+b.dataset.id+'/release');
    if(a==='refund')await post('/v1/admin/carts/'+b.dataset.id+'/refund');
    if(a==='blockcard'){await post('/v1/admin/blocks',{kind:'card',value:b.dataset.v,reason:'Blocked from a held payment'});await post('/v1/admin/carts/'+b.dataset.id+'/refund')}
    if(a==='unblock')await post('/v1/admin/blocks/remove',{kind:b.dataset.k,value:b.dataset.v});
    if(a==='revoke')await post('/v1/admin/keys/'+encodeURIComponent(b.dataset.v)+'/revoke');
    await load();
  }catch(err){$('#err').textContent=err.message;b.disabled=false}
});
$('#blockForm').addEventListener('submit',async e=>{e.preventDefault();try{await post('/v1/admin/blocks',Object.fromEntries(new FormData(e.target)));e.target.reset();load()}catch(err){$('#err').textContent=err.message}});
$('#refresh').onclick=load;$('#logout').onclick=async()=>{await post('/admin/logout');location.reload()};
load().catch(err=>{$('#err').textContent=err.message});setInterval(()=>document.visibilityState==='visible'&&load().catch(()=>{}),30000);
})();</script>
</body></html>`;
}


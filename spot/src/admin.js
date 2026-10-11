// /admin: the operator's view. Held payments to release or refund, recent
// carts, block lists, API keys and signups.
//
//   SPOT_ADMIN_DOMAIN  company email domain (default thefuturebasics.com; "" turns it
//                      off): anyone signed in with a confirmed email there is let
//                      in, no token needed (staff.js). /admin/health is the dashboard.
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
import { sessionUserId } from './accounts.js';
import { isStaff, staffDomain } from './staff.js';
import { HEALTH_CSS, healthPage, healthReport } from './health.js';

const COOKIE = 'spot_admin';
const KINDS = ['card', 'email', 'ip', 'phone'];
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function registerAdmin(app, { db, spot, env, urlFor, backups, metrics, fulfiller = null, liveChecks = null }) {
  const token = env.SPOT_ADMIN_TOKEN && env.SPOT_ADMIN_TOKEN.length >= 16 ? env.SPOT_ADMIN_TOKEN : null;
  const want = token ? Buffer.from(sha(token)) : null;
  const same = (v) => {
    const got = Buffer.from(sha(v));
    return want && got.length === want.length && timingSafeEqual(got, want);
  };
  const cookieOf = (req) => (String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`)) || [])[1];

  const domain = staffDomain(env);
  const enabled = Boolean(token || domain);
  // Signed in on Spot with a confirmed company email (staff.js).
  const staff = (req) => Boolean(domain) && isStaff(db, env, sessionUserId(db, req));
  function authed(req) {
    if (staff(req)) return true;
    if (!token) return false;
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (bearer) return same(bearer.trim());
    const c = cookieOf(req);
    // The cookie holds sha256(sha256(token)): proof of sign-in, not the token.
    return Boolean(c) && c.length === 64 && timingSafeEqual(Buffer.from(c), Buffer.from(sha(sha(token))));
  }
  const guard = (req) => {
    if (!enabled) throw new CartError('Not found', 404);
    if (req.method === 'POST' && !String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
    if (!authed(req)) throw new CartError('Sign in first', 401);
  };

  app.get('/admin', async (req, reply) => {
    if (!enabled) return reply.code(404).type('text/plain').send('Not found');
    return reply.type('text/html').header('cache-control', 'no-store').send(adminPage({ origin: urlFor(req, ''), signedIn: authed(req), domain, hasToken: Boolean(token), google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }));
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
      order_state: c.fulfillment?.state || null,
      cover_cents: c.cover_cents || 0,
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
      refunded_cents: c.refunded_cents || 0,
    };
  };

  // Carts whose money needs a human: a refund stuck mid-way, a dispute, a
  // charge after a refund, an order Spot couldn't place, or a ledger that
  // doesn't add up (store charged more than the payer paid for the goods,
  // or more refunded than paid).
  const moneyChecks = () => {
    const out = [];
    for (const id of db.idsForMoneySweep().concat(db.idsByStatus(['completed', 'refunded']).slice(-500))) {
      const c = db.byId(id);
      if (!c || c.settle !== 'card' || c.kind === 'flight') continue;
      const { captured, returned } = db.issuing.totals(c.id);
      const goods = c.cart_cents + (c.cushion_cents || 0) + (c.cover_cents || 0);
      const why = [];
      if (c.status === 'refunding') why.push('Refund stuck: retrying every 5 minutes');
      if (c.dispute) why.push(`Payer disputed the payment${c.dispute.reason ? ` (${c.dispute.reason})` : ''}`);
      if (c.alert?.kind === 'charged_after_refund') why.push(`Store charged ${(c.alert.amount_cents / 100).toFixed(2)} after the payer was refunded`);
      // Only while it can still be ordered: once refunded, the retry is moot.
      if (c.fulfillment?.state === 'needs_you' && ['paid', 'card_issued'].includes(c.status)) why.push(`Order needs a retry: ${c.fulfillment.reason || 'stopped'}`);
      if ((c.refunds || []).some((r) => r.state === 'failed')) why.push('A partial refund failed: retrying');
      if (captured > goods) why.push(`Store charged ${(captured / 100).toFixed(2)}, more than the ${(goods / 100).toFixed(2)} paid for the goods`);
      if ((c.refunded_cents || 0) > c.total_cents) why.push('Refunded more than was paid');
      // Dismissed by staff: hidden while it's the same problems; a new one shows it again.
      if (why.length && c.money_dismissed && why.every((w) => c.money_dismissed.why.includes(w))) continue;
      if (why.length) out.push({ ...summary(c), captured_cents: captured, returned_cents: returned, why });
    }
    return [...new Map(out.map((x) => [x.id, x])).values()].slice(0, 100);
  };

  // Open links someone said they don't know the sender of; two reports pause it.
  const reportedLinks = () =>
    db.raw
      .prepare("SELECT id FROM carts WHERE status = 'open' AND json_array_length(COALESCE(json_extract(doc, '$.reports'), '[]')) > 0 ORDER BY created_at DESC LIMIT 50")
      .all()
      .map((r) => db.byId(r.id))
      .map((c) => ({ ...summary(c), reports: c.reports.length, paused: c.reports.length >= 2, reported_at: c.reports.at(-1).at }));

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
      merchants: db.merchants?.list() || [],
      signups: signups.slice(0, 300),
      signup_total: signups.length,
      backups: backups?.status() || null,
      money: moneyChecks(),
      reported: reportedLinks(),
    };
  });

  // Health: stuck money, services, traffic, funnel, AI cost, revenue (health.js).
  app.get('/admin/health', async (req, reply) => {
    if (!enabled) return reply.code(404).type('text/plain').send('Not found');
    if (!authed(req)) return reply.redirect('/admin', 302);
    const head = siteHead({ title: 'Spot health', desc: 'Spot health', origin: urlFor(req, ''), path: '/admin/health', extraCss: CSS + HEALTH_CSS }).replace('<head>', '<head><meta name="robots" content="noindex">');
    return reply.type('text/html').header('cache-control', 'no-store').send(healthPage({ head }));
  });
  app.get('/v1/admin/health', async (req, reply) => {
    guard(req);
    reply.header('cache-control', 'no-store');
    const report = healthReport({ db, env, metrics, backups, moneyChecks, summary });
    const live = liveChecks?.last() || null;
    // A failing live check needs a look too (only if it's from the last day).
    const liveFailing = live && Date.now() - live.at < 86_400_000 ? live.failing : 0;
    return { ...report, live, attention: report.attention + liveFailing, status: report.attention + liveFailing ? 'attention' : 'ok' };
  });
  // Runs every live check now (at most every 30 seconds).
  let lastRun = 0;
  app.post('/v1/admin/health/check', async (req, reply) => {
    guard(req);
    if (!liveChecks) throw new CartError('Live checks aren’t available', 404);
    if (Date.now() - lastRun < 30_000) throw new CartError('Checks just ran. Try again in a few seconds.', 429);
    lastRun = Date.now();
    reply.header('cache-control', 'no-store');
    return liveChecks.run();
  });

  app.post('/v1/admin/carts/:id/release', async (req) => {
    guard(req);
    return { cart: summary(await spot.release(req.params.id)) };
  });
  app.post('/v1/admin/carts/:id/clear-reports', async (req) => {
    guard(req);
    return { cart: summary(spot.clearReports(req.params.id)) };
  });
  // Spot pays a store total that came in over the card (e.g. shipping above
  // the estimate), then retries the order to the address already on it.
  app.post('/v1/admin/carts/:id/cover', async (req) => {
    guard(req);
    const next = await spot.coverDifference(req.params.id, Number(req.body?.cents), { by: 'admin' });
    let retried = false;
    if (fulfiller && next.fulfillment?.state === 'needs_you' && next.requester?.shipping) {
      await fulfiller.start(next, next.requester.shipping).then(() => (retried = true)).catch(() => {});
    }
    return { cart: summary(spot.byId(next.id)), retried };
  });
  // Hide a card from "Money to check". Nothing moves: Spot's own retries and
  // deadline refunds still run, and a new problem brings it back.
  app.post('/v1/admin/carts/:id/dismiss', async (req) => {
    guard(req);
    const why = (moneyChecks().find((m) => m.id === req.params.id) || {}).why;
    if (!why) throw new CartError('Nothing to dismiss on this cart', 409);
    const next = spot.patch(req.params.id, (c) => ({ ...c, money_dismissed: { at: Date.now(), why } }), 'money_dismissed');
    return { cart: summary(next) };
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

  app.post('/v1/admin/backups/run', async (req) => {
    guard(req);
    if (!backups) throw new CartError('Backups aren’t set up', 404);
    const last = await backups.run('manual');
    if (!last.ok) throw new CartError(`Backup failed: ${last.error}`, 500);
    return { backups: backups.status() };
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
/* Phones: each row becomes a card, each cell "Label  value". */
@media (max-width:640px){
.tw{overflow:visible;border:0;background:none}
.tw thead{display:none}
.tw table,.tw tbody,.tw tr,.tw td{display:block;width:auto;min-width:0;box-sizing:border-box}
.tw table{width:100%;table-layout:auto}
.tw tr{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 14px;margin:0 0 10px}
.tw td{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 0;white-space:normal;text-align:right;overflow-wrap:anywhere}
.tw td::before{content:attr(data-label);flex:none;text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.tw td:not([data-label])::before,.tw td[data-label=""]::before{content:none}
.tw td:empty{display:none}
.tw td.num{text-align:right}
.tw td:last-child{border-bottom:0}
}
.pill{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:99px;background:var(--line)}
.pill.completed,.pill.card_issued{background:color-mix(in srgb,var(--ok) 18%,transparent);color:var(--ok)}
.pill.paid{background:color-mix(in srgb,var(--spot2) 30%,transparent)}
.pill.refunded,.pill.canceled,.pill.expired{color:var(--muted)}
.pill.hold{background:var(--spot);color:#fff}
form.inline{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
form.inline input,form.inline select{font:inherit;font-size:16px;padding:9px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);min-width:0;flex:1 1 140px}
.muted{color:var(--muted)}.err{color:var(--spot);font-weight:600;min-height:1.2em}
.login{max-width:420px;margin:60px auto;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:26px}
.login input{width:100%;font:inherit;padding:12px 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);margin:14px 0}
`;

function adminPage({ origin, signedIn, domain, hasToken = true, google = false }) {
  const head = siteHead({ title: 'Spot admin', desc: 'Spot operator view', origin, path: '/admin', extraCss: CSS }).replace('<head>', '<head><meta name="robots" content="noindex">');
  if (!signedIn) {
    return `${head}
<main class="wrap"><form class="login" id="login"><h1 style="font-size:32px">Spot admin</h1>
${domain && google ? `<a class="ab go" style="display:block;text-align:center;text-decoration:none;margin-top:14px" href="/auth/google/start?hd=${encodeURIComponent(domain)}&next=/admin">Sign in with Google (@${esc(domain)})</a><p class="muted" style="margin:8px 0 0;font-size:14px">Your company Google account. <a href="/signin?next=/admin">Use an email code instead</a>.</p>` : domain ? `<a class="ab go" style="display:block;text-align:center;text-decoration:none;margin-top:14px" href="/signin?next=/admin">Sign in with your @${esc(domain)} email</a><p class="muted" style="margin:8px 0 0;font-size:14px">Use a sign-in code or Google. Already signed in? Sign out and back in once with your company email.</p>` : ''}
${hasToken ? `<p class="muted" style="margin:${domain ? '18px' : '6px'} 0 0">${domain ? 'Or paste' : 'Paste'} the admin token from Railway (SPOT_ADMIN_TOKEN).</p>
<input type="password" name="token" id="token" autocomplete="current-password" required aria-label="Admin token"><button class="ab go" style="width:100%">Sign in</button>` : ''}<p class="err" id="err"></p></form></main>
<script>(()=>{${SITE_JS}
document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:document.getElementById('token').value})});if(r.ok)location.reload();else document.getElementById('err').textContent=(await r.json().catch(()=>({}))).error||'Try again'})})();</script>
</body></html>`;
  }
  return `${head}
<main class="adm"><div class="wrap">
  <div class="bar"><h1>Spot admin</h1><div class="row"><a class="ab" href="/admin/health" style="text-decoration:none">Health</a><button class="ab" id="refresh">Refresh</button><button class="ab" id="logout">Sign out</button></div></div>
  <div class="stats" id="stats"></div>
  <section class="panel"><h2>Needs you</h2><div class="held" id="held"><p class="muted">Loading…</p></div></section>
  <section class="panel"><h2>Money to check</h2><p class="muted" style="margin-top:0">Refunds in flight, disputes, stuck orders and anything that doesn’t add up. Spot retries refunds by itself; refund here to give back whatever’s left.</p><div class="held" id="money"></div></section>
  <section class="panel"><h2>Recent carts</h2><div class="tw"><table><thead><tr><th>When</th><th>Status</th><th>What</th><th>Store</th><th>Requester</th><th>Payer</th><th class="num">Total</th><th>Notes</th><th></th></tr></thead><tbody id="recent"></tbody></table></div></section>
  <section class="panel"><h2>Block list</h2>
    <form class="inline" id="blockForm"><select name="kind" aria-label="What to block"><option value="card">Card fingerprint</option><option value="email">Payer email</option><option value="ip">IP address</option><option value="phone">Phone</option></select><input name="value" placeholder="Value" required aria-label="Value"><input name="reason" placeholder="Reason (optional)" aria-label="Reason"><button class="ab no">Block</button></form>
    <div class="tw"><table><thead><tr><th>Kind</th><th>Value</th><th>Reason</th><th>Since</th><th></th></tr></thead><tbody id="blocks"></tbody></table></div></section>
  <section class="panel"><h2>API keys</h2><div class="tw"><table><thead><tr><th>Name</th><th>Email</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody id="keys"></tbody></table></div></section>
  <section class="panel"><h2>Stores with the button</h2><div class="tw"><table><thead><tr><th>Store</th><th>Domain</th><th>Email</th><th>Joined</th><th>Verified</th></tr></thead><tbody id="merchants"></tbody></table></div></section>
  <section class="panel"><h2>Backups</h2><div id="backup"><p class="muted">Loading…</p></div><div class="row" style="margin-top:10px"><button class="ab go" data-act="backup">Back up now</button></div></section>
  <section class="panel"><h2>Signups <span class="muted" id="signupTotal"></span></h2><div class="tw"><table><thead><tr><th>Email</th><th>Interest</th><th>When</th></tr></thead><tbody id="signups"></tbody></table></div></section>
  <p class="err" id="err"></p>
</div></main>
<script>(()=>{${SITE_JS}
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=c=>'$'+(c/100).toFixed(2),when=t=>new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const post=async(u,b)=>{const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b||{})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Failed');return d};
// Each cell carries its column name, for the phone layout.
const label=()=>document.querySelectorAll('.tw table').forEach(t=>{const hs=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());t.querySelectorAll('tbody tr').forEach(tr=>[...tr.children].forEach((td,i)=>{if(!td.hasAttribute('colspan')&&!td.dataset.label)td.dataset.label=hs[i]||''}))});
new MutationObserver(label).observe(document.body,{childList:true,subtree:true});
async function load(){
  const r=await fetch('/v1/admin/overview');if(r.status===401)return location.reload();const d=await r.json();
  const c=d.counts,n=k=>c[k]||0;
  $('#stats').innerHTML=[['Needs you',d.held.length+(d.reported||[]).length],['Open',n('open')],['Paid',n('paid')+n('card_issued')],['Done',n('completed')],['Refunded',n('refunded')],['Signups',d.signup_total]].map(([l,v])=>'<div class="stat"><b>'+v+'</b><span>'+l+'</span></div>').join('');
  $('#money').innerHTML=d.money.length?d.money.map(m=>'<div class="hcard"><div class="why">'+m.why.map(esc).join('<br>')+'</div><div><b>'+usd(m.total_cents)+'</b> paid · '+esc(m.item||'cart')+' at '+esc(m.merchant)+' · <span class="pill '+esc(m.status)+'">'+esc(m.status)+'</span></div><div class="meta">store charged '+usd(m.captured_cents)+(m.returned_cents?' · store refunded '+usd(m.returned_cents):'')+' · refunded to payer '+usd(m.refunded_cents)+(m.payer_email?' · '+esc(m.payer_email):'')+' · '+when(m.created_at)+'</div>'+'<div class="row">'+(m.status==='card_issued'&&m.order_state==='needs_you'?'<button class="ab" data-act="cover" data-id="'+m.id+'">Spot covers the difference…</button>':'')+(['paid','card_issued','completed','refunding'].includes(m.status)&&m.refunded_cents<m.total_cents?'<button class="ab no" data-act="refund" data-id="'+m.id+'">Refund the rest</button>':'')+'<button class="ab" data-act="dismiss" data-id="'+m.id+'">Dismiss</button></div>'+'</div>').join(''):'<p class="muted">All square. ✅</p>';
  $('#held').innerHTML=d.held.length?d.held.map(h=>'<div class="hcard"><div class="why">'+esc(h.hold)+'</div><div><b>'+usd(h.total_cents)+'</b> · '+esc(h.item||'cart')+' at '+esc(h.merchant)+'</div><div class="meta">'+esc(h.requester)+' asked'+(h.payer?' · '+esc(h.payer)+' paid':'')+' · '+when(h.created_at)+(h.fingerprint?' · card '+esc(h.fingerprint):'')+(h.payer_email?' · '+esc(h.payer_email):'')+'</div><div class="row"><button class="ab go" data-act="release" data-id="'+h.id+'">Looks fine, release</button><button class="ab no" data-act="refund" data-id="'+h.id+'">Refund</button>'+(h.fingerprint?'<button class="ab" data-act="blockcard" data-v="'+esc(h.fingerprint)+'" data-id="'+h.id+'">Refund + block card</button>':'')+'</div></div>').join(''):'<p class="muted">Nothing held. 🎉</p>';
  const rep=d.reported||[];if(rep.length)$('#held').insertAdjacentHTML(d.held.length?'beforeend':'afterbegin',rep.map(x=>'<div class="hcard"><div class="why">'+(x.paused?'Paused: ':'')+'Reported by '+x.reports+' '+(x.reports===1?'person':'people')+' who got the link</div><div><b>'+usd(x.total_cents)+'</b> · '+esc(x.item||'cart')+' at '+esc(x.merchant)+'</div><div class="meta">'+esc(x.requester)+' asked · '+when(x.created_at)+' · last report '+when(x.reported_at)+'</div><div class="row"><button class="ab go" data-act="clearreports" data-id="'+x.id+'">Looks fine'+(x.paused?', unpause':'')+'</button></div></div>').join(''));
  if(rep.length&&!d.held.length){const m=$('#held').querySelector('p.muted');if(m)m.remove()}
  $('#recent').innerHTML=d.recent.map(x=>'<tr><td>'+when(x.created_at)+'</td><td><span class="pill '+(x.hold&&x.status==='paid'?'hold':x.status)+'">'+(x.hold&&x.status==='paid'?'held':x.status.replace('_',' '))+'</span></td><td>'+(x.kind==='flight'?'✈️ ':'')+esc(x.item||'')+(x.items>1?' +'+(x.items-1):'')+'</td><td>'+esc(x.merchant)+'</td><td>'+esc(x.requester)+(x.agent?' <span class="muted">via '+esc(x.agent)+'</span>':'')+'</td><td>'+esc(x.payer||'')+'</td><td class="num">'+usd(x.total_cents)+'</td><td>'+esc([x.for==='self'?'for me':'',x.order,x.booking,x.risk].filter(Boolean).join(' · '))+'</td><td>'+(['paid','card_issued','refunding'].includes(x.status)?'<button class="ab no" data-act="refund" data-id="'+x.id+'">Refund</button>':'')+'</td></tr>').join('')||'<tr><td colspan="9" class="muted">No carts yet.</td></tr>';
  $('#blocks').innerHTML=d.blocks.map(b=>'<tr><td>'+esc(b.kind)+'</td><td>'+esc(b.value)+'</td><td>'+esc(b.reason||'')+'</td><td>'+when(b.at)+'</td><td><button class="ab" data-act="unblock" data-k="'+esc(b.kind)+'" data-v="'+esc(b.value)+'">Remove</button></td></tr>').join('')||'<tr><td colspan="5" class="muted">Nothing blocked.</td></tr>';
  $('#merchants').innerHTML=(d.merchants||[]).map(m=>'<tr><td>'+esc(m.name)+'</td><td>'+esc(m.domain)+'</td><td>'+esc(m.email)+'</td><td>'+when(m.created_at)+'</td><td>'+(m.verified_at?'✓ '+when(m.verified_at):'not yet')+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">No stores yet.</td></tr>';
  $('#keys').innerHTML=d.keys.map(k=>'<tr><td>'+esc(k.name)+'</td><td>'+esc(k.email)+'</td><td>'+when(k.created_at)+'</td><td>'+(k.revoked?'revoked':'active')+'</td><td>'+(k.revoked?'':'<button class="ab no" data-act="revoke" data-v="'+esc(k.name)+'">Revoke</button>')+'</td></tr>').join('')||'<tr><td colspan="5" class="muted">No self-serve keys yet.</td></tr>';
  const bk=d.backups,ok=bk&&bk.last_ok,last=bk&&bk.last,ago=t=>{const h=(Date.now()-t)/36e5;return h<1?Math.max(1,Math.round(h*60))+' min ago':h<48?Math.round(h)+' h ago':Math.round(h/24)+' days ago'},kb=b=>b>1e6?(b/1e6).toFixed(1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
  $('#backup').innerHTML=!bk?'<p class="muted">Not available.</p>':(ok?'<p><b>Last good backup: '+ago(ok.at)+'</b> <span class="muted">('+when(ok.at)+')</span><br><span class="muted">'+esc(ok.name)+' · '+kb(ok.bytes)+' · '+ok.carts+' carts, '+ok.users+' accounts · '+(ok.remote?'copied to the bucket ('+ok.remote.kept+' kept there)':'on the volume only')+'</span></p>':'<p><b>No backup yet.</b></p>')
    +(last&&!last.ok?'<p class="err">Last try failed '+ago(last.at)+': '+esc(last.error)+'. Retrying hourly.</p>':'')
    +(bk.bucket?'':'<p class="muted">⚠️ No bucket set, so backups stay on the same volume as the database. Add a Railway bucket (see docs/go-live.md).</p>')
    +'<p class="muted">Runs daily at '+String(bk.hour_utc).padStart(2,'0')+':00 UTC. On the volume: '+(bk.local.length?esc(bk.local.join(', ')):'none')+'.</p>';
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
    if(a==='clearreports')await post('/v1/admin/carts/'+b.dataset.id+'/clear-reports');
    if(a==='refund')await post('/v1/admin/carts/'+b.dataset.id+'/refund');
    if(a==='dismiss')await post('/v1/admin/carts/'+b.dataset.id+'/dismiss');
    if(a==='cover'){const v=prompt('How much should Spot cover on this order, in dollars? (up to $25; the payer isn’t charged)');if(!v){b.disabled=false;return}const r=await post('/v1/admin/carts/'+b.dataset.id+'/cover',{cents:Math.round(parseFloat(v.replace(/[^0-9.]/g,''))*100)});alert(r.retried?'Covered. Spot is retrying the order now.':'Covered. Tap Try again on the order to retry.')}
    if(a==='blockcard'){await post('/v1/admin/blocks',{kind:'card',value:b.dataset.v,reason:'Blocked from a held payment'});await post('/v1/admin/carts/'+b.dataset.id+'/refund')}
    if(a==='unblock')await post('/v1/admin/blocks/remove',{kind:b.dataset.k,value:b.dataset.v});
    if(a==='backup'){b.textContent='Backing up…';try{await post('/v1/admin/backups/run')}finally{b.textContent='Back up now';b.disabled=false}}
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


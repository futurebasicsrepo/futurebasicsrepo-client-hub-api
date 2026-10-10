// /admin/health: is Spot working, is anyone's money stuck, what does it cost
// to run, and what has it earned. Read-only; built from the database and the
// counters in metrics.js.
//
// Costs and some revenue are estimates. Each estimate says so and names the
// variable that tunes it (all in cents or basis points):
//   SPOT_COST_SMS_CENTS        per text segment          (default 1.1¢)
//   SPOT_COST_EMAIL_CENTS      per email                 (default 0.04¢)
//   SPOT_STRIPE_FEE_BPS / _FIXED_CENTS  card processing  (default 2.9% + 30¢)
//   SPOT_COST_ISSUING_CARD_CENTS  per virtual card       (default 10¢)
//   SPOT_INTERCHANGE_BPS       Stripe's interchange share on Spot-card spend (default 0: set it from your Stripe agreement)
//   SPOT_AFFILIATE_BPS         commission on affiliate orders (default 300 = 3%)
const DAY = 86_400_000;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

// Claude prices per million tokens (Anthropic first-party rates, Oct 2026).
// Cache reads are 0.1× input; 5-minute cache writes 1.25× input.
// Web search is $10 per 1,000 searches.
export const AI_PRICES = {
  'claude-fable-5-1': [10, 50],
  'claude-fable-5': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-opus-4-8': [5, 25],
  'claude-opus-4-7': [5, 25],
  'claude-opus-4-6': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-sonnet-4-6': [3, 15],
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-haiku-4-5': [1, 5],
};
const WEB_SEARCH_CENTS = 1; // $10 / 1,000

// "claude-opus-5-20261001" or "claude-opus-5" → the price row for it.
function priceFor(model) {
  const m = String(model);
  const key = Object.keys(AI_PRICES).sort((a, b) => b.length - a.length).find((k) => m === k || m.startsWith(`${k}-`));
  return key ? { key, rates: AI_PRICES[key] } : null;
}

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? n : d;
};

// Which outside services Spot is set up to use: names of settings only, never values.
function servicesConfig(env) {
  const has = (...keys) => keys.every((k) => Boolean(env[k]));
  return [
    { name: 'stripe', label: 'Stripe payments', configured: has('STRIPE_SECRET_KEY'), why: 'STRIPE_SECRET_KEY' },
    { name: 'stripe_webhook', label: 'Stripe webhooks', configured: has('STRIPE_WEBHOOK_SECRET'), why: 'STRIPE_WEBHOOK_SECRET' },
    { name: 'issuing', label: 'Stripe Issuing (Spot cards)', configured: has('STRIPE_ISSUING_CARDHOLDER'), why: 'STRIPE_ISSUING_CARDHOLDER' },
    { name: 'shopify_token', label: 'Shopify agent token', configured: has('SHOPIFY_CATALOG_CLIENT_ID', 'SHOPIFY_CATALOG_CLIENT_SECRET'), why: 'SHOPIFY_CATALOG_CLIENT_ID / _SECRET' },
    { name: 'anthropic', label: 'Claude (lookups, screenshots)', configured: has('ANTHROPIC_API_KEY') || has('ANTHROPIC_AUTH_TOKEN'), why: 'ANTHROPIC_API_KEY' },
    { name: 'resend', label: 'Email (Resend)', configured: has('RESEND_API_KEY'), why: 'RESEND_API_KEY' },
    { name: 'twilio', label: 'Texts (Twilio)', configured: has('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'), why: 'TWILIO_ACCOUNT_SID / _AUTH_TOKEN / _FROM' },
    { name: 'duffel', label: 'Flights (Duffel)', configured: has('DUFFEL_ACCESS_TOKEN'), why: 'DUFFEL_ACCESS_TOKEN' },
  ];
}

export function healthReport({ db, env = process.env, metrics, backups, moneyChecks, summary, now = Date.now() }) {
  const raw = db.raw;
  const days = 30;
  const from = now - days * DAY;
  const j = (path) => `json_extract(doc, '$.${path}')`;

  // ─── Money that's stuck ──────────────────────────────────────────────
  const lastIssueError = raw.prepare("SELECT detail FROM cart_events WHERE cart_id = ? AND kind = 'issue_failed' ORDER BY id DESC LIMIT 1");
  const stuck = [];
  for (const row of raw.prepare(`SELECT id FROM carts WHERE status = 'paid' AND COALESCE(${j('kind')}, 'goods') != 'flight' AND ${j('hold')} IS NULL`).all()) {
    const c = db.byId(row.id);
    if (!c || now - (c.paid_at || c.created_at) < 10 * 60_000) continue;
    const err = lastIssueError.get(c.id)?.detail;
    stuck.push({ ...summary(c), why: [`Paid ${ago(now - (c.paid_at || c.created_at))} ago, but Spot's card wasn't issued${err ? `: ${JSON.parse(err).message}` : ''}`] });
  }
  for (const row of raw.prepare(`SELECT id FROM carts WHERE status = 'card_issued'`).all()) {
    const c = db.byId(row.id);
    if (!c || ['placed', 'working', 'starting', 'awaiting_confirm'].includes(c.fulfillment?.state)) continue;
    if (now - (c.paid_at || c.created_at) < 2 * 3600_000) continue;
    stuck.push({ ...summary(c), why: [`Card issued ${ago(now - (c.paid_at || c.created_at))} ago, not ordered yet${c.fulfillment?.reason ? `: ${c.fulfillment.reason}` : ''}`] });
  }
  const held = raw.prepare(`SELECT id FROM carts WHERE status = 'paid' AND ${j('hold')} IS NOT NULL`).all().map((r) => summary(db.byId(r.id)));
  const autopayFailed = raw
    .prepare("SELECT agent, detail, at FROM agent_events WHERE kind = 'autopay_failed' AND at >= ? ORDER BY id DESC LIMIT 20")
    .all(now - 7 * DAY)
    .map((r) => ({ agent: r.agent.replace(/^key:/, ''), at: r.at, ...(r.detail ? JSON.parse(r.detail) : {}) }));
  const money = moneyChecks();

  // ─── Services ────────────────────────────────────────────────────────
  const seen = metrics?.services() || {};
  const services = servicesConfig(env).map((s) => {
    const h = seen[s.name] || {};
    const failing = Boolean(h.fail_at && (!h.ok_at || h.fail_at > h.ok_at));
    return { ...s, ok_at: h.ok_at || null, fail_at: h.fail_at || null, error: failing ? h.error : null, ok: h.ok || 0, fail: h.fail || 0, state: !s.configured ? 'off' : failing ? 'failing' : h.ok_at ? 'ok' : 'unused' };
  });
  const lastBackup = backups?.status?.()?.last || null;
  const backup = lastBackup ? { ok: lastBackup.ok !== false, last_at: lastBackup.at || null, error: lastBackup.error || null } : null;

  // ─── Traffic, funnel, usage: one row per day ────────────────────────
  const daily = metrics?.daily(days) || {};
  const series = [];
  for (let i = days - 1; i >= 0; i--) series.push(dayOf(now - i * DAY));
  const sumKey = (pred) => Object.values(daily).reduce((t, d) => t + Object.entries(d).reduce((s, [k, n]) => s + (pred(k) ? n : 0), 0), 0);

  const funnelRows = raw
    .prepare(
      `SELECT date(created_at / 1000, 'unixepoch') AS day,
              COUNT(*) AS made,
              SUM(CASE WHEN ${j('paid_at')} IS NOT NULL THEN 1 ELSE 0 END) AS paid,
              SUM(CASE WHEN status = 'completed' OR ${j('fulfillment.state')} = 'placed' THEN 1 ELSE 0 END) AS ordered,
              SUM(CASE WHEN ${j('agent')} IS NOT NULL THEN 1 ELSE 0 END) AS by_ai
         FROM carts WHERE created_at >= ? GROUP BY day`,
    )
    .all(from);
  const signupRows = raw.prepare("SELECT date(created_at / 1000, 'unixepoch') AS day, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY day").all(from);
  const byDay = Object.fromEntries(series.map((d) => [d, { day: d, made: 0, paid: 0, ordered: 0, by_ai: 0, signups: 0, requests: 0, errors_5xx: 0, ai_cents: 0 }]));
  for (const r of funnelRows) if (byDay[r.day]) Object.assign(byDay[r.day], { made: r.made, paid: r.paid, ordered: r.ordered, by_ai: r.by_ai });
  for (const r of signupRows) if (byDay[r.day]) byDay[r.day].signups = r.n;

  // ─── AI tokens and cost ──────────────────────────────────────────────
  const models = {};
  let unpriced = [];
  for (const [day, keys] of Object.entries(daily)) {
    for (const [k, n] of Object.entries(keys)) {
      const m = /^ai:(.+):(calls|in|out|cache_read|cache_write)$/.exec(k);
      if (!m) continue;
      const row = (models[m[1]] ||= { model: m[1], calls: 0, in: 0, out: 0, cache_read: 0, cache_write: 0, cents: 0 });
      row[m[2]] += n;
      const p = priceFor(m[1]);
      if (!p) {
        if (!unpriced.includes(m[1])) unpriced.push(m[1]);
        continue;
      }
      const [inp, outp] = p.rates; // dollars per million tokens
      const cents = { in: inp, out: outp, cache_read: inp * 0.1, cache_write: inp * 1.25 }[m[2]];
      if (cents != null) {
        const c = (n * cents * 100) / 1e6;
        row.cents += c;
        if (byDay[day]) byDay[day].ai_cents += c;
      }
    }
    const searches = keys['ai:web_search'] || 0;
    if (byDay[day]) byDay[day].ai_cents += searches * WEB_SEARCH_CENTS;
    if (byDay[day]) Object.assign(byDay[day], { requests: keys['req:total'] || 0, errors_5xx: keys['req:5xx'] || 0 });
  }
  const webSearches = sumKey((k) => k === 'ai:web_search');
  const aiCents = Object.values(models).reduce((t, m) => t + m.cents, 0) + webSearches * WEB_SEARCH_CENTS;

  // ─── Other running costs (estimates) ────────────────────────────────
  const smsSegments = sumKey((k) => k === 'sms:sent');
  const emails = sumKey((k) => k === 'email:sent');
  const cardPayments = raw.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE at >= ?').get(from);
  const cardsIssued = raw.prepare(`SELECT COUNT(*) AS n FROM carts WHERE card_ref IS NOT NULL AND created_at >= ?`).get(from).n;
  const costs = {
    ai_cents: aiCents,
    sms_cents: smsSegments * num(env.SPOT_COST_SMS_CENTS, 1.1),
    email_cents: emails * num(env.SPOT_COST_EMAIL_CENTS, 0.04),
    stripe_cents: (cardPayments.cents * num(env.SPOT_STRIPE_FEE_BPS, 290)) / 10000 + cardPayments.n * num(env.SPOT_STRIPE_FEE_FIXED_CENTS, 30),
    issuing_cents: cardsIssued * num(env.SPOT_COST_ISSUING_CARD_CENTS, 10),
  };
  costs.total_cents = Object.values(costs).reduce((a, b) => a + b, 0);

  // ─── What Spot earned ───────────────────────────────────────────────
  // Our fee (the $2): kept on card asks that went through and weren't refunded.
  const fees = raw
    .prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(${j('fee_keep_cents')}), 0) AS cents FROM carts WHERE status IN ('card_issued', 'completed') AND created_at >= ?`)
    .get(from);
  const feesAll = raw.prepare(`SELECT COALESCE(SUM(${j('fee_keep_cents')}), 0) AS cents FROM carts WHERE status IN ('card_issued', 'completed')`).get().cents;
  // Stripe's interchange share on what Spot's cards spent at stores.
  const spend = raw.prepare("SELECT COALESCE(SUM(CASE WHEN type = 'capture' THEN amount_cents ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents ELSE 0 END), 0) AS cents FROM issuing_txns WHERE at >= ?").get(from).cents;
  const interchangeBps = num(env.SPOT_INTERCHANGE_BPS, 0);
  // Affiliate: links people went through, and orders that came of them.
  const affClicks = raw.prepare("SELECT detail FROM cart_events WHERE kind = 'affiliate_link' AND at >= ?").all(from);
  const byNetwork = {};
  for (const e of affClicks) {
    const via = (e.detail && JSON.parse(e.detail).via) || 'unknown';
    byNetwork[via] = (byNetwork[via] || 0) + 1;
  }
  const affOrders = raw
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(${j('cart_cents')}), 0) AS cents FROM carts
        WHERE created_at >= ? AND (status = 'completed' OR ${j('fulfillment.state')} = 'placed')
          AND id IN (SELECT cart_id FROM cart_events WHERE kind = 'affiliate_link')`,
    )
    .get(from);
  const affBps = num(env.SPOT_AFFILIATE_BPS, 300);
  const revenue = {
    fee: { cents: fees.cents, asks: fees.n, all_time_cents: feesAll },
    interchange: { spend_cents: spend, bps: interchangeBps, cents: (spend * interchangeBps) / 10000, estimate: true, set: interchangeBps ? null : 'SPOT_INTERCHANGE_BPS' },
    affiliate: { clicks: affClicks.length, by_network: byNetwork, orders: affOrders.n, order_cents: affOrders.cents, bps: affBps, cents: (affOrders.cents * affBps) / 10000, estimate: true },
  };
  revenue.total_cents = revenue.fee.cents + revenue.interchange.cents + revenue.affiliate.cents;

  const timings = metrics?.timings() || { n: 0, slow: [], errors: [] };
  const errorsByRoute = {};
  for (const keys of Object.values(daily)) for (const [k, n] of Object.entries(keys)) if (k.startsWith('req:5xx:')) errorsByRoute[k.slice(8)] = (errorsByRoute[k.slice(8)] || 0) + n;

  const totals = {
    requests: sumKey((k) => k === 'req:total'),
    errors_4xx: sumKey((k) => k === 'req:4xx'),
    errors_5xx: sumKey((k) => k === 'req:5xx'),
  };
  const attention = stuck.length + money.length + held.length + services.filter((s) => s.state === 'failing').length + (backup?.ok === false ? 1 : 0);

  return {
    at: now,
    window_days: days,
    status: attention ? 'attention' : 'ok',
    attention,
    stuck,
    money,
    held,
    autopay_failed: autopayFailed,
    services,
    backup,
    traffic: { ...totals, error_rate: totals.requests ? totals.errors_5xx / totals.requests : 0, timings, errors_by_route: Object.entries(errorsByRoute).sort((a, b) => b[1] - a[1]).slice(0, 8) },
    funnel: series.map((d) => byDay[d]),
    ai: { models: Object.values(models).sort((a, b) => b.cents - a.cents), web_searches: webSearches, cents: aiCents, unpriced },
    usage: { sms_segments: smsSegments, emails, card_payments: cardPayments.n, cards_issued: cardsIssued },
    costs,
    revenue,
    net_cents: revenue.total_cents - costs.total_cents,
  };
}

function ago(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

// ─── The page ──────────────────────────────────────────────────────────────
// Server sends the shell; the script fetches /v1/admin/health and draws it.
// Charts: one series each, in Spot orange, with a hover value per bar and a
// table under every chart. Status always pairs an icon with a word.
export const HEALTH_CSS = `
body{background:var(--bg)}
:root{--bar:#ff5a36;--good:#2f7d4f;--warn:#a86400;--bad:#c2321b}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bar:#e8603c;--good:#5fbf86;--warn:#e0a03a;--bad:#ff7a66}}
:root[data-theme=dark]{--bar:#e8603c;--good:#5fbf86;--warn:#e0a03a;--bad:#ff7a66}
.hl{padding:30px 0 80px}
.hl h1{font-size:clamp(30px,5vw,44px)}
.hl h2{font-size:21px;letter-spacing:-.02em;margin:34px 0 12px}
.hl .bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.hl .sub{color:var(--muted);font-size:14px;margin:4px 0 0}
.banner{margin:18px 0 0;padding:14px 16px;border-radius:16px;border:1.5px solid var(--line);background:var(--card);font-weight:700;display:flex;gap:10px;align-items:center}
.banner.ok{border-color:var(--good)}.banner.attention{border-color:var(--bad)}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:16px 0 0}
.tile{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.tile b{display:block;font-size:26px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile span{font-size:13px;color:var(--muted)}.tile small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.list{display:grid;gap:8px}
.row{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;display:grid;gap:4px;font-size:14px}
.row .why{font-weight:700}.row small{color:var(--muted)}
.svc{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}
.st{font-weight:700;font-size:13px;white-space:nowrap}
.st.ok{color:var(--good)}.st.failing{color:var(--bad)}.st.unused,.st.off{color:var(--muted)}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.chart{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;position:relative}
.chart h3{font-size:14px;margin:0;color:var(--ink)}.chart .big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}
.chart svg{display:block;width:100%;height:64px;margin-top:8px;overflow:visible}
.chart rect.m{fill:var(--bar)}.chart rect.hit{fill:transparent;cursor:default}
.chart .base{stroke:var(--line);stroke-width:1}
.chart .axis{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-top:4px}
.tip{position:absolute;pointer-events:none;background:var(--ink);color:var(--bg);font-size:12px;padding:4px 8px;border-radius:8px;white-space:nowrap;transform:translate(-50%,-110%);opacity:0;transition:opacity .1s}
table.t{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
table.t th,table.t td{text-align:right;padding:6px 8px;border-bottom:1px solid var(--line)}
table.t th:first-child,table.t td:first-child{text-align:left}
table.t th{color:var(--muted);font-weight:600}
table.t.txt td:nth-child(2),table.t.txt th:nth-child(2){text-align:left;color:var(--muted)}
details.tv{margin-top:10px}details.tv summary{cursor:pointer;color:var(--muted);font-size:13px;font-weight:600}
.est{font-size:12px;color:var(--muted)}
.wrapx{overflow-x:auto}
`;

export const HEALTH_JS = `
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const usd=c=>{const v=(c||0)/100,big=Math.abs(v)>=1000;return (v<0?'−':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:big?0:2,maximumFractionDigits:big?0:2})};
const n=x=>(x||0).toLocaleString('en-US');
const ago=t=>{if(!t)return 'never';const m=Math.round((Date.now()-t)/60000);return m<1?'just now':m<90?m+' min ago':m<2880?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago'};
const ST={ok:['✓','Working'],failing:['✕','Failing'],unused:['○','No calls yet'],off:['–','Not set up']};
function bars(id,title,rows,key,fmt){
  const vals=rows.map(r=>r[key]||0),max=Math.max(1,...vals),w=100/vals.length,total=vals.reduce((a,b)=>a+b,0);
  const marks=vals.map((v,i)=>{const h=v?Math.max(2,v/max*60):0;return (h?'<rect class="m" x="'+(i*w+w*0.12).toFixed(2)+'" y="'+(62-h).toFixed(2)+'" width="'+(w*0.76).toFixed(2)+'" height="'+h.toFixed(2)+'" rx="1.2"/>':'')+'<rect class="hit" data-i="'+i+'" x="'+(i*w).toFixed(2)+'" y="0" width="'+w.toFixed(2)+'" height="64"/>'}).join('');
  return '<div class="chart" id="'+id+'"><h3>'+esc(title)+'</h3><div class="big">'+fmt(total)+'</div><svg viewBox="0 0 100 64" preserveAspectRatio="none" role="img" aria-label="'+esc(title)+' per day, last '+rows.length+' days">'+marks+'<line class="base" x1="0" x2="100" y1="62.5" y2="62.5"/></svg><div class="axis"><span>'+rows[0].day.slice(5)+'</span><span>today</span></div><div class="tip"></div></div>';
}
function wireTips(rows,specs){for(const [id,key,fmt] of specs){const el=document.getElementById(id);if(!el)continue;const tip=el.querySelector('.tip'),svg=el.querySelector('svg');
  svg.addEventListener('mousemove',e=>{const r=e.target.closest('rect.hit');if(!r){tip.style.opacity=0;return}const i=+r.dataset.i,b=svg.getBoundingClientRect(),pb=el.getBoundingClientRect();tip.textContent=rows[i].day+': '+fmt(rows[i][key]||0);tip.style.left=(b.left-pb.left+(i+.5)*b.width/rows.length)+'px';tip.style.top=(b.top-pb.top)+'px';tip.style.opacity=1});
  svg.addEventListener('mouseleave',()=>{tip.style.opacity=0})}}
const cartRow=c=>'<div class="row"><div class="why">'+c.why.map(esc).join(' · ')+'</div><div>'+esc(c.item||'Cart')+' · '+esc(c.merchant||'')+' · '+usd(c.total_cents)+' <small>· '+esc(c.requester||'')+(c.payer?' → '+esc(c.payer):'')+' · '+esc(c.token)+'</small></div></div>';
async function load(){
  const r=await fetch('/v1/admin/health');if(r.status===401){location.href='/admin';return}
  const h=await r.json();
  $('#when').textContent='Updated '+new Date(h.at).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · last '+h.window_days+' days';
  $('#banner').className='banner '+h.status;
  $('#banner').innerHTML=h.status==='ok'?'<span aria-hidden="true">✓</span> All good: no stuck money, no failing services.':'<span aria-hidden="true">⚠</span> '+h.attention+' thing'+(h.attention===1?'':'s')+' need'+(h.attention===1?'s':'')+' a look.';
  const c=h.costs,rv=h.revenue;
  $('#tiles').innerHTML=[
    [usd(rv.total_cents),'Earned',"Spot's $2 fee"+(rv.affiliate.cents?' + affiliate (est.)':'')+(rv.interchange.cents?' + interchange (est.)':'')],
    [usd(c.total_cents),'Costs (est.)','AI, Stripe, texts, email, cards'],
    [usd(h.net_cents),'Net (est.)','earned minus costs'],
    [n(h.funnel.reduce((a,d)=>a+d.ordered,0)),'Orders placed',n(h.funnel.reduce((a,d)=>a+d.made,0))+' Spots made'],
    [usd(h.ai.cents),'Claude cost',n(h.ai.models.reduce((a,m)=>a+m.in+m.out+m.cache_read+m.cache_write,0))+' tokens'],
    [(h.traffic.error_rate*100).toFixed(2)+'%','Server errors',n(h.traffic.errors_5xx)+' of '+n(h.traffic.requests)+' requests'],
  ].map(([b,s,sm])=>'<div class="tile"><b>'+b+'</b><span>'+s+'</span><small>'+sm+'</small></div>').join('');
  const stuck=[...h.stuck,...h.money];
  $('#stuck').innerHTML=stuck.length?stuck.map(cartRow).join(''):'<div class="row"><small>Nothing stuck. Every paid Spot has its card and order moving.</small></div>';
  $('#held').innerHTML=h.held.length?h.held.map(x=>cartRow({...x,why:['Held by risk checks: '+(x.hold||'review')+' (release or refund in /admin)']})).join(''):'';
  $('#autopay').innerHTML=h.autopay_failed.length?h.autopay_failed.map(a=>'<div class="row"><div class="why">Auto-pay fell back to a tap</div><div>'+esc(a.merchant||'')+' · '+usd(a.cents)+' · '+esc(a.reason||'')+' <small>· '+esc(a.agent)+' · '+ago(a.at)+'</small></div></div>').join(''):'<div class="row"><small>No auto-pay fallbacks this week.</small></div>';
  $('#svcs').innerHTML=h.services.map(s=>{const [ic,word]=ST[s.state];return '<div class="row svc"><span class="st '+s.state+'" aria-hidden="true">'+ic+'</span><span><b>'+esc(s.label)+'</b><br><small>'+(s.state==='off'?'Set '+esc(s.why)+' in Railway':'Last worked '+ago(s.ok_at)+(s.fail?' · '+n(s.fail)+' failure'+(s.fail===1?'':'s'):'')+(s.error?' · '+esc(s.error):''))+'</small></span><span class="st '+s.state+'">'+word+'</span></div>'}).join('')
    +(h.backup?'<div class="row svc"><span class="st '+(h.backup.ok===false?'failing':'ok')+'" aria-hidden="true">'+(h.backup.ok===false?'✕':'✓')+'</span><span><b>Database backups</b><br><small>'+(h.backup.last_at?'Last '+ago(h.backup.last_at):'None yet')+(h.backup.error?' · '+esc(h.backup.error):'')+'</small></span><span class="st '+(h.backup.ok===false?'failing':'ok')+'">'+(h.backup.ok===false?'Failing':'Working')+'</span></div>':'');
  const F=h.funnel;
  $('#funnel').innerHTML=bars('cMade','Spots made',F,'made',n)+bars('cPaid','Paid',F,'paid',n)+bars('cOrd','Ordered',F,'ordered',n)+bars('cAi','Made by an AI',F,'by_ai',n)+bars('cSign','New accounts',F,'signups',n);
  $('#trafficCharts').innerHTML=bars('cReq','Requests',F,'requests',n)+bars('cErr','Server errors (5xx)',F,'errors_5xx',n)+bars('cAiC','Claude cost',F,'ai_cents',usd);
  wireTips(F,[['cMade','made',n],['cPaid','paid',n],['cOrd','ordered',n],['cAi','by_ai',n],['cSign','signups',n],['cReq','requests',n],['cErr','errors_5xx',n],['cAiC','ai_cents',usd]]);
  $('#funnelTable').innerHTML='<table class="t"><thead><tr><th>Day</th><th>Made</th><th>Paid</th><th>Ordered</th><th>By AI</th><th>Accounts</th><th>Requests</th><th>5xx</th><th>Claude</th></tr></thead><tbody>'+F.slice().reverse().map(d=>'<tr><td>'+d.day+'</td><td>'+n(d.made)+'</td><td>'+n(d.paid)+'</td><td>'+n(d.ordered)+'</td><td>'+n(d.by_ai)+'</td><td>'+n(d.signups)+'</td><td>'+n(d.requests)+'</td><td>'+n(d.errors_5xx)+'</td><td>'+usd(d.ai_cents)+'</td></tr>').join('')+'</tbody></table>';
  const t=h.traffic.timings;
  $('#timing').innerHTML='<div class="tiles"><div class="tile"><b>'+(t.p50_ms??'–')+' ms</b><span>Typical response</span><small>median, since restart</small></div><div class="tile"><b>'+(t.p95_ms??'–')+' ms</b><span>Slow responses</span><small>95th percentile</small></div><div class="tile"><b>'+n(h.traffic.errors_4xx)+'</b><span>Client errors (4xx)</span><small>bad links, sign-in needed</small></div></div>'
    +(t.slow.length?'<details class="tv"><summary>Slowest routes</summary><table class="t"><thead><tr><th>Route</th><th>Requests</th><th>95th pct</th></tr></thead><tbody>'+t.slow.map(s=>'<tr><td>'+esc(s.route)+'</td><td>'+n(s.n)+'</td><td>'+n(s.p95_ms)+' ms</td></tr>').join('')+'</tbody></table></details>':'')
    +(h.traffic.errors_by_route.length?'<details class="tv" open><summary>Where server errors happened</summary><table class="t"><thead><tr><th>Route</th><th>5xx</th></tr></thead><tbody>'+h.traffic.errors_by_route.map(([r,k])=>'<tr><td>'+esc(r)+'</td><td>'+n(k)+'</td></tr>').join('')+'</tbody></table></details>':'');
  $('#ai').innerHTML='<div class="wrapx"><table class="t"><thead><tr><th>Model</th><th>Calls</th><th>Input</th><th>Output</th><th>Cache read</th><th>Cache write</th><th>Cost</th></tr></thead><tbody>'+(h.ai.models.length?h.ai.models.map(m=>'<tr><td>'+esc(m.model)+'</td><td>'+n(m.calls)+'</td><td>'+n(m.in)+'</td><td>'+n(m.out)+'</td><td>'+n(m.cache_read)+'</td><td>'+n(m.cache_write)+'</td><td>'+usd(m.cents)+'</td></tr>').join(''):'<tr><td colspan="7">No Claude calls recorded yet.</td></tr>')+'<tr><td>Web searches</td><td>'+n(h.ai.web_searches)+'</td><td></td><td></td><td></td><td></td><td>'+usd(h.ai.web_searches)+'</td></tr></tbody></table></div>'
    +(h.ai.unpriced.length?'<p class="est">No price on file for: '+h.ai.unpriced.map(esc).join(', ')+' (not counted in cost).</p>':'')
    +'<p class="est">Anthropic list prices; check the Anthropic Console for the exact bill.</p>';
  const u=h.usage;
  $('#money').innerHTML='<div class="wrapx"><table class="t txt"><thead><tr><th>Earned</th><th>Detail</th><th>Last '+h.window_days+' days</th></tr></thead><tbody>'
    +'<tr><td>Spot fee ($2)</td><td>'+n(rv.fee.asks)+' asks paid and not refunded · '+usd(rv.fee.all_time_cents)+' all time</td><td>'+usd(rv.fee.cents)+'</td></tr>'
    +'<tr><td>Affiliate <span class="est">(est.)</span></td><td>'+n(rv.affiliate.clicks)+' clicks'+(Object.keys(rv.affiliate.by_network).length?' ('+Object.entries(rv.affiliate.by_network).map(([k,v])=>esc(k)+' '+n(v)).join(', ')+')':'')+' · '+n(rv.affiliate.orders)+' orders, '+usd(rv.affiliate.order_cents)+' at '+(rv.affiliate.bps/100)+'%</td><td>'+usd(rv.affiliate.cents)+'</td></tr>'
    +'<tr><td>Stripe interchange <span class="est">(est.)</span></td><td>'+usd(rv.interchange.spend_cents)+' spent on Spot cards'+(rv.interchange.set?' · set '+rv.interchange.set+' from your Stripe Issuing terms to estimate':' at '+(rv.interchange.bps/100)+'%')+'</td><td>'+usd(rv.interchange.cents)+'</td></tr>'
    +'</tbody></table></div><div class="wrapx"><table class="t txt" style="margin-top:12px"><thead><tr><th>Costs <span class="est">(est.)</span></th><th>Detail</th><th>Last '+h.window_days+' days</th></tr></thead><tbody>'
    +'<tr><td>Claude</td><td>tokens and web searches</td><td>'+usd(c.ai_cents)+'</td></tr>'
    +'<tr><td>Stripe processing</td><td>'+n(u.card_payments)+' card payments</td><td>'+usd(c.stripe_cents)+'</td></tr>'
    +'<tr><td>Stripe Issuing</td><td>'+n(u.cards_issued)+' Spot cards</td><td>'+usd(c.issuing_cents)+'</td></tr>'
    +'<tr><td>Texts</td><td>'+n(u.sms_segments)+' segments</td><td>'+usd(c.sms_cents)+'</td></tr>'
    +'<tr><td>Email</td><td>'+n(u.emails)+' emails</td><td>'+usd(c.email_cents)+'</td></tr>'
    +'<tr><td><b>Net</b></td><td>earned minus costs</td><td><b>'+usd(h.net_cents)+'</b></td></tr></tbody></table></div>'
    +'<p class="est">Affiliate and interchange are estimates until the networks and Stripe pay out; actual commissions show in each network’s dashboard. Costs use list prices.</p>';
}
$('#refresh').onclick=load;load();setInterval(load,60000);
`;

export function healthPage({ head }) {
  return `${head}
<main class="hl"><div class="wrap">
  <div class="bar"><div><h1>Spot health</h1><p class="sub" id="when">Loading…</p></div><div style="display:flex;gap:8px"><a class="ab" href="/admin">Admin</a><button class="ab" id="refresh">Refresh</button></div></div>
  <div class="banner" id="banner">Checking…</div>
  <div class="tiles" id="tiles"></div>
  <h2>Stuck money</h2><div class="list" id="stuck"></div><div class="list" id="held" style="margin-top:8px"></div>
  <h2>Services</h2><div class="list" id="svcs"></div>
  <h2>Spots</h2><div class="charts" id="funnel"></div>
  <h2>Traffic</h2><div class="charts" id="trafficCharts"></div><div id="timing"></div>
  <details class="tv"><summary>Table: every day</summary><div class="wrapx" id="funnelTable"></div></details>
  <h2>Claude tokens and cost</h2><div id="ai"></div>
  <h2>Money</h2><div id="money"></div>
  <h2>Auto-pay fallbacks</h2><div class="list" id="autopay"></div>
</div></main>
<script>(()=>{${HEALTH_JS}})();</script>
</body></html>`;
}

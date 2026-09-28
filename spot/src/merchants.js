// "Ask someone to pay": a button a store puts next to its checkout.
//
// The shopper taps it, and their cart (exactly what's in the store's
// checkout, at the store's prices) opens in Spot ready to send to someone
// who'll pay. If the store takes agent checkout (UCP), the payer then pays
// the store directly; either way the store gets the order.
//
//   POST /v1/merchants           { domain, name, email } → publishable key + snippet
//   POST /v1/merchants/verify    { merchant_id }         → checks https://<domain>/.well-known/spot-merchant.txt
//   POST /v1/merchant/asks       { key, items, extras_cents } (from the store's page; Origin must be the store)
//                                → { draft_id, url }  the shopper opens url (/new?draft=…)
//   GET  /v1/merchant/drafts/:id → the cart, for the composer (1 hour)
//   GET  /embed/button.js        the button
//
// The key is publishable: it only works from the store's own pages (the
// Origin check), and all it can do is prefill a cart for the shopper, who
// still names themselves and picks who pays. A verified domain earns the ✓
// that payers see ("sent from Nike's checkout ✓").
import { randomBytes } from 'node:crypto';
import { CartError } from './cart.js';
import { assertPublicHost } from './capture.js';
import { domainOf } from './rules.js';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');

export function registerMerchants(app, { db, env, urlFor, cfg, fetchImpl = fetch, allowPrivate = env.SPOT_ALLOW_PRIVATE_FETCH === '1' }) {
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) throw new CartError('Too many requests, slow down', 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  };
  const proof = (m) => `spot-merchant=${m.id}`;
  const snippet = (req, m) => `<div data-spot-button></div>\n<script src="${urlFor(req, '/embed/button.js')}" data-key="${m.key}" async></script>`;

  app.post('/v1/merchants', async (req, reply) => {
    limit(`reg:${req.ip}`, 5, 3600_000);
    const domain = domainOf(req.body?.domain);
    const name = str(req.body?.name, 60);
    const email = str(req.body?.email, 200).toLowerCase();
    if (!domain || !domain.includes('.')) throw new CartError('Give your store’s domain, like shop.example.com');
    if (!name) throw new CartError('Give your store’s name');
    if (!EMAIL.test(email)) throw new CartError('That email looks wrong');
    if (db.merchants.countForDomain(domain) >= 5) throw new CartError('That domain already has several keys. Email us.', 409);
    const m = { id: `mer_${randomBytes(8).toString('hex')}`, domain, name, email, key: `spk_${randomBytes(18).toString('base64url')}` };
    db.merchants.add(m);
    reply.code(201);
    return {
      merchant_id: m.id,
      publishable_key: m.key,
      snippet: snippet(req, m),
      verify: {
        how: `Put a text file at https://${domain}/.well-known/spot-merchant.txt containing the line below, then call POST /v1/merchants/verify. Verified stores get a ✓ on their carts.`,
        url: `https://${domain}/.well-known/spot-merchant.txt`,
        content: proof(m),
      },
      note: 'The key is publishable: it only works from pages on your domain.',
    };
  });

  app.post('/v1/merchants/verify', async (req) => {
    limit(`verify:${req.ip}`, 20, 3600_000);
    const m = db.merchants.byId(String(req.body?.merchant_id || ''));
    if (!m) throw new CartError('No store with that id', 404);
    if (m.verified_at) return { verified: true, domain: m.domain };
    const url = `https://${m.domain}/.well-known/spot-merchant.txt`;
    let text = '';
    try {
      if (!allowPrivate) await assertPublicHost(m.domain);
      const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { accept: 'text/plain' } });
      if (res.ok) text = (await res.text()).slice(0, 10_000);
    } catch {
      // Unreachable counts as not verified.
    }
    if (!text.split(/\r?\n/).some((l) => l.trim() === proof(m))) throw new CartError(`Couldn’t find "${proof(m)}" at ${url}`, 409);
    db.merchants.verify(m.id);
    return { verified: true, domain: m.domain };
  });

  // CORS for the button: only the store's own origins get an answer.
  const originOk = (m, origin) => {
    try {
      const u = new URL(origin);
      if (u.protocol !== 'https:' && !(allowPrivate && u.protocol === 'http:')) return false;
      return u.hostname === m.domain || u.hostname === `www.${m.domain}` || u.hostname.endsWith(`.${m.domain}`);
    } catch {
      return false;
    }
  };
  app.options('/v1/merchant/asks', async (req, reply) => {
    const origin = String(req.headers.origin || '');
    reply
      .header('access-control-allow-origin', origin || '*')
      .header('access-control-allow-methods', 'POST')
      .header('access-control-allow-headers', 'content-type')
      .header('access-control-max-age', '600')
      .header('vary', 'origin')
      .code(204)
      .send();
  });
  app.post('/v1/merchant/asks', async (req, reply) => {
    const origin = String(req.headers.origin || '');
    reply.header('vary', 'origin');
    limit(`ask:${req.ip}`, 60, 600_000);
    const m = db.merchants.byKey(String(req.body?.key || ''));
    if (!m) throw new CartError('Unknown Spot key', 401);
    if (!originOk(m, origin)) throw new CartError(`This key only works on ${m.domain}`, 403);
    reply.header('access-control-allow-origin', origin);
    const items = cleanItems(req.body?.items, m, cfg);
    const extras = Math.max(0, Math.min(Math.round(Number(req.body?.extras_cents) || 0), cfg.maxCartCents));
    const id = `drf_${randomBytes(12).toString('base64url')}`;
    db.drafts.put(id, m.id, { merchant: { name: m.name, url: `https://${m.domain}` }, items, extras_cents: extras });
    reply.code(201);
    return { draft_id: id, url: urlFor(req, `/new?draft=${id}`), expires_in: 3600 };
  });

  app.get('/v1/merchant/drafts/:id', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const d = db.drafts.get(String(req.params.id));
    if (!d) throw new CartError('This cart expired. Go back to the store and tap the button again.', 404);
    const m = db.merchants.byId(d.merchant_id);
    return { merchant: d.merchant, items: d.items, extras_cents: d.extras_cents, verified: Boolean(m?.verified_at) };
  });

  app.get('/embed/button.js', async (req, reply) => {
    reply.header('content-type', 'application/javascript; charset=utf-8').header('cache-control', 'public, max-age=3600').header('access-control-allow-origin', '*');
    return BUTTON_JS;
  });

  // For cart creation: the draft's items and store win over what the
  // browser sends, and the cart remembers where it came from.
  return {
    fromDraft(id) {
      const d = db.drafts.get(String(id));
      if (!d) throw new CartError('This cart expired. Go back to the store and tap the button again.', 404);
      const m = db.merchants.byId(d.merchant_id);
      return { input: { merchant: d.merchant, items: d.items, extras_cents: d.extras_cents }, source: { kind: 'store_button', merchant_id: d.merchant_id, name: m?.name || d.merchant.name, verified: Boolean(m?.verified_at) } };
    },
  };
}

function cleanItems(list, m, cfg) {
  if (!Array.isArray(list) || !list.length) throw new CartError('No items in the cart');
  if (list.length > 25) throw new CartError('Up to 25 items');
  const onStore = (u) => {
    try {
      const x = new URL(String(u));
      return x.protocol === 'https:' && (x.hostname === m.domain || x.hostname.endsWith(`.${m.domain}`)) ? x.toString() : null;
    } catch {
      return null;
    }
  };
  const https = (u) => {
    try {
      const x = new URL(String(u));
      return x.protocol === 'https:' ? x.toString() : null;
    } catch {
      return null;
    }
  };
  return list.map((i) => {
    const title = str(i?.title, 200);
    const price = Math.round(Number(i?.price_cents));
    const qty = Math.round(Number(i?.quantity ?? 1));
    if (!title) throw new CartError('Every item needs a title');
    if (!Number.isFinite(price) || price < 1 || price > cfg.maxCartCents) throw new CartError(`Bad price for ${title}`);
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) throw new CartError(`Bad quantity for ${title}`);
    return { title, variant: str(i?.variant, 80) || null, quantity: qty, price_cents: price, url: i?.url ? onStore(i.url) : null, image_url: i?.image_url ? https(i.image_url) : null };
  });
}

// The embeddable button. Put <div data-spot-button></div> where it goes,
// and either data-items='[{"title":…,"price_cents":…,"quantity":1}]' on the
// div, or window.SpotCart = () => ({ items, extras_cents }) (may return a
// promise) so it reads the live cart when tapped.
const BUTTON_JS = `(function(){
var s=document.currentScript;if(!s)return;var base=new URL(s.src).origin,key=s.getAttribute('data-key');
function cart(el){if(typeof window.SpotCart==='function')return Promise.resolve(window.SpotCart());try{return Promise.resolve({items:JSON.parse(el.getAttribute('data-items')||'[]'),extras_cents:+el.getAttribute('data-extras-cents')||0})}catch(e){return Promise.reject(new Error('Bad data-items'))}}
function ask(el){var w=window.open('about:blank','_blank');return cart(el).then(function(c){return fetch(base+'/v1/merchant/asks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key:key,items:c.items,extras_cents:c.extras_cents||0})})}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Spot is unavailable');return j})}).then(function(j){if(w)w.location.href=j.url;else location.href=j.url}).catch(function(e){if(w)w.close();alert('Spot: '+e.message)})}
function mount(el){if(el.getAttribute('data-spot-mounted'))return;el.setAttribute('data-spot-mounted','1');var b=document.createElement('button');b.type='button';b.textContent=el.getAttribute('data-label')||'Ask someone to pay';
b.style.cssText='font:700 15px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;background:#ff5a36;color:#fff;border:0;border-radius:999px;padding:14px 20px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px';
b.innerHTML='<span style="width:12px;height:12px;border-radius:50%;background:#fff;display:inline-block"></span>'+b.textContent.replace(/[&<>]/g,'');b.onclick=function(){ask(el)};el.appendChild(b);
var n=document.createElement('div');n.textContent='They pay, it ships to you. Powered by Spot';n.style.cssText='font:12px -apple-system,sans-serif;color:#8a8175;text-align:center;margin-top:6px';el.appendChild(n)}
function all(){var els=document.querySelectorAll('[data-spot-button]');for(var i=0;i<els.length;i++)mount(els[i])}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',all);else all();
window.Spot={mount:mount,ask:ask};
})();`;

// Piggy: tap a phone on a piggy bank / tip jar / collection plate, pick an
// amount, pay with Apple Pay or Google Pay. The NFC tag (and the QR code
// beside it) holds nothing but a URL: https://<host>/j/<slug>.
//
// Without STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY the app runs in demo
// mode: the same pages, with a "simulate payment" button instead of a wallet.
import http from 'node:http';
import { EventEmitter } from 'node:events';
import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { openDb, getJar, listJars, createJar, recentPayments, countSince, setCheer, credit, parseAmount, KINDS } from './db.js';
import { homePage, tapPage, displayPage, notFoundPage } from './pages.js';

const env = process.env;
const PORT = Number(env.PORT || 3000);
const MIN = Number(env.MIN_CENTS || 100);
const MAX = Number(env.MAX_CENTS || 50000);
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
const live = Boolean(stripe && env.STRIPE_PUBLISHABLE_KEY);
const db = openDb();
const bus = new EventEmitter().setMaxListeners(0);
const FUN_JS = readFileSync(new URL('../public/fun.js', import.meta.url));

const publicJar = (j) => ({
  slug: j.slug, kind: j.kind, label: KINDS[j.kind].label, name: j.name, owner: j.owner, tagline: j.tagline,
  presets: j.presets, currency: j.currency, goal_cents: j.goal_cents, balance_cents: j.balance_cents,
});

function announce(jar, amount_cents) {
  bus.emit(jar.slug, { balance_cents: jar.balance_cents, amount_cents, at: Date.now() });
}

// Record a Stripe PaymentIntent once it has succeeded. Called from the webhook
// and from the payer's browser right after confirmation, whichever is first.
// Start of the payer's day, as they sent it; falls back to the last 24 hours.
const sinceOf = (v) => (Number.isFinite(Number(v)) && Number(v) > Date.now() - 2 * 864e5 ? Number(v) : Date.now() - 864e5);

async function settle(piId, since) {
  const pi = await stripe.paymentIntents.retrieve(piId, { expand: ['latest_charge'] });
  const slug = pi.metadata?.piggy_jar;
  if (pi.status !== 'succeeded' || !slug || !getJar(db, slug)) return { status: pi.status };
  const method = pi.latest_charge?.payment_method_details?.card?.wallet?.type
    || pi.latest_charge?.payment_method_details?.type || null;
  const jar = credit(db, { id: pi.id, slug, amount_cents: pi.amount_received, method });
  if (jar) announce(jar, pi.amount_received);
  return {
    status: pi.status, jar: publicJar(jar || getJar(db, slug)), amount_cents: pi.amount_received,
    payment_id: pi.id, today_count: countSince(db, slug, sinceOf(since)),
  };
}

// ─── tiny router ────────────────────────────────────────────────────────────
const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const html = (res, body, code = 200) => send(res, code, body, 'text/html; charset=utf-8');

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('Body too large'), { code: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
const readJson = async (req) => {
  const raw = (await readBody(req)).toString() || '{}';
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { code: 400 }); }
};

// A few intents per minute per address is plenty for a person at a jar.
const hits = new Map();
function limited(req, max = 20) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  h.push(now);
  hits.set(ip, h);
  return h.length > max;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every((t) => now - t > 60_000)) hits.delete(k); }, 60_000).unref();

const cfg = () => ({ live, publishable_key: live ? env.STRIPE_PUBLISHABLE_KEY : null, min_cents: MIN, max_cents: MAX });

const routes = [
  ['GET', /^\/health$/, (req, res) => send(res, 200, { ok: true, live })],
  ['GET', /^\/static\/fun\.js$/, (req, res) => send(res, 200, FUN_JS, 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=300' })],
  ['GET', /^\/$/, (req, res) => html(res, homePage({ jars: listJars(db).map(publicJar), live }))],

  // Apple Pay domain verification file, if Stripe hands you one to host.
  ['GET', /^\/\.well-known\/apple-developer-merchantid-domain-association$/, (req, res) =>
    env.APPLE_PAY_DOMAIN_ASSOCIATION ? send(res, 200, env.APPLE_PAY_DOMAIN_ASSOCIATION, 'text/plain') : send(res, 404, 'Not found', 'text/plain')],

  // The URL written to the NFC tag and printed as the QR code.
  ['GET', /^\/j\/([a-z0-9-]+)$/, (req, res, [slug]) => {
    const jar = getJar(db, slug);
    if (!jar) return html(res, notFoundPage(), 404);
    html(res, tapPage({ jar: publicJar(jar), kind: KINDS[jar.kind], ...cfg() }));
  }],

  // A browser stand-in for the backlit balance on the bottom of the pig.
  ['GET', /^\/d\/([a-z0-9-]+)$/, (req, res, [slug]) => {
    const jar = getJar(db, slug);
    if (!jar) return html(res, notFoundPage(), 404);
    html(res, displayPage({ jar: publicJar(jar), kind: KINDS[jar.kind], recent: recentPayments(db, slug) }));
  }],

  ['GET', /^\/api\/jars\/([a-z0-9-]+)$/, (req, res, [slug]) => {
    const jar = getJar(db, slug);
    if (!jar) return send(res, 404, { error: 'No such jar' });
    send(res, 200, { jar: publicJar(jar), recent: recentPayments(db, slug, 5) });
  }],

  // Live balance stream (server-sent events) for the display page.
  ['GET', /^\/api\/jars\/([a-z0-9-]+)\/stream$/, (req, res, [slug]) => {
    const jar = getJar(db, slug);
    if (!jar) return send(res, 404, { error: 'No such jar' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const push = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    push({ balance_cents: jar.balance_cents });
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    bus.on(slug, push);
    req.on('close', () => { clearInterval(ping); bus.off(slug, push); });
  }],

  // The hardware's endpoint: the pig's microcontroller polls this over Wi-Fi
  // to light up the balance. Each device holds its own key.
  ['GET', /^\/api\/device\/([a-z0-9-]+)$/, (req, res, [slug]) => {
    const jar = getJar(db, slug);
    if (!jar || req.headers['x-device-key'] !== jar.device_key) return send(res, 401, { error: 'Unknown device' });
    const last = recentPayments(db, slug, 1)[0] || null;
    send(res, 200, {
      balance_cents: jar.balance_cents,
      display: `$${Math.floor(jar.balance_cents / 100)}`,
      goal_cents: jar.goal_cents,
      last_payment: last && { amount_cents: last.amount_cents, at: last.created_at },
    });
  }],

  // Create the PaymentIntent for the amount the payer picked.
  ['POST', /^\/api\/jars\/([a-z0-9-]+)\/intents$/, async (req, res, [slug]) => {
    if (limited(req)) return send(res, 429, { error: 'Too many tries, give it a minute' });
    const jar = getJar(db, slug);
    if (!jar) return send(res, 404, { error: 'No such jar' });
    const amount = parseAmount((await readJson(req)).amount_cents, { min: MIN, max: MAX });
    if (!live) return send(res, 409, { error: 'Payments are in demo mode' });
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: jar.currency,
      automatic_payment_methods: { enabled: true },
      description: `${KINDS[jar.kind].label}: ${jar.name}`,
      metadata: { piggy_jar: jar.slug },
    });
    send(res, 200, { id: pi.id, client_secret: pi.client_secret });
  }],

  // The payer's browser asks us to look the payment up as soon as Stripe
  // confirms it, so the balance moves even before the webhook lands.
  ['POST', /^\/api\/payments\/(pi_[A-Za-z0-9]+)\/sync$/, async (req, res, [id]) => {
    if (!live) return send(res, 409, { error: 'Payments are in demo mode' });
    send(res, 200, await settle(id, (await readJson(req)).since));
  }],

  // Demo mode only: pretend the wallet said yes.
  ['POST', /^\/api\/jars\/([a-z0-9-]+)\/demo-pay$/, async (req, res, [slug]) => {
    if (live) return send(res, 409, { error: 'Demo payments are off when Stripe is connected' });
    if (limited(req)) return send(res, 429, { error: 'Too many tries, give it a minute' });
    if (!getJar(db, slug)) return send(res, 404, { error: 'No such jar' });
    const body = await readJson(req);
    const amount = parseAmount(body.amount_cents, { min: MIN, max: MAX });
    const id = `demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jar = credit(db, { id, slug, amount_cents: amount, method: 'demo', demo: true });
    announce(jar, amount);
    send(res, 200, { status: 'succeeded', jar: publicJar(jar), amount_cents: amount, payment_id: id, today_count: countSince(db, slug, sinceOf(body.since)) });
  }],

  // After paying, the payer can send one emoji to the jar's display.
  ['POST', /^\/api\/jars\/([a-z0-9-]+)\/cheer$/, async (req, res, [slug]) => {
    if (limited(req)) return send(res, 429, { error: 'Too many tries, give it a minute' });
    const jar = getJar(db, slug);
    if (!jar) return send(res, 404, { error: 'No such jar' });
    const { payment_id, cheer } = await readJson(req);
    if (!KINDS[jar.kind].cheers.includes(cheer)) return send(res, 400, { error: 'Pick one of the cheers shown' });
    if (typeof payment_id !== 'string' || !setCheer(db, { id: payment_id, slug, cheer })) return send(res, 409, { error: 'That payment already sent a cheer' });
    bus.emit(slug, { balance_cents: jar.balance_cents, cheer, at: Date.now() });
    send(res, 200, { ok: true });
  }],

  ['POST', /^\/webhooks\/stripe$/, async (req, res) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return send(res, 404, { error: 'Webhook not configured' });
    let event;
    try {
      event = stripe.webhooks.constructEvent(await readBody(req, 1024 * 1024), req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return send(res, 400, { error: `Bad signature: ${e.message}` });
    }
    if (event.type === 'payment_intent.succeeded') await settle(event.data.object.id);
    send(res, 200, { received: true });
  }],

  // Provisioning a new device. Returns the device key to flash onto it.
  ['POST', /^\/api\/jars$/, async (req, res) => {
    if (!env.ADMIN_TOKEN || req.headers.authorization !== `Bearer ${env.ADMIN_TOKEN}`) return send(res, 401, { error: 'Unauthorized' });
    const body = await readJson(req);
    if (getJar(db, body.slug)) return send(res, 409, { error: 'That slug is taken' });
    const jar = createJar(db, body);
    const base = env.PUBLIC_URL || `https://${req.headers.host}`;
    send(res, 201, { jar: publicJar(jar), device_key: jar.device_key, tag_url: `${base}/j/${jar.slug}` });
  }],
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    for (const [method, re, fn] of routes) {
      const m = req.method === method && url.pathname.match(re);
      if (m) return await fn(req, res, m.slice(1), url);
    }
    if (req.method === 'GET') return html(res, notFoundPage(), 404);
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    const code = e.code === 413 || e.code === 400 ? e.code : e.type?.startsWith?.('Stripe') ? 402 : /^Amount|^slug|^kind/.test(e.message) ? 400 : 500;
    if (code === 500) console.error(e);
    if (!res.headersSent) send(res, code, { error: e.message });
  }
});

// Apple Pay and Google Pay only appear on domains registered with Stripe.
async function registerWalletDomain() {
  if (!stripe || !env.PUBLIC_URL) return;
  const domain = new URL(env.PUBLIC_URL).hostname;
  try {
    const existing = await stripe.paymentMethodDomains.list({ domain_name: domain, limit: 1 });
    const d = existing.data[0] || (await stripe.paymentMethodDomains.create({ domain_name: domain }));
    console.log(`wallet domain ${domain}: apple_pay=${d.apple_pay?.status} google_pay=${d.google_pay?.status}`);
  } catch (e) {
    console.warn(`could not register wallet domain ${domain}: ${e.message}`);
  }
}

server.listen(PORT, () => {
  console.log(`piggy listening on :${PORT} (${live ? 'stripe' : 'demo'} mode)`);
  registerWalletDomain();
});

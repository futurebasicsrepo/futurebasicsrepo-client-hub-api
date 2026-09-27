import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CartError, config, handoffLinks } from './cart.js';
import { CaptureError, captureFromScreenshot, captureFromText, captureFromUrl } from './capture.js';
import { openDb } from './db.js';
import { homePage, managePage, notFoundPage, payPage } from './pages.js';
import { pickProvider } from './providers.js';
import { fetchProductImage, renderShareCard } from './sharecard.js';
import { createSpot, ownerCart, publicCart } from './spot.js';
import { createFulfiller } from './fulfill/index.js';
import { registerAgentApi } from './agentapi.js';

export function buildApp({ db = openDb(), provider = pickProvider(), cfg = config(), capture = {}, logger = true, fulfill = {}, env = process.env } = {}) {
  const app = Fastify({ logger, bodyLimit: 8 * 1024 * 1024, trustProxy: true });
  const spot = createSpot({ db, provider, cfg, log: app.log });
  const fulfiller = createFulfiller({ spot, provider, env, log: app.log, ...fulfill });
  const baseUrl = () => (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  const urlFor = (req, path) => `${baseUrl() || `${req.protocol}://${req.headers.host}`}${path}`;
  const captureUrl = capture.fromUrl || captureFromUrl;
  const captureShot = capture.fromScreenshot || captureFromScreenshot;
  const captureText = capture.fromText || ((t) => captureFromText(t, { fromUrl: captureUrl }));

  // Keep the raw body: Stripe signs the exact bytes it sent.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    if (!body.length) return done(null, {});
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch {
      done(new CartError('Invalid JSON'), undefined);
    }
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err instanceof CartError || err instanceof CaptureError ? err.status : Number.isInteger(err.status) && err.status < 500 ? err.status : err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    if (status >= 500) req.log.error(err);
    reply.code(status).send({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  // Small fixed-window limiter; enough to stop a script hammering capture
  // (which costs a model call) or minting thousands of links.
  const hits = new Map();
  const limit = (key, max, windowMs) => (req) => {
    const k = `${key}:${req.ip}`;
    const now = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + windowMs });
    else if (++h.n > max) throw new CartError('Too many requests, slow down', 429);
  };
  const limits = {
    capture: limit('capture', Number(process.env.SPOT_CAPTURE_PER_10M || 30), 600_000),
    create: limit('create', Number(process.env.SPOT_CREATE_PER_10M || 20), 600_000),
    pay: limit('pay', 60, 600_000),
  };
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
    spot.sweepExpired();
  }, 60_000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  const html = (reply, body, code = 200) => reply.code(code).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body);

  app.get('/health', async () => ({ ok: true, provider: provider.name }));

  const homeJs = readFileSync(new URL('./client/home.js', import.meta.url));
  app.get('/client/home.js', async (req, reply) => reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300').send(homeJs));

  // ─── Pages ────────────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => html(reply, homePage({ origin: urlFor(req, ''), provider: provider.name, cfg })));
  app.get('/new', async (req, reply) => html(reply, homePage({ origin: urlFor(req, ''), provider: provider.name, cfg })));

  app.get('/c/:token', async (req, reply) => {
    let cart;
    try {
      cart = spot.load(req.params.token);
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, payPage({ cart: publicCart(cart), links: handoffLinks(cart), provider: provider.name, pageUrl: urlFor(req, `/c/${cart.token}`) }));
  });

  // Share-card image for link previews. Cached per cart state: it only
  // changes when the cart does (e.g. flips to "covered").
  const cards = new Map();
  app.get('/c/:token/card.png', async (req, reply) => {
    let cart;
    try {
      cart = spot.load(req.params.token);
    } catch {
      return reply.code(404).send();
    }
    const pub = publicCart(cart);
    const key = `${cart.token}:${pub.rev}:${cart.status}:${pub.payer_name || ''}`;
    let png = cards.get(key);
    if (!png) {
      const productImage = await fetchProductImage(cart.items.find((i) => i.image_url)?.image_url);
      png = await renderShareCard(pub, { productImage });
      if (cards.size > 500) cards.delete(cards.keys().next().value);
      cards.set(key, png);
    }
    return reply.type('image/png').header('cache-control', 'public, max-age=300').send(png);
  });

  app.get('/c/:token/manage', async (req, reply) => {
    try {
      spot.loadManaged(req.params.token, req.query.k);
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, managePage({ token: req.params.token, provider: provider.name }));
  });

  // ─── Capture ──────────────────────────────────────────────────────────────
  app.post('/v1/capture', async (req) => {
    limits.capture(req);
    const b = req.body || {};
    if (b.url) return captureUrl(String(b.url));
    if (b.text) return captureText(String(b.text));
    if (b.image?.data) {
      if (!process.env.ANTHROPIC_API_KEY && !capture.fromScreenshot) {
        throw new CaptureError('Screenshot capture is not configured on this server — paste a link or enter items');
      }
      return captureShot({ data: String(b.image.data), media_type: String(b.image.media_type || '') });
    }
    throw new CartError('Send a url or an image');
  });

  // ─── Carts ────────────────────────────────────────────────────────────────
  app.post('/v1/carts', async (req, reply) => {
    limits.create(req);
    const { cart, manageKey } = spot.create(req.body, { ip: req.ip });
    reply.code(201);
    return {
      cart: publicCart(cart),
      link: urlFor(req, `/c/${cart.token}`),
      manage_link: urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`),
      manage_key: manageKey,
    };
  });

  app.get('/v1/carts/:token', async (req) => {
    const cart = spot.load(req.params.token);
    return { cart: publicCart(cart), handoff: handoffLinks(cart), provider: provider.name };
  });

  app.post('/v1/carts/:token/pay', async (req) => {
    limits.pay(req);
    return spot.startPayment(req.params.token);
  });

  // Sandbox only: stands in for Apple Pay + the Stripe webhook.
  app.post('/v1/carts/:token/sandbox-pay', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    limits.pay(req);
    await spot.startPayment(req.params.token);
    const cart = spot.load(req.params.token);
    const name = String(req.body?.payer_name || '').trim().slice(0, 60) || null;
    const done = await spot.paymentSucceeded({ paymentRef: cart.payment_ref, amountCents: cart.total_cents, payer: { name } });
    return { cart: publicCart(done) };
  });

  // ─── Requester (manage key) ───────────────────────────────────────────────
  const keyOf = (req) => req.body?.k || req.query?.k;

  app.get('/v1/carts/:token/manage', async (req) => {
    let cart = spot.loadManaged(req.params.token, keyOf(req));
    if (cart.status === 'paid') cart = await spot.issue(cart); // retry a failed issue
    return {
      cart: ownerCart(cart),
      needs_billing: spot.needsBilling(cart),
      agent_enabled: fulfiller.agentEnabled(),
      events: spot.events(cart).map(({ kind, at }) => ({ kind, at })),
      provider: provider.name,
      link: urlFor(req, `/c/${cart.token}`),
    };
  });

  app.post('/v1/carts/:token/manage/reveal', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    return spot.revealCard(cart);
  });

  app.post('/v1/carts/:token/manage/edit', async (req) => ({ cart: ownerCart(spot.edit(req.params.token, keyOf(req), req.body?.cart)) }));
  app.post('/v1/carts/:token/manage/billing', async (req) => ({ cart: ownerCart(await spot.addBilling(req.params.token, keyOf(req), req.body?.billing)) }));
  app.post('/v1/carts/:token/manage/received', async (req) => ({ cart: ownerCart(spot.markReceived(req.params.token, keyOf(req))) }));
  app.post('/v1/carts/:token/manage/cancel', async (req) => ({ cart: ownerCart(await spot.cancel(req.params.token, keyOf(req))) }));
  app.post('/v1/carts/:token/manage/refund', async (req) => ({ cart: ownerCart(await spot.refund(req.params.token, keyOf(req))) }));

  // Sandbox only: simulate the merchant running the issued card at checkout.
  // ─── Order it for me (checkout agent) ─────────────────────────────────────
  app.post('/v1/carts/:token/manage/order', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    return { cart: ownerCart(await fulfiller.start(cart, req.body?.shipping)) };
  });
  app.post('/v1/carts/:token/manage/order/confirm', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    return { cart: ownerCart(fulfiller.confirm(cart, req.body?.place === true)) };
  });
  app.get('/v1/carts/:token/manage/order/shot.png', async (req, reply) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    const png = fulfiller.screenshot(cart);
    if (!png) return reply.code(404).send();
    return reply.type('image/png').header('cache-control', 'no-store').send(png);
  });

  registerAgentApi(app, { spot, fulfiller, provider, env, urlFor, capture: { url: captureUrl, text: captureText } });

  app.post('/v1/sandbox/authorize', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    const cart = spot.loadManaged(req.body?.token, keyOf(req));
    const decision = spot.authorize(cart.card_ref, {
      amount_cents: Number(req.body?.amount_cents),
      currency: 'usd',
      merchant: { name: String(req.body?.merchant_name || ''), url: req.body?.merchant_url ? String(req.body.merchant_url) : null },
    });
    return { ...decision, cart: ownerCart(spot.load(cart.token)) };
  });

  // ─── Stripe webhooks ──────────────────────────────────────────────────────
  app.post('/v1/webhooks/stripe', async (req, reply) => {
    if (provider.name !== 'stripe') throw new CartError('Not available', 404);
    let event;
    try {
      event = provider.verifyWebhook(req.rawBody, req.headers['stripe-signature']);
    } catch (err) {
      req.log.warn({ err }, 'bad stripe signature');
      return reply.code(400).send({ error: 'Bad signature' });
    }
    const obj = event.data.object;
    switch (event.type) {
      case 'payment_intent.succeeded':
        if (obj.metadata?.spot_cart_id) {
          await spot.paymentSucceeded({
            paymentRef: obj.id,
            amountCents: obj.amount_received,
            payer: { name: (await provider.payerNameFor?.(obj).catch(() => null)) || obj.shipping?.name || null },
          });
        }
        break;
      case 'issuing_authorization.request': {
        // Must answer within Stripe's real-time window, so this does no
        // network calls besides the answer itself.
        const decision = spot.authorize(obj.card?.id, {
          amount_cents: obj.pending_request?.amount ?? obj.amount,
          currency: obj.pending_request?.currency ?? obj.currency,
          merchant: { name: obj.merchant_data?.name, url: obj.merchant_data?.url },
        });
        await provider.answerAuthorization(obj.id, decision.approved);
        break;
      }
      default:
        break;
    }
    return { received: true };
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = buildApp();
  const port = Number(process.env.PORT || 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

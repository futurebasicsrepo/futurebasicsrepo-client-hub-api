import Fastify from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CartError, config, handoffLinks } from './cart.js';
import { CaptureError, captureFromScreenshot, captureFromText, captureFromUrl } from './capture.js';
import { openDb } from './db.js';
import { homePage, managePage, notFoundPage, payPage } from './pages.js';
import { pickProvider } from './providers.js';
import { fetchProductImage, renderShareCard } from './sharecard.js';
import { sitePage } from './site.js';
import { privacyPage, termsPage } from './legal.js';
import { COMING_SOON, integrationsPage } from './integrations.js';
import { extensionZip, EXTENSION_VERSION } from './extension.js';
import { createSpot, ownerCart, publicCart } from './spot.js';
import { createFulfiller } from './fulfill/index.js';
import { registerAgentApi } from './agentapi.js';
import { createNotifier, normalizePhone } from './notify.js';
import { createFlights } from './flights.js';
import { createRisk } from './risk.js';
import { registerAdmin } from './admin.js';
import { registerAccounts } from './accounts.js';
import { accountPage, signinPage } from './accountpage.js';
import { platformProfile } from './fulfill/ucp.js';

export function buildApp({ db = openDb(), provider = pickProvider(), cfg = config(), capture = {}, logger = true, fulfill = {}, env = process.env, notifyFetch, flights = createFlights({ env }) } = {}) {
  const app = Fastify({ logger, bodyLimit: 8 * 1024 * 1024, trustProxy: true });
  const risk = createRisk({ db, env });
  const spot = createSpot({ db, provider, flights, risk, cfg, log: app.log });
  // Spot's UCP platform profile URL, named in every UCP request. Needs an
  // absolute URL, so it's PUBLIC_URL or the host of the latest request.
  // One public address: pages opened on www. or the Railway domain move to
  // PUBLIC_URL. Only page views (GET/HEAD) — API calls, webhooks, MCP and
  // the health check answer on any host, so existing integrations keep working.
  const canonical = (() => {
    try {
      return env.PUBLIC_URL ? new URL(env.PUBLIC_URL) : null;
    } catch {
      return null;
    }
  })();
  if (canonical) {
    app.addHook('onRequest', async (req, reply) => {
      const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
      if (!['GET', 'HEAD'].includes(req.method) || host === canonical.hostname) return;
      if (host !== `www.${canonical.hostname}` && !host.endsWith('.up.railway.app')) return;
      if (/^\/(v1\/|mcp|health|\.well-known\/)/.test(req.url)) return;
      return reply.redirect(`${canonical.origin}${req.url}`, 301);
    });
  }
  let seenOrigin = null;
  app.addHook('onRequest', async (req) => {
    if (!seenOrigin && req.headers.host) seenOrigin = `${req.protocol}://${req.headers.host}`;
  });
  const profileUrl = () => `${env.PUBLIC_URL?.replace(/\/+$/, '') || seenOrigin || 'http://localhost:3000'}/.well-known/ucp`;
  const fulfiller = createFulfiller({ spot, provider, env, log: app.log, ...fulfill, ucp: { profileUrl, ...(fulfill.ucp || {}) } });
  spot.onCardIssued = (cart) => fulfiller.autoStart(cart);
  app.addHook('onClose', async () => fulfiller.close());
  const notifier = createNotifier({ env, log: app.log, optouts: db.optouts, ...(notifyFetch ? { fetchImpl: notifyFetch } : {}) });
  const baseUrl = () => (env.PUBLIC_URL || '').replace(/\/$/, '');
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

  // Twilio posts inbound texts form-encoded.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body)));
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
    risk.sweep();
    db.sessions.prune();
  }, 60_000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  const html = (reply, body, code = 200) => reply.code(code).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body);

  app.get('/health', async () => ({ ok: true, provider: provider.name }));

  const homeJs = readFileSync(new URL('./client/home.js', import.meta.url));
  app.get('/client/home.js', async (req, reply) => reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300').send(homeJs));

  // ─── Pages ────────────────────────────────────────────────────────────────
  // ─── Website ──────────────────────────────────────────────────────────────
  app.get('/', async (req, reply) => html(reply, sitePage({ origin: urlFor(req, ''), provider: provider.name })));

  // MCP Registry domain check for the com.spotmeplease/* namespace:
  // MCP_REGISTRY_AUTH="v=MCPv1; k=ed25519; p=<public key>" (public, not a secret).
  app.get('/.well-known/mcp-registry-auth', async (req, reply) => {
    if (!env.MCP_REGISTRY_AUTH) return reply.code(404).send('not configured');
    return reply.type('text/plain').send(env.MCP_REGISTRY_AUTH);
  });
  app.get('/.well-known/ucp', async (req, reply) => reply.header('cache-control', 'public, max-age=300').send(platformProfile(urlFor(req, ''))));
  app.get('/signin', async (req, reply) => html(reply, signinPage({ origin: urlFor(req, '') })));
  app.get('/account', async (req, reply) => {
    if (!accounts.userIdOf(req)) return reply.redirect('/signin?next=/account');
    reply.header('cache-control', 'no-store');
    return html(reply, accountPage({ origin: urlFor(req, '') }));
  });
  app.get('/terms', async (req, reply) => html(reply, termsPage({ origin: urlFor(req, ''), env })));
  app.get('/privacy', async (req, reply) => html(reply, privacyPage({ origin: urlFor(req, ''), env })));
  app.get('/integrations', async (req, reply) => html(reply, integrationsPage({ origin: urlFor(req, '') })));

  // The browser extension, built for this server's address.
  const zips = new Map();
  app.get('/downloads/spot-extension.zip', async (req, reply) => {
    const origin = urlFor(req, '');
    if (!zips.has(origin)) zips.set(origin, extensionZip(origin));
    return reply
      .type('application/zip')
      .header('content-disposition', `attachment; filename="spot-extension-${EXTENSION_VERSION}.zip"`)
      .header('cache-control', 'public, max-age=3600')
      .send(zips.get(origin));
  });

  const require = createRequire(import.meta.url);
  const fonts = Object.fromEntries([
    ...[400, 600, 800].map((w) => [`bricolage-${w}.woff2`, readFileSync(require.resolve(`@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-${w}-normal.woff2`))]),
    ['caveat-700.woff2', readFileSync(require.resolve('@fontsource/caveat/files/caveat-latin-700-normal.woff2'))],
  ]);
  app.get('/fonts/:file', async (req, reply) => {
    const f = fonts[req.params.file];
    if (!f) return reply.code(404).send();
    return reply.type('font/woff2').header('cache-control', 'public, max-age=31536000, immutable').send(f);
  });

  // Demo share cards for the website, drawn by the real share-card renderer.
  const demo = {
    token: 'demo',
    status: 'open',
    requester: { name: 'Kyle' },
    merchant: { name: 'Kiln & Co.' },
    items: [{ title: 'The Super Puff jacket', quantity: 1, price_cents: 25000 }],
    cart_cents: 27100,
  };
  const demoCards = {};
  app.get('/site/:file', async (req, reply) => {
    const which = { 'card-open.png': 'open', 'card-covered.png': 'covered', 'card-agent.png': 'agent' }[req.params.file];
    if (!which) return reply.code(404).send();
    const cart = {
      open: demo,
      covered: { ...demo, status: 'card_issued', payer_name: 'Mom' },
      agent: { ...demo, merchant: { name: 'Trailhead Supply' }, items: [{ title: 'XT trail runners, black 10.5', quantity: 1, price_cents: 20000 }], cart_cents: 20800 },
    }[which];
    demoCards[which] ||= await renderShareCard(cart);
    return reply.type('image/png').header('cache-control', 'public, max-age=86400').send(demoCards[which]);
  });

  app.post('/v1/waitlist', async (req) => {
    limits.create(req);
    const b = req.body || {};
    if (b.company_fax) return { ok: true }; // bot
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CartError('That email looks wrong');
    const kinds = ['asker', 'agent', 'creator', ...COMING_SOON.map((c) => `notify:${c.slug}`)];
    const kind = kinds.includes(b.kind) ? b.kind : 'asker';
    db.joinWaitlist(email, kind);
    return { ok: true };
  });
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
      spot.loadManaged(req.params.token, keyOf(req));
    } catch {
      // Opened from the account page on a signed-out browser: sign in first.
      if (!req.query.k && !accounts.userIdOf(req)) return reply.redirect(`/signin?next=${encodeURIComponent(req.url)}`);
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
    const { cart, manageKey } = spot.create(req.body, { ip: req.ip, userId: accounts.userIdOf(req) });
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
    // test_card lets tests (and demos) play a repeat or blocked card.
    const fingerprint = req.body?.test_card ? String(req.body.test_card).slice(0, 40) : null;
    const done = await spot.paymentSucceeded({ paymentRef: cart.payment_ref, amountCents: cart.total_cents, payer: { name, fingerprint } });
    return { cart: publicCart(done) };
  });

  // ─── Requester (manage key) ───────────────────────────────────────────────
  // The private key from the link, or the signed-in owner's session.
  const keyOf = (req) => ({ k: req.body?.k || req.query?.k, userId: accounts.userIdOf(req) });

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
      // Saved details to pre-fill forms, when the owner is signed in.
      profile: (() => {
        const uid = accounts.userIdOf(req);
        const u = uid && (!cart.user_id || cart.user_id === uid) ? db.users.byId(uid) : null;
        return u ? { email: u.email, name: u.name || null, shipping: u.shipping || null, travelers: u.travelers || [] } : null;
      })(),
    };
  });

  app.post('/v1/carts/:token/manage/reveal', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    return spot.revealCard(cart);
  });

  app.post('/v1/carts/:token/manage/prepare', async (req) => ({ cart: ownerCart(spot.prepare(req.params.token, keyOf(req), req.body?.shipping)) }));
  app.post('/v1/carts/:token/manage/travelers', async (req) => {
    const { cart, price_changed } = await spot.setTravelers(req.params.token, keyOf(req), req.body || {});
    return { cart: ownerCart(cart), price_changed };
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

  registerAgentApi(app, { spot, fulfiller, notifier, flights, db, provider, env, urlFor, capture: { url: captureUrl, text: captureText } });

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
  registerAdmin(app, { db, spot, env, urlFor });
  const accounts = registerAccounts(app, { db, env, notifier, provider, urlFor, spot });

  // ─── Inbound texts (Twilio) ───────────────────────────────────────────────
  // Point the Twilio number's "A message comes in" webhook here. STOP-type
  // replies add the number to Spot's opt-out list and START removes it.
  // Twilio itself answers STOP/START/HELP (set the wording under Advanced
  // Opt-Out), so Spot replies with nothing to avoid a second text.
  // Requests must carry a valid X-Twilio-Signature.
  const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE'];
  const START_WORDS = ['START', 'UNSTOP', 'YES'];
  function twilioSigned(req) {
    const sig = String(req.headers['x-twilio-signature'] || '');
    if (!sig || !env.TWILIO_AUTH_TOKEN) return false;
    const params = Object.keys(req.body || {}).sort().map((k) => k + req.body[k]).join('');
    const urls = new Set([urlFor(req, req.url), `https://${req.headers.host}${req.url}`]);
    for (const url of urls) {
      const want = createHmac('sha1', env.TWILIO_AUTH_TOKEN).update(url + params).digest('base64');
      if (want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return true;
    }
    return false;
  }
  app.post('/v1/webhooks/twilio', async (req, reply) => {
    if (!env.TWILIO_AUTH_TOKEN) return reply.code(404).send('not configured');
    if (!twilioSigned(req)) return reply.code(403).send('bad signature');
    const from = normalizePhone(req.body?.From);
    const word = String(req.body?.Body || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (from && STOP_WORDS.includes(word)) db.optouts.add(from);
    else if (from && START_WORDS.includes(word)) db.optouts.remove(from);
    return reply.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  });

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
          const payer = (await provider.payerFor?.(obj).catch(() => null)) || {};
          await spot.paymentSucceeded({
            paymentRef: obj.id,
            amountCents: obj.amount_received,
            payer: { ...payer, name: payer.name || obj.shipping?.name || null },
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

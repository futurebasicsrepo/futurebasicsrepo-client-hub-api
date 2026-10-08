import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CartError, config, handoffLinks } from './cart.js';
import { CaptureError, captureFromScreenshot, captureFromText, captureFromUrl } from './capture.js';
import { openDb } from './db.js';
import { approvalPage, bundleManagePage, bundlePayPage, bundleReceiptPage, homePage, managePage, notFoundPage, payPage, receiptPage } from './pages.js';
import { pickProvider } from './providers.js';
import { fetchProductImage, renderShareCard } from './sharecard.js';
import { sitePage } from './site.js';
import { privacyPage, termsPage } from './legal.js';
import { COMING_SOON, integrationsPage } from './integrations.js';
import { extensionZip, EXTENSION_VERSION } from './extension.js';
import { createSpot, ownerCart, publicBundle, publicCart } from './spot.js';
import { createFulfiller } from './fulfill/index.js';
import { registerAgentApi } from './agentapi.js';
import { createNotifier, normalizePhone } from './notify.js';
import { createFlights } from './flights.js';
import { createRisk } from './risk.js';
import { registerAdmin } from './admin.js';
import { registerMerchants } from './merchants.js';
import { registerAccounts } from './accounts.js';
import { aiStopped, cardLabel, fundingOf, registerFunding } from './funding.js';
import { agentCardPage } from './agentcard.js';
import { accountPage, approverConfirmPage, signinPage } from './accountpage.js';
import { registerOAuth } from './oauth.js';
import { createEvents } from './events.js';
import { registerPasskeys } from './passkeys.js';
import { createBackups, restoreOnBoot } from './backup.js';
import { createDirect } from './direct.js';
import { createSigning } from './signing.js';
import { createApprovals } from './approvals.js';
import { platformProfile } from './fulfill/ucp.js';

export function buildApp({ db = openDb(), provider = pickProvider(), cfg = config(), capture = {}, logger = true, fulfill = {}, env = process.env, notifyFetch, oauthFetch, flights = createFlights({ env }), backupDir, backupFetch, merchantFetch } = {}) {
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
  const baseUrl = () => env.PUBLIC_URL?.replace(/\/+$/, '') || seenOrigin || 'http://localhost:3000';
  const profileUrl = () => `${baseUrl()}/.well-known/ucp`;
  // Signed approvals, and signed requests to stores (see signing.js).
  const signing = createSigning({ db, env, origin: baseUrl });
  const signRequest = (u) => signing.signRequest(u);
  app.decorate('signing', signing);
  const fulfiller = createFulfiller({ spot, provider, env, log: app.log, ...fulfill, ucp: { profileUrl, sign: signRequest, ...(fulfill.ucp || {}) } });
  // Paying the store directly: Spot builds the store's checkout, the payer pays there.
  spot.direct = createDirect({ profileUrl, sign: signRequest, ...(fulfill.ucp?.fetchImpl ? { fetchImpl: fulfill.ucp.fetchImpl } : {}), allowPrivate: Boolean(fulfill.ucp?.allowPrivate) });
  spot.onCardIssued = (cart) => fulfiller.autoStart(cart);
  // Card payments are only taken for carts Spot can actually buy. The
  // sandbox has no real stores, so everything is orderable there.
  spot.canOrder = (cart) => (provider.name === 'sandbox' ? true : fulfiller.canOrder(cart));
  app.addHook('onClose', async () => fulfiller.close());
  // Texts only go to numbers confirmed with a code (a phone sign-in identity).
  const notifier = createNotifier({ env, log: app.log, optouts: db.optouts, verified: (e164) => Boolean(db.identities.userId('phone', e164)), ...(notifyFetch ? { fetchImpl: notifyFetch } : {}) });
  // Nightly database backups (started from the entry point, not in tests).
  const backups = createBackups({ db, env, dir: backupDir || join(dirname(env.SPOT_DB || './data/spot.db'), 'backups'), notifier, log: app.log, ...(backupFetch ? { fetchImpl: backupFetch } : {}) });
  app.decorate('backups', backups);
  app.decorate('spot', spot);
  const events = createEvents({ db, spot, notifier, baseUrl: () => (env.PUBLIC_URL || '').replace(/\/+$/, '') || seenOrigin || 'http://localhost:3000', log: app.log });
  const approvals = createApprovals({ db, spot, signing, baseUrl, log: app.log });
  app.decorate('approvals', approvals);
  spot.emit = (kind, id, extra) => {
    // A person said yes: record a signed approval of exactly what they approved.
    if (kind === 'approved') return approvals.record(id, extra);
    return events.emit(kind, id, extra);
  };
  const publicUrl = () => (env.PUBLIC_URL || '').replace(/\/$/, '');
  const urlFor = (req, path) => `${publicUrl() || `${req.protocol}://${req.headers.host}`}${path}`;
  const captureUrl = capture.fromUrl || ((u) => captureFromUrl(u, { sign: signRequest }));
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
  let sweeps = 0;
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
    spot.sweepExpired();
    risk.sweep();
    db.sessions.prune();
    // Retries stuck refunds, refunds carts Spot couldn't order in time.
    if (++sweeps % 5 === 0) spot.sweepMoney().catch((err) => app.log.error({ err }, 'money sweep failed'));
    // Follows store checkouts that payers opened but haven't come back from.
    if (sweeps % 2 === 0) spot.sweepDirect().catch((err) => app.log.error({ err }, 'store checkout sweep failed'));
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
  // Keys that check Spot's signed approvals.
  app.get('/.well-known/spot-keys.json', async (req, reply) => reply.header('cache-control', 'public, max-age=3600').send(signing.approvalKeys()));
  // Keys that check Spot's signed requests to stores (Web Bot Auth directory).
  app.get('/.well-known/http-message-signatures-directory', async (req, reply) => {
    reply.headers({ 'content-type': 'application/http-message-signatures-directory+json', 'cache-control': 'public, max-age=3600', ...signing.signDirectory(urlFor(req, req.url)) });
    return JSON.stringify(signing.requestKeys());
  });
  // A signed approval, for a store, an agent or a person to check.
  app.get('/v1/approvals/:id', async (req) => {
    const a = db.approvals.get(String(req.params.id));
    if (!a) throw new CartError('Approval not found', 404);
    return { id: a.id, approval: a.jws, payload: approvals.read(a.jws), keys: urlFor(req, '/.well-known/spot-keys.json'), how_to_verify: 'EdDSA (Ed25519) JWS; the header kid names the key in spot-keys.json.' };
  });
  app.get('/approver/confirm', async (req, reply) => html(reply, approverConfirmPage({ origin: urlFor(req, '') })));
  app.get('/approvals/:id', async (req, reply) => {
    const a = db.approvals.get(String(req.params.id));
    const payload = a && approvals.read(a.jws);
    if (!payload) return html(reply, notFoundPage(), 404);
    return html(reply, approvalPage({ id: a.id, payload, jws: a.jws }));
  });
  app.get('/.well-known/ucp', async (req, reply) => reply.header('cache-control', 'public, max-age=300').send(platformProfile(urlFor(req, ''))));
  app.get('/signin', async (req, reply) => html(reply, signinPage({ origin: urlFor(req, ''), providers: oauth.available })));
  // The SMS opt-in page carriers review: the text sign-in, open and readable.
  app.get('/texts', async (req, reply) => html(reply, signinPage({ origin: urlFor(req, ''), providers: oauth.available, texts: true })));
  app.get('/account', async (req, reply) => {
    if (!accounts.userIdOf(req)) return reply.redirect('/signin?next=/account');
    reply.header('cache-control', 'no-store');
    return html(reply, accountPage({ origin: urlFor(req, ''), provider: provider.name }));
  });
  app.get('/terms', async (req, reply) => html(reply, termsPage({ origin: urlFor(req, ''), env })));
  app.get('/privacy', async (req, reply) => html(reply, privacyPage({ origin: urlFor(req, ''), env })));
  app.get('/integrations', async (req, reply) => html(reply, integrationsPage({ origin: urlFor(req, '') })));
  app.get('/agent-card', async (req, reply) => html(reply, agentCardPage({ origin: urlFor(req, '') })));

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
    const kinds = ['asker', 'agent', 'creator', 'store', ...COMING_SOON.map((c) => `notify:${c.slug}`)];
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
    // One store's part of a multi-store ask: the payer pays for all of it.
    const bundle = spot.bundleOf(cart);
    if (bundle) return reply.redirect(`/b/${bundle.token}`, 302);
    return html(reply, payPage({ cart: publicCart(cart), links: handoffLinks(cart), provider: provider.name, pageUrl: urlFor(req, `/c/${cart.token}`) }));
  });

  // The payer's receipt from Spot (linked from their receipt email): what
  // they bought, its status, and cancel-for-a-refund until it's ordered.
  app.get('/c/:token/receipt', async (req, reply) => {
    let cart;
    try {
      cart = spot.load(req.params.token);
      if (!spot.payerOk(cart.token, req.query.p)) throw new Error('bad link');
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, receiptPage({ token: cart.token }));
  });
  app.get('/v1/carts/:token/receipt', async (req, reply) => {
    const cart = spot.load(req.params.token);
    if (!spot.payerOk(cart.token, req.query.p)) throw new CartError('Cart not found', 404);
    reply.header('cache-control', 'no-store');
    const ordering = ['starting', 'working', 'awaiting_confirm', 'placed'].includes(cart.fulfillment?.state);
    return {
      cart: publicCart(cart),
      paid_at: cart.paid_at || null,
      ordered: cart.fulfillment?.state === 'placed' ? { order_number: cart.fulfillment.order_number || null, at: cart.fulfillment.placed_at || null } : null,
      refunded_cents: cart.refunded_cents || 0,
      refunds: (cart.refunds || []).map(({ reason, amount_cents, state, at }) => ({ reason, amount_cents, state, at })),
      can_cancel: ['paid', 'card_issued'].includes(cart.status) && cart.kind !== 'flight' && !ordering,
      approvals: approvals.summary(cart.id),
    };
  });
  app.post('/v1/carts/:token/receipt/cancel', async (req) => ({ cart: publicCart(await spot.payerCancel(req.params.token, req.body?.p)) }));

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
  // Does this store let the payer pay it directly (UCP checkout)?
  app.get('/v1/stores/check', async (req) => {
    const url = String(req.query.url || '');
    return { pay_at_store: url ? await spot.direct.supports(url) : false };
  });

  app.post('/v1/carts', async (req, reply) => {
    limits.create(req);
    // From a store's "Ask someone to pay" button: the store's cart, as sent.
    const fromStore = req.body?.draft_id ? merchants.fromDraft(req.body.draft_id) : null;
    const input = fromStore ? { ...req.body, ...fromStore.input } : req.body;
    if (input?.settle === 'direct' && !(await spot.direct.supports(input?.merchant?.url ?? input?.merchant_url))) {
      throw new CartError('This store doesn’t take direct checkout yet. Use a card link instead.', 409);
    }
    let { cart, manageKey } = spot.create(input, { ip: req.ip, userId: accounts.userIdOf(req) });
    if (fromStore) cart = spot.patch(cart.id, (c) => ({ ...c, source: fromStore.source }), 'from_store_button');
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

  // Pay the store directly: build the store's checkout and hand back its page.
  app.post('/v1/carts/:token/direct/start', async (req) => {
    limits.pay(req);
    const email = req.body?.email ? String(req.body.email).trim().toLowerCase().slice(0, 200) : null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CartError('That email looks wrong');
    return spot.directStart(req.params.token, { email, name: req.body?.name || null });
  });
  app.get('/v1/carts/:token/direct/status', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    return { cart: publicCart(await spot.directSync(req.params.token)) };
  });

  // ─── Multi-store asks (bundles) ──────────────────────────────────────────
  app.post('/v1/bundles', async (req, reply) => {
    limits.create(req);
    const { bundle, manageKey } = spot.createBundle(req.body, { ip: req.ip, userId: accounts.userIdOf(req) });
    reply.code(201);
    return { bundle: publicBundle(bundle), link: urlFor(req, `/b/${bundle.token}`), manage_link: urlFor(req, `/b/${bundle.token}/manage?k=${manageKey}`), manage_key: manageKey };
  });
  app.get('/v1/bundles/:token', async (req) => ({ bundle: publicBundle(spot.loadBundle(req.params.token)), provider: provider.name }));
  app.post('/v1/bundles/:token/pay', async (req) => {
    limits.pay(req);
    return spot.startBundlePayment(req.params.token);
  });
  app.post('/v1/bundles/:token/sandbox-pay', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    limits.pay(req);
    await spot.startBundlePayment(req.params.token);
    const b = spot.loadBundle(req.params.token);
    const name = String(req.body?.payer_name || '').trim().slice(0, 60) || null;
    const fingerprint = req.body?.test_card ? String(req.body.test_card).slice(0, 40) : null;
    const total = b.carts.reduce((n, c) => n + c.total_cents, 0);
    await spot.paymentSucceeded({ paymentRef: b.payment_ref, amountCents: total, payer: { name, fingerprint, email: req.body?.payer_email || null } });
    return { bundle: publicBundle(spot.loadBundle(req.params.token)) };
  });
  const ownerBundle = (req, b) => ({ bundle: publicBundle(b), stores: b.carts.map((c) => ownerCart(c)) });
  app.get('/v1/bundles/:token/manage', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    return ownerBundle(req, spot.loadBundleManaged(req.params.token, keyOf(req)));
  });
  app.post('/v1/bundles/:token/manage/prepare', async (req) => ownerBundle(req, spot.prepareBundle(req.params.token, keyOf(req), req.body?.shipping)));
  app.post('/v1/bundles/:token/manage/cancel', async (req) => ownerBundle(req, spot.cancelBundle(req.params.token, keyOf(req))));
  app.post('/v1/bundles/:token/manage/refund', async (req) => ownerBundle(req, await spot.refundBundle(req.params.token, { key: keyOf(req) })));
  app.get('/v1/bundles/:token/receipt', async (req, reply) => {
    const b = spot.loadBundle(req.params.token);
    if (!spot.payerOk(b.token, req.query.p)) throw new CartError('Not found', 404);
    reply.header('cache-control', 'no-store');
    const orderingNow = (c) => ['starting', 'working', 'awaiting_confirm', 'placed'].includes(c.fulfillment?.state);
    return {
      bundle: publicBundle(b),
      stores: b.carts.map((c) => ({
        token: c.token,
        status: c.status,
        ordered: c.fulfillment?.state === 'placed' ? { order_number: c.fulfillment.order_number || null } : null,
        refunded_cents: c.refunded_cents || 0,
        refund_reason: c.refund_reason || null,
        can_cancel: ['paid', 'card_issued'].includes(c.status) && !orderingNow(c),
        approvals: approvals.summary(c.id),
      })),
    };
  });
  app.post('/v1/bundles/:token/receipt/cancel', async (req) => ({ bundle: publicBundle(await spot.refundBundle(req.params.token, { p: String(req.body?.p || '') })) }));
  app.get('/b/:token', async (req, reply) => {
    let b;
    try {
      b = spot.loadBundle(req.params.token);
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, bundlePayPage({ bundle: publicBundle(b), provider: provider.name, pageUrl: urlFor(req, `/b/${b.token}`), cardUrl: urlFor(req, `/c/${b.carts[0].token}/card.png`) }));
  });
  // Link previews for a multi-store ask use its first store's card.
  app.get('/b/:token/card.png', async (req, reply) => {
    let b;
    try {
      b = spot.loadBundle(req.params.token);
    } catch {
      return reply.code(404).send();
    }
    return reply.redirect(`/c/${b.carts[0].token}/card.png${req.query.v ? `?v=${encodeURIComponent(req.query.v)}` : ''}`, 302);
  });
  app.get('/b/:token/manage', async (req, reply) => {
    try {
      spot.loadBundle(req.params.token);
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, bundleManagePage({ token: req.params.token, provider: provider.name }));
  });
  app.get('/b/:token/receipt', async (req, reply) => {
    let b;
    try {
      b = spot.loadBundle(req.params.token);
      if (!spot.payerOk(b.token, req.query.p)) throw new Error('bad link');
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    return html(reply, bundleReceiptPage({ token: b.token }));
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
    if (cart.settle === 'direct' && cart.direct?.checkout_id) cart = await spot.directSync(cart.token);
    return {
      cart: ownerCart(cart),
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
      // The owner's own saved card, for the one-tap Approve (funding.js).
      saved_card: (() => {
        const uid = accounts.userIdOf(req);
        if (!uid || cart.user_id !== uid || cart.for !== 'self' || cart.settle !== 'card' || cart.kind === 'flight' || cart.bundle_id) return null;
        const f = fundingOf(db, uid);
        return f && !(cart.agent && aiStopped(db, uid)) ? { label: cardLabel(f) } : null;
      })(),
    };
  });

  app.post('/v1/carts/:token/manage/prepare', async (req) => ({ cart: ownerCart(spot.prepare(req.params.token, keyOf(req), req.body?.shipping)) }));
  app.post('/v1/carts/:token/manage/travelers', async (req) => {
    const { cart, price_changed } = await spot.setTravelers(req.params.token, keyOf(req), req.body || {});
    return { cart: ownerCart(cart), price_changed };
  });
  app.post('/v1/carts/:token/manage/edit', async (req) => ({ cart: ownerCart(spot.edit(req.params.token, keyOf(req), req.body?.cart)) }));
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

  registerAgentApi(app, { spot, fulfiller, notifier, flights, db, provider, env, urlFor, approvals, capture: { url: captureUrl, text: captureText } });

  // Sandbox only: what the store does with Spot's card after checkout: charge
  // it (capture), refund a return, or release / reverse the authorization.
  app.post('/v1/sandbox/issuing', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    const cart = spot.loadManaged(req.body?.token, keyOf(req));
    const type = String(req.body?.type || '');
    const amount = Number(req.body?.amount_cents) || 0;
    const id = `sbx_${type}_${randomBytes(6).toString('hex')}`;
    let next;
    if (type === 'capture' || type === 'refund') next = await spot.recordIssuingTxn({ id, card: cart.card_ref, authorization: 'sbx_auth', type, amount: type === 'capture' ? -amount : amount, merchant: cart.merchant.name });
    else if (['closed', 'reversed', 'expired'].includes(type)) next = await spot.authorizationClosed({ id: 'sbx_auth', card: cart.card_ref, status: type, approved: true, transactions: [] });
    else throw new CartError('type is capture, refund, closed, reversed or expired');
    return { cart: ownerCart(next) };
  });

  app.post('/v1/sandbox/authorize', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    const cart = spot.loadManaged(req.body?.token, keyOf(req));
    const decision = spot.authorize(cart.card_ref, {
      amount_cents: Number(req.body?.amount_cents),
      currency: 'usd',
      merchant: { name: String(req.body?.merchant_name || ''), url: req.body?.merchant_url ? String(req.body.merchant_url) : null, category_code: req.body?.mcc ? String(req.body.mcc) : null },
    });
    return { ...decision, cart: ownerCart(spot.load(cart.token)) };
  });

  // ─── Stripe webhooks ──────────────────────────────────────────────────────
  const merchants = registerMerchants(app, { db, env, urlFor, cfg, ...(merchantFetch ? { fetchImpl: merchantFetch } : {}) });
  registerAdmin(app, { db, spot, env, urlFor, backups });
  const accounts = registerAccounts(app, { db, env, notifier, provider, urlFor, spot });
  registerFunding(app, { db, provider, spot, log: app.log });
  registerPasskeys(app, { db, urlFor });
  const oauth = registerOAuth(app, { db, env, urlFor, log: app.log, ...(oauthFetch ? { fetchImpl: oauthFetch } : {}) });

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
          merchant: { name: obj.merchant_data?.name, url: obj.merchant_data?.url, category: obj.merchant_data?.category, category_code: obj.merchant_data?.category_code },
        });
        await provider.answerAuthorization(obj.id, decision.approved);
        break;
      }
      // The store charged Spot's card, or refunded a return onto it.
      case 'issuing_transaction.created':
        await spot.recordIssuingTxn({
          id: obj.id,
          card: typeof obj.card === 'string' ? obj.card : obj.card?.id,
          authorization: typeof obj.authorization === 'string' ? obj.authorization : obj.authorization?.id || null,
          type: obj.type,
          amount: obj.amount,
          merchant: obj.merchant_data?.name || null,
        });
        break;
      // An authorization finished: captured, released, reversed or expired.
      case 'issuing_authorization.updated':
        if (['closed', 'reversed', 'expired'].includes(obj.status)) {
          await spot.authorizationClosed({
            id: obj.id,
            card: typeof obj.card === 'string' ? obj.card : obj.card?.id,
            status: obj.status,
            approved: Boolean(obj.approved),
            transactions: (obj.transactions || []).map((t) => ({ id: t.id, type: t.type, amount: t.amount, merchant: t.merchant_data?.name || null })),
          });
        }
        break;
      // The payer disputed their payment with their bank.
      case 'charge.dispute.created':
        if (obj.payment_intent) await spot.dispute(typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.payment_intent.id, obj.reason || null);
        break;
      default:
        break;
    }
    return { received: true };
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A restore asked for with SPOT_RESTORE_FROM happens before the database opens.
  await restoreOnBoot({ dbFile: process.env.SPOT_DB || './data/spot.db' }).catch((err) => {
    console.error(`Restore failed, starting with the current database: ${err.message}`);
  });
  const app = buildApp();
  app.backups.start();
  const port = Number(process.env.PORT || 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}

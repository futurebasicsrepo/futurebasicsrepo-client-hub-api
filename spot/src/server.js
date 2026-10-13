import { Resvg } from '@resvg/resvg-js';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import Fastify from 'fastify';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { CartError, config, handoffLinks } from './cart.js';
import { CaptureError, captureFromScreenshot, captureFromText, captureFromUrl, lookupCache, pageDetails, splitText, streamLookup } from './capture.js';
import { describePhoto, postAsk, postWarning, readPost, socialOf } from './social.js';
import { openDb } from './db.js';
import { approvalPage, bundleManagePage, bundlePayPage, bundleReceiptPage, homePage, managePage, notFoundPage, payPage, receiptPage } from './pages.js';
import { pickProvider } from './providers.js';
import { fetchProductImage, renderShareCard } from './sharecard.js';
import { appIconPng, appIconSvg, manifest } from './appicon.js';
import { sitePage } from './site.js';
import { privacyPage, termsPage } from './legal.js';
import { COMING_SOON, integrationsPage } from './integrations.js';
import { extensionZip, EXTENSION_VERSION } from './extension.js';
import { createSpot, ownerCart, publicBundle, publicCart } from './spot.js';
import { createFulfiller } from './fulfill/index.js';
import { registerAgentApi, shareMessage } from './agentapi.js';
import { createNotifier, normalizePhone } from './notify.js';
import { createFlights } from './flights.js';
import { createRisk } from './risk.js';
import { registerAdmin } from './admin.js';
import { createPriceWatch } from './pricewatch.js';
import { claimMessage, storeContact } from './priceclaim.js';
import { createStoreFacts, siteOf } from './storefacts.js';
import { createWatches } from './watches.js';
import { createReviews } from './reviews.js';
import { createCompare } from './compare.js';
import { createDelivery } from './delivery.js';
import { createPromos } from './promos.js';
import { createTracker } from './tracking.js';
import { getUcpOrder } from './fulfill/ucp.js';
import { cleanTaste, promptLine, summary as tasteSummary } from './taste.js';
import { registerAssets } from './assets.js';
import { registerMerchants } from './merchants.js';
import { createLiveChecks } from './livechecks.js';
import { createFunds } from './funds.js';
import { registerShopifyApp } from './shopifyapp.js';
import { needsSetup, registerAccounts, sessionUserId, sizesLine } from './accounts.js';
import { aiStopped, cardLabel, fundingOf, registerFunding } from './funding.js';
import { agentCardPage } from './agentcard.js';
import { accountPage, approverConfirmPage, setupPage, signinPage } from './accountpage.js';
import { registerOAuth } from './oauth.js';
import { registerMcpAuth } from './mcpauth.js';
import { poppyJson } from './pap.js';
import { createAffiliate } from './affiliate.js';
import { createEvents } from './events.js';
import { registerPasskeys } from './passkeys.js';
import { createBackups, restoreOnBoot } from './backup.js';
import { createDirect } from './direct.js';
import { createShopifyAuth } from './fulfill/shopifyauth.js';
import { createMetrics } from './metrics.js';
import { connectPage } from './connect.js';
import { standardsPage } from './standards.js';
import { createSigning } from './signing.js';
import { createApprovals } from './approvals.js';
import { platformProfile } from './fulfill/ucp.js';
import { gateOn, registerGate } from './early.js';
import { isStaff } from './staff.js';
import { createPush, SERVICE_WORKER } from './webpush.js';
import { createInvites } from './invites.js';

export function buildApp({ db = openDb(), provider = pickProvider(), cfg = config(), capture = {}, logger = true, fulfill = {}, env = process.env, notifyFetch, oauthFetch, flights = createFlights({ env }), backupDir, backupFetch, merchantFetch, papFetch, shopifyFetch, priceNowImpl, pushFetch } = {}) {
  const app = Fastify({ logger, bodyLimit: 256 * 1024, trustProxy: true });
  // Who's calling, for rate limits and risk checks. X-Forwarded-For is
  // whatever the caller sends, so it's never trusted: Railway's edge puts
  // the real client address in X-Real-IP, and that's the only one used.
  const behindEdge = Boolean(env.RAILWAY_ENVIRONMENT_ID || env.RAILWAY_PROJECT_ID || env.SPOT_BEHIND_PROXY === '1');
  // Counters and timings for /admin/health (metrics.js).
  const metrics = createMetrics(db);
  app.decorate('metrics', metrics);
  // Every caller of the payment provider is watched: card calls count as
  // Stripe Issuing, the rest as Stripe payments.
  const ISSUING = ['issueCard', 'revealCard', 'cancelCard', 'pauseCard', 'setCardLimit', 'answerAuthorization', 'activateCard', 'issuingAvailableCents'];
  provider = watched(provider, metrics, (key) => (ISSUING.includes(key) ? 'issuing' : 'stripe'));
  app.addHook('onResponse', async (req, reply) => {
    metrics.request(req.routeOptions?.url || 'unmatched', reply.statusCode, Math.round(reply.elapsedTime || 0));
  });
  app.addHook('onClose', async () => metrics.close());
  app.addHook('onRequest', async (req) => {
    const real = behindEdge ? String(req.headers['x-real-ip'] || '').trim() : '';
    if (real && isIP(real)) req.headers['x-forwarded-for'] = real;
    else delete req.headers['x-forwarded-for'];
  });
  // Every response: no framing (clickjacking on pay/approve/account pages),
  // no type sniffing, link tokens kept out of Referer, HTTPS only.
  app.addHook('onSend', async (req, reply, payload) => {
    // The Shopify admin page is the one page meant to be framed (by Shopify,
    // per its own frame-ancestors).
    if (!reply.hasHeader('x-frame-options') && !reply.embeddable) reply.header('x-frame-options', 'DENY');
    if (!reply.hasHeader('content-security-policy')) reply.header('content-security-policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    reply.header('x-content-type-options', 'nosniff');
    if (!reply.hasHeader('referrer-policy')) reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    if (behindEdge) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    return payload;
  });
  // Writes that act on a signed-in person's links: JSON from this site only,
  // so another site can't post a form at them with the person's cookie.
  app.addHook('preHandler', async (req) => {
    if (req.method !== 'POST' || !/^\/v1\/(carts|bundles)\/[^/]+\/manage\//.test(req.url)) return;
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('Send JSON', 415);
    const origin = req.headers.origin;
    if (origin && origin !== 'null') {
      const hostOf = (h) => {
        try {
          return new URL(h.includes('://') ? h : `http://${h}`).hostname;
        } catch {
          return '';
        }
      };
      const ours = [req.headers.host, req.headers['x-forwarded-host'], canonical?.host].filter(Boolean).map(hostOf);
      if (!ours.includes(hostOf(origin))) throw new CartError('Not allowed from another site', 403);
    }
  });
  const risk = createRisk({ db, env });
  // Early access is a controlled group: while the site is gated, invited and
  // staff accounts get the tester cap (SPOT_TEST_MAX_CART_CENTS) instead of
  // the per-ask cap. At launch (gate off) everyone is back on the cap.
  const capFor = (userId) => (cfg.testMaxCartCents && gateOn(env, behindEdge) && (isStaff(db, env, userId) || invites.userOk(userId)) ? cfg.testMaxCartCents : null);
  const spot = createSpot({ db, provider, flights: watched(flights, metrics, 'duffel'), risk, cfg, log: app.log, capFor });
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
  // Promo codes: found by AI per store, tried on the card and at checkout (promos.js).
  const promos = createPromos({ db, env, ...(capture.promoFind ? { find: capture.promoFind } : {}), ...(capture.promoTry ? { tryCodes: capture.promoTry } : {}), ...(capture.product ? { product: capture.product } : {}), onUsage: (model, usage) => (metrics.ok('anthropic'), metrics.ai(model, usage)), onError: (err) => metrics.fail('anthropic', err), log: app.log });
  const fulfiller = createFulfiller({ spot, provider, env, log: app.log, metrics, ...fulfill, ucp: { profileUrl, sign: signRequest, codesFor: (cart) => promos.forCart(cart), ...(fulfill.ucp || {}) } });
  // Paying the store directly: Spot builds the store's checkout, the payer pays there.
  const shopifyAuth = fulfill.shopifyAuth || createShopifyAuth({ env, log: console, metrics });
  spot.direct = createDirect({ profileUrl, sign: signRequest, shopifyAuth, ...(fulfill.ucp?.fetchImpl ? { fetchImpl: fulfill.ucp.fetchImpl } : {}), allowPrivate: Boolean(fulfill.ucp?.allowPrivate) || env.SPOT_ALLOW_PRIVATE_FETCH === '1' });
  spot.onCardIssued = (cart) => fulfiller.autoStart(cart);
  // Card payments are only taken for carts Spot can actually buy. The
  // sandbox has no real stores, so everything is orderable there.
  spot.canOrder = (cart) => (provider.name === 'sandbox' ? true : fulfiller.canOrder(cart));
  // The store's real total (shipping, tax) before anyone pays (direct.js).
  // With the payer on the page, Shopify stores price it at Spot's agent-token tier (higher limits).
  spot.quoter = (cart, ship, opts) => spot.direct.quote(cart, ship, opts);
  // Stores that can price their own checkout must, before a card is touched.
  spot.quotable = (cart) => (cart.merchant?.url ? spot.direct.supports(cart.merchant.url) : false);
  app.addHook('onClose', async () => fulfiller.close());
  // Texts only go to numbers confirmed with a code (a phone sign-in identity).
  // Phone and browser notifications, for accounts that turn them on (webpush.js).
  const push = createPush({ db, env, log: app.log, metrics, ...(pushFetch ? { fetchImpl: pushFetch } : {}) });
  const notifier = createNotifier({ env, log: app.log, metrics, push, optouts: db.optouts, verified: (e164) => Boolean(db.identities.userId('phone', e164)), ...(notifyFetch ? { fetchImpl: notifyFetch } : {}) });
  // Spot's card balance against what paid orders still need (funds.js).
  const funds = createFunds({ db, provider, notifier, env, log: app.log });
  spot.onLowFunds = (info) => funds.refused(info);
  // Early-access invites, sent from /admin (invites.js).
  const invites = createInvites(db);
  // Nightly database backups (started from the entry point, not in tests).
  const backups = createBackups({ db, env, dir: backupDir || join(dirname(env.SPOT_DB || './data/spot.db'), 'backups'), notifier, log: app.log, ...(backupFetch ? { fetchImpl: backupFetch } : {}) });
  app.decorate('backups', backups);
  app.decorate('spot', spot);
  const events = createEvents({ db, spot, notifier, baseUrl: () => (env.PUBLIC_URL || '').replace(/\/+$/, '') || seenOrigin || 'http://localhost:3000', log: app.log });
  const approvals = createApprovals({ db, spot, signing, baseUrl, log: app.log });
  // What a product card shows beyond the pick: options, sale and seen
  // prices, the store's price-adjustment and return policy (storefacts.js).
  const storeFacts = createStoreFacts({ db, ...(capture.policy ? { read: capture.policy } : {}), ...(capture.product ? { product: capture.product } : {}), onUsage: (model, usage) => (metrics.ok('anthropic'), metrics.ai(model, usage)), onError: (err) => metrics.fail('anthropic', err), log: app.log });
  app.decorate('storeFacts', storeFacts);
  // Daily price checks on Spot-card orders, for staff to claim drops (pricewatch.js),
  // for as long as the store's own policy allows.
  const priceWatch = createPriceWatch({ db, spot, ...(priceNowImpl ? { price: priceNowImpl } : {}), policyOf: (c) => storeFacts.known(siteOf(c.items?.find((i) => i?.url)?.url || c.merchant?.url || '')), log: app.log });
  app.decorate('priceWatch', priceWatch);
  // Where each order is (tracking.js): the store's own order status, or a tracking number pasted in.
  // Paid on the store's own checkout: asked through that checkout's connection (direct.js).
  const paidAtStore = (c) => c.fulfillment?.method === 'direct' && Boolean(c.direct?.endpoint && spot.direct);
  const ucpOrder = (c) => getUcpOrder({ storeUrl: c.merchant?.url, orderId: c.fulfillment.order_id, profileUrl: typeof profileUrl === 'function' ? profileUrl() : profileUrl, sign: signRequest, ...(fulfill.ucp?.fetchImpl ? { fetchImpl: fulfill.ucp.fetchImpl } : {}), ...(fulfill.ucp?.allowPrivate ? { allowPrivate: true } : {}) });
  const tracker = createTracker({
    db,
    spot,
    getOrder: capture.getOrder || ((c) => (paidAtStore(c) ? spot.direct.order(c.direct, c.fulfillment.order_id) : ucpOrder(c))),
    findOrderId: capture.findOrderId || (async (c) => (paidAtStore(c) ? (await spot.direct.status(c.direct)).order_id : null)),
    log: app.log,
  });
  app.decorate('tracker', tracker);
  // "Watch this": price drops and restocks on products a shopper picked (watches.js).
  const watches = createWatches({ db, notifier, baseUrl, ...(capture.watchPrice ? { price: capture.watchPrice } : {}), ...(capture.watchStock ? { stock: capture.watchStock } : {}), log: app.log });
  app.decorate('watches', watches);
  // Fit and reviews on a card, read by AI and kept two weeks (reviews.js).
  const reviews = createReviews({ db, ...(capture.reviews ? { read: capture.reviews } : {}), onUsage: (model, usage) => (metrics.ok('anthropic'), metrics.ai(model, usage)), onError: (err) => metrics.fail('anthropic', err), log: app.log });
  // "Arrives by": the store's own delivery dates to the shopper's address (delivery.js).
  const delivery = createDelivery({ ...(capture.product ? { product: capture.product } : {}), ...(capture.shipRates ? { rates: capture.shipRates } : {}), policyOf: (item) => storeFacts.whenKnown(siteOf(item.url), item.store || ''), log: app.log });
  // The same product cheaper at another store (compare.js).
  const compare = createCompare({ db, ...(capture.compare ? { find: capture.compare } : {}), ...(capture.comparePrice ? { price: capture.comparePrice } : {}), onUsage: (model, usage) => (metrics.ok('anthropic'), metrics.ai(model, usage)), onError: (err) => metrics.fail('anthropic', err), log: app.log });
  app.decorate('approvals', approvals);
  spot.emit = (kind, id, extra) => {
    // A person said yes: record a signed approval of exactly what they approved.
    if (kind === 'approved') return approvals.record(id, extra);
    return events.emit(kind, id, extra);
  };
  // "Powerblend Hoodie (Black / M)" typed on the check step: the part in
  // brackets is the size or colour.
  const splitVariant = (i) => {
    if (i?.variant || typeof i?.title !== 'string') return i;
    let title = i.title;
    const parts = [];
    for (let m; (m = title.match(/^(.*\S)\s*\(([^()]{1,60})\)\s*$/)); title = m[1]) parts.unshift(m[2].trim());
    return parts.length ? { ...i, title, variant: parts.join(' / ') } : i;
  };
  const publicUrl = () => (env.PUBLIC_URL || '').replace(/\/$/, '');
  const urlFor = (req, path) => `${publicUrl() || `${req.protocol}://${req.headers.host}`}${path}`;
  const affiliate = createAffiliate(env);
  const captureUrl = capture.fromUrl || ((u) => captureFromUrl(u, { sign: signRequest }));
  const aiHooks = { onUsage: (model, usage) => (metrics.ok('anthropic'), metrics.ai(model, usage)), onError: (err) => metrics.fail('anthropic', err) };
  const captureShot = capture.fromScreenshot || ((img) => captureFromScreenshot(img, aiHooks));
  const captureText = capture.fromText || ((t, o = {}) => captureFromText(t, { fromUrl: captureUrl, sizes: o.sizes, shipTo: o.shipTo, more: o.more, avoid: o.avoid, discover: o.discover, skipStores: o.skipStores, ...aiHooks }));
  // Discover mode: the stores a signed-in shopper sees most, to leave out.
  const storesSeenBy = (uid) => {
    if (!uid) return [];
    const n = new Map();
    for (const o of db.seen.list(uid)) {
      const site = siteOf(o.item?.url || o.merchant?.url || '');
      if (site) n.set(site, (n.get(site) || 0) + 1);
    }
    return [...n].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([site]) => site);
  };
  // A post shared from TikTok, Instagram, Pinterest…: what it shows, read
  // once per half hour (the shelf asks again for every batch).
  const posts = lookupCache({ max: 100 });
  const readShared = async (url) => {
    const hit = posts.get(url);
    if (hit) return hit;
    const post = await (capture.readPost || readPost)(url);
    if (!post) return post;
    post.seen = await (capture.describePhoto || describePhoto)(post, aiHooks).catch(() => '');
    posts.set(url, post);
    return post;
  };
  // The ask a shared post becomes: { text } to search for, or { post, warning }.
  const sharedAsk = async (text) => {
    const { url } = splitText(text);
    if (!url || !socialOf(url)) return { text };
    const post = await readShared(url);
    return post?.caption || post?.seen ? { text: postAsk(post, text), post } : { post, warning: postWarning(post || socialOf(url)) };
  };
  // A signed-in person's saved sizes, for lookups that don't name one.
  const sizesOf = (userId) => sizesLine(userId ? db.users.byId(userId)?.sizes : null);
  // Where their things ship ("Austin, TX"), so a lookup sticks to stores that deliver there.
  const shipToOf = (userId) => {
    const sh = userId ? db.users.byId(userId)?.shipping : null;
    // "Philadelphia," + "PA" reads "Philadelphia, PA", not "Philadelphia,, PA".
    const tidy = (x) => String(x || '').replace(/^[\s,]+|[\s,]+$/g, '');
    return sh?.city ? [tidy(sh.city), tidy(sh.state)].filter(Boolean).join(', ') : '';
  };

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
    // Stripe says why it refused (a missing customer, a key without access): keep that.
    else if (String(err?.type || '').startsWith('Stripe')) req.log.warn({ stripe: { type: err.type, code: err.code, message: err.message } }, 'stripe refused');
    // Spot's own errors are written for people (“nothing was charged, try again”), 5xx or not.
    reply.code(status).send({ error: status >= 500 && !(err instanceof CartError) ? 'Something went wrong' : err.message });
  });

  // Small fixed-window limiter; enough to stop a script hammering capture
  // (which costs a model call) or minting thousands of links. Some limits
  // give a signed-in account its own, larger allowance (`perAccount`):
  // one ask on the Shop page is several searches at once, and people on the
  // same Wi-Fi share an address.
  const hits = new Map();
  const limit = (key, max, windowMs, perAccount = 0) => (req) => {
    const uid = perAccount ? sessionUserId(db, req) : null;
    const k = uid ? `${key}:u:${uid}` : `${key}:${req.ip}`;
    const cap = uid ? perAccount : max;
    const now = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + windowMs });
    else if (++h.n > cap) throw new CartError('Too many requests, slow down', 429);
  };
  const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
  const limits = {
    capture: limit('capture', num(process.env.SPOT_CAPTURE_PER_10M, 30), 600_000, num(process.env.SPOT_CAPTURE_PER_10M_ACCOUNT, 150)),
    // Photos and stock for the picks on screen: a few per ask, so its own bucket.
    details: limit('details', 60, 600_000, 300),
    create: limit('create', Number(process.env.SPOT_CREATE_PER_10M || 20), 600_000),
    pay: limit('pay', 60, 600_000),
    // Wallet prices: one per card in view, more as the address changes.
    quote: limit('quote', Number(process.env.SPOT_QUOTE_PER_10M || 200), 600_000),
    thanks: limit('thanks', 20, 600_000),
    // Each of these makes Spot fetch from somewhere else.
    check: limit('check', 60, 600_000),
    // Card facts: one per batch of cards on screen, and once more for a new store's policy.
    facts: limit('facts', 300, 600_000),
    // Fit and reviews: an AI read per product not seen in two weeks. Promo
    // codes and other stores' prices are each their own read, and load on
    // their own for products in view (home.js), so each has its own bucket.
    reviews: limit('reviews', 40, 600_000, 120),
    promos: limit('promos', 40, 600_000, 120),
    compare: limit('compare', 40, 600_000, 120),
    card: limit('card', 120, 600_000),
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
    // Paid carts whose card didn't issue (a provider hiccup) get it once it works.
    spot.sweepIssue().catch((err) => app.log.error({ err }, 'issue sweep failed'));
    // Store prices on recent Spot-card orders, a few each half hour.
    if (sweeps % 30 === 0 && env.SPOT_PRICE_WATCH !== '0') priceWatch.sweep().catch((err) => app.log.error({ err }, 'price watch failed'));
    // Shipments of orders placed through agent checkout, a few every 30 minutes.
    if (sweeps % 30 === 15) tracker.sweep().catch((err) => app.log.error({ err }, 'tracking failed'));
    // Spot's card balance against paid orders, every half hour (funds.js).
    if (sweeps % 30 === 20) funds.check().catch((err) => app.log.error({ err }, 'funds check failed'));
    // Products shoppers are watching, a few every 10 minutes.
    if (sweeps % 10 === 0 && env.SPOT_PRICE_WATCH !== '0') watches.sweep().catch((err) => app.log.error({ err }, 'watches failed'));
  }, 60_000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  const html = (reply, body, code = 200) => reply.code(code).type('text/html; charset=utf-8').header('cache-control', 'no-store').send(body);

  app.get('/health', async () => ({ ok: true, provider: provider.name }));

  const homeJs = readFileSync(new URL('./client/home.js', import.meta.url));
  app.get('/client/home.js', async (req, reply) => reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300').send(homeJs));
  const walletJs = readFileSync(new URL('./client/wallet.js', import.meta.url));
  app.get('/client/wallet.js', async (req, reply) => reply.type('text/javascript; charset=utf-8').header('cache-control', 'public, max-age=300').send(walletJs));

  // ─── Pages ────────────────────────────────────────────────────────────────
  // ─── Website ──────────────────────────────────────────────────────────────
  // Until launch, the marketing pages show early access (early.js).
  registerGate(app, { db, env, behindEdge, origin: (req) => urlFor(req, ''), invites });
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
  // Personal Agent Protocol discovery (pap.js).
  app.get('/.well-known/poppy.json', async (req, reply) => reply.header('cache-control', 'public, max-age=300').header('access-control-allow-origin', '*').send(poppyJson(urlFor(req, ''))));
  app.get('/.well-known/ucp', async (req, reply) => reply.header('cache-control', 'public, max-age=300').send(platformProfile(urlFor(req, ''))));
  app.get('/signin', async (req, reply) => html(reply, signinPage({ origin: urlFor(req, ''), providers: oauth.available })));
  // The SMS opt-in page carriers review: the text sign-in, open and readable.
  app.get('/texts', async (req, reply) => html(reply, signinPage({ origin: urlFor(req, ''), providers: oauth.available, texts: true })));
  app.get('/account', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.redirect('/signin?next=/account');
    reply.header('cache-control', 'no-store');
    // Just signed in, nothing filled in yet: a few questions first. Only the
    // plain landing; a sign-in headed somewhere else (a pay link, an AI's
    // Allow) goes straight there.
    if (req.query.skip_setup === undefined && req.query.add === undefined && needsSetup(db.users.byId(uid))) return reply.redirect('/setup');
    return html(reply, accountPage({ origin: urlFor(req, ''), provider: provider.name }));
  });
  app.get('/setup', async (req, reply) => {
    if (!accounts.userIdOf(req)) return reply.redirect('/signin?next=/setup');
    reply.header('cache-control', 'no-store');
    return html(reply, setupPage({ origin: urlFor(req, '') }));
  });
  app.get('/terms', async (req, reply) => html(reply, termsPage({ origin: urlFor(req, ''), env })));
  app.get('/privacy', async (req, reply) => html(reply, privacyPage({ origin: urlFor(req, ''), env })));
  app.get('/integrations', async (req, reply) => html(reply, integrationsPage({ origin: urlFor(req, '') })));
  app.get('/connect', async (req, reply) => html(reply, connectPage({ origin: urlFor(req, '') })));
  app.get('/standards', async (req, reply) => html(reply, standardsPage({ origin: urlFor(req, '') })));
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
  registerAssets(app);
  app.get('/fonts/:file', async (req, reply) => {
    const f = Object.hasOwn(fonts, req.params.file) ? fonts[req.params.file] : null;
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
    const files = { 'card-open.png': 'open', 'card-covered.png': 'covered', 'card-agent.png': 'agent' };
    const which = Object.hasOwn(files, req.params.file) ? files[req.params.file] : null;
    if (!which) return reply.code(404).send();
    const cart = {
      open: demo,
      covered: { ...demo, status: 'card_issued', payer_name: 'Mom' },
      agent: { ...demo, merchant: { name: 'Trailhead Supply' }, items: [{ title: 'XT trail runners, black 10.5', quantity: 1, price_cents: 20000 }], cart_cents: 20800 },
    }[which];
    demoCards[which] ||= await renderShareCard(cart);
    return reply.type('image/png').header('cache-control', 'public, max-age=86400').send(demoCards[which]);
  });

  // Icons for browser tabs and crawlers: the Spot dot.
  const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#ff5a36"/></svg>`;
  const iconPng = {};
  const pngIcon = (size) => (iconPng[size] ||= new Resvg(ICON_SVG, { fitTo: { mode: 'width', value: size } }).render().asPng());
  const cacheDay = 'public, max-age=86400';
  app.get('/favicon.svg', async (req, reply) => reply.type('image/svg+xml').header('cache-control', cacheDay).send(ICON_SVG));
  app.get('/favicon.ico', async (req, reply) => reply.type('image/png').header('cache-control', cacheDay).send(pngIcon(48)));
  // Home screen: Spot himself, on a cream tile (iOS rounds the corners).
  for (const p of ['/apple-touch-icon.png', '/apple-touch-icon-precomposed.png']) app.get(p, async (req, reply) => reply.type('image/png').header('cache-control', cacheDay).send(appIconPng(180)));
  const appIcons = { 'icon-192.png': [192], 'icon-512.png': [512], 'icon-maskable-512.png': [512, { fill: 0.66 }] };
  for (const [file, spec] of Object.entries(appIcons)) app.get(`/${file}`, async (req, reply) => reply.type('image/png').header('cache-control', cacheDay).send(appIconPng(...spec)));
  // The service worker shows notifications; it must live at the root to cover every page.
  app.get('/sw.js', async (req, reply) => reply.type('text/javascript; charset=utf-8').header('cache-control', 'no-cache').send(SERVICE_WORKER));
  app.get('/v1/push/key', async () => ({ key: push.publicKey() }));
  app.post('/v1/me/push', async (req) => {
    const uid = accounts.userIdOf(req);
    if (!uid) throw new CartError('Sign in first', 401);
    if (!push.subscribe(uid, req.body?.subscription, req.headers['user-agent'])) throw new CartError('That notification setup didn’t work. Try turning them on again.');
    return { on: true, devices: push.devices(uid) };
  });
  app.post('/v1/me/push/remove', async (req) => {
    const uid = accounts.userIdOf(req);
    if (!uid) throw new CartError('Sign in first', 401);
    push.unsubscribe(uid, req.body?.endpoint);
    return { devices: push.devices(uid) };
  });
  app.post('/v1/me/push/test', async (req) => {
    const uid = accounts.userIdOf(req);
    if (!uid) throw new CartError('Sign in first', 401);
    limits.card(req);
    return { status: await push.toUser(uid, { title: 'Spot', body: 'Notifications are on 🧡 Price drops, “they paid” and your orders will show up here.', url: '/account', tag: 'test' }) };
  });
  app.get('/manifest.webmanifest', async (req, reply) => reply.type('application/manifest+json').header('cache-control', cacheDay).send(JSON.stringify(manifest())));
  // The logo, for app directories and partner portals.
  app.get('/logo.svg', async (req, reply) => reply.type('image/svg+xml').header('cache-control', cacheDay).send(appIconSvg({ bg: null, fill: 1 })));
  app.get('/logo.png', async (req, reply) => reply.type('image/png').header('cache-control', cacheDay).send(appIconPng(1200)));
  app.get('/robots.txt', async (req, reply) => reply.type('text/plain').header('cache-control', cacheDay).send(`User-agent: *\nDisallow: /c/\nDisallow: /b/\nDisallow: /account\nDisallow: /setup\nDisallow: /admin\nDisallow: /v1/\nDisallow: /oauth/\nDisallow: /approvals/\nAllow: /\n`));
  // Spot's crawler names this page in its user agent.
  app.get('/for-stores', async (req, reply) => reply.redirect('/#stores', 302));

  // Pages that don't exist: a page for people, JSON for programs.
  app.setNotFoundHandler(async (req, reply) => {
    if (['GET', 'HEAD'].includes(req.method) && String(req.headers.accept || '').includes('text/html')) return html(reply, notFoundPage(), 404);
    return reply.code(404).send({ error: 'Not found' });
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
  app.get('/new', async (req, reply) => html(reply, homePage({ origin: urlFor(req, ''), provider: provider.name, cfg: { ...cfg, maxCartCents: Math.max(cfg.maxCartCents, capFor(accounts.userIdOf(req)) || 0) } })));

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
    // A pay-at-store ask still waiting on an address its owner already saved
    // (asks made before Spot used it): fill it in, so the payer isn't stuck.
    if (cart.settle === 'direct' && cart.status === 'open' && !cart.requester.shipping && cart.user_id) {
      const owner = db.users.byId(cart.user_id);
      if (owner?.shipping) {
        try {
          cart = spot.prepare(cart.token, { userId: cart.user_id }, { ...owner.shipping, email: owner.shipping.email || owner.email || undefined });
        } catch {
          // Incomplete address: the owner finishes it on their page.
        }
      }
    }
    const commission = cart.settle === 'direct' && affiliate.covers(cart.merchant.url);
    return html(reply, payPage({ cart: publicCart(cart), links: handoffLinks(cart), provider: provider.name, pageUrl: urlFor(req, `/c/${cart.token}`), commission }));
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
      refunds: (cart.refunds || []).map(({ key, reason, amount_cents, state, at }) => ({ reason, amount_cents, state, at, ...(key === 'unused_hold' ? { held: true } : {}) })),
      can_cancel: ['paid', 'card_issued'].includes(cart.status) && cart.kind !== 'flight' && !ordering,
      approvals: approvals.summary(cart.id),
      // The requester's thank-you, for the payer's eyes (this link is theirs).
      thanks: cart.thanks ? { message: cart.thanks.message, emoji: cart.thanks.emoji || null, at: cart.thanks.at, from: cart.requester.name } : null,
    };
  });
  app.post('/v1/carts/:token/receipt/cancel', async (req) => ({ cart: publicCart(await spot.payerCancel(req.params.token, req.body?.p)) }));

  // Share-card image for link previews. Cached per cart state: it only
  // changes when the cart does (e.g. flips to "covered").
  const cards = new Map();
  app.get('/c/:token/card.png', async (req, reply) => {
    limits.card(req);
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
    return html(reply, managePage({ token: req.params.token, provider: provider.name, pk: provider.name === 'stripe' ? env.STRIPE_PUBLISHABLE_KEY || null : null }));
  });

  // ─── Capture ──────────────────────────────────────────────────────────────
  // Screenshots arrive as base64, so capture takes bigger bodies than the rest.
  app.post('/v1/capture', { bodyLimit: 8 * 1024 * 1024 }, async (req) => {
    limits.capture(req);
    const b = req.body || {};
    if (b.url) return captureUrl(String(b.url));
    // A follow-up ("find another", "in blue") carries what they said and the links already shown.
    if (b.text) {
      // Their saved sizes and where things ship go into every search, and
      // come back so the shelf can say what it used.
      const uid = accounts.userIdOf(req);
      const profile = { sizes: sizesOf(uid), ship_to: shipToOf(uid) };
      const shared = await sharedAsk(String(b.text));
      if (shared.warning) return { source: 'text', merchant: { name: '', url: null }, items: [], not_found: true, warning: shared.warning };
      const discover = b.discover === true;
      const d = await captureText(shared.text, { sizes: profile.sizes, shipTo: profile.ship_to, more: typeof b.more === 'string' ? b.more : '', avoid: Array.isArray(b.avoid) ? b.avoid.filter((u) => typeof u === 'string') : [], discover, skipStores: discover ? storesSeenBy(uid) : [] });
      return uid ? { ...d, profile } : d;
    }
    if (b.image?.data) {
      if (!process.env.ANTHROPIC_API_KEY && !capture.fromScreenshot) {
        throw new CaptureError('Screenshot capture is not configured on this server — paste a link or enter items');
      }
      return captureShot({ data: String(b.image.data), media_type: String(b.image.media_type || '') });
    }
    throw new CartError('Send a url or an image');
  });

  // The shelf's search, streamed: one line of JSON per pick as the model
  // writes it, then store-check updates, then "done" (streamLookup).
  const recent = lookupCache();
  app.post('/v1/capture/stream', async (req, reply) => {
    limits.capture(req);
    const b = req.body || {};
    const text = typeof b.text === 'string' ? b.text : '';
    if (!text.trim()) throw new CaptureError('Paste a link, drop a screenshot, or describe what you want');
    const uid = accounts.userIdOf(req);
    const profile = { sizes: sizesOf(uid), ship_to: shipToOf(uid) };
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
    // Every product shown goes on a signed-in shopper's Shop page too.
    let asked = text;
    const keep = (o) => {
      const it = o?.item;
      if (!it?.url || !it.image_url) return;
      db.seen.add(uid, it.url, { merchant: { name: o.merchant?.name || '', url: o.merchant?.url || '' }, item: { title: it.title, url: it.url, image_url: it.image_url, price_cents: it.price_cents || null, variant: it.variant || null, quantity: 1 }, stock: o.stock || 'unknown', why: o.why || null, asked: asked.slice(0, 120) });
    };
    const write = (e) => {
      if (uid) {
        try {
          if (e.type === 'pick') keep(e.option);
          else if (e.type === 'outfit') e.outfit.items.forEach(keep);
          else if (e.type === 'done') db.seen.prune(uid);
        } catch (err) {
          req.log.warn({ err }, 'shop page record');
        }
      }
      return reply.raw.destroyed || reply.raw.write(JSON.stringify(e) + '\n');
    };
    if (uid) write({ type: 'profile', profile });
    // A shared post: say where it's from, then search for what it shows.
    const shared = await sharedAsk(text).catch(() => ({ text }));
    if (shared.text && shared.text !== text) asked = `${shared.post.name}: ${shared.post.caption || shared.post.seen}`;
    if (shared.post) write({ type: 'post', name: shared.post.name, author: shared.post.author || '', caption: shared.post.caption || '', seen: shared.post.seen || '' });
    if (shared.warning) {
      write({ type: 'done', kind: null, count: 0, not_found: true, warning: shared.warning });
      return reply.raw.end();
    }
    const opts = {
      sizes: profile.sizes,
      shipTo: profile.ship_to,
      // What Spot has learned of their taste (taste.js), as a gentle hint.
      ...(uid ? { taste: promptLine(db.tastes.get(uid)) } : {}),
      more: typeof b.more === 'string' ? b.more : '',
      avoid: Array.isArray(b.avoid) ? b.avoid.filter((u) => typeof u === 'string') : [],
      count: Number(b.count) || undefined,
      // Shops they wouldn't find on their own (capture.js discoverLine).
      ...(b.discover === true ? { discover: true, skipStores: storesSeenBy(uid) } : {}),
    };
    try {
      await (capture.stream ? capture.stream(shared.text, opts, write) : streamLookup(shared.text, { ...opts, fromUrl: captureUrl, cache: recent, ...aiHooks }, write));
    } catch (err) {
      req.log.warn({ err }, 'stream lookup');
      write({ type: 'done', kind: null, count: 0, not_found: true, warning: err instanceof CaptureError ? err.message : 'Something went wrong. Try again' });
    }
    reply.raw.end();
  });

  // Spot's read on a shopper's taste (taste.js): learned in their browser,
  // kept on their account, and used to shape new searches.
  app.get('/v1/me/taste', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in first' });
    reply.header('cache-control', 'no-store');
    const taste = db.tastes.get(uid);
    return { taste, summary: tasteSummary(taste) };
  });
  app.post('/v1/me/taste', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in first' });
    limits.facts(req);
    if (req.body?.reset === true) {
      db.tastes.clear(uid);
      return { taste: null, summary: null };
    }
    const taste = cleanTaste(req.body?.taste);
    if (!taste) throw new CartError('Nothing to save');
    db.tastes.set(uid, taste);
    return { taste, summary: tasteSummary(taste) };
  });
  // Shop page clean-up: a whole collection (one ask) or one product.
  app.post('/v1/me/shop/remove', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in first' });
    const b = req.body || {};
    if (typeof b.asked === 'string') return { removed: db.seen.removeAsked(uid, b.asked.slice(0, 120)) };
    if (typeof b.url === 'string') return { removed: db.seen.removeUrl(uid, b.url.slice(0, 1000)) };
    throw new CartError('Which collection or product?');
  });
  // Reviews Spot already read, for sorting and filtering (no new AI reads).
  app.post('/v1/reviews/cached', async (req, reply) => {
    limits.facts(req);
    const urls = (Array.isArray(req.body?.urls) ? req.body.urls : []).filter((u) => typeof u === 'string').slice(0, 300);
    const out = {};
    for (const u of urls) {
      const d = db.reviews.get(u.slice(0, 1000));
      if (d && !d.none) out[u] = { rating: d.rating ?? null, count: d.count ?? null, fit: d.fit ?? null };
    }
    reply.header('cache-control', 'no-store');
    return { reviews: out };
  });

  // Card facts for the products on screen: options, the store's price now
  // and on sale, the prices Spot has seen, and the store's policies. A
  // store's policy is read once a month; until then policy_pending says ask
  // again in a bit.
  app.post('/v1/facts', async (req, reply) => {
    limits.facts(req);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const clean = items
      .filter((i) => i && typeof i.url === 'string' && /^https?:\/\//i.test(i.url))
      .map((i) => ({ url: i.url.slice(0, 1000), variant: typeof i.variant === 'string' ? i.variant.slice(0, 80) : '', store: typeof i.store === 'string' ? i.store.slice(0, 80) : '' }));
    reply.header('cache-control', 'no-store');
    return { facts: await storeFacts.facts(clean) };
  });

  // Fit and reviews for one product, with the shopper's size worked out
  // from their saved sizes when reviewers agree on how it fits.
  app.post('/v1/reviews', async (req, reply) => {
    limits.reviews(req);
    const b = req.body || {};
    const url = typeof b.url === 'string' ? b.url.slice(0, 1000) : '';
    if (!/^https?:\/\//i.test(url)) throw new CartError('That’s not a product link');
    const title = typeof b.title === 'string' ? b.title.slice(0, 140) : '';
    const uid = accounts.userIdOf(req);
    const sizes = (uid && db.users.byId(uid)?.sizes) || {};
    reply.header('cache-control', 'no-store');
    return { reviews: await reviews.forShopper({ url, title, store: typeof b.store === 'string' ? b.store.slice(0, 80) : '' }, sizes) };
  });

  // Arrives by: dates to the signed-in shopper's saved address, else the
  // store's usual shipping time.
  app.post('/v1/delivery', async (req, reply) => {
    limits.quote(req);
    const b = req.body || {};
    const url = typeof b.url === 'string' ? b.url.slice(0, 1000) : '';
    if (!/^https?:\/\//i.test(url)) throw new CartError('That’s not a product link');
    const uid = accounts.userIdOf(req);
    const sh = uid ? db.users.byId(uid)?.shipping : null;
    const ship = sh?.postal_code ? { city: sh.city || '', state: sh.state || '', postal_code: String(sh.postal_code) } : null;
    reply.header('cache-control', 'no-store');
    return { delivery: await delivery.arrives({ url, variant: typeof b.variant === 'string' ? b.variant.slice(0, 80) : '', store: typeof b.store === 'string' ? b.store.slice(0, 80) : '' }, ship) };
  });

  // Promo codes for one product: the ones that took money off it just now.
  app.post('/v1/promos', async (req, reply) => {
    limits.promos(req);
    const b = req.body || {};
    const url = typeof b.url === 'string' ? b.url.slice(0, 1000) : '';
    if (!/^https?:\/\//i.test(url)) throw new CartError('That’s not a product link');
    reply.header('cache-control', 'no-store');
    return { promos: await promos.forItem({ url, variant: typeof b.variant === 'string' ? b.variant.slice(0, 80) : '', store: typeof b.store === 'string' ? b.store.slice(0, 80) : '' }) };
  });

  // Cheaper elsewhere: the same product at other stores, under this price.
  app.post('/v1/compare', async (req, reply) => {
    limits.compare(req);
    const b = req.body || {};
    const url = typeof b.url === 'string' ? b.url.slice(0, 1000) : '';
    if (!/^https?:\/\//i.test(url)) throw new CartError('That’s not a product link');
    const title = typeof b.title === 'string' ? b.title.trim().slice(0, 140) : '';
    if (!title) throw new CartError('Which product?');
    const price = Number.isInteger(b.price_cents) && b.price_cents > 0 ? b.price_cents : null;
    reply.header('cache-control', 'no-store');
    return { compare: await compare.offers({ url, title, store: typeof b.store === 'string' ? b.store.slice(0, 80) : '', variant: typeof b.variant === 'string' ? b.variant.slice(0, 80) : '', price_cents: price }) };
  });

  // "Watch this": a signed-in shopper's watched products.
  app.get('/v1/me/watches', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in to watch prices' });
    reply.header('cache-control', 'no-store');
    return { watches: watches.list(uid) };
  });
  app.post('/v1/me/watches', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in to watch prices' });
    limits.check(req);
    return { watch: await watches.start(uid, req.body || {}) };
  });
  app.post('/v1/me/watches/:id/stop', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in first' });
    return { watch: watches.stop(uid, req.params.id) };
  });

  // The Shop page: every product Spot has shown this shopper, newest first.
  app.get('/v1/me/shop', async (req, reply) => {
    const uid = accounts.userIdOf(req);
    if (!uid) return reply.code(401).send({ error: 'Sign in to see everything Spot has shown you' });
    reply.header('cache-control', 'no-store');
    return { products: db.seen.list(uid) };
  });

  // Photos, stock and prices for product pages Spot's own reader was turned
  // away from (the shelf asks after it shows the picks).
  app.post('/v1/capture/details', async (req) => {
    limits.details(req);
    // Each page with the size or option picked for them, so stock is for that size.
    const urls = Array.isArray(req.body?.urls)
      ? req.body.urls.map((u) => (typeof u === 'string' ? u : u && typeof u.url === 'string' ? { url: u.url, variant: typeof u.variant === 'string' ? u.variant.slice(0, 80) : '', ...(typeof u.title === 'string' && u.title ? { title: u.title.slice(0, 140) } : {}) } : null)).filter(Boolean).slice(0, 8)
      : [];
    return capture.details ? capture.details(urls) : pageDetails(urls, aiHooks);
  });

  // ─── Carts ────────────────────────────────────────────────────────────────
  // Does this store let the payer pay it directly (UCP checkout)?
  app.get('/v1/stores/check', async (req) => {
    limits.check(req);
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
    // Paid on the store's own checkout: check the store takes this exact
    // cart (every item found, one size and colour, in stock) before a link exists.
    if (input?.settle === 'direct' && !fromStore && spot.direct.verify && Array.isArray(input.items)) {
      input.items = input.items.map(splitVariant);
      const merchant = { ...(input.merchant || {}), url: input.merchant?.url ?? input.merchant_url };
      const v = await spot.direct.verify({ merchant, items: input.items }, { buyerIp: req.ip });
      const store = merchant.name || 'The store';
      if (v.ok) input.items = v.items;
      else if (v.reason === 'choose') {
        const was = input.items.find((i) => i.title === v.item)?.variant;
        const eg = [was, v.choose.values[1] || v.choose.values[0]].filter(Boolean).join(' / ');
        throw new CartError(`Which ${v.choose.name.toLowerCase()}? ${store} has "${v.item}" in ${v.choose.values.join(', ')}. Add it after the name, like "${v.item} (${eg})".`, 422);
      }
      else if (v.reason === 'unavailable') throw new CartError(`${store} doesn’t have "${v.item}" in that size or color right now. Try another one.`, 422);
      else if (v.reason !== 'no_direct') throw new CartError(`${store} couldn’t find "${v.item}". Paste the product link instead.`, 422);
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
    // From the requester's own page (their key or session): they pay it themselves, so they're never thanked as the payer.
    let byRequester = false;
    try {
      byRequester = Boolean(spot.loadManaged(req.params.token, keyOf(req)));
    } catch {}
    const out = await spot.directStart(req.params.token, { email, name: req.body?.name || null, ip: req.ip, byRequester });
    // The payer goes to the store through the affiliate link, if the store has one.
    const a = affiliate.wrap(out.continue_url, { ref: req.params.token });
    if (a.via) db.event(spot.load(req.params.token).id, 'affiliate_link', { via: a.via });
    return { ...out, continue_url: a.url };
  });
  // Venmo / Cash App asks: the requester buys it themselves, so their trip to
  // the store can carry an affiliate tag (Amazon Associates, or the network).
  app.get('/c/:token/buy/:i', async (req, reply) => {
    let cart;
    try {
      cart = spot.load(req.params.token);
    } catch {
      return html(reply, notFoundPage(), 404);
    }
    const item = cart.settle === 'handoff' ? cart.items[Number(req.params.i) || 0] : null;
    if (!item?.url) return html(reply, notFoundPage(), 404);
    // Only for the person who made the link (their page passes its key):
    // otherwise spotmeplease.com would forward anyone to any address.
    try {
      spot.loadManaged(req.params.token, { k: req.query.k, userId: accounts.userIdOf(req) });
    } catch {
      return reply.redirect(`/c/${encodeURIComponent(cart.token)}`, 302);
    }
    const a = affiliate.wrap(item.url, { ref: cart.token });
    if (a.via) db.event(cart.id, 'affiliate_link', { via: a.via });
    return reply.redirect(a.url, 302);
  });
  app.get('/v1/carts/:token/direct/status', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    return { cart: publicCart(await spot.directSync(req.params.token)) };
  });

  // ─── Multi-store asks (bundles) ──────────────────────────────────────────
  // Apple Pay on a product card: what it comes to before any cart exists,
  // and for a city/state/ZIP, priced the way checkout will price it.
  app.post('/v1/quote', async (req) => {
    limits.quote(req);
    const r = await spot.previewTotals({ stores: req.body?.stores, shipping: req.body?.shipping || null, buyerIp: req.ip, userId: accounts.userIdOf(req) });
    return { ...r, publishable_key: provider.name === 'stripe' ? env.STRIPE_PUBLISHABLE_KEY || null : null };
  });
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
  app.post('/v1/bundles/:token/paid', async (req) => {
    limits.pay(req);
    const b = spot.loadBundle(req.params.token);
    if (b.status === 'open' && b.payment_ref && provider.retrievePayment) await spot.paidFromIntent(await provider.retrievePayment(b.payment_ref));
    return { status: spot.loadBundle(req.params.token).status };
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
    const b = spot.loadBundleManaged(req.params.token, keyOf(req));
    // Saved details to pre-fill the address, when the owner is signed in (as on a cart's page).
    const uid = accounts.userIdOf(req);
    const owner = b.carts[0]?.user_id;
    const u = uid && (!owner || owner === uid) ? db.users.byId(uid) : null;
    return { ...ownerBundle(req, b), profile: u ? { email: u.email, name: u.name || null, shipping: u.shipping || null } : null };
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
    return spot.startPayment(req.params.token, { ip: req.ip });
  });
  // The pay page, right after Stripe.js confirms: don't wait on the webhook.
  app.post('/v1/carts/:token/paid', async (req) => {
    limits.pay(req);
    const cart = await spot.checkPayment(req.params.token);
    return { status: cart.status };
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
    const done = await spot.paymentSucceeded({ paymentRef: cart.payment_ref, amountCents: cart.total_cents, payer: { name, fingerprint, email: req.body?.payer_email || null } });
    return { cart: publicCart(done) };
  });

  // Chip in: one person's part of the cart (a hold until the whole thing is covered).
  app.post('/v1/carts/:token/chip', async (req) => {
    limits.pay(req);
    const r = await spot.startChip(req.params.token, { cents: req.body?.cents, name: req.body?.name, email: req.body?.email, ip: req.ip });
    return { ...r, publishable_key: provider.name === 'stripe' ? env.STRIPE_PUBLISHABLE_KEY || null : null };
  });
  app.post('/v1/carts/:token/chip/paid', async (req) => {
    limits.pay(req);
    return { cart: publicCart(await spot.checkChip(req.params.token, String(req.body?.ref || ''))) };
  });
  app.post('/v1/carts/:token/chip/sandbox', async (req) => {
    if (provider.name !== 'sandbox') throw new CartError('Not available', 404);
    limits.pay(req);
    const r = await spot.startChip(req.params.token, { cents: req.body?.cents, name: req.body?.name, email: req.body?.email });
    const done = await spot.paymentSucceeded({ paymentRef: r.ref, amountCents: r.cents, payer: { name: req.body?.name || null, fingerprint: req.body?.test_card ? String(req.body.test_card).slice(0, 40) : null } });
    return { cart: publicCart(done) };
  });

  // ─── Requester (manage key) ───────────────────────────────────────────────
  app.post('/v1/carts/:token/manage/chip', async (req) => ({ cart: ownerCart(spot.setChipIn(req.params.token, keyOf(req), req.body?.on !== false)) }));
  // The private key from the link, or the signed-in owner's session.
  const keyOf = (req) => ({ k: req.body?.k || req.query?.k, userId: accounts.userIdOf(req) });

  app.get('/v1/carts/:token/manage', async (req) => {
    let cart = spot.loadManaged(req.params.token, keyOf(req));
    if (cart.status === 'paid') cart = await spot.issue(cart, { retry: true }); // retry a failed issue, once a minute
    if (cart.settle === 'direct' && cart.direct?.checkout_id) cart = await spot.directSync(cart.token);
    // Placed: where it is now, if the store answers within a few seconds.
    if (cart.fulfillment?.state === 'placed') {
      const was = cart;
      cart = await Promise.race([tracker.refresh(cart).catch(() => was), new Promise((r) => setTimeout(r, 4000, was).unref?.())]);
    }
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

  app.post('/v1/carts/:token/manage/prepare', async (req) => ({ cart: ownerCart(spot.prepare(req.params.token, keyOf(req), req.body?.shipping, { quoteId: req.body?.quote_id })) }));
  // Apple Pay on the cart's own page: the total for the ZIP the wallet shares.
  app.post('/v1/carts/:token/manage/quote', async (req) => {
    limits.quote(req);
    return spot.previewCart(req.params.token, keyOf(req), req.body?.shipping, { buyerIp: req.ip });
  });
  app.post('/v1/carts/:token/manage/reassign', async (req) => {
    const cart = spot.reassign(req.params.token, keyOf(req));
    const link = urlFor(req, `/c/${cart.token}`);
    return { cart: ownerCart(cart), link, share_message: shareMessage(cart, link) };
  });
  // Whoever got the link says they don't know the sender (or it's a scam).
  app.post('/v1/carts/:token/report', async (req) => {
    limits.pay(req);
    const by = createHash('sha256').update(`report:${req.ip}`).digest('hex').slice(0, 16);
    const cart = spot.report(req.params.token, { by, reason: req.body?.reason });
    return { ok: true, paused: Boolean(publicCart(cart).paused) };
  });
  app.post('/v1/carts/:token/decline', async (req) => {
    limits.pay(req);
    spot.decline(req.params.token, { name: req.body?.name });
    return { ok: true };
  });
  app.post('/v1/carts/:token/manage/pay-yourself', async (req) => ({ cart: ownerCart(spot.payYourself(req.params.token, keyOf(req))) }));
  app.post('/v1/carts/:token/manage/riders', async (req) => ({ cart: ownerCart(spot.setRiders(req.params.token, keyOf(req), req.body || {})) }));
  app.post('/v1/carts/:token/manage/travelers', async (req) => {
    const { cart, price_changed } = await spot.setTravelers(req.params.token, keyOf(req), req.body || {});
    return { cart: ownerCart(cart), price_changed };
  });
  app.post('/v1/carts/:token/manage/edit', async (req) => {
    const c = req.body?.cart;
    const input = c && Array.isArray(c.items) ? { ...c, items: c.items.map(splitVariant) } : c;
    return { cart: ownerCart(await spot.edit(req.params.token, keyOf(req), input)) };
  });
  // The requester says thanks to whoever paid. JSON only, so another site
  // can't post one for a signed-in requester.
  app.post('/v1/carts/:token/manage/thanks', async (req) => {
    limits.thanks(req);
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
    return { cart: ownerCart(spot.thank(req.params.token, keyOf(req), { message: req.body?.message, emoji: req.body?.emoji })) };
  });
  app.post('/v1/carts/:token/manage/received', async (req) => ({ cart: ownerCart(spot.markReceived(req.params.token, keyOf(req))) }));
  app.post('/v1/carts/:token/manage/cancel', async (req) => ({ cart: ownerCart(await spot.cancel(req.params.token, keyOf(req))) }));
  // Returns: the requester starts one; Spot gives them the store's own steps.
  app.post('/v1/carts/:token/manage/return', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    const url = cart.items?.find((i) => i?.url)?.url || cart.merchant?.url || '';
    const policy = await storeFacts.whenKnown(siteOf(url), cart.merchant?.name || '', 15000).catch(() => null);
    return { cart: ownerCart(spot.requestReturn(req.params.token, keyOf(req), req.body || {}, { policy })) };
  });
  // A tracking number from the store's shipping email.
  // The price dropped and the store refunds the difference: the customer
  // asks in one tap. Spot emails the store's customer service with them
  // copied (replies go to them); with no address found, they get the words
  // to send themselves, then tap again with { self: true }.
  app.post('/v1/carts/:token/manage/price-claim', async (req) => {
    limits.capture(req);
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    const u = cart.user_id ? db.users.byId(cart.user_id) : null;
    const customer = u?.email || cart.requester?.email || cart.requester?.shipping?.email || null;
    const customerName = cart.requester?.shipping?.name || cart.requester?.name || u?.name || '';
    const msg = () => claimMessage(db.byId(cart.id), { customerName, customerEmail: customer || '' });
    const send = async (c) => {
      const where = await (capture.storeContact || storeContact)(c.merchant?.url || c.items?.find((i) => i?.url)?.url, c.price_watch.policy);
      if (!where.email || !customer) return { message: msg(), contact_url: where.contact_url };
      const status = await notifier.sendStoreClaim({ to: where.email, customer, ...msg() });
      return status === 'sent' ? { sent: true, to: where.email } : { message: msg(), contact_url: where.contact_url };
    };
    const r = await priceWatch.claimByCustomer(cart.id, { send, self: req.body?.self === true });
    return { cart: ownerCart(r.cart), sent: r.sent, to: r.to || null, ...(r.sent ? {} : { message: r.message, contact_url: r.contact_url || null }) };
  });
  app.post('/v1/carts/:token/manage/tracking', async (req) => {
    const cart = spot.loadManaged(req.params.token, keyOf(req));
    if (cart.fulfillment?.state !== 'placed' && !cart.spent_at) throw new CartError('It hasn’t been ordered yet', 409);
    try {
      return { cart: ownerCart(tracker.addNumber(cart, req.body?.number)) };
    } catch (err) {
      throw new CartError(err.message, err.status || 400);
    }
  });
  app.post('/v1/carts/:token/manage/return/shipped', async (req) => ({ cart: ownerCart(spot.returnShipped(req.params.token, keyOf(req), req.body || {})) }));
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

  const mcpAuth = registerMcpAuth(app, { db, urlFor, papFetch });
  registerAgentApi(app, { spot, fulfiller, notifier, flights, db, provider, env, urlFor, approvals, mcpChallenge: mcpAuth.challenge, capture: { url: captureUrl, text: captureText, sizesOf } });

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
  registerShopifyApp(app, { db, env, urlFor, cfg, log: app.log, metrics, ...(shopifyFetch ? { fetchImpl: shopifyFetch } : {}) });
  // "Run checks" on /admin/health: every outside service, for real, at no cost.
  const liveChecks = createLiveChecks({
    env,
    provider,
    db,
    direct: spot.direct,
    shopifyAuth,
    backups,
    metrics,
    publicUrl: env.PUBLIC_URL || null,
    launchBrowser: fulfill.launch || (async () => (await import('playwright')).chromium.launch({ args: ['--no-sandbox'] })),
    ...(fulfill.liveFetch ? { fetchImpl: fulfill.liveFetch } : {}),
  });
  registerAdmin(app, { db, spot, env, urlFor, backups, metrics, fulfiller, liveChecks, invites, notifier, priceWatch });
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
      metrics.ok('stripe_webhook');
    } catch (err) {
      metrics.fail('stripe_webhook', 'bad signature');
      req.log.warn({ err }, 'bad stripe signature');
      return reply.code(400).send({ error: 'Bad signature' });
    }
    const obj = event.data.object;
    switch (event.type) {
      // The payer's card is held (or, for payments made before holds, charged).
      // A capture later sends payment_intent.succeeded again: by then the
      // cart has moved on, so it's a no-op.
      case 'payment_intent.amount_capturable_updated':
      case 'payment_intent.succeeded':
        await spot.paidFromIntent(obj, event.type);
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
  const db = openDb();
  const app = buildApp({ db });
  app.backups.start();
  const port = Number(process.env.PORT || 3000);
  app.listen({ port, host: '0.0.0.0' }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
  // Railway sends SIGTERM on every redeploy. Without a handler Node exits non-zero and
  // Railway reports a crash. Finish the requests in flight, close the database, exit 0.
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      const force = setTimeout(() => process.exit(0), 8000); // a request that never ends must not hold a deploy
      force.unref();
      try { await app.close(); } catch (err) { app.log.error({ err }, 'shutdown: server close failed'); }
      try { db.close(); } catch (err) { app.log.error({ err }, 'shutdown: database close failed'); }
      process.exit(0);
    });
  }
}

// Record success and failure of a service's calls for /admin/health, without
// changing what the calls do. Only functions are wrapped; plain fields pass through.
function watched(target, metrics, nameOf) {
  if (!target) return target;
  return new Proxy(target, {
    get(obj, key, recv) {
      const v = Reflect.get(obj, key, recv);
      if (typeof v !== 'function' || ['verifyWebhook', 'constructor'].includes(key)) return v;
      const name = typeof nameOf === 'function' ? nameOf(key) : nameOf;
      return function (...args) {
        let out;
        try {
          out = v.apply(obj, args);
        } catch (err) {
          metrics.fail(name, err);
          throw err;
        }
        if (out && typeof out.then === 'function') return out.then((x) => (metrics.ok(name), x), (err) => (metrics.fail(name, err), Promise.reject(err)));
        return out;
      };
    },
  });
}

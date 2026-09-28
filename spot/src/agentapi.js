// Spot for AI agents: "ask someone to pay for this, then order it".
//
// A shopping agent (ChatGPT, Claude, anything) can build a cart for its
// user but can't make someone *else* pay. Spot gives it three verbs, over
// REST and as an MCP server:
//
//   create_spot_ask   cart (or a link / description) → shareable pay link,
//                     or (for_me) a finish-on-your-phone link, texted/emailed
//   get_spot_ask      status: waiting, paid, ordering, ordered…
//   order_spot_ask    once paid, place the order at the store (the
//                     requester still confirms the final tap on their page)
//   search_flights    real fares from Duffel (or demo fares without a key)
//   create_flight_ask hold one fare and hand it to the user to finish on
//                     their phone: who's flying, pay, booked
//
// Auth: SPOT_API_KEYS="agentname:secret,other:secret2" for partners, plus
// self-serve keys from POST /v1/agent/keys (stored hashed, with daily
// quotas so a free key can't be used to spam texts). Each ask remembers
// which agent made it, and only that agent can read or order it.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CartError, usd } from './cart.js';
import { ownerCart, publicBundle, publicCart, storesLabel } from './spot.js';
import { emailLayout } from './notify.js';
import { approverOf, checkRules, monthStart } from './rules.js';

function apiKeys(env) {
  const out = [];
  for (const pair of String(env.SPOT_API_KEYS || '').split(',')) {
    const i = pair.indexOf(':');
    if (i > 0) out.push({ name: pair.slice(0, i).trim(), hash: createHash('sha256').update(pair.slice(i + 1).trim()).digest() });
  }
  return out;
}

export function registerAgentApi(app, { spot, fulfiller, notifier, flights, env, urlFor, capture, db, approvals }) {
  const approvals_ = approvals;
  const keys = apiKeys(env);
  const selfServe = env.SPOT_OPEN_KEYS !== 'off';

  function agentFor(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!keys.length && !selfServe) throw new CartError('The agent API is not enabled on this server', 401);
    if (!m) throw new CartError('Missing API key (Authorization: Bearer …). Get one free at /integrations#mcp', 401);
    const h = createHash('sha256').update(m[1].trim()).digest();
    const hit = keys.find((k) => timingSafeEqual(k.hash, h));
    if (hit) return hit.name;
    const row = selfServe && db?.keyByHash(h.toString('hex'));
    if (!row || row.revoked) throw new CartError('Bad API key', 401);
    // Keys made from an account put their asks in that account.
    req.spotUserId = row.user_id || null;
    return `key:${row.name}`;
  }

  // Daily quotas for self-serve keys (partners in SPOT_API_KEYS have none).
  const used = new Map();
  function quota(agent, what, max) {
    if (!agent.startsWith('key:')) return;
    const day = new Date().toISOString().slice(0, 10);
    const k = `${day}:${agent}:${what}`;
    const n = (used.get(k) || 0) + 1;
    if (n > max) throw new CartError(`Daily limit reached for this key (${max} ${what}). Email us for a higher limit.`, 429);
    used.set(k, n);
    if (used.size > 10_000) for (const key of used.keys()) if (!key.startsWith(day)) used.delete(key);
  }
  const QUOTA = { asks: Number(env.SPOT_KEY_ASKS_PER_DAY || 100), messages: Number(env.SPOT_KEY_MESSAGES_PER_DAY || 20), searches: Number(env.SPOT_KEY_SEARCHES_PER_DAY || 200) };

  // The AI activity log its owner sees on their account page.
  const note = (req, agent, kind, detail) => {
    try {
      db?.agentEvents?.add(agent, req.spotUserId, kind, detail);
    } catch {
      // Logging never blocks an ask.
    }
  };

  // The account's spending rules for this key (rules.js): refuse, or send
  // the ask to the account's approver instead of the user.
  function gate(req, agent, { cents, storeUrl, merchant, flight = false }) {
    if (!agent.startsWith('key:') || !db?.keyRules) return { route: false };
    const row = db.keyRules.get(agent.slice(4));
    const rules = row?.rules;
    if (!rules) return { route: false };
    const approver = flight ? null : approverOf(db, row.user_id);
    const spent = rules.monthly_cents ? db.agentMonthCents(agent, monthStart()) : 0;
    const urls = [].concat(storeUrl ?? null);
    let v = checkRules(flight ? { ...rules, stores: [] } : rules, { cents, storeUrl: urls[0], spentThisMonth: spent, hasApprover: Boolean(approver) });
    // Every store in a multi-store ask has to be on the list.
    if (v.ok && !flight && rules.stores?.length) {
      for (const u of urls.slice(1)) {
        const w = checkRules({ stores: rules.stores, approver: 'never' }, { cents: 0, storeUrl: u });
        if (!w.ok) {
          v = w;
          break;
        }
      }
    }
    if (!v.ok) {
      note(req, agent, 'blocked_by_rule', { reason: v.reason, merchant: merchant || null, cents });
      throw new CartError(`${v.reason}. Your user set this rule in their Spot account; they can change it there.`, 403);
    }
    return v.route ? { route: true, reason: v.reason, approver } : { route: false };
  }

  function owned(agent, askId) {
    let cart;
    try {
      cart = spot.load(askId);
    } catch (e) {
      // A multi-store ask: its id is the bundle's.
      const b = e.status === 404 && spot.loadBundle ? (() => { try { return spot.loadBundle(askId); } catch { return null; } })() : null;
      if (!b || b.carts[0]?.agent !== agent) throw new CartError('Ask not found', 404);
      return { ...b, __bundle: true };
    }
    if (cart.agent !== agent) throw new CartError('Ask not found', 404);
    return cart;
  }

  // Tell the approver about an ask their person's rules sent to them.
  async function sendToApprover(req, agent, g, { token, payLink, who, title, count, store, total }) {
    const sent = await notifier.send({ email: g.approver.email }, {
      subject: `${who}’s AI wants to buy ${title || 'something'} (${usd(total)})`,
      text: `${who}'s AI assistant put this together and ${who}'s rules send it to you: ${g.reason}. Pay for it, or ignore it and nothing is bought: ${payLink}`,
      html: emailLayout({
        preheader: `${g.reason}. Nothing is bought unless you pay.`,
        title: `Approve ${who}’s cart?`,
        lines: [`🤖 ${esc(who)}’s AI picked <b>${esc(title)}</b>${count > 1 ? ` +${count - 1} more` : ''} from ${esc(store)} · <b>${usd(total)}</b>.`, `Why it came to you: ${esc(g.reason)}.`, 'Pay for it and it ships to them, or ignore this and nothing is bought. Your yes is signed, so there’s a record of what you approved.'],
        cta: { label: 'Review and approve →', url: payLink },
        base: env.PUBLIC_URL,
      }),
    });
    note(req, agent, 'message_sent', { ask_id: token, to: 'approver', status: sent.email || 'not_sent' });
  }

  function view(req, cart, extra = {}) {
    if (cart.__bundle) return bundleView(req, cart, extra);
    const pub = publicCart(cart);
    const own = ownerCart(cart);
    const link = urlFor(req, `/c/${cart.token}`);
    const f = own.fulfillment;
    const fl = pub.flight;
    const next = fl ? {
      open: cart.flight.travelers
        ? 'Traveler details are in. Waiting for your user to pay on their phone.'
        : "Waiting for your user to open the link, add who's flying and pay.",
      paid: 'Paid. Booking with the airline now.',
      completed: `Booked. Confirmation code ${fl.booking_reference}. The airline emails the e-ticket to ${own.contact?.email || 'the traveler'}.`,
      expired: 'The fare expired before it was paid. Search again and send a fresh link.',
      canceled: 'Your user passed on this one.',
      refunded: `Not booked, and your user was refunded. ${fl.error || ''}`.trim(),
    }[cart.status] : {
      open: cart.approver
        ? `Sent to ${cart.approver.name || 'your user’s approver'} to approve (${cart.approver.reason}). They pay for it or turn it down; nothing is bought until they do.`
        : cart.settle === 'direct'
        ? (cart.for === 'self'
          ? `Waiting for your user to confirm shipping and pay ${cart.merchant.name} directly on its own checkout.`
          : cart.requester.shipping ? `Send the link to whoever will pay. They pay ${cart.merchant.name} directly on its own checkout; no Spot fee. Suggested message: "${shareMessage(cart, urlFor(req, `/c/${cart.token}`))}"` : 'The requester needs to add where it ships (on their private page) before anyone can pay.')
        : cart.for === 'self'
        ? 'Waiting for the requester to finish on their phone: confirm shipping, pay, then tap Place order.'
        : `Send the link to whoever will pay. Suggested message: "${shareMessage(cart, link)}"`,
      paid: 'Paid. Spot is getting ready to order; check back shortly.',
      card_issued: f?.state === 'awaiting_confirm'
        ? `The store's checkout is filled in (${usd(f.total_cents)}). The requester must confirm the final tap on their Spot page.`
        : f?.state === 'working' || f?.state === 'starting'
          ? 'Placing the order at the store now.'
          : f?.state === 'needs_you'
            ? `Automatic ordering stopped: ${f.reason}. Call order_spot_ask again to retry. If Spot can't order it within 3 days, the payer is refunded in full.`
            : 'Paid. Call order_spot_ask with the shipping address and Spot buys it from the store.',
      completed: f?.state === 'placed' ? `Ordered${f.order_number ? ` (order ${f.order_number})` : ''}. Done.` : 'Done: the store charged for the order.',
      expired: 'The link expired before anyone paid.',
      canceled: 'The requester canceled this ask.',
      refunding: 'Refunding the payer.',
      refunded: 'The payer was refunded.',
    }[cart.status];
    return {
      ask_id: cart.token,
      for: cart.for || 'other',
      status: cart.status,
      expires_at: new Date(cart.expires_at).toISOString(),
      link,
      share_message: shareMessage(cart, link),
      share_card_url: `${link}/card.png`,
      merchant: pub.merchant.name,
      items: pub.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, price_cents: i.price_cents })),
      cart_cents: pub.cart_cents,
      total_cents: pub.total_cents,
      payer_name: pub.payer_name,
      flight: fl ? { ...fl, error: undefined } : undefined,
      order: f ? { state: f.state, method: f.method, order_number: f.order_number || null, order_url: f.order_url || null, reason: f.reason || null, total_cents: f.total_cents ?? null } : null,
      next_step: next,
      sent_to_approver: cart.approver ? { name: cart.approver.name || null, reason: cart.approver.reason } : undefined,
      // Signed proof a person said yes (verify with /.well-known/spot-keys.json).
      approvals: approvals ? approvals.summary(cart.id) : undefined,
      approval_url: approvals?.summary(cart.id).at(-1)?.url || null,
      ...extra,
    };
  }

  // ─── Core verbs (shared by REST and MCP) ──────────────────────────────────
  async function createAsk(req, agent, input) {
    const b = input || {};
    if (Array.isArray(b.stores) && b.stores.length) return createBundleAsk(req, agent, b);
    quota(agent, 'asks', QUOTA.asks);
    if (b.for === 'self' && (b.notify?.email || b.notify?.phone)) quota(agent, 'messages', QUOTA.messages);
    let merchant = b.merchant;
    let items = b.items;
    let extras = b.extras_cents || 0;
    if (!Array.isArray(items) || !items.length) {
      const source = b.url || b.text;
      if (!source) throw new CartError('Give items, a url, or a text description');
      const draft = await capture.text(String(source));
      merchant = merchant || draft.merchant;
      items = draft.items;
      extras = extras || draft.extras_cents || 0;
      const missing = items.filter((i) => !i.price_cents).map((i) => i.title);
      if (missing.length || !merchant?.name) {
        const err = new CartError(`Couldn't confirm ${missing.length ? `the price of: ${missing.join(', ')}` : 'the store name'}. Call again with items (and merchant) filled in.`, 422);
        err.draft = { merchant, items };
        throw err;
      }
    }
    const goods = items.reduce((n, i) => n + Math.round(Number(i.price_cents) || 0) * (Math.round(Number(i.quantity)) || 1), 0) + (Math.round(Number(extras)) || 0);
    const gateUrl = merchant?.url || items.find((i) => i.url)?.url || null;
    const g = gate(req, agent, { cents: goods, storeUrl: gateUrl, merchant: merchant?.name });
    const user = g.route && req.spotUserId ? db.users.byId(req.spotUserId) : null;
    const forSelf = b.for === 'self' && !g.route;
    if (g.route) b.requester = { ...(b.requester || {}), name: user?.name || b.requester?.name || 'Your family member' };
    // Prefer the store as the seller: if it takes agent checkout (UCP), the
    // payer pays it directly and Spot never holds the money.
    const storeUrl = merchant?.url || items.find((i) => i.url)?.url;
    const direct = b.settle === 'direct' || (b.settle == null && storeUrl && (await spot.direct?.supports(storeUrl)));
    if (direct && !merchant?.url && storeUrl) merchant = { ...merchant, url: new URL(storeUrl).origin };
    const settle = direct ? 'direct' : forSelf ? 'card' : b.settle;
    const { cart, manageKey } = spot.create(
      { requester: b.requester, merchant, items, extras_cents: extras, note: b.note, settle, for: forSelf ? 'self' : 'other', expires_minutes: b.expires_minutes },
      { ip: req.ip, userId: req.spotUserId },
    );
    spot.patch(cart.id, (c) => ({ ...c, agent }), 'agent_created');
    if (forSelf && b.ship_to) spot.prepare(cart.token, manageKey, b.ship_to);
    note(req, agent, g.route ? 'ask_routed' : 'ask_created', { ask_id: cart.token, item: cart.items[0]?.title, merchant: cart.merchant.name, cents: cart.cart_cents, for: forSelf ? 'self' : 'other', ...(g.route ? { reason: g.reason } : {}) });
    if (g.route) {
      // Ship to the user (their saved address, or what the AI gave), then
      // hand the approver the pay link.
      const ship = b.ship_to || user?.shipping;
      if (ship) {
        try {
          spot.prepare(cart.token, manageKey, { ...ship, email: ship.email || user?.email });
        } catch {
          // They can add it on their page.
        }
      }
      spot.patch(cart.id, (c) => ({ ...c, approver: { name: g.approver.name, email: g.approver.email, reason: g.reason } }), 'sent_to_approver');
      await sendToApprover(req, agent, g, { token: cart.token, payLink: urlFor(req, `/c/${cart.token}`), who: cart.requester.name, title: cart.items[0]?.title, count: cart.items.length, store: cart.merchant.name, total: cart.total_cents });
    }
    const privateLink = urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`);
    const extra = forSelf
      ? { finish_link: privateLink, finish_link_note: `Private: send this only to your user. They open it on their phone to confirm shipping, pay and place the order.${req.spotUserId ? ' It is also waiting in their Spot account under "Ready for you".' : ''}` }
      : { requester_page: privateLink, requester_page_note: settle === 'direct' ? 'Private: give this only to the requester. They add where it ships there, which unlocks the link for whoever pays.' : 'Private: give this only to the requester. It is where they add the shipping address and confirm the order.' };
    // Remember how to reach the user for later updates (booked, ordered…).
    if (forSelf && (b.notify?.email || b.notify?.phone)) spot.patch(cart.id, (c) => ({ ...c, notify: { email: b.notify.email || null, phone: b.notify.phone || null } }));
    // An account's own AI with no delivery asked for: email the account.
    if (forSelf && req.spotUserId && !b.notify?.email && !b.notify?.phone) spot.emit('ready', cart.id);
    if (forSelf && (b.notify?.email || b.notify?.phone)) {
      extra.delivered = await notifier.sendFinishLink(spot.byId(cart.id), privateLink, { email: b.notify.email, phone: b.notify.phone });
      note(req, agent, 'message_sent', { ask_id: cart.token, to: 'user', status: extra.delivered });
    }
    return view(req, spot.byId(cart.id), extra);
  }

  async function searchFlights(input) {
    if (!flights) throw new CartError('Flights are not enabled on this server', 404);
    const offers = await flights.search(input);
    if (!offers.length) throw new CartError('No fares found for that search (Spot takes USD fares only for now)', 404);
    return {
      mode: flights.mode,
      offers: offers.map((o) => ({
        offer_id: o.id,
        airline: o.airline.name,
        total_cents: o.total_cents,
        price: usd(o.total_cents),
        expires_at: o.expires_at,
        refundable: o.conditions.refundable,
        slices: o.slices.map((sl) => ({ from: sl.from, to: sl.to, departing_at: sl.departing_at, arriving_at: sl.arriving_at, stops: sl.stops, flights: sl.segments.map((g) => g.flight).join(', ') })),
      })),
      next_step: 'Show your user the options. When they pick one, call create_flight_ask with its offer_id to hold it and send them a link to finish on their phone. Fares only hold for a short while.',
    };
  }

  async function createFlightAsk(req, agent, b = {}) {
    quota(agent, 'asks', QUOTA.asks);
    if (b.notify?.email || b.notify?.phone) quota(agent, 'messages', QUOTA.messages);
    if (!flights) throw new CartError('Flights are not enabled on this server', 404);
    // Selling flights with real money waits on a seller-of-travel decision
    // (registration, or the airline as merchant of record via Duffel). Until
    // then, live Stripe keys keep flights off unless SPOT_FLIGHTS_LIVE=on.
    if (String(env.STRIPE_SECRET_KEY || '').startsWith('sk_live_') && env.SPOT_FLIGHTS_LIVE !== 'on') throw new CartError('Flights aren’t available on Spot yet.', 403);
    if (!b.offer_id) throw new CartError('offer_id is required (from search_flights)');
    const offer = await flights.offer(String(b.offer_id));
    gate(req, agent, { cents: offer.total_cents, merchant: offer.airline?.name, flight: true });
    const { cart, manageKey } = spot.createFlight(
      offer,
      { requester: b.requester, note: b.note, expires_minutes: b.expires_minutes, travelers: b.travelers, contact: b.contact },
      { ip: req.ip, userId: req.spotUserId },
    );
    spot.patch(cart.id, (c) => ({ ...c, agent }), 'agent_created');
    note(req, agent, 'flight_ask', { ask_id: cart.token, item: cart.items[0]?.title, merchant: cart.merchant.name, cents: cart.cart_cents });
    const privateLink = urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`);
    const extra = { finish_link: privateLink, finish_link_note: `Private: send this only to your user. They open it on their phone, add who's flying, pay, and Spot books it.${req.spotUserId ? ' It is also waiting in their Spot account under "Ready for you".' : ''}` };
    if (b.notify?.email || b.notify?.phone) spot.patch(cart.id, (c) => ({ ...c, notify: { email: b.notify.email || null, phone: b.notify.phone || null } }));
    else if (req.spotUserId) spot.emit('ready', cart.id);
    if (b.notify?.email || b.notify?.phone) extra.delivered = await notifier.sendFinishLink(spot.byId(cart.id), privateLink, { email: b.notify.email, phone: b.notify.phone });
    return view(req, spot.byId(cart.id), extra);
  }

  // One ask across several stores: one link, one payment, Spot orders
  // from each store. Always paid on Spot (never at a store directly).
  async function createBundleAsk(req, agent, b) {
    quota(agent, 'asks', QUOTA.asks);
    if (b.for === 'self' && (b.notify?.email || b.notify?.phone)) quota(agent, 'messages', QUOTA.messages);
    const stores = b.stores.map((st) => ({ merchant: st.merchant, items: st.items, extras_cents: st.extras_cents }));
    const goods = stores.reduce((n, st) => n + (st.items || []).reduce((m, i) => m + Math.round(Number(i.price_cents) || 0) * (Math.round(Number(i.quantity)) || 1), 0) + (Math.round(Number(st.extras_cents)) || 0), 0);
    const urls = stores.map((st) => st.merchant?.url || (st.items || []).find((i) => i.url)?.url || null);
    const g = gate(req, agent, { cents: goods, storeUrl: urls, merchant: stores.map((st) => st.merchant?.name).join(', ') });
    const user = g.route && req.spotUserId ? db.users.byId(req.spotUserId) : null;
    const forSelf = b.for === 'self' && !g.route;
    const requester = g.route ? { ...(b.requester || {}), name: user?.name || b.requester?.name || 'Your family member' } : b.requester;
    const { bundle, manageKey } = spot.createBundle({ requester, note: b.note, for: forSelf ? 'self' : 'other', stores, expires_minutes: b.expires_minutes }, { ip: req.ip, userId: req.spotUserId });
    for (const c of bundle.carts) spot.patch(c.id, (x) => ({ ...x, agent }), 'agent_created');
    const ship = b.ship_to || (g.route ? user?.shipping : null);
    if (ship) {
      try {
        spot.prepareBundle(bundle.token, manageKey, { ...ship, email: ship.email || user?.email });
      } catch {
        // They can add it on their page.
      }
    }
    const pub = publicBundle(spot.loadBundle(bundle.token));
    note(req, agent, g.route ? 'ask_routed' : 'ask_created', { ask_id: bundle.token, item: pub.items[0]?.title, merchant: pub.merchant.name, cents: pub.cart_cents, for: forSelf ? 'self' : 'other', stores: pub.stores.length, ...(g.route ? { reason: g.reason } : {}) });
    if (g.route) {
      for (const c of bundle.carts) spot.patch(c.id, (x) => ({ ...x, approver: { name: g.approver.name, email: g.approver.email, reason: g.reason } }), 'sent_to_approver');
      await sendToApprover(req, agent, g, { token: bundle.token, payLink: urlFor(req, `/b/${bundle.token}`), who: requester.name, title: pub.items[0]?.title, count: pub.items.length, store: `${pub.stores.length} stores`, total: pub.total_cents });
    }
    const privateLink = urlFor(req, `/b/${bundle.token}/manage?k=${manageKey}`);
    const extra = forSelf
      ? { finish_link: privateLink, finish_link_note: 'Private: send this only to your user. They confirm where it ships, pay once for every store, then place each store’s order.' }
      : { requester_page: privateLink, requester_page_note: 'Private: give this only to the requester. It is where they add the shipping address and follow each store’s order.' };
    if (forSelf && (b.notify?.email || b.notify?.phone)) {
      extra.delivered = await notifier.sendFinishLink({ ...bundle.carts[0], items: pub.items, merchant: pub.merchant, total_cents: pub.total_cents }, privateLink, { email: b.notify.email, phone: b.notify.phone });
      note(req, agent, 'message_sent', { ask_id: bundle.token, to: 'user', status: extra.delivered });
    }
    return bundleView(req, { ...spot.loadBundle(bundle.token), __bundle: true }, extra);
  }

  function bundleView(req, b, extra = {}) {
    const pub = publicBundle(b);
    const link = urlFor(req, `/b/${b.token}`);
    const n = b.carts.length;
    const routed = b.carts[0]?.approver;
    const states = b.carts.map((c) => c.fulfillment?.state || null);
    const next = {
      open: routed
        ? `Sent to ${routed.name || 'your user’s approver'} to approve (${routed.reason}). They pay for it or turn it down; nothing is bought until they do.`
        : b.for === 'self'
          ? `Waiting for your user to confirm shipping and pay once for all ${n} stores.`
          : `Send the link to whoever will pay. One payment covers all ${n} stores. Suggested message: "${shareMessage({ items: pub.items, merchant: { name: `${n} stores` } }, link)}"`,
      paid: states.includes('needs_you')
        ? 'Paid. Some stores need a retry: call order_spot_ask again. A store Spot can’t order within 3 days is refunded to the payer; the others go ahead.'
        : 'Paid. Call order_spot_ask with the shipping address and Spot orders from each store; the requester confirms each one.',
      completed: 'Done: every store is ordered or refunded.',
      expired: 'The link expired before anyone paid.',
      canceled: 'The requester canceled this ask.',
      refunded: 'The payer was refunded for every store.',
    }[pub.status];
    const approvals = approvals_ ? b.carts.flatMap((c) => approvals_.summary(c.id)) : [];
    return {
      ask_id: b.token,
      kind: 'multi_store',
      for: b.for,
      status: pub.status,
      expires_at: new Date(pub.expires_at).toISOString(),
      link,
      share_message: shareMessage({ items: pub.items, merchant: { name: `${n} stores` } }, link),
      merchant: storesLabel(b.carts),
      stores: b.carts.map((c) => ({
        merchant: c.merchant.name,
        status: c.status,
        items: c.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, price_cents: i.price_cents })),
        cart_cents: c.cart_cents,
        total_cents: c.total_cents,
        order: c.fulfillment ? { state: c.fulfillment.state, order_number: c.fulfillment.order_number || null, order_url: c.fulfillment.order_url || null, reason: c.fulfillment.reason || null } : null,
      })),
      cart_cents: pub.cart_cents,
      total_cents: pub.total_cents,
      payer_name: pub.payer_name,
      next_step: next,
      sent_to_approver: routed ? { name: routed.name || null, reason: routed.reason } : undefined,
      approvals,
      approval_url: approvals.at(-1)?.url || null,
      ...extra,
    };
  }

  async function orderAsk(req, agent, askId, shipping) {
    const cart = owned(agent, askId);
    if (cart.__bundle) {
      // Order from every store that's paid and not ordered yet.
      const ready = cart.carts.filter((c) => c.status === 'card_issued' && !['starting', 'working', 'awaiting_confirm', 'placed'].includes(c.fulfillment?.state));
      if (!ready.length) throw new CartError(cart.status === 'open' ? 'Nobody has paid yet' : 'Nothing left to order', 409);
      for (const c of ready) {
        try {
          await fulfiller.start(c, shipping);
          note(req, agent, 'order_started', { ask_id: cart.token, item: c.items[0]?.title, merchant: c.merchant.name, cents: c.cart_cents });
        } catch (err) {
          // One store failing doesn't stop the others; its state says why.
          db?.event?.(c.id, 'order_start_failed', { message: err.message });
        }
      }
      return bundleView(req, { ...spot.loadBundle(cart.token), __bundle: true });
    }
    if (cart.kind === 'flight') throw new CartError('Flights are booked automatically once paid', 409);
    await fulfiller.start(cart, shipping);
    note(req, agent, 'order_started', { ask_id: cart.token, item: cart.items[0]?.title, merchant: cart.merchant.name, cents: cart.cart_cents });
    return view(req, spot.byId(cart.id));
  }

  // ─── Self-serve keys ──────────────────────────────────────────────────────
  // Shown once; only the hash is stored. A few per IP per hour.
  const minted = new Map();
  app.post('/v1/agent/keys', async (req, reply) => {
    if (!selfServe || !db) throw new CartError('Self-serve keys are off on this server. Email us for one.', 404);
    const hour = Math.floor(Date.now() / 3600_000);
    const k = `${hour}:${req.ip}`;
    if ((minted.get(k) || 0) >= 5) throw new CartError('Too many keys from here, try again later', 429);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new CartError('That email looks wrong');
    const slug = String(req.body?.agent_name || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'agent';
    const name = `${slug}-${randomBytes(3).toString('hex')}`;
    const key = `spot_${randomBytes(24).toString('base64url')}`;
    db.addKey(createHash('sha256').update(key).digest('hex'), name, email);
    db.joinWaitlist?.(email, 'agent');
    minted.set(k, (minted.get(k) || 0) + 1);
    if (minted.size > 5000) for (const x of minted.keys()) if (!x.startsWith(`${hour}:`)) minted.delete(x);
    reply.code(201);
    return {
      api_key: key,
      name,
      note: 'Save this now; Spot only keeps a hash. Send it as "Authorization: Bearer <key>".',
      mcp_url: urlFor(req, '/mcp'),
      limits_per_day: { asks: QUOTA.asks, messages: QUOTA.messages, flight_searches: QUOTA.searches },
    };
  });

  // ─── REST ─────────────────────────────────────────────────────────────────
  app.post('/v1/agent/asks', async (req, reply) => {
    const agent = agentFor(req);
    try {
      const out = await createAsk(req, agent, req.body);
      reply.code(201);
      return out;
    } catch (e) {
      if (e.draft) return reply.code(422).send({ error: e.message, draft: e.draft });
      throw e;
    }
  });
  app.get('/v1/agent/asks/:id', async (req) => view(req, owned(agentFor(req), req.params.id)));
  app.post('/v1/agent/flights/search', async (req) => {
    quota(agentFor(req), 'searches', QUOTA.searches);
    return searchFlights(req.body);
  });
  app.post('/v1/agent/flights/asks', async (req, reply) => {
    const out = await createFlightAsk(req, agentFor(req), req.body);
    reply.code(201);
    return out;
  });
  app.post('/v1/agent/asks/:id/order', async (req) => orderAsk(req, agentFor(req), req.params.id, req.body?.shipping));

  // ─── MCP (streamable HTTP, stateless) ─────────────────────────────────────
  const itemShape = z.object({
    title: z.string(),
    price_cents: z.number().int().positive().describe('Price of one unit in US cents'),
    quantity: z.number().int().min(1).max(20).default(1),
    variant: z.string().optional().describe('Size / colour, e.g. "Black / M"'),
    url: z.string().url().optional().describe('Product page URL; needed for automatic checkout'),
    image_url: z.string().url().optional(),
  });
  const shippingShape = z.object({
    name: z.string(),
    line1: z.string(),
    line2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postal_code: z.string(),
    email: z.string(),
    phone: z.string().optional(),
  });

  function mcpServer(req, agent) {
    const server = new McpServer({ name: 'spot', title: 'Spot', version: '0.3.0', websiteUrl: 'https://spotmeplease.com' });
    const reply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj });
    const fail = (e) => ({ content: [{ type: 'text', text: e.draft ? `${e.message}\nDraft: ${JSON.stringify(e.draft)}` : e.message }], isError: true });

    server.registerTool(
      'create_spot_ask',
      {
        title: 'Ask someone to pay for a cart',
        description:
          "Turn a shopping cart into a Spot link. By default it's for someone else (a parent, partner, friend) to pay in one tap; they buy it from Spot, and Spot orders exactly those items from the store and ships them to your user (nobody gets cash or a card). Gift cards and other cash equivalents can't be bought. If the store supports agent checkout (UCP), the payer instead pays the store directly on its own checkout, with no Spot fee (pay_at_store, on by default). Set for_me when your user will pay themselves: Spot texts/emails them a link to finish on their phone (confirm shipping, Apple Pay, then Spot places the order and they tap Place order). Pass items, or a product/cart url, or a text description. If your user set spending rules on their Spot account, asks outside them are refused with the reason, or sent to their approver to pay (see sent_to_approver).",
        inputSchema: {
          requester_name: z.string().describe('First name of the person asking (your user)'),
          requester_email: z.string().optional(),
          merchant_name: z.string().optional(),
          merchant_url: z.string().url().optional(),
          items: z.array(itemShape).max(25).optional(),
          stores: z
            .array(z.object({ merchant_name: z.string(), merchant_url: z.string().url().optional(), items: z.array(itemShape).min(1).max(25), extras_cents: z.number().int().min(0).optional() }))
            .min(2)
            .max(5)
            .optional()
            .describe('For a cart across several stores (2–5): one link and one payment, and Spot orders from each store. Use instead of items/merchant. Always paid on Spot.'),
          url: z.string().url().optional().describe('A product or cart page, if you have no item list'),
          text: z.string().optional().describe('A description like "black Salomon XT-6 size 10.5", if you have nothing else'),
          extras_cents: z.number().int().min(0).optional().describe('Estimated shipping + tax in cents'),
          note: z.string().max(280).optional().describe('A short note shown to the payer'),
          for_me: z.boolean().optional().describe('Your user pays for this themselves and finishes on their phone'),
          pay_at_store: z.boolean().optional().describe('Default: true when the store supports agent checkout (UCP). The payer pays the store directly; set false to have Spot buy it instead'),
          send_to_email: z.string().optional().describe('for_me: email the finish link here'),
          send_to_phone: z.string().optional().describe("for_me: text the finish link to this phone number. Only your user's own number, with their OK; they can reply STOP"),
          ship_to: shippingShape.optional().describe('for_me: shipping address, if you already know it (they can change it)'),
          expires_minutes: z.number().int().min(5).max(4320).optional().describe('How long the link stays valid, e.g. for a price that only holds briefly'),
        },
      },
      async (a) => {
        try {
          return reply(
            await createAsk(req, agent, {
              requester: { name: a.requester_name, email: a.requester_email },
              merchant: a.merchant_name ? { name: a.merchant_name, url: a.merchant_url } : undefined,
              items: a.items,
              stores: a.stores?.map((st) => ({ merchant: { name: st.merchant_name, url: st.merchant_url }, items: st.items, extras_cents: st.extras_cents })),
              url: a.url,
              text: a.text,
              extras_cents: a.extras_cents,
              note: a.note,
              for: a.for_me ? 'self' : 'other',
              settle: a.pay_at_store === false ? 'card' : a.pay_at_store === true ? 'direct' : undefined,
              notify: { email: a.send_to_email, phone: a.send_to_phone },
              ship_to: a.ship_to,
              expires_minutes: a.expires_minutes,
            }),
          );
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      'get_spot_ask',
      { title: 'Check a Spot ask', description: 'Status of an ask: waiting for a payer, paid, ordering, ordered. Includes the next step, and once a person says yes, their signed approval (approval_url; verify against /.well-known/spot-keys.json).', inputSchema: { ask_id: z.string() } },
      async ({ ask_id }) => {
        try {
          return reply(view(req, owned(agent, ask_id)));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      'order_spot_ask',
      {
        title: 'Order a paid Spot cart',
        description:
          "Once someone has paid (status card_issued), place the order at the store, shipped to the given address. Spot buys it from the store with its own card; the requester confirms the final tap on their Spot page. If the store blocks automation, call it again to retry; if Spot can't order within 3 days the payer is refunded.",
        inputSchema: { ask_id: z.string(), shipping: shippingShape },
      },
      async ({ ask_id, shipping }) => {
        try {
          return reply(await orderAsk(req, agent, ask_id, shipping));
        } catch (e) {
          return fail(e);
        }
      },
    );
    const traveler = z.object({
      given_name: z.string(),
      family_name: z.string(),
      born_on: z.string().describe('YYYY-MM-DD'),
      gender: z.enum(['m', 'f']).describe('As shown on their ID'),
    });

    server.registerTool(
      'search_flights',
      {
        title: 'Search flights',
        description:
          'Search real flight fares (via Duffel). Returns a few options, cheapest first plus the best nonstop, each with an offer_id. Airport or city codes (AUS, SFO, NYC, LON). Fares hold for a short time, so hand the chosen one to create_flight_ask promptly.',
        inputSchema: {
          origin: z.string().length(3).describe('IATA airport or city code'),
          destination: z.string().length(3),
          departure_date: z.string().describe('YYYY-MM-DD'),
          return_date: z.string().optional().describe('YYYY-MM-DD, for a round trip'),
          adults: z.number().int().min(1).max(6).optional(),
          cabin_class: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
          max_connections: z.number().int().min(0).max(2).optional().describe('0 for nonstop only'),
        },
      },
      async (a) => {
        try {
          quota(agent, 'searches', QUOTA.searches);
          return reply(await searchFlights(a));
        } catch (e) {
          return fail(e);
        }
      },
    );

    server.registerTool(
      'create_flight_ask',
      {
        title: 'Send your user a flight to finish on their phone',
        description:
          "Hold a fare from search_flights and get a private link for your user to finish on their phone: they check the itinerary, add who's flying (names as on ID, date of birth), pay with Apple Pay or card, and Spot books it with the airline and shows the confirmation code. Spot can text or email the link. Check progress with get_spot_ask.",
        inputSchema: {
          offer_id: z.string(),
          requester_name: z.string().describe("Your user's first name"),
          send_to_phone: z.string().optional().describe("Text the finish link to this number. Only your user's own number, with their OK; they can reply STOP"),
          send_to_email: z.string().optional().describe('Email the finish link here'),
          note: z.string().max(280).optional().describe('Shown on the finish page, e.g. why you picked this one'),
          travelers: z.array(traveler).max(6).optional().describe("Prefill who's flying, if you know it (one per passenger, in order)"),
          contact_email: z.string().optional(),
          contact_phone: z.string().optional(),
        },
      },
      async (a) => {
        try {
          return reply(
            await createFlightAsk(req, agent, {
              offer_id: a.offer_id,
              requester: { name: a.requester_name, email: a.contact_email },
              note: a.note,
              travelers: a.travelers,
              contact: a.contact_email || a.contact_phone ? { email: a.contact_email, phone: a.contact_phone } : undefined,
              notify: { email: a.send_to_email, phone: a.send_to_phone },
            }),
          );
        } catch (e) {
          return fail(e);
        }
      },
    );
    return server;
  }

  app.post('/mcp', async (req, reply) => {
    let agent;
    try {
      agent = agentFor(req);
    } catch (e) {
      return reply.code(401).send({ jsonrpc: '2.0', error: { code: -32001, message: e.message }, id: null });
    }
    const server = mcpServer(req, agent);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    reply.raw.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
  const noSession = async (req, reply) => reply.code(405).header('allow', 'POST').send({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed: this server is stateless, use POST' }, id: null });
  app.get('/mcp', noSession);
  app.delete('/mcp', noSession);
}

export function shareMessage(cart, link) {
  const first = cart.items[0]?.title || 'something';
  return `psst… can you spot me? 👀 ${first}${cart.merchant?.name ? ` from ${cart.merchant.name}` : ''}\n${link}`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

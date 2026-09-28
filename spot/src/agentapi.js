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
import { ownerCart, publicCart } from './spot.js';

function apiKeys(env) {
  const out = [];
  for (const pair of String(env.SPOT_API_KEYS || '').split(',')) {
    const i = pair.indexOf(':');
    if (i > 0) out.push({ name: pair.slice(0, i).trim(), hash: createHash('sha256').update(pair.slice(i + 1).trim()).digest() });
  }
  return out;
}

export function registerAgentApi(app, { spot, fulfiller, notifier, flights, env, urlFor, capture, db }) {
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

  function owned(agent, askId) {
    const cart = spot.load(askId);
    if (cart.agent !== agent) throw new CartError('Ask not found', 404);
    return cart;
  }

  function view(req, cart, extra = {}) {
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
      open: cart.for === 'self'
        ? 'Waiting for the requester to finish on their phone: confirm shipping, pay, then tap Place order.'
        : `Send the link to whoever will pay. Suggested message: "${shareMessage(cart, link)}"`,
      paid: 'Paid. The requester is setting up their card; check back shortly.',
      card_issued: f?.state === 'awaiting_confirm'
        ? `The store's checkout is filled in (${usd(f.total_cents)}). The requester must confirm the final tap on their Spot page.`
        : f?.state === 'working' || f?.state === 'starting'
          ? 'Placing the order at the store now.'
          : f?.state === 'needs_you'
            ? `Automatic checkout stopped: ${f.reason}. The requester can check out themselves from their Spot page.`
            : 'Paid and the one-time card is ready. Call order_spot_ask with the shipping address to place the order.',
      completed: f?.state === 'placed' ? `Ordered${f.order_number ? ` (order ${f.order_number})` : ''}. Done.` : 'Done: the card was used at the store.',
      expired: 'The link expired before anyone paid.',
      canceled: 'The requester canceled this ask.',
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
      ...extra,
    };
  }

  // ─── Core verbs (shared by REST and MCP) ──────────────────────────────────
  async function createAsk(req, agent, input) {
    const b = input || {};
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
    const forSelf = b.for === 'self';
    const { cart, manageKey } = spot.create(
      { requester: b.requester, merchant, items, extras_cents: extras, note: b.note, settle: forSelf ? 'card' : b.settle, for: forSelf ? 'self' : 'other', expires_minutes: b.expires_minutes },
      { ip: req.ip, userId: req.spotUserId },
    );
    spot.patch(cart.id, (c) => ({ ...c, agent }), 'agent_created');
    if (forSelf && b.ship_to) spot.prepare(cart.token, manageKey, b.ship_to);
    const privateLink = urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`);
    const extra = forSelf
      ? { finish_link: privateLink, finish_link_note: `Private: send this only to your user. They open it on their phone to confirm shipping, pay and place the order.${req.spotUserId ? ' It is also waiting in their Spot account under "Ready for you".' : ''}` }
      : { requester_page: privateLink, requester_page_note: 'Private: give this only to the requester. It shows their card and is where they confirm the order.' };
    // Remember how to reach the user for later updates (booked, ordered…).
    if (forSelf && (b.notify?.email || b.notify?.phone)) spot.patch(cart.id, (c) => ({ ...c, notify: { email: b.notify.email || null, phone: b.notify.phone || null } }));
    // An account's own AI with no delivery asked for: email the account.
    if (forSelf && req.spotUserId && !b.notify?.email && !b.notify?.phone) spot.emit('ready', cart.id);
    if (forSelf && (b.notify?.email || b.notify?.phone)) {
      extra.delivered = await notifier.sendFinishLink(spot.byId(cart.id), privateLink, { email: b.notify.email, phone: b.notify.phone });
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
    if (!b.offer_id) throw new CartError('offer_id is required (from search_flights)');
    const offer = await flights.offer(String(b.offer_id));
    const { cart, manageKey } = spot.createFlight(
      offer,
      { requester: b.requester, note: b.note, expires_minutes: b.expires_minutes, travelers: b.travelers, contact: b.contact },
      { ip: req.ip, userId: req.spotUserId },
    );
    spot.patch(cart.id, (c) => ({ ...c, agent }), 'agent_created');
    const privateLink = urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`);
    const extra = { finish_link: privateLink, finish_link_note: `Private: send this only to your user. They open it on their phone, add who's flying, pay, and Spot books it.${req.spotUserId ? ' It is also waiting in their Spot account under "Ready for you".' : ''}` };
    if (b.notify?.email || b.notify?.phone) spot.patch(cart.id, (c) => ({ ...c, notify: { email: b.notify.email || null, phone: b.notify.phone || null } }));
    else if (req.spotUserId) spot.emit('ready', cart.id);
    if (b.notify?.email || b.notify?.phone) extra.delivered = await notifier.sendFinishLink(spot.byId(cart.id), privateLink, { email: b.notify.email, phone: b.notify.phone });
    return view(req, spot.byId(cart.id), extra);
  }

  async function orderAsk(req, agent, askId, shipping) {
    const cart = owned(agent, askId);
    if (cart.kind === 'flight') throw new CartError('Flights are booked automatically once paid', 409);
    await fulfiller.start(cart, shipping);
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
    const server = new McpServer({ name: 'spot', title: 'Spot', version: '0.2.0', websiteUrl: 'https://spotmeplease.com' });
    const reply = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj });
    const fail = (e) => ({ content: [{ type: 'text', text: e.draft ? `${e.message}\nDraft: ${JSON.stringify(e.draft)}` : e.message }], isError: true });

    server.registerTool(
      'create_spot_ask',
      {
        title: 'Ask someone to pay for a cart',
        description:
          "Turn a shopping cart into a Spot link. By default it's for someone else (a parent, partner, friend) to pay in one tap; their money goes onto a one-time card that only works at that store. Set for_me when your user will pay themselves: Spot texts/emails them a link to finish on their phone (confirm shipping, Apple Pay, then Spot places the order and they tap Place order). Pass items, or a product/cart url, or a text description.",
        inputSchema: {
          requester_name: z.string().describe('First name of the person asking (your user)'),
          requester_email: z.string().optional(),
          merchant_name: z.string().optional(),
          merchant_url: z.string().url().optional(),
          items: z.array(itemShape).max(25).optional(),
          url: z.string().url().optional().describe('A product or cart page, if you have no item list'),
          text: z.string().optional().describe('A description like "black Salomon XT-6 size 10.5", if you have nothing else'),
          extras_cents: z.number().int().min(0).optional().describe('Estimated shipping + tax in cents'),
          note: z.string().max(280).optional().describe('A short note shown to the payer'),
          for_me: z.boolean().optional().describe('Your user pays for this themselves and finishes on their phone'),
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
              url: a.url,
              text: a.text,
              extras_cents: a.extras_cents,
              note: a.note,
              for: a.for_me ? 'self' : 'other',
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
      { title: 'Check a Spot ask', description: 'Status of an ask: waiting for a payer, paid, ordering, ordered. Includes the next step.', inputSchema: { ask_id: z.string() } },
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
          "Once someone has paid (status card_issued), place the order at the store, shipped to the given address. Spot fills the store's checkout with the one-time card; the requester confirms the final tap on their Spot page. If the store blocks automation, they get a prefilled checkout link instead.",
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

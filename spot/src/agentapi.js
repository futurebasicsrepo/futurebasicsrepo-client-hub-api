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
//
// Auth: SPOT_API_KEYS="agentname:secret,other:secret2". Each ask remembers
// which agent made it, and only that agent can read or order it.
import { createHash, timingSafeEqual } from 'node:crypto';
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

export function registerAgentApi(app, { spot, fulfiller, notifier, env, urlFor, capture }) {
  const keys = apiKeys(env);

  function agentFor(req) {
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    if (!keys.length) throw new CartError('The agent API is not enabled on this server', 401);
    if (!m) throw new CartError('Missing API key (Authorization: Bearer …)', 401);
    const h = createHash('sha256').update(m[1].trim()).digest();
    const hit = keys.find((k) => timingSafeEqual(k.hash, h));
    if (!hit) throw new CartError('Bad API key', 401);
    return hit.name;
  }

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
    const next = {
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
      order: f ? { state: f.state, method: f.method, order_number: f.order_number || null, reason: f.reason || null, total_cents: f.total_cents ?? null } : null,
      next_step: next,
      ...extra,
    };
  }

  // ─── Core verbs (shared by REST and MCP) ──────────────────────────────────
  async function createAsk(req, agent, input) {
    const b = input || {};
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
      { ip: req.ip },
    );
    spot.patch(cart.id, (c) => ({ ...c, agent }), 'agent_created');
    if (forSelf && b.ship_to) spot.prepare(cart.token, manageKey, b.ship_to);
    const privateLink = urlFor(req, `/c/${cart.token}/manage?k=${manageKey}`);
    const extra = forSelf
      ? { finish_link: privateLink, finish_link_note: 'Private: send this only to your user. They open it on their phone to confirm shipping, pay and place the order.' }
      : { requester_page: privateLink, requester_page_note: 'Private: give this only to the requester. It shows their card and is where they confirm the order.' };
    if (forSelf && (b.notify?.email || b.notify?.phone)) {
      extra.delivered = await notifier.sendFinishLink(spot.byId(cart.id), privateLink, { email: b.notify.email, phone: b.notify.phone });
    }
    return view(req, spot.byId(cart.id), extra);
  }

  async function orderAsk(req, agent, askId, shipping) {
    const cart = owned(agent, askId);
    await fulfiller.start(cart, shipping);
    return view(req, spot.byId(cart.id));
  }

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
    const server = new McpServer({ name: 'spot', version: '0.1.0' });
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
          send_to_phone: z.string().optional().describe('for_me: text the finish link to this phone number'),
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

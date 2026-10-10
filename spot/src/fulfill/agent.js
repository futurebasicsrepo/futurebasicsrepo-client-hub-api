// The checkout agent: Claude drives a real browser through a store's guest
// checkout, using the requester's shipping address and the cart's one-time
// card, and stops before the final "Place order" for the requester's tap.
//
// Guardrails, enforced here rather than trusted to the model:
//   • it never sees the card: fill_payment types it server-side, snapshots
//     mask payment fields, and `type` refuses payment fields
//   • it can only be on the store's own site or known checkout hosts
//   • the order total must fit the card limit before we even ask
//   • nothing is placed without the requester's confirmation
//   • hard caps on steps and wall-clock time
import { anthropicClient } from '../anthropic.js';
import { authLimitCents, dollarsToCents, usd } from '../cart.js';
import { isPaymentField, locate, snapshot } from './snapshot.js';

export const MAX_STEPS = 45;
// Everything that could show card details on a checkout page.
export const CARD_FIELDS = [
  'input[autocomplete^="cc-"]',
  'input[name*="card" i]', 'input[id*="card" i]', 'input[name*="cvc" i]', 'input[name*="cvv" i]', 'input[name*="expir" i]',
  'input[aria-label*="card" i]', 'input[placeholder*="card" i]', 'input[placeholder*="•••"]',
  'iframe[src*="stripe" i]', 'iframe[src*="braintree" i]', 'iframe[src*="adyen" i]', 'iframe[src*="checkout.com" i]', 'iframe[src*="paypal" i]',
  'iframe[src*="shopifycs" i]', 'iframe[src*="card" i]', 'iframe[name*="card" i]', 'iframe[title*="card" i]', 'iframe[title*="payment" i]',
].join(', ');

// Top-level pages may only be on these (plus the store); iframes like card fields or CAPTCHAs aren't limited.
const CHECKOUT_HOSTS = ['myshopify.com', 'shopify.com', 'shopifycs.com', 'shop.app', 'checkout.stripe.com'];

export function allowedHosts(cart, extra = []) {
  const hosts = new Set([...CHECKOUT_HOSTS, ...extra]);
  const add = (u) => {
    try {
      const h = new URL(u).hostname.replace(/^www\./, '');
      hosts.add(h);
      hosts.add(h.split('.').slice(-2).join('.')); // shop.brand.com → brand.com
    } catch {}
  };
  add(cart.merchant.url);
  for (const i of cart.items) add(i.url);
  return [...hosts];
}

export function hostAllowed(url, hosts) {
  let h;
  try {
    const u = new URL(url);
    if (u.protocol === 'about:') return true;
    h = u.hostname;
  } catch {
    return false;
  }
  return hosts.some((a) => h === a || h.endsWith(`.${a}`));
}

const TOOLS = [
  { name: 'navigate', description: "Open a URL on the store's own site.", input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'click', description: 'Click an element by ref.', input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } },
  {
    name: 'type',
    description: 'Replace the text in a field (not payment fields). Set submit to press Enter after.',
    input_schema: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['ref', 'text'] },
  },
  { name: 'select', description: 'Choose an option in a <select> by its visible text.', input_schema: { type: 'object', properties: { ref: { type: 'string' }, option: { type: 'string' } }, required: ['ref', 'option'] } },
  {
    name: 'fill_payment',
    description:
      "Fill the one-time card into the payment fields. You never see the card; pass the refs of the fields shown on the page. Use expiry_ref for a single MM/YY field, or exp_month_ref + exp_year_ref for separate ones. name_ref is the 'name on card' field if there is one.",
    input_schema: {
      type: 'object',
      properties: { number_ref: { type: 'string' }, expiry_ref: { type: 'string' }, exp_month_ref: { type: 'string' }, exp_year_ref: { type: 'string' }, cvc_ref: { type: 'string' }, name_ref: { type: 'string' } },
      required: ['number_ref', 'cvc_ref'],
    },
  },
  { name: 'wait', description: 'Wait for the page to update (1–5 seconds).', input_schema: { type: 'object', properties: { seconds: { type: 'number' } }, required: ['seconds'] } },
  {
    name: 'ready_to_place_order',
    description:
      'Call this when everything is filled in and the only thing left is the final place-order / pay button. The requester reviews and confirms; if they do, the button is clicked for you and you get the next page.',
    input_schema: {
      type: 'object',
      properties: {
        total: { type: 'string', description: 'The order total shown on the page, e.g. "$274.80"' },
        summary: { type: 'string', description: 'One line: items, shipping method, delivery estimate' },
        place_order_ref: { type: 'string' },
      },
      required: ['total', 'summary', 'place_order_ref'],
    },
  },
  { name: 'order_placed', description: 'The store confirmed the order. Report the order number if shown.', input_schema: { type: 'object', properties: { order_number: { type: 'string' } }, required: [] } },
  {
    name: 'need_human',
    description: "Stop: something needs the requester (a CAPTCHA, a required login, out of stock, a price above the card limit, a payment decline, anything you're unsure about).",
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
];

export function systemPrompt(cart, shipping, billing = null) {
  if (cart.kind === 'train') return trainPrompt(cart, shipping, billing);
  const items = cart.items.map((i) => `- ${i.quantity} × ${i.title}${i.variant ? ` (${i.variant})` : ''} — ${usd(i.price_cents)} each${i.url ? `\n  ${i.url}` : ''}`).join('\n');
  return `You complete an online checkout on behalf of ${cart.requester.name}, whose friend has already paid for this cart. Work like a careful person doing guest checkout.

Store: ${cart.merchant.name}${cart.merchant.url ? ` (${cart.merchant.url})` : ''}
Cart:
${items}
Ship to:
${shipping.name}
${shipping.line1}${shipping.line2 ? `, ${shipping.line2}` : ''}
${shipping.city}, ${shipping.state} ${shipping.postal_code}, United States
Email: ${shipping.email}${shipping.phone ? `\nPhone: ${shipping.phone}` : ''}

The payment card is Spot's one-time card, limited to ${usd(authLimitCents(cart.cart_cents))} in total.

Rules:
- Put exactly the cart above into the store's cart (right size/colour/quantity), then check out as a guest. Never create an account, log in, or tick marketing / newsletter / SMS opt-ins.
- Use the cheapest standard shipping. No gift wrap, protection plans, tips, donations or add-ons. Don't enter coupon codes.
- Payment: always use fill_payment for card fields; never type card details. ${billing ? `If the store asks for a billing address, use the card's: ${billing.line1}, ${billing.city}, ${billing.state} ${billing.postal_code}, United States (uncheck "same as shipping").` : 'If the store asks for a billing address, use the same as shipping.'}
- When only the final place-order / pay button is left, call ready_to_place_order with the exact total shown. Never click that button yourself.
- If the total is above the card limit, an item is unavailable or different, a CAPTCHA or login blocks you, or anything is unclear, call need_human with a short reason.
- Dismiss cookie banners and popups when they get in the way. Each tool result shows the current page; refs change after every action, so always use refs from the latest ELEMENTS list.`;
}

// Buying one specific train: no cart or shipping, just the right train,
// fare and riders, with the e-ticket emailed to the riders.
function trainPrompt(cart, ticket, billing) {
  const t = cart.train;
  const riders = ticket.riders.map((r, i) => `${i + 1}. ${r.given_name} ${r.family_name}`).join('\n');
  return `You buy a train ticket on behalf of ${cart.requester.name}, who has already paid Spot for it. Work like a careful person booking as a guest.

Operator: ${cart.merchant.name}${cart.merchant.url ? ` (${cart.merchant.url})` : ''}
Train: ${t.service || ''}${t.number ? ` ${t.number}` : ''}, one-way, from ${t.from} to ${t.to}
Date and departure: ${t.depart_at.slice(0, 10)} at ${t.depart_at.slice(11)} (local station time)${t.arrive_at ? `, arriving ${t.arrive_at.slice(11)}` : ''}
Fare class: ${t.fare_class} (or the cheapest fare in that class)
Passengers (${t.passengers} adult${t.passengers > 1 ? 's' : ''}), names exactly as given:
${riders}
Email for the e-ticket: ${ticket.email}${ticket.phone ? `\nPhone: ${ticket.phone}` : ''}
Expected fare: ${usd(cart.cart_cents)} in total.

The payment card is Spot's one-time card, limited to ${usd(authLimitCents(cart.cart_cents))} in total.

Rules:
- Search for exactly this one-way trip, pick the train that departs at that time (and number, if given), and choose that fare class. Never pick a different train, date or station.
- Book as a guest. Never create an account, log in, join a rewards program, or tick marketing / newsletter / SMS opt-ins.
- No seat upgrades, trip insurance, flexible-fare add-ons, parking, meals or donations. Skip optional seat selection.
- Payment: always use fill_payment for card fields; never type card details. ${billing ? `If asked for a billing address, use the card's: ${billing.line1}, ${billing.city}, ${billing.state} ${billing.postal_code}, United States.` : ''}
- When only the final purchase / pay button is left, call ready_to_place_order with the exact total shown. Never click that button yourself.
- If that train is sold out, the fare is above the card limit, a CAPTCHA or login blocks you, or anything is unclear, call need_human with a short reason.
- Dismiss cookie banners and popups when they get in the way. Each tool result shows the current page; refs change after every action, so always use refs from the latest ELEMENTS list.`;
}

// Runs one checkout. `confirm(summary)` resolves true/false when the
// requester answers; `progress(step)` streams short status lines.
export async function runCheckoutAgent({ page, cart, shipping, getCard, billing = null, startUrl, client, confirm, progress = () => {}, maxSteps = MAX_STEPS, deadlineMs = 8 * 60_000, model, onUsage }) {
  const anthropic = client ?? anthropicClient();
  const hosts = allowedHosts(cart, [startUrl && new URL(startUrl).hostname].filter(Boolean));
  const limit = authLimitCents(cart.cart_cents);
  const started = Date.now();
  const seen = []; // everything sent to the model, for the no-card-leak test

  await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await settle(page);
  const first = await snapshot(page);
  const messages = [{ role: 'user', content: `Start here. Current page:\n\n${first}` }];
  seen.push(first);

  const finish = (outcome) => ({ ...outcome, steps: step, transcript: seen });
  let step = 0;
  for (; step < maxSteps; step++) {
    if (Date.now() - started > deadlineMs) return finish({ status: 'needs_you', reason: 'Checkout took too long' });
    const res = await anthropic.beta.messages.create({
      model: model || process.env.SPOT_AGENT_MODEL || 'claude-opus-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: systemPrompt(cart, shipping, billing),
      tools: TOOLS,
      messages,
    });
    onUsage?.(res.model, res.usage);
    if (res.stop_reason === 'refusal') return finish({ status: 'needs_you', reason: 'The checkout assistant declined this page' });
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((b) => b.type === 'tool_use');
    if (!calls.length) return finish({ status: 'needs_you', reason: 'The checkout assistant stopped without finishing' });

    const results = [];
    let outcome = null;
    for (const call of calls) {
      if (outcome) {
        results.push({ type: 'tool_result', tool_use_id: call.id, content: 'Skipped: checkout already ended.', is_error: true });
        continue;
      }
      let text;
      let isError = false;
      try {
        const r = await act(call, { page, getCard, cart, shipping, hosts, limit, confirm, progress });
        if (r.outcome) outcome = r.outcome;
        text = r.text;
      } catch (e) {
        isError = true;
        text = `Error: ${e.message.split('\n')[0]}`;
      }
      if (!outcome || outcome.status !== 'placed') {
        await settle(page);
        text = `${text}\n\nCurrent page:\n\n${await snapshot(page)}`;
      }
      seen.push(text);
      results.push({ type: 'tool_result', tool_use_id: call.id, content: text, ...(isError ? { is_error: true } : {}) });
    }
    if (outcome && outcome.status !== 'continue') return finish(outcome);
    messages.push({ role: 'user', content: results });
  }
  return finish({ status: 'needs_you', reason: 'Checkout needed too many steps' });
}

async function act(call, ctx) {
  const { page, getCard, cart, shipping, hosts, limit, confirm, progress } = ctx;
  const a = call.input || {};
  switch (call.name) {
    case 'navigate': {
      if (!hostAllowed(a.url, hosts)) return { text: `Not allowed: ${a.url} is not on the store's site.` };
      progress('Opening the store');
      await page.goto(a.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      return { text: 'Opened.' };
    }
    case 'click': {
      const el = locate(page, a.ref);
      await el.click({ timeout: 8000 });
      await guardHost(page, hosts);
      return { text: 'Clicked.' };
    }
    case 'type': {
      const el = locate(page, a.ref);
      if (await isPaymentField(el)) return { text: 'That is a payment field. Use fill_payment instead.' };
      await el.fill(String(a.text ?? ''), { timeout: 8000 });
      if (a.submit) await el.press('Enter');
      await guardHost(page, hosts);
      return { text: 'Typed.' };
    }
    case 'select': {
      const el = locate(page, a.ref);
      await el.selectOption({ label: String(a.option) }, { timeout: 8000 }).catch(() => el.selectOption(String(a.option), { timeout: 8000 }));
      return { text: 'Selected.' };
    }
    case 'fill_payment': {
      progress('Adding Spot’s one-time card');
      // Fetched only now, at the payment step, and dropped when this returns.
      const card = await getCard();
      const mm = String(card.exp_month).padStart(2, '0');
      const yy = String(card.exp_year).slice(-2);
      const fill = async (ref, value) => {
        if (!ref) return;
        const el = locate(page, ref);
        // Card fields often reformat as you type; typing like a person is the most reliable.
        await el.click({ timeout: 8000 });
        await el.fill('');
        await el.pressSequentially(value, { delay: 25 });
      };
      await fill(a.number_ref, card.number);
      if (a.expiry_ref) await fill(a.expiry_ref, `${mm}/${yy}`);
      if (a.exp_month_ref) {
        const el = locate(page, a.exp_month_ref);
        const tag = await el.evaluate((e) => e.tagName);
        if (tag === 'SELECT') await el.selectOption(mm).catch(() => el.selectOption(String(Number(mm))));
        else await fill(a.exp_month_ref, mm);
      }
      if (a.exp_year_ref) {
        const el = locate(page, a.exp_year_ref);
        const tag = await el.evaluate((e) => e.tagName);
        if (tag === 'SELECT') await el.selectOption(String(card.exp_year)).catch(() => el.selectOption(yy));
        else await fill(a.exp_year_ref, yy);
      }
      await fill(a.cvc_ref, card.cvc);
      if (a.name_ref) await fill(a.name_ref, shipping.name);
      return { text: 'Card filled (details hidden).' };
    }
    case 'wait':
      await page.waitForTimeout(Math.min(Math.max(Number(a.seconds) || 1, 1), 5) * 1000);
      return { text: 'Waited.' };
    case 'ready_to_place_order': {
      const total = dollarsToCents(a.total);
      if (!total) return { text: 'Give the total exactly as shown on the page, like "$123.45".' };
      if (total > limit) {
        return { outcome: { status: 'needs_you', reason: `The store's total is ${usd(total)}, above the card limit of ${usd(limit)}` }, text: 'Over the card limit.' };
      }
      locate(page, a.place_order_ref); // validates the ref now, before we bother the requester
      progress('Waiting for you to confirm');
      // The requester sees this screenshot, so card fields (and card iframes
      // from payment processors) are painted over first.
      const shot = await page.screenshot({ fullPage: false, type: 'png', mask: [page.locator(CARD_FIELDS)], maskColor: '#1b1712' }).catch(() => null);
      const ok = await confirm({ total_cents: total, summary: String(a.summary || '').slice(0, 300), screenshot: shot });
      if (!ok) return { outcome: { status: 'cancelled', reason: 'You chose not to place the order' }, text: 'The requester declined.' };
      progress('Placing your order');
      const before = page.url();
      await locate(page, a.place_order_ref).click({ timeout: 10_000 });
      // Payment takes a moment: wait for the store to move to its confirmation
      // page (or give up waiting and let the agent look at what's there).
      await page.waitForURL((u) => u.href !== before, { timeout: 15_000 }).catch(() => {});
      await settle(page);
      return { outcome: { status: 'continue' }, text: 'The requester confirmed and the order button was clicked. Check the result: call order_placed, or need_human if payment failed.' };
    }
    case 'order_placed':
      return { outcome: { status: 'placed', order_number: a.order_number ? String(a.order_number).slice(0, 60) : null }, text: 'Done.' };
    case 'need_human':
      return { outcome: { status: 'needs_you', reason: String(a.reason || 'The checkout needs you').slice(0, 200) }, text: 'Stopping.' };
    default:
      return { text: `Unknown tool ${call.name}` };
  }
}

async function guardHost(page, hosts) {
  await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {});
  if (!hostAllowed(page.url(), hosts)) {
    const bad = page.url();
    await page.goBack().catch(() => {});
    throw new Error(`That went off the store's site (${new URL(bad).hostname}), so I went back.`);
  }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
}

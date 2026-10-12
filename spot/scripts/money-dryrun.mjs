// Every way money moves through Spot, end to end, before real money does.
//
//   node scripts/money-dryrun.mjs
//
// Runs Spot in-process in test mode (the sandbox provider: no Stripe, no
// money) and drives each path through the same routes the pages use:
// someone pays, the store charges Spot's card, money comes back. For each it
// checks what the payer was held, charged and given back, and prints a
// report. Exit code 1 if anything is off.
//
// The Stripe side of a store refund landing on a used card is checked
// separately against Stripe test mode: scripts/issuing-refund-check.mjs.
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { cardLimitCents } from '../src/cart.js';

const cfg = { feeBps: 400, feeFixedCents: 200, maxCartCents: 50000, testMaxCartCents: 2500000, expiresHours: 72, cardPctBps: 290, cardFixedCents: 30 };
const usd = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const results = [];

function fresh() {
  const provider = sandboxProvider();
  const db = openDb(':memory:');
  const app = buildApp({ db, provider, cfg, logger: false, env: {} });
  const call = async (method, url, payload) => {
    const r = await app.inject({ method, url, payload });
    let body = null;
    try {
      body = r.json();
    } catch {}
    return { status: r.statusCode, body };
  };
  const make = async (items = [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }], extra = {}) => {
    const r = await call('POST', '/v1/carts', { requester: { name: 'Riley' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items, ...extra });
    if (r.status !== 201) throw new Error(`make: ${r.status} ${JSON.stringify(r.body)}`);
    return { token: r.body.cart.token, k: r.body.manage_key };
  };
  const pay = async (token) => {
    const r = await call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Mom', payer_email: 'mom@example.com' });
    if (r.status !== 200) throw new Error(`pay: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.cart;
  };
  // The store runs Spot's card: an authorization, then the charge.
  const storeCharges = async (token, k, cents) => {
    const a = await call('POST', '/v1/sandbox/authorize', { token, k, merchant_name: 'NIKE', amount_cents: cents });
    if (!a.body?.approved) throw new Error(`store charge declined: ${JSON.stringify(a.body)}`);
    return call('POST', '/v1/sandbox/issuing', { token, k, type: 'capture', amount_cents: cents });
  };
  return { app, db, provider, call, make, pay, storeCharges, cart: (t) => app.spot.load(t) };
}

async function scenario(name, fn) {
  const env = fresh();
  try {
    const checks = [];
    const expect = (ok, what) => checks.push({ ok: Boolean(ok), what });
    const notes = await fn(env, expect);
    results.push({ name, ok: checks.every((c) => c.ok), checks, notes });
  } catch (err) {
    results.push({ name, ok: false, checks: [{ ok: false, what: err.message }], notes: '' });
  } finally {
    await env.app.close();
  }
}

await scenario('Gift: someone pays, the store charges less than held', async ({ provider, make, pay, storeCharges, cart }, expect) => {
  const { token, k } = await make();
  const paid = await pay(token);
  expect(paid.status === 'card_issued', `paid → Spot’s card ready (${paid.status})`);
  const held = cart(token);
  await storeCharges(token, k, 11000);
  const c = cart(token);
  const back = (c.refunds || []).filter((r) => r.reason === 'unused').reduce((n, r) => n + r.amount_cents, 0);
  expect(back > 0, `the part the store didn’t take came back: ${usd(back)}`);
  expect(c.payment_captured_at, 'the payer’s hold was captured for the rest');
  expect(provider.captured.size === 1, 'captured once');
  return `held ${usd(held.total_cents)} · store took ${usd(11000)} · back ${usd(back)}`;
});

await scenario('The asker cancels before Spot orders: everything back', async ({ provider, make, pay, call, cart }, expect) => {
  const { token, k } = await make();
  await pay(token);
  const r = await call('POST', `/v1/carts/${token}/manage/refund`, { k });
  expect(r.status === 200, `refund accepted (${r.status})`);
  const c = cart(token);
  expect(c.status === 'refunded', `refunded (${c.status})`);
  expect(c.released, 'released: it was only ever a hold, so nothing was charged');
  expect(provider.canceled.length >= 1, 'Spot’s card switched off');
  return `held ${usd(c.total_cents)} · released ${usd(c.total_cents)}`;
});

await scenario('The payer cancels from their receipt', async ({ make, pay, call, app, cart }, expect) => {
  const { token } = await make();
  await pay(token);
  const p = new URL(app.spot.payerPath(cart(token)), 'http://x').searchParams.get('p');
  const r = await call('POST', `/v1/carts/${token}/receipt/cancel`, { p });
  expect(r.status === 200, `cancel accepted (${r.status} ${r.body?.error || ''})`);
  expect(cart(token).status === 'refunded', `refunded (${cart(token).status})`);
  return `held ${usd(cart(token).total_cents)} · released`;
});

await scenario('A return after the store charged: the store refund goes to the payer', async ({ make, pay, storeCharges, call, cart }, expect) => {
  const { token, k } = await make();
  await pay(token);
  await storeCharges(token, k, 11500);
  const r = await call('POST', '/v1/sandbox/issuing', { token, k, type: 'refund', amount_cents: 4000 });
  expect(r.status === 200, `store refund recorded (${r.status})`);
  const c = cart(token);
  const back = (c.refunds || []).filter((x) => x.reason === 'store_refund' && x.state === 'done').reduce((n, x) => n + x.amount_cents, 0);
  expect(back === 4000, `${usd(back)} sent on to the payer`);
  return `store refunded ${usd(4000)} · payer got ${usd(back)}`;
});

await scenario('A price drop the store paid back is passed on as a price adjustment', async ({ make, pay, storeCharges, call, app, cart }, expect) => {
  const { token, k } = await make();
  await pay(token);
  await storeCharges(token, k, 11500);
  const c0 = cart(token);
  app.spot.patch(c0.id, (c) => ({ ...c, price_watch: { ...(c.price_watch || {}), state: 'claimed', drop: { cents: 1500 } } }));
  await call('POST', '/v1/sandbox/issuing', { token, k, type: 'refund', amount_cents: 1500 });
  const c = cart(token);
  const adj = (c.refunds || []).find((x) => x.reason === 'price_adjustment');
  expect(adj?.state === 'done' && adj.amount_cents === 1500, `price adjustment ${usd(adj?.amount_cents)} sent on`);
  return `drop ${usd(1500)} · payer got ${usd(adj?.amount_cents)}`;
});

await scenario('Multi-store: one payment, a card per store; one store fails and only its share comes back', async ({ provider, call, app }, expect) => {
  const stores = [
    { merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk', quantity: 1, price_cents: 11500 }] },
    { merchant: { name: 'REI', url: 'https://www.rei.com' }, items: [{ title: 'Shell', quantity: 1, price_cents: 9900 }] },
  ];
  const r = await call('POST', '/v1/bundles', { requester: { name: 'Riley' }, stores });
  expect(r.status === 201, `bundle made (${r.status})`);
  const p = await call('POST', `/v1/bundles/${r.body.bundle.token}/sandbox-pay`, { payer_name: 'Mom' });
  expect(p.status === 200 && p.body.bundle.status === 'paid', 'one payment covers both stores');
  const carts = p.body.bundle.stores.map((s) => app.spot.load(s.token));
  expect(carts.every((c) => c.status === 'card_issued') && carts[0].card_ref !== carts[1].card_ref, 'a card per store');
  const before = provider.refunds.length;
  await app.spot.refundCart(carts[1], { reason: 'not_orderable' });
  const share = provider.refunds.slice(before);
  expect(share.length === 1 && share[0].amount_cents === carts[1].total_cents, `only REI’s share back: ${usd(share[0]?.amount_cents)}`);
  expect(app.spot.load(carts[0].token).status === 'card_issued', 'Nike still goes ahead');
  return `paid ${usd(p.body.bundle.total_cents)} · REI back ${usd(share[0]?.amount_cents)}`;
});

await scenario('A dispute: the bank returns the money, so Spot doesn’t refund too', async ({ make, pay, call, app, cart }, expect) => {
  const { token, k } = await make();
  await pay(token);
  await app.spot.dispute(cart(token).payment_ref, 'fraudulent');
  const c = cart(token);
  expect(c.dispute, 'marked disputed');
  const r = await call('POST', `/v1/carts/${token}/manage/refund`, { k });
  expect(r.status === 409, `no second refund (${r.status})`);
  return 'disputed · refund refused';
});

await scenario('A link nobody pays expires: nothing moves', async ({ provider, make, app, db, cart }, expect) => {
  const { token } = await make();
  db.raw.prepare('UPDATE carts SET expires_at = ? WHERE token = ?').run(Date.now() - 1000, token);
  app.spot.sweepExpired();
  const c = cart(token);
  expect(c.status === 'expired', `expired (${c.status})`);
  expect(provider.refunds.length === 0 && provider.captured.size === 0, 'no hold, no charge, no refund');
  return 'expired · $0 moved';
});

await scenario('Chip in: three people cover it, the store charges less, each gets their share back', async ({ provider, make, call, storeCharges, cart }, expect) => {
  const { token, k } = await make();
  const on = await call('POST', `/v1/carts/${token}/manage/chip`, { k });
  expect(on.status === 200, `chip in turned on (${on.status})`);
  const total = cart(token).total_cents;
  const parts = [5000, 4000, total - 9000];
  for (const [i, cents] of parts.entries()) {
    const r = await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents, name: ['Mom', 'Dad', 'Sam'][i] });
    if (r.status !== 200) throw new Error(`chip ${i + 1}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const held = cart(token);
  expect(held.status === 'card_issued', `covered → Spot’s card ready (${held.status})`);
  expect(held.chips.filter((c) => c.state === 'held').reduce((n, c) => n + c.cents, 0) === total, 'exactly the total is held');
  const before = provider.refunds.length;
  await storeCharges(token, k, 11000);
  const back = provider.refunds.slice(before);
  const backCents = back.reduce((n, r) => n + r.amount_cents, 0);
  expect(back.length === 3, `the unused part split across all three (${back.length} refunds)`);
  expect(new Set(back.map((r) => r.key)).size === back.length, 'a separate refund per person');
  return `held ${usd(total)} from 3 · store took ${usd(11000)} · back ${usd(backCents)} (${back.map((r) => usd(r.amount_cents)).join(' + ')})`;
});

await scenario('Chip in that never fills: the requester cancels and every hold is let go', async ({ provider, make, call, cart }, expect) => {
  const { token, k } = await make();
  await call('POST', `/v1/carts/${token}/manage/chip`, { k });
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 3000, name: 'Mom' });
  await call('POST', `/v1/carts/${token}/chip/sandbox`, { cents: 2000, name: 'Dad' });
  const r = await call('POST', `/v1/carts/${token}/manage/cancel`, { k });
  expect(r.status === 200, `canceled (${r.status})`);
  await new Promise((done) => setTimeout(done, 50));
  const c = cart(token);
  expect(c.chips.every((x) => x.state === 'released'), 'both holds released');
  expect(provider.captured.size === 0, 'nobody charged');
  return `held ${usd(5000)} from 2 · released ${usd(5000)}`;
});

await scenario('Spot’s card balance too low: the payer is told before anything is held', async ({ provider, make, call, cart }, expect) => {
  const { token } = await make();
  provider.issuingCents = 1000;
  const r = await call('POST', `/v1/carts/${token}/sandbox-pay`, { payer_name: 'Mom' });
  expect(r.status === 503, `turned away (${r.status})`);
  expect(cart(token).status === 'open' && !cart(token).payment_ref, 'nothing held');
  return `needed ${usd(cardLimitCents(cart(token)))} · had ${usd(1000)}`;
});

let failed = 0;
console.log('\nSpot money dry run (test mode: no money moves)\n');
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? '✅' : '❌'} ${r.name}${r.notes ? `\n     ${r.notes}` : ''}`);
  for (const c of r.checks) if (!c.ok || process.argv.includes('-v')) console.log(`     ${c.ok ? '·' : '✗'} ${c.what}`);
}
console.log(`\n${results.length - failed} of ${results.length} paths OK${failed ? `, ${failed} need a look` : ''}.`);
process.exit(failed ? 1 : 0);

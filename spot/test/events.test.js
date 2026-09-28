import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { createSpot } from '../src/spot.js';
import { createEvents } from '../src/events.js';
import { createNotifier } from '../src/notify.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const env = { SPOT_API_KEYS: 'partner:s3cret', RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM: '+15125550000', PUBLIC_URL: 'https://spotmeplease.com' };

// Collects what would have gone out through Resend and Twilio.
function outbox() {
  const emails = [];
  const texts = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    else texts.push(Object.fromEntries(new URLSearchParams(String(init.body))));
    return new Response('{}', { status: 200 });
  };
  return { emails, texts, notifyFetch };
}
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};

function app(t, extra = {}) {
  const box = outbox();
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, notifyFetch: box.notifyFetch, ...extra });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call, ...box };
}

test('🎉 covered: the requester is emailed a private link that opens their Spot', async (t) => {
  const { call, emails, texts } = app(t);
  const made = (await call('POST', '/v1/carts', { requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }] })).body;
  await call('POST', `/v1/carts/${made.cart.token}/sandbox-pay`, { payer_name: 'Mom' });
  await until(() => emails.length, 'the email');
  const mail = emails[0];
  assert.deepEqual(mail.to, ['kyle@example.com']);
  assert.equal(mail.subject, '🎉 Mom spotted you!');
  assert.equal(mail.from, 'Spot <hi@spotmeplease.com>');
  assert.match(mail.html, /Get it ordered →/);
  assert.match(mail.html, /background:#ff5a36/, 'branded layout');
  const link = mail.html.match(/href="(https:\/\/spotmeplease\.com\/c\/[\w-]+\/manage\?k=[\w-]+)"/)[1];
  const u = new URL(link);
  assert.equal((await call('GET', `/v1/carts/${made.cart.token}/manage?k=${u.searchParams.get('k')}`)).status, 200, 'the emailed link opens the Spot');
  assert.equal((await call('GET', `/v1/carts/${made.cart.token}/manage?k=${u.searchParams.get('k').slice(0, -2)}xx`)).status, 404, 'a tampered link does not');
  assert.equal(texts.length, 0, 'no phone on file, no text');
  const events = (await call('GET', `/v1/carts/${made.cart.token}/manage?k=${made.manage_key}`)).body.events.map((e) => e.kind);
  assert.ok(!events.some((k) => k.startsWith('told')), 'notices stay out of the activity list');
});

test('✈️ booked: text + email to the traveler, once', async (t) => {
  const { call, emails, texts } = app(t);
  const H = { authorization: 'Bearer s3cret' };
  const day = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  const offers = (await call('POST', '/v1/agent/flights/search', { origin: 'AUS', destination: 'SFO', departure_date: day }, H)).body.offers;
  const ask = (await call('POST', '/v1/agent/flights/asks', { offer_id: offers[1].offer_id, requester: { name: 'Kyle' }, notify: { phone: '512-555-0100' } }, H)).body;
  const u = new URL(ask.finish_link);
  const token = u.pathname.split('/')[2];
  const k = u.searchParams.get('k');
  await call('POST', `/v1/carts/${token}/manage/travelers`, { k, travelers: [{ given_name: 'Kyle', family_name: 'Riggle', born_on: '1990-04-02', gender: 'm' }], contact: { email: 'kyle@example.com', phone: '5125550100' } });
  await call('POST', `/v1/carts/${token}/sandbox-pay`, {});
  await until(() => texts.some((x) => /booked/.test(x.Body)) && emails.some((m) => /booked/.test(m.subject)), 'booked messages');
  const sms = texts.find((x) => /booked/.test(x.Body));
  assert.equal(sms.To, '+15125550100');
  assert.match(sms.Body, /^Spot: ✈️ You're booked! Confirmation [A-Z0-9]{6}\..*Reply STOP to opt out\.$/);
  const mail = emails.find((m) => /booked/.test(m.subject));
  assert.deepEqual(mail.to, ['kyle@example.com']);
  assert.match(mail.html, /Confirmation code/);
  const before = texts.length;
  // A second look at the page doesn't re-send.
  await call('GET', `/v1/carts/${token}/manage?k=${k}`);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(texts.length, before);
});

test('📦 ordered: the requester hears it, and the payer gets a thank-you', async (t) => {
  const db = openDb(':memory:');
  const box = outbox();
  const notifier = createNotifier({ env, fetchImpl: box.notifyFetch, optouts: db.optouts, log: {} });
  const spot = createSpot({ db, provider: sandboxProvider(), cfg, log: {} });
  const events = createEvents({ db, spot, notifier, baseUrl: () => 'https://spotmeplease.com', log: {} });
  spot.emit = (kind, id, x) => events.emit(kind, id, x);
  const { cart } = spot.create({ requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }] });
  await spot.startPayment(cart.token);
  await spot.paymentSucceeded({ paymentRef: db.byId(cart.id).payment_ref, amountCents: cart.total_cents, payer: { name: 'Mom', email: 'Mom@Example.com' } });
  spot.patch(cart.id, (c) => ({ ...c, fulfillment: { state: 'placed', order_number: 'A123' } }));
  await events.emit('ordered', cart.id);
  await events.emit('ordered', cart.id);
  const ordered = box.emails.filter((m) => /Ordered|gift/.test(m.subject));
  assert.equal(ordered.length, 2, 'one each, even when triggered twice');
  assert.deepEqual(ordered.find((m) => m.subject.startsWith('📦')).to, ['kyle@example.com']);
  const thanks = ordered.find((m) => m.subject.startsWith('🎁'));
  assert.deepEqual(thanks.to, ['mom@example.com']);
  assert.equal(thanks.subject, '🎁 Your gift for Kyle was ordered');
  assert.match(thanks.html, /Make your own Spot/);
  assert.equal(db.byId(cart.id).payer?.email, undefined, 'the payer email is not on the payer record the requester sees');
});

test('🤖 ready: account email gets the handoff', async (t) => {
  const box = outbox();
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: { ...env, TWILIO_ACCOUNT_SID: '' }, notifyFetch: box.notifyFetch });
  t.after(() => a.close());
  await a.inject({ method: 'POST', url: '/v1/auth/start', payload: { email: 'kyle@example.com' } });
  const code = box.emails[0].subject.slice(0, 6);
  const v = await a.inject({ method: 'POST', url: '/v1/auth/verify', payload: { email: 'kyle@example.com', code } });
  const cookie = v.headers['set-cookie'].split(';')[0];
  const key = (await a.inject({ method: 'POST', url: '/v1/me/keys', headers: { cookie }, payload: {} })).json().api_key;
  await a.inject({ method: 'POST', url: '/v1/agent/asks', headers: { authorization: `Bearer ${key}` }, payload: { requester: { name: 'Kyle' }, merchant: { name: 'Nike' }, items: [{ title: 'Dunk Low', price_cents: 11500 }], for: 'self' } });
  await until(() => box.emails.some((m) => m.subject.startsWith('🤖')), 'the handoff email');
  const mail = box.emails.find((m) => m.subject.startsWith('🤖'));
  assert.deepEqual(mail.to, ['kyle@example.com']);
  assert.match(mail.subject, /Your cart is ready: Dunk Low/);
  assert.match(mail.html, /Finish →/);
});

test('👆 confirm_needed: email + text, but never to a number that replied STOP', async () => {
  const db = openDb(':memory:');
  const box = outbox();
  const notifier = createNotifier({ env, fetchImpl: box.notifyFetch, optouts: db.optouts, log: {} });
  const spot = createSpot({ db, provider: sandboxProvider(), cfg, log: {} });
  const events = createEvents({ db, spot, notifier, baseUrl: () => 'https://spotmeplease.com', log: {} });
  const make = (phone) => {
    const { cart } = spot.create({ requester: { name: 'Kyle', email: 'kyle@example.com' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }] });
    spot.patch(cart.id, (c) => ({ ...c, notify: { phone }, fulfillment: { state: 'awaiting_confirm', total_cents: 27112, started_at: 1 } }));
    return cart.id;
  };
  await events.emit('confirm_needed', make('5125550100'));
  assert.equal(box.emails.at(-1).subject, '👆 One tap to order your Super Puff');
  assert.match(box.texts.at(-1).Body, /^Spot: Your Aritzia checkout is ready, \$271\.12\. Tap Place order within 10 min: https:\/\/spotmeplease\.com\/c\//);
  db.optouts.add('+15125550199');
  const sent = box.texts.length;
  await events.emit('confirm_needed', make('5125550199'));
  assert.equal(box.texts.length, sent, 'no text after STOP');
  assert.equal(db.notices.list(make('5125550100')).length, 0);
});

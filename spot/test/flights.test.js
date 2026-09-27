import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { createFlights, validateSearch, validateTravelers } from '../src/flights.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, maxFlightCents: 200000, expiresHours: 72 };
const env = { SPOT_API_KEYS: 'claude:s3cret-a, shopbot:s3cret-b' };
const auth = (key) => ({ authorization: `Bearer ${key}` });
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const kyle = { given_name: 'Kyle', family_name: 'Riggle', born_on: '1990-04-02', gender: 'm' };
const contact = { email: 'kyle@example.com', phone: '512 555 0100' };

function app(t, extra = {}) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, ...extra });
  t.after(() => a.close());
  return a;
}
const manage = (link) => {
  const u = new URL(link);
  return { token: u.pathname.split('/')[2], k: u.searchParams.get('k') };
};

test('an agent finds a flight, texts the link, and the traveler books it on their phone', async (t) => {
  const sent = [];
  const notifyFetch = async (url, init) => {
    sent.push({ url: String(url), body: String(init.body) });
    return new Response('{}', { status: 200 });
  };
  const a = app(t, { notifyFetch, env: { ...env, TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM: '+15125550000' } });

  const s = await a.inject({ method: 'POST', url: '/v1/agent/flights/search', headers: auth('s3cret-a'), payload: { origin: 'aus', destination: 'SFO', departure_date: inDays(20), return_date: inDays(24) } });
  assert.equal(s.statusCode, 200);
  const found = s.json();
  assert.equal(found.mode, 'demo');
  assert.ok(found.offers.length >= 2);
  assert.ok(found.offers.some((o) => o.slices.every((x) => x.stops === 0)), 'keeps a nonstop');
  assert.equal(found.offers[0].slices.length, 2, 'round trip');

  const offer = found.offers.find((o) => o.slices[0].stops === 0);
  const r = await a.inject({ method: 'POST', url: '/v1/agent/flights/asks', headers: auth('s3cret-a'), payload: { offer_id: offer.offer_id, requester: { name: 'Kyle' }, notify: { phone: '(512) 555-0100' } } });
  assert.equal(r.statusCode, 201);
  const ask = r.json();
  assert.equal(ask.for, 'self');
  assert.equal(ask.cart_cents, offer.total_cents);
  assert.equal(ask.delivered.text, 'sent');
  assert.match(new URLSearchParams(sent[0].body).get('Body'), /^Your flight is ready ✈️ AUS ⇄ SFO/);
  assert.ok(Date.parse(ask.expires_at) <= Date.parse(offer.expires_at), 'link dies with the fare');
  assert.match(ask.next_step, /add who's flying/);

  const { token, k } = manage(ask.finish_link);
  // Can't pay before saying who's flying.
  assert.equal((await a.inject({ method: 'POST', url: `/v1/carts/${token}/sandbox-pay`, payload: {} })).statusCode, 409);
  const bad = await a.inject({ method: 'POST', url: `/v1/carts/${token}/manage/travelers`, payload: { k, travelers: [{ ...kyle, born_on: '2999-01-01' }], contact } });
  assert.equal(bad.statusCode, 400);

  const tr = await a.inject({ method: 'POST', url: `/v1/carts/${token}/manage/travelers`, payload: { k, travelers: [kyle], contact } });
  assert.equal(tr.statusCode, 200);
  assert.equal(tr.json().price_changed, null);
  assert.equal(tr.json().cart.contact.phone, '+15125550100');

  // Nothing about the traveler leaks through the public link.
  const pub = (await a.inject({ method: 'GET', url: `/v1/carts/${token}` })).json().cart;
  assert.equal(pub.kind, 'flight');
  assert.ok(!JSON.stringify(pub).includes('1990-04-02'));
  assert.ok(!JSON.stringify(pub).includes('Riggle'));

  const paid = await a.inject({ method: 'POST', url: `/v1/carts/${token}/sandbox-pay`, payload: { payer_name: 'Kyle' } });
  assert.equal(paid.statusCode, 200);
  const done = (await a.inject({ method: 'GET', url: `/v1/carts/${token}/manage?k=${k}` })).json();
  assert.equal(done.cart.status, 'completed');
  assert.equal(done.needs_billing, false);
  assert.equal(done.cart.card, null, 'no one-time card for flights');
  assert.match(done.cart.flight.booking_reference, /^[A-Z0-9]{6}$/);

  const view = (await a.inject({ method: 'GET', url: `/v1/agent/asks/${token}`, headers: auth('s3cret-a') })).json();
  assert.match(view.next_step, new RegExp(`Booked\\. Confirmation code ${done.cart.flight.booking_reference}`));
  // Other agents can't see it, and flights aren't "ordered" by the checkout agent.
  assert.equal((await a.inject({ method: 'GET', url: `/v1/agent/asks/${token}`, headers: auth('s3cret-b') })).statusCode, 404);
  assert.equal((await a.inject({ method: 'POST', url: `/v1/agent/asks/${token}/order`, headers: auth('s3cret-a'), payload: {} })).statusCode, 409);
});

// A stand-in for Duffel whose offer can be repriced or refuse to book.
function fakeFlights({ price = 24900, repriceTo = null, bookError = null } = {}) {
  const offer = {
    id: 'off_1',
    total_amount: (price / 100).toFixed(2),
    total_cents: price,
    currency: 'USD',
    expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
    airline: { name: 'Delta', code: 'DL', logo: null },
    cabin: 'economy',
    passengers: [{ id: 'pas_1', type: 'adult' }],
    conditions: { refundable: false, changeable: true },
    slices: [{ from: 'AUS', to: 'SFO', departing_at: `${inDays(10)}T09:40:00`, arriving_at: `${inDays(10)}T11:55:00`, stops: 0, segments: [{ flight: 'DL123', from: 'AUS', to: 'SFO', departing_at: `${inDays(10)}T09:40:00`, arriving_at: `${inDays(10)}T11:55:00` }] }],
  };
  const booked = [];
  let looks = 0;
  return {
    booked,
    mode: 'test',
    search: async () => [offer],
    // The first look is when the agent holds it; the airline reprices after.
    offer: async () => (repriceTo && looks++ > 0 ? { ...offer, total_cents: repriceTo, total_amount: (repriceTo / 100).toFixed(2) } : offer),
    book: async (f) => {
      if (bookError) throw Object.assign(new Error(bookError), { status: 502 });
      booked.push(f);
      return { order_id: 'ord_1', booking_reference: 'QWERTY' };
    },
  };
}

async function flightAsk(a) {
  const r = await a.inject({ method: 'POST', url: '/v1/agent/flights/asks', headers: auth('s3cret-a'), payload: { offer_id: 'off_1', requester: { name: 'Kyle' } } });
  assert.equal(r.statusCode, 201, r.body);
  return manage(r.json().finish_link);
}

test('a fare that moves is re-priced before the traveler pays, and booked at the new price', async (t) => {
  const flights = fakeFlights({ repriceTo: 26100 });
  const a = app(t, { flights });
  const { token, k } = await flightAsk(a);
  const tr = (await a.inject({ method: 'POST', url: `/v1/carts/${token}/manage/travelers`, payload: { k, travelers: [kyle], contact } })).json();
  assert.deepEqual(tr.price_changed, { from_cents: 25896, to_cents: 27144 });
  assert.equal(tr.cart.cart_cents, 26100);
  await a.inject({ method: 'POST', url: `/v1/carts/${token}/sandbox-pay`, payload: {} });
  assert.equal(flights.booked[0].offer.total_amount, '261.00', 'books at the price the traveler paid');
  assert.equal(flights.booked[0].travelers[0].title, 'mr');
});

test('if the airline refuses the booking, the traveler is refunded and told why', async (t) => {
  const a = app(t, { flights: fakeFlights({ bookError: 'Seat no longer available' }) });
  const { token, k } = await flightAsk(a);
  await a.inject({ method: 'POST', url: `/v1/carts/${token}/manage/travelers`, payload: { k, travelers: [kyle], contact } });
  await a.inject({ method: 'POST', url: `/v1/carts/${token}/sandbox-pay`, payload: {} });
  const done = (await a.inject({ method: 'GET', url: `/v1/carts/${token}/manage?k=${k}` })).json();
  assert.equal(done.cart.status, 'refunded');
  assert.match(done.cart.flight.error, /Seat no longer available/);
  assert.ok(done.events.some((e) => e.kind === 'booking_failed'));
});

test('Duffel adapter: request shapes, USD only, and booking from balance', async () => {
  const calls = [];
  const duffelOffer = (id, currency, amount) => ({
    id,
    total_amount: amount,
    total_currency: currency,
    expires_at: '2030-01-01T00:00:00Z',
    owner: { name: 'Delta Air Lines', iata_code: 'DL' },
    passengers: [{ id: 'pas_a', type: 'adult' }],
    conditions: { refund_before_departure: { allowed: true }, change_before_departure: null },
    slices: [{ origin: { iata_code: 'AUS' }, destination: { iata_code: 'SFO' }, duration: 'PT4H', segments: [{ departing_at: '2030-01-01T09:00:00', arriving_at: '2030-01-01T11:00:00', origin: { iata_code: 'AUS' }, destination: { iata_code: 'SFO' }, marketing_carrier: { iata_code: 'DL', name: 'Delta' }, marketing_carrier_flight_number: '123', passengers: [{ cabin_class: 'economy' }] }] }],
  });
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('/air/offer_requests')) return Response.json({ data: { offers: [duffelOffer('off_gbp', 'GBP', '100.00'), duffelOffer('off_usd', 'USD', '249.10')] } });
    if (String(url).includes('/air/orders')) return Response.json({ data: { id: 'ord_9', booking_reference: 'RZPVAB' } });
    if (String(url).includes('/air/offers/gone')) return Response.json({ errors: [{ code: 'offer_no_longer_available', message: 'gone' }] }, { status: 422 });
    return Response.json({ data: duffelOffer('off_usd', 'USD', '249.10') });
  };
  const f = createFlights({ env: { DUFFEL_ACCESS_TOKEN: 'duffel_test_abc' }, fetchImpl });
  assert.equal(f.mode, 'test');

  const offers = await f.search({ origin: 'AUS', destination: 'SFO', departure_date: inDays(5), adults: 2, max_connections: 0 });
  const req = calls[0];
  assert.match(req.url, /^https:\/\/api\.duffel\.com\/air\/offer_requests\?return_offers=true/);
  assert.equal(req.init.headers['duffel-version'], 'v2');
  assert.equal(req.init.headers.authorization, 'Bearer duffel_test_abc');
  assert.deepEqual(req.body.data.passengers, [{ type: 'adult' }, { type: 'adult' }]);
  assert.equal(req.body.data.max_connections, 0);
  assert.deepEqual(offers.map((o) => o.id), ['off_usd'], 'non-USD fares are dropped');
  assert.equal(offers[0].total_cents, 24910);
  assert.equal(offers[0].slices[0].segments[0].flight, 'DL123');
  assert.equal(offers[0].conditions.refundable, true);

  const { travelers, contact: c } = validateTravelers(offers[0].passengers, [{ ...kyle, gender: 'f', given_name: 'Ana María' }], contact);
  const booking = await f.book({ offer: offers[0], travelers, contact: c });
  assert.deepEqual(booking, { order_id: 'ord_9', booking_reference: 'RZPVAB' });
  const order = calls.at(-1).body.data;
  assert.deepEqual(order.payments, [{ type: 'balance', amount: '249.10', currency: 'USD' }]);
  assert.deepEqual(order.selected_offers, ['off_usd']);
  assert.deepEqual(order.passengers[0], { id: 'pas_a', title: 'ms', given_name: 'Ana María', family_name: 'Riggle', gender: 'f', born_on: '1990-04-02', email: 'kyle@example.com', phone_number: '+15125550100' });

  await assert.rejects(f.offer('gone'), (e) => e.status === 410);
});

test('search and traveler validation', () => {
  assert.throws(() => validateSearch({ origin: 'AUS', destination: 'AUS', departure_date: inDays(3) }), /same/);
  assert.throws(() => validateSearch({ origin: 'AUS', destination: 'SFO', departure_date: '2001-01-01' }), /departure_date/);
  assert.throws(() => validateSearch({ origin: 'AUS', destination: 'SFO', departure_date: inDays(3), return_date: inDays(1) }), /return_date/);
  assert.equal(validateSearch({ origin: 'aus', destination: 'sfo', departure_date: inDays(3), return_date: inDays(5) }).slices.length, 2);
  const pax = [{ id: 'p1' }, { id: 'p2' }];
  assert.throws(() => validateTravelers(pax, [kyle], contact), /all 2 travelers/);
  assert.throws(() => validateTravelers([{ id: 'p1' }], [kyle], { ...contact, phone: '12' }), /phone/);
  assert.throws(() => validateTravelers([{ id: 'p1' }], [{ ...kyle, given_name: '<b>' }], contact), /name/);
});

// Family: a parent's rules for their teen. Small stuff at approved stores
// goes through on its own from the parent's card; the big stuff pings the
// parent, who approves in one tap. Nothing only for adults, ever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { decideAuthorization } from '../src/cart.js';
import { decide, normalizeFamilyRules, teenBlocked } from '../src/family.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const shipping = { name: 'Morgan Park', line1: '1 Main St', city: 'Austin', state: 'TX', postal_code: '78701', email: 'morgan@example.com', phone: '5125550101' };
const nike = (cents = 2000, title = 'Crew socks', over = {}) => ({
  requester: { name: 'Morgan' },
  merchant: { name: 'Nike', url: 'https://www.nike.com' },
  items: [{ title, quantity: 1, price_cents: cents, url: 'https://www.nike.com/t/socks' }],
  settle: 'card',
  ...over,
});

function app(t) {
  const provider = sandboxProvider();
  const db = openDb(':memory:');
  const a = buildApp({ db, provider, cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, db, call, provider };
}

async function signIn(call, email, name) {
  const start = await call('POST', '/v1/auth/start', { email });
  const cookie = (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
  const as = (method, url, payload) => call(method, url, payload, { cookie });
  await as('POST', '/v1/me', { name });
  return { as, cookie };
}

// A parent with a saved card, and their teen, joined.
async function family(t, { card = true } = {}) {
  const ctx = app(t);
  const mom = await signIn(ctx.call, 'jess@example.com', 'Jess Park');
  if (card) assert.equal((await mom.as('POST', '/v1/me/funding', { test_card: '4242' })).status, 200);
  const added = await mom.as('POST', '/v1/me/family', { name: 'Morgan', consent: true });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  const token = added.body.link.split('/').pop();
  const kid = await signIn(ctx.call, 'morgan@example.com', 'Morgan Park');
  await kid.as('POST', '/v1/me', { shipping });
  assert.equal((await kid.as('POST', '/v1/family/join', { token })).status, 200);
  return { ...ctx, mom, kid, id: added.body.teen.id, token };
}

test('age-restricted: names and stores', () => {
  for (const t of ['Juul starter kit', 'Elf Bar disposable vape', 'Tito’s Handmade Vodka 750ml', 'Delta-8 gummies', 'CBD oil', '9mm ammo, 50 rounds of', 'Hunting rifle scope combo', 'IPA 6-pack', 'Red wine gift box', 'Zyn pouches']) {
    assert.ok(teenBlocked([{ title: t }]), t);
  }
  for (const t of ['Wine glasses set of 4', 'Root beer float kit', 'Hot glue gun', 'Champagne gold slip dress', 'Nerf blaster', 'Ginger beer', 'Rifle Paper Co. notebook', 'Massage gun', 'Pistol grip drill']) {
    assert.equal(teenBlocked([{ title: t }]), null, t);
  }
  assert.ok(teenBlocked([{ title: 'Gift box' }], ['https://www.totalwine.com/p/1']));
  assert.ok(teenBlocked([{ title: 'Pods' }], ['https://vapeshop.com/x']));
  assert.equal(teenBlocked([{ title: 'Hoodie' }], ['https://www.nike.com/t/1']), null);
});

test('rules: shape and what goes through on its own', () => {
  assert.throws(() => normalizeFamilyRules({ auto_cents: 50 }), /between/);
  assert.throws(() => normalizeFamilyRules({ stores: ['drizly.com'] }), /only for adults/);
  assert.throws(() => normalizeFamilyRules({ auto_cents: 5000, monthly_cents: 2000 }), /monthly/);
  const rules = normalizeFamilyRules({ auto_cents: 2500, monthly_cents: 10000, stores: ['https://www.Target.com/', 'nike.com', 'nike.com'] });
  assert.deepEqual(rules, { auto_cents: 2500, monthly_cents: 10000, stores: ['target.com', 'nike.com'] });
  const fam = { name: 'Morgan', rules, auto_ok_at: 1 };
  const go = (o) => decide(fam, { cents: 2000, storeUrls: ['https://www.nike.com/t/x'], spent: 0, card: true, parent: 'Jess', ...o });
  assert.deepEqual(go({}), { auto: true });
  assert.match(go({ cents: 3000 }).reason, /Over your \$25/);
  assert.match(go({ cents: 3000 }).kid, /over \$25/);
  assert.match(go({ storeUrls: ['https://www.etsy.com/x'] }).reason, /etsy\.com isn’t one of your approved stores/);
  assert.match(go({ storeUrls: ['https://www.nike.com/a', 'https://www.etsy.com/b'] }).reason, /etsy/, 'every store has to be approved');
  assert.match(go({ spent: 9000 }).reason, /a month/);
  assert.match(go({ card: false }).reason, /card/);
  assert.match(decide({ ...fam, paused_at: 1 }, { cents: 100, storeUrls: ['https://nike.com'], card: true }).reason, /paused/);
  assert.match(decide({ ...fam, auto_ok_at: null }, { cents: 100, storeUrls: ['https://nike.com'], card: true }).reason, /Every ask/);
});

test('joining: a parent’s link, once, for a teen', async (t) => {
  const { call, mom, token } = await family(t);
  // The link worked once; it's spent now.
  assert.equal((await call('GET', `/family/join/${token}`)).status, 404);
  const other = await signIn(call, 'pat@example.com', 'Pat');
  assert.equal((await other.as('POST', '/v1/family/join', { token })).status, 404);
  // Consent is required to add a teen.
  assert.equal((await mom.as('POST', '/v1/me/family', { name: 'Sam' })).status, 400);
  const sam = await mom.as('POST', '/v1/me/family', { name: 'Sam', consent: true });
  const page = await call('GET', `/family/join/${sam.body.link.split('/').pop()}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /Jess added you to Spot/);
  assert.match(page.body, /Sign in to join/);
  // The parent can't join their own link.
  assert.equal((await mom.as('POST', '/v1/family/join', { token: sam.body.link.split('/').pop() })).status, 409);
  const v = (await mom.as('GET', '/v1/me/family')).body;
  assert.deepEqual(v.teens.map((x) => [x.name, x.joined]), [['Morgan', true], ['Sam', false]]);
  assert.equal(v.card, 'Visa •4242');
});

test('small stuff at an approved store goes through on its own; big stuff pings the parent', async (t) => {
  const { a, db, call, provider, mom, kid, id } = await family(t);
  const signed = (cartId) => db.events(cartId).filter((e) => e.kind === 'approval_signed').map((e) => e.detail.by);
  // Letting things through on their own is its own yes.
  assert.equal((await mom.as('POST', `/v1/me/family/${id}/rules`, { auto_cents: 2500, stores: ['nike.com'] })).status, 409);
  const set = await mom.as('POST', `/v1/me/family/${id}/rules`, { auto_cents: 2500, monthly_cents: 4000, stores: ['nike.com'], agree: true });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  assert.equal(set.body.teen.auto_on, true);

  // $20 of socks at Nike: paid from Mom's card, no tap.
  const small = await kid.as('POST', '/v1/carts', nike(2000));
  assert.equal(small.status, 201, JSON.stringify(small.body));
  assert.deepEqual(small.body.family, { state: 'paid', parent: 'Jess' });
  const paid = a.spot.load(small.body.cart.token);
  assert.equal(paid.status, 'card_issued');
  assert.equal(paid.for, 'other');
  assert.equal(paid.saved_pay.how, 'paid_by_family_rules');
  assert.equal(paid.payer.name, 'Jess');
  assert.equal(paid.requester.shipping.line1, '1 Main St', 'ships to the teen');
  assert.equal(provider.charges.at(-1).present, false);
  assert.deepEqual(signed(paid.id), ['rules']);

  // $115 sneakers: over the limit, so Mom is asked; nothing charged.
  const charges = provider.charges.length;
  const big = await kid.as('POST', '/v1/carts', nike(11500, 'Dunk Low'));
  assert.equal(big.body.family.state, 'asked');
  assert.match(big.body.family.reason, /over \$25/);
  const open = a.spot.load(big.body.cart.token);
  assert.equal(open.status, 'open');
  assert.equal(open.family.decision, 'asked');
  assert.equal(provider.charges.length, charges);

  // Mom's pay page offers the one tap; nobody else's does.
  assert.match((await mom.as('GET', `/c/${open.token}`)).body, /Approve · Visa •4242/);
  assert.doesNotMatch((await call('GET', `/c/${open.token}`)).body, /Approve · Visa/);
  assert.doesNotMatch((await kid.as('GET', `/c/${open.token}`)).body, /Approve · Visa/);
  assert.equal((await kid.as('POST', `/v1/carts/${open.token}/family/approve`, {})).status, 404, 'the teen can’t approve with Mom’s card');
  const ok = await mom.as('POST', `/v1/carts/${open.token}/family/approve`, {});
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.status, 'card_issued');
  const approved = a.spot.load(open.token);
  assert.equal(approved.saved_pay.how, 'approved_by_parent');
  assert.equal(approved.family.decision, 'approved');
  assert.deepEqual(signed(approved.id), ['parent']);
  assert.equal((await mom.as('POST', `/v1/carts/${open.token}/family/approve`, {})).status, 409, 'once');

  // Another approved-store store isn't on the list: asked.
  const etsy = await kid.as('POST', '/v1/carts', nike(1000, 'Sticker', { merchant: { name: 'Etsy', url: 'https://www.etsy.com' }, items: [{ title: 'Sticker', quantity: 1, price_cents: 1000, url: 'https://www.etsy.com/listing/1' }] }));
  assert.equal(etsy.body.family.state, 'asked');
  assert.match(etsy.body.family.reason, /etsy\.com isn’t on Jess’s approved list/);

  // The monthly limit counts what went through on its own ($20 so far of $40).
  assert.equal((await kid.as('POST', '/v1/carts', nike(1500))).body.family.state, 'paid');
  const over = await kid.as('POST', '/v1/carts', nike(1000));
  assert.equal(over.body.family.state, 'asked');
  assert.match(over.body.family.reason, /\$40 a month/);
  assert.equal((await mom.as('GET', '/v1/me/family')).body.teens[0].spent_cents, 3500);

  // Paused: everything asks.
  await mom.as('POST', `/v1/me/family/${id}/pause`, { on: true });
  assert.equal((await kid.as('POST', '/v1/carts', nike(500))).body.family.state, 'asked');
  await mom.as('POST', `/v1/me/family/${id}/pause`, { on: false });

  // The teen sees whose family they're in.
  const mine = (await kid.as('GET', '/v1/me/family')).body;
  assert.equal(mine.parent.name, 'Jess');
  assert.equal(mine.parent.auto_cents, 2500);

  // Removed: the teen's asks are their own again.
  await mom.as('POST', `/v1/me/family/${id}/remove`, {});
  const after = await kid.as('POST', '/v1/carts', nike(500));
  assert.equal(after.body.family, undefined);
  assert.equal(a.spot.load(after.body.cart.token).family, undefined);
});

test('no card on file: every ask goes to the parent, who can still pay the link', async (t) => {
  const { a, mom, kid, id } = await family(t, { card: false });
  await mom.as('POST', `/v1/me/family/${id}/rules`, { auto_cents: 2500, stores: ['nike.com'], agree: true });
  const r = await kid.as('POST', '/v1/carts', nike(2000));
  assert.equal(r.body.family.state, 'asked');
  assert.match(r.body.family.reason, /Jess decides each one/);
  assert.equal(a.spot.load(r.body.cart.token).status, 'open');
  const page = (await mom.as('GET', `/c/${r.body.cart.token}`)).body;
  assert.match(page, /Morgan asked you/);
  assert.match(page, /Add a card in your account/);
});

test('never for a teen: adults-only things, however it’s paid', async (t) => {
  const { a, call, kid, mom, id } = await family(t);
  await mom.as('POST', `/v1/me/family/${id}/rules`, { auto_cents: 5000, stores: ['nike.com'], agree: true });
  const vape = await kid.as('POST', '/v1/carts', nike(2000, 'Disposable vape 5000 puffs'));
  assert.equal(vape.status, 422);
  assert.match(vape.body.error, /only for adults/);
  const self = await kid.as('POST', '/v1/carts', nike(2000, 'Nicotine pouches', { for: 'self' }));
  assert.equal(self.status, 422, 'paying for it themselves too');
  const bundle = await kid.as('POST', '/v1/bundles', { requester: { name: 'Morgan' }, stores: [{ merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Socks', quantity: 1, price_cents: 1000 }] }, { merchant: { name: 'Total Wine', url: 'https://www.totalwine.com' }, items: [{ title: 'Gift set', quantity: 1, price_cents: 3000, url: 'https://www.totalwine.com/p/1' }] }] });
  assert.equal(bundle.status, 422);
  // An adult can still buy socks named anything.
  const adult = await signIn(call, 'adult@example.com', 'Al');
  assert.equal((await adult.as('POST', '/v1/carts', nike(2000, 'Wine glasses'))).status, 201);

  // Spot's card for a teen's order declines liquor stores, even at the right amount.
  const paid = (await kid.as('POST', '/v1/carts', nike(2000))).body.cart;
  const cart = a.spot.load(paid.token);
  assert.ok(cart.family);
  const auth = { amount_cents: 100, currency: 'usd', merchant: { name: 'NIKE.COM', category_code: '5921', category: 'package_stores_beer_wine_and_liquor' } };
  assert.deepEqual(decideAuthorization(cart, auth), { approved: false, reason: 'age_restricted' });
  const { family: _f, ...grownUp } = cart;
  assert.notEqual(decideAuthorization(grownUp, auth).reason, 'age_restricted');
});

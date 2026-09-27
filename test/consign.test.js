import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubmission, nextOfferState } from '../src/consign.js';

const base = { status: 'submitted' };
const offer = (by, kind, amount, status = 'open', id = kind + amount) => ({ id, by, kind, amount_cents: amount, status });

test('submission requires name, email, title, condition', () => {
  assert.throws(() => normalizeSubmission({}), /name/);
  assert.throws(() => normalizeSubmission({ seller_name: 'Kai', seller_email: 'nope', item_title: 'AJ1' }), /email/);
  assert.throws(() => normalizeSubmission({ seller_name: 'Kai', seller_email: 'k@x.io', item_title: 'AJ1' }), /condition/);
  const ok = normalizeSubmission({ seller_name: 'Kai', seller_email: 'K@X.io', item_title: 'AJ1 Chicago', brand: 'Nike', condition: 'deadstock', asking_cents: '30000' });
  assert.equal(ok.seller_email, 'k@x.io');
  assert.equal(ok.asking_cents, 30000);
  assert.equal(ok.deal_type, 'either');
});

test('store opens with an offer; seller cannot', () => {
  const m = nextOfferState(base, [], { by: 'store', action: 'offer', amountCents: 25000 });
  assert.equal(m.offer.status, 'open');
  assert.equal(m.patch.status, 'offered');
  assert.equal(m.closeOpen, null);
  assert.throws(() => nextOfferState(base, [], { by: 'seller', action: 'offer', amountCents: 25000 }), /Only the shop/);
});

test('seller counters the open store offer, superseding it', () => {
  const offers = [offer('store', 'offer', 25000)];
  const m = nextOfferState({ status: 'offered' }, offers, { by: 'seller', action: 'counter', amountCents: 28000, note: 'has receipt' });
  assert.equal(m.offer.kind, 'counter');
  assert.equal(m.closeOpen.id, 'offer25000');
  assert.equal(m.closeOpen.status, 'superseded');
  assert.equal(m.patch.status, 'countered');
});

test('a party cannot counter their own open offer', () => {
  assert.throws(() => nextOfferState({ status: 'offered' }, [offer('store', 'offer', 25000)], { by: 'store', action: 'counter', amountCents: 26000 }), /already have an offer/);
});

test('accepting takes the other side\'s open amount and closes the ticket', () => {
  const offers = [offer('store', 'offer', 25000, 'superseded'), offer('seller', 'counter', 28000)];
  const m = nextOfferState({ status: 'countered' }, offers, { by: 'store', action: 'accept' });
  assert.equal(m.offer.amount_cents, 28000);
  assert.equal(m.patch.status, 'accepted');
  assert.equal(m.patch.agreed_cents, 28000);
  assert.equal(m.closeOpen.status, 'accepted');
  assert.throws(() => nextOfferState({ status: 'countered' }, offers, { by: 'seller', action: 'accept' }), /other side/);
});

test('closed tickets reject further moves', () => {
  assert.throws(() => nextOfferState({ status: 'accepted' }, [], { by: 'store', action: 'offer', amountCents: 100 }), /accepted/);
  assert.throws(() => nextOfferState({ status: 'declined' }, [], { by: 'seller', action: 'counter', amountCents: 100 }), /declined/);
});

test('amounts must be sane', () => {
  assert.throws(() => nextOfferState(base, [], { by: 'store', action: 'offer', amountCents: 5 }), /between/);
  assert.throws(() => nextOfferState(base, [], { by: 'store', action: 'offer', amountCents: 'abc' }), /between/);
});

// Does a store refund land on a used Spot card? Stripe test mode only.
//
//   STRIPE_TEST_KEY=sk_test_… node scripts/issuing-refund-check.mjs
//
// For a paused card (status inactive, what Spot now does after the store
// charges) and a canceled one (what it did before), it makes a test charge,
// changes the card's status, then sends back a refund for that charge and an
// unlinked one (a store crediting the card later), and says which landed.
// Test mode moves no money. It refuses a live key.
import Stripe from 'stripe';

const key = process.env.STRIPE_TEST_KEY || '';
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
  console.error('Set STRIPE_TEST_KEY to a Stripe *test* secret key (sk_test_…). Live keys are refused.');
  process.exit(1);
}
const stripe = new Stripe(key);

const cardholder = await stripe.issuing.cardholders.create({
  type: 'individual',
  name: 'Spot Refund Check',
  email: 'refund-check@example.com',
  individual: { first_name: 'Spot', last_name: 'Check', dob: { day: 1, month: 1, year: 1990 } },
  billing: { address: { line1: '1 Test St', city: 'San Francisco', state: 'CA', postal_code: '94111', country: 'US' } },
  status: 'active',
});

async function check(status) {
  const card = await stripe.issuing.cards.create({ cardholder: cardholder.id, currency: 'usd', type: 'virtual', status: 'active' });
  const auth = await stripe.testHelpers.issuing.authorizations.create({ card: card.id, amount: 5000, currency: 'usd', merchant_data: { name: 'Refund Check Store' } });
  if (auth.status !== 'pending' || !auth.approved) throw new Error(`test charge wasn't approved (${auth.status})`);
  const captured = await stripe.testHelpers.issuing.authorizations.capture(auth.id);
  const txn = (await stripe.issuing.transactions.list({ card: card.id, limit: 5 })).data.find((t) => t.type === 'capture') || null;
  await stripe.issuing.cards.update(card.id, { status });
  const out = { status, card: card.id, captured: captured.status };
  try {
    const r = await stripe.testHelpers.issuing.transactions.refund(txn.id, { refund_amount: 1000 });
    out.linked_refund = `landed (${r.id})`;
  } catch (err) {
    out.linked_refund = `refused: ${err.message}`;
  }
  try {
    const r = await stripe.testHelpers.issuing.transactions.createUnlinkedRefund({ card: card.id, amount: 500, currency: 'usd', merchant_data: { name: 'Refund Check Store' } });
    out.unlinked_refund = `landed (${r.id})`;
  } catch (err) {
    out.unlinked_refund = `refused: ${err.message}`;
  }
  const refunds = (await stripe.issuing.transactions.list({ card: card.id, limit: 10 })).data.filter((t) => t.type === 'refund');
  out.refunds_on_card = refunds.map((t) => t.amount);
  // A new charge on the used card should be declined either way.
  try {
    const again = await stripe.testHelpers.issuing.authorizations.create({ card: card.id, amount: 100, currency: 'usd' });
    out.new_charge = again.approved ? 'APPROVED (unexpected)' : `declined (${again.request_history?.at(-1)?.reason || again.status})`;
  } catch (err) {
    out.new_charge = `declined (${err.message})`;
  }
  if (status !== 'canceled') await stripe.issuing.cards.update(card.id, { status: 'canceled' });
  return out;
}

for (const status of ['inactive', 'canceled']) console.log(JSON.stringify(await check(status), null, 2));
await stripe.issuing.cardholders.update(cardholder.id, { status: 'inactive' });

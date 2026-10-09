import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const env = { RESEND_API_KEY: 're_x', SPOT_FROM_EMAIL: 'Spot <hi@spotmeplease.com>', PUBLIC_URL: 'https://spotmeplease.com' };

function app(t) {
  const emails = [];
  const notifyFetch = async (url, init) => {
    if (String(url).includes('resend')) emails.push(JSON.parse(String(init.body)));
    return new Response('{}', { status: 200 });
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env, notifyFetch });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body };
  };
  return { a, call, emails };
}
const until = async (fn, what) => {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for ${what}`);
};
const scriptsOf = (html) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

async function paidAsk(t, payer = { payer_name: 'Mom Jones', payer_email: 'mom@example.com' }) {
  const ctx = app(t);
  const made = (await ctx.call('POST', '/v1/carts', { requester: { name: 'Kyle Riggle', email: 'kyle@example.com' }, merchant: { name: 'Aritzia' }, items: [{ title: 'Super Puff', price_cents: 25000 }] })).body;
  const token = made.cart.token;
  const k = made.manage_key;
  const before = await ctx.call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: 'thank you!' });
  await ctx.call('POST', `/v1/carts/${token}/sandbox-pay`, payer);
  const p = new URL(ctx.a.spot.payerPath(ctx.a.spot.load(token)), 'http://x').searchParams.get('p');
  return { ...ctx, token, k, p, before };
}

test('💌 thanks: not before it’s paid; then the requester sends one, once', async (t) => {
  const { call, token, k, before } = await paidAsk(t);
  assert.equal(before.status, 409, 'nothing to thank for until someone pays');
  assert.match(before.body.error, /once someone has paid/);

  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(mine.can_thank, true);
  assert.equal(mine.thanks, null);

  const sent = await call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: '  You​ <b>saved</b>\n\n me. ', emoji: '🙏' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.cart.thanks.message, 'You <b>saved</b> me.', 'one line, invisible characters gone, stored as text');
  assert.equal(sent.body.cart.thanks.emoji, '🙏');
  assert.equal(sent.body.cart.can_thank, false);
  assert.ok(!JSON.stringify(sent.body).includes('mom@example.com'), 'the payer’s email never reaches the requester');

  const again = await call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: 'one more' });
  assert.equal(again.status, 409, 'one thank-you per ask');
  const events = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.events.map((e) => e.kind);
  assert.ok(events.includes('thanked'));
});

test('💌 thanks: only the requester can send it', async (t) => {
  const { call, token, k, p } = await paidAsk(t);
  assert.equal((await call('POST', `/v1/carts/${token}/manage/thanks`, { message: 'hi' })).status, 404, 'no key');
  assert.equal((await call('POST', `/v1/carts/${token}/manage/thanks`, { k: p, message: 'hi' })).status, 404, 'the payer’s receipt link is not the manage key');
  assert.equal((await call('POST', `/v1/carts/${token}/manage/thanks`, { k: `${k.slice(0, -2)}xx`, message: 'hi' })).status, 404);
  // JSON only: a form post from another site can't send one.
  const form = await call('POST', `/v1/carts/${token}/manage/thanks`, `k=${k}&message=hi`, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const mine = (await call('GET', `/v1/carts/${token}/manage?k=${k}`)).body.cart;
  assert.equal(mine.thanks, null);
});

test('💌 thanks: length, emoji and link rules', async (t) => {
  const { call, token, k } = await paidAsk(t);
  const post = (body) => call('POST', `/v1/carts/${token}/manage/thanks`, { k, ...body });
  assert.equal((await post({ message: 'x'.repeat(281) })).status, 400);
  assert.equal((await post({ message: '   ' })).status, 400);
  assert.equal((await post({ message: 'thanks', emoji: '💩' })).status, 400);
  assert.equal((await post({ message: 'thanks, see https://evil.test' })).status, 400);
  assert.equal((await post({ message: 'go to evil.com now' })).status, 400);
  // 280 is fine, counted as characters (emoji count once).
  const ok = await post({ message: `${'🥹'.repeat(10)}${'y'.repeat(270)}`, emoji: null });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.cart.thanks.emoji, null);
});

test('💌 thanks: the payer is emailed and sees it on their receipt, nobody else does', async (t) => {
  const { call, emails, token, k, p } = await paidAsk(t);
  await call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: 'You’re the <best> & I owe you', emoji: '❤️' });

  await until(() => emails.some((m) => m.to[0] === 'mom@example.com' && /says thanks/.test(m.subject)), 'the thank-you email');
  const mail = emails.find((m) => /says thanks/.test(m.subject));
  assert.equal(mail.subject, 'Kyle says thanks ❤️: You’re the <best> & I owe you');
  assert.match(mail.text, /^Kyle says thanks ❤️: “You’re the <best> & I owe you”/);
  assert.match(mail.html, /You’re the &lt;best&gt; &amp; I owe you/, 'escaped in the email');
  assert.ok(!mail.html.includes('<best>'));
  const link = mail.html.match(/href="(https:\/\/spotmeplease\.com\/c\/[\w-]+\/receipt\?p=[\w-]+)"/)[1];
  assert.equal(new URL(link).searchParams.get('p'), p, 'links back to the payer’s receipt');
  assert.match(mail.html, /\/new/, 'and invites them to make their own Spot');
  assert.equal(emails.filter((m) => /says thanks/.test(m.subject)).length, 1);

  // The payer's receipt shows it.
  const rec = (await call('GET', `/v1/carts/${token}/receipt?p=${encodeURIComponent(p)}`)).body;
  assert.deepEqual({ message: rec.thanks.message, emoji: rec.thanks.emoji, from: rec.thanks.from }, { message: 'You’re the <best> & I owe you', emoji: '❤️', from: 'Kyle Riggle' });
  assert.ok(!JSON.stringify(rec).includes('kyle@example.com'), 'the requester’s email never reaches the payer');
  const page = await call('GET', `/c/${token}/receipt?p=${encodeURIComponent(p)}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /says thanks/);
  assert.match(page.body, /\.thx-quote\{/, 'thank-you styles are on the receipt page');
  for (const s of scriptsOf(page.body)) new Function(s); // parses

  // Not on the public link, not on the public cart.
  const pub = (await call('GET', `/v1/carts/${token}`)).body;
  assert.equal(pub.cart.thanks, undefined);
  const pay = await call('GET', `/c/${token}`);
  assert.ok(!pay.body.includes('I owe you'));
  assert.equal((await call('GET', `/v1/carts/${token}/receipt?p=nope`)).status, 404);
});

test('💌 thanks: the requester page has the composer and its script parses', async (t) => {
  const { call, token, k } = await paidAsk(t);
  const page = await call('GET', `/c/${token}/manage?k=${k}`);
  assert.equal(page.status, 200);
  assert.match(page.body, /a thank-you/);
  assert.match(page.body, /\/manage\/thanks/);
  for (const s of scriptsOf(page.body)) new Function(s); // parses
});

test('💌 thanks: no email on file, still saved for the receipt', async (t) => {
  const { call, emails, token, k, p } = await paidAsk(t, { payer_name: 'Sam' });
  const sent = await call('POST', `/v1/carts/${token}/manage/thanks`, { k, message: 'Thank you, Sam.' });
  assert.equal(sent.status, 200);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!emails.some((m) => /says thanks/.test(m.subject)));
  assert.equal((await call('GET', `/v1/carts/${token}/receipt?p=${encodeURIComponent(p)}`)).body.thanks.message, 'Thank you, Sam.');
});

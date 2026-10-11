import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { renderTemplate, firstNameOf, textToHtml, buildMessage, unsubscribeToken, readUnsubscribeToken, verifyWebhook, signWebhook, parseAddress, looksLikeOptOut, isAutoReply, stripQuoted, htmlToText, relationship, canEmail, STARTER_TEMPLATES } from '../src/sales-email.js';

test('merge fields: values, fallbacks, and what is missing or unknown', () => {
  const r = renderTemplate('Hi {{first_name|there}}, about {{ company | your business }} and {{build}}. {{nope}} {{sender}}', { first_name: 'Dana', company: '', build: '', sender: 'Kyle' });
  assert.equal(r.text, 'Hi Dana, about your business and . Kyle'.replace('. Kyle', '.  Kyle'));
  assert.deepEqual(r.missing, ['build']); assert.deepEqual(r.unknown, ['nope']);
  assert.equal(renderTemplate('{{first_name|there}}', {}).text, 'there'); assert.deepEqual(renderTemplate('{{company}}', { company: ' Acme ' }).missing, []);
  assert.equal(firstNameOf('Dana Reyes'), 'Dana'); assert.equal(firstNameOf('dana@x.com'), ''); assert.equal(firstNameOf(''), '');
  for (const t of STARTER_TEMPLATES) { const x = renderTemplate(t.subject + t.body, { sender: 'Kyle' }); assert.deepEqual([x.missing, x.unknown], [[], []], t.name + ' needs nothing the contact might lack'); }
});

test('the message is escaped, linked, and always carries the footer, the mailing address and the unsubscribe headers', () => {
  const m = buildMessage({ subject: 'Hi', body: 'Hello <b>there</b> & see https://builds.thefuturebasics.com/x.\n\nSecond paragraph', senderName: 'Kyle', postalAddress: '1 Main St\nPhiladelphia, PA 19103', unsubscribeUrl: 'https://hub.example/u/abc' });
  assert.ok(m.html.includes('&lt;b&gt;there&lt;/b&gt; &amp;') && !m.html.includes('<b>there'), 'nothing typed becomes markup');
  assert.ok(m.html.includes('<a href="https://builds.thefuturebasics.com/x">'), 'links work and the full stop stays outside');
  assert.ok(m.text.includes('1 Main St\nPhiladelphia, PA 19103') && m.text.includes('Unsubscribe here: https://hub.example/u/abc') && m.html.includes('Unsubscribe</a>'), 'address and a way out in both versions');
  assert.deepEqual(m.headers, { 'List-Unsubscribe': '<https://hub.example/u/abc>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
  assert.equal(textToHtml('a\nb\n\nc').split('<p').length - 1, 2, 'blank line = paragraph, single newline = line break');
});

test('unsubscribe links are signed and cannot be forged for another contact', () => {
  const id = '3f2b8c1e-aaaa-4bbb-8ccc-0123456789ab', t = unsubscribeToken(id, 's3cret');
  assert.equal(readUnsubscribeToken(t, 's3cret'), id); assert.equal(readUnsubscribeToken(t, 'other'), null);
  assert.equal(readUnsubscribeToken(id + '.' + 'x'.repeat(22), 's3cret'), null); assert.equal(readUnsubscribeToken('3f2b8c1e-aaaa-4bbb-8ccc-0123456789ac.' + t.split('.')[1], 's3cret'), null, 'a signature for one contact does not open another');
  assert.equal(readUnsubscribeToken('', 's3cret'), null); assert.equal(readUnsubscribeToken('not-a-token', 's3cret'), null);
});

test('the webhook signature is checked the way Resend (Svix) makes it, with a time limit', () => {
  const secret = 'whsec_' + Buffer.from('a-test-signing-key').toString('base64'), body = '{"type":"email.delivered"}', id = 'msg_123', ts = String(Math.floor(Date.now() / 1000));
  const independent = 'v1,' + createHmac('sha256', Buffer.from('a-test-signing-key')).update(`${id}.${ts}.${body}`).digest('base64');
  assert.equal(signWebhook({ id, timestamp: ts, rawBody: body, secret }), independent, 'our signer matches an independent computation');
  assert.equal(verifyWebhook({ id, timestamp: ts, signature: independent, rawBody: body, secret }), true);
  assert.equal(verifyWebhook({ id, timestamp: ts, signature: 'v1,AAAA ' + independent, rawBody: body, secret }), true, 'any of several signatures may match');
  assert.equal(verifyWebhook({ id, timestamp: ts, signature: independent, rawBody: body + ' ', secret }), false, 'a changed body fails');
  assert.equal(verifyWebhook({ id, timestamp: ts, signature: independent, rawBody: body, secret: 'whsec_' + Buffer.from('other').toString('base64') }), false);
  assert.equal(verifyWebhook({ id, timestamp: String(Number(ts) - 3600), signature: signWebhook({ id, timestamp: String(Number(ts) - 3600), rawBody: body, secret }), rawBody: body, secret }), false, 'an old one is refused (replay)');
  assert.equal(verifyWebhook({ id, timestamp: ts, signature: '', rawBody: body, secret }), false); assert.equal(verifyWebhook({ id, timestamp: ts, signature: independent, rawBody: body, secret: '' }), false);
});

test('reading replies: the sender, opt-outs, automatic replies, and the quoted history', () => {
  assert.deepEqual(parseAddress('Dana Reyes <Dana@Salon.COM>'), { email: 'dana@salon.com', name: 'Dana Reyes' }); assert.deepEqual(parseAddress('"Reyes, Dana" <d@x.co>'), { email: 'd@x.co', name: 'Reyes, Dana' }); assert.equal(parseAddress('plain@x.co').email, 'plain@x.co'); assert.equal(parseAddress({ email: 'O@X.co', name: 'O' }).email, 'o@x.co');
  for (const yes of ['Unsubscribe', 'STOP', 'Please remove me from your list.', 'Hi, please stop emailing me.', 'unsubscribe me\n\n> original', 'Take me off this list']) assert.equal(looksLikeOptOut(yes), true, yes);
  for (const no of ['Sounds good, can we talk Tuesday?', 'I cannot stop thinking about the nail spa site', 'Thanks!\n\n> Unsubscribe here: https://x/u/1']) assert.equal(looksLikeOptOut(no), false, no);
  assert.equal(isAutoReply({ headers: { 'Auto-Submitted': 'auto-replied' } }), true); assert.equal(isAutoReply({ subject: 'Out of Office: back Monday' }), true); assert.equal(isAutoReply({ headers: { 'Auto-Submitted': 'no' }, subject: 'Re: hello' }), false);
  assert.equal(stripQuoted('Yes, Tuesday works.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Kyle <kyle@mail.thefuturebasics.com> wrote:\n> Hi Dana'), 'Yes, Tuesday works.');
  assert.equal(stripQuoted('Thanks\n> quoted'), 'Thanks'); assert.equal(htmlToText('<p>Hi&nbsp;<b>there</b></p><p>Bye &amp; thanks</p><style>x{}</style>'), 'Hi there\nBye & thanks');
});

test('who may be emailed: a relationship, no opt-outs, a postal address, a daily limit; and what a person may override', () => {
  const ok = { email: 'a@b.co', unsubscribed: false, emailOk: true }, settings = { postalAddress: '1 Main St', fromAddress: 'k@m.co', dailyCap: 60 };
  assert.deepEqual(relationship({ clientId: 'x' }), { ok: true, why: 'a Future Basics client' }); assert.equal(relationship({ kinds: ['note', 'system'] }).ok, false); assert.equal(relationship({ kinds: ['showcase_demo'] }).why, 'opened a live build'); assert.equal(relationship({ invited: true }).ok, true);
  assert.equal(canEmail({ contact: ok, rel: { ok: true }, settings }).ok, true);
  const r = canEmail({ contact: ok, rel: { ok: false }, settings }); assert.deepEqual([r.ok, r.needsConfirmation], [false, true]); assert.equal(canEmail({ contact: ok, rel: { ok: false }, settings, confirmed: true }).ok, true, 'staff can confirm a relationship the record does not show');
  for (const [why, args, re] of [['unsubscribed', { suppressed: 'unsubscribed' }, /unsubscribed/], ['bounced', { suppressed: 'bounced' }, /bounced/], ['complained', { suppressed: 'complained' }, /spam/], ['flag', { contact: { ...ok, emailOk: false } }, /not to be emailed/], ['no address', { contact: { email: '' } }, /no email address/], ['no postal', { settings: { ...settings, postalAddress: ' ' } }, /mailing address/], ['cap', { sentToday: 60 }, /limit of 60/], ['not configured', { configured: false }, /not switched on/]]) {
    const x = canEmail({ contact: ok, rel: { ok: true }, settings, ...args, confirmed: true }); assert.equal(x.ok, false, why + ' cannot be overridden by confirming'); assert.ok(x.reasons.some(s => re.test(s)), why + ': ' + x.reasons);
  }
});

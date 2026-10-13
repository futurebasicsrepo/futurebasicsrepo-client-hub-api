import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanOnboarding, staffHandle, cleanHandle, joinLink, textFor, summaryRows } from '../src/onboarding.js';
import { renderTemplate, STARTER_TEMPLATES, MERGE_FIELDS } from '../src/sales-email.js';

const good = { name: 'Phil Reed', company: 'Common Ground', phone: '(555) 010-2233', goal: 'A new storefront and an offers flow.' };

test('onboarding needs a name, company, a mobile number and what they want done', () => {
  assert.equal(cleanOnboarding(good).value.name, 'Phil Reed');
  for (const [k, field] of [['name', 'name'], ['company', 'company'], ['phone', 'phone'], ['goal', 'goal']]) {
    const r = cleanOnboarding({ ...good, [k]: '' }); assert.equal(r.field, field); assert.ok(r.error);
  }
  assert.equal(cleanOnboarding({ ...good, phone: '12-34' }).field, 'phone');
});
test('onboarding tidies websites and refuses what is not one', () => {
  assert.equal(cleanOnboarding({ ...good, website: 'commonground12.com' }).value.website, 'https://commonground12.com');
  assert.equal(cleanOnboarding({ ...good, storeUrl: 'cg.myshopify.com/' }).value.storeUrl, 'https://cg.myshopify.com');
  assert.equal(cleanOnboarding({ ...good, website: 'not a site' }).field, 'website');
  assert.equal(cleanOnboarding({ ...good, billingEmail: 'nope' }).field, 'billingEmail');
  assert.equal(cleanOnboarding({ ...good, billingEmail: 'AP@Brand.com' }).value.billingEmail, 'ap@brand.com');
});
test('onboarding only keeps known choices and a whole address', () => {
  const v = cleanOnboarding({ ...good, storePlatform: 'magento', contactPref: 'pigeon' }).value;
  assert.equal(v.storePlatform, ''); assert.equal(v.contactPref, 'email');
  assert.equal(cleanOnboarding({ ...good, storePlatform: 'shopify', contactPref: 'text' }).value.contactPref, 'text');
  assert.equal(cleanOnboarding({ ...good, address: { city: 'Austin' } }).field, 'address');
  assert.equal(cleanOnboarding({ ...good, address: { line1: '1 Main St', city: 'Austin', region: 'TX' } }).value.address.city, 'Austin');
  assert.equal(cleanOnboarding({ ...good, goal: 'x'.repeat(5000) }).value.goal.length, 2000);
});
test('the summary lists only what was given', () => {
  const rows = summaryRows(cleanOnboarding({ ...good, role: 'Owner', storePlatform: 'shopify' }).value);
  assert.ok(rows.some(r => r[0] === 'Name' && /Owner/.test(r[1])) && rows.some(r => r[0] === 'Store' && /Shopify/.test(r[1])) && !rows.some(r => r[0] === 'Website'));
});

test('a staff handle is the part before the @, and nothing odd gets through', () => {
  assert.equal(staffHandle('Kyle@thefuturebasics.com'), 'kyle');
  assert.equal(staffHandle('first.last@thefuturebasics.com'), 'first-last');
  assert.equal(cleanHandle('kyle'), 'kyle'); assert.equal(cleanHandle('Kyle'), 'kyle');
  for (const bad of ['', '<script>', '../x', 'a b', '-x', 'x'.repeat(31)]) assert.equal(cleanHandle(bad), '', bad);
});
test('the join link is short, carries the sender, and fills in what we know', () => {
  assert.equal(joinLink('https://hub.example.com/', { handle: 'kyle' }), 'https://hub.example.com/j/kyle');
  assert.equal(joinLink('https://hub.example.com'), 'https://hub.example.com/j');
  const l = joinLink('https://hub.example.com', { handle: 'kyle', name: 'Phil Reed', email: 'phil+cg@brand.com', company: 'Common Ground' });
  const u = new URL(l); assert.equal(u.pathname, '/j/kyle'); assert.equal(u.searchParams.get('email'), 'phil+cg@brand.com'); assert.equal(u.searchParams.get('company'), 'Common Ground');
  assert.equal(joinLink('https://hub.example.com', { handle: '<x>' }), 'https://hub.example.com/j');
});
test('the text is one short message with the link in it', () => {
  const t = textFor({ link: 'https://hub.example.com/j/kyle', from: 'Kyle', to: 'Phil' });
  assert.match(t, /^Hi Phil, it's Kyle at Future Basics\./); assert.ok(t.endsWith('https://hub.example.com/j/kyle')); assert.ok(t.length < 300);
  assert.match(textFor({ link: 'x' }), /^Hi, Here is/);
});

test('the hub invite email is a starter, uses {{join_link}}, and works even when the link is not known', () => {
  assert.ok(MERGE_FIELDS.includes('join_link'));
  const t = STARTER_TEMPLATES.find(x => x.name === 'Open your Future Basics hub'); assert.ok(t);
  const bare = renderTemplate(t.subject + t.body, { sender: 'Kyle' }); assert.deepEqual([bare.missing, bare.unknown], [[], []]);
  assert.match(bare.text, /hub\.thefuturebasics\.com\/join/);
  const full = renderTemplate(t.body, { first_name: 'Phil', company: 'Common Ground', sender: 'Kyle', join_link: 'https://hub.example.com/j/kyle?email=p%40b.co' });
  assert.match(full.text, /Hi Phil,/); assert.match(full.text, /https:\/\/hub\.example\.com\/j\/kyle\?email=p%40b\.co/);
});

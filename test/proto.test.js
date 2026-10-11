import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIp, cleanSiteUrl, safeFetch, extractFacts, pickSubpages, mergeFacts, crawlSite, auditSite } from '../src/proto-crawl.js';
import { INDUSTRIES, detectIndustry, industryByKey, FEATURES } from '../src/proto-industry.js';

const BAD = `<html><head><title>Home</title></head><body bgcolor="#ffffff"><center><font face="Arial" color="#cc0000">JOE'S PLUMBING</font></center>
<table><tr><td><a href="/services.html">Services</a></td><td><a href="/contact.html">Contact</a></td></tr></table>
<p>Call us at 215-555-0142 for all your plumbing needs. We fix leaks, drains and water heaters in Norristown PA 19401.</p><ul><li>Drain cleaning</li><li>Water heaters</li><li>Leak repair</li></ul>
<img src="/img/van.jpg"><script src="/js/jquery-1.7.2.min.js"></script><div>&copy; 2014 Joe's Plumbing</div></body></html>`;
const GOOD = `<!doctype html><html lang="en"><head><title>Acme Electric: 24/7 Electricians in Austin, TX | Licensed and Insured</title><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Licensed electricians."><meta property="og:image" content="/og.jpg"><link rel="canonical" href="https://acme.test/">
<style>.btn{background:#ff6a00;color:#fff;font-family:'Inter',sans-serif}.hd{color:#1f2a44}</style>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Electrician","name":"Acme Electric"}</script></head><body>
<nav><a href="/">Home</a><a href="/services">Services</a><a href="/about">About</a><a href="/contact">Contact</a></nav>
<h1>Austin's licensed electricians, answering 24/7</h1><a href="tel:+15125550199">Call (512) 555-0199</a><p>Free estimates. Licensed and insured. Five-star reviews from 400 customers. Serving Austin and surrounding areas. Book online today.</p>
<form><input name="q"></form><img src="/a.jpg" alt="Van"><footer>&copy; ${new Date().getFullYear()} Acme Electric</footer></body></html>`;

test('addresses we will and will not fetch', () => {
  for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.5', '172.16.0.1', '100.64.0.1', '::1', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '0.0.0.0', '224.0.0.1']) assert.equal(isPublicIp(ip), false, ip);
  for (const ip of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicIp(ip), true, ip);
  assert.equal(cleanSiteUrl('joesplumbing.com').url, 'https://joesplumbing.com/');
  assert.equal(cleanSiteUrl('http://www.joes-plumbing.com/about#x').host, 'joes-plumbing.com');
  for (const bad of ['', 'localhost', 'http://127.0.0.1/', 'ftp://x.com', 'https://user:pw@x.com', 'https://a.com:8080', 'http://intranet.local', 'http://10.1.1.1', 'nodot', 'https://169.254.169.254/latest']) assert.ok(cleanSiteUrl(bad).error, bad);
});

const res = (status, body, headers = {}) => ({ status, headers: { get: k => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => Buffer.from(body), body: null });
const pub = async () => [{ address: '93.184.216.34' }];

test('fetching: redirects are followed and checked, private lookups refused, size and time capped', async () => {
  const calls = [];
  const f = async (u, o) => { calls.push(u); if (u === 'https://a.test/') return res(301, '', { location: '/home' }); return res(200, '<html>ok</html>', { 'content-type': 'text/html' }); };
  const r = await safeFetch('https://a.test/', { fetchImpl: f, lookup: pub }); assert.equal(r.status, 200); assert.equal(r.url, 'https://a.test/home'); assert.deepEqual(calls, ['https://a.test/', 'https://a.test/home']);
  await assert.rejects(() => safeFetch('https://a.test/', { fetchImpl: f, lookup: async () => [{ address: '10.0.0.5' }] }), /public website/);
  await assert.rejects(() => safeFetch('https://a.test/', { fetchImpl: async () => res(302, '', { location: 'http://169.254.169.254/' }), lookup: pub }), /public website/);
  await assert.rejects(() => safeFetch('https://a.test/', { fetchImpl: async u => res(302, '', { location: u }), lookup: pub }), /too many times/);
  await assert.rejects(() => safeFetch('https://a.test/', { fetchImpl: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, lookup: pub }), /longer than/);
  await assert.rejects(() => safeFetch('https://nope.test/', { fetchImpl: f, lookup: async () => { throw new Error('ENOTFOUND'); } }), /could not be found/);
  const big = await safeFetch('https://a.test/', { fetchImpl: async () => res(200, 'x'.repeat(5000), { 'content-type': 'text/html' }), lookup: pub, maxBytes: 1000 }); assert.equal(big.truncated, true); assert.equal(big.text.length, 1000);
});

test('what is read from a tired site and from a good one', () => {
  const b = extractFacts(BAD, 'http://joes.test/');
  assert.equal(b.title, 'Home'); assert.deepEqual(b.phones, ['(215) 555-0142']); assert.equal(b.tech.viewport, false); assert.equal(b.tech.https, false); assert.ok(b.tech.fontTags >= 2); assert.equal(b.tech.jquery, '1.7'); assert.equal(b.copyrightYear, 2014);
  assert.ok(b.services.includes('Drain cleaning')); assert.equal(b.tech.imgsNoAlt, 1); assert.equal(b.navLabels.length, 0, 'no <nav> element');
  const g = extractFacts(GOOD, 'https://acme.test/');
  assert.deepEqual(g.phones, ['(512) 555-0199']); assert.equal(g.tech.telLinks, 1); assert.equal(g.tech.viewport, true); assert.deepEqual(g.schemaTypes, ['Electrician']); assert.equal(g.tech.hasOg, true);
  assert.ok(g.signals.emergency && g.signals.licensed && g.signals.freeEstimate && g.signals.serviceArea && g.signals.reviews && g.signals.booking);
  assert.ok(g.colors.includes('#ff6a00') && g.colors.includes('#1f2a44')); assert.ok(g.fonts.includes('Inter')); assert.deepEqual(g.navLabels, ['Home', 'Services', 'About', 'Contact']); assert.equal(g.ogImage, 'https://acme.test/og.jpg');
});

test('the audit tells a tired site from a good one and says what to pitch', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const bad = auditSite(extractFacts(BAD, 'http://joes.test/', { ms: 900, bytes: 4000 }), { now }), good = auditSite(extractFacts(GOOD, 'https://acme.test/', { ms: 300, bytes: 5000 }), { now });
  assert.ok(bad.score < 40 && bad.grade === 'bad', String(bad.score)); assert.ok(good.score >= 80 && good.grade === 'good', String(good.score));
  const ids = bad.issues.map(i => i.id); for (const id of ['no-viewport', 'no-https', 'no-tap-to-call', 'old-markup', 'old-jquery', 'stale', 'no-reviews', 'no-form', 'bad-title']) assert.ok(ids.includes(id), id);
  assert.equal(bad.top.length, 4); assert.ok(bad.top[0].pitch.length > 30); assert.ok(bad.issues[0].weight >= bad.issues[1].weight, 'worst first');
  assert.equal(bad.quickTurn, true);
  const shop = auditSite(extractFacts('<html><head><title>Big shop online</title></head><body><nav>' + '<a href="/a">A</a>'.repeat(14) + '</nav><p>Add to cart. Checkout now. ' + 'x'.repeat(500) + '</p></body></html>', 'https://s.test/'), { now });
  assert.equal(shop.quickTurn, false, 'a shop or a very large nav is not a quick turn');
});

test('the pages worth reading after the home page, and what they add', () => {
  const home = extractFacts(`<html><body><a href="/our-services">Our services</a><a href="/about-us">About</a><a href="https://other.test/contact">Contact</a><a href="/contact-us">Contact us</a><a href="/files/brochure.pdf">Brochure</a><a href="/">Home</a></body></html>`, 'https://joes.test/');
  assert.deepEqual(pickSubpages(home), ['https://joes.test/our-services', 'https://joes.test/about-us', 'https://joes.test/contact-us']);
  const sub = extractFacts('<html><head><title>Services</title></head><body><h2>Sewer repair</h2><ul><li>Trenchless sewer repair</li></ul><p>Call 610-555-0111. Free estimates.</p></body></html>', 'https://joes.test/our-services');
  const m = mergeFacts(home, [sub]); assert.ok(m.services.includes('Trenchless sewer repair')); assert.ok(m.phones.includes('(610) 555-0111')); assert.equal(m.pages.length, 2); assert.equal(m.signals.freeEstimate, true);
});

test('crawling a small site end to end, with the network stood in', async () => {
  const pages = { 'https://joes.test/': BAD.replace('Services</a>', 'Services</a><a href="/services.html">Plumbing services</a>'), 'https://joes.test/services.html': '<html><head><title>Plumbing services</title></head><body><ul><li>Sewer line repair</li></ul></body></html>' };
  const f = await crawlSite('joes.test', { fetchImpl: async u => pages[u] ? res(200, pages[u], { 'content-type': 'text/html' }) : res(404, ''), lookup: pub });
  assert.equal(f.host, 'joes.test'); assert.ok(f.pages.length >= 1); assert.ok(f.services.includes('Drain cleaning'));
  await assert.rejects(() => crawlSite('joes.test', { fetchImpl: async () => res(403, ''), lookup: pub }), /403.*block/);
  await assert.rejects(() => crawlSite('joes.test', { fetchImpl: async () => res(200, '%PDF', { 'content-type': 'application/pdf' }), lookup: pub }), /not a web page/);
});

test('which trade a site is', () => {
  const f = t => ({ title: t, host: '', h1: [], description: '', text: '', extraText: '', services: [], h2: [] });
  assert.equal(detectIndustry(f("Joe's Plumbing and Drain: water heaters, sewer repair")).key, 'plumbing');
  assert.equal(detectIndustry(f('Bright Spark Electric: panel upgrades and EV chargers')).key, 'electrician');
  assert.equal(detectIndustry(f('Comfort Care at Home: senior care, dementia and respite care')).key, 'home-health');
  assert.equal(detectIndustry(f('Riverbend Roofing: shingle roof replacement and gutters')).key, 'roofing');
  assert.equal(detectIndustry(f('Smith Carpentry: decks, cabinets and kitchen remodeling')).key, 'carpentry');
  assert.equal(detectIndustry(f('Acme Widgets')).key, 'trade');
  assert.deepEqual(detectIndustry(f('Acme Widgets'), 'hvac'), { key: 'hvac', confidence: 1, from: 'chosen' });
  assert.equal(detectIndustry(f('Acme Widgets'), 'nonsense').key, 'trade');
});

test('every playbook is complete and its features exist', () => {
  assert.ok(INDUSTRIES.length >= 9); const keys = new Set();
  for (const i of INDUSTRIES) { assert.ok(!keys.has(i.key)); keys.add(i.key); assert.ok(i.label && i.schema && i.audience && i.tone && i.cta.length === 2 && i.sections.length >= 8 && i.services.length && i.faqs.length >= 4 && i.accent.length === 2, i.key); for (const f of i.features) assert.ok(FEATURES[f], `${i.key}: ${f}`); }
  assert.equal(industryByKey('nope').key, 'trade');
});

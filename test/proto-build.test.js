import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFacts, auditSite } from '../src/proto-crawl.js';
import { buildBrief, templateSite, qaCheck, autofix, extractHtml, generateWithClaude, buildPrototype, protoCostCents, STANDARD, userPrompt } from '../src/proto-build.js';

const SITE = `<html><head><title>Joe's Plumbing and Drain | Norristown PA</title><style>.a{color:#c1272d}.b{background:#1f2a44}</style></head><body><h1>Joe's Plumbing</h1>
<p>Family plumbers serving Norristown PA 19401. Call 215-555-0142. Licensed and insured. Free estimates.</p><ul><li>Drain cleaning</li><li>Water heaters</li><li>Sewer line repair</li><li>Leak detection</li></ul>
<img src="/img/van.jpg" alt="van" width="800"><img src="/img/logo.png" alt="logo"><a href="tel:2155550142">Call</a></body></html>`;
const facts = () => ({ ...extractFacts(SITE, 'https://joes.test/'), inputUrl: 'https://joes.test/', host: 'joes.test' });
const brief = () => { const f = facts(); return buildBrief(f, auditSite(f), 'plumbing'); };

test('the brief carries their facts and flags everything else', () => {
  const b = brief();
  assert.equal(b.name, "Joe's Plumbing and Drain"); assert.equal(b.contact.phone, '(215) 555-0142'); assert.equal(b.city, 'Norristown, PA'); assert.equal(b.servicesFrom, 'their site'); assert.ok(b.services.includes('Sewer line repair'));
  assert.deepEqual(b.colors.slice(0, 2), ['#c1272d', '#1f2a44']); assert.equal(b.colorsFrom, 'their site'); assert.ok(b.images.some(i => i.src.endsWith('/img/van.jpg')) && !b.images.some(i => /logo/.test(i.src)));
  assert.ok(b.proof.licensed && b.proof.freeEstimate && !b.proof.reviews); assert.ok(b.features.some(f => f.id === 'hero-motion') && b.features.some(f => f.id === 'problem-picker'));
  const bare = buildBrief({ ...facts(), services: [], colors: [], title: '', h1: [], host: 'smith-electric.com' }, null, 'electrician', {}); assert.equal(bare.servicesFrom, 'the trade (illustrative)'); assert.equal(bare.colorsFrom, 'the trade'); assert.equal(bare.name, 'Smith Electric');
  assert.equal(buildBrief(facts(), null, 'plumbing', { company: 'Joe & Sons' }).name, 'Joe & Sons');
  assert.ok(STANDARD.includes('prefers-reduced-motion') && userPrompt(b).includes('Sewer line repair') && !userPrompt(b).includes('"problems"'));
});

test('the template passes the quality gate for every trade, and fixes nothing it should not', () => {
  for (const key of ['plumbing', 'electrician', 'hvac', 'roofing', 'carpentry', 'home-health', 'landscaping', 'painting', 'cleaning', 'trade']) {
    const f = facts(), b = buildBrief(f, auditSite(f), key), html = autofix(templateSite(b), b), qa = qaCheck(html, b);
    assert.ok(qa.pass, `${key}: ${qa.failed.map(c => c.label + ' ' + c.detail).join('; ')}`); assert.ok(qa.sizeKB < 60); assert.ok(qa.illustrative.length >= 3, 'sample content is flagged');
  }
  const f = facts(), b = buildBrief(f, null, 'plumbing'), html = templateSite(b); assert.equal(autofix(html, b).length, html.length, 'a good page is left alone besides lazy images');
});

test('the gate catches what makes a prototype unfit to show', () => {
  const b = brief(), good = autofix(templateSite(b), b), has = (html, id) => qaCheck(html, b).failed.some(c => c.id === id);
  assert.ok(has(good.replace(/<meta name="viewport"[^>]*>/, ''), 'viewport')); assert.ok(has(good.replace(/<h1>/, '<h1>x</h1><h1>'), 'h1')); assert.ok(has(good.replace('</body>', '<script src="https://evil.test/x.js"></script></body>'), 'no-external-js'));
  assert.ok(has(good.replace('</body>', '<script>function(</script></body>'), 'no-external-js')); assert.ok(has(good.replace('<form class="q"', '<form action="https://evil.test/p" class="q"'), 'no-submit')); assert.ok(has(good.replace(/prefers-reduced-motion/g, 'x'), 'reduced-motion'));
  assert.ok(has(good.replace(/href="tel:[^"]*"/g, 'href="#"'), 'tel')); assert.ok(has(good.replace(/<footer/, '<div'), 'landmarks')); assert.ok(has(good + 'x'.repeat(500 * 1024), 'size')); assert.ok(has(good.replace('</main>', 'Lorem ipsum</main>'), 'no-lorem'));
  assert.ok(has(good.replace(/<script type="application\/ld\+json">[^<]*<\/script>/, '<script type="application/ld+json">{bad</script>'), 'schema')); assert.ok(has(good.replace('<img', '<img'), 'alt') === false);
  assert.ok(has('<html><body>hi</body></html>', 'doctype'));
});

test('autofix: the safe repairs', () => {
  const b = brief(), raw = '<html><head><title>x</title></head><body><h1>Hi</h1><img src="a.jpg"><a target="_blank" href="https://x.com">x</a><form action="https://evil.test/post" method="post"></form><script src="https://cdn.test/a.js"></script></body></html>';
  const fixed = autofix(raw, b);
  assert.match(fixed, /^<!doctype html>/i); assert.match(fixed, /<html lang="en">/); assert.match(fixed, /name="viewport"/); assert.match(fixed, /charset/); assert.match(fixed, /prefers-reduced-motion/); assert.match(fixed, /application\/ld\+json/);
  assert.ok(!/cdn\.test/.test(fixed) && !/action=/.test(fixed)); assert.match(fixed, /<img loading="lazy" alt="" src="a.jpg">|<img alt="" loading="lazy"/); assert.match(fixed, /rel="noopener noreferrer"/);
});

test('the HTML is found in an answer however it is wrapped', () => {
  assert.equal(extractHtml('Here you go:\n```html\n<!doctype html><html><body>x</body></html>\n```\nEnjoy'), '<!doctype html><html><body>x</body></html>');
  assert.equal(extractHtml('no page here'), ''); assert.match(extractHtml('<html><body>cut off'), /cut off$/);
});

const fakeClient = (text, usage = { input_tokens: 1000, output_tokens: 8000 }, stop = 'end_turn') => ({ messages: { stream: params => { fakeClient.last = params; return { finalMessage: async () => ({ content: [{ type: 'text', text }], usage, stop_reason: stop }) }; } } });

test('asking Claude: streamed, the standard as the system prompt, the page returned', async () => {
  const b = brief(), page = autofix(templateSite(b), b);
  const r = await generateWithClaude(b, { env: {}, client: fakeClient('```html\n' + page + '\n```') });
  assert.equal(r.html, page); assert.deepEqual(r.usage, { input: 1000, output: 8000 }); assert.equal(r.model, 'claude-opus-5-5'); assert.equal(fakeClient.last.system, STANDARD); assert.equal(fakeClient.last.model, 'claude-opus-5-5'); assert.equal(fakeClient.last.max_tokens, 48000);
  assert.equal((await generateWithClaude(b, { env: { PROTOTYPE_MODEL: 'claude-sonnet-5-5' }, client: fakeClient(page) })).model, 'claude-sonnet-5-5');
  await assert.rejects(() => generateWithClaude(b, { env: {}, client: fakeClient('sorry', undefined, 'refusal') }), /declined/);
  await assert.rejects(() => generateWithClaude(b, { env: {}, client: fakeClient('no page') }), /did not send a web page/);
  await assert.rejects(() => generateWithClaude(b, { env: {} }), /ANTHROPIC_API_KEY/);
});

test('the whole step: a good answer, a repaired one, a failed one, and no Claude at all', async () => {
  const b = brief(), good = autofix(templateSite(b), b), steps = [], onStep = s => steps.push(s);
  let r = await buildPrototype(b, { env: { ANTHROPIC_API_KEY: 'k' }, onStep, generate: async () => ({ html: good, usage: { input: 10, output: 20 }, model: 'claude-opus-5-5' }) });
  assert.equal(r.model, 'claude-opus-5-5'); assert.ok(r.qa.pass); assert.equal(r.html, good); assert.deepEqual(r.usage, { input: 10, output: 20 });
  // first answer has two h1s, the repair is fine
  let n = 0; const broken = good.replace('<h1>', '<h1>a</h1><h1>');
  r = await buildPrototype(b, { env: { ANTHROPIC_API_KEY: 'k' }, onStep, generate: async (_b, o) => { n++; return { html: n === 1 ? broken : good, usage: { input: 10, output: 20 }, model: 'm' }; } });
  assert.equal(n, 2); assert.ok(r.qa.pass); assert.deepEqual(r.usage, { input: 20, output: 40 }); assert.ok(steps.some(s => /Fixing/.test(s)));
  // never fixed: the template stands in and says so
  r = await buildPrototype(b, { env: { ANTHROPIC_API_KEY: 'k' }, onStep, generate: async () => ({ html: '<html><body>nothing</body></html>', usage: { input: 1, output: 1 }, model: 'm' }) });
  assert.equal(r.model, 'template'); assert.ok(r.qa.pass); assert.match(r.note, /standard template/);
  r = await buildPrototype(b, { env: {}, onStep }); assert.equal(r.model, 'template'); assert.match(r.note, /not connected/); assert.ok(r.qa.pass);
  assert.equal(protoCostCents({ input: 1_000_000, output: 100_000 }, {}), 750); assert.equal(protoCostCents({ input: 1000, output: 8000 }, { PROTOTYPE_PRICE: '3,15' }), 12.3);
});

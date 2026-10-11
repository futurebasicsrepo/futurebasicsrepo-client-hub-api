import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFacts, auditSite } from '../src/proto-crawl.js';
import { buildBrief, templateSite, qaCheck, autofix, extractHtml, generateWithClaude, buildPrototype, protoCostCents, STANDARD, userPrompt, editPrompt, editWithClaude, editPrototype, changeSummary, stubEdit } from '../src/proto-build.js';

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

// ---------- the studio ----------
const good = () => { const b = brief(); return { b, html: autofix(templateSite(b), b) }; };
const reply = html => ({ html, usage: { input: 100, output: 200 }, model: 'm' });

test('what a change did is told in headings and size', () => {
  const a = '<main><h1>Joe</h1><h2>Services</h2><h2>Reviews</h2></main>', b = '<main><h1>Joe</h1><h2>Services</h2><h2>Our <em>work</em> &amp; gallery</h2></main>';
  const c = changeSummary(a, b); assert.deepEqual(c.added, ['Our work & gallery']); assert.deepEqual(c.removed, ['Reviews']); assert.equal(c.same, false); assert.ok(c.sizeKB >= 0);
  assert.equal(changeSummary(a, a).same, true); assert.deepEqual(changeSummary('', a).added, ['Joe', 'Services', 'Reviews']);
});

test('the change prompt carries the whole page, the instruction, the facts and the earlier changes', () => {
  const { b, html } = good(), p = editPrompt(html, 'Make the hero bolder', b, [{ instruction: 'Add a gallery' }]);
  assert.ok(p.includes(html) && p.includes('Make the hero bolder') && p.includes('Add a gallery') && p.includes('Sewer line repair') && !p.includes('"problems"'));
});

test('asking Claude for a change: streamed, the standard and the editing rules as the system prompt', async () => {
  const { b, html } = good(); let seen;
  const client = { messages: { stream: o => { seen = o; return { finalMessage: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here you go:\n```html\n' + html + '\n```' }], usage: { input_tokens: 5, output_tokens: 7 } }) }; } } };
  const r = await editWithClaude(html, 'Bolder hero', b, { client, env: {} });
  assert.equal(r.html, html); assert.deepEqual(r.usage, { input: 5, output: 7 }); assert.ok(seen.system.includes('THE STANDARD') && seen.system.includes('revising a prototype')); assert.ok(seen.messages[0].content.includes('Bolder hero'));
  const cut = { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '<!doctype html><html>' }], usage: {} }) }) } };
  await assert.rejects(() => editWithClaude(html, 'x', b, { client: cut, env: {} }), /too long/);
  await assert.rejects(() => editWithClaude(html, 'x', b, { env: {} }), /not connected/);
});

test('a change: applied when it holds up, repaired once, refused when it makes the page worse or throws the page away', async () => {
  const { b, html } = good(), env = { ANTHROPIC_API_KEY: 'k' }, steps = [];
  const ok = html.replace('</main>', '<section><h2>Our work</h2><p>Gallery</p></section></main>');
  let r = await editPrototype(html, 'Add a gallery', b, { env, onStep: t => steps.push(t), generate: async () => reply(ok) });
  assert.ok(r.qa.pass && r.html.includes('Our work') && r.usage.input === 100);
  // a first attempt that loses the phone link is repaired by the second
  const broken = ok.replace(/href="tel:[^"]*"/g, 'href="#"'); let calls = 0, extra;
  r = await editPrototype(html, 'Add a gallery', b, { env, onStep: t => steps.push(t), generate: async (h, i, br, o) => { calls++; extra = o.extra; return reply(calls === 1 ? broken : ok); } });
  assert.equal(calls, 2); assert.match(extra, /failed these required checks/); assert.ok(r.qa.pass && r.usage.input === 200 && steps.includes('Fixing what the quality check found'));
  // both attempts worse than the page it was given: nothing is changed, with the reason
  await assert.rejects(() => editPrototype(html, 'Remove the phone', b, { env, generate: async () => reply(broken) }), /break the quality check/);
  // a page that is mostly gone
  await assert.rejects(() => editPrototype(html, 'x', b, { env, generate: async () => reply('<!doctype html><html lang="en"><head><title>x</title></head><body>hi</body></html>') }), /much shorter|break the quality check/);
  // no Claude: said plainly, and a page that already failed a check is not blamed for it
  await assert.rejects(() => editPrototype(html, 'x', b, { env: {} }), /needs Claude connected/);
  const weak = html.replace(/<meta[^>]+name="description"[^>]*>/i, ''); assert.ok(!qaCheck(weak, b).pass);
  r = await editPrototype(weak, 'Add a gallery', b, { env, generate: async () => reply(weak.replace('</main>', '<section><h2>Work</h2></section></main>')) }); assert.ok(r.html.includes('Work'), 'an old failure does not block a change that adds none');
});

test('the test stand-in adds the instruction as a section and can be told to fail', async () => {
  const { b, html } = good(), r = await stubEdit(html, 'Add a <gallery>', b); assert.ok(r.qa.pass && r.html.includes('data-edit') && r.html.includes('&lt;gallery&gt;'));
  await assert.rejects(() => stubEdit(html, 'FAIL please', b), /break the quality check/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { generate, cleanAsk, cleanSvg, fixtureClaude, fixtureImage, parseDirections, fallbackDirections, imagePrompt, SEASONS, STYLES } from '../src/lab-graphic-gen.js';
import { traceVector, smoothPath, vectorPdf } from '../src/lab-vector.js';

const all = { claude: true, openai: true, google: true };

test('the ask is cleaned: inks, count and engines in range, a season gives its palette', () => {
  const a = cleanAsk({ brief: '  a  pumpkin ', inks: 40, count: 9, engines: ['openai', 'nope', 'openai'], season: 'halloween' });
  assert.equal(a.brief, 'a pumpkin'); assert.equal(a.inks, 8); assert.equal(a.count, 3); assert.deepEqual(a.engines, ['openai']);
  assert.deepEqual(a.palette, SEASONS.find(s => s.id === 'halloween').palette);
  assert.deepEqual(cleanAsk({}).engines, ['claude', 'openai', 'google']);
  assert.ok(STYLES.length >= 8);
});

test('all three engines draw at once and every answer comes back as ink paths', async () => {
  const r = await generate(cleanAsk({ brief: 'pumpkin patch', season: 'halloween', inks: 3 }), { ready: all, claude: fixtureClaude, image: fixtureImage, trace: traceVector });
  assert.deepEqual(r.results.map(x => x.engine).sort(), ['claude', 'google', 'openai']);
  assert.equal(r.directedBy, 'claude');
  for (const x of r.results) { assert.match(x.svg, /<path fill="#[0-9a-f]{6}"/); assert.ok(x.colours.length >= 1 && x.colours.length <= 3); }
  assert.ok(r.engines.every(e => e.ok && !e.error));
});

test('one engine failing does not stop the others, and says why', async () => {
  const image = (p, prompt) => (p === 'openai' ? Promise.reject(new Error('OpenAI is down (500)')) : fixtureImage(p, prompt));
  const r = await generate(cleanAsk({ brief: 'lanterns', count: 2 }), { ready: all, claude: fixtureClaude, image, trace: traceVector });
  assert.equal(r.results.length, 4); assert.ok(!r.results.some(x => x.engine === 'openai'));
  const o = r.engines.find(e => e.id === 'openai'); assert.equal(o.ok, false); assert.match(o.error, /down/);
});

test('without Claude the ideas come from the brief, and an engine that is not connected is reported', async () => {
  const claude = () => { throw new Error('no key'); };
  const r = await generate(cleanAsk({ brief: 'surf club', style: 'badge' }), { ready: { claude: true, openai: false, google: true }, claude, image: fixtureImage, trace: traceVector });
  assert.equal(r.directedBy, 'template'); assert.deepEqual(r.results.map(x => x.engine), ['google']);
  assert.equal(r.engines.find(e => e.id === 'openai').error, 'not connected'); assert.match(r.engines.find(e => e.id === 'claude').error, /no key/);
});

test('a slow engine times out without holding the rest', async () => {
  const image = (p, prompt) => (p === 'google' ? new Promise(() => {}) : fixtureImage(p, prompt));
  const r = await generate(cleanAsk({ brief: 'snow' , engines: ['openai', 'google'] }), { ready: all, claude: fixtureClaude, image, trace: traceVector, timeoutMs: 400 });
  assert.deepEqual(r.results.map(x => x.engine), ['openai']); assert.match(r.engines.find(e => e.id === 'google').error, /too long/);
});

test('nothing connected, or every engine failing, is an error that lists them', async () => {
  await assert.rejects(generate(cleanAsk({ brief: 'x y z' }), { ready: {}, claude: fixtureClaude, image: fixtureImage, trace: traceVector }), e => e.status === 503);
  await assert.rejects(generate(cleanAsk({ brief: 'x y z', engines: ['google'] }), { ready: all, claude: fixtureClaude, image: () => Promise.reject(new Error('refused')), trace: traceVector }), e => e.status === 502 && /Google refused/.test(e.message));
});

test('a model SVG is kept only when it is plain drawing', () => {
  assert.ok(cleanSvg('Here: <svg viewBox="0 0 10 10"><path fill="#000" d="M0 0L5 5Z"/></svg> done'));
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg><image href="http://x"/></svg>', '<svg><rect onload="x()"/></svg>', '<svg><rect fill="url(#g)"/></svg>', '<svg><foreignObject/></svg>', 'no svg'])
    assert.equal(cleanSvg(bad), null, bad);
});

test('directions: Claude\'s JSON is read, short lists are filled, and the image prompt asks for flat spot inks', () => {
  const ask = cleanAsk({ brief: 'cider', inks: 2 });
  const d = parseDirections('ok {"directions":[{"title":"Apple","prompt":"An apple crate label","palette":["#112233","#ffeedd","#000000"]}]}', ask, 3);
  assert.equal(d.length, 3); assert.equal(d[0].title, 'Apple'); assert.deepEqual(d[0].palette, ['#112233', '#ffeedd']);
  assert.equal(fallbackDirections(ask, 4).length, 4);
  assert.match(imagePrompt(d[0], ask, 'google'), /white background/); assert.match(imagePrompt(d[0], ask, 'openai'), /transparent/);
  assert.match(imagePrompt(d[0], ask, 'openai'), /exactly 2 solid spot ink colours/);
});

test('the trace keeps a real corner sharp', () => {
  const d = smoothPath([[0, 0], [100, 0], [100, 50], [0, 50]]);
  assert.match(d, /L100 0/); assert.match(d, /L0 50/);
});

test('the vector PDF has the art, then a film page per ink', async () => {
  const pdf = await vectorPdf({ inks: [{ hex: '#141416', pantone: 'Black C', fill: 'M0 0L100 0L100 100Z' }, { hex: '#f07b1e', pantone: '', fill: '', stroke: { d: 'M0 0L50 50', w: 4 } }], box: { x: 0, y: 0, w: 100, h: 100 }, widthIn: 4, name: 'T' });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3);
});

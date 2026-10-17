import test from 'node:test';
import assert from 'node:assert/strict';
import { brandHits, stripBrands, closeness, designWords, generateConcepts, aiOpinion, cleanSpec, cleanConceptEdit, productBrief, imagePrompt, renderConcept, conceptFixture, opinionFixture, PRODUCT_TYPES } from '../src/lab-concepts.js';
import { DEFAULT_BRAND_CODE } from '../src/lab.js';

const ENV = { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x' };

test('the guard finds other brands\' names and trade dress, with accents, spacing and hyphens, and not ordinary words', () => {
  assert.deepEqual(brandHits('A tee in the style of Ralph Lauren with a polo pony', []).sort(), ['Ralph Lauren', 'polo pony'].sort());
  assert.ok(brandHits('Aimé Leon Dore camp collar').includes('Aime Leon Dore')); assert.ok(brandHits('a-cold-wall style shell').includes('A-COLD-WALL')); assert.ok(brandHits('A COLD WALL shell').includes('A COLD WALL'));
  assert.ok(brandHits('a gg monogram print').includes('gg monogram')); assert.ok(brandHits('three stripes down the leg').includes('three stripes'));
  assert.deepEqual(brandHits('Wardrobe essentials: a champion fleece, a palace of a hem, Jordan almonds, a ballad', []), [], 'common words are not brands');
  assert.deepEqual(brandHits('Our boxy tee with a rib collar and a back-yoke seam', []), []);
  assert.deepEqual(brandHits('Made like Brandx jackets', ['Brandx']), ['Brandx'], 'the library\'s own brand names count');
  assert.deepEqual(brandHits('Made like Brandx jackets', ['Bx']), [], 'a very short name is ignored');
  assert.ok(!brandHits('shorts with a nikelike hem').length, 'a word merely containing a name is not a hit');
});

test('words for the image model have the names taken out', () => {
  const t = stripBrands('Inspired by Ralph Lauren and Aimé Leon Dore with a polo pony. A boxy tee.', []); assert.ok(!/ralph|lauren|leon|pony/i.test(t), t); assert.match(t, /boxy tee/);
  const p = imagePrompt({ name: 'Boxy tee in the style of Prada', category: 'tops', twist: 'a Gucci red tab', spec: { description: 'A boxy tee', silhouette: 'boxy', fabric: 'cotton', colors: ['navy'], details: ['rib collar'] } });
  assert.ok(!/prada|gucci|red tab/i.test(p), p); assert.match(p, /No text, no lettering, no logos/); assert.match(p, /rib collar/); assert.match(p, /no people/i); assert.ok(p.length < 3800);
});

const concept = (o = {}) => ({ name: 'Garden Overshirt', twist: 'A long back yoke seam that nobody else makes', spec: { description: 'A relaxed overshirt', silhouette: 'relaxed', fabric: 'brushed cotton twill', fit: 'easy', details: ['back yoke seam', 'hidden snap placket', 'chest patch pocket'], colors: ['olive'] }, ...o });
const ref = (o = {}) => ({ id: 'r1', title: 'Field Overshirt', brand: 'Ref', attrs: { silhouette: 'boxy', fabric: 'heavy denim', fit: 'wide', details: ['double needle stitching', 'brass buttons'] }, summary: '', ...o });

test('closeness: clear when the design words differ, check when close, too close when copied, too close on a brand name', () => {
  assert.equal(closeness(concept(), [ref()]).verdict, 'clear');
  const near = closeness(concept({ spec: { ...concept().spec, silhouette: 'boxy', fabric: 'heavy denim', fit: 'wide', details: ['double needle stitching', 'brass buttons', 'chest patch pocket'] } }), [ref()]);
  assert.equal(near.verdict, 'too_close'); assert.equal(near.nearest.sameDetails, 2); assert.ok(near.score >= 0.6, near.score);
  const mid = closeness(concept({ spec: { ...concept().spec, details: ['double needle stitching', 'brass buttons', 'hidden snap placket'] } }), [ref()]); assert.ok(['check', 'too_close'].includes(mid.verdict), mid.verdict); assert.ok(mid.reasons.length);
  const named = closeness(concept({ twist: 'Like the Ralph Lauren pony but ours' }), [ref()]); assert.equal(named.verdict, 'too_close'); assert.ok(named.hits.includes('Ralph Lauren')); assert.match(named.reasons[0], /Ralph Lauren/);
  const none = closeness(concept(), []); assert.equal(none.verdict, 'clear'); assert.ok(none.reasons.some(r => /nothing to compare/.test(r)), 'it says it had nothing to compare against');
  assert.equal(closeness(concept(), [ref()], { brandNames: ['Garden'] }).verdict, 'too_close', 'a library brand name in the concept is caught');
  assert.deepEqual([...designWords({ silhouette: 'Boxy', details: ['Rib collar'], fabric: 'The Cotton' })].sort(), ['boxy', 'collar', 'cotton', 'rib'].sort(), 'generic words and two-letter words are left out');
});

test('the second opinion can only make the verdict worse, and says why', () => {
  const clear = closeness(concept(), [ref()], { ai: { verdict: 'clear', reasons: [], fixes: [] } }); assert.equal(clear.verdict, 'clear'); assert.equal(clear.aiChecked, true);
  const close = closeness(concept(), [ref()], { ai: { verdict: 'close', reasons: ['Same shoulder line'], fixes: ['Drop the shoulder'] } }); assert.equal(close.verdict, 'check'); assert.ok(close.reasons.some(r => /Second opinion: Same shoulder line/.test(r))); assert.deepEqual(close.ai.fixes, ['Drop the shoulder']);
  assert.equal(closeness(concept({ twist: 'Ralph Lauren' }), [ref()], { ai: { verdict: 'clear', reasons: [], fixes: [] } }).verdict, 'too_close', 'a clean opinion does not undo a brand name');
  assert.equal(closeness(concept(), [ref()], { ai: { verdict: 'too_close', reasons: ['A copy'], fixes: [] } }).verdict, 'too_close');
});

test('asking for the second opinion and for concepts', async () => {
  assert.deepEqual((await aiOpinion({ concept: concept(), refs: [ref()], env: {} })).ai, null, 'with no AI there is simply no second opinion');
  let seen; const o = await aiOpinion({ concept: concept(), refs: [ref()], env: ENV, askImpl: async a => { seen = a; return { json: opinionFixture({ user: a.user }), usage: { input: 1000, output: 200 } }; } });
  assert.equal(o.ai.verdict, 'clear'); assert.match(seen.system, /IP-aware/); assert.match(seen.user, /Field Overshirt/); assert.ok(o.costCents > 0);
  assert.equal((await aiOpinion({ concept: concept({ spec: { description: 'an exact copy of it' } }), refs: [], env: ENV, askImpl: async a => ({ json: opinionFixture({ user: a.user }), usage: {} }) })).ai.verdict, 'too_close');
  await assert.rejects(() => generateConcepts({ line: { name: 'x', category: 'tops', role: 'core' }, env: {} }), /not connected/);
  let call; const g = await generateConcepts({ line: { name: 'Camp shirt', category: 'tops', role: 'core', brief: 'b', twist: 't', priceCents: 3800 }, plan: { name: 'Fall', season: 'FW27' }, refs: [{ title: 'Ref tee', attrs: { silhouette: 'boxy' } }], trend: { silhouettes: [{ name: 'boxy' }], fabrics: [], details: [], colors: [] }, code: DEFAULT_BRAND_CODE, count: 3, note: 'longer back', env: ENV, askImpl: async a => { call = a; return { json: conceptFixture({ user: a.user }), usage: { input: 3000, output: 1500 } }; } });
  assert.equal(g.concepts.length, 3); assert.equal(new Set(g.concepts.map(c => c.name)).size, 3, 'each concept has its own name'); assert.ok(g.concepts.every(c => c.twist.length > 15 && c.spec.details.length >= 2 && c.spec.colors.length === 1)); assert.ok(g.costCents > 0);
  assert.match(call.system, /NEVER name another brand/); assert.match(call.system, /Zara/); assert.match(call.user, /Steer: longer back/); assert.match(call.user, /Make 3 different/); assert.match(call.user, /\$38/);
  assert.equal((await generateConcepts({ line: { name: 'x', category: 'tops', role: 'core' }, count: 99, env: ENV, askImpl: async a => ({ json: conceptFixture({ user: a.user }), usage: {} }) })).concepts.length, 4, 'never more than four at once');
  assert.equal((await generateConcepts({ line: { name: 'x', category: 'tops', role: 'core' }, env: ENV, askImpl: async () => ({ json: { concepts: [{ name: 'A' }, { name: 'a' }, { name: '' }] }, usage: {} }) })).concepts.length, 1, 'a repeated or empty name is dropped');
});

test('a concept\'s picture is drawn from the concept alone and comes with a thumbnail', async () => {
  assert.equal(await renderConcept(concept(), { cfg: { configured: false } }), null);
  const r = await renderConcept({ ...concept(), category: 'tops' }, { cfg: { configured: true, provider: 'fixture', model: 'fixture' } });
  assert.ok(r.image.length > 2000 && r.thumb.length > 500 && r.thumb.length < r.image.length && r.model === 'fixture'); assert.equal(r.image[0], 0xff); assert.equal(r.image[1], 0xd8, 'a JPEG');
});

test('editing a concept is cleaned; the product brief carries the concept and is safe to show', () => {
  const base = { name: 'Tee', twist: 'A twist that is ours', spec: cleanSpec({ description: 'd', colors: ['navy'] }), priceCents: 3800, costCents: null, qty: 100, category: 'tops' };
  const e = cleanConceptEdit({ name: ' Boxy Tee ', price: '42', qty: '250', colors: ['cream', 'navy', ''], details: ['a', 'b'] }, base); assert.equal(e.name, 'Boxy Tee'); assert.equal(e.priceCents, 4200); assert.equal(e.qty, 250); assert.deepEqual(e.spec.colors, ['cream', 'navy']); assert.equal(e.spec.description, 'd', 'what was not sent stays');
  for (const bad of [{ name: '' }, { price: 'abc' }, { price: -1 }, { qty: 1.5 }, { qty: -1 }, { category: 'nope' }, { cost: 'x' }]) assert.ok(cleanConceptEdit(bad, base).error, JSON.stringify(bad));
  assert.equal(cleanConceptEdit({ cost: null }, { ...base, costCents: 900 }).costCents, null);
  const brief = productBrief({ name: 'Tee <b>', twist: 'Our "seam"', priceCents: 3800, costCents: 1064, qty: 300, spec: { description: 'A <script>x</script> tee', details: ['rib', 'seam'], colors: ['navy'] } }, { name: 'Fall 27', season: 'FW' });
  assert.match(brief, /Designed in the Future Basics Design Lab/); assert.match(brief, /AI concept render/); assert.match(brief, /\$38\.00/); assert.match(brief, /\$10\.64/); assert.match(brief, /Fall 27 · FW/); assert.ok(!/<script>|<b>/.test(brief), 'escaped');
  assert.equal(PRODUCT_TYPES.headwear, 'Headwear'); assert.ok(PRODUCT_TYPES.footwear && PRODUCT_TYPES.bags);
});

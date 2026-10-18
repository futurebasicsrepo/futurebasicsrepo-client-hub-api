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

// ---- Future Basics branding, graphics and the audience ------------------------------------------------------------------------------------------------
import { ensureBranding, cleanGraphic, cleanGraphics, composeBranding, labelWords, LOGO_PLACE, GRAPHIC_PLACE } from '../src/lab-concepts.js';
import { brandCodeWords, cleanBrandCode } from '../src/lab.js';
import { generateLines, trendRead, planFixture, WOMENSWEAR_ONLY } from '../src/lab-plan.js';
import sharp from 'sharp';

test('every concept carries the Future Basics logo and woven label, whatever the assistant says', () => {
  const none = ensureBranding({}, 'tops'); assert.equal(none.branding.logo.mark, 'cue'); assert.match(none.branding.logo.placement, /left chest/); assert.equal(none.branding.logo.technique, 'embroidered'); assert.match(none.branding.label, /Future Basics internal woven label/); assert.match(none.branding.label, /back neck seam/);
  const odd = ensureBranding({ branding: { logo: { mark: 'skull', placement: '', technique: 'tattoo' }, label: 'No label please' } }, 'headwear'); assert.equal(odd.branding.logo.mark, 'cue'); assert.match(odd.branding.logo.placement, /crown/); assert.equal(odd.branding.logo.technique, 'embroidered'); assert.match(odd.branding.label, /internal woven label/); assert.match(odd.branding.label, /sweatband/, 'the label is ours, put back in words that suit a cap');
  const kept = ensureBranding({ branding: { logo: { mark: 'lockup', placement: 'woven loop at the hem', technique: 'woven patch' } } }, 'outerwear'); assert.deepEqual([kept.branding.logo.mark, kept.branding.logo.placement, kept.branding.logo.technique], ['lockup', 'woven loop at the hem', 'woven patch'], 'a good choice is kept');
  for (const c of ['footwear', 'bags', 'bottoms', 'tailoring', 'accessories', 'home', 'other', 'knitwear']) assert.match(labelWords(c), /Future Basics internal woven label/, c);
  assert.match(labelWords('footwear'), /tongue/); assert.match(labelWords('bottoms'), /waistband/);
});

test('graphics: plain shapes and our own lettering as outlines survive, in any colour; nothing that can run or fetch does', () => {
  const good = '<svg viewBox="0 0 200 200"><rect x="20" y="90" width="120" height="20" rx="10" fill="#141416"/><circle cx="165" cy="100" r="14" fill="#C8372D"/><g opacity="0.5"><path d="M10 10 L50 50" stroke="#1f3a5f" stroke-width="4" stroke-dasharray="4 2"/></g></svg>';
  const out = cleanGraphic(good); assert.match(out.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 200">/); assert.ok(out.svg.includes('#C8372D') && out.svg.includes('#1F3A5F'), 'a program can use its own colours, not only the logo\'s'); assert.ok(out.svg.includes('stroke-dasharray'));
  const lettered = cleanGraphic('<svg viewBox="0 0 300 120"><text x="150" y="80" font-family="grotesk-bold" font-size="60" text-anchor="middle" fill="#1F3A5F" letter-spacing="2">FB 26</text><text x="150" y="110" font-family="mono" font-size="14" text-anchor="middle">SPEC 01 / FB-26</text></svg>');
  assert.deepEqual(lettered.texts, ['FB 26', 'SPEC 01 / FB-26']); assert.ok(!/<text|font-family/.test(lettered.svg), 'lettering is outlines now, nothing that depends on a font being installed'); assert.equal((lettered.svg.match(/<path/g) || []).length, 2); assert.match(lettered.svg, /viewBox="0 0 300 120"/, 'a wide drawing keeps its shape');
  for (const bad of ['<svg><script>alert(1)</script><rect width="9" height="9"/></svg>', '<svg><rect width="9" height="9" onload="x()"/></svg>', '<svg><image href="http://x/y.png"/></svg>', '<svg><text x="1" y="9">Gucci</text><rect width="9" height="9"/></svg>', '<svg><text x="1" y="9">Ralph Lauren Polo</text></svg>', '<svg><text x="1" y="9">' + 'A'.repeat(30) + '</text></svg>', '<svg><text x="1" y="9"><tspan>x</tspan></text></svg>', '<svg><text x="1" y="9">a<b</text></svg>', '<svg><rect width="9" height="9" fill="url(#a)"/></svg>', '<svg><foreignObject/></svg>', '<svg><use href="#a"/></svg>', '<svg></svg>', 'not svg', '<svg><rect width="9" height="9"/><style>*{}</style></svg>', '<svg><a href="javascript:x"><rect width="9" height="9"/></a></svg>', '<svg>' + '<rect width="1" height="1"/>'.repeat(320) + '</svg>', '<svg><rect width="9" height="9" xlink:href="data:text/html,x"/></svg>', '<svg viewBox="0 0 5000 5000"><rect width="9" height="9"/></svg>', '<svg><defs><rect/></defs><rect width="9" height="9"/></svg>']) assert.equal(cleanGraphic(bad).svg, '', bad.slice(0, 60));
  assert.equal(cleanGraphic(good + 'x'.repeat(15000)).svg, '', 'too big'); assert.equal(cleanGraphic(Array.from({ length: 9 }, (_, i) => `<text x="1" y="${i + 9}">A${i}</text>`).join('').replace(/^/, '<svg>') + '</svg>').svg, '', 'no more than eight lines of lettering');
  const gs = cleanGraphics([{ name: ' Grid ', kind: 'Stripes', idea: 'A grid', placement: 'Front Chest', technique: 'Screen Print', colors: ['Ink', '', 'Cue'], svg: good }, { name: '', idea: 'no name' }, { name: 'Odd', idea: 'x', placement: 'moon', technique: 'magic', kind: 'nonsense' }, 5, null]);
  assert.equal(gs.length, 2); assert.deepEqual([gs[0].kind, gs[0].placement, gs[0].technique, gs[0].colors], ['stripes', 'front chest', 'screen print', ['Ink', 'Cue']]); assert.deepEqual([gs[1].kind, gs[1].placement, gs[1].technique], ['icon', 'front chest', 'screen print'], 'unknown choices fall back');
  assert.deepEqual(cleanGraphics([{ name: 'N', idea: 'i', svg: lettered.svg, texts: lettered.texts }])[0].texts, ['FB 26', 'SPEC 01 / FB-26'], 'the words stay with the drawing once it is only outlines');
  assert.equal(cleanGraphics(Array.from({ length: 9 }, (_, i) => ({ name: 'g' + i, idea: 'i' }))).length, 4, 'up to four graphics on a piece');
});

test('the logo, the graphics and the woven label are laid on the picture from our own files', async () => {
  const base = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#d9dbe0' } }).jpeg().toBuffer();
  const spec = ensureBranding({ branding: { logo: { mark: 'cue' } }, graphics: [{ name: 'Grid', idea: 'a grid', placement: 'front chest', technique: 'screen print', svg: '<svg viewBox="0 0 200 200"><rect x="0" y="80" width="200" height="40" fill="#141416"/></svg>' }, { name: 'Back', idea: 'on the back', placement: 'back', technique: 'screen print', svg: '<svg viewBox="0 0 200 200"><rect width="200" height="200" fill="#141416"/></svg>' }] }, 'tops');
  const out = await composeBranding(base, { category: 'tops', spec }), px = async (buf, x, y) => { const { data } = await sharp(buf).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true }); return [...data]; };
  assert.deepEqual((await sharp(out).metadata()).width, 1024);
  const chest = await px(out, 512, 430), corner = await px(out, 1024 - 40, 1024 - 40), plain = await px(out, 60, 60), back = await px(out, 100, 900);
  assert.ok(chest[0] < 60, 'the front graphic is drawn on the chest: ' + chest); assert.ok(corner[0] < 60, 'the woven label inset sits in the corner: ' + corner); assert.ok(plain[0] > 200, 'the rest of the picture is untouched');
  assert.ok(back[0] > 200, 'a graphic that goes on the back is not painted on the front picture');
  const same = await composeBranding(base, { category: 'tailoring', spec: ensureBranding({}, 'tailoring') }); assert.ok((await sharp(same).metadata()).width === 1024, 'a category with no front logo spot still gets the label inset');
  assert.ok(LOGO_PLACE.tops[1] && GRAPHIC_PLACE['front chest'] && GRAPHIC_PLACE.back === null);
});

test('the picture is asked to leave the logo and graphic places plain, and still carries no text', () => {
  const p = imagePrompt({ name: 'Boxy tee', category: 'tops', twist: 't', spec: ensureBranding({ description: 'd', graphics: [{ name: 'G', idea: 'i', placement: 'front chest', technique: 'screen print', svg: '<svg viewBox="0 0 200 200"><rect width="9" height="9"/></svg>' }] }, 'tops') });
  assert.match(p, /completely plain and unmarked/); assert.match(p, /left chest/); assert.match(p, /front chest/); assert.match(p, /menswear and unisex/); assert.match(p, /No text, no lettering, no logos/);
  assert.ok(!/completely plain and unmarked/.test(imagePrompt({ name: 'Blazer', category: 'tailoring', spec: ensureBranding({}, 'tailoring') })), 'no front spot, nothing to keep plain');
});

test('the audience is male-driven and unisex in the brand code, the plan and the concepts', async () => {
  assert.match(brandCodeWords(cleanBrandCode({})), /Who it is for: Male-driven and unisex/); assert.match(brandCodeWords(cleanBrandCode({})), /Future Basics logo and a Future Basics internal woven label/);
  assert.equal(cleanBrandCode({ audience: ' Men and everyone ' }).audience, 'Men and everyone'); assert.match(cleanBrandCode({}).audience, /Male-driven and unisex/);
  const trends = trendRead([{ id: 'a', title: 't', category: 'dresses', price: 90, heat: 50, firstSeenAt: '2026-10-01T00:00:00Z', attrs: {}, brand: 'R', role: 'reference' }, { id: 'b', title: 'u', category: 'tops', price: 50, heat: 50, firstSeenAt: '2026-10-01T00:00:00Z', attrs: {}, brand: 'R', role: 'reference' }], { now: new Date('2026-10-17') });
  let seen; await generateLines({ trends, size: 6, env: { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x' }, askImpl: async a => { seen = a; return { json: planFixture({ user: a.user }), usage: {} }; } });
  assert.match(seen.system, /male-driven and unisex/); assert.match(seen.system, /no womenswear-only pieces/); assert.ok(!/Categories you may use:.*dresses/.test(seen.user), 'dresses are left out of a plan unless asked for'); assert.deepEqual(WOMENSWEAR_ONLY, ['dresses']);
  await generateLines({ trends, size: 6, categories: ['dresses', 'tops'], env: { ANTHROPIC_API_KEY: 'k', AI_FIXTURE: 'x' }, askImpl: async a => { seen = a; return { json: planFixture({ user: a.user }), usage: {} }; } });
  assert.match(seen.user, /Categories you may use: dresses, tops/, 'but they can be asked for by name');
  let call; await generateConcepts({ line: { name: 'Tee', category: 'tops', role: 'core' }, env: ENV, askImpl: async a => { call = a; return { json: conceptFixture({ user: a.user }), usage: {} }; } });
  assert.match(call.system, /male-driven and unisex/); assert.match(call.system, /Future Basics logo/); assert.match(call.system, /internal woven label/); assert.match(call.system, /not limited to our logo or its line and dot/); assert.match(call.system, /crests and emblems, original lettering and numerals/); assert.match(call.user, /"graphics"/);
});

test('generated concepts always come back with the logo, the label and clean graphics', async () => {
  const g = await generateConcepts({ line: { name: 'Camp shirt', category: 'tops', role: 'core' }, count: 3, env: ENV, askImpl: async a => ({ json: conceptFixture({ user: a.user }), usage: {} }) });
  assert.ok(g.concepts.every(c => c.spec.branding.logo.mark && c.spec.branding.label.includes('internal woven label')), 'all three');
  assert.deepEqual(g.concepts.map(c => c.spec.branding.logo.mark), ['cue', 'word', 'lockup']); assert.equal(g.concepts[0].spec.graphics.length, 1); assert.ok(g.concepts[0].spec.graphics[0].svg.includes('<rect')); assert.equal(g.concepts[1].spec.graphics.length, 0, 'a clean piece stays clean');
  const bare = await generateConcepts({ line: { name: 'Cap', category: 'headwear', role: 'core' }, env: ENV, askImpl: async () => ({ json: { concepts: [{ name: 'Plain Cap', twist: 'ours' }] }, usage: {} }) });
  assert.match(bare.concepts[0].spec.branding.label, /sweatband/, 'even when the assistant forgot them');
});

test('the tech pack brief names the logo, the woven label, the graphics and who it is for', () => {
  const brief = productBrief({ name: 'Boxy tee', category: 'tops', twist: 'Our seam', priceCents: 3800, spec: { description: 'A tee', branding: { logo: { mark: 'lockup', placement: 'woven loop at the hem', technique: 'woven patch' } }, graphics: [{ name: 'Line and dot grid', idea: 'tone on tone', placement: 'front chest', technique: 'screen print', colors: ['Ink', 'Cue'] }] } }, { name: 'Fall 27' });
  assert.match(brief, /Who it is for:<\/strong> Male-driven and unisex/); assert.match(brief, /Future Basics logo:<\/strong> Wordmark and cue mark, woven loop at the hem, woven patch \(always on the piece\)/); assert.match(brief, /Internal label:<\/strong> Future Basics internal woven label[^<]*back neck seam \(always on the piece\)/); assert.match(brief, /Line and dot grid \(icon, front chest, screen print, Ink and Cue\): tone on tone/);
  assert.match(productBrief({ name: 'Old concept', category: 'tops', spec: { description: 'made before branding existed' } }), /Internal label/, 'a concept made before this still gets the label');
});

test('editing a concept can change the logo and remove a graphic, and the guard reads the graphics too', () => {
  const base = { name: 'Tee', twist: 'ours', spec: ensureBranding({ description: 'd', graphics: [{ name: 'A', idea: 'a', placement: 'front chest', technique: 'screen print' }, { name: 'B', idea: 'b', placement: 'left chest', technique: 'embroidery' }] }, 'tops'), priceCents: 3800, costCents: null, qty: 1, category: 'tops' };
  const e = cleanConceptEdit({ logo: { mark: 'word', technique: 'rubber print' }, graphics: [{ name: 'B', idea: 'b', placement: 'left chest', technique: 'embroidery' }] }, base);
  assert.deepEqual([e.spec.branding.logo.mark, e.spec.branding.logo.technique], ['word', 'rubber print']); assert.deepEqual(e.spec.graphics.map(g => g.name), ['B']); assert.match(e.spec.branding.label, /internal woven label/);
  assert.equal(cleanConceptEdit({}, base).spec.graphics.length, 2, 'untouched graphics stay');
  const c = closeness({ name: 'Tee', twist: 'ours', spec: ensureBranding({ description: 'd', graphics: [{ name: 'Pony', idea: 'a polo pony galloping', placement: 'front chest', technique: 'screen print' }] }, 'tops') }, []); assert.equal(c.verdict, 'too_close'); assert.ok(c.hits.includes('polo pony'));
});

test('the logo is drawn light on a dark garment and dark on a light one, judged where it goes', async () => {
  const garment = async colour => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#e6e7ea"/><rect x="232" y="250" width="560" height="520" rx="70" fill="${colour}"/></svg>`)).jpeg({ quality: 90 }).toBuffer();
  const band = async buf => { const { data } = await sharp(buf).extract({ left: 540, top: 356, width: 150, height: 8 }).raw().toBuffer({ resolveWithObject: true }); return [Math.min(...data), Math.max(...data)]; };
  const spec = ensureBranding({ branding: { logo: { mark: 'lockup' } } }, 'tops');
  const dark = await band(await composeBranding(await garment('#2f3b57'), { category: 'tops', spec })), light = await band(await composeBranding(await garment('#e8dfc9'), { category: 'tops', spec }));
  assert.ok(dark[1] > 240, 'white logo on navy: ' + dark); assert.ok(light[0] < 60, 'dark logo on cream: ' + light);
});

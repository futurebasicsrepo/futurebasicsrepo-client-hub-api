// The techniques a piece offers are the ones made on what it is (src/lab-goods.js SURFACES, src/lab-library.js, src/lab-flats.js
// techniqueFits): a mug is offered sublimation, UV print, pad print and screen print on glass and not embroidery; a garment is offered what it
// always was. The techniques for product types have no cost estimate, and say so: no figure was made up for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import Fastify from 'fastify';
import { GOODS, SURFACES } from '../src/lab-goods.js';
import { STYLES, techniqueFits, surfaceOf, madeOn, defaultParams, placementChecks } from '../src/lab-flats.js';
import { BUILTIN_TECHNIQUES, PRODUCT_TECHNIQUES, TECHNIQUE_BASES, SURFACE_FIRST, BASE_RULES, cleanTechnique, cleanSurfaces, cleanRules } from '../src/lab-library.js';
import { GRAPHIC_TECHNIQUES } from '../src/lab-concepts.js';
import { DECOR_COST, decorationCost, decorationLine, unpriced } from '../src/lab-decor.js';
import { costOf } from '../src/lab-materials.js';
import { jobFile } from '../src/lab-jobfile.js';
import { registerLabFlatsRoutes } from '../src/lab-flats-routes.js';
import { registerLabLibraryRoutes } from '../src/lab-library-routes.js';

const namesFor = style => BUILTIN_TECHNIQUES.filter(t => techniqueFits(t, style)).map(t => t.name).sort();
const GARMENT = BUILTIN_TECHNIQUES.filter(t => !t.surfaces || t.surfaces.includes('cloth')), PRODUCT = BUILTIN_TECHNIQUES.filter(t => PRODUCT_TECHNIQUES.includes(t.base));

test('every product type says what it is decorated on, and every garment is cloth', () => {
  for (const [k, g] of Object.entries(GOODS)) assert.ok(SURFACES[g.surface] || (k === 'other' && g.surface === 'any'), `${k}: ${g.surface}`);
  for (const [k, S] of Object.entries(STYLES)) assert.equal(surfaceOf(k), S.kind === 'goods' ? S.goods.surface : 'cloth', k);
  assert.deepEqual([surfaceOf('mug'), surfaceOf('pintglass'), surfaceOf('tumbler'), surfaceOf('phonecase'), surfaceOf('poster'), surfaceOf('towel'), surfaceOf('mousepad'), surfaceOf('skateboard')], ['ceramic', 'glass', 'metal', 'plastic', 'paper', 'cloth', 'soft', 'wood']);
  // every surface a product type has is one some technique is made on, with a choice of at least two
  for (const s of new Set(Object.values(GOODS).map(g => g.surface).filter(s => s !== 'any'))) assert.ok(BUILTIN_TECHNIQUES.filter(t => madeOn(t).includes(s)).length >= 2, `${s}: at least two ways to decorate it`);
});

test('a garment is offered what it always was; a product type the techniques made on it, and not the garment-only ones', () => {
  // the garment techniques are the ones that were there before, every one of them, and none of the product ones
  assert.equal(GARMENT.length, 44); assert.equal(PRODUCT.length, 7); assert.equal(GARMENT.length + PRODUCT.length, BUILTIN_TECHNIQUES.length);
  for (const k of Object.keys(STYLES).filter(k => STYLES[k].kind !== 'goods')) assert.deepEqual(namesFor(k), GARMENT.map(t => t.name).sort(), `${k}: the garment techniques, all of them`);
  assert.deepEqual(namesFor('mug'), ['Pad print', 'Screen print on glass', 'Sublimation on coated blanks', 'UV print']);
  assert.deepEqual(namesFor('pintglass'), ['Laser engraving', 'Pad print', 'Screen print on glass', 'Sublimation on coated blanks', 'UV print']);
  assert.deepEqual(namesFor('tumbler'), namesFor('pintglass'), 'a coated steel tumbler takes what a glass takes');
  assert.deepEqual(namesFor('phonecase'), ['Laser engraving', 'Pad print', 'Sublimation on coated blanks', 'UV print']);
  assert.deepEqual(namesFor('poster'), ['Digital print on paper', 'Offset print']);
  assert.deepEqual(namesFor('skateboard'), ['Laser engraving', 'UV print']);
  assert.deepEqual(namesFor('mousepad'), ['DTF transfer', 'Plastisol screen print', 'Sublimation, all over', 'UV print']);
  // what is sewn from cloth (a towel, an apron, a pillow) takes the garment techniques, embroidery among them
  for (const k of ['towel', 'apron', 'pillow', 'socks']) assert.deepEqual(namesFor(k), GARMENT.map(t => t.name).sort(), k);
  // no product that is not cloth is offered embroidery, a patch or a garment wash
  for (const [k, g] of Object.entries(GOODS)) if (!['cloth', 'any'].includes(g.surface)) for (const t of BUILTIN_TECHNIQUES.filter(t => techniqueFits(t, k))) assert.ok(!['embroidery', 'patch', 'distress'].includes(t.kind), `${k} is not offered ${t.name}`);
  // the plain panel, whose product is not known, takes them all
  assert.equal(namesFor('other').length, BUILTIN_TECHNIQUES.length);
  // a technique that says nothing is made on cloth (a room's own, written before this)
  assert.ok(techniqueFits({ name: 'Ours' }, 'tee')); assert.ok(!techniqueFits({ name: 'Ours' }, 'mug')); assert.ok(techniqueFits({ surfaces: ['ceramic'] }, 'mug')); assert.ok(!techniqueFits({ surfaces: ['ceramic'] }, 'tee'));
});

test('the product techniques are complete: a known base, rules of their own, and a first choice for each surface', () => {
  assert.deepEqual(TECHNIQUE_BASES, [...GRAPHIC_TECHNIQUES, ...PRODUCT_TECHNIQUES]);
  for (const b of PRODUCT_TECHNIQUES) { assert.ok(!GRAPHIC_TECHNIQUES.includes(b), `${b}: not something the concept assistant picks for a garment`); assert.ok(BASE_RULES[b], `${b} has its own rules`); assert.ok(PRODUCT.some(t => t.base === b), `${b} has a starting technique`); assert.deepEqual(cleanRules({}, b), BASE_RULES[b]); }
  for (const t of PRODUCT) { assert.ok(t.surfaces.length && t.surfaces.every(s => SURFACES[s]) && !t.surfaces.includes('cloth'), t.key); assert.ok(t.artGuide.length > 20 && t.factoryNote.length > 20, `${t.key} says how to design for it and what to tell the supplier`); }
  for (const [s, key] of Object.entries(SURFACE_FIRST)) { const t = BUILTIN_TECHNIQUES.find(x => x.key === key); assert.ok(t && madeOn(t).includes(s), `a graphic on ${s} starts as ${key}`); }
  // a pad print is small, a screen round a glass is no taller than the glass; a full-colour process is priced for any number of colours
  assert.equal(BASE_RULES['pad print'].maxW, 3); assert.equal(BASE_RULES['screen print on glass'].maxColors, 4); assert.equal(BASE_RULES['UV print'].maxColors, 0);
});

test('a technique keeps what it is made on, and its base whatever its capitals', () => {
  assert.deepEqual(cleanSurfaces(['glass', 'glass', 'granite', 'any']), ['glass']); assert.equal(cleanSurfaces([]), null); assert.equal(cleanSurfaces('glass'), null);
  const t = cleanTechnique({ name: 'Rotary UV', kind: 'print', base: 'uv print', surfaces: ['glass', 'metal'] }).technique;
  assert.equal(t.base, 'UV print'); assert.deepEqual(t.surfaces, ['glass', 'metal']); assert.equal(t.rules.maxColors, 0);
  assert.deepEqual(cleanTechnique({ summary: 'changed' }, { name: 'Kept', kind: 'print', base: 'pad print', surfaces: ['plastic'] }).technique.surfaces, ['plastic'], 'an edit keeps what it does not change');
  assert.equal(cleanTechnique({ name: 'Plain print', kind: 'print' }).technique.surfaces, null, 'nothing said: cloth');
  assert.equal(cleanTechnique({ name: 'Film', kind: 'heat_transfer', base: 'DTF transfer' }).technique.base, 'DTF transfer', 'a base with capitals is found, not dropped to the kind\'s usual one');
});

test('the check: a technique not made on the piece cannot make it', () => {
  const mug = defaultParams('mug'), q = { id: 'a', name: 'Crest', view: 'front', x: 0, y: 1.875, w: 2, h: 2 }, emb = BUILTIN_TECHNIQUES.find(t => t.key === 'satin-embroidery'), sub = BUILTIN_TECHNIQUES.find(t => t.key === 'sublimation-blank');
  const f = placementChecks(q, mug, { techniqueName: emb.name, madeOn: madeOn(emb) });
  assert.deepEqual(f.map(x => [x.level, x.code]), [['fail', 'TECHNIQUE']]); assert.equal(f[0].text, 'Crest is set to Satin stitch embroidery, which is not made on a mug. Choose a technique from its list.');
  assert.deepEqual(placementChecks(q, mug, { techniqueName: sub.name, madeOn: madeOn(sub) }), []);
  const tee = defaultParams('tee'), tq = { id: 'a', name: 'Crest', view: 'front', x: 0, y: 7, w: 3, h: 3 };
  assert.deepEqual(placementChecks(tq, tee, { techniqueName: emb.name, madeOn: madeOn(emb) }), [], 'a tee is embroidered as before');
  assert.equal(placementChecks(tq, tee, { techniqueName: sub.name, madeOn: madeOn(sub) })[0].code, 'TECHNIQUE', 'and is not sublimated as a mug is');
  assert.deepEqual(placementChecks(q, mug, { techniqueName: 'screen print' }), [], 'a technique that is only a word (none chosen from the library) is not judged');
});

test('no price was made up: the product techniques have no estimate and say so; the garment figures are as they were', () => {
  for (const b of PRODUCT_TECHNIQUES) { assert.equal(DECOR_COST[b], undefined, `${b}: no figure in the cost table`); assert.ok(unpriced(b));
    const c = decorationCost({ base: b, widthIn: 8, heightIn: 3, colours: 3, qty: 300, calibration: { n: 5, factor: 2 } });
    assert.deepEqual(c, { unitCents: 0, setupCents: 0, perPieceCents: 0, qty: 300, basis: 'no estimate yet: the supplier\'s quote sets it', unpriced: true }, `${b}: nothing is estimated, whatever quotes say of other things`);
    const line = decorationLine({ name: 'Band', technique: 'X', base: b, widthIn: 8, heightIn: 3, colours: 3, cost: c }); assert.equal(line.unpriced, true);
    assert.equal(costOf([], { decorations: [line] }).decorationCents, 0, 'and nothing is added to the piece\'s cost'); }
  for (const b of GRAPHIC_TECHNIQUES) { assert.ok(DECOR_COST[b], b); assert.ok(!unpriced(b)); assert.equal(decorationCost({ base: b }).unpriced, undefined); }
  // the figures a garment is estimated with are the ones in the table, untouched
  assert.deepEqual(DECOR_COST['screen print'], { setup: 2500, perSetup: 'screen', unit: 55, perColour: 22, perIn2: 0, bands: [1, 1.35, 1.8] });
  assert.deepEqual(DECOR_COST.sublimation, { setup: 0, unit: 20, perIn2: 1.5, bands: [1, 1, 1] });
  assert.equal(decorationCost({ base: 'screen print', widthIn: 4, heightIn: 4, colours: 2, qty: 300 }).perPieceCents, 94);
  assert.equal(decorationLine({ name: 'A', technique: 'Plastisol', base: 'screen print', widthIn: 4, heightIn: 4, colours: 1, cost: decorationCost({ base: 'screen print' }) }).unpriced, undefined);
});

test('a product technique\'s job file gives the artwork at size and what the supplier decides, with no garment press settings', async () => {
  const png = await sharp({ create: { width: 300, height: 120, channels: 4, background: { r: 20, g: 60, b: 200, alpha: 1 } } }).png().toBuffer();
  for (const key of ['sublimation-blank', 'uv-print', 'glass-screen']) { const t = BUILTIN_TECHNIQUES.find(x => x.key === key), r = await jobFile(png, { name: 'Band', technique: t, widthIn: 8 });
    assert.equal(r.job.product.process, t.base); assert.equal(r.job.print, undefined); assert.equal(r.job.transfer, undefined); assert.equal(r.job.wash, undefined);
    assert.ok(r.files.some(f => f.name === 'artwork-300dpi.png') && r.files.some(f => f.name === 'job-sheet.pdf'));
    assert.equal(r.files.some(f => f.name === 'artwork-mirrored-300dpi.png'), key === 'sublimation-blank', `${key}: only a sublimation transfer is printed mirrored`);
    assert.ok(!/°C|plastisol|mesh/i.test(JSON.stringify(r.job.product)), `${key}: no press or screen settings that are the supplier's to give`); }
  const plastisol = await jobFile(png, { name: 'Band', technique: BUILTIN_TECHNIQUES.find(x => x.key === 'plastisol'), widthIn: 4 }); assert.ok(plastisol.job.print && !plastisol.job.product, 'a garment print is as it was');
});

// ---- the routes ----
const CID = '00000000-0000-4000-8000-000000000001', ART = '00000000-0000-4000-8000-0000000000a1';
const TECH = BUILTIN_TECHNIQUES.map((t, i) => ({ id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`, key: t.key, kind: t.kind, name: t.name, base: t.base, finish: t.finish, rules: t.rules || null, surfaces: t.surfaces || null })), idOf = key => TECH.find(t => t.key === key).id;
async function build(spec, category = 'other') {
  const png = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 20, g: 60, b: 200, alpha: 1 } } }).png().toBuffer();
  const state = { flats: null, concept: { id: CID, name: 'Piece', category, status: 'draft', spec, twist: '', product_id: null, price_cents: null, cost_cents: null, qty: null, updated_at: new Date(), client_id: null, plan_name: null, brand: '' } };
  const pool = { state, async query(sql, args = []) {
    if (/from lab_concepts c left join lab_plans/.test(sql)) return { rows: [state.concept] };
    if (/from lab_techniques/.test(sql)) return { rows: TECH.map(t => ({ ...t })) };
    if (/^insert into lab_flats/i.test(sql)) { state.flats = { style: args[1], params: JSON.parse(JSON.stringify(args[2])), placements: JSON.parse(args[3]), check_result: JSON.parse(JSON.stringify(args[4])), updated_at: new Date() }; return { rows: [], rowCount: 1 }; }
    if (/from lab_flats/.test(sql)) return { rows: state.flats ? [state.flats] : [] };
    if (/select png from lab_art/.test(sql)) return { rows: args[0] === ART ? [{ png }] : [] };
    if (/select 1 from lab_art/.test(sql)) return args[0] === ART ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  } };
  const app = Fastify(); registerLabFlatsRoutes(app, { pool, authenticate: async () => {}, adminOnly: async () => {}, log: { warn() {}, info() {} } });
  await app.ready(); return { app, state };
}
const flatOf = async app => { const r = (await app.inject({ url: `/v1/lab/concepts/${CID}/flats` })).json(), { placements: _p, check: _c, saved: _s, updatedAt: _u, ...params } = r.flat; return { r, params }; };

test('the routes: a mug\'s graphic is made as a mug is, a wrong technique is caught, and a tee is as it was', async () => {
  const { app } = await build({ style: 'mug', template: 'none', catalog: { id: 'x', name: 'Mug', brand: '' }, branding: { logo: { mark: 'none' } } }), { r, params } = await flatOf(app);
  // the page is given every technique with what it is made on, and what a new graphic starts as on each surface
  assert.equal(r.techniques.length, TECH.length); assert.deepEqual(r.techniques.find(t => t.id === idOf('uv-print')).surfaces, ['soft', 'ceramic', 'glass', 'metal', 'plastic', 'wood']); assert.deepEqual(r.techniques.find(t => t.id === idOf('satin-embroidery')).surfaces, ['cloth']);
  assert.equal(r.firstTechnique.ceramic, idOf('sublimation-blank')); assert.equal(r.firstTechnique.paper, idOf('digital-print')); assert.equal(r.firstTechnique.cloth, undefined);
  assert.equal(r.techniques.filter(t => techniqueFits(t, 'mug')).length, 4);
  // a graphic that names no technique from the library (only the garment's old word) is made as a mug is: sublimation, with no estimate
  const q = { id: 'art', name: 'Crest', view: 'front', x: 0, y: 1.875, w: 2, h: 2, art: ART, technique: 'screen print', source: 'extra' };
  const put = (await app.inject({ method: 'PUT', url: `/v1/lab/concepts/${CID}/flats`, payload: { ...params, placements: [q] } })).json();
  assert.equal(put.check.summary.fail, 0, JSON.stringify(put.check.findings)); assert.equal(put.decorations[0].technique, 'Sublimation on coated blanks'); assert.equal(put.decorations[0].unpriced, true); assert.equal(put.decorations[0].perPieceCents, 0);
  assert.ok(!/\$\s?\d/.test(JSON.stringify(put.decorations)), 'no dollar amount for it');
  const sheet = (await app.inject({ url: `/v1/lab/concepts/${CID}/flats/sheet.svg` })).body; assert.ok(sheet.includes('Sublimation on coated blanks ·'), 'the spec sheet names it');
  assert.equal((await flatOf(app)).r.madeAs.art, idOf('sublimation-blank'), 'and the page is told so, so its Made as shows what the sheet says');
  // embroidery chosen on a mug (as a concept saved before this could be): the check says it cannot be made, and how to put it right
  const bad = (await app.inject({ method: 'PUT', url: `/v1/lab/concepts/${CID}/flats`, payload: { ...params, placements: [{ ...q, techniqueId: idOf('satin-embroidery'), technique: 'embroidery' }] } })).json();
  assert.equal(bad.check.summary.fail, 1); assert.match(bad.check.findings.art[0].text, /Satin stitch embroidery, which is not made on a mug/);
  // pad print is made on a mug, but only small: its own size rule still holds
  const pad = (await app.inject({ method: 'PUT', url: `/v1/lab/concepts/${CID}/flats`, payload: { ...params, placements: [{ ...q, w: 2.5, h: 2.5, techniqueId: idOf('pad-print') }] } })).json();
  assert.equal(pad.check.summary.fail, 0); const big = (await app.inject({ method: 'POST', url: `/v1/lab/concepts/${CID}/flats/check`, payload: { ...params, placements: [{ ...q, view: 'back', x: 0, y: 1.875, w: 6, h: 3, techniqueId: idOf('pad-print') }] } })).json();
  assert.ok(big.check.findings.art.some(f => f.code === 'TOO_WIDE'), 'a 6 in pad print is too wide');
  await app.close();
  // a tee: the same word is a plastisol screen print, estimated as it was
  const tee = await build({ description: 'Heavy tee', silhouette: 'T-shirt', branding: { logo: { mark: 'none' } } }, 'tops'), t = await flatOf(tee.app); assert.equal(t.r.flat.style, 'tee');
  const tp = (await tee.app.inject({ method: 'PUT', url: `/v1/lab/concepts/${CID}/flats`, payload: { ...t.params, placements: [{ id: 'art', name: 'Crest', view: 'front', x: 0, y: 7, w: 4, h: 4, art: ART, technique: 'screen print', source: 'extra' }] } })).json();
  assert.equal(tp.decorations[0].technique, 'Plastisol screen print'); assert.equal(tp.decorations[0].unpriced, undefined); assert.ok(tp.decorations[0].perPieceCents > 0); assert.ok(!tp.check.findings.art.some(f => f.code === 'TECHNIQUE'));
  await tee.app.close();
});

test('the starting techniques are put in with what they are made on, and a technique already there keeps what it has', async () => {
  const seen = [], pool = { async query(sql, args = []) { if (/^insert into lab_techniques\(key/.test(sql)) seen.push({ sql, args }); return { rows: [], rowCount: 0 }; } };
  const app = Fastify(); registerLabLibraryRoutes(app, { pool, authenticate: async () => {}, adminOnly: async () => {}, art: {}, log: { warn() {}, info() {} } });
  await app.ready(); const list = (await app.inject({ url: '/v1/lab/library/techniques' })).json();
  assert.equal(seen.length, BUILTIN_TECHNIQUES.length);
  const by = key => seen.find(x => x.args[0] === key);
  assert.deepEqual(by('uv-print').args[10], ['soft', 'ceramic', 'glass', 'metal', 'plastic', 'wood']); assert.deepEqual(by('plastisol').args[10], ['cloth', 'soft']); assert.equal(by('satin-embroidery').args[10], null, 'a garment technique says nothing: cloth');
  // only what is missing is filled in: a row we changed keeps its rules and what it is made on, and nothing else of it is written over
  for (const x of seen) assert.match(x.sql, /on conflict\(key\) do update set rules=coalesce\(lab_techniques\.rules, excluded\.rules\), surfaces=coalesce\(lab_techniques\.surfaces, excluded\.surfaces\)$/);
  assert.deepEqual(list.baseTechniques, TECHNIQUE_BASES); assert.deepEqual(list.surfaces, SURFACES);
  await app.close();
});

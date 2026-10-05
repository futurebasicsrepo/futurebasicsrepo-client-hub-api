import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTechPack } from '../src/techpack.js';
import { specBrief, renderPrompt, viewsFor, imageConfig, normalizeVerdict, scoreLabel, referencePhotos, fixtureRender, compareToPhoto, runSpecCheck } from '../src/check.js';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=';
const pack = () => normalizeTechPack({
  style: { styleName: 'Layer runner', category: 'Footwear — chunky runner', sampleSize: '10', fitBlock: 'Court last, D width', fabricSummary: 'Mesh upper · EVA midsole', description: 'SECRET-DESCRIPTION written from the photo', sampleSizes: [] },
  sizes: ['9', '10', '11'],
  sketches: [{ id: 's1', view: 'front', label: 'Front view', image: PHOTO, callouts: [] }, { id: 's2', view: 'lateral', label: 'Reference photo', image: PHOTO, callouts: [{ n: 1, label: 'Heel wrap', spec: 'TPU overlay, 3 mm', note: 'SECRET-CALLOUT-NOTE' }] }],
  pom: [{ code: 'A', name: 'Outsole length', values: { 9: '11.17', 10: '11.5', 11: '11.83' }, tolerance: '±0.125' }, { code: 'B', name: 'Forefoot width', values: { 9: '4.17', 10: '4.3', 11: '4.42' } }, { code: 'D', name: 'Heel height', values: { 10: '1 1/2' } }],
  bom: [{ component: 'Upper', material: 'Engineered mesh', spec: '220 gsm', color: 'Bone #e8e2d0', placement: 'Vamp and quarter' }, { component: 'Outsole', material: 'Rubber', color: 'Gum', notes: 'Waffle tread' }],
  colorways: [{ name: 'Bone / gum', code: 'BG1', swatch: '#e8e2d0' }],
  construction: [{ area: 'Midsole', detail: 'Cold-cemented EVA, 28 mm stack' }],
  artwork: [{ name: 'Wordmark', pantones: [{ hex: '#111111', name: 'Black 6 C' }], placements: [{ sketchId: 's1', x: 0.25, y: 0.5, widthIn: 1.5, label: 'Tongue' }] }],
  notes: 'SECRET-PACK-NOTE'
});

test('the brief comes from the structured spec alone: no photo, no description, no free-text notes', () => {
  const b = specBrief(pack(), { title: 'Layer runner', productType: 'Footwear' }), text = JSON.stringify(b) + renderPrompt(b);
  assert.ok(!/SECRET/.test(text), 'free text written while looking at the photo stays out');
  assert.ok(!/data:image|base64/.test(text), 'no picture goes in');
  assert.equal(b.kind, 'footwear');
  assert.equal(b.parts.length, 2); assert.equal(b.colours[0].hex, '#e8e2d0');
  assert.match(renderPrompt(b), /Engineered mesh, 220 gsm; colour Bone #e8e2d0/);
  assert.match(renderPrompt(b), /Waffle tread/); assert.match(renderPrompt(b), /Cold-cemented EVA/); assert.match(renderPrompt(b), /Do not add any feature/);
  assert.match(renderPrompt(b), /Heel wrap: TPU overlay, 3 mm/, 'callout labels and specs are included, their notes are not');
});

test('measurements become proportions of the reference measurement, at the sample size', () => {
  const b = specBrief(pack());
  assert.equal(b.sampleSize, '10'); assert.equal(b.reference.code, 'A'); assert.equal(b.reference.inches, 11.5); assert.equal(b.reference.cm, 29.2);
  assert.equal(b.proportions.find(p => p.code === 'B').pctOfReference, 37);
  assert.equal(b.proportions.find(p => p.code === 'D').inches, 1.5, 'a fraction like 1 1/2 is read');
  assert.match(renderPrompt(b), /Forefoot width 4\.3 in = 37%/);
});

test('an empty pack still gives a usable brief', () => {
  const b = specBrief({}, { title: 'Mystery' }); assert.equal(b.parts.length, 0); assert.equal(b.reference, null);
  assert.match(renderPrompt(b), /Mystery/);
});

test('views follow the kind of product', () => {
  assert.deepEqual(viewsFor('footwear').map(v => v.id), ['hero', 'side']);
  assert.deepEqual(viewsFor('top').map(v => v.id), ['hero', 'back']);
  assert.equal(specBrief({ style: { category: 'Apparel — heavyweight hoodie' } }).kind, 'top');
  assert.equal(specBrief({ style: { category: 'Bag — tote' } }).kind, 'bag');
});

test('which image model is used follows the environment', () => {
  assert.equal(imageConfig({}).provider, 'none'); assert.equal(imageConfig({}).configured, false);
  assert.equal(imageConfig({ AI_FIXTURE: 'x' }).provider, 'fixture');
  const o = imageConfig({ OPENAI_API_KEY: 'k' }); assert.equal(o.provider, 'openai'); assert.equal(o.model, 'gpt-image-1.5'); assert.equal(o.quality, 'medium'); assert.equal(o.size, '1024x1024');
  assert.equal(imageConfig({ OPENAI_API_KEY: 'k', IMAGE_MODEL: 'gpt-image-2', IMAGE_QUALITY: 'high' }).model, 'gpt-image-2');
  assert.equal(imageConfig({ OPENAI_API_KEY: 'k', CHECK_RENDER_DISABLED: 'true' }).provider, 'off');
  assert.equal(imageConfig({ OPENAI_API_KEY: 'k', IMAGE_PROVIDER: 'other' }).configured, false);
});

test('a verdict is cleaned: score clamped, unknown fields dropped, label derived', () => {
  const v = normalizeVerdict({ score: 140, summary: ' fine ', attributes: [{ key: 'materials', match: 'close', note: 'x' }, { key: 'materials', match: 'match', note: 'dup' }, { key: 'nonsense', match: 'match' }, { key: 'colours', match: 'weird', note: 'y' }],
    discrepancies: [{ severity: 'urgent', field: 'nowhere', title: 'T', detail: 'D', suggestion: 'S' }, { title: '', detail: '' }] });
  assert.equal(v.score, 100); assert.equal(v.verdict, 'resembles'); assert.equal(v.summary, 'fine');
  assert.deepEqual(v.attributes.map(a => a.key), ['materials', 'colours']); assert.equal(v.attributes[1].match, 'cannot-tell');
  assert.equal(v.discrepancies.length, 1); assert.equal(v.discrepancies[0].severity, 'medium'); assert.equal(v.discrepancies[0].field, 'style');
  assert.equal(normalizeVerdict(null).score, 0); assert.equal(normalizeVerdict({ score: 30 }).verdict, 'does-not-resemble'); assert.equal(normalizeVerdict({ score: 60 }).verdict, 'partly');
  assert.equal(scoreLabel(75), 'resembles'); assert.equal(scoreLabel(74), 'partly'); assert.equal(scoreLabel(49), 'does-not-resemble');
});

test('reference photos: the ones labelled as reference come first, at most two', () => {
  const ps = referencePhotos(pack()); assert.equal(ps.length, 2); assert.ok(ps.every(p => p.startsWith('data:image/')));
  assert.equal(referencePhotos({}).length, 0);
});

test('the test renderer draws a jpeg in the first colourway', async () => {
  const buf = await fixtureRender(specBrief(pack()), viewsFor('footwear')[0]); assert.equal(buf[0], 0xff); assert.equal(buf[1], 0xd8); assert.ok(buf.length > 2000);
});

test('with the test fixture on, a check renders, compares and returns a clean verdict', async () => {
  const prev = process.env.AI_FIXTURE, prevViews = process.env.CHECK_VIEWS; process.env.AI_FIXTURE = process.env.AI_FIXTURE || 'fixture';
  try {
    let r = await runSpecCheck({ pack: pack(), product: { title: 'Layer runner', product_type: 'Footwear' }, promptText: 'A chunky runner in bone and gum' });
    assert.equal(r.renderStatus, 'rendered'); assert.equal(r.renders.length, 1); assert.equal(r.provider, 'fixture'); assert.equal(r.verdict.score, 82); assert.equal(r.verdict.verdict, 'resembles');
    assert.equal(r.verdict.attributes.length, 7); assert.ok(!/data:image/.test(r.renders[0].prompt), 'the renderer was never given the photo');
    process.env.CHECK_VIEWS = '2'; r = await runSpecCheck({ pack: pack(), product: { title: 'Layer runner' }, promptText: 'x' }); assert.equal(r.renders.length, 2);
    r = await runSpecCheck({ pack: pack(), product: { title: 'Layer runner' }, promptText: 'x', cfg: imageConfig({}) }); assert.equal(r.renderStatus, 'none'); assert.equal(r.renders.length, 0); assert.equal(r.verdict.verdict, 'resembles', 'without an image model the written spec is compared with the photo');
  } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; if (prevViews === undefined) delete process.env.CHECK_VIEWS; else process.env.CHECK_VIEWS = prevViews; }
});

test('no photo and no prompt: the check says it cannot judge, and never invents a score', async () => {
  const { verdict } = await compareToPhoto({ photos: [], promptText: '  ', renders: [], brief: specBrief({}) });
  assert.equal(verdict.verdict, 'cannot-judge'); assert.equal(verdict.score, 0);
});

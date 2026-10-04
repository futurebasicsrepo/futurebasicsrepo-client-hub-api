import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vetMeasurements, checkNote, applyDraftToPack } from '../src/ai.js';
import { seedTechPack } from '../src/techpack.js';

const withFixture = async (obj, fn) => { const f = join(mkdtempSync(join(tmpdir(), 'vet-')), 'fx.json'); writeFileSync(f, JSON.stringify(obj)); const prev = process.env.AI_FIXTURE; process.env.AI_FIXTURE = f; try { return await fn(); } finally { if (prev === undefined) delete process.env.AI_FIXTURE; else process.env.AI_FIXTURE = prev; } };
const sizes = ['7', '8', '9', '10', '11', '12', '13'];
const shoeTemplate = () => seedTechPack({ product: { title: 'Modern Oxford', product_type: 'Sneaker', description_html: '' } }).pom.map(r => ({ code: r.code, name: r.name, how: r.how }));
const oxfordDraft = () => ({ category: 'Footwear — chunky-sole modern Oxford', pom: [
  { code: 'A', sample: 12, step: 0.33 }, { code: 'B', sample: 1.5, step: 0 }, { code: 'C', sample: 0.55, step: 0 }, { code: 'D', sample: 2.4, step: 0.06 }, { code: 'E', sample: 0.8, step: 0.02 }, { code: 'F', sample: 0.6, step: 0 }] });
const photo = 'data:image/png;base64,AAAA';
const ctx = (extra = {}) => ({ photo, pomTemplate: shoeTemplate(), product: { title: 'Modern Oxford' }, sizes, sampleSize: '10', ...extra });

test('the Oxford pack: 1.5" forefoot and 0.55" heel are taken out and researched again with their range', async () => {
  await withFixture({}, async () => {
    const d = oxfordDraft(), rep = await vetMeasurements(d, ctx());
    assert.equal(rep.family, 'footwear');
    assert.deepEqual(rep.rejected.map(r => r.code), ['B', 'C']);
    assert.deepEqual(rep.refilled.map(r => r.code).sort(), ['B', 'C']);
    const b = d.pom.find(r => r.code === 'B'), c = d.pom.find(r => r.code === 'C');
    assert.ok(b.sample >= 1.8 && b.sample <= 6 && c.sample >= 1.2 && c.sample <= 5, `refilled inside the range (${b.sample}, ${c.sample})`);
    assert.ok(d.pom.find(r => r.code === 'A').sample === 12, 'good rows are untouched');
    assert.match(checkNote(rep), /C Heel width \(outsole\): the draft gave 0\.55 in, outside 1\.2–5 in\. Researched again: 3\.1 in — please confirm\./);
  });
});
test('a value still implausible after research is left blank, not shipped', async () => {
  const bad = { identified: 'x', comparables: [], consulted: [], notes: '', rows: [{ code: 'C', name: '', how: '', tolerance: '±0.25', sample: 0.4, step: 0, basis: 'b', sources: [] }, { code: 'B', name: '', how: '', tolerance: '±0.25', sample: 4.1, step: 0.1, basis: 'b', sources: [] }] };
  await withFixture({ research: bad }, async () => {
    const d = oxfordDraft(), rep = await vetMeasurements(d, ctx());
    assert.deepEqual(rep.blank, ['C']); assert.deepEqual(rep.refilled.map(r => r.code), ['B']);
    assert.equal(d.pom.some(r => r.code === 'C'), false);
    assert.match(checkNote(rep), /C Heel width \(outsole\): .* Left blank for Future Basics to fill\./);
  });
});
test('without a photo (a brief-only draft) bad values are blanked and nothing is researched', async () => {
  const d = oxfordDraft(), rep = await vetMeasurements(d, ctx({ photo: '' }));
  assert.deepEqual(rep.blank.sort(), ['B', 'C']); assert.equal(d.pom.length, 4);
});
test('centimetres and millimetres typed as inches are converted, step included', async () => {
  const d = { category: 'Tops — tee', pom: [{ code: 'B', name: 'Chest width', sample: 55, step: 2.54 }, { code: 'A', name: 'Body length HPS', sample: 711, step: 25.4 }] };
  const rep = await vetMeasurements(d, { pomTemplate: [], product: { title: 'Tee' }, sizes: ['S', 'M', 'L'], sampleSize: 'M' });
  assert.deepEqual(rep.converted.map(c => `${c.code}:${c.unit}`), ['B:cm', 'A:mm']);
  assert.equal(d.pom[0].sample, 21.65); assert.equal(d.pom[0].step, 1); assert.equal(d.pom[1].sample, 27.99); assert.equal(d.pom[1].step, 1);
  assert.match(checkNote(rep), /B Chest width: 55 was read as cm, converted to 21\.65 in\./);
});
test('a size-to-size step that would leave the range is capped', async () => {
  const d = { category: 'Footwear', pom: [{ code: 'E', name: 'Collar height (lateral)', sample: 8.5, step: 1.5 }] };
  const rep = await vetMeasurements(d, { pomTemplate: [], product: { title: 'Boot' }, sizes, sampleSize: '10' });
  assert.equal(rep.capped.length, 1); assert.ok(d.pom[0].step > 0 && d.pom[0].step <= 0.5, `capped to ${d.pom[0].step}`);
});
test('a clean draft is left exactly as it was and writes no note', async () => {
  const d = { category: 'Tops — tee', pom: [{ code: 'A', name: 'Chest width', sample: 22, step: 1 }, { code: 'B', name: 'Body length HPS', sample: 28, step: 0.5 }] }, copy = structuredClone(d.pom);
  const rep = await vetMeasurements(d, { pomTemplate: [], product: { title: 'Tee' }, sizes: ['S', 'M', 'L'], sampleSize: 'M' });
  assert.deepEqual(d.pom, copy); assert.equal(checkNote(rep), '');
});
test('products with no template and no recognised names pass through untouched (nothing to judge)', async () => {
  const d = { category: 'Thing', pom: [{ code: 'A', name: 'Flange offset', sample: 999, step: 0 }] };
  const rep = await vetMeasurements(d, { pomTemplate: [], product: { title: 'Thing' }, sizes: ['M'], sampleSize: 'M' });
  assert.equal(d.pom.length, 1); assert.equal(rep.rejected.length, 0);
});
test('the pack notes carry the check', async () => {
  await withFixture({}, async () => {
    const d = oxfordDraft(); d.styleName = 'x'; d.description = 'x'; d.fabricSummary = 'x'; d.callouts = []; d.colorways = []; d.bom = []; d.construction = []; d.confidence = 'low';
    await vetMeasurements(d, ctx());
    const seed = seedTechPack({ product: { title: 'Modern Oxford', product_type: 'Sneaker', description_html: '' } });
    const pack = await applyDraftToPack(seed, d, { photos: [photo], sizes: seed.sizes, sampleSize: '10', model: 'fixture' });
    assert.match(pack.notes, /MEASUREMENT CHECKS/);
    const heel = pack.pom.find(r => r.code === 'C'); assert.ok(Number(heel.values['10']) >= 1.2, 'the heel width in the pack is plausible');
  });
});

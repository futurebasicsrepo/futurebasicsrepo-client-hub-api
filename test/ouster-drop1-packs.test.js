import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DROP1 } from '../src/ouster-drop1.js';
import { buildPack, mergePack, MANIFEST } from '../src/ouster-drop1-packs.js';
import { normalizeTechPack } from '../src/techpack.js';

test('every Merch Drop 1 picture named in the manifest is in the repo', () => {
  const all = Object.values(MANIFEST).flat();
  assert.equal(all.length, 67);
  for (const x of all) assert.ok(existsSync(new URL(`../src/seed/ouster-drop1/${x.file}`, import.meta.url)), x.file);
});

test('each of the 15 styles gets a tech pack led by its product photo, with callouts on it', () => {
  for (const p of DROP1) {
    const d = buildPack(p);
    assert.ok(d, p.title);
    assert.equal(d.style.styleName, p.title);
    assert.equal(d.style.styleNumber, p.code);
    assert.match(d.renderings[0].image, /^data:image\/jpeg;base64,/, `${p.title}: the card picture`);
    assert.equal(d.sketches[0].view, 'front');
    assert.ok(d.sketches[0].callouts.length >= 1, `${p.title}: callouts`);
    for (const c of d.sketches.flatMap(s => s.callouts)) assert.ok(c.x > 0 && c.x < 1 && c.y > 0 && c.y < 1 && c.label, `${p.title}: ${c.label}`);
    assert.ok(d.bom.length && d.construction.length, p.title);
    assert.doesNotMatch(JSON.stringify({ ...d, sketches: [], renderings: [], artwork: [], notes: "" }), /\$\d/, `${p.title}: no price invented`);
  }
  const tee = buildPack(DROP1[0]);
  assert.deepEqual(tee.artwork.map(a => a.name), ['Option 1 — stacked hardware', 'Option 2 — annotated', 'Option 3 — exploded isometric', 'Option 4 — small chest graphic']);
  assert.ok(tee.sketches.some(s => s.label === 'Packaging: Hang tag options'));
  assert.deepEqual(buildPack(DROP1.find(p => p.title === 'Notebook')).sizes, ['One Size']);
});

test('a pack that already has work in it keeps it: only the empty parts are filled', () => {
  const fresh = buildPack(DROP1[0]);
  const mine = normalizeTechPack({ style: { styleName: 'Sensor Lineup Tee', season: 'FW26' }, bom: [{ component: 'Body', material: 'Our blank' }], artwork: [{ name: 'Old art', image: fresh.renderings[0].image }], notes: 'Ours' });
  const out = mergePack(mine, fresh);
  assert.equal(out.style.styleName, 'Sensor Lineup Tee');
  assert.equal(out.style.season, 'FW26');
  assert.equal(out.style.styleNumber, 'Cap1 OT-S');
  assert.deepEqual(out.bom.map(r => r.material), ['Our blank']);
  assert.equal(out.sketches.length, fresh.sketches.length);
  assert.deepEqual(out.artwork.map(a => a.name), ['Old art', ...fresh.artwork.map(a => a.name)]);
  assert.match(out.notes, /^Ours\n\nFrom the Google Doc/);
});

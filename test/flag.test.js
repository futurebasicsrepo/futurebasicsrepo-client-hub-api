import test from 'node:test';
import assert from 'node:assert/strict';
import { reviseFlag, flagRow } from '../src/loop.js';
import { normalizeTechPack } from '../src/techpack.js';

process.env.AI_FIXTURE = 'test'; // the stand-in answers "set <field> to <value>" with that edit and anything else by keeping the line

const pack = () => normalizeTechPack({
  style: { styleName: 'Layer runner', category: 'Footwear', fabricSummary: 'Mesh' },
  bom: [{ component: 'Upper', material: 'Mesh', spec: '', color: 'Black #111111', placement: 'Body', notes: '' }, { component: 'Sole', material: 'EVA', spec: '', color: '', placement: '', notes: '' }],
  colorways: [{ name: 'Black', code: '', swatch: '#111111', notes: '' }],
  construction: [{ area: 'Heel', detail: 'Stitched' }],
  sketches: [{ id: 's1', view: 'front', label: 'Ref', image: '', callouts: [{ n: 1, label: 'Collar', spec: 'Rib', note: '' }] }]
});

test('a flagged line is found, with a name a person would recognise', () => {
  const p = pack();
  assert.equal(flagRow(p, { section: 'bom', index: 1 }).label, 'BOM · Sole');
  assert.equal(flagRow(p, { section: 'callouts', sketch: 0, index: 0 }).label, 'Callout · Collar');
  assert.equal(flagRow(p, { section: 'style' }).label, 'Style');
  assert.equal(flagRow(p, { section: 'bom', index: 9 }), null);
  assert.equal(flagRow(p, { section: 'pom', index: 0 }), null, 'measurements are not flaggable');
});
test('the assistant changes the flagged line, and only that line', async () => {
  const p = pack(), r = await reviseFlag({ pack: p, target: { section: 'bom', index: 0 }, note: 'This is wrong: set material to Heathered grey knit mesh' });
  assert.equal(r.changes.length, 1); assert.equal(r.changes[0].path.join('.'), 'bom.0.material'); assert.equal(r.changes[0].from, 'Mesh'); assert.equal(r.changes[0].to, 'Heathered grey knit mesh');
  assert.match(r.say, /changed material/);
});
test('a note it would not act on changes nothing', async () => {
  const p = pack(), r = await reviseFlag({ pack: p, target: { section: 'bom', index: 0 }, note: 'The upper looks too big' });
  assert.deepEqual(r.changes, []); assert.ok(r.say);
});
test('a field outside the allowed ones is dropped, even when asked for', async () => {
  const p = pack(), r = await reviseFlag({ pack: p, target: { section: 'construction', index: 0 }, note: 'set tolerance to 2mm' });
  assert.deepEqual(r.changes, []);
  const q = await reviseFlag({ pack: p, target: { section: 'construction', index: 0 }, note: 'set detail to Double-stitched and bar-tacked' }); assert.equal(q.changes[0].to, 'Double-stitched and bar-tacked');
});
test('a line that is not there is refused', async () => {
  await assert.rejects(() => reviseFlag({ pack: pack(), target: { section: 'bom', index: 7 }, note: 'set material to x' }), /not in the pack/);
});
test('a flag cannot add a row or touch another one', async () => {
  const p = pack(), r = await reviseFlag({ pack: p, target: { section: 'bom', index: 0 }, note: 'set component to Upper mesh' });
  assert.ok(r.changes.every(c => c.path[1] === 0));
});

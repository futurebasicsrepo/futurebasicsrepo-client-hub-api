import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { leadPlan, checkColourway, combineVerdicts, checkerMode, identifyParts, assignColourway, panelPrompt, planDistance, planDifference, makeColourways } from '../src/panels.js';
import { normalizeTechPack } from '../src/techpack.js';

const ref = () => sharp({ create: { width: 256, height: 256, channels: 3, background: '#cfd2d6' } }).jpeg().toBuffer();
const fx = { provider: 'fixture', configured: true };
const PARTS = [
  { label: 'Overlays', material: 'metallic PU', hex: '#b8bcc2', name: 'Silver', code: 'PANTONE 877 C', where: 'sides' },
  { label: 'Mesh', material: 'open mesh', hex: '#9aa0a6', name: 'Grey', code: 'PANTONE 429 C', where: 'windows' },
  { label: 'Outsole', material: 'rubber', hex: '#202124', name: 'Black', code: 'PANTONE Black 6 C', where: 'underneath' }
];

test('the product is broken up into labelled parts, each with a colour, a name and a Pantone C code', async () => {
  const parts = await identifyParts({ image: 'x', fixture: true });
  assert.ok(parts.length >= 3 && parts.every(p => /^#[0-9a-f]{6}$/.test(p.hex) && p.label && p.name));
  assert.ok(parts.every(p => /^PANTONE .+ C$/i.test(p.code)), parts.map(p => p.code));
});

test('a colourway gives every part a colour; parts that keep theirs are marked unchanged', async () => {
  const plan = await assignColourway({ parts: PARTS, colourway: { name: 'Champagne', swatch: '#c9b27c' }, fixture: true });
  assert.equal(plan.length, PARTS.length, 'every part is in the plan');
  assert.ok(plan.some(x => x.changed) && plan.some(x => !x.changed));
  const same = plan.find(x => !x.changed); assert.equal(same.hex, PARTS.find(p => p.label === same.label).hex);
  assert.ok(plan.filter(x => x.changed).every(x => /^PANTONE .+ C$/i.test(x.code)));
});

test('the drawing prompt names each part, keeps the others as they are, and forbids bleeding between parts', () => {
  const plan = [{ label: 'Overlays', material: 'metallic PU', from: '#b8bcc2', hex: '#c9b27c', name: 'Champagne', changed: true }, { label: 'Outsole', material: 'rubber', from: '#202124', hex: '#202124', name: 'Black', changed: false }];
  const t = panelPrompt({ plan, meta: { title: 'Trail runner' } });
  assert.match(t, /Overlays.*#b8bcc2 to #c9b27c/); assert.match(t, /metallic sheen/); assert.match(t, /stay exactly as they are[\s\S]*Outsole/);
  assert.match(t, /Do not blend, bleed or smear/);
  assert.match(panelPrompt({ plan, problem: 'colour smeared into the mesh' }), /rejected: colour smeared into the mesh/);
});

test('two colourways that colour the parts alike are one colourway', () => {
  const a = [{ hex: '#c9b27c' }, { hex: '#202124' }], b = [{ hex: '#c8b17b' }, { hex: '#202124' }], c = [{ hex: '#1d3a8a' }, { hex: '#202124' }];
  assert.ok(planDistance(a, b) < 3 && planDistance(a, c) > 20);
  assert.equal(planDifference([{ hex: '#000000', from: '#000000', changed: false }]).changed, 0);
});

test('a whole run: parts found, a picture per colourway, with its parts attached; look-alikes are skipped', async () => {
  const tiles = [], steps = [];
  const out = await makeColourways({ reference: await ref(), colourways: [{ name: 'Champagne', swatch: '#c9b27c' }, { name: 'Champagne 2', swatch: '#c9b17b' }, { name: 'Blue', swatch: '#1d3a8a' }, { name: 'No colour' }], meta: { title: 'Runner' }, cfg: fx, onStep: s => steps.push(s.stage), onTile: t => tiles.push(t.id) });
  assert.deepEqual(out.tiles.map(t => t.id), ['cw-champagne', 'cw-blue'], out.skipped);
  assert.ok(out.tiles.every(t => t.parts.length >= 3 && t.buffer.length > 500 && t.score >= 70));
  assert.ok(out.skipped.some(s => s.name === 'Champagne 2' && /another colourway/.test(s.why)));
  assert.deepEqual(tiles, ['cw-champagne', 'cw-blue'], 'each picture is handed over as soon as it is done');
  assert.ok(steps.includes('parts') && steps.includes('colourway') && steps.includes('check'));
});

test('a smeared picture is redrawn once with the problem named; one that is still wrong is dropped, not shown', async () => {
  const calls = [], plan = PARTS.map((p, i) => ({ ...p, from: p.hex, hex: i === 0 ? '#c9b27c' : p.hex, changed: i === 0 }));
  const base = { identifyParts: async () => PARTS, assignColourway: async () => plan, drawColourway: async o => { calls.push(o.problem); return ref(); } };
  let n = 0;
  const fixed = await makeColourways({ reference: await ref(), colourways: [{ name: 'Gold', swatch: '#c9b27c' }], cfg: fx, deps: { ...base, checkColourway: async () => ({ score: n++ ? 92 : 40, issues: 'colour smeared into the mesh', parts: [] }) } });
  assert.equal(fixed.tiles.length, 1); assert.deepEqual(calls, ['', 'colour smeared into the mesh']); assert.equal(fixed.tiles[0].score, 92);
  calls.length = 0;
  const bad = await makeColourways({ reference: await ref(), colourways: [{ name: 'Gold', swatch: '#c9b27c' }], cfg: fx, deps: { ...base, checkColourway: async () => ({ score: 35, issues: 'different shape', parts: [] }) } });
  assert.equal(bad.tiles.length, 0); assert.match(bad.skipped[0].why, /did not hold together \(35\/100/); assert.equal(calls.length, 2);
});

test('a colourway that would look like the product already does is not drawn', async () => {
  const out = await makeColourways({ reference: await ref(), colourways: [{ name: 'Grey', swatch: '#9aa0a6' }], cfg: fx, deps: { identifyParts: async () => PARTS, assignColourway: async () => PARTS.map(p => ({ ...p, from: p.hex, changed: false })), drawColourway: async () => { throw new Error('should not draw'); } } });
  assert.equal(out.tiles.length, 0); assert.match(out.skipped[0].why, /look the same/);
});

test('parts and per-tile parts survive saving the pack', () => {
  const p = normalizeTechPack({ parts: [{ label: 'Overlays', material: 'PU', hex: '#B8BCC2', name: 'Silver', code: 'PANTONE 877 C', where: 'sides' }, { label: '' }], renderings: [{ id: 'cw-gold', name: 'Colourway — Gold', image: 'data:image/jpeg;base64,AAAA', parts: [{ label: 'Overlays', name: 'Gold', hex: '#c9b27c', code: 'PANTONE 871 C', changed: true }] }] });
  assert.equal(p.parts.length, 1); assert.equal(p.parts[0].hex, '#b8bcc2'); assert.equal(p.renderings[0].parts[0].code, 'PANTONE 871 C');
});

test('two judges, one verdict: the stricter score stands, every problem is kept, a part is fine only if both say so', () => {
  const v = combineVerdicts([{ score: 90, issues: 'none', parts: [{ label: 'Mesh', ok: true }, { label: 'Heel', ok: true }] }, { score: 62, issues: 'gold smeared into the mesh', parts: [{ label: 'Mesh', ok: false }, { label: 'Heel', ok: true }] }]);
  assert.equal(v.score, 62); assert.match(v.issues, /smeared into the mesh/); assert.deepEqual(v.parts, [{ label: 'Mesh', ok: false }, { label: 'Heel', ok: true }]);
  assert.equal(combineVerdicts([{ unchecked: true }, { score: 80, issues: 'none', parts: [] }]).score, 80, 'a judge that could not run is left out');
  assert.equal(combineVerdicts([{ unchecked: true }]).unchecked, true, 'none ran: unchecked, not a failing score');
});

test('which judges run: Claude alone without an OpenAI key; both with one; the setting can pick', () => {
  assert.deepEqual(checkerMode({}), { claude: true, openai: false });
  assert.deepEqual(checkerMode({ OPENAI_API_KEY: 'k' }), { claude: true, openai: true });
  assert.deepEqual(checkerMode({ OPENAI_API_KEY: 'k', CW_CHECKER: 'claude' }), { claude: true, openai: false });
  assert.deepEqual(checkerMode({ OPENAI_API_KEY: 'k', CW_CHECKER: 'openai' }), { claude: false, openai: true });
  assert.deepEqual(checkerMode({ CW_CHECKER: 'openai' }), { claude: true, openai: false }, 'no key: Claude still checks');
});

test('checking runs both judges and survives one failing', async () => {
  const plan = [{ label: 'Mesh', from: '#9aa0a6', hex: '#c9b27c', name: 'Gold', changed: true }], img = await ref();
  const good = async () => ({ score: 88, issues: 'none', parts: [{ label: 'Mesh', ok: true }] }), strict = async () => ({ score: 55, issues: 'blotchy', parts: [{ label: 'Mesh', ok: false }] });
  assert.equal((await checkColourway({ reference: img, drawn: img, plan, mode: { claude: true, openai: true }, judges: { claude: good, openai: strict } })).score, 55);
  const one = await checkColourway({ reference: img, drawn: img, plan, mode: { claude: true, openai: true }, judges: { claude: good, openai: async () => { throw new Error('refused'); } } });
  assert.equal(one.score, 88); assert.equal(one.unchecked, undefined);
});

test('an answer that changes nothing is asked again, then replaced by the plain rule: the colourway is not dropped for the model\'s caution', async () => {
  const parts = [{ label: 'Upper overlays', material: 'metallic PU', hex: '#b8bcc2' }, { label: 'Mesh', material: 'mesh', hex: '#9aa0a6' }, { label: 'Outsole', material: 'rubber', hex: '#202124' }, { label: 'Laces', material: 'cord', hex: '#f0f0f0' }];
  let asked = 0;
  const lazy = await assignColourway({ parts, colourway: { name: 'Champagne', swatch: '#c9b27c' }, ask: async () => { asked++; return parts.map(p => ({ label: p.label, hex: p.hex, changed: false })); } });
  assert.equal(asked, 2, 'asked once more');
  assert.ok(lazy.find(x => x.label === 'Upper overlays').changed && lazy.find(x => x.label === 'Mesh').changed, 'the parts that carry the design take the colour');
  assert.ok(!lazy.find(x => x.label === 'Outsole').changed && !lazy.find(x => x.label === 'Laces').changed, 'soles and laces keep theirs');
  const fixed = await assignColourway({ parts, colourway: { name: 'Champagne', swatch: '#c9b27c' }, ask: async () => { asked++; return [{ label: 'upper overlays', hex: '#C9B27C' }, { label: 'MESH!', hex: '#b09a66' }, { label: 'Outsole', hex: '#202124' }, { label: 'Laces', hex: '#f0f0f0' }]; } });
  assert.equal(fixed.find(x => x.label === 'Upper overlays').hex, '#c9b27c', 'labels match ignoring case');
  assert.equal(fixed.find(x => x.label === 'Mesh').hex, '#b09a66', 'and punctuation');
});

test('answers with different labels are read by position when there is one per part', async () => {
  const parts = [{ label: 'Upper overlays', material: '', hex: '#b8bcc2' }, { label: 'Outsole', material: '', hex: '#202124' }];
  const plan = await assignColourway({ parts, colourway: { name: 'Gold', swatch: '#c9b27c' }, ask: async () => [{ label: 'Overlays', hex: '#c9b27c' }, { label: 'Sole', hex: '#202124' }] });
  assert.equal(plan[0].hex, '#c9b27c'); assert.equal(plan[0].changed, true); assert.equal(plan[1].changed, false);
});

test('the plain rule keeps each part\'s light and dark relative to the others', () => {
  const plan = leadPlan([{ label: 'Overlays', hex: '#d0d0d0' }, { label: 'Heel counter', hex: '#505050' }, { label: 'Outsole', hex: '#111111' }], '#c9b27c');
  const [a, b, c] = plan; assert.ok(a.changed && b.changed && !c.changed);
  const lum = h => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.59 + parseInt(h.slice(5, 7), 16) * 0.11;
  assert.ok(lum(a.hex) > lum(b.hex), 'the light panel stays lighter than the dark one');
});

test('the limit counts pictures drawn, not colourways tried: skipped ones do not use up the places', async () => {
  const parts = [{ label: 'A', material: '', hex: '#808080' }, { label: 'B', material: '', hex: '#303030' }];
  const asks = { Same: parts.map(p => ({ label: p.label, hex: p.hex })), One: [{ label: 'A', hex: '#c9b27c' }, { label: 'B', hex: '#303030' }], Two: [{ label: 'A', hex: '#2a4a9a' }, { label: 'B', hex: '#303030' }] };
  const out = await makeColourways({ reference: await ref(), colourways: [{ name: 'Same', swatch: '#808080' }, { name: 'One', swatch: '#c9b27c' }, { name: 'Two', swatch: '#2a4a9a' }], cfg: fx, parts,
    deps: { assignColourway: async ({ colourway }) => asks[colourway.name].map((g, i) => ({ ...parts[i], from: parts[i].hex, hex: g.hex, name: 'x', code: 'PANTONE 1 C', changed: g.hex !== parts[i].hex })) } });
  assert.deepEqual(out.tiles.map(t => t.name), ['One', 'Two']); assert.match(out.skipped[0].why, /same as the product already does \(0 of 2 parts/);
});

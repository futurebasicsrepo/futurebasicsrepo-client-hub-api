import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { traceShoe, shoeSvg, cleanDrawing, shoeViewPrompt, makeShoeDrawings, fixtureArt, SHOE_VIEW_IDS } from '../src/lab-shoe-draw.js';

test('a technical flat is traced into panels, one per region, each in its own drawn colour, with its outlines from the panels', async () => {
  const dw = await traceShoe(await fixtureArt('lateral'));
  assert.equal(dw.panels.length, 2, 'the upper and the sole');
  assert.deepEqual(dw.panels.map(p => p.fill).sort(), ['#5d6440', '#e9e5dc']);
  for (const p of dw.panels) { assert.match(p.d, /^M[\d.\s-]+Q/); assert.ok(p.area > 1000); }
  assert.ok(dw.box.x0 < 150 && dw.box.x1 > 890, 'the shoe\'s box spans the drawing');
  assert.ok(dw.stroke >= 1.6 && dw.stroke <= 4);
  // the panels meet under the line between them: nothing of the white paper shows between upper and sole
  const png = await sharp(Buffer.from(shoeSvg({ ...dw, stroke: 0.01 }))).flatten({ background: '#ff00ff' }).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = png, k = info.width / (dw.box.x1 - dw.box.x0 + 48), x = Math.round((500 - dw.box.x0 + 24) * k), y = Math.round((620 - dw.box.y0 + 24) * k), i = (y * info.width + x) * info.channels;
  assert.ok(!(data[i] > 240 && data[i + 1] < 30 && data[i + 2] > 240), 'no gap on the seam between two panels');
});

test('a near-black panel stays a panel; only thin dark strokes are line work', async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#fff"/><rect x="80" y="80" width="440" height="160" fill="#2e2f31" stroke="#050505" stroke-width="5"/><rect x="80" y="240" width="440" height="60" fill="#e8541c" stroke="#050505" stroke-width="5"/><path d="M120 160 L480 160" stroke="#050505" stroke-width="3" stroke-dasharray="10 8"/></svg>`;
  const dw = await traceShoe(await sharp(Buffer.from(svg)).png().toBuffer(), { size: 600 });
  assert.equal(dw.panels.length, 2); assert.ok(dw.panels.some(p => p.fill === '#2e2f31' || /^#2[d-f]/.test(p.fill)), 'the charcoal panel: ' + dw.panels.map(p => p.fill));
  assert.ok(dw.details.length && dw.details[0].d.length > 20, 'the stitching inside the panel is kept as a detail');
});

test('edits from the Studio: colours, names and shapes are taken; anything that is not path data is not', async () => {
  const base = await traceShoe(await fixtureArt('lateral')), [a, b] = base.panels;
  const ok = cleanDrawing({ panels: [{ id: a.id, fill: '#1F3A5F', name: 'Upper <b>', d: 'M1 1Q2 2 3 3Q4 4 5 5Z' }, { id: b.id, fill: 'red', d: '<script>' }, { id: 'zz', fill: '#000000' }], hideDetails: true }, base);
  assert.equal(ok.panels[0].fill, '#1f3a5f'); assert.equal(ok.panels[0].name, 'Upper b'); assert.equal(ok.panels[0].d, 'M1 1Q2 2 3 3Q4 4 5 5Z');
  assert.equal(ok.panels[1].fill, b.fill, 'a colour that is not a hex keeps the one it had'); assert.equal(ok.panels[1].d, b.d, 'a path that is not path data keeps the one it had');
  assert.equal(ok.panels.length, 2, 'a panel that never existed and has no shape is dropped'); assert.equal(ok.hideDetails, true);
  assert.equal(cleanDrawing({ panels: [] }, base), null);
  const svg = shoeSvg({ ...ok, panels: [{ ...ok.panels[0], hidden: true }, ok.panels[1]] });
  assert.ok(!svg.includes('#1f3a5f') && svg.includes(b.fill), 'a hidden panel is not drawn'); assert.match(svg, /<g class="details"[^>]*><\/g>/, 'details switched off');
});

test('the outside is drawn from the side profile; every other view from the outside drawing; a failed outside skips the rest', async () => {
  for (const v of SHOE_VIEW_IDS) { const p = shoeViewPrompt(v, 'Ridge'); assert.match(p, /flat solid colour/); assert.match(p, /no text, no logos/); }
  assert.match(shoeViewPrompt('lateral'), /toe pointing right/); assert.match(shoeViewPrompt('medial'), /toe pointing LEFT/); assert.match(shoeViewPrompt('bottom'), /outsole/);
  const side = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#888' } }).png().toBuffer(), calls = [], landed = [];
  const edit = async ({ images, prompt }) => { calls.push({ ref: images[0], prompt }); return fixtureArt(/Redraw/.test(prompt) ? 'lateral' : 'top'); };
  const art = await makeShoeDrawings({ side, views: SHOE_VIEW_IDS, cfg: { provider: 'openai', configured: true, model: 'm' }, edit, onView: (v, r) => landed.push([v, Boolean(r)]) });
  assert.equal(calls.length, 5); assert.equal(calls[0].ref, side, 'the outside from the side profile'); assert.ok(calls.slice(1).every(c => c.ref === art.lateral), 'the others from the outside drawing');
  assert.deepEqual(landed[0], ['lateral', true]); assert.equal(landed.filter(l => l[1]).length, 5);
  const failed = []; await makeShoeDrawings({ side, cfg: { provider: 'openai', configured: true }, edit: async () => { throw new Error('model down'); }, onView: (v, r, note) => failed.push([v, r, note]) });
  assert.equal(failed.length, 5); assert.match(failed[0][2], /model down/); assert.match(failed[1][2], /outside view could not be drawn/);
});

test('the drawing\'s colours go to the pattern\'s parts: by name when the designer named a panel, else by where the colour sits', async () => {
  const { drawingColours, partOfName } = await import('../src/lab-shoe-draw.js');
  const P = (id, fill, y0, y1, area, name) => ({ id, fill, area, d: 'M0 0Z', box: { x0: 0, y0, x1: 900, y1 }, ...(name ? { name } : {}) });
  // a runner: charcoal mesh and an olive cage above, a bone midsole, an orange outsole along the ground
  const dw = { panels: [P('a', '#343537', 100, 420, 60000), P('b', '#888d61', 160, 460, 40000), P('c', '#edeae4', 430, 560, 45000), P('d', '#e85322', 520, 600, 25000)] };
  assert.deepEqual(drawingColours(dw), { outsole: '#e85322', sole: '#edeae4', upper: '#343537', overlay: '#888d61' });
  // one colour from the ground up: the sole is the outsole's colour
  assert.deepEqual(drawingColours({ panels: [P('a', '#2f3b57', 100, 420, 60000), P('c', '#f1efe9', 430, 600, 45000)] }), { outsole: '#f1efe9', sole: '#f1efe9', upper: '#2f3b57' });
  // a named panel says its part, whatever its place; a hidden panel says nothing
  const named = drawingColours({ panels: [P('a', '#343537', 100, 420, 60000, 'Vamp'), P('t', '#aa2211', 300, 420, 3000, 'Toe cap'), P('l', '#ffffff', 120, 200, 2000, 'Laces'), P('x', '#00ff00', 0, 600, 90000)].map(p => p.id === 'x' ? { ...p, hidden: true } : p).concat(P('c', '#edeae4', 430, 600, 45000)) });
  assert.equal(named.upper, '#343537'); assert.equal(named.overlay, '#aa2211'); assert.equal(named.lace, '#ffffff'); assert.equal(named.outsole, '#edeae4'); assert.ok(!Object.values(named).includes('#00ff00'));
  assert.equal(partOfName('Midsole'), 'sole'); assert.equal(partOfName('outsole lugs'), 'outsole'); assert.equal(partOfName('heel counter'), 'overlay'); assert.equal(partOfName('Quarter'), 'upper'); assert.equal(partOfName('stripe'), null);
  assert.deepEqual(drawingColours({ panels: [] }), {});
});

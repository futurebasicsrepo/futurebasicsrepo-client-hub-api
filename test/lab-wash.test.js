import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WASHES, cleanWash, cleanDistress, distressParts, washWords, washPrompt, washSvg } from '../src/lab-wash.js';
import { cleanFlat, defaultParams, renderSvg } from '../src/lab-flats.js';

test('the washes a garment takes: stone, acid, snow, enzyme, potassium permanganate, bleach and the rest, each with the factory words', () => {
  for (const id of ['stone', 'acid', 'snow', 'enzyme', 'pp-spray', 'bleach', 'garment-dye', 'pigment', 'mineral', 'ozone', 'laser', 'sun']) assert.ok(WASHES.some(w => w.id === id), id);
  assert.ok(WASHES.every(w => w.label && w.how && w.group));
  assert.match(WASHES.find(w => w.id === 'pp-spray').how, /potassium permanganate/i);
});

test('cleaning: an unknown wash or none is dropped; strength and the distress amount are kept in range', () => {
  assert.equal(cleanWash({ type: 'none' }), null); assert.equal(cleanWash({ type: 'lava' }), null);
  assert.deepEqual(cleanWash({ type: 'stone', strength: 'x' }), { type: 'stone', strength: 'medium' });
  assert.deepEqual(cleanDistress({ on: 1, amount: 250 }), { on: true, amount: 100 });
  assert.deepEqual(cleanDistress({ on: false, amount: 30 }), { on: false, amount: 30 });
});

test('more distressing means more wear: patches, then holes, then heavier fraying', () => {
  const a = distressParts(10), b = distressParts(60), c = distressParts(100);
  assert.ok(a.holes === 0 && b.holes > 0 && c.holes > b.holes && c.abrasion > a.abrasion && c.fray > a.fray);
  assert.deepEqual([a.level, b.level, c.level], ['light', 'medium', 'heavy']);
});

test('the words: the wash for the factory, distressing only when it is on', () => {
  const w = washWords({ wash: { type: 'acid', strength: 'heavy' }, distress: { on: false, amount: 80 } });
  assert.equal(w.length, 2, 'the wash and its shrink allowance; no distressing while it is off'); assert.match(w[0], /^Acid wash, heavy\./); assert.match(w[1], /^Measurements in this pack are finished/);
  assert.match(washWords({ distress: { on: true, amount: 60 } })[0], /^Distressed, medium \(60\/100\)/);
  assert.equal(washPrompt({}), '');
  assert.match(washPrompt({ wash: { type: 'snow', strength: 'light' }, distress: { on: true, amount: 80 } }), /light snow wash finish, heavy distressing/);
});

test('the flat keeps the wash and distressing and draws them inside the garment', () => {
  const { params } = cleanFlat({ ...defaultParams('pants'), color: '#2b3a5c', wash: { type: 'stone', strength: 'heavy' }, distress: { on: true, amount: 70 } });
  assert.deepEqual([params.wash, params.distress], [{ type: 'stone', strength: 'heavy' }, { on: true, amount: 70 }]);
  const svg = renderSvg(params, 'front');
  assert.ok(svg.includes('data-wash="stone"') && svg.includes('data-distress="70"') && /mask="url\(#[^"]+-gm\)"/.test(svg));
  assert.ok(!renderSvg(defaultParams('pants'), 'front').includes('data-wash'));
  assert.equal(washSvg({ distress: { on: false, amount: 90 } }, { box: { x0: 0, y0: 0, x1: 10, y1: 10 }, mask: 'm' }), '', 'distressing off draws nothing');
});

test('distressing can stay on the edges or the body, and names the right places for a top or a bottom', async () => {
  const { DISTRESS_FOCUS, distressList } = await import('../src/lab-wash.js');
  assert.deepEqual(DISTRESS_FOCUS.map(f => f.id), ['all', 'edges', 'body']);
  assert.deepEqual(cleanDistress({ on: true, amount: 50, focus: 'edges' }), { on: true, amount: 50, focus: 'edges' });
  assert.deepEqual(cleanDistress({ on: true, amount: 50, focus: 'nowhere' }), { on: true, amount: 50 });
  const edges = distressParts(90, 'edges'), body = distressParts(90, 'body');
  assert.ok(edges.nicks > 0 && edges.fringe && !edges.holes && !edges.rips && !edges.abrasion, 'edges only: nicks and a ragged hem, no holes');
  assert.ok(!body.nicks && !body.fringe && body.holes > 0 && body.rips > 0, 'body only: holes and rips, edges left clean');
  assert.match(distressList({ amount: 90 }, 'bottom').join(', '), /open rips at the knees/);
  assert.match(distressList({ amount: 40 }, 'top').join(', '), /collar, cuffs and hem/);
  assert.match(washWords({ style: 'pants', distress: { on: true, amount: 90 } })[0], /knees/);
});

test('the reference looks: a spray fade lights the top and keeps the ribs dark; a ragged hem hangs past the edge', () => {
  const box = { x0: -12, y0: -11, x1: 12, y1: 27.5 }, geo = { kind: 'top', half: 11.5, neckY: 3.5, neckHalf: 4, hemY: 27.5, hemRib: 2.75, cuff: 2.75, longSleeve: true };
  const spray = washSvg({ wash: { type: 'spray', strength: 'heavy' } }, { box, mask: 'm', geo });
  assert.ok(spray.includes('-wt') && spray.includes('-wr') && spray.includes('fill="#000000"'), 'a top-down fade and darker ribs');
  const torn = washSvg({ distress: { on: true, amount: 80, focus: 'edges' } }, { box, mask: 'm', geo });
  assert.ok(torn.includes('data-fringe="1"') && torn.indexOf('data-fringe') > torn.indexOf('mask="url(#m)"'), 'the fringe is drawn after (outside) the masked wear');
  assert.ok(WASHES.some(w => w.id === 'dirty') && WASHES.some(w => w.id === 'spray'));
});

test('a wash tells the factory the measurements are finished, with a shrink allowance', async () => {
  const { washShrink, washWords } = await import('../src/lab-wash.js');
  assert.equal(washShrink({}), 0);
  const stone = washShrink({ wash: { type: 'stone', strength: 'medium' } }), heavy = washShrink({ wash: { type: 'stone', strength: 'heavy' } });
  assert.ok(stone > 0 && heavy > stone);
  assert.ok(washWords({ wash: { type: 'stone', strength: 'medium' } }).some(t => /finished, taken after the wash.*%/.test(t)));
});

test('a browser gets the wash as drawn; the service draws the same with a two-pass erode, or lays in a picture of it', () => {
  const { params } = cleanFlat({ ...defaultParams('hoodie'), color: '#8a5a44', wash: { type: 'stone', strength: 'medium' }, distress: { on: true, amount: 70, focus: 'edges' } });
  const page = renderSvg(params, 'front'), raster = renderSvg(params, 'front', { raster: true });
  assert.ok(page.includes('operator="erode" radius="0.4"/>') && !page.includes('radius="0.4 0"'), 'the browser keeps one square erode');
  assert.ok(raster.includes('radius="0.4 0"/><feMorphology operator="erode" radius="0 0.4"/>'), 'the service erodes across, then down');
  // the pictures the service makes: the wash alone, uncut and past its box; the garment alone; the distressing over a picture of the wash
  const wash = renderSvg(params, 'front', { washOnly: 'wash', raster: true, scale: 10 }), mask = renderSvg(params, 'front', { washOnly: 'mask', scale: 10 });
  assert.ok(wash.includes('data-wash="stone"') && !wash.includes('data-distress') && !/<g mask=/.test(wash), 'the wash, not yet cut to the garment');
  assert.match(mask, /<\/defs><use href="#[^"]+-b"\/><\/svg>$/);
  const wear = renderSvg(params, 'front', { washOnly: 'wear', raster: true, scale: 10, washHref: 'data:image/png;base64,AA', washAt: { w: 100, h: 90 } });
  assert.ok(wear.includes('clip-path="url(#') && wear.includes('data-distress="70"') && !wear.includes('data-fringe'), 'the wash cut at its box, the distressing over it');
  assert.equal(renderSvg(defaultParams('hoodie'), 'front', { washOnly: 'wear' }), '', 'nothing to draw: no picture');
  // the flat with the picture: no filters for the wash, the fringe still drawn past the hem
  const laid = renderSvg(params, 'front', { raster: true, washHref: 'data:image/png;base64,AA', washAt: { w: 100, h: 90 } });
  assert.ok(laid.includes('<image href="data:image/png;base64,AA"') && !laid.includes('data-wash') && !laid.includes('-wm"') && laid.includes('data-fringe="1"'));
});

test('a flat picture drawn with the picture of its wash looks as it does drawn with the filters', async () => {
  const { readFileSync } = await import('node:fs'), sharp = (await import('sharp')).default, { washPictures, flatPng } = await import('../src/lab-flats-routes.js');
  const templateSvg = file => { const t = readFileSync(new URL(`../src/flat-templates/${file}`, import.meta.url), 'utf8'); return t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>')); };
  const W = 480, diff = async (a, b) => { const [x, y] = await Promise.all([a, b].map(s => flatPng(s, W).flatten({ background: '#ffffff' }).raw().toBuffer())); let sum = 0, mx = 0; for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); sum += d; mx = Math.max(mx, d); } return { mean: sum / x.length, mx }; };
  for (const wash of [{ type: 'stone', strength: 'medium' }, { type: 'snow', strength: 'heavy' }]) {
    const { params } = cleanFlat({ ...defaultParams('hoodie'), color: '#8a5a44', wash, distress: { on: true, amount: 70 } }), o = { templateSvg, scale: 60, raster: true };
    const pics = await washPictures(params, ['front'], { templateSvg }, W);
    const d = await diff(renderSvg(params, 'front', o), renderSvg(params, 'front', { ...o, ...pics.front }));
    assert.ok(d.mean < .5 && d.mx < 24, `${wash.type}: mean ${d.mean.toFixed(3)}, max ${d.mx}`);
  }
});

test('distressing is on the edges of the drawing: every nick and every frayed thread of every library top and bottom starts on its outline', async () => {
  const { FLAT_TEMPLATES } = await import('../src/lab-flat-templates.js'), { washGeo, fitToTemplate, drawingOf, STYLES } = await import('../src/lab-flats.js');
  const toSeg = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const dist = (sil, q) => Math.min(...sil.map((a, i) => toSeg(q, a, sil[(i + 1) % sil.length])));
  const off = []; let nicks = 0, threads = 0, views = 0;
  for (const t of FLAT_TEMPLATES) {
    const kind = STYLES[t.style]?.kind; if (kind !== 'top' && kind !== 'bottom') continue;
    const p = { ...fitToTemplate({ ...defaultParams(t.style), template: t.id }), distress: { on: true, amount: 19, focus: 'edges' } }; // nicks and a ragged hem; no pinholes (body wear)
    for (const view of Object.keys(t.views)) {
      const geo = washGeo(p, view), d = drawingOf(p, view); if (!geo?.sil || !d) continue; views++;
      const svg = washSvg(p, { box: d.box, mask: 'm', kind, view, geo });
      for (const m of svg.matchAll(/<path d="([^"]+)" fill="#141210"/g)) { // each nick: the centre of its dark hole
        const n = m[1].match(/-?[\d.]+/g).map(Number), q = [0, 1].map(k => n.filter((_, i) => i % 2 === k).reduce((s, v) => s + v, 0) / (n.length / 2)), e = dist(geo.sil, q); nicks++;
        const neck = kind === 'top' && q[1] < geo.neckY + 1 && Math.abs(q[0]) < geo.neckHalf + .5, pocket = kind === 'bottom' && q[1] < geo.waistband + 3 && e < 2.2;
        if (neck ? !geo.neck : !(pocket || e < .8)) off.push(`${t.id} ${view}: a nick ${e.toFixed(1)} in from the edge at ${q.map(v => v.toFixed(1))}${neck ? ' (a neck with no rib)' : ''}`);
      }
      for (const m of (svg.match(/data-fringe="1">(.*)<\/g>/)?.[1] || '').matchAll(/<path d="M ([-\d.]+) ([-\d.]+) q/g)) { threads++; const e = dist(geo.sil, [Number(m[1]), Number(m[2])]); if (e > .4) off.push(`${t.id} ${view}: a frayed thread ${e.toFixed(1)} in from the edge`); }
    }
  }
  assert.ok(views > 700 && nicks > 3000 && threads > 5000, `${views} views, ${nicks} nicks, ${threads} threads`);
  assert.deepEqual(off.slice(0, 12), [], `${off.length} of ${nicks} nicks and ${threads} threads off the edges`);
});

test('a ribbed neck is darkened and worn only where there is one: a crew, not a hood, a collar or an open neck', async () => {
  const { washGeo, fitToTemplate } = await import('../src/lab-flats.js');
  const neck = (style, template, more = {}) => washGeo({ ...fitToTemplate({ ...defaultParams(style), template }), ...more }, 'front').neck;
  assert.deepEqual([neck('tee', 'tee-classic'), neck('crewneck', 'crew-classic'), neck('tank', 'tank-muscle-tank'), neck('dress', 'dr-t-shirt-dress')], [true, true, true, true]);
  assert.deepEqual([neck('hoodie', 'hood-boxy'), neck('polo', 'polo-rib-hem-polo'), neck('shirt', 'shirt-classic-shirt'), neck('vest', 'vest-zip-fleece-vest'), neck('tee', 'tee-vneck'), neck('dress', 'dr-strapless-mini-dress')], [false, false, false, false, false, false]);
  assert.equal(neck('tee', 'tee-vneck', { neckline: 'regular' }), true, 'a crew chosen in the Studio is a crew');
  // and the darkened neck is a band along the neckline, not a patch over the chest
  const { params } = cleanFlat({ ...defaultParams('tee'), wash: { type: 'garment-dye', strength: 'medium' } });
  assert.ok(!/<ellipse[^>]*fill="#000000"/.test(renderSvg(params, 'front')), 'no dark ellipse at the neck');
});

test('the wash darkens the hem the sketch is drawn with, not where the measured length would put it', async () => {
  const { washGeo, fitToTemplate, drawingOf } = await import('../src/lab-flats.js');
  for (const [style, template] of [['tee', 'tee-boxy'], ['longsleeve', 'ls-long-sleeve-tee'], ['crewneck', 'crew-classic'], ['hoodie', 'hood-boxy']]) {
    const p = { ...fitToTemplate({ ...defaultParams(style), template }), wash: { type: 'spray', strength: 'heavy' } }, g = washGeo(p, 'front'), d = drawingOf(p, 'front');
    const ys = []; g.sil.forEach((a, i) => { const b = g.sil[(i + 1) % g.sil.length]; if ((a[0] <= 0) !== (b[0] <= 0)) ys.push(a[1] + (0 - a[0]) / (b[0] - a[0]) * (b[1] - a[1])); }); const drawn = Math.max(...ys);
    assert.ok(Math.abs(g.hemY - drawn) < .75, `${template}: the hem at ${g.hemY.toFixed(1)} in, the drawing's body ends at ${drawn.toFixed(1)} in`);
    const band = washSvg(p, { box: d.box, mask: 'm', kind: 'top', geo: g }).match(/<g filter="url\(#w-wr\)"><path d="M ([-\d.]+) ([-\d.]+)/);
    assert.ok(band && Number(band[2]) > g.hemY - (g.hemRib || 1) - 1.5, `${template}: the hem band starts at ${band?.[2]} in, the hem is at ${g.hemY.toFixed(1)} in`);
  }
});

// Drinkware's wrap (src/lab-goods.js, src/lab-flats.js): every cup's second view is its wrap laid flat at true size, with the centres of the
// front and the back and the handle marked where they fall; a graphic placed on it is checked, saved, read back where it was put, named as on
// the wrap, drawn on the wrap and on each side where it falls, and goes to the spec sheet and the tech pack's pictures. A graphic saved on a
// cup's other side before there was a wrap is moved to the back drawn beside the front.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import Fastify from 'fastify';
import { GOODS, hasWrap, wrapOf, backSideX } from '../src/lab-goods.js';
import { STYLES, viewsOf, viewLabel, sideOf, wrapStyle, upgradePlacements, defaultParams, geometry, renderSvg, viewBoxOf, placementChecks, defaultPlacement, describe, cleanFlat } from '../src/lab-flats.js';
import { registerLabFlatsRoutes } from '../src/lab-flats-routes.js';

const CUPS = Object.keys(GOODS).filter(k => hasWrap(GOODS[k]));
const box = poly => ({ x0: Math.min(...poly.map(q => q[0])), x1: Math.max(...poly.map(q => q[0])), y0: Math.min(...poly.map(q => q[1])), y1: Math.max(...poly.map(q => q[1])) });
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const RED = 'data:image/png;base64,' + (await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 230, g: 20, b: 20, alpha: 1 } } }).png().toBuffer()).toString('base64');
// a drawing as pixels, and the colour at a point given in the drawing's own inches
async function pixels(p, view, o = {}) {
  const svg = renderSvg(p, view, { scale: 40, showDims: false, ...o }), vb = viewBoxOf(p, view, { side: o.side || null });
  const { data, info } = await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  return { svg, red: (x, y) => { const px = Math.round((x - vb.x0) / vb.w * info.width), py = Math.round((y - vb.y0) / vb.h * info.height), i = (py * info.width + px) * info.channels; return data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90; } };
}

test('every cup has a wrap as its second view: wrapWidth × printHeight at true size, named as what it is', () => {
  assert.deepEqual(CUPS.slice().sort(), ['bottle', 'cancooler', 'canglass', 'mug', 'petbowl', 'pintglass', 'rocksglass', 'speaker', 'tumbler', 'tumblerhandle', 'wineglass']);
  for (const k of CUPS) { const p = defaultParams(k), g = geometry(p, 'back'), m = p.m;
    assert.ok(wrapStyle(k)); assert.deepEqual(viewsOf(k), ['front', 'back']);
    assert.equal(viewLabel(k, 'back'), 'Wrap'); assert.equal(viewLabel(k, 'front'), GOODS[k].sides === 2 ? 'Sides' : 'Front', `${k}: its first view is its sides, or its front when it has one side`);
    assert.deepEqual(Object.keys(g.regions), ['wrap print area']); const b = box(g.regions['wrap print area']);
    assert.ok(near(b.x1 - b.x0, m.wrapWidth) && near(b.y1 - b.y0, m.printHeight), `${k}: the wrap is ${m.wrapWidth} × ${m.printHeight} in, drawn ${b.x1 - b.x0} × ${b.y1 - b.y0}`);
    assert.ok(near(b.x0, -m.wrapWidth / 2), `${k}: its middle is x 0`);
    const side = box(geometry(p, 'front').regions['print area']); assert.ok(near(side.y0, b.y0) && near(side.y1, b.y1), `${k}: the wrap sits as far below the top edge as the print area on the side`);
    assert.deepEqual(g.pom.map(d => d.key), ['wrapWidth', 'printHeight']);
    assert.ok(g.guides.some(x => x.key === 'front') || g.notes.length, `${k}: the centre of the front is marked, or said to be off the wrap`);
    for (const x of g.guides) assert.ok(x.x >= b.x0 - 1e-6 && x.x <= b.x1 + 1e-6, `${k}: ${x.label} is drawn on the wrap`);
    const svg = renderSvg(p, 'back', { showPom: true }); assert.ok(!/NaN|undefined/.test(svg)); assert.match(svg, / · wrap · /);
  }
  // nothing else has one: a pillow's second view is its back
  for (const k of ['pillow', 'tee', 'cap']) { assert.equal(wrapStyle(k), false); assert.equal(viewLabel(k, 'back'), 'Back'); assert.equal(viewLabel(k, 'front'), 'Front'); assert.equal(geometry(defaultParams(k), 'back').wrap, undefined); }
});

test('the guides: a mug is wrapped from one side of the handle to the other; a cup with no handle from the middle of its front', () => {
  const mug = geometry(defaultParams('mug'), 'back'), C = Math.PI * 3.25, by = (g, key) => g.guides.filter(x => x.key === key).map(x => x.x);
  assert.ok(near(mug.wrap.C, C, 1e-9)); assert.ok(mug.wrap.straight);
  assert.ok(near(by(mug, 'front')[0], C / 4, 1e-9), 'the centre of the front is a quarter turn to the right of the middle of the wrap (the handle is to the right of the front)');
  assert.ok(near(by(mug, 'back')[0], -C / 4, 1e-9), 'the centre of the back a quarter turn to the left');
  assert.deepEqual(mug.notes.map(n => n.t), ['The handle is % past each end of the wrap']); assert.ok(near(mug.notes[0].v, (C - 8.5) / 2, 1e-9), 'the wrap stops short of the handle by half of what it leaves of the way round');
  const svg = renderSvg(defaultParams('mug'), 'back'); for (const t of ['Centre of the front', 'Centre of the back', 'past each end of the wrap']) assert.ok(svg.includes(t), `the wrap says: ${t}`);
  // no handle: the front in the middle, the ends at the back. A tumbler's wrap is a little longer than the way round, a can cooler's a little shorter
  const tum = geometry(defaultParams('tumbler'), 'back'), Ct = Math.PI * 2.875;
  assert.deepEqual(by(tum, 'front'), [0]); assert.deepEqual(by(tum, 'back').map(x => +x.toFixed(4)), [-(Ct / 2).toFixed(4), +(Ct / 2).toFixed(4)].map(Number));
  assert.match(tum.notes[0].t, /longer than the way round, so its ends overlap at the back/); assert.ok(near(tum.notes[0].v, 9.25 - Ct, 1e-9));
  const cc = geometry(defaultParams('cancooler'), 'back'); assert.deepEqual(by(cc, 'back'), []); assert.match(cc.notes[0].t, /stops % short of the centre of the back at each end/);
  // a glass that tapers says a flat sheet is curved to fit it; a speaker's wrap is a panel on its front
  const pint = geometry(defaultParams('pintglass'), 'back'); assert.equal(pint.wrap.straight, false); assert.ok(pint.notes.some(n => /tapers/.test(n.t))); assert.equal(pint.wrap.rows.length, 8);
  assert.ok(pint.wrap.rows[0].half > pint.wrap.rows[7].half, 'a pint glass is wider at the top of its print area than at the bottom');
  const sp = geometry(defaultParams('speaker'), 'front'); assert.equal(sp.sides.length, 1); assert.equal(sp.labels, undefined);
  // a measurement typed in is the wrap's size; nothing typed still draws
  const wide = { ...defaultParams('mug'), m: { ...defaultParams('mug').m, wrapWidth: 9, printHeight: 3 } }, wb = box(geometry(wide, 'back').regions['wrap print area']); assert.ok(near(wb.x1 - wb.x0, 9) && near(wb.y1 - wb.y0, 3));
  assert.ok(!/NaN/.test(renderSvg({ ...wide, m: { ...wide.m, wrapWidth: 0, printHeight: 0 } }, 'back')));
});

test('a graphic across the whole wrap: checked, saved with its mark, read back where it was put, and named as on the wrap', () => {
  for (const k of CUPS) { const p = defaultParams(k), w = wrapOf(GOODS[k], p.m), q = { id: 'band', name: 'Band', view: 'back', x: 0, y: w.top + w.ph / 2, w: w.W - .5, h: w.ph - .5, technique: 'sublimation', source: 'extra' }, e8 = v => Math.round(v * 8) / 8;
    assert.deepEqual(placementChecks(q, p, {}), [], `${k}: a band a quarter inch inside the wrap all round can be made`);
    assert.deepEqual(placementChecks({ ...q, w: w.W, h: w.ph }, p, {}).map(f => [f.level, f.code]), [['warn', 'NEAR_SEAM']], `${k}: one that fills it from end to end can be made, and is told it runs to the edge`);
    assert.equal(placementChecks({ ...q, w: w.W + .125, h: w.ph }, p, {})[0].code, 'OVER_EDGE', `${k}: an eighth wider than the wrap is over its edge`);
    assert.equal(placementChecks({ ...q, x: 1 }, p, {})[0].code, 'OVER_EDGE', `${k}: one that runs off the end of the wrap is caught`);
    assert.match(placementChecks({ ...q, x: 40 }, p, {})[0].text, /Move it onto the wrap/);
    const saved = cleanFlat({ style: k, m: p.m, template: 'none', placements: [q, { ...q, id: 'side', view: 'front', y: w.top + w.ph / 2, w: 1, h: 1 }] }), again = cleanFlat({ ...saved.params, placements: saved.placements });
    assert.equal(saved.placements[0].wrap, true, `${k}: a graphic on the wrap is marked as on the wrap`); assert.equal(saved.placements[1].wrap, undefined);
    assert.deepEqual([saved.placements[0].view, saved.placements[0].x, saved.placements[0].y, saved.placements[0].w, saved.placements[0].h], ['back', q.x, e8(q.y), q.w, q.h], `${k}: kept where it was put, to the eighth`);
    assert.deepEqual(again, saved, `${k}: read back and saved again, nothing moves`);
    assert.match(describe(saved.placements[0], saved.params), /^On the wrap, .* below the top edge of the /); assert.equal(sideOf(saved.placements[0], saved.params), 'Wrap');
    // a new graphic on the wrap starts at the centre of the front, and passes
    const d = { id: 'n', name: 'New', ...defaultPlacement('graphic', p, { label: 'wrap', aspect: 2 }) }; assert.equal(d.view, 'back'); assert.deepEqual(placementChecks(d, p, {}).filter(f => f.level === 'fail'), []);
    assert.match(describe(d, p), /at the centre of the front|of the centre of the front/, `${k}: ${describe(d, p)}`);
  }
  // a garment's back is not a wrap
  assert.equal(cleanFlat({ style: 'tee', placements: [{ id: 'a', name: 'A', view: 'back', x: 0, y: 6, w: 4, h: 4 }] }).placements[0].wrap, undefined);
  // a product type keeps no wash, distressing or neckline (its page offers none); a garment keeps them
  const wash = { type: 'enzyme', strength: 'medium' }; assert.equal(cleanFlat({ style: 'mug', wash, distress: { on: true, amount: 40 } }).params.wash, undefined); assert.equal(cleanFlat({ style: 'mug', wash, distress: { on: true, amount: 40 } }).params.distress, undefined);
  assert.ok(cleanFlat({ style: 'tee', wash }).params.wash, 'a tee keeps its wash');
});

test('what is placed on the wrap is drawn on the wrap, and on each side where it falls', async () => {
  const p = { ...defaultParams('mug'), color: '#ffffff' }, w = wrapOf(GOODS.mug, p.m), D = backSideX(GOODS.mug, p.m), mid = w.top + w.ph / 2, C = w.C;
  const band = { id: 'band', name: 'Band', view: 'back', wrap: true, x: 0, y: mid, w: w.W, h: w.ph }, opts = { placements: [band], hrefs: { band: RED } };
  const wrap = await pixels(p, 'back', opts); assert.match(wrap.svg, /data-pl="band"/); assert.ok(wrap.red(0, mid) && wrap.red(w.W / 2 - .1, mid) && !wrap.red(w.W / 2 + .3, mid), 'on the wrap, from end to end');
  const sides = await pixels(p, 'front', opts);
  assert.match(sides.svg, /data-wrap-shown="1"/); assert.ok(!/data-pl="band"/.test(sides.svg), 'on the sides it is shown, not something to drag');
  assert.ok(sides.red(0, mid) && sides.red(D, mid), 'the band shows across the front and across the back');
  assert.ok(!sides.red(0, w.top - .06) && !sides.red(0, w.top + w.ph + .06), 'only as tall as the wrap');
  // the wrap stops short of the handle: the front (handle to the right) is bare near the handle and covered to its other edge; the back mirrors it
  assert.ok(sides.red(-1.5, mid) && sides.red(1.2, mid) && !sides.red(1.52, mid), 'the front is covered to its left edge and bare by the handle');
  assert.ok(sides.red(D + 1.5, mid) && sides.red(D - 1.2, mid) && !sides.red(D - 1.52, mid), 'the back is covered to its right edge and bare by the handle');
  // a small graphic at the centre of the front is on the front's centre line, not on the back; at the centre of the back, the other way round
  const dot = x => ({ placements: [{ id: 'dot', name: 'Dot', view: 'back', wrap: true, x, y: mid, w: .5, h: .5 }], hrefs: { dot: RED } });
  const f = await pixels(p, 'front', dot(C / 4)); assert.ok(f.red(0, mid) && !f.red(D, mid) && !f.red(.6, mid), 'the centre of the front falls on the front');
  const b = await pixels(p, 'front', dot(-C / 4)); assert.ok(b.red(D, mid) && !b.red(0, mid), 'the centre of the back falls on the back');
  // at the middle of the wrap (opposite the handle) it is on the far edge of both sides, a sliver each
  const wide = { placements: [{ id: 'dot', name: 'Dot', view: 'back', wrap: true, x: 0, y: mid, w: 2, h: .5 }], hrefs: { dot: RED } };
  const m = await pixels(p, 'front', wide); assert.ok(!m.red(0, mid) && !m.red(D, mid) && m.red(-1.45, mid) && m.red(D + 1.45, mid), 'opposite the handle it is seen at the far edge of both sides');
  // one side alone (a tech pack's front and back pictures) carries it too; the drawing alone (plain, no artwork) does not
  const front = await pixels(p, 'front', { ...opts, side: 'front' }), back = await pixels(p, 'front', { ...opts, side: 'back' });
  assert.ok(front.red(0, mid) && back.red(D, mid)); assert.match(front.svg, / · front · /); assert.match(back.svg, / · back · /);
  assert.ok(!/data-wrap-shown/.test(renderSvg(p, 'front', { ...opts, plain: true }))); assert.match(renderSvg(p, 'front', { ...opts, plain: true, withArt: true }), /data-wrap-shown/);
  // a tumbler has no handle: the middle of its wrap is the front, and its ends come round to the middle of the back
  const t = { ...defaultParams('tumbler'), color: '#ffffff' }, tw = wrapOf(GOODS.tumbler, t.m), Dt = backSideX(GOODS.tumbler, t.m), tm = tw.top + tw.ph / 2;
  const at = x => ({ placements: [{ id: 'dot', name: 'Dot', view: 'back', wrap: true, x, y: tm, w: .5, h: .5 }], hrefs: { dot: RED } });
  const tf = await pixels(t, 'front', at(0)); assert.ok(tf.red(0, tm) && !tf.red(Dt, tm));
  const te = await pixels(t, 'front', at(tw.W / 2 - .4)); assert.ok(!te.red(0, tm) && te.red(Dt - .2, tm), 'the end of the wrap is seen at the middle of the back');
  // a glass that tapers shows the wrap narrower where the glass is narrower
  const g = { ...defaultParams('pintglass'), color: '#ffffff' }, gw = wrapOf(GOODS.pintglass, g.m), full = { placements: [{ id: 'band', name: 'Band', view: 'back', wrap: true, x: 0, y: gw.top + gw.ph / 2, w: gw.W, h: gw.ph }], hrefs: { band: RED } };
  const pg = await pixels(g, 'front', full), top = gw.rows[0], bot = gw.rows[7]; assert.ok(pg.red(top.half - .08, (top.y0 + top.y1) / 2) && !pg.red(top.half - .08, (bot.y0 + bot.y1) / 2) && pg.red(bot.half - .08, (bot.y0 + bot.y1) / 2));
});

test('a graphic saved on a cup\'s other side before there was a wrap is moved to the back beside the front, and nothing else is touched', () => {
  const p = defaultParams('mug'), D = backSideX(GOODS.mug, p.m), old = { id: 'old', name: 'Old', view: 'back', x: .5, y: 1.875, w: 1, h: 1 }, wrapped = { id: 'w', name: 'W', view: 'back', wrap: true, x: .5, y: 1.875, w: 1, h: 1 }, front = { id: 'f', name: 'F', view: 'front', x: 0, y: 1.875, w: 1, h: 1 };
  const up = upgradePlacements(p, [old, wrapped, front]);
  assert.deepEqual(up[0], { ...old, view: 'front', x: D + .5 }, 'the same distance from the centre line of the back'); assert.equal(up[1], wrapped); assert.equal(up[2], front);
  assert.equal(sideOf(up[0], p), 'Back'); assert.match(describe(up[0], p), /^On the back, .*centre ½ in \(1\.3 cm\) off centre$/); assert.deepEqual(placementChecks(up[0], p, {}), []);
  assert.deepEqual(upgradePlacements(p, up), up, 'run again, nothing moves');
  // once saved it is a graphic on the sides, and stays one
  assert.equal(cleanFlat({ ...p, placements: up }).placements[0].view, 'front');
  const tee = [{ id: 'a', view: 'back', x: 0, y: 6, w: 4, h: 4 }]; assert.equal(upgradePlacements(defaultParams('tee'), tee), tee, 'a garment\'s back stays its back');
  const pillow = [{ id: 'a', view: 'back', x: 0, y: 9, w: 4, h: 4 }]; assert.equal(upgradePlacements(defaultParams('pillow'), pillow), pillow, 'and a pillow\'s');
  assert.deepEqual(upgradePlacements(null, null), []);
});

// ---- the routes: the saved flat, the spec sheet and the tech pack's pictures ----
const CID = '00000000-0000-4000-8000-000000000001', ART = '00000000-0000-4000-8000-0000000000a1';
async function build(flats = null) {
  const png = await sharp({ create: { width: 340, height: 140, channels: 4, background: { r: 230, g: 20, b: 20, alpha: 1 } } }).png().toBuffer();
  const state = { flats, concept: { id: CID, name: 'White 11oz Mug', category: 'other', status: 'draft', spec: { style: 'mug', template: 'none', catalog: { id: 'x', name: 'White 11oz Mug', brand: '' }, branding: { logo: { mark: 'none' } } }, twist: '', product_id: null, price_cents: null, cost_cents: null, qty: null, updated_at: new Date(), client_id: null, plan_name: null, brand: '' } };
  const pool = { state, async query(sql, args = []) {
    if (/from lab_concepts c left join lab_plans/.test(sql)) return { rows: [state.concept] };
    if (/^insert into lab_flats/i.test(sql)) { state.flats = { style: args[1], params: JSON.parse(JSON.stringify(args[2])), placements: JSON.parse(args[3]), check_result: JSON.parse(JSON.stringify(args[4])), updated_at: new Date() }; return { rows: [], rowCount: 1 }; }
    if (/from lab_flats/.test(sql)) return { rows: state.flats ? [state.flats] : [] };
    if (/select png from lab_art/.test(sql)) return { rows: args[0] === ART ? [{ png }] : [] };
    if (/select 1 from lab_art/.test(sql)) return args[0] === ART ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  } };
  const app = Fastify(), api = registerLabFlatsRoutes(app, { pool, authenticate: async () => {}, adminOnly: async () => {}, log: { warn() {}, info() {} } });
  await app.ready(); return { app, api, state };
}

test('the routes: a graphic on the wrap saves and reads back, the spec sheet and the tech pack\'s pictures carry the wrap, and an older back graphic is moved', async () => {
  const { app, api, state } = await build(), p = defaultParams('mug'), w = wrapOf(GOODS.mug, p.m);
  const start = (await app.inject({ url: `/v1/lab/concepts/${CID}/flats` })).json(); assert.equal(start.flat.style, 'mug');
  const { placements: _p, check: _c, saved: _s, updatedAt: _u, ...params } = start.flat;
  const band = { id: 'band', name: 'Band', view: 'back', x: 0, y: w.top + w.ph / 2, w: 8, h: 3, art: ART, technique: 'sublimation', source: 'extra' };
  const put = await app.inject({ method: 'PUT', url: `/v1/lab/concepts/${CID}/flats`, payload: { ...params, placements: [band] } }); assert.equal(put.statusCode, 200, put.body);
  assert.equal(put.json().check.summary.fail, 0, JSON.stringify(put.json().check.findings)); assert.match(put.json().where.band, /^On the wrap, /);
  assert.equal(state.flats.placements[0].wrap, true, 'kept as a graphic on the wrap');
  const got = (await app.inject({ url: `/v1/lab/concepts/${CID}/flats` })).json();
  assert.deepEqual([got.flat.placements[0].view, got.flat.placements[0].x, got.flat.placements[0].y, got.flat.placements[0].w, got.flat.placements[0].h], ['back', 0, band.y, 8, 3], 'read back where it was put');
  assert.equal(got.sides.band, 'Wrap');
  // the spec sheet: the sides and the wrap side by side, the graphic listed as on the wrap
  const sheet = await app.inject({ url: `/v1/lab/concepts/${CID}/flats/sheet.svg` }); assert.equal(sheet.statusCode, 200);
  assert.ok(sheet.body.includes('data-view="front"') && sheet.body.includes('data-view="back"') && sheet.body.includes('Centre of the front'), 'both drawings, the wrap with its guides');
  assert.ok(sheet.body.includes('Wrap: On the wrap, '), 'listed as on the wrap'); assert.ok(sheet.body.includes('data-wrap-shown="1"'), 'and drawn on the sides');
  await sharp(Buffer.from(sheet.body)).png().toBuffer(); // it rasterises
  // the tech pack's pictures: the front, the back, and the wrap laid flat, each named as what it is
  const files = await api.files(CID); assert.deepEqual(files.map(f => f.name), ['Spec sheet · flats, placements and measurements', 'Technical flat · front', 'Technical flat · back', 'Technical flat · wrap, laid flat']);
  for (const f of files) assert.match(f.image, /^data:image\/png;base64,/);
  // an older mug: a graphic saved on its back, before there was a wrap
  const older = await build({ style: 'mug', params: { ...cleanFlat({ style: 'mug', template: 'none' }).params }, placements: [{ id: 'old', name: 'Old', view: 'back', x: .5, y: 1.875, w: 1, h: 1, technique: 'screen print', source: 'extra' }], check_result: { findings: {}, summary: { fail: 0, warn: 0 } }, updated_at: new Date() });
  const o = (await older.app.inject({ url: `/v1/lab/concepts/${CID}/flats` })).json();
  assert.deepEqual([o.flat.placements[0].view, o.flat.placements[0].x], ['front', backSideX(GOODS.mug, p.m) + .5]); assert.equal(o.sides.old, 'Back');
  const os = await older.app.inject({ url: `/v1/lab/concepts/${CID}/flats/sheet.svg` }); assert.ok(os.body.includes('Back: On the back, '), 'the sheet lists it on the back');
  await app.close(); await older.app.close();
});

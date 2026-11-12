// Do the engineered products go together? Every starting assembly, at its default, smallest and largest size and with the options the page
// sends, is measured off its built parts: nothing in another part's material, everything touching, the screws counted and through two
// parts, the size made equal to the size asked. And the checks are shown to catch each fault when one is made on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { archetype, engineer, cleanAssembly, cleanPart, dfm, fitOf, meshOf, inMaterial, isScrew, extentOf, ARCHES, TOUCH, CLASH } from '../src/lab-assembly.js';

const RANGE = { puck: [['w', 50, 300], ['h', 25, 200]], handheld: [['w', 25, 200], ['d', 50, 300], ['h', 8, 80]], desk: [['w', 60, 400], ['d', 30, 300], ['h', 40, 300]], cdplayer: [['w', 290, 500], ['d', 230, 450], ['h', 60, 160]], cassette: [['w', 120, 220], ['d', 26, 70], ['h', 75, 180]], speaker: [['w', 130, 400], ['d', 190, 450], ['h', 220, 600]], turntable: [['w', 380, 520], ['d', 320, 420], ['h', 110, 180]], headphones: [['w', 160, 220], ['d', 70, 110], ['h', 170, 240]], smartspeaker: [['w', 80, 200], ['h', 100, 260]], powerbank: [['d', 110, 200], ['w', 40, 100], ['h', 22, 40]], lamp: [['w', 90, 200], ['h', 200, 700]], tumbler: [['w', 50, 160], ['h', 80, 400]], case: [['w', 60, 800], ['d', 40, 600], ['h', 25, 400]], figure: [['h', 60, 600]], custom: [['w', 5, 2000], ['d', 5, 2000], ['h', 5, 2000]] };
const SPECS = Object.entries(RANGE).flatMap(([a, ds]) => [[a, a, {}, {}], [`${a} smallest`, a, Object.fromEntries(ds.map(([k, lo]) => [k, lo])), {}], [`${a} largest`, a, Object.fromEntries(ds.map(([k, , hi]) => [k, hi])), {}]]).concat([
  ['puck, Wi-Fi, six keys', 'puck', {}, { radio: 'wifi', buttons: 6 }], ['puck, no radio, no keys', 'puck', { w: 120, h: 40 }, { radio: 'none', buttons: 0 }],
  ['handheld, twelve keys, Wi-Fi', 'handheld', {}, { radio: 'wifi', buttons: 12 }], ['handheld, no keys', 'handheld', { w: 60, d: 100, h: 14 }, { buttons: 0 }], ['handheld as the journey starts it', 'handheld', { w: 50, d: 140, h: 20 }, { mah: 1500, radio: 'wifi', buttons: 6 }],
  ['desk, OLED, Bluetooth', 'desk', {}, { display: 'oled', radio: 'ble' }], ['desk 120 × 70 × 86', 'desk', { w: 120, d: 70, h: 86 }, {}], ['power bank, 20,000 mAh', 'powerbank', {}, { mah: 20000 }], ['CD player with Wi-Fi', 'cdplayer', {}, { radio: 'wifi' }],
  ['speaker, Wi-Fi', 'speaker', {}, { radio: 'wifi' }], ['tumbler 70 × 120', 'tumbler', { w: 70, h: 120 }, {}], ['case 300 × 200 × 100', 'case', { w: 300, d: 200, h: 100 }, {}],
  ['puck, a 5,000 mAh cell asked for', 'puck', {}, { mah: 5000 }], ['handheld, a 3,000 mAh cell asked for', 'handheld', {}, { mah: 3000 }], ['lamp, a 5,000 mAh cell asked for', 'lamp', {}, { mah: 5000 }]]);
// what a designer may ask for that cannot hold its parts: it still builds, and the checks must say so (never silently pass)
const CANNOT = {
  'handheld smallest': /Li-ion cell, \d+ mAh: does not fit inside Bottom housing/, 'desk smallest': /OLED display, 1\.3 in: does not fit inside Front housing/, 'cassette smallest': /Battery holder, 2 × AA \(replaceable\) and Cassette transport .* take the same space/,
  'case largest': /needs a press over 500 t/, 'custom largest': /needs a press over 500 t/,
  'puck, a 5,000 mAh cell asked for': /Li-ion cell, 5000 mAh goes [\d.]+ mm into the wall of bottom housing/, 'handheld, a 3,000 mAh cell asked for': /Li-ion cell, 3000 mAh: does not fit inside Bottom housing/, 'lamp, a 5,000 mAh cell asked for': /Li-ion cell, 5000 mAh goes [\d.]+ mm into the wall of weighted base/ };
const notOk = f => Object.values(f).flat().filter(c => c.level !== 'ok'); // every kind of finding the fit checks make
// a triangle list is a closed surface wound one way when every edge is used once in each direction
function closed(tri) { const id = new Map(), v = (x, y, z) => { const k = `${Math.round(x * 1e3)},${Math.round(y * 1e3)},${Math.round(z * 1e3)}`; if (!id.has(k)) id.set(k, id.size); return id.get(k); }, E = new Map(); let vol = 0;
  for (let i = 0; i < tri.length; i += 9) { const q = [0, 3, 6].map(o => v(tri[i + o], tri[i + o + 1], tri[i + o + 2])); if (q[0] === q[1] || q[1] === q[2] || q[0] === q[2]) continue;
    vol += (tri[i] * (tri[i + 4] * tri[i + 8] - tri[i + 5] * tri[i + 7]) - tri[i + 1] * (tri[i + 3] * tri[i + 8] - tri[i + 5] * tri[i + 6]) + tri[i + 2] * (tri[i + 3] * tri[i + 7] - tri[i + 4] * tri[i + 6])) / 6;
    for (let e = 0; e < 3; e++) { const a = q[e], b = q[(e + 1) % 3], k = `${a}>${b}`; E.set(k, (E.get(k) || 0) + 1); } }
  for (const [k, n] of E) { const [a, b] = k.split('>'); if (n !== 1 || E.get(`${b}>${a}`) !== 1) return false; } return vol > 0; }

test('every starting assembly goes together at its default, smallest and largest size and with each option: no clash, nothing floating, the screws counted and through two parts, the size made is the size asked', () => {
  let built = 0;
  for (const [label, a, dims, opts] of SPECS) {
    const s = archetype(a, dims, opts), E = engineer(s), f = fitOf(E.spec), bad = E.checks.filter(c => c.level === 'bad').map(c => c.text); built++;
    for (const k of ['clash', 'contact', 'fasteners', 'size']) assert.ok(f[k].every(c => E.checks.some(x => x.kind === k && x.text === c.text)), `${label}: dfm carries the ${k} findings`);
    if (label === 'powerbank smallest') { assert.deepEqual(bad, []); assert.deepEqual(notOk(f).map(c => c.kind), ['size'], 'three 18650 cells side by side are 62.4 mm wide: 40 mm was asked, and the size check says so'); assert.match(f.size[0].text, /22\.4 mm more wide/); continue; }
    if (CANNOT[label]) { assert.ok(bad.some(t => CANNOT[label].test(t)), `${label} cannot be built and must say so: ${bad.join(' | ') || 'no bad finding'}`); continue; }
    assert.deepEqual(bad, [], `${label}: nothing to fix`);
    assert.deepEqual(notOk(f).map(c => `${c.kind}: ${c.text}`), [], `${label}: the fit checks pass`);
    for (const k of ['clash', 'contact', 'size']) assert.ok(f[k].some(c => c.level === 'ok') || E.spec.parts.length < 2, `${label}: ${k} was measured`);
    // the same facts measured here, apart from the checks: the size, and the screws against what the parts ask
    const e = extentOf(E.spec.parts).size, want = [E.spec.dims.w, E.spec.dims.d, E.spec.dims.h]; for (let k = 0; k < 3; k++) assert.ok(Math.abs(e[k] - want[k]) <= .5, `${label}: ${'wdh'[k]} ${e[k]} against ${want[k]} asked`);
    for (const k of Object.keys(dims)) assert.ok(Math.abs(E.spec.dims[k] - dims[k]) <= .05, `${label}: built to the ${k} asked`);
    assert.ok(E.spec.parts.every(p => p.at[2] - p.size[2] / 2 > -.11), `${label}: nothing below the table`);
    const need = E.spec.parts.filter(p => p.fix === 'screws' && !isScrew(p)).reduce((t, p) => t + Math.max(1, p.fixQty) * p.qty, 0), have = E.spec.parts.filter(isScrew).reduce((t, p) => t + p.qty, 0); assert.equal(have, need, `${label}: screws on the parts list`);
    assert.ok(E.spec.parts.filter(isScrew).every(p => p.qty === 1 + (p.spots || []).length), `${label}: every screw has its place`);
    for (const p of E.spec.parts) assert.ok(closed(meshOf(p)), `${label}: ${p.name} is a closed solid, wound outward`);
  }
  assert.ok(built >= 60, `${built} assemblies built`);
});

test('the three defects: headphone parts keep their housings, the default handheld and puck have their keys, sockets are not soldered to boards they do not touch', () => {
  const h = archetype('headphones'); assert.ok(h.parts.some(p => p.id === 'cup-l') && h.parts.every(p => /^[a-z0-9-]+$/.test(p.id)));
  for (const id of ['baffle-l', 'baffle-r', 'pcb', 'battery']) assert.match(h.parts.find(p => p.id === id).parent || '', /^cup-[lr]$/, `${id} sits in its cup`);
  assert.ok(archetype('handheld').parts.some(p => p.id === 'keypad') && archetype('handheld').parts.filter(p => p.elec?.kind === 'button').length === 4, 'four keys by default');
  assert.equal(archetype('puck').parts.filter(p => /^key\d$/.test(p.id)).length, 3); assert.equal(archetype('handheld', {}, { buttons: 0 }).parts.filter(p => p.elec?.kind === 'button').length, 0, 'none when none are asked for');
  assert.match(archetype('powerbank').parts.find(p => p.elec?.kind === 'li18650').name, /3 × 18650/);
  for (const a of Object.keys(ARCHES)) { const s = archetype(a), by = Object.fromEntries(s.parts.map(p => [p.id, p]));
    for (const p of s.parts.filter(q => q.elec && by[q.parent]?.shape === 'pcb')) { const b = by[p.parent], gap = Math.max(...[0, 1, 2].map(k => Math.max(b.at[k] - b.size[k] / 2 - (p.at[k] + p.size[k] / 2), p.at[k] - p.size[k] / 2 - (b.at[k] + b.size[k] / 2)))); assert.ok(gap <= TOUCH, `${a}: ${p.name} is ${gap.toFixed(1)} mm from the board it is soldered to`); } }
});

test('the checks catch each fault made on purpose, each by the check that is about it, with its number', () => {
  const kinds = (s, k, level) => dfm(cleanAssembly(s)).filter(c => c.kind === k && c.level === level), edit = (a, fn, d = {}, o = {}) => { const s = JSON.parse(JSON.stringify(archetype(a, d, o))); fn(s, id => s.parts.find(p => p.id === id)); return s; };
  // lifted 5 mm: it floats
  let c = kinds(edit('tumbler', (s, P) => { P('slider').at[2] += 5; }), 'contact', 'warn'); assert.equal(c.length, 1); assert.equal(c[0].id, 'slider'); assert.match(c[0].text, /Sip slider touches nothing: the nearest part, lid, is 5 mm away/); assert.ok(Math.abs(c[0].gap - 5) <= .3);
  c = kinds(edit('headphones', (s, P) => { P('band').at[2] += 5; }), 'contact', 'warn'); assert.ok(c.some(x => x.parts.includes('band')), 'the band lifted off its sliders');
  // a group that hangs together but on nothing else
  c = kinds(edit('lamp', (s, P) => { for (const p of s.parts) if (p.at[2] > 60 && p.id !== 'stem') p.at[2] += 20; P('stem').size[2] -= 30; P('stem').at[2] -= 15; }), 'contact', 'warn'); assert.ok(c.length >= 1 && /touch nothing else/.test(c[0].text), c.map(x => x.text).join(' | '));
  // a cell grown past its round housing: its box still fits the housing's box, its corners do not fit the housing
  const big = edit('puck', (s, P) => { P('battery').size = [60, 88, 6]; }); assert.ok(!dfm(cleanAssembly(big)).some(x => /does not fit inside/.test(x.text)), 'the box check alone passes it');
  c = kinds(big, 'clash', 'bad'); assert.ok(c.some(x => x.id === 'battery' && x.with === 'bottom' && x.depth >= 1 && /goes [\d.]+ mm into the wall of bottom housing/.test(x.text)), c.map(x => x.text).join(' | '));
  // a board shifted through a wall, and a square-cornered board in a round-cornered housing
  c = kinds(edit('handheld', (s, P) => { P('pcb').at[0] += 4; }), 'clash', 'bad'); assert.ok(c.some(x => x.id === 'pcb' && x.depth >= .5), c.map(x => x.text).join(' | '));
  c = kinds(edit('handheld', (s, P) => { P('pcb').r = 0; }), 'clash', 'bad'); assert.ok(c.some(x => x.id === 'pcb' && x.depth > CLASH && x.depth < 2.5), 'a board corner in the housing\'s rounded corner');
  // a part through a wall that has no opening for it; a part with several pieces, one of them off its opening
  c = kinds(edit('turntable', (s, P) => { delete P('caps').through; }), 'clash', 'bad'); assert.ok(c.some(x => x.id === 'caps' && x.with === 'plinth'), 'button caps through a plinth with no opening for them');
  assert.ok(cleanAssembly(archetype('handheld')).parts.find(p => p.id === 'top').cuts.some(x => x.for === 'keypad'), 'the opening is cut for what passes through');
  c = kinds(edit('cdplayer', (s, P) => { P('caps').through = ['panel']; }), 'clash', 'bad'); assert.ok(c.some(x => x.id === 'caps'), 'five caps through the panel but not through the steel behind it');
  // the lid's old fit: 0.5 mm into the cup all round
  c = kinds(edit('tumbler', (s, P) => { P('body').size = [88, 88, P('body').size[2]]; P('lid').size = [91, 91, 18]; }), 'clash', 'bad'); assert.ok(c.some(x => [x.id, x.with].sort().join() === 'body,lid' && Math.abs(x.depth - .5) <= .15), c.map(x => `${x.depth}: ${x.text}`).join(' | '));
  // the screws dropped from the parts list; a screw moved off the parts it joins
  c = kinds(edit('handheld', s => { s.parts = s.parts.filter(p => p.id !== 'screws'); }), 'fasteners', 'warn'); assert.equal(c.length, 1); assert.equal(c[0].need, 4); assert.equal(c[0].have, 0); assert.match(c[0].text, /ask for 4 .* carries 0/);
  c = kinds(edit('puck', (s, P) => { P('screws').qty = 2; }), 'fasteners', 'warn'); assert.ok(c.some(x => x.need === 5 && x.have === 4));
  c = kinds(edit('desk', (s, P) => { P('screws').at[1] += 12; }), 'fasteners', 'warn'); assert.ok(c.length >= 1 && c.every(x => /a screw joins two parts/.test(x.text)), c.map(x => x.text).join(' | '));
  // a speaker driver has a flange: it lies on the baffle's face, the body goes through, and the screws go through the flange into the baffle.
  const spk = cleanAssembly(archetype('speaker')), wf = spk.parts.find(p => p.elec?.kind === 'woofer'), bf = spk.parts.find(p => p.id === 'baffle'), sd = spk.parts.find(p => p.id === 'screws-drivers');
  assert.deepEqual(wf.flange, { body: 106.6, t: 4, end: '-' }); assert.ok(Math.abs(bf.cuts.find(x => x.for === wf.id).size[0] - 107) < .01, 'the opening is the body\'s, not the flange\'s');
  const mid = [sd.at[0], 0, sd.at[2]]; assert.equal(inMaterial(wf, [mid[0], wf.at[1] - wf.size[1] / 2 + 2, mid[2]]), true, 'the screw is in the flange'); assert.equal(inMaterial(wf, [mid[0], wf.at[1], mid[2]]), false, 'and beside the body behind it');
  assert.equal(inMaterial(bf, [mid[0], bf.at[1], mid[2]]), true, 'and in the baffle'); assert.equal(kinds(spk, 'fasteners', 'warn').length, 0);
  const bare = cleanAssembly(edit('speaker', s => { for (const q of s.parts) delete q.flange; })).parts.find(q => q.id === 'baffle'); assert.equal(inMaterial(bare, [mid[0], bare.at[1], mid[2]]), false, 'with no flange the opening is as wide as the driver, and the same screw would be in the opening, not in the baffle');
  // a part hung outside the size asked
  c = kinds(edit('desk', (s, P) => { P('feet').at[2] -= 3; }), 'size', 'warn'); assert.equal(c.length, 1); assert.match(c[0].text, /3 mm more tall/); assert.deepEqual(c[0].asked, [140, 70, 86]);
  // a part with no parent and a part with several pieces are measured like any other
  c = kinds(edit('speaker', (s, P) => { P('grille').at[1] -= 3; }), 'contact', 'warn'); assert.ok(c.some(x => x.id === 'grille' && Math.abs(x.gap - 3) <= .4), 'the grille 3 mm off the baffle');
  c = kinds(edit('desk', (s, P) => { P('feet').at[2] += 2; delete s.dims; }), 'clash', 'warn'); assert.ok(dfm(cleanAssembly(edit('turntable', (s, P) => { P('hinge').at[2] -= 4; }))).some(x => x.kind === 'clash' && x.level === 'bad' && x.id === 'hinge'), 'a hinge (two pieces) sunk 4 mm into the plinth');
});

test('openings and bosses are part of the solid: the material is gone where a part passes, there where a boss stands, and the mesh stays closed', () => {
  const s = cleanAssembly(archetype('speaker')), baffle = s.parts.find(p => p.id === 'baffle'), woofer = s.parts.find(p => p.elec?.kind === 'woofer');
  assert.deepEqual(baffle.cuts.map(c => c.for).sort(), s.parts.filter(p => (p.through || []).includes('baffle')).map(p => p.id).sort()); assert.ok(baffle.cuts.every(c => c.round && c.axis === 'y'));
  assert.equal(inMaterial(baffle, [woofer.at[0], baffle.at[1], woofer.at[2]]), false, 'the baffle is open where the woofer passes'); assert.equal(inMaterial(baffle, [baffle.size[0] / 2 - 4, baffle.at[1], baffle.at[2]]), true);
  const moved = JSON.parse(JSON.stringify(s)); moved.parts.find(p => p.id === woofer.id).at[2] += 12; const b2 = cleanAssembly(moved).parts.find(p => p.id === 'baffle');
  assert.ok(Math.abs(b2.cuts.find(c => c.for === woofer.id).at[2] - baffle.cuts.find(c => c.for === woofer.id).at[2] - 12) < .01, 'an opening follows the part it is for');
  const h = cleanAssembly(archetype('handheld')), bot = h.parts.find(p => p.id === 'bottom'), scr = h.parts.find(p => p.id === 'screws'), pcb = h.parts.find(p => p.id === 'pcb');
  assert.equal(bot.bosses.length, 4); assert.equal(pcb.cuts.filter(c => c.for === 'screws').length, 4, 'a hole in the board for each screw'); assert.equal(scr.qty, 4);
  assert.equal(inMaterial(bot, [scr.at[0] + 1.6, scr.at[1], pcb.at[2] - 2]), true, 'a boss stands under the board at the screw'); assert.equal(inMaterial(bot, [0, 0, pcb.at[2] - 2]), false);
  const usb = h.parts.find(p => p.elec?.kind === 'usbc'); assert.ok(bot.cuts.some(c => c.for === usb.id), 'a socket gets its opening without being told');
  const part = cleanPart({ shape: 'shell', size: [60, 40, 20], at: [0, 0, 10], wall: 2, r: 5, cuts: [{ at: [10, 0, -9], size: [8, 6, 2], axis: 'z' }, { at: [-12, 5, -9], size: [6, 6, 2], axis: 'z', round: true }, { at: [5, 19, 6], size: [10, 2, 10], axis: 'y' }], bosses: [{ at: [20, 10, 5], d: 2 }] });
  assert.ok(closed(meshOf(part)), 'two floor openings, a notch to the rim and a boss: one closed solid');
  const old = cleanAssembly({ arch: 'puck', parts: [{ id: 'a', shape: 'cup', size: [40, 40, 20], at: [0, 0, 10] }, { id: 'b', shape: 'box', size: [10, 10, 5], at: [0, 0, 4.5], parent: 'a' }] }); assert.equal(old.dims, undefined); assert.ok(!dfm(old).some(c => c.kind === 'size'), 'an assembly saved before sizes were kept has no size finding');
  assert.ok(engineer(old).checks.length > 0 && closed(meshOf(old.parts[0])));
});

test('the files: a made part\'s STL is its one closed solid, and its STEP carries the same openings and bosses as exact faces', async () => {
  const { stepOf } = await import('../src/lab-step.js'), { stlOf } = await import('../src/lab-assembly.js');
  const tris = u8 => { const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = dv.getUint32(80, true), t = new Float32Array(n * 9); for (let i = 0, o = 84; i < n; i++, o += 50) for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true); return t; };
  // every edge of a STEP solid is used once in each direction by its faces
  const shut = txt => { const ent = new Map(); for (const m of txt.matchAll(/^#(\d+)=(.*);$/gm)) ent.set('#' + m[1], m[2]); let n = 0;
    for (const v of ent.values()) { if (!v.startsWith('MANIFOLD_SOLID_BREP')) continue; n++; const use = new Map();
      for (const f of ent.get(/,(#\d+)\)$/.exec(v)[1]).match(/#\d+/g)) for (const b of ent.get(f).match(/^ADVANCED_FACE\('',\(([^)]*)\)/)[1].split(',')) for (const oe of ent.get(ent.get(b).match(/#\d+/)[0]).match(/#\d+/g)) { const m = /ORIENTED_EDGE\('',\*,\*,(#\d+),\.(T|F)\.\)/.exec(ent.get(oe)), u = use.get(m[1]) || { T: 0, F: 0 }; u[m[2]]++; use.set(m[1], u); }
      if ([...use.values()].some(u => u.T !== 1 || u.F !== 1)) return false; } return n > 0; };
  for (const a of Object.keys(ARCHES)) { const s = cleanAssembly(archetype(a)); assert.ok(shut(stepOf(s)), `${a}: every STEP solid is closed`);
    for (const p of s.parts.filter(q => q.process !== 'bought in' && q.shape !== 'pcb')) assert.ok(closed(tris(stlOf(s, { only: p.id }))), `${a}: ${p.name}'s STL is one closed solid`); }
  const sp = cleanAssembly(archetype('speaker')), plain = { ...sp, parts: sp.parts.map(p => ({ ...p, through: undefined })) }, count = (t, re) => (t.match(re) || []).length;
  const baffle = stepOf(sp, { only: 'baffle' }), slab = stepOf(plain, { only: 'baffle' });
  assert.equal(count(baffle, /CYLINDRICAL_SURFACE\(/g) - count(slab, /CYLINDRICAL_SURFACE\(/g), 4, 'the woofer\'s and the tweeter\'s openings, two half-cylinders each'); assert.equal(count(baffle, /FACE_BOUND\(/g), 4, 'two openings in each face of the baffle');
  const hh = cleanAssembly(archetype('handheld')), bottom = stepOf(hh, { only: 'bottom' }); assert.ok(shut(bottom)); assert.ok(count(bottom, /CYLINDRICAL_SURFACE\(/g) >= 4 + 4 * 4, 'four bosses, each bored through the floor for its screw');
  // a window in a side wall (the USB-C port's notch in the end of each shell) is in the STEP and in the 3D view, as it is in the STL
  const bot = hh.parts.find(q => q.id === 'bottom'), usb = hh.parts.find(q => q.elec?.kind === 'usbc'), win = bot.cuts.find(c => c.for === usb.id); assert.equal(win.axis, 'y');
  assert.equal(inMaterial(bot, [usb.at[0], bot.at[1] - bot.size[1] / 2 + bot.wall / 2, usb.at[2] - 1]), false, 'the end wall is open where the port is'); assert.equal(inMaterial(bot, [usb.at[0] + 12, bot.at[1] - bot.size[1] / 2 + bot.wall / 2, usb.at[2] - 1]), true);
  const noPort = stepOf({ ...hh, parts: hh.parts.filter(q => q.id !== usb.id) }, { only: 'bottom' }); assert.ok(shut(noPort));
  assert.ok(count(bottom, /ADVANCED_FACE\(/g) >= count(noPort, /ADVANCED_FACE\(/g) + 3, 'the notch adds its two sides and its sill, and splits the walls at its height');
  const { realMeshes } = await import('../src/lab-parts-mesh.js'), drawn = realMeshes(hh);
  for (const id of ['bottom', 'top']) { assert.equal(drawn[id].length, 1, `${id}: drawn from its solid`); assert.ok(closed(drawn[id][0].tri), `${id}: the drawn housing is closed, its window cut`); }
  let windows = 0, written = 0; for (const a of Object.keys(ARCHES)) { const s = cleanAssembly(archetype(a)); for (const q of s.parts) { const side = (q.cuts || []).filter(c => c.axis !== q.axis).length; if (!side) continue; windows += side;
    const mine = stepOf(s, { only: q.id }), alone = stepOf(cleanAssembly({ ...s, parts: [{ ...q, cuts: undefined }] })); assert.ok(shut(mine), `${a}: ${q.name}`); if (count(mine, /ADVANCED_FACE\(/g) > count(alone, /ADVANCED_FACE\(/g)) written++; } } // alone: the part with nothing passing through it
  assert.ok(windows >= 60 && written >= 15, `${windows} windows in side walls over the starting assemblies, in ${written} housings' STEP`);
});

test('the bike light the journeys design from a concept really is clear: nothing floating, its screws through the board into bosses, its lens and key through their walls', async () => {
  const { readFileSync } = await import('node:fs'), { composeAssembly } = await import('../src/lab-assembly-compose.js');
  const answers = JSON.parse(readFileSync(new URL('../scripts/journeys/fixtures/assembly-compose.json', import.meta.url), 'utf8')); let i = 0;
  const r = await composeAssembly({ concept: { name: 'Bike front light', category: 'electronics' }, ask: async () => answers[i++] });
  assert.equal(r.status, 'clear'); assert.equal(r.spec.parts.length, 14); assert.deepEqual(notOk(fitOf(r.spec)).map(c => `${c.kind}: ${c.text}`), [], 'no clash, contact, fastener or size finding at any level');
  const by = Object.fromEntries(r.spec.parts.map(p => [p.id, p])); assert.equal(by.body.bosses.length, 2); assert.equal(by.screws.qty, 2); assert.ok(by.top.cuts.some(c => c.for === 'key') && by.body.cuts.some(c => c.for === 'lens') && by.top.cuts.some(c => c.for === 'lens'));
  // as it was drawn before (a cell 1.1 mm off the floor, an LED module 0.7 mm from the wall and 5.5 mm from all else, four screws in mid-air), the contact and fastener checks say so
  const old = JSON.parse(JSON.stringify(answers[1])), P = id => old.parts.find(p => p.id === id); P('battery').at = [0, -16, 6.4]; P('led').at = [0, 41, 17]; Object.assign(P('screws'), { at: [12, 30, 26], qty: 4, spots: undefined, through: undefined, parent: undefined }); delete P('body').bosses;
  const f = fitOf(cleanAssembly({ arch: 'custom', kind: 'electronics', parts: old.parts })), ids = f.contact.filter(c => c.level === 'warn').flatMap(c => c.parts);
  assert.ok(['battery', 'led', 'screws', 'pcb'].every(id => ids.includes(id)), `floating: ${ids.join(', ')}`); assert.ok(f.fasteners.some(c => c.level === 'warn' && c.need === 2 && c.have === 4));
});

test('the Engineering page lets a person set what a part passes through, where its other pieces are and a housing\'s bosses', async () => {
  const { readFileSync } = await import('node:fs'), A = await import('../src/lab-assembly.js'), html = readFileSync(new URL('../src/lab-engineer.html', import.meta.url), 'utf8');
  // the editor's markup, rendered here with the page's own function and the engine's lists
  const SPEC = archetype('handheld'), esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`), opt = (l, v) => l.map(x => (Array.isArray(x) ? x : [x, x])).map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${t}</option>`).join('');
  const D = { options: { processes: Object.keys(A.PROCESSES), finishes: A.FINISHES, fixes: Object.keys(A.FIXES) } }, SHAPES = A.SHAPES, RESINS = A.RESINS; void SPEC; void esc; void opt; void D; void SHAPES; void RESINS;
  const editor = eval(`(${html.slice(html.indexOf('function editor(p){'), html.indexOf('function wireEditor(){')).replace('function editor(p){', 'function(p){')})`), P = id => SPEC.parts.find(p => p.id === id), n = (h, re) => (h.match(re) || []).length;
  const housing = editor(P('bottom')), screws = editor(P('screws')), keypad = editor(P('keypad'));
  assert.equal(n(housing, /data-boss-del=/g), 4, 'a row for each of the housing\'s four bosses'); assert.equal(n(housing, /data-k="boss\d_[012]"/g), 12); assert.equal(n(housing, /data-k="bossd\d"/g), 4); assert.match(housing, /data-act="boss"/); assert.match(housing, /Openings cut in this part: \d+ \(for /);
  assert.equal(n(screws, /data-k="spot\d_[012]"/g), 9, 'three other screws, each with its place'); assert.equal(n(screws, /data-k="thru[012]"/g), 3); assert.ok(/<option value="bottom" selected>/.test(screws) && /<option value="pcb" selected>/.test(screws), 'what it passes through is chosen');
  assert.match(keypad, /<option value="top" selected>/); assert.ok(!/data-k="spot/.test(keypad) && !/data-act="boss"/.test(keypad), 'no pieces or bosses for a single keypad');
  for (const k of ['thru[012]', 'spot\\d+_[012]', 'boss\\d+_[012]', 'bossd\\d+']) assert.ok(html.includes(`/^${k}$/.test(k)`), `the page sets ${k}`);
  assert.ok(html.includes('p.cuts,p.bosses,p.flange'), 'the 3D part is rebuilt when its openings or bosses change');
  // every piece has its fields, however many there are (the list scrolls)
  const many = editor(cleanPart({ id: 'pins', name: 'Pin', shape: 'cyl', size: [2, 2, 8], qty: 14, spots: Array.from({ length: 13 }, (_, i) => [i * 5 + 5, 0, 0]) }));
  assert.equal(n(many, /data-k="spot\d+_[012]"/g), 39, 'thirteen other pieces, three fields each'); assert.match(many, /data-k="spot12_0" value="65"/); assert.match(many, /class="pieces"/); assert.ok(!/keep the places they have/.test(many)); assert.match(html, /\.edit \.pieces\{[^}]*overflow:auto/);
  // a round part's flange: off, or at one end with the body's width behind it
  const spk = archetype('speaker'), woofer = editor.call(null, spk.parts.find(q => q.elec?.kind === 'woofer')), knob = editor(spk.parts.find(q => q.id === 'knob'));
  assert.match(woofer, /data-k="flend"[^]*<option value="-" selected>/); assert.match(woofer, /data-k="flbody" value="106.6"/); assert.match(woofer, /data-k="flt" value="4"/);
  assert.ok(/data-k="flend"/.test(knob) && /<option value="" selected>No flange/.test(knob) && !/data-k="flbody"/.test(knob), 'a plain round part: the flange is off, with no sizes to set'); assert.ok(!/data-k="flend"/.test(housing), 'a housing has no flange');
  assert.ok(html.includes("k==='flend'") && html.includes("k==='flbody'||k==='flt'"), 'the page sets the flange');
});

test('an assembly saved before parts said what they pass through: a part plainly through a wall gets its opening when it is opened, the saved parts are not rewritten, and a real misfit still shows', () => {
  const strip = s => { const c = JSON.parse(JSON.stringify(s)); delete c.v; return c; }, bads = s => dfm(cleanAssembly(s)).filter(c => c.level === 'bad').map(c => `${c.id}: ${c.text}`);
  // as it would have been saved: no `v`, and the caps do not say they go through the plinth
  const saved = strip(archetype('turntable')); delete saved.parts.find(p => p.id === 'caps').through; const opened = cleanAssembly(saved);
  assert.equal(opened.v, undefined); assert.equal(opened.parts.find(p => p.id === 'caps').through, undefined, 'nothing is written into the saved part');
  assert.equal(opened.parts.find(p => p.id === 'plinth').cuts.filter(c => c.for === 'caps').length, 3, 'an opening for each of the three caps'); assert.deepEqual(bads(saved), []);
  assert.ok(bads({ ...saved, v: 2 }).some(t => /^caps: Button caps goes [\d.]+ mm into/.test(t)), 'made today, the same part has to say it passes through');
  // the old cassette player's keys, a hollow cap through the top of both halves
  const tape = strip(archetype('cassette')); delete tape.parts.find(p => p.id === 'keys').through; assert.deepEqual(bads(tape), []); assert.ok(cleanAssembly(tape).parts.find(p => p.id === 'back').cuts.some(c => c.for === 'keys'));
  // what only digs into a wall, what sits inside its housing, and a lid a size too small are not read as passing through
  const sunk = strip(archetype('turntable')); sunk.parts.find(p => p.id === 'hinge').at[2] -= 4; assert.ok(bads(sunk).some(t => /^hinge: /.test(t)), 'a hinge sunk 4 mm into the plinth');
  const cell = strip(archetype('puck')); cell.parts.find(p => p.id === 'battery').size = [60, 88, 6]; assert.ok(bads(cell).some(t => /^battery: .* into the wall of bottom housing/.test(t)), 'a cell through its own housing\'s wall');
  const lid = strip(archetype('tumbler')); lid.parts.find(p => p.id === 'body').size[0] = lid.parts.find(p => p.id === 'body').size[1] = 88; lid.parts.find(p => p.id === 'lid').size = [91, 91, 18]; assert.ok(bads(lid).some(t => /0\.5 mm into the material/.test(t)), 'the lid 0.5 mm into the cup');
  for (const a of Object.keys(ARCHES)) assert.deepEqual(bads(strip(archetype(a))), [], `${a}: read under the old rules, today's assembly is still clean`);
  assert.equal(archetype('puck').v, 2); assert.equal(cleanAssembly({ ...archetype('puck'), v: 7 }).v, 2);
});

test('lip and groove: where two housing halves close, the lip of one stands in the groove of the other, in the solids and measured by the check', async () => {
  const { stepOf } = await import('../src/lab-step.js'), { stlOf, featuresOf } = await import('../src/lab-assembly.js');
  const tris = u8 => { const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), n = dv.getUint32(80, true), t = new Float32Array(n * 9); for (let i = 0, o = 84; i < n; i++, o += 50) for (let k = 0; k < 9; k++) t[i * 9 + k] = dv.getFloat32(o + 12 + k * 4, true); return t; };
  const lipOf = s => fitOf(cleanAssembly(s)).lip, edit = (a, fn) => { const s = JSON.parse(JSON.stringify(archetype(a))); fn(id => s.parts.find(p => p.id === id), s); return s; };
  // the six starting assemblies whose halves close rim to rim: the half put down first carries the lip, the other the groove
  const pairs = { handheld: ['bottom', 'top'], desk: ['back', 'front'], cassette: ['back', 'front'], smartspeaker: ['body', 'grille'], powerbank: ['bottom', 'top'], case: ['base', 'lid'] };
  for (const [a, [ia, ib]] of Object.entries(pairs)) { const s = archetype(a), A = s.parts.find(p => p.id === ia), B = s.parts.find(p => p.id === ib), f = fitOf(s).lip;
    assert.equal(A.lip.into, ib); assert.equal(A.adds.filter(x => x.kind === 'lip').length, 1, `${a}: the lip is a body on ${ia}`); assert.equal(B.groove.for, ia, `${a}: ${ib} has the groove for it`);
    assert.equal(f.length, 1); assert.equal(f[0].level, 'ok', `${a}: ${f[0].text}`); assert.equal(f[0].kind, 'lip'); assert.equal(f[0].with, ib);
    assert.equal(f[0].engaged, 1.2, `${a}: the lip stands 1.2 mm into the groove`); assert.ok(f[0].clear[0] >= .08 && f[0].clear[1] <= .2, `${a}: 0.1 mm clear at the side, measured ${f[0].clear}`); assert.ok(Math.abs(f[0].top - .3) <= .03, `${a}: 0.3 mm at its top`);
    assert.ok(f[0].skin >= .6 && Math.abs(f[0].skin + A.adds[0].wall + .1 - A.wall) < .011, `${a}: lip, clearance and the wall left outside it make the wall`);
    assert.ok(dfm(s).some(c => c.kind === 'lip' && c.text === f[0].text), `${a}: dfm carries the finding`); }
  assert.deepEqual(Object.keys(ARCHES).filter(a => archetype(a).parts.some(p => p.lip)).sort(), Object.keys(pairs).sort(), 'no other starting assembly has two halves that meet rim to rim');
  // in the material: just above the bottom's rim the inner part of the wall is the bottom's lip and not the top's; the top keeps its skin outside
  const hh = archetype('handheld'), bot = hh.parts.find(p => p.id === 'bottom'), top = hh.parts.find(p => p.id === 'top'), x = bot.size[0] / 2, z = bot.at[2] + bot.size[2] / 2 + .6;
  assert.equal(inMaterial(bot, [x - 1.3, 20, z]), true, 'the lip, in the inner half of the wall'); assert.equal(inMaterial(top, [x - 1.3, 20, z]), false, 'the groove, where the lip is');
  assert.equal(inMaterial(top, [x - .4, 20, z]), true, 'the skin outside the groove'); assert.equal(inMaterial(bot, [x - .4, 20, z]), false); assert.equal(inMaterial(top, [x - 1.3, 20, z + 1.5]), true, 'the whole wall again above the groove');
  assert.equal(inMaterial(bot, [x - 1.3, 20, z + .8]), false, 'the lip is 1.2 mm tall');
  // where the USB-C port's notch reaches the rim, the groove stops with the wall, and the opening runs on through the groove's depth
  const usb = hh.parts.find(p => p.elec?.kind === 'usbc'), F = featuresOf(top), notch = F.sides.find(m => m.ub >= F.u1 - 1e-9); assert.ok(notch && notch.ua <= F.groove.g - .3 + 1e-9, 'a window that comes into the groove is opened through it');
  assert.equal(inMaterial(top, [usb.at[0], top.at[1] - top.size[1] / 2 + .4, z]), false, 'no skin left across the port');
  // the files: both halves are closed solids in the STL and the STEP, the groove as exact faces, the lip a body of its own on its half
  for (const [a, [ia, ib]] of Object.entries(pairs)) { const s = cleanAssembly(archetype(a));
    for (const id of [ia, ib]) assert.ok(closed(tris(stlOf(s, { only: id }))), `${a}: ${id}'s STL is closed`);
    const plain = cleanAssembly({ ...s, parts: s.parts.map(p => ({ ...p, lip: undefined })) }), count = (t, re) => (t.match(re) || []).length, mine = stepOf(s, { only: ib }), bare = stepOf(plain, { only: ib });
    assert.ok(count(mine, /ADVANCED_FACE\(/g) >= count(bare, /ADVANCED_FACE\(/g) + 2, `${a}: the groove adds its wall and its floor to ${ib}'s STEP`);
    assert.equal(count(stepOf(s, { only: ia }), /MANIFOLD_SOLID_BREP\(/g), 1 + s.parts.find(p => p.id === ia).adds.length, `${a}: ${ia}, its lip, and any catch it carries for the other half's hooks`); assert.match(stepOf(s, { only: ia }), /MANIFOLD_SOLID_BREP\('[^']*: lip'/);
    const vol = t => { let v = 0; for (let i = 0; i < t.length; i += 9) v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7]) - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6]) + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6; return v; };
    assert.ok(vol(tris(stlOf(s, { only: ib }))) < vol(tris(stlOf(plain, { only: ib }))) - 1, `${a}: the groove takes material out of ${ib}`); assert.ok(vol(tris(stlOf(s, { only: ia }))) > vol(tris(stlOf(plain, { only: ia }))) + 1, `${a}: the lip adds material to ${ia}`); }
  // worked out each time, so it follows the parts, and reading an assembly twice changes nothing
  const once = cleanAssembly(archetype('case')); assert.deepEqual(cleanAssembly(once), once);
  const wide = cleanAssembly(edit('case', P => { P('base').size[0] = P('lid').size[0] = 260; })); assert.equal(wide.parts.find(p => p.id === 'base').adds[0].size[0], 260 - 2 * (2.5 - 1.1)); assert.equal(fitOf(wide).lip[0].level, 'ok');
  // broken on purpose: each way a lip can fail to locate is said, with its number
  let c = lipOf(edit('handheld', P => { P('top').at[2] += 2; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /their rims are 2 mm apart/);
  c = lipOf(edit('handheld', P => { P('top').at[0] += .4; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /(0\.9|1) mm clear of the groove at its loosest/); assert.match(c[0].text, /step 0\.4 mm at the seam/); assert.ok(c[0].clear[1] >= .85);
  c = lipOf(edit('handheld', P => { P('top').at[0] += .7; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /top housing has no wall to take it \(0\.1 mm would be left outside the lip\)/);
  c = lipOf(edit('handheld', P => { P('top').r = 16; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /hard against the wall of its groove/, 'a mate with rounder corners: the lip\'s corners are in its wall');
  c = lipOf(edit('handheld', P => { P('top').size[1] -= 30; P('top').at[1] += 15; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /has no wall to take it|of its way round/);
  c = lipOf(edit('handheld', P => { P('bottom').lip = { into: 'top', h: .6 }; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /stands only 0\.6 mm into the groove/);
  c = lipOf(edit('handheld', P => { P('bottom').lip = { into: 'top', t: 1 }; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /only 0\.5 mm of top housing's wall is left outside it/);
  c = lipOf(edit('handheld', P => { P('bottom').lip = { into: 'pcb' }; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /main board is not a housing half/);
  c = lipOf(edit('puck', P => { P('bottom').lip = { into: 'top' }; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /their rims are 2\.9 mm apart/, 'the light ring lies between the puck\'s halves');
  assert.equal(cleanAssembly(edit('handheld', P => { P('bottom').lip = { into: 'gone' }; })).parts.find(p => p.id === 'bottom').lip, undefined, 'a lip for a part that is not there is dropped');
  // a groove too narrow for its lip is measured by the same point test as everything else
  const tight = cleanAssembly(archetype('handheld')); tight.parts.find(p => p.id === 'top').groove.t = .3; // (set by hand: cleanAssembly would work it out again)
  assert.equal(inMaterial(tight.parts.find(p => p.id === 'top'), [x - 1.1, 20, z]), true, 'a groove 0.3 mm wide leaves the wall where the lip is');
  c = fitOf(tight).lip; assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /hard against the wall of its groove/); assert.equal(c[0].clear[0], 0);
});

test('snap hooks: a cover that snaps on has its hooks and their catches as bodies, and the check measures the catch, the bend and the room to bend', async () => {
  const { stepOf } = await import('../src/lab-step.js'), { SNAP_STRAIN } = await import('../src/lab-assembly.js');
  const snapOf = s => fitOf(cleanAssembly(s)).snap, edit = (a, fn) => { const s = JSON.parse(JSON.stringify(archetype(a))); fn(id => s.parts.find(p => p.id === id), s); return s; };
  // where there is room between the wall and what is inside, the starting assembly has them; where there is none, it has none and says nothing
  const have = { desk: ['front', 'back', 4], cassette: ['front', 'back', 2], smartspeaker: ['grille', 'body', 4] };
  for (const [a, [ia, ib, n]] of Object.entries(have)) { const s = archetype(a), A = s.parts.find(p => p.id === ia), B = s.parts.find(p => p.id === ib), f = fitOf(s).snap;
    assert.equal(A.fix, 'snap'); assert.equal(A.snaps.into, ib); assert.equal(A.snaps.hooks.length, n, `${a}: ${n} hooks`);
    assert.equal(A.adds.filter(x => x.kind === 'hook').length, n * 3, `${a}: each hook is a foot on the wall, a beam and a head`); assert.equal(B.adds.filter(x => x.kind === 'catch' && x.for === ia).length, n, `${a}: a catch for each on ${ib}`);
    assert.equal(f.length, 1); assert.equal(f[0].level, 'ok', f[0].text); assert.equal(f[0].kind, 'snap'); assert.equal(f[0].hooks, n); assert.equal(f[0].engaged, .8);
    const S = A.snaps, strain = 150 * S.t * .8 / (S.len - 1.5) ** 2; assert.ok(Math.abs(f[0].strain - strain) < .01 && strain < SNAP_STRAIN[A.resin], `${a}: bends ${f[0].strain}%, ${A.resin} takes ${SNAP_STRAIN[A.resin]}%`);
    assert.ok(dfm(s).some(c => c.kind === 'snap' && c.text === f[0].text)); assert.equal(dfm(s).filter(c => c.level === 'bad').length, 0);
    // in the material: the head is the cover's, the catch behind it is the other half's, and the two overlap by what the hook catches
    const head = A.adds.filter(x => x.kind === 'hook')[1], ledge = B.adds.find(x => x.kind === 'catch'), hc = head.at.map((v, k) => v + A.at[k]), lc = ledge.at.map((v, k) => v + B.at[k]);
    assert.equal(inMaterial(A, hc), true); assert.equal(inMaterial(B, hc), false); assert.equal(inMaterial(B, lc), true); assert.equal(inMaterial(A, lc), false);
    const o = 'xyz'.indexOf(S.hooks[0].out[1]), al = 'xyz'.indexOf(S.hooks[0].along[1]), sg = S.hooks[0].out[0] === '-' ? -1 : 1;
    const over = Math.min(sg * hc[o] + head.size[o] / 2, sg * lc[o] + ledge.size[o] / 2) - Math.max(sg * hc[o] - head.size[o] / 2, sg * lc[o] - ledge.size[o] / 2); assert.ok(Math.abs(over - .8) < .02, `${a}: head and catch overlap ${over} mm`);
    assert.ok(Math.abs(Math.abs(hc[al] - lc[al]) - (head.size[al] + ledge.size[al]) / 2 - .1) < .02, `${a}: the catch is 0.1 mm behind the head`);
    assert.match(stepOf(s, { only: ia }), /MANIFOLD_SOLID_BREP\('[^']*: hook'/); assert.match(stepOf(s, { only: ib }), /MANIFOLD_SOLID_BREP\('[^']*: catch'/); }
  for (const a of ['puck', 'handheld', 'powerbank']) { const s = archetype(a); assert.equal(s.parts.some(p => p.snaps), false, `${a}: the board, the light ring or the cells are within 1.5 mm of the wall, so no hook is drawn`); assert.deepEqual(fitOf(s).snap, []); }
  assert.ok(archetype('puck', { w: 300, h: 200 }).parts.find(p => p.id === 'top').snaps, 'a puck large enough has them'); assert.ok(archetype('powerbank', { w: 120, d: 220, h: 40 }).parts.find(p => p.id === 'top').snaps);
  const once = cleanAssembly(archetype('desk')); assert.deepEqual(cleanAssembly(once), once, 'reading it twice changes nothing');
  // broken on purpose
  let c = snapOf(edit('desk', P => { P('front').snaps.y = 2; })); assert.equal(c.length, 4); assert.ok(c.every(x => x.level === 'bad' && /its head stands 2 mm out and the wall of back housing is 1\.2 mm away/.test(x.text)), c[0].text);
  const shorter = (A, len) => { const by = A.snaps.len - len; A.snaps.len = len; A.snaps.hooks.forEach(h => { h.at['xyz'.indexOf(h.along[1])] += (h.along[0] === '-' ? -1 : 1) * by; }); }; // a shorter beam, its head where it was
  c = snapOf(edit('desk', P => { shorter(P('front'), 5); P('front').snaps.hooks.forEach(h => { h.at['xyz'.indexOf(h.along[1])] -= (h.along[0] === '-' ? -1 : 1) * 5; }); })); assert.ok(c.every(x => x.level === 'bad' && /it bends 9\.8% as it is pushed home and PC\/ABS takes about 2\.5%/.test(x.text)), c[0].text); assert.match(c[0].text, /Lengthen it to 8\.4 mm/);
  c = snapOf(edit('cassette', P => { shorter(P('front'), 9); })); assert.ok(c.every(x => x.level === 'warn' && /it bends 2\.13% as it is pushed home and ABS takes about 2%/.test(x.text)), c[0].text);
  c = snapOf(edit('desk', P => { P('front').snaps.y = .5; })); assert.ok(c.every(x => x.level === 'warn' && /catches only 0\.3 mm/.test(x.text)), c[0].text);
  c = snapOf(edit('desk', P => { P('front').snaps.hooks[0].at['xyz'.indexOf(P('front').snaps.hooks[0].out[1])] *= .8; })); assert.equal(c.filter(x => x.level === 'bad').length, 1); assert.match(c[0].text, /snap hook 1 of 4: it is not joined to front housing: there is no wall within 4 mm of its root/);
  c = snapOf(edit('desk', (P, s) => { const A = P('front'), h = A.snaps.hooks[0], o = 'xyz'.indexOf(h.out[1]), al = 'xyz'.indexOf(h.along[1]), at = h.at.map((v, k) => v + A.at[k]); at[o] -= (h.out[0] === '-' ? -1 : 1) * 2.2; at[al] += (h.along[0] === '-' ? -1 : 1) * 11; s.parts.push({ id: 'rib', name: 'Rib', shape: 'box', size: [3, 3, 3], at, r: 0 }); }));
  assert.equal(c.filter(x => x.level === 'bad').length, 1); assert.match(c[0].text, /it cannot bend: rib is 0\.[0-9]+ mm behind it and it has to move 0\.[0-9]+ mm there to pass its catch/); assert.equal(c[0].behind, 'rib');
  c = snapOf(edit('desk', P => { P('front').resin = 'zinc (Zamak 3)'; P('front').process = 'die casting'; })); assert.ok(c.some(x => x.level === 'warn' && /zinc \(Zamak 3\) is not a resin a hook is moulded in/.test(x.text)));
  c = snapOf(edit('desk', P => { P('front').snaps.hooks.length = 1; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /held on back housing by one snap hook/);
  c = snapOf(edit('desk', P => { P('front').snaps.hooks.forEach(h => { h.at['xyz'.indexOf(h.along[1])] -= (h.along[0] === '-' ? -1 : 1) * -30; }); })); assert.ok(c.every(x => x.level === 'bad'), 'hooks moved off the joint find nothing');
  assert.equal(cleanAssembly(edit('desk', P => { P('front').snaps.into = 'gone'; })).parts.find(p => p.id === 'front').snaps, undefined);
});

test('a thread: the tumbler lid screws onto the cup, the two diameters, the flanks and the turns measured off the two parts', async () => {
  const { stepOf } = await import('../src/lab-step.js');
  const thr = s => fitOf(cleanAssembly(s)).thread, edit = fn => { const s = JSON.parse(JSON.stringify(archetype('tumbler'))); fn(id => s.parts.find(p => p.id === id), s); return s; };
  for (const dims of [{}, { w: 50, h: 80 }, { w: 160, h: 400 }, { w: 70, h: 120 }]) { const s = archetype('tumbler', dims), lid = s.parts.find(p => p.id === 'lid'), body = s.parts.find(p => p.id === 'body'), f = fitOf(s).thread, E = engineer(s);
    assert.equal(lid.fix, 'thread'); assert.deepEqual(lid.thread, { onto: 'body', pitch: 4, turns: 1.5, depth: 1.2 }); assert.equal(f.length, 1); assert.equal(f[0].level, 'ok', f[0].text); assert.equal(f[0].kind, 'thread');
    assert.equal(f[0].outside, 'body'); assert.equal(f[0].inside, 'lid'); assert.equal(f[0].neck, body.size[0]); assert.equal(f[0].bore, lid.size[0] - 2 * lid.wall);
    assert.ok(Math.abs(f[0].major - (body.size[0] + 2.4)) < .011 && Math.abs(f[0].clear - .4) < .011 && Math.abs(f[0].grip - 1) < .011, `over the thread ⌀${f[0].major} in a ⌀${f[0].bore} bore: 0.4 mm clear, flanks catching 1 mm`);
    assert.equal(f[0].need, 6); assert.equal(f[0].over, 14, 'the lid\'s skirt is over the cup for 14 mm');
    assert.match(f[0].text, /the turns themselves are not drawn in them/); assert.ok(E.checks.some(c => c.kind === 'thread' && c.level === 'ok')); assert.ok(E.steps.some(t => /Screw on lid/.test(t)), 'the assembly steps screw the lid on');
    assert.deepEqual(notOk(fitOf(s)).map(c => c.text), [], 'and the seal still sits between the rim and the lid, so nothing floats'); }
  // the files carry the two walls at the thread's roots and no thread faces: the lid's STEP is the same with and without the thread
  const s0 = cleanAssembly(archetype('tumbler')), bare = cleanAssembly({ ...s0, parts: s0.parts.map(p => ({ ...p, thread: undefined })) }), faces = t => (t.match(/ADVANCED_FACE\(/g) || []).length;
  assert.equal(faces(stepOf(s0, { only: 'lid' })), faces(stepOf(bare, { only: 'lid' }))); assert.equal(faces(stepOf(s0, { only: 'body' })), faces(stepOf(bare, { only: 'body' })));
  // broken on purpose
  const grow = by => edit(P => { P('body').size[0] += by; P('body').size[1] += by; });
  let c = thr(grow(.6)); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /the thread on cup body is 0\.2 mm larger than the bore it goes into/); assert.equal(c[0].clear, -.2);
  c = thr(grow(-3)); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /the two threads do not reach each other; there is 1\.7 mm each side between them and the thread is 1\.2 mm deep/);
  c = thr(grow(-1)); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /the flanks catch 0\.5 mm of their 1\.2 mm \(1\.4 mm clear on the diameter/);
  c = thr(grow(.3)); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /only 0\.1 mm clear on the diameter/);
  c = thr(edit(P => { P('lid').at[0] += .3; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /0\.3 mm off one axis/);
  c = thr(edit(P => { P('lid').thread.turns = 4; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /4 turns need 16 mm and 1 mm to run out, and lid is over cup body for 14 mm/);
  c = thr(edit(P => { P('lid').thread.turns = .5; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /less than one full turn/);
  c = thr(edit(P => { P('lid').thread.pitch = 1.5; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /1\.2 mm deep at 1\.5 mm pitch is too steep to mould/);
  c = thr(edit(P => { P('lid').thread.onto = 'slider'; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /a thread needs two round parts on one axis/);
  c = thr(edit((P, s) => { s.parts.push({ id: 'plug', name: 'Plug', shape: 'cyl', size: [120, 120, 10], at: [0, 0, 150] }); P('lid').thread.onto = 'plug'; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /plug is solid, so there is nothing for lid to screw into/);
  assert.equal(cleanAssembly(edit(P => { P('lid').thread.onto = 'gone'; })).parts.find(p => p.id === 'lid').thread, undefined); assert.equal(cleanPart({ shape: 'box', thread: { onto: 'body' } }).thread, undefined, 'only a round part carries a thread');
});

test('a hinge: knuckles on the case\'s base and lid, the pin through them, and the lid turned about the pin to measure how far it opens', async () => {
  const { stepOf } = await import('../src/lab-step.js');
  const hin = s => fitOf(cleanAssembly(s)).hinge, edit = fn => { const s = JSON.parse(JSON.stringify(archetype('case'))); fn(id => s.parts.find(p => p.id === id), s); return s; };
  for (const dims of [{}, { w: 60, d: 40, h: 25 }, { w: 800, d: 600, h: 400 }, { w: 300, d: 200, h: 100 }]) { const s = archetype('case', dims), base = s.parts.find(p => p.id === 'base'), lid = s.parts.find(p => p.id === 'lid'), pin = s.parts.find(p => p.id === 'hinge'), f = fitOf(s).hinge;
    assert.equal(base.knuckles.at.length, 3); assert.equal(lid.knuckles.at.length, 2); assert.equal(base.knuckles.pin, 'hinge');
    assert.equal(base.adds.filter(x => x.kind === 'knuckle').length, 6, 'three knuckles on the base, each a ring round the pin and a lug to the back wall'); assert.equal(lid.adds.filter(x => x.kind === 'knuckle').length, 4);
    assert.equal(f.length, 1); assert.equal(f[0].level, 'ok', f[0].text); assert.equal(f[0].kind, 'hinge'); assert.equal(f[0].id, 'hinge'); assert.equal(f[0].knuckles, 5); assert.equal(f[0].opens, 180); assert.equal(f[0].bore, 3.2); assert.ok(Math.abs(f[0].slack - .4) < .06);
    // the pin lies in each ring's bore, 0.1 mm clear all round, and each ring's material is its housing's; the lug joins it to the wall
    const ring = base.adds.find(x => x.kind === 'knuckle' && x.shape === 'ring'), rc = ring.at.map((v, k) => v + base.at[k]); assert.deepEqual([rc[1], rc[2]], [pin.at[1], pin.at[2]], 'the knuckle is on the pin\'s axis');
    assert.equal(inMaterial(base, rc), false, 'the bore'); assert.equal(inMaterial(base, [rc[0], rc[1] + 2.5, rc[2]]), true, 'the ring'); assert.equal(inMaterial(base, [rc[0], rc[1] - 2.6, rc[2] - 1.5]), true, 'the lug, on the base\'s side of the pin'); assert.equal(inMaterial(base, [rc[0], rc[1] - 2.6, rc[2] + 1.5]), true, 'the ring above the lug');
    assert.equal(inMaterial(lid, [rc[0], rc[1] + 2.5, rc[2]]), false);
    const made = extentOf(s.parts).size; assert.ok(Math.abs(made[1] - s.dims.d) < .11, `knuckles and latch are inside the ${s.dims.d} mm asked for: ${made[1]}`);
    assert.deepEqual(fitOf(s).clash.filter(c => c.level !== 'ok').map(c => c.text), []); assert.deepEqual(fitOf(s).contact.filter(c => c.level !== 'ok').map(c => c.text), [], 'the pin is held by the knuckles'); }
  const s0 = archetype('case'); assert.match(stepOf(s0, { only: 'base' }), /MANIFOLD_SOLID_BREP\('Base: knuckle'/); assert.equal((stepOf(s0, { only: 'lid' }).match(/MANIFOLD_SOLID_BREP\('Lid: knuckle'/g) || []).length, 4);
  assert.deepEqual(cleanAssembly(cleanAssembly(s0)), cleanAssembly(s0));
  // broken on purpose
  let c = hin(edit(P => { P('hinge').at[2] -= 1.5; })); assert.equal(c.length, 1); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /it opens only 0° before lid meets base/, 'a pin 1.5 mm below where the walls meet: the lid\'s lugs are in the base\'s wall, found by turning the lid about the pin'); assert.equal(c[0].opens, 0);
  c = hin(edit(P => { P('hinge').at[1] -= .5; })); assert.equal(c.length, 5); assert.ok(c.every(x => x.level === 'bad')); assert.match(c[0].text, /the knuckle of base at -70\.4 mm \(7 mm across\) is 0\.3 mm into the wall behind it, which is 3\.2 mm from the pin/); assert.match(c[0].text, /Move the pin 0\.5 mm out/);
  c = hin(edit(P => { P('hinge').at[1] += 5; })); assert.equal(c.length, 5); assert.match(c[0].text, /is not joined to it: no wall of base is within 6\.5 mm of the pin/);
  c = hin(edit(P => { P('hinge').size[0] -= 30; })); assert.equal(c.length, 2); assert.match(c[0].text, /it stops 14\.8 mm short of the end of the knuckle of base at -70\.4 mm/); assert.equal(c[0].short, 14.8);
  c = hin(edit(P => { P('lid').knuckles.at = P('lid').knuckles.at.map(v => v + 10); })); assert.equal(c.length, 2); assert.match(c[0].text, /the knuckles at -25\.2 mm \(lid\) and 0 mm \(base\) are 9\.6 mm into each other along it/);
  c = hin(edit(P => { delete P('lid').knuckles; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /only base has knuckles on it; a hinge joins two parts/);
  c = hin(edit(P => { P('lid').knuckles.len -= 10; })); assert.equal(c[0].level, 'warn'); assert.match(c[0].text, /lid can slide 5\.4 mm along the pin/);
  c = hin(edit(P => { P('hinge').size[1] = P('hinge').size[2] = 6; })); assert.equal(c.length, 5); assert.match(c[0].text, /7 mm across on a 6 mm pin: under 0\.6 mm of wall round the bore/);
  c = hin(edit(P => { P('hinge').shape = 'box'; })); assert.equal(c[0].level, 'bad'); assert.match(c[0].text, /a pin is a round bar/);
  assert.equal(cleanAssembly(edit(P => { P('base').knuckles.pin = 'gone'; })).parts.find(p => p.id === 'base').knuckles, undefined);
});

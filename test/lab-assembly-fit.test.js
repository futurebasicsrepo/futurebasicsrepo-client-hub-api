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
const notOk = f => [...f.clash, ...f.contact, ...f.fasteners, ...f.size].filter(c => c.level !== 'ok');
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

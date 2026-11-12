import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
import { realMeshes, isoPicture } from '../src/lab-parts-mesh.js';
import { harnessOf, cablePath, frontOf } from '../src/lab-assembly.js';
import { archetype, engineer, cleanAssembly, cleanPart, meshOf, volumeOf, explodeOffsets, stlOf, drawingSvg, blockSvg, bomRows, bomCsv, guessArch, radioOf, power, cellOf, ARCHES, dfm } from '../src/lab-assembly.js';

test('every starting assembly fits together: no part in another\'s space, nothing too big for its housing', () => {
  for (const a of Object.keys(ARCHES)) {
    const E = engineer(archetype(a)), bad = E.checks.filter(c => c.level === 'bad');
    assert.deepEqual(bad, [], `${a}: ${bad.map(c => c.text).join(' | ')}`);
    assert.ok(E.parts.length >= 1 && E.unit > 0 && E.toolCost > 0, a);
  }
});

test('a round speaker is engineered as an electronic product: board, power budget, block diagram, certifications', () => {
  const s = archetype('puck', { w: 96, h: 48 }, { mah: 2000, radio: 'ble' }), E = engineer(s);
  assert.equal(s.kind, 'electronics');
  for (const id of ['bottom', 'top', 'pcb', 'battery', 'pipe', 'foot']) assert.ok(s.parts.some(p => p.id === id), id);
  assert.equal(E.power.mah, 2000); assert.ok(E.power.runtime > 5 && E.power.runtime < 60, String(E.power.runtime));
  assert.ok(E.power.charge > 3 && E.power.charge < 6); assert.equal(E.power.wh, 7.4);
  assert.ok(E.pcb && E.pcb.layers === 2 && E.pcb.areaCm2 > 40);
  assert.ok(E.certs.some(c => /FCC Part 15C/.test(c.name)) && E.certs.some(c => /Bluetooth SIG/.test(c.name)) && E.certs.some(c => /UN 38\.3/.test(c.name)), E.certs.map(c => c.name).join(', '));
  const svg = blockSvg(s); assert.match(svg, /Block diagram/); assert.match(svg, /speaker out/); assert.match(svg, /I2S/);
  assert.ok(E.steps.some(t => /Build the board/.test(t)) && E.steps.some(t => /Snap top cover/.test(t)), E.steps.join(' / '));
});

test('moulding checks: thin and thick walls, draft for a texture, undercuts, a clear part, food contact', () => {
  const s = archetype('case'); s.parts.find(p => p.id === 'base').wall = .6;
  let c = dfm(cleanAssembly(s)); assert.ok(c.some(x => x.level === 'bad' && /too thin for PP/.test(x.text)));
  s.parts.find(p => p.id === 'base').wall = 5; c = dfm(cleanAssembly(s)); assert.ok(c.some(x => x.level === 'warn' && /thick for PP/.test(x.text)));
  s.parts.find(p => p.id === 'base').wall = 2.5; s.parts.find(p => p.id === 'lid').draft = 1; c = dfm(cleanAssembly(s));
  assert.ok(c.some(x => /Lid: 1° draft; SPI D-2 \(textured\) needs 3°/.test(x.text)), c.map(x => x.text).join('\n'));
  assert.ok(c.some(x => /Latch: 1 undercut → 1 side action/.test(x.text)));
  const t = archetype('tumbler'); t.parts.find(p => p.id === 'body').finish = 'SPI C-1 (matte)'; t.parts.find(p => p.id === 'lid').resin = 'ABS';
  c = dfm(cleanAssembly(t)); assert.ok(c.some(x => /Cup body: a clear part needs an SPI A polish/.test(x.text)));
  assert.ok(c.some(x => x.level === 'bad' && /Lid: touches food or drink, and ABS is not food-contact grade/.test(x.text)));
});

test('fit: a part too big for its housing, two parts in one space, a USB-C port away from the wall', () => {
  const s = archetype('handheld'); s.parts.find(p => p.id === 'battery').size[0] = 60;
  let c = dfm(cleanAssembly(s)); assert.ok(c.some(x => x.level === 'bad' && /does not fit inside Bottom housing: .* too big along x/.test(x.text)), c.map(x => x.text).join('\n'));
  const s2 = archetype('handheld'), b = s2.parts.find(p => p.id === 'battery'); b.at = [...s2.parts.find(p => p.id === 'pcb').at];
  c = dfm(cleanAssembly(s2)); assert.ok(c.some(x => /take the same space/.test(x.text)));
  const s3 = archetype('handheld'), u = s3.parts.find(p => p.elec?.kind === 'usbc'); u.at[1] += 20; // pulled 20 mm in from the bottom end
  c = dfm(cleanAssembly(s3)); assert.ok(c.some(x => x.level === 'bad' && /USB-C receptacle: .* in from the outside wall/.test(x.text)));
  const s4 = archetype('puck'); s4.parts.find(p => p.id === 'bottom').resin = 'aluminium 6061';
  c = dfm(cleanAssembly(s4)); assert.ok(c.some(x => x.level === 'bad' && /metal and will block the radio/.test(x.text)));
});

test('a toy for under-3s: small parts are refused, and a battery needs a screwed compartment', () => {
  const s = archetype('figure'); s.age = '0+'; const c = dfm(cleanAssembly(s));
  assert.ok(c.some(x => x.level === 'bad' && /fits the small-parts cylinder/.test(x.text)), c.map(x => x.text).join('\n'));
  const E = engineer({ ...s }); assert.ok(E.certs.some(x => /ASTM F963/.test(x.name)) && E.certs.some(x => /EN 71/.test(x.name)));
});

test('the tool follows the volume: aluminium for a short run, P20 for thousands, hardened steel and more cavities for a big one', () => {
  const tool = v => { const s = archetype('case'); s.volume = v; return engineer(s).tools.find(t => t.id === 'base'); };
  assert.match(tool(1000).steel, /Aluminium/); assert.match(tool(20000).steel, /P20/); const big = tool(300000);
  assert.match(big.steel, /H13/); assert.ok(big.cavities >= 4 && big.cost > tool(20000).cost && big.weeks >= 9);
  assert.equal(tool(1000).cost % 100, 0);
});

test('meshes, volume and the exploded view', () => {
  const box = cleanPart({ shape: 'box', size: [10, 20, 30], at: [0, 0, 15], r: 0 }); assert.ok(Math.abs(volumeOf(box) - 6000) < 1);
  const sh = cleanPart({ shape: 'shell', size: [10, 10, 10], at: [0, 0, 5], wall: 1, r: 0 }); assert.ok(Math.abs(volumeOf(sh) - (1000 - 8 * 8 * 9)) < 1);
  const m = meshOf(sh); assert.equal(m.length % 9, 0); let zmin = Infinity, zmax = -Infinity; for (let i = 2; i < m.length; i += 3) { zmin = Math.min(zmin, m[i]); zmax = Math.max(zmax, m[i]); } assert.equal(zmin, 0); assert.equal(zmax, 10);
  const yb = cleanPart({ shape: 'shell', axis: 'y', size: [10, 4, 20], at: [0, 0, 0], wall: 1 }), my = meshOf(yb); let ylo = Infinity, yhi = -Infinity, zlo = Infinity, zhi = -Infinity; for (let i = 0; i < my.length; i += 3) { ylo = Math.min(ylo, my[i + 1]); yhi = Math.max(yhi, my[i + 1]); zlo = Math.min(zlo, my[i + 2]); zhi = Math.max(zhi, my[i + 2]); }
  assert.ok(Math.abs(yhi - ylo - 4) < 1e-6 && Math.abs(zhi - zlo - 20) < 1e-6, 'a part on the y axis keeps its world size');
  const s = archetype('puck'), o0 = explodeOffsets(s, 0), o1 = explodeOffsets(s, 1);
  assert.deepEqual(o0.top, [0, 0, 0]); assert.ok(o1.top[2] > o1.pcb[2] && o1.pcb[2] > 0 && o1.foot[2] < 0);
  const stl = stlOf(s, { t: 1 }), n = new DataView(stl.buffer).getUint32(80, true); assert.equal(stl.length, 84 + n * 50); assert.ok(n > 500);
  assert.ok(stlOf(s, { only: 'top' }).length < stl.length);
});

test('the drawing, the BOM and the CSV', () => {
  const s = archetype('desk'), E = engineer(s), svg = drawingSvg(s, { title: 'Desk clock' });
  assert.match(svg, /Desk clock/); assert.match(svg, /Parts list/); assert.match(svg, /T1 samples in \d+ weeks/);
  const rows = bomRows(E); assert.ok(rows.some(r => /Board assembly \(4-layer/.test(r.name)) && rows.at(-1).process === 'Labour');
  const csv = bomCsv(E).split('\n'); assert.equal(csv[0], 'Item,Part,Qty,Material,Process,Finish,Colour,Mass (g),Unit cost ($),Tool cost ($)'); assert.equal(csv.length, rows.length + 1);
});

test('the product as lines for a page to draw over: from the top and the front at one scale, the outline of the whole and of each part that shows', async () => {
  const { lineViews, extentOf, RESINS } = await import('../src/lab-assembly.js');
  const W = 1400, H = 1400, count = (L, v, lv) => { let n = 0; for (let y = v.y - 1; y <= v.y + v.h + 1; y++) for (let x = v.x - 1; x <= v.x + v.w + 1; x++) if (L.edges[y * W + x] === lv) n++; return n; };
  for (const a of Object.keys(ARCHES).filter(k => k !== 'custom')) { const s = archetype(a), L = lineViews(s, { W, H }), [top, front] = L.views, E = extentOf(s.parts).size;
    assert.deepEqual(L.views.map(v => v.name), ['Top', 'Front'], a); assert.ok(L.k > 0, a);
    // real size: both views are the product's width across, the top one its depth up the page and the front one its height
    assert.ok(Math.abs(top.w / L.k - front.w / L.k) < .01 && Math.abs(top.x - front.x) < 1, `${a}: the two views share their width`);
    const across = top.mm[0], sizes = [across, top.mm[1], front.mm[1]].sort((x, y) => x - y), want = [...E].sort((x, y) => x - y); assert.ok(sizes.every((v, i) => Math.abs(v - want[i]) < .2), `${a}: ${sizes} against the assembly's ${want.map(v => Math.round(v * 10) / 10)}`);
    assert.ok(Math.abs(top.w - across * L.k) <= 1 && Math.abs(front.h - front.mm[1] * L.k) <= 1, `${a}: drawn at ${L.k.toFixed(2)} px a mm`);
    // on the page, the top view over the front view, with room for a line of words under each
    assert.ok(top.y >= 0 && top.y + top.h < front.y - 40 && front.y + front.h + 40 <= H && top.x >= 0 && top.x + top.w <= W, `${a}: both views are on the page`);
    for (const v of L.views) { const out = count(L, v, 2); assert.ok(out >= 2 * (v.w + v.h) * .8, `${a} ${v.name}: an outline all the way round (${out} px for a ${v.w} × ${v.h} view)`); }
    assert.ok(count(L, top, 1) + count(L, front, 1) > 50, `${a}: the parts that show are drawn inside the outline`); }
  // what is inside does not show: the round device's board and battery are under its top, and the three keys on top are there
  const puck = archetype('puck'), L = lineViews(puck, { W, H }), top = L.views[0], at = id => { const p = puck.parts.find(q => q.id === id); return [Math.round(top.x + (p.at[0] + 48) * L.k), Math.round(top.y + (48 - p.at[1]) * L.k)]; };
  const ringAt = (id, r) => { const [cx, cy] = at(id); let n = 0; for (let t = 0; t < 360; t += 6) { const x = Math.round(cx + Math.cos(t / 57.3) * r * L.k), y = Math.round(cy + Math.sin(t / 57.3) * r * L.k); let hit = false; for (let dy = -2; dy <= 2 && !hit; dy++) for (let dx = -2; dx <= 2 && !hit; dx++) if (L.edges[(y + dy) * W + x + dx]) hit = true; if (hit) n++; } return n / 60; };
  assert.ok(ringAt('key1', 4.5) > .9 && ringAt('key2', 4.5) > .9, 'the keys on top are drawn'); assert.ok(ringAt('p13', 26) < .2, 'the speaker driver inside is not');
  // a clear part is seen through: the turntable's platter shows under its dust cover, and the cover's own outline is there
  { const tt = archetype('turntable'), T = lineViews(tt, { W, H }), tv = T.views[0], X = extentOf(tt.parts), pl = tt.parts.find(q => q.id === 'platter'), cx = tv.x + (pl.at[0] - X.lo[0]) * T.k, cy = tv.y + (X.hi[1] - pl.at[1]) * T.k; let n = 0;
    for (let t = 0; t < 360; t += 6) { const x = Math.round(cx + Math.cos(t / 57.3) * 150 * T.k), y = Math.round(cy + Math.sin(t / 57.3) * 150 * T.k); let hit = false; for (let dy = -3; dy <= 3 && !hit; dy++) for (let dx = -3; dx <= 3 && !hit; dx++) if (T.edges[(y + dy) * W + x + dx]) hit = true; if (hit) n++; }
    assert.ok(RESINS[tt.parts.find(q => q.id === 'cover').resin].clear && n / 60 > .85, `the platter's rim is drawn under the clear cover (${n} of 60 points round it)`); }
  // a device chosen when the concept was started is the one built, whatever its words say
  assert.equal(guessArch({ name: 'Untitled electronics', category: 'electronics', spec: {} }), 'puck'); assert.equal(guessArch({ name: 'Untitled electronics', category: 'electronics', spec: { arch: 'turntable' } }), 'turntable'); assert.equal(guessArch({ name: 'A turntable', category: 'electronics', spec: { arch: 'spaceship' } }), 'turntable');
});

test('the files carry the parts\' real shapes: the same 3D parts the page shows, built on the server', async () => {
  const s = archetype('cdplayer'), real = realMeshes(s), tris = id => real[id].reduce((a, m) => a + m.tri.length / 9, 0);
  assert.deepEqual(Object.keys(real).sort(), s.parts.map(p => p.id).sort(), 'every part is built');
  for (const p of s.parts) { assert.ok(tris(p.id) >= 12, `${p.name} has a shape`); let lo = Infinity, hi = -Infinity; for (const m of real[p.id]) for (let i = 0; i < m.tri.length; i++) { lo = Math.min(lo, m.tri[i]); hi = Math.max(hi, m.tri[i]); } assert.ok(hi - lo <= Math.hypot(...p.size) * 1.6 + 2, `${p.name} stays near its own size`); }
  const board = s.parts.find(p => p.shape === 'pcb'), green = real[board.id].some(m => { const [r, g, b] = [1, 3, 5].map(i => parseInt(m.colour.slice(i, i + 2), 16)); return g > r + 20 && g > b; });
  assert.ok(green, 'the board reads as solder mask, not a blank texture');
  const box = stlOf(s, { t: 0 }), rl = stlOf(s, { t: 0, real }), n = new DataView(rl.buffer).getUint32(80, true);
  assert.equal(rl.length, 84 + n * 50); assert.ok(n > 10 * new DataView(box.buffer).getUint32(80, true), 'many times the detail of the plain solids'); // the plain solids now carry their openings and bosses, and the CD player has 23 parts where it had 17
  assert.ok(stlOf(s, { only: board.id, real }).length < rl.length);
  const pic = await isoPicture(s, { t: 1, real }); assert.match(pic.href, /^data:image\/png;base64,/); assert.ok(pic.box[2] > pic.box[0] && pic.box[3] > pic.box[1]);
  const svg = drawingSvg(s, { title: 'CD player', picture: pic }); assert.match(svg, /<image href="data:image\/png/); assert.ok(!/<path d="M/.test(svg), 'the picture replaces the painted boxes'); assert.match(svg, /Parts list/);
});

test('the cables: every part off the board is wired to what drives it, costed, in the steps and the parts list, and routed between its parts', () => {
  const s = archetype('cdplayer'), E = engineer(s), H = E.harness, byKind = k => H.find(c => s.parts.find(p => p.id === c.from).elec?.kind === k);
  assert.equal(byKind('iec').to, s.parts.find(p => p.elec?.kind === 'psu').id, 'mains comes in to the supply'); assert.equal(byKind('psu').to, 'pcb', 'the supply feeds the board');
  assert.equal(byKind('cdmech').kind, 'ribbon'); assert.match(byKind('cdmech').type, /FFC/);
  assert.ok(!H.some(c => s.parts.find(p => p.id === c.from).parent === 'pcb'), 'parts soldered on the board need no cable');
  assert.deepEqual(H.map(c => c.n), H.map((_, i) => `W${i + 1}`)); assert.ok(H.every(c => c.mm >= 40 && c.unit > 0));
  const rows = bomRows(E); assert.equal(rows.filter(r => /^Cable W\d+:/.test(r.name)).length, H.length); assert.ok(E.steps.some(t => /Connect W1, dc power/.test(t)));
  const noCab = engineer({ ...s, parts: s.parts.filter(p => !['psu', 'iec', 'cdmech', 'vfd', 'ir', 'button'].includes(p.elec?.kind)) }); assert.ok(E.unit > noCab.unit - 30, 'cables are costed');
  const path = cablePath(s, H[0]), path1 = cablePath(s, H[0], explodeOffsets(s, 1)); assert.equal(path.length, 24); assert.notDeepEqual(path[0], path1[0], 'the run follows its parts as they pull apart');
  assert.deepEqual(engineer(archetype('tumbler')).harness, [], 'a product with no electronics has no cables');
  assert.deepEqual(frontOf(s), [0, -1, 0], 'the CD player faces the way its front panel does');
});

test('the CD tray opens as the view pulls apart: the disc goes out the front, the laser sled is left in view', () => {
  const s = archetype('cdplayer'), id = s.parts.find(p => p.elec?.kind === 'cdmech').id, ext = list => { let lo = Infinity; for (const m of list) for (let i = 1; i < m.tri.length; i += 3) lo = Math.min(lo, m.tri[i]); return lo; };
  const shut = realMeshes(s, { t: 0 })[id], open = realMeshes(s, { t: 1 })[id];
  assert.ok(ext(open) < ext(shut) - 80, `the tray reaches out toward the front (-y): ${ext(shut).toFixed(0)} → ${ext(open).toFixed(0)} mm`);
});

test('the archetype and radio are read from the concept\'s words; cleaning keeps values in range', () => {
  assert.equal(guessArch({ category: 'electronics', name: 'Pocket remote' }), 'handheld');
  assert.equal(guessArch({ category: 'electronics', name: 'Bedside clock with display' }), 'desk');
  assert.equal(guessArch({ category: 'electronics', name: 'Bluetooth speaker' }), 'puck');
  assert.equal(guessArch({ category: 'home', name: 'Insulated tumbler' }), 'tumbler');
  assert.equal(guessArch({ category: 'toys', name: 'Vinyl collectible' }), 'figure');
  assert.equal(guessArch({ category: 'home', name: 'Desk organizer' }), 'case');
  assert.equal(radioOf({ category: 'electronics', name: 'Wi-Fi smart display' }), 'wifi'); assert.equal(radioOf({ category: 'home', name: 'Tray' }), 'none');
  const p = cleanPart({ shape: 'nope', size: [-5, 1e9, 'x'], resin: 'kryptonite', wall: 99, qty: 0 });
  assert.equal(p.shape, 'box'); assert.deepEqual(p.size, [.3, 2000, 20]); assert.equal(p.resin, 'ABS'); assert.equal(p.qty, 1);
  const s = cleanAssembly({ arch: 'puck', parts: [{ id: 'a', parent: 'missing' }, { id: 'a' }] }); assert.equal(s.parts[0].parent, null); assert.notEqual(s.parts[0].id, s.parts[1].id); assert.equal(s.kind, 'electronics');
  const c = cellOf(2000); assert.ok(c.size[0] * c.size[1] * c.size[2] > 12000 && c.wh === 7.4);
  assert.equal(power(archetype('desk')).runtime, null);
});

test('audio: a CD player, a cassette player and a powered speaker, with the parts they are made of', () => {
  const cd = engineer(archetype('cdplayer')), kinds = E => new Set(E.spec.parts.filter(p => p.elec).map(p => p.elec.kind));
  for (const k of ['cdmech', 'psu', 'iec', 'dac', 'vfd', 'ir', 'rca']) assert.ok(kinds(cd).has(k), `CD player: ${k}`);
  assert.deepEqual(cd.checks.filter(c => c.level === 'bad'), []);
  assert.ok(cd.power.mains && cd.power.runtime === null && cd.power.peakW > 1, 'mains: in watts, no run time');
  assert.ok(cd.certs.some(c => /IEC 60825-1/.test(c.name)) && cd.certs.some(c => /FDA 21 CFR 1040\.10/.test(c.name)) && cd.certs.some(c => /CE-LVD/.test(c.name)), cd.certs.map(c => c.name).join(', '));
  assert.ok(cd.checks.some(c => c.level === 'warn' && /bond the case to earth/.test(c.text)), 'mains in a steel case: earth it');
  const cdr = engineer(archetype('cdplayer', {}, { radio: 'wifi' })); assert.ok(kinds(cdr).has('antenna') && !cdr.checks.some(c => c.level === 'bad'), 'a radio in a steel case brings its antenna outside');
  const tape = engineer(archetype('cassette'));
  for (const k of ['tapemech', 'aa', 'preamp', 'hpamp', 'jack', 'pot']) assert.ok(kinds(tape).has(k), `cassette: ${k}`);
  assert.deepEqual(tape.checks.filter(c => c.level === 'bad'), []); assert.equal(tape.power.cell, 'aa'); assert.equal(tape.power.wh, 7.5);
  assert.ok(tape.power.runtime > 8 && tape.power.runtime < 20 && tape.power.charge === null, String(tape.power.runtime));
  assert.ok(!tape.certs.some(c => /UN 38\.3/.test(c.name)) && tape.certs.some(c => /Battery safety and marking/.test(c.name)), 'AA cells are not lithium');
  const sp = engineer(archetype('speaker'));
  for (const k of ['woofer', 'tweeter', 'amp2', 'psu', 'iec', 'rca', 'encoder', 'ble']) assert.ok(kinds(sp).has(k), `speaker: ${k}`);
  assert.deepEqual(sp.checks.filter(c => c.level === 'bad'), []); assert.ok(sp.spec.parts.some(p => p.resin === 'MDF') && sp.power.peakW > 15, 'an MDF cabinet and a 12 V amplifier counted in watts');
  const svg = blockSvg(sp.spec); assert.match(svg, /speaker out/); assert.match(svg, /100–240 V in/);
  assert.equal(guessArch({ category: 'electronics', name: 'Retro CD player' }), 'cdplayer'); assert.equal(guessArch({ category: 'electronics', name: 'Walkman cassette player' }), 'cassette'); assert.equal(guessArch({ category: 'electronics', name: 'Bookshelf speakers' }), 'speaker'); assert.equal(guessArch({ category: 'electronics', name: 'Bluetooth speaker' }), 'puck');
  const moved = archetype('speaker'); moved.parts.find(p => p.elec?.kind === 'iec').at[1] -= 40;
  assert.ok(engineer(moved).checks.some(c => c.level === 'bad' && /IEC C8 mains inlet: .* in from the outside wall/.test(c.text)), 'a mains inlet pulled inside is caught');
});

test('a factory\'s files carry no costs: the parts list and the drawing without unit or tool costs', () => {
  const s = archetype('cdplayer'), E = engineer(s), csv = bomCsv(E, { costs: false }), svg = drawingSvg(s, { costs: false });
  assert.equal(csv.split('\n')[0], 'Item,Part,Qty,Material,Process,Finish,Colour,Mass (g)'); assert.ok(!/Labour|Final assembly/.test(csv));
  assert.ok(!/Unit \$|Unit cost|tooling \$/.test(svg) && /T1 samples in \d+ weeks/.test(svg)); assert.match(drawingSvg(s), /Unit cost \$/);
});

test('turntable, headphones, smart speaker, power bank and lamp: read from their words, made of their real parts, nothing to fix', async () => {
  const want = {
    turntable: ['Belt-drive turntable with a phono preamp', ['ttmotor', 'cartridge', 'phono', 'rca', 'dcjack'], /External adapter/],
    headphones: ['Wireless over-ear headphones', ['hpdriver', 'battery', 'ble', 'usbc', 'mic'], /EN 50332/],
    smartspeaker: ['Smart speaker with a voice assistant', ['wifi', 'mic', 'led', 'speaker', 'amp', 'dcjack'], /CE-RED/],
    powerbank: ['10,000 mAh power bank', ['li18650', 'pbms', 'usbc', 'led'], /UN 38\.3/],
    lamp: ['Cordless table lamp', ['ledcob', 'leddrv', 'touch', 'battery', 'usbc'], /IEC 62471/]
  };
  const { realMeshes } = await import('../src/lab-parts-mesh.js');
  for (const [a, [name, kinds, cert]] of Object.entries(want)) {
    assert.equal(guessArch({ name, category: 'electronics' }), a, name);
    const s = archetype(a), E = engineer(s), k = new Set(s.parts.filter(p => p.elec).map(p => p.elec.kind));
    assert.ok(kinds.every(x => k.has(x)), `${a}: ${kinds.filter(x => !k.has(x))} missing`);
    assert.deepEqual(E.checks.filter(c => c.level === 'bad').map(c => c.text), [], a);
    assert.ok(E.certs.some(c => cert.test(c.name)), `${a}: ${cert}`); assert.ok(E.harness.length >= 1 && E.unit > 0, a);
    const real = realMeshes(s); assert.ok(s.parts.every(p => real[p.id]?.length), `${a}: every part is built in 3D`);
  }
  const pb = engineer(archetype('powerbank', {}, { mah: 12000 })); assert.match(pb.spec.parts.find(p => p.elec?.kind === 'li18650').name, /4 × 18650, 12000 mAh/);
  assert.ok(pb.power.runtime > 1 && pb.power.runtime < 6, 'a power bank lasts hours at half its rated output');
  assert.ok(!pb.checks.some(c => /^Heat/.test(c.text) && c.level !== 'ok'), 'its output leaves through the cable: only the loss warms it');
  const sm = engineer(archetype('smartspeaker')); assert.ok(sm.harness.some(c => c.label === 'Board to board' && /FFC/.test(c.type)), 'the top board joins the main one by a flex cable');
});

test('STEP for CAD: every part an exact solid (planes, and cylinders for rounded and round faces), named, coloured, in mm', async () => {
  const { stepOf } = await import('../src/lab-step.js'), s = archetype('cdplayer'), txt = stepOf(s, { title: 'CD player' });
  assert.match(txt, /^ISO-10303-21;/); assert.match(txt, /FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN/); assert.match(txt, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/); assert.match(txt, /END-ISO-10303-21;\n$/);
  const solids = [...txt.matchAll(/MANIFOLD_SOLID_BREP\('([^']*)'/g)].map(m => m[1]); assert.equal(solids.length, s.parts.length); assert.ok(solids.includes('Top cover') && solids.includes('Front panel'));
  assert.equal((txt.match(/STYLED_ITEM\(/g) || []).length, s.parts.length); assert.ok(/CYLINDRICAL_SURFACE\(/.test(txt) && /CIRCLE\(/.test(txt), 'rounded corners and round parts are true cylinders');
  const one = stepOf(s, { only: 'cover' }); assert.equal((one.match(/MANIFOLD_SOLID_BREP/g) || []).length, 1);
  // every id is defined once and every reference points at a defined id
  const ids = new Set([...txt.matchAll(/^#(\d+)=/gm)].map(m => m[1])); for (const m of txt.matchAll(/#(\d+)(?!=)/g)) assert.ok(ids.has(m[1]), `#${m[1]} is defined`);
  // one solid a part, and one more for each body moulded on a part (a lip standing on a housing's rim)
  for (const a of Object.keys(ARCHES)) { const c = cleanAssembly(archetype(a)); assert.equal((stepOf(archetype(a)).match(/MANIFOLD_SOLID_BREP/g) || []).length, c.parts.length + c.parts.reduce((t, p) => t + (p.adds || []).length, 0), a); }
});

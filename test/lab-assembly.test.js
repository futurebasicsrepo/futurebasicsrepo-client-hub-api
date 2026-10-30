import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/elec.js';
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
  const s3 = archetype('handheld'), u = s3.parts.find(p => p.elec?.kind === 'usbc'); u.at[1] -= 20;
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

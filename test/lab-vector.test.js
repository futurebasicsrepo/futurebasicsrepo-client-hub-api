import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { traceVector, stitchPlan, dstOf, readDst, stitchPreview } from '../src/lab-vector.js';
import { makeRepeat, cleanRepeat } from '../src/lab-repeat.js';

const art = () => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect x="40" y="60" width="820" height="200" rx="30" fill="#c8102e"/><circle cx="450" cy="380" r="100" fill="#141416"/></svg>`)).png().toBuffer();

test('a graphic traced to vector paths: one filled path per ink, with its Pantone, at its size in inches', async () => {
  const v = await traceVector(await art(), { widthIn: 10, name: 'Crest' });
  assert.equal(v.colours.length, 2); assert.ok(v.colours.every(c => /^PANTONE /.test(c.pantone) && c.paths >= 1));
  assert.ok(v.colours[0].share > .7 && v.colours[1].share < .3);
  assert.match(v.svg, /width="10in"/); assert.equal((v.svg.match(/<path /g) || []).length, 2); assert.match(v.svg, /fill-rule="evenodd"/);
  const back = await sharp(Buffer.from(v.svg)).resize(450).raw().toBuffer({ resolveWithObject: true }); assert.ok(back.info.width === 450);
});

test('a stitch plan and its Tajima file: a fill per thread, a colour change between, and it reads back where it ends', async () => {
  const p = await stitchPlan(await art(), { widthIn: 4 });
  assert.equal(p.colours.length, 2); assert.equal(p.widthMm, 101.6); assert.ok(p.stitches > 1000 && p.jumps > 0);
  assert.ok(p.colours[0].stitches > p.colours[1].stitches, 'the biggest colour first');
  const d = dstOf(p, 'Crest'); assert.equal(d.file.slice(0, 3).toString(), 'LA:'); assert.match(d.file.slice(0, 512).toString('latin1'), /CO:  1/); assert.equal((d.file.length - 512) % 3, 0);
  const recs = readDst(d.file), moves = recs.filter(r => r.kind !== 'end'), last = p.plan.at(-1).pts.at(-1).p;
  assert.deepEqual([moves.at(-1).x, moves.at(-1).y], last); assert.equal(recs.filter(r => r.kind === 'color').length, 1); assert.equal(recs.at(-1).kind, 'end');
  // every move a record can hold: none longer than 12.1 mm
  let px = 0, py = 0; for (const r of moves) { assert.ok(Math.abs(r.x - px) <= 121 && Math.abs(r.y - py) <= 121); px = r.x; py = r.y; }
  assert.match(stitchPreview(p), /^<svg /);
});

test('an all-over repeat tiles without a seam, in each mill type', async () => {
  assert.deepEqual(cleanRepeat({ type: 'x', repeatIn: 99, scale: 0, rotate: 999, background: 'red' }), { type: 'straight', repeatIn: 24, scale: .7, rotate: 180, background: '' });
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><path d="M20 280 L200 20 L380 280Z" fill="#2f5d3a"/></svg>`)).png().toBuffer();
  const straight = await makeRepeat(png, { type: 'straight', repeatIn: 3 }), half = await makeRepeat(png, { type: 'halfdrop', repeatIn: 3 }), mirror = await makeRepeat(png, { type: 'mirror', repeatIn: 3, background: '#f2efe6' });
  assert.equal(straight.widthIn, 3); assert.equal(half.widthIn, 6); assert.equal(half.heightIn, straight.heightIn); assert.equal(mirror.heightIn, straight.heightIn * 2);
  // seamless: the left and right columns of a half-drop tile meet (the right edge continues into the left)
  const { data, info } = await sharp(half.tile).raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height, a = x => { let n = 0; for (let y = 0; y < H; y++) n += data[(y * W + x) * 4 + 3] > 0 ? 1 : 0; return n; };
  assert.ok(Math.abs(a(0) - a(W - 1)) <= H * .05);
  const m = await sharp(mirror.tile).stats(); assert.ok(m.channels[3].min === 255, 'a ground fills the tile');
});

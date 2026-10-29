import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { separate, findInks, halftone, choke } from '../src/lab-separate.js';
import { digitize, dstOf, expOf, readDst, stitchSvg, digitizeOptions } from '../src/lab-digitize.js';

const svg = s => sharp(Buffer.from(s)).png().toBuffer();
const rgba = async (png, w) => { const { data, info } = await sharp(png).ensureAlpha().resize(w ? { width: w } : undefined).raw().toBuffer({ resolveWithObject: true }); return { data, W: info.width, H: info.height }; };
// a badge: black ring, cream inside, red lettering, a small yellow star (about 1%), thin navy text (well under 1%)
const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><circle cx="600" cy="600" r="560" fill="#111111"/><circle cx="600" cy="600" r="470" fill="#f4f1ea"/><text x="600" y="660" font-family="DejaVu Sans" font-weight="bold" font-size="190" text-anchor="middle" fill="#c8202a">BASICS</text><polygon points="600,180 625,250 700,250 640,292 662,362 600,320 538,362 560,292 500,250 575,250" fill="#f2c200"/><text x="600" y="900" font-family="DejaVu Sans" font-size="60" text-anchor="middle" fill="#1d3f8a">EST 2024</text></svg>`;

test('separation: every colour that fills an area keeps its ink, however small; soft edges are not inks', async () => {
  for (const w of [600, 1200, 2400]) {
    const { data, W, H } = await rgba(await svg(BADGE), w), inks = findInks(data, W * H, { width: W });
    assert.equal(inks.length, 5, `${w}px: ${inks.map(i => i.hex).join()}`);
    for (const want of ['#111111', '#c8202a', '#f2c200', '#1d3f8a']) assert.ok(inks.some(i => Math.abs(parseInt(i.hex.slice(1, 3), 16) - parseInt(want.slice(1, 3), 16)) < 12 && Math.abs(parseInt(i.hex.slice(5, 7), 16) - parseInt(want.slice(5, 7), 16)) < 12), `${w}px has ${want}`);
  }
  // grey between black and white is an ink when it fills an area; a resampled edge of mid-grey is not
  const bars = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect x="0" width="200" height="300" fill="#000"/><rect x="200" width="200" height="300" fill="#8a8a8a"/><rect x="400" width="200" height="300" fill="#fff"/></svg>');
  let r = await rgba(bars); assert.equal(findInks(r.data, r.W * r.H, { width: r.W }).length, 3);
  const edge = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#fff"/><rect x="200" y="170" width="200" height="60" fill="#111"/></svg>');
  r = await rgba(edge, 1200); assert.equal(findInks(r.data, r.W * r.H, { width: r.W }).length, 2, 'the grey line a 2× resample leaves along the bar is not an ink');
});

test('separation: a gradient is two inks shared as tones; soft edges go to one ink; a JPG background is left out but white inside the art is not', async () => {
  const grad = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#f6a623"/><stop offset="1" stop-color="#c2185b"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/></svg>');
  let r = await rgba(grad), s = separate(r.data, r.W, r.H, { dropBackground: false });
  assert.equal(s.inks.length, 2); assert.ok(s.tonal > .6, String(s.tonal));
  const mid = 150 * r.W + 200; assert.ok(Math.abs(s.cover[0][mid] + s.cover[1][mid] - 255) <= 2 && s.cover[0][mid] > 60 && s.cover[1][mid] > 60, 'the middle is a mix of both');
  const badge = await rgba(await svg(BADGE)), b = separate(badge.data, badge.W, badge.H, {});
  assert.equal(b.tonal, 0, 'a flat badge has no tones: every edge pixel goes to one ink');
  for (let p = 0; p < badge.W * badge.H; p++) for (const c of b.cover) assert.ok(c[p] === 0 || c[p] === 255);
  const jpg = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#fff"/><rect x="100" y="100" width="700" height="400" rx="40" fill="#0b6e4f"/><text x="450" y="340" font-family="DejaVu Sans" font-weight="bold" font-size="120" text-anchor="middle" fill="#fff">GREEN</text></svg>')).jpeg({ quality: 80 }).toBuffer();
  r = await rgba(jpg); s = separate(r.data, r.W, r.H, {});
  assert.equal(s.inks.length, 2, 'JPEG noise makes no extra inks'); assert.equal(s.background, s.inks.find(i => i.background).hex);
  assert.equal(s.hard[5 * r.W + 5], -1, 'the white around the art is not printed');
  const white = s.inks.findIndex(i => i.background); assert.ok(s.cover[white].some(v => v === 255), 'the white lettering inside still prints');
  // the garment's own colour is not printed
  r = await rgba(await svg(BADGE)); s = separate(r.data, r.W, r.H, { garment: '#141414' }); assert.ok(s.inks.find(i => i.hex === '#111111').knockout);
});

test('a halftone holds the tone it screens, and a choke pulls a mask in all round', () => {
  const W = 300, H = 300, cov = new Uint8Array(W * H);
  for (const t of [.2, .5, .8]) { cov.fill(Math.round(t * 255)); const d = halftone(cov, W, H, { lpi: 55, dpi: 300, angle: 22.5 }); const got = d.reduce((s, v) => s + v, 0) / d.length; assert.ok(Math.abs(got - t) < .06, `${t} → ${got}`); }
  const m = new Uint8Array(100 * 100); for (let y = 20; y < 80; y++) for (let x = 20; x < 80; x++) m[y * 100 + x] = 255;
  const c = choke(m, 100, 100, 2); assert.equal(c[50 * 100 + 20], 0); assert.equal(c[50 * 100 + 21], 0); assert.equal(c[50 * 100 + 22], 255); assert.equal(c[50 * 100 + 50], 255);
});

test('digitizing: lettering and thin shapes as satin, wide areas as fill over an underlay, each thread in turn, with ties and trims', async () => {
  const d = await digitize(await svg(BADGE), { widthIn: 4 });
  assert.equal(d.threads.length, 5); assert.equal(d.stats.colourChanges, 4);
  assert.deepEqual([d.widthMm, d.heightMm], [101.6, 101.6]);
  const kinds = d.objects.reduce((m, o) => ({ ...m, [o.kind]: (m[o.kind] || 0) + 1 }), {});
  assert.ok(kinds.fill >= 2 && kinds.satin >= 10, JSON.stringify(kinds)); // the ring and the cream are fills; the letters, star and small text satin
  assert.ok(d.objects.filter(o => o.kind === 'satin').every(o => o.widthMm <= 7));
  assert.ok(d.stats.stitches > 6000 && d.stats.stitches < 20000, String(d.stats.stitches));
  assert.ok(d.stats.trims >= 15 && d.stats.trims < 90, `trims ${d.stats.trims}: one per separate shape, not one per row`);
  assert.ok(d.warnings.some(w => /under 1 mm/.test(w)), 'the 4 mm-high text is flagged as too thin');
  // every stitch a machine can sew: none longer than the split length plus the pull, none under 0.3 mm except the lock stitches
  for (const b of d.plan) { let prev = null; for (const q of b.pts) { if (prev && !q.jump && !q.trim && !q.tie && !prev.trim) { const L = Math.hypot(q.p[0] - prev[0], q.p[1] - prev[1]); assert.ok(L <= 76, `stitch of ${L / 10} mm`); } prev = q.p; } }
  assert.ok(d.plan.every(b => b.pts.some(q => q.tie)), 'lock stitches in every thread');
  assert.ok(d.plan.every(b => b.pts.at(-1).trim), 'every thread ends in a trim');
});

test('the settings change the design: density, underlay, satin width and the garment colour', async () => {
  const art = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect x="20" y="20" width="760" height="230" rx="20" fill="#1d3f8a"/><rect x="60" y="300" width="680" height="30" fill="#c8202a"/></svg>');
  const std = await digitize(art, { widthIn: 4 }), light = await digitize(art, { widthIn: 4, rowMm: .6 }), bare = await digitize(art, { widthIn: 4, underlay: false });
  assert.ok(light.stats.stitches < std.stats.stitches * .8 && bare.stats.stitches < std.stats.stitches);
  assert.deepEqual(std.objects.map(o => o.kind), ['fill', 'satin'], 'the bar (3.8 mm) is satin');
  const narrow = await digitize(art, { widthIn: 4, satinMaxMm: 3 }); assert.deepEqual(narrow.objects.map(o => o.kind), ['fill', 'fill']);
  const onNavy = await digitize(art, { widthIn: 4, garment: '#1d3f8a' }); assert.equal(onNavy.threads.length, 1, 'the navy is the garment: only the red is sewn'); assert.deepEqual(onNavy.knockouts, ['#1d3f8a']);
  // pull compensation: the fill reaches past the art's edge by about the pull
  const xs = std.plan[0].pts.filter(q => !q.jump && !q.trim).map(q => q.p[0]), artHalf = 760 / 800 * 1016 / 2;
  assert.ok(Math.max(...xs) > artHalf && Math.max(...xs) < artHalf + 6, `${Math.max(...xs)} vs ${artHalf}`);
  assert.deepEqual(digitizeOptions({ rowMm: '9', fillAngle: '135', underlay: false, junk: 1 }), { fillAngle: 135, rowMm: 1, underlay: false });
});

test('the files: a Tajima DST that reads back stitch for stitch, a Melco EXP, and a preview', async () => {
  const d = await digitize(await svg(BADGE), { widthIn: 3 });
  const dst = dstOf(d, 'Badge'), head = dst.file.subarray(0, 512).toString('latin1'), back = readDst(dst.file);
  assert.match(head, /^LA:Badge/); assert.match(head, /CO:  4/); assert.equal((dst.file.length - 512) % 3, 0);
  assert.equal(back.filter(m => m.kind === 'color').length, 4); assert.equal(back.at(-1).kind, 'end');
  assert.equal(back.filter(m => m.kind === 'stitch').length, dst.stitches);
  const last = d.plan.at(-1).pts.at(-1).p, end = back.at(-2); assert.deepEqual([end.x, end.y], last);
  let px = 0, py = 0; for (const m of back) { assert.ok(Math.abs(m.x - px) <= 121 && Math.abs(m.y - py) <= 121); px = m.x; py = m.y; }
  // EXP: two signed bytes a stitch; walk it back and land where the design ends
  const e = expOf(d).file; let x = 0, y = 0, colours = 0;
  for (let i = 0; i < e.length;) { if (e[i] === 0x80) { if (e[i + 1] === 0x01) { colours++; i += 4; continue; } i += 2; } const s8 = v => (v > 127 ? v - 256 : v); x += s8(e[i]); y -= s8(e[i + 1]); i += 2; }
  assert.equal(colours, 4); assert.deepEqual([x, y], last);
  const pic = await sharp(Buffer.from(stitchSvg(d, { px: 400, garment: '#222222' }))).png().toBuffer(); assert.equal((await sharp(pic).metadata()).width, 400);
});

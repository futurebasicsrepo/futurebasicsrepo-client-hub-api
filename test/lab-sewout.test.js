import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { digitize } from '../src/lab-digitize.js';
import { sewoutPng, sewoutFrames, decodeFrames, digitizeReview } from '../src/lab-sewout.js';

const svg = s => sharp(Buffer.from(s)).png().toBuffer();
const CIRCLE = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"><circle cx="400" cy="400" r="380" fill="#c8202a"/></svg>';
// a two-colour badge with lettering
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect x="20" y="20" width="1160" height="760" rx="60" fill="#14284b"/><text x="600" y="500" font-family="DejaVu Sans" font-weight="bold" font-size="260" text-anchor="middle" fill="#e8b923">FB</text></svg>';

test('the sew-out renders as a picture of the size asked, on any fabric; jumps and trims are not drawn', async () => {
  const d = await digitize(await svg(LOGO), { widthIn: 2.5 });
  const png = await sewoutPng(d, { px: 600, garment: '#2b2b2e', fabric: 'woven' }), meta = await sharp(png).metadata();
  assert.equal(meta.format, 'png'); assert.equal(meta.width, 600);
  const ratio = d.heightMm / d.widthMm; assert.ok(Math.abs(meta.height / meta.width - ratio) < .08, `${meta.height}/${meta.width} vs ${ratio}`);
  const jpg = await sewoutPng(d, { px: 400, fabric: 'fleece', format: 'jpeg' }); assert.equal((await sharp(jpg).metadata()).format, 'jpeg');
  // thread where the design is, the garment colour round it
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true }), px = (x, y) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
  const corner = px(5, 5); assert.ok(Math.abs(corner[0] - 0x2b) < 30 && Math.abs(corner[2] - 0x2e) < 30, `corner ${corner}`);
  let gold = 0, navy = 0; for (let i = 0; i < data.length; i += 3) { if (data[i] > data[i + 2] + 60) gold++; else if (data[i + 2] > data[i] + 25) navy++; }
  const n = data.length / 3; assert.ok(gold / n > .02 && navy / n > .3, `gold ${gold / n}, navy ${navy / n}`);
});

test('frames: a compact stitch stream that decodes to the plan, stitch for stitch', async () => {
  const d = await digitize(await svg(LOGO), { widthIn: 2.5 }), f = sewoutFrames(d), rec = decodeFrames(f.s);
  assert.equal(rec.length, f.records); assert.equal(f.colours.length, d.plan.length);
  assert.equal(rec.filter(r => r[2] === 0).length, d.stats.stitches); assert.equal(f.stitches, d.stats.stitches);
  assert.equal(rec.filter(r => r[2] === 2).length, d.stats.trims); assert.equal(rec.filter(r => r[2] === 3).length, d.stats.colourChanges);
  const last = d.plan.at(-1).pts.at(-1).p; assert.deepEqual(rec.at(-1).slice(0, 2), last);
  assert.ok(f.s.length < rec.length * 8 + 8, 'six bytes a move, as base64');
});

test('review: a clean bold shape is ready to sew, and the stitches match the art', async () => {
  const art = await svg(CIRCLE), d = await digitize(art, { widthIn: 3 }), r = await digitizeReview(d, art, { widthIn: 3 });
  assert.ok(r.fidelity.iou > .8, JSON.stringify(r.fidelity)); assert.ok(r.fidelity.coverage > .9);
  assert.equal(r.verdict, 'ready', JSON.stringify(r.items.filter(i => i.level !== 'ok')));
  assert.ok(r.score >= 90); assert.ok(r.items.some(i => i.code === 'stitches' && /750/.test(i.text))); assert.ok(r.items.some(i => i.code === 'hoop' && /4×4/.test(i.text)));
});

test('review: small lettering and an over-dense fill are flagged, each with a fix the studio can apply', async () => {
  const small = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><text x="600" y="180" font-family="DejaVu Sans" font-weight="bold" font-size="56" text-anchor="middle" fill="#111111">FUTURE BASICS</text></svg>');
  let d = await digitize(small, { widthIn: 4 }), r = await digitizeReview(d, small, { widthIn: 4 });
  const t = r.items.find(i => i.code === 'small-text'); assert.ok(t && t.level !== 'ok', JSON.stringify(r.items.map(i => i.code)));
  assert.ok(t.fix.widthIn > 4 && t.fix.widthIn <= 16); assert.notEqual(r.verdict, 'ready');
  const block = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect x="10" y="10" width="780" height="480" fill="#1d3f8a"/></svg>');
  d = await digitize(block, { widthIn: 3, rowMm: .25 }); r = await digitizeReview(d, block, { widthIn: 3 });
  const dn = r.items.find(i => i.code === 'density-high'); assert.ok(dn, JSON.stringify(r.items.map(i => i.code))); assert.deepEqual(dn.fix, { rowMm: .4 });
  const ok = await digitizeReview(await digitize(block, { widthIn: 3 }), block, { widthIn: 3 }); assert.ok(!ok.items.some(i => i.code === 'density-high'));
  // open fill: the fabric shows
  r = await digitizeReview(await digitize(block, { widthIn: 3, rowMm: .9 }), block, { widthIn: 3 }); assert.ok(r.items.some(i => i.code === 'density-low' && i.fix.rowMm === .4));
});

test('the sew-out of a 4 in, 10k-stitch design renders in good time', async () => {
  const art = await svg('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><circle cx="600" cy="600" r="560" fill="#14284b"/><circle cx="600" cy="600" r="455" fill="none" stroke="#e8b923" stroke-width="44"/><text x="600" y="680" font-family="DejaVu Sans" font-weight="bold" font-size="220" text-anchor="middle" fill="#e8b923">FB</text></svg>');
  const d = await digitize(art, { widthIn: 4 }); assert.ok(d.stats.stitches > 8000, String(d.stats.stitches));
  const t = Date.now(); await sewoutPng(d, { px: 1400 }); const ms = Date.now() - t;
  assert.ok(ms < 4000, `${ms} ms`); // ~1 s on a laptop; generous for a loaded CI box
});

test('POST /v1/lab/studio/embroidery: the sew-out preview, the review and the playback frames, with the fields it always had', async () => {
  const { registerLabStudioRoutes } = await import('../src/lab-studio-routes.js');
  const routes = {}, app = new Proxy({}, { get: (_, k) => (path, opts, h) => { routes[`${String(k).toUpperCase()} ${path}`] = h || opts; } });
  registerLabStudioRoutes(app, { pool: { query: async () => ({ rows: [] }) }, authenticate: () => {}, adminOnly: () => {} });
  const reply = { header() { return this; }, code() { return this; }, send(x) { return x; } };
  const r = await routes['POST /v1/lab/studio/embroidery']({ body: { image: `data:image/png;base64,${(await svg(LOGO)).toString('base64')}`, widthIn: 3, fabric: 'twill' } }, reply);
  for (const k of ['widthMm', 'heightMm', 'stitches', 'jumps', 'stats', 'colours', 'threads', 'objects', 'warnings', 'settings']) assert.ok(k in r, k);
  assert.match(r.preview, /^data:image\/jpeg;base64,/); assert.equal(r.fabric, 'twill');
  assert.ok(['ready', 'check', 'fix'].includes(r.review.verdict) && r.review.items.length > 2 && r.review.fidelity.iou > .8);
  assert.equal(decodeFrames(r.frames.s).filter(m => m[2] === 0).length, r.stats.stitches);
});

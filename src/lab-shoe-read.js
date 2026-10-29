// Reading a shoe from its picture (a concept's picture, AI-made or a photo), so its last and its upper's pattern follow what was designed:
//   silhouette(buffer)          → the shoe's outline in the picture (separated from a plain background): its box, which way the toe points, and
//                                 its top and bottom edges from the heel to the toe. No AI: works on any side view.
//   shapeOf(sil, lengthIn, sole) → what the outline says in inches on the last: the collar height at the back above the insole (the outline's
//                                 height there less the sole's thickness at the heel), a shaft, the dip at the ankle, the toe spring, and a
//                                 style it suggests
//   readShoe(buffer, opts)      → the vision model's reading (style, toe, toe cap, mudguard, upper, sole, eyelets, where the vamp and the lacing
//                                 sit, the colours of each part), when Claude is connected
//   proposal(spec, sil, vision) → the footwear choices the picture asks for, and what each came from
import sharp from 'sharp';
import { FW_STYLES, TOES, UPPERS, SOLES, cleanFootwear, lastOf, soleHeightOf } from './lab-footwear.js';

const r8 = v => Math.round(v * 8) / 8, HEX = /^#[0-9a-f]{6}$/i;
export async function silhouette(buf, { width = 600 } = {}) {
  const meta = await sharp(buf).metadata(), k = Math.min(1, width / (meta.width || width));
  const { data, info } = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: Math.round((meta.width || width) * k) }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, px = (x, y) => { const i = (y * W + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  // the background: the middle of the border's colours
  const border = []; for (let x = 0; x < W; x += 3) border.push(px(x, 0), px(x, H - 1)); for (let y = 0; y < H; y += 3) border.push(px(0, y), px(W - 1, y));
  const med = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[border.length >> 1]);
  const on = (x, y) => { const [r, g, b] = px(x, y); return Math.hypot(r - med[0], g - med[1], b - med[2]) > 46; };
  const cols = []; for (let x = 0; x < W; x++) { let top = -1, bottom = -1, n = 0; for (let y = 0; y < H; y++) if (on(x, y)) { if (top < 0) top = y; bottom = y; n++; } cols.push(n > H * .015 ? { top, bottom } : null); }
  // the longest run of columns with the shoe in them (a stray speck or a caption is left out)
  let best = [0, -1], cur = null; for (let x = 0; x <= W; x++) { if (x < W && cols[x]) { if (cur == null) cur = x; } else if (cur != null) { if (x - 1 - cur > best[1] - best[0]) best = [cur, x - 1]; cur = null; } }
  const [x0, x1] = best; if (x1 - x0 < W * .2) return null;
  const run = cols.slice(x0, x1 + 1), y0 = Math.min(...run.map(c => c.top)), y1 = Math.max(...run.map(c => c.bottom)), len = x1 - x0 + 1, hgt = y1 - y0 + 1;
  // which way the toe points: the toe end is the low one (the collar, or the shaft, stands at the heel)
  const avgH = (a, b) => { const s = run.slice(Math.floor(a * len), Math.max(Math.floor(a * len) + 1, Math.floor(b * len))); return s.reduce((t, c) => t + (c.bottom - c.top), 0) / s.length; };
  const toeLeft = avgH(0, .15) < avgH(.85, 1);
  // the edges from the heel (0) to the toe (1), as heights over the ground, in shoe lengths
  const N = 48, profile = Array.from({ length: N + 1 }, (_, i) => { const t = i / N, x = toeLeft ? x1 - Math.round(t * (len - 1)) : x0 + Math.round(t * (len - 1)), c = cols[x] || run[0]; return { t, top: (y1 - c.top) / len, bottom: (y1 - c.bottom) / len }; });
  const area = run.reduce((t, c) => t + (c.bottom - c.top), 0) / (len * hgt);
  return { imgW: Math.round(W / k), imgH: Math.round(H / k), x0: Math.round(x0 / k), y0: Math.round(y0 / k), x1: Math.round(x1 / k), y1: Math.round(y1 / k), toeLeft, aspect: len / hgt, fill: area, profile, background: '#' + med.map(v => v.toString(16).padStart(2, '0')).join('') };
}
// is it a side view at all? A shoe from the side is 1¼ (a boot) to 4½ times as long as it is tall and fills most of its box
export const sideView = sil => Boolean(sil && sil.aspect > 1.15 && sil.aspect < 4.8 && sil.fill > .38);
export function shapeOf(sil, lengthIn, sole = 0) {
  if (!sideView(sil)) return null;
  const P = sil.profile, at = (t, k) => { const i = Math.min(P.length - 1, Math.max(0, Math.round(t * (P.length - 1)))); return P[i][k] * lengthIn; };
  // the collar just in front of where a pull tab stands up at the back
  const collar = Math.max(...P.filter(p => p.t >= .07 && p.t <= .11).map(p => p.top)) * lengthIn - sole;
  const dip = Math.min(...P.filter(p => p.t >= .12 && p.t <= .42).map(p => p.top)) * lengthIn - sole;
  const spring = Math.max(0, at(.985, 'bottom'));
  const toeTop = at(.9, 'top');
  return { collar: r8(collar), ankleDip: r8(dip), shaft: collar > 3.6, spring: r8(Math.min(spring, 1.4)), toeHeight: r8(toeTop - sole), sole: r8(sole), suggests: collar > 5.6 ? 'boot' : collar > 3.7 ? 'hightop' : null };
}

// ---- the vision model's reading ----
export const READ_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['footwear', 'view', 'style', 'toe', 'toeCap', 'mudguard', 'heelOverlay', 'upper', 'sole', 'eyelets', 'vamp', 'throat', 'collarIn', 'heelIn', 'soleIn', 'colours', 'why'],
  properties: {
    footwear: { type: 'boolean', description: 'the picture shows a shoe or a boot' },
    view: { type: 'string', enum: ['side', 'three-quarter', 'front', 'top', 'sole', 'other'] },
    style: { type: 'string', enum: Object.keys(FW_STYLES) }, toe: { type: 'string', enum: Object.keys(TOES) },
    toeCap: { type: 'boolean' }, mudguard: { type: 'boolean', description: 'a low overlay running round the foot just above the sole' }, heelOverlay: { type: 'boolean' },
    upper: { type: 'string', enum: Object.keys(UPPERS) }, sole: { type: 'string', enum: Object.keys(SOLES) },
    eyelets: { type: 'integer', description: 'eyelets a side, 0 when it has no laces' },
    vamp: { type: 'number', description: 'where the vamp (the front piece over the toes) meets the quarters at the sole, as a share of the shoe\'s length from the heel, 0.4 to 0.75' },
    throat: { type: 'number', description: 'where the lace opening (or the topline) starts behind the instep, as a share of the length from the heel, 0.1 to 0.6' },
    collarIn: { type: 'number', description: 'height of the collar at the back of the heel above the ground, in inches, for a men\'s US 9' },
    heelIn: { type: 'number', description: 'how much the heel sits above the ball inside the shoe (the heel-to-toe drop or heel height), in inches' },
    soleIn: { type: 'number', description: 'the sole unit\'s thickness at the heel, in inches' },
    colours: { type: 'object', additionalProperties: false, required: ['upper', 'overlay', 'sole', 'lining'], properties: { upper: { type: 'string' }, overlay: { type: 'string' }, sole: { type: 'string' }, lining: { type: 'string' } } },
    why: { type: 'string', description: 'one sentence on what you see' }
  }
};
export async function readShoe(buf, { ask, name = '' } = {}) {
  if (!ask) return null;
  const jpeg = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  return ask('You are a footwear developer reading a design picture so its last and its upper pattern can be drafted. Read the shoe as it is drawn, part by part: its style, toe shape, the pieces of its upper and where their seams sit along its length, its sole and its heel, and the colour of each part. Judge proportions as if it were a men\'s US 9.',
    [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: `The design is called "${String(name).slice(0, 80)}". Styles: ${Object.entries(FW_STYLES).map(([k, v]) => `"${k}" ${v.label}`).join('; ')}.` }],
    READ_SCHEMA);
}

// ---- the proposal: the choices the picture asks for, each with where it came from ----
export function proposal(spec, sil, vision) {
  const base = cleanFootwear(spec), from = {}, next = { ...base };
  const set = (k, v, src) => { if (v == null || v === '' || Number.isNaN(v)) return; next[k] = v; from[k] = src;
    // a new style brings its own heel, toe spring and toe, until the picture says otherwise
    if (k === 'style' && v !== base.style) { const S = FW_STYLES[v]; next.heel = S.heel; next.spring = S.spring; next.toe = S.toe; } };
  const v = vision && vision.footwear !== false ? vision : null;
  if (v) {
    set('style', FW_STYLES[v.style] ? v.style : null, 'picture (AI)');
    const S = FW_STYLES[next.style];
    set('toe', TOES[v.toe] ? v.toe : null, 'picture (AI)'); set('toeCap', typeof v.toeCap === 'boolean' ? v.toeCap : null, 'picture (AI)'); set('mudguard', typeof v.mudguard === 'boolean' ? v.mudguard : null, 'picture (AI)'); set('heelOverlay', typeof v.heelOverlay === 'boolean' ? v.heelOverlay : null, 'picture (AI)');
    set('upper', UPPERS[v.upper] ? v.upper : null, 'picture (AI)'); set('sole', SOLES[v.sole] ? v.sole : null, 'picture (AI)');
    if (S.laced && v.eyelets >= 3) set('eyelets', Math.min(14, Math.round(v.eyelets)), 'picture (AI)');
    if (v.vamp >= .4 && v.vamp <= .75) set('vamp', Math.round(v.vamp * 100) / 100, 'picture (AI)'); if (v.throat >= .1 && v.throat <= .6) set('throat', Math.round(v.throat * 100) / 100, 'picture (AI)');
    if (v.collarIn > 1.5 && v.collarIn < 10) set('collar', r8(v.collarIn), 'picture (AI)'); if (v.heelIn >= 0 && v.heelIn <= 4) set('heel', r8(v.heelIn), 'picture (AI)'); if (v.soleIn > .25 && v.soleIn < 2.5) set('soleHeight', r8(v.soleIn), 'picture (AI)');
    const c = Object.fromEntries(['upper', 'overlay', 'sole', 'lining'].filter(k => HEX.test(String(v.colours?.[k] || ''))).map(k => [k, String(v.colours[k]).toLowerCase()])); if (Object.keys(c).length) set('colours', c, 'picture (AI)');
  }
  // the outline measures what the eye guesses: the collar, the toe spring, and a style when only the shape can say it
  // the outline is from the ground: the sole's thickness at the heel (as the eye read it, or the style's usual sole) comes off the collar
  const L = lastOf(next).length + .3, sole = soleHeightOf(next), sh = sideView(sil) ? shapeOf(sil, L, sole) : null;
  if (sh) {
    if (!v && sh.suggests && !FW_STYLES[base.style]?.shaft) { set('style', sh.suggests, 'picture (shape)'); const s2 = soleHeightOf(next); if (s2 !== sole) Object.assign(sh, shapeOf(sil, L, s2)); }
    set('collar', sh.collar, 'picture (shape)');
    set('spring', Math.min(1.25, Math.max(.125, sh.spring)), 'picture (shape)');
  }
  if (sil) next.picture = { imgW: sil.imgW, imgH: sil.imgH, x0: sil.x0, y0: sil.y0, x1: sil.x1, y1: sil.y1, toeLeft: sil.toeLeft, at: new Date().toISOString().slice(0, 19) };
  const out = cleanFootwear(next);
  const changes = Object.keys(from).filter(k => JSON.stringify(out[k]) !== JSON.stringify(base[k])).map(k => ({ key: k, from: base[k] ?? null, to: out[k], source: from[k] }));
  return { spec: out, from, changes, shape: sh, side: sideView(sil), why: v?.why || '' };
}

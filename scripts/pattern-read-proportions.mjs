// The tops' proportions traced off their sketches: no AI, the same numbers every run.
//
// A sketch's widths and angles are its design: a dropped, wide shoulder, a short sleeve held out or hanging, a narrow or a wide opening. Each
// top in the library is drafted as a new piece would be (fitToTemplate), then its shoulder, armhole, sleeve length and the
// angle the sleeve is drawn at are moved, one at a time, in steps that halve, to whatever lays the pattern (put together, as the product
// shows it) closest over the flat drawing as it is shown (drawingOf, in inches): the overlap of the two outlines on a ½ in grid. What helped
// by a point or more is kept, as the change from the style's own measurements, in src/lab-template-proportions.js, which fitToTemplate
// applies to a piece started from that sketch. The length is not traced here: the pack draws its pieces long (by a fifth to a half), so a
// length read off the drawing alone would cut every piece too long; fitToTemplate takes it from the sketch's ratio against its style's.
//
//   node scripts/pattern-read-proportions.mjs [--style tee,polo] [--only id,…]     → src/lab-template-proportions.js (merged into what is there)
import { writeFileSync, existsSync } from 'node:fs';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate, STYLES, drawingOf } from '../src/lab-flats.js';
import { garmentPattern, assembled, boundsOf } from '../src/lab-pattern.js';
import { TEMPLATE_PROPORTIONS } from '../src/lab-template-proportions.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] || d; };
const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const STY = list(arg('style')), ONLY = list(arg('only')), OUT = new URL('../src/lab-template-proportions.js', import.meta.url);
const KEEP = { ...TEMPLATE_PROPORTIONS }; for (const k of Object.keys(TEMPLATE_PROPORTIONS)) delete TEMPLATE_PROPORTIONS[k]; // trace from the style's own start

const inside = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
function fill(polys, B, step, nx, ny) { const m = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) { const y = B.y0 + (j + .5) * step; for (let i = 0; i < nx; i++) { const x = B.x0 + (i + .5) * step; for (const P of polys) if (inside(P, x, y)) { m[j * nx + i] = 1; break; } } } return m; }
// the sketch in inches: across as the flats lay it (by its chest), down so its body is the piece's length (the pack draws long; the length is
// not what is traced here, and a stretched body would pull the shoulder and the sleeve to make up for it)
const sketchOf = p => { const d = drawingOf(p, 'front'), c = d?.v?.clip; if (!Array.isArray(c) || c.length < 6 || !(d.v.hemY > d.v.hpsY)) return null; const sy = (d.v.hemY - d.v.hpsY) / p.m.length; return [c.map(([x, y]) => [(x - d.ox) / d.sx, (y - d.oy) / sy])]; };
const outlineOf = pat => assembled(pat).pieces.filter(x => x.piece.place.view !== 'back' && !x.piece.hidden && x.pts.length >= 3 && boundsOf(x.pts).w * boundsOf(x.pts).h > .6).map(x => x.pts);
const step = .5;
// the overlap of the pattern over the sketch, in true inches: the sketch filled once, on a frame that holds anything the pattern can reach
function scorer(p) {
  const S = sketchOf(p); if (!S) return null; const bs = boundsOf(S.flat()), B = { x0: bs.x0 - 12, y0: bs.y0 - 6, x1: bs.x1 + 12, y1: bs.y1 + 12 }; B.w = B.x1 - B.x0; B.h = B.y1 - B.y0;
  const nx = Math.ceil(B.w / step), ny = Math.ceil(B.h / step), ms = fill(S, B, step, nx, ny);
  return q => { let pat; try { pat = garmentPattern(q); } catch { return 0; } const P = pat && outlineOf(pat); if (!P?.length) return 0;
    const mp = fill(P, B, step, nx, ny); let I = 0, U = 0; for (let k = 0; k < ms.length; k++) { I += ms[k] & mp[k]; U += ms[k] | mp[k]; } return U ? I / U : 0; };
}
const r4 = x => Math.round(x * 4) / 4;
const T = FLAT_TEMPLATES.filter(t => STYLES[t.style]?.kind === 'top' && (!STY.length || STY.includes(t.style)) && (!ONLY.length || ONLY.includes(t.id)));
const out = { ...KEEP }; let n = 0, better = 0;
for (const t of T) {
  const p0 = fitToTemplate({ ...defaultParams(t.style), template: t.id }), score = scorer(p0); if (!score) continue; n++;
  const m0 = p0.m, sleeved = m0.sleeve > 0, short = sleeved && m0.sleeve <= 12, nw = m0.neckWidth;
  // what is traced, each within what the piece can be: [key, start, low, high, first step]
  // (a shoulder from 3 in narrower to 4 wider, a dropped one, but not on a raglan, which has no shoulder seam; the armhole 1½ in either way; a
  // short sleeve 3 to 13 in, a long one within 4 in. Not the sleeve opening: it is cut to the arm, and a drawn end is narrower than it is)
  let raglan = false; try { raglan = garmentPattern(p0)?.construction?.sleeve === 'raglan'; } catch { }
  const knobs = [...(raglan ? [] : [['shoulder', m0.shoulder, Math.max(nw + 4, m0.shoulder - 3), Math.min(m0.chest * 1.25, m0.shoulder + 4), 1.5]]), ['armhole', m0.armhole, m0.armhole - 1.5, m0.armhole + 1.5, 1]];
  if (sleeved) knobs.push(['sleeve', m0.sleeve, short ? 3 : m0.sleeve - 4, short ? 13 : m0.sleeve + 4, 2], ['sleeveAngle', short ? 60 : 10, short ? 25 : 0, short ? 80 : 30, short ? 10 : 5]);
  const cur = Object.fromEntries(knobs.map(([k, v]) => [k, v])), make = c => { const { sleeveAngle, ...mm } = c; return { ...p0, m: { ...p0.m, ...mm }, options: { ...p0.options, ...(sleeved ? { sleeveAngle } : {}) } }; };
  const start = score(make(cur)); let best = start;
  for (let round = 0; round < 3; round++) for (const [k, , lo, hi, s0] of knobs) {
    let s = s0 / (round + 1);
    while (s >= .25) { let moved = false; for (const dir of [1, -1]) { const v = Math.min(Math.max(cur[k] + dir * s, lo), hi); if (v === cur[k]) continue; const sc = score(make({ ...cur, [k]: v })); if (sc > best + 1e-4) { best = sc; cur[k] = v; moved = true; break; } } if (!moved) s /= 2; }
  }
  const gain = Math.round((best - start) * 100);
  if (gain >= 1) { better++; const e = {}; for (const [k, v0] of knobs) { if (k === 'sleeveAngle') e.sleeveAngle = Math.round(cur[k]); else if (Math.abs(cur[k] - v0) >= .25) e[k] = r4(cur[k] - v0); } out[t.id] = e; }
  else delete out[t.id];
  console.log(`${t.id.padEnd(40)} ${Math.round(start * 100)} → ${Math.round(best * 100)}  ${JSON.stringify(out[t.id] || {})}`);
}
const keys = Object.keys(out).sort();
writeFileSync(OUT, `// Generated by scripts/pattern-read-proportions.mjs: each top's proportions traced off its sketch, as the change from its style's own
// measurements (inches) and the angle its sleeve is drawn at (degrees from hanging straight down). fitToTemplate applies them to a piece
// started from the sketch. Run the script again after the sketches or the drafting change; do not edit by hand.
export const TEMPLATE_PROPORTIONS = {
${keys.map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`).join('\n')}
};
`);
console.log(`${n} sketches traced, ${better} closer; ${keys.length} in src/lab-template-proportions.js`);

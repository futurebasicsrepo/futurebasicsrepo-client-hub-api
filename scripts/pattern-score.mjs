// The patterns scored against their sketches by measurement, not by eye: no AI, the same numbers every run.
//
// Silhouette. Every library sketch carries its garment's outline as a polygon (src/flat-templates, `clip`), which the flats map into inches
// (drawingOf: x from the centre front, y down from the high shoulder point or the top of the waistband). The pattern's outside pieces, put
// together as the product (as the Pattern page shows them), give the pattern's outline in the same inches. Both front views are filled on a
// ¼ in grid and compared three ways:
//   shape        the overlap (intersection over union) once the sketch is scaled to the pattern's width (both ways alike) from the top: the
//                silhouette and its length against its width, size aside
//   proportions  the width at 24 heights, each outline's widths against its own widest, compared: 100 is the same shape top to bottom
//   size         the overlap in true inches: how far the drafted size is from the size the sketch is drawn at (a sketch is stylised, so this
//                is reported, not scored)
// Features. What both vision models agreed each sketch shows (src/lab-template-construction.js: pockets, yokes, belt loops, a collar, a
// hood…) is checked against the pieces the pattern actually has. features = found / expected.
//
//   node scripts/pattern-score.mjs [--style pants,shorts] [--only id,…] [--out dir]     → <out>/score.json, <out>/score.html, a summary
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate, STYLES, drawingOf } from '../src/lab-flats.js';
import { garmentPattern, assembled, boundsOf } from '../src/lab-pattern.js';
import { TEMPLATE_CONSTRUCTION } from '../src/lab-template-construction.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] || d; };
const list = v => (v ? String(v).split(',').map(s => s.trim()).filter(Boolean) : []);
const OUT = arg('out', 'pattern-judge-out/score'), STY = list(arg('style')), ONLY = list(arg('only'));
mkdirSync(OUT, { recursive: true });

// ---- geometry ----
const inside = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// a set of polygons filled on a grid over a box → a Uint8Array mask
function fill(polys, B, step, nx, ny) { const m = new Uint8Array(nx * ny); for (let j = 0; j < ny; j++) { const y = B.y0 + (j + .5) * step; for (let i = 0; i < nx; i++) { const x = B.x0 + (i + .5) * step; for (const P of polys) if (inside(P, x, y)) { m[j * nx + i] = 1; break; } } } return m; }
const iou = (a, b) => { let I = 0, U = 0; for (let k = 0; k < a.length; k++) { I += a[k] & b[k]; U += a[k] | b[k]; } return U ? I / U : 0; };
const fit = (polys, B, to) => polys.map(P => P.map(([x, y]) => [to.x0 + (x - B.x0) / B.w * to.w, to.y0 + (y - B.y0) / B.h * to.h])); // into another box
function widths(mask, nx, ny, n = 24) { const out = []; for (let s = 0; s < n; s++) { const j = Math.min(ny - 1, Math.floor((s + .5) / n * ny)); let w = 0; for (let i = 0; i < nx; i++) w += mask[j * nx + i]; out.push(w); } const mx = Math.max(...out, 1); return out.map(w => w / mx); }

// the sketch's outline in inches, front view
function sketchOutline(p) {
  const d = drawingOf(p, 'front'), clip = d?.v?.clip; if (!Array.isArray(clip) || clip.length < 6) return null;
  return [clip.map(([x, y]) => [(x - d.ox) / d.sx, (y - d.oy) / d.sy])];
}
// the pattern's outline as the product shows it, front view: its outside pieces (not what is inside, not a button)
const patternOutline = pat => assembled(pat).pieces.filter(x => x.piece.place.view !== 'back' && !x.piece.hidden && x.pts.length >= 3 && boundsOf(x.pts).w * boundsOf(x.pts).h > .6).map(x => x.pts);

// ---- features: what the sketch was read to show, and the pieces that show the pattern has it ----
const pieceHas = (pat, re) => pat.pieces.some(q => re.test(`${q.id} ${q.name}`));
const FEATURES = [
  ['hood', k => k.hood === true, p => pieceHas(p, /hood/i)],
  ['collar', k => k.collar && !['none', 'rib'].includes(k.collar), p => pieceHas(p, /collar|lapel/i)],
  ['zip front', k => k.opening === 'zip', p => (p.trims || []).some(t => /zip/i.test(t.item)) || pieceHas(p, /zip/i)],
  ['buttons or snaps', k => ['buttons', 'snaps', 'placket'].includes(k.opening), p => (p.trims || []).some(t => /button|snap/i.test(t.item)) || pieceHas(p, /button|placket/i)],
  ['raglan sleeve', k => k.sleeve === 'raglan', p => pieceHas(p, /raglan/i)],
  ['sleeveless', k => k.sleeve === 'none', p => !pieceHas(p, /sleeve/i)],
  ['kangaroo pocket', k => (k.pockets || []).some(x => /kangaroo/.test(x)), p => pieceHas(p, /^pocket|kangaroo/i)],
  ['chest pocket', k => (k.pockets || []).some(x => /^chest/.test(x)), p => pieceHas(p, /chest/i)],
  ['welt or flap pockets', k => (k.pockets || []).some(x => /welt/.test(x)), p => pieceHas(p, /welt|flap/i)],
  ['patch hip pockets', k => (k.pockets || []).includes('patch-hip'), p => pieceHas(p, /patch|hip-pocket/i)],
  ['cargo pockets', k => (k.pockets || []).includes('cargo'), p => pieceHas(p, /cargo/i)],
  ['slash pockets', k => (k.pockets || []).includes('slash'), p => pieceHas(p, /pocket-opening|slash/i)],
  ['jeans scoop pockets', k => (k.pockets || []).includes('five-pocket'), p => pieceHas(p, /pocket-opening|scoop/i)],
  ['coin pocket', k => k.coinPocket === true, p => pieceHas(p, /coin/i)],
  ['no coin pocket', k => k.coinPocket === false && (k.pockets || []).includes('five-pocket'), p => !pieceHas(p, /coin/i)],
  ['back pockets', k => k.backPockets === true, p => pieceHas(p, /back-pocket|back welt/i)],
  ['no back pockets', k => k.backPockets === false, p => !pieceHas(p, /back-pocket/i)],
  ['front yoke', k => k.yoke?.front === true, p => pieceHas(p, /front-yoke/i)],
  ['back yoke', k => k.yoke?.back === true, p => pieceHas(p, /back-yoke|^yoke/i)],
  ['belt loops', k => k.beltLoops === true, p => pieceHas(p, /belt-loop/i)],
  ['elastic or drawcord waist', k => ['elastic', 'drawcord'].includes(k.waist), p => (p.trims || []).some(t => /elastic|drawcord/i.test(t.item))],
  ['front pleats', k => k.pleats > 0, p => pieceHas(p, /pleat/i) || p.pieces.some(q => (q.notes || []).some(n => /pleat/i.test(n)))],
  ['double knee', k => k.knee === 'double', p => pieceHas(p, /knee/i)],
  ['side stripe', k => k.panels === 'side-stripe', p => pieceHas(p, /stripe/i)],
  ['side panel', k => k.panels === 'side-panel', p => pieceHas(p, /side-panel/i)],
  ['sleeve stripe', k => k.panels === 'sleeve-stripe', p => pieceHas(p, /stripe/i)],
  ['rule pocket and hammer loop', k => k.utility === true, p => pieceHas(p, /rule-pocket|hammer/i)],
  ['curved hem', k => k.hem === 'curved', p => p.pieces.some(q => (q.notes || []).some(n => /curved hem/i.test(n)))],
  ['ankle cuffs', k => k.ankle === 'cuff', p => pieceHas(p, /cuff/i)],
  ['quilting', k => k.quilted === true, p => pieceHas(p, /quilt|fill|channel/i) || (p.trims || []).some(t => /insulation/i.test(t.item))],
  ['belt', k => k.belt === true, p => pieceHas(p, /^belt\b|belt /i) || (p.trims || []).some(t => /buckle/i.test(t.item))],
];

// ---- the run ----
let T = FLAT_TEMPLATES.filter(t => STYLES[t.style] && ['top', 'bottom'].includes(STYLES[t.style].kind));
if (STY.length) T = T.filter(t => STY.includes(t.style)); if (ONLY.length) T = T.filter(t => ONLY.includes(t.id));
const rows = [], step = .25;
for (const t of T) {
  const p = fitToTemplate({ ...defaultParams(t.style), template: t.id }); let pat;
  try { pat = garmentPattern(p); } catch (e) { rows.push({ id: t.id, style: t.style, label: t.label, error: e.message }); continue; }
  const S = sketchOutline(p), P = pat && patternOutline(pat); if (!S || !P?.length) { rows.push({ id: t.id, style: t.style, label: t.label, error: 'no outline' }); continue; }
  const bs = boundsOf(S.flat()), bp = boundsOf(P.flat());
  // size: both in true inches, on one grid over both
  const BU = { x0: Math.min(bs.x0, bp.x0), y0: Math.min(bs.y0, bp.y0), x1: Math.max(bs.x1, bp.x1), y1: Math.max(bs.y1, bp.y1) }; BU.w = BU.x1 - BU.x0; BU.h = BU.y1 - BU.y0;
  const nx = Math.ceil(BU.w / step), ny = Math.ceil(BU.h / step), size = iou(fill(S, BU, step, nx, ny), fill(P, BU, step, nx, ny));
  // shape: the sketch scaled to the pattern's width (the same in both directions, so a length drawn differently counts), from the top and
  // the centre front; filled on one grid over both
  const k = bp.w / bs.w, SS = S.map(Q => Q.map(([x, y]) => [x * k, bp.y0 + (y - bs.y0) * k])), bss = boundsOf(SS.flat());
  const B2 = { x0: Math.min(bss.x0, bp.x0), y0: Math.min(bss.y0, bp.y0), x1: Math.max(bss.x1, bp.x1), y1: Math.max(bss.y1, bp.y1) }; B2.w = B2.x1 - B2.x0; B2.h = B2.y1 - B2.y0;
  const n2x = Math.ceil(B2.w / step), n2y = Math.ceil(B2.h / step), ms = fill(SS, B2, step, n2x, n2y), mp = fill(P, B2, step, n2x, n2y), shape = iou(ms, mp);
  const ws = widths(ms, n2x, n2y), wp = widths(mp, n2x, n2y), proportions = 1 - ws.reduce((a, w, i) => a + Math.abs(w - wp[i]), 0) / ws.length;
  // the features
  const K = TEMPLATE_CONSTRUCTION[t.id] || null, exp = K ? FEATURES.filter(([, want]) => want(K)) : [], miss = exp.filter(([, , has]) => !has(pat)).map(([n]) => n);
  rows.push({ id: t.id, style: t.style, label: t.label, shape: Math.round(shape * 100), proportions: Math.round(proportions * 100), size: Math.round(size * 100),
    sizeRatio: { w: Math.round(bp.w / bs.w * 100) / 100, h: Math.round(bp.h / bs.h * 100) / 100 }, features: exp.length ? Math.round((exp.length - miss.length) / exp.length * 100) : null, expected: exp.map(([n]) => n), missing: miss, widths: { sketch: ws.map(w => Math.round(w * 100) / 100), pattern: wp.map(w => Math.round(w * 100) / 100) },
    svg: { S: SS, P } });
}
// ---- the report ----
const mean = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null), ok = rows.filter(r => !r.error);
const byStyle = Object.fromEntries([...new Set(ok.map(r => r.style))].map(s => { const l = ok.filter(r => r.style === s); return [s, { n: l.length, shape: mean(l.map(r => r.shape)), proportions: mean(l.map(r => r.proportions)), size: mean(l.map(r => r.size)), features: mean(l.map(r => r.features).filter(x => x != null)) }]; }));
const missingCount = {}; for (const r of ok) for (const m of r.missing) missingCount[m] = (missingCount[m] || 0) + 1;
const summary = { sketches: rows.length, errors: rows.filter(r => r.error).length, shape: mean(ok.map(r => r.shape)), proportions: mean(ok.map(r => r.proportions)), size: mean(ok.map(r => r.size)), features: mean(ok.map(r => r.features).filter(x => x != null)), byStyle, missing: Object.fromEntries(Object.entries(missingCount).sort((a, b) => b[1] - a[1])) };
writeFileSync(`${OUT}/score.json`, JSON.stringify({ summary, rows: rows.map(({ svg, ...r }) => r) }, null, 1));
// the page: each sketch's outline (red, scaled into the pattern's box) over the pattern's (grey), worst shape first
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const over = r => { const B = boundsOf([...r.svg.P.flat(), ...r.svg.S.flat()]), pad = 1, pts = P => P.map(([x, y]) => `${(x - B.x0 + pad).toFixed(2)},${(y - B.y0 + pad).toFixed(2)}`).join(' ');
  return `<svg viewBox="0 0 ${(B.w + pad * 2).toFixed(1)} ${(B.h + pad * 2).toFixed(1)}" width="220">${r.svg.P.map(P => `<polygon points="${pts(P)}" fill="#e6e1d6" stroke="#888" stroke-width=".08"/>`).join('')}${r.svg.S.map(P => `<polygon points="${pts(P)}" fill="none" stroke="#d33" stroke-width=".16"/>`).join('')}</svg>`; };
const sorted = [...ok].sort((a, b) => a.shape - b.shape);
writeFileSync(`${OUT}/score.html`, `<!doctype html><meta charset="utf-8"><title>Pattern score</title><style>body{font:14px system-ui;margin:24px;background:#f4f3ef;color:#141416}table{border-collapse:collapse}td,th{padding:4px 8px;text-align:right}td:first-child,th:first-child{text-align:left}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:20px}.c{background:#fff;border-radius:10px;padding:10px;font-size:12px}.c b{font-size:13px}.m{color:#b00}</style>
<h1>Pattern score · ${rows.length} sketches</h1><p>Shape ${summary.shape} · proportions ${summary.proportions} · size ${summary.size} · features ${summary.features} (out of 100). Red: the sketch's outline, scaled to the pattern's width; grey: the pattern as the product shows it.</p>
<table><tr><th>Style</th><th>n</th><th>Shape</th><th>Proportions</th><th>Size</th><th>Features</th></tr>${Object.entries(byStyle).sort((a, b) => a[1].shape - b[1].shape).map(([s, v]) => `<tr><td>${esc(s)}</td><td>${v.n}</td><td>${v.shape}</td><td>${v.proportions}</td><td>${v.size}</td><td>${v.features ?? '–'}</td></tr>`).join('')}</table>
<div class="g">${sorted.map(r => `<div class="c"><b>${esc(r.label)}</b><br>${esc(r.id)}<br>shape ${r.shape} · proportions ${r.proportions} · size ${r.size} · features ${r.features ?? '–'}${r.missing.length ? `<br><span class="m">missing: ${esc(r.missing.join(', '))}</span>` : ''}<br>${over(r)}</div>`).join('')}</div>`);
console.log(JSON.stringify({ ...summary, missing: Object.fromEntries(Object.entries(summary.missing).slice(0, 12)) }, null, 1));
console.log(`report: ${OUT}/score.html`);

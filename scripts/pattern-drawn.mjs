// Every top and bottom in the sketch library: its pattern, put together, laid over its flat's silhouette (src/lab-pattern-drawn.js), with how
// well the two match (the overlap of the two over their union) against the baseline. Writes a page of overlays to look at; exits non-zero
// when a piece has fallen more than DRAWN_SLACK below its baseline.
//   node scripts/pattern-drawn.mjs [--only id,…] [--out pattern-drawn] [--update-baseline]
// --update-baseline sets each piece's baseline to its fit now: run it after looking at the overlays, never to make a failing run pass.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate } from '../src/lab-flats.js';
import { garmentPattern, boundsOf } from '../src/lab-pattern.js';
import { drawnFit, drawnStyle, frontOf, DRAWN_BASELINE, DRAWN_SLACK } from '../src/lab-pattern-drawn.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1] || d; };
const ONLY = arg('only') ? arg('only').split(',') : null, OUT = arg('out', 'pattern-drawn'), UPDATE = process.argv.includes('--update-baseline');
const rows = [], tiles = [];
for (const t of FLAT_TEMPLATES.filter(t => drawnStyle(t.style) && (!ONLY || ONLY.includes(t.id)))) {
  const p = fitToTemplate({ ...defaultParams(t.style), template: t.id }), pat = garmentPattern(p, 'M'), fit = await drawnFit(p, pat); if (!fit) continue;
  const base = DRAWN_BASELINE[t.id], low = base != null && fit.iou < base - DRAWN_SLACK - 1e-9;
  rows.push({ id: t.id, style: t.style, ...fit, base, low });
  // the overlay: the flat's silhouette in blue, the pattern's pieces in black (the sleeves in red)
  const { S, P } = await frontOf(p, pat), pb = boundsOf(P.flatMap(x => x.pts));
  const B = { x0: Math.min(S.box.x0, pb.x0), y0: Math.min(S.box.y0, pb.y0), x1: Math.max(S.box.x1, pb.x1), y1: Math.max(S.box.y1, pb.y1) }, k = 240 / Math.max(B.x1 - B.x0, B.y1 - B.y0), q = .25;
  let cells = ''; for (let y = B.y0; y < B.y1; y += q) for (let x = B.x0; x < B.x1; x += q) if (S.inside(x + q / 2, y + q / 2)) cells += `M${((x - B.x0) * k).toFixed(1)} ${((y - B.y0) * k).toFixed(1)}h${(q * k).toFixed(2)}v${(q * k).toFixed(2)}h-${(q * k).toFixed(2)}z`;
  const pt = ([x, y]) => `${((x - B.x0) * k).toFixed(1)},${((y - B.y0) * k).toFixed(1)}`;
  tiles.push(`<figure class="${low ? 'low' : ''}"><svg viewBox="-4 -4 248 248" width="248" height="248"><path d="${cells}" fill="#a9d3e6"/>${P.map(x => `<polygon points="${x.pts.map(pt).join(' ')}" fill="none" stroke="${/sleeve|cuff/.test(x.id) ? '#d22' : '#222'}" stroke-width="1"/>`).join('')}</svg><figcaption><b>${t.id}</b><br>${fit.iou}${base != null ? ` · baseline ${base}` : ''} · flat not covered ${fit.missing} in² · outside the flat ${fit.extra} in²</figcaption></figure>`);
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'pattern-drawn.html'), `<!doctype html><meta charset="utf-8"><title>Patterns against their flats</title><style>body{font:13px/1.4 system-ui,sans-serif;margin:24px;background:#f6f6f3}main{display:flex;flex-wrap:wrap;gap:10px}figure{margin:0;padding:8px;background:#fff;border:1px solid #ddd;border-radius:8px;width:248px}figure.low{border-color:#d22;box-shadow:0 0 0 2px #d22}figcaption{font-size:11px;color:#555}</style><h1>Patterns against their flats</h1><p>Each pattern put together (black; sleeves red) over its flat sketch's silhouette (blue), size M. ${rows.filter(r => r.low).length} below their baseline.</p><main>${tiles.join('')}</main>`);
if (UPDATE) {
  const next = { ...DRAWN_BASELINE }; for (const r of rows) next[r.id] = r.iou;
  writeFileSync(new URL('../src/lab-pattern-drawn-baseline.json', import.meta.url), JSON.stringify(Object.fromEntries(Object.entries(next).sort()), null, 1) + '\n');
}
const by = {}; for (const r of rows) (by[r.style] ||= []).push(r.iou);
for (const [s, a] of Object.entries(by)) console.log(`${s.padEnd(11)} ${String(a.length).padStart(3)} pieces · fit ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2)} on average, ${Math.min(...a).toFixed(2)} at worst`);
for (const r of rows.filter(r => r.low)) console.log(`below its baseline · ${r.id} ${r.iou} (baseline ${r.base})`);
console.log(`${rows.length} tops and bottoms against their flats → ${join(OUT, 'pattern-drawn.html')}${UPDATE ? ' · baseline updated' : ''}`);
if (!UPDATE && rows.some(r => r.low)) process.exitCode = 1;

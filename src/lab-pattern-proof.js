// The cut-and-sew proof as a page (src/lab-pattern-check.js does the proving): for each product, its block with the two sides of every seam
// drawn in one colour and numbered, the seam and measurement tables, everything it is made with, and its cutting table. Shared by
// scripts/pattern-proof.mjs (the whole library) and the pattern routes (one product, in the factory package and from the Pattern page).
// No DOM, no Node: plain strings.
import { layoutOf, offsetOf, boundsOf, assembled } from './lab-pattern.js';
import { constructionCheck } from './lab-pattern-check.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const f1 = v => Math.round(v * 10) / 10;
// an outline thinned to what a drawing needs (a point every ~⅛ in of turn), in tenths of an inch
const thin = pts => { const out = []; for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > .12) out.push(p); } return out; };
const path = (pts, close = true) => pts.length ? 'M' + thin(pts).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + (close ? 'Z' : '') : '';
const fr = v => { const s = Math.sign(v), a = Math.abs(v), w = Math.floor(a + 1e-9), e = Math.round((a - w) * 8); const fx = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][e % 8]; const n = e === 8 ? w + 1 : w; return (s < 0 ? '−' : '') + (n || !fx ? n : '') + fx; };
const sgn = v => (v > 0 ? '+' : '') + fr(v);
// the seam colours: eight that tell apart on paper, for both themes
const INK = ['#d1495b', '#2e86ab', '#e89f2b', '#3a9d5d', '#8e5ad6', '#c2577f', '#1f9e9e', '#8a6d3b'];

const NAMES = { front: 'Front', back: 'Back', sleeve: 'Sleeve', side: 'Side body', top: 'Top sleeve', under: 'Under sleeve', panel: 'Crown panel', brim: 'Brim', crown: 'Crown top', band: 'Side band' };
function blocksOf(pat) { // the block pieces, flat, with a name each
  const out = []; const walk = (o, pre) => { for (const [k, v] of Object.entries(o || {})) if (v && Array.isArray(v.sew) && v.sew.length > 2) out.push({ name: (pre ? pre + ' ' : '') + (NAMES[k] || (v.name ? `${v.name}${v.cut > 1 ? ` (cut ${v.cut})` : ''}` : k)), blk: v }); else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'at') walk(v, k === 'brief' ? 'Brief' : ''); };
  walk(pat.block || pat.shell, ''); return out; // a bag: the pieces of its shell
}
// the block pieces side by side, each seam's two sides in its colour and its number at each side's middle
function sewnSvg(pat, c) {
  const B = blocksOf(pat); if (!B.length) return '';
  const at = new Map(), gap = 2.5, wide = Math.max(...B.map(b => boundsOf(b.blk.sew).w));
  // a garment's blocks stand in one row; a bag's long gussets go under its panels, a row as wide as the longest piece
  const rowW = pat.kind === 'bag' ? Math.max(wide, 30) : Infinity, fs0 = pat.kind === 'bag' ? Math.max(.6, Math.min(1.1, wide / 40)) : 0;
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const b of B) { const bb = boundsOf(b.blk.sew); if (x > 0 && x + bb.w > rowW) { y += rowH + gap + fs0 * 2.2; x = 0; rowH = 0; }
    at.set(b.blk, { dx: x - bb.x0, dy: y - bb.y0, bb, y }); b.pos = at.get(b.blk); x += bb.w + gap; rowH = Math.max(rowH, bb.h); W = Math.max(W, x - gap); }
  for (const b of B) b.pos.foot = Math.max(...B.filter(o => o.pos.y === b.pos.y).map(o => o.pos.y + o.pos.bb.h));
  const H = y + rowH, fs = fs0 || Math.max(.35, Math.min(1, Math.max(H, W / 3) / 14)), rr = fs * .62; // labels and markers to the drawing's size (a cap is a few inches, a coat a yard)
  let s = '';
  for (const b of B) { const { dx, dy, bb, foot } = b.pos; s += `<path class="blk" d="${path(b.blk.sew.map(([px, py]) => [px + dx, py + dy]))}"/><text class="bn" x="${f1(bb.x0 + dx + bb.w / 2)}" y="${f1(foot + fs * 1.6)}" style="font-size:${Math.round(fs * 100) / 100}px">${esc(b.name)}</text>`; }
  c.seams.forEach((sm, i) => { if (!sm.edges) return; const col = INK[i % INK.length];
    for (const e of sm.edges) { const p = at.get(e.block); if (!p) continue; const pts = e.pts.map(([px, py]) => [px + p.dx, py + p.dy]);
      s += `<path class="sm" stroke="${col}" stroke-width="${Math.round(rr * 68) / 100}" d="${path(pts, false)}"/>`;
      const mid = pts[Math.floor(pts.length / 2)]; s += `<g class="tag"><circle cx="${f1(mid[0])}" cy="${f1(mid[1])}" r="${Math.round(rr * 100) / 100}" fill="${col}"/><text x="${f1(mid[0])}" y="${f1(mid[1] + rr * .42)}" style="font-size:${Math.round(rr * 125) / 100}px">${i + 1}</text></g>`; } });
  return `<svg class="sewn" viewBox="-1 -1 ${f1(W + 2)} ${f1(H + 2 + fs * 2)}" role="img" aria-label="The block pieces with each seam's two sides marked">${s}</svg>`;
}
// the cutting table: each cloth at its width, every piece cut from it (a pair: the second turned over), on a 1 in grid
function tableSvg(pat) {
  const lay = layoutOf(pat); let y0 = 0, s = '';
  const W = Math.max(...lay.map(g => g.width));
  for (const g of lay) {
    s += `<text class="cl" x="0" y="${f1(y0 - .7)}">${esc(g.name)}</text><text class="cr" x="${g.width}" y="${f1(y0 - .7)}">${g.width} in wide · ${g.yards} yd · ${g.efficiency}% used</text>`;
    s += `<rect class="cloth" x="0" y="${f1(y0)}" width="${g.width}" height="${f1(Math.max(g.length, 1))}"/>`;
    for (const it of g.items) { const q = it.piece, tf = pts => it.at(pts).map(([x, y]) => [x, y + y0]);
      const cut = tf(offsetOf(q.sew, q.sa ?? pat.sa)), sew = tf(q.sew), b = boundsOf(cut), gr = q.grain?.length === 2 ? tf(q.grain) : null, fs = Math.min(.9, Math.max(.35, b.w / 9));
      s += `<path class="cut" d="${path(cut)}"/><path class="sewl" d="${path(sew)}"/>` + (gr ? `<path class="gr" d="M${f1(gr[0][0])} ${f1(gr[0][1])}L${f1(gr[1][0])} ${f1(gr[1][1])}"/>` : '')
        + (it.n === 0 && b.w > 2.2 && b.h > 1.2 ? `<text class="pn" x="${f1((b.x0 + b.x1) / 2)}" y="${f1((b.y0 + b.y1) / 2)}" font-size="${f1(fs)}">${esc(q.name)}${q.cut > 1 ? ` ×${q.cut}` : ''}</text>` : ''); }
    y0 += Math.max(g.length, 1) + 3.2;
  }
  return `<svg class="table" viewBox="-1 -2.6 ${f1(W + 2)} ${f1(y0 + 1)}" role="img" aria-label="The pieces laid on the cloth">${s}</svg>`;
}
const productSvg = pat => { const A = assembled(pat), b = A.bounds; if (!Number.isFinite(b.w)) return '';
  return `<svg class="prod" viewBox="${f1(b.x0 - 1)} ${f1(b.y0 - 1)} ${f1(b.w + 2)} ${f1(b.h + 2)}" role="img" aria-label="The pieces put together, front and back">${A.pieces.filter(x => !x.piece.hidden).sort((a, b) => (a.piece.place?.z || 0) - (b.piece.place?.z || 0)).map(x => `<path d="${path(x.pts)}"/>`).join('')}</svg>`; };

export function proofCard({ id, label, style, kind, pat, c, sizes = [], size = pat.size }) {
  const okN = c.passed, made = c.made, rows = c.seams.map((s, i) => s.ok === null ? '' : `<tr class="${s.ok ? '' : 'bad'}"><td>${s.edges ? `<span class="dot" style="background:${INK[i % INK.length]}">${i + 1}</span>` : '<span class="dot none">·</span>'}</td><td>${esc(s.name)}${s.why ? `<small>${esc(s.why)}</small>` : ''}</td><td class="n">${fr(s.a)}</td><td class="n">${fr(s.b)}</td><td class="n">${sgn(s.diff)}</td><td class="n">${fr(s.range[0])} to ${fr(s.range[1])}</td><td>${s.ok ? '✓' : '✗'}</td></tr>`).join('');
  const mrows = c.meas.map(s => s.ok === null ? '' : `<tr class="${s.ok ? '' : 'bad'}"><td>${esc(s.name)}</td><td class="n">${fr(s.want)}</td><td class="n">${fr(s.got)}</td><td class="n">${sgn(s.diff)}</td><td class="n">${s.rule ? esc(s.rule) : `±${fr(s.tol)}`}</td><td>${s.ok ? '✓' : '✗'}</td></tr>`).join('');
  const yd = c.table.map(t => `${esc(t.fabric)} ${t.yards} yd`).join(' · ');
  return `<article class="card" id="${esc(id)}" data-kind="${kind}" data-ok="${c.ok && sizes.every(z => z.ok) ? 1 : 0}">
  <header><div><h3>${esc(label)}</h3><p class="meta">${esc(style)} · size ${esc(size)} · ${yd}</p></div><div class="sizes">${sizes.map(z => `<span class="${z.ok ? 'ok' : 'no'}" title="${esc(z.why || 'passes')}">${z.size}</span>`).join('')}</div><span class="score ${c.ok ? 'ok' : 'no'}">${okN}/${made}</span></header>
  <div class="grid"><figure><figcaption>Sewn together: each seam's two sides, same colour and number</figcaption>${sewnSvg(pat, c)}<figcaption>The pieces put together</figcaption>${productSvg(pat)}</figure>
  <div class="tables"><table><caption>Seams walked</caption><thead><tr><th></th><th>Seam</th><th>Side A</th><th>Side B</th><th>B − A</th><th>Allowed</th><th></th></tr></thead><tbody>${rows}</tbody></table>
  <table><caption>${kind === 'bag' ? 'The made bag: its size, and what has to reach, clear or cover' : 'The made garment against its spec (inches, flat)'}</caption><thead><tr><th>Point</th><th>Spec</th><th>Pattern</th><th>Off</th><th>Tolerance</th><th></th></tr></thead><tbody>${mrows}</tbody></table></div></div>
  <p class="cuts ${c.missing.length ? 'no' : 'ok'}">${c.missing.length ? c.missing.map(x => `✗ Missing ${esc(x.need)} (${esc(x.for)})`).join('<br>') : `✓ Everything it is made with: ${pat.pieces.filter(q => q.cut).length} pieces to cut (${[...new Set(pat.pieces.filter(q => q.cut).map(q => q.fabric))].join(', ')}), ${pat.trims.length} trims`}</p>
  <details class="bom"><summary>Pieces and trims</summary><table><thead><tr><th>Piece</th><th>Cut</th><th>From</th></tr></thead><tbody>${pat.pieces.filter(q => q.cut).map(q => `<tr><td>${esc(q.name)}</td><td class="n">${q.cut}${q.pair ? ' (pairs)' : ''}${q.fold ? ' on the fold' : ''}</td><td>${esc(q.fabric)}</td></tr>`).join('')}</tbody></table>
  <table><thead><tr><th>Trim</th><th>Spec</th><th>Qty</th><th>Where</th></tr></thead><tbody>${pat.trims.map(t => `<tr><td>${esc(t.item)}</td><td>${esc(t.spec)}</td><td class="n">${esc(t.qty)}</td><td>${esc(t.where)}</td></tr>`).join('')}</tbody></table></details>
  <p class="cuts ${c.cuts.length ? 'no' : 'ok'}">${c.cuts.length ? c.cuts.map(x => `✗ ${esc(x.piece)}: ${esc(x.why)}`).join('<br>') : `✓ Every piece cuts clean: ${pat.pieces.filter(q => q.cut).length} outlines, none crossing itself, no sliver corners`}</p>
  <details><summary>Cutting table</summary>${tableSvg(pat)}</details>
</article>`;
}

// a product proved at one size, and the same check at each of its sizes: draft(size) → a pattern; m(size) → its measurements (or null)
export function proveSizes(draft, m, style, sizes) {
  return sizes.map(size => { let q = null; try { q = draft(size); } catch { q = null; } const k = q && constructionCheck(q, { m: m(size), style });
    return { size, ok: Boolean(k?.ok), why: !k ? 'could not be drafted' : !k.ok ? [...k.seams, ...k.meas].filter(x => x.ok === false).map(x => x.name).concat(k.cuts.map(x => x.piece + ': ' + x.why), k.missing.map(x => 'missing ' + x.need)).join('; ') : '' }; });
}

const CSS = `:root{--bg:#f3f4f1;--paper:#ffffff;--ink:#17201b;--muted:#5d6a62;--line:#d5dbd6;--mat:#1f5b46;--matline:#2f735a;--cloth:#f7f4ec;--clothedge:#b9b3a3;--ok:#1d7a46;--no:#b3261e;--accent:#1f5b46}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111614;--paper:#18201c;--ink:#e6ece8;--muted:#98a69e;--line:#2c3832;--mat:#163f31;--matline:#21533f;--cloth:#e9e5da;--clothedge:#8f8a7c;--ok:#5cc58a;--no:#ff8a80;--accent:#7cc7a5}}
:root[data-theme="dark"]{--bg:#111614;--paper:#18201c;--ink:#e6ece8;--muted:#98a69e;--line:#2c3832;--mat:#163f31;--matline:#21533f;--cloth:#e9e5da;--clothedge:#8f8a7c;--ok:#5cc58a;--no:#ff8a80;--accent:#7cc7a5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 Archivo,system-ui,sans-serif}
main{max-width:1240px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:clamp(28px,4vw,42px);font-weight:800;letter-spacing:-.02em;margin:0 0 6px;text-wrap:balance}
.lede{max-width:68ch;color:var(--muted);margin:0 0 20px}
.sum{display:flex;flex-wrap:wrap;gap:10px 28px;margin:0 0 22px;padding:14px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.sum div{font:500 13px/1.3 'IBM Plex Mono',monospace;color:var(--muted)}.sum b{display:block;font:800 26px/1.1 Archivo,sans-serif;color:var(--ink);font-variant-numeric:tabular-nums}
.how{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px 24px;margin:0 0 22px;font-size:14px;color:var(--muted)}.how b{color:var(--ink)}
nav{position:sticky;top:0;z-index:2;background:var(--bg);padding:10px 0;display:flex;flex-wrap:wrap;gap:8px;border-bottom:1px solid var(--line);margin-bottom:18px}
nav button{font:500 13px 'IBM Plex Mono',monospace;border:1px solid var(--line);background:var(--paper);color:var(--ink);padding:6px 12px;border-radius:999px;cursor:pointer}
nav button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--paper)}
nav input{flex:1 1 200px;font:14px Archivo,sans-serif;padding:6px 12px;border:1px solid var(--line);border-radius:999px;background:var(--paper);color:var(--ink)}
button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.card{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:16px;margin:0 0 16px;content-visibility:auto;contain-intrinsic-size:auto 640px}
.card header{display:flex;gap:12px 18px;align-items:flex-start;flex-wrap:wrap}.card header>div:first-child{flex:1 1 240px}
h3{margin:0;font-size:18px;font-weight:800}.meta{margin:2px 0 0;color:var(--muted);font:13px 'IBM Plex Mono',monospace}
.sizes{display:flex;gap:4px}.sizes span{font:500 11px 'IBM Plex Mono',monospace;padding:3px 6px;border-radius:3px;border:1px solid var(--line)}
.sizes .ok{color:var(--ok);border-color:currentColor}.sizes .no{color:var(--paper);background:var(--no);border-color:var(--no)}
.score{font:500 13px 'IBM Plex Mono',monospace;padding:4px 10px;border-radius:999px;border:1px solid currentColor}.score.ok{color:var(--ok)}.score.no{color:var(--no)}
.grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:18px;margin-top:12px}@media (max-width:860px){.grid{grid-template-columns:1fr}}
figure{margin:0}figcaption{font:500 11px 'IBM Plex Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:4px 0}
svg{display:block;width:100%;height:auto}
.sewn{max-height:340px}.sewn .blk{fill:var(--cloth);stroke:var(--ink);stroke-width:.08}.sewn .sm{fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.sewn .tag text{font:700 .78px Archivo,sans-serif;fill:#fff;text-anchor:middle}.sewn .bn{font:500 1px 'IBM Plex Mono',monospace;fill:var(--muted);text-anchor:middle}
.prod{max-height:200px;margin-top:4px}.prod path{fill:var(--cloth);stroke:var(--ink);stroke-width:.1;stroke-linejoin:round}
.tables{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}caption{text-align:left;font:500 11px 'IBM Plex Mono',monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:4px 0}
th{font:500 11px 'IBM Plex Mono',monospace;color:var(--muted);text-align:left;padding:4px 6px;border-bottom:1px solid var(--line)}td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:top}
td small{display:block;color:var(--muted);font-size:11.5px}.n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right}
tr.bad td{color:var(--no);font-weight:600}td:last-child{color:var(--ok);font-weight:700}tr.bad td:last-child{color:var(--no)}
.dot{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:#fff;font:700 11px Archivo,sans-serif}.dot.none{background:var(--line);color:var(--muted)}
details{margin-top:6px}summary{cursor:pointer;font:500 12px 'IBM Plex Mono',monospace;color:var(--accent);text-transform:uppercase;letter-spacing:.06em;padding:6px 0}
.table{background:var(--mat);background-image:linear-gradient(var(--matline) 1px,transparent 1px),linear-gradient(90deg,var(--matline) 1px,transparent 1px);background-size:calc(100%/var(--cols,60)) calc(100%/var(--cols,60));border-radius:4px;padding:6px}
.table .cloth{fill:var(--cloth);stroke:var(--clothedge);stroke-width:.08}.table .cut{fill:#fffdf7;stroke:#17201b;stroke-width:.07}.table .sewl{fill:none;stroke:#7a857e;stroke-width:.04;stroke-dasharray:.25 .15}
.table .gr{stroke:#1f5b46;stroke-width:.07}.table .pn{fill:#17201b;text-anchor:middle;font-family:Archivo,sans-serif;font-weight:600}
.table .cl{fill:#f3f4f1;font:700 1.1px Archivo,sans-serif}.table .cr{fill:#cfe3d8;font:500 .9px 'IBM Plex Mono',monospace;text-anchor:end}
.cuts{margin:4px 0 0;font:500 12px 'IBM Plex Mono',monospace}.cuts.ok{color:var(--ok)}.cuts.no{color:var(--no)}
.hide{display:none}`;
const JS = `const cs=[...document.querySelectorAll('.card')],bs=[...document.querySelectorAll('nav button')],q=document.querySelector('nav input');let k='';
const run=()=>{const t=q.value.trim().toLowerCase();for(const c of cs){const m=(!k||(k==='fail'?c.dataset.ok==='0':c.dataset.kind===k))&&(!t||c.textContent.toLowerCase().includes(t));c.classList.toggle('hide',!m)}};
bs.forEach(b=>b.onclick=()=>{k=b.dataset.k;bs.forEach(x=>x.setAttribute('aria-pressed',String(x===b)));run()});q.oninput=run;
for(const s of document.querySelectorAll('svg.table')){const w=s.viewBox.baseVal.width;s.style.setProperty('--cols',Math.max(1,Math.round(w)))}`;
// the page: a title, a paragraph, a strip of totals, then the cards (with the filters when there are many)
export function proofPage({ title = 'Cut and sew proof', lede = '', totals = [], cards = [], how = '', filters = cards.length > 3 }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
${CSS}
</style></head><body><main>
<h1>${esc(title)}</h1>
${lede ? `<p class="lede">${lede}</p>` : ''}
${totals.length ? `<div class="sum">${totals.map(([v, l]) => `<div><b>${esc(v)}</b>${esc(l)}</div>`).join('')}</div>` : ''}
${how}
${filters ? `<nav aria-label="Filter"><button aria-pressed="true" data-k="">All</button><button aria-pressed="false" data-k="top">Tops</button><button aria-pressed="false" data-k="bottom">Bottoms</button><button aria-pressed="false" data-k="acc">Headwear and totes</button><button aria-pressed="false" data-k="bag">Bags</button><button aria-pressed="false" data-k="plush">Plush</button><button aria-pressed="false" data-k="fail">Not passing</button><input type="search" placeholder="Find a garment" aria-label="Find a garment"></nav>` : ''}
${cards.join('\n')}
</main><script>
${filters ? JS : JS.split('\n').filter(l => /svg\.table/.test(l)).join('\n')}
</script></body></html>`;
}

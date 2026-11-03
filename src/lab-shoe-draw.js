// A shoe's drawing in panels: a footwear technical flat (line art with one flat colour per panel, drawn by the image model from the concept's
// side profile) traced into vector panels a designer can recolour and reshape in the Studio, with the stitching, tread and laces kept as a
// detail layer on top.
//   traceShoe(png)           → { width, height, box, panels: [{ id, fill, area, d, box }], details: [{ d }], stroke, svg }
//   shoeSvg(drawing, o)      → the drawing as an SVG (its panels with their outlines, then the details), for the page and the tech pack
//   makeShoeDrawings(...)    → the five views (outside, inside, top, bottom, heel) drawn by the image model and traced
//   cleanDrawing(body, base) → a drawing as edited in the Studio, checked against the one saved
// The outlines are drawn from the panels' own edges, so a panel that is reshaped keeps its outline; the image's lines that are not a panel's
// edge (stitching, sipes, lugs, laces) become the details.
import sharp from 'sharp';
import { separate, rgbLab, deltaE } from './lab-separate.js';
import { loopsOf, closedSimplify, smoothPath } from './lab-vector.js';

const lumOf = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
// how many pixels of `mask` are inside a (2r+1)² square that is all mask: thin strokes vanish, broad areas stay
function survives(mask, W, H, r) {
  const I = new Uint32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += mask[y * W + x] ? 1 : 0; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const full = (2 * r + 1) ** 2; let n = 0, all = 0;
  for (let y = r; y < H - r; y++) for (let x = r; x < W - r; x++) {
    if (!mask[y * W + x]) continue; all++;
    const s = I[(y + r + 1) * (W + 1) + x + r + 1] - I[(y - r) * (W + 1) + x + r + 1] - I[(y + r + 1) * (W + 1) + x - r] + I[(y - r) * (W + 1) + x - r];
    if (s === full) n++;
  }
  return all ? n / all : 0;
}

export async function traceShoe(png, { size = 1024, minShare = .00025, grow = 6, tolerance = 1.7 } = {}) {
  const meta = await sharp(png).metadata(), k = size / Math.max(meta.width || 1, meta.height || 1), W = Math.round((meta.width || 1) * k), H = Math.round((meta.height || 1) * k), N = W * H;
  const { data } = await sharp(png).flatten({ background: '#ffffff' }).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const sep = separate(data, W, H, { max: 12, dropBackground: false }), ink = sep.hard, inks = sep.inks;
  if (!inks.length) throw new Error('Nothing to trace in the drawing');
  // the line ink: the darkest ink, when it is drawn as strokes (a near-black panel is broad and stays when the strokes are worn away)
  const order = inks.map((c, j) => j).sort((a, b) => lumOf(inks[a].rgb) - lumOf(inks[b].rgb));
  // the line work: the very dark pixels, when they are strokes (a near-black panel is broad and stays when the strokes are worn away); read from
  // the pixels themselves, because a black outline and a charcoal panel can fall in one ink
  const pl = p => 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
  let isLine = new Uint8Array(N);
  for (const cut of [30, 22, 15]) { const m = new Uint8Array(N); let n = 0; for (let p = 0; p < N; p++) if (pl(p) < cut) { m[p] = 1; n++; } if (n && survives(m, W, H, 2) < .35) { isLine = m; break; } }
  const line = isLine.some(Boolean) ? 1 : -1;
  // the background: the light paper reached from the picture's edge (a white midsole inside the outline stays a panel)
  const light = order[order.length - 1], BG = -2, LINE = -3, lab = new Int32Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const p = y * W + x; if (ink[p] === light && lab[p] === -1) { lab[p] = BG; q[qt++] = p; } }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const p = y * W + x; if (ink[p] === light && lab[p] === -1) { lab[p] = BG; q[qt++] = p; } }
  while (qh < qt) { const p = q[qh++], x = p % W, y = (p / W) | 0; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && lab[n] === -1 && ink[n] === light && !isLine[n]) { lab[n] = BG; q[qt++] = n; } }
  // the panels: each run of one ink, joined edge to edge; a speck is treated as line work
  const comps = [], minA = Math.max(30, N * minShare);
  for (let s = 0; s < N; s++) {
    if (lab[s] !== -1 || isLine[s] || ink[s] < 0) continue;
    const id = comps.length, j = ink[s], px = []; lab[s] = id; q[0] = s; qh = 0; qt = 1;
    while (qh < qt) { const p = q[qh++]; px.push(p); const x = p % W, y = (p / W) | 0; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && lab[n] === -1 && ink[n] === j && !isLine[n]) { lab[n] = id; q[qt++] = n; } }
    comps.push({ id, ink: j, px, keep: px.length >= minA });
  }
  // a run that is only a sliver (the soft edge of a line, a ring of blended pixels) is line work too: too few of its pixels are inside it
  for (const c of comps) if (c.keep) { let inner = 0; for (const p of c.px) { const x = p % W, y = (p / W) | 0; if (x > 1 && y > 1 && x < W - 2 && y < H - 2 && lab[p - 1] === c.id && lab[p + 1] === c.id && lab[p - W] === c.id && lab[p + W] === c.id) inner++; } if (inner < c.px.length * .35) c.keep = false; }
  for (const c of comps) if (!c.keep) for (const p of c.px) lab[p] = LINE;
  for (let p = 0; p < N; p++) if (lab[p] === -1) lab[p] = LINE;
  const lineAt = new Uint8Array(N); for (let p = 0; p < N; p++) lineAt[p] = lab[p] === LINE ? 1 : 0;
  // the panels grow under the lines between them (up to `grow` pixels), so neighbours meet in the middle of the line and leave no gap
  const dist = new Uint8Array(N); qh = qt = 0;
  for (let p = 0; p < N; p++) if (lab[p] >= 0) { const x = p % W, y = (p / W) | 0; if ((x > 0 && lab[p - 1] === LINE) || (x < W - 1 && lab[p + 1] === LINE) || (y > 0 && lab[p - W] === LINE) || (y < H - 1 && lab[p + W] === LINE)) q[qt++] = p; }
  while (qh < qt) { const p = q[qh++], x = p % W, y = (p / W) | 0; if (dist[p] >= grow) continue; for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) if (n >= 0 && lab[n] === LINE) { lab[n] = lab[p]; dist[n] = dist[p] + 1; q[qt++] = n; } }
  // the lines that are a panel's edge are drawn from the panels; the rest (stitching, sipes, lugs, laces inside a panel) are the details
  const det = new Int8Array(N).fill(0), R = 3;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (!lineAt[p]) continue; const seen = new Set();
    for (let dy = -R; dy <= R && seen.size < 2; dy++) for (let dx = -R; dx <= R; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) { seen.add(BG); continue; } const l = lab[yy * W + xx]; if (l !== LINE) seen.add(l); }
    if (seen.size < 2) det[p] = 1;
  }
  // traced inside each one's own box (a whole-picture pass per panel would be slow)
  const traceIn = (box, test) => {
    const w = box.x1 - box.x0 + 3, h = box.y1 - box.y0 + 3, sub = new Int8Array(w * h);
    for (let y = 0; y < h - 2; y++) for (let x = 0; x < w - 2; x++) if (test((box.y0 + y) * W + box.x0 + x)) sub[(y + 1) * w + x + 1] = 1;
    return loopsOf(sub, w, h, 1).map(l => closedSimplify(l, tolerance).map(([x, y]) => [x + box.x0 - 1, y + box.y0 - 1])).filter(l => l.length >= 3);
  };
  const boxOf = ps => { let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const p of ps) { const x = p % W, y = (p / W) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; };
  const members = new Map(); for (let p = 0; p < N; p++) if (lab[p] >= 0) { let m = members.get(lab[p]); if (!m) members.set(lab[p], m = []); m.push(p); }
  const panels = [];
  for (const c of comps) {
    if (!c.keep) continue; const ps = members.get(c.id) || []; if (!ps.length) continue;
    const box = boxOf(ps), loops = traceIn(box, p => lab[p] === c.id);
    if (!loops.length) continue;
    let r = 0, g = 0, b = 0; for (const p of c.px) { r += data[p * 4]; g += data[p * 4 + 1]; b += data[p * 4 + 2]; } const n = c.px.length;
    panels.push({ id: `p${panels.length + 1}`, rgb: [r / n, g / n, b / n], area: ps.length, d: loops.map(smoothPath).join(''), box });
  }
  panels.sort((a, b) => b.area - a.area); panels.forEach((p, i) => { p.id = `p${i + 1}`; });
  // panels drawn in one colour share it exactly (the mean of all of them), so a colour changes everywhere at once; the colour is the panels'
  // own pixels, not the ink's (a light panel and the white paper can fall in one ink)
  const groups = [];
  for (const p of panels) { const lc = rgbLab(...p.rgb); let gp = groups.find(gq => deltaE(gq.lab, lc) < 9); if (!gp) groups.push(gp = { lab: lc, sum: [0, 0, 0], w: 0, members: [] }); gp.members.push(p); gp.w += p.area; p.rgb.forEach((v, i) => { gp.sum[i] += v * p.area; }); }
  for (const gp of groups) { const hex = '#' + gp.sum.map(v => Math.max(0, Math.min(255, Math.round(v / gp.w))).toString(16).padStart(2, '0')).join(''); for (const p of gp.members) { p.fill = hex; delete p.rgb; } }
  const detPx = []; for (let p = 0; p < N; p++) if (det[p]) detPx.push(p);
  const details = detPx.length ? [{ d: traceIn(boxOf(detPx), p => det[p] === 1).filter(l => l.length >= 4).map(smoothPath).join('') }] : [];
  // the line weight of the drawing: the mean width of its strokes (pixels of line over their length, roughly)
  let lw = 2.4; if (line >= 0) { const thick = survives(isLine, W, H, 1); lw = Math.max(1.6, Math.min(4, 2 + thick * 4)); }
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const p of panels) { x0 = Math.min(x0, p.box.x0); y0 = Math.min(y0, p.box.y0); x1 = Math.max(x1, p.box.x1); y1 = Math.max(y1, p.box.y1); }
  const out = { width: W, height: H, box: panels.length ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: W, y1: H }, panels, details, stroke: +lw.toFixed(2), line: '#141414' };
  return { ...out, svg: shoeSvg(out) };
}

const esc = s => String(s ?? '').replace(/[<&>"]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));
// → the drawing as SVG. `pad` (px) around the shoe; `ink` the outline colour.
export function shoeSvg(dw, { pad = 24, ink = '#161616', width = null } = {}) {
  const b = dw.box, vx = b.x0 - pad, vy = b.y0 - pad, vw = b.x1 - b.x0 + 2 * pad, vh = b.y1 - b.y0 + 2 * pad, sw = dw.stroke || 2.4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}"${width ? ` width="${width}" height="${Math.round(width * vh / vw)}"` : ''}>`
    + `<g class="panels" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round">${dw.panels.filter(p => !p.hidden).map(p => `<path data-panel="${esc(p.id)}"${p.name ? ` data-name="${esc(p.name)}"` : ''} fill="${esc(p.fill)}" fill-rule="evenodd" d="${p.d}"/>`).join('')}</g>`
    + `<g class="details" fill="${ink}" stroke="none">${(dw.hideDetails ? [] : dw.details || []).map(x => `<path d="${x.d}" fill-rule="evenodd"/>`).join('')}</g></svg>`;
}

// ---- drawing the views: the outside traced from the shoe's side profile, then the other four drawn from that drawing ------------------------
export const SHOE_VIEWS = [
  { id: 'lateral', label: 'Outside' }, { id: 'medial', label: 'Inside' }, { id: 'top', label: 'Top' }, { id: 'bottom', label: 'Bottom' }, { id: 'back', label: 'Heel' }
];
export const SHOE_VIEW_IDS = SHOE_VIEWS.map(v => v.id);
const STYLE = 'crisp solid black outlines of even weight around every panel, the sole and the tread; thin dashed lines for stitching; each panel filled with ONE flat solid colour taken from the shoe; no shading, no gradients, no highlights, no texture, no mesh pattern, no shadow; pure white background; no text, no logos';
const AS = {
  medial: 'seen from the inside (medial side) at eye level, toe pointing LEFT, square to the camera',
  top: 'seen from directly above (top view), toe pointing right, the opening, tongue and lacing visible',
  bottom: 'its outsole seen from directly below (bottom view), toe pointing right, the tread laid out as the side view shows it',
  back: 'seen from directly behind at eye level: the heel counter, heel tab, collar and the back of the sole'
};
// → the prompt for one view. The outside is drawn from the side profile photograph; every other view from the outside drawing.
export function shoeViewPrompt(view, name = '') {
  if (view === 'lateral') return `Redraw this exact shoe${name ? ` (${String(name).slice(0, 80)})` : ''} as a professional footwear technical flat (vector illustration): the same side profile, the outside of the shoe, toe pointing right, the same outline, proportions and every panel and seam in the same place. ${STYLE}.`;
  return `This is a footwear technical flat of a shoe, outside view. Draw the SAME shoe as a technical flat ${AS[view]}, in exactly the same drawing style: ${STYLE}. The same panels, colours, lacing and sole as the reference. The shoe centred.`;
}
// Draws and traces the wanted views. `side` is the side profile photograph; `have` holds line art already drawn ({view: Buffer}); `onView(view,
// {art, drawing} | null, note)` is called as each one lands. The outside comes first: the others are drawn from it.
export async function makeShoeDrawings({ side, name = '', views = SHOE_VIEW_IDS, have = {}, cfg, edit, onView = () => {}, pool = 2 }) {
  const art = { ...have }, want = views.filter(v => SHOE_VIEW_IDS.includes(v));
  const one = async v => {
    try {
      const ref = v === 'lateral' ? side : art.lateral; if (!ref) throw new Error('The outside view has to be drawn first');
      const buf = cfg.provider === 'fixture' ? await fixtureArt(v) : await edit({ images: [ref], prompt: shoeViewPrompt(v, name), cfg: { ...cfg, size: '1024x1024' } });
      const png = await sharp(buf).rotate().png().toBuffer(), drawing = await traceShoe(png); if (!drawing.panels.length) throw new Error('No panels were found in the drawing');
      art[v] = png; const { svg, ...dw } = drawing; await onView(v, { art: png, drawing: dw, model: cfg.model || cfg.provider }, ''); return true;
    } catch (e) { await onView(v, null, `Could not be drawn: ${String(e.message).slice(0, 160)}`); return false; }
  };
  if (want.includes('lateral') || !art.lateral) { if (!(await one('lateral'))) { for (const v of want.filter(x => x !== 'lateral')) await onView(v, null, 'The outside view could not be drawn, so this one was skipped.'); return art; } }
  const rest = want.filter(v => v !== 'lateral');
  for (let i = 0; i < rest.length; i += pool) await Promise.all(rest.slice(i, i + pool).map(one));
  return art;
}
// the test stand-in: a simple two-panel shoe in flat colours with black outlines, so the whole path runs without an image model
export async function fixtureArt(view = 'lateral') {
  const flip = view === 'medial' ? ' transform="translate(1024 0) scale(-1 1)"' : '';
  const svg = view === 'top' || view === 'bottom'
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><ellipse cx="512" cy="512" rx="400" ry="150" fill="${view === 'bottom' ? '#d9541e' : '#e9e5dc'}" stroke="#111" stroke-width="6"/><ellipse cx="540" cy="512" rx="300" ry="100" fill="${view === 'bottom' ? '#2f2f31' : '#5d6440'}" stroke="#111" stroke-width="6"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#fff"/><g${flip}><path d="M140 560 L180 360 Q300 330 420 380 L620 470 Q800 500 900 560 L900 620 L140 620 Z" fill="#5d6440" stroke="#111" stroke-width="6"/><path d="M120 620 L920 620 Q930 680 900 700 L140 700 Q110 680 120 620 Z" fill="#e9e5dc" stroke="#111" stroke-width="6"/></g></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ---- edits from the Studio: panels recoloured, renamed, reshaped; nothing but path data and colours goes in -------------------------------------
const PATH_OK = /^[MLQCZmlqcz0-9.,\s-]+$/, HEX = /^#[0-9a-f]{6}$/i;
export function cleanDrawing(b, base) {
  if (!b || typeof b !== 'object' || !base) return null;
  const byId = new Map((base.panels || []).map(p => [p.id, p])), seen = new Set(), panels = [];
  for (const p of Array.isArray(b.panels) ? b.panels.slice(0, 400) : []) {
    const id = String(p?.id || '').slice(0, 20); if (!/^[a-z0-9_-]+$/i.test(id) || seen.has(id)) continue; seen.add(id);
    const was = byId.get(id) || {}, d = typeof p.d === 'string' && p.d.length < 60000 && PATH_OK.test(p.d) ? p.d : was.d; if (!d) continue;
    panels.push({ id, fill: HEX.test(String(p.fill || '')) ? String(p.fill).toLowerCase() : was.fill || '#cccccc', d, area: Number(was.area) || 0, box: was.box || null, ...(p.name ? { name: String(p.name).replace(/[<>]/g, '').slice(0, 60) } : was.name ? { name: was.name } : {}), ...(p.hidden ? { hidden: true } : {}) });
  }
  if (!panels.length) return null;
  const details = b.details === false ? [] : base.details || [];
  return { ...base, panels, details, ...(b.hideDetails !== undefined ? { hideDetails: Boolean(b.hideDetails) } : {}) };
}

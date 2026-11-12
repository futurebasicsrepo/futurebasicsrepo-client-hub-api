// What a base looks like before it is opened: the picture on its card, and the larger one beside the picks. Shared by the recipe menu
// (src/lab-recipe.html) and the sketch pack (src/lab-sketches.html), so a mug, a plush bear or a turntable is drawn the same way in both.
//   a sketch, a library bag, a library shoe   their own thumbnail, already drawn
//   a style drawn from its measurements        the flats' own drawing of it (a beanie, a tote, a mug): nothing is kept in a file to go stale
//   a plush shape                              its front view, drawn from its default pattern (src/lab-plush-views.js)
//   an engineered product                      its starting assembly from the top and the front, as lines (src/lab-assembly.js lineViews)
// The last two load the pattern and assembly code the first time one is asked for, and not before: a page that never shows them never pays.
import { renderSvg, defaultParams } from './lab-flats.js';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svgUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

// a style drawn from its measurements, as a picture: '' when the flats cannot draw it
const STYLE_ART = new Map();
export function styleThumb(style) {
  if (!STYLE_ART.has(style)) { let u = ''; try { const p = defaultParams(style); u = p ? svgUrl(renderSvg({ ...p, template: 'none' }, 'front', { plain: true, scale: 0, side: 'front' })) : ''; } catch { u = ''; } STYLE_ART.set(style, u); }
  return STYLE_ART.get(style);
}

// a plush shape's views, each a whole SVG: { front, back, side }
const PLUSH_ART = new Map();
export async function plushArt(shape) {
  if (!PLUSH_ART.has(shape)) PLUSH_ART.set(shape, (async () => {
    const [P, V] = await Promise.all([import('./lab-pattern.js'), import('./lab-plush-views.js')]), views = V.plushViews(P.plushPattern(P.plushDefaults(shape))), out = {};
    for (const k of ['front', 'back', 'side']) { const v = views[k]; if (!v) continue; const b = v.box, pad = .6; out[k] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}">${v.svg}</svg>`; }
    return out;
  })());
  return PLUSH_ART.get(shape);
}

// an engineered product's starting assembly as a picture: from the top, over from the front, at one scale; each view's size in mm with it
const OBJECT_ART = new Map();
export async function objectArt(arch, size = 420) {
  const key = `${arch}@${size}`;
  if (!OBJECT_ART.has(key)) OBJECT_ART.set(key, (async () => {
    const A = await import('./lab-assembly.js'), W = size, H = size, L = A.lineViews(A.archetype(arch), { W, H, gap: Math.round(size * .06), foot: Math.round(size * .02) });
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), im = g.createImageData(W, H), N = W * H, lev = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const e = L.edges[i]; if (e) for (const o of [i, i + 1, i + W, i + W + 1]) if (o < N && lev[o] < e) lev[o] = e; } // two pixels wide, so it reads when it is shown small
    const ink = [null, [150, 150, 144], [40, 40, 44]];
    for (let i = 0; i < N; i++) { const q = ink[lev[i]]; if (q) { im.data[i * 4] = q[0]; im.data[i * 4 + 1] = q[1]; im.data[i * 4 + 2] = q[2]; im.data[i * 4 + 3] = 255; } }
    g.putImageData(im, 0, 0);
    return { url: c.toDataURL('image/png'), views: L.views.map(v => ({ name: v.name, mm: v.mm })) };
  })());
  return OBJECT_ART.get(key);
}

// the picture for a base's card, when there is one to hand: a URL, or '' when it must be drawn first (then thumbLater)
//   b: a recipe base (src/lab-recipe.js): { kind, sketch, style, library, shape, arch }
export function thumbNow(b, sketch = b?.sketch) {
  if (!b) return '';
  if (b.kind === 'bag') return `/lab/bag-templates/thumbs/${b.library}.webp`;
  if (b.kind === 'shoe') return `/lab/footwear-templates/thumbs/${b.library}.webp`;
  if (b.kind === 'plush' || b.kind === 'object') return '';
  return sketch ? `/lab/flat-templates/thumbs/${sketch}.webp` : styleThumb(b.style);
}
export async function thumbLater(b) {
  if (b?.kind === 'plush') return svgUrl((await plushArt(b.shape)).front);
  if (b?.kind === 'object') return (await objectArt(b.arch)).url;
  return thumbNow(b);
}

// ---- a bag or a shoe from the library: its drawing in panels (GET /v1/lab/library/bags|footwear/:id → { views: { front: { box, panels, details } } })
export const librarySvg = (dw, h = 320) => { const b = dw.box, p = 24; return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0 - p} ${b.y0 - p} ${b.x1 - b.x0 + 2 * p} ${b.y1 - b.y0 + 2 * p}" style="display:block;width:100%;height:${h ? h + 'px' : '100%'}"><g stroke="#161616" stroke-width="${dw.stroke || 2.4}" stroke-linejoin="round">${dw.panels.map(q => `<path fill="${esc(q.fill)}" fill-rule="evenodd" d="${q.d}"/>`).join('')}</g><g fill="#161616">${(dw.details || []).map(x => `<path fill-rule="evenodd" d="${x.d}"/>`).join('')}</g></svg>`; };
const rgbOf = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
// the views with the body in a colour: the body is the fill that covers the most of the main view, and every panel near it takes the colour
// (the service does the same when the concept is made: src/lab-shoe-draw-routes.js recolourBody)
export function bodyIn(views, hex) {
  if (!hex) return views; const area = new Map(); for (const q of (views.front || views.lateral).panels) area.set(q.fill, (area.get(q.fill) || 0) + q.area);
  const body = [...area.entries()].sort((a, b) => b[1] - a[1])[0][0], B = rgbOf(body), near = f => { const c = rgbOf(f); return Math.hypot(c[0] - B[0], c[1] - B[1], c[2] - B[2]) < 30; };
  return Object.fromEntries(Object.entries(views).map(([v, dw]) => [v, { ...dw, panels: dw.panels.map(q => (near(q.fill) ? { ...q, fill: hex } : q)) }]));
}

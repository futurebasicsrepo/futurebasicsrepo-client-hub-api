// Logos and graphics placed on a shoe's or a plush's views, in inches (shared by the Pattern page and the service; no DOM, no Node). A placement
// sits on one view at its centre (x, y in that view's own inches: a shoe's sides in the side view's inches, as its sketches are), its width and
// height, what it is (one of our marks, or a graphic from the library) and how it is made. Each is checked the way a garment's placements are:
// within what its technique can make, on one piece (a seam under it is hard to embroider or deboss), and suited to the cloth.
//   cleanLogos(list, kind)       → the placements, bounded (what a page sends is never trusted)
//   logoMarkup(logos, view, tf, hrefs, mirrorX) → the placements on a view as SVG images (tf: the view's inches to where they are drawn)
//   logoChecks(pat, logos)       → { [id]: [{ level, msg }] }: what each placement can be made as, and where it lands
//   logoWords(pat, l)            → the placement in words for the tech pack: where, how big, how it is made
export const LOGO_VIEWS = { footwear: ['lateral', 'medial', 'top'], plush: ['front', 'back', 'side'] };
export const LOGO_TECHNIQUES = { footwear: ['embroidery', 'deboss', 'emboss', 'screen print', 'heat transfer', 'rubber patch', 'woven label'], plush: ['embroidery', 'appliqué', 'deboss', 'woven label', 'print'] };
// the smallest and largest width each is made at, in inches (an embroidery hoop on a piece, a deboss die, a label's loom)
export const LOGO_LIMITS = { embroidery: [.4, 4], deboss: [.3, 3], emboss: [.3, 3], 'screen print': [.3, 5], 'heat transfer': [.3, 4], 'rubber patch': [.5, 3], 'woven label': [.6, 2.5], 'appliqué': [1, 6], print: [.3, 6] };
export const MARKS = { cue: 'Cue mark', word: 'Wordmark', lockup: 'Wordmark and cue mark' };
const r3 = v => Math.round(v * 1000) / 1000, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? r3(Math.min(hi, Math.max(lo, n))) : null; };

export function cleanLogos(list, kind) {
  if (!Array.isArray(list) || !LOGO_VIEWS[kind]) return [];
  return list.slice(0, 12).map((l, k) => {
    if (!l || typeof l !== 'object' || !LOGO_VIEWS[kind].includes(l.view)) return null;
    const mark = MARKS[l.mark] ? l.mark : null, art = UUID.test(String(l.art || '')) ? String(l.art) : null; if (!mark && !art) return null;
    const x = num(l.x, -40, 40), y = num(l.y, -40, 40), w = num(l.w, .2, 12), h = num(l.h, .05, 12); if ([x, y, w, h].includes(null)) return null;
    return { id: /^g[a-z0-9]{1,14}$/.test(String(l.id || '')) ? String(l.id) : `g${k + 1}`, view: l.view, x, y, w, h, ...(mark ? { mark } : { art }), technique: LOGO_TECHNIQUES[kind].includes(l.technique) ? l.technique : LOGO_TECHNIQUES[kind][0], ...(mark && l.ink === 'light' ? { ink: 'light' } : {}),
      name: String(l.name || (mark ? MARKS[mark] : 'Graphic')).replace(/\s+/g, ' ').trim().slice(0, 60) };
  }).filter(Boolean);
}
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// `mirrorX` (a shoe's inside view is the outside drawn mirrored): the centre is mirrored about it, the artwork is not (it reads the right way)
// a mark on a dark cloth is drawn in its light ink (`mark:<id>:light`), when there is one
export function logoMarkup(logos, view, tf = p => p, hrefs = {}, mirrorX = null) {
  return (logos || []).filter(l => l.view === view).map(l => {
    const href = hrefs[l.mark ? `mark:${l.mark}${l.ink === 'light' ? ':light' : ''}` : `art:${l.art}`] || (l.mark && hrefs[`mark:${l.mark}`]); let [cx, cy] = tf([l.x, l.y]); if (mirrorX != null) cx = mirrorX - cx;
    return href ? `<image data-logo="${esc(l.id)}" href="${esc(href)}" x="${r3(cx - l.w / 2)}" y="${r3(cy - l.h / 2)}" width="${l.w}" height="${l.h}" preserveAspectRatio="xMidYMid meet"/>` : '';
  }).join('');
}
// a point in a closed outline
const inside = (pts, [x, y]) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi) c = !c; } return c; };
// which of a shoe's pieces is under a point on a side: the topmost of the upper's pieces as they show on the shoe
function shoePieceAt(pat, side, p) {
  const vis = pat.pieces.filter(q => q.place?.view === 'front' && q.shown && !q.component && !/lining|foam|counter|puff|insole|sockliner/.test(q.id) && (side === 'medial' ? !/-lat(-|$)/.test(q.id) : !/-med(-|$)/.test(q.id))).sort((a, b) => (b.place.z || 0) - (a.place.z || 0));
  return vis.find(q => inside(q.shown, p)) || null;
}
const plushPart = (pat, l) => { const h = pat.spec.height, head = pat.spec.shape === 'elephant' ? h * .46 : pat.spec.shape === 'bear' ? h * .42 : 0; return head && l.y < head ? 'head' : pat.spec.shape === 'pillow' ? 'face' : 'body'; };
export function logoChecks(pat, logos) {
  const out = {}, kind = pat?.kind, firm = /leather|vegan|suede/.test(String(pat?.spec?.fabric || ''));
  for (const l of logos || []) {
    const f = out[l.id] = [], [lo, hi] = LOGO_LIMITS[l.technique] || [.3, 6];
    if (l.w < lo) f.push({ level: 'fail', msg: `${l.w} in is under the ${lo} in a ${l.technique} holds its detail at` });
    else if (l.w > hi) f.push({ level: 'fail', msg: `${l.w} in is over the ${hi} in a ${l.technique} is made at` });
    if (kind === 'footwear' && l.view !== 'top') {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([a, b]) => [l.x + a * l.w * .45, l.y + b * l.h * .45]), qs = corners.map(p => shoePieceAt(pat, l.view, p)), on = qs.map(q => q?.name.toLowerCase() || null), here = on[4];
      if (!here) f.push({ level: 'fail', msg: 'It is off the upper: move it onto a piece' });
      else if (new Set(on).size > 1) f.push({ level: 'warn', msg: `It crosses a seam (${[...new Set(on.filter(Boolean))].join(', ')}): make it on one piece, or apply it after closing` });
      if (here && ['embroidery', 'deboss', 'emboss'].includes(l.technique)) f.push({ level: 'info', msg: `${l.technique === 'embroidery' ? 'Embroidered' : l.technique === 'deboss' ? 'Debossed' : 'Embossed'} on the flat ${here} before it is closed` });
    }
    if (kind === 'plush') {
      if (firm && l.technique === 'embroidery') f.push({ level: 'warn', msg: 'Embroidery perforates leather and suede: deboss it, or use an appliqué' });
      if (!firm && l.technique === 'deboss') f.push({ level: 'fail', msg: 'A pile cannot be debossed: embroider it, or use an appliqué or a label' });
      if (pat.spec.age === '0+' && l.technique === 'woven label' && l.view !== 'back') f.push({ level: 'info', msg: 'A label on a baby toy: sew it flat on all four sides, so no loop can catch a finger' });
      f.push({ level: 'info', msg: `On the ${plushPart(pat, l)}, ${l.technique === 'embroidery' || l.technique === 'appliqué' ? 'stitched on the flat piece before it is sewn and stuffed' : 'applied to the flat piece'}` });
    }
  }
  return out;
}
const fr8 = v => { const n = Math.round(v * 8), w = Math.floor(n / 8), r = n % 8, g = (a, b) => b ? g(b, a % b) : a, d = r ? g(r, 8) : 1; return `${w || !r ? w : ''}${r ? `${w ? ' ' : ''}${r / d}/${8 / d}` : ''} in`; };
export function logoWords(pat, l) {
  const where = pat.kind === 'footwear' ? `${l.view === 'medial' ? 'inside' : l.view === 'top' ? 'top' : 'outside'}${l.view !== 'top' ? `, on the ${(shoePieceAt(pat, l.view, [l.x, l.y])?.name || 'upper').toLowerCase()}` : ''}` : `${l.view}, on the ${plushPart(pat, l)}`;
  return `${l.name}: ${l.technique}, ${fr8(l.w)} wide × ${fr8(l.h)}, ${where}; its centre ${fr8(Math.abs(l.x))} ${pat.kind === 'footwear' ? 'from the heel' : l.x < 0 ? 'left of centre' : 'right of centre'}, ${fr8(Math.abs(l.y))} ${l.y < 0 ? 'above the ground' : 'down from the top'}`;
}

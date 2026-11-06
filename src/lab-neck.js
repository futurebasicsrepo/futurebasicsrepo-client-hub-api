// Necklines for knit tops, switched like a pocket or a zip: thin crew, regular crew, V neck, mock neck and turtleneck. Kept on the flat's
// params (neckline), drawn on the flats over the sketch's own neckline (the sketch's is covered, then this one drawn in the garment's colour,
// from the piece's neck width and front and back drops), and written for the factory. Shared by the server and the page (/lab/lab-neck.js).

// rib: the band's finished width, inches; stand: how far a mock or turtle stands above the neck seam; vDrop: how much deeper a V goes than the crew
export const NECKLINES = [
  { id: 'thin', label: 'Thin crew', rib: .5, how: 'Crew neck, 1/2" (1.3 cm) 1×1 rib, coverstitched; back neck tape.' },
  { id: 'regular', label: 'Regular crew', rib: .875, how: 'Crew neck, 7/8" (2.2 cm) 1×1 rib, coverstitched; back neck tape.' },
  { id: 'vneck', label: 'V neck', rib: .75, vDrop: 2.25, how: 'V neck, 3/4" (1.9 cm) 1×1 rib, mitred at the centre front point and coverstitched; back neck tape.' },
  { id: 'mock', label: 'Mock neck', rib: .75, stand: 1.75, how: 'Mock neck: a 1 3/4" (4.4 cm) single-layer 2×2 rib stand, sewn to a raised neckline; not folded.' },
  { id: 'turtle', label: 'Turtleneck', rib: .75, stand: 2.75, fold: true, how: 'Turtleneck: a 5 1/2" (14 cm) 2×2 rib tube folded in half to a 2 3/4" (7 cm) stand, worn turned down.' }
];
export const NECKLINE_IDS = NECKLINES.map(n => n.id);
export const necklineOf = id => NECKLINES.find(n => n.id === id) || null;
export const cleanNeckline = v => (NECKLINE_IDS.includes(v) ? v : null);
// the knit tops it fits (not hooded, collared or open-front pieces)
const FITS = ['tee', 'longsleeve', 'crewneck', 'tank', 'dress', 'bodysuit', 'cami', 'swimsuit'];
export const takesNeckline = style => FITS.includes(style);
export const necklineWords = p => { const n = necklineOf(p?.neckline); return n && takesNeckline(p.style) ? n.how : ''; };

const n3 = v => Math.round(v * 1000) / 1000;
// a U through (−a, y0), (0, yb), (a, y0)
const U = (a, y0, yb) => `M ${n3(-a)} ${n3(y0)} C ${n3(-a * .95)} ${n3(y0 + (yb - y0) * .8)} ${n3(-a * .5)} ${n3(yb)} 0 ${n3(yb)} C ${n3(a * .5)} ${n3(yb)} ${n3(a * .95)} ${n3(y0 + (yb - y0) * .8)} ${n3(a)} ${n3(y0)}`;
// the same U, walked back the other way (to close a band between two Us)
const Ur = (a, y0, yb) => `L ${n3(a)} ${n3(y0)} C ${n3(a * .95)} ${n3(y0 + (yb - y0) * .8)} ${n3(a * .5)} ${n3(yb)} 0 ${n3(yb)} C ${n3(-a * .5)} ${n3(yb)} ${n3(-a * .95)} ${n3(y0 + (yb - y0) * .8)} ${n3(-a)} ${n3(y0)} Z`;
const V = (a, y0, yb) => `M ${n3(-a)} ${n3(y0)} Q ${n3(-a * .35)} ${n3(y0 + (yb - y0) * .55)} 0 ${n3(yb)} Q ${n3(a * .35)} ${n3(y0 + (yb - y0) * .55)} ${n3(a)} ${n3(y0)}`;
const Vr = (a, y0, yb) => `L ${n3(a)} ${n3(y0)} Q ${n3(a * .35)} ${n3(y0 + (yb - y0) * .55)} 0 ${n3(yb)} Q ${n3(-a * .35)} ${n3(y0 + (yb - y0) * .55)} ${n3(-a)} ${n3(y0)} Z`;
const shade = (hex, t) => { const h = String(hex || '#ffffff').replace('#', ''), n = parseInt(h.length === 6 ? h : 'ffffff', 16); return '#' + [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v * (1 - t)).toString(16).padStart(2, '0')).join(''); };
// short lines across a band, for the rib's wales: along a U (crew), a V, or straight up (a stand)
function ribLines(kind, a, y0, yb, w, line, n = 34) {
  let s = '';
  for (let i = 1; i < n; i++) {
    const t = i / n, x = -a + 2 * a * t, u = Math.abs(x) / a;
    const y = kind === 'v' ? y0 + (yb - y0) * (1 - u) : y0 + (yb - y0) * (1 - u * u * (.6 + .4 * u));
    const ang = kind === 'v' ? Math.atan2(yb - y0, a) * (x < 0 ? -1 : 1) : Math.atan2((yb - y0) * 2 * u * (x < 0 ? -1 : 1), a) ;
    const dx = Math.sin(ang) * w * .8, dy = -Math.cos(ang) * w * .8;
    s += `<line x1="${n3(x)}" y1="${n3(y)}" x2="${n3(x + dx)}" y2="${n3(y + dy)}"/>`;
  }
  return `<g stroke="${line}" stroke-width=".012" opacity=".45">${s}</g>`;
}

// → { under, over }: `under` covers the sketch's own neckline (white, so it takes the garment's colour with the drawing); `over` is the new
// neckline in the cloth colour with its lines. m: the piece's measurements (neckWidth, neckDropFront, neckDropBack), at the size drawn.
export function necklineSvg(p = {}, view = 'front', m = {}, { cloth = '#ffffff', line = '#141416' } = {}) {
  const n = necklineOf(p.neckline); if (!n || !takesNeckline(p.style)) return { under: '', over: '' };
  // the sketches draw the neck a little wider than the seam-to-seam spec: drawn to match them, so it sits where the sketch's sat
  const nh = (m.neckWidth || 7.5) / 2 * 1.2, df = m.neckDropFront ?? 3.5, db = m.neckDropBack ?? 1, w = n.rib, fill = cloth || '#ffffff', inside = shade(fill, .28), deep = shade(fill, .45);
  const stroke = `stroke="${line}" stroke-width=".04" stroke-linejoin="round"`, stitch = `stroke="${line}" stroke-width=".02" stroke-dasharray=".14 .09" fill="none"`;
  const lowest = view === 'back' ? db + w + .8 : Math.max(df, 3.5) + 1.6 + (n.vDrop || 0);
  // the cover: the neck area of the sketch, kept inside the shoulders so it never spills past the garment
  const under = `<path d="M ${n3(-nh - .15)} .18 L ${n3(nh + .15)} .18 L ${n3(nh + .65)} 1.25 C ${n3(nh + .6)} ${n3(Math.max(lowest * .8, 1.7))} ${n3(nh * .6)} ${n3(lowest)} 0 ${n3(lowest)} C ${n3(-nh * .6)} ${n3(lowest)} ${n3(-nh - .6)} ${n3(Math.max(lowest * .8, 1.7))} ${n3(-nh - .65)} 1.25 Z" fill="#ffffff"/>`; // narrow at the top and wider lower down, so the shoulder line and raglan seams are left alone
  let over = '';
  if (view === 'back') {
    if (n.stand) { // the back of the stand
      const top = -n.stand, a = nh - .2;
      over = `<path d="M ${n3(-nh)} ${n3(db * .5)} L ${n3(-a)} ${n3(top)} C ${n3(-a * .4)} ${n3(top + .12)} ${n3(a * .4)} ${n3(top + .12)} ${n3(a)} ${n3(top)} L ${n3(nh)} ${n3(db * .5)} C ${n3(nh * .5)} ${n3(db)} ${n3(-nh * .5)} ${n3(db)} ${n3(-nh)} ${n3(db * .5)} Z" fill="${fill}" ${stroke}/>`
        + (n.fold ? `<path d="M ${n3(-a - .05)} ${n3(top * .42)} C ${n3(-a * .4)} ${n3(top * .42 + .14)} ${n3(a * .4)} ${n3(top * .42 + .14)} ${n3(a + .05)} ${n3(top * .42)}" ${stroke} fill="none"/>` : '')
        + ribLines('u', a, top + .1, top + .1, -(n.stand - .2), line, 30);
    } else {
      over = `<path d="${U(nh, 0, db)} ${Ur(nh - w * .35, -w * .25, db - w * .95)}" fill="${fill}" ${stroke}/>` + ribLines('u', nh - w * .2, -w * .1, db - w * .05, w * .9, line) + `<path d="${U(nh * .98, .1, db + .14)}" ${stitch}/>`;
    }
    return { under, over: `<g data-neckline="${n.id}" pointer-events="none">${over}</g>` };
  }
  if (n.stand) {
    const top = -n.stand, a = nh - .25 + (n.fold ? .2 : 0), seam = df * .35;
    // the inside of the back of the stand, seen over the front's top edge
    over += `<ellipse cx="0" cy="${n3(top + .05)}" rx="${n3(a - .05)}" ry=".42" fill="${inside}" ${stroke}/><ellipse cx="0" cy="${n3(top + .14)}" rx="${n3(a - .45)}" ry=".24" fill="${deep}"/>`;
    over += `<path d="M ${n3(-nh)} .05 L ${n3(-a)} ${n3(top)} C ${n3(-a * .45)} ${n3(top + .5)} ${n3(a * .45)} ${n3(top + .5)} ${n3(a)} ${n3(top)} L ${n3(nh)} .05 C ${n3(nh * .55)} ${n3(seam)} ${n3(-nh * .55)} ${n3(seam)} ${n3(-nh)} .05 Z" fill="${fill}" ${stroke}/>`;
    // wales running up the stand, and the fold of a turtleneck
    let wales = ''; for (let i = 1; i < 26; i++) { const t = i / 26, xb = -nh + 2 * nh * t, xt = -a + 2 * a * t, yb2 = .05 + (seam - .05) * (1 - Math.pow(Math.abs(xb) / nh, 2)), yt = top + .38 * (1 - Math.pow(Math.abs(xt) / a, 2)); wales += `<line x1="${n3(xb)}" y1="${n3(yb2)}" x2="${n3(xt)}" y2="${n3(yt)}"/>`; }
    over += `<g stroke="${line}" stroke-width=".012" opacity=".45">${wales}</g>`;
    if (n.fold) over += `<path d="M ${n3(-a + .12)} ${n3(top * .38)} C ${n3(-a * .45)} ${n3(top * .38 + .42)} ${n3(a * .45)} ${n3(top * .38 + .42)} ${n3(a - .12)} ${n3(top * .38)}" ${stroke} fill="none"/>`;
    over += `<path d="M ${n3(-nh + .05)} .14 C ${n3(nh * -.55)} ${n3(seam + .1)} ${n3(nh * .55)} ${n3(seam + .1)} ${n3(nh - .05)} .14" ${stitch}/>`;
    return { under, over: `<g data-neckline="${n.id}" pointer-events="none">${over}</g>` };
  }
  const isV = Boolean(n.vDrop), front = isV ? df + n.vDrop : df, inA = nh - w * .9, inY = -w * .08;
  // the opening: the back neck's rib and the inside of the back, seen through it
  over += `<path d="${isV ? V(nh, 0, front) : U(nh, 0, front)} ${Ur(nh, 0, db)}" fill="${inside}"/>`;
  over += `<path d="${U(nh - w * .2, .02, db)} ${Ur(nh - w * .55, .02, db + w * .75)}" fill="${shade(fill, .12)}" ${stroke}/>`;
  // the front band
  const outer = isV ? V(nh, 0, front) : U(nh, 0, front), inner = isV ? Vr(inA, inY, front - w * 1.35) : Ur(inA, inY, front - w);
  over += `<path d="${outer} ${inner}" fill="${fill}" ${stroke}/>` + ribLines(isV ? 'v' : 'u', nh - w * .45, 0, front - w * .5, -w * .7, line);
  if (isV) over += `<line x1="0" y1="${n3(front)}" x2="0" y2="${n3(front - w * 1.35)}" ${stroke}/>`; // the mitre at the point
  over += `<path d="${isV ? V(nh * 1.01, .12, front + .16) : U(nh * 1.01, .1, front + .16)}" ${stitch}/>`;
  return { under, over: `<g data-neckline="${n.id}" pointer-events="none">${over}</g>` };
}

// Fabrics, trims, footwear and plush materials and plastics, drawn: a swatch of the cloth in its weave and colour, or the trim as it looks, for library cards that have no photo yet.
// Shared by the server and the page (/lab/lab-swatches.js), so it has no imports. Every id inside an SVG carries `uid`, since many sit on one page.

const W = 400, H = 300;
const hexOk = h => /^#[0-9a-f]{6}$/i.test(String(h || ''));
function shade(hex, amt) { // amt −1…1: towards black or white
  const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt));
  return '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
}
const lum = hex => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };

// a metal's colour from its finish words, or null when the trim is not metal
export function metalOf(spec = {}) {
  const w = `${spec.finish || ''} ${spec.material || ''}`.toLowerCase();
  if (/matte black|black oxide|gunmetal/.test(w)) return { base: '#3a3a3d', hi: '#77777c', lo: '#1c1c1e' };
  if (/antique brass|bronze/.test(w)) return { base: '#8d7444', hi: '#c9ad73', lo: '#4f3f22' };
  if (/antique nickel|antique silver|pewter/.test(w)) return { base: '#86857f', hi: '#c4c3bc', lo: '#4b4a46' };
  if (/copper/.test(w) && !/nickel|brass/.test(w)) return { base: '#a8673f', hi: '#dc9d72', lo: '#5d3520' };
  if (/nickel|silver|chrome|steel|zinc|alumin/.test(w)) return { base: '#b4b6b9', hi: '#eceef0', lo: '#6c6e72' };
  if (/brass|gold|metal/.test(w)) return { base: '#bd9a4c', hi: '#ead08c', lo: '#6e5520' };
  return null;
}

// the colour to draw in: the material's first colour, else one that suits what it is
function colourOf(m, fallback) { const c = (m.colours || []).find(x => hexOk(x.hex)); return c ? c.hex : fallback; }

const grain = uid => `<filter id="g${uid}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
const shadow = uid => `<filter id="s${uid}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#141416" flood-opacity=".18"/></filter>`;
const svg = (uid, defs, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${String(label || '').replace(/[&<>"]/g, '')}"><defs>${grain(uid)}${shadow(uid)}${defs}</defs>${body}</svg>`;

// ---- fabrics ----
// the weave or knit as a repeating tile; `back` is the reverse side where it differs (terry loops, brushed fleece)
function weave(kind, c, uid, id) {
  const d = shade(c, lum(c) < 60 ? -.5 : -.28), l = shade(c, lum(c) < 60 ? .22 : .16);
  switch (kind) {
    case 'denim': return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)"><rect width="6" height="6" fill="${c}"/><path d="M0 1.5 H6" stroke="${shade(c, .55)}" stroke-width="1.1" opacity=".45"/><path d="M0 4.5 H6" stroke="${d}" stroke-width="1.6" opacity=".6"/></pattern>`;
    case 'twill': return `<pattern id="${id}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="5" height="5" fill="${c}"/><path d="M0 1.2 H5" stroke="${l}" stroke-width="1.3" opacity=".7"/><path d="M0 3.7 H5" stroke="${d}" stroke-width="1.3" opacity=".5"/></pattern>`;
    case 'rib': return `<pattern id="${id}" width="14" height="8" patternUnits="userSpaceOnUse"><rect width="14" height="8" fill="${d}"/><rect x="1" width="6" height="8" rx="3" fill="${l}"/><path d="M2 1 L4 6 L6 1" fill="none" stroke="${d}" stroke-width=".7" opacity=".4"/></pattern>`;
    case 'jersey': return `<pattern id="${id}" width="8" height="9" patternUnits="userSpaceOnUse"><rect width="8" height="9" fill="${c}"/><path d="M.6 .5 Q2 8 4 8.5 Q6 8 7.4 .5" fill="none" stroke="${d}" stroke-width="1" opacity=".45"/><path d="M1.6 1 Q2.6 6.5 4 7.2" fill="none" stroke="${l}" stroke-width=".8" opacity=".55"/></pattern>`;
    case 'ripstop': return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${c}"/><path d="M0 4.5 H18 M0 9 H18 M0 13.5 H18 M4.5 0 V18 M9 0 V18 M13.5 0 V18" stroke="${d}" stroke-width=".5" opacity=".25"/><path d="M0 .8 H18 M.8 0 V18" stroke="${l}" stroke-width="1.4" opacity=".75"/></pattern>`;
    case 'corduroy': return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${d}"/><rect x="1" width="8" height="10" rx="4" fill="${c}"/><rect x="3" width="2.5" height="10" fill="${l}" opacity=".6"/></pattern>`;
    case 'fleece': return `<pattern id="${id}" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="${l}"/></pattern>`;
    case 'loops': return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${shade(c, .1)}"/><circle cx="2.5" cy="2.5" r="1.6" fill="none" stroke="${d}" stroke-width=".9" opacity=".55"/><circle cx="6.5" cy="6.5" r="1.6" fill="none" stroke="${d}" stroke-width=".9" opacity=".55"/></pattern>`;
    default: return `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${c}"/><path d="M0 1.5 H3 M3 4.5 H6" stroke="${l}" stroke-width="1.6" opacity=".7"/><path d="M4.5 0 V3 M1.5 3 V6" stroke="${d}" stroke-width="1.6" opacity=".45"/></pattern>`; // plain weave: canvas, poplin, oxford
  }
}
export function fabricLook(construction = '') {
  const w = String(construction).toLowerCase();
  if (/denim|chambray/.test(w)) return { face: 'denim', back: 'twill' };
  if (/loopback|terry/.test(w)) return { face: 'jersey', back: 'loops' };
  if (/fleece|brushed|sherpa|polar/.test(w)) return { face: 'jersey', back: 'fleece' };
  if (/rib/.test(w)) return { face: 'rib', back: 'rib' };
  if (/jersey|interlock|pique|piqué|knit/.test(w)) return { face: 'jersey', back: 'jersey' };
  if (/ripstop/.test(w)) return { face: 'ripstop', back: 'ripstop' };
  if (/cord/.test(w)) return { face: 'corduroy', back: 'plain' };
  if (/twill|gabardine|drill|herringbone/.test(w)) return { face: 'twill', back: 'twill' };
  return { face: 'plain', back: 'plain' };
}
function fabricSvg(m, uid) {
  const s = m.spec || {}, c = colourOf(m, '#c9c2b2'), look = fabricLook(s.construction);
  const face = `f${uid}`, back = `b${uid}`;
  // the cut swatch: pinked on the right and bottom, its corner turned over to show the reverse
  const x0 = 62, y0 = 40, x1 = 338, y1 = 252, fx = 268, fy = 186;
  const zig = (ax, ay, bx, by, n) => { let p = ''; for (let i = 1; i <= n; i++) { const t = i / n, mx = ax + (bx - ax) * (t - .5 / n), my = ay + (by - ay) * (t - .5 / n), ox = (by - ay) ? 5 : 0, oy = (bx - ax) ? 5 : 0; p += ` L ${mx + ox} ${my + oy} L ${ax + (bx - ax) * t} ${ay + (by - ay) * t}`; } return p; };
  const outline = `M ${x0} ${y0} H ${x1}${zig(x1, y0, x1, fy, 18)} L ${fx} ${y1}${zig(fx, y1, x0, y1, 20)} Z`;
  const flap = `M ${x1} ${fy} L ${fx} ${y1} L ${fx - 8} ${fy - 30} Z`;
  const fuzz = look.back === 'fleece' ? `<filter id="z${uid}"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>` : '';
  const defs = weave(look.face, c, uid, face) + weave(look.back, c, uid, back) + fuzz + `<linearGradient id="l${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".14"/></linearGradient><linearGradient id="k${uid}" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>`;
  const body = `<g transform="rotate(-3 200 150)"><g filter="url(#s${uid})"><path d="${outline}" fill="url(#${face})"/></g>`
    + `<path d="${outline}" fill="url(#l${uid})"/><path d="${outline}" fill="#fff" filter="url(#g${uid})" opacity=".9"/>`
    + `<path d="${flap}" fill="url(#${back})"/>${fuzz ? `<path d="${flap}" fill="#fff" filter="url(#z${uid})" opacity=".8"/>` : ''}<path d="${flap}" fill="url(#k${uid})"/>`
    + `<path d="M ${x1} ${fy} L ${fx} ${y1}" stroke="${shade(c, -.35)}" stroke-width="1" opacity=".5"/>`
    + (look.face === 'denim' ? `<path d="M ${x0} ${y0 + 6} H ${x1}" stroke="#f3efe6" stroke-width="5"/><path d="M ${x0} ${y0 + 9} H ${x1}" stroke="#b8323c" stroke-width="1.4" stroke-dasharray="7 3"/>` : '') // the selvedge
    + `</g>`;
  return svg(uid, defs, body, `${m.name || 'fabric'} swatch`);
}

// ---- trims ----
function metalGrad(id, mt) { return `<radialGradient id="${id}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${mt.hi}"/><stop offset=".55" stop-color="${mt.base}"/><stop offset="1" stop-color="${mt.lo}"/></radialGradient>`; }
function trimSvg(m, uid) {
  const s = m.spec || {}, cat = String(s.category || 'other').toLowerCase(), mt = metalOf(s), mg = `m${uid}`;
  const tex = /metal|brass|nickel|steel|copper|zinc/.test(`${s.material} ${s.finish}`) ? mt || metalOf({ finish: 'brass' }) : mt;
  const c = colourOf(m, /black/.test(s.finish || '') ? '#26262a' : '#cfc5b0'), d = shade(c, -.3), l = shade(c, .25);
  let defs = tex ? metalGrad(mg, tex) : '', body = '';
  const M = tex ? `url(#${mg})` : c;
  switch (cat) {
    case 'button': {
      if (tex || /shank|jean/.test(String(m.name).toLowerCase())) { // a shank (jeans) button
        const one = (x, y, r) => `<g filter="url(#s${uid})"><circle cx="${x}" cy="${y}" r="${r}" fill="${M}"/></g><circle cx="${x}" cy="${y}" r="${r * .78}" fill="none" stroke="${tex ? tex.lo : d}" stroke-width="2" opacity=".6"/><circle cx="${x}" cy="${y}" r="${r * .62}" fill="none" stroke="${tex ? tex.hi : l}" stroke-width="1.2" opacity=".7"/><circle cx="${x}" cy="${y}" r="${r * .14}" fill="${tex ? tex.lo : d}" opacity=".7"/>`;
        body = one(170, 150, 74) + one(296, 196, 44);
      } else {
        const one = (x, y, r) => `<g filter="url(#s${uid})"><circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/></g><circle cx="${x}" cy="${y}" r="${r * .8}" fill="${d}" opacity=".18"/><circle cx="${x}" cy="${y}" r="${r * .74}" fill="${c}"/><path d="M ${x - r * .55} ${y - r * .6} A ${r * .9} ${r * .9} 0 0 1 ${x + r * .5} ${y - r * .66}" fill="none" stroke="#fff" stroke-width="${r * .06}" opacity=".35" stroke-linecap="round"/>` + [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => `<circle cx="${x + a * r * .2}" cy="${y + b * r * .2}" r="${r * .085}" fill="${shade(c, -.55)}"/>`).join('');
        body = one(168, 148, 76) + one(298, 200, 42) + one(300, 92, 30);
      }
      break;
    }
    case 'rivet': case 'snap': case 'eyelet': {
      const g = tex || metalOf({ finish: 'brass' }); if (!tex) defs += metalGrad(mg, g);
      const one = (x, y, r) => cat === 'rivet'
        ? `<g filter="url(#s${uid})"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${mg})"/></g><circle cx="${x}" cy="${y}" r="${r * .55}" fill="none" stroke="${g.lo}" stroke-width="1.5" opacity=".5"/><ellipse cx="${x - r * .3}" cy="${y - r * .35}" rx="${r * .25}" ry="${r * .14}" fill="#fff" opacity=".45"/>`
        : cat === 'snap'
          ? `<g filter="url(#s${uid})"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${mg})"/></g><circle cx="${x}" cy="${y}" r="${r * .62}" fill="${g.lo}" opacity=".55"/><circle cx="${x}" cy="${y}" r="${r * .42}" fill="url(#${mg})"/><circle cx="${x}" cy="${y}" r="${r * .16}" fill="${g.lo}"/>`
          : `<g filter="url(#s${uid})"><circle cx="${x}" cy="${y}" r="${r}" fill="url(#${mg})"/></g><circle cx="${x}" cy="${y}" r="${r * .56}" fill="#e9e5dc"/><circle cx="${x}" cy="${y}" r="${r * .56}" fill="none" stroke="${g.lo}" stroke-width="2"/>`;
      body = one(160, 150, 66) + one(282, 112, 40) + one(290, 214, 34);
      break;
    }
    case 'zip': {
      const coil = /coil|nylon/.test(String(s.material)), tape = colourOf(m, '#2a2a2e'), teeth = coil ? shade(tape, lum(tape) < 60 ? .25 : -.25) : null, tg = tex || metalOf({ finish: 'brass' }); if (!tex && !coil) defs += metalGrad(mg, tg);
      let t = ''; for (let y = 34; y < 270; y += coil ? 7 : 11) t += coil ? `<path d="M 192 ${y} Q 200 ${y + 3} 208 ${y}" stroke="${teeth}" stroke-width="3.2" fill="none" stroke-linecap="round"/>` : `<rect x="${(y / 11) % 2 < 1 ? 186 : 196}" y="${y}" width="18" height="8" rx="2" fill="url(#${mg})"/>`;
      body = `<g filter="url(#s${uid})"><rect x="150" y="20" width="100" height="262" rx="4" fill="${tape}"/></g><path d="M 158 20 V 282 M 242 20 V 282" stroke="${shade(tape, .2)}" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>${t}`
        + (() => { const sg = tex || metalOf({ finish: 'nickel' }); defs += metalGrad(`p${uid}`, sg); return `<g filter="url(#s${uid})"><path d="M 182 86 H 218 L 214 132 H 186 Z" fill="url(#p${uid})"/><rect x="190" y="124" width="20" height="78" rx="9" fill="url(#p${uid})"/></g><rect x="196" y="176" width="8" height="18" rx="4" fill="${tape}"/>`; })();
      break;
    }
    case 'drawcord': case 'aglet': case 'webbing': case 'twill tape': case 'binding': case 'elastic': {
      const flat = cat !== 'aglet' && /flat|tape|webbing|binding|elastic/.test(`${cat} ${m.name}`), wdt = cat === 'elastic' ? 40 : cat === 'webbing' ? 34 : flat ? 18 : 12;
      const path = 'M 40 210 C 120 60, 210 290, 280 140 S 360 70, 372 90';
      const pat = `t${uid}`;
      defs += cat === 'elastic' ? `<pattern id="${pat}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="${c}"/><path d="M3 0 V6" stroke="${d}" stroke-width="1.4" opacity=".5"/></pattern>`
        : `<pattern id="${pat}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${c}"/><path d="M0 3 H6" stroke="${d}" stroke-width="1.5" opacity=".45"/></pattern>`;
      body = `<g filter="url(#s${uid})"><path d="${path}" fill="none" stroke="${d}" stroke-width="${wdt + 2}" stroke-linecap="butt"/></g><path d="${path}" fill="none" stroke="${c}" stroke-width="${wdt}"/><path d="${path}" fill="none" stroke="${l}" stroke-width="${wdt * .25}" opacity=".45" transform="translate(0 -${wdt * .2})"/>`
        + `<path d="${path}" fill="none" stroke="${d}" stroke-width="${wdt * .7}" stroke-dasharray="2 4" opacity=".28"/>`;
      if (cat === 'aglet') { defs += metalGrad(`a${uid}`, tex || metalOf({ finish: 'brass' })); body += `<g filter="url(#s${uid})"><rect x="20" y="${210 - wdt * .7}" width="34" height="${wdt * 1.4}" rx="4" fill="url(#a${uid})" transform="rotate(-58 37 210)"/><rect x="360" y="${90 - wdt * .7}" width="34" height="${wdt * 1.4}" rx="4" fill="url(#a${uid})" transform="rotate(28 377 90)"/></g>`; }
      break;
    }
    case 'thread': {
      const tc = colourOf(m, '#3c4a63'); let wind = ''; for (let y = 90; y < 236; y += 5) wind += `<path d="M ${168 - (y - 90) * .22} ${y} H ${232 + (y - 90) * .22}" stroke="${shade(tc, (y % 10) ? .12 : -.12)}" stroke-width="2.4"/>`;
      body = `<g filter="url(#s${uid})"><path d="M 166 86 H 234 L 268 244 H 132 Z" fill="${tc}"/></g>${wind}<path d="M 132 244 H 268 L 272 258 H 128 Z" fill="#d9cfbd"/><path d="M 186 58 H 214 L 220 86 H 180 Z" fill="#d9cfbd"/><path d="M 200 86 C 230 70, 290 60, 330 92" fill="none" stroke="${tc}" stroke-width="1.6"/>`;
      break;
    }
    case 'cord stopper': {
      body = `<g filter="url(#s${uid})"><rect x="140" y="80" width="120" height="150" rx="40" fill="${c === '#cfc5b0' ? '#2a2a2e' : c}"/></g><circle cx="200" cy="140" r="22" fill="#e9e5dc"/><circle cx="200" cy="140" r="22" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3"/><rect x="176" y="40" width="48" height="44" rx="10" fill="#4a4a4f"/>`;
      break;
    }
    case 'buckle': {
      const bc = tex ? `url(#${mg})` : (c === '#cfc5b0' ? '#2a2a2e' : c);
      body = `<g filter="url(#s${uid})"><path d="M 90 100 H 230 L 250 120 V 180 L 230 200 H 90 Z" fill="${bc}"/><path d="M 238 112 H 318 V 188 H 238 Z" fill="${bc}"/></g><rect x="110" y="122" width="96" height="56" rx="6" fill="#e9e5dc"/><rect x="258" y="130" width="40" height="40" rx="4" fill="#e9e5dc"/>`;
      break;
    }
    case 'hook and loop': {
      let hooks = ''; for (let x = 96; x < 306; x += 9) for (let y = 186; y < 236; y += 9) hooks += `<circle cx="${x + ((y / 9) % 2) * 4}" cy="${y}" r="1.6" fill="${d}"/>`;
      body = `<g filter="url(#s${uid})"><rect x="90" y="70" width="220" height="70" rx="6" fill="${c}"/><rect x="90" y="176" width="220" height="70" rx="6" fill="${l}"/></g><rect x="90" y="70" width="220" height="70" rx="6" fill="#fff" filter="url(#g${uid})"/>${hooks}`;
      break;
    }
    case 'interlining': case 'shoulder pad': {
      let dots = ''; if (cat === 'interlining') for (let x = 96; x < 300; x += 12) for (let y = 70; y < 230; y += 12) dots += `<circle cx="${x}" cy="${y}" r="1.4" fill="#000" opacity=".12"/>`;
      body = cat === 'interlining' ? `<g filter="url(#s${uid})"><rect x="84" y="56" width="232" height="188" fill="${colourOf(m, '#f1ede4')}"/></g>${dots}<path d="M 316 190 L 262 244 H 316 Z" fill="#000" opacity=".06"/>`
        : `<g filter="url(#s${uid})"><path d="M 90 210 C 110 90, 290 90, 310 210 Z" fill="${colourOf(m, '#ece6d8')}"/></g><path d="M 120 196 C 140 120, 260 120, 280 196" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="2" stroke-dasharray="4 4"/>`;
      break;
    }
    default: body = `<g filter="url(#s${uid})"><circle cx="200" cy="150" r="70" fill="${M}"/></g><circle cx="200" cy="150" r="70" fill="#fff" filter="url(#g${uid})"/>`;
  }
  return svg(uid, defs, body, `${m.name || 'trim'}`);
}

// ---- footwear, plush and plastics ----
// a hide: an irregular cut piece, its edge showing its thickness; the grain, the nap or the gloss on its face
const HIDE = 'M 70 70 C 120 38, 220 46, 300 42 C 344 60, 352 120, 338 176 C 330 228, 296 260, 210 258 C 140 262, 82 250, 60 200 C 44 150, 46 104, 70 70 Z';
function goodsSvg(m, uid) {
  const s = m.spec || {}, cat = String(s.category || '').toLowerCase(), fin = String(s.finish || '').toLowerCase(), c = colourOf(m, m.kind === 'plastic' ? '#a5a8ac' : m.kind === 'plush' ? '#e7d9c2' : '#a46a3c');
  const d = shade(c, lum(c) < 60 ? -.5 : -.3), l = shade(c, lum(c) < 60 ? .25 : .18);
  let defs = '', body = '';
  const leathery = m.kind === 'footwear' && (/leather|suede|nubuck|lining/.test(cat) && !/textile|polyester/.test(String(s.composition)));
  if (leathery) {
    const nap = /suede|nubuck|brushed/.test(`${cat} ${fin}`), patent = /patent|gloss/.test(`${cat} ${fin}`), pebble = /pebble/.test(fin);
    defs += `<linearGradient id="sh${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${patent ? .55 : .14}"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></linearGradient>`;
    if (pebble) defs += `<pattern id="pb${uid}" width="14" height="12" patternUnits="userSpaceOnUse"><rect width="14" height="12" fill="${c}"/><path d="M1 3 Q4 0 7 3 Q8 7 4 8 Q0 7 1 3 Z M8 8 Q11 5 13 8 Q13 11 10 11.5 Q7 11 8 8 Z" fill="${l}" stroke="${d}" stroke-width=".5" opacity=".75"/></pattern>`;
    if (nap) defs += `<filter id="nap${uid}"><feTurbulence type="fractalNoise" baseFrequency="1.2 .35" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .35 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
    body = `<g filter="url(#s${uid})"><path d="${HIDE}" transform="translate(6 8)" fill="${shade(c, -.45)}"/><path d="${HIDE}" fill="${pebble ? `url(#pb${uid})` : c}"/></g>`
      + (nap ? `<path d="${HIDE}" fill="#fff" filter="url(#nap${uid})"/><path d="M 110 120 C 170 90, 250 110, 300 90" stroke="${l}" stroke-width="40" stroke-linecap="round" opacity=".35" fill="none"/>` : `<path d="${HIDE}" fill="#fff" filter="url(#g${uid})" opacity=".8"/>`)
      + `<path d="${HIDE}" fill="url(#sh${uid})"/>` + (patent ? `<path d="M 100 92 C 160 70, 240 76, 300 64" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".55" fill="none"/><path d="M 120 112 C 170 96, 220 100, 260 92" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".4" fill="none"/>` : '');
    return svg(uid, defs, body, `${m.name || 'leather'}`);
  }
  // a block seen from above and its side: foams and soles
  const block = (top, side, h = 46, face = '') => `<g filter="url(#s${uid})"><path d="M 70 ${150 + h} L 330 ${150 + h} L 330 150 L 70 150 Z" fill="${side}"/><path d="M 70 150 L 120 80 L 380 80 L 330 150 Z" fill="${top}"/><path d="M 330 150 L 380 80 L 380 ${80 + h} L 330 ${150 + h} Z" fill="${shade(side, -.15)}"/></g>${face}`;
  const pores = (n, col, op) => { let p = ''; for (let i = 0; i < n; i++) { const x = 80 + ((i * 97) % 245), y = 156 + ((i * 53) % 38); p += `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * .6}" fill="${col}" opacity="${op}"/>`; } return p; };
  if (m.kind === 'footwear') {
    if (/mesh/.test(cat)) { defs += `<pattern id="mh${uid}" width="16" height="14" patternUnits="userSpaceOnUse"><rect width="16" height="14" fill="${c}"/><ellipse cx="4" cy="3.5" rx="2.6" ry="2" fill="${shade(c, -.6)}"/><ellipse cx="12" cy="10.5" rx="2.6" ry="2" fill="${shade(c, -.6)}"/></pattern>`; body = `<g filter="url(#s${uid})"><rect x="60" y="50" width="280" height="200" rx="18" fill="url(#mh${uid})"/></g><rect x="60" y="50" width="280" height="200" rx="18" fill="#fff" filter="url(#g${uid})" opacity=".6"/>`; }
    else if (/knit|textile|lining/.test(cat)) { defs += weave(/knit/.test(cat) ? 'jersey' : 'plain', c, uid, `w${uid}`); body = `<g filter="url(#s${uid})"><rect x="60" y="50" width="280" height="200" rx="10" fill="url(#w${uid})"/></g><rect x="60" y="50" width="280" height="200" rx="10" fill="#fff" filter="url(#g${uid})" opacity=".7"/>`; }
    else if (/foam/.test(cat)) body = block(c, shade(c, -.1), 40) + pores(60, shade(c, -.35), .5);
    else if (/midsole/.test(cat)) body = `<g filter="url(#s${uid})"><path d="M 50 210 C 50 170, 90 150, 160 150 L 300 140 C 340 138, 360 150, 360 175 L 352 210 Z" fill="${c}"/><path d="M 50 210 L 352 210 L 350 224 L 54 224 Z" fill="${shade(c, -.2)}"/></g>${pores(70, shade(c, -.25), .45).replace(/cy="(\d+)/g, (_, y) => `cy="${Number(y) + 18}`)}<path d="M 70 190 C 160 182, 260 176, 340 168" stroke="${shade(c, -.15)}" stroke-width="2" fill="none" opacity=".6"/>`;
    else if (/outsole/.test(cat)) { defs += `<pattern id="tr${uid}" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="22" height="22" fill="${c}"/><path d="M0 6 H22 M0 16 H22" stroke="${shade(c, -.4)}" stroke-width="4"/></pattern>`; body = `<g filter="url(#s${uid})"><path d="M 80 60 C 150 30, 270 40, 320 70 C 350 110, 340 220, 300 250 C 240 272, 150 268, 100 240 C 60 200, 50 110, 80 60 Z" fill="url(#tr${uid})"/></g><path d="M 80 60 C 150 30, 270 40, 320 70 C 350 110, 340 220, 300 250 C 240 272, 150 268, 100 240 C 60 200, 50 110, 80 60 Z" fill="none" stroke="${shade(c, -.35)}" stroke-width="6"/>`; }
    else if (/insole|sockliner/.test(cat)) body = `<g filter="url(#s${uid})"><path d="M 60 150 C 60 110, 110 92, 170 96 C 250 100, 330 96, 350 140 C 362 180, 320 210, 250 206 C 190 202, 140 214, 100 206 C 70 198, 60 180, 60 150 Z" fill="${c}"/></g><path d="M 60 150 C 60 110, 110 92, 170 96 C 250 100, 330 96, 350 140 C 362 180, 320 210, 250 206 C 190 202, 140 214, 100 206 C 70 198, 60 180, 60 150 Z" fill="#fff" filter="url(#g${uid})"/>`;
    else if (/counter|shank/.test(cat)) body = `<g filter="url(#s${uid})"><path d="M 110 230 C 90 160, 110 90, 200 80 C 290 90, 310 160, 290 230 C 250 205, 150 205, 110 230 Z" fill="${shade(c, .1)}" opacity=".85"/></g><path d="M 140 110 C 170 96, 230 96, 260 110" stroke="#fff" stroke-width="6" opacity=".5" fill="none" stroke-linecap="round"/>`;
    else if (/laces/.test(cat)) return trimSvg({ ...m, spec: { category: 'drawcord', material: s.composition, finish: s.finish } }, uid);
    else if (/eyelet/.test(cat)) return trimSvg({ ...m, spec: { category: 'eyelet', material: s.composition, finish: `${s.finish} ${s.composition}` } }, uid);
    else if (/thread/.test(cat)) return trimSvg({ ...m, spec: { category: 'thread' } }, uid);
    else body = block(c, shade(c, -.12), 30);
    return svg(uid, defs, body, `${m.name || 'material'}`);
  }
  if (m.kind === 'plush') {
    if (/pile|fur/.test(cat)) {
      // pile: short soft strokes; fur: longer strands that lie one way
      const fur = /fur/.test(cat) || Number(s.pileMm) >= 6, len = fur ? 16 : 6; let st = '';
      for (let i = 0; i < (fur ? 260 : 420); i++) { const x = 70 + ((i * 73) % 262), y = 60 + ((i * 41) % 180), a = fur ? .5 + (i % 5) * .08 : (i % 7) * .9; st += `<path d="M ${x} ${y} l ${(Math.cos(a) * len).toFixed(1)} ${(Math.sin(a) * len).toFixed(1)}" stroke="${i % 3 ? l : d}" stroke-width="${fur ? 2.2 : 1.6}" stroke-linecap="round" opacity=".55"/>`; }
      body = `<g filter="url(#s${uid})"><rect x="60" y="50" width="280" height="200" rx="${fur ? 30 : 14}" fill="${c}"/></g><g clip-path="url(#cl${uid})">${st}</g>`; defs += `<clipPath id="cl${uid}"><rect x="60" y="50" width="280" height="200" rx="${fur ? 30 : 14}"/></clipPath>`;
    } else if (/felt/.test(cat)) body = `<g filter="url(#s${uid})"><rect x="70" y="60" width="260" height="180" rx="4" fill="${c}"/></g><rect x="70" y="60" width="260" height="180" rx="4" fill="#fff" filter="url(#g${uid})"/><circle cx="160" cy="150" r="34" fill="none" stroke="${d}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".6"/>`;
    else if (/fill/.test(cat)) { let b = ''; for (let i = 0; i < 22; i++) b += `<circle cx="${110 + ((i * 61) % 180)}" cy="${110 + ((i * 37) % 90)}" r="${26 + (i % 4) * 6}" fill="${c}" opacity=".85"/>`; defs += `<filter id="bl${uid}"><feGaussianBlur stdDeviation="3"/></filter>`; body = `<g filter="url(#s${uid})"><g filter="url(#bl${uid})">${b}</g></g>`; }
    else if (/pellet/.test(cat)) { let b = ''; for (let i = 0; i < 140; i++) b += `<circle cx="${90 + ((i * 47) % 220)}" cy="${90 + ((i * 29) % 130)}" r="5" fill="${c}" stroke="${shade(c, -.3)}" stroke-width=".8"/>`; body = `<g filter="url(#s${uid})">${b}</g>`; }
    else if (/eye/.test(cat)) { defs += `<radialGradient id="ey${uid}" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="${shade(c, .45)}"/><stop offset=".4" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -.6)}"/></radialGradient>`; body = `<g filter="url(#s${uid})"><circle cx="160" cy="150" r="62" fill="url(#ey${uid})"/><rect x="250" y="138" width="80" height="24" rx="4" fill="#d9d6cf"/><circle cx="290" cy="150" r="36" fill="none" stroke="#e8e5de" stroke-width="10"/></g><circle cx="140" cy="128" r="12" fill="#fff" opacity=".85"/>`; }
    else if (/nose/.test(cat)) { defs += `<radialGradient id="ey${uid}" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="${shade(c, .45)}"/><stop offset="1" stop-color="${shade(c, -.5)}"/></radialGradient>`; body = `<g filter="url(#s${uid})"><path d="M 110 110 Q 200 80 290 110 Q 270 190 200 220 Q 130 190 110 110 Z" fill="url(#ey${uid})"/></g><path d="M 150 112 Q 200 100 240 112" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6" fill="none"/>`; }
    else if (/thread/.test(cat)) return trimSvg({ ...m, spec: { category: 'thread' } }, uid);
    else if (/ribbon/.test(cat)) return trimSvg({ ...m, spec: { category: 'twill tape' } }, uid);
    else body = `<g filter="url(#s${uid})"><circle cx="200" cy="150" r="70" fill="${c}"/></g>`;
    return svg(uid, defs, body, `${m.name || 'plush material'}`);
  }
  // plastics: a moulded colour plaque, stepped in thickness, its finish on the face; clear and translucent ones over a checker so they read as such
  const clear = s.transparency === 'clear', transl = s.transparency === 'translucent', gloss = /A-1|A-2|polished|gloss/i.test(fin), textured = /MT-|VDI|D-2|texture/i.test(fin), frosted = /frost/i.test(fin), soft = /TPU|TPE|silicone/i.test(cat);
  defs += `<pattern id="ck${uid}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#f4f4f2"/><rect width="12" height="12" fill="#dcdcd8"/><rect x="12" y="12" width="12" height="12" fill="#dcdcd8"/></pattern>`;
  defs += `<linearGradient id="gl${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${gloss ? .6 : .18}"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${clear ? 0 : .16}"/></linearGradient>`;
  if (textured || frosted) defs += `<filter id="tx${uid}"><feTurbulence type="fractalNoise" baseFrequency="${frosted ? 1.8 : 1.1}" numOctaves="2" seed="9"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${frosted ? .45 : .3} 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`;
  const op = clear ? .32 : transl ? .7 : 1, plaque = 'M 80 70 H 320 A 16 16 0 0 1 336 86 V 214 A 16 16 0 0 1 320 230 H 80 A 16 16 0 0 1 64 214 V 86 A 16 16 0 0 1 80 70 Z';
  if (soft) {
    body = `<g filter="url(#s${uid})"><rect x="70" y="80" width="260" height="140" rx="40" fill="${c}" opacity="${op}"/></g>` + [130, 200, 270].map(x => `<ellipse cx="${x}" cy="150" rx="26" ry="24" fill="${shade(c, .1)}" opacity="${op}"/><ellipse cx="${x - 6}" cy="142" rx="12" ry="8" fill="#fff" opacity=".25"/>`).join('');
    return svg(uid, defs, (op < 1 ? `<rect x="40" y="40" width="320" height="220" rx="12" fill="url(#ck${uid})"/>` : '') + body, `${m.name || 'plastic'}`);
  }
  body = (op < 1 ? `<rect x="40" y="40" width="320" height="220" rx="12" fill="url(#ck${uid})"/>` : '')
    + `<g ${op === 1 ? `filter="url(#s${uid})"` : ''}><path d="${plaque}" fill="${c}" opacity="${op}"/></g>`
    + `<path d="M 64 150 H 336 V 214 A 16 16 0 0 1 320 230 H 80 A 16 16 0 0 1 64 214 Z" fill="${shade(c, -.08)}" opacity="${op}"/><path d="M 200 150 H 336 V 214 A 16 16 0 0 1 320 230 H 200 Z" fill="${shade(c, -.16)}" opacity="${op}"/>`
    + `<circle cx="104" cy="110" r="14" fill="${op < 1 ? 'none' : '#f4f4f2'}" stroke="${shade(c, -.3)}" stroke-width="2"/>`
    + ((textured || frosted) ? `<path d="${plaque}" fill="#fff" filter="url(#tx${uid})"/>` : '') + `<path d="${plaque}" fill="url(#gl${uid})"/>`
    + (clear || transl ? `<path d="${plaque}" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>` : '')
    + `<text x="320" y="118" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-size="15" font-weight="700" fill="${lum(c) < 110 && op === 1 ? '#f1f1ee' : '#3a3a3d'}" opacity=".8">${String(s.category || '').replace(/[&<>]/g, '')}</text>`;
  return svg(uid, defs, body, `${m.name || 'plastic'}`);
}

// → an SVG string of a fabric swatch or a trim; '' for a tag (tags are drawn to size by lab-tags.js)
export function materialSvg(m = {}, uid = '') {
  const id = String(uid || m.id || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '').slice(-12) || 'x';
  if (m.kind === 'fabric') return fabricSvg(m, id);
  if (m.kind === 'trim') return trimSvg(m, id);
  if (['footwear', 'plush', 'plastic'].includes(m.kind)) return goodsSvg(m, id);
  return '';
}

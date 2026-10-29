// Fabrics and trims, drawn: a swatch of the cloth in its weave and colour, or the trim as it looks, for library cards that have no photo yet.
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

// → an SVG string of a fabric swatch or a trim; '' for a tag (tags are drawn to size by lab-tags.js)
export function materialSvg(m = {}, uid = '') {
  const id = String(uid || m.id || Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/gi, '').slice(-12) || 'x';
  if (m.kind === 'fabric') return fabricSvg(m, id);
  if (m.kind === 'trim') return trimSvg(m, id);
  return '';
}

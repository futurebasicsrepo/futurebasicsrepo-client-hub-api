// Tags and labels, drawn to size: the shapes, folds, materials and attachments a garment label or hang tag comes in, and an SVG of one at scale.
// Shared by the server (the materials library, the tech pack hand-off) and the page (/lab/lab-tags.js), so it has no imports.
export const TAG_KINDS = [
  { id: 'neck', label: 'Neck label', for: ['shirts', 'outerwear', 'knitwear'] }, { id: 'size', label: 'Size tab', for: ['shirts', 'pants', 'outerwear'] },
  { id: 'care', label: 'Care and content label', for: ['shirts', 'pants', 'outerwear', 'headwear'] }, { id: 'hem', label: 'Hem tag', for: ['shirts', 'knitwear'] },
  { id: 'sleeve', label: 'Sleeve tag', for: ['shirts', 'outerwear'] }, { id: 'waistband', label: 'Waistband label', for: ['pants'] },
  { id: 'pocket', label: 'Back pocket patch', for: ['pants'] }, { id: 'loop', label: 'Locker loop label', for: ['outerwear', 'knitwear'] },
  { id: 'sweatband', label: 'Sweatband label', for: ['headwear'] }, { id: 'hang', label: 'Hang tag', for: ['shirts', 'pants', 'outerwear', 'headwear', 'accessories'] },
  { id: 'sticker', label: 'Size sticker', for: ['shirts', 'pants'] }
];
export const TAG_SHAPES = ['rectangle', 'square', 'rounded', 'circle', 'oval', 'shield', 'arch', 'die-cut'];
export const TAG_FOLDS = ['none', 'straight cut', 'end fold', 'centre fold', 'loop', 'Manhattan fold', 'mitre fold', 'book fold'];
export const TAG_MATERIALS = ['damask woven', 'taffeta woven', 'satin woven', 'printed satin', 'printed cotton', 'printed polyester', 'jacquard', 'leather-look (PU)', 'real leather', 'rubber (silicone)', 'metal plate', 'paper 350 gsm', 'kraft board', 'recycled board 400 gsm', 'cotton canvas', 'tyvek'];
export const TAG_ATTACH = ['sewn into the neck seam', 'sewn into the side seam', 'sewn on the hem, left side', 'sewn on the sleeve', 'sewn inside the waistband, centre back', 'sewn on the back pocket', 'sewn into the locker loop', 'sewn into the sweatband', 'swift-tach through the care label', 'string through the eyelet, around the neck label', 'string through the eyelet, on the belt loop', 'string through the eyelet, on the hanger', 'peel-and-stick on the polybag'];
export const TAG_PRINTS = ['woven', 'printed', 'foil stamp', 'letterpress', 'embossed', 'debossed', '4-colour print', 'laser engraved', 'none'];
export const TAG_STRINGS = ['none', 'cotton twine', 'waxed cotton cord', 'satin ribbon', 'elastic loop', 'black cotton tape', 'plastic swift-tach'];
export const TAG_FOR = ['shirts', 'pants', 'outerwear', 'knitwear', 'headwear', 'accessories'];

// the tag's outline in mm, as an SVG path on a canvas the size of the tag
export function tagOutline(shape, w, h) {
  const r = Math.min(w, h) * .18;
  switch (shape) {
    case 'circle': { const d = Math.min(w, h) / 2; return `M ${w / 2 - d} ${h / 2} a ${d} ${d} 0 1 0 ${d * 2} 0 a ${d} ${d} 0 1 0 ${-d * 2} 0 Z`; }
    case 'oval': return `M 0 ${h / 2} a ${w / 2} ${h / 2} 0 1 0 ${w} 0 a ${w / 2} ${h / 2} 0 1 0 ${-w} 0 Z`;
    case 'rounded': return `M ${r} 0 H ${w - r} a ${r} ${r} 0 0 1 ${r} ${r} V ${h - r} a ${r} ${r} 0 0 1 ${-r} ${r} H ${r} a ${r} ${r} 0 0 1 ${-r} ${-r} V ${r} a ${r} ${r} 0 0 1 ${r} ${-r} Z`;
    case 'shield': return `M 0 0 H ${w} V ${h * .6} Q ${w} ${h * .85} ${w / 2} ${h} Q 0 ${h * .85} 0 ${h * .6} Z`;
    case 'arch': return `M 0 ${h} V ${w / 2} a ${w / 2} ${w / 2} 0 0 1 ${w} 0 V ${h} Z`;
    case 'die-cut': return `M ${w * .1} 0 H ${w * .9} L ${w} ${h * .25} V ${h * .75} L ${w * .9} ${h} H ${w * .1} L 0 ${h * .75} V ${h * .25} Z`;
    default: return `M 0 0 H ${w} V ${h} H 0 Z`; // rectangle and square
  }
}

// → an SVG string of the tag at scale (px per mm), with its fold, eyelet, string and the words on it. `art` is an image href drawn in the middle.
export function tagSvg(spec = {}, { scale = 3, art = '', textLines = null, fill = '', ink = '#141416', showSize = true } = {}) {
  const w = Math.max(5, Number(spec.widthMm) || 40), h = Math.max(5, Number(spec.heightMm) || 20), shape = TAG_SHAPES.includes(spec.shape) ? spec.shape : 'rectangle', fold = spec.fold || 'none';
  const mat = String(spec.material || ''), paper = /paper|board|tyvek/.test(mat), leather = /leather/.test(mat), metal = /metal/.test(mat), rubber = /rubber/.test(mat);
  const bg = fill || (paper ? '#f4efe4' : leather ? '#6b4a2b' : metal ? '#b9b9bd' : rubber ? '#2a2a2e' : '#f7f6f2'), fg = fill ? ink : (leather || rubber ? '#f3eee4' : ink);
  const pad = 14, hang = spec.tagKind === 'hang' || /string/.test(String(spec.attach || '')), stringLen = hang && spec.string && spec.string !== 'none' ? h * .9 : 0;
  const W = (w + pad * 2) * scale, H = (h + pad * 2 + stringLen) * scale, ox = pad * scale, oy = (pad + stringLen) * scale, s = scale;
  const outline = tagOutline(shape, w, h);
  const lines = (Array.isArray(textLines) ? textLines : Array.isArray(spec.text) ? spec.text : String(spec.text || '').split(/\n|\//)).map(t => String(t).trim()).filter(Boolean).slice(0, 4);
  const fs = Math.max(2.2, Math.min(h * .28, w / Math.max(6, Math.max(...lines.map(l => l.length), 1)) * 1.7));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let body = `<g transform="translate(${ox} ${oy}) scale(${s})">`;
  body += `<path d="${outline}" fill="${bg}" stroke="${fg}" stroke-width="${.35}" stroke-opacity=".55"/>`;
  if (/woven|jacquard/.test(mat)) body += `<path d="${outline}" fill="url(#weave)" opacity=".35"/>`;
  // folds: a dashed line where the cloth turns, stitching where it is sewn
  if (fold === 'end fold') body += `<path d="M ${w * .12} 0 V ${h} M ${w * .88} 0 V ${h}" stroke="${fg}" stroke-width=".3" stroke-dasharray="1 .8" opacity=".7"/><path d="M ${w * .06} ${h * .15} V ${h * .85} M ${w * .94} ${h * .15} V ${h * .85}" stroke="${fg}" stroke-width=".4" stroke-dasharray=".7 .7"/>`;
  else if (fold === 'centre fold' || fold === 'book fold') body += `<path d="M 0 ${h / 2} H ${w}" stroke="${fg}" stroke-width=".3" stroke-dasharray="1 .8" opacity=".7"/><path d="M ${w * .05} ${h * .06} H ${w * .95}" stroke="${fg}" stroke-width=".4" stroke-dasharray=".7 .7"/>`;
  else if (fold === 'loop') body += `<path d="M 0 ${h * .5} H ${w}" stroke="${fg}" stroke-width=".3" stroke-dasharray="1 .8" opacity=".7"/><path d="M ${w * .04} ${h * .1} V ${h * .9} M ${w * .96} ${h * .1} V ${h * .9}" stroke="${fg}" stroke-width=".4" stroke-dasharray=".7 .7"/>`;
  else if (fold === 'Manhattan fold') body += `<path d="M 0 ${h * .75} H ${w}" stroke="${fg}" stroke-width=".3" stroke-dasharray="1 .8" opacity=".7"/><path d="M ${w * .04} ${h * .82} H ${w * .96}" stroke="${fg}" stroke-width=".4" stroke-dasharray=".7 .7"/>`;
  else if (fold === 'mitre fold') body += `<path d="M 0 ${h * .4} L ${w * .18} ${h} M ${w} ${h * .4} L ${w * .82} ${h}" stroke="${fg}" stroke-width=".3" stroke-dasharray="1 .8" opacity=".7"/>`;
  else if (fold === 'straight cut' && !paper) body += `<path d="M ${w * .05} ${h * .1} V ${h * .9} M ${w * .95} ${h * .1} V ${h * .9}" stroke="${fg}" stroke-width=".4" stroke-dasharray=".7 .7"/>`;
  // a hang tag's eyelet and string
  if (hang) {
    const ex = shape === 'circle' || shape === 'oval' ? w / 2 : w / 2, ey = Math.min(h * .14, 6) + 1;
    body += `<circle cx="${ex}" cy="${ey}" r="1.8" fill="#fff" stroke="${fg}" stroke-width=".4"/><circle cx="${ex}" cy="${ey}" r="2.4" fill="none" stroke="${/metal|kraft|board|paper/.test(mat) ? '#9a8b6e' : fg}" stroke-width=".5"/>`;
    if (stringLen) body += `<path d="M ${ex} ${ey} C ${ex - w * .25} ${-stringLen * .5}, ${ex + w * .25} ${-stringLen * .8}, ${ex} ${-stringLen}" fill="none" stroke="${/waxed|black/.test(spec.string) ? '#2b2b2b' : /ribbon/.test(spec.string) ? '#b8323c' : '#b7a98a'}" stroke-width="${/ribbon|tape/.test(spec.string) ? 1.6 : .7}" stroke-linecap="round"/>`;
  }
  // the artwork in the middle, the words under it (or on their own)
  const artH = art ? Math.min(h * .45, w * .5) : 0, textTop = hang ? h * .22 : h * .12, free = h - textTop - h * .12;
  if (art) body += `<image href="${esc(art)}" x="${w / 2 - artH}" y="${textTop + (free - artH - (lines.length ? fs * lines.length * 1.25 : 0)) / 2}" width="${artH * 2}" height="${artH}" preserveAspectRatio="xMidYMid meet"/>`;
  lines.forEach((t, i) => { const y = art ? textTop + (free - artH - fs * lines.length * 1.25) / 2 + artH + fs * (i + 1) * 1.25 : h / 2 + (i - (lines.length - 1) / 2) * fs * 1.3 + fs * .35; body += `<text x="${w / 2}" y="${y}" text-anchor="middle" font-family="'Space Grotesk','Helvetica Neue',Arial,sans-serif" font-weight="${i === 0 ? 600 : 400}" font-size="${i === 0 ? fs : fs * .8}" letter-spacing="${i === 0 ? fs * .08 : 0}" fill="${fg}">${esc(t)}</text>`; });
  body += '</g>';
  const dims = showSize ? `<text x="${W / 2}" y="${H - 4 * s}" text-anchor="middle" font-family="'IBM Plex Mono',monospace" font-size="${3.2 * s}" fill="#727278">${w} × ${h} mm · ${shape}${fold !== 'none' ? ' · ' + fold : ''}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><pattern id="weave" width="1.2" height="1.2" patternUnits="userSpaceOnUse"><path d="M0 .6 H1.2 M.6 0 V1.2" stroke="#000" stroke-width=".12"/></pattern></defs>${body}${dims}</svg>`;
}

// one line a factory reads: "60 × 15 mm damask woven neck label, end fold, sewn into the neck seam; woven"
export function tagWords(spec = {}) {
  const k = TAG_KINDS.find(x => x.id === spec.tagKind)?.label?.toLowerCase() || 'label';
  return [`${spec.widthMm} × ${spec.heightMm} mm ${spec.material || ''} ${k}`.replace(/\s+/g, ' ').trim(), spec.shape && spec.shape !== 'rectangle' ? spec.shape : '', spec.fold && spec.fold !== 'none' ? spec.fold : '', spec.attach || '', spec.print && spec.print !== 'none' ? spec.print : '', spec.string && spec.string !== 'none' ? `${spec.string}${spec.eyelet === false ? '' : ' through a brass eyelet'}` : ''].filter(Boolean).join(', ');
}

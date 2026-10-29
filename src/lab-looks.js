// What a product's materials look like on its tech flats (shared by the page and the service; no imports): the materials picked for its parts
// (src/lab-materials-goods.js PARTS) give each part a colour and a surface: a suede's nap, a mesh's holes, a knit, a pebble grain, patent gloss,
// a fur's strands.
//   partLooks(picks) → { colours: {upper, overlay, lining, sole, outsole, lace, body, contrast, features}, tex: {part: look} }
const HEX = /^#[0-9a-f]{6}$/i;
const COLOUR_OF = { upper: 'upper', overlay: 'overlay', lining: 'lining', midsole: 'sole', outsole: 'outsole', laces: 'lace', body: 'body', contrast: 'contrast', eyes: 'features' };
export function lookOf(p) {
  const s = p.spec || {}, w = `${s.category || ''} ${s.finish || ''} ${p.name || ''}`.toLowerCase();
  if (/suede|nubuck|brushed/.test(w)) return 'nap';
  if (/mesh/.test(w)) return 'mesh';
  if (/knit/.test(w)) return 'knit';
  if (/patent/.test(w)) return 'gloss';
  if (/pebble/.test(w)) return 'pebble';
  if (/faux fur|fur/.test(w) || Number(s.pileMm) >= 6) return 'fur';
  return '';
}
export function partLooks(picks = []) {
  const colours = {}, tex = {};
  for (const p of picks || []) {
    if (!p?.part) continue;
    const key = COLOUR_OF[p.part], hex = HEX.test(String(p.colour?.hex || '')) ? p.colour.hex.toLowerCase() : '';
    if (key && hex) colours[key] = hex;
    const look = lookOf(p); if (look) tex[p.part] = look;
  }
  return { colours, tex };
}
// the surfaces as SVG patterns over a part's fill (inches: the views are drawn in inches), each id made unique by `uid`
export function lookDefs(uid, looks) {
  let d = '';
  for (const look of new Set(Object.values(looks || {}))) {
    const id = `lk-${look}-${uid}`;
    if (look === 'mesh') d += `<pattern id="${id}" width=".16" height=".14" patternUnits="userSpaceOnUse"><ellipse cx=".04" cy=".035" rx=".026" ry=".02" fill="#000" opacity=".28"/><ellipse cx=".12" cy=".105" rx=".026" ry=".02" fill="#000" opacity=".28"/></pattern>`;
    else if (look === 'knit') d += `<pattern id="${id}" width=".08" height=".09" patternUnits="userSpaceOnUse"><path d="M.006 .005 Q.02 .08 .04 .085 Q.06 .08 .074 .005" fill="none" stroke="#000" stroke-width=".008" opacity=".22"/></pattern>`;
    else if (look === 'pebble') d += `<pattern id="${id}" width=".14" height=".12" patternUnits="userSpaceOnUse"><path d="M.01 .03 Q.04 0 .07 .03 Q.08 .07 .04 .08 Q0 .07 .01 .03 Z M.08 .08 Q.11 .05 .13 .08 Q.13 .11 .1 .115 Q.07 .11 .08 .08 Z" fill="none" stroke="#000" stroke-width=".006" opacity=".25"/></pattern>`;
    else if (look === 'nap') d += `<pattern id="${id}" width=".3" height=".3" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M0 .05 H.3 M0 .13 H.3 M0 .21 H.3" stroke="#fff" stroke-width=".035" opacity=".12"/><circle cx=".07" cy=".09" r=".012" fill="#000" opacity=".12"/><circle cx=".21" cy=".24" r=".01" fill="#000" opacity=".12"/></pattern>`;
    else if (look === 'gloss') d += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity=".12"/></linearGradient>`;
    else if (look === 'fur') d += `<pattern id="${id}" width=".22" height=".2" patternUnits="userSpaceOnUse"><path d="M.02 .03 l.06 .05 M.12 .02 l.05 .06 M.06 .12 l.06 .05 M.15 .12 l.05 .05" stroke="#000" stroke-width=".018" stroke-linecap="round" opacity=".14"/></pattern>`;
  }
  return d;
}

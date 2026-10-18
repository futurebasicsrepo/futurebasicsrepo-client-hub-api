// Design Lab L3: concepts. Our own take on a planned piece, a picture of it, and a check that it does not sit too close to what inspired it.
//
// Three things here, none of which needs the web server:
//  1. The guard against copying: a list of brand names and trade-dress terms that may never appear in a concept, a measure of how much a concept's design words
//     overlap with the library pieces it was drawn from, and an AI second opinion. Together they give a verdict (clear, check, too close). Approval is
//     blocked on "too close" unless a person writes down why. The check reads words, not pictures: the page puts the references beside the concept so a person
//     looks at both before approving, and that look is the real check.
//  2. Asking the assistant for concepts: several different takes on one planned piece, each with a specific twist that is ours.
//  3. Drawing the concept: a text-to-image prompt built from the concept alone. No reference picture is ever sent to the image model, and brand names are
//     stripped from the words it gets.
import sharp from 'sharp';
import { imageConfig, openaiImage } from './check.js';
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';
import { brandCodeWords, DEFAULT_BRAND_CODE, categoryLabel, cleanCategory } from './lab.js';
import { logoSvg, BRAND_INK, BRAND_CUE } from './brand-kit.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const norm = s => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---- 1. the guard -------------------------------------------------------------------------------------------------------------------------------
// Names and trade dress that are somebody else's. A concept that uses one is a copy in words before it is anything else.
export const BRAND_TERMS = ['Ralph Lauren', 'Polo Ralph Lauren', 'Aime Leon Dore', 'ALD', 'A-COLD-WALL', 'A COLD WALL', 'ACW', 'Gucci', 'Prada', 'Zara', 'Shein', 'Nike', 'Adidas', 'Puma', 'Reebok', 'New Balance', 'Converse', 'Vans', 'Supreme', 'Stussy', 'Carhartt', 'Fear of God', 'Kith', 'Noah', 'Todd Snyder', 'Uniqlo', "Levi's", 'Levis', 'Burberry', 'Louis Vuitton', 'Chanel', 'Hermes', 'Balenciaga', 'Off-White', 'Lacoste', 'Barbour', 'Moncler', 'The North Face', 'Patagonia', "Arc'teryx", 'Dr. Martens', 'Birkenstock', 'Tommy Hilfiger', 'Calvin Klein', 'Hugo Boss', 'Brooks Brothers', 'J.Crew', 'Rowing Blazers', 'Bape', 'Rick Owens', 'Maison Margiela', 'Acne Studios', 'Our Legacy', 'Visvim', 'Engineered Garments', 'Aime Leon Dore Polo'];
export const TRADE_DRESS = ['polo pony', 'pony logo', 'pony emblem', 'double g', 'gg monogram', 'interlocking g', 'red tab', 'green and red web', 'green-red-green', 'swoosh', 'three stripes', '3 stripes', 'trefoil', 'jumpman', 'triangle logo', 'inverted triangle', 'box logo', 'bogo', 'crocodile logo', 'riding crop', 'monogram print', 'plaid check lining'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const termSource = t => `(?<![a-z0-9])${esc(norm(t)).replace(/(\\ | |-)+/g, '[\\s-]+')}(?![a-z0-9])`;
const termRe = (t, flags = 'i') => new RegExp(termSource(t), flags);
const allTerms = names => [...BRAND_TERMS, ...names.filter(n => String(n).trim().length >= 3), ...TRADE_DRESS];
// → the names and trade-dress terms found in some text (the library's own brand names count too).
export function brandHits(text, names = []) {
  const t = norm(text), hits = [];
  for (const term of allTerms(names)) if (term && termRe(term).test(t) && !hits.some(h => norm(h) === norm(term))) hits.push(term);
  return hits;
}
// The same text with those names and terms taken out (accents dropped), for words that go to the image model.
export function stripBrands(text, names = []) {
  let t = norm(text);
  for (const term of allTerms(names).sort((a, b) => b.length - a.length)) t = t.replace(termRe(term, 'gi'), '');
  return t.replace(/\s+([,.;])/g, '$1').replace(/\b(by|from|like|inspired by|in the style of)\s*(?=[,.;]|$)/gi, '').replace(/\s{2,}/g, ' ').trim();
}

const STOP = new Set(['the', 'and', 'with', 'for', 'from', 'that', 'this', 'its', 'our', 'your', 'has', 'have', 'are', 'but', 'not', 'into', 'over', 'under', 'all', 'one', 'two', 'out', 'new', 'old', 'tee', 'shirt', 'jacket', 'coat', 'pant', 'pants', 'short', 'shorts', 'cap', 'hat', 'sneaker', 'shoe', 'shoes', 'boot', 'bag', 'tote', 'knit', 'sweater', 'hoodie', 'sweatshirt', 'polo', 'top', 'bottom', 'piece', 'style', 'classic', 'fit', 'made', 'small', 'large', 'detail', 'details', 'cut', 'look']);
const words = parts => new Set(norm([].concat(parts).flat().join(' ')).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n); };
const phrase = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();

// The design words of a concept or a library piece: shape, fabric, fit and details (colour is left out: everything is navy).
export const designWords = ({ silhouette = '', fabric = '', fit = '', details = [] } = {}) => words([silhouette, fabric, fit, details]);
const worse = (a, b) => (['clear', 'check', 'too_close'].indexOf(a) >= ['clear', 'check', 'too_close'].indexOf(b) ? a : b);

// concept: { name, spec: { description, silhouette, fabric, fit, details[], trims, colors[] }, twist }; refs: library pieces { id, title, brand, attrs, summary }
export function closeness(concept, refs = [], { brandNames = [], ai = null } = {}) {
  const spec = concept.spec || {}, text = [concept.name, spec.description, spec.silhouette, spec.fabric, spec.fit, spec.trims, (spec.details || []).join(' '), (spec.colors || []).join(' '), concept.twist, (spec.graphics || []).map(g => `${g.name} ${g.idea}`).join(' '), spec.branding?.logo?.placement].join(' ');
  const hits = brandHits(text, brandNames), mine = designWords(spec), myDetails = (spec.details || []).map(phrase).filter(Boolean);
  let nearest = null;
  for (const r of refs) {
    const a = r.attrs || {}, theirs = new Set([...designWords(a), ...words(r.title)]), score = Math.round(jaccard(new Set([...mine, ...words(concept.name)]), theirs) * 100) / 100;
    const same = (a.details || []).map(phrase).filter(d => d && myDetails.includes(d)).length;
    if (!nearest || score + same * 0.1 > nearest.score + nearest.sameDetails * 0.1) nearest = { id: r.id, title: r.title, brand: r.brand || '', score, sameDetails: same };
  }
  const reasons = []; let verdict = 'clear';
  if (hits.length) { verdict = 'too_close'; reasons.push(`Names or describes someone else's mark or product: ${hits.join(', ')}. Describe our own piece in plain words.`); }
  if (nearest) {
    if (nearest.score >= 0.6 || nearest.sameDetails >= 3) { verdict = worse(verdict, 'too_close'); reasons.push(`Its design words match "${nearest.title}"${nearest.brand ? ' by ' + nearest.brand : ''} too closely (${Math.round(nearest.score * 100)}% overlap, ${nearest.sameDetails} identical details). Change the shape, the details or the fabric.`); }
    else if (nearest.score >= 0.4 || nearest.sameDetails >= 2) { verdict = worse(verdict, 'check'); reasons.push(`Quite close to "${nearest.title}"${nearest.brand ? ' by ' + nearest.brand : ''} (${Math.round(nearest.score * 100)}% overlap, ${nearest.sameDetails} identical details). Look at the two side by side.`); }
  }
  if (!refs.length) reasons.push('No library pieces are attached, so there was nothing to compare against. Add the pieces that inspired it.');
  if (ai) { verdict = worse(verdict, ai.verdict === 'too_close' ? 'too_close' : ai.verdict === 'close' ? 'check' : 'clear'); for (const r of ai.reasons || []) reasons.push(`Second opinion: ${r}`); }
  return { verdict, score: nearest?.score ?? 0, nearest, hits, reasons, ai: ai ? { verdict: ai.verdict, reasons: ai.reasons || [], fixes: ai.fixes || [] } : null, checkedAt: new Date().toISOString(), aiChecked: Boolean(ai) };
}

// The second opinion: the assistant reads the concept's words next to the pieces it was drawn from and says whether it copies a distinctive design.
export function opinionFixture({ user }) {
  const bad = /\b(identical|exact copy|same as)\b/i.test(user);
  return { verdict: bad ? 'too_close' : 'clear', reasons: bad ? ['The wording says it copies the reference'] : [], fixes: bad ? ['Change the proportions and the signature details'] : [] };
}
export async function aiOpinion({ concept, refs, code = DEFAULT_BRAND_CODE, askImpl = realAsk, env = process.env, fetchImpl = fetch }) {
  if (!providerReady('anthropic', env)) return { ai: null, costCents: 0 };
  const spec = concept.spec || {};
  const system = `You are a careful product designer and IP-aware reviewer at Future Basics. You judge whether a new concept copies another brand's distinctive design: a logo, print, pattern, signature detail, name, or the overall trade dress that makes a piece recognisably someone else's. Borrowing a general shape or a common detail (a boxy tee, a rib collar) is normal and fine. Be specific and brief.\n${brandCodeWords(code)}`;
  const user = `Our concept:\n${JSON.stringify({ name: concept.name, description: spec.description, silhouette: spec.silhouette, fabric: spec.fabric, fit: spec.fit, details: spec.details, trims: spec.trims, colors: spec.colors, graphics: (spec.graphics || []).map(g => ({ name: g.name, idea: g.idea, placement: g.placement })), twist: concept.twist })}\n\nThe pieces it was drawn from:\n${refs.map((r, i) => `${i + 1}. ${clip(r.title, 120)} (${clip(r.brand, 40)}) ${clip(JSON.stringify(r.attrs || {}), 300)} ${clip(r.summary, 200)}`).join('\n') || 'none attached'}\n\nAnswer {"verdict":"clear|close|too_close","reasons":["short reasons, only if close or too_close"],"fixes":["short, specific changes that would make it ours"]}`;
  const res = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens: 700, env, fetchImpl, fixture: opinionFixture });
  const j = res.json || {};
  return { ai: { verdict: ['clear', 'close', 'too_close'].includes(j.verdict) ? j.verdict : 'close', reasons: (Array.isArray(j.reasons) ? j.reasons : []).slice(0, 4).map(r => clip(r, 240)), fixes: (Array.isArray(j.fixes) ? j.fixes : []).slice(0, 4).map(r => clip(r, 240)) }, costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env) };
}

// ---- Future Basics branding on every concept ----------------------------------------------------------------------------------------------------------
// Every concept carries the Future Basics logo and a Future Basics internal woven label, whatever the assistant says: they are put back in code if they are missing.
// The mark and the label are drawn from our own brand files and placed on the picture afterwards, never drawn by the image model (a model redraws lettering).
export const LOGO_MARKS = [{ id: 'cue', label: 'Cue mark (line and dot)' }, { id: 'word', label: 'Wordmark' }, { id: 'lockup', label: 'Wordmark and cue mark' }];
export const LOGO_TECHNIQUES = ['embroidered', 'woven patch', 'screen print', 'rubber print', 'heat transfer', 'debossed', 'metal plaque'];
// where the logo goes by default, in words, and where it sits on the front picture (centre and width as fractions of the picture; null = not on the front view)
export const LOGO_PLACE = {
  tops: ['small mark on the left chest', { x: 0.6, y: 0.36, w: 0.07 }], knitwear: ['small mark on the left chest', { x: 0.6, y: 0.36, w: 0.07 }], outerwear: ['small mark on the left chest', { x: 0.6, y: 0.36, w: 0.07 }],
  tailoring: ['small mark on the inside chest pocket and a woven loop at the back neck', null], bottoms: ['small mark at the right back pocket or hem', { x: 0.5, y: 0.3, w: 0.06 }], dresses: ['small mark on the left chest', { x: 0.6, y: 0.36, w: 0.07 }],
  headwear: ['mark at the centre front of the crown', { x: 0.5, y: 0.42, w: 0.13 }], footwear: ['mark on the heel tab or lateral side', { x: 0.5, y: 0.5, w: 0.09 }], bags: ['mark at the centre front', { x: 0.5, y: 0.5, w: 0.13 }],
  accessories: ['mark on the most visible face', { x: 0.5, y: 0.5, w: 0.1 }], home: ['mark on the front', { x: 0.5, y: 0.5, w: 0.1 }], other: ['mark on the front', { x: 0.5, y: 0.5, w: 0.1 }]
};
const LABEL = 'Future Basics internal woven label (woven damask, Paper on Ink, cue mark and wordmark)';
export const labelWords = category => `${LABEL}, ${({ headwear: 'sewn on the inside sweatband at centre back', footwear: 'sewn on the tongue lining, with the size label on the inside', bags: 'sewn into the inside seam', bottoms: 'sewn into the inside waistband at centre back', tailoring: 'sewn into the back neck seam of the lining', accessories: 'sewn into the most visible inside seam', home: 'sewn into a side seam' })[category] || 'sewn into the back neck seam'}`;
const place = category => (LOGO_PLACE[category] || LOGO_PLACE.other)[0];
// The graphics the assistant may propose: our own, from simple shapes. Only plain drawing elements and brand colours are kept; text, images, scripts and links never are.
export const GRAPHIC_TECHNIQUES = ['screen print', 'embroidery', 'woven jacquard', 'puff print', 'rubber print', 'heat transfer', 'debossed'];
export const GRAPHIC_PLACE = { 'front chest': { x: 0.5, y: 0.42, w: 0.26 }, 'left chest': { x: 0.6, y: 0.36, w: 0.1 }, 'front centre': { x: 0.5, y: 0.5, w: 0.3 }, 'full front': { x: 0.5, y: 0.5, w: 0.42 }, 'sleeve': null, 'back': null, 'back yoke': null, 'hem': null, 'inside': null };
const OKAY_TAGS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path']);
const OKAY_ATTR = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-rule', 'transform', 'viewBox', 'xmlns']);
const PALETTE = [BRAND_INK, '#FFFFFF', BRAND_CUE, '#2EDC83', '#17603A', '#727278'];
const nearestBrandColour = hex => { const h = String(hex).replace('#', ''), v = h.length === 3 ? h.split('').map(c => c + c).join('') : h, n = parseInt(v, 16); if (!/^[0-9a-f]{6}$/i.test(v)) return BRAND_INK; const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255]; return PALETTE.map(p => { const m = parseInt(p.slice(1), 16); return [p, (r - (m >> 16 & 255)) ** 2 + (g - (m >> 8 & 255)) ** 2 + (b - (m & 255)) ** 2]; }).sort((a, b) => a[1] - b[1])[0][0]; };
// → clean SVG text, or '' when it cannot be trusted. A 200 by 200 drawing in brand colours.
export function cleanGraphicSvg(input) {
  const src = String(input ?? '').trim(); if (!src || src.length > 6000 || !/^<svg[\s>]/i.test(src)) return '';
  if (/<\s*(script|style|image|use|foreignObject|text|tspan|a|iframe|link|filter|pattern|mask|clipPath|animate|set)\b/i.test(src) || /\bon\w+\s*=|javascript:|data:|href\s*=|url\s*\(/i.test(src)) return '';
  let drawn = 0, ok = true;
  const body = src.replace(/^<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '').replace(/<(\/?)([a-z0-9]+)([^>]*?)(\/?)>/gi, (m, close, tag, attrs, self) => {
    tag = tag.toLowerCase(); if (!OKAY_TAGS.has(tag) || tag === 'svg') { ok = false; return ''; }
    if (close) return `</${tag}>`;
    const kept = [...attrs.matchAll(/([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g)].filter(([, k]) => OKAY_ATTR.has(k)).map(([, k, v]) => {
      if ((k === 'fill' || k === 'stroke') && v !== 'none') return `${k}="${/^#[0-9a-f]{3,6}$/i.test(v) ? nearestBrandColour(v) : BRAND_INK}"`;
      return /^[\w\s.,#%()+-]*$/.test(v) ? `${k}="${v}"` : '';
    }).filter(Boolean);
    if (tag !== 'g') drawn++;
    return `<${tag}${kept.length ? ' ' + kept.join(' ') : ''}${self ? '/' : ''}>`;
  });
  if (!ok || !drawn || drawn > 60) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${body}</svg>`;
}
export const cleanGraphics = list => (Array.isArray(list) ? list : []).slice(0, 3).map(g => {
  const placement = clip(g?.placement, 40).toLowerCase(), technique = clip(g?.technique, 40).toLowerCase();
  return { name: clip(g?.name, 80), idea: clip(g?.idea, 300), placement: Object.keys(GRAPHIC_PLACE).includes(placement) ? placement : 'front chest', technique: GRAPHIC_TECHNIQUES.includes(technique) ? technique : 'screen print',
    colors: (Array.isArray(g?.colors) ? g.colors : []).map(c => clip(c, 30)).filter(Boolean).slice(0, 3), svg: cleanGraphicSvg(g?.svg) };
}).filter(g => g.name && g.idea);
// What a concept always carries: the logo (the assistant chooses the mark, where and how; it can never be left out) and the woven label (fixed words).
export function ensureBranding(spec = {}, category = 'other') {
  const b = spec.branding || {}, l = b.logo || {};
  return { ...spec, branding: { logo: { mark: LOGO_MARKS.some(m => m.id === l.mark) ? l.mark : 'cue', placement: clip(l.placement, 120) || place(category), technique: LOGO_TECHNIQUES.includes(String(l.technique || '').toLowerCase()) ? String(l.technique).toLowerCase() : 'embroidered' }, label: labelWords(category) }, graphics: cleanGraphics(spec.graphics) };
}
// the logo and the label, drawn from our own brand files, and any front graphics, laid on the concept's picture. → a JPEG buffer
export async function composeBranding(buf, concept) {
  const spec = ensureBranding(concept.spec, concept.category), meta = await sharp(buf).metadata(), W = meta.width, H = meta.height, layers = [];
  const png = async (svg, width) => sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil(72 * width / 100)) }).resize({ width: Math.max(8, Math.round(width)) }).png().toBuffer();
  // (stats() of an extract alone reads the whole picture, so the region is cut out first)
  const lum = async (f, w) => { try { const left = Math.max(0, Math.round(f.x * W - w / 2)), top = Math.max(0, Math.round(f.y * H - w / 2)); const region = await sharp(buf).extract({ left, top, width: Math.max(2, Math.min(Math.round(w), W - left)), height: Math.max(2, Math.min(Math.round(w), H - top)) }).toBuffer(), st = await sharp(region).stats(); const [r, g, b] = st.channels.map(c => c.mean); return 0.299 * r + 0.587 * g + 0.114 * b; } catch { return 128; } };
  const put = async (input, f) => { const m = await sharp(input).metadata(); layers.push({ input, left: Math.max(0, Math.round(f.x * W - m.width / 2)), top: Math.max(0, Math.round(f.y * H - m.height / 2)) }); };
  const front = (LOGO_PLACE[concept.category] || LOGO_PLACE.other)[1];
  if (front) { const mark = spec.branding.logo.mark, w = front.w * W * (mark === 'cue' ? 1 : 2.2), fill = (await lum(front, front.w * W)) < 120 ? '#FFFFFF' : BRAND_INK; await put(await png(logoSvg(mark, { fill }), w), front); }
  for (const g of spec.graphics) { const f = GRAPHIC_PLACE[g.placement]; if (f && g.svg) await put(await png(g.svg, f.w * W), f); }
  // the woven label as a small inset in the bottom corner, so the picture shows it is there
  const lw = Math.round(W * 0.2), label = await sharp(Buffer.from(logoSvg('lockup', { fill: '#FFFFFF', bg: BRAND_INK, pad: 90 })), { density: 144 }).resize({ width: lw }).png().toBuffer(), lm = await sharp(label).metadata();
  layers.push({ input: label, left: Math.max(0, W - lm.width - Math.round(W * 0.03)), top: Math.max(0, H - lm.height - Math.round(H * 0.03)) });
  return sharp(buf).composite(layers).jpeg({ quality: 88 }).toBuffer();
}

// ---- 2. asking for concepts ---------------------------------------------------------------------------------------------------------------------
export const cleanSpec = (s = {}) => ({
  ...(s.branding ? { branding: { logo: { mark: s.branding.logo?.mark, placement: clip(s.branding.logo?.placement, 120), technique: clip(s.branding.logo?.technique, 40) } } } : {}), ...(s.graphics ? { graphics: cleanGraphics(s.graphics) } : {}),
  description: clip(s.description, 600), silhouette: clip(s.silhouette, 120), fabric: clip(s.fabric, 160), fit: clip(s.fit, 80), trims: clip(s.trims, 200),
  colors: (Array.isArray(s.colors) ? s.colors : []).map(c => clip(c, 40)).filter(Boolean).slice(0, 4), details: (Array.isArray(s.details) ? s.details : []).map(c => clip(c, 120)).filter(Boolean).slice(0, 6)
});
export function conceptFixture({ user }) {
  const n = Number(/Make (\d+) different/.exec(user)?.[1] || 3), line = /Planned piece: (.*)/.exec(user)?.[1] || 'Piece', cat = /category (\w+)/.exec(user)?.[1] || 'tops';
  const note = /Steer: (.*)/.exec(user)?.[1] || '';
  return { concepts: Array.from({ length: n }, (_, i) => ({ name: `${line.replace(/\s*\(.*$/, '')} ${['Alpha', 'Bravo', 'Charlie', 'Delta'][i]}`, description: `A ${['boxy', 'relaxed', 'cropped', 'long'][i]} ${cat} with a clean finish${note ? ', ' + note : ''}`, silhouette: ['boxy', 'relaxed', 'cropped', 'long'][i], fabric: 'brushed cotton blend', fit: 'regular', trims: 'tonal buttons', colors: [['navy', 'cream', 'olive', 'rust'][i]], details: ['contrast stitch at the hem', `${['pocket flap', 'side vent', 'rib cuff', 'gusset'][i]}`], logo: { mark: ['cue', 'word', 'lockup', 'cue'][i], placement: 'small mark on the left chest', technique: 'embroidered' }, graphics: i === 0 ? [{ name: 'Line and dot grid', idea: 'A quiet grid of our line-and-dot mark, tone on tone', placement: 'front chest', technique: 'screen print', colors: ['Ink', 'Cue'], svg: '<svg viewBox="0 0 200 200"><rect x="20" y="90" width="120" height="20" rx="10" fill="#141416"/><circle cx="165" cy="100" r="14" fill="#4BFF9A"/></svg>' }] : [], twist: `Our own ${['hem', 'back yoke', 'cuff', 'collar'][i]} detail that nobody else makes` })) };
}
// → { concepts: [{ name, spec, twist }], costCents }. `line` is the planned piece, `refs` the library pieces it draws on, `trend` the category's digest.
export async function generateConcepts({ line, plan = {}, refs = [], trend = null, code = DEFAULT_BRAND_CODE, count = 3, note = '', parent = null, askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  if (!providerReady('anthropic', env)) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
  const n = Math.min(Math.max(Math.round(count) || 3, 1), 4);
  const system = `You are the lead designer at Future Basics. Future Basics makes affordable, considered clothing, headwear, footwear and accessories: the cuts and attitude of luxury and heritage brands at a price held to a fast-fashion anchor, in simpler materials.\n${brandCodeWords(code)}\nRules: the line is male-driven and unisex: design for men first (men's sizing, proportions and fits) in pieces anyone can wear. Every concept is OUR design. Every concept carries the Future Basics logo (choose the mark: cue, word or lockup; where it goes; how it is made) and a Future Basics internal woven label; the label is added for you, so do not describe it. Where it makes sense for the piece (a tee, a sweatshirt, a cap, a tote) also design one or two Future Basics graphics: original artwork built from simple shapes and our line-and-dot idea, never copied from anyone and never containing text; leave a clean piece clean (tailoring and fine knit usually have none). Describe it in plain words: shape, fabric, fit, colour, trims and details. NEVER name another brand or its products, never describe a logo, print, pattern or signature detail that belongs to someone else, and make the "twist" a specific idea that is ours and visible on the piece (a proportion, a seam, a trim, a colour story). Different concepts must differ from each other in shape or detail, not only in colour. Materials stay simpler than the references so the price holds.`;
  const trendWords = trend ? `Trend in ${categoryLabel(line.category)}: shapes ${trend.silhouettes?.map(x => x.name).join(', ') || 'n/a'}; fabrics ${trend.fabrics?.map(x => x.name).join(', ') || 'n/a'}; details ${trend.details?.map(x => x.name).join(', ') || 'n/a'}; colours ${trend.colors?.map(x => x.name).join(', ') || 'n/a'}.` : '';
  const user = `Make ${n} different concepts for one planned piece.\nPlanned piece: ${clip(line.name, 100)} (category ${line.category}, role ${line.role}, target price $${line.priceCents != null ? (line.priceCents / 100).toFixed(0) : '?'})\nPlan: ${clip(plan.name, 80)}${plan.season ? ' · ' + clip(plan.season, 40) : ''}${plan.brief ? ' · ' + clip(plan.brief, 300) : ''}\nBrief: ${clip(line.brief, 400)}\nTwist idea from the plan: ${clip(line.twist, 300)}\nWhy it is in the plan: ${clip(line.rationale, 300)}\n${trendWords}\nLibrary pieces that inspired it (for what the market likes; do not copy them): ${refs.map(r => `${clip(r.title, 90)}${r.attrs?.silhouette ? ' [' + clip(r.attrs.silhouette, 40) + ']' : ''}`).join('; ') || 'none'}\n${parent ? `This revises an earlier concept: ${clip(parent.name, 100)} — ${clip(parent.spec?.description, 300)}\n` : ''}${note ? `Steer: ${clip(note, 400)}\n` : ''}\nAnswer {"concepts":[{"name":"short product name","description":"one or two sentences","silhouette":"short","fabric":"short, simple and affordable","fit":"short","trims":"short","colors":["1-3 colours"],"details":["3-5 design details"],"logo":{"mark":"cue|word|lockup","placement":"where the Future Basics logo goes","technique":"embroidered|woven patch|screen print|rubber print|heat transfer|debossed|metal plaque"},"graphics":[{"name":"short","idea":"what the artwork is","placement":"front chest|left chest|front centre|full front|sleeve|back|back yoke|hem|inside","technique":"screen print|embroidery|woven jacquard|puff print|rubber print|heat transfer|debossed","colors":["Ink","Cue"],"svg":"optional: <svg viewBox=\"0 0 200 200\"> of rect/circle/line/path shapes only, no text, brand colours #141416 #FFFFFF #4BFF9A"}],"twist":"our own idea, specific"}]}`;
  const res = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens: 3500, env, fetchImpl, fixture: conceptFixture });
  const out = [], seen = new Set();
  for (const c of Array.isArray(res.json?.concepts) ? res.json.concepts : []) {
    const name = clip(c.name, 100); if (!name || seen.has(norm(name))) continue; seen.add(norm(name));
    out.push({ name, spec: ensureBranding(cleanSpec({ ...c, branding: { logo: c.logo } }), line.category), twist: clip(c.twist, 400) });
    if (out.length >= n) break;
  }
  return { concepts: out, costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env) };
}

// ---- 3. drawing it -----------------------------------------------------------------------------------------------------------------------------
export function imagePrompt(concept, { brandNames = [] } = {}) {
  const s = concept.spec || {}, say = t => stripBrands(clip(t, 400), brandNames), cat = concept.category, bare = [(LOGO_PLACE[cat] || LOGO_PLACE.other)[1] ? place(cat) : '', ...(s.graphics || []).filter(g => GRAPHIC_PLACE[g.placement] && g.svg).map(g => g.placement)].filter(Boolean);
  return [`A clean, photorealistic studio product photograph of one item for a menswear and unisex brand: ${say(concept.name)}${cat ? ` (${categoryLabel(cat).toLowerCase()})` : ''}.`,
    s.description ? say(s.description) : '', s.silhouette ? `Shape: ${say(s.silhouette)}.` : '', s.fabric ? `Fabric: ${say(s.fabric)}.` : '', s.colors?.length ? `Colour: ${say(s.colors.join(', '))}.` : '',
    s.details?.length ? `Design details: ${say(s.details.join('; '))}.` : '', s.trims ? `Trims: ${say(s.trims)}.` : '', concept.twist ? `Signature idea: ${say(concept.twist)}.` : '',
    'Three-quarter front view at eye level, on a plain light-grey background with soft light. The item only: no people, no hands, no mannequin.',
    bare.length ? `Keep these places completely plain and unmarked, because our own artwork is added afterwards: ${bare.join('; ')}.` : '',
    'No text, no lettering, no logos, no brand marks, no labels and no watermarks anywhere.'].filter(Boolean).join('\n').slice(0, 3800);
}
async function fixtureConceptImage(concept) {
  const c = ({ navy: '#2f3b57', cream: '#e8dfc9', olive: '#6b6f3a', rust: '#a4502d' })[norm((concept.spec?.colors || [])[0])] || '#59606b';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#e6e7ea"/><rect x="232" y="250" width="560" height="520" rx="70" fill="${c}"/><text x="512" y="900" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#555">TEST CONCEPT · ${String(concept.name).replace(/[<&>]/g, '').slice(0, 30)}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}
// → { image, thumb, model } as Buffers, or null when no image model is connected. The prompt is built from the concept alone: no reference picture goes in.
export async function renderConcept(concept, { cfg = imageConfig(), brandNames = [] } = {}) {
  if (!cfg.configured) return null;
  const buf = cfg.provider === 'fixture' ? await fixtureConceptImage(concept) : await openaiImage(imagePrompt(concept, { brandNames }), { ...cfg, size: process.env.HERO_SIZE || cfg.size || '1024x1024' });
  const upright = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(), marked = await composeBranding(upright, concept);
  const image = marked;
  const thumb = await sharp(marked).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
  return { image, thumb, model: cfg.model || cfg.provider };
}

// ---- turning an approved concept into a product ------------------------------------------------------------------------------------------------------
export const PRODUCT_TYPES = { tops: 'Tops', knitwear: 'Knitwear', outerwear: 'Outerwear', tailoring: 'Tailoring', bottoms: 'Bottoms', dresses: 'Dresses and sets', headwear: 'Headwear', footwear: 'Footwear', bags: 'Bags', accessories: 'Accessories', home: 'Home and objects', other: 'Other' };
const h = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The brief the tech pack assistant reads: the concept in words, our twist, and the commercial targets.
export function productBrief(concept, plan = {}) {
  const s = ensureBranding(concept.spec || {}, concept.category), lg = s.branding.logo, markName = LOGO_MARKS.find(m => m.id === lg.mark)?.label || 'Cue mark', money = c => (c == null ? '' : `$${(c / 100).toFixed(2)}`);
  const rows = [['Concept', concept.name], ['What it is', s.description], ['Shape', s.silhouette], ['Fabric', s.fabric], ['Fit', s.fit], ['Colour', (s.colors || []).join(', ')], ['Design details', (s.details || []).join('; ')], ['Trims', s.trims],
    ['Who it is for', 'Male-driven and unisex: menswear first, pieces anyone can wear'], ['Our twist', concept.twist], ['Future Basics logo', `${markName}, ${lg.placement}, ${lg.technique} (always on the piece)`], ['Internal label', `${s.branding.label} (always on the piece)`], ['Future Basics graphics', s.graphics.map(g => `${g.name} (${g.placement}, ${g.technique}${g.colors.length ? ', ' + g.colors.join(' and ') : ''}): ${g.idea}`).join('; ')], ['Target shelf price', money(concept.priceCents)], ['Estimated landed cost', money(concept.costCents)], ['Starting quantity', concept.qty ? String(concept.qty) : ''], ['Plan', [plan.name, plan.season].filter(Boolean).join(' · ')]].filter(r => r[1]);
  return `<p><strong>Designed in the Future Basics Design Lab.</strong> The reference picture is an AI concept render, not a sample.</p>` + rows.map(([k, v]) => `<p><strong>${h(k)}:</strong> ${h(v)}</p>`).join('');
}
export const cleanConceptEdit = (b, base) => {
  const out = { name: base.name, twist: base.twist, spec: { ...base.spec }, priceCents: base.priceCents, costCents: base.costCents, qty: base.qty, category: base.category };
  if (b.name !== undefined) { out.name = clip(b.name, 100); if (!out.name) return { error: 'Give the concept a name' }; }
  if (b.twist !== undefined) out.twist = clip(b.twist, 400);
  if (b.category !== undefined) { const c = cleanCategory(b.category); if (!c) return { error: 'Unknown category' }; out.category = c; }
  const specIn = { ...(b.spec || {}) }; for (const k of ['description', 'silhouette', 'fabric', 'fit', 'trims', 'colors', 'details']) if (b[k] !== undefined) specIn[k] = b[k];
  if (b.graphics !== undefined) specIn.graphics = cleanGraphics(b.graphics);
  if (b.logo !== undefined && b.logo && typeof b.logo === 'object') specIn.branding = { logo: { ...(out.spec.branding?.logo || {}), ...b.logo } };
  out.spec = ensureBranding(cleanSpec({ ...out.spec, ...specIn }), out.category);
  const money = v => { if (v === null || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n < 100000 ? Math.round(n * 100) : undefined; };
  if (b.price !== undefined) { const c = money(b.price); if (c === undefined) return { error: 'That price does not look right' }; out.priceCents = c; }
  if (b.cost !== undefined) { const c = money(b.cost); if (c === undefined) return { error: 'That cost does not look right' }; out.costCents = c; }
  if (b.qty !== undefined) { const q = Number(b.qty); if (!Number.isInteger(q) || q < 0 || q > 1_000_000) return { error: 'The quantity must be a whole number' }; out.qty = q; }
  return out;
};

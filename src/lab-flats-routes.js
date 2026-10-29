// Design Lab flats and placement (the page is src/lab-flats.html at /lab/flats; the drawing is src/lab-flats.js, shared with the page):
//   GET  /v1/lab/concepts/:id/flats             the piece as flats: saved, or worked out from the concept (style, fit, where its logo and graphics go)
//   PUT  /v1/lab/concepts/:id/flats             save {style, fit, m, options, placements} and check it
//   POST /v1/lab/concepts/:id/flats/check       check without saving
//   GET  /v1/lab/concepts/:id/flats/sheet.svg   the spec sheet: front and back flats, every placement measured, points of measure graded, the check
//   POST /v1/lab/concepts/:id/flats/tech-pack   send the flats to the concept's tech pack: the spec sheet and flats as files, the flats as its front and back
//                                               sketches, the graded measurements, every detail, stitch and placement, the colour, and the plan's numbers
//   POST /v1/lab/concepts/:id/flats/redraw      {…the flats, view, box:{x,y,w,h} in inches, prompt} the image model redraws that area of the flat sketch
//   POST /v1/lab/concepts/:id/flats/suggest     {…the flats, placementId} artwork sizes per group of garment sizes, and the inks for each colourway
//   GET  /v1/lab/concepts/:id/ready             what it still needs before the tech pack (the Design checklist)
//   POST /v1/lab/concepts/:id/studio/graphics   {layers:[{layer, name, image|art, widthIn, heightIn, placement, techniqueId?}]} the studio's placed
//                                               layers become the concept's graphics, and placements on its flats at their size
//   GET|POST /v1/lab/decor/quotes, DELETE /v1/lab/decor/quotes/:id   what factories really charged, against the estimate: it calibrates the costs
// The check ("can it be made"): every placement is on the piece and clear of seams, ribs, zips, pockets and collars (the drawing alone); within the
// technique's size; and its artwork, at the size it is placed, holds the technique's finest line, needs no more inks than the technique is priced for,
// has no smooth shading a screen cannot print, and, for embroidery, how many stitches it takes.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { maskFor } from './lab-flat-mask.js';
import { logoSvg } from './brand-kit.js';
import { cleanRules } from './lab-library.js';
import { ensureBranding } from './lab-concepts.js';
import { STYLES, FITS, SIZES, DETAILS, ALLOVER_BASES, templateOf, fitToTemplate, detectStyle, defaultTemplate, looksLikeFootwear, defaultParams, defaultPlacement, cleanFlat, cleanEdits, describeEdit, placementChecks, overlapChecks, boxesMeet, describe, renderSvg, pomTable, measurementsFor, fmt, fmtCm, drawingOf } from './lab-flats.js';
import { packRows, cleanColourways, costOf, FREIGHT_DUTY_PCT } from './lab-materials.js';
import { artColours } from './art.js';
import './pantone-c.js';
import { decorationCost, decorationLine, gradeArt, suggestInks, calibrationOf, PLACEMENTS, DECOR_COST } from './lab-decor.js';
const DECOR_BASES = () => DECOR_COST;
import { brandDoc, fact, table, safe, INK, DIM, LINE } from './brand-pdf.js';
import { imageConfig, openaiEdit } from './check.js';
import { callJsonSchema } from './studio.js';
import { rankTemplates, candidateTemplates } from './lab-flats.js';
import { brandHits } from './lab-concepts.js';
import { readiness } from './lab-ready.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// the logo's way of being made, in the words the concept uses, → the technique family it belongs to
const LOGO_BASE = { embroidered: 'embroidery', 'woven patch': 'woven jacquard', 'screen print': 'screen print', 'rubber print': 'rubber print', 'heat transfer': 'heat transfer', debossed: 'debossed', 'metal plaque': 'debossed' };
const PREFERRED = { embroidery: 'satin-embroidery', 'screen print': 'plastisol', 'puff print': 'puff-print', 'heat transfer': 'glossy-transfer', 'woven jacquard': 'woven-patch', 'chenille patch': 'chenille', 'rubber print': 'rubber-patch', debossed: 'deboss' };

// ---- the artwork, measured at the size it is placed ----
// opening (erode then dilate) with a square of side 2r+1: what disappears is finer than about 2r+1 pixels
function opened(mask, W, H, r) {
  const run = (src, horiz, keepIf) => { const out = new Uint8Array(W * H), n = horiz ? W : H, m = horiz ? H : W;
    for (let j = 0; j < m; j++) { const pre = new Int32Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + src[horiz ? j * W + i : i * W + j];
      for (let i = 0; i < n; i++) { const a = Math.max(0, i - r), b = Math.min(n - 1, i + r), s = pre[b + 1] - pre[a]; out[horiz ? j * W + i : i * W + j] = keepIf(s, b - a + 1, i - r < 0 || i + r > n - 1) ? 1 : 0; } }
    return out; };
  const erode = s => run(run(s, true, (sum, len, edge) => sum === len && !edge), false, (sum, len, edge) => sum === len && !edge);
  const dilate = s => run(run(s, true, sum => sum > 0), false, sum => sum > 0);
  return dilate(erode(mask));
}
export async function artInfo(buf, wIn, hIn, rules) {
  const mmPerPx = Math.max(.2, (wIn * 25.4) / 900), W = Math.max(8, Math.round(wIn * 25.4 / mmPerPx)), H = Math.max(8, Math.round(hIn * 25.4 / mmPerPx));
  const { data } = await sharp(buf).ensureAlpha().resize(W, H, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(W * H), bins = new Map(); let ink = 0;
  for (let i = 0; i < W * H; i++) if (data[i * 4 + 3] > 127) { mask[i] = 1; ink++; const k = (data[i * 4] >> 4) << 8 | (data[i * 4 + 1] >> 4) << 4 | (data[i * 4 + 2] >> 4); bins.set(k, (bins.get(k) || 0) + 1); }
  if (!ink) return { coverage: 0, inks: 0, gradient: false, fine: 0, holds: null, mmPerPx };
  const shares = [...bins.values()].map(n => n / ink).sort((a, b) => b - a), inks = shares.filter(s => s >= .02).length;
  // smooth shading: flat inks change only at their edges, a gradient or a photo changes a little almost everywhere (compared a few pixels apart)
  let soft = 0, pairs = 0; const st = 3;
  for (let y = 0; y < H; y += 2) for (let x = 0; x + st < W; x += 2) { const i = y * W + x, j = i + st; if (!mask[i] || !mask[j]) continue; pairs++; const dd = Math.max(Math.abs(data[i * 4] - data[j * 4]), Math.abs(data[i * 4 + 1] - data[j * 4 + 1]), Math.abs(data[i * 4 + 2] - data[j * 4 + 2])); if (dd >= 2 && dd <= 40) soft++; }
  const gradient = pairs > 50 && soft / pairs > .3;
  const lostAt = r => { const o = opened(mask, W, H, r); let lost = 0; for (let i = 0; i < W * H; i++) if (mask[i] && !o[i]) lost++; return lost / ink; };
  const need = Math.max(1, Math.round(rules.minLineMm / 2 / mmPerPx)), fine = lostAt(need);
  let holds = null; // the finest line the artwork keeps at this size, in mm
  if (fine > .03) { for (let r = need - 1; r >= 1; r--) if (lostAt(r) <= .03) { holds = (2 * r + 1) * mmPerPx; break; } if (holds == null) holds = mmPerPx; }
  return { coverage: ink / (W * H), inks, gradient, fine, holds, mmPerPx };
}
const pct = x => `${Math.round(x * 100)}%`;
export function artFindings(q, info, rules, tech) {
  const out = [], name = q.name, emb = tech.base === 'embroidery';
  if (info.fine > .03) {
    const scale = info.holds ? rules.minLineMm / info.holds : 2, bigger = Math.min(q.w * scale, rules.maxW);
    out.push({ level: info.fine > .15 ? 'fail' : 'warn', code: 'FINE_DETAIL', text: `About ${pct(info.fine)} of ${name} is finer than ${rules.minLineMm} mm at ${fmt(q.w)} wide, so it will ${emb ? 'not hold stitches' : 'fill in or break up'}. ${bigger > q.w * 1.05 && bigger <= rules.maxW ? `Make it at least ${fmt(bigger)} wide, ` : ''}thicken the thin lines, or choose a technique that holds finer detail${emb ? ' (a woven patch or a print)' : ' (a heat transfer)'}.` });
  }
  if (rules.maxColors && info.inks > rules.maxColors) out.push({ level: 'warn', code: 'INKS', text: `${name} has about ${info.inks} ${emb ? 'thread' : 'ink'} colours; ${tech.name} is usually priced for up to ${rules.maxColors}. Each extra ${emb ? 'thread is another change' : 'ink is another screen'} and costs more.` });
  if (info.gradient && tech.base === 'screen print' && tech.finish?.effect !== 'halftone') out.push({ level: 'warn', code: 'GRADIENT', text: `${name} has smooth shading or many tones. A screen prints flat colours, so it needs halftone dots (the Halftone print technique) or a heat transfer.` });
  if (emb) { const st = Math.round(info.coverage * q.w * q.h * (rules.density || 1800) / 100) * 100; out.push({ level: st > 30000 ? 'warn' : 'info', code: 'STITCHES', text: `About ${st.toLocaleString('en-US')} stitches${st > 30000 ? ': heavy and stiff on a garment. Lower the fill or the size.' : '.'}` }); }
  if (q.w < .75 || q.h < .3) out.push({ level: 'warn', code: 'TINY', text: `${name} is very small (${fmt(q.w)} × ${fmt(q.h)}). Check it reads at that size.` });
  return out;
}

// what the image model is asked when it redraws an area of a flat
// the whole view drawn from the concept's picture: the sketch gives the frame (pose, size, where the shoulders and hem sit, so the inches still
// line up), the picture gives everything the garment really is
export const flatDrawPrompt = (view, words = '') => [
  `Image 1 is a technical flat sketch of a garment, ${view} view. Image 2 is a photograph of the real garment${words ? ` (${words})` : ''}.`,
  `Redraw image 1 as the professional technical flat of the garment in image 2, ${view} view, the way a factory tech pack shows it.`,
  'Keep the canvas, the framing, the pose, the scale and the centre line of image 1 exactly: the garment sits in the same place and at the same size, with the shoulders, neck and sleeves where image 1 has them. Change the length, the shape and the hem only where image 2 really differs (a cropped body is drawn cropped).',
  `Draw every construction detail image 2 shows on the ${view}: collar and lapel shape, closures and buttons or snaps, pockets and flaps, yokes, panels and seams, linings and quilting that show, cuffs, hems, waistbands, drawcords and their tips, stripes and contrast bands that are part of the cloth, topstitching as dashed lines.`,
  'Flat colour fills in the garment\'s real colours from image 2 (main cloth, contrast, lining, trims), clean black outlines of even weight, no photographic texture, no shading or gradients, no shadows, plain white background.',
  'Leave out logos, patches, printed graphics and text: they are placed separately. No people, no hangers, no labels, no measurements.',
  view === 'back' ? 'If image 2 does not show the back, draw the back that goes with that front: the same body, sleeves, hem, cuffs and colours, with the back yoke and seams such a garment has.' : ''
].filter(Boolean).join('\n');
// RGB (3 channels) → RGBA: near-white pixels joined to the edge of the picture become clear, the rest (the garment) stays as drawn
export function clearBackground(rgb, w, h, light = 236) {
  const out = Buffer.alloc(w * h * 4), seen = new Uint8Array(w * h), stack = [];
  const white = i => rgb[i * 3] >= light && rgb[i * 3 + 1] >= light && rgb[i * 3 + 2] >= light;
  for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); } for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
  while (stack.length) { const i = stack.pop(); if (seen[i] || !white(i)) continue; seen[i] = 1; const x = i % w, y = (i - x) / w;
    if (x > 0) stack.push(i - 1); if (x < w - 1) stack.push(i + 1); if (y > 0) stack.push(i - w); if (y < h - 1) stack.push(i + w); }
  for (let i = 0; i < w * h; i++) { out[i * 4] = rgb[i * 3]; out[i * 4 + 1] = rgb[i * 3 + 1]; out[i * 4 + 2] = rgb[i * 3 + 2]; out[i * 4 + 3] = seen[i] ? 0 : 255; }
  return out;
}
export const flatEditPrompt = prompt => [
  'This is a black-and-white technical flat sketch of a garment: clean vector line art the way a factory reads it, white cloth, black outlines, dashed lines for topstitching.',
  `Redraw only the transparent area of the mask: ${prompt}`,
  'Match the drawing exactly: the same line weight, the same flat-sketch style, white fill, black lines, dashed lines for stitching. No colour, no shading, no texture, no text, no logos, no people. The change joins the lines around it seamlessly, and everything outside the area stays exactly as it is.'
].join('\n');

export function registerLabFlatsRoutes(app, d) {
  const { pool, authenticate, adminOnly, attachArtwork, applyHandoff, log = console, env = process.env, imageCfg = () => imageConfig(env), editImpl = openaiEdit , pickImpl = callJsonSchema, lab = null } = d;
  const own = req => lab?.scope?.(req) || null, charge = async (req, o) => (lab ? lab.charge(req, o) : null); // a client's room: its own quotes, its AI meter
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const concept = async id => (UUID.test(String(id)) ? (await pool.query('select c.id, c.name, c.category, c.status, c.spec, c.twist, c.product_id, c.price_cents, c.cost_cents, c.qty, c.updated_at, c.client_id, p.name plan_name from lab_concepts c left join lab_plans p on p.id=c.plan_id where c.id=$1', [id])).rows[0] : null);
  // the techniques a piece may be made with: a Future Basics piece, all of ours; a client's piece, its room's own plus the built-in starter set
  const techniques = async (cid = null) => (await pool.query('select id, key, kind, name, base, finish, rules from lab_techniques where not archived and ((client_id is null and ($1::uuid is null or builtin)) or client_id=$1) order by builtin desc, name', [UUID.test(String(cid || '')) ? cid : null])).rows.map(t => ({ ...t, rules: cleanRules(t.rules || {}, t.base) }));
  const techFor = (list, q) => list.find(t => t.id === q.techniqueId) || list.find(t => t.key === PREFERRED[q.technique]) || list.find(t => t.base === q.technique) || list.find(t => t.key === 'plastisol') || { name: q.technique || 'screen print', base: q.technique || 'screen print', rules: cleanRules({}, q.technique) };
  const marks = new Map();
  const markPng = async mark => { if (!marks.has(mark)) marks.set(mark, await sharp(Buffer.from(logoSvg(mark))).resize({ width: 1200 }).png().toBuffer()); return marks.get(mark); };
  const pngOf = async q => q.art ? (await pool.query('select png from lab_art where id=$1', [q.art])).rows[0]?.png || null : q.mark ? markPng(q.mark) : null;
  const aspectOf = async q => { const b = await pngOf(q); if (!b) return 1; const m = await sharp(b).metadata(); return (m.width || 1) / (m.height || 1); };

  // the sketch the piece is drawn from: scored from the words, then confirmed from the concept's picture by the vision model (cached per picture)
  const picks = new Map();
  async function pickTemplate(c, det) {
    const ranked = rankTemplates(det.style, det.fit, [c.name, c.spec?.silhouette, c.spec?.fabric, c.spec?.fit, c.spec?.description, ...(c.spec?.details || [])].join(' '), [c.name, c.spec?.silhouette, c.spec?.fabric].join(' '));
    if (ranked.length < 2 || !env.ANTHROPIC_API_KEY || env.AI_FIXTURE) return det.template;
    const key = c.id + ':' + String(c.updated_at || ''); if (picks.has(key)) return picks.get(key);
    const img = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image; if (!img) return det.template;
    const cands = candidateTemplates(ranked);
    try {
      const jpeg = await sharp(img).resize({ width: 900, height: 900, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
      const out = await pickImpl('You are a garment technologist choosing which professional flat sketch a product picture should be drawn from. Judge the silhouette (leg or body shape, rise, width, length), the construction (pockets, panels, knees, pleats, closures) and the fabric family. Prefer the sketch that adds nothing the garment does not have.',
        [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: `The concept: ${clip([c.name, c.spec?.silhouette, c.spec?.fabric, c.spec?.description].filter(Boolean).join(' · '), 500)}\nThe sketches to choose from:\n${cands.map(t => `- id "${t.id}": ${t.label}`).join('\n')}\nAnswer with the id of the closest sketch.` }],
        { type: 'object', additionalProperties: false, required: ['id', 'why'], properties: { id: { type: 'string', enum: cands.map(t => t.id) }, why: { type: 'string' } } }, { maxTokens: 300 });
      const id = cands.some(t => t.id === out?.id) ? out.id : det.template; if (picks.size > 500) picks.clear(); picks.set(key, id); return id;
    } catch (e) { log.warn?.({ err: e.message }, 'flats sketch pick by picture failed'); return det.template; }
  }
  // what the concept's picture shows: the garment it is, its fit and its main colour, read by the vision model (cached per picture). The flat is
  // drawn from this, so a trucker jacket in the picture is never drawn as the sweatshirt its line's category suggests. FLAT_READ_FIXTURE (JSON)
  // stands in for the model where the assistant runs on fixtures.
  const reads = new Map();
  async function readPicture(c) {
    const img = (await pool.query('select image from lab_concepts where id=$1', [c.id])).rows[0]?.image; if (!img) return null;
    const key = createHash('sha1').update(img).digest('hex'); if (reads.has(key)) return reads.get(key);
    let out = null;
    if (env.AI_FIXTURE || !env.ANTHROPIC_API_KEY) { try { out = env.FLAT_READ_FIXTURE ? JSON.parse(env.FLAT_READ_FIXTURE) : null; } catch { out = null; } }
    else {
      try {
        const jpeg = await sharp(img).resize({ width: 900, height: 900, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer(), styles = Object.keys(STYLES);
        out = await pickImpl('You are a garment technologist. Say which garment a product picture shows, so its technical flat is drawn from the right sketch: the garment type, its fit, and the colour of its main cloth.',
          [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: `The garment types:\n${styles.map(k => `- "${k}": ${STYLES[k].label}`).join('\n')}\n- "other": none of these (footwear, accessories, anything else)\nThe concept is called "${clip(c.name, 80)}". If the picture shows several views of one garment, judge that garment.` }],
          { type: 'object', additionalProperties: false, required: ['style', 'fit', 'color', 'why'], properties: { style: { type: 'string', enum: [...styles, 'other'] }, fit: { type: 'string', enum: Object.keys(FITS) }, color: { type: 'string', description: 'the main cloth colour as #rrggbb' }, why: { type: 'string' } } }, { maxTokens: 300 });
      } catch (e) { log.warn?.({ err: e.message }, 'flats picture read failed'); return null; }
    }
    const r = out && STYLES[out.style] ? { style: out.style, fit: FITS[out.fit] ? out.fit : null, color: /^#[0-9a-f]{6}$/i.test(String(out.color || '')) ? String(out.color).toLowerCase() : null } : null;
    if (reads.size > 500) reads.clear(); reads.set(key, r); return r;
  }
  const rgb = h => [1, 3, 5].map(i => parseInt(String(h).slice(i, i + 2), 16)), far = (a, b) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) > 70; };
  async function mismatch(c, params) {
    if (params.drawn?.front && params.drawn.template === params.template) return null; // already drawn from the picture
    const hasPicture = (await pool.query('select image is not null h from lab_concepts where id=$1', [c.id])).rows[0]?.h; if (!hasPicture) return null;
    const stock = { style: params.style, label: STYLES[params.style]?.label || params.style, color: null, reasons: ['it is still a stock sketch, not drawn from the picture'] };
    const read = await readPicture(c); if (!read) return stock;
    const reasons = [], sketchName = (style, template) => templateOf({ style, template })?.label || STYLES[style].label;
    if (read.style !== params.style) reasons.push(`the picture shows a ${STYLES[read.style].label.toLowerCase()}, the flat is a ${STYLES[params.style]?.label.toLowerCase() || params.style}`);
    else if (params.template && params.template !== 'none') {
      const words = [c.name, c.spec?.silhouette, c.spec?.fabric, c.spec?.fit, c.spec?.description].join(' '), fit = read.fit || params.fit;
      const best = await pickTemplate(c, { style: read.style, fit, template: defaultTemplate(read.style, fit, words, [c.name, c.spec?.silhouette, c.spec?.fabric].join(' ')) });
      if (best && best !== params.template) reasons.push(`the picture is closest to the “${sketchName(read.style, best)}” sketch, the flat is drawn from “${sketchName(params.style, params.template)}”`);
    }
    if (read.color && (!params.color || far(read.color, params.color))) reasons.push(`the cloth in the picture is ${read.color}, the flat is ${params.color || 'white'}`);
    return { style: read.style, label: STYLES[read.style].label, color: read.color, reasons: reasons.length ? reasons : stock.reasons };
  }
  // a graphic measured in the studio keeps its size: the spot's top edge stays where the spot puts it
  const sized = (box, g) => { const w = Number(g.widthIn), h = Number(g.heightIn); if (!(w > 0 && h > 0)) return box; const top = box.y - box.h / 2; return { ...box, w: Math.round(w * 8) / 8, h: Math.round(h * 8) / 8, y: Math.round((top + h / 2) * 8) / 8 }; };
  // where the piece starts: its style, fit and details from its words, and its logo and graphics where the concept said they go
  async function initial(c, read = undefined) {
    if (read === undefined) read = await readPicture(c);
    // a concept started from scratch names its style, and is drawn as a plain outline to draw over, not from a sketch
    let det = c.spec?.scratch && STYLES[c.spec.style] ? { style: c.spec.style, fit: 'regular', options: {}, template: 'none' } : detectStyle(c);
    // the picture wins over the words: the flat is drawn as the garment the picture shows
    if (read && read.style !== det?.style && !(looksLikeFootwear(c) && !det)) { const words = [c.name, c.spec?.silhouette, c.spec?.fabric, c.spec?.fit, c.spec?.description].join(' '), fit = read.fit || det?.fit || 'regular';
      det = { style: read.style, fit, options: det?.options || {}, template: defaultTemplate(read.style, fit, words, [c.name, c.spec?.silhouette, c.spec?.fabric].join(' ')) }; }
    if (!det) return null;
    if (det.template !== 'none' || !c.spec?.scratch) det.template = await pickTemplate(c, det);
    const params = fitToTemplate({ ...defaultParams(det.style, det.fit, det.options), ...(det.template ? { template: det.template } : {}), ...(read?.color ? { color: read.color } : {}) }), spec = ensureBranding(c.spec || {}, c.category), placements = [], list = await techniques(c.client_id);
    const logo = spec.branding?.logo || {};
    if (logo.mark && logo.mark !== 'none') { const mark = logo.mark === 'cue' ? 'mark' : logo.mark, base = LOGO_BASE[logo.technique] || 'embroidery', aspect = await aspectOf({ mark }); const t = techFor(list, { technique: base });
      placements.push({ id: 'logo', name: 'Future Basics logo', source: 'logo', mark, technique: base, techniqueId: t.id, ...defaultPlacement('logo', params, { aspect, label: logo.placement || '' }) }); }
    // the branding pass keeps a graphic's words; what the studio measured (its layer and size) is read from the concept as saved
    const raw = Array.isArray(c.spec?.graphics) ? c.spec.graphics : [];
    for (const [i, g0] of (spec.graphics || []).entries()) { if (!g0.art) continue; const r0 = raw.find(x => x.art === g0.art && x.studioLayer) || {}, g = { ...g0, ...(r0.studioLayer ? { placement: r0.placement || g0.placement } : {}), studioLayer: r0.studioLayer, widthIn: r0.widthIn, heightIn: r0.heightIn }; const aspect = await aspectOf({ art: g.art }), t = techFor(list, { techniqueId: g.finish?.id, technique: g.technique });
      placements.push({ id: g.studioLayer ? 's-' + g.studioLayer : 'g' + i, name: g.name || `Graphic ${i + 1}`, source: g.studioLayer ? 'studio' : 'graphic', ...(g.studioLayer ? { layer: g.studioLayer } : {}), art: g.art, technique: t.base, techniqueId: t.id, ...sized(defaultPlacement('graphic', params, { aspect, label: g.placement || '' }), g) }); }
    // a logo that would sit on a graphic goes to the back neck instead
    const lg = placements.find(q => q.source === 'logo');
    if (lg && placements.some(q => q !== lg && boxesMeet(lg, q))) Object.assign(lg, defaultPlacement('logo', params, { aspect: lg.w / lg.h, label: 'back neck' }));
    return { ...params, placements };
  }
  // the check: { findings: {placementId: [..]}, summary: {fail, warn}, at }
  async function check(params, placements, cid = null) {
    const list = await techniques(cid), findings = {}, over = overlapChecks(placements); let fail = 0, warn = 0;
    for (const q of placements) {
      const t = techFor(list, q), rules = { ...t.rules, techniqueName: t.name }, f = [...placementChecks(q, params, rules), ...(over[q.id] || [])];
      try { const b = await pngOf(q); if (b) f.push(...artFindings(q, await artInfo(b, q.w, q.h, rules), rules, t)); } catch (e) { log.warn?.({ err: e.message }, 'flats artwork check failed'); }
      findings[q.id] = f; fail += f.filter(x => x.level === 'fail').length; warn += f.filter(x => x.level === 'warn').length;
    }
    return { findings, summary: { fail, warn, placements: placements.length }, at: new Date().toISOString() };
  }
  // each placement priced: its colours read from its artwork (a mark is one ink), its coverage, its size and how it is made, at the planned quantity
  const colourCache = new Map();
  async function coloursOf(q) {
    if (q.mark) return [{ hex: '#141416', name: 'Ink', pantone: 'PANTONE Black 6 C', share: 1 }];
    const key = q.art || ''; if (colourCache.has(key)) return colourCache.get(key);
    const b = await pngOf(q); const list = b ? (await artColours(b, { max: 12 })).filter(c => c.share >= .02).map(c => ({ hex: c.hex, name: c.name, pantone: c.code || '', share: c.share })) : [];
    if (colourCache.size > 300) colourCache.clear(); colourCache.set(key, list); return list;
  }
  // the factories' quotes, per technique (and per base technique for those with none of their own)
  async function calibrations() {
    const rows = (await pool.query('select technique_id, base, actual_cents, estimate_cents from lab_decor_quotes order by created_at desc limit 2000').catch(() => ({ rows: [] }))).rows, byT = {}, byB = {};
    for (const r of rows) { const q = { actualCents: r.actual_cents, estimateCents: r.estimate_cents }; if (r.technique_id) (byT[r.technique_id] ||= []).push(q); (byB[r.base] ||= []).push(q); }
    return { byTechnique: Object.fromEntries(Object.entries(byT).map(([k, v]) => [k, calibrationOf(v)])), byBase: Object.fromEntries(Object.entries(byB).map(([k, v]) => [k, calibrationOf(v)])) };
  }
  const calFor = (cal, t) => (t.id && cal.byTechnique[t.id]) || cal.byBase[t.base] || null;
  // the cloth an all-over print covers, front, back and sleeves: in square inches, from the sample size
  function panelArea(p) {
    const m = measurementsFor(p, 'M');
    if (m.chest && m.length) return Math.round(m.chest * m.length * 2 + (m.sleeve || 0) * (m.armhole || 9) * 2);
    if (m.hip && m.inseam) return Math.round(m.hip * (m.inseam + (m.rise || 11)) * 2);
    if (m.width && m.height) return Math.round(m.width * m.height * 2);
    if (m.crownWidth) return Math.round(m.crownWidth * (m.crownHeight || 6) * 3);
    return 600;
  }
  async function decorationsOf(c, params, placements) {
    const list = await techniques(c.client_id), out = [], cal = await calibrations();
    for (const q of placements) {
      const t = techFor(list, q), cols = await coloursOf(q); let coverage = .6;
      try { const b = await pngOf(q); if (b) coverage = (await artInfo(b, q.w, q.h, t.rules)).coverage || .6; } catch { /* the usual coverage */ }
      const cost = decorationCost({ base: t.base, rules: t.rules, widthIn: q.w, heightIn: q.h, colours: Math.max(1, cols.length), coverage, qty: c.qty || 300, calibration: calFor(cal, t) });
      out.push({ id: q.id, ...decorationLine({ name: q.name, technique: t.name, base: t.base, widthIn: q.w, heightIn: q.h, colours: Math.max(1, cols.length), pantones: cols.map(x => x.pantone || x.hex), cost, view: q.view, placement: describe(q, params) }),
        techniqueId: t.id || null, ...(q.grade ? { grade: q.grade } : {}), ...(q.inks ? { inks: q.inks } : {}) });
    }
    const ao = params.allover;
    if (ao) { const t = (ao.techniqueId && list.find(x => x.id === ao.techniqueId)) || { id: null, name: ao.base.replace(/^./, ch => ch.toUpperCase()), base: ao.base, rules: {} }, cols = await coloursOf({ art: ao.art }), area = panelArea(params);
      const cost = decorationCost({ base: ao.base, rules: t.rules, widthIn: area, heightIn: 1, colours: Math.max(1, cols.length), coverage: 1, qty: c.qty || 300, calibration: calFor(cal, { id: t.id, base: ao.base }) });
      out.push({ id: 'allover', ...decorationLine({ name: ao.name || 'All-over print', technique: t.name, base: ao.base, widthIn: ao.w, heightIn: ao.h, colours: Math.max(1, cols.length), pantones: cols.map(x => x.pantone || x.hex), cost, view: 'front', placement: `All over the piece, a ${ao.type} repeat of ${fmt(ao.w)} × ${fmt(ao.h)}, about ${area} sq in of cloth` }), techniqueId: t.id || null, allover: true }); }
    return out;
  }
  // the all-over print's repeat tile, for drawing it on the flats
  const alloverHrefOf = async p => { if (!p.allover) return ''; const r = (await pool.query('select png from lab_art where id=$1', [p.allover.art])).rows[0]; return r ? `data:image/png;base64,${r.png.toString('base64')}` : ''; };
  // the concept carries its decorations, so its costing and the plan's margin count them
  async function keepDecorations(c, decorations) {
    const spec = { ...(c.spec || {}), decorations }, picks = Array.isArray(spec.materials) ? spec.materials : [], k = spec.costing || {};
    const cost = costOf(picks, { category: c.category, priceCents: c.price_cents, makingCents: Number.isFinite(Number(k.makingCents)) ? Number(k.makingCents) : null, freightPct: Number.isFinite(Number(k.freightPct)) ? Number(k.freightPct) : FREIGHT_DUTY_PCT, decorations });
    await pool.query('update lab_concepts set spec=$2, cost_cents=$3 where id=$1', [c.id, spec, picks.length || decorations.length ? cost.landedCents : c.cost_cents]);
    return cost;
  }
  const shape = (c, row, extra = {}) => ({ concept: { id: c.id, name: c.name, category: c.category, status: c.status, productId: c.product_id, locked: c.status === 'tech_pack' && !c.product_id }, colourways: cleanColourways(c.spec?.colourways), alloverBases: ALLOVER_BASES, decorations: Array.isArray(c.spec?.decorations) && c.spec.decorations.length ? c.spec.decorations : null, ...extra,
    styles: Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, { label: v.label, kind: v.kind, oneSize: Boolean(v.oneSize) }])), fits: FITS, sizes: SIZES, flat: row });

  app.get('/v1/lab/concepts/:id/flats', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select style, params, placements, check_result, checked_at, updated_at from lab_flats where concept_id=$1', [c.id])).rows[0];
    const list = (await techniques(c.client_id)).map(t => ({ id: t.id, name: t.name, kind: t.kind, base: t.base, rules: t.rules }));
    // a saved flat that does not match its picture (another garment, another sketch, or a cloth colour far from the picture's) says so, and
    // offers to redraw it from the picture
    if (r) return shape(c, { ...r.params, placements: r.placements, check: r.check_result, saved: true, updatedAt: r.updated_at }, { techniques: list, picture: await mismatch(c, r.params) });
    const init = await initial(c);
    if (!init) return shape(c, null, { techniques: list, unsupported: looksLikeFootwear(c) && c.category !== 'footwear' ? `This piece reads as footwear, but it sits in a ${c.category} line, so it is not drawn as ${c.category}. Flats are not drawn for footwear yet: change the concept's words, or keep it in a footwear line.` : `Flats are not drawn for ${c.category} yet. They cover tops, hoodies, sweatshirts, jackets, pants, shorts, caps, beanies and totes.` });
    return shape(c, { ...init, check: await check(init, init.placements, c.client_id), saved: false }, { techniques: list, picture: await mismatch(c, init) });
  });
  // the flat drawn again from the picture (not saved): the garment, fit and colour the picture shows; the graphics come along, the ones added
  // on the flats alone included
  app.get('/v1/lab/concepts/:id/flats/from-picture', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const init = await initial(c); if (!init) return bad(reply, 'The picture does not show a garment the flats can draw yet');
    const old = (await pool.query('select placements from lab_flats where concept_id=$1', [c.id])).rows[0]?.placements || [];
    const extra = old.filter(q => !init.placements.some(x => x.id === q.id || (q.layer && x.layer === q.layer)) && q.source !== 'logo'); // measured from the centre front, so they keep their spots on the new sketch
    const { params, placements } = cleanFlat({ ...init, placements: [...init.placements, ...extra] });
    return { flat: { ...params, placements, check: await check(params, placements, c.client_id), saved: false } };
  });
  // what the concept still needs before it becomes a tech pack: the Design workspace's checklist (src/lab-ready.js)
  app.get('/v1/lab/concepts/:id/ready', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const c = (await pool.query('select id, status, spec, twist, closeness, product_id, client_verdict, (image is not null) has_image from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    const doc = (await pool.query('select doc from lab_studio_docs where concept_id=$1', [c.id])).rows[0]?.doc || null, f = (await pool.query('select check_result from lab_flats where concept_id=$1', [c.id])).rows[0];
    return readiness({ concept: c, studioDoc: doc, flat: f ? { check: f.check_result } : null });
  });
  const take = async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404), null;
    const { params, placements, error } = cleanFlat(req.body || {}); if (error) return bad(reply, error), null;
    for (const q of placements) if (q.art && !(await pool.query('select 1 from lab_art where id=$1', [q.art])).rowCount) return bad(reply, `${q.name}: that graphic is not in the library`, 422), null;
    for (const e of params.edits) if (e.type === 'ai' && !(await pool.query('select 1 from lab_art where id=$1', [e.art])).rowCount) return bad(reply, 'A redrawn area is missing its picture', 422), null;
    for (const v of ['front', 'back']) if (params.markup?.[v] && !(await pool.query('select 1 from lab_art where id=$1', [params.markup[v].art])).rowCount) return bad(reply, `What was drawn on the ${v} is missing its picture`, 422), null;
    return { c, params, placements };
  };
  app.post('/v1/lab/concepts/:id/flats/check', { preHandler: pre }, async (req, reply) => { const t = await take(req, reply); if (!t) return; const ck = await check(t.params, t.placements, t.c.client_id); return { check: ck, where: Object.fromEntries(t.placements.map(q => [q.id, describe(q, t.params)])) }; });
  app.put('/v1/lab/concepts/:id/flats', { preHandler: pre }, async (req, reply) => {
    const t = await take(req, reply); if (!t) return;
    if (t.c.status === 'tech_pack' && !t.c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const ck = await check(t.params, t.placements, t.c.client_id);
    await pool.query(`insert into lab_flats(concept_id, style, params, placements, check_result, checked_at, updated_by) values($1,$2,$3,$4,$5,now(),$6)
      on conflict(concept_id) do update set style=excluded.style, params=excluded.params, placements=excluded.placements, check_result=excluded.check_result, checked_at=now(), updated_by=excluded.updated_by, updated_at=now()`,
    [t.c.id, t.params.style, t.params, JSON.stringify(t.placements), ck, actorOf(req)]);
    let decorations = [], cost = null; try { decorations = await decorationsOf(t.c, t.params, t.placements); cost = await keepDecorations(t.c, decorations); } catch (e) { log.warn?.({ err: e.message }, 'flats decoration costing failed'); }
    return { ok: true, check: ck, where: Object.fromEntries(t.placements.map(q => [q.id, describe(q, t.params)])), decorations, cost: cost ? { decorationCents: cost.decorationCents, landedCents: cost.landedCents, marginPct: cost.marginPct } : null };
  });

  // ---- the spec sheet ----
  // the sketch goes inside the sheet as a data URL, so the saved file, the print and the tech-pack picture all stand on their own
  const sketches = new Map(), templateHref = file => { if (!sketches.has(file)) sketches.set(file, `data:image/svg+xml;base64,${readFileSync(new URL(`./flat-templates/${file}`, import.meta.url)).toString('base64')}`); return sketches.get(file); };
  // the sketch's own markup, drawn inline when the service turns a flat into a picture: a picture of the whole page would be rasterised at
  // the zoom of the frame, which takes half a minute for a close-up
  // the add-on parts as pictures inside the sheet (a data URL, so the sheet stands alone and rasterises without fetching)
  const partData = new Map(), partHref = file => { if (!partData.has(file)) { try { partData.set(file, `data:image/webp;base64,${readFileSync(new URL(`./flat-parts/${file}`, import.meta.url)).toString('base64')}`); } catch { partData.set(file, ''); } } return partData.get(file); };
  // each sketch's silhouette, as a data URL for the sheet, the PDF and the files: made before drawing (it takes a moment the first time), then kept
  const masks = new Map(), maskHref = file => masks.get(file) || null;
  const prepMasks = async p => { for (const v of ['front', 'back']) { const d = drawingOf(p, v, p.size || 'M'); if (!d || masks.has(d.t.file)) continue;
    try { masks.set(d.t.file, `data:image/png;base64,${(await maskFor(d.t.file, file => readFileSync(new URL(`./flat-templates/${file}`, import.meta.url)), file => readFileSync(new URL(`./flat-templates/masks/${file}`, import.meta.url)))).toString('base64')}`); } catch (e) { log.warn?.({ err: e.message, file: d.t.file }, 'flat silhouette not made'); } } };
  const inline = new Map(), templateSvg = file => { if (!inline.has(file)) { const t = readFileSync(new URL(`./flat-templates/${file}`, import.meta.url), 'utf8'); inline.set(file, t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>'))); } return inline.get(file); };
  // the areas the image model redrew, as data URLs for the same reason
  const editHrefsOf = async params => { const ids = [...new Set([...(params.edits || []).filter(e => e.type === 'ai').map(e => e.art), ...['front', 'back'].map(v => params.drawn?.[v]).filter(Boolean), ...['front', 'back'].map(v => params.markup?.[v]?.art).filter(Boolean)])]; if (!ids.length) return {};
    return Object.fromEntries((await pool.query('select id, png from lab_art where id = any($1::uuid[])', [ids])).rows.map(r => [r.id, `data:image/png;base64,${r.png.toString('base64')}`])); };

  // ---- an area of the flat redrawn by the image model ----
  const redraws = new Map(), dayOf = () => new Date().toISOString().slice(0, 10), redrawCap = () => Math.max(0, Number(env.LAB_DAILY_FLAT_AI ?? 60) || 0);
  app.post('/v1/lab/concepts/:id/flats/redraw', { preHandler: pre }, async (req, reply) => {
    const t = await take(req, reply); if (!t) return;
    if (t.c.status === 'tech_pack' && !t.c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const b = req.body || {}, view = b.view === 'back' ? 'back' : 'front', prompt = clip(b.prompt, 300);
    if (prompt.length < 3) return bad(reply, 'Say what to change in the area');
    const hits = brandHits(prompt, (await pool.query('select name from lab_brands')).rows.map(r => r.name));
    if (hits.length) return bad(reply, `Leave other brands out of the prompt (${hits.slice(0, 3).join(', ')}). Describe the detail in your own words.`);
    const box = cleanEdits([{ type: 'detail', kind: 'erase', view, ...(b.box || {}) }])[0]; if (!box || box.w < .5 || box.h < .5) return bad(reply, 'Select an area at least half an inch across');
    const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected', 503);
    if ((redraws.get(dayOf()) || 0) >= redrawCap()) return bad(reply, `The daily limit of ${redrawCap()} AI redraws of flats is reached. Raise LAB_DAILY_FLAT_AI.`, 429);
    try { await charge(req, { kind: 'flat', conceptId: t.c.id }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    // the view as it stands, in black and white (the model draws line art; the colour goes back on afterwards), framed on the area with room
    // around it so the model sees how the change joins the rest
    const N = 1024, side = Math.max(box.w, box.h) * 2.2, cx0 = box.x - side / 2, cy0 = box.y - side / 2;
    const plainP = { ...t.params, color: '', edits: t.params.edits.filter(e => e.type !== 'block') }, hrefs = await editHrefsOf(plainP);
    const frame = background => Buffer.from(renderSvg(plainP, view, { plain: true, scale: 0, templateSvg, partHref, editHrefs: hrefs, background }).replace(/^<svg ([^>]*?)viewBox="[^"]*"/, `<svg $1viewBox="${cx0} ${cy0} ${side} ${side}" width="${N}" height="${N}"`));
    const before = await sharp(frame(true)).flatten({ background: '#ffffff' }).png().toBuffer();
    const cloth = await sharp(frame(false)).ensureAlpha().extractChannel('alpha').raw().toBuffer();
    const px = v => Math.round(v / side * N), bx = px(box.x - box.w / 2 - cx0), by = px(box.y - box.h / 2 - cy0), bw = Math.max(1, Math.min(N - bx, px(box.w))), bh = Math.max(1, Math.min(N - by, px(box.h)));
    const m = Buffer.alloc(N * N * 4, 255); for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) m[(y * N + x) * 4 + 3] = 0;
    const mask = await sharp(m, { raw: { width: N, height: N, channels: 4 } }).png().toBuffer();
    let out;
    try {
      out = cfg.provider === 'fixture'
        ? await sharp(before).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><ellipse cx="${bx + bw / 2}" cy="${by + bh / 2}" rx="${bw * .35}" ry="${bh * .35}" fill="none" stroke="#141416" stroke-width="6"/></svg>`) }]).png().toBuffer()
        : await editImpl({ images: [before], mask, prompt: flatEditPrompt(prompt), cfg: { ...cfg, size: '1024x1024' } });
    } catch (e) { return bad(reply, `The image model could not do it: ${clip(e.message, 200)}`, 502); }
    redraws.set(dayOf(), (redraws.get(dayOf()) || 0) + 1);
    // the area alone, grey, clear outside the cloth unless the model drew a line there, so the garment's colour goes back on over it
    const grey = await sharp(out).resize(N, N, { fit: 'fill' }).greyscale().extract({ left: bx, top: by, width: bw, height: bh }).raw().toBuffer();
    const rgba = Buffer.alloc(bw * bh * 4);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const g = grey[y * bw + x], i = (y * bw + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = g; rgba[i + 3] = cloth[(by + y) * N + bx + x] > 0 || g < 200 ? 255 : 0; }
    const png = await sharp(rgba, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer(), thumb = await sharp(png).resize({ width: 256, height: 256, fit: 'inside' }).png().toBuffer();
    const art = (await pool.query(`insert into lab_art(concept_id,name,png,thumb,prompt,model,source,in_library,created_by) values($1,$2,$3,$4,$5,$6,'flat',false,$7) returning id`, [t.c.id, clip(`Flat: ${prompt}`, 80), png, thumb, prompt, cfg.model || cfg.provider, actorOf(req)])).rows[0].id;
    return { edit: { id: 'ai' + art.slice(0, 8), type: 'ai', view, x: box.x, y: box.y, w: box.w, h: box.h, art, prompt }, left: Math.max(0, redrawCap() - (redraws.get(dayOf()) || 0)) };
  });
  // ---- the flat drawn from the picture ----
  // Each view: the sketch as it stands (framed square on its own box) and the concept's picture go to the image model, which draws the flat
  // of the garment in the picture on the sketch's frame and in its colours. The result replaces the sketch inside the same box, so every
  // placement, dimension and point of measure stays in inches; its outline (everything not joined to the white background) is the cloth.
  // what was drawn on a view by hand (the Pencil, a brush, shapes, type): kept as a picture, which the flat then lays over that view in inches
  app.post('/v1/lab/concepts/:id/flats/markup', { preHandler: pre, bodyLimit: 20_000_000 }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const view = req.body?.view === 'back' ? 'back' : 'front', m = /^data:image\/png;base64,(.+)$/.exec(String(req.body?.png || '')); if (!m) return bad(reply, 'Send the drawing as a PNG');
    let png; try { png = await sharp(Buffer.from(m[1], 'base64')).png().toBuffer(); const meta = await sharp(png).metadata(); if (!(meta.width <= 4096 && meta.height <= 4096)) return bad(reply, 'The drawing is too large'); } catch { return bad(reply, 'That drawing could not be read'); }
    const thumb = await sharp(png).resize({ width: 256, height: 256, fit: 'inside' }).png().toBuffer();
    const art = (await pool.query(`insert into lab_art(concept_id,name,png,thumb,prompt,source,in_library,created_by) values($1,$2,$3,$4,$5,'flat',false,$6) returning id`, [c.id, `Flat ${view}: drawn on`, png, thumb, 'drawn by hand', actorOf(req)])).rows[0].id;
    return { art };
  });
  app.post('/v1/lab/concepts/:id/flats/draw', { preHandler: pre }, async (req, reply) => {
    const t = await take(req, reply); if (!t) return;
    if (t.c.status === 'tech_pack' && !t.c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const img = (await pool.query('select image from lab_concepts where id=$1', [t.c.id])).rows[0]?.image; if (!img) return bad(reply, 'The concept has no picture to draw from yet');
    const views = (Array.isArray(req.body?.views) ? req.body.views : ['front', 'back']).filter(v => v === 'front' || v === 'back');
    if (!views.length || !views.every(v => drawingOf(t.params, v))) return bad(reply, 'This sketch has no such view to draw over');
    const cfg = imageCfg(); if (!cfg.configured) return bad(reply, 'No image model is connected', 503);
    if ((redraws.get(dayOf()) || 0) + views.length > redrawCap()) return bad(reply, `The daily limit of ${redrawCap()} AI redraws of flats is reached. Raise LAB_DAILY_FLAT_AI.`, 429);
    try { await charge(req, { kind: 'flat', conceptId: t.c.id, units: views.length }); } catch (e) { return bad(reply, e.message, e.status || 500, e.meter ? { code: e.code, meter: e.meter } : {}); }
    const photo = await sharp(img).resize({ width: 1024, height: 1024, fit: 'inside' }).jpeg({ quality: 88 }).toBuffer();
    const words = clip([t.c.name, t.c.spec?.silhouette, t.c.spec?.fabric].filter(Boolean).join(' · '), 200);
    const plainP = { ...t.params, color: '', drawn: undefined, edits: [] }, N = 1024, drawn = { template: t.params.template };
    for (const view of views) {
      const b = drawingOf(plainP, view).box, w = b.x1 - b.x0, h = b.y1 - b.y0, side = Math.max(w, h), cx0 = (b.x0 + b.x1) / 2 - side / 2, cy0 = (b.y0 + b.y1) / 2 - side / 2;
      const svg = renderSvg(plainP, view, { plain: true, scale: 0, templateSvg, partHref, background: true }).replace(/^<svg ([^>]*?)viewBox="[^"]*"/, `<svg $1viewBox="${cx0} ${cy0} ${side} ${side}" width="${N}" height="${N}"`);
      const sketch = await sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).png().toBuffer();
      let out;
      try {
        out = cfg.provider === 'fixture'
          ? await sharp(sketch).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><rect x="${N * .3}" y="${N * .3}" width="${N * .4}" height="${N * .4}" fill="#3d5a80" stroke="#141416" stroke-width="6"/></svg>`) }]).png().toBuffer()
          : await editImpl({ images: [sketch, photo], prompt: flatDrawPrompt(view, words), cfg: { ...cfg, size: '1024x1024' } });
      } catch (e) { return bad(reply, `The image model could not draw the ${view}: ${clip(e.message, 200)}`, 502); }
      redraws.set(dayOf(), (redraws.get(dayOf()) || 0) + 1);
      // the view's own box, cut back out of the square, with the white joined to the edges made clear: what is left is the garment
      const px = v => Math.round(v / side * N), left = Math.max(0, px(b.x0 - cx0)), top = Math.max(0, px(b.y0 - cy0)), bw = Math.min(N - left, px(w)), bh = Math.min(N - top, px(h));
      const rgb = await sharp(out).resize(N, N, { fit: 'fill' }).extract({ left, top, width: bw, height: bh }).removeAlpha().raw().toBuffer();
      const png = await sharp(clearBackground(rgb, bw, bh), { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer(), thumb = await sharp(png).resize({ width: 256, height: 256, fit: 'inside' }).png().toBuffer();
      drawn[view] = (await pool.query(`insert into lab_art(concept_id,name,png,thumb,prompt,model,source,in_library,created_by) values($1,$2,$3,$4,$5,$6,'flat',false,$7) returning id`, [t.c.id, clip(`Flat ${view}: drawn from the picture`, 80), png, thumb, 'flat from the picture', cfg.model || cfg.provider, actorOf(req)])).rows[0].id;
    }
    return { drawn, left: Math.max(0, redrawCap() - (redraws.get(dayOf()) || 0)) };
  });
  const gradeWords = q => (q.grade || []).map(g => `${g.sizes[0]}${g.sizes.length > 1 ? '–' + g.sizes[g.sizes.length - 1] : ''} ${fmt(g.w)} × ${fmt(g.h)}`).join(' · ');
  async function sheet(c, { size } = {}) {
    const r = (await pool.query('select params, placements, check_result from lab_flats where concept_id=$1', [c.id])).rows[0]; if (!r) return null;
    const p = { ...r.params, size: SIZES.includes(size) ? size : r.params.size || 'M' }, pl = r.placements, list = await techniques(c.client_id), hrefs = {};
    for (const q of pl) { const b = await pngOf(q); if (b) hrefs[q.id] = `data:image/png;base64,${(await sharp(b).resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }).png().toBuffer()).toString('base64')}`; }
    const ck = r.check_result || { findings: {}, summary: { fail: 0, warn: 0 } };
    const views = STYLES[p.style].kind === 'cap' || STYLES[p.style].kind === 'top' || STYLES[p.style].kind === 'bottom' ? ['front', 'back'] : ['front'];
    await prepMasks(p);
    const editHrefs = await editHrefsOf(p), alloverHref = await alloverHrefOf(p), svgs = views.map(v => renderSvg(p, v, { maskHref, placements: pl, hrefs, findings: ck.findings, showPom: true, scale: 0, templateHref, partHref, editHrefs, alloverHref }));
    // one page, 17 × 11 in at 100 units an inch: the flats across the top, the placements and the measurements under them
    const W = 1700, T = (x, y, s, t, o = {}) => `<text x="${x}" y="${y}" font-size="${s}" font-family="Space Grotesk, Helvetica, Arial, sans-serif" font-weight="${o.w || 400}" fill="${o.c || '#141416'}"${o.a ? ` text-anchor="${o.a}"` : ''}>${esc(t)}</text>`;
    const colW = (W - 120) / svgs.length; let y = 150;
    let body = svgs.map((s, i) => s.replace('<svg ', `<svg x="${60 + i * colW}" y="120" width="${colW - 20}" height="520" preserveAspectRatio="xMidYMid meet" `)).join('');
    y = 680; body += T(60, y, 20, 'Placements', { w: 600 }); y += 12;
    const lv = q => (ck.findings[q.id] || []).some(f => f.level === 'fail') ? ['Cannot be made as drawn', '#a02a20'] : (ck.findings[q.id] || []).some(f => f.level === 'warn') ? ['Check', '#8a5a00'] : ['Ready', '#17603a'];
    pl.forEach((q, i) => { const t = techFor(list, q); y += 30; body += T(60, y, 14, `${i + 1}. ${q.name}`, { w: 600 }) + T(360, y, 14, `${t.name} · ${fmtCm(q.w)} × ${fmtCm(q.h)}`) + T(1640, y, 13, lv(q)[0], { a: 'end', c: lv(q)[1], w: 600 }); y += 20; body += T(76, y, 13, `${q.view === 'back' ? 'Back' : 'Front'}: ${describe(q, p)}`, { c: '#45454c' });
      if (q.grade) { y += 18; body += T(76, y, 13, `Artwork by size: ${gradeWords(q)}`, { c: '#45454c' }); } });
    if (p.allover) { y += 30; body += T(60, y, 14, `All over: ${p.allover.name}`, { w: 600 }) + T(360, y, 14, `${p.allover.base} · a ${p.allover.type} repeat of ${fmt(p.allover.w)} × ${fmt(p.allover.h)}`); }
    if (!pl.length) { y += 30; body += T(60, y, 14, 'Nothing placed on this piece.', { c: '#727278' }); }
    // the colour, the details and the stitching changed on the sketch, in words the factory reads
    const eds = (p.edits || []).filter(e => views.includes(e.view));
    if (p.color || eds.length) { y += 44; body += T(60, y, 20, 'Colour, details and stitching', { w: 600 }); y += 6;
      const wrap = t => { const out = ['']; for (const w of t.split(' ')) { if ((out[out.length - 1] + ' ' + w).length > 120) out.push(''); out[out.length - 1] += (out[out.length - 1] ? ' ' : '') + w; } return out; };
      for (const line of [...(p.color ? [`Main colour ${p.color}`] : []), ...eds.map(e => describeEdit(e, p))]) wrap(line).forEach((part, i) => { y += i ? 17 : 22; body += T(i ? 90 : 76, y, 13, part, { c: '#45454c' }); }); }
    const pom = pomTable(p), cols = pom[0].values.map(v => v.size), cx = 1040; let py = 680;
    body += T(cx, py, 20, `Points of measure (inches) · sample size ${STYLES[p.style].oneSize ? 'one size' : 'M'}`, { w: 600 }); py += 30;
    body += T(cx, py, 12, 'Point', { w: 600, c: '#727278' }) + cols.map((s, i) => T(cx + 330 + i * 52, py, 12, s, { w: 600, c: s === 'M' ? '#141416' : '#727278', a: 'end' })).join('') + T(cx + 330 + cols.length * 52 + 20, py, 12, 'Tol ±', { w: 600, c: '#727278', a: 'end' });
    for (const row of pom) { py += 22; body += T(cx, py, 12, `${row.code} ${row.name}`.slice(0, 48)) + row.values.map((v, i) => T(cx + 330 + i * 52, py, 12, String(v.value), { a: 'end', w: v.size === 'M' ? 600 : 400 })).join('') + T(cx + 330 + cols.length * 52 + 20, py, 12, String(row.tolerance), { a: 'end', c: '#727278' }); }
    const head = `${T(60, 62, 30, c.name, { w: 600 })}${T(60, 92, 15, `${STYLES[p.style].label} · ${FITS[p.fit] || p.fit} fit · Future Basics Design Lab · ${new Date().toISOString().slice(0, 10)}`, { c: '#727278' })}${T(1640, 62, 15, ck.summary.fail ? `${ck.summary.fail} problem${ck.summary.fail === 1 ? '' : 's'} to fix before it can be made` : ck.summary.warn ? `${ck.summary.warn} thing${ck.summary.warn === 1 ? '' : 's'} to check` : 'Ready to make', { a: 'end', w: 600, c: ck.summary.fail ? '#a02a20' : ck.summary.warn ? '#8a5a00' : '#17603a' })}`;
    const H = Math.max(y, py) + 60;
    return { editHrefs, alloverHref, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/><rect x="0" y="0" width="${W}" height="6" fill="#4bff9a"/>${head}${body}</svg>`, p, pl, hrefs, svgs, views };
  }
  app.get('/v1/lab/concepts/:id/flats/sheet.svg', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const s = await sheet(c, { size: req.query?.size }); if (!s) return bad(reply, 'Save the flats first', 404);
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'private, no-cache').header('content-disposition', `inline; filename="${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-spec.svg"`).send(s.svg);
  });
  // the decoration sheet: one page per placement, for the factory's decoration department (or the print or embroidery shop)
  async function decorationPdf(c) {
    const s = await sheet(c); if (!s) return null;
    const list = await techniques(c.client_id), notes = new Map((await pool.query('select id, factory_note, art_guide, summary from lab_techniques')).rows.map(r => [r.id, r])), decos = await decorationsOf(c, s.p, s.pl), ck = (await pool.query('select check_result from lab_flats where concept_id=$1', [c.id])).rows[0]?.check_result || { findings: {} };
    const b = brandDoc({ title: `${c.name} · decorations`, kind: 'Decoration sheet', ref: `${s.pl.length} placement${s.pl.length === 1 ? '' : 's'}`, footerNote: 'Future Basics · decoration sheet · costs are estimates, the factory\'s quote confirms them · colours as Pantone C, matched from the artwork: confirm each against a swatch book' });
    const { doc, L, CW } = b;
    if (!s.pl.length && !s.p.allover) { doc.fillColor(INK).font('SG-B').fontSize(18).text(safe(c.name), L, b.bodyTop); doc.fillColor(DIM).font('SG').fontSize(11).text('Nothing is placed on this piece yet.', L, doc.y + 8); return b.finish(); }
    // a section that would not fit with its first rows starts on the next page, so a heading is never left alone at the bottom
    const room = (y, need) => { if (y + need <= b.bodyBottom) return y; doc.addPage(); return b.bodyTop; };
    for (const [i, q] of s.pl.entries()) {
      if (i) doc.addPage();
      const t = techFor(list, q), n = notes.get(t.id) || {}, dd = decos.find(x => x.id === q.id), y0 = b.bodyTop;
      doc.fillColor(DIM).font('MONO').fontSize(8.5).text(safe(`${String(i + 1).padStart(2, '0')} / ${String(s.pl.length).padStart(2, '0')}  ·  ${q.view === 'back' ? 'BACK' : 'FRONT'}`), L, y0, { characterSpacing: 1 });
      doc.fillColor(INK).font('SG-B').fontSize(20).text(safe(q.name), L, doc.y + 4, { width: CW });
      doc.fillColor(DIM).font('SG').fontSize(10.5).text(safe(`${c.name} · made as ${t.name}`), L, doc.y + 2, { width: CW });
      let y = doc.y + 12; const col = CW / 4;
      fact(b, 'Width', fmtCm(q.w), L, y, col); fact(b, 'Height', fmtCm(q.h), L + col, y, col); fact(b, 'Colours', String(dd?.colours ?? '—'), L + col * 2, y, col); fact(b, 'Cost per piece', dd ? `$${(dd.perPieceCents / 100).toFixed(2)}` : '—', L + col * 3, y, col); y += 46;
      // the artwork, and the flat with the placement on it
      const art = s.hrefs[q.id] ? Buffer.from(s.hrefs[q.id].split(',')[1], 'base64') : null, bw = CW * .48, bh = 170;
      doc.rect(L, y, bw, bh).fill('#f3f2ee'); if (art) { try { doc.image(art, L + 10, y + 10, { fit: [bw - 20, bh - 20], align: 'center', valign: 'center' }); } catch { /* left blank */ } } doc.rect(L, y, bw, bh).lineWidth(.6).strokeColor(LINE).stroke();
      try { const flat = await sharp(Buffer.from(renderSvg(s.p, q.view, { maskHref, placements: s.pl, hrefs: s.hrefs, selected: q.id, scale: 40, templateSvg, partHref, editHrefs: s.editHrefs, alloverHref: s.alloverHref }))).resize({ width: 900, height: 900, fit: 'inside' }).flatten({ background: '#ffffff' }).png().toBuffer();
        doc.image(flat, L + bw + 12, y, { fit: [CW - bw - 12, bh], align: 'center', valign: 'center' }); } catch { /* no flat picture */ }
      y += bh + 14;
      doc.fillColor(INK).font('SG-B').fontSize(11).text('Where it goes', L, y); doc.fillColor(INK).font('SG').fontSize(10).text(safe(describe(q, s.p)), L, doc.y + 3, { width: CW }); y = doc.y + 12;
      const cols = (await coloursOf(q));
      if (cols.length) { y = room(y, 40 + cols.length * 16); doc.fillColor(INK).font('SG-B').fontSize(11).text(t.base === 'embroidery' ? 'Threads' : 'Inks and colours', L, y); table(b, [{ h: '#', w: .08, mono: true }, { h: 'Pantone C', w: .52, mono: true }, { h: 'Share of the artwork', w: .4, align: 'right', mono: true }], cols.map((x, k) => [String(k + 1), { t: x.pantone || x.name, swatch: x.hex }, `${Math.round(x.share * 100)} %`]), { y: doc.y + 6, fontSize: 9.5 }); y = doc.y + 12; }
      if (q.grade) { y = room(y, 40 + q.grade.length * 16); doc.fillColor(INK).font('SG-B').fontSize(11).text('Artwork size by garment size', L, y); table(b, [{ h: 'Garment sizes', w: .4 }, { h: 'Width', w: .3, mono: true }, { h: 'Height', w: .3, mono: true }], q.grade.map(g => [g.sizes.join(', '), fmtCm(g.w), fmtCm(g.h)]), { y: doc.y + 6, fontSize: 9.5 }); y = doc.y + 12; }
      const cws = cleanColourways(c.spec?.colourways);
      if (cws.length && cols.length) { y = room(y, 40 + cws.length * 22); doc.fillColor(INK).font('SG-B').fontSize(11).text(t.base === 'embroidery' ? 'Threads on each colourway' : 'Inks on each colourway', L, y);
        table(b, [{ h: 'Colourway', w: .3 }, { h: t.base === 'embroidery' ? 'Threads' : 'Inks', w: .7, mono: true }], cws.map(cw => [{ t: `${cw.name}${cw.pantone ? ` · ${cw.pantone}` : ''}`, swatch: cw.hex }, cols.map(x => { const to = q.inks?.[cw.hex]?.[x.hex] || x.hex; return to === x.hex ? (x.pantone || x.hex) : `${x.pantone || x.hex}, changed to ${pantoneOf(to)}`; }).join(' · ')]), { y: doc.y + 6, fontSize: 9 }); y = doc.y + 12; }
      const rows = [['How it is made', t.name], ['Factory note', n.factory_note || ''], ['Artwork guide', n.art_guide || ''], ['Rules', `finest line ${t.rules.minLineMm} mm, up to ${t.rules.maxColors || 'any'} colours, up to ${t.rules.maxW} × ${t.rules.maxH} in`], ...(dd ? [['Cost', `$${(dd.unitCents / 100).toFixed(2)} a piece + $${(dd.setupCents / 100).toFixed(2)} setup over ${dd.qty} pieces = $${(dd.perPieceCents / 100).toFixed(2)} a piece${dd.basis ? ` (${dd.basis})` : ''}; before the factory's quote`]] : [])].filter(r => r[1]);
      y = room(y, 120); table(b, [{ h: 'Item', w: .22, mono: true }, { h: '', w: .78 }], rows, { y, fontSize: 9.5, head: false }); y = doc.y + 10;
      const f = (ck.findings[q.id] || []).filter(x => x.level !== 'info');
      if (f.length) { y = room(y, 30 + f.length * 14); doc.fillColor('#a02a20').font('SG-B').fontSize(10).text('Check before it is made', L, y); doc.fillColor(INK).font('SG').fontSize(9.5); for (const x of f) doc.text(safe('• ' + x.text), L, doc.y + 3, { width: CW }); }
    }
    // the all-over print: the repeat, how it is made, and the piece covered in it
    const ao = s.p.allover;
    if (ao) {
      if (s.pl.length) doc.addPage(); const dd = decos.find(x => x.id === 'allover'), y0 = b.bodyTop, cols = await coloursOf({ art: ao.art });
      doc.fillColor(DIM).font('MONO').fontSize(8.5).text('ALL OVER', L, y0, { characterSpacing: 1 }); doc.fillColor(INK).font('SG-B').fontSize(20).text(safe(ao.name), L, doc.y + 4, { width: CW });
      doc.fillColor(DIM).font('SG').fontSize(10.5).text(safe(`${c.name} · ${ao.base}, a ${ao.type} repeat`), L, doc.y + 2, { width: CW });
      let y = doc.y + 12; const col = CW / 4;
      fact(b, 'Repeat width', fmtCm(ao.w), L, y, col); fact(b, 'Repeat height', fmtCm(ao.h), L + col, y, col); fact(b, 'Colours', String(cols.length || '—'), L + col * 2, y, col); fact(b, 'Cost per piece', dd ? `$${(dd.perPieceCents / 100).toFixed(2)}` : '—', L + col * 3, y, col); y += 46;
      const bw = CW * .48, bh = 220, tile = s.alloverHref ? Buffer.from(s.alloverHref.split(',')[1], 'base64') : null;
      doc.rect(L, y, bw, bh).fill('#f3f2ee'); if (tile) { try { const t3 = await sharp({ create: { width: 900, height: 900, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await sharp(tile).resize(300, 300, { fit: 'fill' }).png().toBuffer(), tile: true, left: 0, top: 0 }]).png().toBuffer(); doc.image(t3, L + 10, y + 10, { fit: [bw - 20, bh - 20], align: 'center', valign: 'center' }); } catch { /* left blank */ } }
      doc.rect(L, y, bw, bh).lineWidth(.6).strokeColor(LINE).stroke();
      try { const flat = await sharp(Buffer.from(renderSvg(s.p, 'front', { maskHref, scale: 40, templateSvg, partHref, editHrefs: s.editHrefs, alloverHref: s.alloverHref }))).resize({ width: 900, height: 900, fit: 'inside' }).flatten({ background: '#ffffff' }).png().toBuffer(); doc.image(flat, L + bw + 12, y, { fit: [CW - bw - 12, bh], align: 'center', valign: 'center' }); } catch { /* no flat picture */ }
      y += bh + 14;
      if (cols.length) { doc.fillColor(INK).font('SG-B').fontSize(11).text('Colours', L, y); table(b, [{ h: '#', w: .08, mono: true }, { h: 'Pantone C', w: .52, mono: true }, { h: 'Share', w: .4, align: 'right', mono: true }], cols.map((x, k) => [String(k + 1), { t: x.pantone || x.name, swatch: x.hex }, `${Math.round(x.share * 100)} %`]), { y: doc.y + 6, fontSize: 9.5 }); y = doc.y + 12; }
      table(b, [{ h: 'Item', w: .22, mono: true }, { h: '', w: .78 }], [['How it is made', ao.base], ['The repeat', `${ao.type}, ${fmtCm(ao.w)} across, ${fmtCm(ao.h)} down; the tile file repeats without a seam`], ['Before cutting', 'Print the panels before they are cut and sewn; line the repeat up at the centre front and keep its direction on every panel.'], ...(dd ? [['Cost', `$${(dd.perPieceCents / 100).toFixed(2)} a piece${dd.basis ? ` (${dd.basis})` : ''}; before the factory's quote`]] : [])], { y, fontSize: 9.5, head: false });
    }
    return b.finish();
  }
  const pantoneOf = hex => (globalThis.FBPantone ? globalThis.FBPantone.code(hex) : '') || hex;
  app.get('/v1/lab/concepts/:id/flats/decorations.pdf', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    const pdf = await decorationPdf(c); if (!pdf) return bad(reply, 'Save the flats first', 404);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `inline; filename="${c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-decorations.pdf"`).header('cache-control', 'private, no-store').send(pdf);
  });
  // the files that go on a tech pack: the spec sheet and each flat, as pictures
  async function files(c) {
    const s = await sheet(c); if (!s) return [];
    const out = [{ name: 'Spec sheet · flats, placements and measurements', image: await png(s.svg, 2400) }];
    for (const v of s.views) out.push({ name: `Technical flat · ${v}`, image: await png(renderSvg(s.p, v, { maskHref, placements: s.pl, hrefs: s.hrefs, scale: 60, templateSvg, partHref, editHrefs: s.editHrefs, alloverHref: s.alloverHref }), 1800) });
    return out;
  }
  const png = async (svg, width) => `data:image/png;base64,${(await sharp(Buffer.from(svg), { density: 150 }).resize({ width }).flatten({ background: '#ffffff' }).png().toBuffer()).toString('base64')}`;
  // everything the tech pack takes from the flats (src/lab-handoff.js lays it into the pack)
  async function handoff(c) {
    const items = await files(c);
    // what the concept is made of goes with it, flats or no flats
    const picks = Array.isArray(c.spec?.materials) ? c.spec.materials : [], materials = picks.length ? packRows(picks) : null, colourways = cleanColourways(c.spec?.colourways);
    // each label whose face was designed in the studio goes in as its own picture, so the factory sees the artwork
    const labelSketches = [];
    for (const pk of picks.filter(x => x.kind === 'tag')) {
      const face = (await pool.query("select coalesce(spec->>'face','') face from lab_materials where id=$1", [pk.id]).catch(() => ({ rows: [] }))).rows[0]?.face;
      const art = UUID.test(String(face || '')) ? (await pool.query('select png from lab_art where id=$1', [face])).rows[0]?.png : null; if (!art) continue;
      labelSketches.push({ id: `lab-label-${pk.id}`.slice(0, 60), view: 'detail', label: `Label · ${pk.name}`.slice(0, 120), image: `data:image/png;base64,${(await sharp(art).flatten({ background: '#ffffff' }).png().toBuffer()).toString('base64')}` });
    }
    if (!items.length) return materials || colourways.length || labelSketches.length ? { files: [], lab: { materials, colourways, sketches: labelSketches, priceCents: c.price_cents, costCents: c.cost_cents, qty: c.qty, planName: c.plan_name } } : null;
    const r = (await pool.query('select params, placements from lab_flats where concept_id=$1', [c.id])).rows[0], p = r.params, pl = r.placements || [], list = await techniques(c.client_id);
    const S = STYLES[p.style], tpl = templateOf(p), edits = p.edits || [];
    const pom = pomTable(p).map(row => ({ code: row.code, name: row.name, how: 'From the flats', tolerance: String(row.tolerance), values: Object.fromEntries(row.values.map(v => [v.size, String(v.value)])) }));
    const construction = [{ area: 'Drawing', detail: `${FITS[p.fit] || p.fit} fit ${S.label.toLowerCase()}, drawn from the ${tpl ? `"${tpl.label}" flat sketch` : 'measurements'}; sample size M.` },
      ...pl.map(q => ({ area: `${q.view === 'back' ? 'Back' : 'Front'} · ${q.name}`, detail: `${techFor(list, q).name}, ${fmtCm(q.w)} × ${fmtCm(q.h)}: ${describe(q, p)}.${q.grade ? ` Artwork by size: ${gradeWords(q)}.` : ''}` })),
      ...pl.filter(q => q.inks).map(q => ({ area: `Inks by colourway · ${q.name}`, detail: Object.entries(q.inks).map(([cw, m]) => `on ${(cleanColourways(c.spec?.colourways).find(x => x.hex === cw)?.name) || cw}: ${Object.entries(m).filter(([a, b2]) => a !== b2).map(([a, b2]) => `${pantoneOf(a)} changed to ${pantoneOf(b2)}`).join(', ') || 'as drawn'}`).join('; ') })),
      ...(p.allover ? [{ area: `All over · ${p.allover.name}`, detail: `${p.allover.base}, a ${p.allover.type} repeat of ${fmtCm(p.allover.w)} × ${fmtCm(p.allover.h)}, printed on the panels before cutting.` }] : []),
      ...edits.map(e => ({ area: e.type === 'stitch' ? 'Stitching' : e.type === 'block' ? 'Colour block' : e.type === 'ai' ? 'Redrawn area' : e.type === 'part' ? (e.name || 'Add-on part') : (DETAILS[e.kind] || 'Detail'), detail: describeEdit(e, p) }))];
    const threads = new Map(); for (const e of edits) if (e.thread) threads.set(e.thread, [...(threads.get(e.thread) || []), e.type === 'stitch' ? 'stitch line' : (DETAILS[e.kind] || 'detail').toLowerCase()]);
    const decos = await decorationsOf(c, p, pl).catch(() => []), decoOf = q => decos.find(x => x.id === q.id);
    const bom = [...pl.map(q => { const dd = decoOf(q); return { component: `Decoration · ${q.name}`, material: techFor(list, q).name, spec: dd ? `${q.grade ? gradeWords(q) : `${fmtCm(q.w)} × ${fmtCm(q.h)}`}, ${dd.colours} colour${dd.colours === 1 ? '' : 's'}${dd.basis ? `; ${dd.basis}` : ''}`.slice(0, 200) : '', color: dd ? dd.pantones.join(', ').slice(0, 120) : '', placement: describe(q, p).slice(0, 160), qty: '1', unit: 'pc', ...(dd ? { cost: (dd.perPieceCents / 100).toFixed(2) } : {}) }; }),
      ...decos.filter(d2 => d2.allover).map(d2 => ({ component: `All-over print · ${d2.name}`, material: d2.technique, spec: `${d2.placement}; ${d2.colours} colour${d2.colours === 1 ? '' : 's'}${d2.basis ? `; ${d2.basis}` : ''}`.slice(0, 200), color: d2.pantones.join(', ').slice(0, 120), placement: 'All panels', qty: '1', unit: 'pc', cost: (d2.perPieceCents / 100).toFixed(2) })),
      ...[...threads].map(([hex, where]) => ({ component: 'Contrast thread', material: 'Polyester sewing thread', color: hex, placement: [...new Set(where)].join(', ').slice(0, 160), qty: '1', unit: 'cone' })),
      ...edits.filter(e => e.type === 'block').map(e => ({ component: `Colour block · ${e.name || 'panel'}`, material: 'Self fabric', color: e.color, placement: e.view }))];
    return {
      files: items,
      lab: { pom, sizes: S.oneSize ? ['One size'] : SIZES, construction, bom, materials, colourways, color: p.color ? { hex: p.color, name: 'Main colour' } : null,
        sketches: [...items.filter(i => /^Technical flat · /.test(i.name)).map(i => ({ view: i.name.endsWith('back') ? 'back' : 'front', label: i.name, image: i.image })), ...labelSketches],
        priceCents: c.price_cents, costCents: c.cost_cents, qty: c.qty, planName: c.plan_name, style: { sampleSize: S.oneSize ? 'One size' : 'M', fitBlock: `${FITS[p.fit] || p.fit} ${S.label.toLowerCase()}${tpl ? ` (${tpl.label})` : ''}` } }
    };
  }
  const sendToPack = async (c, productId = c.product_id) => { const h = await handoff(c); return h ? applyHandoff(productId, h) : null; };
  app.post('/v1/lab/concepts/:id/flats/tech-pack', { preHandler: pre }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (!c.product_id) return bad(reply, 'This concept has no tech pack yet. Approve it and send it to a tech pack first.', 409);
    if (!applyHandoff) return bad(reply, 'Flats cannot be sent to tech packs on this service', 501);
    const sent = await sendToPack(c); if (!sent) return bad(reply, 'Save the flats first', 409);
    // a tech pack already published keeps that version as it was: the flats go out as the next version, which the factory sees with what changed
    const tp = (await pool.query('select version, published_at from tech_packs where product_id=$1 order by created_at desc limit 1', [c.product_id])).rows[0];
    const changes = tp?.published_at && d.packChanges ? await d.packChanges(c.product_id) : null;
    if (tp?.published_at) tp.same = Boolean(changes && !changes.length); // nothing a factory reads changed: no new version
    let version = null, publishError = null;
    if (tp?.published_at && !tp.same) {
      const note = `Flats updated in the Design Lab (${c.name})`;
      const res = await app.inject({ method: 'POST', url: `/v1/admin/products/${c.product_id}/tech-pack/publish`, headers: { authorization: req.headers.authorization || '' }, payload: { note, override: `${note}; v${tp.version} stays as it was`, notify: { email: false, thread: true } } });
      const body = (() => { try { return JSON.parse(res.body); } catch { return {}; } })();
      if (res.statusCode < 300) version = body.techPack?.version || null; else publishError = body.error || `The next version could not be published (${res.statusCode})`;
    }
    return { ok: true, ...sent, productId: c.product_id, version, previousVersion: tp?.published_at ? tp.version : null, unchanged: Boolean(tp?.published_at && tp.same), changes: (changes || []).slice(0, 12).map(x => `${x.section}: ${x.label}`), publishError };
  });
  // ---- suggestions for one placement: its artwork size per group of garment sizes, and its inks on each colourway ----
  // the garment width the artwork follows: the chest on tops, the hip (or waist) on bottoms, the width of a tote; caps and beanies are one size
  const gradeKey = p => (p.m.chest ? 'chest' : p.m.hip ? 'hip' : p.m.waist ? 'waist' : p.m.width ? 'width' : null);
  app.post('/v1/lab/concepts/:id/flats/suggest', { preHandler: pre }, async (req, reply) => {
    const t = await take(req, reply); if (!t) return;
    const q = t.placements.find(x => x.id === String(req.body?.placementId || '')) || t.placements[0]; if (!q) return bad(reply, 'Place a graphic first');
    const S = STYLES[t.params.style], key = gradeKey(t.params), measures = key && !S.oneSize ? Object.fromEntries(SIZES.map(z => [z, measurementsFor(t.params, z)[key]])) : null;
    const grade = measures ? { follows: key, measures, two: gradeArt({ w: q.w, h: q.h, measures, breaks: 2 }), three: gradeArt({ w: q.w, h: q.h, measures, breaks: 3 }) } : null;
    const cols = (await coloursOf(q)).map(x => x.hex), cws = cleanColourways(t.c.spec?.colourways);
    const inks = cws.map(cw => ({ colourway: cw, inks: suggestInks(cols, cw.hex).map(x => ({ ...x, fromPantone: pantoneOf(x.from), toPantone: pantoneOf(x.to) })) }));
    return { placementId: q.id, grade, inks, oneSize: Boolean(S.oneSize) };
  });

  // ---- the studio's placed layers: the concept's graphics, and placements on its flats at the size they were measured ----
  const LAYER = /^l[a-z0-9]{1,12}$/;
  app.post('/v1/lab/concepts/:id/studio/graphics', { preHandler: pre, bodyLimit: 40_000_000 }, async (req, reply) => {
    const c = await concept(req.params.id); if (!c) return bad(reply, 'Not found', 404);
    if (c.status === 'tech_pack' && !c.product_id) return bad(reply, 'This concept is already a tech pack', 409);
    const list = await techniques(c.client_id), given = Array.isArray(req.body?.layers) ? req.body.layers.slice(0, 8) : [], graphics = [], arts = {};
    for (const l of given) {
      if (!LAYER.test(String(l.layer || '')) || !PLACEMENTS[l.placement]) continue;
      const w = Number(l.widthIn), h = Number(l.heightIn); if (!(w > 0 && w < 40 && h > 0 && h < 40)) return bad(reply, `${clip(l.name, 40) || 'A layer'}: measure it first`);
      let art = UUID.test(String(l.art || '')) && (await pool.query('select 1 from lab_art where id=$1', [l.art])).rowCount ? l.art : null;
      const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(String(l.image || ''));
      if (m) { const png = await sharp(Buffer.from(m[2], 'base64')).png().toBuffer(), thumb = await sharp(png).resize({ width: 256, height: 256, fit: 'inside' }).png().toBuffer();
        art = (await pool.query(`insert into lab_art(concept_id,name,png,thumb,source,in_library,created_by) values($1,$2,$3,$4,'studio',false,$5) returning id`, [c.id, clip(l.name, 80) || 'Studio layer', png, thumb, actorOf(req)])).rows[0].id; }
      if (!art) return bad(reply, `${clip(l.name, 40) || 'A layer'}: send its picture`);
      const tech = UUID.test(String(l.techniqueId || '')) ? list.find(x => x.id === l.techniqueId) : null;
      arts[l.layer] = art;
      graphics.push({ ...(/^[a-z0-9-]{1,40}$/i.test(String(l.fromFlat || '')) ? { fromFlat: String(l.fromFlat) } : {}), name: clip(l.name, 80) || 'Studio graphic', kind: 'icon', idea: 'Placed and measured in the studio', placement: PLACEMENTS[l.placement].label.toLowerCase(), technique: tech?.base || 'screen print', art, ...(tech ? { finish: { id: tech.id, name: tech.name } } : {}), studioLayer: l.layer, widthIn: Math.round(w * 100) / 100, heightIn: Math.round(h * 100) / 100 });
    }
    const spec = { ...(c.spec || {}), graphics: [...(c.spec?.graphics || []).filter(g => !g.studioLayer), ...graphics.map(({ fromFlat, ...g }) => g)].slice(0, 8) };
    await pool.query('update lab_concepts set spec=$2, updated_at=now() where id=$1', [c.id, spec]);
    // the flats already saved take the studio's graphics too: kept where they were moved to, resized, new ones at their spot, removed ones gone
    const r = (await pool.query('select params, placements from lab_flats where concept_id=$1', [c.id])).rows[0]; let flats = null;
    if (r) {
      // a layer put on the picture from the flats (fromFlat) takes that placement over: same spot, from then on one record drawn on both
      const params = r.params, old = r.placements || [], claimed = new Set(graphics.map(g => g.fromFlat).filter(Boolean)), keep = old.filter(q => q.source !== 'studio' && !claimed.has(q.id)), studio = [];
      for (const g of graphics) {
        const prev = old.find(q => q.source === 'studio' && q.layer === g.studioLayer) || (g.fromFlat ? old.find(q => q.id === g.fromFlat && q.source !== 'studio') : null), t = techFor(list, { techniqueId: g.finish?.id, technique: g.technique });
        const base = prev ? { view: prev.view, x: prev.x, y: prev.y - prev.h / 2 + g.heightIn / 2, w: g.widthIn, h: g.heightIn } : sized(defaultPlacement('graphic', params, { aspect: g.widthIn / g.heightIn, label: g.placement }), g);
        studio.push({ ...(prev || {}), mark: undefined, added: undefined, id: 's-' + g.studioLayer, name: g.name, source: 'studio', layer: g.studioLayer, art: g.art, technique: t.base, techniqueId: t.id, ...base });
      }
      const { params: p2, placements } = cleanFlat({ ...params, placements: [...keep, ...studio] }), ck = await check(p2, placements, c.client_id);
      await pool.query('update lab_flats set placements=$2, check_result=$3, checked_at=now(), updated_at=now() where concept_id=$1', [c.id, JSON.stringify(placements), ck]);
      const fresh = await concept(c.id); let cost = null; try { cost = await keepDecorations(fresh, await decorationsOf(fresh, p2, placements)); } catch { /* the costing waits for the next save */ }
      flats = { placements: placements.filter(q => q.source === 'studio').length, check: ck.summary, landedCents: cost?.landedCents ?? null };
    }
    return { graphics: graphics.length, arts, flats };
  });

  // ---- what factories really charged ----
  const quoteRow = r => ({ id: r.id, techniqueId: r.technique_id, techniqueName: r.technique_name || null, base: r.base, supplier: r.supplier, widthIn: Number(r.width_in), heightIn: Number(r.height_in), colours: r.colours, qty: r.qty, unitCents: r.unit_cents, setupCents: r.setup_cents, actualCents: r.actual_cents, estimateCents: r.estimate_cents, conceptId: r.concept_id, conceptName: r.concept_name || null, placement: r.placement, note: r.note, createdAt: r.created_at });
  app.get('/v1/lab/decor/quotes', { preHandler: pre }, async req => {
    const tid = UUID.test(String(req.query?.techniqueId || '')) ? req.query.techniqueId : null;
    const rows = (await pool.query(`select q.*, t.name technique_name, c.name concept_name from lab_decor_quotes q left join lab_techniques t on t.id=q.technique_id left join lab_concepts c on c.id=q.concept_id where ($1::uuid is null or q.client_id=$1) ${tid ? 'and q.technique_id=$2' : ''} order by q.created_at desc limit 200`, tid ? [own(req), tid] : [own(req)])).rows;
    return { quotes: rows.map(quoteRow), calibration: await calibrations() };
  });
  app.post('/v1/lab/decor/quotes', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, list = await techniques(own(req)), t = UUID.test(String(b.techniqueId || '')) ? list.find(x => x.id === b.techniqueId) : null;
    const base = t?.base || (Object.keys(DECOR_BASES()).includes(b.base) ? b.base : null); if (!base) return bad(reply, 'Say how it is made: a technique from the library');
    const w = Number(b.widthIn), h = Number(b.heightIn), colours = Math.round(Number(b.colours) || 1), qty = Math.round(Number(b.qty) || 0), unit = Math.round(Number(b.unitCents)), setup = Math.round(Number(b.setupCents) || 0);
    if (!(w > 0 && w <= 2000 && h > 0 && h <= 60)) return bad(reply, 'Give the size the factory quoted for, in inches');
    if (!(qty >= 1 && qty <= 1e6)) return bad(reply, 'Give the quantity the factory quoted for');
    if (!(unit >= 0 && unit <= 1e6) || !(setup >= 0 && setup <= 1e7) || !(colours >= 1 && colours <= 20)) return bad(reply, 'Give the price a piece and the setup, in dollars');
    // the estimate for exactly what was quoted, before any calibration, so the factor measures the starting figures themselves
    const est = decorationCost({ base, rules: t?.rules || {}, widthIn: w, heightIn: h, colours, coverage: Number(b.coverage) > 0 ? Number(b.coverage) : .6, qty });
    const actual = Math.round(unit + setup / qty), cid = UUID.test(String(b.conceptId || '')) ? b.conceptId : null;
    const r = (await pool.query(`insert into lab_decor_quotes(technique_id, base, supplier, width_in, height_in, colours, qty, unit_cents, setup_cents, actual_cents, estimate_cents, concept_id, placement, note, created_by, client_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning *`, [t?.id || null, base, clip(b.supplier, 80), w, h, colours, qty, unit, setup, actual, Math.max(1, est.perPieceCents), cid, clip(b.placement, 80), clip(b.note, 300), actorOf(req), own(req)])).rows[0];
    return reply.code(201).send({ quote: quoteRow(r), estimate: est, calibration: await calibrations() });
  });
  app.delete('/v1/lab/decor/quotes/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.id))) return bad(reply, 'Not found', 404);
    const n = (await pool.query('delete from lab_decor_quotes where id=$1', [req.params.id])).rowCount; if (!n) return bad(reply, 'Not found', 404);
    return { ok: true, calibration: await calibrations() };
  });

  // the check of a concept's flats as they would start (for approving a concept whose flats were never saved)
  const startCheck = async id => { const c = await concept(id); const init = c && await initial(c); return init ? check(init, init.placements) : null; };
  return { startCheck, sheetSvg: async id => { const c = await concept(id); const sh = c && await sheet(c); return sh?.svg || null; }, files: async id => { const c = await concept(id); return c ? files(c) : []; }, sendToPack: async (id, productId) => { const c = await concept(id); return c ? sendToPack(c, productId) : null; } };
}

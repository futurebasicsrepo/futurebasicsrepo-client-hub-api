// Build one now (the Make page, thefuturebasics.com/pages/make): a visitor picks a base, a few add-ons and a colour, and sees the real flats
// the Design Lab draws for that piece, and what its tech pack would say: how it is built, every detail, its measurements, its pattern
// pieces and the check that they sew together. No sign-in and no AI: the same recipe menu, flats and pattern the Lab uses
// (src/lab-recipe.js, src/lab-flats.js, src/lab-pattern.js). "Make this for real" carries the piece into the Lab (src/join.html → src/lab.html →
// src/lab-recipe.html, by fb.pendingRecipe).
//   GET /v1/public/make/menu                     the bases, each with the add-ons that suit it, and the colour systems
//   GET /v1/public/make/piece?base&addons&system&colour     what the piece's tech pack would say, and where its two flats are
//   GET /v1/public/make/flat.webp?…&view=front|back         a flat as a picture (the purchased flat sketches are never sent as vectors)
//   GET /v1/public/make/techpack.pdf?…                      the piece's tech pack as a PDF to keep (the free tech pack): the same document
//                                                           a Lab piece's pack prints (src/tp-pdf.js), laid in by src/lab-handoff.js
// Pictures and answers are kept in memory by the piece; a new piece counts against a per-address hourly limit.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { RECIPE_BASES, COLOUR_SYSTEMS, addonsFor, baseOf, cookRecipe } from './lab-recipe.js';
import { STYLES, FITS, SIZES, DETAILS, renderSvg, drawingOf, measurementsFor, viewsOf, pomTable, describeEdit, templateOf } from './lab-flats.js';
import { washWords, washShrink } from './lab-wash.js';
import { necklineWords } from './lab-neck.js';
import { labHandoff } from './lab-handoff.js';
import { normalizeTechPack } from './techpack.js';
import { techPackPdf } from './tp-pdf.js';
import { constructionOf, constructionWords } from './lab-construction.js';
import { flatDetails } from './lab-trip.js';
import { garmentPattern } from './lab-pattern.js';
import { constructionCheck } from './lab-pattern-check.js';
import { maskFor } from './lab-flat-mask.js';

// the bases on the Make page: the staples a brand starts a line with
export const MAKE_BASES = ['tee-boxy', 'tee', 'hoodie', 'ziphoodie', 'crewneck', 'shirt', 'jacket', 'pants', 'shorts'];
const MAX_ADDONS = 4;

export function makeMenu() {
  return {
    bases: MAKE_BASES.map(id => baseOf(id)).filter(Boolean).map(b => ({ id: b.id, label: b.label, note: b.note, addons: addonsFor(b).map(a => ({ id: a.id, label: a.label, group: a.group })) })),
    systems: COLOUR_SYSTEMS.map(s => ({ id: s.id, name: s.name, mood: s.mood, colours: s.colours.map(c => ({ name: c.name, hex: c.hex })) })),
    sizes: SIZES
  };
}

// a piece from the query: only what the menu offers, so the cache and the limit are keyed on real pieces
export function pieceOf(q = {}) {
  const b = baseOf(String(q.base || '')); if (!b || !MAKE_BASES.includes(b.id)) return { error: 'Choose a base from the menu' };
  const ok = addonsFor(b).map(a => a.id), addons = [...new Set(String(q.addons || '').split(/[,+ ]/).map(s => s.trim()).filter(a => ok.includes(a)))].slice(0, MAX_ADDONS).sort();
  const system = COLOUR_SYSTEMS.some(s => s.id === q.system) ? String(q.system) : COLOUR_SYSTEMS[0].id;
  const n = COLOUR_SYSTEMS.find(s => s.id === system).colours.length, colour = Math.min(Math.max(Math.floor(Number(q.colour) || 0), 0), n - 1);
  return { base: b.id, addons, system, colour, key: [b.id, addons.join('+') || '-', system, colour].join('.') };
}
export const recipeLink = pc => `${pc.base}.${pc.addons.join('+') || '-'}.${pc.system}.${pc.colour}`;

const POM = [['chest', 'Chest (flat)'], ['length', 'Body length'], ['shoulder', 'Shoulder'], ['sleeve', 'Sleeve'], ['waist', 'Waist (flat)'], ['hip', 'Hip (flat)'], ['rise', 'Front rise'], ['inseam', 'Inseam'], ['legOpening', 'Leg opening']];
const fmt = v => { const w = Math.floor(v + 1e-9), f = Math.round((v - w) * 8); return `${w || (f ? '' : 0)}${f ? ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][f] : ''} in`; };
// what the piece's tech pack would say: built from the same flats and pattern the Lab draws
export function pieceSpec(pc) {
  const r = cookRecipe({ base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }); if (r.error) return { error: r.error };
  const p = r.params, S = STYLES[p.style], m = measurementsFor(p, 'M'), sys = COLOUR_SYSTEMS.find(s => s.id === pc.system), col = sys.colours[pc.colour];
  // details: what was added and how it is finished (how it is built is said apart, in built)
  const pat = garmentPattern(p, 'M'), ck = pat ? constructionCheck(pat, { m, style: p.style }) : null;
  const details = flatDetails(p).filter(d => !d.layer && d.group !== 'build' && !['kind', 'colour'].includes(d.key) && d.view !== 'inside').map(d => d.label.replace(/, \d.*$/, '').replace(/ \(.*$/, ''));
  return { label: baseOf(pc.base).label, style: S.label, fit: FITS[p.fit] || p.fit, colour: { name: col.name, hex: col.hex, system: sys.name },
    built: constructionWords(constructionOf(p)), details: [...new Set(details)].slice(0, 14),
    measurements: POM.filter(([k]) => Number.isFinite(m[k]) && m[k] > 0).map(([k, label]) => ({ label, value: fmt(m[k]) })),
    sizes: S.oneSize ? ['One size'] : SIZES,
    pattern: pat ? { pieces: pat.pieces.filter(q => q.cut).length, cuts: pat.pieces.filter(q => q.cut).reduce((n, q) => n + q.cut, 0), seams: ck ? `${ck.passed} of ${ck.made}` : null, sews: Boolean(ck?.ok), trims: (pat.trims || []).map(t => t.item).slice(0, 8) } : null,
    views: viewsOf(p.style).filter(v => drawingOf(p, v)) };
}

// the flat as a picture: the sketch drawn inline (so nothing is fetched), coloured inside its silhouette
const inline = new Map(), templateSvg = file => { if (!inline.has(file)) { const t = readFileSync(new URL(`./flat-templates/${file}`, import.meta.url), 'utf8'); inline.set(file, t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>'))); } return inline.get(file); };
const parts = new Map(), partHref = file => { if (!parts.has(file)) { try { parts.set(file, `data:image/webp;base64,${readFileSync(new URL(`./flat-parts/${file}`, import.meta.url)).toString('base64')}`); } catch { parts.set(file, ''); } } return parts.get(file); };
const masks = new Map();
export async function flatPicture(pc, view = 'front', width = 900, format = 'webp') {
  const r = cookRecipe({ base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }); if (r.error) return null;
  const p = r.params, d = drawingOf(p, view, 'M'); if (!d) return null;
  if (!masks.has(d.t.file)) { try { masks.set(d.t.file, `data:image/png;base64,${(await maskFor(d.t.file, f => readFileSync(new URL(`./flat-templates/${f}`, import.meta.url)), f => readFileSync(new URL(`./flat-templates/masks/${f}`, import.meta.url)))).toString('base64')}`); } catch { masks.set(d.t.file, null); } }
  const svg = renderSvg(p, view, { plain: true, scale: 40, showDims: false, templateSvg, partHref, maskHref: f => masks.get(f) || null, raster: true });
  const img = sharp(Buffer.from(svg), { density: 150 }).resize({ width, height: width, fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' });
  return (format === 'png' ? img.png() : img.webp({ quality: 86 })).toBuffer();
}

// the piece's tech pack: what a Lab piece's pack takes from its flats (src/lab-flats-routes.js handoff), for a piece that is not saved anywhere,
// with its pattern's pieces and check as construction lines. Fabric, labels, packaging and the factory are chosen in the Lab, and the pack says so.
export const PACK_NOTE = 'Made on the Make page (thefuturebasics.com/pages/make) from the Design Lab\'s own flats, measurements and pattern. Fabric, trims, labels, packaging, artwork and the factory are chosen in the Design Lab, where this pack can be edited, graded, sampled and sent to a factory.';
export async function piecePack(pc) {
  const r = cookRecipe({ base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }); if (r.error) return { error: r.error };
  const p = r.params, S = STYLES[p.style], tpl = templateOf(p), sizes = S.oneSize ? ['One size'] : SIZES, m = measurementsFor(p, 'M');
  const pom = pomTable(p).map(row => ({ code: row.code, name: row.name, how: washShrink(p) ? `From the flats; finished, after the wash (allow ${washShrink(p)}% shrinkage)` : 'From the flats', tolerance: String(row.tolerance), values: Object.fromEntries(row.values.map(v => [v.size, String(v.value)])) }));
  const built = ['top', 'bottom'].includes(S.kind) ? constructionWords(constructionOf(p)) : [];
  const pat = garmentPattern(p, 'M'), ck = pat ? constructionCheck(pat, { m, style: p.style }) : null, cut = pat ? pat.pieces.filter(q => q.cut) : [];
  const construction = [{ area: 'Drawing', detail: `${FITS[p.fit] || p.fit} fit ${S.label.toLowerCase()}, drawn from the ${tpl ? `"${tpl.label}" flat sketch` : 'measurements'}; sample size M.` },
    ...(built.length ? [{ area: 'How it is built', detail: `${built.join('; ')}.` }] : []),
    ...(p.crop ? [{ area: 'Cropped body', detail: `Cropped ${p.crop} in shorter than the sketch's body, taken out above the hem band so the band and hem finish stay as drawn.` }] : []),
    ...(necklineWords(p) ? [{ area: 'Neckline', detail: necklineWords(p) }] : []),
    ...washWords(p).map(t => ({ area: /^Distressed/.test(t) ? 'Distressing' : /^Measurements in this pack/.test(t) ? 'Wash shrinkage' : 'Wash', detail: t })),
    ...(p.edits || []).map(e => ({ area: e.type === 'stitch' ? 'Stitching' : DETAILS[e.kind] || 'Detail', detail: describeEdit(e, p) })),
    ...(pat ? [{ area: 'Pattern', detail: `${cut.length} pattern pieces, ${cut.reduce((n, q) => n + q.cut, 0)} cut, drafted at sample size M: ${cut.map(q => `${q.name}${q.cut > 1 ? ` ×${q.cut}` : ''}`).join(', ')}.`.slice(0, 600) }] : []),
    ...(ck ? [{ area: 'Pattern check', detail: ck.ok ? `Sews together: ${ck.passed} of ${ck.made} seams walked and matched.` : `${ck.passed} of ${ck.made} seams match; the Design Lab shows the ones to fix.` }] : [])];
  const bom = (pat?.trims || []).map(t => ({ component: String(t.item || ''), material: String(t.spec || t.material || ''), qty: String(t.qty ?? ''), unit: String(t.unit || (/^\d+$/.test(String(t.qty ?? '')) ? 'pcs' : '')), placement: String(t.where || t.placement || '') }));
  const sketches = [];
  for (const v of viewsOf(p.style).filter(v => drawingOf(p, v))) { const png = await flatPicture(pc, v, 1400, 'png'); if (png) sketches.push({ view: v === 'back' ? 'back' : 'front', label: `Technical flat · ${v}`, image: `data:image/png;base64,${png.toString('base64')}` }); }
  const col = r.colour;
  const base = normalizeTechPack({ style: { styleName: r.name, category: S.category || '', sampleSize: S.oneSize ? 'One size' : 'M', fitBlock: `${FITS[p.fit] || p.fit} ${S.label.toLowerCase()}${tpl ? ` (${tpl.label})` : ''}`, description: r.words }, sizes, notes: PACK_NOTE });
  const pack = normalizeTechPack(labHandoff(base, { pom, sizes, construction, bom, sketches, colourways: (r.colourways || []).slice(1).map(c => ({ name: c.name, hex: c.hex })), color: col ? { hex: col.hex, name: col.name } : null }));
  return { pack, name: r.name };
}
export async function piecePackPdf(pc) {
  const out = await piecePack(pc); if (out.error) return out;
  return { pdf: await techPackPdf({ pack: out.pack, product: { title: out.name } }), name: out.name };
}

export function registerMakeDemoRoutes(app, { allowed = () => true, log = null } = {}) {
  const cache = new Map(), keep = (k, v) => { if (cache.size > 400) cache.delete(cache.keys().next().value); cache.set(k, v); return v; };
  const limited = (req, reply) => { if (allowed(req.ip, { bucket: 'make-demo', limit: Number(process.env.MAKE_DEMO_LIMIT) || 240 })) return false; reply.code(429).send({ error: 'That is a lot of pieces for one hour. Open the Design Lab to keep going.' }); return true; };
  app.get('/v1/public/make/menu', async (_req, reply) => { reply.header('cache-control', 'public, max-age=3600'); return makeMenu(); });
  app.get('/v1/public/make/piece', async (req, reply) => {
    const pc = pieceOf(req.query || {}); if (pc.error) return reply.code(400).send({ error: pc.error });
    let spec = cache.get('s:' + pc.key);
    if (!spec) { if (limited(req, reply)) return; try { spec = keep('s:' + pc.key, pieceSpec(pc)); } catch (e) { log?.warn?.({ err: e.message, key: pc.key }, 'make demo spec failed'); return reply.code(500).send({ error: 'That piece could not be drawn' }); } }
    if (spec.error) return reply.code(400).send({ error: spec.error });
    const qs = `base=${pc.base}&addons=${encodeURIComponent(pc.addons.join(','))}&system=${pc.system}&colour=${pc.colour}`;
    reply.header('cache-control', 'public, max-age=3600');
    return { piece: { base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }, recipe: recipeLink(pc), spec, images: Object.fromEntries(spec.views.map(v => [v, `/v1/public/make/flat.webp?${qs}&view=${v}`])), techpack: `/v1/public/make/techpack.pdf?${qs}` };
  });
  // the free tech pack: made once per piece and kept, like the pictures (a PDF is small; the first is the slow one)
  app.get('/v1/public/make/techpack.pdf', async (req, reply) => {
    const pc = pieceOf(req.query || {}); if (pc.error) return reply.code(400).send({ error: pc.error });
    let got = cache.get('p:' + pc.key);
    if (!got) { if (limited(req, reply)) return; try { got = await piecePackPdf(pc); } catch (e) { log?.warn?.({ err: e.message, key: pc.key }, 'make demo tech pack failed'); return reply.code(500).send({ error: 'That tech pack could not be made' }); } if (got.error) return reply.code(400).send({ error: got.error }); keep('p:' + pc.key, got); }
    const file = `${got.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'piece'}-tech-pack.pdf`;
    return reply.header('cache-control', 'public, max-age=86400').header('cross-origin-resource-policy', 'cross-origin').header('content-disposition', `attachment; filename="${file}"`).type('application/pdf').send(got.pdf);
  });
  app.get('/v1/public/make/flat.webp', async (req, reply) => {
    const pc = pieceOf(req.query || {}); if (pc.error) return reply.code(400).send({ error: pc.error });
    const view = req.query?.view === 'back' ? 'back' : 'front', k = `f:${pc.key}:${view}`;
    let png = cache.get(k);
    if (!png) { if (limited(req, reply)) return; try { png = await flatPicture(pc, view); } catch (e) { log?.warn?.({ err: e.message, key: pc.key }, 'make demo flat failed'); png = null; } if (!png) return reply.code(404).send({ error: 'No such view' }); keep(k, png); }
    return reply.header('cache-control', 'public, max-age=86400').header('cross-origin-resource-policy', 'cross-origin').type('image/webp').send(png);
  });
}

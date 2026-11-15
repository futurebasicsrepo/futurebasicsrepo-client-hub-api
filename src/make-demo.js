// Build one now (the Make page, thefuturebasics.com/pages/make): a visitor picks a base, a few add-ons and a colour, and sees the real flats
// the Design Lab draws for that piece, and what its tech pack would say: how it is built, every detail, its measurements, its pattern
// pieces and the check that they sew together. No sign-in and no AI: the same recipe menu, flats and pattern the Lab uses
// (src/lab-recipe.js, src/lab-flats.js, src/lab-pattern.js). "Make this for real" carries the piece into the Lab (src/join.html → src/lab.html →
// src/lab-recipe.html, by fb.pendingRecipe).
//   GET /v1/public/make/menu                     the bases, each with the add-ons that suit it, and the colour systems
//   GET /v1/public/make/piece?base&addons&system&colour     what the piece's tech pack would say, and where its two flats are
//   GET /v1/public/make/flat.webp?…&view=front|back         a flat as a picture (the purchased flat sketches are never sent as vectors)
// Pictures and answers are kept in memory by the piece; a new piece counts against a per-address hourly limit.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { RECIPE_BASES, COLOUR_SYSTEMS, addonsFor, baseOf, cookRecipe } from './lab-recipe.js';
import { STYLES, FITS, SIZES, renderSvg, drawingOf, measurementsFor, viewsOf } from './lab-flats.js';
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
export async function flatPicture(pc, view = 'front', width = 900) {
  const r = cookRecipe({ base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }); if (r.error) return null;
  const p = r.params, d = drawingOf(p, view, 'M'); if (!d) return null;
  if (!masks.has(d.t.file)) { try { masks.set(d.t.file, `data:image/png;base64,${(await maskFor(d.t.file, f => readFileSync(new URL(`./flat-templates/${f}`, import.meta.url)), f => readFileSync(new URL(`./flat-templates/masks/${f}`, import.meta.url)))).toString('base64')}`); } catch { masks.set(d.t.file, null); } }
  const svg = renderSvg(p, view, { plain: true, scale: 40, showDims: false, templateSvg, partHref, maskHref: f => masks.get(f) || null, raster: true });
  return sharp(Buffer.from(svg), { density: 150 }).resize({ width, height: width, fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).webp({ quality: 86 }).toBuffer();
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
    return { piece: { base: pc.base, addons: pc.addons, system: pc.system, colour: pc.colour }, recipe: recipeLink(pc), spec, images: Object.fromEntries(spec.views.map(v => [v, `/v1/public/make/flat.webp?${qs}&view=${v}`])) };
  });
  app.get('/v1/public/make/flat.webp', async (req, reply) => {
    const pc = pieceOf(req.query || {}); if (pc.error) return reply.code(400).send({ error: pc.error });
    const view = req.query?.view === 'back' ? 'back' : 'front', k = `f:${pc.key}:${view}`;
    let png = cache.get(k);
    if (!png) { if (limited(req, reply)) return; try { png = await flatPicture(pc, view); } catch (e) { log?.warn?.({ err: e.message, key: pc.key }, 'make demo flat failed'); png = null; } if (!png) return reply.code(404).send({ error: 'No such view' }); keep(k, png); }
    return reply.header('cache-control', 'public, max-age=86400').header('cross-origin-resource-policy', 'cross-origin').type('image/webp').send(png);
  });
}

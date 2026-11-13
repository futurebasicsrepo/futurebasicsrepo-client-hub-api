// The flats and the picture, both ways, battle tested: a set of pieces full of details goes from its flats to a picture and from that picture
// back to flats, and every detail is checked on the way (src/lab-trip.js). What is lost, and where, is the report.
//
//   node scripts/flats-roundtrip.mjs [--only id,…] [--out dir] [--live] [--jobs 3]
//   --fixture runs the live steps with stand-ins for the models (the flat as the picture, a reader that sees exactly the flats): the code, not the models
//
// Without --live (no keys, no cost) it runs the structural round trip, the part that is code:
//   1. the picture's prompt names every detail of the flats that can be seen;
//   2. the details read back from a picture (here: exactly what the flats are built with, as a perfect reader would see them) make flats that
//      are built the same: the same construction words, and stand-ins drawn on the stock sketch for what it does not draw;
//   3. those flats still make a pattern that passes the construction check at every size.
// With --live (ANTHROPIC_API_KEY and OPENAI_API_KEY or GEMINI_API_KEY inline, never committed) it also runs the models the app runs:
//   4. the image model draws the picture from the front and back flats with that prompt, and a vision model checks it detail by detail;
//   5. the picture is read for how the piece is built, and the flats it makes are compared with the ones it came from.
// About 1 image generation and 2 vision calls a piece. Writes <out>/report.html (the flats, the picture, what was kept and lost) and summary.json.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { cookRecipe } from '../src/lab-recipe.js';
import { STYLES, SIZES, defaultParams, fitToTemplate, renderSvg, drawingOf, viewsOf, measurementsFor } from '../src/lab-flats.js';
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { constructionOf, constructionWords, cleanConstruction } from '../src/lab-construction.js';
import { flatDetails, pictureFromFlatsPrompt, auditOf, auditResult, BUILD_SCHEMA, BUILD_SYSTEM, LOOK_SCHEMA, buildAsk, lookOf, readBack, tripLoss } from '../src/lab-trip.js';
import { garmentPattern } from '../src/lab-pattern.js';
import { constructionCheck } from '../src/lab-pattern-check.js';

const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ONLY = arg('only') && arg('only') !== true ? String(arg('only')).split(',') : [], OUT = arg('out', 'roundtrip-out'), FIXTURE = Boolean(arg('fixture')), LIVE = Boolean(arg('live')) || FIXTURE, JOBS = Number(arg('jobs', 3)) || 3;

// the pieces: recipe pieces with details added on the flats, and library sketches whose details are in the sketch itself
const R = (id, base, addons, extra = {}) => ({ id, make: () => cookRecipe({ base, addons, system: 'earth', ...extra }).params });
const S = (id, template) => ({ id, make: () => { const t = FLAT_TEMPLATES.find(x => x.id === template); return fitToTemplate({ ...defaultParams(t.style, 'regular'), template }); } });
export const CASES = [
  R('hoodie-pockets-wash', 'hoodie', ['chest-pocket', 'zip-pocket', 'wash-vintage', 'wear-edges']),
  R('tee-polo-pocket', 'tee', ['neck-polo', 'chest-pocket', 'contrast']),
  R('tee-placket-mock', 'tee', ['placket', 'neck-mock', 'wash-garment']),
  R('shirt-flap-buttondown', 'shirt', ['flap-pocket', 'neck-buttondown']),
  R('jacket-shearling-zip', 'jacket', ['neck-shearling', 'zip-pocket', 'flap-pocket']),
  R('crew-kangaroo-cropped', 'crewneck', ['kangaroo', 'cropped']),
  R('pants-cargo-drawcord', 'pants', ['cargo', 'waist-drawcord']),
  R('pants-wide-pleats', 'pants-wide', ['pleats']),
  R('shorts-jeans', 'shorts', ['jean-pockets', 'back-welts']),
  R('dress-zip-side', 'dress', ['zip-front', 'slant-side']),
  R('vest-pockets', 'vest', ['chest-pocket', 'zip-pocket']),
  S('sketch-western', 'shirt-western-overshirt'), S('sketch-trucker', 'jk-trucker'), S('sketch-cargo', 'pt-cargo'), S('sketch-double-knee', 'pt-double-knee-work-pants'), S('sketch-work-shirt', 'ss-two-pocket-work-shirt'),
].filter(c => { try { return !ONLY.length || ONLY.includes(c.id); } catch { return false; } });

// ---- the structural round trip ----
const words = p => constructionWords(constructionOf(p));
const fromPicture = readBack, fullLoss = (p, p2) => { const t = tripLoss(p, p2); return { lost: t.lost, added: t.added, notCarried: t.notCarried, score: t.score }; };
export function structural(c) {
  const p = c.make(), det = flatDetails(p), prompt = pictureFromFlatsPrompt({ details: det, back: viewsOf(p.style).includes('back') });
  const said = det.filter(d => !d.layer && d.group !== 'kind' && d.view !== 'inside').filter(d => !prompt.includes(d.words ? d.words.replace(/^(Front|Back): /, '') : d.label));
  const p2 = fromPicture(p), w1 = words(p), all = fullLoss(p, p2);
  const fails = []; for (const z of (STYLES[p2.style].oneSize ? ['M'] : SIZES)) { try { const pat = garmentPattern(p2, z), k = pat && constructionCheck(pat, { m: measurementsFor(p2, z), style: p2.style }); if (!k?.ok) fails.push(z); } catch { fails.push(z); } }
  return { id: c.id, style: p.style, template: p.template, details: det.length, unsaid: said.map(d => d.label), built: w1, lostBuild: all.lost, addedBuild: all.added, notCarried: all.notCarried, standIns: p2.edits.map(e => e.kind), patternFails: fails, p, p2 };
}

// ---- the live round trip ----
const inline = new Map(), templateSvg = file => { if (!inline.has(file)) { const t = readFileSync(new URL(`../src/flat-templates/${file}`, import.meta.url), 'utf8'); inline.set(file, t.slice(t.indexOf('>', t.indexOf('<svg')) + 1, t.lastIndexOf('</svg>'))); } return inline.get(file); };
const partHref = file => { try { return `data:image/webp;base64,${readFileSync(new URL(`../src/flat-parts/${file}`, import.meta.url)).toString('base64')}`; } catch { return ''; } };
const flatPng = (p, v) => sharp(Buffer.from(renderSvg(p, v, { plain: true, scale: 40, templateSvg, partHref })), { density: 150 }).resize({ width: 1024, height: 1024, fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).png().toBuffer();
const jpegPart = async b => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (await sharp(b).resize({ width: 1024, height: 1024, fit: 'inside' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()).toString('base64') } });
async function live(c, r) {
  let { imageConfig, openaiEdit } = await import('../src/check.js'), { callJsonSchema } = await import('../src/studio.js'), cfg = imageConfig();
  if (FIXTURE) { cfg = { configured: true, provider: 'fixture' }; openaiEdit = async ({ images }) => sharp(images[0]).flatten({ background: '#e9e9e6' }).png().toBuffer();
    callJsonSchema = async (sys, content, schema) => (schema.properties.build ? { build: cleanConstruction(constructionOf(r.p)), look: lookOf(r.p) } : Object.fromEntries(Object.keys(schema.properties).map(k => [k, 'yes']))); }
  else if (!cfg.configured || cfg.provider === 'fixture') throw new Error('no image model: set OPENAI_API_KEY or GEMINI_API_KEY');
  const p = r.p, det = flatDetails(p), back = viewsOf(p.style).includes('back') && drawingOf(p, 'back');
  const front = await flatPng(p, 'front'), backPng = back ? await flatPng(p, 'back') : null;
  const picture = await openaiEdit({ images: backPng ? [front, backPng] : [front], prompt: pictureFromFlatsPrompt({ details: det, back: Boolean(backPng) }), cfg: { ...cfg, size: '1024x1024' } });
  const a = auditOf(det), check = auditResult(await callJsonSchema(a.system, [await jpegPart(picture), { type: 'text', text: a.text }], a.schema, { maxTokens: 900 }), a.checked);
  const got = await callJsonSchema(BUILD_SYSTEM, [{ type: 'text', text: 'The picture of the piece' }, await jpegPart(picture), { type: 'text', text: `${buildAsk(p.style)} Then say how it is finished: its neckline, wash, wear, whether it is cropped, and the colour of contrast pockets and trims.` }], { type: 'object', additionalProperties: false, required: ['build', 'look'], properties: { build: BUILD_SCHEMA, look: LOOK_SCHEMA } }, { maxTokens: 1000 });
  const read = cleanConstruction(got?.build), p2 = fromPicture(p, read, got?.look), cmp = fullLoss(p, p2);
  writeFileSync(`${OUT}/${c.id}-flat.png`, front); if (backPng) writeFileSync(`${OUT}/${c.id}-flat-back.png`, backPng); writeFileSync(`${OUT}/${c.id}-picture.png`, picture);
  writeFileSync(`${OUT}/${c.id}-back-to-flat.png`, await flatPng(p2, 'front'));
  return { check, read, look: got?.look, liveLost: cmp.lost, liveAdded: cmp.added, detailScore: cmp.score };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true }); const rows = [];
  const queue = [...CASES]; await Promise.all(Array.from({ length: LIVE ? JOBS : 1 }, async () => { for (let c; (c = queue.shift());) {
    const r = structural(c); if (LIVE) { try { r.live = await live(c, r); } catch (e) { r.live = { error: e.message }; } }
    rows.push(r); process.stdout.write(`${r.unsaid.length || r.lostBuild.length || r.patternFails.length || r.live?.check?.missing?.length || r.live?.liveLost?.length || r.live?.error ? '✗' : '✓'} ${c.id}\n`); } }));
  rows.sort((a, b) => CASES.findIndex(c => c.id === a.id) - CASES.findIndex(c => c.id === b.id));
  const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const list = (xs, none = '—') => xs?.length ? xs.map(esc).join('<br>') : none;
  const html = `<!doctype html><meta charset="utf-8"><title>Flats and picture round trip</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#141416}table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #ddd;padding:8px;vertical-align:top;text-align:left}th{font-size:12px;color:#666}.bad{color:#a02a20}.ok{color:#17603a}img{width:150px;background:#f4f4f1;border-radius:8px}</style>
<h1>Flats and picture round trip</h1><p>${rows.length} pieces, ${LIVE ? 'with the models (live)' : 'structural only (no models)'}; ${new Date().toISOString().slice(0, 16)}</p>
<table><tr><th>Piece</th><th>Built with (flats)</th><th>Not in the picture's prompt</th><th>Lost reading it back</th><th>Stand-ins drawn</th><th>Pattern</th>${LIVE ? '<th>Picture check: missing</th><th>Lost from the real picture</th><th>Images</th>' : ''}</tr>
${rows.map(r => `<tr><td><b>${esc(r.id)}</b><br><small>${esc(r.style)} · ${esc(r.template)} · ${r.details} details</small></td><td>${list(r.built)}</td><td class="${r.unsaid.length ? 'bad' : 'ok'}">${list(r.unsaid, 'all said')}</td><td class="${r.lostBuild.length ? 'bad' : 'ok'}">${list(r.lostBuild, 'none')}${r.notCarried.length ? `<br><small>not carried by design: ${list(r.notCarried)}</small>` : ''}</td><td>${list(r.standIns)}</td><td class="${r.patternFails.length ? 'bad' : 'ok'}">${r.patternFails.length ? 'fails at ' + r.patternFails.join(', ') : 'passes'}</td>${LIVE ? `<td class="${r.live?.error || r.live?.check?.missing?.length ? 'bad' : 'ok'}">${r.live?.error ? esc(r.live.error) : list((r.live?.check?.missing || []).map(k => r.live.check.labels[k] || k), 'none')}</td><td class="${r.live?.liveLost?.length ? 'bad' : 'ok'}">${list(r.live?.liveLost, 'none')}${r.live?.liveAdded?.length ? `<br><small>added: ${list(r.live.liveAdded)}</small>` : ''}</td><td>${r.live?.error ? '' : `<img src="${r.id}-flat.png"> <img src="${r.id}-picture.png"> <img src="${r.id}-back-to-flat.png">`}</td>` : ''}</tr>`).join('')}</table>`;
  writeFileSync(`${OUT}/report.html`, html);
  const sum = { pieces: rows.length, live: LIVE, unsaid: rows.filter(r => r.unsaid.length).length, lostBuild: rows.filter(r => r.lostBuild.length).length, patternFails: rows.filter(r => r.patternFails.length).length,
    ...(LIVE ? { pictureMissing: rows.filter(r => r.live?.check?.missing?.length).length, liveLost: rows.filter(r => r.live?.liveLost?.length).length, errors: rows.filter(r => r.live?.error).length } : {}),
    rows: rows.map(({ p, p2, ...r }) => r) };
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(sum, null, 2));
  console.log(`\n${rows.length} pieces · prompt missing a detail: ${sum.unsaid} · build lost reading back: ${sum.lostBuild} · pattern fails: ${sum.patternFails}${LIVE ? ` · picture missing a detail: ${sum.pictureMissing} · build lost from the real picture: ${sum.liveLost} · errors: ${sum.errors}` : ''}\n→ ${OUT}/report.html`);
  process.exit(sum.unsaid || sum.lostBuild || sum.patternFails || (LIVE && (sum.pictureMissing || sum.liveLost || sum.errors)) ? 1 : 0);
}

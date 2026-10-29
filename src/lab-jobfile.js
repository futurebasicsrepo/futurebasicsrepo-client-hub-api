// The production artwork pack: a graphic plus the technique it is made with becomes a job file a factory (or a digitising service) can work from.
// What goes in depends on the technique's kind:
//   print          one layer per ink with its Pantone (the ink on a clear ground, and a black-on-white film positive), the underbase, and the
//                  halftone, mesh and ink settings;
//   embroidery     the artwork at size, one mask per thread colour, the thread list (Pantone to match), stitch type, finished size and an
//                  estimated stitch count from the technique's density;
//   heat transfer  the artwork at size, mirrored for printing, with backing and finish;
//   patch          the artwork at size, the cut line (the shape grown by the border), the edge finish and the backing.
// Every pack holds artwork-300dpi.png, job.json (everything in the sheet as data), and job-sheet.pdf (the one page the factory pins up).
// The rules and words come from the technique library (src/lab-library.js): the factory note, the design rules, the finish.
import sharp from 'sharp';
import { printCheck } from './art.js';
import { nearestName } from './studio.js';
import './pantone-c.js';
import { separate, halftone, choke, SCREEN_ANGLES } from './lab-separate.js';
import { digitize, dstOf, expOf, stitchSvg } from './lab-digitize.js';
import { cleanRules } from './lab-library.js';
import { brandDoc, fact, table, safe, INK, DIM, LINE } from './brand-pdf.js';
import { zip } from './zip.js';

const DPI = 300, MAX_PX = 6000, REG_MARGIN = 150; // films carry half an inch of margin for the registration marks
// a registration mark (a cross in a circle) at the middle of each side of a film, in its margin: every screen lines up on them
function regMarks(out, FW, FH, m) {
  const R = Math.round(m * .28), set = (x, y) => { if (x >= 0 && y >= 0 && x < FW && y < FH) out[y * FW + x] = 0; };
  for (const [cx, cy] of [[FW / 2, m / 2], [FW / 2, FH - m / 2], [m / 2, FH / 2], [FW - m / 2, FH / 2]].map(v => v.map(Math.round))) {
    for (let d = -R - 8; d <= R + 8; d++) for (let k = -1; k <= 1; k++) { set(cx + d, cy + k); set(cx + k, cy + d); }
    for (let a = 0; a < 720; a++) { const t = a / 720 * Math.PI * 2; for (let k = -1; k <= 1; k++) set(Math.round(cx + (R + k) * Math.cos(t)), Math.round(cy + (R + k) * Math.sin(t))); }
  }
}
const r2 = n => Math.round(n * 100) / 100, mm = inch => Math.round(inch * 25.4);
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const slug = s => String(s || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'graphic';
const lum = h => { const [r, g, b] = hexRgb(h); return (r * 299 + g * 587 + b * 114) / 1000; };

// How a print is screened and inked, by the technique it is made as. The factory can change these; they are the usual starting point.
export function printSettings(t) {
  const name = String(t?.name || '').toLowerCase(), base = String(t?.base || 'screen print');
  const s = { process: base, inkType: 'plastisol', meshCount: 156, lpi: 55, angle: 22.5, dotShape: 'elliptical', underbase: true, underbaseChokePt: 0.5, flashBetweenColours: true, cure: '160 °C (320 °F), 60–90 s through the dryer' };
  if (/water|discharge/.test(name)) Object.assign(s, { inkType: /water/.test(name) ? 'water-based' : 'discharge', meshCount: 196, lpi: 45, underbase: false, cure: '160 °C (320 °F), 2–3 min; discharge needs a forced-air dryer' });
  if (/halftone|simulated|process/.test(name)) Object.assign(s, { meshCount: 230, lpi: 65, dotShape: 'round' });
  if (/puff/.test(name) || base === 'puff print') Object.assign(s, { inkType: 'puff plastisol', meshCount: 86, lpi: 0, halftone: false, underbase: false, cure: '150–160 °C (300–320 °F); the puff rises in the dryer, do not over-cure' });
  if (/foil/.test(name)) Object.assign(s, { inkType: 'foil adhesive plastisol', meshCount: 110, lpi: 0, underbase: false, cure: 'Cure the adhesive, then foil at 160 °C (320 °F) for 10 s, medium pressure, cold peel' });
  if (/vintage|crack/.test(name)) Object.assign(s, { inkType: 'crackle plastisol', meshCount: 110, lpi: 45 });
  if (/flock/.test(name) || base === 'flock print') Object.assign(s, { inkType: 'flock adhesive', meshCount: 86, lpi: 0, halftone: false, underbase: false });
  if (/rubber|silicone/.test(name) || base === 'rubber print') Object.assign(s, { inkType: 'silicone / high-density', meshCount: 60, lpi: 0, halftone: false, underbase: false, cure: '150 °C (300 °F), 2–3 min' });
  if (/metallic|glitter|shimmer/.test(name)) Object.assign(s, { meshCount: 86, lpi: 0, halftone: false });
  if (s.halftone === undefined) s.halftone = s.lpi > 0;
  return s;
}

// What the thread, backing and stitches are for embroidery, from the technique.
export function embroiderySettings(t, rules) {
  const name = String(t?.name || '').toLowerCase(), f = t?.finish || {};
  const stitch = /puff|3d/.test(name) ? 'satin over 3 mm foam' : f.stitch === 'chain' ? 'chain stitch' : f.stitch === 'fill' ? 'tatami fill' : 'satin stitch';
  return { stitch, thread: '40 wt polyester (or rayon for sheen)', needle: '75/11 ballpoint for knits, 75/11 sharp for wovens', backing: /cap|puff|3d/.test(name) ? 'cut-away, medium; foam 3 mm' : 'tear-away for wovens, cut-away for knits', density: rules.density || 1800, underlay: 'edge-run plus zigzag under satin columns; tatami under fills', pullCompensation: '0.2–0.3 mm on satin columns', minSatinMm: rules.minLineMm, maxWidthIn: rules.maxW, maxHeightIn: rules.maxH };
}

// → { kind, summary, files: [{ name, data }] } for a graphic (a PNG with transparency) made as a technique at a width in inches.
export async function jobFile(png, { name = 'Graphic', technique = null, widthIn = 4, garmentColour = '', digitizeOpts = {} } = {}) {
  const t = technique || { name: 'Screen print', kind: 'print', base: 'screen print', rules: {}, finish: {}, factoryNote: '', artGuide: '' };
  const rules = cleanRules(t.rules || {}, t.base), kind = t.kind || 'print';
  const src = sharp(png).ensureAlpha(); const meta = await src.metadata();
  const w = Math.max(.5, Math.min(rules.maxW || 40, Number(widthIn) || 4)), outW = Math.min(MAX_PX, Math.round(w * DPI)), outH = Math.round(outW * meta.height / meta.width);
  const h = r2(outH / DPI);
  const resized = await sharp(png).ensureAlpha().resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height;
  // the separation (src/lab-separate.js): every ink that fills an area of its own, however small; soft edges to the nearer ink; gradients and
  // fades kept as tones (screened as halftone dots on the film); the garment's own colour and a JPG's background not printed
  const maxColours = Math.max(1, Math.min(12, rules.maxColors ? Math.max(rules.maxColors, 8) : 8));
  const sep = separate(data, info.width, info.height, { max: kind === 'embroidery' ? 12 : maxColours + 4, garment: garmentColour });
  const P = globalThis.FBPantone, colours = sep.inks.map(c => ({ hex: c.hex, name: nearestName(c.hex), pantone: lum(c.hex) > 245 ? 'White' : (P ? P.code(c.hex, { hint: nearestName(c.hex) }) || '' : ''), share: c.share, knockout: c.knockout, background: c.background }));
  // paper white has no chip: it is white ink (or the garment showing through)
  let opaque = 0; const N4 = N; for (let p = 0; p < N4; p++) if (sep.hard[p] >= 0) opaque++;
  colours.forEach((c, i) => { c.coverage = c.knockout ? 0 : c.share; });
  const coverage = N ? opaque / N : 0, areaIn2 = r2(w * h * coverage);
  const files = [{ name: 'artwork-300dpi.png', data: resized }];
  const ps = kind === 'print' ? printSettings(t) : null, tonal = sep.tonal > .005, screened = Boolean(ps && ps.halftone && ps.lpi > 0);
  // an ink layer: the ink's colour where it prints, as strong as its share (what the print looks like)
  const inkLayer = (cov, rgb) => { const out = Buffer.alloc(N * 4); for (let p = 0; p < N; p++) { if (!cov[p]) continue; out[p * 4] = rgb[0]; out[p * 4 + 1] = rgb[1]; out[p * 4 + 2] = rgb[2]; out[p * 4 + 3] = Math.round(cov[p] * data[p * 4 + 3] / 255); } return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer(); };
  // a film positive: black where ink goes, white elsewhere; tones screened into dots at the plate's angle; registration marks in a half-inch margin
  const filmOf = async (cov, angle) => {
    const dots = tonal && screened ? halftone(cov, info.width, info.height, { lpi: ps.lpi, dpi: DPI, angle }) : null, m = REG_MARGIN, FW = info.width + 2 * m, FH = info.height + 2 * m, out = Buffer.alloc(FW * FH, 255);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) { const p = y * info.width + x; if (dots ? dots[p] : cov[p] >= 128) out[(y + m) * FW + x + m] = 0; }
    regMarks(out, FW, FH, m);
    return sharp(out, { raw: { width: FW, height: FH, channels: 1 } }).toColourspace('srgb').png({ compressionLevel: 6 }).toBuffer();
  };
  const masks = []; // one per printed colour: what each ink, thread or film holds
  for (let c = 0; c < colours.length; c++) {
    if (colours[c].knockout || !sep.cover[c].some(v => v)) continue;
    const n = masks.length + 1, tag = `${String(n).padStart(2, '0')}-${slug(colours[c].pantone || colours[c].name)}`, angle = SCREEN_ANGLES[(n - 1) % SCREEN_ANGLES.length];
    masks.push({ n, c, colour: colours[c], ink: `ink-${tag}.png`, film: `film-${tag}.png`, angle });
    files.push({ name: `ink-${tag}.png`, data: await inkLayer(sep.cover[c], colours[c].rgb || hexRgb(colours[c].hex)) });
    if (kind !== 'embroidery') files.push({ name: `film-${tag}.png`, data: await filmOf(sep.cover[c], angle) });
  }
  const dropped = colours.filter(c => c.knockout);
  const check = printCheck({ widthPx: meta.width, heightPx: meta.height, widthIn: w });
  const job = { name, technique: { name: t.name, kind, base: t.base }, size: { widthIn: r2(w), heightIn: h, widthMm: mm(w), heightMm: mm(h), px: [info.width, info.height], dpi: DPI }, garmentColour: garmentColour || '', coverage: r2(coverage), areaIn2, colours: masks.map(m => ({ n: m.n, pantone: m.colour.pantone, hex: m.colour.hex, name: m.colour.name, coverage: m.colour.coverage, ink: m.ink, ...(kind !== 'embroidery' ? { film: m.film, ...(tonal && screened ? { angle: m.angle } : {}) } : {}) })), tones: tonal, knockouts: [...(sep.background ? [{ hex: sep.background, pantone: '', why: 'the background of the picture: not printed' }] : []), ...dropped.filter(c => !c.background).map(c => ({ hex: c.hex, pantone: c.pantone, why: 'the colour of the garment: the garment shows through' }))], sourceCheck: check, factoryNote: t.factoryNote || '', designRules: t.artGuide || '', rules, warnings: [] };
  if (check.level !== 'ok') job.warnings.push(check.message);
  for (const k of job.knockouts) job.warnings.push(`${k.pantone || k.hex} is ${k.why}.`.replace(/^(#[0-9a-f]{6}) is the background/, 'The $1 around the art is the background'));
  if (tonal && kind === 'print' && !screened) job.warnings.push('The artwork has soft tones (a gradient or fade), and this technique prints solid colour only: the tones print solid where they are over half strength.');
  if (tonal && kind === 'embroidery') job.warnings.push('The artwork has soft tones (a gradient or fade): embroidery sews each thread solid, so the tones become flat areas.');
  if (rules.maxColors && masks.length > rules.maxColors) job.warnings.push(`${masks.length} colours; this technique is usually priced for ${rules.maxColors}. Fewer colours cost less.`);
  if (w > rules.maxW || h > rules.maxH) job.warnings.push(`${r2(w)} × ${h} in is over the usual ${rules.maxW} × ${rules.maxH} in for this technique.`);
  if (kind === 'print') {
    const s = ps; job.print = { ...s, halftone: Boolean(tonal && screened), ...(tonal && screened ? {} : { lpi: 0 }) };
    const dark = garmentColour ? lum(garmentColour) < 128 : true;
    if (s.underbase && dark) { // white under every ink that is not near-black, choked half a point inside the colours so it never peeks out
      const ub = new Uint8Array(N); for (const m of masks) { if (lum(m.colour.hex) <= 40) continue; const cv = sep.cover[m.c]; for (let p = 0; p < N; p++) if (cv[p] > ub[p]) ub[p] = cv[p]; }
      const hardUb = new Uint8Array(N); for (let p = 0; p < N; p++) hardUb[p] = ub[p] >= 128 ? 255 : 0;
      const choked = choke(hardUb, info.width, info.height, Math.round(s.underbaseChokePt / 72 * DPI)); for (let p = 0; p < N; p++) if (ub[p] >= 128 && !choked[p]) ub[p] = 0; else if (choked[p]) ub[p] = Math.max(ub[p], 255);
      files.push({ name: 'underbase.png', data: await filmOf(ub, SCREEN_ANGLES[masks.length % SCREEN_ANGLES.length]) }); job.print.underbaseFile = 'underbase.png';
    } else job.print.underbase = false;
    job.print.screens = masks.length + (job.print.underbase ? 1 : 0);
    // the order on the press: the underbase and a flash, then the colours lightest first, the darkest last
    job.print.order = [...(job.print.underbase ? ['Underbase (white), then flash'] : []), ...masks.slice().sort((a, b) => lum(b.colour.hex) - lum(a.colour.hex)).map(m => `${m.n}. ${m.colour.pantone || m.colour.hex}`)];
  } else if (kind === 'embroidery') {
    const s = embroiderySettings(t, rules), d = await digitize(png, { widthIn: w, garment: garmentColour, ...(t.finish?.stitch === 'fill' ? { satinMaxMm: 3 } : {}), ...digitizeOpts });
    const dst = dstOf(d, name), exp = expOf(d), name8 = slug(name).slice(0, 24) || 'design';
    files.push({ name: `${name8}.dst`, data: dst.file }, { name: `${name8}.exp`, data: exp.file }, { name: 'stitch-preview.png', data: await sharp(Buffer.from(stitchSvg(d, { px: 1400, garment: /^#[0-9a-f]{6}$/i.test(garmentColour) ? garmentColour : '#ecebe6' }))).png().toBuffer() });
    job.embroidery = { ...s, stitches: d.stats.stitches, stitchEstimate: d.stats.stitches, trims: d.stats.trims, colourChanges: d.stats.colourChanges, minutes: d.stats.minutes, threadM: d.stats.threadM, satinShapes: d.stats.satin, fillShapes: d.stats.fill, files: { dst: `${name8}.dst`, exp: `${name8}.exp`, preview: 'stitch-preview.png' },
      sequence: d.threads.map(th => ({ n: th.n, hex: th.hex, pantone: lum(th.hex) > 245 ? 'White' : (P ? P.code(th.hex) || '' : ''), stitches: th.stitches, satin: th.satin, fill: th.fill })),
      threads: d.threads.map(th => ({ n: th.n, pantone: lum(th.hex) > 245 ? 'White' : (P ? P.code(th.hex) || '' : ''), hex: th.hex, thread: '' })) };
    job.warnings.push(...d.warnings);
    if (d.stats.stitches > 15000 && !d.warnings.some(x => /stitches/.test(x))) job.warnings.push(`${d.stats.stitches.toLocaleString('en-US')} stitches: heavy for a knit; consider a smaller fill or a patch.`);
  } else if (kind === 'heat_transfer') {
    files.push({ name: 'artwork-mirrored-300dpi.png', data: await sharp(resized).flop().png().toBuffer() });
    const n = String(t.name || '').toLowerCase();
    job.transfer = { print: 'artwork-mirrored-300dpi.png (mirrored for printing on the carrier)', finish: /matte|soft/.test(n) ? 'soft-touch matte' : /reflect/.test(n) ? 'reflective' : /gloss/.test(n) ? 'glossy' : 'as the technique', backing: 'hot-peel carrier unless the factory says cold-peel', apply: '150–160 °C (300–320 °F), 10–15 s, medium pressure', bleed: 'none: the transfer is cut to the artwork edge' };
  } else if (kind === 'patch') {
    const border = Math.round(DPI / 25.4 * 2); // the shape grown by 2 mm all round
    const alpha = await sharp(resized).extractChannel('alpha').raw().toBuffer();
    const grown = await sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } }).blur(border / 2).raw().toBuffer({ resolveWithObject: true }); // blur widens the band to three channels
    const cut = await sharp(grown.data, { raw: { width: info.width, height: info.height, channels: grown.info.channels } }).threshold(8).negate().png().toBuffer();
    files.push({ name: 'cut-line.png', data: cut });
    const bbox = w * h, simple = coverage >= .55;
    const n = String(t.name || '').toLowerCase();
    job.patch = { cutLine: 'cut-line.png (black on white, the artwork grown by 2 mm)', edge: /chenille/.test(n) ? 'felt base with merrowed edge' : simple ? 'merrowed (overlocked) edge, 3 mm' : 'laser-cut, hot-cut edge', backing: /rubber|pvc|silicone/.test(n) ? 'moulded, sew-on with stitch groove' : 'iron-on heat seal (or sew-on when asked)', base: /woven/.test(n) ? 'woven, 100% polyester' : /chenille/.test(n) ? 'chenille on felt' : /rubber|pvc/.test(n) ? 'soft PVC' : 'twill', sizeNote: `finished ${r2(w)} × ${h} in (${mm(w)} × ${mm(h)} mm) outside the border`, bboxIn2: r2(bbox) };
  } else {
    job.wash = { note: 'A wash or distress technique has no artwork separation; the artwork is included at size for reference.' };
  }
  files.push({ name: 'job.json', data: JSON.stringify(job, null, 2) + '\n' });
  files.push({ name: 'job-sheet.pdf', data: await jobSheet(job, resized) });
  files.push({ name: 'README.txt', data: readme(job, files) });
  return { job, files, zipName: `${slug(name)}-${slug(t.name)}-job.zip` };
}

function readme(job, files) {
  return [`${job.name} · ${job.technique.name} · ${job.size.widthIn} × ${job.size.heightIn} in (${job.size.widthMm} × ${job.size.heightMm} mm) at ${job.size.dpi} dpi`, '',
    'Files:', ...files.filter(f => f.name !== 'README.txt').map(f => '  ' + f.name), '',
    'job-sheet.pdf is the one page to pin up. job.json holds the same as data. Every ink-*.png is one colour on a clear ground; every film-*.png is its black-on-white film positive at 300 dpi, with registration marks in a half-inch margin (gradients screened as halftone dots at the angle on the sheet).',
    job.embroidery ? `The stitch file is ${job.embroidery.files.dst} (Tajima, any machine) and ${job.embroidery.files.exp} (Melco); stitch-preview.png shows it sewn. Run a sew-out before production.` : '',
    job.factoryNote ? '' : '', job.factoryNote].filter(Boolean).join('\n') + '\n';
}

async function jobSheet(job, artworkPng) {
  const b = brandDoc({ title: `${job.name} · ${job.technique.name}`, kind: 'Artwork job file', ref: `${job.size.widthIn} × ${job.size.heightIn} in`, footerNote: 'Future Basics · artwork job file · colours as Pantone C; the factory confirms every match against a swatch book' });
  const { doc, L, CW } = b; let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(20).text(safe(job.name), L, y, { width: CW }); y = doc.y + 4;
  doc.fillColor(DIM).font('SG').fontSize(10.5).text(safe(`Made as ${job.technique.name}`), L, y, { width: CW }); y = doc.y + 14;
  const col = CW / 4;
  fact(b, 'Finished width', `${job.size.widthIn} in · ${job.size.widthMm} mm`, L, y, col); fact(b, 'Finished height', `${job.size.heightIn} in · ${job.size.heightMm} mm`, L + col, y, col);
  fact(b, 'Colours', String(job.colours.length), L + col * 2, y, col); fact(b, 'Garment colour', job.garmentColour || 'see the tech pack', L + col * 3, y, col); y += 44;
  // the artwork, on the right of the colour table
  try {
    const im = await sharp(artworkPng).flatten({ background: job.garmentColour && /^#[0-9a-f]{6}$/i.test(job.garmentColour) ? job.garmentColour : '#f3f2ee' }).resize({ width: 600, height: 600, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const bw = CW * .34, k = Math.min(bw / im.info.width, 170 / im.info.height), dw = im.info.width * k, dh = im.info.height * k;
    doc.rect(L + CW - bw, y, bw, 170).fill('#f3f2ee'); doc.image(im.data, L + CW - bw + (bw - dw) / 2, y + (170 - dh) / 2, { width: dw, height: dh }); doc.rect(L + CW - bw, y, bw, 170).lineWidth(.6).strokeColor(LINE).stroke();
  } catch {}
  const saveCW = b.CW; b.CW = CW * .62;
  table(b, [{ h: '#', w: .12, mono: true }, { h: 'Pantone C', w: .5, mono: true }, { h: 'Coverage', w: .38, align: 'right', mono: true }], job.colours.map(c => [String(c.n), { t: c.pantone || c.name, swatch: c.hex }, `${Math.round(c.coverage * 100)} %`]), { y, fontSize: 9.5 });
  b.CW = saveCW; y = Math.max(doc.y, y + 170) + 16;
  const rows = [];
  if (job.print) { const p = job.print; rows.push(['Process', `${p.process} · ${p.inkType}`], ['Screens', `${p.screens} (${job.colours.length} colour${job.colours.length === 1 ? '' : 's'}${p.underbase ? ' + white underbase' : ''})`], ['Mesh', `${p.meshCount} threads/in`], ['Halftone', p.halftone ? `${p.lpi} lpi, ${p.dotShape} dot; angles ${job.colours.map(c => `${c.n}: ${c.angle}°`).join(', ')} (the gradients and fades are screened on the films)` : 'none, solid spot colours'], ['Press order', (p.order || []).join(' → ')], ['Underbase', p.underbase ? `${p.underbaseFile}: white under every light colour, choked ${p.underbaseChokePt} pt, flash before the colours` : 'none'], ['Cure', p.cure]); }
  if (job.embroidery) { const e = job.embroidery; rows.push(['Stitch file', `${e.files.dst} (Tajima) · ${e.files.exp} (Melco), digitized by the Design Lab`], ['Stitches', `${e.stitches.toLocaleString('en-US')} · ${e.colourChanges} colour change${e.colourChanges === 1 ? '' : 's'} · ${e.trims} trims · about ${Math.round(e.minutes)} min a piece at 750 spm`], ['Sewn as', `${e.satinShapes} satin column${e.satinShapes === 1 ? '' : 's'}, ${e.fillShapes} tatami fill${e.fillShapes === 1 ? '' : 's'}; ${e.stitch} as the technique`], ['Sequence', e.sequence.map(t => `${t.n}: ${t.pantone || t.hex} (${t.stitches.toLocaleString('en-US')})`).join(' · ')], ['Thread', e.thread], ['Backing', e.backing], ['Underlay', e.underlay], ['Pull compensation', e.pullCompensation], ['Smallest satin column', `${e.minSatinMm} mm`]); }
  if (job.transfer) { const t = job.transfer; rows.push(['Print file', t.print], ['Finish', t.finish], ['Carrier', t.backing], ['Apply', t.apply], ['Bleed', t.bleed]); }
  if (job.patch) { const p = job.patch; rows.push(['Base', p.base], ['Cut line', p.cutLine], ['Edge', p.edge], ['Backing', p.backing], ['Size', p.sizeNote]); }
  if (job.wash) rows.push(['Note', job.wash.note]);
  if (job.factoryNote) rows.push(['Factory note', job.factoryNote]);
  if (job.designRules) rows.push(['Designed for', job.designRules]);
  if (rows.length) { doc.fillColor(INK).font('SG-B').fontSize(11).text('Settings', L, y); table(b, [{ h: 'Setting', w: .28, mono: true }, { h: 'Value', w: .72 }], rows, { y: doc.y + 6, fontSize: 9.5, head: false }); y = doc.y + 14; }
  if (job.warnings.length) { doc.fillColor('#a02a20').font('SG-B').fontSize(10).text('Check before you run it', L, y); doc.fillColor(INK).font('SG').fontSize(9.5); for (const wn of job.warnings) doc.text(safe('• ' + wn), L, doc.y + 3, { width: CW }); y = doc.y + 10; }
  doc.fillColor(DIM).font('SG').fontSize(8.5).text(safe(`Files: artwork-300dpi.png · ${job.colours.map(c => c.ink).join(' · ')}${job.colours.some(c => c.film) ? ' · ' + job.colours.map(c => c.film).filter(Boolean).join(' · ') : ''}${job.embroidery ? ` · ${job.embroidery.files.dst} · ${job.embroidery.files.exp} · stitch-preview.png` : ''}${job.print?.underbaseFile ? ' · underbase.png' : ''}${job.patch ? ' · cut-line.png' : ''}${job.transfer ? ' · artwork-mirrored-300dpi.png' : ''} · job.json`), L, y + 6, { width: CW });
  return b.finish();
}

export async function jobZip(png, opts) { const r = await jobFile(png, opts); return { ...r, zip: zip(r.files) }; }

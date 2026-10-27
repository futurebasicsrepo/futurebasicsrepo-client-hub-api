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
import { artColours, printCheck } from './art.js';
import { cleanRules } from './lab-library.js';
import { brandDoc, fact, table, safe, INK, DIM, LINE } from './brand-pdf.js';
import { zip } from './zip.js';

const DPI = 300, MAX_PX = 6000;
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
export async function jobFile(png, { name = 'Graphic', technique = null, widthIn = 4, garmentColour = '' } = {}) {
  const t = technique || { name: 'Screen print', kind: 'print', base: 'screen print', rules: {}, finish: {}, factoryNote: '', artGuide: '' };
  const rules = cleanRules(t.rules || {}, t.base), kind = t.kind || 'print';
  const src = sharp(png).ensureAlpha(); const meta = await src.metadata();
  const w = Math.max(.5, Math.min(rules.maxW || 40, Number(widthIn) || 4)), outW = Math.min(MAX_PX, Math.round(w * DPI)), outH = Math.round(outW * meta.height / meta.width);
  const h = r2(outH / DPI);
  const resized = await sharp(png).ensureAlpha().resize({ width: outW, height: outH, fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const { data, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height;
  // the colours, each with its Pantone, then every opaque pixel put with the nearest one
  const maxColours = Math.max(1, rules.maxColors || (kind === 'embroidery' ? 8 : 6));
  let colours = (await artColours(resized, { max: Math.min(maxColours, 12) })).map(c => ({ hex: c.hex, name: c.name, pantone: c.code, share: c.share }));
  if (!colours.length) colours = [{ hex: '#000000', name: 'black', pantone: 'PANTONE Black C', share: 1 }];
  for (const c of colours) if (lum(c.hex) > 245) c.pantone = 'White'; // paper white has no chip: it is white ink, or the garment showing through
  const rgb = colours.map(c => hexRgb(c.hex)), idx = new Uint8Array(N), counts = new Array(colours.length).fill(0); let opaque = 0;
  for (let p = 0, i = 0; p < N; p++, i += 4) {
    if (data[i + 3] < 128) { idx[p] = 255; continue; }
    opaque++; let best = 0, bd = Infinity;
    for (let c = 0; c < rgb.length; c++) { const d = (data[i] - rgb[c][0]) ** 2 + (data[i + 1] - rgb[c][1]) ** 2 + (data[i + 2] - rgb[c][2]) ** 2; if (d < bd) { bd = d; best = c; } }
    idx[p] = best; counts[best]++;
  }
  colours.forEach((c, i) => { c.coverage = opaque ? Math.round(counts[i] / opaque * 1000) / 1000 : 0; });
  const coverage = N ? opaque / N : 0, areaIn2 = r2(w * h * coverage);
  const files = [{ name: 'artwork-300dpi.png', data: resized }];
  const layer = (keep, { colour = null, film = false } = {}) => {
    const out = Buffer.alloc(N * (film ? 3 : 4), film ? 255 : 0);
    for (let p = 0, i = 0; p < N; p++, i += 4) {
      if (!keep(p)) continue;
      if (film) { out[p * 3] = out[p * 3 + 1] = out[p * 3 + 2] = 0; continue; }
      const c = colour || [data[i], data[i + 1], data[i + 2]]; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = data[i + 3];
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: film ? 3 : 4 } }).png({ compressionLevel: 6 }).toBuffer();
  };
  const masks = []; // one per colour: what each ink, thread or film holds
  for (let c = 0; c < colours.length; c++) {
    if (!counts[c]) continue;
    const n = masks.length + 1, tag = `${String(n).padStart(2, '0')}-${slug(colours[c].pantone || colours[c].name)}`;
    masks.push({ n, colour: colours[c], ink: `ink-${tag}.png`, film: `film-${tag}.png` });
    files.push({ name: `ink-${tag}.png`, data: await layer(p => idx[p] === c, { colour: rgb[c] }) }, { name: `film-${tag}.png`, data: await layer(p => idx[p] === c, { film: true }) });
  }
  const check = printCheck({ widthPx: meta.width, heightPx: meta.height, widthIn: w });
  const job = { name, technique: { name: t.name, kind, base: t.base }, size: { widthIn: r2(w), heightIn: h, widthMm: mm(w), heightMm: mm(h), px: [info.width, info.height], dpi: DPI }, garmentColour: garmentColour || '', coverage: r2(coverage), areaIn2, colours: masks.map(m => ({ n: m.n, pantone: m.colour.pantone, hex: m.colour.hex, name: m.colour.name, coverage: m.colour.coverage, ink: m.ink, film: m.film })), sourceCheck: check, factoryNote: t.factoryNote || '', designRules: t.artGuide || '', rules, warnings: [] };
  if (check.level !== 'ok') job.warnings.push(check.message);
  if (rules.maxColors && masks.length > rules.maxColors) job.warnings.push(`${masks.length} colours; this technique is usually priced for ${rules.maxColors}. Fewer colours cost less.`);
  if (w > rules.maxW || h > rules.maxH) job.warnings.push(`${r2(w)} × ${h} in is over the usual ${rules.maxW} × ${rules.maxH} in for this technique.`);
  if (kind === 'print') {
    const s = printSettings(t); job.print = s;
    const dark = garmentColour ? lum(garmentColour) < 128 : true;
    if (s.underbase && dark) { files.push({ name: 'underbase.png', data: await layer(p => idx[p] !== 255 && lum(colours[idx[p]].hex) > 40, { film: true }) }); job.print.underbaseFile = 'underbase.png'; }
    else job.print.underbase = false;
    job.print.screens = masks.length + (job.print.underbase ? 1 : 0);
  } else if (kind === 'embroidery') {
    const s = embroiderySettings(t, rules); job.embroidery = { ...s, stitchEstimate: Math.round(areaIn2 * s.density / 100) * 100, threads: masks.map(m => ({ n: m.n, pantone: m.colour.pantone, hex: m.colour.hex, thread: '' })) };
    if (job.embroidery.stitchEstimate > 15000) job.warnings.push(`About ${job.embroidery.stitchEstimate.toLocaleString()} stitches: heavy for a knit; consider a smaller fill or a patch.`);
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
    'job-sheet.pdf is the one page to pin up. job.json holds the same as data. Every ink-*.png is one colour on a clear ground; every film-*.png is its black-on-white film positive at 300 dpi.',
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
  if (job.print) { const p = job.print; rows.push(['Process', `${p.process} · ${p.inkType}`], ['Screens', `${p.screens} (${job.colours.length} colour${job.colours.length === 1 ? '' : 's'}${p.underbase ? ' + white underbase' : ''})`], ['Mesh', `${p.meshCount} threads/in`], ['Halftone', p.halftone ? `${p.lpi} lpi · ${p.angle}° · ${p.dotShape} dot` : 'none, solid spot colours'], ['Underbase', p.underbase ? `${p.underbaseFile}: white under every light colour, choked ${p.underbaseChokePt} pt, flash before the colours` : 'none'], ['Cure', p.cure]); }
  if (job.embroidery) { const e = job.embroidery; rows.push(['Stitch', e.stitch], ['Thread', e.thread], ['Stitch count', `about ${e.stitchEstimate.toLocaleString()} (density ${e.density} per sq in over ${job.areaIn2} sq in)`], ['Backing', e.backing], ['Underlay', e.underlay], ['Pull compensation', e.pullCompensation], ['Smallest satin column', `${e.minSatinMm} mm`], ['Threads', e.threads.map(t => `${t.n}: ${t.pantone}`).join(' · ')]); }
  if (job.transfer) { const t = job.transfer; rows.push(['Print file', t.print], ['Finish', t.finish], ['Carrier', t.backing], ['Apply', t.apply], ['Bleed', t.bleed]); }
  if (job.patch) { const p = job.patch; rows.push(['Base', p.base], ['Cut line', p.cutLine], ['Edge', p.edge], ['Backing', p.backing], ['Size', p.sizeNote]); }
  if (job.wash) rows.push(['Note', job.wash.note]);
  if (job.factoryNote) rows.push(['Factory note', job.factoryNote]);
  if (job.designRules) rows.push(['Designed for', job.designRules]);
  if (rows.length) { doc.fillColor(INK).font('SG-B').fontSize(11).text('Settings', L, y); table(b, [{ h: 'Setting', w: .28, mono: true }, { h: 'Value', w: .72 }], rows, { y: doc.y + 6, fontSize: 9.5, head: false }); y = doc.y + 14; }
  if (job.warnings.length) { doc.fillColor('#a02a20').font('SG-B').fontSize(10).text('Check before you run it', L, y); doc.fillColor(INK).font('SG').fontSize(9.5); for (const wn of job.warnings) doc.text(safe('• ' + wn), L, doc.y + 3, { width: CW }); y = doc.y + 10; }
  doc.fillColor(DIM).font('SG').fontSize(8.5).text(safe(`Files: artwork-300dpi.png · ${job.colours.map(c => c.ink).join(' · ')} · ${job.colours.map(c => c.film).join(' · ')}${job.print?.underbaseFile ? ' · underbase.png' : ''}${job.patch ? ' · cut-line.png' : ''}${job.transfer ? ' · artwork-mirrored-300dpi.png' : ''} · job.json`), L, y + 6, { width: CW });
  return b.finish();
}

export async function jobZip(png, opts) { const r = await jobFile(png, opts); return { ...r, zip: zip(r.files) }; }

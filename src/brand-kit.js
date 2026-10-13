// The Future Basics brand kit: the wordmark and the cue mark (a line and a dot) in every colour and file type, app icons and favicons, social and email images, the colours, the fonts and a short guide,
// all made from the one wordmark file (src/icons/wordmark-white.svg) and the fonts the hub already ships, so nothing here can drift from what the hub itself uses.
//   * Open to every signed-in staff member (an @thefuturebasics.com email), the same as the other work pages.
//   * Each file is made the first time it is asked for and kept in memory for the life of the server.
//   * Web files: SVG, PNG, WebP, ICO. Print files: PDF (vector, RGB and one-colour CMYK black), SVG (vector), PNG and TIFF at 300 dpi, JPG on white.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { brandDoc, table, INK, DIM, LINE, FOG, CUE, GREEN, RED } from './brand-pdf.js';
import { zip } from './zip.js';
import './pantone-c.js';

const read = rel => readFileSync(new URL(rel, import.meta.url));
const WORD_SVG = read('./icons/wordmark-white.svg').toString('utf8');
const D = /\sd="([^"]+)"/.exec(WORD_SVG)[1];
const VB = (m => [Number(m[1]), Number(m[2])])(/viewBox="0 0 (\d+) (\d+)"/.exec(WORD_SVG));   // 1062 × 90
const [VW, VH] = VB;

// ---------- colours ----------
export const COLORS = [
  { id: 'ink', name: 'Ink', hex: '#141416', use: 'Text, dark backgrounds, headers. The main colour.' },
  { id: 'paper', name: 'Paper', hex: '#FFFFFF', use: 'Backgrounds, and text on Ink.' },
  { id: 'fog', name: 'Fog', hex: '#F5F5F2', use: 'Page backgrounds and quiet panels.' },
  { id: 'dim', name: 'Dim', hex: '#727278', use: 'Secondary text and small labels.' },
  { id: 'cue', name: 'Cue', hex: '#4BFF9A', use: 'The one bright accent on screens: a dot, a highlight, a button on Ink.' },
  { id: 'cue-print', name: 'Cue (print)', hex: '#2EDC83', use: 'Cue in PDFs and print, where the screen green is too light.' },
  { id: 'deep-green', name: 'Deep green', hex: '#17603A', use: 'Success and "paid", and green text on light backgrounds.' },
  { id: 'alert', name: 'Alert red', hex: '#A02A20', use: 'Errors and overdue. Never decoration.' }
];
const rgbOf = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
// A plain conversion, good for a first look: a printer's proof or the Pantone chip decides the real thing.
const cmykOf = hex => { const [r, g, b] = rgbOf(hex).map(v => v / 255), k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100]; return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map(v => Math.round(v * 100)); };
export const colorFacts = () => COLORS.map(c => ({ ...c, rgb: rgbOf(c.hex), cmyk: cmykOf(c.hex), pantone: c.id === 'paper' ? '' : globalThis.FBPantone?.nearest(c.hex, { kinds: [0, 1] })[0]?.code || '' }));

// ---------- the wordmark, drawn ----------
const wordSvg = ({ fill = INK, bg = null, pad = 0 } = {}) => {
  const W = VW + pad * 2, H = VH + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}<path fill-rule="evenodd" fill="${fill}"${pad ? ` transform="translate(${pad} ${pad})"` : ''} d="${D}"/></svg>`;
};
// the wordmark centred on a canvas of any shape, taking `frac` of its width
const canvasSvg = ({ w, h, bg = null, fill = '#FFFFFF', frac = .72 }) => {
  const s = (w * frac) / VW, x = (w - VW * s) / 2, y = (h - VH * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}<path fill-rule="evenodd" fill="${fill}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${s.toFixed(5)})" d="${D}"/></svg>`;
};
const svgSize = svg => { const m = /width="([\d.]+)" height="([\d.]+)"/.exec(svg); return [Number(m[1]), Number(m[2])]; };
const raster = (svg, width) => { const [w] = svgSize(svg); return sharp(Buffer.from(svg), { density: Math.max(72, Math.ceil(72 * width / w)) }).resize({ width }); };
const png = async (svg, width, dpi = 72) => raster(svg, width).png({ compressionLevel: 9 }).withMetadata({ density: dpi }).toBuffer();
const webp = async (svg, width) => raster(svg, width).webp({ lossless: true }).toBuffer();
const jpg = async (svg, width, dpi = 72) => raster(svg, width).flatten({ background: '#FFFFFF' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).withMetadata({ density: dpi }).toBuffer();
const tiff = async (svg, width, dpi = 300) => raster(svg, width).tiff({ compression: 'lzw', xres: dpi / 25.4, yres: dpi / 25.4 }).toBuffer();
// An .ico that holds PNG pictures (every browser and Windows since Vista read these).
const ico = async (svg, sizes = [16, 32, 48]) => {
  const imgs = await Promise.all(sizes.map(s => png(svg, s)));
  const head = Buffer.alloc(6 + 16 * imgs.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
  let off = head.length; imgs.forEach((b, i) => { const o = 6 + 16 * i, s = sizes[i]; head[o] = s >= 256 ? 0 : s; head[o + 1] = head[o]; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(b.length, o + 8); head.writeUInt32LE(off, o + 12); off += b.length; });
  return Buffer.concat([head, ...imgs]);
};
// A vector PDF of the wordmark, 8 inches wide (it scales to anything). fill: a hex colour, or a CMYK array [c, m, y, k] in 0-100 for one-colour print.
const pdf = fill => new Promise((resolve, reject) => {
  const w = 576, s = w / VW, h = VH * s, doc = new PDFDocument({ size: [w, h], margin: 0, compress: false, info: { Title: 'Future Basics wordmark', Author: 'Future Basics' } }), chunks = [];
  doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject);
  doc.save().scale(s).path(D).fillColor(fill).fill('even-odd').restore(); doc.end();
});

// ---------- the cue mark: a line that has been running, and a dot that has arrived ----------
// The mark is a 304 × 40 box: a 240 × 20 line with round ends, a gap of 24, and a dot 40 across. The line is Ink (White on dark); the dot is always Cue.
// Squares get a stouter, shorter cut (the same weights, a shorter run) so it still reads as a favicon.
const MK = { W: 304, H: 40, line: { x: 0, y: 10, w: 240, h: 20 }, dot: { cx: 284, cy: 20, r: 20 } };
const IC = { line: { x: 154, y: 452, w: 420, h: 120 }, dot: { cx: 750, cy: 512, r: 120 } };
const markShapes = (g, line, dot) => `<rect x="${g.line.x}" y="${g.line.y}" width="${g.line.w}" height="${g.line.h}" rx="${g.line.h / 2}" fill="${line}"/><circle cx="${g.dot.cx}" cy="${g.dot.cy}" r="${g.dot.r}" fill="${dot}"/>`;
const CUE_HEX = '#4BFF9A';
const markSvg = ({ line = INK, dot = CUE_HEX, bg = null, pad = 0 } = {}) => { const W = MK.W + pad * 2, H = MK.H + pad * 2; return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}<g${pad ? ` transform="translate(${pad} ${pad})"` : ''}>${markShapes(MK, line, dot)}</g></svg>`; };
// the compact cut on a square (or any canvas), `frac` of the canvas width
const iconSvg = ({ w = 1024, h = 1024, bg = INK, line = '#FFFFFF', dot = CUE_HEX, frac = .70 } = {}) => { const spanX = IC.dot.cx + IC.dot.r - IC.line.x, s = (w * frac) / spanX, cx = (IC.line.x + IC.dot.cx + IC.dot.r) / 2, tx = w / 2 - cx * s, ty = h / 2 - 512 * s; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})">${markShapes(IC, line, dot)}</g></svg>`; };
// the wordmark with the cue under its first letters, as the console headers draw it: the line is about a third of the wordmark wide
const LOCK = (() => { const s = (VW * .32) / MK.W, gap = 36, H = VH + gap + MK.H * s; return { s, gap, W: VW, H: Math.round(H) }; })();
const lockupSvg = ({ word = INK, line = INK, dot = CUE_HEX, bg = null, pad = 0 } = {}) => { const W = LOCK.W + pad * 2, H = LOCK.H + pad * 2; return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${bg ? `<rect width="${W}" height="${H}" fill="${bg}"/>` : ''}<g transform="translate(${pad} ${pad})"><path fill-rule="evenodd" fill="${word}" d="${D}"/><g transform="translate(0 ${VH + LOCK.gap}) scale(${LOCK.s.toFixed(5)})">${markShapes(MK, line, dot)}</g></g></svg>`; };
// the lockup centred on a canvas of any shape, `frac` of the canvas width
const lockupCanvasSvg = ({ w, h, bg = INK, word = '#FFFFFF', line = '#FFFFFF', dot = CUE_HEX, frac = .5 }) => { const s = (w * frac) / LOCK.W, tx = (w - LOCK.W * s) / 2, ty = (h - LOCK.H * s) / 2; return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})"><path fill-rule="evenodd" fill="${word}" d="${D}"/><g transform="translate(0 ${VH + LOCK.gap}) scale(${LOCK.s.toFixed(5)})">${markShapes(MK, line, dot)}</g></g></svg>`; };
// Moving: a bright run travels the line toward the dot, and the dot pulses when it arrives. Plain SVG with CSS, so it plays as an <img> and stops for people who ask for less motion.
const loopSvg = ({ line = INK, dot = CUE_HEX } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${MK.W}" height="${MK.H}" viewBox="0 0 ${MK.W} ${MK.H}" role="img" aria-label="Loading"><style>.t{fill:${line};opacity:.25}.r{fill:${line};animation:run 2.2s cubic-bezier(.55,0,.25,1) infinite}.d{fill:${dot};transform-box:fill-box;transform-origin:center;animation:pulse 2.2s ease-in-out infinite}@keyframes run{0%{transform:translateX(-90px)}62%,100%{transform:translateX(240px)}}@keyframes pulse{0%,56%{transform:scale(1)}68%{transform:scale(1.3)}84%,100%{transform:scale(1)}}@media (prefers-reduced-motion:reduce){.r{animation:none;opacity:0}.t{opacity:1}.d{animation:none}}</style><defs><clipPath id="c"><rect x="0" y="10" width="240" height="20" rx="10"/></clipPath></defs><rect class="t" x="0" y="10" width="240" height="20" rx="10"/><g clip-path="url(#c)"><rect class="r" x="0" y="10" width="90" height="20" rx="10"/></g><circle class="d" cx="284" cy="20" r="20"/></svg>`;
// one frame of that loop, drawn still, for the GIF
const loopFrameSvg = ({ w, h, bg, line, dot, t }) => {
  const e = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2, k = Math.min(t / .62, 1), x = -90 + e(k) * 330, pulse = t > .56 && t < .84 ? 1 + .3 * Math.sin(Math.PI * (t - .56) / .28) : 1;
  const s = (w * .7) / MK.W, tx = (w - MK.W * s) / 2, ty = (h - MK.H * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(5)})"><defs><clipPath id="c"><rect x="0" y="10" width="240" height="20" rx="10"/></clipPath></defs><rect x="0" y="10" width="240" height="20" rx="10" fill="${line}" opacity=".25"/><g clip-path="url(#c)"><rect x="${x.toFixed(2)}" y="10" width="90" height="20" rx="10" fill="${line}"/></g><circle cx="284" cy="20" r="${(20 * pulse).toFixed(2)}" fill="${dot}"/></g></svg>`;
};
const gif = async ({ bg, line, dot = CUE_HEX, w = 480, h = 160, n = 36 }) => {
  const frames = []; for (let i = 0; i < n; i++) frames.push(await sharp(Buffer.from(loopFrameSvg({ w, h, bg, line, dot, t: i / n }))).ensureAlpha().raw().toBuffer());
  return sharp(Buffer.concat(frames), { raw: { width: w, height: h * n, channels: 4, pageHeight: h } }).gif({ loop: 0, delay: Array(n).fill(55) }).toBuffer();
};
// vector PDFs of the mark and the lockup (drawn, not traced), 8 inches wide
const rrect = (doc, x, y, w, h) => doc.roundedRect(x, y, w, h, h / 2);
const pdfDraw = (wpt, hpt, draw) => new Promise((resolve, reject) => { const doc = new PDFDocument({ size: [wpt, hpt], margin: 0, compress: false, info: { Title: 'Future Basics', Author: 'Future Basics' } }), chunks = []; doc.on('data', c => chunks.push(c)); doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); draw(doc); doc.end(); });
const markPdf = (line, dot) => { const s = 576 / MK.W; return pdfDraw(576, MK.H * s, doc => { doc.save().scale(s); rrect(doc, MK.line.x, MK.line.y, MK.line.w, MK.line.h).fillColor(line).fill(); doc.circle(MK.dot.cx, MK.dot.cy, MK.dot.r).fillColor(dot).fill(); doc.restore(); }); };
const lockupPdf = (word, line, dot) => { const s = 576 / LOCK.W, ls = LOCK.s; return pdfDraw(576, LOCK.H * s, doc => { doc.save().scale(s).path(D).fillColor(word).fill('even-odd').restore(); doc.save().scale(s).translate(0, VH + LOCK.gap).scale(ls); rrect(doc, MK.line.x, MK.line.y, MK.line.w, MK.line.h).fillColor(line).fill(); doc.circle(MK.dot.cx, MK.dot.cy, MK.dot.r).fillColor(dot).fill(); doc.restore(); }); };

// ---------- the files ----------
// Each: { file, group, title, note, kind: 'web' | 'print' | 'both', make: () => Promise<Buffer>, mime, on: preview background }
const MIME = { svg: 'image/svg+xml', gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', tiff: 'image/tiff', ico: 'image/x-icon', pdf: 'application/pdf', css: 'text/css', json: 'application/json', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain' };
export const GROUPS = [
  { id: 'logo', title: 'Wordmark', note: 'The Future Basics wordmark. Use the colour that reads best on the background: Ink on light, White on dark. Use the vector files (SVG, PDF) whenever you can; they never blur.' },
  { id: 'mark', title: 'The mark', note: 'A line that has been running, and a dot that has arrived. It stands for the handoff: work moving from one pair of hands to the next. Use it where the name is already nearby or the space is small, and in motion for anything loading or in progress.' },
  { id: 'icon', title: 'App icon and favicons', note: 'The mark on a square, in the compact cut that still reads at 16 px. For app stores, the home screen, browser tabs and anywhere a square is needed.' },
  { id: 'social', title: 'Social and email', note: 'Sized and ready to upload: profile pictures, link previews, banners and the email signature logo.' },
  { id: 'colour', title: 'Colour files', note: 'The palette as CSS variables and as JSON, for developers and for design tools.' },
  { id: 'font', title: 'Fonts', note: 'Space Grotesk for words and IBM Plex Mono for labels and numbers. Both are free to use anywhere under the SIL Open Font License.' },
  { id: 'guide', title: 'Brand guide', note: 'A short PDF with the logo rules, the colours and the type, to send to a printer, a partner or a new hire.' }
];
const LOGOS = [
  { id: 'ink', name: 'Ink', fill: INK, on: '#FFFFFF' },
  { id: 'white', name: 'White', fill: '#FFFFFF', on: INK },
  { id: 'black', name: 'Black', fill: '#000000', on: '#FFFFFF', cmyk: [0, 0, 0, 100] },
  { id: 'cue', name: 'Cue green', fill: '#4BFF9A', on: INK }
];
const ICONS = [
  { id: 'ink', name: 'on Ink', bg: INK, line: '#FFFFFF', dot: '#4BFF9A' },
  { id: 'paper', name: 'on Paper', bg: '#FFFFFF', line: INK, dot: '#4BFF9A' },
  { id: 'cue', name: 'on Cue', bg: '#4BFF9A', line: INK, dot: INK }
];
const WORD_SQUARES = [
  { id: 'ink', name: 'on Ink', bg: INK, fill: '#FFFFFF' },
  { id: 'paper', name: 'on Paper', bg: '#FFFFFF', fill: INK }
];

const ASSETS = [];
const add = a => ASSETS.push({ mime: MIME[a.file.split('.').pop()], ...a });
// wordmark
for (const l of LOGOS) {
  const name = `future-basics-wordmark-${l.id}`, svg = wordSvg({ fill: l.fill }), panel = wordSvg({ fill: l.fill, pad: 0 });
  add({ file: `${name}.svg`, group: 'logo', kind: 'both', title: `${l.name} · SVG`, note: 'Vector. Web and print.', on: l.on, make: async () => Buffer.from(svg) });
  add({ file: `${name}-${l.cmyk ? 'cmyk' : 'rgb'}.pdf`, group: 'logo', kind: 'print', title: `${l.name} · PDF`, note: l.cmyk ? 'Vector, CMYK black (K 100). For one-colour print.' : 'Vector, RGB. For documents and print.', on: l.on, make: () => pdf(l.cmyk || l.fill) });
  add({ file: `${name}-600.png`, group: 'logo', kind: 'web', title: `${l.name} · PNG 600 px`, note: 'Transparent. Web and email.', on: l.on, make: () => png(panel, 600) });
  add({ file: `${name}-1200.png`, group: 'logo', kind: 'web', title: `${l.name} · PNG 1200 px`, note: 'Transparent. Sharp on high-density screens.', on: l.on, make: () => png(panel, 1200) });
  add({ file: `${name}-2400.png`, group: 'logo', kind: 'web', title: `${l.name} · PNG 2400 px`, note: 'Transparent. Slides and large banners.', on: l.on, make: () => png(panel, 2400) });
  add({ file: `${name}.webp`, group: 'logo', kind: 'web', title: `${l.name} · WebP`, note: 'Transparent, small. For websites.', on: l.on, make: () => webp(panel, 1200) });
  add({ file: `${name}-300dpi.png`, group: 'logo', kind: 'print', title: `${l.name} · PNG 300 dpi`, note: '4000 px wide, about 13 in at 300 dpi. Transparent.', on: l.on, make: () => png(panel, 4000, 300) });
  add({ file: `${name}-300dpi.tiff`, group: 'logo', kind: 'print', title: `${l.name} · TIFF 300 dpi`, note: '4000 px wide, transparent. For print software that wants TIFF.', on: l.on, make: () => tiff(panel, 4000, 300) });
  if (l.id === 'ink' || l.id === 'black') add({ file: `${name}-on-white-300dpi.jpg`, group: 'logo', kind: 'print', title: `${l.name} on white · JPG 300 dpi`, note: '4000 px wide, white background. For software that cannot read transparency.', on: l.on, make: () => jpg(panel, 4000, 300) });
}
add({ file: 'future-basics-wordmark-white-on-ink.png', group: 'logo', kind: 'web', title: 'White on Ink panel · PNG', note: 'White wordmark on an Ink panel with room around it. Drop it onto any background.', on: INK, make: () => png(wordSvg({ fill: '#FFFFFF', bg: INK, pad: 180 }), 1600) });
add({ file: 'future-basics-wordmark-white-on-ink-300dpi.jpg', group: 'logo', kind: 'print', title: 'White on Ink panel · JPG 300 dpi', note: 'Ready to print as it is: Ink panel, white wordmark.', on: INK, make: () => jpg(wordSvg({ fill: '#FFFFFF', bg: INK, pad: 180 }), 4000, 300) });
// the mark
const MARKS = [
  { id: 'ink', name: 'Ink line, Cue dot', line: INK, dot: CUE_HEX, on: '#FFFFFF' },
  { id: 'white', name: 'White line, Cue dot', line: '#FFFFFF', dot: CUE_HEX, on: INK },
  { id: 'black', name: 'Black (one colour)', line: '#000000', dot: '#000000', on: '#FFFFFF', cmyk: [0, 0, 0, 100] },
  { id: 'reverse', name: 'White (one colour)', line: '#FFFFFF', dot: '#FFFFFF', on: INK }
];
for (const m of MARKS) {
  const name = `future-basics-mark-${m.id}`, svg = markSvg({ line: m.line, dot: m.dot }), px = markSvg({ line: m.line, dot: m.dot, pad: 8 });
  add({ file: `${name}.svg`, group: 'mark', kind: 'both', title: `${m.name} · SVG`, note: 'Vector. Web and print.', on: m.on, make: async () => Buffer.from(svg) });
  add({ file: `${name}-${m.cmyk ? 'cmyk' : 'rgb'}.pdf`, group: 'mark', kind: 'print', title: `${m.name} · PDF`, note: m.cmyk ? 'Vector, CMYK black (K 100). For one-colour print.' : 'Vector, RGB. For documents and print.', on: m.on, make: () => markPdf(m.cmyk || m.line, m.cmyk || m.dot) });
  add({ file: `${name}-600.png`, group: 'mark', kind: 'web', title: `${m.name} · PNG 600 px`, note: 'Transparent. Web and email.', on: m.on, make: () => png(px, 600) });
  add({ file: `${name}-1200.png`, group: 'mark', kind: 'web', title: `${m.name} · PNG 1200 px`, note: 'Transparent. Sharp on high-density screens.', on: m.on, make: () => png(px, 1200) });
  add({ file: `${name}.webp`, group: 'mark', kind: 'web', title: `${m.name} · WebP`, note: 'Transparent, small. For websites.', on: m.on, make: () => webp(px, 1200) });
  add({ file: `${name}-300dpi.png`, group: 'mark', kind: 'print', title: `${m.name} · PNG 300 dpi`, note: '4000 px wide. Transparent.', on: m.on, make: () => png(px, 4000, 300) });
  add({ file: `${name}-300dpi.tiff`, group: 'mark', kind: 'print', title: `${m.name} · TIFF 300 dpi`, note: '4000 px wide, transparent. For print software that wants TIFF.', on: m.on, make: () => tiff(px, 4000, 300) });
  if (m.id === 'ink' || m.id === 'black') add({ file: `${name}-on-white-300dpi.jpg`, group: 'mark', kind: 'print', title: `${m.name} on white · JPG 300 dpi`, note: '4000 px wide, white background.', on: m.on, make: () => jpg(px, 4000, 300) });
}
// the wordmark with the cue under it
for (const l of [{ id: 'ink', name: 'Ink', word: INK, line: INK, on: '#FFFFFF' }, { id: 'white', name: 'White', word: '#FFFFFF', line: '#FFFFFF', on: INK }]) {
  const name = `future-basics-lockup-${l.id}`, svg = lockupSvg({ word: l.word, line: l.line }), px = lockupSvg({ word: l.word, line: l.line, pad: 0 });
  add({ file: `${name}.svg`, group: 'mark', kind: 'both', title: `Wordmark + cue, ${l.name} · SVG`, note: 'The wordmark with the cue under it, as the console headers draw it. Vector.', on: l.on, make: async () => Buffer.from(svg) });
  add({ file: `${name}-rgb.pdf`, group: 'mark', kind: 'print', title: `Wordmark + cue, ${l.name} · PDF`, note: 'Vector, RGB.', on: l.on, make: () => lockupPdf(l.word, l.line, CUE_HEX) });
  add({ file: `${name}-1200.png`, group: 'mark', kind: 'web', title: `Wordmark + cue, ${l.name} · PNG 1200 px`, note: 'Transparent.', on: l.on, make: () => png(px, 1200) });
  add({ file: `${name}-2400.png`, group: 'mark', kind: 'web', title: `Wordmark + cue, ${l.name} · PNG 2400 px`, note: 'Transparent.', on: l.on, make: () => png(px, 2400) });
  add({ file: `${name}-300dpi.png`, group: 'mark', kind: 'print', title: `Wordmark + cue, ${l.name} · PNG 300 dpi`, note: '4000 px wide. Transparent.', on: l.on, make: () => png(px, 4000, 300) });
}
// moving
add({ file: 'future-basics-mark-loop-on-light.svg', group: 'mark', kind: 'web', title: 'Moving mark for light backgrounds · SVG', note: 'Animated. Use it as an image on any web page, in an app or in a deck that plays SVG. Still when someone has asked for less motion.', on: '#FFFFFF', make: async () => Buffer.from(loopSvg({ line: INK })) });
add({ file: 'future-basics-mark-loop-on-dark.svg', group: 'mark', kind: 'web', title: 'Moving mark for dark backgrounds · SVG', note: 'Animated, with a white line.', on: INK, make: async () => Buffer.from(loopSvg({ line: '#FFFFFF' })) });
add({ file: 'future-basics-mark-loop-on-ink.gif', group: 'mark', kind: 'web', title: 'Moving mark on Ink · GIF', note: 'For email, Slack, slides and anywhere an animated SVG will not play. 480 × 160.', on: INK, make: () => gif({ bg: INK, line: '#FFFFFF' }) });
add({ file: 'future-basics-mark-loop-on-white.gif', group: 'mark', kind: 'web', title: 'Moving mark on white · GIF', note: 'The same on white. 480 × 160.', on: '#FFFFFF', make: () => gif({ bg: '#FFFFFF', line: INK }) });
// icons
for (const i of ICONS) {
  const svg = iconSvg({ w: 1024, h: 1024, bg: i.bg, line: i.line, dot: i.dot });
  add({ file: `future-basics-icon-${i.id}.svg`, group: 'icon', kind: 'both', title: `App icon ${i.name} · SVG`, note: 'Vector, 1024 × 1024.', on: '#E9E9E4', make: async () => Buffer.from(svg) });
  add({ file: `future-basics-icon-${i.id}-1024.png`, group: 'icon', kind: 'both', title: `App icon ${i.name} · PNG 1024`, note: 'For app stores and large uses.', on: '#E9E9E4', make: () => png(svg, 1024) });
  add({ file: `future-basics-icon-${i.id}-512.png`, group: 'icon', kind: 'web', title: `App icon ${i.name} · PNG 512`, note: 'Web apps and listings.', on: '#E9E9E4', make: () => png(svg, 512) });
}
// the name on a square, for places that need the words (kept from before the mark)
for (const i of WORD_SQUARES) {
  const svg = canvasSvg({ w: 1024, h: 1024, bg: i.bg, fill: i.fill, frac: .72 });
  add({ file: `future-basics-wordmark-square-${i.id}-1024.png`, group: 'icon', kind: 'both', title: `Name on a square ${i.name} · PNG 1024`, note: 'The wordmark centred on a square. Too fine for a favicon; use it where it can be read.', on: '#E9E9E4', make: () => png(svg, 1024) });
}
const ink1024 = iconSvg({ w: 1024, h: 1024, bg: INK, line: '#FFFFFF', dot: CUE_HEX });
add({ file: 'favicon.ico', group: 'icon', kind: 'web', title: 'Favicon · ICO', note: '16, 32 and 48 px in one file. Put it at the root of a site.', on: '#E9E9E4', make: () => ico(ink1024) });
add({ file: 'favicon-32.png', group: 'icon', kind: 'web', title: 'Favicon · PNG 32', note: 'Browser tab.', on: '#E9E9E4', make: () => png(ink1024, 32) });
add({ file: 'favicon-16.png', group: 'icon', kind: 'web', title: 'Favicon · PNG 16', note: 'Smallest browser tab.', on: '#E9E9E4', make: () => png(ink1024, 16) });
add({ file: 'apple-touch-icon-180.png', group: 'icon', kind: 'web', title: 'Apple touch icon · 180', note: 'When someone adds a page to their iPhone home screen.', on: '#E9E9E4', make: () => png(ink1024, 180) });
add({ file: 'icon-192.png', group: 'icon', kind: 'web', title: 'Web app icon · 192', note: 'Android home screen and web app manifests.', on: '#E9E9E4', make: () => png(ink1024, 192) });
add({ file: 'icon-maskable-512.png', group: 'icon', kind: 'web', title: 'Maskable icon · 512', note: 'Extra margin so Android can crop it to a circle or rounded square.', on: '#E9E9E4', make: () => png(iconSvg({ w: 1024, h: 1024, bg: INK, line: '#FFFFFF', dot: CUE_HEX, frac: .46 }), 512) });
// social and email
const sq = (bg, fill) => canvasSvg({ w: 1080, h: 1080, bg, fill, frac: .66 });
add({ file: 'profile-picture-ink-1080.png', group: 'social', kind: 'web', title: 'Profile picture · Ink · 1080', note: 'The mark. LinkedIn, Instagram, X, Facebook, YouTube. Platforms crop to a circle: the mark stays inside it.', on: '#E9E9E4', make: () => png(iconSvg({ w: 1080, h: 1080, bg: INK, line: '#FFFFFF', dot: CUE_HEX, frac: .56 }), 1080) });
add({ file: 'profile-picture-paper-1080.png', group: 'social', kind: 'web', title: 'Profile picture · Paper · 1080', note: 'The mark on white.', on: '#E9E9E4', make: () => png(iconSvg({ w: 1080, h: 1080, bg: '#FFFFFF', line: INK, dot: CUE_HEX, frac: .56 }), 1080) });
add({ file: 'profile-picture-name-ink-1080.png', group: 'social', kind: 'web', title: 'Profile picture with the name · Ink · 1080', note: 'The wordmark, for a page where the name needs to be said.', on: '#E9E9E4', make: () => png(sq(INK, '#FFFFFF'), 1080) });
add({ file: 'link-preview-1200x630.png', group: 'social', kind: 'web', title: 'Link preview · 1200 × 630', note: 'The picture shown when a link is shared (Open Graph). Wordmark with the cue.', on: '#E9E9E4', make: () => png(lockupCanvasSvg({ w: 1200, h: 630, frac: .5 }), 1200) });
add({ file: 'linkedin-banner-1584x396.png', group: 'social', kind: 'web', title: 'LinkedIn banner · 1584 × 396', note: 'Company page and profile cover.', on: '#E9E9E4', make: () => png(lockupCanvasSvg({ w: 1584, h: 396, frac: .38 }), 1584) });
add({ file: 'x-header-1500x500.png', group: 'social', kind: 'web', title: 'X header · 1500 × 500', note: 'Profile header.', on: '#E9E9E4', make: () => png(lockupCanvasSvg({ w: 1500, h: 500, frac: .4 }), 1500) });
add({ file: 'email-signature-logo-ink-480.png', group: 'social', kind: 'web', title: 'Email signature logo · 480', note: 'Show it 240 px wide (this is double that, so it stays sharp). Ink, transparent.', on: '#FFFFFF', make: () => png(wordSvg({ fill: INK }), 480) });
add({ file: 'email-signature-logo-white-480.png', group: 'social', kind: 'web', title: 'Email signature logo, white · 480', note: 'For a dark email theme or a dark signature block.', on: INK, make: () => png(wordSvg({ fill: '#FFFFFF' }), 480) });
// colour files
const cssText = () => `/* Future Basics colours. Use these names so everything stays the same. */\n:root{\n${COLORS.map(c => `  --fb-${c.id}: ${c.hex.toLowerCase()};`).join('\n')}\n}\n`;
const jsonText = () => JSON.stringify({ name: 'Future Basics', colors: colorFacts().map(c => ({ id: c.id, name: c.name, hex: c.hex, rgb: c.rgb, cmykApprox: c.cmyk, nearestPantoneC: c.pantone, use: c.use })), fonts: { text: 'Space Grotesk', mono: 'IBM Plex Mono' } }, null, 2) + '\n';
add({ file: 'future-basics-colors.css', group: 'colour', kind: 'web', title: 'CSS variables', note: 'Paste into a stylesheet.', make: async () => Buffer.from(cssText()) });
add({ file: 'future-basics-colors.json', group: 'colour', kind: 'web', title: 'JSON', note: 'HEX, RGB, approximate CMYK and the nearest Pantone C chip.', make: async () => Buffer.from(jsonText()) });
// fonts
const FONT_FILES = [
  ['Space Grotesk', 'space-grotesk-latin.woff2', 'fonts/space-grotesk-latin.woff2', 'web', 'Variable, weights 300–700. Latin.'],
  ['Space Grotesk', 'space-grotesk-latin-ext.woff2', 'fonts/space-grotesk-latin-ext.woff2', 'web', 'Variable. Latin extended (accents).'],
  ['Space Grotesk Regular', 'SpaceGrotesk-Regular.ttf', 'fonts/pdf/SpaceGrotesk-Regular.ttf', 'print', 'Install on a computer. Word, Keynote, design tools.'],
  ['Space Grotesk Medium', 'SpaceGrotesk-Medium.ttf', 'fonts/pdf/SpaceGrotesk-Medium.ttf', 'print', 'Install on a computer.'],
  ['Space Grotesk Bold', 'SpaceGrotesk-Bold.ttf', 'fonts/pdf/SpaceGrotesk-Bold.ttf', 'print', 'Install on a computer.'],
  ['IBM Plex Mono Regular', 'IBMPlexMono-Regular.ttf', 'fonts/pdf/IBMPlexMono-Regular.ttf', 'print', 'Install on a computer.'],
  ['IBM Plex Mono Medium', 'IBMPlexMono-Medium.ttf', 'fonts/pdf/IBMPlexMono-Medium.ttf', 'print', 'Install on a computer.'],
  ['IBM Plex Mono 400', 'ibm-plex-mono-400.woff2', 'fonts/ibm-plex-mono-400.woff2', 'web', 'Web font, regular.'],
  ['IBM Plex Mono 500', 'ibm-plex-mono-500.woff2', 'fonts/ibm-plex-mono-500.woff2', 'web', 'Web font, medium.']
];
for (const [title, file, rel, kind, note] of FONT_FILES) add({ file, group: 'font', kind, title: `${title} · ${file.split('.').pop().toUpperCase()}`, note, make: async () => read('./' + rel) });
add({ file: 'future-basics-fonts.css', group: 'font', kind: 'web', title: 'Web font CSS', note: 'Put it next to the .woff2 files and link it.', make: async () => Buffer.from(
  `/* Future Basics fonts. Keep this file in the same folder as the .woff2 files. Both families are free under the SIL Open Font License 1.1. */\n` + readFileSync(new URL('./fonts/fonts.css', import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('@font-face')).join('\n').replace(/url\(\/fonts\//g, 'url(./') + '\n') });
add({ file: 'OFL-space-grotesk.txt', group: 'font', kind: 'both', title: 'Space Grotesk licence', note: 'SIL Open Font License 1.1.', make: async () => read('./fonts/OFL-space-grotesk.txt') });
add({ file: 'OFL-ibm-plex-mono.txt', group: 'font', kind: 'both', title: 'IBM Plex Mono licence', note: 'SIL Open Font License 1.1.', make: async () => read('./fonts/OFL-ibm-plex-mono.txt') });

// ---------- the guide ----------
async function guidePdf() {
  const b = brandDoc({ title: 'Future Basics brand guide', kind: 'Brand guide', footerNote: 'Future Basics  ·  Brand guide  ·  The wordmark, the mark, colour and type in one place', subject: 'Brand guide' });
  const { doc, L, CW } = b, mark = (x, y, w, fill) => { const s = w / VW; doc.save().translate(x, y).scale(s).path(D).fillColor(fill).fill('even-odd').restore(); return VH * s; };
  const h2 = (t, y) => { doc.fillColor(DIM).font('MONO').fontSize(8).text(t.toUpperCase(), L, y, { characterSpacing: 1.2, lineBreak: false }); return y + 16; };
  // the wordmark
  let y = h2('The wordmark', b.bodyTop);
  doc.rect(L, y, CW, 120).fill(INK); mark(L + CW * .2, y + 120 / 2 - (VH * CW * .6 / VW) / 2, CW * .6, '#FFFFFF'); y += 134;
  doc.rect(L, y, CW, 70).lineWidth(.8).strokeColor(LINE).stroke(); mark(L + CW * .3, y + 35 - (VH * CW * .4 / VW) / 2, CW * .4, INK); y += 92;
  doc.fillColor(INK).font('SG-M').fontSize(11).text('Use Ink on light backgrounds and White on dark ones. In print, one colour only: black. Always use the vector files (SVG or PDF) where you can.', L, y, { width: CW, lineGap: 3 }); y = doc.y + 14;
  const rules = [['Clear space', 'Leave a margin equal to the height of the wordmark on every side.'], ['Smallest size', '120 px wide on screen. 30 mm wide in print.'], ['Colours', 'Ink, White, black or Cue green only. Cue only on Ink.'], ['Keep it whole', 'Do not stretch, skew, outline, add shadows or rearrange it.'], ['On pictures', 'Put the wordmark on a plain area or an Ink panel, never on a busy photo.']];
  rules.forEach(([k, v]) => { doc.fillColor(INK).font('SG-B').fontSize(10).text(k, L, y, { width: 110, lineBreak: false }); doc.fillColor(INK).font('SG').fontSize(10).text(v, L + 120, y, { width: CW - 120 }); y = Math.max(doc.y, y + 14) + 4; });
  // the mark
  doc.addPage(); y = h2('The mark', b.bodyTop);
  const markAt = (x, yy, w, line, dot) => { const sc = w / MK.W; doc.save().translate(x, yy).scale(sc); rrect(doc, MK.line.x, MK.line.y, MK.line.w, MK.line.h).fillColor(line).fill(); doc.circle(MK.dot.cx, MK.dot.cy, MK.dot.r).fillColor(dot).fill(); doc.restore(); return MK.H * sc; };
  const half = (CW - 10) / 2; doc.rect(L, y, half, 80).fill(INK); markAt(L + half * .2, y + 40 - (MK.H * half * .6 / MK.W) / 2, half * .6, '#FFFFFF', CUE); doc.rect(L + half + 10, y, half, 80).lineWidth(.8).strokeColor(LINE).stroke(); markAt(L + half + 10 + half * .2, y + 40 - (MK.H * half * .6 / MK.W) / 2, half * .6, INK, CUE); y += 94;
  doc.fillColor(INK).font('SG-M').fontSize(11).text('A line that has been running, and a dot that has arrived: work moving from one pair of hands to the next. The wordmark says who we are. The mark says that work is moving.', L, y, { width: CW, lineGap: 3 }); y = doc.y + 8;
  doc.fillColor(INK).font('SG').fontSize(9.5).text('The line is Ink on light and White on dark. The dot is always Cue. In one-colour print both are the same colour. It always runs forward: line on the left, dot on the right. Leave one dot\'s width of space all round; never smaller than 48 px wide on screen or 12 mm in print. On squares use the compact cut. Move it only while something is running, one per screen, and keep it still when someone has asked for less motion.', L, y, { width: CW, lineGap: 2.5 }); y = doc.y + 14;
  y = h2('Where it goes', y);
  const uses = [['Console and hub headers', 'The wordmark with the cue line under it.', 'Wordmark + cue'], ['Loading and working', 'Moving mark in place of spinners, one at a time.', 'Moving mark'], ['Progress and handoffs', 'A line with stops; the Cue dot sits with whoever holds the work.', 'Line and dot'], ['Section breaks, empty states', 'The line alone, 34 to 64 px, above a heading.', 'Line'], ['Favicon, app, home screen', 'The compact mark on Ink. Never the wordmark at 16 px.', 'Compact icon'], ['Documents and PDFs', 'Dot after the name in the letterhead; the line under the title on covers.', 'Dot / line'], ['Email', 'Small mark above the heading in our own emails.', 'Mark, 48 px'], ['Social, profile pictures', 'Mark on Ink as the avatar; wordmark + cue on banners and link previews.', 'Icon / lockup'], ['Print, packaging, merch', 'One colour: black on kraft, white on dark. Dot as a seal, line as a label rule.', 'One-colour mark']];
  table(b, [{ h: 'Where', w: .26, bold: true }, { h: 'How it is used', w: .52 }, { h: 'Form', w: .22 }], uses, { y, fontSize: 9, pad: 5 });
  // colour
  doc.addPage(); y = h2('Colour', b.bodyTop);
  const cols = colorFacts(), cw = (CW - 18) / 4;
  cols.forEach((c, i) => { const x = L + (i % 4) * (cw + 6), yy = y + Math.floor(i / 4) * 150; doc.rect(x, yy, cw, 62).lineWidth(.6).fillAndStroke(c.hex, LINE);
    doc.fillColor(INK).font('SG-B').fontSize(10).text(c.name, x, yy + 70, { width: cw, lineBreak: false });
    doc.fillColor(DIM).font('MONO').fontSize(7.5).text(`${c.hex}\nRGB ${c.rgb.join(' ')}\nCMYK ${c.cmyk.join(' ')} approx.\n${c.pantone || ''}`, x, yy + 84, { width: cw, lineGap: 1.5 }); });
  y += 2 * 150 + 4;
  doc.fillColor(INK).font('SG').fontSize(10).text('Ink does most of the work. Cue is a single bright accent: use it sparingly, once or twice a page. CMYK values are a plain conversion for a first look; send a printer the Pantone chip, or a proof, to match exactly. PANTONE is a registered trademark of Pantone LLC.', L, y, { width: CW, lineGap: 3 });
  // type
  y = doc.y + 24; y = h2('Type', y);
  doc.fillColor(INK).font('SG-B').fontSize(34).text('Space Grotesk', L, y, { lineBreak: false }); y += 44;
  doc.fillColor(INK).font('SG').fontSize(11).text('For words: headings, body text and buttons. Regular, Medium and Bold. Headings are set tight and large, body text is 15 to 16 px on screen.', L, y, { width: CW, lineGap: 3 }); y = doc.y + 14;
  doc.fillColor(INK).font('MONO-M').fontSize(22).text('IBM PLEX MONO', L, y, { characterSpacing: 2, lineBreak: false }); y += 32;
  doc.fillColor(INK).font('SG').fontSize(11).text('For small labels, numbers and codes, usually in capitals with a little letter spacing. Both families are free under the SIL Open Font License 1.1.', L, y, { width: CW, lineGap: 3 });
  return b.finish();
}
add({ file: 'future-basics-brand-guide.pdf', group: 'guide', kind: 'print', title: 'Brand guide · PDF', note: 'Three pages. Logo and mark rules, where the mark goes, colours and type.', make: guidePdf });

// ---------- the catalogue ----------
export const catalogue = () => ({ groups: GROUPS.map(g => ({ ...g, items: ASSETS.filter(a => a.group === g.id).map(({ file, title, note, kind, on }) => ({ file, title, note, kind, on: on || null, ext: file.split('.').pop() })) })), colors: colorFacts(), kit: 'future-basics-brand-kit.zip' });
const cache = new Map();
export async function assetFile(file) {
  const a = ASSETS.find(x => x.file === file); if (!a) return null;
  if (!cache.has(file)) cache.set(file, a.make());
  try { return { buffer: await cache.get(file), mime: a.mime, file }; } catch (e) { cache.delete(file); throw e; }
}
const FOLDER = { logo: 'Wordmark', mark: 'The mark', icon: 'App icon and favicons', social: 'Social and email', colour: 'Colours', font: 'Fonts', guide: 'Brand guide' };
export async function kitZip() {
  const entries = [];
  for (const a of ASSETS) { const f = await assetFile(a.file); const sub = (a.group === 'logo' || a.group === 'mark') ? (a.kind === 'print' ? '/Print' : a.kind === 'web' ? '/Web' : '/Vector (SVG)') : a.group === 'font' ? (a.file.endsWith('.ttf') ? '/Install on a computer (TTF)' : a.file.endsWith('.woff2') || a.file.endsWith('.css') ? '/Web (WOFF2)' : '') : ''; entries.push({ name: `Future Basics brand kit/${FOLDER[a.group]}${sub}/${a.file}`, data: f.buffer }); }
  return zip(entries);
}
export const assetFiles = () => ASSETS.map(a => a.file);

export function registerBrandRoutes(app, { authenticate, adminOnly }) {
  const pre = [authenticate, adminOnly];
  app.get('/v1/brand', { preHandler: pre }, async () => catalogue());
  app.get('/v1/brand/files/:file', { preHandler: pre }, async (req, reply) => {
    const f = await assetFile(String(req.params.file || '')); if (!f) return reply.code(404).send({ error: 'Not found' });
    return reply.header('content-disposition', `attachment; filename="${f.file}"`).header('cache-control', 'private, max-age=300').type(f.mime).send(f.buffer);
  });
  app.get('/v1/brand/kit.zip', { preHandler: pre }, async (_req, reply) => reply.header('content-disposition', 'attachment; filename="future-basics-brand-kit.zip"').header('cache-control', 'private, max-age=300').type('application/zip').send(await kitZip()));
}

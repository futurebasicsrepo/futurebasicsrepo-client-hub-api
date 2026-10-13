// The Future Basics brand kit: the logo in every colour and file type, app icons and favicons, social and email images, the colours, the fonts and a short guide,
// all made from the one wordmark file (src/icons/wordmark-white.svg) and the fonts the hub already ships, so nothing here can drift from what the hub itself uses.
//   * Open to every signed-in staff member (an @thefuturebasics.com email), the same as the other work pages.
//   * Each file is made the first time it is asked for and kept in memory for the life of the server.
//   * Web files: SVG, PNG, WebP, ICO. Print files: PDF (vector, RGB and one-colour CMYK black), SVG (vector), PNG and TIFF at 300 dpi, JPG on white.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { brandDoc, INK, DIM, LINE, FOG, CUE, GREEN, RED } from './brand-pdf.js';
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

// ---------- the files ----------
// Each: { file, group, title, note, kind: 'web' | 'print' | 'both', make: () => Promise<Buffer>, mime, on: preview background }
const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', tiff: 'image/tiff', ico: 'image/x-icon', pdf: 'application/pdf', css: 'text/css', json: 'application/json', woff2: 'font/woff2', ttf: 'font/ttf', txt: 'text/plain' };
export const GROUPS = [
  { id: 'logo', title: 'Wordmark', note: 'The Future Basics wordmark. Use the colour that reads best on the background: Ink on light, White on dark. Use the vector files (SVG, PDF) whenever you can; they never blur.' },
  { id: 'icon', title: 'App icon and favicons', note: 'The wordmark centred on a square. For app stores, the home screen, browser tabs and anywhere a square is needed.' },
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
  { id: 'ink', name: 'on Ink', bg: INK, fill: '#FFFFFF' },
  { id: 'paper', name: 'on Paper', bg: '#FFFFFF', fill: INK },
  { id: 'cue', name: 'on Cue', bg: '#4BFF9A', fill: INK }
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
// icons
for (const i of ICONS) {
  const svg = canvasSvg({ w: 1024, h: 1024, bg: i.bg, fill: i.fill, frac: .72 });
  add({ file: `future-basics-icon-${i.id}.svg`, group: 'icon', kind: 'both', title: `App icon ${i.name} · SVG`, note: 'Vector, 1024 × 1024.', on: '#E9E9E4', make: async () => Buffer.from(svg) });
  add({ file: `future-basics-icon-${i.id}-1024.png`, group: 'icon', kind: 'both', title: `App icon ${i.name} · PNG 1024`, note: 'For app stores and large uses.', on: '#E9E9E4', make: () => png(svg, 1024) });
  add({ file: `future-basics-icon-${i.id}-512.png`, group: 'icon', kind: 'web', title: `App icon ${i.name} · PNG 512`, note: 'Web apps and listings.', on: '#E9E9E4', make: () => png(svg, 512) });
}
const ink1024 = canvasSvg({ w: 1024, h: 1024, bg: INK, fill: '#FFFFFF', frac: .72 });
add({ file: 'favicon.ico', group: 'icon', kind: 'web', title: 'Favicon · ICO', note: '16, 32 and 48 px in one file. Put it at the root of a site.', on: '#E9E9E4', make: () => ico(ink1024) });
add({ file: 'favicon-32.png', group: 'icon', kind: 'web', title: 'Favicon · PNG 32', note: 'Browser tab.', on: '#E9E9E4', make: () => png(ink1024, 32) });
add({ file: 'favicon-16.png', group: 'icon', kind: 'web', title: 'Favicon · PNG 16', note: 'Smallest browser tab.', on: '#E9E9E4', make: () => png(ink1024, 16) });
add({ file: 'apple-touch-icon-180.png', group: 'icon', kind: 'web', title: 'Apple touch icon · 180', note: 'When someone adds a page to their iPhone home screen.', on: '#E9E9E4', make: () => png(ink1024, 180) });
add({ file: 'icon-192.png', group: 'icon', kind: 'web', title: 'Web app icon · 192', note: 'Android home screen and web app manifests.', on: '#E9E9E4', make: () => png(ink1024, 192) });
add({ file: 'icon-maskable-512.png', group: 'icon', kind: 'web', title: 'Maskable icon · 512', note: 'Extra margin so Android can crop it to a circle or rounded square.', on: '#E9E9E4', make: () => png(canvasSvg({ w: 1024, h: 1024, bg: INK, fill: '#FFFFFF', frac: .5 }), 512) });
// social and email
const sq = (bg, fill) => canvasSvg({ w: 1080, h: 1080, bg, fill, frac: .66 });
add({ file: 'profile-picture-ink-1080.png', group: 'social', kind: 'web', title: 'Profile picture · Ink · 1080', note: 'LinkedIn, Instagram, X, Facebook, YouTube. Platforms crop to a circle: the wordmark stays inside it.', on: '#E9E9E4', make: () => png(sq(INK, '#FFFFFF'), 1080) });
add({ file: 'profile-picture-paper-1080.png', group: 'social', kind: 'web', title: 'Profile picture · Paper · 1080', note: 'The same on white.', on: '#E9E9E4', make: () => png(sq('#FFFFFF', INK), 1080) });
add({ file: 'link-preview-1200x630.png', group: 'social', kind: 'web', title: 'Link preview · 1200 × 630', note: 'The picture shown when a link is shared (Open Graph).', on: '#E9E9E4', make: () => png(canvasSvg({ w: 1200, h: 630, bg: INK, fill: '#FFFFFF', frac: .5 }), 1200) });
add({ file: 'linkedin-banner-1584x396.png', group: 'social', kind: 'web', title: 'LinkedIn banner · 1584 × 396', note: 'Company page and profile cover.', on: '#E9E9E4', make: () => png(canvasSvg({ w: 1584, h: 396, bg: INK, fill: '#FFFFFF', frac: .38 }), 1584) });
add({ file: 'x-header-1500x500.png', group: 'social', kind: 'web', title: 'X header · 1500 × 500', note: 'Profile header.', on: '#E9E9E4', make: () => png(canvasSvg({ w: 1500, h: 500, bg: INK, fill: '#FFFFFF', frac: .4 }), 1500) });
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
  const b = brandDoc({ title: 'Future Basics brand guide', kind: 'Brand guide', footerNote: 'Future Basics  ·  Brand guide  ·  The wordmark, colour and type in one place', subject: 'Brand guide' });
  const { doc, L, CW } = b, mark = (x, y, w, fill) => { const s = w / VW; doc.save().translate(x, y).scale(s).path(D).fillColor(fill).fill('even-odd').restore(); return VH * s; };
  const h2 = (t, y) => { doc.fillColor(DIM).font('MONO').fontSize(8).text(t.toUpperCase(), L, y, { characterSpacing: 1.2, lineBreak: false }); return y + 16; };
  // the wordmark
  let y = h2('The wordmark', b.bodyTop);
  doc.rect(L, y, CW, 120).fill(INK); mark(L + CW * .2, y + 120 / 2 - (VH * CW * .6 / VW) / 2, CW * .6, '#FFFFFF'); y += 134;
  doc.rect(L, y, CW, 70).lineWidth(.8).strokeColor(LINE).stroke(); mark(L + CW * .3, y + 35 - (VH * CW * .4 / VW) / 2, CW * .4, INK); y += 92;
  doc.fillColor(INK).font('SG-M').fontSize(11).text('Use Ink on light backgrounds and White on dark ones. In print, one colour only: black. Always use the vector files (SVG or PDF) where you can.', L, y, { width: CW, lineGap: 3 }); y = doc.y + 14;
  const rules = [['Clear space', 'Leave a margin equal to the height of the wordmark on every side.'], ['Smallest size', '120 px wide on screen. 30 mm wide in print.'], ['Colours', 'Ink, White, black or Cue green only. Cue only on Ink.'], ['Keep it whole', 'Do not stretch, skew, outline, add shadows or rearrange it.'], ['On pictures', 'Put the wordmark on a plain area or an Ink panel, never on a busy photo.']];
  rules.forEach(([k, v]) => { doc.fillColor(INK).font('SG-B').fontSize(10).text(k, L, y, { width: 110, lineBreak: false }); doc.fillColor(INK).font('SG').fontSize(10).text(v, L + 120, y, { width: CW - 120 }); y = Math.max(doc.y, y + 14) + 4; });
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
add({ file: 'future-basics-brand-guide.pdf', group: 'guide', kind: 'print', title: 'Brand guide · PDF', note: 'Two pages. Logo rules, colours and type.', make: guidePdf });

// ---------- the catalogue ----------
export const catalogue = () => ({ groups: GROUPS.map(g => ({ ...g, items: ASSETS.filter(a => a.group === g.id).map(({ file, title, note, kind, on }) => ({ file, title, note, kind, on: on || null, ext: file.split('.').pop() })) })), colors: colorFacts(), kit: 'future-basics-brand-kit.zip' });
const cache = new Map();
export async function assetFile(file) {
  const a = ASSETS.find(x => x.file === file); if (!a) return null;
  if (!cache.has(file)) cache.set(file, a.make());
  try { return { buffer: await cache.get(file), mime: a.mime, file }; } catch (e) { cache.delete(file); throw e; }
}
const FOLDER = { logo: 'Wordmark', icon: 'App icon and favicons', social: 'Social and email', colour: 'Colours', font: 'Fonts', guide: 'Brand guide' };
export async function kitZip() {
  const entries = [];
  for (const a of ASSETS) { const f = await assetFile(a.file); const sub = a.group === 'logo' ? (a.kind === 'print' ? '/Print' : a.kind === 'web' ? '/Web' : '/Vector (SVG)') : a.group === 'font' ? (a.file.endsWith('.ttf') ? '/Install on a computer (TTF)' : a.file.endsWith('.woff2') || a.file.endsWith('.css') ? '/Web (WOFF2)' : '') : ''; entries.push({ name: `Future Basics brand kit/${FOLDER[a.group]}${sub}/${a.file}`, data: f.buffer }); }
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

// The Future Basics look for every PDF the server makes (invoices, the project collection): one letterhead, one set of fonts, one footer,
// so a document that leaves the hub reads as the same company as the tech pack and the guide.
// Space Grotesk for words, IBM Plex Mono for labels and numbers, ink on paper with a single green cue. Both families are SIL Open Font
// License 1.1 (src/fonts/OFL-*.txt); the .ttf files here are static cuts of the same faces the hub serves as woff2.
import PDFDocument from 'pdfkit';

const FONT_DIR = new URL('./fonts/pdf/', import.meta.url);
export const INK = '#141416', DIM = '#6b6b72', LINE = '#d8d8d4', FOG = '#f5f5f2', CUE = '#2edc83', GREEN = '#17603a', RED = '#a02a20';
export const PAGE = { size: 'LETTER', margin: 48 };
const fp = name => new URL(name, FONT_DIR).pathname;

// Glyphs the embedded Latin cuts can draw. Anything else (a client written in Chinese) falls back to Helvetica for that string
// rather than printing empty boxes; Helvetica cannot draw it either, so it prints a plain "?" and never a broken glyph.
const LATIN = /^[ -~ -ɏ‐-‧‰-›€™←-↓−×]*$/;
export const clean = s => String(s ?? '').replace(/[\u0000-\u0009\u000B-\u001F]/g, ' ');
export const safe = s => { const t = clean(s); return LATIN.test(t) ? t : t.replace(/[^ -~ -ɏ‐-‧€−×]/g, '?'); };

export function money(cents, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(cents || 0) / 100);
}
export const fmtDate = d => { if (!d) return ''; const v = d instanceof Date ? d : new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return Number.isNaN(v.getTime()) ? '' : v.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

// A document with the brand fonts registered and a letterhead and footer on every page.
// kind: the document's name in the header ("Invoice", "Project collection"); ref: its number or project; footerNote: one line of context.
export function brandDoc({ title, kind, ref, footerNote, subject, size = PAGE.size, margin = PAGE.margin, layout = 'portrait' }) {
  const doc = new PDFDocument({ size, layout, margin, bufferPages: true, info: { Title: safe(title), Author: 'Future Basics', Subject: subject || kind, Creator: 'Future Basics hub' } });
  doc.registerFont('SG', fp('SpaceGrotesk-Regular.ttf')); doc.registerFont('SG-M', fp('SpaceGrotesk-Medium.ttf')); doc.registerFont('SG-B', fp('SpaceGrotesk-Bold.ttf'));
  doc.registerFont('MONO', fp('IBMPlexMono-Regular.ttf')); doc.registerFont('MONO-M', fp('IBMPlexMono-Medium.ttf'));
  const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  const W = doc.page.width, H = doc.page.height, L = margin, R = W - margin, CW = R - L;
  const brand = { doc, W, H, L, R, CW, margin, kind, ref, footerNote, headerBottom: 0, bodyTop: 0, bodyBottom: H - margin - 14 };
  // Fonts for text that may not be Latin: the brand cut when it can draw every character, Helvetica when it cannot.
  brand.font = (name, text) => doc.font(LATIN.test(clean(text)) ? name : (name === 'SG-B' ? 'Helvetica-Bold' : 'Helvetica'));
  brand.text = (text, x, y, opts = {}, face = 'SG') => { const t = safe(text); doc.font(face); return doc.text(t, x, y, opts); };
  const header = () => {
    const top = margin - 14;
    doc.save();
    doc.fillColor(INK).font('SG-B').fontSize(15); const mark = doc.widthOfString('FUTURE BASICS', { characterSpacing: 2.2 });
    doc.text('FUTURE BASICS', L, top, { characterSpacing: 2.2, lineBreak: false });
    doc.fillColor(CUE).circle(L + mark + 6, top + 11, 3).fill();
    doc.fillColor(DIM).font('MONO').fontSize(8).text(safe(kind).toUpperCase() + (ref ? '  ·  ' + safe(ref) : ''), L, top + 4, { width: CW, align: 'right', characterSpacing: 1, lineBreak: false });
    doc.moveTo(L, top + 25).lineTo(R, top + 25).lineWidth(1.6).strokeColor(INK).stroke();
    doc.restore();
    brand.headerBottom = top + 25; brand.bodyTop = top + 25 + 20;
    doc.x = L; doc.y = brand.bodyTop;
  };
  header(); brand.header = header;
  doc.on('pageAdded', header);
  // Run at the very end: the footer needs the page count.
  brand.finish = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const y = H - margin + 4, mb = doc.page.margins.bottom; doc.page.margins.bottom = 0; // the footer sits in the bottom margin: without this pdfkit starts a new page for it
      doc.save();
      doc.moveTo(L, y - 8).lineTo(R, y - 8).lineWidth(.6).strokeColor(LINE).stroke();
      doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe(footerNote || 'Future Basics  ·  hub.thefuturebasics.com'), L, y, { width: CW - 80, lineBreak: false, lineGap: 0 });
      doc.fillColor(INK).font('MONO-M').fontSize(7.5).text(`${i - range.start + 1} / ${range.count}`, R - 70, y, { width: 70, align: 'right', lineBreak: false });
      doc.restore(); doc.page.margins.bottom = mb;
    }
    doc.end(); return done;
  };
  return brand;
}

// A small uppercase mono label over a value, the pattern used for every fact in the documents.
export function fact(b, label, value, x, y, w, { big = false } = {}) {
  const { doc } = b;
  doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe(label).toUpperCase(), x, y, { width: w, characterSpacing: .9, lineBreak: false });
  doc.fillColor(INK); b.font(big ? 'SG-B' : 'SG-M', value).fontSize(big ? 15 : 11).text(safe(value || '—'), x, y + 12, { width: w });
  return doc.y;
}

// A status pill: PAID, DUE, DRAFT, VOID.
export function pill(b, text, x, y, color) {
  const { doc } = b; const t = safe(text).toUpperCase();
  doc.font('MONO-M').fontSize(8.5); const w = doc.widthOfString(t, { characterSpacing: 1.4 }) + 20;
  doc.roundedRect(x, y, w, 20, 10).lineWidth(1.2).strokeColor(color).stroke();
  doc.fillColor(color).text(t, x + 10, y + 6, { characterSpacing: 1.4, lineBreak: false });
  return w;
}

// A table with a heading row that repeats on every page, zebra rows and rows that are never split across pages.
// cols: [{ h, w (fraction), align, mono, bold, fill (cell colour), headFill, small (header second line) }]
// rows: arrays of cells; a cell is a string or { t, sub, bold } (a value with a smaller line beneath it, e.g. inches over centimetres).
export function table(b, cols, rows, { y, fontSize = 10, pad = 7, head = true } = {}) {
  const { doc, L, CW } = b; const total = cols.reduce((s, c) => s + c.w, 0), widths = cols.map(c => CW * c.w / total);
  let cy = y ?? doc.y;
  const parts = c => (c && typeof c === 'object') ? c : { t: c };
  const drawHead = () => {
    if (!head) return;
    let x = L;
    cols.forEach((c, i) => { doc.rect(x, cy, widths[i], 24).fill(c.headFill || INK); x += widths[i]; });
    x = L;
    cols.forEach((c, i) => {
      doc.fillColor('#fff').font('MONO-M').fontSize(7.5).text(safe(c.h).toUpperCase(), x + 6, cy + (c.small ? 5 : 8), { width: widths[i] - 12, align: c.align || 'left', characterSpacing: .8, lineBreak: false });
      if (c.small) doc.fillColor('#d7efe0').font('MONO').fontSize(6.5).text(safe(c.small).toUpperCase(), x + 6, cy + 14, { width: widths[i] - 12, align: c.align || 'left', characterSpacing: .8, lineBreak: false });
      x += widths[i];
    });
    cy += 24;
  };
  drawHead();
  rows.forEach((r, ri) => {
    const hs = r.map((cell, i) => { const c = parts(cell), col = cols[i]; b.font(c.bold || col.bold ? 'SG-B' : col.mono ? 'MONO' : 'SG', c.t); doc.fontSize(fontSize);
      let h = (c.box || c.line) ? (c.line ? 22 : 10) : doc.heightOfString(safe(c.t), { width: widths[i] - 12 - (c.swatch ? 16 : 0) }); if (c.sub) { doc.font('SG').fontSize(fontSize - 2.5); h += doc.heightOfString(safe(c.sub), { width: widths[i] - 12 }) + 1.5; } return h; });
    const h = Math.max(...hs) + pad * 2;
    if (cy + h > b.bodyBottom) { doc.addPage(); cy = b.bodyTop; drawHead(); }
    let x = L;
    cols.forEach((c, i) => { if (c.fill) doc.rect(x, cy, widths[i], h).fill(c.fill); else if (ri % 2) doc.rect(x, cy, widths[i], h).fill(FOG); x += widths[i]; });
    x = L;
    r.forEach((cell, i) => {
      const c = parts(cell), col = cols[i];
      if (c.box) { const bs = 10; doc.roundedRect(x + widths[i] / 2 - bs / 2, cy + pad, bs, bs, 2).lineWidth(1).strokeColor(INK).stroke(); x += widths[i]; return; }
      if (c.line) { doc.moveTo(x + 6, cy + h - pad - 2).lineTo(x + widths[i] - 6, cy + h - pad - 2).lineWidth(.8).strokeColor(INK).stroke(); x += widths[i]; return; }
      const off = c.swatch ? 16 : 0; if (c.swatch) doc.circle(x + 12, cy + pad + fontSize / 2, 5).lineWidth(.6).fillAndStroke(c.swatch, '#666');
      doc.fillColor(INK); b.font(c.bold || col.bold ? 'SG-B' : col.mono ? 'MONO' : 'SG', c.t).fontSize(fontSize).text(safe(c.t), x + 6 + off, cy + pad, { width: widths[i] - 12 - off, align: col.align || 'left' });
      if (c.sub) doc.fillColor(DIM).font('SG').fontSize(fontSize - 2.5).text(safe(c.sub), x + 6, doc.y + 1.5, { width: widths[i] - 12, align: col.align || 'left' });
      x += widths[i];
    });
    doc.moveTo(L, cy + h).lineTo(L + CW, cy + h).lineWidth(.5).strokeColor(LINE).stroke();
    cy += h;
  });
  doc.y = cy; return cy;
}

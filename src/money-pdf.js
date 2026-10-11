// The Future Basics invoice, laid out like the one in use today: the mark top left, "Bill to" and the invoice facts down the left, the black
// SERVICES bar and its lines on the right, payment instructions, totals (with any deposit already paid) and notes.
// The bank details are not in the code: they come from the Money setting "payment instructions", one line per row.
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';

const FONT = new URL('./fonts/pdf/RubikMonoOne-Regular.ttf', import.meta.url).pathname;
const LOGO = new URL('./assets/invoice-logo.png', import.meta.url).pathname;
let logoBytes = null; const logo = () => (logoBytes ||= readFileSync(LOGO));

const INK = '#000000', GRAY = '#8a8a8a', LATIN = /^[ -~ -ɏ‐-‧€–—‘’“”•…]*$/;
const clean = s => String(s ?? '').replace(/[\u0000-\u0009\u000B-\u001F]/g, ' ');
const up = s => { const t = clean(s).toUpperCase(); return LATIN.test(t) ? t : t.replace(/[^ -~ -ɏ‐-‧€–—‘’“”•…]/g, '?'); };
export const dollars = (cents, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(cents || 0) / 100);
const us = d => { const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); return m ? `${m[2]}/${m[3]}/${m[1]}` : ''; };

// inv: a money_invoices row (snake_case, lines/credits as arrays). settings: { instructions: 'Account No. …\nRouting …' }. state: { state, owedCents } from invoiceState (for a PAID or VOID mark).
export function moneyInvoicePdf(inv, settings = {}, state = {}) {
  const doc = new PDFDocument({ size: 'LETTER', margin: 0, bufferPages: true, info: { Title: `Invoice ${inv.number}`, Author: 'Future Basics', Subject: 'Invoice', Creator: 'Future Basics hub' } });
  doc.registerFont('RUBIK', FONT);
  const chunks = []; doc.on('data', c => chunks.push(c)); const done = new Promise((res, rej) => { doc.on('end', () => res(Buffer.concat(chunks))); doc.on('error', rej); });
  const W = doc.page.width, H = doc.page.height, L = 65, R = 558, TX = 258, cur = inv.currency || 'USD', LH = 14.4;
  const text = (t, x, y, o = {}) => { doc.font('RUBIK').fontSize(o.size || 6.3).fillColor(o.color || INK).text(up(t), x, y, { lineBreak: o.width !== undefined, width: o.width, align: o.align, lineGap: o.gap ?? 1.5 }); return doc.y; };
  doc.image(logo(), L, 62, { width: 50 });
  let y = 160;
  text('Bill to', L, y, { color: GRAY });
  let by = y + 16; const billLines = [inv.company, ...String(inv.address || '').split('\n'), inv.contact_name, inv.contact_email].filter(Boolean);
  for (const l of billLines) { text(l, L, by, { width: TX - L - 6 }); by = doc.y + 6; }
  let my = Math.max(by + 22, 268);
  for (const [k, v] of [['Invoice', inv.number], ['Date', us(inv.issued_on)], ['Terms', inv.terms], ['Due date', us(inv.due_on)]]) { text(k, L, my, { color: GRAY }); text(v, 128, my); my += LH + 1; }

  // the SERVICES bar and its lines
  const colQ = 392, colR = 452, colA = R;
  doc.rect(TX, y - 3, R - TX, 17).fill(INK);
  text('Services', TX + 3, y + 1, { color: '#ffffff' }); text('Qty', colQ - 40, y + 1, { color: '#ffffff', width: 40, align: 'right' }); text('Rate', colR - 60, y + 1, { color: '#ffffff', width: 60, align: 'right' }); text('Amount', colA - 80, y + 1, { color: '#ffffff', width: 80, align: 'right' });
  let ty = y + 21;
  for (const l of inv.lines || []) {
    if (ty > H - 120) { doc.addPage(); ty = 60; }
    const top = ty, end = text(l.description, TX + 3, ty, { width: colQ - TX - 52 });
    const amt = Math.round(Number(l.qty) * Number(l.rateCents));
    text(String(Number.isInteger(l.qty) ? l.qty : l.qty), colQ - 40, top, { color: GRAY, width: 40, align: 'right' }); text(dollars(l.rateCents, cur), colR - 60, top, { color: GRAY, width: 60, align: 'right' }); text(dollars(amt, cur), colA - 80, top, { color: GRAY, width: 80, align: 'right' });
    ty = Math.max(end, top + 8) + 6;
  }

  // payment instructions (from the setting), left
  const lines = String(settings.instructions || '').split('\n').map(s => s.trim()).filter(Boolean);
  let py = Math.max(353, my + 40); if (lines.length) { text('Payment instructions:', L, py, { color: GRAY }); py += 17; for (const l of lines) { text(l, L, py, { width: TX - L - 12 }); py = doc.y + 5.5; } }

  // totals, right, below the lines
  let ky = Math.max(ty + 16, 400); if (ky > H - 150) { doc.addPage(); ky = 60; }
  const total = (label, value, o = {}) => { doc.font('RUBIK').fontSize(o.size || 7.8); const lw = doc.widthOfString(up(value)) + 8; text(label, TX - 40, ky, { width: R - lw - TX + 40, align: 'right', size: o.size || 7.8 }); text(value, R - lw, ky, { width: lw, align: 'right', size: o.size || 7.8 }); ky += 17.5; };
  total('Subtotal:', dollars(inv.subtotal_cents, cur));
  total(Number(inv.tax_rate) > 0 ? `Tax (${Number(inv.tax_rate)}%):` : 'Tax:', dollars(inv.tax_cents, cur));
  total('Total:', dollars(inv.total_cents, cur));
  for (const c of inv.credits || []) total(`${c.label}`, dollars(c.amountCents, cur));
  const credits = (inv.credits || []).reduce((a, c) => a + Number(c.amountCents || 0), 0), balance = Math.max(0, Number(inv.total_cents) - credits);
  const dueNow = inv.due_now_cents == null ? balance : Math.min(Number(inv.due_now_cents), balance);
  if (state.state === 'paid') total('Paid in full', dollars(0, cur)); else total(inv.due_now_label || 'Total due', dollars(dueNow, cur));
  if (inv.status === 'void') text('Void', L, 120, { color: '#a02a20', size: 14 });

  // notes
  let ny = Math.max(ky + 22, py + 28, 498);
  if (ny > H - 90) { doc.addPage(); ny = 60; }
  if (inv.notes) { text('Notes:', L, ny, { color: GRAY }); text(inv.notes, L, ny + 17, { width: R - L }); }
  doc.end(); return done;
}

// The Future Basics invoice, on the brand letterhead (see brand-pdf.js): the same look as every other document the hub makes. Invoice and status up top,
// who it is for and the dates, the lines, then the totals in the dark box and how to pay. The bank details are not in the code: they come from the Money
// setting "payment instructions", one line per row.
import { brandDoc, fact, pill, table, money, fmtDate, safe, INK, DIM, LINE, CUE, GREEN, RED } from './brand-pdf.js';

const SUPPORT = 'hub@thefuturebasics.com';
export const dollars = (cents, currency = 'USD') => money(cents, currency);
const dateOf = d => fmtDate(d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
// safe() would turn a line break into "?", so multi-line text is cleaned line by line
const block = t => String(t ?? '').split('\n').map(safe).join('\n');
const qty = n => (Number.isInteger(Number(n)) ? String(Number(n)) : String(Number(n)));

// inv: a money_invoices row (snake_case, lines/credits as arrays; pay_url optional: an online payment link).
// settings: { instructions: 'Account No. …\nRouting …' }. state: { state, owedCents } from invoiceState (for the pill and "paid in full").
export function moneyInvoicePdf(inv, settings = {}, state = {}) {
  const cur = inv.currency || 'USD';
  const b = brandDoc({ title: `Invoice ${inv.number}`, kind: 'Invoice', ref: inv.number, footerNote: `Future Basics  ·  Questions about this invoice: ${SUPPORT}`, subject: `Invoice ${inv.number} for ${inv.company}` });
  const { doc, L, R, CW } = b;
  const st = String(state.state || (inv.status === 'draft' ? 'draft' : '')), paid = st === 'paid', voided = inv.status === 'void' || st === 'void';
  const PILL = { paid: ['Paid', GREEN], void: ['Void', RED], draft: ['Draft', DIM], overdue: ['Overdue', RED], 'part-paid': ['Part paid', INK], unrecorded: ['Past invoice', DIM] };
  const [pillText, pillColor] = voided ? PILL.void : PILL[st] || ['Due', INK];

  let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(34).text('Invoice', L, y, { lineBreak: false });
  pill(b, pillText, R - 76, y + 8, pillColor);
  doc.fillColor(DIM).font('MONO').fontSize(11).text(safe(inv.number), L, y + 42, { characterSpacing: .6 });
  y += 78;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(.6).strokeColor(LINE).stroke(); y += 16;

  // who it is for (left, as many lines as it has) and the dates
  const billW = CW * .42, dx = L + billW + 20, dw = (CW - billW - 20) / 3 - 10;
  doc.fillColor(DIM).font('MONO').fontSize(7.5).text('BILL TO', L, y, { width: billW, characterSpacing: .9, lineBreak: false });
  doc.fillColor(INK); b.font('SG-B', inv.company).fontSize(12).text(safe(inv.company), L, y + 12, { width: billW });
  const more = [...String(inv.address || '').split('\n'), inv.contact_name, inv.contact_email].map(s => String(s || '').trim()).filter(Boolean);
  if (more.length) { doc.fillColor(DIM).font('SG').fontSize(9.5).text(block(more.join('\n')), L, doc.y + 2, { width: billW, lineGap: 1.5 }); }
  const billBottom = doc.y;
  fact(b, 'Issued', dateOf(inv.issued_on), dx, y, dw);
  fact(b, 'Terms', inv.terms || 'Due on receipt', dx + dw + 10, y, dw);
  fact(b, paid ? 'Settled' : 'Due', paid ? 'Paid in full' : dateOf(inv.due_on) || 'On receipt', dx + (dw + 10) * 2, y, dw);
  y = Math.max(billBottom, y + 40) + 22;

  // the lines
  const rows = (inv.lines || []).map(l => [{ t: String(l.description || '').replace(/\s*\n+\s*/g, ' · ') }, qty(l.qty), money(l.rateCents, cur), money(Math.round(Number(l.qty) * Number(l.rateCents)), cur)]);
  y = table(b, [{ h: 'Description', w: 6 }, { h: 'Qty', w: 1, align: 'right' }, { h: 'Rate', w: 2, align: 'right', mono: true }, { h: `Amount (${cur})`, w: 2, align: 'right', mono: true }], rows, { y, fontSize: 10.5, pad: 9 });
  y += 22;

  // totals (right) and how to pay (left)
  const credits = (inv.credits || []).filter(c => Number(c.amountCents) > 0), creditSum = credits.reduce((a, c) => a + Number(c.amountCents || 0), 0);
  const balance = Math.max(0, Number(inv.total_cents) - creditSum), dueNow = inv.due_now_cents == null ? balance : Math.min(Number(inv.due_now_cents), balance);
  const lines = [['Subtotal', money(inv.subtotal_cents, cur)], [Number(inv.tax_rate) > 0 ? `Tax (${Number(inv.tax_rate)}%)` : 'Tax', money(inv.tax_cents, cur)], ['Total', money(inv.total_cents, cur)], ...credits.map(c => [String(c.label || 'Deposit paid'), `−${money(c.amountCents, cur)}`])];
  const boxW = 250, bx = R - boxW, rowH = 17, boxH = 74, need = lines.length * rowH + 10 + boxH;
  if (y + Math.max(need, 90) > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
  const top = y;
  lines.forEach(([k, v], i) => {
    const ry = top + i * rowH, strong = k === 'Total';
    doc.fillColor(DIM).font('MONO').fontSize(8).text(safe(k).toUpperCase(), bx, ry + 3, { width: boxW - 110, characterSpacing: .9, lineBreak: false });
    doc.fillColor(INK).font(strong ? 'SG-B' : 'SG-M').fontSize(strong ? 11.5 : 10.5).text(safe(v), bx + boxW - 110, ry + 1.5, { width: 110, align: 'right', lineBreak: false });
  });
  let by = top + lines.length * rowH + 10;
  doc.roundedRect(bx, by, boxW, boxH, 12).fill(INK);
  const label = voided ? 'VOIDED' : paid ? 'AMOUNT PAID' : String(inv.due_now_label || (credits.length ? 'Final payment due' : 'Total due')).toUpperCase();
  doc.fillColor('#b7b7ba').font('MONO').fontSize(8).text(safe(label), bx + 18, by + 16, { width: boxW - 60, characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#fff').font('SG-B').fontSize(26).text(money(paid ? Number(inv.total_cents) : dueNow, cur), bx + 18, by + 33, { lineBreak: false });
  doc.fillColor(CUE).circle(R - 18, by + 20, 4).fill();
  doc.fillColor(DIM).font('MONO').fontSize(8).text(`All amounts in ${cur}`, L, by + boxH - 14, { width: bx - L - 20, lineBreak: false });

  // how to pay: the payment link when there is one, and the bank details from Money → Settings
  const instr = String(settings.instructions || '').split('\n').map(s => s.trim()).filter(Boolean), cardW = bx - L - 24;
  if (!paid && !voided && (instr.length || inv.pay_url)) {
    doc.font('SG').fontSize(9.5); const body = instr.join('\n'), bodyH = body ? doc.heightOfString(block(body), { width: cardW - 36, lineGap: 2 }) : 0, linkH = inv.pay_url ? 30 : 0, ch = Math.max(52, 40 + bodyH + linkH);
    doc.roundedRect(L, top, cardW, ch, 12).lineWidth(1).strokeColor(LINE).stroke();
    doc.fillColor(DIM).font('MONO').fontSize(8).text('HOW TO PAY', L + 18, top + 16, { characterSpacing: 1.2, lineBreak: false });
    let cy = top + 32;
    if (inv.pay_url) { doc.fillColor(INK).font('SG-M').fontSize(10.5).text(inv.pay_channel === 'quickbooks' ? 'Pay by card or bank transfer online:' : 'Pay by card online:', L + 18, cy, { width: cardW - 36 }); doc.fillColor(GREEN).font('MONO-M').fontSize(8).text(safe(inv.pay_url), L + 18, doc.y + 2, { width: cardW - 36, link: inv.pay_url, underline: true }); cy = doc.y + 8; }
    if (body) { doc.fillColor(INK).font('SG').fontSize(9.5).text(block(body), L + 18, cy, { width: cardW - 36, lineGap: 2 }); }
  }
  y = Math.max(by + boxH, doc.y) + 26;

  if (inv.notes) {
    if (y + 60 > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
    doc.fillColor(DIM).font('MONO').fontSize(8).text('NOTES', L, y, { characterSpacing: 1.2, lineBreak: false });
    doc.fillColor(INK).font('SG').fontSize(10).text(block(inv.notes), L, y + 14, { width: CW, lineGap: 2 }); y = doc.y + 18;
  }
  doc.fillColor(DIM).font('SG').fontSize(9.5).text(paid ? 'Thank you. This invoice is paid in full and needs nothing further from you.' : `Questions about this invoice? Write to ${SUPPORT} and quote the number ${safe(inv.number)}.`, L, Math.min(y, b.bodyBottom - 14), { width: CW });
  return b.finish();
}

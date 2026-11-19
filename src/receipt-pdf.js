// The Future Basics receipt: the invoice's twin on the brand letterhead (brand-pdf.js), sent once a client has paid. It reads like the invoice it
// answers (who it is for, the same lines and totals) and says what was received: when, how (Shopify and its order number, a bank transfer, a card),
// and that nothing is left to pay. A payment that leaves a balance makes a receipt for what came in, with the balance still due.
import { brandDoc, fact, pill, table, money, fmtDate, safe, INK, DIM, LINE, CUE, GREEN } from './brand-pdf.js';

const SUPPORT = 'hub@thefuturebasics.com';
const dateOf = d => fmtDate(d instanceof Date ? d.toISOString().slice(0, 10) : String(d || '').slice(0, 10));
const block = t => String(t ?? '').split('\n').map(safe).join('\n');
const qty = n => String(Number(n));
export const METHOD_WORDS = { shopify: 'Shopify checkout', card: 'Card', ach: 'ACH bank transfer', wire: 'Wire transfer', check: 'Check', cash: 'Cash', quickbooks: 'QuickBooks Payments', other: 'Payment received' };
export const receiptNumber = invoiceNumber => `R-${String(invoiceNumber || '').replace(/^R-/, '')}`;

// What a receipt says, worked out once so the PDF, the email and the page agree.
// r: { invoiceNumber, company, contactName, contactEmail, address, issuedOn, currency, lines:[{description, qty, rateCents}], subtotalCents,
//      taxCents, taxRatePct, totalCents, credits:[{label, amountCents}], payments:[{paidOn, method, reference, note, amountCents}], notes }
export function receiptOf(r) {
  const payments = (r.payments || []).filter(p => Number(p.amountCents) > 0).sort((a, b) => String(a.paidOn || '').localeCompare(String(b.paidOn || '')));
  const credits = (r.credits || []).filter(c => Number(c.amountCents) > 0);
  const total = Number(r.totalCents) || 0, creditCents = credits.reduce((a, c) => a + Number(c.amountCents), 0), paidCents = payments.reduce((a, p) => a + Number(p.amountCents), 0);
  const balanceCents = Math.max(0, total - creditCents - paidCents), last = payments[payments.length - 1] || null;
  return { ...r, number: receiptNumber(r.invoiceNumber), payments, credits, paidCents, creditCents, balanceCents, paidInFull: payments.length > 0 && balanceCents === 0, paidOn: last?.paidOn || null, method: last?.method || 'other' };
}
const howPaid = p => [METHOD_WORDS[p.method] || METHOD_WORDS.other, p.reference ? (p.method === 'shopify' && !/^#/.test(p.reference) ? `order ${p.reference}` : p.reference) : ''].filter(Boolean).join(' · ');

export function receiptPdf(input) {
  const r = receiptOf(input), cur = r.currency || 'USD';
  const b = brandDoc({ title: `Receipt ${r.number}`, kind: 'Receipt', ref: r.number, footerNote: `Future Basics  ·  Questions about this receipt: ${SUPPORT}`, subject: `Receipt ${r.number} for ${r.company}` });
  const { doc, L, R, CW } = b;

  let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(34).text('Receipt', L, y, { lineBreak: false });
  pill(b, r.paidInFull ? 'Paid' : 'Part paid', R - 76, y + 8, r.paidInFull ? GREEN : INK);
  doc.fillColor(DIM).font('MONO').fontSize(11).text(`${safe(r.number)}  ·  for invoice ${safe(r.invoiceNumber)}`, L, y + 42, { characterSpacing: .6 });
  y += 78;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(.6).strokeColor(LINE).stroke(); y += 16;

  // who paid (left) and when, how, and for which invoice
  const billW = CW * .42, dx = L + billW + 20, dw = (CW - billW - 20) / 3 - 10;
  doc.fillColor(DIM).font('MONO').fontSize(7.5).text('RECEIVED FROM', L, y, { width: billW, characterSpacing: .9, lineBreak: false });
  doc.fillColor(INK); b.font('SG-B', r.company).fontSize(12).text(safe(r.company), L, y + 12, { width: billW });
  const more = [...String(r.address || '').split('\n'), r.contactName, r.contactEmail].map(s => String(s || '').trim()).filter(Boolean);
  if (more.length) doc.fillColor(DIM).font('SG').fontSize(9.5).text(block(more.join('\n')), L, doc.y + 2, { width: billW, lineGap: 1.5 });
  const leftBottom = doc.y;
  fact(b, 'Paid on', dateOf(r.paidOn) || 'Recorded', dx, y, dw);
  fact(b, 'Paid by', METHOD_WORDS[r.method] || METHOD_WORDS.other, dx + dw + 10, y, dw);
  fact(b, 'Invoice', `${r.invoiceNumber}${r.issuedOn ? `, ${dateOf(r.issuedOn)}` : ''}`, dx + (dw + 10) * 2, y, dw);
  y = Math.max(leftBottom, doc.y, y + 40) + 22;

  // what was paid for: the invoice's own lines
  const rows = (r.lines || []).map(l => [{ t: String(l.description || '').replace(/\s*\n+\s*/g, ' · ') }, qty(l.qty), money(l.rateCents, cur), money(Math.round(Number(l.qty) * Number(l.rateCents)), cur)]);
  y = table(b, [{ h: 'Description', w: 6 }, { h: 'Qty', w: 1, align: 'right' }, { h: 'Rate', w: 2, align: 'right', mono: true }, { h: `Amount (${cur})`, w: 2, align: 'right', mono: true }], rows, { y, fontSize: 10.5, pad: 9 });
  y += 22;

  // the sum (right): the invoice, what was paid against it, and what is left; the payment itself (left)
  const lines = [['Subtotal', money(r.subtotalCents ?? r.totalCents, cur)], ...(Number(r.taxCents) > 0 ? [[Number(r.taxRatePct) > 0 ? `Tax (${Number(r.taxRatePct)}%)` : 'Tax', money(r.taxCents, cur)]] : []), ['Invoice total', money(r.totalCents, cur)],
    ...r.credits.map(c => [String(c.label || 'Paid earlier'), `−${money(c.amountCents, cur)}`]), ...r.payments.map(p => [`Paid ${dateOf(p.paidOn)}`.trim(), `−${money(p.amountCents, cur)}`]), ['Balance due', money(r.balanceCents, cur)]];
  const boxW = 250, bx = R - boxW, rowH = 17, boxH = 74, need = lines.length * rowH + 10 + boxH;
  if (y + Math.max(need, 110) > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
  const top = y;
  lines.forEach(([k, v], i) => {
    const ry = top + i * rowH, strong = k === 'Invoice total' || k === 'Balance due';
    doc.fillColor(DIM).font('MONO').fontSize(8).text(safe(k).toUpperCase(), bx, ry + 3, { width: boxW - 110, characterSpacing: .9, lineBreak: false });
    doc.fillColor(k === 'Balance due' && r.balanceCents === 0 ? GREEN : INK).font(strong ? 'SG-B' : 'SG-M').fontSize(strong ? 11.5 : 10.5).text(safe(v), bx + boxW - 110, ry + 1.5, { width: 110, align: 'right', lineBreak: false });
  });
  const by = top + lines.length * rowH + 10;
  doc.roundedRect(bx, by, boxW, boxH, 12).fill(INK);
  doc.fillColor('#b7b7ba').font('MONO').fontSize(8).text(r.paidInFull ? 'AMOUNT PAID · IN FULL' : 'AMOUNT RECEIVED', bx + 18, by + 16, { width: boxW - 60, characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#fff').font('SG-B').fontSize(26).text(money(r.paidCents, cur), bx + 18, by + 33, { lineBreak: false });
  doc.fillColor(CUE).circle(R - 18, by + 20, 4).fill();
  doc.fillColor(DIM).font('MONO').fontSize(8).text(`All amounts in ${cur}`, L, by + boxH - 14, { width: bx - L - 20, lineBreak: false });

  // the payment, as the bank or Shopify recorded it
  const cardW = bx - L - 24, pays = r.payments.slice(-4);
  doc.font('SG').fontSize(9.5);
  const ch = Math.max(74, 40 + pays.length * 30);
  doc.roundedRect(L, top, cardW, ch, 12).lineWidth(1).strokeColor(LINE).stroke();
  doc.fillColor(DIM).font('MONO').fontSize(8).text(pays.length > 1 ? 'PAYMENTS RECEIVED' : 'PAYMENT RECEIVED', L + 18, top + 16, { characterSpacing: 1.2, lineBreak: false });
  let cy = top + 32;
  for (const p of pays) {
    doc.fillColor(INK).font('SG-M').fontSize(10.5).text(`${money(p.amountCents, cur)}  ·  ${dateOf(p.paidOn) || 'date not recorded'}`, L + 18, cy, { width: cardW - 36, lineBreak: false });
    doc.fillColor(DIM).font('SG').fontSize(9).text(safe(howPaid(p)), L + 18, cy + 13, { width: cardW - 36, lineBreak: false });
    cy += 30;
  }
  y = Math.max(by + boxH, top + ch) + 26;

  if (r.notes) {
    if (y + 60 > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
    doc.fillColor(DIM).font('MONO').fontSize(8).text('NOTES', L, y, { characterSpacing: 1.2, lineBreak: false });
    doc.fillColor(INK).font('SG').fontSize(10).text(block(r.notes), L, y + 14, { width: CW, lineGap: 2 }); y = doc.y + 18;
  }
  const thanks = r.paidInFull
    ? `Thank you. We received ${money(r.paidCents, cur)}${r.paidOn ? ` on ${dateOf(r.paidOn)}` : ''}, and invoice ${safe(r.invoiceNumber)} is paid in full. Keep this receipt for your records.`
    : `Thank you. We received ${money(r.paidCents, cur)} against invoice ${safe(r.invoiceNumber)}; ${money(r.balanceCents, cur)} is still due.`;
  doc.fillColor(DIM).font('SG').fontSize(9.5).text(thanks, L, Math.min(y, b.bodyBottom - 30), { width: CW });
  return b.finish();
}

// The email a receipt goes out with: short, with the PDF attached.
export function receiptEmail(input, { message = '', esc = s => String(s) } = {}) {
  const r = receiptOf(input), cur = r.currency || 'USD';
  const subject = `Receipt for invoice ${r.invoiceNumber}: ${money(r.paidCents, cur)} ${r.paidInFull ? 'paid in full' : 'received'}`;
  const body = `<p>Hi${r.contactName ? ' ' + esc(String(r.contactName).split(/\s+/)[0]) : ''},</p>`
    + `<p>Thank you for your payment. We received <b>${esc(money(r.paidCents, cur))}</b>${r.paidOn ? ` on ${esc(dateOf(r.paidOn))}` : ''} for invoice <b>${esc(r.invoiceNumber)}</b>${r.paidInFull ? ', which is now paid in full' : `; <b>${esc(money(r.balanceCents, cur))}</b> is still due`}.</p>`
    + (message ? `<p style="padding:10px 14px;border-left:3px solid #4bff9a;background:#f5f5f2">${esc(message).replace(/\n/g, '<br>')}</p>` : '')
    + `<p>Your receipt, ${esc(r.number)}, is attached as a PDF for your records.</p>`;
  return { subject, body, filename: `TFB Receipt ${String(r.number).replace(/[^A-Za-z0-9_-]/g, '-')}.pdf` };
}

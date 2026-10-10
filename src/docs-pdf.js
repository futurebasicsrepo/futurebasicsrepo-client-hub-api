// The documents the hub hands to clients, drawn on the Future Basics letterhead (see brand-pdf.js): the invoice and the project collection.
import { brandDoc, fact, pill, table, money, fmtDate, safe, INK, DIM, LINE, FOG, CUE, GREEN, RED } from './brand-pdf.js';

const STATUS = { paid: ['Paid', GREEN], due: ['Due', INK], draft: ['Draft', DIM], void: ['Void', RED] };
const SUPPORT = 'hub@thefuturebasics.com';

// invoice: the invoices row joined with client_name, project_name, product_title, quote_version.
export function invoicePdf(invoice) {
  const b = brandDoc({ title: `Invoice ${invoice.number}`, kind: 'Invoice', ref: invoice.number, footerNote: `Future Basics  ·  Questions about this invoice: ${SUPPORT}`, subject: `Invoice ${invoice.number} for ${invoice.client_name}` });
  const { doc, L, R, CW } = b, cur = invoice.currency || 'USD', st = STATUS[invoice.status] || [String(invoice.status || '').toUpperCase(), INK];
  const paid = invoice.status === 'paid', voided = invoice.status === 'void';
  let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(34).text('Invoice', L, y, { lineBreak: false });
  pill(b, st[0], R - 76, y + 8, st[1]);
  doc.fillColor(DIM).font('MONO').fontSize(11).text(safe(invoice.number), L, y + 42, { characterSpacing: .6 });
  y += 78;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(.6).strokeColor(LINE).stroke(); y += 16;
  const col = CW / 4 - 10;
  fact(b, 'Billed to', invoice.client_name, L, y, col + 20);
  fact(b, 'Project', invoice.project_name || 'Unassigned', L + col + 30, y, col);
  fact(b, 'Issued', fmtDate(invoice.created_at), L + (col + 10) * 2 + 20, y, col);
  fact(b, paid ? 'Settled' : 'Due', paid ? 'Paid in full' : (invoice.due_date ? fmtDate(invoice.due_date) : 'On receipt'), L + (col + 10) * 3 + 20, y, col);
  y = Math.max(doc.y, y + 40) + 24;
  // what the invoice is for
  const isDeposit = invoice.kind === 'deposit';
  const what = isDeposit ? 'Sample deposit' : (invoice.product_title ? 'Development and production' : 'Project invoice');
  const detail = [invoice.product_title, isDeposit && invoice.quote_version ? `against quote v${invoice.quote_version}` : '', invoice.project_name && !invoice.product_title ? invoice.project_name : ''].filter(Boolean).join('  ·  ');
  y = table(b, [{ h: 'Description', w: 6 }, { h: 'Qty', w: 1, align: 'right' }, { h: `Amount (${cur})`, w: 2, align: 'right', mono: true }],
    [[`${what}${detail ? '\n' + detail : ''}`, '1', money(invoice.amount_cents, cur)]], { y, fontSize: 11, pad: 10 });
  y += 20;
  // total
  const boxW = 250, bx = R - boxW;
  doc.roundedRect(bx, y, boxW, 74, 12).fill(INK);
  doc.fillColor('#b7b7ba').font('MONO').fontSize(8).text(paid ? 'AMOUNT PAID' : voided ? 'VOIDED' : 'TOTAL DUE', bx + 18, y + 16, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#fff').font('SG-B').fontSize(26).text(money(invoice.amount_cents, cur), bx + 18, y + 33, { lineBreak: false });
  doc.fillColor(CUE).circle(R - 18, y + 20, 4).fill();
  doc.fillColor(DIM).font('MONO').fontSize(8).text(`All amounts in ${cur}`, L, y + 30, { width: bx - L - 20, lineBreak: false });
  y += 74 + 28;
  // how to pay
  if (!paid && !voided) {
    doc.roundedRect(L, y, CW, invoice.external_url ? 92 : 70, 12).lineWidth(1).strokeColor(LINE).stroke();
    doc.fillColor(DIM).font('MONO').fontSize(8).text('HOW TO PAY', L + 18, y + 16, { characterSpacing: 1.2, lineBreak: false });
    doc.fillColor(INK).font('SG-M').fontSize(11.5).text(invoice.external_url ? 'Pay securely online. Payment is processed through Shopify.' : 'We will send you the secure payment link. Payment is processed through Shopify.', L + 18, y + 32, { width: CW - 36 });
    if (invoice.external_url) { doc.fillColor(GREEN).font('MONO-M').fontSize(8.5).text(safe(invoice.external_url), L + 18, y + 58, { width: CW - 36, link: invoice.external_url, underline: true }); }
    y += (invoice.external_url ? 92 : 70) + 20;
  } else if (paid) {
    doc.fillColor(GREEN).font('SG-M').fontSize(11.5).text('Thank you. This invoice is paid in full and needs nothing further from you.', L, y, { width: CW }); y = doc.y + 20;
  }
  doc.fillColor(DIM).font('SG').fontSize(9.5).text(`Questions about this invoice? Message us in your project thread in the hub, or write to ${SUPPORT}. Quote the number ${safe(invoice.number)}.`, L, y, { width: CW });
  return b.finish();
}

// products: product rows (with configuration and price_tiers); terms(product) -> { units, moq, unitPrice, setup, shipping, total, priced }; images: Map(productId -> Buffer).
export function collectionPdf({ client, project, products, terms, images }) {
  const b = brandDoc({ title: `${project.name} — product collection`, kind: 'Project collection', ref: project.name, footerNote: `Future Basics  ·  ${client.name}  ·  generated ${fmtDate(new Date())}`, subject: `Product collection for ${client.name}` });
  const { doc, L, R, CW } = b;
  let y = b.bodyTop;
  doc.fillColor(DIM).font('MONO').fontSize(8).text(safe(client.name).toUpperCase(), L, y, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(INK).font('SG-B').fontSize(32).text(safe(project.name), L, y + 14, { width: CW });
  y = doc.y + 6;
  const priced = products.filter(p => terms(p).priced).length;
  doc.fillColor(DIM).font('SG').fontSize(11).text(`${products.length} product${products.length === 1 ? '' : 's'}  ·  ${priced} priced  ·  generated ${fmtDate(new Date())}`, L, y, { width: CW });
  y = doc.y + 18;
  let total = 0, setupT = 0, shipT = 0;
  const gap = 14, cw = (CW - gap) / 2, ch = 258;
  products.forEach((p, i) => {
    const col = i % 2, x = L + col * (cw + gap);
    if (col === 0 && i > 0) y += ch + gap;
    if (col === 0 && y + ch > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
    const t = terms(p), cfg = p.configuration || {};
    if (t.priced) { total += t.total; setupT += t.setup; shipT += t.shipping; }
    doc.roundedRect(x, y, cw, ch, 14).lineWidth(1).strokeColor(LINE).stroke();
    doc.save(); doc.roundedRect(x + 1, y + 1, cw - 2, 96, 13).clip(); doc.rect(x + 1, y + 1, cw - 2, 96).fill(FOG);
    const img = images.get(p.id);
    if (img) { try { doc.image(img, x + 1, y + 1, { fit: [cw - 2, 96], align: 'center', valign: 'center' }); } catch { /* the grey panel stays */ } }
    doc.restore();
    doc.fillColor(INK).font('SG-B').fontSize(13).text(safe(p.title), x + 14, y + 106, { width: cw - 28, height: 18, ellipsis: true, lineBreak: false });
    const spec = [cfg.material, cfg.decoration_method, (cfg.colorways || []).slice(0, 3).join(', ')].filter(Boolean).join('  ·  ');
    doc.fillColor(DIM).font('SG').fontSize(8.5).text(safe(spec || 'Specification to follow'), x + 14, y + 126, { width: cw - 28, height: 22, ellipsis: true });
    const rows = [['Units', t.units || 'TBD'], ['MOQ', t.moq || 'TBD'], ['Unit price', t.unitPrice ? money(t.unitPrice) : 'TBD'], ['Setup', money(t.setup)], ['Shipping', money(t.shipping)]];
    let ry = y + 156;
    rows.forEach(([k, v]) => { doc.fillColor(DIM).font('MONO').fontSize(7.5).text(k.toUpperCase(), x + 14, ry, { characterSpacing: .8, lineBreak: false }); doc.fillColor(INK).font('SG-M').fontSize(10).text(String(v), x + 14, ry - 1, { width: cw - 28, align: 'right', lineBreak: false }); ry += 14; });
    doc.moveTo(x + 14, y + 226).lineTo(x + cw - 14, y + 226).lineWidth(.6).strokeColor(LINE).stroke();
    doc.fillColor(DIM).font('MONO').fontSize(7.5).text(t.estimated ? 'PRODUCT TOTAL · ESTIMATE' : 'PRODUCT TOTAL', x + 14, y + 238, { characterSpacing: .8, lineBreak: false });
    doc.fillColor(INK).font('SG-B').fontSize(12).text(t.units && t.unitPrice ? money(t.total) : 'TBD', x + 14, y + 235, { width: cw - 28, align: 'right', lineBreak: false });
  });
  y += ch + gap;
  if (y + 100 > b.bodyBottom) { doc.addPage(); y = b.bodyTop; }
  doc.roundedRect(L, y, CW, 96, 14).fill(INK);
  doc.fillColor('#b7b7ba').font('MONO').fontSize(8).text('PROJECT TOTAL', L + 22, y + 20, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor('#fff').font('SG-B').fontSize(28).text(money(total), L + 22, y + 38, { lineBreak: false });
  doc.fillColor('#b7b7ba').font('SG').fontSize(9).text(`Units and product, including ${money(setupT)} setup and ${money(shipT)} shipping. Products without a price yet are not counted.`, L + 290, y + 40, { width: CW - 312, align: 'right' });
  doc.fillColor(CUE).circle(R - 20, y + 20, 4).fill();
  return b.finish();
}

// The signed vendor information form, for the finance file. sub: the vendor_submissions row (with client_name); data: the decrypted details;
// full: show the whole bank and tax numbers (staff only, logged), otherwise only the last four digits.
export function vendorPdf({ sub, data, full = false }) {
  const b = brandDoc({ title: `Vendor information — ${sub.company_name}`, kind: 'Vendor information form', ref: `v${sub.version}`, footerNote: `Future Basics  ·  Vendor ${safe(sub.company_name)}  ·  confidential: contains payment details`, subject: 'Vendor information form' });
  const { doc, L, R, CW } = b, STATE = { approved: ['Approved', GREEN], pending: ['Pending review', INK], rejected: ['Not approved', RED], superseded: ['Superseded', DIM] }[sub.status] || ['', INK];
  const mask = v => !v ? '' : full ? v : `••••${String(v).slice(-4)}`;
  let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(30).text('Vendor Information Form', L, y, { lineBreak: false });
  pill(b, STATE[0], R - 118, y + 8, STATE[1]);
  doc.fillColor(DIM).font('MONO').fontSize(10).text(`Version ${sub.version}  ·  submitted ${fmtDate(sub.created_at)}${sub.client_name ? '  ·  hub client ' + safe(sub.client_name) : ''}`, L, y + 40, { characterSpacing: .4 });
  y += 74; doc.moveTo(L, y).lineTo(R, y).lineWidth(.6).strokeColor(LINE).stroke(); y += 14;
  const section = (title) => { doc.fillColor(INK).font('MONO-M').fontSize(9).text(title, L, y, { characterSpacing: 1.4, lineBreak: false }); y += 20; };
  const row = (a, b2) => { const w = (CW - 24) / 2; const y1 = fact(b, a[0], a[1], L, y, w), y2 = b2 ? fact(b, b2[0], b2[1], L + w + 24, y, w) : y; y = Math.max(y1, y2, y + 38) + 10; };
  section('COMPANY INFORMATION');
  row(['Company name', data.companyName], ['Tax ID #', mask(data.taxId)]);
  row(['Company physical address', data.address], ['City, state, zip code', data.cityStateZip]);
  row(['VAT reg. no (if applicable)', data.vatNo], ['Contact name', data.contactName]);
  row(['Contact phone number', data.contactPhone], ['Email address', data.contactEmail]);
  y += 6; section('BANK INFORMATION');
  row(['Preferred payment method', METHODS_LABEL[sub.method] || sub.method], ['Payment currency', sub.currency]);
  if (sub.method !== 'paypal') {
    row(['Name as on bank account', data.accountName], ['Name of bank', data.bankName]);
    row(['Bank address', data.bankAddress], ['Bank account #', mask(data.accountNumber)]);
    row(['ABA / routing / bank code (ACH)', mask(data.routing)], ['SWIFT #', data.swift]);
    row(['Bank telephone # or email', data.bankContact]);
  } else row(['PayPal email', full ? data.paypalEmail : data.paypalEmail.replace(/^(.).*(@.*)$/, '$1••••$2')], ['Venmo', full ? data.venmo : (data.venmo ? data.venmo.slice(0, 2) + '••••' : '')]);
  if (!full) { doc.fillColor(DIM).font('SG').fontSize(8.5).text('Account and tax numbers are shown by their last four digits only. The full numbers are held encrypted and opened only by named finance users; each opening is logged.', L, y - 4, { width: CW }); y = doc.y + 10; }
  y += 4; doc.roundedRect(L, y, CW, 92, 12).lineWidth(1).strokeColor(LINE).stroke();
  doc.fillColor(DIM).font('MONO').fontSize(8).text('VENDOR AUTHORIZATION', L + 18, y + 14, { characterSpacing: 1.2, lineBreak: false });
  doc.fillColor(INK).font('SG').fontSize(9.5).text('By signing, the undersigned attests the banking information on this form is accurate and complete, and agrees to be paid by The Future Basics for invoices owed to their company to the account named above. Inaccurate banking information may result in delayed payments.', L + 18, y + 30, { width: CW - 36 });
  y += 92 + 14;
  const w3 = (CW - 48) / 3; fact(b, 'Signed by', sub.signed_name, L, y, w3); fact(b, 'Title', sub.signed_title, L + w3 + 24, y, w3); y = fact(b, 'Signed on', `${new Date(sub.signed_at).toISOString().replace('T', ' ').slice(0, 16)} UTC`, L + (w3 + 24) * 2, y, w3) + 8;
  doc.fillColor(DIM).font('MONO').fontSize(7.5).text(`Typed signature recorded from the hub${sub.signed_ip ? ' · from ' + safe(sub.signed_ip) : ''}. Tax form (W-9 / W-8): ${safe(sub.tax_form_name || 'not attached')}.${sub.bank_changed ? ' Bank details differ from the previously approved version.' : ''}${sub.status === 'approved' ? ` Approved ${fmtDate(sub.reviewed_at)}${sub.verified_call ? ' after a verification call' : ''}.` : ''}`, L, y, { width: CW });
  return b.finish();
}
const METHODS_LABEL = { ach: 'ACH (preferred)', wire: 'Wire transfer (international)', paypal: 'PayPal / Venmo' };

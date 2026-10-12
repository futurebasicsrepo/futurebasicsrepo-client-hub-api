// The contract as a PDF on the Future Basics letterhead (see brand-pdf.js): the title and the parties, every clause in order, the payment schedule as a table,
// the signature blocks, and once anyone has signed, a certificate page with the hash of what was signed and the trail of who did what and when.
import { brandDoc, fact, pill, table, money, safe, INK, DIM, LINE, FOG, CUE, GREEN, RED } from './brand-pdf.js';

const STATE = { draft: ['Draft', DIM], sent: ['Awaiting signature', INK], signed_by_client: ['Signed by client', INK], executed: ['Fully signed', GREEN], declined: ['Declined', RED], void: ['Void', RED], expired: ['Expired', DIM] };
const stamp = d => { if (!d) return ''; const v = new Date(d); return Number.isNaN(v.getTime()) ? '' : v.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'; };
const shortUa = ua => String(ua || '').replace(/\s+/g, ' ').slice(0, 90);

// rendered: renderContract(...) output. state: { status, sentAt, hash, clientSignature, providerSignature, declined, events[] }
export function contractPdf(rendered, state = {}) {
  const b = brandDoc({ title: `${rendered.title} (${rendered.number})`, kind: 'Agreement', ref: rendered.number, footerNote: `Future Basics  ·  ${rendered.number}  ·  ${safe(rendered.title)}`.slice(0, 120), subject: `Agreement ${rendered.number} between ${rendered.parties.provider.name} and ${rendered.parties.client.company}` });
  const { doc, L, R, CW } = b;
  const room = () => { doc.page.margins.bottom = 70; }; room(); doc.on('pageAdded', room);
  const need = h => { if (doc.y + h > b.bodyBottom) doc.addPage(); };
  const st = STATE[state.status] || STATE.draft, cur = rendered.fee.currency || 'USD';

  // title
  let y = b.bodyTop;
  doc.fillColor(INK).font('SG-B').fontSize(30).text('Agreement', L, y, { lineBreak: false });
  const pw = doc.font('MONO-M').fontSize(8.5).widthOfString(st[0].toUpperCase(), { characterSpacing: 1.4 }) + 20; pill(b, st[0], R - pw, y + 8, st[1]);
  y += 40;
  doc.fillColor(INK); b.font('SG-M', rendered.title).fontSize(14).text(safe(rendered.title), L, y, { width: CW - 20 }); y = doc.y + 4;
  doc.fillColor(DIM).font('MONO').fontSize(10).text(safe(rendered.number), L, y, { characterSpacing: .6 }); y = doc.y + 14;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(.6).strokeColor(LINE).stroke(); y += 14;
  const cw = (CW - 30) / 3;
  fact(b, 'Between', `${rendered.parties.provider.name}`, L, y, cw); fact(b, 'And', rendered.parties.client.company, L + cw + 15, y, cw); fact(b, 'Fixed fee', money(rendered.fee.totalCents, cur), L + (cw + 15) * 2, y, cw, { big: true });
  doc.y = y + 44; doc.x = L;

  const heading = (n, t) => { need(60); doc.moveDown(.9); doc.fillColor(DIM).font('MONO').fontSize(8).text(String(n).padStart(2, '0'), L, doc.y, { characterSpacing: 1, lineBreak: false }); doc.fillColor(INK); b.font('SG-B', t).fontSize(13).text(safe(t), L + 26, doc.y - 1.5, { width: CW - 26 }); doc.moveDown(.25); doc.x = L; };
  const para = t => { for (const p of String(t || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)) { need(30); doc.fillColor(INK); b.font('SG', p).fontSize(10).text(safe(p), L, doc.y, { width: CW, lineGap: 2.2, align: 'left' }); doc.moveDown(.55); } };

  rendered.sections.forEach((s, i) => {
    heading(i + 1, s.title); if (s.kind !== 'schedule') para(s.body);
    if (s.kind === 'scope') {
      for (const it of s.items) { need(22); doc.fillColor(CUE).circle(L + 5, doc.y + 6, 2.2).fill(); doc.fillColor(INK); b.font('SG', it).fontSize(10).text(safe(it), L + 16, doc.y, { width: CW - 16, lineGap: 2 }); doc.moveDown(.3); }
      if (s.notIncluded?.length) { doc.moveDown(.4); doc.fillColor(DIM).font('MONO').fontSize(7.5).text('NOT INCLUDED', L, doc.y, { characterSpacing: .9 }); doc.moveDown(.2); for (const it of s.notIncluded) { need(20); doc.fillColor(DIM); b.font('SG', it).fontSize(9.5).text('–  ' + safe(it), L + 4, doc.y, { width: CW - 4, lineGap: 2 }); doc.moveDown(.2); } }
    } else if (s.kind === 'timeline') {
      doc.moveDown(.2); table(b, [{ h: 'Milestone', w: 2 }, { h: 'Date', w: 2 }], s.rows, { y: doc.y, pad: 6 }); doc.moveDown(.5); doc.x = L;
    } else if (s.kind === 'fee') {
      need(60); const yy = doc.y + 2; doc.roundedRect(L, yy, CW, 46, 10).fill(INK); doc.fillColor('#fff').font('MONO').fontSize(8).text('FIXED FEE', L + 16, yy + 10, { characterSpacing: 1, lineBreak: false }); doc.fillColor('#fff').font('SG-B').fontSize(20).text(safe(s.totalText), L + 16, yy + 21, { lineBreak: false }); doc.y = yy + 56; doc.x = L;
    } else if (s.kind === 'schedule') {
      doc.fillColor(INK).font('SG-M').fontSize(10); const sum = safe(s.summary); need(30); doc.text(sum, L, doc.y, { width: CW, lineGap: 2 }); doc.moveDown(.5);
      table(b, [{ h: 'Payment', w: 3 }, { h: 'Due', w: 2.4 }, { h: 'Amount', w: 1.6, align: 'right', mono: true }], s.rows.map(r => [r.label, r.when, r.amountText]), { y: doc.y, pad: 6 }); doc.moveDown(.7); doc.x = L; para(s.body);
    }
  });

  // signatures
  need(170); doc.moveDown(1.1);
  doc.fillColor(INK).font('SG-B').fontSize(13).text('Signatures', L, doc.y); doc.moveDown(.3);
  doc.fillColor(DIM).font('SG').fontSize(8.5).text('By signing, each party agrees to this agreement. Typing a name in the signing form is a signature with the same effect as signing on paper.', L, doc.y, { width: CW, lineGap: 1.5 });
  const top = doc.y + 12, colW = (CW - 24) / 2;
  const block = (x, who, signer, sig) => {
    doc.roundedRect(x, top, colW, 112, 10).lineWidth(.8).strokeColor(LINE).stroke();
    doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe(who).toUpperCase(), x + 12, top + 10, { width: colW - 24, characterSpacing: .8, lineBreak: false });
    if (sig) { doc.fillColor(INK).font('Helvetica-Oblique').fontSize(18).text(safe(sig.name), x + 12, top + 28, { width: colW - 24, lineBreak: false, height: 24, ellipsis: true }); }
    doc.moveTo(x + 12, top + 56).lineTo(x + colW - 12, top + 56).lineWidth(.7).strokeColor(INK).stroke();
    doc.fillColor(INK); b.font('SG-M', sig ? sig.name : signer.name).fontSize(10).text(safe(sig ? sig.name : signer.name || ' '), x + 12, top + 62, { width: colW - 24, lineBreak: false, height: 14, ellipsis: true });
    const title = sig?.title || signer.title; if (title) doc.fillColor(DIM).font('SG').fontSize(9).text(safe(title), x + 12, top + 76, { width: colW - 24, lineBreak: false, height: 12, ellipsis: true });
    doc.fillColor(sig ? GREEN : DIM).font('MONO').fontSize(7.5).text(sig ? `SIGNED ${stamp(sig.at)}` : 'NOT YET SIGNED', x + 12, top + 94, { width: colW - 24, characterSpacing: .5, lineBreak: false });
  };
  block(L, `For ${rendered.parties.provider.name}`, { name: rendered.parties.provider.signerName, title: rendered.parties.provider.signerTitle }, state.providerSignature);
  block(L + colW + 24, `For ${rendered.parties.client.company}`, { name: rendered.parties.client.signerName, title: rendered.parties.client.signerTitle }, state.clientSignature);
  doc.y = top + 122;
  if (state.declined) { doc.fillColor(RED).font('SG-M').fontSize(10).text(`Declined ${stamp(state.declined.at)}${state.declined.reason ? ': ' + safe(state.declined.reason) : ''}`, L, doc.y + 4, { width: CW }); }

  // certificate
  if (state.clientSignature || state.providerSignature) {
    doc.addPage(); let cy = b.bodyTop;
    doc.fillColor(INK).font('SG-B').fontSize(22).text('Certificate of signing', L, cy, { lineBreak: false }); cy += 34;
    doc.fillColor(DIM).font('SG').fontSize(9.5).text('This page records how the agreement was signed. The fingerprint below is a SHA-256 hash of the full text of the agreement, its fee and its payment schedule as they stood when it was sent. If one character of any of them changes, the fingerprint changes.', L, cy, { width: CW, lineGap: 2 }); cy = doc.y + 14;
    fact(b, 'Agreement', `${rendered.number}  ·  ${rendered.title}`, L, cy, CW); cy = doc.y + 8;
    doc.fillColor(DIM).font('MONO').fontSize(7.5).text('DOCUMENT FINGERPRINT (SHA-256)', L, cy, { characterSpacing: .9, lineBreak: false }); doc.fillColor(INK).font('MONO').fontSize(8.5).text(safe(state.hash || ''), L, cy + 12, { width: CW }); cy = doc.y + 14;
    const rows = [];
    if (state.sentAt) rows.push(['Sent for signature', stamp(state.sentAt), '', '']);
    for (const e of (state.events || []).filter(e => ['viewed'].includes(e.kind)).slice(0, 1)) rows.push(['First opened by the client', stamp(e.at), e.ip || '', shortUa(e.meta?.ua)]);
    for (const [who, sig] of [['Signed for ' + rendered.parties.provider.name, state.providerSignature], ['Signed for ' + rendered.parties.client.company, state.clientSignature]]) if (sig) rows.push([`${who}: ${sig.name}${sig.title ? ', ' + sig.title : ''}`, stamp(sig.at), sig.ip || '', shortUa(sig.ua)]);
    table(b, [{ h: 'Event', w: 3.2 }, { h: 'When', w: 1.7, mono: true }, { h: 'From', w: 1.2, mono: true }, { h: 'Device', w: 2 }], rows, { y: cy, fontSize: 8.5, pad: 6 }); cy = doc.y + 14; doc.x = L;
    const cs = state.clientSignature;
    if (cs) {
      const bits = [`Consent to sign electronically: ${cs.esign ? 'given' : 'not recorded'}.`, `Read and agreed to the contract: ${cs.agree ? 'yes' : 'no'}.`];
      if (cs.method) bits.push(`Payment method chosen: ${cs.method === 'ach' ? 'ACH bank debit' : 'card'}.`);
      if (cs.autopay) bits.push('Authorized the automatic payments in the payment schedule.');
      doc.fillColor(INK).font('SG').fontSize(9.5).text(bits.join(' '), L, cy, { width: CW, lineGap: 2 });
    }
  }
  return b.finish();
}

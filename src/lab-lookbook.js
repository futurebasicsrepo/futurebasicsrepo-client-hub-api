// Testing demand before we commit to bulk: a lookbook of the range in one click (a PDF in the brand template, one piece per page), and a
// customer poll on a link (the page is src/lab-poll.html at /lab/poll/:token) where people say, piece by piece, whether they would buy it,
// what they make of the price, and what they would change. The votes are counted into a demand read per piece, so the team sees which
// pieces to make first and which to drop before a single sample is cut.
import { createHash } from 'node:crypto';
import { brandDoc, fact, safe, INK, DIM, LINE, FOG } from './brand-pdf.js';
import { categoryLabel } from './lab.js';
import { cleanColourways } from './lab-materials.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const VOTES = ['yes', 'maybe', 'no'], PRICE_FEEL = ['low', 'fair', 'high'];
const money = c => (c == null ? '' : `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`);
// a piece as the lookbook and the poll show it: words only, nothing from the check or the cost
export const pieceView = c => ({ id: c.id, name: c.name, category: c.category, categoryLabel: categoryLabel(c.category), price: c.price_cents == null ? null : c.price_cents / 100, priceLabel: money(c.price_cents),
  description: clip(c.spec?.description, 600), fabric: clip(c.spec?.fabric, 160), colors: (Array.isArray(c.spec?.colors) ? c.spec.colors : []).slice(0, 4), details: (Array.isArray(c.spec?.details) ? c.spec.details : []).slice(0, 6), colourways: cleanColourways(c.spec?.colourways), twist: clip(c.twist, 400), hasImage: Boolean(c.has_image ?? c.image) });

// the votes of one voter, cleaned: only pieces in the poll, one vote per piece
export function cleanVotes(input, pieceIds) {
  const allowed = new Set(pieceIds), out = new Map();
  for (const v of Array.isArray(input) ? input : []) {
    const id = String(v?.id || ''); if (!allowed.has(id)) continue;
    const vote = VOTES.includes(v?.vote) ? v.vote : ''; if (!vote) continue;
    out.set(id, { id, vote, price: PRICE_FEEL.includes(v?.price) ? v.price : '', note: clip(v?.note, 400) });
  }
  return [...out.values()];
}
// who is voting, as one key, so a second visit replaces the first vote instead of adding to it (an email when given, else the address)
export const voterKey = ({ email = '', ip = '' } = {}) => createHash('sha256').update(email ? `e:${String(email).trim().toLowerCase()}` : `ip:${ip}`).digest('hex').slice(0, 32);
export const cleanEmail = v => { const s = clip(v, 120).toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; };
// the demand read per piece: yes counts 1, maybe ½, no 0 → a share of the people who voted, and a rank
export function pollResults(pieces, votes) {
  const by = new Map(pieces.map(p => [p.id, { id: p.id, name: p.name, categoryLabel: p.categoryLabel, priceLabel: p.priceLabel, yes: 0, maybe: 0, no: 0, low: 0, fair: 0, high: 0, notes: [] }]));
  const voters = new Set();
  for (const v of votes) { const r = by.get(v.concept_id || v.id); if (!r) continue; voters.add(v.voter_key || v.voter || '?'); r[v.vote]++; if (v.price) r[v.price]++; if (v.note) r.notes.push({ who: v.voter_name || v.voter || 'A customer', note: v.note }); }
  const rows = [...by.values()].map(r => { const n = r.yes + r.maybe + r.no; return { ...r, votes: n, demand: n ? Math.round(((r.yes + r.maybe / 2) / n) * 100) : null, priceFeel: r.low + r.fair + r.high ? (r.high > r.fair && r.high >= r.low ? 'too high' : r.low > r.fair && r.low > r.high ? 'could be higher' : 'fair') : '' }; });
  rows.sort((a, b) => (b.demand ?? -1) - (a.demand ?? -1) || b.yes - a.yes || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = r.demand == null ? null : i + 1; r.read = r.demand == null ? 'no votes yet' : r.demand >= 70 ? 'make it' : r.demand >= 45 ? 'worth a sample' : 'think again'; });
  return { voters: voters.size, pieces: rows };
}

// the lookbook: a cover, then one page per piece with its picture and its words. `pieces` carry `image` (JPEG buffer) when they have one.
export async function lookbookPdf({ plan, pieces, brandName = 'Future Basics', note = '' }) {
  const b = brandDoc({ title: `${plan.name} lookbook`, kind: 'Lookbook', ref: plan.season || '', footerNote: `${brandName} · ${plan.name}${plan.season ? ' · ' + plan.season : ''} · a lookbook, not a price list: prices are planned` });
  const { doc, L, CW, H } = b;
  // cover
  let y = b.bodyTop + 120;
  doc.fillColor(DIM).font('MONO').fontSize(9).text(safe(`${brandName.toUpperCase()}  ·  ${plan.season ? plan.season.toUpperCase() : 'LOOKBOOK'}`), L, y, { characterSpacing: 2 }); y += 26;
  doc.fillColor(INK).font('SG-B').fontSize(40).text(safe(plan.name), L, y, { width: CW, lineGap: -4 }); y = doc.y + 18;
  if (plan.brief) { doc.fillColor(INK).font('SG').fontSize(13).text(safe(plan.brief), L, y, { width: CW * .72, lineGap: 2 }); y = doc.y + 18; }
  doc.fillColor(DIM).font('SG').fontSize(10.5).text(safe(`${pieces.length} piece${pieces.length === 1 ? '' : 's'}${note ? ' · ' + note : ''}`), L, y, { width: CW });
  // contents
  y = doc.y + 30; doc.fillColor(INK).font('SG-B').fontSize(11).text('In this book', L, y); y = doc.y + 6;
  doc.font('SG').fontSize(10);
  for (const [i, p] of pieces.entries()) { if (y > H - 90) { doc.addPage(); y = b.bodyTop; } doc.fillColor(DIM).font('MONO').fontSize(8.5).text(String(i + 1).padStart(2, '0'), L, y + 1, { lineBreak: false }); doc.fillColor(INK).font('SG').fontSize(10).text(safe(`${p.name}  ·  ${p.categoryLabel}${p.priceLabel ? '  ·  ' + p.priceLabel : ''}`), L + 24, y, { width: CW - 24, lineBreak: false }); y += 16; }
  // one page per piece
  for (const [i, p] of pieces.entries()) {
    doc.addPage(); y = b.bodyTop;
    const picW = Math.round(CW * .56), picH = H - y - 70, txtX = L + picW + 22, txtW = CW - picW - 22;
    doc.rect(L, y, picW, picH).fill(FOG);
    if (p.image) { try { doc.image(p.image, L + 8, y + 8, { fit: [picW - 16, picH - 16], align: 'center', valign: 'center' }); } catch { doc.fillColor(DIM).font('SG').fontSize(10).text('Picture could not be read', L + 16, y + picH / 2, { width: picW - 32, align: 'center' }); } }
    else doc.fillColor(DIM).font('SG').fontSize(10).text('No picture yet', L + 16, y + picH / 2, { width: picW - 32, align: 'center' });
    doc.rect(L, y, picW, picH).lineWidth(.6).strokeColor(LINE).stroke();
    let ty = y;
    doc.fillColor(DIM).font('MONO').fontSize(8.5).text(safe(`${String(i + 1).padStart(2, '0')}  ·  ${p.categoryLabel.toUpperCase()}`), txtX, ty, { width: txtW, characterSpacing: 1 }); ty = doc.y + 8;
    doc.fillColor(INK).font('SG-B').fontSize(22).text(safe(p.name), txtX, ty, { width: txtW, lineGap: -2 }); ty = doc.y + 10;
    if (p.priceLabel) { fact(b, 'Planned price', p.priceLabel, txtX, ty, txtW / 2, { big: true }); ty += 44; }
    if (p.description) { doc.fillColor(INK).font('SG').fontSize(11).text(safe(p.description), txtX, ty, { width: txtW, lineGap: 2 }); ty = doc.y + 12; }
    const rows = [['Fabric', p.fabric], ['Colours', p.colors.join(', ')], ['Details', p.details.join(' · ')], ['Ours', p.twist]].filter(r => r[1]);
    for (const [k, v] of rows) { doc.fillColor(DIM).font('MONO').fontSize(7.5).text(k.toUpperCase(), txtX, ty, { characterSpacing: 1 }); doc.fillColor(INK).font('SG').fontSize(10).text(safe(v), txtX, doc.y + 1, { width: txtW, lineGap: 1 }); ty = doc.y + 9; }
    if (p.colourways.length) { let cx = txtX; const cy = Math.min(ty + 4, H - 100); for (const cw of p.colourways.slice(0, 6)) { doc.rect(cx, cy, 22, 22).fill(cw.hex || '#ddd'); doc.rect(cx, cy, 22, 22).lineWidth(.5).strokeColor(LINE).stroke(); cx += 28; } doc.fillColor(DIM).font('SG').fontSize(8.5).text(safe(p.colourways.map(c => c.name).join(' · ')), txtX, cy + 27, { width: txtW }); }
  }
  return b.finish();
}

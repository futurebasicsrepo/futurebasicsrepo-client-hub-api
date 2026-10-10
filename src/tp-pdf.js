// The tech pack as a PDF the server makes, the same document the page prints: cover, design details, colourways, materials,
// measurements, construction, labels and care, artwork, electronics, the sample room's checks, reference pictures and sign-off.
// It is made when a version is published (and again when the signatures change) and filed in the product's folder, so the client
// always has the PDF of every version without anyone pressing print.
import sharp from 'sharp';
import './tp-units.js';
import './elec.js';
import './categories.js';
import { brandDoc, fact, table, safe, fmtDate, INK, DIM, LINE, FOG, CUE, GREEN } from './brand-pdf.js';
import { normalizeTechPack } from './techpack.js';

const { metricOf } = globalThis.FBTP_UNITS, CAT = globalThis.FBCat, ELEC = globalThis.FBElec;
const GREEN_FILL = '#e2f1e7';

// A data: image as a JPEG pdfkit can embed, shrunk to what a page can show. Anything that will not decode is left out.
async function pic(dataUri, max = 1500) {
  try {
    const m = /^data:image\/[a-z+]+;base64,(.+)$/i.exec(String(dataUri || '')); if (!m) return null;
    const out = await sharp(Buffer.from(m[1], 'base64'), { density: 150 }).flatten({ background: '#f3f2ee' }).resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer({ resolveWithObject: true });
    return { buf: out.data, w: out.info.width, h: out.info.height };
  } catch { return null; }
}
// Draw an image to fit a box, centred; returns where it landed.
function place(doc, im, x, y, w, h, { frame = true } = {}) {
  const k = Math.min(w / im.w, h / im.h), dw = im.w * k, dh = im.h * k, dx = x + (w - dw) / 2, dy = y + (h - dh) / 2;
  if (frame) doc.rect(x, y, w, h).fill('#f3f2ee');
  doc.image(im.buf, dx, dy, { width: dw, height: dh });
  if (frame) doc.rect(x, y, w, h).lineWidth(.6).strokeColor(LINE).stroke();
  return { x: dx, y: dy, w: dw, h: dh };
}
function heading(b, n, title, sub) {
  const { doc, L, R, CW } = b; let y = doc.y;
  doc.roundedRect(L, y, 26, 20, 3).fill(INK); doc.fillColor('#fff').font('MONO-M').fontSize(10).text(n, L, y + 5.5, { width: 26, align: 'center', lineBreak: false });
  doc.fillColor(INK).font('SG-B').fontSize(20).text(safe(title), L + 36, y - 1, { lineBreak: false });
  if (sub) doc.fillColor(DIM).font('SG').fontSize(8.5).text(safe(sub), L + 36 + 200, y + 4, { width: CW - 36 - 200, align: 'right', lineBreak: false });
  doc.moveTo(L, y + 28).lineTo(R, y + 28).lineWidth(1.8).strokeColor(INK).stroke();
  doc.y = y + 40; return doc.y;
}
const mini = (b, text, y) => { b.doc.fillColor(INK).font('MONO-M').fontSize(8).text(safe(text).toUpperCase(), b.L, y, { characterSpacing: 1, lineBreak: false }); b.doc.y = y + 14; return b.doc.y; };
const room = (b, h) => { if (b.doc.y + h > b.bodyBottom) { b.doc.addPage(); return true; } return false; };
const kv = (b, label, value, x, y, w) => fact(b, label, value, x, y, w);
const swatch = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#e6e6e2';

export async function techPackPdf({ pack: input, product = {}, version = null, publishedAt = null, verification = null, revisions = [], lockedAt = null, client = '', project = '' }) {
  const p = normalizeTechPack(input), st = p.style, title = st.styleName || product.title || 'Tech pack';
  const ver = version ? `v${version}` : 'Draft';
  const b = brandDoc({ title: `${title} — tech pack ${ver}`, kind: 'Tech pack', ref: `${[st.styleNumber, ver].filter(Boolean).join(' · ')}${st.season ? ' · ' + st.season : ''}`, footerNote: `${title}  ·  ${ver}  ·  generated ${fmtDate(new Date())}`, subject: `Tech pack for ${title}`, size: 'LETTER', layout: 'landscape', margin: 40 });
  const { doc, L, R, CW } = b;
  const sample = st.sampleSize || '';
  const viewsWithCallouts = p.sketches.filter(x => x.callouts.length);
  const tiles = p.renderings.filter(x => x.image && !/^cutout-/.test(String(x.id || '')));
  const refs = p.sketches.filter(x => x.image && !x.callouts.length && !/^cutout-/.test(String(x.id || '')));
  const hasFinish = p.labels.length || Object.values(p.packaging).some(Boolean) || Object.values(p.care).some(Boolean) || p.notes;
  const v = verification, group = CAT.groupOf(st.category, st.styleName || product.title);
  const present = [['Design details', viewsWithCallouts.length > 0], ['Colourways', tiles.length > 0 || p.parts.length > 0], ['Materials & trims', p.bom.length > 0], ['Measurements', p.pom.length > 0], ['Construction', p.construction.length > 0],
    ['Labels, packaging & care', Boolean(hasFinish)], ['Artwork', p.artwork.length > 0], ['Electronics', p.electronics.enabled], ['Sample room checks', true], ['Reference pictures', refs.length > 0], ['Sign-off', Boolean(v)]].filter(x => x[1]).map((x, i) => ({ title: x[0], n: String(i + 1).padStart(2, '0') }));
  const num = t => present.find(x => x.title === t)?.n;

  // ---- cover ----
  const heroSk = p.sketches.find(x => x.hero && x.hero.image), cover = heroSk ? await pic(heroSk.hero.image) : (tiles[0] ? await pic(tiles[0].image) : (p.sketches.find(x => x.image) ? await pic(p.sketches.find(x => x.image).image) : null));
  let y = b.bodyTop - 4;
  doc.fillColor(DIM).font('MONO').fontSize(8).text(`TECH PACK  ·  ${ver}${publishedAt ? '  ·  PUBLISHED ' + fmtDate(publishedAt).toUpperCase() : '  ·  NOT YET PUBLISHED'}${lockedAt ? '  ·  LOCKED' : ''}`, L, y, { characterSpacing: 1, lineBreak: false });
  doc.fillColor(INK).font('SG-B').fontSize(36).text(safe(title), L, y + 14, { width: CW * .55, lineGap: -2 });
  y = doc.y + 2; if (client) { doc.fillColor(DIM).font('MONO').fontSize(8.5).text(safe(`${client}${project ? '  ·  ' + project : ''}`).toUpperCase(), L, y, { characterSpacing: 1, lineBreak: false }); y += 16; }
  const lw = CW * .42; doc.moveTo(L, y + 6).lineTo(L + lw, y + 6).lineWidth(1.8).strokeColor(INK).stroke(); y += 20;
  const facts = [['Style no.', st.styleNumber], ['Season', st.season], ['Category', st.category], ['Designer', st.designer || 'Future Basics'], ['Sample size', st.sampleSize], ['Fit block', st.fitBlock], ['Size run', p.sizes.join(' · ')], ['Fabric', st.fabricSummary]].filter(x => x[1]);
  let fy = y; facts.forEach((f, i) => { const col = i % 2, row = Math.floor(i / 2), fx = L + col * (lw / 2 + 4); const hh = kv(b, f[0], f[1], fx, y + row * 44, lw / 2 - 12); fy = Math.max(fy, hh); });
  y = Math.max(fy, y + Math.ceil(facts.length / 2) * 44) + 6;
  if (st.description) { doc.fillColor(INK).font('SG').fontSize(10).text(safe(st.description), L, y, { width: lw - 8, height: 80, ellipsis: true }); y = doc.y + 10; }
  if (p.colorways.length) { y = mini(b, 'Colourways', y); doc.y = y; for (const c of p.colorways.slice(0, 7)) { doc.circle(L + 6, y + 6, 5).lineWidth(.6).fillAndStroke(swatch(c.swatch), '#666'); doc.fillColor(INK).font('SG-M').fontSize(10).text(safe(c.name), L + 18, y, { width: lw * .55, lineBreak: false }); doc.fillColor(DIM).font('MONO').fontSize(8.5).text(safe(c.code || ''), L + lw * .55 + 18, y + 1, { width: lw * .45 - 20, lineBreak: false }); y += 17; } }
  if (v) { y += 6; const bw = (lw - 10) / 3; [['Client', v.clientSign], ['Future Basics', v.brandSign], ['Factory', v.factorySign]].forEach(([w, sg], i) => { const x = L + i * (bw + 5); if (sg) doc.roundedRect(x, y, bw, 22, 3).fillAndStroke(GREEN_FILL, GREEN); else doc.roundedRect(x, y, bw, 22, 3).lineWidth(.8).strokeColor(LINE).stroke();
      if (sg) doc.moveTo(x + 7, y + 11).lineTo(x + 10, y + 14.5).lineTo(x + 15, y + 7.5).lineWidth(1.6).strokeColor(GREEN).stroke();
      doc.fillColor(sg ? GREEN : DIM).font('MONO-M').fontSize(7.5).text(w.toUpperCase(), x + (sg ? 20 : 7), y + 8, { width: bw - 22, lineBreak: false, characterSpacing: .6 }); }); }
  if (cover) place(doc, cover, L + lw + 20, b.bodyTop - 4, CW - lw - 20, b.bodyBottom - b.bodyTop - 92);
  doc.fillColor(DIM).font('MONO').fontSize(7.5).text(heroSk ? 'APPROVED HERO IMAGE' : 'REFERENCE PICTURE', L + lw + 20, b.bodyBottom - 84, { characterSpacing: 1, lineBreak: false });
  // contents: wraps onto a second line when the sections do not fit on one
  { const items = present.map(x => { doc.font('MONO-M').fontSize(8); const wn = doc.widthOfString(x.n) + 4; doc.font('SG').fontSize(9); return { ...x, wn, w: wn + doc.widthOfString(safe(x.title)) }; });
    const lines = [[]]; let lx = L + 80; for (const it of items) { if (lx + it.w > R && lines.at(-1).length) { lines.push([]); lx = L + 80; } lines.at(-1).push({ ...it, x: lx }); lx += it.w + 16; }
    const top = b.bodyBottom - 20 - lines.length * 15; doc.moveTo(L, top).lineTo(R, top).lineWidth(.6).strokeColor(LINE).stroke();
    doc.fillColor(DIM).font('MONO').fontSize(7.5).text('IN THIS PACK', L, top + 10, { characterSpacing: 1, lineBreak: false });
    lines.forEach((ln, li) => ln.forEach(it => { const ty = top + 9 + li * 15; doc.fillColor(INK).font('MONO-M').fontSize(8).text(it.n, it.x, ty + 1, { lineBreak: false }); doc.font('SG').fontSize(9).text(safe(it.title), it.x + it.wn, ty, { lineBreak: false }); })); }

  // ---- design details ----
  for (const [vi, sk] of viewsWithCallouts.entries()) {
    doc.addPage(); heading(b, num('Design details'), 'Design details', `${sk.view}${sk.hero ? ' · hero image' : sk.label ? ' · ' + sk.label : ''}${viewsWithCallouts.length > 1 ? ` · view ${vi + 1} of ${viewsWithCallouts.length}` : ''}`);
    const onHero = Boolean(sk.hero && sk.hero.image), im = await pic(onHero ? sk.hero.image : sk.image);
    const iw = CW * .56, ih = b.bodyBottom - doc.y - 4, top = doc.y;
    let box = null; if (im) box = place(doc, im, L, top, iw, ih);
    const pos = c => onHero ? { x: c.hx, y: c.hy, photo: c.hphoto } : { x: c.x, y: c.y, photo: c.photo };
    if (box) sk.callouts.forEach(c => { const q = pos(c); if (q.x == null || q.y == null) return; const px = box.x + q.x * box.w, py = box.y + q.y * box.h; doc.circle(px, py, 9.5).lineWidth(1.6).fillAndStroke(INK, '#fff'); doc.fillColor('#fff').font('MONO-M').fontSize(8.5).text(String(c.n), px - 9.5, py - 4.5, { width: 19, align: 'center', lineBreak: false }); });
    const rx = L + iw + 20, rw = CW - iw - 20; let ry = top;
    for (const c of sk.callouts) {
      const q = pos(c), ph = q.photo ? await pic(q.photo, 300) : null, tw = rw - 28 - (ph ? 54 : 0);
      doc.font('SG-B').fontSize(11); let h = doc.heightOfString(safe(c.label || 'Untitled callout'), { width: tw });
      if (c.spec) { doc.font('SG-B').fontSize(9.5); h += doc.heightOfString(safe(c.spec), { width: tw }) + 2; } if (c.note) { doc.font('SG').fontSize(9); h += doc.heightOfString(safe(c.note), { width: tw }) + 2; }
      h = Math.max(h, ph ? 48 : 0) + 14;
      if (ry + h > b.bodyBottom) { doc.addPage(); ry = b.bodyTop; }
      doc.circle(rx + 9, ry + 14, 9).fill(INK); doc.fillColor('#fff').font('MONO-M').fontSize(8.5).text(String(c.n), rx, ry + 10, { width: 18, align: 'center', lineBreak: false });
      let ty = ry + 5; doc.fillColor(INK).font('SG-B').fontSize(11).text(safe(c.label || 'Untitled callout'), rx + 28, ty, { width: tw }); ty = doc.y + 2;
      if (c.spec) { doc.font('SG-B').fontSize(9.5).text(safe(c.spec), rx + 28, ty, { width: tw }); ty = doc.y + 2; } if (c.note) { doc.fillColor('#222').font('SG').fontSize(9).text(safe(c.note), rx + 28, ty, { width: tw }); }
      if (ph) place(doc, ph, rx + rw - 48, ry + 5, 48, 48);
      doc.moveTo(rx, ry + h - 2).lineTo(rx + rw, ry + h - 2).lineWidth(.5).strokeColor(LINE).stroke(); ry += h;
    }
  }

  // ---- colourways ----
  if (present.some(x => x.title === 'Colourways')) {
    doc.addPage(); heading(b, num('Colourways'), 'Colourways', 'colours per the Pantone selects in this pack · concept visuals, not a factory spec');
    if (p.colorways.length) table(b, [{ h: 'Colourway', w: 4 }, { h: 'Pantone C', w: 3, mono: true }, { h: 'Notes', w: 3 }], p.colorways.map(c => [{ t: c.name, swatch: swatch(c.swatch), bold: true }, c.code, c.notes]), { fontSize: 10 });
    if (p.parts.length) { doc.y += 8; mini(b, 'Parts and their colours', doc.y); table(b, [{ h: 'Part', w: 3 }, { h: 'Material', w: 3 }, { h: 'Colour', w: 3 }, { h: 'Pantone C', w: 3, mono: true }, { h: 'Where', w: 3 }], p.parts.map(x => [{ t: x.label, swatch: swatch(x.hex), bold: true }, x.material, x.name, x.code, x.where]), { fontSize: 10 }); }
    if (tiles.length) {
      doc.y += 10; const cols = 3, gap = 12, cw = (CW - gap * (cols - 1)) / cols, chh = 150;
      for (let i = 0; i < tiles.length; i++) {
        const t = tiles[i], im = await pic(t.image, 900), col = i % cols;
        if (col === 0 && i > 0) doc.y += chh + 48;
        if (col === 0 && doc.y + chh + 48 > b.bodyBottom) { doc.addPage(); doc.y = b.bodyTop; }
        const x = L + col * (cw + gap), yy = doc.y; if (im) place(doc, im, x, yy, cw, chh);
        doc.fillColor(INK).font('SG-B').fontSize(9.5).text(safe(t.name || 'Colour rendering'), x, yy + chh + 5, { width: cw, lineBreak: false });
        doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe((t.parts || []).filter(q => q.changed !== false).slice(0, 3).map(q => q.code || q.name).filter(Boolean).join(' · ') || t.note || ''), x, yy + chh + 19, { width: cw, lineBreak: false });
        doc.y = yy;
      }
      doc.y += chh + 48;
    }
  }

  // ---- materials ----
  if (p.bom.length) {
    doc.addPage(); heading(b, num('Materials & trims'), 'Materials & trims', `${p.bom.length} item${p.bom.length === 1 ? '' : 's'}`);
    const keys = ['ref', 'component', 'material', 'color', 'placement', 'qty', 'supplier', 'notes'], has = k => k === 'component' || k === 'material' || p.bom.some(r => r[k]);
    const defs = { ref: { h: 'Ref', w: .7, mono: true, f: r => r.ref }, component: { h: 'Component', w: 1.5, f: r => ({ t: r.component, bold: true }) }, material: { h: 'Material and spec', w: 2.6, f: r => ({ t: r.material, sub: r.spec }) }, color: { h: 'Colour', w: 1.4, f: r => r.color },
      placement: { h: 'Placement', w: 1.4, f: r => r.placement }, qty: { h: 'Qty', w: .8, align: 'right', f: r => ({ t: `${r.qty || ''}${r.unit ? ' ' + r.unit : ''}`.trim(), bold: true }) }, supplier: { h: 'Supplier', w: 1.2, f: r => r.supplier }, notes: { h: 'Notes', w: 1.6, f: r => r.notes } };
    const use = keys.filter(has); table(b, use.map(k => ({ h: defs[k].h, w: defs[k].w, mono: defs[k].mono, align: defs[k].align })), p.bom.map(r => use.map(k => defs[k].f(r))), { fontSize: 10 });
  }

  // ---- measurements ----
  if (p.pom.length) {
    doc.addPage(); heading(b, num('Measurements'), 'Measurements', `${sample ? 'sample size ' + sample + ' · ' : ''}inches, centimetres beneath · garment laid flat`);
    const n = p.sizes.length, fs = n > 9 ? 9 : 10, vw = Math.max(.55, Math.min(1, 6 / n));
    const cols = [{ h: 'Code', w: .6, align: 'center', bold: true }, { h: 'Point of measure', w: 3.2 }, { h: 'Tolerance', w: 1, align: 'center' }, ...p.sizes.map(s => s === sample ? { h: s, small: 'Sample', w: vw, align: 'center', fill: GREEN_FILL, headFill: GREEN } : { h: s, w: vw, align: 'center' })];
    const cm = x => { const m = metricOf(x, 'len'); return m || undefined; };
    table(b, cols, p.pom.map(r => [r.code, { t: r.name, bold: true, sub: r.how }, r.tolerance ? { t: r.tolerance, bold: true, sub: metricOf(r.tolerance, 'tol') || undefined } : '', ...p.sizes.map(s => { const x = r.values[s]; return x ? { t: x, bold: true, sub: cm(x) } : { t: '–' }; })]), { fontSize: fs, pad: 6 });
  }

  // ---- construction ----
  if (p.construction.length) { doc.addPage(); heading(b, num('Construction'), 'Construction', 'stitch, seam, thread, SPI and finish'); table(b, [{ h: 'Area', w: 2, bold: true }, { h: 'Detail', w: 8 }], p.construction.map(r => [r.area, r.detail]), { fontSize: 10.5 }); }

  // ---- labels, packaging, care ----
  if (hasFinish) {
    if (p.construction.length && doc.y + 150 < b.bodyBottom) doc.y += 22; else doc.addPage();
    heading(b, num('Labels, packaging & care'), 'Labels, packaging & care');
    if (p.labels.length) table(b, [{ h: 'Label or item', w: 2, bold: true }, { h: 'Spec', w: 5 }, { h: 'Placement', w: 3 }], p.labels.map(r => [r.item, r.spec, r.placement]), { fontSize: 10 });
    const pk = [['Fold', p.packaging.fold], ['Polybag', p.packaging.polybag], ['Carton', p.packaging.carton], ['Units per carton', p.packaging.unitsPerCarton]].filter(x => x[1]), cr = [['Fibre content', p.care.fiber], ['Country of origin', p.care.countryOfOrigin]].filter(x => x[1]);
    const col = (x, w, t, rows, texts) => { let yy = doc.y; doc.fillColor(INK).font('MONO-M').fontSize(8).text(t.toUpperCase(), x, yy, { characterSpacing: 1, lineBreak: false }); yy += 16; rows.forEach(r => { yy = kv(b, r[0], r[1], x, yy, w) + 6; }); texts.forEach(([k, tx]) => { doc.fillColor(INK).font('SG-B').fontSize(9.5).text(k + '. ', x, yy, { continued: true, width: w }).font('SG').text(safe(tx), { width: w }); yy = doc.y + 6; }); return yy; };
    if (pk.length || p.packaging.notes || cr.length || p.care.instructions || p.care.compliance) {
      room(b, 150); doc.y += 12; const y0 = doc.y, hw = (CW - 24) / 2;
      const a1 = col(L, hw, 'Packaging', pk, p.packaging.notes ? [['Notes', p.packaging.notes]] : []); doc.y = y0;
      const a2 = col(L + hw + 24, hw, 'Care and compliance', cr, [...(p.care.instructions ? [['Care', p.care.instructions]] : []), ...(p.care.compliance ? [['Compliance and testing', p.care.compliance]] : [])]); doc.y = Math.max(a1, a2);
    }
    if (p.notes) { room(b, 70); doc.y += 8; const y0 = doc.y; doc.font('SG').fontSize(10); const h = doc.heightOfString(safe(p.notes), { width: CW - 24 }) + 34; doc.roundedRect(L, y0, CW, h, 5).lineWidth(1.4).strokeColor(INK).stroke(); doc.fillColor(INK).font('MONO-M').fontSize(8).text('NOTES TO THE FACTORY', L + 12, y0 + 10, { characterSpacing: 1, lineBreak: false }); doc.font('SG').fontSize(10).text(safe(p.notes), L + 12, y0 + 24, { width: CW - 24 }); doc.y = y0 + h; }
  }

  // ---- artwork ----
  if (p.artwork.length) {
    doc.addPage(); heading(b, num('Artwork'), 'Artwork', `${p.artwork.length} file${p.artwork.length === 1 ? '' : 's'} · colours as Pantone C`);
    const gap = 16, cw = (CW - gap) / 2, ch = 215;
    for (let i = 0; i < p.artwork.length; i++) {
      const a = p.artwork[i], im = a.image ? await pic(a.image, 1000) : null, col = i % 2;
      if (col === 0 && i > 0) doc.y += ch + 12;
      if (col === 0 && doc.y + ch > b.bodyBottom) { doc.addPage(); doc.y = b.bodyTop; }
      const x = L + col * (cw + gap), yy = doc.y; doc.roundedRect(x, yy, cw, ch, 6).lineWidth(.8).strokeColor(LINE).stroke();
      if (im) place(doc, im, x + 8, yy + 8, cw * .5 - 12, ch - 16, { frame: true });
      const tx = x + cw * .5 + 4, tw = cw * .5 - 14; doc.fillColor(INK).font('SG-B').fontSize(11).text(safe(a.name || 'Artwork'), tx, yy + 10, { width: tw }); let ty = doc.y + 6;
      a.pantones.slice(0, 6).forEach(q => { doc.circle(tx + 5, ty + 5, 5).lineWidth(.6).fillAndStroke(swatch(q.hex), '#666'); doc.fillColor(INK).font('SG-M').fontSize(9).text(safe(q.name || q.hex), tx + 15, ty, { width: tw - 15, lineBreak: false }); doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe(q.code || ''), tx + 15, ty + 10, { width: tw - 15, lineBreak: false }); ty += 25; });
      if (a.placements.length) { doc.fillColor(DIM).font('MONO').fontSize(7.5).text('PLACEMENT', tx, ty + 2, { characterSpacing: 1, lineBreak: false }); ty += 13; a.placements.forEach(pl => { const sk = p.sketches.find(z => z.id === pl.sketchId); doc.fillColor(INK).font('SG').fontSize(9).text(safe(`${sk ? sk.view : ''}${pl.label ? ' · ' + pl.label : ''}${pl.widthIn ? ` · ${pl.widthIn}" wide` : ''}`), tx, ty, { width: tw }); ty = doc.y + 2; }); }
      doc.y = yy;
    }
    doc.y += ch;
  }

  // ---- electronics ----
  if (p.electronics.enabled) {
    const e = p.electronics; doc.addPage(); heading(b, num('Electronics'), 'Electronics', 'what is inside, what it has to pass, how it is built and tested');
    const groups = ELEC.SPEC_GROUPS.map(g => ({ title: g.title, rows: g.fields.filter(([k]) => e.specs[k]).map(([k, label]) => [label, e.specs[k]]) })).filter(g => g.rows.length);
    if (groups.length) { const gw = (CW - 40) / 3; let y0 = doc.y; for (let r = 0; r < groups.length; r += 3) { let rowMax = y0; groups.slice(r, r + 3).forEach((g, i) => { const gx = L + i * (gw + 20); doc.fillColor(INK).font('MONO-M').fontSize(8).text(g.title.toUpperCase(), gx, y0, { characterSpacing: 1, lineBreak: false }); let yy = y0 + 15; g.rows.forEach(r2 => { yy = kv(b, r2[0], r2[1], gx, yy, gw) + 5; }); rowMax = Math.max(rowMax, yy); }); y0 = rowMax + 6; } doc.y = y0; }
    const sect = (t, cols, rows) => { if (!rows.length) return; room(b, 90); doc.y += 8; mini(b, t, doc.y); table(b, cols, rows, { fontSize: 9.5 }); };
    sect('Components', [{ h: 'Ref', w: .8, mono: true }, { h: 'Part', w: 2, bold: true }, { h: 'Manufacturer part no.', w: 2, mono: true }, { h: 'Maker', w: 1.6 }, { h: 'Qty', w: .6, align: 'right' }, { h: 'Notes', w: 2 }], e.components.map(r => [r.ref, r.part, r.mpn, r.maker, r.qty, r.notes]));
    sect('Certifications', [{ h: 'Certification', w: 2.6, bold: true }, { h: 'Market', w: 1.2 }, { h: 'Status', w: 1.1 }, { h: 'Lab', w: 1.2 }, { h: 'Report no.', w: 1.2, mono: true }, { h: 'Notes', w: 2 }], e.certifications.map(r => [r.name, r.market, r.status, r.lab, r.report, r.notes]));
    sect('Tests', [{ h: 'Test', w: 2.4, bold: true }, { h: 'How', w: 3.6 }, { h: 'Pass if', w: 2 }, { h: 'When', w: .8 }], e.tests.map(r => [r.name, r.method, r.accept, r.stage]));
    sect('Build stages', [{ h: 'Stage', w: .8, bold: true }, { h: 'Units', w: .8 }, { h: 'Status', w: 1 }, { h: 'Proves', w: 3.2 }, { h: 'Moves on when', w: 3.2 }], e.stages.map(r => [r.stage, r.qty, r.status, r.goal, r.exit]));
  }

  // ---- the sample room's checks ----
  {
    doc.addPage(); heading(b, num('Sample room checks'), 'Sample room checks', `${CAT.labelOf(st.category, st.styleName || product.title)}${sample ? ' · sample size ' + sample : ''} · tick as you go`);
    const stages = [['first', 'First sample'], ['fit', 'Fit and pre-production sample'], ['final', 'Before it ships']];
    for (const [i, [k, name]] of stages.entries()) {
      const rows = CAT.checkRows(p, k); room(b, 90 + (i ? 0 : 0)); doc.y += i ? 8 : 0; mini(b, `${i + 1}. ${name}`, doc.y);
      table(b, [{ h: '', w: .5 }, { h: 'Check', w: 4.2, bold: true }, { h: 'From this pack', w: 3 }, { h: 'Pass', w: .6 }, { h: 'Fail', w: .6 }, { h: 'Measured or noted', w: 2.4 }], rows.map(r => [{ box: true }, r.check, { t: r.pack }, { box: true }, { box: true }, '']), { fontSize: 10, pad: 8 });
    }
    room(b, 60); const fy = doc.y + 26, fw = (CW - 3 * 24) / 4;
    ['Sample reference', 'Checked by', 'Date', 'Result'].forEach((t, i) => { const x = L + i * (fw + 24); doc.moveTo(x, fy).lineTo(x + fw, fy).lineWidth(.9).strokeColor(INK).stroke(); doc.fillColor(DIM).font('MONO').fontSize(7.5).text(t.toUpperCase(), x, fy + 5, { characterSpacing: 1, lineBreak: false }); });
  }

  // ---- reference pictures ----
  if (refs.length) {
    doc.addPage(); heading(b, num('Reference pictures'), 'Reference pictures');
    const cols = 4, gap = 12, cw = (CW - gap * (cols - 1)) / cols, chh = 170;
    for (let i = 0; i < refs.length; i++) {
      const col = i % cols; if (col === 0 && i > 0) doc.y += chh + 26; if (col === 0 && doc.y + chh + 26 > b.bodyBottom) { doc.addPage(); doc.y = b.bodyTop; }
      const x = L + col * (cw + gap), yy = doc.y, im = await pic(refs[i].image, 800); if (im) place(doc, im, x, yy, cw, chh);
      doc.fillColor(DIM).font('MONO').fontSize(7.5).text(safe(`${refs[i].view}${refs[i].label ? ' · ' + refs[i].label : ''}`).toUpperCase(), x, yy + chh + 6, { width: cw, lineBreak: false, characterSpacing: .6 }); doc.y = yy;
    }
    doc.y += chh + 26;
  }

  // ---- sign-off ----
  if (v) {
    doc.addPage(); heading(b, num('Sign-off'), 'Sign-off', `${version ? 'version ' + version + ' · ' : ''}client → Future Basics → factory`);
    table(b, [{ h: 'Party', w: 2, bold: true }, { h: 'Name', w: 3 }, { h: 'Date', w: 2 }, { h: 'Signature', w: 4 }], [['Client', v.clientSign], ['Future Basics', v.brandSign], ['Factory', v.factorySign]].map(([w, sg]) => [w, sg ? sg.name : '', sg ? fmtDate(sg.at) : '', sg ? { t: 'Signed in the hub' } : { line: true }]), { fontSize: 11, pad: 12 });
    if (revisions.length) { doc.y += 14; mini(b, 'Revisions', doc.y); table(b, [{ h: 'Version', w: 1, mono: true }, { h: 'Date', w: 2 }, { h: 'By', w: 2 }, { h: 'Note', w: 6 }], revisions.slice().reverse().map(x => ['v' + x.version, fmtDate(x.publishedAt), x.by || '', [x.summary, x.note].filter(Boolean).join(' · ')]), { fontSize: 10 });
      const last = revisions[revisions.length - 1], ch = (last && last.changes) || [];
      if (ch.length) { doc.y += 14; mini(b, `What changed in v${last.version}`, doc.y); table(b, [{ h: 'Section', w: 2, bold: true }, { h: 'Item', w: 4 }, { h: 'Was → now', w: 6 }], ch.slice(0, 14).map(c => [c.section, c.label, c.kind === 'removed' ? 'removed' : (c.from ? c.from + ' → ' : '') + c.to]), { fontSize: 9 }); if (ch.length > 14) { doc.y += 4; doc.font('MONO').fontSize(8).fillColor('#717177').text(`…and ${ch.length - 14} more: see the pack online`, { lineBreak: false }); } } }
  }
  return b.finish();
}

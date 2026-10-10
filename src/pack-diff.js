// What changed between two published versions of a tech pack, written for the person who has to act on it: the factory that already read v1 and the client
// who approved it. Pure functions over normalised pack data (no database), so the same words go on the page, in the email and on the revision record.
import { normalizeTechPack, calloutKey } from './techpack.js';

const clip = (v, n = 90) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const MAX_ITEMS = 60;

// one callout's identity for "is this the same one": its number on its view. What counts as edited is its words.
const calloutWords = c => [c.label, c.spec, c.note].map(x => String(x || '').trim()).join('\u0001');
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function packDiff(before, after) {
  const a = normalizeTechPack(before), b = normalizeTechPack(after), out = [];
  const add = (section, kind, label, from, to) => out.push({ section, kind, label: clip(label, 80), from: clip(from), to: clip(to) });

  // style
  for (const [k, name] of [['styleNumber', 'Style number'], ['styleName', 'Style name'], ['season', 'Season'], ['category', 'Category'], ['sampleSize', 'Sample size'], ['fitBlock', 'Fit block'], ['fabricSummary', 'Fabric summary']]) {
    if ((a.style[k] || '') !== (b.style[k] || '')) add('Style', 'changed', name, a.style[k], b.style[k]);
  }
  if (!same(a.sizes, b.sizes)) add('Style', 'changed', 'Size run', a.sizes.join(' · '), b.sizes.join(' · '));

  // callouts, found by view + number
  const viewOf = (p, id) => p.sketches.find(s => s.id === id)?.view || 'view';
  const ca = new Map(a.sketches.flatMap(s => s.callouts.map(c => [calloutKey(s, c), { c, view: s.view }]))), cb = new Map(b.sketches.flatMap(s => s.callouts.map(c => [calloutKey(s, c), { c, view: s.view }])));
  for (const [key, { c, view }] of cb) {
    const old = ca.get(key);
    if (!old) add('Callouts', 'added', `${c.label || 'Callout ' + c.n} (${view} #${c.n})`, '', c.spec || c.note);
    else if (calloutWords(old.c) !== calloutWords(c)) {
      // one row per field that moved, so the factory reads the spec that changed and not the whole callout again
      for (const [f, fname] of [['label', 'name'], ['spec', 'spec'], ['note', 'note to factory']]) if ((old.c[f] || '').trim() !== (c[f] || '').trim()) add('Callouts', 'changed', `${c.label || old.c.label || 'Callout ' + c.n} (${view} #${c.n}) · ${fname}`, old.c[f], c[f]);
    }
  }
  for (const [key, { c, view }] of ca) if (!cb.has(key)) add('Callouts', 'removed', `${c.label || 'Callout ' + c.n} (${view} #${c.n})`, c.spec || c.note, '');
  const imgChanged = b.sketches.filter(s => { const o = a.sketches.find(x => x.id === s.id); return o && o.image !== s.image; });
  for (const s of imgChanged) add('Callouts', 'changed', `${s.view} picture`, 'previous picture', 'new picture');

  // measurements: by code+name, per size
  const pk = r => `${r.code}|${r.name}`.toLowerCase(), pa = new Map(a.pom.map(r => [pk(r), r])), pb = new Map(b.pom.map(r => [pk(r), r]));
  for (const [key, r] of pb) {
    const o = pa.get(key), label = `${r.code ? r.code + ' ' : ''}${r.name}`;
    if (!o) { add('Measurements', 'added', label, '', Object.entries(r.values).map(([s, v]) => `${s}: ${v}`).join(' ')); continue; }
    const sizes = [...new Set([...Object.keys(o.values), ...Object.keys(r.values)])].filter(s => (o.values[s] || '') !== (r.values[s] || ''));
    if (sizes.length) add('Measurements', 'changed', label, sizes.map(s => `${s}: ${o.values[s] || '—'}`).join(' · '), sizes.map(s => `${s}: ${r.values[s] || '—'}`).join(' · '));
    if ((o.tolerance || '') !== (r.tolerance || '')) add('Measurements', 'changed', `${label} tolerance`, o.tolerance, r.tolerance);
    if ((o.how || '') !== (r.how || '')) add('Measurements', 'changed', `${label}: how to measure`, o.how, r.how);
  }
  for (const [key, r] of pa) if (!pb.has(key)) add('Measurements', 'removed', `${r.code ? r.code + ' ' : ''}${r.name}`, '', '');

  // materials: by component
  const bk = r => String(r.component || r.material).toLowerCase(), ba = new Map(a.bom.map(r => [bk(r), r])), bb = new Map(b.bom.map(r => [bk(r), r]));
  const bomLine = r => [r.material, r.spec, r.color, r.supplier && 'supplier ' + r.supplier, r.ref && 'ref ' + r.ref, r.qty && `${r.qty} ${r.unit || ''}`.trim()].filter(Boolean).join(' · ');
  for (const [key, r] of bb) { const o = ba.get(key); if (!o) add('Materials', 'added', r.component || r.material, '', bomLine(r)); else if (bomLine(o) !== bomLine(r) || (o.placement || '') !== (r.placement || '')) add('Materials', 'changed', r.component || r.material, bomLine(o), bomLine(r)); }
  for (const [key, r] of ba) if (!bb.has(key)) add('Materials', 'removed', r.component || r.material, bomLine(r), '');

  // construction: by area
  const xa = new Map(a.construction.map(r => [r.area.toLowerCase(), r])), xb = new Map(b.construction.map(r => [r.area.toLowerCase(), r]));
  for (const [key, r] of xb) { const o = xa.get(key); if (!o) add('Construction', 'added', r.area, '', r.detail); else if (o.detail !== r.detail) add('Construction', 'changed', r.area, o.detail, r.detail); }
  for (const [key, r] of xa) if (!xb.has(key)) add('Construction', 'removed', r.area, r.detail, '');

  // colours
  const wa = new Map(a.colorways.map(r => [r.name.toLowerCase(), r])), wb = new Map(b.colorways.map(r => [r.name.toLowerCase(), r]));
  for (const [key, r] of wb) { const o = wa.get(key); if (!o) add('Colours', 'added', r.name, '', r.code || r.swatch); else if ((o.code || '') !== (r.code || '') || (o.swatch || '') !== (r.swatch || '')) add('Colours', 'changed', r.name, o.code || o.swatch, r.code || r.swatch); }
  for (const [key, r] of wa) if (!wb.has(key)) add('Colours', 'removed', r.name, r.code || r.swatch, '');

  // artwork and where it goes
  const ra = new Map(a.artwork.map(r => [r.id, r])), rb = new Map(b.artwork.map(r => [r.id, r]));
  for (const [id, r] of rb) {
    const o = ra.get(id);
    if (!o) { add('Artwork', 'added', r.name || 'Artwork', '', r.pantones.map(p => p.code || p.name).join(', ')); continue; }
    if (o.image !== r.image) add('Artwork', 'changed', `${r.name || 'Artwork'} file`, 'previous file', 'new file');
    const pa2 = o.pantones.map(p => p.code || p.hex).join(', '), pb2 = r.pantones.map(p => p.code || p.hex).join(', ');
    if (pa2 !== pb2) add('Artwork', 'changed', `${r.name || 'Artwork'} colours`, pa2, pb2);
    const plA = o.placements.map(p => `${p.label} ${p.widthIn ?? ''} in @${p.x},${p.y}`).join(' | '), plB = r.placements.map(p => `${p.label} ${p.widthIn ?? ''} in @${p.x},${p.y}`).join(' | ');
    if (plA !== plB) add('Artwork', 'changed', `${r.name || 'Artwork'} placement`, o.placements.map(p => `${p.label || 'placed'} ${p.widthIn ? p.widthIn + ' in' : ''}`.trim()).join(' · '), r.placements.map(p => `${p.label || 'placed'} ${p.widthIn ? p.widthIn + ' in' : ''}`.trim()).join(' · '));
  }
  for (const [id, r] of ra) if (!rb.has(id)) add('Artwork', 'removed', r.name || 'Artwork', '', '');

  // labels, packaging, care, notes
  const la = new Map(a.labels.map(r => [r.item.toLowerCase(), r])), lb = new Map(b.labels.map(r => [r.item.toLowerCase(), r]));
  for (const [key, r] of lb) { const o = la.get(key), t = `${r.spec} · ${r.placement}`; if (!o) add('Labels', 'added', r.item, '', t); else if (`${o.spec} · ${o.placement}` !== t) add('Labels', 'changed', r.item, `${o.spec} · ${o.placement}`, t); }
  for (const [key, r] of la) if (!lb.has(key)) add('Labels', 'removed', r.item, '', '');
  for (const k of Object.keys(b.packaging)) if ((a.packaging[k] || '') !== (b.packaging[k] || '')) add('Packaging', 'changed', k === 'unitsPerCarton' ? 'Units per carton' : k[0].toUpperCase() + k.slice(1), a.packaging[k], b.packaging[k]);
  for (const k of Object.keys(b.care)) if ((a.care[k] || '') !== (b.care[k] || '')) add('Care and origin', 'changed', { fiber: 'Fibre content', instructions: 'Care instructions', countryOfOrigin: 'Country of origin', compliance: 'Compliance' }[k] || k, a.care[k], b.care[k]);
  // commercial: SKUs, barcodes, weight, packed size, HS code. What the client charges is left out: this list goes to the factory.
  for (const [k, name, unit] of [['weightGrams', 'Weight of one unit', ' g'], ['lengthCm', 'Packed length', ' cm'], ['widthCm', 'Packed width', ' cm'], ['heightCm', 'Packed height', ' cm'], ['hsCode', 'HS code', ''], ['skuPrefix', 'SKU prefix', '']]) {
    if ((a.commercial[k] || '') !== (b.commercial[k] || '')) add('Commercial', 'changed', name, a.commercial[k] && a.commercial[k] + unit, b.commercial[k] && b.commercial[k] + unit);
  }
  const va = new Map(a.commercial.variants.map(v => [`${v.size}|${v.colour}`.toLowerCase(), v])), vb = new Map(b.commercial.variants.map(v => [`${v.size}|${v.colour}`.toLowerCase(), v]));
  for (const [key, v] of vb) { const o = va.get(key), name = `${v.colour ? v.colour + ' ' : ''}${v.size}`.trim() || 'Variant'; if (!o) add('Commercial', 'added', name, '', [v.sku, v.barcode].filter(Boolean).join(' · ')); else if (o.sku !== v.sku || o.barcode !== v.barcode) add('Commercial', 'changed', name, [o.sku, o.barcode].filter(Boolean).join(' · '), [v.sku, v.barcode].filter(Boolean).join(' · ')); }
  for (const [key, v] of va) if (!vb.has(key)) add('Commercial', 'removed', `${v.colour ? v.colour + ' ' : ''}${v.size}`.trim() || 'Variant', v.sku, '');
  if ((a.notes || '') !== (b.notes || '')) add('Notes', 'changed', 'Notes to the factory', a.notes, b.notes);
  if (!same(a.electronics, b.electronics)) add('Electronics', 'changed', 'Electronics specification', '', 'see the Electronics section');

  return out.slice(0, MAX_ITEMS);
}

// "7 changes: 3 measurements, 2 materials, 1 callout, 1 colour" for the email and the banner.
const NOUN = { Style: ['style detail', 'style details'], Callouts: ['callout', 'callouts'], Measurements: ['measurement', 'measurements'], Materials: ['material', 'materials'], Construction: ['construction note', 'construction notes'], Colours: ['colour', 'colours'], Artwork: ['artwork item', 'artwork items'], Labels: ['label', 'labels'], Packaging: ['packaging detail', 'packaging details'], 'Care and origin': ['care or origin detail', 'care or origin details'], Notes: ['note', 'notes'], Electronics: ['electronics change', 'electronics changes'], Commercial: ['commercial detail', 'commercial details'] };
export function diffSummary(changes) {
  if (!changes || !changes.length) return 'No changes to the specification.';
  const by = new Map(); for (const c of changes) by.set(c.section, (by.get(c.section) || 0) + 1);
  const parts = [...by].map(([s, n]) => `${n} ${(NOUN[s] || [s.toLowerCase(), s.toLowerCase()])[n === 1 ? 0 : 1]}`);
  return `${changes.length} change${changes.length === 1 ? '' : 's'}: ${parts.join(', ')}.`;
}

// A new version keeps the factory's acknowledgements for every callout whose words did not change, so a one-line edit does not ask for forty re-acknowledgements.
// Signatures never carry over: each version is signed again. Returns the acks map for the new version.
export function carriedAcks(beforeData, afterData, acks) {
  const a = normalizeTechPack(beforeData), b = normalizeTechPack(afterData), out = {};
  const old = new Map(a.sketches.flatMap(s => s.callouts.map(c => [calloutKey(s, c), c])));
  for (const s of b.sketches) for (const c of s.callouts) {
    const key = calloutKey(s, c), o = old.get(key), ack = acks && acks[key];
    if (ack && o && calloutWords(o) === calloutWords(c)) out[key] = ack;
  }
  return out;
}

// The product sheet in the work console: what a product is, how it is made and what it costs, pulled together from where each fact already
// lives (the tech pack, the production configuration, the factory, the price tiers, the quotes), so nothing is typed twice. Plain functions;
// the routes are in src/product-sheet-routes.js.

const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const uniq = a => [...new Set(a.map(clean).filter(Boolean))];

// how a graphic is put on, from the words the pack uses for it
const METHODS = [
  ['Screen print', /plastisol|water[- ]?based|discharge|screen[- ]?print|silk[- ]?screen/i], ['Direct-to-garment print', /direct[- ]to[- ]garment|\bdtg\b/i],
  ['Embroidery', /embroider/i], ['Puff print', /\bpuff\b/i], ['Heat transfer', /heat[- ]?transfer|\bhtv\b|\bdtf\b/i], ['Sublimation', /sublimat/i],
  ['Woven label', /woven/i], ['Patch', /\bpatch\b/i], ['Debossed', /deboss/i], ['Embossed', /emboss/i], ['Laser engraved', /laser|engrav/i], ['Pad print', /pad[- ]print/i]
];
const PLACES = [['Left chest', /left chest/i], ['Chest', /\bchest\b/i], ['Back', /\bback\b/i], ['Sleeve', /sleeve/i], ['Neck', /\bneck\b|nape/i], ['Hem', /\bhem\b/i], ['Front', /\bfront\b/i], ['Side', /\bside\b/i], ['Crown', /\bcrown\b/i], ['Cuff', /\bcuff\b/i]];

// The spec as the tech pack has it (the published version when there is one): style, fabric, colourways, sizes, decoration, labels, packaging, costs.
export function specFromTechPack(data) {
  const d = data && typeof data === 'object' ? data : {}, style = d.style || {}, art = Array.isArray(d.artwork) ? d.artwork : [], bom = Array.isArray(d.bom) ? d.bom : [];
  const artText = art.map(a => `${a.name || ''} ${a.note || ''}`).join(' · ');
  const body = bom.find(b => /body|shell|main|fabric|upper|blank/i.test(`${b.component || ''}`)) || bom[0] || null;
  const decoMethods = METHODS.filter(([, re]) => re.test(artText) || bom.some(b => re.test(`${b.component} ${b.material} ${b.notes}`))).map(([n]) => n);
  const decoPlaces = PLACES.filter(([, re]) => re.test(artText) || art.some(a => (a.placements || []).some(p => re.test(`${p.label || ''} ${p.sketchId || ''}`)))).map(([n]) => n);
  const packaging = Array.isArray(d.packaging) ? d.packaging.map(p => clean([p.item, p.spec].filter(Boolean).join(': '))).filter(Boolean).join('; ') : clean(d.packaging?.notes || d.packaging || '');
  const c = d.commercial || {}, cost = c.cost || {};
  return {
    styleNumber: clean(style.styleNumber), styleName: clean(style.styleName), category: clean(style.category), season: clean(style.season), description: clean(style.description),
    blankName: clean(body?.material || style.styleName), material: clean(style.fabricSummary || [body?.material, body?.spec].filter(Boolean).join(', ')),
    construction: clean(Array.isArray(d.construction) ? d.construction.map(x => x.detail || x.note || x.text || '').filter(Boolean).slice(0, 3).join('; ') : d.construction?.notes || ''),
    colorways: uniq((Array.isArray(d.colorways) ? d.colorways : []).map(c => c.name || c.code || '')),
    sizes: uniq(Array.isArray(d.sizes) ? d.sizes : []), decorationMethod: decoMethods.join(', '), decorationLocations: decoPlaces,
    artworkCount: art.length, labels: (Array.isArray(d.labels) ? d.labels : []).map(l => clean(l.item)).filter(Boolean), packaging,
    bomLines: bom.filter(b => clean(b.material) || clean(b.component)).length,
    retailCents: Number(c.retailPrice) > 0 ? Math.round(Number(c.retailPrice) * 100) : null,
    breaks: (Array.isArray(cost.breaks) ? cost.breaks : []).map(b => ({ qty: Number(b.qty || b.quantity) || 0, unitCents: Math.round(Number(b.unit || b.price || b.cost) * 100) || 0 })).filter(b => b.qty > 0 && b.unitCents > 0)
  };
}

// The configuration a pack fills in: only what the pack knows. What staff set themselves (supplier, MOQ, lead time, status) is kept.
export function configFromSpec(spec, current = {}) {
  const keep = (mine, theirs) => (Array.isArray(theirs) ? (theirs.length ? theirs : mine || []) : clean(theirs) || mine || null);
  return {
    supplierId: current.supplier_id || null, status: current.status || 'draft', moq: current.moq ?? null, leadTimeDays: current.lead_time_days ?? null,
    sampleRequired: current.sample_required !== false, fulfillment: current.fulfillment || null, notes: current.notes || null, variantPlan: current.variant_plan || [],
    artworkWidthIn: current.artwork_width_in ?? null, artworkHeightIn: current.artwork_height_in ?? null,
    blankName: keep(current.blank_name, spec.styleNumber && spec.blankName ? `${spec.styleNumber} · ${spec.blankName}` : spec.blankName),
    material: keep(current.material, spec.material), construction: keep(current.construction, spec.construction), decorationMethod: keep(current.decoration_method, spec.decorationMethod),
    decorationLocations: keep(current.decoration_locations, spec.decorationLocations), colorways: keep(current.colorways, spec.colorways), sizes: keep(current.sizes, spec.sizes),
    packaging: keep(current.packaging, spec.packaging)
  };
}

// Each line of "how it is made" with where its value comes from: the configuration (set by us), or the tech pack (not yet copied).
export function makeLines(config, spec) {
  const c = config || {}, s = spec || {}, list = v => (Array.isArray(v) ? v.join(', ') : clean(v));
  const line = (key, label, mine, theirs) => { const m = list(mine), t = list(theirs); return { key, label, value: m || t || '', from: m ? 'config' : t ? 'tech-pack' : 'none' }; };
  return [line('blank', 'Base', c.blank_name, s.styleNumber && s.blankName ? `${s.styleNumber} · ${s.blankName}` : s.blankName), line('material', 'Fabric', c.material, s.material),
    line('construction', 'Construction', c.construction, s.construction), line('decoration', 'Decoration', c.decoration_method, s.decorationMethod),
    line('placements', 'Placements', c.decoration_locations, s.decorationLocations), line('colorways', 'Colourways', c.colorways, s.colorways),
    line('sizes', 'Sizes', c.sizes, s.sizes), line('packaging', 'Packaging', c.packaging, s.packaging)];
}

// A tier with its margins worked out: ours (wholesale over cost, after setup and freight spread over the tier's minimum) and the client's (SRP over wholesale).
export function tierView(t) {
  const q = Math.max(1, Number(t.min_quantity ?? t.minQuantity) || 1), cost = Number(t.unit_cost_cents ?? t.unitCostCents) || 0, whole = Number(t.wholesale_cents ?? t.wholesaleCents) || 0;
  const srp = t.srp_cents ?? t.srpCents ?? null, setup = Number(t.setup_cents ?? t.setupCents) || 0, freight = Number(t.freight_cents ?? t.freightCents) || 0;
  const landed = cost + Math.round((setup + freight) / q);
  return { id: t.id || null, minQuantity: q, maxQuantity: t.max_quantity ?? t.maxQuantity ?? null, unitCostCents: cost, wholesaleCents: whole, srpCents: srp == null ? null : Number(srp), setupCents: setup, freightCents: freight,
    leadTimeDays: t.lead_time_days ?? t.leadTimeDays ?? null, notes: t.notes || '', landedCents: landed,
    ourMarginPct: whole > 0 ? Math.round((whole - landed) / whole * 1000) / 10 : null, clientMarginPct: srp && whole ? Math.round((Number(srp) - whole) / Number(srp) * 1000) / 10 : null };
}

// The tiers of a ladder or another product, ready to put on this one (no ids, no product).
export const tiersToCopy = tiers => (tiers || []).map(t => { const v = tierView(t); return { minQuantity: v.minQuantity, maxQuantity: v.maxQuantity, unitCostCents: v.unitCostCents, wholesaleCents: v.wholesaleCents, srpCents: v.srpCents, setupCents: v.setupCents, freightCents: v.freightCents, leadTimeDays: v.leadTimeDays, notes: v.notes || null }; })
  .filter(t => t.minQuantity > 0 && t.unitCostCents >= 0 && t.wholesaleCents >= 0).sort((a, b) => a.minQuantity - b.minQuantity);

// How alike two products are, for "Start from a past product": the same kind of item counts most, then shared words in the name.
const STOP = new Set(['the', 'and', 'a', 'of', 'with', 'for', 'in', 'tee', 'shirt']);
const KINDS = [['tee', /\btee\b|t-?shirt/i], ['long-sleeve', /long[- ]?sleeve|\bl\/s\b/i], ['hoodie', /hood/i], ['crewneck', /crew|sweatshirt/i], ['jacket', /jacket|coat|bomber|aviator/i],
  ['cap', /\bcap\b|hat\b|snapback|trucker/i], ['beanie', /beanie|knit hat/i], ['bag', /\bbag\b|tote|backpack|duffel|pouch/i], ['bottle', /bottle|tumbler|mug|cup/i], ['sticker', /sticker|decal/i],
  ['pants', /pant|trouser|short|jogger/i], ['jersey', /jersey/i], ['sock', /sock/i], ['notebook', /notebook|journal/i], ['print', /\bprint\b|poster|artwork/i], ['shoe', /shoe|sneaker|boot/i]];
// kinds that price and make alike
const FAMILY = { tee: 'top', 'long-sleeve': 'top', crewneck: 'top', hoodie: 'top', jersey: 'top', jacket: 'outer', cap: 'headwear', beanie: 'headwear', bag: 'bag', pants: 'bottom' };
export const kindOf = s => (KINDS.find(([, re]) => re.test(String(s || ''))) || [''])[0];
const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)));
export function likeness(a, b) {
  const ka = kindOf(`${a.title} ${a.category || ''} ${a.product_type || ''}`), kb = kindOf(`${b.title} ${b.category || ''} ${b.product_type || ''}`);
  const wa = words(`${a.title} ${a.product_type || ''}`), wb = words(`${b.title} ${b.product_type || ''}`); let shared = 0; for (const w of wa) if (wb.has(w)) shared++;
  const fam = k => FAMILY[k] || k;
  return (ka && ka === kb ? 10 : ka && kb && fam(ka) === fam(kb) ? 6 : 0) + shared * 2 + (b.tiers?.length ? 3 : 0) + (b.config ? 2 : 0) + (a.client_id && a.client_id === b.client_id ? 1 : 0);
}
export const rankPast = (target, list, n = 12) => list.filter(x => x.id !== target.id && (x.tiers?.length || x.config)).map(x => ({ ...x, score: likeness(target, x) })).sort((x, y) => y.score - x.score || new Date(y.updated_at || 0) - new Date(x.updated_at || 0)).slice(0, n);

// A price ladder staff save once and reuse: a name and its tiers.
export function cleanLadder(input = {}) {
  const name = clean(input.name).slice(0, 80); if (!name) return { error: 'Give the price ladder a name' };
  const tiers = tiersToCopy(input.tiers); if (!tiers.length) return { error: 'A ladder needs at least one price tier' };
  if (new Set(tiers.map(t => t.minQuantity)).size !== tiers.length) return { error: 'Two tiers start at the same quantity' };
  return { value: { name, kind: clean(input.kind).slice(0, 40) || null, tiers } };
}

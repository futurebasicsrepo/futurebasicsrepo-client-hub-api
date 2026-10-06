// Tech pack data model. Pure functions so the shape is enforced in one place and
// can be unit-tested: what the editor saves, what the viewer renders, what the
// generator seeds from a product's hub configuration, and the readiness /
// verification chain (factory acknowledgements + two signatures) that turns the
// pack from a document into a live sign-off instrument.

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
export const SKETCH_VIEWS = ['front', 'back', 'side', 'lateral', 'medial', 'top', 'outsole', 'heel', 'detail', 'flat', 'other'];
export const FOOTWEAR_SIZES = ['7', '8', '9', '10', '11', '12', '13'];
// Garment packs need front + back; footwear packs need lateral + medial.
export const mockupsComplete = sketches => { const has = v => sketches.some(s => s.view === v && s.image); return (has('front') && has('back')) || (has('lateral') && has('medial')); };
const LIMITS = { renderings: 6, sketches: 12, sizes: 14, pom: 80, bom: 120, construction: 80, colorways: 16, labels: 30, callouts: 40, artwork: 12, pantones: 12, placements: 24, revisions: 200 };
const MAX_IMAGE_CHARS = 2_600_000;   // ~1.9MB decoded; the editor downsizes before upload
const MAX_PHOTO_CHARS = 700_000;     // callout detail photos are small crops
const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;

const str = (value, max = 2000) => String(value ?? '').replace(/\r/g, '').slice(0, max).trim();
const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '');
// A fraction of the image, or null when absent: an unplaced pin must stay unplaced (null), never land at 0,0.
const unit = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : null; };
const inches = value => { const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : null; };
const list = (value, max, map) => (Array.isArray(value) ? value.slice(0, max).map(map) : []);
const image = (value, max = MAX_IMAGE_CHARS) => { const v = String(value || ''); return v && v.length <= max && IMAGE_RE.test(v) ? v : ''; };
// Public check for routes that accept inline images before they reach the pack (e.g. the photo-start funnel).
export const isInlineImage = (value, max = MAX_IMAGE_CHARS) => Boolean(image(value, max));
const id = value => str(value, 40).replace(/[^a-zA-Z0-9_-]/g, '') || Math.random().toString(36).slice(2, 10);
export const stripHtml = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

export function emptyTechPack() {
  return {
    style: { styleNumber: '', styleName: '', season: '', category: '', designer: '', sampleSize: '', fitBlock: '', fabricSummary: '', description: '' },
    sketches: [],
    sizes: [...DEFAULT_SIZES],
    pom: [],
    bom: [],
    construction: [],
    colorways: [],
    renderings: [],
    artwork: [],
    labels: [],
    packaging: { fold: '', polybag: '', carton: '', unitsPerCarton: '', notes: '' },
    care: { fiber: '', instructions: '', countryOfOrigin: '', compliance: '' },
    notes: ''
  };
}

// Accepts anything the editor (or an old row) sends and returns a complete, bounded object.
export function normalizeTechPack(input) {
  const src = input && typeof input === 'object' ? input : {};
  const base = emptyTechPack();
  const style = src.style && typeof src.style === 'object' ? src.style : {};
  const packaging = src.packaging && typeof src.packaging === 'object' ? src.packaging : {};
  const care = src.care && typeof src.care === 'object' ? src.care : {};
  const sizes = [...new Set(list(src.sizes, LIMITS.sizes, s => str(s, 12)).filter(Boolean))];
  const sizeSet = sizes.length ? sizes : base.sizes;
  const sketches = list(src.sketches, LIMITS.sketches, s => ({
    id: id(s?.id),
    view: SKETCH_VIEWS.includes(s?.view) ? s.view : 'front',
    label: str(s?.label, 120),
    image: image(s?.image),
    garmentWidthIn: inches(s?.garmentWidthIn),
    callouts: list(s?.callouts, LIMITS.callouts, c => ({
      n: Math.max(1, Math.min(99, Number(c?.n) || 0)) || 1,
      label: str(c?.label, 80),
      spec: str(c?.spec, 400),
      note: str(c?.note, 600),
      photo: image(c?.photo, MAX_PHOTO_CHARS),
      x: unit(c?.x), y: unit(c?.y)
    })).filter(c => c.label || c.note || c.spec)
  }));
  const sketchIds = new Set(sketches.map(s => s.id));
  return {
    style: Object.fromEntries(Object.keys(base.style).map(k => [k, str(style[k], k === 'description' ? 3000 : 200)])),
    sketches,
    sizes: sizeSet,
    pom: list(src.pom, LIMITS.pom, r => ({
      code: str(r?.code, 8), name: str(r?.name, 160), how: str(r?.how, 400), tolerance: str(r?.tolerance, 24),
      values: Object.fromEntries(sizeSet.map(size => [size, str(r?.values?.[size], 24)]))
    })).filter(r => r.name || r.code),
    bom: list(src.bom, LIMITS.bom, r => ({
      component: str(r?.component, 160), material: str(r?.material, 200), spec: str(r?.spec, 300), supplier: str(r?.supplier, 120),
      ref: str(r?.ref, 80), color: str(r?.color, 120), placement: str(r?.placement, 160), qty: str(r?.qty, 24), unit: str(r?.unit, 24), notes: str(r?.notes, 400)
    })).filter(r => r.component || r.material),
    construction: list(src.construction, LIMITS.construction, r => ({ area: str(r?.area, 120), detail: str(r?.detail, 600) })).filter(r => r.area || r.detail),
    colorways: list(src.colorways, LIMITS.colorways, r => ({ name: str(r?.name, 80), code: str(r?.code, 40), swatch: hex(r?.swatch), notes: str(r?.notes, 300) })).filter(r => r.name),
    renderings: list(src.renderings, LIMITS.renderings, r => ({ id: id(r?.id), name: str(r?.name, 120), note: str(r?.note, 400), image: image(r?.image) })).filter(r => r.image),
    artwork: list(src.artwork, LIMITS.artwork, a => ({
      id: id(a?.id),
      name: str(a?.name, 120),
      image: image(a?.image),
      pantones: list(a?.pantones, LIMITS.pantones, p => ({ hex: hex(p?.hex), name: str(p?.name, 60), code: str(p?.code, 40) })).filter(p => p.hex),
      placements: list(a?.placements, LIMITS.placements, p => ({
        sketchId: sketchIds.has(String(p?.sketchId)) ? String(p.sketchId) : '',
        x: unit(p?.x), y: unit(p?.y), widthIn: inches(p?.widthIn), label: str(p?.label, 120)
      })).filter(p => p.sketchId && p.x != null && p.y != null)
    })).filter(a => a.image || a.name),
    labels: list(src.labels, LIMITS.labels, r => ({ item: str(r?.item, 120), spec: str(r?.spec, 400), placement: str(r?.placement, 200) })).filter(r => r.item),
    packaging: Object.fromEntries(Object.keys(base.packaging).map(k => [k, str(packaging[k], k === 'notes' ? 1500 : 200)])),
    care: Object.fromEntries(Object.keys(base.care).map(k => [k, str(care[k], k === 'instructions' || k === 'compliance' ? 1500 : 300)])),
    notes: str(src.notes, 6000)
  };
}

const TOPS_POM = [
  ['A', 'Across shoulder', 'Shoulder seam to shoulder seam across back', '±0.5'],
  ['B', 'Chest width', 'Edge to edge, 1" below armhole, laid flat', '±0.5'],
  ['C', 'Body length HPS', 'High point shoulder straight down to bottom of hem', '±0.5'],
  ['D', 'Sleeve length', 'Shoulder seam to sleeve opening', '±0.5'],
  ['E', 'Bicep', 'Edge to edge, 1" below armhole on sleeve', '±0.25'],
  ['F', 'Cuff opening', 'Edge to edge at sleeve hem, relaxed', '±0.25'],
  ['G', 'Hem width', 'Edge to edge at bottom hem, relaxed', '±0.5'],
  ['H', 'Neck width', 'Inside neck seam to inside neck seam', '±0.25'],
  ['I', 'Front neck drop', 'HPS to top of front neck seam', '±0.25']
];
const BOTTOMS_POM = [
  ['A', 'Waist relaxed', 'Edge to edge at top of waistband, relaxed', '±0.5'],
  ['B', 'Waist extended', 'Edge to edge at top of waistband, fully extended', '±0.5'],
  ['C', 'Front rise', 'Crotch seam to top of waistband, front', '±0.25'],
  ['D', 'Back rise', 'Crotch seam to top of waistband, back', '±0.25'],
  ['E', 'Inseam', 'Crotch seam to bottom of leg opening', '±0.5'],
  ['F', 'Thigh', 'Edge to edge 1" below crotch seam', '±0.25'],
  ['G', 'Knee', 'Edge to edge at midpoint of inseam', '±0.25'],
  ['H', 'Leg opening', 'Edge to edge at hem, relaxed', '±0.25'],
  ['I', 'Hip', 'Edge to edge at fullest point of hip', '±0.5']
];
const FOOTWEAR_POM = [
  ['A', 'Outsole length', 'Toe to heel along the outsole, size run graded', '±0.125'],
  ['B', 'Forefoot width (outsole)', 'Widest point of the outsole at the ball', '±0.125'],
  ['C', 'Heel width (outsole)', 'Widest point of the outsole at the heel', '±0.125'],
  ['D', 'Heel height', 'Ground to footbed at heel centre, outsole + midsole', '±0.0625'],
  ['E', 'Forefoot stack', 'Ground to footbed at ball of foot', '±0.0625'],
  ['F', 'Toe spring', 'Ground to underside of toe at rest', '±0.0625'],
  ['G', 'Collar height (lateral)', 'Footbed to top of collar at lateral ankle', '±0.125'],
  ['H', 'Topline opening', 'Inside circumference of the collar opening', '±0.25'],
  ['I', 'Lace length', 'Tip to tip, laced out', '±0.5']
];
const HEADWEAR_POM = [
  ['A', 'Crown circumference', 'Inside sweatband, fully around', '±0.25'],
  ['B', 'Crown height', 'Center front sweatband to top button', '±0.25'],
  ['C', 'Visor length', 'Center front sweatband to visor edge', '±0.125'],
  ['D', 'Visor width', 'Edge to edge at widest point', '±0.25'],
  ['E', 'Sweatband height', 'Bottom edge to top edge of sweatband', '±0.125']
];
const BAG_POM = [
  ['A', 'Width', 'Edge to edge across the body at the base, laid flat', '±0.25'],
  ['B', 'Height', 'Base to top edge of the body at centre, handles excluded', '±0.25'],
  ['C', 'Depth / gusset', 'Front to back at the base', '±0.25'],
  ['D', 'Handle drop', 'Top edge of the body to inside top of the handle', '±0.25'],
  ['E', 'Strap length', 'End to end, buckle at the longest setting', '±0.5'],
  ['F', 'Opening width', 'Edge to edge across the top opening', '±0.25']
];
export const isFootwear = text => /(shoe|sneaker|trainer|boot|mule|footwear|slide|sandal|loafer|court|runner|cleat|cupsole|clog|moc)/.test(String(text || '').toLowerCase());
export function pomTemplateFor(text) {
  const t = String(text || '').toLowerCase();
  if (isFootwear(t)) return FOOTWEAR_POM;
  if (/(cap|hat|beanie|bucket|visor|headwear)/.test(t)) return HEADWEAR_POM;
  if (/(\bbag\b|tote|backpack|pouch|duffle|duffel|crossbody|satchel|clutch|wallet|cardholder|card holder|belt bag|fanny|sling)/.test(t)) return BAG_POM;
  if (/(pant|short|trouser|jogger|bottom|denim|jean)/.test(t)) return BOTTOMS_POM;
  if (/(tee|shirt|tank|polo|knit|hoodie|sweat|crew|jacket|shell|top|apparel|dress|vest|fleece|layer)/.test(t)) return TOPS_POM;
  return [];
}

// Builds a first-draft pack from the product and its existing hub configuration.
export function seedTechPack({ product = {}, configuration = null, brief = null, now = new Date() } = {}) {
  const pack = emptyTechPack();
  const c = configuration || {};
  const descriptor = `${product.title || ''} ${product.product_type || ''} ${c.blank_name || ''}`;
  const apparel = pomTemplateFor(descriptor), footwear = apparel === FOOTWEAR_POM, bag = apparel === BAG_POM;
  const sizes = Array.isArray(c.sizes) && c.sizes.length ? c.sizes.map(s => str(s, 12)).filter(Boolean).slice(0, LIMITS.sizes) : footwear ? [...FOOTWEAR_SIZES] : (apparel.length && !bag ? [...DEFAULT_SIZES] : ['One size']);
  const month = now.getMonth(), year = String(now.getFullYear()).slice(-2);
  pack.style = {
    styleNumber: String(product.shopify_handle || '').toUpperCase().slice(0, 40),
    styleName: str(product.title, 200),
    season: (month >= 6 ? 'FW' : 'SS') + year,
    category: str(product.product_type || c.blank_name, 200),
    designer: 'Future Basics',
    sampleSize: sizes[Math.floor(sizes.length / 2)] || '',
    fitBlock: '',
    fabricSummary: str(c.material, 200),
    description: str(stripHtml(product.description_html) || brief?.objective, 3000)
  };
  pack.sizes = sizes;
  pack.pom = apparel.map(([code, name, how, tolerance]) => ({ code, name, how, tolerance, values: Object.fromEntries(sizes.map(s => [s, ''])) }));
  pack.bom = [];
  if (footwear) pack.bom.push(
    { component: 'Upper', material: str(c.material, 200), spec: str(c.blank_name, 300), supplier: str(c.supplier_name, 120), ref: '', color: '', placement: 'Vamp, quarters, eyestay', qty: '1', unit: 'pair', notes: '' },
    { component: 'Lining', material: '', spec: 'Breathable textile, DTM', supplier: '', ref: '', color: '', placement: 'Quarter + tongue', qty: '1', unit: 'pair', notes: '' },
    { component: 'Collar foam', material: 'PU foam', spec: 'Density + thickness TBD', supplier: '', ref: '', color: '', placement: 'Collar', qty: '1', unit: 'pair', notes: '' },
    { component: 'Tongue', material: '', spec: 'Foam-backed, same as upper', supplier: '', ref: '', color: '', placement: 'Tongue', qty: '1', unit: 'pair', notes: '' },
    { component: 'Laces', material: 'Flat polyester', spec: 'Width + length per size', supplier: '', ref: '', color: '', placement: 'Eyestay', qty: '1', unit: 'pair', notes: '' },
    { component: 'Eyelets', material: '', spec: 'Punched or metal, count per side TBD', supplier: '', ref: '', color: '', placement: 'Eyestay', qty: '', unit: 'per side', notes: '' },
    { component: 'Midsole', material: 'EVA', spec: 'Hardness Asker C TBD', supplier: '', ref: '', color: '', placement: 'Sole unit', qty: '1', unit: 'pair', notes: '' },
    { component: 'Outsole', material: 'Rubber', spec: 'Hardness Shore A TBD, tread per sketch', supplier: '', ref: '', color: '', placement: 'Sole unit', qty: '1', unit: 'pair', notes: '' },
    { component: 'Footbed', material: 'Die-cut EVA / PU', spec: 'Removable, top cloth printed', supplier: '', ref: '', color: '', placement: 'Inside', qty: '1', unit: 'pair', notes: '' },
    { component: 'Heel counter + toe puff', material: 'Thermoplastic', spec: 'Internal, heat-activated', supplier: '', ref: '', color: '', placement: 'Heel, toe', qty: '1', unit: 'set', notes: '' });
  else if (c.material || c.blank_name) pack.bom.push({ component: 'Main body', material: str(c.material, 200), spec: str(c.blank_name, 300), supplier: str(c.supplier_name, 120), ref: '', color: '', placement: 'Body', qty: '1', unit: 'pc', notes: '' });
  if (c.decoration_method) {
    const size = c.artwork_width_in && c.artwork_height_in ? `${c.artwork_width_in}" × ${c.artwork_height_in}"` : '';
    const locations = Array.isArray(c.decoration_locations) ? c.decoration_locations.join(', ') : '';
    pack.bom.push({ component: `Decoration — ${str(c.decoration_method, 120)}`, material: '', spec: [size, brief?.decoration].filter(Boolean).join(' · '), supplier: '', ref: '', color: '', placement: locations, qty: String((c.decoration_locations || []).length || 1), unit: 'placement', notes: '' });
  }
  if (c.construction) pack.construction.push({ area: 'Overall', detail: str(c.construction, 600) });
  pack.colorways = (Array.isArray(c.colorways) ? c.colorways : []).slice(0, LIMITS.colorways).map(name => ({ name: str(name, 80), code: '', swatch: '', notes: '' }));
  if (footwear) {
    pack.labels = [{ item: 'Tongue label', spec: 'Woven, client artwork', placement: 'Tongue, centred below top edge' }, { item: 'Size / country of origin label', spec: 'Printed, size + width + CO + article no.', placement: 'Inside tongue' }, { item: 'Footbed print', spec: 'Pad print on top cloth, client artwork', placement: 'Footbed, heel area' }, { item: 'Heel tab', spec: 'Woven or embossed', placement: 'Heel collar' }];
  } else if (apparel.length) {
    pack.labels = bag ? [{ item: 'Main label', spec: 'Woven or debossed leather patch, client artwork', placement: 'Inside body, centred below the opening' }, { item: 'Care / content label', spec: 'Printed satin, materials + care + country of origin', placement: 'Inside pocket seam' }]
      : apparel === HEADWEAR_POM
      ? [{ item: 'Main label', spec: 'Woven, Future Basics / client artwork', placement: 'Inside back crown' }, { item: 'Care / content label', spec: 'Printed satin', placement: 'Inside sweatband' }]
      : [{ item: 'Main label', spec: 'Woven, client artwork', placement: 'Center back neck, inside' }, { item: 'Size label', spec: 'Woven or printed', placement: 'Below main label' }, { item: 'Care / content label', spec: 'Printed satin, fiber content + care + country of origin', placement: 'Inside left side seam' }];
  }
  pack.packaging = { fold: '', polybag: '', carton: '', unitsPerCarton: '', notes: str(c.packaging || brief?.packaging, 1500) };
  pack.care = { fiber: str(c.material, 300), instructions: '', countryOfOrigin: '', compliance: '' };
  pack.notes = str(c.notes, 6000);
  return normalizeTechPack(pack);
}

// Draft completeness: what the editor still needs before this is worth publishing.
export function techPackCompleteness(data) {
  const d = normalizeTechPack(data);
  const checks = [
    ['style', 'Style number and name', Boolean(d.style.styleNumber && d.style.styleName)],
    ['sketches', 'Both mockup views (front + back, or lateral + medial)', mockupsComplete(d.sketches)],
    ['callouts', 'Callouts placed on the garment', d.sketches.some(s => s.callouts.some(c => c.x != null))],
    ['pom', 'Measurements with spec + tolerance', d.pom.length > 0 && d.pom.every(r => r.tolerance && Object.values(r.values).some(Boolean))],
    ['artwork', 'Artwork uploaded and Pantone matched', d.artwork.length > 0 && d.artwork.every(a => a.image && a.pantones.length)],
    ['placement', 'Artwork placed on garment', d.artwork.some(a => a.placements.some(p => p.widthIn))],
    ['bom', 'Bill of materials', d.bom.length > 0],
    ['colorways', 'Fabric Pantones', d.colorways.length > 0],
    ['care', 'Care instructions', Boolean(d.care.instructions)]
  ].map(([key, label, ok]) => ({ key, label, ok }));
  return { checks, missing: checks.filter(c => !c.ok).map(c => c.label), complete: checks.every(c => c.ok) };
}

// ---- verification: the acknowledgement chain and signatures for ONE published version ----
export const calloutKey = (sketch, callout) => `${sketch.id}:${callout.n}`;
// changes: the client's request for changes on this version ({ notes, at, by }); the next published version starts clean.
export function emptyVerification(version = 0) { return { version, acks: {}, clientSign: null, brandSign: null, factorySign: null, changes: null }; }
export function normalizeVerification(input, version) {
  const v = input && typeof input === 'object' ? input : {};
  if (Number(v.version) !== Number(version)) return emptyVerification(version);
  const sig = s => (s && typeof s === 'object' && s.name ? { name: str(s.name, 120), at: str(s.at, 40), by: str(s.by, 200) } : null);
  const acks = {};
  for (const [key, ack] of Object.entries(v.acks && typeof v.acks === 'object' ? v.acks : {}).slice(0, LIMITS.sketches * LIMITS.callouts)) {
    if (ack && typeof ack === 'object') acks[str(key, 60)] = { by: str(ack.by, 200), at: str(ack.at, 40) };
  }
  const changes = v.changes && typeof v.changes === 'object' && v.changes.notes ? { notes: str(v.changes.notes, 2000), at: str(v.changes.at, 40), by: str(v.changes.by, 200) } : null;
  return { version: Number(version) || 0, acks, clientSign: sig(v.clientSign), brandSign: sig(v.brandSign), factorySign: sig(v.factorySign), changes };
}

// Readiness of a published version: the sign-off checklist from the reel, computed, never hand-ticked.
export function techPackReadiness(data, verification) {
  const d = normalizeTechPack(data);
  const v = normalizeVerification(verification, verification?.version ?? 0);
  const callouts = d.sketches.flatMap(s => s.callouts.map(c => ({ key: calloutKey(s, c), label: c.label || `Callout ${c.n}`, sketch: s.view })));
  const pendingCallouts = callouts.filter(c => !v.acks[c.key]);
  const sample = d.style.sampleSize;
  const incompletePom = d.pom.filter(r => !(r.tolerance && (r.values[sample] || Object.values(r.values).some(Boolean))));
  const footwear = d.sketches.some(s => ['lateral', 'medial', 'outsole'].includes(s.view)) || isFootwear(`${d.style.category} ${d.style.styleName}`);
  const viewA = footwear ? 'lateral' : 'front', viewB = footwear ? 'medial' : 'back';
  const front = d.sketches.some(s => s.view === viewA && s.image), back = d.sketches.some(s => s.view === viewB && s.image);
  const artworkOk = d.artwork.length > 0 && d.artwork.every(a => a.image && a.pantones.length);
  const placed = d.artwork.flatMap(a => a.placements.filter(p => p.widthIn));
  const checks = [
    { key: 'mockups', label: footwear ? 'Lateral + medial mockups uploaded' : 'Front + back garment mockups uploaded', ok: front && back, detail: front && back ? 'Both views uploaded' : `${[!front && viewA, !back && viewB].filter(Boolean).join(' and ')} view missing` },
    { key: 'callouts', label: `All ${callouts.length} callout${callouts.length === 1 ? '' : 's'} acknowledged by factory`, ok: callouts.length > 0 && pendingCallouts.length === 0,
      detail: !callouts.length ? 'No callouts placed yet' : pendingCallouts.length ? `${pendingCallouts.length} pending: ${pendingCallouts.map(c => c.label).join(', ')}` : 'Factory acknowledged every callout' },
    { key: 'pom', label: `All ${d.pom.length} POM${d.pom.length === 1 ? '' : 's'} have spec + tolerance`, ok: d.pom.length > 0 && incompletePom.length === 0,
      detail: !d.pom.length ? 'No points of measure' : incompletePom.length ? `${incompletePom.length} incomplete: ${incompletePom.map(r => r.code || r.name).join(', ')}` : `Sample size ${sample || '—'} specified with tolerances` },
    { key: 'artwork', label: 'Artwork uploaded and Pantone matched', ok: artworkOk, detail: artworkOk ? `${d.artwork.length} artwork file${d.artwork.length === 1 ? '' : 's'} with Pantone references` : d.artwork.length ? 'Artwork missing Pantone references' : 'No artwork uploaded — required for production' },
    { key: 'placement', label: 'Artwork placed on garment with spec', ok: placed.length > 0, detail: placed.length ? `${placed.length} placement${placed.length === 1 ? '' : 's'} with width in inches` : 'No placements yet — required for production' }
  ];
  const ready = checks.every(c => c.ok);
  // Sign-off chain: client approves → Future Basics confirms → factory countersigns → locked.
  const locked = Boolean(v.clientSign && v.brandSign && v.factorySign);
  const nextSigner = !v.clientSign ? 'client' : !v.brandSign ? 'brand' : !v.factorySign ? 'factory' : null;
  return { version: v.version, checks, ready, pendingCalloutKeys: pendingCallouts.map(c => c.key), callouts, clientSign: v.clientSign, brandSign: v.brandSign, factorySign: v.factorySign, nextSigner, locked };
}

// What clients and factories receive: the published snapshot only, never the live draft.
export function publishedTechPackView(row, extra = {}) {
  const data = normalizeTechPack(row.published_data);
  const verification = normalizeVerification(row.verification, row.version);
  return {
    audience: extra.audience || 'client',
    shareLabel: extra.shareLabel || null,
    product: { id: row.product_id, title: row.title, productType: row.product_type, imageUrl: row.shopify_image_url || null, imageAlt: row.shopify_image_alt || null, clientName: row.client_name, projectName: row.project_name || null },
    techPack: {
      version: row.version, publishedAt: row.published_at, lockedAt: row.locked_at || null,
      data,
      verification,
      readiness: techPackReadiness(data, verification),
      revisions: (Array.isArray(row.revisions) ? row.revisions : []).slice(-LIMITS.revisions),
      translations: extra.translations || {}
    }
  };
}

// What has to be true before Future Basics publishes a version for the client: both views exist, callouts are placed, every point
// of measure has a spec and a tolerance, any artwork has Pantones and a placement (a pack with no artwork needs none), and the
// independent spec check has looked at this exact pack and scored it at the bar. check: { status, score, verdict, stale } or null.
// Callout acknowledgements are the factory's step, so they are not part of it. Staff can still publish with a written reason.
export function publishGate(data, { check = null, threshold = 90, checkRequired = true } = {}) {
  const d = normalizeTechPack(data), r = techPackReadiness(d, emptyVerification(0)), noArt = !d.artwork.length;
  const problems = r.checks.filter(c => c.key !== 'callouts' && !c.ok && !(noArt && ['artwork', 'placement'].includes(c.key))).map(c => `${c.label} — ${c.detail}`);
  if (!r.callouts.length) problems.push('No callouts placed yet');
  if (checkRequired) {
    if (!check) problems.push('The spec check has not run on this pack yet');
    else if (check.status === 'pending') problems.push('The spec check is still running');
    else if (check.status === 'failed') problems.push('The spec check could not finish');
    else if (check.stale) problems.push('The pack changed after the last spec check');
    else if (check.verdict !== 'cannot-judge' && Number(check.score) < threshold) problems.push(`The spec check scored ${check.score}/100, under the ${threshold} bar`);
  }
  return { ok: problems.length === 0, problems };
}

// ---- translation: every human-written string in a pack, deduplicated, for the factory-language pass ----
// Numbers, codes and empty values are skipped; the result is an ordered list of distinct source strings.
const TRANSLATABLE_MIN = /[a-z]{2,}/i;
export function packStrings(data) {
  const d = normalizeTechPack(data);
  const out = new Set();
  const add = v => { const s = String(v ?? '').trim(); if (s && TRANSLATABLE_MIN.test(s)) out.add(s); };
  ['styleName', 'category', 'description', 'fabricSummary', 'fitBlock'].forEach(k => add(d.style[k])); // designer is a person's name: left as written
  d.renderings.forEach(r => { add(r.name); add(r.note); });
  d.sketches.forEach(s => { add(s.label); s.callouts.forEach(c => { add(c.label); add(c.spec); add(c.note); }); });
  d.pom.forEach(r => { add(r.name); add(r.how); });
  d.bom.forEach(r => ['component', 'material', 'spec', 'supplier', 'color', 'placement', 'unit', 'notes'].forEach(k => add(r[k])));
  d.construction.forEach(r => { add(r.area); add(r.detail); });
  d.colorways.forEach(c => { add(c.name); add(c.notes); });
  d.labels.forEach(r => { add(r.item); add(r.spec); add(r.placement); });
  Object.values(d.packaging).forEach(add);
  Object.values(d.care).forEach(add);
  d.artwork.forEach(a => { add(a.name); a.pantones.forEach(p => add(p.name)); a.placements.forEach(p => add(p.label)); });
  add(d.notes);
  return [...out];
}

// ---- Merging an assistant draft into a pack the client may already have touched ----
// `orig` is the pack as it was created, `current` is what is saved now, `drafted` is the assistant's version built from
// the original. Anything the client changed wins; everything else comes from the draft. Client callouts and rows are kept
// and the assistant's are appended, so nobody's work is thrown away.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function mergeClientEdits(orig, current, drafted) {
  const o = normalizeTechPack(orig), c = normalizeTechPack(current), d = normalizeTechPack(drafted);
  if (same(o, c)) return d; // untouched: the draft is the pack
  const out = structuredClone(d);
  for (const k of Object.keys(o.style)) if (c.style[k] !== o.style[k]) out.style[k] = c.style[k];
  if (!same(c.sizes, o.sizes)) { out.sizes = c.sizes; out.pom = out.pom.map(r => ({ ...r, values: Object.fromEntries(c.sizes.map(s => [s, r.values[s] ?? ''])) })); }
  // sketches: the client's first view may carry its own callouts (or a replaced image); extra views are theirs
  const cs0 = c.sketches[0], os0 = o.sketches[0], ds0 = out.sketches[0];
  if (cs0 && ds0) {
    const replaced = cs0.image !== os0?.image;
    if (replaced) { ds0.image = cs0.image; ds0.callouts = ds0.callouts.map(k => ({ ...k, x: null, y: null, photo: '' })); }
    if (cs0.label !== os0?.label) ds0.label = cs0.label; if (cs0.view !== os0?.view) ds0.view = cs0.view; if (cs0.garmentWidthIn !== os0?.garmentWidthIn) ds0.garmentWidthIn = cs0.garmentWidthIn;
    // a pin at exactly 0,0 with no crop is the old corner-stacking artefact, not a placement: keep the text, drop the position
    // "mine" is what the client added or changed. Callouts that are exactly as an earlier assistant draft left them are not
    // theirs: the new draft replaces them, and one with the same label as one of theirs is dropped so it does not appear twice.
    const asDrafted = new Set((os0?.callouts || []).map(k => `${k.label}|${k.spec}|${k.note}`));
    const mine = cs0.callouts.filter(k => (k.label || k.spec || k.note || k.x != null) && !asDrafted.has(`${k.label}|${k.spec}|${k.note}`)).map(k => (k.x === 0 && k.y === 0 && !k.photo ? { ...k, x: null, y: null } : k));
    const mineLabels = new Set(mine.map(k => String(k.label || '').trim().toLowerCase()).filter(Boolean));
    ds0.callouts = [...mine, ...ds0.callouts.filter(k => !mineLabels.has(String(k.label || '').trim().toLowerCase()))].slice(0, LIMITS.callouts).map((k, i) => ({ ...k, n: i + 1 }));
  }
  const extraViews = c.sketches.slice(Math.max(1, o.sketches.length));
  out.sketches = [...out.sketches, ...extraViews].slice(0, LIMITS.sketches);
  // measurements: the client's typed values and tolerances win per cell; rows they added are appended
  const oRows = new Map(o.pom.map(r => [r.code, r])), dRows = new Map(out.pom.map(r => [r.code, r]));
  for (const r of c.pom) {
    const orow = oRows.get(r.code), drow = dRows.get(r.code);
    if (!orow) { if (!drow) out.pom.push(r); continue; }
    if (!drow) continue;
    for (const [s, v] of Object.entries(r.values)) if (v && v !== (orow.values[s] ?? '')) drow.values[s] = v;
    if (r.tolerance !== orow.tolerance) drow.tolerance = r.tolerance; if (r.name !== orow.name) drow.name = r.name; if (r.how !== orow.how) drow.how = r.how;
  }
  const keep = (key, by) => { if (!same(c[key], o[key])) { const seen = new Set(c[key].map(by)); out[key] = [...c[key], ...out[key].filter(r => !seen.has(by(r)))].slice(0, LIMITS[key] || 50); } };
  keep('bom', r => r.component.toLowerCase()); keep('construction', r => r.area.toLowerCase()); keep('colorways', r => r.name.toLowerCase()); keep('labels', r => r.item.toLowerCase());
  for (const k of Object.keys(o.packaging)) if (c.packaging[k] !== o.packaging[k]) out.packaging[k] = c.packaging[k];
  for (const k of Object.keys(o.care)) if (c.care[k] !== o.care[k]) out.care[k] = c.care[k];
  if (c.notes !== o.notes) out.notes = [c.notes, out.notes].filter(Boolean).join('\n\n');
  // pictures the client uploaded stay; pictures the assistant made (cut-out, colourway tiles) come from the new draft
  const generated = r => /^(cw-|cutout-)/.test(String(r.id || ''));
  const ownPics = c.renderings.filter(r => !generated(r));
  out.renderings = [...ownPics, ...out.renderings.filter(r => !ownPics.some(p => p.id === r.id))].slice(0, LIMITS.renderings || 6);
  out.artwork = c.artwork.length ? c.artwork : out.artwork;
  return normalizeTechPack(out);
}

// What the product card shows (material, decoration, colourways, size run) comes from the tech pack's own tables. A field the pack does not
// state is left out, so a blank pack never erases what is on the card. The default size run only counts once the pack has real content.
const distinct = (items, max) => { const seen = new Set(), out = []; for (const raw of items) { const v = String(raw || '').replace(/\s+/g, ' ').trim(); if (!v || seen.has(v.toLowerCase())) continue; seen.add(v.toLowerCase()); out.push(v); if (out.length >= max) break; } return out; };
export function packHasContent(data) {
  const d = normalizeTechPack(data);
  return d.pom.some(r => Object.values(r.values).some(Boolean)) || d.bom.length > 0 || d.colorways.length > 0 || d.sketches.some(s => s.callouts.length > 0);
}
export function cardFieldsFromPack(data) {
  const d = normalizeTechPack(data), out = {};
  const materials = distinct(d.bom.map(r => r.material), 6); if (materials.length) out.material = materials.join(', ').slice(0, 200);
  const methods = distinct(d.artwork.map(a => a.name || (a.image ? 'Artwork' : '')), 4); if (methods.length) out.decoration_method = methods.join(', ').slice(0, 200);
  const places = distinct(d.artwork.flatMap(a => a.placements.map(p => p.label)), 8); if (places.length) out.decoration_locations = places;
  const colours = distinct(d.colorways.map(c => c.code ? `${c.name} (${c.code})` : c.name), 12); if (colours.length) out.colorways = colours;
  if (packHasContent(d) && d.sizes.length) out.sizes = d.sizes;
  return Object.keys(out).length ? out : null;
}

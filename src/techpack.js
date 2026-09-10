// Tech pack data model. Pure functions so the shape is enforced in one place and
// can be unit-tested: what the editor saves, what the viewer renders, what the
// generator seeds from a product's hub configuration, and the readiness /
// verification chain (factory acknowledgements + two signatures) that turns the
// pack from a document into a live sign-off instrument.

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
export const SKETCH_VIEWS = ['front', 'back', 'side', 'detail', 'flat', 'other'];
const LIMITS = { sketches: 12, sizes: 14, pom: 80, bom: 120, construction: 80, colorways: 16, labels: 30, callouts: 40, artwork: 12, pantones: 12, placements: 24, revisions: 200 };
const MAX_IMAGE_CHARS = 2_600_000;   // ~1.9MB decoded; the editor downsizes before upload
const MAX_PHOTO_CHARS = 700_000;     // callout detail photos are small crops
const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;

const str = (value, max = 2000) => String(value ?? '').replace(/\r/g, '').slice(0, max).trim();
const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '');
const unit = value => { const n = Number(value); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : null; };
const inches = value => { const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1000 ? Math.round(n * 100) / 100 : null; };
const list = (value, max, map) => (Array.isArray(value) ? value.slice(0, max).map(map) : []);
const image = (value, max = MAX_IMAGE_CHARS) => { const v = String(value || ''); return v && v.length <= max && IMAGE_RE.test(v) ? v : ''; };
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
const HEADWEAR_POM = [
  ['A', 'Crown circumference', 'Inside sweatband, fully around', '±0.25'],
  ['B', 'Crown height', 'Center front sweatband to top button', '±0.25'],
  ['C', 'Visor length', 'Center front sweatband to visor edge', '±0.125'],
  ['D', 'Visor width', 'Edge to edge at widest point', '±0.25'],
  ['E', 'Sweatband height', 'Bottom edge to top edge of sweatband', '±0.125']
];
export function pomTemplateFor(text) {
  const t = String(text || '').toLowerCase();
  if (/(cap|hat|beanie|bucket|visor|headwear)/.test(t)) return HEADWEAR_POM;
  if (/(pant|short|trouser|jogger|bottom|denim|jean)/.test(t)) return BOTTOMS_POM;
  if (/(tee|shirt|tank|polo|knit|hoodie|sweat|crew|jacket|shell|top|apparel|dress|vest|fleece|layer)/.test(t)) return TOPS_POM;
  return [];
}

// Builds a first-draft pack from the product and its existing hub configuration.
export function seedTechPack({ product = {}, configuration = null, brief = null, now = new Date() } = {}) {
  const pack = emptyTechPack();
  const c = configuration || {};
  const descriptor = `${product.title || ''} ${product.product_type || ''} ${c.blank_name || ''}`;
  const apparel = pomTemplateFor(descriptor);
  const sizes = Array.isArray(c.sizes) && c.sizes.length ? c.sizes.map(s => str(s, 12)).filter(Boolean).slice(0, LIMITS.sizes) : (apparel.length ? [...DEFAULT_SIZES] : ['One size']);
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
  if (c.material || c.blank_name) pack.bom.push({ component: 'Main body', material: str(c.material, 200), spec: str(c.blank_name, 300), supplier: str(c.supplier_name, 120), ref: '', color: '', placement: 'Body', qty: '1', unit: 'pc', notes: '' });
  if (c.decoration_method) {
    const size = c.artwork_width_in && c.artwork_height_in ? `${c.artwork_width_in}" × ${c.artwork_height_in}"` : '';
    const locations = Array.isArray(c.decoration_locations) ? c.decoration_locations.join(', ') : '';
    pack.bom.push({ component: `Decoration — ${str(c.decoration_method, 120)}`, material: '', spec: [size, brief?.decoration].filter(Boolean).join(' · '), supplier: '', ref: '', color: '', placement: locations, qty: String((c.decoration_locations || []).length || 1), unit: 'placement', notes: '' });
  }
  if (c.construction) pack.construction.push({ area: 'Overall', detail: str(c.construction, 600) });
  pack.colorways = (Array.isArray(c.colorways) ? c.colorways : []).slice(0, LIMITS.colorways).map(name => ({ name: str(name, 80), code: '', swatch: '', notes: '' }));
  if (apparel.length) {
    pack.labels = apparel === HEADWEAR_POM
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
    ['sketches', 'Front and back mockups', d.sketches.some(s => s.view === 'front' && s.image) && d.sketches.some(s => s.view === 'back' && s.image)],
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
export function emptyVerification(version = 0) { return { version, acks: {}, brandSign: null, factorySign: null }; }
export function normalizeVerification(input, version) {
  const v = input && typeof input === 'object' ? input : {};
  if (Number(v.version) !== Number(version)) return emptyVerification(version);
  const sig = s => (s && typeof s === 'object' && s.name ? { name: str(s.name, 120), at: str(s.at, 40), by: str(s.by, 200) } : null);
  const acks = {};
  for (const [key, ack] of Object.entries(v.acks && typeof v.acks === 'object' ? v.acks : {}).slice(0, LIMITS.sketches * LIMITS.callouts)) {
    if (ack && typeof ack === 'object') acks[str(key, 60)] = { by: str(ack.by, 200), at: str(ack.at, 40) };
  }
  return { version: Number(version) || 0, acks, brandSign: sig(v.brandSign), factorySign: sig(v.factorySign) };
}

// Readiness of a published version: the sign-off checklist from the reel, computed, never hand-ticked.
export function techPackReadiness(data, verification) {
  const d = normalizeTechPack(data);
  const v = normalizeVerification(verification, verification?.version ?? 0);
  const callouts = d.sketches.flatMap(s => s.callouts.map(c => ({ key: calloutKey(s, c), label: c.label || `Callout ${c.n}`, sketch: s.view })));
  const pendingCallouts = callouts.filter(c => !v.acks[c.key]);
  const sample = d.style.sampleSize;
  const incompletePom = d.pom.filter(r => !(r.tolerance && (r.values[sample] || Object.values(r.values).some(Boolean))));
  const front = d.sketches.some(s => s.view === 'front' && s.image), back = d.sketches.some(s => s.view === 'back' && s.image);
  const artworkOk = d.artwork.length > 0 && d.artwork.every(a => a.image && a.pantones.length);
  const placed = d.artwork.flatMap(a => a.placements.filter(p => p.widthIn));
  const checks = [
    { key: 'mockups', label: 'Front + back garment mockups uploaded', ok: front && back, detail: front && back ? 'Both views uploaded' : `${[!front && 'front', !back && 'back'].filter(Boolean).join(' and ')} view missing` },
    { key: 'callouts', label: `All ${callouts.length} callout${callouts.length === 1 ? '' : 's'} acknowledged by factory`, ok: callouts.length > 0 && pendingCallouts.length === 0,
      detail: !callouts.length ? 'No callouts placed yet' : pendingCallouts.length ? `${pendingCallouts.length} pending: ${pendingCallouts.map(c => c.label).join(', ')}` : 'Factory acknowledged every callout' },
    { key: 'pom', label: `All ${d.pom.length} POM${d.pom.length === 1 ? '' : 's'} have spec + tolerance`, ok: d.pom.length > 0 && incompletePom.length === 0,
      detail: !d.pom.length ? 'No points of measure' : incompletePom.length ? `${incompletePom.length} incomplete: ${incompletePom.map(r => r.code || r.name).join(', ')}` : `Sample size ${sample || '—'} specified with tolerances` },
    { key: 'artwork', label: 'Artwork uploaded and Pantone matched', ok: artworkOk, detail: artworkOk ? `${d.artwork.length} artwork file${d.artwork.length === 1 ? '' : 's'} with Pantone references` : d.artwork.length ? 'Artwork missing Pantone references' : 'No artwork uploaded — required for production' },
    { key: 'placement', label: 'Artwork placed on garment with spec', ok: placed.length > 0, detail: placed.length ? `${placed.length} placement${placed.length === 1 ? '' : 's'} with width in inches` : 'No placements yet — required for production' }
  ];
  const ready = checks.every(c => c.ok);
  const locked = Boolean(v.brandSign && v.factorySign);
  return { version: v.version, checks, ready, pendingCalloutKeys: pendingCallouts.map(c => c.key), callouts, brandSign: v.brandSign, factorySign: v.factorySign, locked };
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
      revisions: (Array.isArray(row.revisions) ? row.revisions : []).slice(-LIMITS.revisions)
    }
  };
}

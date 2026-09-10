// Tech pack data model. Pure functions so the shape is enforced in one place and
// can be unit-tested: what the editor saves, what the viewer renders, and what
// the generator seeds from a product's existing hub configuration.

export const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL'];
export const SKETCH_VIEWS = ['front', 'back', 'side', 'detail', 'flat', 'other'];
const LIMITS = { sketches: 12, sizes: 14, pom: 80, bom: 120, construction: 80, colorways: 16, labels: 30, callouts: 30, revisions: 200 };
const MAX_IMAGE_CHARS = 2_600_000; // ~1.9MB decoded; the editor downsizes before upload
const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i;

const str = (value, max = 2000) => String(value ?? '').replace(/\r/g, '').slice(0, max).trim();
const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '');
const list = (value, max, map) => (Array.isArray(value) ? value.slice(0, max).map(map) : []);
const image = value => { const v = String(value || ''); return v && v.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(v) ? v : ''; };
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
  return {
    style: Object.fromEntries(Object.keys(base.style).map(k => [k, str(style[k], k === 'description' ? 3000 : 200)])),
    sketches: list(src.sketches, LIMITS.sketches, s => ({
      id: id(s?.id),
      view: SKETCH_VIEWS.includes(s?.view) ? s.view : 'front',
      label: str(s?.label, 120),
      image: image(s?.image),
      callouts: list(s?.callouts, LIMITS.callouts, c => ({ n: Math.max(1, Math.min(99, Number(c?.n) || 0)) || 1, note: str(c?.note, 400) })).filter(c => c.note)
    })),
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
    labels: list(src.labels, LIMITS.labels, r => ({ item: str(r?.item, 120), spec: str(r?.spec, 400), placement: str(r?.placement, 200) })).filter(r => r.item),
    packaging: Object.fromEntries(Object.keys(base.packaging).map(k => [k, str(packaging[k], k === 'notes' ? 1500 : 200)])),
    care: Object.fromEntries(Object.keys(base.care).map(k => [k, str(care[k], k === 'instructions' || k === 'compliance' ? 1500 : 300)])),
    notes: str(src.notes, 6000)
  };
}

const TOPS_POM = [
  ['A', 'Body length from HPS', 'High point shoulder straight down to bottom of hem', '±1/2'],
  ['B', 'Chest width 1" below armhole', 'Edge to edge, 1" below armhole, laid flat', '±1/2'],
  ['C', 'Across shoulder', 'Shoulder seam to shoulder seam across back', '±3/8'],
  ['D', 'Sleeve length from CB', 'Center back neck along shoulder to sleeve opening', '±1/2'],
  ['E', 'Armhole straight', 'Shoulder seam to underarm point, straight', '±1/4'],
  ['F', 'Sleeve opening', 'Edge to edge at sleeve hem, relaxed', '±1/4'],
  ['G', 'Neck width seam to seam', 'Inside neck seam to inside neck seam', '±1/4'],
  ['H', 'Front neck drop', 'HPS to top of front neck seam', '±1/4'],
  ['I', 'Hem width', 'Edge to edge at bottom hem, relaxed', '±1/2']
];
const BOTTOMS_POM = [
  ['A', 'Waist relaxed', 'Edge to edge at top of waistband, relaxed', '±1/2'],
  ['B', 'Waist extended', 'Edge to edge at top of waistband, fully extended', '±1/2'],
  ['C', 'Front rise', 'Crotch seam to top of waistband, front', '±1/4'],
  ['D', 'Back rise', 'Crotch seam to top of waistband, back', '±1/4'],
  ['E', 'Inseam', 'Crotch seam to bottom of leg opening', '±1/2'],
  ['F', 'Thigh 1" below crotch', 'Edge to edge 1" below crotch seam', '±1/4'],
  ['G', 'Knee', 'Edge to edge at midpoint of inseam', '±1/4'],
  ['H', 'Leg opening', 'Edge to edge at hem, relaxed', '±1/4'],
  ['I', 'Hip', 'Edge to edge at fullest point of hip', '±1/2']
];
const HEADWEAR_POM = [
  ['A', 'Crown circumference', 'Inside sweatband, fully around', '±1/4'],
  ['B', 'Crown height', 'Center front sweatband to top button, front', '±1/4'],
  ['C', 'Visor length', 'Center front sweatband to visor edge', '±1/8'],
  ['D', 'Visor width', 'Edge to edge at widest point', '±1/4'],
  ['E', 'Sweatband height', 'Bottom edge to top edge of sweatband', '±1/8']
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

export function techPackCompleteness(data) {
  const d = normalizeTechPack(data);
  const checks = [
    ['style', 'Style number and name', Boolean(d.style.styleNumber && d.style.styleName)],
    ['sketches', 'At least one sketch image', d.sketches.some(s => s.image)],
    ['sizes', 'Size run', d.sizes.length > 0],
    ['pom', 'Measurements with values', d.pom.some(r => Object.values(r.values).some(Boolean))],
    ['bom', 'Bill of materials', d.bom.length > 0],
    ['construction', 'Construction details', d.construction.length > 0],
    ['colorways', 'Colorways', d.colorways.length > 0],
    ['labels', 'Labels', d.labels.length > 0],
    ['care', 'Care instructions', Boolean(d.care.instructions)]
  ].map(([key, label, ok]) => ({ key, label, ok }));
  return { checks, missing: checks.filter(c => !c.ok).map(c => c.label), complete: checks.every(c => c.ok) };
}

// What clients and factories receive: the published snapshot only, never the live draft.
export function publishedTechPackView(row, extra = {}) {
  return {
    audience: extra.audience || 'client',
    shareLabel: extra.shareLabel || null,
    product: { id: row.product_id, title: row.title, productType: row.product_type, imageUrl: row.shopify_image_url || null, imageAlt: row.shopify_image_alt || null, clientName: row.client_name, projectName: row.project_name || null },
    techPack: {
      version: row.version, publishedAt: row.published_at,
      data: normalizeTechPack(row.published_data),
      revisions: (Array.isArray(row.revisions) ? row.revisions : []).slice(-LIMITS.revisions)
    }
  };
}

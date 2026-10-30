// What a Design Lab concept hands to its tech pack, as data the pack works with rather than pictures alone: the graded points of measure from
// its flats, the sizes, the sketches (front and back flats), the colour, every detail, stitch and placement as construction and BOM lines, and
// the plan's price, cost and quantity. Merged into whatever the pack already holds, so the assistant's draft and anyone's edits stay; sending it
// again after a change replaces what came from the flats last time and nothing else.
//   labHandoff(pack, lab) → the pack with the Lab's part laid in (a normalised pack in, a normalised pack out: the caller normalises)
import { MATERIALS_NOTE } from './lab-materials.js';
export const FLATS_NOTE = 'From the flats';
export const ENG_NOTE = 'From engineering';
const LAB_LINE = /^From the Design Lab: .*$/m;
const money = cents => (cents == null || !Number.isFinite(Number(cents)) ? '' : (Number(cents) / 100).toFixed(2));

// the pack names the largest size 2XL; the flats call it XXL
const packSize = (size, packSizes) => (size === 'XXL' && packSizes.includes('2XL') ? '2XL' : size);

export function labHandoff(pack, lab = {}) {
  const out = structuredClone(pack);
  // sizes and points of measure: the flats' rows go first, replacing rows of the same name or code; the pack's own other rows stay after them
  if (lab.pom?.length) {
    const sizes = (lab.sizes || []).map(s => packSize(s, out.sizes || []));
    if (sizes.length) out.sizes = sizes;
    const rows = lab.pom.map(r => ({ code: String(r.code || '').slice(0, 8), name: String(r.name || '').slice(0, 160), how: String(r.how || FLATS_NOTE).slice(0, 400), tolerance: String(r.tolerance ?? '').slice(0, 24),
      values: Object.fromEntries(Object.entries(r.values || {}).map(([s, v]) => [packSize(s, out.sizes), String(v ?? '')])) }));
    const names = new Set(rows.map(r => r.name.toLowerCase())), codes = new Set(rows.map(r => r.code.toUpperCase()));
    const kept = (out.pom || []).filter(r => !names.has(String(r.name).toLowerCase()) && !codes.has(String(r.code).toUpperCase()) && r.how !== FLATS_NOTE)
      .map(r => ({ ...r, values: Object.fromEntries(out.sizes.map(s => [s, r.values?.[s] ?? ''])) }));
    out.pom = [...rows, ...kept].slice(0, 80);
  }
  // the flats as the pack's front and back sketches (a pack needs both before it can go to a factory); a view the pack already has a picture
  // of keeps it, and the flat is added beside it as a flat
  for (const sk of lab.sketches || []) {
    const id = sk.id || `lab-flat-${sk.view}`;
    out.sketches = (out.sketches || []).filter(s => s.id !== id);
    const taken = !sk.id && out.sketches.some(s => s.view === sk.view && s.image);
    if (out.sketches.length < 12) out.sketches.push({ id, view: taken ? 'flat' : sk.view, label: sk.label, image: sk.image, garmentWidthIn: sk.widthIn || null, hero: null, callouts: [] });
  }
  // construction and materials: what came from the flats last time is replaced; the rest stays
  if (lab.construction) out.construction = [...(out.construction || []).filter(r => !String(r.area).startsWith('Flats · ')), ...lab.construction.map(r => ({ area: `Flats · ${r.area}`.slice(0, 120), detail: String(r.detail).slice(0, 600) }))].slice(0, 80);
  if (lab.bom) out.bom = [...(out.bom || []).filter(r => r.notes !== FLATS_NOTE), ...lab.bom.map(r => ({ component: '', material: '', spec: '', supplier: '', ref: '', color: '', placement: '', qty: '', unit: '', cost: '', ...r, notes: FLATS_NOTE }))].slice(0, 120);
  // the materials library: its BOM lines and labels replace what came from it last time; colourways go after the main colour
  if (lab.materials) {
    out.bom = [...(out.bom || []).filter(r => r.notes !== MATERIALS_NOTE), ...lab.materials.bom.map(r => ({ component: '', material: '', spec: '', supplier: '', ref: '', color: '', placement: '', qty: '', unit: '', cost: '', ...r, notes: MATERIALS_NOTE }))].slice(0, 80);
    const items = new Set(lab.materials.labels.map(l => l.item));
    out.labels = [...lab.materials.labels, ...(out.labels || []).filter(l => !items.has(l.item) && !/^(Neck label|Size tab|Care and content label|Hem tag|Sleeve tag|Waistband label|Back pocket patch|Locker loop label|Sweatband label|Hang tag|Size sticker) · /.test(l.item))].slice(0, 40);
  }
  if (lab.colourways?.length) {
    const cws = lab.colourways.map(c => ({ name: c.name || c.pantone || c.hex, code: c.pantone || '', swatch: c.hex, notes: `${MATERIALS_NOTE}${c.thread ? ` · thread ${c.threadPantone || c.thread}` : ''}` }));
    out.colorways = [...(out.colorways || []).filter(c => !String(c.notes || '').startsWith(MATERIALS_NOTE) && !cws.some(x => x.swatch === c.swatch)), ...cws].slice(0, 16);
  }
  // the main colour, as the first colourway
  if (lab.color?.hex) {
    const cw = { name: lab.color.name || 'Main colour', code: lab.color.code || '', swatch: lab.color.hex, notes: FLATS_NOTE };
    out.colorways = [cw, ...(out.colorways || []).filter(c => c.notes !== FLATS_NOTE && c.swatch !== cw.swatch)].slice(0, 16);
  }
  // the plan's numbers: the shelf price where none is set yet, and one line in the notes for the cost and quantity it was planned at
  if (lab.priceCents != null && out.commercial && !out.commercial.retailPrice) out.commercial.retailPrice = money(lab.priceCents);
  const line = [lab.priceCents != null && `target retail $${money(lab.priceCents)}`, lab.costCents != null && `target landed cost $${money(lab.costCents)}`, lab.qty && `planned quantity ${lab.qty}`, lab.planName && `line plan "${lab.planName}"`].filter(Boolean).join(', ');
  if (line) out.notes = (LAB_LINE.test(out.notes || '') ? out.notes.replace(LAB_LINE, `From the Design Lab: ${line}.`) : [`From the Design Lab: ${line}.`, out.notes].filter(Boolean).join('\n\n')).slice(0, 6000);
  // engineering (src/lab-assembly.js packFromAssembly, for hard goods and electronics): the assembled and exploded views as sketches, the parts
  // and cables as BOM lines, the steps, tools and open checks as construction lines, and for an electronic product its components, its
  // certifications (a certification the pack already has keeps its status) and the electrical facts the pack has not filled in yet. Sending
  // it again replaces what engineering sent last time and nothing else.
  const eng = lab.engineering;
  if (eng) {
    for (const sk of eng.sketches || []) {
      out.sketches = (out.sketches || []).filter(x => x.id !== sk.id);
      const taken = out.sketches.some(x => x.view === sk.view && x.image);
      if (out.sketches.length < 12) out.sketches.push({ id: sk.id, view: taken ? 'other' : sk.view, label: sk.label, image: sk.image, garmentWidthIn: null, hero: null, callouts: [] });
    }
    if (eng.bom) out.bom = [...(out.bom || []).filter(r => r.notes !== ENG_NOTE), ...eng.bom.map(r => ({ component: '', material: '', spec: '', supplier: '', ref: '', color: '', placement: '', qty: '', unit: '', cost: '', ...r, notes: ENG_NOTE }))].slice(0, 120);
    const ENG_AREA = /^(Assembly|Tooling|Engineering check) · /;
    if (eng.construction) out.construction = [...(out.construction || []).filter(r => !ENG_AREA.test(String(r.area))), ...eng.construction].slice(0, 80);
    if (eng.electronics && out.electronics) {
      const e = out.electronics, been = r => String(r.notes || '').startsWith(ENG_NOTE) || /^(On the main board|Off the board)/.test(String(r.notes || '')) || /^W\d+$/.test(String(r.ref || ''));
      e.enabled = true;
      e.components = [...eng.electronics.components, ...(e.components || []).filter(r => !been(r))].slice(0, 120);
      const have = new Set((e.certifications || []).map(c => String(c.name).toLowerCase()));
      e.certifications = [...(e.certifications || []), ...eng.electronics.certifications.filter(c => !have.has(c.name.toLowerCase())).map(c => ({ name: c.name, market: c.market, required: true, status: 'needed', lab: '', notes: c.notes }))].slice(0, 40);
      e.specs = { ...(e.specs || {}) }; for (const [k, v] of Object.entries(eng.electronics.specs || {})) if (!e.specs[k]) e.specs[k] = v;
    }
  }
  // the style's empty fields
  for (const [k, v] of Object.entries(lab.style || {})) if (v && out.style && !out.style[k]) out.style[k] = String(v).slice(0, 200);
  return out;
}

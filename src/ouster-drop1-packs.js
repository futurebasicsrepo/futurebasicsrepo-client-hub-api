// Ouster Merch Drop 1, second pass: a tech pack for each of the 15 styles, made from the Google Doc "Ouster Merch Drop 1 — Tech Pack & Product
// Mockups" (the screenshots of the Figma "Merch Presentation (Nov5)") and its words. The pictures are in src/seed/ouster-drop1 (manifest.json says which
// doc image each one is; a store product-page frame is cropped to its product photo). Runs once, after src/ouster-drop1.js made the products.
//
// Each pack is a working draft for the team to check and publish: the product photo first (it is the product's card picture), the back and detail
// views, the store hero and lifestyle shots, the artwork options, callouts placed on the product photo, materials, construction, labels, packaging,
// colourways and every open question. Nothing is invented where the doc is silent: blanks, weights and size runs stay "to confirm".
// A product that already has a pack keeps everything in it: only what is empty is filled, and the Drop 1 artwork is added beside any there.
import { readFileSync } from 'node:fs';
import { DROP1, describe } from './ouster-drop1.js';
import { normalizeTechPack, emptyTechPack } from './techpack.js';

export const OUSTER_PACKS_KEY = 'seed:ouster-merch-drop-1-packs';
const DIR = new URL('./seed/ouster-drop1/', import.meta.url);
export const MANIFEST = JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8'));
const picture = file => `data:image/jpeg;base64,${readFileSync(new URL(file, DIR)).toString('base64')}`;
const APPAREL = new Set(['T-Shirt', 'Long Sleeve', 'Jersey']);

// which pictures belong to which style, and the material and parts of each, from the doc
const DETAIL = {
  'ouster-drop1-tee-infrared': { key: 'infrared', material: 'Cotton jersey (blank, fabric and weight to confirm)',
    callouts: [{ x: .5, y: .1, label: 'Neck label', spec: 'Woven label, size tab below' }, { x: .5, y: .46, label: 'Centre-chest print', spec: 'White line drawing of Ouster hardware: choose Option 1–4' }, { x: .38, y: .84, label: 'Hem print', spec: 'Small mark + 3-line tagline, lower front left above the hem' }],
    bom: [['Body', 'Black / washed charcoal short-sleeve tee, crew neck', 'Blank and weight to confirm'], ['Front print', 'White ink', 'Centre chest, one of four artwork options'], ['Hem print', 'White ink', 'Lower front left'], ['Neck label', 'Woven label', 'Kelvin label art, size tab']],
    construction: [['Neck', 'Crew neck, rib collar'], ['Fit', 'Regular fit, short sleeve'], ['Decoration', 'Screen print (to confirm) at centre chest and lower front hem']] },
  'ouster-drop1-tee-taxi': { key: 'taxi', material: 'Cotton jersey (blank, fabric and weight to confirm)',
    callouts: [{ x: .38, y: .3, label: 'REV8 mark', spec: 'Small chest hit, wearer\'s right' }, { x: .61, y: .3, label: 'Ouster mark', spec: 'Small chest hit, wearer\'s left' }, { x: .5, y: .1, label: 'Neck label', spec: 'Woven label' }],
    back: [{ x: .5, y: .45, label: 'Back photo print', spec: 'Full-colour photo panel (NYC street, yellow taxi), caption line and small mark beneath' }],
    bom: [['Body', 'White short-sleeve tee, crew neck', 'Blank and weight to confirm'], ['Chest prints', 'REV8 mark + Ouster mark', 'Two small hits'], ['Back print', 'Full-colour photograph', 'DTG or sim-process to confirm'], ['Neck label', 'Woven label', 'As Cap1 OT-S']],
    construction: [['Neck', 'Crew neck, rib collar'], ['Fit', 'Short sleeve'], ['Decoration', 'Chest hits front; large photo panel on the back']] },
  'ouster-drop1-ls-yosemite': { key: 'yosemite', material: 'Cotton jersey, bone / stone (blank and weight to confirm)',
    callouts: [{ x: .4, y: .32, label: 'REV8 mark', spec: 'Chest, as the Taxi tee' }, { x: .6, y: .32, label: 'Ouster mark', spec: 'Chest, as the Taxi tee' }, { x: .33, y: .5, label: 'Sleeve type', spec: '"Sense in Color", large mono type down the sleeve. The doc says the left sleeve; the mockup shows it on the wearer\'s right: confirm' }],
    back: [{ x: .5, y: .35, label: 'Back photo band', spec: 'Wide landscape photo (Yosemite valley with vehicle) across the upper back, caption + mark below' }],
    bom: [['Body', 'Bone / stone long-sleeve tee, rib cuffs', 'Blank and weight to confirm'], ['Chest prints', 'REV8 mark + Ouster mark', ''], ['Back print', 'Full-colour photograph', 'Upper back band'], ['Sleeve print', '"Sense in Color"', 'Tonal grey (to confirm)'], ['Neck label', 'Woven label', 'As Cap1 OT-S']],
    construction: [['Neck', 'Crew neck, rib collar'], ['Sleeves', 'Long sleeve, rib cuffs'], ['Decoration', 'Chest hits, back photo band, sleeve type']] },
  'ouster-drop1-cap-tan': { key: 'cap-tan', material: 'Washed cotton twill, tan',
    callouts: [{ x: .5, y: .42, label: 'Front embroidery', spec: 'White flat embroidery: stacked Ouster mark over OUSTER wordmark, centred' }, { x: .5, y: .86, label: 'Visor', spec: 'Pre-curved' }],
    bom: [['Crown', 'Washed cotton twill, 6-panel unstructured', 'Tan'], ['Embroidery', 'White thread', 'Front centre, flat'], ['Strap', 'Self-fabric, brushed metal slide buckle', ''], ['Flag label', 'Small woven label on the strap', ''], ['Inner label', 'Printed woven label', 'Kelvin label art']],
    construction: [['Crown', 'Unstructured 6-panel with eyelets'], ['Visor', 'Pre-curved'], ['Closure', 'Self-fabric strap, brushed metal slide buckle']] },
  'ouster-drop1-cap-green': { key: 'cap-green', material: 'Washed cotton twill, olive / military green',
    callouts: [{ x: .5, y: .42, label: 'Front embroidery', spec: 'White flat embroidery, as Cap — Tan' }, { x: .5, y: .86, label: 'Visor', spec: 'Pre-curved' }],
    bom: [['Crown', 'Washed cotton twill, 6-panel unstructured', 'Olive'], ['Embroidery', 'White thread', 'Front centre, flat'], ['Strap', 'Self-fabric, brushed metal slide buckle', ''], ['Inner label', 'Printed woven label', 'Kelvin label art']],
    construction: [['Crown', 'Unstructured 6-panel with eyelets'], ['Visor', 'Pre-curved'], ['Closure', 'Self-fabric strap, brushed metal slide buckle']] },
  'ouster-drop1-beanie-green': { key: 'beanie', material: 'Chunky rib knit, olive (yarn to confirm)',
    callouts: [{ x: .43, y: .78, label: 'Woven patch', spec: 'Sewn on the cuff: Ouster lockup, sensor illustration, "100% Authentic", "EST. 2015", Kelvin quote' }, { x: .5, y: .3, label: 'Body', spec: 'Chunky rib knit' }],
    bom: [['Body', 'Chunky rib knit, olive', 'Yarn to confirm'], ['Patch', 'Woven patch', 'Sewn on the cuff']],
    construction: [['Body', 'Rib knit, cuffed'], ['Patch', 'Sewn to the cuff, centred front']] },
  'ouster-drop1-water-bottle': { key: 'bottle', material: 'Nalgene 1000 ml wide-mouth, clear',
    callouts: [{ x: .5, y: .22, label: 'Loop cap', spec: 'Black' }, { x: .5, y: .76, label: 'Wrap print', spec: 'Colour point-cloud scene (sensor on rock), lower third; small Ouster text at the side' }],
    bom: [['Bottle', 'Nalgene 1000 ml wide-mouth, clear, graduated', 'Co-branding approval needed'], ['Cap', 'Black loop cap', ''], ['Print', 'Full-colour wrap', 'Pad vs. wrap to confirm']],
    construction: [['Decoration', 'Wrap print on the lower third']] },
  'ouster-drop1-multitool': { key: 'multitool', material: 'Leatherman ARC (MagnaCut blade), bronze / olive handles',
    callouts: [{ x: .43, y: .38, label: 'Engraving', spec: 'Laser-engraved Ouster lockup on the handle' }],
    bom: [['Tool', 'Leatherman ARC, MagnaCut blade', 'Bronze / olive handles'], ['Decoration', 'Laser engraving', 'Handle']],
    construction: [['Decoration', 'Laser-engraved lockup; minimums and lead time from Leatherman to confirm']] },
  'ouster-drop1-point-cloud-artwork': { key: 'point-cloud', material: 'Art print (paper to confirm); light oak frame, white mat',
    callouts: [{ x: .5, y: .5, label: 'Artwork', spec: 'Night aerial point cloud of Potrero Avenue, San Francisco ("Captured by REV8")' }, { x: .3, y: .2, label: 'Frame', spec: 'Light oak, white mat' }],
    bom: [['Print', 'Point-cloud artwork', 'Size, paper and edition to confirm'], ['Frame', 'Light oak with white mat', 'Framed version'], ['Tube', 'Black tube with spec label', 'Unframed version']],
    construction: [['Format', 'Framed, or rolled in a tube (one or two SKUs to decide)']] },
  'ouster-drop1-notebook': { key: 'notebook', material: 'Black hardcover, dot-grid pages (blank brand and page count to confirm)',
    callouts: [{ x: .5, y: .3, label: 'Cover', spec: 'Ouster mark, "From thought to physical", page / paper spec line, corner crop marks' }, { x: .63, y: .5, label: 'Elastic closure', spec: 'With ribbon marker' }],
    bom: [['Notebook', 'Black hardcover, dot grid, elastic closure, ribbon', 'Moleskine-style'], ['Cover', 'Ouster mark and spec line', 'Deboss or print to confirm']],
    construction: [['Binding', 'Hardcover, elastic closure, ribbon marker']] },
  'ouster-drop1-kaweco-pen': { key: 'pen', material: 'Kaweco Steel Sport, brushed steel',
    callouts: [{ x: .5, y: .47, label: 'Etching', spec: 'Laser-etched Ouster lockup on the barrel' }],
    bom: [['Pen', 'Kaweco Steel Sport ballpoint, brushed steel, octagonal', ''], ['Decoration', 'Laser etching', 'Barrel']],
    construction: [['Decoration', 'Laser-etched lockup on the barrel']] },
  'ouster-drop1-pencil-pack': { key: 'pencils', material: 'HB graphite, FSC certified cedar, black finish',
    callouts: [{ x: .5, y: .35, label: 'Pencil print', spec: '"From Thought to Physical" and the Ouster mark on each pencil' }],
    bom: [['Pencils', '6 × HB graphite, FSC certified cedar, black', 'Natural-wood sharpened tips'], ['Print', 'Foil or print', 'Each pencil'], ['Box', 'Black box with window tray', '']],
    construction: [['Pack', '6 pencils in a window-tray box']] },
  'ouster-drop1-sticker-pack': { key: 'stickers', material: 'Vinyl stickers, one holographic (to confirm); printed sleeve',
    callouts: [{ x: .5, y: .2, label: 'Sleeve', spec: '"Model: Sticker Pack · Version 1 · Number of units 8", "Sense. Think. Act. Learn."' }, { x: .5, y: .7, label: 'Stickers', spec: '8 designs: compute unit, holographic plate, point cloud, Ouster badge, "Ouster Inside", quadcopter, WARNING label, Ouster FC crest, sparkle badge (9 shown: pick 8)' }],
    bom: [['Stickers', '8 die-cut stickers', 'Finish per design to confirm'], ['Sleeve', 'Branded printed sleeve', '']],
    construction: [['Pack', '8 stickers in a sleeve']] },
  'ouster-drop1-impossible-puzzle': { key: 'puzzle', material: 'Jigsaw puzzle, printed box (piece count and size to confirm)',
    callouts: [{ x: .5, y: .4, label: 'Box', spec: '"Unprocessable Point Cloud Puzzle", age 21+, black box with the Ouster mark' }],
    bom: [['Puzzle', 'Printed jigsaw', 'Piece count and finished size to confirm'], ['Box', 'Black printed box', '']],
    construction: [['Scenes', 'SF rowhouses, Golden Gate Park aerial, park / garden aerial: choose which to produce']] },
  'ouster-drop1-ocho-jersey': { key: 'jersey', material: 'Polyester football jersey knit, black with grey pinstripes (to confirm)',
    callouts: [{ x: .36, y: .22, label: 'REV8', spec: 'Right chest' }, { x: .55, y: .22, label: '"THE OCHO"', spec: 'Centre' }, { x: .66, y: .2, label: 'Ouster FC crest', spec: 'Left chest' }, { x: .55, y: .55, label: 'Chest graphic', spec: 'Large mark + asterisk, mid-chest' }, { x: .15, y: .22, label: 'Sleeve graphic', spec: 'Chevron / mark on both sleeves' }],
    back: [{ x: .5, y: .15, label: '"Ouster FC"', spec: 'At the neck' }, { x: .5, y: .45, label: '"08"', spec: 'Large serif number' }, { x: .5, y: .9, label: 'Hem text', spec: '"Sense. Think. Act. Learn."' }],
    bom: [['Body', 'Black raglan football jersey, grey horizontal pinstripes', 'Fabric to confirm'], ['Decoration', 'Front, sleeves and back graphics', 'Sublimated or printed to confirm']],
    construction: [['Sleeves', 'Raglan'], ['Decoration', 'Sublimated or printed (to confirm)']] }
};

const LABELS = {
  apparel: [{ item: 'Neck label', spec: 'Woven: Ouster lockup, sensor illustration, "100% Authentic", "EST. 2015", Kelvin quote; size tab', placement: 'Centre back neck' },
    { item: 'Hang tag', spec: 'Layered, three cards on one string; message to choose: "Spatial Coverage & Adaptability Garments" or "Lidar maps the physical domain. These Garments navigate it."', placement: 'Neck label or side seam' },
    { item: 'Tech sticker', spec: 'Black: model code, size, front/back flats, spec lines (Detailed or General version)', placement: 'Poly bag' }],
  cap: [{ item: 'Inner label', spec: 'Printed woven, Kelvin label art', placement: 'Inside back' }, { item: 'Flag label', spec: 'Small woven flag', placement: 'Back strap' }, { item: 'Tech sticker', spec: 'Model code and size', placement: 'Poly bag' }],
  beanie: [{ item: 'Woven patch', spec: 'Ouster lockup, sensor illustration, "100% Authentic", "EST. 2015", Kelvin quote', placement: 'Cuff, centre front' }, { item: 'Tech sticker', spec: '"Cap1 OB-1 · One-Size-Fits-All"', placement: 'Zip bag' }]
};
const labelsFor = p => APPAREL.has(p.type) ? LABELS.apparel : p.type === 'Cap' ? LABELS.cap : p.type === 'Beanie' ? LABELS.beanie : [];
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// the pack, from the doc. Pure apart from reading the pictures.
export function buildPack(p) {
  const d = DETAIL[p.handle]; if (!d) return null;
  const pics = MANIFEST[d.key] || [], by = role => pics.filter(x => x.role === role), first = role => by(role)[0];
  const shared = APPAREL.has(p.type) ? MANIFEST.shared : [];
  const front = first('front'), back = first('back');
  const sketches = [
    front && { id: 'front', view: 'front', label: front.label, image: picture(front.file), callouts: d.callouts.map((c, i) => ({ n: i + 1, ...c, note: '' })) },
    back && { id: 'back', view: 'back', label: back.label, image: picture(back.file), callouts: (d.back || []).map((c, i) => ({ n: d.callouts.length + i + 1, ...c, note: '' })) },
    ...by('side').map(x => ({ id: slug(x.label), view: 'side', label: x.label, image: picture(x.file), callouts: [] })),
    ...by('detail').map(x => ({ id: slug(x.label), view: 'detail', label: x.label, image: picture(x.file), callouts: [] })),
    ...[...by('pack'), ...shared].map(x => ({ id: slug(`pack ${x.label}`), view: 'other', label: `Packaging: ${x.label}`, image: picture(x.file), callouts: [] }))
  ].filter(Boolean);
  const renderings = [front && { id: 'product', name: p.title, note: 'Product photo from the Figma store page', image: picture(front.file) },
    ...by('render').map(x => ({ id: slug(x.label), name: x.label, note: 'From the Figma store mockups', image: picture(x.file) }))].filter(Boolean);
  const artwork = by('art').map(x => ({ id: slug(x.label), name: x.label, image: picture(x.file), source: 'upload', note: p.handle === 'ouster-drop1-impossible-puzzle' ? 'Puzzle scene option' : 'Front artwork option: one to be chosen' }));
  const apparel = APPAREL.has(p.type);
  return normalizeTechPack({
    ...emptyTechPack(),
    style: { styleNumber: p.code || '', styleName: p.title, season: 'Merch Drop 1', category: p.type, designer: 'Ouster', sampleSize: apparel ? 'M' : '', fitBlock: apparel ? 'Regular (to confirm)' : '', fabricSummary: d.material, description: `${p.summary} ${p.decoration}` },
    sketches, renderings, artwork,
    sizes: apparel ? ['S', 'M', 'L', 'XL', '2XL'] : ['One Size'],
    bom: d.bom.map(([component, material, notes]) => ({ component, material, notes })),
    construction: d.construction.map(([area, detail]) => ({ area, detail })),
    colorways: p.colorways.map(name => ({ name })),
    labels: labelsFor(p),
    packaging: { polybag: apparel || ['Cap', 'Beanie'].includes(p.type) ? 'Frosted zip poly bag + black tech sticker' : '', carton: p.packaging || '', notes: 'Packaging pictures are in the views (Packaging: …).' },
    notes: [`From the Google Doc "Ouster Merch Drop 1 — Tech Pack & Product Mockups" (Figma "Merch Presentation (Nov5)"), 7 Nov 2026.`,
      apparel ? 'Size run is not in Figma (every page says One Size): S–2XL is a placeholder to confirm.' : '',
      'Prices are not set: Figma shows only the template $24.00 / $00.00.', p.open.length ? `Open: ${p.open.join('; ')}.` : ''].filter(Boolean).join('\n')
  });
}

// an existing pack keeps what it has; only what is empty is filled, and new artwork joins any there
export function mergePack(existing, fresh) {
  const cur = normalizeTechPack(existing || {}), out = { ...cur };
  out.style = Object.fromEntries(Object.entries(cur.style).map(([k, v]) => [k, v || fresh.style[k] || '']));
  for (const k of ['sketches', 'renderings', 'bom', 'construction', 'colorways', 'labels']) if (!cur[k].some(x => x.image || x.name || x.component || x.area || x.item)) out[k] = fresh[k];
  if (!cur.sketches.some(s => s.image)) out.sketches = fresh.sketches;
  const have = new Set(cur.artwork.map(a => a.name)); out.artwork = [...cur.artwork, ...fresh.artwork.filter(a => !have.has(a.name))];
  out.packaging = Object.fromEntries(Object.entries(cur.packaging).map(([k, v]) => [k, v || fresh.packaging[k] || '']));
  if (!cur.notes.trim()) out.notes = fresh.notes; else if (!cur.notes.includes('Merch Drop 1')) out.notes = `${cur.notes}\n\n${fresh.notes}`;
  return normalizeTechPack(out);
}

export async function applyOusterPacks(pool, { log = console } = {}) {
  if ((await pool.query('select 1 from app_settings where key=$1', [OUSTER_PACKS_KEY])).rowCount) return { skipped: 'already applied' };
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [OUSTER_PACKS_KEY]);
    if ((await db.query('select 1 from app_settings where key=$1', [OUSTER_PACKS_KEY])).rowCount) { await db.query('rollback'); return { skipped: 'already applied' }; }
    const client = (await db.query(`select id from clients where slug='ouster'`)).rows[0];
    if (!client) { await db.query('rollback'); return { skipped: 'no Ouster room' }; }
    const out = { made: [], filled: [], missing: [] };
    for (const p of DROP1) {
      const prod = (await db.query(`select p.id from products p join projects pr on pr.id=p.project_id where p.client_id=$1 and pr.name='Merch Drop 1' and p.title=$2 limit 1`, [client.id, p.title])).rows[0];
      if (!prod) { out.missing.push(p.title); continue; }
      const fresh = buildPack(p), tp = (await db.query('select id,data from tech_packs where product_id=$1', [prod.id])).rows[0];
      if (!tp) { await db.query(`insert into tech_packs(product_id,client_id,data,source) values($1,$2,$3,'hub')`, [prod.id, client.id, fresh]); out.made.push(p.title); }
      else { await db.query('update tech_packs set data=$2,updated_at=now() where id=$1', [tp.id, mergePack(tp.data, fresh)]); out.filled.push(p.title); }
      const d = DETAIL[p.handle];
      // the first pass wrote the description without a space between its paragraphs: put it right where nobody has changed it since
      await db.query('update products set description_html=$2 where id=$1 and description_html=$3', [prod.id, describe(p), describe(p).replace('</p> <p>', '</p><p>')]);
      await db.query(`update product_configurations set material=coalesce(nullif(material,''),$2),sizes=case when cardinality(sizes)>0 then sizes else $3 end,updated_at=now() where product_id=$1`,
        [prod.id, d.material, APPAREL.has(p.type) ? ['S', 'M', 'L', 'XL', '2XL'] : ['One Size']]);
    }
    await db.query(`insert into activities(client_id,type,summary,metadata) values($1,'tech-pack',$2,$3)`, [client.id, `Merch Drop 1 tech packs drafted from the Figma mockups: ${out.made.length} new, ${out.filled.length} filled in`, JSON.stringify(out)]);
    await db.query('insert into app_settings(key,value) values($1,$2::jsonb)', [OUSTER_PACKS_KEY, JSON.stringify({ at: new Date().toISOString(), ...out })]);
    await db.query('commit');
    log.info?.(out, 'Ouster Merch Drop 1 tech packs applied');
    return out;
  } catch (e) { await db.query('rollback').catch(() => {}); log.error?.({ err: e.message }, 'Ouster Merch Drop 1 tech packs not applied'); return { error: e.message }; }
  finally { db.release(); }
}

// Ouster Merch Drop 1: the room brought up to the tech pack written from the Figma file "Ouster Brand Playground" (page "Merch Presentation (Nov5)"),
// Google Doc "Ouster Merch Drop 1 — Tech Pack & Product Mockups", 7 Nov 2026. It supersedes the earlier 16-style "Merch Capsule 01".
//
// Runs once (app_settings key below), in one transaction, after the schema migration:
//   - a project "Merch Drop 1" holds the 15 styles;
//   - five products from Capsule 01 that are the same item become their Drop 1 style (their Shopify link, history, files and stage stay);
//   - the other Capsule 01 products move to an archived project "Merch Capsule 01 (superseded)", out of the room but not deleted;
//   - each style gets its brief and configuration from the doc (what is filled in already is kept), and the room a message with the open questions.
// Prices are not set: every Figma product page shows the template's $24.00 / $00.00, and the store copy reads as a giveaway.
export const OUSTER_DROP1_KEY = 'seed:ouster-merch-drop-1';
const SOURCE = 'Ouster Merch Drop 1 tech pack (Figma "Merch Presentation (Nov5)", 7 Nov 2026)';
const APPAREL_PACK = 'Frosted zip poly bag + black tech sticker (model, size, flats); medium black cardboard mailer with point-cloud inner print.';
const HARD_PACK = 'Matte black soft-touch rigid box with item insert; San Francisco postcard + 3 stickers.';
const LABEL = 'Woven label: Ouster lockup, sensor illustration, "100% Authentic", "EST. 2015", Lord Kelvin quote "All that remains is more and more precise measurement".';

// from: the Capsule 01 product (shopify_handle) that is the same item, kept and renamed
export const DROP1 = [
  { code: 'Cap1 OT-S', from: 'sensor-lineup-tee-black', handle: 'ouster-drop1-tee-infrared', title: 'T-Shirt "Infrared"', type: 'T-Shirt',
    summary: 'Black tee with a white line drawing of Ouster hardware at centre chest.',
    blank: 'Black / washed charcoal short-sleeve tee, crew neck, regular fit', construction: 'Crew neck short-sleeve tee, regular fit',
    decoration: 'Front: centre-chest white line drawing of Ouster hardware (sensor, stereo camera bar, finned compute unit), four artwork options. Hem: small mark + 3-line tagline, lower front left. Neck: woven label.',
    method: 'Screen print (to confirm)', locations: ['Centre chest', 'Lower front left hem', 'Neck label'], colorways: ['Black'], packaging: APPAREL_PACK,
    open: ['Pick the front artwork (Options 1–4)', 'Confirm blank, fabric weight and size run (Figma shows One Size only)'] },
  { code: 'Cap1 OT-S2', handle: 'ouster-drop1-tee-taxi', title: 'T-Shirt "Taxi"', type: 'T-Shirt',
    summary: 'White tee with a full-colour NYC taxi photo on the back.',
    blank: 'White short-sleeve tee, crew neck', construction: 'Crew neck short-sleeve tee',
    decoration: 'Front: two small chest hits, REV8 mark (wearer\'s right) and Ouster mark (wearer\'s left). Back: large full-colour photo panel (NYC street, yellow taxi) with caption line and small mark beneath. Neck: woven label.',
    method: 'DTG or simulated-process screen print (to confirm)', locations: ['Right chest', 'Left chest', 'Full back', 'Neck label'], colorways: ['White'], packaging: APPAREL_PACK,
    open: ['Photo print method (DTG vs. screen / sim-process) and print size', 'Image rights for the taxi photograph'] },
  { code: 'Cap1 OT-S3', handle: 'ouster-drop1-ls-yosemite', title: 'Long Sleeve "Yosemite"', type: 'Long Sleeve',
    summary: 'Bone long sleeve with a Yosemite landscape band across the back and "Sense in Color" down the sleeve.',
    blank: 'Bone / stone long-sleeve tee, rib cuffs', construction: 'Crew neck long-sleeve tee, rib cuffs',
    decoration: 'Front: REV8 mark and Ouster mark at chest. Back: wide landscape photo band (Yosemite valley with vehicle) across the upper back, caption + mark below. Left sleeve: "Sense in Color" in large mono type. Neck: woven label.',
    method: 'To confirm', locations: ['Chest', 'Upper back', 'Left sleeve', 'Neck label'], colorways: ['Bone'], packaging: APPAREL_PACK,
    open: ['Sleeve type colour (looks tonal grey) and print method'] },
  { code: 'Cap1 OC', from: 'ouster-cap-natural', handle: 'ouster-drop1-cap-tan', title: 'Cap — Tan', type: 'Cap',
    summary: 'Washed cotton dad cap with the white embroidered Ouster lockup.',
    blank: 'Unstructured 6-panel washed cotton dad cap, pre-curved visor, eyelets', construction: 'Unstructured 6-panel, pre-curved visor, self-fabric strap with brushed metal slide buckle',
    decoration: 'Front: white flat embroidery, stacked Ouster mark over OUSTER wordmark, centred. Back: small woven flag label on the strap. Inside: printed woven inner label (Kelvin label art).',
    method: 'Flat embroidery', locations: ['Front centre', 'Back strap', 'Inner label'], colorways: ['Tan'], packaging: 'Poly bag + tech sticker; small black box.',
    open: [] },
  { code: 'Cap1 OC-2', from: 'ouster-cap-olive', handle: 'ouster-drop1-cap-green', title: 'Cap — Green', type: 'Cap',
    summary: 'The same dad cap in olive.',
    blank: 'Unstructured 6-panel washed cotton dad cap, olive / military green', construction: 'Same as Cap — Tan',
    decoration: 'Same white front embroidery, strap, buckle and inner label as Cap — Tan.',
    method: 'Flat embroidery', locations: ['Front centre', 'Back strap', 'Inner label'], colorways: ['Olive'], packaging: 'Poly bag + tech sticker; small black box.',
    open: [] },
  { code: 'Cap1 OB', handle: 'ouster-drop1-beanie-green', title: 'Beanie — Green', type: 'Beanie',
    summary: 'Olive rib-knit cuffed beanie with the woven Ouster patch.',
    blank: 'Olive chunky rib-knit cuffed beanie', construction: 'Rib knit, cuffed',
    decoration: `Sewn woven patch on the cuff. ${LABEL}`,
    method: 'Woven patch, sewn', locations: ['Cuff'], colorways: ['Olive'], packaging: 'Small frosted zip bag + tech sticker ("Cap1 OB-1 · One-Size-Fits-All"); small black cardboard box.',
    open: ['Fix the product name spelling on the store page ("Beenie")'] },
  { code: 'Cap1 OW-B', from: 'ouster-wide-mouth-bottle', handle: 'ouster-drop1-water-bottle', title: 'Water Bottle', type: 'Drinkware',
    summary: 'Clear 1000 ml Nalgene with a colour point-cloud wrap print.',
    blank: 'Clear 1000 ml wide-mouth Nalgene, black loop cap, graduated markings', construction: 'Nalgene wide-mouth 1000 ml',
    decoration: 'Wrap print on the lower third: colour point-cloud scene (sensor on rock); small Ouster text at the side.',
    method: 'Wrap print (pad vs. wrap to confirm)', locations: ['Lower third wrap'], colorways: ['Clear'], packaging: `${HARD_PACK} Same box, different insert to fit multiple items.`,
    open: ['Nalgene co-branding approval and print method (pad vs. wrap)'] },
  { code: 'Cap1 OM', handle: 'ouster-drop1-multitool', title: 'Multitool', type: 'Multitool',
    summary: 'Leatherman ARC with the Ouster lockup engraved on the handle.',
    blank: 'Leatherman ARC (MagnaCut blade), bronze / olive handles', construction: 'Leatherman ARC',
    decoration: 'Laser-engraved Ouster lockup on the handle.',
    method: 'Laser engraving', locations: ['Handle'], colorways: ['Bronze / olive'], packaging: `${HARD_PACK} Multitool insert.`,
    open: ['Store page title still says "Cap"', 'Leatherman custom-engraving minimums and lead time'] },
  { code: '', from: 'point-cloud-print-framed', handle: 'ouster-drop1-point-cloud-artwork', title: 'Point Cloud Artwork', type: 'Art print',
    summary: 'Night aerial point cloud of Potrero Avenue, San Francisco, "Captured by REV8".',
    blank: 'Art print: framed (light oak frame, white mat) or unframed (rolled in a black tube with a spec label)', construction: 'Framed or rolled',
    decoration: 'Artwork: night aerial point cloud of Potrero Avenue, San Francisco ("Captured by REV8").',
    method: 'Fine-art print (to confirm)', locations: ['Print'], colorways: ['Framed', 'Unframed'], packaging: 'Black corrugated box with "FRAGILE" corners and printed belly band; "Ouster Merch Store" branded tape; tube for unframed.',
    open: ['Print size, paper and edition count', 'Framed vs. tube, or both as two SKUs'] },
  { code: '', handle: 'ouster-drop1-notebook', title: 'Notebook', type: 'Stationery',
    summary: 'Black hardcover dot-grid notebook.',
    blank: 'Black hardcover notebook, elastic closure, ribbon (Moleskine-style)', construction: 'Hardcover, elastic closure, ribbon marker',
    decoration: 'Cover: Ouster mark, "From thought to physical", page / paper spec line, corner crop marks.',
    method: 'To confirm (deboss or print)', locations: ['Cover'], colorways: ['Black'], packaging: 'Black cardboard mailer: Ouster Merch Store, "Spatial Coverage & Sensing Garments", "Sense. Think. Act. Learn." on the spine.',
    open: ['Brand of blank and page count'] },
  { code: '', handle: 'ouster-drop1-kaweco-pen', title: 'Kaweco Steel Pen', type: 'Stationery',
    summary: 'Kaweco Steel Sport ballpoint with the Ouster lockup etched on the barrel.',
    blank: 'Kaweco Steel Sport ballpoint, brushed steel, octagonal', construction: 'Kaweco Steel Sport',
    decoration: 'Laser-etched Ouster lockup on the barrel.',
    method: 'Laser etching', locations: ['Barrel'], colorways: ['Brushed steel'], packaging: '',
    open: ['Packaging to decide'] },
  { code: '', handle: 'ouster-drop1-pencil-pack', title: 'Pencil Pack', type: 'Stationery',
    summary: 'Six black graphite pencils, "From Thought to Physical".',
    blank: '6 × black HB graphite pencils, FSC certified cedar, natural-wood sharpened tips', construction: '6-pencil pack',
    decoration: 'Foil / print on each pencil: "From Thought to Physical" and the Ouster mark.',
    method: 'Foil or print (to confirm)', locations: ['Each pencil'], colorways: ['Black'], packaging: 'Black box with window tray: "From thought to physical. Grounding imagination in reality.", REV8, "6 × HB Graphite Pencils · FSC Certified Cedar wood".',
    open: [] },
  { code: '', handle: 'ouster-drop1-sticker-pack', title: 'Sticker Pack', type: 'Stickers',
    summary: 'Eight stickers in a branded sleeve.',
    blank: '8 stickers in a branded sleeve ("Model: Sticker Pack · Version 1 · Number of units 8", "Sense. Think. Act. Learn.")', construction: 'Sticker set + sleeve',
    decoration: 'Designs: compute unit line art, holographic plate, point-cloud photo, Ouster badge, "Ouster Inside" hexagon, quadcopter, WARNING lidar label, Ouster FC crest, oval sparkle badge.',
    method: 'Die-cut vinyl, one holographic (to confirm)', locations: ['Stickers', 'Sleeve'], colorways: [], packaging: 'Branded sleeve.',
    open: ['Final 8 designs (9 are shown in Figma)'] },
  { code: '', handle: 'ouster-drop1-impossible-puzzle', title: 'Impossible Puzzle', type: 'Puzzle',
    summary: '"Unprocessable Point Cloud Puzzle", age 21+, in a black box.',
    blank: 'Jigsaw puzzle in a black box with the Ouster mark', construction: 'Jigsaw puzzle + box',
    decoration: 'Scenes in Figma: SF rowhouses, Golden Gate Park aerial, park / garden aerial.',
    method: 'Printed puzzle', locations: ['Puzzle', 'Box'], colorways: ['SF rowhouses', 'Golden Gate Park', 'Park / garden'], packaging: 'Printed box.',
    open: ['Piece count, finished size and which scene(s) to produce'] },
  { code: '', handle: 'ouster-drop1-ocho-jersey', title: 'The Ocho: Ouster FC Jersey', type: 'Jersey',
    summary: 'Black pinstripe football jersey, #08 on the back.',
    blank: 'Black raglan football jersey with grey horizontal pinstripes', construction: 'Raglan football jersey',
    decoration: 'Front: REV8 (right chest), "THE OCHO" (centre), Ouster FC crest (left chest), large mark + asterisk graphic mid-chest. Sleeves: chevron / mark graphic on both. Back: "Ouster FC" at the neck, large serif "08", "Sense. Think. Act. Learn." at the hem.',
    method: 'Sublimated or printed (to confirm)', locations: ['Right chest', 'Centre chest', 'Left chest', 'Both sleeves', 'Back'], colorways: ['Black / grey pinstripe'], packaging: APPAREL_PACK,
    open: ['Sublimated vs. printed', 'Size run (One Size is not realistic for a jersey)'] }
];
export const SUPERSEDED = ['sensor-lineup-tee-natural', 'ouster-cap-black', 'ouster-desk-mat', 'omt-01-work-jacket'];
const APPAREL = new Set(['T-Shirt', 'Long Sleeve', 'Jersey']);

export const ACROSS = [
  'Pricing: every Figma product page shows $24.00 (or $00.00), the template value, and the store reads as a giveaway ("Field Supply", "Gear up. On Us.", "Reserve Gear", one item per person). Is Drop 1 free to employees, or sold, and at what prices?',
  'Blank suppliers, fabric weights, size runs and colour standards for every apparel item (Figma shows One Size, Military Green and USA on every page as template copy).',
  'Final front artwork for the black "Infrared" tee (4 options).',
  'Placeholder copy on every product page: description, colour, origin, Details / Materials.',
  'Quantities per style and the in-hand date.'
];

const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function describe(p) {
  return `<p>${html(p.summary)}</p>${p.code ? `<p>Style code ${html(p.code)} · Ouster Merch Drop 1</p>` : '<p>Ouster Merch Drop 1</p>'}`;
}
export function briefNotes(p) {
  return [`From the ${SOURCE}.`, p.code ? `Style code: ${p.code}.` : '', p.open.length ? `Open: ${p.open.join('; ')}.` : ''].filter(Boolean).join('\n');
}

export async function applyOusterDrop1(pool, { log = console } = {}) {
  const done = (await pool.query('select 1 from app_settings where key=$1', [OUSTER_DROP1_KEY])).rowCount;
  if (done) return { skipped: 'already applied' };
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))', [OUSTER_DROP1_KEY]);
    if ((await db.query('select 1 from app_settings where key=$1', [OUSTER_DROP1_KEY])).rowCount) { await db.query('rollback'); return { skipped: 'already applied' }; }
    const client = (await db.query(`select id from clients where slug='ouster'`)).rows[0];
    if (!client) { await db.query('rollback'); return { skipped: 'no Ouster room' }; }
    const project = (await db.query(`insert into projects(client_id,name,status,milestone) values($1,'Merch Drop 1','active','Brief')
      on conflict(client_id,name) do update set updated_at=now() returning id`, [client.id])).rows[0];
    const out = { mapped: [], added: [], archived: [] };
    for (const p of DROP1) {
      let row = p.from ? (await db.query('select id from products where client_id=$1 and shopify_handle=$2', [client.id, p.from])).rows[0] : null;
      if (row) {
        await db.query(`update products set title=$2,product_type=$3,description_html=$4,project_id=$5,updated_at=now() where id=$1`, [row.id, p.title, p.type, describe(p), project.id]);
        out.mapped.push(p.title);
      } else {
        row = (await db.query(`insert into products(client_id,project_id,shopify_handle,title,status,current_stage,owner,risk_level,product_type,description_html,source_of_truth)
          values($1,$2,$3,$4,'brief','brief','Future Basics','on-track',$5,$6,'hub')
          on conflict(client_id,shopify_handle) do update set title=excluded.title,project_id=excluded.project_id,product_type=excluded.product_type,description_html=excluded.description_html,updated_at=now() returning id`,
          [client.id, project.id, p.handle, p.title, p.type, describe(p)])).rows[0];
        await db.query(`insert into milestones(product_id,name,status,sort_order)
          select $1,m.name,case when m.n=1 then 'current' else 'upcoming' end,m.n from (values (1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery')) m(n,name)
          where not exists(select 1 from milestones x where x.product_id=$1)`, [row.id]);
        out.added.push(p.title);
      }
      // what is already written on a brief or configuration is kept: the doc fills only what is empty, and its notes are added below any there
      await db.query(`insert into product_briefs(product_id,objective,decoration,packaging,notes,status) values($1,$2,$3,$4,$5,'draft')
        on conflict(product_id) do update set objective=coalesce(nullif(product_briefs.objective,''),excluded.objective),decoration=coalesce(nullif(product_briefs.decoration,''),excluded.decoration),
          packaging=coalesce(nullif(product_briefs.packaging,''),excluded.packaging),notes=concat_ws(E'\\n\\n',nullif(product_briefs.notes,''),excluded.notes),updated_at=now()`,
        [row.id, `Ouster Merch Drop 1: ${p.summary}`, p.decoration, p.packaging || null, briefNotes(p)]);
      await db.query(`insert into product_configurations(product_id,blank_name,construction,decoration_method,decoration_locations,colorways,sizes,packaging,notes,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
        on conflict(product_id) do update set blank_name=coalesce(nullif(product_configurations.blank_name,''),excluded.blank_name),construction=coalesce(nullif(product_configurations.construction,''),excluded.construction),
          decoration_method=coalesce(nullif(product_configurations.decoration_method,''),excluded.decoration_method),
          decoration_locations=case when cardinality(product_configurations.decoration_locations)>0 then product_configurations.decoration_locations else excluded.decoration_locations end,
          colorways=case when cardinality(product_configurations.colorways)>0 then product_configurations.colorways else excluded.colorways end,
          packaging=coalesce(nullif(product_configurations.packaging,''),excluded.packaging),notes=concat_ws(E'\\n\\n',nullif(product_configurations.notes,''),excluded.notes),updated_at=now()`,
        [row.id, p.code ? `${p.code} · ${p.blank}` : p.blank, p.construction, p.method, p.locations, p.colorways, APPAREL.has(p.type) ? [] : ['One Size'], p.packaging || null, `${p.summary} Prices are not set yet.`]);
    }
    // the rest of Capsule 01: out of the room, in an archived project, nothing deleted
    const old = (await db.query('select id,title from products where client_id=$1 and shopify_handle=any($2)', [client.id, SUPERSEDED])).rows;
    if (old.length) {
      const arch = (await db.query(`insert into projects(client_id,name,status,milestone,archived_at,archive_previous_status) values($1,'Merch Capsule 01 (superseded)','archived','Superseded by Merch Drop 1',now(),'active')
        on conflict(client_id,name) do update set status='archived',archived_at=coalesce(projects.archived_at,now()),updated_at=now() returning id`, [client.id])).rows[0];
      await db.query('update products set project_id=$2,updated_at=now() where id=any($1::uuid[])', [old.map(o => o.id), arch.id]);
      out.archived = old.map(o => o.title);
    }
    const body = [`Merch Drop 1 is set up from the tech pack written from the Figma "Merch Presentation (Nov5)": ${DROP1.length} styles.`,
      'Questions for Ouster before we price and sample:', ...ACROSS.map((x, i) => `${i + 1}. ${x}`),
      'Each product\'s brief lists what is still open for that item.'].join('\n');
    await db.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,null,'admin',$3)`, [project.id, client.id, body]);
    await db.query(`insert into activities(client_id,type,summary,metadata) values($1,'project',$2,$3)`,
      [client.id, `Merch Drop 1 set up: ${out.added.length} styles added, ${out.mapped.length} carried over from Capsule 01, ${out.archived.length} Capsule 01 products archived`, JSON.stringify({ source: SOURCE, ...out })]);
    await db.query(`insert into app_settings(key,value) values($1,$2::jsonb)`, [OUSTER_DROP1_KEY, JSON.stringify({ at: new Date().toISOString(), ...out })]);
    await db.query('commit');
    log.info?.({ ...out }, 'Ouster Merch Drop 1 applied');
    return out;
  } catch (e) { await db.query('rollback').catch(() => {}); log.error?.({ err: e.message }, 'Ouster Merch Drop 1 not applied'); return { error: e.message }; }
  finally { db.release(); }
}

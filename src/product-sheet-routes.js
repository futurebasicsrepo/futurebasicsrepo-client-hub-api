// The product sheet (staff): one read of everything a product page needs about how it is made and priced, and the shortcuts that save retyping.
//
//   GET    /v1/admin/products/:id/sheet                       spec from the tech pack, "how it is made" lines (config or pack), tiers with margins,
//                                                              the factory, saved price ladders, and the past products most like this one
//   POST   /v1/admin/products/:id/configuration/from-tech-pack fill the configuration from the tech pack (keeps supplier, MOQ, lead time, status)
//   POST   /v1/admin/products/:id/copy-from                   { sourceId, config?, tiers?, replace? } a past product's configuration and/or tiers
//   POST   /v1/admin/products/:id/apply-ladder                { ladderId, replace? } a saved ladder's tiers onto this product
//   DELETE /v1/admin/products/:id/price-tiers/:tid
//   POST   /v1/admin/products/:id/studio                      the product's Design Lab concept (made the first time, from the tech pack) → { conceptId, studio }
//   GET    /v1/admin/price-ladders   POST { name, kind?, tiers } or { name, kind?, productId }   DELETE /v1/admin/price-ladders/:lid
//
// Tables: product_configurations and price_tiers (src/db.js), price_ladders (src/db.js).
import { specFromTechPack, configFromSpec, makeLines, tierView, tiersToCopy, rankPast, cleanLadder, kindOf, labCategoryOf, conceptSpecOf, productPictureOf } from './product-sheet.js';
import sharp from 'sharp';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function registerProductSheetRoutes(app, { pool, authenticate, adminOnly, hasRenderingSql = 'false has_rendering', renderingUrl = () => '', fetchImpl = globalThis.fetch }) {
  const pre = [authenticate, adminOnly];
  const bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const productOf = async id => (UUID.test(String(id || '')) ? (await pool.query('select id, client_id, title, product_type, updated_at from products where id=$1', [id])).rows[0] : null) || null;
  const packOf = async id => (await pool.query('select coalesce(published_data, data) d from tech_packs where product_id=$1', [id])).rows[0]?.d || null;
  const configOf = async id => (await pool.query('select * from product_configurations where product_id=$1', [id])).rows[0] || null;
  const tiersOf = async id => (await pool.query('select * from price_tiers where product_id=$1 order by min_quantity', [id])).rows;
  const log = (p, req, summary) => pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)', [p.client_id, p.id, UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null, 'configuration', summary]).catch(() => {});

  async function saveConfig(productId, c) {
    return (await pool.query(`insert into product_configurations(product_id,supplier_id,blank_name,material,construction,decoration_method,decoration_locations,artwork_width_in,artwork_height_in,colorways,sizes,variant_plan,packaging,fulfillment,moq,sample_required,lead_time_days,notes,status)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      on conflict(product_id) do update set supplier_id=excluded.supplier_id,blank_name=excluded.blank_name,material=excluded.material,construction=excluded.construction,decoration_method=excluded.decoration_method,
        decoration_locations=excluded.decoration_locations,artwork_width_in=excluded.artwork_width_in,artwork_height_in=excluded.artwork_height_in,colorways=excluded.colorways,sizes=excluded.sizes,variant_plan=excluded.variant_plan,
        packaging=excluded.packaging,fulfillment=excluded.fulfillment,moq=excluded.moq,sample_required=excluded.sample_required,lead_time_days=excluded.lead_time_days,notes=excluded.notes,status=excluded.status,updated_at=now() returning *`,
      [productId, c.supplierId || null, c.blankName || null, c.material || null, c.construction || null, c.decorationMethod || null, c.decorationLocations || [], c.artworkWidthIn ?? null, c.artworkHeightIn ?? null,
        c.colorways || [], c.sizes || [], JSON.stringify(c.variantPlan || []), c.packaging || null, c.fulfillment || null, c.moq ?? null, c.sampleRequired !== false, c.leadTimeDays ?? null, c.notes || null, c.status || 'draft'])).rows[0];
  }
  async function putTiers(productId, tiers, replace) {
    if (replace) await pool.query('delete from price_tiers where product_id=$1 and not exists (select 1 from quotes q where q.price_tier_id=price_tiers.id)', [productId]);
    for (const t of tiers) await pool.query(`insert into price_tiers(product_id,min_quantity,max_quantity,unit_cost_cents,wholesale_cents,srp_cents,setup_cents,freight_cents,lead_time_days,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      on conflict(product_id,min_quantity) do update set max_quantity=excluded.max_quantity,unit_cost_cents=excluded.unit_cost_cents,wholesale_cents=excluded.wholesale_cents,srp_cents=excluded.srp_cents,setup_cents=excluded.setup_cents,
        freight_cents=excluded.freight_cents,lead_time_days=excluded.lead_time_days,notes=excluded.notes,updated_at=now()`,
      [productId, t.minQuantity, t.maxQuantity || null, t.unitCostCents, t.wholesaleCents, t.srpCents || null, t.setupCents || 0, t.freightCents || 0, t.leadTimeDays || null, t.notes || null]);
    return tiers.length;
  }
  const configCopy = (src, mine) => ({ supplierId: src.supplier_id, blankName: src.blank_name, material: src.material, construction: src.construction, decorationMethod: src.decoration_method, decorationLocations: src.decoration_locations,
    artworkWidthIn: src.artwork_width_in, artworkHeightIn: src.artwork_height_in, colorways: mine?.colorways?.length ? mine.colorways : src.colorways, sizes: mine?.sizes?.length ? mine.sizes : src.sizes, variantPlan: [],
    packaging: src.packaging, fulfillment: src.fulfillment, moq: src.moq, sampleRequired: src.sample_required, leadTimeDays: src.lead_time_days, notes: mine?.notes || null, status: 'draft' });

  app.get('/v1/admin/products/:id/sheet', { preHandler: pre }, async (req, reply) => {
    const p = await productOf(req.params.id); if (!p) return bad(reply, 'Product not found', 404);
    const [pack, config, tiers] = await Promise.all([packOf(p.id), configOf(p.id), tiersOf(p.id)]), spec = pack ? specFromTechPack(pack) : null;
    const factory = config?.supplier_id ? (await pool.query('select id, name, country, lead_time_days from suppliers where id=$1', [config.supplier_id])).rows[0] || null : null;
    const ladders = (await pool.query('select id, name, kind, tiers, created_at from price_ladders order by lower(name)').catch(() => ({ rows: [] }))).rows.map(l => ({ id: l.id, name: l.name, kind: l.kind || '', tiers: tiersToCopy(l.tiers).map(tierView) }));
    // past products that have a configuration or tiers, across rooms, most alike first
    const pool2 = (await pool.query(`select p.id, p.client_id, p.title, p.product_type, p.updated_at, c.name client_name, p.shopify_image_url, ${hasRenderingSql},
        (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) config,
        coalesce((select jsonb_agg(to_jsonb(t) order by t.min_quantity) from price_tiers t where t.product_id=p.id), '[]'::jsonb) tiers
      from products p join clients c on c.id=p.client_id where p.id<>$1 and (exists (select 1 from price_tiers t where t.product_id=p.id) or exists (select 1 from product_configurations pc where pc.product_id=p.id))
      order by p.updated_at desc limit 400`, [p.id])).rows;
    const past = rankPast({ ...p, category: spec?.category || '' }, pool2).map(x => ({ id: x.id, title: x.title, client: x.client_name, image: x.shopify_image_url || (x.has_rendering ? renderingUrl(x.id) : ''), kind: kindOf(`${x.title} ${x.product_type || ''}`), score: x.score,
      config: x.config ? { blank: x.config.blank_name || '', material: x.config.material || '', decoration: x.config.decoration_method || '', moq: x.config.moq, leadTimeDays: x.config.lead_time_days } : null,
      tiers: (x.tiers || []).map(tierView) }));
    return { product: { id: p.id, title: p.title, kind: kindOf(`${p.title} ${p.product_type || ''} ${spec?.category || ''}`) }, spec, lines: makeLines(config, spec || {}), config, factory, tiers: tiers.map(tierView), ladders, past };
  });

  app.post('/v1/admin/products/:id/configuration/from-tech-pack', { preHandler: pre }, async (req, reply) => {
    const p = await productOf(req.params.id); if (!p) return bad(reply, 'Product not found', 404);
    const pack = await packOf(p.id); if (!pack) return bad(reply, 'This product has no tech pack yet', 409);
    const config = await saveConfig(p.id, configFromSpec(specFromTechPack(pack), (await configOf(p.id)) || {}));
    await log(p, req, 'Filled the production configuration from the tech pack');
    return { config };
  });

  app.post('/v1/admin/products/:id/copy-from', { preHandler: pre }, async (req, reply) => {
    const p = await productOf(req.params.id), src = await productOf(req.body?.sourceId); if (!p) return bad(reply, 'Product not found', 404); if (!src || src.id === p.id) return bad(reply, 'Pick another product to start from', 404);
    const wantConfig = req.body?.config !== false, wantTiers = req.body?.tiers !== false; let config = null, tiers = 0;
    if (wantConfig) { const from = await configOf(src.id); if (from) { const pack = await packOf(p.id), mine = pack ? specFromTechPack(pack) : null; config = await saveConfig(p.id, configCopy(from, mine)); } }
    if (wantTiers) tiers = await putTiers(p.id, tiersToCopy(await tiersOf(src.id)), req.body?.replace === true);
    if (!config && !tiers) return bad(reply, `${src.title} has nothing to copy`, 409);
    await log(p, req, `Started from ${src.title}: ${[config ? 'configuration' : '', tiers ? `${tiers} price tier${tiers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')}`);
    return { config, tiers: (await tiersOf(p.id)).map(tierView) };
  });

  app.post('/v1/admin/products/:id/apply-ladder', { preHandler: pre }, async (req, reply) => {
    const p = await productOf(req.params.id); if (!p) return bad(reply, 'Product not found', 404);
    const l = UUID.test(String(req.body?.ladderId || '')) ? (await pool.query('select * from price_ladders where id=$1', [req.body.ladderId])).rows[0] : null; if (!l) return bad(reply, 'Price ladder not found', 404);
    const n = await putTiers(p.id, tiersToCopy(l.tiers), req.body?.replace === true);
    await log(p, req, `Priced from the ladder "${l.name}" (${n} tier${n === 1 ? '' : 's'})`);
    return { tiers: (await tiersOf(p.id)).map(tierView) };
  });

  app.delete('/v1/admin/products/:id/price-tiers/:tid', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.tid || ''))) return bad(reply, 'Price tier not found', 404);
    if ((await pool.query('select 1 from quotes where price_tier_id=$1', [req.params.tid])).rowCount) return bad(reply, 'A quote was built from this tier, so it stays. Add a new tier instead.', 409);
    const r = await pool.query('delete from price_tiers where id=$1 and product_id=$2', [req.params.tid, req.params.id]); if (!r.rowCount) return bad(reply, 'Price tier not found', 404);
    return { ok: true };
  });

  app.get('/v1/admin/price-ladders', { preHandler: pre }, async () => ({ ladders: (await pool.query('select id, name, kind, tiers, created_at from price_ladders order by lower(name)')).rows.map(l => ({ id: l.id, name: l.name, kind: l.kind || '', tiers: tiersToCopy(l.tiers).map(tierView) })) }));
  app.post('/v1/admin/price-ladders', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}; let tiers = b.tiers;
    if (b.productId) { const p = await productOf(b.productId); if (!p) return bad(reply, 'Product not found', 404); tiers = await tiersOf(p.id); }
    const c = cleanLadder({ ...b, tiers }); if (c.error) return bad(reply, c.error);
    const row = (await pool.query('insert into price_ladders(name, kind, tiers, created_by) values($1,$2,$3,$4) on conflict (lower(name)) do update set kind=excluded.kind, tiers=excluded.tiers, updated_at=now() returning id, name',
      [c.value.name, c.value.kind, JSON.stringify(c.value.tiers), UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null])).rows[0];
    return reply.code(201).send({ ladder: { id: row.id, name: row.name, tiers: c.value.tiers.map(tierView) } });
  });
  // ---- Open in the Design Studio: every product can be edited there. A product made in the Lab opens its own concept; any other gets one, made
  // once from what the product already has (its tech pack words and first picture, else its store photo), linked to the product so what is
  // drawn in the Studio goes back to this product's tech pack ----
  const pictureFrom = async (pack, url) => {
    const d = productPictureOf(pack); if (d) return Buffer.from(d.split(',')[1], 'base64');
    if (!/^https:\/\//i.test(String(url || '')) || !fetchImpl) return null;
    try { const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) }); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; } catch { return null; }
  };
  app.post('/v1/admin/products/:id/studio', { preHandler: pre }, async (req, reply) => {
    const p = UUID.test(String(req.params.id || '')) ? (await pool.query('select id, client_id, title, product_type, shopify_image_url from products where id=$1', [req.params.id])).rows[0] : null;
    if (!p) return bad(reply, 'Product not found', 404);
    const had = (await pool.query('select id from lab_concepts where product_id=$1 order by updated_at desc limit 1', [p.id])).rows[0];
    if (had) return { conceptId: had.id, studio: `/lab/studio?concept=${had.id}`, created: false };
    const pack = await packOf(p.id), spec = specFromTechPack(pack);
    let image = null, thumb = null; const buf = await pictureFrom(pack, p.shopify_image_url);
    if (buf) try {
      image = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
      thumb = await sharp(image).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    } catch { image = thumb = null; }
    const actor = UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null;
    const r = (await pool.query(`insert into lab_concepts(name, category, role, spec, twist, created_by, client_id, status, product_id, image, thumb) values($1,$2,'core',$3,'',$4,$5,'tech_pack',$6,$7,$8) returning id`,
      [String(p.title || 'Product').slice(0, 120), labCategoryOf(p, spec), conceptSpecOf(p, spec), actor, p.client_id, p.id, image, thumb])).rows[0];
    log(p, req, 'Opened in the Design Studio');
    return reply.code(201).send({ conceptId: r.id, studio: `/lab/studio?concept=${r.id}`, created: true });
  });
  app.delete('/v1/admin/price-ladders/:lid', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(String(req.params.lid || ''))) return bad(reply, 'Price ladder not found', 404);
    const r = await pool.query('delete from price_ladders where id=$1', [req.params.lid]); return r.rowCount ? { ok: true } : bad(reply, 'Price ladder not found', 404);
  });
}

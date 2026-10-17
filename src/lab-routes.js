// Design Lab API (the Lab module on Team access: Danielle and Kyle, and anyone they tick it for).
//   GET  /v1/lab/overview                 the brand code, the watchlist with what each has given us, counts by category, what is connected, today's spend
//   PUT  /v1/lab/brand-code               save how Future Basics decides what is ours
//   POST /v1/lab/brands   PUT|DELETE /v1/lab/brands/:id       the watchlist
//   POST /v1/lab/brands/:id/scan          read one brand now (add ?wait=1 to wait for it)     POST /v1/lab/scan   every brand that is due
//   GET  /v1/lab/items                    the library: ?brand= &category= &status= &q= &sort=new|hot|price_asc|price_desc &limit= &offset=
//   POST /v1/lab/items {url}              add one piece from its address        PUT /v1/lab/items/:id {status,note,category}
//   GET  /v1/lab/scans                    what each scan did, and why it fell back to search when a site said no
import { providerReady, ask as realAsk } from './intel-llm.js';
import { CATEGORIES, CATEGORY_IDS, categoryLabel, cleanCategory, BRAND_ROLES, SEED_BRANDS, ITEM_STATUSES, DEFAULT_BRAND_CODE, cleanBrandCode, cleanBrand, heatLabel } from './lab.js';
import { scanBrand, scanDue, addByUrl, dailyCents } from './lab-scan.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function seedLab(pool) {
  if (Number((await pool.query('select count(*) n from lab_brands')).rows[0].n)) return 0;
  for (const b of SEED_BRANDS) await pool.query(`insert into lab_brands(name,site,role,note) values($1,$2,$3,$4) on conflict do nothing`, [b.name, b.site, b.role, b.note]);
  return SEED_BRANDS.length;
}

export function registerLabRoutes(app, d) {
  const { pool, authenticate, adminOnly, getSetting, setSetting, env = process.env, fetchImpl = fetch, askImpl = realAsk, crawlOpts, delayMs, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const running = new Set();
  const loadCode = async () => cleanBrandCode(await getSetting('labBrandCode').catch(() => null) || {});
  const deps = async req => ({ env, fetchImpl, askImpl, crawlOpts, delayMs, code: await loadCode(), by: req ? actorOf(req) : null, log });
  const brandShape = r => ({ id: r.id, name: r.name, site: r.site, role: r.role, roleLabel: BRAND_ROLES.find(x => x.id === r.role)?.label || r.role, note: r.note, enabled: r.enabled, lastScannedAt: r.last_scanned_at, lastScanNote: r.last_scan_note, items: Number(r.items || 0), newItems: Number(r.new_items || 0), scanning: running.has(r.id) });
  const itemShape = r => ({ id: r.id, brandId: r.brand_id, brand: r.brand_name || '', source: r.source, url: r.url, title: r.title, imageUrl: r.image_url, price: r.price_cents == null ? null : r.price_cents / 100, currency: r.currency, category: r.category, categoryLabel: categoryLabel(r.category),
    attrs: r.attrs || {}, sellthrough: r.sellthrough || null, heat: r.heat, heatLabel: heatLabel(r.heat), summary: r.summary, status: r.status, note: r.note, firstSeenAt: r.first_seen_at, lastSeenAt: r.last_seen_at, isNew: Date.now() - new Date(r.first_seen_at).getTime() < 7 * 86_400_000 });

  async function runScan(brand, req) {
    if (running.has(brand.id)) return { skipped: 'already scanning' };
    running.add(brand.id);
    try { return await scanBrand(pool, brand, await deps(req)); } finally { running.delete(brand.id); }
  }

  app.get('/v1/lab/overview', { preHandler: pre }, async () => {
    const [brands, cats, tot, spent] = await Promise.all([
      pool.query(`select b.*, (select count(*) from lab_items i where i.brand_id=b.id and i.status<>'hidden') items, (select count(*) from lab_items i where i.brand_id=b.id and i.status='new' and i.first_seen_at > now()-interval '7 days') new_items from lab_brands b order by case b.role when 'reference' then 0 when 'price' then 1 else 2 end, lower(b.name)`),
      pool.query(`select category, count(*)::int n from lab_items where status<>'hidden' group by 1`),
      pool.query(`select count(*) filter (where status<>'hidden')::int items, count(*) filter (where status='saved')::int saved, count(*) filter (where status='new' and first_seen_at > now()-interval '7 days')::int fresh from lab_items`),
      dailyCents(pool)
    ]);
    const counts = Object.fromEntries(cats.rows.map(r => [r.category, r.n]));
    return {
      brandCode: await loadCode(), defaults: DEFAULT_BRAND_CODE, brands: brands.rows.map(brandShape), roles: BRAND_ROLES,
      categories: CATEGORIES.map(c => ({ ...c, count: counts[c.id] || 0 })), totals: tot.rows[0],
      connected: { search: Boolean(env.BRAVE_API_KEY), ai: providerReady('anthropic', env) },
      spend: { todayCents: Math.round(spent * 100) / 100, budgetCents: Number(env.LAB_DAILY_CENTS ?? 200) }, scanning: [...running]
    };
  });

  app.put('/v1/lab/brand-code', { preHandler: pre }, async (req, reply) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return bad(reply, 'Send the brand code');
    const cur = await loadCode(), next = cleanBrandCode(req.body, cur);
    await setSetting('labBrandCode', next); return { brandCode: next };
  });

  app.post('/v1/lab/brands', { preHandler: pre }, async (req, reply) => {
    const b = cleanBrand(req.body); if (b.error) return bad(reply, b.error);
    if ((await pool.query('select 1 from lab_brands where lower(name)=lower($1)', [b.name])).rowCount) return bad(reply, `${b.name} is already on the list`, 409);
    const r = (await pool.query(`insert into lab_brands(name,site,role,note,enabled) values($1,$2,$3,$4,$5) returning *`, [b.name, b.site, b.role, b.note, b.enabled])).rows[0];
    return reply.code(201).send({ brand: brandShape(r) });
  });
  app.put('/v1/lab/brands/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const cur = (await pool.query('select * from lab_brands where id=$1', [req.params.id])).rows[0]; if (!cur) return bad(reply, 'Not found', 404);
    const b = cleanBrand({ name: cur.name, site: cur.site, role: cur.role, note: cur.note, enabled: cur.enabled, ...(req.body || {}) }); if (b.error) return bad(reply, b.error);
    if ((await pool.query('select 1 from lab_brands where lower(name)=lower($1) and id<>$2', [b.name, cur.id])).rowCount) return bad(reply, `${b.name} is already on the list`, 409);
    const r = (await pool.query(`update lab_brands set name=$2, site=$3, role=$4, note=$5, enabled=$6 where id=$1 returning *`, [cur.id, b.name, b.site, b.role, b.note, b.enabled])).rows[0];
    return { brand: brandShape(r) };
  });
  app.delete('/v1/lab/brands/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = await pool.query('delete from lab_brands where id=$1', [req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404); return { ok: true };
  });

  app.post('/v1/lab/brands/:id/scan', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const brand = (await pool.query('select * from lab_brands where id=$1', [req.params.id])).rows[0]; if (!brand) return bad(reply, 'Not found', 404);
    if (running.has(brand.id)) return bad(reply, `${brand.name} is being read right now`, 409);
    const job = runScan(brand, req);
    if (req.query?.wait === '1') { try { return { scan: await job }; } catch (e) { return bad(reply, e.message, 502); } }
    job.catch(e => log.warn?.({ err: e.message, brand: brand.name }, 'design lab scan failed'));
    return reply.code(202).send({ started: true, brand: brand.name });
  });
  app.post('/v1/lab/scan', { preHandler: pre }, async (req, reply) => {
    const brands = (await pool.query(`select * from lab_brands where enabled order by last_scanned_at nulls first, lower(name)`)).rows.filter(b => !running.has(b.id));
    if (!brands.length) return bad(reply, 'Nothing to read: every brand is switched off or being read', 409);
    (async () => { for (const b of brands) { try { await runScan(b, req); } catch (e) { log.warn?.({ err: e.message, brand: b.name }, 'design lab scan failed'); } } })();
    return reply.code(202).send({ started: true, brands: brands.length });
  });

  app.get('/v1/lab/items', { preHandler: pre }, async req => {
    const q = req.query || {}, where = [`i.status <> 'hidden'`], args = [];
    const add = (sql, v) => { args.push(v); where.push(sql.replace('?', `$${args.length}`)); };
    if (UUID.test(String(q.brand || ''))) add('i.brand_id = ?', q.brand);
    if (cleanCategory(q.category)) add('i.category = ?', q.category);
    if (q.status === 'hidden') where[0] = `i.status = 'hidden'`; else if (ITEM_STATUSES.includes(q.status)) add('i.status = ?', q.status);
    if (String(q.q || '').trim()) { args.push(`%${clip(q.q, 60).replace(/[%_\\]/g, '')}%`); where.push(`(i.title ilike $${args.length} or i.summary ilike $${args.length} or i.attrs::text ilike $${args.length})`); }
    const order = { hot: 'i.heat desc nulls last, i.first_seen_at desc', price_asc: 'i.price_cents asc nulls last', price_desc: 'i.price_cents desc nulls last', brand: 'lower(b.name), i.title' }[q.sort] || 'i.first_seen_at desc, i.title';
    const limit = Math.min(Math.max(Number(q.limit) || 60, 1), 200), offset = Math.max(Number(q.offset) || 0, 0);
    const rows = (await pool.query(`select i.*, b.name brand_name, count(*) over()::int total from lab_items i left join lab_brands b on b.id=i.brand_id where ${where.join(' and ')} order by ${order} limit ${limit} offset ${offset}`, args)).rows;
    return { items: rows.map(itemShape), total: rows[0]?.total ?? 0 };
  });
  app.post('/v1/lab/items', { preHandler: pre }, async (req, reply) => {
    const url = clip(req.body?.url, 600); if (!url) return bad(reply, 'Paste the address of the product page');
    const r = await addByUrl(pool, url, await deps(req)); if (r.error) return bad(reply, r.error);
    const row = (await pool.query(`select i.*, b.name brand_name from lab_items i left join lab_brands b on b.id=i.brand_id where i.id=$1`, [r.id])).rows[0];
    return reply.code(201).send({ item: itemShape(row) });
  });
  app.put('/v1/lab/items/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const b = req.body || {}, sets = [], args = [req.params.id];
    if (b.status !== undefined) { if (!ITEM_STATUSES.includes(b.status)) return bad(reply, 'Status must be new, saved or hidden'); args.push(b.status); sets.push(`status=$${args.length}`); }
    if (b.note !== undefined) { args.push(clip(b.note, 600)); sets.push(`note=$${args.length}`); }
    if (b.category !== undefined) { const c = cleanCategory(b.category); if (!c) return bad(reply, `Category must be one of ${CATEGORY_IDS.join(', ')}`); args.push(c); sets.push(`category=$${args.length}`); }
    if (!sets.length) return bad(reply, 'Nothing to change');
    const r = (await pool.query(`update lab_items set ${sets.join(',')} where id=$1 returning id`, args)).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const row = (await pool.query(`select i.*, b.name brand_name from lab_items i left join lab_brands b on b.id=i.brand_id where i.id=$1`, [r.id])).rows[0];
    return { item: itemShape(row) };
  });

  app.get('/v1/lab/scans', { preHandler: pre }, async req => {
    const rows = (await pool.query(`select s.*, b.name brand_name from lab_scans s left join lab_brands b on b.id=s.brand_id order by s.started_at desc limit $1`, [Math.min(Math.max(Number(req.query?.limit) || 30, 1), 100)])).rows;
    return { scans: rows.map(s => ({ id: Number(s.id), brand: s.brand_name || '', startedAt: s.started_at, finishedAt: s.finished_at, method: s.method, found: s.found, added: s.added, blocked: s.blocked, note: s.note, costCents: Number(s.cost_cents) })) };
  });
  return { scanDue: async (opts = {}) => scanDue(pool, await deps(null), opts) };
}

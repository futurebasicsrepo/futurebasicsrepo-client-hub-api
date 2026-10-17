// Design Lab API (the Lab module on Team access: Danielle and Kyle, and anyone they tick it for).
//   GET  /v1/lab/overview                 the brand code, the watchlist with what each has given us, counts by category, what is connected, today's spend
//   PUT  /v1/lab/brand-code               save how Future Basics decides what is ours
//   POST /v1/lab/brands   PUT|DELETE /v1/lab/brands/:id       the watchlist
//   POST /v1/lab/brands/:id/scan          read one brand now (add ?wait=1 to wait for it)     POST /v1/lab/scan   every brand that is due
//   GET  /v1/lab/items                    the library: ?brand= &category= &status= &q= &sort=new|hot|price_asc|price_desc &limit= &offset=
//   POST /v1/lab/items {url}              add one piece from its address        PUT /v1/lab/items/:id {status,note,category}
//   GET  /v1/lab/trends                   what the library says per category: prices, what is moving, colours, fabrics, shapes, and the price ladder
//   GET|POST /v1/lab/plans                line plans; POST /v1/lab/plans/generate asks the AI for an assortment from the library and the brand code
//   GET|PUT|DELETE /v1/lab/plans/:id      one plan with its lines, totals and warnings; POST|PUT|DELETE /v1/lab/plans/:id/lines[/:lineId]; GET /v1/lab/plans/:id/export.csv
//   GET  /v1/lab/scans                    what each scan did, and why it fell back to search when a site said no
import { providerReady, ask as realAsk } from './intel-llm.js';
import { CATEGORIES, CATEGORY_IDS, categoryLabel, cleanCategory, BRAND_ROLES, SEED_BRANDS, ITEM_STATUSES, DEFAULT_BRAND_CODE, cleanBrandCode, cleanBrand, heatLabel } from './lab.js';
import { createLabData } from './lab-data.js';
import { scanBrand, scanDue, addByUrl, dailyCents } from './lab-scan.js';
import { ROLES, cleanLine, lineWarnings, planSummary, generateLines, planCsv, marginOf, defaultCost } from './lab-plan.js';

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
  const { loadCode, library, trendsFor } = createLabData(pool, getSetting);
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
  // ---- trends and line plans ----
  const ladderMap = t => Object.fromEntries(t.categories.filter(c => c.ladder).map(c => [c.id, c.ladder]));
  const lineShape = (r, ladders, econ, anchor, refs = new Map()) => {
    const l = { id: r.id, planId: r.plan_id, category: r.category, categoryLabel: categoryLabel(r.category), role: r.role, name: r.name, brief: r.brief, twist: r.twist, rationale: r.rationale, priceCents: r.price_cents, costCents: r.cost_cents, qty: r.qty, status: r.status, sort: r.sort, refs: (r.refs || []).map(id => refs.get(id)).filter(Boolean) };
    const cost = l.costCents ?? defaultCost(l.priceCents, econ.costRatio);
    return { ...l, price: l.priceCents == null ? null : l.priceCents / 100, cost: cost == null ? null : cost / 100, costIsEstimate: l.costCents == null, marginPct: marginOf(l.priceCents, cost), warnings: lineWarnings(l, ladders[l.category], econ, anchor) };
  };
  const planShape = r => ({ id: r.id, name: r.name, season: r.season, brief: r.brief, summary: r.summary, status: r.status, costCents: Number(r.cost_cents), createdAt: r.created_at, updatedAt: r.updated_at, lines: Number(r.lines ?? 0) });
  async function loadPlan(id) {
    const code = await loadCode(), econ = code.economics, anchor = code.priceAnchor.name, trends = await trendsFor(180), ladders = ladderMap(trends);
    const plan = (await pool.query('select * from lab_plans where id=$1', [id])).rows[0]; if (!plan) return null;
    const rows = (await pool.query('select * from lab_plan_lines where plan_id=$1 order by sort, created_at', [id])).rows;
    const ids = [...new Set(rows.flatMap(r => r.refs || []))], refs = new Map();
    if (ids.length) for (const r of (await pool.query(`select i.id, i.title, i.url, i.image_url, b.name brand from lab_items i left join lab_brands b on b.id=i.brand_id where i.id = any($1::uuid[])`, [ids])).rows) refs.set(r.id, { id: r.id, title: r.title, url: r.url, imageUrl: r.image_url, brand: r.brand || '' });
    const cc = new Map((await pool.query(`select line_id, count(*)::int n, count(*) filter (where status in ('approved','tech_pack'))::int approved, (array_agg(product_id) filter (where product_id is not null))[1] product_id from lab_concepts where plan_id=$1 and line_id is not null group by line_id`, [id])).rows.map(r => [r.line_id, r]));
    const lines = rows.map(r => ({ ...lineShape(r, ladders, econ, anchor, refs), conceptCount: cc.get(r.id)?.n || 0, approvedConcepts: cc.get(r.id)?.approved || 0, productId: cc.get(r.id)?.product_id || null }));
    return { plan: planShape({ ...plan, lines: rows.length }), lines, summary: planSummary(lines.map(l => ({ ...l })), ladders, econ, anchor), ladders, economics: econ, anchor, roles: ROLES };
  }
  const touch = id => pool.query('update lab_plans set updated_at=now() where id=$1', [id]);

  app.get('/v1/lab/trends', { preHandler: pre }, async req => {
    const days = Math.min(Math.max(Number(req.query?.days) || 180, 7), 720), code = await loadCode();
    return { days, ...(await trendsFor(days)), economics: code.economics, anchor: code.priceAnchor.name };
  });
  app.get('/v1/lab/plans', { preHandler: pre }, async () => ({ plans: (await pool.query(`select p.*, (select count(*) from lab_plan_lines l where l.plan_id=p.id and l.status<>'dropped') lines from lab_plans p order by p.updated_at desc limit 100`)).rows.map(planShape) }));
  app.post('/v1/lab/plans', { preHandler: pre }, async (req, reply) => {
    const name = clip(req.body?.name, 100); if (!name) return bad(reply, 'Give the plan a name');
    const r = (await pool.query(`insert into lab_plans(name,season,brief,created_by) values($1,$2,$3,$4) returning *`, [name, clip(req.body?.season, 40), clip(req.body?.brief, 800), actorOf(req)])).rows[0];
    return reply.code(201).send(await loadPlan(r.id));
  });
  app.post('/v1/lab/plans/generate', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, name = clip(b.name, 100) || 'New line plan', cap = Number(env.LAB_DAILY_PLANS ?? 10);
    if (cap >= 0 && Number((await pool.query(`select count(*) n from lab_plans where cost_cents > 0 and created_at > now() - interval '24 hours'`)).rows[0].n) >= cap) return bad(reply, `The daily limit of ${cap} generated plans is reached. Raise LAB_DAILY_PLANS or build the plan by hand.`, 429);
    if (!providerReady('anthropic', env)) return bad(reply, 'Claude is not connected (the service needs ANTHROPIC_API_KEY)', 503);
    const trends = await trendsFor(180); if (!trends.total) return bad(reply, 'The library is empty. Read some brands first, then plan from what they make.', 409);
    const cats = Array.isArray(b.categories) ? b.categories.map(String).filter(c => CATEGORY_IDS.includes(c)) : [];
    let out; try { out = await generateLines({ trends, code: await loadCode(), brief: b.brief, season: b.season, size: Number(b.size) || 12, categories: cats, askImpl, env, fetchImpl }); } catch (e) { return bad(reply, e.message, 502); }
    if (!out.lines.length) return bad(reply, 'The assistant did not come back with a usable plan. Try again, or name fewer categories.', 502);
    const plan = (await pool.query(`insert into lab_plans(name,season,brief,summary,cost_cents,created_by) values($1,$2,$3,$4,$5,$6) returning id`, [name, clip(b.season, 40), clip(b.brief, 800), out.summary, Math.max(out.costCents, 0.001), actorOf(req)])).rows[0];
    let sort = 0; for (const l of out.lines) await pool.query(`insert into lab_plan_lines(plan_id,category,role,name,brief,twist,rationale,price_cents,cost_cents,qty,refs,sort) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [plan.id, l.category, l.role, l.name, l.brief, l.twist, l.rationale, l.priceCents, l.costCents, l.qty, l.refs, sort++]);
    return reply.code(201).send(await loadPlan(plan.id));
  });
  app.get('/v1/lab/plans/:id', { preHandler: pre }, async (req, reply) => { if (!needId(req, reply)) return; return (await loadPlan(req.params.id)) || bad(reply, 'Not found', 404); });
  app.put('/v1/lab/plans/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const cur = (await pool.query('select * from lab_plans where id=$1', [req.params.id])).rows[0]; if (!cur) return bad(reply, 'Not found', 404);
    const b = req.body || {}, name = b.name === undefined ? cur.name : clip(b.name, 100); if (!name) return bad(reply, 'Give the plan a name');
    if (b.status !== undefined && !['draft', 'approved'].includes(b.status)) return bad(reply, 'Status must be draft or approved');
    await pool.query(`update lab_plans set name=$2, season=$3, brief=$4, status=$5, updated_at=now() where id=$1`, [cur.id, name, b.season === undefined ? cur.season : clip(b.season, 40), b.brief === undefined ? cur.brief : clip(b.brief, 800), b.status ?? cur.status]);
    return loadPlan(cur.id);
  });
  app.delete('/v1/lab/plans/:id', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const r = await pool.query('delete from lab_plans where id=$1', [req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404); return { ok: true };
  });
  app.post('/v1/lab/plans/:id/lines', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const plan = (await pool.query('select id from lab_plans where id=$1', [req.params.id])).rows[0]; if (!plan) return bad(reply, 'Not found', 404);
    const l = cleanLine(req.body); if (l.error) return bad(reply, l.error);
    const next = Number((await pool.query('select coalesce(max(sort),-1)+1 n from lab_plan_lines where plan_id=$1', [plan.id])).rows[0].n);
    await pool.query(`insert into lab_plan_lines(plan_id,category,role,name,brief,twist,rationale,price_cents,cost_cents,qty,sort) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [plan.id, l.category, l.role, l.name, l.brief, l.twist, l.rationale, l.priceCents, l.costCents, l.qty, next]);
    await touch(plan.id); return reply.code(201).send(await loadPlan(plan.id));
  });
  app.put('/v1/lab/plans/:id/lines/:lineId', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply) || !UUID.test(req.params.lineId)) return bad(reply, 'Not found', 404);
    const r = (await pool.query('select * from lab_plan_lines where id=$1 and plan_id=$2', [req.params.lineId, req.params.id])).rows[0]; if (!r) return bad(reply, 'Not found', 404);
    const base = { category: r.category, role: r.role, name: r.name, brief: r.brief, twist: r.twist, rationale: r.rationale, priceCents: r.price_cents, costCents: r.cost_cents, qty: r.qty, refs: r.refs, status: r.status };
    const b = req.body || {};
    const l = cleanLine(b, base); if (l.error) return bad(reply, l.error);
    if (b.cost === null || b.cost === '') l.costCents = null; // back to the estimate
    await pool.query(`update lab_plan_lines set category=$3, role=$4, name=$5, brief=$6, twist=$7, rationale=$8, price_cents=$9, cost_cents=$10, qty=$11, status=$12 where id=$1 and plan_id=$2`, [r.id, r.plan_id, l.category, l.role, l.name, l.brief, l.twist, l.rationale, l.priceCents, l.costCents, l.qty, l.status]);
    await touch(r.plan_id); return loadPlan(r.plan_id);
  });
  app.delete('/v1/lab/plans/:id/lines/:lineId', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply) || !UUID.test(req.params.lineId)) return bad(reply, 'Not found', 404);
    const r = await pool.query('delete from lab_plan_lines where id=$1 and plan_id=$2', [req.params.lineId, req.params.id]); if (!r.rowCount) return bad(reply, 'Not found', 404);
    await touch(req.params.id); return loadPlan(req.params.id);
  });
  app.get('/v1/lab/plans/:id/export.csv', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const p = await loadPlan(req.params.id); if (!p) return bad(reply, 'Not found', 404);
    const lines = p.lines.map(l => ({ category: l.category, role: l.role, name: l.name, brief: l.brief, twist: l.twist, rationale: l.rationale, priceCents: l.priceCents, costCents: l.costCents, qty: l.qty, status: l.status }));
    return reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${(p.plan.name || 'line-plan').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'line-plan'}.csv"`).send(planCsv(p.plan, lines, p.economics));
  });

  return { scanDue: async (opts = {}) => scanDue(pool, await deps(null), opts) };
}

// Factories (staff): every factory with what it makes, its skills, where it is, and the work assigned to it (packs, files, production runs)
// with status indicators. A factory is a supplier; a factory met at a fair that is not a supplier yet is listed too, ready to add.
import { PRODUCT_TYPES, SKILLS, typeLabel, skillLabel, cleanProfile, geocode, packState, PACK_STATE, projectIndicator, runIndicator, factoryLight, LIGHT, pinsFor } from './factories.js';
import { listFactoryFiles } from './room-files.js';
import { readFileSync } from 'node:fs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARCHIVED = `(pr.archived_at is not null or pr.status in ('archive','archived'))`;
const world = (() => { try { return JSON.parse(readFileSync(new URL('./assets/world-map.json', import.meta.url), 'utf8')); } catch { return null; } })();

export function registerFactoryRoutes(app, d) {
  const { pool, authenticate, adminOnly, normalizeVerification, ensureFactoryPage, supplierForPartner } = d;
  const guard = { preHandler: [authenticate, adminOnly] };

  // The packs assigned to (or referred through) factories, with the project each sits in. supplierId null = every factory.
  async function packRows(supplierId) {
    return (await pool.query(`select s.supplier_id,s.id share_id,s.kind,s.referral,s.waived_at,s.created_at assigned_at,tp.id tp_id,tp.version,tp.verification,tp.locked_at,
        p.id product_id,p.title,c.id client_id,c.name client_name,pr.id project_id,pr.name project_name,pr.status project_status,pr.milestone project_milestone,pr.target_date project_target,
        q.updated_at quoted_at,
        (select count(*)::int from factory_messages m where m.share_id=s.id and m.author_role='factory' and m.staff_read_at is null) unread
      from tech_pack_shares s join tech_packs tp on tp.id=s.tech_pack_id join products p on p.id=tp.product_id join clients c on c.id=p.client_id
      left join projects pr on pr.id=p.project_id left join factory_quotes q on q.share_id=s.id
      where s.supplier_id is not null and ($1::uuid is null or s.supplier_id=$1) and (s.assigned or s.referral) and s.revoked_at is null and (s.expires_at is null or s.expires_at>now())
        and tp.published_at is not null and not exists(select 1 from projects pr where pr.id=p.project_id and ${ARCHIVED})
      order by s.created_at desc limit 3000`, [supplierId])).rows;
  }
  async function runRows(supplierId) {
    return (await pool.query(`select r.id,r.supplier_id,r.po_number,r.quantity,r.status,r.sample_status,r.eta_date,r.ex_factory_date,p.id product_id,p.title,c.name client_name
      from production_runs r join products p on p.id=r.product_id join clients c on c.id=p.client_id
      where r.supplier_id is not null and ($1::uuid is null or r.supplier_id=$1) order by r.created_at desc limit 3000`, [supplierId])).rows;
  }
  const packView = (r, now) => {
    const state = packState({ kind: r.kind, quotedAt: r.quoted_at, waivedAt: r.waived_at, lockedAt: r.locked_at, factorySigned: normalizeVerification(r.verification, r.version).factorySign });
    const [label, tone] = PACK_STATE[state];
    return { shareId: r.share_id, title: r.title, version: r.version, kind: r.kind, origin: r.referral ? 'referral' : 'assigned', client: r.client_name, clientId: r.client_id, productId: r.product_id, state, stateLabel: label, tone,
      assignedAt: r.assigned_at, quotedAt: r.quoted_at, unread: r.unread || 0, project: r.project_id ? { id: r.project_id, name: r.project_name, ...projectIndicator({ status: r.project_status, milestone: r.project_milestone, target_date: r.project_target }, now) } : null,
      href: `/tech-packs/${r.product_id}` };
  };
  const runView = (r, now) => ({ id: r.id, po: r.po_number || '', title: r.title, client: r.client_name, quantity: r.quantity, status: r.status, sampleStatus: r.sample_status, etaDate: r.eta_date ? String(r.eta_date).slice(0, 10) : null, exFactoryDate: r.ex_factory_date ? String(r.ex_factory_date).slice(0, 10) : null, ...runIndicator(r, now) });

  const profileOf = (s, p) => ({
    key: s ? s.id : `partner:${p.id}`, id: s?.id || null, partnerId: p?.id || null, name: s?.name || p.company,
    city: s?.city ?? p?.city ?? '', country: s?.country || '', website: s?.website || p?.website || '', email: s?.contact_email || p?.email || '', phone: s?.contact_phone || p?.phone || '',
    contactName: p?.contact_name || '', wechat: p?.wechat || '', makes: p?.makes || '', moqNote: p?.moq_note || '', rating: p?.rating ?? null, source: p?.source || '', leadTimeDays: s?.lead_time_days ?? null,
    productTypes: s?.product_types || [], skills: s?.skills || [], lat: s?.lat == null ? null : Number(s.lat), lng: s?.lng == null ? null : Number(s.lng), geoManual: Boolean(s?.geo_manual), notes: s?.notes || '', status: s?.status || 'prospect', isSupplier: Boolean(s)
  });

  async function listAll(now = new Date()) {
    const sups = (await pool.query(`select s.*,(select p.id from partners p where p.supplier_id=s.id order by p.created_at limit 1) partner_id from suppliers s order by lower(s.name) limit 1000`)).rows;
    const parts = (await pool.query(`select * from partners where kind='factory' order by created_at desc limit 1000`)).rows;
    const byPartner = new Map(parts.map(p => [p.id, p])), linked = new Set();
    const [packs, runs] = await Promise.all([packRows(null), runRows(null)]);
    const packsBy = new Map(), runsBy = new Map();
    for (const r of packs) { if (!packsBy.has(r.supplier_id)) packsBy.set(r.supplier_id, []); packsBy.get(r.supplier_id).push(packView(r, now)); }
    for (const r of runs) { if (!runsBy.has(r.supplier_id)) runsBy.set(r.supplier_id, []); runsBy.get(r.supplier_id).push(runView(r, now)); }
    const out = [];
    for (const s of sups) {
      const p = s.partner_id ? byPartner.get(s.partner_id) : null; if (p) linked.add(p.id);
      const f = profileOf(s, p), pk = packsBy.get(s.id) || [], rn = runsBy.get(s.id) || [];
      out.push(withCounts(f, pk, rn));
    }
    for (const p of parts) if (!linked.has(p.id) && !p.supplier_id) out.push(withCounts(profileOf(null, p), [], []));
    return out;
  }
  function withCounts(f, pk, rn) {
    const g = (f.lat == null && f.isSupplier) ? geocode(f.city, f.country) : null; // older suppliers get a pin from their place without being saved
    if (g) { f.lat = g.lat; f.lng = g.lng; f.pinFrom = g.from; } else if (f.lat != null) f.pinFrom = f.geoManual ? 'hand' : 'place';
    const activeRuns = rn.filter(r => !r.done);
    f.counts = {
      packs: pk.length, needsQuote: pk.filter(x => x.state === 'needs-quote').length, toReview: pk.filter(x => x.state === 'to-review').length, quoted: pk.filter(x => x.state === 'quoted').length, signed: pk.filter(x => x.state === 'signed').length,
      unread: pk.reduce((a, x) => a + x.unread, 0), runs: activeRuns.length, lateRuns: activeRuns.filter(r => r.late).length, lateProjects: new Set(pk.filter(x => x.project?.late).map(x => x.project.id)).size
    };
    f.needsAction = f.counts.needsQuote + f.counts.toReview + f.counts.unread;
    f.light = factoryLight({ needsAction: f.counts.unread, waiting: f.counts.needsQuote + f.counts.toReview, lateProjects: f.counts.lateProjects, lateRuns: f.counts.lateRuns, packs: f.counts.packs, runs: f.counts.runs });
    f.lightLabel = LIGHT[f.light];
    return f;
  }

  app.get('/v1/admin/factories', guard, async () => {
    const factories = await listAll();
    const countries = new Map(); for (const f of factories) if (f.country) countries.set(f.country, (countries.get(f.country) || 0) + 1);
    return {
      factories,
      pins: pinsFor(factories),
      unpinned: factories.filter(f => f.lat == null).length,
      vocab: { productTypes: PRODUCT_TYPES.map(g => ({ group: g.group, types: g.types.map(([key, label]) => ({ key, label })) })), skills: SKILLS.map(([key, label]) => ({ key, label })), lights: LIGHT },
      totals: { factories: factories.length, withWork: factories.filter(f => f.counts.packs || f.counts.runs).length, needAttention: factories.filter(f => f.light === 'late' || f.light === 'waiting').length, countries: countries.size }
    };
  });
  app.get('/v1/admin/factories/map', guard, async (_req, reply) => world ? { world } : reply.code(503).send({ error: 'The map is not available' }));

  // One factory with everything assigned to it.
  app.get('/v1/admin/factories/:id', guard, async (req, reply) => {
    const id = String(req.params.id);
    let s = null, p = null;
    if (id.startsWith('partner:')) { const pid = id.slice(8); if (!UUID.test(pid)) return reply.code(404).send({ error: 'Not found' }); p = (await pool.query('select * from partners where id=$1', [pid])).rows[0]; }
    else { if (!UUID.test(id)) return reply.code(404).send({ error: 'Not found' }); s = (await pool.query('select * from suppliers where id=$1', [id])).rows[0]; if (s) p = (await pool.query('select * from partners where supplier_id=$1 order by created_at limit 1', [s.id])).rows[0] || null; }
    if (!s && !p) return reply.code(404).send({ error: 'Factory not found' });
    const now = new Date();
    const [packs, runs] = s ? await Promise.all([packRows(s.id), runRows(s.id)]) : [[], []];
    const pv = packs.map(r => packView(r, now)), rv = runs.map(r => runView(r, now));
    const f = withCounts(profileOf(s, p), pv, rv);
    const files = s ? (await listFactoryFiles(pool, s.id)).map(x => ({ ...x, url: x.id.startsWith('rf:') ? `/v1/room-files/${encodeURIComponent(x.id)}/download` : `/v1/project-files/${x.id.slice(3)}/download` })) : [];
    // each project this factory works in, once, with its indicators
    const projects = []; for (const x of pv) if (x.project && !projects.find(y => y.id === x.project.id)) projects.push({ ...x.project, packs: pv.filter(z => z.project?.id === x.project.id).map(z => z.title) });
    let pageUrl = null; if (s) { try { pageUrl = (await ensureFactoryPage(s.id)).url; } catch { /* the link is made when it is first needed */ } }
    return { factory: f, packs: pv, runs: rv, files, projects, pageUrl };
  });

  // Edit what a factory makes, its skills and its place. A fair contact that is not a supplier yet becomes one first.
  app.patch('/v1/admin/factories/:id', guard, async (req, reply) => {
    const id = String(req.params.id);
    let s = null;
    if (id.startsWith('partner:')) {
      const pid = id.slice(8); if (!UUID.test(pid)) return reply.code(404).send({ error: 'Not found' });
      const p = (await pool.query('select * from partners where id=$1', [pid])).rows[0]; if (!p) return reply.code(404).send({ error: 'Factory not found' });
      s = (await pool.query('select * from suppliers where id=$1', [await supplierForPartner(p)])).rows[0];
    } else { if (!UUID.test(id)) return reply.code(404).send({ error: 'Not found' }); s = (await pool.query('select * from suppliers where id=$1', [id])).rows[0]; }
    if (!s) return reply.code(404).send({ error: 'Factory not found' });
    const c = cleanProfile(req.body || {}, { city: s.city, country: s.country, geoManual: s.geo_manual }); if (c.error) return reply.code(400).send({ error: c.error });
    const q = c.p, sets = [], vals = [s.id], col = { productTypes: 'product_types', skills: 'skills', city: 'city', country: 'country', website: 'website', leadTimeDays: 'lead_time_days', notes: 'notes', lat: 'lat', lng: 'lng', geoManual: 'geo_manual' };
    for (const [k, v] of Object.entries(q)) { vals.push(v); sets.push(`${col[k]}=$${vals.length}`); }
    if (sets.length) await pool.query(`update suppliers set ${sets.join(',')},updated_at=now() where id=$1`, vals);
    const row = (await pool.query('select * from suppliers where id=$1', [s.id])).rows[0];
    const p = (await pool.query('select * from partners where supplier_id=$1 order by created_at limit 1', [s.id])).rows[0] || null;
    return withCounts(profileOf(row, p), [], []);
  });
}

export { typeLabel, skillLabel };

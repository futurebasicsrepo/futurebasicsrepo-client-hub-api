// SW and site prototyping (staff): paste the address of a prospect's site, the platform reads and audits it, builds a new high-standard site for their trade,
// checks it against the standard, and publishes it (served at /p/<slug>, sandboxed) and onto the Builds showcase to share.
//   GET  /v1/admin/prototypes/meta          trades, whether Claude is connected, today's count
//   POST /v1/admin/prototypes/audit         read and audit a site, no build (what a rep does on a lead): { url }
//   GET  /v1/admin/prototypes               the list      POST /v1/admin/prototypes { url, industry?, company?, city?, notes? } starts a build
//   GET  /v1/admin/prototypes/:id           one, with progress    …/preview and …/download give the page itself
//   POST /v1/admin/prototypes/:id/rebuild | publish | unpublish | share         DELETE /v1/admin/prototypes/:id
//   GET  /p/:slug                           the published page for anyone with the link (no sign-in, never indexed)
import { randomBytes } from 'node:crypto';
import { crawlSite, auditSite, cleanSiteUrl } from './proto-crawl.js';
import { INDUSTRIES, industryByKey, detectIndustry } from './proto-industry.js';
import { buildBrief, buildPrototype, editPrototype, changeSummary, protoCostCents, protoAiReady, PROTO_MODEL } from './proto-build.js';
import { slugify } from './builds.js';
import { findLeads, SEARCH_TERMS, isLead } from './proto-leads.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001F]+/g, ' ').trim().slice(0, n);

// The ribbon on a published page, and what the page may do. The page is untrusted markup with scripts: it runs in its own opaque origin (CSP sandbox), cannot reach this
// service, cannot submit a form anywhere, and may load only pictures, fonts and its own inline code.
const CSP = "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";
const RIBBON = `<style>#fb-proto-ribbon{position:fixed;left:12px;bottom:12px;z-index:2147483647;font:600 11px/1 system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:#fff;background:rgba(20,20,22,.88);padding:8px 12px;border-radius:99px;box-shadow:0 4px 14px rgba(0,0,0,.25)}@media(max-width:720px){#fb-proto-ribbon{bottom:84px;font-size:10px;padding:7px 10px}}</style><a id="fb-proto-ribbon" href="https://thefuturebasics.com" target="_blank" rel="noopener noreferrer">Prototype · Future Basics</a>`;
export const withRibbon = html => /<\/body>/i.test(html) ? html.replace(/<\/body>/i, RIBBON + '</body>') : html + RIBBON;

export function registerProtoRoutes(app, d) {
  const { pool, authenticate, adminOnly, throttle = () => true, env = process.env, log = console, publicUrl = 'https://builds.thefuturebasics.com', client = null, crawl = crawlSite, build = buildPrototype, edit = null } = d;
  const pre = [authenticate, adminOnly], perDay = () => Math.max(1, Number(env.PROTOTYPES_PER_DAY || 25)), editsPerDay = () => Math.max(1, Number(env.PROTOTYPE_EDITS_PER_DAY || 80));
  const canEdit = () => Boolean(edit) || protoAiReady(env), BUSY = ['queued', 'reading', 'building', 'editing'];
  const urlOf = r => `${String(publicUrl).replace(/\/$/, '')}/p/${r.slug}`;

  const view = (r, full = false) => {
    const a = r.audit || null, q = r.qa || null, ind = r.industry ? industryByKey(r.industry) : null;
    return {
      id: r.id, slug: r.slug, url: r.url, host: r.host, company: r.company, industry: r.industry, industryLabel: ind ? ind.label : '', industryFrom: r.industry_from, city: r.city, notes: r.notes,
      status: r.status, step: r.step, steps: r.steps || [], error: r.error, note: r.note, model: r.model, costCents: Number(r.cost_cents || 0), tokens: { input: r.input_tokens, output: r.output_tokens },
      audit: a ? { score: a.score, grade: a.grade, quickTurn: a.quickTurn, top: a.top, ...(full ? { issues: a.issues, areas: a.areas } : {}) } : null,
      qa: q ? { pass: q.pass, score: q.score, sizeKB: q.sizeKB, failed: (q.failed || []).map(c => c.label), advisory: (q.advisory || []).length, illustrative: q.illustrative || [], usesTheirImages: q.usesTheirImages, ...(full ? { checks: q.checks } : {}) } : null,
      site: full && r.facts ? { title: r.facts.title, description: r.facts.description, phones: r.facts.phones, emails: r.facts.emails, address: r.facts.address, services: (r.facts.services || []).slice(0, 12), colors: r.facts.colors, pages: (r.facts.pages || []).length, generator: r.facts.generator } : undefined,
      buildId: r.build_id, contactId: r.contact_id, dealId: r.deal_id, published: Boolean(r.published_at), publishedAt: r.published_at, shareUrl: r.published_at ? urlOf(r) : '', hasHtml: Boolean(r.has_html ?? r.html),
      headVersion: r.head_version, liveVersion: r.live_version, pendingPublish: Boolean(r.published_at && r.head_version && r.live_version !== r.head_version), editError: r.status === 'ready' ? r.error : '',
      views: r.views, lastViewedAt: r.last_viewed_at, createdAt: r.created_at, updatedAt: r.updated_at
    };
  };
  const COLS = `id,slug,url,host,company,industry,industry_from,city,notes,status,step,steps,facts,audit,qa,model,input_tokens,output_tokens,cost_cents,note,error,build_id,contact_id,deal_id,views,last_viewed_at,created_at,updated_at,published_at,head_version,live_version,(html is not null) has_html`;
  const get = async id => (await pool.query(`select ${COLS} from prototypes where id=$1`, [id])).rows[0];

  // ---------- the pipeline: read → audit → brief → build → check, one at a time per slot, with progress on the row ----------
  const queue = []; let running = 0; const SLOTS = Math.max(1, Number(env.PROTOTYPE_CONCURRENCY || 2));
  const step = async (id, text, status = null) => pool.query(`update prototypes set step=$2, steps=steps || $3::jsonb, status=coalesce($4,status), updated_at=now() where id=$1`, [id, text, JSON.stringify([{ at: new Date().toISOString(), text }]), status]).catch(() => {});
  // Every build, change and restore is a saved version; the newest is the page on the row. Older ones past 40 are dropped unless they are live.
  async function addVersion(id, { html, qa, source, instruction = '', model = '', usage = { input: 0, output: 0 }, cost = 0, note = '', by = null, before = '' }) {
    const ch = changeSummary(before, html);
    const n = (await pool.query(`with p as (update prototypes set head_version=head_version+1, updated_at=now() where id=$1 returning head_version)
      insert into prototype_versions(prototype_id,n,source,instruction,html,qa,changes,model,input_tokens,output_tokens,cost_cents,note,created_by) select $1, head_version, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12 from p returning n`,
      [id, source, clip(instruction, 1200), html, JSON.stringify(qa || null), JSON.stringify(ch), model, usage.input || 0, usage.output || 0, cost, clip(note, 300), by])).rows[0].n;
    await pool.query(`delete from prototype_versions where prototype_id=$1 and n < $2 and n is distinct from (select live_version from prototypes where id=$1)`, [id, n - 39]).catch(() => {});
    return n;
  }
  // a change to the newest page: ask, check, and save it as a new version (or leave the page as it was and say why)
  async function runEdit(id, job) {
    const r = (await pool.query('select * from prototypes where id=$1', [id])).rows[0]; if (!r) return;
    try {
      await step(id, `Changing: ${clip(job.instruction, 90)}`, 'editing');
      const history = (await pool.query(`select n, instruction from prototype_versions where prototype_id=$1 and source='edit' order by n desc limit 6`, [id])).rows.reverse();
      const out = await (edit || editPrototype)(r.html, job.instruction, r.brief || {}, { env, client, history, onStep: t => step(id, t) });
      const cost = protoCostCents(out.usage, env);
      const n = await addVersion(id, { html: out.html, qa: out.qa, source: 'edit', instruction: job.instruction, model: out.model, usage: out.usage, cost, note: out.note, by: job.by, before: r.html });
      await pool.query(`update prototypes set html=$2, qa=$3::jsonb, status='ready', step='Ready', error='', note='', input_tokens=input_tokens+$4, output_tokens=output_tokens+$5, cost_cents=cost_cents+$6, steps=steps || $7::jsonb, updated_at=now() where id=$1`,
        [id, out.html, JSON.stringify(out.qa), out.usage.input, out.usage.output, cost, JSON.stringify([{ at: new Date().toISOString(), text: `Version ${n} is ready${out.qa.pass ? '' : ' (it does not pass the quality check)'}` }])]);
    } catch (e) {
      log.warn?.({ err: e.message, prototypeId: id }, 'prototype change failed');
      await pool.query(`update prototypes set status='ready', step='Ready', error=$2, steps=steps || $3::jsonb, updated_at=now() where id=$1`, [id, clip(e.message, 300), JSON.stringify([{ at: new Date().toISOString(), text: `Not changed: ${clip(e.message, 160)}` }])]).catch(() => {});
    }
  }
  async function run(id) {
    const r = (await pool.query('select * from prototypes where id=$1', [id])).rows[0]; if (!r) return;
    try {
      await step(id, `Reading ${r.host}`, 'reading');
      const facts = await crawl(r.url, d.crawlOpts || {}); const audit = auditSite(facts);
      await step(id, `Read ${facts.pages?.length || 1} page${(facts.pages?.length || 1) === 1 ? '' : 's'}: the site scores ${audit.score} out of 100`);
      const ind = detectIndustry(facts, r.industry_from === 'chosen' ? r.industry : '');
      await pool.query(`update prototypes set facts=$2::jsonb, audit=$3::jsonb, industry=$4, industry_from=$5 where id=$1`, [id, JSON.stringify({ ...facts, links: undefined, text: facts.text.slice(0, 3000), extraText: undefined }), JSON.stringify(audit), ind.key, ind.from]);
      await step(id, `This looks like ${industryByKey(ind.key).label.toLowerCase()}`, 'building');
      const brief = buildBrief(facts, audit, ind.key, { company: r.company, notes: r.notes, city: r.city });
      await pool.query('update prototypes set brief=$2::jsonb where id=$1', [id, JSON.stringify(brief)]);
      const out = await build(brief, { env, client, onStep: t => step(id, t) });
      const cost = protoCostCents(out.usage, env);
      await addVersion(id, { html: out.html, qa: out.qa, source: r.head_version ? 'rebuild' : 'build', model: out.model, usage: out.usage, cost, note: out.note, by: r.created_by, before: r.html });
      await pool.query(`update prototypes set html=$2, qa=$3::jsonb, model=$4, input_tokens=input_tokens+$5, output_tokens=output_tokens+$6, cost_cents=cost_cents+$7, note=$8, status='ready', step='Ready', steps=steps || $9::jsonb, error='', company=case when company='' then $10 else company end, updated_at=now() where id=$1`,
        [id, out.html, JSON.stringify(out.qa), out.model, out.usage.input, out.usage.output, cost, out.note || '', JSON.stringify([{ at: new Date().toISOString(), text: out.qa.pass ? `Ready: passes the quality check (${out.qa.score}%)` : 'Built, but it does not pass the quality check' }]), brief.name]);
      // a published prototype that was rebuilt keeps its address and its build
      const done = await get(id); if (done.published_at && done.build_id) await syncBuild(done).catch(() => {});
      if (done.contact_id) await note(done.contact_id, done.deal_id, `A new site prototype for ${brief.name} is built${out.qa.pass ? '' : ' (it does not pass the quality check yet)'}. Their current site scored ${audit.score}/100.`, r.created_by);
    } catch (e) {
      log.warn?.({ err: e.message, prototypeId: id }, 'prototype build failed');
      await pool.query(`update prototypes set status='failed', error=$2, step='Failed', steps=steps || $3::jsonb, updated_at=now() where id=$1`, [id, clip(e.message, 300), JSON.stringify([{ at: new Date().toISOString(), text: `Failed: ${clip(e.message, 200)}` }])]).catch(() => {});
    }
  }
  const pump = () => { while (running < SLOTS && queue.length) { const { id, job } = queue.shift(); running++; (job ? runEdit(id, job) : run(id)).finally(() => { running--; pump(); }); } };
  const enqueue = (id, job = null) => { queue.push({ id, job }); setImmediate(pump); };
  // a restart drops what was running: say so instead of showing it as working forever
  pool.query(`update prototypes set status='failed', error='Interrupted by a restart: build it again', step='Failed', updated_at=now() where status in ('queued','reading','building')`).catch(() => {});
  pool.query(`update prototypes set status='ready', error='A change was interrupted by a restart: ask for it again', step='Ready', updated_at=now() where status='editing'`).catch(() => {});

  const usedToday = async () => Number((await pool.query(`select count(*)::int n from prototypes where created_at > now() - interval '24 hours'`)).rows[0].n);
  const newSlug = () => randomBytes(9).toString('base64url').replace(/[-_]/g, 'x').toLowerCase();

  // ---------- the Builds showcase entry ----------
  async function syncBuild(r) {
    const ind = industryByKey(r.industry), name = `${r.company || r.host}: new site prototype`, brief = (await pool.query('select brief from prototypes where id=$1', [r.id])).rows[0].brief || {};
    const summary = `A rebuilt website for ${r.company || r.host}${r.city ? ` (${r.city})` : ''}, a ${ind.label.toLowerCase()} business. Built from ${r.host} to the Future Basics standard: mobile first, tap to call, local search ready, and motion that makes it feel alive. Items marked Sample are placeholders until the owner confirms them.`;
    const highlights = (brief.features || []).filter(f => !['reveal', 'magnetic', 'count-up'].includes(f.id)).slice(0, 5).map(f => ({ title: clip(f.title, 80), text: clip(f.text, 280) }));
    if (r.build_id) { await pool.query(`update builds set name=$2, summary=$3, highlights=$4::jsonb, live_url=$5, sector=$6, updated_at=now() where id=$1`, [r.build_id, clip(name, 80), summary, JSON.stringify(highlights), urlOf(r), clip(ind.label.split(' (')[0], 40)]); return r.build_id; }
    let slug = slugify(`proto ${r.company || r.host}`) || `proto-${r.slug}`; for (let i = 2; (await pool.query('select 1 from builds where slug=$1', [slug])).rowCount; i++) slug = `${slugify(`proto ${r.company || r.host}`).slice(0, 52)}-${i}`;
    const id = (await pool.query(`insert into builds(slug,name,tagline,sector,status,visibility,hosting,live_url,repo_url,stack,summary,highlights,sort_order,links,repo_path,auto_publish) values($1,$2,$3,$4,'concept','hidden','railway',$5,'',$6,$7,$8::jsonb,100,'[]'::jsonb,'',false) returning id`,
      [slug, clip(name, 80), clip(`A better site for ${r.company || r.host}`, 140), clip(ind.label.split(' (')[0], 40), urlOf(r), ['HTML', 'CSS', 'JavaScript', 'Claude'], summary, JSON.stringify(highlights)])).rows[0].id;
    await pool.query('update prototypes set build_id=$2 where id=$1', [r.id, id]); return id;
  }
  async function publish(r) {
    if (r.status !== 'ready' || !r.has_html) { const e = new Error('Build the prototype first'); e.code = 409; throw e; }
    if (r.qa && r.qa.pass === false) { const e = new Error(`It does not pass the quality check yet (${(r.qa.failed || []).map(c => c.label).slice(0, 3).join('; ')}). Rebuild it first.`); e.code = 409; throw e; }
    await pool.query('update prototypes set published_at=coalesce(published_at, now()), live_version=head_version, updated_at=now() where id=$1', [r.id]);
    const fresh = await get(r.id); await syncBuild(fresh); return get(r.id);
  }

  // ---------- staff API ----------
  app.get('/v1/admin/prototypes/meta', { preHandler: pre }, async () => ({ industries: INDUSTRIES.map(i => ({ key: i.key, label: i.label })), ai: protoAiReady(env), model: protoAiReady(env) ? PROTO_MODEL(env) : 'template', today: await usedToday(), perDay: perDay(), publicUrl, canEdit: canEdit(), editsPerDay: editsPerDay() }));
  app.post('/v1/admin/prototypes/audit', { preHandler: pre }, async (req, reply) => {
    if (!throttle(`protoaudit:${req.auth.sub}`, { limit: 60, windowMs: 3600_000 })) return reply.code(429).send({ error: 'That is a lot of audits this hour: try again in a while' });
    const c = cleanSiteUrl(req.body?.url); if (c.error) return reply.code(422).send({ error: c.error });
    try { const facts = await crawl(c.url, d.crawlOpts || {}), audit = auditSite(facts), ind = detectIndustry(facts); return { host: c.host, audit, industry: { key: ind.key, label: industryByKey(ind.key).label, confidence: ind.confidence }, site: { title: facts.title, phones: facts.phones, emails: facts.emails, services: facts.services.slice(0, 10), pages: facts.pages.length, generator: facts.generator } }; }
    catch (e) { return reply.code(502).send({ error: e.message }); }
  });
  app.get('/v1/admin/prototypes', { preHandler: pre }, async () => ({ prototypes: (await pool.query(`select ${COLS} from prototypes order by created_at desc limit 300`)).rows.map(r => view(r)) }));
  app.get('/v1/admin/prototypes/:id', { preHandler: pre }, async (req, reply) => { if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); return r ? { prototype: view(r, true) } : reply.code(404).send({ error: 'Not found' }); });
  app.post('/v1/admin/prototypes', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, c = cleanSiteUrl(b.url); if (c.error) return reply.code(422).send({ error: c.error });
    if (b.industry && !INDUSTRIES.some(i => i.key === b.industry)) return reply.code(422).send({ error: 'Pick one of the trades in the list' });
    if (!throttle(`protobuild:${req.auth.sub}`, { limit: 40, windowMs: 3600_000 })) return reply.code(429).send({ error: 'That is a lot of builds this hour: try again in a while' });
    const active = (await pool.query(`select id from prototypes where host=$1 and status in ('queued','reading','building','editing') limit 1`, [c.host])).rows[0]; if (active) return reply.code(409).send({ error: `${c.host} is already being built`, id: active.id });
    if ((await usedToday()) >= perDay()) return reply.code(429).send({ error: `The limit of ${perDay()} prototypes a day is reached. It resets as the day goes on.` });
    const contactId = UUID.test(String(b.contactId || '')) && (await pool.query('select 1 from sales_contacts where id=$1', [b.contactId])).rowCount ? b.contactId : null, dealId = UUID.test(String(b.dealId || '')) && (await pool.query('select 1 from sales_deals where id=$1', [b.dealId])).rowCount ? b.dealId : null;
    const row = (await pool.query(`insert into prototypes(slug,url,host,company,industry,industry_from,city,notes,created_by,step,steps,contact_id,deal_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'Queued',$10::jsonb,$11,$12) returning id`,
      [newSlug(), c.url, c.host, clip(b.company, 80), b.industry || '', b.industry ? 'chosen' : '', clip(b.city, 60), clip(b.notes, 600), req.auth.sub, JSON.stringify([{ at: new Date().toISOString(), text: 'Queued' }]), contactId, dealId])).rows[0];
    enqueue(row.id); return reply.code(202).send({ prototype: view(await get(row.id)) });
  });
  app.post('/v1/admin/prototypes/:id/rebuild', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    if (BUSY.includes(r.status)) return reply.code(409).send({ error: r.status === 'editing' ? 'A change is being made right now' : 'It is already being built' });
    const b = req.body || {}; if (b.industry && !INDUSTRIES.some(i => i.key === b.industry)) return reply.code(422).send({ error: 'Pick one of the trades in the list' });
    if ((await usedToday()) >= perDay() + 10) return reply.code(429).send({ error: `The daily limit is reached` });
    await pool.query(`update prototypes set html_prev=coalesce(html, html_prev), status='queued', step='Queued', steps='[]'::jsonb, error='', note='', industry=case when $2<>'' then $2 else industry end, industry_from=case when $2<>'' then 'chosen' else industry_from end, company=coalesce($3, company), city=coalesce($4, city), notes=coalesce($5, notes), updated_at=now() where id=$1`,
      [r.id, b.industry || '', 'company' in b ? clip(b.company, 80) : null, 'city' in b ? clip(b.city, 60) : null, 'notes' in b ? clip(b.notes, 600) : null]);
    enqueue(r.id); return reply.code(202).send({ prototype: view(await get(r.id)) });
  });
  app.get('/v1/admin/prototypes/:id/preview', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = (await pool.query('select html from prototypes where id=$1', [req.params.id])).rows[0]; if (!r?.html) return reply.code(404).send({ error: 'Nothing built yet' });
    return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(withRibbon(r.html));
  });
  app.get('/v1/admin/prototypes/:id/download', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = (await pool.query('select html, host from prototypes where id=$1', [req.params.id])).rows[0]; if (!r?.html) return reply.code(404).send({ error: 'Nothing built yet' });
    return reply.header('content-disposition', `attachment; filename="${r.host.replace(/[^a-z0-9.-]/g, '-')}-prototype.html"`).type('text/html; charset=utf-8').send(r.html);
  });
  app.post('/v1/admin/prototypes/:id/publish', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    try { const p = await publish(r); if (p.contact_id && !r.published_at) await note(p.contact_id, p.deal_id, `The prototype for ${p.company || p.host} is published: ${urlOf(p)}`, req.auth.sub); return { prototype: view(p) }; } catch (e) { return reply.code(e.code || 500).send({ error: e.message }); }
  });
  app.post('/v1/admin/prototypes/:id/unpublish', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    await pool.query('update prototypes set published_at=null, updated_at=now() where id=$1', [r.id]); if (r.build_id) await pool.query(`update builds set visibility='hidden', updated_at=now() where id=$1`, [r.build_id]);
    return { prototype: view(await get(r.id)) };
  });
  // ---------- the studio: ask for a change, see every version, go back, publish the one you want ----------
  const versionView = (v, r) => ({ n: v.n, source: v.source, instruction: v.instruction, note: v.note, model: v.model, costCents: Number(v.cost_cents || 0), changes: v.changes || null, createdAt: v.created_at, live: Boolean(r.published_at) && v.n === r.live_version, head: v.n === r.head_version,
    qa: v.qa ? { pass: v.qa.pass, score: v.qa.score, sizeKB: v.qa.sizeKB, failed: (v.qa.failed || []).map(c => c.label) } : null });
  app.get('/v1/admin/prototypes/:id/versions', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    const rows = (await pool.query(`select n,source,instruction,note,model,cost_cents,changes,created_at,qa from prototype_versions where prototype_id=$1 order by n desc`, [r.id])).rows;
    return { versions: rows.map(v => versionView(v, r)), canEdit: canEdit(), today: Number((await pool.query(`select count(*)::int n from prototype_versions where source='edit' and created_at > now() - interval '24 hours'`)).rows[0].n), perDay: editsPerDay() };
  });
  app.get('/v1/admin/prototypes/:id/versions/:n/preview', { preHandler: pre }, async (req, reply) => {
    const n = Number(req.params.n); if (!UUID.test(req.params.id) || !Number.isInteger(n)) return reply.code(404).send({ error: 'Not found' });
    const v = (await pool.query('select html from prototype_versions where prototype_id=$1 and n=$2', [req.params.id, n])).rows[0]; if (!v) return reply.code(404).send({ error: 'That version is not there any more' });
    return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(withRibbon(v.html));
  });
  app.post('/v1/admin/prototypes/:id/edit', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    const instruction = clip(req.body?.instruction, 1200); if (instruction.length < 4) return reply.code(422).send({ error: 'Say what should change: a sentence is enough' });
    if (!canEdit()) return reply.code(409).send({ error: 'Changing a page needs Claude connected (the service needs ANTHROPIC_API_KEY). You can still rebuild it or restore an earlier version.' });
    if (BUSY.includes(r.status)) return reply.code(409).send({ error: r.status === 'editing' ? 'A change is being made right now: wait for it to finish' : 'It is being built right now: wait for it to finish' });
    if (r.status !== 'ready' || !r.has_html) return reply.code(409).send({ error: 'Build the prototype first' });
    if (!throttle(`protoedit:${req.auth.sub}`, { limit: 40, windowMs: 3600_000 })) return reply.code(429).send({ error: 'That is a lot of changes this hour: try again in a while' });
    const used = Number((await pool.query(`select count(*)::int n from prototype_versions where source='edit' and created_at > now() - interval '24 hours'`)).rows[0].n);
    if (used >= editsPerDay()) return reply.code(429).send({ error: `The limit of ${editsPerDay()} changes a day is reached. It resets as the day goes on.` });
    await pool.query(`update prototypes set status='editing', step='Queued', error='', steps=steps || $2::jsonb, updated_at=now() where id=$1`, [r.id, JSON.stringify([{ at: new Date().toISOString(), text: `Change asked for: ${clip(instruction, 120)}` }])]);
    enqueue(r.id, { instruction, by: req.auth.sub }); return reply.code(202).send({ prototype: view(await get(r.id)) });
  });
  // Going back is a new version too (so nothing is ever lost and "undo the undo" works). It does not go live until it is published.
  app.post('/v1/admin/prototypes/:id/versions/:n/restore', { preHandler: pre }, async (req, reply) => {
    const n = Number(req.params.n); if (!UUID.test(req.params.id) || !Number.isInteger(n)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    if (BUSY.includes(r.status)) return reply.code(409).send({ error: 'Wait for the build or change in progress to finish' });
    const v = (await pool.query('select html, qa from prototype_versions where prototype_id=$1 and n=$2', [r.id, n])).rows[0]; if (!v) return reply.code(404).send({ error: 'That version is not there any more' });
    if (n === r.head_version) return reply.code(409).send({ error: 'That is already the current version' });
    const before = (await pool.query('select html from prototypes where id=$1', [r.id])).rows[0].html;
    const m = await addVersion(r.id, { html: v.html, qa: v.qa, source: 'restore', instruction: `Went back to version ${n}`, model: '', by: req.auth.sub, before });
    await pool.query(`update prototypes set html=$2, qa=$3::jsonb, status='ready', error='', updated_at=now() where id=$1`, [r.id, v.html, JSON.stringify(v.qa)]);
    return { prototype: view(await get(r.id)), version: m };
  });

  // Share: publish if needed, show the build to invited emails (the showcase emails them a sign-in code), or hand back the link.
  app.post('/v1/admin/prototypes/:id/share', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); let r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    try { r = await publish(r); } catch (e) { return reply.code(e.code || 500).send({ error: e.message }); }
    const emails = req.body?.emails; let invites = null;
    if (emails && String(Array.isArray(emails) ? emails.join('') : emails).trim()) {
      await pool.query(`update builds set visibility=case when visibility='hidden' then 'invite' else visibility end, updated_at=now() where id=$1`, [r.build_id]);
      const res = await app.inject({ method: 'POST', url: '/v1/admin/builds/invites', headers: { authorization: req.headers.authorization, ...(req.headers['cf-access-jwt-assertion'] ? { 'cf-access-jwt-assertion': req.headers['cf-access-jwt-assertion'] } : {}), 'content-type': 'application/json' }, payload: { emails, buildId: r.build_id, days: req.body?.days || 30, note: req.body?.note || '', send: req.body?.send !== false } });
      let j = {}; try { j = res.json(); } catch { /* the showcase answered with something else */ }
      if (res.statusCode >= 400) return reply.code(res.statusCode).send({ error: j.error || 'The invitation could not be sent' });
      invites = j;
    }
    if (invites && r.contact_id) {
      await note(r.contact_id, r.deal_id, `Shared the prototype with ${[].concat(emails).join(', ')}: ${urlOf(r)}`, req.auth.sub);
      if (r.deal_id) await pool.query(`update sales_deals set stage='contacted', updated_at=now() where id=$1 and stage='new'`, [r.deal_id]).catch(() => {});
    }
    return { prototype: view(await get(r.id)), invites, link: urlOf(r), buildId: r.build_id };
  });
  app.delete('/v1/admin/prototypes/:id', { preHandler: pre }, async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = await get(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    if (r.build_id) await pool.query(`update builds set status='archived', visibility='hidden', updated_at=now() where id=$1`, [r.build_id]);
    await pool.query('delete from prototypes where id=$1', [r.id]); return { ok: true };
  });

  // ---------- leads: search or paste, ranked worst site first; and into the CRM ----------
  const note = async (contactId, dealId, text, actor) => { if (!contactId) return; await pool.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,'note',$3,'{}'::jsonb,$4)`, [contactId, dealId || null, clip(text, 700), actor || null]).catch(() => {}); await pool.query('update sales_contacts set last_activity_at=now() where id=$1', [contactId]).catch(() => {}); if (dealId) await pool.query('update sales_deals set last_activity_at=now() where id=$1', [dealId]).catch(() => {}); };
  const knownHosts = async () => { const s = new Set(); for (const r of (await pool.query('select host from prototypes')).rows) s.add(r.host); for (const r of (await pool.query(`select website from sales_companies where website<>''`)).rows) { const c = cleanSiteUrl(r.website); if (c.host) s.add(c.host); } return s; };
  const searchesToday = async () => Number((await pool.query(`select count(*)::int n from prototype_searches where created_at > now() - interval '24 hours'`)).rows[0].n);
  const searchView = r => ({ id: r.id, trade: r.trade, place: r.place, mode: r.mode, status: r.status, step: r.step, queries: r.queries, results: r.results, skipped: r.skipped, error: r.error, createdAt: r.created_at, found: (r.results || []).length,
    scheduleId: r.schedule_id || null, seenAt: r.seen_at || null, quick: (r.results || []).filter(i => i.reachable && i.quickTurn && isLead(i)).length, leads: (r.results || []).filter(isLead).length });
  const searchCap = () => Math.max(1, Number(env.PROTOTYPE_SEARCHES_PER_DAY || 30));
  // What a saved search has already shown, so each run brings new sites only.
  const scheduleSeen = async (scheduleId, exceptId) => { const hosts = new Set(); for (const r of (await pool.query(`select results from prototype_searches where schedule_id=$1 and id<>$2 and status='done' order by created_at desc limit 8`, [scheduleId, exceptId])).rows) for (const i of r.results || []) if (i.host) hosts.add(i.host); return hosts; };
  // The search itself, in the background: ranked results onto the row, or the reason it failed.
  async function runLeadSearch(id, { trade, place, urls = null, mode = 'search', scheduleId = null }) {
    try {
      let exclude = new Set(); if (mode === 'search') { exclude = await knownHosts(); if (scheduleId) for (const h of await scheduleSeen(scheduleId, id)) exclude.add(h); }
      const out = await findLeads({ trade, place, urls, env, crawlOpts: d.crawlOpts || {}, exclude, onStep: t => pool.query('update prototype_searches set step=$2, updated_at=now() where id=$1', [id, t]).catch(() => {}) });
      await pool.query(`update prototype_searches set status='done', step='Done', queries=$2, results=$3::jsonb, skipped=$4::jsonb, updated_at=now() where id=$1`, [id, out.queries, JSON.stringify(out.items), JSON.stringify(out.skipped)]);
    } catch (e) { log.warn?.({ err: e.message }, 'lead search failed'); await pool.query(`update prototype_searches set status='failed', error=$2, step='Failed', updated_at=now() where id=$1`, [id, clip(e.message, 300)]).catch(() => {}); }
  }
  app.get('/v1/admin/prototypes/leads/meta', { preHandler: pre }, async () => ({ search: Boolean(env.BRAVE_API_KEY), trades: INDUSTRIES.filter(i => SEARCH_TERMS[i.key]).map(i => ({ key: i.key, label: i.label, terms: SEARCH_TERMS[i.key] })), today: await searchesToday(), perDay: Math.max(1, Number(env.PROTOTYPE_SEARCHES_PER_DAY || 30)) }));
  app.get('/v1/admin/prototypes/leads/searches', { preHandler: pre }, async () => ({ searches: (await pool.query('select * from prototype_searches order by created_at desc limit 15')).rows.map(searchView) }));
  app.get('/v1/admin/prototypes/leads/searches/:id', { preHandler: pre }, async (req, reply) => { if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' }); const r = (await pool.query('select * from prototype_searches where id=$1', [req.params.id])).rows[0]; if (!r) return reply.code(404).send({ error: 'Not found' }); if (r.schedule_id && !r.seen_at && r.status !== 'running') { r.seen_at = new Date(); await pool.query('update prototype_searches set seen_at=now() where id=$1', [r.id]).catch(() => {}); } return { search: searchView(r) }; });
  app.post('/v1/admin/prototypes/leads/search', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}; let urls = null, mode = 'search';
    if (b.urls !== undefined && b.urls !== null && String(Array.isArray(b.urls) ? b.urls.join('') : b.urls).trim()) {
      mode = 'list'; urls = (Array.isArray(b.urls) ? b.urls : String(b.urls).split(/[\s,;]+/)).map(x => String(x).trim()).filter(Boolean).slice(0, 25);
      const bad = urls.map(u => ({ u, c: cleanSiteUrl(u) })).find(x => x.c.error); if (bad) return reply.code(422).send({ error: `“${clip(bad.u, 60)}”: ${bad.c.error}` });
    } else {
      if (!INDUSTRIES.some(i => i.key === b.trade) || !SEARCH_TERMS[b.trade]) return reply.code(422).send({ error: 'Pick the trade to search for' });
      if (!clip(b.place, 60)) return reply.code(422).send({ error: 'Say where to look (a town, county or city and state)' });
      if (!env.BRAVE_API_KEY) return reply.code(409).send({ error: 'Web search is not connected (the service needs BRAVE_API_KEY). You can paste a list of addresses instead.' });
      if ((await searchesToday()) >= searchCap()) return reply.code(429).send({ error: 'The searches for today are used up. You can still paste a list of addresses.' });
    }
    if (!throttle(`protosearch:${req.auth.sub}`, { limit: 15, windowMs: 3600_000 })) return reply.code(429).send({ error: 'That is a lot of searches this hour: try again in a while' });
    const row = (await pool.query(`insert into prototype_searches(trade,place,mode,created_by,step) values($1,$2,$3,$4,'Starting') returning id`, [b.trade || '', clip(b.place, 60), mode, req.auth.sub])).rows[0];
    runLeadSearch(row.id, { trade: b.trade || 'trade', place: clip(b.place, 60), urls, mode });
    return reply.code(202).send({ search: searchView((await pool.query('select * from prototype_searches where id=$1', [row.id])).rows[0]) });
  });
  // ---------- saved searches that run by themselves ----------
  const DAY_MS = 86400_000, tradeLabel = k => (INDUSTRIES.find(i => i.key === k) || { label: k }).label.split(' (')[0];
  const scheduleView = async r => {
    const last = (await pool.query('select id,status,error,results,seen_at,created_at from prototype_searches where schedule_id=$1 order by created_at desc limit 1', [r.id])).rows[0] || null;
    return { id: r.id, trade: r.trade, tradeLabel: tradeLabel(r.trade), place: r.place, everyDays: r.every_days, enabled: r.enabled, lastRunAt: r.last_run_at, nextRunAt: r.enabled ? new Date((r.last_run_at ? new Date(r.last_run_at).getTime() : Date.now()) + (r.last_run_at ? r.every_days * DAY_MS : 0)).toISOString() : null,
      last: last && { id: last.id, status: last.status, error: last.error, found: (last.results || []).length, quick: (last.results || []).filter(i => i.reachable && i.quickTurn && isLead(i)).length, seen: Boolean(last.seen_at), at: last.created_at } };
  };
  const getSchedule = async id => UUID.test(String(id)) ? (await pool.query('select * from prototype_search_schedules where id=$1', [id])).rows[0] : null;
  // a search row for a saved search, started now (the caller decides whether to wait for it)
  async function beginScheduled(sch, by = null) {
    await pool.query('update prototype_search_schedules set last_run_at=now() where id=$1', [sch.id]);
    const row = (await pool.query(`insert into prototype_searches(trade,place,mode,created_by,schedule_id,step) values($1,$2,'search',$3,$4,'Starting') returning id`, [sch.trade, sch.place, by, sch.id])).rows[0];
    return { id: row.id, run: () => runLeadSearch(row.id, { trade: sch.trade, place: sch.place, mode: 'search', scheduleId: sch.id }) };
  }
  app.get('/v1/admin/prototypes/leads/schedules', { preHandler: pre }, async () => ({ schedules: await Promise.all((await pool.query('select * from prototype_search_schedules order by created_at')).rows.map(scheduleView)), search: Boolean(env.BRAVE_API_KEY) }));
  app.post('/v1/admin/prototypes/leads/schedules', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, place = clip(b.place, 60), every = b.everyDays === undefined ? 7 : Number(b.everyDays);
    if (!INDUSTRIES.some(i => i.key === b.trade) || !SEARCH_TERMS[b.trade]) return reply.code(422).send({ error: 'Pick the trade to search for' });
    if (!place) return reply.code(422).send({ error: 'Say where to look (a town, county or city and state)' });
    if (!Number.isInteger(every) || every < 1 || every > 30) return reply.code(422).send({ error: 'Choose how often: every 1 to 30 days' });
    if (!env.BRAVE_API_KEY) return reply.code(409).send({ error: 'Web search is not connected (the service needs BRAVE_API_KEY), so a saved search would never run.' });
    if (Number((await pool.query('select count(*)::int n from prototype_search_schedules')).rows[0].n) >= 10) return reply.code(409).send({ error: 'There are 10 saved searches already: remove one first' });
    if ((await pool.query('select 1 from prototype_search_schedules where trade=$1 and lower(place)=lower($2)', [b.trade, place])).rowCount) return reply.code(409).send({ error: 'That trade and place is already saved' });
    const r = (await pool.query('insert into prototype_search_schedules(trade,place,every_days,created_by) values($1,$2,$3,$4) returning *', [b.trade, place, every, req.auth.sub])).rows[0];
    return reply.code(201).send({ schedule: await scheduleView(r) });
  });
  app.patch('/v1/admin/prototypes/leads/schedules/:id', { preHandler: pre }, async (req, reply) => {
    const r = await getSchedule(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' }); const b = req.body || {};
    if ('everyDays' in b && !(Number.isInteger(Number(b.everyDays)) && Number(b.everyDays) >= 1 && Number(b.everyDays) <= 30)) return reply.code(422).send({ error: 'Choose how often: every 1 to 30 days' });
    await pool.query('update prototype_search_schedules set enabled=coalesce($2, enabled), every_days=coalesce($3, every_days) where id=$1', [r.id, 'enabled' in b ? Boolean(b.enabled) : null, 'everyDays' in b ? Number(b.everyDays) : null]);
    return { schedule: await scheduleView(await getSchedule(r.id)) };
  });
  app.delete('/v1/admin/prototypes/leads/schedules/:id', { preHandler: pre }, async (req, reply) => { const r = await getSchedule(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' }); await pool.query('delete from prototype_search_schedules where id=$1', [r.id]); return { ok: true }; });
  app.post('/v1/admin/prototypes/leads/schedules/:id/run', { preHandler: pre }, async (req, reply) => {
    const r = await getSchedule(req.params.id); if (!r) return reply.code(404).send({ error: 'Not found' });
    if (!env.BRAVE_API_KEY) return reply.code(409).send({ error: 'Web search is not connected (the service needs BRAVE_API_KEY)' });
    if ((await searchesToday()) >= searchCap()) return reply.code(429).send({ error: 'The searches for today are used up.' });
    if ((await pool.query(`select 1 from prototype_searches where schedule_id=$1 and status='running'`, [r.id])).rowCount) return reply.code(409).send({ error: 'This search is already running' });
    if (!throttle(`protosearch:${req.auth.sub}`, { limit: 15, windowMs: 3600_000 })) return reply.code(429).send({ error: 'That is a lot of searches this hour: try again in a while' });
    const s = await beginScheduled(r, req.auth.sub); s.run(); return reply.code(202).send({ search: searchView((await pool.query('select * from prototype_searches where id=$1', [s.id])).rows[0]) });
  });
  // The job: saved searches that are due, a few at a time, keeping some of the day's searches free for people.
  async function runSchedules() {
    if (!env.BRAVE_API_KEY) return 0;
    const due = (await pool.query(`select * from prototype_search_schedules where enabled and (last_run_at is null or last_run_at < now() - make_interval(days => every_days)) order by last_run_at nulls first limit 3`)).rows, reserve = Math.min(5, Math.floor(searchCap() / 4)); let n = 0;
    for (const sch of due) { if ((await searchesToday()) >= searchCap() - reserve) break; const s = await beginScheduled(sch); await s.run(); n++; }
    return n;
  }

  // A lead into the CRM: the company, a contact (named for the business until someone learns the owner's name), a deal in New, and what is wrong with their site on the timeline.
  app.post('/v1/admin/prototypes/leads/add', { preHandler: pre }, async (req, reply) => {
    const b = req.body || {}, c = cleanSiteUrl(b.url || b.host); if (c.error) return reply.code(422).send({ error: c.error });
    const name = clip(b.company, 100) || c.host, trade = INDUSTRIES.some(i => i.key === b.trade) ? b.trade : 'trade', email = clip(b.email, 200).toLowerCase(), phone = clip(b.phone, 40);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply.code(422).send({ error: 'That email does not look right' });
    let co = (await pool.query(`select id from sales_companies where lower(name)=lower($1) or lower(website) like $2 limit 1`, [name, `%${c.host}%`])).rows[0];
    if (!co) co = (await pool.query(`insert into sales_companies(name, website, notes) values($1,$2,$3) returning id`, [name, c.url, clip(`${industryByKey(trade).label}${b.city ? ' · ' + b.city : ''}`, 300)])).rows[0];
    let contact = email ? (await pool.query('select id from sales_contacts where lower(email)=$1', [email])).rows[0] : null;
    if (!contact) contact = (await pool.query(`select id from sales_contacts where company_id=$1 and source='site-prototype' limit 1`, [co.id])).rows[0];
    let created = false;
    if (!contact) { contact = (await pool.query(`insert into sales_contacts(name,email,phone,title,company_id,source,tags,notes) values($1,$2,$3,'Owner (name not known yet)',$4,'site-prototype',$5,$6) returning id`, [name, email || null, phone, co.id, ['site-prototype', trade], clip(`Found a tired website: ${c.url}`, 400)])).rows[0]; created = true; }
    const title = `Website rebuild: ${name}`; let deal = (await pool.query(`select id from sales_deals where contact_id=$1 and title=$2 and stage not in ('won','lost') limit 1`, [contact.id, title])).rows[0], madeDeal = false;
    if (!deal) { deal = (await pool.query(`insert into sales_deals(contact_id, company_id, title, stage, source) values($1,$2,$3,'new','site-prototype') returning id`, [contact.id, co.id, title])).rows[0]; madeDeal = true; }
    if (created || madeDeal) await note(contact.id, deal.id, `Found by site prospecting: ${c.url} scores ${b.score ?? '?'}/100.${Array.isArray(b.problems) && b.problems.length ? ' ' + b.problems.slice(0, 4).map(x => clip(x, 120)).join(' ') : ''}`, req.auth.sub);
    return reply.code(created || madeDeal ? 201 : 200).send({ contactId: contact.id, dealId: deal.id, companyId: co.id, created, madeDeal });
  });

  // ---------- the published page ----------
  const serve = async (req, reply) => {
    const slug = String(req.params.slug || '').toLowerCase(); if (!/^[a-z0-9]{6,40}$/.test(slug)) return reply.code(404).type('text/plain').send('Not found');
    const r = (await pool.query('select p.id, coalesce(v.html, p.html) html, p.published_at from prototypes p left join prototype_versions v on v.prototype_id=p.id and v.n=p.live_version where p.slug=$1', [slug])).rows[0];
    if (!r || !r.published_at || !r.html) return reply.code(404).type('text/plain').send('This prototype is not available');
    pool.query('update prototypes set views=views+1, last_viewed_at=now() where id=$1', [r.id]).catch(() => {});
    return reply.header('content-security-policy', CSP).header('x-robots-tag', 'noindex, nofollow, noarchive').header('referrer-policy', 'no-referrer').header('x-content-type-options', 'nosniff').header('cache-control', 'no-store').type('text/html; charset=utf-8').send(withRibbon(r.html));
  };
  app.get('/p/:slug', serve); app.get('/p/:slug/', serve);
  return { run, enqueue, view, runSchedules };
}

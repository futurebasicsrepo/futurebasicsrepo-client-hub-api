// Sample reviews, filled in by the room's team and by Future Basics (src/sample-form.js has the form itself):
//   GET  /v1/products/:id/sample-reviews        the pack the samples are made to (the published version a client sees; staff fall back to the draft),
//                                               its samples, and the reviews so far
//   POST /v1/products/:id/sample-reviews        {stage} start the review of a sample, or open the one already going for that stage
//   GET  /v1/sample-reviews/:id                 one review: its form, the pack version it was made from, and where it stands
//   PUT  /v1/sample-reviews/:id                 {form, rev} save. rev is the save it started from: if a teammate saved since, the answer is 409 with
//                                               theirs, and the page puts its own changes on top and saves again (nobody's typing is lost)
//   POST /v1/sample-reviews/:id/handover        the review goes into the pack's draft as that sample's review; Future Basics is told
//   POST /v1/sample-reviews/:id/reopen          back to open, until it has been applied
//   POST /v1/sample-reviews/:id/apply           staff: the review written into the draft (measurements, corrections, pins as callouts, the next
//                                               sample asked for). Publishing it is the usual Publish on the tech pack.
// A client reaches only their own room's products; a client preview is read-only (authenticate refuses its writes).
import './sample-review.js';
import './sample-form.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const F = globalThis.FBSampleForm;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// What the form needs from a pack, and nothing else: no costs, suppliers or prices, so a client sees what they would on the published pack
export function formPack(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    style: { styleName: d.style?.styleName || '', styleNumber: d.style?.styleNumber || '', season: d.style?.season || '', sampleSize: d.style?.sampleSize || '' },
    sizes: d.sizes || [],
    sketches: (d.sketches || []).map(s => ({ id: s.id, view: s.view, label: s.label, image: s.image || '', callouts: (s.callouts || []).map(c => ({ n: c.n, label: c.label, spec: c.spec, note: c.note, x: c.x, y: c.y })) })),
    pom: (d.pom || []).map(r => ({ code: r.code, name: r.name, how: r.how, tolerance: r.tolerance, values: r.values })),
    bom: (d.bom || []).map(r => ({ component: r.component, material: r.material, color: r.color, placement: r.placement, spec: r.spec })),
    colorways: (d.colorways || []).map(r => ({ name: r.name, code: r.code, swatch: r.swatch, notes: r.notes })),
    construction: d.construction || [],
    artwork: (d.artwork || []).map(a => ({ name: a.name, note: a.note, pantones: a.pantones || [], placements: a.placements || [] })),
    labels: d.labels || [],
    sampling: (d.sampling || []).map(r => ({ stage: r.stage, qty: r.qty, due: r.due, status: r.status }))
  };
}

export function registerSampleFormRoutes(app, d) {
  const { pool, authenticate, normalizeTechPack, notifyStaff = async () => {}, emailEscape = s => String(s), hubButton = () => '', workHubUrl = '', log = console } = d;
  const bad = (reply, error, code = 422, extra = {}) => reply.code(code).send({ error, ...extra });
  const admin = req => req.auth?.role === 'admin';
  const nameOf = async req => (await pool.query('select name, email from users where id=$1', [req.auth.sub])).rows[0] || { name: '', email: req.auth.email || '' };
  const who = u => clip(u.name || String(u.email || '').split('@')[0], 80);
  const uid = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);

  // the product, if this person may reach it, with its pack
  async function productOf(req, reply, id) {
    if (!UUID.test(String(id || ''))) { bad(reply, 'Product not found', 404); return null; }
    const row = (await pool.query(`select p.id, p.client_id, p.title, p.project_id, c.name client_name, tp.id tech_pack_id, tp.version, tp.published_at, tp.published_data, tp.data
      from products p join clients c on c.id=p.client_id left join tech_packs tp on tp.product_id=p.id where p.id=$1`, [id])).rows[0];
    if (!row || (!admin(req) && row.client_id !== req.auth.clientId)) { bad(reply, 'Product not found', 404); return null; }
    return row;
  }
  // the pack a review is checked against: the version it was started on (kept in tech_pack_versions), else the live published one, else (staff) the draft
  async function reviewedPack(row, version) {
    if (version > 0) {
      const v = (await pool.query('select data from tech_pack_versions where tech_pack_id=$1 and version=$2', [row.tech_pack_id, version])).rows[0];
      if (v) return normalizeTechPack(v.data);
      if (row.version === version && row.published_data) return normalizeTechPack(row.published_data);
    }
    return row.published_at && row.published_data ? normalizeTechPack(row.published_data) : normalizeTechPack(row.data);
  }
  const view = (r, pack) => ({
    id: r.id, stage: r.stage, status: r.status, rev: r.rev, packVersion: r.pack_version, form: r.form, summary: F.summary(pack, r.form),
    updatedAt: r.updated_at, updatedBy: r.updated_by_name, handedOverAt: r.handed_over_at, appliedAt: r.applied_at, appliedVersion: r.applied_version
  });
  async function loadReview(req, reply) {
    if (!UUID.test(String(req.params.id || ''))) { bad(reply, 'Review not found', 404); return null; }
    const r = (await pool.query('select * from sample_reviews where id=$1', [req.params.id])).rows[0];
    if (!r || (!admin(req) && r.client_id !== req.auth.clientId)) { bad(reply, 'Review not found', 404); return null; }
    const row = await productOf(req, reply, r.product_id); if (!row) return null;
    return { r, row, pack: await reviewedPack(row, r.pack_version) };
  }
  const note = (row, req, summary, meta = {}) => pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'sample-review',$4,$5)`, [row.client_id, row.id, uid(req), clip(summary, 400), meta]).catch(() => {});

  app.get('/v1/products/:id/sample-reviews', { preHandler: authenticate }, async (req, reply) => {
    const row = await productOf(req, reply, req.params.id); if (!row) return reply;
    if (!row.tech_pack_id || (!row.published_at && !admin(req))) return bad(reply, 'This product has no published tech pack yet. A sample is reviewed against the pack it was made to.', 404, { code: 'NO_PACK' });
    const pack = await reviewedPack(row, row.published_at ? row.version : 0);
    const reviews = (await pool.query('select * from sample_reviews where product_id=$1 order by created_at desc', [row.id])).rows;
    const packs = new Map([[row.published_at ? row.version : 0, pack]]);
    for (const r of reviews) if (!packs.has(r.pack_version)) packs.set(r.pack_version, await reviewedPack(row, r.pack_version));
    return {
      product: { id: row.id, title: row.title, room: row.client_name }, version: row.published_at ? row.version : 0, draftOnly: !row.published_at,
      pack: formPack(pack), sampling: (pack.sampling || []).map(s => ({ stage: s.stage, status: s.status, due: s.due, qty: s.qty })),
      reviews: reviews.map(r => { const v = view(r, packs.get(r.pack_version)); delete v.form; return v; }), role: admin(req) ? 'admin' : 'client'
    };
  });

  app.post('/v1/products/:id/sample-reviews', { preHandler: authenticate }, async (req, reply) => {
    const row = await productOf(req, reply, req.params.id); if (!row) return reply;
    if (!row.tech_pack_id || (!row.published_at && !admin(req))) return bad(reply, 'This product has no published tech pack yet', 404, { code: 'NO_PACK' });
    const stage = clip(req.body?.stage, 60); if (!stage) return bad(reply, 'Say which sample this is (Proto, Fit, Pre-production…)');
    const live = (await pool.query(`select * from sample_reviews where tech_pack_id=$1 and stage=$2 and status<>'applied'`, [row.tech_pack_id, stage])).rows[0];
    if (live) return { review: view(live, await reviewedPack(row, live.pack_version)), pack: formPack(await reviewedPack(row, live.pack_version)), existing: true };
    const version = row.published_at ? row.version : 0, pack = await reviewedPack(row, version), u = await nameOf(req);
    const form = F.normalize({ at: new Date().toISOString().slice(0, 10), reviewers: who(u), sampleSize: globalThis.FBSample.sampleSizeOf(pack) }, pack);
    let r;
    try { r = (await pool.query(`insert into sample_reviews(client_id,product_id,tech_pack_id,stage,pack_version,form,created_by,updated_by,updated_by_name) values($1,$2,$3,$4,$5,$6,$7,$7,$8) returning *`, [row.client_id, row.id, row.tech_pack_id, stage, version, form, uid(req), who(u)])).rows[0]; }
    catch (e) { if (e.code !== '23505') throw e; r = (await pool.query(`select * from sample_reviews where tech_pack_id=$1 and stage=$2 and status<>'applied'`, [row.tech_pack_id, stage])).rows[0]; }
    await note(row, req, `${who(u)} started the ${stage} review for ${row.title}`, { reviewId: r.id, stage });
    return reply.code(201).send({ review: view(r, pack), pack: formPack(pack) });
  });

  app.get('/v1/sample-reviews/:id', { preHandler: authenticate }, async (req, reply) => {
    const ctx = await loadReview(req, reply); if (!ctx) return reply;
    return { review: view(ctx.r, ctx.pack), pack: formPack(ctx.pack), product: { id: ctx.row.id, title: ctx.row.title, room: ctx.row.client_name }, role: admin(req) ? 'admin' : 'client', liveVersion: ctx.row.published_at ? ctx.row.version : 0 };
  });

  app.put('/v1/sample-reviews/:id', { preHandler: authenticate, bodyLimit: 24_000_000 }, async (req, reply) => {
    const ctx = await loadReview(req, reply); if (!ctx) return reply;
    if (ctx.r.status === 'applied') return bad(reply, 'This review is already in the pack. Start the next sample’s review instead.', 409, { code: 'APPLIED' });
    const rev = Number(req.body?.rev), form = F.normalize(req.body?.form, ctx.pack), u = await nameOf(req);
    // only a save made from the latest one goes in: otherwise the page is given the latest to merge into
    const r = (await pool.query(`update sample_reviews set form=$2, rev=rev+1, updated_by=$3, updated_by_name=$4, updated_at=now() where id=$1 and rev=$5 returning *`, [ctx.r.id, form, uid(req), who(u), rev])).rows[0];
    if (!r) { const cur = (await pool.query('select * from sample_reviews where id=$1', [ctx.r.id])).rows[0]; return reply.code(409).send({ error: `${cur.updated_by_name || 'A teammate'} saved this review a moment ago`, code: 'STALE', review: view(cur, ctx.pack) }); }
    return { review: view(r, ctx.pack) };
  });

  app.post('/v1/sample-reviews/:id/handover', { preHandler: authenticate }, async (req, reply) => {
    const ctx = await loadReview(req, reply); if (!ctx) return reply;
    const { r, row, pack } = ctx;
    if (r.status === 'applied') return bad(reply, 'This review is already in the pack', 409);
    if (!r.form?.verdict) return bad(reply, 'Choose a verdict first: approved, approved with changes, another sample, or rejected');
    const u = await nameOf(req), client = await pool.connect();
    try {
      await client.query('begin');
      const tp = (await client.query('select id, data from tech_packs where id=$1 for update', [r.tech_pack_id])).rows[0];
      const next = normalizeTechPack(F.handOver(normalizeTechPack(tp.data), r.form, r.stage, { by: who(u) }));
      await client.query('update tech_packs set data=$2, updated_by=$3, updated_at=now() where id=$1', [tp.id, next, uid(req)]);
      await client.query(`update sample_reviews set status='handed-over', handed_over_at=now(), handed_over_by=$2, rev=rev+1, updated_at=now() where id=$1`, [r.id, uid(req)]);
      await client.query('commit');
    } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
    const s = F.summary(pack, r.form), line = `${who(u)} handed over the ${r.stage} review of ${row.title}: ${s.verdictWords}${s.must ? `, ${s.must} must-fix` : ''}${s.should ? `, ${s.should} should-fix` : ''}${s.out ? `, ${s.out} measurement${s.out === 1 ? '' : 's'} out of tolerance` : ''}`;
    await note(row, req, line, { reviewId: r.id, stage: r.stage, verdict: r.form.verdict });
    if (!admin(req)) {
      if (row.project_id) await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,$3,'client',$4)`, [row.project_id, row.client_id, uid(req), line]).catch(() => {});
      await notifyStaff(`${row.client_name}: ${r.stage} review of ${row.title} handed over`, `<p>${emailEscape(line)}.</p><p>It is on the draft tech pack as the sample's review. Check it, then press <b>Write into the pack</b> and publish the next version.</p>${hubButton(`${workHubUrl}/samples/${row.id}?review=${r.id}`, 'Open the review')}`).catch(err => log.warn?.({ err: err.message }, 'sample review hand-over: staff not told'));
    }
    return { review: view((await pool.query('select * from sample_reviews where id=$1', [r.id])).rows[0], pack) };
  });

  app.post('/v1/sample-reviews/:id/reopen', { preHandler: authenticate }, async (req, reply) => {
    const ctx = await loadReview(req, reply); if (!ctx) return reply;
    if (ctx.r.status === 'applied') return bad(reply, 'This review is already in the pack', 409);
    const r = (await pool.query(`update sample_reviews set status='open', rev=rev+1, updated_at=now() where id=$1 returning *`, [ctx.r.id])).rows[0];
    return { review: view(r, ctx.pack) };
  });

  app.post('/v1/sample-reviews/:id/apply', { preHandler: authenticate }, async (req, reply) => {
    if (!admin(req)) return bad(reply, 'Future Basics writes a review into the pack. Hand it over and we will.', 403);
    const ctx = await loadReview(req, reply); if (!ctx) return reply;
    const { r, row, pack } = ctx;
    if (r.status === 'applied') return bad(reply, 'This review is already in the pack', 409);
    if (!r.form?.verdict) return bad(reply, 'Choose a verdict first');
    const u = await nameOf(req), client = await pool.connect();
    let draft;
    try {
      await client.query('begin');
      const tp = (await client.query('select id, data, version from tech_packs where id=$1 for update', [r.tech_pack_id])).rows[0];
      draft = normalizeTechPack(F.applyToPack(normalizeTechPack(tp.data), pack, r.form, r.stage, { by: who(u) }));
      await client.query('update tech_packs set data=$2, updated_by=$3, updated_at=now() where id=$1', [tp.id, draft, uid(req)]);
      await client.query(`update sample_reviews set status='applied', applied_at=now(), applied_by=$2, applied_version=$3, rev=rev+1, updated_at=now() where id=$1`, [r.id, uid(req), Number(tp.version || 0) + 1]);
      await client.query('commit');
    } catch (e) { await client.query('rollback').catch(() => {}); throw e; } finally { client.release(); }
    await note(row, req, `The ${r.stage} review of ${row.title} was written into the draft tech pack`, { reviewId: r.id, stage: r.stage });
    return { review: view((await pool.query('select * from sample_reviews where id=$1', [r.id])).rows[0], pack), techPackUrl: `/tech-packs/${row.id}` };
  });
}

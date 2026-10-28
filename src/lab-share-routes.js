// Reviewing a concept together: a view-only link a client or a factory opens without signing in (the page is src/lab-share.html at
// /lab/share/:token), where they see the picture, the flats and the comments, and add comments pinned to a spot on the picture or the flats.
// Nothing on the link can change the design. Staff see the same pins in the concept window and in the studio.
//   Staff:   GET  /v1/lab/concepts/:id/shares            POST /v1/lab/concepts/:id/shares {audience: 'client'|'factory'|'other', label?, days?}
//            DELETE /v1/lab/concepts/:id/shares/:sid     (revoked: the link stops working)
//            POST /v1/lab/concepts/:id/comments/:cid/resolve {resolved: true|false}
//   Public:  GET  /v1/lab/share/:token                   GET …/image      GET …/flats.svg      POST …/comments {name, body, pin?: {on: 'picture'|'flats', x, y}}
import { createHash, randomBytes } from 'node:crypto';
import { cleanColourways } from './lab-materials.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AUDIENCES = ['client', 'factory', 'other'];
export const hashToken = t => createHash('sha256').update(String(t)).digest('hex');
// a pin: where on what. x and y are fractions of the picture, so they hold at any size.
export function cleanPin(p) {
  if (!p || typeof p !== 'object') return null;
  const on = ['picture', 'flats', 'sample'].includes(p.on) ? p.on : 'picture', x = Number(p.x), y = Number(p.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { on, x: Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000, y: Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000 };
}
export const commentShape = r => ({ id: Number(r.id), name: r.name, body: r.body, at: r.at, byClient: Boolean(r.by_client), via: r.via || '', pin: r.pin || null, resolvedAt: r.resolved_at || null });

export function registerLabShareRoutes(app, d) {
  const { pool, authenticate, adminOnly, sheetSvg = async () => null, notifyStaff = async () => false, log = console } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const need = (req, reply, k = 'id') => UUID.test(String(req.params[k])) || (bad(reply, 'Not found', 404), false);
  const origin = req => { const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0], host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0]; return host ? `${proto}://${host}` : ''; };
  const shareShape = (r, req) => ({ id: r.id, audience: r.audience, label: r.label, createdAt: r.created_at, expiresAt: r.expires_at, revokedAt: r.revoked_at, openedAt: r.opened_at, opens: r.opens, url: r.token ? `${origin(req)}/lab/share/${r.token}` : null });
  // a few hits per minute per address on the public link is plenty
  const hits = new Map(); const throttle = (k, limit = 120, windowMs = 600_000) => { const now = Date.now(), e = hits.get(k) || { n: 0, t: now }; if (now - e.t > windowMs) { e.n = 0; e.t = now; } e.n++; hits.set(k, e); if (hits.size > 5000) hits.clear(); return e.n <= limit; };

  // ---- staff ----
  app.get('/v1/lab/concepts/:id/shares', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return;
    const rows = (await pool.query('select id, audience, label, created_at, expires_at, revoked_at, opened_at, opens from lab_shares where concept_id=$1 order by created_at desc', [req.params.id])).rows;
    return { shares: rows.map(r => shareShape(r, req)) };
  });
  app.post('/v1/lab/concepts/:id/shares', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return;
    const c = (await pool.query('select id, name from lab_concepts where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    const b = req.body || {}, audience = AUDIENCES.includes(b.audience) ? b.audience : 'client', days = Math.min(365, Math.max(1, Math.round(Number(b.days) || 30)));
    const token = randomBytes(24).toString('base64url');
    const r = (await pool.query(`insert into lab_shares(concept_id, token_hash, audience, label, created_by, expires_at) values($1,$2,$3,$4,$5, now() + make_interval(days => $6)) returning id, audience, label, created_at, expires_at, revoked_at, opened_at, opens`,
      [c.id, hashToken(token), audience, clip(b.label, 80) || (audience === 'factory' ? 'Factory' : audience === 'client' ? 'Client' : 'Reviewer'), actorOf(req), days])).rows[0];
    return reply.code(201).send({ share: shareShape({ ...r, token }, req) });
  });
  app.delete('/v1/lab/concepts/:id/shares/:sid', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply) || !need(req, reply, 'sid')) return;
    const r = await pool.query('update lab_shares set revoked_at=now() where id=$1 and concept_id=$2 and revoked_at is null', [req.params.sid, req.params.id]);
    return r.rowCount ? { ok: true } : bad(reply, 'Not found', 404);
  });
  app.post('/v1/lab/concepts/:id/comments/:cid/resolve', { preHandler: pre }, async (req, reply) => {
    if (!need(req, reply)) return; const cid = Number(req.params.cid); if (!Number.isInteger(cid)) return bad(reply, 'Not found', 404);
    const on = req.body?.resolved !== false;
    const r = await pool.query(`update lab_concept_comments set resolved_at=${on ? 'now()' : 'null'} where id=$1 and concept_id=$2`, [cid, req.params.id]);
    return r.rowCount ? { ok: true, resolved: on } : bad(reply, 'Not found', 404);
  });

  // ---- the link ----
  const live = async (req, reply) => {
    const token = String(req.params.token || ''); if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) { bad(reply, 'This link is not valid', 404); return null; }
    if (!throttle(`share:${req.ip}`)) { bad(reply, 'Too many requests: try again in a while', 429); return null; }
    const s = (await pool.query(`select s.id, s.audience, s.label, s.expires_at, s.revoked_at, c.id concept_id, c.name, c.category, c.twist, c.spec, c.status, c.product_id, (c.image is not null) has_image, c.updated_at, exists(select 1 from lab_flats f where f.concept_id=c.id) has_flats
      from lab_shares s join lab_concepts c on c.id=s.concept_id where s.token_hash=$1`, [hashToken(token)])).rows[0];
    if (!s) { bad(reply, 'This link is not valid', 404); return null; }
    if (s.revoked_at) { bad(reply, 'This link was turned off', 410); return null; }
    if (s.expires_at && new Date(s.expires_at) < new Date()) { bad(reply, 'This link has expired', 410); return null; }
    return s;
  };
  app.get('/v1/lab/share/:token', async (req, reply) => {
    const s = await live(req, reply); if (!s) return;
    await pool.query('update lab_shares set opened_at=now(), opens=opens+1 where id=$1', [s.id]);
    const comments = (await pool.query(`select id, name, body, at, by_client, via, pin, resolved_at from lab_concept_comments where concept_id=$1 and (via='share' or by_client or body like 'For the client: %' or body like 'For the factory: %' or pin is not null) order by at, id`, [s.concept_id])).rows
      .map(r => ({ ...commentShape(r), name: r.via === 'share' || r.by_client ? r.name : 'Future Basics', body: r.body.replace(/^For the (client|factory): /, '') }));
    const sp = s.spec || {};
    return {
      audience: s.audience, label: s.label, expiresAt: s.expires_at,
      concept: { name: s.name, category: s.category, twist: s.twist, description: clip(sp.description, 600), fabric: clip(sp.fabric, 160), details: Array.isArray(sp.details) ? sp.details.slice(0, 6) : [], colourways: cleanColourways(sp.colourways), status: s.product_id ? 'tech_pack' : s.status, hasImage: s.has_image, hasFlats: s.has_flats, updatedAt: s.updated_at },
      comments
    };
  });
  app.get('/v1/lab/share/:token/image', async (req, reply) => {
    const s = await live(req, reply); if (!s) return;
    const r = (await pool.query('select image, updated_at from lab_concepts where id=$1', [s.concept_id])).rows[0]; if (!r?.image) return bad(reply, 'No picture', 404);
    return reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-cache').send(r.image);
  });
  app.get('/v1/lab/share/:token/flats.svg', async (req, reply) => {
    const s = await live(req, reply); if (!s) return;
    const svg = await sheetSvg(s.concept_id); if (!svg) return bad(reply, 'The flats are not drawn yet', 404);
    return reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'private, no-cache').send(svg);
  });
  app.post('/v1/lab/share/:token/comments', async (req, reply) => {
    const s = await live(req, reply); if (!s) return;
    const b = req.body || {}, name = clip(b.name, 60), body = clip(b.body, 1000), pin = cleanPin(b.pin);
    if (name.length < 2) return bad(reply, 'Say who you are'); if (body.length < 2) return bad(reply, 'Write something first');
    const who = `${name} (${s.audience === 'factory' ? 'factory' : s.audience === 'client' ? 'client' : s.label})`;
    const r = (await pool.query(`insert into lab_concept_comments(concept_id, name, body, by_client, via, pin) values($1,$2,$3,$4,'share',$5) returning id, name, body, at, by_client, via, pin, resolved_at`, [s.concept_id, who, body, s.audience === 'client', pin ? JSON.stringify(pin) : null])).rows[0];
    notifyStaff(`${who} commented on ${s.name}`, `<p><strong>${esc(who)}</strong> wrote on <strong>${esc(s.name)}</strong>${pin ? ` (pinned on the ${pin.on})` : ''}: ${esc(body)}</p><p>Open the concept in the Design Lab to answer.</p>`).catch?.(() => {});
    return reply.code(201).send({ comment: commentShape(r) });
  });
  log.info?.('design review links ready');
}

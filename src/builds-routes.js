// Routes for the builds showcase (see builds.js for the rules). Registered from server.js with the pieces of the service it needs passed in, so this file does not reach into it.
//
//   viewers   /v1/builds/auth/*  sign in with an emailed code (a session cookie, not the hub's token); /v1/builds, /v1/builds/:slug, /builds/go/:slug
//   staff     /v1/admin/builds*  builds, invites, activity (the work console's own sign-in)
//   housed    /v1/builds/auth/check?slug=…  200 or 401, for a reverse proxy in front of a build we host (Caddy forward_auth), so a private build is private
import { cleanBuild, canSee, visibleBuilds, hasAnyAccess, SEED_BUILDS, STATUS_LABELS } from './builds.js';
import { readdirSync, readFileSync } from 'node:fs';
import { captureLead } from './sales-routes.js';
import { syncBuilds, cleanChangeTitle } from './builds-sync.js';

// A picture of each known build's real site, taken by scripts/capture-build-previews.mjs. It is the card's picture until staff upload their own.
const PREVIEW_DIR = new URL('./builds-previews/', import.meta.url);
const previewSlugs = () => { try { return new Set(readdirSync(PREVIEW_DIR).filter(f => /^[a-z0-9-]+\.jpg$/.test(f)).map(f => f.slice(0, -4))); } catch { return new Set(); } };
const PREVIEWS = previewSlugs();

const COOKIE = 'fb_builds', SESSION_DAYS = 14;
const IMAGE_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[a-z0-9+/=]+$/i, MAX_COVER_CHARS = 4_000_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cookies = h => Object.fromEntries(String(h || '').split(/;\s*/).filter(Boolean).map(p => { const i = p.indexOf('='); return i < 0 ? [p, ''] : [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));

export { syncBuilds };
export function registerBuildRoutes(app, d) {
  const { pool, authenticate, adminOnly, secret, SignJWT, jwtVerify, hash, throttle, CODE_ASK, CODE_GUESS, tooManyCodes, tooManyGuesses, cleanCode, randomInt, sendHubEmail, hubEmailShell, hubButton, emailEscape, clientForEmail, log } = d;
  const buildsUrl = () => String(process.env.BUILDS_URL || 'https://builds.thefuturebasics.com').replace(/\/$/, '');
  const isStaffEmail = email => email.split('@')[1] === 'thefuturebasics.com';
  const BUILD_COLUMNS = `id,slug,name,tagline,sector,status,visibility,hosting,live_url,repo_url,stack,summary,highlights,links,sort_order,updated_at,repo_path,auto_publish,last_change_at,synced_at,sync_error,jsonb_exists(media,'cover') as has_cover`;

  // everything we know about an address: staff, an existing client, and its invites
  async function viewerFor(email) {
    const invites = (await pool.query('select id,build_id,expires_at,revoked_at from build_invites where lower(email)=$1', [email])).rows;
    return { email, staff: isStaffEmail(email), client: Boolean(await clientForEmail(email).catch(() => null)), invites };
  }
  async function sessionOf(req) {
    const tok = cookies(req.headers.cookie)[COOKIE]; if (!tok) return null;
    try {
      const { payload } = await jwtVerify(tok, secret, { issuer: 'future-basics-builds' });
      const viewer = await viewerFor(String(payload.sub || '')); // read fresh every time: a revoked invite stops working at once
      return hasAnyAccess(viewer) ? viewer : null;
    } catch { return null; }
  }
  const needViewer = async (req, reply) => { const v = await sessionOf(req); if (!v) { reply.code(401).send({ error: 'Sign in to see the builds', code: 'SIGN_IN' }); return null; } return v; };
  const shape = (b, withDetail = false) => ({
    id: b.id, slug: b.slug, name: b.name, tagline: b.tagline, sector: b.sector, status: b.status, statusLabel: STATUS_LABELS[b.status] || b.status, hosting: b.hosting, stack: b.stack || [],
    updatedAt: b.repo_url && b.last_change_at ? b.last_change_at : null,
    coverUrl: b.has_cover || PREVIEWS.has(b.slug) ? `/v1/builds/${b.slug}/cover?v=${new Date(b.updated_at).getTime()}` : '',
    hasOwnCover: Boolean(b.has_cover),
    features: (b.highlights || []).map(h => h.title).filter(Boolean).slice(0, 4), featureCount: (b.highlights || []).length,
    ...(withDetail ? { summary: b.summary, highlights: b.highlights || [], hasRepo: Boolean(b.repo_url), hasLive: Boolean(b.live_url), links: (b.links || []).map(l => ({ label: l.label })) } : {})
  });
  const allBuilds = async () => (await pool.query(`select ${BUILD_COLUMNS} from builds order by sort_order, name`)).rows;
  async function logView(viewer, build, kind, req) {
    if (viewer.staff) return; // staff looking is not interest
    if (kind === 'open') { const recent = await pool.query(`select 1 from build_views where email=$1 and build_id=$2 and kind='open' and created_at>now()-interval '30 minutes' limit 1`, [viewer.email, build.id]); if (recent.rowCount) return; }
    await pool.query('insert into build_views(email,build_id,kind,ua) values($1,$2,$3,$4)', [viewer.email, build.id, kind, String(req.headers['user-agent'] || '').slice(0, 200)]);
    // the person is a lead: they go into the CRM with what they looked at, a deal to work, and after a click-through a follow-up for the next working day
    await captureLead(pool, { email: viewer.email, source: 'showcase', kind: kind === 'demo' ? 'showcase_demo' : 'showcase_view', text: kind === 'demo' ? `Opened the live build: ${build.name}` : `Looked at ${build.name} in the showcase`, meta: { buildId: build.id, slug: build.slug, kind }, dealTitle: `Showcase interest: ${build.name}`, followUp: kind === 'demo' ? `Follow up: they opened the live ${build.name}` : null });
    await pool.query('update build_invites set last_seen_at=now(), first_seen_at=coalesce(first_seen_at,now()) where lower(email)=$1 and revoked_at is null and expires_at>now()', [viewer.email]);
  }

  // ---- sign in (an emailed six-digit code, like the hub, but a viewer session instead of a client one) ----
  app.post('/v1/builds/auth/code', async (req, reply) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) return reply.code(400).send({ error: 'Enter the email address you were invited with' });
    if (!throttle(`bcode:${email}`, CODE_ASK) || !throttle(`bcodeip:${req.ip}`, { limit: 30, windowMs: 60 * 60 * 1000 })) return reply.code(429).send(tooManyCodes);
    // the answer is the same whether or not the address is on the list, so the list cannot be read by asking
    if (hasAnyAccess(await viewerFor(email))) {
      const code = String(randomInt(100000, 1000000));
      await pool.query(`insert into login_codes(email,code_hash,expires_at) values($1,$2,now()+interval '10 minutes')`, [email, hash(code)]);
      const delivered = await sendHubEmail({ to: email, subject: `${code} is your code for the Future Basics builds`, html: hubEmailShell('Your code', `<p>Use this code to open the Future Basics builds:</p><p style="font-size:32px;letter-spacing:.2em;font-weight:700;margin:18px 0">${emailEscape(code)}</p><p style="color:#717177">It works for 10 minutes. If you did not ask for it, ignore this email.</p>`) }).catch(e => log.warn({ err: e.message }, 'builds code email failed'));
      if (!delivered && !process.env.RESEND_API_KEY) log.warn({ email, code }, 'RESEND_API_KEY missing; builds sign-in code logged for setup testing'); // same as the hub's own sign-in, so a stand-alone install can still be tried
    }
    return reply.code(202).send({ ok: true });
  });
  app.post('/v1/builds/auth/verify', async (req, reply) => {
    const email = String(req.body?.email || '').trim().toLowerCase(), code = cleanCode(req.body?.code);
    if (!throttle(`bverifyip:${req.ip}`, { limit: 60, windowMs: 60 * 60 * 1000 })) return reply.code(429).send(tooManyGuesses);
    const spent = await pool.query(`update login_codes set consumed_at=now() where id=(select id from login_codes where email=$1 and code_hash=$2 and consumed_at is null and expires_at>now() order by created_at desc limit 1) returning id`, [email, hash(code)]);
    if (!spent.rowCount) {
      if (email && !throttle(`bguess:${email}`, CODE_GUESS)) { await pool.query('update login_codes set consumed_at=now() where email=$1 and consumed_at is null', [email]).catch(() => {}); return reply.code(429).send(tooManyGuesses); }
      return reply.code(401).send({ error: 'That code is wrong or has expired' });
    }
    const viewer = await viewerFor(email);
    if (!hasAnyAccess(viewer)) return reply.code(403).send({ error: 'This address no longer has access' });
    const token = await new SignJWT({ sub: email, kind: 'builds' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-builds').setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secret);
    const secure = req.protocol === 'https' ? '; Secure' : '', domain = process.env.BUILDS_COOKIE_DOMAIN ? `; Domain=${process.env.BUILDS_COOKIE_DOMAIN}` : '';
    reply.header('set-cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}${domain}`);
    await pool.query('update build_invites set first_seen_at=coalesce(first_seen_at,now()), last_seen_at=now() where lower(email)=$1 and revoked_at is null and expires_at>now()', [email]);
    return { ok: true, email };
  });
  app.post('/v1/builds/auth/logout', async (req, reply) => {
    const domain = process.env.BUILDS_COOKIE_DOMAIN ? `; Domain=${process.env.BUILDS_COOKIE_DOMAIN}` : '';
    reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.protocol === 'https' ? '; Secure' : ''}${domain}`);
    return { ok: true };
  });
  app.get('/v1/builds/me', async (req, reply) => { const v = await needViewer(req, reply); return v ? { email: v.email, staff: v.staff } : undefined; });
  // for a reverse proxy in front of a build we host: 200 lets the request through, anything else keeps it out
  app.get('/v1/builds/auth/check', async (req, reply) => {
    const v = await sessionOf(req); if (!v) return reply.code(401).send({ error: 'Sign in' });
    const slug = String(req.query?.slug || '');
    if (slug) { const b = (await allBuilds()).find(x => x.slug === slug); if (!b || !canSee(b, v)) return reply.code(403).send({ error: 'No access to this build' }); }
    return reply.header('x-builds-user', v.email).send({ ok: true });
  });

  // ---- the viewer's builds ----
  app.get('/v1/builds', async (req, reply) => {
    const v = await needViewer(req, reply); if (!v) return;
    const list = visibleBuilds(await allBuilds(), v);
    return { viewer: { email: v.email, staff: v.staff }, builds: list.map(b => shape(b)) };
  });
  app.get('/v1/builds/:slug', async (req, reply) => {
    const v = await needViewer(req, reply); if (!v) return;
    const b = (await allBuilds()).find(x => x.slug === req.params.slug);
    if (!b || !canSee(b, v)) return reply.code(404).send({ error: 'Build not found' });
    await logView(v, b, 'open', req).catch(e => log.warn({ err: e.message }, 'build view not recorded'));
    const news = (await pool.query(`select text, coalesce(published_at, happened_at) as at from build_updates where build_id=$1 and status='published' order by happened_at desc limit 6`, [b.id])).rows;
    return { build: { ...shape(b, true), news } };
  });
  app.get('/v1/builds/:slug/cover', async (req, reply) => {
    const v = await needViewer(req, reply); if (!v) return;
    const row = (await pool.query('select id,visibility,status,media from builds where slug=$1', [req.params.slug])).rows[0];
    if (!row || !canSee(row, v)) return reply.code(404).send({ error: 'No picture' });
    if (!row.media?.cover && PREVIEWS.has(req.params.slug)) return reply.header('cache-control', 'private, max-age=3600').type('image/jpeg').send(readFileSync(new URL(`${req.params.slug}.jpg`, PREVIEW_DIR)));
    if (!row.media?.cover) return reply.code(404).send({ error: 'No picture' });
    const m = /^data:(image\/[a-z]+);base64,(.+)$/i.exec(row.media.cover); if (!m) return reply.code(404).send({ error: 'No picture' });
    return reply.header('cache-control', 'private, max-age=300').type(m[1]).send(Buffer.from(m[2], 'base64'));
  });
  // the visit: recorded, then sent to the live build (the only address a visitor is ever sent to is one staff saved)
  app.get('/builds/go/:slug', async (req, reply) => {
    const v = await sessionOf(req); if (!v) return reply.redirect(`/builds#${encodeURIComponent(req.params.slug)}`);
    const row = (await pool.query('select id,slug,name,visibility,status,live_url from builds where slug=$1', [req.params.slug])).rows[0];
    if (!row || !canSee(row, v) || !row.live_url) return reply.code(404).send({ error: 'Build not found' });
    await logView(v, row, 'demo', req).catch(e => log.warn({ err: e.message }, 'build visit not recorded'));
    return reply.header('cache-control', 'no-store').redirect(row.live_url);
  });

  // an extra link on a build (a walkthrough, a demo): recorded like the live build, then sent to the address staff saved
  app.get('/builds/go/:slug/:n', async (req, reply) => {
    const v = await sessionOf(req); if (!v) return reply.redirect(`/builds#${encodeURIComponent(req.params.slug)}`);
    const row = (await pool.query('select id,slug,name,visibility,status,links from builds where slug=$1', [req.params.slug])).rows[0];
    const link = row && /^\d{1,2}$/.test(req.params.n) ? (row.links || [])[Number(req.params.n)] : null;
    if (!row || !canSee(row, v) || !link?.url) return reply.code(404).send({ error: 'Link not found' });
    await logView(v, row, 'demo', req).catch(e => log.warn({ err: e.message }, 'build visit not recorded'));
    return reply.header('cache-control', 'no-store').redirect(link.url);
  });

  // ---- staff ----
  const pre = [authenticate, adminOnly];
  app.get('/v1/admin/builds', { preHandler: pre }, async (_req) => {
    const rows = (await pool.query(`select ${BUILD_COLUMNS},
      (select count(*) from build_invites i where i.build_id=builds.id and i.revoked_at is null and i.expires_at>now())::int invites,
      (select count(*) from build_views v where v.build_id=builds.id)::int views,
      (select count(*) from build_updates u where u.build_id=builds.id and u.status='new')::int new_updates from builds order by sort_order,name`)).rows;
    return { builds: rows.map(b => ({ ...b, coverUrl: b.has_cover ? `/v1/admin/builds/${b.id}/cover?v=${new Date(b.updated_at).getTime()}` : '' })) };
  });
  app.post('/v1/admin/builds', { preHandler: pre }, async (req, reply) => {
    const r = cleanBuild(req.body); if (r.error) return reply.code(422).send({ error: r.error });
    const v = r.value; const taken = await pool.query('select 1 from builds where slug=$1', [v.slug]); if (taken.rowCount) return reply.code(409).send({ error: 'Another build already has that address' });
    const row = (await pool.query(`insert into builds(slug,name,tagline,sector,status,visibility,hosting,live_url,repo_url,stack,summary,highlights,sort_order,links,repo_path,auto_publish) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) returning id`,
      [v.slug, v.name, v.tagline || '', v.sector || '', v.status || 'concept', v.visibility || 'hidden', v.hosting || 'other', v.live_url || '', v.repo_url || '', v.stack || [], v.summary || '', JSON.stringify(v.highlights || []), v.sort_order ?? 100, JSON.stringify(v.links || []), v.repo_path || '', v.auto_publish === true])).rows[0];
    return reply.code(201).send({ id: row.id });
  });
  app.put('/v1/admin/builds/:id', { preHandler: pre }, async (req, reply) => {
    const r = cleanBuild(req.body, { partial: true }); if (r.error) return reply.code(422).send({ error: r.error });
    const v = r.value, keys = Object.keys(v); if (!keys.length) return reply.code(400).send({ error: 'Nothing to change' });
    if (v.slug) { const taken = await pool.query('select 1 from builds where slug=$1 and id<>$2', [v.slug, req.params.id]); if (taken.rowCount) return reply.code(409).send({ error: 'Another build already has that address' }); }
    const sets = keys.map((k, i) => `${k}=$${i + 2}`), vals = keys.map(k => (k === 'highlights' || k === 'links' ? JSON.stringify(v[k]) : v[k]));
    const row = await pool.query(`update builds set ${sets.join(',')},updated_at=now() where id=$1 returning id`, [req.params.id, ...vals]);
    return row.rowCount ? { ok: true } : reply.code(404).send({ error: 'Build not found' });
  });
  app.delete('/v1/admin/builds/:id', { preHandler: pre }, async (req, reply) => (await pool.query('delete from builds where id=$1', [req.params.id])).rowCount ? { ok: true } : reply.code(404).send({ error: 'Build not found' }));
  app.put('/v1/admin/builds/:id/cover', { preHandler: pre, bodyLimit: 6_000_000 }, async (req, reply) => {
    const image = String(req.body?.image || '');
    if (image && (!IMAGE_RE.test(image) || image.length > MAX_COVER_CHARS)) return reply.code(422).send({ error: 'Use a JPG, PNG or WebP picture under 3 MB' });
    const row = (await pool.query('select media from builds where id=$1', [req.params.id])).rows[0]; if (!row) return reply.code(404).send({ error: 'Build not found' });
    const media = { ...(row.media || {}) }; if (image) media.cover = image; else delete media.cover;
    await pool.query('update builds set media=$2,updated_at=now() where id=$1', [req.params.id, media]);
    return { ok: true };
  });
  app.get('/v1/admin/builds/:id/cover', { preHandler: pre }, async (req, reply) => {
    const row = (await pool.query('select media from builds where id=$1', [req.params.id])).rows[0];
    const m = row?.media?.cover && /^data:(image\/[a-z]+);base64,(.+)$/i.exec(row.media.cover); if (!m) return reply.code(404).send({ error: 'No picture' });
    return reply.header('cache-control', 'private, max-age=60').type(m[1]).send(Buffer.from(m[2], 'base64'));
  });

  // keeping the showcase current: what changed in each build's code since the last look (see builds-sync.js)
  const runSync = only => syncBuilds(pool, { only, log, fetchImpl: d.fetchImpl || fetch });
  app.post('/v1/admin/builds/sync', { preHandler: pre }, async (req) => ({ ...(await runSync(req.body?.buildId || null)) }));
  app.get('/v1/admin/builds/updates', { preHandler: pre }, async (req) => {
    const status = ['new', 'published', 'dismissed'].includes(req.query?.status) ? req.query.status : 'new';
    return { updates: (await pool.query(`select u.id,u.build_id,b.name build_name,b.slug build_slug,u.source,u.raw_title,u.text,u.url,u.status,u.happened_at,u.published_at from build_updates u join builds b on b.id=u.build_id where u.status=$1 order by u.happened_at desc limit 200`, [status])).rows };
  });
  app.put('/v1/admin/builds/updates/:id', { preHandler: pre }, async (req, reply) => {
    const status = req.body?.status, text = req.body?.text === undefined ? null : cleanChangeTitle(req.body.text);
    if (status !== undefined && !['new', 'published', 'dismissed'].includes(status)) return reply.code(422).send({ error: 'Use published, dismissed or new' });
    if (text !== null && !text) return reply.code(422).send({ error: 'Write the line a visitor will read' });
    if (status === undefined && text === null) return reply.code(400).send({ error: 'Nothing to change' });
    const r = await pool.query(`update build_updates set text=coalesce($2,text), status=coalesce($3,status), published_at=case when coalesce($3,status)='published' then coalesce(published_at,now()) else null end where id=$1 returning id`, [req.params.id, text, status ?? null]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'Update not found' });
  });
  // a line written by hand (a change that did not come through GitHub): published straight away
  app.post('/v1/admin/builds/:id/updates', { preHandler: pre }, async (req, reply) => {
    const text = cleanChangeTitle(req.body?.text); if (!text) return reply.code(422).send({ error: 'Write the line a visitor will read' });
    const r = await pool.query(`insert into build_updates(build_id,ref,source,text,status,published_at) select id,'manual:'||gen_random_uuid()::text,'manual',$2,'published',now() from builds where id=$1 returning id`, [req.params.id, text]);
    return r.rowCount ? reply.code(201).send({ id: r.rows[0].id }) : reply.code(404).send({ error: 'Build not found' });
  });

  // invites: who may sign in and what they may see
  app.get('/v1/admin/builds/invites', { preHandler: pre }, async () => ({ invites: (await pool.query(`select i.id,i.email,i.build_id,b.name build_name,i.note,i.expires_at,i.revoked_at,i.created_at,i.first_seen_at,i.last_seen_at,
      (select count(*) from build_views v where lower(v.email)=lower(i.email))::int views from build_invites i left join builds b on b.id=i.build_id order by i.created_at desc limit 300`)).rows }));
  app.post('/v1/admin/builds/invites', { preHandler: pre }, async (req, reply) => {
    const emails = [...new Set((Array.isArray(req.body?.emails) ? req.body.emails : String(req.body?.emails || '').split(/[\s,;]+/)).map(e => String(e).trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return reply.code(422).send({ error: 'Add at least one email address' });
    const bad = emails.find(e => !EMAIL_RE.test(e)); if (bad) return reply.code(422).send({ error: `“${bad}” is not an email address` });
    if (emails.length > 50) return reply.code(422).send({ error: 'Fifty at a time is the limit' });
    const buildId = req.body?.buildId || null;
    let build = null; if (buildId) { build = (await pool.query('select id,name,slug from builds where id=$1', [buildId])).rows[0]; if (!build) return reply.code(404).send({ error: 'Build not found' }); }
    const days = Math.max(1, Math.min(180, Math.round(Number(req.body?.days) || 30))), note = String(req.body?.note || '').trim().slice(0, 300), send = req.body?.send !== false;
    const out = [];
    for (const email of emails) {
      const had = (await pool.query(`select id from build_invites where lower(email)=$1 and build_id is not distinct from $2 and revoked_at is null limit 1`, [email, buildId])).rows[0];
      if (had) await pool.query(`update build_invites set expires_at=now()+($2||' days')::interval,note=coalesce(nullif($3,''),note) where id=$1`, [had.id, String(days), note]);
      else await pool.query(`insert into build_invites(email,build_id,invited_by,note,expires_at) values($1,$2,$3,$4,now()+($5||' days')::interval)`, [email, buildId, req.auth.sub, note || null, String(days)]);
      let sent = false;
      if (send) {
        const link = `${buildsUrl()}/?e=${encodeURIComponent(email)}${build ? `#${build.slug}` : ''}`;
        sent = await sendHubEmail({ to: email, subject: build ? `A look at ${build.name}, built by Future Basics` : 'What Future Basics builds', html: hubEmailShell(build ? `A look at ${build.name}` : 'What Future Basics builds',
          `<p>${emailEscape(req.auth.email || 'Future Basics')} invited you to see ${build ? `<strong>${emailEscape(build.name)}</strong>, one of` : 'some of'} the sites and apps Future Basics has built.</p>${note ? `<p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(note)}</p>` : ''}<p>Sign in with this email address and we will send you a code. The invite works for ${days} days.</p>${hubButton(link, 'See the builds')}`) }).catch(() => false);
      }
      await captureLead(pool, { email, source: 'showcase', kind: 'system', text: `Invited to ${build ? build.name : 'the showcase'}${note ? `: ${note}` : ''}`, meta: { buildId: build?.id || null, invite: true }, actorId: /^[0-9a-f-]{36}$/i.test(String(req.auth?.sub || '')) ? req.auth.sub : null });
      out.push({ email, sent: Boolean(sent), extended: Boolean(had) });
    }
    return reply.code(201).send({ invited: out });
  });
  app.delete('/v1/admin/builds/invites/:id', { preHandler: pre }, async (req, reply) => (await pool.query('update build_invites set revoked_at=now() where id=$1 and revoked_at is null', [req.params.id])).rowCount ? { ok: true } : reply.code(404).send({ error: 'Invite not found' }));
  app.get('/v1/admin/builds/activity', { preHandler: pre }, async () => ({ events: (await pool.query(`select v.email,b.name build_name,b.slug,v.kind,v.created_at from build_views v join builds b on b.id=v.build_id order by v.created_at desc limit 100`)).rows }));
}

// Seeded once, hidden until someone has read them in the console and made them visible.
export async function seedBuilds(pool) {
  const have = Number((await pool.query('select count(*) n from builds')).rows[0].n);
  if (have) return 0;
  let n = 0;
  for (const [i, b] of SEED_BUILDS.entries()) {
    const r = cleanBuild({ ...b, visibility: 'hidden', sortOrder: 10 + i * 10 }); if (r.error) continue; const v = r.value;
    await pool.query(`insert into builds(slug,name,tagline,sector,status,visibility,hosting,live_url,repo_url,stack,summary,highlights,sort_order) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) on conflict (slug) do nothing`,
      [v.slug, v.name, v.tagline || '', v.sector || '', v.status || 'concept', 'hidden', v.hosting || 'other', v.live_url || '', v.repo_url || '', v.stack || [], v.summary || '', JSON.stringify(v.highlights || []), v.sort_order]); n++;
  }
  return n;
}

// Builds that were seeded before the showcase tracked where their code lives learn it once (only where staff have not set anything).
export async function backfillBuildRepos(pool) {
  let n = 0;
  for (const b of SEED_BUILDS) {
    if (!b.repoUrl) continue;
    n += (await pool.query(`update builds set repo_url=$2, repo_path=$3 where slug=$1 and repo_url='' and repo_path=''`, [b.slug, b.repoUrl, b.repoPath || ''])).rowCount;
  }
  return n;
}

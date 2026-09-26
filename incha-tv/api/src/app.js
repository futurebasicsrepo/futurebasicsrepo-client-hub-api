import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';
import * as storage from './storage.js';
import {
  COVER_TYPES, EMAIL_RE, HANDLE_RE, MEDIA_KEY_RE, MEDIA_TYPES, POST_ID_RE, SORTS,
  createLimiter, hashPassword, normalizeEmail, normalizeHandle, normalizePostEdit,
  parseRange, randomId, signMedia, slugify, verifyMediaSig, verifyPassword
} from './lib.js';

const MAX_MEDIA_BYTES = Number(process.env.MAX_MEDIA_BYTES || 500_000_000);
const MAX_COVER_BYTES = 10_000_000;
const MEDIA_URL_TTL = 6 * 60 * 60;

function originAllowed(origin, allowed) {
  if (!origin) return true;
  return allowed.some(entry => {
    if (entry === origin) return true;
    // `https://*.vercel.app` style wildcard entries for preview deployments.
    const wildcard = /^(https?:\/\/)\*(\..+)$/.exec(entry);
    return wildcard && origin.startsWith(wildcard[1]) && origin.endsWith(wildcard[2]);
  });
}

export async function buildApp({ logger = true } = {}) {
  const app = Fastify({ logger, bodyLimit: 1_000_000, trustProxy: true });
  const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET || randomBytes(32).toString('hex'));
  const mediaSecret = process.env.MEDIA_SECRET || process.env.JWT_SECRET || randomBytes(32).toString('hex');
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://incha.tv,https://www.incha.tv')
    .split(',').map(value => value.trim()).filter(Boolean);
  const authLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
  const commentLimiter = createLimiter({ windowMs: 60 * 1000, max: 10 });
  const uploadLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });
  const viewLimiter = createLimiter({ windowMs: 30 * 60 * 1000, max: 1 });

  await app.register(cors, {
    origin: (origin, cb) => cb(null, originAllowed(origin, allowedOrigins)),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE'],
    exposedHeaders: ['content-range', 'accept-ranges', 'content-length']
  });
  await app.register(multipart, { limits: { fileSize: MAX_MEDIA_BYTES, files: 1, fields: 10 } });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'strict-origin-when-cross-origin')
      .header('cross-origin-resource-policy', 'cross-origin');
    return payload;
  });

  app.decorateRequest('user', null);
  app.addHook('onRequest', async req => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return;
    try {
      const { payload } = await jwtVerify(header.slice(7), jwtSecret);
      req.user = { id: Number(payload.sub), handle: payload.handle };
    } catch { /* treat bad tokens as signed out */ }
  });

  const fail = (reply, status, error) => reply.code(status).send({ error });
  const requireUser = async (req, reply) => { if (!req.user) return fail(reply, 401, 'Sign in to continue.'); };

  const issueToken = user => new SignJWT({ handle: user.handle })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(String(user.id)).setIssuedAt().setExpirationTime('30d').sign(jwtSecret);
  const userView = row => ({ id: Number(row.id), handle: row.handle, displayName: row.display_name, bio: row.bio, createdAt: row.created_at });

  const baseUrl = req => (process.env.PUBLIC_API_URL || `${req.protocol}://${req.host}`).replace(/\/$/, '');
  const mediaUrl = (req, key, open) => {
    if (!key) return null;
    const url = `${baseUrl(req)}/media/${key}`;
    if (open) return url;
    // Round expiry to the hour so URLs stay stable (and cacheable) within a window.
    const exp = Math.ceil(Date.now() / 1000 / 3600) * 3600 + MEDIA_URL_TTL;
    return `${url}?exp=${exp}&sig=${signMedia(key, exp, mediaSecret)}`;
  };

  const isLive = row => row.status === 'published' && row.visibility !== 'private';
  const canView = (row, user) => isLive(row) || (user && Number(row.user_id) === user.id);

  const postView = (req, row) => {
    const open = row.status === 'published' && row.visibility === 'public';
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.media_kind,
      mediaUrl: mediaUrl(req, row.media_key, open),
      mediaMime: row.media_mime,
      coverUrl: mediaUrl(req, row.cover_key, open),
      duration: row.duration,
      trimStart: row.trim_start,
      trimEnd: row.trim_end,
      filter: row.filter,
      status: row.status,
      visibility: row.visibility,
      score: row.score,
      commentCount: row.comment_count,
      viewCount: Number(row.view_count),
      publishedAt: row.published_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      fandom: row.fandom_slug ? { slug: row.fandom_slug, name: row.fandom_name } : null,
      creator: { handle: row.handle, displayName: row.display_name },
      viewerHasVoted: Boolean(row.viewer_voted),
      isOwner: Boolean(req.user && Number(row.user_id) === req.user.id)
    };
  };

  const POST_SELECT = `
    select p.*, u.handle, u.display_name, f.slug as fandom_slug, f.name as fandom_name,
      exists(select 1 from votes v where v.post_id = p.id and v.user_id = $1::bigint) as viewer_voted
    from posts p join users u on u.id = p.user_id left join fandoms f on f.id = p.fandom_id`;

  async function loadPost(req, id) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows } = await pool.query(`${POST_SELECT} where p.id = $2`, [req.user?.id ?? null, id]);
    return rows[0] || null;
  }

  async function loadVisiblePost(req, reply, id) {
    const row = await loadPost(req, id);
    if (!row || !canView(row, req.user)) { fail(reply, 404, 'Post not found.'); return null; }
    return row;
  }

  async function loadOwnPost(req, reply, id) {
    const row = await loadPost(req, id);
    if (!row || Number(row.user_id) !== req.user.id) { fail(reply, 404, 'Post not found.'); return null; }
    return row;
  }

  async function fandomId(name) {
    if (!name) return null;
    const slug = slugify(name);
    const { rows } = await pool.query(
      `insert into fandoms (slug, name) values ($1, $2) on conflict (slug) do update set slug = excluded.slug returning id`,
      [slug, name]);
    return rows[0].id;
  }

  // ---------- health ----------
  app.get('/health', async () => {
    await pool.query('select 1');
    return { ok: true, service: 'incha-tv-api' };
  });

  // ---------- auth ----------
  app.post('/v1/auth/signup', async (req, reply) => {
    if (!authLimiter(`auth:${req.ip}`)) return fail(reply, 429, 'Too many attempts. Try again soon.');
    const email = normalizeEmail(req.body?.email);
    const handle = normalizeHandle(req.body?.handle);
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim().slice(0, 60) || handle;
    if (!EMAIL_RE.test(email)) return fail(reply, 400, 'Enter a valid email.');
    if (!HANDLE_RE.test(handle)) return fail(reply, 400, 'Handle must be 3–24 characters: letters, numbers, underscores.');
    if (password.length < 8 || password.length > 200) return fail(reply, 400, 'Password must be at least 8 characters.');
    try {
      const { rows } = await pool.query(
        `insert into users (email, handle, display_name, password_hash) values ($1, $2, $3, $4) returning *`,
        [email, handle, displayName, await hashPassword(password)]);
      return reply.code(201).send({ token: await issueToken(rows[0]), user: userView(rows[0]) });
    } catch (error) {
      if (error.code === '23505') return fail(reply, 409, error.constraint?.includes('handle') ? 'That handle is taken.' : 'That email already has an account.');
      throw error;
    }
  });

  app.post('/v1/auth/login', async (req, reply) => {
    if (!authLimiter(`auth:${req.ip}`)) return fail(reply, 429, 'Too many attempts. Try again soon.');
    const login = String(req.body?.login || '').trim().toLowerCase().replace(/^@/, '');
    const { rows } = await pool.query(`select * from users where email = $1 or handle = $1`, [login]);
    const ok = rows[0] && await verifyPassword(String(req.body?.password || ''), rows[0].password_hash);
    if (!ok) return fail(reply, 401, 'Wrong email/handle or password.');
    return { token: await issueToken(rows[0]), user: userView(rows[0]) };
  });

  app.get('/v1/me', { preHandler: requireUser }, async (req, reply) => {
    const { rows } = await pool.query(`select * from users where id = $1`, [req.user.id]);
    if (!rows[0]) return fail(reply, 401, 'Sign in to continue.');
    return { user: userView(rows[0]) };
  });

  app.patch('/v1/me', { preHandler: requireUser }, async (req, reply) => {
    const displayName = req.body?.displayName === undefined ? null : String(req.body.displayName).trim().slice(0, 60);
    const bio = req.body?.bio === undefined ? null : String(req.body.bio).trim().slice(0, 280);
    if (displayName === '') return fail(reply, 400, 'Display name cannot be empty.');
    const { rows } = await pool.query(
      `update users set display_name = coalesce($2, display_name), bio = coalesce($3, bio) where id = $1 returning *`,
      [req.user.id, displayName, bio]);
    return { user: userView(rows[0]) };
  });

  // ---------- discovery ----------
  app.get('/v1/fandoms', async () => {
    const { rows } = await pool.query(`
      select f.slug, f.name, count(p.id)::int as post_count
      from fandoms f left join posts p on p.fandom_id = f.id and p.status = 'published' and p.visibility = 'public'
      group by f.id order by post_count desc, f.name asc limit 100`);
    return { fandoms: rows.map(r => ({ slug: r.slug, name: r.name, postCount: r.post_count })) };
  });

  app.get('/v1/fandoms/:slug', async (req, reply) => {
    const { rows } = await pool.query(`
      select f.slug, f.name, count(p.id)::int as post_count
      from fandoms f left join posts p on p.fandom_id = f.id and p.status = 'published' and p.visibility = 'public'
      where f.slug = $1 group by f.id`, [req.params.slug]);
    if (!rows[0]) return fail(reply, 404, 'Fandom not found.');
    return { fandom: { slug: rows[0].slug, name: rows[0].name, postCount: rows[0].post_count } };
  });

  app.get('/v1/users/:handle', async (req, reply) => {
    const { rows } = await pool.query(`
      select u.*, (select count(*)::int from posts p where p.user_id = u.id and p.status = 'published' and p.visibility = 'public') as post_count,
        (select coalesce(sum(score), 0)::int from posts p where p.user_id = u.id and p.status = 'published' and p.visibility = 'public') as total_score
      from users u where u.handle = $1`, [normalizeHandle(req.params.handle)]);
    if (!rows[0]) return fail(reply, 404, 'Creator not found.');
    const { id, ...profile } = userView(rows[0]);
    return { user: { ...profile, postCount: rows[0].post_count, totalScore: rows[0].total_score } };
  });

  app.get('/v1/posts', async req => {
    const sort = SORTS.includes(req.query.sort) ? req.query.sort : 'hot';
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 48);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [req.user?.id ?? null];
    const where = [`p.status = 'published'`, `p.visibility = 'public'`];
    if (req.query.fandom) { params.push(String(req.query.fandom)); where.push(`f.slug = $${params.length}`); }
    if (req.query.creator) { params.push(normalizeHandle(req.query.creator)); where.push(`u.handle = $${params.length}`); }
    if (req.query.q) {
      params.push(`%${String(req.query.q).slice(0, 80).replace(/[%_\\]/g, '\\$&')}%`);
      where.push(`(p.title ilike $${params.length} or p.description ilike $${params.length})`);
    }
    const order = {
      new: 'p.published_at desc',
      top: 'p.score desc, p.published_at desc',
      // Reddit/HN-style decay: votes lose weight as the post ages.
      hot: `(p.score + 1) / power(extract(epoch from (now() - p.published_at)) / 3600 + 2, 1.5) desc, p.published_at desc`
    }[sort];
    params.push(limit + 1, offset);
    const { rows } = await pool.query(
      `${POST_SELECT} where ${where.join(' and ')} order by ${order} limit $${params.length - 1} offset $${params.length}`, params);
    return { posts: rows.slice(0, limit).map(row => postView(req, row)), nextOffset: rows.length > limit ? offset + limit : null };
  });

  // ---------- creator studio ----------
  app.get('/v1/me/posts', { preHandler: requireUser }, async req => {
    const { rows } = await pool.query(`${POST_SELECT} where p.user_id = $1 order by p.created_at desc limit 200`, [req.user.id]);
    return { posts: rows.map(row => postView(req, row)) };
  });

  app.post('/v1/posts', { preHandler: requireUser }, async (req, reply) => {
    if (!uploadLimiter(`upload:${req.user.id}`)) return fail(reply, 429, 'Upload limit reached. Try again later.');
    const file = await req.file();
    if (!file) return fail(reply, 400, 'Attach a video or image.');
    const type = MEDIA_TYPES[file.mimetype];
    if (!type) {
      file.file.resume();
      return fail(reply, 415, 'Upload an MP4, WebM, MOV, JPG, PNG, GIF, or WebP file.');
    }
    const key = `${randomId(24)}${type.ext}`;
    const bytes = await storage.save(key, file.file);
    if (file.file.truncated) {
      await storage.remove(key);
      return fail(reply, 413, `Files must be under ${Math.round(MAX_MEDIA_BYTES / 1e6)} MB.`);
    }
    const title = String(file.filename || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 120);
    const id = randomId(10);
    try {
      await pool.query(
        `insert into posts (id, user_id, title, media_kind, media_key, media_mime, media_bytes) values ($1, $2, $3, $4, $5, $6, $7)`,
        [id, req.user.id, title, type.kind, key, file.mimetype, bytes]);
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    return reply.code(201).send({ post: postView(req, await loadPost(req, id)) });
  });

  app.patch('/v1/posts/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadOwnPost(req, reply, req.params.id);
    if (!row) return;
    const { values, errors } = normalizePostEdit(req.body || {}, { duration: row.duration });
    if (errors.length) return fail(reply, 400, errors.join(' '));
    if (row.media_kind === 'image') { delete values.trimStart; delete values.trimEnd; delete values.duration; }
    if (row.status === 'published' && 'title' in values && !values.title) return fail(reply, 400, 'Published posts need a title.');
    const columns = {
      title: 'title', description: 'description', filter: 'filter', visibility: 'visibility',
      duration: 'duration', trimStart: 'trim_start', trimEnd: 'trim_end'
    };
    const sets = [];
    const params = [row.id];
    for (const [field, column] of Object.entries(columns)) {
      if (field in values) { params.push(values[field]); sets.push(`${column} = $${params.length}`); }
    }
    if ('fandom' in values) { params.push(await fandomId(values.fandom)); sets.push(`fandom_id = $${params.length}`); }
    if (sets.length) await pool.query(`update posts set ${sets.join(', ')}, updated_at = now() where id = $1`, params);
    return { post: postView(req, await loadPost(req, row.id)) };
  });

  app.post('/v1/posts/:id/cover', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadOwnPost(req, reply, req.params.id);
    if (!row) return;
    const file = await req.file({ limits: { fileSize: MAX_COVER_BYTES, files: 1 } });
    if (!file) return fail(reply, 400, 'Attach a cover image.');
    if (!COVER_TYPES.includes(file.mimetype)) { file.file.resume(); return fail(reply, 415, 'Cover must be JPG, PNG, or WebP.'); }
    const key = `${randomId(24)}${MEDIA_TYPES[file.mimetype].ext}`;
    await storage.save(key, file.file);
    if (file.file.truncated) { await storage.remove(key); return fail(reply, 413, 'Cover must be under 10 MB.'); }
    await pool.query(`update posts set cover_key = $2, cover_mime = $3, updated_at = now() where id = $1`, [row.id, key, file.mimetype]);
    await storage.remove(row.cover_key);
    return { post: postView(req, await loadPost(req, row.id)) };
  });

  app.post('/v1/posts/:id/publish', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadOwnPost(req, reply, req.params.id);
    if (!row) return;
    const visibility = req.body?.visibility ?? (row.visibility === 'private' && row.status === 'draft' ? 'public' : row.visibility);
    const { errors } = normalizePostEdit({ visibility });
    if (errors.length) return fail(reply, 400, errors.join(' '));
    if (!row.title.trim()) return fail(reply, 400, 'Add a title before publishing.');
    await pool.query(
      `update posts set status = 'published', visibility = $2, published_at = coalesce(published_at, now()), updated_at = now() where id = $1`,
      [row.id, visibility]);
    return { post: postView(req, await loadPost(req, row.id)) };
  });

  app.post('/v1/posts/:id/unpublish', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadOwnPost(req, reply, req.params.id);
    if (!row) return;
    await pool.query(`update posts set status = 'draft', updated_at = now() where id = $1`, [row.id]);
    return { post: postView(req, await loadPost(req, row.id)) };
  });

  app.delete('/v1/posts/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadOwnPost(req, reply, req.params.id);
    if (!row) return;
    await pool.query(`delete from posts where id = $1`, [row.id]);
    await Promise.all([storage.remove(row.media_key), storage.remove(row.cover_key)]);
    return reply.code(204).send();
  });

  // ---------- viewing & engagement ----------
  app.get('/v1/posts/:id', async (req, reply) => {
    const row = await loadVisiblePost(req, reply, req.params.id);
    if (!row) return;
    return { post: postView(req, row) };
  });

  app.post('/v1/posts/:id/view', async (req, reply) => {
    const row = await loadVisiblePost(req, reply, req.params.id);
    if (!row) return;
    if (row.status === 'published' && viewLimiter(`view:${row.id}:${req.user?.id ?? req.ip}`)) {
      await pool.query(`update posts set view_count = view_count + 1 where id = $1`, [row.id]);
    }
    return reply.code(204).send();
  });

  app.post('/v1/posts/:id/vote', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadVisiblePost(req, reply, req.params.id);
    if (!row) return;
    if (row.status !== 'published') return fail(reply, 400, 'Drafts cannot be voted on.');
    const up = req.body?.value === undefined ? !row.viewer_voted : Boolean(Number(req.body.value));
    const client = await pool.connect();
    try {
      await client.query('begin');
      const change = up
        ? await client.query(`insert into votes (post_id, user_id) values ($1, $2) on conflict do nothing`, [row.id, req.user.id])
        : await client.query(`delete from votes where post_id = $1 and user_id = $2`, [row.id, req.user.id]);
      const { rows } = await client.query(
        `update posts set score = score + $2 where id = $1 returning score`, [row.id, change.rowCount ? (up ? 1 : -1) : 0]);
      await client.query('commit');
      return { score: rows[0].score, viewerHasVoted: up };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  });

  const commentView = (row, req, postOwnerId) => ({
    id: Number(row.id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    body: row.deleted_at ? null : row.body,
    deleted: Boolean(row.deleted_at),
    createdAt: row.created_at,
    author: row.deleted_at ? null : { handle: row.handle, displayName: row.display_name },
    canDelete: !row.deleted_at && Boolean(req.user && (Number(row.user_id) === req.user.id || postOwnerId === req.user.id))
  });

  app.get('/v1/posts/:id/comments', async (req, reply) => {
    const post = await loadVisiblePost(req, reply, req.params.id);
    if (!post) return;
    const { rows } = await pool.query(`
      select c.*, u.handle, u.display_name from comments c join users u on u.id = c.user_id
      where c.post_id = $1 order by c.created_at asc limit 1000`, [post.id]);
    return { comments: rows.map(row => commentView(row, req, Number(post.user_id))) };
  });

  app.post('/v1/posts/:id/comments', { preHandler: requireUser }, async (req, reply) => {
    if (!commentLimiter(`comment:${req.user.id}`)) return fail(reply, 429, 'Slow down a little.');
    const post = await loadVisiblePost(req, reply, req.params.id);
    if (!post) return;
    if (post.status !== 'published') return fail(reply, 400, 'Comments open once the post is published.');
    const body = String(req.body?.body || '').trim();
    if (!body) return fail(reply, 400, 'Write something first.');
    if (body.length > 2000) return fail(reply, 400, 'Comments must be 2000 characters or fewer.');
    let parentId = req.body?.parentId ? Number(req.body.parentId) : null;
    if (parentId) {
      const { rows } = await pool.query(`select id, parent_id from comments where id = $1 and post_id = $2`, [parentId, post.id]);
      if (!rows[0]) return fail(reply, 400, 'That comment no longer exists.');
      // Keep threads one level deep: replies to replies attach to the top-level comment.
      parentId = Number(rows[0].parent_id ?? rows[0].id);
    }
    const { rows } = await pool.query(`
      with inserted as (insert into comments (post_id, user_id, parent_id, body) values ($1, $2, $3, $4) returning *),
      bump as (update posts set comment_count = comment_count + 1 where id = $1)
      select i.*, u.handle, u.display_name from inserted i join users u on u.id = i.user_id`,
      [post.id, req.user.id, parentId, body]);
    return reply.code(201).send({ comment: commentView(rows[0], req, Number(post.user_id)) });
  });

  app.delete('/v1/comments/:id', { preHandler: requireUser }, async (req, reply) => {
    const { rows } = await pool.query(`
      select c.*, p.user_id as post_owner_id from comments c join posts p on p.id = c.post_id
      where c.id = $1 and c.deleted_at is null`, [Number(req.params.id) || 0]);
    const row = rows[0];
    if (!row || (Number(row.user_id) !== req.user.id && Number(row.post_owner_id) !== req.user.id)) return fail(reply, 404, 'Comment not found.');
    await pool.query(`update comments set deleted_at = now(), body = null where id = $1`, [row.id]);
    await pool.query(`update posts set comment_count = greatest(comment_count - 1, 0) where id = $1`, [row.post_id]);
    return reply.code(204).send();
  });

  // ---------- media delivery ----------
  app.get('/media/:key', async (req, reply) => {
    const { key } = req.params;
    if (!MEDIA_KEY_RE.test(key)) return fail(reply, 404, 'Not found.');
    const { rows } = await pool.query(`
      select status, visibility, case when media_key = $1 then media_mime else cover_mime end as mime
      from posts where media_key = $1 or cover_key = $1`, [key]);
    const row = rows[0];
    if (!row) return fail(reply, 404, 'Not found.');
    const open = row.status === 'published' && row.visibility === 'public';
    if (!open && !verifyMediaSig(key, req.query.exp, req.query.sig, mediaSecret)) return fail(reply, 403, 'This link has expired.');
    const size = await storage.size(key);
    if (size === null) return fail(reply, 404, 'Not found.');
    const range = parseRange(req.headers.range, size);
    reply
      .header('content-type', row.mime)
      .header('accept-ranges', 'bytes')
      .header('cache-control', open ? 'public, max-age=86400' : 'private, max-age=3600');
    if (range === 'invalid') return reply.code(416).header('content-range', `bytes */${size}`).send();
    if (range) {
      reply.code(206)
        .header('content-range', `bytes ${range.start}-${range.end}/${size}`)
        .header('content-length', range.end - range.start + 1);
      return reply.send(storage.read(key, range));
    }
    reply.header('content-length', size);
    return reply.send(storage.read(key));
  });

  app.setErrorHandler((error, req, reply) => {
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') return fail(reply, 413, 'That file is too large.');
    if (error.statusCode && error.statusCode < 500) return fail(reply, error.statusCode, error.message);
    req.log.error(error);
    return fail(reply, 500, 'Something went wrong on our side.');
  });

  return app;
}

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, extname, join } from 'node:path';
import { migrate, pool } from './db.js';

const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
const uploadDir = process.env.UPLOAD_DIR || './uploads';
mkdirSync(uploadDir, { recursive: true });
const secret = new TextEncoder().encode(process.env.JWT_SECRET || randomBytes(32).toString('hex'));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://thefuturebasics.com').split(',').map(x => x.trim());

await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)), credentials: true });
await app.register(multipart, {
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 25_000_000), files: 1 },
  attachFieldsToBody: false
});

const hash = value => createHash('sha256').update(value).digest('hex');
const cleanName = value => basename(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-160);
const allowedExtensions = new Set(['.pdf','.ai','.png','.jpg','.jpeg','.svg','.zip']);

async function authenticate(req, reply) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply.code(401).send({ error: 'Authentication required' });
  try { req.auth = (await jwtVerify(token, secret, { issuer: 'future-basics-client-hub' })).payload; }
  catch { return reply.code(401).send({ error: 'Invalid or expired session' }); }
}

async function sendCode(email, code) {
  if (process.env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.AUTH_FROM_EMAIL || 'Future Basics <hub@thefuturebasics.com>',
        to: [email], subject: 'Your Future Basics sign-in code',
        html: `<p>Your sign-in code is <strong>${code}</strong>. It expires in 10 minutes.</p>`
      })
    });
    if (!response.ok) throw new Error(`Email delivery failed: ${response.status}`);
  } else {
    app.log.warn({ email, code }, 'RESEND_API_KEY missing; login code logged for setup testing');
  }
}

app.get('/health', async () => {
  await pool.query('select 1');
  return { ok: true, service: 'client-hub-api' };
});

app.post('/v1/auth/code', async (req, reply) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!domain) return reply.code(400).send({ error: 'Valid email required' });
  const client = await pool.query('select * from clients where $1 = any(email_domains)', [domain]);
  if (!client.rowCount) return reply.code(403).send({ error: 'Email domain is not assigned to a client' });
  const code = String(randomInt(100000, 1000000));
  await pool.query('insert into login_codes(email,code_hash,expires_at) values($1,$2,now()+interval \'10 minutes\')', [email, hash(code)]);
  await sendCode(email, code);
  return reply.code(202).send({ ok: true });
});

app.post('/v1/auth/verify', async (req, reply) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '');
  const result = await pool.query(
    `update login_codes set consumed_at=now() where id=(
      select id from login_codes where email=$1 and code_hash=$2 and consumed_at is null and expires_at>now()
      order by created_at desc limit 1) returning id`, [email, hash(code)]
  );
  if (!result.rowCount) return reply.code(401).send({ error: 'Invalid or expired code' });
  const domain = email.split('@')[1];
  const client = (await pool.query('select * from clients where $1=any(email_domains)', [domain])).rows[0];
  const user = (await pool.query(
    `insert into users(client_id,email) values($1,$2) on conflict(email)
     do update set client_id=excluded.client_id returning *`, [client.id, email]
  )).rows[0];
  const token = await new SignJWT({ sub: user.id, clientId: client.id, client: client.slug, role: user.role, email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
  return { token, user: { id: user.id, email, role: user.role }, client: { id: client.id, slug: client.slug, name: client.name } };
});

app.get('/v1/dashboard', { preHandler: authenticate }, async req => {
  const id = req.auth.clientId;
  const [requests, invoices, projects] = await Promise.all([
    pool.query('select * from requests where client_id=$1 order by created_at desc', [id]),
    pool.query('select * from invoices where client_id=$1 order by due_date desc nulls last', [id]),
    pool.query('select * from projects where client_id=$1 order by updated_at desc', [id])
  ]);
  return { requests: requests.rows, invoices: invoices.rows, projects: projects.rows };
});

app.post('/v1/requests', { preHandler: authenticate }, async (req, reply) => {
  const { type, title, details, dueDate } = req.body || {};
  if (!type || !title || !details) return reply.code(400).send({ error: 'type, title, and details are required' });
  const row = (await pool.query(
    'insert into requests(client_id,user_id,type,title,details,due_date) values($1,$2,$3,$4,$5,$6) returning *',
    [req.auth.clientId, req.auth.sub, type, title, details, dueDate || null]
  )).rows[0];
  return reply.code(201).send(row);
});

app.post('/v1/requests/:id/files', { preHandler: authenticate }, async (req, reply) => {
  const request = await pool.query('select id from requests where id=$1 and client_id=$2', [req.params.id, req.auth.clientId]);
  if (!request.rowCount) return reply.code(404).send({ error: 'Request not found' });
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: 'One file is required' });
  const originalName = cleanName(part.filename);
  if (!allowedExtensions.has(extname(originalName).toLowerCase())) return reply.code(415).send({ error: 'Allowed: PDF, AI, PNG, JPG, SVG, ZIP' });
  const storageName = `${randomBytes(18).toString('hex')}-${originalName}`;
  const path = join(uploadDir, storageName);
  try {
    await pipeline(part.file, createWriteStream(path, { flags: 'wx' }));
    const row = (await pool.query(
      'insert into files(client_id,request_id,uploader_id,original_name,storage_name,mime_type,size_bytes) values($1,$2,$3,$4,$5,$6,$7) returning id,original_name,mime_type,size_bytes,created_at',
      [req.auth.clientId, req.params.id, req.auth.sub, originalName, storageName, part.mimetype, part.file.bytesRead]
    )).rows[0];
    return reply.code(201).send(row);
  } catch (error) { await unlink(path).catch(()=>{}); throw error; }
});

app.setErrorHandler((error, req, reply) => {
  req.log.error(error);
  reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : 'Internal server error' });
});

await migrate();
await app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });

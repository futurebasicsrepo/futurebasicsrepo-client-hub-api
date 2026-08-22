import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
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
function adminOnly(req,reply){if(req.auth?.role!=='admin')return reply.code(403).send({error:'Future Basics admin access required'});}

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
  const role=domain==='thefuturebasics.com'?'admin':'client';
  const user = (await pool.query(
    `insert into users(client_id,email,role) values($1,$2,$3) on conflict(email)
     do update set client_id=excluded.client_id,role=excluded.role returning *`, [client.id, email, role]
  )).rows[0];
  const token = await new SignJWT({ sub: user.id, clientId: client.id, client: client.slug, role: user.role, email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
  return { token, user: { id: user.id, email, role: user.role }, client: { id: client.id, slug: client.slug, name: client.name } };
});

app.get('/admin', async (_req,reply)=>reply.type('text/html').send(readFileSync(new URL('./admin.html',import.meta.url),'utf8')));
app.get('/v1/admin/dashboard', {preHandler:[authenticate,adminOnly]}, async ()=>{
  const clients=await pool.query(`select c.*,count(distinct p.id)::int product_count,count(distinct r.id)::int request_count
    from clients c left join products p on p.client_id=c.id left join requests r on r.client_id=c.id
    where c.slug<>'future-basics' group by c.id order by c.name`);
  const actions=await pool.query(`select a.id,a.title,a.status,p.title product_title,c.name client_name
    from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id
    where a.status='pending' order by a.requested_at`);
  return {clients:clients.rows,actions:actions.rows};
});
app.post('/v1/admin/clients',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,slug,emailDomains=[]}=req.body||{};if(!name||!slug)return reply.code(400).send({error:'name and slug required'});
  return (await pool.query('insert into clients(name,slug,email_domains) values($1,$2,$3) returning *',[name,slug,emailDomains])).rows[0];
});
app.post('/v1/admin/clients/:id/products',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {title,handle}=req.body||{};if(!title)return reply.code(400).send({error:'title required'});
  const p=(await pool.query('insert into products(client_id,title,shopify_handle) values($1,$2,$3) returning *',[req.params.id,title,handle||null])).rows[0];
  await pool.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
    from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)`,[p.id]);
  return p;
});
app.patch('/v1/admin/products/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {stage,riskLevel,owner,targetDate}=req.body||{};
  const p=(await pool.query(`update products set current_stage=coalesce($1,current_stage),risk_level=coalesce($2,risk_level),
    owner=coalesce($3,owner),target_date=coalesce($4,target_date),updated_at=now() where id=$5 returning *`,
    [stage||null,riskLevel||null,owner||null,targetDate||null,req.params.id])).rows[0];
  if(!p)return reply.code(404).send({error:'Product not found'});return p;
});

app.get('/v1/dashboard', { preHandler: authenticate }, async req => {
  const id = req.auth.clientId;
  const [requests, invoices, projects, products, approvals, activities] = await Promise.all([
    pool.query('select * from requests where client_id=$1 order by created_at desc', [id]),
    pool.query('select * from invoices where client_id=$1 order by due_date desc nulls last', [id]),
    pool.query('select * from projects where client_id=$1 order by updated_at desc', [id]),
    pool.query(`select p.*, coalesce(json_agg(m order by m.sort_order) filter(where m.id is not null),'[]') milestones
      from products p left join milestones m on m.product_id=p.id where p.client_id=$1 group by p.id order by p.updated_at desc`, [id]),
    pool.query(`select a.*, p.title product_title from approvals a join products p on p.id=a.product_id
      where p.client_id=$1 and a.status='pending' order by a.requested_at`, [id]),
    pool.query('select * from activities where client_id=$1 order by created_at desc limit 50', [id])
  ]);
  return { requests: requests.rows, invoices: invoices.rows, projects: projects.rows, products: products.rows,
    approvals: approvals.rows, activities: activities.rows,
    actions: [
      ...approvals.rows.map(a=>({type:'approval',id:a.id,title:'Approve '+a.product_title+' — '+a.title,due:null})),
      ...invoices.rows.filter(x=>x.status==='due').map(x=>({type:'invoice',id:x.id,title:'Invoice '+x.number+' due',due:x.due_date}))
    ] };
});

app.get('/v1/products/:id', { preHandler: authenticate }, async (req, reply) => {
  const product=(await pool.query('select * from products where id=$1 and client_id=$2',[req.params.id,req.auth.clientId])).rows[0];
  if(!product)return reply.code(404).send({error:'Product not found'});
  const [milestones,quotes,approvals,files,activity]=await Promise.all([
    pool.query('select * from milestones where product_id=$1 order by sort_order',[product.id]),
    pool.query('select * from quotes where product_id=$1 order by version desc',[product.id]),
    pool.query('select * from approvals where product_id=$1 order by requested_at desc',[product.id]),
    pool.query(`select f.* from files f join requests r on r.id=f.request_id
      where r.product_id=$1 and r.client_id=$2 order by f.created_at desc`,[product.id,req.auth.clientId]),
    pool.query('select * from activities where product_id=$1 order by created_at desc',[product.id])
  ]);
  return {product,milestones:milestones.rows,quotes:quotes.rows,approvals:approvals.rows,files:files.rows,activity:activity.rows};
});

app.post('/v1/approvals/:id/decision', { preHandler: authenticate }, async (req, reply) => {
  const decision=String(req.body?.decision||'');
  if(!['approved','changes-requested'].includes(decision))return reply.code(400).send({error:'decision must be approved or changes-requested'});
  const row=(await pool.query(`update approvals a set status=$1,notes=$2,decided_by=$3,decided_at=now()
    from products p where a.id=$4 and a.product_id=p.id and p.client_id=$5 and a.status='pending' returning a.*`,
    [decision,req.body?.notes||null,req.auth.sub,req.params.id,req.auth.clientId])).rows[0];
  if(!row)return reply.code(404).send({error:'Pending approval not found'});
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',
    [req.auth.clientId,row.product_id,req.auth.sub,'approval',decision==='approved'?'Approved '+row.title:'Requested changes to '+row.title]);
  return row;
});

app.post('/v1/requests', { preHandler: authenticate }, async (req, reply) => {
  const { type, title, details, dueDate, productId } = req.body || {};
  if (!type || !title || !details) return reply.code(400).send({ error: 'type, title, and details are required' });
  const row = (await pool.query(
    `insert into requests(client_id,user_id,type,title,details,due_date,product_id)
     select $1,$2,$3,$4,$5,$6,p.id from products p where p.id=$7 and p.client_id=$1 returning *`,
    [req.auth.clientId, req.auth.sub, type, title, details, dueDate || null, productId || null]
  )).rows[0];
  if(!row)return reply.code(400).send({error:'Select a valid product'});
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

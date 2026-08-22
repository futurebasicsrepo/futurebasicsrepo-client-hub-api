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
import { shopifyConfigured, shopifyGraphql, PRODUCT_SYNC_QUERY, DRAFT_ORDER_CREATE, DRAFT_INVOICE_SEND, DRAFT_ORDER_STATUS, requireNoUserErrors } from './shopify.js';

const app = Fastify({ logger: true, bodyLimit: 1_000_000 });
const uploadDir = process.env.UPLOAD_DIR || './uploads';
mkdirSync(uploadDir, { recursive: true });
const secret = new TextEncoder().encode(process.env.JWT_SECRET || randomBytes(32).toString('hex'));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://thefuturebasics.com').split(',').map(x => x.trim());

await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || (origin==='null' && process.env.DEV_BYPASS_AUTH==='true')), credentials: true });
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
async function adminOnly(req,reply){if(req.auth?.role!=='admin')return reply.code(403).send({error:'Future Basics admin access required'});}

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
app.post('/v1/dev/session',async(req,reply)=>{
  if(process.env.DEV_BYPASS_AUTH!=='true')return reply.code(404).send({error:'Not found'});
  const admin=req.body?.mode==='admin',slug=admin?'future-basics':'ouster';
  const client=(await pool.query('select * from clients where slug=$1',[slug])).rows[0];
  const email=admin?'preview@thefuturebasics.com':'preview@ouster.com',role=admin?'admin':'client';
  const user=(await pool.query(`insert into users(client_id,email,role)values($1,$2,$3)on conflict(email)
    do update set client_id=excluded.client_id,role=excluded.role returning *`,[client.id,email,role])).rows[0];
  const token=await new SignJWT({sub:user.id,clientId:client.id,client:client.slug,role,email})
    .setProtectedHeader({alg:'HS256'}).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
  return {token,developmentBypass:true};
});

app.get('/admin', async (_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./admin.html',import.meta.url),'utf8')));
app.get('/v1/admin/dashboard', {preHandler:[authenticate,adminOnly]}, async ()=>{
  const clients=await pool.query(`select c.*,count(distinct p.id)::int product_count,count(distinct r.id)::int request_count
    from clients c left join products p on p.client_id=c.id left join requests r on r.client_id=c.id
    where c.slug<>'future-basics' group by c.id order by c.name`);
  const actions=await pool.query(`select a.id,a.title,a.status,p.title product_title,c.name client_name
    from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id
    where a.status='pending' order by a.requested_at`);
  return {clients:clients.rows,actions:actions.rows};
});
app.get('/v1/admin/shopify/status',{preHandler:[authenticate,adminOnly]},async()=>({
  connected:shopifyConfigured(),
  storeDomain:process.env.SHOPIFY_STORE_DOMAIN||'thefuturebasics.com',
  apiVersion:process.env.SHOPIFY_API_VERSION||'2026-07',
  requiredScopes:['read_products','read_inventory','write_draft_orders','read_draft_orders','read_orders']
}));
app.post('/v1/admin/shopify/sync',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select * from clients where id=$1',[req.body?.clientId])).rows[0];
  if(!client)return reply.code(404).send({error:'Client not found'});
  const query=String(req.body?.query||`tag:${client.slug}`);
  const data=await shopifyGraphql(PRODUCT_SYNC_QUERY,{query});
  const synced=[];
  for(const item of data.products.nodes){
    const variants=item.variants.nodes||[],primary=variants[0]||null;
    const product=(await pool.query(`insert into products(client_id,shopify_product_id,shopify_variant_id,shopify_handle,title,shopify_status,shopify_inventory_total,shopify_variants,shopify_synced_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,now()) on conflict(client_id,shopify_handle) do update set shopify_product_id=excluded.shopify_product_id,
      shopify_variant_id=excluded.shopify_variant_id,title=excluded.title,shopify_status=excluded.shopify_status,shopify_inventory_total=excluded.shopify_inventory_total,
      shopify_variants=excluded.shopify_variants,shopify_synced_at=now(),updated_at=now() returning *`,
      [client.id,item.id,primary?.id||null,item.handle,item.title,item.status,item.totalInventory,JSON.stringify(variants)])).rows[0];
    await pool.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
      from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)
      where not exists(select 1 from milestones where product_id=$1)`,[product.id]);
    synced.push({id:product.id,title:product.title,inventory:product.shopify_inventory_total,variants:variants.length});
  }
  return {query,count:synced.length,products:synced,syncedAt:new Date().toISOString()};
});
app.post('/v1/admin/clients',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,slug,emailDomains=[]}=req.body||{};if(!name||!slug)return reply.code(400).send({error:'name and slug required'});
  return (await pool.query('insert into clients(name,slug,email_domains) values($1,$2,$3) returning *',[name,slug,emailDomains])).rows[0];
});
app.post('/v1/admin/clients/:id/products',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {title,handle,shopifyProductId}=req.body||{};if(!title)return reply.code(400).send({error:'title required'});
  const p=(await pool.query('insert into products(client_id,title,shopify_handle,shopify_product_id) values($1,$2,$3,$4) returning *',[req.params.id,title,handle||null,shopifyProductId||null])).rows[0];
  await pool.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
    from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)`,[p.id]);
  return p;
});
app.patch('/v1/admin/products/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {stage,riskLevel,owner,targetDate,shopifyProductId,shopifyHandle}=req.body||{};
  const p=(await pool.query(`update products set current_stage=coalesce($1,current_stage),risk_level=coalesce($2,risk_level),
    owner=coalesce($3,owner),target_date=coalesce($4,target_date),shopify_product_id=coalesce($5,shopify_product_id),
    shopify_handle=coalesce($6,shopify_handle),updated_at=now() where id=$7 returning *`,
    [stage||null,riskLevel||null,owner||null,targetDate||null,shopifyProductId||null,shopifyHandle||null,req.params.id])).rows[0];
  if(!p)return reply.code(404).send({error:'Product not found'});return p;
});
app.put('/v1/admin/products/:id/brief',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {objective,audience,targetQuantity,targetBudgetCents,deliveryDate,decoration,packaging,fulfillment,notes,status='draft'}=req.body||{};
  const product=(await pool.query('select id,client_id from products where id=$1',[req.params.id])).rows[0];
  if(!product)return reply.code(404).send({error:'Product not found'});
  const brief=(await pool.query(`insert into product_briefs(product_id,objective,audience,target_quantity,target_budget_cents,delivery_date,decoration,packaging,fulfillment,notes,status)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict(product_id) do update set objective=excluded.objective,audience=excluded.audience,
    target_quantity=excluded.target_quantity,target_budget_cents=excluded.target_budget_cents,delivery_date=excluded.delivery_date,decoration=excluded.decoration,
    packaging=excluded.packaging,fulfillment=excluded.fulfillment,notes=excluded.notes,status=excluded.status,updated_at=now() returning *`,
    [product.id,objective||null,audience||null,targetQuantity||null,targetBudgetCents||null,deliveryDate||null,decoration||null,packaging||null,fulfillment||null,notes||null,status])).rows[0];
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'brief','Updated product brief']);
  return brief;
});
app.get('/v1/admin/clients/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select * from clients where id=$1',[req.params.id])).rows[0];
  if(!client)return reply.code(404).send({error:'Client not found'});
  const [products,requests,invoices,users,quotes]=await Promise.all([
    pool.query(`select p.*,to_jsonb(b) brief,coalesce(json_agg(m order by m.sort_order)filter(where m.id is not null),'[]') milestones
      from products p left join product_briefs b on b.product_id=p.id left join milestones m on m.product_id=p.id
      where p.client_id=$1 group by p.id,b.product_id order by p.updated_at desc`,[client.id]),
    pool.query('select * from requests where client_id=$1 order by created_at desc',[client.id]),
    pool.query('select * from invoices where client_id=$1 order by created_at desc',[client.id]),
    pool.query('select id,email,name,role,created_at from users where client_id=$1 order by created_at',[client.id]),
    pool.query(`select q.* from quotes q join products p on p.id=q.product_id where p.client_id=$1 order by q.created_at desc`,[client.id])
  ]);return {client,products:products.rows,requests:requests.rows,invoices:invoices.rows,users:users.rows,quotes:quotes.rows};
});
app.patch('/v1/admin/clients/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,status,emailDomains}=req.body||{};return (await pool.query(`update clients set name=coalesce($1,name),status=coalesce($2,status),
    email_domains=coalesce($3,email_domains) where id=$4 returning *`,[name||null,status||null,emailDomains||null,req.params.id])).rows[0];
});
app.patch('/v1/admin/milestones/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {status,dueDate,responsibleParty,notes,required,clientVisible}=req.body||{};return (await pool.query(`update milestones set status=coalesce($1,status),due_date=coalesce($2,due_date),
    responsible_party=coalesce($3,responsible_party),notes=coalesce($4,notes),required=coalesce($5,required),client_visible=coalesce($6,client_visible),
    completed_at=case when $1='complete' then now() when $1 is not null then null else completed_at end where id=$7 returning *`,
    [status||null,dueDate||null,responsibleParty||null,notes||null,typeof required==='boolean'?required:null,typeof clientVisible==='boolean'?clientVisible:null,req.params.id])).rows[0];
});
app.post('/v1/admin/products/:id/quotes',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {quantity,unitCostCents,toolingCents=0,freightCents=0,wholesaleCents,srpCents,expiresAt,notes}=req.body||{};
  const version=(await pool.query('select coalesce(max(version),0)+1 v from quotes where product_id=$1',[req.params.id])).rows[0].v;
  return reply.code(201).send((await pool.query(`insert into quotes(product_id,version,quantity,unit_cost_cents,tooling_cents,freight_cents,wholesale_cents,srp_cents,expires_at,notes,status)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'issued') returning *`,[req.params.id,version,quantity,unitCostCents,toolingCents,freightCents,wholesaleCents||null,srpCents||null,expiresAt||null,notes||null])).rows[0]);
});
app.post('/v1/admin/products/:id/shopify-draft-order',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`select q.*,p.title product_title,p.shopify_variant_id,p.client_id,c.name client_name,c.shopify_customer_id
    from quotes q join products p on p.id=q.product_id join clients c on c.id=p.client_id where q.id=$1 and p.id=$2`,[req.body?.quoteId,req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Quote not found'});
  if(row.shopify_draft_order_id)return reply.code(409).send({error:'This quote already has a Shopify draft order'});
  const unitCents=row.wholesale_cents||row.unit_cost_cents;
  const line={quantity:row.quantity,priceOverride:{amount:(unitCents/100).toFixed(2),currencyCode:row.currency}};
  if(row.shopify_variant_id)line.variantId=row.shopify_variant_id;else{line.title=row.product_title;line.requiresShipping=true;}
  const input={lineItems:[line],email:req.body?.email||undefined,customerId:row.shopify_customer_id||undefined,
    note:req.body?.note||`Future Basics client hub quote v${row.version}`,tags:['future-basics-client-hub',`client-${row.client_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`],visibleToCustomer:true};
  const result=requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE,{input})).draftOrderCreate),draft=result.draftOrder;
  const updated=(await pool.query(`update quotes set shopify_draft_order_id=$1,shopify_draft_order_name=$2,shopify_draft_order_status=$3,
    shopify_invoice_url=$4,shopify_synced_at=now() where id=$5 returning *`,[draft.id,draft.name,draft.status,draft.invoiceUrl,row.id])).rows[0];
  await pool.query(`insert into invoices(client_id,number,amount_cents,status,external_url) values($1,$2,$3,'draft',$4)
    on conflict(client_id,number) do update set amount_cents=excluded.amount_cents,status='draft',external_url=excluded.external_url`,
    [row.client_id,draft.name,row.quantity*unitCents,draft.invoiceUrl]);
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[row.client_id,req.params.id,req.auth.sub,'commerce',`Created Shopify draft order ${draft.name}`]);
  return updated;
});
app.post('/v1/admin/quotes/:id/send-shopify-invoice',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const quote=(await pool.query('select q.*,p.client_id,p.id product_id from quotes q join products p on p.id=q.product_id where q.id=$1',[req.params.id])).rows[0];
  if(!quote?.shopify_draft_order_id)return reply.code(400).send({error:'Create a Shopify draft order first'});
  const email=req.body?.subject||req.body?.message?{to:req.body?.to||undefined,subject:req.body?.subject||undefined,customMessage:req.body?.message||undefined}:undefined;
  const result=requireNoUserErrors((await shopifyGraphql(DRAFT_INVOICE_SEND,{id:quote.shopify_draft_order_id,email})).draftOrderInvoiceSend),draft=result.draftOrder;
  const updated=(await pool.query(`update quotes set shopify_draft_order_status=$1,shopify_invoice_url=$2,shopify_invoice_sent_at=now(),shopify_synced_at=now()
    where id=$3 returning *`,[draft.status,draft.invoiceUrl,quote.id])).rows[0];
  await pool.query(`update invoices set status='due',external_url=$1 where client_id=$2 and number=$3`,[draft.invoiceUrl,quote.client_id,draft.name]);
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[quote.client_id,quote.product_id,req.auth.sub,'commerce',`Sent Shopify invoice ${draft.name}`]);
  return updated;
});
app.post('/v1/admin/shopify/sync-commerce',{preHandler:[authenticate,adminOnly]},async()=>{
  const quotes=(await pool.query('select q.*,p.client_id,p.id product_id from quotes q join products p on p.id=q.product_id where q.shopify_draft_order_id is not null')).rows;
  const synced=[];
  for(const quote of quotes){
    const draft=(await shopifyGraphql(DRAFT_ORDER_STATUS,{id:quote.shopify_draft_order_id})).draftOrder;if(!draft)continue;
    const financial=draft.order?.displayFinancialStatus||null,fulfillment=draft.order?.displayFulfillmentStatus||null;
    await pool.query(`update quotes set shopify_draft_order_status=$1,shopify_invoice_url=$2,shopify_order_id=$3,shopify_financial_status=$4,
      shopify_fulfillment_status=$5,shopify_synced_at=now() where id=$6`,[draft.status,draft.invoiceUrl,draft.order?.id||null,financial,fulfillment,quote.id]);
    const invoiceStatus=financial==='PAID'?'paid':draft.status==='INVOICE_SENT'?'due':draft.status==='COMPLETED'?'paid':'draft';
    await pool.query('update invoices set status=$1,external_url=coalesce($2,external_url) where client_id=$3 and number=$4',[invoiceStatus,draft.invoiceUrl,quote.client_id,draft.name]);
    synced.push({quoteId:quote.id,draftOrder:draft.name,status:draft.status,financialStatus:financial,fulfillmentStatus:fulfillment});
  }
  return {count:synced.length,quotes:synced,syncedAt:new Date().toISOString()};
});
app.post('/v1/admin/products/:id/approvals',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {title,kind='artwork',version='v1',notes}=req.body||{};
  return reply.code(201).send((await pool.query(`insert into approvals(product_id,requested_by,title,kind,version,notes)
    values($1,$2,$3,$4,$5,$6) returning *`,[req.params.id,req.auth.sub,title,kind,version,notes||null])).rows[0]);
});
app.post('/v1/admin/clients/:id/invoices',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {number,amountCents,status='due',dueDate,externalUrl}=req.body||{};
  return reply.code(201).send((await pool.query(`insert into invoices(client_id,number,amount_cents,status,due_date,external_url)
    values($1,$2,$3,$4,$5,$6) returning *`,[req.params.id,number,amountCents,status,dueDate||null,externalUrl||null])).rows[0]);
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
  const [brief,milestones,quotes,approvals,files,activity]=await Promise.all([
    pool.query('select * from product_briefs where product_id=$1',[product.id]),
    pool.query('select * from milestones where product_id=$1 order by sort_order',[product.id]),
    pool.query('select * from quotes where product_id=$1 order by version desc',[product.id]),
    pool.query('select * from approvals where product_id=$1 order by requested_at desc',[product.id]),
    pool.query(`select f.* from files f join requests r on r.id=f.request_id
      where r.product_id=$1 and r.client_id=$2 order by f.created_at desc`,[product.id,req.auth.clientId]),
    pool.query('select * from activities where product_id=$1 order by created_at desc',[product.id])
  ]);
  return {product,brief:brief.rows[0]||null,milestones:milestones.rows,quotes:quotes.rows,approvals:approvals.rows,files:files.rows,activity:activity.rows};
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

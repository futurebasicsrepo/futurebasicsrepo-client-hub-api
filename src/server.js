import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, extname, join } from 'node:path';
import { migrate, pool } from './db.js';
import { shopifyConfigured, shopifyGraphql, SHOP_CONNECTION_QUERY, PRODUCT_SYNC_QUERY, DRAFT_ORDER_CREATE, DRAFT_INVOICE_SEND, DRAFT_ORDER_STATUS, requireNoUserErrors } from './shopify.js';

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
const allowedExtensions = new Set(['.pdf','.ai','.eps','.png','.jpg','.jpeg','.svg','.zip']);

async function authenticate(req, reply) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply.code(401).send({ error: 'Authentication required' });
  try { req.auth = (await jwtVerify(token, secret, { issuer: 'future-basics-client-hub' })).payload; }
  catch { return reply.code(401).send({ error: 'Invalid or expired session' }); }
  if(req.auth.preview&&!['GET','HEAD','OPTIONS'].includes(req.method))return reply.code(403).send({error:'Client preview is read-only'});
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

async function storeAssetVersion(asset,userId,part,notes){
  const originalName=cleanName(part.filename);if(!allowedExtensions.has(extname(originalName).toLowerCase()))throw Object.assign(new Error('Allowed: PDF, AI, EPS, PNG, JPG, SVG, ZIP'),{statusCode:415});
  const storageName=`${randomBytes(18).toString('hex')}-${originalName}`,path=join(uploadDir,storageName);
  const client=await pool.connect();
  try{
    await pipeline(part.file,createWriteStream(path,{flags:'wx'}));
    await client.query('begin');
    const version=(await client.query(`update assets set current_version=current_version+1,
      status=case when status='approved' then 'working' else status end,updated_at=now() where id=$1 returning current_version`,[asset.id])).rows[0].current_version;
    const row=(await client.query(`insert into asset_versions(asset_id,uploader_id,version,original_name,storage_name,mime_type,size_bytes,notes)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[asset.id,userId,version,originalName,storageName,part.mimetype,part.file.bytesRead,notes||null])).rows[0];
    await client.query('commit');return row;
  }catch(error){await client.query('rollback').catch(()=>{});await unlink(path).catch(()=>{});throw error}finally{client.release()}
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
app.post('/v1/preview/session/exchange',async(req,reply)=>{
  const code=String(req.body?.code||'');if(!code)return reply.code(400).send({error:'Preview code required'});
  const row=(await pool.query(`update preview_sessions ps set consumed_at=now() from clients c
    where ps.code_hash=$1 and ps.client_id=c.id and ps.consumed_at is null and ps.expires_at>now()
    returning ps.admin_user_id,ps.client_id,c.slug client_slug,c.name client_name`,[hash(code)])).rows[0];
  if(!row)return reply.code(401).send({error:'Preview link is invalid, expired, or already used'});
  const token=await new SignJWT({sub:row.admin_user_id,clientId:row.client_id,client:row.client_slug,role:'client',preview:true})
    .setProtectedHeader({alg:'HS256'}).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('15m').sign(secret);
  return {token,preview:true,readOnly:true,client:{id:row.client_id,slug:row.client_slug,name:row.client_name}};
});

app.get('/admin', async (_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./admin.html',import.meta.url),'utf8')));
app.post('/v1/admin/clients/:id/preview-session',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select id,slug,name from clients where id=$1 and slug<>\'future-basics\'',[req.params.id])).rows[0];if(!client)return reply.code(404).send({error:'Client not found'});
  const code=randomBytes(32).toString('base64url');await pool.query(`insert into preview_sessions(code_hash,admin_user_id,client_id,expires_at)
    values($1,$2,$3,now()+interval '5 minutes')`,[hash(code),req.auth.sub,client.id]);
  const hubUrl=process.env.CLIENT_HUB_URL||'https://thefuturebasics.com/pages/client-hub';
  return {url:`${hubUrl}#client-preview=${encodeURIComponent(code)}`,expiresInSeconds:300,sessionMinutes:15,client};
});
app.get('/v1/admin/dashboard', {preHandler:[authenticate,adminOnly]}, async ()=>{
  const clients=await pool.query(`select c.*,count(distinct p.id)::int product_count,count(distinct r.id)::int request_count
    from clients c left join products p on p.client_id=c.id left join requests r on r.client_id=c.id
    where c.slug<>'future-basics' group by c.id order by c.name`);
  const actions=await pool.query(`select a.id,a.title,a.status,p.title product_title,c.name client_name,av.version asset_version,ast.name asset_name
    from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id
    left join asset_versions av on av.id=a.asset_version_id left join assets ast on ast.id=av.asset_id
    where a.status='pending' order by a.requested_at`);
  const productionAlerts=await pool.query(`select pr.id,pr.po_number,pr.status,pr.eta_date,p.title product_title,c.name client_name
    from production_runs pr join products p on p.id=pr.product_id join clients c on c.id=p.client_id
    where pr.status in ('blocked','delayed') or (pr.eta_date is not null and pr.eta_date<current_date and pr.status not in ('complete','delivered')) order by pr.eta_date nulls last`);
  const collaboration=await pool.query(`select n.*,c.name client_name from notifications n join clients c on c.id=n.client_id
    where n.read_at is null order by n.created_at desc limit 30`);
  return {clients:clients.rows,actions:actions.rows,productionAlerts:productionAlerts.rows,collaboration:collaboration.rows};
});
app.get('/v1/admin/shopify/status',{preHandler:[authenticate,adminOnly]},async()=>{
  const result={configured:shopifyConfigured(),connected:false,storeDomain:process.env.SHOPIFY_STORE_DOMAIN||'thefuturebasics.com',
    apiVersion:process.env.SHOPIFY_API_VERSION||'2026-07',authentication:process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?'legacy-token':'client-credentials',
    requiredScopes:['read_products','read_inventory','write_draft_orders','read_draft_orders','read_orders']};
  if(!result.configured)return result;
  try{const data=await shopifyGraphql(SHOP_CONNECTION_QUERY);return {...result,connected:true,shopName:data.shop.name,myshopifyDomain:data.shop.myshopifyDomain}}
  catch(error){return {...result,error:error.message}}
});
app.get('/v1/admin/resend/status',{preHandler:[authenticate,adminOnly]},async()=>({
  configured:Boolean(process.env.RESEND_API_KEY&&process.env.AUTH_FROM_EMAIL),
  fromEmail:process.env.AUTH_FROM_EMAIL||null,
  message:process.env.RESEND_API_KEY&&process.env.AUTH_FROM_EMAIL?'Ready for a live sign-in test':'Add RESEND_API_KEY and AUTH_FROM_EMAIL'
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
  const [products,requests,invoices,users,quotes,suppliers,productionRuns,qcInspections,shipments,assets,assetVersions,comments,configurations,priceTiers]=await Promise.all([
    pool.query(`select p.*,to_jsonb(b) brief,coalesce(json_agg(m order by m.sort_order)filter(where m.id is not null),'[]') milestones
      from products p left join product_briefs b on b.product_id=p.id left join milestones m on m.product_id=p.id
      where p.client_id=$1 group by p.id,b.product_id order by p.updated_at desc`,[client.id]),
    pool.query('select * from requests where client_id=$1 order by created_at desc',[client.id]),
    pool.query('select * from invoices where client_id=$1 order by created_at desc',[client.id]),
    pool.query('select id,email,name,role,created_at from users where client_id=$1 order by created_at',[client.id]),
    pool.query(`select q.* from quotes q join products p on p.id=q.product_id where p.client_id=$1 order by q.created_at desc`,[client.id]),
    pool.query('select * from suppliers where status<>\'archived\' order by name'),
    pool.query(`select pr.*,s.name supplier_name from production_runs pr left join suppliers s on s.id=pr.supplier_id
      join products p on p.id=pr.product_id where p.client_id=$1 order by pr.created_at desc`,[client.id]),
    pool.query(`select qi.* from qc_inspections qi join production_runs pr on pr.id=qi.production_run_id join products p on p.id=pr.product_id
      where p.client_id=$1 order by qi.created_at desc`,[client.id]),
    pool.query(`select sh.* from shipments sh join production_runs pr on pr.id=sh.production_run_id join products p on p.id=pr.product_id
      where p.client_id=$1 order by sh.created_at desc`,[client.id]),
    pool.query(`select a.* from assets a join products p on p.id=a.product_id where p.client_id=$1 order by a.updated_at desc`,[client.id]),
    pool.query(`select av.* from asset_versions av join assets a on a.id=av.asset_id join products p on p.id=a.product_id
      where p.client_id=$1 order by av.created_at desc`,[client.id]),
    pool.query(`select co.*,u.email author_email from comments co left join users u on u.id=co.author_id where co.client_id=$1 order by co.created_at desc`,[client.id]),
    pool.query(`select pc.*,s.name supplier_name from product_configurations pc left join suppliers s on s.id=pc.supplier_id
      join products p on p.id=pc.product_id where p.client_id=$1 order by pc.updated_at desc`,[client.id]),
    pool.query(`select pt.* from price_tiers pt join products p on p.id=pt.product_id where p.client_id=$1 order by pt.product_id,pt.min_quantity`,[client.id])
  ]);return {client,products:products.rows,requests:requests.rows,invoices:invoices.rows,users:users.rows,quotes:quotes.rows,
    suppliers:suppliers.rows,productionRuns:productionRuns.rows,qcInspections:qcInspections.rows,shipments:shipments.rows,
    assets:assets.rows,assetVersions:assetVersions.rows,comments:comments.rows,configurations:configurations.rows,priceTiers:priceTiers.rows};
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
app.post('/v1/admin/suppliers',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,contactEmail,contactPhone,country,leadTimeDays,notes}=req.body||{};if(!name)return reply.code(400).send({error:'Supplier name required'});
  return reply.code(201).send((await pool.query(`insert into suppliers(name,contact_email,contact_phone,country,lead_time_days,notes)
    values($1,$2,$3,$4,$5,$6) on conflict(name) do update set contact_email=excluded.contact_email,contact_phone=excluded.contact_phone,
    country=excluded.country,lead_time_days=excluded.lead_time_days,notes=excluded.notes,updated_at=now() returning *`,
    [name,contactEmail||null,contactPhone||null,country||null,leadTimeDays||null,notes||null])).rows[0]);
});
app.put('/v1/admin/products/:id/configuration',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const product=(await pool.query('select id,client_id,title from products where id=$1',[req.params.id])).rows[0];if(!product)return reply.code(404).send({error:'Product not found'});
  const {supplierId,blankName,material,construction,decorationMethod,decorationLocations=[],artworkWidthIn,artworkHeightIn,colorways=[],sizes=[],variantPlan=[],packaging,fulfillment,moq,sampleRequired=true,leadTimeDays,notes,status='draft'}=req.body||{};
  if(!Array.isArray(decorationLocations)||!Array.isArray(colorways)||!Array.isArray(sizes)||!Array.isArray(variantPlan))return reply.code(400).send({error:'Locations, colorways, sizes, and variant plan must be lists'});
  const config=(await pool.query(`insert into product_configurations(product_id,supplier_id,blank_name,material,construction,decoration_method,decoration_locations,
    artwork_width_in,artwork_height_in,colorways,sizes,variant_plan,packaging,fulfillment,moq,sample_required,lead_time_days,notes,status)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    on conflict(product_id) do update set supplier_id=excluded.supplier_id,blank_name=excluded.blank_name,material=excluded.material,
    construction=excluded.construction,decoration_method=excluded.decoration_method,decoration_locations=excluded.decoration_locations,
    artwork_width_in=excluded.artwork_width_in,artwork_height_in=excluded.artwork_height_in,colorways=excluded.colorways,sizes=excluded.sizes,
    variant_plan=excluded.variant_plan,packaging=excluded.packaging,fulfillment=excluded.fulfillment,moq=excluded.moq,
    sample_required=excluded.sample_required,lead_time_days=excluded.lead_time_days,notes=excluded.notes,status=excluded.status,updated_at=now() returning *`,
    [product.id,supplierId||null,blankName||null,material||null,construction||null,decorationMethod||null,decorationLocations,
      artworkWidthIn||null,artworkHeightIn||null,colorways,sizes,JSON.stringify(variantPlan),packaging||null,fulfillment||null,moq||null,
      sampleRequired!==false,leadTimeDays||null,notes||null,status])).rows[0];
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'configuration',`Updated production configuration · ${status}`]);
  return config;
});
app.post('/v1/admin/products/:id/price-tiers',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {minQuantity,maxQuantity,unitCostCents,wholesaleCents,srpCents,setupCents=0,freightCents=0,leadTimeDays,notes}=req.body||{};
  if(!(minQuantity>0)||!(unitCostCents>=0)||!(wholesaleCents>=0)||(maxQuantity&&maxQuantity<minQuantity))return reply.code(400).send({error:'Enter a valid quantity range, unit cost, and wholesale price'});
  return reply.code(201).send((await pool.query(`insert into price_tiers(product_id,min_quantity,max_quantity,unit_cost_cents,wholesale_cents,srp_cents,setup_cents,freight_cents,lead_time_days,notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(product_id,min_quantity) do update set max_quantity=excluded.max_quantity,
    unit_cost_cents=excluded.unit_cost_cents,wholesale_cents=excluded.wholesale_cents,srp_cents=excluded.srp_cents,setup_cents=excluded.setup_cents,
    freight_cents=excluded.freight_cents,lead_time_days=excluded.lead_time_days,notes=excluded.notes,updated_at=now() returning *`,
    [req.params.id,minQuantity,maxQuantity||null,unitCostCents,wholesaleCents,srpCents||null,setupCents,freightCents,leadTimeDays||null,notes||null])).rows[0]);
});
app.post('/v1/admin/products/:id/quotes/from-tier',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const quantity=Number(req.body?.quantity),tier=(await pool.query('select * from price_tiers where id=$1 and product_id=$2',[req.body?.priceTierId,req.params.id])).rows[0];
  if(!tier)return reply.code(404).send({error:'Price tier not found'});if(quantity<tier.min_quantity||(tier.max_quantity&&quantity>tier.max_quantity))return reply.code(400).send({error:'Quantity is outside this price tier'});
  const config=(await pool.query('select * from product_configurations where product_id=$1',[req.params.id])).rows[0];if(!config)return reply.code(400).send({error:'Complete the product configuration first'});
  const version=(await pool.query('select coalesce(max(version),0)+1 v from quotes where product_id=$1',[req.params.id])).rows[0].v;
  const quote=(await pool.query(`insert into quotes(product_id,version,quantity,unit_cost_cents,tooling_cents,freight_cents,wholesale_cents,srp_cents,notes,status,price_tier_id,configuration_snapshot)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,'issued',$10,$11) returning *`,[req.params.id,version,quantity,tier.unit_cost_cents,tier.setup_cents,tier.freight_cents,
      tier.wholesale_cents,tier.srp_cents,req.body?.notes||tier.notes||null,tier.id,JSON.stringify(config)])).rows[0];return reply.code(201).send(quote);
});
app.post('/v1/admin/products/:id/production-runs',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {supplierId,poNumber,quantity,unitCostCents,status='planned',sampleStatus='not-started',exFactoryDate,etaDate,notes,internalNotes}=req.body||{};
  const product=(await pool.query('select id,client_id,title from products where id=$1',[req.params.id])).rows[0];
  if(!product)return reply.code(404).send({error:'Product not found'});if(!quantity)return reply.code(400).send({error:'Quantity required'});
  const run=(await pool.query(`insert into production_runs(product_id,supplier_id,po_number,quantity,unit_cost_cents,status,sample_status,ex_factory_date,eta_date,notes,internal_notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[product.id,supplierId||null,poNumber||null,quantity,unitCostCents||null,status,sampleStatus,
    exFactoryDate||null,etaDate||null,notes||null,internalNotes||null])).rows[0];
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'production',`Opened production run ${poNumber||run.id}`]);
  return reply.code(201).send(run);
});
app.patch('/v1/admin/production-runs/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {supplierId,poNumber,quantity,unitCostCents,status,sampleStatus,exFactoryDate,etaDate,notes,internalNotes}=req.body||{};
  const run=(await pool.query(`update production_runs set supplier_id=coalesce($1,supplier_id),po_number=coalesce($2,po_number),quantity=coalesce($3,quantity),
    unit_cost_cents=coalesce($4,unit_cost_cents),status=coalesce($5,status),sample_status=coalesce($6,sample_status),ex_factory_date=coalesce($7,ex_factory_date),
    eta_date=coalesce($8,eta_date),notes=coalesce($9,notes),internal_notes=coalesce($10,internal_notes),updated_at=now() where id=$11 returning *`,
    [supplierId||null,poNumber||null,quantity||null,unitCostCents||null,status||null,sampleStatus||null,exFactoryDate||null,etaDate||null,notes||null,internalNotes||null,req.params.id])).rows[0];
  if(!run)return reply.code(404).send({error:'Production run not found'});return run;
});
app.post('/v1/admin/production-runs/:id/qc',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {inspector,status='pending',inspectedUnits,defectUnits,checklist={},notes}=req.body||{};
  const run=(await pool.query('select pr.*,p.client_id from production_runs pr join products p on p.id=pr.product_id where pr.id=$1',[req.params.id])).rows[0];
  if(!run)return reply.code(404).send({error:'Production run not found'});
  const qc=(await pool.query(`insert into qc_inspections(production_run_id,inspector,status,inspected_units,defect_units,checklist,notes)
    values($1,$2,$3,$4,$5,$6,$7) returning *`,[run.id,inspector||null,status,inspectedUnits||null,defectUnits||null,JSON.stringify(checklist),notes||null])).rows[0];
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[run.client_id,run.product_id,req.auth.sub,'quality',`QC ${status}: ${defectUnits||0} defects`]);
  return reply.code(201).send(qc);
});
app.post('/v1/admin/production-runs/:id/shipments',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {carrier,trackingNumber,trackingUrl,status='preparing',destination,shippedAt,etaDate}=req.body||{};
  const run=(await pool.query('select id from production_runs where id=$1',[req.params.id])).rows[0];if(!run)return reply.code(404).send({error:'Production run not found'});
  return reply.code(201).send((await pool.query(`insert into shipments(production_run_id,carrier,tracking_number,tracking_url,status,destination,shipped_at,eta_date)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[run.id,carrier||null,trackingNumber||null,trackingUrl||null,status,destination||null,shippedAt||null,etaDate||null])).rows[0]);
});
app.patch('/v1/admin/shipments/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {carrier,trackingNumber,trackingUrl,status,destination,shippedAt,etaDate,deliveredAt}=req.body||{};
  const shipment=(await pool.query(`update shipments set carrier=coalesce($1,carrier),tracking_number=coalesce($2,tracking_number),tracking_url=coalesce($3,tracking_url),
    status=coalesce($4,status),destination=coalesce($5,destination),shipped_at=coalesce($6,shipped_at),eta_date=coalesce($7,eta_date),
    delivered_at=coalesce($8,delivered_at),updated_at=now() where id=$9 returning *`,[carrier||null,trackingNumber||null,trackingUrl||null,status||null,destination||null,
    shippedAt||null,etaDate||null,deliveredAt||null,req.params.id])).rows[0];if(!shipment)return reply.code(404).send({error:'Shipment not found'});return shipment;
});
app.post('/v1/admin/products/:id/assets',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const product=(await pool.query('select * from products where id=$1',[req.params.id])).rows[0];if(!product)return reply.code(404).send({error:'Product not found'});
  const name=String(req.query?.name||'').trim(),kind=String(req.query?.kind||'artwork'),visibility=req.query?.visibility==='internal'?'internal':'client';
  if(!name)return reply.code(400).send({error:'Asset name required'});const part=await req.file();if(!part)return reply.code(400).send({error:'One file is required'});
  const asset=(await pool.query(`insert into assets(product_id,name,kind,visibility) values($1,$2,$3,$4)
    on conflict(product_id,name) do update set kind=excluded.kind,visibility=excluded.visibility,updated_at=now() returning *`,[product.id,name,kind,visibility])).rows[0];
  const version=await storeAssetVersion(asset,req.auth.sub,part,req.query?.notes);
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'asset',`Uploaded ${asset.name} v${version.version}`]);
  return reply.code(201).send({asset:{...asset,current_version:version.version},version});
});
app.post('/v1/admin/assets/:id/versions',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const asset=(await pool.query('select a.*,p.client_id from assets a join products p on p.id=a.product_id where a.id=$1',[req.params.id])).rows[0];
  if(!asset)return reply.code(404).send({error:'Asset not found'});const part=await req.file();if(!part)return reply.code(400).send({error:'One file is required'});
  const version=await storeAssetVersion(asset,req.auth.sub,part,req.query?.notes);await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[asset.client_id,asset.product_id,req.auth.sub,'asset',`Uploaded ${asset.name} v${version.version}`]);
  return reply.code(201).send(version);
});
app.patch('/v1/admin/assets/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,kind,status,visibility}=req.body||{};const asset=(await pool.query(`update assets set name=coalesce($1,name),kind=coalesce($2,kind),status=coalesce($3,status),
    visibility=coalesce($4,visibility),updated_at=now() where id=$5 returning *`,[name||null,kind||null,status||null,visibility||null,req.params.id])).rows[0];
  if(!asset)return reply.code(404).send({error:'Asset not found'});return asset;
});
app.post('/v1/products/:id/assets',{preHandler:authenticate},async(req,reply)=>{
  const product=(await pool.query('select * from products where id=$1 and client_id=$2',[req.params.id,req.auth.clientId])).rows[0];if(!product)return reply.code(404).send({error:'Product not found'});
  const name=String(req.query?.name||'Client upload').trim(),kind=String(req.query?.kind||'artwork');const part=await req.file();if(!part)return reply.code(400).send({error:'One file is required'});
  const asset=(await pool.query(`insert into assets(product_id,name,kind,visibility) values($1,$2,$3,'client')
    on conflict(product_id,name) do update set kind=excluded.kind,visibility='client',updated_at=now() returning *`,[product.id,name,kind])).rows[0];
  const version=await storeAssetVersion(asset,req.auth.sub,part,req.query?.notes);await pool.query('insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,$4,$5)',
    [product.client_id,'client-upload',`Client uploaded ${asset.name} v${version.version}`,'asset',asset.id]);
  return reply.code(201).send({asset:{...asset,current_version:version.version},version});
});
app.get('/v1/asset-versions/:id/download',{preHandler:authenticate},async(req,reply)=>{
  const row=(await pool.query(`select av.*,a.visibility,p.client_id from asset_versions av join assets a on a.id=av.asset_id join products p on p.id=a.product_id where av.id=$1`,[req.params.id])).rows[0];
  if(!row||((req.auth.role!=='admin')&&(row.client_id!==req.auth.clientId||row.visibility!=='client')))return reply.code(404).send({error:'File not found'});
  return reply.type(row.mime_type||'application/octet-stream').header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`).send(createReadStream(join(uploadDir,row.storage_name)));
});
app.post('/v1/admin/comments',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {productId,assetId,approvalId,body,visibility='client'}=req.body||{};if(!body?.trim())return reply.code(400).send({error:'Comment required'});
  const product=(await pool.query('select * from products where id=$1',[productId])).rows[0];if(!product)return reply.code(404).send({error:'Product not found'});
  const comment=(await pool.query(`insert into comments(client_id,product_id,asset_id,approval_id,author_id,author_role,body,visibility)
    values($1,$2,$3,$4,$5,'admin',$6,$7) returning *`,[product.client_id,product.id,assetId||null,approvalId||null,req.auth.sub,String(body).slice(0,5000),visibility==='internal'?'internal':'client'])).rows[0];
  if(comment.visibility==='client')await pool.query('insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,$4,$5)',[product.client_id,'staff-comment',`Future Basics commented on ${product.title}`,'comment',comment.id]);
  return reply.code(201).send(comment);
});
app.post('/v1/comments',{preHandler:authenticate},async(req,reply)=>{
  const {productId,assetId,approvalId,body}=req.body||{};if(!body?.trim())return reply.code(400).send({error:'Comment required'});
  const product=(await pool.query('select * from products where id=$1 and client_id=$2',[productId,req.auth.clientId])).rows[0];if(!product)return reply.code(404).send({error:'Product not found'});
  const comment=(await pool.query(`insert into comments(client_id,product_id,asset_id,approval_id,author_id,author_role,body,visibility)
    values($1,$2,$3,$4,$5,'client',$6,'client') returning *`,[product.client_id,product.id,assetId||null,approvalId||null,req.auth.sub,String(body).slice(0,5000)])).rows[0];
  const mentions=(String(body).match(/@[a-zA-Z0-9._-]+/g)||[]).join(', ');await pool.query('insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,$4,$5)',
    [product.client_id,'client-comment',`Client commented on ${product.title}${mentions?' · '+mentions:''}`,'comment',comment.id]);
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'comment','Client added a comment']);
  return reply.code(201).send(comment);
});
app.patch('/v1/admin/notifications/:id/read',{preHandler:[authenticate,adminOnly]},async req=>
  (await pool.query('update notifications set read_at=now() where id=$1 returning *',[req.params.id])).rows[0]
);
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
  const {title,kind='artwork',version='v1',notes,assetVersionId}=req.body||{};
  if(!title?.trim())return reply.code(400).send({error:'Approval title required'});
  let linked=null;
  if(assetVersionId){linked=(await pool.query(`select av.*,a.name asset_name,a.product_id from asset_versions av join assets a on a.id=av.asset_id
    where av.id=$1 and a.product_id=$2`,[assetVersionId,req.params.id])).rows[0];if(!linked)return reply.code(400).send({error:'Select an asset version from this product'});}
  const approval=(await pool.query(`insert into approvals(product_id,requested_by,title,kind,version,notes,asset_version_id)
    values($1,$2,$3,$4,$5,$6,$7) returning *`,[req.params.id,req.auth.sub,title,kind,linked?`v${linked.version}`:version,notes||null,linked?.id||null])).rows[0];
  const product=(await pool.query('select client_id,title from products where id=$1',[req.params.id])).rows[0];
  await pool.query('insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,$4,$5)',[product.client_id,'approval-request',`Approval requested: ${linked?linked.asset_name+' v'+linked.version:title}`,'approval',approval.id]);
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,req.params.id,req.auth.sub,'approval',`Requested approval${linked?' for '+linked.asset_name+' v'+linked.version:''}`]);
  return reply.code(201).send(approval);
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
    pool.query(`select a.*,p.title product_title,av.version asset_version,ast.name asset_name from approvals a
      join products p on p.id=a.product_id left join asset_versions av on av.id=a.asset_version_id left join assets ast on ast.id=av.asset_id
      where p.client_id=$1 and a.status='pending' order by a.requested_at`, [id]),
    pool.query('select * from activities where client_id=$1 order by created_at desc limit 50', [id])
  ]);
  return { requests: requests.rows, invoices: invoices.rows, projects: projects.rows, products: products.rows,
    approvals: approvals.rows, activities: activities.rows,
    actions: [
      ...approvals.rows.map(a=>({type:'approval',id:a.id,title:'Approve '+a.product_title+' — '+(a.asset_name?`${a.asset_name} v${a.asset_version}`:a.title),due:null})),
      ...invoices.rows.filter(x=>x.status==='due').map(x=>({type:'invoice',id:x.id,title:'Invoice '+x.number+' due',due:x.due_date}))
    ] };
});

app.get('/v1/products/:id', { preHandler: authenticate }, async (req, reply) => {
  const product=(await pool.query('select * from products where id=$1 and client_id=$2',[req.params.id,req.auth.clientId])).rows[0];
  if(!product)return reply.code(404).send({error:'Product not found'});
  const [brief,milestones,quotes,approvals,files,activity,productionRuns,shipments,assets,assetVersions,comments,configuration,priceTiers]=await Promise.all([
    pool.query('select * from product_briefs where product_id=$1',[product.id]),
    pool.query('select * from milestones where product_id=$1 order by sort_order',[product.id]),
    pool.query(`select id,product_id,version,currency,quantity,tooling_cents,freight_cents,status,expires_at,created_at,wholesale_cents,srp_cents,notes,
      shopify_draft_order_name,shopify_draft_order_status,shopify_invoice_url,shopify_invoice_sent_at,shopify_order_id,shopify_financial_status,shopify_fulfillment_status
      from quotes where product_id=$1 order by version desc`,[product.id]),
    pool.query(`select ap.*,av.original_name,av.version asset_version,a.name asset_name,a.kind asset_kind
      from approvals ap left join asset_versions av on av.id=ap.asset_version_id left join assets a on a.id=av.asset_id
      where ap.product_id=$1 order by ap.requested_at desc`,[product.id]),
    pool.query(`select f.* from files f join requests r on r.id=f.request_id
      where r.product_id=$1 and r.client_id=$2 order by f.created_at desc`,[product.id,req.auth.clientId]),
    pool.query('select * from activities where product_id=$1 order by created_at desc',[product.id]),
    pool.query(`select pr.id,pr.po_number,pr.quantity,pr.status,pr.sample_status,pr.ex_factory_date,pr.eta_date,pr.notes,
      (select qi.status from qc_inspections qi where qi.production_run_id=pr.id order by qi.created_at desc limit 1) qc_status
      from production_runs pr where pr.product_id=$1 order by pr.created_at desc`,[product.id]),
    pool.query(`select sh.id,sh.production_run_id,sh.carrier,sh.tracking_number,sh.tracking_url,sh.status,sh.destination,sh.shipped_at,sh.eta_date,sh.delivered_at
      from shipments sh join production_runs pr on pr.id=sh.production_run_id where pr.product_id=$1 order by sh.created_at desc`,[product.id]),
    pool.query(`select * from assets where product_id=$1 and visibility='client' order by updated_at desc`,[product.id]),
    pool.query(`select av.* from asset_versions av join assets a on a.id=av.asset_id
      where a.product_id=$1 and a.visibility='client' order by av.created_at desc`,[product.id]),
    pool.query(`select c.*,u.email author_email from comments c left join users u on u.id=c.author_id
      where c.product_id=$1 and c.visibility='client' order by c.created_at desc`,[product.id]),
    pool.query(`select product_id,blank_name,material,construction,decoration_method,decoration_locations,artwork_width_in,artwork_height_in,
      colorways,sizes,variant_plan,packaging,fulfillment,moq,sample_required,lead_time_days,notes,status,updated_at
      from product_configurations where product_id=$1`,[product.id]),
    pool.query(`select id,min_quantity,max_quantity,wholesale_cents,srp_cents,setup_cents,freight_cents,lead_time_days,notes
      from price_tiers where product_id=$1 order by min_quantity`,[product.id])
  ]);
  return {product,brief:brief.rows[0]||null,milestones:milestones.rows,quotes:quotes.rows,approvals:approvals.rows,files:files.rows,
    activity:activity.rows,productionRuns:productionRuns.rows,shipments:shipments.rows,assets:assets.rows,
    assetVersions:assetVersions.rows,comments:comments.rows,configuration:configuration.rows[0]||null,priceTiers:priceTiers.rows};
});

app.post('/v1/approvals/:id/decision', { preHandler: authenticate }, async (req, reply) => {
  const decision=String(req.body?.decision||'');
  if(!['approved','changes-requested'].includes(decision))return reply.code(400).send({error:'decision must be approved or changes-requested'});
  const row=(await pool.query(`update approvals a set status=$1,notes=coalesce($2,a.notes),decided_by=$3,decided_at=now()
    from products p where a.id=$4 and a.product_id=p.id and p.client_id=$5 and a.status='pending'
    returning a.*,p.title product_title,p.client_id`,
    [decision,req.body?.notes||null,req.auth.sub,req.params.id,req.auth.clientId])).rows[0];
  if(!row)return reply.code(404).send({error:'Pending approval not found'});
  let versionLabel='';
  if(row.asset_version_id){const linked=(await pool.query(`select av.version,a.id asset_id,a.name from asset_versions av join assets a on a.id=av.asset_id where av.id=$1`,[row.asset_version_id])).rows[0];
    if(linked){versionLabel=` ${linked.name} v${linked.version}`;await pool.query(`update assets set status=$1,approved_version_id=case when $1='approved' then $2 else approved_version_id end,updated_at=now() where id=$3`,[decision==='approved'?'approved':'working',row.asset_version_id,linked.asset_id]);}}
  if(decision==='approved'){
    await pool.query(`update milestones set status='complete',completed_at=now() where product_id=$1 and lower(name)='approval'`,[row.product_id]);
    await pool.query(`update milestones set status='current',completed_at=null where product_id=$1 and lower(name)='production' and status<>'complete'`,[row.product_id]);
    await pool.query(`update products set current_stage='production',risk_level='on-track',updated_at=now() where id=$1`,[row.product_id]);
  }else{
    await pool.query(`update milestones set status='blocked',completed_at=null where product_id=$1 and lower(name)='approval'`,[row.product_id]);
    await pool.query(`update milestones set status='current',completed_at=null where product_id=$1 and lower(name)='development' and status<>'complete'`,[row.product_id]);
    await pool.query(`update products set current_stage='development',risk_level='attention',updated_at=now() where id=$1`,[row.product_id]);
  }
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',
    [req.auth.clientId,row.product_id,req.auth.sub,'approval',decision==='approved'?`Approved${versionLabel||' '+row.title}`:`Requested changes to${versionLabel||' '+row.title}`]);
  await pool.query('insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,$4,$5)',[req.auth.clientId,'approval-decision',`${decision==='approved'?'Approved':'Changes requested'}: ${versionLabel.trim()||row.title}`,'approval',row.id]);
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

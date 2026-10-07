import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { unlink, writeFile, mkdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, extname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { migrate, pool } from './db.js';
import { setSink, recordRequest, trackJob, declareJob, trackedFetch, timed, reportError, snapshot as telemetrySnapshot, overallStatus } from './telemetry.js';
import { buildQueues, AUTO_RETRY_LIMIT } from './queues.js';
import { runSpecCheck, imageConfig, referencePhotos as packPhotos } from './check.js';
import { heroConfig, heroCandidates, pickHero, measureColours, snapColours, heroThumb, callJsonSchema, refineHero, HERO_APPROVE_MIN, HERO_REFINE_ROUNDS } from './studio.js';
import { reconcile, applyChanges, revertChanges } from './loop.js';
import { meshConfig, startMesh, pollMesh, fetchAsset, photoForMesh, stlInfo } from './mesh.js';
import { paymentFromOrder, clientForPayment, recordPayment, backfillTechPackPayments, paymentSyncStatus } from './payments.js';
import { runChecks, configChecks, jobHealth, insights as platformInsights, classifyAiFailure, assistantAlertContent, probeAssistant, PROBE_MODEL } from './platform.js';
import { draftSnapshot, draftDiff, aggregateDiffs } from './learning.js';
import { renderColorways, mergeColorwayTiles } from './colorway.js';
import { makeColourways } from './panels.js';
import { cleanQuote, compareQuotes, defaultCompareQty } from './rfq.js';
import { cleanPartner, CARD_SCHEMA, CARD_SYSTEM, FIXTURE_CARD } from './booth.js';
import { draftElectronics, applyElectronicsDraft } from './elecdraft.js';
import { cutoutEnabled, cutoutProvider, cutoutFromPhoto, placeCutout } from './cutout.js';
import { shopifyConfigured, shopifyGraphql, SHOP_CONNECTION_QUERY, APP_SCOPES_QUERY, missingScopes, CUSTOMER_MEMBERSHIP_QUERY, CUSTOMER_BY_EMAIL_QUERY, exactCustomerMatch, ORDER_CUSTOMER_QUERY, DRAFT_ORDER_DELETE, VARIANTS_BULK_CREATE, VARIANTS_BULK_UPDATE, VARIANTS_BULK_DELETE, PRODUCT_SYNC_QUERY, PRODUCT_IDS_SYNC_QUERY, CUSTOMER_SYNC_QUERY, PRODUCT_CREATE, PRODUCT_UPDATE, DRAFT_ORDER_CREATE, DRAFT_INVOICE_SEND, DRAFT_ORDER_STATUS, requireNoUserErrors, OFFER_CONTEXT_QUERY, ORDER_TRANSACTIONS_QUERY, ORDER_CAPTURE, ORDER_CANCEL, requireNoOrderCancelErrors , ORDERS_PAID_QUERY } from './shopify.js';
import { latestProductQuote, productCommercials, projectFinancialRollups, clientProductTerms, draftOrderLinesForProducts } from './commercials.js';
import { normalizeSubmission, normalizeAmount, nextOfferState, consignmentView, formatCents } from './consign.js';
import { normalizeOfferSubmission, normalizeOfferAmount, nextOfferMove, offerView } from './offers.js';
import { normalizeTechPack, seedTechPack, techPackCompleteness, publishedTechPackView, normalizeVerification, techPackReadiness, emptyVerification, publishGate, isInlineImage, packStrings, mergeClientEdits, cardFieldsFromPack } from './techpack.js';
import { aiEnabled, vetMeasurements, draftFromPhotos, draftFromBrief, applyDraftToPack, productTypeLabel, AI_MODEL, translateStrings, TRANSLATION_LANGS, LANG_LABELS, locateProduct, cropToBox, draftLooksEmpty, NoProductError, completeMeasurements } from './ai.js';
import { planClientAccess, normalizeEmails, emailDomain } from './access.js';
import { applyFlow, MILESTONE_STATUSES, OWNERS, OWNER_LABELS } from './flow.js';
import { nextFreeStep, nextPaidStep, nurtureEmail, marketingFooter, parseCaseStudies, pickCaseStudy, unsubscribeToken, validUnsubscribeToken } from './nurture.js';

const app = Fastify({ logger: true, bodyLimit: 1_000_000, trustProxy: true });
// Platform health: every answer is counted, and failures are kept in the database (the newest 500) so they survive a deploy.
app.addHook('onResponse', async (req, reply) => { try { recordRequest(req.routeOptions?.url || '(no route)', reply.statusCode, reply.elapsedTime); } catch {} });
setSink(async ({ source, level, message, detail }) => {
  await pool.query('insert into platform_events(source,level,message,detail) values($1,$2,$3,$4)', [source, level, String(message).slice(0, 500), detail || {}]);
  await pool.query('delete from platform_events where id in (select id from platform_events order by id desc offset 500)').catch(() => {});
  if (source === 'anthropic') { const kind = classifyAiFailure(message); if (kind) alertAssistantDown(kind, message).catch(err => app.log.warn({ err: err.message }, 'assistant alert failed')); }
});
const uploadDir = process.env.UPLOAD_DIR || './uploads';
mkdirSync(uploadDir, { recursive: true });
const secret = new TextEncoder().encode(process.env.JWT_SECRET || randomBytes(32).toString('hex'));
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://thefuturebasics.com,https://work.thefuturebasics.com,https://hub.thefuturebasics.com').split(',').map(x => x.trim());
const workHubUrl = process.env.WORK_HUB_URL || 'https://work.thefuturebasics.com';
const clientHubUrl = process.env.CLIENT_HUB_URL || 'https://hub.thefuturebasics.com';
// Tech pack colour renderings double as the product's visual when there is no Shopify image. They are served through a
// signed public URL so <img> tags can load them without a bearer token; the signature is derived from the server secret.
const renderingSig = id => createHash('sha256').update(`rendering:${id}:${Buffer.from(secret).toString('hex')}`).digest('hex').slice(0, 32);
// A factory's page and the pack links on it are not stored: they are worked out from the server secret, so staff can always copy the link again and the factory never needs a login.
// Only the hash of each is kept, so a link can be switched off (a pack link by revoking its share, the page by rotating it).
const factoryPageToken = (supplierId, epoch) => createHash('sha256').update(`factory-page:${supplierId}:${epoch}:${Buffer.from(secret).toString('hex')}`).digest('hex').slice(0, 32);
const factoryShareToken = shareId => createHash('sha256').update(`factory-share:${shareId}:${Buffer.from(secret).toString('hex')}`).digest('hex').slice(0, 32);
const renderingUrl = id => `${clientHubUrl}/r/${id}/${renderingSig(id)}.jpg`;
const withRendering = row => row ? { ...row, rendering_url: row.has_rendering ? renderingUrl(row.id) : null } : row;
// A pack has a cover image when it carries a colour rendering, or — for photo-start drafts — the uploaded reference photo in its first view.
const PACK_HAS_IMAGE_SQL = tp => `(coalesce(jsonb_array_length(coalesce(${tp}.published_data,${tp}.data)->'renderings'),0)>0 or coalesce(coalesce(${tp}.published_data,${tp}.data)->'sketches'->0->>'image','')<>'')`;
const HAS_RENDERING_SQL = `coalesce((select ${PACK_HAS_IMAGE_SQL('tp')} from tech_packs tp where tp.product_id=p.id),false) has_rendering`;
const startProjectUrl = process.env.START_PROJECT_URL || 'https://thefuturebasics.com/pages/contact';
const intakeNotificationEmail = process.env.INTAKE_NOTIFICATION_EMAIL || 'kyle@thefuturebasics.com';
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${workHubUrl}/v1/auth/google/callback`;
const googleSsoEnabled = Boolean(googleClientId && googleClientSecret);
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

await app.register(cors, { origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || (origin==='null' && process.env.DEV_BYPASS_AUTH==='true')), credentials: true });
await app.register(multipart, {
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 25_000_000), files: 5, fields: 40 },
  attachFieldsToBody: false
});
app.addHook('onSend', async (_req, reply, payload) => {
  reply
    .header('strict-transport-security', 'max-age=31536000')
    .header('content-security-policy', "upgrade-insecure-requests; default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob: https:; connect-src 'self' https://thefuturebasics.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
    .header('x-content-type-options', 'nosniff')
    .header('referrer-policy', 'strict-origin-when-cross-origin')
    .header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return payload;
});

const hash = value => createHash('sha256').update(value).digest('hex');
const cleanName = value => basename(value).replace(/[^a-zA-Z0-9._-]/g, '-').slice(-160);
const allowedExtensions = new Set(['.pdf','.ai','.eps','.png','.jpg','.jpeg','.svg','.zip','.doc','.docx','.xls','.xlsx','.csv','.ppt','.pptx','.txt']);
const intakeWindows = new Map();
function publicIntakeAllowed(ip,{bucket='intake',limit=5}={}){
  if(process.env.DEV_BYPASS_AUTH==='true')return true;
  const now=Date.now(),key=`${bucket}:${ip||'unknown'}`,current=intakeWindows.get(key);
  if(!current||now-current.startedAt>60*60*1000){intakeWindows.set(key,{startedAt:now,count:1});return true}
  current.count+=1;return current.count<=limit;
}
// Counts hits per key in a window; false once the limit is passed. Skipped in the test rig the same way publicIntakeAllowed is.
const throttles=new Map();
function throttle(key,{limit,windowMs}){
  if(process.env.DEV_BYPASS_AUTH==='true')return true;
  const now=Date.now(),cur=throttles.get(key);
  if(throttles.size>5000)for(const [k,v] of throttles)if(now-v.startedAt>v.windowMs)throttles.delete(k);
  if(!cur||now-cur.startedAt>windowMs){throttles.set(key,{startedAt:now,count:1,windowMs});return true}
  cur.count+=1;return cur.count<=limit;
}
const CODE_ASK={limit:5,windowMs:15*60*1000},CODE_GUESS={limit:5,windowMs:15*60*1000};
const tooManyCodes={error:'We already sent you a code — check your inbox (and spam), or wait a few minutes before asking for another.',code:'RATE_LIMITED'};
const tooManyGuesses={error:'Too many wrong codes. Wait a few minutes, then ask for a new code.',code:'RATE_LIMITED'};
// Only the digits count: a code pasted as "123 456" or with a stray space still works.
const cleanCode=v=>String(v??'').replace(/\D/g,'').slice(0,12);
const intakeValue=(fields,name,max=2000)=>String(fields[name]||'').trim().slice(0,max);
const intakeSlug=value=>String(value||'client').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'client';
const domainPattern = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const normalizeDomains = values => [...new Set((Array.isArray(values) ? values : [])
  .map(value => String(value || '').trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean))];
async function validateClientDomains(values, clientId = null) {
  const domains = normalizeDomains(values);
  const invalid = domains.filter(domain => !domainPattern.test(domain));
  if (invalid.length) throw Object.assign(new Error(`Invalid email domain: ${invalid.join(', ')}`), { statusCode: 400 });
  if (domains.includes('thefuturebasics.com')) {
    const owner = await pool.query("select id from clients where slug='future-basics'");
    if (!clientId || owner.rows[0]?.id !== clientId) throw Object.assign(new Error('thefuturebasics.com is reserved for Future Basics staff'), { statusCode: 409 });
  }
  if (domains.length) {
    const conflict = await pool.query(`select name,unnest(email_domains) domain from clients
      where ($1::uuid is null or id<>$1) and email_domains && $2::text[] limit 1`, [clientId, domains]);
    if (conflict.rowCount) throw Object.assign(new Error(`${conflict.rows[0].domain} already belongs to ${conflict.rows[0].name}`), { statusCode: 409 });
  }
  return domains;
}

async function authenticate(req, reply) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return reply.code(401).send({ error: 'Authentication required' });
  try { req.auth = (await jwtVerify(token, secret, { issuer: 'future-basics-client-hub' })).payload; }
  catch { return reply.code(401).send({ error: 'Invalid or expired session' }); }
  // A session handed out on /start vouches for nothing: nobody has proved they own that inbox. It works only until the
  // address is verified with a code (by whoever really owns it), after which it must sign in like everyone else.
  if(req.auth.unverified){const u=(await pool.query('select email_verified_at from users where id=$1',[req.auth.sub])).rows[0];if(!u||u.email_verified_at)return reply.code(401).send({error:'Invalid or expired session'})}
  if(req.auth.preview&&!['GET','HEAD','OPTIONS'].includes(req.method))return reply.code(403).send({error:'Client preview is read-only'});
}
async function adminOnly(req,reply){if(req.auth?.role!=='admin')return reply.code(403).send({error:'Future Basics admin access required'});}

function quoteReadiness(product,configuration,quote){
  const missing=[];
  if(!quote)missing.push('issued quote');
  else{
    if(quote.status!=='issued')missing.push('active issued quote');
    if(!(Number(quote.quantity)>0))missing.push('quantity');
    if(quote.wholesale_cents==null)missing.push('wholesale price');
    if(quote.srp_cents==null)missing.push('SRP');
  }
  if(!configuration)missing.push('product configuration');
  else{
    if(!['client-review','ready'].includes(configuration.status))missing.push('client-ready configuration');
    if(!(Number(configuration.moq)>0))missing.push('MOQ');
    if(!(Number(configuration.lead_time_days)>0))missing.push('lead time');
    if(!String(configuration.material||'').trim())missing.push('material');
    if(!String(configuration.decoration_method||'').trim())missing.push('decoration');
    if(!Array.isArray(configuration.colorways)||!configuration.colorways.length)missing.push('colorways');
    const sizedProduct=/(shirt|tee|jacket|hoodie|sweatshirt|pant|short|hat|cap|apparel|wear)/i.test(`${product.title||''} ${product.product_type||''}`);
    if(sizedProduct&&(!Array.isArray(configuration.sizes)||!configuration.sizes.length))missing.push('size run');
  }
  return {ready:missing.length===0,missing};
}

// Commercial math (productCommercials, projectFinancialRollups, clientProductTerms,
// draftOrderLinesForProducts) lives in ./commercials.js so it can be unit-tested and
// stays the single source of truth for the hub rollup, the PDF, and the draft invoice.

const pdfEscape=value=>String(value??'').replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7E]/g,' ');
function invoicePdf(invoice,client,project){
  const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:invoice.currency||'USD'}).format(Number(invoice.amount_cents||0)/100);
  const lines=['FUTURE BASICS','PROJECT INVOICE','',`Invoice: ${invoice.number}`,`Client: ${client.name}`,`Project: ${project?.name||'Unassigned'}`,
    `Amount: ${amount}`,`Status: ${String(invoice.status||'').toUpperCase()}`,`Issued: ${new Date(invoice.created_at).toLocaleDateString('en-US')}`,
    `Due: ${invoice.due_date?new Date(invoice.due_date+'T00:00:00').toLocaleDateString('en-US'):'On receipt'}`,'','Payment is processed securely through Shopify.'];
  const content=['BT','/F1 22 Tf','72 730 Td',`(${pdfEscape(lines[0])}) Tj`,'0 -38 Td','/F1 15 Tf',`(${pdfEscape(lines[1])}) Tj`,'/F1 11 Tf']
    .concat(lines.slice(2).flatMap(line=>['0 -24 Td',`(${pdfEscape(line)}) Tj`])).concat(['ET']).join('\n');
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
  let output='%PDF-1.4\n',offsets=[0];
  for(let i=1;i<objects.length;i++){offsets[i]=Buffer.byteLength(output);output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=Buffer.byteLength(output);output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

const formatMoney=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(value||0)/100);
async function productImageBuffer(source){
  try{
    const url=new URL(source);if(url.protocol!=='https:'||!/(^|\.)(shopify\.com|thefuturebasics\.com)$/.test(url.hostname))return null;
    const response=await fetch(url,{signal:AbortSignal.timeout(5000)});if(!response.ok)return null;
    const type=response.headers.get('content-type')||'';if(!/image\/(png|jpe?g)/i.test(type))return null;
    const data=Buffer.from(await response.arrayBuffer());return data.length<=10_000_000?data:null;
  }catch{return null}
}
async function projectCollectionPdf(client,project,products,quotes){
  const buffers=[],doc=new PDFDocument({size:'LETTER',margin:42,info:{Title:`${project.name} — product collection`,Author:'Future Basics'}});
  doc.on('data',chunk=>buffers.push(chunk));const ended=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(buffers)));doc.on('error',reject)});
  const ink='#141416',dim='#727279',line='#d8d8d4',cue='#2edc83',pageWidth=doc.page.width-84,gap=14,columnWidth=(pageWidth-gap)/2,cardHeight=260;
  const drawHeader=()=>{doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text('FUTURE BASICS',42,36);doc.font('Helvetica').fontSize(8).fillColor(dim).text('CLIENT PROJECT COLLECTION',42,62,{characterSpacing:1.2});doc.moveTo(42,79).lineTo(doc.page.width-42,79).lineWidth(1).strokeColor(line).stroke()};
  drawHeader();doc.fillColor(ink).font('Helvetica-Bold').fontSize(28).text(project.name,42,101,{width:pageWidth});doc.font('Helvetica').fontSize(11).fillColor(dim).text(`${client.name} · ${products.length} product${products.length===1?'':'s'} · generated ${new Date().toLocaleDateString('en-US')}`,42,139,{width:pageWidth});
  let y=175,column=0,projectTotal=0,setupTotal=0,shippingTotal=0;
  for(const product of products){
    if(column===0&&y+cardHeight>doc.page.height-52){doc.addPage();drawHeader();y=100}
    const x=42+column*(columnWidth+gap),terms=clientProductTerms(product,quotes);if(terms.priced){projectTotal+=terms.total;setupTotal+=terms.setup;shippingTotal+=terms.shipping;}
    doc.roundedRect(x,y,columnWidth,cardHeight,16).lineWidth(1).strokeColor(line).stroke();
    const image=product.shopify_image_url?await productImageBuffer(product.shopify_image_url):null;
    if(image){try{doc.image(image,x+1,y+1,{fit:[columnWidth-2,104],align:'center',valign:'center'})}catch{doc.rect(x+1,y+1,columnWidth-2,104).fill('#eeeeeb')}}else doc.rect(x+1,y+1,columnWidth-2,104).fill('#eeeeeb');
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(12).text(product.title,x+14,y+119,{width:columnWidth-28,height:34,ellipsis:true});
    doc.font('Helvetica').fontSize(8).fillColor(dim).text(`UNITS  ${terms.units||'TBD'}     MOQ  ${terms.moq||'TBD'}`,x+14,y+158,{width:columnWidth-28});
    doc.text(`UNIT PRICE  ${terms.unitPrice?formatMoney(terms.unitPrice):'TBD'}`,x+14,y+177,{width:columnWidth-28});
    doc.text(`SETUP  ${formatMoney(terms.setup)}     SHIPPING  ${formatMoney(terms.shipping)}`,x+14,y+196,{width:columnWidth-28});
    doc.moveTo(x+14,y+220).lineTo(x+columnWidth-14,y+220).strokeColor(line).stroke();
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(`PRODUCT TOTAL  ${terms.units&&terms.unitPrice?formatMoney(terms.total):'TBD'}`,x+14,y+231,{width:columnWidth-28});
    column=(column+1)%2;if(column===0)y+=cardHeight+gap;
  }
  if(column===1)y+=cardHeight+gap;if(y+104>doc.page.height-42){doc.addPage();drawHeader();y=104}
  doc.roundedRect(42,y,pageWidth,96,16).fill(ink);doc.fillColor('#ffffff').font('Helvetica').fontSize(9).text('PROJECT TOTAL',60,y+18,{characterSpacing:1.1});doc.font('Helvetica-Bold').fontSize(26).text(formatMoney(projectTotal),60,y+38);
  doc.font('Helvetica').fontSize(9).fillColor('#b7b7ba').text(`Product + units, including ${formatMoney(setupTotal)} setup and ${formatMoney(shippingTotal)} shipping`,260,y+43,{width:pageWidth-278,align:'right'});
  doc.fillColor(cue).circle(doc.page.width-61,y+20,4).fill();doc.end();return ended;
}

async function sendCode(email, code) {
  if (process.env.RESEND_API_KEY) {
    const response = await trackedFetch('resend','https://api.resend.com/emails', {
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

const emailEscape=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
async function sendIntakeNotification(intake,uploads){
  if(!process.env.RESEND_API_KEY){app.log.warn({projectId:intake.project.id,to:intakeNotificationEmail},'RESEND_API_KEY missing; project intake email not sent');return false}
  const data=intake.data,files=uploads.map(file=>file.original_name).filter(Boolean),rows=[['Company',data.companyName],['Contact',`${data.contactName} · ${data.email}${data.phone?' · '+data.phone:''}`],['Project',data.projectName],['Category',data.productCategory],['Quantity',data.targetQuantity],['Budget',data.budgetRange],['Target',data.targetDate],['Channels',data.channels],['Help requested',data.services],['Shopify',data.shopifyStatus]].filter(([,value])=>value);
  const response=await trackedFetch('resend','https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({
    from:process.env.AUTH_FROM_EMAIL||'Future Basics <hub@thefuturebasics.com>',to:[intakeNotificationEmail],reply_to:data.email,
    subject:`New project brief — ${data.companyName} / ${data.projectName}`,
    html:`<div style="font-family:Arial,sans-serif;color:#141416;max-width:720px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase">Future Basics · New project intake</p><h1>${emailEscape(data.projectName)}</h1>${rows.map(([label,value])=>`<p><strong>${emailEscape(label)}</strong><br>${emailEscape(value)}</p>`).join('')}<p><strong>Brief</strong><br>${emailEscape(data.projectBrief).replace(/\n/g,'<br>')}</p>${data.inspirationLinks?`<p><strong>Inspiration</strong><br>${emailEscape(data.inspirationLinks).replace(/\n/g,'<br>')}</p>`:''}${files.length?`<p><strong>Uploads</strong><br>${files.map(emailEscape).join('<br>')}</p>`:''}<p><a href="${workHubUrl}/clients/${intake.client.id}">Open the client room in Work</a></p></div>`
  })});
  if(!response.ok)throw new Error(`Project intake email delivery failed: ${response.status}`);return true;
}

// Future Basics hub emails to clients (intake confirmation, room activation). Resend-backed like the login code;
// without RESEND_API_KEY they log and return false so local runs never block on delivery.
const hubFromEmail=process.env.AUTH_FROM_EMAIL||'Future Basics <hub@thefuturebasics.com>';
async function sendHubEmail({to,subject,html,replyTo,from,headers}){
  if(!process.env.RESEND_API_KEY){app.log.warn({to,subject},'RESEND_API_KEY missing; hub email not sent');return false}
  const response=await trackedFetch('resend','https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:from||hubFromEmail,to:[to],reply_to:replyTo||intakeNotificationEmail,subject,html,...(headers?{headers}:{})})});
  if(!response.ok)throw new Error(`Hub email delivery failed: ${response.status}`);return true;
}
const hubButton=(href,label)=>`<p style="margin:24px 0"><a href="${emailEscape(href)}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#141416;color:#fff;text-decoration:none;font-weight:600">${emailEscape(label)}</a></p>`;
const hubEmailShell=(title,body)=>`<div style="font-family:Arial,Helvetica,sans-serif;color:#141416;max-width:640px;line-height:1.5"><p style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#717177">Future Basics · Client hub</p><h1 style="font-size:24px;margin:8px 0 18px">${emailEscape(title)}</h1>${body}<p style="margin-top:32px;font-size:12px;color:#717177">Future Basics · product development, from brief to delivery · reply to this email to reach us.</p></div>`;
// Handoff emails. Staff hear when a client acts; the client's contact hears when something waits on them. A delivery problem is
// logged and never fails the action that triggered it (the console notice and the hub panel still show it).
const staffEmail=process.env.STAFF_NOTIFICATION_EMAIL||intakeNotificationEmail;
async function notifyStaff(subject,body){
  try{return await sendHubEmail({to:staffEmail,subject,html:hubEmailShell(subject,body)})}catch(e){app.log.warn({err:e.message,subject},'staff email not sent');return false}
}
async function notifyClientContact(clientId,{subject,title,body,replyTo}){
  try{
    const c=(await pool.query('select slug,contact_email,contact_name from clients where id=$1',[clientId])).rows[0];
    if(!c?.contact_email||c.slug==='future-basics')return false;
    const first=String(c.contact_name||'').split(' ')[0]||'there';
    return await sendHubEmail({to:c.contact_email,subject,replyTo,html:hubEmailShell(title||subject,`<p>Hi ${emailEscape(first)},</p>${body}<p style="font-size:12px;color:#717177">Sign in with your work email — no password, we send a six-digit code.</p>`)});
  }catch(e){app.log.warn({err:e.message,clientId,subject},'client email not sent');return false}
}
// The assistant stopping for a reason only we can fix (empty credit, a rejected key) emails staff once, then stays quiet for a few hours
// so a stuck queue is one email, not hundreds. The slot is claimed before sending so failures landing together send one; a delivery that
// errors gives it back. With no email service configured it only logs: the Platform page shows that on its own.
const platformAlertEmail=process.env.PLATFORM_ALERT_EMAIL||intakeNotificationEmail,AI_ALERT_COOLDOWN_HOURS=Number(process.env.AI_ALERT_COOLDOWN_HOURS)||6;
async function alertAssistantDown(kind,message){
  const key=`aiAlert:${kind}`;
  const claim=await pool.query(`insert into app_settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value,updated_at=now() where app_settings.updated_at<now()-make_interval(hours=>$3) returning key`,[key,JSON.stringify({kind,at:new Date().toISOString()}),AI_ALERT_COOLDOWN_HOURS]);
  if(!claim.rowCount)return false;
  try{
    const affected=(await pool.query(`select count(*)::int n from tech_packs where ai_status='failed' and ai_error ilike '%on our side%'`)).rows[0].n;
    const a=assistantAlertContent({kind,message,affected,consoleUrl:workHubUrl,platformUrl:`${workHubUrl}/platform`});
    return await sendHubEmail({to:platformAlertEmail,subject:a.subject,html:hubEmailShell(a.headline,`<p>${emailEscape(a.intro)}</p><p><strong>What customers see.</strong> ${emailEscape(a.customers)}</p><p><strong>What to do</strong></p><ol>${a.steps.map(t=>`<li>${emailEscape(t)}</li>`).join('')}</ol><p>${emailEscape(a.waiting)}</p>${hubButton(a.platformUrl,'Open the Platform page')}<p style="color:#717177;font-size:12px">What Anthropic said: ${emailEscape(a.quote)}<br>Sent once, then not again for ${AI_ALERT_COOLDOWN_HOURS} hours while this lasts.</p>`)});
  }catch(e){await pool.query('delete from app_settings where key=$1',[key]).catch(()=>{});throw e}
}
async function sendIntakeConfirmation(intake){
  const d=intake.data,rows=[['Project',d.projectName],['Product',d.productCategory],['Quantity',d.targetQuantity],['Budget',d.budgetRange],['Target date',d.targetDate]].filter(([,v])=>v);
  return sendHubEmail({to:d.email,subject:`We have your brief — ${d.projectName}`,html:hubEmailShell('We have your brief',
    `<p>Hi ${emailEscape(d.contactName.split(' ')[0]||d.contactName)},</p><p>Thanks — your brief for <strong>${emailEscape(d.projectName)}</strong> is in. Here is what happens next:</p>
    <ol><li>We read it and reply within two business days, usually with a few questions.</li><li>You get an email the moment your private project room is ready — one place for the brief, concepts, tech packs, samples, quotes and our shared thread.</li><li>From there every product moves brief → concept → tech pack → sample → production, and you approve each step in the room.</li></ol>
    <p style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#717177;margin-top:24px">What you sent</p>${rows.map(([l,v])=>`<p style="margin:4px 0"><strong>${emailEscape(l)}:</strong> ${emailEscape(v)}</p>`).join('')}<p style="margin-top:12px;white-space:pre-wrap">${emailEscape(d.projectBrief)}</p>`)});
}
async function clientForEmail(email,q=pool){
  const domain=emailDomain(email);
  return (await q.query(`select * from clients where status='active' and (($1<>'' and $1=any(email_domains)) or $2=any(allowed_emails))
    order by ($2=any(allowed_emails)) desc limit 1`,[domain,email])).rows[0]||null;
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

async function storeProjectFile(project,userId,uploaderRole,part,messageId=null){
  const originalName=cleanName(part.filename);if(!allowedExtensions.has(extname(originalName).toLowerCase()))throw Object.assign(new Error('Allowed: PDF, AI, EPS, PNG, JPG, SVG, ZIP, Word, Excel, PowerPoint, CSV, TXT'),{statusCode:415});
  const storageName=`${randomBytes(18).toString('hex')}-${originalName}`,path=join(uploadDir,storageName);
  try{
    await pipeline(part.file,createWriteStream(path,{flags:'wx'}));
    return (await pool.query(`insert into project_files(project_id,client_id,message_id,uploader_id,uploader_role,original_name,storage_name,mime_type,size_bytes)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[project.id,project.client_id,messageId,userId,uploaderRole,originalName,storageName,part.mimetype,part.file.bytesRead])).rows[0];
  }catch(error){await unlink(path).catch(()=>{});throw error}
}

app.get('/health', async () => {
  await pool.query('select 1');
  return { ok: true, service: 'client-hub-api' };
});

app.post('/v1/public/intakes',async(req,reply)=>{
  if(!publicIntakeAllowed(req.ip))return reply.code(429).send({error:'Too many submissions. Please try again in an hour.'});
  const fields={},uploads=[];let intake=null,spam=false;
  const createIntake=async()=>{
    if(intake||spam)return intake;
    spam=Boolean(intakeValue(fields,'companyFax',200));if(spam)return null;
    const companyName=intakeValue(fields,'companyName',140),contactName=intakeValue(fields,'contactName',140),email=intakeValue(fields,'email',200).toLowerCase();
    const projectName=intakeValue(fields,'projectName',160)||`${companyName} launch`,projectBrief=intakeValue(fields,'projectBrief',6000);
    if(companyName.length<2||contactName.length<2||!/^\S+@\S+\.\S+$/.test(email)||projectBrief.length<20)
      throw Object.assign(new Error('Company, contact, business email, and a project brief of at least 20 characters are required.'),{statusCode:400});
    const data={companyName,contactName,email,phone:intakeValue(fields,'phone',80),websiteUrl:intakeValue(fields,'websiteUrl',300),projectName,
      productCategory:intakeValue(fields,'productCategory',160),projectBrief,audience:intakeValue(fields,'audience',1000),targetQuantity:intakeValue(fields,'targetQuantity',120),
      budgetRange:intakeValue(fields,'budgetRange',120),targetDate:intakeValue(fields,'targetDate',40),channels:intakeValue(fields,'channels',600),
      services:intakeValue(fields,'services',600),shopifyStatus:intakeValue(fields,'shopifyStatus',300),inspirationLinks:intakeValue(fields,'inspirationLinks',1500),
      referralSource:intakeValue(fields,'referralSource',300),notes:intakeValue(fields,'notes',3000),submittedAt:new Date().toISOString()};
    const details=[`Product / category: ${data.productCategory||'Not specified'}`,`Project brief: ${data.projectBrief}`,`Audience: ${data.audience||'Not specified'}`,
      `Target quantity: ${data.targetQuantity||'Not specified'}`,`Budget: ${data.budgetRange||'Not specified'}`,`Target launch: ${data.targetDate||'Not specified'}`,
      `Channels: ${data.channels||'Not specified'}`,`Help requested: ${data.services||'Not specified'}`,`Shopify: ${data.shopifyStatus||'Not specified'}`,
      `Inspiration: ${data.inspirationLinks||'Not specified'}`,`Referral: ${data.referralSource||'Not specified'}`,`Additional notes: ${data.notes||'None'}`].join('\n');
    const db=await pool.connect();
    try{
      await db.query('begin');
      let client=(await db.query(`select * from clients where status='lead' and lower(contact_email)=lower($1) order by created_at desc limit 1`,[email])).rows[0];
      if(client){
        client=(await db.query(`update clients set name=$1,contact_name=$2,contact_phone=coalesce(nullif($3,''),contact_phone),website_url=coalesce(nullif($4,''),website_url),
          notes=$5 where id=$6 returning *`,[companyName,contactName,data.phone,data.websiteUrl,`Latest website intake · ${projectName}`,client.id])).rows[0];
      }else{
        const slug=intakeSlug(companyName);
        for(let attempt=0;attempt<8&&!client;attempt++){ // a taken slug means another try with a longer suffix, never an error for the person filling in the form
          const candidate=attempt===0?slug:`${slug.slice(0,40)}-${randomBytes(attempt<4?3:5).toString('hex')}`;
          client=(await db.query(`insert into clients(slug,name,status,contact_name,contact_email,contact_phone,website_url,notes)
            values($1,$2,'lead',$3,$4,$5,$6,$7) on conflict(slug) do nothing returning *`,[candidate,companyName,contactName,email,data.phone||null,data.websiteUrl||null,`Website intake · ${projectName}`])).rows[0]||null;
        }
        if(!client)throw new Error('could not find a free room name');
      }
      const project=(await db.query(`insert into projects(client_id,name,status,milestone,target_date) values($1,$2,'intake','Brief',$3)
        on conflict(client_id,name) do update set status='intake',milestone='Brief',target_date=coalesce(excluded.target_date,projects.target_date),updated_at=now() returning *`,
        [client.id,projectName,data.targetDate||null])).rows[0];
      const request=(await db.query(`insert into requests(client_id,project_id,type,title,details,status,due_date,intake_data)
        values($1,$2,'project-intake',$3,$4,'submitted',$5,$6) returning *`,[client.id,project.id,`New project intake — ${projectName}`,details,data.targetDate||null,JSON.stringify(data)])).rows[0];
      const message=(await db.query(`insert into project_messages(project_id,client_id,author_role,body) values($1,$2,'client',$3) returning *`,
        [project.id,client.id,`${contactName} submitted a new project brief. ${projectBrief}`.slice(0,5000)])).rows[0];
      await db.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'public-intake',$2,'project',$3)`,
        [client.id,`New project intake from ${companyName}: ${projectName}`,project.id]);
      await db.query('commit');intake={client,project,request,message,data};return intake;
    }catch(error){await db.query('rollback');throw error}finally{db.release()}
  };
  for await(const part of req.parts()){
    if(part.type==='file'){
      await createIntake();
      if(spam){for await(const _chunk of part.file){};continue}
      uploads.push(await storeProjectFile(intake.project,null,'client',part,intake.message.id));
    }else fields[part.fieldname]=part.value;
  }
  await createIntake();
  if(spam)return reply.code(202).send({ok:true});
  let notificationEmailSent=false,confirmationEmailSent=false;
  try{notificationEmailSent=await sendIntakeNotification(intake,uploads)}catch(error){app.log.error({error,projectId:intake.project.id,to:intakeNotificationEmail},'Project intake was saved but notification email failed')}
  try{confirmationEmailSent=await sendIntakeConfirmation(intake)}catch(error){app.log.error({error,projectId:intake.project.id,to:intake.data.email},'Project intake was saved but confirmation email failed')}
  return reply.code(201).send({ok:true,clientId:intake.client.id,projectId:intake.project.id,requestId:intake.request.id,files:uploads.length,
    notificationEmail:intakeNotificationEmail,notificationEmailSent,confirmationEmailSent,
    message:'Your project brief is in. Future Basics will review it and follow up by email.'});
});

// Someone who asked for a sign-in code and was turned away. A website lead is waiting at the door, so staff get one email per lead per day;
// an email we have never seen is only listed in the console (it is often a client using a different address than the one on their room).
async function noteSigninAttempt({email,clientId,kind}){
  await pool.query(`insert into signin_attempts(email,client_id,kind) values($1,$2,$3)
    on conflict(email) do update set attempts=signin_attempts.attempts+1,last_at=now(),client_id=excluded.client_id,kind=excluded.kind`,[email,clientId,kind]);
  if(kind!=='lead'||!clientId)return false;
  const claim=await pool.query(`update signin_attempts set alerted_at=now() where email=$1 and (alerted_at is null or alerted_at<now()-interval '24 hours') returning attempts`,[email]);
  if(!claim.rowCount)return false;
  try{
    const c=(await pool.query('select name,contact_name from clients where id=$1',[clientId])).rows[0];
    const who=c?.contact_name||c?.name||email,link=`${workHubUrl}/clients/${clientId}`;
    return await sendHubEmail({to:intakeNotificationEmail,subject:`${who} is trying to sign in — their room is not active yet`,html:hubEmailShell('A website lead is waiting at the door',
      `<p><strong>${emailEscape(who)}</strong> (${emailEscape(email)}) just asked for a sign-in code. Their room is not active, so they were told it is being set up and that you will email them.</p><p>Activating the room sends them the welcome email and lets them in.</p>${hubButton(link,'Open their room')}`)});
  }catch(e){await pool.query('update signin_attempts set alerted_at=null where email=$1',[email]).catch(()=>{});throw e}
}
app.post('/v1/auth/code', async (req, reply) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const domain = email.split('@')[1];
  if (!domain) return reply.code(400).send({ error: 'Valid email required' });
  const client = await clientForEmail(email);
  if (!client) {
    const lead=(await pool.query(`select id from clients where status='lead' and (lower(contact_email)=$1 or $1=any(allowed_emails)) limit 1`,[email])).rows[0];
    if(lead){noteSigninAttempt({email,clientId:lead.id,kind:'lead'}).catch(err=>app.log.warn({err:err.message},'sign-in attempt not recorded'));return reply.code(403).send({error:"We have your brief — your private project room is being set up. We'll email you the moment it's ready.",code:'LEAD_PENDING'})}
    if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254&&throttle(`signinmiss:${req.ip}`,{limit:20,windowMs:60*60*1000}))noteSigninAttempt({email,clientId:null,kind:'unknown'}).catch(err=>app.log.warn({err:err.message},'sign-in attempt not recorded'));
    return reply.code(403).send({
      error: "We don't currently have any work from you. Start a project here",
      code: 'NO_CLIENT_WORK',
      action: { label: 'Start a project', url: startProjectUrl }
    });
  }
  if(!throttle(`code:${email}`,CODE_ASK)||!throttle(`codeip:${req.ip}`,{limit:30,windowMs:60*60*1000}))return reply.code(429).send(tooManyCodes);
  const code = String(randomInt(100000, 1000000));
  await pool.query('insert into login_codes(email,code_hash,expires_at) values($1,$2,now()+interval \'10 minutes\')', [email, hash(code)]);
  await sendCode(email, code);
  return reply.code(202).send({ ok: true });
});

app.post('/v1/auth/verify', async (req, reply) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const code = cleanCode(typeof req.body?.code === 'string' || typeof req.body?.code === 'number' ? req.body.code : '');
  if(!throttle(`verifyip:${req.ip}`,{limit:60,windowMs:60*60*1000}))return reply.code(429).send(tooManyGuesses);
  const lock=throttles.get(`guess:${email}`);if(lock&&lock.count>CODE_GUESS.limit&&Date.now()-lock.startedAt<=CODE_GUESS.windowMs&&process.env.DEV_BYPASS_AUTH!=='true')return reply.code(429).send(tooManyGuesses);
  // One transaction: the code is only spent once the user row is written. If that write fails or waits out
  // (a lock held elsewhere), the rollback hands the code back instead of burning it on a request that never answered.
  const c = await pool.connect(); let user, client;
  try {
    await c.query('begin');
    const result = await c.query(
      `update login_codes set consumed_at=now() where id=(
        select id from login_codes where email=$1 and code_hash=$2 and consumed_at is null and expires_at>now()
        order by created_at desc limit 1) returning id`, [email, hash(code)]
    );
    if (!result.rowCount) {
      await c.query('rollback');
      // five wrong guesses in a window and every open code for this email is burned: a six-digit code cannot be brute-forced
      if (email && !throttle(`guess:${email}`, CODE_GUESS)) { await c.query('update login_codes set consumed_at=now() where email=$1 and consumed_at is null', [email]).catch(() => {}); return reply.code(429).send(tooManyGuesses); }
      return reply.code(401).send({ error: 'Invalid or expired code' });
    }
    throttles.delete(`guess:${email}`);
    client = await clientForEmail(email, c);
    if (!client) { await c.query('rollback'); return reply.code(403).send({ error: 'Client access is no longer active' }); }
    const role = email.split('@')[1] === 'thefuturebasics.com' ? 'admin' : 'client';
    user = (await c.query(
      `insert into users(client_id,email,role,email_verified_at) values($1,$2,$3,now()) on conflict(email)
       do update set client_id=excluded.client_id,role=excluded.role,email_verified_at=coalesce(users.email_verified_at,now()) returning *`, [client.id, email, role]
    )).rows[0];
    await c.query('commit');
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  const token = await new SignJWT({ sub: user.id, clientId: client.id, client: client.slug, role: user.role, email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
  return { token, user: { id: user.id, email, role: user.role }, client: { id: client.id, slug: client.slug, name: client.name } };
});
app.get('/v1/auth/google/start', async (_req, reply) => {
  if (!googleSsoEnabled) return reply.code(503).send({ error: 'Google Workspace sign-in is not configured yet' });
  const state = await new SignJWT({ nonce: randomBytes(16).toString('hex') })
    .setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-google-oauth-state')
    .setAudience(googleClientId).setIssuedAt().setExpirationTime('10m').sign(secret);
  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    hd: 'thefuturebasics.com',
    prompt: 'select_account'
  });
  return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});
app.get('/v1/auth/google/callback', async (req, reply) => {
  const fail = message => reply.redirect(`${workHubUrl}/?sso-error=${encodeURIComponent(message)}`);
  try {
    if (req.query?.error) return fail('Google sign-in was cancelled');
    const code = String(req.query?.code || '');
    const state = String(req.query?.state || '');
    if (!googleSsoEnabled || !code || !state) return fail('Google sign-in could not be completed');
    await jwtVerify(state, secret, { issuer: 'future-basics-google-oauth-state', audience: googleClientId });
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: googleClientId, client_secret: googleClientSecret, redirect_uri: googleRedirectUri, grant_type: 'authorization_code' })
    });
    const googleTokens = await tokenResponse.json();
    if (!tokenResponse.ok || !googleTokens.id_token) throw new Error('Google token exchange failed');
    const { payload } = await jwtVerify(googleTokens.id_token, googleJwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: googleClientId
    });
    const email = String(payload.email || '').trim().toLowerCase();
    if (payload.email_verified !== true || payload.hd !== 'thefuturebasics.com' || !email.endsWith('@thefuturebasics.com')) {
      return fail('Use a verified Future Basics Google Workspace account');
    }
    const client = (await pool.query("select * from clients where slug='future-basics' and status='active'")).rows[0];
    if (!client) return fail('Future Basics staff access is not active');
    const user = (await pool.query(
      `insert into users(client_id,email,role) values($1,$2,'admin') on conflict(email)
       do update set client_id=excluded.client_id,role='admin' returning *`, [client.id, email]
    )).rows[0];
    const token = await new SignJWT({ sub: user.id, clientId: client.id, client: client.slug, role: 'admin', email })
      .setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
    return reply.redirect(`${workHubUrl}/#google-session=${encodeURIComponent(token)}`);
  } catch (error) {
    app.log.warn({ error }, 'Google Workspace sign-in failed');
    return fail('Google sign-in could not be completed');
  }
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

const sendAdmin = (_req, reply) => reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./admin.html',import.meta.url),'utf8'));
const sendClientHub = (_req, reply) => reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./client.html',import.meta.url),'utf8'));
app.get('/', async (req, reply) => {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return host === 'work.thefuturebasics.com' ? sendAdmin(req, reply) : sendClientHub(req, reply);
});
app.get('/admin', sendAdmin);
app.get('/clients/:id', sendAdmin);
app.get('/platform', sendAdmin);
app.get('/hub', sendClientHub);
app.get('/projects/:id', async (req,reply)=>String(req.headers.host||'').toLowerCase().startsWith('work.')?sendAdmin(req,reply):sendClientHub(req,reply));
// Tech pack page: editor on work., read-only viewer on the client hub, token viewer for factories.
const sendTechPack=(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./techpack.html',import.meta.url),'utf8'));
const sendStart=(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./start.html',import.meta.url),'utf8'));
app.get('/start', sendStart);
// Client guide: how the hub works, with screenshots and an FAQ, plus the same guide as a PDF.
const helpAssets=new URL('./help-assets/',import.meta.url);
// The trade-fair page (the QR on the cards): brands start a tech pack, factories sign up for a referral link. Bilingual (see hub-i18n.js).
app.get('/booth',(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./booth.html',import.meta.url),'utf8')));
app.get('/fair',(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./fair.html',import.meta.url),'utf8')));
app.get('/hub-i18n.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./hub-i18n.js',import.meta.url),'utf8')));
app.get('/qrcode.js',(_req,reply)=>reply.header('cache-control','public, max-age=86400').type('application/javascript').send(readFileSync(new URL('./qrcode.js',import.meta.url),'utf8'))); // qrcode-generator, MIT (Kazuhiko Arase)
app.get('/help',(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./help.html',import.meta.url),'utf8')));
app.get('/how-it-works',(_req,reply)=>reply.redirect('/help'));
app.get('/help/guide.pdf',(_req,reply)=>{try{return reply.header('cache-control','public, max-age=300').header('content-disposition','inline; filename="future-basics-client-hub-guide.pdf"').type('application/pdf').send(readFileSync(new URL('future-basics-client-hub-guide.pdf',helpAssets)))}catch{return reply.code(404).send({error:'Guide PDF not built yet'})}});
app.get('/help/assets/:file',(req,reply)=>{const f=String(req.params.file||'');if(!/^[a-z0-9-]+\.(jpg|png|webp)$/.test(f))return reply.code(404).send({error:'Not found'});try{return reply.header('cache-control','public, max-age=86400').type(f.endsWith('.png')?'image/png':f.endsWith('.webp')?'image/webp':'image/jpeg').send(readFileSync(new URL(f,helpAssets)))}catch{return reply.code(404).send({error:'Not found'})}});
// Home-screen icon and web app manifest: the hub installs as a standalone app, the work console keeps opening in the browser so Google sign-in round-trips cleanly.
const iconDir=new URL('./icons/',import.meta.url);
app.get('/manifest.webmanifest',(req,reply)=>{const work=/^work\./i.test(String(req.headers.host||''));return reply.header('cache-control','public, max-age=3600').type('application/manifest+json').send({name:work?'Future Basics Work':'Future Basics',short_name:work?'FB Work':'Future Basics',start_url:'/',scope:'/',display:work?'browser':'standalone',background_color:'#141416',theme_color:'#141416',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:'/icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]})});
// The tech pack tool installs as its own home-screen app: a separate id and icon, opening straight into /start.
app.get('/tech-pack.webmanifest',(_req,reply)=>reply.header('cache-control','public, max-age=3600').type('application/manifest+json').send({id:'/start',name:'Future Basics Tech Pack',short_name:'Tech Pack',description:'Turn any image into a factory-ready tech pack.',start_url:'/start?utm_source=homescreen&utm_medium=app',scope:'/',display:'standalone',background_color:'#f3f4f1',theme_color:'#141416',icons:[{src:'/icons/techpack-v3-192.png',sizes:'192x192',type:'image/png'},{src:'/icons/techpack-v3-512.png',sizes:'512x512',type:'image/png'},{src:'/icons/techpack-v3-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]}));
app.get('/icons/:file',(req,reply)=>{const f=String(req.params.file||'');if(!/^[a-z0-9-]+\.(png|svg)$/.test(f))return reply.code(404).send({error:'Not found'});try{return reply.header('cache-control','public, max-age=604800').type(f.endsWith('.svg')?'image/svg+xml':'image/png').send(readFileSync(new URL(f,iconDir)))}catch{return reply.code(404).send({error:'Not found'})}});
app.get('/apple-touch-icon.png',(_req,reply)=>reply.redirect('/icons/apple-touch-icon.png'));
app.get('/favicon.ico',(_req,reply)=>reply.redirect('/icons/icon-192.png'));
// The shared chat thread (script and styles), used by the Message Center, the room's project thread and the hub's project messages.
app.get('/ball.js',(_req,reply)=>reply.header('cache-control','public, max-age=3600').type('application/javascript').send(readFileSync(new URL('./ball.js',import.meta.url),'utf8')));
app.get('/elec.js',(_req,reply)=>reply.header('cache-control','public, max-age=3600').type('application/javascript').send(readFileSync(new URL('./elec.js',import.meta.url),'utf8')));
app.get('/pantone-c.js',(_req,reply)=>reply.header('cache-control','public, max-age=3600').type('application/javascript').send(readFileSync(new URL('./pantone-c.js',import.meta.url),'utf8')));
app.get('/stl-viewer.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./stl-viewer.js',import.meta.url),'utf8')));
app.get('/tp-units.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./tp-units.js',import.meta.url),'utf8')));
app.get('/tp-i18n.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./tp-i18n.js',import.meta.url),'utf8')));
app.get('/chat.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./chat.js',import.meta.url),'utf8')));
// Self-hosted fonts (see src/fonts/fonts.css): the file names are fixed, so they cache for a year.
const FONT_FILES=new Set(['fonts.css','space-grotesk-latin.woff2','space-grotesk-latin-ext.woff2','ibm-plex-mono-400.woff2','ibm-plex-mono-500.woff2']);
app.get('/fonts/:file',(req,reply)=>{const f=String(req.params.file);if(!FONT_FILES.has(f))return reply.code(404).send({error:'Not found'});
  return reply.header('cache-control',f.endsWith('.css')?'public, max-age=3600':'public, max-age=31536000, immutable').header('access-control-allow-origin','*').type(f.endsWith('.css')?'text/css':'font/woff2').send(readFileSync(new URL('./fonts/'+f,import.meta.url)))});
app.get('/chat.css',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('text/css').send(readFileSync(new URL('./chat.css',import.meta.url),'utf8')));
app.get('/photo-prep.js',(_req,reply)=>reply.header('cache-control','public, max-age=300').type('application/javascript').send(readFileSync(new URL('./photo-prep.js',import.meta.url),'utf8')));
app.get('/tech-packs/new', sendStart);
app.get('/tech-packs/:productId', sendTechPack);
const sendConsign=(_req,reply)=>reply.header('cache-control','no-store, max-age=0').type('text/html').send(readFileSync(new URL('./consign.html',import.meta.url),'utf8'));
app.get('/consign', sendConsign);
app.get('/consign/:id', sendConsign);
app.get('/tp/:token', sendTechPack);
app.get('/v1/public/config', async () => ({ workHubUrl, clientHubUrl, startProjectUrl, googleSsoEnabled }));
app.get('/v1/session', { preHandler: authenticate }, async (req, reply) => {
  const client = (await pool.query('select id,slug,name,status,archived_at from clients where id=$1', [req.auth.clientId])).rows[0];
  if (!client || (req.auth.role !== 'admin' && (client.archived_at || ['archive','archived'].includes(client.status)))) return reply.code(404).send({ error: 'Client workspace not found' });
  return { user: { id: req.auth.sub, email: req.auth.email, role: req.auth.role, preview: req.auth.preview === true }, client, workHubUrl, clientHubUrl };
});
app.post('/v1/admin/clients/:id/preview-session',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select id,slug,name from clients where id=$1 and slug<>\'future-basics\'',[req.params.id])).rows[0];if(!client)return reply.code(404).send({error:'Client not found'});
  const code=randomBytes(32).toString('base64url');await pool.query(`insert into preview_sessions(code_hash,admin_user_id,client_id,expires_at)
    values($1,$2,$3,now()+interval '5 minutes')`,[hash(code),req.auth.sub,client.id]);
  const hubUrl=clientHubUrl;
  return {url:`${hubUrl}#client-preview=${encodeURIComponent(code)}`,expiresInSeconds:300,sessionMinutes:15,client};
});
app.get('/v1/admin/dashboard', {preHandler:[authenticate,adminOnly]}, async ()=>{
  const learning=aggregateDiffs(await learningRows(300).catch(()=>[]));
  const clients=await pool.query(`select c.*,
    count(distinct p.id) filter(where not exists(select 1 from projects archived_product_project where archived_product_project.id=p.project_id
      and (archived_product_project.archived_at is not null or archived_product_project.status in ('archive','archived'))))::int product_count,
    count(distinct p.id)::int all_product_count,count(distinct r.id)::int request_count,
    count(distinct pr.id) filter(where pr.archived_at is null and pr.status not in ('archive','archived'))::int project_count,
    count(distinct pr.id)::int all_project_count,
    (select sp.shopify_image_url from products sp where sp.client_id=c.id and sp.shopify_image_url is not null order by sp.shopify_updated_at desc nulls last limit 1) cover_image_url,
    (select tp.product_id from tech_packs tp join products sp on sp.id=tp.product_id where sp.client_id=c.id and ${PACK_HAS_IMAGE_SQL('tp')} order by tp.updated_at desc limit 1) cover_rendering_product_id,
    (select coalesce(sum(sp.shopify_inventory_total),0)::int from products sp where sp.client_id=c.id) shopify_inventory_total,
    (select coalesce(sum(py.amount_cents),0)::bigint from payments py where py.client_id=c.id) paid_cents,
    (select count(*)::int from payments py where py.client_id=c.id) payment_count
    from clients c left join products p on p.client_id=c.id left join requests r on r.client_id=c.id left join projects pr on pr.client_id=c.id
    where c.slug<>'future-basics' group by c.id order by c.name`);
  const actions=await pool.query(`select a.id,a.title,a.status,p.title product_title,c.name client_name,av.version asset_version,ast.name asset_name
    from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id
    left join asset_versions av on av.id=a.asset_version_id left join assets ast on ast.id=av.asset_id
    where a.status='pending' and c.archived_at is null and c.status not in ('archive','archived')
    and not exists(select 1 from projects archived_project where archived_project.id=p.project_id
      and (archived_project.archived_at is not null or archived_project.status in ('archive','archived')))
    order by a.requested_at`);
  const productionAlerts=await pool.query(`select pr.id,pr.po_number,pr.status,pr.eta_date,p.title product_title,c.name client_name
    from production_runs pr join products p on p.id=pr.product_id join clients c on c.id=p.client_id
    where (pr.status in ('blocked','delayed') or (pr.eta_date is not null and pr.eta_date<current_date and pr.status not in ('complete','delivered')))
    and c.archived_at is null and c.status not in ('archive','archived')
    and not exists(select 1 from projects archived_project where archived_project.id=p.project_id
      and (archived_project.archived_at is not null or archived_project.status in ('archive','archived')))
    order by pr.eta_date nulls last`);
  const collaboration=await pool.query(`select n.*,c.name client_name from notifications n join clients c on c.id=n.client_id
    where n.read_at is null and c.archived_at is null and c.status not in ('archive','archived') order by n.created_at desc limit 30`);
  for(const c of clients.rows)if(!c.cover_image_url&&c.cover_rendering_product_id)c.cover_image_url=renderingUrl(c.cover_rendering_product_id);
  const activeClients=clients.rows.filter(client=>!client.archived_at&&!['archive','archived'].includes(client.status));
  const archivedClients=clients.rows.filter(client=>client.archived_at||['archive','archived'].includes(client.status));
  const queues=await buildQueues(pool,{learning}).catch(err=>{app.log.warn({err:err.message},'work queues failed');reportError('web',`work queues: ${err.message}`);return null});
  return {clients:activeClients,archivedClients,actions:actions.rows,productionAlerts:productionAlerts.rows,collaboration:collaboration.rows,learning,queues};
});
app.post('/v1/admin/shopify/tech-pack-product',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!shopifyConfigured())return reply.code(503).send({error:'Shopify is not connected'});
  return ensureTechPackProduct();
});
// ---- Platform health (staff only): live checks of every connection, background jobs, settings that are quietly wrong, and insights ----
const SHOPIFY_REQUIRED_SCOPES=['read_products','write_products','read_inventory','read_customers','write_draft_orders','read_draft_orders','read_orders'];
let healthCache=null;
app.get('/v1/admin/platform/health',{preHandler:[authenticate,adminOnly]},async req=>{
  if(!req.query?.fresh&&healthCache&&Date.now()-healthCache.at<15_000)return healthCache.body;
  const telemetry=telemetrySnapshot(),billing=await billingSummary(),techPackProduct=Boolean(await techPackProductId().catch(()=>''));
  const fail=(await pool.query(`select (select count(*) from notifications where type='tech-pack-ai' and created_at>now()-interval '24 hours' and title ilike '%credit balance%')::int credit,
    (select count(*) from tech_packs where ai_status='failed' and ai_error ilike '%on our side%' and ai_started_at>now()-interval '24 hours')::int our_side`)).rows[0];
  const specChecks=(await pool.query(`select count(*) filter(where status='done')::int done24,count(*) filter(where status='done' and render_status='failed')::int "renderFailed24",count(*) filter(where status='failed')::int failed24 from tech_pack_checks where created_at>now()-interval '24 hours'`)).rows[0];
  const studioStats=await studioToday();
  const meshStats=(await pool.query(`select count(*) filter(where status='done')::int done24,count(*) filter(where status='failed')::int failed24 from tech_pack_models where created_at>now()-interval '24 hours'`)).rows[0];
  const checks=await runChecks({pool,telemetry,shopifyConfigured,shopifyGraphql,SHOP_CONNECTION_QUERY,APP_SCOPES_QUERY,missingScopes,requiredScopes:SHOPIFY_REQUIRED_SCOPES,techPackProduct,membershipUrl:MEMBERSHIP_URL,aiModel:AI_MODEL,imageConfig,meshConfig,meshStats,studioStats,specChecks:{done24:specChecks.done24,renderFailed24:specChecks.renderFailed24,failed24:specChecks.failed24},cutoutProvider,uploadDir,recentAiFailures:{credit:fail.credit,ourSide:fail.our_side},fresh:Boolean(req.query?.fresh),env:process.env});
  // The store connection above only says Shopify answers. This says whether payments are actually landing in the ledger.
  const payState=(await getSetting('paymentSync'))||{},payStats=await paymentStats().catch(()=>({count:0,totalCents:0,lastDay:0,paidButLocked:0,unlinkedPayers:0})),payVerdict=paymentSyncStatus({configured:shopifyConfigured(),state:payState,stats:payStats,everyMs:PAYMENT_SYNC_EVERY_MS});
  const ago=t=>{if(!t)return 'never';const m=Math.round((Date.now()-new Date(t).getTime())/60000);return m<1?'just now':m<90?`${m} min ago`:m<2880?`${Math.round(m/60)} hours ago`:`${Math.round(m/1440)} days ago`};
  const payCheck={id:'payments',name:'Shopify payments (sync)',group:'integration',status:payVerdict.status,summary:payVerdict.summary,latencyMs:payState.lastMs??null,
    facts:shopifyConfigured()?[['Last successful run',ago(payState.lastOkAt)],['Last run read',`${payState.scanned??0} paid ${payState.scanned===1?'order':'orders'} · ${payState.imported??0} new · ${payState.unlocked??0} ${payState.unlocked===1?'pack':'packs'} unlocked`],['Not matched to a room',String((payState.unmatched||[]).length)],['In the ledger',`${payStats.count} ${payStats.count===1?'payment':'payments'} · $${(payStats.totalCents/100).toLocaleString()}`],['Last 24 hours',`${payStats.lastDay} ${payStats.lastDay===1?'payment':'payments'}`],['Paid but still locked',String(payStats.paidButLocked)],['Payers without a store customer link',String(payStats.unlinkedPayers)],['Store spend last refreshed',ago(payStats.lastSpendRefresh)]]:[]};
  checks.splice(Math.max(1,checks.findIndex(c=>c.id==='shopify')+1),0,payCheck);
  const recentPayments=(await pool.query(`select py.id,py.kind,py.title,py.amount_cents,py.shopify_order_name,py.paid_at,py.source,c.name client_name from payments py join clients c on c.id=py.client_id order by py.paid_at desc limit 8`).catch(()=>({rows:[]}))).rows;
  const events=(await pool.query('select id,at,source,level,message from platform_events order by id desc limit 25').catch(()=>({rows:[]}))).rows;
  const config=configChecks({env:process.env,billing,shopifyConfigured,techPackProduct});
  const body={generatedAt:new Date().toISOString(),overall:overallStatus([...checks,...config.map(c=>({id:'setting',status:c.status}))]),checks,config,
    jobs:telemetry.jobs.map(j=>({...j,health:jobHealth(j)})),telemetry:{since:telemetry.since,uptimeSec:telemetry.uptimeSec,integrations:telemetry.integrations,requests:telemetry.requests,eventLoop:telemetry.eventLoop},events,payments:{recent:recentPayments,unmatched:payState.unmatched||[],lastRunAt:payState.lastRunAt||null,lastOkAt:payState.lastOkAt||null,lastError:payState.lastError||null,runs:payState.runs||0,stats:payStats}};
  healthCache={at:Date.now(),body};return body;
});
app.get('/v1/admin/platform/insights',{preHandler:[authenticate,adminOnly]},async req=>platformInsights(pool,{days:req.query?.days,priceCents:TECH_PACK_PRICE_CENTS}));
app.get('/v1/admin/shopify/status',{preHandler:[authenticate,adminOnly]},async()=>{
  const result={configured:shopifyConfigured(),connected:false,techPackProduct:await techPackProductId().catch(()=>''),storeDomain:process.env.SHOPIFY_STORE_DOMAIN||'thefuturebasics.com',
    apiVersion:process.env.SHOPIFY_API_VERSION||'2026-07',authentication:process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?'legacy-token':'client-credentials',
    requiredScopes:['read_products','write_products','read_inventory','read_customers','write_draft_orders','read_draft_orders','read_orders']};
  if(!result.configured)return result;
  try{const data=await shopifyGraphql(SHOP_CONNECTION_QUERY);const out={...result,connected:true,shopName:data.shop.name,myshopifyDomain:data.shop.myshopifyDomain};
    try{const granted=((await shopifyGraphql(APP_SCOPES_QUERY)).currentAppInstallation?.accessScopes||[]).map(x=>x.handle);out.grantedScopes=granted;out.missingScopes=missingScopes(granted,result.requiredScopes)}
    catch(error){out.scopesError=error.message}
    return out}
  catch(error){return {...result,error:error.message}}
});
app.get('/v1/admin/resend/status',{preHandler:[authenticate,adminOnly]},async()=>({
  configured:Boolean(process.env.RESEND_API_KEY&&process.env.AUTH_FROM_EMAIL),
  fromEmail:process.env.AUTH_FROM_EMAIL||null,
  message:process.env.RESEND_API_KEY&&process.env.AUTH_FROM_EMAIL?'Ready for a live sign-in test':'Add RESEND_API_KEY and AUTH_FROM_EMAIL'
}));

function normalizeShopifyProductReference(value){
  const raw=String(value||'').trim();
  if(!raw)return {};
  const gid=raw.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
  if(gid)return {id:`gid://shopify/Product/${gid[1]}`};
  if(/^\d+$/.test(raw))return {id:`gid://shopify/Product/${raw}`};
  const adminId=raw.match(/\/products\/(\d+)(?:[/?#]|$)/i);
  if(adminId)return {id:`gid://shopify/Product/${adminId[1]}`};
  try{
    const url=new URL(raw),match=url.pathname.match(/\/products\/([^/?#]+)/i);
    if(match)return {handle:decodeURIComponent(match[1])};
  }catch{}
  return {handle:raw.replace(/^\/+|\/+$/g,'')};
}

async function resolveShopifyProduct(productId,handle){
  const primary=normalizeShopifyProductReference(productId),secondary=normalizeShopifyProductReference(handle);
  const id=primary.id||secondary.id;
  if(id){
    const item=(await shopifyGraphql(PRODUCT_IDS_SYNC_QUERY,{ids:[id]})).nodes?.[0];
    if(!item)throw Object.assign(new Error('Shopify product not found. Check the product URL or ID.'),{statusCode:404});
    return item;
  }
  const candidate=secondary.handle||primary.handle;
  if(!candidate)throw Object.assign(new Error('Paste a Shopify admin product URL, numeric product ID, GID, or storefront handle.'),{statusCode:400});
  const normalized=candidate.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  let item=(await shopifyGraphql(PRODUCT_SYNC_QUERY,{query:`handle:${normalized}`})).products?.nodes?.[0];
  if(!item&&candidate!==normalized)item=(await shopifyGraphql(PRODUCT_SYNC_QUERY,{query:`title:"${candidate.replace(/"/g,'\\\"')}"`})).products?.nodes?.[0];
  if(!item)throw Object.assign(new Error('Shopify product not found. Paste its admin product URL for an exact match.'),{statusCode:404});
  return item;
}

async function hydrateLinkedShopifyProduct(localProductId,item){
  const variants=item.variants?.nodes||[],primary=variants[0]||null,image=item.featuredMedia?.preview?.image||null;
  return (await pool.query(`update products set shopify_product_id=$1,shopify_variant_id=$2,shopify_handle=$3,title=$4,
    shopify_status=$5,shopify_inventory_total=$6,shopify_variants=$7,shopify_synced_at=now(),shopify_image_url=$8,
    shopify_image_alt=$9,shopify_updated_at=$10,description_html=$11,vendor=$12,product_type=$13,
    shopify_publish_error=null,updated_at=now() where id=$14 returning *`,[
    item.id,primary?.id||null,item.handle,item.title,item.status,item.totalInventory,JSON.stringify(variants),
    image?.url||null,image?.altText||item.title,item.updatedAt,item.descriptionHtml||null,item.vendor||null,item.productType||null,
    localProductId
  ])).rows[0];
}

async function repairPendingShopifyLinks(){
  if(!shopifyConfigured())return;
  const rows=(await pool.query(`select id,shopify_product_id,shopify_handle from products
    where shopify_product_id is not null and (shopify_synced_at is null or shopify_product_id not like 'gid://shopify/Product/%')`)).rows;
  for(const row of rows){
    try{await hydrateLinkedShopifyProduct(row.id,await resolveShopifyProduct(row.shopify_product_id,row.shopify_handle))}
    catch(error){app.log.warn({productId:row.id,error:error.message},'Unable to repair Shopify product link')}
  }
}

app.post('/v1/admin/shopify/sync',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select * from clients where id=$1',[req.body?.clientId])).rows[0];
  if(!client)return reply.code(404).send({error:'Client not found'});
  const project=(await pool.query(`insert into projects(client_id,name,status,milestone) values($1,'General development','active','In progress')
    on conflict(client_id,name) do update set updated_at=now() returning *`,[client.id])).rows[0];
  let customer=null,customerError=null;
  if(!client.shopify_customer_id)await linkShopifyCustomer(client).catch(()=>{});
  if(client.shopify_customer_id){
    try{
      customer=(await shopifyGraphql(CUSTOMER_SYNC_QUERY,{id:client.shopify_customer_id})).customer;
      if(customer)await pool.query(`update clients set contact_name=coalesce(contact_name,$1),contact_email=coalesce(contact_email,$2),
        contact_phone=coalesce(contact_phone,$3),total_spent_cents=$4,shopify_order_count=$5,shopify_currency=$6,
        shopify_default_address=$7,shopify_synced_at=now() where id=$8`,[
        customer.displayName||[customer.firstName,customer.lastName].filter(Boolean).join(' ')||null,
        customer.defaultEmailAddress?.emailAddress||null,customer.defaultPhoneNumber?.phoneNumber||null,
        Math.round(Number(customer.amountSpent?.amount||0)*100),Number(customer.numberOfOrders||0),customer.amountSpent?.currencyCode||'USD',
        customer.defaultAddress?JSON.stringify(customer.defaultAddress):null,client.id]);
    }catch(error){customerError=error.message}
  }
  const query=String(req.body?.query||`tag:${client.slug}`);
  const linkedIds=(await pool.query('select shopify_product_id from products where client_id=$1 and shopify_product_id is not null',[client.id])).rows.map(x=>x.shopify_product_id);
  const [searched,linked]=await Promise.all([
    shopifyGraphql(PRODUCT_SYNC_QUERY,{query}),
    linkedIds.length?shopifyGraphql(PRODUCT_IDS_SYNC_QUERY,{ids:linkedIds}):Promise.resolve({nodes:[]})
  ]);
  const items=[...(searched.products.nodes||[]),...(linked.nodes||[])].filter(Boolean);
  const data={products:{nodes:[...new Map(items.map(item=>[item.id,item])).values()]}};
  const synced=[];
  for(const item of data.products.nodes){
    const variants=item.variants.nodes||[],primary=variants[0]||null;
    const image=item.featuredMedia?.preview?.image||null;
    const product=(await pool.query(`insert into products(client_id,project_id,shopify_product_id,shopify_variant_id,shopify_handle,title,shopify_status,shopify_inventory_total,shopify_variants,shopify_synced_at,shopify_image_url,shopify_image_alt,shopify_updated_at,description_html,vendor,product_type)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10,$11,$12,$13,$14,$15) on conflict(client_id,shopify_handle) do update set shopify_product_id=excluded.shopify_product_id,
      shopify_variant_id=excluded.shopify_variant_id,title=excluded.title,shopify_status=excluded.shopify_status,shopify_inventory_total=excluded.shopify_inventory_total,
      shopify_variants=excluded.shopify_variants,shopify_image_url=excluded.shopify_image_url,shopify_image_alt=excluded.shopify_image_alt,
      shopify_updated_at=excluded.shopify_updated_at,description_html=excluded.description_html,vendor=excluded.vendor,product_type=excluded.product_type,
      project_id=coalesce(products.project_id,excluded.project_id),shopify_synced_at=now(),updated_at=now() returning *`,
      [client.id,project.id,item.id,primary?.id||null,item.handle,item.title,item.status,item.totalInventory,JSON.stringify(variants),image?.url||null,image?.altText||item.title,item.updatedAt,item.descriptionHtml||null,item.vendor||null,item.productType||null])).rows[0];
    await pool.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
      from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)
      where not exists(select 1 from milestones where product_id=$1)`,[product.id]);
    synced.push({id:product.id,title:product.title,inventory:product.shopify_inventory_total,variants:variants.length});
  }
  return {query,count:synced.length,products:synced,customerSynced:Boolean(customer),customerError,syncedAt:new Date().toISOString()};
});
app.post('/v1/admin/clients',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,slug,emailDomains=[],allowedEmails=[],contactName,contactEmail,contactPhone,websiteUrl,notes,shopifyCustomerId,techPackComped}=req.body||{};if(!name||!slug)return reply.code(400).send({error:'name and slug required'});
  const domains=await validateClientDomains(emailDomains);
  const client=(await pool.query(`insert into clients(name,slug,email_domains,allowed_emails,contact_name,contact_email,contact_phone,website_url,notes,shopify_customer_id,tech_pack_comped)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[name,slug,domains,normalizeEmails(allowedEmails),contactName||null,contactEmail||null,contactPhone||null,websiteUrl||null,notes||null,shopifyCustomerId||null,techPackComped===true||techPackComped==='true'])).rows[0];
  await pool.query(`insert into projects(client_id,name,status,milestone) values($1,'General development','active','In progress') on conflict(client_id,name) do nothing`,[client.id]);
  return client;
});
app.post('/v1/admin/clients/:id/products',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {title,handle,shopifyProductId,descriptionHtml,vendor,productType,templateSuffix,projectId}=req.body||{};if(!title)return reply.code(400).send({error:'title required'});
  const prepRef=await preparePhotos(req.body?.referencePhotos);if(prepRef.bad)return reply.code(400).send({error:`Reference photo ${prepRef.bad} could not be opened — re-save it as a JPG or PNG`});
  const referencePhotos=prepRef.photos;
  const client=(await pool.query(`select id from clients where id=$1 and archived_at is null and status not in ('archive','archived')`,[req.params.id])).rows[0];
  if(!client)return reply.code(404).send({error:'Active client room not found'});
  const project=projectId?(await pool.query(`select id from projects where id=$1 and client_id=$2
    and archived_at is null and status not in ('archive','archived')`,[projectId,req.params.id])).rows[0]:null;
  if(projectId&&!project)return reply.code(400).send({error:'Select a valid project'});
  let p=(await pool.query(`insert into products(client_id,project_id,title,shopify_handle,shopify_product_id,description_html,vendor,product_type,template_suffix)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[req.params.id,project?.id||null,title,handle||null,shopifyProductId||null,descriptionHtml||null,vendor||null,productType||null,templateSuffix||null])).rows[0];
  await pool.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
    from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)`,[p.id]);
  await flow(p.id,'product-created',{owner:'future-basics',actorId:req.auth.sub});
  if((shopifyProductId||handle)&&shopifyConfigured()){try{p=await hydrateLinkedShopifyProduct(p.id,await resolveShopifyProduct(shopifyProductId||null,handle||null))||p}catch(e){app.log.warn({err:e.message,productId:p.id},'linked Shopify product not hydrated at creation')}}
  const autoDraft=await autoDraftProduct(p,{photos:referencePhotos,actorId:req.auth.sub,reason:'created'}).catch(e=>{app.log.warn({err:e.message,productId:p.id},'auto draft failed');return {ai:'error'}});
  return {...p,autoDraft};
});
app.patch('/v1/admin/products/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {stage,riskLevel,owner,targetDate,shopifyProductId,shopifyHandle,descriptionHtml,vendor,productType,templateSuffix}=req.body||{};
  let p=(await pool.query(`update products set current_stage=coalesce($1,current_stage),risk_level=coalesce($2,risk_level),
    owner=coalesce($3,owner),target_date=coalesce($4,target_date),shopify_product_id=coalesce($5,shopify_product_id),
    shopify_handle=coalesce($6,shopify_handle),description_html=coalesce($7,description_html),vendor=coalesce($8,vendor),
    product_type=coalesce($9,product_type),template_suffix=coalesce($10,template_suffix),updated_at=now() where id=$11 returning *`,
    [stage||null,riskLevel||null,owner||null,targetDate||null,shopifyProductId||null,shopifyHandle||null,descriptionHtml||null,vendor||null,productType||null,templateSuffix||null,req.params.id])).rows[0];
  if(!p)return reply.code(404).send({error:'Product not found'});
  if(shopifyProductId||shopifyHandle)p=await hydrateLinkedShopifyProduct(p.id,await resolveShopifyProduct(shopifyProductId||p.shopify_product_id,shopifyHandle||p.shopify_handle));
  return p;
});

const moneyMetafield = cents => JSON.stringify({amount:(Number(cents)/100).toFixed(2),currency_code:'USD'});
const metafield = (key,value,type) => value===null||value===undefined||value===''?null:{namespace:'product_dev',key,value:String(value),type};
const buildProductMetafields = row => [
  metafield('internal_unit_cost',row.unit_cost_cents==null?null:moneyMetafield(row.unit_cost_cents),'money'),
  metafield('wholesale',row.wholesale_cents==null?null:moneyMetafield(row.wholesale_cents),'money'),
  metafield('srp',row.srp_cents==null?null:moneyMetafield(row.srp_cents),'money'),
  metafield('pricing_tiers',Array.isArray(row.pricing_tiers)&&row.pricing_tiers.length?JSON.stringify(row.pricing_tiers.map(({unit_cost_cents,...tier})=>tier)):null,'json'),
  metafield('internal_pricing_tiers',Array.isArray(row.pricing_tiers)&&row.pricing_tiers.length?JSON.stringify(row.pricing_tiers):null,'json'),
  metafield('material',row.material,'single_line_text_field'),
  metafield('decoration',row.decoration_method||row.brief_decoration,'single_line_text_field'),
  metafield('moq',row.moq,'number_integer'),
  metafield('lead_time',row.lead_time_days?`${row.lead_time_days} days`:null,'single_line_text_field'),
  metafield('colorway',(row.colorways||[]).join(', '),'single_line_text_field'),
  metafield('dimensions',row.artwork_width_in&&row.artwork_height_in?`${row.artwork_width_in} × ${row.artwork_height_in} in`:null,'single_line_text_field'),
  metafield('notes',row.config_notes||row.brief_notes,'multi_line_text_field'),
  metafield('client_name',row.client_name,'single_line_text_field'),
  metafield('client_access_tag',row.client_slug,'single_line_text_field'),
  metafield('development_status',row.configuration_status||row.current_stage,'single_line_text_field'),
  metafield('construction',row.construction,'multi_line_text_field'),
  metafield('packaging',row.config_packaging||row.brief_packaging,'multi_line_text_field'),
  metafield('fulfillment',row.config_fulfillment||row.brief_fulfillment,'multi_line_text_field'),
  metafield('sample_required',row.sample_required==null?null:String(row.sample_required),'boolean'),
  metafield('target_delivery',row.delivery_date||row.target_date,'date')
].filter(Boolean);

app.post('/v1/admin/products/:id/publish-shopify',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`select p.*,c.name client_name,c.slug client_slug,
      pc.material,pc.construction,pc.decoration_method,pc.artwork_width_in,pc.artwork_height_in,pc.colorways,
      pc.moq,pc.sample_required,pc.lead_time_days,pc.notes config_notes,pc.status configuration_status,
      pc.packaging config_packaging,pc.fulfillment config_fulfillment,
      pb.decoration brief_decoration,pb.notes brief_notes,pb.packaging brief_packaging,pb.fulfillment brief_fulfillment,pb.delivery_date,
      pt.unit_cost_cents,pt.wholesale_cents,pt.srp_cents,
      (select coalesce(jsonb_agg(jsonb_build_object('minimum_quantity',tier.min_quantity,'maximum_quantity',tier.max_quantity,
        'unit_cost_cents',tier.unit_cost_cents,'wholesale_cents',tier.wholesale_cents,'srp_cents',tier.srp_cents,
        'lead_time_days',tier.lead_time_days) order by tier.min_quantity),'[]'::jsonb) from price_tiers tier where tier.product_id=p.id) pricing_tiers
    from products p join clients c on c.id=p.client_id
    left join product_configurations pc on pc.product_id=p.id
    left join product_briefs pb on pb.product_id=p.id
    left join lateral (select unit_cost_cents,wholesale_cents,srp_cents from price_tiers where product_id=p.id order by min_quantity limit 1) pt on true
    where p.id=$1`,[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Product not found'});
  const base={title:row.title,metafields:buildProductMetafields(row)};
  if(row.shopify_handle)base.handle=row.shopify_handle;
  if(row.description_html)base.descriptionHtml=row.description_html;
  if(row.vendor)base.vendor=row.vendor;
  if(row.product_type)base.productType=row.product_type;
  if(row.template_suffix)base.templateSuffix=row.template_suffix;
  let payload,created=false;
  try{
    if(row.shopify_product_id){
      payload=requireNoUserErrors((await shopifyGraphql(PRODUCT_UPDATE,{product:{...base,id:row.shopify_product_id,redirectNewHandle:true}})).productUpdate);
    }else{
      payload=requireNoUserErrors((await shopifyGraphql(PRODUCT_CREATE,{product:{...base,status:'DRAFT',tags:[row.client_slug,'client-product']}})).productCreate);created=true;
    }
    const product=payload.product,primary=product.variants?.nodes?.[0]||null;
    const updated=(await pool.query(`update products set shopify_product_id=$1,shopify_variant_id=coalesce($2,shopify_variant_id),
      shopify_handle=$3,shopify_status=$4,shopify_inventory_total=$5,shopify_synced_at=now(),shopify_published_at=now(),
      shopify_publish_error=null,source_of_truth='shopify',updated_at=now() where id=$6 returning *`,
      [product.id,primary?.id||null,product.handle,product.status,product.totalInventory,req.params.id])).rows[0];
    return {created,product:updated,metafieldsWritten:base.metafields.length,shopifyAdminUrl:`https://admin.shopify.com/store/${(process.env.SHOPIFY_STORE_DOMAIN||'').split('.')[0]}/products/${product.id.split('/').pop()}`};
  }catch(error){
    await pool.query('update products set shopify_publish_error=$1,updated_at=now() where id=$2',[error.message,req.params.id]);throw error;
  }
});
app.post('/v1/admin/products/:id/rush',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const enabled=req.body?.enabled===true,reason=String(req.body?.reason||'').trim();
  if(enabled&&!reason)return reply.code(400).send({error:'A rush reason is required'});
  const client=await pool.connect();
  try{
    await client.query('begin');
    const product=(await client.query('select * from products where id=$1 for update',[req.params.id])).rows[0];
    if(!product){await client.query('rollback');return reply.code(404).send({error:'Product not found'})}
    if(enabled){
      const sample=(await client.query(`select * from milestones where product_id=$1 and lower(name)='sample' for update`,[product.id])).rows[0];
      if(!sample){await client.query('rollback');return reply.code(409).send({error:'This workflow does not have a Sample gate'})}
      if(sample.status==='complete'){await client.query('rollback');return reply.code(409).send({error:'Sampling is already complete and cannot be skipped'})}
      const production=(await client.query('select id from production_runs where product_id=$1 limit 1',[product.id])).rows[0];
      if(production){await client.query('rollback');return reply.code(409).send({error:'Production has already started'})}
      await client.query(`update milestones set status='complete',completed_at=coalesce(completed_at,now())
        where product_id=$1 and sort_order<(select sort_order from milestones where id=$2) and status<>'complete'`,[product.id,sample.id]);
      await client.query(`update milestones set status='skipped',completed_at=now() where id=$1`,[sample.id]);
      await client.query(`update milestones set status='current',completed_at=null where product_id=$1 and lower(name)='approval' and status<>'complete'`,[product.id]);
      await client.query(`update products set rush_mode=true,rush_reason=$2,rush_activated_at=now(),rush_activated_by=$3,
        current_stage='approval',risk_level='attention',updated_at=now() where id=$1`,[product.id,reason,req.auth.sub]);
      await client.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'rush',$4,$5)`,
        [product.client_id,product.id,req.auth.sub,`Rush activated — Sample skipped: ${reason}`,JSON.stringify({enabled:true,reason})]);
      await client.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'rush','Rush workflow activated — sampling waived','product',$2)`,[product.client_id,product.id]);
    }else{
      if(!product.rush_mode){await client.query('rollback');return reply.code(409).send({error:'Rush is not active for this product'})}
      const downstream=(await client.query(`select
        exists(select 1 from approvals where product_id=$1 and status in ('pending','approved')) approval_started,
        exists(select 1 from production_runs where product_id=$1) production`,[product.id])).rows[0];
      if(downstream.approval_started||downstream.production){await client.query('rollback');return reply.code(409).send({error:'Rush cannot be reversed after approval or production has begun'})}
      await client.query(`update milestones set status='upcoming',completed_at=null where product_id=$1 and lower(name) in ('sample','approval')`,[product.id]);
      await client.query(`update milestones set status='current',completed_at=null where product_id=$1 and lower(name)='development'`,[product.id]);
      await client.query(`update products set rush_mode=false,rush_reason=null,rush_activated_at=null,rush_activated_by=null,
        current_stage='development',risk_level='on-track',updated_at=now() where id=$1`,[product.id]);
      await client.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'rush',$4,$5)`,
        [product.client_id,product.id,req.auth.sub,'Rush removed — Sample gate restored',JSON.stringify({enabled:false})]);
      await client.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'rush','Rush workflow removed — sampling restored','product',$2)`,[product.client_id,product.id]);
    }
    const updated=(await client.query('select * from products where id=$1',[product.id])).rows[0];
    const milestones=(await client.query('select * from milestones where product_id=$1 order by sort_order',[product.id])).rows;
    await client.query('commit');return {product:updated,milestones};
  }catch(error){await client.query('rollback').catch(()=>{});throw error}finally{client.release()}
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
  const full=(await pool.query('select * from products where id=$1',[product.id])).rows[0];
  const autoDraft=await autoDraftProduct(full,{actorId:req.auth.sub,reason:'brief'}).catch(e=>{app.log.warn({err:e.message,productId:product.id},'auto draft failed');return {ai:'error'}});
  return {...brief,autoDraft};
});
app.get('/v1/admin/clients/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query('select * from clients where id=$1',[req.params.id])).rows[0];
  if(!client)return reply.code(404).send({error:'Client not found'});
  const payments=(await pool.query(`select py.id,py.kind,py.title,py.amount_cents,py.currency,py.shopify_order_id,py.shopify_order_name,py.paid_at,py.source,py.product_id from payments py where py.client_id=$1 order by py.paid_at desc limit 25`,[client.id])).rows;
  const [projects,projectMessages,projectFiles,clientAssetUploads,products,requests,invoices,users,quotes,suppliers,productionRuns,qcInspections,shipments,assets,assetVersions,comments,configurations,priceTiers]=await Promise.all([
    pool.query(`select pr.*,(select count(*)::int from products p where p.project_id=pr.id) product_count,
      (select max(created_at) from project_messages pm where pm.project_id=pr.id) last_message_at
      from projects pr where pr.client_id=$1 order by pr.updated_at desc,pr.name`,[client.id]),
    pool.query(`select pm.*,coalesce(u.name,u.email,case when pm.author_role='admin' then 'Future Basics' else c.name end) author_name
      from project_messages pm left join users u on u.id=pm.author_id join clients c on c.id=pm.client_id
      where pm.client_id=$1 order by pm.created_at`,[client.id]),
    pool.query(`select pf.*,coalesce(u.name,u.email,case when pf.uploader_role='admin' then 'Future Basics' else c.name end) uploader_name
      from project_files pf left join users u on u.id=pf.uploader_id join clients c on c.id=pf.client_id
      where pf.client_id=$1 order by pf.created_at desc`,[client.id]),
    pool.query(`select av.id,av.original_name,av.mime_type,av.size_bytes,av.created_at,a.name asset_name,a.kind,p.project_id,p.title product_title,
      coalesce(u.name,u.email,c.name) uploader_name
      from asset_versions av join assets a on a.id=av.asset_id join products p on p.id=a.product_id
      left join users u on u.id=av.uploader_id join clients c on c.id=p.client_id
      where p.client_id=$1 and coalesce(u.role,'client')<>'admin' order by av.created_at desc`,[client.id]),
    pool.query(`select p.*,to_jsonb(b) brief,${HAS_RENDERING_SQL},
      (select json_build_object('version',tp.version,'status',tp.status,'published_at',tp.published_at,'updated_at',tp.updated_at,'initiated_by',tp.initiated_by,'submitted_at',tp.submitted_at,'source',tp.source,'followup_sent_at',tp.followup_sent_at,'ai_status',tp.ai_status,'client_signed',(tp.verification->'clientSign'->>'name') is not null,'brand_signed',(tp.verification->'brandSign'->>'name') is not null,'factory_signed',(tp.verification->'factorySign'->>'name') is not null,'locked_at',tp.locked_at,'quote_waiting',exists(select 1 from tech_pack_shares qs where qs.tech_pack_id=tp.id and qs.assigned and qs.kind='quote' and qs.revoked_at is null and qs.waived_at is null and (qs.expires_at is null or qs.expires_at>now()) and not exists(select 1 from factory_quotes fq where fq.share_id=qs.id))) from tech_packs tp where tp.product_id=p.id) tech_pack,
      (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) configuration,
      coalesce((select json_agg(json_build_object('min_quantity',pt.min_quantity,'max_quantity',pt.max_quantity,
        'unit_cost_cents',pt.unit_cost_cents,'wholesale_cents',pt.wholesale_cents,'srp_cents',pt.srp_cents,
        'setup_cents',pt.setup_cents,'freight_cents',pt.freight_cents,'lead_time_days',pt.lead_time_days) order by pt.min_quantity)
        from price_tiers pt where pt.product_id=p.id),'[]') price_tiers,
      coalesce(json_agg(m order by m.sort_order)filter(where m.id is not null),'[]') milestones
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
  ]);products.rows=products.rows.map(withRendering);return {client,projects:projects.rows,projectFinancials:projectFinancialRollups(projects.rows,products.rows,quotes.rows,invoices.rows,{internal:true}),projectMessages:projectMessages.rows,projectFiles:projectFiles.rows,clientAssetUploads:clientAssetUploads.rows,products:products.rows,requests:requests.rows,invoices:invoices.rows,users:users.rows,quotes:quotes.rows,
    suppliers:suppliers.rows,productionRuns:productionRuns.rows,qcInspections:qcInspections.rows,shipments:shipments.rows,
    assets:assets.rows,assetVersions:assetVersions.rows,comments:comments.rows,configurations:configurations.rows,priceTiers:priceTiers.rows,payments};
});
app.patch('/v1/admin/clients/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,status,emailDomains,allowedEmails,contactName,contactEmail,contactPhone,websiteUrl,notes,shopifyCustomerId,techPackComped}=req.body||{};
  const domains=emailDomains===undefined?null:await validateClientDomains(emailDomains,req.params.id);
  const comped=techPackComped===undefined||techPackComped===null||techPackComped===''?null:(techPackComped===true||techPackComped==='true');
  const prev=comped===null?null:(await pool.query('select tech_pack_comped from clients where id=$1',[req.params.id])).rows[0];
  const row=(await pool.query(`update clients set name=coalesce($1,name),status=coalesce($2,status),
    email_domains=coalesce($3,email_domains),contact_name=coalesce($4,contact_name),contact_email=coalesce($5,contact_email),
    contact_phone=coalesce($6,contact_phone),website_url=coalesce($7,website_url),notes=coalesce($8,notes),
    shopify_customer_id=coalesce($9,shopify_customer_id),allowed_emails=coalesce($11,allowed_emails),tech_pack_comped=coalesce($12,tech_pack_comped) where id=$10 returning *`,
    [name||null,status||null,domains,contactName||null,contactEmail||null,contactPhone||null,websiteUrl||null,notes||null,shopifyCustomerId||null,req.params.id,allowedEmails===undefined?null:normalizeEmails(allowedEmails),comped])).rows[0];
  if(!row)return reply.code(404).send({error:'Client not found'});
  // Free access granted: any pack of theirs that was waiting for payment starts now, and the change is on the record.
  let unlockedPacks=0;
  if(prev&&comped!==prev.tech_pack_comped){
    await pool.query(`insert into activities(client_id,actor_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.id,req.auth.sub,comped?`Free tech pack access given to ${row.name}`:`Free tech pack access removed from ${row.name}`,{comped}]).catch(()=>{});
    if(comped)unlockedPacks=await unlockWaitingPacks(row.id);
  }
  return {...row,unlockedPacks};
});
// Turn a website lead into an active client room: grant sign-in access (whole domain for company
// mailboxes, the individual address for personal ones), open their intake projects, and email them the way in.
app.post('/v1/admin/clients/:id/activate',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const client=(await pool.query(`select * from clients where id=$1 and slug<>'future-basics'`,[req.params.id])).rows[0];
  if(!client)return reply.code(404).send({error:'Client not found'});
  const sendWelcome=req.body?.sendWelcome!==false,message=String(req.body?.message||'').trim().slice(0,2000);
  const domain=emailDomain(client.contact_email);
  const domainTaken=Boolean(domain)&&(await pool.query(`select 1 from clients where id<>$1 and $2=any(email_domains)`,[client.id,domain])).rowCount>0;
  const access=planClientAccess(client,{domainTaken});
  if(!access.emailDomains.length&&!access.allowedEmails.length)return reply.code(400).send({error:'Add a contact email to this client before activating the room'});
  const db=await pool.connect();let updated,project;
  try{
    await db.query('begin');
    updated=(await db.query(`update clients set status='active',archived_at=null,archive_previous_status=null,email_domains=$2,allowed_emails=$3,activated_at=coalesce(activated_at,now())
      where id=$1 returning *`,[client.id,access.emailDomains,access.allowedEmails])).rows[0];
    await db.query(`update projects set status='active',updated_at=now() where client_id=$1 and status='intake'`,[client.id]);
    project=(await db.query(`select * from projects where client_id=$1 and archived_at is null order by updated_at desc limit 1`,[client.id])).rows[0]||null;
    await db.query(`insert into activities(client_id,actor_id,type,summary,metadata) values($1,$2,'room-activated',$3,$4)`,
      [client.id,req.auth.sub,'Your private project room is open',{access:access.summary,sendWelcome}]);
    await db.query('commit');
  }catch(error){await db.query('rollback').catch(()=>{});throw error}finally{db.release()}
  let welcomeSent=false,welcomeError=null;
  if(sendWelcome&&updated.contact_email){
    const link=project?`${clientHubUrl}/projects/${project.id}`:clientHubUrl,first=String(updated.contact_name||'').split(' ')[0]||'there';
    try{
      welcomeSent=await sendHubEmail({to:updated.contact_email,subject:`Your Future Basics project room is ready${project?' — '+project.name:''}`,html:hubEmailShell('Your project room is ready',
        `<p>Hi ${emailEscape(first)},</p><p>Your private Future Basics room${project?` for <strong>${emailEscape(project.name)}</strong>`:''} is open. Sign in with <strong>${emailEscape(updated.contact_email)}</strong> — no password, we email you a six-digit code each time.</p>
        ${hubButton(link,'Open your project room')}${message?`<p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(message)}</p>`:''}
        <p>Inside you will find your brief, every product as it moves from concept through tech pack, sample and production, quotes and tech packs to approve, and a shared thread with us.</p>
        <p style="font-size:12px;color:#717177">${emailEscape(access.summary)}.</p>`),replyTo:req.auth.email||intakeNotificationEmail});
      if(welcomeSent)await pool.query('update clients set welcome_sent_at=now() where id=$1',[client.id]);
    }catch(error){welcomeError=error.message;app.log.error({error,clientId:client.id},'Room activated but welcome email failed')}
  }
  return {client:{...updated,welcome_sent_at:welcomeSent?new Date().toISOString():updated.welcome_sent_at},project,access,welcomeSent,welcomeError,hubUrl:clientHubUrl};
});
app.post('/v1/admin/clients/:id/archive',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`update clients set archived_at=now(),archive_previous_status=case when status not in ('archive','archived') then status else coalesce(archive_previous_status,'active') end,status='archived'
    where id=$1 and slug<>'future-basics' returning *`,[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Client not found'});
  return row;
});
app.post('/v1/admin/clients/:id/restore',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`update clients set archived_at=null,status=coalesce(archive_previous_status,'active'),archive_previous_status=null
    where id=$1 and slug<>'future-basics' returning *`,[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Client not found'});
  return row;
});
app.post('/v1/admin/clients/:id/projects',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,status='active',milestone,targetDate}=req.body||{};
  if(!name?.trim())return reply.code(400).send({error:'Project name required'});
  const row=(await pool.query(`insert into projects(client_id,name,status,milestone,target_date)
    select id,$1,$2,$3,$4 from clients where id=$5 and archived_at is null and status not in ('archive','archived') returning *`,[name.trim(),status,milestone||null,targetDate||null,req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Active client room not found'});
  return reply.code(201).send(row);
});
app.patch('/v1/admin/projects/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {name,status,milestone,targetDate}=req.body||{};
  const row=(await pool.query(`update projects set name=coalesce($1,name),status=coalesce($2,status),milestone=coalesce($3,milestone),
    target_date=coalesce($4,target_date),updated_at=now() where id=$5 returning *`,[name||null,status||null,milestone||null,targetDate||null,req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Project not found'});return row;
});
app.get('/v1/admin/projects/:id/share',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const project=(await pool.query(`select pr.id,pr.name,pr.status,pr.archived_at,c.id client_id,c.name client_name
    from projects pr join clients c on c.id=pr.client_id where pr.id=$1`,[req.params.id])).rows[0];
  if(!project)return reply.code(404).send({error:'Project not found'});
  if(project.archived_at||['archive','archived'].includes(project.status))return reply.code(409).send({error:'Restore this project before sharing it'});
  const filename=`${intakeSlug(project.client_name)}-${intakeSlug(project.name)}-collection.pdf`;
  return {projectId:project.id,projectName:project.name,loginUrl:`${clientHubUrl}/projects/${project.id}`,pdfUrl:`/v1/projects/${project.id}/share.pdf`,filename};
});
app.post('/v1/admin/projects/:id/archive',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`update projects set archived_at=now(),archive_previous_status=case when status not in ('archive','archived') then status else coalesce(archive_previous_status,'active') end,status='archived',updated_at=now()
    where id=$1 returning *`,[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Project not found'});
  return row;
});
app.post('/v1/admin/projects/:id/restore',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`update projects set archived_at=null,status=coalesce(archive_previous_status,'active'),archive_previous_status=null,updated_at=now()
    where id=$1 returning *`,[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Project not found'});
  return row;
});
app.post('/v1/admin/projects/:id/messages',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const body=String(req.body?.body||'').trim(),replyToId=req.body?.replyToId||null;if(!body)return reply.code(400).send({error:'Message required'});
  const project=(await pool.query(`select id,client_id,name from projects where id=$1
    and archived_at is null and status not in ('archive','archived')`,[req.params.id])).rows[0];
  if(!project)return reply.code(404).send({error:'Project not found'});
  if(replyToId&&!(await pool.query('select 1 from project_messages where id=$1 and project_id=$2',[replyToId,project.id])).rowCount)return reply.code(400).send({error:'Reply target is not in this project'});
  const message=(await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body,reply_to_id)
    values($1,$2,$3,'admin',$4,$5) returning *`,[project.id,project.client_id,req.auth.sub,body.slice(0,5000),replyToId])).rows[0];
  await pool.query(`update projects set updated_at=now() where id=$1`,[project.id]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'project-message',$2,'project',$3)`,[project.client_id,`New message in ${project.name}`,project.id]);
  return reply.code(201).send(message);
});
app.post('/v1/admin/projects/:id/uploads',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const project=(await pool.query(`select id,client_id,name from projects where id=$1
    and archived_at is null and status not in ('archive','archived')`,[req.params.id])).rows[0];if(!project)return reply.code(404).send({error:'Project not found'});
  const part=await req.file();if(!part)return reply.code(400).send({error:'Choose a file to upload'});
  const body=String(req.query?.body||'').trim(),replyToId=req.query?.replyToId||null;
  if(replyToId&&!(await pool.query('select 1 from project_messages where id=$1 and project_id=$2',[replyToId,project.id])).rowCount)return reply.code(400).send({error:'Reply target is not in this project'});
  const message=(await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body,reply_to_id)
    values($1,$2,$3,'admin',$4,$5) returning *`,[project.id,project.client_id,req.auth.sub,(body||`Uploaded ${cleanName(part.filename)}`).slice(0,5000),replyToId])).rows[0];
  const file=await storeProjectFile(project,req.auth.sub,'admin',part,message.id);await pool.query('update projects set updated_at=now() where id=$1',[project.id]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'project-file',$2,'project',$3)`,[project.client_id,`New file in ${project.name}: ${file.original_name}`,project.id]);
  return reply.code(201).send({message,file});
});
// Staff override of one milestone. Events normally move milestones (src/flow.js); a hand change is checked and logged with its note.
app.patch('/v1/admin/milestones/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {status,dueDate,responsibleParty,notes,required,clientVisible}=req.body||{};
  if(status&&!MILESTONE_STATUSES.includes(status))return reply.code(400).send({error:`Status must be one of: ${MILESTONE_STATUSES.join(', ')}`});
  if(responsibleParty&&!OWNERS.includes(responsibleParty))return reply.code(400).send({error:`Responsible party must be one of: ${OWNERS.join(', ')}`});
  const before=(await pool.query('select m.*,p.client_id,p.title from milestones m join products p on p.id=m.product_id where m.id=$1',[req.params.id])).rows[0];
  if(!before)return reply.code(404).send({error:'Milestone not found'});
  const row=(await pool.query(`update milestones set status=coalesce($1,status),due_date=coalesce($2,due_date),
    responsible_party=coalesce($3,responsible_party),notes=coalesce($4,notes),required=coalesce($5,required),client_visible=coalesce($6,client_visible),
    completed_at=case when $1='complete' then coalesce(completed_at,now()) when $1 is not null then null else completed_at end where id=$7 returning *`,
    [status||null,dueDate||null,responsibleParty||null,notes||null,typeof required==='boolean'?required:null,typeof clientVisible==='boolean'?clientVisible:null,req.params.id])).rows[0];
  if(row.status==='current')await pool.query(`update products set current_stage=$2,waiting_on=$3,updated_at=now() where id=$1`,[row.product_id,row.name.toLowerCase(),row.responsible_party]);
  const changed=[status&&status!==before.status?`${before.status} → ${status}`:'',responsibleParty&&responsibleParty!==before.responsible_party?`owner ${OWNER_LABELS[responsibleParty]}`:''].filter(Boolean).join(', ');
  if(changed)await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'flow',$4,$5)`,
    [before.client_id,row.product_id,req.auth.sub,`${row.name} set by hand: ${changed}${notes?` · ${String(notes).slice(0,200)}`:''}`,{milestoneId:row.id,override:true,from:before.status,to:row.status,owner:row.responsible_party}]);
  return row;
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
  const quote=(await pool.query(`insert into quotes(product_id,version,quantity,unit_cost_cents,tooling_cents,freight_cents,wholesale_cents,srp_cents,notes,status,price_tier_id,configuration_snapshot,tech_pack_version,deposit_pct)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,'issued',$10,$11,(select version from tech_packs where product_id=$1 and published_at is not null),$12) returning *`,[req.params.id,version,quantity,tier.unit_cost_cents,tier.setup_cents,tier.freight_cents,
      tier.wholesale_cents,tier.srp_cents,req.body?.notes||tier.notes||null,tier.id,JSON.stringify(config),depositPct(req.body?.depositPct)])).rows[0];
  await flow(req.params.id,'quote-issued',{actorId:req.auth.sub,note:`v${quote.version}`});
  await emailQuoteIssued(req.params.id,quote);
  return reply.code(201).send(quote);
});
app.post('/v1/admin/products/:id/production-runs',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {supplierId,poNumber,quantity,unitCostCents,status='planned',sampleStatus='not-started',exFactoryDate,etaDate,notes,internalNotes}=req.body||{};
  const product=(await pool.query('select id,client_id,title from products where id=$1',[req.params.id])).rows[0];
  if(!product)return reply.code(404).send({error:'Product not found'});if(!quantity)return reply.code(400).send({error:'Quantity required'});
  const ready=(await pool.query(`select exists(select 1 from approvals where product_id=$1 and kind='sample' and status='approved') sample,(select rush_mode from products where id=$1) rush`,[product.id])).rows[0];
  const early=String(req.body?.earlyReason||'').trim();
  if(!ready.sample&&!ready.rush&&early.length<5)return reply.code(409).send({error:'The client has not approved a sample yet. Request a sample approval first, or give a reason to start production without one.',needsReason:true});
  const run=(await pool.query(`insert into production_runs(product_id,supplier_id,po_number,quantity,unit_cost_cents,status,sample_status,ex_factory_date,eta_date,notes,internal_notes,tech_pack_version)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,(select version from tech_packs where product_id=$1 and locked_at is not null)) returning *`,[product.id,supplierId||null,poNumber||null,quantity,unitCostCents||null,status,sampleStatus,
    exFactoryDate||null,etaDate||null,notes||null,internalNotes||null])).rows[0];
  await pool.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[product.client_id,product.id,req.auth.sub,'production',`Opened production run ${poNumber||run.id}${!ready.sample&&!ready.rush?` without an approved sample: ${early}`:''}`]);
  await flow(product.id,'production-started',{actorId:req.auth.sub});
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
  await flow(run.product_id,['passed','pass','approved'].includes(String(status).toLowerCase())?'qc-passed':'qc-started',{actorId:req.auth.sub});
  return reply.code(201).send(qc);
});
app.post('/v1/admin/production-runs/:id/shipments',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {carrier,trackingNumber,trackingUrl,status='preparing',destination,shippedAt,etaDate}=req.body||{};
  const run=(await pool.query('select id,product_id from production_runs where id=$1',[req.params.id])).rows[0];if(!run)return reply.code(404).send({error:'Production run not found'});
  const shipment=(await pool.query(`insert into shipments(production_run_id,carrier,tracking_number,tracking_url,status,destination,shipped_at,eta_date)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[run.id,carrier||null,trackingNumber||null,trackingUrl||null,status,destination||null,shippedAt||null,etaDate||null])).rows[0];
  await shipmentFlow(shipment,run.product_id,req.auth.sub);
  return reply.code(201).send(shipment);
});
app.patch('/v1/admin/shipments/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {carrier,trackingNumber,trackingUrl,status,destination,shippedAt,etaDate,deliveredAt}=req.body||{};
  const shipment=(await pool.query(`update shipments set carrier=coalesce($1,carrier),tracking_number=coalesce($2,tracking_number),tracking_url=coalesce($3,tracking_url),
    status=coalesce($4,status),destination=coalesce($5,destination),shipped_at=coalesce($6,shipped_at),eta_date=coalesce($7,eta_date),
    delivered_at=coalesce($8,delivered_at),updated_at=now() where id=$9 returning *`,[carrier||null,trackingNumber||null,trackingUrl||null,status||null,destination||null,
    shippedAt||null,etaDate||null,deliveredAt||null,req.params.id])).rows[0];if(!shipment)return reply.code(404).send({error:'Shipment not found'});
  const run=(await pool.query('select product_id from production_runs where id=$1',[shipment.production_run_id])).rows[0];
  if(run)await shipmentFlow(shipment,run.product_id,req.auth.sub);
  return shipment;
});
// A shipment on its way waits on the client to receive it; a delivered one completes the product.
async function shipmentFlow(shipment,productId,actorId){
  const st=String(shipment.status||'').toLowerCase();
  if(shipment.delivered_at||st==='delivered')return flow(productId,'delivered',{actorId});
  if(shipment.shipped_at||['shipped','in-transit','in transit'].includes(st))return flow(productId,'shipped',{actorId});
}
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
// A product's comments as a chat thread. The client sees what was shared with them; staff also see internal notes, marked as such.
async function productThread(productId,{admin=false,clientId=null}={}){
  if(!UUID_RE.test(String(productId)))return null;
  const product=(await pool.query(`select id,title from products where id=$1${admin?'':' and client_id=$2'}`,admin?[productId]:[productId,clientId])).rows[0];
  if(!product)return null;
  const rows=(await pool.query(`select cm.id,cm.author_role,cm.body,cm.created_at,cm.visibility,
      case when cm.author_role='admin' then coalesce(nullif(u.name,''),'Future Basics') else coalesce(nullif(u.name,''),nullif(c.contact_name,''),c.name) end author_name
    from comments cm left join users u on u.id=cm.author_id join clients c on c.id=cm.client_id where cm.product_id=$1${admin?'':` and cm.visibility='client'`} order by cm.created_at desc limit 300`,[product.id])).rows.reverse();
  return {product,messages:rows.map(c=>({id:c.id,author_role:c.author_role,author_name:c.author_name,body:c.body,created_at:c.created_at,reply_to_id:null,files:[],
    ...(c.visibility==='internal'?{internal:true,tag:'Internal note · only Future Basics sees this'}:{})})),events:[]};
}
app.get('/v1/products/:id/thread',{preHandler:authenticate},async(req,reply)=>(await productThread(req.params.id,{clientId:req.auth.clientId}))||reply.code(404).send({error:'Product not found'}));
app.get('/v1/admin/products/:id/thread',{preHandler:[authenticate,adminOnly]},async(req,reply)=>(await productThread(req.params.id,{admin:true}))||reply.code(404).send({error:'Product not found'}));
// ---- Message center: one conversation per project (plus a "general" one per client for signals that belong to no project) ----
// Messages are the bubbles. Notifications are what happened around them (a tech pack was submitted, a quote was decided) and show
// as small centred lines. The notifications our own messages create are not shown or counted: the bubble already says it.
const NOTE_SCOPED_SQL=`select n.id,n.client_id,n.type,n.title,n.entity_type,n.entity_id,n.read_at,n.created_at,
  case n.entity_type when 'project' then n.entity_id
    when 'product' then (select p.project_id::text from products p where p.id::text=n.entity_id)
    when 'quote' then (select p.project_id::text from quotes q join products p on p.id=q.product_id where q.id::text=n.entity_id) end project_id
  from notifications n`;
const OWN_NOTE_TYPES=['project-message','project-file'],BUBBLE_NOTE_TYPES=['project-message','project-file','client-project-message','client-project-file'];
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function convKey(key){const k=String(key||'');if(UUID_RE.test(k))return {project:k};const m=/^general-([0-9a-f-]{36})$/i.exec(k);return m&&UUID_RE.test(m[1])?{general:m[1]}:null}
app.get('/v1/admin/message-center',{preHandler:[authenticate,adminOnly]},async()=>{
  const live=`c.archived_at is null and c.status not in ('archive','archived') and c.slug<>'future-basics'`;
  const projects=(await pool.query(`select pr.id project_id,pr.name project_name,c.id client_id,c.name client_name,
      (select pm.body from project_messages pm where pm.project_id=pr.id order by pm.created_at desc limit 1) last_body,
      (select pm.author_role from project_messages pm where pm.project_id=pr.id order by pm.created_at desc limit 1) last_role,
      (select max(pm.created_at) from project_messages pm where pm.project_id=pr.id) last_message_at
    from projects pr join clients c on c.id=pr.client_id where pr.archived_at is null and pr.status not in ('archive','archived') and ${live}`)).rows;
  const unread=(await pool.query(`select s.*,c.name client_name from (${NOTE_SCOPED_SQL}) s join clients c on c.id=s.client_id
    where s.read_at is null and not (s.type=any($1)) and ${live} order by s.created_at desc limit 500`,[OWN_NOTE_TYPES])).rows;
  const byProject=new Map(),general=new Map();
  for(const n of unread){
    if(n.project_id&&projects.some(p=>p.project_id===n.project_id)){const g=byProject.get(n.project_id)||{count:0,latest:n};g.count++;byProject.set(n.project_id,g)}
    else{const g=general.get(n.client_id)||{count:0,latest:n,client_name:n.client_name};g.count++;general.set(n.client_id,g)}
  }
  const out=[];
  for(const p of projects){
    const u=byProject.get(p.project_id);if(!p.last_message_at&&!u)continue;
    const noteAt=u?.latest.created_at,msgAt=p.last_message_at,lastAt=(noteAt&&(!msgAt||new Date(noteAt)>new Date(msgAt)))?noteAt:msgAt;
    out.push({key:p.project_id,kind:'project',clientId:p.client_id,clientName:p.client_name,projectId:p.project_id,projectName:p.project_name,unread:u?.count||0,lastAt,
      preview:p.last_body?`${p.last_role==='admin'?'You: ':''}${p.last_body}`.slice(0,140):u.latest.title,lastRole:p.last_body?p.last_role:'event'});
  }
  for(const [clientId,g] of general)out.push({key:`general-${clientId}`,kind:'general',clientId,clientName:g.client_name,projectId:null,projectName:'General',unread:g.count,lastAt:g.latest.created_at,preview:g.latest.title,lastRole:'event'});
  out.sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt));
  return {conversations:out.slice(0,80),unread:out.reduce((n,c)=>n+c.unread,0)};
});
app.get('/v1/admin/message-center/:key',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const k=convKey(req.params.key);if(!k)return reply.code(404).send({error:'Conversation not found'});
  let meta,messages=[],files=[],events;
  if(k.project){
    meta=(await pool.query(`select pr.id project_id,pr.name project_name,c.id client_id,c.name client_name from projects pr join clients c on c.id=pr.client_id where pr.id=$1`,[k.project])).rows[0];
    if(!meta)return reply.code(404).send({error:'Conversation not found'});
    messages=(await pool.query(`select pm.id,pm.author_role,pm.body,pm.reply_to_id,pm.created_at,coalesce(nullif(u.name,''),case when pm.author_role='client' then nullif(c.contact_name,'') end,u.email,case when pm.author_role='admin' then 'Future Basics' else c.name end) author_name
      from project_messages pm left join users u on u.id=pm.author_id join clients c on c.id=pm.client_id where pm.project_id=$1 order by pm.created_at desc limit 200`,[k.project])).rows.reverse();
    files=(await pool.query(`select id,message_id,original_name,size_bytes from project_files where project_id=$1 and message_id is not null`,[k.project])).rows;
    events=(await pool.query(`select s.id,s.type,s.title,s.entity_type,s.entity_id,s.read_at,s.created_at from (${NOTE_SCOPED_SQL}) s where s.project_id=$1 and not (s.type=any($2)) order by s.created_at desc limit 60`,[k.project,BUBBLE_NOTE_TYPES])).rows.reverse();
  }else{
    meta=(await pool.query(`select c.id client_id,c.name client_name from clients c where c.id=$1`,[k.general])).rows[0];
    if(!meta)return reply.code(404).send({error:'Conversation not found'});
    meta={...meta,project_id:null,project_name:'General'};
    events=(await pool.query(`select s.id,s.type,s.title,s.entity_type,s.entity_id,s.read_at,s.created_at from (${NOTE_SCOPED_SQL}) s where s.client_id=$1 and (s.project_id is null or not exists(select 1 from projects pr where pr.id::text=s.project_id and pr.archived_at is null)) and not (s.type=any($2)) order by s.created_at desc limit 60`,[k.general,BUBBLE_NOTE_TYPES])).rows.reverse();
  }
  const productIds=events.filter(e=>e.entity_type==='product').map(e=>e.entity_id).filter(id=>UUID_RE.test(id));
  return {conversation:{key:req.params.key,kind:k.project?'project':'general',clientId:meta.client_id,clientName:meta.client_name,projectId:meta.project_id,projectName:meta.project_name},
    messages:messages.map(m=>({...m,files:files.filter(f=>f.message_id===m.id)})),
    events:events.map(e=>({id:e.id,type:e.type,title:e.title,createdAt:e.created_at,unread:!e.read_at,productId:e.entity_type==='product'&&productIds.includes(e.entity_id)?e.entity_id:null}))};
});
app.post('/v1/admin/message-center/:key/read',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const k=convKey(req.params.key);if(!k)return reply.code(404).send({error:'Conversation not found'});
  const r=k.project
    ?await pool.query(`update notifications set read_at=now() where read_at is null and id in (select s.id from (${NOTE_SCOPED_SQL}) s where s.project_id=$1)`,[k.project])
    :await pool.query(`update notifications set read_at=now() where read_at is null and id in (select s.id from (${NOTE_SCOPED_SQL}) s where s.client_id=$1 and (s.project_id is null or not exists(select 1 from projects pr where pr.id::text=s.project_id and pr.archived_at is null)))`,[k.general]);
  return {read:r.rowCount};
});
app.patch('/v1/admin/notifications/:id/read',{preHandler:[authenticate,adminOnly]},async req=>
  (await pool.query('update notifications set read_at=now() where id=$1 returning *',[req.params.id])).rows[0]
);
app.post('/v1/admin/products/:id/quotes',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {quantity,unitCostCents,toolingCents=0,freightCents=0,wholesaleCents,srpCents,expiresAt,notes}=req.body||{};
  const version=(await pool.query('select coalesce(max(version),0)+1 v from quotes where product_id=$1',[req.params.id])).rows[0].v;
  const quote=(await pool.query(`insert into quotes(product_id,version,quantity,unit_cost_cents,tooling_cents,freight_cents,wholesale_cents,srp_cents,expires_at,notes,status,tech_pack_version,deposit_pct)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'issued',(select version from tech_packs where product_id=$1 and published_at is not null),$11) returning *`,[req.params.id,version,quantity,unitCostCents,toolingCents,freightCents,wholesaleCents||null,srpCents||null,expiresAt||null,notes||null,depositPct(req.body?.depositPct)])).rows[0];
  await flow(req.params.id,'quote-issued',{actorId:req.auth.sub,note:`v${quote.version}`});
  await emailQuoteIssued(req.params.id,quote);
  return reply.code(201).send(quote);
});
// The client hears about a new quote; they decide it in the hub ("Waiting on you").
async function emailQuoteIssued(productId,quote){
  const p=(await pool.query('select title,client_id from products where id=$1',[productId])).rows[0];if(!p)return false;
  const total=quoteTotalCents(quote),pct=quote.deposit_pct??DEFAULT_DEPOSIT_PCT;
  return notifyClientContact(p.client_id,{subject:`Quote v${quote.version} for ${p.title}`,title:'A quote is ready for you',
    body:`<p>Quote v${quote.version} for <strong>${emailEscape(p.title)}</strong> is in your hub: ${emailEscape(quote.quantity)} units, <strong>${(total/100).toFixed(2)} ${emailEscape(quote.currency||'USD')}</strong> in total${pct?`, with a ${pct}% sample deposit when you accept`:''}.</p><p>Accept it or decline it from <strong>Waiting on you</strong> at the top of your hub.</p>${hubButton(`${clientHubUrl}/`,'Review the quote')}`});
}
// ---- Sample deposit. Accepting a quote invoices a share of it (SAMPLE_DEPOSIT_PCT, 50 by default, or the quote's own figure) as a
// Shopify draft order sent to the client. Its payment starts the sample: Future Basics signs and the factory gets the pack. A quote
// with a 0% deposit moves on at once. Without Shopify the invoice is recorded as due and staff send the payment link themselves.
const DEFAULT_DEPOSIT_PCT=Math.min(100,Math.max(0,Number(process.env.SAMPLE_DEPOSIT_PCT??50)));
const depositPct=v=>{if(v===undefined||v===null||v==='')return DEFAULT_DEPOSIT_PCT;const n=Math.round(Number(v));return Number.isFinite(n)?Math.min(100,Math.max(0,n)):DEFAULT_DEPOSIT_PCT};
const quoteTotalCents=q=>Number(q.quantity||0)*Number(q.wholesale_cents||q.unit_cost_cents||0)+Number(q.tooling_cents||0)+Number(q.freight_cents||0);
async function createDepositInvoice(quoteId,actorId=null){
  const q=(await pool.query(`select q.*,p.title product_title,p.client_id,p.project_id,c.name client_name,c.shopify_customer_id,c.contact_email
    from quotes q join products p on p.id=q.product_id join clients c on c.id=p.client_id where q.id=$1`,[quoteId])).rows[0];
  if(!q||q.status!=='accepted')return null;
  const existing=(await pool.query(`select * from invoices where quote_id=$1 and kind='deposit'`,[q.id])).rows[0];if(existing)return existing;
  const pct=q.deposit_pct??DEFAULT_DEPOSIT_PCT,amount=Math.round(quoteTotalCents(q)*pct/100);
  if(!pct||amount<=0){await flow(q.product_id,'deposit-paid',{actorId,note:`no sample deposit on quote v${q.version}`});return null}
  let number=`DEP-${q.product_id.slice(0,6).toUpperCase()}-Q${q.version}`,url=null,draftId=null,sent=false;
  if(shopifyConfigured()){
    try{
      const money=c=>({amount:(Number(c)/100).toFixed(2),currencyCode:q.currency});
      const input={lineItems:[{title:`Sample deposit (${pct}%) — ${q.product_title}, quote v${q.version}`,quantity:1,requiresShipping:false,taxable:false,originalUnitPriceWithCurrency:money(amount)}],
        email:q.contact_email||undefined,customerId:q.shopify_customer_id||undefined,note:`Future Basics sample deposit · quote v${q.version}`,
        tags:['future-basics-client-hub','sample-deposit',`client-${q.client_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`],visibleToCustomer:true};
      const draft=requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE,{input})).draftOrderCreate).draftOrder;
      number=draft.name;url=draft.invoiceUrl;draftId=draft.id;
      if(q.contact_email){const sentDraft=requireNoUserErrors((await shopifyGraphql(DRAFT_INVOICE_SEND,{id:draft.id})).draftOrderInvoiceSend).draftOrder;url=sentDraft.invoiceUrl||url;sent=true}
    }catch(e){app.log.warn({err:e.message,quoteId},'sample deposit draft order not created; recorded for staff to send')}
  }
  const inv=(await pool.query(`insert into invoices(client_id,project_id,product_id,quote_id,number,amount_cents,currency,status,external_url,kind,shopify_draft_order_id,shopify_invoice_sent_at)
    values($1,$2,$3,$4,$5,$6,$7,'due',$8,'deposit',$9,case when $10 then now() end) on conflict(client_id,number) do update set status=invoices.status returning *`,
    [q.client_id,q.project_id,q.product_id,q.id,number,amount,q.currency,url,draftId,sent])).rows[0];
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'commerce',$4,$5)`,[q.client_id,q.product_id,actorId,`Sample deposit invoice ${number} (${pct}% of quote v${q.version}) ${sent?'sent to the client':url?'created in Shopify':'recorded — send the payment link'}`,{invoiceId:inv.id,quoteId:q.id,pct}]);
  if(!sent)await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'deposit',$2,'product',$3)`,[q.client_id,`Send the sample deposit invoice for ${q.product_title} (${number}, ${(amount/100).toFixed(2)} ${q.currency}) — ${url?'the Shopify draft order is ready':'Shopify is not connected, so send it by hand'} and mark it paid when it lands`,q.product_id]);
  await notifyClientContact(q.client_id,{subject:`Sample deposit for ${q.product_title}`,title:'Your sample deposit',
    body:`<p>Thanks for accepting quote v${q.version} for <strong>${emailEscape(q.product_title)}</strong>. The next step is the sample deposit: <strong>${(amount/100).toFixed(2)} ${emailEscape(q.currency)}</strong> (${pct}% of the quote). Once it is paid, we sign the tech pack and the factory starts your sample.</p>${url?hubButton(url,'Pay the deposit'):`<p>We will send you the payment link shortly.</p>`}${hubButton(`${clientHubUrl}/`,'Open your hub')}`});
  return inv;
}
// A deposit landing (Shopify sync, the deposit sweep, or staff marking it paid) starts the sample.
async function depositPaid(invoice,actorId=null){
  if(invoice.kind!=='deposit'||!invoice.product_id)return;
  const p=(await pool.query('select title,client_id from products where id=$1',[invoice.product_id])).rows[0];if(!p)return;
  await flow(invoice.product_id,'deposit-paid',{actorId,note:invoice.number});
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'deposit',$2,'product',$3)`,[p.client_id,`Sample deposit ${invoice.number} paid for ${p.title} — sign the tech pack and send it to the factory`,invoice.product_id]);
  await notifyStaff(`Sample deposit paid — ${p.title}`,`<p>Deposit <strong>${emailEscape(invoice.number)}</strong> is paid. Sign the approved tech pack and send the factory its link.</p>${hubButton(`${workHubUrl}/tech-packs/${invoice.product_id}`,'Open the tech pack')}`);
}
async function setInvoiceStatus(invoiceId,status,actorId=null){
  const before=(await pool.query('select * from invoices where id=$1',[invoiceId])).rows[0];if(!before)return null;
  const row=(await pool.query('update invoices set status=$2 where id=$1 returning *',[invoiceId,status])).rows[0];
  if(status==='paid'&&before.status!=='paid')await depositPaid(row,actorId);
  return row;
}
// Staff record a payment that landed outside Shopify (bank transfer), or correct a status.
app.patch('/v1/admin/invoices/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const status=String(req.body?.status||'');if(!['draft','due','paid','void'].includes(status))return reply.code(400).send({error:'Status must be draft, due, paid or void'});
  const row=await setInvoiceStatus(req.params.id,status,req.auth.sub);if(!row)return reply.code(404).send({error:'Invoice not found'});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'commerce',$4)`,[row.client_id,row.product_id,req.auth.sub,`Invoice ${row.number} marked ${status}`]);
  return row;
});
// Every few minutes: due deposits with a Shopify draft order are checked, so a paid deposit moves the product without anyone syncing.
async function runDepositSweep(){
  if(!shopifyConfigured())return 0;
  const due=(await pool.query(`select * from invoices where kind='deposit' and status='due' and shopify_draft_order_id is not null order by created_at limit 25`)).rows;let paid=0;
  for(const inv of due){
    try{const draft=(await shopifyGraphql(DRAFT_ORDER_STATUS,{id:inv.shopify_draft_order_id})).draftOrder;if(!draft)continue;
      if(draft.order?.displayFinancialStatus==='PAID'||draft.status==='COMPLETED'){await setInvoiceStatus(inv.id,'paid');paid++}}
    catch(e){app.log.warn({err:e.message,invoiceId:inv.id},'deposit status not checked')}
  }
  return paid;
}
app.post('/v1/admin/products/:id/shopify-draft-order',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query(`select q.*,p.title product_title,p.shopify_variant_id,p.client_id,p.project_id,c.name client_name,c.shopify_customer_id
    from quotes q join products p on p.id=q.product_id join clients c on c.id=p.client_id where q.id=$1 and p.id=$2`,[req.body?.quoteId,req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Quote not found'});
  if(row.status!=='accepted')return reply.code(409).send({error:`Quote v${row.version} is ${row.status} — only an accepted quote is invoiced`});
  if(row.shopify_draft_order_id)return reply.code(409).send({error:'This quote already has a Shopify draft order'});
  const deposit=(await pool.query(`select * from invoices where quote_id=$1 and kind='deposit' and status<>'void'`,[row.id])).rows[0];
  if(deposit&&deposit.status!=='paid')return reply.code(409).send({error:`The sample deposit ${deposit.number} is not paid yet — the balance is invoiced after it`});
  const unitCents=row.wholesale_cents||row.unit_cost_cents;
  // a variant line is priced through priceOverride; a custom (title-only) line only through originalUnitPriceWithCurrency
  const money=cents=>({amount:(Number(cents)/100).toFixed(2),currencyCode:row.currency});
  const line=row.shopify_variant_id?{variantId:row.shopify_variant_id,quantity:row.quantity,priceOverride:money(unitCents)}:{title:row.product_title,quantity:row.quantity,requiresShipping:true,originalUnitPriceWithCurrency:money(unitCents)};
  const lineItems=[line];
  if(Number(row.tooling_cents)>0)lineItems.push({title:`Tooling / setup — ${row.product_title}`,quantity:1,requiresShipping:false,originalUnitPriceWithCurrency:money(row.tooling_cents)});
  if(Number(row.freight_cents)>0)lineItems.push({title:`Freight — ${row.product_title}`,quantity:1,requiresShipping:false,originalUnitPriceWithCurrency:money(row.freight_cents)});
  const input={lineItems,email:req.body?.email||undefined,customerId:row.shopify_customer_id||undefined,
    ...(deposit?{appliedDiscount:{title:`Sample deposit ${deposit.number} paid`,value:Number((deposit.amount_cents/100).toFixed(2)),valueType:'FIXED_AMOUNT'}}:{}),
    note:req.body?.note||`Future Basics client hub quote v${row.version}${deposit?' · balance after the sample deposit':''}`,tags:['future-basics-client-hub',`client-${row.client_name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`],visibleToCustomer:true};
  const result=requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE,{input})).draftOrderCreate),draft=result.draftOrder;
  const updated=(await pool.query(`update quotes set shopify_draft_order_id=$1,shopify_draft_order_name=$2,shopify_draft_order_status=$3,
    shopify_invoice_url=$4,shopify_synced_at=now() where id=$5 returning *`,[draft.id,draft.name,draft.status,draft.invoiceUrl,row.id])).rows[0];
  await pool.query(`insert into invoices(client_id,project_id,product_id,quote_id,number,amount_cents,currency,status,external_url,kind) values($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9)
    on conflict(client_id,number) do update set project_id=excluded.project_id,product_id=excluded.product_id,quote_id=excluded.quote_id,
      amount_cents=excluded.amount_cents,currency=excluded.currency,status='draft',external_url=excluded.external_url,kind=excluded.kind`,
    [row.client_id,row.project_id,req.params.id,row.id,draft.name,quoteTotalCents(row)-Number(deposit?.amount_cents||0),row.currency,draft.invoiceUrl,deposit?'balance':'invoice']);
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
// Project draft-invoice roll-up: preview -> create one combined Shopify draft order -> send.
async function loadProjectInvoiceInputs(projectId,productIds){
  const project=(await pool.query(`select pr.*,c.name client_name,c.slug client_slug,c.shopify_customer_id,c.shopify_currency
    from projects pr join clients c on c.id=pr.client_id where pr.id=$1`,[projectId])).rows[0];
  if(!project)return {error:'Project not found',code:404};
  const products=(await pool.query(`select p.*,
      (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) configuration,
      coalesce((select json_agg(json_build_object('min_quantity',pt.min_quantity,'max_quantity',pt.max_quantity,
        'unit_cost_cents',pt.unit_cost_cents,'wholesale_cents',pt.wholesale_cents,'srp_cents',pt.srp_cents,
        'setup_cents',pt.setup_cents,'freight_cents',pt.freight_cents,'lead_time_days',pt.lead_time_days) order by pt.min_quantity)
        from price_tiers pt where pt.product_id=p.id),'[]') price_tiers
      from products p where p.project_id=$1 and p.id=any($2::uuid[]) order by p.updated_at,p.title`,[project.id,productIds])).rows;
  const quotes=(await pool.query(`select q.* from quotes q join products p on p.id=q.product_id where p.project_id=$1`,[project.id])).rows;
  const currencies=[...new Set(products.map(p=>latestProductQuote(p.id,quotes)?.currency).filter(Boolean))];
  return {project,products,quotes,currencies,currency:currencies[0]||project.shopify_currency||'USD'};
}
app.post('/v1/admin/projects/:id/invoice-preview',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const productIds=Array.isArray(req.body?.productIds)?req.body.productIds.filter(Boolean):[];
  if(!productIds.length)return reply.code(400).send({error:'Select at least one product to invoice'});
  const ctx=await loadProjectInvoiceInputs(req.params.id,productIds);
  if(ctx.error)return reply.code(ctx.code).send({error:ctx.error});
  if(!ctx.products.length)return reply.code(400).send({error:'None of those products belong to this project'});
  if(ctx.currencies.length>1)return reply.code(400).send({error:`Selected products are quoted in different currencies (${ctx.currencies.join(', ')}). Invoice them separately.`});
  const {summary,skipped,amountCents}=draftOrderLinesForProducts(ctx.products,ctx.quotes,ctx.currency);
  return {projectId:ctx.project.id,projectName:ctx.project.name,clientName:ctx.project.client_name,
    hasCustomer:Boolean(ctx.project.shopify_customer_id),currency:ctx.currency,amountCents,
    productCount:summary.length,lineItems:summary,skipped,
    estimatedCount:summary.filter(l=>l.estimated).length,noVariantCount:summary.filter(l=>!l.hasVariant).length};
});
app.post('/v1/admin/projects/:id/draft-invoice',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const productIds=Array.isArray(req.body?.productIds)?req.body.productIds.filter(Boolean):[];
  if(!productIds.length)return reply.code(400).send({error:'Select at least one product to invoice'});
  const ctx=await loadProjectInvoiceInputs(req.params.id,productIds);
  if(ctx.error)return reply.code(ctx.code).send({error:ctx.error});
  if(!ctx.products.length)return reply.code(400).send({error:'None of those products belong to this project'});
  if(ctx.project.archived_at||['archive','archived'].includes(ctx.project.status))return reply.code(409).send({error:'Restore this project before invoicing it'});
  if(ctx.currencies.length>1)return reply.code(400).send({error:`Selected products are quoted in different currencies (${ctx.currencies.join(', ')}). Invoice them separately.`});
  const {lineItems,summary,skipped,amountCents}=draftOrderLinesForProducts(ctx.products,ctx.quotes,ctx.currency);
  if(!lineItems.length)return reply.code(400).send({error:'None of the selected products have units and a wholesale price yet'});
  const input={lineItems,customerId:ctx.project.shopify_customer_id||undefined,
    note:req.body?.note||`Future Basics — ${ctx.project.name} combined invoice`,
    tags:['future-basics-client-hub','fb-project-invoice',`client-${String(ctx.project.client_slug||ctx.project.client_name).toLowerCase().replace(/[^a-z0-9]+/g,'-')}`],visibleToCustomer:true};
  const result=requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE,{input})).draftOrderCreate),draft=result.draftOrder;
  const invoice=(await pool.query(`insert into invoices(client_id,project_id,number,amount_cents,currency,status,external_url,shopify_draft_order_id,shopify_draft_order_status,product_ids)
    values($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9)
    on conflict(client_id,number) do update set project_id=excluded.project_id,amount_cents=excluded.amount_cents,currency=excluded.currency,
      status='draft',external_url=excluded.external_url,shopify_draft_order_id=excluded.shopify_draft_order_id,
      shopify_draft_order_status=excluded.shopify_draft_order_status,product_ids=excluded.product_ids returning *`,
    [ctx.project.client_id,ctx.project.id,draft.name,amountCents,ctx.currency,draft.invoiceUrl,draft.id,draft.status,ctx.products.filter(p=>summary.some(s=>s.productId===p.id)).map(p=>p.id)])).rows[0];
  await pool.query('insert into activities(client_id,actor_id,type,summary) values($1,$2,$3,$4)',[ctx.project.client_id,req.auth.sub,'commerce',`Created combined draft invoice ${draft.name} · ${summary.length} product${summary.length===1?'':'s'}`]);
  return reply.code(201).send({invoice,draftOrder:{id:draft.id,name:draft.name,status:draft.status,invoiceUrl:draft.invoiceUrl},
    lineItems:summary,skipped,amountCents,currency:ctx.currency});
});
app.post('/v1/admin/project-invoices/:invoiceId/send',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const invoice=(await pool.query('select * from invoices where id=$1',[req.params.invoiceId])).rows[0];
  if(!invoice||!invoice.shopify_draft_order_id)return reply.code(404).send({error:'Combined draft invoice not found'});
  const email=(req.body?.to||req.body?.subject||req.body?.message)?{to:req.body?.to||undefined,subject:req.body?.subject||undefined,customMessage:req.body?.message||undefined}:undefined;
  const result=requireNoUserErrors((await shopifyGraphql(DRAFT_INVOICE_SEND,{id:invoice.shopify_draft_order_id,email})).draftOrderInvoiceSend),draft=result.draftOrder;
  const updated=(await pool.query(`update invoices set status='due',external_url=coalesce($1,external_url),shopify_draft_order_status=$2,shopify_invoice_sent_at=now() where id=$3 returning *`,
    [draft.invoiceUrl,draft.status,invoice.id])).rows[0];
  await pool.query('insert into activities(client_id,actor_id,type,summary) values($1,$2,$3,$4)',[invoice.client_id,req.auth.sub,'commerce',`Sent combined invoice ${draft.name||invoice.number}`]);
  return updated;
});
app.post('/v1/admin/shopify/sync-commerce',{preHandler:[authenticate,adminOnly]},async(req)=>{
  const quotes=(await pool.query('select q.*,p.client_id,p.id product_id from quotes q join products p on p.id=q.product_id where q.shopify_draft_order_id is not null')).rows;
  const synced=[];
  for(const quote of quotes){
    const draft=(await shopifyGraphql(DRAFT_ORDER_STATUS,{id:quote.shopify_draft_order_id})).draftOrder;if(!draft)continue;
    const financial=draft.order?.displayFinancialStatus||null,fulfillment=draft.order?.displayFulfillmentStatus||null;
    await pool.query(`update quotes set shopify_draft_order_status=$1,shopify_invoice_url=$2,shopify_order_id=$3,shopify_financial_status=$4,
      shopify_fulfillment_status=$5,shopify_synced_at=now() where id=$6`,[draft.status,draft.invoiceUrl,draft.order?.id||null,financial,fulfillment,quote.id]);
    const invoiceStatus=financial==='PAID'?'paid':draft.status==='INVOICE_SENT'?'due':draft.status==='COMPLETED'?'paid':'draft';
    await pool.query(`update invoices set status=$1,external_url=coalesce($2,external_url) where client_id=$3 and number=$4 and kind<>'deposit'`,[invoiceStatus,draft.invoiceUrl,quote.client_id,draft.name]);
    synced.push({quoteId:quote.id,draftOrder:draft.name,status:draft.status,financialStatus:financial,fulfillmentStatus:fulfillment});
  }
  const projectInvoices=(await pool.query(`select * from invoices where shopify_draft_order_id is not null and (quote_id is null or kind='deposit')`)).rows;
  const syncedInvoices=[];
  for(const invoice of projectInvoices){
    const draft=(await shopifyGraphql(DRAFT_ORDER_STATUS,{id:invoice.shopify_draft_order_id})).draftOrder;if(!draft)continue;
    const financial=draft.order?.displayFinancialStatus||null;
    const invoiceStatus=financial==='PAID'?'paid':draft.status==='INVOICE_SENT'?'due':draft.status==='COMPLETED'?'paid':invoice.status==='due'?'due':'draft';
    await pool.query(`update invoices set external_url=coalesce($1,external_url),shopify_draft_order_status=$2,
      shopify_order_id=$3,shopify_financial_status=$4 where id=$5`,[draft.invoiceUrl,draft.status,draft.order?.id||null,financial,invoice.id]);
    if(invoiceStatus!==invoice.status)await setInvoiceStatus(invoice.id,invoiceStatus,req.auth.sub);
    syncedInvoices.push({invoiceId:invoice.id,draftOrder:draft.name,status:draft.status,financialStatus:financial});
  }
  return {count:synced.length+syncedInvoices.length,quotes:synced,projectInvoices:syncedInvoices,syncedAt:new Date().toISOString()};
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
  if(approval.kind==='sample')await flow(req.params.id,'sample-posted',{actorId:req.auth.sub});
  await notifyClientContact(product.client_id,{subject:`${approval.kind==='sample'?'Your sample is ready to review':'Approval needed'} — ${product.title}`,title:approval.kind==='sample'?'Your sample is ready to review':'Something needs your approval',
    body:`<p>${approval.kind==='sample'?`The sample for <strong>${emailEscape(product.title)}</strong> is ready. Look at the photos and notes, then approve it or ask for changes.`:`<strong>${emailEscape(linked?`${linked.asset_name} v${linked.version}`:title)}</strong> for ${emailEscape(product.title)} is waiting for your approval.`}</p>${notes?`<p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(notes)}</p>`:''}${hubButton(`${clientHubUrl}/`,'Review it in your hub')}`});
  return reply.code(201).send(approval);
});
app.post('/v1/admin/clients/:id/invoices',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const {number,amountCents,status='due',dueDate,externalUrl,projectId}=req.body||{};
  if(projectId&&!(await pool.query('select 1 from projects where id=$1 and client_id=$2',[projectId,req.params.id])).rowCount)return reply.code(400).send({error:'Project does not belong to this client'});
  return reply.code(201).send((await pool.query(`insert into invoices(client_id,project_id,number,amount_cents,status,due_date,external_url)
    values($1,$2,$3,$4,$5,$6,$7) returning *`,[req.params.id,projectId||null,number,amountCents,status,dueDate||null,externalUrl||null])).rows[0]);
});
app.get('/v1/invoices/:id/download',{preHandler:authenticate},async(req,reply)=>{
  const row=(await pool.query(`select i.*,c.name client_name,pr.name project_name from invoices i join clients c on c.id=i.client_id
    left join projects pr on pr.id=i.project_id where i.id=$1`,[req.params.id])).rows[0];
  if(!row||(req.auth.role!=='admin'&&row.client_id!==req.auth.clientId))return reply.code(404).send({error:'Invoice not found'});
  const safeNumber=String(row.number||'invoice').replace(/[^a-zA-Z0-9_-]/g,'-');
  return reply.type('application/pdf').header('content-disposition',`attachment; filename="${safeNumber}.pdf"`)
    .send(invoicePdf(row,{name:row.client_name},row.project_name?{name:row.project_name}:null));
});

app.get('/v1/projects/:id/share.pdf',{preHandler:authenticate},async(req,reply)=>{
  const project=(await pool.query(`select pr.*,c.name client_name,c.status client_status,c.archived_at client_archived_at
    from projects pr join clients c on c.id=pr.client_id where pr.id=$1`,[req.params.id])).rows[0];
  if(!project||(req.auth.role!=='admin'&&project.client_id!==req.auth.clientId))return reply.code(404).send({error:'Project not found'});
  if(req.auth.role!=='admin'&&(project.archived_at||project.client_archived_at||['archive','archived'].includes(project.status)||['archive','archived'].includes(project.client_status)))return reply.code(404).send({error:'Project not found'});
  const [products,quotes]=await Promise.all([
    pool.query(`select p.*,
      (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) configuration,
      coalesce((select json_agg(json_build_object('min_quantity',pt.min_quantity,'max_quantity',pt.max_quantity,
        'wholesale_cents',pt.wholesale_cents,'srp_cents',pt.srp_cents,'setup_cents',pt.setup_cents,
        'freight_cents',pt.freight_cents,'lead_time_days',pt.lead_time_days) order by pt.min_quantity)
        from price_tiers pt where pt.product_id=p.id),'[]') price_tiers
      from products p where p.project_id=$1 order by p.updated_at,p.title`,[project.id]),
    pool.query(`select q.* from quotes q join products p on p.id=q.product_id where p.project_id=$1 order by q.version desc`,[project.id])
  ]);
  const filename=`${intakeSlug(project.client_name)}-${intakeSlug(project.name)}-collection.pdf`;
  const pdf=await projectCollectionPdf({id:project.client_id,name:project.client_name},project,products.rows,quotes.rows);
  return reply.type('application/pdf').header('content-disposition',`attachment; filename="${filename}"`).send(pdf);
});

// Everything waiting on the client right now, newest first: a published tech pack version to approve (or send back), the latest
// quote to accept or decline, a sample or artwork to approve, an invoice to pay. The hub shows these as one "Waiting on you" list.
async function clientWaiting(clientId,{products,quotes,approvals,invoices}){
  const live=new Map(products.map(p=>[p.id,p])),out=[];
  const packs=(await pool.query(`select product_id,version,verification,published_at from tech_packs where client_id=$1 and published_at is not null`,[clientId])).rows;
  for(const tp of packs){const p=live.get(tp.product_id);if(!p)continue;const v=normalizeVerification(tp.verification,tp.version);if(v.clientSign||v.changes)continue;
    out.push({kind:'tech-pack',id:`tp-${tp.product_id}`,productId:p.id,projectId:p.project_id,title:`Approve tech pack v${tp.version}`,product:p.title,at:tp.published_at,href:`/tech-packs/${p.id}#sign`})}
  const latest=new Map();for(const q of quotes)if(!latest.has(q.product_id)||q.version>latest.get(q.product_id).version)latest.set(q.product_id,q);
  for(const q of latest.values()){const p=live.get(q.product_id);if(!p||q.status!=='issued')continue;if(!quoteReadiness(p,p.configuration||null,q).ready)continue;
    const total=Number(q.quantity||0)*Number(q.wholesale_cents||q.unit_cost_cents||0)+Number(q.tooling_cents||0)+Number(q.freight_cents||0);
    out.push({kind:'quote',id:q.id,productId:p.id,projectId:p.project_id,title:`Accept quote v${q.version}`,product:p.title,at:q.created_at,quantity:q.quantity,unitCents:q.wholesale_cents||q.unit_cost_cents,totalCents:total,depositPct:q.deposit_pct??null})}
  for(const a of approvals){const p=live.get(a.product_id);if(!p)continue;
    out.push({kind:'approval',id:a.id,productId:p.id,projectId:p.project_id,title:a.kind==='sample'?`Approve the sample`:`Approve ${a.asset_name?`${a.asset_name} v${a.asset_version}`:a.title}`,product:p.title,at:a.requested_at,notes:a.notes||null,assetVersionId:a.asset_version_id||null,approvalKind:a.kind})}
  for(const i of invoices){if(i.status!=='due')continue;
    out.push({kind:'invoice',id:i.id,productId:i.product_id||null,projectId:i.project_id||null,title:`Pay ${i.kind==='deposit'?'the sample deposit':'invoice'} ${i.number}`,product:live.get(i.product_id)?.title||null,at:i.created_at,amountCents:i.amount_cents,payUrl:i.external_url||null})}
  return out.sort((a,b)=>new Date(b.at)-new Date(a.at));
}
app.get('/v1/dashboard', { preHandler: authenticate }, async (req,reply) => {
  const id = req.auth.clientId;
  const workspace=(await pool.query('select status,archived_at from clients where id=$1',[id])).rows[0];
  if(!workspace||workspace.archived_at||['archive','archived'].includes(workspace.status))return reply.code(404).send({error:'Client workspace not found'});
  const [requests, invoices, projects, projectMessages, projectFiles, productComments, products, quotes, approvals, activities] = await Promise.all([
    pool.query('select * from requests where client_id=$1 order by created_at desc', [id]),
    pool.query('select * from invoices where client_id=$1 order by due_date desc nulls last', [id]),
    pool.query(`select pr.*,(select count(*)::int from products p where p.project_id=pr.id) product_count
      from projects pr where client_id=$1 and pr.archived_at is null and pr.status not in ('archive','archived') order by updated_at desc`, [id]),
    pool.query(`select pm.*,coalesce(u.name,u.email,case when pm.author_role='admin' then 'Future Basics' else c.name end) author_name
      from project_messages pm left join users u on u.id=pm.author_id join clients c on c.id=pm.client_id
      where pm.client_id=$1 order by pm.created_at`,[id]),
    pool.query(`select pf.*,coalesce(u.name,u.email,case when pf.uploader_role='admin' then 'Future Basics' else c.name end) uploader_name
      from project_files pf left join users u on u.id=pf.uploader_id join clients c on c.id=pf.client_id
      where pf.client_id=$1 order by pf.created_at desc`,[id]),
    pool.query(`select co.*,p.project_id,p.title product_title,
      coalesce(u.name,u.email,case when co.author_role='admin' then 'Future Basics' else c.name end) author_name
      from comments co join products p on p.id=co.product_id left join users u on u.id=co.author_id join clients c on c.id=co.client_id
      where co.client_id=$1 and co.visibility='client' order by co.created_at`,[id]),
    pool.query(`select p.*,
      (select tp.version from tech_packs tp where tp.product_id=p.id and tp.published_at is not null) tech_pack_version,
      (select tp.published_at from tech_packs tp where tp.product_id=p.id and tp.published_at is not null) tech_pack_published_at,
      (select json_build_object('status',tp.status,'initiated_by',tp.initiated_by,'submitted_at',tp.submitted_at,'version',tp.version,'published_at',tp.published_at,'client_signed',(tp.verification->'clientSign'->>'name') is not null,'brand_signed',(tp.verification->'brandSign'->>'name') is not null,'factory_signed',(tp.verification->'factorySign'->>'name') is not null,'locked_at',tp.locked_at,'quote_waiting',exists(select 1 from tech_pack_shares qs where qs.tech_pack_id=tp.id and qs.assigned and qs.kind='quote' and qs.revoked_at is null and qs.waived_at is null and (qs.expires_at is null or qs.expires_at>now()) and not exists(select 1 from factory_quotes fq where fq.share_id=qs.id))) from tech_packs tp where tp.product_id=p.id) tech_pack,
      ${HAS_RENDERING_SQL},
      (select pc.moq from product_configurations pc where pc.product_id=p.id) moq,
      (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) configuration,
      (select pt.wholesale_cents from price_tiers pt where pt.product_id=p.id order by pt.min_quantity limit 1) wholesale_cents,
      (select pt.srp_cents from price_tiers pt where pt.product_id=p.id order by pt.min_quantity limit 1) srp_cents,
      coalesce((select json_agg(json_build_object('id',pt.id,'product_id',pt.product_id,'min_quantity',pt.min_quantity,
        'max_quantity',pt.max_quantity,'wholesale_cents',pt.wholesale_cents,'srp_cents',pt.srp_cents,
        'setup_cents',pt.setup_cents,'freight_cents',pt.freight_cents,
        'lead_time_days',pt.lead_time_days,'notes',pt.notes) order by pt.min_quantity)
        from price_tiers pt where pt.product_id=p.id),'[]') price_tiers,
      coalesce(json_agg(m order by m.sort_order) filter(where m.id is not null),'[]') milestones
      from products p left join milestones m on m.product_id=p.id where p.client_id=$1
      and not exists(select 1 from projects archived_project where archived_project.id=p.project_id
        and (archived_project.archived_at is not null or archived_project.status in ('archive','archived')))
      group by p.id order by p.updated_at desc`, [id]),
    pool.query(`select q.* from quotes q join products p on p.id=q.product_id where p.client_id=$1 order by q.created_at desc`,[id]),
    pool.query(`select a.*,p.title product_title,av.version asset_version,ast.name asset_name from approvals a
      join products p on p.id=a.product_id left join asset_versions av on av.id=a.asset_version_id left join assets ast on ast.id=av.asset_id
      where p.client_id=$1 and a.status='pending'
      and not exists(select 1 from projects archived_project where archived_project.id=p.project_id
        and (archived_project.archived_at is not null or archived_project.status in ('archive','archived')))
      order by a.requested_at`, [id]),
    pool.query('select * from activities where client_id=$1 order by created_at desc limit 50', [id])
  ]);
  const waiting=await clientWaiting(id,{products:products.rows,quotes:quotes.rows,approvals:approvals.rows,invoices:invoices.rows});
  return { requests: requests.rows, invoices: invoices.rows, projects: projects.rows,projectFinancials:projectFinancialRollups(projects.rows,products.rows,quotes.rows,invoices.rows),projectMessages: projectMessages.rows,projectFiles:projectFiles.rows,
    productComments:productComments.rows, products: products.rows.map(withRendering),
    approvals: approvals.rows, activities: activities.rows, waiting,
    actions: [
      ...approvals.rows.map(a=>({type:'approval',id:a.id,title:'Approve '+a.product_title+' — '+(a.asset_name?`${a.asset_name} v${a.asset_version}`:a.title),due:null})),
      ...invoices.rows.filter(x=>x.status==='due').map(x=>({type:'invoice',id:x.id,title:'Invoice '+x.number+' due',due:x.due_date}))
    ] };
});

// A project's thread as the client sees it: names written for a reader (our staff are "Future Basics", a client's own people go by name), files attached
// to their messages, and what was said about the project's products folded in as tagged messages.
app.get('/v1/projects/:id/thread',{preHandler:authenticate},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Project not found'});
  const project=(await pool.query(`select id,name from projects where id=$1 and client_id=$2 and archived_at is null`,[req.params.id,req.auth.clientId])).rows[0];
  if(!project)return reply.code(404).send({error:'Project not found'});
  const [msgs,files,comments]=await Promise.all([
    pool.query(`select pm.id,pm.author_role,pm.body,pm.reply_to_id,pm.created_at,
        case when pm.author_role='admin' then coalesce(nullif(u.name,''),'Future Basics') else coalesce(nullif(u.name,''),u.email,c.name) end author_name
      from project_messages pm left join users u on u.id=pm.author_id join clients c on c.id=pm.client_id where pm.project_id=$1 and pm.client_id=$2 order by pm.created_at desc limit 200`,[project.id,req.auth.clientId]),
    pool.query(`select id,message_id,original_name,size_bytes from project_files where project_id=$1 and client_id=$2 and message_id is not null`,[project.id,req.auth.clientId]),
    pool.query(`select cm.id,cm.author_role,cm.body,cm.created_at,p.title product_title,
        case when cm.author_role='admin' then coalesce(nullif(u.name,''),'Future Basics') else coalesce(nullif(u.name,''),u.email) end author_name
      from comments cm join products p on p.id=cm.product_id left join users u on u.id=cm.author_id where p.project_id=$1 and cm.client_id=$2 and cm.visibility='client' order by cm.created_at desc limit 100`,[project.id,req.auth.clientId])
  ]);
  const messages=[...msgs.rows.reverse().map(m=>({...m,files:files.rows.filter(f=>f.message_id===m.id)})),
    ...comments.rows.reverse().map(c=>({id:c.id,author_role:c.author_role,author_name:c.author_name,body:c.body,created_at:c.created_at,reply_to_id:null,files:[],tag:`About ${c.product_title}`,noReply:true}))]
    .sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  return {project:{id:project.id,name:project.name},messages,events:[]};
});
app.post('/v1/projects/:id/messages',{preHandler:authenticate},async(req,reply)=>{
  const body=String(req.body?.body||'').trim(),replyToId=req.body?.replyToId||null;if(!body)return reply.code(400).send({error:'Message required'});
  const project=(await pool.query(`select id,client_id,name from projects where id=$1 and client_id=$2
    and archived_at is null and status not in ('archive','archived')`,[req.params.id,req.auth.clientId])).rows[0];
  if(!project)return reply.code(404).send({error:'Project not found'});
  const role=req.auth.role==='admin'?'admin':'client';
  if(replyToId&&!(await pool.query('select 1 from project_messages where id=$1 and project_id=$2',[replyToId,project.id])).rowCount)return reply.code(400).send({error:'Reply target is not in this project'});
  const message=(await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body,reply_to_id)
    values($1,$2,$3,$4,$5,$6) returning *`,[project.id,project.client_id,req.auth.sub,role,body.slice(0,5000),replyToId])).rows[0];
  await pool.query('update projects set updated_at=now() where id=$1',[project.id]);
  if(role==='client')await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id)
    values($1,'client-project-message',$2,'project',$3)`,[project.client_id,`Client replied in ${project.name}`,project.id]);
  return reply.code(201).send(message);
});
app.post('/v1/projects/:id/uploads',{preHandler:authenticate},async(req,reply)=>{
  const project=(await pool.query(`select id,client_id,name from projects where id=$1 and client_id=$2
    and archived_at is null and status not in ('archive','archived')`,[req.params.id,req.auth.clientId])).rows[0];if(!project)return reply.code(404).send({error:'Project not found'});
  const part=await req.file();if(!part)return reply.code(400).send({error:'Choose a file to upload'});
  const body=String(req.query?.body||'').trim(),replyToId=req.query?.replyToId||null;
  if(replyToId&&!(await pool.query('select 1 from project_messages where id=$1 and project_id=$2',[replyToId,project.id])).rowCount)return reply.code(400).send({error:'Reply target is not in this project'});
  const role=req.auth.role==='admin'?'admin':'client';
  const message=(await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body,reply_to_id)
    values($1,$2,$3,$4,$5,$6) returning *`,[project.id,project.client_id,req.auth.sub,role,(body||`Uploaded ${cleanName(part.filename)}`).slice(0,5000),replyToId])).rows[0];
  const file=await storeProjectFile(project,req.auth.sub,role,part,message.id);await pool.query('update projects set updated_at=now() where id=$1',[project.id]);
  if(role==='client')await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'client-project-file',$2,'project',$3)`,[project.client_id,`Client uploaded ${file.original_name} in ${project.name}`,project.id]);
  return reply.code(201).send({message,file});
});

app.get('/v1/project-files/:id/download',{preHandler:authenticate},async(req,reply)=>{
  const row=(await pool.query('select * from project_files where id=$1',[req.params.id])).rows[0];
  if(!row||(req.auth.role!=='admin'&&row.client_id!==req.auth.clientId))return reply.code(404).send({error:'File not found'});
  return reply.type(row.mime_type||'application/octet-stream').header('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`).send(createReadStream(join(uploadDir,row.storage_name)));
});

app.get('/v1/products/:id', { preHandler: authenticate }, async (req, reply) => {
  const product=withRendering((await pool.query(`select p.*,${HAS_RENDERING_SQL} from products p where p.id=$1 and p.client_id=$2
    and not exists(select 1 from projects archived_project where archived_project.id=p.project_id
      and (archived_project.archived_at is not null or archived_project.status in ('archive','archived')))`,[req.params.id,req.auth.clientId])).rows[0]);
  if(!product)return reply.code(404).send({error:'Product not found'});
  const [brief,milestones,quotes,approvals,files,activity,productionRuns,shipments,assets,assetVersions,comments,configuration,priceTiers]=await Promise.all([
    pool.query('select * from product_briefs where product_id=$1',[product.id]),
    pool.query('select * from milestones where product_id=$1 order by sort_order',[product.id]),
    pool.query(`select id,product_id,version,currency,quantity,tooling_cents,freight_cents,status,expires_at,created_at,wholesale_cents,srp_cents,notes,
      decided_by,decided_at,decision_notes,
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
  const latestQuote=quotes.rows[0]||null,quoteDecision={...quoteReadiness(product,configuration.rows[0]||null,latestQuote),quote:latestQuote,state:latestQuote?.status||null};
  return {product,brief:brief.rows[0]||null,milestones:milestones.rows,quotes:quotes.rows,quoteDecision,approvals:approvals.rows,files:files.rows,
    activity:activity.rows,productionRuns:productionRuns.rows,shipments:shipments.rows,assets:assets.rows,
    assetVersions:assetVersions.rows,comments:comments.rows,configuration:configuration.rows[0]||null,priceTiers:priceTiers.rows};
});

app.post('/v1/quotes/:id/decision', { preHandler: authenticate }, async (req, reply) => {
  const decision=String(req.body?.decision||'');
  if(!['approved','declined'].includes(decision))return reply.code(400).send({error:'decision must be approved or declined'});
  const client=await pool.connect();
  try{
    await client.query('begin');
    const row=(await client.query(`select q.*,p.title product_title,p.product_type,p.project_id,p.client_id,pr.name project_name,c.name client_name,
      (select to_jsonb(pc) from product_configurations pc where pc.product_id=p.id) configuration
      from quotes q join products p on p.id=q.product_id join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id
      where q.id=$1 and p.client_id=$2 for update of q`,[req.params.id,req.auth.clientId])).rows[0];
    if(!row)throw Object.assign(new Error('Quote not found'),{statusCode:404});
    const latest=(await client.query('select id from quotes where product_id=$1 order by version desc limit 1',[row.product_id])).rows[0];
    if(latest?.id!==row.id)throw Object.assign(new Error('A newer quote is available for review'),{statusCode:409});
    const readiness=quoteReadiness({title:row.product_title,product_type:row.product_type},row.configuration,row);
    if(!readiness.ready)throw Object.assign(new Error(`Quote is not ready for approval: ${readiness.missing.join(', ')}`),{statusCode:409});
    const status=decision==='approved'?'accepted':'declined',notes=String(req.body?.notes||'').trim().slice(0,2000)||null;
    const updated=(await client.query(`update quotes set status=$1,decided_by=$2,decided_at=now(),decision_notes=$3 where id=$4 and status='issued' returning *`,
      [status,req.auth.sub,notes,row.id])).rows[0];
    if(!updated)throw Object.assign(new Error('This quote has already been decided'),{statusCode:409});
    if(decision==='approved')await client.query(`update products set status='in-development',risk_level='on-track',updated_at=now() where id=$1`,[row.product_id]);
    else await client.query(`update products set risk_level='attention',updated_at=now() where id=$1`,[row.product_id]);
    await applyFlow(client,row.product_id,decision==='approved'?'quote-accepted':'quote-declined',{actorId:req.auth.sub,note:`quote v${row.version}`});
    const action=decision==='approved'?'approved':'declined',next=decision==='approved'?' The product is ready to move into development.':'';
    const message=`${row.client_name} ${action} quote v${row.version} for ${row.product_title}.${next}${notes?` Note: ${notes}`:''}`;
    if(row.project_id)await client.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,$3,'client',$4)`,[row.project_id,row.client_id,req.auth.sub,message]);
    await client.query('insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,$4,$5)',[row.client_id,row.product_id,req.auth.sub,'quote-decision',message]);
    await client.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'quote-decision',$2,'quote',$3)`,[row.client_id,message,row.id]);
    await client.query('commit');
    let deposit=null;
    if(decision==='approved')deposit=await createDepositInvoice(row.id,req.auth.sub).catch(e=>{app.log.error({err:e.message,quoteId:row.id},'sample deposit not invoiced');return null});
    await notifyStaff(`${row.client_name} ${decision==='approved'?'accepted':'declined'} quote v${row.version} — ${row.product_title}`,`<p>${emailEscape(message)}</p>${hubButton(`${workHubUrl}/clients/${row.client_id}`,'Open the client room')}`);
    return {...updated,decision,nextStage:decision==='approved'?'development':null,deposit:deposit?{id:deposit.id,number:deposit.number,amountCents:deposit.amount_cents,payUrl:deposit.external_url}:null};
  }catch(error){await client.query('rollback').catch(()=>{});throw error}finally{client.release()}
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
  // a sample approval moves the product (to production, or back to the spec); artwork and other approvals only record the decision
  if(row.kind==='sample')await flow(row.product_id,decision==='approved'?'sample-approved':'sample-changes',{actorId:req.auth.sub,note:row.notes||null});
  await pool.query(`update products set risk_level=$2,updated_at=now() where id=$1`,[row.product_id,decision==='approved'?'on-track':'attention']);
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

// Staff move a client's request along: in progress, done or declined. An optional reply goes to the client in the project thread.
const REQUEST_STATUSES=['submitted','in-progress','done','declined'];
app.patch('/v1/admin/requests/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const status=String(req.body?.status||'');if(!REQUEST_STATUSES.includes(status))return reply.code(400).send({error:`Status must be one of: ${REQUEST_STATUSES.join(', ')}`});
  const reply_=String(req.body?.reply||'').trim().slice(0,4000);
  const row=(await pool.query(`update requests set status=$1,updated_at=now() where id=$2 returning *`,[status,req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Request not found'});
  const product=row.product_id?(await pool.query('select id,title,project_id from products where id=$1',[row.product_id])).rows[0]:null;
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'request',$4)`,[row.client_id,product?.id||null,req.auth.sub,`Request "${row.title}" marked ${status.replace('-',' ')}`]);
  if(reply_&&product?.project_id)await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,$3,'admin',$4)`,[product.project_id,row.client_id,req.auth.sub,`Re: ${row.title} (${status.replace('-',' ')}) — ${reply_}`]);
  return row;
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

// ---- Tech packs: built in the work console, published to the client hub, shared with factories by link ----
async function loadAdminTechPack(productId){
  const product=(await pool.query(`select p.id,p.client_id,p.project_id,p.title,p.product_type,p.shopify_handle,p.description_html,p.shopify_image_url,p.shopify_image_alt,p.current_stage,
    c.name client_name,c.slug client_slug,c.contact_name client_contact_name,c.contact_email client_contact_email,pr.name project_name from products p join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id where p.id=$1`,[productId])).rows[0];
  if(!product)return null;
  const [pack,configuration,brief]=await Promise.all([
    pool.query('select * from tech_packs where product_id=$1',[productId]),
    pool.query(`select pc.*,s.name supplier_name from product_configurations pc left join suppliers s on s.id=pc.supplier_id where pc.product_id=$1`,[productId]),
    pool.query('select * from product_briefs where product_id=$1',[productId])]);
  return {product,techPack:pack.rows[0]||null,configuration:configuration.rows[0]||null,brief:brief.rows[0]||null};
}
// The version a page must hold to save over this pack: the later of the last save and the assistant landing. (The assistant
// does not touch updated_at, because an untouched draft is defined by updated_at = created_at and the nudge email relies on it.)
const packEtag=row=>{const t=Math.max(row?.updated_at?new Date(row.updated_at).getTime():0,row?.ai_completed_at?new Date(row.ai_completed_at).getTime():0);return t?new Date(t).toISOString():null};
function techPackPayload(row){
  if(!row)return null;
  const publishedData=row.published_data?normalizeTechPack(row.published_data):null,verification=normalizeVerification(row.verification,row.version);
  return {id:row.id,productId:row.product_id,version:row.version,status:row.status,initiatedBy:row.initiated_by||'brand',submittedAt:row.submitted_at||null,source:row.source||'hub',followupSentAt:row.followup_sent_at||null,aiStatus:row.ai_status||null,aiError:row.ai_error||null,aiAttempts:row.ai_attempts||0,billing:row.billing||null,paidAt:row.paid_at||null,checkoutUrl:row.pay_invoice_url||null,data:normalizeTechPack(row.data),publishedAt:row.published_at,publishedData,
    verification,readiness:publishedData?techPackReadiness(publishedData,verification):null,lockedAt:row.locked_at||null,
    revisions:Array.isArray(row.revisions)?row.revisions:[],updatedAt:row.updated_at,createdAt:row.created_at,etag:packEtag(row)};
}
// Applies a change to the verification chain of the CURRENT published version only; a concurrent publish makes the write a no-op.
async function updateVerification(packId,version,mutate){
  const row=(await pool.query('select * from tech_packs where id=$1',[packId])).rows[0];
  if(!row||row.version!==version)return null;
  const verification=normalizeVerification(row.verification,row.version);
  mutate(verification);
  const locked=Boolean(verification.clientSign&&verification.brandSign&&verification.factorySign);
  const updated=(await pool.query(`update tech_packs set verification=$3,locked_at=case when $4 then coalesce(locked_at,now()) else null end where id=$1 and version=$2 returning *`,
    [packId,version,verification,locked])).rows[0]||null;
  if(updated)await pool.query(`update tech_pack_versions set verification=$3,locked_at=$4 where tech_pack_id=$1 and version=$2`,[packId,version,verification,updated.locked_at]);
  return updated;
}
// Moves a product along its milestones (src/flow.js). It never fails the request it rides on: a flow that cannot be written is logged.
const flow=(productId,event,opts={},q=pool)=>applyFlow(q,productId,event,opts).catch(err=>{app.log.warn({err:err.message,productId,event},'product flow not updated');return {changed:false}});
const shareRow=s=>({id:s.id,kind:s.kind||'review',includeModel:Boolean(s.include_model),supplierId:s.supplier_id||null,assigned:Boolean(s.assigned),waived:Boolean(s.waived_at),label:s.label,email:s.email,createdAt:s.created_at,expiresAt:s.expires_at,revokedAt:s.revoked_at,lastViewedAt:s.last_viewed_at,viewCount:s.view_count,
  active:!s.revoked_at&&(!s.expires_at||new Date(s.expires_at)>new Date())});
app.get('/v1/admin/products/:id/tech-pack',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  const shares=ctx.techPack?(await pool.query('select * from tech_pack_shares where tech_pack_id=$1 order by created_at desc',[ctx.techPack.id])).rows:[];
  const seed=seedTechPack(ctx);
  return {product:ctx.product,techPack:ctx.techPack?{...techPackPayload(ctx.techPack),loop:await latestLoop(ctx.techPack.id)}:null,seed,completeness:techPackCompleteness(ctx.techPack?.data||seed),shares:shares.map(shareRow),assignment:await assignmentView(ctx),suppliers:(await pool.query(`select id,name,contact_email,country from suppliers where status='active' order by lower(name)`)).rows.map(x=>({id:x.id,name:x.name,email:x.contact_email||'',country:x.country||''})),workHubUrl,clientHubUrl,translations:packTranslations(ctx.techPack),aiEnabled:aiEnabled(),loopEnabled:LOOP_ON(),cutoutEnabled:cutoutEnabled()};
});
// Sketches travel inline as data URLs, so this route accepts a larger body than the default 1MB.
// The card at the front of a product (hub and work console) reads product_configurations. The tech pack feeds it, so editing the pack updates the card
// the way a new price or MOQ does. A field the pack states overwrites the card; a field it leaves blank never erases anything. Only what the client
// is allowed to see is passed in: their own draft, or a version staff have published.
async function syncCardFromTechPack(productId,data,q=pool){
  const f=cardFieldsFromPack(data);if(!f)return false;
  const cur=(await q.query('select material,decoration_method,decoration_locations,colorways,sizes from product_configurations where product_id=$1',[productId])).rows[0];
  const next={material:f.material??cur?.material??null,decoration_method:f.decoration_method??cur?.decoration_method??null,decoration_locations:f.decoration_locations??cur?.decoration_locations??[],colorways:f.colorways??cur?.colorways??[],sizes:f.sizes??cur?.sizes??[]};
  if(cur&&JSON.stringify(cur)===JSON.stringify(next))return false;
  await q.query(`insert into product_configurations(product_id,material,decoration_method,decoration_locations,colorways,sizes) values($1,$2,$3,$4,$5,$6)
    on conflict(product_id) do update set material=excluded.material,decoration_method=excluded.decoration_method,decoration_locations=excluded.decoration_locations,colorways=excluded.colorways,sizes=excluded.sizes,updated_at=now()`,
    [productId,next.material,next.decoration_method,next.decoration_locations,next.colorways,next.sizes]);
  return true;
}
const syncCardQuietly=(productId,data)=>syncCardFromTechPack(productId,data).catch(err=>app.log.warn({err:err.message,productId},'product card not updated from the tech pack'));
app.put('/v1/admin/products/:id/tech-pack',{preHandler:[authenticate,adminOnly],bodyLimit:40_000_000},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  {const sent=req.body?.data;if(!sent||typeof sent!=='object'||Array.isArray(sent))return reply.code(400).send({error:'Nothing to save — reload the page and try again'})}
  const data=normalizeTechPack(req.body?.data);
  const row=(await pool.query(`insert into tech_packs(product_id,client_id,data,created_by) values($1,$2,$3,$4)
    on conflict(product_id) do update set data=excluded.data,updated_at=now() returning *`,[ctx.product.id,ctx.product.client_id,data,req.auth.sub])).rows[0];
  // staff finishing a client's own unpublished draft: the card follows. Anything else reaches the card when it is published.
  if(row.initiated_by==='client'&&!row.published_at)await syncCardQuietly(ctx.product.id,data);
  return {techPack:techPackPayload(row),completeness:techPackCompleteness(data)};
});
// Stored translations, keyed by language: { zh: { strings: { en: zh }, model, at } }. Only languages with content are returned.
const packTranslations=row=>{const t=row?.translations&&typeof row.translations==='object'?row.translations:{};return Object.fromEntries(Object.entries(t).filter(([k,v])=>TRANSLATION_LANGS.includes(k)&&v&&typeof v.strings==='object'&&Object.keys(v.strings).length))};
// The map is built from the draft AND the published version, so a reader of one version only gets the strings in it (no draft text leaks to a factory).
const translationsForPack=(row,data)=>{const allowed=new Set(packStrings(data));return Object.fromEntries(Object.entries(packTranslations(row)).map(([lang,v])=>{const strings=Object.fromEntries(Object.entries(v.strings).filter(([src])=>allowed.has(src)));return [lang,{...v,strings,count:Object.keys(strings).length}]}).filter(([,v])=>v.count>0))};
// Factory language. Future Basics presses the button in the work console; the factory link then renders in that language.
// Only strings not yet translated are sent to the model, so re-running after an edit is cheap.
app.post('/v1/admin/products/:id/tech-pack/translate',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const lang=String(req.body?.lang||'zh');if(!TRANSLATION_LANGS.includes(lang))return reply.code(400).send({error:'Unsupported language'});
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  if(!ctx.techPack)return reply.code(409).send({error:'Save the tech pack before translating it'});
  if(!aiEnabled())return reply.code(503).send({error:'Translation needs the assistant — add ANTHROPIC_API_KEY to the service'});
  const row=ctx.techPack,current=[...new Set([...packStrings(row.data),...(row.published_data?packStrings(row.published_data):[])])];
  const cached=packTranslations(row)[lang]?.strings||{},missing=current.filter(s=>!cached[s]);
  let model=packTranslations(row)[lang]?.model||null;
  if(missing.length){try{const r=await translateStrings(missing,{lang});Object.assign(cached,r.map);model=r.model}catch(e){req.log.error({err:e},'translate failed');return reply.code(502).send({error:'Translation failed — '+e.message})}}
  const strings=Object.fromEntries(current.filter(s=>cached[s]).map(s=>[s,cached[s]]));
  const entry={strings,model,at:new Date().toISOString(),count:Object.keys(strings).length};
  await pool.query(`update tech_packs set translations=jsonb_set(coalesce(translations,'{}'::jsonb),$2::text[],$3::jsonb) where id=$1`,[row.id,[lang],JSON.stringify(entry)]);
  if(missing.length)await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.client_id,row.product_id,`Tech pack translated for the factory (${LANG_LABELS[lang]?.label||lang}) — ${missing.length} new phrase${missing.length===1?'':'s'}`,{techPackId:row.id,lang,model}]);
  return {lang,...entry,translated:missing.length};
});
// Learning loop: at each milestone, diff the assistant's snapshot against the pack people kept and store the result.
async function recordDraftEdits(packId,stage){
  try{
    const row=(await pool.query('select id,product_id,client_id,version,data,published_data,ai_draft from tech_packs where id=$1',[packId])).rows[0];
    if(!row||!row.ai_draft)return null;
    const current=['published','approved','countersigned'].includes(stage)&&row.published_data?row.published_data:row.data;
    const sampleSize=normalizeTechPack(current).style.sampleSize||'';
    const stats=draftDiff(row.ai_draft,current,{sampleSize});
    await pool.query(`insert into tech_pack_edit_stats(tech_pack_id,product_id,client_id,stage,version,stats) values($1,$2,$3,$4,$5,$6)
      on conflict(tech_pack_id,stage,version) do update set stats=excluded.stats,created_at=now()`,[row.id,row.product_id,row.client_id,stage,row.version||0,JSON.stringify(stats)]);
    return stats;
  }catch(e){app.log.warn({err:e.message,packId,stage},'draft edit stats not recorded');return null}
}
const STAGE_ORDER=['submitted','published','approved','countersigned'];
async function learningRows(limit=300){
  // the furthest milestone each pack reached, so a pack counts once
  return (await pool.query(`select distinct on (s.tech_pack_id) s.*,p.title product_title,c.name client_name from tech_pack_edit_stats s join products p on p.id=s.product_id join clients c on c.id=s.client_id
    order by s.tech_pack_id,array_position($1::text[],s.stage) desc nulls last,s.version desc,s.created_at desc limit $2`,[STAGE_ORDER,limit])).rows;
}
app.get('/v1/admin/products/:id/tech-pack/learning',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query('select id,version,data,published_data,ai_draft,ai_draft_at,ai_model,ai_status from tech_packs where product_id=$1',[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Tech pack not found'});
  const stages=(await pool.query('select stage,version,stats,created_at from tech_pack_edit_stats where tech_pack_id=$1 order by created_at',[row.id])).rows;
  if(!row.ai_draft)return {hasDraft:false,aiStatus:row.ai_status||null,stages};
  const sampleSize=normalizeTechPack(row.data).style.sampleSize||'';
  return {hasDraft:true,draftAt:row.ai_draft_at,model:row.ai_model,aiStatus:row.ai_status||null,version:row.version,current:draftDiff(row.ai_draft,row.data,{sampleSize}),
    published:row.published_data?draftDiff(row.ai_draft,row.published_data,{sampleSize}):null,stages};
});
app.get('/v1/admin/learning',{preHandler:[authenticate,adminOnly]},async()=>{
  const rows=await learningRows(500);
  return {summary:aggregateDiffs(rows),packs:rows.map(r=>({techPackId:r.tech_pack_id,productId:r.product_id,productTitle:r.product_title,clientName:r.client_name,stage:r.stage,version:r.version,keptRate:r.stats?.keptRate??null,at:r.created_at}))};
});
app.post('/v1/admin/products/:id/tech-pack/publish',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  if(!ctx.techPack)return reply.code(409).send({error:'Save the tech pack before publishing it'});
  let note=String(req.body?.note||'').trim().slice(0,500);
  // the publish gate: ready, and checked by the independent spec check, or published anyway with a reason that is kept on the version
  const lastCheck=(await pool.query(`select status,score,verdict_label,pack_updated_at from tech_pack_checks where tech_pack_id=$1 order by created_at desc limit 1`,[ctx.techPack.id])).rows[0];
  const gate=publishGate(ctx.techPack.data,{threshold:LOOP_THRESHOLD(),checkRequired:aiEnabled(),
    check:lastCheck?{status:lastCheck.status,score:lastCheck.score,verdict:lastCheck.verdict_label,stale:Boolean(lastCheck.pack_updated_at&&new Date(ctx.techPack.updated_at)>new Date(lastCheck.pack_updated_at))}:null});
  const override=String(req.body?.override||'').trim().slice(0,500);
  if(!gate.ok&&override.length<5){
    let started=false;
    if(aiEnabled()&&(!lastCheck||(lastCheck.status!=='pending'&&gate.problems.some(p=>/spec check has not run|changed after the last spec check/.test(p))))){const r=await startSpecCheck({...ctx.techPack},{trigger:'publish',actor:req.auth.sub}).catch(()=>null);started=Boolean(r?.id)}
    return reply.code(409).send({error:`Not ready to publish: ${gate.problems.join('; ')}${started?'. The spec check has started — try again in a minute.':''}`,problems:gate.problems,needsOverride:true,checkStarted:started});
  }
  if(!gate.ok)note=[note,`Published before every check passed: ${override}`].filter(Boolean).join(' · ');
  const client=await pool.connect();
  try{
    await client.query('begin');
    // A new version starts a fresh acknowledgement chain: acks and both signatures reset, and the pack unlocks.
    const row=(await client.query(`update tech_packs set version=version+1,status='published',published_data=data,published_at=now(),published_by=$2,updated_at=now(),
      verification=$5::jsonb,locked_at=null,
      revisions=revisions||jsonb_build_array(jsonb_build_object('version',version+1,'publishedAt',now(),'by',$3::text,'note',$4::text))
      where id=$1 returning *`,[ctx.techPack.id,req.auth.sub,req.auth.email||'Future Basics',note,JSON.stringify(emptyVerification(ctx.techPack.version+1))])).rows[0];
    await client.query(`insert into tech_pack_versions(tech_pack_id,version,data,verification,note,published_by) values($1,$2,$3,$4,$5,$6)
      on conflict(tech_pack_id,version) do update set data=excluded.data,verification=excluded.verification,note=excluded.note,published_at=now(),published_by=excluded.published_by,locked_at=null`,
      [row.id,row.version,row.published_data,row.verification,note||null,req.auth.sub]);
    await client.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,
      [ctx.product.client_id,ctx.product.id,req.auth.sub,`Tech pack v${row.version} published for ${ctx.product.title}${gate.ok?'':' — with open checks: '+gate.problems.join('; ')}`,{techPackId:row.id,version:row.version,note,overridden:!gate.ok,problems:gate.problems}]);
    await client.query('commit');
    recordDraftEdits(row.id,'published').catch(()=>{});
    await flow(ctx.product.id,'pack-published',{actorId:req.auth.sub,note:`v${row.version}`});
    await flagRequote(ctx.product,ctx.techPack.published_data,row);
    await syncCardQuietly(ctx.product.id,row.published_data);
    let clientNotified=false;
    if(ctx.product.client_slug!=='future-basics'&&ctx.product.client_contact_email){
      try{
        const first=String(ctx.product.client_contact_name||'').split(' ')[0]||'there',link=`${clientHubUrl}/tech-packs/${ctx.product.id}`;
        clientNotified=await sendHubEmail({to:ctx.product.client_contact_email,subject:`Tech pack v${row.version} is ready for your approval — ${ctx.product.title}`,
          html:hubEmailShell('A tech pack is ready for your approval',`<p>Hi ${emailEscape(first)},</p><p>Version ${row.version} of the tech pack for <strong>${emailEscape(ctx.product.title)}</strong> is published to your project room. Review the sketches and callouts, measurements, materials, construction, colours and artwork, then approve it in the <strong>Sign</strong> tab — your approval is what releases it to Future Basics and the factory.</p>${hubButton(link,'Review and approve')}${note?`<p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(note)}</p>`:''}<p style="font-size:12px;color:#717177">Sign in with your work email — no password, we send a six-digit code.</p>`),replyTo:req.auth.email||intakeNotificationEmail});
      }catch(error){app.log.error({error,productId:ctx.product.id},'Tech pack published but client notification failed')}
    }
    return {techPack:techPackPayload(row),clientNotified};
  }catch(error){await client.query('rollback').catch(()=>{});throw error}finally{client.release()}
});
// A new version that changes what was priced (material, decoration, colourways, sizes) behind a live quote tells staff to re-quote.
async function flagRequote(product,before,row){
  try{
    if(!before)return false;
    const a=cardFieldsFromPack(before)||{},b=cardFieldsFromPack(row.published_data)||{},keys=['material','decoration_method','decoration_locations','colorways','sizes'];
    const changed=keys.filter(k=>JSON.stringify(a[k]??null)!==JSON.stringify(b[k]??null));if(!changed.length)return false;
    const q=(await pool.query(`select version,status from quotes where product_id=$1 and status in ('issued','accepted') order by version desc limit 1`,[product.id])).rows[0];if(!q)return false;
    const what=changed.map(k=>k.replace('_method','').replace('_',' ')).join(', ');
    await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'requote',$2,'product',$3)`,[product.client_id,`Tech pack v${row.version} for ${product.title} changed ${what} after quote v${q.version} was ${q.status} — check the price and re-quote if it moved`,product.id]);
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'quote',$3,$4)`,[product.client_id,product.id,`Re-quote check: v${row.version} changed ${what} since quote v${q.version}`,{version:row.version,quoteVersion:q.version,changed}]);
    return true;
  }catch(e){app.log.warn({err:e.message,productId:product.id},'re-quote check failed');return false}
}
app.post('/v1/admin/products/:id/tech-pack/sign',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  if(!ctx.techPack?.published_at)return reply.code(409).send({error:'Publish the tech pack before signing it'});
  const name=String(req.body?.name||'').trim().slice(0,120);if(!name)return reply.code(400).send({error:'Type your full name to sign'});
  const current=normalizeVerification(ctx.techPack.verification,ctx.techPack.version);
  if(current.brandSign)return reply.code(409).send({error:`Version ${ctx.techPack.version} is already signed by Future Basics`});
  if(!current.clientSign&&ctx.product.client_slug!=='future-basics')return reply.code(409).send({error:`${ctx.product.client_name} approves version ${ctx.techPack.version} before Future Basics signs`});
  const unpaid=(await pool.query(`select number from invoices where product_id=$1 and kind='deposit' and status='due' order by created_at desc limit 1`,[ctx.product.id])).rows[0];
  if(unpaid&&req.body?.skipDeposit!==true)return reply.code(409).send({error:`The sample deposit ${unpaid.number} is not paid yet — sign once it lands, or sign anyway if you have agreed otherwise`,depositDue:unpaid.number});
  const row=await updateVerification(ctx.techPack.id,ctx.techPack.version,v=>{v.brandSign={name,at:new Date().toISOString(),by:req.auth.email||'Future Basics'}});
  if(!row)return reply.code(409).send({error:'The tech pack changed while you were signing — reload and try again'});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,
    [ctx.product.client_id,ctx.product.id,req.auth.sub,`Tech pack v${row.version} signed by Future Basics (${name})`,{techPackId:row.id,version:row.version,locked:Boolean(row.locked_at)}]);
  await flow(ctx.product.id,row.locked_at?'pack-locked':'pack-signed',{actorId:req.auth.sub,note:`v${row.version}`});
  return {techPack:techPackPayload(row)};
});
app.post('/v1/admin/products/:id/tech-pack/shares',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  if(!ctx.techPack?.published_at)return reply.code(409).send({error:'Publish the tech pack before sharing it with a factory'});
  const kind=req.body?.kind==='quote'?'quote':'review'; // a link for quotation needs no client approval: nothing is signed through it, and the client's name is not shown
  if(kind==='review'&&!normalizeVerification(ctx.techPack.verification,ctx.techPack.version).clientSign&&ctx.product.client_slug!=='future-basics')return reply.code(409).send({error:`${ctx.product.client_name} approves version ${ctx.techPack.version} before factory links are created`});
  // a factory already in the supplier list: its name and email are the defaults, and the link is tied to it
  let supplier=null;if(req.body?.supplierId){supplier=UUID_RE.test(String(req.body.supplierId))?(await pool.query('select id,name,contact_email from suppliers where id=$1',[req.body.supplierId])).rows[0]:null;if(!supplier)return reply.code(400).send({error:'That factory is not in the supplier list'})}
  const label=String(req.body?.label||supplier?.name||'').trim().slice(0,120);if(!label)return reply.code(400).send({error:'Give this link a label, e.g. the factory name'});
  const email=String(req.body?.email??supplier?.contact_email??'').trim().toLowerCase().slice(0,200)||null;
  const days=Math.min(365,Math.max(0,Math.round(Number(req.body?.expiresDays)||(kind==='quote'?30:0))));
  const token=randomBytes(24).toString('base64url');
  const row=(await pool.query(`insert into tech_pack_shares(tech_pack_id,token_hash,label,email,created_by,expires_at,kind,include_model,supplier_id)
    values($1,$2,$3,$4,$5,case when $6::int>0 then now()+make_interval(days=>$6::int) else null end,$7,$8,$9) returning *`,[ctx.techPack.id,hash(token),label,email,req.auth.sub,days,kind,req.body?.includeModel===true,supplier?.id||null])).rows[0];
  const url=`${clientHubUrl}/tp/${token}`;let emailed=false;
  if(email&&req.body?.sendEmail!==false){
    try{emailed=await sendHubEmail({to:email,replyTo:req.auth.email||intakeNotificationEmail,subject:kind==='quote'?`Request for quotation: ${ctx.product.title}`:`Tech pack for ${ctx.product.title} — please review and countersign`,
      html:kind==='quote'?hubEmailShell(`Request for quotation: ${ctx.product.title}`,`<p>Hello ${emailEscape(label)},</p><p>Future Basics would like a quotation for <strong>${emailEscape(ctx.product.title)}</strong>. Open the tech pack, then use the <strong>Quote</strong> tab to give your prices by quantity, minimum order, sample cost and lead time. No account is needed: this private link is yours, and it is free.</p>${hubButton(url,'Open the tech pack and quote')}<p style="font-size:12px;color:#717177">The page can switch language at the top. Reply to this email with any questions.</p>`):hubEmailShell(`Tech pack: ${ctx.product.title}`,`<p>Hello ${emailEscape(label)},</p><p>Future Basics is sharing the tech pack for <strong>${emailEscape(ctx.product.title)}</strong> (version ${ctx.techPack.version}). Please read every callout, acknowledge each one, then countersign to confirm you can make it to spec. No account is needed: this private link is yours.</p>${hubButton(url,'Open the tech pack')}<p style="font-size:12px;color:#717177">The page can switch language at the top. Reply to this email with any questions.</p>`)});
      if(emailed)await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'tech-pack',$4)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`${kind==='quote'?'Quotation request':'Factory link'} for v${ctx.techPack.version} emailed to ${label} (${email})`]);
    }catch(e){app.log.warn({err:e.message,shareId:row.id},'factory link email not sent')}
  }
  return reply.code(201).send({share:shareRow(row),url,emailed});
});
// ---- Assigning a factory to a product: the product's supplier, a private link to the pack for it, and a factory page that lists everything assigned to it ----
async function ensureFactoryPage(supplierId){
  const sup=(await pool.query('select id,name,contact_email,page_epoch from suppliers where id=$1',[supplierId])).rows[0];if(!sup)return null;
  await pool.query('update suppliers set page_hash=$2 where id=$1 and page_hash is distinct from $2',[sup.id,hash(factoryPageToken(sup.id,sup.page_epoch))]);
  return {...sup,url:`${clientHubUrl}/factory/${factoryPageToken(sup.id,sup.page_epoch)}`};
}
async function assignmentView(ctx){
  const sid=ctx.configuration?.supplier_id;if(!sid)return null;
  const sup=await ensureFactoryPage(sid);if(!sup)return null;
  const sh=ctx.techPack?(await pool.query(`select * from tech_pack_shares where tech_pack_id=$1 and supplier_id=$2 and assigned and revoked_at is null order by created_at desc limit 1`,[ctx.techPack.id,sid])).rows[0]:null;
  return {supplierId:sid,name:sup.name,email:sup.contact_email||'',mode:sh?.kind||null,active:Boolean(sh),shareId:sh?.id||null,pageUrl:sup.url,packUrl:sh?`${clientHubUrl}/tp/${factoryShareToken(sh.id)}`:null};
}
app.post('/v1/admin/products/:id/tech-pack/factory',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  const sid=req.body?.supplierId||null,mode=req.body?.mode==='review'?'review':'quote';
  if(sid&&!UUID_RE.test(String(sid)))return reply.code(400).send({error:'That factory is not in the supplier list'});
  if(sid){
    if(!ctx.techPack?.published_at)return reply.code(409).send({error:'Publish the tech pack before assigning a factory: it is what the factory will see'});
    if(mode==='review'&&!normalizeVerification(ctx.techPack.verification,ctx.techPack.version).clientSign&&ctx.product.client_slug!=='future-basics')return reply.code(409).send({error:`${ctx.product.client_name} approves version ${ctx.techPack.version} before a factory can read and sign it. Assign it for quotation now, and switch it to produce once they approve.`});
  }
  const sup=sid?(await pool.query('select id,name from suppliers where id=$1',[sid])).rows[0]:null;if(sid&&!sup)return reply.code(400).send({error:'That factory is not in the supplier list'});
  const db=await pool.connect();let share=null;
  try{
    await db.query('begin');
    // whoever held this pack's assigned link before loses it: a new factory, or the same one switched between quote and produce
    const old=(await db.query(`select id,supplier_id,kind from tech_pack_shares where tech_pack_id=$1 and assigned and revoked_at is null`,[ctx.techPack?.id||null])).rows;
    const keep=sup?old.find(x=>x.supplier_id===sup.id&&x.kind===mode):null;
    for(const o of old)if(!keep||o.id!==keep.id)await db.query('update tech_pack_shares set revoked_at=now() where id=$1',[o.id]);
    if(sup&&!keep){
      const id=randomUUID();
      share=(await db.query(`insert into tech_pack_shares(id,tech_pack_id,token_hash,label,email,created_by,kind,supplier_id,assigned) values($1,$2,$3,$4,null,$5,$6,$7,true) returning *`,[id,ctx.techPack.id,hash(factoryShareToken(id)),sup.name,req.auth.sub,mode,sup.id])).rows[0];
    }
    if(sup)await db.query(`insert into product_configurations(product_id,supplier_id) values($1,$2) on conflict(product_id) do update set supplier_id=excluded.supplier_id,updated_at=now()`,[ctx.product.id,sup.id]);
    else await db.query('update product_configurations set supplier_id=null,updated_at=now() where product_id=$1',[ctx.product.id]);
    await db.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'tech-pack',$4)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,sup?`Factory assigned: ${sup.name} (${mode==='review'?'to read and sign':'for quotation'})`:'Factory unassigned']);
    await db.query('commit');
  }catch(e){await db.query('rollback').catch(()=>{});throw e}finally{db.release()}
  const fresh=await loadAdminTechPack(req.params.id);
  return reply.code(sup?201:200).send({assignment:await assignmentView(fresh)});
});
// The factory page link can be sent to the factory from here, or switched off and replaced.
app.post('/v1/admin/suppliers/:id/factory-page/:action',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id))||!['rotate','email'].includes(req.params.action))return reply.code(404).send({error:'Not found'});
  if(req.params.action==='rotate')await pool.query('update suppliers set page_epoch=page_epoch+1 where id=$1',[req.params.id]);
  const sup=await ensureFactoryPage(req.params.id);if(!sup)return reply.code(404).send({error:'Supplier not found'});
  if(req.params.action==='rotate')return {pageUrl:sup.url};
  const to=String(req.body?.email||sup.contact_email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to))return reply.code(400).send({error:'Add an email for this factory first'});
  try{
    const sent=await sendHubEmail({to,replyTo:req.auth.email||intakeNotificationEmail,subject:'Your Future Basics page: tech packs for you',html:hubEmailShell('Your tech packs',`<p>Hello ${emailEscape(sup.name)},</p><p>Every tech pack Future Basics has sent you is on one private page: open one to read it, ask for a quotation price, or confirm you can make it. No account is needed, it is free, and the page can switch language at the top.</p>${hubButton(sup.url,'Open your page')}<p style="font-size:12px;color:#717177">Keep this link private. Reply to this email with any questions.</p>`)});
    if(!sent)return reply.code(502).send({error:'The email could not be sent. Copy the link and send it yourself.'});
  }catch{return reply.code(502).send({error:'The email could not be sent. Copy the link and send it yourself.'})}
  return {emailed:true,to};
});
// The factory's own page: what is assigned to it, and where each pack stands.
app.get('/v1/factory/:token',async(req,reply)=>{
  if(!throttle(`factorypage:${req.ip}`,{limit:300,windowMs:3600_000}))return reply.code(429).send({error:'Too many requests: try again in a while'});
  const sup=(await pool.query('select id,name,page_epoch from suppliers where page_hash=$1',[hash(String(req.params.token||''))])).rows[0];
  if(!sup||factoryPageToken(sup.id,sup.page_epoch)!==String(req.params.token))return reply.code(404).send({error:'This factory page link is not valid'});
  const rows=(await pool.query(`select s.id share_id,s.kind,s.waived_at,s.created_at assigned_at,tp.version,tp.verification,tp.locked_at,tp.updated_at,p.id product_id,p.title,c.name client_name,q.updated_at quoted_at
    from tech_pack_shares s join tech_packs tp on tp.id=s.tech_pack_id join products p on p.id=tp.product_id join clients c on c.id=p.client_id
    left join factory_quotes q on q.share_id=s.id
    where s.supplier_id=$1 and s.assigned and s.revoked_at is null and (s.expires_at is null or s.expires_at>now()) and tp.published_at is not null
    and not exists(select 1 from projects ap where ap.id=p.project_id and (ap.archived_at is not null or ap.status in ('archive','archived')))
    order by s.created_at desc limit 200`,[sup.id])).rows;
  return {factory:sup.name,packs:rows.map(r=>{
    const v=normalizeVerification(r.verification,r.version),quote=r.kind==='quote';
    const state=quote?(r.quoted_at?'quoted':r.waived_at?'closed':'needs-quote'):(r.locked_at||v.factorySign?'signed':'to-review');
    return {title:r.title,version:r.version,kind:r.kind,client:quote?'':r.client_name,state,quotedAt:r.quoted_at,assignedAt:r.assigned_at,image:`/r/${r.product_id}/${renderingSig(r.product_id)}.jpg`,href:`/tp/${factoryShareToken(r.share_id)}`}})};
});
app.get('/factory/:token',(_req,reply)=>reply.header('cache-control','no-store, max-age=0').header('referrer-policy','no-referrer').type('text/html').send(readFileSync(new URL('./factory.html',import.meta.url),'utf8')));
// Staff decide, link by link, whether this factory may see and download the 3D shape. Off by default; it can be switched either way at any time.
app.patch('/v1/admin/tech-pack-shares/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id))||typeof req.body?.includeModel!=='boolean')return reply.code(400).send({error:'Say whether this link includes the 3D shape'});
  const row=(await pool.query('update tech_pack_shares set include_model=$2 where id=$1 returning *',[req.params.id,req.body.includeModel])).rows[0];
  if(!row)return reply.code(404).send({error:'Share link not found'});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) select tp.client_id,tp.product_id,$2,'tech-pack',$3 from tech_packs tp where tp.id=$1`,[row.tech_pack_id,req.auth.sub,`3D shape ${row.include_model?'opened to':'hidden from'} ${row.label}`]).catch(()=>{});
  return {share:shareRow(row)};
});
app.delete('/v1/admin/tech-pack-shares/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=(await pool.query('update tech_pack_shares set revoked_at=coalesce(revoked_at,now()) where id=$1 returning *',[req.params.id])).rows[0];
  if(!row)return reply.code(404).send({error:'Share link not found'});
  return {share:shareRow(row)};
});
app.get('/v1/products/:id/tech-pack',{preHandler:authenticate},async(req,reply)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id))return reply.code(404).send({error:'Tech pack not found'});
  const row=(await pool.query(`select tp.product_id,tp.version,tp.published_data,tp.published_at,tp.revisions,tp.verification,tp.locked_at,p.title,p.product_type,p.shopify_image_url,p.shopify_image_alt,c.name client_name,pr.name project_name
    from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id
    where tp.product_id=$1 and tp.client_id=$2 and tp.published_at is not null
    and not exists(select 1 from projects ap where ap.id=p.project_id and (ap.archived_at is not null or ap.status in ('archive','archived')))`,[req.params.id,req.auth.clientId])).rows[0];
  if(!row)return reply.code(404).send({error:'Tech pack not found'});
  return publishedTechPackView(row,{audience:'client'});
});
app.get('/r/:id/:sig',async(req,reply)=>{
  const id=String(req.params.id),sig=String(req.params.sig).replace(/\.jpe?g$/i,'');
  if(!/^[0-9a-f-]{36}$/i.test(id)||sig!==renderingSig(id))return reply.code(404).send({error:'Not found'});
  const row=(await pool.query(`select coalesce(coalesce(published_data,data)->'renderings'->0->>'image',coalesce(published_data,data)->'sketches'->0->>'image') image from tech_packs where product_id=$1`,[id])).rows[0];
  const m=/^data:(image\/(?:png|jpeg|jpg|webp));base64,([a-z0-9+/=]+)$/i.exec(row?.image||'');if(!m)return reply.code(404).send({error:'No rendering'});
  return reply.header('cache-control','public, max-age=300').type(m[1]).send(Buffer.from(m[2],'base64'));
});
// Photo-start follow-ups. Someone who uploads a screenshot and then does nothing (no edits, no submit, no message) gets one
// nudge email with their draft link after FOLLOWUP_AFTER_HOURS (default 3), and the work console gets a notice so Future Basics
// can reach out personally. Two days later, if still idle, the console gets a second "still idle" notice (no second email).
const followupAfterHours=Number(process.env.FOLLOWUP_AFTER_HOURS||3),followupStaleAfterHours=Number(process.env.FOLLOWUP_STALE_AFTER_HOURS||48);
const IDLE_PHOTO_DRAFTS_SQL=`from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=tp.client_id left join projects pr on pr.id=p.project_id
  where tp.source='photo' and tp.initiated_by='client' and tp.status='draft' and tp.published_at is null and c.archived_at is null
  and tp.updated_at=tp.created_at
  and not exists(select 1 from project_messages m where m.project_id=p.project_id and m.author_role='client' and m.created_at>tp.created_at)`;
async function runPhotoFollowups({hours=followupAfterHours,staleHours=followupStaleAfterHours}={}){
  const due=(await pool.query(`select tp.id,tp.product_id,tp.created_at,p.title,p.project_id,c.id client_id,c.name client_name,c.contact_name,coalesce(nullif(c.contact_email,''),c.allowed_emails[1]) email
    ${IDLE_PHOTO_DRAFTS_SQL} and tp.followup_sent_at is null and tp.created_at<now()-make_interval(mins=>$1)`,[Math.round(hours*60)])).rows;
  let sent=0;
  for(const d of due){
    const link=`${clientHubUrl}/tech-packs/${d.product_id}`,first=(d.contact_name||'').split(' ')[0];
    const hoursAgo=Math.max(1,Math.round((Date.now()-new Date(d.created_at))/36e5));
    let emailed=false;
    if(d.email){emailed=await sendHubEmail({to:d.email,subject:`Your ${d.title} tech pack is waiting`,html:hubEmailShell('Still thinking about it?',
      `<p>Hi${first?' '+emailEscape(first):''},</p><p>You uploaded a photo for <strong>${emailEscape(d.title)}</strong> about ${hoursAgo} hour${hoursAgo===1?'':'s'} ago and your draft is saved. Two easy ways forward:</p>
       <ol><li><strong>Open the draft</strong> and add a line or two — what you want made, how many, anything to match or change.</li><li><strong>Or just reply to this email</strong> with that, and we will build the tech pack for you.</li></ol>${hubButton(link,'Open your tech pack')}
       <p style="color:#717177;font-size:13px">Sign in with this email address — we send a six-digit code, no password. Not you, or changed your mind? Ignore this and nothing else happens.</p>`)}).catch(e=>{app.log.warn({err:e.message,techPackId:d.id},'followup email failed');return false})}
    await pool.query(`update tech_packs set followup_sent_at=now() where id=$1`,[d.id]);
    await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack-followup',$2,'product',$3)`,
      [d.client_id,`Follow up: ${d.client_name} uploaded a photo for ${d.title} ${hoursAgo}h ago and has not touched it since${emailed?' — nudge emailed':' — no email on file'}`,d.product_id]);
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[d.client_id,d.product_id,`Follow-up ${emailed?'emailed to '+d.email:'logged (no email)'} — photo draft idle for ${hoursAgo}h`,{techPackId:d.id,emailed}]);
    sent++;
  }
  const stale=(await pool.query(`select tp.id,tp.product_id,p.title,c.id client_id,c.name client_name ${IDLE_PHOTO_DRAFTS_SQL}
    and tp.followup_sent_at is not null and tp.followup_stale_notified_at is null and tp.followup_sent_at<now()-make_interval(mins=>$1)`,[Math.round(staleHours*60)])).rows;
  for(const d of stale){
    await pool.query(`update tech_packs set followup_stale_notified_at=now() where id=$1`,[d.id]);
    await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack-followup',$2,'product',$3)`,[d.client_id,`Still idle: ${d.client_name}'s photo draft for ${d.title} — no response to the nudge; worth a personal note?`,d.product_id]);
  }
  return {sent,stale:stale.length};
}
app.post('/v1/admin/followups/run',{preHandler:[authenticate,adminOnly]},async(req)=>{
  const override=process.env.DEV_BYPASS_AUTH==='true'?{hours:Number(req.body?.hours??followupAfterHours),staleHours:Number(req.body?.staleHours??followupStaleAfterHours)}:{};
  return runPhotoFollowups(override);
});
// Follow-up sequence for self-serve clients (copy and timing in nurture.js). Free track: day 1/3/6/10/16 after the first
// photo pack until they convert. Paid track: next steps after the first paid pack, membership after the second.
// Nothing is backfilled: only clients whose first photo pack (or payment) comes after the sweep first ran are emailed.
// Each step is claimed in nurture_sends before sending, so two instances never send the same email twice.
const nurtureSecret=process.env.UNSUBSCRIBE_SECRET||process.env.JWT_SECRET||'';
const nurtureAddress=process.env.MAILING_ADDRESS||'Future Basics · 1134 Sansom St, Philadelphia, PA 19107';
const unsubscribeUrlFor=clientId=>`${clientHubUrl}/email/unsubscribe?c=${clientId}&t=${unsubscribeToken(clientId,nurtureSecret)}`;
const NURTURE_CONVERTED_SQL=`(exists(select 1 from tech_packs t where t.client_id=c.id and (t.paid_at is not null or t.submitted_at is not null))
  or exists(select 1 from quotes q join products p on p.id=q.product_id where p.client_id=c.id)
  or exists(select 1 from invoices i where i.client_id=c.id and i.status='paid')
  or exists(select 1 from project_messages m join projects pr on pr.id=m.project_id where pr.client_id=c.id and m.author_role='client')
  or coalesce(c.membership_active_until>now(),false) or c.tech_pack_comped)`;
const NURTURE_SENDS_SQL=`(select coalesce(json_agg(json_build_object('step',n.step,'status',n.status,'at',n.sent_at)),'[]'::json) from nurture_sends n where n.client_id=c.id)`;
async function sendNurtureStep(row,step,ctx){
  for(const k of step.skip)await pool.query(`insert into nurture_sends(client_id,step,status) values($1,$2,'skipped') on conflict do nothing`,[row.id,k]);
  const claimed=(await pool.query(`insert into nurture_sends(client_id,step) values($1,$2) on conflict do nothing returning step`,[row.id,step.key])).rowCount===1;
  if(!claimed)return false;
  const unsubscribeUrl=unsubscribeUrlFor(row.id),mail=nurtureEmail(step.key,ctx),footer=marketingFooter({unsubscribeUrl,address:nurtureAddress});
  const html=mail.plain?`<div style="font-family:Arial,Helvetica,sans-serif;color:#141416;max-width:640px;line-height:1.5">${mail.html}${footer}</div>`:hubEmailShell(mail.title,mail.html+footer);
  const ok=await sendHubEmail({to:row.email,subject:mail.subject,html,from:mail.plain?process.env.NURTURE_FROM_EMAIL||undefined:undefined,replyTo:process.env.NURTURE_REPLY_TO||undefined,
    headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}).catch(e=>{app.log.warn({err:e.message,clientId:row.id,step:step.key},'follow-up email failed');return false});
  if(!ok){await pool.query(`update nurture_sends set status='failed' where client_id=$1 and step=$2`,[row.id,step.key]);return false}
  await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'email',$3,$4)`,[row.id,row.product_id||null,`Follow-up email sent (${step.key}): ${mail.subject}`,{step:step.key,to:row.email}]);
  return true;
}
async function runNurture({now=new Date()}={}){
  if(!nurtureSecret){app.log.warn('UNSUBSCRIBE_SECRET/JWT_SECRET missing; follow-up sequence not sent');return {sent:0}}
  let started=(await getSetting('nurtureStartedAt'))?.at;
  if(!started){started=now.toISOString();await setSetting('nurtureStartedAt',{at:started});return {sent:0,started}}
  const caseStudies=parseCaseStudies(process.env.NURTURE_CASE_STUDIES),packDollars=(TECH_PACK_PRICE_CENTS/100).toFixed(0),signer=process.env.NURTURE_SIGNER||'Kyle';
  const base=r=>({first:(r.contact_name||'').split(' ')[0],productTitle:r.product_title,packLink:`${clientHubUrl}/tech-packs/${r.product_id}`,startLink:`${clientHubUrl}/start`,packDollars,membershipUrl:MEMBERSHIP_URL,signer});
  let sent=0;
  const free=(await pool.query(`select c.id,c.contact_name,coalesce(nullif(c.contact_email,''),c.allowed_emails[1]) email,a.anchor_at,f.product_id,f.product_title,${NURTURE_SENDS_SQL} sends,${NURTURE_CONVERTED_SQL} converted
    from (select client_id,min(created_at) anchor_at from tech_packs where source='photo' and initiated_by='client' group by client_id) a
    join clients c on c.id=a.client_id
    cross join lateral (select p.id product_id,p.title product_title from tech_packs tp join products p on p.id=tp.product_id where tp.client_id=c.id and tp.source='photo' and tp.initiated_by='client' order by tp.created_at limit 1) f
    where a.anchor_at>=$1 and a.anchor_at>now()-interval '30 days' and c.archived_at is null and c.status='active' and c.marketing_opt_out_at is null`,[started])).rows;
  for(const r of free){
    if(!r.email)continue;
    const step=nextFreeStep({anchorAt:r.anchor_at,sends:r.sends,now,converted:r.converted});
    if(step&&await sendNurtureStep(r,step,{...base(r),caseStudy:pickCaseStudy(r.product_title,caseStudies)}))sent++;
  }
  const paid=(await pool.query(`select c.id,c.contact_name,coalesce(nullif(c.contact_email,''),c.allowed_emails[1]) email,pp.first_paid,pp.second_paid,coalesce(c.membership_active_until>now(),false) member,
      lp.product_id,lp.product_title,${NURTURE_SENDS_SQL} sends
    from clients c
    cross join lateral (select min(paid_at) first_paid,(array_agg(paid_at order by paid_at))[2] second_paid from tech_packs where client_id=c.id and paid_at is not null) pp
    cross join lateral (select p.id product_id,p.title product_title from tech_packs tp join products p on p.id=tp.product_id where tp.client_id=c.id and tp.paid_at is not null order by tp.paid_at desc limit 1) lp
    where pp.first_paid>=$1 and coalesce(pp.second_paid,pp.first_paid)>now()-interval '30 days' and c.archived_at is null and c.status='active' and c.marketing_opt_out_at is null`,[started])).rows;
  for(const r of paid){
    if(!r.email)continue;
    const step=nextPaidStep({firstPaidAt:r.first_paid,secondPaidAt:r.second_paid,member:r.member,sends:r.sends,now});
    if(step&&await sendNurtureStep(r,step,base(r)))sent++;
  }
  return {sent,started};
}
app.post('/v1/admin/nurture/run',{preHandler:[authenticate,adminOnly]},async()=>runNurture());
// Unsubscribe from the follow-up sequence. GET shows a confirm button (link scanners prefetch GETs); POST opts out, and
// also answers mail clients' one-click unsubscribe (List-Unsubscribe-Post). Sign-in codes and approvals still send.
app.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string'},(_req,body,done)=>done(null,Object.fromEntries(new URLSearchParams(body))));
const unsubscribePage=(title,body)=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Future Basics</title></head><body style="font-family:Arial,Helvetica,sans-serif;color:#141416;max-width:520px;margin:64px auto;padding:0 20px;line-height:1.5"><p style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#717177">Future Basics</p><h1 style="font-size:24px">${title}</h1>${body}</body></html>`;
app.get('/email/unsubscribe',async(req,reply)=>{
  const {c,t}=req.query||{};reply.type('text/html').header('cache-control','no-store');
  if(!/^[0-9a-f-]{36}$/i.test(String(c||''))||!nurtureSecret||!validUnsubscribeToken(c,t,nurtureSecret))return reply.code(400).send(unsubscribePage('Link not recognised','<p>This unsubscribe link is incomplete. Reply to any of our emails and we will take you off the list.</p>'));
  return unsubscribePage('Unsubscribe',`<p>Stop the follow-up emails about your tech pack? You will still get sign-in codes and anything you ask us for.</p><form method="post" action="/email/unsubscribe?c=${encodeURIComponent(c)}&amp;t=${encodeURIComponent(t)}"><button type="submit" style="padding:14px 22px;border-radius:999px;border:0;background:#141416;color:#fff;font-weight:600;font-size:15px;cursor:pointer">Unsubscribe</button></form>`);
});
app.post('/email/unsubscribe',async(req,reply)=>{
  const {c,t}=req.query||{};reply.type('text/html').header('cache-control','no-store');
  if(!/^[0-9a-f-]{36}$/i.test(String(c||''))||!nurtureSecret||!validUnsubscribeToken(c,t,nurtureSecret))return reply.code(400).send(unsubscribePage('Link not recognised','<p>This unsubscribe link is incomplete. Reply to any of our emails and we will take you off the list.</p>'));
  const r=(await pool.query(`update clients set marketing_opt_out_at=coalesce(marketing_opt_out_at,now()) where id=$1 returning id`,[c])).rows[0];
  if(r)await pool.query(`insert into activities(client_id,type,summary) values($1,'email','Unsubscribed from follow-up emails')`,[c]).catch(()=>{});
  return unsubscribePage('You are unsubscribed','<p>No more follow-up emails. Your tech packs are still in your room whenever you want them.</p>');
});
// Client-initiated tech packs. A client starts a product and its draft pack from their project, fills it in, and submits it to
// Future Basics, who finish and publish v1. From there the normal chain runs: client approves → Future Basics signs → factory.
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function loadClientDraft(productId,clientId){
  return (await pool.query(`select tp.*,p.title,p.product_type,p.project_id,c.name client_name,c.slug client_slug,pr.name project_name
    from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id
    where tp.product_id=$1 and tp.client_id=$2 and tp.initiated_by='client' and tp.published_at is null
    and not exists(select 1 from projects ap where ap.id=p.project_id and (ap.archived_at is not null or ap.status in ('archive','archived')))`,[productId,clientId])).rows[0]||null;
}
const draftView=row=>({cutoutEnabled:cutoutEnabled(),product:{id:row.product_id,title:row.title,product_type:row.product_type,client_id:row.client_id,project_id:row.project_id,client_name:row.client_name,client_slug:row.client_slug,project_name:row.project_name},
  techPack:techPackPayload(row),completeness:techPackCompleteness(normalizeTechPack(row.data)),editable:row.status==='draft',clientHubUrl,pricing:row.ai_status==='locked'?techPackPricing():null});
// Creates the product, its milestones and a seeded client draft inside the caller's transaction. `sketches` lets a
// reference photo (a screenshot from Instagram or Pinterest, say) become the first view of the pack.
async function createClientDraft(db,{clientId,clientName,project,title,productType,description,userId,sketches=[],source='hub'}){
  const product=(await db.query(`insert into products(client_id,project_id,title,product_type,description_html,source_of_truth) values($1,$2,$3,$4,$5,'hub') returning *`,
    [clientId,project.id,title,productType||null,description?`<p>${escapeHtml(description)}</p>`:null])).rows[0];
  await db.query(`insert into milestones(product_id,name,status,sort_order) select $1,name,case when n=1 then 'current' else 'upcoming' end,n
    from(values(1,'Brief'),(2,'Concept'),(3,'Development'),(4,'Sample'),(5,'Approval'),(6,'Production'),(7,'Quality'),(8,'Delivery'))m(n,name)`,[product.id]);
  await applyFlow(db,product.id,'product-created',{owner:'client',actorId:userId||null});
  const seed=normalizeTechPack({...seedTechPack({product}),sketches});seed.style.designer=clientName;
  const pack=(await db.query(`insert into tech_packs(product_id,client_id,status,data,created_by,initiated_by,source) values($1,$2,'draft',$3,$4,'client',$5) returning *`,[product.id,clientId,seed,userId||null,source])).rows[0];
  const how=source==='photo'?' from a photo':'';
  await db.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,
    [clientId,product.id,userId||null,`${clientName} started a tech pack for ${product.title}${how}`,{techPackId:pack.id,initiatedBy:'client',source}]);
  await db.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack',$2,'product',$3)`,[clientId,`${clientName} started a tech pack for ${product.title}${how} in ${project.name}`,product.id]);
  return {product,pack};
}
const issueClientToken=(user,client,email,extra={})=>new SignJWT({sub:user.id,clientId:client.id,client:client.slug,role:user.role,email,...extra})
  .setProtectedHeader({alg:'HS256'}).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('7d').sign(secret);
// Public, mobile-first entry point: a screenshot plus an email becomes a client room, a project and a tech pack draft with the
// photo as its first view. A brand-new email gets its own room and a session right away (the room holds only what they just sent);
// an email we already know gets a sign-in code instead, so nobody can walk into an existing room by typing its address.
// After a photo-start, the assistant reads the photo and writes the first draft of the pack. It only writes while the
// draft is still untouched by the client (updated_at = created_at), so a person who starts editing right away never has
// their work replaced; and it leaves updated_at alone, so the idle follow-up still sees an untouched draft.
// Reads the photo and writes the draft. Runs in the background after /start, from the recovery sweep, and on demand
// from the console or the client (re-run). Steps: locate the product and crop to it → draft → re-seed for the classified
// product type → merge with whatever the client has typed meanwhile (their edits win, nothing is discarded).
const AI_MAX_ATTEMPTS=3,AI_STALE_MINUTES=4;
// ---- Tech pack billing: the first photo draft is free; after that a pack is paid for singly, or covered by the studio
// membership, a paid sample deposit, or a comped room. Payment runs through Shopify (draft-order checkout for a single
// pack, the membership product's selling plan for the subscription). Billing is on when Shopify can take payment, or
// forced with TECH_PACK_BILLING=on for tests; off, every draft runs free as before.
const TECH_PACK_PRICE_CENTS=Number(process.env.TECH_PACK_PRICE_CENTS||4800),MEMBERSHIP_PRICE_CENTS=Number(process.env.MEMBERSHIP_PRICE_CENTS||10000);
const MEMBERSHIP_URL=process.env.MEMBERSHIP_CHECKOUT_URL||'',MEMBERSHIP_PRODUCT_ID=process.env.SHOPIFY_MEMBERSHIP_PRODUCT_ID||'',MEMBERSHIP_GRACE_DAYS=35;
const TECH_PACK_VARIANT_ID=process.env.SHOPIFY_TECH_PACK_VARIANT_ID||''; // optional fallback variant (generic image) when no per-pack variant can be made
// Small key/value settings kept in the database (things set up from the console rather than env).
const settingsCache=new Map();
async function getSetting(key){if(settingsCache.has(key))return settingsCache.get(key);const row=(await pool.query('select value from app_settings where key=$1',[key])).rows[0];const v=row?row.value:null;settingsCache.set(key,v);return v}
async function setSetting(key,value){await pool.query(`insert into app_settings(key,value,updated_at) values($1,$2,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`,[key,JSON.stringify(value)]);settingsCache.set(key,value)}
// The hidden Shopify product behind the $48 checkout. Each pack gets its own variant carrying the client's photo, so the
// checkout line shows what they uploaded; the variant is removed once the order is paid.
const techPackProductId=async()=>process.env.SHOPIFY_TECH_PACK_PRODUCT_ID||(await getSetting('techPackProduct'))?.productId||'';
async function ensureTechPackProduct(){
  const existing=await getSetting('techPackProduct');if(existing?.productId)return {...existing,created:false};
  const product=requireNoUserErrors((await shopifyGraphql(PRODUCT_CREATE,{product:{title:'Tech pack from a photo',descriptionHtml:`<p>${TECH_PACK_INCLUDES}</p>`,productType:'Service',vendor:'Future Basics',status:'ACTIVE',tags:['fb-tech-pack','hub-service'],productOptions:[{name:'Pack',values:[{name:'Base'}]}]}})).productCreate).product;
  const baseVariantId=product.variants?.nodes?.[0]?.id||null;
  if(baseVariantId)requireNoUserErrors((await shopifyGraphql(VARIANTS_BULK_UPDATE,{productId:product.id,variants:[{id:baseVariantId,price:asMoney(TECH_PACK_PRICE_CENTS),inventoryPolicy:'CONTINUE',taxable:false,inventoryItem:{tracked:false,requiresShipping:false}}]})).productVariantsBulkUpdate);
  const value={productId:product.id,handle:product.handle,baseVariantId,createdAt:new Date().toISOString()};await setSetting('techPackProduct',value);
  return {...value,created:true};
}
async function packVariantFor(row){
  const productId=await techPackProductId();if(!productId)return null;
  try{
    const res=requireNoUserErrors((await shopifyGraphql(VARIANTS_BULK_CREATE,{productId,variants:[{optionValues:[{optionName:'Pack',name:`${String(row.title||'Tech pack').slice(0,60)} · ${String(row.id).slice(0,8)}`}],price:asMoney(TECH_PACK_PRICE_CENTS),inventoryPolicy:'CONTINUE',taxable:false,inventoryItem:{tracked:false,requiresShipping:false},mediaSrc:[renderingUrl(row.product_id)]}]})).productVariantsBulkCreate);
    return res.productVariants?.[0]?.id||null;
  }catch(e){app.log.warn({err:e.message,packId:row.id},'pack variant not created — custom line instead');return null}
}
async function dropPackVariant(row){
  const productId=await techPackProductId();if(!productId||!row.pay_variant_id)return;
  try{await shopifyGraphql(VARIANTS_BULK_DELETE,{productId,variantsIds:[row.pay_variant_id]})}catch(e){app.log.warn({err:e.message,packId:row.id},'pack variant not deleted')}
  await pool.query('update tech_packs set pay_variant_id=null where id=$1',[row.id]).catch(()=>{});
}
const TECH_PACK_INCLUDES='Assistant draft from your photo (callouts pinned on the image, points of measure, materials & construction, colourways) · Future Basics review and v1 publish · factory export in Chinese (Simplified or Traditional), Spanish, Portuguese or Italian · yours to edit any time';
// The payment gate: switched from the work console (stored in app_settings), otherwise automatic: on when Shopify can take
// payment, or forced either way with TECH_PACK_BILLING=on|off. Read on every request, so a switch takes effect at once.
let billingMode=null; // 'on' | 'off' | null (automatic)
const billingAuto=()=>process.env.TECH_PACK_BILLING==='on'||(process.env.TECH_PACK_BILLING!=='off'&&shopifyConfigured());
const billingOn=()=>billingMode==='on'?true:billingMode==='off'?false:billingAuto();
const techPackPricing=()=>({single:{amountCents:TECH_PACK_PRICE_CENTS,currency:'USD'},membership:MEMBERSHIP_URL?{amountCents:MEMBERSHIP_PRICE_CENTS,currency:'USD',period:'month',url:MEMBERSHIP_URL}:null});
// A membership is current when a paid membership order (first purchase or renewal) is less than 35 days old. Checked
// against Shopify at most hourly per client; the result is cached on the client row.
// A self-serve room has no Shopify customer until the person buys something. Link it by the room's exact email so a membership bought on the storefront is recognised; the id is written only when the room has none, so a hand-set link is never replaced.
async function linkShopifyCustomer(client,knownId=null,q=pool){
  if(!client)return null;if(client.shopify_customer_id)return client.shopify_customer_id;if(!shopifyConfigured())return null;
  let id=knownId||null;
  if(!id){const emails=[client.contact_email,...(client.allowed_emails||[])].map(e=>String(e||'').trim().toLowerCase()).filter(Boolean);
    for(const email of [...new Set(emails)].slice(0,5)){try{const data=await shopifyGraphql(CUSTOMER_BY_EMAIL_QUERY,{query:`email:${JSON.stringify(email)}`});const hit=exactCustomerMatch(data?.customers?.nodes,[email]);if(hit){id=hit.id;break}}catch(e){app.log.warn({err:e.message,clientId:client.id},'customer lookup failed');break}}}
  if(!id)return null;
  const r=await q.query('update clients set shopify_customer_id=$2 where id=$1 and shopify_customer_id is null returning shopify_customer_id',[client.id,id]).catch(()=>({rows:[]}));
  client.shopify_customer_id=r.rows[0]?.shopify_customer_id||client.shopify_customer_id||id;return client.shopify_customer_id;
}
// `q` is the caller's connection: inside a transaction that already holds the client row, a write from the pool would wait on
// that row forever (the transaction cannot commit while it awaits the write) — the hang seen on /start in production.
async function membershipActive(client,q=pool){
  if(client.membership_active_until&&new Date(client.membership_active_until)>new Date())return true;
  if(!shopifyConfigured()||!(MEMBERSHIP_PRODUCT_ID||MEMBERSHIP_URL))return false;
  if(client.membership_checked_at&&new Date(client.membership_checked_at)>new Date(Date.now()-3600e3))return false;
  if(!client.shopify_customer_id&&!(await linkShopifyCustomer(client,null,q))){await q.query('update clients set membership_checked_at=now() where id=$1',[client.id]).catch(()=>{});return false}
  let until=null;
  try{
    const data=await shopifyGraphql(CUSTOMER_MEMBERSHIP_QUERY,{id:client.shopify_customer_id,query:'financial_status:paid'});
    const isMembership=li=>(MEMBERSHIP_PRODUCT_ID&&li.product?.id===MEMBERSHIP_PRODUCT_ID)||/membership/i.test(`${li.title||''} ${li.sellingPlan?.name||''}`);
    const latest=(data?.customer?.orders?.nodes||[]).filter(o=>(o.lineItems?.nodes||[]).some(isMembership)).map(o=>new Date(o.createdAt)).sort((a,b)=>b-a)[0];
    if(latest)until=new Date(latest.getTime()+MEMBERSHIP_GRACE_DAYS*864e5);
  }catch(e){app.log.warn({err:e.message,clientId:client.id},'membership check failed')}
  await q.query('update clients set membership_checked_at=now(),membership_active_until=$2 where id=$1',[client.id,until]).catch(()=>{});
  return Boolean(until&&until>new Date());
}
// Why this client may run the assistant on this pack: 'free' (first photo draft, or billing off), 'comped', 'client'
// (a paid invoice in the room), 'member', or 'locked' (the pack must be paid for).
async function techPackEntitlement(clientId,packId,q=pool){
  if(!billingOn())return 'free';
  const client=(await q.query('select * from clients where id=$1',[clientId])).rows[0];if(!client)return 'free'; // a room being created in this very transaction: its first pack
  if(client.tech_pack_comped)return 'comped';
  // a failed read does not use up the free pack — the client is asked for a better photo, not for money
  const prior=(await q.query(`select count(*)::int n from tech_packs where client_id=$1 and id<>$2 and (ai_status in ('pending','done','skipped') or paid_at is not null)`,[clientId,packId])).rows[0].n;
  if(prior===0)return 'free';
  if((await q.query(`select 1 from invoices where client_id=$1 and status='paid' limit 1`,[clientId])).rowCount)return 'client';
  if(await membershipActive(client,q))return 'member';
  return 'locked';
}
// Starts the assistant on a new photo draft when the client is entitled, otherwise parks the pack as 'locked' with the
// price list. Called inside the creating transaction; returns the ai state for the response.
async function gateNewPhotoDraft(db,{clientId,packId}){
  const ent=await techPackEntitlement(clientId,packId,db);
  if(ent==='locked'){await db.query(`update tech_packs set ai_status='locked' where id=$1`,[packId]);return {ai:'locked',billing:null}}
  await db.query(`update tech_packs set ai_status='pending',ai_started_at=now(),billing=$2 where id=$1`,[packId,ent]);
  return {ai:'pending',billing:ent};
}
// Shopify checkout for a single pack: one draft order per pack, reused on later clicks.
async function techPackCheckout(row,{email}){
  if(row.pay_invoice_url&&row.pay_draft_order_id){
    // reuse the open checkout — unless its total is not the pack price (an earlier bug priced custom lines at $0): then replace it
    let stale=false;
    if(shopifyConfigured()){try{const d=(await shopifyGraphql(DRAFT_ORDER_STATUS,{id:row.pay_draft_order_id})).draftOrder;
      stale=!d||(d.status!=='COMPLETED'&&Math.round(Number(d.totalPriceSet?.shopMoney?.amount||0)*100)<TECH_PACK_PRICE_CENTS);
      if(stale&&d){await shopifyGraphql(DRAFT_ORDER_DELETE,{input:{id:d.id}}).catch(e=>app.log.warn({err:e.message,packId:row.id},'stale draft order not deleted'));await dropPackVariant(row)}
    }catch(e){app.log.warn({err:e.message,packId:row.id},'draft order check failed')}}
    if(!stale)return {checkoutUrl:row.pay_invoice_url,draftOrderId:row.pay_draft_order_id};
    await pool.query(`update tech_packs set pay_draft_order_id=null,pay_invoice_url=null where id=$1`,[row.id]);
  }
  if(!shopifyConfigured()){
    if(process.env.DEV_BYPASS_AUTH==='true')return {checkoutUrl:null,dev:true};
    throw Object.assign(new Error('Payments are not set up yet — message Future Basics and we will unlock the pack for you'),{statusCode:503});
  }
  const client=(await pool.query('select shopify_customer_id,slug from clients where id=$1',[row.client_id])).rows[0];
  const money={amount:asMoney(TECH_PACK_PRICE_CENTS),currencyCode:'USD'};
  const customAttributes=[{key:'Product',value:String(row.title||'').slice(0,120)},{key:'What you get',value:TECH_PACK_INCLUDES},{key:'Tech pack',value:`${clientHubUrl}/tech-packs/${row.product_id}`}];
  const packVariant=await packVariantFor(row),variantId=packVariant||TECH_PACK_VARIANT_ID;
  const line=variantId?{variantId,quantity:1,priceOverride:money,customAttributes}
    :{title:`Tech pack from a photo — ${row.title}`.slice(0,255),quantity:1,requiresShipping:false,taxable:false,originalUnitPriceWithCurrency:money,customAttributes};
  if(packVariant)await pool.query('update tech_packs set pay_variant_id=$2 where id=$1',[row.id,packVariant]);
  const input={lineItems:[line],
    customerId:client?.shopify_customer_id||undefined,email:client?.shopify_customer_id?undefined:(email||undefined),
    note:`Future Basics — single tech pack · ${row.title}`,tags:['future-basics-client-hub','fb-tech-pack',`client-${String(client?.slug||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`],visibleToCustomer:true};
  const draft=requireNoUserErrors((await shopifyGraphql(DRAFT_ORDER_CREATE,{input})).draftOrderCreate).draftOrder;
  const saved=(await pool.query(`update tech_packs set pay_draft_order_id=$2,pay_invoice_url=$3 where id=$1 and pay_draft_order_id is null returning pay_draft_order_id,pay_invoice_url`,[row.id,draft.id,draft.invoiceUrl])).rows[0];
  if(!saved){const cur=(await pool.query('select pay_draft_order_id,pay_invoice_url from tech_packs where id=$1',[row.id])).rows[0];return {checkoutUrl:cur.pay_invoice_url,draftOrderId:cur.pay_draft_order_id}} // a parallel click got there first
  return {checkoutUrl:draft.invoiceUrl,draftOrderId:draft.id};
}
// What the store says this client has spent in total. Runs after a payment is recorded and from the sync, so the number on the card is not
// waiting for someone to press a button.
async function refreshClientSpend(clientId){
  if(!shopifyConfigured())return false;
  const client=(await pool.query('select * from clients where id=$1',[clientId])).rows[0];if(!client)return false;
  if(!client.shopify_customer_id)await linkShopifyCustomer(client).catch(()=>{});
  if(!client.shopify_customer_id)return false;
  const customer=(await shopifyGraphql(CUSTOMER_SYNC_QUERY,{id:client.shopify_customer_id})).customer;if(!customer)return false;
  await pool.query(`update clients set total_spent_cents=$2,shopify_order_count=$3,shopify_currency=$4,shopify_synced_at=now() where id=$1`,[clientId,Math.round(Number(customer.amountSpent?.amount||0)*100),Number(customer.numberOfOrders||0),customer.amountSpent?.currencyCode||'USD']);
  return true;
}
const refreshSpendQuietly=clientId=>refreshClientSpend(clientId).catch(e=>app.log.warn({err:e.message,clientId},'client spend not refreshed'));

// Every few minutes: read the store's paid orders since the last run and keep the ledger complete. A tech pack payment is recognised by the address
// in its checkout, so the pack unlocks even if the customer closed the tab, changed email, or the pack is older than the locked-pack sweep looks.
const PAYMENT_SYNC_EVERY_MS=5*60*1000;
async function markPackPaidFromOrder(p,clientId){
  if(p.kind!=='tech-pack'||!p.productId||p.amountCents<TECH_PACK_PRICE_CENTS)return false;
  const row=(await pool.query(`select tp.*,pr.title from tech_packs tp join products pr on pr.id=tp.product_id where tp.product_id=$1 and tp.client_id=$2`,[p.productId,clientId])).rows[0];
  if(!row||row.paid_at)return false;
  await pool.query(`update tech_packs set paid_at=$2,pay_order_id=$3,billing='single' where id=$1 and paid_at is null`,[row.id,p.paidAt||new Date().toISOString(),p.orderId]);
  await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'commerce',$3,$4)`,[clientId,row.product_id,`Tech pack paid — ${row.title} (${p.orderName||p.orderId}), found by the payment sync`,{techPackId:row.id,orderId:p.orderId,amountCents:p.amountCents}]).catch(()=>{});
  if(row.ai_status==='locked')await unlockTechPack({...row,paid_at:p.paidAt||new Date()}).catch(e=>app.log.warn({err:e.message,packId:row.id},'unlock after payment sync failed'));
  return true;
}
async function runPaymentSync(){
  if(!shopifyConfigured())return 0;
  if(!(await getSetting('paymentLedgerBackfillV1'))?.done){const n=await backfillTechPackPayments(pool,TECH_PACK_PRICE_CENTS);await setSetting('paymentLedgerBackfillV1',{done:true,at:new Date().toISOString(),rows:n})}
  const prev=(await getSetting('paymentSync'))||{},since=prev.cursor||new Date(Date.now()-90*86400e3).toISOString();
  const started=Date.now(),touched=new Set(),unmatched=[];let scanned=0,imported=0,unlocked=0,after=null,pages=0,cursor=since;
  try{
    do{
      const data=await shopifyGraphql(ORDERS_PAID_QUERY,{query:`financial_status:paid updated_at:>='${since}'`,after});
      const page=data?.orders;if(!page)throw new Error('Shopify did not return an orders list — the app may be missing the read_orders scope');
      for(const o of page.nodes||[]){
        scanned++;const p=paymentFromOrder(o,{membershipProductId:MEMBERSHIP_PRODUCT_ID});if(!p)continue;if(p.updatedAt&&p.updatedAt>cursor)cursor=p.updatedAt;
        const client=await clientForPayment(pool,p);
        if(!client){if(unmatched.length<10)unmatched.push({order:p.orderName||p.orderId,email:p.email,cents:p.amountCents,at:p.paidAt});continue}
        const pack=p.productId?(await pool.query('select id from tech_packs where product_id=$1',[p.productId])).rows[0]:null;
        const r=await recordPayment(pool,{clientId:client.id,productId:p.productId&&pack?p.productId:null,techPackId:pack?.id||null,kind:p.kind,title:p.title,amountCents:p.amountCents,currency:p.currency,orderId:p.orderId,orderName:p.orderName,paidAt:p.paidAt,source:'sync'});
        if(r.inserted||r.changed){imported++;touched.add(client.id)}
        if(await markPackPaidFromOrder(p,client.id)){unlocked++;touched.add(client.id)}
      }
      after=page.pageInfo?.hasNextPage?page.pageInfo.endCursor:null;pages++;
    }while(after&&pages<10);
    await setSetting('paymentSync',{...prev,cursor,lastRunAt:new Date().toISOString(),lastOkAt:new Date().toISOString(),lastError:null,lastMs:Date.now()-started,scanned,imported,unlocked,unmatched,runs:(prev.runs||0)+1});
  }catch(e){
    await setSetting('paymentSync',{...prev,lastRunAt:new Date().toISOString(),lastError:String(e.message||e).slice(0,300),lastMs:Date.now()-started,runs:(prev.runs||0)+1}).catch(()=>{});
    throw e;
  }
  // clients with payments whose store spend has not been refreshed for a day (a few per run), so the card never drifts for long
  const stale=(await pool.query(`select c.id from clients c where exists(select 1 from payments p where p.client_id=c.id) and (c.shopify_synced_at is null or c.shopify_synced_at<now()-interval '1 day') limit 5`)).rows;
  for(const r of stale)touched.add(r.id);
  for(const id of touched)await refreshSpendQuietly(id);
  if(imported||unlocked)app.log.info({scanned,imported,unlocked},'payment sync');
  return imported+unlocked;
}
async function paymentStats(){
  const r=(await pool.query(`select (select count(*)::int from payments) count,(select coalesce(sum(amount_cents),0)::bigint from payments) total_cents,
    (select count(*)::int from payments where paid_at>now()-interval '24 hours') last_day,
    (select count(*)::int from tech_packs where paid_at is not null and ai_status='locked') paid_but_locked,
    (select count(*)::int from clients c where c.slug<>'future-basics' and exists(select 1 from payments p where p.client_id=c.id) and c.shopify_customer_id is null) unlinked_payers,
    (select max(shopify_synced_at) from clients) last_spend_refresh`)).rows[0];
  return {count:r.count,totalCents:Number(r.total_cents),lastDay:r.last_day,paidButLocked:r.paid_but_locked,unlinkedPayers:r.unlinked_payers,lastSpendRefresh:r.last_spend_refresh};
}
app.post('/v1/admin/payments/sync',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!shopifyConfigured())return reply.code(503).send({error:'Shopify is not connected'});
  try{const n=await runPaymentSync();const st=await getSetting('paymentSync');return {ok:true,changed:n,state:st}}
  catch(e){return reply.code(502).send({error:`The payment sync failed: ${e.message}`})}
});
// Has the single-pack draft order been paid? Marks the pack paid and returns true.
async function techPackPaymentLanded(row){
  if(row.paid_at)return true;
  if(!row.pay_draft_order_id||!shopifyConfigured())return false;
  const order=await pollDraftOrderPaid(row.pay_draft_order_id);
  if(!order||!/^PAID$/i.test(order.displayFinancialStatus||''))return false;
  if(Math.round(Number(order.totalPriceSet?.shopMoney?.amount||0)*100)<TECH_PACK_PRICE_CENTS){app.log.warn({packId:row.id,orderId:order.id,total:order.totalPriceSet?.shopMoney?.amount},'tech pack order paid below price — not unlocking');return false}
  await pool.query(`update tech_packs set paid_at=now(),pay_order_id=$2,billing='single' where id=$1 and paid_at is null`,[row.id,order.id]);
  // best effort: link the room to the store customer on the order. Needs read_customers; without it the pack still unlocks.
  try{const cust=(await shopifyGraphql(ORDER_CUSTOMER_QUERY,{id:order.id}))?.order?.customer;
    if(cust?.id){const c=(await pool.query('select * from clients where id=$1',[row.client_id])).rows[0];if(c)await linkShopifyCustomer(c,cust.id)}}
  catch(e){app.log.info({err:e.message,packId:row.id},'order customer not linked')}
  await recordPayment(pool,{clientId:row.client_id,productId:row.product_id,techPackId:row.id,kind:'tech-pack',title:`Tech pack · ${row.title}`,amountCents:Math.round(Number(order.totalPriceSet?.shopMoney?.amount||0)*100)||TECH_PACK_PRICE_CENTS,currency:order.totalPriceSet?.shopMoney?.currencyCode||'USD',orderId:order.id,orderName:order.name||'',paidAt:new Date().toISOString(),source:'unlock'}).catch(e=>app.log.warn({err:e.message,packId:row.id},'payment not added to the ledger'));
  refreshSpendQuietly(row.client_id);
  await dropPackVariant(row);
  await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'commerce',$3,$4)`,[row.client_id,row.product_id,`Tech pack paid — ${row.title} (${order.name||order.id})`,{techPackId:row.id,orderId:order.id,amountCents:TECH_PACK_PRICE_CENTS}]).catch(()=>{});
  return true;
}
// Unlocks a locked pack when it has been paid for or the client has become entitled; starts the assistant. Returns the ai state.
async function unlockTechPack(row){
  if(row.ai_status!=='locked')return row.ai_status||null;
  let billing=await techPackEntitlement(row.client_id,row.id);
  if(billing==='locked'&&await techPackPaymentLanded(row))billing='single';
  if(billing==='locked')return 'locked';
  const won=(await pool.query(`update tech_packs set billing=$2,ai_status='pending',ai_error=null where id=$1 and ai_status='locked' returning id`,[row.id,billing])).rowCount===1;
  if(won)setImmediate(()=>enrichPhotoDraft(row.id,{force:true}).catch(e=>app.log.warn({err:e.message},'unlocked run failed')));
  return 'pending';
}
// Packs parked waiting for payment start now: used when someone is given free access or the gate is switched off.
async function unlockWaitingPacks(clientId=null){
  const rows=(await pool.query(`select tp.*,p.title from tech_packs tp join products p on p.id=tp.product_id where tp.ai_status='locked' and tp.status='draft' and ($1::uuid is null or tp.client_id=$1) order by tp.created_at limit 100`,[clientId])).rows;
  let n=0;for(const r of rows){try{if(await unlockTechPack(r)==='pending')n++}catch(e){app.log.warn({err:e.message,packId:r.id},'unlock waiting pack failed')}}
  return n;
}
async function billingSummary(){
  const counts=(await pool.query(`select (select count(*)::int from clients where tech_pack_comped and archived_at is null) comped_clients,(select count(*)::int from tech_packs where ai_status='locked' and status='draft') waiting_packs`)).rows[0];
  return {mode:billingMode||'auto',effective:billingOn(),automatic:billingAuto(),shopifyConnected:shopifyConfigured(),priceCents:TECH_PACK_PRICE_CENTS,compedClients:counts.comped_clients,waitingPacks:counts.waiting_packs};
}
app.get('/v1/admin/tech-pack-billing',{preHandler:[authenticate,adminOnly]},async()=>billingSummary());
app.put('/v1/admin/tech-pack-billing',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const mode=req.body?.mode;if(!['on','off','auto'].includes(mode))return reply.code(400).send({error:'mode must be on, off or auto'});
  await setSetting('techPackBilling',{mode,by:req.auth.sub,at:new Date().toISOString()});billingMode=mode==='auto'?null:mode;
  await pool.query(`insert into activities(client_id,actor_id,type,summary,metadata) select c.id,$1,'tech-pack',$2,$3 from clients c where c.slug='future-basics' limit 1`,[req.auth.sub,`Tech pack payment gate set to ${mode}`,{mode}]).catch(()=>{});
  // Free for everyone: whatever was waiting for payment starts now. The switch answers at once; the packs start in the background.
  const summary=await billingSummary(),starting=billingOn()?0:summary.waitingPacks;
  if(starting)setImmediate(()=>unlockWaitingPacks().catch(e=>app.log.warn({err:e.message},'unlock after gate off failed')));
  return {...summary,starting};
});
// Every few minutes: locked packs with a checkout started in the last two weeks are checked for payment, so a client
// who paid and closed the tab still gets their draft.
async function runPaymentSweep(){
  const rows=(await pool.query(`select tp.*,p.title from tech_packs tp join products p on p.id=tp.product_id where tp.ai_status='locked' and tp.status='draft' and tp.created_at>now()-interval '14 days' order by tp.created_at desc limit 50`)).rows;
  let n=0;for(const r of rows){try{if(await unlockTechPack(r)==='pending')n++}catch(e){app.log.warn({err:e.message,packId:r.id},'locked pack sweep failed')}}
  if(n)app.log.info({unlocked:n},'locked pack sweep');
  return n;
}
const aiUserMessage=e=>e?.userFacing?e.message:'';
// The words a product carries without a photo: its description and brief. Empty when neither says anything.
async function productBriefText(productId,descriptionHtml=''){
  const b=(await pool.query('select * from product_briefs where product_id=$1',[productId])).rows[0];
  const parts=[String(descriptionHtml||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()];
  if(b)parts.push(...[['Objective',b.objective],['Audience',b.audience],['Target quantity',b.target_quantity],['Target budget',b.target_budget_cents?`$${(b.target_budget_cents/100).toFixed(0)}`:''],['Delivery',b.delivery_date],['Decoration',b.decoration],['Packaging',b.packaging],['Fulfilment',b.fulfillment],['Notes',b.notes]].filter(([,v])=>v!=null&&String(v).trim()).map(([k,v])=>`${k}: ${String(v).trim()}`));
  return parts.filter(Boolean).join('\n').slice(0,6000);
}
// Every product gets a tech pack and a first draft without anyone pressing a button: from reference photos when the
// console gives them, from the linked Shopify image, or from the brief alone. Never re-drafts a pack the assistant
// already worked on, and never touches a client's own draft.
async function autoDraftProduct(product,{photos=[],actorId=null,reason='created'}={}){
  if(!aiEnabled())return {ai:'off'};
  let pack=(await pool.query('select * from tech_packs where product_id=$1',[product.id])).rows[0];
  if(pack&&(pack.ai_status||pack.initiated_by==='client'||pack.published_at))return {ai:'kept',techPackId:pack.id};
  let data=pack?normalizeTechPack(pack.data):null;
  const hasImage=data?.sketches.some(s=>s.image);
  let images=photos.filter(x=>isInlineImage(x)).slice(0,4);
  if(!hasImage&&!images.length&&product.shopify_image_url){const buf=await productImageBuffer(product.shopify_image_url);if(buf){try{const jpg=await sharp(buf).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:86}).toBuffer();images=[`data:image/jpeg;base64,${jpg.toString('base64')}`]}catch{}}}
  const briefText=await productBriefText(product.id,product.description_html);
  if(!hasImage&&!images.length&&!briefText)return {ai:'nothing-to-draft-from',techPackId:pack?.id||null};
  const sketches=images.map((image,i)=>({id:`photo-${Date.now().toString(36)}-${i+1}`,view:i===0?'front':'detail',label:i===0?'Reference photo':`Reference photo ${i+1}`,image,garmentWidthIn:null,callouts:[]}));
  if(!pack){
    const seed=normalizeTechPack({...seedTechPack({product}),sketches});
    pack=(await pool.query(`insert into tech_packs(product_id,client_id,status,data,created_by,initiated_by,source,billing) values($1,$2,'draft',$3,$4,'brand',$5,'admin') returning *`,[product.id,product.client_id,seed,actorId,images.length?'photo':'brief'])).rows[0];
  }else if(!hasImage&&sketches.length){
    data.sketches=[...sketches,...data.sketches].slice(0,12);
    pack=(await pool.query(`update tech_packs set data=$2,billing=coalesce(billing,'admin'),updated_at=now() where id=$1 returning *`,[pack.id,data])).rows[0];
  }else if(!pack.billing)await pool.query(`update tech_packs set billing='admin' where id=$1`,[pack.id]);
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,
    [product.client_id,product.id,actorId,`Assistant drafting the tech pack for ${product.title} from ${images.length||hasImage?'the photo':'the brief'}`,{techPackId:pack.id,auto:true,reason}]).catch(()=>{});
  await startAiRun(pack);
  return {ai:'pending',techPackId:pack.id,from:images.length||hasImage?'photo':'brief'};
}
async function enrichPhotoDraft(packId,{force=false}={}){
  const claimed=(await pool.query(`update tech_packs set ai_status='pending',ai_started_at=now(),ai_attempts=ai_attempts+1,ai_error=null
    where id=$1 and (ai_status='pending' or $2) returning *`,[packId,force])).rows[0];
  if(!claimed)return;
  const row=(await pool.query(`select tp.*,p.title,p.product_type,p.description_html from tech_packs tp join products p on p.id=tp.product_id where tp.id=$1`,[packId])).rows[0];
  if(!row)return;
  try{
    const data=normalizeTechPack(row.data);
    const original=data.sketches.find(s=>s.image)?.image;
    const briefText=await productBriefText(row.product_id,row.description_html);
    if(!original&&!briefText)throw new NoProductError('There is no photo or brief on this product yet — add a photo under Callouts or write the brief, then run the assistant again.');
    let photo=original,crop=null,first,draft,seed,research=null,photos=[],product,where=null,cutout=null;
    if(!original){
      // no photo: draft from the brief and category norms; callouts stay unpinned until a sketch or photo lands
      const working=structuredClone(data);if(!working.sketches.length)working.sketches.push({id:`view-${Date.now().toString(36)}`,view:'front',label:'Front view — add a sketch or photo',image:'',garmentWidthIn:null,callouts:[]});
      const sizes=working.sizes,sampleSize=working.style.sampleSize||sizes[Math.floor(sizes.length/2)]||'';
      first=await draftFromBrief({title:row.title,notes:String(row.description_html||'').replace(/<[^>]+>/g,''),brief:briefText,pomTemplate:working.pom.map(r=>({code:r.code,name:r.name,how:r.how})),sizes,sampleSize});
      product={title:row.title,product_type:productTypeLabel(first.draft),description_html:row.description_html};
      seed=normalizeTechPack({...seedTechPack({product}),sketches:working.sketches});seed.style.designer=working.style.designer;draft=first.draft;
      if(seed.pom.map(r=>r.code).join()!==working.pom.map(r=>r.code).join()){const second=await draftFromBrief({title:row.title,notes:String(row.description_html||'').replace(/<[^>]+>/g,''),brief:briefText,pomTemplate:seed.pom.map(r=>({code:r.code,name:r.name,how:r.how})),sizes:seed.sizes,sampleSize:seed.style.sampleSize||sampleSize});draft=second.draft}
      if(draftLooksEmpty(draft))throw new NoProductError('The assistant could not draft enough from this brief. Add a photo, or more detail to the brief, and run it again.');
      draft.pomResearch={skipped:'no photo to research from'};
    }else{
      // Only a decoder failure means the file is bad. An API error carries "invalid_request_error" in its text (a low
      // credit balance, a bad key) and must surface as what it is, never as "could not open this image".
      try{where=await locateProduct(original)}catch(e){
        app.log.warn({err:e.message,status:e.status,name:e.name,packId},'locate product failed');
        if(!(e.status>=400)&&/unsupported image|Input buffer|corrupt|premature|Invalid base64|No readable photo/i.test(e.message||''))throw new NoProductError('We could not open this image file. Replace it with a JPG or PNG (Callouts → View settings → Replace image) and try again.');
        if(e.status===400&&/could not process image|image.*(too large|exceeds|dimensions)/i.test(e.message||''))throw new NoProductError('The assistant could not take this image. Replace it with a JPG or PNG under 5 MB (Callouts → View settings → Replace image) and try again.');
        throw e}
      if(!where.found)throw new NoProductError(`We could not make out a product in this photo${where.issues?` (${where.issues})`:''}. Upload a screenshot where the product fills most of the frame, then try again.`);
      try{crop=await cropToBox(original,where.box);if(crop.coverage<0.92)photo=crop.image;else crop=null}catch(e){app.log.warn({err:e.message,packId},'crop failed, using the full photo')}
      const working=structuredClone(data);
      if(crop){working.sketches[0]={...working.sketches[0],image:photo,label:working.sketches[0].label||'Reference photo'};
        if(crop.coverage<0.85&&working.sketches.length<12)working.sketches.push({id:`photo-original-${Date.now().toString(36)}`,view:'detail',label:'Original upload',image:original,garmentWidthIn:null,callouts:[]})}
      photos=working.sketches.map(s=>s.image).filter(Boolean);
      // background removed as an extra view for the cover and the colourway tiles; the assistant still reads the real photo
      if(cutoutEnabled()){try{const c=await cutoutFromPhoto(photo);if(c.image){cutout=c;placeCutout(working,c)}else app.log.info({packId,quality:c.quality},'cut-out below the quality bar — crop kept')}catch(e){app.log.warn({err:e.message,packId},'cut-out failed')}}
      const sizes=working.sizes,sampleSize=working.style.sampleSize||sizes[Math.floor(sizes.length/2)]||'';
      const notes=String(row.description_html||'').replace(/<[^>]+>/g,'');
      // 1. draft against the current template, then re-seed for the classified product type so the measurements fit
      first=await draftFromPhotos({photos,title:row.title,notes,pomTemplate:working.pom.map(r=>({code:r.code,name:r.name,how:r.how})),sizes,sampleSize});
      product={title:row.title,product_type:productTypeLabel(first.draft),description_html:row.description_html};
      seed=normalizeTechPack({...seedTechPack({product}),sketches:working.sketches});seed.style.designer=working.style.designer;
      draft=first.draft;
      if(seed.pom.map(r=>r.code).join()!==working.pom.map(r=>r.code).join()){
        const second=await draftFromPhotos({photos,title:row.title,notes,pomTemplate:seed.pom.map(r=>({code:r.code,name:r.name,how:r.how})),sizes:seed.sizes,sampleSize:seed.style.sampleSize||sampleSize});
        draft=second.draft;
      }
      if(draftLooksEmpty(draft))throw new NoProductError(`The assistant could not read enough detail from this photo${where.product?` (it saw: ${where.product})`:''}. Try a larger, sharper picture of the product on its own.`);
      // 1b. measurements the photo could not give: cross-reference the same or comparable styles online
      try{research=await completeMeasurements(draft,{photo,pomTemplate:seed.pom.map(r=>({code:r.code,name:r.name,how:r.how})),product:{title:row.title,category:draft.category,description:draft.description,fabricSummary:draft.fabricSummary},sizes:seed.sizes,sampleSize:seed.style.sampleSize||sampleSize})}
      catch(e){app.log.warn({err:e.message,packId},'measurement research failed');draft.pomResearch={error:String(e.message||e).slice(0,200)}}
    }
    // the measurement check: unit slips converted, implausible values researched again or left blank, all of it written into the notes
    try{await vetMeasurements(draft,{photo:original?photo:'',pomTemplate:seed.pom.map(r=>({code:r.code,name:r.name,how:r.how})),product:{title:row.title,category:draft.category},sizes:seed.sizes,sampleSize:seed.style.sampleSize||(data.style.sampleSize||'')})}
    catch(e){app.log.warn({err:e.message,packId},'measurement check failed')}
    const drafted=normalizeTechPack(await applyDraftToPack(seed,draft,{photos,sizes:seed.sizes,sampleSize:seed.style.sampleSize||(data.style.sampleSize||''),model:first.model}));
    // an electronic product: the electrical facts and a first parts list, and the certifications that follow from them
    {const elecText=`${draft.category||''} ${row.title||''} ${draft.description||''}`;
     if(globalThis.FBElec.isElectronics(draft.category,row.title,draft.description)){try{applyElectronicsDraft(drafted,await draftElectronics({title:row.title,category:draft.category,description:draft.description,fabricSummary:draft.fabricSummary}),{text:elecText});Object.assign(drafted,normalizeTechPack(drafted))}catch(e){app.log.warn({err:e.message,packId},'electronics draft failed')}}}
    // the colours the assistant saw are replaced by the colours the pixels have, so the colourways and the tiles made from them are real
    // only measured on a clean cut-out: on a raw photo a busy backdrop would be counted as product colour, and the assistant's own colours are better than that
    if(original&&cutout?.image){try{const snapped=snapColours(drafted,await measureColours(cutout.image));if(snapped.changed){drafted.colorways=snapped.pack.colorways;drafted.bom=snapped.pack.bom;app.log.info({packId,changed:snapped.changed},'colours measured from the photo')}}catch(e){app.log.warn({err:e.message,packId},'colours not measured')}}
    if(original){try{if(!cwOn())drafted.renderings=mergeColorwayTiles(drafted.renderings,await renderColorways(cutout?.image||photo,drafted.colorways));if(cutout)placeCutout(drafted,cutout)}catch(e){app.log.warn({err:e.message,packId},'colourway tiles not rendered')}}
    // 2. merge with what the client has saved meanwhile — under a row lock so a save cannot slip in between
    const origSeed=normalizeTechPack({...seedTechPack({product:{title:row.title,product_type:row.product_type,description_html:row.description_html}}),sketches:data.sketches});origSeed.style.designer=data.style.designer;
    const db=await pool.connect();let merged;
    try{
      await db.query('begin');
      const live=(await db.query('select data,ai_draft prior_draft from tech_packs where id=$1 for update',[packId])).rows[0];
      const current=normalizeTechPack(live.data);
      // the client's view of the photo is the original; the draft's is the crop — line them up before merging
      const currentForMerge=structuredClone(current);if(crop&&currentForMerge.sketches[0]&&currentForMerge.sketches[0].image===original)currentForMerge.sketches[0].image=photo;
      let origForMerge=structuredClone(origSeed);if(crop&&origForMerge.sketches[0])origForMerge.sketches[0].image=photo;
      // A re-run over an earlier assistant draft: what the client changed is the difference from THAT draft, not from the blank
      // template. Without this the old assistant values counted as the client's own typing and were kept, so a re-run never
      // replaced a measurement and doubled the callouts. (Pictures are not in the snapshot; they are taken from the live pack.)
      if(live.prior_draft){
        origForMerge=normalizeTechPack(live.prior_draft);
        origForMerge.sketches=origForMerge.sketches.map(sk=>({...sk,image:currentForMerge.sketches.find(x=>x.id===sk.id)?.image||sk.image}));
      }
      merged=mergeClientEdits(origForMerge,currentForMerge,drafted);
      await db.query(`update tech_packs set data=$2,ai_status='done',ai_model=$3,ai_completed_at=now(),ai_error=null,ai_draft=$4,ai_draft_at=now() where id=$1`,[packId,merged,first.model,JSON.stringify(draftSnapshot(drafted))]); // the assistant's own output is kept so later edits can be measured against it // updated_at is left alone: it marks the client's own edits (idle follow-ups rely on it)
      await db.query('commit');
    }catch(e){await db.query('rollback').catch(()=>{});throw e}finally{db.release()}
    await pool.query(`update products set product_type=coalesce(nullif($2,''),product_type) where id=$1`,[row.product_id,product.product_type]);
    if(row.initiated_by==='client')await syncCardQuietly(row.product_id,merged);
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.client_id,row.product_id,`Assistant drafted the tech pack from ${original?'the photo':'the brief'} (${merged.sketches[0]?.callouts.length||0} callouts, ${merged.pom.filter(r=>Object.values(r.values).some(Boolean)).length} measurements${research?.filled?.length?`, ${research.filled.length} cross-referenced online`:''}${crop?', cropped to the product':''})`,{techPackId:packId,model:first.model,confidence:draft.confidence,located:where?.product||null,coverage:crop?.coverage??1,research:research?{identified:research.identified,requested:research.requested,filled:research.filled,stillMissing:research.stillMissing,comparables:research.comparables?.map(c=>c.url).filter(Boolean)}:draft.pomResearch?.error?{error:draft.pomResearch.error}:null}]);
    startLoop(packId,{trigger:'build'}).catch(err=>app.log.warn({err:err.message,packId},'exchange not started')); // the developer assistant now tests the draft; the pop-up follows it
  }catch(e){
    const user=aiUserMessage(e),msg=user||String(e.message||e).slice(0,500);
    // an API-side failure (key, credits, rate limit, outage) is ours: the client is told so, never asked for another photo
    const apiSide=!user&&(e.status>=400||/"type":"error"|_error"/.test(e.message||''));
    const stored=apiSide?'The assistant could not run just now. This is on our side, not your photo — Future Basics has been notified and will run it for you.':msg;
    app.log.warn({err:e.message,status:e.status,name:e.name,packId,attempt:claimed.ai_attempts},'photo draft enrichment failed');
    // our failure does not spend one of the client's three tries
    await pool.query(`update tech_packs set ai_status='failed',ai_error=$2,ai_attempts=case when $3 then greatest(ai_attempts-1,0) else ai_attempts end where id=$1`,[packId,stored.slice(0,500),apiSide]).catch(()=>{});
    await notifyAiFailure(row,{message:msg,userFacing:Boolean(user),attempt:claimed.ai_attempts}).catch(err=>app.log.warn({err:err.message},'ai failure notice failed'));
  }
}
// Tells Future Basics every time, and the client when the photo itself was the problem (so they can send a better one).
async function notifyAiFailure(row,{message,userFacing,attempt}){
  const c=(await pool.query(`select c.id,c.name,c.contact_name,coalesce(nullif(c.contact_email,''),c.allowed_emails[1]) email from clients c where c.id=$1`,[row.client_id])).rows[0];
  const link=`${clientHubUrl}/tech-packs/${row.product_id}`;
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack-ai',$2,'product',$3)`,
    [row.client_id,userFacing?`Assistant could not read ${c?.name||'the client'}'s photo for ${row.title} — ${message} ${c?.email?'The client has been asked for a clearer photo.':''}`:`Assistant failed on ${c?.name||'the client'}'s ${row.title} (attempt ${attempt}): ${message}. Re-run it from the tech pack, or draft it by hand.`,row.product_id]);
  if(!userFacing||!c?.email||row.initiated_by!=='client')return;
  const first=(c.contact_name||'').split(' ')[0];
  await sendHubEmail({to:c.email,subject:`We couldn't read your photo for ${row.title}`,html:hubEmailShell('One more photo, please',
    `<p>Hi${first?' '+emailEscape(first):''},</p><p>Thanks for starting a tech pack for <strong>${emailEscape(row.title)}</strong>. ${emailEscape(message)}</p>
     <p>Open your draft, replace the photo under <strong>Callouts → View settings</strong>, and press <strong>Try again</strong> — or simply reply to this email with a better picture and we will take it from there.</p>${hubButton(link,'Open your tech pack')}
     <p style="color:#717177;font-size:13px">A clear photo of the product on its own, filling most of the frame, works best.</p>`)});
}
// Deploys and restarts kill background runs. Anything still "pending" after a few minutes is picked up again, up to a limit.
async function runAiRecovery(){
  if(!aiEnabled())return 0;
  const stuck=(await pool.query(`select id,ai_attempts from tech_packs where ai_status='pending' and coalesce(ai_started_at,created_at)<now()-make_interval(mins=>$1)`,[AI_STALE_MINUTES])).rows;
  let restarted=0;
  for(const r of stuck){
    if(r.ai_attempts>=AI_MAX_ATTEMPTS){
      const row=(await pool.query(`update tech_packs set ai_status='failed',ai_error=$2 where id=$1 returning tech_packs.*,(select title from products p where p.id=tech_packs.product_id) title`,[r.id,`The assistant did not finish after ${AI_MAX_ATTEMPTS} attempts.`])).rows[0];
      if(row)await notifyAiFailure(row,{message:row.ai_error,userFacing:false,attempt:r.ai_attempts}).catch(()=>{});
      continue;
    }
    restarted++;setImmediate(()=>enrichPhotoDraft(r.id).catch(e=>app.log.warn({err:e.message},'ai recovery run failed')));
  }
  if(stuck.length)app.log.info({stuck:stuck.length,restarted},'ai recovery sweep');
  return restarted;
}
// Packs that failed for our own reasons (credit, key, outage) run again by themselves once a live test call goes through, a few at a time,
// at least ten minutes apart, up to AUTO_RETRY_LIMIT times each. A pack that fails for its photo is never retried: that needs the client.
const AI_AUTO_BATCH=3,AI_AUTO_GAP_MINUTES=10;
async function runAiAutoRetry({probe=probeAssistant}={}){
  if(!aiEnabled())return {status:'off',started:0};
  const waiting=(await pool.query(`select count(*)::int n from tech_packs where ai_status='failed' and ai_error ilike '%on our side%' and published_at is null and ai_auto_retries<$1 and coalesce(ai_started_at,updated_at)>now()-interval '14 days'`,[AUTO_RETRY_LIMIT])).rows[0].n;
  if(!waiting)return {status:'idle',started:0};
  const live=process.env.AI_FIXTURE?{ok:true}:await probe(PROBE_MODEL); // the test fixture stands in for a working assistant
  if(!live.ok){app.log.info({waiting,kind:live.kind},'assistant auto-retry waiting: the assistant is not working yet');return {status:'waiting',started:0,waiting,kind:live.kind}}
  const rows=(await pool.query(`update tech_packs set ai_auto_retries=ai_auto_retries+1 where id in (
      select tp.id from tech_packs tp where tp.ai_status='failed' and tp.ai_error ilike '%on our side%' and tp.published_at is null and tp.ai_auto_retries<$1
        and coalesce(tp.ai_started_at,tp.updated_at)>now()-interval '14 days' and coalesce(tp.ai_started_at,tp.updated_at)<now()-make_interval(mins=>$2)
      order by tp.ai_started_at asc nulls first limit $3 for update skip locked)
    returning id,client_id,product_id,ai_auto_retries,(select title from products p where p.id=tech_packs.product_id) title`,[AUTO_RETRY_LIMIT,AI_AUTO_GAP_MINUTES,AI_AUTO_BATCH])).rows;
  for(const r of rows){
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[r.client_id,r.product_id,`Assistant re-running the tech pack for ${r.title} by itself after an earlier failure (try ${r.ai_auto_retries} of ${AUTO_RETRY_LIMIT})`,{techPackId:r.id,auto:true,reason:'auto-retry'}]).catch(()=>{});
    await startAiRun({id:r.id});
  }
  if(rows.length)app.log.info({started:rows.length,waiting},'assistant auto-retry started runs');
  return {status:'started',started:rows.length,waiting};
}
// ---- The independent spec check ----
// Renders the product from the tech pack alone and compares the render with the client's photo and prompt (see check.js). It starts by itself
// when a client submits a pack, and staff can run it again. Staff only: nothing here reaches the client. A check that fails is tried again by the
// "Spec checks" job, up to three times; a missing or failing image model never fails the check, it just means there is no render.
const CHECK_MANUAL_PER_DAY=Number(process.env.CHECK_MANUAL_PER_DAY)||6,CHECK_MAX_ATTEMPTS=3,checkDir=()=>join(uploadDir,'checks');
async function startSpecCheck(row,{trigger='manual',actor=null}={}){
  if(!aiEnabled())return {skipped:'off'};
  if(trigger==='manual'){
    const n=(await pool.query(`select count(*)::int n from tech_pack_checks where product_id=$1 and trigger='manual' and created_at>now()-interval '24 hours'`,[row.product_id])).rows[0].n;
    if(n>=CHECK_MANUAL_PER_DAY)return {limited:true,limit:CHECK_MANUAL_PER_DAY};
    const open=(await pool.query(`select id from tech_pack_checks where tech_pack_id=$1 and status='pending' and created_at>now()-interval '10 minutes' limit 1`,[row.id])).rows[0];
    if(open)return {id:open.id,already:true};
  }
  const made=(await pool.query(`insert into tech_pack_checks(tech_pack_id,product_id,client_id,pack_version,pack_updated_at,trigger,requested_by) values($1,$2,$3,$4,$5,$6,$7)
    on conflict do nothing returning id`,[row.id,row.product_id,row.client_id,row.version||0,row.updated_at,trigger,actor])).rows[0];
  if(!made)return {skipped:'already-checked'};
  setImmediate(()=>runSpecCheckJob(made.id).catch(e=>app.log.warn({err:e.message,checkId:made.id},'spec check failed to start')));
  return {id:made.id};
}
async function runSpecCheckJob(checkId){
  const claimed=(await pool.query(`update tech_pack_checks set attempts=attempts+1,started_at=now(),error=null where id=$1 and status='pending' returning *`,[checkId])).rows[0];
  if(!claimed)return;
  try{
    const row=(await pool.query(`select tp.id,tp.product_id,tp.client_id,tp.data,tp.updated_at,p.title,p.product_type,p.description_html,c.name client_name from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=tp.client_id where tp.id=$1`,[claimed.tech_pack_id])).rows[0];
    if(!row)throw new Error('The tech pack no longer exists');
    const prompt=[`Title: ${row.title}`,await productBriefText(row.product_id,row.description_html)].filter(Boolean).join('\n');
    const heroRow=await currentHero(row.id);let heroBuf=null;if(heroRow){try{heroBuf=await heroBuffer(heroRow)}catch{heroBuf=null}}
    const r=await runSpecCheck({pack:row.data,product:{title:row.title,product_type:row.product_type},promptText:prompt,hero:heroBuf});
    if(heroBuf)await pool.query('update tech_pack_checks set hero_id=$2 where id=$1',[checkId,heroRow.id]);
    await mkdir(checkDir(),{recursive:true});
    const renders=[];for(const x of r.renders){const file=`${checkId}-${x.view}.jpg`;await writeFile(join(checkDir(),file),x.buffer);renders.push({view:x.view,label:x.label,file})}
    await pool.query(`update tech_pack_checks set status='done',completed_at=now(),render_status=$2,render_error=$3,provider=$4,image_model=$5,check_model=$6,brief=$7,verdict=$8,score=$9,verdict_label=$10,renders=$11,pack_updated_at=$12 where id=$1`,
      [checkId,r.renderStatus,r.renderError,r.provider,r.imageModel,r.checkModel,JSON.stringify(r.brief),JSON.stringify(r.verdict),r.verdict.score,r.verdict.verdict,JSON.stringify(renders),row.updated_at]);
    if(claimed.trigger!=='loop')await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.client_id,row.product_id,`Spec check on ${row.title}: ${r.verdict.verdict.replace(/-/g,' ')} (${r.verdict.score}/100)${r.renderStatus==='rendered'?'':', no render'}`,{techPackId:row.id,checkId,score:r.verdict.score}]).catch(()=>{});
    if(claimed.trigger!=='loop'&&(r.verdict.verdict==='does-not-resemble'||(r.verdict.verdict!=='cannot-judge'&&r.verdict.score<60)))
      await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack-check',$2,'product',$3)`,[row.client_id,`Spec check: ${row.client_name}'s ${row.title} does not match its photo (${r.verdict.score}/100) — ${clipText(r.verdict.summary,140)}`,row.product_id]).catch(()=>{});
  }catch(e){
    const msg=checkErrorText(e);app.log.warn({err:String(e.message||e).slice(0,300),checkId},'spec check failed');
    await pool.query(`update tech_pack_checks set error=$2,status=case when attempts>=$3 then 'failed' else status end,completed_at=case when attempts>=$3 then now() else null end where id=$1`,[checkId,msg,CHECK_MAX_ATTEMPTS]).catch(()=>{});
  }
}
// What staff are told when a check could not finish: a sentence, never the raw API reply.
const checkErrorText=e=>e?.status===401||e?.status===403?'The assistant refused its key (Anthropic).':/credit balance/i.test(String(e?.message))?'The assistant is out of credit (Anthropic).':String(e?.message||e).replace(/\s?\d{3}\s*\{[\s\S]*$/,'').slice(0,240)||'Unknown error';
const clipText=(t,n)=>String(t||'').replace(/\s+/g,' ').trim().slice(0,n);
// A check that was waiting or failed part-way (a deploy, an API error) is picked up again a few minutes later.
async function runSpecCheckRecovery(){
  await pool.query(`update tech_pack_loops set status='failed',stage='done',error='The exchange did not finish',finished_at=now() where status='running' and created_at<now()-interval '15 minutes'`).catch(()=>{});
  const stuck=(await pool.query(`select id,attempts from tech_pack_checks where status='pending' and coalesce(started_at,created_at)<now()-interval '8 minutes' order by created_at limit 3`)).rows;
  let n=0;for(const r of stuck){if(r.attempts>=CHECK_MAX_ATTEMPTS){await pool.query(`update tech_pack_checks set status='failed',completed_at=now(),error=coalesce(error,'The check did not finish') where id=$1`,[r.id]);continue}await runSpecCheckJob(r.id);n++}
  return n;
}
async function checkView(row,{withImages=false}={}){
  if(!row)return null;
  const renders=[];
  for(const x of row.renders||[]){const r={view:x.view,label:x.label};if(withImages){try{r.dataUrl='data:image/jpeg;base64,'+(await readFile(join(checkDir(),x.file))).toString('base64')}catch{r.missing=true}}renders.push(r)}
  return {id:row.id,status:row.status,trigger:row.trigger,attempts:row.attempts,createdAt:row.created_at,completedAt:row.completed_at,packVersion:row.pack_version,score:row.score,verdict:row.verdict_label||row.verdict?.verdict||null,summary:row.verdict?.summary||'',
    attributes:row.verdict?.attributes||[],discrepancies:row.verdict?.discrepancies||[],renders,renderStatus:row.render_status,renderError:row.render_error,provider:row.provider,imageModel:row.image_model,checkModel:row.check_model,error:row.error||null,heroId:row.hero_id||null,
    brief:withImages?row.brief:undefined};
}
// ---- The design assistant and the developer assistant, working on one pack ----
// After the assistant drafts a pack, the developer assistant (the spec check) draws it from the pack alone and compares it with the photo; the design assistant
// answers the findings and fixes descriptive fields; the developer assistant looks again. Every step is written to an event log that the pop-up shows as it
// happens. Nothing here can fail a build: if any step goes wrong the draft stays as it was. A change that makes the score worse is taken back.
const LOOP_ON=()=>process.env.BUILD_LOOP!=='off'&&aiEnabled();
const LOOP_ROUNDS=()=>{const n=Number(process.env.BUILD_LOOP_ROUNDS);return Number.isFinite(n)&&process.env.BUILD_LOOP_ROUNDS!==undefined&&process.env.BUILD_LOOP_ROUNDS!==''?Math.max(0,Math.min(6,Math.floor(n))):4};
const LOOP_THRESHOLD=()=>Number(process.env.BUILD_LOOP_THRESHOLD)||90; // the bar: below it a pack is never "ready"
const trunc=(t,n)=>{const x=String(t??'').replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n-1)+'…':x};
async function loopSay(loopId,{agent,kind='say',text,stage=null,score=null,data=null}){
  const ev={at:new Date().toISOString(),agent,kind,text:trunc(text,360),...(score!=null?{score}:{}),...(data?{data}:{})};
  await pool.query(`update tech_pack_loops set events=events||jsonb_build_array(jsonb_build_object('id',jsonb_array_length(events),'at',$2::text,'agent',$3::text,'kind',$4::text,'text',$5::text)||$6::jsonb),stage=coalesce($7,stage) where id=$1`,
    [loopId,ev.at,agent,kind,ev.text,JSON.stringify({...(ev.score!=null?{score:ev.score}:{}),...(ev.data?{data:ev.data}:{})}),stage]).catch(e=>app.log.warn({err:e.message},'loop event not written'));
}
function loopView(row){
  if(!row)return null;
  return {id:row.id,status:row.status,trigger:row.trigger,stage:row.stage,events:row.events||[],changes:(row.changes||[]).map(c=>({id:c.id,label:c.label,from:c.from,to:c.to,reason:c.reason,undone:Boolean(c.undone)})),startScore:row.start_score,finalScore:row.final_score,rounds:row.rounds,outcome:row.outcome||null,bar:LOOP_THRESHOLD(),error:row.error||null,createdAt:row.created_at,finishedAt:row.finished_at};
}
const latestLoop=async packId=>loopView((await pool.query('select * from tech_pack_loops where tech_pack_id=$1 order by created_at desc limit 1',[packId])).rows[0]);
async function startLoop(packId,{trigger='build',actor=null}={}){
  if(!LOOP_ON())return {skipped:'off'};
  const row=(await pool.query('select id,product_id,client_id,published_at from tech_packs where id=$1',[packId])).rows[0];
  if(!row||row.published_at)return {skipped:'published'};
  const running=(await pool.query(`select id from tech_pack_loops where tech_pack_id=$1 and status='running' and created_at>now()-interval '15 minutes' limit 1`,[packId])).rows[0];
  if(running)return {skipped:'running',id:running.id};
  if(trigger==='manual'){const n=(await pool.query(`select count(*)::int n from tech_pack_loops where product_id=$1 and trigger='manual' and created_at>now()-interval '24 hours'`,[row.product_id])).rows[0].n;if(n>=CHECK_MANUAL_PER_DAY)return {limited:true,limit:CHECK_MANUAL_PER_DAY}}
  const made=(await pool.query(`insert into tech_pack_loops(tech_pack_id,product_id,client_id,trigger,requested_by,stage) values($1,$2,$3,$4,$5,$6) returning id`,[row.id,row.product_id,row.client_id,trigger,actor,trigger==='build'?'compare':'compare'])).rows[0];
  setImmediate(()=>runLoopBody(made.id).catch(e=>app.log.warn({err:e.message,loopId:made.id},'exchange failed')));
  return {id:made.id};
}
async function runLoopBody(loopId){
  const L=(await pool.query('select * from tech_pack_loops where id=$1',[loopId])).rows[0];if(!L||L.status!=='running')return;
  const pause=Number(process.env.LOOP_STEP_DELAY_MS)||0; // test hook: slows the exchange so the pop-up can be watched
  const say=async e=>{await loopSay(loopId,e);if(pause)await new Promise(r=>setTimeout(r,pause))},threshold=LOOP_THRESHOLD(),rounds=LOOP_ROUNDS();
  const load=async()=>(await pool.query(`select tp.id,tp.product_id,tp.client_id,tp.data,tp.initiated_by,tp.updated_at,p.title,p.product_type,p.description_html,c.name client_name from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=tp.client_id where tp.id=$1`,[L.tech_pack_id])).rows[0];
  // one check inside the exchange: it runs now and its failure ends the exchange instead of waiting for the retry job
  const check=async()=>{
    const made=(await pool.query(`insert into tech_pack_checks(tech_pack_id,product_id,client_id,pack_version,pack_updated_at,trigger,loop_id,requested_by) select tp.id,tp.product_id,tp.client_id,tp.version,tp.updated_at,'loop',$2,$3 from tech_packs tp where tp.id=$1 returning id`,[L.tech_pack_id,loopId,L.requested_by])).rows[0];
    await runSpecCheckJob(made.id);
    const r=(await pool.query('select * from tech_pack_checks where id=$1',[made.id])).rows[0];
    if(r.status!=='done'){await pool.query(`update tech_pack_checks set status='failed',completed_at=now() where id=$1 and status<>'done'`,[made.id]);throw new Error(r.error||'The check could not finish')}
    return r;
  };
  let final=null,start=null,row=null;
  try{
    row=await load();if(!row)throw new Error('The tech pack no longer exists');
    const prompt=[`Title: ${row.title}`,await productBriefText(row.product_id,row.description_html)].filter(Boolean).join('\n');
    const pk=normalizeTechPack(row.data),mine={callouts:pk.sketches.reduce((n,s)=>n+s.callouts.length,0),poms:pk.pom.length,bom:pk.bom.length};
    // The reference picture first: the photo redrawn clean by an image model, so the render the developer assistant tests is guided by the real product, not by words alone.
    let heroNote='';
    if(process.env.HERO_AUTO!=='off'&&heroConfig().configured&&!(await currentHero(L.tech_pack_id))&&await studioCapReached()){
      await say({agent:'design',kind:'say',stage:'draft',text:'The reference picture is queued: today\'s automatic limit is reached, so Future Basics will add it.'});
    }else if(process.env.HERO_AUTO!=='off'&&heroConfig().configured&&!(await currentHero(L.tech_pack_id))){
      await say({agent:'design',kind:'say',stage:'draft',text:'Making a clean reference picture from your photo (the best of a few tries) before the test.'});
      const hr=(await pool.query('select id,product_id,client_id,data from tech_packs where id=$1',[L.tech_pack_id])).rows[0],st=hr?await startHero(hr,{actor:L.requested_by,trigger:'auto'}):{};
      if(st.id){await runHero(st.id);const h=(await pool.query('select status,candidates,chosen,error from tech_pack_heroes where id=$1',[st.id])).rows[0],c=h?.candidates?.[h.chosen];
        if(h?.status==='approved')await say({agent:'design',kind:'say',stage:'draft',text:`Reference picture ready and approved: ${c?.total??'–'}/100 faithful to the photo${c?.drift!=null?`, colours within ${c.drift} of the photo's`:''}${c?.refined?' (corrected against the photo)':''}.`});
        else if(h?.status==='ready')await say({agent:'design',kind:'say',stage:'draft',text:`Reference picture ready: ${c?.total??'–'}/100 faithful to the photo${c?.drift!=null?`, colours within ${c.drift} of the photo's`:''}. It waits for a person to approve it.`});
        else heroNote=`The reference picture could not be made (${h?.error||'unknown error'}), so this test uses the written pack alone.`}
      else if(st.unavailable||st.limited)heroNote=st.unavailable||st.limited;
      if(heroNote)await say({agent:'design',kind:'say',stage:'draft',text:heroNote});
    }
    await say(L.trigger==='build'?{agent:'design',kind:'say',stage:'compare',text:`Draft written from your photo: ${mine.callouts} callouts, ${mine.poms} measurements and ${mine.bom} materials. Handing it to the developer assistant to test.`}
      :{agent:'design',kind:'say',stage:'compare',text:'Sending the pack to the developer assistant for a fresh look.'});
    const cfg=imageConfig();
    await say({agent:'developer',kind:'say',stage:'compare',text:cfg.configured&&cfg.provider!=='fixture'?'I build the product from the materials, colours and measurements alone, without looking at the photo. Drawing it now…':'I read the materials, colours and measurements alone, without looking at the photo, and compare what they describe with it.'});
    const c1=await check(),v1=c1.verdict||{};start=c1.score;
    await pool.query('update tech_pack_loops set start_score=$2 where id=$1',[loopId,start]);
    await say({agent:'developer',kind:'verdict',stage:'compare',score:start,text:v1.summary||'Here is what I found.'});
    for(const d of (v1.discrepancies||[]).slice(0,3))await say({agent:'developer',kind:'finding',text:`${d.title}. ${d.detail}`});
    final=start;
    // The exchange goes on until the pack reads as the product in the photo (the bar), the design assistant has nothing left to try, or two rounds in a row gain nothing.
    // It is only "ready" at or above the bar: below it, the pack is handed to a person with what is still open.
    const all=[],history=[];let cur_=c1,curScore=start,curCheckId=c1.id,stalls=0,stopped='';
    const unfixable=v1.verdict==='cannot-judge'||!(v1.discrepancies||[]).length||start>=threshold||rounds<1;
    if(unfixable){
      await say({agent:'design',kind:'say',stage:'done',text:v1.verdict==='cannot-judge'?'The developer assistant could not judge this one, so I am leaving the draft as it is.':start>=threshold?'Nothing I would change: the pack reads as the product in your photo.':'I will leave the draft as it is for a person to review.'});
    }else{
      for(let round=1;round<=rounds;round++){
        await say({agent:'design',kind:'think',stage:'review',text:round===1?'Going through those findings against your photo…':`Round ${round}: going back over what is still open (${curScore}/100, the bar is ${threshold})…`});
        const cur=await load();
        const r=await reconcile({pack:cur.data,photos:packPhotos(cur.data),verdict:cur_.verdict,promptText:prompt,history});
        for(const d of r.decisions)await say({agent:'design',kind:'decision',text:d.say});
        if(!r.changes.length){stopped='nothing';await say({agent:'design',kind:'say',stage:'done',text:round===1?'I am keeping the draft as it is.':'I have nothing more I can change from these findings.'});break}
        const db=await pool.connect();let done;
        try{
          await db.query('begin');
          const live=(await db.query('select data,status,published_at from tech_packs where id=$1 for update',[L.tech_pack_id])).rows[0];
          done=live.status==='submitted'||live.published_at?{applied:[],skipped:r.changes,pack:live.data}:applyChanges(live.data,r.changes); // a pack already sent to the factory is never edited behind the client's back
          if(done.applied.length)await db.query('update tech_packs set data=$2 where id=$1',[L.tech_pack_id,done.pack]); // updated_at is left alone: it marks a person's last edit
          await db.query('commit');
        }catch(e){await db.query('rollback').catch(()=>{});throw e}finally{db.release()}
        if(!done.applied.length){stopped='edited';await say({agent:'design',kind:'say',stage:'done',text:'The pack was edited or sent while I was reviewing, so I left it exactly as it is.'});break}
        const applied=done.applied;if(cur.initiated_by==='client')await syncCardQuietly(cur.product_id,done.pack);
        all.push(...applied);
        await pool.query('update tech_pack_loops set changes=$2,rounds=$3 where id=$1',[loopId,JSON.stringify(all),round]);
        await say({agent:'design',kind:'say',stage:'revise',text:`Changing ${applied.length} thing${applied.length===1?'':'s'}:`});
        for(const c of applied)await say({agent:'design',kind:'change',data:{from:trunc(c.from,80),to:trunc(c.to,80)},text:`${c.label}: ${trunc(c.from,60)||'(empty)'} → ${trunc(c.to,60)}`});
        await say({agent:'developer',kind:'say',stage:'recheck',text:'Thanks. Testing the changed pack from scratch…'});
        const c2=await check(),baseline=curScore;
        if(c2.score<baseline-2){ // worse: take this round's changes back and try something else
          const live=(await pool.query('select data from tech_packs where id=$1',[L.tech_pack_id])).rows[0],back=revertChanges(live.data,applied);
          await pool.query('update tech_packs set data=$2 where id=$1',[L.tech_pack_id,back.pack]);
          if(cur.initiated_by==='client')await syncCardQuietly(cur.product_id,back.pack);
          const ids=new Set(applied.map(c=>c.id));for(let i=0;i<all.length;i++)if(ids.has(all[i].id)&&!all[i].undone)all[i]={...all[i],undone:true};
          await pool.query('update tech_pack_loops set changes=$2 where id=$1',[loopId,JSON.stringify(all)]);
          history.push({round,score:c2.score,result:'made it worse',tried:applied.map(c=>c.label)});stalls++;
          await say({agent:'developer',kind:'verdict',stage:round<rounds&&stalls<2?'review':'done',score:c2.score,text:`Lower than before (${baseline}). I am taking those changes back.`});
        }else{
          const gain=c2.score-baseline;cur_=c2;curScore=c2.score;curCheckId=c2.id;final=c2.score;stalls=gain<=1?stalls+1:0;
          history.push({round,score:c2.score,result:gain>1?'helped':'did not help',tried:applied.map(c=>c.label)});
          await say({agent:'developer',kind:'verdict',stage:final>=threshold||round>=rounds||stalls>=2?'done':'review',score:final,text:final>=threshold?`Up to ${final}. That clears the bar of ${threshold}.`:gain>1?`Up from ${baseline} to ${final}. Still short of ${threshold}.`:`About the same as before (${baseline}). Still short of ${threshold}.`});
        }
        final=curScore;
        if(final>=threshold){stopped='passed';break}
        if(stalls>=2){stopped='stalled';break}
      }
    }
    const passed=final>=threshold&&v1.verdict!=='cannot-judge',kept=all.filter(c=>!c.undone).length;
    // What is still open goes in front of the person who has to finish it.
    if(!passed&&cur_!==c1)for(const d of (cur_.verdict?.discrepancies||[]).slice(0,3))await say({agent:'developer',kind:'finding',text:`Still open: ${d.title}. ${d.detail}`});
    // Once the pack reads as the product in the photo, its final render goes to Meshy for the STL (unless switched off or over the daily limit).
    let autoModelRow=null;
    if(passed&&process.env.MESH_AUTO!=='off'&&meshConfig().configured&&final>=MESH_MIN_SCORE()&&curCheckId){
      const cr=(await pool.query('select id,product_id,client_id,version,data,updated_at from tech_packs where id=$1',[L.tech_pack_id])).rows[0];
      const have=Number((await pool.query(`select count(*)::int n from tech_pack_models where tech_pack_id=$1 and status in ('running','done')`,[L.tech_pack_id])).rows[0].n);
      if(cr&&(!have||kept)&&(await modelGate(cr,{checkId:curCheckId})).ok){autoModelRow=cr;await say({agent:'system',kind:'say',stage:'done',text:`The pack reads as the product in your photo (${final}/100). Sending its final render to Meshy to make the 3D model.`})}
    }
    const heroNow=await currentHero(L.tech_pack_id),heroPending=Boolean(heroNow&&heroNow.status!=='approved');
    await say({agent:'system',kind:'done',stage:'done',data:{outcome:passed?'passed':'needs-review',score:final,bar:threshold,heroPending},text:passed?(heroPending?`Scored ${final}/100, above the bar of ${threshold}. One step left: a person approves the reference picture (Check tab).`:`Ready: ${final}/100, above the bar of ${threshold}.`):`Not ready: ${final}/100, and the bar is ${threshold}. A person needs to review what is still open.`});
    await pool.query(`update tech_pack_loops set status='done',stage='done',final_score=$2,final_check_id=$3,outcome=$4,finished_at=now() where id=$1`,[loopId,final,curCheckId||null,passed?'passed':'needs-review']);
    if(autoModelRow)startModel(autoModelRow,{actor:null,source:'render',checkId:curCheckId}).catch(e=>app.log.warn({err:e.message},'automatic 3D model failed'));
    // the colourway pictures, drawn from the approved reference once the pack has settled (what a customer gets without anyone starting it)
    if(process.env.CW_AUTO!=='off'&&cwOn()&&(await currentHero(L.tech_pack_id))?.status==='approved'){
      const cr=(await pool.query('select id,product_id,client_id,data from tech_packs where id=$1',[L.tech_pack_id])).rows[0],cs=cr?await startColourways(cr,{actor:L.requested_by,trigger:'build'}):{};
      if(cs.id&&!cs.already)setImmediate(()=>runColourways(cs.id));
    }
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.client_id,row.product_id,`Design and developer assistants went over ${row.title}: ${start}/100${final!==start?` → ${final}/100`:''}${kept?`, ${kept} change${kept===1?'':'s'} made`:''}${passed?', ready':`, below the bar of ${threshold}: needs a person`}`,{techPackId:L.tech_pack_id,loopId,start,final,passed}]).catch(()=>{});
    // every pack under the bar is in the console's queue; a message goes out only when it is far from the photo
    if(!passed&&(final<60||cur_.verdict?.verdict==='does-not-resemble'))await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack-check',$2,'product',$3)`,[row.client_id,`Needs a person: ${row.client_name}'s ${row.title} reached ${final}/100 after the assistants went over it (the bar is ${threshold})`,row.product_id]).catch(()=>{});
  }catch(e){
    const msg=checkErrorText(e);app.log.warn({err:String(e.message||e).slice(0,300),loopId},'exchange failed');
    await say({agent:'system',kind:'done',stage:'done',text:'The assistants could not finish going over this one. Your draft is unchanged.'});
    await pool.query(`update tech_pack_loops set status='failed',stage='done',error=$2,final_score=$3,finished_at=now() where id=$1`,[loopId,msg,final]).catch(()=>{});
  }
}
app.get('/v1/admin/products/:id/tech-pack/check',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const pack=(await pool.query('select id,updated_at,version from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!pack)return reply.code(404).send({error:'Tech pack not found'});
  const rows=(await pool.query('select * from tech_pack_checks where product_id=$1 order by created_at desc limit 6',[req.params.id])).rows;
  const latest=await checkView(rows[0],{withImages:true});
  const img=imageConfig();
  const loops=(await pool.query('select * from tech_pack_loops where product_id=$1 order by created_at desc limit 4',[req.params.id])).rows.map(loopView);
  const mrows=(await pool.query('select * from tech_pack_models where product_id=$1 order by created_at desc limit 1',[req.params.id])).rows,mc=meshConfig();
  const heroRow=(await pool.query(`select * from tech_pack_heroes where product_id=$1 and status<>'superseded' order by (status in ('generating','ready','approved')) desc,created_at desc limit 1`,[req.params.id])).rows[0];
  const hero=await heroView(heroRow),heroCfg=heroConfig();
  const model=await modelView(mrows[0],{withThumb:true}),gate=await modelGate({id:pack.id,updated_at:pack.updated_at});if(model)model.stale=Boolean(model.status==='done'&&model.packVersion!==(pack.version||0));
  return {enabled:aiEnabled(),loopEnabled:LOOP_ON(),loop:loops[0]||null,loopHistory:loops.slice(1),hero,colourways:await latestColourways(pack.id),heroConfig:{provider:heroCfg.provider,configured:heroCfg.configured,model:heroCfg.model||null},model,modelGate:gate,modelAuto:process.env.MESH_AUTO!=='off',modelConfig:{provider:mc.provider,configured:mc.configured,model:mc.model},image:{provider:img.provider,configured:img.configured,model:img.model,note:img.note||null},latest,
    stale:Boolean(rows[0]&&rows[0].status==='done'&&rows[0].pack_updated_at&&new Date(pack.updated_at)>new Date(rows[0].pack_updated_at)),
    history:await Promise.all(rows.slice(1).map(r=>checkView(r))),manualLimit:CHECK_MANUAL_PER_DAY,
    renderChoices:rows.filter(r=>r.status==='done'&&r.render_status==='rendered'&&(r.renders||[]).length).map(r=>({id:r.id,score:r.score,completedAt:r.completed_at,packVersion:r.pack_version,stale:Boolean(r.pack_updated_at&&new Date(pack.updated_at)>new Date(r.pack_updated_at))}))};
});
// Hand the pack back to the design assistant: the developer assistant tests it again and the two go through the findings. Staff only.
app.post('/v1/admin/products/:id/tech-pack/loop',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  if(!aiEnabled())return reply.code(503).send({error:'This needs the assistant: add ANTHROPIC_API_KEY to the service'});
  if(process.env.BUILD_LOOP==='off')return reply.code(503).send({error:'The assistants\' exchange is switched off (BUILD_LOOP=off)'});
  const row=(await pool.query('select id,published_at from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!row)return reply.code(404).send({error:'Save the tech pack first'});
  if(row.published_at)return reply.code(409).send({error:'This version is published. The assistants only work on drafts.'});
  const r=await startLoop(row.id,{trigger:'manual',actor:req.auth.sub});
  if(r.limited)return reply.code(429).send({error:`That is ${r.limit} hand-backs on this product today. Try again tomorrow.`});
  if(r.skipped==='running')return reply.code(409).send({error:'The assistants are already working on this pack',id:r.id});
  return reply.code(202).send({started:true,id:r.id});
});
// Undo what the design assistant changed: all of it, or one change. A field someone edited since keeps its new value.
app.post('/v1/admin/tech-pack-loops/:id/undo',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const L=(await pool.query('select * from tech_pack_loops where id=$1',[req.params.id])).rows[0];if(!L)return reply.code(404).send({error:'Not found'});
  const only=req.body?.changeId?String(req.body.changeId):null,todo=(L.changes||[]).filter(c=>!c.undone&&(!only||c.id===only));
  if(!todo.length)return reply.code(409).send({error:'Nothing left to undo'});
  const pk=(await pool.query('select id,product_id,client_id,published_at,initiated_by,data from tech_packs where id=$1',[L.tech_pack_id])).rows[0];
  if(!pk||pk.published_at)return reply.code(409).send({error:'This version is published, so its fields are locked'});
  const back=revertChanges(pk.data,todo),done=new Set(back.reverted.map(c=>c.id));
  if(!done.size)return reply.code(409).send({error:'Those fields have been edited since, so they were left as they are'});
  await pool.query('update tech_packs set data=$2 where id=$1',[pk.id,back.pack]);if(pk.initiated_by==='client')await syncCardQuietly(pk.product_id,back.pack);
  await pool.query('update tech_pack_loops set changes=$2 where id=$1',[L.id,JSON.stringify((L.changes||[]).map(c=>done.has(c.id)?{...c,undone:true}:c))]);
  await loopSay(L.id,{agent:'system',kind:'undo',text:`Undone: ${back.reverted.map(c=>c.label).join(', ')}.`});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[pk.client_id,pk.product_id,req.auth.sub,`Staff undid ${back.reverted.length} change${back.reverted.length===1?'':'s'} the design assistant made`,{techPackId:pk.id,loopId:L.id}]).catch(()=>{});
  return {loop:loopView((await pool.query('select * from tech_pack_loops where id=$1',[L.id])).rows[0]),reverted:back.reverted.length,kept:back.kept.length};
});
app.post('/v1/admin/products/:id/tech-pack/check',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  if(!aiEnabled())return reply.code(503).send({error:'The spec check needs the assistant: add ANTHROPIC_API_KEY to the service'});
  const row=(await pool.query('select id,product_id,client_id,version,updated_at from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!row)return reply.code(404).send({error:'Save the tech pack before checking it'});
  const r=await startSpecCheck(row,{trigger:'manual',actor:req.auth.sub});
  if(r.limited)return reply.code(429).send({error:`That is ${r.limit} checks on this product today. Try again tomorrow, or wait for the next change to the pack.`});
  return reply.code(202).send({started:true,id:r.id||null,already:Boolean(r.already)});
});
// ---- The hero image: the photo redrawn clean by an image model (the photo goes in as the reference), best of several, approved by a person. ----
const HERO_PER_PRODUCT_DAY=Number(process.env.HERO_PER_PRODUCT_DAY)||4,heroDir=()=>join(uploadDir,'heroes');
const photoHash=photo=>createHash('sha1').update(String(photo||'').slice(0,200000)).digest('hex');
// A daily limit on the packs that get the full automatic studio (reference picture, colourways, 3D shape): each costs real image and 3D credits, and a busy fair
// must not run the bill up unseen. Packs over the limit still get their draft and exchange; staff are told once a day and can run the studio by hand.
const STUDIO_DAILY_PACKS=()=>{const n=Number(process.env.STUDIO_DAILY_PACKS);return Number.isFinite(n)&&process.env.STUDIO_DAILY_PACKS!==undefined&&process.env.STUDIO_DAILY_PACKS!==''?Math.max(0,Math.floor(n)):30};
async function studioToday(){return {used:Number((await pool.query(`select count(distinct tech_pack_id)::int n from tech_pack_heroes where trigger='auto' and created_at>now()-interval '24 hours'`)).rows[0].n),cap:STUDIO_DAILY_PACKS()}}
async function studioCapReached(){
  const t=await studioToday();if(t.used<t.cap)return false;
  const told=(await pool.query(`select 1 from notifications n join clients c on c.id=n.client_id where n.type='studio-cap' and n.created_at>now()-interval '24 hours' and c.slug='future-basics' limit 1`)).rows[0];
  if(!told){const fb=(await pool.query(`select id from clients where slug='future-basics'`)).rows[0];
    if(fb)await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'studio-cap',$2,'platform',null)`,[fb.id,`Automatic studio limit reached: ${t.used} packs in 24 hours (limit ${t.cap}). New packs wait for their reference picture. Raise STUDIO_DAILY_PACKS or press Make hero image on a pack.`]).catch(()=>{});
    await notifyStaff('Automatic studio limit reached',`<p>${t.used} packs have had the full automatic studio in the last 24 hours (the limit is ${t.cap}).</p><p>New packs still get their draft and exchange; their reference picture waits. Raise <code>STUDIO_DAILY_PACKS</code> on Railway, or open a pack and press <strong>Make hero image</strong>.</p>`).catch(()=>{})}
  return true;
}
async function startHero(row,{actor=null,trigger='manual'}={}){
  const cfg=heroConfig();
  if(!cfg.configured)return {unavailable:cfg.provider==='off'?'The hero image is switched off (HERO_DISABLED).':'No image model is connected: add OPENAI_API_KEY to the service.'};
  const photo=packPhotos(row.data)[0];if(!photo)return {noPhoto:true};
  const open=(await pool.query(`select id from tech_pack_heroes where tech_pack_id=$1 and status='generating' and created_at>now()-interval '12 minutes' limit 1`,[row.id])).rows[0];
  if(open)return {already:true,id:open.id};
  const n=Number((await pool.query(`select count(*)::int n from tech_pack_heroes where product_id=$1 and created_at>now()-interval '24 hours'`,[row.product_id])).rows[0].n);
  if(n>=HERO_PER_PRODUCT_DAY)return {limited:`That is ${HERO_PER_PRODUCT_DAY} hero images on this product today. Try again tomorrow.`};
  const made=(await pool.query(`insert into tech_pack_heroes(tech_pack_id,product_id,client_id,provider,model,source_hash,trigger,requested_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning id`,[row.id,row.product_id,row.client_id,cfg.provider,cfg.model||null,photoHash(photo),trigger,actor])).rows[0];
  return {id:made.id};
}
// Makes the candidates, picks the most faithful, saves them. Never throws: a failure is written on the row.
async function runHero(id){
  const h=(await pool.query('select h.*,tp.data,p.title from tech_pack_heroes h join tech_packs tp on tp.id=h.tech_pack_id join products p on p.id=h.product_id where h.id=$1',[id])).rows[0];
  if(!h||h.status!=='generating')return;
  try{
    const photos=packPhotos(h.data),photo=photos[0],pack=normalizeTechPack(h.data);
    // measured on the cut-out when the draft made one (a clean backdrop), else on the photo
    const cut=pack.sketches.find(sk=>sk.image&&/^cutout-/.test(String(sk.id||'')))?.image;
    const measured=cut?await measureColours(cut):[]; // no clean cut-out, no photo palette: the colour penalty is skipped rather than measured on a busy backdrop
    const cands=await heroCandidates({photos,meta:{title:h.title,category:pack.style.category}});
    const pick=await pickHero({photo,candidates:cands,photoPalette:measured});
    await mkdir(heroDir(),{recursive:true});
    const out=[],bufs=[];for(let i=0;i<cands.length;i++){const file=`${id}-${i}.jpg`;await writeFile(join(heroDir(),file),cands[i].buffer);bufs.push(cands[i].buffer);out.push({file,score:pick.scores[i].score,drift:pick.scores[i].drift,issues:pick.scores[i].issues,total:pick.scores[i].total})}
    let best=pick.best;
    // When the customer's own pack is being built, a try that is not good enough is not handed on: the best one is corrected against the photo, up to a couple of times, and the correction competes with the tries.
    if(h.trigger==='auto'){
      for(let round=0;round<HERO_REFINE_ROUNDS()&&out[best].total<HERO_APPROVE_MIN();round++){
        try{
          const r=await refineHero({photos,best:bufs[best],issues:out[best].issues,meta:{title:h.title,category:pack.style.category}}),p2=await pickHero({photo,candidates:[{buffer:r.buffer}],photoPalette:measured}),i=out.length,file=`${id}-${i}.jpg`;
          await writeFile(join(heroDir(),file),r.buffer);bufs.push(r.buffer);out.push({file,score:p2.scores[0].score,drift:p2.scores[0].drift,issues:p2.scores[0].issues,total:p2.scores[0].total,refined:true});
          if(out[i].total>out[best].total)best=i;
        }catch(e){app.log.warn({err:String(e.message||e).slice(0,200),heroId:id},'hero refinement failed');break}
      }
    }
    // a new hero replaces the earlier ones: it needs its own approval
    await pool.query(`update tech_pack_heroes set status='superseded' where tech_pack_id=$1 and id<>$2 and status in ('ready','approved')`,[h.tech_pack_id,id]);
    await pool.query(`update tech_pack_heroes set status='ready',measured=$2,candidates=$3,chosen=$4,completed_at=now() where id=$1`,[id,JSON.stringify(measured),JSON.stringify(out),best]);
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[h.client_id,h.product_id,`Hero image made for ${h.title} from the photo (${out[best].total}/100 faithful), waiting for approval`,{techPackId:h.tech_pack_id,heroId:id}]).catch(()=>{});
    // good enough on its own: approved without waiting for a person (staff can still replace it); below the bar it waits for one
    if(h.trigger==='auto'&&process.env.HERO_AUTO_APPROVE!=='off'&&out[best].total>=HERO_APPROVE_MIN())await approveHero({...h,id,title:h.title},{actor:null,auto:true,followUps:false});
  }catch(e){
    app.log.warn({err:String(e.message||e).slice(0,300),heroId:id},'hero image failed');
    await pool.query(`update tech_pack_heroes set status='failed',error=$2,completed_at=now() where id=$1`,[id,checkErrorText(e).replace(/\(Anthropic\)/,'')]).catch(()=>{});
  }
}
// The hero the rest of the pipeline starts from: the approved one, else the newest unapproved one.
async function currentHero(packId){
  return (await pool.query(`select * from tech_pack_heroes where tech_pack_id=$1 and status in ('approved','ready') order by (status='approved') desc,created_at desc limit 1`,[packId])).rows[0]||null;
}
const heroBuffer=h=>readFile(join(heroDir(),h.candidates[h.chosen]?.file||`${h.id}-0.jpg`));
async function heroView(h){
  if(!h)return null;
  const c=h.candidates||[],cur=c[h.chosen];let image=null;const alts=[];
  if(h.status==='ready'||h.status==='approved'){
    try{image=await heroThumb(await heroBuffer(h))}catch{}
    for(let i=0;i<c.length;i++){try{alts.push({index:i,score:c[i].score,drift:c[i].drift,issues:c[i].issues,total:c[i].total,thumb:await heroThumb(await readFile(join(heroDir(),c[i].file)),460,80)})}catch{alts.push({index:i,score:c[i].score,drift:c[i].drift,issues:c[i].issues,total:c[i].total,thumb:null})}}
  }
  return {id:h.id,status:h.status,provider:h.provider,model:h.model,chosen:h.chosen,score:cur?.total??null,drift:cur?.drift??null,issues:cur?.issues||'',image,candidates:alts,measured:h.measured||[],createdAt:h.created_at,completedAt:h.completed_at,approvedAt:h.approved_at,auto:Boolean(h.auto_approved),sharedAt:h.shared_at,error:h.error||null,progressing:h.status==='generating'};
}
app.post('/v1/admin/products/:id/tech-pack/hero',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const row=(await pool.query('select id,product_id,client_id,data from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!row)return reply.code(404).send({error:'Save the tech pack first'});
  const r=await startHero(row,{actor:req.auth.sub});
  if(r.unavailable)return reply.code(503).send({error:r.unavailable});
  if(r.noPhoto)return reply.code(400).send({error:'Add a photo first: the hero image is made from it.'});
  if(r.limited)return reply.code(429).send({error:r.limited});
  if(r.already)return reply.code(409).send({error:'A hero image is already being made for this pack',id:r.id});
  setImmediate(()=>runHero(r.id));
  return reply.code(202).send({started:true,id:r.id});
});
// Approving a hero: it becomes the picture everything else starts from. followUps: also start what waits on it (the colourway pictures, and the 3D model when the exchange has already passed).
async function approveHero(h,{actor=null,auto=false,followUps=true}={}){
  await pool.query(`update tech_pack_heroes set status='superseded' where tech_pack_id=$1 and id<>$2 and status='approved'`,[h.tech_pack_id,h.id]);
  await pool.query(`update tech_pack_heroes set status='approved',approved_by=$2,approved_at=now(),auto_approved=$3 where id=$1`,[h.id,actor,auto]);
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[h.client_id,h.product_id,actor,auto?`Hero image approved automatically for ${h.title}`:`Hero image approved for ${h.title}`,{techPackId:h.tech_pack_id,heroId:h.id,auto}]).catch(()=>{});
  if(!followUps)return;
  // with a hero a person has signed off, the colourway pictures are drawn from it, part by part (CW_AUTO=off leaves that to the button)
  if(process.env.CW_AUTO!=='off'&&cwOn()){
    const row=(await pool.query('select id,product_id,client_id,data from tech_packs where id=$1',[h.tech_pack_id])).rows[0];
    if(row)startColourways(row,{actor,trigger:'hero'}).then(r=>{if(r.id&&!r.already)setImmediate(()=>runColourways(r.id))}).catch(()=>{});
  }
  // the exchange may already have passed while it waited for this: now the 3D model can start
  if(process.env.MESH_AUTO!=='off'&&meshConfig().configured){
    const lp=(await pool.query(`select outcome,final_check_id from tech_pack_loops where tech_pack_id=$1 and status='done' order by created_at desc limit 1`,[h.tech_pack_id])).rows[0];
    const have=Number((await pool.query(`select count(*)::int n from tech_pack_models where tech_pack_id=$1 and status in ('running','done')`,[h.tech_pack_id])).rows[0].n);
    if(lp?.outcome==='passed'&&lp.final_check_id&&!have){const row=(await pool.query('select id,product_id,client_id,version,data,updated_at from tech_packs where id=$1',[h.tech_pack_id])).rows[0];if(row)startModel(row,{actor,source:'render',checkId:lp.final_check_id}).catch(()=>{})}
  }
}
app.post('/v1/admin/tech-pack-heroes/:id/approve',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const h=(await pool.query(`select h.*,p.title from tech_pack_heroes h join products p on p.id=h.product_id where h.id=$1`,[req.params.id])).rows[0];if(!h)return reply.code(404).send({error:'Not found'});
  if(!['ready','approved'].includes(h.status))return reply.code(409).send({error:'This hero image is not ready to approve'});
  await approveHero(h,{actor:req.auth.sub});
  return {approved:true};
});
app.post('/v1/admin/tech-pack-heroes/:id/adopt',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const h=(await pool.query('select * from tech_pack_heroes where id=$1',[req.params.id])).rows[0];if(!h)return reply.code(404).send({error:'Not found'});
  if(!['ready','approved'].includes(h.status))return reply.code(409).send({error:'There is no hero image to add to yet'});
  const c=UUID_RE.test(String(req.body?.checkId||''))?(await pool.query(`select * from tech_pack_checks where id=$1 and product_id=$2 and status='done'`,[req.body.checkId,h.product_id])).rows[0]:null,r=c?.renders?.[0];
  if(!r)return reply.code(404).send({error:'That render is not available'});
  let buf;try{buf=await readFile(join(checkDir(),r.file))}catch{return reply.code(404).send({error:'The render file is missing. Run the check again.'})}
  const cands=h.candidates||[],i=cands.length,file=`${h.id}-${i}.jpg`;
  await mkdir(heroDir(),{recursive:true});await writeFile(join(heroDir(),file),buf);
  cands.push({file,score:c.score,drift:null,issues:'None: this is the spec-check render, picked by staff',total:c.score,fromCheck:c.id});
  await pool.query(`update tech_pack_heroes set candidates=$2,chosen=$3,status='ready',approved_by=null,approved_at=null where id=$1`,[h.id,JSON.stringify(cands),i]); // a different picture needs approving again
  return {chosen:i};
});
app.post('/v1/admin/tech-pack-heroes/:id/choose',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const h=(await pool.query('select * from tech_pack_heroes where id=$1',[req.params.id])).rows[0];if(!h)return reply.code(404).send({error:'Not found'});
  const i=Number(req.body?.index);if(!['ready','approved'].includes(h.status)||!Number.isInteger(i)||!h.candidates[i])return reply.code(400).send({error:'Pick one of the candidates shown'});
  await pool.query(`update tech_pack_heroes set chosen=$2,status='ready',approved_by=null,approved_at=null where id=$1`,[h.id,i]); // a different picture needs approving again
  return {chosen:i};
});

// ---- Colourway pictures, made by labelled panel: the product is broken up into its parts, each part gets a colour per colourway, the image model draws it
// from the approved hero, and a vision check compares it with the plan. Runs in the background; every finished picture is saved onto the pack as it lands. ----
const CW_PER_PRODUCT_DAY=Number(process.env.CW_PER_PRODUCT_DAY)||4,CW_STALE_MS=25*60*1000;
const cwOn=()=>heroConfig().configured;
async function startColourways(row,{actor=null,trigger='manual'}={}){
  const cfg=heroConfig();
  if(!cfg.configured)return {unavailable:cfg.provider==='off'?'Colourway pictures are switched off (HERO_DISABLED).':'No image model is connected: add OPENAI_API_KEY to the service.'};
  const pack=normalizeTechPack(row.data);
  if(!pack.colorways.some(c=>c.swatch))return {noColourways:true};
  if(!packPhotos(row.data)[0]&&!pack.sketches.some(sk=>sk.image))return {noPhoto:true};
  const open=(await pool.query(`select id from tech_pack_colourways where tech_pack_id=$1 and status='running' and created_at>now()-interval '25 minutes' limit 1`,[row.id])).rows[0];
  if(open)return {already:true,id:open.id};
  const n=Number((await pool.query(`select count(*)::int n from tech_pack_colourways where product_id=$1 and created_at>now()-interval '24 hours'`,[row.product_id])).rows[0].n);
  if(n>=CW_PER_PRODUCT_DAY)return {limited:`That is ${CW_PER_PRODUCT_DAY} colourway runs on this product today. Try again tomorrow.`};
  const made=(await pool.query(`insert into tech_pack_colourways(tech_pack_id,product_id,client_id,trigger,requested_by) values($1,$2,$3,$4,$5) returning id`,[row.id,row.product_id,row.client_id,trigger,actor])).rows[0];
  return {id:made.id};
}
// The picture the colourways are drawn from: the approved hero, else the hero waiting for approval, else the clean cut-out, else the photo.
async function colourwayReference(row,pack){
  const hero=await currentHero(row.tech_pack_id||row.id);
  if(hero){try{return {buffer:await heroBuffer(hero),from:hero.status==='approved'?'the approved hero image':'the hero image (not yet approved)'}}catch{}}
  const dataUrl=pack.sketches.find(sk=>sk.image&&/^cutout-/.test(String(sk.id||'')))?.image,from=dataUrl?'the cut-out of the photo':'the photo',url=dataUrl||packPhotos(row.data)[0],m=/^data:image\/[a-z+]+;base64,(.+)$/i.exec(String(url||''));
  return m?{buffer:Buffer.from(m[1],'base64'),from}:null;
}
// Saves one finished picture (and the parts list) onto the pack. The pack's edit time is left alone: a picture arriving must not make the spec check look out of date.
async function saveColourwayTile(packId,tile,parts,{note}){
  const c=await pool.connect();
  try{
    await c.query('begin');const cur=(await c.query('select data from tech_packs where id=$1 for update',[packId])).rows[0];if(!cur){await c.query('rollback');return}
    const data=normalizeTechPack(cur.data);
    data.parts=parts;
    const own=data.renderings.filter(r=>!/^cw-/.test(String(r.id||''))),old=data.renderings.filter(r=>/^cw-/.test(String(r.id||''))&&r.parts?.length&&r.id!==tile.id);
    data.renderings=[...own,...old,{id:tile.id,name:`Colourway — ${tile.name}`,note,image:`data:image/jpeg;base64,${tile.buffer.toString('base64')}`,parts:tile.parts}].slice(0,6);
    await c.query('update tech_packs set data=$2 where id=$1',[packId,normalizeTechPack(data)]);await c.query('commit');
  }catch(e){await c.query('rollback').catch(()=>{});throw e}finally{c.release()}
}
async function runColourways(id){
  const j=(await pool.query('select j.*,tp.data,p.title from tech_pack_colourways j join tech_packs tp on tp.id=j.tech_pack_id join products p on p.id=j.product_id where j.id=$1',[id])).rows[0];
  if(!j||j.status!=='running')return;
  const step=async progress=>{await pool.query('update tech_pack_colourways set progress=$2 where id=$1',[id,JSON.stringify(progress)]).catch(()=>{})};
  try{
    const pack=normalizeTechPack(j.data),ref=await colourwayReference(j,pack);if(!ref)throw new Error('There is no picture to draw the colourways from.');
    await pool.query('update tech_pack_colourways set reference=$2 where id=$1',[id,ref.from]);
    const note=`Drawn from ${ref.from} · each part coloured as listed · concept visual, not a factory spec`;
    const out=await makeColourways({reference:ref.buffer,colourways:pack.colorways,meta:{title:j.title,category:pack.style.category},onStep:step,onTile:(tile,parts)=>saveColourwayTile(j.tech_pack_id,tile,parts,{note})});
    // the pack may carry the parts even when no tile passed: staff can still read the breakdown
    if(!out.tiles.length&&out.parts?.length){const c=await pool.connect();try{const cur=(await c.query('select data from tech_packs where id=$1',[j.tech_pack_id])).rows[0];if(cur){const d=normalizeTechPack(cur.data);d.parts=out.parts;await c.query('update tech_packs set data=$2 where id=$1',[j.tech_pack_id,normalizeTechPack(d)])}}finally{c.release()}}
    await pool.query(`update tech_pack_colourways set status='done',made=$2,skipped=$3,progress='{}'::jsonb,completed_at=now() where id=$1`,[id,out.tiles.length,JSON.stringify(out.skipped)]);
    await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[j.client_id,j.product_id,`Colourway pictures drawn for ${j.title} by labelled part: ${out.tiles.length} made${out.skipped.length?`, ${out.skipped.length} skipped`:''}`,{techPackId:j.tech_pack_id,colourwayRunId:id}]).catch(()=>{});
  }catch(e){
    app.log.warn({err:String(e.message||e).slice(0,300),colourwayRunId:id},'colourway pictures failed');
    await pool.query(`update tech_pack_colourways set status='failed',error=$2,progress='{}'::jsonb,completed_at=now() where id=$1`,[id,checkErrorText(e).replace(/\(Anthropic\)/,'')]).catch(()=>{});
  }
}
function colourwayView(r){
  if(!r)return null;
  const stale=r.status==='running'&&Date.now()-new Date(r.created_at)>CW_STALE_MS;
  return {id:r.id,status:stale?'failed':r.status,progress:r.progress||{},made:r.made,skipped:r.skipped||[],reference:r.reference||null,error:stale?'It took too long and was stopped. Try again.':r.error||null,createdAt:r.created_at,completedAt:r.completed_at,running:r.status==='running'&&!stale};
}
const latestColourways=async packId=>colourwayView((await pool.query('select * from tech_pack_colourways where tech_pack_id=$1 order by created_at desc limit 1',[packId])).rows[0]);
app.post('/v1/admin/products/:id/tech-pack/colourways',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const row=(await pool.query('select id,product_id,client_id,data from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!row)return reply.code(404).send({error:'Save the tech pack first'});
  if(!cwOn()){ // no image model: the older, flatter tiles (the photo recoloured), which are only fit for plain matte products
    const ctx=await loadAdminTechPack(req.params.id),data=normalizeTechPack(ctx.techPack.data),made=await colorwayTilesFor(data);if(made.error)return reply.code(400).send({error:made.error});
    data.renderings=made.renderings;const saved=(await pool.query(`update tech_packs set data=$2,updated_at=now() where id=$1 returning *`,[ctx.techPack.id,data])).rows[0];
    return {count:made.count,renderings:data.renderings,techPack:techPackPayload(saved)};
  }
  const r=await startColourways(row,{actor:req.auth.sub});
  if(r.unavailable)return reply.code(503).send({error:r.unavailable});
  if(r.noColourways)return reply.code(400).send({error:'Add at least one colourway with a colour first.'});
  if(r.noPhoto)return reply.code(400).send({error:'Add a photo first: the colourways are drawn from it.'});
  if(r.limited)return reply.code(429).send({error:r.limited});
  if(r.already)return reply.code(409).send({error:'The colourway pictures are already being drawn',id:r.id});
  setImmediate(()=>runColourways(r.id));
  return reply.code(202).send({started:true,id:r.id});
});
// Staff send work to the client's portal, whatever its score: it becomes a message from Future Basics in the client's project (with the picture or file attached), so it shows in their hub and they are notified.
// Sources: a hero picture or a spec-check render (pictures), the 3D shape (preview picture and the STL file), the factory quotations side by side (factories are Factory A, B... unless staff say to show names), and a link to the tech pack.
app.post('/v1/admin/products/:id/tech-pack/share-render',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const prod=(await pool.query('select id,title,client_id,project_id from products where id=$1',[req.params.id])).rows[0];if(!prod)return reply.code(404).send({error:'Product not found'});
  const project=prod.project_id?(await pool.query(`select id,client_id,name from projects where id=$1 and archived_at is null and status not in ('archive','archived')`,[prod.project_id])).rows[0]:null;
  if(!project)return reply.code(409).send({error:'This product is not in an active project yet. Put it in a project first: what you send is shared in the project\'s messages.'});
  const src=String(req.body?.source||''),itemId=String(req.body?.id||''),files=[]; // files: {buf,name,mime}
  let hero=null,label='',text='',sentence='';
  const slug=String(prod.title||'product').replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'product',fname=(l,ext)=>`${slug}-${l.replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'')}.${ext}`;
  const packUrl=`${clientHubUrl}/tech-packs/${prod.id}`;
  try{
    if(src==='hero'){
      hero=UUID_RE.test(itemId)?(await pool.query(`select * from tech_pack_heroes where id=$1 and product_id=$2 and status in ('ready','approved')`,[itemId,prod.id])).rows[0]:null;
      if(!hero)return reply.code(404).send({error:'That hero image is not available'});label='reference picture';files.push({buf:await heroBuffer(hero),name:fname(label,'jpg'),mime:'image/jpeg'});
    }else if(src==='check'){
      const c=UUID_RE.test(itemId)?(await pool.query(`select * from tech_pack_checks where id=$1 and product_id=$2 and status='done'`,[itemId,prod.id])).rows[0]:null,r=c?.renders?.[Number(req.body?.index)||0];
      if(!r)return reply.code(404).send({error:'That render is not available'});label=`render (${String(r.label||'').toLowerCase()||'view'})`;files.push({buf:await readFile(join(checkDir(),r.file)),name:fname(label,'jpg'),mime:'image/jpeg'});
    }else if(src==='model'){
      const m=(await pool.query(`select m.* from tech_pack_models m where m.product_id=$1 and m.status='done' and m.stl_file is not null order by m.created_at desc limit 1`,[prod.id])).rows[0];
      if(!m)return reply.code(404).send({error:'There is no 3D shape to send yet'});label='3D shape';
      if(m.thumb_file)files.push({buf:await readFile(join(meshDir(),m.thumb_file)),name:fname('3D-shape-preview','jpg'),mime:'image/jpeg'});
      const stl=await readFile(join(meshDir(),m.stl_file));if(stl.length<=25*1048576)files.push({buf:stl,name:fname('3D-shape','stl'),mime:'model/stl'});
      sentence=`A 3D shape of ${prod.title}, made from one picture to show the form. It is not to scale and the back is a best guess, so the tech pack's measurements decide the size. The preview is attached with the file you can open in any 3D viewer.`;
    }else if(src==='techpack'){
      const tp=(await pool.query('select version,published_at from tech_packs where product_id=$1',[prod.id])).rows[0];
      if(!tp?.published_at)return reply.code(409).send({error:'Publish the tech pack before sending it to the client'});label='tech pack';
      sentence=`The tech pack for ${prod.title} (version ${tp.version}) is ready for you to read and approve. Open it here: ${packUrl}`;
    }else if(src==='quotes'){
      const tp=(await pool.query('select id from tech_packs where product_id=$1',[prod.id])).rows[0];
      const quotes=tp?(await pool.query('select q.*,s.label share_label from factory_quotes q join tech_pack_shares s on s.id=q.share_id where q.tech_pack_id=$1 order by q.updated_at desc',[tp.id])).rows.map(q=>({...quoteRow(q),label:q.share_label})):[];
      if(!quotes.length)return reply.code(409).send({error:'No factory has quoted yet'});label='quotations';
      const qty=Math.max(1,Math.round(Number(req.body?.qty))||defaultCompareQty(quotes)),rows=compareQuotes(quotes,qty),names=req.body?.showNames===true,usd=n=>String(Math.round(n*100)/100);
      if(!rows.length)return reply.code(409).send({error:`No quotation prices at ${qty} units`});
      sentence=`Factory quotations for ${prod.title} at ${qty} units, cheapest first:\n`+rows.map((r,i)=>`${i+1}. ${names?(r.company||r.label):`Factory ${String.fromCharCode(65+i)}`}: ${r.currency} ${usd(r.atUnit)} per unit${r.moq?`, MOQ ${r.moq}`:''}${r.leadDays?`, ${r.leadDays} days to produce`:''}${r.sampleCost!=null?`, sample ${r.currency} ${usd(r.sampleCost)}`:''}${r.tooling?`, tooling ${r.currency} ${usd(r.tooling)}`:''}`).join('\n')+`\nPrices are as the factories quoted them, in their own currency. Tell us which one you would like to go ahead with.`;
    }else return reply.code(400).send({error:'Choose what to send: a picture, the 3D shape, the quotations or the tech pack'});
  }catch(e){if(e.code==='ENOENT')return reply.code(404).send({error:'The file is missing. Make it again.'});throw e}
  text=String(req.body?.message||'').trim().slice(0,1500)||sentence||`A work-in-progress ${label} of ${prod.title}. It is a concept to react to, not a final sample. Tell us what you would change.`;
  const msg=(await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,$3,'admin',$4) returning *`,[project.id,project.client_id,req.auth.sub,text])).rows[0];
  const fileIds=[];
  for(const f of files){
    const storageName=`${randomBytes(18).toString('hex')}-${f.name}`;await writeFile(join(uploadDir,storageName),f.buf);
    fileIds.push((await pool.query(`insert into project_files(project_id,client_id,message_id,uploader_id,uploader_role,original_name,storage_name,mime_type,size_bytes) values($1,$2,$3,$4,'admin',$5,$6,$7,$8) returning id`,[project.id,project.client_id,msg.id,req.auth.sub,f.name,storageName,f.mime,f.buf.length])).rows[0].id);
  }
  await pool.query('update projects set updated_at=now() where id=$1',[project.id]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,$2,$3,'project',$4)`,[project.client_id,files.length?'project-file':'project-message',files.length?(/^(reference picture|render)/.test(label)?`New picture in ${project.name}: ${files[0].name}`:`New ${label} in ${project.name}`):`New message in ${project.name}`,project.id]);
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[prod.client_id,prod.id,req.auth.sub,`Sent the ${label} of ${prod.title} to the client's portal`,{messageId:msg.id,fileIds,source:src}]).catch(()=>{});
  if(hero)await pool.query('update tech_pack_heroes set shared_at=now() where id=$1',[hero.id]);
  return reply.code(201).send({shared:true,messageId:msg.id,project:project.name,files:fileIds.length});
});

// ---- A 3D model (STL) from the client's photo, made by Meshy. Staff start it by hand: it costs credits and sends the photo to the vendor. ----
const MESH_PER_PRODUCT_DAY=Number(process.env.MESH_PER_PRODUCT_DAY)||3,MESH_PER_DAY=Number(process.env.MESH_PER_DAY)||20,MESH_GIVE_UP_MS=20*60*1000,meshDir=()=>join(uploadDir,'models'),meshPolls=new Set();
const meshPollMs=()=>Number(process.env.MESH_POLL_MS)||5000;
const MESH_MIN_SCORE=()=>Number(process.env.MESH_MIN_SCORE)||LOOP_THRESHOLD();
// The render the 3D model is made from: the developer assistant's drawing of the pack as it stands now (after the exchange), never an older pack.
async function modelSource(row,{checkId=null}={}){
  let c=null;
  if(checkId)c=(await pool.query(`select * from tech_pack_checks where id=$1 and tech_pack_id=$2 and status='done'`,[checkId,row.id])).rows[0];
  else{
    const lp=(await pool.query(`select final_check_id,finished_at from tech_pack_loops where tech_pack_id=$1 and status='done' and final_check_id is not null order by created_at desc limit 1`,[row.id])).rows[0];
    if(lp&&new Date(lp.finished_at)>=new Date(row.updated_at))c=(await pool.query(`select * from tech_pack_checks where id=$1 and status='done'`,[lp.final_check_id])).rows[0];
    if(!c)c=(await pool.query(`select * from tech_pack_checks where tech_pack_id=$1 and status='done' and pack_updated_at=$2 order by completed_at desc limit 1`,[row.id,row.updated_at])).rows[0];
  }
  if(!c)return {reason:'nocheck'};
  const first=(c.renders||[])[0];
  if(c.render_status!=='rendered'||!first)return {reason:'norender',check:c,score:c.score};
  return {check:c,score:c.score,verdict:c.verdict_label,file:join(checkDir(),first.file)};
}
// May the 3D model be made from the render? Only when the pack, as it stands, reads as the product in the photo.
async function modelGate(row,opts){
  const min=MESH_MIN_SCORE(),src=await modelSource(row,opts);
  const hero=await currentHero(row.id);if(hero&&hero.status!=='approved')return {ok:false,reason:'hero',min,message:'Approve the hero image first: the 3D model is made from a picture a person has signed off. Choosing a different try, or making new ones, takes the approval away, and a client saying yes in their hub is not the same as pressing Approve here.'};
  if(src.reason==='nocheck')return {ok:false,reason:'nocheck',min,message:'The pack has not been tested since it last changed. Run the spec check first: the 3D model is made from its render.'};
  if(src.reason==='norender')return {ok:false,reason:'norender',min,score:src.score,message:'The last check had no render (the image model is not connected, or the render failed), so there is nothing to make the 3D model from.'};
  if(src.verdict==='cannot-judge'||src.score<min)return {ok:false,reason:'score',min,score:src.score,checkId:src.check.id,message:`The pack does not look like the photo yet (${src.score}/100, it needs ${min}). Hand it back to the design assistant first, make the model from this render anyway, or make it straight from the client photo.`};
  return {ok:true,min,score:src.score,checkId:src.check.id};
}
async function startModel(row,{actor=null,source='render',checkId=null,force=false}={}){
  const cfg=meshConfig();
  if(!cfg.configured)return {unavailable:cfg.provider==='off'?'The 3D step is switched off (MESH_DISABLED).':'No 3D service is connected: add MESHY_API_KEY to the service.'};
  let image,src=null,forced=false;
  if(source==='render'){
    // below the bar a person can still choose to make it (force): the render has to exist and the hero has to be approved, but the score is their call
    const gate=await modelGate(row,{checkId});if(!gate.ok&&!(force&&gate.reason==='score'))return {gated:gate.message,gate};
    forced=!gate.ok;src=await modelSource(row,{checkId:checkId||gate.checkId});
    try{image=await photoForMesh('data:image/jpeg;base64,'+(await readFile(src.file)).toString('base64'))}catch{return {gated:'The render file is missing. Run the spec check again.',gate:{ok:false,reason:'norender'}}}
  }else{
    const photo=packPhotos(row.data)[0];if(!photo)return {noPhoto:true};
    image=await photoForMesh(photo);
  }
  if(!image)return {noPhoto:true};
  const open=(await pool.query(`select id from tech_pack_models where product_id=$1 and status='running' and created_at>now()-interval '20 minutes' limit 1`,[row.product_id])).rows[0];
  if(open)return {already:true,id:open.id};
  const n=(await pool.query(`select count(*) filter(where product_id=$1)::int p,count(*)::int t from tech_pack_models where created_at>now()-interval '24 hours'`,[row.product_id])).rows[0];
  if(n.p>=MESH_PER_PRODUCT_DAY)return {limited:`That is ${MESH_PER_PRODUCT_DAY} 3D models on this product today. Try again tomorrow.`};
  if(n.t>=MESH_PER_DAY)return {limited:`The daily limit of ${MESH_PER_DAY} 3D models is used up. It resets tomorrow, or raise MESH_PER_DAY.`};
  const made=(await pool.query(`insert into tech_pack_models(tech_pack_id,product_id,client_id,provider,model,pack_version,requested_by,source,source_check_id,source_score,forced) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,[row.id,row.product_id,row.client_id,cfg.provider,cfg.model,row.version||0,actor,source,src?src.check.id:null,src?src.score:null,forced])).rows[0];
  try{const t=await startMesh({imageDataUrl:image,cfg});await pool.query('update tech_pack_models set task_id=$2 where id=$1',[made.id,t.taskId])}
  catch(e){await pool.query(`update tech_pack_models set status='failed',error=$2,completed_at=now() where id=$1`,[made.id,clipText(e.message,240)]);return {failed:clipText(e.message,240),id:made.id}}
  setImmediate(()=>followModel(made.id).catch(e=>app.log.warn({err:e.message,modelId:made.id},'3D model follow failed')));
  return {id:made.id};
}
// Watches one task until the service is done, then saves the files. Resumed by the recovery job after a restart.
async function followModel(id){
  if(meshPolls.has(id))return;meshPolls.add(id);
  try{
    let errors=0;
    for(;;){
      const m=(await pool.query('select * from tech_pack_models where id=$1',[id])).rows[0];if(!m||m.status!=='running'||!m.task_id)return;
      if(Date.now()-new Date(m.created_at)>MESH_GIVE_UP_MS){await pool.query(`update tech_pack_models set status='failed',error='The 3D service took too long. Try again.',completed_at=now() where id=$1`,[id]);return}
      let r;
      try{r=await pollMesh(m.task_id,{cfg:{...meshConfig(),provider:m.provider==='fixture'?'fixture':meshConfig().provider}});errors=0}
      catch(e){if(e.status===401||e.status===403||++errors>=6){await pool.query(`update tech_pack_models set status='failed',error=$2,completed_at=now() where id=$1`,[id,clipText(e.message,240)]);return}await new Promise(r=>setTimeout(r,meshPollMs()));continue}
      if(r.status==='failed'){await pool.query(`update tech_pack_models set status='failed',error=$2,completed_at=now() where id=$1`,[id,r.error||'The 3D service could not make a model.']);return}
      if(r.status==='done'){
        try{
          const cfg=meshConfig(),stl=await fetchAsset(r.stlUrl,{kind:'stl',cfg:{...cfg,provider:m.provider==='fixture'?'fixture':cfg.provider}}),info=stlInfo(stl);
          if(!info)throw new Error('The 3D service sent a file that is not a valid STL.');
          await mkdir(meshDir(),{recursive:true});
          const stlFile=`${id}.stl`;await writeFile(join(meshDir(),stlFile),stl);
          let thumbFile=null;
          if(r.thumbUrl){try{const t=await fetchAsset(r.thumbUrl,{kind:'thumb',cfg:{...cfg,provider:m.provider==='fixture'?'fixture':cfg.provider}}),jpg=await sharp(t).resize({width:640,height:640,fit:'inside'}).flatten({background:'#ffffff'}).jpeg({quality:82}).toBuffer();thumbFile=`${id}.jpg`;await writeFile(join(meshDir(),thumbFile),jpg)}catch{thumbFile=null}}
          await pool.query(`update tech_pack_models set status='done',progress=100,stl_file=$2,thumb_file=$3,stl_bytes=$4,triangles=$5,size=$6,credits=$7,completed_at=now() where id=$1`,[id,stlFile,thumbFile,stl.length,info.triangles,JSON.stringify(info.size),r.credits]);
          const p=(await pool.query(`select p.title,m.client_id,m.product_id,m.tech_pack_id from tech_pack_models m join products p on p.id=m.product_id where m.id=$1`,[id])).rows[0];
          if(p)await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[p.client_id,p.product_id,`3D model (STL) made for ${p.title} from the client photo`,{techPackId:p.tech_pack_id,modelId:id}]).catch(()=>{});
        }catch(e){await pool.query(`update tech_pack_models set status='failed',error=$2,completed_at=now() where id=$1`,[id,clipText(e.message,240)])}
        return;
      }
      await pool.query('update tech_pack_models set progress=$2 where id=$1',[id,r.progress||0]);
      await new Promise(r=>setTimeout(r,meshPollMs()));
    }
  }finally{meshPolls.delete(id)}
}
async function runModelRecovery(){
  await pool.query(`update tech_pack_models set status='failed',error='The 3D service took too long. Try again.',completed_at=now() where status='running' and created_at<now()-interval '25 minutes'`);
  await pool.query(`update tech_pack_models set status='failed',error='The request did not reach the 3D service. Try again.',completed_at=now() where status='running' and task_id is null and created_at<now()-interval '3 minutes'`);
  const open=(await pool.query(`select id from tech_pack_models where status='running' and task_id is not null order by created_at limit 5`)).rows;
  let n=0;for(const r of open){if(!meshPolls.has(r.id)){setImmediate(()=>followModel(r.id).catch(()=>{}));n++}}
  return n;
}
async function modelView(row,{withThumb=false}={}){
  if(!row)return null;
  let thumb=null;if(withThumb&&row.thumb_file){try{thumb='data:image/jpeg;base64,'+(await readFile(join(meshDir(),row.thumb_file))).toString('base64')}catch{}}
  return {id:row.id,status:row.status,progress:row.progress,provider:row.provider,model:row.model,createdAt:row.created_at,completedAt:row.completed_at,packVersion:row.pack_version,triangles:row.triangles,size:row.size,bytes:row.stl_bytes==null?null:Number(row.stl_bytes),credits:row.credits,error:row.error||null,thumb,hasFile:Boolean(row.stl_file),source:row.source||'photo',sourceScore:row.source_score,forced:Boolean(row.forced)};
}
app.post('/v1/admin/products/:id/tech-pack/model',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const row=(await pool.query('select id,product_id,client_id,version,data,updated_at from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!row)return reply.code(404).send({error:'Save the tech pack first'});
  const pick=UUID_RE.test(String(req.body?.checkId||''))?String(req.body.checkId):null; // the render staff picked; it is used as it is, even if the pack has changed since
  const r=await startModel(row,{actor:req.auth.sub,source:req.body?.source==='photo'?'photo':'render',checkId:pick,force:req.body?.force===true});
  if(r.gated)return reply.code(409).send({error:r.gated,gate:r.gate});
  if(r.unavailable)return reply.code(503).send({error:r.unavailable});
  if(r.noPhoto)return reply.code(400).send({error:'Add a photo first.'});
  if(r.limited)return reply.code(429).send({error:r.limited});
  if(r.failed)return reply.code(502).send({error:r.failed});
  if(r.already)return reply.code(409).send({error:'A 3D model is already being made for this product',id:r.id});
  return reply.code(202).send({started:true,id:r.id});
});
app.get('/v1/admin/tech-pack-models/:id/:file',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id))||!['stl','thumb'].includes(req.params.file))return reply.code(404).send({error:'Not found'});
  const m=(await pool.query(`select m.stl_file,m.thumb_file,p.title from tech_pack_models m join products p on p.id=m.product_id where m.id=$1 and m.status='done'`,[req.params.id])).rows[0];
  const file=req.params.file==='stl'?m?.stl_file:m?.thumb_file;if(!file)return reply.code(404).send({error:'Not found'});
  const name=`${String(m.title||'model').replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60)||'model'}-3d`;
  return req.params.file==='stl'?reply.type('model/stl').header('content-disposition',`attachment; filename="${name}.stl"`).send(createReadStream(join(meshDir(),file))):reply.type('image/jpeg').send(createReadStream(join(meshDir(),file)));
});
// Re-run on demand. The console can always re-run; a client may retry a failed read up to the attempt limit.
async function startAiRun(row,{force=true}={}){
  await pool.query(`update tech_packs set ai_status='pending',ai_error=null where id=$1`,[row.id]);
  setImmediate(()=>enrichPhotoDraft(row.id,{force}).catch(e=>app.log.warn({err:e.message},'ai re-run failed')));
}
app.post('/v1/admin/ai/auto-retry',{preHandler:[authenticate,adminOnly]},async()=>runAiAutoRetry());
app.post('/v1/admin/ai/recover',{preHandler:[authenticate,adminOnly]},async()=>({restarted:await runAiRecovery()}));
app.post('/v1/admin/products/:id/tech-pack/ai',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!aiEnabled())return reply.code(503).send({error:'The assistant needs ANTHROPIC_API_KEY on the service'});
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});
  if(!ctx.techPack)return reply.code(409).send({error:'Save the tech pack first'});
  if(ctx.techPack.ai_status==='pending'&&new Date(ctx.techPack.ai_started_at||0)>new Date(Date.now()-AI_STALE_MINUTES*60000))return reply.code(409).send({error:'The assistant is already running on this pack'});
  if(!normalizeTechPack(ctx.techPack.data).sketches.some(s=>s.image))return reply.code(400).send({error:'Add a photo or sketch first — the assistant reads the first view'});
  if(ctx.techPack.ai_status==='locked'||!ctx.techPack.billing)await pool.query(`update tech_packs set billing='admin' where id=$1`,[ctx.techPack.id]);
  // Start over (explicit, staff only): drop everything the assistant and the customer put in the pack except the reference photo,
  // forget the earlier assistant draft, and run as a first run. For a pack whose earlier runs left values that now read as the
  // customer's own typing (re-runs made before the merge was fixed), or any pack that should simply be redrawn from the photo.
  let startedOver=false;
  if(req.body?.startOver===true){
    const cur=normalizeTechPack(ctx.techPack.data),photo=cur.sketches.find(sk=>sk.image&&!/^cutout-/.test(String(sk.id||'')));
    if(!photo)return reply.code(400).send({error:'Add a photo first — a pack is started over from its reference photo'});
    const blank=normalizeTechPack({...seedTechPack(ctx),sketches:[{...photo,callouts:[]}]});blank.style.designer=cur.style.designer;
    await pool.query(`update tech_packs set data=$2,ai_draft=null,ai_draft_at=null,updated_at=now() where id=$1`,[ctx.techPack.id,blank]);
    await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`Tech pack for ${ctx.product.title} started over from its reference photo`,{techPackId:ctx.techPack.id}]).catch(()=>{});
    startedOver=true;
  }
  await startAiRun(ctx.techPack);
  return {aiStatus:'pending',startedOver};
});
app.post('/v1/products/:id/tech-pack/draft/ai',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  if(!aiEnabled())return reply.code(503).send({error:'The assistant is not available right now'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics'});
  if(row.ai_status==='pending'&&new Date(row.ai_started_at||0)>new Date(Date.now()-AI_STALE_MINUTES*60000))return reply.code(409).send({error:'The assistant is already reading your photo'});
  if((row.ai_attempts||0)>=AI_MAX_ATTEMPTS)return reply.code(429).send({error:'The assistant has tried three times — submit the draft and Future Basics will finish it with you'});
  if(!normalizeTechPack(row.data).sketches.some(s=>s.image))return reply.code(400).send({error:'Add a photo first (Callouts → View settings → Replace image)'});
  if(row.ai_status==='locked'){const st=await unlockTechPack(row);if(st==='locked')return reply.code(402).send({error:'This tech pack is waiting for payment',aiStatus:'locked',pricing:techPackPricing(),checkoutUrl:row.pay_invoice_url||null});return {aiStatus:st}}
  if(row.ai_status==null&&billingOn()){const ent=await techPackEntitlement(row.client_id,row.id);if(ent==='locked'){await pool.query(`update tech_packs set ai_status='locked' where id=$1`,[row.id]);return reply.code(402).send({error:'This tech pack is waiting for payment',aiStatus:'locked',pricing:techPackPricing(),checkoutUrl:null})}await pool.query(`update tech_packs set billing=$2 where id=$1`,[row.id,ent])}
  await startAiRun(row);
  return {aiStatus:'pending'};
});
// Single-pack payment: opens (or reuses) the Shopify checkout for this pack.
app.post('/v1/products/:id/tech-pack/checkout',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics — we will finish it with you',aiStatus:row.ai_status||null});
  if(row.ai_status!=='locked')return reply.code(409).send({error:'This tech pack does not need payment',aiStatus:row.ai_status||null});
  // Whatever goes wrong at Shopify (down, a missing scope, a rejected draft order) is ours to sort out, never a raw error on the pay button.
  let out;
  try{out=await techPackCheckout(row,{email:req.auth.email})}
  catch(e){
    if(e.statusCode===503&&/not set up/i.test(e.message||''))throw e; // the deliberate "payments are not set up yet" message
    app.log.error({err:e.message,packId:row.id},'tech pack checkout failed');
    return reply.code(502).send({error:'We could not open checkout just now. Try again in a minute — if it keeps happening, message Future Basics and we will unlock the pack for you.',code:'CHECKOUT_UNAVAILABLE'});
  }
  return {...out,amountCents:TECH_PACK_PRICE_CENTS,currency:'USD'};
});
// After paying (or joining): re-check and start the assistant.
app.post('/v1/products/:id/tech-pack/unlock',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics',aiStatus:row.ai_status||null});
  const st=await unlockTechPack(row);
  return {aiStatus:st,pricing:st==='locked'?techPackPricing():null,checkoutUrl:st==='locked'?row.pay_invoice_url||null:null};
});
// Test rig only: marks a pack paid without Shopify.
app.post('/v1/dev/pay/:packId',async(req,reply)=>{
  if(process.env.DEV_BYPASS_AUTH!=='true')return reply.code(404).send({error:'Not found'});
  const r=await pool.query(`update tech_packs set paid_at=now(),pay_order_id='dev',billing='single' where id=$1 and ai_status='locked' returning id`,[req.params.packId]);
  return {paid:r.rowCount===1};
});
// Where a self-serve room came from: utm_* from the ad link, the referrer and the landing path, captured once on /start. First touch wins; the console shows it on the room.
function cleanAttribution(a){if(!a||typeof a!=='object')return null;const pick=k=>{const v=String(a[k]??'').trim().slice(0,120);return v||undefined};
  const out={source:pick('source'),medium:pick('medium'),campaign:pick('campaign'),content:pick('content'),term:pick('term'),referrer:pick('referrer'),landing:pick('landing'),firstSeenAt:pick('firstSeenAt'),lang:pick('lang')};
  Object.keys(out).forEach(k=>out[k]===undefined&&delete out[k]);if(out.referrer&&!/^https?:\/\//.test(out.referrer))delete out.referrer;return Object.keys(out).length?{...out,recordedAt:new Date().toISOString()}:null}
// A buyer who arrived through a factory's link (source f-CODE) carries that factory on their room.
async function withPartner(attribution){
  const m=/^f-([A-Z0-9]{6})$/i.exec(attribution?.source||'');if(!m)return attribution;
  const p=(await pool.query('select id,company,code from partners where code=$1',[m[1].toUpperCase()])).rows[0];
  return p?{...attribution,partner:p.company,partnerId:p.id,partnerCode:p.code}:attribution;
}
// ---- Factory sign-up (the fair page). A factory gets its own link to hand to its buyers; staff are told, and the factory is emailed
// its link when it gave an email. Codes are six letters and digits without look-alikes (no 0/O, 1/I/L).
const PARTNER_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const partnerCode=()=>Array.from(randomBytes(6),b=>PARTNER_ALPHABET[b%PARTNER_ALPHABET.length]).join('');
const partnerLink=(code,lang)=>`${clientHubUrl}/start?ref=f-${code}${lang&&lang!=='en'?`&lang=${lang}`:''}`;
app.post('/v1/public/factories',async(req,reply)=>{
  if(!publicIntakeAllowed(req.ip,{bucket:'factory',limit:Number(process.env.FACTORY_SIGNUP_LIMIT)||20}))return reply.code(429).send({error:'Too many sign-ups from here. Please try again in an hour.'});
  const b=req.body||{},f=(k,n=200)=>String(b[k]??'').trim().slice(0,n)||null;
  if(f('website'))return reply.code(202).send({ok:true}); // honeypot
  const company=f('company',160),email=(f('email',254)||'').toLowerCase()||null,wechat=f('wechat',80),phone=f('phone',60);
  const lang=['en','zh','zh-hk'].includes(b.lang)?b.lang:'en',source=f('source',60);
  if(!company)return reply.code(400).send({error:'Enter the company name'});
  if(!email&&!wechat&&!phone)return reply.code(400).send({error:'Leave at least one way to reach you: email, WeChat or phone'});
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return reply.code(400).send({error:'Check the email address'});
  let row=null;
  for(let i=0;i<5&&!row;i++)row=(await pool.query(`insert into partners(code,company,contact_name,email,wechat,phone,city,makes,source,lang) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    on conflict(code) do nothing returning *`,[partnerCode(),company,f('contact',140),email,wechat,phone,f('city',80),f('makes',500),source,lang])).rows[0];
  if(!row)return reply.code(503).send({error:'Could not make a code just now — try again'});
  const link=partnerLink(row.code,lang),fb=(await pool.query(`select id from clients where slug='future-basics'`)).rows[0];
  const who=[row.contact_name,row.email,row.wechat&&`WeChat ${row.wechat}`,row.phone].filter(Boolean).join(' · ');
  if(fb)await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'partner',$2,'partner',$3)`,[fb.id,`New factory${source?` from ${source}`:''}: ${company}${row.city?` (${row.city})`:''} — ${who}`,row.id]).catch(()=>{});
  await notifyStaff(`New factory sign-up${source?` · ${source}`:''}: ${company}`,`<p><strong>${emailEscape(company)}</strong>${row.city?` · ${emailEscape(row.city)}`:''} signed up${source?` at <strong>${emailEscape(source)}</strong>`:''}.</p><p>${emailEscape(who)}</p>${row.makes?`<p>Makes: ${emailEscape(row.makes)}</p>`:''}<p>Their referral link: ${emailEscape(link)}</p>`);
  if(email){
    const zh=lang!=='en',hk=lang==='zh-hk';
    sendHubEmail({to:email,subject:zh?(hk?'你的 Future Basics 工廠連結':'你的 Future Basics 工厂链接'):'Your Future Basics factory link',
      html:hubEmailShell(zh?(hk?'這是你的工廠連結':'这是你的工厂链接'):'Your factory link',zh
        ?`<p>${emailEscape(company)}，${hk?'多謝登記。把這個連結發給你的海外客戶，他們由這裡開始的技術包會連同中文版直接交到你手上：':'感谢注册。把这个链接发给你的海外客户，他们从这里开始的技术包会带着中文版直接给到你：'}</p>${hubButton(link,hk?'打開連結':'打开链接')}<p style="word-break:break-all">${emailEscape(link)}</p>`
        :`<p>Thanks for signing up, ${emailEscape(company)}. Send this link to your overseas buyers. The tech packs they start from it come to you with a Chinese version:</p>${hubButton(link,'Open the link')}<p style="word-break:break-all">${emailEscape(link)}</p>`)}).catch(e=>app.log.warn({err:e.message,partnerId:row.id},'factory link email not sent'));
  }
  return reply.code(201).send({code:row.code,link});
});
const partnerView=(r,buyers)=>({id:r.id,code:r.code,company:r.company,contactName:r.contact_name,jobTitle:r.job_title,email:r.email,wechat:r.wechat,phone:r.phone,city:r.city,website:r.website,makes:r.makes,moqNote:r.moq_note,rating:r.rating,notes:r.notes,source:r.source,lang:r.lang,supplierId:r.supplier_id,createdAt:r.created_at,buyers:buyers??r.buyers??0,link:partnerLink(r.code,r.lang)});
app.get('/v1/admin/partners',{preHandler:[authenticate,adminOnly]},async()=>{
  const rows=(await pool.query(`select p.*,(select count(*)::int from clients c where c.acquisition->>'partnerId'=p.id::text) buyers from partners p order by p.created_at desc limit 500`)).rows;
  return {partners:rows.map(r=>({...r,...partnerView(r)}))};
});
// Fair notes (staff, on a phone): a factory met at a booth. Only the company is needed; the rest is whatever there was time for.
app.post('/v1/admin/partners',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const c=cleanPartner(req.body||{});if(c.error)return reply.code(400).send({error:c.error});const q=c.p;
  const dup=(await pool.query('select * from partners where lower(company)=lower($1) and coalesce(lower(email),\'\')=coalesce($2,\'\') limit 1',[q.company,q.email||''])).rows[0];
  if(dup&&req.body?.allowDuplicate!==true)return reply.code(409).send({error:`${dup.company} is already in the list`,partner:partnerView(dup)});
  let row=null;
  for(let i=0;i<5&&!row;i++)row=(await pool.query(`insert into partners(code,company,contact_name,job_title,email,wechat,phone,city,website,makes,moq_note,rating,notes,source,lang,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    on conflict(code) do nothing returning *`,[partnerCode(),q.company,q.contactName,q.jobTitle,q.email,q.wechat,q.phone,q.city,q.website,q.makes,q.moqNote,q.rating,q.notes,q.source,q.lang,req.auth.sub])).rows[0];
  if(!row)return reply.code(503).send({error:'Could not make a code just now: try again'});
  return reply.code(201).send({partner:partnerView(row,0)});
});
app.patch('/v1/admin/partners/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const cur=(await pool.query('select * from partners where id=$1',[req.params.id])).rows[0];if(!cur)return reply.code(404).send({error:'Not found'});
  const c=cleanPartner({company:cur.company,contactName:cur.contact_name,jobTitle:cur.job_title,email:cur.email,wechat:cur.wechat,phone:cur.phone,city:cur.city,website:cur.website,makes:cur.makes,moqNote:cur.moq_note,rating:cur.rating,notes:cur.notes,source:cur.source,lang:cur.lang,...(req.body||{})});
  if(c.error)return reply.code(400).send({error:c.error});const q=c.p;
  const row=(await pool.query(`update partners set company=$2,contact_name=$3,job_title=$4,email=$5,wechat=$6,phone=$7,city=$8,website=$9,makes=$10,moq_note=$11,rating=$12,notes=$13,source=$14,lang=$15,updated_at=now() where id=$1 returning *`,
    [cur.id,q.company,q.contactName,q.jobTitle,q.email,q.wechat,q.phone,q.city,q.website,q.makes,q.moqNote,q.rating,q.notes,q.source,q.lang])).rows[0];
  return {partner:partnerView(row)};
});
// A factory met at a fair becomes a supplier record the production runs can use.
app.post('/v1/admin/partners/:id/supplier',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const p=(await pool.query('select * from partners where id=$1',[req.params.id])).rows[0];if(!p)return reply.code(404).send({error:'Not found'});
  if(p.supplier_id)return reply.code(200).send({supplierId:p.supplier_id,already:true});
  const note=[p.makes&&`Makes: ${p.makes}`,p.moq_note&&`MOQ/price: ${p.moq_note}`,p.notes,p.source&&`Met at ${p.source}`,p.wechat&&`WeChat ${p.wechat}`].filter(Boolean).join('\n');
  const sup=(await pool.query(`insert into suppliers(name,contact_email,contact_phone,country,notes) values($1,$2,$3,$4,$5) on conflict(name) do update set updated_at=now() returning id`,[p.company,p.email,p.phone,'China',note||null])).rows[0];
  await pool.query('update partners set supplier_id=$2,updated_at=now() where id=$1',[p.id,sup.id]);
  return reply.code(201).send({supplierId:sup.id});
});
// A business card photo read into fields to confirm. Nothing is kept from the photo.
app.post('/v1/admin/partners/scan',{preHandler:[authenticate,adminOnly],bodyLimit:12_000_000},async(req,reply)=>{
  if(!throttle(`cardscan:${req.auth.sub}`,{limit:120,windowMs:3600_000}))return reply.code(429).send({error:'Too many scans this hour: type this one in'});
  const m=/^data:image\/(png|jpe?g|webp|heic|heif);base64,(.+)$/i.exec(String(req.body?.image||''));if(!m)return reply.code(400).send({error:'Send a photo of the card'});
  if(process.env.AI_FIXTURE)return {fields:FIXTURE_CARD};
  if(!aiEnabled())return reply.code(503).send({error:'Card reading is not available: type the details in'});
  let jpeg;try{jpeg=await sharp(Buffer.from(m[2],'base64')).rotate().resize({width:1800,height:1800,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer()}catch{return reply.code(400).send({error:'That photo could not be opened: take it again'})}
  try{
    const out=await timed('anthropic',()=>callJsonSchema(CARD_SYSTEM,[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:jpeg.toString('base64')}},{type:'text',text:'Read this card.'}],CARD_SCHEMA,{maxTokens:900}));
    return {fields:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,String(v??'').trim()]))};
  }catch(e){return reply.code(502).send({error:'The card could not be read: type the details in'})}
});
app.post('/v1/public/start',{bodyLimit:16_000_000},async(req,reply)=>{
  if(!publicIntakeAllowed(req.ip,{bucket:'start',limit:Number(process.env.START_RATE_LIMIT)||12}))return reply.code(429).send({error:'Too many submissions. Please try again in an hour.'});
  const b=req.body||{};
  if(String(b.website||'').trim())return reply.code(202).send({ok:true});                       // honeypot
  const email=typeof b.email==='string'?b.email.trim().toLowerCase():'',name=String(b.name||'').trim().slice(0,140),title=String(b.title||'').trim().slice(0,200),notes=String(b.notes||'').trim().slice(0,3000),attribution=await withPartner(cleanAttribution(b.attribution));
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))return reply.code(400).send({error:'Enter the email you want us to reach you at'});
  if(!title)return reply.code(400).send({error:'Give the product a name'});
  if(emailDomain(email)==='thefuturebasics.com')return reply.code(400).send({error:'Use the work console to start a tech pack for a client'});
  const prep=await preparePhotos(b.photos);if(prep.bad)return reply.code(400).send({error:`Photo ${prep.bad} could not be opened — re-save it as a JPG or PNG and try again`});
  const photos=prep.photos;if(!photos.length)return reply.code(400).send({error:'Add at least one photo or screenshot'});
  const sketches=photos.map((image,i)=>({id:`photo-${i+1}`,view:i===0?'front':'detail',label:i===0?'Reference photo':`Reference photo ${i+1}`,image,garmentWidthIn:null,callouts:[]}));
  const db=await pool.connect();let released=false;const release=()=>{if(!released){released=true;db.release()}};
  try{
    await db.query('begin');
    await db.query('select pg_advisory_xact_lock(hashtext($1))',[email]); // a double-tap sends two of these at once: the second waits and finds the room the first made
    let client=await clientForEmail(email,db),brandNew=false;
    if(!client){
      const lead=(await db.query(`select * from clients where status='lead' and archived_at is null and (lower(contact_email)=$1 or $1=any(allowed_emails)) order by created_at desc limit 1`,[email])).rows[0];
      if(lead){
        client=(await db.query(`update clients set status='active',allowed_emails=(select array_agg(distinct e) from unnest(allowed_emails||$2::text[]) e),activated_at=coalesce(activated_at,now()),
          contact_name=coalesce(nullif(contact_name,''),$3),acquisition=coalesce(acquisition,$4::jsonb) where id=$1 returning *`,[lead.id,[email],name||null,attribution?JSON.stringify(attribution):null])).rows[0];
      }else{
        // The name is not unique (two people called Alex, or the same person twice): the plain slug first, then a random suffix.
        // Each try is an insert that does nothing on a clash, so a taken slug (even one taken a moment ago by someone else) just means another try, never a 500.
        const base=intakeSlug(name||email.split('@')[0]);
        for(let attempt=0;attempt<8&&!client;attempt++){
          const slug=attempt===0?base:`${base.slice(0,40)}-${randomBytes(attempt<4?3:5).toString('hex')}`;
          client=(await db.query(`insert into clients(slug,name,status,contact_name,contact_email,allowed_emails,notes,activated_at,acquisition) values($1,$2,'active',$3,$4,$5,$6,now(),$7::jsonb) on conflict(slug) do nothing returning *`,
            [slug,name||email.split('@')[0],name||null,email,[email],`Self-serve · started a tech pack from a photo`,attribution?JSON.stringify(attribution):null])).rows[0]||null;
        }
        if(!client)throw new Error('could not find a free room name');
        brandNew=true;
      }
    }else if(attribution&&!client.acquisition){client=(await db.query(`update clients set acquisition=$2::jsonb where id=$1 and acquisition is null returning *`,[client.id,JSON.stringify(attribution)])).rows[0]||client}
    const user=(await db.query(`insert into users(client_id,email,role) values($1,$2,'client') on conflict(email) do update set client_id=excluded.client_id,role=excluded.role returning *`,[client.id,email])).rows[0];
    let project=(await db.query(`select * from projects where client_id=$1 and archived_at is null and status not in ('archive','archived') and name='Product development' limit 1`,[client.id])).rows[0];
    if(!project)project=(await db.query(`insert into projects(client_id,name,status,milestone) values($1,'Product development','active','Development — tech pack')
      on conflict(client_id,name) do update set status='active',updated_at=now() returning *`,[client.id])).rows[0];
    const dup=await recentDuplicateDraft(db,{clientId:client.id,title,photo:photos[0]});
    let product,pack,ai;
    if(dup){product={id:dup.product_id,title};pack={id:dup.pack_id};ai=dup.ai_status==='locked'?'locked':(dup.ai_status==='pending'||dup.ai_status==='done')?'pending':null}
    else{({product,pack}=await createClientDraft(db,{clientId:client.id,clientName:client.name,project,title,description:notes,userId:user.id,sketches,source:'photo'}));
      ai=aiEnabled()?(await gateNewPhotoDraft(db,{clientId:client.id,packId:pack.id})).ai:null}
    await db.query('commit');release(); // from here on this request needs the pool for its own queries: never hold a connection while asking for another
    if(!dup&&ai==='pending')setImmediate(()=>enrichPhotoDraft(pack.id).catch(e=>app.log.warn({err:e.message},'enrich failed')));
    // Only a room created in this request hands out a session: the email is unverified, and a known room must be entered with a code.
    // The same tap sent twice is answered from the draft the first one made (no second welcome email).
    let token=null;
    if(brandNew)token=await issueClientToken(user,client,email,{unverified:true}); // a lead's room was somebody's before this tap, so it takes a code like any known room
    else if(throttle(`code:${email}`,CODE_ASK)){const code=String(randomInt(100000,1000000));await pool.query('insert into login_codes(email,code_hash,expires_at) values($1,$2,now()+interval \'10 minutes\')',[email,hash(code)]);await sendCode(email,code).catch(e=>app.log.warn({err:e.message},'start: code email failed'))}
    const link=`${clientHubUrl}/tech-packs/${product.id}`;
    if(!dup)sendHubEmail({to:email,subject:`Your tech pack draft — ${product.title}`,html:hubEmailShell('Your tech pack draft is started',
      `<p>Hi${name?' '+emailEscape(name.split(' ')[0]):''},</p><p>${ai==='locked'?`Your photo is saved on a new tech pack draft for <strong>${emailEscape(product.title)}</strong>. Your first pack was on us; open this one to have the assistant draft it for $${(TECH_PACK_PRICE_CENTS/100).toFixed(0)}${MEMBERSHIP_URL?` or join the studio membership`:''} — or fill it in yourself, which is always free.`:`We turned your photo into the first page of a tech pack for <strong>${emailEscape(product.title)}</strong>. Add callouts, measurements, materials and colours whenever you like, then submit it and Future Basics will finish it with you.`}</p>${hubButton(link,'Open your tech pack')}<p style="color:#717177;font-size:13px">Sign in with this email address — we send a six-digit code, no password.</p>`)}).catch(e=>app.log.warn({err:e.message},'start: welcome email failed'));
    return reply.code(201).send({ok:true,token,needsCode:!token,email,product:{id:product.id,title:product.title},project:{id:project.id,name:project.name},client:{id:client.id,name:client.name},link,ai:ai||'off'});
  }catch(e){await db.query('rollback').catch(()=>{});throw e}finally{release()}
});
// Signed-in clients start tech packs from the hub: with photos the assistant drafts the pack (same path as /start),
// without photos they get the blank template. `project` is an existing project row or null to use/create "Product development".
// Photos arrive as data URLs. Anything over 4000 px or ~1.8 MB is shrunk to a 2000 px JPEG (the model API takes at most 5 MB and
// 8000 px per image, and the pack stores at most ~1.9 MB per picture): a big phone photo posted straight to the API
// used to be dropped without a word. Smaller pictures are stored exactly as sent. Returns { photos, bad } where bad is the 1-based position of a file nothing can open.
const PHOTO_RE=/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i;
async function preparePhotos(list){
  const raw=(Array.isArray(list)?list:[]).filter(x=>typeof x==='string'&&PHOTO_RE.test(x)).slice(0,4),photos=[];
  for(const [i,p] of raw.entries()){
    try{
      const buf=Buffer.from(PHOTO_RE.exec(p)[2].replace(/\s/g,''),'base64'),meta=await sharp(buf).metadata();
      if(!meta.width||!meta.height)return {photos:[],bad:i+1};
      if(Math.max(meta.width,meta.height)>4000||buf.length>1_800_000)photos.push(`data:image/jpeg;base64,${(await sharp(buf).rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:86}).toBuffer()).toString('base64')}`);
      else photos.push(p);
    }catch{return {photos:[],bad:i+1}}
  }
  return {photos,bad:0};
}
// A double-tap on Create, or a retry after a slow network, must not make a second draft (and with it a locked duplicate):
// the same title with the same photo, from the same room, inside three minutes is the same draft.
async function recentDuplicateDraft(db,{clientId,title,photo}){
  if(!photo)return null;
  const md5=createHash('md5').update(photo).digest('hex');
  return (await db.query(`select p.id product_id,tp.id pack_id,tp.ai_status from tech_packs tp join products p on p.id=tp.product_id
    where tp.client_id=$1 and tp.initiated_by='client' and tp.status='draft' and p.title=$2 and tp.created_at>now()-interval '3 minutes'
    and exists(select 1 from jsonb_array_elements(tp.data->'sketches') sk where md5(sk->>'image')=$3) order by tp.created_at desc limit 1`,[clientId,title,md5])).rows[0]||null;
}
async function startHubDraft(req,reply,{project,newProjectName}){
  const title=String(req.body?.title||'').trim().slice(0,200),productType=String(req.body?.productType||'').trim().slice(0,120),description=String(req.body?.description||'').trim().slice(0,3000);
  if(!title)return reply.code(400).send({error:'Give the product a name'});
  const prep=await preparePhotos(req.body?.photos);if(prep.bad)return reply.code(400).send({error:`Photo ${prep.bad} could not be opened — re-save it as a JPG or PNG and try again`});
  const photos=prep.photos;
  const sketches=photos.map((image,i)=>({id:`photo-${i+1}`,view:i===0?'front':'detail',label:i===0?'Reference photo':`Reference photo ${i+1}`,image,garmentWidthIn:null,callouts:[]}));
  const client=await pool.connect();
  try{
    await client.query('begin');
    if(!project){
      const name=String(newProjectName||'Product development').trim().slice(0,120)||'Product development';
      const c=(await client.query('select name from clients where id=$1',[req.auth.clientId])).rows[0];
      project=(await client.query(`insert into projects(client_id,name,status,milestone) values($1,$2,'active','Development — tech pack')
        on conflict(client_id,name) do update set status='active',archived_at=null,updated_at=now() returning *`,[req.auth.clientId,name])).rows[0];
      project.client_name=c?.name||'';
    }
    if(photos.length){
      const dup=await recentDuplicateDraft(client,{clientId:req.auth.clientId,title,photo:photos[0]});
      if(dup){await client.query('commit');const existing=await loadClientDraft(dup.product_id,req.auth.clientId);
        if(existing)return reply.code(201).send({...draftView(existing),ai:dup.ai_status==='locked'?'locked':(dup.ai_status==='pending'||dup.ai_status==='done')?'pending':'off',project:{id:existing.project_id,name:existing.project_name}})}
    }
    const {product,pack}=await createClientDraft(client,{clientId:req.auth.clientId,clientName:project.client_name,project,title,productType,description,userId:req.auth.sub,sketches,source:photos.length?'photo':'hub'});
    const gate=photos.length&&aiEnabled()?await gateNewPhotoDraft(client,{clientId:req.auth.clientId,packId:pack.id}):{ai:null,billing:null},ai=gate.ai;
    await client.query('commit');
    if(ai==='pending')setImmediate(()=>enrichPhotoDraft(pack.id).catch(e=>app.log.warn({err:e.message},'enrich failed')));
    return reply.code(201).send({...draftView({...pack,ai_status:ai,billing:gate.billing,title:product.title,product_type:product.product_type,project_id:project.id,client_name:project.client_name,project_name:project.name}),ai:ai||'off',project:{id:project.id,name:project.name}});
  }catch(e){await client.query('rollback');throw e}finally{client.release()}
}
app.post('/v1/projects/:id/tech-packs',{preHandler:authenticate,bodyLimit:16_000_000},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Sign in to your client hub to start a tech pack'});
  const project=(await pool.query(`select pr.*,c.name client_name from projects pr join clients c on c.id=pr.client_id
    where pr.id=$1 and pr.client_id=$2 and pr.archived_at is null and pr.status not in ('archive','archived')`,[req.params.id,req.auth.clientId])).rows[0];
  if(!project)return reply.code(404).send({error:'Project not found'});
  return startHubDraft(req,reply,{project});
});
// From the hub home: pick an existing project or name a new one.
app.post('/v1/tech-packs',{preHandler:authenticate,bodyLimit:16_000_000},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Sign in to your client hub to start a tech pack'});
  const projectId=String(req.body?.projectId||'').trim();let project=null;
  if(projectId&&!/^[0-9a-f-]{36}$/i.test(projectId))return reply.code(404).send({error:'Project not found'});
  if(projectId){project=(await pool.query(`select pr.*,c.name client_name from projects pr join clients c on c.id=pr.client_id
    where pr.id=$1 and pr.client_id=$2 and pr.archived_at is null and pr.status not in ('archive','archived')`,[projectId,req.auth.clientId])).rows[0];if(!project)return reply.code(404).send({error:'Project not found'})}
  return startHubDraft(req,reply,{project,newProjectName:req.body?.newProject});
});
app.get('/v1/products/:id/tech-pack/draft',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client')return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  const view=draftView(row);view.techPack.loop=await latestLoop(row.id);view.loopEnabled=LOOP_ON();return view;
});
app.put('/v1/products/:id/tech-pack/draft',{preHandler:authenticate,bodyLimit:40_000_000},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics — ask them to reopen it if you need changes'});
  // A save with no pack in it must never blank the draft (normalizeTechPack turns nothing into an empty template).
  const sent=req.body?.data;if(!sent||typeof sent!=='object'||Array.isArray(sent))return reply.code(400).send({error:'Nothing to save — reload the page and try again'});
  // A page opened before the assistant finished, or in another tab, holds an older pack: saving it would wipe what landed since.
  if(req.body.baseEtag&&packEtag(row)&&Math.abs(new Date(req.body.baseEtag).getTime()-new Date(packEtag(row)).getTime())>5)
    return reply.code(409).send({error:'This draft changed in another tab, or the assistant just finished it. Reload to see the latest — what you typed on this page was not saved.',code:'STALE'});
  const data=normalizeTechPack(sent);
  const updated=(await pool.query(`update tech_packs set data=$2,updated_at=now() where id=$1 returning *`,[row.id,data])).rows[0];
  if(data.style.styleName&&data.style.styleName!==row.title)await pool.query('update products set title=$2,updated_at=now() where id=$1',[row.product_id,data.style.styleName.slice(0,200)]);
  await syncCardQuietly(row.product_id,data);
  return draftView({...row,...updated,title:data.style.styleName||row.title});
});
// Colourway tiles on demand: the first photo recoloured to each colourway in the pack, saved as renderings.
async function colorwayTilesFor(data){const photo=data.sketches.find(s=>s.image)?.image;if(!photo)return {error:'Add a photo under Callouts first — the tiles are made from it'};if(!data.colorways.length)return {error:'Add at least one colourway with a swatch first'};
  const tiles=await renderColorways(photo,data.colorways);if(!tiles.length)return {error:'Could not separate the product from its background in this photo — try a photo on a plain backdrop'};return {renderings:mergeColorwayTiles(data.renderings,tiles),count:tiles.length}}
// Cut-out on demand: background removed from the first photo, placed as a view and the cover rendering, tiles re-made from it.
async function cutoutForPack(data){if(!cutoutEnabled())return {error:'Background removal is not set up on the service yet'};const photo=data.sketches.find(s=>s.image&&!/^cutout-/.test(s.id))?.image;if(!photo)return {error:'Add a photo under Callouts first'};
  const c=await cutoutFromPhoto(photo);if(!c.image)return {error:`The cut-out was not clean enough to use (${c.quality.reasons.join('; ')}) — try a photo with the product on a plainer backdrop`,quality:c.quality};
  placeCutout(data,c);if(data.colorways.length&&!cwOn()){try{data.renderings=[data.renderings[0],...mergeColorwayTiles(data.renderings.slice(1),await renderColorways(c.image,data.colorways))].slice(0,6)}catch{}}return {quality:c.quality,provider:c.provider}}
app.post('/v1/products/:id/tech-pack/draft/cutout',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics'});
  const data=normalizeTechPack(row.data),made=await cutoutForPack(data);if(made.error)return reply.code(400).send({error:made.error,quality:made.quality||null});
  const updated=(await pool.query(`update tech_packs set data=$2,updated_at=now() where id=$1 returning *`,[row.id,data])).rows[0];
  return {quality:made.quality,provider:made.provider,sketches:data.sketches,renderings:data.renderings,techPack:draftView({...row,...updated}).techPack};
});
app.post('/v1/admin/products/:id/tech-pack/cutout',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx)return reply.code(404).send({error:'Product not found'});if(!ctx.techPack)return reply.code(409).send({error:'Save the tech pack first'});
  const data=normalizeTechPack(ctx.techPack.data),made=await cutoutForPack(data);if(made.error)return reply.code(400).send({error:made.error,quality:made.quality||null});
  const row=(await pool.query(`update tech_packs set data=$2,updated_at=now() where id=$1 returning *`,[ctx.techPack.id,data])).rows[0];
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`Background removed from the reference photo for ${ctx.product.title}`,{techPackId:row.id,quality:made.quality,provider:made.provider}]).catch(()=>{});
  return {quality:made.quality,provider:made.provider,sketches:data.sketches,renderings:data.renderings,techPack:techPackPayload(row)};
});
// What the customer sees of the studio: the approved reference picture, the colourway run, the 3D model and how the assistants built the pack. Only what is finished and
// approved: a hero waiting for a person is not shown, and staff-only tools stay staff-only.
async function studioForClient(productId,clientId,{lite=false,card=false,preview=false}={}){
  const tp=(await pool.query('select id,product_id,initiated_by,published_at,version,status,submitted_at,data,published_data from tech_packs where product_id=$1 and client_id=$2',[productId,clientId])).rows[0];if(!tp)return null;
  // A customer sees their own drafts and what Future Basics has published. A staff draft that is not published yet is shown only to staff previewing the hub, and says so.
  const theirs=tp.initiated_by==='client'||Boolean(tp.published_at),staffDraft=!theirs;
  if(staffDraft&&!preview)return {visible:false};
  const heroRow=(await pool.query(`select * from tech_pack_heroes where tech_pack_id=$1 and status in ('approved','ready','generating') order by (status='approved') desc,created_at desc limit 1`,[tp.id])).rows[0];
  const small=async (buf,w)=>heroThumb(buf,w,80),dataBuf=u=>{const m=/^data:image\/[a-z+]+;base64,(.+)$/i.exec(String(u||''));return m?Buffer.from(m[1],'base64'):null};
  let hero=null;if(heroRow?.status==='approved'){try{hero={image:lite?null:await small(await heroBuffer(heroRow),card?420:900),score:heroRow.candidates?.[heroRow.chosen]?.total??null,approvedAt:heroRow.approved_at,auto:Boolean(heroRow.auto_approved)}}catch{}}
  const mrow=(await pool.query(`select * from tech_pack_models where tech_pack_id=$1 and status in ('running','done') order by created_at desc limit 1`,[tp.id])).rows[0],model=mrow?await modelView(mrow,{withThumb:!lite}):null;
  const colourways=await latestColourways(tp.id),loop=await latestLoop(tp.id),pack=normalizeTechPack(tp.published_data||tp.data);
  const working=Boolean(loop?.status==='running'||heroRow?.status==='generating'||colourways?.running||model?.status==='running');
  const queued=Boolean(!heroRow&&loop?.status==='done'&&process.env.HERO_AUTO!=='off'&&heroConfig().configured&&(await studioToday()).used>=STUDIO_DAILY_PACKS());
  let tiles=lite?undefined:pack.renderings.filter(r=>/^cw-/.test(String(r.id||''))&&r.image);
  if(card&&tiles){const out=[];for(const t of tiles){const b=dataBuf(t.image);let image=t.image;if(b){try{image=await small(b,320)}catch{}}out.push({id:t.id,name:t.name,image,parts:(t.parts||[]).slice(0,8)})}tiles=out}
  // what the pack says, for the product's own page: the card's fields fall back to it when nobody has typed them into the product
  const details={category:pack.style.category||'',material:pack.style.fabricSummary||'',description:pack.style.description||'',sizes:pack.sizes||[],styleNumber:pack.style.styleNumber||'',colourways:pack.colorways.map(c=>({name:c.name,code:c.code,swatch:c.swatch}))};
  const state=tp.published_at?{label:`Tech pack v${tp.version}`,note:`Issued ${new Date(tp.published_at).toLocaleDateString()} · open to review and approve`}:tp.status==='submitted'?{label:'Tech pack · submitted',note:'With Future Basics · v1 coming for your approval'}:staffDraft?{label:'Tech pack · staff draft',note:'Not shown to the client until it is published'}:{label:'Your tech pack draft',note:'Open to add detail, then submit'};
  return {visible:true,staffDraft,state,details,lite,working,queued,hero,tiles,heroPending:Boolean(heroRow&&heroRow.status==='ready'),colourways:colourways?{status:colourways.status,running:colourways.running,progress:colourways.progress,made:colourways.made}:null,
    model:model?{id:model.id,status:model.status,progress:model.progress,triangles:model.triangles,bytes:model.bytes,thumb:model.thumb,completedAt:model.completedAt}:null,
    loop:card?null:loop?{status:loop.status,startScore:loop.startScore,finalScore:loop.finalScore,outcome:loop.outcome,events:loop.events}:null,parts:pack.parts};
}
app.get('/v1/products/:id/tech-pack/studio',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Not found'});
  const v=await studioForClient(req.params.id,req.auth.clientId,{lite:req.query?.lite==='1',card:req.query?.view==='card',preview:Boolean(req.auth.preview)});if(!v||v.visible===false)return reply.code(404).send({error:'Tech pack not found'});return v;
});
// The 3D model's own files for the customer who owns the product (the shape and its preview; a download is the same file).
app.get('/v1/products/:id/tech-pack/model/:file',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||!UUID_RE.test(String(req.params.id))||!['stl','thumb'].includes(req.params.file))return reply.code(404).send({error:'Not found'});
  const m=(await pool.query(`select m.stl_file,m.thumb_file,p.title from tech_pack_models m join products p on p.id=m.product_id where m.product_id=$1 and m.client_id=$2 and m.status='done' order by m.created_at desc limit 1`,[req.params.id,req.auth.clientId])).rows[0];
  const file=req.params.file==='stl'?m?.stl_file:m?.thumb_file;if(!file)return reply.code(404).send({error:'Not found'});
  return req.params.file==='stl'?reply.type('model/stl').send(createReadStream(join(meshDir(),file))):reply.type('image/jpeg').send(createReadStream(join(meshDir(),file)));
});
app.post('/v1/products/:id/tech-pack/draft/colorways',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'This tech pack has been submitted to Future Basics'});
  if(cwOn()){ // by labelled part, in the background: the page asks again until it is done
    const r=await startColourways(row,{actor:req.auth.sub,trigger:'client'});
    if(r.noColourways)return reply.code(400).send({error:'Add at least one colourway with a colour first'});
    if(r.noPhoto)return reply.code(400).send({error:'Add a photo under Callouts first: the pictures are drawn from it'});
    if(r.limited)return reply.code(429).send({error:r.limited});
    if(r.id&&!r.already)setImmediate(()=>runColourways(r.id));
    return reply.code(202).send({started:true,id:r.id});
  }
  const data=normalizeTechPack(row.data),made=await colorwayTilesFor(data);if(made.error)return reply.code(400).send({error:made.error});
  data.renderings=made.renderings;const updated=(await pool.query(`update tech_packs set data=$2,updated_at=now() where id=$1 returning *`,[row.id,data])).rows[0];
  return {count:made.count,renderings:data.renderings,techPack:draftView({...row,...updated}).techPack};
});
app.get('/v1/products/:id/tech-pack/draft/colourways',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are edited from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  return {run:await latestColourways(row.id),renderings:normalizeTechPack(row.data).renderings,parts:normalizeTechPack(row.data).parts};
});
app.post('/v1/products/:id/tech-pack/submit',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Client drafts are submitted from the client hub'});
  const row=await loadClientDraft(req.params.id,req.auth.clientId);if(!row)return reply.code(404).send({error:'Tech pack draft not found'});
  if(row.status!=='draft')return reply.code(409).send({error:'Already submitted to Future Basics'});
  // nothing reaches the review queue unpaid after the first pack: a locked pack (or a hand-made one past the free pack) must be unlocked first
  if(billingOn()){
    let ent=await techPackEntitlement(row.client_id,row.id);
    if(ent==='locked'&&await techPackPaymentLanded(row))ent='single';
    if(ent==='locked'){if(row.ai_status!=='locked')await pool.query(`update tech_packs set ai_status='locked' where id=$1 and (ai_status is null or ai_status='failed')`,[row.id]);
      return reply.code(402).send({error:'Unlock this tech pack before submitting it — your first pack was on us',aiStatus:'locked',pricing:techPackPricing(),checkoutUrl:row.pay_invoice_url||null})}
    if(row.ai_status==='locked')await unlockTechPack(row); // paid or covered meanwhile: let the assistant read it as it goes to review
    else if(!row.billing)await pool.query(`update tech_packs set billing=$2 where id=$1`,[row.id,ent]);
  }
  const note=String(req.body?.note||'').trim().slice(0,1000);
  const updated=(await pool.query(`update tech_packs set status='submitted',submitted_at=now(),submitted_by=$2,updated_at=now() where id=$1 returning *`,[row.id,req.auth.sub])).rows[0];
  await recordDraftEdits(row.id,'submitted');
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,
    [row.client_id,row.product_id,req.auth.sub,`${row.client_name} submitted their tech pack for ${row.title} to Future Basics`,{techPackId:row.id,note}]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack',$2,'product',$3)`,[row.client_id,`${row.client_name} submitted a tech pack for ${row.title} — review and publish v1${note?' · "'+note.slice(0,120)+'"':''}`,row.product_id]);
  await flow(row.product_id,'pack-submitted',{actorId:req.auth.sub});
  await notifyStaff(`${row.client_name} submitted a tech pack — ${row.title}`,`<p><strong>${emailEscape(row.client_name)}</strong> submitted their tech pack for <strong>${emailEscape(row.title)}</strong>. Review it, finish it and publish v1 for their approval.</p>${note?`<p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(note)}</p>`:''}${hubButton(`${workHubUrl}/tech-packs/${row.product_id}`,'Open the tech pack')}`);
  startSpecCheck({...row,...updated},{trigger:'submit'}).catch(e=>app.log.warn({err:e.message},'spec check not started')); // staff see the result in the Check tab
  return draftView({...row,...updated});
});
// Future Basics can hand a submitted draft back to the client for more work.
app.post('/v1/admin/products/:id/tech-pack/reopen',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx||!ctx.techPack)return reply.code(404).send({error:'Tech pack not found'});
  if(ctx.techPack.initiated_by!=='client'||ctx.techPack.published_at)return reply.code(409).send({error:'Only an unpublished client draft can be reopened'});
  const row=(await pool.query(`update tech_packs set status='draft',updated_at=now() where id=$1 returning *`,[ctx.techPack.id])).rows[0];
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`Tech pack draft for ${ctx.product.title} reopened for ${ctx.product.client_name}`,{techPackId:row.id}]);
  await flow(ctx.product.id,'pack-returned',{actorId:req.auth.sub});
  return {techPack:techPackPayload(row)};
});
// Client approval: the brand signs first, from their hub. It releases the pack to Future Basics and then the factory.
const PUBLISHED_VIEW_SQL=`select tp.product_id,tp.version,tp.published_data,tp.published_at,tp.revisions,tp.verification,tp.locked_at,tp.translations,p.title,p.product_type,p.shopify_image_url,p.shopify_image_alt,c.name client_name,pr.name project_name
  from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id`;
app.post('/v1/products/:id/tech-pack/approve',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client')return reply.code(403).send({error:'Only the client approves their tech pack'});
  const name=String(req.body?.name||'').trim().slice(0,120);if(!name)return reply.code(400).send({error:'Type your full name to approve'});
  const row=(await pool.query(`select tp.*,p.title from tech_packs tp join products p on p.id=tp.product_id where tp.product_id=$1 and tp.client_id=$2 and tp.published_at is not null`,[req.params.id,req.auth.clientId])).rows[0];
  if(!row)return reply.code(404).send({error:'Tech pack not found'});
  if(normalizeVerification(row.verification,row.version).clientSign)return reply.code(409).send({error:`Version ${row.version} is already approved`});
  const updated=await updateVerification(row.id,row.version,v=>{v.clientSign={name,at:new Date().toISOString(),by:req.auth.email||''};v.changes=null});
  if(!updated)return reply.code(409).send({error:'A new version was published — reload to review it'});
  recordDraftEdits(row.id,'approved').catch(()=>{});
  await flow(row.product_id,'pack-approved',{actorId:req.auth.sub,note:`v${row.version}`});
  await notifyStaff(`Tech pack v${row.version} approved — ${row.title}`,`<p>${emailEscape(name)} approved tech pack v${row.version} for <strong>${emailEscape(row.title)}</strong>. Next: issue the quote.</p>${hubButton(`${workHubUrl}/tech-packs/${row.product_id}`,'Open the tech pack')}`);
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[row.client_id,row.product_id,req.auth.sub,`Tech pack v${row.version} approved by ${name}`,{techPackId:row.id,version:row.version}]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack',$2,'product',$3)`,[row.client_id,`${name} approved tech pack v${row.version} for ${row.title} — ready for your signature`,row.product_id]);
  return publishedTechPackView((await pool.query(`${PUBLISHED_VIEW_SQL} where tp.id=$1`,[row.id])).rows[0],{audience:'client'});
});
// The client asks for changes to a published version instead of approving it. The note goes to Future Basics (console notice and
// the project thread); the next publish is a new version, which the client approves again.
app.post('/v1/products/:id/tech-pack/changes',{preHandler:authenticate},async(req,reply)=>{
  if(req.auth.role!=='client'||req.auth.preview)return reply.code(403).send({error:'Only the client asks for changes to their tech pack'});
  const notes=String(req.body?.notes||'').trim().slice(0,2000);if(notes.length<3)return reply.code(400).send({error:'Say what should change'});
  const row=(await pool.query(`select tp.*,p.title,p.project_id,c.name client_name from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id
    where tp.product_id=$1 and tp.client_id=$2 and tp.published_at is not null`,[req.params.id,req.auth.clientId])).rows[0];
  if(!row)return reply.code(404).send({error:'Tech pack not found'});
  if(normalizeVerification(row.verification,row.version).clientSign)return reply.code(409).send({error:`Version ${row.version} is already approved — message Future Basics in the project thread to change it`});
  const updated=await updateVerification(row.id,row.version,v=>{v.changes={notes,at:new Date().toISOString(),by:req.auth.email||''}});
  if(!updated)return reply.code(409).send({error:'A new version was published — reload to review it'});
  await flow(row.product_id,'pack-changes-requested',{actorId:req.auth.sub,note:`v${row.version}`});
  const text=`Changes requested on tech pack v${row.version} for ${row.title}: ${notes}`;
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[row.client_id,row.product_id,req.auth.sub,text,{techPackId:row.id,version:row.version}]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack',$2,'product',$3)`,[row.client_id,`${row.client_name} asked for changes to tech pack v${row.version} for ${row.title} — edit and publish v${row.version+1}`,row.product_id]);
  if(row.project_id)await pool.query(`insert into project_messages(project_id,client_id,author_id,author_role,body) values($1,$2,$3,'client',$4)`,[row.project_id,row.client_id,req.auth.sub,text]);
  await notifyStaff(`${row.client_name} asked for changes to ${row.title} (v${row.version})`,`<p><strong>${emailEscape(row.client_name)}</strong> asked for changes to tech pack v${row.version} for <strong>${emailEscape(row.title)}</strong>:</p><p style="padding:14px 16px;border-left:3px solid #4bff9a;background:#f5f5f2;white-space:pre-wrap">${emailEscape(notes)}</p>${hubButton(`${workHubUrl}/tech-packs/${row.product_id}`,'Open the tech pack')}`);
  return publishedTechPackView((await pool.query(`${PUBLISHED_VIEW_SQL} where tp.id=$1`,[row.id])).rows[0],{audience:'client'});
});
// Factory link: resolves a token to the published pack, or the reason it cannot be opened.
// A factory sees the latest version the client approved. When a newer version is still waiting on the client, the link keeps showing
// the approved one, read-only (held: true), so a factory never acts on a version the client has not signed.
async function loadShareByToken(token){
  const found=await loadShareRow(token);if(found.error)return found;
  const row=found.row;
  if(row.share_kind==='quote')return {row:{...row,quote:true}};
  if(row.client_slug==='future-basics'||normalizeVerification(row.verification,row.version).clientSign)return {row};
  const approved=(await pool.query(`select version,data,verification,published_at,locked_at from tech_pack_versions where tech_pack_id=$1 and version<$2 and verification->'clientSign'->>'name' is not null order by version desc limit 1`,[row.id,row.version])).rows[0];
  if(!approved)return {error:{code:409,message:`Version ${row.version} of this tech pack is waiting for ${row.client_name}'s approval. Future Basics will send the link again once it is approved.`}};
  return {row:{...row,version:approved.version,published_data:approved.data,verification:approved.verification,published_at:approved.published_at,locked_at:approved.locked_at,held:true,newerVersion:row.version}};
}
async function loadShareRow(token){
  const row=(await pool.query(`select s.id share_id,s.label share_label,s.kind share_kind,s.include_model share_model,s.email share_email,s.expires_at,s.revoked_at,tp.id,tp.product_id,tp.client_id,tp.version,tp.published_data,tp.published_at,tp.revisions,tp.verification,tp.locked_at,tp.translations,
    p.title,p.product_type,p.shopify_image_url,p.shopify_image_alt,c.name client_name,c.slug client_slug,pr.name project_name
    from tech_pack_shares s join tech_packs tp on tp.id=s.tech_pack_id join products p on p.id=tp.product_id join clients c on c.id=p.client_id left join projects pr on pr.id=p.project_id
    where s.token_hash=$1`,[hash(String(token||''))])).rows[0];
  if(!row||!row.published_at)return {error:{code:404,message:'This tech pack link is not valid'}};
  if(row.revoked_at)return {error:{code:410,message:'This tech pack link has been revoked'}};
  if(row.expires_at&&new Date(row.expires_at)<new Date())return {error:{code:410,message:'This tech pack link has expired'}};
  return {row};
}
app.get('/v1/tp/:token',async(req,reply)=>{
  const {row,error}=await loadShareByToken(req.params.token);if(error)return reply.code(error.code).send({error:error.message});
  await pool.query('update tech_pack_shares set view_count=view_count+1,last_viewed_at=now() where id=$1',[row.share_id]);
  if(row.quote){ // a quotation link: the pack, without the client's name, signatures or the staff's notes, and the factory's own quote if it already sent one
    const clean={...row,client_name:'',project_name:null,verification:emptyVerification(row.version),revisions:[],published_data:{...normalizeTechPack(row.published_data),style:{...normalizeTechPack(row.published_data).style,designer:''}}};
    const mine=(await pool.query('select * from factory_quotes where share_id=$1',[row.share_id])).rows[0];
    return {...publishedTechPackView(clean,{audience:'factory',shareLabel:row.share_label,translations:translationsForPack(row,row.published_data)}),quoteMode:true,quote:mine?quoteRow(mine):null,quoteDefaults:{company:row.share_label,email:row.share_email||''},model:await factoryModel(row)};
  }
  const view=publishedTechPackView(row,{audience:'factory',shareLabel:row.share_label,translations:translationsForPack(row,row.published_data)});
  const withModel={...view,model:await factoryModel(row)};
  return row.held?{...withModel,held:true,notice:`This is version ${row.version}, the one ${row.client_name} approved. Version ${row.newerVersion} is waiting for their approval, so this page is read-only until then.`}:withModel;
});
// The 3D shape reaches a factory only through a link staff switched it on for: a preview and a size, and the file itself through the same link.
async function factoryModel(row){
  if(!row.share_model)return null;
  const m=(await pool.query(`select * from tech_pack_models where tech_pack_id=$1 and status='done' and stl_file is not null order by created_at desc limit 1`,[row.id])).rows[0];if(!m)return null;
  const v=await modelView(m,{withThumb:true});return {id:v.id,triangles:v.triangles,bytes:v.bytes,thumb:v.thumb,completedAt:v.completedAt};
}
app.get('/v1/tp/:token/model/:file',async(req,reply)=>{
  if(!['stl','thumb'].includes(req.params.file))return reply.code(404).send({error:'Not found'});
  const {row,error}=await loadShareByToken(req.params.token);if(error)return reply.code(error.code).send({error:error.message});
  if(!row.share_model)return reply.code(404).send({error:'The 3D shape is not part of this link'});
  const m=(await pool.query(`select stl_file,thumb_file from tech_pack_models where tech_pack_id=$1 and status='done' order by created_at desc limit 1`,[row.id])).rows[0];
  const file=req.params.file==='stl'?m?.stl_file:m?.thumb_file;if(!file)return reply.code(404).send({error:'Not found'});
  const safe=String(row.title||'product').replace(/[^\w]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'product';
  return req.params.file==='stl'?reply.type('model/stl').header('Content-Disposition',`attachment; filename="${safe}-3d.stl"`).send(createReadStream(join(meshDir(),file))):reply.type('image/jpeg').send(createReadStream(join(meshDir(),file)));
});
// The factory works the acknowledgement chain through its link: tick callouts, then countersign.
app.post('/v1/tp/:token/ack',async(req,reply)=>{
  const {row,error}=await loadShareByToken(req.params.token);if(error)return reply.code(error.code).send({error:error.message});
  if(row.quote)return reply.code(403).send({error:'This link is for quotations only: send your quote from the Quote tab'});
  if(row.held)return reply.code(409).send({error:`A newer version is waiting for ${row.client_name}'s approval — nothing can be acknowledged until then`});
  if(row.locked_at)return reply.code(409).send({error:'This tech pack is signed and locked'});
  const key=String(req.body?.key||'').slice(0,60),acknowledged=req.body?.acknowledged!==false;
  const known=techPackReadiness(normalizeTechPack(row.published_data),normalizeVerification(row.verification,row.version)).callouts.some(c=>c.key===key);
  if(!known)return reply.code(400).send({error:'Unknown callout'});
  const updated=await updateVerification(row.id,row.version,v=>{if(acknowledged)v.acks[key]={by:row.share_label,at:new Date().toISOString()};else delete v.acks[key]});
  if(!updated)return reply.code(409).send({error:'A new version of this tech pack was published — reload to see it'});
  return publishedTechPackView({...row,verification:updated.verification,locked_at:updated.locked_at},{audience:'factory',shareLabel:row.share_label});
});
const quoteRow=q=>({byStaff:Boolean(q.entered_by),id:q.id,shareId:q.share_id,version:q.version,company:q.company,contactName:q.contact_name,email:q.email,wechat:q.wechat,phone:q.phone,currency:q.currency,tiers:q.tiers||[],moq:q.moq,sampleCost:q.sample_cost==null?null:Number(q.sample_cost),sampleDays:q.sample_days,leadDays:q.lead_days,tooling:q.tooling==null?null:Number(q.tooling),incoterm:q.incoterm,paymentTerms:q.payment_terms,validUntil:q.valid_until?String(q.valid_until).slice(0,10):null,notes:q.notes,revisions:(q.history||[]).length,createdAt:q.created_at,updatedAt:q.updated_at});
// A quotation is saved the same way whoever it comes from: the factory through its link, or Future Basics typing in what the factory sent another way (staff = {id,email}).
async function saveFactoryQuote(row,q,staff=null){
  const prev=(await pool.query('select * from factory_quotes where share_id=$1',[row.share_id])).rows[0];
  let saved;
  if(prev){
    const history=[...(prev.history||[]),{at:prev.updated_at,version:prev.version,currency:prev.currency,tiers:prev.tiers,moq:prev.moq,sample_cost:prev.sample_cost,lead_days:prev.lead_days,tooling:prev.tooling}].slice(-20);
    saved=(await pool.query(`update factory_quotes set version=$2,company=$3,contact_name=$4,email=$5,wechat=$6,phone=$7,currency=$8,tiers=$9,moq=$10,sample_cost=$11,sample_days=$12,lead_days=$13,tooling=$14,incoterm=$15,payment_terms=$16,valid_until=$17,notes=$18,history=$19,updated_at=now() where id=$1 returning *`,
      [prev.id,row.version,q.company||row.share_label,q.contactName,q.email,q.wechat,q.phone,q.currency,JSON.stringify(q.tiers),q.moq,q.sampleCost,q.sampleDays,q.leadDays,q.tooling,q.incoterm,q.paymentTerms,q.validUntil,q.notes,JSON.stringify(history)])).rows[0];
  }else saved=(await pool.query(`insert into factory_quotes(share_id,tech_pack_id,version,company,contact_name,email,wechat,phone,currency,tiers,moq,sample_cost,sample_days,lead_days,tooling,incoterm,payment_terms,valid_until,notes)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,[row.share_id,row.id,row.version,q.company||row.share_label,q.contactName,q.email,q.wechat,q.phone,q.currency,JSON.stringify(q.tiers),q.moq,q.sampleCost,q.sampleDays,q.leadDays,q.tooling,q.incoterm,q.paymentTerms,q.validUntil,q.notes])).rows[0];
  saved=(await pool.query('update factory_quotes set entered_by=$2 where id=$1 returning *',[saved.id,staff?.id||null])).rows[0];
  const first=q.tiers[0],summary=`${staff?`Future Basics recorded ${row.share_label}'s ${prev?'revised quote':'quote'}`:`${row.share_label} ${prev?'revised its quote':'quoted'}`} for ${row.title}: ${q.currency} ${first.unit} at ${first.qty}${q.moq?`, MOQ ${q.moq}`:''}${q.leadDays?`, ${q.leadDays} days`:''}`;
  await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,[row.client_id,row.product_id,summary,{techPackId:row.id,quoteId:saved.id,shareId:row.share_id}]).catch(()=>{});
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'factory-quote',$2,'product',$3)`,[row.client_id,summary,row.product_id]).catch(()=>{});
  if(!staff)await notifyStaff(`${prev?'Revised quote':'New quote'}: ${row.share_label} · ${row.title}`,`<p><strong>${emailEscape(row.share_label)}</strong> ${prev?'revised its quotation':'sent a quotation'} for <strong>${emailEscape(row.title)}</strong>.</p><p>${emailEscape(q.currency)} ${first.unit} at ${first.qty} units${q.moq?` · MOQ ${q.moq}`:''}${q.leadDays?` · ${q.leadDays} days`:''}</p><p>Compare it with the others in the tech pack's Sign tab.</p>`).catch(()=>{});
  return {saved,prev};
}
// A factory sends (or revises) its quotation through its link: free, no account. Staff are told; earlier versions of the same factory's quote are kept.
app.post('/v1/tp/:token/quote',async(req,reply)=>{
  if(!throttle(`quote:${req.params.token}`,{limit:30,windowMs:3600_000}))return reply.code(429).send({error:'Too many sends from this link. Please try again in an hour.'});
  const {row,error}=await loadShareByToken(req.params.token);if(error)return reply.code(error.code).send({error:error.message});
  if(!row.quote)return reply.code(403).send({error:'This link is not for quotations'});
  const c=cleanQuote(req.body||{});if(c.error)return reply.code(400).send({error:c.error});const q=c.q;
  const {saved,prev}=await saveFactoryQuote(row,q);
  return reply.code(prev?200:201).send({quote:quoteRow(saved)});
});
// ---- Future Basics acts for a factory that does not use its page, so a client's project never waits on it ----
async function loadShareForStaff(id){
  if(!UUID_RE.test(String(id)))return null;
  return (await pool.query(`select s.id share_id,s.label share_label,s.kind,s.revoked_at,s.waived_at,tp.id,tp.version,tp.client_id,tp.product_id,p.title from tech_pack_shares s join tech_packs tp on tp.id=s.tech_pack_id join products p on p.id=tp.product_id where s.id=$1`,[id])).rows[0]||null;
}
// Type in the quotation a factory sent another way (WeChat, email, at the booth). It is marked as entered by Future Basics and says how it arrived.
app.post('/v1/admin/tech-pack-shares/:id/quote',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=await loadShareForStaff(req.params.id);if(!row)return reply.code(404).send({error:'Quotation link not found'});
  if(row.kind!=='quote')return reply.code(409).send({error:'This link is not for quotations'});
  if(row.revoked_at)return reply.code(409).send({error:'This link was revoked: make a new one first'});
  const how=String(req.body?.how||'').replace(/\s+/g,' ').trim().slice(0,200);if(!how)return reply.code(400).send({error:'Say how you got it, e.g. "WeChat, 10 Oct", so the record shows where it came from'});
  const c=cleanQuote(req.body||{},{requireContact:false});if(c.error)return reply.code(400).send({error:c.error});
  const q={...c.q,notes:[c.q.notes,`Entered by Future Basics from: ${how}`].filter(Boolean).join('\n').slice(0,1500)};
  const {saved,prev}=await saveFactoryQuote(row,q,{id:req.auth.sub,email:req.auth.email||''});
  return reply.code(prev?200:201).send({quote:quoteRow(saved)});
});
// Stop waiting for a quote that is not coming (or wait again): the factory's link keeps working, but it no longer holds the ball.
app.post('/v1/admin/tech-pack-shares/:id/waive',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const row=await loadShareForStaff(req.params.id);if(!row)return reply.code(404).send({error:'Link not found'});
  const on=req.body?.waived!==false;
  await pool.query('update tech_pack_shares set waived_at=case when $2 then coalesce(waived_at,now()) else null end where id=$1',[row.share_id,on]);
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'tech-pack',$4)`,[row.client_id,row.product_id,req.auth.sub,on?`Stopped waiting for ${row.share_label}'s quote`:`Waiting for ${row.share_label}'s quote again`]).catch(()=>{});
  return {waived:on};
});
// Acknowledge the callouts, and countersign, on the factory's behalf. Each says who did it and how the factory confirmed.
async function staffFactoryCtx(req,reply){
  const ctx=await loadAdminTechPack(req.params.id);if(!ctx){reply.code(404).send({error:'Product not found'});return null}
  if(!ctx.techPack?.published_at){reply.code(409).send({error:'Publish the tech pack first'});return null}
  if(ctx.techPack.locked_at){reply.code(409).send({error:'This tech pack is signed and locked'});return null}
  return ctx;
}
const forFactory=async(ctx,body)=>String(body?.name||'').trim().slice(0,120)||(await assignmentView(ctx))?.name||'the factory';
app.post('/v1/admin/products/:id/tech-pack/factory-ack',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await staffFactoryCtx(req,reply);if(!ctx)return;
  const who=`Future Basics for ${await forFactory(ctx,req.body)}`,r=techPackReadiness(normalizeTechPack(ctx.techPack.published_data),normalizeVerification(ctx.techPack.verification,ctx.techPack.version));
  if(!r.pendingCalloutKeys.length)return reply.code(409).send({error:'Every callout is already acknowledged'});
  const n=r.pendingCalloutKeys.length,updated=await updateVerification(ctx.techPack.id,ctx.techPack.version,v=>{for(const k of r.pendingCalloutKeys)v.acks[k]={by:who,at:new Date().toISOString()}});
  if(!updated)return reply.code(409).send({error:'The tech pack changed: reload and try again'});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary) values($1,$2,$3,'tech-pack',$4)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`${n} callout${n===1?'':'s'} acknowledged by Future Basics for ${await forFactory(ctx,req.body)}`]).catch(()=>{});
  return {acknowledged:n,techPack:techPackPayload(updated)};
});
app.post('/v1/admin/products/:id/tech-pack/factory-sign',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const ctx=await staffFactoryCtx(req,reply);if(!ctx)return;
  const name=String(req.body?.name||'').trim().slice(0,120),how=String(req.body?.how||'').replace(/\s+/g,' ').trim().slice(0,200);
  if(!name)return reply.code(400).send({error:'Type the name of the factory or the person who confirmed'});
  if(!how)return reply.code(400).send({error:'Say how they confirmed, e.g. "WeChat, 10 Oct", so the record shows where it came from'});
  const r=techPackReadiness(normalizeTechPack(ctx.techPack.published_data),normalizeVerification(ctx.techPack.verification,ctx.techPack.version));
  if(r.factorySign)return reply.code(409).send({error:`Version ${ctx.techPack.version} is already countersigned by ${r.factorySign.name}`});
  if(!r.brandSign)return reply.code(409).send({error:'Future Basics signs the tech pack before the factory countersigns'});
  if(r.pendingCalloutKeys.length&&req.body?.ackAll!==true)return reply.code(409).send({error:`${r.pendingCalloutKeys.length} callout${r.pendingCalloutKeys.length===1?' is':'s are'} not acknowledged yet: tick "acknowledge every callout for them" to do both`});
  const at=new Date().toISOString(),updated=await updateVerification(ctx.techPack.id,ctx.techPack.version,v=>{
    for(const k of r.pendingCalloutKeys)v.acks[k]={by:`Future Basics for ${name}`,at};
    v.factorySign={name,at,by:`Future Basics (${req.auth.email||'staff'}) for ${name}: ${how}`};
  });
  if(!updated)return reply.code(409).send({error:'The tech pack changed: reload and try again'});
  recordDraftEdits(ctx.techPack.id,'countersigned').catch(()=>{});
  if(updated.locked_at)await flow(ctx.product.id,'pack-locked',{actorId:req.auth.sub,note:`v${ctx.techPack.version} countersigned for ${name} by Future Basics (${how})`});
  await pool.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'tech-pack',$4,$5)`,[ctx.product.client_id,ctx.product.id,req.auth.sub,`Tech pack v${ctx.techPack.version} countersigned for ${name} by Future Basics (${how})${updated.locked_at?' — locked for production':''}`,{techPackId:ctx.techPack.id,version:ctx.techPack.version,locked:Boolean(updated.locked_at),onBehalf:true}]).catch(()=>{});
  return {locked:Boolean(updated.locked_at),factorySign:normalizeVerification(updated.verification,updated.version).factorySign,techPack:techPackPayload(updated)};
});
// Staff: the links sent for quotation, and what came back, side by side at one quantity.
app.get('/v1/admin/products/:id/tech-pack/quotes',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  if(!UUID_RE.test(String(req.params.id)))return reply.code(404).send({error:'Product not found'});
  const tp=(await pool.query('select id,version from tech_packs where product_id=$1',[req.params.id])).rows[0];if(!tp)return reply.code(404).send({error:'Tech pack not found'});
  const links=(await pool.query(`select s.*,q.id quote_id from tech_pack_shares s left join factory_quotes q on q.share_id=s.id where s.tech_pack_id=$1 and s.kind='quote' order by s.created_at desc`,[tp.id])).rows;
  const quotes=(await pool.query('select q.*,s.label share_label from factory_quotes q join tech_pack_shares s on s.id=q.share_id where q.tech_pack_id=$1 order by q.updated_at desc',[tp.id])).rows.map(q=>({...quoteRow(q),label:q.share_label}));
  const qty=Math.max(1,Math.round(Number(req.query?.qty))||defaultCompareQty(quotes));
  return {version:tp.version,qty,links:links.map(l=>({...shareRow(l),quoted:Boolean(l.quote_id)})),quotes,compare:compareQuotes(quotes,qty)};
});
app.post('/v1/tp/:token/sign',async(req,reply)=>{
  const {row,error}=await loadShareByToken(req.params.token);if(error)return reply.code(error.code).send({error:error.message});
  if(row.quote)return reply.code(403).send({error:'This link is for quotations only: send your quote from the Quote tab'});
  if(row.held)return reply.code(409).send({error:`A newer version is waiting for ${row.client_name}'s approval — countersign it once it is approved`});
  if(row.locked_at)return reply.code(409).send({error:'This tech pack is already signed and locked'});
  const name=String(req.body?.name||'').trim().slice(0,120);if(!name)return reply.code(400).send({error:'Type your full name to countersign'});
  const readiness=techPackReadiness(normalizeTechPack(row.published_data),normalizeVerification(row.verification,row.version));
  if(readiness.factorySign)return reply.code(409).send({error:`Version ${row.version} is already countersigned by ${readiness.factorySign.name}`});
  if(!readiness.brandSign)return reply.code(409).send({error:'Future Basics signs the tech pack before the factory countersigns'});
  if(readiness.pendingCalloutKeys.length)return reply.code(409).send({error:`Acknowledge every callout before countersigning (${readiness.pendingCalloutKeys.length} pending)`});
  const updated=await updateVerification(row.id,row.version,v=>{v.factorySign={name,at:new Date().toISOString(),by:row.share_label}});
  if(!updated)return reply.code(409).send({error:'A new version of this tech pack was published — reload to see it'});
  recordDraftEdits(row.id,'countersigned').catch(()=>{});
  if(updated.locked_at)await flow(row.product_id,'pack-locked',{note:`v${row.version} countersigned by ${row.share_label}`});
  await notifyStaff(`${row.share_label} countersigned ${row.title} v${row.version}`,`<p><strong>${emailEscape(row.share_label)}</strong> countersigned tech pack v${row.version} for <strong>${emailEscape(row.title)}</strong>${updated.locked_at?'. Every signature is in and the version is locked: the factory can start the sample.':'.'}</p>${hubButton(`${workHubUrl}/tech-packs/${row.product_id}`,'Open the tech pack')}`);
  await pool.query(`insert into activities(client_id,product_id,type,summary,metadata) values($1,$2,'tech-pack',$3,$4)`,
    [row.client_id,row.product_id,`Tech pack v${row.version} countersigned by ${row.share_label} (${name})${updated.locked_at?' — locked for production':''}`,{techPackId:row.id,version:row.version,locked:Boolean(updated.locked_at)}]);
  await pool.query(`insert into notifications(client_id,type,title,entity_type,entity_id) values($1,'tech-pack',$2,'product',$3)`,
    [row.client_id,`${row.share_label} countersigned tech pack v${row.version} for ${row.title}`,row.product_id]);
  return publishedTechPackView({...row,verification:updated.verification,locked_at:updated.locked_at},{audience:'factory',shareLabel:row.share_label});
});


// ---- Consignment / sell-to-us: public submissions with photos, then an offer → counter → accept negotiation ----
const consignNotificationEmail=process.env.CONSIGN_NOTIFICATION_EMAIL||intakeNotificationEmail;
const consignTicketUrl=(process.env.CONSIGN_TICKET_URL||'').replace(/\/$/,'');
const consignFromEmail=process.env.CONSIGN_FROM_EMAIL||process.env.AUTH_FROM_EMAIL||'Common Ground <hub@thefuturebasics.com>';
const imageExtensions=new Set(['.png','.jpg','.jpeg','.webp','.heic','.heif','.gif']);
const consignTicketLink=token=>consignTicketUrl?`${consignTicketUrl}?t=${encodeURIComponent(token)}`:null;
const consignImageUrl=req=>image=>`${req.protocol}://${req.headers.host}/v1/public/consignment-images/${image.id}`;
async function sendConsignEmail({to,subject,html,replyTo}){
  if(!process.env.RESEND_API_KEY){app.log.warn({to,subject},'RESEND_API_KEY missing; consignment email not sent');return false}
  const response=await trackedFetch('resend','https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:consignFromEmail,to:[to],reply_to:replyTo||undefined,subject,html})});
  if(!response.ok)throw new Error(`Consignment email delivery failed: ${response.status}`);return true;
}
const consignEmailShell=(title,body)=>`<div style="font-family:Arial,sans-serif;color:#141414;max-width:640px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase">Common Ground · Trade-in counter</p><h1 style="font-size:22px">${emailEscape(title)}</h1>${body}</div>`;
async function loadConsignment(where,value){
  const row=(await pool.query(`select * from consignments where ${where}=$1`,[value])).rows[0];if(!row)return null;
  const [images,offers]=await Promise.all([
    pool.query('select * from consignment_images where consignment_id=$1 order by created_at',[row.id]),
    pool.query('select * from consignment_offers where consignment_id=$1 order by created_at',[row.id])]);
  return {row,images:images.rows,offers:offers.rows};
}
async function applyConsignmentMove(row,offers,move){
  const next=nextOfferState(row,offers,move);
  const db=await pool.connect();
  try{
    await db.query('begin');
    if(next.closeOpen)await db.query('update consignment_offers set status=$2 where id=$1',[next.closeOpen.id,next.closeOpen.status]);
    await db.query('insert into consignment_offers(consignment_id,by,kind,amount_cents,note,status) values($1,$2,$3,$4,$5,$6)',[row.id,next.offer.by,next.offer.kind,next.offer.amount_cents,next.offer.note,next.offer.status]);
    await db.query('update consignments set status=$2,agreed_cents=$3,updated_at=now() where id=$1',[row.id,next.patch.status,next.patch.agreed_cents]);
    await db.query('commit');
  }catch(error){await db.query('rollback').catch(()=>{});throw error}finally{db.release()}
  return next;
}
async function notifyConsignmentMove(row,next,move){
  const link=consignTicketLink(row.token),amount=next.offer.amount_cents?formatCents(next.offer.amount_cents):'';
  try{
    if(move.by==='store'){
      const verb={offer:`made you an offer of ${amount}`,counter:`countered at ${amount}`,accept:`accepted your counter of ${amount}`,decline:'passed on this one'}[move.action];
      await sendConsignEmail({to:row.seller_email,subject:`${row.item_title} — Common Ground ${move.action==='offer'?'offer':move.action==='counter'?'counter-offer':move.action==='accept'?'deal':'update'}`,
        html:consignEmailShell(row.item_title,`<p>Common Ground ${emailEscape(verb)}.${next.offer.note?' <em>'+emailEscape(next.offer.note)+'</em>':''}</p>${move.action==='accept'?'<p>We\'ll follow up with drop-off or shipping details.</p>':''}${link?`<p><a href="${link}" style="display:inline-block;background:#E0322B;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Open your trade-in ticket</a></p>`:''}`)});
    }else{
      const verb={counter:`countered at ${amount}`,accept:`accepted your offer of ${amount}`,decline:'declined your offer'}[move.action];
      await sendConsignEmail({to:consignNotificationEmail,replyTo:row.seller_email,subject:`Trade-in: ${row.seller_name} ${move.action==='accept'?'accepted':move.action==='counter'?'countered':'declined'} — ${row.item_title}`,
        html:consignEmailShell(row.item_title,`<p><strong>${emailEscape(row.seller_name)}</strong> ${emailEscape(verb)}.${next.offer.note?' <em>'+emailEscape(next.offer.note)+'</em>':''}</p><p><a href="${workHubUrl}/consign/${row.id}">Open in Work</a></p>`)});
    }
  }catch(error){app.log.error({error,consignmentId:row.id},'Consignment notification email failed')}
}
async function storeConsignmentImage(consignmentId,part){
  const originalName=cleanName(part.filename||'photo.jpg');if(!imageExtensions.has(extname(originalName).toLowerCase()))throw Object.assign(new Error('Photos must be JPG, PNG, WEBP or HEIC'),{statusCode:415});
  const storageName=`${randomBytes(18).toString('hex')}-${originalName}`,path=join(uploadDir,storageName);
  try{
    await pipeline(part.file,createWriteStream(path,{flags:'wx'}));
    return (await pool.query('insert into consignment_images(consignment_id,original_name,storage_name,mime_type,size_bytes) values($1,$2,$3,$4,$5) returning *',[consignmentId,originalName,storageName,part.mimetype,part.file.bytesRead])).rows[0];
  }catch(error){await unlink(path).catch(()=>{});throw error}
}

app.post('/v1/public/consignments',async(req,reply)=>{
  if(!publicIntakeAllowed(req.ip))return reply.code(429).send({error:'Too many submissions. Please try again in an hour.'});
  const fields={},images=[];let row=null,spam=false;
  const create=async()=>{
    if(row||spam)return row;
    spam=Boolean(String(fields.company_fax||'').trim());if(spam)return null;
    const data=normalizeSubmission(fields),token=randomBytes(24).toString('base64url');
    row=(await pool.query(`insert into consignments(token,seller_name,seller_email,seller_phone,item_title,brand,size,condition,deal_type,asking_cents,details)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[token,data.seller_name,data.seller_email,data.seller_phone,data.item_title,data.brand,data.size,data.condition,data.deal_type,data.asking_cents,data.details])).rows[0];
    return row;
  };
  for await(const part of req.parts()){
    if(part.type==='file'){
      await create();
      if(spam||images.length>=5){for await(const _chunk of part.file){};continue}
      images.push(await storeConsignmentImage(row.id,part));
    }else fields[part.fieldname]=part.value;
  }
  await create();
  if(spam)return reply.code(202).send({ok:true});
  const link=consignTicketLink(row.token),imgUrl=consignImageUrl(req);
  try{
    await sendConsignEmail({to:consignNotificationEmail,replyTo:row.seller_email,subject:`New trade-in: ${row.item_title}${row.asking_cents?' · asking '+formatCents(row.asking_cents):''}`,
      html:consignEmailShell(row.item_title,`<p><strong>${emailEscape(row.seller_name)}</strong> · ${emailEscape(row.seller_email)}${row.seller_phone?' · '+emailEscape(row.seller_phone):''}</p><p>${emailEscape([row.brand,row.size?'Size '+row.size:null,row.condition,row.deal_type].filter(Boolean).join(' · '))}</p>${row.details?'<p>'+emailEscape(row.details).replace(/\n/g,'<br>')+'</p>':''}<p>${images.map(i=>`<a href="${imgUrl(i)}"><img src="${imgUrl(i)}" width="120" style="margin:4px;border:2px solid #141414"></a>`).join('')}</p><p><a href="${workHubUrl}/consign/${row.id}">Review and make an offer in Work</a></p>`)});
    await sendConsignEmail({to:row.seller_email,subject:`We got it — ${row.item_title}`,
      html:consignEmailShell('Ticket received',`<p>Thanks ${emailEscape(row.seller_name)}. We'll look over <strong>${emailEscape(row.item_title)}</strong> and send an offer, usually within 48 hours.</p>${link?`<p><a href="${link}" style="display:inline-block;background:#E0322B;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Track your trade-in ticket</a></p><p style="color:#666;font-size:12px">Keep this link: it's how you'll see and answer offers.</p>`:''}`)});
  }catch(error){app.log.error({error,consignmentId:row.id},'Consignment saved but notification email failed')}
  return reply.code(201).send({ok:true,id:row.id,token:row.token,ticket_url:link,images:images.length});
});

app.get('/v1/public/consignments/:token',async(req,reply)=>{
  const loaded=await loadConsignment('token',String(req.params.token||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Ticket not found'});
  return {consignment:consignmentView(loaded.row,loaded.images,loaded.offers,consignImageUrl(req))};
});

app.post('/v1/public/consignments/:token/respond',async(req,reply)=>{
  const loaded=await loadConsignment('token',String(req.params.token||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Ticket not found'});
  const body=req.body||{},move={by:'seller',action:String(body.action||''),amountCents:body.amount_cents,note:body.note};
  if(!['counter','accept','decline'].includes(move.action))return reply.code(400).send({error:'Action must be counter, accept or decline.'});
  const next=await applyConsignmentMove(loaded.row,loaded.offers,move);
  await notifyConsignmentMove(loaded.row,next,move);
  const fresh=await loadConsignment('id',loaded.row.id);
  return {ok:true,consignment:consignmentView(fresh.row,fresh.images,fresh.offers,consignImageUrl(req))};
});

app.get('/v1/public/consignment-images/:id',async(req,reply)=>{
  const image=(await pool.query('select * from consignment_images where id=$1',[String(req.params.id||'').slice(0,64)])).rows[0];
  if(!image)return reply.code(404).send({error:'Not found'});
  return reply.header('cache-control','public, max-age=86400').type(image.mime_type||'application/octet-stream').send(createReadStream(join(uploadDir,image.storage_name)));
});

app.get('/v1/admin/consignments',{preHandler:[authenticate,adminOnly]},async req=>{
  const status=String(req.query.status||'open');
  const where=status==='open'?`status in ('submitted','reviewing','offered','countered')`:status==='all'?'true':'status=$1';
  const params=status==='open'||status==='all'?[]:[status];
  const rows=(await pool.query(`select c.*,(select storage_name from consignment_images i where i.consignment_id=c.id order by created_at limit 1) cover,
    (select id from consignment_images i where i.consignment_id=c.id order by created_at limit 1) cover_id,
    (select count(*) from consignment_offers o where o.consignment_id=c.id) offer_count,
    (select amount_cents from consignment_offers o where o.consignment_id=c.id and o.status='open' order by created_at desc limit 1) open_amount_cents,
    (select by from consignment_offers o where o.consignment_id=c.id and o.status='open' order by created_at desc limit 1) open_by
    from consignments c where ${where} order by c.updated_at desc limit 200`,params)).rows;
  const counts=(await pool.query('select status,count(*)::int n from consignments group by status')).rows;
  const imgUrl=consignImageUrl(req);
  return {consignments:rows.map(r=>({id:r.id,item_title:r.item_title,brand:r.brand,size:r.size,condition:r.condition,deal_type:r.deal_type,asking_cents:r.asking_cents,status:r.status,agreed_cents:r.agreed_cents,
    seller_name:r.seller_name,seller_email:r.seller_email,created_at:r.created_at,updated_at:r.updated_at,offer_count:Number(r.offer_count),open_amount_cents:r.open_amount_cents,open_by:r.open_by,
    cover_url:r.cover_id?imgUrl({id:r.cover_id}):null,waiting_on:r.status==='countered'||r.status==='submitted'||r.status==='reviewing'?'store':r.status==='offered'?'seller':null})),counts};
});
app.get('/v1/admin/consignments/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const loaded=await loadConsignment('id',String(req.params.id||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Not found'});
  return {consignment:consignmentView(loaded.row,loaded.images,loaded.offers,consignImageUrl(req),{audience:'staff'}),ticket_url:consignTicketLink(loaded.row.token)};
});
app.post('/v1/admin/consignments/:id/offers',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const loaded=await loadConsignment('id',String(req.params.id||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Not found'});
  const body=req.body||{},move={by:'store',action:String(body.action||''),amountCents:body.amount_cents,note:body.note};
  if(!['offer','counter','accept','decline'].includes(move.action))return reply.code(400).send({error:'Action must be offer, counter, accept or decline.'});
  const next=await applyConsignmentMove(loaded.row,loaded.offers,move);
  await notifyConsignmentMove(loaded.row,next,move);
  const fresh=await loadConsignment('id',loaded.row.id);
  return {ok:true,consignment:consignmentView(fresh.row,fresh.images,fresh.offers,consignImageUrl(req),{audience:'staff'})};
});
app.patch('/v1/admin/consignments/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const body=req.body||{},id=String(req.params.id||'').slice(0,64);
  const row=(await pool.query('select * from consignments where id=$1',[id])).rows[0];if(!row)return reply.code(404).send({error:'Not found'});
  const status=body.status?String(body.status):row.status;
  const allowed={submitted:['reviewing','withdrawn'],reviewing:['submitted','withdrawn'],offered:['withdrawn'],countered:['withdrawn'],accepted:['paid','withdrawn'],paid:[],declined:['submitted'],withdrawn:['submitted']};
  if(status!==row.status&&!(allowed[row.status]||[]).includes(status))return reply.code(409).send({error:`Can't move a ${row.status} ticket to ${status}`});
  const notes=body.staff_notes!==undefined?String(body.staff_notes).slice(0,4000):row.staff_notes;
  const updated=(await pool.query('update consignments set status=$2,staff_notes=$3,updated_at=now() where id=$1 returning *',[id,status,notes])).rows[0];
  const fresh=await loadConsignment('id',id);
  return {ok:true,consignment:consignmentView(updated,fresh.images,fresh.offers,consignImageUrl(req),{audience:'staff'})};
});

// ---- Make an offer: buyer opens with a paid checkout (card capture), store has 24h to accept/counter/decline ----
const offerNotificationEmail=process.env.OFFER_NOTIFICATION_EMAIL||consignNotificationEmail;
const offerTicketUrl=(process.env.OFFER_TICKET_URL||'').replace(/\/$/,'');
const offerFromEmail=process.env.OFFER_FROM_EMAIL||consignFromEmail;
const offerTicketLink=token=>offerTicketUrl?`${offerTicketUrl}?t=${encodeURIComponent(token)}`:null;
async function sendOfferEmail({to,subject,html,replyTo}){
  if(!process.env.RESEND_API_KEY){app.log.warn({to,subject},'RESEND_API_KEY missing; offer email not sent');return false}
  const response=await trackedFetch('resend','https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:offerFromEmail,to:[to],reply_to:replyTo||undefined,subject,html})});
  if(!response.ok)throw new Error(`Offer email delivery failed: ${response.status}`);return true;
}
const offerEmailShell=(title,body)=>`<div style="font-family:Arial,sans-serif;color:#141414;max-width:640px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase">Common Ground · Make an offer</p><h1 style="font-size:22px">${emailEscape(title)}</h1>${body}</div>`;

const asMoney=cents=>(cents/100).toFixed(2);
const toVariantGid=id=>/^gid:\/\//.test(String(id))?String(id):`gid://shopify/ProductVariant/${String(id).replace(/\D/g,'')}`;

async function fetchOfferContext(variantGid){
  const data=await shopifyGraphql(OFFER_CONTEXT_QUERY,{variantId:variantGid});
  const variant=data?.productVariant;
  if(!variant)throw Object.assign(new Error('That item could not be found.'),{statusCode:404});
  if(variant.product?.status!=='ACTIVE'||!variant.availableForSale)throw Object.assign(new Error('That item is not currently available for offers.'),{statusCode:409});
  if(String(variant.product?.accepts?.value).toLowerCase()!=='true')throw Object.assign(new Error('This item does not accept offers.'),{statusCode:409});
  const minPercent=Number(variant.product?.minPercent?.value)||50;
  return {
    productId:variant.product.id, productTitle:variant.product.title, variantTitle:variant.title,
    imageUrl:variant.image?.url||null, listPriceCents:Math.round(Number(variant.price)*100), minPercent
  };
}
async function createOfferDraftOrder({variantGid,quantity,amountCents,buyer,offerId,note}){
  const data=await shopifyGraphql(DRAFT_ORDER_CREATE,{input:{
    lineItems:[{variantId:variantGid,quantity,priceOverride:{amount:asMoney(amountCents),currencyCode:'USD'}}],
    email:buyer.email,phone:buyer.phone||undefined,tags:['make-an-offer'],note:note||`Make an Offer — ${offerId}`
  }});
  const payload=requireNoUserErrors(data.draftOrderCreate);
  return payload.draftOrder;
}
async function pollDraftOrderPaid(draftOrderId){
  const data=await shopifyGraphql(DRAFT_ORDER_STATUS,{id:draftOrderId});
  return data?.draftOrder?.order||null;
}
async function captureOfferOrder(orderGid,amountCents){
  const data=await shopifyGraphql(ORDER_TRANSACTIONS_QUERY,{id:orderGid});
  const transactions=data?.order?.transactions||[];
  if(transactions.some(t=>['SALE','CAPTURE'].includes(t.kind)&&t.status==='SUCCESS'))return;
  const auth=transactions.find(t=>t.kind==='AUTHORIZATION'&&t.status==='SUCCESS');
  if(!auth)throw Object.assign(new Error('No authorized payment found to capture on this order.'),{statusCode:409});
  const currency=auth.amountSet?.shopMoney?.currencyCode||'USD';
  const captured=await shopifyGraphql(ORDER_CAPTURE,{input:{id:orderGid,parentTransactionId:auth.id,amount:asMoney(amountCents),currency}});
  requireNoUserErrors(captured.orderCapture);
}
async function releaseOfferOrder(orderGid,{reason='CUSTOMER',staffNote}={}){
  const cancelled=await shopifyGraphql(ORDER_CANCEL,{orderId:orderGid,refund:true,reason,staffNote:staffNote||'Make an Offer — released'});
  requireNoOrderCancelErrors(cancelled.orderCancel);
}

async function loadOffer(where,value){
  const row=(await pool.query(`select * from product_offers where ${where}=$1`,[value])).rows[0];if(!row)return null;
  const moves=(await pool.query('select * from product_offer_moves where offer_id=$1 order by created_at',[row.id])).rows;
  return {row,moves};
}
async function applyOfferMove(row,move){
  const next=nextOfferMove(row,move);
  const db=await pool.connect();
  let updated;
  try{
    await db.query('begin');
    await db.query('insert into product_offer_moves(offer_id,by,kind,amount_cents,note) values($1,$2,$3,$4,$5)',[row.id,next.move.by,next.move.kind,next.move.amount_cents,next.move.note]);
    const patch={...next.patch};
    updated=(await db.query(
      `update product_offers set
         status=coalesce($2,status), current_amount_cents=coalesce($3,current_amount_cents), agreed_cents=coalesce($4,agreed_cents),
         respond_by=coalesce($5,respond_by), payment_due_by=coalesce($6,payment_due_by),
         awaiting_counter_payment=coalesce($7,awaiting_counter_payment), updated_at=now()
       where id=$1 returning *`,
      [row.id,patch.status??null,patch.current_amount_cents??null,patch.agreed_cents??null,patch.respond_by??null,patch.payment_due_by??null,
       patch.awaiting_counter_payment===undefined?null:patch.awaiting_counter_payment])).rows[0];
    await db.query('commit');
  }catch(error){await db.query('rollback').catch(()=>{});throw error}finally{db.release()}

  let checkoutUrl=null,settlementError=null;
  try{
    if(next.settlement==='capture'){
      await captureOfferOrder(updated.shopify_order_id,updated.agreed_cents??updated.current_amount_cents);
    }else if(next.settlement==='release_hold'){
      if(updated.shopify_order_id)await releaseOfferOrder(updated.shopify_order_id,{reason:move.by==='store'?'STAFF':'CUSTOMER'});
    }else if(next.settlement==='create_counter_checkout'){
      const draft=await createOfferDraftOrder({variantGid:toVariantGid(updated.shopify_variant_id),quantity:updated.quantity,amountCents:updated.current_amount_cents,
        buyer:{email:updated.buyer_email,phone:updated.buyer_phone},offerId:updated.id,note:`Make an Offer (counter accepted) — ${updated.id}`});
      updated=(await pool.query('update product_offers set shopify_draft_order_id=$2,shopify_draft_order_invoice_url=$3,shopify_order_id=null,shopify_order_name=null,updated_at=now() where id=$1 returning *',
        [updated.id,draft.id,draft.invoiceUrl])).rows[0];
      checkoutUrl=draft.invoiceUrl;
    }
  }catch(error){
    settlementError=error;
    app.log.error({error,offerId:updated.id,settlement:next.settlement},'Offer settlement with Shopify failed');
    await pool.query('update product_offers set staff_notes=coalesce(staff_notes,\'\')||$2,updated_at=now() where id=$1',
      [updated.id,`\n[${new Date().toISOString()}] Shopify ${next.settlement} failed: ${error.message}`]);
  }
  return {row:updated,move:next.move,settlementError,checkoutUrl};
}
async function notifyOfferMove({row,move,checkoutUrl}){
  const link=offerTicketLink(row.token),amount=move.amount_cents?formatCents(move.amount_cents):'';
  try{
    if(move.by==='store'){
      const verb={counter:`countered your offer at ${amount}`,accept:`accepted your offer of ${amount}`,decline:'passed on your offer'}[move.kind];
      if(!verb)return;
      await sendOfferEmail({to:row.buyer_email,subject:`${row.product_title} — ${move.kind==='counter'?'counter-offer':move.kind==='accept'?'offer accepted':'update on your offer'}`,
        html:offerEmailShell(row.product_title,`<p>Common Ground ${emailEscape(verb)}.${move.note?' <em>'+emailEscape(move.note)+'</em>':''}</p>${move.kind==='counter'&&link?`<p><a href="${link}" style="display:inline-block;background:#E0322B;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Review the counter-offer</a></p>`:''}${move.kind==='accept'?'<p>Your order is confirmed — we\'ll email tracking once it ships.</p>':''}`)});
    }else if(move.by==='buyer'&&['accept','decline'].includes(move.kind)){
      const verb={accept:`accepted the counter-offer of ${amount}`,decline:'declined the counter-offer'}[move.kind];
      await sendOfferEmail({to:offerNotificationEmail,replyTo:row.buyer_email,subject:`Offer: ${row.buyer_name} ${move.kind==='accept'?'accepted':'declined'} — ${row.product_title}`,
        html:offerEmailShell(row.product_title,`<p><strong>${emailEscape(row.buyer_name)}</strong> ${emailEscape(verb)}.</p><p><a href="${workHubUrl}/offers/${row.id}">Open in Work</a></p>`)});
      if(move.kind==='accept'&&checkoutUrl)await sendOfferEmail({to:row.buyer_email,subject:`Pay to confirm — ${row.product_title}`,
        html:offerEmailShell(row.product_title,`<p>One step left: complete checkout at your agreed price of ${amount} to confirm the order.</p><p><a href="${checkoutUrl}" style="display:inline-block;background:#E0322B;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Pay ${amount}</a></p>`)});
    }else if(move.by==='system'&&move.kind==='expire'){
      await sendOfferEmail({to:row.buyer_email,subject:`Offer expired — ${row.product_title}`,
        html:offerEmailShell(row.product_title,`<p>The 24-hour response window closed, so this offer has expired.${row.status==='expired'?' Any card hold has been released.':''}</p>`)});
      await sendOfferEmail({to:offerNotificationEmail,subject:`Offer expired (missed 24h window) — ${row.product_title}`,
        html:offerEmailShell(row.product_title,`<p><strong>${emailEscape(row.buyer_name)}</strong>'s offer on <strong>${emailEscape(row.product_title)}</strong> expired unanswered.</p><p><a href="${workHubUrl}/offers/${row.id}">Open in Work</a></p>`)});
    }
  }catch(error){app.log.error({error,offerId:row.id},'Offer notification email failed')}
}

app.post('/v1/public/offers',async(req,reply)=>{
  if(!publicIntakeAllowed(req.ip))return reply.code(429).send({error:'Too many submissions. Please try again in an hour.'});
  const body=req.body||{};
  if(String(body.company_fax||'').trim())return reply.code(202).send({ok:true});
  const buyer=normalizeOfferSubmission(body);
  const variantGid=toVariantGid(body.variant_id);
  const context=await fetchOfferContext(variantGid);
  const quantity=buyer.quantity;
  const amountCents=normalizeOfferAmount(body.amount_cents??Math.round(Number(body.amount)*100),{listPriceCents:context.listPriceCents,minPercent:context.minPercent});
  const token=randomBytes(24).toString('base64url');
  const draft=await createOfferDraftOrder({variantGid,quantity,amountCents,buyer,offerId:token});
  const row=(await pool.query(
    `insert into product_offers(token,shopify_product_id,shopify_variant_id,product_title,variant_title,image_url,buyer_name,buyer_email,buyer_phone,
       quantity,list_price_cents,current_amount_cents,shopify_draft_order_id,shopify_draft_order_invoice_url,payment_due_by)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
    [token,context.productId,String(body.variant_id),context.productTitle,context.variantTitle,context.imageUrl,buyer.buyer_name,buyer.buyer_email,buyer.buyer_phone,
     quantity,context.listPriceCents,amountCents,draft.id,draft.invoiceUrl,new Date(Date.now()+2*3600*1000)])).rows[0];
  await pool.query('insert into product_offer_moves(offer_id,by,kind,amount_cents,note) values($1,$2,$3,$4,$5)',[row.id,'buyer','offer',amountCents,buyer.note]);
  const link=offerTicketLink(row.token);
  try{
    await sendOfferEmail({to:offerNotificationEmail,replyTo:row.buyer_email,subject:`New offer: ${formatCents(amountCents)} on ${row.product_title}`,
      html:offerEmailShell(row.product_title,`<p><strong>${emailEscape(row.buyer_name)}</strong> · ${emailEscape(row.buyer_email)}${row.buyer_phone?' · '+emailEscape(row.buyer_phone):''}</p><p>Offered ${formatCents(amountCents)} on ${emailEscape(row.product_title)}${row.variant_title?' ('+emailEscape(row.variant_title)+')':''}, list ${formatCents(row.list_price_cents)}.</p><p>Card capture is pending checkout — you'll get a 24-hour clock once it clears.</p><p><a href="${workHubUrl}/offers/${row.id}">Open in Work</a></p>`)});
    await sendOfferEmail({to:row.buyer_email,subject:`Complete your offer — ${row.product_title}`,
      html:offerEmailShell(row.product_title,`<p>Thanks ${emailEscape(row.buyer_name)}. One step left: complete checkout for your offer of ${formatCents(amountCents)} to place it. We'll respond within 24 hours — if we decline or don't respond in time, it's automatically refunded (or the hold released, depending on your card).</p><p><a href="${draft.invoiceUrl}" style="display:inline-block;background:#E0322B;color:#fff;padding:12px 18px;text-decoration:none;font-weight:700">Complete checkout</a></p>${link?`<p style="color:#666;font-size:12px">Track this offer: <a href="${link}">${link}</a></p>`:''}`)});
  }catch(error){app.log.error({error,offerId:row.id},'Offer saved but notification email failed')}
  return reply.code(201).send({ok:true,token:row.token,ticket_url:link,checkout_url:draft.invoiceUrl,offer:offerView(row,[])});
});

app.get('/v1/public/offers/:token',async(req,reply)=>{
  const loaded=await loadOffer('token',String(req.params.token||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Offer not found'});
  return {offer:offerView(loaded.row,loaded.moves)};
});

app.post('/v1/public/offers/:token/respond',async(req,reply)=>{
  const loaded=await loadOffer('token',String(req.params.token||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Offer not found'});
  const body=req.body||{},action=String(body.action||'');
  if(!['accept','decline'].includes(action))return reply.code(400).send({error:'Action must be accept or decline.'});
  const result=await applyOfferMove(loaded.row,{by:'buyer',action,note:body.note});
  await notifyOfferMove(result);
  const fresh=await loadOffer('id',result.row.id);
  return {ok:true,checkout_url:result.checkoutUrl,offer:offerView(fresh.row,fresh.moves)};
});

app.get('/v1/admin/offers',{preHandler:[authenticate,adminOnly]},async req=>{
  const status=String(req.query.status||'open');
  const where=status==='open'?`status in ('awaiting_payment','pending_review','countered')`:status==='all'?'true':'status=$1';
  const params=status==='open'||status==='all'?[]:[status];
  const rows=(await pool.query(`select * from product_offers where ${where} order by updated_at desc limit 200`,params)).rows;
  const counts=(await pool.query('select status,count(*)::int n from product_offers group by status')).rows;
  return {offers:rows.map(r=>({...offerView(r,[],{audience:'staff'}),
    waiting_on:r.status==='pending_review'?'store':r.status==='countered'||r.status==='awaiting_payment'?'buyer':null})),counts};
});
app.get('/v1/admin/offers/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const loaded=await loadOffer('id',String(req.params.id||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Not found'});
  return {offer:offerView(loaded.row,loaded.moves,{audience:'staff'}),ticket_url:offerTicketLink(loaded.row.token)};
});
app.post('/v1/admin/offers/:id/respond',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const loaded=await loadOffer('id',String(req.params.id||'').slice(0,64));
  if(!loaded)return reply.code(404).send({error:'Not found'});
  const body=req.body||{},action=String(body.action||'');
  if(!['counter','accept','decline'].includes(action))return reply.code(400).send({error:'Action must be counter, accept or decline.'});
  const result=await applyOfferMove(loaded.row,{by:'store',action,amountCents:body.amount_cents,note:body.note,bounds:{listPriceCents:loaded.row.list_price_cents}});
  await notifyOfferMove(result);
  const fresh=await loadOffer('id',result.row.id);
  return {ok:true,warning:result.settlementError?result.settlementError.message:undefined,offer:offerView(fresh.row,fresh.moves,{audience:'staff'})};
});
app.patch('/v1/admin/offers/:id',{preHandler:[authenticate,adminOnly]},async(req,reply)=>{
  const id=String(req.params.id||'').slice(0,64),body=req.body||{};
  const row=(await pool.query('update product_offers set staff_notes=$2,updated_at=now() where id=$1 returning *',[id,body.staff_notes!==undefined?String(body.staff_notes).slice(0,4000):null])).rows[0];
  if(!row)return reply.code(404).send({error:'Not found'});
  const fresh=await loadOffer('id',id);
  return {ok:true,offer:offerView(fresh.row,fresh.moves,{audience:'staff'})};
});

async function runOfferSweep(){
  const pending=(await pool.query(`select * from product_offers where status='awaiting_payment' and shopify_draft_order_id is not null`)).rows;
  for(const row of pending){
    try{
      const order=await pollDraftOrderPaid(row.shopify_draft_order_id);
      if(order){
        const withOrder=(await pool.query('update product_offers set shopify_order_id=$2,shopify_order_name=$3,updated_at=now() where id=$1 returning *',[row.id,order.id,order.name])).rows[0];
        const result=await applyOfferMove(withOrder,{by:'system',action:'paid'});
        await notifyOfferMove(result);
      }else if(row.payment_due_by&&new Date(row.payment_due_by)<new Date()){
        const result=await applyOfferMove(row,{by:'system',action:'cancel'});
        await notifyOfferMove(result);
      }
    }catch(error){app.log.error({error,offerId:row.id},'Offer payment-poll sweep failed for this offer')}
  }
  const overdue=(await pool.query(`select * from product_offers where status in ('pending_review','countered') and respond_by<now()`)).rows;
  for(const row of overdue){
    try{
      const result=await applyOfferMove(row,{by:'system',action:'expire'});
      await notifyOfferMove(result);
    }catch(error){app.log.error({error,offerId:row.id},'Offer expiry sweep failed for this offer')}
  }
}

app.setErrorHandler((error, req, reply) => {
  // Postgres class 22 = the value could not be read as the column's type (a malformed uuid in the path, a NUL byte in text)
  if (/^22/.test(String(error.code || '')) && !error.statusCode) {
    const inPath = Object.keys(req.params || {}).length > 0;
    req.log.warn({ err: error.message, code: error.code }, 'malformed input');
    return reply.code(inPath ? 404 : 400).send({ error: inPath ? 'Not found' : 'Some of that input could not be read' });
  }
  req.log.error(error);
  if (!error.statusCode || error.statusCode >= 500) reportError('web', `${req.method} ${req.routeOptions?.url || req.url.split('?')[0]}: ${error.message}`, { status: error.statusCode || 500 });
  reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : 'Internal server error' });
});

// Graceful shutdown: Railway sends SIGTERM on every redeploy. Without a handler
// Node exits non-zero (143), which Railway reports as a crash. Close cleanly and
// exit 0 so routine redeploys stop firing crash-alert emails.
let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { await app.close(); } catch (error) { app.log.error(error); }
    try { await pool.end(); } catch {}
    process.exit(0);
  });
}

await migrate();
billingMode=['on','off'].includes((await getSetting('techPackBilling'))?.mode)?(await getSetting('techPackBilling')).mode:null;
await repairPendingShopifyLinks();
// Background jobs, each tracked so the platform page can show when it last ran and whether it failed.
const jobEvery = (name, every, fn, { delay = null } = {}) => { const run = trackJob(name, every, fn); setInterval(run, every).unref(); if (delay) setTimeout(run, delay).unref(); return run; };
const offerJob = jobEvery('Offer sweep', 5 * 60 * 1000, runOfferSweep);
if (process.env.FOLLOWUPS_DISABLED !== 'true') jobEvery('Photo follow-up emails', 15 * 60 * 1000, runPhotoFollowups); else declareJob('Photo follow-up emails', 15 * 60 * 1000, 'switched off (FOLLOWUPS_DISABLED)');
if (process.env.NURTURE_DISABLED !== 'true') jobEvery('Follow-up email sequence', 15 * 60 * 1000, runNurture); else declareJob('Follow-up email sequence', 15 * 60 * 1000, 'switched off (NURTURE_DISABLED)');
jobEvery('Assistant recovery', 5 * 60 * 1000, runAiRecovery, { delay: 15 * 1000 });
jobEvery('Spec checks', 5 * 60 * 1000, runSpecCheckRecovery, { delay: 50 * 1000 });
jobEvery('3D models', 5 * 60 * 1000, runModelRecovery, { delay: 55 * 1000 });
jobEvery('Assistant re-runs after an outage', 5 * 60 * 1000, () => runAiAutoRetry().then(r => r.started), { delay: 40 * 1000 });
if (shopifyConfigured()) jobEvery('Shopify payment sync', PAYMENT_SYNC_EVERY_MS, runPaymentSync, { delay: 25 * 1000 }); else declareJob('Shopify payment sync', PAYMENT_SYNC_EVERY_MS, 'Shopify is not connected');
// One time: cards of tech packs that already exist take their material, decoration, colourways and size run from the pack. Does nothing after the first full pass.
async function backfillCardsFromTechPacks(){
  if((await getSetting('cardBackfillV1'))?.done)return 0;
  const rows=(await pool.query(`select product_id,case when published_at is not null then published_data else data end d from tech_packs where initiated_by='client' or published_at is not null`)).rows;
  let changed=0;for(const r of rows){try{if(r.d&&await syncCardFromTechPack(r.product_id,r.d))changed++}catch(e){app.log.warn({err:e.message,productId:r.product_id},'card backfill skipped one product')}}
  await setSetting('cardBackfillV1',{done:true,at:new Date().toISOString(),products:rows.length,changed});app.log.info({products:rows.length,changed},'product cards filled from existing tech packs');return changed;
}
jobEvery('Product cards from tech packs', 24 * 60 * 60 * 1000, backfillCardsFromTechPacks, { delay: 20 * 1000 });
jobEvery('Payment check for locked packs', 5 * 60 * 1000, runPaymentSweep);
if (shopifyConfigured()) jobEvery('Sample deposits', 5 * 60 * 1000, runDepositSweep, { delay: 35 * 1000 }); else declareJob('Sample deposits', 5 * 60 * 1000, 'Shopify is not connected: staff mark deposits paid in the console');
offerJob();
await app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });

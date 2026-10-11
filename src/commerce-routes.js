// Staff routes for pushing a build to a client's commerce tool (see commerce.js for the rules and the three store connectors).
//   GET|PUT /v1/admin/clients/:id/commerce                      the client's platform preference, and which stores are connected
//   PUT|DELETE /v1/admin/clients/:id/commerce/connection[/:p]   connect or disconnect Square or Wix (the secret is sealed at rest and never sent back)
//   GET /v1/admin/builds/:id/commerce                           the catalog, the clients it is for, where each sells, what was pushed
//   PUT /v1/admin/builds/:id/catalog                            the products the build sells
//   POST /v1/admin/builds/:id/push                              preview or run a push to the client's platform
import { cleanPlatform, platformLabel } from './software.js';
import { cleanCatalog, catalogFromText, catalogToText, planPush, pushToShopify, pushToSquare, pushToWix, summarize, PUSH_PLATFORMS, SQUARE_ORIGIN, SQUARE_VERSION, WIX_ORIGIN } from './commerce.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCY = /^[A-Z]{3}$/;

export function registerCommerceRoutes(app, d) {
  const { pool, authenticate, adminOnly, tokenSeal, storeExec, liveStores, storeView, env = process.env, log = console, fetchImpl = fetch } = d;
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const needId = (req, reply) => UUID.test(req.params.id) || (bad(reply, 'Not found', 404), false);
  const actorOf = req => (UUID.test(String(req.auth?.sub || '')) ? req.auth.sub : null);
  const running = new Set();
  const connView = r => r ? { connected: r.status === 'connected', status: r.status, label: r.meta?.label || '', currency: r.meta?.currency || '', siteId: r.meta?.siteId || '', since: r.created_at } : { connected: false, status: 'none' };
  async function targets(clientId) {
    const conns = (await pool.query('select * from client_commerce_connections where client_id=$1', [clientId])).rows, by = Object.fromEntries(conns.map(c => [c.platform, c]));
    return { shopify: (await liveStores(clientId)).map(storeView), square: connView(by.square), wix: connView(by.wix) };
  }

  app.get('/v1/admin/commerce/clients', { preHandler: pre }, async () => ({ clients: (await pool.query(`select id,name,commerce_platform from clients where archived_at is null and status not in ('archive','archived') and slug<>'future-basics' order by name`)).rows.map(c => ({ id: c.id, name: c.name, platform: c.commerce_platform || '' })) }));
  app.get('/v1/admin/clients/:id/commerce', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const c = (await pool.query('select id,name,commerce_platform from clients where id=$1', [req.params.id])).rows[0]; if (!c) return bad(reply, 'Not found', 404);
    return { platform: c.commerce_platform || '', label: platformLabel(c.commerce_platform), targets: await targets(c.id) };
  });
  app.put('/v1/admin/clients/:id/commerce', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const p = cleanPlatform(req.body?.platform); if (p === null) return bad(reply, 'Choose Shopify, Square, Wix or something else');
    const n = (await pool.query('update clients set commerce_platform=$2 where id=$1', [req.params.id, p])).rowCount;
    return n ? { ok: true, platform: p } : bad(reply, 'Not found', 404);
  });
  app.put('/v1/admin/clients/:id/commerce/connection', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; if (!tokenSeal.ready) return bad(reply, 'Connections cannot be saved yet: the service has no key to seal them with (SHOPIFY_TOKEN_KEY).', 503);
    const b = req.body || {}, platform = String(b.platform || '');
    if (!['square', 'wix'].includes(platform)) return bad(reply, 'Shopify stores are connected by the client from their hub. Here: Square or Wix.');
    const secret = String(platform === 'square' ? b.token : b.apiKey || '').trim(); if (secret.length < 8 || secret.length > 4000 || /\s/.test(secret)) return bad(reply, platform === 'square' ? 'Paste the Square access token' : 'Paste the Wix API key');
    const meta = { label: String(b.label || '').trim().slice(0, 80) };
    if (platform === 'square') { const cur = String(b.currency || 'USD').toUpperCase(); if (!CURRENCY.test(cur)) return bad(reply, 'The currency is three letters, like USD'); meta.currency = cur; }
    else { const site = String(b.siteId || '').trim(); if (site && !/^[0-9a-f-]{8,64}$/i.test(site)) return bad(reply, 'The Wix site id looks like 1a2b3c4d-…'); meta.siteId = site; }
    if (!(await pool.query('select 1 from clients where id=$1', [req.params.id])).rowCount) return bad(reply, 'Not found', 404);
    const row = (await pool.query(`insert into client_commerce_connections(client_id,platform,secret_sealed,meta) values($1,$2,$3,$4) on conflict (client_id,platform) do update set secret_sealed=excluded.secret_sealed, meta=excluded.meta, status='connected', updated_at=now() returning *`, [req.params.id, platform, tokenSeal.seal(secret), meta])).rows[0];
    return { ok: true, connection: connView(row) };
  });
  app.delete('/v1/admin/clients/:id/commerce/connection/:platform', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const n = (await pool.query('delete from client_commerce_connections where client_id=$1 and platform=$2', [req.params.id, req.params.platform])).rowCount; return n ? { ok: true } : bad(reply, 'Not found', 404);
  });

  app.put('/v1/admin/builds/:id/catalog', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const list = Array.isArray(req.body?.items) ? req.body.items : typeof req.body?.text === 'string' ? catalogFromText(req.body.text) : null; if (!list) return bad(reply, 'Send the products as a list or as text, one per line');
    const r = cleanCatalog(list); if (r.error) return bad(reply, r.error);
    const n = (await pool.query('update builds set catalog=$2::jsonb, updated_at=now() where id=$1', [req.params.id, JSON.stringify(r.value)])).rowCount; return n ? { ok: true, count: r.value.length, text: catalogToText(r.value) } : bad(reply, 'Not found', 404);
  });
  app.get('/v1/admin/builds/:id/commerce', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return; const b = (await pool.query('select id,name,slug,catalog from builds where id=$1', [req.params.id])).rows[0]; if (!b) return bad(reply, 'Not found', 404);
    const linked = (await pool.query(`select distinct c.id,c.name,c.commerce_platform from projects p join clients c on c.id=p.client_id where p.build_id=$1 and p.archived_at is null order by c.name`, [b.id])).rows;
    const asked = UUID.test(String(req.query?.clientId || '')) ? (await pool.query('select id,name,commerce_platform from clients where id=$1', [req.query.clientId])).rows[0] : null, client = asked || linked[0] || null;
    const pushes = (await pool.query(`select id,client_id,platform,target,status,report,created_at from build_pushes where build_id=$1 order by created_at desc limit 10`, [b.id])).rows;
    return { catalog: b.catalog || [], catalogText: catalogToText(b.catalog || []), clients: linked.map(c => ({ id: c.id, name: c.name, platform: c.commerce_platform || '' })),
      client: client ? { id: client.id, name: client.name, platform: client.commerce_platform || '', platformLabel: platformLabel(client.commerce_platform), targets: await targets(client.id) } : null,
      pushes: pushes.map(p => ({ id: p.id, platform: p.platform, platformLabel: platformLabel(p.platform), target: p.target, status: p.status, at: p.created_at, summary: p.report?.summary || {}, items: p.report?.items || [] })) };
  });

  app.post('/v1/admin/builds/:id/push', { preHandler: pre }, async (req, reply) => {
    if (!needId(req, reply)) return;
    const b = (await pool.query('select id,name,slug,catalog from builds where id=$1', [req.params.id])).rows[0]; if (!b) return bad(reply, 'Not found', 404);
    const items = b.catalog || []; if (!items.length) return bad(reply, 'Add the products this site sells first (the Products box on the build), then push.');
    const clientId = String(req.body?.clientId || ''); if (!UUID.test(clientId)) return bad(reply, 'Choose which client this is for');
    const c = (await pool.query('select id,name,commerce_platform from clients where id=$1', [clientId])).rows[0]; if (!c) return bad(reply, 'Client not found', 404);
    const platform = cleanPlatform(req.body?.platform ?? c.commerce_platform);
    if (platform === null || platform === '') return bad(reply, `Choose where ${c.name} sells (Shopify, Square or Wix) first.`);
    if (!PUSH_PLATFORMS.includes(platform)) return bad(reply, `${c.name} sells somewhere else, so there is nothing to push to automatically.`);
    // which store: Shopify may have several (the client's), Square and Wix have one saved connection
    let target = '', exec = null, conn = null, secret = '';
    if (platform === 'shopify') {
      const stores = await liveStores(c.id), asked = String(req.body?.storeId || ''), st = asked ? stores.find(s => s.id === asked) : stores.length === 1 ? stores[0] : null;
      if (!st) return bad(reply, stores.length ? 'Choose which of their Shopify stores to send it to' : `${c.name} has not connected a Shopify store yet. They connect it from their hub (Your Shopify store).`, 409);
      if (st.status !== 'connected') return bad(reply, `Reconnect ${st.shop} first: the saved connection no longer works.`, 409);
      target = st.shop; exec = () => storeExec(st);
    } else {
      conn = (await pool.query('select * from client_commerce_connections where client_id=$1 and platform=$2', [c.id, platform])).rows[0];
      if (!conn || conn.status !== 'connected') return bad(reply, conn ? `Connect ${platformLabel(platform)} again for ${c.name}: the saved connection no longer works.` : `Connect ${platformLabel(platform)} for ${c.name} first (their room, Where they sell).`, 409);
      secret = tokenSeal.open(conn.secret_sealed); if (!secret) return bad(reply, `Connect ${platformLabel(platform)} again for ${c.name}: the saved connection can no longer be opened.`, 409);
      target = conn.meta?.label || platformLabel(platform);
    }
    const earlier = (await pool.query(`select report from build_pushes where build_id=$1 and client_id=$2 and platform=$3 and target=$4`, [b.id, c.id, platform, target])).rows;
    const already = {}; for (const r of earlier) for (const it of r.report?.items || []) if (it.outcome === 'created' && it.externalId) already[it.sku] = it.externalId;
    const plan = planPush(items, already);
    if (req.body?.preview === true) return { preview: true, platform, platformLabel: platformLabel(platform), target, client: { id: c.id, name: c.name }, willMake: plan.make.map(i => ({ sku: i.sku, name: i.name, price: i.price })), skipped: plan.skip, publishNote: platform === 'shopify' ? 'They are made as drafts for the client to look at and publish.' : `${platformLabel(platform)} shows them in the store as soon as they are made. Look before you push to a live store.` };
    if (!plan.make.length) return { ok: true, nothing: true, platform, target, skipped: plan.skip, message: 'Everything is already there from an earlier push, so nothing was changed.' };
    const lock = `${b.id}:${c.id}:${platform}:${target}`; if (running.has(lock)) return bad(reply, 'A push to that store is already running', 409);
    running.add(lock); let results;
    try {
      try {
        if (platform === 'shopify') results = await pushToShopify({ items: plan.make, exec: await exec(), build: b });
        else if (platform === 'square') results = await pushToSquare({ items: plan.make, token: secret, currency: conn.meta?.currency || 'USD', origin: String(env.SQUARE_API_ORIGIN || SQUARE_ORIGIN).replace(/\/$/, ''), version: env.SQUARE_API_VERSION || SQUARE_VERSION, fetchImpl, key: `build-${b.id}-${Date.now()}` });
        else results = await pushToWix({ items: plan.make, apiKey: secret, siteId: conn.meta?.siteId || '', origin: String(env.WIX_API_ORIGIN || WIX_ORIGIN).replace(/\/$/, ''), fetchImpl });
      } catch (e) {
        if (e.refused && conn) await pool.query(`update client_commerce_connections set status='needs-reconnect', updated_at=now() where id=$1`, [conn.id]).catch(() => {});
        log.warn?.({ err: e.message, platform }, 'build push failed');
        return bad(reply, e.message || 'The push did not go', e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 502);
      }
      const all = [...results, ...plan.skip.map(s => ({ sku: s.sku, name: s.name, outcome: 'skipped', reason: s.reason }))], sum = summarize(all);
      const status = sum.failed === 0 ? 'done' : sum.created === 0 ? 'failed' : 'partial';
      const row = (await pool.query(`insert into build_pushes(build_id,client_id,platform,target,status,report,pushed_by) values($1,$2,$3,$4,$5,$6,$7) returning id,created_at`, [b.id, c.id, platform, target, status, { summary: sum, items: all }, actorOf(req)])).rows[0];
      return reply.code(status === 'failed' ? 502 : 201).send({ push: { id: row.id, platform, platformLabel: platformLabel(platform), target, status, summary: sum, items: all, at: row.created_at } });
    } finally { running.delete(lock); }
  });
}

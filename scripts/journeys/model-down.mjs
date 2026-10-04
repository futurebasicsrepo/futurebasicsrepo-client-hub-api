import { journey, ok, summary, api, jpeg, sleep, waitAi, forge, sql, stamp, S } from './lib.mjs';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:3125', LOG = `${S}/server-j-c.log`, call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jc${tag}-${stamp}-${++n}@chaos.test`;

await journey('J18', 'the model API is down or out of credit: the customer is told it is on our side', async () => {
  const email = em('18'); const r = await call('/v1/public/start', { body: { email, name: 'Chaos C', title: 'Layer runner', photos: [runner] } });
  ok(r.status === 201 && r.json.token && r.json.ai === 'pending', 'the pack is still created and saved', [r.status, r.json.ai]);
  const id = r.json.product.id, tp = await waitAi(call, r.json.token, id, 40000), t = tp.json.techPack;
  ok(t.aiStatus === 'failed', 'the assistant reports failed', t.aiStatus);
  ok(/on our side|not your photo/i.test(t.aiError || ''), 'and says it is on our side, not the photo', t.aiError);
  ok(!/api\.anthropic|invalid x-api-key|authentication|401|connection error|ECONN|ENOTFOUND|fetch failed/i.test(t.aiError || ''), 'with no raw error text in it', t.aiError);
  ok(Number(sql(`select ai_attempts from tech_packs where product_id='${id}'`)) === 0, 'and the try is handed back', sql(`select ai_attempts from tech_packs where product_id='${id}'`));
  const sub = await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: r.json.token, body: {} }); ok(sub.status === 200, 'the customer can still submit and Future Basics finishes it', [sub.status, sub.json.error]);
  ok(Number(sql(`select count(*) from notifications where entity_id='${id}' and type='tech-pack-ai'`)) >= 1, 'Future Basics is notified', sql(`select count(*) from notifications where entity_id='${id}' and type='tech-pack-ai'`));
  const log = readFileSync(LOG, 'utf8'); ok(!/couldn.t read your photo/i.test(log.split('\n').filter(l => l.includes(email)).join('\n')), 'no "send a better photo" email went to the customer');
});

await journey('J19', 'retrying while we are down never uses up the customer\'s three tries', async () => {
  const r = await call('/v1/public/start', { body: { email: em('19'), title: 'Retry', photos: [runner] } }); const id = r.json.product.id, token = r.json.token; await waitAi(call, token, id, 40000);
  const statuses = []; for (let i = 0; i < 5; i++) { const x = await call(`/v1/products/${id}/tech-pack/draft/ai`, { method: 'POST', token }); statuses.push(x.status); await waitAi(call, token, id, 40000); }
  ok(statuses.every(s => s === 200), 'five retries in a row all go through (no 429)', statuses.join(','));
  const d = (await call(`/v1/products/${id}/tech-pack/draft`, { token })).json.techPack; ok(d.aiStatus === 'failed' && /on our side/i.test(d.aiError || ''), 'the message stays honest on every try', d.aiError);
  ok(Number(sql(`select ai_attempts from tech_packs where product_id='${id}'`)) === 0, 'attempts still zero');
});

await journey('J43', 'the model API refuses us: staff get one alert, not one per failure, and customers are unaffected', async () => {
  const log = () => readFileSync(LOG, 'utf8').split('\n').filter(l => /Action needed: the tech pack assistant/.test(l));
  const before = log().length;
  const r = await call('/v1/public/start', { body: { email: em('43'), title: 'Alert runner', photos: [runner] } }); await waitAi(call, r.json.token, r.json.product.id, 40000);
  for (let i = 0; i < 3; i++) { const x = await call(`/v1/products/${r.json.product.id}/tech-pack/draft/ai`, { method: 'POST', token: r.json.token }); await waitAi(call, r.json.token, r.json.product.id, 40000); }
  await sleep(500);
  const lines = log(); ok(lines.length - before === 1 || lines.length === 1, 'several failed runs produce exactly one alert', lines.length);
  ok(/refused by Anthropic|out of Anthropic credit/.test(lines[0] || ''), 'it names the problem', (lines[0] || '').slice(0, 160));
  ok(sql(`select count(*) from app_settings where key like 'aiAlert:%'`) === '1', 'and remembers when it was sent, so a restart does not send it again');
  ok(Number(sql(`select count(*) from platform_events where source='anthropic'`)) >= 1, 'the failure is also on the Platform page list');
  const email = sql(`select email from users where client_id='${r.json.client.id}' limit 1`) || '', admin = await forge({ sub: sql(`select id from users where client_id='${r.json.client.id}' limit 1`), clientId: r.json.client.id, role: 'admin' });
  const q = (await call('/v1/admin/dashboard', { token: admin })).json.queues; const rr = q?.assistant?.rerun?.find(x => x.productId === r.json.product.id);
  ok(rr && rr.owner === 'us' && /could not run on this pack: re-run it/i.test(rr.title) && /on our side/i.test(rr.detail), 'the failed pack is on the console\'s "needs a re-run" list', rr || q?.assistant?.rerun?.length);
  ok(q.assistant.failed30 >= 1 && q.assistant.successRate !== undefined, 'and the assistant panel counts the failure', [q.assistant.failed30, q.assistant.successRate]);
  const h = (await call('/v1/admin/platform/health?fresh=1', { token: admin })).json.checks.find(c => c.id === 'anthropic');
  ok(h && h.status === 'down' && /rejected/i.test(h.summary) && h.facts.some(([k, v]) => k === 'Live check' && /refused/.test(v)), 'the Platform page says the key is rejected, from a live test call, not from history', h && [h.status, h.summary]);
  const d = (await call(`/v1/products/${r.json.product.id}/tech-pack/draft`, { token: r.json.token })).json.techPack; ok(d.aiStatus === 'failed' && /on our side/i.test(d.aiError || '') && !/401|api-key|authentication/i.test(d.aiError || ''), 'the customer still sees the honest message with no raw error', d.aiError);
});

const bad = summary(); process.exit(bad ? 1 : 0);

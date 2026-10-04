import { journey, ok, summary, api, jpeg, codeFrom, sleep, waitAi, sql, stamp, S } from './lib.mjs';
const BASE = 'http://127.0.0.1:3124', LOG = `${S}/server-j-b.log`, call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jb${tag}-${stamp}-${++n}@chaos.test`;
const start = (email, extra = {}) => call('/v1/public/start', { body: { email, name: 'Chaos B', title: 'Layer runner', photos: [runner], ...extra } });

await journey('J16', 'Shopify is unreachable: nothing hangs, nothing 500s, every message is human', async () => {
  const email = em('16'); let t = Date.now(); const first = await start(email); ok(first.status === 201 && first.json.token, 'first pack works with Shopify down', [first.status, first.json.error]);
  await waitAi(call, first.json.token, first.json.product.id);
  t = Date.now(); const second = await start(email, { title: 'Second' }); ok(second.status === 201 && second.json.ai === 'locked' && second.json.needsCode, 'returning customer: locked, asked for a code', [second.status, second.json.ai]); ok(Date.now() - t < 8000, 'and it answers in under 8 s (membership lookup fails fast)', Date.now() - t);
  await call('/v1/auth/code', { body: { email } }); await sleep(150); const v = await call('/v1/auth/verify', { body: { email, code: codeFrom(LOG, email) } }); ok(v.status === 200 && v.json.token, 'sign-in works', [v.status, v.json.error]);
  const id = second.json.product.id, base = `/v1/products/${id}/tech-pack`, token = v.json.token;
  t = Date.now(); let r = await call(`${base}/checkout`, { method: 'POST', token, timeout: 40000 }); ok([502, 503].includes(r.status), 'checkout → 502/503, not 500', [r.status, r.json.error]); ok(Date.now() - t < 25000, 'checkout answers within 25 s', Date.now() - t);
  ok(!/fetch failed|ECONN|ENOTFOUND|getaddrinfo|Internal server error|undefined/i.test(r.json.error || ''), 'checkout error is readable', r.json.error);
  t = Date.now(); r = await call(`${base}/unlock`, { method: 'POST', token, timeout: 40000 }); ok(r.status === 200 && r.json.aiStatus === 'locked', '"I\'ve paid" with Shopify down → still locked, not an error', [r.status, r.json.aiStatus, r.json.error]); ok(Date.now() - t < 25000, 'and quickly', Date.now() - t);
  r = await call(`${base}/submit`, { method: 'POST', token, body: {}, timeout: 40000 }); ok(r.status === 402, 'submit while locked → 402', [r.status, r.json.error]);
  r = await call('/v1/dashboard', { token }); ok(r.status === 200 && r.ms < 4000, 'the dashboard is unaffected', [r.status, r.ms]);
  const d = await call(`${base}/draft`, { token }); d.json.techPack.data.style.styleName = 'Edited with Shopify down'; r = await call(`${base}/draft`, { method: 'PUT', token, body: { data: d.json.techPack.data } }); ok(r.status === 200, 'hand editing still saves', r.status);
  const health = await call('/health'); ok(health.status === 200, 'server is still healthy');
});

await journey('J17', 'the /start rate limit answers politely and does not lock out real use for good', async () => {
  const codes = []; let msg = ''; for (let i = 0; i < 14; i++) { const r = await call('/v1/public/start', { body: { email: 'nope', title: 'x', photos: [] } }); codes.push(r.status); if (r.status === 429) msg = r.json.error; }
  ok(codes.includes(429), 'after 12 submissions from one address an hour the next is 429', codes.join(',')); ok(/too many|try again/i.test(msg), 'with a message that says when to come back', msg);
  const health = await call('/health'); ok(health.status === 200, 'other routes are untouched');
  const code = await call('/v1/auth/code', { body: { email: `nobody-${stamp}@chaos.test` } }); ok(code.status === 403, 'sign-in is a separate limit and still answers', code.status);
});

const bad = summary(); process.exit(bad ? 1 : 0);

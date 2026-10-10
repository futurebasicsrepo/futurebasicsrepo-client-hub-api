// The daily limit on the automatic studio (server H, limit of one pack): the first pack gets the whole studio, the next wait, staff are told once, and staff can still run it by hand.
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge } from './lib.mjs';
const BASE = 'http://127.0.0.1:3131', call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `jk${tag}-${stamp}-${++n}@chaos.test`;
async function room(tag) { const r = await call('/v1/public/start', { body: { email: em(tag), name: 'Cap Room', title: 'Layer runner', photos: [runner] } }); return { token: r.json.token, id: r.json.product.id, cid: r.json.client.id }; }
const studio = async m => (await call(`/v1/products/${m.id}/tech-pack/studio`, { token: m.token })).json;
async function settled(m) { let st; for (let i = 0; i < 160; i++) { st = await studio(m); if (st.loop && st.loop.status === 'done' && !st.working) return st; await sleep(300); } return st; }

// earlier journeys share this database, and the studio of the last pack they made may still be running: let it finish, then start the day's count at zero
for (let i = 0, last = '', calm = 0; i < 100 && calm < 6; i++) { const now = sql(`select count(*)||'/'||count(*) filter (where status='generating') from tech_pack_heroes where trigger='auto'`); calm = now === last && /\/0$/.test(now) ? calm + 1 : 0; last = now; await sleep(300); }
sql(`update tech_pack_heroes set created_at=now()-interval '3 days' where trigger='auto'`);
sql(`delete from notifications where type='studio-cap'`);
await journey('J72', 'a busy day cannot run the bill up: past the daily limit new packs wait for their picture, staff are told once, the customer is told it is queued, and staff can still run it by hand', async () => {
  const a = await room('72a'), first = await settled(a);
  ok(first.hero && first.hero.auto === true, 'the first pack gets the whole studio', first.hero);
  const b = await room('72b'), second = await settled(b);
  ok(!second.hero && second.queued === true, 'the next pack waits, and the customer is told it is queued rather than that something failed', [second.hero, second.queued]);
  ok(second.loop.events.some(e => /queued: today's automatic limit/.test(e.text)) && sql(`select count(*) from tech_pack_heroes where tech_pack_id=(select id from tech_packs where product_id='${b.id}')`) === '0', 'the exchange says so, and no image credits were spent on it');
  const c = await room('72c'); await settled(c);
  ok(sql(`select count(*) from notifications where type='studio-cap'`) === '1', 'staff are told once, not once per pack');
  const admin = await forge({ sub: sql(`select id from users where client_id='${b.cid}' limit 1`), clientId: b.cid, role: 'admin' });
  const h = await call('/v1/admin/platform/health?fresh=1', { token: admin }), row = (h.json.checks || []).find(x => x.id === 'studio');
  ok(row && row.status === 'warn' && /limit is reached \(1 of 1\)/.test(row.summary), 'the Platform page shows the limit reached', row && row.summary);
  const by = await call(`/v1/admin/products/${b.id}/tech-pack/hero`, { method: 'POST', token: admin, body: {} }); ok(by.status === 202, 'staff can still make it by hand', [by.status, by.json]);
  for (let i = 0; i < 80 && sql(`select status from tech_pack_heroes where id='${by.json.id}'`) === 'generating'; i++) await sleep(300);
  ok((await studio(b)).queued === false, 'and it is no longer queued');
});

const bad = summary(); process.exit(bad ? 1 : 0);

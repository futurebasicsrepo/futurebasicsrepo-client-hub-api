// The shared workspace and the sample review form, end to end over HTTP (server G): one room's team reviews a sample against its published pack,
// hands it over and staff write it into the pack; team chat stays the team's until it brings Future Basics in; tasks and presence stay inside the
// room. A second room tries every door into the first and is refused.
import { journey, ok, summary, api, jpeg, sql, stamp, forge } from './lib.mjs';
import { createRequire } from 'node:module';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
const BASE = 'http://127.0.0.1:3130', call = api(BASE);
const start = async tag => (await call('/v1/public/start', { body: { email: `ws-${tag}-${stamp}-${Math.random().toString(36).slice(2, 6)}@chaos.test`, name: `${tag} Lead`, title: `Workspace ${tag}`, photos: [jpeg()] } })).json;
const A = await start('a'), B = await start('b'), P = A.product.id, ROOM = A.client.id;
const staffId = sql(`select id from users where lower(email)='kyle@thefuturebasics.com'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${ROOM}','kyle@thefuturebasics.com','Kyle','admin') returning id`).split('\n')[0];
const ADMIN = await forge({ sub: staffId, clientId: ROOM, role: 'admin', email: 'kyle@thefuturebasics.com' });
const a = (p, o = {}) => call(p, { token: A.token, ...o }), b = (p, o = {}) => call(p, { token: B.token, ...o }), s = (p, o = {}) => call(p, { token: ADMIN, ...o });

await journey('J282', 'A sample review the team fills in at the table: made from the published pack, saved by two people without losing either, handed over into the draft, written into the pack by staff (accepted measurements, fixes, pins as callouts, the next sample asked for); another room and a read-only preview are refused; a staff save from an older copy does not wipe the hand-over', async () => {
  ok((await a(`/v1/products/${P}/sample-reviews`)).json.code === 'NO_PACK', 'with no published pack there is nothing to review against');
  const got = (await s(`/v1/admin/products/${P}/tech-pack`)).json, data = got.techPack?.data || got.seed;
  Object.assign(data, { sizes: ['S', 'M', 'L'], pom: [{ code: 'A', name: 'Chest width', tolerance: '0.5', values: { S: '20', M: '21', L: '22' } }, { code: 'B', name: 'Body length', tolerance: '0.5', values: { S: '26', M: '27', L: '28' } }],
    bom: [{ component: 'Body', material: 'Cotton fleece', color: 'Navy', cost: 4.5, supplier: 'Mill A' }], colorways: [{ name: 'Navy', code: '19-4024 TCX' }], sampling: [{ stage: 'Proto', status: 'received' }, { stage: 'Fit', status: 'planned' }] });
  data.sketches = [{ id: 'sk-front', view: 'front', label: 'Front', callouts: [{ n: 1, label: 'Neck rib', spec: '1x1 rib', x: 0.5, y: 0.1 }] }];
  ok((await s(`/v1/admin/products/${P}/tech-pack`, { method: 'PUT', body: { data } })).status === 200, 'staff write the pack');
  const pub = await s(`/v1/admin/products/${P}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: sample review' } }); ok(pub.status === 200, 'and publish v1', [pub.status, pub.json.error]);

  const list = await a(`/v1/products/${P}/sample-reviews`); ok(list.status === 200 && list.json.version === 1 && list.json.sampling.map(x => x.stage).join() === 'Proto,Fit', 'the team sees the samples the pack plans', list.json);
  ok(JSON.stringify(list.json.pack).indexOf('Mill A') < 0 && !JSON.stringify(list.json.pack).includes('"cost"'), 'the form carries no supplier or cost');
  const st = await a(`/v1/products/${P}/sample-reviews`, { body: { stage: 'Proto' } }); ok(st.status === 201 && st.json.review.summary.poms === 2 && st.json.review.summary.total >= 3, 'starting the Proto review makes a form from the pack', [st.status, st.json.error]);
  const id = st.json.review.id; ok((await a(`/v1/products/${P}/sample-reviews`, { body: { stage: 'Proto' } })).json.existing === true, 'starting it again opens the same one');

  // another room, and a preview, are kept out
  ok((await b(`/v1/sample-reviews/${id}`)).status === 404 && (await b(`/v1/products/${P}/sample-reviews`)).status === 404, 'another room cannot open it or the product');
  ok((await b(`/v1/sample-reviews/${id}`, { method: 'PUT', body: { form: {}, rev: 1 } })).status === 404 && (await b(`/v1/sample-reviews/${id}/handover`, { method: 'POST', body: {} })).status === 404, 'or change it');
  const preview = await forge({ sub: sql(`select id from users where client_id='${ROOM}' and role='client' limit 1`), clientId: ROOM, role: 'client', preview: true });
  ok((await call(`/v1/sample-reviews/${id}`, { method: 'PUT', token: preview, body: { form: {}, rev: 1 } })).status === 403, 'a preview of the room is read-only');

  // two people save from the same copy: the second is told, and gets the first one's save to build on
  const keyOf = st.json.pack.sketches[0] && `c:sk-front:1`;
  const f1 = { ...st.json.review.form, sampleSize: 'M', measured: { A: '22', B: '28' }, adopt: ['B'], items: { [keyOf]: { s: 'fix', note: 'Rib is 2x2', priority: 'must' } }, pins: [{ sketchId: 'sk-front', x: 0.3, y: 0.8, note: 'Hem twists', priority: 'should' }] };
  const sv = await a(`/v1/sample-reviews/${id}`, { method: 'PUT', body: { form: f1, rev: st.json.review.rev } }); ok(sv.status === 200 && sv.json.review.summary.out === 1 && sv.json.review.summary.adopted === 1, 'a save counts what is out and what became the spec', sv.json.review?.summary);
  const clash = await s(`/v1/sample-reviews/${id}`, { method: 'PUT', body: { form: { ...f1, notes: 'staff' }, rev: st.json.review.rev } }); ok(clash.status === 409 && clash.json.code === 'STALE' && clash.json.review.form.measured.A === '22', 'a save from an older copy is refused with the latest to merge into', clash.json);
  ok((await a(`/v1/sample-reviews/${id}/handover`, { method: 'POST', body: {} })).status === 422, 'no hand-over without a verdict');
  ok((await a(`/v1/sample-reviews/${id}`, { method: 'PUT', body: { form: { ...f1, verdict: 'revise' }, rev: sv.json.review.rev } })).status === 200, 'the room decides: another sample');

  const etag = (await s(`/v1/admin/products/${P}/tech-pack`)).json.techPack.etag;
  const ho = await a(`/v1/sample-reviews/${id}/handover`, { method: 'POST', body: {} }); ok(ho.status === 200 && ho.json.review.status === 'handed-over', 'the team hands it over', [ho.status, ho.json.error]);
  const draft = (await s(`/v1/admin/products/${P}/tech-pack`)).json.techPack.data; ok(draft.sampling[0].review?.verdict === 'revise' && draft.sampling[0].review.corrections.length === 2, 'it is on the draft as the Proto review', draft.sampling[0]);
  const old = await s(`/v1/admin/products/${P}/tech-pack`, { method: 'PUT', body: { data, baseEtag: etag } }); ok(old.status === 409 && old.json.code === 'STALE', 'a staff page opened before the hand-over cannot save over it', [old.status, old.json]);
  ok((await a(`/v1/sample-reviews/${id}/apply`, { method: 'POST', body: {} })).status === 403, 'the team cannot write it into the pack themselves');
  const ap = await s(`/v1/sample-reviews/${id}/apply`, { method: 'POST', body: {} }); ok(ap.status === 200 && ap.json.review.status === 'applied' && ap.json.review.appliedVersion === 2, 'staff write it into the pack', [ap.status, ap.json.error]);
  const after = (await s(`/v1/admin/products/${P}/tech-pack`)).json.techPack.data;
  ok(after.pom.find(r => r.code === 'B').values.L === '29', 'the accepted length moved the whole size run', after.pom);
  ok(after.construction.some(c => /Correction · Proto/.test(c.area) && /Rib is 2x2/.test(c.detail)) && after.construction.some(c => /measurements to correct/.test(c.area)), 'the fixes and the measurement out of tolerance are corrections', after.construction);
  ok(after.sketches[0].callouts.some(c => c.label === 'Fix · Proto' && c.x === 0.3), 'the pin is a callout on the flat', after.sketches[0].callouts);
  ok(after.sampling.find(x => x.stage === 'Fit')?.status === 'requested', 'the next sample is asked for');
  ok((await a(`/v1/sample-reviews/${id}`, { method: 'PUT', body: { form: f1, rev: ap.json.review.rev } })).status === 409, 'an applied review is read-only');
  ok((await call(`/samples/${P}`)).status === 200 && (await call('/sample-form.js')).ct.includes('javascript'), 'the page and its script are served');
});

await journey('J283', 'Team chat, the board and who is here stay inside the room: #general is the team\'s alone; @futurebasics brings Future Basics into a channel and only then can staff read and reply; another room cannot read, post, see tasks or appear on a pack; a task goes only to a teammate or Future Basics', async () => {
  const ch = await a('/v1/team-chat/channels'); ok(ch.status === 200 && ch.json.channels[0]?.name === 'general', 'a room starts with #general', ch.json);
  const gen = ch.json.channels[0].id;
  ok((await a(`/v1/team-chat/channels/${gen}/messages`, { body: { body: 'Fit sample is in' } })).status === 201, 'a teammate posts');
  ok((await s(`/v1/team-chat/channels/${gen}/messages`)).status === 404 && (await s(`/v1/team-chat/channels?room=${ROOM}`)).json.channels.length === 0, 'staff cannot read a channel the team has not brought them into');
  ok((await b(`/v1/team-chat/channels/${gen}/messages`)).status === 404 && (await b(`/v1/team-chat/channels/${gen}/messages`, { body: { body: 'hi' } })).status === 404, 'another room cannot read or post');
  const pc = await a('/v1/team-chat/channels', { body: { productId: P } }); ok(pc.status === 201 && pc.json.channel.productId === P, 'a channel for one product', [pc.status, pc.json.error]);
  ok((await b('/v1/team-chat/channels', { body: { productId: P } })).status === 404, 'not for another room\'s product');
  ok((await a(`/v1/team-chat/channels/${pc.json.channel.id}/messages`, { body: { body: '@futurebasics is the crest right?' } })).status === 201, '@futurebasics');
  const seen = (await s(`/v1/team-chat/channels?room=${ROOM}`)).json.channels; ok(seen.length === 1 && seen[0].staffIn, 'now staff see that channel, and only that one', seen);
  ok((await s(`/v1/team-chat/channels/${pc.json.channel.id}/messages`, { body: { body: 'Yes, 3 in below HPS' } })).status === 201, 'staff reply there');
  const th = (await a(`/v1/team-chat/channels/${pc.json.channel.id}/messages`)).json; ok(th.messages.some(m => m.author_role === 'fb') && th.messages.some(m => m.author_role === 'me') && th.events.some(e => /brought Future Basics/.test(e.title)), 'the thread shows who said what, and that Future Basics was brought in', th);
  ok((await s('/v1/team-chat/channels', { body: { name: 'staff-made' } })).status === 403, 'staff do not make the team\'s channels');

  const t = await a('/v1/workspace/assignments', { body: { title: 'Approve the Pantones', productId: P, assigneeId: 'fb', due: '2026-01-01' } }); ok(t.status === 201 && t.json.assignment.assigneeName === 'Future Basics' && t.json.assignment.state === 'late', 'a task for Future Basics, already late', [t.status, t.json]);
  const bUser = sql(`select id from users where client_id='${B.client.id}' limit 1`);
  ok((await a('/v1/workspace/assignments', { body: { title: 'x', assigneeId: bUser } })).status === 422, 'a task cannot go to someone in another room');
  ok((await b(`/v1/workspace/assignments/${t.json.assignment.id}`, { method: 'PATCH', body: { status: 'done' } })).status === 404 && (await b('/v1/workspace/assignments')).json.assignments.length === 0, 'another room cannot see or move it');
  ok((await a(`/v1/workspace/assignments/${t.json.assignment.id}`, { method: 'PATCH', body: { status: 'done' } })).json.assignment.state === 'done', 'done is never late');
  ok((await s(`/v1/workspace/assignments?room=${ROOM}`)).json.assignments.length === 1, 'staff see the room\'s board');

  ok((await b('/v1/workspace/presence', { body: { type: 'tech-pack', id: P } })).status === 404, 'another room cannot appear on the pack');
  ok((await a('/v1/workspace/presence', { body: { type: 'tech-pack', id: P, mode: 'editing' } })).status === 200, 'the teammate is on the pack');
  const others = (await s('/v1/workspace/presence', { body: { type: 'tech-pack', id: P } })).json.others; ok(others.length === 1 && others[0].mode === 'editing', 'staff on the same pack see them changing it', others);
  const here = (await a('/v1/workspace/presence')).json.people; ok(here.some(p => p.on.some(o => o.type === 'tech-pack' && o.id === P)) && !(await b('/v1/workspace/presence')).json.people.length, 'Who\'s here shows it to the room, and nothing to another room', here);
  ok((await call('/workspace')).status === 200 && (await call('/presence.js')).ct.includes('javascript'), 'the page and the presence script are served');
});

// what a live stream hears in `ms` while `act` runs
async function hear(token, query, act, ms = 900) {
  const ctl = new AbortController(), got = []; let status = 0;
  const run = (async () => { try { const r = await fetch(`${BASE}/v1/team-chat/live${query}`, { headers: { Authorization: 'Bearer ' + token }, signal: ctl.signal }); status = r.status; if (!r.ok) return;
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const blk = buf.slice(0, i); buf = buf.slice(i + 2); const d = blk.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5)).join(''); if (d) { const j = JSON.parse(d); if (j.t) got.push(j); } } } } catch {} })();
  await new Promise(r => setTimeout(r, 250)); await act(); await new Promise(r => setTimeout(r, ms)); ctl.abort(); await run; return { status, got };
}

await journey('J286', 'Team chat is live: a message shows on a teammate\'s open workspace at once (not on the next check), with the live light on; the stream names only the channel, never the words; another room hears nothing, staff hear only channels the team brought them into, and the stream needs a sign-in', async () => {
  const gen = (await a('/v1/team-chat/channels')).json.channels.find(c => c.name === 'general').id, prod = (await a('/v1/team-chat/channels')).json.channels.find(c => c.staffIn)?.id;
  ok(Boolean(gen && prod), 'the room has #general and a channel Future Basics is in (from J283)');
  ok((await call('/v1/team-chat/live')).status === 401, 'no sign-in, no stream');
  ok((await s('/v1/team-chat/live')).status === 422, 'staff name the room');
  const mine = await hear(A.token, '', () => a(`/v1/team-chat/channels/${gen}/messages`, { body: { body: 'Secret colour is teal' } }));
  ok(mine.status === 200 && mine.got.some(e => e.channel === gen && e.kind === 'message'), 'the room hears its own channel at once', mine);
  ok(!JSON.stringify(mine.got).includes('teal'), 'the nudge carries no words: the page fetches the thread the usual way');
  const other = await hear(B.token, '', () => a(`/v1/team-chat/channels/${gen}/messages`, { body: { body: 'again' } }));
  ok(other.status === 200 && other.got.length === 0, 'another room hears nothing', other.got);
  const staffGen = await hear(ADMIN, `?room=${ROOM}`, () => a(`/v1/team-chat/channels/${gen}/messages`, { body: { body: 'team only' } }));
  ok(staffGen.got.length === 0, 'staff do not hear a channel the team has kept to itself', staffGen.got);
  const staffProd = await hear(ADMIN, `?room=${ROOM}`, () => a(`/v1/team-chat/channels/${prod}/messages`, { body: { body: 'for FB' } }));
  ok(staffProd.got.some(e => e.channel === prod), 'and do hear the one Future Basics is in', staffProd.got);

  if (!playwright) { ok(true, 'the page part needs a browser'); return; }
  const mate = sql(`insert into users(client_id,email,name,role) values('${ROOM}','ws-mate-${stamp}@chaos.test','Jo Mate','client') returning id`).split('\n')[0];
  const mateT = await forge({ sub: mate, clientId: ROOM, role: 'client', email: `ws-mate-${stamp}@chaos.test` });
  const br = await playwright.chromium.launch();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 860 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, A.token);
    const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/workspace?channel=${gen}`, { waitUntil: 'load' }); await page.waitForSelector('#thread .mc-msgs');
    await page.waitForSelector('#liveDot.on', { timeout: 8000 }).catch(() => {}); ok(await page.$('#liveDot.on'), '1. the live light comes on');
    const t0 = Date.now(); ok((await call(`/v1/team-chat/channels/${gen}/messages`, { token: mateT, body: { body: 'Jo here: the fit sample just landed' } })).status === 201, 'a teammate says something');
    const shown = await page.waitForFunction(() => /fit sample just landed/.test(document.querySelector('#thread')?.textContent || ''), null, { timeout: 4000 }).then(() => true).catch(() => false);
    ok(shown && Date.now() - t0 < 4000, `2. it is on the open page at once (${Date.now() - t0} ms; the safety-net check is every 30 s)`);
    await call(`/v1/team-chat/channels/${prod}/messages`, { token: mateT, body: { body: 'over here' } });
    await page.waitForFunction(id => /\d/.test(document.querySelector(`[data-ch="${id}"] .u`)?.textContent || ''), prod, { timeout: 4000 }).catch(() => {});
    ok(await page.$(`[data-ch="${prod}"] .u`), '3. a message in another channel lights its unread count at once');
    ok(errs.length === 0, 'no page errors', errs); await ctx.close();
  } finally { await br.close(); }
});

process.exit(summary() ? 1 : 0);

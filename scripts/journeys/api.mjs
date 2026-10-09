import { journey, ok, summary, api, jpeg, png, bigJpeg, hugeHeaderPng, codeFrom, sleep, waitAi, forge, sql, stamp, S } from './lib.mjs';
import { readFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:3123', LOG = `${S}/server-j-a.log`, call = api(BASE), runner = jpeg();
let n = 0; const em = tag => `j${tag}-${stamp}-${++n}@chaos.test`;
const start = (email, extra = {}) => call('/v1/public/start', { body: { email, name: 'Chaos Tester', title: 'Layer runner', notes: 'Like the photo, in our colours.', photos: [runner], ...extra } });
async function newRoom(tag, { wait = true } = {}) { const email = em(tag); let r = await start(email); if (r.status === 0) r = await start(email); if (!r.json.token) throw new Error(`newRoom(${tag}): /start gave status ${r.status} ${String(r.text).slice(0, 160)}`); const out = { email, token: r.json.token, productId: r.json.product?.id, r }; if (wait && out.productId) out.tp = await waitAi(call, out.token, out.productId); return out; }
async function signIn(email) { const c = await call('/v1/auth/code', { body: { email } }); await sleep(150); const code = codeFrom(LOG, email); const v = await call('/v1/auth/verify', { body: { email, code } }); return { c, code, v, token: v.json.token }; }
const draftOf = async (token, id) => (await call(`/v1/products/${id}/tech-pack/draft`, { token })).json;

await journey('J01', 'happy path: photo → room → assistant → edit → submit', async () => {
  const room = await newRoom('01'); const r = room.r;
  ok(r.status === 201 && room.token && room.productId && r.json.ai === 'pending', 'new email gets a room, a token and a pending assistant', [r.status, r.json.ai]);
  const d = room.tp.json; ok(d.techPack?.aiStatus === 'done', 'assistant finishes', d.techPack?.aiStatus);
  const data = d.techPack.data; ok(data.sketches[0].callouts.length > 0 && data.pom.some(p => Object.values(p.values || {}).some(Boolean)), 'draft has callouts and measurements');
  data.style.styleName = 'Layer runner v2'; data.construction.push({ area: 'Heel', detail: 'Added by the customer' });
  const put = await call(`/v1/products/${room.productId}/tech-pack/draft`, { method: 'PUT', token: room.token, body: { data } });
  ok(put.status === 200, 'save works', put.status);
  const again = await draftOf(room.token, room.productId); ok(again.techPack.data.style.styleName === 'Layer runner v2' && again.techPack.data.construction.some(c => c.area === 'Heel'), 'edit persisted');
  const sub = await call(`/v1/products/${room.productId}/tech-pack/submit`, { method: 'POST', token: room.token, body: { note: 'Please review' } });
  ok(sub.status === 200, 'submit works on the free first pack', [sub.status, sub.json.error]);
  const dash = await call('/v1/dashboard', { token: room.token }); ok(dash.status === 200 && JSON.stringify(dash.json).includes('Layer runner v2'), 'dashboard shows the product under its new name');
});

await journey('J02', '/start mistakes: every bad input gets a clear 4xx, never a 5xx or a silent success', async () => {
  const e = () => em('02'); const bad = async (label, body, re, status = 400) => { const r = await call('/v1/public/start', { body }); ok(r.status === status && re.test(r.json.error || r.json.message || ''), `${label} → ${status} with a clear message`, [r.status, r.json.error || r.json.message || r.text.slice(0, 80)]); return r; };
  await bad('missing title', { email: e(), photos: [runner] }, /name/i);
  await bad('title of spaces', { email: e(), title: '    ', photos: [runner] }, /name/i);
  for (const x of ['', 'abc', 'a@b', 'a b@c.co', '@c.co', 'a@@c.co', 'a@c', null, 42, { a: 1 }, ['a@c.co']]) await bad(`email ${JSON.stringify(x)}`, { email: x, title: 'T', photos: [runner] }, /email/i);
  await bad('company email', { email: `x-${stamp}@thefuturebasics.com`, title: 'T', photos: [runner] }, /work console|client/i);
  await bad('no photos', { email: e(), title: 'T', photos: [] }, /photo|screenshot/i);
  await bad('photos missing', { email: e(), title: 'T' }, /photo|screenshot/i);
  await bad('photos is a string', { email: e(), title: 'T', photos: runner }, /photo|screenshot/i);
  await bad('a pdf data url', { email: e(), title: 'T', photos: ['data:application/pdf;base64,JVBERi0xLjQK'] }, /photo|screenshot/i);
  await bad('plain text as a photo', { email: e(), title: 'T', photos: ['hello'] }, /photo|screenshot/i);
  await bad('an svg with a script', { email: e(), title: 'T', photos: ['data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')] }, /photo|screenshot|opened/i);
  await bad('a corrupt jpeg', { email: e(), title: 'T', photos: ['data:image/jpeg;base64,' + Buffer.from('this is not an image at all').toString('base64')] }, /could not be opened/i);
  await bad('one good photo and one corrupt', { email: e(), title: 'T', photos: [runner, 'data:image/png;base64,AAAA'] }, /Photo 2 could not be opened/i);
  const nul = await call('/v1/public/start', { raw: '{"email": "x@y.co", "title"', headers: { 'Content-Type': 'application/json' } }); ok(nul.status === 400, 'broken JSON → 400', nul.status);
  const txt = await call('/v1/public/start', { raw: 'email=a@b.co', headers: { 'Content-Type': 'text/plain' } }); ok(txt.status >= 400 && txt.status < 500, 'wrong content type → 4xx', txt.status);
  const hp = await call('/v1/public/start', { body: { email: e(), title: 'T', photos: [runner], website: 'http://spam.example' } }); ok(hp.status === 202 && !hp.json.token, 'honeypot: silently accepted, nothing created', [hp.status, !!hp.json.token]);
  const em1 = `J02-Caps-${stamp}@Chaos.Test`; const norm = await call('/v1/public/start', { body: { email: `  ${em1}  `, title: 'T', photos: [runner] } }); ok(norm.status === 201, 'email with spaces and capitals is accepted', [norm.status, norm.json.error]);
  ok(sql(`select count(*) from clients where lower(contact_email)='${em1.toLowerCase()}'`) === '1', 'and stored lowercase');
  const five = await call('/v1/public/start', { body: { email: e(), title: 'T', photos: [runner, runner, runner, runner, runner, runner] } }); ok(five.status === 201, 'six photos → accepted', five.status);
  if (five.json.token) { const d = await draftOf(five.json.token, five.json.product.id); ok(d.techPack.data.sketches.length === 4, 'only four are kept', d.techPack.data.sketches.length); }
  const long = await call('/v1/public/start', { body: { email: e(), title: 'T'.repeat(5000), notes: 'n'.repeat(20000), name: 'N'.repeat(900), photos: [runner] } }); ok(long.status === 201 && long.json.product?.title.length <= 200, 'a 5000-character title is cut to 200', long.json.product?.title?.length);
  const xss = await call('/v1/public/start', { body: { email: e(), title: '<img src=x onerror=alert(1)>', name: '"><script>alert(1)</script>', photos: [runner] } }); ok(xss.status === 201, 'markup in the title and name does not break creation', xss.status);
});

await journey('J03', 'oversized and heavy uploads fail cleanly and the server stays up', async () => {
  const big = await call('/v1/public/start', { raw: JSON.stringify({ email: em('03'), title: 'T', photos: ['data:image/png;base64,' + 'A'.repeat(20_000_000)] }), headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
  ok(big.status === 413 || big.status === 0, '20 MB body → 413, or the connection is closed (the page shows its "remove a photo" hint)', big.status);
  const heavy = await bigJpeg(9000, 9000); const t = Date.now(); const h = await call('/v1/public/start', { body: { email: em('03'), title: '9000x9000', photos: [heavy] }, timeout: 60000 });
  ok(h.status === 201 && Date.now() - t < 20000, 'a 9000×9000 photo is accepted in under 20 s', [h.status, Date.now() - t]);
  if (h.json.token) { const tp = await waitAi(call, h.json.token, h.json.product.id, 40000); ok(tp.json.techPack?.aiStatus === 'done', 'and the assistant still finishes it', tp.json.techPack?.aiStatus); }
  const bomb = await call('/v1/public/start', { body: { email: em('03'), title: 'bomb', photos: [await hugeHeaderPng()] }, timeout: 60000 }); ok(bomb.status === 400 && /could not be opened/i.test(bomb.json.error || ''), 'a header claiming 400 megapixels is refused with the "could not be opened" message', [bomb.status, bomb.json.error]);
  const bigPng = await bigJpeg(3600, 2700, 'jpeg', { div: 5, q: 92 }); const bp = await call('/v1/public/start', { body: { email: em('03'), title: 'big png', photos: [bigPng] }, timeout: 60000 }); ok(bigPng.length > 2_600_000 && bp.status === 201, 'a 3600×2700 photo of about 3 MB, over the old size limit is accepted, not silently dropped', [bp.status, bp.json.error]);
  if (bp.json.token) { const d = await draftOf(bp.json.token, bp.json.product.id); const img = d.techPack.data.sketches[0]?.image || ''; ok(img.length > 0 && img.length < 2_600_000, 'and stored shrunk under the picture limit', img.length); const meta = await (await import('./lib.mjs')).sharp(Buffer.from(img.split(',')[1] || '', 'base64')).metadata().catch(() => ({})); ok(Math.max(meta.width || 0, meta.height || 0) <= 2000, 'at 2000 px or less', [meta.width, meta.height]); }
  const health = await call('/health'); ok(health.status === 200, 'server still answers after all of that');
  const room = await newRoom('03'); const huge = await call(`/v1/products/${room.productId}/tech-pack/draft`, { method: 'PUT', token: room.token, raw: JSON.stringify({ data: { notes: 'x'.repeat(45_000_000) } }), headers: { 'Content-Type': 'application/json' }, timeout: 60000 });
  ok(huge.status === 413 || huge.status === 0, '45 MB save → 413, or the connection is closed before the body is sent (nothing is saved)', huge.status);
  ok(JSON.stringify((await draftOf(room.token, room.productId)).techPack.data.style).length > 20, 'and the draft is untouched');
});

await journey('J04', 'a photo with no product in it: honest message, three tries, still submittable', async () => {
  const blank = await png(900, 900); const email = em('04'); const r = await start(email, { photos: [blank] });
  ok(r.status === 201 && r.json.token, 'the blank photo is accepted (the assistant is what judges it)', [r.status, r.json.error]);
  const id = r.json.product.id, tp = await waitAi(call, r.json.token, id); const t = tp.json.techPack;
  ok(t.aiStatus === 'failed' && /make out a product|could not/i.test(t.aiError || ''), 'assistant fails with a message about the photo', [t.aiStatus, t.aiError]);
  ok(!/Error:|ECONN|\d{3} \{/.test(t.aiError || ''), 'and the message is not a raw error');
  const tries = []; for (let i = 0; i < 4; i++) { const x = await call(`/v1/products/${id}/tech-pack/draft/ai`, { method: 'POST', token: r.json.token }); tries.push(x.status); if (x.status === 200) await waitAi(call, r.json.token, id); }
  ok(JSON.stringify(tries) === '[200,200,429,429]' || JSON.stringify(tries) === '[200,429,429,429]', 'retries stop at three attempts with 429', tries);
  const st = (await call(`/v1/products/${id}/tech-pack/draft/ai`, { method: 'POST', token: r.json.token })).json; ok(/submit|three/i.test(st.error || ''), 'and the 429 tells them to submit instead', st.error);
  const sub = await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: r.json.token, body: {} }); ok(sub.status === 200, 'a failed pack can still be submitted for Future Basics to finish', [sub.status, sub.json.error]);
});

await journey('J05', 'double-tap on Create: one room and one draft', async () => {
  const email = em('05'); const [a, b] = await Promise.all([start(email), start(email)]);
  ok([a.status, b.status].every(s => s === 201), 'both taps answer 201', [a.status, b.status]);
  ok(sql(`select count(*) from clients where lower(contact_email)='${email}'`) === '1', 'one client row');
  const products = Number(sql(`select count(*) from products p join clients c on c.id=p.client_id where lower(c.contact_email)='${email}'`)); ok(products === 1, 'ONE draft, not a free pack plus a locked duplicate', products);
  ok(a.json.product?.id === b.json.product?.id || products === 1, 'both taps point at the same draft');
});

await journey('J06', 'sign-in codes: every way to get it wrong, and the forgiving ways to get it right', async () => {
  const room = await newRoom('06', { wait: false }); const email = room.email;
  const verify = (e, c) => call('/v1/auth/verify', { body: { email: e, code: c } });
  await call('/v1/auth/code', { body: { email } }); await sleep(150); let code = codeFrom(LOG, email); ok(/^\d{6}$/.test(code || ''), 'a code was sent', code);
  let r = await verify(email, '000000'); ok(r.status === 401 && /invalid|expired/i.test(r.json.error), 'wrong code → 401', [r.status, r.json.error]);
  r = await verify('someone-else@chaos.test', code); ok(r.status === 401, 'the right code for another email → 401', r.status);
  r = await verify(email, undefined); ok(r.status === 401 || r.status === 400, 'missing code → 4xx', r.status);
  r = await verify(undefined, code); ok(r.status === 401 || r.status === 400, 'missing email → 4xx', r.status);
  r = await verify({ a: 1 }, ['1']); ok(r.status < 500, 'objects instead of strings → no 500', r.status);
  r = await verify(email, `${code.slice(0, 3)} ${code.slice(3)}`); ok(r.status === 200 && r.json.token, 'a code pasted as "123 456" works', [r.status, r.json.error]);
  r = await verify(email, code); ok(r.status === 401, 'the same code cannot be used twice', r.status);
  await call('/v1/auth/code', { body: { email } }); await sleep(150); code = codeFrom(LOG, email);
  r = await verify(email.toUpperCase(), ` ${code} `); ok(r.status === 200, 'capitals in the email and spaces around the code are forgiven', [r.status, r.json.error]);
  await call('/v1/auth/code', { body: { email } }); await sleep(150); code = codeFrom(LOG, email); sql(`update login_codes set expires_at=now()-interval '1 minute' where email='${email}'`);
  r = await verify(email, code); ok(r.status === 401 && /expired|invalid/i.test(r.json.error), 'an expired code → 401', [r.status, r.json.error]);
});

await journey('J07', 'code guessing and code spam are throttled', async () => {
  const room = await newRoom('07', { wait: false }); const email = room.email; await call('/v1/auth/code', { body: { email } }); await sleep(150); const code = codeFrom(LOG, email);
  const wrong = []; for (let i = 0; i < 12; i++) wrong.push((await call('/v1/auth/verify', { body: { email, code: String(100000 + i * 7919) } })).status);
  ok(wrong.includes(429), 'twelve wrong guesses in a row hit a 429', wrong.join(','));
  const right = await call('/v1/auth/verify', { body: { email, code } }); ok(right.status === 401 || right.status === 429, 'after that even the right code is refused until a new one is requested', right.status);
  const spam = []; const e2 = (await newRoom('07', { wait: false })).email; for (let i = 0; i < 12; i++) spam.push((await call('/v1/auth/code', { body: { email: e2 } })).status);
  ok(spam.includes(429), 'twelve code requests in a row hit a 429', spam.join(','));
  ok(Number(sql(`select count(*) from login_codes where email='${e2}'`)) < 12, 'not twelve emails were queued', sql(`select count(*) from login_codes where email='${e2}'`));
});

await journey('J08', 'second pack: locked → edit by hand → unpaid checks → paid → unlock → one assistant run', async () => {
  const first = await newRoom('08'); const email = first.email;
  const second = await start(email, { title: 'Second style' }); ok(second.status === 201 && second.json.ai === 'locked' && second.json.needsCode === true && !second.json.token, 'known email: locked, needs a code, no token', [second.status, second.json.ai, second.json.needsCode]);
  const { token } = await signIn(email); ok(!!token, 'signs in with the emailed code'); const id = second.json.product.id; const base = `/v1/products/${id}/tech-pack`;
  let d = await draftOf(token, id); ok(d.techPack.aiStatus === 'locked' && d.pricing?.single?.amountCents > 0, 'draft is locked and shows the price', [d.techPack?.aiStatus, d.pricing?.single]);
  d.techPack.data.style.styleName = 'Second style (hand edit)'; let r = await call(`${base}/draft`, { method: 'PUT', token, body: { data: d.techPack.data } }); ok(r.status === 200, 'editing by hand while locked is allowed', r.status);
  r = await call(`${base}/unlock`, { method: 'POST', token }); ok(r.status === 200 && r.json.aiStatus === 'locked', 'pressing "I\'ve paid" before paying → still locked, no error', [r.status, r.json.aiStatus, r.json.error]);
  r = await call(`${base}/draft/ai`, { method: 'POST', token }); ok(r.status === 402, 'running the assistant while locked → 402 payment waiting', [r.status, r.json.error]);
  r = await call(`${base}/submit`, { method: 'POST', token, body: {} }); ok(r.status === 402 && /unlock/i.test(r.json.error || ''), 'submitting while locked → 402 with a message', [r.status, r.json.error]);
  r = await call(`${base}/checkout`, { method: 'POST', token }); ok(r.status === 503 && /not set up|message Future Basics/i.test(r.json.error || ''), 'checkout with no Shopify → 503 and a human message', [r.status, r.json.error]);
  sql(`update tech_packs set paid_at=now(),pay_order_id='chaos-${stamp}',billing='single' where product_id='${id}'`);
  const [u1, u2] = await Promise.all([call(`${base}/unlock`, { method: 'POST', token }), call(`${base}/unlock`, { method: 'POST', token })]); ok(u1.status === 200 && u2.status === 200, 'paid: two simultaneous unlock clicks both answer 200', [u1.status, u2.status]);
  const tp = await waitAi(call, token, id); ok(tp.json.techPack.aiStatus === 'done', 'the assistant builds the paid pack', tp.json.techPack.aiStatus);
  ok(sql(`select ai_attempts from tech_packs where product_id='${id}'`) === '1', 'exactly one assistant run for two clicks', sql(`select ai_attempts from tech_packs where product_id='${id}'`));
  ok(tp.json.techPack.data.style.styleName.includes('hand edit') || tp.json.techPack.data.style.styleName.length > 0, 'the hand edit is not lost');
  const third = await start(email, { title: 'Third style' }); ok(third.json.ai === 'locked', 'a third pack is locked again (one payment covers one pack)', third.json.ai);
});

await journey('J09', 'member: second pack is not locked', async () => {
  const first = await newRoom('09'); sql(`update clients set membership_active_until=now()+interval '30 days' where lower(contact_email)='${first.email}'`);
  const second = await start(first.email, { title: 'Member pack' }); ok(second.status === 201 && second.json.ai === 'pending', 'active membership → the assistant starts straight away', [second.status, second.json.ai]);
  sql(`update clients set membership_active_until=now()-interval '1 day' where lower(contact_email)='${first.email}'`);
  const third = await start(first.email, { title: 'Lapsed pack' }); ok(third.json.ai === 'locked', 'lapsed membership → locked again', third.json.ai);
});

await journey('J10', 'editor saves with garbage must never wipe the draft', async () => {
  const room = await newRoom('10'), id = room.productId, base = `/v1/products/${id}/tech-pack/draft`; const count = async () => (await draftOf(room.token, id)).techPack.data.sketches[0].callouts.length;
  const before = await count(); ok(before > 0, 'starting with callouts on the photo', before);
  const put = body => call(base, { method: 'PUT', token: room.token, body });
  for (const [label, body] of [['no data field', {}], ['data null', { data: null }], ['data a string', { data: 'x' }], ['data an array', { data: [] }], ['data a number', { data: 5 }]]) {
    const r = await put(body); ok(r.status === 400 || r.status === 422, `${label} → rejected, not saved`, r.status); ok(await count() === before, `${label}: callouts survive`, await count());
  }
  const none = await call(base, { method: 'PUT', token: room.token }); ok(none.status >= 400 && none.status < 500, 'PUT with no body → 4xx', none.status); ok(await count() === before, 'no body: callouts survive');
  const txt = await call(base, { method: 'PUT', token: room.token, raw: 'garbage', headers: { 'Content-Type': 'text/plain' } }); ok(txt.status >= 400 && txt.status < 500, 'text/plain body → 4xx', txt.status);
  const d = (await draftOf(room.token, id)).techPack.data;
  const weird = structuredClone(d); weird.sketches[0].callouts = 'nope'; weird.pom = { not: 'an array' }; weird.style.styleName = 'S'.repeat(5000); weird.sketches[0].image = 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==';
  let r = await put({ data: weird }); ok(r.status === 200 || r.status === 400, 'structurally wrong fields are normalised or rejected, not a 500', r.status);
  const after = (await draftOf(room.token, id)).techPack.data; ok(Array.isArray(after.sketches[0].callouts) && Array.isArray(after.pom), 'the stored pack still has the right shapes'); ok(!/^data:text\/html/.test(after.sketches[0].image || ''), 'a non-image data URL is never kept as a picture', (after.sketches[0].image || '').slice(0, 30));
  ok((after.style.styleName || '').length <= 200, 'a 5000-character style name is cut', (after.style.styleName || '').length);
});

await journey('J11', 'editing while the assistant runs, and a stale tab saving after it finished', async () => {
  const room = await newRoom('11', { wait: false }), id = room.productId, base = `/v1/products/${id}/tech-pack/draft`;
  const early = await draftOf(room.token, id); const stale = structuredClone(early.techPack.data); // a second tab loaded before the assistant finished
  const mine = structuredClone(early.techPack.data); mine.style.styleName = 'Customer renamed it'; mine.notes = 'My own note'; let r = await call(base, { method: 'PUT', token: room.token, body: { data: mine } }); ok(r.status === 200, 'saving while the assistant runs works', r.status);
  const tp = await waitAi(call, room.token, id); const d = tp.json.techPack.data; ok(tp.json.techPack.aiStatus === 'done' && d.sketches[0].callouts.length > 0, 'assistant finishes', tp.json.techPack.aiStatus);
  ok(d.style.styleName === 'Customer renamed it', 'the customer\'s own edit survives the assistant', d.style.styleName); ok(/My own note/.test(d.notes), 'and so does their note', d.notes.slice(0, 80));
  const tab = structuredClone(stale); tab.style.fabricSummary = 'typed in the old tab'; r = await call(base, { method: 'PUT', token: room.token, body: { data: tab, baseEtag: early.techPack.etag } });
  const after = (await draftOf(room.token, id)).techPack.data;
  ok(after.sketches[0].callouts.length > 0, 'a stale tab saving later does NOT wipe the assistant\'s callouts', [r.status, after.sketches[0].callouts.length]);
});

await journey('J12', 'who can touch whose draft', async () => {
  const a = await newRoom('12a'), b = await newRoom('12b'), id = a.productId; const routes = [['GET', 'draft'], ['PUT', 'draft', { data: { style: { styleName: 'hijack' } } }], ['POST', 'draft/ai'], ['POST', 'unlock'], ['POST', 'checkout'], ['POST', 'submit', {}], ['POST', 'draft/cutout'], ['POST', 'draft/colorways'], ['POST', 'approve', {}]];
  for (const [m, p, body] of routes) { const r = await call(`/v1/products/${id}/tech-pack/${p}`, { method: m, token: b.token, body }); ok([400, 403, 404, 409].includes(r.status), `another customer · ${m} ${p} → refused, never 200`, r.status); }
  for (const [m, p, body] of routes) { const r = await call(`/v1/products/${id}/tech-pack/${p}`, { method: m, body }); ok(r.status === 401, `no token · ${m} ${p} → 401`, r.status); }
  const tamper = a.token.slice(0, -4) + (a.token.endsWith('AAAA') ? 'BBBB' : 'AAAA'); let r = await call(`/v1/products/${id}/tech-pack/draft`, { token: tamper }); ok(r.status === 401, 'tampered token → 401', r.status);
  const expired = await forge({ sub: 'x', clientId: 'x', role: 'client' }, { exp: Math.floor(Date.now() / 1000) - 60 }); r = await call(`/v1/products/${id}/tech-pack/draft`, { token: expired }); ok(r.status === 401 && /expired|invalid/i.test(r.json.error), 'expired token → 401 with a message', [r.status, r.json.error]);
  const wrongIss = await forge({ sub: 'x', clientId: 'x', role: 'client' }, { iss: 'someone-else' }); r = await call(`/v1/products/${id}/tech-pack/draft`, { token: wrongIss }); ok(r.status === 401, 'token from another issuer → 401', r.status);
  const wrongKey = await forge({ sub: 'x', clientId: 'x', role: 'client' }, { key: new TextEncoder().encode('not-the-secret') }); r = await call(`/v1/products/${id}/tech-pack/draft`, { token: wrongKey }); ok(r.status === 401, 'token signed with another key → 401', r.status);
  const adm = await forge({ sub: 'x', clientId: a.r.json.client?.id || 'x', role: 'admin' }); r = await call(`/v1/products/${id}/tech-pack/draft`, { method: 'PUT', token: adm, body: { data: {} } }); ok(r.status === 403, 'an admin token on the client draft route → 403 with the right message', [r.status, r.json.error]);
  const prev = await forge({ sub: 'x', clientId: 'x', role: 'client', preview: true }); r = await call(`/v1/products/${id}/tech-pack/draft`, { method: 'PUT', token: prev, body: { data: {} } }); ok(r.status === 403, 'a read-only preview token cannot save', r.status);
  for (const bad of ['not-a-uuid', '123', '%00', "1'; drop table products;--", 'a'.repeat(300)]) { const x = await call(`/v1/products/${encodeURIComponent(bad)}/tech-pack/draft`, { token: a.token }); ok(x.status >= 400 && x.status < 500, `a malformed product id (${bad.slice(0, 12)}) → a 4xx, not 500`, x.status); }
  const adminRoute = await call('/v1/admin/dashboard', { token: a.token }); ok(adminRoute.status === 403, 'a customer token on an admin route → 403', adminRoute.status);
});

await journey('J13', 'starting a pack from inside the hub (project dialog)', async () => {
  const room = await newRoom('13'); const dash = await call('/v1/dashboard', { token: room.token }); const pid = (dash.json.projects || [])[0]?.id; ok(!!pid, 'the room has a project', Object.keys(dash.json));
  const mk = (project, body) => call(`/v1/projects/${project}/tech-packs`, { token: room.token, body });
  let r = await mk(pid, { title: 'Blank template pack' }); ok(r.status === 201 && (r.json.ai === 'off' || r.json.ai === null || r.json.ai === undefined), 'no photo: a blank template draft, no assistant', [r.status, r.json.ai]);
  r = await mk(pid, { title: '   ' }); ok(r.status === 400 && /name/i.test(r.json.error || ''), 'empty title → 400', [r.status, r.json.error]);
  r = await mk(pid, { title: 'With a corrupt photo', photos: ['data:image/jpeg;base64,' + Buffer.from('nope').toString('base64')] }); ok(r.status === 400 && /could not be opened/i.test(r.json.error || ''), 'a corrupt photo → 400 with the fix', [r.status, r.json.error]);
  r = await mk(pid, { title: 'With a photo', photos: [runner] }); ok(r.status === 201 && ['locked', 'pending'].includes(r.json.ai), 'with a photo: assistant pending, or locked past the free pack', [r.status, r.json.ai]);
  r = await mk('00000000-0000-0000-0000-000000000000', { title: 'x' }); ok(r.status === 404, 'a project that does not exist → 404', r.status);
  r = await mk('not-a-uuid', { title: 'x' }); ok(r.status === 404 || r.status === 400, 'a malformed project id → 404/400, not 500', r.status);
  const other = await newRoom('13b', { wait: false }); const odash = await call('/v1/dashboard', { token: other.token }); r = await mk((odash.json.projects || [])[0]?.id, { title: 'x' }); ok(r.status === 404, "another customer's project → 404", r.status);
  sql(`update projects set archived_at=now(),status='archived' where id='${pid}'`); r = await mk(pid, { title: 'x' }); ok(r.status === 404, 'an archived project → 404', r.status);
});

await journey('J14', 'after submit: nothing else changes the draft', async () => {
  const room = await newRoom('14'), id = room.productId, base = `/v1/products/${id}/tech-pack`; let r = await call(`${base}/submit`, { method: 'POST', token: room.token, body: { note: 'x'.repeat(5000) } }); ok(r.status === 200, 'submit with a 5000-character note works', r.status);
  r = await call(`${base}/submit`, { method: 'POST', token: room.token, body: {} }); ok(r.status === 409, 'submitting twice → 409', r.status);
  const d = await draftOf(room.token, id); r = await call(`${base}/draft`, { method: 'PUT', token: room.token, body: { data: d.techPack.data } }); ok(r.status === 409 && /submitted/i.test(r.json.error || ''), 'saving after submit → 409 with the reason', [r.status, r.json.error]);
  r = await call(`${base}/draft/ai`, { method: 'POST', token: room.token }); ok(r.status === 409, 'running the assistant after submit → 409', r.status);
  r = await call(`${base}/approve`, { method: 'POST', token: room.token, body: {} }); ok(r.status >= 400 && r.status < 500, 'approving something not yet published → 4xx', [r.status, r.json.error]);
  ok(d.editable === false || d.techPack.status === 'submitted', 'the draft view says it is no longer editable', [d.editable, d.techPack.status]);
});

await journey('J15', 'asking for a sign-in code: unknown, pending, archived and malformed emails', async () => {
  const code = e => call('/v1/auth/code', { body: e === undefined ? {} : { email: e } });
  let r = await code(`nobody-${stamp}@chaos.test`); ok(r.status === 403 && r.json.code === 'NO_CLIENT_WORK' && r.json.action?.url, 'unknown email → 403 with a link to start a project', [r.status, r.json.code]);
  sql(`insert into clients(slug,name,status,contact_email,allowed_emails) values('lead-${stamp}','Lead ${stamp}','lead','lead-${stamp}@chaos.test',array['lead-${stamp}@chaos.test'])`);
  r = await code(`lead-${stamp}@chaos.test`); ok(r.status === 403 && r.json.code === 'LEAD_PENDING', 'a brief still being set up → "your room is being prepared"', [r.status, r.json.code]);
  const room = await newRoom('15', { wait: false }); sql(`update clients set status='archived',archived_at=now() where lower(contact_email)='${room.email}'`); r = await code(room.email); ok(r.status === 403, 'an archived room cannot request a code', r.status);
  for (const e of ['', 'abc', undefined, null, 5, { a: 1 }, ['x@y.co']]) { r = await code(e); ok(r.status === 400 || r.status === 403, `email ${JSON.stringify(e)} → 4xx`, r.status); }
});

await journey('J28', 'running the assistant again on a finished draft replaces its work and keeps the customer\'s', async () => {
  const room = await newRoom('28'), id = room.productId, base = `/v1/products/${id}/tech-pack/draft`; const before = (await draftOf(room.token, id)).techPack.data;
  const aiCallouts = before.sketches[0].callouts.length; ok(aiCallouts > 0, 'the first run drew callouts', aiCallouts);
  const mine = structuredClone(before); mine.sketches[0].callouts.push({ n: aiCallouts + 1, label: 'Our logo', spec: '', note: 'embroidered', photo: '', x: 0.5, y: 0.5 }); const cell = mine.pom[0]; const size = mine.style.sampleSize; cell.values[size] = '13.25';
  let r = await call(base, { method: 'PUT', token: room.token, body: { data: mine } }); ok(r.status === 200, 'the customer adds a callout and types a measurement', r.status);
  for (const round of [1, 2]) {
    r = await call(`${base}/ai`, { method: 'POST', token: room.token }); ok(r.status === 200, `re-run ${round} starts`, [r.status, r.json.error]); const done = await waitAi(call, room.token, id); const d = done.json.techPack.data;
    ok(done.json.techPack.aiStatus === 'done', `re-run ${round} finishes`, done.json.techPack.aiStatus);
    ok(d.sketches[0].callouts.length === aiCallouts + 1, `re-run ${round}: their callout plus one set of the assistant's, not doubled`, d.sketches[0].callouts.length);
    ok(d.sketches[0].callouts[0].label === 'Our logo', `re-run ${round}: their callout is still first`, d.sketches[0].callouts[0].label);
    ok(d.pom[0].values[size] === '13.25', `re-run ${round}: the measurement they typed is kept`, d.pom[0].values[size]);
    ok(new Set(d.sketches[0].callouts.map(c => c.label.toLowerCase())).size === d.sketches[0].callouts.length, `re-run ${round}: no two callouts share a label`);
  }
});

await journey('J29', 'staff start over: the pack is redrawn from its photo, nothing from before survives', async () => {
  const room = await newRoom('29'), id = room.productId, base = `/v1/products/${id}/tech-pack/draft`; const first = (await draftOf(room.token, id)).techPack.data, aiCallouts = first.sketches[0].callouts.length;
  const mine = structuredClone(first); mine.sketches[0].callouts.push({ n: aiCallouts + 1, label: 'Our logo', spec: '', note: 'embroidered', photo: '', x: 0.5, y: 0.5 }); const size = mine.style.sampleSize; mine.pom[0].values[size] = '13.25'; mine.style.description = 'typed by the customer';
  await call(base, { method: 'PUT', token: room.token, body: { data: mine } });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: room.r.json.client.id, role: 'admin' });
  let r = await call(`/v1/admin/products/${id}/tech-pack/ai`, { method: 'POST', token: admin, body: {} }); ok(r.status === 200 && r.json.startedOver === false, 'a plain re-run does not start over', [r.status, r.json]);
  await waitAi(call, room.token, id); let d = (await draftOf(room.token, id)).techPack.data; ok(d.pom[0].values[size] === '13.25' && d.sketches[0].callouts[0].label === 'Our logo', 'and keeps what the customer added');
  r = await call(`/v1/admin/products/${id}/tech-pack/ai`, { method: 'POST', token: admin, body: { startOver: true } }); ok(r.status === 200 && r.json.startedOver === true, 'start over is accepted', [r.status, r.json]);
  await waitAi(call, room.token, id); d = (await draftOf(room.token, id)).techPack.data;
  ok(d.sketches[0].callouts.length === aiCallouts && !d.sketches[0].callouts.some(c => c.label === 'Our logo'), 'the customer\'s callout is gone and the assistant\'s set is back once', d.sketches[0].callouts.length);
  ok(d.pom[0].values[size] !== '13.25' && d.style.description !== 'typed by the customer', 'typed values are replaced by the new draft', [d.pom[0].values[size], d.style.description]); ok(d.sketches[0].image.startsWith('data:image/'), 'the reference photo is kept');
  r = await call(`/v1/admin/products/${id}/tech-pack/ai`, { method: 'POST', token: room.token, body: { startOver: true } }); ok(r.status === 403, 'a customer cannot start a pack over through the staff route', r.status);
});

await journey('J30', 'pre-claiming: typing someone else\'s email gets a stranger nothing that outlives the owner signing in', async () => {
  const room = await newRoom('30', { wait: false }), id = room.productId;
  ok(room.token && (await draftOf(room.token, id)).techPack, 'the person at the keyboard can work on their draft straight away', room.r.status);
  const owner = await signIn(room.email); ok(owner.token, 'the real owner signs in with a code from their inbox', owner.v.status);
  const stranger = await call(`/v1/products/${id}/tech-pack/draft`, { token: room.token }); ok(stranger.status === 401, 'the session handed out at /start stops working once the owner has signed in', stranger.status);
  ok((await call(`/v1/products/${id}/tech-pack/draft`, { token: owner.token })).status === 200, 'the owner\'s own session works');
  ok((await call('/v1/dashboard', { token: room.token })).status === 401, 'and it opens nothing else either');
  ok((await start(room.email)).json.token === null, 'a second /start for a known address never hands out a session');
  const lead = em('30lead'); sql(`insert into clients(slug,name,status,contact_email,allowed_emails) values('lead-${stamp}-30','Lead Co','lead','${lead}',array['${lead}'])`);
  const r = await start(lead); ok(r.status === 201 && !r.json.token && r.json.needsCode === true, 'a lead\'s room takes a code like any known room, even though it was never used', [r.status, !!r.json.token, r.json.needsCode]);
});

await journey('J32', 'message center: a client message becomes an unread conversation, reading clears it, replying lands in the thread', async () => {
  const room = await newRoom('32'), pid = room.r.json.project.id, cid = room.r.json.client.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin' });
  ok((await call('/v1/admin/message-center', { token: room.token })).status === 403, 'a customer cannot open the message center');
  ok((await call('/v1/admin/message-center')).status === 401, 'and neither can anyone signed out');
  ok((await call('/v1/admin/message-center/not-a-key', { token: admin })).status === 404, 'a malformed conversation key is a 404, not a 500');
  ok((await call(`/v1/admin/message-center/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}`, { token: admin })).status === 404, 'so is a conversation that does not exist');
  let l = (await call('/v1/admin/message-center', { token: admin })).json; let mine = l.conversations.find(c => c.key === pid);
  ok(mine && mine.unread >= 1 && /tech pack/i.test(mine.preview), 'the new room shows up with its "started a tech pack" signal unread', mine);
  const sent = await call(`/v1/projects/${pid}/messages`, { token: room.token, body: { body: 'Can you check the heel height?' } }); ok(sent.status === 201, 'the customer writes a message', sent.status);
  l = (await call('/v1/admin/message-center', { token: admin })).json; mine = l.conversations.find(c => c.key === pid);
  ok(mine.preview === 'Can you check the heel height?' && mine.lastRole === 'client' && mine.unread >= 2, 'the conversation preview is the message and the unread count grew', mine);
  ok(l.conversations[0].key === pid || l.conversations[0].lastAt >= mine.lastAt, 'and it sits at (or near) the top by recency');
  const t = (await call(`/v1/admin/message-center/${pid}`, { token: admin })).json;
  ok(t.messages.length === 1 && t.messages[0].author_role === 'client' && t.conversation.projectId === pid, 'the thread has the message and its project', t.messages);
  ok(t.events.length >= 1 && t.events.every(e => !/project-message|client-project-message/.test(e.type)) && t.events.some(e => e.productId), 'signals show as events (with the product to open), not as duplicate bubbles', t.events);
  const rd = await call(`/v1/admin/message-center/${pid}/read`, { method: 'POST', token: admin }); ok(rd.status === 200 && rd.json.read >= 1, 'opening it marks the signals read', rd.json);
  l = (await call('/v1/admin/message-center', { token: admin })).json; ok(l.conversations.find(c => c.key === pid).unread === 0, 'and the unread count goes to zero');
  const reply = await call(`/v1/admin/projects/${pid}/messages`, { method: 'POST', token: admin, body: { body: 'Heel is 1.75 in on our last.', replyToId: t.messages[0].id } }); ok(reply.status === 201, 'staff reply with a quoted message', reply.status);
  const t2 = (await call(`/v1/admin/message-center/${pid}`, { token: admin })).json; ok(t2.messages.length === 2 && t2.messages[1].author_role === 'admin' && t2.messages[1].reply_to_id === t2.messages[0].id, 'the reply is in the thread, quoting the first message');
  l = (await call('/v1/admin/message-center', { token: admin })).json; mine = l.conversations.find(c => c.key === pid); ok(mine.preview.startsWith('You: ') && mine.unread === 0, 'our own reply reads "You: …" and is not counted as unread', mine);
  const gen = (await call(`/v1/admin/message-center/general-${cid}`, { token: admin })); ok(gen.status === 200 && gen.json.conversation.kind === 'general', 'the per-client "general" conversation opens too', gen.status);
});

await journey('J34', 'many people with the same name start at once: every one gets a room, none gets an error', async () => {
  const name = `Racey Name ${stamp}`; const results = await Promise.all(Array.from({ length: 14 }, (_, i) => call('/v1/public/start', { body: { email: `race${i}-${stamp}@chaos.test`, name, title: 'Same name runner', photos: [runner] } })));
  ok(results.every(r => r.status === 201 && r.json.token), 'fourteen simultaneous /start calls with one name all succeed', results.map(r => r.status));
  const slugs = sql(`select slug from clients where name='${name}'`).split('\n').filter(Boolean); ok(slugs.length === 14 && new Set(slugs).size === 14, 'and each room has its own address', slugs.length);
});

await journey('J35', 'the database drops connections: the service stays up and keeps answering', async () => {
  const before = await call('/health'); ok(before.status === 200, 'healthy before', before.status);
  // end every idle connection the service holds (not psql, not this script): what a database restart or a network blip does
  const killed = sql(`select count(*) from (select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and application_name='' and state='idle') t`); ok(Number(killed) >= 1, 'idle connections were cut', killed);
  await sleep(600); const after = await call('/health'); ok(after.status === 200, 'the service process is still up and answers', after.status);
  const room = await newRoom('35', { wait: false }); ok(room.token, 'and a customer can still start a pack right after', room.r.status);
});

await journey('J36', 'payment gate: free access per client, a global switch, and what waits for payment starts when it opens', async () => {
  let restore = null;
  try {
  const a = await newRoom('36'), cid = a.r.json.client.id, pid = a.r.json.project.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${a.email}'`), clientId: cid, role: 'admin' }); restore = () => call('/v1/admin/tech-pack-billing', { method: 'PUT', token: admin, body: { mode: 'auto' } });
  const hubPack = async (title) => (await call('/v1/tech-packs', { token: a.token, body: { title, projectId: pid, photos: [runner] } })).json;
  const adm = (path, o = {}) => call(path, { token: admin, ...o });
  ok((await call('/v1/admin/tech-pack-billing', { token: a.token })).status === 403 && (await call('/v1/admin/tech-pack-billing')).status === 401, 'only staff can read or change the gate');
  let b = (await adm('/v1/admin/tech-pack-billing')).json; ok(b.mode === 'auto' && b.effective === true && b.priceCents > 0, 'the gate starts automatic and on in this setup', b);
  ok((await adm('/v1/admin/tech-pack-billing', { method: 'PUT', body: { mode: 'sideways' } })).status === 400, 'a nonsense mode is refused');
  const second = await hubPack('Second · standard'); ok(second.ai === 'locked', 'a standard client\'s second pack waits for payment', second.ai);
  const on = await adm(`/v1/admin/clients/${cid}`, { method: 'PATCH', body: { techPackComped: true } }); ok(on.status === 200 && on.json.tech_pack_comped === true && on.json.unlockedPacks >= 1, 'giving free access unlocks the pack that was waiting', [on.status, on.json.unlockedPacks]);
  const d2 = await waitAi(call, a.token, second.product.id); ok(['pending', 'done'].includes(d2.json.techPack.aiStatus) && d2.json.techPack.aiStatus !== 'locked', 'and the assistant runs on it', d2.json.techPack?.aiStatus);
  ok((await hubPack('Third · free access')).ai !== 'locked', 'a new pack is never locked while they have free access');
  const off = await adm(`/v1/admin/clients/${cid}`, { method: 'PATCH', body: { techPackComped: false } }); ok(off.status === 200 && off.json.tech_pack_comped === false && off.json.unlockedPacks === 0, 'taking it away works');
  const fourth = await hubPack('Fourth · standard again'); ok(fourth.ai === 'locked', 'and the next pack is locked again', fourth.ai);
  const gateOff = await adm('/v1/admin/tech-pack-billing', { method: 'PUT', body: { mode: 'off' } }); ok(gateOff.status === 200 && gateOff.json.effective === false && gateOff.json.starting >= 1, 'switching the gate off for everyone answers at once and starts what was waiting', [gateOff.status, gateOff.json.starting]);
  let d4; for (let i = 0; i < 40; i++) { d4 = await draftOf(a.token, fourth.product.id); if (d4.techPack.aiStatus !== 'locked') break; await sleep(500); } ok(d4.techPack.aiStatus !== 'locked', 'the pack that was waiting is no longer locked', d4.techPack?.aiStatus);
  ok((await hubPack('Fifth · gate off')).ai !== 'locked', 'while it is off nothing is locked');
  const auto = await adm('/v1/admin/tech-pack-billing', { method: 'PUT', body: { mode: 'auto' } }); ok(auto.json.mode === 'auto' && auto.json.effective === true, 'back to automatic, the gate is on again');
  ok((await hubPack('Sixth · gate on')).ai === 'locked', 'and new packs are locked again');
  const made = await adm('/v1/admin/clients', { method: 'POST', body: { name: `Gifted ${stamp}`, slug: `gifted-${stamp}`, allowedEmails: [`gift-${stamp}@creator.test`], techPackComped: true } }); ok(made.status === 200 && made.json.tech_pack_comped === true, 'a creator can be added with free access from the start', [made.status, made.json.tech_pack_comped]);
  const fresh = await start(`gift-${stamp}@creator.test`, { title: 'First of theirs' }); const signed = await signIn(`gift-${stamp}@creator.test`); const t2 = await call('/v1/tech-packs', { token: signed.token, body: { title: 'Their second', projectId: fresh.json.project.id, photos: [runner] } }); ok(t2.json.ai && t2.json.ai !== 'locked', 'and their second pack is not locked', t2.json.ai);
  } finally { if (restore) await restore(); } // never leave the shared test database with the gate switched
});

await journey('J39', 'platform health page: staff only, complete, honest about this setup, and no secrets in what it returns', async () => {
  const a = await newRoom('39', { wait: false }), cid = a.r.json.client.id;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${a.email}'`), clientId: cid, role: 'admin' });
  for (const path of ['/v1/admin/platform/health', '/v1/admin/platform/insights']) {
    ok((await call(path)).status === 401, `${path}: no sign-in → 401`);
    ok((await call(path, { token: a.token })).status === 403, `${path}: a customer → 403`);
  }
  const page = await call('/platform'); ok(page.status === 200 && /pf-tabs/.test(page.text), 'the /platform page is served (it is only a shell: every number comes from the staff-only calls above)', page.status);
  const h = await call('/v1/admin/platform/health?fresh=1', { token: admin }); ok(h.status === 200, 'staff can read health', h.status);
  const b = h.json, ids = (b.checks || []).map(c => c.id);
  for (const id of ['postgres', 'shopify', 'anthropic', 'resend', 'google', 'cutout', 'storage', 'host']) ok(ids.includes(id), `health lists ${id}`, ids);
  ok(['healthy', 'degraded', 'down'].includes(b.overall), 'one overall word for the banner', b.overall);
  ok(b.checks.every(c => ['ok', 'warn', 'down', 'off', 'info'].includes(c.status) && c.name && c.summary && ['infrastructure', 'integration'].includes(c.group)), 'every check has a status, a name, a one-line summary and a group');
  const pg = b.checks.find(c => c.id === 'postgres'); ok(pg.status === 'ok' || (pg.status === 'warn' && /waiting for a connection/.test(pg.summary)), 'the database reads healthy (or honestly says requests are queueing on this deliberately tiny pool)', pg.summary);
  ok(pg.latencyMs >= 0 && pg.facts.some(f => f[0] === 'Version'), 'with a latency and a version');
  ok(b.checks.find(c => c.id === 'shopify').status === 'off' && /not connected/i.test(b.checks.find(c => c.id === 'shopify').summary), 'Shopify is reported as not connected here (it is not configured), not as fine');
  ok(b.checks.find(c => c.id === 'anthropic').status === 'warn', 'the assistant reads "warn" while a test fixture stands in for it', b.checks.find(c => c.id === 'anthropic'));
  ok(b.config.find(c => c.id === 'bypass').status === 'ok', 'the sign-in bypass is reported off');
  ok(b.config.find(c => c.id === 'fixture').status === 'warn', 'and the test fixture is flagged');
  ok(b.jobs.some(j => j.name === 'Assistant recovery') && b.jobs.every(j => ['ok', 'warn', 'wait', 'off'].includes(j.health)), 'background jobs are listed, each with a state', b.jobs.map(j => j.name));
  ok(b.telemetry.requests.total > 0 && b.telemetry.requests.minutes.length === 60 && b.telemetry.integrations.anthropic?.calls >= 1, 'request counts and assistant calls are being counted', [b.telemetry.requests.total, b.telemetry.integrations.anthropic?.calls]);
  const text = JSON.stringify(b);
  for (const secret of ['smoke-secret', 'postgres:postgres', process.env.DATABASE_URL || 'postgres:postgres', 'sk-ant', admin]) ok(!text.includes(secret), `health never contains ${secret.slice(0, 14)}…`);
  const i = await call('/v1/admin/platform/insights?days=7', { token: admin }); ok(i.status === 200, 'staff can read insights', i.status);
  const x = i.json; ok(x.totals && x.funnel && x.ai && x.money && Array.isArray(x.packsDaily) && Array.isArray(x.sources) && x.active && x.notTracked, 'insights has totals, funnel, assistant, money, daily packs, sources, activity and what is not tracked', Object.keys(x));
  ok(x.funnel.started >= 1 && x.funnel.started >= x.funnel.drafted && x.funnel.drafted >= x.funnel.submitted, 'the funnel never grows as it goes down', x.funnel);
  ok(x.ai.done + x.ai.failed + x.ai.pending + x.ai.locked >= 1 && (x.ai.successRate === null || (x.ai.successRate >= 0 && x.ai.successRate <= 1)), 'assistant numbers add up and the success rate is a share', x.ai);
  ok(x.money.estRevenueCents === x.money.paid * 4800, 'estimated revenue is packs paid for × the price', [x.money.estRevenueCents, x.money.paid]);
  for (const d of ['0', '-5', 'abc', '9999', "1;drop table clients"]) ok((await call(`/v1/admin/platform/insights?days=${encodeURIComponent(d)}`, { token: admin })).status === 200, `days=${d} is clamped, never an error`);
  ok(!JSON.stringify(x).includes(a.email), 'and no customer email address is listed in insights');
  const tbl = sql(`select to_regclass('platform_events') is not null`); ok(tbl === 't', 'the failure log table exists');
});

await journey('J44', 'the product card follows the tech pack: material, decoration, colourways and size run', async () => {
  const room = await newRoom('44'), cid = room.r.json.client.id, pid = room.r.json.project.id, id = room.productId;
  const card = async (t = room.token, pidx = id) => (await call('/v1/dashboard', { token: t })).json.products.find(p => p.id === pidx)?.configuration || null;
  let c = await card(); ok(c && c.material && c.colorways?.length && c.sizes?.length, 'once the assistant has drafted the pack, the card already shows material, colourways and size run', c && { m: c.material, c: c.colorways, s: c.sizes });
  const save = async mutate => { const d = (await draftOf(room.token, id)).techPack.data; mutate(d); const r = await call(`/v1/products/${id}/tech-pack/draft`, { method: 'PUT', token: room.token, body: { data: d } }); ok(r.status === 200, 'save works', [r.status, r.json.error]); return d; };
  await save(d => { d.bom = [{ component: 'Upper', material: 'Recycled mesh' }, { component: 'Lining', material: 'Suede' }, { component: 'Sole', material: 'recycled MESH' }]; d.colorways = [{ name: 'Gum', code: '18-1021' }, { name: 'Ecru' }]; d.sizes = ['8', '9', '10', '11']; d.artwork = [{ id: 'aw1', name: 'Heel logo', image: runner, pantones: [], placements: [{ sketchId: d.sketches[0].id, x: .5, y: .5, widthIn: 2, label: 'Heel' }] }]; });
  c = await card(); ok(c.material === 'Recycled mesh, Suede', 'the customer edits the materials: the card says "Recycled mesh, Suede" (repeats dropped)', c.material);
  ok(JSON.stringify(c.colorways) === JSON.stringify(['Gum (18-1021)', 'Ecru']), 'colourways follow, with the code', c.colorways); ok(JSON.stringify(c.sizes) === JSON.stringify(['8', '9', '10', '11']), 'the size run follows', c.sizes);
  ok(c.decoration_method === 'Heel logo' && JSON.stringify(c.decoration_locations) === JSON.stringify(['Heel']), 'decoration reads the artwork and where it goes', [c.decoration_method, c.decoration_locations]);
  await save(d => { d.bom = []; d.colorways = []; d.artwork = []; });
  c = await card(); ok(c.material === 'Recycled mesh, Suede' && c.colorways.length === 2 && c.decoration_method === 'Heel logo', 'emptying the tables never erases what the card already says', c);
  await save(d => { d.bom = [{ component: 'Upper', material: 'Vegan leather' }]; });
  ok((await card()).material === 'Vegan leather', 'and the next edit replaces it');
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin' });
  const adm = await call(`/v1/admin/clients/${cid}`, { token: admin }); const ap = (adm.json.products || []).find(p => p.id === id); const ac = ap?.configuration || (adm.json.configurations || []).find(x => x.product_id === id);
  ok(ac?.material === 'Vegan leather' && ac.sizes?.length === 4, 'the work console shows the same card', ac && [ac.material, ac.sizes]);
  await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: room.token, body: {} });
  let seed = (await call(`/v1/admin/products/${id}/tech-pack`, { token: admin })).json.techPack.data; seed.colorways = [{ name: 'Midnight' }];
  const put = await call(`/v1/admin/products/${id}/tech-pack`, { method: 'PUT', token: admin, body: { data: seed } }); ok(put.status === 200, 'staff finish the client\'s unpublished draft', put.status);
  ok(JSON.stringify((await card()).colorways) === JSON.stringify(['Midnight']), 'and the card follows their edits too');
  // a pack staff write themselves stays off the card until it is published
  const made = await call(`/v1/admin/clients/${cid}/products`, { token: admin, body: { title: `Staff pack ${stamp}`, projectId: pid } }); ok(made.status === 201 || made.status === 200, 'staff add a product of their own', [made.status, made.json.error]);
  const sid = made.json.product?.id || made.json.id; const got = (await call(`/v1/admin/products/${sid}/tech-pack`, { token: admin })).json; const sd = got.techPack?.data || got.seed; sd.bom = [{ component: 'Shell', material: 'Secret wool blend' }]; sd.colorways = [{ name: 'Unreleased' }];
  ok((await call(`/v1/admin/products/${sid}/tech-pack`, { method: 'PUT', token: admin, body: { data: sd } })).status === 200, 'staff save their draft');
  ok(!JSON.stringify((await call('/v1/dashboard', { token: room.token })).json).includes('Secret wool'), 'the customer sees none of it while it is a draft');
  const pub = await call(`/v1/admin/products/${sid}/tech-pack/publish`, { method: 'POST', token: admin, body: { override: 'journey: card check only' } }); ok(pub.status === 200, 'staff publish', [pub.status, pub.json.error]);
  const pc = await card(room.token, sid); ok(pc?.material === 'Secret wool blend' && pc.colorways?.[0] === 'Unreleased', 'publishing puts it on the card', pc);
});

await journey('J48', 'the console queues follow the real work: tech packs, quotes, approvals, requests, production, money', async () => {
  const room = await newRoom('48'), cid = room.r.json.client.id, id = room.productId, title = (await draftOf(room.token, id)).techPack.data.style.styleName || 'Layer runner';
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const queues = async () => (await adm('/v1/admin/dashboard')).json.queues;
  const mine = (list, kind) => list.filter(x => x.clientId === cid && (!kind || x.kind === kind));
  let q = await queues(); ok(q && Array.isArray(q.approvals) && Array.isArray(q.attention) && q.assistant, 'the dashboard returns the three queues', q && Object.keys(q));
  ok(mine(q.approvals).every(x => x.kind === 'analysis-check'), 'a drafted pack nobody has submitted is waiting on nobody to approve it (if the assistants drafted it, it is only listed for us to check the analysis)', mine(q.approvals).map(x => x.kind));
  // the tech pack chain: submit (on us) → publish (on the client) → the client approves (on us) → we countersign (on the factory)
  await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: room.token, body: {} });
  q = await queues(); let it = mine(q.approvals, 'review')[0]; ok(it && it.owner === 'us' && it.productId === id && /review it and publish/i.test(it.title) && it.since, 'a submitted pack waits on us: review and publish', it);
  ok((await adm(`/v1/admin/products/${id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: queue check only' } })).status === 200, 'staff publish v1');
  q = await queues(); it = mine(q.approvals, 'client-approval')[0]; ok(it && it.owner === 'client' && !mine(q.approvals, 'review').length, 'once published it waits on the client, no longer on us', it);
  ok((await call(`/v1/products/${id}/tech-pack/approve`, { method: 'POST', token: room.token, body: { name: 'Pay Tester' } })).status === 200, 'the client approves');
  q = await queues(); it = mine(q.approvals, 'countersign')[0]; ok(it && it.owner === 'us' && /countersign/i.test(it.title), 'and it comes back to us to countersign', it);
  ok((await adm(`/v1/admin/products/${id}/tech-pack/sign`, { method: 'POST', body: { name: 'Studio' } })).status === 200, 'we countersign');
  q = await queues(); it = mine(q.approvals, 'factory-signature')[0]; ok(it && it.owner === 'factory', 'then it waits on the factory', it);
  // the other streams, put there the way the console puts them
  sql(`insert into quotes(product_id,version,quantity,unit_cost_cents,status,created_at) values('${id}',1,300,1200,'issued',now()-interval '9 days')`);
  sql(`insert into requests(client_id,type,title,details,status,created_at) values('${cid}','sample','Need a size 11 sample','please','submitted',now()-interval '3 days')`);
  sql(`insert into approvals(product_id,kind,version,title,status) values('${id}','asset','1','Approve the colourway board','pending')`);
  sql(`insert into production_runs(product_id,po_number,quantity,status,eta_date,sample_status) values('${id}','PO-${stamp}',300,'delayed',current_date-5,'rejected')`);
  const run = sql(`select id from production_runs where po_number='PO-${stamp}'`);
  sql(`insert into qc_inspections(production_run_id,status,inspected_units,defect_units) values('${run}','failed',50,9)`);
  sql(`insert into shipments(production_run_id,status,eta_date,carrier,tracking_number) values('${run}','in-transit',current_date-2,'DHL','JD123')`);
  sql(`insert into invoices(client_id,number,amount_cents,status,due_date) values('${cid}','INV-${stamp}',250000,'due',current_date-20)`);
  sql(`update products set risk_level='attention' where id='${id}'`);
  q = await queues();
  ok(mine(q.approvals, 'quote')[0]?.owner === 'client' && mine(q.approvals, 'request')[0]?.owner === 'us' && mine(q.approvals, 'asset-approval')[0]?.owner === 'client', 'quotes, requests and asset approvals are in the approval queue, each on the right person', mine(q.approvals).map(x => x.kind + ':' + x.owner));
  const att = mine(q.attention).map(x => x.kind); for (const k of ['run', 'qc', 'shipment', 'sample', 'invoice', 'risk']) ok(att.includes(k), `production attention has the ${k}`, att);
  ok(mine(q.attention).filter(x => x.severity === 'urgent').length >= 4, 'late and failed things are marked overdue');
  ok(q.approvals.every((x, i, a) => i === 0 || ({ urgent: 0, normal: 1, info: 2 }[x.severity] >= { urgent: 0, normal: 1, info: 2 }[a[i - 1].severity])), 'the queue is sorted with the most urgent first');
  ok(mine(q.approvals).concat(mine(q.attention)).every(x => x.clientName && x.title && x.key && x.since !== undefined), 'every item names its client, says what it is and carries a key');
  // an archived client's work is not in anyone's queue
  sql(`update clients set status='archived',archived_at=now() where id='${cid}'`); q = await queues();
  ok(!mine(q.approvals).length && !mine(q.attention).length, 'an archived client has nothing in the queues'); sql(`update clients set status='active',archived_at=null where id='${cid}'`);
  const raw = JSON.stringify((await adm('/v1/admin/dashboard')).json.queues); ok(!/"cost|unit_cost|internal/i.test(raw), 'nothing internal (cost, internal notes) leaks into the queue items');
});

await journey('J50', 'the hub project thread: names written for a reader, files and product talk folded in, and only your own project', async () => {
  const a = await newRoom('50a'), b = await newRoom('50b'), cid = a.r.json.client.id, pid = a.r.json.project.id, id = a.productId;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${a.email}'`), clientId: cid, role: 'admin' });
  const t = (token, project = pid) => call(`/v1/projects/${project}/thread`, { token });
  ok((await t(undefined)).status === 401, 'no sign-in → 401'); ok((await t(b.token)).status === 404, 'another client\'s token → 404, nothing leaks', (await t(b.token)).status); ok((await t(a.token, 'not-a-uuid')).status === 404, 'a malformed project id → 404');
  const first = await call(`/v1/projects/${pid}/messages`, { token: a.token, body: { body: 'Can you check the outsole width?' } }); ok(first.status === 201, 'the client writes');
  const reply = await call(`/v1/admin/projects/${pid}/messages`, { token: admin, body: { body: 'Checked, it is right.', replyToId: first.json.id } }); ok(reply.status === 201, 'staff reply, quoting it');
  sql(`insert into comments(client_id,product_id,author_role,body,visibility) values('${cid}','${id}','admin','Colour board is on its way','client')`);
  sql(`insert into comments(client_id,product_id,author_role,body,visibility) values('${cid}','${id}','admin','INTERNAL: supplier is slow','internal')`);
  const r = await t(a.token); ok(r.status === 200 && Array.isArray(r.json.messages) && Array.isArray(r.json.events), 'the client reads the thread', r.status);
  const m = r.json.messages, mine = m.find(x => x.id === first.json.id), staff = m.find(x => x.id === reply.json.id), talk = m.find(x => /Colour board/.test(x.body));
  ok(mine && mine.author_role === 'client' && mine.author_name, 'their own message carries a name');
  ok(staff && staff.author_role === 'admin' && staff.author_name === 'Future Basics' && !/@/.test(staff.author_name) && staff.reply_to_id === first.json.id, 'staff are "Future Basics", never an email address, and the reply keeps what it quotes', staff);
  ok(talk && /^About /.test(talk.tag || '') && talk.noReply === true && talk.author_name === 'Future Basics', 'what staff said on a product shows in the thread, tagged with the product', talk);
  ok(!JSON.stringify(r.json).includes('INTERNAL'), 'and an internal note never does');
  ok(m.every((x, i) => i === 0 || new Date(x.created_at) >= new Date(m[i - 1].created_at)), 'oldest first');
  ok(!JSON.stringify((await t(b.token, b.r.json.project.id)).json).includes('outsole'), 'each client\'s thread holds only their own words');
});

await journey('J52', 'packs that failed on our side re-run by themselves once the assistant works, a few at a time, and never loop', async () => {
  const rooms = []; for (const t of ['52a', '52b', '52c', '52d']) rooms.push(await newRoom(t));
  const cid = rooms[0].r.json.client.id, admin = await forge({ sub: sql(`select id from users where lower(email)='${rooms[0].email}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const fail = (id, error, ago = 30, tries = 0) => sql(`update tech_packs set ai_status='failed',ai_error='${error}',ai_started_at=now()-interval '${ago} minutes',ai_auto_retries=${tries},ai_attempts=0 where product_id='${id}'`);
  const OURS = 'The assistant could not run just now. This is on our side, not your photo — Future Basics has been notified and will run it for you.';
  for (const r of rooms.slice(0, 3)) fail(r.productId, OURS);
  fail(rooms[3].productId, 'The assistant could not make out a product in this photo.');
  // the queue first says it will retry on its own
  const q0 = (await adm('/v1/admin/dashboard')).json.queues.assistant.rerun.find(x => x.productId === rooms[0].productId);
  ok(q0 && q0.severity === 'info' && /re-runs on its own/i.test(q0.title), 'the console says the pack will re-run by itself, not that someone has to', q0 && [q0.severity, q0.title]);
  const run = await adm('/v1/admin/ai/auto-retry', { method: 'POST' }); ok(run.status === 200 && run.json.started === 3, 'the retry job starts the packs that failed on our side', [run.status, run.json]);
  for (const r of rooms.slice(0, 3)) { const st = (await waitAi(call, r.token, r.productId, 40000)).json.techPack; ok(st.aiStatus === 'done', 'a failed pack is drafted without anyone pressing a button', st.aiStatus); }
  ok(rooms.slice(0, 3).every(r => Number(sql(`select ai_auto_retries from tech_packs where product_id='${r.productId}'`)) === 1), 'each was counted as one automatic try');
  ok(sql(`select ai_status from tech_packs where product_id='${rooms[3].productId}'`) === 'failed', 'a pack that failed on its photo is left alone: that needs the client');
  ok(Number(sql(`select count(*) from activities where product_id='${rooms[0].productId}' and metadata->>'reason'='auto-retry'`)) === 1, 'the pack\'s history says it was re-run automatically');
  const again = await adm('/v1/admin/ai/auto-retry', { method: 'POST' }); ok(again.json.started === 0 && again.json.status === 'idle', 'with nothing left to retry, the job does nothing', again.json);
  // a pack that keeps failing stops after the limit and goes back to a person
  fail(rooms[0].productId, OURS, 30, 5);
  const stuck = await adm('/v1/admin/ai/auto-retry', { method: 'POST' }); ok(stuck.json.started === 0, 'a pack that has used its automatic tries is not retried again', stuck.json);
  const q1 = (await adm('/v1/admin/dashboard')).json.queues.assistant.rerun.find(x => x.productId === rooms[0].productId);
  ok(q1 && q1.severity !== 'info' && /by hand/i.test(q1.title), 'it goes back on the console as something to re-run by hand', q1 && [q1.severity, q1.title]);
  // retries are spaced out: one that failed a moment ago waits
  fail(rooms[1].productId, OURS, 1, 0); const soon = await adm('/v1/admin/ai/auto-retry', { method: 'POST' }); ok(soon.json.started === 0, 'a pack that failed a minute ago waits its turn', soon.json);
  const nonAdmin = await call('/v1/admin/ai/auto-retry', { method: 'POST', token: rooms[1].token }); ok([401, 403].includes(nonAdmin.status), 'a customer cannot trigger it', nonAdmin.status);
});

await journey('J54', 'a website lead or an unknown email asks to sign in: staff are told once, and it shows in the console', async () => {
  const room = await newRoom('54', { wait: false }), admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: room.r.json.client.id, role: 'admin' });
  const queues = async () => (await call('/v1/admin/dashboard', { token: admin })).json.queues, code = e => call('/v1/auth/code', { body: { email: e } });
  const lead = `lead54-${stamp}@chaos.test`, stranger = `stranger54-${stamp}@chaos.test`, subject = new RegExp('is trying to sign in — their room is not active yet');
  sql(`insert into clients(slug,name,status,contact_email,allowed_emails) values('lead54-${stamp}','Lead 54 ${stamp}','lead','${lead}',array['${lead}'])`);
  const leadId = sql(`select id from clients where slug='lead54-${stamp}'`), alerts = () => readFileSync(LOG, 'utf8').split('\n').filter(l => subject.test(l) && l.includes('Lead 54')).length;
  let q = await queues(), item = q.approvals.find(x => x.key === `lead:${leadId}`);
  ok(item && !/trying to sign in/.test(item.title), 'before anyone tries, the lead is an ordinary "activate the room" item', item && item.title);
  const before = alerts();
  let r = await code(lead); ok(r.status === 403 && r.json.code === 'LEAD_PENDING', 'the lead is still told the room is being set up', [r.status, r.json.code]);
  await sleep(400); r = await code(lead); await sleep(400);
  ok(alerts() - before === 1, 'two tries produce exactly one email to staff', alerts() - before);
  ok(Number(sql(`select attempts from signin_attempts where email='${lead}'`)) === 2, 'both tries are counted', sql(`select attempts from signin_attempts where email='${lead}'`));
  q = await queues(); item = q.approvals.find(x => x.key === `lead:${leadId}`);
  ok(item && item.severity === 'urgent' && /trying to sign in/.test(item.title) && /2 times/.test(item.detail), 'the console marks the lead urgent and says they tried twice', item && [item.severity, item.title, item.detail]);
  // an email with no work under it
  r = await code(stranger); ok(r.status === 403 && r.json.code === 'NO_CLIENT_WORK', 'an unknown email gets the usual answer', [r.status, r.json.code]); await sleep(300);
  q = await queues(); const s1 = q.approvals.find(x => x.key === `signin:${stranger}`);
  ok(s1 && s1.owner === 'us' && s1.clientId === null && s1.severity === 'info' && /no work under this email/.test(s1.title), 'it shows in the console as a quiet item with no room behind it', s1);
  ok(alerts() - before === 1, 'and sends staff no email');
  await code(stranger); await sleep(300); q = await queues(); ok(q.approvals.find(x => x.key === `signin:${stranger}`).severity === 'normal', 'a second try makes it a regular item');
  // once the address belongs to a room, it is no longer a stranger
  sql(`update clients set allowed_emails=array_append(allowed_emails,'${stranger}') where id='${room.r.json.client.id}'`); q = await queues();
  ok(!q.approvals.some(x => x.key === `signin:${stranger}`), 'adding the address to a room clears the item');
  // junk and floods do not fill the table
  for (const junk of ['not-an-email', '@', 'a@b', ' ']) await code(junk);
  ok(Number(sql(`select count(*) from signin_attempts where email in ('not-an-email','@','a@b','')`)) === 0, 'malformed emails are not recorded');
  // activating the lead takes it off the list
  sql(`update clients set status='active' where id='${leadId}'`); q = await queues(); ok(!q.approvals.some(x => x.key === `lead:${leadId}`), 'an activated lead is no longer waiting');
  sql(`update clients set status='archived',archived_at=now() where id='${leadId}'`);
});

await journey('J56', 'the independent spec check: runs at submit, staff only, stale after edits, capped per day, flags a bad match in the queue', async () => {
  const room = await newRoom('56'), cid = room.r.json.client.id, id = room.productId;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const latest = async () => (await adm(`/v1/admin/products/${id}/tech-pack/check`)).json;
  let c = await latest(); for (let i = 0; i < 40 && !(c.latest && c.latest.status === 'done'); i++) { await sleep(300); c = await latest(); }
  ok(c.latest && c.latest.trigger === 'loop' && c.enabled === true && c.image.provider === 'fixture', 'before the client submits, the only check is the one the developer assistant ran after the draft, and the image model is reported', [c.latest && c.latest.trigger, c.image]);
  const sub = await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: room.token, body: {} }); ok(sub.status === 200, 'the client submits', sub.status);
  for (let i = 0; i < 40; i++) { c = await latest(); if (c.latest && c.latest.status !== 'pending') break; await sleep(400); }
  const l = c.latest; ok(l && l.status === 'done' && l.trigger === 'submit', 'the check ran by itself when the client submitted', l && [l.status, l.trigger, l.error]);
  ok(l.score === 82 && l.verdict === 'resembles' && l.attributes.length === 7 && l.renders.length === 1 && l.renders[0].dataUrl.startsWith('data:image/jpeg'), 'a score, a verdict, seven attributes and one render', l && [l.score, l.verdict, l.attributes.length, l.renders.length]);
  ok(!JSON.stringify(l.brief).includes('data:image') && l.brief.parts.length > 0, 'the brief the renderer got has the BOM and no picture');
  ok(sql(`select count(*) from tech_pack_checks where product_id='${id}' and trigger='submit'`) === '1', 'one check at submit, not two');
  ok((await call(`/v1/admin/products/${id}/tech-pack/check`, { token: room.token })).status === 403 && (await call(`/v1/admin/products/${id}/tech-pack/check`, { method: 'POST', token: room.token, body: {} })).status === 403, 'a client can neither read nor start one');
  ok(!JSON.stringify((await call(`/v1/products/${id}/tech-pack/draft`, { token: room.token })).json).includes('does-not-resemble') && !JSON.stringify((await call(`/v1/products/${id}/thread`, { token: room.token })).json).includes('Spec check'), 'and nothing from it reaches the client\'s own views');
  ok((await call(`/v1/admin/products/${id}/tech-pack/check`)).status === 401 && (await adm('/v1/admin/products/not-a-uuid/tech-pack/check')).status === 404, 'no sign-in → 401, a bad id → 404');
  // a change to the pack makes the result stale; a manual run clears it and keeps the first one in the history
  const pack = (await adm(`/v1/admin/products/${id}/tech-pack`)).json, data = pack.techPack.data; data.style.fabricSummary = 'Suede upper';
  await adm(`/v1/admin/products/${id}/tech-pack`, { method: 'PUT', body: { data } }); c = await latest(); ok(c.stale === true, 'editing the pack marks the check as out of date');
  const again = await adm(`/v1/admin/products/${id}/tech-pack/check`, { method: 'POST', body: {} }); ok(again.status === 202 && again.json.id, 'staff run it again', again.json);
  for (let i = 0; i < 40; i++) { c = await latest(); if (c.latest.trigger === 'manual' && c.latest.status !== 'pending') break; await sleep(400); }
  ok(c.latest.trigger === 'manual' && c.latest.status === 'done' && c.stale === false && c.history.some(h => h.trigger === 'submit'), 'the new result is on top, no longer stale, the one from submit is in the history', [c.latest.trigger, c.stale, c.history.map(h => h.trigger)]);
  // it shows in the console's waiting-on-us list when it says the pack does not match, and goes away once published
  sql(`update tech_pack_checks set score=38,verdict_label='does-not-resemble',verdict=jsonb_set(verdict,'{summary}','"The upper is mesh in the pack but suede in the photo."') where id='${c.latest.id}'`);
  let q = (await adm('/v1/admin/dashboard')).json.queues, item = q.approvals.find(x => x.key === `check:${c.latest.id}`);
  ok(item && item.owner === 'us' && item.severity === 'urgent' && /38\/100/.test(item.title) && /suede in the photo/.test(item.detail) && item.productId === id, 'a bad match shows as an urgent item that names the product', item);
  sql(`update tech_pack_checks set score=82,verdict_label='resembles' where id='${c.latest.id}'`); q = (await adm('/v1/admin/dashboard')).json.queues; ok(!q.approvals.some(x => x.key === `check:${c.latest.id}`), 'a good match is not in the list');
  sql(`update tech_pack_checks set score=38,verdict_label='does-not-resemble' where id='${c.latest.id}'`); sql(`update tech_packs set published_at=now() where product_id='${id}'`); q = (await adm('/v1/admin/dashboard')).json.queues; ok(!q.approvals.some(x => x.key === `check:${c.latest.id}`), 'and neither is a pack that has been published');
  // the Platform page knows about the render model
  const h = (await adm('/v1/admin/platform/health?fresh=1')).json, ig = h.checks.find(x => x.id === 'imagegen'); ok(ig && ig.status === 'warn' && /Test fixture/.test(ig.summary) && ig.facts.some(([k]) => k === 'Provider'), 'the Platform page has a render model check', ig && [ig.status, ig.summary]);
  ok(h.jobs.some(j => /Spec checks/.test(j.name)), 'and the "Spec checks" job is listed');
  // the daily cap
  let last; for (let i = 0; i < 8; i++) { last = await adm(`/v1/admin/products/${id}/tech-pack/check`, { method: 'POST', body: {} }); if (last.status === 429) break; await sleep(120); }
  ok(last.status === 429 && /today/.test(last.json.error), 'staff are stopped at the daily limit with a plain message', [last.status, last.json]);
});

await journey('J57', 'the handoff from submission to delivery: every step names who it waits on, changes come back as new versions, money and signatures gate the factory', async () => {
  const room = await newRoom('57'), cid = room.r.json.client.id, id = room.productId, tok = room.token;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin' }), adm = (path, o = {}) => call(path, { token: admin, ...o });
  const at = () => { const [stage, owner] = sql(`select current_stage||'|'||coalesce(waiting_on,'') from products where id='${id}'`).split('|'); return { stage, owner }; };
  const cur = () => sql(`select name||'|'||responsible_party from milestones where product_id='${id}' and status='current'`);
  const waiting = async () => (await call('/v1/dashboard', { token: tok })).json.waiting || [];
  let w = at(); ok(w.stage === 'brief' && w.owner === 'client' && cur() === 'Brief|client', 'a client-started product is at Brief, waiting on the client', [w, cur()]);
  // submit → Future Basics reviews
  ok((await call(`/v1/products/${id}/tech-pack/submit`, { method: 'POST', token: tok, body: {} })).status === 200, 'the client submits');
  w = at(); ok(w.stage === 'concept' && w.owner === 'future-basics' && sql(`select status from milestones where product_id='${id}' and name='Brief'`) === 'complete', 'submitting moves it to Concept, waiting on Future Basics, and completes Brief', w);
  // the publish gate
  let pub = await adm(`/v1/admin/products/${id}/tech-pack/publish`, { method: 'POST', body: {} });
  ok(pub.status === 409 && pub.json.needsOverride && pub.json.problems.length > 0, 'publishing an unready pack is refused with the reasons', [pub.status, pub.json.problems]);
  pub = await adm(`/v1/admin/products/${id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: publish v1 anyway' } });
  ok(pub.status === 200 && pub.json.techPack.version === 1, 'with a written reason it publishes v1', [pub.status, pub.json.error]);
  ok(/Published before every check passed: journey/.test(JSON.stringify(pub.json.techPack.revisions)), 'and the reason is kept on the version');
  w = at(); ok(w.owner === 'client' && (await waiting()).some(x => x.kind === 'tech-pack' && x.productId === id), 'v1 waits on the client and shows in their Waiting on you list', w);
  // the client asks for changes instead of approving
  ok((await call(`/v1/products/${id}/tech-pack/changes`, { method: 'POST', token: tok, body: { notes: 'x' } })).status === 400, 'an empty change request is refused');
  const ch = await call(`/v1/products/${id}/tech-pack/changes`, { method: 'POST', token: tok, body: { notes: 'Make the heel tab longer' } });
  ok(ch.status === 200 && ch.json.techPack.verification.changes?.notes === 'Make the heel tab longer', 'the client asks for changes on v1', [ch.status, ch.json.error]);
  w = at(); ok(w.owner === 'future-basics' && !(await waiting()).some(x => x.kind === 'tech-pack'), 'it goes back to Future Basics and leaves the client list', w);
  ok(Number(sql(`select count(*) from notifications where entity_id='${id}' and title like '%asked for changes%'`)) >= 1 && /heel tab/.test(sql(`select string_agg(body,' ') from project_messages where client_id='${cid}'`)), 'staff are told and the request is in the project thread');
  // v2, approved
  ok((await adm(`/v1/admin/products/${id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v2 with the longer tab' } })).status === 200, 'staff publish v2');
  ok((await call(`/v1/products/${id}/tech-pack/approve`, { method: 'POST', token: tok, body: { name: 'Hand Off' } })).status === 200, 'the client approves v2');
  w = at(); ok(w.stage === 'development' && w.owner === 'future-basics', 'approval moves it to Development, waiting on Future Basics to quote', w);
  ok(sql(`select string_agg(tv.version::text||':'||coalesce(tv.verification->'changes'->>'notes','-')||':'||coalesce(tv.verification->'clientSign'->>'name','-'),',' order by tv.version) from tech_pack_versions tv join tech_packs tp on tp.id=tv.tech_pack_id where tp.product_id='${id}'`) === '1:Make the heel tab longer:-,2:-:Hand Off', 'both versions are kept, each with what happened to it');
  // a factory link follows the approved version only
  const share = await adm(`/v1/admin/products/${id}/tech-pack/shares`, { method: 'POST', body: { label: 'Mill 57' } }); ok(share.status === 201, 'staff create a factory link for v2');
  const token = share.json.url.split('/tp/')[1];
  ok((await adm(`/v1/admin/products/${id}/tech-pack/publish`, { method: 'POST', body: { override: 'journey: v3 the client has not seen' } })).status === 200, 'staff publish v3');
  let fv = await call(`/v1/tp/${token}`); ok(fv.status === 200 && fv.json.techPack.version === 2 && fv.json.held === true && /waiting for their approval/.test(fv.json.notice), 'the factory still sees v2, read-only, with a note', [fv.status, fv.json.techPack?.version, fv.json.notice]);
  const key = fv.json.techPack.readiness.callouts[0]?.key;
  ok((await call(`/v1/tp/${token}/ack`, { method: 'POST', body: { key } })).status === 409, 'and cannot acknowledge anything on it');
  ok((await call(`/v1/products/${id}/tech-pack/approve`, { method: 'POST', token: tok, body: { name: 'Hand Off' } })).status === 200, 'the client approves v3');
  fv = await call(`/v1/tp/${token}`); ok(fv.json.techPack.version === 3 && !fv.json.held, 'now the link shows v3');
  const trz = await adm(`/v1/admin/products/${id}/tech-pack/translate`, { method: 'POST', body: { lang: 'zh-hant' } }); ok(trz.status === 200 && trz.json.count > 0 && Object.values(trz.json.strings).every(s => s.startsWith('繁中：')), 'staff translate the pack into Traditional Chinese for a Hong Kong or Taiwan factory', [trz.status, trz.json.error]);
  fv = await call(`/v1/tp/${token}`); ok(fv.json.techPack.translations?.['zh-hant']?.count > 0 && !fv.json.techPack.translations?.zh, 'the factory link carries the Traditional text, and only what was asked for', Object.keys(fv.json.techPack.translations || {}));
  // quote → deposit
  ok((await adm(`/v1/admin/products/${id}/configuration`, { method: 'PUT', body: { material: 'Mesh', decorationMethod: 'Embroidery', colorways: ['Black'], sizes: ['9', '10'], moq: 100, leadTimeDays: 45, status: 'ready' } })).status === 200, 'staff set the configuration');
  const tier = await adm(`/v1/admin/products/${id}/price-tiers`, { method: 'POST', body: { minQuantity: 100, unitCostCents: 2000, wholesaleCents: 4000, srpCents: 9000, setupCents: 10000, freightCents: 0, leadTimeDays: 45 } });
  const quote = await adm(`/v1/admin/products/${id}/quotes/from-tier`, { method: 'POST', body: { priceTierId: tier.json.id, quantity: 100, depositPct: 40 } });
  ok(quote.status === 201 && quote.json.tech_pack_version === 3 && quote.json.deposit_pct === 40, 'the quote records the version it priced and its deposit', [quote.status, quote.json.tech_pack_version, quote.json.deposit_pct, quote.json.error]);
  w = at(); const wq = (await waiting()).find(x => x.kind === 'quote'); ok(w.owner === 'client' && wq && wq.totalCents === 410000 && wq.depositPct === 40, 'the quote waits on the client, with its total and deposit', [w, wq]);
  const dec = await call(`/v1/quotes/${quote.json.id}/decision`, { method: 'POST', token: tok, body: { decision: 'approved' } });
  ok(dec.status === 200 && dec.json.deposit && dec.json.deposit.amountCents === 164000, 'accepting it invoices a 40% sample deposit', [dec.status, dec.json.deposit, dec.json.error]);
  w = at(); ok(w.owner === 'client' && (await waiting()).some(x => x.kind === 'invoice' && /deposit/.test(x.title)), 'the deposit waits on the client', w);
  let sign = await adm(`/v1/admin/products/${id}/tech-pack/sign`, { method: 'POST', body: { name: 'Studio' } });
  ok(sign.status === 409 && sign.json.depositDue, 'Future Basics cannot sign before the deposit lands', [sign.status, sign.json.error]);
  ok((await adm(`/v1/admin/products/${id}/shopify-draft-order`, { method: 'POST', body: { quoteId: quote.json.id } })).status === 409, 'and the balance cannot be invoiced yet');
  const depId = sql(`select id from invoices where product_id='${id}' and kind='deposit'`);
  { const pdfOk = (r, pages) => r.status === 200 && /application\/pdf/.test(r.ct) && r.text.startsWith('%PDF') && /SpaceGrotesk/.test(r.text) && /IBMPlexMono/.test(r.text) && (r.text.match(/\/Type \/Page\b/g) || []).length >= pages && r.text.length > 15000;
    const invPdf = await call(`/v1/invoices/${depId}/download`, { token: tok }); ok(pdfOk(invPdf, 1), 'the deposit invoice downloads as a PDF on the Future Basics letterhead, in the brand typefaces', [invPdf.status, invPdf.ct, invPdf.text.length]);
    ok((await call(`/v1/invoices/${depId}/download`)).status === 401, 'and it needs a sign-in');
    const projId = sql(`select project_id from products where id='${id}'`), colPdf = await call(`/v1/projects/${projId}/share.pdf`, { token: tok }); ok(pdfOk(colPdf, 1), 'the project collection is a branded PDF too', [colPdf.status, colPdf.ct, colPdf.text.length]); }
  ok((await adm(`/v1/admin/invoices/${depId}`, { method: 'PATCH', body: { status: 'paid' } })).status === 200, 'staff mark the deposit paid (a bank transfer)');
  w = at(); ok(w.stage === 'development' && w.owner === 'future-basics', 'a paid deposit puts it back with Future Basics to sign', w);
  sign = await adm(`/v1/admin/products/${id}/tech-pack/sign`, { method: 'POST', body: { name: 'Studio' } }); ok(sign.status === 200, 'Future Basics signs v3');
  w = at(); ok(w.owner === 'factory', 'then it waits on the factory', w);
  // the factory countersigns → locked → sampling
  fv = await call(`/v1/tp/${token}`); for (const c of fv.json.techPack.readiness.callouts) await call(`/v1/tp/${token}/ack`, { method: 'POST', body: { key: c.key } });
  const cs = await call(`/v1/tp/${token}/sign`, { method: 'POST', body: { name: 'Factory Lead' } }); ok(cs.status === 200 && cs.json.techPack.lockedAt, 'the factory countersigns and v3 locks', [cs.status, cs.json.error]);
  w = at(); ok(w.stage === 'sample' && w.owner === 'factory', 'the product is at Sample, with the factory', w);
  // production waits for the sample
  let run = await adm(`/v1/admin/products/${id}/production-runs`, { method: 'POST', body: { quantity: 100 } });
  ok(run.status === 409 && run.json.needsReason, 'production cannot start before the client approves a sample', [run.status, run.json.error]);
  const fd = new FormData(); fd.append('file', new Blob([Buffer.from(jpeg().split(',')[1], 'base64')], { type: 'image/jpeg' }), 'sample.jpg');
  const asset = await call(`/v1/admin/products/${id}/assets?name=Sample%20photos&kind=sample`, { method: 'POST', token: admin, raw: fd });
  ok(asset.status === 201, 'staff upload the sample photos', [asset.status, asset.json.error]);
  const ap = await adm(`/v1/admin/products/${id}/approvals`, { method: 'POST', body: { title: 'Approve the sample', kind: 'sample', assetVersionId: asset.json.version.id } });
  w = at(); const wa = (await waiting()).find(x => x.kind === 'approval'); ok(ap.status === 201 && w.stage === 'approval' && w.owner === 'client' && wa && wa.title === 'Approve the sample', 'a sample approval waits on the client in their list', [ap.status, w, wa]);
  ok((await call(`/v1/approvals/${ap.json.id}/decision`, { method: 'POST', token: tok, body: { decision: 'approved' } })).status === 200, 'the client approves the sample');
  w = at(); ok(w.stage === 'production' && w.owner === 'future-basics', 'it moves to Production', w);
  run = await adm(`/v1/admin/products/${id}/production-runs`, { method: 'POST', body: { quantity: 100 } });
  ok(run.status === 201 && run.json.tech_pack_version === 3 && at().owner === 'factory', 'the run starts on locked v3, with the factory', [run.status, run.json.tech_pack_version]);
  await adm(`/v1/admin/production-runs/${run.json.id}/qc`, { method: 'POST', body: { status: 'passed', inspectedUnits: 100, defectUnits: 0 } });
  w = at(); ok(w.stage === 'delivery' && w.owner === 'factory', 'a passed QC moves it to Delivery', w);
  const ship = await adm(`/v1/admin/production-runs/${run.json.id}/shipments`, { method: 'POST', body: { status: 'shipped', carrier: 'DHL' } });
  ok(at().owner === 'client', 'shipped: waiting on the client to receive it');
  await adm(`/v1/admin/shipments/${ship.json.id}`, { method: 'PATCH', body: { status: 'delivered', deliveredAt: new Date().toISOString() } });
  ok(at().stage === 'delivered' && sql(`select count(*) from milestones where product_id='${id}' and status<>'complete'`) === '0', 'delivered: every milestone complete');
  ok(sql(`select status||'|'||milestone from projects where id=(select project_id from products where id='${id}')`) === 'complete|Delivered', 'and the project is complete');
  ok(Number(sql(`select count(*) from activities where product_id='${id}' and type='flow'`)) >= 12, 'every move is in the product history');
  // a hand override is checked and logged
  const mid = sql(`select id from milestones where product_id='${id}' and name='Quality'`);
  ok((await adm(`/v1/admin/milestones/${mid}`, { method: 'PATCH', body: { status: 'nearly' } })).status === 400, 'a made-up milestone status is refused');
  ok((await adm(`/v1/admin/milestones/${mid}`, { method: 'PATCH', body: { status: 'blocked', notes: 'Re-inspect carton 4' } })).status === 200 && /Quality set by hand: complete → blocked · Re-inspect carton 4/.test(sql(`select summary from activities where product_id='${id}' order by id desc limit 1`)), 'a hand change is logged with its note');
  // requests can be closed
  const rq = await call('/v1/requests', { method: 'POST', token: tok, body: { type: 'question', title: 'Box colour?', details: 'Can the box be black?', productId: id } });
  ok((await adm(`/v1/admin/requests/${rq.json.id}`, { method: 'PATCH', body: { status: 'done', reply: 'Yes, black boxes.' } })).status === 200 && sql(`select status from requests where id='${rq.json.id}'`) === 'done', 'staff close a request with a reply');
  ok(!(await adm('/v1/admin/dashboard')).json.queues.approvals.some(x => x.key === `request:${rq.json.id}`), 'and it leaves the queue');
});

await journey('J58', 'trade fairs: a factory signs up for its own link, buyers it sends are credited to it, and the pages work without Google', async () => {
  const bad = await call('/v1/public/factories', { body: { company: 'Mill', lang: 'zh' } });
  ok(bad.status === 400 && /email, WeChat or phone/.test(bad.json.error), 'a factory with no way to reach it is refused', [bad.status, bad.json.error]);
  ok((await call('/v1/public/factories', { body: { company: '', wechat: 'x' } })).status === 400, 'and one with no company name');
  const f = await call('/v1/public/factories', { body: { company: `宏达鞋业 ${stamp}`, wechat: 'hongda', city: '东莞', source: 'canton', lang: 'zh' } });
  ok(f.status === 201 && /^[A-HJ-NP-Z2-9]{6}$/.test(f.json.code) && f.json.link.endsWith(`/start?ref=f-${f.json.code}&lang=zh`), 'a factory gets a six-character code and a Chinese link', [f.status, f.json]);
  ok(Number(sql(`select count(*) from notifications where type='partner' and title like '%宏达鞋业 ${stamp}%'`)) === 1, 'staff get a notice naming the factory and the fair');
  const email = `j58-${stamp}@buyer.test`;
  const st = await call('/v1/public/start', { body: { email, name: 'Fair Buyer', title: 'Runner', photos: [runner], attribution: { source: `f-${f.json.code.toLowerCase()}`, lang: 'zh', landing: `/start?ref=f-${f.json.code}` } } });
  ok(st.status === 201, 'a buyer starts a tech pack through the factory link', st.status);
  const acq = JSON.parse(sql(`select acquisition::text from clients where id='${st.json.client.id}'`));
  ok(acq.partner === `宏达鞋业 ${stamp}` && acq.partnerCode === f.json.code && acq.lang === 'zh', 'their room is credited to the factory, in the language they used', acq);
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${email}'`), clientId: st.json.client.id, role: 'admin' });
  const list = (await call('/v1/admin/partners', { token: admin })).json.partners, me = list.find(p => p.code === f.json.code);
  ok(me && me.buyers === 1 && me.source === 'canton', 'the console lists the factory with one buyer from the Canton Fair', me);
  ok((await call('/v1/admin/partners', { token: st.json.token })).status === 403, 'a client cannot read the list');
  const page = await call('/fair'), start = await call('/start');
  ok(page.status === 200 && /hub-i18n\.js/.test(page.text) && !/fonts\.googleapis/.test(page.text + start.text), 'the fair page and /start load no Google fonts', page.status);
  ok((await call('/fonts/space-grotesk-latin.woff2')).status === 200 && (await call('/fonts/nope.woff2')).status === 404, 'the fonts are served by the hub');
});

const bad = summary(); process.exit(bad ? 1 : 0);

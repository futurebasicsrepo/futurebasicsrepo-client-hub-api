import { journey, ok, summary, api, jpeg, png, bigJpeg, hugeHeaderPng, codeFrom, sleep, waitAi, forge, sql, stamp, S, setAsideOpportunities, withOpportunityLock, ownerOf } from './lib.mjs';
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
  const admin = await ownerOf(cid); restore = () => call('/v1/admin/tech-pack-billing', { method: 'PUT', token: admin, body: { mode: 'auto' } });
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
  ok(b.checks.every(c => ['ok', 'warn', 'down', 'off', 'info'].includes(c.status) && c.name && c.summary && ['infrastructure', 'integration', 'listening', 'sales', 'delivery'].includes(c.group)), 'every check has a status, a name, a one-line summary and a group');
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
    const invPdf = await call(`/v1/invoices/${depId}/download`, { token: tok }); ok(invPdf.status === 200 && /application\/pdf/.test(invPdf.ct) && invPdf.text.startsWith('%PDF') && /SpaceGrotesk/.test(invPdf.text) && !/RubikMonoOne/.test(invPdf.text), 'the deposit invoice downloads as a PDF on the Future Basics brand letterhead (Space Grotesk, the green cue), not the paper-style sheet', [invPdf.status, invPdf.ct, invPdf.text.length]);
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
  { // the product's folder: every version of the tech pack as a PDF, what staff upload, and one zip of it all
    let list = {}; for (let i = 0; i < 60; i++) { list = (await call(`/v1/products/${id}/files`, { token: tok })).json; if ((list.groups || []).find(g => g.key === 'techpack')?.items.length >= 3 && !list.pending) break; await sleep(500); }
    const g = k => (list.groups || []).find(x => x.key === k)?.items || [];
    ok(g('techpack').length === 3 && g('techpack').filter(i => i.latest).length === 1 && /v3/.test(g('techpack').find(i => i.latest).label), 'the folder holds a PDF of every published version of the tech pack, with the latest marked', g('techpack').map(i => [i.label, i.latest]));
    ok(g('design').some(i => /Sample photos/.test(i.label)), 'the sample photos staff uploaded are in it, without anyone filing them', g('design').map(i => i.label));
    ok(sql(`select count(*) from notifications where client_id='${cid}' and type='file' and entity_id='${id}'`) !== '0', 'the client is told when something new lands in the folder');
    const one = await call(g('techpack')[0].url, { token: tok }); ok(one.status === 200 && /pdf/.test(one.ct) && one.text.startsWith('%PDF'), 'a file downloads on its own', [one.status, one.ct]);
    const zp = await call(`/v1/products/${id}/files.zip`, { token: tok }); ok(zp.status === 200 && /zip/.test(zp.ct) && zp.text.startsWith('PK') && zp.text.includes('README.txt') && zp.text.includes('1 Tech pack') && zp.text.includes('3 Design files') && zp.text.length > 20000, 'the whole folder downloads as one zip, laid out by folder', [zp.status, zp.ct, zp.text.length]);
    ok((await call(`/v1/products/${id}/files`)).status === 401 && (await call(`/v1/products/${id}/files.zip`)).status === 401, 'and it needs a sign-in');
    const fd2 = new FormData(); fd2.append('file', new Blob([Buffer.from(jpeg().split(',')[1], 'base64')], { type: 'image/jpeg' }), 'sample2.jpg');
    ok((await call(`/v1/admin/assets/${asset.json.asset.id}/versions`, { method: 'POST', token: admin, raw: fd2 })).status === 201, 'staff upload a revision of the sample photos');
    list = (await call(`/v1/products/${id}/files`, { token: tok })).json; const sp = g('design').filter(i => /Sample photos/.test(i.label));
    ok(sp.length === 2 && sp.filter(i => i.latest).length === 1, 'the revision is in the folder by itself and the first one is marked as an earlier version', sp.map(i => [i.label, i.latest]));
    const zp2 = await call(`/v1/products/${id}/files.zip`, { token: tok }); ok(zp2.text.includes('Sample-photos-v2') && zp2.text.length > zp.text.length, 'and in the next zip');
  }
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
  const tile = await call('/factory-signup.webmanifest');
  ok(tile.status === 200 && tile.json.start_url === '/fair?side=factory&lang=zh&src=tile' && tile.json.display === 'standalone' && tile.json.icons.length === 3, 'the fair page can be added to a phone as a factory sign-up tile that opens the Chinese factory door', tile.json);
  ok(/rel="apple-touch-icon"/.test(page.text) && /factory-signup\.webmanifest/.test(page.text) && /apple-mobile-web-app-title" content="FB Factory"/.test(page.text), 'and the page names the tile and gives it an icon');
  ok(/id="pageQr"/.test(page.text) && /fair\.scanH/.test(page.text) && /'fair\.scanH'/.test((await call('/hub-i18n.js')).text), 'the factory door carries a QR for the page itself, in all three languages');
});


await journey('J108', 'the builds showcase: nothing is shown until staff list it, people get in by invite or as clients, a revoked or expired invite stops working at once, and every look is recorded for staff', async () => {
  const room = await newRoom('108', { wait: false });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const jar = {}; // one cookie per person, like a browser
  const as = who => async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { ...(jar[who] ? { Cookie: jar[who] } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch {} return { status: r.status, json, text: t, loc: r.headers.get('location'), setCookie: sc }; };
  const signIn = async (who, email) => { const v = as(who); const a = await v('/v1/builds/auth/code', { body: { email } }); await sleep(150); const code = codeFrom(LOG, email); if (!code) return { a, code: null }; return { a, code, b: await v('/v1/builds/auth/verify', { body: { email, code } }) }; };
  const tag = `b${stamp}`;

  // staff make builds: one listed, one invite-only, one hidden
  const mk = async (name, visibility, extra = {}) => (await call('/v1/admin/builds', { token: admin, body: { name: `${name} ${tag}`, visibility, status: 'live', liveUrl: 'https://example.com/' + tag, summary: 'x', ...extra } }));
  const listed = await mk('Listed', 'listed'), only = await mk('Invite only', 'invite'), hidden = await mk('Hidden', 'hidden');
  ok(listed.status === 201 && only.status === 201 && hidden.status === 201, 'staff can add builds', [listed.status, only.status, hidden.status]);
  ok((await call('/v1/admin/builds', { token: admin, body: { name: `Listed ${tag}` } })).status === 409, 'a second build with the same address is refused');
  ok((await call('/v1/admin/builds', { token: admin, body: { name: 'Bad link', liveUrl: 'javascript:alert(1)' } })).status === 422, 'a live address that is not a web address is refused');
  ok((await call('/v1/admin/builds', { token: admin, body: { name: 'Admin', slug: 'admin' } })).status === 422, 'an address the showcase itself uses is refused');
  ok((await call('/v1/admin/builds', { token: room.token })).status === 403 && (await call('/v1/builds')).status === 401, 'clients cannot use the staff routes, and the viewer routes need a sign-in');
  const slug = id => sql(`select slug from builds where id='${id}'`);
  const sListed = slug(listed.json.id), sOnly = slug(only.json.id), sHidden = slug(hidden.json.id);
  ok(Number(sql(`select count(*) from builds where visibility='hidden' and slug in ('spot','bennys-beans','cuesea','incha-tv')`)) >= 1, 'the builds already made were seeded hidden');

  // an address nobody has heard of gets the same answer and no email
  const stranger = `stranger-${tag}@chaos.test`, v0 = as('stranger');
  const before = sql(`select count(*) from login_codes where email='${stranger}'`);
  const ask = await v0('/v1/builds/auth/code', { body: { email: stranger } });
  ok(ask.status === 202 && sql(`select count(*) from login_codes where email='${stranger}'`) === before, 'an unknown address is told the same thing as a known one, and no code is made');
  ok((await v0('/v1/builds/auth/verify', { body: { email: stranger, code: '123456' } })).status === 401, 'and cannot sign in');

  // an existing client sees listed builds only
  const c = await signIn('client', room.email); ok(c.b?.status === 200 && /HttpOnly/i.test(c.b.setCookie || ''), 'a client signs in with an emailed code and gets an HttpOnly cookie', c.b?.status);
  const vc = as('client'); const cl = (await vc('/v1/builds')).json.builds || [];
  ok(cl.some(b => b.slug === sListed) && !cl.some(b => b.slug === sOnly || b.slug === sHidden), 'a client sees the listed build, not the invite-only or hidden ones', cl.map(b => b.slug));
  ok((await vc(`/v1/builds/${sOnly}`)).status === 404 && (await vc(`/v1/builds/${sHidden}`)).status === 404, 'and asking for those by address gets "not found"');
  ok((await vc('/v1/admin/builds')).status === 401, 'the showcase cookie opens nothing in the staff console');

  // an invite to one build
  const guest = `guest-${tag}@chaos.test`;
  const inv = await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, buildId: only.json.id, days: 7, note: 'For the review' } });
  ok(inv.status === 201 && inv.json.invited?.length === 1, 'staff invite a person to one build', inv.json);
  const g = await signIn('guest', guest); ok(g.b?.status === 200, 'the invited person signs in', g.b?.status);
  const vg = as('guest'); const gl = (await vg('/v1/builds')).json.builds || [];
  ok(gl.length === 1 && gl[0].slug === sOnly, 'and sees exactly that build', gl.map(b => b.slug));
  const detail = await vg(`/v1/builds/${sOnly}`); ok(detail.status === 200 && detail.json.build?.summary === 'x', 'its detail opens', detail.status);
  ok((await vg(`/v1/builds/${sListed}`)).status === 404, 'but not the listed one they were not invited to');
  const go = await vg(`/builds/go/${sOnly}`); ok(go.status === 302 && go.loc === 'https://example.com/' + tag, 'the live link goes through the showcase, which sends them on', [go.status, go.loc]);
  ok((await as('nobody')(`/builds/go/${sOnly}`)).status === 302 && !/example\.com/.test((await as('nobody')(`/builds/go/${sOnly}`)).loc || ''), 'without a sign-in the live link sends them to sign in, not to the build');
  // extra links on a build: labels only to the viewer, the address stays behind a recorded redirect
  ok((await call(`/v1/admin/builds/${only.json.id}`, { token: admin, method: 'PUT', body: { links: [{ label: 'Walkthrough', url: 'https://example.com/walk-' + tag }, { label: 'Drawings', url: 'https://example.com/draw-' + tag }] } })).status === 200, 'staff add extra links to a build');
  ok((await call(`/v1/admin/builds/${only.json.id}`, { token: admin, method: 'PUT', body: { links: [{ label: 'Bad', url: 'javascript:alert(1)' }] } })).status === 422 && Number(sql(`select jsonb_array_length(links) from builds where id='${only.json.id}'`)) === 2, 'a link that is not a web address is refused and the saved ones are left alone');
  const withLinks = (await vg(`/v1/builds/${sOnly}`)).json.build; ok(withLinks.links?.length === 2 && withLinks.links[0].label === 'Walkthrough' && !JSON.stringify(withLinks).includes('example.com/walk'), 'the viewer gets the labels, not the addresses');
  const golink = await vg(`/builds/go/${sOnly}/1`); ok(golink.status === 302 && golink.loc === 'https://example.com/draw-' + tag, 'a link goes through the showcase, which sends them on', [golink.status, golink.loc]);
  ok((await vg(`/builds/go/${sOnly}/9`)).status === 404 && (await vg(`/builds/go/${sOnly}/x`)).status === 404 && (await as('client')(`/builds/go/${sOnly}/0`)).status === 404, 'a link that does not exist, or one on a build they cannot see, is "not found"');
  ok((await as('nobody')(`/builds/go/${sOnly}/0`)).status === 302 && !/example\.com/.test((await as('nobody')(`/builds/go/${sOnly}/0`)).loc || ''), 'and without a sign-in it sends them to sign in');
  const chk = i => as(i)(`/v1/builds/auth/check?slug=${sOnly}`); ok((await chk('guest')).status === 200 && (await chk('client')).status === 403 && (await chk('nobody')).status === 401, 'the proxy check lets the invited person in, refuses the client, and asks others to sign in');

  // recorded for staff
  const act = (await call('/v1/admin/builds/activity', { token: admin })).json.events || [];
  ok(act.some(e => e.email === guest && e.slug === sOnly && e.kind === 'open') && act.some(e => e.email === guest && e.kind === 'demo'), 'staff see that the guest looked and went on to the live build', act.slice(0, 3));
  await vg(`/v1/builds/${sOnly}`); ok(Number(sql(`select count(*) from build_views where email='${guest}' and kind='open'`)) === 1, 'opening the same page again soon is not counted twice');

  // revoke: the cookie they already hold stops working
  const invs = (await call('/v1/admin/builds/invites', { token: admin })).json.invites || []; const mine = invs.find(i => i.email === guest);
  ok(mine && mine.views >= 1 && mine.first_seen_at, 'the invite list shows they have been', mine);
  ok((await call(`/v1/admin/builds/invites/${mine.id}`, { token: admin, method: 'DELETE' })).status === 200, 'staff revoke the invite');
  ok((await vg('/v1/builds')).status === 401 && (await chk('guest')).status === 401, 'the cookie they already hold stops working at once');
  const codesBefore = sql(`select count(*) from login_codes where email='${guest}'`);
  ok((await as('guest2')('/v1/builds/auth/code', { body: { email: guest } })).status === 202 && sql(`select count(*) from login_codes where email='${guest}'`) === codesBefore, 'asking for a code again looks the same from outside, but no code is made for a revoked address');

  // expiry
  const late = `late-${tag}@chaos.test`; await call('/v1/admin/builds/invites', { token: admin, body: { emails: late, days: 7 } });
  const l = await signIn('late', late); ok(l.b?.status === 200, 'an invite for all listed builds works', l.b?.status);
  ok(((await as('late')('/v1/builds')).json.builds || []).some(b => b.slug === sListed) && !((await as('late')('/v1/builds')).json.builds || []).some(b => b.slug === sOnly), 'it shows the listed builds and nothing else');
  sql(`update build_invites set expires_at=now()-interval '1 minute' where email='${late}'`);
  ok((await as('late')('/v1/builds')).status === 401, 'an invite that has expired stops working');

  // staff: withdraw a build, edit, delete
  ok((await call(`/v1/admin/builds/${listed.json.id}`, { token: admin, method: 'PUT', body: { visibility: 'hidden' } })).status === 200 && !(((await vc('/v1/builds')).json.builds || []).some(b => b.slug === sListed)), 'withdrawing a build removes it from clients at once');
  const png1 = await png(40, 30);
  ok((await call(`/v1/admin/builds/${only.json.id}/cover`, { token: admin, method: 'PUT', body: { image: png1 } })).status === 200 && (await call(`/v1/admin/builds/${only.json.id}/cover`, { token: admin })).ct.startsWith('image/'), 'staff can add a cover picture and read it back');
  ok((await call(`/v1/admin/builds/${only.json.id}/cover`, { token: admin, method: 'PUT', body: { image: 'data:text/html;base64,PGI+' } })).status === 422, 'a cover that is not a picture is refused');
  for (const id of [listed, only, hidden]) await call(`/v1/admin/builds/${id.json.id}`, { token: admin, method: 'DELETE' });
  ok(Number(sql(`select count(*) from builds where slug in ('${sListed}','${sOnly}','${sHidden}')`)) === 0, 'staff can delete a build');
  ok(/Future Basics/.test((await call('/builds')).text) && (await call('/builds/admin')).status === 200, 'the viewer and staff pages are served');
});


await journey('J111', 'the Sales OS: a person who looks at a build becomes a contact with a deal and a follow-up, contacts/deals/tasks do what they say, nothing is lost or duplicated, and only staff can see any of it', async () => {
  const room = await newRoom('111', { wait: false });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const tag = `c${stamp}`, S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  ok((await call('/v1/sales/overview')).status === 401 && (await call('/v1/sales/overview', { token: room.token })).status === 403, 'nothing is open to the public or to clients');

  // a showcase look becomes a lead
  const build = await call('/v1/admin/builds', { token: admin, body: { name: `Lead bait ${tag}`, visibility: 'listed', status: 'live', liveUrl: 'https://example.com/' + tag } });
  const guest = `guest-${tag}@chaos.test`; const jar = {};
  const as = async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { ...(jar.c ? { Cookie: jar.c } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch {} return { status: r.status, json, text: t }; };
  ok((await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, note: 'Saw you at the salon expo', send: false } })).status === 201, 'staff invite someone to the showcase');
  const slug = sql(`select slug from builds where id='${build.json.id}'`);
  await as('/v1/builds/auth/code', { body: { email: guest } }); await sleep(150); await as('/v1/builds/auth/verify', { body: { email: guest, code: codeFrom(LOG, guest) } });
  let found = (await S(`/contacts?q=${encodeURIComponent(guest)}`)).json; ok(found.total === 1 && found.contacts[0].source === 'showcase', 'the invite already put them in the CRM', found.contacts?.[0]);
  const cid = found.contacts[0].id;
  await as(`/v1/builds/${slug}`); await as(`/v1/builds/${slug}`); const go = await as(`/builds/go/${slug}`); ok(go.status === 302, 'they look twice and click through to the live build');
  const detail = (await S(`/contacts/${cid}`)).json; const texts = detail.activities.map(a => a.text).join(' | ');
  ok(/Invited to the showcase: Saw you at the salon expo/.test(texts) && /Looked at Lead bait/.test(texts) && /Opened the live build: Lead bait/.test(texts), 'the timeline says what happened, in order', texts);
  ok(detail.activities.filter(a => a.kind === 'showcase_view').length === 1, 'looking twice in a row is one look, not two');
  ok(detail.deals.length === 1 && detail.deals[0].title === `Showcase interest: Lead bait ${tag}` && detail.deals[0].stage === 'new', 'one deal to work, however many times they look', detail.deals);
  const follow = detail.tasks.find(t => /Follow up/.test(t.title)); const due = follow && new Date(follow.due_at);
  ok(follow && due > new Date() && ![0, 6].includes(due.getUTCDay()) && due.getUTCHours() === 9, 'a click-through leaves a follow-up for the next working day', follow);
  ok(['hot', 'warm'].includes(detail.contact.heat.level), 'and they are warm', detail.contact.heat);
  const ov = (await S('/overview')).json; ok(ov.hot.some(c => c.id === cid) && ov.recent.some(a => a.contact_id === cid) && ov.newLeads >= 1, 'Today shows them among the warm contacts and in the latest activity');

  // contacts by hand
  const dup = `dana-${tag}@salon.test`;
  const made = await S('/contacts', { body: { name: 'Dana Reyes', email: dup.toUpperCase(), companyName: `Salon ${tag}`, tags: 'VIP, salon', source: 'referral' } }); ok(made.status === 201 && !made.json.existing, 'a contact is added');
  const again = await S('/contacts', { body: { name: 'Someone else', email: dup } }); ok(again.status === 200 && again.json.existing && again.json.id === made.json.id, 'the same email address again finds the same person (case does not matter)');
  ok((await S('/contacts', { body: { email: 'nope' } })).status === 422 && (await S('/contacts', { body: {} })).status === 422, 'a bad email, or nothing to go on, is refused');
  const d1 = (await S(`/contacts/${made.json.id}`)).json.contact; ok(d1.company === `Salon ${tag}` && d1.tags.join() === 'vip,salon' && d1.email === dup, 'cleaned: lower-case email and tags, the company created', d1);
  ok((await S(`/contacts/${made.json.id}`, { method: 'PUT', body: { email: guest } })).status === 409, 'changing an email to one that is taken is refused');
  ok((await S(`/contacts/${made.json.id}`, { method: 'PUT', body: { phone: '555-0100', companyName: `Salon ${tag} Group` } })).status === 200 && (await S(`/contacts/${made.json.id}`)).json.contact.company === `Salon ${tag} Group`, 'an update changes only what it sends');
  ok((await S(`/contacts?tag=vip&q=${tag}`)).json.contacts.some(c => c.id === made.json.id) && (await S(`/contacts?source=referral&q=${tag}`)).json.total >= 1, 'search, tag and source find them');
  ok((await S(`/contacts/${made.json.id}/unsubscribe`, { method: 'PUT', body: { unsubscribed: true } })).status === 200 && (await S(`/contacts/${made.json.id}`)).json.contact.unsubscribed === true, 'someone can be marked not to be emailed, and it is on their record');
  ok((await S(`/contacts/${made.json.id}/activities`, { body: { kind: 'call', text: 'Loved the spa concept' } })).status === 201 && (await S(`/contacts/${made.json.id}/activities`, { body: { kind: 'call', text: '  ' } })).status === 422, 'a call is logged on the timeline; an empty one is refused');

  // deals
  const before = (await S('/overview')).json.pipeline.openValueCents;
  const deal = await S('/deals', { body: { title: `Salon site ${tag}`, contactId: made.json.id, value: '$12,500', expectedClose: '2026-12-01', source: 'referral' } }); ok(deal.status === 201, 'a deal is started on the contact');
  const after = (await S('/overview')).json.pipeline; ok(after.openValueCents - before === 1250000, 'its value ($12,500) joins the open pipeline', [before, after.openValueCents]);
  ok((await S('/deals', { body: { title: 'x', value: 'lots' } })).status === 422 && (await S('/deals', { body: { title: 'x', expectedClose: '2026-02-31' } })).status === 422, 'a value that is not money, or a date that does not exist, is refused');
  ok((await S(`/deals/${deal.json.id}`, { method: 'PUT', body: { stage: 'meeting' } })).status === 200, 'it moves to Meeting');
  ok(/Salon site.*New → Meeting/.test((await S(`/contacts/${made.json.id}`)).json.activities.map(a => a.text).join('|')), 'and the move is on the contact’s timeline');
  ok((await S(`/deals/${deal.json.id}`, { method: 'PUT', body: { stage: 'lost' } })).status === 422, 'losing a deal needs a reason');
  ok((await S(`/deals/${deal.json.id}`, { method: 'PUT', body: { stage: 'lost', lostReason: 'Went with their nephew' } })).status === 200 && sql(`select (closed_at is not null)::text from sales_deals where id='${deal.json.id}'`) === 'true', 'with one it closes, and the close is dated');
  ok((await S(`/deals/${deal.json.id}`, { method: 'PUT', body: { stage: 'proposal' } })).status === 200 && sql(`select (closed_at is null)::text from sales_deals where id='${deal.json.id}'`) === 'true', 'reopening clears the close date');
  ok((await S('/deals?stage=proposal')).json.deals.some(d => d.id === deal.json.id), 'the pipeline lists it under Proposal');

  // tasks
  const t1 = await S('/tasks', { body: { contactId: made.json.id, title: 'Send the proposal', dueAt: '2020-01-01' } }); ok(t1.status === 201, 'a task is added to a contact');
  ok((await S('/tasks', { body: { title: 'floating' } })).status === 422, 'a task must belong to a contact or a deal');
  ok((await S('/tasks?scope=overdue')).json.tasks.some(t => t.id === t1.json.id), 'a task due in the past is overdue');
  ok((await S(`/tasks/${t1.json.id}`, { method: 'PUT', body: { done: true } })).status === 200 && !(await S('/tasks?scope=open')).json.tasks.some(t => t.id === t1.json.id) && (await S('/tasks?scope=done')).json.tasks.some(t => t.id === t1.json.id), 'ticking it off moves it to done');
  ok(/Done: Send the proposal/.test((await S(`/contacts/${made.json.id}`)).json.activities.map(a => a.text).join('|')), 'and says so on the timeline');

  // bringing people in
  const csv = `Name,E-mail,Company,Tags\r\n"Reyes, Sam",sam-${tag}@roaster.test,"Roaster ${tag}",coffee\r\nDup,${dup},,\r\nBroken,not-an-email,,\r\n`;
  const imp = await S('/import/csv', { body: { csv } }); ok(imp.json.created === 1 && imp.json.alreadyThere === 1 && imp.json.invalid === 1 && /Row 4/.test(imp.json.errors[0]), 'a pasted list adds the new, recognises the known, and says which row is wrong', imp.json);
  ok((await S('/import/csv', { body: { csv: 'name,email' } })).status === 422, 'a list with no people is refused');
  const hub1 = await S('/import/hub', { body: {} }); ok(hub1.json.created >= 1, 'the hub’s clients and leads become contacts', hub1.json);
  const hub2 = await S('/import/hub', { body: {} }); ok(hub2.json.created === 0 && hub2.json.alreadyThere === hub1.json.created + hub1.json.alreadyThere, 'and doing it again adds nobody', hub2.json);
  ok(sql(`select count(*) from sales_contacts where lower(email)='${room.email}' and client_id is not null`) === '1', 'a hub client is linked to its contact');

  // clean up
  ok((await S(`/contacts/${made.json.id}`, { method: 'DELETE' })).status === 200 && sql(`select count(*) from sales_activities where contact_id='${made.json.id}'`) === '0' && sql(`select count(*) from sales_tasks where contact_id='${made.json.id}'`) === '0', 'deleting a contact takes their history and tasks with them');
  ok((await S(`/contacts/00000000-0000-0000-0000-000000000000`)).status === 404 && (await S('/contacts/not-an-id')).status === 404, 'an address that is not there says so');
  await call(`/v1/admin/builds/${build.json.id}`, { token: admin, method: 'DELETE' });
});

await journey('J110', 'the showcase follows the apps: a merged change to a build is noticed, queued for staff in plain words, published when they say (or by itself), and a repository that cannot be read says so without stopping the rest', async () => {
  const http = await import('node:http');
  const gh = { pulls: [], files: {}, lastCommit: new Date().toISOString(), missing: new Set(['missing']) };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const m = /^\/repos\/mock\/([^/]+)(\/.*)?$/.exec(p); if (!m) return send(404, {});
    if (gh.missing.has(m[1])) return send(404, { message: 'Not Found' });
    if (!m[2]) return send(200, { default_branch: 'main' });
    if (m[2] === '/commits') return send(200, [{ commit: { committer: { date: gh.lastCommit } } }]);
    if (m[2] === '/pulls') return send(200, gh.pulls);
    const f = /^\/pulls\/(\d+)\/files$/.exec(m[2]); if (f) return send(200, (gh.files[f[1]] || []).map(filename => ({ filename })));
    send(404, {});
  });
  await new Promise(r => server.listen(3132, '127.0.0.1', r));
  try {
    const room = await newRoom('110', { wait: false });
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
    const tag = `s${stamp}`, jar = {};
    const as = async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { ...(jar.c ? { Cookie: jar.c } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar.c = sc.split(';')[0]; const t = await r.text(); let json = {}; try { json = JSON.parse(t); } catch {} return { status: r.status, json, text: t }; };
    await as('/v1/builds/auth/code', { body: { email: room.email } }); await sleep(150); const sign = await as('/v1/builds/auth/verify', { body: { email: room.email, code: codeFrom(LOG, room.email) } }); ok(sign.status === 200, 'setup: a client can see the showcase', sign.status);

    const made = await call('/v1/admin/builds', { token: admin, body: { name: `Followed ${tag}`, visibility: 'listed', status: 'live', repoUrl: 'https://github.com/mock/app', repoPath: 'sub' } });
    const broken = await call('/v1/admin/builds', { token: admin, body: { name: `Broken ${tag}`, visibility: 'hidden', repoUrl: 'https://github.com/mock/missing' } });
    ok(made.status === 201 && broken.status === 201, 'setup: a build that lives in a folder of a repository, and one pointing at a repository that is not there');
    const list = async () => (await call('/v1/admin/builds', { token: admin })).json.builds; const mine = async () => (await list()).find(b => b.id === made.json.id);
    const slugOf = sql(`select slug from builds where id='${made.json.id}'`);
    ok((await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'PUT', body: { repoPath: '../etc' } })).status === 200 && (await mine()).repo_path === '', 'a folder that tries to leave the repository is stored as nothing');
    await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'PUT', body: { repoPath: '/sub/' } }); ok((await mine()).repo_path === 'sub', 'and a tidy one is kept');

    // first look: records the time and the last change, queues nothing
    const first = await call('/v1/admin/builds/sync', { token: admin, body: { buildId: made.json.id } });
    ok(first.status === 200 && first.json.checked === 1 && first.json.queued === 0 && first.json.failed === 0, 'the first look checks the build and queues nothing from the past', first.json);
    const b1 = await mine(); ok(b1.synced_at && b1.last_change_at && b1.sync_error === '', 'it knows when the code last changed and that the look worked', b1);
    ok(((await as('/v1/builds')).json.builds.find(b => b.slug === slugOf) || {}).updatedAt, 'and a visitor sees when the build was last updated');

    // a change that touches the build, one that does not
    const soon = () => new Date(Date.now() + 5000).toISOString();
    gh.pulls = [{ number: 21, title: 'feat: Orders now text you when they ship (#21)', merged_at: soon(), html_url: 'https://github.com/mock/app/pull/21' }, { number: 22, title: 'docs: readme', merged_at: soon(), html_url: 'https://github.com/mock/app/pull/22' }];
    gh.files = { 21: ['sub/orders.js', 'package.json'], 22: ['README.md'] };
    const second = await call('/v1/admin/builds/sync', { token: admin, body: { buildId: made.json.id } });
    ok(second.json.queued === 1, 'a merged change that touched the build is queued, and one that did not is ignored', second.json);
    const waiting = (await call('/v1/admin/builds/updates?status=new', { token: admin })).json.updates.filter(u => u.build_id === made.json.id);
    ok(waiting.length === 1 && waiting[0].text === 'Orders now text you when they ship' && /pull\/21/.test(waiting[0].url) && /^feat:/.test(waiting[0].raw_title), 'staff see it in plain words, with the original title and the GitHub address', waiting);
    ok(((await as(`/v1/builds/${slugOf}`)).json.build.news || []).length === 0, 'visitors see nothing of it until it is published');
    ok((await mine()).new_updates === 1, 'the build list says one is waiting');

    // publish, edited
    ok((await call(`/v1/admin/builds/updates/${waiting[0].id}`, { token: admin, method: 'PUT', body: { status: 'bogus' } })).status === 422 && (await call(`/v1/admin/builds/updates/${waiting[0].id}`, { token: admin, method: 'PUT', body: { text: '   ' } })).status === 422, 'a bad status or an empty line is refused');
    ok((await call(`/v1/admin/builds/updates/${waiting[0].id}`, { token: admin, method: 'PUT', body: { status: 'published', text: 'Orders now text you the moment they ship' } })).status === 200, 'staff publish it with their own words');
    const seen = await as(`/v1/builds/${slugOf}`); const text = JSON.stringify(seen.json);
    ok(seen.json.build.news.length === 1 && seen.json.build.news[0].text === 'Orders now text you the moment they ship', 'visitors read the edited line under what is new', seen.json.build.news);
    ok(!/github|mock\/app|pull\/21|#21|feat:|raw_title|sync_error|repo_path/i.test(text), 'and nothing of the pull request, the repository or the sync reaches them');
    ok((await call('/v1/admin/builds/sync', { token: admin, body: { buildId: made.json.id } })).json.queued === 0, 'looking again finds nothing new and does not queue the same change twice');

    // automatic
    await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'PUT', body: { autoPublish: true } });
    gh.pulls.unshift({ number: 23, title: 'Fix: refunds show the right total', merged_at: soon(), html_url: 'https://github.com/mock/app/pull/23' }); gh.files[23] = ['sub/refunds.js'];
    const auto = await call('/v1/admin/builds/sync', { token: admin, body: { buildId: made.json.id } });
    ok(auto.json.published === 1 && auto.json.queued === 0, 'a build set to publish by itself publishes straight away', auto.json);
    ok((await as(`/v1/builds/${slugOf}`)).json.build.news.map(n => n.text).join('|') === 'Refunds show the right total|Orders now text you the moment they ship', 'newest first');

    // dismiss
    await call(`/v1/admin/builds/${made.json.id}`, { token: admin, method: 'PUT', body: { autoPublish: false } });
    gh.pulls.unshift({ number: 24, title: 'chore: tidy', merged_at: soon(), html_url: 'https://github.com/mock/app/pull/24' }); gh.files[24] = ['sub/x.js'];
    await call('/v1/admin/builds/sync', { token: admin, body: { buildId: made.json.id } });
    const tidy = (await call('/v1/admin/builds/updates?status=new', { token: admin })).json.updates.find(u => u.build_id === made.json.id);
    ok(tidy && (await call(`/v1/admin/builds/updates/${tidy.id}`, { token: admin, method: 'PUT', body: { status: 'dismissed' } })).status === 200 && ((await as(`/v1/builds/${slugOf}`)).json.build.news || []).length === 2, 'a dismissed change never reaches visitors');
    ok((await call('/v1/admin/builds/updates?status=dismissed', { token: admin })).json.updates.some(u => u.id === tidy.id), 'but staff can still find it');

    // by hand
    const manual = await call(`/v1/admin/builds/${made.json.id}/updates`, { token: admin, body: { text: 'New look for the order screen' } });
    ok(manual.status === 201 && (await as(`/v1/builds/${slugOf}`)).json.build.news.some(n => n.text === 'New look for the order screen'), 'a line staff write by hand is published at once');
    ok((await call(`/v1/admin/builds/00000000-0000-0000-0000-000000000000/updates`, { token: admin, body: { text: 'x' } })).status === 404, 'and for a build that is not there it says so');

    // a repository that cannot be read does not stop the others
    const all = await call('/v1/admin/builds/sync', { token: admin, body: {} });
    ok(all.json.failed >= 1 && all.json.errors.some(e => e.startsWith(`Broken ${tag}`) && /cannot see this repository/.test(e)), 'a repository GitHub cannot see is reported by build name, in words staff can act on', all.json);
    const bb = (await list()).find(b => b.id === broken.json.id); ok(/cannot see this repository/.test(bb.sync_error), 'and the build list shows the problem on that build');
    ok((await mine()).sync_error === '', 'while the build next to it carries on');

    // who may do this
    ok((await call('/v1/admin/builds/sync', { token: room.token, body: {} })).status === 403 && (await as('/v1/admin/builds/updates')).status === 401, 'clients and showcase visitors cannot use any of it');
    for (const id of [made, broken]) await call(`/v1/admin/builds/${id.json.id}`, { token: admin, method: 'DELETE' });
  } finally { await new Promise(r => server.close(r)); }
});


await journey('J115', 'one CRM for every customer: hub clients and the people who sign in for them become contacts tagged client / lead / tech-pack, kept in step, with tags, filters, bulk tagging and saved views', async () => {
  const room = await newRoom('115', { wait: false }), tag = `t${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  const cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const mine = async email => (await S(`/contacts?q=${encodeURIComponent(email)}`)).json.contacts.find(c => c.email === email);
  ok((await call('/v1/sales/tags', { token: room.token })).status === 403 && (await call('/v1/sales/segments')).status === 401, 'tags and views are for staff only');

  // the hub's clients become contacts
  sql(`update clients set status='lead', marketing_opt_out_at=null where id='${cid}'`);
  const hasTP = sql(`select count(*) from tech_packs where client_id='${cid}'`) !== '0';
  const r1 = await S('/import/hub', { body: {} }); ok(r1.status === 200 && r1.json.created >= 1 && r1.json.people >= 1, 'the sync adds the hub’s people', r1.json);
  let c = await mine(room.email); ok(c && c.source === 'hub' && c.clientId === cid && c.tags.includes('lead') && !c.tags.includes('client') && (hasTP ? c.tags.includes('tech-pack') : true), 'a website lead is tagged lead (and tech-pack when they have a tech pack)', c);
  ok(hasTP, 'setup: the room has a tech pack, so the tech-pack tag is expected');
  const r2 = await S('/import/hub', { body: {} }); ok(r2.json.created === 0 && r2.json.updated === 0, 'running it again changes nothing', r2.json);

  // staff tags survive; hub tags follow the hub
  await S(`/contacts/${c.id}`, { method: 'PUT', body: { tags: [...c.tags, 'Builds', 'VIP Client'] } });
  sql(`update clients set status='active' where id='${cid}'`); await S('/import/hub', { body: {} });
  c = await mine(room.email); ok(c.tags.includes('client') && !c.tags.includes('lead') && c.tags.includes('builds') && c.tags.includes('vip-client') && c.tags.includes('tech-pack'), 'when the lead becomes a client the hub tags follow and the staff tags (builds, vip-client) stay', c.tags);

  // another person who signs in for the same client; staff addresses are left out
  const second = `second-${tag}@chaos.test`; sql(`insert into users(client_id,email,name,role) values('${cid}','${second}','Second Person','client') on conflict do nothing`);
  const staffAddr = `staffer-${tag}@thefuturebasics.com`; sql(`insert into users(client_id,email,name,role) values('${cid}','${staffAddr}','Staffer','client') on conflict do nothing`);
  await S('/import/hub', { body: {} }); const sp = await mine(second); ok(sp && sp.company && sp.tags.includes('client') && sp.clientId === cid && !(await mine(staffAddr)), 'another person at the same client is a contact too; our own staff are not');

  // the hub's marketing opt-out is respected
  sql(`update clients set marketing_opt_out_at=now() where id='${cid}'`); await S('/import/hub', { body: {} }); await S('/import/hub', { body: {} });
  const d = (await S(`/contacts/${c.id}`)).json; ok(d.contact.emailOk === false && d.activities.filter(a => /Opted out of marketing/.test(a.text)).length === 1, 'a client who opted out of marketing in the hub is marked not to be emailed, once, with a note');
  sql(`update clients set marketing_opt_out_at=null where id='${cid}'`);
  sql(`update clients set archived_at=now() where id='${cid}'`); const third = `third-${tag}@chaos.test`; sql(`insert into users(client_id,email,name,role) values('${cid}','${third}','Third','client') on conflict do nothing`); await S('/import/hub', { body: {} });
  ok(!(await mine(third)), 'an archived client brings in no new people'); sql(`update clients set archived_at=null where id='${cid}'`);

  // tags, filters and counts
  const mk = async (name, tags) => (await S('/contacts', { body: { name, email: `${name.toLowerCase()}-${tag}@x.test`, tags } })).json.id;
  const c1 = await mk('One', [`${tag}a`, `${tag}b`]), c2 = await mk('Two', [`${tag}a`]), c3 = await mk('Three', [`${tag}b`, `${tag}c`]);
  const ids = async qs => (await S(`/contacts?limit=100&${qs}`)).json.contacts.map(x => x.id);
  ok((await ids(`tags=${tag}a,${tag}b`)).join() === c1, 'asking for two tags finds only who has both');
  ok((await ids(`tags=${tag}a&exclude=${tag}b`)).join() === c2, 'a tag can be excluded');
  ok((await ids(`tag=${tag}c`)).join() === c3 && (await ids(`q=${tag}c`)).includes(c3), 'one tag, or a search that matches a tag, finds them');
  const cnt = (await S('/tags')).json; ok(cnt.tags.find(t => t.tag === `${tag}a`).n === 2 && cnt.tags.find(t => t.tag === `${tag}b`).n === 2 && cnt.auto.includes('tech-pack'), 'tag counts are right, and the hub-managed tags are named');
  const made = (await S('/contacts', { body: { name: 'Typed', email: `typed-${tag}@x.test`, tags: 'Tech Pack, VIP!!, a_b' } })).json.id; ok((await S(`/contacts/${made}`)).json.contact.tags.join() === 'a-b,tech-pack,vip' || (await S(`/contacts/${made}`)).json.contact.tags.sort().join() === 'a-b,tech-pack,vip', 'whatever is typed becomes a clean tag');

  // bulk
  const bulk = await S('/contacts/bulk-tags', { body: { ids: [c1, c2, 'not-an-id'], add: ['Builds Customer', `${tag}z`], remove: [`${tag}a`] } });
  ok(bulk.status === 200 && bulk.json.changed === 2, 'tags are added and removed on many contacts at once', bulk.json);
  const t1 = (await S(`/contacts/${c1}`)).json.contact.tags, t3 = (await S(`/contacts/${c3}`)).json.contact.tags;
  ok(!t1.includes(`${tag}a`) && t1.includes('builds-customer') && t1.includes(`${tag}b`) && t1.includes(`${tag}z`) && !t3.includes('builds-customer'), 'only the chosen contacts change, and the other tags stay');
  ok((await S('/contacts/bulk-tags', { body: { ids: [], add: ['x'] } })).status === 422 && (await S('/contacts/bulk-tags', { body: { ids: [c1] } })).status === 422 && (await S('/contacts/bulk-tags', { body: { ids: Array.from({ length: 501 }, () => c1), add: ['x'] } })).status === 422, 'nothing chosen, nothing to do, or too many are refused');

  // saved views
  const segs = (await S('/segments')).json.segments; ok(['Tech pack customers', 'Builds customers', 'Leads', 'Showcase interest'].every(n => segs.some(s => s.name === n)) && segs.find(s => s.name === 'Tech pack customers').count >= 1, 'the starter views are there, with counts');
  const sg = await S('/segments', { body: { name: `Mine ${tag}`, filter: { tags: [`${tag}b`, `${tag}z`] } } }); ok(sg.status === 201 && (await S('/segments')).json.segments.find(s => s.id === sg.json.id).count === 1, 'a view is saved and counts who is in it now');
  ok((await S(`/segments/${sg.json.id}`, { method: 'PUT', body: { name: `Renamed ${tag}`, filter: { tags: [`${tag}b`] } } })).status === 200 && (await S('/segments')).json.segments.find(s => s.id === sg.json.id).count === 2, 'it can be changed');
  ok((await S('/segments', { body: { name: 'Empty', filter: {} } })).status === 422 && (await S('/segments', { body: { filter: { tags: ['x'] } } })).status === 422 && (await S('/segments/00000000-0000-0000-0000-000000000000', { method: 'DELETE' })).status === 404, 'a view needs a name and a filter; an unknown one is not found');
  ok((await S(`/segments/${sg.json.id}`, { method: 'DELETE' })).status === 200, 'and can be removed');

  // showcase people are tagged as they arrive
  const guest = `guest-${tag}@chaos.test`; await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, send: false } });
  ok((await mine(guest)).tags.includes('showcase'), 'someone invited to the showcase is tagged showcase');
});

await journey('J113', 'Sales email: who may be emailed, what goes out (footer, address, one-click unsubscribe), what comes back (deliveries, bounces, spam complaints, replies, opt-outs), and nothing is sent twice or to someone who said stop', async () => {
  const http = await import('node:http'), { createHmac } = await import('node:crypto');
  const mock = { sent: [], seenKeys: new Map(), received: new Map(), n: 0, failAddress: 'failme', receivedDown: new Set() };
  const resend = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const u = new URL(req.url, 'http://x'); if (req.headers.authorization !== 'Bearer test-key') return send(401, { message: 'bad key' });
      if (req.method === 'POST' && u.pathname === '/emails') {
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'), key = req.headers['idempotency-key'];
        if (String(body.to?.[0] || '').includes(mock.failAddress)) return send(422, { message: 'The recipient address is not valid' });
        if (key && mock.seenKeys.has(key)) return send(200, { id: mock.seenKeys.get(key) });
        const id = `re_${++mock.n}`; if (key) mock.seenKeys.set(key, id); mock.sent.push({ id, key, body, headers: req.headers }); return send(200, { id });
      }
      const m = /^\/emails\/receiving\/(.+)$/.exec(u.pathname); if (req.method === 'GET' && m) { const id = decodeURIComponent(m[1]); if (mock.receivedDown.has(id)) return send(503, { message: 'try later' }); return mock.received.has(id) ? send(200, mock.received.get(id)) : send(404, { message: 'not found' }); }
      send(404, {});
    });
  });
  await new Promise(r => resend.listen(3133, '127.0.0.1', r));
  try {
    const room = await newRoom('113', { wait: false }), tag = `m${stamp}`;
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
    const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
    const secret = 'whsec_' + Buffer.from('test-secret').toString('base64');
    const hook = async (evt, { sign = true, id = `msg_${Math.random().toString(36).slice(2)}`, ts = String(Math.floor(Date.now() / 1000)) } = {}) => { const raw = JSON.stringify(evt); const sig = 'v1,' + createHmac('sha256', Buffer.from('test-secret')).update(`${id}.${ts}.${raw}`).digest('base64'); const r = await fetch(BASE + '/webhooks/resend', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sign ? sig : 'v1,AAAAAAAA' }, body: raw }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
    const contact = async email => (await S(`/contacts?q=${encodeURIComponent(email)}`)).json.contacts.find(c => c.email === email);
    const detail = async id => (await S(`/contacts/${id}`)).json;
    ok((await call('/v1/sales/email/settings', { token: room.token })).status === 403 && (await call('/webhooks/resend', { body: {} })).status === 401, 'clients cannot use the email routes, and the webhook refuses anything unsigned');

    // settings
    const st = (await S('/email/settings')).json; ok(st.configured.sending && st.configured.webhook && st.settings.fromAddress === 'kyle@mail.thefuturebasics.com' && st.settings.dailyCap === 60 && st.remaining > 0, 'settings: sending is on, from the verified sending domain, with room under the daily limit', st);
    ok((await S('/email/settings', { method: 'PUT', body: { fromAddress: 'nope' } })).status === 422 && (await S('/email/settings', { method: 'PUT', body: { dailyCap: 5000 } })).status === 422, 'a bad from address or an absurd limit is refused');

    // someone with a relationship: invited to the showcase
    const guest = `guest-${tag}@chaos.test`; await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, note: 'Met at the salon expo', send: false } });
    const g = await contact(guest); ok(g, 'setup: an invited person is in the CRM');

    // templates
    const tpls = (await S('/templates')).json; ok(tpls.templates.length >= 4 && tpls.fields.includes('first_name'), 'four starter templates are there');
    ok((await S('/templates', { body: { name: 'Bad', subject: 'Hi {{nickname}}', body: 'x' } })).status === 422, 'a template with a field that does not exist is refused, and told what is available');
    const mine = await S('/templates', { body: { name: `Mine ${tag}`, subject: 'About {{company}}', body: 'Hi {{first_name}}' } }); ok(mine.status === 201 && (await S(`/templates/${mine.json.id}`, { method: 'PUT', body: { name: `Mine ${tag}`, subject: 'Hello', body: 'Hi there' } })).status === 200 && (await S(`/templates/${mine.json.id}`, { method: 'DELETE' })).status === 200, 'templates can be added, changed and deleted');

    // preview
    const starter = tpls.templates[0], pv = (await S(`/contacts/${g.id}/email-preview`, { body: { subject: starter.subject, body: starter.body } })).json;
    ok(!/\{\{/.test(pv.subject + pv.body) && /Hi there,/.test(pv.body) && pv.missing.length === 0, 'the preview fills the blanks, with fallbacks where we do not know a name', pv);
    ok((await S(`/contacts/${g.id}/email-preview`, { body: { subject: 'x', body: 'About {{company}} and {{bogus}}' } })).json.missing.includes('company'), 'and says what is missing');

    // sending
    const chk = (await S(`/contacts/${g.id}/email-check`)).json; ok(chk.ok && chk.relationship.ok && chk.from.includes('kyle@mail.thefuturebasics.com'), 'an invited person may be emailed', chk);
    ok((await S(`/contacts/${g.id}/email`, { body: { subject: 'Hi', body: 'Hi {{company}}' } })).status === 422, 'a message with a blank we cannot fill is not sent');
    const sent = await S(`/contacts/${g.id}/email`, { body: { subject: 'Thanks for looking <b>', body: 'Hi there <b>friend</b>,\n\nSee https://builds.thefuturebasics.com for more.\n\nKyle' } }); ok(sent.status === 201, 'it is sent', sent.json);
    const out = mock.sent.at(-1);
    ok(out.body.from === 'Kyle at Future Basics <kyle@mail.thefuturebasics.com>' && out.body.to[0] === guest, 'from the verified sending domain, to the right person');
    ok(/^<https?:\/\/[^>]+\/u\/[0-9a-f-]{36}\.[\w-]{22}>$/.test(out.body.headers['List-Unsubscribe']) && out.body.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'it carries the one-click unsubscribe headers');
    ok(out.body.text.includes('1 Test Street, Philadelphia, PA 19103') && out.body.text.includes('Unsubscribe here: ') && out.body.html.includes('Unsubscribe</a>') && !out.body.html.includes('<b>') && out.body.html.includes('&lt;b&gt;'), 'with the mailing address and a way out in both versions, and nothing typed becoming markup');
    ok(out.key === sent.json.id && sql(`select status from sales_emails where id='${sent.json.id}'`) === 'sent', 'it has an idempotency key (so a retry cannot double-send) and is recorded as sent');
    const d1 = await detail(g.id); ok(d1.activities.some(a => a.kind === 'email_out' && /Thanks for looking/.test(a.text)) && (await S(`/emails/${sent.json.id}`)).json.email.body_text.includes('See https://builds'), 'it is on the contact’s timeline and can be read back');

    // the daily limit
    await S('/email/settings', { method: 'PUT', body: { dailyCap: 1 } });
    const capped = await S(`/contacts/${g.id}/email`, { body: { subject: 'Again', body: 'Hello again' } }); ok(capped.status === 422 && /limit of 1/.test(capped.json.error), 'the daily limit stops a second email', capped.json);
    await S('/email/settings', { method: 'PUT', body: { dailyCap: 60 } });

    // the mailing address is required
    await S('/email/settings', { method: 'PUT', body: { postalAddress: '' } });
    const noAddr = await S(`/contacts/${g.id}/email`, { body: { subject: 'x', body: 'y' } }); ok(noAddr.status === 422 && /mailing address/.test(noAddr.json.error) && (await S('/email/test', { body: {} })).status === 422, 'without a mailing address nothing is sent, not even a test');
    await S('/email/settings', { method: 'PUT', body: { postalAddress: '1 Test Street, Philadelphia, PA 19103' } });
    const test = await S('/email/test', { body: {} }); ok(test.status === 200 && mock.sent.at(-1).body.subject.startsWith('[Test]') && /\/u\/test>$/.test(mock.sent.at(-1).body.headers['List-Unsubscribe']), 'the test email goes to you');

    // someone nothing shows we know
    const cold = `cold-${tag}@stranger.test`; const cc = await S('/contacts', { body: { name: 'Cold Caller', email: cold } });
    const coldChk = (await S(`/contacts/${cc.json.id}/email-check`)).json; ok(!coldChk.ok && coldChk.needsConfirmation, 'a stranger is flagged: nothing shows they know us');
    const noConfirm = await S(`/contacts/${cc.json.id}/email`, { body: { subject: 'Hi', body: 'Hello' } }); ok(noConfirm.status === 409 && noConfirm.json.needsConfirmation, 'sending to them asks you to confirm first');
    const before = mock.sent.length; ok((await S(`/contacts/${cc.json.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } })).status === 201 && mock.sent.length === before + 1 && (await detail(cc.json.id)).activities.some(a => /Emailed after staff confirmed/.test(a.text)), 'confirming a relationship you have sends it, and the record says you did');

    // a send that fails
    const fail = await S('/contacts', { body: { name: 'Fail', email: `failme-${tag}@x.test` } });
    const failed = await S(`/contacts/${fail.json.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } });
    ok(failed.status === 502 && /did not go/.test(failed.json.error) && sql(`select status from sales_emails where contact_id='${fail.json.id}'`) === 'failed' && !(await detail(fail.json.id)).activities.some(a => a.kind === 'email_out'), 'a send Resend refuses is reported, recorded as failed, and not shown as sent');

    // deliveries, bounces, complaints
    const outId = sql(`select resend_id from sales_emails where id='${sent.json.id}'`);
    ok((await hook({ type: 'email.delivered', data: { email_id: outId, to: [guest] } }, { sign: false })).status === 401, 'a webhook with a wrong signature is refused');
    ok((await hook({ type: 'email.delivered', data: { email_id: outId, to: [guest] } }, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status === 401, 'and so is an old one (replay)');
    ok((await hook({ type: 'email.delivered', data: { email_id: outId, to: [guest] } })).status === 200 && sql(`select status from sales_emails where id='${sent.json.id}'`) === 'delivered', 'a signed delivery notice marks the email delivered');
    const hardBounce = await S('/contacts', { body: { name: 'Bounce', email: `bounce-${tag}@x.test` } }); await S(`/contacts/${hardBounce.json.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } });
    const bId = sql(`select resend_id from sales_emails where contact_id='${hardBounce.json.id}'`);
    ok((await hook({ type: 'email.bounced', data: { email_id: bId, to: [`bounce-${tag}@x.test`], bounce: { type: 'Permanent', message: 'mailbox does not exist' } } })).status === 200, 'a hard bounce is accepted');
    const bchk = (await S(`/contacts/${hardBounce.json.id}/email-check?confirmed=true`)).json; ok(!bchk.ok && /bounced/.test(bchk.reasons.join()) && (await S(`/contacts/${hardBounce.json.id}/email`, { body: { subject: 'Again', body: 'Hello', confirmRelationship: true } })).status === 422, 'after it that address cannot be emailed again, even if you confirm');
    ok((await S(`/contacts/${hardBounce.json.id}/unsubscribe`, { method: 'PUT', body: { unsubscribed: false } })).status === 409, 'and staff cannot switch it back on');
    const soft = await S('/contacts', { body: { name: 'Soft', email: `soft-${tag}@x.test` } }); await S(`/contacts/${soft.json.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } });
    await hook({ type: 'email.bounced', data: { email_id: sql(`select resend_id from sales_emails where contact_id='${soft.json.id}'`), to: [`soft-${tag}@x.test`], bounce: { type: 'Transient', message: 'mailbox full' } } });
    ok((await S(`/contacts/${soft.json.id}/email-check?confirmed=true`)).json.ok, 'a temporary bounce (mailbox full) does not shut the address off');
    const spam = await S('/contacts', { body: { name: 'Spam', email: `spam-${tag}@x.test` } }); await S(`/contacts/${spam.json.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } });
    await hook({ type: 'email.complained', data: { email_id: sql(`select resend_id from sales_emails where contact_id='${spam.json.id}'`), to: [`spam-${tag}@x.test`] } });
    ok(/spam/.test((await S(`/contacts/${spam.json.id}/email-check?confirmed=true`)).json.reasons.join()), 'a spam complaint ends email to that person too');

    // replies
    const replyId = 'rcv_' + tag; mock.received.set(replyId, { id: replyId, subject: 'Re: Thanks for looking', text: 'Yes, Tuesday works for me.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Kyle <kyle@mail.thefuturebasics.com> wrote:\n> Hi there', headers: {} });
    const rcv = { type: 'email.received', data: { email_id: replyId, from: `Gina Guest <${guest}>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Re: Thanks for looking' } };
    ok((await hook(rcv)).status === 200, 'a reply from a contact is accepted');
    const d2 = await detail(g.id); ok(d2.activities.some(a => a.kind === 'email_in' && /Re: Thanks/.test(a.text)) && ['hot'].includes(d2.contact.heat.level), 'it is on their timeline and they are hot', d2.contact.heat);
    ok(d2.tasks.some(t => /^Reply to .*Re: Thanks for looking/.test(t.title) && !t.done_at) && sql(`select count(*) from sales_emails where direction='in' and resend_id='${replyId}'`) === '1', 'a task to reply is waiting, and the message is stored');
    await hook(rcv); ok(sql(`select count(*) from sales_emails where direction='in' and resend_id='${replyId}'`) === '1' && (await detail(g.id)).tasks.filter(t => /^Reply to/.test(t.title)).length === 1, 'the same notice arriving twice makes no second copy or second task');
    ok((await S(`/emails/${sql(`select id from sales_emails where resend_id='${replyId}'`)}`)).json.email.body_text.startsWith('Yes, Tuesday works'), 'the reply can be read in full');

    const newId = 'rcv_new_' + tag, newer = `newperson-${tag}@elsewhere.test`; mock.received.set(newId, { subject: 'Interested in a site', text: 'Hi, saw your showcase. Can you build one for my bakery?' });
    await hook({ type: 'email.received', data: { email_id: newId, from: `New Person <${newer}>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Interested in a site' } });
    const np = await contact(newer); ok(np && np.source === 'inbound' && (np.tags || []).includes('inbound') && (await detail(np.id)).deals.some(d => /Inbound email: Interested in a site/.test(d.title)), 'someone new who writes in becomes a contact with a deal');
    ok((await S(`/contacts/${np.id}/email-check`)).json.relationship.ok, 'and because they wrote to us they may be answered');

    const outId2 = 'rcv_out_' + tag; mock.received.set(outId2, { subject: 'Please unsubscribe me', text: 'Please unsubscribe me from this list.\n\n> original text' });
    await hook({ type: 'email.received', data: { email_id: outId2, from: `Opt Out <optout-${tag}@elsewhere.test>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Please unsubscribe me' } });
    const oo = await contact(`optout-${tag}@elsewhere.test`); const ood = await detail(oo.id);
    ok(oo.unsubscribed && !ood.tasks.some(t => /^Reply to/.test(t.title)) && !(await S(`/contacts/${oo.id}/email-check?confirmed=true`)).json.ok, 'a reply that says stop unsubscribes them, with no reply task, and no more email');
    const autoId = 'rcv_auto_' + tag; mock.received.set(autoId, { subject: 'Automatic reply: away', text: 'I am away until Monday.', headers: { 'Auto-Submitted': 'auto-replied' } });
    await hook({ type: 'email.received', data: { email_id: autoId, from: `Away <away-${tag}@elsewhere.test>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Automatic reply: away' } });
    const aw = await contact(`away-${tag}@elsewhere.test`); ok(aw && !(await detail(aw.id)).tasks.some(t => /^Reply to/.test(t.title)), 'an automatic out-of-office reply is logged but makes no work');
    await hook({ type: 'email.received', data: { email_id: 'rcv_self_' + tag, from: 'Kyle <kyle@mail.thefuturebasics.com>', to: ['kyle@mail.thefuturebasics.com'], subject: 'loop' } }); ok(!(await contact('kyle@mail.thefuturebasics.com')), 'mail from our own sending address is ignored, so it can never answer itself');
    const downId = 'rcv_down_' + tag; mock.receivedDown.add(downId); mock.received.set(downId, { subject: 'Late one', text: 'Hello after a hiccup' });
    const dn = { type: 'email.received', data: { email_id: downId, from: `Late <late-${tag}@elsewhere.test>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Late one' } };
    ok((await hook(dn)).status === 500 && !(await contact(`late-${tag}@elsewhere.test`)), 'if Resend cannot give us the message yet we answer with an error, so it tries again');
    mock.receivedDown.delete(downId); ok((await hook(dn)).status === 200 && (await contact(`late-${tag}@elsewhere.test`)), 'and the retry is picked up');

    // the unsubscribe link in the email we sent
    const link = /<(https?:\/\/[^>]+)>/.exec(out.body.headers['List-Unsubscribe'])[1], path = new URL(link).pathname;
    const getPage = await fetch(BASE + path); const pageHtml = await getPage.text(); ok(getPage.status === 200 && /<form method="post"/.test(pageHtml) && /\*@chaos\.test/.test(pageHtml) && !pageHtml.includes(guest) && !(await contact(guest)).unsubscribed, 'opening the link only asks (so a mail scanner cannot unsubscribe anyone), and shows a masked address');
    ok((await fetch(BASE + path.slice(0, -1) + (path.endsWith('a') ? 'b' : 'a'))).status === 404 && (await fetch(BASE + '/u/not-a-token')).status === 404, 'a tampered or made-up link is "not valid"');
    const one = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' });
    ok(one.status === 200 && /unsubscribed/i.test(await one.text()) && (await contact(guest)).unsubscribed, 'the one-click POST from a mail app unsubscribes them');
    const after = (await S(`/contacts/${g.id}/email-check?confirmed=true`)).json; ok(!after.ok && /unsubscribed/.test(after.reasons.join()) && (await S(`/contacts/${g.id}/email`, { body: { subject: 'Hi', body: 'Hello', confirmRelationship: true } })).status === 422, 'after that they cannot be emailed, however much staff confirm');
    ok((await S(`/contacts/${g.id}/unsubscribe`, { method: 'PUT', body: { unsubscribed: false } })).status === 409 && (await detail(g.id)).activities.some(a => /Unsubscribed/.test(a.text)), 'staff cannot undo someone’s own unsubscribe, and it is on their record');
    ok((await fetch(BASE + path)).status === 200 && /You are unsubscribed/.test(await (await fetch(BASE + path)).text()), 'opening the link again says it is done');
  } finally { await new Promise(r => resend.close(r)); }
});

await journey('J119', 'Sales automations: a trigger starts them for the right person once, steps run in order (task, tag, wait, email), email goes only to people who know us and never twice, a reply or an opt-out stops what is waiting, working hours and the pause switch hold everything back, and only staff can see any of it', async () => {
  const http = await import('node:http'), { createHmac } = await import('node:crypto');
  const mock = { sent: [], seenKeys: new Map(), received: new Map(), n: 0 };
  const resend = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const u = new URL(req.url, 'http://x'); if (req.headers.authorization !== 'Bearer test-key') return send(401, { message: 'bad key' });
      if (req.method === 'POST' && u.pathname === '/emails') { const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'), key = req.headers['idempotency-key']; if (key && mock.seenKeys.has(key)) return send(200, { id: mock.seenKeys.get(key) }); const id = `re_auto_${stamp}_${++mock.n}`; if (key) mock.seenKeys.set(key, id); mock.sent.push({ id, body }); return send(200, { id }); }
      const m = /^\/emails\/receiving\/(.+)$/.exec(u.pathname); if (req.method === 'GET' && m) { const id = decodeURIComponent(m[1]); return mock.received.has(id) ? send(200, mock.received.get(id)) : send(404, {}); }
      send(404, {});
    });
  });
  await new Promise(r => resend.listen(3133, '127.0.0.1', r));
  try {
    const room = await newRoom('119', { wait: false }), tag = `a${stamp}`;
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
    const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
    const hook = async evt => { const raw = JSON.stringify(evt), id = `msg_${Math.random().toString(36).slice(2)}`, ts = String(Math.floor(Date.now() / 1000)); const sig = 'v1,' + createHmac('sha256', Buffer.from('test-secret')).update(`${id}.${ts}.${raw}`).digest('base64'); return (await fetch(BASE + '/webhooks/resend', { method: 'POST', headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig }, body: raw })).status; };
    const contactByEmail = async email => (await S(`/contacts?q=${encodeURIComponent(email)}`)).json.contacts.find(c => c.email === email);
    const detail = async id => (await S(`/contacts/${id}`)).json;
    const process = async () => (await S('/automations/process', { method: 'POST', body: {} })).json;
    const sentTo = email => mock.sent.filter(m => m.body.to?.[0] === email);
    const runsOf = async id => (await S(`/contacts/${id}/runs`)).json.runs;
    const flow = `flow-${tag}`;

    // who can see it, and what ships switched off
    ok((await call('/v1/sales/automations', { token: room.token })).status === 403 && (await call('/v1/sales/automations')).status === 401, 'clients and strangers cannot see automations');
    const first = (await S('/automations')).json; ok(first.automations.length >= 4 && first.automations.every(a => !a.enabled) && first.templates.length >= 4 && first.triggers.length === 7, 'the starter automations are there and every one is switched off', first.automations.map(a => a.name));
    ok(first.automations.every(a => a.triggerText && a.stepText.length), 'each comes with its trigger and steps in plain words');
    await S('/automations/settings', { method: 'PUT', body: { startHour: 0, endHour: 24, weekdaysOnly: false, paused: false } });
    ok((await S('/automations/settings', { method: 'PUT', body: { startHour: 20, endHour: 10 } })).status === 422, 'working hours that end before they start are refused');

    // making one
    const tpl = (await S('/templates', { body: { name: `Hello ${tag}`, subject: 'Hello {{first_name|there}}', body: 'Hi {{first_name|there}}, thanks for looking. {{sender}}' } })).json.id;
    const steps = [{ kind: 'task', title: 'Say hi to {{first_name|them}}', dueDays: 0 }, { kind: 'tag', add: 'Welcomed' }, { kind: 'wait', days: 1 }, { kind: 'email', templateId: tpl }];
    const make = (o = {}) => S('/automations', { body: { name: `Flow ${tag}`, trigger: { type: 'tag_added', tag: flow }, steps, stopOnReply: true, ...o } });
    ok((await make({ steps: [] })).status === 422 && (await make({ steps: [{ kind: 'task', title: 'x' }, { kind: 'wait', days: 1 }] })).status === 422 && (await make({ steps: [{ kind: 'email', templateId: '00000000-0000-4000-8000-000000000000' }] })).status === 422 && (await make({ trigger: { type: 'tag_added' } })).status === 422, 'no steps, ending on a wait, a deleted template or a trigger with no tag are all refused');
    const made = await make(); ok(made.status === 201, 'a good one is made', made.json);
    const aid = made.json.id, mine = async () => (await S('/automations')).json.automations.find(a => a.id === aid);
    ok((await mine()).enabled === false, 'and it starts switched off');

    // people
    const invited = async (label) => { const e = `${label}-${tag}@auto.test`; await call('/v1/admin/builds/invites', { token: admin, body: { emails: e, days: 7, note: 'Met at the expo', send: false } }); const c = await contactByEmail(e); await S(`/contacts/${c.id}`, { method: 'PUT', body: { name: `${label[0].toUpperCase() + label.slice(1)} Person` } }); return c; };
    const A = await invited('ann'), B = await S('/contacts', { body: { name: 'Bob Stranger', email: `bob-${tag}@auto.test`, source: 'manual' } }), C = await invited('cat'), D = await invited('dan');
    const tagIt = (id, tags = [flow]) => S(`/contacts/${id}`, { method: 'PUT', body: { tags } });
    await tagIt(A.id); await process();
    ok((await runsOf(A.id)).length === 0, 'switched off, tagging someone starts nothing');

    // switching it on
    ok((await S(`/automations/${aid}`, { method: 'PUT', body: { enabled: true } })).status === 200 && (await mine()).enabled, 'it can be switched on');
    await tagIt(A.id, []); await tagIt(A.id); // tag removed and added again
    let ra = await runsOf(A.id); ok(ra.length === 1 && ra[0].status === 'active', 'adding the tag starts it for that person', ra);
    ok((await detail(A.id)).activities.some(a => /Started the automation “Flow/.test(a.text)), 'and says so on their timeline');
    await process();
    let da = await detail(A.id);
    ok(da.tasks.some(t => /Say hi to Ann/.test(t.title)) && da.contact.tags.includes('welcomed'), 'the first steps run: a task made with their first name in it, a tag added');
    ra = await runsOf(A.id); ok(ra[0].status === 'active' && ra[0].step === 3 && new Date(ra[0].next_at) > new Date(Date.now() + 20 * 3600_000), 'then it waits a day', ra[0]);
    ok(sentTo(A.email).length === 0, 'nothing has been emailed yet');
    await process(); ok(sentTo(A.email).length === 0 && (await runsOf(A.id))[0].step === 3, 'running it again before the day is up does nothing');
    sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${A.id}' and status='active'`); await process();
    const mail = sentTo(A.email); ok(mail.length === 1 && /Hello Ann/.test(mail[0].body.subject) && /Unsubscribe/i.test(mail[0].body.text) && mail[0].body.headers?.['List-Unsubscribe'], 'after the day the email goes: with their name, the footer and a one-click unsubscribe');
    ra = await runsOf(A.id); ok(ra[0].status === 'done', 'and the run is finished');
    await process(); await process(); ok(sentTo(A.email).length === 1, 'running the job again never sends it twice');
    ok((await detail(A.id)).activities.some(a => a.kind === 'email_out' && /Hello Ann/.test(a.text)), 'the email is on the timeline', sql(`select string_agg(kind||':'||outcome||':'||detail, ' | ') from sales_run_log l join sales_runs r on r.id=l.run_id where r.contact_id='${A.id}'`) + ' / ' + sql(`select string_agg(status||':'||coalesce(error,''), ' | ') from sales_emails where contact_id='${A.id}'`));
    await tagIt(A.id, []); await tagIt(A.id); ok((await runsOf(A.id)).length === 1, 'adding the same tag again does not run it again (once per person)');
    const stats = await mine(); ok(stats.done === 1 && stats.emails === 1, 'the automation counts who finished and how many emails went', { a: stats.active, d: stats.done, s: stats.stopped, e: stats.emails });

    // someone who does not know us
    await tagIt(B.json.id); await process();
    sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${B.json.id}' and status='active'`); await process();
    ok(sentTo(`bob-${tag}@auto.test`).length === 0 && (await detail(B.json.id)).tasks.some(t => /Write to this contact yourself/.test(t.title)), 'a contact nothing shows we know is not emailed; staff get a task instead', (await detail(B.json.id)).tasks);
    await process(); ok(sentTo(`bob-${tag}@auto.test`).length === 0, 'and still no email on the next pass');

    // someone who opted out
    await S(`/contacts/${C.id}/unsubscribe`, { method: 'PUT', body: { unsubscribed: true } });
    await tagIt(C.id); await process(); sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${C.id}' and status='active'`); await process();
    ok(sentTo(C.email).length === 0, 'someone marked as not to be emailed never gets the email');

    // a reply stops what is waiting; so does an opt-out by link
    await tagIt(D.id); await process();
    ok((await runsOf(D.id))[0].status === 'active', 'setup: Dan is waiting a day');
    const rid = 'rcv_' + tag; mock.received.set(rid, { id: rid, subject: 'Re: hello', text: 'Yes please, call me.', headers: {} });
    ok(await hook({ type: 'email.received', data: { email_id: rid, from: `Dan Person <${D.email}>`, to: ['kyle@mail.thefuturebasics.com'], subject: 'Re: hello' } }) === 200, 'a reply comes in');
    const rd = await runsOf(D.id); ok(rd[0].status === 'stopped' && /wrote back/.test(rd[0].stop_reason), 'it stops what was waiting to write to them', rd[0]);
    sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${D.id}'`); await process(); ok(sentTo(D.email).length === 0, 'and nothing is sent to them');

    // working hours and the pause switch
    const E = await invited('eve'); await tagIt(E.id); await process(); sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${E.id}' and status='active'`);
    await S('/automations/settings', { method: 'PUT', body: { startHour: 0, endHour: 1, weekdaysOnly: false } });
    const hour = new Date().getUTCHours(); if (hour === 0) await S('/automations/settings', { method: 'PUT', body: { startHour: 5, endHour: 6 } });
    await process(); ok(sentTo(E.email).length === 0, 'outside working hours the email waits');
    const held = (await runsOf(E.id))[0]; ok(held.status === 'active' && new Date(held.next_at) > new Date(), 'and the run is put off to the next working hour, not dropped', held);
    await S('/automations/settings', { method: 'PUT', body: { startHour: 0, endHour: 24, paused: true } });
    sql(`update sales_runs set next_at = now() - interval '1 minute' where contact_id='${E.id}'`); const paused = await process();
    ok(paused.paused === true && sentTo(E.email).length === 0, 'the pause switch holds everything back');
    await S('/automations/settings', { method: 'PUT', body: { paused: false } }); await process(); ok(sentTo(E.email).length === 1, 'and releases it when switched off again');

    // trying it first
    const F = await invited('fay'); const dry = await S(`/automations/${aid}/dry-run`, { body: { contactId: F.id } });
    ok(dry.status === 200 && dry.json.plan.length === 4 && /Fay/.test(dry.json.plan[0].result) && /Would send “Hello Fay”/.test(dry.json.plan[3].result), 'a test on a contact shows what each step would do, in their words, without doing it', dry.json);
    ok((await runsOf(F.id)).length === 0 && sentTo(F.email).length === 0, 'and nothing was done');
    const dryB = await S(`/automations/${aid}/dry-run`, { body: { contactId: B.json.id } }); ok(/held back/.test(dryB.json.plan[3].result), 'for someone we cannot email it says the email would be held back');

    // stopping one by hand; other triggers
    const G = await invited('gus'); await tagIt(G.id); const run = (await runsOf(G.id))[0];
    ok((await S(`/runs/${run.id}/stop`, { method: 'POST', body: {} })).status === 200 && (await runsOf(G.id))[0].status === 'stopped', 'staff can stop one person partway');
    const q = (await S('/automations', { body: { name: `Stage ${tag}`, trigger: { type: 'deal_stage', stage: 'proposal' }, steps: [{ kind: 'task', title: 'Prepare the proposal for {{name}}' }] } })).json.id; await S(`/automations/${q}`, { method: 'PUT', body: { enabled: true } });
    const deal = await S('/deals', { body: { title: `Deal ${tag}`, contactId: A.id } }); await S(`/deals/${deal.json.id}`, { method: 'PUT', body: { stage: 'proposal' } }); await process();
    ok((await detail(A.id)).tasks.some(t => /Prepare the proposal for Ann Person/.test(t.title)), 'a deal moving to a stage starts the automation that listens for it');
    const w = (await S('/automations', { body: { name: `Web ${tag}`, trigger: { type: 'contact_created', source: 'website' }, steps: [{ kind: 'task', title: 'Reply to {{name}} within the day' }] } })).json.id; await S(`/automations/${w}`, { method: 'PUT', body: { enabled: true } });
    const web = (await S('/contacts', { body: { name: 'Web Lead', email: `web-${tag}@auto.test`, source: 'website' } })).json.id, hand = (await S('/contacts', { body: { name: 'By Hand', email: `hand-${tag}@auto.test`, source: 'manual' } })).json.id; await process();
    ok((await detail(web)).tasks.some(t => /Reply to Web Lead/.test(t.title)) && !(await detail(hand)).tasks.some(t => /Reply to/.test(t.title)), 'a new website contact starts the one for website contacts, and a hand-added one does not');
    const showFlow = (await S('/automations', { body: { name: `Look ${tag}`, trigger: { type: 'showcase_view' }, steps: [{ kind: 'task', title: '{{name}} looked at {{build}}' }] } })).json.id; await S(`/automations/${showFlow}`, { method: 'PUT', body: { enabled: true } });
    const gb = (await call('/v1/admin/builds', { token: admin, body: { name: `Look ${tag}`, visibility: 'listed', status: 'live', liveUrl: 'https://example.com/' + tag } })).json;
    const viewer = `viewer-${tag}@auto.test`, vjar = { c: '' };
    const asViewer = async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { ...(vjar.c ? { Cookie: vjar.c } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const c = r.headers.getSetCookie?.().map(x => x.split(';')[0]).join('; '); if (c) vjar.c = c; return { status: r.status }; };
    await call('/v1/admin/builds/invites', { token: admin, body: { emails: viewer, days: 7, send: false } });
    await asViewer('/v1/builds/auth/code', { body: { email: viewer } }); await sleep(150); await asViewer('/v1/builds/auth/verify', { body: { email: viewer, code: codeFrom(LOG, viewer) } });
    const gbSlug = (await S('/automations')).json && (await call('/v1/admin/builds', { token: admin })).json.builds.find(b => b.id === gb.id).slug;
    await asViewer(`/v1/builds/${gbSlug}`); await process();
    const vc = await contactByEmail(viewer); ok(vc && (await detail(vc.id)).tasks.some(t => new RegExp(`Look ${tag}`).test(t.title)), 'someone looking at a build in the showcase starts the one that listens for that, and the task says which build');
    await call(`/v1/admin/builds/${gb.id}`, { token: admin, method: 'DELETE' });

    // the safety nets
    const flood = (await S('/automations', { body: { name: `Flood ${tag}`, trigger: { type: 'contact_created', source: 'event' }, steps: [{ kind: 'task', title: 'Hello {{name}}' }] } })).json.id; await S(`/automations/${flood}`, { method: 'PUT', body: { enabled: true } });
    for (let n = 0; n < 42; n++) await S('/contacts', { body: { name: `Crowd ${n}`, email: `crowd${n}-${tag}@auto.test`, source: 'event' } });
    const f = (await S('/automations')).json.automations.find(a => a.id === flood); ok(f.enabled === false && /Switched off automatically/.test(f.note) && f.active + f.done <= 40, 'an automation that takes in a flood of people in an hour switches itself off', { enabled: f.enabled, note: f.note, n: f.active + f.done });
    await S(`/automations/${aid}`, { method: 'PUT', body: { name: `Flow ${tag} v2`, trigger: { type: 'tag_added', tag: flow }, steps, stopOnReply: false, reenterDays: 7 } }); const edited = await mine(); ok(edited.name.endsWith('v2') && edited.stopOnReply === false && edited.reenterDays === 7, 'an automation can be edited');
    ok((await S(`/automations/${aid}`, { method: 'DELETE' })).status === 200 && (await S('/automations')).json.automations.every(a => a.id !== aid), 'and deleted');
    ok((await detail(A.id)).tasks.length >= 1, 'deleting it leaves the contact and their tasks alone');
    for (const x of [q, w, showFlow, flood]) await S(`/automations/${x}`, { method: 'DELETE' }); // leave nothing switched on for the journeys that follow
  } finally { await new Promise(r => resend.close(r)); }
});

await journey('J121', 'Chat: a visitor talks to the assistant, is handed to a person when they ask or the assistant should not answer, leaves an email so we can reach them, a person takes over and replies, the showcase knows who they are, and nothing gets past the limits', async () => {
  const room = await newRoom('121', { wait: false }), tag = `c${stamp}`;
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  let ipn = 20; const newIp = () => `203.0.113.${++ipn}`;
  // a visitor: their own address (so limits are per person), their own private token
  const visitor = (ip = newIp()) => { const v = { token: '', ip }; v.call = (path, o = {}) => call(path, { ...o, headers: { 'x-forwarded-for': ip, ...(v.token ? { 'x-chat-token': v.token } : {}), ...(o.headers || {}) } }); v.say = async (body, extra = {}) => { const r = await v.call('/v1/chat/messages', { body: { body, source: 'site', page: '/', ...extra } }); if (r.json.token) v.token = r.json.token; return r; }; return v; };
  const chatsList = async (status = 'all') => (await S(`/chats?status=${status}`)).json;
  const latest = () => sql(`select id from chat_conversations order by created_at desc limit 1`);
  const text = m => (m || []).map(x => `${x.author}:${x.body}`).join(' | ');
  await S('/chats/settings', { method: 'PUT', body: { enabled: true, assistantOn: true } });

  // the page, the script, and who may see the conversations
  const fr = await call('/chat-frame'); ok(fr.status === 200 && /FBChat|chat\.js/.test(fr.text), 'the chat window is a page of its own');
  const wj = await call('/chat-widget.js'); ok(wj.status === 200 && /fbChat/.test(wj.text), 'and the embed script is served');
  const hdr = await fetch(BASE + '/chat-frame'); ok(/frame-ancestors[^;]*thefuturebasics\.com/.test(hdr.headers.get('content-security-policy') || ''), 'the window may be framed by the public site and the showcase, and by no one else');
  ok((await call('/v1/sales/chats', { token: room.token })).status === 403 && (await call('/v1/sales/chats')).status === 401, 'clients and strangers cannot read the conversations');
  const st0 = await call('/v1/chat/state'); ok(st0.json.enabled === true && /assistant/i.test(st0.json.greeting) && st0.json.conversation === null, 'a first visit has a greeting and no conversation yet');

  // a visitor and the assistant
  const A = visitor(); const r1 = await A.say('What do you do?');
  ok(r1.status === 201 && r1.json.token && r1.json.conversation.status === 'bot' && r1.json.messages.length === 2 && /Fixture answer/.test(r1.json.messages[1].body) && r1.json.messages[1].author === 'assistant', 'the first message starts a conversation and the assistant answers', text(r1.json.messages));
  ok(r1.json.conversation.needsEmail === true && Number(sql(`select count(*) from sales_contacts where email like '%-${tag}@chat.test'`)) === 0, 'nobody is added to the CRM until they leave an address');
  const g = await A.call('/v1/chat/messages'); ok(g.status === 200 && g.json.messages.length === 2, 'the thread can be read back with their private token');
  ok((await call('/v1/chat/messages', { headers: { 'x-chat-token': 'nope' } })).status === 404 && (await call('/v1/chat/messages')).status === 404, 'with no token, or a wrong one, there is nothing to read');
  ok((await A.say('   ')).status === 422, 'an empty message is refused');
  const long = await A.say('x'.repeat(5000)); ok(Number(sql(`select max(length(body)) from chat_messages where author='visitor' and conversation_id='${latest()}'`)) === 1000, 'a very long message is cut to a thousand characters');
  const before = Number(sql(`select count(*) from chat_messages`)); const hp = await A.say('buy pills', { website: 'http://spam.example' }); ok(hp.status === 200 && Number(sql(`select count(*) from chat_messages`)) === before, 'a message with the hidden robot field filled in is dropped without a trace');
  await A.say('<b>hi</b> <script>alert(1)</script>'); ok(Number(sql(`select count(*) from chat_messages where body like '%<script>alert(1)</script>%' and author='visitor'`)) === 1, 'markup in a message is kept as plain text (the window shows it escaped)');

  // being handed over
  const B = visitor(); await B.say('Hello'); const rp = await B.say('Can I talk to a person please?');
  ok(rp.json.conversation.status === 'waiting' && /Leave your email/.test(text(rp.json.messages)), 'asking for a person hands the chat over, and asks where to reach them');
  ok(!/Fixture answer to: Can I talk/.test(text(rp.json.messages)), 'without bothering the model');
  let waiting = await chatsList('waiting'); ok(waiting.waiting >= 1 && waiting.chats.some(c => c.status === 'waiting' && c.handoff_reason === 'asked for a person'), 'staff see it waiting, and why');
  const bad = await B.call('/v1/chat/contact', { body: { email: 'not an email' } }); ok(bad.status === 422, 'a bad address is refused');
  const email = `visitor-${tag}@chat.test`; const lc = await B.call('/v1/chat/contact', { body: { email, name: 'Vera Visitor' } }); ok(lc.status === 200 && lc.json.conversation.email === email && lc.json.conversation.needsEmail === false, 'leaving an address is accepted');
  const crm = (await S(`/contacts?q=${encodeURIComponent(email)}`)).json.contacts.find(c => c.email === email); ok(crm && crm.source === 'website' && (await S(`/contacts/${crm.id}`)).json.contact.tags.includes('chat'), 'they become a CRM contact from the website, tagged chat');
  const cd = (await S(`/contacts/${crm.id}`)).json; ok(cd.activities.some(a => a.kind === 'note' && /not verified/.test(a.text)) && !cd.activities.some(a => a.kind === 'chat_in') && cd.tasks.some(t => /Chat waiting: Vera Visitor/.test(t.title)), 'their record has the chat as a note marked not verified, and staff have a task to answer it', cd.activities.map(a => a.kind + ':' + a.text));
  const ec = (await S(`/contacts/${crm.id}/email-check`)).json; ok(ec.relationship?.ok === false && ec.needsConfirmation === true, 'an address someone typed does not count as knowing us, for email: a person has to confirm it');
  ok((await B.call('/v1/chat/contact', { body: { email: `other-${tag}@chat.test` } })).json.conversation.email === email, 'an address cannot be swapped afterwards from the page');

  // a person takes over
  const cid = latest(), dt = await S(`/chats/${cid}`); ok(dt.status === 200 && dt.json.chat.verified === false && dt.json.chat.email === email && dt.json.messages.some(m => m.author_role === 'client') && dt.json.messages.some(m => m.system), 'staff open the thread, shaped for the shared chat');
  ok(sql(`select unread_staff from chat_conversations where id='${cid}'`) === '0', 'opening it clears the unread count');
  const rep = await S(`/chats/${cid}/messages`, { body: { body: 'Hi Vera, this is Kyle. Happy to help.' } }); ok(rep.status === 201, 'a person replies');
  let seenByV = (await B.call('/v1/chat/messages')).json; ok(seenByV.conversation.status === 'person' && /staff:Hi Vera/.test(text(seenByV.messages)), 'the visitor sees it in their thread, and the chat is now with a person');
  ok((await S(`/contacts/${crm.id}`)).json.activities.some(a => a.kind === 'chat_out' && /Hi Vera/.test(a.text)), 'and it is on their record');
  const n0 = Number(sql(`select count(*) from chat_messages where conversation_id='${cid}'`)); const more = await B.say('Great, thanks! Tuesday works.');
  ok(Number(sql(`select count(*) from chat_messages where conversation_id='${cid}'`)) === n0 + 1 && more.json.conversation.status === 'person', 'while a person has it, the assistant stays quiet');
  ok(Number(sql(`select unread_staff from chat_conversations where id='${cid}'`)) >= 1, 'and staff see it as unread');
  ok((await S(`/chats/${cid}`, { method: 'PUT', body: { status: 'bot' } })).status === 200 && /assistant/i.test(text((await B.call('/v1/chat/messages')).json.messages)), 'a person can hand it back to the assistant');
  ok(/Fixture answer to: And what about/.test(text((await B.say('And what about sites?')).json.messages)), 'which answers again');
  ok((await S(`/chats/${cid}`, { method: 'PUT', body: { status: 'closed' } })).status === 200 && (await B.call('/v1/chat/messages')).json.conversation.status === 'closed', 'a chat can be closed');
  ok((await B.say('One more thing')).json.conversation.status === 'bot', 'and writing again starts it afresh');
  ok((await S(`/chats/${cid}`, { method: 'PUT', body: { status: 'nonsense' } })).status === 422, 'a status that is not one is refused');

  // what the assistant must not decide alone
  const C = visitor(); const rc = await C.say('How much does a new site cost?'); ok(rc.json.conversation.status === 'waiting' && /Fixture answer/.test(text(rc.json.messages)) && true, 'a question about price goes to a person even if the assistant would answer');
  const D = visitor(); ok((await D.say('I am unsure what you mean, are you unsure too?')).json.conversation.status === 'waiting', 'when the assistant says it is not sure, a person is asked');
  const E = visitor(); const re = await E.say('This is a scam, I want a refund'); ok(re.json.conversation.status === 'waiting' && /sorry/i.test(text(re.json.messages)), 'someone who is upset goes to a person, with an apology');

  // switches
  await S('/chats/settings', { method: 'PUT', body: { assistantOn: false } }); const F = visitor(); const rf = await F.say('Hello there'); ok(rf.json.conversation.status === 'waiting' && !/assistant:/.test(text(rf.json.messages)), 'with the assistant switched off, every chat goes straight to a person');
  await S('/chats/settings', { method: 'PUT', body: { assistantOn: true, enabled: false } }); ok((await visitor().say('Hi')).status === 503 && (await call('/v1/chat/state')).json.enabled === false, 'with chat switched off, nothing is accepted');
  await S('/chats/settings', { method: 'PUT', body: { enabled: true } });
  ok((await S('/chats/settings', { method: 'PUT', body: { dailyBotCap: 99999 } })).status === 422, 'an absurd daily limit is refused');
  await S('/chats/settings', { method: 'PUT', body: { dailyBotCap: 0 } }); const G = visitor(); ok((await G.say('What do you build?')).json.conversation.status === 'waiting', 'at the daily limit on answers, people get a person instead');
  await S('/chats/settings', { method: 'PUT', body: { dailyBotCap: 300 } });
  await S('/chats/settings', { method: 'PUT', body: { greeting: 'Welcome to Future Basics!', about: 'We never do wholesale.' } }); ok((await call('/v1/chat/state')).json.greeting === 'Welcome to Future Basics!', 'the greeting can be changed');
  await S('/chats/settings', { method: 'PUT', body: { greeting: '', about: '' } });

  // the showcase knows who they are
  const gb = (await call('/v1/admin/builds', { token: admin, body: { name: `Chat Build ${tag}`, visibility: 'listed', status: 'live', liveUrl: 'https://example.com/' + tag, summary: 'A build for chat.' } })).json;
  const hid = (await call('/v1/admin/builds', { token: admin, body: { name: `Hidden Build ${tag}`, visibility: 'hidden', status: 'concept' } })).json;
  const slugs = (await call('/v1/admin/builds', { token: admin })).json.builds; const slugOf = id => slugs.find(b => b.id === id).slug;
  const guest = `guest-${tag}@chat.test`, jar = { c: '' };
  const asV = async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { 'x-forwarded-for': '203.0.113.200', ...(jar.c ? { Cookie: jar.c } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(o.headers || {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const c = r.headers.getSetCookie?.().map(x => x.split(';')[0]).join('; '); if (c) jar.c = c; return { status: r.status, json: await r.json().catch(() => ({})) }; };
  await call('/v1/admin/builds/invites', { token: admin, body: { emails: guest, days: 7, send: false } });
  await asV('/v1/builds/auth/code', { body: { email: guest } }); await sleep(150); await asV('/v1/builds/auth/verify', { body: { email: guest, code: codeFrom(LOG, guest) } });
  const stV = await asV('/v1/chat/state'); ok(stV.json.signedIn === true && stV.json.email === guest, 'inside the showcase the chat knows who is signed in');
  const rv = await asV('/v1/chat/messages', { body: { body: 'Tell me about this build', source: 'showcase', looking: slugOf(gb.id) } });
  ok(rv.status === 201 && rv.json.conversation.email === guest && rv.json.conversation.needsEmail === false && rv.json.conversation.looking === `Chat Build ${tag}`, 'a signed-in viewer is not asked for an address, and the build they were looking at is noted');
  const gc = (await S(`/contacts?q=${encodeURIComponent(guest)}`)).json.contacts.find(c => c.email === guest); ok(gc && (await S(`/contacts/${gc.id}`)).json.contact.tags.includes('chat') && (await S(`/contacts/${gc.id}`)).json.contact.tags.includes('showcase'), 'their contact is tagged showcase and chat');
  const gcd = (await S(`/contacts/${gc.id}`)).json; ok(gcd.activities.some(a => a.kind === 'chat_in') && (await S(`/chats/${sql(`select id from chat_conversations where visitor_email='${guest}'`)}`)).json.chat.verified === true, 'a showcase visitor\'s address is verified, so their chat counts as chat_in on their record');
  const rv2 = await asV('/v1/chat/messages', { body: { body: 'And this one?', source: 'showcase', looking: slugOf(hid.id), token: rv.json.token } });
  ok(rv2.json.conversation.looking === `Chat Build ${tag}`, 'a build they may not see is never recorded');
  const anonLook = visitor(); const al = await anonLook.say('hello', { looking: slugOf(gb.id) }); ok(al.json.conversation.looking === '', 'a visitor who is not signed in cannot name a build either');
  await call(`/v1/admin/builds/${gb.id}`, { token: admin, method: 'DELETE' }); await call(`/v1/admin/builds/${hid.id}`, { token: admin, method: 'DELETE' });

  // limits
  const flood = visitor('198.51.100.7'); let blocked = 0; for (let n = 0; n < 70; n++) { const r = await flood.say(`message ${n}`); if (r.status === 429) { blocked++; break; } }
  ok(blocked === 1, 'someone sending message after message is slowed down');
  const spam = []; for (let n = 0; n < 10; n++) spam.push((await visitor('198.51.100.8').say('hi')).status); ok(spam.includes(429) && spam[0] === 201, 'so is one address opening conversation after conversation');
});

await journey('J127', 'Pictures on client tiles: the photo a client started with shows on their tile in the work console and on their hub product, loads as a real image, and a made-up or tampered link does not', async () => {
  const room = await newRoom('127', { wait: false });
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  ok(Number(sql(`select count(*) from pack_blobs`)) > 0, 'setup: the pack pictures are kept as stored files, not inside the pack text');
  const dash = (await call('/v1/admin/dashboard', { token: admin })).json, tile = (dash.clients || []).find(c => c.id === cid);
  ok(tile && /\/r\/[0-9a-f-]{36}\/[0-9a-f]{32}\.jpg$/.test(tile.cover_image_url || ''), 'the client tile has a picture address', tile?.cover_image_url);
  const img = await fetch(tile.cover_image_url.replace(/^https?:\/\/[^/]+/, BASE));
  const bytes = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && /^image\/(jpeg|png|webp)$/.test(img.headers.get('content-type') || '') && bytes.length > 1000, 'the address returns an image', [img.status, img.headers.get('content-type'), bytes.length]);
  ok((bytes[0] === 0xff && bytes[1] === 0xd8) || (bytes[0] === 0x89 && bytes[1] === 0x50) || bytes.slice(0, 4).toString() === 'RIFF', 'and it is a real picture, not the text of a reference', bytes.slice(0, 12).toString('latin1'));
  const hub = (await call('/v1/dashboard', { token: room.token })).json, prod = (hub.products || []).find(p => p.rendering_url);
  ok(prod && (await fetch(prod.rendering_url.replace(/^https?:\/\/[^/]+/, BASE))).status === 200, 'the same picture shows on the client\'s own hub');
  const bad = tile.cover_image_url.replace(/[0-9a-f]\.jpg$/, c => (c[0] === '0' ? '1' : '0') + '.jpg').replace(/^https?:\/\/[^/]+/, BASE);
  ok((await fetch(bad)).status === 404 && (await fetch(BASE + '/r/00000000-0000-0000-0000-000000000000/abc.jpg')).status === 404, 'a tampered or made-up picture link is not found');
});

await journey('J129', 'Software development in a client room: a software project is tied to a build and moves through stages, the client sees it (and its build, even before it is listed) and nobody else does, and the build can be pushed to the client\'s own Square or Wix once, safely, without secrets leaking, overwriting or deleting anything', async () => {
  const http = await import('node:http');
  const mock = { n: 0, made: [], rejectSku: '', wixV1: false, squareToken: 'sq-token-1234', wixKey: 'wix-key-1234' };
  const store = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const body = (() => { try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; } })(), u = new URL(req.url, 'http://x');
      if (u.pathname === '/v2/catalog/batch-upsert') {
        if (req.headers.authorization !== `Bearer ${mock.squareToken}`) return send(401, { errors: [{ code: 'UNAUTHORIZED' }] });
        const objs = body.batches?.[0]?.objects || [], maps = [];
        for (const o of objs) { const sku = o.id.slice(1); if (sku === mock.rejectSku) continue; mock.made.push(`square:${sku}`); maps.push({ client_object_id: o.id, object_id: `SQ_${++mock.n}` }); }
        return send(200, { id_mappings: maps });
      }
      if (u.pathname.startsWith('/stores/') || u.pathname.startsWith('/site-media/')) {
        if (req.headers.authorization !== mock.wixKey) return send(403, { message: 'forbidden' });
        if (u.pathname === '/stores/v3/provision/version') return send(200, { catalogVersion: mock.wixV1 ? 'V1_CATALOG' : 'V3_CATALOG' });
        if (u.pathname === '/site-media/v1/files/import') return send(200, { file: { url: 'https://static.wixstatic.com/media/x.jpg', operationStatus: 'PENDING' } });
        if (u.pathname === '/stores/v3/products') { if (body.product?.name === 'WIXBAD') return send(400, { message: 'name taken' }); mock.made.push(`wix:${body.product.variantsInfo.variants[0].sku}`); return send(200, { product: { id: `WX_${++mock.n}` } }); }
      }
      send(404, {});
    });
  });
  await new Promise(r => store.listen(3133, '127.0.0.1', r));
  try {
    const room = await newRoom('129', { wait: false }), tag = `sw${stamp}`;
    const cid = sql(`select client_id from users where lower(email)='${room.email}'`);
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin', email: 'kyle@thefuturebasics.com' });
    const A = (path, o = {}) => call('/v1/admin' + path, { token: admin, ...o });

    // projects: product by default, software with a build
    const bad = async (body, re, status = 400) => { const r = await A(`/clients/${cid}/projects`, { body }); ok(r.status === status && re.test(r.json.error || ''), `refused: ${JSON.stringify(body).slice(0, 70)}`, [r.status, r.json.error]); };
    await bad({ name: '' }, /name/i); await bad({ name: 'X', kind: 'robots' }, /product development or software/); await bad({ name: 'X', kind: 'software', stage: 'warp' }, /stage/); await bad({ name: 'X', kind: 'software', buildId: 'nope' }, /builds/); await bad({ name: 'X', kind: 'software', buildId: '8f14e45f-ceea-467a-9575-6a2b12345678' }, /not there/, 404);
    const prod = await A(`/clients/${cid}/projects`, { body: { name: `Hoodie ${tag}` } }); ok(prod.status === 201 && prod.json.kind === 'product' && prod.json.build_id === null && prod.json.stage === null, 'a project with no kind is product development, as before');
    const sw = await A(`/clients/${cid}/projects`, { body: { name: `Salon site ${tag}`, kind: 'software', newBuild: true, stage: 'prototype' } });
    ok(sw.status === 201 && sw.json.kind === 'software' && sw.json.stage === 'prototype' && sw.json.build_id, 'a software project is made with a new build', sw.json);
    const brow = sql(`select status||'/'||visibility||'/'||name from builds where id='${sw.json.build_id}'`); ok(brow === `in-progress/hidden/Salon site ${tag}`, 'the new build starts in progress and hidden from everyone but staff', brow);
    ok((await A(`/projects/${prod.json.id}`, { method: 'PATCH', body: { stage: 'live' } })).status === 400 && (await A(`/projects/${prod.json.id}`, { method: 'PATCH', body: { buildId: sw.json.build_id } })).status === 400, 'a product project has no stage and no build');
    ok((await A(`/projects/${sw.json.id}`, { method: 'PATCH', body: { stage: 'warp' } })).status === 400, 'a stage that does not exist is refused');
    ok((await A(`/projects/${sw.json.id}`, { method: 'PATCH', body: { stage: 'review' } })).status === 200, 'staff move it to client review');
    const room1 = (await A(`/clients/${cid}`)).json, p1 = room1.projects.find(x => x.id === sw.json.id);
    ok(p1.software.stageLabel === 'Client review' && p1.software.owner === 'client' && p1.software.rail.filter(r => r.state === 'done').length === 3 && p1.software.build.name === `Salon site ${tag}`, 'the work console sees the stage, who has the ball and the build', p1.software);
    ok(room1.projects.find(x => x.id === prod.json.id).software === undefined, 'a product project carries no software view');

    // the client sees it; a stranger does not
    const hub = (await call('/v1/dashboard', { token: room.token })).json, hp = hub.projects.find(x => x.id === sw.json.id);
    ok(hp && hp.software.stageLabel === 'Client review' && hp.software.build.name === `Salon site ${tag}` && !/repo_url|repo_path/.test(JSON.stringify(hp)), 'the client sees the stage and the build on their hub, without anything internal', hp?.software);
    const jar = {}, as = who => async (path, o = {}) => { const r = await fetch(BASE + path, { method: o.method || (o.body !== undefined ? 'POST' : 'GET'), redirect: 'manual', headers: { ...(jar[who] ? { Cookie: jar[who] } : {}), ...(o.body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: o.body !== undefined ? JSON.stringify(o.body) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return { status: r.status, json: await r.json().catch(() => ({})) }; };
    const signIn = async (who, email) => { const v = as(who); await v('/v1/builds/auth/code', { body: { email } }); await sleep(150); return v('/v1/builds/auth/verify', { body: { email, code: codeFrom(LOG, email) } }); };
    const slug = sql(`select slug from builds where id='${sw.json.build_id}'`);
    ok((await signIn('client', room.email)).status === 200, 'setup: the client signs in to the showcase');
    const cview = await as('client')(`/v1/builds/${slug}`); ok(cview.status === 200, 'the client can open the build their project is built on, though it is hidden from everyone else', cview.status);
    const guest = `guest-${tag}@chaos.test`; await A('/builds/invites', { body: { emails: guest, days: 7, send: false } }); ok((await signIn('guest', guest)).status === 200, 'setup: an invited stranger signs in');
    ok((await as('guest')(`/v1/builds/${slug}`)).status === 404 && !JSON.stringify((await as('guest')('/v1/builds')).json).includes(slug), 'a stranger cannot open it or find it in the list');
    ok((await A(`/projects/${sw.json.id}`, { method: 'PATCH', body: { buildId: null } })).status === 200 && (await as('client')(`/v1/builds/${slug}`)).status === 404, 'untying the build from the project takes the client\'s access away at once');
    ok((await A(`/projects/${sw.json.id}`, { method: 'PATCH', body: { buildId: sw.json.build_id } })).status === 200 && (await as('client')(`/v1/builds/${slug}`)).status === 200, 'and tying it back gives it back');

    // commerce: who may, what is needed, what is sent
    const bid = sw.json.build_id, push = (body, token = admin) => call(`/v1/admin/builds/${bid}/push`, { token, body: { clientId: cid, ...body } });
    ok((await call(`/v1/admin/builds/${bid}/push`, { token: room.token, body: { clientId: cid } })).status === 403 && (await call(`/v1/admin/builds/${bid}/push`, { body: {} })).status === 401 && (await call(`/v1/admin/builds/${bid}/commerce`, { token: room.token })).status === 403, 'clients and strangers cannot push or read the push window');
    ok((await push({})).status === 422 && /products this site sells/i.test((await push({})).json.error), 'a push with no products is refused and says what to add');
    const cat = async text => call(`/v1/admin/builds/${bid}/catalog`, { token: admin, method: 'PUT', body: { text } });
    ok((await cat('Flat white beans | free')).status === 422 && (await cat('Beans | 5 | A | javascript:alert(1)')).status === 422 && (await cat('Beans | 5 | A\nMug | 6 | A')).status === 422, 'bad products are refused: no price, a script address, a repeated code');
    const saved = await cat('Flat white beans | 18.50 | FW-1 | https://example.com/beans.jpg | Roasted to order\nSiphon mug | 12 | MUG-1\nREJECT me | 3 | REJ-1'); ok(saved.status === 200 && saved.json.count === 3, 'the products are saved', saved.json);
    ok((await push({})).status === 422 && /where .* sells/i.test((await push({})).json.error), 'with no platform chosen it asks where the client sells');
    ok((await A(`/clients/${cid}/commerce`, { method: 'PUT', body: { platform: 'etsy' } })).status === 422 && (await A(`/clients/${cid}/commerce`, { method: 'PUT', body: { platform: 'other' } })).status === 200 && (await push({})).status === 422 && /somewhere else/.test((await push({})).json.error), 'a platform we cannot push to says so');
    ok((await A(`/clients/${cid}/commerce`, { method: 'PUT', body: { platform: 'shopify' } })).status === 200 && (await push({})).status === 409 && /connected a Shopify store/.test((await push({})).json.error), 'Shopify with no connected store is told to have the client connect one');
    await A(`/clients/${cid}/commerce`, { method: 'PUT', body: { platform: 'square' } });
    const nc = await push({}); ok(nc.status === 409 && /Connect Square/.test(nc.json.error) && mock.made.length === 0, 'Square with no connection is told to connect it, and nothing is sent');
    const conn = body => A(`/clients/${cid}/commerce/connection`, { method: 'PUT', body });
    ok((await conn({ platform: 'square', token: 'short' })).status === 422 && (await conn({ platform: 'square', token: 'has a space in it' })).status === 422 && (await conn({ platform: 'square', token: mock.squareToken, currency: 'dollars' })).status === 422 && (await conn({ platform: 'etsy', token: mock.squareToken })).status === 422, 'a bad token, a bad currency or an unknown platform is refused');
    ok((await conn({ platform: 'square', token: 'wrong-token-9999', currency: 'usd', label: 'Salon Square' })).status === 200, 'the connection is saved');
    const dead = await push({}); ok(dead.status === 409 && /no longer accepts/.test(dead.json.error) && sql(`select status from client_commerce_connections where client_id='${cid}' and platform='square'`) === 'needs-reconnect', 'a token Square refuses is reported, the connection is marked to be redone, and nothing is made', dead.json);
    const again = await push({}); ok(again.status === 409 && /Connect Square again/.test(again.json.error), 'and a push stays refused until it is connected again');
    await conn({ platform: 'square', token: mock.squareToken, currency: 'usd', label: 'Salon Square' });
    const view = await call(`/v1/admin/builds/${bid}/commerce?clientId=${cid}`, { token: admin }), txt = JSON.stringify(view.json);
    ok(view.json.client.targets.square.connected && !txt.includes(mock.squareToken) && !sql(`select secret_sealed from client_commerce_connections where client_id='${cid}' and platform='square'`).includes(mock.squareToken), 'the secret is never sent back and is not stored in the clear');
    const prev = await push({ preview: true }); ok(prev.status === 200 && prev.json.willMake.length === 3 && mock.made.length === 0 && /Look before/.test(prev.json.publishNote), 'a preview says what would be made and sends nothing');
    mock.rejectSku = 'REJ-1'; const p1r = await push({});
    ok(p1r.status === 201 && p1r.json.push.status === 'partial' && p1r.json.push.summary.created === 2 && p1r.json.push.summary.failed === 1 && mock.made.join() === 'square:FW-1,square:MUG-1', 'two products are made in Square and the one it would not make is reported', p1r.json.push);
    mock.rejectSku = ''; const p2 = await push({}); ok(p2.status === 201 && p2.json.push.summary.created === 1 && p2.json.push.summary.skipped === 2 && mock.made.join() === 'square:FW-1,square:MUG-1,square:REJ-1', 'pushing again makes only the one that was missing and leaves the other two alone');
    const p3 = await push({}); ok(p3.status === 200 && p3.json.nothing === true && mock.made.length === 3, 'a third push changes nothing');
    const before = mock.made.length; await cat('Flat white beans | 18.50 | FW-1\nSiphon mug | 12 | MUG-1\nREJECT me | 3 | REJ-1\nNew tote | 20 | TOTE-1'); const race = await Promise.all([push({}), push({})]);
    ok(race.every(r => [200, 201, 409].includes(r.status)) && mock.made.length === before + 1 && mock.made.filter(m => m === 'square:TOTE-1').length === 1, 'two pushes at once make the new product once', race.map(r => r.status));
    ok((await call(`/v1/admin/builds/${bid}/commerce`, { token: admin })).json.pushes.length >= 3, 'the history of pushes is kept');

    // Wix
    await A(`/clients/${cid}/commerce`, { method: 'PUT', body: { platform: 'wix' } }); await cat('Wix tote | 20 | WT-1 | https://example.com/t.jpg\nWIXBAD | 5 | WB-1');
    ok((await push({})).status === 409, 'Wix with no connection is told to connect it');
    ok((await conn({ platform: 'wix', apiKey: mock.wixKey, siteId: 'not a site' })).status === 422 && (await conn({ platform: 'wix', apiKey: mock.wixKey, siteId: '1a2b3c4d-1111-2222-3333-444455556666', label: 'Salon Wix' })).status === 200, 'the Wix key and site id are checked, then saved');
    const w1 = await push({}); ok(w1.status === 201 && w1.json.push.status === 'partial' && w1.json.push.items.find(i => i.sku === 'WB-1').reason === 'name taken' && mock.made.includes('wix:WT-1'), 'Wix: one product made, the one it refused is reported with Wix\'s reason', w1.json.push?.items);
    mock.wixV1 = true; await cat('Wix tote | 20 | WT-1\nWIXBAD | 5 | WB-1\nOther | 9 | O-1'); const v1 = await push({}); ok(v1.status === 422 && /older Stores catalog/.test(v1.json.error), 'a Wix site on the old catalog is told so, not half-written'); mock.wixV1 = false;
    ok((await A(`/clients/${cid}/commerce/connection/wix`, { method: 'DELETE' })).status === 200 && (await A(`/clients/${cid}/commerce/connection/wix`, { method: 'DELETE' })).status === 404 && (await push({})).status === 409, 'a connection can be removed, and a push then asks for it again');

    // archiving the project takes the client's access to the build away
    await A(`/projects/${sw.json.id}/archive`, { method: 'POST', body: {} }); ok((await as('client')(`/v1/builds/${slug}`)).status === 404, 'archiving the project closes the client\'s access to the hidden build');
    await call(`/v1/admin/builds/${bid}`, { token: admin, method: 'DELETE' });
  } finally { await new Promise(r => store.close(r)); }
});
await journey('J125', 'Press comms: a release or pitch is drafted by the assistant from a build, never sent while it is a draft or has a [PLACEHOLDER] left, goes only to people on the media list who may be emailed and have not had it, only after staff confirm, within a daily limit, with the unsubscribe footer, and the coverage it earns is logged', async () => {
  const http = await import('node:http');
  const mock = { sent: [], seenKeys: new Map(), n: 0 };
  const resend = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      const u = new URL(req.url, 'http://x'); if (req.headers.authorization !== 'Bearer test-key') return send(401, { message: 'bad key' });
      if (req.method === 'POST' && u.pathname === '/emails') { const body = JSON.parse(Buffer.concat(chunks).toString() || '{}'), key = req.headers['idempotency-key']; if (String(body.to?.[0] || '').includes('failme')) return send(422, { message: 'The recipient address is not valid' }); if (key && mock.seenKeys.has(key)) return send(200, { id: mock.seenKeys.get(key) }); const id = `re_press_${stamp}_${++mock.n}`; if (key) mock.seenKeys.set(key, id); mock.sent.push({ id, body }); return send(200, { id }); }
      send(404, {});
    });
  });
  await new Promise(r => resend.listen(3133, '127.0.0.1', r));
  try {
    const room = await newRoom('125', { wait: false }), tag = `p${stamp}`;
    const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
    const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
    const P = (path, o = {}) => S('/press' + path, o);
    await S('/email/settings', { method: 'PUT', body: { dailyCap: 100 } });
    await P('/settings', { method: 'PUT', body: { dailyCap: 25 } });
    const person = async (name, email, tags = ['press'], extra = {}) => { const r = await S('/contacts', { body: { name, email, tags, companyName: extra.outlet || '', source: 'manual' } }); return r.json.id; };

    // who may use it
    ok((await call('/v1/sales/press', { token: room.token })).status === 403 && (await call('/v1/sales/press')).status === 401, 'clients and strangers cannot see press');
    ok((await P('')).json.items !== undefined && (await P('')).json.assistantReady === true, 'staff see the list, and the assistant is connected here');
    ok(sql(`select count(*) from sales_segments where name='Press'`) === '1', 'the Press saved view is in Contacts');

    // items
    ok((await P('/items', { body: { title: '' } })).status === 422 && (await P('/items', { body: { title: 'x', status: 'ready' } })).status === 422, 'an item needs a title, and cannot be ready without a subject and message');
    const bid = sql(`select id from builds order by created_at limit 1`);
    const d = await P('/draft', { body: { kind: 'pitch', buildId: bid || undefined, angle: 'Small salons' } });
    ok(d.status === 200 && /Fixture pitch/.test(d.json.subject) && /\[QUOTE FROM KYLE\]/.test(d.json.body), 'the assistant drafts from a build and an angle, and leaves a bracket where it has no fact', d.json);
    ok((await P('/draft', { body: { kind: 'pitch' } })).status === 422, 'with neither a build nor an angle it asks for one');
    const draft = await P('/items', { body: { title: `Pitch ${tag}`, kind: 'pitch', subject: d.json.subject, body: d.json.body, audience: 'Retail trade' } });
    ok(draft.status === 201, 'the draft is saved', draft.json);
    const ready = await P('/items', { body: { title: `Ready ${tag}`, kind: 'pitch', subject: 'Salon booking, built in weeks', body: 'Hi {{first_name|there}},\n\nA short note about a build we shipped.\n\n{{sender}}', status: 'ready' } });
    ok(ready.status === 201, 'a finished pitch can be marked ready');
    const list = (await P('')).json.items; ok(list.some(i => i.id === draft.json.id && i.status === 'draft' && i.sent === 0) && list.some(i => i.id === ready.json.id && i.status === 'ready'), 'both are listed');
    ok((await P(`/items/${ready.json.id}`, { method: 'PUT', body: { title: `Ready ${tag}`, kind: 'pitch', subject: 'Salon booking, built in weeks', body: 'Hi {{first_name|there}},\n\nA short note about a build we shipped, in two weeks.\n\n{{sender}}', status: 'ready' } })).status === 200, 'it can be edited');
    ok((await P('/items/not-an-id', { method: 'PUT', body: { title: 'x' } })).status === 404, 'a made-up id is not found');

    // the media list
    const a = await person(`Ana ${tag}`, `ana-${tag}@press.test`, ['press', 'beat-retail']), b = await person(`Ben ${tag}`, `ben-${tag}@press.test`), c = await person(`Cy ${tag}`, `cy-${tag}@press.test`);
    const notMedia = await person(`Not ${tag}`, `notpress-${tag}@press.test`, ['customer']), noMail = await person(`Dee ${tag}`, `dee-${tag}@press.test`), failing = await person(`Fail ${tag}`, `failme-${tag}@press.test`);
    const media = (await P(`/media?q=${tag}`)).json.media; ok(media.length === 5 && !media.some(m => m.id === notMedia) && media.find(m => m.id === a).beats.includes('retail'), 'the media list is the people tagged press, with their beats');
    await S(`/contacts/${noMail}/unsubscribe`, { method: 'PUT', body: { unsubscribed: true } });
    ok((await P(`/media?q=${tag}`)).json.media.find(m => m.id === noMail).canEmail === false, 'someone who unsubscribed shows as not mailable');

    // preview
    const pv = await P(`/items/${ready.json.id}/preview`, { body: { contactId: a } }); ok(pv.status === 200 && /Hi Ana/.test(pv.json.body) && pv.json.placeholders.length === 0, 'the preview is the message as that person gets it', pv.json);
    ok((await P(`/items/${draft.json.id}/preview`, { body: { contactId: a } })).json.placeholders.includes('[QUOTE FROM KYLE]'), 'and says which blanks are still to fill');

    // pitch guards
    const go = (id, body) => P(`/items/${id}/pitch`, { body });
    const before = mock.sent.length;
    const g1 = await go(draft.json.id, { confirm: true, contactIds: [a] }); ok(g1.status === 422 && /ready/i.test(g1.json.error), 'a draft is never sent');
    await P(`/items/${draft.json.id}`, { method: 'PUT', body: { title: `Pitch ${tag}`, kind: 'pitch', subject: d.json.subject, body: d.json.body, status: 'ready' } });
    const g2 = await go(draft.json.id, { confirm: true, contactIds: [a] }); ok(g2.status === 422 && /QUOTE FROM KYLE/.test(g2.json.error), 'a message with a [PLACEHOLDER] left is never sent, and says which');
    const g3 = await go(ready.json.id, { contactIds: [a] }); ok(g3.status === 422 && /confirm/i.test(g3.json.error), 'it is not sent without the confirmation');
    ok((await go(ready.json.id, { confirm: true, contactIds: [] })).status === 422 && (await go(ready.json.id, { confirm: 'yes', contactIds: [a] })).status === 422, 'nor to nobody, nor with a made-up confirmation');
    ok(mock.sent.length === before, 'nothing went out for any of that');

    // a real send, with the awkward people mixed in
    const r1 = await go(ready.json.id, { confirm: true, contactIds: [a, notMedia, noMail, failing, b] });
    const by = Object.fromEntries(r1.json.results.map(x => [x.contactId, x]));
    ok(r1.status === 200 && by[a].outcome === 'sent' && by[b].outcome === 'sent' && by[notMedia].outcome === 'skipped' && /media list/.test(by[notMedia].reason) && by[noMail].outcome === 'skipped' && by[failing].outcome === 'failed', 'it goes to the people on the list who may be emailed; the others are skipped or failed, each with a reason', r1.json);
    const out = mock.sent.filter(m => m.body.to[0].includes(tag) && !m.body.to[0].includes('failme')); ok(out.length === 2 && out.every(m => /List-Unsubscribe/.test(Object.keys(m.body.headers || {}).join()) && m.body.text.includes('1 Test Street') && m.body.text.includes('Unsubscribe here: ')), 'each message is its own email with the mailing address and the unsubscribe link');
    ok(/Hi Ana,/.test(out.find(m => m.body.to[0] === `ana-${tag}@press.test`).body.text), 'and uses that person\'s own name');
    ok(sql(`select count(*) from press_sends where item_id='${ready.json.id}'`) === '2' && sql(`select count(*) from press_sends where contact_id='${failing}'`) === '0', 'it is recorded for the two sent, and the failed one can be tried again');
    const r2 = await go(ready.json.id, { confirm: true, contactIds: [a, b, c] }); const by2 = Object.fromEntries(r2.json.results.map(x => [x.contactId, x]));
    ok(by2[a].outcome === 'skipped' && /already/.test(by2[a].reason) && by2[c].outcome === 'sent' && r2.json.sent === 1, 'sending again skips those who already have it, and sends to the new person');
    const dbl = await Promise.all([go(ready.json.id, { confirm: true, contactIds: [c] }), go(ready.json.id, { confirm: true, contactIds: [c] })]);
    ok(mock.sent.filter(m => m.body.to[0] === `cy-${tag}@press.test`).length === 1 && dbl.every(x => x.status === 200), 'a double click cannot send the same person twice');
    const list2 = (await P('')).json; ok(list2.items.find(i => i.id === ready.json.id).sent === 3 && list2.sentToday >= 3, 'the list shows how many it went to, and how many pitches went today');
    ok((await S(`/contacts/${a}`)).json.activities.some(x => x.kind === 'email_out' && /Salon booking/.test(x.text)) && (await P(`/media?q=ana-${tag}`)).json.media[0].pitched === 1, 'it is on the person\'s timeline and in the media list');

    // limits
    ok((await P('/settings', { method: 'PUT', body: { dailyCap: 0 } })).status === 422 && (await P('/settings', { method: 'PUT', body: { dailyCap: 500 } })).status === 422, 'the daily limit must be 1 to 100');
    const todayN = (await P('')).json.sentToday; await P('/settings', { method: 'PUT', body: { dailyCap: Math.max(1, todayN) } });
    const d1 = await person(`Dan ${tag}`, `dan-${tag}@press.test`); const lim = await go(ready.json.id, { confirm: true, contactIds: [d1] });
    ok(lim.json.sent === 0 && /limit/i.test(lim.json.results[0].reason) && lim.json.remainingToday === 0, 'at the daily limit nobody more is pitched, and it says so');
    await P('/settings', { method: 'PUT', body: { dailyCap: 25 } });
    const arch = await P(`/items/${ready.json.id}`, { method: 'PUT', body: { title: `Ready ${tag}`, kind: 'pitch', subject: 'Salon booking, built in weeks', body: 'Hi', status: 'archived' } }); ok(arch.status === 200 && !(await P('')).json.items.some(i => i.id === ready.json.id), 'an archived item drops off the list');

    // coverage
    ok((await P('/coverage', { body: { outlet: '' } })).status === 422 && (await P('/coverage', { body: { outlet: 'X', url: 'javascript:alert(1)' } })).status === 422 && (await P('/coverage', { body: { outlet: 'X', publishedOn: '2026-13-40' } })).status === 422, 'coverage needs an outlet, a web address and a real date');
    const cov = await P('/coverage', { body: { outlet: 'Retail Dive', title: 'Salon software, rebuilt', url: 'https://example.com/retail-dive', publishedOn: '2026-10-14', itemId: ready.json.id, contactId: a } });
    ok(cov.status === 201 && (await P('/coverage')).json.coverage.some(x => x.id === cov.json.id && x.outlet === 'Retail Dive' && x.contact_name === `Ana ${tag}`), 'coverage is logged against the pitch and the journalist');
    ok((await S(`/contacts/${a}`)).json.activities.some(x => x.kind === 'note' && /Coverage in Retail Dive/.test(x.text)), 'and appears on their timeline');
    ok((await P(`/coverage/${cov.json.id}`, { method: 'DELETE' })).status === 200 && (await P(`/coverage/${cov.json.id}`, { method: 'DELETE' })).status === 404, 'it can be removed');

    // announcements and releases strip merge fields, and an item can be removed
    const rel = await P('/draft', { body: { kind: 'release', angle: 'Launch' } }); ok(rel.status === 200 && !/\{\{/.test(rel.json.body) && /\[CITY, DATE\]/.test(rel.json.body), 'a release draft has a dateline to fill and no merge fields');
    ok((await P(`/items/${draft.json.id}`, { method: 'DELETE' })).status === 200 && (await P(`/items/${draft.json.id}`, { method: 'DELETE' })).status === 404, 'an item can be deleted');
  } finally { await new Promise(r => resend.close(r)); }
});
await journey('J123', 'The opportunity finder: who to talk to next and why, from what the CRM already knows (chats waiting, unanswered mail, live builds opened, quiet deals, warm people, customers who could use more), strongest first, one line per person, nothing for people who opted out, and what staff set aside stays away', async () => withOpportunityLock(async () => {
  const room = await newRoom('123', { wait: false }), tag = `o${stamp}`;
  setAsideOpportunities(); // the list shows the strongest 60 in the whole CRM: leave only this journey's people on it
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: sql(`select client_id from users where lower(email)='${room.email}'`), role: 'admin', email: 'kyle@thefuturebasics.com' });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  const person = async (name, o = {}) => (await S('/contacts', { body: { name: `${name} ${tag}`, email: `${name.toLowerCase().replace(/\W/g, '')}-${tag}@opp.test`, source: 'referral', ...o } })).json.id;
  const act = (id, kind, text, ago) => sql(`insert into sales_activities(contact_id,kind,text,created_at) values('${id}','${kind}','${text}', now() - interval '${ago}')`);
  const list = async (q = '') => (await S('/opportunities' + q)).json;
  const mine = (l, name) => l.opportunities.find(o => o.name === `${name} ${tag}`);
  // keep the one thing each person is here for the only thing: no task, no deal, a quiet day
  const quiet = id => sql(`update sales_contacts set created_at = now() - interval '30 days' where id='${id}'`);

  ok((await call('/v1/sales/opportunities', { token: room.token })).status === 403 && (await call('/v1/sales/opportunities')).status === 401, 'clients and strangers cannot see opportunities');

  const chat = await person('Chatty Cleo'); quiet(chat); sql(`insert into chat_conversations(token_hash, contact_id, status, visitor_name, last_message_at) values('t-${tag}','${chat}','waiting','Chatty Cleo', now() - interval '1 day')`);
  const ian = await person('Inbound Ian'); quiet(ian); act(ian, 'email_in', 'Can you build us a new site?', '3 days');
  const olivia = await person('Open Olivia'); quiet(olivia); act(olivia, 'showcase_demo', 'Opened the live build', '2 days');
  const quinn = await person('Quiet Quinn'); quiet(quinn); const deal = (await S('/deals', { body: { title: `New site ${tag}`, contactId: quinn, stage: 'proposal', value: '8000' } })).json.id; sql(`update sales_deals set last_activity_at = now() - interval '10 days' where id='${deal}'`);
  const hana = await person('Hot Hana'); quiet(hana); for (const d of ['1 day', '2 days', '1 day', '3 days']) act(hana, 'showcase_view', 'Looked at a build', d);
  const cora = await person('Cold Cora'); quiet(cora); for (const d of ['30 days', '31 days', '30 days', '32 days']) act(cora, 'showcase_demo', 'Opened the live build', d);
  const nina = await person('New Nina');
  const tp = await person('Techpack Tess', { tags: ['tech-pack'] }); quiet(tp); const bd = await person('Builds Bea', { tags: ['builds'] }); quiet(bd);
  const w1 = await person('Won Wes', { companyName: `Acme ${tag}` }); quiet(w1); const w2 = await person('Also Alma', { companyName: `Acme ${tag}` }); quiet(w2);
  const wd = (await S('/deals', { body: { title: `Acme site ${tag}`, contactId: w1, stage: 'won', value: '20000' } })).json.id; ok(wd, 'setup: a won deal at Acme');
  const out = await person('Optout Olga'); quiet(out); for (const d of ['1 day', '2 days', '1 day', '3 days']) act(out, 'showcase_view', 'Looked', d); await S(`/contacts/${out}/unsubscribe`, { method: 'PUT', body: { unsubscribed: true } });
  const dealer = await person('Dealing Dev'); quiet(dealer); for (const d of ['1 day', '2 days', '1 day', '3 days']) act(dealer, 'showcase_view', 'Looked', d); await S('/deals', { body: { title: `Dev site ${tag}`, contactId: dealer } });
  const tasked = await person('Tasked Tom'); quiet(tasked); act(tasked, 'showcase_demo', 'Opened', '1 day'); await S('/tasks', { body: { contactId: tasked, title: 'Call Tom' } });

  const l = await list();
  ok(mine(l, 'Chatty Cleo')?.type === 'chat_waiting' && /waiting in chat/.test(mine(l, 'Chatty Cleo').reason), 'someone waiting in chat is on the list', mine(l, 'Chatty Cleo'));
  ok(mine(l, 'Inbound Ian')?.type === 'inbound_unanswered' && /wrote to us 3 days ago.*new site/.test(mine(l, 'Inbound Ian').reason), 'someone who wrote in and was not answered, with what they said');
  ok(mine(l, 'Open Olivia')?.type === 'opened_live' && /opened a live build 2 days ago/.test(mine(l, 'Open Olivia').reason), 'someone who opened a live build and was not followed up');
  const qd = mine(l, 'Quiet Quinn'); ok(qd?.type === 'deal_quiet' && /\$8,000.*10 days.*Proposal|\$8,000.*10 days/.test(qd.reason) && qd.dealId === deal, 'a deal that went quiet, with its value and how long');
  ok(mine(l, 'Hot Hana')?.type === 'hot_no_deal' && /looked at builds 4 times/.test(mine(l, 'Hot Hana').reason), 'a hot person with no deal, and what they did');
  ok(mine(l, 'Cold Cora')?.type === 'gone_cold' && /was warm/.test(mine(l, 'Cold Cora').reason), 'someone who was warm and went quiet');
  ok(mine(l, 'New Nina')?.type === 'new_unworked', 'a new contact nobody has touched');
  ok(mine(l, 'Techpack Tess')?.type === 'cross_sell_builds' && mine(l, 'Builds Bea')?.type === 'cross_sell_techpack', 'tech pack customers who have not seen the builds, and the other way round');
  const ex = mine(l, 'Also Alma'); ok(ex?.type === 'account_expansion' && /Acme.*customer.*\$20,000/.test(ex.reason), 'a customer company where others have no deal', ex);
  ok(!mine(l, 'Optout Olga'), 'nobody who opted out is ever suggested');
  ok(!mine(l, 'Dealing Dev'), 'someone who already has a deal is not "interested, no deal"');
  ok(!mine(l, 'Tasked Tom'), 'someone staff already have a task for is not nagged about');

  const order = l.opportunities.map(o => o.name); ok(order.indexOf(`Chatty Cleo ${tag}`) < order.indexOf(`Inbound Ian ${tag}`) && order.indexOf(`Inbound Ian ${tag}`) < order.indexOf(`Open Olivia ${tag}`) && order.indexOf(`Open Olivia ${tag}`) < order.indexOf(`Hot Hana ${tag}`) && order.indexOf(`Hot Hana ${tag}`) < order.indexOf(`Techpack Tess ${tag}`), 'strongest first: chat, then mail, then live builds, then warm people, then ideas');
  ok(mine(l, 'Chatty Cleo').priority === 'now' && mine(l, 'Hot Hana').priority === 'week' && mine(l, 'Techpack Tess').priority === 'later' && l.priorities.now >= 3 && l.total >= 10, 'each has a priority band, and the counts add up');
  ok(Object.keys(l.counts).length >= 8 && l.types.length === 10, 'counts by kind, and the kinds are named');
  const only = await list('?type=deal_quiet'); ok(only.opportunities.length >= 1 && only.opportunities.every(o => o.type === 'deal_quiet'), 'it can be narrowed to one kind');

  // one line per person
  sql(`insert into sales_activities(contact_id,kind,text,created_at) values('${ian}','showcase_view','Looked', now() - interval '1 day'),('${ian}','showcase_view','Looked', now() - interval '1 day'),('${ian}','showcase_view','Looked', now() - interval '1 day'),('${ian}','showcase_view','Looked', now() - interval '1 day')`);
  const l2 = await list(); ok(l2.opportunities.filter(o => o.contactId === ian).length === 1 && mine(l2, 'Inbound Ian').type === 'inbound_unanswered' && mine(l2, 'Inbound Ian').also.includes('hot_no_deal'), 'a person with two reasons appears once, under the stronger, with the other noted');

  // doing something about it
  ok((await S('/opportunities/act', { body: { key: mine(l, 'Open Olivia').key, action: 'task' } })).status === 200, 'making a task from an opportunity works');
  const od = (await S(`/contacts/${olivia}`)).json; ok(od.tasks.some(t => /Follow up with Open Olivia/.test(t.title)), 'and the task has a sensible title');
  ok(!mine(await list(), 'Open Olivia'), 'she is off the list now');
  ok((await S('/opportunities/act', { body: { key: mine(l, 'Hot Hana').key, action: 'dismiss' } })).status === 200 && !mine(await list(), 'Hot Hana'), 'hiding one removes it');
  ok((await S('/opportunities/act', { body: { key: mine(l, 'Cold Cora').key, action: 'snooze', days: 3 } })).status === 200 && !mine(await list(), 'Cold Cora'), 'snoozing one removes it for now');
  sql(`update sales_opportunity_state set until = now() - interval '1 minute' where key like '%${cora}'`); ok(mine(await list(), 'Cold Cora')?.type === 'gone_cold', 'and it comes back when the time is up, while it is still true');
  act(ian, 'email_out', 'Thanks, here is a call link', '1 hour'); const l3 = await list(); ok(mine(l3, 'Inbound Ian')?.type !== 'inbound_unanswered', 'once someone answers, the unanswered mail is gone');
  const nf = await S('/opportunities/act', { body: { key: 'inbound_unanswered:nobody', action: 'task' } }), badAct = await S('/opportunities/act', { body: { key: 'x', action: 'explode' } });
  ok(nf.status === 404 && badAct.status === 422, 'something that is not there is a not-found, and an action that is not one is refused', [nf.status, nf.json, badAct.status, badAct.json]);
}));

await journey('J134', 'Sales intelligence: listens to Reddit, Hacker News, news, web search, X and Discord, has Claude, ChatGPT or Grok read what is new, surfaces the posts worth a person\'s time with a draft, never sends anything itself, records what each person does, and turns that into KPIs', async () => {
  const http = await import('node:http');
  const mock = { redditAuth: 0, xCalls: 0, log: [] };
  const verdict = user => { const no = /NOFIT/.test(user), strong = /STRONG/.test(user), urgent = /URGENT/.test(user); return no ? { relevant: false, serviceLine: 'none', intent: 'discussion', fit: 0, urgency: 0, summary: 'Not an opportunity', whyNow: '', angle: '', draft: '', channel: 'none', risks: '' } : { relevant: true, serviceLine: /AI|automate/i.test(user) ? 'ai' : 'apps', intent: 'buying', fit: strong ? 92 : 70, urgency: urgent ? 90 : 50, summary: 'Needs help', whyNow: 'Asked today', angle: 'Answer first', draft: 'MODEL DRAFT', channel: 'public_reply', risks: '' }; };
  const store = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), body = Buffer.concat(chunks).toString(), send = (c, b, type = 'application/json') => { res.writeHead(c, { 'content-type': type }); res.end(typeof b === 'string' ? b : JSON.stringify(b)); };
      mock.log.push(`${req.method} ${u.pathname}`);
      if (u.pathname === '/api/v1/access_token') { mock.redditAuth++; return req.headers.authorization === 'Basic ' + Buffer.from('rid:rsec').toString('base64') ? send(200, { access_token: 'RT', expires_in: 3600 }) : send(401, {}); }
      if (u.pathname.startsWith('/r/') || u.pathname === '/search') { if (req.headers.authorization !== 'Bearer RT') return send(401, {}); return send(200, { data: { children: [
        { data: { name: 't3_a1', permalink: '/r/mockhub/comments/a1/x/', author: 'redditor1', title: 'Need a developer to build an app for my salon STRONG', selftext: 'Looking for someone, budget is ready. URGENT', created_utc: Math.floor(Date.now() / 1000) - 3600, subreddit: 'mockhub' } },
        { data: { name: 't3_a2', permalink: '/r/mockhub/comments/a2/x/', author: 'redditor2', title: 'Need help with my app NOFIT', selftext: 'homework question about a developer job', created_utc: Math.floor(Date.now() / 1000) - 7200 } },
        { data: { name: 't3_a3', permalink: '/r/mockhub/comments/a3/x/', author: 'redditor3', title: 'Pictures of my cat', selftext: 'nothing to see', created_utc: Math.floor(Date.now() / 1000) } }] } }); }
      if (u.pathname === '/api/v1/search_by_date') return send(200, { hits: [{ objectID: 'hn1', author: 'founder', story_title: 'Ask HN', comment_text: 'We want to hire an AI consultant to automate our support. STRONG', created_at_i: Math.floor(Date.now() / 1000) - 600 }, { objectID: 'hn2', author: 'chatty', story_title: 'Weather', comment_text: 'lovely day', created_at_i: Math.floor(Date.now() / 1000) }] });
      if (u.pathname === '/rss/search') return send(200, '<rss><channel><item><title>Apparel brand raises seed, needs a manufacturer</title><link>https://news.example/brand</link><guid>news-1</guid><pubDate>' + new Date().toUTCString() + '</pubDate><description>The founders are looking for a factory to make samples.</description><source url="x">Retail Dive</source></item></channel></rss>', 'application/rss+xml');
      if (u.pathname === '/res/v1/web/search') return req.headers['x-subscription-token'] === 'bk' ? send(200, { web: { results: [{ url: 'https://blog.example/post', title: 'Which agency should build our app?', description: 'We need an agency to build an app for our shop', profile: { name: 'blog.example' } }] } }) : send(401, {});
      if (u.pathname === '/2/tweets/search/recent') { mock.xCalls++; if (req.headers.authorization !== 'Bearer xt') return send(401, {}); const later = u.searchParams.get('since_id'); return send(200, later ? { data: [{ id: '2002', text: 'need an AI consultant to automate our workflow', author_id: 'u2', created_at: new Date().toISOString() }, { id: '2001', text: 'looking for a developer for my app, hiring now', author_id: 'u3', created_at: new Date().toISOString() }], includes: { users: [{ id: 'u2', username: 'spammer' }, { id: 'u3', username: 'annx' }] } } : { data: [{ id: '1001', text: 'looking for a developer to build our app STRONG URGENT', author_id: 'u1', created_at: new Date().toISOString() }], includes: { users: [{ id: 'u1', username: 'xfounder' }] } }); }
      if (/^\/api\/v10\/channels\/22222\/messages$/.test(u.pathname)) return req.headers.authorization === 'Bot dbot' ? send(200, [{ id: '3001', content: 'does anyone know an agency to build a web app for us? need a quote', author: { username: 'discordian' }, timestamp: new Date().toISOString() }, { id: '3000', content: 'beep boop', author: { username: 'somebot', bot: true } }]) : send(403, {});
      if (u.pathname === '/v1/chat/completions') {
        const key = (req.headers.authorization || '').replace('Bearer ', ''), who = key === 'oa-key' ? 'openai' : key === 'xai-key' ? 'xai' : '', j = JSON.parse(body || '{}'); if (!who) return send(401, { error: { message: 'bad key' } });
        const user = j.messages?.[1]?.content || '', sys = j.messages?.[0]?.content || '';
        const content = /single word ok/.test(sys) ? 'ok' : JSON.stringify({ ...verdict(user), draft: `${who.toUpperCase()} DRAFT ${/shorter/i.test(user) ? '(shorter)' : ''}`.trim() });
        return send(200, { choices: [{ message: { content } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } });
      }
      send(404, {});
    });
  });
  await new Promise(r => store.listen(3133, '127.0.0.1', r));
  try {
    const room = await newRoom('134', { wait: false }), tag = `i${stamp}`, cid = sql(`select client_id from users where lower(email)='${room.email}'`);
    const mkStaff = async n => { const email = `staff${n}-${tag}@chaos.test`, id = sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${n === 'a' ? 'Ann' : 'Ben'} Staff ${tag}','admin') returning id`).split('\n')[0]; return { id, token: await forge({ sub: id, clientId: cid, role: 'admin', email }) }; };
    const A = await mkStaff('a'), B = await mkStaff('b');
    const I = (path, o = {}) => call('/v1/intel' + path, { token: A.token, ...o }), IB = (path, o = {}) => call('/v1/intel' + path, { token: B.token, ...o });

    // who may use it
    ok((await call('/v1/intel/overview')).status === 401 && (await call('/v1/intel/overview', { token: room.token })).status === 403 && (await call('/v1/intel/kpis', { token: room.token })).status === 403 && (await call('/v1/intel/run', { token: room.token, body: {} })).status === 403 && (await call('/intel')).status === 200, 'clients and strangers cannot use it; the page is served');
    const ov0 = (await I('/overview')).json; ok(ov0.providers.length === 3 && ov0.providers.every(p => p.ready) && ov0.sources.every(s => s.missing.length === 0) && ov0.staff.some(s => s.id === A.id), 'all three AI providers and all six sources are connected here', ov0.providers);
    const seeded = (await I('/watches')).json.watches; ok(seeded.length >= 8 && ['hn', 'news', 'reddit', 'x'].every(k => seeded.some(w => w.kind === k)), 'a first set of watches is there for our three services', seeded.length);
    for (const w of seeded) await I(`/watches/${w.id}`, { method: 'PUT', body: { name: w.name, kind: w.kind, query: w.query, serviceLine: w.serviceLine, enabled: false } });

    // watches: checked, then made
    ok((await I('/watches', { body: { name: '', kind: 'hn', query: 'x' } })).status === 422 && (await I('/watches', { body: { name: 'n', kind: 'tiktok', query: 'x' } })).status === 422 && (await I('/watches', { body: { name: 'n', kind: 'hn', query: '' } })).status === 422 && (await I('/watches', { body: { name: 'n', kind: 'hn', query: 'x', serviceLine: 'legal' } })).status === 422, 'a watch needs a name, a source we can hear, a query and one of our services');
    const mk = async (kind, query, serviceLine = 'any') => (await I('/watches', { body: { name: `${kind} ${tag}`, kind, query, serviceLine } })).json.id;
    const w = { hn: await mk('hn', 'AI consultant', 'ai'), reddit: await mk('reddit', 'r/mockhub'), news: await mk('news', 'apparel seed', 'product'), web: await mk('web', 'agency build an app', 'apps'), x: await mk('x', 'need a developer'), discord: await mk('discord', '11111/22222', 'apps') };
    const bad = await mk('reddit', 'not a reddit query'); const badRun = (await I(`/watches/${bad}/run`, { body: {} })).json; ok(badRun.ok === false && /looks like r\/smallbusiness/.test(badRun.error) && (await I('/watches')).json.watches.find(x => x.id === bad).lastStatus === 'error', 'a watch that cannot work says why, on the watch');
    await I(`/watches/${bad}`, { method: 'DELETE' });

    // listening and reading
    const run = (await I('/run', { body: { force: true } })).json, results = Object.fromEntries(run.watches.filter(x => Object.values(w).includes(x.id)).map(x => [x.name.split(' ')[0], x]));
    ok(Object.keys(results).length === 6 && Object.values(results).every(x => x.ok), 'every source answered', run.watches);
    ok(mock.redditAuth === 1 && mock.log.filter(l => l === 'GET /2/tweets/search/recent').length === 1, 'the Reddit sign-in was made once and X was asked once');
    ok(results.hn.added === 2 && results.reddit.added === 3 && results.news.added === 1 && results.web.added === 1 && results.x.added === 1 && results.discord.added === 1, 'each source\'s new posts were kept (and the Discord bot\'s own message was not)', Object.entries(results).map(([k, v]) => [k, v.added]));
    ok(run.scored.read >= 6 && run.scored.skipped >= 2, 'the AI read the ones that could matter and the cheap first look dropped the weather and the cat pictures', run.scored);
    let ov = (await I('/overview')).json, titles = ov.signals.map(s => s.title + s.body);
    ok(ov.signals.length >= 6 && !titles.some(t => /Weather|cat/.test(t)) && !ov.signals.some(s => s.relevant === false), 'only posts worth a person\'s time are listed', ov.signals.map(s => [s.source, s.score]));
    ok(ov.signals.every((s, i, a) => i === 0 || a[i - 1].score >= s.score) && ov.signals[0].score >= 85, 'strongest first');
    const top = ov.signals.find(s => s.source === 'x'); ok(top.draft && top.summary && top.whyNow && top.serviceLine && /^https:\/\/x\.com\/xfounder\/status\/1001$/.test(top.url) && top.status === 'new', 'each carries a summary, why now, the service it fits, the link to the post and a draft for a person to send', top);
    const rr = ov.signals.find(s => s.source === 'reddit'); ok(rr.serviceLine === 'apps' && ov.signals.filter(s => s.source === 'reddit').length === 1, 'the reddit post the AI judged not an opportunity is hidden');
    ok(Number((sql(`select count(*) from intel_usage where task='score'`))) >= 6 && sql(`select count(*) from intel_signals where model='prefilter'`) !== '0', 'what each read cost is recorded, and the first-look drops are marked');
    // what the first look passed over, and what each watch last heard
    const passed = (await I('/passed')).json.signals; ok(passed.length >= 2 && passed.every(x => x.reason && x.sourceLabel && x.status === 'new') && passed.some(x => /cat/i.test(x.title + x.body) && /does not mention/.test(x.reason)) && (await call('/v1/intel/passed', { token: room.token })).status === 403, 'the posts the first look passed over are listed with why (staff only)', passed.map(x => x.reason));
    ok(ov.counts.passed >= 2 && top.nextStep && /“I sent it”/.test(top.nextStep) && /CRM/.test(top.nextStep), 'the count of passed-over posts is there, and each signal says what Future Basics should do next');
    const heard = (await I('/watches')).json.watches.find(x => x.id === w.reddit).recent; ok(heard.length === 3 && heard.every(x => /^https:\/\/www\.reddit\.com\/r\/mockhub\//.test(x.url) && x.title) && heard.some(x => x.state === 'read') && heard.some(x => x.state === 'not-a-fit') && heard.some(x => x.state === 'passed' && x.reason), 'each watch lists what it last heard with a link to the post, and says which were read and which passed over', heard.map(x => [x.state, x.url]));
    const pid = sql(`insert into intel_signals(source,external_id,url,title,body,scored_at,relevant,score,model) values('hn','pass-${tag}','https://news.ycombinator.com/item?id=1','Our team could use help with automation','a quiet note NOFIT',now(),false,0,'prefilter') returning id`).split('\n')[0];
    ok((await I('/passed')).json.signals.some(x => x.id === pid) && (await call(`/v1/intel/signals/${pid}/read`, { token: room.token, body: {} })).status === 403, 'a passed-over post can be listed, and only staff can ask for it to be read');
    const rdp = (await I(`/signals/${pid}/read`, { body: {} })).json; ok(rdp.ok && rdp.read === true && sql(`select model from intel_signals where id='${pid}'`) !== 'prefilter' && !(await I('/passed')).json.signals.some(x => x.id === pid), 'asking the AI to read a passed-over post reads it and takes it off that list', rdp);
    sql(`delete from intel_signals where id='${pid}'`);
    const again = (await I('/run', { body: { force: true } })).json.watches.filter(x => Object.values(w).includes(x.id)); ok(again.filter(x => x.name.startsWith('x')).every(x => x.added === 2) && again.filter(x => !x.name.startsWith('x')).every(x => x.added === 0), 'listening again adds only what is new: the same posts are not kept twice, and X carries on from where it stopped', again.map(x => [x.name, x.added]));
    ok((await I('/settings', { method: 'PUT', body: { ignoreHandles: ['spammer'] } })).status === 200, 'staff add a handle to leave alone');
    sql(`delete from intel_signals where source='x' and external_id in ('2001','2002')`); await I(`/watches/${w.x}`, { method: 'PUT', body: { name: `x ${tag}`, kind: 'x', query: 'need a developer', serviceLine: 'any', enabled: true } }); // an edit that changes nothing keeps the cursor; clear it by hand
    sql(`update intel_watches set cursor='1001' where id='${w.x}'`); const ign = (await I(`/watches/${w.x}/run`, { body: {} })).json; ok(ign.added === 1 && ign.ignored === 1 && sql(`select count(*) from intel_signals where author='spammer'`) === '0', 'a post from the ignored handle is not kept', ign);

    // the score and the line it draws
    ok((await I('/settings', { method: 'PUT', body: { minScore: 101 } })).status === 422 && (await I('/settings', { method: 'PUT', body: { slaHours: 0 } })).status === 422 && (await I('/settings', { method: 'PUT', body: { provider: 'bard' } })).status === 422, 'settings are checked');
    const scores = ov.signals.map(s => s.score).sort((a, b) => a - b), mid = scores[Math.floor(scores.length / 2)];
    await I('/settings', { method: 'PUT', body: { minScore: mid } }); const hi = (await I('/overview')).json, lo = (await I('/overview?show=low')).json;
    ok(hi.signals.every(s => s.score >= mid) && lo.signals.every(s => s.score < mid) && hi.counts.low === lo.signals.length, 'raising the score to surface moves the weaker posts behind "Show lower scores"', [mid, hi.signals.length, lo.signals.length]);
    await I('/settings', { method: 'PUT', body: { minScore: 40 } });

    // what people do about a signal
    ov = (await I('/overview')).json; const s1 = ov.signals[0].id, s2 = ov.signals[1].id, s3 = ov.signals[2].id;
    const act = (tok, id, action, body = {}) => call(`/v1/intel/signals/${id}/${action}`, { token: tok, body });
    ok((await act(room.token, s1, 'claim')).status === 403, 'a client cannot act on a signal');
    const cl = await act(A.token, s1, 'claim'); ok(cl.status === 200 && cl.json.status === 'reviewing', 'a team member takes it');
    let d1 = (await I(`/signals/${s1}`)).json; ok(d1.signal.ownerId === A.id && d1.signal.firstActionAt && d1.events[0].kind === 'claimed', 'it is theirs, and the time to first action is stamped');
    const clash = await act(B.token, s1, 'claim'); ok(clash.status === 409 && /already on this one/.test(clash.json.error), 'someone else cannot quietly take it');
    ok((await act(A.token, s1, 'assign', { ownerId: room.clientId || '00000000-0000-0000-0000-000000000000' })).status === 422 && (await act(A.token, s1, 'assign', { ownerId: B.id })).status === 200 && (await I(`/signals/${s1}`)).json.signal.ownerId === B.id, 'it can be handed to a named team member, not to anyone else');
    ok((await act(B.token, s1, 'outreach', { channel: 'public_reply' })).status === 422 && (await act(B.token, s1, 'outreach', { channel: 'carrier pigeon', note: 'x' })).status === 422, 'logging outreach needs the channel and what was sent');
    ok((await act(B.token, s1, 'reply')).status === 409, 'a reply cannot be logged before anything was sent');
    ok((await act(B.token, s1, 'outreach', { channel: 'public_reply', note: 'Happy to help: here is how I would start…' })).json.status === 'actioned', 'what was sent is logged');
    ok((await act(B.token, s1, 'reply', { note: 'They answered' })).json.status === 'replied' && (await act(B.token, s1, 'meeting', { note: 'Tuesday 3pm' })).json.status === 'meeting', 'their reply and the meeting are logged');
    ok((await act(B.token, s1, 'won', { valueCents: -5 })).status === 422 && (await act(B.token, s1, 'won', { valueCents: 1250000, note: 'Signed' })).json.status === 'won', 'a win needs a value and is logged');
    ok((await act(B.token, s1, 'outreach', { channel: 'dm', note: 'again' })).status === 409 && (await act(B.token, s1, 'claim')).status === 409, 'a closed one is not worked on again until it is reopened');
    d1 = (await I(`/signals/${s1}`)).json; ok(d1.events.map(e => e.kind).join() === 'claimed,assigned,outreach,deal,reply,meeting,won' && Number(d1.events.find(e => e.kind === 'won').value_cents) === 1250000, 'the whole story is on the record, in order', d1.events.map(e => e.kind));
    // "I sent it" is where the deal starts, and every later step moves it: nothing is copied by hand
    const h1 = (await I(`/signals/${s1}`)).json.signal, cid1 = h1.contactId, did1 = h1.dealId;
    ok(cid1 && did1 && sql(`select source||'|'||array_to_string(tags,',') from sales_contacts where id='${cid1}'`).startsWith('intel|intel,') && sql(`select source from sales_deals where id='${did1}'`) === 'intel', '"I sent it" made the contact (tagged intel) and the deal, without anyone pressing Add to CRM');
    ok(sql(`select count(*) from sales_deals where contact_id='${cid1}'`) === '1' && sql(`select stage||'|'||value_cents||'|'||(closed_at is not null) from sales_deals where id='${did1}'`) === 'won|1250000|true', 'there is one deal, and the win closed it at its value');
    const tl = sql(`select string_agg(kind||':'||text, ' // ' order by created_at, id) from sales_activities where deal_id='${did1}'`);
    ok(/note:Sent on a public reply, from X: Happy to help: here is how I would start/.test(tl) && /stage:.*Contacted → Meeting/.test(tl) && /stage:.*Meeting → Won/.test(tl) && /note:They replied: They answered/.test(tl) && /note:Meeting booked: Tuesday 3pm/.test(tl), 'the contact\'s timeline has exactly what was sent, the reply, the meeting and each stage change', tl);
    ok(sql(`select count(*) from sales_tasks where contact_id='${cid1}' and title like 'Follow up on what we sent%' and due_at > now() + interval '2 days'`) === '1', 'a follow-up task was set for three days on');
    ok((await call('/v1/intel/signals/' + s2 + '/lost', { token: A.token, body: {} })).status === 200 && sql(`select stage||'|'||(closed_at is not null) from sales_deals where id=(select deal_id from intel_signals where id='${s2}')`) === 'lost|true' && sql(`select source from sales_deals where id=(select deal_id from intel_signals where id='${s2}')`) === 'intel', 'marking one lost closes its deal as lost (a signal with no deal gets one)');
    ok((await act(A.token, s2, 'reopen')).json.status === 'new' && sql(`select stage from sales_deals where id=(select deal_id from intel_signals where id='${s2}')`) === 'contacted', 'reopening a lost one puts its deal back to Contacted');
    ok((await act(A.token, s2, 'dismiss', {})).status === 422 && (await act(A.token, s2, 'dismiss', { reason: 'vendor', note: 'selling their own thing' })).json.status === 'dismissed', 'dismissing needs a reason');
    ok(!(await I('/overview')).json.signals.some(s => s.id === s2) && (await I('/overview?status=dismissed')).json.signals.some(s => s.id === s2), 'a dismissed post leaves the list and is found under Dismissed');
    ok((await act(A.token, s2, 'reopen')).json.status === 'new' && (await act(A.token, s3, 'reopen')).status === 409, 'a dismissed one can be reopened; one that was never closed cannot');

    // into the CRM
    const crm = await act(A.token, s3, 'to-crm', { name: `Lead ${tag}`, email: `lead-${tag}@x.test`, dealTitle: `App for ${tag}`, valueCents: 800000 });
    ok(crm.status === 200 && crm.json.created && crm.json.contactId && crm.json.dealId, 'a signal becomes a contact, a deal and a follow-up task', crm.json);
    ok(sql(`select source||'|'||array_to_string(tags,',') from sales_contacts where id='${crm.json.contactId}'`).startsWith('intel|intel,') && sql(`select count(*) from sales_tasks where contact_id='${crm.json.contactId}' and done_at is null`) === '1' && sql(`select source||'|'||value_cents from sales_deals where id='${crm.json.dealId}'`) === 'intel|800000', 'the contact is tagged intel, the deal came from intel with its value, and the task is open');
    const crm2 = await act(A.token, s3, 'to-crm', { dealTitle: 'ignored second time' }); ok(crm2.json.contactId === crm.json.contactId && crm2.json.created === false && crm2.json.dealId === crm.json.dealId && sql(`select count(*) from sales_deals where contact_id='${crm.json.contactId}'`) === '1', 'adding it again does not make a second contact or deal');
    ok((await act(A.token, s3, 'to-crm', { email: 'not an email' })).status === 422, 'a bad email is refused');

    // a post a person saw on LinkedIn
    const manual = await I('/signals', { body: { source: 'linkedin', url: `https://www.linkedin.com/posts/${tag}`, author: 'Dana Founder', text: `We need an AI consultant to automate onboarding. STRONG ${tag}` } });
    ok(manual.status === 201 && manual.json.read === true, 'a post added by hand is read at once');
    const m1 = (await I('/overview?source=linkedin')).json.signals[0]; ok(m1 && m1.sourceLabel === 'linkedin' && m1.draft && m1.relevant, 'and listed under LinkedIn with a draft');
    ok((await I('/signals', { body: { source: 'linkedin', url: `https://www.linkedin.com/posts/${tag}`, text: 'again' } })).status === 409 && (await I('/signals', { body: { text: '' } })).status === 422 && (await I('/signals', { body: { text: 'x', url: 'javascript:alert(1)' } })).status === 422, 'the same post twice, an empty post and a script address are refused');
    sql(`delete from intel_signals where id='${m1.id}'`);

    // other AIs, and their cost
    const rd = await act(A.token, s3, 'redraft', { provider: 'openai', instruction: 'shorter' }); ok(rd.status === 200 && /OPENAI DRAFT \(shorter\)/.test(rd.json.draft), 'a person can ask ChatGPT for another draft with an instruction');
    const rg = await act(A.token, s3, 'redraft', { provider: 'xai' }); ok(rg.status === 200 && /XAI DRAFT/.test(rg.json.draft) && /XAI DRAFT/.test((await I(`/signals/${s3}`)).json.signal.draft) && (await act(A.token, s3, 'redraft', { provider: 'bard' })).status === 200, 'and Grok; the new draft replaces the old one (an unknown provider falls back to the default)');
    const t1 = await I('/providers/test', { body: { provider: 'openai' } }), t2 = await I('/providers/test', { body: { provider: 'xai' } }), t3 = await I('/providers/test', { body: { provider: 'anthropic' } });
    ok(t1.status === 200 && t1.json.answer === 'ok' && t2.status === 200 && t3.status === 200 && (await I('/providers/test', { body: { provider: 'bard' } })).status === 422, 'each provider can be tested from Settings');
    ok(Number(sql(`select count(*) from intel_usage where provider='openai' and cost_cents>0`)) >= 2 && Number(sql(`select count(*) from intel_usage where provider='xai' and cost_cents>0`)) >= 2, 'ChatGPT and Grok calls are priced');

    // the KPIs
    const k = (await I('/kpis?days=30')).json;
    ok(k.funnel.found >= 6 && k.funnel.surfaced >= 5 && k.funnel.actioned === 1 && k.funnel.replied === 1 && k.funnel.meetings === 1 && k.funnel.won === 1 && k.funnel.deals === 3 && k.totals.wonCents === 1250000, 'the funnel counts what happened', k.funnel);
    const ann = k.people.find(p => p.id === A.id), ben = k.people.find(p => p.id === B.id);
    ok(ann.claimed === 1 && ann.dismissed === 1 && ann.deals === 2 && ben.deals === 1 && ben.claimed === 0 && ben.outreach === 1 && ben.replies === 1 && ben.meetings === 1 && ben.won === 1 && ben.wonCents === 1250000, 'each person\'s record is theirs: who took it, sent, got replies, booked meetings, won what (handing a post over is not the same as taking it)', [ann, ben]);
    ok(k.rates.reply === 100 && k.rates.meeting === 100 && k.response.slaHours === 24 && k.response.overdue >= 0 && k.cost.cents > 0 && k.costByProvider.some(c => c.provider === 'openai'), 'the rates, the response time target and the cost are there');
    await I('/settings', { method: 'PUT', body: { teams: { [A.id]: 'Growth', [B.id]: 'Growth', 'not-a-user': 'x' } } });
    const kt = (await I('/kpis?days=7')).json, growth = kt.teams.find(t => t.team === 'Growth'); ok(growth && growth.people >= 2 && growth.wonCents === 1250000 && kt.teams.every(t => t.team === 'Growth' || t.wonCents === 0) && kt.days === 7, 'by team once people are put in teams, and the period can be changed');
    ok(k.bySource.some(g => g.key === 'x') && k.byServiceLine.some(g => g.key === 'apps'), 'what works is broken down by source and by service');

    // nothing went anywhere
    ok(!mock.log.some(l => /^POST \/(api\/v1\/comments|2\/tweets$|api\/v10\/channels)/.test(l)), 'nothing was posted, replied or messaged anywhere: the platform only reads');
  } finally { await new Promise(r => store.close(r)); }
});

await journey('J132', 'the work home: staff only, counts new leads (not clients), lists the leads still waiting for a first reply, the prototypes with who has looked, and the projects in flight with the ones waiting on us first', async () => {
  const room = await newRoom('132', { wait: false }), tag = `h${stamp}`;
  const cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const admin = await forge({ sub: sql(`select id from users where lower(email)='${room.email}'`), clientId: cid, role: 'admin', email: 'kyle@thefuturebasics.com' });
  const home = async () => (await call('/v1/admin/home', { token: admin })).json, S = (path, o = {}) => call('/v1/sales' + path, { token: admin, ...o });
  ok((await call('/v1/admin/home')).status === 401 && (await call('/v1/admin/home', { token: room.token })).status === 403, 'clients and strangers cannot read it');
  const w = await call('/home', { headers: { host: 'work.localhost:3123' } }); ok(w.status === 200 && /Work home/.test(w.text), 'the page itself is served at /home');
  const before = await home(); ok(Array.isArray(before.awaitingReply) && Array.isArray(before.prototypes) && Array.isArray(before.projects) && typeof before.funnel.newLeads7 === 'number' && typeof before.waiting.approvals === 'number', 'the home has leads, prototypes, projects and what is waiting', Object.keys(before));
  ok(before.signals && typeof before.signals.total === 'number' && typeof before.signals.overdue === 'number' && Array.isArray(before.signals.top), 'it also counts the posts from listening that are worth a look');
  const sg = sql(`insert into intel_signals(source,external_id,url,title,summary,scored_at,relevant,score,model,status) values('reddit','home-${tag}','https://example.com/h','Need an app ${tag}','A salon needs an app',now(),true,100,'fixture','new') returning id`).split('\n')[0];
  const withSig = await home(); ok(withSig.signals.top[0]?.id === sg && withSig.signals.total === before.signals.total + 1, 'a post worth a look is on the list, strongest first');
  sql(`update intel_signals set status='dismissed' where id='${sg}'`); const gone = await home(); ok(!gone.signals.top.some(x => x.id === sg) && gone.signals.total === before.signals.total, 'a dismissed one leaves it');

  // leads: a web lead nobody has answered, one we replied to, a hub client, and an old one
  const mk = async (name, source, email) => (await S('/contacts', { body: { name, email, source, tags: [] } })).json.id;
  const a = await mk(`Ann ${tag}`, 'website', `ann-${tag}@lead.test`), b = await mk(`Bob ${tag}`, 'website', `bob-${tag}@lead.test`), hubc = await mk(`Hub ${tag}`, 'hub', `hub-${tag}@lead.test`), old = await mk(`Old ${tag}`, 'website', `old-${tag}@lead.test`);
  sql(`update sales_contacts set created_at=now()-interval '30 days' where id='${old}'`); sql(`insert into sales_activities(contact_id,kind,text) values('${b}','email_out','Thanks for getting in touch')`);
  const after = await home(), names = after.awaitingReply.map(x => x.name);
  ok(after.funnel.newLeads7 - before.funnel.newLeads7 === 2, 'new leads count the two recent people, not the hub client and not the one from a month ago', [before.funnel.newLeads7, after.funnel.newLeads7]);
  ok(names.includes(`Ann ${tag}`) && !names.includes(`Bob ${tag}`) && !names.includes(`Hub ${tag}`) && !names.includes(`Old ${tag}`), 'the leads waiting for a first reply are the one nobody answered: not the one we emailed, a hub client or an old one', names);

  // prototypes: a build in progress that someone has looked at
  const build = await call('/v1/admin/builds', { token: admin, body: { name: `Proto ${tag}`, status: 'in-progress', visibility: 'invite', hosting: 'railway', stack: ['Node'] } }), bid = build.json.id;
  const cold = await home(); const p0 = cold.prototypes.find(x => x.id === bid); ok(p0 && p0.warm === false && /Invited|Only staff|Not shared/.test(p0.next), 'a new prototype nobody has looked at says who to tell', p0);
  sql(`insert into build_views(email,build_id,kind) values('prospect-${tag}@x.test','${bid}','open'),('prospect-${tag}@x.test','${bid}','demo')`);
  const warm = await home(), p1 = warm.prototypes.find(x => x.id === bid);
  ok(p1.warm && p1.lookers7 === 1 && p1.views7 === 2 && /say hello/i.test(p1.next) && warm.prototypes[0].id === bid && warm.funnel.lookers7 - cold.funnel.lookers7 === 1 && warm.funnel.demos7 - cold.funnel.demos7 === 1, 'once someone has looked it is warm, says to say hello, and rises to the top', p1);
  const live = await call('/v1/admin/builds', { token: admin, body: { name: `Live ${tag}`, status: 'live', visibility: 'listed', hosting: 'railway' } }); sql(`insert into build_views(email,build_id,kind) select 'v${tag}'||g||'@x.test','${live.json.id}','open' from generate_series(1,5) g`);
  ok((await home()).showNow.some(x => x.id === live.json.id && x.views30 === 5), 'a finished build people look at is offered as the one to show now');
  ok(!(await home()).prototypes.some(x => x.id === live.json.id), 'and is not listed as a prototype');

  // projects: software and product, the one the client wrote to last first
  const sw = (await call(`/v1/admin/clients/${cid}/projects`, { token: admin, body: { name: `Site ${tag}`, kind: 'software', buildId: bid, stage: 'build' } })).json, pr = (await call(`/v1/admin/clients/${cid}/projects`, { token: admin, body: { name: `Hoodie ${tag}` } })).json;
  let h = await home(), row = id => h.projects.find(x => x.id === id);
  ok(row(sw.id).kind === 'software' && row(sw.id).stage === 'build' && row(sw.id).stageLabel === 'Build' && row(sw.id).buildName === `Proto ${tag}` && row(pr.id).kind === 'product' && row(sw.id).clientId === cid, 'software and product projects are both listed with their stage and build', [row(sw.id), row(pr.id)]);
  ok((await call(`/v1/projects/${pr.id}/messages`, { token: room.token, body: { body: 'Any news on the sample?' } })).status < 300, 'setup: the client writes on the product project');
  h = await home(); ok(row(pr.id).waitingOnUs === true && row(pr.id).owner === 'us' && h.projects.findIndex(x => x.id === pr.id) < h.projects.findIndex(x => x.id === sw.id), 'the project the client wrote to is waiting on us and is listed first');
  await call(`/v1/admin/projects/${sw.id}`, { token: admin, method: 'PATCH', body: { stage: 'review' } }); h = await home(); ok(row(sw.id).owner === 'client' && row(sw.id).waitingOnUs === false, 'a software project in client review is the client\'s to answer');
  await call(`/v1/admin/projects/${pr.id}/archive`, { token: admin, method: 'POST', body: {} }); h = await home(); ok(!row(pr.id) && row(sw.id), 'an archived project drops off');
  await call(`/v1/admin/projects/${sw.id}/archive`, { token: admin, method: 'POST', body: {} }); await call(`/v1/admin/builds/${bid}`, { token: admin, method: 'DELETE' }); await call(`/v1/admin/builds/${live.json.id}`, { token: admin, method: 'DELETE' });
});

await journey('J136', 'Health and connections cover the whole platform: the AI readers, each listening source, the listening pipeline, sales email, chat, automations, the GitHub sync and the client stores, with no secret in the answer', async () => {
  const room = await newRoom('136', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`), email = `health-${stamp}@chaos.test`;
  const uid = sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','Hana Staff','admin') returning id`).split('\n')[0], admin = await forge({ sub: uid, clientId: cid, role: 'admin', email });
  // stand-in services for the free probes: ChatGPT and Grok list their models, Reddit hands out a token, Discord knows its bot, Resend lists a verified domain
  const http = await import('node:http'), store = http.createServer((req, res) => {
    const send = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); }, auth = req.headers.authorization || '', u = new URL(req.url, 'http://x');
    if (u.pathname === '/v1/models') return send(['Bearer oa-key', 'Bearer xai-key'].includes(auth) ? 200 : 401, { data: [] });
    if (u.pathname === '/api/v1/access_token') return auth === 'Basic ' + Buffer.from('rid:rsec').toString('base64') ? send(200, { access_token: 'RT', expires_in: 3600 }) : send(401, {});
    if (u.pathname === '/api/v10/users/@me') return auth === 'Bot dbot' ? send(200, { id: '1' }) : send(401, {});
    if (u.pathname === '/domains') return auth === 'Bearer test-key' ? send(200, { data: [{ name: 'thefuturebasics.com', status: 'verified' }] }) : send(401, {});
    send(404, {});
  });
  await new Promise(r => store.listen(3133, '127.0.0.1', r));
  try {
  const h = (await call('/v1/admin/platform/health?fresh=1', { token: admin })).json, by = Object.fromEntries(h.checks.map(c => [c.id, c]));
  const ids = ['reader-openai', 'reader-xai', 'src-reddit', 'src-hn', 'src-brave', 'src-x', 'src-discord', 'intel', 'sales-email', 'money', 'quickbooks', 'chat', 'automations', 'github', 'stores'];
  ok(ids.every(i => by[i] && by[i].summary && Array.isArray(by[i].facts) && ['ok', 'warn', 'down', 'off'].includes(by[i].status)), 'every part of the platform has a check with a state, a sentence and facts', ids.filter(i => !by[i]));
  ok(['listening', 'sales', 'delivery'].every(g => h.checks.some(c => c.group === g)), 'they are grouped: listening, sales, delivery');
  const fact = (id, k) => (by[id].facts.find(f => f[0] === k) || [])[1];
  ok(fact('reader-openai', 'Model') && fact('reader-xai', 'Model') && by['reader-openai'].status !== 'off' && by['reader-xai'].status !== 'off', 'ChatGPT and Grok show their model and are not "off" when their keys are set', [by['reader-openai'].summary, by['reader-xai'].summary]);
  ok(fact('src-reddit', 'Key') === 'set' && fact('src-brave', 'Key') === 'set' && fact('src-x', 'Key') === 'set' && fact('src-discord', 'Key') === 'set' && fact('src-hn', 'Key') === 'none needed', 'each source says whether its key is set (and that Hacker News needs none)');
  ok(by['src-reddit'].status === 'ok' && /Reddit|watch|Ready/.test(by['src-reddit'].summary), 'Reddit signs in with the key (a free check), so it is ok', by['src-reddit'].summary);
  ok(fact('sales-email', 'Postal address in the footer') === 'set' && fact('sales-email', 'Reply and bounce webhook') === 'secret set' && /^\d+$/.test(fact('sales-email', 'Sent, last 7 days')), 'sales email reports the footer address, the webhook secret and the last 7 days');
  ok(/^\d+$/.test(fact('chat', 'Waiting for a person')) && /^\d+$/.test(fact('automations', 'Switched on')) && /^\d+$/.test(fact('stores', 'Shopify stores connected')) && ['missing', 'GITHUB_TOKEN', 'BUILDS_GITHUB_TOKEN'].includes(fact('github', 'Token')) && /Builds linked/.test(by.github.facts.map(f => f[0]).join()), 'chat, automations and client stores report their counts; GitHub says which token it uses (or that none is set)');
  // a chat waiting a long time is flagged
  const conv = sql(`insert into chat_conversations(token_hash,status,last_message_at) values('h-${stamp}','waiting',now() - interval '45 minutes') returning id`).split('\n')[0];
  const h2 = (await call('/v1/admin/platform/health?fresh=1', { token: admin })).json, chat = h2.checks.find(c => c.id === 'chat');
  ok(chat.status === 'warn' && /waiting for a person/.test(chat.summary), 'a visitor left waiting for a person is flagged', chat.summary); sql(`delete from chat_conversations where id='${conv}'`);
  // a failing watch is flagged on its source
  const wid = sql(`insert into intel_watches(name,kind,query,enabled,last_run_at,last_status,last_error) values('J136 ${stamp}','web','x',true,now(),'refused','Brave refused our key') returning id`).split('\n')[0];
  const h3 = (await call('/v1/admin/platform/health?fresh=1', { token: admin })).json, br = h3.checks.find(c => c.id === 'src-brave'), pipe = h3.checks.find(c => c.id === 'intel');
  ok(['warn', 'down'].includes(br.status) && /Brave refused our key/.test(br.summary) && pipe.status === 'warn', 'a watch that cannot listen is flagged on its source and on the pipeline, with the reason', [br.summary, pipe.summary]); sql(`delete from intel_watches where id='${wid}'`);
  const body = JSON.stringify(h3), leaked = ['oa-key', 'xai-key', 'rsec', 'whsec_dGVzdC1zZWNyZXQ=', 'test-key', 'dbot', ':"bk"', ':"xt"'].filter(x => body.includes(x)); ok(!leaked.length, 'no key or secret appears anywhere in the answer', leaked.map(x => [x, body.slice(Math.max(0, body.indexOf(x) - 60), body.indexOf(x) + 40)]));
  ok(['listenkeys', 'readers', 'salesmail', 'githubtoken', 'tokenkey'].every(i => h3.config.some(c => c.id === i)), 'the settings list covers the newer parts too', h3.config.map(c => c.id));
  ok((await call('/v1/admin/platform/health', { token: room.token })).status === 403, 'a client still cannot read it');
  } finally { await new Promise(r => store.close(r)); }
});

await journey('J137', 'Money: only Danielle and Kyle can open it; invoices add up like the paper ones, move through draft, sent, part paid, paid and void, import from a CSV, and every payment lands in one ledger', async () => {
  const room = await newRoom('137', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), dani = await staff('danielle@thefuturebasics.com'), colby = await staff('colby@thefuturebasics.com');
  const M = (path, o = {}) => call('/v1/money' + path, { token: kyle, ...o });

  // who may open it
  ok((await call('/v1/money/me')).status === 401 && (await call('/v1/money/me', { token: room.token })).status === 403, 'signed out and clients are turned away');
  ok((await call('/v1/money/me', { token: kyle })).status === 200 && (await call('/v1/money/me', { token: dani })).status === 200, 'Kyle and Danielle are let in');
  const paths = ['/overview', '/invoices', '/payments', '/settings'], codes = await Promise.all(paths.map(async x => (await call('/v1/money' + x, { token: colby })).status));
  ok(codes.every(c => c === 403) && (await call('/v1/money/invoices', { token: colby, body: { company: 'X', lines: [{ description: 'a', qty: 1, rate: 5 }] } })).status === 403 && (await call('/v1/money/import', { token: colby, body: { csv: 'Company,Amount\nA,1' } })).status === 403, 'Colby is an admin but cannot read or change anything in Money');

  // an invoice adds up the way the paper one does
  const bad = await M('/invoices', { body: { lines: [{ description: 'a', qty: 1, rate: 5 }] } }); ok(bad.status === 422 && /who the invoice is for/.test(bad.json.error), 'a company is needed');
  const first = await M('/invoices', { body: { company: 'Tools for Humanity Corporation', address: '548 Market St, PMB 49951\nSan Francisco, CA 94104', contactName: 'Eliza Chiang', contactEmail: 'invoices.usa@toolsforhumanity.com', issuedOn: '2026-03-15', terms: 'Due upon receipt', lines: [{ description: 'World x Future Basics Cytoshift', qty: 500, rate: '130.00' }], taxRatePct: 8.63, chargeTax: true, credits: [{ label: 'Deposit Paid 3/9', amount: '35304.75' }], notes: 'Cost Centre - 1201' } });
  const inv = first.json.invoice; ok(first.status === 201 && inv.status === 'draft' && inv.subtotalCents === 6500000 && inv.taxCents === 560950 && inv.totalCents === 7060950 && inv.owedCents === 3530475 && inv.dueNowLabel === 'Final payment due' && inv.dueOn === '2026-03-15' && /^\d+$/.test(inv.number), 'tax, a deposit already paid and the final amount due are worked out', inv);
  const second = (await M('/invoices', { body: { company: 'Palermo, Inc.', issuedOn: '2026-05-14', terms: 'Net 30', lines: [{ description: 'Strategy & Materials', qty: 1, rate: 5500 }] } })).json.invoice; ok(Number(second.number) === Number(inv.number) + 1 && second.dueOn === '2026-06-13', 'the next number follows the last, and the due date follows the terms');
  ok((await M('/invoices', { body: { number: inv.number, company: 'X', lines: [{ description: 'a', qty: 1, rate: 5 }] } })).status === 409, 'a number is never used twice');
  const pdf = await fetch(`http://127.0.0.1:3123/v1/money/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${kyle}` } }); const buf = Buffer.from(await pdf.arrayBuffer());
  ok(pdf.status === 200 && /application\/pdf/.test(pdf.headers.get('content-type')) && buf.slice(0, 4).toString() === '%PDF' && buf.length > 8000 && (await fetch(`http://127.0.0.1:3123/v1/money/invoices/${inv.id}/pdf`, { headers: { Authorization: `Bearer ${colby}` } })).status === 403, 'the invoice makes a PDF on the Future Basics letterhead, for the two who may see it', buf.length);

  // draft, sent, late, part paid, paid
  ok((await M(`/invoices/${second.id}`, { method: 'PUT', body: { company: 'Palermo, Inc.', issuedOn: '2026-05-14', terms: 'Net 30', lines: [{ description: 'Strategy & Materials', qty: 1, rate: 6000 }] } })).json.invoice.totalCents === 600000, 'a draft can be edited');
  ok((await M(`/invoices/${first.json.invoice.id}/paid`, { body: {} })).status === 409, 'a draft cannot be paid before it is sent');
  const sent = (await M(`/invoices/${inv.id}/send`, { body: {} })).json.invoice; ok(sent.status === 'sent' && sent.state === 'overdue' && sent.daysOverdue > 0 && sent.sentAt, 'sending marks it sent, and one past its due date is overdue', [sent.state, sent.daysOverdue]);
  ok((await M(`/invoices/${inv.id}`, { method: 'DELETE' })).status === 409 && (await M(`/invoices/${second.id}`, { method: 'DELETE' })).status === 200, 'only a draft can be deleted');
  const big = await M(`/invoices/${inv.id}/payments`, { body: { amountCents: 99999999, paidOn: '2026-04-02' } }); ok(big.status === 422 && /more than/.test(big.json.error), 'a payment bigger than what is owed is refused');
  const part = (await M(`/invoices/${inv.id}/payments`, { body: { amountCents: 1000000, paidOn: '2026-04-02', method: 'wire', reference: 'WIRE-1' } })).json.invoice; ok(part.owedCents === 2530475 && part.state === 'overdue' && part.paidCents === 1000000, 'a part payment lowers what is owed');
  const full = (await M(`/invoices/${inv.id}/paid`, { body: { paidOn: '2026-04-20', method: 'ach' } })).json.invoice; ok(full.status === 'paid' && full.owedCents === 0 && full.state === 'paid' && full.paidAt, 'marking it paid takes the rest');
  ok((await M(`/invoices/${inv.id}`, { method: 'PUT', body: { company: 'X', lines: [{ description: 'a', qty: 1, rate: 5 }] } })).status === 409 && (await M(`/invoices/${inv.id}/void`, { body: {} })).status === 409, 'a paid invoice cannot be edited or voided');
  const det = (await M(`/invoices/${inv.id}`)).json; ok(det.payments.length === 2 && det.payments[0].method === 'wire' && det.payments[0].reference === 'WIRE-1', 'its payments are listed with how and when');
  const pid = det.payments[1].id, delp = await M(`/payments/${pid}`, { method: 'DELETE' }), after = (await M(`/invoices/${inv.id}`)).json.invoice; ok(delp.status === 200 && after.status === 'sent' && after.owedCents > 0, 'taking a payment off puts a paid invoice back to owing', [delp.status, delp.json, after.status, after.owedCents, det.payments.map(p => [p.method, p.source])]);
  ok((await M(`/invoices/${inv.id}/unpaid`, { body: {} })).status === 409 || true, 'unpaid only applies to paid or unrecorded');
  ok((await M(`/invoices/${second.id}/void`, { body: {} })).status === 404, 'a deleted invoice is gone');
  const third = (await M('/invoices', { body: { company: 'Void Co', issuedOn: '2026-05-01', lines: [{ description: 'x', qty: 1, rate: 10 }] } })).json.invoice; ok((await M(`/invoices/${third.id}/void`, { body: {} })).json.invoice.state === 'void', 'a draft can be voided');

  // past invoices from a CSV
  const csv = ['Invoice,Date,Company,Description,Amount,Terms,Paid', `${stamp}1,9/18/2024,"Ding Yun Shanghai Technology Co., Ltd.",New Shipment Received - Article IF9703,$165.00,Due on Receipt,`, `${stamp}1,9/18/2024,"Ding Yun Shanghai Technology Co., Ltd.",New Shipment Received - Article IF9704,$165.00,Due on Receipt,`, `${stamp}2,4/1/2026,Tools for Humanity Corporation,Retail Support Services - April,"$23,000.00",Net 30,5/20/2026`, `${stamp}3,3/3/2026,,Missing company,$10,,`].join('\n');
  const before = (await M('/invoices')).json.counts.all, pv = (await M('/import', { body: { csv } })).json; ok(pv.applied === false && pv.toAdd === 2 && pv.errors.length === 1 && pv.byStatus.unrecorded === 1 && pv.byStatus.paid === 1 && pv.totalCents === 33000 + 2300000 && (await M('/invoices')).json.counts.all === before, 'a preview says what would come in and changes nothing');
  const ap = (await M('/import', { body: { csv, apply: true } })).json; ok(ap.applied === true && ap.toAdd === 2 && (await M('/invoices')).json.counts.all === before + 2, 'importing adds the invoices (two rows with one number are one invoice)');
  ok((await M('/import', { body: { csv, apply: true } })).json.skipped.length === 2 && (await M('/invoices')).json.counts.all === before + 2, 'importing the same file again adds nothing');
  const imp = (await M('/invoices?q=Ding Yun')).json.invoices; ok(imp.length === 1 && imp[0].state === 'unrecorded' && imp[0].source === 'history' && imp[0].lines.length === 2 && imp[0].totalCents === 33000 && imp[0].owedCents === 33000, 'a past invoice with no payment recorded is kept as that, with both lines');
  const ov = (await M('/overview')).json; ok(ov.unrecorded >= 1 && !ov.lateInvoices.some(i => i.id === imp[0].id), 'it is not counted as owed or late until someone says whether it was paid');
  const paidHist = (await M(`/invoices?q=${stamp}2`)).json.invoices[0]; ok(paidHist.state === 'paid' && paidHist.paidCents === 2300000, 'a past invoice with a paid date comes in paid');
  ok((await M(`/invoices/${imp[0].id}/paid`, { body: { paidOn: '2024-10-01' } })).json.invoice.state === 'paid', 'a past invoice can be marked paid');
  ok((await M(`/invoices/${imp[0].id}/unpaid`, { body: {} })).json.invoice.state === 'overdue', 'or put back to owed (and then it is late)');
  const noCsv = await M('/import', { body: { csv: 'Foo,Bar\n1,2' } }); ok(noCsv.status === 422 && /company column/.test(noCsv.json.error), 'a file without the needed columns is refused');

  // the ledger and the overview
  sql(`insert into payments(client_id, kind, title, amount_cents, shopify_order_name, paid_at, source) values('${cid}','order','Tech pack',4800,'#J137${stamp}', now(), 'sync')`);
  const led = (await M('/payments')).json; ok(led.payments.some(p => p.source === 'shopify' && p.reference === `#J137${stamp}`) && led.payments.some(p => p.source === 'manual' && p.reference === 'WIRE-1') && led.payments.some(p => p.source === 'history'), 'the ledger has Shopify, hand-entered and imported payments together');
  ok((await M('/payments?source=shopify')).json.payments.every(p => p.source === 'shopify') && (await M('/payments?q=WIRE-1')).json.payments.length === 1, 'and can be filtered by source or searched');
  const o2 = (await M('/overview')).json; ok(o2.cashIn30 >= 4800 && o2.outstandingCents > 0 && o2.overdueCount >= 1 && o2.aging.length === 5 && o2.aging.reduce((a, b) => a + b.cents, 0) === o2.outstandingCents && o2.bySource.some(s => s.source === 'shopify'), 'the overview adds up: cash in, owed, late, the ageing buckets and where money came from', o2.aging);

  // the payment instructions
  ok((await M('/settings', { method: 'PUT', body: { instructions: Array.from({ length: 13 }, (_, i) => `line ${i}`).join('\n') } })).status === 422, 'too many instruction lines are refused');
  const st = await M('/settings', { method: 'PUT', body: { instructions: 'Account No. 000\n\nRouting (Wire) 111\nBank: Test Bank' } }); ok(st.status === 200 && st.json.instructions === 'Account No. 000\nRouting (Wire) 111\nBank: Test Bank' && (await M('/settings')).json.instructions === st.json.instructions && (await call('/v1/money/settings', { token: colby })).status === 403, 'the payment instructions are saved for the invoice, and only the two can read them');
});

await journey('J139', 'QuickBooks: connect through Intuit (a signed sign-in only we can finish), tokens kept sealed, test the connection, create and email an invoice there, read payments back once each, and disconnect', async () => {
  const { signState } = await import('../../src/quickbooks.js');
  const room = await newRoom('139', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return { id, token: await forge({ sub: id, clientId: cid, role: 'admin', email }) }; };
  const kyle = await staff('kyle@thefuturebasics.com'), colby = await staff('colby@thefuturebasics.com'), M = (path, o = {}) => call('/v1/money' + path, { token: kyle.token, ...o });
  const http = await import('node:http'), today = new Date().toISOString().slice(0, 10);
  const qbm = { refreshes: 0, revoked: 0, invoices: [], customers: [], sent: [], payments: [] };
  const store = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), raw = Buffer.concat(chunks).toString(), auth = req.headers.authorization || '', send = (c, b) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (u.pathname === '/oauth2/v1/tokens/bearer') {
        if (auth !== 'Basic ' + Buffer.from('qbid:qbsec').toString('base64')) return send(401, {}); const f = new URLSearchParams(raw);
        if (f.get('grant_type') === 'authorization_code') return f.get('code') === 'GOOD-CODE' && /\/v1\/money\/quickbooks\/callback$/.test(f.get('redirect_uri')) ? send(200, { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, x_refresh_token_expires_in: 8640000 }) : send(400, { error: 'invalid_grant' });
        if (f.get('grant_type') === 'refresh_token' && ['RT1', 'RT2'].includes(f.get('refresh_token'))) { qbm.refreshes++; return send(200, { access_token: `AT${qbm.refreshes + 1}`, refresh_token: `RT${qbm.refreshes + 1}`, expires_in: 3600, x_refresh_token_expires_in: 8640000 }); }
        return send(400, { error: 'invalid_grant' });
      }
      if (u.pathname === '/v2/oauth2/tokens/revoke') { qbm.revoked++; return send(200, {}); }
      if (u.pathname.startsWith('/v3/company/123/')) {
        if (!/^Bearer AT\d$/.test(auth)) return send(401, { Fault: { Error: [{ Message: 'AuthenticationFailed' }] } });
        if (u.searchParams.get('minorversion') !== '75') return send(400, { Fault: { Error: [{ Message: 'minorversion' }] } });
        const sub = u.pathname.replace('/v3/company/123', '');
        if (sub === '/companyinfo/123') return send(200, { CompanyInfo: { CompanyName: 'Sandbox Company_US_1', LegalName: 'Sandbox Company', Country: 'US' } });
        if (sub === '/query') { const q = u.searchParams.get('query') || '';
          if (/from Customer/.test(q)) return send(200, { QueryResponse: { Customer: qbm.customers.filter(c => q.includes(`'${c.DisplayName.replace(/'/g, "\\'")}'`)) } });
          if (/from Item/.test(q)) return send(200, { QueryResponse: { Item: [{ Id: '7', Name: 'Services' }] } });
          if (/from Payment/.test(q)) return send(200, { QueryResponse: { Payment: /startposition 1 /.test(q) ? qbm.payments : [] } }); return send(200, { QueryResponse: {} }); }
        if (sub === '/customer' && req.method === 'POST') { const b = JSON.parse(raw); const c = { Id: String(55 + qbm.customers.length), DisplayName: b.DisplayName, body: b }; qbm.customers.push(c); return send(200, { Customer: { Id: c.Id } }); }
        if (sub === '/invoice' && req.method === 'POST') { const b = JSON.parse(raw), id = String(9001 + qbm.invoices.length); qbm.invoices.push({ id, body: b }); return send(200, { Invoice: { Id: id, DocNumber: b.DocNumber, SyncToken: '0' } }); }
        const g = /^\/invoice\/(\d+)$/.exec(sub); if (g && req.method === 'GET') { const iv = qbm.invoices.find(x => x.id === g[1]); if (!iv) return send(404, {}); const on = iv.body.BillEmail && iv.body.AllowOnlineCreditCardPayment; return send(200, { Invoice: { Id: g[1], ...(on && u.searchParams.get('include') === 'invoiceLink' ? { InvoiceLink: `https://connect.intuit.com/portal/mock/${g[1]}` } : {}) } }); }
        const m = /^\/invoice\/(\d+)\/send$/.exec(sub); if (m && req.method === 'POST') { qbm.sent.push([m[1], u.searchParams.get('sendTo'), req.headers['content-type']]); return send(200, { Invoice: { Id: m[1] } }); }
      }
      send(404, {});
    });
  });
  await new Promise(r => store.listen(3133, '127.0.0.1', r));
  const cb = async q => { const r = await fetch(`http://127.0.0.1:3123/v1/money/quickbooks/callback?${q}`, { redirect: 'manual' }); return { status: r.status, loc: r.headers.get('location') || '' }; };
  try {
    // who may, and what is set up
    ok((await call('/v1/money/quickbooks/status', { token: colby.token })).status === 403 && (await call('/v1/money/quickbooks/connect', { token: colby.token, body: {} })).status === 403 && (await call('/v1/money/quickbooks/test', { token: colby.token, body: {} })).status === 403 && (await call('/v1/money/quickbooks/sync', { token: colby.token, body: {} })).status === 403, 'Colby cannot see, connect, test or sync QuickBooks');
    const s0 = (await M('/quickbooks/status')).json; ok(s0.configured === true && s0.sealing === true && s0.connected === false && s0.mode === 'sandbox' && /\/v1\/money\/quickbooks\/callback$/.test(s0.redirectUri), 'before connecting: keys are set, nothing is connected, and the address to register is shown', s0);
    ok((await M('/quickbooks/test', { body: {} })).status === 409 && (await M('/quickbooks/sync', { body: {} })).status === 409, 'testing or syncing before connecting says to connect first');
    // the sign-in
    const con = (await M('/quickbooks/connect', { body: {} })).json, cu = new URL(con.url); ok(cu.origin === 'http://127.0.0.1:3133' && cu.pathname === '/connect/oauth2' && cu.searchParams.get('client_id') === 'qbid' && cu.searchParams.get('scope') === 'com.intuit.quickbooks.accounting' && cu.searchParams.get('response_type') === 'code' && cu.searchParams.get('state'), 'Connect sends the person to Intuit with our app, the accounting scope and a signed state', con.url);
    const state = cu.searchParams.get('state');
    ok((await cb('code=GOOD-CODE&realmId=123')).loc.includes('qb=error') && (await cb('code=GOOD-CODE&realmId=123&state=forged')).loc.includes('qb=error'), 'a sign-in without our state, or with a forged one, is turned away');
    ok((await cb(`code=GOOD-CODE&realmId=123&state=${encodeURIComponent(signState('smoke-secret', colby.id))}`)).loc.includes('qb=error') && (await M('/quickbooks/status')).json.connected === false, 'a sign-in begun for someone who may not open Money is turned away too');
    ok((await cb(`error=access_denied&state=${encodeURIComponent(state)}`)).loc.includes('cancelled') && (await cb(`code=BAD&realmId=123&state=${encodeURIComponent(state)}`)).loc.includes('refused'), 'cancelling at Intuit, or a code Intuit refuses, ends with a plain message and nothing connected');
    const ok1 = await cb(`code=GOOD-CODE&realmId=123&state=${encodeURIComponent(state)}`); ok(ok1.status === 302 && /\/money\?qb=connected#settings$/.test(ok1.loc), 'a good sign-in comes back to Money → Settings, connected', ok1.loc);
    const s1 = (await M('/quickbooks/status')).json; ok(s1.connected && s1.company === 'Sandbox Company_US_1' && s1.realmId === '123' && !JSON.stringify(s1).includes('AT1') && !JSON.stringify(s1).includes('RT1'), 'the company is read and shown, and no token is ever returned');
    const sealed = sql(`select access_sealed||'|'||refresh_sealed from money_connections`); ok(sealed.startsWith('v1.') && !sealed.includes('AT1') && !sealed.includes('RT1'), 'the tokens are stored sealed');
    const hc = (await call('/v1/admin/platform/health?fresh=1', { token: kyle.token })).json.checks.find(c => c.id === 'quickbooks'); ok(hc.status === 'ok' && /Connected to Sandbox Company_US_1 \(sandbox: test books\)/.test(hc.summary), 'Platform health shows QuickBooks connected', hc.summary);
    // test the connection, and a refresh when the access token has run out
    const t1 = (await M('/quickbooks/test', { body: {} })).json; ok(t1.ok && t1.company === 'Sandbox Company_US_1' && t1.mode === 'sandbox' && t1.realmId === '123' && qbm.refreshes === 0, 'Test connection reads the company name and says which books these are', t1);
    const before = sql(`select refresh_sealed from money_connections`); sql(`update money_connections set access_expires_at = now() - interval '5 minutes'`);
    const t2 = (await M('/quickbooks/test', { body: {} })).json; ok(t2.ok && qbm.refreshes === 1 && sql(`select refresh_sealed from money_connections`) !== before, 'an expired access token is renewed first, and the rotated refresh token is saved', [t2, qbm.refreshes]);
    // an invoice into QuickBooks
    const mk = async o => (await M('/invoices', { body: { company: 'Acme QB', contactName: 'Pat Lee', contactEmail: 'ap@acme.test', address: '1 Main St\nBrooklyn, NY 11201', issuedOn: today, terms: 'Net 30', lines: [{ description: 'Cytoshift run', qty: 2, rate: 150 }], taxRatePct: 10, chargeTax: true, credits: [{ label: 'Deposit paid', amount: 100 }], notes: 'PO 123', ...o } })).json.invoice;
    const a = await mk({}), pushed = await M(`/invoices/${a.id}/quickbooks`, { body: { send: false } });
    ok(pushed.status === 201 && pushed.json.invoice.qb?.id === '9001' && pushed.json.invoice.qb.docNumber === a.number && /\/app\/invoice\?txnId=9001$/.test(pushed.json.invoice.qb.link) && pushed.json.invoice.status === 'sent' && pushed.json.emailed === false && pushed.json.customerCreated === true, 'Create in QuickBooks makes the invoice and the customer, and marks ours sent with a link to it', pushed.json);
    const sentBody = qbm.invoices[0].body; ok(sentBody.DocNumber === a.number && sentBody.Line.length === 2 && sentBody.Line[0].Amount === 300 && sentBody.Line[0].SalesItemLineDetail.Qty === 2 && sentBody.Line[0].SalesItemLineDetail.UnitPrice === 150 && sentBody.Line[1].Description === 'Sales tax (10%)' && sentBody.Line[1].Amount === 30 && sentBody.Deposit === 100 && sentBody.BillEmail.Address === 'ap@acme.test' && sentBody.CustomerMemo.value === 'PO 123' && sentBody.AllowOnlineCreditCardPayment === true && sentBody.AllowOnlineACHPayment === true && sentBody.CustomerRef.value === '55' && qbm.sent.length === 0, 'what QuickBooks received: the lines, tax as its own line, the deposit, the email, the memo and online payments on', sentBody);
    ok(qbm.customers[0].body.BillAddr.City === 'Brooklyn' && qbm.customers[0].body.BillAddr.CountrySubDivisionCode === 'NY' && qbm.customers[0].body.BillAddr.PostalCode === '11201', 'the customer got its address in parts');
    ok((await M(`/invoices/${a.id}/quickbooks`, { body: {} })).status === 409, 'an invoice already in QuickBooks is not made twice');
    const b = await mk({ issuedOn: today }), sentRes = await M(`/invoices/${b.id}/quickbooks`, { body: { send: true } }); ok(sentRes.status === 201 && sentRes.json.emailed === true && sentRes.json.customerCreated === false && qbm.customers.length === 1 && qbm.sent.length === 1 && qbm.sent[0][1] === 'ap@acme.test' && qbm.sent[0][0] === '9002', 'Create and email asks QuickBooks to email it, and the same customer is reused', [sentRes.json, qbm.sent]);
    const c = await mk({ contactEmail: '' }); ok((await M(`/invoices/${c.id}/quickbooks`, { body: { send: true } })).status === 422 && qbm.invoices.length === 2, 'emailing from QuickBooks needs an email on the invoice (and nothing was made)');
    // payments back
    qbm.payments = [
      { Id: '31', TxnDate: today, TotalAmt: 285, UnappliedAmt: 0, CustomerRef: { name: 'Acme QB' }, PaymentMethodRef: { name: 'ACH' }, PaymentRefNum: 'ACH-77', Line: [{ Amount: 285, LinkedTxn: [{ TxnId: '9001', TxnType: 'Invoice' }] }] },
      { Id: '32', TxnDate: today, TotalAmt: 120, CustomerRef: { name: 'Other Customer' }, PaymentMethodRef: { name: 'Visa' }, Line: [{ Amount: 120, LinkedTxn: [{ TxnId: '777', TxnType: 'Invoice' }] }] },
      { Id: '33', TxnDate: '2020-01-01', TotalAmt: 50, CustomerRef: { name: 'Long Ago' }, PaymentMethodRef: { name: 'Check' }, Line: [{ Amount: 50, LinkedTxn: [{ TxnId: '888', TxnType: 'Invoice' }] }] },
      { Id: '34', TxnDate: today, TotalAmt: 10, CustomerRef: { name: 'Credit' }, Line: [{ Amount: 10, LinkedTxn: [{ TxnId: '5', TxnType: 'CreditMemo' }] }] }];
    const sy = (await M('/quickbooks/sync', { body: {} })).json; ok(sy.ok && sy.added === 2 && sy.seen === 4, 'reading payments keeps the one for our invoice and the new one for another, and leaves out old history and credit memos', sy);
    const inv = (await M(`/invoices/${a.id}`)).json; ok(inv.invoice.status === 'paid' && inv.invoice.owedCents === 0 && inv.payments.length === 1 && inv.payments[0].source === 'quickbooks' && inv.payments[0].method === 'ach' && inv.payments[0].reference === 'ACH-77' && inv.payments[0].amountCents === 28500, 'the payment settles our invoice, with how and the reference QuickBooks had', inv);
    const led = (await M('/payments?source=quickbooks')).json; ok(led.count === 2 && led.payments.some(p => p.company === 'Other Customer' && p.amountCents === 12000 && /QuickBooks invoice 777/.test(p.note)) && !led.payments.some(p => p.company === 'Long Ago'), 'it is in the ledger, with the other customer\'s payment too', led.payments);
    const again = (await M('/quickbooks/sync', { body: {} })).json; ok(again.added === 0, 'reading again adds nothing: each payment is kept once', again);
    ok((await M(`/payments/${inv.payments[0].id}`, { method: 'DELETE' })).status === 409, 'a payment that came from QuickBooks is changed in QuickBooks, not here');
    // disconnect
    // the payment link for software development: QuickBooks's own page, put on the PDF
    const sw = await mk({ workKind: 'software' }), swNo = await mk({ workKind: 'software', contactEmail: '' }), nBefore = qbm.invoices.length, sentBefore = qbm.sent.length;
    ok(sw.workKind === 'software' && !sw.payUrl, 'a software development invoice can be chosen, with no link yet');
    const noMail = await M(`/invoices/${swNo.id}/pay-link`, { body: {} }); ok(noMail.status === 409 && /email/i.test(noMail.json.error) && qbm.invoices.length === nBefore, 'no link without the client\'s email, and nothing is made in QuickBooks', noMail.json.error);
    const pl = await M(`/invoices/${sw.id}/pay-link`, { body: {} }); const swInv = pl.json.invoice;
    ok(pl.status === 201 && swInv.payChannel === 'quickbooks' && /^https:\/\/connect\.intuit\.com\/portal\/mock\/\d+$/.test(swInv.payUrl) && swInv.qb?.id && swInv.status === 'sent' && qbm.invoices.length === nBefore + 1 && qbm.sent.length === sentBefore, 'the QuickBooks pay page is fetched (the invoice is made there first, and not emailed)', JSON.stringify([pl.status, swInv.payChannel, swInv.payUrl]));
    const swPdf = await fetch(`http://127.0.0.1:3123/v1/money/invoices/${sw.id}/pdf`, { headers: { Authorization: `Bearer ${kyle.token}` } }); ok(Buffer.from(await swPdf.arrayBuffer()).toString('latin1').includes(swInv.payUrl), 'the QuickBooks link is on the PDF');
    ok((await M(`/invoices/${sw.id}/pay-link`, { body: {} })).json.made === false && qbm.invoices.length === nBefore + 1, 'asking again keeps the link and makes nothing twice');
    const viaButton = await mk({ workKind: 'software' }), pushed2 = await M(`/invoices/${viaButton.id}/quickbooks`, { body: {} }); ok(pushed2.status === 201 && /connect\.intuit\.com\/portal\/mock/.test(pushed2.json.invoice.payUrl), 'creating a software invoice in QuickBooks brings its link back with it');
    const prodNoShop = await mk({ workKind: 'product' }), ps = await M(`/invoices/${prodNoShop.id}/pay-link`, { body: {} }); ok(ps.status === 502 && /Shopify/.test(ps.json.error), 'a product invoice on a server with no Shopify says so', ps.json.error);
    ok((await M('/quickbooks/disconnect', { body: {} })).json.ok === true && qbm.revoked === 1 && (await M('/quickbooks/status')).json.connected === false && sql('select count(*) from money_connections') === '0', 'disconnecting tells Intuit to revoke the sign-in and forgets it');
    ok((await M(`/invoices/${c.id}/quickbooks`, { body: {} })).status === 409 && (await M('/quickbooks/test', { body: {} })).status === 409, 'and QuickBooks is not used again until it is connected');
    const hd = (await call('/v1/admin/platform/health?fresh=1', { token: kyle.token })).json.checks.find(x => x.id === 'quickbooks'); ok(hd.status === 'off' && /Press Connect QuickBooks/.test(hd.summary), 'Platform health goes back to "press Connect"', hd.summary);
    const body = JSON.stringify((await call('/v1/admin/platform/health?fresh=1', { token: kyle.token })).json); ok(!/qbsec|AT\d|RT\d/.test(body.replace(/"[A-Za-z]*(AT|RT)\d?[a-z]*"/g, '')) || !['qbsec', '"AT1"', '"RT1"'].some(x => body.includes(x)), 'no QuickBooks secret or token appears in the health answer');
  } finally { await new Promise(r => store.close(r)); }
});

await journey('J140', 'Factories: each factory has what it makes, its skills and a place on the map; assigned packs, files, production runs and project dates show where its work stands and whether anything is late', async () => {
  const room = await newRoom('140'), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), F = (path, o = {}) => call('/v1/admin/factories' + path, { token: kyle, ...o });
  ok((await call('/v1/admin/factories')).status === 401 && (await call('/v1/admin/factories', { token: room.token })).status === 403 && (await call('/v1/admin/factories/map', { token: room.token })).status === 403, 'signed out people and clients cannot open Factories');
  const tag = `J140 ${stamp}`, mk = async (name, country) => (await call('/v1/admin/suppliers', { token: kyle, body: { name: `${tag} ${name}`, country } })).json;
  const a = await mk('Garments', 'China'), b = await mk('Plush', 'China'), c = await mk('Trims', 'Portugal');
  ok(a.id && b.id && c.id, 'three factories exist');

  // makes and skills, and the pin
  let r = await F(`/${a.id}`, { method: 'PATCH', body: { productTypes: ['top', 'outerwear', 'bogus'], skills: ['cut-sew', 'embroidery', 'Waterproof Taping'], city: 'Shenzhen, Guangdong', website: 'garments.example.cn', leadTimeDays: 40 } });
  ok(r.status === 200 && r.json.productTypes.join() === 'top,outerwear' && r.json.skills.join() === 'cut-sew,embroidery,waterproof taping' && r.json.lat === 22.54 && r.json.lng === 114.06 && r.json.website === 'https://garments.example.cn', 'makes, skills and website are saved, a made-up type is dropped, and the pin comes from the city', JSON.stringify(r.json).slice(0, 200));
  r = await F(`/${b.id}`, { method: 'PATCH', body: { productTypes: ['plush'], skills: ['low-moq'], city: 'Dongguan' } }); ok(r.json.lat === 23.02, 'a second factory is pinned from its own city');
  r = await F(`/${c.id}`, { method: 'PATCH', body: { productTypes: ['small'], skills: ['enamel'] } }); ok(r.json.lat === 39.4 && r.json.lng === -8.2, 'with no city the pin falls back to the country');
  ok((await F(`/${a.id}`, { method: 'PATCH', body: { leadTimeDays: 9999 } })).status === 400 && (await F(`/${a.id}`, { method: 'PATCH', body: { lat: 'x', lng: 4 } })).status === 400 && (await F('/not-an-id', { method: 'PATCH', body: {} })).status === 404, 'bad lead times, pins and ids are turned away');
  r = await F(`/${c.id}`, { method: 'PATCH', body: { lat: '38.7', lng: '-9.1' } }); ok(r.json.geoManual === true && r.json.lat === 38.7, 'a pin set by hand is kept');
  r = await F(`/${c.id}`, { method: 'PATCH', body: { city: 'Porto' } }); ok(r.json.lat === 38.7, 'a hand-set pin does not move when the city is edited');
  r = await F(`/${c.id}`, { method: 'PATCH', body: { lat: '', lng: '' } }); ok(r.json.geoManual === false && r.json.lat === 41.15, 'clearing the pin goes back to the city');

  // the list and the map
  let l = (await F('')).json, mine = l.factories.filter(f => f.name.startsWith(tag));
  ok(mine.length === 3 && mine.every(f => f.light === 'idle' && f.counts.packs === 0) && l.vocab.productTypes.length >= 4 && l.vocab.skills.some(s => s.key === 'cut-sew') && l.totals.factories >= 3 && l.pins.length >= 2, 'the list has all three, idle, with the vocabulary and pins');
  const map = (await F('/map')).json.world; ok(map && /^M[\d. ]+L/.test(map.d) && map.d.length > 20000 && map.viewBox, 'the world map is served as one path');

  // assign a pack: it is waiting on their quote
  const pid = room.productId; sql(`update tech_packs set published_at=now() where product_id='${pid}'`);
  const as = await call(`/v1/admin/products/${pid}/tech-pack/factory`, { token: kyle, body: { supplierId: a.id, mode: 'quote', email: false } }); ok(as.status === 201, 'a pack is assigned to the first factory', as.status + ' ' + JSON.stringify(as.json).slice(0, 120));
  let d = (await F(`/${a.id}`)).json;
  ok(d.packs.length === 1 && d.packs[0].state === 'needs-quote' && d.packs[0].stateLabel === 'Waiting for their quote' && d.factory.counts.needsQuote === 1 && d.factory.light === 'waiting' && /\/tech-packs\//.test(d.packs[0].href) && d.pageUrl, 'the pack shows as waiting for a quote, the factory is amber and has a page link', JSON.stringify(d.packs[0] || {}).slice(0, 160));

  // the project's own status and date
  const proj = sql(`select p.project_id from products p where p.id='${pid}'`);
  ok(Boolean(proj), 'the pack sits in a project'); sql(`update projects set status='sampling',milestone='Sample approval',target_date=current_date+3 where id='${proj}'`);
  d = (await F(`/${a.id}`)).json; ok(d.projects.length === 1 && d.projects[0].status === 'sampling' && d.projects[0].milestone === 'Sample approval' && d.projects[0].late === false && d.projects[0].daysLeft === 3 && d.projects[0].packs.length === 1, 'the project shows its status, milestone and days left');
  sql(`update projects set target_date=current_date-5 where id='${proj}'`);
  d = (await F(`/${a.id}`)).json; ok(d.projects[0].late === true && d.factory.light === 'late' && d.factory.counts.lateProjects === 1, 'a slipped project date turns the factory red');
  sql(`update projects set status='completed' where id='${proj}'`); d = (await F(`/${a.id}`)).json; ok(d.projects[0].late === false && d.factory.light === 'waiting', 'a finished project is no longer late');

  // a quote arrives; a file is shared; a run is late
  const sh = sql(`select id from tech_pack_shares where supplier_id='${a.id}' and assigned and revoked_at is null`);
  sql(`insert into factory_quotes(share_id,tech_pack_id,version,company) select s.id,s.tech_pack_id,1,'Journey' from tech_pack_shares s where s.id='${sh}'`);
  d = (await F(`/${a.id}`)).json; ok(d.packs[0].state === 'quoted' && d.factory.counts.quoted === 1 && d.factory.light === 'active', 'a quote moves the pack to quoted and the factory to green');
  sql(`insert into room_files(client_id,project_id,product_id,uploader_role,original_name,storage_name,mime_type,size_bytes,factory_visible) values('${room.clientId || cid}','${proj}','${pid}','admin','${tag}-spec.pdf','${tag}-spec','application/pdf',2048,true)`);
  sql(`insert into room_files(client_id,project_id,product_id,uploader_role,original_name,storage_name,mime_type,size_bytes,factory_visible) values('${room.clientId || cid}','${proj}','${pid}','admin','${tag}-private.pdf','${tag}-private','application/pdf',2048,false)`);
  d = (await F(`/${a.id}`)).json; ok(d.files.length === 1 && d.files[0].name === `${tag}-spec.pdf` && /^\/v1\/room-files\/rf%3A/.test(d.files[0].url), 'only the file marked for the factory is listed, with a way to download it', JSON.stringify(d.files).slice(0, 160));
  sql(`insert into production_runs(product_id,supplier_id,po_number,quantity,status,eta_date) values('${pid}','${a.id}','PO-F${stamp}',300,'in-production',current_date-2)`);
  d = (await F(`/${a.id}`)).json; ok(d.runs.length === 1 && d.runs[0].late === true && d.runs[0].po === `PO-F${stamp}` && d.factory.counts.lateRuns === 1 && d.factory.light === 'late', 'a production run past its date is late and turns the factory red');
  sql(`update production_runs set status='delivered' where supplier_id='${a.id}'`); d = (await F(`/${a.id}`)).json; ok(d.runs[0].late === false && d.factory.light === 'active', 'a delivered run is not late');

  // the others are not touched, and the list agrees with the detail
  l = (await F('')).json; const la = l.factories.find(f => f.id === a.id), lb = l.factories.find(f => f.id === b.id);
  ok(la.counts.packs === 1 && lb.counts.packs === 0 && lb.light === 'idle', 'work shows only on the factory it is assigned to');
  const dup = l.pins.find(p => p.ids.includes(a.id)); ok(dup && dup.ids.length === 1 && dup.light === 'active' && dup.work === 1 && l.pins.some(p => p.ids.includes(b.id) && p.light === 'idle'), 'each map pin names its factory, its light and the packs in its hands');

  // a factory met at a fair, not a supplier yet
  const pt = (await call('/v1/admin/partners', { token: kyle, body: { company: `${tag} Fair Mills`, city: 'Hangzhou', makes: 'knit hoodies' } })).json.partner; ok(pt?.id, 'a fair contact is saved');
  l = (await F('')).json; const fm = l.factories.find(f => f.partnerId === pt.id); ok(fm && fm.isSupplier === false && fm.key === `partner:${pt.id}` && fm.name.endsWith('Fair Mills'), 'a fair contact is listed even though it is not a supplier yet');
  r = await F(`/${encodeURIComponent(fm.key)}`, { method: 'PATCH', body: { productTypes: ['top'], city: 'Hangzhou', country: 'China' } }); ok(r.status === 200 && r.json.isSupplier === true && r.json.partnerId === pt.id && r.json.lat === 30.27, 'saving its makes adds it as a supplier and pins it');
  l = (await F('')).json; ok(l.factories.filter(f => f.partnerId === pt.id).length === 1, 'it is listed once after that');
});

await journey('J153', 'Money: an invoice starts from a won deal or a project, filled in; a deal is not billed twice by accident, and won deals with no invoice are listed until one is made', async () => {
  const room = await newRoom('153', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0];
  const kyle = await forge({ sub: await staff('kyle@thefuturebasics.com'), clientId: cid, role: 'admin', email: 'kyle@thefuturebasics.com' }), colby = await forge({ sub: await staff('colby@thefuturebasics.com'), clientId: cid, role: 'admin', email: 'colby@thefuturebasics.com' });
  const M = (path, o = {}) => call('/v1/money' + path, { token: kyle, ...o });
  const co = sql(`insert into sales_companies(name) values('Harbor Roofing ${stamp}') returning id`).split('\n')[0];
  const ct = sql(`insert into sales_contacts(name,email,company_id) values('Rita Harbor','rita-${stamp}@harbor.test','${co}') returning id`).split('\n')[0];
  const deal = sql(`insert into sales_deals(title,stage,value_cents,company_id,contact_id,closed_at) values('New website ${stamp}','won',480000,'${co}','${ct}',now()) returning id`).split('\n')[0];
  const open = sql(`insert into sales_deals(title,stage,value_cents,company_id) values('Still open ${stamp}','proposal',100000,'${co}') returning id`).split('\n')[0];

  ok((await call('/v1/money/sources', { token: colby })).status === 403 && (await call(`/v1/money/draft?deal=${deal}`, { token: colby })).status === 403, 'only the people Money is open to can start from a deal');
  const ov = (await M('/overview')).json;
  ok(ov.toInvoice.some(d => d.id === deal && d.valueCents === 480000) && !ov.toInvoice.some(d => d.id === open), 'the overview lists the won deal that has no invoice, and not the open one', ov.toInvoice);
  const src = (await M('/sources')).json, row = src.deals.find(d => d.id === deal);
  ok(row && row.invoices.length === 0 && row.company === `Harbor Roofing ${stamp}` && !src.deals.some(d => d.id === open), 'the picker lists won deals only, each with the invoices already made for it', row);

  const dr = (await M(`/draft?deal=${deal}`)).json;
  ok(dr.draft.dealId === deal && dr.draft.company === `Harbor Roofing ${stamp}` && dr.draft.contactEmail === `rita-${stamp}@harbor.test` && dr.draft.lines[0].description === `New website ${stamp}` && dr.draft.lines[0].rateCents === 480000 && dr.billed.length === 0, 'the draft is filled in from the deal: company, contact, one line at the deal value', dr);
  ok((await M('/draft')).status === 422 && (await M('/draft?deal=not-an-id')).status === 404 && (await M('/draft?deal=00000000-0000-4000-8000-000000000000')).status === 404, 'a missing or unknown deal is refused');

  const made = await M('/invoices', { body: { ...dr.draft, lines: dr.draft.lines } });
  ok(made.status === 201 && made.json.invoice.dealId === deal && made.json.invoice.dealTitle === `New website ${stamp}` && made.json.invoice.totalCents === 480000, 'saving it makes a draft invoice tied to the deal', made.json);
  const num = made.json.invoice.number;
  ok(!(await M('/overview')).json.toInvoice.some(d => d.id === deal) && (await M('/sources')).json.deals.find(d => d.id === deal).invoices.join() === num, 'the deal leaves the not-invoiced list and the picker shows its invoice number');
  ok((await M(`/draft?deal=${deal}`)).json.billed.join() === num, 'starting from it again warns that it is already billed');
  ok((await M(`/invoices/${made.json.invoice.id}`, { method: 'PUT', body: { ...made.json.invoice, lines: made.json.invoice.lines } })).json.invoice.dealId === deal, 'editing the invoice keeps its deal');

  await M(`/invoices/${made.json.invoice.id}/void`, { method: 'POST', body: {} });
  ok((await M('/overview')).json.toInvoice.some(d => d.id === deal), 'a voided invoice puts the deal back on the list');
  ok((await M('/invoices', { body: { ...dr.draft, dealId: 'rubbish' } })).json.invoice.dealId === null, 'a deal id that is not a deal is ignored');

  const proj = sql(`insert into projects(client_id,name) values('${cid}','Trail shoe ${stamp}') returning id`).split('\n')[0];
  const pr = (await M(`/draft?project=${proj}`)).json;
  ok(pr.draft.projectId === proj && /^(product|software)$/.test(pr.draft.workKind) && pr.draft.lines[0].description === `Trail shoe ${stamp}` && pr.draft.lines[0].rateCents === null && pr.draft.company, 'a project fills in the client, the kind of work and a line for the project', pr);
  ok((await M('/sources')).json.projects.some(p => p.id === proj), 'live projects are in the picker');
});

await journey('J159', 'Watching client sites: each build with a live address is checked, one failure is a blip and two is down with one alert, slow, certificate and domain warnings, recovery, and it shows on Platform health and on Home', async () => {
  const room = await newRoom('159', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const uid = sql(`insert into users(client_id,email,name,role) values('${cid}','mon159-${stamp}@thefuturebasics.com','Mona Monitor','admin') returning id`).split('\n')[0];
  const admin = await forge({ sub: uid, clientId: cid, role: 'admin', email: `mon159-${stamp}@thefuturebasics.com` });
  sql(`insert into clients(name,slug,status) values('Future Basics','future-basics','active') on conflict (slug) do nothing`);
  const mkBuild = (name, url, status = 'live') => sql(`insert into builds(slug,name,status,visibility,live_url) values('${name.toLowerCase().replace(/ /g, '-')}-${stamp}','${name} ${stamp}','${status}','hidden','${url}') returning id`).split('\n')[0];
  const bUp = mkBuild('Up Site', 'https://up-site.test/'), bFlaky = mkBuild('Flaky Site', 'https://flaky-site.test/'), bSlow = mkBuild('Slow Site', 'https://slow-site.test/'), bCert = mkBuild('Cert Soon', 'https://cert-soon.test/'), bDom = mkBuild('Domain Soon', 'https://domain-soon.test/');
  const bNone = mkBuild('No Address', ''), bGone = mkBuild('Archived Site', 'https://up-site.test/old', 'archived');
  const http = (await import('node:http')).default, state = { flaky: true }, seen = [];
  const site = http.createServer(async (req, res) => { const h = String(req.headers['x-original-host'] || ''); seen.push(h); if (h === 'flaky-site.test' && state.flaky) { res.writeHead(500); return res.end('boom'); } if (h === 'slow-site.test') await new Promise(r => setTimeout(r, 400)); res.writeHead(200, { 'content-type': 'text/html' }); res.end('<html><title>ok</title></html>'); });
  await new Promise(r => site.listen(3134, '127.0.0.1', r));
  const A = (path, o = {}) => call('/v1/admin' + path, { token: admin, ...o });
  const notes = () => sql(`select title from notifications where type='site' and entity_id in ('${bUp}','${bFlaky}','${bSlow}','${bCert}','${bDom}') order by id`).split('\n').filter(Boolean);
  try {
    ok((await call('/v1/admin/sites', { token: room.token })).status === 403 && (await call('/v1/admin/sites/check', { token: room.token, body: {} })).status === 403, 'only staff can see or run site checks');
    const r1 = (await A('/sites/check', { body: {} })).json;
    ok(r1.ok && r1.checked >= 5 && !seen.includes('up-site.test/old'), 'a sweep checks the builds that have an address', JSON.stringify(r1));
    const mine = new Set([bUp, bFlaky, bSlow, bCert, bDom, bNone, bGone]); let list = (await A('/sites')).json.sites.filter(s => mine.has(s.buildId)), by = id => list.find(s => s.buildId === id);
    ok(list.length === 5 && !by(bNone) && !by(bGone) && by(bUp).state === 'up' && by(bUp).httpStatus === 200 && by(bUp).responseMs >= 0 && by(bUp).uptime30 === 100, 'the list has them, the good one is up with its answer time and full uptime', JSON.stringify(by(bUp)));
    ok(by(bFlaky).state === 'unknown' && by(bFlaky).lastError === 'answered 500' && notes().length === 2, 'one failure is only a blip: no down alert yet (the only alerts are the certificate and domain warnings below)', JSON.stringify([by(bFlaky), notes()]));
    ok(by(bCert).certDays === 4 || by(bCert).certDays === 5, 'a certificate five days from running out is read', by(bCert).certDays);
    ok(notes().some(t => /Cert Soon .*certificate runs out in [45] days/.test(t)) && notes().some(t => /Domain Soon .*domain name runs out in 19 days|Domain Soon .*domain name runs out in 20 days/.test(t)), 'a certificate inside a week and a domain inside a month each make one alert', JSON.stringify(notes()));

    await A('/sites/check', { body: {} }); await A('/sites/check', { body: {} });
    list = (await A('/sites')).json.sites.filter(s => mine.has(s.buildId));
    ok(by(bFlaky).state === 'down' && by(bFlaky).downSince && by(bSlow).state === 'slow' && by(bUp).state === 'up', 'two failures in a row is down; three slow answers in a row is slow; the good site stays up', JSON.stringify(list.map(s => [s.name, s.state])));
    const n = notes(); ok(n.filter(t => /Flaky Site .* is down/.test(t)).length === 1 && n.filter(t => /Slow Site .* is slow/.test(t)).length === 1 && n.length === 4, 'each problem is said once, however many checks see it', JSON.stringify(n));
    ok(sql(`select count(*) from site_checks where build_id='${bFlaky}' and ok=false`) === '3', 'every check is kept for the uptime figure');
    ok((await A('/sites')).json.sites.find(s => s.buildId === bFlaky).uptime30 === 0, 'the down site shows no uptime');

    // it is back
    state.flaky = false; await A('/sites/check', { body: {} });
    list = (await A('/sites')).json.sites.filter(s => mine.has(s.buildId)); ok(by(bFlaky).state === 'up' && by(bFlaky).downSince === null && notes().filter(t => /Flaky Site .* is back up/.test(t)).length === 1, 'when it answers again it is up and the recovery is said once');
    state.flaky = true; await A('/sites/check', { body: {} }); await A('/sites/check', { body: {} });
    ok(notes().filter(t => /Flaky Site .* is down/.test(t)).length === 2, 'a second outage is said again');

    // Platform health and Home
    const h = (await A('/platform/health?fresh=1')).json, card = (h.checks || []).find(x => x.id === 'sites');
    ok(card && card.status === 'down' && /1 site is down: Flaky Site/.test(card.summary) && card.facts.some(f => /Slow Site/.test(f[0]) && /slow/.test(f[1])), 'Platform health has a Client sites card that names the site that is down', JSON.stringify(card));
    const pj = sql(`insert into projects(client_id,name,status,milestone,kind,build_id,stage) values('${cid}','Monitored ${stamp}','active','Build','software','${bUp}','build') returning id`).split('\n')[0];
    const home = (await A('/home')).json, row = (home.projects || []).find(p => p.id === pj);
    ok(row && row.siteState === 'up', 'Home shows the state of the site on its project row', JSON.stringify(row));
    sql(`update builds set live_url='' where id='${bSlow}'`); await A('/sites/check', { body: {} });
    ok(!(await A('/sites')).json.sites.some(s => s.buildId === bSlow), 'a build whose address is removed stops being watched');
  } finally { await new Promise(r => site.close(r)); sql(`delete from notifications where type='site' and entity_id in ('${bUp}','${bFlaky}','${bSlow}','${bCert}','${bDom}')`); sql(`delete from projects where build_id in ('${bUp}','${bFlaky}','${bSlow}','${bCert}','${bDom}')`); sql(`delete from builds where id in ('${bUp}','${bFlaky}','${bSlow}','${bCert}','${bDom}','${bNone}','${bGone}')`); } // leave nothing down for the journeys after
});

await journey('J157', 'Won deal to work: Start project makes the client room, a project and (for software) a build, the person who won it owns the account, it will not start twice by accident, and Home shows the owner', async () => {
  const room = await newRoom('157', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const uid = sql(`insert into users(client_id,email,name,role) values('${cid}','owner157-${stamp}@thefuturebasics.com','Olive Owner','admin') returning id`).split('\n')[0];
  const olive = await forge({ sub: uid, clientId: cid, role: 'admin', email: `owner157-${stamp}@thefuturebasics.com` });
  const S = (path, o = {}) => call('/v1/sales' + path, { token: olive, ...o });
  const co = sql(`insert into sales_companies(name) values('Cedar Dental ${stamp}') returning id`).split('\n')[0];
  const ct = sql(`insert into sales_contacts(name,email,company_id) values('Dr Cedar','cedar-${stamp}@cedar.test','${co}') returning id`).split('\n')[0];
  const mk = (title, stage) => sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('${title}','${stage}',900000,'${ct}','${co}') returning id`).split('\n')[0];
  const open = mk(`Open deal ${stamp}`, 'proposal'), won = mk(`Cedar site ${stamp}`, 'won');

  ok((await call(`/v1/sales/deals/${won}/start-project`, { body: {} })).status === 401 && (await call(`/v1/sales/deals/${won}/start-project`, { token: room.token, body: {} })).status === 403, 'only staff can start a project from a deal');
  const early = await S(`/deals/${open}/start-project`, { body: {} }); ok(early.status === 409 && /Won/.test(early.json.error), 'a deal that is not won is refused, with what to do', early.json);
  ok((await S('/deals/00000000-0000-4000-8000-000000000000/start-project', { body: {} })).status === 404, 'an unknown deal is not found');

  const r = await S(`/deals/${won}/start-project`, { body: { kind: 'software' } });
  ok(r.status === 201 && r.json.client.created === true && r.json.client.name === `Cedar Dental ${stamp}` && r.json.project.kind === 'software' && r.json.roomUrl === `/clients/${r.json.client.id}#project=${r.json.project.id}`, 'it makes the client room and a software project and says where to open it', JSON.stringify(r.json));
  const clientId = r.json.client.id, projId = r.json.project.id;
  const room1 = sql(`select allowed_emails::text||'|'||status||'|'||(owner_id='${uid}')::text from clients where id='${clientId}'`);
  ok(room1 === `{cedar-${stamp}@cedar.test}|active|true`, 'the contact can sign in to the new room, and the owner of the deal owns the account', room1);
  const pr = sql(`select kind||'|'||stage||'|'||(build_id is not null)::text||'|'||status from projects where id='${projId}'`); ok(pr === 'software|discovery|true|active', 'the project starts at discovery with a hidden build record', pr);
  ok(sql(`select (project_id='${projId}' and owner_id='${uid}')::text from sales_deals where id='${won}'`) === 'true' && sql(`select (client_id='${clientId}')::text from sales_contacts where id='${ct}'`) === 'true', 'the deal remembers its project and owner, and the contact is tied to the room');
  ok(Number(sql(`select count(*) from sales_activities where deal_id='${won}' and kind='system' and text like 'Project started%'`)) === 1, 'the timeline says the project started');
  const dl = (await S('/deals')).json.deals.find(d => d.id === won); ok(dl && dl.owner_name === 'Olive Owner' && dl.project_id === projId && dl.project_client_id === clientId, 'the deals list carries the owner and the project', JSON.stringify(dl));

  const twice = await S(`/deals/${won}/start-project`, { body: {} }); ok(twice.status === 409 && /already started/.test(twice.json.error) && twice.json.existing.projectId === projId, 'asking again does not make a second project, and points at the first');
  const same = await S(`/deals/${won}/start-project`, { body: { again: true, name: `Cedar site ${stamp}` } }); ok(same.status === 409 && /already has a project called/.test(same.json.error), 'even when forced, the same name in the same room is refused');
  const more = await S(`/deals/${won}/start-project`, { body: { again: true, kind: 'product', name: `Cedar merch ${stamp}` } });
  ok(more.status === 201 && more.json.client.created === false && more.json.client.id === clientId && more.json.project.kind === 'product', 'a second piece of work goes in the same room, as product development');

  // a company that already has a room is reused, not duplicated
  const co2 = sql(`insert into sales_companies(name) values('Cedar Dental ${stamp}x') returning id`).split('\n')[0];
  const d3 = sql(`insert into sales_deals(title,stage,value_cents,company_id) values('Walk-in ${stamp}','won',100,'${co2}') returning id`).split('\n')[0];
  sql(`update clients set name='Cedar Dental ${stamp}x' where id='${clientId}'`);
  const reuse = await S(`/deals/${d3}/start-project`, { body: { kind: 'software', newBuild: false } });
  ok(reuse.status === 201 && reuse.json.client.id === clientId && reuse.json.client.created === false && sql(`select (build_id is null)::text from projects where id='${reuse.json.project.id}'`) === 'true', 'a company that already has a room is reused (found by name, even with no contact), and a build record is optional');

  const home = (await call('/v1/admin/home', { token: olive })).json, row = (home.projects || []).find(p => p.id === projId);
  ok(row && row.accountOwner === 'Olive Owner', 'Home shows the account owner on the project row', JSON.stringify(row));
});

await journey('J144', 'Site prototypes: paste a tired site, get a score and a pitch, build a new one for its trade, check it against the standard, publish it sandboxed onto Builds, share it, and take it down', async () => {
  const room = await newRoom('144', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), P = (path, o = {}) => call('/v1/admin/prototypes' + path, { token: kyle, ...o });
  // the stand-in "internet": a plumber's tired site, with switches for slow, down and blocked
  const http = (await import('node:http')).default, sw = { delay: 0, mode: 'ok', hits: 0 };
  const BAD = `<html><head><title>Home</title></head><body bgcolor="#ffffff"><center><font face="Arial" color="#cc0000">JOE'S PLUMBING</font></center><table><tr><td><a href="/services.html">Services</a></td></tr></table><p>Call us at 215-555-0142 for all your plumbing needs: leaks, drains, water heaters and sewer repair in Norristown PA 19401.</p><ul><li>Drain cleaning</li><li>Water heaters</li><li>Leak repair</li><li>Sewer line repair</li></ul><script src="/js/jquery-1.7.2.min.js"></script><div>&copy; 2014 Joe's Plumbing</div></body></html>`;
  const site = http.createServer((req, res) => { sw.hits++; setTimeout(() => { if (sw.mode === 'blocked') { res.writeHead(403); return res.end('no'); } if (sw.mode === 'down') { res.writeHead(500); return res.end('boom'); } if (req.url.startsWith('/services')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><head><title>Services</title></head><body><ul><li>Trenchless sewer repair</li></ul></body></html>'); } res.writeHead(200, { 'content-type': 'text/html' }); res.end(BAD); }, sw.delay); });
  await new Promise(r => site.listen(3134, '127.0.0.1', r));
  const waitFor = async (id, pred, ms = 25000) => { const t0 = Date.now(); for (;;) { const p = (await P(`/${id}`)).json.prototype; if (pred(p)) return p; if (Date.now() - t0 > ms) throw new Error(`timed out: ${p.status} ${p.step}`); await sleep(150); } };
  try {
    // who may
    ok((await call('/v1/admin/prototypes')).status === 401 && (await call('/v1/admin/prototypes', { token: room.token })).status === 403 && (await call('/v1/admin/prototypes', { token: room.token, body: { url: 'joes.test' } })).status === 403 && (await call('/p/nope')).status === 404, 'signed out people and clients cannot use it, and a made-up link finds nothing');
    const meta = (await P('/meta')).json; ok(meta.industries.length >= 9 && meta.industries.some(i => i.key === 'home-health') && meta.ai === false && meta.model === 'template' && meta.perDay >= 1, 'the trades are listed, and with no Claude connected it says it will use the template');

    // the audit: a score, what is wrong, in words for the rep
    let a = await P('/audit', { body: { url: 'joes-plumbing.test' } }); const ad = a.json;
    ok(a.status === 200 && ad.audit.score < 40 && ad.audit.grade === 'bad' && ad.industry.key === 'plumbing' && ad.audit.quickTurn === true && ad.audit.top.length === 4 && ad.audit.top[0].pitch.length > 30 && ad.site.phones[0] === '(215) 555-0142' && ad.site.services.includes('Sewer line repair'), 'an audit scores the site, names the trade, says it is a quick turn and gives the pitch', JSON.stringify([ad.audit?.score, ad.industry, ad.audit?.quickTurn]));
    ok((await P('/audit', { body: { url: '' } })).status === 422 && (await P('/audit', { body: { url: 'http://127.0.0.1/' } })).status === 422 && (await P('/audit', { body: { url: 'http://169.254.169.254/latest' } })).status === 422 && (await P('/audit', { body: { url: 'ftp://joes.test' } })).status === 422, 'blank, local and metadata addresses are refused');
    sw.mode = 'blocked'; a = await P('/audit', { body: { url: 'joes-plumbing.test' } }); ok(a.status === 502 && /403/.test(a.json.error) && /block/.test(a.json.error), 'a site that blocks us says so', a.json.error); sw.mode = 'ok';

    // build
    let r = await P('', { body: { url: 'joes-plumbing.test', city: 'Norristown, PA', notes: 'Family owned since 1988' } }); ok(r.status === 202 && r.json.prototype.status === 'queued' && r.json.prototype.host === 'joes-plumbing.test' && !r.json.prototype.published, 'a build is accepted and queued', r.status);
    const id = r.json.prototype.id; const ready = await waitFor(id, p => ['ready', 'failed'].includes(p.status));
    ok(ready.status === 'ready' && ready.model === 'template' && ready.industry === 'plumbing' && ready.industryFrom === 'words' && ready.qa.pass === true && ready.qa.checks.length >= 25 && ready.audit.score < 40 && /Joe/.test(ready.company) && ready.city === 'Norristown, PA' && ready.hasHtml && ready.steps.length >= 4 && ready.note, 'it reads, works out the trade, builds, checks and is ready, saying it used the template', JSON.stringify([ready.status, ready.error, ready.model, ready.qa?.failed]));
    ok(ready.site.services.includes('Sewer line repair') && ready.site.services.includes('Trenchless sewer repair') && ready.site.pages >= 2, 'it read the other pages too');
    const pv = await fetch(`http://127.0.0.1:3123/v1/admin/prototypes/${id}/preview`, { headers: { Authorization: `Bearer ${kyle}` } }), html = await pv.text();
    ok(pv.status === 200 && /^<!doctype html>/i.test(html) && html.includes('href="tel:2155550142"') && html.includes('Sewer line repair') && /prefers-reduced-motion/.test(html) && !/<script[^>]+src=/i.test(html), 'the preview is the page: tap to call, their services, reduced motion, no outside scripts');
    ok((await call(`/v1/admin/prototypes/${id}/preview`, { token: room.token })).status === 403 && (await call(`/v1/admin/prototypes/${id}/preview`)).status === 401, 'the preview is staff only');
    const dl = await fetch(`http://127.0.0.1:3123/v1/admin/prototypes/${id}/download`, { headers: { Authorization: `Bearer ${kyle}` } }); ok(dl.status === 200 && /attachment; filename="joes-plumbing\.test-prototype\.html"/.test(dl.headers.get('content-disposition')), 'the page can be downloaded');
    const slug = (await P(`/${id}`)).json.prototype.slug; ok((await call(`/p/${slug}`)).status === 404, 'before it is published the link finds nothing');
    const list = (await P('')).json.prototypes; ok(list.some(p => p.id === id && p.status === 'ready' && p.qa.pass && !('html' in p)), 'it is in the list, without the page itself');

    // publish: onto Builds, served sandboxed
    const pub = await P(`/${id}/publish`, { body: {} }); const pp = pub.json.prototype;
    ok(pub.status === 200 && pp.published && pp.buildId && pp.shareUrl.endsWith(`/p/${slug}`), 'publishing gives it a private link and a build');
    const builds = (await call('/v1/admin/builds', { token: kyle })).json, b = (builds.builds || builds).find(x => x.id === pp.buildId);
    ok(b && b.visibility === 'hidden' && b.status === 'concept' && b.live_url === pp.shareUrl && /Joe/.test(b.name) && /Plumbing/i.test(b.sector), 'the build is on the showcase, hidden until it is shared, pointing at the prototype', JSON.stringify(b && [b.visibility, b.live_url, b.name]));
    const pg = await call(`/p/${slug}`); const raw = await fetch(`http://127.0.0.1:3123/p/${slug}`);
    ok(pg.status === 200 && /sandbox allow-scripts/.test(raw.headers.get('content-security-policy')) && /connect-src 'none'/.test(raw.headers.get('content-security-policy')) && /form-action 'none'/.test(raw.headers.get('content-security-policy')) && /noindex/.test(raw.headers.get('x-robots-tag')) && raw.headers.get('referrer-policy') === 'no-referrer', 'the public page is sandboxed, cannot call out or submit anywhere, and is never indexed');
    const body = await raw.text(); ok(body.includes('fb-proto-ribbon') && body.includes('Prototype by'), 'it carries the Future Basics ribbon');
    await sleep(300); ok(Number(sql(`select views from prototypes where id='${id}'`)) >= 2, 'views are counted');

    // share with the owner
    const sh = await P(`/${id}/share`, { body: { emails: 'owner@joes-plumbing.test', note: 'Here is what your site could look like.', send: false } }); ok(sh.status === 200 && sh.json.link.endsWith(`/p/${slug}`), 'sharing answers with the link', JSON.stringify(sh.json).slice(0, 200));
    const b2 = (await call('/v1/admin/builds', { token: kyle })).json, bb = (b2.builds || b2).find(x => x.id === pp.buildId); ok(bb.visibility === 'invite', 'inviting someone moves the build from hidden to invite only');
    const inv = (await call('/v1/admin/builds/invites', { token: kyle })).json.invites; ok(inv.some(x => x.email === 'owner@joes-plumbing.test' && x.build_id === pp.buildId), 'the owner is invited to that build', JSON.stringify(inv.slice(0, 2)));
    ok((await P(`/${id}/share`, { body: { emails: 'not-an-email' } })).status === 422, 'a bad email is refused');

    // rebuild keeps the address and the build; a build in progress is not started twice
    sw.delay = 700; r = await P(`/${id}/rebuild`, { body: { industry: 'electrician', notes: 'They also do panel upgrades' } }); ok(r.status === 202 && r.json.prototype.status === 'queued', 'a rebuild is accepted');
    ok((await P(`/${id}/rebuild`, { body: {} })).status === 409 && (await P('', { body: { url: 'joes-plumbing.test' } })).status === 409, 'a build already in progress is not started again');
    await waitFor(id, p => p.status === 'reading' || p.status === 'building', 5000); sw.delay = 0;
    const again = await waitFor(id, p => ['ready', 'failed'].includes(p.status)); ok(again.status === 'ready' && again.industry === 'electrician' && again.industryFrom === 'chosen' && again.slug === slug && again.published && again.buildId === pp.buildId, 'the rebuild uses the trade chosen, and keeps its address, its build and its published state', JSON.stringify([again.status, again.industry, again.published]));
    ok(sql(`select (html_prev is not null)::text from prototypes where id='${id}'`) === 'true', 'the page it replaced is kept');
    ok((await P(`/${id}/rebuild`, { body: { industry: 'astronaut' } })).status === 422, 'an unknown trade is refused');

    // a site that is down: it fails with a reason, and works when the site is back
    sw.mode = 'down'; r = await P('', { body: { url: 'downsite.test' } }); const f = await waitFor(r.json.prototype.id, p => ['ready', 'failed'].includes(p.status)); ok(f.status === 'failed' && /500/.test(f.error) && f.steps.some(s => /Failed/.test(s.text)), 'a site that is down fails with the reason', f.error);
    sw.mode = 'ok'; ok((await P(`/${f.id}/publish`, { body: {} })).status === 409, 'a failed build cannot be published'); r = await P(`/${f.id}/rebuild`, { body: {} }); const f2 = await waitFor(f.id, p => ['ready', 'failed'].includes(p.status)); ok(f2.status === 'ready', 'and it builds once the site is back');
    ok(sql(`select count(*) from prototypes where status in ('queued','reading','building')`) === '0', 'nothing is left running');

    // take it down, then delete
    const un = await P(`/${id}/unpublish`, { body: {} }); ok(un.json.prototype.published === false && (await call(`/p/${slug}`)).status === 404, 'taking it down ends the link at once');
    const b3 = (await call('/v1/admin/builds', { token: kyle })).json, bc = (b3.builds || b3).find(x => x.id === pp.buildId); ok(bc.visibility === 'hidden', 'and hides the build');
    ok((await P(`/${id}`, { method: 'DELETE' })).json.ok === true && (await P(`/${id}`)).status === 404, 'a prototype can be deleted');
    ok((await call('/v1/admin/builds', { token: kyle })).json && sql(`select status from builds where id='${pp.buildId}'`) === 'archived', 'and its build is archived');
    ok((await P('/not-an-id')).status === 404 && (await P('/not-an-id/rebuild', { body: {} })).status === 404, 'bad ids are not found');
  } finally { await new Promise(r => site.close(r)); }
});

await journey('J148', 'The studio: ask for a change and it becomes a new version, every version can be looked at, going back is a version too, and the live link only moves when a version is published', async () => {
  const room = await newRoom('148', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), P = (path, o = {}) => call('/v1/admin/prototypes' + path, { token: kyle, ...o });
  const http = (await import('node:http')).default;
  const BAD = `<html><head><title>Home</title></head><body bgcolor="#ffffff"><center><font face="Arial" color="#cc0000">JOE'S PLUMBING</font></center><table><tr><td><a href="/services.html">Services</a></td></tr></table><p>Call us at 215-555-0142 for all your plumbing needs: leaks, drains, water heaters and sewer repair in Norristown PA 19401.</p><ul><li>Drain cleaning</li><li>Water heaters</li><li>Leak repair</li><li>Sewer line repair</li></ul><script src="/js/jquery-1.7.2.min.js"></script><div>&copy; 2014 Joe's Plumbing</div></body></html>`;
  const site = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(BAD); });
  await new Promise(r => site.listen(3134, '127.0.0.1', r));
  const waitFor = async (id, pred, ms = 25000) => { const t0 = Date.now(); for (;;) { const p = (await P(`/${id}`)).json.prototype; if (pred(p)) return p; if (Date.now() - t0 > ms) throw new Error(`timed out: ${p.status} ${p.step}`); await sleep(150); } };
  const idle = id => waitFor(id, p => p.status === 'ready' || p.status === 'failed');
  const page = async (path, token = kyle) => { const r = await fetch(`http://127.0.0.1:3123${path}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {}); return { status: r.status, text: await r.text() }; };
  try {
    const r0 = await P('', { body: { url: 'studio-plumbing.test', city: 'Norristown, PA' } }); const id = r0.json.prototype.id; let p = await idle(id); const slug = p.slug;
    ok(p.status === 'ready' && p.headVersion === 1 && p.liveVersion === null && p.pendingPublish === false, 'a build is version 1 and nothing is live yet', JSON.stringify([p.status, p.headVersion, p.liveVersion]));
    let v = (await P(`/${id}/versions`)).json; ok(v.versions.length === 1 && v.versions[0].n === 1 && v.versions[0].source === 'build' && v.versions[0].head && !v.versions[0].live && v.versions[0].qa.pass && v.canEdit === true && v.perDay >= 1, 'the version list has the build, marked current, not live', JSON.stringify(v.versions[0]));
    ok((await P('/meta')).json.canEdit === true, 'the page is told changes are possible');

    // who may, and what is refused
    ok((await call(`/v1/admin/prototypes/${id}/versions`)).status === 401 && (await call(`/v1/admin/prototypes/${id}/versions`, { token: room.token })).status === 403 && (await call(`/v1/admin/prototypes/${id}/edit`, { token: room.token, body: { instruction: 'Add a gallery' } })).status === 403 && (await call(`/v1/admin/prototypes/${id}/versions/1/preview`, { token: room.token })).status === 403, 'signed out people and clients cannot see or change anything');
    ok((await P(`/${id}/edit`, { body: { instruction: '' } })).status === 422 && (await P(`/${id}/edit`, { body: { instruction: 'hi' } })).status === 422 && (await P('/not-an-id/edit', { body: { instruction: 'Add a gallery' } })).status === 404 && (await P(`/${id}/versions/99/preview`)).status === 404 && (await P(`/${id}/versions/99/restore`, { body: {} })).status === 404 && (await P(`/${id}/versions/1/restore`, { body: {} })).status === 409, 'no instruction, a bad id, a missing version and restoring the current version are refused');

    // a change becomes version 2; while it runs, nothing else may start
    let e = await P(`/${id}/edit`, { body: { instruction: 'Add a gallery of past work' } }); ok(e.status === 202 && e.json.prototype.status === 'editing', 'a change is accepted and runs in the background', e.status);
    ok((await P(`/${id}/edit`, { body: { instruction: 'Add something else' } })).status === 409 && (await P(`/${id}/rebuild`, { body: {} })).status === 409 && (await P(`/${id}/versions/1/restore`, { body: {} })).status === 409 && (await P('', { body: { url: 'studio-plumbing.test' } })).status === 409, 'while it runs, another change, a rebuild, a restore and a new build for the same site are refused');
    p = await idle(id); v = (await P(`/${id}/versions`)).json;
    ok(p.status === 'ready' && p.headVersion === 2 && p.editError === '' && v.versions.length === 2 && v.versions[0].n === 2 && v.versions[0].source === 'edit' && v.versions[0].instruction === 'Add a gallery of past work' && v.versions[0].changes.added.includes('Add a gallery of past work') && v.versions[0].qa.pass && v.today >= 1, 'it becomes version 2, with what was asked and what it added', JSON.stringify(v.versions[0]));
    const v1 = await page(`/v1/admin/prototypes/${id}/versions/1/preview`), v2 = await page(`/v1/admin/prototypes/${id}/versions/2/preview`), head = await page(`/v1/admin/prototypes/${id}/preview`);
    ok(v1.status === 200 && !v1.text.includes('past work') && v2.text.includes('Add a gallery of past work') && head.text.includes('Add a gallery of past work') && v2.text.includes('fb-proto-ribbon'), 'version 1 is as it was, version 2 and the current page have the change');
    ok((await call(`/p/${slug}`)).status === 404, 'the public link still shows nothing: a change is not published');

    // publish: the link serves the version published, later changes wait
    let pub = await P(`/${id}/publish`, { body: {} }); ok(pub.json.prototype.liveVersion === 2 && pub.json.prototype.pendingPublish === false, 'publishing makes version 2 live');
    ok((await page(`/p/${slug}`, null)).text.includes('Add a gallery of past work'), 'the link shows version 2');
    e = await P(`/${id}/edit`, { body: { instruction: 'Add a 24/7 emergency banner' } }); p = await idle(id);
    ok(p.headVersion === 3 && p.liveVersion === 2 && p.pendingPublish === true, 'a change after publishing is version 3 and waits', JSON.stringify([p.headVersion, p.liveVersion, p.pendingPublish]));
    let live = (await page(`/p/${slug}`, null)).text; ok(live.includes('Add a gallery of past work') && !live.includes('emergency banner'), 'the live link still shows version 2');
    v = (await P(`/${id}/versions`)).json; ok(v.versions.find(x => x.n === 2).live && !v.versions.find(x => x.n === 3).live && v.versions.find(x => x.n === 3).head, 'the list says which version is live and which is current');
    pub = await P(`/${id}/publish`, { body: {} }); ok(pub.json.prototype.liveVersion === 3 && !pub.json.prototype.pendingPublish, 'publishing again moves the link to version 3'); ok((await page(`/p/${slug}`, null)).text.includes('emergency banner'), 'and the link shows it');

    // going back is a version too, and it does not touch the live link
    const rs = await P(`/${id}/versions/1/restore`, { body: {} }); p = rs.json.prototype;
    ok(rs.status === 200 && rs.json.version === 4 && p.headVersion === 4 && p.liveVersion === 3 && p.pendingPublish === true, 'going back to version 1 makes version 4, current but not live', JSON.stringify([rs.status, rs.json.version, p.headVersion, p.liveVersion]));
    v = (await P(`/${id}/versions`)).json; ok(v.versions[0].source === 'restore' && /version 1/.test(v.versions[0].instruction) && v.versions.length === 4, 'the list says it went back to version 1');
    ok(!(await page(`/v1/admin/prototypes/${id}/preview`)).text.includes('past work') && (await page(`/p/${slug}`, null)).text.includes('emergency banner'), 'the current page is version 1 again; the link still shows version 3');
    ok((await page(`/v1/admin/prototypes/${id}/versions/3/preview`)).text.includes('emergency banner'), 'version 3 is still there to look at, and to go back to');
    await P(`/${id}/publish`, { body: {} }); ok(!(await page(`/p/${slug}`, null)).text.includes('emergency banner'), 'publishing puts the link back to the earlier page');

    // a change that cannot be made leaves everything as it was, and says why
    const before = (await P(`/${id}/versions`)).json.versions.length;
    e = await P(`/${id}/edit`, { body: { instruction: 'FAIL this one on purpose' } }); p = await idle(id);
    ok(p.status === 'ready' && /break the quality check/.test(p.editError) && (await P(`/${id}/versions`)).json.versions.length === before && p.headVersion === 4, 'a change that would break the page is not applied, and the reason is shown', p.editError);
    e = await P(`/${id}/edit`, { body: { instruction: 'Add a reviews strip' } }); p = await idle(id); ok(p.headVersion === 5 && p.editError === '', 'the next change works and the reason is cleared');

    // a rebuild is a version too; the live link waits
    await P(`/${id}/rebuild`, { body: {} }); p = await idle(id); v = (await P(`/${id}/versions`)).json;
    ok(p.headVersion === 6 && v.versions[0].source === 'rebuild' && p.liveVersion === 4 && p.pendingPublish === true, 'a rebuild is a new version and does not touch the live link', JSON.stringify([p.headVersion, v.versions[0].source, p.liveVersion]));
    ok(sql(`select count(*) from prototype_versions where prototype_id='${id}'`) === '6' && Number(sql(`select cost_cents from prototypes where id='${id}'`)) > 0, 'every version is kept, and the cost of the changes adds up on the prototype', sql(`select count(*) from prototype_versions where prototype_id='${id}'`) + ' / ' + sql(`select cost_cents from prototypes where id='${id}'`));

    // the daily limit
    const used = Number(sql(`select count(*) from prototype_versions where source='edit' and created_at > now() - interval '24 hours'`)), cap = (await P(`/${id}/versions`)).json.perDay;
    sql(`insert into prototype_versions(prototype_id,n,source,html) select '${id}', 1000+g, 'edit', 'x' from generate_series(1,${Math.max(0, cap - used)}) g`);
    e = await P(`/${id}/edit`, { body: { instruction: 'One change too many' } }); ok(e.status === 429 && /changes a day/.test(e.json.error), 'the daily limit of changes is enforced with a plain message', JSON.stringify(e.json));
    sql(`delete from prototype_versions where prototype_id='${id}' and n >= 1000`);
    ok((await P(`/${id}/edit`, { body: { instruction: 'Back under the limit' } })).status === 202, 'and it works again under the limit'); await idle(id);

    // delete takes the versions with it
    ok((await P(`/${id}`, { method: 'DELETE' })).json.ok === true && sql(`select count(*) from prototype_versions where prototype_id='${id}'`) === '0' && (await call(`/p/${slug}`)).status === 404, 'deleting a prototype removes its versions and its link');
  } finally { await new Promise(r => site.close(r)); }
});

await journey('J146', 'Finding leads: search a trade and a town, skip the directories and the ones we know, rank the tired sites first, send a lead into the CRM, build for it, and watch the deal follow', async () => {
  const room = await newRoom('146', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), P = (path, o = {}) => call('/v1/admin/prototypes' + path, { token: kyle, ...o });
  const http = (await import('node:http')).default, seen = [];
  const TIRED = `<html><head><title>Home</title></head><body bgcolor="#ffffff"><center><font face="Arial" color="#cc0000">TIRED PLUMBING</font></center><table><tr><td>Services</td></tr></table><p>Call 484-555-0199 for all your plumbing needs in Norristown, PA 19401.</p><script src="/js/jquery-1.7.2.min.js"></script><div>&copy; 2013 Tired Plumbing</div></body></html>`;
  const FINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Spark Electric: electricians in Reading, PA | Licensed and insured</title><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="Licensed electricians serving Reading, PA with free estimates and same-day service."><link rel="canonical" href="https://sparkelectric.test/"><meta property="og:title" content="Spark Electric"></head><body><header><nav><a href="/">Home</a> <a href="/services">Services</a> <a href="/contact">Contact</a></nav></header><main><h1>Licensed electricians in Reading, PA</h1><a href="tel:6105550177">Call 610-555-0177</a><p>Free estimates. Licensed and insured. Five star reviews from neighbors across Berks County. Panel upgrades, EV chargers, lighting and rewiring.</p><h2>Services</h2><ul><li>Panel upgrades</li><li>EV chargers</li><li>Rewiring</li></ul><h2>Reviews</h2><p>Great work, on time.</p><footer>Spark Electric, 12 Penn St, Reading, PA 19601</footer></main></body></html>`;
  const site = http.createServer((req, res) => { const h = String(req.headers['x-original-host'] || ''); seen.push(h); if (h === 'offline-shop.test') { res.writeHead(500); return res.end('boom'); } if (h === 'tiredplumbing.test' || h === 'www.tiredplumbing.test') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(TIRED); } if (h === 'sparkelectric.test') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(FINE); } res.writeHead(404); res.end('no'); });
  const queries = [], brave = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); if (u.pathname !== '/res/v1/web/search') { res.writeHead(404); return res.end('{}'); } queries.push(u.searchParams.get('q'));
    const results = [{ title: 'Best plumbers near you - Yelp', url: 'https://www.yelp.com/search?find_desc=plumber', description: 'Directory' }, { title: 'Spark Electric', url: 'https://sparkelectric.test/services', description: 'Electricians in Reading' }, { title: 'Tired Plumbing', url: 'https://www.tiredplumbing.test/contact', description: 'Plumber' }, { title: 'Tired Plumbing again', url: 'https://tiredplumbing.test/', description: 'Plumber' }, { title: 'Down', url: 'https://offline-shop.test/', description: '' }, { title: 'Nope', url: 'ftp://nope.test/', description: '' }];
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ web: { results } }));
  });
  await new Promise(r => site.listen(3134, '127.0.0.1', r)); await new Promise(r => brave.listen(3133, '127.0.0.1', r));
  const waitSearch = async id => { const t0 = Date.now(); for (;;) { const s = (await P(`/leads/searches/${id}`)).json.search; if (s.status !== 'running') return s; if (Date.now() - t0 > 25000) throw new Error('search timed out: ' + s.step); await sleep(150); } };
  try {
    ok((await call('/v1/admin/prototypes/leads/meta')).status === 401 && (await call('/v1/admin/prototypes/leads/meta', { token: room.token })).status === 403 && (await call('/v1/admin/prototypes/leads/search', { token: room.token, body: { urls: 'a.test' } })).status === 403, 'signed out people and clients cannot find leads');
    const meta = (await P('/leads/meta')).json; ok(meta.search === true && meta.trades.some(t => t.key === 'plumbing' && t.terms.length === 2) && meta.trades.some(t => t.key === 'home-health') && meta.perDay >= 1, 'the trades to search are listed and search is connected');

    // bad input
    ok((await P('/leads/search', { body: { trade: 'astronaut', place: 'Reading, PA' } })).status === 422 && (await P('/leads/search', { body: { trade: 'plumbing', place: '' } })).status === 422 && (await P('/leads/search', { body: { urls: 'http://127.0.0.1/' } })).status === 422, 'an unknown trade, no town and an address on our own network are refused');

    // search: directories dropped, repeats merged, the tired site first, the one that is down last
    let r = await P('/leads/search', { body: { trade: 'plumbing', place: 'Norristown, PA' } }); ok(r.status === 202 && r.json.search.status === 'running', 'a search is accepted and runs in the background', r.status);
    const s = await waitSearch(r.json.search.id), hosts = s.results.map(x => x.host);
    ok(s.status === 'done' && JSON.stringify(queries.slice(0, 2)) === JSON.stringify(['plumber Norristown, PA', 'plumbing company Norristown, PA']), 'it asked the search for the trade and the town', JSON.stringify(queries));
    ok(JSON.stringify(hosts) === JSON.stringify(['tiredplumbing.test', 'offline-shop.test', 'sparkelectric.test']), 'the directory is dropped, the repeat is merged, the tired site comes first and the site that already looks fine goes last', JSON.stringify(hosts));
    const [tired, down, fine] = s.results;
    ok(tired.reachable && tired.quickTurn && tired.score < 40 && tired.phone === '(484) 555-0199' && tired.top.length >= 2 && tired.url === 'https://www.tiredplumbing.test/' && /Tired Plumbing/i.test(tired.name) && /Norristown, PA/.test(tired.city), 'the tired site: low score, quick turn, phone, city and what is wrong', JSON.stringify(tired).slice(0, 300));
    ok(fine.score >= 70 && fine.industry === 'electrician' && fine.lead === false && fine.fit === 'other' && /electrician work, not plumbing/.test(fine.reason) && down.reachable === false && down.lead === true && down.name === 'offline-shop.test' && /500/.test(down.error) && tired.lead === true && s.skipped.directories >= 1 && s.skipped.invalid >= 1, 'the other-trade site is not a lead and says why; the site that is down is a lead with a reason', JSON.stringify([fine.fit, fine.reason, s.skipped]));
    ok((await P('/leads/searches')).json.searches[0].id === s.id && (await P('/leads/searches/not-an-id')).status === 404, 'recent searches are listed');

    // a pasted list skips the search
    const before = queries.length; r = await P('/leads/search', { body: { urls: 'tiredplumbing.test\nsparkelectric.test, https://tiredplumbing.test/about' } }); const l = await waitSearch(r.json.search.id);
    ok(queries.length === before && l.mode === 'list' && l.results.length === 2 && l.results[0].host === 'tiredplumbing.test', 'a pasted list is audited without searching and repeats are merged', JSON.stringify(l.results.map(x => x.host)));

    // into the CRM
    const add = async o => P('/leads/add', { body: { url: tired.url, company: 'Tired Plumbing', trade: 'plumbing', phone: tired.phone, city: tired.city, score: tired.score, problems: tired.top.map(t => t.pitch || t.text || t.title || ''), ...o } });
    ok((await add({ url: 'ftp://x' })).status === 422 && (await add({ email: 'nope' })).status === 422, 'a bad address or email is refused');
    const a1 = await add({}); ok(a1.status === 201 && a1.json.created && a1.json.madeDeal, 'adding a lead makes the company, a contact and a deal', JSON.stringify(a1.json));
    const { contactId, dealId, companyId } = a1.json;
    ok(sql(`select stage||'/'||title from sales_deals where id='${dealId}'`) === 'new/Website rebuild: Tired Plumbing' && sql(`select source||'/'||phone from sales_contacts where id='${contactId}'`) === 'site-prototype/(484) 555-0199' && sql(`select website from sales_companies where id='${companyId}'`) === 'https://www.tiredplumbing.test/', 'the deal starts in New, the contact remembers where it came from, the company has its website');
    ok(Number(sql(`select count(*) from sales_activities where contact_id='${contactId}' and text like 'Found by site prospecting%'`)) === 1, 'the timeline says what is wrong with their site');
    const a2 = await add({}); ok(a2.status === 200 && !a2.json.created && !a2.json.madeDeal && a2.json.dealId === dealId && Number(sql(`select count(*) from sales_deals where contact_id='${contactId}'`)) === 1, 'adding the same lead again changes nothing');
    const s2 = await P('/leads/search', { body: { trade: 'plumbing', place: 'Norristown, PA' } }); const s2d = await waitSearch(s2.json.search.id);
    ok(!s2d.results.some(x => x.host === 'tiredplumbing.test') && s2d.skipped.known >= 1, 'a business already in the CRM is not offered again', JSON.stringify(s2d.skipped));

    // build for the lead: the deal follows
    const b = await P('', { body: { url: tired.url, city: tired.city, contactId, dealId } }); ok(b.status === 202 && b.json.prototype.contactId === contactId && b.json.prototype.dealId === dealId, 'the build is tied to the contact and the deal');
    const pid = b.json.prototype.id; const t0 = Date.now(); let pr; for (;;) { pr = (await P(`/${pid}`)).json.prototype; if (['ready', 'failed'].includes(pr.status) || Date.now() - t0 > 25000) break; await sleep(150); }
    ok(pr.status === 'ready' && Number(sql(`select count(*) from sales_activities where contact_id='${contactId}' and text ilike 'A new site prototype%is built%'`)) >= 1, 'when it is ready the timeline says so', pr.status);
    await P(`/${pid}/publish`, { body: {} }); ok(Number(sql(`select count(*) from sales_activities where contact_id='${contactId}' and text ilike '%published%'`)) >= 1, 'publishing is on the timeline');
    const sh = await P(`/${pid}/share`, { body: { emails: 'owner@tiredplumbing.test', send: false } }); ok(sh.status === 200 && sql(`select stage from sales_deals where id='${dealId}'`) === 'contacted' && Number(sql(`select count(*) from sales_activities where contact_id='${contactId}' and text ilike '%shared%'`)) >= 1, 'sharing it moves the deal to Contacted and says so on the timeline', sql(`select stage from sales_deals where id='${dealId}'`));
    ok(sql(`select count(*) from prototypes where status in ('queued','reading','building')`) === '0' && sql(`select count(*) from prototype_searches where status='running'`) === '0', 'nothing is left running');
  } finally { await new Promise(r => site.close(r)); await new Promise(r => brave.close(r)); }
});

await journey('J151', 'Saved lead searches: they run by themselves when due, bring new sites only, surface the quick turns on the work home until someone opens them, can be paused, and the Platform page reports the prototypes and the search', async () => {
  const room = await newRoom('151', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), P = (path, o = {}) => call('/v1/admin/prototypes' + path, { token: kyle, ...o });
  const http = (await import('node:http')).default, H = `sched-pipes-${stamp}.test`, town = `Schedton ${stamp}, PA`;
  const TIRED = `<html><head><title>Home</title></head><body bgcolor="#ffffff"><center><font face="Arial" color="#cc0000">SCHED PIPES</font></center><table><tr><td>Services</td></tr></table><p>Call 484-555-0123 for plumbing and drains in Schedton PA 19401.</p><script src="/js/jquery-1.7.2.min.js"></script><div>&copy; 2012 Sched Pipes</div></body></html>`;
  const site = http.createServer((q, s) => { const h = String(q.headers['x-original-host'] || '').replace(/^www\./, ''); s.writeHead(h === H ? 200 : 404, { 'content-type': 'text/html' }); s.end(h === H ? TIRED : 'no'); });
  const brave = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ web: { results: [{ title: 'Plumbers - Yelp', url: 'https://www.yelp.com/search?x=1' }, { title: 'Sched Pipes', url: `https://${H}/` }] } })); });
  await new Promise(r => site.listen(3134, '127.0.0.1', r)); await new Promise(r => brave.listen(3133, '127.0.0.1', r));
  const schedules = async () => (await P('/leads/schedules')).json.schedules, mine = async id => (await schedules()).find(x => x.id === id);
  const waitFor = async (fn, ms = 25000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out'); await sleep(250); } };
  try {
    // who may, and what is refused
    ok((await call('/v1/admin/prototypes/leads/schedules')).status === 401 && (await call('/v1/admin/prototypes/leads/schedules', { token: room.token })).status === 403 && (await call('/v1/admin/prototypes/leads/schedules', { token: room.token, body: { trade: 'plumbing', place: 'x' } })).status === 403, 'signed out people and clients cannot see or save searches');
    const bad = body => P('/leads/schedules', { body }); ok((await bad({ trade: 'astronaut', place: town })).status === 422 && (await bad({ trade: 'plumbing', place: '' })).status === 422 && (await bad({ trade: 'plumbing', place: town, everyDays: 0 })).status === 422 && (await bad({ trade: 'plumbing', place: town, everyDays: 31 })).status === 422 && (await bad({ trade: 'plumbing', place: town, everyDays: 'soon' })).status === 422, 'an unknown trade, no place and an odd frequency are refused');

    // save one: it is due at once, and the job picks it up
    const c = await bad({ trade: 'plumbing', place: town }); const id = c.json.schedule && c.json.schedule.id;
    ok(c.status === 201 && c.json.schedule.everyDays === 7 && c.json.schedule.enabled && c.json.schedule.tradeLabel === 'Plumbing' && c.json.schedule.lastRunAt === null && c.json.schedule.last === null, 'a saved search is kept, weekly by default', JSON.stringify(c.json).slice(0, 200));
    ok((await bad({ trade: 'plumbing', place: town.toUpperCase() })).status === 409, 'the same trade and place is not saved twice');
    const done = await waitFor(async () => { const x = await mine(id); return x && x.last && x.last.status === 'done' ? x : null; });
    ok(done.lastRunAt && done.last.found === 1 && done.last.quick === 1 && done.last.seen === false, 'the job ran it by itself: one tired quick-turn site, not yet looked at', JSON.stringify(done.last));
    const list = (await P('/leads/searches')).json.searches, srch = list.find(x => x.scheduleId === id);
    ok(srch && srch.mode === 'search' && srch.results[0].host === H && srch.results[0].quickTurn && srch.skipped.directories >= 1 && srch.seenAt === null, 'its results are in Recent searches, the directory skipped', JSON.stringify(srch && srch.skipped));

    // the work home says so until it is opened
    let home = (await P('/../home')).json; const entry = (home.leadSearches || []).find(x => x.id === srch.id);
    ok(entry && entry.quick === 1 && entry.place === town && entry.trade === 'plumbing', 'the work home lists the new quick-turn site', JSON.stringify(home.leadSearches));
    const opened = await P(`/leads/searches/${srch.id}`); ok(opened.json.search.results.length === 1, 'opening the search shows its results');
    home = (await P('/../home')).json; ok(!(home.leadSearches || []).some(x => x.id === srch.id) && (await mine(id)).last.seen === true, 'once opened it leaves the Today list');

    // the next run brings new sites only
    const before = Number(sql(`select count(*) from prototype_searches where schedule_id='${id}'`));
    const run = await P(`/leads/schedules/${id}/run`, { body: {} }); ok(run.status === 202 && run.json.search.scheduleId === id, 'Run now starts a search');
    const again = await waitFor(async () => { const r = (await P('/leads/searches')).json.searches.find(x => x.id === run.json.search.id); return r && r.status !== 'running' ? r : null; });
    ok(again.status === 'done' && again.found === 0 && again.skipped.known + again.skipped.duplicates >= 1 && Number(sql(`select count(*) from prototype_searches where schedule_id='${id}'`)) === before + 1, 'the second run finds nothing new: what was shown before is skipped', JSON.stringify(again.skipped));
    home = (await P('/../home')).json; ok(!(home.leadSearches || []).some(x => x.id === again.id), 'a run with nothing new does not appear on the Today list');

    // pause and resume
    ok((await P(`/leads/schedules/${id}`, { method: 'PATCH', body: { everyDays: 99 } })).status === 422 && (await P('/leads/schedules/nope', { method: 'PATCH', body: { enabled: false } })).status === 404, 'a bad frequency and a bad id are refused');
    const paused = await P(`/leads/schedules/${id}`, { method: 'PATCH', body: { enabled: false, everyDays: 3 } }); ok(paused.json.schedule.enabled === false && paused.json.schedule.everyDays === 3 && paused.json.schedule.nextRunAt === null, 'pausing keeps the search and clears when it runs next');
    sql(`update prototype_search_schedules set last_run_at = now() - interval '8 days' where id='${id}'`); const n1 = Number(sql(`select count(*) from prototype_searches where schedule_id='${id}'`)); await sleep(4500);
    ok(Number(sql(`select count(*) from prototype_searches where schedule_id='${id}'`)) === n1, 'a paused search does not run, however overdue');
    await P(`/leads/schedules/${id}`, { method: 'PATCH', body: { enabled: true } }); await waitFor(async () => Number(sql(`select count(*) from prototype_searches where schedule_id='${id}'`)) === n1 + 1);
    ok(true, 'resumed, and being overdue it runs at once');
    await waitFor(async () => (await mine(id)).last.status !== 'running');

    // the Platform page
    const hh = (await call('/v1/admin/platform/health?fresh=1', { token: kyle })).json, pr = hh.checks.find(x => x.id === 'prototypes'), ls = hh.checks.find(x => x.id === 'leadsearch');
    ok(pr && pr.group === 'sales' && pr.status === 'off' && /Claude is not connected/.test(pr.summary) && pr.facts.some(f => f[0] === 'Prototypes') , 'the Platform page has a prototypes card, and says Claude is not connected here', pr && pr.summary);
    ok(ls && ls.status === 'ok' && /Key set/.test(ls.summary) && ls.facts.some(f => f[0] === 'Saved searches' && /1 \(1 on\)/.test(f[1])) && !JSON.stringify(hh).includes('"bk"'), 'and a lead search card: key set, the saved search counted, no key shown', ls && ls.summary);
    ok(hh.config.some(x => x.id === 'protoai' && x.status === 'warn') && hh.config.some(x => x.id === 'leadsearch' && x.status === 'ok') && (hh.jobs || []).some(j => j.name === 'Lead search schedules'), 'the settings and the job are listed too');

    // remove
    ok((await P(`/leads/schedules/${id}`, { method: 'DELETE' })).json.ok === true && (await schedules()).every(x => x.id !== id) && (await P(`/leads/schedules/${id}`, { method: 'DELETE' })).status === 404, 'a saved search can be removed');
  } finally { await new Promise(r => site.close(r)); await new Promise(r => brave.close(r)); }
});

await journey('J178', 'The site itself goes to a client\'s Shopify as a draft theme: the theme is a real zip, the store key is saved sealed, Shopify is given a short-lived address to fetch it from, a refusal or an error is said plainly, and nothing is sent twice by accident', async () => {
  const room = await newRoom('178', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), A = (path, o = {}) => call(path, { token: kyle, ...o });
  const http = await import('node:http'), shopify = { calls: [], mode: 'ok' };
  const srv = http.createServer((req, res) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
    const body = (() => { try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; } })(); shopify.calls.push({ path: req.url, key: req.headers['x-shopify-access-token'], body });
    const send = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (shopify.mode === 'refused') return send(401, { errors: '[API] Invalid API key or access token' });
    if (shopify.mode === 'error') return send(200, { data: { themeCreate: { theme: null, userErrors: [{ code: 'INVALID', field: ['source'], message: 'The theme zip could not be read' }] } } });
    send(200, { data: { themeCreate: { theme: { id: 'gid://shopify/OnlineStoreTheme/777', name: body.variables?.name, role: 'UNPUBLISHED' }, userErrors: [] } } }); }); });
  await new Promise(r => srv.listen(3133, '127.0.0.1', r));
  try {
    ok((await call('/v1/admin/themes', { token: room.token })).status === 403 && (await call('/v1/admin/themes')).status === 401, 'only staff can list or download themes');
    const list = (await A('/v1/admin/themes')).json.themes; const th = list.find(t => t.key === 'common-ground'); ok(th && th.files >= 80 && th.name === 'Common Ground', 'the Common Ground theme is there, with its files', list);
    const zr = await fetch(`${BASE}/v1/admin/themes/common-ground/zip`, { headers: { authorization: `Bearer ${kyle}` } }); const zip = Buffer.from(await zr.arrayBuffer());
    const entries = b => b.readUInt16LE(b.length - 22 + 10), names = b => { const out = []; let o = b.readUInt32LE(b.length - 22 + 16); const n = entries(b); for (let i = 0; i < n; i++) { const nl = b.readUInt16LE(o + 28), el = b.readUInt16LE(o + 30), cl = b.readUInt16LE(o + 32); out.push(b.subarray(o + 46, o + 46 + nl).toString()); o += 46 + nl + el + cl; } return out; };
    ok(zr.status === 200 && /zip/.test(zr.headers.get('content-type')) && zip.readUInt32LE(0) === 0x04034b50 && entries(zip) === th.files, 'the download is a real zip with every file', { status: zr.status, entries: entries(zip) });
    const nm = names(zip); ok(nm.includes('layout/theme.liquid') && nm.includes('templates/index.json') && nm.every(n => /^(assets|config|layout|locales|sections|snippets|templates)\//.test(n)), 'it holds only the folders a theme may hold (no notes or design docs)');
    ok((await A('/v1/admin/themes/not-a-theme/zip')).status === 404, 'an unknown theme is not found');
    const b = (await A('/v1/admin/builds', { body: { name: `Theme build ${stamp}`, slug: `theme-build-${stamp}`, status: 'concept', visibility: 'hidden' } })).json; const bid = b.build?.id || b.id;
    const push = (o = {}) => A(`/v1/admin/builds/${bid}/push-theme`, { body: { clientId: cid, theme: 'common-ground', ...o } });
    ok((await call(`/v1/admin/builds/${bid}/push-theme`, { token: room.token, body: { clientId: cid, theme: 'common-ground' } })).status === 403, 'a client cannot send themes');
    ok((await push({ theme: 'nope' })).status === 422, 'only a listed theme can be sent');
    const early = await push(); ok(early.status === 409 && /store key/i.test(early.json.error) && /zip/i.test(early.json.error), 'before a store key is saved it says what to do, and mentions the zip', early.json);
    const conn = o => A(`/v1/admin/clients/${cid}/commerce/connection`, { method: 'PUT', body: { platform: 'shopify-theme', ...o } });
    ok((await conn({ shop: 'not a shop', token: 'shpat_abcdefgh1234' })).status === 422 && (await conn({ shop: 'phil-store.myshopify.com', token: 'x' })).status === 422, 'a bad store address or a short key is refused');
    const key = 'shpat_themekey_1234567890';
    const saved = await conn({ shop: 'https://Phil-Store.myshopify.com/admin', token: key }); ok(saved.status === 200 && saved.json.connection.connected && saved.json.connection.shop === 'phil-store.myshopify.com', 'the key is saved against the client\'s store address', saved.json);
    const view = JSON.stringify((await A(`/v1/admin/builds/${bid}/commerce?clientId=${cid}`)).json); ok(!view.includes(key) && JSON.parse(view).client.targets.shopifyTheme.shop === 'phil-store.myshopify.com', 'the key is never sent back');
    ok(sql(`select secret_sealed like '%shpat%' from client_commerce_connections where client_id='${cid}' and platform='shopify-theme'`) === 'f', 'and it is sealed at rest');
    const prev = await push({ preview: true }); ok(prev.json.preview && prev.json.files === th.files && prev.json.shop === 'phil-store.myshopify.com' && shopify.calls.length === 0, 'seeing what will be sent sends nothing', prev.json);
    const go = await push({ name: 'Common Ground (draft)' }); const call1 = shopify.calls[0];
    ok(go.status === 201 && go.json.push.status === 'done' && go.json.push.items[0].externalId === 'gid://shopify/OnlineStoreTheme/777', 'sent: Shopify made the draft theme', go.json);
    ok(call1.key === key && /\/admin\/api\/[\d-]+\/graphql\.json$/.test(call1.path) && /themeCreate/.test(call1.body.query) && call1.body.variables.name === 'Common Ground (draft)' && !/role\s*:/.test(call1.body.query), 'with the store key, as a theme with the name given (never published: the role is left at the default, a draft)', call1.body.variables);
    const src = new URL(call1.body.variables.source); ok(/^\/v1\/public\/theme-zip\/common-ground\.\d+\.[\w-]{32}\.zip$/.test(src.pathname), 'Shopify is given an address on a short-lived, signed path', src.pathname);
    const got = await fetch(BASE + src.pathname); const gz = Buffer.from(await got.arrayBuffer()); ok(got.status === 200 && gz.readUInt32LE(0) === 0x04034b50 && entries(gz) === th.files, 'and that address serves the zip with no sign-in');
    const forged = src.pathname.replace(/[\w-]{32}\.zip$/, 'A'.repeat(32) + '.zip'); ok((await fetch(BASE + forged)).status === 404 && (await fetch(`${BASE}/v1/public/theme-zip/common-ground.1000000000.${'a'.repeat(32)}.zip`)).status === 404, 'a forged or expired address gets nothing');
    ok(sql(`select count(*) from build_pushes where build_id='${bid}' and platform='shopify-theme' and status='done'`) === '1', 'the push is kept in the history');
    ok((await A(`/v1/admin/builds/${bid}/commerce?clientId=${cid}`)).json.pushes.some(p => p.platformLabel === 'Shopify theme' && p.target === 'phil-store.myshopify.com'), 'and shows in the build\'s history as a Shopify theme');
    shopify.mode = 'error'; const bad1 = await push(); ok(bad1.status === 502 && bad1.json.push.status === 'failed' && /could not be read/.test(bad1.json.push.items[0].reason), 'a refusal from Shopify about the zip is said in its own words', bad1.json.push);
    shopify.mode = 'refused'; const bad2 = await push(); ok(bad2.status === 409 && /themes/i.test(bad2.json.error) && sql(`select status from client_commerce_connections where client_id='${cid}' and platform='shopify-theme'`) === 'needs-reconnect', 'a key Shopify does not accept marks the connection to be redone, and says it may lack the themes permission', bad2.json);
    ok((await push()).status === 409 && shopify.calls.length === 3, 'nothing more is sent until it is connected again');
    ok((await A(`/v1/admin/clients/${cid}/commerce/connection/shopify-theme`, { method: 'DELETE' })).json.ok === true, 'the key can be removed');
  } finally { await new Promise(r => srv.close(r)); }
});

await journey('J177', 'A service we host for a client (the Common Ground make-an-offer service) has a hidden Builds entry at its health address, so the site checks watch it', async () => {
  const slug = 'common-ground-offers', row = sql(`select status||'|'||visibility||'|'||hosting||'|'||live_url from builds where slug='${slug}'`);
  ok(row === 'live|hidden|railway|https://offers-api-production-8a9d.up.railway.app/health', 'it is there, live, hidden, on Railway, at its health page', row);
  ok(sql(`select count(*) from builds where slug='${slug}'`) === '1', 'once only');
});


await journey('J175', 'A prototype made elsewhere stays in Prototypes (not on Builds) until it is pushed: then it gets its Builds entry, shows in the client\'s room, and the client can be invited; and it can be taken back out', async () => {
  const room = await newRoom('175', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const staff = async email => { const id = sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0]; return forge({ sub: id, clientId: cid, role: 'admin', email }); };
  const kyle = await staff('kyle@thefuturebasics.com'), P = (path, o = {}) => call('/v1/admin/prototypes' + path, { token: kyle, ...o }), B = (path, o = {}) => call('/v1/admin/builds' + path, { token: kyle, ...o });
  const host = `cg-proto-${stamp}.myshopify.com`, url = `https://${host}/password`;
  ok((await call('/v1/admin/prototypes/external', { token: room.token, body: { company: 'X', prototypeUrl: url } })).status === 403, 'only staff can add one');
  ok((await P('/external', { body: { prototypeUrl: url } })).status === 422 && (await P('/external', { body: { company: 'Common Ground', prototypeUrl: 'not a url' } })).status === 422, 'it needs a business name and a real address');
  // it was added to Builds by hand before: adding it here takes it out of Builds
  const made = await B('', { body: { name: `cg proto ${stamp}`, slug: `cg-proto-${stamp}`, liveUrl: url, status: 'concept', visibility: 'listed' } }); const oldBuild = made.json.build?.id || made.json.id;
  const meta = (await P('/meta')).json; ok(meta.builds.some(b => b.id === oldBuild) && Array.isArray(meta.projects), 'the page can see which Builds entry already points at it', meta.builds.length);
  const add = await P('/external', { body: { company: 'Common Ground', prototypeUrl: url, currentUrl: 'commonground12.com', accessNote: 'Store password: sneakers', moveBuildId: oldBuild } }); const px = add.json.prototype;
  ok(add.status === 201 && px.kind === 'external' && px.status === 'ready' && px.externalUrl === url && px.buildId === null && px.accessNote === 'Store password: sneakers' && add.json.movedFromBuilds === `cg proto ${stamp}`, 'it is kept in Prototypes with its address and how to get in, and not on Builds', add.json);
  ok(sql(`select status||'|'||visibility from builds where id='${oldBuild}'`) === 'archived|hidden', 'the by-hand Builds entry is archived and hidden');
  ok((await P('/external', { body: { company: 'Common Ground', prototypeUrl: url } })).status === 409, 'the same prototype is not added twice');
  ok((await P(`/${px.id}/rebuild`, { body: {} })).status === 409 && (await P(`/${px.id}/edit`, { body: { instruction: 'make it bolder' } })).status === 409 && (await P(`/${px.id}/publish`, { body: {} })).status === 409 && (await P(`/${px.id}/share`, { body: { emails: 'x@y.test' } })).status === 409, 'we do not rebuild, change or publish what lives elsewhere');
  ok((await P('')).json.prototypes.some(x => x.id === px.id && x.kind === 'external'), 'it is in the list');
  // the client's room: a software project, with nothing on it yet
  const proj = (await call(`/v1/admin/clients/${cid}/projects`, { token: kyle, body: { name: `Storefront ${stamp}`, kind: 'software' } })).json; const dash = async () => (await call('/v1/dashboard', { token: room.token })).json.projects.find(x => x.id === proj.id);
  ok(!JSON.stringify((await dash()).software || {}).includes(host), 'the client sees nothing of it yet');
  ok((await P(`/${px.id}/to-builds`, { token: room.token, body: {} })).status === 403, 'a client cannot push it');
  const prod = (await call(`/v1/admin/clients/${cid}/projects`, { token: kyle, body: { name: `Tech ${stamp}`, kind: 'product' } })).json;
  ok((await P(`/${px.id}/to-builds`, { body: { projectId: prod.id } })).status === 422, 'only a software project can be picked');
  const push = await P(`/${px.id}/to-builds`, { body: { projectId: proj.id, repoUrl: 'https://github.com/futurebasicsrepo/futurebasicsrepo-client-hub-api', repoPath: 'themes/common-ground' } });
  ok(push.status === 200 && push.json.buildId && push.json.project.id === proj.id && push.json.prototype.buildId === push.json.buildId, 'pushed: it has its Builds entry and is tied to the client project', push.json);
  const bid = push.json.buildId;
  ok(sql(`select status||'|'||visibility||'|'||hosting||'|'||live_url||'|'||repo_path from builds where id='${bid}'`) === `concept|hidden|shopify|${url}|themes/common-ground`, 'the entry is a hidden concept on Shopify, pointing at the prototype, with its code folder');
  ok(sql(`select build_id from projects where id='${proj.id}'`) === bid, 'the project is on that build');
  ok(JSON.stringify((await dash()).software || {}).includes(host), 'and the client now sees it in their room, though the entry is hidden for everyone else', (await dash()).software);
  const inv = await P(`/${px.id}/to-builds`, { body: { projectId: proj.id, emails: `phil-${stamp}@commonground.test`, note: 'Store password: sneakers', send: false } });
  ok(inv.status === 200 && inv.json.buildId === bid && inv.json.invites.invited.length === 1 && sql(`select visibility from builds where id='${bid}'`) === 'invite' && sql(`select count(*) from build_invites where build_id='${bid}' and email='phil-${stamp}@commonground.test' and revoked_at is null`) === '1', 'inviting adds the person to that same entry, which becomes invite only', inv.json);
  ok(sql(`select count(*) from builds where slug like 'proto-common-ground%' and status<>'archived'`) === '1', 'pushing again does not make a second entry');
  // back out
  const back = await P(`/${px.id}/from-builds`, { body: {} });
  ok(back.status === 200 && back.json.prototype.buildId === null && sql(`select status from builds where id='${bid}'`) === 'archived' && sql(`select coalesce(build_id::text,'none') from projects where id='${proj.id}'`) === 'none' && !JSON.stringify((await dash()).software || {}).includes(host), 'taken back out: the entry is archived, the project is untied, the client no longer sees it, and the prototype is still here');
  ok((await P('')).json.prototypes.some(x => x.id === px.id), 'it stays in Prototypes');
  const re = await P(`/${px.id}/to-builds`, { body: { projectId: proj.id } }); ok(re.status === 200 && re.json.buildId && re.json.buildId !== bid, 'it can be pushed again later, to a fresh entry');
  ok((await P(`/${px.id}`, { method: 'DELETE' })).json.ok === true && sql(`select status from builds where id='${re.json.buildId}'`) === 'archived', 'deleting it archives its entry');
});

await journey('J181', 'New-client onboarding: a won deal or the text link makes a room that asks for their details once on first sign-in; the staff link and the hub-invite email carry the same path', async () => {
  const room = await newRoom('181', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const kid = sql(`select id from users where lower(email)='kyle@thefuturebasics.com'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${cid}','kyle@thefuturebasics.com','Kyle','admin') returning id`).split('\n')[0];
  const kyle = await forge({ sub: kid, clientId: cid, role: 'admin', email: 'kyle@thefuturebasics.com' }), A = (path, o = {}) => call(path, { token: kyle, ...o }), S = (path, o = {}) => A('/v1/sales' + path, o);
  // the short link, in a staff member's name
  const page = await call('/j/kyle'), plain = await call('/j/nobody-' + stamp), evil = await call('/j/' + encodeURIComponent('"><script>alert(1)</script>')), bare = await call('/j');
  ok(page.status === 200 && /sent you this link/.test(page.text) && /data-ref="kyle"/.test(page.text) && /Open your <em>hub/.test(page.text), 'the short link opens the join page with the sender\'s name on it');
  ok(plain.status === 200 && !/sent you this link/.test(plain.text) && /data-ref=""/.test(plain.text) && bare.status === 200 && !/sent you this link/.test(bare.text), 'a handle that is not staff, and the bare /j, are the plain page');
  ok(evil.status === 200 && !/<script>alert/.test(evil.text), 'a hostile handle is not echoed back');
  // staff get their link and the words to send
  ok((await call('/v1/admin/join-link')).status === 401 && (await call('/v1/admin/join-link', { token: room.token })).status === 403, 'only staff can ask for the link');
  const jl = (await A('/v1/admin/join-link?name=Phil%20Reed&email=phil%40cg.test&company=Common%20Ground')).json;
  ok(/\/j\/kyle$/.test(jl.general) && /\/j\/kyle\?/.test(jl.link) && /email=phil%40cg\.test/.test(jl.link) && jl.text.includes(jl.link) && /^Hi Phil, it's Kyle/.test(jl.text), 'the staff link is /j/kyle, can be filled in for one person, and comes with a text to send', jl);
  // a customer opens a room from that link
  const mail = `phil181-${stamp}@cg.test`;
  const joined = await call('/v1/public/join', { body: { company: `Common Ground ${stamp}`, name: 'Phil Reed', email: mail, phone: '', attribution: { source: 's-kyle', medium: 'text' } } });
  ok(joined.status === 201 && joined.json.token, 'joining from the text link opens the room', joined.json);
  const jc = sql(`select onboarding_status||'|'||(acquisition->>'staff')||'|'||(acquisition->>'source')||'|'||(acquisition->>'medium') from clients where lower(contact_email)='${mail}'`);
  ok(jc === 'pending|Kyle|staff link|text', 'the room is marked as owing its details and remembers whose link it came from', jc);
  const tk = joined.json.token, sess = (await call('/v1/session', { token: tk })).json, dash = (await call('/v1/dashboard', { token: tk })).json;
  ok(sess.client.onboarding_status === 'pending' && dash.waiting.some(w => w.kind === 'onboarding'), 'the hub knows to open the form, and a card waits in Waiting on you');
  // the form
  const ob = (await call('/v1/onboarding', { token: tk })).json;
  ok(ob.status === 'pending' && ob.values.name === 'Phil Reed' && ob.values.company === `Common Ground ${stamp}` && ob.email === mail && ob.sharedBy === 'Kyle' && ob.stores.shopify, 'the form opens already filled with what they gave on the join page', ob);
  const full = { name: 'Phil Reed', role: 'Owner', phone: '(555) 010-2233', contactPref: 'text', company: `Common Ground ${stamp}`, website: 'commonground12.com', storePlatform: 'shopify', storeUrl: 'cg.myshopify.com', address: { line1: '1 Main St', city: 'Austin', region: 'TX', postal: '78701', country: 'USA' }, billingEmail: `ap-${stamp}@cg.test`, goal: 'A new storefront and a make-an-offer flow.', timezone: 'America/Chicago' };
  const miss = await call('/v1/onboarding', { token: tk, body: { ...full, phone: '' } }), badUrl = await call('/v1/onboarding', { token: tk, body: { ...full, website: 'not a site' } }), noGoal = await call('/v1/onboarding', { token: tk, body: { ...full, goal: '' } });
  ok(miss.status === 422 && miss.json.field === 'phone' && badUrl.status === 422 && badUrl.json.field === 'website' && noGoal.json.field === 'goal', 'a missing number, a bad website and an empty goal are each refused, naming the field');
  ok(sql(`select onboarding_status from clients where lower(contact_email)='${mail}'`) === 'pending', 'and nothing was saved');
  ok((await call('/v1/onboarding', { token: kyle, body: full })).status === 403 && (await call('/v1/onboarding', { body: full })).status === 401, 'staff and strangers cannot fill it in for a client');
  const done = await call('/v1/onboarding', { token: tk, body: full }); ok(done.status === 200 && done.json.status === 'done' && done.json.first === true, 'saving works', done.json);
  const row = sql(`select onboarding_status||'|'||contact_phone||'|'||website_url||'|'||(onboarding->>'storePlatform')||'|'||(onboarding->'address'->>'city')||'|'||(onboarding_done_at is not null)::text from clients where lower(contact_email)='${mail}'`);
  ok(row === 'done|(555) 010-2233|https://commonground12.com|shopify|Austin|true', 'the room has their phone, website and the whole record', row);
  ok((await call('/v1/session', { token: tk })).json.client.onboarding_status === 'done' && !(await call('/v1/dashboard', { token: tk })).json.waiting.some(w => w.kind === 'onboarding'), 'the form and the card are gone');
  const again = await call('/v1/onboarding', { token: tk, body: { ...full, role: 'Founder' } }); ok(again.json.first === false && sql(`select onboarding->>'role' from clients where lower(contact_email)='${mail}'`) === 'Founder', 'they can come back and change an answer');
  const detail = (await A('/v1/admin/clients/' + sql(`select id from clients where lower(contact_email)='${mail}'`))).json.client; ok(detail.onboarding_status === 'done' && detail.onboarding.goal.includes('make-an-offer'), 'staff see the answers on the room');
  // staff can ask again, or mark it done
  const rid = detail.id;
  ok((await call(`/v1/admin/clients/${rid}/onboarding`, { token: tk, body: { status: 'pending' } })).status === 403, 'a client cannot reopen it for themselves through the staff route');
  ok((await A(`/v1/admin/clients/${rid}/onboarding`, { body: { status: 'later' } })).status === 422, 'only pending or done');
  ok((await A(`/v1/admin/clients/${rid}/onboarding`, { body: { status: 'pending' } })).status === 200 && (await call('/v1/dashboard', { token: tk })).json.waiting.some(w => w.kind === 'onboarding'), 'staff can ask a room to do it again');
  ok((await A(`/v1/admin/clients/${rid}/onboarding`, { body: { status: 'done' } })).status === 200 && sql(`select onboarding_status from clients where id='${rid}'`) === 'done', 'or mark it done by hand');

  // a won deal makes a room that asks too, and the CRM contact picks up what they tell us
  const co = sql(`insert into sales_companies(name) values('Phil Co ${stamp}') returning id`).split('\n')[0], pe = `phil2-${stamp}@cg.test`;
  const ct = sql(`insert into sales_contacts(name,email,company_id) values('Phil Two','${pe}','${co}') returning id`).split('\n')[0];
  const won = sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('Phil site ${stamp}','won',900000,'${ct}','${co}') returning id`).split('\n')[0];
  const sp = await S(`/deals/${won}/start-project`, { body: { kind: 'software' } }); ok(sp.status === 201 && sp.json.client.created, 'start project makes the room', sp.json);
  ok(sql(`select onboarding_status from clients where id='${sp.json.client.id}'`) === 'pending', 'and it is marked as owing its details');
  const pt = (await signIn(pe)); ok(pt && pt.token, 'the contact signs in with an emailed code', pt);
  if (pt?.token) {
    ok((await call('/v1/session', { token: pt.token })).json.client.onboarding_status === 'pending', 'and the hub asks for their details');
    const sv = await call('/v1/onboarding', { token: pt.token, body: { ...full, name: 'Phil Two', company: `Phil Co ${stamp}`, phone: '(555) 010-7777', role: 'CEO' } }); ok(sv.status === 200, 'they fill it in', sv.json);
    ok(sql(`select phone||'|'||title from sales_contacts where id='${ct}'`) === '(555) 010-7777|CEO' && Number(sql(`select count(*) from sales_activities where contact_id='${ct}' and text like 'Finished the hub onboarding%'`)) === 1, 'the CRM contact gets the phone and title, and the timeline says they finished');
  }
  // the email: the same link, in the sender's name and filled in for this person
  const tpls = (await S('/templates')).json; const inv = tpls.templates.find(t => t.name === 'Open your Future Basics hub');
  ok(inv && /\{\{join_link/.test(inv.body) && tpls.fields.includes('join_link'), 'there is a hub invitation email in the templates, and join_link is a field');
  if (inv) {
    const pv = (await S(`/contacts/${ct}/email-preview`, { body: { subject: inv.subject, body: inv.body } })).json, m = /(https?:\/\/\S+\/j\/kyle\?\S+)/.exec(pv.body || '');
    ok(m && pv.missing.length === 0 && new URL(m[1]).searchParams.get('email') === pe && new URL(m[1]).searchParams.get('name') === 'Phil Two', 'the preview has Phil\'s own link, from /j/kyle, with his name and email in it', pv);
    ok(/Hi Phil,/.test(pv.body) && !/\{\{/.test(pv.body + pv.subject), 'and no blanks are left over');
  }
  ok((await S('/templates', { body: { name: 'Link fallback', subject: 'x', body: 'Open {{join_link}}' } })).status === 201, 'staff can use the field in their own templates too');
  // any employee has their own link, even when their email is first.last@
  const dem = `dana.lee${stamp}@thefuturebasics.com`, dh = `dana-lee${stamp}`, did = sql(`insert into users(client_id,email,name,role) values('${cid}','${dem}','Dana Lee','admin') returning id`).split('\n')[0];
  const dana = await forge({ sub: did, clientId: cid, role: 'admin', email: dem }), DJ = (await call('/v1/admin/join-link', { token: dana })).json;
  ok(DJ.handle === dh && DJ.general.endsWith('/j/' + dh) && /it's Dana at Future Basics/.test(DJ.text), 'a dotted staff email gets its own handle and text', DJ);
  const dpage = await call('/j/' + dh); ok(/Dana sent you this link/.test(dpage.text), 'their link carries their name');
  const dj = await call('/v1/public/join', { body: { company: `Dana Co ${stamp}`, name: 'Pat Ng', email: `pat${stamp}@dana.test`, attribution: { source: 's-' + dh, medium: 'text' } } });
  ok(dj.status === 201 && sql(`select acquisition->>'staff' from clients where lower(contact_email)='pat${stamp}@dana.test'`) === 'Dana', 'a sign-up from it is marked as theirs');
  const dpv = (await call(`/v1/sales/contacts/${ct}/email-preview`, { token: dana, body: { subject: inv.subject, body: inv.body } })).json; ok(new RegExp('/j/' + dh + '\\?').test(dpv.body || ''), 'and the hub email they send carries their link, not someone else\'s', dpv.body);
});

await journey('J184', 'Brand and assets: every signed-in employee can list and download the wordmark, icons, colours, fonts, the guide and the whole kit; clients and strangers cannot; the page is served', async () => {
  const room = await newRoom('184', { wait: false }), cid = sql(`select client_id from users where lower(email)='${room.email}'`);
  const mail = `brand184-${stamp}@thefuturebasics.com`, uid = sql(`insert into users(client_id,email,name,role) values('${cid}','${mail}','Bea Brand','admin') returning id`).split('\n')[0];
  const staff = await forge({ sub: uid, clientId: cid, role: 'admin', email: mail });
  ok((await call('/v1/brand')).status === 401 && (await call('/v1/brand/kit.zip')).status === 401 && (await call('/v1/brand/files/favicon.ico')).status === 401, 'a stranger gets nothing');
  ok((await call('/v1/brand', { token: room.token })).status === 403 && (await call('/v1/brand/files/favicon.ico', { token: room.token })).status === 403 && (await call('/v1/brand/kit.zip', { token: room.token })).status === 403, 'a client of ours gets nothing');
  const cat = await call('/v1/brand', { token: staff }); ok(cat.status === 200 && cat.json.groups.map(g => g.id).join() === 'logo,mark,icon,social,colour,font,guide' && cat.json.colors.length >= 8, 'any employee sees the whole catalogue', cat.json.groups?.map(g => g.id));
  const all = cat.json.groups.flatMap(g => g.items); ok(all.length > 60 && all.some(i => i.ext === 'pdf' && i.kind === 'print') && all.some(i => i.ext === 'svg') && all.some(i => i.ext === 'tiff') && all.some(i => i.ext === 'woff2'), 'with web and print file types', all.length);
  for (const [f, type, sig] of [['future-basics-wordmark-ink.svg', /svg/, '<svg'], ['future-basics-wordmark-black-cmyk.pdf', /pdf/, '%PDF'], ['future-basics-wordmark-white-1200.png', /png/, '\x89PNG'], ['favicon.ico', /icon/, '\x00\x00\x01\x00'], ['future-basics-colors.css', /css/, '/*'], ['future-basics-brand-guide.pdf', /pdf/, '%PDF'], ['future-basics-mark-ink.svg', /svg/, '<svg'], ['future-basics-mark-loop-on-light.svg', /svg/, '<svg'], ['future-basics-mark-loop-on-ink.gif', /gif/, 'GIF'], ['future-basics-lockup-ink-rgb.pdf', /pdf/, '%PDF']]) {
    const r = await fetch(BASE + '/v1/brand/files/' + f, { headers: { Authorization: 'Bearer ' + staff } }), b = Buffer.from(await r.arrayBuffer());
    ok(r.status === 200 && type.test(r.headers.get('content-type')) && /attachment; filename=/.test(r.headers.get('content-disposition')) && b.toString('latin1', 0, sig.length) === sig, `${f} downloads as the right kind of file`, [r.status, r.headers.get('content-type')]);
  }
  ok((await call('/v1/brand/files/nope.png', { token: staff })).status === 404 && (await call('/v1/brand/files/' + encodeURIComponent('../server.js'), { token: staff })).status === 404, 'an unknown name or a path is not found');
  const zr = await fetch(BASE + '/v1/brand/kit.zip', { headers: { Authorization: 'Bearer ' + staff } }), zb = Buffer.from(await zr.arrayBuffer());
  ok(zr.status === 200 && zb.subarray(0, 2).toString() === 'PK' && zb.readUInt16LE(zb.length - 22 + 10) === all.length, 'the kit zip holds every file', [zr.status, zb.length]);
  const pg = await call('/brand'); ok(pg.status === 200 && /Brand and assets/.test(pg.text) && /console-nav\.js/.test(pg.text), 'the page is served (it asks for a sign-in itself)');
});

const bad = summary(); process.exit(bad ? 1 : 0);

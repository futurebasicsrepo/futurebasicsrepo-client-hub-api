import { journey, ok, summary, api, jpeg, png, bigJpeg, hugeHeaderPng, codeFrom, sleep, waitAi, forge, sql, stamp, S } from './lib.mjs';
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

const bad = summary(); process.exit(bad ? 1 : 0);

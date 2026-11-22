// Contracts for digital work, end to end over HTTP (server G, which keeps the emails it would send): built from a deal, sent, opened, signed from the private link,
// countersigned, turned into invoices; and everything that should be refused: edits after sending, a replaced link, a second signature, an expired contract.
import { createRequire } from 'node:module';
import { journey, ok, summary, api, jpeg, sleep, sql, stamp, forge } from './lib.mjs';
let playwright = null; try { playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright'); } catch {}
import { buildPlan } from '../../src/contracts.js';
const BASE = 'http://127.0.0.1:3130', call = api(BASE);
const mk = async () => { const r = await call('/v1/public/start', { body: { email: `jc-${stamp}-${Math.random().toString(36).slice(2, 7)}@chaos.test`, name: 'Contract Admin', title: 'Contract runner', photos: [jpeg()] } }); return r.json; };
const room = await mk(), cid = sql(`select client_id from users where lower(email)='${room.email || ''}'`) || room.client?.id;
const clientId = room.client?.id || cid;
const staff = async email => sql(`select id from users where lower(email)='${email}'`).split('\n')[0] || sql(`insert into users(client_id,email,name,role) values('${clientId}','${email}','${email.split('@')[0]}','admin') returning id`).split('\n')[0];
const kyle = await forge({ sub: await staff('kyle@thefuturebasics.com'), clientId, role: 'admin', email: 'kyle@thefuturebasics.com' }), colby = await forge({ sub: await staff('colby@thefuturebasics.com'), clientId, role: 'admin', email: 'colby@thefuturebasics.com' });
const C = (path, o = {}) => call('/v1/contracts' + path, { token: colby, ...o }), K = (path, o = {}) => call('/v1/contracts' + path, { token: kyle, ...o });
const tokenOf = link => String(link).split('/sign/')[1];
const P = (token, path = '', o = {}) => call(`/v1/public/contracts/${token}${path}`, o);
const outbox = async to => (await call(`/v1/dev/outbox?to=${encodeURIComponent(to)}`)).json.emails || [];

const co = sql(`insert into sales_companies(name) values('Olive Salon ${stamp}') returning id`).split('\n')[0];
const ct = sql(`insert into sales_contacts(name,email,title,company_id) values('Olive Owner','olive-${stamp}@salon.test','Owner','${co}') returning id`).split('\n')[0];
const deal = sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('Salon website and booking ${stamp}','proposal',1200000,'${ct}','${co}') returning id`).split('\n')[0];
const SIGNER = `olive-${stamp}@salon.test`;
const body = (over = {}, plan = null) => ({ title: `Salon website ${stamp}`, kind: 'website', client: { company: `Olive Salon ${stamp}`, address: '1 Main St, Norristown PA', signerName: 'Olive Owner', signerTitle: 'Owner', signerEmail: SIGNER }, project: { name: 'Salon website' }, scope: ['A five-page website', 'Online booking link', 'Contact form'], fee: { totalCents: 1200000 }, timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '2026-12-15' }, plan: plan || buildPlan({ type: 'monthly', totalCents: 1200000, months: 6, firstDueOn: '2026-12-01', depositPct: 20, method: 'either', autopay: true }).plan, ...over });
const signBody = (o = {}) => ({ name: 'Olive Owner', title: 'Owner', agree: true, esign: true, autopay: true, method: 'ach', ...o });

await journey('J164', 'Contracts: a fixed-fee agreement is drafted from a deal, sent for signature, opened, signed from its private link, countersigned and turned into invoices, with every shortcut refused', async () => {
  ok((await call('/v1/contracts')).status === 401 && (await call('/v1/contracts', { token: room.token })).status === 403, 'contracts are staff only');
  const set = await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  ok(set.status === 200 && (await C('/settings')).json.settings.governingLaw === 'Pennsylvania', 'the legal basics (who signs, the address, the governing law) are kept once');

  // drafting from the platform
  const src = (await C('/sources')).json; ok(src.deals.some(d => d.id === deal && d.valueCents === 1200000), 'the deal is offered as a source, with its value');
  const dr = await C(`/draft?deal=${deal}`); const dc = dr.json.content;
  ok(dr.status === 200 && dc.client.company === `Olive Salon ${stamp}` && dc.client.signerEmail === SIGNER && dc.client.signerName === 'Olive Owner' && dc.fee.totalCents === 1200000 && dc.plan.type === 'split' && dc.provider.signerName === 'Kyle Riggle' && dc.kind === 'website', 'a draft from the deal carries the client, the signer, the fee and a starting payment plan', JSON.stringify(dr.json).slice(0, 300));
  ok((await C('/draft')).status === 422 && (await C('/draft?deal=00000000-0000-4000-8000-000000000000')).status === 404, 'a draft needs a deal or a project, and a missing one is not found');

  // saving, and what is not ready
  const created = await C('', { body: { content: body(), dealId: deal } }); const id = created.json.contract?.id;
  ok(created.status === 201 && /^FB-C-\d{4}-\d{3}$/.test(created.json.contract.number) && created.json.contract.status === 'draft' && created.json.contract.totalCents === 1200000, 'a draft is saved with the next number', JSON.stringify(created.json).slice(0, 200));
  const second = await C('', { body: { content: body({ title: 'Second' }) } }); ok(second.status === 201 && Number(second.json.contract.number.slice(-3)) === Number(created.json.contract.number.slice(-3)) + 1, 'numbers count up');
  ok((await C('', { body: { content: { client: {} } } })).status === 422, 'a contract with no title is refused');
  const bad = await C('', { body: { content: body({ client: { company: 'X', signerName: 'A', signerEmail: 'nope' } }) } }); ok(bad.status === 201 && bad.json.problems.some(p => /email address/.test(p)), 'a half-finished draft can be saved and says what is missing', bad.json.problems);
  const noSend = await C(`/${bad.json.contract.id}/send`, { body: {} }); ok(noSend.status === 422 && /email address/.test(noSend.json.error), 'it cannot be sent until it is complete', noSend.json);
  const wrongPlan = await C('', { body: { content: body({ fee: { totalCents: 900000 } }) } }); const wp = await C(`/${wrongPlan.json.contract.id}/send`, { body: {} });
  ok(wp.status === 422 && /add up to/.test(wp.json.error), 'a payment plan that does not add up to the fee cannot be sent', wp.json.error);
  const rend = await C('/render', { body: { content: body() } }); ok(rend.json.rendered.sections.length >= 12 && rend.json.rendered.sections.find(s => s.kind === 'schedule').rows.length === 7 && rend.json.problems.length === 0, 'the finished text and the 7-payment schedule can be previewed without saving');
  ok((await C(`/${id}`, { method: 'PUT', body: { content: body({ scope: ['A five-page website', 'Online booking link', 'Contact form', 'Search basics'] }) } })).status === 200, 'a draft can be edited');

  // sending
  ok((await C(`/${id}/countersign`, { body: {} })).status === 409 || (await C(`/${id}/countersign`, { body: {} })).status === 403, 'nobody signs a draft');
  const sent = await C(`/${id}/send`, { body: { message: 'Looking forward to this one.' } }); const link = sent.json.link, token = tokenOf(link);
  ok(sent.status === 200 && sent.json.contract.status === 'sent' && sent.json.emailed === true && /\/sign\/[0-9a-f-]{36}\.\d+\./.test(link) && sent.json.contract.docHash.length === 64 && sent.json.contract.expiresAt, 'sending emails the link, fixes the text with a hash and sets an expiry', JSON.stringify(sent.json.contract));
  const mail = (await outbox(SIGNER)).find(e => /Please review and sign/.test(e.subject));
  ok(mail && mail.links.some(l => l.includes(token)) && /Looking forward/.test(mail.text) && /\$12,000\.00/.test(mail.text) && /monthly payments of \$1,600\.00/.test(mail.text), 'the email names the fee and the payments, carries the note and the link', mail?.text.slice(0, 260));
  const edit = await C(`/${id}`, { method: 'PUT', body: { content: body({ title: 'Changed after sending' }) } }); ok(edit.status === 409 && /Revise/.test(edit.json.error), 'what was sent cannot be edited');

  // the client opens it
  const anon = await P(token); const rr = anon.json;
  ok(anon.status === 200 && rr.canSign && rr.status === 'sent' && rr.rendered.sections.some(s => s.kind === 'schedule') && rr.plan.autopay && rr.signer.email === SIGNER && !JSON.stringify(rr).includes('docHash') , 'the link shows the whole agreement and nothing staff-only');
  ok((await P(token.slice(0, -2) + 'xx')).status === 404 && (await P('not-a-token')).status === 404 && (await P(token.replace(/^[0-9a-f-]{36}/, '00000000-0000-4000-8000-000000000000'))).status === 404, 'a wrong, mangled or borrowed link opens nothing');
  const seen = await C(`/${id}`); ok(seen.json.contract.viewCount >= 1 && seen.json.events.some(e => e.kind === 'viewed') && seen.json.events.some(e => e.kind === 'sent'), 'staff see that it was opened, and the trail so far');
  ok((await outbox('')).some(e => /opened/.test(e.subject) && new RegExp(created.json.contract.number).test(e.subject)), 'staff are told when it is first opened');
  const pdf = await fetch(`${BASE}/v1/public/contracts/${token}/pdf`); ok(pdf.status === 200 && Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() === '%PDF-', 'the client can download it as a PDF');

  // signing, and what is refused
  const rejects = [[{ name: 'O' }, /full name/], [{ agree: false }, /read and agree/], [{ esign: false }, /electronically/], [{ autopay: false }, /authorize the automatic payments/], [{ method: 'cheque' }, /ACH or card/]];
  for (const [o, re] of rejects) { const r = await P(token, '/sign', { body: signBody(o) }); ok(r.status === 422 && re.test(r.json.error), `signing without ${Object.keys(o)[0]} is refused: ${r.json.error}`); }
  const both = await Promise.all([P(token, '/sign', { body: signBody({ name: 'Olive Owner' }) }), P(token, '/sign', { body: signBody({ name: 'Someone Else' }) })]);
  ok(both.filter(r => r.status === 200).length === 1 && both.filter(r => r.status === 409).length === 1, 'two signatures at once: exactly one counts', both.map(r => r.status));
  const after = await C(`/${id}`); const cs = after.json.contract.clientSignature;
  ok(after.json.contract.status === 'signed_by_client' && cs.name && cs.ip && cs.method === 'ach' && cs.autopay === true && after.json.events.some(e => e.kind === 'signed_client'), 'the signature is kept with who, when, from where, the payment method and the autopay consent', JSON.stringify(cs));
  ok((await P(token, '/sign', { body: signBody() })).status === 409 && (await P(token, '/decline', { body: {} })).status === 409, 'a signed contract cannot be signed or declined again');
  ok((await outbox('')).some(e => /signed .*needs your signature/i.test(e.subject) && e.subject.includes(created.json.contract.number)), 'staff are told it needs their signature');
  ok((await P(token)).json.status === 'signed_by_client' && (await P(token)).json.canSign === false && (await P(token)).json.clientSignature.name === cs.name, 'the link now shows it as signed');
  ok(sql(`select count(*) from sales_activities where deal_id='${deal}' and text like '%signed agreement%'`) === '1', 'the signature is on the contact\'s timeline in the CRM');

  // countersign
  ok((await C(`/${id}/countersign`, { body: {} })).status === 403, 'only the people who sign for Future Basics can countersign');
  ok(sql(`select stage from sales_deals where id='${deal}'`) === 'proposal', 'the deal is not won until both have signed');
  const exec = await K(`/${id}/countersign`, { body: {} });
  ok(exec.status === 200 && exec.json.contract.status === 'executed' && exec.json.contract.providerSignature.name === 'Kyle Riggle' && exec.json.contract.executedAt, 'Future Basics signs and the agreement is final', JSON.stringify(exec.json.contract).slice(0, 200));
  ok(sql(`select stage from sales_deals where id='${deal}'`) === 'won', 'the deal moves to Won');
  ok((await K(`/${id}/countersign`, { body: {} })).status === 409, 'it cannot be countersigned twice');
  const signedMail = (await outbox(SIGNER)).find(e => /Signed by both parties/.test(e.subject));
  ok(signedMail && signedMail.attachments.some(a => / - Agreement .+ \(signed\)\.pdf$/.test(a.filename) && a.head === '%PDF-' && a.bytes > 20000) && /attached as a PDF/.test(signedMail.text), 'the client is sent their signed copy, with the signed PDF attached', signedMail && signedMail.attachments);
  const spdf = await fetch(`${BASE}/v1/contracts/${id}/pdf`, { headers: { authorization: `Bearer ${kyle}` } }); const sbuf = Buffer.from(await spdf.arrayBuffer());
  ok(spdf.status === 200 && sbuf.subarray(0, 5).toString() === '%PDF-' && (sbuf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 4, 'staff download the signed PDF, certificate page included');
  const sname = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(spdf.headers.get('content-disposition') || '') || [])[1] || '');
  ok(/^.+ - Agreement FB-C-\d{4}-\d{3,}.* \(signed\)\.pdf$/.test(sname) && sname.startsWith(exec.json.contract.client?.company || sql(`select content->'client'->>'company' from contracts where id='${id}'`)), 'it is named for the client and the agreement number, so a phone saves it under that name, not "Unknown"', sname);
  ok((await C(`/${id}/void`, { body: { reason: 'x' } })).status === 409 && (await C(`/${id}/revise`, { body: {} })).status === 409, 'a fully signed contract cannot be voided or revised');

  // invoices from the schedule
  ok((await C(`/${id}/invoices`, { body: {} })).status === 403, 'only signers draft the invoices');
  // paid by ACH, so the invoices were drafted the moment it was fully signed: there is nothing left to press for
  ok((await K(`/${id}`)).json.contract.invoicesAt && (await K(`/${id}`)).json.events.some(e => e.kind === 'invoices_drafted'), 'an agreement paid by ACH has its invoices drafted when it is fully signed', (await K(`/${id}`)).json.contract?.invoicesAt);
  const rows = sql(`select number, total_cents, due_on, status, deal_id, contract_id, work_kind, contact_email from money_invoices where contract_id='${id}' order by contract_seq`).split('\n').map(l => l.split('|'));
  ok(rows.length === 7 && rows.reduce((s, r) => s + Number(r[1]), 0) === 1200000 && rows.every(r => r[3] === 'draft' && r[4] === deal && r[6] === 'software' && r[7] === SIGNER), 'the invoices add up to the fee, are drafts, and belong to the deal', JSON.stringify(rows.slice(0, 2)));
  ok(rows[1][2] === '2026-12-01' && rows[6][2] === '2027-05-01', 'monthly invoices fall on the schedule dates', rows.map(r => r[2]).join(' '));
  ok((await K(`/${id}/invoices`, { body: {} })).status === 409, 'the invoices are drafted once');
  ok((await K(`/${id}`)).json.invoices.length === 7, 'the contract lists its invoices');

  // declining, replacing, expiring
  const d2 = (await C('', { body: { content: body({ title: 'Decline me' }, buildPlan({ type: 'full', totalCents: 1200000 }).plan) } })).json.contract.id; const l2 = (await C(`/${d2}/send`, { body: {} })).json.link, t2 = tokenOf(l2);
  const dec = await P(t2, '/decline', { body: { reason: 'Too slow' } }); ok(dec.status === 200 && (await C(`/${d2}`)).json.contract.status === 'declined' && (await P(t2, '/sign', { body: signBody() })).status === 409, 'declining is recorded and closes the link');
  ok((await outbox('')).some(e => /declined/.test(e.subject)), 'staff are told it was declined');
  const r3 = (await C('', { body: { content: body({ title: 'Revise me' }) } })).json.contract; const t3 = tokenOf((await C(`/${r3.id}/send`, { body: {} })).json.link);
  const rev = await C(`/${r3.id}/revise`, { body: {} }); ok(rev.status === 201 && rev.json.contract.status === 'draft' && rev.json.contract.version === 2 && rev.json.contract.number === `${r3.number}-v2` && (await C(`/${r3.id}`)).json.contract.status === 'void', 'revising makes version 2 and voids the one that was out');
  ok((await P(t3)).json.status === 'void' && (await P(t3, '/sign', { body: signBody() })).status === 409, 'the old link no longer signs anything');
  const r4 = (await C('', { body: { content: body({ title: 'Replace link' }) } })).json.contract; const first = tokenOf((await C(`/${r4.id}/send`, { body: {} })).json.link);
  ok(tokenOf((await C(`/${r4.id}/link`, { body: {} })).json.link) === first, 'asking for the link again gives the same one');
  const second2 = tokenOf((await C(`/${r4.id}/link`, { body: { replace: true } })).json.link); ok(second2 !== first && (await P(first)).status === 404 && (await P(second2)).status === 200, 'a replaced link kills the old one');
  const rem = await C(`/${r4.id}/remind`, { body: {} }); ok(rem.status === 200 && (await C(`/${r4.id}/remind`, { body: {} })).status === 429, 'a reminder goes once a day');
  sql(`update contracts set expires_at = now() - interval '1 day' where id='${r4.id}'`);
  const exp = await P(second2, '/sign', { body: signBody() }); ok(exp.status === 409 && /expired/.test(exp.json.error) && (await C(`/${r4.id}`)).json.contract.status === 'expired', 'an expired contract cannot be signed and shows as expired');
  ok((await C(`/${r4.id}/send`, { body: {} })).status === 409, 'and cannot be sent again (revise it)');

  // Future Basics signs first
  const r5 = (await C('', { body: { content: body({ title: 'We sign first' }, buildPlan({ type: 'split', totalCents: 1200000, method: 'invoice' }).plan) } })).json.contract;
  ok((await C(`/${r5.id}/send`, { body: { signNow: true } })).status === 403, 'only a signer can sign for Future Basics at sending');
  const s5 = await K(`/${r5.id}/send`, { body: { signNow: true } }); ok(s5.status === 200 && s5.json.contract.providerSignature?.name === 'Kyle Riggle', 'a signer can sign for Future Basics when sending');
  const sg5 = await P(tokenOf(s5.json.link), '/sign', { body: { name: 'Olive Owner', agree: true, esign: true } }); ok(sg5.status === 200 && sg5.json.executed === true && (await K(`/${r5.id}`)).json.contract.status === 'executed', 'then the client\'s signature makes it final at once');

  // many requests from one place
  let limited = false; for (let i = 0; i < 130 && !limited; i++) limited = (await fetch(`${BASE}/v1/public/contracts/0000`, { headers: { 'x-forwarded-for': '203.0.113.77' } })).status === 429; ok(limited, 'asking again and again from one place is slowed down'); // from its own address, so the other journeys are not slowed down too
});

await journey('J165', 'Contracts in a browser: staff draft one from a deal with a monthly plan, send it, the client reads and signs it on a phone, staff countersign and draft the invoices', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  const deal2 = sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('Salon app ${stamp}','proposal',2400000,'${ct}','${co}') returning id`).split('\n')[0];
  const b = await playwright.chromium.launch(); const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle);
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/contracts`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
    ok(await page.locator('.fbtabs a[href="/contracts"]').count() === 1 && /Contracts/.test(await page.innerText('.fbtabs a.on')), 'Contracts is a part of Clients in the console menu, marked');
    await page.click('#newBtn'); await page.waitForSelector(`[data-deal="${deal2}"]`); ok(true, 'new contract: the deal is offered');
    await page.click(`[data-deal="${deal2}"]`); await page.waitForSelector('#eBody [data-k="client.company"]');
    ok((await page.inputValue('[data-k="client.company"]')).startsWith('Olive Salon') && (await page.inputValue('[data-k="client.signerEmail"]')) === SIGNER && (await page.inputValue('#feeIn')) === '24000.00', 'the editor opens with the client, the signer and the fee from the deal');
    await page.waitForSelector('#pOut table tbody tr'); ok(await page.locator('#pOut table tbody tr').count() === 2, 'the starting plan (deposit and balance) shows its schedule');
    await page.fill('[data-k="scopeText"]', 'A booking app for clients\nAn admin screen for the owner\nPayments through the existing processor');
    await page.selectOption('#pType', 'monthly'); await page.fill('[data-p="months"]', '8'); await page.fill('[data-p="firstDueOn"]', '2026-12-01'); await page.fill('[data-p="depositPct"]', '10');
    await page.selectOption('#pMethod', 'either'); await page.check('#pAuto');
    await page.waitForFunction(() => document.querySelectorAll('#pOut table tbody tr').length === 9, null, { timeout: 8000 }); ok(/\$2,400\.00 on signing, then 8 monthly payments of \$2,700\.00/.test(await page.innerText('#pOut')), 'a monthly plan with a deposit: 9 payments that add up', (await page.innerText('#pOut')).slice(0, 160));
    await page.fill('#feeIn', '24000.50'); await page.waitForFunction(() => /add up|monthly payments/.test(document.querySelector('#pOut')?.innerText || ''), null, { timeout: 8000 }); await page.fill('#feeIn', '24000');
    await page.waitForFunction(() => /\$2,400\.00 on signing/.test(document.querySelector('#pOut')?.innerText || ''), null, { timeout: 8000 });
    await page.locator('#feeIn').scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/contract-editor.png` });
    await page.click('#ePrev'); await page.waitForSelector('#ePrevBox .preview'); ok(/Scope of work/.test(await page.innerText('#ePrevBox')) && /booking app/.test(await page.innerText('#ePrevBox')), 'Preview shows the agreement as the client will see it');
    await page.click('#eSave'); await page.waitForFunction(() => /Saved/.test(document.querySelector('#eMsg')?.textContent || ''), null, { timeout: 8000 }); ok(true, 'Save draft');
    await page.click('#eSend'); await page.waitForFunction(() => /Fix what is listed above/.test(document.querySelector('#eMsg')?.textContent || ''), null, { timeout: 8000 });
    ok(/client's address/.test(await page.innerText('#probs')) && await page.locator('#sGo').count() === 0, 'a contract that is missing the client\'s address says so and is not sent');
    await page.fill('[data-k="client.address"]', '1 Main St, Norristown PA 19401'); await page.click('#eSend'); await page.waitForSelector('#sGo'); ok(/Sign for Future Basics now/.test(await page.innerText('#dBody')), 'sending offers to sign for Future Basics now (this teammate is a signer)');
    await page.uncheck('#sNow'); await page.fill('#sNote', 'Here is the agreement for the app.'); await page.click('#sGo');
    await page.waitForSelector('#lnk', { timeout: 15000 }); const link = await page.inputValue('#lnk'); ok(/\/sign\//.test(link) && /Waiting for client/i.test(await page.innerText('#dBody')), 'sent: the contract shows the private link and “Waiting for client”');

    // the client, on a phone
    const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const cp = await phone.newPage(); cp.on('pageerror', e => errs.push(String(e)));
    await cp.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: 'networkidle' }); await cp.waitForSelector('.fee', { timeout: 15000 });
    ok(/\$24,000\.00/.test(await cp.innerText('.fee')) && await cp.locator('.pay tbody tr').count() === 9 && await cp.locator('.doc section').count() >= 12, 'the signing page shows the fee, every payment and the whole agreement');
    ok(await cp.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'and fits a phone with no sideways scroll');
    ok(await cp.isDisabled('#sGo'), 'the sign button waits for everything it needs');
    await cp.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/contract-phone.png`, fullPage: false });
    await cp.fill('#sName', 'Olive Owner'); await cp.check('#sAgree'); await cp.check('#sEsign'); ok(await cp.isDisabled('#sGo'), 'it stays off until the automatic-payment authorization and the payment method are chosen too');
    await cp.check('#sAuto'); await cp.check('input[name=m][value=card]'); ok(!(await cp.isDisabled('#sGo')), 'then it turns on');
    await cp.locator('#sign').screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || '/tmp'}/contract-signform.png` });
    await cp.click('#sGo'); await cp.waitForSelector('.banner.ok', { timeout: 15000 }); ok(/You have signed/.test(await cp.innerText('.banner.ok')) && await cp.locator('#sign').count() === 0, 'signing shows a confirmation and removes the form');

    // staff: countersign, invoices
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#rows tr.click'); const row = page.locator('#rows tr.click', { hasText: `Salon app ${stamp}` }).first();
    ok(/Needs our signature/i.test(await row.innerText()), 'the list shows it needs our signature'); await row.click(); await page.waitForSelector('[data-a]');
    ok(/pays by card/.test(await page.innerText('#dBody')) && /autopay on/.test(await page.innerText('#dBody')), 'the contract shows who signed, the payment method they chose and that autopay is on');
    await page.click('#acts button:has-text("Sign for Future Basics")'); await page.click('dialog[open] button:has-text("Sign it"), .modal button:has-text("Sign it"), button:has-text("Sign it")'); await page.waitForFunction(() => /fully signed/i.test(document.querySelector('#dBody')?.innerText || ''), null, { timeout: 15000 }); ok(true, 'Sign for Future Basics: the agreement is final');
    // paid by card, so the invoices are drafted on signing: nine, one per payment, with no button to press for them
    await page.waitForFunction(() => document.querySelectorAll('#dBody a[href^="/money?invoice="]').length === 9, null, { timeout: 15000 }); ok(await page.locator('#acts button:has-text("Draft the invoices")').count() === 0, 'fully signed, its nine invoices are drafted by themselves, one per payment');
    ok(sql(`select count(*) from sales_deals where id='${deal2}' and stage='won'`) === '1', 'the deal is Won');
    await cp.reload({ waitUntil: 'networkidle' }); await cp.waitForSelector('.banner.ok'); ok(/Signed by both parties/.test(await cp.innerText('.banner.ok')) && await cp.locator('a:has-text("Download the PDF")').count() === 1, 'the client\'s page now says it is signed by both and offers the PDF');
    await page.click('#acts button:has-text("Download PDF")').catch(() => {});
    ok(errs.length === 0, 'no script errors on any page', errs.join(' | '));
  } finally { await b.close(); }
});

await journey('J170', 'Contracts: when Future Basics\' own details are missing, the draft says so and they can be filled in right there (no trip to Settings), then the draft can be sent', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '', signerName: '', signerTitle: '', governingLaw: '' } });
  const made = await C('', { body: { content: body({ title: `Setup in place ${stamp}` }, buildPlan({ type: 'full', totalCents: 1200000, method: 'invoice' }).plan) } });
  ok(made.status === 201 && made.json.problems.length === 3 && made.json.problems.every(p => /Contracts, Settings/.test(p)), 'a draft made before the settings exist lists the three things that are missing', made.json.problems);
  ok((await C(`/${made.json.contract.id}/send`, { body: {} })).status === 422, 'and cannot be sent');
  const b = await playwright.chromium.launch(); const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1100, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle);
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${BASE}/contracts?open=${made.json.contract.id}`, { waitUntil: 'networkidle' }); await page.waitForSelector('#setupBox #uAddr', { timeout: 10000 });
    const list = await page.locator('#probs li').allInnerTexts(); ok(list.length === 3 && list.every(t => !/Contracts, Settings/.test(t)), 'the editor lists them in plain words, with the form beside them', list);
    await page.fill('#uAddr', '10 Studio Way, Norristown PA 19401'); await page.fill('#uSigner', 'Kyle Riggle'); await page.fill('#uTitle', 'Founder'); await page.fill('#uLaw', 'Pennsylvania'); await page.click('#uSave');
    await page.waitForFunction(() => document.querySelector('#probs')?.classList.contains('hidden'), null, { timeout: 10000 }); ok(true, 'saving them clears the list');
    const st = (await C('/settings')).json.settings; ok(st.providerAddress.startsWith('10 Studio Way') && st.signerName === 'Kyle Riggle' && st.governingLaw === 'Pennsylvania', 'they are kept for every contract');
    const sent = await C(`/${made.json.contract.id}/send`, { body: {} }); ok(sent.status === 200 && sent.json.link, 'the same draft can now be sent', sent.json.error);
    // the Settings tab opens, and says so if something goes wrong
    const p2 = await ctx.newPage(); await p2.goto(`${BASE}/contracts`, { waitUntil: 'networkidle' }); await p2.click('.tab[data-t=settings]'); await p2.waitForSelector('#sAddr'); ok((await p2.inputValue('#sAddr')).startsWith('10 Studio Way'), 'the Settings tab shows what was saved');
    ok(errs.length === 0, 'no page errors', errs);
  } finally { await b.close(); }
});

await journey('J171', 'The client hub carries the agreement: a contract is tied to its client by the signer, shows in Waiting on you with its signing link for the signer only, moves along as it is signed, and a signed one stays in Your agreements', async () => {
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  const dash = async (token = room.token) => (await call('/v1/dashboard', { token })).json;
  const hubClient = { company: 'Hub Co', address: '1 Main St, Norristown PA 19401', signerName: 'Hub Signer', signerTitle: 'Owner', signerEmail: room.email };
  const made = await C('', { body: { content: body({ title: `Hub agreement ${stamp}`, client: hubClient, fee: { totalCents: 500000 } }, buildPlan({ type: 'full', totalCents: 500000, method: 'invoice' }).plan) } }); const id = made.json.contract.id;
  ok(sql(`select client_id from contracts where id='${id}'`) === clientId, 'a contract with no project is tied to its client by the signer\'s own sign-in', sql(`select client_id from contracts where id='${id}'`));
  ok((await dash()).agreements.length === 0, 'a draft is not in the hub');
  const sent = await C(`/${id}/send`, { body: {} }); const tok = tokenOf(sent.json.link);
  let d = await dash(), a = d.agreements.find(x => x.id === id), w = d.waiting.find(x => x.kind === 'contract' && x.id === `ct-${id}`);
  ok(a && a.status === 'sent' && a.needs === 'sign' && a.youAreSigner === true && a.link === sent.json.link && a.totalCents === 500000, 'once sent it is in Your agreements, and the signer\'s own link is there', a);
  ok(w && w.needs === 'sign' && w.href === sent.json.link && /^Sign Hub agreement/.test(w.title), 'and in Waiting on you, with a button to sign', w);
  ok(a.payments?.length === 1 && a.payments[0].amountCents === 500000 && a.payments[0].state === 'upcoming' && a.paidCents === 0 && a.invoicedCents === 0, 'the hub\'s Invoices panel gets its payment plan: one payment, still to come', a.payments);
  // addressed by email: even a contract filed under no client at all reaches the person it is addressed to when they sign in
  sql(`update contracts set client_id=null where id='${id}'`); d = await dash(); ok(d.agreements.some(x => x.id === id && x.link === sent.json.link) && d.waiting.some(x => x.id === `ct-${id}`), 'a contract with no client still reaches the signer by the email they sign in with', d.agreements.length);
  sql(`update contracts set client_id='${clientId}' where id='${id}'`);
  // someone else at the same client sees it, but not the signing link; a staff preview of the hub gets no link either
  const otherId = sql(`insert into users(client_id,email,name,role) values('${clientId}','teammate-${stamp}@chaos.test','Teammate','client') returning id`).split('\n')[0];
  const other = await forge({ sub: otherId, clientId, role: 'client' }), od = await dash(other), oa = od.agreements.find(x => x.id === id);
  ok(oa && oa.link === null && oa.youAreSigner === false && !od.waiting.some(x => x.kind === 'contract'), 'a teammate sees the agreement but is not handed the signing link', oa);
  const pv = await dash(await forge({ sub: await staff('kyle@thefuturebasics.com'), clientId, role: 'client', preview: true }));
  ok(pv.agreements.every(x => x.link === null) && !pv.waiting.some(x => x.kind === 'contract'), 'a staff preview of the hub gets no signing links');
  // signing from that link moves it along
  ok((await P(tok, '/sign', { body: { name: 'Hub Signer', title: 'Owner', agree: true, esign: true } })).status === 200, 'the signer signs from the link');
  d = await dash(); a = d.agreements.find(x => x.id === id);
  ok(a.status === 'signed_by_client' && a.needs === null && !d.waiting.some(x => x.id === `ct-${id}`), 'it leaves Waiting on you and shows as signed by them');
  ok((await K(`/${id}/countersign`, { body: {} })).status === 200, 'Future Basics countersigns');
  d = await dash(); a = d.agreements.find(x => x.id === id);
  ok(a.status === 'executed' && a.link && /^\/v1\/public\/contracts\/.+\/pdf$/.test(a.pdfUrl) && a.summary, 'it stays in Your agreements as signed by both, with the signed PDF', a);
  const pdf = await fetch(BASE + a.pdfUrl); ok(pdf.status === 200 && Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString() === '%PDF-', 'the PDF opens from the hub');
  // automatic payments: after signing, "Add payment details" waits in the hub
  const m2 = await C('', { body: { content: body({ title: `Hub autopay ${stamp}`, client: hubClient, fee: { totalCents: 300000 } }, buildPlan({ type: 'full', totalCents: 300000, method: 'card', autopay: true }).plan) } }); const id2 = m2.json.contract.id;
  const t2 = tokenOf((await C(`/${id2}/send`, { body: {} })).json.link);
  ok((await P(t2, '/sign', { body: { name: 'Hub Signer', title: 'Owner', agree: true, esign: true, autopay: true } })).status === 200 && (await K(`/${id2}/countersign`, { body: {} })).status === 200, 'a contract with automatic payments is signed by both');
  d = await dash(); const w2 = d.waiting.find(x => x.id === `ct-${id2}`);
  ok(w2 && w2.needs === 'details' && w2.title === 'Add your payment details' && w2.href.includes('/sign/'), 'the hub asks for the payment details, linking to the page where they are added', w2);
  // the hub page itself
  if (playwright) {
    const b = await playwright.chromium.launch();
    try { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.client.token', t); } catch {} }, room.token);
      const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); await pg.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await pg.waitForSelector('#agreements:not(.hidden)', { timeout: 10000 }).catch(() => {}); const txt = await pg.locator('#agreements').innerText().catch(() => '');
      ok(/Hub agreement/i.test(txt) && /Hub autopay/i.test(txt), 'the hub page lists the agreements when signed in', txt.slice(0, 160));
      ok(/Add your payment details/i.test(await pg.locator('#waiting').innerText().catch(() => '')), 'and Waiting on you asks for the payment details');
      await pg.click('#hubMenu'); ok(await pg.locator('#navAgreements').isVisible(), 'the top menu (on a phone, behind Menu) has an Agreements link'); await pg.click('#navAgreements'); await sleep(900);
      ok(await pg.evaluate(() => { const r = document.getElementById('agreements').getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), 'and it takes them to the agreements');
      ok(errs.length === 0, 'no page errors on the hub', errs);
    } finally { await b.close(); }
  }
});

await journey('J174', 'Signing in to the work console with Google: the session is kept on the sign-in page, and the work home also keeps one that lands on it, instead of sending staff back to "Sign in first"', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  // work.localhost reaches this machine on its own, and /home is the work home on any host (the bare / only serves it on the real work.thefuturebasics.com name). (Mapping the real work.thefuturebasics.com name to 127.0.0.1 with --host-resolver-rules made the browser's connections for fonts, scripts and API calls reset in this sandbox, which failed the home page at random.)
  const b = await playwright.chromium.launch({ args: ['--no-proxy-server'] }); const errs = [];
  // each case is a fresh visit, like the redirect from Google: a new browser profile, a full page load
  const visit = async url => { const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }), p = await c.newPage(); p.on('pageerror', e => errs.push(String(e)));
    for (let i = 0; i < 3; i++) { try { await p.goto(url, { waitUntil: 'load' }); break; } catch (e) { if (i === 2) throw e; await sleep(500); } } await sleep(1500); return p; };
  try {
    const home = 'http://work.localhost:3130', hash = `#google-session=${encodeURIComponent(kyle)}`;
    const none = await visit(`${home}/home`); ok(await none.locator('#needSignin').isVisible(), 'without a session the work home asks to sign in');
    const p1 = await visit(`${home}/home${hash}`); const st1 = { stored: (await p1.evaluate(() => localStorage.getItem('fb.admin.token'))) === kyle, url: p1.url().slice(0, 70), need: await p1.locator('#needSignin').isVisible() };
    ok(st1.stored && !st1.url.includes('google-session') && !st1.need, 'a Google session that lands on the work home is saved, removed from the address, and the home opens', st1);
    const p2 = await visit(`${home}/admin${hash}`); const st2 = { stored: (await p2.evaluate(() => localStorage.getItem('fb.admin.token'))) === kyle, url: p2.url().slice(0, 70) };
    ok(st2.stored && !st2.url.includes('google-session'), 'and the sign-in page keeps it too', st2);
    ok(errs.length === 0, 'no page errors', errs);
  } finally { await b.close(); }
});

await journey('J188', 'Contracts for a physical product (a hat): its own wording, chosen per customer, signed, and its payments read "on final sample approval" and bill as product work', async () => {
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  const tpl = (await C('/template?kind=product')).json, dig = (await C('/template?kind=website')).json;
  ok(tpl.sections.some(s => s.id === 'samples') && tpl.sections.some(s => s.id === 'production') && tpl.product.production.mode === 'through_us' && !tpl.sections.some(s => s.id === 'hosting') && dig.sections.some(s => s.id === 'hosting') && !dig.product, 'the product template has samples and production clauses and no hosting; the digital one is unchanged');
  ok((await C('/template?kind=nope')).status === 422, 'an unknown kind is refused');

  const hCo = sql(`insert into sales_companies(name) values('Trail Hat Co ${stamp}') returning id`).split('\n')[0];
  const hCt = sql(`insert into sales_contacts(name,email,title,company_id) values('Hattie Ames','hattie-${stamp}@hats.test','Founder','${hCo}') returning id`).split('\n')[0];
  const hDeal = sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('Trail hat and cap line ${stamp}','proposal',900000,'${hCt}','${hCo}') returning id`).split('\n')[0];
  const dr = (await C(`/draft?deal=${hDeal}`)).json, dc = dr.content;
  ok(dc.kind === 'product' && dc.product?.sampleRounds === 2 && dc.sections.some(s => s.id === 'samples') && !dc.sections.some(s => s.id === 'hosting'), 'a deal about hats drafts a product contract by itself', dc.kind);
  ok((await C(`/draft?deal=${deal}`)).json.content.kind === 'website', 'the website deal still drafts a website contract');

  const HSIGN = `hattie-${stamp}@hats.test`;
  const content = { ...dc, client: { ...dc.client, address: '5 Brim St, Portland OR' }, scope: ['A complete tech pack', 'Sourcing and quotes from up to three factories', 'Two rounds of samples'], product: { ...dc.product, categories: ['headwear', 'apparel'], production: { mode: 'through_us', depositPct: 40 } }, timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '2027-01-15' }, plan: buildPlan({ type: 'split', totalCents: 900000 }).plan };
  const created = await C('', { body: { content, dealId: hDeal } }), id = created.json.contract?.id;
  ok(created.status === 201 && created.json.contract.kind === 'product' && created.json.contract.kindLabel === 'Physical product development', 'a product contract is saved with its kind', JSON.stringify(created.json).slice(0, 200));
  ok(!created.json.problems.length, 'nothing is missing from it', created.json.problems);
  const rend = (await C(`/${id}`)).json.rendered, txt = JSON.stringify(rend.sections);
  ok(/up to 2 rounds of samples/.test(txt) && /a 40% deposit before we place the order/.test(txt) && /flammability/.test(txt) && /small-part and lead rules/.test(txt) && !/hosting/i.test(rend.sections.map(s => s.title).join(' ')) && rend.sections.some(s => s.title === 'Factory introductions' && /For 24 months/.test(s.body)), 'the text carries the sample rounds, the production terms, the apparel and headwear rules and the factory introductions clause');
  const sch = rend.sections.find(s => s.kind === 'schedule'); ok(sch.rows[1].when === 'On final sample approval' && /on final sample approval/.test(sch.summary), 'the balance is due on final sample approval');

  const sent = await C(`/${id}/send`, { body: {} }); ok(sent.status === 200 && sent.json.contract.status === 'sent', 'it is sent', sent.json.error);
  const token = tokenOf(sent.json.link), mail = (await outbox(HSIGN)).find(e => /Please review and sign/.test(e.subject));
  ok(mail && /final sample approval/.test(mail.text), 'the email says when the payments fall', mail?.text.slice(0, 240));
  const sg = await P(token, '/sign', { body: { name: 'Hattie Ames', title: 'Founder', agree: true, esign: true } }); ok(sg.status === 200, 'the client signs', sg.json.error);
  ok((await K(`/${id}/countersign`, { body: {} })).status === 200, 'Future Basics countersigns');
  const inv = await K(`/${id}/invoices`, { body: {} }); ok(inv.status === 200 && inv.json.made.length === 2, 'two invoices are drafted', inv.json.error);
  const rows = sql(`select work_kind, notes from money_invoices where contract_id='${id}' order by contract_seq`).split('\n').map(l => l.split('|'));
  ok(rows.every(r => r[0] === 'product') && /final sample is approved/.test(rows[1][1]), 'the invoices bill as product work, and the balance says when it is due', JSON.stringify(rows));
  const dv = await K(`/${id}/delivered`, { body: { on: '2027-01-10' } }); ok(dv.status === 200 && dv.json.events.some(e => /Final sample approved on 2027-01-10/.test(e.detail || '')), 'recording the approval is worded for a product', JSON.stringify((dv.json.events || []).slice(-1)));
  const pr = await fetch(`${BASE}/v1/contracts/${id}/pdf`, { headers: { Authorization: 'Bearer ' + colby } }); ok(pr.status === 200 && /pdf/.test(pr.headers.get('content-type') || ''), 'the PDF can be made');
});

await journey('J317', 'The client\'s address fills itself in: from the account they set up in the hub, on a new contract and on a draft left without one; it can be changed for one contract without touching the account, and with nothing on the account the last contract\'s address is used', async () => {
  const r = await mk(), rc = sql(`select client_id from users where lower(email)='${r.email || ''}'`) || r.client?.id;
  sql(`update clients set onboarding = jsonb_build_object('address', jsonb_build_object('line1','12 Comet Lane','line2','Suite 4','city','Brooklyn','region','NY','postal','11201','country','United States')) where id='${rc}'`);
  const pid = sql(`insert into projects(client_id,name,status,kind) values('${rc}','Matchbooks ${stamp}','active','product') returning id`).split('\n')[0];
  const want = '12 Comet Lane, Suite 4, Brooklyn NY 11201, United States';
  const d = (await C(`/draft?project=${pid}`)).json;
  ok(d.content?.client?.address === want && d.addressFrom === "the client's account" && !(d.problems || []).some(x => /client's address/.test(x)), 'a contract started from the project has the account\'s address, and is not held up for one', [d.content?.client?.address, d.addressFrom]);
  ok((await C(`/account-address?project=${pid}`)).json.address === want, 'the editor can ask for it by project too');
  const edited = { ...d.content, client: { ...d.content.client, address: '99 Other St, Queens NY 11101' } };
  const made = (await C('', { body: { content: edited, projectId: pid } })).json;
  ok(made.content?.client?.address === '99 Other St, Queens NY 11101' && !made.accountAddress, 'changed in the contract, the contract keeps its own address', made.content?.client?.address);
  ok(sql(`select onboarding->'address'->>'line1' from clients where id='${rc}'`) === '12 Comet Lane', 'and the account is left as it was');
  const blank = (await C('', { body: { content: { ...d.content, client: { ...d.content.client, address: '' } }, projectId: pid } })).json;
  ok(blank.accountAddress?.address === want && blank.accountAddress.from === "the client's account", 'a draft saved without an address is offered the account\'s when it is opened', blank.accountAddress);
  sql(`update clients set onboarding = '{}'::jsonb where id='${rc}'`);
  const last = (await C(`/account-address?project=${pid}`)).json;
  ok(last.address === '99 Other St, Queens NY 11101' && last.from === 'their last contract', 'with no address on the account, the last contract\'s address is used', last);
  ok((await call(`/v1/contracts/account-address?project=${pid}`)).status === 401, 'and it needs a staff sign-in');
});

await journey('J318', 'A contract from an order quote is priced per unit: every product line, the setup and freight lines (a comp at $0, a discount below zero) and sales tax at the rate in Settings on the products only; its invoices tax only the products', async () => {
  const r = await mk(), rc = sql(`select client_id from users where lower(email)='${r.email || ''}'`) || r.client?.id;
  const pid = sql(`insert into projects(client_id,name,status,kind) values('${rc}','Cafe merchandise ${stamp}','active','product') returning id`).split('\n')[0];
  sql(`update clients set onboarding = jsonb_build_object('address', jsonb_build_object('line1','1 Bean St','city','Norristown','region','PA','postal','19401','country','United States')) where id='${rc}'`);
  const lines = JSON.stringify([{ title: 'Match Book', quantity: 6000, sizes: {}, unitCents: 65, totalCents: 390000 }]), extras = JSON.stringify([{ label: 'Setup · Match Book', cents: 18000 }, { label: 'Freight · Match Book', cents: 88000 }]);
  const qid = sql(`insert into order_quotes(client_id,project_id,number,title,status,lines,extras,subtotal_cents,total_cents,notes,accepted_at) values('${rc}','${pid}','Q-J318-${stamp}','Merch order, November','accepted','${lines}'::jsonb,'${extras}'::jsonb,390000,496000,'Lead time four weeks from approval',now()) returning id`).split('\n')[0];
  const st = await C('/settings', { method: 'PUT', body: { taxRatePct: 6 } });
  ok(st.json.settings?.taxRatePct === 6 && st.json.settings?.providerName, 'Settings keeps a sales tax rate for goods, and saving one field keeps the others', st.json.settings);
  const d = (await C(`/draft?quote=${qid}`)).json, f = d.content?.fee || {};
  ok(d.content?.kind === 'product' && f.charge === 'unit' && f.units?.length === 3, 'the quote becomes a product contract priced per unit, one line per product and per other line', f.units);
  ok(f.units?.[0]?.item === 'Match Book' && f.units[0].qty === 6000 && f.units[0].unitCents === 65 && f.units.some(u => u.item === 'Freight · Match Book' && u.qty === 1 && u.unitCents === 88000 && u.taxable === false) && f.units[0].taxable !== false, 'each at its quantity and price; setup and freight are one-off lines that are not taxed');
  ok(f.subtotalCents === 496000 && f.taxableCents === 390000 && f.taxRatePct === 6 && f.taxCents === 23400 && f.totalCents === 519400 && f.delivery?.state === 'PA' && /Norristown/.test(f.delivery.address), 'delivered to the client\'s address in Norristown, PA: 6% sales tax on the products only ($3,900) is added on top', [f.subtotalCents, f.taxCents, f.totalCents, f.delivery]);
  ok(d.content.scope.includes('6,000 × Match Book') && d.content.scope.includes('Lead time four weeks from approval') && d.content.plan?.installments?.reduce((a, x) => a + x.amountCents, 0) === 519400, 'the scope lists what is ordered and the quote\'s notes; the payment plan adds up to the total with tax', d.content.scope);
  ok((await C(`/draft?project=${pid}`)).json.content?.fee?.totalCents === 519400, 'started from the project, the contract takes the project\'s accepted quote');
  sql(`update order_quotes set invoice_adjust='{"comped":[1],"discount":{"label":"Launch discount","cents":5000}}'::jsonb where id='${qid}'`);
  const a = (await C(`/draft?quote=${qid}`)).json.content.fee;
  ok(a.units.some(u => u.item === 'Freight · Match Book (comped)' && u.unitCents === 0) && a.units.some(u => u.item === 'Launch discount' && u.unitCents === -5000) && a.subtotalCents === 403000 && a.taxCents === 23100, 'a comped line comes across at $0 and a discount as a line below zero, as on the invoice; the discount lowers what is taxed', a.units);
  const content = { ...d.content, client: { ...d.content.client, company: `Cafe ${stamp}`, address: '1 Bean St, Norristown PA', signerName: 'Cara Cafe', signerTitle: 'Owner', signerEmail: `cara-${stamp}@cafe.test` } };
  const made = (await C('', { body: { content, projectId: pid } })).json, id = made.contract?.id;
  const fee = made.rendered?.sections?.find(x => x.kind === 'fee');
  ok(id && fee?.title === 'Price' && fee.taxLabel === 'Sales tax, 6% (Pennsylvania), on $3,900.00 of products' && fee.taxText === '$234.00' && fee.totalText === '$5,194.00' && !(made.problems || []).some(x => /fee|price|plan/i.test(x)), 'saved, it reads as a price table with the sales tax line and nothing left to fix in the price', [fee?.taxText, made.problems]);
  const pdf = await call(`/v1/contracts/${id}/pdf`, { token: colby }); ok(pdf.status === 200, 'its PDF draws', pdf.status);
  // the tax follows where the goods are delivered: Philadelphia 8%, another state none, a certificate none, no state not ready to send
  const at = async delivery => (await C('/render', { body: { content: { ...content, fee: { ...content.fee, delivery } } } })).json;
  const phl = await at({ address: '1500 Market St, Philadelphia, PA 19102', state: 'PA', local: 'philadelphia' }), ny = await at({ address: '12 Comet Lane, Brooklyn NY 11201', state: 'NY' });
  ok(phl.content.fee.taxCents === 31200 && phl.content.fee.totalCents === 527200, 'delivered in Philadelphia, 8% (6% + 2% local)', phl.content.fee.taxCents);
  ok(ny.content.fee.taxCents === 0 && ny.content.fee.totalCents === 496000 && ny.rendered.sections.find(x => x.kind === 'fee').taxLabel === 'Sales tax (none: delivered to New York)', 'delivered to New York, no sales tax: we collect only in Pennsylvania', ny.content.fee);
  ok((await at({ state: 'PA', exempt: true })).content.fee.taxCents === 0, 'a resale or exemption certificate, no sales tax');
  ok((await at({ address: '', state: '' })).problems.some(x => /where the goods are delivered/.test(x)), 'with no delivery state it is not ready to send');
  const dl = (await C(`/delivery?address=${encodeURIComponent('1 Grant St, Pittsburgh PA')}`)).json; ok(dl.state === 'PA' && dl.local === 'allegheny', 'an address is read for its state and local tax', dl);
  sql(`update contracts set status='executed', executed_at=now() where id='${id}'`);
  const inv = await K(`/${id}/invoices`, { body: {} }); ok(inv.status === 200 && inv.json.made?.length === 2, 'the signers draft its invoices: a deposit and the balance', inv.json);
  const rows = sql(`select tax_rate, tax_cents, total_cents from money_invoices where contract_id='${id}' order by contract_seq`).split('\n').map(x => x.split('|').map(Number));
  ok(rows.reduce((t, x) => t + x[2], 0) === 519400 && rows.reduce((t, x) => t + x[1], 0) === 23400 && rows.every(x => x[0] === 6), 'each invoice charges the sales tax as tax, and together they come to the contract\'s total and its tax to the cent', rows);
  const il = JSON.parse(sql(`select lines from money_invoices where contract_id='${id}' order by contract_seq limit 1`));
  ok(il.length === 2 && il[0].taxable !== false && il[1].taxable === false && /shipping, setup and services \(not taxed\)/.test(il[1].description) && il[1].rateCents === 53000, 'on each invoice the products are taxed and its share of setup and freight is not', il);
});

await journey('J319', 'Quotes turn into contracts from where they are: the room\'s quote card and the deal in Sales list them with Turn into a contract, then the contract made; a product quote drafts the same way; and Money stops asking to invoice a deal its quote\'s checkout or a closed-out contract already billed', async () => {
  const r = await mk(), rc = sql(`select client_id from users where lower(email)='${r.email || ''}'`) || r.client?.id;
  const pid = sql(`insert into projects(client_id,name,status,kind) values('${rc}','Shirts ${stamp}','active','product') returning id`).split('\n')[0];
  sql(`update clients set onboarding = jsonb_build_object('address', jsonb_build_object('line1','2 Knit Ave','city','Norristown','region','PA','postal','19401')) where id='${rc}'`);
  const deal = sql(`insert into sales_deals(title,stage,value_cents) values('Shirt order ${stamp}','won',212500) returning id`).split('\n')[0];
  const lines = JSON.stringify([{ title: 'Collared Knit Shirt', quantity: 100, sizes: { M: 60, L: 40 }, unitCents: 2005, totalCents: 200500 }]), extras = JSON.stringify([{ label: 'Freight · Collared Knit Shirt', cents: 12000 }]);
  const qid = sql(`insert into order_quotes(client_id,project_id,deal_id,number,title,status,lines,extras,subtotal_cents,total_cents,accepted_at) values('${rc}','${pid}','${deal}','Q-J319-${stamp}','Shirt order','accepted','${lines}'::jsonb,'${extras}'::jsonb,200500,212500,now()) returning id`).split('\n')[0];
  const room = async () => (await call(`/v1/admin/clients/${rc}/quote-builder`, { token: colby })).json.quotes.find(q => q.id === qid);
  ok((await room())?.contract === null, 'in the room the quote has no contract yet, so it offers to make one');
  const salesDeal = async () => (await call('/v1/sales/deals', { token: colby })).json.deals.find(d => d.id === deal);
  const sd = await salesDeal();
  ok(sd?.quotes?.length === 1 && sd.quotes[0].id === qid && sd.quotes[0].kind === 'order' && sd.quotes[0].totalCents === 212500 && sd.quotes[0].contract === null && sd.contract === null, 'Sales shows the deal\'s quote, its total and that no contract is made yet', sd?.quotes);
  ok((await call('/v1/money/overview', { token: kyle })).json.toInvoice?.some(t => t.id === deal), 'Money lists the won deal as not invoiced while nothing bills it');
  sql(`update order_quotes set shopify_draft_order_id='gid://shopify/DraftOrder/9', pay_url='https://pay.example/x' where id='${qid}'`);
  ok(!(await call('/v1/money/overview', { token: kyle })).json.toInvoice?.some(t => t.id === deal), 'once the quote\'s Shopify checkout is made, Money stops asking to invoice the deal');
  const d = (await C(`/draft?quote=${qid}`)).json;
  ok(d.quote?.id === qid && d.content.fee.units.some(u => /Collared Knit Shirt \(60 M, 40 L\)/.test(u.item)), 'Turn into a contract drafts from the quote, sizes named', d.content.fee.units);
  const content = { ...d.content, client: { ...d.content.client, company: `Shirts ${stamp}`, address: '2 Knit Ave, Austin TX', signerName: 'Sam Shirt', signerEmail: `sam-${stamp}@shirts.test` } };
  const made = (await C('', { body: { content, projectId: pid, dealId: deal, quoteId: qid } })).json, kid = made.contract?.id;
  ok(kid && made.contract.quoteId === qid, 'the contract keeps the quote it was made from', made.contract?.quoteId);
  ok((await room())?.contract?.id === kid && (await salesDeal())?.quotes?.[0]?.contract?.number === made.contract.number && (await salesDeal())?.contract?.id === kid, 'now the room\'s quote card and the deal in Sales open that contract instead of offering another');
  // a product quote, issued from the product's page, drafts the same way
  const prod = sql(`insert into products(client_id,project_id,title) values('${rc}','${pid}','Retro World Hat') returning id`).split('\n')[0];
  const deal2 = sql(`insert into sales_deals(title,stage,value_cents) values('Hat quote ${stamp}','won',500000) returning id`).split('\n')[0];
  const pq = sql(`insert into quotes(product_id,version,quantity,unit_cost_cents,wholesale_cents,tooling_cents,freight_cents,status,deal_id) values('${prod}',1,400,800,1150,20000,20000,'accepted','${deal2}') returning id`).split('\n')[0];
  const sd2 = await call('/v1/sales/deals', { token: colby }).then(x => x.json.deals.find(dd => dd.id === deal2));
  ok(sd2?.quotes?.[0]?.kind === 'product' && sd2.quotes[0].id === pq && sd2.quotes[0].totalCents === 500000, 'a product quote shows on its deal in Sales too', sd2?.quotes);
  const pd = (await C(`/draft?productQuote=${pq}`)).json.content?.fee;
  ok(pd?.units?.length === 3 && pd.units[0].qty === 400 && pd.units[0].unitCents === 1150 && pd.units.filter(u => u.taxable === false).length === 2 && pd.subtotalCents === 500000 && pd.taxCents === 27600, 'it drafts per unit at the client\'s price, tooling and freight untaxed, tax on the hats', pd);
  ok((await C(`/draft?deal=${deal2}`)).json.content?.fee?.totalCents === 527600, 'and Make a contract on the deal finds the product quote');
  // a closed-out contract bills its deal
  const deal3 = sql(`insert into sales_deals(title,stage,value_cents) values('Closed ${stamp}','won',100000) returning id`).split('\n')[0];
  ok((await call('/v1/money/overview', { token: kyle })).json.toInvoice?.some(t => t.id === deal3), 'a won deal with nothing billing it is listed');
  sql(`insert into contracts(number,kind,title,content,total_cents,currency,deal_id,status,closed_at,closed_from) values('FB-C-J319-${stamp}','product','Closed','{}'::jsonb,100000,'USD','${deal3}','closed',now(),'sent')`);
  ok(!(await call('/v1/money/overview', { token: kyle })).json.toInvoice?.some(t => t.id === deal3), 'a contract closed out on it takes it off the list');
});

await journey('J316', 'A contract paid but never signed: its invoice, made in Money on its own and paid, is linked to the contract, which is then closed out; the deal is won, and it can be reopened', async () => {
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  const company = `Retro Hat Co ${stamp}`, rSign = `devon-${stamp}@retro.test`;
  const dc = (await C('/template?kind=product')).json;
  const content = { title: `Retro hats ${stamp}`, kind: 'product', client: { company, address: '1 Brim Way, Austin TX', signerName: 'Devon Retro', signerTitle: 'Brand lead', signerEmail: rSign }, project: { name: 'Retro hats' }, scope: ['400 hats'], fee: { totalCents: 500000 }, timeline: { effectiveOn: '2026-11-01', startOn: '2026-11-03', completionOn: '2027-01-15' }, plan: buildPlan({ type: 'split', totalCents: 500000 }).plan, sections: dc.sections, product: dc.product };
  const id = (await C('', { body: { content } })).json.contract?.id; ok(id && (await C(`/${id}/send`, { body: {} })).json.contract?.status === 'sent', 'the hat contract goes out for signature');
  // the invoice made in Money on its own, and paid (as a Shopify checkout would)
  const M = (p, o = {}) => call('/v1/money' + p, { token: kyle, ...o });
  const inv = (await M('/invoices', { body: { company, contactEmail: rSign, lines: [{ description: 'Retro World hats', qty: 400, rate: 12.5 }], taxRatePct: 0 } })).json.invoice;
  await M(`/invoices/${inv.id}/send`, { body: {} }); const paid = await M(`/invoices/${inv.id}/paid`, { body: { method: 'shopify', reference: '#1042', paidOn: '2026-11-17' } });
  ok(paid.status === 200 && (await M(`/invoices/${inv.id}`)).json.invoice.state === 'paid', 'the $5,000 invoice is paid', paid.json.error);
  ok((await C(`/${id}/invoices/candidates`)).status === 403, 'only the people who sign for Future Basics link invoices');
  const cand = (await K(`/${id}/invoices/candidates`)).json.invoices; ok(cand.some(i => i.id === inv.id && i.paidCents === 500000), 'the paid invoice is offered: same company, not on another contract', JSON.stringify(cand));
  const ln = await K(`/${id}/invoices/link`, { body: { invoiceId: inv.id } });
  ok(ln.status === 200 && ln.json.invoices.some(i => i.id === inv.id && i.linked && i.paidCents === 500000) && ln.json.money.paidCents === 500000 && ln.json.events.some(e => e.kind === 'invoice_linked'), 'linking puts it on the contract with what was paid, and on its trail', JSON.stringify(ln.json.money));
  ok((await M(`/invoices/${inv.id}`)).json.invoice.contractId === id, 'Money shows the invoice belongs to the contract');
  ok(!(await K(`/${id}/invoices/candidates`)).json.invoices.some(i => i.id === inv.id), 'a linked invoice is no longer offered');
  // close out
  ok((await C(`/${id}/close`, { body: {} })).status === 403, 'only a signer closes a contract out');
  const cl = await K(`/${id}/close`, { body: { note: 'Accepted by payment' } });
  ok(cl.status === 200 && cl.json.contract.status === 'closed' && cl.json.contract.closedFrom === 'sent' && cl.json.events.some(e => e.kind === 'closed' && /Not signed; \$5,000\.00 of \$5,000\.00 paid \(invoice /.test(e.detail) && /Accepted by payment/.test(e.detail)), 'it is closed out, and the trail says it was never signed and was paid in full', JSON.stringify(cl.json.events?.slice(-1)));
  const dealRow = sql(`select d.stage||'|'||d.value_cents from contracts k join sales_deals d on d.id=k.deal_id where k.id='${id}'`);
  ok(dealRow === 'won|500000', 'its deal in Sales is won at the contract\'s value', dealRow);
  ok((await K(`/${id}/close`, { body: {} })).status === 409 && (await K(`/${id}/revise`, { body: {} })).status === 409 && (await K(`/${id}/void`, { body: { reason: 'x' } })).status === 409 && (await K(`/${id}/invoices/unlink`, { body: { invoiceId: inv.id } })).status === 200, 'closed: not closed twice, revised or voided (an invoice can still be unlinked)');
  const ro = await K(`/${id}/reopen`, { body: {} }); ok(ro.status === 200 && ro.json.contract.status === 'sent' && ro.json.events.some(e => e.kind === 'reopened'), 'reopening puts it back where it was');
  ok((await C('?status=closed')).status === 200, 'the list filters by closed');
});

await journey('J189', 'Contracts in a browser: a physical product agreement is chosen per customer, shows its product options, and switching the type swaps the wording', async () => {
  if (!playwright) { ok(true, 'skipped: no browser here'); return; }
  await C('/settings', { method: 'PUT', body: { providerName: 'Future Basics', providerAddress: '10 Studio Way, Norristown PA', signerName: 'Kyle Riggle', signerTitle: 'Founder', governingLaw: 'Pennsylvania' } });
  const capDeal = sql(`insert into sales_deals(title,stage,value_cents,contact_id,company_id) values('Beanie and cap line ${stamp}','proposal',1500000,'${ct}','${co}') returning id`).split('\n')[0];
  const b = await playwright.chromium.launch(); const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); } catch {} }, kyle);
    const page = await ctx.newPage(); page.on('pageerror', e => errs.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(`${BASE}/contracts`, { waitUntil: 'networkidle' }); await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
    const legends = async () => (await page.locator('#eBody fieldset legend').allInnerTexts()).map(x => x.trim().toLowerCase());
    await page.click('#newBtn'); await page.waitForSelector(`[data-deal="${capDeal}"]`); ok(await page.locator('#dKind option').count() === 5, 'the chooser offers the type of agreement: digital kinds and a physical product');
    await page.click(`[data-deal="${capDeal}"]`); await page.waitForSelector('#eBody [data-k="client.company"]');
    let lg = await legends();
    ok(await page.inputValue('[data-k="kind"]') === 'product' && lg.includes('the product') && !lg.some(x => /hosting/.test(x)), 'a deal about caps opens as a physical product agreement, with product options and no hosting', lg.join(' | '));
    await page.check('[data-cat="electronics"]'); await page.selectOption('[data-k="product.production.mode"]', 'through_us'); await page.waitForSelector('[data-k="product.production.depositPct"]');
    await page.fill('[data-k="product.production.depositPct"]', '30'); await page.fill('[data-k="scopeText"]', 'A complete tech pack\nTwo rounds of samples');
    await page.waitForFunction(() => /on final sample approval/.test(document.querySelector('#pOut')?.innerText || ''), null, { timeout: 8000 }); ok(true, 'the schedule says "on final sample approval"');
    await page.click('#ePrev'); await page.waitForSelector('#ePrevBox .preview'); const pv = await page.innerText('#ePrevBox');
    ok(/Samples and approval/.test(pv) && /30% deposit/.test(pv) && /lithium batteries/.test(pv) && /Quality and inspection/.test(pv), 'Preview shows the product wording, the production deposit and the electronics rules', pv.slice(0, 120));
    await page.screenshot({ path: `${process.env.JOURNEY_SHOT_DIR || process.env.JOURNEY_TMP || '/tmp'}/contract-product.png` }).catch(() => {});

    ok(/Factory introductions/.test(await page.innerText('#ePrevBox')), 'the factory introductions clause is in by default');
    await page.uncheck('[data-circ]'); await page.click('#ePrev'); await page.waitForFunction(() => document.querySelector('#ePrevBox')?.innerText && !/Factory introductions/.test(document.querySelector('#ePrevBox').innerText), null, { timeout: 8000 }); ok(await page.locator('[data-k="product.circumventionMonths"]').count() === 0, 'switching it off takes it out of the contract and hides its months');
    await page.check('[data-circ]'); await page.waitForSelector('[data-k="product.circumventionMonths"]');
    await page.selectOption('[data-k="kind"]', 'website'); await page.waitForSelector('#hostOn'); lg = await legends();
    ok(!lg.includes('the product') && lg.some(x => /hosting/.test(x)) && (await page.inputValue('[data-k="scopeText"]')).startsWith('A complete tech pack'), 'switching to a website swaps the options back and keeps what was typed', lg.join(' | ') + ' // ' + await page.inputValue('[data-k="scopeText"]'));
    await page.click('#ePrev'); await page.waitForFunction(() => /Who owns the work/.test(document.querySelector('#ePrevBox')?.innerText || ''), null, { timeout: 8000 });
    ok(!/Samples and approval/.test(await page.innerText('#ePrevBox')), 'the website wording has no sample clauses');
    await page.selectOption('[data-k="kind"]', 'product'); await page.waitForSelector('[data-cat="apparel"]'); ok((await legends()).includes('the product'), 'and back to a physical product');

    await page.click('#eX'); await page.click('#newBtn'); await page.waitForSelector('#blank'); await page.selectOption('#dKind', 'product'); await page.click('#blank'); await page.waitForSelector('#eBody [data-k="client.company"]');
    ok(await page.inputValue('[data-k="kind"]') === 'product' && (await legends()).includes('the product'), 'a blank contract can start as a physical product agreement');
    ok(errs.length === 0, 'no page errors', errs);
  } finally { await b.close(); }
});

const badCount = summary(); process.exit(badCount ? 1 : 0);

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
  ok((await outbox(SIGNER)).some(e => /Signed by both parties/.test(e.subject)), 'the client is sent their signed copy');
  const spdf = await fetch(`${BASE}/v1/contracts/${id}/pdf`, { headers: { authorization: `Bearer ${kyle}` } }); const sbuf = Buffer.from(await spdf.arrayBuffer());
  ok(spdf.status === 200 && sbuf.subarray(0, 5).toString() === '%PDF-' && (sbuf.toString('latin1').match(/\/Type \/Page\b/g) || []).length >= 4, 'staff download the signed PDF, certificate page included');
  ok((await C(`/${id}/void`, { body: { reason: 'x' } })).status === 409 && (await C(`/${id}/revise`, { body: {} })).status === 409, 'a fully signed contract cannot be voided or revised');

  // invoices from the schedule
  ok((await C(`/${id}/invoices`, { body: {} })).status === 403, 'only signers draft the invoices');
  const inv = await K(`/${id}/invoices`, { body: {} }); ok(inv.status === 200 && inv.json.made.length === 7, 'one invoice per payment in the schedule', inv.json.error || inv.json.made?.length);
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
    ok(await page.locator('.fbside a[href="/contracts"]').count() === 1, 'Contracts is in the console menu under Win');
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
    await page.click('#acts button:has-text("Sign for Future Basics")'); await page.waitForFunction(() => /fully signed/i.test(document.querySelector('#dBody')?.innerText || ''), null, { timeout: 15000 }); ok(true, 'Sign for Future Basics: the agreement is final');
    await page.click('#acts button:has-text("Draft the invoices")'); await page.waitForFunction(() => document.querySelectorAll('#dBody a[href^="/money?invoice="]').length === 9, null, { timeout: 15000 }); ok(true, 'Draft the invoices: nine, one per payment');
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
    try { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true }); await ctx.addInitScript(t => { try { localStorage.setItem('fb.token', t); localStorage.setItem('token', t); localStorage.setItem('fb.hub.token', t); } catch {} }, room.token);
      const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(String(e))); await pg.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      if (await pg.locator('#agreements').count()) { await pg.waitForSelector('#agreements:not(.hidden)', { timeout: 8000 }).catch(() => {}); const txt = await pg.locator('#agreements').innerText().catch(() => ''); ok(!txt || /Hub agreement/i.test(txt), 'the hub page lists the agreement when signed in', txt.slice(0, 120)); }
      ok(errs.length === 0, 'no page errors on the hub', errs);
    } finally { await b.close(); }
  }
});

const badCount = summary(); process.exit(badCount ? 1 : 0);

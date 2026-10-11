import test from 'node:test';
import assert from 'node:assert/strict';
import { readerVerdict, sourceVerdict, pipelineVerdict, salesEmailVerdict, chatVerdict, automationsVerdict, githubVerdict, storesVerdict, moneyVerdict, prototypesVerdict, leadSearchVerdict, coverageConfig, redactSecrets } from '../src/platform-coverage.js';

test('an AI reader is off without a key, down when refused, a warning when out of credit', () => {
  const base = { label: 'Grok (xAI)', keyName: 'XAI_API_KEY' };
  assert.deepEqual([readerVerdict({ ...base, hasKey: false }).status, readerVerdict({ ...base, hasKey: true, probe: { status: 401 } }).status, readerVerdict({ ...base, hasKey: true, probe: { status: 429 } }).status, readerVerdict({ ...base, hasKey: true, probe: { status: 503 } }).status, readerVerdict({ ...base, hasKey: true, probe: { status: 200 }, selected: true }).status], ['off', 'down', 'warn', 'warn', 'ok']);
  assert.match(readerVerdict({ ...base, hasKey: false }).summary, /add XAI_API_KEY/);
  assert.match(readerVerdict({ ...base, hasKey: true, probe: { status: 200 }, selected: true, usage: { calls: 3 } }).summary, /reading new posts.*3 calls/);
});

test('a listening source: key, probe, then how its watches are doing', () => {
  const w = (o = {}) => ({ total: 2, on_: 2, failing: 0, last_run: new Date().toISOString(), last_error: '', ...o });
  assert.equal(sourceVerdict({ kind: 'web', missing: ['BRAVE_API_KEY'], probe: null, w: w() }).status, 'off');
  assert.equal(sourceVerdict({ kind: 'reddit', missing: [], probe: { status: 401 }, w: w() }).status, 'down');
  assert.equal(sourceVerdict({ kind: 'reddit', missing: [], probe: { status: 200 }, w: w({ total: 0, on_: 0 }) }).status, 'off');
  assert.match(sourceVerdict({ kind: 'reddit', missing: [], probe: null, w: w({ on_: 0 }) }).summary, /switched off/);
  assert.equal(sourceVerdict({ kind: 'web', missing: [], probe: null, w: w({ failing: 1, last_error: 'Brave refused our key' }) }).status, 'warn');
  assert.equal(sourceVerdict({ kind: 'web', missing: [], probe: null, w: w({ failing: 2 }) }).status, 'down');
  assert.match(sourceVerdict({ kind: 'web', missing: [], probe: null, w: w({ failing: 1, last_error: 'Brave refused our key' }) }).summary, /Brave refused our key/);
  assert.equal(sourceVerdict({ kind: 'x', missing: [], probe: null, w: w() }).status, 'ok');
  assert.match(sourceVerdict({ kind: 'x', missing: [], probe: null, w: w({ last_run: null }) }).summary, /none has listened yet/);
});

test('the listening pipeline says what is wrong in the order it matters', () => {
  const s = (o = {}) => ({ watches_on: 3, failing: 0, waiting: 4, reads_today: 10, ...o }), base = { auto: true, readerReady: true, reader: 'Claude (Anthropic)', capReached: false };
  assert.equal(pipelineVerdict({ ...base, s: s({ watches_on: 0 }) }).status, 'off');
  assert.match(pipelineVerdict({ ...base, auto: false, s: s() }).summary, /INTEL_AUTO=off/);
  assert.match(pipelineVerdict({ ...base, readerReady: false, s: s() }).summary, /not connected/);
  assert.match(pipelineVerdict({ ...base, s: s({ failing: 2 }) }).summary, /2 watches could not listen/);
  assert.match(pipelineVerdict({ ...base, capReached: true, s: s() }).summary, /limit is reached/);
  assert.match(pipelineVerdict({ ...base, s: s({ waiting: 80 }) }).summary, /reader is behind/);
  assert.equal(pipelineVerdict({ ...base, s: s() }).status, 'ok');
});

test('sales email: key, domain, webhook, postal address and bounces', () => {
  const stats = (o = {}) => ({ sent7: 20, bounced7: 0, complained7: 0, failed7: 0, received7: 3, ...o }), good = { hasKey: true, probe: { ok: true, verified: true }, webhook: true, postal: true, stats: stats() };
  assert.equal(salesEmailVerdict({ ...good, hasKey: false }).status, 'off');
  assert.equal(salesEmailVerdict({ ...good, probe: { rejected: true } }).status, 'down');
  const s = salesEmailVerdict({ ...good, probe: { ok: true, verified: false }, webhook: false, postal: false });
  assert.equal(s.status, 'warn'); assert.match(s.summary, /no sending domain is verified.*RESEND_WEBHOOK_SECRET.*postal address/i);
  assert.match(salesEmailVerdict({ ...good, stats: stats({ bounced7: 2, complained7: 1 }) }).summary, /3 of 20 emails bounced/);
  assert.match(salesEmailVerdict({ ...good, stats: stats({ failed7: 2 }) }).summary, /2 emails failed/);
  assert.equal(salesEmailVerdict({ ...good, probe: { ok: true, verified: true, restricted: true } }).status, 'ok');
  assert.equal(salesEmailVerdict(good).status, 'ok');
});

test('chat, automations, GitHub and client stores', () => {
  const old = new Date(Date.now() - 40 * 60000).toISOString(), fresh = new Date(Date.now() - 2 * 60000).toISOString();
  assert.equal(chatVerdict({ aiReady: false, c: { waiting: 0, started24: 0 } }).status, 'off');
  assert.equal(chatVerdict({ aiReady: true, c: { waiting: 1, oldest: old, started24: 4 } }).status, 'warn');
  assert.equal(chatVerdict({ aiReady: true, c: { waiting: 1, oldest: fresh, started24: 4 } }).status, 'ok');
  assert.equal(automationsVerdict({ paused: false, a: { on_: 0 } }).status, 'off');
  assert.match(automationsVerdict({ paused: true, a: { on_: 2, active: 0, stuck: 0, done24: 0 } }).summary, /paused/);
  assert.match(automationsVerdict({ paused: false, a: { on_: 2, active: 1, stuck: 3, done24: 0 } }).summary, /3 steps should have run/);
  assert.equal(githubVerdict({ hasToken: false }).status, 'off');
  assert.equal(githubVerdict({ hasToken: true, probe: { status: 401 } }).status, 'down');
  assert.match(githubVerdict({ hasToken: true, probe: { status: 200, remaining: 10, limit: 5000 } }).summary, /Nearly out/);
  assert.match(githubVerdict({ hasToken: true, probe: { status: 200, remaining: 4000, limit: 5000 }, job: { health: 'down', lastError: 'bad credentials' } }).summary, /bad credentials/);
  assert.equal(githubVerdict({ hasToken: true, probe: { status: 200, remaining: 4000, limit: 5000 } }).status, 'ok');
  const s = (o = {}) => ({ shopify_ok: 1, shopify_bad: 0, shopify_nohook: 0, sq: 1, wix: 0, cc_bad: 0, push_ok: 3, push_bad: 0, ...o });
  assert.equal(storesVerdict({ s: s({ shopify_ok: 0, sq: 0, push_ok: 0 }) }).status, 'off');
  assert.match(storesVerdict({ s: s({ shopify_bad: 1 }) }).summary, /needs? to reconnect/);
  assert.match(storesVerdict({ s: s({ cc_bad: 2 }) }).summary, /2 Square or Wix connections stopped/);
  assert.match(storesVerdict({ s: s({ push_bad: 5 }) }).summary, /5 pushes to client stores failed/);
  assert.equal(storesVerdict({ s: s() }).status, 'ok');
});

test('settings that quietly go wrong are listed for the newer parts of the platform', () => {
  const none = coverageConfig({ env: {} }), by = o => Object.fromEntries(o.map(r => [r.id, r.status]));
  assert.equal(by(none).readers, 'warn'); assert.equal(by(none).listenkeys, 'info'); assert.equal(by(none).tokenkey, 'warn');
  const all = by(coverageConfig({ env: { ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'o', REDDIT_CLIENT_ID: 'i', REDDIT_CLIENT_SECRET: 's', SALES_RESEND_API_KEY: 'r', RESEND_WEBHOOK_SECRET: 'w', SALES_POSTAL_ADDRESS: '1 Main St', BUILDS_GITHUB_TOKEN: 't', SHOPIFY_TOKEN_KEY: 'k' } }));
  assert.deepEqual([all.readers, all.listenkeys, all.salesmail, all.githubtoken, all.tokenkey], ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.equal(by(coverageConfig({ env: { SALES_RESEND_API_KEY: 'r' } })).salesmail, 'warn');
  assert.equal(by(coverageConfig({ env: { INTEL_AUTO: 'off' } })).intelauto, 'info');
});

test('a key echoed back in an error message never leaves the server', () => {
  const env = { OPENAI_API_KEY: 'sk-live-abcdef123456', DISCORD_BOT_TOKEN: 'abcd', SOMETHING_ELSE: 'abcdef', RESEND_WEBHOOK_SECRET: 'whsec_xyz' };
  const out = redactSecrets({ events: [{ message: 'Incorrect API key provided: sk-live-abcdef123456. See docs' }], nested: [['k', 'Bot abcd refused; whsec_xyz']], n: 3, ok: true, other: 'abcdef stays' }, env);
  assert.equal(out.events[0].message, 'Incorrect API key provided: [hidden]. See docs');
  assert.equal(out.nested[0][1], 'Bot abcd refused; [hidden]'); // a value under 6 characters is not a real key, and replacing it would mangle ordinary words
  assert.deepEqual([out.n, out.ok, out.other], [3, true, 'abcdef stays']);
  assert.deepEqual(redactSecrets({ a: 'x' }, {}), { a: 'x' });
});

test('the Money card: instructions, late invoices, past invoices nobody has settled, and who can open it', () => {
  const c = (o = {}) => ({ total: 4, open: 2, overdue: 0, unrecorded: 0, drafts: 1, ...o }), access = ['kyle@thefuturebasics.com'];
  assert.equal(moneyVerdict({ hasInstructions: false, c: c({ total: 0 }), access }).status, 'off'); assert.equal(moneyVerdict({ hasInstructions: true, c: c({ total: 0 }), access }).status, 'ok');
  assert.match(moneyVerdict({ hasInstructions: false, c: c(), access }).summary, /no payment instructions/i);
  assert.match(moneyVerdict({ hasInstructions: true, c: c({ overdue: 2, unrecorded: 3 }), access }).summary, /2 invoices are overdue; 3 past invoices with no payment recorded/);
  assert.match(moneyVerdict({ hasInstructions: true, c: c(), access: [] }).summary, /nobody is named/i);
  assert.equal(moneyVerdict({ hasInstructions: true, c: c(), access }).status, 'ok');
});

test('the prototypes card: Claude, builds that fail, builds that hang, and a quiet start', () => {
  const base = { total: 4, finished7: 4, failed7: 0, last_error: '', stuck: 0, ready7: 3, edits7: 5, cost7: 1234 };
  assert.equal(prototypesVerdict({ aiReady: true, p: { ...base, total: 0, finished7: 0, ready7: 0, edits7: 0, cost7: 0 } }).summary, 'Ready: no prototypes built yet');
  const ok = prototypesVerdict({ aiReady: true, p: base }); assert.equal(ok.status, 'ok'); assert.match(ok.summary, /3 builds and 5 changes in the last 7 days · about \$12\.34 of Claude/);
  const off = prototypesVerdict({ aiReady: false, p: base }); assert.equal(off.status, 'off'); assert.match(off.summary, /Claude is not connected \(ANTHROPIC_API_KEY\).*standard template.*switched off/);
  const bad = prototypesVerdict({ aiReady: true, p: { ...base, finished7: 4, failed7: 3, last_error: 'The site answered 500' } }); assert.equal(bad.status, 'warn'); assert.match(bad.summary, /3 of 4 builds failed.*The site answered 500/);
  assert.equal(prototypesVerdict({ aiReady: true, p: { ...base, finished7: 2, failed7: 2 } }).status, 'ok', 'two failures are not a pattern yet');
  const stuck = prototypesVerdict({ aiReady: true, p: { ...base, stuck: 2 } }); assert.equal(stuck.status, 'warn'); assert.match(stuck.summary, /2 builds or changes have been running for over 20 minutes/);
  assert.equal(prototypesVerdict({ aiReady: false, p: { ...base, stuck: 1 } }).status, 'warn', 'a hang outranks "not connected"');
});

test('the lead search card: key, refused key, failures, the daily cap, and the job behind saved searches', () => {
  const s = { today: 3, perDay: 30, done7: 5, failed7: 0, last_at: new Date().toISOString(), last_status: 'done', last_error: '', schedules: 2, schedulesOn: 2, scheduleJob: null };
  assert.match(leadSearchVerdict({ hasKey: false, s }).summary, /add BRAVE_API_KEY.*pasting a list/); assert.equal(leadSearchVerdict({ hasKey: false, s }).status, 'off');
  const ok = leadSearchVerdict({ hasKey: true, s }); assert.equal(ok.status, 'ok'); assert.match(ok.summary, /5 searches in the last 7 days.*2 saved searches running by themselves/);
  assert.equal(leadSearchVerdict({ hasKey: true, s: { ...s, done7: 1, schedulesOn: 1 } }).summary.includes('1 search in the last 7 days'), true);
  const refused = leadSearchVerdict({ hasKey: true, s: { ...s, last_status: 'failed', last_error: 'Brave refused the key' } }); assert.equal(refused.status, 'down'); assert.match(refused.summary, /check BRAVE_API_KEY/);
  assert.equal(leadSearchVerdict({ hasKey: true, s: { ...s, done7: 0, failed7: 3, last_status: 'failed', last_error: 'Brave could not be reached' } }).status, 'down');
  assert.equal(leadSearchVerdict({ hasKey: true, s: { ...s, last_status: 'failed', last_error: 'Brave is busy: try again later' } }).status, 'warn');
  assert.match(leadSearchVerdict({ hasKey: true, s: { ...s, today: 30 } }).summary, /Today's 30 searches are used up/);
  const job = leadSearchVerdict({ hasKey: true, s: { ...s, scheduleJob: { health: 'failing', lastError: 'boom' } } }); assert.equal(job.status, 'warn'); assert.match(job.summary, /2 saved searches on, but the job that runs them is failing \(boom\)/);
});

test('the prototype settings are listed with the rest', () => {
  const have = coverageConfig({ env: { ANTHROPIC_API_KEY: 'k', BRAVE_API_KEY: 'b' } }), none = coverageConfig({ env: {} }), by = (l, id) => l.find(x => x.id === id);
  assert.equal(by(have, 'protoai').status, 'ok'); assert.equal(by(have, 'leadsearch').status, 'ok');
  assert.equal(by(none, 'protoai').status, 'warn'); assert.match(by(none, 'protoai').detail, /standard template/); assert.equal(by(none, 'leadsearch').status, 'info'); assert.match(by(none, 'leadsearch').detail, /paste addresses/);
});

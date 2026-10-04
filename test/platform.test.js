import { test } from 'node:test';
import assert from 'node:assert/strict';
import { percentile, record, timed, trackedFetch, recordRequest, trackJob, declareJob, snapshot, overallStatus, setSink, reportError } from '../src/telemetry.js';
import { configChecks, jobHealth, fmtDuration } from '../src/platform.js';

const billing = (effective, mode = 'auto') => ({ effective, mode });

test('percentile picks the nearest rank and copes with nothing', () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50), 50);
  assert.equal(percentile([100, 10, 20], 95), 100);
});

test('calls to an outside service are counted, timed, and failures are kept with their message', async () => {
  const before = snapshot().integrations.t_svc;
  assert.equal(before, undefined);
  assert.equal(await timed('t_svc', async () => ({ usage: { input_tokens: 7, output_tokens: 3 } })).then(r => r.usage.input_tokens), 7);
  await assert.rejects(timed('t_svc', async () => { throw new Error('boom'); }), /boom/);
  const s = snapshot().integrations.t_svc;
  assert.equal(s.calls, 2); assert.equal(s.errors, 1); assert.equal(s.errorRate, 0.5);
  assert.equal(s.lastError, 'boom'); assert.equal(s.tokensIn, 7); assert.equal(s.tokensOut, 3);
  assert.equal(s.hours.length, 24); assert.equal(s.hours.at(-1).calls, 2); assert.equal(s.hours.at(-1).errors, 1);
});

test('a non-OK HTTP answer counts as a failure and the response is passed through untouched', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('nope', { status: 503 });
  try {
    const res = await trackedFetch('t_http', 'http://x.test');
    assert.equal(res.status, 503);
    const s = snapshot().integrations.t_http;
    assert.equal(s.errors, 1); assert.equal(s.lastError, 'HTTP 503');
  } finally { globalThis.fetch = real; }
});

test('identical failures reach the sink once a minute, different ones each time', () => {
  const seen = []; setSink(e => { seen.push(e); });
  try {
    record('t_sink', { ok: false, error: 'same' }); record('t_sink', { ok: false, error: 'same' }); record('t_sink', { ok: false, error: 'other' });
    reportError('web', 'GET /x failed', { status: 500 }); reportError('web', 'GET /x failed');
  } finally { setSink(null); }
  assert.deepEqual(seen.map(e => e.message), ['same', 'other', 'GET /x failed']);
  assert.ok(seen.every(e => e.level === 'error'));
});

test('a sink that throws never breaks the caller', async () => {
  setSink(() => { throw new Error('db down'); });
  try { record('t_sink2', { ok: false, error: 'x1' }); await new Promise(r => setTimeout(r, 5)); } finally { setSink(null); }
  assert.ok(true);
});

test('request counts: totals, errors, per-minute buckets and the busiest and slowest routes', () => {
  const t0 = snapshot().requests;
  for (const ms of [10, 20, 30]) recordRequest('GET /t/slow', 200, 500 + ms);
  recordRequest('GET /t/slow', 500, 900); recordRequest('GET /t/slow', 404, 5);
  const r = snapshot().requests;
  assert.equal(r.total - t0.total, 5); assert.equal(r.e5 - t0.e5, 1); assert.equal(r.e4 - t0.e4, 1);
  assert.equal(r.minutes.length, 60); assert.ok(r.minutes.at(-1).count >= 5);
  assert.ok(r.slowest.some(x => x.route === 'GET /t/slow' && x.p95 >= 900));
  assert.ok(r.busiest.some(x => x.route === 'GET /t/slow' && x.count === 5));
});

test('a tracked job remembers its runs, result, failures, and does not overlap itself', async () => {
  let n = 0, release;
  const run = trackJob('t_job', 1000, async () => { n++; if (n === 2) throw new Error('bad run'); if (n === 3) await new Promise(r => { release = r; }); return 4; });
  await run(); let j = snapshot().jobs.find(x => x.name === 't_job');
  assert.equal(j.runs, 1); assert.equal(j.lastResult, 4); assert.equal(j.lastError, null); assert.ok(j.lastRunAt);
  await run(); j = snapshot().jobs.find(x => x.name === 't_job');
  assert.equal(j.failures, 1); assert.equal(j.lastError, 'bad run');
  const slow = run(); await run(); // second call while the first is running is ignored
  assert.equal(n, 3); release(); await slow;
  j = snapshot().jobs.find(x => x.name === 't_job'); assert.equal(j.lastError, null); assert.equal(j.runs, 3);
});

test('job health: off, waiting, fine, failing and overdue', () => {
  const now = Date.now(), iso = ms => new Date(ms).toISOString();
  declareJob('t_off', 1000, 'switched off');
  assert.equal(jobHealth(snapshot().jobs.find(x => x.name === 't_off')), 'off');
  assert.equal(jobHealth({ everyMs: 1000, lastRunAt: null }, now), 'wait');
  assert.equal(jobHealth({ everyMs: 1000, lastRunAt: iso(now - 500) }, now), 'ok');
  assert.equal(jobHealth({ everyMs: 1000, lastRunAt: iso(now - 500), lastError: 'x' }, now), 'warn');
  assert.equal(jobHealth({ everyMs: 1000, lastRunAt: iso(now - 70_000) }, now), 'warn');
});

test('banner status: database down is an outage, anything else amiss is degraded', () => {
  assert.equal(overallStatus([{ id: 'postgres', status: 'ok' }, { id: 'resend', status: 'ok' }]), 'healthy');
  assert.equal(overallStatus([{ id: 'postgres', status: 'ok' }, { id: 'shopify', status: 'warn' }]), 'degraded');
  assert.equal(overallStatus([{ id: 'postgres', status: 'ok' }, { id: 'anthropic', status: 'down' }]), 'degraded');
  assert.equal(overallStatus([{ id: 'postgres', status: 'down' }, { id: 'anthropic', status: 'ok' }]), 'down');
  assert.equal(overallStatus([{ id: 'x', status: 'off' }, { id: 'y', status: 'info' }]), 'healthy');
});

test('settings checks flag the dangerous ones and never print a secret', () => {
  const find = (rows, id) => rows.find(r => r.id === id);
  const good = configChecks({ env: { JWT_SECRET: 'x'.repeat(40), UNSUBSCRIBE_SECRET: 'u-secret-value', CLIENT_HUB_URL: 'https://hub.example.com', WORK_HUB_URL: 'https://work.example.com' }, billing: billing(true), shopifyConfigured: () => true, techPackProduct: { id: 1 } });
  assert.ok(good.every(r => ['ok', 'info'].includes(r.status)), JSON.stringify(good.filter(r => !['ok', 'info'].includes(r.status))));
  const bad = configChecks({ env: { DEV_BYPASS_AUTH: 'true', JWT_SECRET: 'short', AI_FIXTURE: 'x', CLIENT_HUB_URL: 'http://localhost:3000' }, billing: billing(true), shopifyConfigured: () => false, techPackProduct: null });
  assert.equal(find(bad, 'bypass').status, 'down'); assert.equal(find(bad, 'jwt').status, 'warn'); assert.equal(find(bad, 'fixture').status, 'warn');
  assert.equal(find(bad, 'hub').status, 'warn'); assert.equal(find(bad, 'billing').status, 'warn'); assert.equal(find(bad, 'unsub').status, 'warn');
  assert.equal(find(configChecks({ env: {}, billing: billing(false), shopifyConfigured: () => false }), 'jwt').status, 'down');
  const text = JSON.stringify(good);
  assert.ok(!text.includes('x'.repeat(40)) && !text.includes('u-secret-value'));
  assert.equal(find(configChecks({ env: { JWT_SECRET: 'x'.repeat(40) }, billing: billing(false), shopifyConfigured: () => false }), 'checkoutProduct').status, 'info');
});

test('durations read as days, hours or minutes', () => {
  assert.equal(fmtDuration(59), '0m'); assert.equal(fmtDuration(3 * 60), '3m'); assert.equal(fmtDuration(3600 * 5 + 120), '5h 2m'); assert.equal(fmtDuration(86400 * 2 + 3600 * 3), '2d 3h');
});

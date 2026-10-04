// Lightweight in-process telemetry for the platform health page: how often each outside service was called, how long it took and
// how often it failed; how the web server is answering; when each background job last ran. Held in memory (it starts again at every
// deploy, and the page says so); failures are also handed to a sink so the server can keep them in the database across deploys.
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const startedAt = Date.now();
const RING = 200, HOURS = 24, MINUTES = 60;
const integrations = new Map(), routes = new Map(), jobs = new Map();
const requests = { total: 0, e4: 0, e5: 0, minutes: [] };
let sink = null;
const lag = monitorEventLoopDelay({ resolution: 20 }); lag.enable();

export const percentile = (values, p) => {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1))];
};
const bump = (list, key, size, make) => { let b = list[list.length - 1]; if (!b || b.t !== key) { b = make(key); list.push(b); if (list.length > size) list.shift(); } return b; };

// The server registers a function here to keep failures in the database. Identical failures within a minute are written once.
export const setSink = fn => { sink = fn; };
const recent = new Map();
function emit(source, message, detail) {
  if (!sink) return;
  const key = `${source}|${message}`, now = Date.now();
  if (now - (recent.get(key) || 0) < 60_000) return;
  recent.set(key, now); if (recent.size > 200) recent.delete(recent.keys().next().value);
  try { Promise.resolve(sink({ source, level: 'error', message, detail })).catch(() => {}); } catch {} // keeping a failure must never become a second failure
}

// For failures that are not calls to another service (a server error, say): kept in the failure log like the rest.
export const reportError = (source, message, detail) => emit(source, message, detail);

export function record(name, { ok, ms = 0, error = null, tokensIn = 0, tokensOut = 0 }) {
  let s = integrations.get(name);
  if (!s) { s = { calls: 0, errors: 0, lastOkAt: null, lastErrorAt: null, lastError: null, ring: [], hours: [], tokensIn: 0, tokensOut: 0 }; integrations.set(name, s); }
  const hour = Math.floor(Date.now() / 3_600_000), h = bump(s.hours, hour, HOURS, t => ({ t, calls: 0, errors: 0 }));
  s.calls++; h.calls++; s.ring.push(ms); if (s.ring.length > RING) s.ring.shift();
  s.tokensIn += tokensIn; s.tokensOut += tokensOut;
  if (ok) s.lastOkAt = Date.now();
  else { s.errors++; h.errors++; s.lastErrorAt = Date.now(); s.lastError = String(error || 'error').slice(0, 300); emit(name, s.lastError); }
}

// Times a call to an outside service and records the result. The error is rethrown untouched.
export async function timed(name, fn) {
  const t = Date.now();
  try {
    const out = await fn();
    record(name, { ok: true, ms: Date.now() - t, tokensIn: out?.usage?.input_tokens || 0, tokensOut: out?.usage?.output_tokens || 0 });
    return out;
  } catch (e) { record(name, { ok: false, ms: Date.now() - t, error: e?.message || e }); throw e; }
}
// fetch() that records itself; an HTTP error status counts as a failure.
export async function trackedFetch(name, url, options) {
  const t = Date.now();
  try {
    const res = await fetch(url, options);
    record(name, { ok: res.ok, ms: Date.now() - t, error: res.ok ? null : `HTTP ${res.status}` });
    return res;
  } catch (e) { record(name, { ok: false, ms: Date.now() - t, error: e?.message || e }); throw e; }
}

export function recordRequest(route, status, ms) {
  requests.total++; if (status >= 500) requests.e5++; else if (status >= 400) requests.e4++;
  const minute = Math.floor(Date.now() / 60_000), m = bump(requests.minutes, minute, MINUTES, t => ({ t, count: 0, e5: 0 }));
  m.count++; if (status >= 500) m.e5++;
  let r = routes.get(route);
  if (!r) { if (routes.size >= 300) return; r = { count: 0, e5: 0, e4: 0, ring: [] }; routes.set(route, r); }
  r.count++; if (status >= 500) r.e5++; else if (status >= 400) r.e4++; r.ring.push(ms); if (r.ring.length > 100) r.ring.shift();
}

// Wraps a background job: remembers when it last ran, how long it took, and what went wrong.
export function trackJob(name, everyMs, fn, { initialDelayMs = null } = {}) {
  const j = { name, everyMs, runs: 0, failures: 0, lastRunAt: null, lastDurationMs: null, lastError: null, lastErrorAt: null, lastResult: null, running: false };
  jobs.set(name, j);
  return async () => {
    if (j.running) return;
    j.running = true; const t = Date.now();
    try { const r = await fn(); j.lastResult = typeof r === 'number' ? r : null; j.lastError = null; }
    catch (e) { j.failures++; j.lastError = String(e?.message || e).slice(0, 300); j.lastErrorAt = Date.now(); emit(`job:${name}`, j.lastError); }
    finally { j.runs++; j.lastRunAt = Date.now(); j.lastDurationMs = Date.now() - t; j.running = false; }
  };
}
export const declareJob = (name, everyMs, note) => { if (!jobs.has(name)) jobs.set(name, { name, everyMs, runs: 0, failures: 0, lastRunAt: null, lastDurationMs: null, lastError: null, lastErrorAt: null, lastResult: null, running: false, disabled: true, note }); };

const iso = ms => (ms ? new Date(ms).toISOString() : null);
export function snapshot() {
  const now = Date.now(), nowHour = Math.floor(now / 3_600_000), nowMinute = Math.floor(now / 60_000);
  const integ = {};
  for (const [name, s] of integrations) {
    const hours = Array.from({ length: HOURS }, (_, i) => { const t = nowHour - (HOURS - 1 - i), h = s.hours.find(x => x.t === t); return { t: t * 3_600_000, calls: h?.calls || 0, errors: h?.errors || 0 }; });
    integ[name] = { calls: s.calls, errors: s.errors, errorRate: s.calls ? s.errors / s.calls : 0, p50: percentile(s.ring, 50), p95: percentile(s.ring, 95), lastOkAt: iso(s.lastOkAt), lastErrorAt: iso(s.lastErrorAt), lastError: s.lastError, hours, tokensIn: s.tokensIn, tokensOut: s.tokensOut };
  }
  const minutes = Array.from({ length: MINUTES }, (_, i) => { const t = nowMinute - (MINUTES - 1 - i), m = requests.minutes.find(x => x.t === t); return { t: t * 60_000, count: m?.count || 0, e5: m?.e5 || 0 }; });
  const routeList = [...routes].map(([route, r]) => ({ route, count: r.count, e5: r.e5, e4: r.e4, p50: percentile(r.ring, 50), p95: percentile(r.ring, 95) }));
  return {
    since: iso(startedAt), uptimeSec: Math.round((now - startedAt) / 1000), integrations: integ,
    requests: { total: requests.total, e4: requests.e4, e5: requests.e5, minutes, slowest: routeList.filter(r => r.count >= 3).sort((a, b) => b.p95 - a.p95).slice(0, 8), busiest: routeList.sort((a, b) => b.count - a.count).slice(0, 8) },
    jobs: [...jobs.values()].map(j => ({ ...j, lastRunAt: iso(j.lastRunAt), lastErrorAt: iso(j.lastErrorAt) })),
    eventLoop: { meanMs: Math.round(lag.mean / 1e4) / 100, p99Ms: Math.round(lag.percentile(99) / 1e4) / 100, maxMs: Math.round(lag.max / 1e4) / 100 }
  };
}
export const resetEventLoop = () => lag.reset();

// Turns a list of checks into one word for the banner: the database being down is an outage; anything else amiss is "degraded".
export function overallStatus(checks) {
  const db = checks.find(c => c.id === 'postgres');
  if (db && db.status === 'down') return 'down';
  if (checks.some(c => c.status === 'down' || c.status === 'warn')) return 'degraded';
  return 'healthy';
}

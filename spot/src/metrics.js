// What the health dashboard reads: daily counters, the last success and
// failure of each outside service, and request timings.
//
//   count(key, n)       add n to today's counter (UTC day)
//   ok(service)         a call to Stripe, Shopify, Anthropic… worked
//   fail(service, why)  …or didn't (why is a short message, never a secret)
//   ai(model, usage)    one Claude response: tokens in/out, cache, web searches
//   request(r, ms)      one HTTP response: counts by status, slowest routes
//
// Counters live in SQLite (metrics table) so they survive restarts. Request
// timings are kept in memory for the last few thousand requests.
const DAY = 86_400_000;
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);

export function createMetrics(db, { now = Date.now } = {}) {
  const raw = db.raw;
  raw.exec(`CREATE TABLE IF NOT EXISTS metrics (
    day  TEXT NOT NULL,
    key  TEXT NOT NULL,
    n    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key)
  )`);
  const bump = raw.prepare('INSERT INTO metrics (day, key, n) VALUES (?, ?, ?) ON CONFLICT (day, key) DO UPDATE SET n = n + excluded.n');
  const since = raw.prepare('SELECT day, key, n FROM metrics WHERE day >= ? ORDER BY day');

  const count = (key, n = 1) => {
    if (!n) return;
    try {
      bump.run(dayOf(now()), String(key).slice(0, 120), Math.round(n));
    } catch {
      // Counting never breaks the thing being counted.
    }
  };

  // Last outcome per service, kept small: times, counts and one short error.
  const HEALTH = 'health:services';
  const services = db.state.get(HEALTH) || {};
  let dirty = false;
  const touch = (name) => (services[name] ||= { ok_at: null, fail_at: null, error: null, ok: 0, fail: 0 });
  const save = () => {
    if (!dirty) return;
    dirty = false;
    try {
      db.state.set(HEALTH, services);
    } catch {}
  };
  const timer = setInterval(save, 10_000);
  timer.unref?.();

  function ok(name) {
    const s = touch(name);
    s.ok_at = now();
    s.ok++;
    dirty = true;
    count(`svc:${name}:ok`);
  }
  function fail(name, why) {
    const s = touch(name);
    s.fail_at = now();
    s.fail++;
    s.error = String(why?.message || why || 'failed').replace(/\b(sk|rk|pk|whsec|re)_[A-Za-z0-9_]+/g, '[key]').slice(0, 200);
    dirty = true;
    count(`svc:${name}:fail`);
  }

  function ai(model, usage) {
    if (!usage) return;
    const m = String(model || 'unknown').replace(/[^a-z0-9.-]/gi, '').slice(0, 40);
    count(`ai:${m}:calls`);
    count(`ai:${m}:in`, usage.input_tokens || 0);
    count(`ai:${m}:out`, usage.output_tokens || 0);
    count(`ai:${m}:cache_read`, usage.cache_read_input_tokens || 0);
    count(`ai:${m}:cache_write`, usage.cache_creation_input_tokens || 0);
    count('ai:web_search', usage.server_tool_use?.web_search_requests || 0);
  }

  const recent = [];
  function request(route, status, ms) {
    const cls = status >= 500 ? '5xx' : status >= 400 ? '4xx' : 'ok';
    count('req:total');
    if (cls !== 'ok') count(`req:${cls}`);
    if (cls === '5xx') count(`req:5xx:${route}`);
    recent.push({ at: now(), route, status, ms });
    if (recent.length > 5000) recent.splice(0, recent.length - 5000);
  }

  // Daily counters for the last `days` days, as { 'YYYY-MM-DD': { key: n } }.
  function daily(days = 30) {
    const out = {};
    for (const r of since.all(dayOf(now() - (days - 1) * DAY))) (out[r.day] ||= {})[r.key] = r.n;
    return out;
  }

  function timings(windowMs = DAY) {
    const from = now() - windowMs;
    const rows = recent.filter((r) => r.at >= from);
    const pct = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null);
    const all = rows.map((r) => r.ms).sort((a, b) => a - b);
    const byRoute = {};
    for (const r of rows) (byRoute[r.route] ||= []).push(r.ms);
    const slow = Object.entries(byRoute)
      .map(([route, ms]) => ({ route, n: ms.length, p95_ms: pct(ms.sort((a, b) => a - b), 0.95) }))
      .sort((a, b) => b.p95_ms - a.p95_ms)
      .slice(0, 8);
    const errors = rows.filter((r) => r.status >= 500).slice(-10).reverse();
    return { n: rows.length, p50_ms: pct(all, 0.5), p95_ms: pct(all, 0.95), slow, errors, since: rows[0]?.at || null };
  }

  return { count, ok, fail, ai, request, daily, timings, services: () => ({ ...services }), close: () => (clearInterval(timer), save()) };
}

// A stand-in that records nothing, for code paths built without metrics.
export const noMetrics = { count() {}, ok() {}, fail() {}, ai() {}, request() {} };

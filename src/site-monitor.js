// Watching the sites we build: is it up, is it slow, when does its certificate and its domain run out. Every build with a live address is checked
// every few minutes; a state change or an expiry coming up makes an alert (what is done with an alert is decided by the caller).
import tls from 'node:tls';
import dns from 'node:dns/promises';
import { safeFetch, isPublicIp } from './proto-crawl.js';

const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
export const limits = (env = process.env) => ({ slowMs: num(env.SITE_SLOW_MS, 5000), slowRuns: 3, failsToDown: 2, certWarnDays: 21, certCritDays: 7, domainWarnDays: 30, domainCritDays: 7 });

// An answer counts as the site being up when it is not an error. A site behind a sign-in (401, 403) is up.
export const answered = status => (status >= 200 && status < 400) || status === 401 || status === 403;

const DAY = 86400000;
export const daysLeft = (at, now = Date.now()) => (at ? Math.floor((new Date(at).getTime() - now) / DAY) : null);

// What the state becomes after one more check. One failure is a blip (the state stays as it was); two in a row is down; three slow answers in a row is slow.
export function nextState(prev, res, lim = limits()) {
  const p = { state: 'unknown', fails: 0, slows: 0, down_since: null, last_up_at: null, ...(prev || {}) }, at = res.at || new Date();
  const ok = Boolean(res.ok), fails = ok ? 0 : p.fails + 1, slows = ok && res.ms > lim.slowMs ? p.slows + 1 : 0;
  let state = p.state;
  if (fails >= lim.failsToDown) state = 'down'; else if (ok) state = slows >= lim.slowRuns ? 'slow' : 'up';
  return { state, fails, slows, down_since: state === 'down' ? (p.state === 'down' ? p.down_since : at) : null, last_up_at: ok ? at : p.last_up_at };
}

// The alerts this check calls for, and the memory of which ones were already sent (so each is said once and cleared when it is fixed).
export function alertsFor(prev, next, { certAt = null, domainAt = null, now = Date.now(), name = 'The site', lim = limits() } = {}) {
  const sent = { ...(prev?.alerts || {}) }, out = [];
  const say = (key, severity, title, body) => { if (!sent[key]) { sent[key] = true; out.push({ key, severity, title, body }); } };
  if (next.state === 'down') say('down', 'critical', `${name} is down`, `${name} has not answered for ${next.fails} checks in a row${prev?.last_error ? ` (${prev.last_error})` : ''}.`);
  else if (sent.down) { delete sent.down; out.push({ key: 'recovered', severity: 'info', title: `${name} is back up`, body: `${name} is answering again.` }); }
  if (next.state === 'slow') say('slow', 'warning', `${name} is slow`, `${name} has taken more than ${Math.round(lim.slowMs / 1000)} seconds to answer three times in a row.`);
  else if (next.state === 'up') delete sent.slow;
  const cd = daysLeft(certAt, now);
  if (cd != null) {
    if (cd <= lim.certCritDays) say('cert7', 'critical', `${name}: certificate runs out in ${Math.max(0, cd)} days`, `The site's security certificate expires in ${Math.max(0, cd)} days. Visitors will see a warning when it does.`);
    else if (cd <= lim.certWarnDays) say('cert21', 'warning', `${name}: certificate runs out in ${cd} days`, `The site's security certificate expires in ${cd} days. It usually renews itself; check that it is.`);
    else { delete sent.cert7; delete sent.cert21; }
  }
  const dd = daysLeft(domainAt, now);
  if (dd != null) {
    if (dd <= lim.domainCritDays) say('domain7', 'critical', `${name}: the domain name runs out in ${Math.max(0, dd)} days`, `The domain registration expires in ${Math.max(0, dd)} days. If it lapses the site goes offline and someone else can buy the name.`);
    else if (dd <= lim.domainWarnDays) say('domain30', 'warning', `${name}: the domain name runs out in ${dd} days`, `The domain registration expires in ${dd} days. Renew it with whoever holds the registration.`);
    else { delete sent.domain7; delete sent.domain30; }
  }
  return { sent, alerts: out };
}

// ---------- the probes ----------
export async function tlsExpiry(host, { timeoutMs = 5000, lookup = h => dns.lookup(h, { all: true }) } = {}) {
  try {
    let addrs = [{ address: host }]; if (!/^[\d.]+$|:/.test(host)) addrs = await lookup(host);
    if (!addrs.length || addrs.some(a => !isPublicIp(a.address))) return null;
    return await new Promise(resolve => {
      const s = tls.connect({ host: addrs[0].address, port: 443, servername: host, timeout: timeoutMs, rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(); s.end(); resolve(c?.valid_to ? new Date(c.valid_to) : null); });
      s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); });
    });
  } catch { return null; }
}
// The name to look up at the registry: the last two labels, or three under a two-letter country code that has its own com/co/org.
export const registrable = host => { const p = String(host).toLowerCase().replace(/\.$/, '').split('.'); if (p.length <= 2) return p.join('.'); const sld = p[p.length - 2], tld = p[p.length - 1]; return tld.length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(sld) ? p.slice(-3).join('.') : p.slice(-2).join('.'); };
export async function domainExpiry(host, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  try {
    if (/^[\d.]+$|:/.test(host)) return null;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
    try { const r = await fetchImpl(`https://rdap.org/domain/${registrable(host)}`, { signal: ctl.signal, headers: { Accept: 'application/rdap+json' } }); if (!r.ok) return null; const j = await r.json(); const e = (j.events || []).find(x => x.eventAction === 'expiration'); return e?.eventDate ? new Date(e.eventDate) : null; }
    finally { clearTimeout(t); }
  } catch { return null; }
}

export async function probe(url, { fetchOpts = {}, tlsProbe = tlsExpiry, rdap = domainExpiry, wantDomain = false } = {}) {
  const host = new URL(url).hostname; let res;
  try { const r = await safeFetch(url, { timeoutMs: 10_000, maxBytes: 100_000, ...fetchOpts }); res = { ok: answered(r.status), status: r.status, ms: r.ms, error: answered(r.status) ? '' : `answered ${r.status}` }; }
  catch (e) { res = { ok: false, status: null, ms: null, error: String(e.message || e).slice(0, 200) }; }
  res.certAt = url.startsWith('https:') ? await tlsProbe(host).catch(() => null) : null;
  res.domainAt = wantDomain ? await rdap(host).catch(() => null) : null;
  return res;
}

// ---------- one sweep ----------
export async function runSiteChecks(pool, { probeOpts = {}, alert = async () => {}, now = () => Date.now(), concurrency = 4, lim = limits() } = {}) {
  // a monitor for every build with an address, none for the rest
  await pool.query(`insert into site_monitors(build_id, url) select b.id, b.live_url from builds b where b.live_url <> '' and b.status <> 'archived' on conflict (build_id) do update set url=excluded.url`);
  await pool.query(`delete from site_monitors m using builds b where b.id=m.build_id and (b.live_url = '' or b.status = 'archived')`);
  const rows = (await pool.query(`select m.*, b.name from site_monitors m join builds b on b.id=m.build_id order by m.checked_at nulls first`)).rows, summary = { checked: 0, down: 0, alerts: 0 };
  let i = 0;
  const work = async () => {
    for (;;) {
      const m = rows[i++]; if (!m) return;
      const wantDomain = !m.domain_checked_at || now() - new Date(m.domain_checked_at).getTime() > DAY;
      const res = await probe(m.url, { ...probeOpts, wantDomain }), at = new Date(now());
      const nx = nextState(m, { ...res, at }, lim), certAt = res.certAt || m.cert_expires_at, domainAt = wantDomain ? (res.domainAt || m.domain_expires_at) : m.domain_expires_at;
      const { sent, alerts } = alertsFor({ ...m, last_error: res.error }, nx, { certAt, domainAt, now: now(), name: m.name, lim });
      await pool.query(`update site_monitors set state=$2, http_status=$3, response_ms=$4, last_error=$5, checked_at=$6, last_up_at=$7, down_since=$8, fails=$9, slows=$10, cert_expires_at=$11, domain_expires_at=$12, domain_checked_at=case when $13 then $6 else domain_checked_at end, alerts=$14::jsonb where build_id=$1`,
        [m.build_id, nx.state, res.status, res.ms, res.error, at, nx.last_up_at, nx.down_since, nx.fails, nx.slows, certAt || null, domainAt || null, wantDomain, JSON.stringify(sent)]);
      await pool.query('insert into site_checks(build_id, at, ok, ms, status) values($1,$2,$3,$4,$5)', [m.build_id, at, res.ok, res.ms, res.status]);
      summary.checked++; if (nx.state === 'down') summary.down++;
      for (const a of alerts) { summary.alerts++; try { await alert({ ...a, buildId: m.build_id, name: m.name, url: m.url }); } catch { /* an alert that cannot be delivered never stops the sweep */ } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, work));
  await pool.query(`delete from site_checks where at < now() - interval '35 days'`);
  return summary;
}

// What the Platform page and Home show per site.
export const siteView = (r, up30 = null, now = Date.now()) => ({ buildId: r.build_id, name: r.name, url: r.url, state: r.state, httpStatus: r.http_status, responseMs: r.response_ms, checkedAt: r.checked_at, downSince: r.down_since, lastError: r.last_error || '',
  certDays: daysLeft(r.cert_expires_at, now), domainDays: daysLeft(r.domain_expires_at, now), uptime30: up30 });

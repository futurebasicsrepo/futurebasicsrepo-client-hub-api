// Database backups.
//
// Once a day, Spot takes a consistent copy of its SQLite database while it
// keeps running (VACUUM INTO) and checks the copy with PRAGMA
// integrity_check. The copy is gzipped and kept in two places:
//   - locally, next to the database (the last 3), for a quick undo
//   - in an S3-compatible bucket (a Railway bucket), off the volume:
//     every day for 30 days, then one per month for a year
//
// If a backup fails, it retries hourly and emails SPOT_ALERT_EMAIL (or
// SPOT_CONTACT_EMAIL), at most once a day. /admin shows the last backup and
// has a "Back up now" button.
//
// To restore, set SPOT_RESTORE_FROM to a backup's name (or `latest`) and
// redeploy. See restoreOnBoot below.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { createS3 } from './s3.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const PREFIX = 'backups/';
const KEEP_LOCAL = 3;
const NAME = /spot-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.db\.gz$/;

export function bucketFrom(env, fetchImpl) {
  const endpoint = env.BACKUP_S3_ENDPOINT;
  const bucket = env.BACKUP_S3_BUCKET;
  if (!endpoint || !bucket || !env.BACKUP_S3_ACCESS_KEY_ID || !env.BACKUP_S3_SECRET_ACCESS_KEY) return null;
  return createS3({
    endpoint,
    bucket,
    region: env.BACKUP_S3_REGION || 'auto',
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID,
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY,
    pathStyle: env.BACKUP_S3_PATH_STYLE === '1' || env.BACKUP_S3_PATH_STYLE === 'true',
    ...(fetchImpl ? { fetchImpl } : {}),
  });
}

const stampOf = (t) => new Date(t).toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '').replace(/^(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
const timeOf = (name) => {
  const m = NAME.exec(name);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
};

// Which backups to delete: keep everything from the last 30 days, the
// first backup of each month for a year, and always the newest 3.
export function expired(names, now) {
  const dated = names.map((name) => ({ name, t: timeOf(name) })).filter((b) => b.t !== null).sort((a, b) => b.t - a.t);
  const keep = new Set(dated.slice(0, 3).map((b) => b.name));
  const months = new Map();
  for (const b of dated) {
    if (now - b.t <= 30 * DAY) keep.add(b.name);
    else if (now - b.t <= 366 * DAY) {
      const month = new Date(b.t).toISOString().slice(0, 7);
      const first = months.get(month);
      if (!first || b.t < first.t) months.set(month, b);
    }
  }
  for (const b of months.values()) keep.add(b.name);
  return dated.filter((b) => !keep.has(b.name)).map((b) => b.name);
}

// Opens a database file read-only and checks it. Returns a few counts.
function check(file) {
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    const ok = copy.prepare('PRAGMA integrity_check').get();
    if (Object.values(ok)[0] !== 'ok') throw new Error(`integrity check failed: ${Object.values(ok)[0]}`);
    const n = (t) => copy.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    return { carts: n('carts'), users: n('users') };
  } finally {
    copy.close();
  }
}

export function createBackups({ db, env = process.env, dir, notifier, fetchImpl, log = console, now = () => Date.now() }) {
  const bucket = bucketFrom(env, fetchImpl);
  const hour = Number(env.SPOT_BACKUP_HOUR_UTC ?? 10); // 10:00 UTC is 3am Pacific
  let running = null;

  const localFiles = () => (existsSync(dir) ? readdirSync(dir).filter((f) => NAME.test(f)).sort() : []);

  async function alert(error) {
    const to = env.SPOT_ALERT_EMAIL || env.SPOT_CONTACT_EMAIL;
    const last = db.state.get('backup_alerted_at') || 0;
    if (!to || !notifier || now() - last < DAY) return;
    db.state.set('backup_alerted_at', now());
    await notifier
      .send({ email: to }, { subject: '⚠️ Spot backup failed', text: `Spot's database backup failed: ${error}. It will retry every hour. Check /admin.`, html: `<p>Spot’s database backup failed:</p><p><b>${String(error).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</b></p><p>It retries every hour. The last good backup is shown on /admin.</p>` })
      .catch(() => {});
  }

  async function runOnce(reason) {
    const started = now();
    const name = `spot-${stampOf(started)}.db.gz`;
    mkdirSync(dir, { recursive: true });
    const raw = join(dir, `.${name}.tmp`);
    rmSync(raw, { force: true });
    try {
      db.backupTo(raw);
      const counts = check(raw);
      const body = await gzip(await readFile(raw), { level: 9 });
      await writeFile(join(dir, name), body);
      const sha256 = createHash('sha256').update(body).digest('hex');
      for (const old of localFiles().slice(0, -KEEP_LOCAL)) rmSync(join(dir, old), { force: true });

      let remote = null;
      if (bucket) {
        await bucket.put(PREFIX + name, body, 'application/gzip');
        const all = await bucket.list(PREFIX);
        const gone = expired(all.map((o) => o.key), started);
        for (const key of gone) await bucket.del(key);
        remote = { key: PREFIX + name, kept: all.length - gone.length };
      }
      const status = { ok: true, at: started, took_ms: now() - started, reason, name, bytes: body.length, sha256, ...counts, remote, local: localFiles() };
      db.state.set('backup_last', status);
      db.state.set('backup_last_ok', status);
      log.info?.({ backup: name, bytes: body.length, remote: remote?.key || null }, 'backup done');
      return status;
    } catch (err) {
      const status = { ok: false, at: started, reason, error: err.message };
      db.state.set('backup_last', status);
      log.error?.({ err }, 'backup failed');
      await alert(err.message);
      return status;
    } finally {
      rmSync(raw, { force: true });
    }
  }

  const backups = {
    configured: { bucket: Boolean(bucket), dir },
    // One at a time: a second call while one runs gets the same result.
    run(reason = 'manual') {
      running ||= runOnce(reason).finally(() => {
        running = null;
      });
      return running;
    },
    status() {
      return { bucket: Boolean(bucket), hour_utc: hour, last: db.state.get('backup_last'), last_ok: db.state.get('backup_last_ok'), local: localFiles() };
    },
    // Is a scheduled backup due? Daily at the set hour; sooner if the last
    // good one is over 26 hours old; an hour after a failure.
    due() {
      const t = now();
      const last = db.state.get('backup_last');
      const ok = db.state.get('backup_last_ok');
      if (last && !last.ok && t - last.at < HOUR) return false;
      if (!ok) return true;
      if (t - ok.at > 26 * HOUR) return true;
      return t - ok.at > 20 * HOUR && new Date(t).getUTCHours() === hour;
    },
    start() {
      const tick = () => {
        if (backups.due()) backups.run('scheduled');
      };
      const first = setTimeout(tick, 2 * 60_000); // let the app settle after a deploy
      const every = setInterval(tick, 10 * 60_000);
      first.unref();
      every.unref();
      return () => {
        clearTimeout(first);
        clearInterval(every);
      };
    },
  };
  return backups;
}

// Restore at startup, before the database is opened.
//
// SPOT_RESTORE_FROM = `latest`, a backup name (spot-2026-09-28T100000Z.db.gz),
// or `local:<name>` for one of the copies kept next to the database.
// The current database is kept as spot.db.before-restore-<time>. A marker
// file stops the same restore from running again on the next restart;
// remove the variable once you're done.
export async function restoreOnBoot({ env = process.env, dbFile, fetchImpl, log = console, now = () => Date.now() }) {
  const from = String(env.SPOT_RESTORE_FROM || '').trim();
  if (!from || dbFile === ':memory:') return null;
  const dir = join(dirname(dbFile), 'backups');
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, `.restored-${createHash('sha256').update(from).digest('hex').slice(0, 16)}`);
  if (existsSync(marker)) {
    log.warn?.({ from }, 'SPOT_RESTORE_FROM is still set but that restore already ran; remove the variable');
    return { skipped: true };
  }

  let body;
  let name;
  if (from.startsWith('local:')) {
    name = basename(from.slice(6));
    body = await readFile(join(dir, name));
  } else {
    const bucket = bucketFrom(env, fetchImpl);
    if (!bucket) throw new Error('SPOT_RESTORE_FROM needs the BACKUP_S3_* variables (or use local:<name>)');
    let key = from.startsWith(PREFIX) ? from : PREFIX + from;
    if (from === 'latest') {
      const all = (await bucket.list(PREFIX)).map((o) => o.key).filter((k) => NAME.test(k)).sort();
      if (!all.length) throw new Error('No backups in the bucket');
      key = all.at(-1);
    }
    name = basename(key);
    body = await bucket.get(key);
  }

  const tmp = `${dbFile}.restoring`;
  let counts;
  try {
    writeFileSync(tmp, await gunzip(body));
    counts = check(tmp);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw new Error(`${name} isn’t a good backup: ${err.message}`);
  }
  if (existsSync(dbFile)) {
    const keep = `${dbFile}.before-restore-${stampOf(now())}`;
    copyFileSync(dbFile, keep);
    for (const ext of ['-wal', '-shm']) if (existsSync(dbFile + ext)) copyFileSync(dbFile + ext, keep + ext);
  }
  for (const ext of ['-wal', '-shm']) rmSync(dbFile + ext, { force: true });
  renameSync(tmp, dbFile);
  writeFileSync(marker, JSON.stringify({ from, name, at: now(), ...counts }));
  log.warn?.({ from: name, ...counts, bytes: statSync(dbFile).size }, 'database restored from backup; remove SPOT_RESTORE_FROM');
  return { restored: name, ...counts };
}

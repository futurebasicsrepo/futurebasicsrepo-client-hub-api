import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { signV4 } from '../src/s3.js';
import { createBackups, expired, restoreOnBoot } from '../src/backup.js';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/server.js';
import { sandboxProvider } from '../src/providers.js';

const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const S3ENV = { BACKUP_S3_ENDPOINT: 'https://t3.storageapi.dev', BACKUP_S3_BUCKET: 'spot-backups-abc123', BACKUP_S3_ACCESS_KEY_ID: 'tid_x', BACKUP_S3_SECRET_ACCESS_KEY: 'tsec_y', BACKUP_S3_REGION: 'auto' };
const tmp = (t) => {
  const d = mkdtempSync(join(tmpdir(), 'spot-bk-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
};

// An in-memory S3 bucket that re-signs every request and rejects bad signatures.
function fakeBucket({ fail = false } = {}) {
  const objects = new Map();
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const method = init.method;
    calls.push(`${method} ${u.pathname}${u.search}`);
    assert.equal(u.hostname, 'spot-backups-abc123.t3.storageapi.dev', 'virtual-hosted style');
    const body = init.body ? Buffer.from(init.body) : Buffer.alloc(0);
    const h = init.headers;
    assert.equal(h['x-amz-content-sha256'], createHash('sha256').update(body).digest('hex'), 'body hash');
    const d = h['x-amz-date'];
    const date = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`);
    const extra = Object.fromEntries(Object.entries(h).filter(([k]) => !['authorization', 'x-amz-date', 'x-amz-content-sha256', 'host'].includes(k)));
    const want = signV4({ method, url, headers: extra, bodyHash: h['x-amz-content-sha256'], accessKeyId: 'tid_x', secretAccessKey: 'tsec_y', region: 'auto', date });
    if (fail || want.authorization !== h.authorization) return new Response('<Error><Code>SignatureDoesNotMatch</Code></Error>', { status: 403 });
    const key = decodeURIComponent(u.pathname.slice(1));
    if (method === 'PUT') objects.set(key, body);
    if (method === 'DELETE') objects.delete(key);
    if (method === 'GET' && key) return objects.has(key) ? new Response(objects.get(key)) : new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
    if (method === 'GET') {
      const prefix = u.searchParams.get('prefix') || '';
      const xml = [...objects].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => `<Contents><Key>${k}</Key><Size>${v.length}</Size></Contents>`).join('');
      return new Response(`<ListBucketResult><IsTruncated>false</IsTruncated>${xml}</ListBucketResult>`);
    }
    return new Response('', { status: 200 });
  };
  return { objects, calls, fetchImpl };
}

test('S3 signing matches AWS’s published Signature V4 examples', () => {
  const creds = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1', date: new Date('2013-05-24T00:00:00Z'), bodyHash: EMPTY };
  const get = signV4({ ...creds, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' } });
  assert.match(get.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  const list = signV4({ ...creds, method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J' });
  assert.match(list.authorization, /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
});

test('retention: 30 days of dailies, a monthly for a year, never fewer than 3', () => {
  const now = Date.UTC(2026, 8, 28, 10);
  const name = (daysAgo) => `backups/spot-${new Date(now - daysAgo * 864e5).toISOString().slice(0, 10)}T100000Z.db.gz`;
  const all = Array.from({ length: 500 }, (_, i) => name(i));
  const gone = new Set(expired(all, now));
  const kept = all.filter((k) => !gone.has(k));
  assert.ok(kept.includes(name(0)) && kept.includes(name(30)), 'the last 30 days stay');
  assert.ok(!kept.includes(name(45)) || name(45).includes('-01T') || kept.filter((k) => k.slice(13, 20) === name(45).slice(13, 20)).length === 1);
  const old = kept.filter((k) => !all.slice(0, 31).includes(k));
  assert.ok(old.length >= 11 && old.length <= 13, `about one per month for a year (got ${old.length})`);
  assert.equal(new Set(old.map((k) => k.slice(13, 20))).size, old.length, 'one per month');
  assert.ok(!kept.includes(name(400)), 'nothing over a year');
  assert.deepEqual(expired([name(900), name(800), name(700)], now), [], 'the newest 3 always stay');
});

test('💾 a backup: consistent copy, checked, gzipped, kept locally and in the bucket', async (t) => {
  const dir = tmp(t);
  const db = openDb(join(dir, 'spot.db'));
  t.after(() => db.close());
  db.users.create('u1', 'kyle@example.com');
  const bucket = fakeBucket();
  // An old backup in the bucket that retention should clear out.
  bucket.objects.set('backups/spot-2024-01-15T100000Z.db.gz', Buffer.from('old'));
  let clock = Date.UTC(2026, 8, 28, 10);
  const backups = createBackups({ db, env: S3ENV, dir: join(dir, 'backups'), fetchImpl: bucket.fetchImpl, log: {}, now: () => clock });
  const s = await backups.run('test');
  assert.equal(s.ok, true, s.error);
  assert.equal(s.name, 'spot-2026-09-28T100000Z.db.gz');
  assert.equal(s.users, 1);
  assert.equal(s.remote.key, 'backups/spot-2026-09-28T100000Z.db.gz');
  assert.ok(bucket.objects.has('backups/spot-2024-01-15T100000Z.db.gz'), 'kept while there are fewer than 3 newer');
  // The uploaded copy is a real, readable database.
  const out = join(dir, 'check.db');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(out, gunzipSync(bucket.objects.get(s.remote.key)));
  const copy = new DatabaseSync(out, { readOnly: true });
  assert.equal(copy.prepare('SELECT email FROM users').get().email, 'kyle@example.com');
  copy.close();
  // Only the newest 3 stay on the volume, and no temp files are left.
  for (let i = 1; i <= 4; i++) {
    clock += 864e5;
    assert.equal((await backups.run('test')).ok, true);
  }
  assert.deepEqual(readdirSync(join(dir, 'backups')).sort(), ['spot-2026-09-30T100000Z.db.gz', 'spot-2026-10-01T100000Z.db.gz', 'spot-2026-10-02T100000Z.db.gz']);
  assert.equal(backups.status().last_ok.name, 'spot-2026-10-02T100000Z.db.gz');
  assert.ok(!bucket.objects.has('backups/spot-2024-01-15T100000Z.db.gz'), 'over a year old: deleted');
  assert.equal(bucket.objects.size, 5);
});

test('💾 schedule: daily at the set hour, catch-up after 26h, hourly retry after a failure; failures email once a day', async (t) => {
  const dir = tmp(t);
  const db = openDb(':memory:');
  const bucket = fakeBucket({ fail: true });
  const sent = [];
  const notifier = { send: async (to, msg) => sent.push({ to, msg }) };
  let clock = Date.UTC(2026, 8, 28, 3);
  const backups = createBackups({ db, env: { ...S3ENV, SPOT_CONTACT_EMAIL: 'hello@spotmeplease.com' }, dir, notifier, fetchImpl: bucket.fetchImpl, log: {}, now: () => clock });
  assert.equal(backups.due(), true, 'never backed up: due now');
  const bad = await backups.run('scheduled');
  assert.equal(bad.ok, false);
  assert.match(bad.error, /403 SignatureDoesNotMatch/);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to.email, 'hello@spotmeplease.com');
  assert.match(sent[0].msg.subject, /backup failed/);
  assert.equal(backups.due(), false, 'waits an hour after a failure');
  clock += 61 * 60_000;
  assert.equal(backups.due(), true);
  await backups.run('scheduled');
  assert.equal(sent.length, 1, 'one alert a day');

  clock = Date.UTC(2026, 8, 28, 10);
  const good = createBackups({ db, env: {}, dir, log: {}, now: () => clock });
  assert.equal((await good.run('scheduled')).ok, true, 'without a bucket it still keeps local copies');
  assert.equal(good.status().bucket, false);
  clock = Date.UTC(2026, 8, 29, 9);
  assert.equal(good.due(), false, '23h later, before 10:00 UTC: not yet');
  clock = Date.UTC(2026, 8, 29, 10, 5);
  assert.equal(good.due(), true, '10:00 UTC is backup time');
  clock = Date.UTC(2026, 8, 29, 13);
  assert.equal(good.due(), true, 'over 26h: catch up at any hour');
});

test('♻️ restore on boot: from the bucket or the volume, once, keeping the old database', async (t) => {
  const dir = tmp(t);
  const file = join(dir, 'spot.db');
  const bucket = fakeBucket();
  // A backup with one account…
  let db = openDb(file);
  db.users.create('u1', 'kyle@example.com');
  const backups = createBackups({ db, env: S3ENV, dir: join(dir, 'backups'), fetchImpl: bucket.fetchImpl, log: {}, now: () => Date.UTC(2026, 8, 28, 10) });
  const s = await backups.run('test');
  // …then a mistake happens.
  db.users.create('u2', 'oops@example.com');
  db.close();

  const env = { ...S3ENV, SPOT_RESTORE_FROM: 'latest' };
  const r = await restoreOnBoot({ env, dbFile: file, fetchImpl: bucket.fetchImpl, log: {}, now: () => Date.UTC(2026, 8, 29) });
  assert.equal(r.restored, s.name);
  db = openDb(file);
  assert.ok(!db.users.byEmail('oops@example.com'), 'back to the backup');
  assert.ok(db.users.byEmail('kyle@example.com'));
  db.users.create('u3', 'new@example.com');
  db.close();
  assert.ok(readdirSync(dir).some((f) => f.startsWith('spot.db.before-restore-')), 'the old database is kept');

  // Restarting with the variable still set doesn't restore again.
  assert.deepEqual(await restoreOnBoot({ env, dbFile: file, fetchImpl: bucket.fetchImpl, log: {} }), { skipped: true });
  db = openDb(file);
  assert.ok(db.users.byEmail('new@example.com'), 'newer data survives a restart');
  db.close();

  // From a copy on the volume.
  const r2 = await restoreOnBoot({ env: { SPOT_RESTORE_FROM: `local:${s.name}` }, dbFile: file, log: {} });
  assert.equal(r2.restored, s.name);
  // A bad file is refused and the database is left alone.
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dir, 'backups', 'spot-2026-01-01T000000Z.db.gz'), gzipSync(Buffer.from('not a database')));
  await assert.rejects(restoreOnBoot({ env: { SPOT_RESTORE_FROM: 'local:spot-2026-01-01T000000Z.db.gz' }, dbFile: file, log: {} }), /isn’t a good backup/);
  assert.ok(!readdirSync(dir).includes('spot.db.restoring'), 'no temp file left');
  db = openDb(file);
  assert.ok(db.users.byEmail('kyle@example.com'));
  db.close();
});

test('💾 /admin: backup status and "Back up now" (admin only)', async (t) => {
  const dir = tmp(t);
  const bucket = fakeBucket();
  const ADMIN = 'a'.repeat(24);
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg: { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 }, logger: false, env: { ...S3ENV, SPOT_ADMIN_TOKEN: ADMIN }, backupDir: dir, backupFetch: bucket.fetchImpl });
  t.after(() => a.close());
  const post = (url, payload, headers = {}) => a.inject({ method: 'POST', url, payload, headers });
  assert.equal((await post('/v1/admin/backups/run', {})).statusCode, 401);
  const login = await post('/admin/login', { token: ADMIN });
  const cookie = login.headers['set-cookie'].split(';')[0];
  const r = await post('/v1/admin/backups/run', {}, { cookie });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().backups.last_ok.remote.kept, 1);
  const o = (await a.inject({ method: 'GET', url: '/v1/admin/overview', headers: { cookie } })).json();
  assert.equal(o.backups.bucket, true);
  assert.ok(o.backups.last_ok.sha256);
  assert.equal(bucket.objects.size, 1);
});

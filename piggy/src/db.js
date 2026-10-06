// Storage on Node's built-in SQLite, so the concept runs with no database
// service. A jar is one physical device (piggy bank, tip jar, collection
// plate). Its balance is the sum of credited payments, kept as a column so
// the hardware can read it in one cheap lookup.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

// cheers: the emoji a payer can send after paying, shown on the jar's display.
// treats: one playful label per preset chip, in order. The plate stays plain.
export const KINDS = {
  piggy: { label: 'Piggy bank', verb: 'Add', noun: 'savings', cheers: ['🎉', '💖', '🌟', '🚀'], treats: ['🍬', '🍦', '🍿'] },
  tip: { label: 'Tip jar', verb: 'Tip', noun: 'tips', cheers: ['🙌', '☕', '🔥', '⭐'], treats: ['☕', '🥐', '🙌'] },
  plate: { label: 'Collection plate', verb: 'Give', noun: 'giving', cheers: ['🙏', '❤️', '✨', '🕊️'], treats: [] },
};

const SEED = [
  { slug: 'mia', kind: 'piggy', name: "Mia's Piggy Bank", owner: 'Mia', tagline: 'Saving up for a new bike', goal_cents: 15000, presets: [100, 300, 500], balance_cents: 7300 },
  { slug: 'corner-cafe', kind: 'tip', name: 'Corner Café', owner: 'the baristas', tagline: 'Thanks for coming in today', goal_cents: null, presets: [100, 300, 500], balance_cents: 0 },
  { slug: 'grace', kind: 'plate', name: 'Grace Community Church', owner: 'Grace Community', tagline: 'Sunday offering', goal_cents: null, presets: [100, 300, 500], balance_cents: 0 },
];

export function openDb(file = process.env.PIGGY_DB || './data/piggy.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS jars (
      slug          TEXT PRIMARY KEY,
      kind          TEXT NOT NULL,
      name          TEXT NOT NULL,
      owner         TEXT NOT NULL,
      tagline       TEXT,
      presets       TEXT NOT NULL,
      currency      TEXT NOT NULL DEFAULT 'usd',
      goal_cents    INTEGER,
      balance_cents INTEGER NOT NULL DEFAULT 0,
      device_key    TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payments (
      id           TEXT PRIMARY KEY,
      jar_slug     TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      method       TEXT,
      demo         INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_jar ON payments (jar_slug, created_at);
  `);
  if (!db.prepare('PRAGMA table_info(payments)').all().some((c) => c.name === 'cheer')) {
    db.exec('ALTER TABLE payments ADD COLUMN cheer TEXT');
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM jars').get().n;
  if (count === 0) for (const j of SEED) createJar(db, j);
  return db;
}

function row(r) {
  return r && { ...r, presets: JSON.parse(r.presets) };
}

export function createJar(db, j) {
  if (!/^[a-z0-9-]{2,40}$/.test(j.slug || '')) throw new Error('slug must be 2-40 chars of a-z, 0-9 or -');
  if (!KINDS[j.kind]) throw new Error(`kind must be one of ${Object.keys(KINDS).join(', ')}`);
  const presets = (j.presets?.length ? j.presets : [100, 300, 500]).map(Number);
  db.prepare(`INSERT INTO jars (slug, kind, name, owner, tagline, presets, goal_cents, balance_cents, device_key, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(j.slug, j.kind, j.name, j.owner || j.name, j.tagline || null, JSON.stringify(presets),
      j.goal_cents ?? null, j.balance_cents ?? 0, j.device_key || randomBytes(16).toString('hex'), Date.now());
  return getJar(db, j.slug);
}

export const getJar = (db, slug) => row(db.prepare('SELECT * FROM jars WHERE slug = ?').get(slug));
export const listJars = (db) => db.prepare('SELECT * FROM jars ORDER BY created_at').all().map(row);
export const recentPayments = (db, slug, limit = 10) =>
  db.prepare('SELECT amount_cents, method, demo, cheer, created_at FROM payments WHERE jar_slug = ? ORDER BY created_at DESC LIMIT ?').all(slug, limit);

// How many payments a jar has had since a moment (the payer's local midnight),
// so the success screen can say "you're the 7th tip today".
export const countSince = (db, slug, since) =>
  db.prepare('SELECT COUNT(*) AS n FROM payments WHERE jar_slug = ? AND created_at >= ?').get(slug, since).n;

// Attach the payer's cheer to their payment, once. Returns false if the
// payment isn't this jar's or already has one.
export function setCheer(db, { id, slug, cheer }) {
  return db.prepare('UPDATE payments SET cheer = ? WHERE id = ? AND jar_slug = ? AND cheer IS NULL').run(cheer, id, slug).changes === 1;
}

// Credit a payment exactly once. Stripe can deliver the same success through
// the webhook and the payer's browser sync; the payment id is the guard.
// Returns the updated jar when this call credited it, or null if it was seen.
export function credit(db, { id, slug, amount_cents, method = null, demo = false }) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const ins = db.prepare('INSERT OR IGNORE INTO payments (id, jar_slug, amount_cents, method, demo, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, slug, amount_cents, method, demo ? 1 : 0, Date.now());
    if (ins.changes === 1) db.prepare('UPDATE jars SET balance_cents = balance_cents + ? WHERE slug = ?').run(amount_cents, slug);
    db.exec('COMMIT');
    return ins.changes === 1 ? getJar(db, slug) : null;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// What a payer may send: whole cents between the floor and ceiling.
export function parseAmount(v, { min = 100, max = 50000 } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Amount must be between $${(min / 100).toFixed(2)} and $${(max / 100).toFixed(2)}`);
  }
  return n;
}

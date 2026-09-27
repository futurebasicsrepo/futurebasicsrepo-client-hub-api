// Storage on Node's built-in SQLite, so the prototype runs with no database
// service. Carts are stored as a JSON document plus the few columns we look
// them up by. Every state change is appended to cart_events for an audit
// trail (who paid, which authorizations were approved or declined and why).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file = process.env.SPOT_DB || './data/spot.db') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS carts (
      id           TEXT PRIMARY KEY,
      token        TEXT NOT NULL UNIQUE,
      manage_hash  TEXT NOT NULL,
      status       TEXT NOT NULL,
      settle       TEXT NOT NULL,
      payment_ref  TEXT UNIQUE,
      card_ref     TEXT UNIQUE,
      doc          TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS carts_open_expiry ON carts (status, expires_at);
    CREATE TABLE IF NOT EXISTS cart_events (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id  TEXT NOT NULL,
      kind     TEXT NOT NULL,
      detail   TEXT,
      at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cart_events_cart ON cart_events (cart_id, id);
    CREATE TABLE IF NOT EXISTS waitlist (
      email  TEXT PRIMARY KEY,
      kind   TEXT NOT NULL,
      at     INTEGER NOT NULL
    );
    -- One row per email per interest (early access, agent key, notify-me for
    -- each integration). Supersedes waitlist, which kept one row per email.
    CREATE TABLE IF NOT EXISTS signups (
      email  TEXT NOT NULL,
      kind   TEXT NOT NULL,
      at     INTEGER NOT NULL,
      PRIMARY KEY (email, kind)
    );
    INSERT OR IGNORE INTO signups (email, kind, at) SELECT email, kind, at FROM waitlist;
  `);

  const q = {
    insert: db.prepare(`INSERT INTO carts (id, token, manage_hash, status, settle, doc, created_at, expires_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    byToken: db.prepare('SELECT * FROM carts WHERE token = ?'),
    byId: db.prepare('SELECT * FROM carts WHERE id = ?'),
    byPayment: db.prepare('SELECT * FROM carts WHERE payment_ref = ?'),
    byCard: db.prepare('SELECT * FROM carts WHERE card_ref = ?'),
    // Optimistic concurrency: only moves the row if it's still in the state we read.
    update: db.prepare(`UPDATE carts SET status = ?, doc = ?, payment_ref = ?, card_ref = ?, updated_at = ?
                        WHERE id = ? AND status = ?`),
    expire: db.prepare(`SELECT id FROM carts WHERE status = 'open' AND expires_at < ?`),
    event: db.prepare('INSERT INTO cart_events (cart_id, kind, detail, at) VALUES (?, ?, ?, ?)'),
    events: db.prepare('SELECT kind, detail, at FROM cart_events WHERE cart_id = ? ORDER BY id'),
    join: db.prepare('INSERT OR IGNORE INTO signups (email, kind, at) VALUES (?, ?, ?)'),
    waitlist: db.prepare('SELECT email, kind, at FROM signups ORDER BY at DESC, email, kind'),
  };

  const hydrate = (row) =>
    row && {
      ...JSON.parse(row.doc),
      id: row.id,
      token: row.token,
      manage_hash: row.manage_hash,
      status: row.status,
      settle: row.settle,
      payment_ref: row.payment_ref,
      card_ref: row.card_ref,
      created_at: row.created_at,
      expires_at: row.expires_at,
    };

  const docOf = (cart) => {
    const { id, token, manage_hash, status, settle, payment_ref, card_ref, created_at, expires_at, ...doc } = cart;
    return JSON.stringify(doc);
  };

  return {
    raw: db,
    insert(cart) {
      q.insert.run(cart.id, cart.token, cart.manage_hash, cart.status, cart.settle, docOf(cart), cart.created_at, cart.expires_at, cart.created_at);
      q.event.run(cart.id, 'created', null, cart.created_at);
    },
    byToken: (t) => hydrate(q.byToken.get(t)),
    byId: (id) => hydrate(q.byId.get(id)),
    byPayment: (ref) => hydrate(q.byPayment.get(ref)),
    byCard: (ref) => hydrate(q.byCard.get(ref)),
    // Returns true if the write won; false if someone else moved the cart first.
    save(cart, fromStatus) {
      const r = q.update.run(cart.status, docOf(cart), cart.payment_ref ?? null, cart.card_ref ?? null, Date.now(), cart.id, fromStatus);
      return r.changes === 1;
    },
    openExpiredIds: (now = Date.now()) => q.expire.all(now).map((r) => r.id),
    event(cartId, kind, detail) {
      q.event.run(cartId, kind, detail == null ? null : JSON.stringify(detail), Date.now());
    },
    events: (cartId) => q.events.all(cartId).map((e) => ({ ...e, detail: e.detail ? JSON.parse(e.detail) : null })),
    joinWaitlist: (email, kind) => q.join.run(email, kind, Date.now()),
    waitlist: () => q.waitlist.all(),
    close: () => db.close(),
  };
}

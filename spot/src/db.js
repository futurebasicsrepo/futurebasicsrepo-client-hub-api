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
    -- Fraud controls: what paid for what, per-IP activity, and block lists.
    CREATE TABLE IF NOT EXISTS payments (
      cart_id       TEXT PRIMARY KEY,
      fingerprint   TEXT,
      payer_email   TEXT,
      requester_ip  TEXT,
      amount_cents  INTEGER NOT NULL,
      at            INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payments_fp ON payments (fingerprint, at);
    CREATE INDEX IF NOT EXISTS payments_rip ON payments (requester_ip, at);
    CREATE TABLE IF NOT EXISTS ip_activity (
      ip    TEXT NOT NULL,
      kind  TEXT NOT NULL,
      at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ip_activity_ip ON ip_activity (ip, kind, at);
    CREATE TABLE IF NOT EXISTS blocks (
      kind    TEXT NOT NULL,
      value   TEXT NOT NULL,
      reason  TEXT,
      at      INTEGER NOT NULL,
      PRIMARY KEY (kind, value)
    );
    -- Accounts: email sign-in with one-time codes; sessions by cookie.
    CREATE TABLE IF NOT EXISTS users (
      id          TEXT PRIMARY KEY,
      email       TEXT UNIQUE,
      doc         TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS login_codes (
      email       TEXT PRIMARY KEY,
      code_hash   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      attempts    INTEGER NOT NULL DEFAULT 0
    );
    -- Google / Facebook accounts linked to a Spot account.
    CREATE TABLE IF NOT EXISTS identities (
      provider    TEXT NOT NULL,
      subject     TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      PRIMARY KEY (provider, subject)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash        TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      expires_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS carts_user ON carts (json_extract(doc, '$.user_id'), created_at);
    -- Numbers that replied STOP to a Spot text.
    CREATE TABLE IF NOT EXISTS sms_optouts (
      phone  TEXT PRIMARY KEY,
      at     INTEGER NOT NULL
    );
    -- Self-serve agent API keys (only the SHA-256 is kept).
    CREATE TABLE IF NOT EXISTS api_keys (
      hash        TEXT PRIMARY KEY,
      name        TEXT NOT NULL UNIQUE,
      email       TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0
    );
  `);
  // Accounts made by text-message sign-in have no email: make it optional
  // on databases created before that.
  if (db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'email' && c.notnull)) {
    db.exec(`BEGIN;
      CREATE TABLE users_new (id TEXT PRIMARY KEY, email TEXT UNIQUE, doc TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
      INSERT INTO users_new (id, email, doc, created_at) SELECT id, email, doc, created_at FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
      COMMIT;`);
  }
  // api_keys gained an owner when accounts arrived.
  if (!db.prepare('PRAGMA table_info(api_keys)').all().some((c) => c.name === 'user_id')) db.exec('ALTER TABLE api_keys ADD COLUMN user_id TEXT');

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
    optOut: db.prepare('INSERT OR REPLACE INTO sms_optouts (phone, at) VALUES (?, ?)'),
    optIn: db.prepare('DELETE FROM sms_optouts WHERE phone = ?'),
    optedOut: db.prepare('SELECT 1 FROM sms_optouts WHERE phone = ?'),
    paymentFor: db.prepare('SELECT fingerprint, payer_email FROM payments WHERE cart_id = ?'),
    recordPayment: db.prepare('INSERT OR REPLACE INTO payments (cart_id, fingerprint, payer_email, requester_ip, amount_cents, at) VALUES (?, ?, ?, ?, ?, ?)'),
    byFingerprint: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE fingerprint = ? AND at > ?'),
    byRequesterIp: db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents FROM payments WHERE requester_ip = ? AND at > ?'),
    ipAct: db.prepare('INSERT INTO ip_activity (ip, kind, at) VALUES (?, ?, ?)'),
    ipCount: db.prepare('SELECT COUNT(*) AS n FROM ip_activity WHERE ip = ? AND kind = ? AND at > ?'),
    ipPrune: db.prepare('DELETE FROM ip_activity WHERE at < ?'),
    block: db.prepare('INSERT OR REPLACE INTO blocks (kind, value, reason, at) VALUES (?, ?, ?, ?)'),
    unblock: db.prepare('DELETE FROM blocks WHERE kind = ? AND value = ?'),
    isBlocked: db.prepare('SELECT reason FROM blocks WHERE kind = ? AND value = ?'),
    blocks: db.prepare('SELECT kind, value, reason, at FROM blocks ORDER BY at DESC'),
    recent: db.prepare('SELECT * FROM carts ORDER BY created_at DESC LIMIT ?'),
    statusCounts: db.prepare('SELECT status, COUNT(*) AS n FROM carts GROUP BY status'),
    keys: db.prepare('SELECT name, email, created_at, revoked FROM api_keys ORDER BY created_at DESC'),
    revokeKey: db.prepare('UPDATE api_keys SET revoked = 1 WHERE name = ?'),
    addKey: db.prepare('INSERT INTO api_keys (hash, name, email, created_at) VALUES (?, ?, ?, ?)'),
    keyByHash: db.prepare('SELECT name, email, revoked, user_id FROM api_keys WHERE hash = ?'),
    keysByUser: db.prepare('SELECT name, created_at, revoked FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'),
    revokeUserKey: db.prepare('UPDATE api_keys SET revoked = 1 WHERE name = ? AND user_id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userInsert: db.prepare('INSERT INTO users (id, email, doc, created_at) VALUES (?, ?, ?, ?)'),
    userSave: db.prepare('UPDATE users SET doc = ? WHERE id = ?'),
    codePut: db.prepare('INSERT OR REPLACE INTO login_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0)'),
    codeGet: db.prepare('SELECT * FROM login_codes WHERE email = ?'),
    codeTry: db.prepare('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?'),
    codeDel: db.prepare('DELETE FROM login_codes WHERE email = ?'),
    idGet: db.prepare('SELECT user_id FROM identities WHERE provider = ? AND subject = ?'),
    idAdd: db.prepare('INSERT OR IGNORE INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)'),
    idsOf: db.prepare('SELECT provider FROM identities WHERE user_id = ?'),
    sessPut: db.prepare('INSERT INTO sessions (hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessGet: db.prepare('SELECT user_id FROM sessions WHERE hash = ? AND expires_at > ?'),
    sessDel: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    sessPrune: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    cartsByUser: db.prepare("SELECT * FROM carts WHERE json_extract(doc, '$.user_id') = ? ORDER BY created_at DESC LIMIT ?"),
  };

  const userRow = (r) => r && { id: r.id, email: r.email, created_at: r.created_at, ...JSON.parse(r.doc || '{}') };

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
    risk: {
      recordPayment: (p) => q.recordPayment.run(p.cart_id, p.fingerprint ?? null, p.payer_email ?? null, p.requester_ip ?? null, p.amount_cents, Date.now()),
      paymentFor: (cartId) => q.paymentFor.get(cartId) || null,
      byFingerprint: (fp, since) => q.byFingerprint.get(fp, since),
      byRequesterIp: (ip, since) => q.byRequesterIp.get(ip, since),
      noteIp: (ip, kind) => q.ipAct.run(ip, kind, Date.now()),
      countIp: (ip, kind, since) => q.ipCount.get(ip, kind, since).n,
      pruneIp: (before) => q.ipPrune.run(before),
    },
    blocks: {
      add: (kind, value, reason) => q.block.run(kind, value, reason ?? null, Date.now()),
      remove: (kind, value) => q.unblock.run(kind, value),
      reason: (kind, value) => (value ? (q.isBlocked.get(kind, value) ?? null) : null),
      list: () => q.blocks.all(),
    },
    admin: {
      recent: (limit = 50) => q.recent.all(limit).map(hydrate),
      statusCounts: () => Object.fromEntries(q.statusCounts.all().map((r) => [r.status, r.n])),
      keys: () => q.keys.all(),
      revokeKey: (name) => q.revokeKey.run(name).changes === 1,
    },
    optouts: {
      add: (phone) => q.optOut.run(phone, Date.now()),
      remove: (phone) => q.optIn.run(phone),
      has: (phone) => Boolean(q.optedOut.get(phone)),
    },
    addKey: (hash, name, email, userId = null) => {
      q.addKey.run(hash, name, email, Date.now());
      if (userId) db.prepare('UPDATE api_keys SET user_id = ? WHERE hash = ?').run(userId, hash);
    },
    users: {
      byEmail: (email) => userRow(q.userByEmail.get(email)),
      byId: (id) => userRow(q.userById.get(id)),
      create: (id, email) => q.userInsert.run(id, email, '{}', Date.now()),
      save: (id, doc) => q.userSave.run(JSON.stringify(doc), id),
      carts: (id, limit = 100) => q.cartsByUser.all(id, limit).map(hydrate),
      keys: (id) => q.keysByUser.all(id),
      revokeKey: (id, name) => q.revokeUserKey.run(name, id).changes === 1,
    },
    codes: {
      put: (email, hash, expiresAt) => q.codePut.run(email, hash, expiresAt),
      get: (email) => q.codeGet.get(email) || null,
      attempt: (email) => q.codeTry.run(email),
      remove: (email) => q.codeDel.run(email),
    },
    identities: {
      userId: (provider, subject) => q.idGet.get(provider, subject)?.user_id || null,
      add: (provider, subject, userId) => q.idAdd.run(provider, subject, userId, Date.now()),
      providersOf: (userId) => q.idsOf.all(userId).map((r) => r.provider),
    },
    sessions: {
      create: (hash, userId, expiresAt) => q.sessPut.run(hash, userId, expiresAt),
      userId: (hash) => q.sessGet.get(hash, Date.now())?.user_id || null,
      remove: (hash) => q.sessDel.run(hash),
      prune: () => q.sessPrune.run(Date.now()),
    },
    keyByHash: (hash) => q.keyByHash.get(hash) || null,
    close: () => db.close(),
  };
}

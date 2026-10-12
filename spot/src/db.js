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
    -- Passkeys (WebAuthn credentials) for Face ID / Touch ID sign-in.
    CREATE TABLE IF NOT EXISTS passkeys (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      public_key  TEXT NOT NULL,
      counter     INTEGER NOT NULL DEFAULT 0,
      transports  TEXT,
      name        TEXT,
      created_at  INTEGER NOT NULL,
      used_at     INTEGER
    );
    CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys (user_id);
    -- One-time WebAuthn challenges (5 minutes).
    CREATE TABLE IF NOT EXISTS challenges (
      id          TEXT PRIMARY KEY,
      challenge   TEXT NOT NULL,
      user_id     TEXT,
      expires_at  INTEGER NOT NULL
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
    -- Messages sent about a cart: one row per (cart, message), so nobody is
    -- told the same thing twice.
    CREATE TABLE IF NOT EXISTS notices (
      cart_id  TEXT NOT NULL,
      key      TEXT NOT NULL,
      result   TEXT,
      at       INTEGER NOT NULL,
      PRIMARY KEY (cart_id, key)
    );
    -- Money movements on Spot's Issuing cards (store captures and store
    -- refunds), one row per Stripe transaction, so each is handled once.
    CREATE TABLE IF NOT EXISTS issuing_txns (
      id             TEXT PRIMARY KEY,
      cart_id        TEXT NOT NULL,
      authorization  TEXT,
      type           TEXT NOT NULL,
      amount_cents   INTEGER NOT NULL,
      merchant       TEXT,
      at             INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS issuing_txns_cart ON issuing_txns (cart_id);
    -- Signed approvals: a person said yes to exactly this purchase.
    CREATE TABLE IF NOT EXISTS approvals (
      id       TEXT PRIMARY KEY,
      cart_id  TEXT NOT NULL,
      jws      TEXT NOT NULL,
      at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS approvals_cart ON approvals (cart_id);
    -- What each AI key did, for its owner's activity log.
    CREATE TABLE IF NOT EXISTS agent_events (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      agent     TEXT NOT NULL,
      user_id   TEXT,
      kind      TEXT NOT NULL,
      detail    TEXT,
      at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS agent_events_agent ON agent_events (agent, at);
    -- Stores using the "Ask someone to pay" button.
    CREATE TABLE IF NOT EXISTS merchants (
      id           TEXT PRIMARY KEY,
      domain       TEXT NOT NULL,
      name         TEXT NOT NULL,
      email        TEXT NOT NULL,
      key          TEXT NOT NULL UNIQUE,
      verified_at  INTEGER,
      created_at   INTEGER NOT NULL
    );
    -- A cart a store's button sent over, waiting for the shopper's name (1h).
    CREATE TABLE IF NOT EXISTS merchant_drafts (
      id           TEXT PRIMARY KEY,
      merchant_id  TEXT NOT NULL,
      doc          TEXT NOT NULL,
      expires_at   INTEGER NOT NULL
    );
    -- Shopify stores that installed the Spot app. The access token is
    -- encrypted with a key from the app secret (see shopifyapp.js).
    CREATE TABLE IF NOT EXISTS shopify_shops (
      shop            TEXT PRIMARY KEY,
      merchant_id     TEXT,
      token           TEXT,
      refresh         TEXT,
      token_expires_at INTEGER,
      scopes          TEXT,
      primary_host    TEXT,
      name            TEXT,
      email           TEXT,
      currency        TEXT,
      installed_at    INTEGER NOT NULL,
      uninstalled_at  INTEGER,
      updated_at      INTEGER NOT NULL
    );
    -- One ask across several stores: a cart per store, paid in one go.
    CREATE TABLE IF NOT EXISTS bundles (
      id           TEXT PRIMARY KEY,
      token        TEXT NOT NULL UNIQUE,
      manage_hash  TEXT NOT NULL,
      payment_ref  TEXT UNIQUE,
      doc          TEXT NOT NULL,
      created_at   INTEGER NOT NULL
    );
    -- Server-side secrets that must survive restarts (e.g. link signing).
    CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    );
    -- Numbers that replied STOP to a Spot text.
    CREATE TABLE IF NOT EXISTS sms_optouts (
      phone  TEXT PRIMARY KEY,
      at     INTEGER NOT NULL
    );
    -- Products Spot has shown a signed-in shopper (their Shop page): one row
    -- per product page, the newest showing kept.
    CREATE TABLE IF NOT EXISTS seen_products (
      user_id  TEXT NOT NULL,
      url      TEXT NOT NULL,
      doc      TEXT NOT NULL,
      at       INTEGER NOT NULL,
      PRIMARY KEY (user_id, url)
    );
    CREATE INDEX IF NOT EXISTS seen_products_recent ON seen_products (user_id, at DESC);
    -- Each store's price-adjustment and return policy, as its own policy
    -- page says (storefacts.js), re-read monthly. Keyed by site (tecovas.com).
    CREATE TABLE IF NOT EXISTS store_policies (
      site  TEXT PRIMARY KEY,
      doc   TEXT NOT NULL,
      at    INTEGER NOT NULL
    );
    -- Prices Spot has seen for a product page: one row per page per day,
    -- the day's low and high, for "lowest Spot has seen" on the card.
    CREATE TABLE IF NOT EXISTS price_seen (
      url   TEXT NOT NULL,
      day   INTEGER NOT NULL,
      low   INTEGER NOT NULL,
      high  INTEGER NOT NULL,
      PRIMARY KEY (url, day)
    );
    -- "Watch this": products a signed-in shopper asked Spot to keep an eye
    -- on (watches.js), checked about twice a day until next_at says.
    CREATE TABLE IF NOT EXISTS watches (
      id       TEXT PRIMARY KEY,
      user_id  TEXT NOT NULL,
      url      TEXT NOT NULL,
      doc      TEXT NOT NULL,
      state    TEXT NOT NULL,
      next_at  INTEGER NOT NULL,
      at       INTEGER NOT NULL,
      UNIQUE (user_id, url)
    );
    CREATE INDEX IF NOT EXISTS watches_due ON watches (state, next_at);
    -- Fit and reviews per product page, as an AI read them (reviews.js).
    CREATE TABLE IF NOT EXISTS review_digests (
      url  TEXT PRIMARY KEY,
      doc  TEXT NOT NULL,
      at   INTEGER NOT NULL
    );
    -- The same product at other stores, cheaper (compare.js), kept a day.
    CREATE TABLE IF NOT EXISTS compare_offers (
      key  TEXT PRIMARY KEY,
      doc  TEXT NOT NULL,
      at   INTEGER NOT NULL
    );
    -- A store's current promo codes, as an AI found them (promos.js).
    CREATE TABLE IF NOT EXISTS promo_codes (
      site  TEXT PRIMARY KEY,
      doc   TEXT NOT NULL,
      at    INTEGER NOT NULL
    );
    -- What Spot has learned of a shopper's taste (taste.js).
    CREATE TABLE IF NOT EXISTS tastes (
      user_id  TEXT PRIMARY KEY,
      doc      TEXT NOT NULL,
      at       INTEGER NOT NULL
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
  // Spending rules an account sets for each of its AI keys.
  if (!db.prepare('PRAGMA table_info(api_keys)').all().some((c) => c.name === 'rules')) db.exec('ALTER TABLE api_keys ADD COLUMN rules TEXT');

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
    keyByName: db.prepare('SELECT name, email, revoked, user_id FROM api_keys WHERE name = ?'),
    keysByUser: db.prepare('SELECT name, created_at, revoked, rules FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'),
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

  const bundleRow = (r) => (r ? { id: r.id, token: r.token, manage_hash: r.manage_hash, payment_ref: r.payment_ref, created_at: r.created_at, ...JSON.parse(r.doc) } : null);
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
    // Every cart a Stripe payment paid for: one, or each store's cart in a
    // bundle (their refs are "<payment>#<n>").
    byPaymentAll: (ref) => db.prepare("SELECT * FROM carts WHERE payment_ref = ? OR payment_ref LIKE ? ESCAPE '\\' ORDER BY payment_ref").all(ref, `${String(ref).replace(/[\\%_]/g, (c) => `\\${c}`)}#%`).map(hydrate),
    bundles: {
      insert: (b) => db.prepare('INSERT INTO bundles (id, token, manage_hash, payment_ref, doc, created_at) VALUES (?, ?, ?, NULL, ?, ?)').run(b.id, b.token, b.manage_hash, JSON.stringify(b.doc), b.created_at),
      byToken: (t) => bundleRow(db.prepare('SELECT * FROM bundles WHERE token = ?').get(String(t))),
      byId: (id) => bundleRow(db.prepare('SELECT * FROM bundles WHERE id = ?').get(String(id))),
      byPayment: (ref) => bundleRow(db.prepare('SELECT * FROM bundles WHERE payment_ref = ?').get(String(ref))),
      setPayment: (id, ref) => db.prepare('UPDATE bundles SET payment_ref = ? WHERE id = ?').run(ref, id),
      carts: (id) => db.prepare("SELECT * FROM carts WHERE json_extract(doc, '$.bundle_id') = ? ORDER BY json_extract(doc, '$.bundle_index')").all(id).map(hydrate),
    },
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
    notices: {
      claim: (cartId, key) => db.prepare('INSERT OR IGNORE INTO notices (cart_id, key, at) VALUES (?, ?, ?)').run(cartId, key, Date.now()).changes === 1,
      result: (cartId, key, out) => db.prepare('UPDATE notices SET result = ? WHERE cart_id = ? AND key = ?').run(JSON.stringify(out), cartId, key),
      list: (cartId) => db.prepare('SELECT key, result, at FROM notices WHERE cart_id = ? ORDER BY at').all(cartId).map((r) => ({ ...r, result: r.result ? JSON.parse(r.result) : null })),
    },
    // A stored value, made once by `make` on first use.
    setting(key, make) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
      if (row) return row.value;
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, make());
      return db.prepare('SELECT value FROM settings WHERE key = ?').get(key).value;
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
      keys: (id) => q.keysByUser.all(id).map((k) => ({ ...k, rules: k.rules ? JSON.parse(k.rules) : null })),
      revokeKey: (id, name) => q.revokeUserKey.run(name, id).changes === 1,
      setEmail: (id, email) => db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, id),
      // Fold account `fromId` into `intoId`: its Spots, AI keys, sign-in
      // methods, passkeys and open sessions move over, blank profile fields
      // are filled from it, and it is deleted. One transaction.
      merge(fromId, intoId) {
        const from = userRow(q.userById.get(fromId));
        const into = userRow(q.userById.get(intoId));
        if (!from || !into || fromId === intoId) return;
        const pick = ({ phone, name, shipping, travelers, venmo, cashtag, sizes, setup_at, setup_skipped }) => ({ phone: phone || null, name: name || null, shipping: shipping || null, travelers: travelers || [], venmo: venmo || null, cashtag: cashtag || null, sizes: sizes || null, setup_at: setup_at || null, setup_skipped: Boolean(setup_skipped) });
        const a = pick(into);
        const b = pick(from);
        const doc = { phone: a.phone || b.phone, name: a.name || b.name, shipping: a.shipping || b.shipping, travelers: a.travelers.length ? a.travelers : b.travelers, venmo: a.venmo || b.venmo, cashtag: a.cashtag || b.cashtag, sizes: a.sizes || b.sizes, setup_at: a.setup_at || b.setup_at, setup_skipped: a.setup_at ? a.setup_skipped : b.setup_skipped };
        db.exec('BEGIN');
        try {
          db.prepare("UPDATE carts SET doc = json_set(doc, '$.user_id', ?) WHERE json_extract(doc, '$.user_id') = ?").run(intoId, fromId);
          for (const t of ['api_keys', 'identities', 'passkeys', 'sessions']) db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ?`).run(intoId, fromId);
          // Account settings kept outside the users row: the saved card, the
          // approver, the AI kill switch, the confirmed email (it moves with
          // the email, below) and early access. Keep the surviving account's
          // own when it has one; a stop on either account stays on.
          for (const kind of ['funding', 'approver', 'ai_stop', 'email_proven', 'invited']) {
            const get = (id) => db.prepare('SELECT value FROM settings WHERE key = ?').get(`state:${kind}:${id}`)?.value;
            const theirs = get(fromId);
            if (theirs && (!get(intoId) || kind === 'ai_stop')) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(`state:${kind}:${intoId}`, theirs);
            db.prepare('DELETE FROM settings WHERE key = ?').run(`state:${kind}:${fromId}`);
          }
          db.prepare('DELETE FROM users WHERE id = ?').run(fromId);
          if (!into.email && from.email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(from.email, intoId);
          q.userSave.run(JSON.stringify(doc), intoId);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
      },
    },
    codes: {
      put: (email, hash, expiresAt) => q.codePut.run(email, hash, expiresAt),
      get: (email) => q.codeGet.get(email) || null,
      attempt: (email) => q.codeTry.run(email),
      remove: (email) => q.codeDel.run(email),
    },
    passkeys: {
      add: (p) => db.prepare('INSERT INTO passkeys (id, user_id, public_key, counter, transports, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(p.id, p.user_id, p.public_key, p.counter, p.transports, p.name, Date.now()),
      get: (id) => db.prepare('SELECT * FROM passkeys WHERE id = ?').get(id) || null,
      ofUser: (userId) => db.prepare('SELECT id, name, transports, created_at, used_at FROM passkeys WHERE user_id = ? ORDER BY created_at').all(userId),
      used: (id, counter) => db.prepare('UPDATE passkeys SET counter = ?, used_at = ? WHERE id = ?').run(counter, Date.now(), id),
      remove: (userId, id) => db.prepare('DELETE FROM passkeys WHERE user_id = ? AND id = ?').run(userId, id).changes === 1,
    },
    challenges: {
      put: (id, challenge, userId) => {
        db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(Date.now());
        db.prepare('INSERT INTO challenges (id, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)').run(id, challenge, userId ?? null, Date.now() + 5 * 60_000);
      },
      // Single use: read and delete in one go.
      take: (id) => {
        const row = db.prepare('SELECT * FROM challenges WHERE id = ? AND expires_at > ?').get(id, Date.now());
        db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
        return row || null;
      },
    },
    identities: {
      userId: (provider, subject) => q.idGet.get(provider, subject)?.user_id || null,
      add: (provider, subject, userId) => q.idAdd.run(provider, subject, userId, Date.now()),
      providersOf: (userId) => q.idsOf.all(userId).map((r) => r.provider),
      remove: (provider, subject) => db.prepare('DELETE FROM identities WHERE provider = ? AND subject = ?').run(provider, subject),
      ofUser: (userId) => db.prepare('SELECT provider, subject FROM identities WHERE user_id = ?').all(userId),
    },
    sessions: {
      create: (hash, userId, expiresAt) => q.sessPut.run(hash, userId, expiresAt),
      userId: (hash) => q.sessGet.get(hash, Date.now())?.user_id || null,
      remove: (hash) => q.sessDel.run(hash),
      prune: () => q.sessPrune.run(Date.now()),
    },
    // Carts the money sweep looks at: in flight, or completed with a pending
    // release, a failed partial refund, or a hold still to capture.
    idsForMoneySweep: () =>
      db
        .prepare(`SELECT id FROM carts WHERE status IN ('refunding', 'paid', 'card_issued')
                  OR (status = 'completed' AND (json_extract(doc, '$.release_after') IS NOT NULL OR json_extract(doc, '$.capture_due') IS NOT NULL OR doc LIKE '%"state":"failed"%'))
                  OR json_extract(doc, '$.card_cancel_after') IS NOT NULL LIMIT 2000`)
        .all()
        .map((r) => r.id),
    // Spot-card orders placed since `since`, for the price watch (pricewatch.js).
    idsForPriceWatch: (since) =>
      db
        .prepare(`SELECT id FROM carts WHERE settle = 'card' AND status IN ('card_issued', 'completed')
                  AND (json_extract(doc, '$.fulfillment.placed_at') > ? OR json_extract(doc, '$.spent_at') > ?)
                  ORDER BY json_extract(doc, '$.price_watch.last_at') IS NOT NULL, json_extract(doc, '$.price_watch.last_at') LIMIT 2000`)
        .all(since, since)
        .map((r) => r.id),
    // Orders placed through agent checkout since `since`, not yet delivered (tracking.js).
    idsToTrack: (since) =>
      db
        .prepare(`SELECT id FROM carts WHERE json_extract(doc, '$.fulfillment.state') = 'placed' AND json_extract(doc, '$.fulfillment.order_id') IS NOT NULL
                  AND json_extract(doc, '$.fulfillment.placed_at') > ? AND COALESCE(json_extract(doc, '$.tracking.status'), '') != 'delivered'
                  ORDER BY COALESCE(json_extract(doc, '$.tracking.checked_at'), 0) LIMIT 500`)
        .all(since)
        .map((r) => r.id),
    // Returns under way (spot.requestReturn), for /admin.
    idsReturns: () => db.prepare("SELECT id FROM carts WHERE json_extract(doc, '$.return.state') IN ('requested', 'shipped') LIMIT 500").all().map((r) => r.id),
    // Price drops waiting on staff (found, not yet claimed or dismissed).
    idsPriceDrops: () => db.prepare("SELECT id FROM carts WHERE json_extract(doc, '$.price_watch.state') IN ('dropped', 'claimed') LIMIT 500").all().map((r) => r.id),
    idsDirectOpen: () => db.prepare("SELECT id FROM carts WHERE status = 'open' AND json_extract(doc, '$.direct.checkout_id') IS NOT NULL LIMIT 500").all().map((r) => r.id),
    idsByStatus: (statuses) => db.prepare(`SELECT id FROM carts WHERE status IN (${statuses.map(() => '?').join(',')}) LIMIT 2000`).all(...statuses).map((r) => r.id),
    keyByHash: (hash) => q.keyByHash.get(hash) || null,
    watches: {
      row: (r) => r && { ...JSON.parse(r.doc), id: r.id, user_id: r.user_id, url: r.url, state: r.state, next_at: r.next_at, at: r.at },
      byId(id) {
        return this.row(db.prepare('SELECT * FROM watches WHERE id = ?').get(String(id)));
      },
      of(userId, url) {
        return this.row(db.prepare('SELECT * FROM watches WHERE user_id = ? AND url = ?').get(userId, url));
      },
      list(userId) {
        return db.prepare("SELECT * FROM watches WHERE user_id = ? AND state = 'on' ORDER BY at DESC LIMIT 100").all(userId).map((r) => this.row(r));
      },
      count(userId) {
        return db.prepare("SELECT COUNT(*) AS n FROM watches WHERE user_id = ? AND state = 'on'").get(userId).n;
      },
      due(now, limit = 20) {
        return db.prepare("SELECT * FROM watches WHERE state = 'on' AND next_at <= ? ORDER BY next_at LIMIT ?").all(now, limit).map((r) => this.row(r));
      },
      save(w) {
        const { id, user_id, url, state, next_at, at, ...doc } = w;
        db.prepare('INSERT INTO watches (id, user_id, url, doc, state, next_at, at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET doc = excluded.doc, state = excluded.state, next_at = excluded.next_at').run(id, user_id, url, JSON.stringify(doc), state, next_at, at);
        return this.byId(id);
      },
    },
    reviews: {
      get(url) {
        const r = db.prepare('SELECT doc, at FROM review_digests WHERE url = ?').get(String(url));
        return r ? { ...JSON.parse(r.doc), at: r.at } : null;
      },
      set(url, doc, at = Date.now()) {
        db.prepare('INSERT INTO review_digests (url, doc, at) VALUES (?, ?, ?) ON CONFLICT (url) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(String(url).slice(0, 1000), JSON.stringify(doc), at);
      },
    },
    compares: {
      get(key) {
        const r = db.prepare('SELECT doc, at FROM compare_offers WHERE key = ?').get(String(key));
        return r ? { ...JSON.parse(r.doc), at: r.at } : null;
      },
      set(key, doc, at = Date.now()) {
        db.prepare('INSERT INTO compare_offers (key, doc, at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(String(key).slice(0, 1200), JSON.stringify(doc), at);
      },
    },
    promos: {
      get(site) {
        const r = db.prepare('SELECT doc, at FROM promo_codes WHERE site = ?').get(String(site));
        return r ? { ...JSON.parse(r.doc), at: r.at } : null;
      },
      set(site, doc, at = Date.now()) {
        db.prepare('INSERT INTO promo_codes (site, doc, at) VALUES (?, ?, ?) ON CONFLICT (site) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(String(site), JSON.stringify(doc), at);
      },
    },
    policies: {
      get(site) {
        const r = db.prepare('SELECT doc, at FROM store_policies WHERE site = ?').get(site);
        return r ? { ...JSON.parse(r.doc), at: r.at } : null;
      },
      set(site, doc, at = Date.now()) {
        db.prepare('INSERT INTO store_policies (site, doc, at) VALUES (?, ?, ?) ON CONFLICT (site) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(site, JSON.stringify(doc), at);
      },
    },
    prices: {
      add(url, cents, at = Date.now()) {
        if (!url || !Number.isInteger(cents) || cents <= 0) return;
        const day = Math.floor(at / 86_400_000);
        db.prepare('INSERT INTO price_seen (url, day, low, high) VALUES (?, ?, ?, ?) ON CONFLICT (url, day) DO UPDATE SET low = MIN(low, excluded.low), high = MAX(high, excluded.high)').run(String(url).slice(0, 1000), day, cents, cents);
      },
      // Low, high and since when, over the last `days`.
      of(url, days = 90, at = Date.now()) {
        const since = Math.floor(at / 86_400_000) - days;
        const r = db.prepare('SELECT MIN(low) AS low, MAX(high) AS high, MIN(day) AS first, COUNT(*) AS days FROM price_seen WHERE url = ? AND day >= ?').get(String(url), since);
        return r?.days ? { low_cents: r.low, high_cents: r.high, since: r.first * 86_400_000, days: r.days } : null;
      },
    },
    // A shopper's Shop page: every product Spot has shown them, newest first.
    seen: {
      KEEP: 300,
      last: 0,
      add(userId, url, doc, at = Date.now()) {
        if (!userId || !url) return;
        // Strictly increasing, so "newest first" holds within a millisecond.
        at = this.last = Math.max(at, this.last + 1);
        db.prepare('INSERT INTO seen_products (user_id, url, doc, at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, url) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(userId, url, JSON.stringify(doc), at);
      },
      prune(userId) {
        db.prepare('DELETE FROM seen_products WHERE user_id = ? AND url NOT IN (SELECT url FROM seen_products WHERE user_id = ? ORDER BY at DESC LIMIT ?)').run(userId, userId, this.KEEP);
      },
      list(userId, limit = 300) {
        return db
          .prepare('SELECT doc, at FROM seen_products WHERE user_id = ? ORDER BY at DESC LIMIT ?')
          .all(userId, Math.min(limit, this.KEEP))
          .map((r) => ({ ...JSON.parse(r.doc), seen_at: r.at }));
      },
      clear(userId) {
        db.prepare('DELETE FROM seen_products WHERE user_id = ?').run(userId);
      },
      // A whole collection (everything shown for one ask), or one product.
      removeAsked(userId, asked) {
        return db.prepare("DELETE FROM seen_products WHERE user_id = ? AND COALESCE(json_extract(doc, '$.asked'), '') = ?").run(userId, String(asked)).changes;
      },
      removeUrl(userId, url) {
        return db.prepare('DELETE FROM seen_products WHERE user_id = ? AND url = ?').run(userId, String(url)).changes;
      },
    },
    tastes: {
      get(userId) {
        const r = db.prepare('SELECT doc FROM tastes WHERE user_id = ?').get(userId);
        return r ? JSON.parse(r.doc) : null;
      },
      set(userId, doc, at = Date.now()) {
        db.prepare('INSERT INTO tastes (user_id, doc, at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET doc = excluded.doc, at = excluded.at').run(userId, JSON.stringify(doc), at);
      },
      clear(userId) {
        db.prepare('DELETE FROM tastes WHERE user_id = ?').run(userId);
      },
    },
    keyByName: (name) => q.keyByName.get(name) || null,
    issuing: {
      // True if this transaction is new (a webhook can arrive twice).
      add: (t) => db.prepare('INSERT OR IGNORE INTO issuing_txns (id, cart_id, "authorization", type, amount_cents, merchant, at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(t.id, t.cart_id, t.authorization ?? null, t.type, t.amount_cents, t.merchant ?? null, Date.now()).changes === 1,
      ofCart: (cartId) => db.prepare('SELECT id, "authorization", type, amount_cents, merchant, at FROM issuing_txns WHERE cart_id = ? ORDER BY at').all(cartId),
      // Carts whose card money doesn't add up (for /admin): charged more than
      // the payer paid for the goods, or refunded more than they paid.
      totals: (cartId) => {
        const r = db.prepare("SELECT COALESCE(SUM(CASE WHEN type = 'capture' THEN amount_cents END), 0) AS captured, COALESCE(SUM(CASE WHEN type = 'refund' THEN amount_cents END), 0) AS returned FROM issuing_txns WHERE cart_id = ?").get(cartId);
        return { captured: r.captured, returned: r.returned };
      },
    },
    approvals: {
      add: (a) => db.prepare('INSERT INTO approvals (id, cart_id, jws, at) VALUES (?, ?, ?, ?)').run(a.id, a.cart_id, a.jws, Date.now()),
      get: (id) => db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) || null,
      ofCart: (cartId) => db.prepare('SELECT id, jws, at FROM approvals WHERE cart_id = ? ORDER BY at').all(cartId),
    },
    agentEvents: {
      add: (agent, userId, kind, detail) => db.prepare('INSERT INTO agent_events (agent, user_id, kind, detail, at) VALUES (?, ?, ?, ?, ?)').run(agent, userId ?? null, kind, detail ? JSON.stringify(detail) : null, Date.now()),
      recent: (agent, limit = 20) => db.prepare('SELECT kind, detail, at FROM agent_events WHERE agent = ? ORDER BY id DESC LIMIT ?').all(agent, limit).map((r) => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null })),
    },
    keyRules: {
      get: (name) => {
        const r = db.prepare('SELECT rules, user_id FROM api_keys WHERE name = ?').get(name);
        return r ? { user_id: r.user_id, rules: r.rules ? JSON.parse(r.rules) : null } : null;
      },
      set: (userId, name, rules) => db.prepare('UPDATE api_keys SET rules = ? WHERE name = ? AND user_id = ?').run(rules ? JSON.stringify(rules) : null, name, userId).changes === 1,
    },
    // What an AI key's asks added up to this month (canceled, expired and
    // refunded ones don't count).
    agentMonthCents: (agent, since) =>
      db.prepare("SELECT COALESCE(SUM(json_extract(doc, '$.cart_cents')), 0) AS c FROM carts WHERE json_extract(doc, '$.agent') = ? AND created_at >= ? AND status NOT IN ('canceled', 'expired', 'refunded')").get(agent, since).c,
    merchants: {
      add: (m) => db.prepare('INSERT INTO merchants (id, domain, name, email, key, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(m.id, m.domain, m.name, m.email, m.key, Date.now()),
      byKey: (key) => db.prepare('SELECT * FROM merchants WHERE key = ?').get(key) || null,
      byId: (id) => db.prepare('SELECT * FROM merchants WHERE id = ?').get(id) || null,
      verify: (id) => db.prepare('UPDATE merchants SET verified_at = ? WHERE id = ?').run(Date.now(), id),
      list: () => db.prepare('SELECT id, domain, name, email, verified_at, created_at FROM merchants ORDER BY created_at DESC LIMIT 200').all(),
      countForDomain: (domain) => db.prepare('SELECT COUNT(*) AS n FROM merchants WHERE domain = ?').get(domain).n,
      update: (id, { domain, name, email }) => db.prepare('UPDATE merchants SET domain = ?, name = ?, email = ? WHERE id = ?').run(domain, name, email, id),
    },
    shopify: {
      get: (shop) => db.prepare('SELECT * FROM shopify_shops WHERE shop = ?').get(shop) || null,
      save: (r) => {
        const now = Date.now();
        db.prepare(`INSERT INTO shopify_shops (shop, merchant_id, token, refresh, token_expires_at, scopes, primary_host, name, email, currency, installed_at, uninstalled_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
          ON CONFLICT (shop) DO UPDATE SET merchant_id = excluded.merchant_id, token = excluded.token, refresh = excluded.refresh, token_expires_at = excluded.token_expires_at,
            scopes = excluded.scopes, primary_host = excluded.primary_host, name = excluded.name, email = excluded.email, currency = excluded.currency,
            uninstalled_at = NULL, updated_at = excluded.updated_at`)
          .run(r.shop, r.merchant_id ?? null, r.token ?? null, r.refresh ?? null, r.token_expires_at ?? null, r.scopes ?? null, r.primary_host ?? null, r.name ?? null, r.email ?? null, r.currency ?? null, now, now);
      },
      // Uninstalled: the token is dead, so forget it.
      uninstall: (shop) => db.prepare('UPDATE shopify_shops SET token = NULL, refresh = NULL, token_expires_at = NULL, uninstalled_at = ?, updated_at = ? WHERE shop = ?').run(Date.now(), Date.now(), shop),
      remove: (shop) => db.prepare('DELETE FROM shopify_shops WHERE shop = ?').run(shop),
      count: () => db.prepare('SELECT COUNT(*) AS n FROM shopify_shops WHERE uninstalled_at IS NULL').get().n,
    },
    drafts: {
      put: (id, merchantId, doc) => {
        db.prepare('DELETE FROM merchant_drafts WHERE expires_at < ?').run(Date.now());
        db.prepare('INSERT INTO merchant_drafts (id, merchant_id, doc, expires_at) VALUES (?, ?, ?, ?)').run(id, merchantId, JSON.stringify(doc), Date.now() + 3600_000);
      },
      get: (id) => {
        const r = db.prepare('SELECT * FROM merchant_drafts WHERE id = ? AND expires_at > ?').get(id, Date.now());
        return r ? { merchant_id: r.merchant_id, ...JSON.parse(r.doc) } : null;
      },
    },
    // Stored state that changes (e.g. the last backup), unlike setting().
    state: {
      get: (key) => {
        const v = db.prepare('SELECT value FROM settings WHERE key = ?').get(`state:${key}`)?.value;
        return v ? JSON.parse(v) : null;
      },
      set: (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(`state:${key}`, JSON.stringify(value)),
    },
    // A consistent copy of the whole database, taken while it's in use.
    backupTo: (file) => db.prepare('VACUUM INTO ?').run(file),
    close: () => db.close(),
  };
}

// Family: a parent's rules for their teen's asks. The same idea as the
// rules on an AI key (rules.js), applied to a person:
//
//   small stuff at approved stores goes through on its own,
//   the big stuff pings the parent.
//
// A parent adds a teen from their account (name, and that they're the
// teen's parent or guardian and the teen is 13 to 17). That makes a join
// link, good for 7 days. The teen opens it, signs in, and is linked. The
// link also lets them past the early-access gate (invites.js).
//
// The parent's rules for each teen:
//   auto_cents     an ask at or under this, at an approved store, is paid
//                  from the parent's saved card right away (funding.js) and
//                  Spot orders it. Null: every ask goes to the parent.
//   monthly_cents  what goes through on its own adds up to no more than
//                  this a month; past it, asks go to the parent
//   stores         the approved stores (domains, like rules.js)
//   paused         nothing goes through on its own; every ask pings
//
// Anything outside the rules isn't refused: it goes to the parent (email,
// text, and their phone's notifications) with a one-tap Approve that pays
// from their saved card, on the ask's own pay page. Age-restricted things
// (alcohol, nicotine, cannabis, guns and ammunition, adult products) are
// refused for a teen whatever the rules say, and a Spot card bought for a
// teen declines liquor, tobacco and similar merchants (cart.js).
//
//   GET  /v1/me/family                   the parent's teens, or the teen's parent
//   POST /v1/me/family { name, consent } add a teen → join link
//   POST /v1/me/family/:id/rules         { auto_cents, monthly_cents, stores, agree }
//   POST /v1/me/family/:id/pause         { on }
//   POST /v1/me/family/:id/link          a fresh join link
//   POST /v1/me/family/:id/remove
//   POST /v1/me/family/leave             the teen leaves
//   GET  /family/join/:token             the teen's join page
//   POST /v1/family/join { token }       signed in: link this account
//   POST /v1/carts/:token/family/approve the parent's one tap
//
// Only a hash of each join token is kept.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CartError, FAMILY_HOWS, familyPaid, usd } from './cart.js';
import { domainOf, monthStart } from './rules.js';
import { cardLabel, fundingOf } from './funding.js';
import { sessionUserId } from './accounts.js';

export const MAX_TEENS = 6;
export const JOIN_DAYS = 7;
const AUTO_MAX_CENTS = 500_00; // the most a parent can let through on its own
// $25, $12.50: whole dollars read cleaner without cents.
const money = (c) => (c % 100 ? usd(c) : `$${(c / 100).toLocaleString('en-US')}`);
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { FAMILY_HOWS, familyPaid };

// ─── Age-restricted ───────────────────────────────────────────────────────
// What Spot won't get for a teen, by item name. Narrow on purpose: "wine
// glasses", "root beer", "glue gun" and "champagne gold" all stay allowed.
const TEEN_ITEMS = new RegExp(
  [
    // alcohol
    String.raw`(?<!root\s)(?<!ginger\s)\bbeers?\b`, String.raw`\b(ipa|lager|pilsner|vodka|whiske?y|bourbon|scotch whisky|tequila|mezcal|liqueur|liquor|hard seltzer|hard cider|cabernet|merlot|chardonnay|pinot noir|pinot grigio|sauvignon blanc|prosecco|sangria)\b`,
    String.raw`\b(red|white|ros[eé]|sparkling|dessert)\s+wines?\b`, String.raw`\bwines?\s+(bottles?|case|club|subscription|gift set)\b`, String.raw`\bbottles? of (wine|gin|rum|vodka|whiske?y)\b`, String.raw`\b(gin|rum)\s+(bottle|\d+\s?ml)\b`,
    // nicotine and tobacco
    String.raw`\b(vapes?|vaping|vape pens?|e-?cigs?|e-?cigarettes?|e-?liquids?|e-?juices?|nicotine|cigarettes?|cigars?|cigarillos?|juul|zyn|snus|hookah|shisha|tobacco|rolling papers)\b`,
    // cannabis and the like
    String.raw`\b(thc|delta[\s-]?[89]|cbd|cannabis|marijuana|kratom|thca)\b`,
    // guns and ammunition
    // (not bare "rifle" or "pistol": Rifle Paper Co., a pistol-grip drill)
    String.raw`\b(firearms?|handguns?|ammo|ammunition|gun suppressors?|brass knuckles|ar-?15|ak-?47|12[\s-]gauge|shotgun shells?|hunting rifles?|semi-?automatic (rifle|pistol)s?|9\s?mm (pistol|handgun)s?|\.22 (lr|rifle)s?)\b`, String.raw`\b\d+\s?rounds? of\b`,
    // adult
    String.raw`\b(sex toys?|adult toys?|vibrators?|dildos?|xxx|erotic)\b`,
    // gambling
    String.raw`\blottery tickets?\b`,
  ].join('|'),
  'i',
);
// Store hosts: a few words anywhere in the name (vapeshop.com), the rest only
// as a whole part (wine.com, not twinewholesale.com; ammo, not hammock).
const TEEN_STORES = /(vape|vapor|tobacco|cigar|liquor|dispensar|kratom|firearm)|(^|[.-])(smoke|smokeshop|wines?|winery|spirits|beer|cbd|thc|guns?|ammo)([.-]|$)|^(drizly|totalwine|reservebar|minibar|winc|vinebox|caskers|flaviar|bevmo|juul|zyn)\./i;

export function teenBlocked(items = [], storeUrls = []) {
  for (const it of items) {
    const t = `${it?.title || ''} ${it?.variant || ''}`;
    if (TEEN_ITEMS.test(t)) return `Spot can’t get “${String(it.title).slice(0, 60)}” for you: it’s only for adults.`;
  }
  for (const u of storeUrls) {
    const d = domainOf(u);
    if (d && TEEN_STORES.test(d)) return `Spot can’t order from ${d} for you: it sells things that are only for adults.`;
  }
  return null;
}

// ─── Rules ────────────────────────────────────────────────────────────────
export function normalizeFamilyRules(b = {}) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new CartError('Rules must be an object');
  const cents = (v, name, max) => {
    if (v == null || v === '') return null;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n < 100 || n > max) throw new CartError(`${name} must be between $1 and ${usd(max)}`);
    return n;
  };
  if (b.stores != null && !Array.isArray(b.stores)) throw new CartError('stores must be a list of store domains, like ["nike.com"]');
  const stores = [];
  for (const raw of b.stores || []) {
    const d = domainOf(String(raw));
    if (!d || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) throw new CartError(`“${String(raw).slice(0, 60)}” isn’t a store, like nike.com`);
    if (TEEN_STORES.test(d)) throw new CartError(`${d} sells things only for adults, so it can’t be an approved store`);
    if (!stores.includes(d)) stores.push(d);
  }
  if (stores.length > 50) throw new CartError('Up to 50 stores');
  const out = {
    auto_cents: cents(b.auto_cents, 'The on-its-own limit', AUTO_MAX_CENTS),
    monthly_cents: cents(b.monthly_cents, 'The monthly limit', 5000_00),
    stores,
  };
  if (out.auto_cents && out.monthly_cents && out.monthly_cents < out.auto_cents) throw new CartError('The monthly limit can’t be lower than the on-its-own limit');
  return out;
}

const storeOk = (stores, url) => {
  const d = domainOf(url);
  return Boolean(d) && stores.some((s) => d === s || d.endsWith(`.${s}`));
};

// → { auto: true } | { auto: false, reason, kid }: why it went to the
// parent, said to the parent (reason) and to the teen (kid).
export function decide(fam, { cents, storeUrls = [], spent = 0, card = false, parent = 'Your parent' }) {
  const r = fam.rules || {};
  const name = fam.name;
  const no = (reason, kid) => ({ auto: false, reason, kid });
  if (!card) return no(`You haven’t added a card for ${name}’s asks yet`, `${parent} decides each one`);
  if (fam.paused_at) return no(`You paused ${name}’s auto-approve`, `${parent} decides each one right now`);
  if (!r.auto_cents || !fam.auto_ok_at) return no(`Every ask from ${name} comes to you`, `${parent} decides each one`);
  if (!r.stores?.length) return no('You haven’t approved any stores yet', `${parent} hasn’t approved any stores yet`);
  const off = storeUrls.find((u) => !storeOk(r.stores, u));
  if (!storeUrls.length || off) {
    const store = domainOf(off) || 'That store';
    return no(`${store} isn’t one of your approved stores`, `${store} isn’t on ${parent}’s approved list`);
  }
  if (cents > r.auto_cents) return no(`Over your ${money(r.auto_cents)} limit for things that go through on their own`, `it’s over ${money(r.auto_cents)}`);
  if (r.monthly_cents && spent + cents > r.monthly_cents) return no(`Over ${name}’s ${money(r.monthly_cents)} a month (${money(spent)} used)`, `it’s past the ${money(r.monthly_cents)} a month ${parent} set`);
  return { auto: true };
}

// ─── Storage ──────────────────────────────────────────────────────────────
export function createFamily({ db, spot }) {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS family (
      id          TEXT PRIMARY KEY,
      parent_id   TEXT NOT NULL,
      kid_id      TEXT,
      name        TEXT NOT NULL,
      rules       TEXT,
      link_hash   TEXT,
      link_at     INTEGER,
      consent_at  INTEGER NOT NULL,
      auto_ok_at  INTEGER,
      paused_at   INTEGER,
      created_at  INTEGER NOT NULL,
      joined_at   INTEGER,
      removed_at  INTEGER
    );
    CREATE INDEX IF NOT EXISTS family_parent ON family (parent_id);
    CREATE INDEX IF NOT EXISTS family_kid ON family (kid_id);
    CREATE UNIQUE INDEX IF NOT EXISTS family_link ON family (link_hash);`);
  const row = (r) => (r ? { ...r, rules: r.rules ? JSON.parse(r.rules) : { auto_cents: null, monthly_cents: null, stores: [] } } : null);
  const q = {
    get: db.raw.prepare('SELECT * FROM family WHERE id = ?'),
    ofParent: db.raw.prepare('SELECT * FROM family WHERE parent_id = ? AND removed_at IS NULL ORDER BY created_at'),
    ofKid: db.raw.prepare('SELECT * FROM family WHERE kid_id = ? AND removed_at IS NULL'),
    byLink: db.raw.prepare('SELECT * FROM family WHERE link_hash = ? AND removed_at IS NULL'),
    add: db.raw.prepare('INSERT INTO family (id, parent_id, name, link_hash, link_at, consent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    link: db.raw.prepare('UPDATE family SET link_hash = ?, link_at = ? WHERE id = ?'),
    join: db.raw.prepare('UPDATE family SET kid_id = ?, joined_at = ?, link_hash = NULL WHERE id = ? AND kid_id IS NULL AND removed_at IS NULL'),
    rules: db.raw.prepare('UPDATE family SET rules = ?, auto_ok_at = ? WHERE id = ?'),
    pause: db.raw.prepare('UPDATE family SET paused_at = ? WHERE id = ?'),
    remove: db.raw.prepare('UPDATE family SET removed_at = ?, link_hash = NULL WHERE id = ?'),
  };
  const newLink = (id) => {
    const token = randomBytes(24).toString('base64url');
    q.link.run(sha(token), Date.now(), id);
    return token;
  };
  const admitKey = (userId) => `invited:${userId}`;

  const fam = {
    byId: (id) => row(q.get.get(String(id))),
    ofParent: (parentId) => q.ofParent.all(String(parentId)).map(row),
    // The teen's (one) family, if they're in one.
    ofKid: (kidId) => (kidId ? row(q.ofKid.get(String(kidId))) : null),
    mine(parentId, id) {
      const f = this.byId(id);
      if (!f || f.parent_id !== parentId || f.removed_at) throw new CartError('Not found', 404);
      return f;
    },

    add(parentId, { name, consent }) {
      if (consent !== true) throw new CartError('Confirm you’re their parent or guardian and they’re 13 to 17');
      const n = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (!n) throw new CartError('What’s their name?');
      if (this.ofKid(parentId)) throw new CartError('Your account is a teen’s account in a family, so it can’t add teens', 409);
      if (this.ofParent(parentId).length >= MAX_TEENS) throw new CartError(`Up to ${MAX_TEENS} teens`, 409);
      const id = randomUUID();
      const token = randomBytes(24).toString('base64url');
      const now = Date.now();
      q.add.run(id, parentId, n, sha(token), now, now, now);
      return { family: this.byId(id), token };
    },
    relink(parentId, id) {
      const f = this.mine(parentId, id);
      if (f.kid_id) throw new CartError(`${f.name} already joined`, 409);
      return newLink(f.id);
    },
    setRules(parentId, id, body = {}) {
      const f = this.mine(parentId, id);
      const rules = normalizeFamilyRules(body);
      // Letting things through on their own is its own yes, once.
      if (rules.auto_cents && !f.auto_ok_at && body.agree !== true) throw new CartError(`Tick the box to let ${f.name}’s small asks be paid from your card without asking you`, 409);
      q.rules.run(JSON.stringify(rules), rules.auto_cents ? f.auto_ok_at || Date.now() : null, f.id);
      return this.byId(f.id);
    },
    pause(parentId, id, on) {
      const f = this.mine(parentId, id);
      q.pause.run(on ? Date.now() : null, f.id);
      return this.byId(f.id);
    },
    remove(parentId, id) {
      const f = this.mine(parentId, id);
      q.remove.run(Date.now(), f.id);
      if (f.kid_id && db.state.get(admitKey(f.kid_id))?.via === 'family') db.state.set(admitKey(f.kid_id), null);
      return { removed: true };
    },
    leave(kidId) {
      const f = this.ofKid(kidId);
      if (!f) throw new CartError('You’re not in a family', 404);
      return this.remove(f.parent_id, f.id);
    },

    // The join link: valid for JOIN_DAYS, once.
    preview(token) {
      const f = token ? row(q.byLink.get(sha(token))) : null;
      if (!f || f.kid_id || Date.now() - f.link_at > JOIN_DAYS * 86400_000) return null;
      return f;
    },
    join(token, kidId) {
      const f = this.preview(token);
      if (!f) throw new CartError('This family link has expired or was already used. Ask for a new one.', 404);
      if (f.parent_id === kidId) throw new CartError('That’s your own link: send it to your teen', 409);
      if (this.ofKid(kidId)) throw new CartError('Your account is already in a family', 409);
      if (this.ofParent(kidId).length) throw new CartError('This account has teens of its own, so it can’t join as a teen', 409);
      if (!q.join.run(kidId, Date.now(), f.id).changes) throw new CartError('This family link was already used', 409);
      if (!db.state.get(admitKey(kidId))) db.state.set(admitKey(kidId), { via: 'family', family_id: f.id, at: Date.now() });
      return this.byId(f.id);
    },

    // What went through on its own this month (that's what the monthly limit caps).
    spent(f, now = new Date()) {
      if (!f.kid_id) return 0;
      const since = monthStart(now);
      return db.users
        .carts(f.kid_id, 500)
        .filter((c) => c.family?.id === f.id && c.saved_pay?.how === 'paid_by_family_rules' && (c.paid_at || 0) >= since && ['paid', 'card_issued', 'completed'].includes(c.status))
        .reduce((n, c) => n + c.cart_cents, 0);
    },

    // For the parent's account page.
    view(f) {
      const kid = f.kid_id ? db.users.byId(f.kid_id) : null;
      const recent = f.kid_id
        ? db.users
            .carts(f.kid_id, 50)
            .filter((c) => c.family?.id === f.id)
            .slice(0, 8)
            .map((c) => ({ token: c.token, item: c.items[0]?.title || '', store: c.merchant?.name || '', cents: c.cart_cents, status: c.status, decision: c.family.decision, reason: c.family.reason || null, at: c.created_at }))
        : [];
      return {
        id: f.id,
        name: f.name,
        joined: Boolean(f.kid_id),
        kid: kid ? { name: kid.name || null } : null,
        rules: f.rules,
        auto_on: Boolean(f.auto_ok_at && f.rules.auto_cents),
        paused: Boolean(f.paused_at),
        spent_cents: this.spent(f),
        link_expired: !f.kid_id && Date.now() - f.link_at > JOIN_DAYS * 86400_000,
        recent,
      };
    },
  };
  return fam;
}

// ─── Routes ───────────────────────────────────────────────────────────────
export function registerFamily(app, { db, spot, family, urlFor, log = console }) {
  const json = (req) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
  };
  const me = (req) => {
    const id = sessionUserId(db, req);
    const user = id && db.users.byId(id);
    if (!user) throw new CartError('Sign in first', 401);
    return user;
  };
  const joinUrl = (req, token) => urlFor(req, `/family/join/${token}`);
  const firstName = (u) => String(u?.name || '').trim().split(/\s+/)[0] || null;

  app.get('/v1/me/family', async (req) => {
    const user = me(req);
    const asKid = family.ofKid(user.id);
    const f = fundingOf(db, user.id);
    return {
      teens: family.ofParent(user.id).map((x) => family.view(x)),
      card: f ? cardLabel(f) : null,
      parent: asKid
        ? (() => {
            const p = db.users.byId(asKid.parent_id);
            return { name: firstName(p) || 'Your parent', auto_cents: asKid.auto_ok_at && !asKid.paused_at ? asKid.rules.auto_cents : null, stores: asKid.rules.stores, monthly_cents: asKid.rules.monthly_cents, spent_cents: family.spent(asKid) };
          })()
        : null,
    };
  });
  app.post('/v1/me/family', async (req) => {
    json(req);
    const user = me(req);
    const { family: f, token } = family.add(user.id, { name: req.body?.name, consent: req.body?.consent });
    return { teen: family.view(f), link: joinUrl(req, token) };
  });
  app.post('/v1/me/family/leave', async (req) => {
    json(req);
    return family.leave(me(req).id);
  });
  app.post('/v1/me/family/:id/rules', async (req) => {
    json(req);
    return { teen: family.view(family.setRules(me(req).id, req.params.id, req.body || {})) };
  });
  app.post('/v1/me/family/:id/pause', async (req) => {
    json(req);
    return { teen: family.view(family.pause(me(req).id, req.params.id, Boolean(req.body?.on))) };
  });
  app.post('/v1/me/family/:id/link', async (req) => {
    json(req);
    return { link: joinUrl(req, family.relink(me(req).id, req.params.id)) };
  });
  app.post('/v1/me/family/:id/remove', async (req) => {
    json(req);
    return family.remove(me(req).id, req.params.id);
  });

  app.get('/family/join/:token', async (req, reply) => {
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    const f = family.preview(String(req.params.token || ''));
    const parent = f ? db.users.byId(f.parent_id) : null;
    const signedIn = Boolean(sessionUserId(db, req));
    return reply.code(f ? 200 : 404).type('text/html; charset=utf-8').send(joinPage({ f, parent: firstName(parent) || 'Your parent', signedIn, next: `/family/join/${encodeURIComponent(req.params.token)}` }));
  });
  app.post('/v1/family/join', async (req) => {
    json(req);
    const f = family.join(String(req.body?.token || ''), me(req).id);
    return { joined: true, parent: firstName(db.users.byId(f.parent_id)) || 'Your parent' };
  });

  // The parent's one tap, from the ask's pay page.
  app.post('/v1/carts/:token/family/approve', async (req) => {
    json(req);
    const user = me(req);
    const cart = spot.load(req.params.token);
    const f = cart.family ? family.byId(cart.family.id) : null;
    if (!f || f.parent_id !== user.id || f.removed_at) throw new CartError('Not found', 404);
    const card = fundingOf(db, user.id);
    if (!card) throw new CartError('Add a card in your account first, under AI & card', 409);
    const out = await spot.paySaved(cart.token, card, {
      present: true,
      how: { by: 'parent', how: 'approved_by_parent' },
      payer: { name: firstName(user), email: user.email || null },
    });
    spot.patch(cart.id, (c) => ({ ...c, family: { ...c.family, decision: 'approved' } }), 'family_approved');
    return { status: out.cart.status, ...(out.action ? { action: out.action } : {}) };
  });

  // For POST /v1/carts: a teen's ask, before it's made. Refuses what's only
  // for adults, and says whether the parent's card can pay it (Spot has to
  // be able to buy it itself for that).
  async function before(req, input) {
    const kidId = sessionUserId(db, req);
    const f = family.ofKid(kidId);
    if (!f) return null;
    const urls = [input?.merchant?.url ?? input?.merchant_url, ...(Array.isArray(input?.items) ? input.items.map((i) => i?.url) : [])].filter((u) => typeof u === 'string' && u);
    const blocked = teenBlocked(Array.isArray(input?.items) ? input.items : [], urls);
    if (blocked) throw new CartError(blocked, 422);
    // Paying for it themselves: the parent isn't involved.
    if (input?.for === 'self') return null;
    const card = fundingOf(db, f.parent_id);
    if (card && input.settle !== 'handoff' && spot.canOrder) {
      const merchant = { ...(input.merchant || {}), url: input.merchant?.url ?? input.merchant_url };
      const orderable = await Promise.resolve(spot.canOrder({ merchant, items: input.items || [], settle: 'card' })).catch(() => false);
      if (orderable) input.settle = 'card';
    }
    return { f, card, urls };
  }

  // For POST /v1/bundles: a teen's multi-store ask is never paid on its
  // own, but nothing in it can be only for adults.
  function screen(req, stores) {
    if (!Array.isArray(stores) || !family.ofKid(sessionUserId(db, req))) return;
    for (const st of stores) {
      const urls = [st?.merchant?.url, ...(Array.isArray(st?.items) ? st.items.map((i) => i?.url) : [])].filter((u) => typeof u === 'string' && u);
      const blocked = teenBlocked(Array.isArray(st?.items) ? st.items : [], urls);
      if (blocked) throw new CartError(blocked, 422);
    }
  }

  // After it's made: pay it from the parent's card inside the rules, or ping
  // the parent. → { state: 'paid' | 'asked', parent, reason? }
  async function after(req, cart, manageKey, ctx) {
    if (!ctx) return null;
    const { f, card, urls } = ctx;
    const parent = db.users.byId(f.parent_id);
    const kid = db.users.byId(f.kid_id);
    // Ship to the teen's saved address, else the parent's (same house).
    const ship = kid?.shipping || parent?.shipping;
    if (ship && !cart.requester?.shipping) {
      try {
        cart = spot.prepare(cart.token, manageKey, { ...ship, email: ship.email || kid?.email || parent?.email || undefined });
      } catch {
        // The teen fixes it on their page.
      }
    }
    const pName = firstName(parent) || 'Your parent';
    let d = cart.settle === 'card'
      ? decide(f, { cents: cart.cart_cents, storeUrls: urls, spent: family.spent(f), card: Boolean(card), parent: pName })
      : { auto: false, reason: `${cart.merchant.name} is paid on its own checkout`, kid: `${pName} pays ${cart.merchant.name} directly` };
    if (d.auto && !cart.requester?.shipping) d = { auto: false, reason: `${f.name} hasn’t added where it ships`, kid: 'add where it ships in your account so it can go through on its own' };
    spot.patch(cart.id, (c) => ({ ...c, family: { id: f.id, parent_id: f.parent_id, decision: d.auto ? 'auto' : 'asked', reason: d.reason || null } }), d.auto ? 'family_auto' : 'family_asked');
    if (d.auto) {
      try {
        const out = await spot.paySaved(cart.token, card, { present: false, how: { by: 'rules', how: 'paid_by_family_rules' }, payer: { name: firstName(parent), email: parent?.email || null } });
        if (['paid', 'card_issued'].includes(out.cart.status)) return { state: 'paid', parent: pName };
        // The bank wants the parent to check it: that needs them on the page.
        d = { auto: false, reason: 'Your bank wants you to confirm this one', kid: `${pName}’s card needs a tap this time` };
      } catch (err) {
        log.warn?.({ err: err.message, cart: cart.id }, 'family auto-pay failed');
        d = { auto: false, reason: `Your card didn’t go through on its own (${String(err.message).slice(0, 80)})`, kid: `${pName}’s card needs a tap this time` };
      }
      spot.patch(cart.id, (c) => ({ ...c, family: { ...c.family, decision: 'asked', reason: d.reason } }), 'family_asked');
    }
    spot.emit('family_ask', cart.id);
    return { state: 'asked', parent: pName, reason: d.kid || null };
  }

  // On the ask's pay page: can the person looking at it approve it in one tap?
  function approveBox(req, cart) {
    if (!cart.family || cart.status !== 'open' || cart.settle !== 'card') return null;
    const uid = sessionUserId(db, req);
    if (!uid || uid !== cart.family.parent_id) return null;
    const f = family.byId(cart.family.id);
    if (!f || f.removed_at) return null;
    const card = fundingOf(db, uid);
    return { card: card ? cardLabel(card) : null, teen: f.name, reason: cart.family.reason || null };
  }

  // For the AI API: a teen's own AI can't ask for what's only for adults either.
  function screenUser(userId, items = [], urls = []) {
    if (!userId || !family.ofKid(userId)) return;
    const blocked = teenBlocked(items, urls.filter((u) => typeof u === 'string' && u));
    if (blocked) throw new CartError(blocked, 422);
  }

  return { before, after, screen, screenUser, approveBox };
}

// The teen's join page.
function joinPage({ f, parent, signedIn, next }) {
  const body = !f
    ? `<h1>This link doesn’t work anymore</h1><p>Family links last ${JOIN_DAYS} days and work once. Ask your parent for a new one from their Spot account.</p>`
    : `<h1>${esc(parent)} added you to Spot 👋</h1>
<p>Find something you want, and Spot asks ${esc(parent)} to pay for it. Small things at stores ${esc(parent)} approved can go through on their own; anything else, ${esc(parent)} gets a one-tap Approve.</p>
<p class="muted">Spot is for teens 13 to 17 only with a parent or guardian. ${esc(parent)} sees what you ask for.</p>
${signedIn
  ? '<button class="btn" id="join">Join</button><p class="err" id="err"></p>'
  : `<a class="btn" href="/signin?next=${encodeURIComponent(next)}">Sign in to join</a><p class="muted">With your email, phone or Google. No password.</p>`}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Join your family on Spot</title>
<style>:root{--bg:#fbf6ee;--ink:#1b1712;--muted:#6f675c;--spot:#ff5a36}@media (prefers-color-scheme:dark){:root{--bg:#16130f;--ink:#f6efe4;--muted:#a99f92}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,sans-serif}main{max-width:520px;margin:0 auto;padding:56px 20px}
h1{font-size:32px;line-height:1.1;letter-spacing:-.02em}.muted{color:var(--muted);font-size:15px}.err{color:#c0392b}
.btn{display:inline-block;margin-top:14px;background:var(--spot);color:#fff;border:0;border-radius:999px;padding:14px 26px;font:700 17px system-ui;text-decoration:none;cursor:pointer}</style></head>
<body><main><a href="/" style="color:var(--spot);font-weight:800;text-decoration:none">Spot</a>${body}</main>
${f && signedIn ? `<script>document.getElementById('join').onclick=async(e)=>{e.target.disabled=true;const r=await fetch('/v1/family/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:${JSON.stringify(next.split('/').pop())}})});const j=await r.json().catch(()=>({}));if(r.ok){location.href='/new?family=1'}else{document.getElementById('err').textContent=j.error||'Something went wrong';e.target.disabled=false}}</script>` : ''}
</body></html>`;
}

// Early-access invites: the Spot team lets people from the signup list in,
// one personal link each (sent by email from /admin).
//
// Opening the link remembers that browser (an HttpOnly cookie holding the
// link's token) and lets it past the early-access gate (early.js). A link
// works on up to MAX_DEVICES browsers; after that, or on any other device,
// signing in with the invited email gets them in too. Withdrawing an
// invite turns off every link and cookie for that email at once. Only a
// hash of each token is stored.
import { createHash, randomBytes } from 'node:crypto';
import { provenEmail } from './staff.js';

export const INVITE_COOKIE = 'spot_invite';
export const MAX_DEVICES = 3;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const admitKey = (userId) => `invited:${userId}`;
export const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 200);
export const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export function createInvites(db) {
  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      email       TEXT PRIMARY KEY,
      invited_at  INTEGER NOT NULL,
      invited_by  TEXT,
      sent_at     INTEGER,
      sent        TEXT,
      opened_at   INTEGER,
      revoked_at  INTEGER
    );
    CREATE TABLE IF NOT EXISTS invite_links (
      hash   TEXT PRIMARY KEY,
      email  TEXT NOT NULL,
      at     INTEGER NOT NULL,
      uses   INTEGER NOT NULL DEFAULT 0
    );`);
  const q = {
    get: db.raw.prepare('SELECT * FROM invites WHERE email = ?'),
    list: db.raw.prepare('SELECT * FROM invites ORDER BY invited_at DESC'),
    upsert: db.raw.prepare(`INSERT INTO invites (email, invited_at, invited_by) VALUES (?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET invited_at = excluded.invited_at, invited_by = excluded.invited_by, revoked_at = NULL`),
    addLink: db.raw.prepare('INSERT INTO invite_links (hash, email, at) VALUES (?, ?, ?)'),
    link: db.raw.prepare('SELECT * FROM invite_links WHERE hash = ?'),
    use: db.raw.prepare('UPDATE invite_links SET uses = uses + 1 WHERE hash = ?'),
    sent: db.raw.prepare('UPDATE invites SET sent = ?, sent_at = ? WHERE email = ?'),
    opened: db.raw.prepare('UPDATE invites SET opened_at = COALESCE(opened_at, ?) WHERE email = ?'),
    revoke: db.raw.prepare('UPDATE invites SET revoked_at = ? WHERE email = ?'),
    // People on the list nobody has invited yet, first come first served.
    next: db.raw.prepare(`SELECT email, MIN(at) AS at FROM signups WHERE email NOT IN (SELECT email FROM invites)
      GROUP BY email ORDER BY at, email LIMIT ?`),
    waiting: db.raw.prepare('SELECT COUNT(DISTINCT email) AS n FROM signups WHERE email NOT IN (SELECT email FROM invites)'),
  };
  const live = (inv) => Boolean(inv && !inv.revoked_at);
  const accountEmail = (userId) => {
    const u = db.users.byId(userId);
    if (!u?.email || db.identities.providersOf(userId).includes('facebook')) return null;
    return normEmail(u.email);
  };
  const admit = (userId, email) => {
    if (userId && email && !db.state.get(admitKey(userId))) db.state.set(admitKey(userId), { email: normEmail(email), at: Date.now() });
  };

  return {
    get: (email) => q.get.get(normEmail(email)) || null,
    list: () => q.list.all(),
    nextUninvited: (n) => q.next.all(Math.max(1, Math.min(50, n | 0))).map((r) => r.email),
    waiting: () => q.waiting.get().n,
    // A new personal link for this email (a resend adds a link; older ones keep working).
    create(email, by = null) {
      const e = normEmail(email);
      const token = randomBytes(32).toString('base64url');
      q.upsert.run(e, Date.now(), by);
      q.addLink.run(sha(token), e, Date.now());
      return token;
    },
    sent: (email, status) => q.sent.run(status, Date.now(), normEmail(email)),
    revoke: (email) => q.revoke.run(Date.now(), normEmail(email)).changes > 0,
    // The link from the email, opened in a browser. `known` = this browser
    // already holds this link (re-opening it doesn't use up a device).
    open(token, { known = false } = {}) {
      const link = token ? q.link.get(sha(token)) : null;
      const inv = link && q.get.get(link.email);
      if (!live(inv)) return { ok: false, reason: 'invalid' };
      if (!known && link.uses >= MAX_DEVICES) return { ok: false, reason: 'used', email: inv.email };
      if (!known) q.use.run(link.hash);
      q.opened.run(Date.now(), inv.email);
      return { ok: true, email: inv.email };
    },
    // Is this browser (cookie) or this signed-in person let in?
    cookieOk(token) {
      const link = token ? q.link.get(sha(token)) : null;
      return Boolean(link) && live(q.get.get(link.email));
    },
    // The invited email behind this browser's link, when it still works.
    cookieEmail(token) {
      const link = token ? q.link.get(sha(token)) : null;
      return link && live(q.get.get(link.email)) ? link.email : null;
    },
    // Once in, the account stays in: on any device, however they sign in
    // (passkey, text, Google), until the invite is withdrawn.
    admit,
    // A browser with the team's preview link, signed in: that account is in too.
    admitPreview(userId) {
      if (userId && !db.state.get(admitKey(userId))) db.state.set(admitKey(userId), { via: 'preview', at: Date.now() });
    },
    userOk(userId) {
      if (!userId) return false;
      // The account's email: confirmed by Spot, or one that could only have
      // got there by a code, Google or joining accounts (a Facebook sign-up's
      // email was never checked, so it doesn't count).
      const email = provenEmail(db, userId) || accountEmail(userId);
      if (email && live(q.get.get(email))) {
        q.opened.run(Date.now(), email);
        admit(userId, email);
        return true;
      }
      const was = db.state.get(admitKey(userId));
      if (was?.via === 'preview') return true;
      return Boolean(was?.email) && live(q.get.get(was.email));
    },
  };
}

export const inviteCookieOf = (req) => (String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${INVITE_COOKIE}=([A-Za-z0-9_-]{43})`)) || [])[1] || null;

// "k•••@gmail.com", for telling someone which email an invite went to.
export const maskEmail = (e) => {
  const [u, d] = String(e).split('@');
  return `${u.slice(0, 1)}•••@${d || ''}`;
};

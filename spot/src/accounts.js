// Accounts: sign in with a code sent to your email (no passwords).
//
//   POST /v1/auth/start   { email }         → emails a 6-digit code (10 min, 5 tries)
//   POST /v1/auth/verify  { email, code }   → session cookie (30 days)
//   POST /v1/auth/logout
//   GET  /v1/me                             → profile, Spots, "ready for you", keys
//   POST /v1/me           { name, shipping, travelers }
//   POST /v1/me/claim     { links: [{ token, k }] }  Spots made before signing in
//   POST /v1/me/keys      { agent_name }    → an API key tied to this account
//   POST /v1/me/keys/:name/revoke
//
// Codes and sessions are stored only as SHA-256 hashes. The cookie is
// HttpOnly + SameSite=Lax, and every write needs a JSON body, so other sites
// can't act for a signed-in visitor.
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CartError } from './cart.js';
import { validateShipping } from './fulfill/index.js';
import { ownerCart } from './spot.js';

export const SESSION_COOKIE = 'spot_session';
const CODE_TTL = 10 * 60_000;
const SESSION_TTL = 30 * 86400_000;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function sessionUserId(db, req) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{43})`));
  return m ? db.sessions.userId(sha(m[1])) : null;
}

// The account for a verified email, made on first sign-in.
export function userForEmail(db, email) {
  let user = db.users.byEmail(email);
  if (!user) {
    db.users.create(randomUUID(), email);
    user = db.users.byEmail(email);
  }
  return user;
}

export function startSession(db, req, reply, urlFor, userId) {
  const token = randomBytes(32).toString('base64url');
  db.sessions.create(sha(token), userId, Date.now() + SESSION_TTL);
  const secure = urlFor(req, '').startsWith('https:') ? '; Secure' : '';
  reply.header('set-cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}${secure}`);
}

export function registerAccounts(app, { db, env, notifier, provider, urlFor, spot }) {
  const hits = new Map();
  const limit = (key, max, windowMs) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) throw new CartError('Too many tries. Wait a few minutes and try again.', 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  };
  const json = (req) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
  };
  const me = (req) => {
    const id = sessionUserId(db, req);
    const user = id && db.users.byId(id);
    if (!user) throw new CartError('Sign in first', 401);
    return user;
  };
  // In test mode with no email service, the code is shown on screen so the
  // flow can be tried. Never in Stripe mode.
  const showCode = () => provider.name === 'sandbox' && !env.RESEND_API_KEY;

  app.post('/v1/auth/start', async (req) => {
    json(req);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(email)) throw new CartError('That email looks wrong');
    limit(`ip:${req.ip}`, 20, 3600_000);
    limit(`email:${email}`, 5, 3600_000);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    db.codes.put(email, sha(`${email}:${code}`), Date.now() + CODE_TTL);
    const sent = showCode() ? 'shown' : await notifier.sendSignInCode(email, code);
    if (sent !== 'sent' && sent !== 'shown') throw new CartError('We couldn’t send the email just now. Try again in a minute.', 503);
    return { sent: sent === 'sent' ? 'email' : 'screen', ...(sent === 'shown' ? { code } : {}) };
  });

  app.post('/v1/auth/verify', async (req, reply) => {
    json(req);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    limit(`verify:${req.ip}`, 30, 3600_000);
    const row = db.codes.get(email);
    const wrong = () => new CartError('That code didn’t work. Check it, or send a new one.', 401);
    if (!row || row.expires_at < Date.now() || row.attempts >= 5) throw wrong();
    db.codes.attempt(email);
    const a = Buffer.from(sha(`${email}:${code}`));
    const b = Buffer.from(row.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw wrong();
    db.codes.remove(email);

    const user = userForEmail(db, email);
    startSession(db, req, reply, urlFor, user.id);
    return { user: profile(user) };
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([A-Za-z0-9_-]{43})`));
    if (m) db.sessions.remove(sha(m[1]));
    reply.header('set-cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    return { ok: true };
  });

  app.get('/v1/me', async (req, reply) => {
    const user = me(req);
    reply.header('cache-control', 'no-store');
    const carts = db.users.carts(user.id, 100).map((c) => ({ ...ownerCart(c), created_at: c.created_at, manage_url: urlFor(req, `/c/${c.token}/manage`) }));
    return {
      user: profile(user),
      ready: carts.filter((c) => c.for === 'self' && c.status === 'open'),
      carts,
      keys: db.users.keys(user.id),
      mcp_url: urlFor(req, '/mcp'),
    };
  });

  app.post('/v1/me', async (req) => {
    json(req);
    const user = me(req);
    const b = req.body || {};
    const next = { name: user.name || null, shipping: user.shipping || null, travelers: user.travelers || [] };
    if (b.name !== undefined) next.name = String(b.name || '').trim().slice(0, 60) || null;
    if (b.shipping !== undefined) next.shipping = b.shipping ? validateShipping({ email: user.email, ...b.shipping }) : null;
    if (b.travelers !== undefined) next.travelers = cleanTravelers(b.travelers);
    db.users.save(user.id, next);
    return { user: profile(db.users.byId(user.id)) };
  });

  app.post('/v1/me/claim', async (req) => {
    json(req);
    const user = me(req);
    const links = Array.isArray(req.body?.links) ? req.body.links.slice(0, 50) : [];
    let claimed = 0;
    for (const l of links) {
      try {
        spot.claim(String(l.token || ''), String(l.k || ''), user.id);
        claimed++;
      } catch {
        // Bad key, expired, or someone else's: skip it.
      }
    }
    return { claimed };
  });

  app.post('/v1/me/keys', async (req, reply) => {
    json(req);
    const user = me(req);
    limit(`keys:${user.id}`, 10, 86400_000);
    const slug = String(req.body?.agent_name || 'my-ai').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'my-ai';
    const name = `${slug}-${randomBytes(3).toString('hex')}`;
    const key = `spot_${randomBytes(24).toString('base64url')}`;
    db.addKey(sha(key), name, user.email, user.id);
    reply.code(201);
    return { api_key: key, name, mcp_url: urlFor(req, '/mcp'), keys: db.users.keys(user.id) };
  });

  app.post('/v1/me/keys/:name/revoke', async (req) => {
    json(req);
    const user = me(req);
    if (!db.users.revokeKey(user.id, req.params.name)) throw new CartError('No key with that name', 404);
    return { keys: db.users.keys(user.id) };
  });

  return { userIdOf: (req) => sessionUserId(db, req) };
}

function profile(u) {
  return { email: u.email, name: u.name || null, shipping: u.shipping || null, travelers: u.travelers || [] };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function cleanTravelers(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 9).map((t) => {
    const s = (v, n) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, n) : '');
    const out = { given_name: s(t?.given_name, 40), family_name: s(t?.family_name, 40), born_on: DAY.test(t?.born_on || '') ? t.born_on : '', gender: t?.gender === 'm' || t?.gender === 'f' ? t.gender : '' };
    if (!out.given_name || !out.family_name) throw new CartError('Each saved traveler needs a first and last name');
    return out;
  });
}

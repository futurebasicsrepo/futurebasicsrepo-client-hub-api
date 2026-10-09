// Accounts: sign in with a code sent to your email (no passwords).
//
//   POST /v1/auth/start   { email }         → emails a 6-digit code (10 min, 5 tries)
//                         { phone, sms_consent: true } → texts it (the box ticked)
//   POST /v1/auth/verify  { email, code }   → session cookie (30 days)
//   POST /v1/auth/logout
//   GET  /v1/me                             → profile, Spots, "ready for you", keys
//   POST /v1/me           { name, shipping, travelers, venmo, cashtag }
//   POST /v1/me/claim     { links: [{ token, k }] }  Spots made before signing in
//   POST /v1/me/keys      { agent_name }    → an API key tied to this account
//   POST /v1/me/keys/:name/revoke
//   POST /v1/me/keys/:name/rules { max_order_cents, monthly_cents, stores, approver, pay }
//   POST /v1/me/approver  { email, name }   → they confirm by email (POST /v1/approver/confirm)
//   POST /v1/me/approver/remove
//   POST /v1/me/link/start  { email } | { phone }         → code to that address
//   POST /v1/me/link/verify { email | phone, code }       → it's now on this account
//
// Linking an email or phone that already has its own Spot account merges
// that account into this one (the code proves you own both).
//
// Codes and sessions are stored only as SHA-256 hashes. The cookie is
// HttpOnly + SameSite=Lax, and every write needs a JSON body, so other sites
// can't act for a signed-in visitor.
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { CartError, handleOk } from './cart.js';
import { validateShipping } from './fulfill/index.js';
import { ownerCart } from './spot.js';
import { emailLayout, normalizePhone } from './notify.js';
import { approverOf, monthStart, normalizeRules } from './rules.js';
import { fundingOf, fundingView } from './funding.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

// Text-message sign-in: the account is found by its phone identity; a new
// one starts without an email (added later, when a receipt needs it).
export function userForPhone(db, phone) {
  let id = db.identities.userId('phone', phone);
  if (!id) {
    id = randomUUID();
    db.users.create(id, null);
    db.users.save(id, { phone });
    db.identities.add('phone', phone, id);
  }
  return db.users.byId(id);
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

  // Codes are stored under `key` as sha256(key:code). Five tries, then gone.
  const newCode = (key) => {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    db.codes.put(key, sha(`${key}:${code}`), Date.now() + CODE_TTL);
    return code;
  };
  const checkCode = (key, code) => {
    const row = db.codes.get(key);
    const wrong = () => new CartError('That code didn’t work. Check it, or send a new one.', 401);
    if (!row || row.expires_at < Date.now() || row.attempts >= 5) throw wrong();
    db.codes.attempt(key);
    const a = Buffer.from(sha(`${key}:${code}`));
    const b = Buffer.from(row.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw wrong();
    db.codes.remove(key);
  };
  // Where a code goes: { phone } or { email }, checked and normalized.
  const address = (body) => {
    if (body?.phone !== undefined) {
      const phone = normalizePhone(body.phone);
      if (!phone) throw new CartError('That number looks wrong. Include the area code.');
      return { phone };
    }
    const email = String(body?.email || '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(email)) throw new CartError('That email looks wrong');
    return { email };
  };

  // Texts need the person's yes: the unticked "I agree to receive texts"
  // box next to every phone field. Kept with the number, as the carriers'
  // record of consent.
  const smsConsent = (req, phone, source) => {
    if (req.body?.sms_consent !== true) throw new CartError('Tick the box to agree to texts from Spot, or use email instead.');
    db.state.set(`sms_consent:${phone}`, { at: Date.now(), ip: req.ip, source });
  };

  const smsReady = () => Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM);

  app.post('/v1/auth/start', async (req) => {
    json(req);
    if (req.body?.phone !== undefined) {
      const phone = normalizePhone(req.body.phone);
      if (!phone) throw new CartError('That number looks wrong. Include the area code.');
      smsConsent(req, phone, 'signin');
      limit(`ip:${req.ip}`, 20, 3600_000);
      limit(`phone:${phone}`, 5, 3600_000);
      if (db.optouts.has(phone)) throw new CartError('This number replied STOP to Spot texts. Text START to our number, or sign in with email.', 409);
      const code = newCode(phone);
      if (provider.name === 'sandbox' && !smsReady()) return { sent: 'screen', code };
      const sent = await notifier.sendSignInText(phone, code, new URL(urlFor(req, '/')).hostname);
      if (sent !== 'sent') throw new CartError('We couldn’t text that number just now. Try again, or use email.', 503);
      return { sent: 'text' };
    }
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(email)) throw new CartError('That email looks wrong');
    limit(`ip:${req.ip}`, 20, 3600_000);
    limit(`email:${email}`, 5, 3600_000);
    const code = newCode(email);
    const sent = showCode() ? 'shown' : await notifier.sendSignInCode(email, code);
    if (sent !== 'sent' && sent !== 'shown') throw new CartError('We couldn’t send the email just now. Try again in a minute.', 503);
    return { sent: sent === 'sent' ? 'email' : 'screen', ...(sent === 'shown' ? { code } : {}) };
  });

  app.post('/v1/auth/verify', async (req, reply) => {
    json(req);
    const phone = req.body?.phone !== undefined ? normalizePhone(req.body.phone) : null;
    const email = phone || String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').replace(/\D/g, '');
    limit(`verify:${req.ip}`, 30, 3600_000);
    checkCode(email, code);

    const user = phone ? userForPhone(db, phone) : userForEmail(db, email);
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
      keys: keysOf(user.id),
      approver: approverView(user.id),
      funding: fundingView(db, user.id),
      passkeys: db.passkeys.ofUser(user.id),
      linked: db.identities.providersOf(user.id).filter((p) => p !== 'phone'),
      mcp_url: urlFor(req, '/mcp'),
    };
  });

  app.post('/v1/me', async (req) => {
    json(req);
    const user = me(req);
    const b = req.body || {};
    const next = { phone: user.phone || null, name: user.name || null, shipping: user.shipping || null, travelers: user.travelers || [], venmo: user.venmo || null, cashtag: user.cashtag || null };
    if (b.name !== undefined) next.name = String(b.name || '').trim().slice(0, 60) || null;
    if (b.shipping !== undefined) next.shipping = b.shipping ? validateShipping({ ...b.shipping, email: b.shipping.email || user.email || '' }) : null;
    if (b.travelers !== undefined) next.travelers = cleanTravelers(b.travelers);
    // Where Spot sends money for stores it can't buy from (Amazon).
    for (const [k, prefix, what] of [['venmo', '@', 'Venmo handle'], ['cashtag', '$', 'Cash App $cashtag']]) {
      if (b[k] === undefined) continue;
      const h = String(b[k] || '').trim().replace(prefix, '');
      if (h && !handleOk(h)) throw new CartError(`That ${what} looks wrong`);
      next[k] = h || null;
    }
    db.users.save(user.id, next);
    return { user: profile(db.users.byId(user.id)) };
  });

  // Add (or change) this account's email or phone. The code is bound to
  // this account, so it can't be used to sign in or to link elsewhere.
  app.post('/v1/me/link/start', async (req) => {
    json(req);
    const user = me(req);
    const to = address(req.body);
    const value = to.phone || to.email;
    if (value === user.email || value === user.phone) throw new CartError(`That’s already on your account`, 409);
    limit(`ip:${req.ip}`, 20, 3600_000);
    limit(`link:${user.id}`, 10, 3600_000);
    limit(`${to.phone ? 'phone' : 'email'}:${value}`, 5, 3600_000);
    if (to.phone && db.optouts.has(to.phone)) throw new CartError('This number replied STOP to Spot texts. Text START to our number first.', 409);
    if (to.phone) smsConsent(req, to.phone, 'account');
    const code = newCode(`link:${user.id}:${value}`);
    if (to.phone) {
      if (provider.name === 'sandbox' && !smsReady()) return { sent: 'screen', code };
      const sent = await notifier.sendSignInText(to.phone, code, new URL(urlFor(req, '/')).hostname);
      if (sent !== 'sent') throw new CartError('We couldn’t text that number just now. Try again in a minute.', 503);
      return { sent: 'text' };
    }
    const sent = showCode() ? 'shown' : await notifier.sendSignInCode(to.email, code);
    if (sent !== 'sent' && sent !== 'shown') throw new CartError('We couldn’t send the email just now. Try again in a minute.', 503);
    return { sent: sent === 'sent' ? 'email' : 'screen', ...(sent === 'shown' ? { code } : {}) };
  });

  app.post('/v1/me/link/verify', async (req) => {
    json(req);
    const user = me(req);
    const to = address(req.body);
    const value = to.phone || to.email;
    limit(`verify:${req.ip}`, 30, 3600_000);
    checkCode(`link:${user.id}:${value}`, String(req.body?.code || '').replace(/\D/g, ''));

    // Someone already signs in with it: that's you too, so join the accounts.
    const other = to.phone ? db.identities.userId('phone', to.phone) : db.users.byEmail(to.email)?.id;
    let merged = false;
    if (other && other !== user.id) {
      db.users.merge(other, user.id);
      merged = true;
    }
    const now = db.users.byId(user.id);
    if (to.email) {
      if (now.email !== to.email) db.users.setEmail(user.id, to.email);
    } else {
      // One phone per account: the old number stops signing you in.
      for (const i of db.identities.ofUser(user.id)) if (i.provider === 'phone' && i.subject !== to.phone) db.identities.remove('phone', i.subject);
      if (!db.identities.userId('phone', to.phone)) db.identities.add('phone', to.phone, user.id);
      db.users.save(user.id, { phone: to.phone, name: now.name || null, shipping: now.shipping || null, travelers: now.travelers || [], venmo: now.venmo || null, cashtag: now.cashtag || null });
    }
    return { user: profile(db.users.byId(user.id)), merged };
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
    db.addKey(sha(key), name, user.email || user.phone || 'unknown', user.id);
    reply.code(201);
    return { api_key: key, name, mcp_url: urlFor(req, '/mcp'), keys: keysOf(user.id) };
  });

  app.post('/v1/me/keys/:name/revoke', async (req) => {
    json(req);
    const user = me(req);
    if (!db.users.revokeKey(user.id, req.params.name)) throw new CartError('No key with that name', 404);
    db.agentEvents.add(`key:${req.params.name}`, user.id, 'disconnected', null);
    return { keys: keysOf(user.id) };
  });

  // Spending rules for one of this account's AI keys (see rules.js).
  app.post('/v1/me/keys/:name/rules', async (req) => {
    json(req);
    const user = me(req);
    const rules = normalizeRules(req.body || {});
    if (rules && rules.approver !== 'never' && !approverOf(db, user.id)) throw new CartError('Add an approver first, and have them confirm by email', 409);
    const card = fundingOf(db, user.id);
    if (rules && rules.pay !== 'link' && !card) throw new CartError('Add your card first, under “Your AI’s card”', 409);
    if (rules?.pay === 'auto' && !card.auto_ok_at) throw new CartError('Turn on “Let my AI pay without asking” under “Your AI’s card” first', 409);
    if (!db.keyRules.set(user.id, req.params.name, rules)) throw new CartError('No key with that name', 404);
    db.agentEvents.add(`key:${req.params.name}`, user.id, 'rules_changed', { rules });
    return { keys: keysOf(user.id) };
  });

  // The approver: someone who pays for (or says no to) what this account's
  // AI asks for when the rules say so. They confirm by email first.
  app.post('/v1/me/approver', async (req) => {
    json(req);
    const user = me(req);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 200);
    if (!EMAIL.test(email)) throw new CartError('That email looks wrong');
    if (email === user.email) throw new CartError('Your approver has to be someone else', 400);
    const name = String(req.body?.name || '').trim().slice(0, 60) || null;
    limit(`approver:${user.id}`, 5, 86400_000);
    const token = randomBytes(24).toString('base64url');
    db.state.set(`approver:${user.id}`, { email, name, token_hash: sha(token), asked_at: Date.now(), confirmed_at: null });
    const who = user.name || user.email || 'Someone';
    const link = urlFor(req, `/approver/confirm?u=${encodeURIComponent(user.id)}&t=${token}`);
    const out = await notifier.send({ email }, {
      subject: `${who} wants you to approve what their AI buys`,
      text: `${who} named you as the approver for purchases their AI assistant asks for on Spot. You'd get an email to pay for or turn down each one. Nothing is charged unless you pay. Agree here: ${link}`,
      html: emailLayout({
        preheader: 'Nothing is charged unless you pay',
        title: `Be ${who}’s approver?`,
        lines: [`${esc(who)} named you as the approver for purchases their AI assistant asks for on Spot.`, 'When their rules say so, you get an email with exactly what the AI picked. You pay for it, or turn it down. Nothing is charged unless you pay, and every yes is signed.'],
        cta: { label: 'Yes, I’ll approve →', url: link },
        note: 'Not expecting this? Ignore it; nothing happens.',
        base: env.PUBLIC_URL,
      }),
    });
    return { approver: approverView(user.id), sent: out.email || 'not_sent', ...(showCode() ? { confirm_link: link } : {}) };
  });
  app.post('/v1/me/approver/remove', async (req) => {
    json(req);
    const user = me(req);
    db.state.set(`approver:${user.id}`, null);
    // Keys that routed to the approver fall back to refusing.
    for (const k of db.users.keys(user.id)) if (k.rules && k.rules.approver !== 'never') db.keyRules.set(user.id, k.name, { ...k.rules, approver: 'never' });
    return { approver: null, keys: keysOf(user.id) };
  });
  // The approver's yes (from the button on /approver/confirm, not the GET,
  // so email link scanners can't agree for them).
  app.post('/v1/approver/confirm', async (req) => {
    json(req);
    limit(`approver-confirm:${req.ip}`, 20, 3600_000);
    const uid = String(req.body?.u || '');
    const a = db.state.get(`approver:${uid}`);
    const t = String(req.body?.t || '');
    if (!a || !t || a.token_hash !== sha(t)) throw new CartError('This link has expired or was replaced', 404);
    if (!a.confirmed_at) db.state.set(`approver:${uid}`, { ...a, confirmed_at: Date.now() });
    const u = db.users.byId(uid);
    return { ok: true, for: u?.name || u?.email || 'them' };
  });

  function approverView(userId) {
    const a = db.state.get(`approver:${userId}`);
    return a ? { email: a.email, name: a.name, confirmed: Boolean(a.confirmed_at) } : null;
  }
  // Keys, with their rules, this month's asks and recent activity.
  function keysOf(userId) {
    const since = monthStart();
    return db.users.keys(userId).map((k) => ({ ...k, month_cents: db.agentMonthCents(`key:${k.name}`, since), activity: db.agentEvents.recent(`key:${k.name}`, 8) }));
  }

  return { userIdOf: (req) => sessionUserId(db, req) };
}

function profile(u) {
  return { email: u.email || null, phone: u.phone || null, name: u.name || null, shipping: u.shipping || null, travelers: u.travelers || [], venmo: u.venmo || null, cashtag: u.cashtag || null };
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

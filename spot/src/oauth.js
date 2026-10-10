// "Continue with Google" / "Continue with Facebook" (Meta).
//
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET      Google Cloud → APIs & Services → Credentials
//   FACEBOOK_APP_ID / FACEBOOK_APP_SECRET        developers.facebook.com → your app → Facebook Login
//   Redirect URIs to register: <PUBLIC_URL>/auth/google/callback and /auth/facebook/callback
//
// Standard authorization-code flow. The state (plus Google's PKCE verifier and
// where to go afterwards) rides in a short-lived HMAC-signed cookie, so a
// callback only completes in the browser that started it. Accounts are
// matched first by the provider's user id, then by a verified email, so
// signing in with Google, Facebook or an email code all reach the same
// account when the email matches.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { startSession, userForEmail } from './accounts.js';
import { proveEmail } from './staff.js';

const FLOW_COOKIE = 'spot_oauth';
const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function oauthProviders(env = process.env) {
  const v = env.FACEBOOK_GRAPH_VERSION || 'v21.0';
  const out = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    out.google = {
      name: 'Google',
      id: env.GOOGLE_CLIENT_ID,
      secret: env.GOOGLE_CLIENT_SECRET,
      pkce: true,
      authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
      scope: 'openid email profile',
      extra: { prompt: 'select_account' },
      async profile(fetchImpl, code, redirect, verifier) {
        const tok = await json(fetchImpl('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
          body: new URLSearchParams({ code, client_id: this.id, client_secret: this.secret, redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier }),
        }));
        const me = await json(fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tok.access_token}` } }));
        return { subject: String(me.sub), email: me.email_verified === true || me.email_verified === 'true' ? me.email : null, name: me.name || null };
      },
    };
  }
  if (env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET) {
    out.facebook = {
      name: 'Facebook',
      id: env.FACEBOOK_APP_ID,
      secret: env.FACEBOOK_APP_SECRET,
      pkce: false,
      authorize: `https://www.facebook.com/${v}/dialog/oauth`,
      scope: 'email,public_profile',
      extra: {},
      async profile(fetchImpl, code, redirect) {
        const q = new URLSearchParams({ client_id: this.id, client_secret: this.secret, redirect_uri: redirect, code });
        const tok = await json(fetchImpl(`https://graph.facebook.com/${v}/oauth/access_token?${q}`, { headers: { accept: 'application/json' } }));
        const proof = createHmac('sha256', this.secret).update(tok.access_token).digest('hex');
        const me = await json(fetchImpl(`https://graph.facebook.com/${v}/me?${new URLSearchParams({ fields: 'id,name,email', access_token: tok.access_token, appsecret_proof: proof })}`, { headers: { accept: 'application/json' } }));
        // Facebook only returns an email it has confirmed.
        return { subject: String(me.id), email: me.email || null, name: me.name || null };
      },
    };
  }
  return out;
}

async function json(p) {
  const res = await p;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error_description || body.error?.message || `HTTP ${res.status}`);
  return body;
}

// Only a path on this site. Browsers drop tabs and newlines and read "\" as
// "/", so "/\tevil.com" or "/\\evil.com" would leave it: resolve it and check.
const safeNext = (n) => {
  if (typeof n !== 'string' || !n.startsWith('/') || /[\u0000-\u001f\\]/.test(n)) return '/account';
  try {
    const u = new URL(n, 'https://spot.invalid');
    return u.origin === 'https://spot.invalid' ? `${u.pathname}${u.search}${u.hash}`.slice(0, 300) : '/account';
  } catch {
    return '/account';
  }
};

export function registerOAuth(app, { db, env, urlFor, fetchImpl = fetch, log = console }) {
  const providers = oauthProviders(env);
  // Signs the short-lived flow cookie. Without SPOT_SESSION_SECRET a random
  // one is used, which only means a restart cancels sign-ins in progress.
  const secret = env.SPOT_SESSION_SECRET || randomBytes(32).toString('hex');
  const sign = (s) => createHmac('sha256', secret).update(s).digest('base64url');
  const secure = (req) => (urlFor(req, '').startsWith('https:') ? '; Secure' : '');
  const redirectUri = (req, p) => urlFor(req, `/auth/${p}/callback`);

  function readFlow(req) {
    const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${FLOW_COOKIE}=([A-Za-z0-9_-]+)\\.([A-Za-z0-9_-]+)`));
    if (!m) return null;
    const want = Buffer.from(sign(m[1]));
    const got = Buffer.from(m[2]);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
      const flow = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      return flow.exp > Date.now() ? flow : null;
    } catch {
      return null;
    }
  }

  app.get('/auth/:provider/start', async (req, reply) => {
    const p = providers[req.params.provider];
    if (!p) return reply.redirect('/signin?error=unavailable');
    const state = b64(randomBytes(24));
    const verifier = p.pkce ? b64(randomBytes(32)) : null;
    const flow = { p: req.params.provider, state, verifier, next: safeNext(req.query.next), exp: Date.now() + 10 * 60_000 };
    const payload = b64(JSON.stringify(flow));
    reply.header('set-cookie', `${FLOW_COOKIE}=${payload}.${sign(payload)}; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure(req)}`);
    const q = new URLSearchParams({ client_id: p.id, redirect_uri: redirectUri(req, req.params.provider), response_type: 'code', scope: p.scope, state, ...p.extra });
    if (verifier) {
      q.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
      q.set('code_challenge_method', 'S256');
    }
    return reply.redirect(`${p.authorize}?${q}`);
  });

  app.get('/auth/:provider/callback', async (req, reply) => {
    const name = req.params.provider;
    const p = providers[name];
    const flow = readFlow(req);
    const clear = `${FLOW_COOKIE}=; Path=/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure(req)}`;
    const fail = (why) => reply.header('set-cookie', clear).redirect(`/signin?error=${why}&next=${encodeURIComponent(flow?.next || '/account')}`);
    if (!p) return fail('unavailable');
    if (req.query.error) return fail('cancelled');
    if (!flow || flow.p !== name || typeof req.query.state !== 'string' || req.query.state !== flow.state || typeof req.query.code !== 'string') return fail('expired');

    let who;
    try {
      who = await p.profile(fetchImpl, req.query.code, redirectUri(req, name), flow.verifier);
    } catch (err) {
      log.warn?.({ err, provider: name }, 'oauth exchange failed');
      return fail('failed');
    }

    let userId = db.identities.userId(name, who.subject);
    if (!userId) {
      if (!who.email) return fail('no_email');
      userId = userForEmail(db, who.email.trim().toLowerCase()).id;
      db.identities.add(name, who.subject, userId);
    }
    const user = db.users.byId(userId);
    if (!user) return fail('failed');
    // Google checked this address; Facebook's email doesn't count for staff access.
    if (name === 'google' && who.email && user.email === who.email.trim().toLowerCase()) proveEmail(db, userId, user.email);
    if (!user.name && who.name) {
      const { id, email, created_at, ...doc } = user;
      db.users.save(userId, { ...doc, name: who.name.slice(0, 60) });
    }
    startSession(db, req, reply, urlFor, userId);
    // Two Set-Cookie headers: the session, and clearing the flow cookie.
    reply.header('set-cookie', [reply.getHeader('set-cookie'), clear].flat());
    return reply.redirect(flow.next);
  });

  return { available: Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, v.name])) };
}

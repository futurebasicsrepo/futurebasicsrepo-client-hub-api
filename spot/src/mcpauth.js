// "Add Spot" in Claude or ChatGPT: OAuth sign-in for the MCP server, so
// nobody copies a key. Spot is the authorization server for its own /mcp.
//
//   GET  /.well-known/oauth-protected-resource[/mcp]   → where to sign in (RFC 9728)
//   GET  /.well-known/oauth-authorization-server       → the endpoints below (RFC 8414)
//   POST /oauth/register   → the AI app registers itself (RFC 7591, dynamic)
//   GET  /oauth/authorize  → sign in, then "Claude wants to shop with Spot"
//   POST /oauth/authorize  → Allow / Cancel from that page (JSON, signed in)
//   POST /oauth/token      → code + PKCE → tokens; refresh_token → new tokens
//   POST /oauth/revoke
//
// Each Allow makes one of the account's AI keys (named after the app), so its
// rules, activity, kill switch and Disconnect work like any pasted key. The
// app gets a 1-hour access token and a refresh token that rotates on every
// use; disconnecting the key ends both. Only SHA-256 hashes are stored.
// Authorization codes last 10 minutes, work once, and need PKCE (S256).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { sessionUserId } from './accounts.js';
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';
import { CLIENT_ASSERTION, JWT_BEARER, PAP_SCOPES, PapError, createPap, domainOf, isUrlClient } from './pap.js';
import { normalizeRules } from './rules.js';

const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const b64sha = (s) => createHash('sha256').update(String(s)).digest('base64url');
const token = (prefix) => `${prefix}${randomBytes(32).toString('base64url')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CODE_TTL = 10 * 60_000;
const ACCESS_TTL = 3600;
const REFRESH_TTL = 90 * 86400_000;
const SCOPE = 'spot';
const SCOPES = [SCOPE, ...PAP_SCOPES];

// Apps people will recognize by where they send you back.
const KNOWN = [
  { name: 'Claude', hosts: ['claude.ai', 'claude.com'] },
  { name: 'ChatGPT', hosts: ['chatgpt.com', 'chat.openai.com', 'openai.com'] },
];
const hostOf = (u) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};
export function appFor(client, redirectUri) {
  const host = hostOf(redirectUri);
  const known = KNOWN.find((k) => k.hosts.some((h) => host === h || host.endsWith(`.${h}`)));
  if (known) return { name: known.name, verified: true, host };
  const name = String(client?.client_name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'An AI app';
  return { name, verified: false, host };
}

// https anywhere, or http only back to this computer (desktop apps).
function okRedirect(u) {
  let url;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

// An access token from this flow → the AI key it stands for, or null.
export function oauthKey(db, bearer) {
  if (!String(bearer).startsWith('spot_at_')) return null;
  const t = db.state.get(`oauth_at:${sha(bearer)}`);
  if (!t || t.exp < Date.now()) return null;
  const row = db.keyByName(t.key);
  return row && !row.revoked ? row : null;
}

export function registerMcpAuth(app, { db, urlFor, papFetch }) {
  const pap = createPap({ db, ...(papFetch ? { fetchJson: papFetch } : {}) });
  const origin = (req) => urlFor(req, '');
  const resource = (req) => urlFor(req, '/mcp');
  const fail = (reply, status, error, error_description) => reply.code(status).header('cache-control', 'no-store').send({ error, error_description });
  const cors = (reply) => reply.header('access-control-allow-origin', '*').header('access-control-allow-headers', 'authorization, content-type, mcp-protocol-version').header('access-control-allow-methods', 'GET, POST, OPTIONS');

  const hits = new Map();
  const limited = (key, max, windowMs) => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.until < now) {
      hits.set(key, { n: 1, until: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
      return false;
    }
    return ++h.n > max;
  };

  // Discovery. The path-suffixed forms are what newer clients ask for first.
  const prm = (req) => ({ resource: resource(req), authorization_servers: [origin(req)], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_name: 'Spot', resource_documentation: urlFor(req, '/integrations#mcp') });
  const asm = (req) => ({
    issuer: origin(req),
    authorization_endpoint: urlFor(req, '/oauth/authorize'),
    token_endpoint: urlFor(req, '/oauth/token'),
    registration_endpoint: urlFor(req, '/oauth/register'),
    revocation_endpoint: urlFor(req, '/oauth/revoke'),
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', JWT_BEARER],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt'],
    token_endpoint_auth_signing_alg_values_supported: ['ES256', 'EdDSA', 'RS256'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic', 'private_key_jwt'],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
    client_id_metadata_document_supported: true,
    // PAP: the domains this issuer signs people in for.
    poppy_domains: [domainOf(origin(req))],
    service_documentation: urlFor(req, '/integrations#mcp'),
  });
  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    app.get(p, async (req, reply) => cors(reply).header('cache-control', 'public, max-age=300').send(prm(req)));
  }
  for (const p of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/mcp', '/.well-known/openid-configuration']) {
    app.get(p, async (req, reply) => cors(reply).header('cache-control', 'public, max-age=300').send(asm(req)));
  }
  for (const p of ['/oauth/register', '/oauth/token', '/oauth/revoke']) app.options(p, async (req, reply) => cors(reply).code(204).send());

  // The header that starts sign-in when /mcp has no usable token.
  const challenge = (req) => `Bearer resource_metadata="${urlFor(req, '/.well-known/oauth-protected-resource')}", scope="${SCOPE}"`;

  // ── Registration ──────────────────────────────────────────────────────────
  app.post('/oauth/register', async (req, reply) => {
    cors(reply);
    if (limited(`reg:${req.ip}`, 20, 3600_000)) return fail(reply, 429, 'invalid_client_metadata', 'Too many registrations, try again later');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
    if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) return fail(reply, 400, 'invalid_redirect_uri', 'redirect_uris must be https (or http://localhost)');
    const method = b.token_endpoint_auth_method || 'none';
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) return fail(reply, 400, 'invalid_client_metadata', 'Unsupported token_endpoint_auth_method');
    const grants = b.grant_types || ['authorization_code', 'refresh_token'];
    if (!Array.isArray(grants) || grants.some((g) => !['authorization_code', 'refresh_token'].includes(g))) return fail(reply, 400, 'invalid_client_metadata', 'Only authorization_code and refresh_token are supported');
    const id = `spc_${randomBytes(16).toString('base64url')}`;
    const secret = method === 'none' ? null : token('spcs_');
    const client = {
      client_name: String(b.client_name || '').slice(0, 100) || null,
      client_uri: typeof b.client_uri === 'string' ? b.client_uri.slice(0, 300) : null,
      redirect_uris: uris,
      token_endpoint_auth_method: method,
      grant_types: grants,
      secret_hash: secret ? sha(secret) : null,
      created_at: Date.now(),
    };
    db.state.set(`oauth_client:${id}`, client);
    // Leave out empty fields: strict clients reject nulls.
    const { secret_hash, created_at, ...rest } = client;
    const pub = Object.fromEntries(Object.entries(rest).filter(([, v]) => v != null));
    reply.code(201).header('cache-control', 'no-store');
    return { client_id: id, client_id_issued_at: Math.floor(created_at / 1000), ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}), ...pub, response_types: ['code'], scope: SCOPE };
  });

  const clientOf = (id) => (typeof id === 'string' && id.startsWith('spc_') ? db.state.get(`oauth_client:${id}`) : null);
  // A registered app, or a PAP agent known by its metadata URL.
  const resolveClient = async (id) => (isUrlClient(id) ? pap.client(id).catch(() => null) : clientOf(id));

  // Everything about an authorize request that must hold before we show the
  // page or redirect anywhere. A bad client or redirect is shown, never followed.
  function checkAuthorize(q, req, client) {
    if (!client) return { page: isUrlClient(q.client_id) ? 'Spot couldn’t check this agent’s details. Try again in a minute.' : 'This app isn’t registered with Spot. Remove Spot from the app and add it again.' };
    const redirectUri = String(q.redirect_uri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : ''));
    if (!client.redirect_uris.includes(redirectUri)) return { page: 'This sign-in link doesn’t match the app that registered. Remove Spot from the app and add it again.' };
    const back = (error, error_description) => {
      const u = new URL(redirectUri);
      u.searchParams.set('error', error);
      if (error_description) u.searchParams.set('error_description', error_description);
      if (q.state) u.searchParams.set('state', String(q.state));
      u.searchParams.set('iss', origin(req));
      return { redirect: u.toString() };
    };
    if (q.response_type !== 'code') return back('unsupported_response_type', 'Only response_type=code');
    if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9._~-]{43,128}$/.test(String(q.code_challenge || ''))) return back('invalid_request', 'PKCE with S256 is required');
    if (q.scope && !String(q.scope).split(/\s+/).every((s) => SCOPES.includes(s) || s === '')) return back('invalid_scope', `Only ${SCOPES.join(', ')}`);
    if (q.resource && ![resource(req), origin(req), `${origin(req)}/`].includes(String(q.resource))) return back('invalid_target', 'Unknown resource');
    return { client, redirectUri, back };
  }

  app.get('/oauth/authorize', async (req, reply) => {
    const q = req.query || {};
    const c = checkAuthorize(q, req, await resolveClient(q.client_id));
    if (c.page) return page(reply, errorPage(origin(req), c.page), 400);
    if (c.redirect) return reply.redirect(c.redirect);
    const userId = sessionUserId(db, req);
    const user = userId && db.users.byId(userId);
    if (!user) return reply.redirect(`/signin?next=${encodeURIComponent(req.url)}`);
    const appInfo = appFor(c.client, c.redirectUri);
    return page(reply, consentPage({ origin: origin(req), app: appInfo, who: user.email || user.phone || 'your account', params: pick(q), limits: limitsFor(user, appInfo.name) }));
  });

  // Allow or Cancel, from the page above. JSON only, so another site can't
  // submit it for a signed-in visitor.
  app.post('/oauth/authorize', async (req, reply) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) return reply.code(415).send({ error: 'JSON only' });
    const b = req.body || {};
    const c = checkAuthorize(b.params || {}, req, await resolveClient(b.params?.client_id));
    if (c.page) return reply.code(400).send({ error: c.page });
    if (c.redirect) return { redirect: c.redirect };
    const userId = sessionUserId(db, req);
    const user = userId && db.users.byId(userId);
    if (!user) return reply.code(401).send({ error: 'Sign in first' });
    if (b.allow !== true) return { redirect: c.back('access_denied', 'You canceled').redirect };
    if (limited(`grant:${user.id}`, 20, 3600_000)) return reply.code(429).send({ error: 'Too many connections in an hour. Try again later.' });
    // The spending caps picked on this page (none = no cap, the person's choice).
    let limits = null;
    if (b.limits && typeof b.limits === 'object') {
      try {
        const r = normalizeRules({ max_order_cents: b.limits.max_order_cents || null, monthly_cents: b.limits.monthly_cents || null });
        limits = { max_order_cents: r?.max_order_cents || null, monthly_cents: r?.monthly_cents || null };
      } catch (err) {
        return reply.code(400).send({ error: err.message });
      }
    }
    const code = token('spot_code_');
    db.state.set(`oauth_code:${sha(code)}`, { client_id: b.params.client_id, redirect_uri: c.redirectUri, challenge: String(b.params.code_challenge), scope: b.params.scope || null, user_id: user.id, app: appFor(c.client, c.redirectUri).name, limits, exp: Date.now() + CODE_TTL });
    const u = new URL(c.redirectUri);
    u.searchParams.set('code', code);
    if (b.params.state) u.searchParams.set('state', String(b.params.state));
    u.searchParams.set('iss', origin(req));
    return { redirect: u.toString() };
  });

  // ── Tokens ────────────────────────────────────────────────────────────────
  // Basic or post client auth for apps that registered a secret.
  function clientAuth(req, b) {
    let id = b.client_id;
    let secret = b.client_secret;
    const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
    if (m) {
      const raw = Buffer.from(m[1], 'base64').toString('utf8');
      const i = raw.indexOf(':');
      if (i > 0) {
        try {
          id = decodeURIComponent(raw.slice(0, i));
          secret = decodeURIComponent(raw.slice(i + 1));
        } catch {
          return null;
        }
      }
    }
    const client = clientOf(id);
    if (!client) return null;
    if (client.secret_hash) {
      if (typeof secret !== 'string') return null;
      const a = Buffer.from(sha(secret), 'hex');
      const e = Buffer.from(client.secret_hash, 'hex');
      if (!timingSafeEqual(a, e)) return null;
    }
    return { id, client };
  }

  function issue(key, userId, clientId, { refresh = true, scope = SCOPE, sessionId } = {}) {
    const access = token('spot_at_');
    const extra = sessionId ? { session_id: sessionId } : {};
    db.state.set(`oauth_at:${sha(access)}`, { key, user_id: userId, client_id: clientId, ...extra, exp: Date.now() + ACCESS_TTL * 1000 });
    const out = { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL, scope };
    if (!refresh) return out;
    const rt = token('spot_rt_');
    db.state.set(`oauth_rt:${sha(rt)}`, { key, user_id: userId, client_id: clientId, scope, ...extra, exp: Date.now() + REFRESH_TTL });
    return { ...out, refresh_token: rt };
  }

  // A one-time code from the consent page → the user it signs in, or a reason.
  function redeemCode(b, clientId) {
    const k = `oauth_code:${sha(b.code || '')}`;
    const grant = db.state.get(k);
    if (grant) db.state.set(k, null); // once, even if what follows fails
    if (!grant || grant.exp < Date.now() || grant.client_id !== clientId) return { error: 'That code is expired or already used' };
    if (b.redirect_uri && b.redirect_uri !== grant.redirect_uri) return { error: 'redirect_uri doesn’t match' };
    if (typeof b.code_verifier !== 'string' || b64sha(b.code_verifier) !== grant.challenge) return { error: 'PKCE check failed' };
    const user = db.users.byId(grant.user_id);
    if (!user) return { error: 'That account is gone' };
    return { grant, user };
  }

  // One of the account's AI keys, the same as one made on the account page.
  const slugOf = (appName) => appName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'my-ai';
  const previousRules = (user, slug, except) => db.users.keys(user.id).find((k) => k.name !== except && k.rules && k.name.startsWith(`${slug}-`))?.rules || null;
  // What the Allow page starts with: the caps this app had last time, or $100 an order and $500 a month.
  function limitsFor(user, appName) {
    const prev = previousRules(user, slugOf(appName));
    if (prev) return { max_order_cents: prev.max_order_cents || null, monthly_cents: prev.monthly_cents || null };
    return { ...DEFAULT_LIMITS };
  }

  function accountKey(user, appName, limits = null) {
    const slug = slugOf(appName);
    const name = `${slug}-${randomBytes(3).toString('hex')}`;
    db.addKey(sha(token('spot_')), name, user.email || user.phone || 'unknown', user.id);
    db.agentEvents.add(`key:${name}`, user.id, 'connected', { via: appName });
    // Reconnecting the same app keeps the rules the person set for it, with
    // the caps they just picked on the Allow page.
    const prev = previousRules(user, slug, name);
    let rules = prev;
    if (limits) {
      try {
        rules = normalizeRules({ ...(prev || {}), max_order_cents: limits.max_order_cents, monthly_cents: limits.monthly_cents });
      } catch {
        rules = prev; // e.g. "no cap" with auto-pay on: keep what they had
      }
    }
    if (rules) db.keyRules.set(user.id, name, rules);
    if (limits && rules && !prev) db.agentEvents.add(`key:${name}`, user.id, 'rules_changed', { rules });
    return name;
  }

  // ── PAP sessions ──────────────────────────────────────────────────────────
  // A guest session uses one shared key per agent (no account, a payer link
  // for every ask); signing in moves the session onto an account key.
  function guestKey(clientId, ip) {
    const host = new URL(clientId).hostname;
    const name = `pap-${host.replace(/[^a-z0-9]+/gi, '-').slice(0, 30)}-${sha(clientId).slice(0, 6)}`.toLowerCase();
    if (db.keyByName(name)) return name;
    // New agents from one place, a few an hour, like self-serve keys.
    if (limited(`papkey:${ip}`, 10, 3600_000)) return null;
    db.addKey(sha(token('spot_')), name, host);
    return name;
  }
  const sessionOf = (id) => (typeof id === 'string' && id.startsWith('pss_') ? db.state.get(`pap_session:${id}`) : null);
  const saveSession = (id, s) => db.state.set(`pap_session:${id}`, s);
  function papScope(b) {
    const want = b.scope ? String(b.scope).split(/\s+/).filter(Boolean) : PAP_SCOPES;
    return want.every((x) => SCOPES.includes(x)) ? want.join(' ') : null;
  }

  async function papToken(req, reply, b) {
    let client;
    try {
      if (b.client_assertion_type !== CLIENT_ASSERTION) throw new PapError('Use private_key_jwt');
      client = await pap.client(b.client_id);
      pap.verifyJwt(b.client_assertion, client.keys, { iss: b.client_id, sub: b.client_id, aud: [urlFor(req, '/oauth/token'), origin(req)] });
    } catch (e) {
      return fail(reply, 401, 'invalid_client', e instanceof PapError ? e.message : 'Couldn’t check this agent');
    }
    if (limited(`pap:${b.client_id}`, 600, 3600_000)) return fail(reply, 429, 'rate_limited', 'Too many sessions, try again later');
    const scope = papScope(b);
    if (!scope) return fail(reply, 400, 'invalid_scope', `Only ${SCOPES.join(', ')}`);
    if (b.resource && ![resource(req), origin(req), `${origin(req)}/`].includes(String(b.resource))) return fail(reply, 400, 'invalid_target', 'Spot’s only API is its MCP server');

    if (b.grant_type === JWT_BEARER) {
      let a;
      try {
        a = pap.verifyJwt(b.assertion, client.keys, { iss: b.client_id, aud: [urlFor(req, '/oauth/token')] });
      } catch (e) {
        return fail(reply, 400, 'invalid_grant', e.message);
      }
      if (typeof a.sub !== 'string' || !a.sub || a.sub.length > 200) return fail(reply, 400, 'invalid_grant', 'Assertion needs a sub (the user ID)');
      let id = b.session_id;
      let s;
      if (id) {
        s = sessionOf(id);
        if (!s || s.client_id !== b.client_id) return fail(reply, 400, 'invalid_session', 'Unknown session; start a new one');
        if (s.sub && s.sub !== a.sub) return fail(reply, 400, 'account_mismatch', 'This session belongs to another user');
        s.sub = a.sub;
      } else {
        id = `pss_${randomBytes(18).toString('base64url')}`;
        s = { client_id: b.client_id, sub: a.sub, key: null, user_id: null, created_at: Date.now() };
      }
      // Signed out if the person disconnected the agent on their account page.
      const row = s.key && db.keyByName(s.key);
      if (s.key && (!row || row.revoked)) Object.assign(s, { key: null, user_id: null });
      const key = s.key || guestKey(b.client_id, req.ip);
      if (!key) return fail(reply, 429, 'rate_limited', 'Too many new agents from here, try again later');
      saveSession(id, s);
      const out = issue(key, s.user_id, b.client_id, { refresh: false, scope, sessionId: id });
      return { ...out, session_id: id, signed_in: Boolean(s.key) };
    }

    if (b.grant_type === 'authorization_code') {
      const r = redeemCode(b, b.client_id);
      if (r.error) return fail(reply, 400, 'invalid_grant', r.error);
      let id = b.session_id;
      let s = id ? sessionOf(id) : null;
      if (id && (!s || s.client_id !== b.client_id)) return fail(reply, 400, 'invalid_session', 'Unknown session; start a new one');
      if (s?.user_id && s.user_id !== r.user.id) return fail(reply, 400, 'account_mismatch', 'This session is signed in to another account');
      if (!s) {
        id = `pss_${randomBytes(18).toString('base64url')}`;
        s = { client_id: b.client_id, sub: null, created_at: Date.now() };
      }
      const key = s.user_id ? s.key : accountKey(r.user, r.grant.app, r.grant.limits);
      saveSession(id, { ...s, key, user_id: r.user.id });
      const out = issue(key, r.user.id, b.client_id, { scope: r.grant.scope || scope, sessionId: id });
      return { ...out, refresh_token_expires_in: REFRESH_TTL / 1000, session_id: id, signed_in: true };
    }

    if (b.grant_type === 'refresh_token') {
      const k = `oauth_rt:${sha(b.refresh_token || '')}`;
      const rt = db.state.get(k);
      if (!rt || rt.exp < Date.now() || rt.client_id !== b.client_id) return fail(reply, 400, 'invalid_grant', 'Sign in to Spot again');
      const row = db.keyByName(rt.key);
      db.state.set(k, null);
      if (!row || row.revoked) return fail(reply, 400, 'invalid_grant', 'This agent was disconnected from Spot. Sign in again to reconnect.');
      const out = issue(rt.key, rt.user_id, b.client_id, { scope: rt.scope || scope, sessionId: rt.session_id });
      return { ...out, refresh_token_expires_in: REFRESH_TTL / 1000, ...(rt.session_id ? { session_id: rt.session_id } : {}), signed_in: true };
    }

    return fail(reply, 400, 'unsupported_grant_type', `Use ${JWT_BEARER}, authorization_code or refresh_token`);
  }

  app.post('/oauth/token', async (req, reply) => {
    cors(reply).header('cache-control', 'no-store').header('pragma', 'no-cache');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (limited(`tok:${req.ip}`, 60, 60_000)) return fail(reply, 429, 'invalid_request', 'Too many requests');
    if (isUrlClient(b.client_id)) return papToken(req, reply, b);
    const auth = clientAuth(req, b);
    if (!auth) return fail(reply, 401, 'invalid_client', 'Unknown client or wrong secret');

    if (b.grant_type === 'authorization_code') {
      const r = redeemCode(b, auth.id);
      if (r.error) return fail(reply, 400, 'invalid_grant', r.error);
      return issue(accountKey(r.user, r.grant.app, r.grant.limits), r.user.id, auth.id);
    }

    if (b.grant_type === 'refresh_token') {
      const k = `oauth_rt:${sha(b.refresh_token || '')}`;
      const rt = db.state.get(k);
      if (!rt || rt.exp < Date.now() || rt.client_id !== auth.id) return fail(reply, 400, 'invalid_grant', 'Sign in to Spot again');
      const row = db.keyByName(rt.key);
      db.state.set(k, null);
      if (!row || row.revoked) return fail(reply, 400, 'invalid_grant', 'This app was disconnected from Spot. Sign in again to reconnect.');
      return issue(rt.key, rt.user_id, auth.id);
    }

    return fail(reply, 400, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  });

  app.post('/oauth/revoke', async (req, reply) => {
    cors(reply).header('cache-control', 'no-store');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    let auth;
    if (isUrlClient(b.client_id)) {
      try {
        if (b.client_assertion_type !== CLIENT_ASSERTION) throw new PapError('Use private_key_jwt');
        const client = await pap.client(b.client_id);
        pap.verifyJwt(b.client_assertion, client.keys, { iss: b.client_id, sub: b.client_id, aud: [urlFor(req, '/oauth/revoke'), urlFor(req, '/oauth/token'), origin(req)] });
        auth = { id: b.client_id };
      } catch {
        auth = null;
      }
    } else auth = clientAuth(req, b);
    if (!auth) return fail(reply, 401, 'invalid_client', 'Unknown client or wrong secret');
    const t = String(b.token || '');
    for (const kind of ['oauth_rt', 'oauth_at']) {
      const k = `${kind}:${sha(t)}`;
      const v = db.state.get(k);
      if (!v || v.client_id !== auth.id) continue;
      db.state.set(k, null);
      // Revoking a PAP account token signs that session out.
      const s = kind === 'oauth_rt' && sessionOf(v.session_id);
      if (s) saveSession(v.session_id, { ...s, key: null, user_id: null });
    }
    return reply.code(200).send({});
  });

  return { challenge };
}

const PARAMS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];
const pick = (q) => Object.fromEntries(PARAMS.filter((p) => q[p] != null).map((p) => [p, String(q[p])]));

function page(reply, body, code = 200) {
  return reply.code(code).type('text/html; charset=utf-8').header('cache-control', 'no-store').header('x-frame-options', 'DENY').header('content-security-policy', "frame-ancestors 'none'").header('referrer-policy', 'no-referrer').header('x-robots-tag', 'noindex').send(body);
}

// Caps a new AI starts with unless the person picks others on the Allow page.
const DEFAULT_LIMITS = { max_order_cents: 10000, monthly_cents: 50000 };
const ORDER_CAPS = [5000, 10000, 25000, 50000];
const MONTH_CAPS = [20000, 50000, 100000, 200000];
const dollars = (c) => `$${(c / 100).toLocaleString('en-US')}`;
function capSelect(name, label, list, value) {
  const opts = [...new Set([...list, ...(value ? [value] : [])])].sort((a, b) => a - b);
  return `<label class="cap"><span>${label}</span><select name="${name}">${opts.map((c) => `<option value="${c}"${c === value ? ' selected' : ''}>Up to ${dollars(c)}</option>`).join('')}<option value=""${value ? '' : ' selected'}>No cap</option></select></label>`;
}

const CSS = `
.oa{max-width:480px;margin:40px auto 64px;padding:0 16px}
.oa .card{background:var(--card);border:1.5px solid var(--line);border-radius:var(--radius);padding:26px 24px}
.oa h1{font-size:clamp(26px,6vw,34px);letter-spacing:-.025em;line-height:1.1;margin:0 0 8px}
.oa .who{color:var(--muted);margin:0 0 18px}.oa .who b{color:var(--ink)}
.oa ul{margin:0 0 18px;padding:0;list-style:none}.oa li{padding:10px 0 10px 30px;border-top:1px solid var(--line);position:relative}
.oa li::before{content:"✓";position:absolute;left:4px;top:10px;color:var(--ok);font-weight:800}
.oa li.no::before{content:"✕";color:var(--muted)}
.oa .warn{background:color-mix(in srgb,var(--spot2) 30%,transparent);border-radius:12px;padding:10px 12px;font-size:14px;margin:0 0 16px}
.oa .btns{display:flex;gap:10px;flex-wrap:wrap}.oa .btns .btn{flex:1;min-width:140px;justify-content:center}
.oa .fine{font-size:13px;color:var(--muted);margin:14px 0 0}
.oa .err{color:#c0362c;min-height:1.2em;margin:10px 0 0}
.oa .linkbtn{background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer;font:inherit}
.oa .caps{margin:0 0 18px;padding:14px;border:1.5px solid var(--line);border-radius:16px;background:var(--bg)}
.oa .caps legend{font-weight:800;padding:0 4px}
.oa .caps p{margin:0 0 10px;font-size:14px;color:var(--muted)}
.oa .caprow{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.oa .cap{display:grid;gap:4px;font-size:13px;font-weight:700}
.oa .cap select{font:inherit;font-size:16px;font-weight:600;padding:10px 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);width:100%}
`;

export function consentPage({ origin, app, who, params, limits = DEFAULT_LIMITS }) {
  const n = esc(app.name);
  return `${siteHead({ title: `Connect ${app.name} · Spot`, desc: `Let ${app.name} shop with your Spot account.`, origin, path: '/oauth/authorize', extraCss: CSS })}
${siteNav('')}
<main class="oa"><div class="card">
  <h1>${n} wants to shop with Spot</h1>
  <p class="who">Signed in as <b>${esc(who)}</b> · <button type="button" class="linkbtn" id="switch">Not you?</button></p>
  ${app.verified ? '' : `<p class="warn">Spot can’t confirm who made this app. Only allow it if you just added Spot to it yourself. You’ll go back to <b>${esc(app.host)}</b>.</p>`}
  <ul>
    <li>Find things and put carts together for you</li>
    <li>Ask you, or someone you choose, to pay for them</li>
    <li>Follow the rules you set: limits, stores, who approves</li>
    <li class="no">See your card or charge it without your rules</li>
  </ul>
  <fieldset class="caps" id="caps"><legend>Spending caps for ${n}</legend>
    <p>Asks over a cap are refused. Every purchase still waits for a yes.</p>
    <div class="caprow">${capSelect('max_order_cents', 'Per order', ORDER_CAPS, limits?.max_order_cents || null)}${capSelect('monthly_cents', 'Per month', MONTH_CAPS, limits?.monthly_cents || null)}</div>
  </fieldset>
  <div class="btns"><button class="btn primary" id="allow">Allow</button><button class="btn ghost" id="deny">Cancel</button></div>
  <p class="err" id="err" role="alert"></p>
  <p class="fine">It shows up under “AI &amp; card” in your account, where you can change these, pick stores or disconnect it any time.</p>
</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}})();</script>
<script>(()=>{const P=${JSON.stringify(params).replace(/</g, '\\u003c')};
const cap=n=>{const v=document.querySelector('#caps [name='+n+']').value;return v?Number(v):null};
const go=async(allow)=>{const err=document.getElementById('err');err.textContent='';
const limits={max_order_cents:cap('max_order_cents'),monthly_cents:cap('monthly_cents')};
if(allow&&limits.max_order_cents&&limits.monthly_cents&&limits.monthly_cents<limits.max_order_cents){err.textContent='The monthly cap can’t be lower than the per-order cap.';return}
document.querySelectorAll('.btns .btn').forEach(b=>b.disabled=true);
try{const r=await fetch('/oauth/authorize',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({params:P,allow,limits})});const j=await r.json();
if(j.redirect){location.href=j.redirect;return}throw new Error(j.error||'Something went wrong')}catch(e){document.getElementById('err').textContent=e.message;document.querySelectorAll('.btns .btn').forEach(b=>b.disabled=false)}};
document.getElementById('allow').onclick=()=>go(true);document.getElementById('deny').onclick=()=>go(false);
document.getElementById('switch').onclick=async()=>{await fetch('/v1/auth/logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});location.href='/signin?next='+encodeURIComponent(location.pathname+location.search)};
})();</script>
</body></html>`;
}

function errorPage(origin, msg) {
  return `${siteHead({ title: 'Can’t connect · Spot', desc: 'Connecting an AI app to Spot', origin, path: '/oauth/authorize', extraCss: CSS })}
${siteNav('')}
<main class="oa"><div class="card"><h1>Can’t connect this app</h1><p class="who">${esc(msg)}</p><p class="fine"><a href="/integrations#mcp">How to add Spot to Claude or ChatGPT</a></p></div></main>
${siteFooter()}
</body></html>`;
}

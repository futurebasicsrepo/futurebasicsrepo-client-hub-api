// Personal Agent Protocol (draft 0.1): discovery, guest sessions, sign-in, renewal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const CLIENT = 'https://atlas.example/.well-known/agent.json';
const REDIRECT = 'https://atlas.example/callback';
const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
const CLIENT_ASSERTION = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
const form = (o) => ({ payload: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function agentKey(kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'ES256', use: 'sig' }, kid };
}
function jwt(key, claims, { exp = 60 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: key.kid, typ: 'JWT' });
  const body = b64({ iat: now, exp: now + exp, jti: randomBytes(16).toString('base64url'), ...claims });
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: key.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

function setup(t, { metadata } = {}) {
  const key = agentKey();
  const docs = {
    [CLIENT]: metadata || { client_id: CLIENT, client_name: 'Atlas', jwks_uri: 'https://atlas.example/jwks.json', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'private_key_jwt' },
    'https://atlas.example/jwks.json': { keys: [key.jwk] },
  };
  const fetched = [];
  const papFetch = async (url) => {
    fetched.push(url);
    if (!docs[url]) throw new Error('404');
    return docs[url];
  };
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {}, papFetch });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  const tokenUrl = 'http://localhost:80/oauth/token';
  const clientAuth = (k = key) => ({ client_id: CLIENT, client_assertion_type: CLIENT_ASSERTION, client_assertion: jwt(k, { iss: CLIENT, sub: CLIENT, aud: tokenUrl }) });
  const token = async (fields, k) => {
    const r = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ ...clientAuth(k), ...fields }) });
    return { status: r.statusCode, body: r.json() };
  };
  const session = (sub = 'user-123', extra = {}) => token({ grant_type: JWT_BEARER, assertion: jwt(key, { iss: CLIENT, sub, aud: tokenUrl }), ...extra });
  return { a, call, key, token, session, tokenUrl, fetched };
}

const mcp = (call, tok) => call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, { authorization: `Bearer ${tok}`, accept: 'application/json, text/event-stream' });

async function signIn(call, email = 'kyle@example.com') {
  const start = await call('POST', '/v1/auth/start', { email });
  return (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
}

test('discovery: poppy.json names Spot, its issuer and its MCP API; the issuer lists the domain', async (t) => {
  const { call } = setup(t);
  const p = (await call('GET', '/.well-known/poppy.json')).body;
  assert.equal(p.protocol_version, '0.1');
  assert.equal(p.organization.name, 'Spot');
  assert.equal(p.organization.domain, 'localhost');
  assert.deepEqual(p.auth.direct.scopes, ['poppy:read', 'poppy:write']);
  assert.equal(p.apis[0].type, 'mcp');
  assert.match(p.apis[0].url, /\/mcp$/);
  assert.equal(p.extensions['spotmeplease.com/approvals'].version, '1');

  const asm = (await call('GET', '/.well-known/oauth-authorization-server')).body;
  assert.equal(asm.issuer, p.auth.issuer, 'the agent checks issuer matches auth.issuer');
  assert.ok(asm.poppy_domains.includes(p.organization.domain));
  assert.ok(asm.revocation_endpoint && asm.token_endpoint && asm.authorization_endpoint);
  assert.ok(asm.grant_types_supported.includes(JWT_BEARER));
  assert.ok(asm.token_endpoint_auth_methods_supported.includes('private_key_jwt'));
});

test('a guest session can call the MCP server and send asks', async (t) => {
  const { call, session } = setup(t);
  const s = await session();
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.match(s.body.session_id, /^pss_/);
  assert.equal(s.body.signed_in, false);
  assert.equal(s.body.token_type, 'Bearer');
  assert.equal(s.body.scope, 'poppy:read poppy:write');
  assert.equal(s.body.refresh_token, undefined, 'guests get no account token');
  assert.ok(s.body.expires_in > 0);

  const tools = await mcp(call, s.body.access_token);
  assert.equal(tools.status, 200, JSON.stringify(tools.body));
  assert.ok(tools.body.result.tools.some((x) => x.name === 'create_spot_ask'));
  const ask = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }] }, { authorization: `Bearer ${s.body.access_token}` });
  assert.equal(ask.status, 201, JSON.stringify(ask.body));

  // Renewal keeps the session.
  const r = await session('user-123', { session_id: s.body.session_id });
  assert.equal(r.body.session_id, s.body.session_id);
  assert.equal((await session('someone-else', { session_id: s.body.session_id })).body.error, 'account_mismatch');
  assert.equal((await session('user-123', { session_id: 'pss_nope' })).body.error, 'invalid_session');
});

test('agent checks: signature, audience, replay, metadata', async (t) => {
  const { a, token, tokenUrl, key, session } = setup(t);
  // Signed by a key the agent didn't publish.
  assert.equal((await token({ grant_type: JWT_BEARER, assertion: 'x' }, agentKey())).body.error, 'invalid_client');
  // No client assertion at all.
  const bare = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ client_id: CLIENT, grant_type: JWT_BEARER }) });
  assert.equal(bare.statusCode, 401);
  // Assertion for another audience.
  assert.equal((await token({ grant_type: JWT_BEARER, assertion: jwt(key, { iss: CLIENT, sub: 'u', aud: 'https://other.example/token' }) })).body.error, 'invalid_grant');
  // Long-lived assertions are refused.
  assert.equal((await token({ grant_type: JWT_BEARER, assertion: jwt(key, { iss: CLIENT, sub: 'u', aud: tokenUrl }, { exp: 3600 }) })).body.error, 'invalid_grant');
  // The same assertion twice.
  const once = jwt(key, { iss: CLIENT, sub: 'u', aud: tokenUrl });
  assert.equal((await token({ grant_type: JWT_BEARER, assertion: once })).status, 200);
  assert.equal((await token({ grant_type: JWT_BEARER, assertion: once })).body.error, 'invalid_grant');
  // Unknown scopes.
  assert.equal((await session('u', { scope: 'poppy:admin' })).body.error, 'invalid_scope');
});

test('metadata whose client_id doesn’t match its URL is refused', async (t) => {
  const { session } = setup(t, { metadata: { client_id: 'https://evil.example/agent.json', jwks_uri: 'https://atlas.example/jwks.json', redirect_uris: [REDIRECT] } });
  const s = await session();
  assert.equal(s.status, 401);
  assert.equal(s.body.error, 'invalid_client');
});

test('sign-in moves the session onto the account; disconnecting signs it out', async (t) => {
  const { call, session, token } = setup(t);
  const guest = (await session()).body;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = { response_type: 'code', client_id: CLIENT, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 's1', scope: 'poppy:read poppy:write' };
  const cookie = await signIn(call);
  const page = await call('GET', `/oauth/authorize?${new URLSearchParams(q)}`, undefined, { cookie });
  assert.equal(page.status, 200, page.body);
  assert.match(page.body, /Atlas wants to shop with Spot/);
  // A redirect the agent's metadata doesn't list is shown, never followed.
  const bad = await call('GET', `/oauth/authorize?${new URLSearchParams({ ...q, redirect_uri: 'https://evil.example/cb' })}`, undefined, { cookie });
  assert.equal(bad.status, 400);

  const allow = await call('POST', '/oauth/authorize', { params: q, allow: true }, { cookie });
  const back = new URL(allow.body.redirect);
  assert.equal(back.origin + back.pathname, REDIRECT);
  const code = back.searchParams.get('code');

  const t1 = await token({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier, session_id: guest.session_id });
  assert.equal(t1.status, 200, JSON.stringify(t1.body));
  assert.equal(t1.body.signed_in, true);
  assert.equal(t1.body.session_id, guest.session_id);
  assert.match(t1.body.refresh_token, /^spot_rt_/);
  assert.ok(t1.body.refresh_token_expires_in > 0);
  assert.equal(t1.body.scope, 'poppy:read poppy:write');

  // It's one of the account's AI keys, named after the agent.
  const me = (await call('GET', '/v1/me', undefined, { cookie })).body;
  const k = me.keys.find((x) => x.name.startsWith('atlas-'));
  assert.ok(k, JSON.stringify(me.keys.map((x) => x.name)));
  assert.equal((await mcp(call, t1.body.access_token)).status, 200);

  // Renewing the session now comes back signed in.
  const r = (await session('user-123', { session_id: guest.session_id })).body;
  assert.equal(r.signed_in, true);
  // The account token renews too.
  const r2 = await token({ grant_type: 'refresh_token', refresh_token: t1.body.refresh_token });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.session_id, guest.session_id);

  // Disconnect on the account page: the next renewal is a guest again.
  await call('POST', `/v1/me/keys/${k.name}/revoke`, {}, { cookie });
  assert.equal((await mcp(call, t1.body.access_token)).status, 401);
  const after = (await session('user-123', { session_id: guest.session_id })).body;
  assert.equal(after.signed_in, false);
  assert.equal((await token({ grant_type: 'refresh_token', refresh_token: r2.body.refresh_token })).body.error, 'invalid_grant');
});

test('revoking the account token signs the session out', async (t) => {
  const { a, call, session, token, key } = setup(t);
  const guest = (await session()).body;
  const verifier = randomBytes(32).toString('base64url');
  const q = { response_type: 'code', client_id: CLIENT, redirect_uri: REDIRECT, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' };
  const cookie = await signIn(call);
  const code = new URL((await call('POST', '/oauth/authorize', { params: q, allow: true }, { cookie })).body.redirect).searchParams.get('code');
  const t1 = (await token({ grant_type: 'authorization_code', code, code_verifier: verifier, session_id: guest.session_id })).body;
  const rv = await a.inject({ method: 'POST', url: '/oauth/revoke', ...form({ client_id: CLIENT, client_assertion_type: CLIENT_ASSERTION, client_assertion: jwt(key, { iss: CLIENT, sub: CLIENT, aud: 'http://localhost:80/oauth/revoke' }), token: t1.refresh_token }) });
  assert.equal(rv.statusCode, 200, rv.body);
  assert.equal((await session('user-123', { session_id: guest.session_id })).body.signed_in, false);
});

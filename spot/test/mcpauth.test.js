// "Add Spot" in Claude or ChatGPT: OAuth sign-in for /mcp instead of a pasted key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const cfg = { feeBps: 400, feeFixedCents: 0, maxCartCents: 50000, expiresHours: 72 };
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const form = (o) => ({ payload: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

function app(t) {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), cfg, logger: false, env: {} });
  t.after(() => a.close());
  const call = async (method, url, payload, headers = {}) => {
    const r = await a.inject({ method, url, payload, headers });
    return { status: r.statusCode, body: r.headers['content-type']?.includes('json') ? r.json() : r.body, headers: r.headers };
  };
  return { a, call };
}

async function signIn(call, email = 'kyle@example.com') {
  const start = await call('POST', '/v1/auth/start', { email });
  return (await call('POST', '/v1/auth/verify', { email, code: start.body.code })).headers['set-cookie'].split(';')[0];
}

// Allow (or Cancel) on the consent page, as the signed-in person.
async function decide(call, cookie, authorizeUrl, allow = true, host) {
  const h = host ? { cookie, host } : { cookie };
  const params = Object.fromEntries(new URL(authorizeUrl, 'http://x').searchParams);
  const page = await call('GET', `/oauth/authorize?${new URLSearchParams(params)}`, undefined, h);
  assert.equal(page.status, 200, page.body);
  const r = await call('POST', '/oauth/authorize', { params, allow }, h);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { page: page.body, redirect: new URL(r.body.redirect) };
}

test('discovery: /mcp says where to sign in, and the metadata points at Spot', async (t) => {
  const { call } = app(t);
  const r = await call('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(r.status, 401);
  assert.match(r.headers['www-authenticate'], /^Bearer resource_metadata="http:\/\/localhost(:\d+)?\/\.well-known\/oauth-protected-resource", scope="spot"$/);

  const prm = (await call('GET', '/.well-known/oauth-protected-resource')).body;
  assert.match(prm.resource, /\/mcp$/);
  assert.equal((await call('GET', '/.well-known/oauth-protected-resource/mcp')).body.resource, prm.resource);
  const asm = (await call('GET', '/.well-known/oauth-authorization-server')).body;
  assert.equal(asm.issuer, prm.authorization_servers[0]);
  assert.deepEqual(asm.code_challenge_methods_supported, ['S256']);
  assert.match(asm.registration_endpoint, /\/oauth\/register$/);
  assert.deepEqual((await call('GET', '/.well-known/openid-configuration')).body, asm);
});

test('registration: https or localhost redirects only', async (t) => {
  const { call } = app(t);
  assert.equal((await call('POST', '/oauth/register', { redirect_uris: ['http://evil.example/cb'] })).status, 400);
  assert.equal((await call('POST', '/oauth/register', { redirect_uris: [] })).status, 400);
  assert.equal((await call('POST', '/oauth/register', { redirect_uris: [CLAUDE], grant_types: ['password'] })).status, 400);
  assert.equal((await call('POST', '/oauth/register', { redirect_uris: ['http://127.0.0.1:6274/cb'] })).status, 201, 'desktop apps');
  const c = await call('POST', '/oauth/register', { client_name: 'Claude', redirect_uris: [CLAUDE] });
  assert.equal(c.status, 201);
  assert.match(c.body.client_id, /^spc_/);
  assert.equal(c.body.client_secret, undefined, 'a public client gets no secret');
  const s = await call('POST', '/oauth/register', { client_name: 'ChatGPT', redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'], token_endpoint_auth_method: 'client_secret_post' });
  assert.match(s.body.client_secret, /^spcs_/);
});

test('authorize → consent → token → /mcp, then refresh, then Disconnect ends it', async (t) => {
  const { a, call } = app(t);
  const client = (await call('POST', '/oauth/register', { client_name: 'Claude', redirect_uris: [CLAUDE] })).body;
  const { verifier, challenge } = pkce();
  const q = { response_type: 'code', client_id: client.client_id, redirect_uri: CLAUDE, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', scope: 'spot' };
  const url = `/oauth/authorize?${new URLSearchParams(q)}`;

  // Not signed in: off to sign in, and back here after.
  const out = await call('GET', url);
  assert.equal(out.status, 302);
  assert.equal(out.headers.location, `/signin?next=${encodeURIComponent(url)}`);

  // A redirect the app didn't register is shown, never followed.
  const bad = await call('GET', `/oauth/authorize?${new URLSearchParams({ ...q, redirect_uri: 'https://evil.example/cb' })}`);
  assert.equal(bad.status, 400);
  assert.match(bad.body, /doesn’t match/);
  assert.equal(bad.headers.location, undefined);
  // No PKCE: back to the app with an error.
  const noPkce = await call('GET', `/oauth/authorize?${new URLSearchParams({ ...q, code_challenge: '' })}`);
  assert.equal(noPkce.status, 302);
  assert.match(noPkce.headers.location, /^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request/);

  const cookie = await signIn(call);
  // The Allow decision is JSON from a signed-in page only.
  assert.equal((await a.inject({ method: 'POST', url: '/oauth/authorize', ...form({ allow: 'true' }), headers: { ...form({}).headers, cookie } })).statusCode, 415);
  assert.equal((await call('POST', '/oauth/authorize', { params: q, allow: true })).status, 401);

  const { page, redirect } = await decide(call, cookie, url);
  assert.match(page, /Claude wants to shop with Spot/);
  assert.match(page, /Signed in as <b>kyle@example\.com<\/b>/);
  assert.doesNotMatch(page, /can’t confirm who made this app/, 'claude.ai is recognized');
  assert.equal(redirect.origin + redirect.pathname, CLAUDE);
  assert.equal(redirect.searchParams.get('state'), 'xyz');
  assert.ok(redirect.searchParams.get('iss'));
  const code = redirect.searchParams.get('code');

  // Wrong verifier burns the code.
  const wrong = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE, client_id: client.client_id, code_verifier: 'x'.repeat(43) }) });
  assert.equal(wrong.statusCode, 400);
  assert.equal(wrong.json().error, 'invalid_grant');
  const reused = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code, redirect_uri: CLAUDE, client_id: client.client_id, code_verifier: verifier }) });
  assert.equal(reused.json().error, 'invalid_grant', 'a code works once');

  const code2 = (await decide(call, cookie, url)).redirect.searchParams.get('code');
  const other = (await call('POST', '/oauth/register', { client_name: 'x', redirect_uris: [CLAUDE] })).body;
  assert.equal((await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code: code2, client_id: other.client_id, code_verifier: verifier }) })).json().error, 'invalid_grant', 'another app can’t use it');
  const code3 = (await decide(call, cookie, url)).redirect.searchParams.get('code');
  const tok = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code: code3, redirect_uri: CLAUDE, client_id: client.client_id, code_verifier: verifier }) });
  assert.equal(tok.statusCode, 200, tok.body);
  const t1 = tok.json();
  assert.match(t1.access_token, /^spot_at_/);
  assert.match(t1.refresh_token, /^spot_rt_/);
  assert.equal(t1.expires_in, 3600);
  assert.equal(tok.headers['cache-control'], 'no-store');

  // It's one of the account's AI keys, with its own activity.
  const me = (await call('GET', '/v1/me', undefined, { cookie })).body;
  const key = me.keys.find((k) => k.name.startsWith('claude-'));
  assert.ok(key, JSON.stringify(me.keys));
  assert.equal(key.activity[0].kind, 'connected');

  // The token works on the agent API, and asks land in the account.
  const ask = await call('POST', '/v1/agent/asks', { requester: { name: 'Kyle' }, merchant: { name: 'Nike', url: 'https://www.nike.com' }, items: [{ title: 'Dunk Low', quantity: 1, price_cents: 11500 }] }, { authorization: `Bearer ${t1.access_token}` });
  assert.equal(ask.status, 201, JSON.stringify(ask.body));
  assert.ok((await call('GET', '/v1/me', undefined, { cookie })).body.keys.find((k) => k.name === key.name).activity.some((e) => e.kind === 'ask_created'));

  // Refresh rotates: the new pair works, the old refresh doesn't.
  const r2 = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }) });
  assert.equal(r2.statusCode, 200, r2.body);
  const t2 = r2.json();
  assert.notEqual(t2.access_token, t1.access_token);
  assert.equal((await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }) })).json().error, 'invalid_grant');

  // Disconnect on the account page ends the app's access, tokens and all.
  await call('POST', `/v1/me/keys/${key.name}/revoke`, {}, { cookie });
  const after = await call('POST', '/v1/agent/asks', {}, { authorization: `Bearer ${t2.access_token}` });
  assert.equal(after.status, 401);
  const r3 = await a.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: t2.refresh_token, client_id: client.client_id }) });
  assert.equal(r3.json().error, 'invalid_grant');
  assert.match(r3.json().error_description, /disconnected/);
});

test('cancel goes back to the app with access_denied; unknown apps get a warning', async (t) => {
  const { call } = app(t);
  const cookie = await signIn(call);
  const odd = (await call('POST', '/oauth/register', { client_name: 'Totally Claude', redirect_uris: ['https://shop-helper.example/cb'] })).body;
  const { challenge } = pkce();
  const url = `/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: odd.client_id, code_challenge: challenge, code_challenge_method: 'S256', state: 's1' })}`;
  const { page, redirect } = await decide(call, cookie, url, false);
  assert.match(page, /Totally Claude wants to shop with Spot/);
  assert.match(page, /can’t confirm who made this app/);
  assert.match(page, /shop-helper\.example/);
  assert.equal(redirect.searchParams.get('error'), 'access_denied');
  assert.equal(redirect.searchParams.get('state'), 's1');
  assert.equal(redirect.searchParams.get('code'), null);
});

test('client secret apps (ChatGPT-style) must send their secret', async (t) => {
  const { a, call } = app(t);
  const cookie = await signIn(call);
  const REDIR = 'https://chatgpt.com/connector_platform_oauth_redirect';
  const c = (await call('POST', '/oauth/register', { client_name: 'ChatGPT', redirect_uris: [REDIR], token_endpoint_auth_method: 'client_secret_basic' })).body;
  const { verifier, challenge } = pkce();
  const url = `/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: c.client_id, redirect_uri: REDIR, code_challenge: challenge, code_challenge_method: 'S256' })}`;
  const { page, redirect } = await decide(call, cookie, url);
  assert.match(page, /ChatGPT wants to shop with Spot/);
  const code = redirect.searchParams.get('code');
  const body = { grant_type: 'authorization_code', code, redirect_uri: REDIR, code_verifier: verifier };
  assert.equal((await a.inject({ method: 'POST', url: '/oauth/token', ...form({ ...body, client_id: c.client_id }) })).statusCode, 401, 'no secret');
  const basic = Buffer.from(`${c.client_id}:${c.client_secret}`).toString('base64');
  const ok = await a.inject({ method: 'POST', url: '/oauth/token', payload: new URLSearchParams(body).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${basic}` } });
  assert.equal(ok.statusCode, 200, ok.body);
  const me = (await call('GET', '/v1/me', undefined, { cookie })).body;
  assert.ok(me.keys.some((k) => k.name.startsWith('chatgpt-')));
});

test('the MCP SDK client signs in on its own and lists the tools', async (t) => {
  const { a, call } = app(t);
  await a.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${a.server.address().port}`;
  const cookie = await signIn(call);

  // What Claude Desktop does, minus the browser window.
  const store = {};
  let authUrl = null;
  const provider = {
    get redirectUrl() {
      return 'http://127.0.0.1:6274/callback';
    },
    get clientMetadata() {
      return { client_name: 'Test MCP client', redirect_uris: ['http://127.0.0.1:6274/callback'], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' };
    },
    clientInformation: () => store.client,
    saveClientInformation: (c) => (store.client = c),
    tokens: () => store.tokens,
    saveTokens: (x) => (store.tokens = x),
    redirectToAuthorization: (u) => (authUrl = u),
    saveCodeVerifier: (v) => (store.verifier = v),
    codeVerifier: () => store.verifier,
  };
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider });
  const first = new Client({ name: 'test', version: '1.0.0' });
  await assert.rejects(first.connect(transport), UnauthorizedError);
  assert.ok(authUrl, 'it found the sign-in page from the 401');
  assert.equal(`${authUrl.origin}${authUrl.pathname}`, `${base}/oauth/authorize`);

  const { redirect } = await decide(call, cookie, `${authUrl.pathname}${authUrl.search}`, true, authUrl.host);
  await transport.finishAuth(redirect.searchParams.get('code'));
  assert.match(store.tokens.access_token, /^spot_at_/);

  const c = new Client({ name: 'test', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { authProvider: provider }));
  t.after(() => c.close());
  const { tools } = await c.listTools();
  assert.ok(tools.some((x) => x.name === 'create_spot_ask'));
});

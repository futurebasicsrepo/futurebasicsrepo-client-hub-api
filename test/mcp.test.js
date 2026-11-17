// The Design Lab connector (src/mcp-routes.js): a room's AI tool designs through the Lab's own routes, as the person whose key it holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { jwtVerify } from 'jose';
import { createTools, registerMcpRoutes, TOOLS, hashKey, KEY_PREFIX, MCP_PROTOCOLS } from '../src/mcp-routes.js';
import { defaultParams, placementChecks } from '../src/lab-flats.js';

// ---- the tools, against a stand-in for the Lab's routes ----
const PID = '11111111-2222-4333-8444-555555555555', PROD = '99999999-2222-4333-8444-555555555555';
function lab({ flat = { ...defaultParams('hoodie'), placements: [], saved: true }, approve = { status: 200, json: {} } } = {}) {
  const calls = [], tech = { id: 't1', name: 'Screen print', kind: 'print', base: 'screen print', rules: { maxW: 14, maxH: 16, minClear: .75 }, surfaces: ['cloth'] };
  let saved = flat;
  const call = async (method, url, body) => {
    calls.push({ method, url, body });
    if (url === '/v1/lab/recipe') return { status: 200, json: { bases: [{ id: 'hoodie', label: 'Pullover hoodie', styleLabel: 'Pullover hoodie', category: 'tops', note: '', addons: ['kangaroo'] }], addons: [{ id: 'kangaroo', label: 'Kangaroo pocket', group: 'Pockets' }, { id: 'pleats', label: 'Pleats', group: 'Finishes' }], systems: [{ id: 'earth', name: 'Washed earth', mood: '', colours: [{ name: 'Clay', hex: '#b46a4c' }, { name: 'Bark', hex: '#4a3b2f' }] }] } };
    if (url === '/v1/lab/concepts/from-recipe') return { status: 201, json: { concept: { id: PID, name: body.name || 'Pullover hoodie', category: 'tops', status: 'draft' }, studio: `/lab/studio?concept=${PID}&view=front` } };
    if (url === `/v1/lab/concepts/${PID}/flats` && method === 'GET') return { status: 200, json: { concept: { id: PID, name: 'Field hoodie', status: 'draft' }, flat: saved, techniques: [tech], firstTechnique: { cloth: 't1', mark: 't1' }, madeAs: {} } };
    if (url === `/v1/lab/concepts/${PID}/flats` && method === 'PUT') { saved = { ...body, saved: true }; return { status: 200, json: { ok: true, check: { summary: { fail: 0, warn: 0 }, findings: {} }, where: {} } }; }
    if (url === `/v1/lab/concepts/${PID}`) return method === 'GET' ? { status: 200, json: { concept: { id: PID, productId: calls.some(c => c.url.endsWith('/tech-pack')) ? PROD : null } } } : { status: 200, json: {} };
    if (url === `/v1/lab/concepts/${PID}/approve`) return approve;
    if (url === `/v1/lab/concepts/${PID}/tech-pack`) return { status: 201, json: { productId: PROD, url: `/tech-packs/${PROD}` } };
    if (url === `/v1/products/${PROD}/make-request`) return { status: 201, json: { request: { status: 'requested' } } };
    return { status: 404, json: { error: 'Not found' } };
  };
  return { call, calls, flat: () => saved, tools: createTools({ call, hub: () => 'https://hub.test' }) };
}

test('ten tools, each with a schema and a description a model can act on', () => {
  assert.equal(TOOLS.length, 10);
  for (const t of TOOLS) { assert.ok(t.description.length > 40, t.name); assert.equal(t.inputSchema.type, 'object'); }
  assert.deepEqual(TOOLS.filter(t => t.annotations.readOnlyHint).map(t => t.name), ['list_recipe', 'list_pieces', 'get_piece', 'get_pattern']);
});

test('the recipe menu, whole or for one base; a piece started from it, in a named colour', async () => {
  const L = lab();
  const all = await L.tools.list_recipe({}); assert.equal(all.bases[0].id, 'hoodie'); assert.deepEqual(all.colour_systems[0].colours, ['Clay', 'Bark']);
  const one = await L.tools.list_recipe({ base: 'hoodie' }); assert.deepEqual(one.addons.map(a => a.id), ['kangaroo'], 'only the add-ons the base takes');
  await assert.rejects(L.tools.list_recipe({ base: 'nope' }), /No base "nope"/);
  const s = await L.tools.start_piece({ base: 'hoodie', colour_system: 'earth', colour: 'bark', name: 'Field hoodie' });
  assert.equal(s.piece_id, PID); assert.equal(s.studio, `https://hub.test/lab/studio?concept=${PID}&view=front`);
  assert.equal(L.calls.find(c => c.url === '/v1/lab/concepts/from-recipe').body.colour, 1);
  await assert.rejects(L.tools.start_piece({ base: 'hoodie', colour_system: 'earth', colour: 'Teal' }), /has no colour "Teal": it has Clay, Bark/);
});

test('measurements: known keys only, no wild jumps, saved whole without the check', async () => {
  const L = lab(), was = L.flat().m.length;
  const r = await L.tools.set_measurements({ piece_id: PID, measurements: { length: was + .5 }, fit: 'boxy' });
  assert.deepEqual(r.changed, [`length ${was} → ${was + .5} in`, 'fit regular → boxy']);
  const put = L.calls.find(c => c.method === 'PUT'); assert.equal(put.body.m.length, was + .5); assert.equal(put.body.fit, 'boxy'); assert.ok(!('check' in put.body) && !('saved' in put.body));
  await assert.rejects(L.tools.set_measurements({ piece_id: PID, measurements: { wingspan: 30 } }), /"wingspan" is not a measurement/);
  await assert.rejects(L.tools.set_measurements({ piece_id: PID, measurements: { length: 80 } }), /more than the Lab moves a measurement at once/);
  await assert.rejects(L.tools.set_measurements({ piece_id: 'x', measurements: {} }), /not a piece id/);
});

test('a logo goes where that spot usually takes it, sized to its own shape, on the piece\'s usual technique', async () => {
  const L = lab(), r = await L.tools.place_logo({ piece_id: PID, mark: 'word', where: 'left chest' });
  const q = L.flat().placements[0];
  assert.equal(q.mark, 'word'); assert.equal(q.view, 'front'); assert.ok(q.x > 0, 'on the wearer\'s left'); assert.ok(q.w / q.h > 5, 'a wordmark is wide');
  assert.equal(q.techniqueId, 't1'); assert.equal(r.placed.name, 'Wordmark');
  await L.tools.place_logo({ piece_id: PID, mark: 'mark', where: 'back', width_in: 6 }); const b = L.flat().placements[1];
  assert.equal(b.view, 'back'); assert.equal(b.w, 6);
  await assert.rejects(L.tools.place_logo({ piece_id: PID, mark: 'emoji' }), /mark is mark, word or lockup/);
});

test('check_piece finds what the flats check finds, and apply_fixes clears it and saves', async () => {
  const p = defaultParams('hoodie'), over = { id: 'a', name: 'Wordmark', view: 'front', x: 9, y: 8, w: 6, h: 1, mark: 'word', techniqueId: 't1' };
  assert.ok(placementChecks(over, p, {}).some(f => f.code === 'OVER_EDGE'));
  const L = lab({ flat: { ...p, placements: [over], saved: true } });
  const before = await L.tools.check_piece({ piece_id: PID });
  assert.equal(before.can_be_made, false); assert.equal(before.problems[0].fix, 'Fit it in'); assert.equal(L.calls.filter(c => c.method === 'PUT').length, 0, 'only looking saves nothing');
  const after = await L.tools.check_piece({ piece_id: PID, apply_fixes: true });
  assert.equal(after.can_be_made, true); assert.match(after.fixed[0], /^Wordmark moved .* toward the wearer's right\.$/);
  assert.ok(L.flat().placements[0].x < 9, 'saved where it was moved to');
});

test('make_tech_pack: the twist in the user\'s words, approval, then the pack; what only a person decides stays with them', async () => {
  const L = lab();
  await assert.rejects(L.tools.make_tech_pack({ piece_id: PID, twist: 'nice' }), /15 characters or more/);
  const r = await L.tools.make_tech_pack({ piece_id: PID, twist: 'Clay-dyed fleece with the wordmark across the chest' });
  assert.deepEqual(L.calls.filter(c => c.method !== 'GET').map(c => `${c.method} ${c.url.replace(PID, ':id')}`), ['PUT /v1/lab/concepts/:id', 'POST /v1/lab/concepts/:id/approve', 'POST /v1/lab/concepts/:id/tech-pack']);
  assert.equal(r.tech_pack, `https://hub.test/tech-packs/${PROD}`);
  const C = lab({ approve: { status: 422, json: { error: 'The flats check found 1 problem.', code: 'CANNOT_MAKE' } } });
  await assert.rejects(C.tools.make_tech_pack({ piece_id: PID, twist: 'Clay-dyed fleece with the wordmark across the chest' }), /found 1 problem\. Run check_piece with apply_fixes: true/);
  assert.ok(!C.calls.some(c => c.url.endsWith('/tech-pack')), 'no pack without approval');
  const T = lab({ approve: { status: 422, json: { error: 'Too close.', code: 'TOO_CLOSE' } } });
  await assert.rejects(T.tools.make_tech_pack({ piece_id: PID, twist: 'Clay-dyed fleece with the wordmark across the chest' }), /That is the user's call/);
});

test('asking Future Basics to make it needs the user\'s yes and a tech pack', async () => {
  const L = lab();
  await assert.rejects(L.tools.ask_us_to_make_it({ piece_id: PID, quantity: 100 }), /confirm: true/);
  await assert.rejects(L.tools.ask_us_to_make_it({ piece_id: PID, confirm: true }), /make_tech_pack first/);
  await L.tools.make_tech_pack({ piece_id: PID, twist: 'Clay-dyed fleece with the wordmark across the chest' });
  const r = await L.tools.ask_us_to_make_it({ piece_id: PID, quantity: 150, confirm: true, note: 'Spring drop' });
  assert.equal(r.requested, true); const req = L.calls.find(c => c.url.endsWith('/make-request'));
  assert.equal(req.body.qty, 150); assert.match(req.body.note, /Spring drop\n\(Sent from the room's AI tool\)/);
});

// ---- the routes ----
const ROOM = 'aaaaaaaa-2222-4333-8444-555555555555', USER = 'bbbbbbbb-2222-4333-8444-555555555555', KEYID = 'cccccccc-2222-4333-8444-555555555555';
async function server({ role = 'client', revoked = false } = {}) {
  const secret = new TextEncoder().encode('test-secret-test-secret-test-secret'), key = KEY_PREFIX + 'abcdefghijklmnopqrstuvwxyz012345', keys = [], acts = [];
  const pool = { query: async (sql, args = []) => {
    if (/from ai_keys k join users u/.test(sql)) return { rows: !revoked && args[0] === hashKey(key) ? [{ id: KEYID, client_id: ROOM, user_id: USER, role, email: 'a@example.test', slug: 'room' }] : [] };
    if (/^update ai_keys set last_used_at/.test(sql)) return { rows: [] };
    if (/select count\(\*\)::int n from ai_keys/.test(sql)) return { rows: [{ n: keys.length }] };
    if (/^insert into ai_keys/.test(sql)) { const r = { id: KEYID, client_id: args[0], user_id: args[1], name: args[2], prefix: args[3], hash: args[4], calls: 0, created_at: new Date() }; keys.push(r); return { rows: [r] }; }
    if (/^insert into activities/.test(sql)) { acts.push(args); return { rows: [] }; }
    if (/from ai_keys k left join users/.test(sql)) return { rows: keys };
    return { rows: [] };
  } };
  const app = Fastify();
  const authenticate = async (req, reply) => { try { req.auth = (await jwtVerify(String(req.headers.authorization || '').replace(/^Bearer /, ''), secret, { issuer: 'future-basics-client-hub' })).payload; } catch { return reply.code(401).send({ error: 'no' }); } };
  // a Lab route standing in for the real ones: it answers with the session it was called on
  app.get('/v1/lab/recipe', { preHandler: authenticate }, async req => ({ bases: [{ id: 'tee', label: `for ${req.auth.clientId} as ${req.auth.sub} via ${req.auth.via}`, styleLabel: 'Tee', category: 'tops', addons: [] }], addons: [], systems: [] }));
  registerMcpRoutes(app, { pool, secret, authenticate, hubUrl: () => 'https://hub.test', log: { warn() {} } });
  const mcp = (body, k = key) => app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${k}`, 'content-type': 'application/json' }, payload: body });
  return { app, mcp, key, keys, acts, secret };
}

test('the connector: a key or nothing, the MCP handshake, tools listed and called as the key\'s person in its room', async () => {
  const S = await server();
  assert.equal((await S.mcp({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'fbk_wrong')).statusCode, 401);
  assert.match((await S.mcp({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'fbk_wrong')).headers['www-authenticate'], /Bearer/);
  const init = (await S.mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })).json();
  assert.equal(init.result.protocolVersion, '2025-03-26'); assert.ok(init.result.capabilities.tools); assert.match(init.result.instructions, /list_recipe/);
  assert.equal((await S.mcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } })).json().result.protocolVersion, MCP_PROTOCOLS[0]);
  assert.equal((await S.mcp({ jsonrpc: '2.0', method: 'notifications/initialized' })).statusCode, 202);
  assert.equal((await S.mcp({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json().result.tools.length, 10);
  const r = (await S.mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_recipe', arguments: {} } })).json();
  assert.equal(r.result.isError, false); assert.match(r.result.content[0].text, new RegExp(`for ${ROOM} as ${USER} via ai-key`));
  assert.equal((await S.mcp({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'drop_tables' } })).json().error.code, -32602);
  assert.equal((await S.mcp({ jsonrpc: '2.0', id: 5, method: 'resources/list' })).json().error.code, -32601);
  assert.equal((await S.mcp([{ jsonrpc: '2.0', id: 6, method: 'ping' }])).json().error.code, -32600);
  const failed = (await S.mcp({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'get_piece', arguments: { piece_id: 'nope' } } })).json().result;
  assert.equal(failed.isError, true); assert.match(failed.content[0].text, /not a piece id/);
  assert.equal((await S.app.inject({ method: 'GET', url: '/mcp' })).statusCode, 405);
});

test('a key off, or held by staff, opens nothing', async () => {
  assert.equal((await (await server({ revoked: true })).mcp({ jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode, 401);
  assert.equal((await (await server({ role: 'admin' })).mcp({ jsonrpc: '2.0', id: 1, method: 'ping' })).statusCode, 401, 'a key is a room\'s, never staff\'s');
});

test('keys are made by a room\'s team, shown once, and only their hash is kept', async () => {
  const { SignJWT } = await import('jose'); const S = await server();
  const as = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuer('future-basics-client-hub').setIssuedAt().setExpirationTime('5m').sign(S.secret);
  const client = await as({ sub: USER, clientId: ROOM, role: 'client' });
  const r = await S.app.inject({ method: 'POST', url: '/v1/ai-keys', headers: { authorization: `Bearer ${client}`, 'content-type': 'application/json' }, payload: { name: 'Claude' } });
  assert.equal(r.statusCode, 201); const out = r.json();
  assert.ok(out.key.startsWith(KEY_PREFIX)); assert.equal(S.keys[0].hash, hashKey(out.key)); assert.ok(!JSON.stringify(S.keys).includes(out.key), 'the key itself is not stored');
  assert.equal(out.endpoint, 'https://hub.test/mcp'); assert.match(out.connect.claudeCode, /claude mcp add --transport http future-basics https:\/\/hub\.test\/mcp --header "Authorization: Bearer fbk_/);
  assert.deepEqual(out.connect.claudeDesktop.mcpServers['future-basics'].args.slice(0, 3), ['-y', 'mcp-remote', 'https://hub.test/mcp']);
  const list = (await S.app.inject({ method: 'GET', url: '/v1/ai-keys', headers: { authorization: `Bearer ${client}` } })).json();
  assert.equal(list.keys.length, 1); assert.ok(!('key' in list.keys[0]) && !('hash' in list.keys[0]));
  const staff = await as({ sub: USER, role: 'admin' });
  assert.equal((await S.app.inject({ method: 'POST', url: '/v1/ai-keys', headers: { authorization: `Bearer ${staff}`, 'content-type': 'application/json' }, payload: {} })).statusCode, 403);
});

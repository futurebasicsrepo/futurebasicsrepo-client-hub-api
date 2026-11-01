// Every API route needs a sign-in, unless it is on the list below with the reason it is open.
//
// The scan reads every route declared in src/*.js. A route is guarded when its options carry a preHandler (inline, or an options object
// such as `guard` / `pre` defined in the same file with one). Anything else must match an entry here; a new open route fails this test
// until someone adds it with a reason, so a route never goes out open by accident. Which room a signed-in person can reach is checked by
// the journeys (J232, J271 and others); this test is the first line: no route without a sign-in at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const OPEN = [
  [/^\/v1\/auth\//, 'signing in itself (codes are throttled per email and per address)'],
  [/^\/v1\/builds(\/|$)/, 'the Builds showcase checks its own viewer session inside each route (needViewer)'],
  [/^\/v1\/chat\//, 'the visitor chat widget: its own visitor token and limits'],
  [/^\/v1\/public\//, 'public by name: forms with throttles, or a token in the path that is the key'],
  [/^\/v1\/(tp|factory)\/:token(\/|$)/, 'a factory link: the unguessable token is the key'],
  [/^\/v1\/lab\/(share|poll)\/:token(\/|$)/, 'a share or poll link: the unguessable token is the key'],
  [/^\/v1\/invite\/:code$/, 'an invitation: the code is the key'],
  [/^\/v1\/preview\/session\/exchange$/, 'a one-time preview code, hashed, consumed on use, with an expiry'],
  [/^\/v1\/stripe\/webhook$/, 'Stripe: the signature on the body is checked'],
  [/^\/v1\/(shopify\/callback|money\/quickbooks\/callback)$/, 'OAuth callbacks: the state we issued is checked'],
  [/^\/v1\/dev\//, 'development helpers: 404 unless a development flag is set'],
  [/^\/v1\/(pricing|public\/config)$/, 'public information for the pricing and sign-in pages']
];

function routes() {
  const dir = new URL('../src/', import.meta.url), out = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith('.js'))) {
    const s = readFileSync(new URL(f, dir), 'utf8');
    const re = /\bapp\.(get|post|put|patch|delete|head|all)\(\s*(['"`])(\/v1\/[^'"`]*)\2\s*,\s*([^\n]{0,240})/g; let m;
    while ((m = re.exec(s))) {
      const opts = m[4], id = /^([A-Za-z_$][\w$]*)\s*,/.exec(opts)?.[1];
      const guarded = /^\{[^}]*preHandler/.test(opts) || (id && new RegExp(`\\b${id.replace(/\$/g, '\\$')}\\s*=\\s*\\{\\s*preHandler`).test(s));
      out.push({ file: f, method: m[1].toUpperCase(), path: m[3], guarded: Boolean(guarded) });
    }
  }
  return out;
}

test('the scan finds the routes', () => {
  const r = routes();
  assert.ok(r.length > 500, `found ${r.length}`);
  assert.ok(r.some(x => x.path === '/v1/admin/factories' && x.guarded), 'an options object defined elsewhere in the file counts');
  assert.ok(r.some(x => x.path === '/v1/lab/door' && x.guarded), 'the Lab door needs a sign-in');
});

test('every API route needs a sign-in, or is open for a stated reason', () => {
  const open = routes().filter(r => !r.guarded && !OPEN.some(([re]) => re.test(r.path)));
  assert.deepEqual(open.map(r => `${r.method} ${r.path} (${r.file})`), [], 'these routes have no sign-in and no reason to be open');
});

test('nothing for staff or the Lab is on the open list', () => {
  for (const r of routes().filter(x => /^\/v1\/(admin|money|lab|crm|staff)\//.test(x.path) && !/^\/v1\/lab\/(share|poll)\//.test(x.path) && !/^\/v1\/money\/quickbooks\/callback$/.test(x.path)))
    assert.ok(r.guarded, `${r.method} ${r.path} (${r.file}) must have a preHandler`);
});

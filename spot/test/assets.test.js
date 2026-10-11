import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { ASSETS, assetUrl } from '../src/assets.js';

test('Spot in 3D and his stills: served with a content hash, gzipped JS, cached for good', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), logger: false, env: { SPOT_AGENT: 'off' } });
  t.after(() => a.close());
  const js = await a.inject({ method: 'GET', url: assetUrl('spot3d.js'), headers: { 'accept-encoding': 'gzip, br' } });
  assert.equal(js.statusCode, 200);
  assert.equal(js.headers['content-encoding'], 'gzip');
  assert.match(js.headers['content-type'], /javascript/);
  assert.match(js.headers['cache-control'], /immutable/);
  assert.ok(js.rawPayload.length < ASSETS['spot3d.js'].body.length / 2, 'compressed');
  const img = await a.inject({ method: 'GET', url: assetUrl('spot-yay.webp') });
  assert.equal(img.headers['content-type'], 'image/webp');
  assert.equal(img.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.match((await a.inject({ method: 'GET', url: '/assets/spot-hi.webp?v=old' })).headers['cache-control'], /max-age=3600/, 'an old link is not cached for good');
  assert.equal((await a.inject({ method: 'GET', url: '/assets/server.js' })).statusCode, 404);

  // The home page loads the live plush and shows the still until then; pay pages use the stills.
  const home = (await a.inject({ method: 'GET', url: '/' })).body;
  assert.ok(home.includes(assetUrl('spot3d.js')) && home.includes(assetUrl('spot-hi.webp')));
});

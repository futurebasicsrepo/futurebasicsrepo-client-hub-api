import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';
import { readFileSync } from 'node:fs';
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

test('Spot\'s face is the logo, and the guide has his other moods', async (t) => {
  const a = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), logger: false, env: { SPOT_AGENT: 'off' } });
  t.after(() => a.close());
  for (const name of ['spot-face.webp', 'spot-face-blink.webp', 'spot-oh.webp', 'spot-sleep.webp']) {
    assert.ok(ASSETS[name], `${name} is shipped`);
    assert.equal((await a.inject({ method: 'GET', url: assetUrl(name) })).statusCode, 200);
  }
  const home = (await a.inject({ method: 'GET', url: '/' })).body;
  assert.ok(home.includes(assetUrl('spot-face.webp')) && home.includes(assetUrl('spot-face-blink.webp')), 'the nav logo is his face');
  assert.ok(home.includes(assetUrl('spot-oh.webp')) && home.includes(assetUrl('spot-sleep.webp')), 'the guide can look surprised and fall asleep');
  assert.match(home, /id="hsay"/, 'the hero Spot has a speech bubble');
  const signin = (await a.inject({ method: 'GET', url: '/signin' })).body;
  assert.ok(signin.includes(assetUrl('spot-face.webp')), 'app pages use the same face');
});

test('the production image ships the assets (the Dockerfile copies them next to src)', () => {
  const docker = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  assert.match(docker, /^COPY src \.\/src$/m);
  assert.match(docker, /^COPY assets \.\/assets$/m);
});

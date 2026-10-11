// Spot in 3D and its stills, served from /assets: the live plush for the
// home page (assets/spot3d.js, built from src/client/spot3d.js with
// `npm run build:spot3d`) and two stills rendered from the same model
// (spot-hi.webp, spot-yay.webp) for everywhere else. URLs carry a content
// hash, so they can be cached for good.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const TYPES = { js: 'text/javascript; charset=utf-8', webp: 'image/webp' };
const FILES = ['spot3d.js', 'spot-hi.webp', 'spot-yay.webp'];

// A missing file is logged and served as a 404, never a crash at start.
export const ASSETS = Object.fromEntries(
  FILES.flatMap((name) => {
    let body;
    try {
      body = readFileSync(new URL(`../assets/${name}`, import.meta.url));
    } catch (err) {
      console.error(`asset missing: assets/${name} (${err.code || err.message})`);
      return [];
    }
    const v = createHash('sha256').update(body).digest('hex').slice(0, 10);
    return [[name, { body, v, type: TYPES[name.split('.').pop()], gz: name.endsWith('.js') ? gzipSync(body, { level: 9 }) : null }]];
  }),
);

export const assetUrl = (name) => `/assets/${name}${ASSETS[name] ? `?v=${ASSETS[name].v}` : ''}`;

export function registerAssets(app) {
  app.get('/assets/:file', async (req, reply) => {
    const a = Object.hasOwn(ASSETS, req.params.file) ? ASSETS[req.params.file] : null;
    if (!a) return reply.code(404).send();
    reply.type(a.type).header('cache-control', req.query.v === a.v ? 'public, max-age=31536000, immutable' : 'public, max-age=3600').header('vary', 'accept-encoding');
    if (a.gz && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) return reply.header('content-encoding', 'gzip').send(a.gz);
    return reply.send(a.body);
  });
}

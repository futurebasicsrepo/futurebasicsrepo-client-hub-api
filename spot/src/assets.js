// Spot in 3D and its stills, served from /assets: the live plush for the
// home page (assets/spot3d.js, built from src/client/spot3d.js with
// `npm run build:spot3d`) and stills rendered from the same model for
// everywhere else: hi, yay (happy), oh (surprised), sleep, and his face on
// its own (face, face-blink) for the logo. URLs carry a content hash, so
// they can be cached for good.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const TYPES = { js: 'text/javascript; charset=utf-8', webp: 'image/webp' };
const FILES = ['spot3d.js', 'spot-hi.webp', 'spot-yay.webp', 'spot-oh.webp', 'spot-sleep.webp', 'spot-face.webp', 'spot-face-blink.webp'];

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

// The logo is Spot's face (the plush, head only). He blinks now and then,
// sometimes twice, and hops when you hover the logo. `sel` is the round mark.
export function logoFaceCss(sel) {
  return `${sel}{position:relative;background:url(${assetUrl('spot-face.webp')}) 50% 46%/116% no-repeat,var(--spot)}
${sel}::after{content:'';position:absolute;inset:0;border-radius:50%;background:url(${assetUrl('spot-face-blink.webp')}) 50% 46%/116% no-repeat,var(--spot);opacity:0;animation:spotblink 7.3s linear infinite}
@keyframes spotblink{0%,38%{opacity:0}38.3%,39.9%{opacity:1}40.2%,88%{opacity:0}88.3%,89.9%{opacity:1}90.2%,91.6%{opacity:0}91.9%,93.5%{opacity:1}93.8%,100%{opacity:0}}
a:hover>${sel}{animation:spotlogohop .55s cubic-bezier(.3,1.6,.5,1)}
@keyframes spotlogohop{0%{transform:none}30%{transform:translateY(-3px) scale(1.06,.95)}60%{transform:translateY(0) scale(.96,1.05)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){${sel}::after{animation:none}a:hover>${sel}{animation:none}}`;
}

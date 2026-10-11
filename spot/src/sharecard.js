// The image that shows when a Spot link is pasted into iMessage, WhatsApp,
// Slack, Discord, X… (og:image). Drawn per cart so every link carries Spot
// (the plush, from the 3D model: assets/card/*.png), the ask, the item and
// the price, and it flips to "covered" once someone pays. Rendered with satori (layout → SVG) and resvg (SVG → PNG)
// because messaging apps won't show SVG previews.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { assertPublicHost } from './capture.js';
import { usd } from './cart.js';

const require = createRequire(import.meta.url);
const fontFile = (w) => readFileSync(require.resolve(`@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-${w}-normal.woff`));
const FONTS = [
  { name: 'Bricolage', data: fontFile(400), weight: 400, style: 'normal' },
  { name: 'Bricolage', data: fontFile(800), weight: 800, style: 'normal' },
];

export const W = 1200;
export const H = 630;

// ─── The mascot ─────────────────────────────────────────────────────────────
// Spot is the logo dot come to life. `look` is where the pupils point (-1..1).
export function mascotSvg({ look = [0.5, 0.35], mood = 'ask', size = 200 } = {}) {
  const [lx, ly] = look;
  const px = 7 * lx;
  const py = 7 * ly;
  const eye = (cx) =>
    mood === 'happy'
      ? `<path d="M${cx - 11} 92 q11 -13 22 0" stroke="#1b1712" stroke-width="6" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="${cx}" cy="90" rx="15" ry="17" fill="#fff"/><circle cx="${cx + px}" cy="${91 + py}" r="8" fill="#1b1712"/><circle cx="${cx + px + 3}" cy="${88 + py}" r="2.6" fill="#fff"/>`;
  const mouth = mood === 'happy' ? '<path d="M82 120 q18 22 36 0" fill="#1b1712"/>' : '<path d="M88 122 q12 9 24 0" stroke="#1b1712" stroke-width="5" fill="none" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
<ellipse cx="100" cy="186" rx="52" ry="8" fill="#1b1712" opacity=".10"/>
<circle cx="100" cy="100" r="78" fill="#ff5a36"/>
<circle cx="72" cy="68" r="20" fill="#fff" opacity=".18"/>
${eye(78)}${eye(122)}
<circle cx="60" cy="116" r="9" fill="#ff9a7e"/><circle cx="140" cy="116" r="9" fill="#ff9a7e"/>
${mouth}</svg>`;
}

// Spot the plush (stills from the 3D model) and his face for the wordmark.
const png = (f) => `data:image/png;base64,${readFileSync(new URL(`../assets/card/${f}`, import.meta.url)).toString('base64')}`;
const PLUSH = { ask: png('spot-ask.png'), yay: png('spot-yay.png'), face: png('spot-face.png') };

const dataUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

// Satori takes a React-like element tree; this keeps it readable without JSX.
const h = (type, style, ...children) => ({ type, props: { style: { display: 'flex', ...style }, children: children.flat().filter((c) => c !== null && c !== false) } });
const img = (src, style) => ({ type: 'img', props: { src, style } });

const BAG = dataUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f3ebe0"/>
<path d="M28 38h44l-4 42H32z" fill="#ff5a36"/><path d="M40 40v-8a10 10 0 0 1 20 0v8" stroke="#1b1712" stroke-width="4" fill="none"/></svg>`);

// ─── Card ───────────────────────────────────────────────────────────────────
export async function renderShareCard(cart, { productImage } = {}) {
  const covered = !['open', 'expired', 'canceled'].includes(cart.status);
  const first = cart.items[0];
  const more = cart.items.length - 1;
  const itemTitle = first.title.length > 42 ? `${first.title.slice(0, 40)}…` : first.title;
  const name = cart.requester.name;

  const bubble = covered
    ? `${cart.payer_name ? cart.payer_name : 'Someone'} spotted ${name}!`
    : `psst… can you spot ${name}?`;

  const tree = h(
    'div',
    { width: W, height: H, background: '#fbf7f1', fontFamily: 'Bricolage', color: '#1b1712', position: 'relative', overflow: 'hidden' },
    // warm light behind Spot and the card
    h('div', { position: 'absolute', left: -160, top: 250, width: 640, height: 640, borderRadius: 999, backgroundImage: 'radial-gradient(circle, #ffd9c4 0%, rgba(255,217,196,0) 70%)' }),
    h('div', { position: 'absolute', right: -140, top: -200, width: 640, height: 640, borderRadius: 999, backgroundImage: 'radial-gradient(circle, #fff0d6 0%, rgba(255,240,214,0) 70%)' }),

    // left: the ask, and Spot
    h(
      'div',
      { position: 'absolute', left: 64, top: 58, width: 540, flexDirection: 'column' },
      h(
        'div',
        { background: '#1b1712', color: '#fbf7f1', fontSize: 48, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.6, padding: '24px 30px', borderRadius: 34, maxWidth: 520 },
        bubble,
      ),
      // bubble tail, pointing down at Spot
      h('div', { marginLeft: 120, marginTop: -20, width: 38, height: 38, background: '#1b1712', transform: 'rotate(45deg)', borderRadius: 6 }),
      img(covered ? PLUSH.yay : PLUSH.ask, { width: 262, height: 293, marginTop: -26, marginLeft: 40 }),
    ),

    // right: the item
    h(
      'div',
      {
        position: 'absolute', right: 66, top: 74, width: 470, flexDirection: 'column', background: '#fff', borderRadius: 32,
        padding: 24, boxShadow: '0 30px 60px -20px rgba(27,23,18,.30)', transform: 'rotate(2.5deg)', border: '2px solid #efe6da',
      },
      img(productImage || BAG, { width: 422, height: 272, objectFit: 'cover', borderRadius: 20, background: '#f3ebe0' }),
      h('div', { fontSize: 30, fontWeight: 800, marginTop: 20, lineHeight: 1.15, letterSpacing: -0.6 }, itemTitle),
      h('div', { fontSize: 23, color: '#7a7166', marginTop: 6 }, `${cart.merchant.name}${more > 0 ? ` · +${more} more` : ''}`),
      h(
        'div',
        { marginTop: 18, alignItems: 'center', justifyContent: 'space-between' },
        h('div', { fontSize: 46, fontWeight: 800, letterSpacing: -1.2 }, usd(cart.cart_cents).replace(/\.00$/, '')),
        h(
          'div',
          {
            color: '#fff', fontSize: 25, fontWeight: 800, padding: '13px 24px', borderRadius: 999, letterSpacing: 0.2,
            backgroundImage: covered ? 'linear-gradient(#2bb56a, #1d8a52)' : 'linear-gradient(#ff8a5e, #ff5a36 55%, #f04a26)',
            boxShadow: covered ? '0 5px 0 #146a3e' : '0 5px 0 #b8391c',
          },
          covered ? 'Spotted!' : 'Tap to spot',
        ),
      ),
    ),

    // wordmark: Spot's face, like the site's logo
    h(
      'div',
      { position: 'absolute', left: 64, bottom: 38, alignItems: 'center', fontSize: 30, fontWeight: 800, letterSpacing: -0.8 },
      img(PLUSH.face, { width: 40, height: 40, borderRadius: 999, marginRight: 12, boxShadow: '0 0 0 6px rgba(255,90,54,.16)' }),
      'Spot',
      h('div', { fontSize: 22, fontWeight: 400, color: '#9a8f81', marginLeft: 16, letterSpacing: 0 }, 'spotmeplease.com'),
    ),
  );

  const svg = await satori(tree, { width: W, height: H, fonts: FONTS });
  return new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
}

// Fetch the product photo ourselves (with the same SSRF guard as capture)
// and inline it, so rendering never depends on a slow or hostile host.
export async function fetchProductImage(url, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (!allowPrivate) await assertPublicHost(u.hostname);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetchImpl(u, { signal: ctrl.signal, redirect: 'error' });
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!res.ok || !['image/png', 'image/jpeg'].includes(type)) return null;
      const chunks = [];
      let size = 0;
      for await (const c of res.body || []) {
        size += c.length;
        if (size > 4_000_000) return null;
        chunks.push(Buffer.from(c));
      }
      const buf = Buffer.concat(chunks);
      return `data:${type};base64,${buf.toString('base64')}`;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

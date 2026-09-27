// The image that shows when a Spot link is pasted into iMessage, WhatsApp,
// Slack, Discord, X… (og:image). Drawn per cart so every link carries the
// mascot, the ask, the item and the price, and it flips to "covered" once
// someone pays. Rendered with satori (layout → SVG) and resvg (SVG → PNG)
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
    // soft blobs
    h('div', { position: 'absolute', left: -120, top: 330, width: 520, height: 520, borderRadius: 999, background: '#ffe3d8' }),
    h('div', { position: 'absolute', right: -80, top: -140, width: 420, height: 420, borderRadius: 999, background: '#fff0c9' }),

    // left: mascot + speech
    h(
      'div',
      { position: 'absolute', left: 64, top: 70, width: 520, flexDirection: 'column' },
      h(
        'div',
        { background: '#1b1712', color: '#fbf7f1', fontSize: 50, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, padding: '26px 32px', borderRadius: 36, maxWidth: 500 },
        bubble,
      ),
      // bubble tail, pointing down at the mascot
      h('div', { marginLeft: 92, marginTop: -22, width: 40, height: 40, background: '#1b1712', transform: 'rotate(45deg)', borderRadius: 6 }),
      img(dataUri(mascotSvg({ look: covered ? [0, 0] : [0.9, 0.3], mood: covered ? 'happy' : 'ask', size: 250 })), { width: 250, height: 250, marginTop: 6 }),
    ),

    // right: the item
    h(
      'div',
      {
        position: 'absolute', right: 70, top: 78, width: 470, flexDirection: 'column', background: '#fff', borderRadius: 34,
        padding: 26, boxShadow: '0 24px 60px rgba(27,23,18,.14)', transform: 'rotate(2.5deg)', border: '2px solid #efe6da',
      },
      img(productImage || BAG, { width: 418, height: 280, objectFit: 'cover', borderRadius: 22, background: '#f3ebe0' }),
      h('div', { fontSize: 30, fontWeight: 800, marginTop: 20, lineHeight: 1.15, letterSpacing: -0.5 }, itemTitle),
      h('div', { fontSize: 24, color: '#6f675c', marginTop: 6 }, `${cart.merchant.name}${more > 0 ? ` · +${more} more` : ''}`),
      h(
        'div',
        { marginTop: 18, alignItems: 'center', justifyContent: 'space-between' },
        h('div', { fontSize: 44, fontWeight: 800, letterSpacing: -1 }, usd(cart.cart_cents).replace(/\.00$/, '')),
        h(
          'div',
          { background: covered ? '#1d8a52' : '#ff5a36', color: '#fff', fontSize: 26, fontWeight: 800, padding: '12px 22px', borderRadius: 999 },
          covered ? 'Covered' : 'Tap to spot',
        ),
      ),
    ),

    // wordmark
    h(
      'div',
      { position: 'absolute', left: 64, bottom: 40, alignItems: 'center', fontSize: 30, fontWeight: 800, letterSpacing: -0.5 },
      h('div', { width: 22, height: 22, borderRadius: 999, background: '#ff5a36', marginRight: 10 }),
      'spot',
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
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 4_000_000) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

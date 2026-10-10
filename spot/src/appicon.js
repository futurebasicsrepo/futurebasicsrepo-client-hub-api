// Spot on your home screen: the mascot as the app icon, and the web app
// manifest that lets phones add spotmeplease.com as an app.
import { Resvg } from '@resvg/resvg-js';
import { mascotSvg } from './sharecard.js';

export const CREAM = '#fbf7f1';
export const BRAND = '#ff5a36';

// The mascot on a square tile. `fill` is how much of the tile the face
// takes up: maskable icons keep it inside Android's 80% safe circle.
export function appIconSvg({ bg = CREAM, fill = 0.84 } = {}) {
  const face = mascotSvg({ look: [0.3, 0.2] }).replace(/<ellipse cx="100" cy="186"[^>]*\/>\n?/, '');
  const inner = face.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  // The face is a circle of radius 78 at (100,100); scale it to `fill` of a 200 tile.
  const s = (200 * fill) / 156;
  const t = 100 - 100 * s;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${bg ? `<rect width="200" height="200" fill="${bg}"/>` : ''}<g transform="translate(${t} ${t}) scale(${s})">${inner}</g></svg>`;
}

const cache = new Map();
export function appIconPng(size, opts = {}) {
  const key = `${size}:${JSON.stringify(opts)}`;
  if (!cache.has(key)) cache.set(key, new Resvg(appIconSvg(opts), { fitTo: { mode: 'width', value: size } }).render().asPng());
  return cache.get(key);
}

export function manifest() {
  return {
    name: 'Spot Me Please',
    short_name: 'Spot',
    description: 'Your Spots, your AI, and everything ready for you to finish.',
    id: '/account',
    start_url: '/account?from=home',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: CREAM,
    theme_color: BRAND,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'New Spot', short_name: 'New', url: '/new', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'My Spots', short_name: 'Spots', url: '/account#spots', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

// Tags every page carries so "Add to Home Screen" gets the mascot, the name
// and a full-screen app.
export const HOME_SCREEN_TAGS = `<link rel="manifest" href="/manifest.webmanifest"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Spot"><meta name="apple-mobile-web-app-status-bar-style" content="default">`;

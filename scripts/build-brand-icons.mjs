// Writes the hub's own icon files from the brand kit, so the favicon, the home-screen icon and the link-preview picture are always the current mark.
//   node scripts/build-brand-icons.mjs
// (The Tech Pack app keeps its own icons, techpack-v3-*, and og-join.png is its own designed card.)
import { writeFileSync } from 'node:fs';
import { assetFile } from '../src/brand-kit.js';
const out = new URL('../src/icons/', import.meta.url);
const map = { 'icon-192.png': 'icon-192.png', 'icon-maskable-512.png': 'icon-maskable-512.png', 'apple-touch-icon-180.png': 'apple-touch-icon.png', 'future-basics-icon-ink-512.png': 'icon-512.png', 'future-basics-icon-ink.svg': 'icon.svg', 'link-preview-1200x630.png': 'og-brand.png' };
for (const [from, to] of Object.entries(map)) { const a = await assetFile(from); writeFileSync(new URL(to, out), a.buffer); console.log(to, a.buffer.length); }

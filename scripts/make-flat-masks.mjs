// Makes each flat sketch's silhouette ahead of time (src/flat-templates/masks/<sketch>.png), so the flats colour the garment the moment a
// sketch is opened instead of waiting while it is worked out. Run after adding or changing sketches: npm run flat-masks
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { bodyMask } from '../src/lab-flat-mask.js';
const dir = new URL('../src/flat-templates/', import.meta.url), out = new URL('../src/flat-templates/masks/', import.meta.url), all = process.argv.includes('--all');
let made = 0;
for (const f of readdirSync(dir).filter(f => f.endsWith('.svg')).sort()) {
  const target = new URL(f.replace(/\.svg$/, '.png'), out); if (!all && existsSync(target)) continue;
  writeFileSync(target, await bodyMask(readFileSync(new URL(f, dir)))); made++;
}
console.log(`${made} silhouette${made === 1 ? '' : 's'} made`);

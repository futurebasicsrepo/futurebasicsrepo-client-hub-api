// Applies the chests read by eye (chest-fixes.tsv) to the templates already in src/lab-flat-templates.js, without the purchased pack build.mjs
// needs: each listed view is found on its page again (matched to its box by position, as clips.mjs does) and measured again around its chest,
// so its shoulder line, its high point of the shoulder and its length ratio follow it. Its box, centre line and outline are kept.
//   node scripts/flat-templates/chests.mjs [template id,...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskOf, views, measure, collarOf, chestFixes } from './shapes.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), MOD = join(ROOT, 'src', 'lab-flat-templates.js');
const KIND = { bikini: 'bikini', pants: 'bottom', shorts: 'bottom', skirt: 'bottom', leggings: 'bottom', cap: 'cap', bucket: 'cap' };
const FIXES = chestFixes(), only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const lines = readFileSync(MOD, 'utf8').split('\n'); let done = 0, missed = 0;
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('{"id"')) continue;
  const comma = lines[i].endsWith(','), t = JSON.parse(comma ? lines[i].slice(0, -1) : lines[i]), fix = FIXES.get(t.id);
  if (!fix || (only && !only.has(t.id))) continue;
  const M = await maskOf(join(ROOT, 'src', 'flat-templates', t.file)), { comps, lab } = views(M);
  const X = v => v / M.k + M.vb[0], Y = v => v / M.k + M.vb[1];
  for (const [name, v] of Object.entries(t.views)) {
    if (!fix[name]) continue;
    const c = comps.find(q => Math.abs(X(q.x0) - v.box[0]) < .6 && Math.abs(Y(q.y0) - v.box[1]) < .6 && Math.abs((q.x1 - q.x0 + 1) / M.k - v.box[2]) < .6 && Math.abs((q.y1 - q.y0 + 1) / M.k - v.box[3]) < .6);
    if (!c) { missed++; console.log('not found on its page', t.id, name); continue; }
    const m = measure(M, lab, c, KIND[t.style] || 'top', collarOf(t.style, t.label), fix[name]);
    for (const k of ['chest', 'hpsY', 'shoulderY', 'hemY', 'topY', 'ratio']) if (m[k] != null) v[k] = m[k];
    done++; console.log(t.id, name, JSON.stringify({ chest: v.chest, hpsY: v.hpsY, shoulderY: v.shoulderY, ratio: v.ratio }));
  }
  lines[i] = JSON.stringify(t) + (comma ? ',' : '');
}
writeFileSync(MOD, lines.join('\n'));
console.log(`views measured again: ${done}, not found: ${missed}`);

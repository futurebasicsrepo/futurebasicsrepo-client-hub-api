// Re-cuts each view's outline (its `clip`) from the sketches already in src/flat-templates/, without the purchased pack build.mjs needs:
// the views are found on each page again and matched to the boxes in src/lab-flat-templates.js by position. A view that cannot be matched
// (a bikini's pieces put together, a front and back drawn overlapping) keeps the outline it has.
//   node scripts/flat-templates/clips.mjs [template id,...]
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskOf, views, outlineOf } from './shapes.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'), MOD = join(ROOT, 'src', 'lab-flat-templates.js');
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const lines = readFileSync(MOD, 'utf8').split('\n'); let done = 0, kept = 0;
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('{"id"')) continue;
  const comma = lines[i].endsWith(','), t = JSON.parse(comma ? lines[i].slice(0, -1) : lines[i]); if (only && !only.has(t.id)) continue;
  const M = await maskOf(join(ROOT, 'src', 'flat-templates', t.file)), { comps, lab } = views(M);
  const X = v => v / M.k + M.vb[0], Y = v => v / M.k + M.vb[1];
  for (const [name, v] of Object.entries(t.views)) {
    const c = comps.find(q => Math.abs(X(q.x0) - v.box[0]) < .6 && Math.abs(Y(q.y0) - v.box[1]) < .6 && Math.abs((q.x1 - q.x0 + 1) / M.k - v.box[2]) < .6 && Math.abs((q.y1 - q.y0 + 1) / M.k - v.box[3]) < .6);
    const clip = c && outlineOf(M, lab, c); if (clip && clip.length >= 3) { v.clip = clip; done++; } else { kept++; console.log('kept', t.id, name); }
  }
  lines[i] = JSON.stringify(t) + (comma ? ',' : '');
}
writeFileSync(MOD, lines.join('\n'));
console.log(`outlines re-cut: ${done}, kept as they were: ${kept}`);

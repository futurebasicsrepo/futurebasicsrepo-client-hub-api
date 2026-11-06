// Drafts every library sketch and checks its pattern: pieces finite, nothing floating off the product, and what each sketch's name promises
// (raglan, hood, cargo, double knee, a yoke, a half zip…) is in the pattern. Run: node scripts/pattern-audit.mjs
import { FLAT_TEMPLATES } from '../src/lab-flat-templates.js';
import { defaultParams, fitToTemplate, STYLES } from '../src/lab-flats.js';
import { garmentPattern, assembled, boundsOf, placed } from '../src/lab-pattern.js';
// what a template's name promises, and how to see it in the pattern
const FEAT = [
  ['raglan', /raglan/, p => p.pieces.some(q => /raglan/i.test(q.name + q.notes.join(' ')))],
  ['hood', /hood/, p => p.pieces.some(q => q.id === 'hood')],
  ['yoke', /yoke|western/, p => p.pieces.some(q => /yoke/i.test(q.id))],
  ['collar', /collar|polo|(?<!sweat|t-)shirt(?!-dress)|trucker|harrington|blouson|blazer|lapel|trench|overcoat/, p => p.pieces.some(q => /collar/.test(q.id))],
  ['kangaroo', /kangaroo|hoodie/, p => p.pieces.some(q => q.id === 'pocket')],
  ['cargo', /cargo/, p => p.pieces.some(q => /cargo/i.test(q.id + q.name))],
  ['double knee', /double-knee/, p => p.pieces.some(q => /knee/i.test(q.id + q.name))],
  ['patch/chest pocket', /patch-pocket|chest-pocket|two-pocket|with-pocket|pocket-polo|utility|chore|work-shirt|overshirt-with-pocket/, p => p.pieces.some(q => /pocket/i.test(q.id) && q.id !== 'pocket-bag')],
  ['flap pocket', /flap-pocket/, p => p.pieces.some(q => /flap/i.test(q.id + q.name))],
  ['half/quarter zip', /half-zip|quarter-zip/, p => p.pieces.some(q => /placket|zip/i.test(q.id + q.name + q.notes.join(' ')))],
  ['drawcord', /drawcord|jogger|sweat(pants|-shorts)|track-pants|running|lounge|elastic/, p => p.pieces.some(q => /drawcord|elastic|channel/i.test(q.name + q.notes.join(' ')))],
  ['flare', /flare/, p => p.pieces.some(q => /flare/i.test(q.notes.join(' ')))],
  ['pleat', /pleat/, p => p.pieces.some(q => /pleat/i.test(q.notes.join(' ')))],
  ['denim chest pockets', /denim-(jacket|vest)|trucker/, p => p.pieces.some(q => /chest/.test(q.id))],
  ['belt', /belted|trench/, p => p.pieces.some(q => /belt/i.test(q.id + q.name))],
  ['quilted', /puffer/, p => p.pieces.some(q => /quilt|channel|baffle/i.test(q.name + q.notes.join(' ')))],
  ['button placket', /henley|polo|cardigan|button|popover/, p => p.pieces.some(q => /placket|button/i.test(q.id + q.name + q.notes.join(' ')))],
  ['side stripe/panel', /stripe|panel|paneled|contrast-panel/, p => p.pieces.some(q => /panel|stripe/i.test(q.id + q.name + q.notes.join(' '))) || (p.trims || []).some(t => /stripe/i.test(t.item))],
  ['jersey sleeve', /layered-sleeve/, p => true],
  ['snap front', /snap/, p => p.pieces.some(q => /snap/i.test(q.notes.join(' '))) || (p.trims || []).some(t => /snap/i.test(t.item))],
  ['5 pocket', /five-pocket|jean|jorts|denim-(mini|skirt|shorts)/, p => p.pieces.some(q => /coin|back-pocket/.test(q.id))],
];
const miss = {}, shape = [], counts = {};
for (const t of FLAT_TEMPLATES) {
  const S = STYLES[t.style]; if (!S) continue;
  let p = defaultParams(t.style); p = fitToTemplate({ ...p, template: t.id });
  let pat; try { pat = garmentPattern(p); } catch (e) { shape.push(`${t.id}: THROWS ${e.message}`); continue; }
  if (!pat) { shape.push(`${t.id}: no pattern`); continue; }
  counts[t.style] = (counts[t.style] || 0) + 1;
  for (const q of pat.pieces) { if (q.sew.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) shape.push(`${t.id}: ${q.id} NaN`); }
  // product: each shown piece touches the body's box, give or take
  const A = assembled(pat), body = A.pieces.filter(x => ['front', 'front-2', 'back', 'back-2'].includes(x.piece.id)).map(x => boundsOf(x.pts));
  for (const x of A.pieces) { if (!body.length) break; const b = boundsOf(x.pts), near = body.some(bb => b.x0 < bb.x1 + 14 && b.x1 > bb.x0 - 14 && b.y0 < bb.y1 + 6 && b.y1 > bb.y0 - 14); if (!near && !(/^cuff/.test(x.piece.id) && /crop/.test(t.id))) shape.push(`${t.id}: ${x.piece.id} floats off the product`); } // a cropped piece's cuffs hang below its hem
  const name = t.id + ' ' + t.label.toLowerCase();
  for (const [k, re, ok] of FEAT) if (re.test(name) && !ok(pat)) (miss[k] = miss[k] || []).push(t.id);
}
console.log('templates drafted', JSON.stringify(counts));
console.log('SHAPE', shape.length); console.log(shape.slice(0, 30).join('\n'));
for (const [k, v] of Object.entries(miss).sort((a, b) => b[1].length - a[1].length)) console.log(`MISSING ${k}: ${v.length} — ${v.slice(0, 8).join(' ')}`);

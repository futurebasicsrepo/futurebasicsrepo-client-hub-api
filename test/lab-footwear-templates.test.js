import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { LIBRARY, TYPES, CONSTRUCTIONS, MARKET } from '../scripts/footwear-templates/catalogue.mjs';
import { FOOTWEAR_TEMPLATES } from '../src/lab-footwear-templates.js';
import { FW_STYLES } from '../src/lab-footwear.js';
import { libraryShoe, libraryOf, recolourBody } from '../src/lab-shoe-draw-routes.js';

test('the footwear catalogue: every shoe has a known type, construction and closure, a pattern style that exists (or a new one named), and a priority; every type has a market note', () => {
  const ids = new Set(LIBRARY.map(e => e.id)); assert.equal(ids.size, LIBRARY.length, 'ids are unique');
  for (const e of LIBRARY) {
    assert.match(e.id, /^footwear-[a-z]+-[a-z0-9-]+$/); assert.ok(TYPES[e.type], `${e.id} type`); assert.ok(CONSTRUCTIONS[e.construction], `${e.id} construction`);
    assert.ok(['lace', 'slip-on', 'elastic', 'strap', 'buckle', 'hook-and-loop', 'zip', 'toggle', 'none'].includes(e.closure), `${e.id} closure`);
    assert.ok(['low', 'mid', 'high', 'calf', 'knee'].includes(e.height), `${e.id} height`); assert.ok([1, 2, 3].includes(e.priority), `${e.id} priority`);
    assert.ok(e.pattern.startsWith('new:') || FW_STYLES[e.pattern], `${e.id} pattern ${e.pattern}`);
    assert.doesNotMatch(e.label, /\b(nike|adidas|vans|converse|crocs|birkenstock|ugg|dr\.? martens|timberland|new balance|asics|hoka)\b/i, `${e.id}: no brand names`);
  }
  for (const t of Object.keys(TYPES)) assert.ok(MARKET.some(m => m.type === t), `${t} has a market note`);
});

test('the built footwear library: every shoe is in the catalogue, has its drawings with the outside view, and opens in a pattern style that exists', () => {
  for (const t of FOOTWEAR_TEMPLATES) {
    const e = LIBRARY.find(x => x.id === t.id); assert.ok(e, `${t.id} is in the catalogue`);
    assert.equal(t.type, e.type); assert.equal(t.group, TYPES[e.type]); assert.equal(t.range, 'footwear');
    assert.ok(t.style === null || FW_STYLES[t.style], `${t.id} style`); assert.equal(t.style, e.pattern.startsWith('new:') ? null : e.pattern);
    assert.ok(existsSync(new URL(`../src/footwear-templates/${t.id}.json`, import.meta.url)) && existsSync(new URL(`../src/footwear-templates/thumbs/${t.id}.webp`, import.meta.url)), `${t.id} files`);
    const full = libraryShoe(t.id); assert.ok(full.views.lateral.panels.length > 5 && t.views.every(v => full.views[v]), `${t.id} views`);
    assert.ok(Object.values(full.views).every(d => d.source === `library:${t.id}`), `${t.id} views say where they came from`);
  }
});

test('a library shoe is found only as a shoe, and its upper (the largest colour on the outside) takes the colour picked on every view', () => {
  const t = FOOTWEAR_TEMPLATES[0]; if (!t) return;
  assert.ok(libraryOf('footwear', t.id) && !libraryOf('bags', t.id) && !libraryShoe('bag-tote'));
  const views = libraryShoe(t.id).views, out = recolourBody(views, '#1f3a5f');
  assert.ok(out.lateral.panels.some(p => p.fill === '#1f3a5f') && out.medial.panels.some(p => p.fill === '#1f3a5f'));
  assert.ok(out.lateral.panels.some(p => p.fill !== '#1f3a5f'), 'the sole and overlays stay as drawn');
});

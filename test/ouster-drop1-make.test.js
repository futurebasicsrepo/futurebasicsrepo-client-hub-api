import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DROP1 } from '../src/ouster-drop1.js';
import { NEEDS, ARTWORK, orderLines, scoreFactory, pickFactory } from '../src/ouster-drop1-make.js';

const note = (orders, spent, lines) => `From our Alibaba orders (imported 2026-11-06): ${orders} orders, 2025-01-02 to 2026-10-01, $${spent} spent.\nWhat we ordered:\n${lines.map(l => `- ${l}`).join('\n')}`;
const F = [
  { id: 'a', name: 'Cap Works', status: 'active', product_types: ['headwear'], skills: ['embroidery'], lead_time_days: 25, notes: note(6, '4,200.00', ['Custom embroidered dad hat 6 panel — 100 Pieces @ USD 3.20', 'Baseball cap embroidery logo — 300 Pieces @ USD 2.90']) },
  { id: 'b', name: 'Hat Generalist', status: 'active', product_types: ['headwear'], skills: [], notes: note(1, '120.00', ['Bucket hat — 50 Pieces @ USD 2.40']) },
  { id: 'c', name: 'Tee Mill', status: 'active', product_types: ['top'], skills: ['screen-print', 'dtf-dtg'], notes: note(4, '2,000.00', ['Heavyweight t-shirt screen print — 200 Pieces @ USD 5.10']) },
  { id: 'd', name: 'Old One', status: 'archived', product_types: ['headwear'], skills: ['embroidery'], notes: note(20, '90,000.00', ['caps — 1000 Pieces @ USD 1.00']) }
];

test('what we bought is read from the factory note, with quantities and unit prices', () => {
  const l = orderLines(F[0].notes);
  assert.equal(l.length, 2);
  assert.deepEqual(l[0].buys, [{ qty: 100, currency: 'USD', unit: 3.2 }]);
  assert.deepEqual(orderLines('no orders here'), []);
});

test('the best factory: makes it, has the skill, and we have bought the like from it; archived ones never', () => {
  const cap = pickFactory(F, NEEDS['ouster-drop1-cap-tan']);
  assert.equal(cap.supplier.name, 'Cap Works');
  assert.equal(cap.moq, 100);
  assert.equal(cap.pastUnitUsd, 3.2);
  assert.ok(cap.why.includes('embroidery'));
  assert.equal(cap.runnersUp[0].name, 'Hat Generalist');
  assert.equal(pickFactory(F, NEEDS['ouster-drop1-tee-taxi']).supplier.name, 'Tee Mill');
  assert.equal(pickFactory(F, NEEDS['ouster-drop1-impossible-puzzle']), null);
  assert.equal(scoreFactory(F[2], NEEDS['ouster-drop1-cap-tan']).score, 0);
});

test('every style has its needs and its artwork, and every artwork file is in the repo', () => {
  for (const p of DROP1) {
    assert.ok(NEEDS[p.handle], p.title);
    assert.ok(ARTWORK[p.handle]?.length, p.title);
    for (const a of ARTWORK[p.handle]) {
      assert.ok(existsSync(a.src), `${p.title}: ${a.src.pathname}`);
      assert.ok(['production', 'job', 'reference'].includes(a.kind));
      if (a.kind === 'reference') assert.match(a.name, /\(reference\)$/);
    }
  }
  for (const k of ['ouster-drop1-cap-tan', 'ouster-drop1-cap-green', 'ouster-drop1-tee-taxi', 'ouster-drop1-ls-yosemite', 'ouster-drop1-tee-infrared']) assert.ok(ARTWORK[k].some(a => a.kind === 'job'), k);
});

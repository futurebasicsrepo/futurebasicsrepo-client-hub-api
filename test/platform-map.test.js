// The platform map (Sites & health → Platform map, src/platform-map.js) has to keep up with the code. These tests fail when a new page
// or a new routes file is not on any box, when a box names a file that no longer exists, or when a link or flow step names a box that
// is not there. Fix it by adding the file to the `code` list of the box it belongs to (or a new box), and the flows it changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { NODES, EDGES, FLOWS } from '../src/platform-map.js';

const root = new URL('../', import.meta.url);
const ids = new Set(NODES.map(n => n.id));
const mapped = new Set(NODES.flatMap(n => n.code.map(c => c.split(' ')[0])));

test('every page and every routes file is on a box of the map', () => {
  const files = readdirSync(new URL('src/', root)).filter(f => /\.html$|-routes\.js$/.test(f)).map(f => `src/${f}`);
  assert.deepEqual(files.filter(f => !mapped.has(f)), [], 'add these to the code list of the box they belong to in src/platform-map.js');
});

test('every file a box names still exists', () => {
  assert.deepEqual([...mapped].filter(f => !existsSync(new URL(f, root))), [], 'these were moved or removed: update src/platform-map.js');
});

test('links and flow steps name real boxes, and each box is complete', () => {
  assert.equal(ids.size, NODES.length, 'box ids are unique');
  for (const n of NODES) {
    assert.ok(n.name && n.sub && n.what && Array.isArray(n.code) && Array.isArray(n.data) && Array.isArray(n.talks), `${n.id} has a name, a line, a description and lists`);
    for (const t of n.talks) assert.ok(ids.has(t), `${n.id} talks to ${t}, which is not a box`);
  }
  for (const [a, b] of EDGES) assert.ok(ids.has(a) && ids.has(b), `link ${a} → ${b}`);
  for (const [k, f] of Object.entries(FLOWS)) {
    assert.ok(f.name && f.lede && f.steps.length >= 3, `flow ${k} has a name, a line and steps`);
    for (const [id, text] of f.steps) assert.ok(ids.has(id) && text, `flow ${k}: step on ${id}`);
  }
});

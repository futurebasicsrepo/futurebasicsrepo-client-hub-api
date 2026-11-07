import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DROP1, SUPERSEDED, ACROSS, describe, briefNotes } from '../src/ouster-drop1.js';

test('Ouster Merch Drop 1: the 15 styles of the tech pack, each once', () => {
  assert.equal(DROP1.length, 15);
  assert.equal(new Set(DROP1.map(p => p.handle)).size, 15);
  assert.equal(new Set(DROP1.map(p => p.title)).size, 15);
  const codes = DROP1.map(p => p.code).filter(Boolean);
  assert.deepEqual(codes, ['Cap1 OT-S', 'Cap1 OT-S2', 'Cap1 OT-S3', 'Cap1 OC', 'Cap1 OC-2', 'Cap1 OB', 'Cap1 OW-B', 'Cap1 OM']);
  for (const p of DROP1) { assert.ok(p.summary && p.blank && p.decoration && p.type, p.title); assert.ok(Array.isArray(p.open)); }
});

test('Ouster Merch Drop 1: every Capsule 01 product is either carried over or archived, never both', () => {
  const seeded = [...readFileSync(new URL('../src/db.js', import.meta.url), 'utf8').matchAll(/\('((?:ouster|omt|sensor|point)-[a-z0-9-]+)','[^']+','[a-z]+','[a-z-]+'\)/g)].map(m => m[1]);
  assert.equal(seeded.length, 9);
  const from = DROP1.map(p => p.from).filter(Boolean);
  assert.deepEqual([...from, ...SUPERSEDED].sort(), [...seeded].sort());
});

test('Ouster Merch Drop 1: no price is invented, and the words are safe in a page', () => {
  for (const p of DROP1) assert.doesNotMatch(JSON.stringify(p), /\$\d/);
  assert.match(ACROSS[0], /free to employees, or sold/);
  assert.equal(describe({ summary: 'a <b> & c', code: 'X' }), '<p>a &lt;b&gt; &amp; c</p> <p>Style code X · Ouster Merch Drop 1</p>');
  assert.match(briefNotes(DROP1[0]), /Open: Pick the front artwork/);
});

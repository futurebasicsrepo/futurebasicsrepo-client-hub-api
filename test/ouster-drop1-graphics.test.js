import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DROP1 } from '../src/ouster-drop1.js';
import { GRAPHICS, EXTRACTED, SUPERSEDED_ASSETS } from '../src/ouster-drop1-graphics.js';
import { ARTWORK } from '../src/ouster-drop1-make.js';
import { BUILTIN_TECHNIQUES } from '../src/lab-library.js';

test('every graphic cut from the mockups is in the repo, with what it is and where it goes', () => {
  assert.ok(EXTRACTED.length >= 27);
  for (const e of EXTRACTED) {
    assert.ok(existsSync(new URL(`../src/seed/ouster-drop1/graphics/${e.file}`, import.meta.url)), e.file);
    assert.ok(e.label && e.place && ['line', 'photo', 'label'].includes(e.kind), e.file);
  }
});

test('each style carries its graphics, and every job names a technique the job file knows', () => {
  const handles = new Set(DROP1.map(p => p.handle));
  for (const [h, list] of Object.entries(GRAPHICS)) {
    assert.ok(handles.has(h), h);
    for (const x of list) {
      assert.ok(EXTRACTED.some(e => e.file === `${x.file}.png`), x.file);
      if (x.job) { assert.ok(BUILTIN_TECHNIQUES.some(t => t.name === x.job), x.job); assert.ok(x.widthIn > 0); }
    }
  }
  // the Infrared tee gets all four front options and the labels; the taxi tee its back photo, placed on the back flat
  assert.equal(GRAPHICS['ouster-drop1-tee-infrared'].filter(x => /^infrared-option-/.test(x.file)).length, 4);
  assert.ok(GRAPHICS['ouster-drop1-tee-infrared'].some(x => x.file === 'woven-label-kelvin'));
  assert.equal(GRAPHICS['ouster-drop1-tee-taxi'][0].place.sketch, 'back');
});

test('only the third pass\'s references that these graphics replace are taken away', () => {
  const refs = Object.values(ARTWORK).flat().filter(a => a.kind === 'reference').map(a => a.name);
  for (const n of SUPERSEDED_ASSETS) assert.ok(refs.includes(n), n);
  assert.ok(refs.includes('Cover layout (reference)') && !SUPERSEDED_ASSETS.includes('Cover layout (reference)'));
});

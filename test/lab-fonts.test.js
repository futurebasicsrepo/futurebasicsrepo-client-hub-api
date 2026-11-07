import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
await import('../src/lab-fonts.js');
const F = globalThis.FBFONTS, dir = new URL('../src/fonts/lab/', import.meta.url);

test('the Studio\'s open-source fonts: every file is here, in the stylesheet, and under an open licence', () => {
  assert.ok(F.length >= 40); const css = readFileSync(new URL('fonts.css', dir), 'utf8'), lic = readFileSync(new URL('LICENSES.txt', dir), 'utf8');
  for (const f of F) {
    assert.match(f.id, /^[a-z0-9-]+$/); assert.ok(f.weights.length >= 1, f.id); assert.match(f.stack, new RegExp(`^'${f.family}',`));
    for (const w of f.weights) { assert.ok(existsSync(new URL(`${f.id}-${w}.woff2`, dir)), `${f.id}-${w}`); assert.ok(css.includes(`/fonts/lab/${f.id}-${w}.woff2`), `${f.id} ${w} in fonts.css`); }
    const block = lic.split('==== ').find(b => b.startsWith(`${f.family} (${f.id})`)); assert.ok(block, `${f.id} licence`);
    assert.match(block, /SIL OPEN FONT LICENSE|Apache License/i, `${f.id} is open source`);
  }
  assert.ok(globalThis.FBFONT_CATEGORIES.includes('Script') && globalThis.FBFONT_CATEGORIES.includes('Varsity'));
});

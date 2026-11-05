import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDoc, cleanExtras } from '../src/lab-studio-routes.js';

const layer = (o = {}) => ({ id: 'a', kind: 'shape', shape: 'rect', w: 10, h: 10, ...o });

test('artboards, symbols and global swatches are kept with the design, within bounds', () => {
  const r = cleanDoc({ w: 1024, h: 1024, layers: [layer()], artboards: [{ id: 'f', name: 'Front', x: 10, y: 20, w: 300, h: 400, bleed: 12 }], symbols: [{ id: 's1', name: 'Screw' }], swatches: [{ id: 'k', name: 'Tour navy', hex: '#1B2A4A', pantone: 'PANTONE 533 C' }, { id: 'x', hex: 'navy' }] });
  assert.ok(r.doc, r.error);
  assert.deepEqual(r.doc.artboards, [{ id: 'f', name: 'Front', x: 10, y: 20, w: 300, h: 400, bleed: 12 }]);
  assert.deepEqual(r.doc.symbols, [{ id: 's1', name: 'Screw' }]);
  assert.deepEqual(r.doc.swatches, [{ id: 'k', name: 'Tour navy', hex: '#1b2a4a', pantone: 'PANTONE 533 C' }], 'a swatch that is not a colour is dropped');
});

test('a design without them saves as before', () => {
  const r = cleanDoc({ w: 1024, h: 1024, layers: [layer()] });
  assert.ok(r.doc); assert.equal(r.doc.artboards, undefined); assert.equal(r.doc.swatches, undefined);
});

test('what is not readable is refused', () => {
  assert.match(cleanExtras({ artboards: [{ x: 0, y: 0, w: 0, h: 10 }] }).error, /artboard is not readable/);
  assert.match(cleanExtras({ artboards: 'front' }).error, /up to 60 artboards/);
  assert.match(cleanExtras({ artboards: Array.from({ length: 61 }, () => ({ x: 0, y: 0, w: 1, h: 1 })) }).error, /up to 60/);
  assert.match(cleanExtras({ swatches: {} }).error, /up to 200 swatches/);
});

test('a layer\'s pattern fill must be a picture inside the design, and type on a path has a length', () => {
  const ok = cleanDoc({ w: 512, h: 512, layers: [layer({ ill: { fill: { mode: 'pattern', src: 'data:image/png;base64,iVBORw0KGgo=' } } })] });
  assert.ok(ok.doc);
  assert.match(cleanDoc({ w: 512, h: 512, layers: [layer({ ill: { fill: { mode: 'pattern', src: 'https://example.com/tile.png' } } })] }).error, /outside the design/);
  assert.match(cleanDoc({ w: 512, h: 512, layers: [layer({ ill: { text: { text: 'x'.repeat(401) } } })] }).error, /400 characters/);
  assert.match(cleanDoc({ w: 512, h: 512, layers: [layer({ ill: [] })] }).error, /not readable/);
});

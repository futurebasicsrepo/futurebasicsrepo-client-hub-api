import test from 'node:test';
import assert from 'node:assert/strict';
import { TIPS, segment } from '../src/lab-brush.js';

// a context that only counts what is filled
const ctx = () => { const c = { fills: 0 }; for (const k of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'rect', 'arc', 'translate', 'rotate', 'stroke', 'fillRect', 'setLineDash']) c[k] = () => {}; c.fill = () => { c.fills++; }; return c; };

test('the scatter tips stamp along a line drawn in short Pencil pieces, about one per tip width', () => {
  for (const tip of ['stars', 'hearts', 'confetti']) {
    assert.ok(TIPS.some(t => t.id === tip));
    const c = ctx(); for (let i = 0; i < 100; i++) segment(c, { tool: 'brush', tip, color: '#b5302b', size: 20 }, [i * 4, 50], [i * 4 + 4, 50]);
    const want = 400 / (20 * (tip === 'confetti' ? .45 : .9));
    assert.ok(c.fills > want * .5 && c.fills < want * 1.6, `${tip}: ${c.fills} stamps for about ${Math.round(want)}`);
  }
});

test('a running stitch keeps even spacing across short pieces of a stroke', () => {
  const c = ctx(); let n = 0; c.stroke = () => { n++; }; c.canvas = {};
  for (let i = 0; i < 100; i++) segment(c, { tool: 'brush', tip: 'stitch', color: '#141416', size: 10 }, [i * 3, 20], [i * 3 + 3, 20]);
  assert.equal(n, Math.floor(300 / 16)); // one dash every 1.6 tip widths, whatever the pieces
});

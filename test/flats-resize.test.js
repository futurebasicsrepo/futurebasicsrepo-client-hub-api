import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultParams, renderSvg } from '../src/lab-flats.js';

test('the chosen graphic has four corner handles to resize it, and the turn knob; others have none', () => {
  const p = defaultParams('tee'), placements = [{ id: 'a', view: 'front', x: 2, y: 6, w: 4, h: 3 }, { id: 'b', view: 'front', x: -3, y: 12, w: 3, h: 3 }];
  const svg = renderSvg(p, 'front', { placements, selected: 'a' });
  const corners = [...svg.matchAll(/data-rs="([^"]+)" data-cx="(-?1)" data-cy="(-?1)" x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)"/g)];
  assert.equal(corners.length, 4); assert.ok(corners.every(m => m[1] === 'a'));
  // each sits on its corner of the graphic
  for (const m of corners) { const hs = Number(m[6]) / 2; assert.ok(Math.abs(Number(m[4]) + hs - (2 + Number(m[2]) * 2)) < .01 && Math.abs(Number(m[5]) + hs - (6 + Number(m[3]) * 1.5)) < .01, m[0]); }
  assert.match(svg, /data-rot="a"/);
  assert.ok(!renderSvg(p, 'front', { placements }).includes('data-rs='), 'nothing chosen, no handles');
});

test('the eraser on the sketch stays inside the garment: its strokes are masked by the garment outline, not drawn on the page', () => {
  const p = { ...defaultParams('tee'), color: '#1d2a44', edits: [{ id: 'r', type: 'rub', view: 'front', pts: [[-20, 4], [-18, 6]], w: 3 }] };
  const svg = renderSvg(p, 'front');
  const id = /<mask id="([^"]+-rm)"/.exec(svg)?.[1]; assert.ok(id, 'a mask from the garment outline');
  assert.match(svg, new RegExp(`<g mask="url\\(#${id}\\)"><path d="M-20 4`), 'the rub strokes are drawn through it');
  assert.ok(!renderSvg({ ...p, edits: [] }, 'front').includes('-rm"'), 'no mask when nothing is rubbed out');
});

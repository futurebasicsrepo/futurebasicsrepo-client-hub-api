import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDrawing, shoeSvg, withArt } from '../src/lab-shoe-draw.js';

const base = { width: 1024, height: 1024, box: { x0: 100, y0: 100, x1: 900, y1: 900 }, stroke: 2.4, panels: [{ id: 'p1', fill: '#aaaaaa', d: 'M100 100L900 100L900 900Z', area: 1, box: null }], details: [{ d: 'M200 200L300 300Z' }] };
const ART = '0f0e0d0c-0b0a-4908-8706-050403020100';

test('a drawing keeps what the designer added: new panels, lines, words, graphics and pushed stitching; nothing else gets in', () => {
  const dw = cleanDrawing({
    panels: [...base.panels, { id: 'uabc12', fill: '#2255AA', d: 'M10 10Q20 20 30 30Z' }],
    details: [{ d: 'M210 205L300 310Z' }],
    marks: [{ kind: 'line', d: 'M1 1L50 60', w: 4, color: '#FF0000' }, { kind: 'text', text: 'FB <b>', x: 500, y: 500, size: 30, color: '#000000' }, { kind: 'line', d: 'M1 1<script>', w: 2 }],
    graphics: [{ id: 'g1', art: ART, name: 'Badge', x: 500, y: 400, w: 200, h: 180, rot: 15 }, { id: 'g2', art: 'not-a-uuid', x: 1, y: 1, w: 1, h: 1 }],
  }, base);
  assert.equal(dw.panels.length, 2); assert.equal(dw.panels[1].fill, '#2255aa');
  assert.equal(dw.details[0].d, 'M210 205L300 310Z', 'liquified stitching is kept');
  assert.equal(dw.marks.length, 2, 'a mark with anything but path data is dropped'); assert.equal(dw.marks[1].text, 'FB b');
  assert.deepEqual(dw.graphics.map(g => g.id), ['g1'], 'a graphic must name a real artwork');
  const again = cleanDrawing({ panels: base.panels }, dw);
  assert.equal(again.graphics.length, 1, 'a save that does not send them keeps them'); assert.equal(again.marks.length, 2);
});

test('the SVG draws the lines, the words and each graphic with its picture in it', async () => {
  const dw = cleanDrawing({ panels: base.panels, marks: [{ kind: 'line', d: 'M1 1L50 60', w: 4, color: '#ff0000' }], graphics: [{ id: 'g1', art: ART, x: 500, y: 400, w: 200, h: 180, rot: 15 }] }, base);
  assert.doesNotMatch(shoeSvg(dw), /<image/, 'without its picture a graphic is left out');
  const svg = shoeSvg(await withArt(dw, async id => (id === ART ? Buffer.from('png') : null)));
  assert.match(svg, /<image [^>]*href="data:image\/png;base64,cG5n"/); assert.match(svg, /rotate\(15 500 400\)/); assert.match(svg, /stroke="#ff0000"/);
});

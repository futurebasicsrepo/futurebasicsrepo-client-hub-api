import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/commercial.js';
import { normalizeTechPack, publishedTechPackView } from '../src/techpack.js';
import { packDiff } from '../src/pack-diff.js';
import { packSheets, toCsv, toXlsx, exportName, SHEET_KEYS } from '../src/pack-sheets.js';
const C = globalThis.FBCommercial;

const pack = () => normalizeTechPack({
  style: { styleName: 'Trail jacket', styleNumber: 'FB-1', designer: 'Dana' }, sizes: ['S', 'M'],
  pom: [{ code: 'A', name: 'Chest', how: 'Pit to pit', tolerance: '±0.5', values: { S: '20', M: '21.5' } }],
  bom: [{ component: 'Shell', material: 'Nylon', qty: '1.2', unit: 'm', cost: '6.50' }, { component: 'Zip', material: 'YKK', qty: '1', unit: 'pc', cost: '0.8' }, { component: 'Label', material: 'Woven' }],
  colorways: [{ name: 'Volt', code: '13-0550 TCX', swatch: '#c8ff00' }],
  commercial: { retailPrice: '89', hsCode: '6201.93', weightGrams: '420', cost: { labour: '7', decoration: '2.5', packaging: '0.6', freight: '1.2', dutyPct: '16.5', wastePct: '5', breaks: [{ qty: '500', pctOff: '5' }, { qty: '100', pctOff: '0' }] },
    variants: [{ size: 'S', colour: 'Volt', sku: 'FB1-VOL-S', price: '95' }] }
});

test('the cost adds up: materials, waste, labour, decoration, packing, duty and freight', () => {
  const k = C.costSummary(pack());
  assert.deepEqual([k.materials, k.waste, k.fob, k.duty, k.freight, k.landed], [8.6, 0.43, 19.13, 3.16, 1.2, 23.49]);
  assert.equal(k.marginPct, 73.6); assert.equal(k.retail, 89);
  assert.deepEqual(k.lines, [7.8, 0.8, null], 'a line with no cost is counted, never guessed');
  assert.equal(k.unpricedLines, 1); assert.equal(k.pricedLines, 2);
});

test('order-size breaks come out smallest first and take a share off the goods', () => {
  const k = C.costSummary(pack());
  assert.deepEqual(k.breaks.map(b => b.qty), ['100', '500']);
  assert.equal(k.breaks[0].landed, k.landed); assert.ok(k.breaks[1].landed < k.landed);
  assert.equal(k.breaks[1].landed, 22.37);
});

test('nothing entered means no estimate, and a blank quantity counts once', () => {
  assert.equal(C.costSummary(normalizeTechPack({})).hasAny, false);
  const k = C.costSummary(normalizeTechPack({ bom: [{ component: 'Zip', cost: '2' }] }));
  assert.equal(k.materials, 2); assert.equal(k.marginPct, null, 'no retail price, no margin');
});

test('costs are cleaned: junk is dropped, caps hold', () => {
  const t = normalizeTechPack({ bom: [{ component: 'A', cost: 'abc' }, { component: 'B', cost: '12.345' }, { component: 'C', cost: '99999999' }], commercial: { cost: { labour: '-3', dutyPct: '250', breaks: [{ qty: '0', pctOff: '5' }, { qty: '50', pctOff: '95' }, { qty: '10', pctOff: '' }] } } });
  assert.deepEqual(t.bom.map(r => r.cost), ['', '12.35', '']);
  assert.equal(t.commercial.cost.labour, ''); assert.equal(t.commercial.cost.dutyPct, '');
  assert.deepEqual(t.commercial.cost.breaks, [{ qty: '10', pctOff: '' }, { qty: '50', pctOff: '' }], 'a zero size is dropped, and 95% off is out of range so it counts as no discount');
});

test('a factory never receives a cost or what the client charges', () => {
  const row = { product_id: 'p', title: 'Jacket', product_type: 'Outerwear', published_data: pack(), version: 1, verification: {}, revisions: [] };
  const fac = publishedTechPackView(row, { audience: 'factory' }).techPack.data, cli = publishedTechPackView(row, { audience: 'client' }).techPack.data;
  assert.ok(fac.bom.every(r => r.cost === '')); assert.equal(fac.commercial.cost.labour, ''); assert.deepEqual(fac.commercial.cost.breaks, []); assert.equal(fac.commercial.retailPrice, '');
  assert.equal(cli.bom[0].cost, '6.5'); assert.equal(cli.commercial.cost.labour, '7');
});

test('what changed in a version never lists a cost', () => {
  const a = pack(), b = pack(); b.bom[0].cost = '9'; b.commercial.cost.labour = '12';
  assert.deepEqual(packDiff(a, b), [], 'a cost change is the client\'s own business');
});

test('sheets for a client carry the cost, and for a factory they do not', () => {
  const cli = packSheets(pack(), { audience: 'client', title: 'Trail jacket' }), fac = packSheets(pack(), { audience: 'factory', title: 'Trail jacket' });
  assert.deepEqual(cli.map(s => s.name), ['Overview', 'Materials', 'Measurements', 'Colourways', 'SKUs', 'Cost']);
  assert.deepEqual(fac.map(s => s.name), ['Overview', 'Materials', 'Measurements', 'Colourways', 'SKUs']);
  const text = JSON.stringify(fac); assert.ok(!/Unit cost|Line cost|Retail price|Landed/.test(text), 'no costs, no retail price');
  const mat = cli.find(s => s.name === 'Materials'); assert.ok(mat.header.includes('Unit cost (USD)'));
  assert.equal(mat.rows[0][7], 1.2); assert.equal(mat.rows[0][9], 6.5); assert.equal(mat.rows[0][10].v, 7.8);
  assert.equal(cli.find(s => s.name === 'Cost').rows.find(r => r[0] === 'Landed cost of one unit')[1], 23.49);
  assert.equal(fac.find(s => s.name === 'SKUs').header.length, 4, 'no price column for a factory');
});

test('CSV: quoted, in order, and a typed formula is not run', () => {
  const sh = { header: ['Name', 'Note'], rows: [['=HYPERLINK("http://x")', 'a, "b"\nc'], ['+1+1', '-5'], ['@SUM(A1)', 'ok']] };
  const csv = toCsv(sh);
  assert.ok(csv.startsWith('﻿Name,Note\r\n'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")","a, ""b""\nc"`));
  assert.ok(csv.includes("'+1+1,-5") && csv.includes("'@SUM(A1),ok"), 'a leading = + - or @ gets a quote mark, a plain negative number stays a number');
});

test('XLSX is a zip of the parts a spreadsheet needs, with text as text', () => {
  const buf = toXlsx([...packSheets(pack(), { audience: 'client', title: 'Trail <jacket> & co' }), { name: 'Bad/Name:[x]', header: ['A'], rows: [['=1+1', '<b>']].map(r => [r[0]]) }]);
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'zip magic');
  const s = buf.toString('latin1');
  for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet7.xml']) assert.ok(s.includes(part), part);
  assert.ok(s.includes('Trail &lt;jacket&gt; &amp; co'), 'text is escaped');
  assert.ok(s.includes('<f>IF(H2=&quot;&quot;,1,H2)*J2</f>'), 'a materials line has a live formula');
  assert.ok(!s.includes('name="Bad/Name'), 'sheet names are made safe');
  assert.ok(/<c r="A2" s="0" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/.test(s), 'a typed = is stored as text, not as a formula');
});

test('file names are tidy', () => {
  assert.equal(exportName('Trail Jacket (v2)!', 3, '.xlsx'), 'Trail-Jacket-v2-v3.xlsx');
  assert.equal(exportName('', 'draft', '.csv'), 'tech-pack-draft.csv');
  assert.deepEqual(Object.keys(SHEET_KEYS), ['overview', 'materials', 'measurements', 'colourways', 'construction', 'labels', 'samples', 'skus', 'cost']);
});

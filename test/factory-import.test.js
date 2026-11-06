import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, fromAlibaba, noteFor, IMPORT_MARK } from '../src/factory-import.js';

// made-up suppliers in the shape of the Alibaba suppliers export
const HEAD = 'Supplier (company),Store link,Country,Province/State,City,Supplier address,Contact person(s) on orders,Number of orders,First order date,Last order date,Order numbers,Products ordered (quantity x unit price / unit),Total spent USD (excl. closed & unpaid orders),Total of all orders USD (incl. closed & unpaid),Currency';
const CSV = '﻿' + [HEAD,
  '"Example Knit Garment Co., Ltd.",https://example-knit.en.alibaba.com,China,Guangdong,Dongguan,"No. 1 Example Road, Dongguan",Amy Example,3,2025-01-04,2025-06-20,1111111111111111; 2222222222222222,"Custom OEM heavyweight hoodie embroidered logo — 200 Pieces @ USD 12.50\nCustom logo knitted beanie — 50 Pieces @ USD 2.00",2600.00,2600.00,USD',
  'Sample Cap Factory,https://sample-cap.en.alibaba.com,China,Hebei,Baoding,,Bo Sample,1,2025-03-02,2025-03-02,3333333333333333,"Embroidered 6 panel baseball caps — 300 Pieces @ USD 1.90",570.00,570.00,USD',
  'Tiny Sticker Shop,,China,Zhejiang,Yiwu,,,1,2025-02-02,2025-02-02,4444444444444444,"Vinyl stickers with ""quotes"" — 100 Pieces @ USD 0.30",30.00,30.00,USD',
  'Never Paid Ltd,https://never-paid.en.alibaba.com,China,,Ningbo,,,1,2025-02-02,2025-02-02,5555555555555555,"Canvas tote bags — 100 Pieces @ USD 1.00",0,100.00,USD',
  'undefined,,,,,,,1,,,,"Something — 1 Pieces @ USD 9.00",9.00,9.00,USD',
  ',,,,,,,,,,,,,,'
].join('\r\n');

test('the CSV reader keeps quoted commas, quotes and line breaks, and drops the byte-order mark and empty rows', () => {
  const recs = parseCsv(CSV);
  assert.equal(recs.length, 5);
  assert.equal(Object.keys(recs[0])[0], 'Supplier (company)');
  assert.equal(recs[0]['Supplier (company)'], 'Example Knit Garment Co., Ltd.');
  assert.match(recs[0]['Products ordered (quantity x unit price / unit)'], /hoodie[^\n]*\n[^\n]*beanie/);
  assert.match(recs[2]['Products ordered (quantity x unit price / unit)'], /"quotes"/);
});

test('each supplier is a candidate factory with a suggested choice and why, biggest spend first', () => {
  const rows = fromAlibaba(parseCsv(CSV));
  assert.deepEqual(rows.map(r => r.name), ['Example Knit Garment Co., Ltd.', 'Sample Cap Factory', 'Tiny Sticker Shop', '', 'Never Paid Ltd']);
  const [knit, cap, stick, noname, unpaid] = rows;
  assert.equal(knit.suggest, true); assert.equal(knit.why, '3 orders'); assert.equal(knit.spentCents, 260000);
  assert.equal(cap.suggest, true); assert.equal(cap.why, 'A sizeable order');
  assert.equal(stick.suggest, false); assert.equal(stick.why, 'One small order');
  assert.equal(noname.valid, false); assert.equal(noname.suggest, false);
  assert.equal(unpaid.suggest, false); assert.match(unpaid.why, /No paid orders/);
  assert.equal(knit.website, 'https://example-knit.en.alibaba.com'); assert.equal(stick.website, '');
  assert.deepEqual(knit.orderNumbers, ['1111111111111111', '2222222222222222']);
});

test('what they make and can do is guessed from where the money went, not from every keyword', () => {
  const [knit, cap] = fromAlibaba(parseCsv(CSV));
  // the hoodies are $2,500 of $2,600: tops; the $100 of beanies is under a fifth, so not headwear
  assert.deepEqual(knit.productTypes, ['top']);
  assert.ok(knit.skills.includes('embroidery') && knit.skills.includes('cut-sew'));
  assert.deepEqual(cap.productTypes, ['headwear']);
  assert.deepEqual(cap.skills, ['embroidery']);
});

test('the note says where it came from, the orders and what was ordered, within the note length', () => {
  const [knit] = fromAlibaba(parseCsv(CSV));
  const n = noteFor(knit, '2026-11-06');
  assert.ok(n.startsWith(`${IMPORT_MARK} (imported 2026-11-06): 3 orders, 2025-01-04 to 2025-06-20, $2,600.00 spent.`));
  assert.match(n, /Contact on the orders: Amy Example\./);
  assert.match(n, /Order numbers: 1111111111111111, 2222222222222222\./);
  assert.match(n, /What we ordered:\n- Custom OEM heavyweight hoodie/);
  const long = noteFor({ ...knit, products: Array.from({ length: 80 }, (_, i) => `Line ${i} `.padEnd(120, 'x')) }, '2026-11-06');
  assert.ok(long.length <= 2000); assert.match(long, /…and \d+ more$/);
});

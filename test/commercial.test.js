import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/commercial.js';
import { normalizeTechPack, publishedTechPackView, techPackCompleteness } from '../src/techpack.js';
import { packDiff } from '../src/pack-diff.js';
const C = globalThis.FBCommercial;

test('country of origin is read from how people write it', () => {
  for (const [t, c] of [['Vietnam', 'VN'], ['Made in Vietnam', 'VN'], ['viet nam', 'VN'], ['VN', 'VN'], ['China', 'CN'], ['PRC', 'CN'], ['USA', 'US'], ['Türkiye', 'TR'], ['Bangladesh.', 'BD']]) assert.equal(C.countryCode(t), c, t);
  for (const t of ['', 'Narnia', 'XX', null]) assert.equal(C.countryCode(t), '', String(t));
});

test('barcodes are checked, not guessed', () => {
  assert.ok(C.gtinOk('4006381333931') && C.gtinOk('036000291452') && C.gtinOk('96385074'));
  assert.ok(!C.gtinOk('4006381333932') && !C.gtinOk('12345') && !C.gtinOk(''));
  const n = C.normalize({ variants: [{ size: 'M', colour: 'Grey', sku: 'ab 12', barcode: '4006381333932' }] });
  assert.equal(n.variants[0].barcode, ''); assert.equal(n.variants[0].sku, 'AB12');
});

test('HS code, price and weight are cleaned', () => {
  assert.equal(C.hsCode('611020'), '6110.20'); assert.equal(C.hsCode('6110.20.2000'), '6110.20.2000'); assert.equal(C.hsCode('61'), '');
  const n = C.normalize({ retailPrice: '$89.456', compareAtPrice: -3, weightGrams: '420', lengthCm: 'abc', currency: 'eur' });
  assert.equal(n.retailPrice, '89.46'); assert.equal(n.compareAtPrice, ''); assert.equal(n.weightGrams, '420'); assert.equal(n.lengthCm, ''); assert.equal(n.currency, 'EUR');
});

test('SKUs: one row per size and colour, filled-in rows kept, gone sizes dropped, no duplicates', () => {
  const pack = { style: { styleNumber: 'FB-26-0042' }, sizes: ['S', 'M'], colorways: [{ name: 'Grey' }, { name: 'Green' }], commercial: {} };
  let v = C.syncVariants(pack); assert.equal(v.length, 4); assert.equal(new Set(v.map(x => x.sku)).size, 4); assert.ok(v.every(x => x.sku.startsWith('FB260042-')));
  pack.commercial = { variants: v.map((x, i) => (i === 0 ? { ...x, sku: 'MINE-1', barcode: '4006381333931', price: '95' } : x)) };
  pack.sizes = ['S', 'M', 'L']; v = C.syncVariants(pack); assert.equal(v.length, 6);
  assert.equal(v[0].sku, 'MINE-1'); assert.equal(v[0].barcode, '4006381333931'); assert.equal(v[0].price, '95');
  pack.sizes = ['M']; pack.commercial = { variants: v }; v = C.syncVariants(pack); assert.equal(v.length, 2); assert.ok(v.every(x => x.size === 'M'));
  assert.equal(C.syncVariants({ style: { styleName: 'Cap' }, sizes: ['OS'], colorways: [] }).map(x => x.sku).join(), 'CAP-OS');
});

test('what is missing for a sale is named in plain words', () => {
  const m = C.missing({ care: {}, commercial: {} }); for (const w of [/price/i, /weight/i, /HS code/i, /origin/i, /SKU/i]) assert.ok(m.some(x => w.test(x)), String(w));
  const full = { care: { countryOfOrigin: 'Vietnam' }, commercial: { retailPrice: '89', weightGrams: '420', hsCode: '6110.20', variants: [{ size: 'M', colour: '', sku: 'X-M' }] } };
  assert.deepEqual(C.missing(full), []);
});

test('the pack keeps it, a factory never sees what the client charges, and the PDF/diff side leaves price out', () => {
  const data = normalizeTechPack({ style: { styleName: 'Hoodie' }, sizes: ['M'], commercial: { retailPrice: '89', compareAtPrice: '120', weightGrams: '420', hsCode: '6110.20', variants: [{ size: 'M', colour: '', sku: 'H-M', price: '95' }] } });
  assert.equal(data.commercial.retailPrice, '89');
  const row = { published_data: data, product_id: 'p', title: 'T', verification: {}, version: 1 };
  const fac = publishedTechPackView(row, { audience: 'factory' }).techPack.data.commercial, cli = publishedTechPackView(row, { audience: 'client' }).techPack.data.commercial;
  assert.equal(fac.retailPrice, ''); assert.equal(fac.compareAtPrice, ''); assert.equal(fac.variants[0].price, ''); assert.equal(fac.variants[0].sku, 'H-M'); assert.equal(fac.weightGrams, '420'); assert.equal(fac.hsCode, '6110.20');
  assert.equal(cli.retailPrice, '89'); assert.equal(cli.variants[0].price, '95');
  const after = normalizeTechPack({ ...data, commercial: { ...data.commercial, retailPrice: '99', weightGrams: '450', variants: [{ size: 'M', colour: '', sku: 'H-M2', price: '99' }] } });
  const ch = packDiff(data, after); assert.ok(ch.some(c => c.section === 'Commercial' && /Weight/.test(c.label)) && ch.some(c => c.section === 'Commercial' && /M/.test(c.label) && /H-M2/.test(c.to)));
  assert.ok(!JSON.stringify(ch).match(/99|89|95/), 'no price in the change list a factory reads');
  assert.ok(techPackCompleteness(data).recommended.some(r => r.key === 'commercial'));
});

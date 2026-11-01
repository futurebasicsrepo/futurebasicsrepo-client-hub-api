import test from 'node:test';
import assert from 'node:assert/strict';
import PDFDocument from 'pdfkit';
import { kindOf, markSvg, markDxf, markStep, markStl, markPdf, markZip, markHtml, isFile, newRef, createWatch, LIMITS, STOP_FACTOR } from '../src/watch.js';
import { zip } from '../src/zip.js';

const NOTE = 'Future Basics export ABCD-1234-EF56 · 2026-11-01 · for Audit Co · not for redistribution or AI training';

test('kinds of library material', () => {
  assert.equal(kindOf('/lab/flat-templates/thumbs/tee.webp'), 'thumb');
  assert.equal(kindOf('/lab/flat-templates/tee-boxy.svg'), 'sketch');
  assert.equal(kindOf('/lab/flat-parts/pocket.webp'), 'sketch');
  assert.equal(kindOf('/lab/material-photos/denim.jpg'), 'swatch');
  assert.equal(kindOf('/v1/lab/materials/0b6e/swatch'), 'swatch');
  assert.equal(kindOf('/v1/lab/library/graphics/abc/vector.svg?x=1'), 'graphic');
  assert.equal(kindOf('/v1/lab/library/technique-photos/abc'), 'technique');
  assert.equal(kindOf('/v1/lab/concepts'), null);
  assert.equal(kindOf('/lab/studio'), null);
  assert.ok(isFile('attachment; filename="a.svg"') && !isFile('') && !isFile('inline'));
  assert.match(newRef(), /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
});

test('SVG, HTML, DXF and STEP carry the reference as a comment and stay valid', () => {
  const svg = markSvg('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', NOTE);
  assert.match(svg, /^<\?xml version="1.0"\?>\n<!-- Future Basics export ABCD-1234-EF56/); // the declaration stays first
  assert.match(markSvg('<svg/>', 'a -- b'), /^<!-- a — b -->\n<svg\/>/); // no "--" inside a comment
  assert.match(markHtml('<!doctype html><html></html>', NOTE), /^<!doctype html>\n<!-- Future Basics export/);
  assert.match(markDxf('0\nSECTION\n', NOTE), /^999\nFuture Basics export ABCD-1234-EF56[^\n]*\n0\nSECTION/);
  const step = markStep('ISO-10303-21;\nHEADER;\n', NOTE); assert.match(step, /^ISO-10303-21;\n\/\* Future Basics export ABCD-1234-EF56[^*]*\*\/\nHEADER;/);
});

test('STL: binary keeps its triangles and takes the reference in its header; ASCII names it on the first line', () => {
  const tri = 2, bin = Buffer.alloc(84 + 50 * tri); bin.write('original', 0, 'ascii'); bin.writeUInt32LE(tri, 80); bin.writeFloatLE(1.5, 84 + 12);
  const m = markStl(bin, NOTE);
  assert.equal(m.length, bin.length); assert.equal(m.readUInt32LE(80), tri); assert.equal(m.readFloatLE(84 + 12), 1.5);
  assert.match(m.subarray(0, 80).toString('ascii'), /^Future Basics export ABCD-1234-EF56/);
  const ascii = markStl(Buffer.from('solid part\nfacet normal 0 0 1\nendsolid part\n'), NOTE).toString();
  assert.match(ascii, /^solid part \(Future Basics export ABCD-1234-EF56[^\n]*\)\nfacet normal/);
});

test('PDF: an incremental update adds the reference to the document information and leaves the pages alone', async () => {
  const doc = new PDFDocument({ info: { Title: 'Tech pack' } }); const chunks = []; doc.on('data', c => chunks.push(c));
  const done = new Promise(r => doc.on('end', r)); doc.text('Hello'); doc.end(); await done;
  const pdf = Buffer.concat(chunks), out = markPdf(pdf, NOTE), tail = out.subarray(pdf.length).toString('latin1');
  assert.ok(out.subarray(0, pdf.length).equals(pdf), 'the original bytes are untouched');
  assert.match(tail, /\/Keywords \(Future Basics export ABCD-1234-EF56/);
  assert.match(tail, /\/Title (\d+ 0 R|\(Tech pack\))/, 'the title is kept');
  assert.match(tail, /ABCD-1234-EF56 - 2026-11-01 - for Audit Co/, 'readable in plain ASCII');
  assert.match(tail, /\/Prev \d+/); assert.match(tail, /%%EOF\n$/);
  const xrefAt = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(tail)[1]); assert.equal(out.subarray(xrefAt, xrefAt + 4).toString(), 'xref', 'startxref points at the new table');
  const entry = /xref\n(\d+) 1\n(\d{10}) 00000 n/.exec(tail), off = Number(entry[2]);
  assert.equal(out.subarray(off, off + 30).toString('latin1').startsWith(`${entry[1]} 0 obj`), true, 'the table points at the new object');
  assert.ok(markPdf(Buffer.from('not a pdf'), NOTE).equals(Buffer.from('not a pdf')), 'anything else is sent as it was');
});

test('zip: a manifest is added and every file still reads', () => {
  const z = zip([{ name: 'pack.pdf', data: Buffer.from('%PDF-1') }, { name: 'art/logo.svg', data: '<svg/>' }]);
  const out = markZip(z, 'FUTURE-BASICS-EXPORT.txt', 'Reference: ABCD-1234-EF56\n');
  const e = out.length - 22; assert.equal(out.readUInt32LE(e), 0x06054b50);
  const n = out.readUInt16LE(e + 10), cdSize = out.readUInt32LE(e + 12), cdOff = out.readUInt32LE(e + 16); assert.equal(n, 3); assert.equal(cdOff + cdSize, e);
  const names = []; let p = cdOff;
  for (let i = 0; i < n; i++) { const nl = out.readUInt16LE(p + 28), lo = out.readUInt32LE(p + 42), name = out.subarray(p + 46, p + 46 + nl).toString(); names.push(name);
    assert.equal(out.readUInt32LE(lo), 0x04034b50, `${name}: its local header is where the directory says`); const ln = out.readUInt16LE(lo + 26), size = out.readUInt32LE(lo + 18);
    const data = out.subarray(lo + 30 + ln, lo + 30 + ln + size); if (name === 'FUTURE-BASICS-EXPORT.txt') assert.match(data.toString(), /ABCD-1234-EF56/); if (name === 'pack.pdf') assert.equal(data.toString(), '%PDF-1');
    p += 46 + nl; }
  assert.deepEqual(names, ['pack.pdf', 'art/logo.svg', 'FUTURE-BASICS-EXPORT.txt']);
});

test('counting: a notice once an hour past the level, clients paused at five times it, staff never paused', async () => {
  let t = Date.UTC(2026, 10, 1, 10); const w = createWatch({ pool: { query: async () => ({ rows: [] }) }, now: () => t });
  const client = { key: 'u:c', role: 'client' }, staff = { key: 'u:s', role: 'admin' }, L = LIMITS.graphic.notice;
  const states = c => { const seen = new Map(); for (let i = 0; i < L * STOP_FACTOR + 2; i++) { const s = w.count(c, 'graphic').state; seen.set(s, (seen.get(s) || 0) + 1); } return seen; };
  const cs = states(client); assert.equal(cs.get('notice'), 1); assert.equal(cs.get('stop-now'), 1); assert.equal(cs.get('stop'), 1);
  const ss = states(staff); assert.equal(ss.get('notice'), 1); assert.equal(ss.get('stop') || 0, 0); assert.equal(ss.get('stop-now') || 0, 0);
  t += 3600_000; assert.equal(w.count(client, 'graphic').state, 'ok', 'a new hour starts again');
});

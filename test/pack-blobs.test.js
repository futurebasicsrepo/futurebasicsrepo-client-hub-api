import test from 'node:test';
import assert from 'node:assert/strict';
import { toBlob, fromBlob, storedForm, externalize, collectRefs, resolveRefs, isRef, createBlobLayer, BLOB_MIN_CHARS } from '../src/pack-blobs.js';

const picture = (seed, kb = 6) => `data:image/jpeg;base64,${Buffer.from(Array.from({ length: kb * 1024 }, (_, i) => (i * 31 + seed * 7) % 251)).toString('base64')}`;
const A = picture(1), B = picture(2);

// an in-memory stand-in for the database: pack_blobs, and one json column
function fakeDb() {
  const blobs = new Map(), calls = [], stored = new Map();
  const rawQuery = async (text, values) => {
    calls.push(text.split(/\s+/).slice(0, 3).join(' '));
    if (/^insert into pack_blobs/.test(text)) { const [hash, mime, kind, bytes, size] = values; if (!blobs.has(hash)) blobs.set(hash, { hash, mime, kind, bytes, size }); return { rows: [] }; }
    if (/from pack_blobs/.test(text)) return { rows: values[0].filter(h => blobs.has(h)).map(h => blobs.get(h)) };
    throw new Error('unexpected ' + text);
  };
  // run(text, values): "insert" keeps the JSON text of the first parameter; "select" returns it as a jsonb column plus a text column
  const run = async (text, values) => {
    if (/^insert/.test(text)) { stored.set('row', JSON.stringify(values[0])); return { rows: [], fields: [] }; }
    const v = JSON.parse(stored.get('row'));
    return { rows: [{ id: 'x', data: v, label: 'fbblob:' + '0'.repeat(64) }], fields: [{ name: 'id', dataTypeID: 25 }, { name: 'data', dataTypeID: 3802 }, { name: 'label', dataTypeID: 25 }] };
  };
  return { rawQuery, run, blobs, calls, stored };
}

test('a big picture becomes a short reference and comes back as exactly the same string', () => {
  const b = toBlob(A); assert.ok(b && /^fbblob:[0-9a-f]{64}$/.test(b.ref) && isRef(b.ref));
  assert.equal(fromBlob(b.row), A, 'byte for byte');
  assert.equal(toBlob(A).ref, b.ref, 'the same picture is the same reference');
  assert.notEqual(toBlob(B).ref, b.ref, 'a different picture is a different one');
  assert.equal(toBlob('data:image/png;base64,AAAA'), null, 'a small data URL stays where it is');
  assert.equal(toBlob('x'.repeat(BLOB_MIN_CHARS + 10)), null, 'only pictures are moved');
  assert.equal(toBlob('data:application/pdf;base64,' + 'A'.repeat(BLOB_MIN_CHARS)), null);
  assert.equal(storedForm(A), b.ref); assert.equal(storedForm('plain'), 'plain');
});

test('base64 that does not survive decode and re-encode is kept as written, so what is read is what was written', () => {
  const raw = A.split(',')[1];
  for (const odd of [`data:image/jpeg;base64,${raw.slice(0, -1)}`, `data:image/png;base64,${raw.slice(0, 100)}\n${raw.slice(100)}`.replace('\n', ''), `data:image/webp;base64,${raw.replace(/=+$/, '')}A`]) {
    const b = toBlob(odd); if (!b) continue; assert.equal(fromBlob(b.row), odd);
  }
  const unpadded = 'data:image/jpeg;base64,' + Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256)).toString('base64').replace(/=+$/, '');
  const b = toBlob(unpadded); assert.ok(b); assert.equal(fromBlob(b.row), unpadded);
});

test('externalize walks nested packs, changes nothing it was given, and is idempotent', () => {
  const pack = { style: { name: 'x' }, sketches: [{ image: A, callouts: [{ photo: B, hphoto: A, n: 1 }] }, { image: '' }], renderings: [{ image: B, parts: [{ img: A }] }], artwork: [{ image: A, clear: B, tiny: 'data:image/png;base64,AAAA' }] };
  const before = JSON.stringify(pack), blobs = new Map(), out = externalize(pack, blobs);
  assert.equal(JSON.stringify(pack), before, 'the input is untouched');
  assert.equal(blobs.size, 2, 'two different pictures, however many times each appears');
  assert.ok(!JSON.stringify(out).includes('data:image/jpeg'), 'no big data URL is left');
  assert.equal(out.artwork[0].tiny, 'data:image/png;base64,AAAA'); assert.equal(out.style, pack.style, 'a branch with nothing to move is shared');
  assert.ok(JSON.stringify(out).length < before.length / 10, 'the JSON is a fraction of the size');
  assert.equal(externalize(out, new Map()), out, 'running it again changes nothing');
  const refs = new Set(); collectRefs(out, refs); assert.equal(refs.size, 2);
  const get = h => fromBlob([...blobs.values()].find(r => r.hash === h)); assert.deepEqual(resolveRefs(structuredClone(out), get), pack);
});

test('through the layer a pack goes in without its pictures and comes out with them, the same bytes', async () => {
  const db = fakeDb(), layer = createBlobLayer(db.rawQuery, { log: { error() {} } }), run = layer.wrap(db.run);
  const pack = { sketches: [{ image: A, callouts: [{ photo: B }] }], renderings: [{ image: A }] };
  await run('insert into t(data) values($1)', [pack]);
  assert.equal(db.blobs.size, 2); assert.ok(!db.stored.get('row').includes('base64'), 'the stored JSON holds references only');
  assert.ok(db.stored.get('row').length < 1000);
  const res = await run('select * from t', []);
  assert.deepEqual(res.rows[0].data, pack, 'read back exactly as written');
  assert.equal(res.rows[0].label, 'fbblob:' + '0'.repeat(64), 'a text column is never touched, even if it looks like a reference');
  const writes = db.calls.filter(c => /^insert into pack_blobs/.test(c)).length; await run('insert into t(data) values($1)', [pack]);
  assert.equal(db.calls.filter(c => /^insert into pack_blobs/.test(c)).length, writes, 'a picture already stored is not stored again');
});

test('only plain-object parameters are looked at: arrays (Postgres arrays), buffers, strings and dates pass through', async () => {
  const db = fakeDb(), layer = createBlobLayer(db.rawQuery), seen = [];
  const run = layer.wrap(async (text, values) => { seen.push(text && text.values ? text.values : values); return { rows: [], fields: [] }; });
  const buf = Buffer.from('x'), when = new Date(), arr = [A];
  await run('q', [arr, buf, A, when, 5, null, { data: A }]);
  assert.equal(seen[0][0], arr); assert.equal(seen[0][1], buf); assert.equal(seen[0][2], A); assert.equal(seen[0][3], when); assert.equal(seen[0][6].data.startsWith('fbblob:'), true);
  await run({ text: 'q', values: [{ data: B }] }); assert.ok(seen[1][0].data.startsWith('fbblob:'), 'the config-object form is handled too');
  const cb = () => {}; await layer.wrap(async (...a) => { assert.equal(a[a.length - 1], cb); return {}; })('q', [{ data: A }], cb);
});

test('a JSON string is looked at only where the query casts it to jsonb', async () => {
  const db = fakeDb(), layer = createBlobLayer(db.rawQuery), seen = [];
  const run = layer.wrap(async (text, values) => { seen.push(values); return { rows: [], fields: [] }; });
  const pack = { sketches: [{ image: A }], note: 'x' }, json = JSON.stringify(pack);
  await run('update t set published_data=$2::jsonb, note=$3 where id=$1', ['id', json, json]);
  assert.ok(seen[0][1].length < 500 && !seen[0][1].includes('base64'), 'the cast placeholder is externalized');
  assert.equal(seen[0][2], json, 'the same string in a text placeholder is left exactly as it is');
  assert.deepEqual(JSON.parse(seen[0][1]).note, 'x');
  await run('update t set v=$1 :: JSONB', [json]); assert.ok(!seen[1][0].includes('base64'), 'spacing and case of the cast do not matter');
  await run('update t set v=$1', [json]); assert.equal(seen[2][0], json, 'no cast, no change');
  await run('update t set v=$1::jsonb', ['{ not json data:image/' + 'x'.repeat(3000)]); assert.ok(seen[3][0].startsWith('{ not json'), 'text that is not JSON is passed through');
});

test('a missing picture is reported and its reference kept, never swapped for something wrong', async () => {
  const errors = [], db = fakeDb(), layer = createBlobLayer(db.rawQuery, { log: { error: m => errors.push(m) } });
  const ref = 'fbblob:' + 'a'.repeat(64);
  const res = await layer.hydrate({ rows: [{ data: { sketches: [{ image: ref }] } }], fields: [{ name: 'data', dataTypeID: 3802 }] });
  assert.equal(res.rows[0].data.sketches[0].image, ref); assert.equal(errors.length, 1);
});

test('rows come back hydrated for the array row mode and for several statements at once', async () => {
  const db = fakeDb(), layer = createBlobLayer(db.rawQuery), b = toBlob(A); await layer.save(new Map([[b.row.hash, b.row]]));
  const res = await layer.hydrate([{ rows: [[1, { image: b.ref }]], fields: [{ name: 'a', dataTypeID: 23 }, { name: 'data', dataTypeID: 3802 }] }, { rows: [{ data: { image: b.ref } }], fields: [{ name: 'data', dataTypeID: 3802 }] }]);
  assert.equal(res[0].rows[0][1].image, A); assert.equal(res[1].rows[0].data.image, A);
});

test('the cache is bounded', async () => {
  const db = fakeDb(), layer = createBlobLayer(db.rawQuery, { cacheBytes: 10 * 1024 });
  for (let i = 0; i < 6; i++) { const b = toBlob(picture(10 + i)); await layer.save(new Map([[b.row.hash, b.row]])); }
  assert.ok(layer.stats().cachedBytes <= 10 * 1024 + 8 * 1024 && layer.stats().cachedPictures < 6, JSON.stringify(layer.stats()));
});

test('a checked-out connection stores and reads its pictures on itself, never asks the pool for a second one, and a picture written in a transaction is stored again after it', async () => {
  const pool = fakeDb(), conn = fakeDb(), layer = createBlobLayer(pool.rawQuery);
  // the connection: transaction control, pack_blobs, and the json row
  const own = async (text, values) => (/^(begin|commit|rollback)/i.test(text) ? { rows: [], fields: [] } : /pack_blobs/.test(text) ? conn.rawQuery(text, values) : conn.run(text, values));
  const q = layer.wrap(own, { own: true });
  await q('begin'); await q('insert into t(data) values($1)', [{ hero: A }]); await q('rollback');
  assert.deepEqual(pool.calls, [], 'the pool was never asked');
  assert.ok(conn.blobs.size === 1, 'the picture went in on the same connection');
  conn.blobs.clear(); // the rollback took the picture with it
  await q('insert into t(data) values($1)', [{ hero: A }]);
  assert.equal(conn.blobs.size, 1, 'so the next write stores it again instead of trusting a row that was rolled back');
  const back = await q('select data from t');
  assert.equal(back.rows[0].data.hero, A, 'and it reads back whole, through the same connection');
  assert.deepEqual(pool.calls, []);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { tasteStats, tasteWords, signalsOf, tasteDigest } from '../src/lab-taste.js';
import { planRangeEdit, cleanRangeChanges, cleanFields, rangeFixture } from '../src/lab-range.js';
import { cleanVotes, voterKey, cleanEmail, pollResults, pieceView, lookbookPdf } from '../src/lab-lookbook.js';
import { generateConcepts } from '../src/lab-concepts.js';

const C = (name, status, spec, extra = {}) => ({ name, status, spec, category: 'tops', price_cents: 4500, client_verdict: '', client_note: '', rejected_reason: '', ...extra });

test('taste: every approval and rejection is counted per trait, and what we keep choosing comes out on top', () => {
  const s = tasteStats([
    C('A', 'approved', { fabric: 'Brushed cotton', colors: ['Navy'], details: ['rib neck'] }),
    C('B', 'tech_pack', { fabric: 'brushed cotton.', colors: ['navy', 'Olive'] }, { client_verdict: 'approved' }),
    C('C', 'rejected', { fabric: 'thin jersey', colors: ['red'] }, { rejected_reason: 'too thin' }),
    C('D', 'rejected', { fabric: 'thin jersey', colors: ['red'] }, { rejected_reason: 'loud' }),
    C('E', 'draft', { fabric: 'anything' })
  ]);
  assert.deepEqual(s.counts, { approved: 2, rejected: 2, clientApproved: 1, clientChanges: 0, read: 4 });
  const like = s.likes.find(e => e.kind === 'fabric'); assert.deepEqual([like.word, like.up, like.down], ['brushed cotton', 3, 0]);
  assert.ok(s.likes.some(e => e.kind === 'colour' && e.word === 'navy' && e.up === 3), 'navy, three times for');
  assert.ok(s.dislikes.some(e => e.kind === 'fabric' && e.word === 'thin jersey' && e.down === 2) && s.dislikes.some(e => e.word === 'red'), 'thin jersey and red are turned down');
  assert.ok(!s.likes.some(e => e.word === 'rib neck'), 'one approval is not a pattern');
  assert.deepEqual(s.reasons.map(r => r.why), ['too thin', 'loud']);
  assert.deepEqual(signalsOf({ status: 'approved', client_verdict: 'changes' }), { up: 1, down: 1 });
});
test('taste: the words the assistant gets say the counts, follow the digest when there is one, and are empty when switched off or too thin', () => {
  const s = tasteStats([C('A', 'approved', { fabric: 'brushed cotton' }), C('B', 'approved', { fabric: 'brushed cotton' }), C('C', 'rejected', { fabric: 'thin jersey' }, { rejected_reason: 'too thin' })]);
  const w = tasteWords({ ...s, use: true });
  assert.match(w, /2 approved, 1 rejected/); assert.match(w, /Fabric "brushed cotton" \(2 for, 0 against\)/); assert.match(w, /"too thin"/);
  assert.equal(tasteWords({ ...s, use: false }), '');
  assert.equal(tasteWords(tasteStats([C('A', 'approved', { fabric: 'x' })])), '', 'one concept is nothing to learn from');
  const d = tasteWords({ ...s, use: true, digest: { summary: 'We like quiet pieces.', likes: ['brushed cotton, again and again'], dislikes: ['thin fabric'] } });
  assert.match(d, /We like quiet pieces/); assert.match(d, /We lean towards: brushed cotton, again and again\./); assert.match(d, /We turn down: thin fabric\./);
});
test('taste: the assistant digest comes back cleaned, and the concept brief carries the learned taste for our lines, not a client line', async () => {
  const env = { AI_FIXTURE: '1' }, s = tasteStats([C('A', 'approved', { fabric: 'brushed cotton' }), C('B', 'approved', { fabric: 'brushed cotton' }), C('C', 'rejected', { fabric: 'thin' })]);
  const d = await tasteDigest({ stats: s, env });
  assert.ok(d.digest.summary.length > 10 && d.digest.likes.length >= 1 && d.digest.dislikes.length >= 1 && d.costCents === 0, JSON.stringify(d));
  const seen = [];
  const askImpl = async ({ system, user }) => { seen.push(system); return { json: { concepts: [{ name: 'Tee', description: 'd', silhouette: 's', fabric: 'f', fit: 'r', trims: 't', colors: ['navy'], details: ['a', 'b'], logo: { mark: 'cue', placement: 'left chest', technique: 'embroidered' }, graphics: [], twist: 'our own hem detail' }] }, usage: {} }; };
  const line = { name: 'Tee', category: 'tops', role: 'core', priceCents: 4500 };
  await generateConcepts({ line, taste: { ...s, use: true }, askImpl, env });
  assert.match(seen[0], /What the team has approved and rejected so far/);
  await generateConcepts({ line, taste: { ...s, use: true }, brand: { name: 'Acme' }, askImpl, env });
  assert.doesNotMatch(seen[1], /What the team has approved/, 'a client line is their taste, not ours');
});

test('range: one instruction becomes a change per piece, scoped to the pieces it names, with the rest left alone and said so', async () => {
  const cs = [{ id: 'a', name: 'Heavy tee', category: 'tops', spec: { fabric: 'cotton jersey 200 gsm', colors: ['navy', 'rust'] }, twist: 't' }, { id: 'b', name: 'Field cap', category: 'headwear', spec: { fabric: 'twill', colors: ['olive'] }, twist: 't' }, { id: 'c', name: 'Long sleeve tee', category: 'tops', spec: { fabric: 'cotton', colors: [] }, twist: 't' }];
  const r = await planRangeEdit({ instruction: 'make every tee 260 gsm and swap the accent to olive', concepts: cs, env: { AI_FIXTURE: '1' } });
  assert.deepEqual(r.changes.map(c => c.id), ['a', 'c']);
  assert.deepEqual(r.changes[0].fields, { fabric: 'cotton jersey 260 gsm', colors: ['navy', 'olive'] }); assert.deepEqual(r.changes[0].before, { fabric: 'cotton jersey 200 gsm', colors: ['navy', 'rust'] });
  assert.deepEqual(r.changes[1].fields, { fabric: '260 gsm cotton', colors: ['olive'] });
  assert.deepEqual(r.skipped, [{ id: 'b', name: 'Field cap', why: 'Not a tee' }]);
  assert.equal((await planRangeEdit({ instruction: 'x', concepts: [], env: { AI_FIXTURE: '1' } })).changes.length, 0);
  await assert.rejects(planRangeEdit({ instruction: 'x', concepts: cs, env: {} }), /Claude is not connected/);
});
test('range: a change the assistant sends that changes nothing is dropped, unknown pieces and fields are dropped, and only real changes are applied', () => {
  const cs = [{ id: 'a', name: 'Tee', category: 'tops', spec: { fabric: 'cotton', colors: ['navy', 'rust'], details: ['x'] }, twist: 'ours' }];
  assert.deepEqual(cleanFields({ fabric: '  wool  ', colors: 'navy, olive', details: 'a\nb', price: 9, name: 'nope' }), { fabric: 'wool', colors: ['navy', 'olive'], details: ['a', 'b'] });
  const out = cleanRangeChanges([{ id: 'a', fields: { fabric: 'cotton', colors: ['navy', 'olive'], twist: 'ours' }, why: 'accent' }, { id: 'zz', fields: { fabric: 'x' } }, { id: 'a', fields: { fabric: 'again' } }], cs);
  assert.deepEqual(out, [{ id: 'a', fields: { colors: ['navy', 'olive'] }, why: 'accent' }]);
  const fx = rangeFixture({ user: 'Instruction: add a hidden phone pocket\nPieces:\n[{"id":"a","name":"Tee","category":"tops","categoryLabel":"Tops and jersey","fabric":"cotton","colors":[],"details":["x"]}]\n\nAnswer {"changes":[]}' });
  assert.deepEqual(fx.changes[0].fields, { details: ['x', 'add a hidden phone pocket'] });
});

test('poll: votes are cleaned to the pieces in the poll, a voter is one key, and the results are a demand read per piece', () => {
  assert.deepEqual(cleanVotes([{ id: 'a', vote: 'yes', price: 'fair', note: ' longer ' }, { id: 'a', vote: 'no' }, { id: 'b', vote: 'sure' }, { id: 'z', vote: 'yes' }], ['a', 'b']), [{ id: 'a', vote: 'no', price: '', note: '' }]);
  assert.equal(voterKey({ email: ' Sam@Example.com ' }), voterKey({ email: 'sam@example.com', ip: '1.1.1.1' })); assert.notEqual(voterKey({ ip: '1.1.1.1' }), voterKey({ ip: '1.1.1.2' }));
  assert.equal(cleanEmail('Sam@Example.com'), 'sam@example.com'); assert.equal(cleanEmail('nope'), '');
  const r = pollResults([{ id: 'a', name: 'Tee', categoryLabel: 'Tops', priceLabel: '$45' }, { id: 'b', name: 'Cap', categoryLabel: 'Headwear', priceLabel: '$30' }, { id: 'c', name: 'Bag', categoryLabel: 'Bags', priceLabel: '' }],
    [{ concept_id: 'a', vote: 'yes', price: 'fair', voter_key: '1' }, { concept_id: 'a', vote: 'maybe', price: 'high', voter_key: '2', note: 'longer', voter_name: 'Sam' }, { concept_id: 'b', vote: 'no', voter_key: '1' }, { concept_id: 'b', vote: 'no', price: 'high', voter_key: '2' }]);
  assert.equal(r.voters, 2);
  assert.deepEqual(r.pieces.map(p => [p.name, p.rank, p.demand, p.read, p.priceFeel]), [['Tee', 1, 75, 'make it', 'fair'], ['Cap', 2, 0, 'think again', 'too high'], ['Bag', null, null, 'no votes yet', '']]);
  assert.deepEqual(r.pieces[0].notes, [{ who: 'Sam', note: 'longer' }]);
});
test('lookbook: a piece is its words and planned price only, and the PDF has a cover and a page per piece', async () => {
  const p = pieceView({ id: 'a', name: 'Heavy tee', category: 'tops', price_cents: 4500, spec: { description: 'A boxy tee', fabric: '260 gsm cotton', colors: ['navy', 'olive'], details: ['rib neck'], colourways: [{ name: 'Ink', hex: '#141416' }] }, twist: 'our hem', closeness: { verdict: 'clear' }, cost_cents: 1200, has_image: false });
  assert.equal(p.priceLabel, '$45'); assert.equal(p.colourways[0].hex, '#141416'); assert.ok(!('closeness' in p) && !('cost' in p));
  const pdf = await lookbookPdf({ plan: { name: 'Fall capsule', season: 'Fall 2027', brief: 'Quiet basics' }, pieces: [{ ...p, image: null }, { ...pieceView({ id: 'b', name: 'Cap', category: 'headwear', spec: {} }), image: null }] });
  assert.ok(pdf.length > 5000 && pdf.slice(0, 5).toString() === '%PDF-'); assert.equal((pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3, 'a cover and two pieces');
});

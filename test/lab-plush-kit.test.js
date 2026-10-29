// The plush kit (body types and the parts that go on them), the picture's reading of them, and the developer check that brings the drawing
// close to the concept's picture with two judges.
import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { cleanPlush, plushPattern, layoutOf, explodeAt, PLUSH_PARTS } from '../src/lab-pattern.js';
import { plushViews } from '../src/lab-plush-views.js';
import { plushProposal } from '../src/lab-plush-read.js';
import { reviewPlush, applyFix, mergeFixes, sheetSvg, REVIEW_SCHEMA, CRITERIA } from '../src/lab-plush-review.js';

const fox = { shape: 'quad', animal: 'fox', snout: 'long', ears: 'pointed', tailType: 'bushy', colours: { body: '#d9772e', contrast: '#f4ead8' } };
const set = [fox,
  { shape: 'quad', animal: 'unicorn', snout: 'broad', horn: 'one', mane: 'crest', tailType: 'hair' },
  { shape: 'quad', animal: 'lion', mane: 'ruff', tailType: 'tuft', ears: 'round' },
  { shape: 'quad', animal: 'dragon', horn: 'two', wings: true, spikes: true, ears: 'none' },
  { shape: 'quad', animal: 'dog', ears: 'floppy', tailType: 'short' },
  { shape: 'quad', animal: 'deer', horn: 'antlers' },
  { shape: 'sea', animal: 'whale', tailType: 'fluke' }, { shape: 'sea', animal: 'shark', tailType: 'fin', dorsal: true, spikes: true },
  { shape: 'bear', horn: 'one', wings: true, snout: 'long' }, { shape: 'bean', horn: 'antlers', wings: true }];

test('the kit\'s choices are bounded: parts by name, a mane as a ruff or a crest, a sea tail a fluke or a fin, the head from 0.8 to 1.3', () => {
  const s = cleanPlush({ shape: 'quad', snout: 'beak', horn: 'three', mane: true, tailType: 'fluke', head: 2, wings: 'yes' });
  assert.equal(s.snout, 'short', 'an unknown snout falls back to the body type\'s'); assert.equal(s.horn, 'none'); assert.equal(s.mane, 'ruff', 'a mane asked for as yes is a ruff');
  assert.equal(s.tailType, 'long', 'a fluke is a sea creature\'s'); assert.equal(s.head, 1.3); assert.equal(s.wings, true);
  assert.equal(cleanPlush({ shape: 'sea', tailType: 'bushy' }).tailType, 'fluke'); assert.equal(cleanPlush({ shape: 'quad', head: .937 }).head, .95);
  assert.equal(cleanPlush({ shape: 'quad', colours: { body: '#ABCDEF', mane: '#112233', eyes: 'x' } }).colours.mane, '#112233', 'a mane keeps its own colour');
});

test('each animal in the kit drafts the pieces its parts need, cut and counted, and is drawn from the front, back and side', () => {
  for (const sp of set) {
    const pat = plushPattern(sp), ids = pat.pieces.map(q => q.id), name = sp.animal || sp.shape;
    if (sp.horn === 'one') assert.ok(ids.includes('horn'), `${name}: a horn`);
    if (sp.horn === 'two') assert.ok(ids.includes('horn') && pat.pieces.find(q => q.id === 'horn').cut === 4, `${name}: two horns, a pair each`);
    if (sp.horn === 'antlers') assert.ok(ids.includes('antler'), `${name}: antlers`);
    if (sp.mane && sp.mane !== 'none') assert.match(pat.pieces.find(q => q.id === 'mane').notes[0], sp.mane === 'ruff' ? /round the face/ : /down the back of the neck/);
    if (sp.wings) assert.equal(pat.pieces.find(q => q.id === 'wing').cut, 4, `${name}: two wings, lined`);
    if (sp.spikes) assert.ok(ids.includes('spikes'), `${name}: spikes`);
    if (sp.shape === 'sea') { assert.ok(ids.includes('belly') && ids.includes('fin'), 'a sea creature: a belly gusset and side fins'); assert.match(pat.size, /long$/); }
    if (sp.shape === 'quad') assert.ok(ids.includes('leg-front') && ids.includes('leg-hind') && ids.includes('foot-pad'), `${name}: four legs on pads`);
    // every cut shows in the exploded view, as for every other pattern
    const lay = layoutOf(pat), cuts = pat.pieces.reduce((n, q) => n + (q.cut || 0), 0); assert.equal(explodeAt(pat, .45, lay).filter(x => x.cut).length, cuts, `${name}: every cut exploded`);
    const v = plushViews(pat); for (const k of ['front', 'back', 'side']) { assert.ok(v[k].svg.length > 500 && !/NaN|Infinity|undefined/.test(v[k].svg), `${name} ${k}`); assert.ok(v[k].box.x1 > v[k].box.x0, `${name} ${k} box`); }
  }
  assert.match(plushPattern(fox).label, /^Fox · four-legged sitting body$/);
});

test('the picture\'s reading carries the body type and every part into the pattern', () => {
  const p = plushProposal({}, { plush: true, view: 'three-quarter', animal: 'Unicorn', shape: 'quad', heightIn: 13, ears: 'pointed', snout: 'broad', horn: 'one', mane: 'crest', wings: false, spikes: false, dorsal: false, tailType: 'hair', head: 1.1, arms: false, legs: true, tail: true, fabric: 'minky', eyes: 'embroidered', colours: { body: '#f6f1ea', contrast: '#e7b6d0', mane: '#c9a6e8' }, why: 'A white unicorn sitting' });
  assert.deepEqual([p.spec.shape, p.spec.snout, p.spec.horn, p.spec.mane, p.spec.tailType, p.spec.head, p.spec.colours.mane], ['quad', 'broad', 'one', 'crest', 'hair', 1.1, '#c9a6e8']);
  assert.ok(REVIEW_SCHEMA.properties.fixes.items.properties.field.enum.includes('snout'));
});

test('a developer\'s change is made on the toy\'s choices: a new body type brings its own parts, a part the body cannot take is not made', () => {
  const bear = cleanPlush({ shape: 'bear', animal: 'fox', colours: { body: '#d9772e' }, fabric: 'velboa' });
  const a = applyFix(bear, { field: 'shape', value: 'quad', why: 'it sits on four legs' });
  assert.equal(a.spec.shape, 'quad'); assert.equal(a.spec.legs, true); assert.equal(a.spec.fabric, 'velboa', 'the cloth stays'); assert.equal(a.spec.colours.body, '#d9772e', 'the colour stays'); assert.equal(a.spec.animal, 'fox');
  assert.equal(applyFix(cleanPlush({ shape: 'sea' }), { field: 'horn', value: 'one' }), null, 'a sea creature takes no horn');
  assert.equal(applyFix(a.spec, { field: 'snout', value: 'beak' }), null, 'not a snout the kit has');
  assert.equal(applyFix(a.spec, { field: 'head', value: '1.2' }).spec.head, 1.2);
  // two judges: what they agree on is made (numbers met in the middle); what they disagree on is left for a person; the body type goes first
  const m = mergeFixes([{ name: 'Claude', fixes: [{ field: 'snout', value: 'long', why: 'a fox' }, { field: 'head', value: '1.1' }, { field: 'shape', value: 'quad' }] }, { name: 'ChatGPT', fixes: [{ field: 'snout', value: 'short', why: 'blunt' }, { field: 'head', value: '1.2' }] }]);
  assert.equal(m.fixes[0].field, 'shape');
  const c = mergeFixes([{ name: 'Claude', fixes: [{ field: 'colours.body', value: '#d9772e' }, { field: 'colours.mane', value: '#ffffff' }] }, { name: 'ChatGPT', fixes: [{ field: 'colours.body', value: '#db7a30' }, { field: 'colours.mane', value: '#202020' }] }]);
  assert.equal(c.fixes.find(f => f.field === 'colours.body').value, '#da792f', 'two near oranges are one orange, met in the middle'); assert.deepEqual(c.conflicts.map(x => x.field), ['colours.mane'], 'white against black is a disagreement'); assert.ok(m.fixes.some(f => f.field === 'head' && Math.abs(Number(f.value) - 1.15) < 1e-9)); assert.deepEqual(m.conflicts.map(c => c.field), ['snout']);
});

test('the developer check: two judges score the three views against the picture, their changes are made round by round until it clears 90', async () => {
  const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#d9772e' } }).png().toBuffer();
  const crit = n => CRITERIA.map(c => ({ key: c.key, score: n, note: n < 90 ? 'differs' : '' }));
  const first = { view: 'three-quarter', criteria: crit(52), fixes: [{ field: 'shape', value: 'quad', why: 'it sits on four legs' }, { field: 'snout', value: 'long', why: 'a fox\'s snout' }, { field: 'tailType', value: 'bushy', why: 'a bushy tail' }, { field: 'ears', value: 'pointed', why: 'pointed ears' }], beyondDrawing: ['a scarf'], summary: 'A fox drawn as a bear' };
  const second = { view: 'three-quarter', criteria: crit(93), fixes: [], beyondDrawing: [], summary: 'Reads as the fox' };
  const seen = [], judge = (name, answers) => { let i = 0; return { name, ask: async (system, content, schema) => { seen.push({ name, content, schema }); return answers[Math.min(i++, answers.length - 1)]; } }; };
  const rounds = [], res = await reviewPlush({ spec: { shape: 'bear', animal: 'fox' }, photo, name: 'Fox', judges: [judge('Claude', [first, second]), judge('ChatGPT', [{ ...first, fixes: first.fixes.slice(0, 2), criteria: crit(48) }, { ...second, criteria: crit(91) }])], onRound: r => rounds.push(r) });
  assert.equal(res.status, 'passed'); assert.equal(res.score, 91, 'the stricter judge stands'); assert.deepEqual([res.spec.shape, res.spec.snout, res.spec.tailType, res.spec.ears], ['quad', 'long', 'bushy', 'pointed']);
  assert.equal(res.rounds.length, 2); assert.equal(res.rounds[0].score, 48); assert.deepEqual(res.beyondDrawing, ['a scarf']);
  assert.ok(res.changes.find(c => c.key === 'shape').judges.length === 2, 'both asked for the body type');
  const blocks = seen[0].content; assert.equal(blocks.filter(b => b.type === 'image').length, 2, 'the picture and the drawn views'); assert.match(blocks.at(-1).text, /Which body types take each part/);
  assert.match(sheetSvg(res.spec), /front<\/text>.*back<\/text>.*side<\/text>/s);
  // no judge connected: only the pattern's own checks
  const none = await reviewPlush({ spec: fox, photo, judges: [] }); assert.equal(none.status, 'checks-only'); assert.equal(none.score, null);
});

test('every body type lists the parts it takes, and every part is drawn on them', () => {
  for (const [part, shapes] of Object.entries(PLUSH_PARTS)) for (const shape of shapes) {
    const on = { snout: { snout: 'long' }, horn: { horn: 'one' }, mane: { mane: 'ruff' }, wings: { wings: true }, spikes: { spikes: true }, dorsal: { dorsal: true }, tailType: { tailType: shape === 'sea' ? 'fin' : 'bushy' }, head: { head: 1.25 } }[part];
    const norm = v => v.replace(/p\d+(-\d+)?/g, 'p'), off = { dorsal: { dorsal: false }, tailType: {}, head: {} }[part] || {}, a = norm(plushViews(plushPattern({ shape, ...off })).side.svg), b = norm(plushViews(plushPattern({ shape, ...on })).side.svg); // each drawing has its own ids
    assert.notEqual(a, b, `${part} on ${shape} changes the side view`);
  }
});

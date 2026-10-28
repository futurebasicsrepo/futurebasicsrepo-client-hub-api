import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_TECHNIQUES, TECHNIQUE_KINDS, EFFECTS, cleanFinish, cleanTechnique, realPrompt } from '../src/lab-library.js';
import { GRAPHIC_TECHNIQUES, cleanGraphics } from '../src/lab-concepts.js';

test('the starting techniques cover every kind, and each is complete', () => {
  for (const k of TECHNIQUE_KINDS) assert.ok(BUILTIN_TECHNIQUES.some(t => t.kind === k.id), k.id);
  assert.equal(new Set(BUILTIN_TECHNIQUES.map(t => t.key)).size, BUILTIN_TECHNIQUES.length, 'keys are unique');
  for (const t of BUILTIN_TECHNIQUES) {
    assert.ok(GRAPHIC_TECHNIQUES.includes(t.base), `${t.key} goes on the tech pack as a known technique`);
    assert.ok(EFFECTS.includes(t.finish.effect), t.key);
    assert.ok(t.prompt.length > 40 && t.summary.length > 10, `${t.key} says how it looks`);
    assert.deepEqual(cleanFinish(t.finish), t.finish, `${t.key} keeps its finish as written`);
  }
  for (const k of ['satin-embroidery', 'puff-embroidery', 'chain-stitch', 'plastisol', 'water-based', 'vintage-cracked', 'puff-print', 'glossy-transfer', 'chenille', 'sun-faded']) assert.ok(BUILTIN_TECHNIQUES.some(t => t.key === k), k);
});

test('a finish is kept within bounds', () => {
  const f = cleanFinish({ effect: 'lasers', strength: 9, raise: -3, blend: 'xor', opacity: 0, distress: { style: 'shredded', amount: 4 } });
  assert.equal(f.effect, 'none'); assert.equal(f.strength, 1); assert.equal(f.raise, 0); assert.equal(f.blend, 'source-over'); assert.equal(f.opacity, .05);
  assert.deepEqual(f.distress, { style: 'worn', amount: 1, size: 50 });
  assert.equal(cleanFinish({ effect: 'stitch', stitch: 'chain' }).stitch, 'chain');
  assert.equal(cleanFinish({}).effect, 'none');
});

test('a technique needs a name and a kind, and goes on the tech pack as a known technique', () => {
  assert.match(cleanTechnique({ name: 'x', kind: 'print' }).error, /name/);
  assert.match(cleanTechnique({ name: 'Bleach splatter', kind: 'graffiti' }).error, /kind/);
  const t = cleanTechnique({ name: 'Bleach splatter', kind: 'distress', base: 'lasering' }).technique;
  assert.equal(t.base, 'screen print'); assert.equal(t.finish.effect, 'none');
  assert.equal(cleanTechnique({ name: 'Felt letters', kind: 'patch', base: 'Appliqué' }).technique.base, 'appliqué');
  assert.equal(cleanTechnique({ summary: 'changed' }, { name: 'Kept', kind: 'embroidery' }).technique.name, 'Kept', 'an edit keeps what it does not change');
  assert.equal(cleanTechnique({ name: 'Thread', kind: 'embroidery' }).technique.base, 'embroidery');
});

test('making a technique real keeps the design and stays within the painted area', () => {
  const t = { name: 'Satin stitch embroidery', prompt: 'long glossy stitches', summary: '' };
  assert.match(realPrompt(t, { masked: true }), /Only inside the transparent area of the mask/);
  assert.match(realPrompt(t, { masked: true }), /Technique: Satin stitch embroidery\. long glossy stitches/);
  assert.match(realPrompt(t, { swatch: true }), /close-up photograph/);
  assert.match(realPrompt(t, { photos: 2 }), /pictures show real examples/);
  assert.doesNotMatch(realPrompt(t, { photos: 0 }), /real examples/);
  for (const p of [realPrompt(t), realPrompt(t, { swatch: true })]) { assert.match(p, /Keep the graphic's design, shapes, words, spelling and colours exactly/); assert.match(p, /any other company's name, logo or trade dress/); }
});

test('a concept graphic remembers which technique it is made with', () => {
  const id = '0e5b2f4a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
  const [g] = cleanGraphics([{ name: 'Bolt', idea: 'from the library', placement: 'front chest', technique: 'embroidery', art: id, finish: { id, name: '3D puff embroidery' } }]);
  assert.deepEqual(g.finish, { id, name: '3D puff embroidery' });
  assert.equal(cleanGraphics([{ name: 'Bolt', idea: 'x', finish: { id: 'nope', name: 'x' } }])[0].finish, undefined);
});

test('every way a graphic is made: 44 techniques across six kinds, the new finishes kept whole, and the renderer knows every effect', async () => {
  assert.ok(BUILTIN_TECHNIQUES.length >= 44 && TECHNIQUE_KINDS.length === 6 && TECHNIQUE_KINDS.some(k => k.id === 'other'));
  for (const key of ['metallic-thread', 'tonal-embroidery', 'tackle-twill', 'high-density', 'metallic-ink', 'glitter', 'flock', 'dtg', 'silicone-3d', 'dtf', 'vinyl-matte', 'holographic', 'sublimation', 'leather-patch', 'metal-plaque', 'knit-in', 'laser-etch', 'rhinestones']) assert.ok(BUILTIN_TECHNIQUES.some(t => t.key === key), key);
  const f = cleanFinish({ effect: 'stitch', thread: 'metallic', metal: 'silver', sparkle: 2 }); assert.equal(f.thread, 'metallic'); assert.equal(f.sparkle, 1); assert.equal(cleanFinish({ effect: 'nope', thread: 'x' }).thread, 'polyester');
  assert.equal(cleanFinish({ effect: 'silicone' }).effect, 'silicone'); assert.equal(cleanFinish({ effect: 'stud' }).effect, 'stud');
  const src = (await import('node:fs')).readFileSync(new URL('../src/lab-finish.js', import.meta.url), 'utf8');
  for (const e of EFFECTS) assert.ok(e === 'none' || src.includes(`fx === '${e}'`), `the renderer draws ${e}`);
  assert.deepEqual(/EFFECTS: \[([^\]]+)\]/.exec(src)[1].split(',').map(s => s.trim().replace(/'/g, '')), EFFECTS, 'the page and the server agree on the effects');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { measureColours, snapColours, nearestName, colourDistance, paletteDrift, heroPrompt, heroConfig, heroCandidates, pickHero, refinePrompt, refineHero, HERO_APPROVE_MIN, HERO_REFINE_ROUNDS } from '../src/studio.js';
import { guidedPrompt, specBrief } from '../src/check.js';
import { normalizeTechPack } from '../src/techpack.js';

// a "shoe": a navy body, a white sole, a red heel tab, on a plain light backdrop
async function shoe() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#f2f2f2"/>
    <rect x="80" y="120" width="440" height="140" rx="40" fill="#1d2a4a"/><rect x="70" y="250" width="460" height="45" rx="18" fill="#ffffff" stroke="#cccccc"/><rect x="440" y="130" width="60" height="50" rx="10" fill="#c8202a"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}
const dataUrl = b => `data:image/jpeg;base64,${b.toString('base64')}`;

test('colours are measured from the pixels and named', async () => {
  const m = await measureColours(dataUrl(await shoe()));
  assert.ok(m.length >= 2, 'at least the body and one more colour');
  assert.equal(m[0].name, 'Navy', 'the biggest area is the navy body'); assert.ok(m[0].share > 0.4);
  assert.ok(colourDistance(m[0].hex, '#1d2a4a') < 8, 'and its hex is the real pixel colour');
  assert.ok(m.some(c => /red|scarlet/i.test(c.name)), 'the small red tab is found', m.map(c => c.name));
  assert.deepEqual(await measureColours('nope'), []);
});

test('names come from a list written for apparel', () => {
  assert.equal(nearestName('#1d2a4a'), 'Navy'); assert.equal(nearestName('#fafafa'), 'White'); assert.equal(nearestName('#101012'), 'Black'); assert.equal(nearestName('#b38a5c'), 'Gum');
  assert.equal(nearestName('nope'), '');
});

test('the pack\'s colours move onto the measured ones', () => {
  const measured = [{ hex: '#1d2a4a', name: 'Navy', share: 0.6 }, { hex: '#c8202a', name: 'Red', share: 0.1 }, { hex: '#f5f5f2', name: 'White', share: 0.2 }];
  const pack = normalizeTechPack({ sizes: ['10'], colorways: [
    { name: 'Deep blue', swatch: '#2b3d6b', notes: 'upper · Seen in the photo — client to confirm' },
    { name: 'Neon green', swatch: '#39ff14', notes: 'Suggested alternative — client to confirm' }],
    bom: [{ component: 'Upper', color: 'Blue #2a3c68' }, { component: 'Sole', color: 'Pink #ff66aa' }, { component: 'Lining', color: 'Mesh' }] });
  const { pack: out, changed } = snapColours(pack, measured);
  assert.ok(changed >= 3);
  const deep = out.colorways[0]; assert.equal(deep.swatch, '#1d2a4a'); assert.match(deep.notes, /^upper · Seen in the photo, measured from the pixels \(60% of the product\)/);
  assert.equal(out.colorways.find(c => c.name === 'Neon green').swatch, '#39ff14', 'a suggested alternative is left alone');
  assert.ok(out.colorways.some(c => c.swatch === '#c8202a' && /measured/.test(c.notes)), 'a colour the assistant missed is added');
  assert.ok(out.colorways.some(c => c.swatch === '#f5f5f2'));
  assert.match(out.bom[0].color, /^Blue #1d2a4a · PANTONE .+ C$/, 'a BOM colour near a measured one is snapped, and its Pantone C follows'); assert.equal(out.bom[1].color, 'Pink #ff66aa', 'one far from every measured colour is not'); assert.equal(out.bom[2].color, 'Mesh');
  assert.equal(snapColours(pack, []).changed, 0);
});

test('palette drift is how far the photo\'s colours are from the candidate\'s', () => {
  const a = [{ hex: '#1d2a4a', share: 0.7 }, { hex: '#c8202a', share: 0.3 }];
  assert.equal(paletteDrift(a, a), 0);
  assert.ok(paletteDrift(a, [{ hex: '#1d2a4a', share: 1 }]) > 20, 'a missing red costs');
  assert.equal(paletteDrift([], a), null);
});

test('the hero prompt asks for the same product, nothing invented', () => {
  const p = heroPrompt({ title: 'Layer runner', category: 'Footwear' });
  assert.match(p, /SAME product/); assert.match(p, /Do not invent logos/); assert.match(p, /Layer runner/);
});

test('the hero needs an image model; the stand-in makes candidates and picks one', async () => {
  assert.equal(heroConfig({}).configured, false); assert.equal(heroConfig({ HERO_DISABLED: 'true', OPENAI_API_KEY: 'k' }).provider, 'off'); assert.equal(heroConfig({ OPENAI_API_KEY: 'k' }).provider, 'openai');
  await assert.rejects(heroCandidates({ photos: [dataUrl(await shoe())], meta: {}, cfg: heroConfig({}) }), /No image model/);
  const cfg = { provider: 'fixture', configured: true, model: 'fixture' }, photo = dataUrl(await shoe());
  const cands = await heroCandidates({ photos: [photo], meta: { title: 'Runner' }, n: 3, cfg });
  assert.equal(cands.length, 3); assert.ok((await sharp(cands[0].buffer).metadata()).width === 1024);
  const pick = await pickHero({ photo, candidates: cands, photoPalette: await measureColours(photo), cfg });
  assert.equal(pick.scores.length, 3); assert.equal(pick.best, 0); assert.ok(pick.scores[0].drift != null && pick.scores[0].drift < 12, 'the stand-in keeps the photo\'s colours', pick.scores[0].drift);
});

test('with a hero, the render is told to follow it and the pack', () => {
  const p = normalizeTechPack({ style: { styleName: 'Runner', category: 'Footwear' }, sizes: ['10'], bom: [{ component: 'Upper', material: 'Mesh', color: 'Navy #1d2a4a' }] });
  const b = specBrief(p, { title: 'Runner' }), g = guidedPrompt(b, { camera: 'three-quarter front view' });
  assert.match(g, /reference image is the approved picture/); assert.match(g, /follow the tech pack/); assert.match(g, /TECH PACK:/); assert.match(g, /Mesh/);
});

test('a dark brown leather is not called graphite, and the assistant\'s own name stays unless its colour was far off', () => {
  assert.notEqual(nearestName('#3b2a29'), 'Graphite'); assert.ok(['Dark brown', 'Espresso', 'Oxblood', 'Mahogany', 'Chocolate', 'Black cherry'].includes(nearestName('#3b2a29')), nearestName('#3b2a29'));
  assert.equal(nearestName('#4a1e22'), 'Oxblood');
  const measured = [{ hex: '#3b2a29', name: 'Dark brown', share: 0.7 }];
  const pack = normalizeTechPack({ sizes: ['10'], colorways: [{ name: 'Dark Oxblood-Brown', swatch: '#4a2a2a', notes: 'upper · Seen in the photo — client to confirm' }] });
  assert.equal(snapColours(pack, measured).pack.colorways[0].name, 'Dark Oxblood-Brown', 'a close colour keeps the assistant\'s name');
  const far = normalizeTechPack({ sizes: ['10'], colorways: [{ name: 'Sky', swatch: '#6a8ae0', notes: 'upper · Seen in the photo — client to confirm' }] });
  assert.equal(snapColours(far, [{ hex: '#7a96d8', name: 'Cobalt', share: 0.7 }]).pack.colorways[0].name, 'Sky');
  const twins = normalizeTechPack({ sizes: ['10'], colorways: [{ name: 'Black', swatch: '#0f0f10', notes: 'sole · Seen in the photo — client to confirm' }, { name: 'Jet Black', swatch: '#141415', notes: 'trim · Seen in the photo — client to confirm' }, { name: 'Red', swatch: '#cc2222', notes: 'Suggested alternative — client to confirm' }] });
  assert.deepEqual(snapColours(twins, [{ hex: '#101011', name: 'Black', share: 0.5 }]).pack.colorways.map(c => c.name), ['Black', 'Red'], 'two observed colourways that read as one are one; alternatives stay');
});

test('a try that is not good enough is corrected against the photo: both go in, and the problem is named', async () => {
  const p = refinePrompt({ title: 'Trail runner', category: 'Footwear', issues: 'the heel is a different colour and the toe overlay is missing' });
  assert.match(p, /Image 1 is the reference photo of Trail runner/); assert.match(p, /Image 2 is a draft/);
  assert.match(p, /heel is a different colour and the toe overlay is missing/); assert.match(p, /Do not add logos, text or features/);
  const photo = `data:image/jpeg;base64,${(await shoe()).toString('base64')}`;
  const out = await refineHero({ photos: [photo], best: await shoe(), issues: 'colour drift', meta: { title: 'Shoe' }, cfg: { provider: 'fixture', configured: true } });
  assert.ok(out.buffer.length > 500 && /colour drift/.test(out.prompt));
  await assert.rejects(async () => refineHero({ photos: [photo], best: await shoe(), issues: '', meta: {}, cfg: { provider: 'none', configured: false } }), /No image model/);
});

test('the bar for approving a hero by itself and the number of corrections are settable, with safe defaults', () => {
  const keep = { a: process.env.HERO_APPROVE_MIN, b: process.env.HERO_REFINE_ROUNDS };
  delete process.env.HERO_APPROVE_MIN; delete process.env.HERO_REFINE_ROUNDS;
  assert.equal(HERO_APPROVE_MIN(), 80); assert.equal(HERO_REFINE_ROUNDS(), 2);
  process.env.HERO_APPROVE_MIN = '90'; process.env.HERO_REFINE_ROUNDS = '0'; assert.equal(HERO_APPROVE_MIN(), 90); assert.equal(HERO_REFINE_ROUNDS(), 0, 'zero turns correction off');
  process.env.HERO_REFINE_ROUNDS = '9'; assert.equal(HERO_REFINE_ROUNDS(), 3, 'capped');
  if (keep.a === undefined) delete process.env.HERO_APPROVE_MIN; else process.env.HERO_APPROVE_MIN = keep.a;
  if (keep.b === undefined) delete process.env.HERO_REFINE_ROUNDS; else process.env.HERO_REFINE_ROUNDS = keep.b;
});

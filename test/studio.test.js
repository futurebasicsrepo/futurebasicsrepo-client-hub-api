import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { measureColours, snapColours, nearestName, colourDistance, paletteDrift, heroPrompt, heroConfig, heroCandidates, pickHero } from '../src/studio.js';
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
  assert.equal(out.bom[0].color, 'Blue #1d2a4a', 'a BOM colour near a measured one is snapped'); assert.equal(out.bom[1].color, 'Pink #ff66aa', 'one far from every measured colour is not'); assert.equal(out.bom[2].color, 'Mesh');
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

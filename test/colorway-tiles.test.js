import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { renderColorways } from '../src/colorway.js';

// a dark oxblood-brown "loafer" with a black sole on a white backdrop
async function loafer() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="400"><rect width="700" height="400" fill="#ffffff"/>
    <path d="M90 250 C90 160 200 120 330 130 L520 150 C620 160 640 230 600 270 L120 290 Z" fill="#3b2024"/><rect x="85" y="262" width="530" height="40" rx="20" fill="#161618"/></svg>`;
  return `data:image/jpeg;base64,${(await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer()).toString('base64')}`;
}

test('colourway tiles are made only when they show something new and usable', async () => {
  const tiles = await renderColorways(await loafer(), [
    { name: 'Dark Oxblood-Brown', swatch: '#3b2024' },   // the colour the photo already has
    { name: 'White', swatch: '#f4f4f2' },                // pale on dark glossy: a ghost
    { name: 'Cognac Tan', swatch: '#9a5b2e' },
    { name: 'Tan', swatch: '#a05c30' },                  // reads the same as the one before
    { name: 'Navy', swatch: '#1d2a4a' }
  ]);
  const names = tiles.filter(t => !/palette/.test(t.id)).map(t => t.name);
  assert.ok(names.includes('Cognac Tan') && names.includes('Navy'), names);
  assert.ok(!names.includes('Dark Oxblood-Brown'), 'the product\'s own colour is the cut-out, not a tile');
  assert.ok(!names.includes('White'), 'no washed-out ghost'); assert.ok(!names.includes('Tan'), 'no near-duplicate');
});

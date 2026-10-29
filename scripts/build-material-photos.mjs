// Makes the materials library's photos (src/material-photos/<id>.jpg) from the sources listed in src/lab-photos.js: downloads each scan,
// cuts a close-up showing `mm` of cloth across (or the `crop` part of a Commons photo), and for fabrics keeps it in grey, levelled to a middle
// grey, so the server can recolour it to any colour. Run it again after changing the list: node scripts/build-material-photos.mjs [id …]
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MATERIAL_PHOTOS } from '../src/lab-photos.js';

const OUT = new URL('../src/material-photos/', import.meta.url), SIZE = 640, UA = 'FutureBasicsMaterialLibrary/1.0 (https://thefuturebasics.com)';
const CACHE = join(tmpdir(), 'fb-material-photo-sources'); mkdirSync(CACHE, { recursive: true }); mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'user-agent': UA } });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (r.status !== 429 && r.status < 500) throw new Error(`${r.status} ${url}`);
    await sleep(10_000 * (i + 1));
  }
  throw new Error(`gave up on ${url}`);
}
async function cached(key, fn) { const f = join(CACHE, key); if (existsSync(f)) return readFileSync(f); const b = await fn(); writeFileSync(f, b); return b; }

// → { img: Buffer, mm: width of the whole picture in mm }
async function source(p) {
  const s = p.src;
  if (s.site === 'polyhaven') {
    const info = JSON.parse(await get(`https://api.polyhaven.com/info/${s.asset}`)), files = JSON.parse(await get(`https://api.polyhaven.com/files/${s.asset}`));
    const url = files.Diffuse['4k']?.jpg?.url || files.Diffuse['2k'].jpg.url;
    return { img: await cached(`ph-${s.asset}-4k.jpg`, () => get(url)), mm: Number(info.dimensions?.[0]) || 1000 };
  }
  if (s.site === 'ambientcg') {
    const zip = await cached(`acg-${s.asset}-2k.zip`, () => get(`https://ambientcg.com/get?file=${s.asset}_2K-JPG.zip`)), z = join(CACHE, `acg-${s.asset}-2k.zip`);
    if (!existsSync(z)) writeFileSync(z, zip);
    const img = execFileSync('unzip', ['-p', z, `${s.asset}_2K-JPG_Color.jpg`], { maxBuffer: 64 << 20 });
    const meta = JSON.parse(await get(`https://ambientcg.com/api/v2/full_json?id=${s.asset}&include=dimensionsData`)).foundAssets?.[0];
    return { img, mm: (Number(meta?.dimensionX) || 40) * 10 };
  }
  const name = s.file.replace(/ /g, '_'), h = createHash('md5').update(name).digest('hex');
  return { img: await cached(`wc-${h}.jpg`, () => get(`https://upload.wikimedia.org/wikipedia/commons/${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`)), mm: 0 };
}

async function build(p) {
  const { img, mm } = await source(p), meta = await sharp(img).metadata();
  let box;
  if (p.src.crop) { const [x, y, w, h] = p.src.crop; box = { left: Math.round(x * meta.width), top: Math.round(y * meta.height), width: Math.round(w * meta.width), height: Math.round(h * meta.height) }; }
  else { const px = Math.min(meta.width, meta.height, Math.round(meta.width / mm * p.src.mm)); box = { left: Math.round(meta.width / 2 - px / 2), top: Math.round(meta.height / 2 - px / 2), width: px, height: px }; }
  let pic = sharp(img).extract(box);
  if (!p.tint) return pic.resize({ width: SIZE, height: SIZE, fit: 'inside' }).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  // grey, levelled: the middle at 128 and the weave's light and shade kept, stretched where the scan is flat
  const { data, info } = await pic.resize(SIZE, SIZE, { fit: 'cover' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0, sq = 0; for (const v of data) { sum += v; sq += v * v; }
  const mean = sum / data.length, sd = Math.sqrt(Math.max(1, sq / data.length - mean * mean)), k = Math.min(2.4, Math.max(.8, 30 / sd));
  const out = Buffer.alloc(data.length); for (let i = 0; i < data.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(128 + (data[i] - mean) * k)));
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

const only = process.argv.slice(2);
for (const p of MATERIAL_PHOTOS) {
  if (only.length && !only.includes(p.id)) continue;
  try { const b = await build(p); writeFileSync(new URL(`${p.id}.jpg`, OUT), b); console.log(`${p.id}.jpg  ${(b.length / 1024).toFixed(0)} KB`); }
  catch (e) { console.error(`${p.id}: ${e.message}`); process.exitCode = 1; }
}

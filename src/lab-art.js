// Design Lab artwork: the graphics themselves, drawn by the image model as finished, multi-colour, layered artwork (the way a vintage tour tee or a heritage
// varsity graphic is built), on a transparent background so it can be printed on a piece and handed to a factory as a file. Claude writes what each graphic is
// (the idea, the layers, the words, the colours); the image model draws it. Every word on it is ours, and nothing names, copies or imitates another brand,
// band, team, character or logo.
import sharp from 'sharp';
import { imageConfig, openaiImage } from './check.js';
import { brandHits, stripBrands } from './lab-concepts.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const ART_STYLES = ['vintage rock tour tee', 'heritage varsity', 'surf and skate', 'workwear and utility', 'technical and architectural', 'outdoor and national park', 'motorsport', 'collegiate crest', 'hand-drawn illustration'];

// → the prompt for one graphic. `g` is a motif or a concept graphic: { name, kind, idea, composition, texts, colors }; `program` gives the style and palette.
export function artPrompt(g, { program = null, technique = '' } = {}) {
  const pal = (program?.palette || []).filter(c => !g.colors?.length || g.colors.some(n => String(n).toLowerCase() === String(c.name).toLowerCase()));
  const colours = (pal.length ? pal : program?.palette || []).map(c => `${c.name} ${c.hex}`).join(', ') || (g.colors || []).join(', ');
  const words = (g.texts || []).filter(Boolean);
  return [`Original graphic artwork for a clothing print, for the brand Future Basics. ${program?.style ? `Style: ${clip(program.style, 200)}.` : 'Style: a vintage, lived-in tee graphic.'}`,
    `The graphic: ${clip(g.name, 80)}${g.kind ? ` (${g.kind})` : ''}. ${clip(g.idea, 300)}`,
    g.composition ? `Build it in layers: ${clip(g.composition, 400)}.` : 'Build it in layers: a main image, lettering that frames it, and small supporting details, overlapping the way a real screen print is built.',
    colours ? `Use only these ink colours, as flat spot colours: ${colours}. Several colours, layered.` : 'Use three to five flat spot colours, layered.',
    words.length ? `Lettering, spelled exactly as written and nothing else: ${words.map(w => `"${clip(w, 40)}"`).join(', ')}.` : 'No lettering.',
    `Made to be ${technique || 'screen printed'}: crisp edges, solid ink, a subtle worn, cracked-ink texture, halftone shading where it helps. The artwork alone, centred, filling the frame, on a fully transparent background: no garment, no mockup, no frame, no shadow, no paper.`,
    'Everything is original. Do not draw or imitate any existing logo, band, team, brand, character, mascot or trademark, and do not add any words that are not listed above.'].join('\n');
}

// the near-white background of a picture drawn without transparency is cut away from the edges inwards (white ink inside the artwork stays)
export async function keyOut(buf, tol = 34) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), W = info.width, H = info.height, seen = new Uint8Array(W * H), stack = [];
  const white = i => data[i * 4] > 255 - tol && data[i * 4 + 1] > 255 - tol && data[i * 4 + 2] > 255 - tol;
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) { const p = stack.pop(); if (seen[p] || !white(p)) continue; seen[p] = 1; data[p * 4 + 3] = 0; const x = p % W; if (x > 0) stack.push(p - 1); if (x < W - 1) stack.push(p + 1); if (p >= W) stack.push(p - W); if (p < W * (H - 1)) stack.push(p + W); }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}

// the test placeholder: a layered, several-colour badge, so the board and the tech pack can be exercised without an image model
export async function fixtureArt(g, program) {
  const pal = (program?.palette || []).map(c => c.hex); const [a, b, c] = [pal[0] || '#1F3A5F', pal[1] || '#F2EBDD', pal[2] || '#C8372D'];
  const word = String((g.texts || [])[0] || g.name || 'FB').replace(/[<&>"]/g, '').slice(0, 16);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><circle cx="512" cy="512" r="420" fill="${a}"/><circle cx="512" cy="512" r="330" fill="${b}"/><polygon points="512,250 590,450 800,450 630,570 700,780 512,650 324,780 394,570 224,450 434,450" fill="${c}"/><text x="512" y="560" font-family="sans-serif" font-size="90" font-weight="bold" text-anchor="middle" fill="${a}">${word}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// the artwork trimmed to its ink, at most 1600 px, and a small copy for the page → { png, thumb }
export async function finishArt(buf) {
  let png; try { png = await sharp(buf).trim({ threshold: 1 }).png().toBuffer(); } catch { png = buf; }
  png = await sharp(png).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return { png, thumb: await sharp(png).resize({ width: 360, height: 360, fit: 'inside', withoutEnlargement: true }).png().toBuffer() };
}

// → { png, thumb, model, prompt } for one graphic. Throws when it cannot be drawn.
export async function drawArt(g, { program = null, technique = '', cfg = imageConfig(), draw = openaiImage } = {}) {
  const words = (g.texts || []).filter(w => !brandHits(w).length); // a word that names someone else is never drawn
  const clean = { ...g, idea: stripBrands(g.idea || '') || g.idea, texts: words };
  const prompt = artPrompt(clean, { program, technique });
  if (!cfg.configured) throw new Error('No image model is connected, so the artwork cannot be drawn.');
  let buf;
  if (cfg.provider === 'fixture') buf = await fixtureArt(clean, program);
  else {
    try { buf = await draw(prompt, { ...cfg, size: '1024x1024', format: 'png', background: 'transparent' }); }
    catch (e) { if (!/background|transparen/i.test(e.message)) throw e; buf = await keyOut(await draw(prompt.replace('on a fully transparent background', 'on a plain flat white background'), { ...cfg, size: '1024x1024' })); }
    const m = await sharp(buf).metadata(); if (!m.hasAlpha) buf = await keyOut(buf); // a model that ignored the transparent background
  }
  return { ...(await finishArt(buf)), model: cfg.model || cfg.provider, prompt };
}

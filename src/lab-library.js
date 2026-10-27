// Design Lab library of techniques: how a graphic is made on a piece (embroidery, print, heat transfer, patches, distressing), kept so what was worked out once
// is used again on every piece after. A technique holds four things:
//   - a finish: a recipe the page draws straight away and for free (src/lab-finish.js), so a graphic looks embroidered or printed in the studio and the library;
//   - the words that tell the image model how the real thing looks, for the photographic version (the studio's "Make it real with AI");
//   - how to design artwork for it (line weights, colours), given to the image model whenever a graphic is drawn for this technique;
//   - reference photos of the real thing, shown to the image model next to the piece.
import { GRAPHIC_TECHNIQUES } from './lab-concepts.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, d, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
export const TECHNIQUE_KINDS = [{ id: 'embroidery', label: 'Embroidery' }, { id: 'print', label: 'Print' }, { id: 'heat_transfer', label: 'Heat transfer' }, { id: 'patch', label: 'Patches and appliqué' }, { id: 'distress', label: 'Distressing and wash' }];
export const EFFECTS = ['none', 'stitch', 'puff', 'ink', 'soak', 'halftone', 'foil', 'film', 'rubber', 'chenille', 'woven', 'deboss'];
const BLENDS = ['source-over', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'color-burn', 'color-dodge', 'luminosity'];

// → a finish recipe that is safe to keep and to draw
export function cleanFinish(f = {}) {
  const d = f.distress || {};
  return {
    effect: EFFECTS.includes(f.effect) ? f.effect : 'none', stitch: ['satin', 'chain', 'fill'].includes(f.stitch) ? f.stitch : 'satin', metal: ['gold', 'silver', 'copper'].includes(f.metal) ? f.metal : 'gold',
    strength: num(f.strength, .7, 0, 1), angle: num(f.angle, 45, -180, 180), raise: num(f.raise, 0, 0, 12), sheen: num(f.sheen, .2, 0, 1),
    blend: BLENDS.includes(f.blend) ? f.blend : 'source-over', opacity: num(f.opacity, 1, .05, 1), sat: num(f.sat, 100, 0, 200),
    distress: { style: ['worn', 'cracked', 'faded'].includes(d.style) ? d.style : 'worn', amount: num(d.amount, 0, 0, 1), size: num(d.size, 50, 5, 200) }
  };
}
// → { technique } or { error }
export function cleanTechnique(b = {}, base = {}) {
  const pick = (k, d) => (b[k] === undefined ? base[k] ?? d : b[k]);
  const name = clip(pick('name', ''), 60); if (name.length < 2) return { error: 'Give the technique a name' };
  const kind = pick('kind', 'print'); if (!TECHNIQUE_KINDS.some(k => k.id === kind)) return { error: 'Choose what kind of technique it is' };
  const baseTech = clip(pick('base', ''), 40).toLowerCase(); // nothing said: the usual one for its kind
  return { technique: { name, kind, summary: clip(pick('summary', ''), 300), base: GRAPHIC_TECHNIQUES.includes(baseTech) ? baseTech : kind === 'embroidery' ? 'embroidery' : kind === 'heat_transfer' ? 'heat transfer' : 'screen print',
    finish: cleanFinish(pick('finish', {})), prompt: clip(pick('prompt', ''), 900), artGuide: clip(pick('artGuide', ''), 500), factoryNote: clip(pick('factoryNote', ''), 500) } };
}

// what the image model is asked when a technique is made real on a piece (the studio) or on a sample of fabric (the library)
export const realPrompt = (t, { masked = true, photos = 0, swatch = false } = {}) => [
  swatch ? 'This is a flat mock-up of a graphic on a piece of fabric. Redraw it as a close-up photograph of the real thing, made with the technique below.'
    : masked ? 'This is a product picture. Only inside the transparent area of the mask, make the graphic look like it is really made with the technique below, on this fabric; everything outside it stays exactly as it is.'
      : 'This is a product picture. Make its graphic look like it is really made with the technique below, on this fabric.',
  `Technique: ${t.name}. ${t.prompt || t.summary}`,
  'Keep the graphic\'s design, shapes, words, spelling and colours exactly. Follow the fabric\'s folds and light. Photorealistic, true to how it is made in a factory.',
  photos ? `The other picture${photos > 1 ? 's show' : ' shows'} real examples of this technique: match how the thread, ink or material looks in them, not their designs.` : '',
  'Do not add any other company\'s name, logo or trade dress.'
].filter(Boolean).join('\n');

// The starting set: the techniques a streetwear and basics brand uses most. They can be changed, and more can be added from the page.
const F = cleanFinish;
export const BUILTIN_TECHNIQUES = [
  { key: 'satin-embroidery', kind: 'embroidery', name: 'Satin stitch embroidery', base: 'embroidery', summary: 'Long, glossy stitches for lettering and small marks. The classic chest logo.', finish: F({ effect: 'stitch', stitch: 'satin', angle: 45, strength: .8, raise: 2 }),
    prompt: 'Dense satin-stitch embroidery: long parallel stitches with a soft thread sheen that follows the stitch direction, slightly raised from the fabric, the fabric gently puckered around the edges, tiny shadows at the edge of the thread.', artGuide: 'Bold shapes and lettering, nothing thinner than 1.5 mm, at most 6 thread colours, no gradients, no tiny text under 5 mm high.', factoryNote: 'Satin stitch, 40 wt polyester or rayon thread, tear-away backing; give thread colours as Madeira or Pantone references.' },
  { key: 'puff-embroidery', kind: 'embroidery', name: '3D puff embroidery', base: 'embroidery', summary: 'Satin stitch over foam, so the shapes stand up from the cloth. Caps and bold chest marks.', finish: F({ effect: 'stitch', stitch: 'satin', angle: 0, strength: 1, raise: 6 }),
    prompt: '3D puff embroidery: satin stitches wrapped over foam so every shape stands up several millimetres from the fabric, rounded edges, strong highlights on top and soft shadows beneath.', artGuide: 'Thick, simple, closed shapes and block lettering at least 6 mm wide. No fine details, no outlines thinner than 3 mm, one or two colours.', factoryNote: '3 mm puff foam under satin stitch; satin columns at least 6 mm wide.' },
  { key: 'chain-stitch', kind: 'embroidery', name: 'Chain stitch embroidery', base: 'embroidery', summary: 'Looped, hand-guided stitch with a vintage, wavy line. Script lettering and retro work jackets.', finish: F({ effect: 'stitch', stitch: 'chain', angle: 0, strength: .85, raise: 1.5 }),
    prompt: 'Vintage chain-stitch embroidery: rows of small interlocking thread loops that follow the curves of the design, a slightly irregular hand-guided line, cotton thread with a matte look, filled areas made of spiralling rows of chain stitch.', artGuide: 'Flowing script and line art; fills are spirals of line. At most 5 colours.', factoryNote: 'Chain stitch (Cornely-style machine); fills as spiral chain rows.' },
  { key: 'tatami-fill', kind: 'embroidery', name: 'Fill stitch embroidery', base: 'embroidery', summary: 'Flat, textured stitch for large areas such as big crests and backs.', finish: F({ effect: 'stitch', stitch: 'fill', angle: 30, strength: .75, raise: 1.5 }),
    prompt: 'Tatami fill-stitch embroidery: large areas covered with short stitches laid in staggered rows, a woven-looking texture, flat and dense, outlined with a narrow satin border.', artGuide: 'Large flat areas with a 2 mm outline; avoid gradients and fine detail.', factoryNote: 'Tatami fill with satin border; mind stitch count on large areas.' },
  { key: 'plastisol', kind: 'print', name: 'Plastisol screen print', base: 'screen print', summary: 'Bright, opaque ink that sits on top of the fabric with a slight sheen.', finish: F({ effect: 'ink', strength: .6, sheen: .2 }),
    prompt: 'Plastisol screen print: thick opaque ink sitting on top of the fabric, flat solid colour with a slight satin sheen, crisp edges, the knit texture just visible through the ink.', artGuide: 'Flat spot colours (up to 6), halftones for shading, lines at least 0.5 mm.', factoryNote: 'Plastisol inks, one screen per colour, white underbase on dark garments.' },
  { key: 'water-based', kind: 'print', name: 'Water-based / discharge print', base: 'screen print', summary: 'Soft ink that soaks into the cloth: no feel, a slightly faded, lived-in look.', finish: F({ effect: 'soak', strength: .8, blend: 'multiply', opacity: .9, sat: 85 }),
    prompt: 'Water-based discharge screen print: the ink is soaked into the cotton so the fabric texture shows through everywhere, soft matte colours, slightly uneven coverage, no layer on top of the fabric.', artGuide: 'Spot colours that work slightly muted; avoid fine white details on dark garments.', factoryNote: 'Water-based or discharge inks on 100% cotton; soft hand.' },
  { key: 'vintage-cracked', kind: 'print', name: 'Vintage cracked print', base: 'screen print', summary: 'A print that has been washed for years: cracked, flaked and faded.', finish: F({ effect: 'ink', strength: .5, sheen: .05, blend: 'multiply', opacity: .92, sat: 80, distress: { style: 'cracked', amount: .45, size: 40 } }),
    prompt: 'A vintage screen print after years of washing: the ink cracked into a fine web, flaked away in places to show the bare fabric, colours faded and softened.', artGuide: 'Classic tour-tee and varsity artwork: layered spot colours and halftones.', factoryNote: 'Plastisol with crack additive or a pre-distressed screen; enzyme or pigment wash after printing.' },
  { key: 'puff-print', kind: 'print', name: 'Puff print', base: 'puff print', summary: 'Ink that swells when cured: raised, soft and matte.', finish: F({ effect: 'puff', strength: .85, raise: 4 }),
    prompt: 'Puff print: the ink has swollen into soft raised shapes with rounded edges and a matte, slightly spongy surface, casting small shadows on the fabric.', artGuide: 'Bold shapes and lettering, nothing finer than 2 mm; one or two colours.', factoryNote: 'Puff additive in plastisol; heat cure to raise.' },
  { key: 'halftone', kind: 'print', name: 'Halftone print', base: 'screen print', summary: 'Shading made of dots, the way vintage prints did gradients.', finish: F({ effect: 'halftone', strength: .7 }),
    prompt: 'Screen print with halftone shading: tones built from visible ink dots of varying size, crisp dots on the knit.', artGuide: 'Greyscale or one-colour shading turned into 35–45 lpi halftones.', factoryNote: 'Halftones at 35–45 lpi, angle 22.5°.' },
  { key: 'foil', kind: 'print', name: 'Foil print', base: 'heat transfer', summary: 'Metallic gold, silver or copper with a mirror shine.', finish: F({ effect: 'foil', metal: 'gold', strength: .8, angle: 35 }),
    prompt: 'Metallic foil print: a mirror-bright metallic finish with sharp reflections that change across the fabric folds, thin and smooth, crisp edges.', artGuide: 'Solid shapes and lettering, no halftones, no very fine lines.', factoryNote: 'Foil over adhesive print; specify foil colour.' },
  { key: 'glossy-transfer', kind: 'heat_transfer', name: 'Glossy heat transfer', base: 'heat transfer', summary: 'A thin, smooth, shiny film pressed on. Sharp edges and fine detail.', finish: F({ effect: 'film', strength: .7, sheen: .5, raise: .6 }),
    prompt: 'Glossy heat transfer: a thin, smooth plastic film pressed onto the fabric, shiny highlights across it, perfectly sharp edges, very slightly raised.', artGuide: 'Full colour allowed, fine details and small text work.', factoryNote: 'Plastisol or PU heat transfer, gloss finish.' },
  { key: 'matte-transfer', kind: 'heat_transfer', name: 'Soft-touch matte transfer', base: 'heat transfer', summary: 'A thin matte transfer that feels close to a print.', finish: F({ effect: 'film', strength: .4, sheen: .08, raise: .3 }),
    prompt: 'Soft-touch matte heat transfer: thin, flat, matte film bonded to the fabric, following its texture, crisp edges, no shine.', artGuide: 'Full colour allowed; good for small labels and neck prints.', factoryNote: 'Matte soft-touch transfer; also used for tagless neck labels.' },
  { key: 'reflective', kind: 'heat_transfer', name: 'Reflective transfer', base: 'heat transfer', summary: 'Silver-grey by day, bright under light. Technical and running pieces.', finish: F({ effect: 'foil', metal: 'silver', strength: .45, angle: 20, sat: 0 }),
    prompt: 'Reflective heat transfer: a matte silver-grey film with a fine glass-bead texture, slightly brighter where the light hits it, sharp edges.', artGuide: 'One colour (silver), solid shapes, no fine text.', factoryNote: 'Retro-reflective transfer film.' },
  { key: 'chenille', kind: 'patch', name: 'Chenille patch', base: 'chenille patch', summary: 'Fuzzy, deep pile with a felt border: varsity letters.', finish: F({ effect: 'chenille', strength: .9, raise: 5 }),
    prompt: 'Chenille patch: a deep, fuzzy, looped yarn pile in the shapes of the design, soft and raised, edged with a flat felt border and a chain-stitched outline, sewn onto the fabric.', artGuide: 'Large, bold shapes and block letters; 2 or 3 colours with a felt border colour.', factoryNote: 'Chenille on felt backing, sewn on; specify border colour.' },
  { key: 'woven-patch', kind: 'patch', name: 'Woven patch', base: 'woven jacquard', summary: 'Fine woven threads, flat and crisp, with a merrowed or folded edge.', finish: F({ effect: 'woven', strength: .75, raise: 1.2 }),
    prompt: 'Woven patch: the design woven in fine threads with a tight visible weave, flat and crisp, a merrowed edge, sewn onto the garment.', artGuide: 'Fine details are fine; up to 8 colours; give it a border.', factoryNote: 'Damask woven patch, merrowed or folded edge, sew-on or heat-seal backing.' },
  { key: 'rubber-patch', kind: 'patch', name: 'Rubber patch', base: 'rubber print', summary: 'Moulded PVC with raised, glossy levels.', finish: F({ effect: 'rubber', strength: .9, sheen: .5, raise: 4 }),
    prompt: 'Moulded rubber (PVC) patch: raised levels with soft rounded edges, slightly glossy surface, solid colours, sewn or bonded onto the fabric.', artGuide: 'Solid shapes on two or three levels, no gradients, lines at least 1 mm.', factoryNote: '2D/3D PVC patch, levels and colours by Pantone.' },
  { key: 'deboss', kind: 'patch', name: 'Deboss', base: 'debossed', summary: 'Pressed into leather, rubber or thick fabric.', finish: F({ effect: 'deboss', strength: .8, blend: 'multiply', opacity: .6 }),
    prompt: 'Debossed: the design pressed into the material so it sits below the surface, darker and smoother inside the pressed shape, crisp edges, no ink.', artGuide: 'One colour (none), solid shapes and bold lettering.', factoryNote: 'Heat deboss; give depth and the material.' },
  { key: 'worn-in', kind: 'distress', name: 'Worn-in', base: 'screen print', summary: 'A light, even wear: specks and grain, as if washed fifty times.', finish: F({ effect: 'none', blend: 'multiply', opacity: .95, distress: { style: 'worn', amount: .25, size: 45 } }),
    prompt: 'Lightly worn from many washes: small specks of ink gone, the colours a little softer, the fabric slightly pilled.', artGuide: '', factoryNote: 'Garment enzyme wash after printing.' },
  { key: 'sun-faded', kind: 'distress', name: 'Sun-faded wash', base: 'screen print', summary: 'Washed out and uneven, like a tee left in the sun.', finish: F({ effect: 'none', blend: 'multiply', opacity: .85, sat: 60, distress: { style: 'faded', amount: .45, size: 70 } }),
    prompt: 'Sun-faded and washed out: colours bleached and uneven, softer in patches, a chalky vintage look.', artGuide: '', factoryNote: 'Pigment dye with acid or sun-fade wash.' },
  { key: 'thrashed', kind: 'distress', name: 'Heavily distressed', base: 'screen print', summary: 'Cracked, flaked and worn through in places.', finish: F({ effect: 'ink', strength: .4, blend: 'multiply', opacity: .9, sat: 75, distress: { style: 'cracked', amount: .65, size: 55 } }),
    prompt: 'Heavily distressed: the print cracked and flaked away in large areas, worn through to the fabric, rough and faded, like a thrifted tee.', artGuide: '', factoryNote: 'Distressed screen plus stone or enzyme wash.' }
];

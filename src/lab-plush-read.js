// Reading a plush from its picture (a concept's picture, AI-made or a photo) and from its concept's words, so its pattern is drafted from what was
// designed, the way a shoe is read (src/lab-shoe-read.js):
//   readPlush(buffer, opts)          → the vision model's reading: the shape it is cut as, its height, ears, arms, legs and tail, the pile, the eyes,
//                                      the colours of the body and the contrast (muzzle, inner ears, pads)
//   plushProposal(spec, vision, words) → the plush choices the picture (and the concept's words) ask for, and where each came from
import sharp from 'sharp';
import { PLUSH_SHAPES, PLUSH_EARS, PLUSH_FABRICS, PLUSH_EYES, PLUSH_AGES, PLUSH_SNOUTS, PLUSH_HORNS, PLUSH_MANES, PLUSH_TAILS, cleanPlush, plushDefaults } from './lab-pattern.js';

const HEX = /^#[0-9a-f]{6}$/i;
export const PLUSH_READ_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['plush', 'view', 'animal', 'shape', 'heightIn', 'ears', 'snout', 'horn', 'mane', 'wings', 'spikes', 'dorsal', 'tailType', 'head', 'arms', 'legs', 'tail', 'fabric', 'eyes', 'colours', 'why'],
  properties: {
    plush: { type: 'boolean', description: 'the picture shows a plush or soft toy' },
    view: { type: 'string', enum: ['front', 'three-quarter', 'side', 'back', 'other'] },
    animal: { type: 'string', description: 'what animal or character it is, in one or two words (elephant, bear, fox…)' },
    shape: { type: 'string', enum: Object.keys(PLUSH_SHAPES), description: 'its body type: quad for any four-legged animal sitting (dog, cat, fox, lion, horse, unicorn, dragon…); sea for a whale, shark, dolphin or fish; bear for one standing on two legs with arms; elephant for an elephant; bean for one rounded body (a chick, a ghost, a blob); bunny for a bean with long ears; pillow for a flat cushion with a side gusset' },
    heightIn: { type: 'number', description: 'its height in inches, standing or sitting as shown (for a sea creature, its length), judged from its proportions and any scale in the picture (usually 6 to 24)' },
    ears: { type: 'string', enum: Object.keys(PLUSH_EARS) },
    snout: { type: 'string', enum: Object.keys(PLUSH_SNOUTS), description: Object.entries(PLUSH_SNOUTS).map(([k, v]) => `${k}: ${v}`).join('; ') },
    horn: { type: 'string', enum: Object.keys(PLUSH_HORNS) }, mane: { type: 'string', enum: Object.keys(PLUSH_MANES), description: Object.entries(PLUSH_MANES).map(([k, v]) => `${k}: ${v}`).join('; ') },
    wings: { type: 'boolean' }, spikes: { type: 'boolean', description: 'spikes or plates down its back (a dinosaur, a dragon)' }, dorsal: { type: 'boolean', description: 'a fin on its back (a shark, a dolphin)' },
    tailType: { type: 'string', enum: Object.keys(PLUSH_TAILS), description: Object.entries(PLUSH_TAILS).map(([k, v]) => `${k}: ${v}`).join('; ') },
    head: { type: 'number', description: 'the head\'s size against a usual plush of its kind, 0.8 (small) to 1.3 (big, a chibi head)' }, arms: { type: 'boolean' }, legs: { type: 'boolean' }, tail: { type: 'boolean' },
    fabric: { type: 'string', enum: Object.keys(PLUSH_FABRICS), description: 'what it is sewn from: a pile, or leather, suede, velvet or bouclé' },
    eyes: { type: 'string', enum: Object.keys(PLUSH_EYES) },
    colours: { type: 'object', additionalProperties: false, required: ['body', 'contrast', 'mane'], properties: { body: { type: 'string', description: '#rrggbb' }, contrast: { type: 'string', description: '#rrggbb: the muzzle, inner ears or pads, a belly, a horn' }, mane: { type: 'string', description: '#rrggbb of its mane or hair tail; empty when it has none' } } },
    why: { type: 'string', description: 'one sentence on what you see' }
  }
};
export async function readPlush(buf, { ask, name = '' } = {}) {
  if (!ask) return null;
  const jpeg = await sharp(buf).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer();
  return ask('You are a soft-toy pattern maker reading a design picture so its pattern can be drafted. Read the toy as it is drawn: its body type, how tall it is, its ears, snout, arms, legs and tail (and the kind of tail), any horn or antlers, mane, wings, spikes or dorsal fin, the size of its head, the pile it is sewn from, its eyes, and the colour of its body, its contrast parts and its mane.',
    [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } }, { type: 'text', text: `The design is called "${String(name).slice(0, 80)}". Body types: ${Object.entries(PLUSH_SHAPES).map(([k, v]) => `"${k}" ${v}`).join('; ')}.` }],
    PLUSH_READ_SCHEMA);
}
// the concept's own words first (what the designer asked for), then what the picture shows over them; a safety rule is never loosened: a toy for
// under-3s keeps embroidered eyes whatever the picture shows
export function plushProposal(spec, vision, words = null) {
  const base = cleanPlush(spec), from = {}, next = { ...base };
  // a new shape brings its own size and parts, not a new pile, eyes or age
  const set = (k, v, src) => { if (v == null || v === '' || Number.isNaN(v)) return; if (k === 'shape' && v !== next.shape) Object.assign(next, plushDefaults(v), { sketches: next.sketches, colours: next.colours, age: next.age, fabric: next.fabric, eyes: next.eyes }); next[k] = v; from[k] = src; };
  const take = (o, src) => {
    if (!o) return;
    set('shape', PLUSH_SHAPES[o.shape] ? o.shape : null, src);
    const h = Number(o.heightIn ?? o.height); if (h >= 4 && h <= 48) set('height', Math.round(h * 2) / 2, src);
    set('ears', PLUSH_EARS[o.ears] ? o.ears : null, src);
    for (const k of ['arms', 'legs', 'tail']) set(k, typeof o[k] === 'boolean' ? o[k] : null, src);
    for (const [k, of] of [['snout', PLUSH_SNOUTS], ['horn', PLUSH_HORNS], ['mane', PLUSH_MANES], ['tailType', PLUSH_TAILS]]) set(k, of[o[k]] ? o[k] : null, src);
    for (const k of ['wings', 'spikes', 'dorsal']) set(k, typeof o[k] === 'boolean' ? o[k] : null, src);
    { const hd = Number(o.head); if (hd >= .8 && hd <= 1.3) set('head', Math.round(hd * 20) / 20, src); }
    set('fabric', PLUSH_FABRICS[o.fabric] ? o.fabric : null, src); set('animal', typeof o.animal === 'string' && o.animal.trim() ? o.animal.trim().toLowerCase().slice(0, 30) : null, src); set('eyes', PLUSH_EYES[o.eyes] ? o.eyes : null, src); set('age', PLUSH_AGES[o.age] ? o.age : null, src);
    const c = Object.fromEntries(['body', 'contrast', 'mane'].filter(k => HEX.test(String(o.colours?.[k] || ''))).map(k => [k, String(o.colours[k]).toLowerCase()])); if (Object.keys(c).length) set('colours', { ...(next.colours || {}), ...c }, src);
  };
  take(words, 'concept');
  const v = vision && vision.plush !== false ? vision : null; take(v, 'picture (AI)');
  if (next.age === '0+' && next.eyes === 'safety') { next.eyes = 'embroidered'; from.eyes = 'safety: under-3s'; }
  const out = cleanPlush(next);
  const changes = Object.keys(from).filter(k => JSON.stringify(out[k]) !== JSON.stringify(base[k])).map(k => ({ key: k, from: base[k] ?? null, to: out[k], source: from[k] }));
  return { spec: out, from, changes, why: v?.why || '' };
}

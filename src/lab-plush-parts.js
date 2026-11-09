// Plush parts: the shapes plush is commonly made of, as parts that bolt together (shared by the Pattern page and the service; no DOM, no
// Node). A plush built from parts is a body, a head when the body does not carry its own face, and what goes on them: ears, a face, arms,
// legs, a tail, horns, wings, something down the back, and details. Each part is drafted to where it is sewn: a head's neck to the body's
// neck opening, a foot pad to its leg, a base to its gores, a gusset to the seam it runs along, an ear or a tail to the seam it is set into.
// Every join is recorded (`joints`) and walked by src/lab-pattern-check.js, so a plush bolted together from any parts sews together.
//   PLUSH_SLOTS, PLUSH_LIBRARY, PLUSH_PRESETS   the slots, the parts in each, and plush to start from
//   cleanBuild(b)                                a build made safe: known parts that go on its body, sizes in range
//   buildPlush(spec)                             → { pieces, joints, views, notes, sockets, horizontal }
//   partThumb(slot, id)                          → a small SVG of the part, for the picker
// Inches; the views have y downward, the top of the toy at 0 and its middle at x = 0; the side view faces left (the nose toward -x).

const r3 = v => Math.round(v * 1000) / 1000, r8 = v => Math.round(v * 8) / 8;
const lenOf = P => P.reduce((s, q, i) => i ? s + Math.hypot(q[0] - P[i - 1][0], q[1] - P[i - 1][1]) : 0, 0);
const loopLen = P => lenOf([...P, P[0]]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ellipse = (rx, ry, n = 40, cx = 0, cy = 0, rot = 0) => { const c = Math.cos(rot), s = Math.sin(rot); return Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n, x = rx * Math.cos(t), y = ry * Math.sin(t); return [cx + x * c - y * s, cy + x * s + y * c]; }); };
// an open run smoothed with its two ends kept; a closed outline smoothed all round
const soften = (pts, n = 3) => { let a = pts; for (let k = 0; k < n; k++) { const o = [a[0]]; for (let i = 0; i < a.length - 1; i++) { const p = a[i], q = a[i + 1]; o.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); } o.push(a[a.length - 1]); a = o; } return a; };
const roundOff = (pts, n = 3) => { let a = pts; for (let k = 0; k < n; k++) { const o = []; for (let i = 0; i < a.length; i++) { const p = a[i], q = a[(i + 1) % a.length]; o.push([p[0] * .75 + q[0] * .25, p[1] * .75 + q[1] * .25], [p[0] * .25 + q[0] * .75, p[1] * .25 + q[1] * .75]); } a = o; } return a; };
const mirror = P => P.map(([x, y]) => [-x, y]);
// a whole outline from its right half (from the middle at the top, round the right, to the middle at the bottom)
const whole = half => [...half, ...mirror(half).reverse().slice(1, -1)];
const move = (P, dx, dy) => P.map(([x, y]) => [x + dx, y + dy]);
const scale = (P, kx, ky = kx) => P.map(([x, y]) => [x * kx, y * ky]);
const turn = (P, a, [cx, cy] = [0, 0]) => { const c = Math.cos(a), s = Math.sin(a); return P.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]); };
const boxOf = P => { const xs = P.map(q => q[0]), ys = P.map(q => q[1]), b = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; return { ...b, w: b.x1 - b.x0, h: b.y1 - b.y0 }; };
const ellPer = (a, b) => Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
// a limb as it looks stuffed: a rounded capsule from a to b, r wide at a and rb at b
const capsule = (a, b, r, rb = r, n = 8) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, out = [];
  for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; out.push([b[0] + (nx * Math.cos(t) + ux * Math.sin(t)) * rb, b[1] + (ny * Math.cos(t) + uy * Math.sin(t)) * rb]); }
  for (let i = 0; i <= n; i++) { const t = Math.PI * i / n; out.push([a[0] + (-nx * Math.cos(t) - ux * Math.sin(t)) * r, a[1] + (-ny * Math.cos(t) - uy * Math.sin(t)) * r]); }
  return out; };
// solve f(x) = want for x in [lo, hi] (f rising)
const solve = (f, want, lo, hi) => { for (let k = 0; k < 48; k++) { const m = (lo + hi) / 2; if (f(m) < want) lo = m; else hi = m; } return (lo + hi) / 2; };
// the length of an outline's run on one side between two heights: what a seam offers a part set into it
const runAt = (P, y0, y1, side = 1) => { let L = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; if (p[0] * side > -1e-6 && q[0] * side > -1e-6 && Math.min(p[1], q[1]) >= y0 && Math.max(p[1], q[1]) <= y1) L += dist(p, q); } return L; };
// where an outline's edge is at a height: its rightmost (side 1) or leftmost (side -1) crossing
const xAt = (P, y, side = 1) => { let best = null; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; if ((p[1] - y) * (q[1] - y) <= 0 && p[1] !== q[1]) { const x = p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]); if (best === null || x * side > best * side) best = x; } } return best ?? 0; };
// a piece, as src/lab-pattern.js piece() takes it
const pc = (id, name, sew, o = {}) => ({ id, name, sew, ...o });
// a lens with pointed ends, its two edges each `edge` long and at most `w` wide (a gusset, a belly): its length along the middle solved
function lens(edge, w) { const mk = L => { const n = 20, r = Array.from({ length: n + 1 }, (_, i) => [w / 2 * Math.sin(Math.PI * i / n), L * i / n]); return r; };
  const L = solve(L => lenOf(mk(L)), edge, w * .2, edge); const right = mk(L); return { sew: [...right, ...mirror(right).reverse().slice(1, -1)], length: L }; }
// gores: a round thing cut in n segments from its profile (the radius round it at each height, top to bottom): each gore's sides follow the
// surface down, its width a 1/n of the round at that height; → { sew, bottom (the width at the foot), length }
function gores(prof, n = 6) {
  let s = 0; const right = prof.map(([y, r], i) => { if (i) s += Math.hypot(y - prof[i - 1][0], r - prof[i - 1][1]); return [Math.PI * Math.max(r, 0) / n, s]; });
  const pointed = right[0][0] < .01, side = pointed ? right.slice(1) : right;
  return { sew: [...(pointed ? [[0, 0]] : []), ...side, ...mirror(side).reverse()], bottom: 2 * right.at(-1)[0], length: s };
}
// a sphere (radius R) from its top to the height where its round is `foot` (an opening, or a base): its profile, and that height
function sphereTo(R, foot) { const th = Math.PI - Math.asin(Math.min(1, foot / (2 * Math.PI) / R)), n = 28; return { prof: Array.from({ length: n + 1 }, (_, i) => { const t = th * i / n; return [R - R * Math.cos(t), R * Math.sin(t)]; }), h: R - R * Math.cos(th) }; }

// ---- the slots and the parts ----
export const PLUSH_SLOTS = [['body', 'Body'], ['head', 'Head'], ['ears', 'Ears'], ['face', 'Face'], ['arms', 'Arms'], ['legs', 'Legs'], ['tail', 'Tail'], ['horns', 'Horns and antennae'], ['wings', 'Wings'], ['back', 'Down the back'], ['extras', 'Details']];
// each part: its name, what it is for, and (bodies) whether it takes a head, how it stands, and the slots it takes
export const PLUSH_LIBRARY = {
  body: {
    bean: { name: 'Bean', hint: 'Head and body in one, a soft bean (a kawaii character, a bunny, a frog)', head: false, takes: ['ears', 'face', 'arms', 'legs', 'tail', 'horns', 'wings', 'back', 'extras'] },
    ball: { name: 'Ball', hint: 'Six gores and a base: round, sits steady (a pufferfish, a monster, an octopus)', head: false, takes: ['ears', 'face', 'arms', 'legs', 'tail', 'horns', 'wings', 'back', 'extras'] },
    egg: { name: 'Egg', hint: 'Six gores, fuller at the bottom, on a base (an owl, a penguin, a chick)', head: false, takes: ['ears', 'face', 'arms', 'legs', 'tail', 'horns', 'wings', 'back', 'extras'] },
    pillow: { name: 'Pillow', hint: 'Flat front and back round a side gusset (a cloud, a heart, a cushion friend)', head: false, takes: ['ears', 'face', 'arms', 'legs', 'tail', 'horns', 'extras'] },
    torso: { name: 'Upright body', hint: 'Front and back in halves, a head on the neck: sits like a teddy bear', head: true, takes: ['ears', 'face', 'arms', 'legs', 'tail', 'horns', 'wings', 'back', 'extras'] },
    seated: { name: 'Sitting four-legged', hint: 'Two sides and an underbody gusset: a cat, a dog, a fox, a lion sitting', head: true, takes: ['ears', 'face', 'legs', 'tail', 'horns', 'wings', 'back', 'extras'] },
    tube: { name: 'Long tube', hint: 'A tube on its side with a head at the front: a snake, a caterpillar, a sausage dog; its size is its length', head: true, horizontal: true, takes: ['ears', 'face', 'legs', 'tail', 'horns', 'back', 'extras'] },
    fish: { name: 'Fish', hint: 'Two sides and a belly gusset: a whale, a shark, a fish; its size is its length', head: false, horizontal: true, takes: ['face', 'arms', 'tail', 'back', 'extras'] }
  },
  head: {
    none: { name: 'None', hint: 'The body is the head' },
    ball: { name: 'Ball head', hint: 'Six gores, the neck left open' },
    gusset: { name: 'Bear head', hint: 'Two sides and a gusset over the crown, a short muzzle' },
    flat: { name: 'Flat face', hint: 'Front and back, wide and soft (a cat, a kawaii face)' },
    snout: { name: 'Long snout', hint: 'Two sides with the snout cut in one, a gusset over the crown (a dog, a fox, a dragon)' }
  },
  ears: { none: { name: 'None' }, round: { name: 'Round', hint: 'A bear, a panda' }, pointed: { name: 'Pointed', hint: 'A cat' }, fox: { name: 'Tall pointed', hint: 'A fox, a wolf' }, long: { name: 'Long', hint: 'A bunny' }, floppy: { name: 'Floppy', hint: 'A dog, a lop' }, big: { name: 'Big and lined', hint: 'An elephant' }, mouse: { name: 'Big round', hint: 'A mouse, a koala' } },
  face: { none: { name: 'Eyes and a nose', hint: 'Embroidered on the face' }, muzzle: { name: 'Muzzle patch', hint: 'A contrast muzzle (a bear, a monkey)' }, beak: { name: 'Beak', hint: 'Two pieces, stuffed (an owl, a chick, a penguin)' }, nose: { name: 'Felt nose', hint: 'A big appliquéd nose' }, trunk: { name: 'Trunk', hint: 'An elephant\'s, stuffed' } },
  arms: { none: { name: 'None' }, nub: { name: 'Nubs', hint: 'Little stubs set into the side seams' }, tube: { name: 'Arms', hint: 'Inner and outer, a teddy bear\'s' }, flipper: { name: 'Flippers', hint: 'Flat and stitched (a penguin, a seal, a fish\'s fins)' }, dangly: { name: 'Long and dangly', hint: 'A monkey, a frog, a sloth' } },
  legs: { none: { name: 'None' }, feet: { name: 'Feet', hint: 'Two little feet at the front of the base' }, sitting: { name: 'Sitting legs', hint: 'Out in front, on foot pads (a teddy bear)' }, four: { name: 'Four legs', hint: 'Front and hind, on foot pads' }, dangly: { name: 'Long and dangly', hint: 'A frog, a monkey' }, tentacles: { name: 'Eight tentacles', hint: 'An octopus' } },
  tail: { none: { name: 'None' }, pom: { name: 'Pompom', hint: 'A gathered round (a bunny)' }, stub: { name: 'Stub', hint: 'A bear, a cat' }, long: { name: 'Long and thin', hint: 'A cat, a mouse, a monkey' }, bushy: { name: 'Bushy', hint: 'A fox, a squirrel' }, curly: { name: 'Curly', hint: 'A pig' }, fluke: { name: 'Fluke', hint: 'A whale, a dolphin' }, fin: { name: 'Tail fin', hint: 'A fish, a shark' }, spiked: { name: 'Spiked', hint: 'A dragon, a dinosaur' } },
  horns: { none: { name: 'None' }, one: { name: 'One horn', hint: 'A unicorn' }, two: { name: 'Two horns', hint: 'A goat, a dragon, a monster' }, antlers: { name: 'Antlers', hint: 'A deer' }, antennae: { name: 'Antennae', hint: 'A bee, a bug, an alien' } },
  wings: { none: { name: 'None' }, bird: { name: 'Feathered', hint: 'A bird, an owl' }, bat: { name: 'Bat or dragon', hint: 'Scalloped, lined' }, butterfly: { name: 'Butterfly', hint: 'Two lobes each side' } },
  back: { none: { name: 'None' }, spikes: { name: 'Spikes', hint: 'Down the back (a dinosaur, a dragon)' }, dorsal: { name: 'Dorsal fin', hint: 'A shark, a dolphin' }, crest: { name: 'Mane crest', hint: 'Down the neck (a horse, a unicorn)' }, ruff: { name: 'Mane ruff', hint: 'Round the face (a lion)' } },
  extras: { belly: { name: 'Belly patch', hint: 'Contrast, appliquéd' }, cheeks: { name: 'Cheeks', hint: 'Felt, blush pink' }, spots: { name: 'Spots', hint: 'Felt, on the back' } }
};
// which parts each body takes, beyond its slots: limbs that suit it
const FITS = {
  legs: { feet: ['bean', 'ball', 'egg', 'pillow', 'torso'], sitting: ['torso', 'bean', 'egg', 'ball'], four: ['seated', 'tube'], dangly: ['bean', 'ball', 'egg', 'torso', 'pillow'], tentacles: ['ball', 'egg', 'bean'] },
  arms: { flipper: ['egg', 'bean', 'ball', 'fish', 'torso'] },
  tail: { fluke: ['fish', 'tube', 'egg', 'bean', 'ball'], fin: ['fish', 'tube'] },
  back: { ruff: ['torso', 'seated', 'bean', 'ball', 'egg', 'tube', 'pillow'] }
};
const fits = (slot, id, body) => !FITS[slot]?.[id] || FITS[slot][id].includes(body);
export const PLUSH_PRESETS = {
  bear: { name: 'Teddy bear', build: { body: 'torso', head: 'gusset', ears: 'round', face: 'muzzle', arms: 'tube', legs: 'sitting', tail: 'stub' } },
  bunny: { name: 'Bunny', build: { body: 'bean', ears: 'long', arms: 'nub', legs: 'feet', tail: 'pom', extras: ['cheeks'] } },
  cat: { name: 'Cat', build: { body: 'seated', head: 'flat', ears: 'pointed', legs: 'four', tail: 'long' } },
  dog: { name: 'Dog', build: { body: 'seated', head: 'snout', ears: 'floppy', legs: 'four', tail: 'stub' } },
  fox: { name: 'Fox', build: { body: 'seated', head: 'snout', ears: 'fox', legs: 'four', tail: 'bushy', extras: ['belly'] } },
  lion: { name: 'Lion', build: { body: 'seated', head: 'gusset', ears: 'round', face: 'muzzle', legs: 'four', tail: 'long', back: 'ruff' } },
  unicorn: { name: 'Unicorn', build: { body: 'seated', head: 'snout', ears: 'pointed', legs: 'four', tail: 'bushy', horns: 'one', back: 'crest' } },
  dragon: { name: 'Dragon', build: { body: 'seated', head: 'snout', ears: 'none', legs: 'four', tail: 'spiked', horns: 'two', wings: 'bat', back: 'spikes', extras: ['belly'] } },
  elephant: { name: 'Elephant', build: { body: 'seated', head: 'ball', ears: 'big', face: 'trunk', legs: 'four', tail: 'long' } },
  owl: { name: 'Owl', build: { body: 'egg', ears: 'pointed', face: 'beak', wings: 'bird', legs: 'feet', extras: ['belly'] } },
  penguin: { name: 'Penguin', build: { body: 'egg', face: 'beak', arms: 'flipper', legs: 'feet', extras: ['belly'] } },
  frog: { name: 'Frog', build: { body: 'bean', arms: 'dangly', legs: 'dangly', extras: ['cheeks', 'belly'] } },
  octopus: { name: 'Octopus', build: { body: 'ball', legs: 'tentacles', extras: ['cheeks', 'spots'] } },
  monster: { name: 'Monster', build: { body: 'ball', horns: 'two', arms: 'dangly', legs: 'feet', back: 'spikes' } },
  bee: { name: 'Bee', build: { body: 'egg', horns: 'antennae', wings: 'butterfly', arms: 'nub', extras: ['cheeks'] } },
  whale: { name: 'Whale', build: { body: 'fish', arms: 'flipper', tail: 'fluke', extras: ['belly'] } },
  shark: { name: 'Shark', build: { body: 'fish', arms: 'flipper', tail: 'fin', back: 'dorsal', extras: ['belly'] } },
  caterpillar: { name: 'Caterpillar', build: { body: 'tube', head: 'ball', horns: 'antennae', legs: 'four', tail: 'none', extras: ['spots'] } },
  sausage: { name: 'Sausage dog', build: { body: 'tube', head: 'snout', ears: 'floppy', legs: 'four', tail: 'long' } },
  cloud: { name: 'Cloud friend', build: { body: 'pillow', extras: ['cheeks'] } }
};
export const SIZE_SLOTS = ['head', 'ears', 'face', 'arms', 'legs', 'tail', 'horns', 'wings'];
export function cleanBuild(input = {}) {
  const b = input && typeof input === 'object' ? input : {}, body = PLUSH_LIBRARY.body[b.body] ? b.body : 'bean', B = PLUSH_LIBRARY.body[body], out = { body };
  out.head = B.head ? (PLUSH_LIBRARY.head[b.head] && b.head !== 'none' ? b.head : 'ball') : 'none';
  for (const [slot] of PLUSH_SLOTS.slice(2)) {
    if (slot === 'extras') { out.extras = B.takes.includes('extras') ? [...new Set((Array.isArray(b.extras) ? b.extras : []).filter(e => PLUSH_LIBRARY.extras[e]))] : []; continue; }
    const id = String(b[slot] || 'none'); out[slot] = B.takes.includes(slot) && PLUSH_LIBRARY[slot][id] && fits(slot, id, body) ? id : slot === 'face' ? 'none' : 'none';
  }
  if (body === 'fish' && out.tail === 'none' && b.tail == null) out.tail = 'fin';
  const sz = b.size && typeof b.size === 'object' ? b.size : {};
  out.size = Object.fromEntries(SIZE_SLOTS.map(k => [k, Number.isFinite(Number(sz[k])) ? Math.round(Math.min(1.5, Math.max(.6, Number(sz[k]))) * 20) / 20 : 1]));
  return out;
}
// the parts allowed on a body, for the picker: { slot: [id, …] }
export function partsFor(body) { const B = PLUSH_LIBRARY.body[body] || PLUSH_LIBRARY.body.bean; return Object.fromEntries(PLUSH_SLOTS.slice(1).map(([slot]) => [slot, slot === 'head' ? (B.head ? Object.keys(PLUSH_LIBRARY.head).filter(k => k !== 'none') : ['none']) : B.takes.includes(slot) ? Object.keys(PLUSH_LIBRARY[slot]).filter(id => fits(slot, id, body)) : []])); }

// ---- the bodies ----
// each → { pieces, joints, sockets, views: {front, back, side}: [{pts, tone, z, flat}], lines: {view: [{pts, closed}]}, opening, height, notes }
// a socket: where a part goes in each view, and (for a part set into a seam) how much seam it has
function bodyOf(kind, H, k, head) {
  const views = { front: [], back: [], side: [] }, lines = { front: [], back: [], side: [] }, joints = [], notes = [], pieces = [], add = (v, pts, tone = 'body', z = 0) => views[v].push({ pts, tone, z });
  if (kind === 'bean' || kind === 'pillow') {
    const w = H * (kind === 'pillow' ? .82 : .7), h = H, bx = w * .36;
    const halfRun = soften(kind === 'pillow' ? [[0, 0], [w * .3, -h * .02], [w * .5, h * .2], [w * .52, h * .62], [w * .44, h * .9], [bx, h]] : [[0, 0], [w * .34, h * .04], [w * .5, h * .4], [w * .46, h * .86], [bx, h]], 3), half = [...halfRun, [0, h]];
    const front = whole(half);
    if (kind === 'pillow') {
      const per = loopLen(front), dep = Math.max(1.5, h * .2);
      pieces.push(pc('front', 'Front', front, { cut: 1, notes: ['The face embroidered before sewing'], place: { view: 'front', x: 0, y: 0, z: 2 } }), pc('back', 'Back', front, { cut: 1, notes: [`Leave a ${r8(Math.max(3, h * .25))} in opening in the gusset seam at the bottom to stuff`], place: { view: 'back', x: 0, y: 0 } }),
        pc('gusset', 'Side gusset', [[0, 0], [r8(per + .5), 0], [r8(per + .5), dep], [0, dep]], { cut: 1, notes: [`${r8(dep)} in deep, round the whole outline, its ends joined at the bottom with a ½ in overlap`], place: { view: 'front', x: -w * .5, y: h + .5, z: 0 } }));
      joints.push({ name: 'Side gusset round the front and back', a: per, b: per + .5, ease: [.25, .75], why: 'the gusset runs the whole outline, its two ends overlapping ½ in where they join' });
      add('front', front); add('back', front); const sd = roundOff([[-dep / 2, h * .02], [dep / 2, h * .02], [dep * .62, h * .5], [dep / 2, h * .98], [-dep / 2, h * .98], [-dep * .62, h * .5]], 2); add('side', sd);
      lines.back.push({ pts: [[-w * .2, h * .995], [w * .2, h * .995]] });
      return { pieces, joints, views, lines, notes, sockets: flatSockets(front, w, h, dep), height: h, depth: dep };
    }
    const backHalf = [...half, [0, 0]].slice(0, -1);
    const baseRx = solve(r => ellPer(r, r * .66), 4 * bx, .1, w), base = ellipse(baseRx, baseRx * .66, 40);
    pieces.push(pc('front', 'Front', front, { cut: 1, notes: ['The face embroidered (or the eyes set) before sewing'], place: { view: 'front', x: 0, y: 0, z: 2 } }),
      pc('back', 'Back', backHalf, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, h * .22))} in opening in the centre-back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'back', x: 0, y: 0 } }),
      pc('base', 'Base', base, { cut: 1, notes: ['An oval base so it sits; a weighted pouch of poly pellets may go inside (3 years and up)'], place: { view: 'back', x: 0, y: h, z: 1 } }));
    joints.push({ name: 'Base into the front and back', a: 4 * bx, b: ellPer(baseRx, baseRx * .66), ease: [-.25, .25], why: 'the oval base walks the bottom edges of the front and the back' });
    add('front', front); add('back', front); lines.back.push({ pts: [[0, h * .02], [0, h * .98]] }); lines.front.push({ pts: soften([[-bx, h * .985], [0, h], [bx, h * .985]], 1) });
    const dep = w * .62, side = roundOff([[0, h * .02], [dep * .32, h * .06], [dep * .5, h * .4], [dep * .52, h * .84], [dep * .36, h], [-dep * .4, h], [-dep * .56, h * .84], [-dep * .54, h * .4], [-dep * .34, h * .06]], 3);
    add('side', side); lines.side.push({ pts: soften([[0, h * .03], [dep * .06, h * .5], [0, h * .97]], 2) });
    return { pieces, joints, views, lines, notes, sockets: roundSockets(front, w, h, dep, side, { feetSpan: bx * 1.6, baseLen: 4 * bx }), height: h, depth: dep, opening: { view: 'back', at: [0, h * .55], len: Math.max(2.5, h * .22) } };
  }
  if (kind === 'ball' || kind === 'egg') {
    // the surface of revolution, top to bottom, cut flat at its foot for a base
    const n = 6, Rw = kind === 'ball' ? H / 1.92 : H * .41, prof = kind === 'ball' ? (() => { const s = sphereTo(Rw, 2 * Math.PI * Rw * .52); return s.prof; })() : Array.from({ length: 29 }, (_, i) => { const t = i / 28 * .95; return [H * t, Rw * Math.pow(Math.sin(Math.PI * Math.pow(t, 1.35)), .45)]; }); // rounded at the top, fullest low down
    const hTot = prof.at(-1)[0], g = gores(prof, n), baseR = g.bottom * n / (2 * Math.PI);
    pieces.push(pc('gore', 'Gore', g.sew, { cut: n, notes: [`${n} gores, sewn side to side from the top point to the base; leave a ${r8(Math.max(2.5, hTot * .22))} in opening in one seam to stuff`], place: { view: 'front', x: 0, y: 0, z: 1 } }),
      pc('base', 'Base', ellipse(baseR, baseR, 40), { cut: 1, notes: ['A round base so it sits'], place: { view: 'back', x: 0, y: hTot, z: 1 } }));
    joints.push({ name: 'Gores: side to side', a: lenOf(g.sew.slice(0, Math.ceil(g.sew.length / 2))), b: lenOf(g.sew.slice(0, Math.ceil(g.sew.length / 2))), ease: [-.125, .125], why: 'every gore the same, each side walking its neighbour\'s' });
    joints.push({ name: 'Base into the gores', a: g.bottom * n, b: 2 * Math.PI * baseR, ease: [-.125, .125], why: 'the round base walks the gores\' feet' });
    const half = prof.map(([y, r]) => [r, y]), front = whole([[0, 0], ...half.slice(1), [0, hTot]]), w = 2 * Rw;
    add('front', front); add('back', front); add('side', front);
    for (const v of ['front', 'back', 'side']) for (const f of [-.5, .5]) lines[v].push({ pts: prof.map(([y, r]) => [r * Math.sin(f), y]) });
    return { pieces, joints, views, lines, notes, sockets: roundSockets(front, w, hTot, w, front, { feetSpan: g.bottom * 1.6, baseLen: g.bottom * n, ring: (y) => { const i = prof.findIndex(q => q[0] >= y); return 2 * Math.PI * (prof[Math.max(0, i)]?.[1] || Rw); } }), height: hTot, depth: w, opening: { view: 'back', at: [Rw * .5, hTot * .5], len: Math.max(2.5, hTot * .22) } };
  }
  if (kind === 'torso') {
    // front and back each in two halves, a centre seam down each; the neck opening at the top (its round set by the body), the head on it
    const hh = head.h, y0 = hh * .86, bh = H - y0, bw = bh * .46, nx = bw * .4;
    // the back a little fuller than the front: its side moved out (so its side seam is the front's length), not stretched
    const run = soften([[nx, 0], [bw * .7, bh * .1], [bw, bh * .48], [bw * .94, bh * .86], [bw * .62, bh]], 3), half = [[0, 0], ...run, [0, bh]], dB = bw * .06, backRun = move(run, dB, 0), backHalf = [[0, 0], ...backRun, [0, bh]];
    const neck = 2 * nx + 2 * (nx + dB);
    pieces.push(pc('body-front', 'Body front', half, { cut: 2, pair: true, notes: ['Centre-front seam'], place: { view: 'front', x: 0, y: y0, z: 1 } }),
      pc('body-back', 'Body back', backHalf, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, H * .2))} in opening in the centre-back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'back', x: 0, y: y0 } }));
    joints.push({ name: 'Side seams: front to back', a: lenOf(run), b: lenOf(backRun), ease: [-.125, .125], why: 'the back fuller than the front across, its side seam the front\'s length' });
    const front = move(whole(half), 0, y0), back = move(whole(backHalf), 0, y0); add('front', front); add('back', back);
    lines.front.push({ pts: [[0, y0 + bh * .05], [0, H * .99]] }); lines.back.push({ pts: [[0, y0 + bh * .05], [0, H * .99]] });
    const dep = bw * 1.5, side = roundOff([[-dep * .3, y0], [dep * .3, y0], [dep * .52, y0 + bh * .5], [dep * .42, H], [-dep * .45, H], [-dep * .58, y0 + bh * .5]], 3); add('side', side);
    const S = { neck: { len: neck, front: [0, y0 + .2], back: [0, y0 + .2], side: [0, y0 + .2] },
      arm: { front: [bw * .82, y0 + bh * .2], back: [bw * .82, y0 + bh * .2], side: [-dep * .1, y0 + bh * .22], span: runAt(half, bh * .08, bh * .45) + runAt(backHalf, bh * .08, bh * .45), dir: [.55, .85] },
      leg: { front: [[bw * .48, y0 + bh * .84]], side: [[-dep * .3, y0 + bh * .86]], span: runAt(half, bh * .7, bh * 1.01), mode: 'sit' },
      tail: { back: [0, y0 + bh * .82], side: [dep * .48, y0 + bh * .8], span: bh * .3 },
      wing: { back: [bw * .4, y0 + bh * .25], front: [bw * .7, y0 + bh * .25], side: [dep * .3, y0 + bh * .25], span: bh * .4 },
      spine: { side: soften([[dep * .3, y0], [dep * .5, y0 + bh * .4], [dep * .44, y0 + bh * .9]], 2), len: bh * .9, back: [[0, y0 + bh * .05], [0, y0 + bh * .9]] },
      belly: { front: [0, y0 + bh * .55], w: bw * 1.1, h: bh * .62 }, feet: null };
    return { pieces, joints, views, lines, notes, sockets: S, height: H, depth: dep, opening: { view: 'back', at: [0, y0 + bh * .5], len: Math.max(2.5, H * .2) } };
  }
  if (kind === 'seated') {
    // two sides from the neck over the back to the seat and under to the chest; an underbody gusset between the legs; the neck opening at the
    // front-top (the two sides' neck edges), the head on it
    const hh = head.h, bh = (H - hh * .82) / .84, bl = bh * 1.05, y0 = H - bh;
    const A = [-bl * .44, bh * .24], B = [-bl * .26, 0], C = [-bl * .4, bh * .6], S0 = [bl * .32, bh];
    const backRun = soften([B, [bl * .06, -bh * .03], [bl * .38, bh * .08], [bl * .56, bh * .42], [bl * .52, bh * .84], S0], 3), bellyRun = soften([S0, [-bl * .05, bh * .99], [-bl * .3, bh * .9], C], 3);
    const side = [...backRun, ...bellyRun.slice(1), A], Lb = lenOf(bellyRun), G = lens(Lb, bl * .3);
    pieces.push(pc('body-side', 'Body side', side, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, H * .2))} in opening in the back seam to stuff, closed by hand with a ladder stitch`], place: { view: 'side', x: 0, y: y0, z: 1 } }),
      pc('underbody', 'Underbody gusset', G.sew, { cut: 1, notes: ['From the chest, between the front legs, to the seat'], place: { view: 'front', x: 0, y: y0 + bh * .6, z: 1 } }));
    joints.push({ name: 'Underbody gusset into the sides', a: Lb, b: lenOf(G.sew.slice(0, 21)), ease: [-.125, .125], why: 'each edge of the gusset walks a side from the chest to the seat' });
    const neck = 2 * dist(A, B), sideV = move(side, 0, y0); add('side', sideV);
    const rx = bh * .5, front = ellipse(rx, bh * .5, 44, 0, y0 + bh * .5); add('front', front); add('back', front); lines.back.push({ pts: [[0, y0 + bh * .08], [0, H * .98]] });
    const S = { neck: { len: neck, front: [0, y0 + bh * .14], back: [0, y0 + bh * .14], side: [(A[0] + B[0]) / 2, y0 + (A[1] + B[1]) / 2] },
      leg: { front: [[rx * .38, H - bh * .48], [rx * .86, H - bh * .3]], side: [[-bl * .32, y0 + bh * .55], [bl * .28, y0 + bh * .7]], span: Lb * .5, mode: 'four' },
      tail: { back: [0, y0 + bh * .8], side: [bl * .52, y0 + bh * .82], span: bh * .3 },
      wing: { back: [rx * .45, y0 + bh * .2], front: [rx * .8, y0 + bh * .2], side: [bl * .08, y0 + bh * .02], span: bh * .4 },
      spine: { side: move(backRun.slice(0, Math.round(backRun.length * .8)), 0, y0), len: lenOf(backRun) * .8, back: [[0, y0 + bh * .04], [0, y0 + bh * .82]] },
      belly: { front: [0, y0 + bh * .55], w: rx * 1.1, h: bh * .7 } };
    return { pieces, joints, views, lines, notes, sockets: S, height: H, depth: bl * 1.2, opening: { view: 'back', at: [0, y0 + bh * .45], len: Math.max(2.5, H * .2) } };
  }
  if (kind === 'tube') {
    // on its side: the size is its length, nose to tail; one piece wrapped and seamed down the belly, an end disc at the tail, the head at the front
    const hd = head.h, dia = hd * .7, C = Math.PI * dia, Lt = Math.max(dia * 1.5, H - hd * .8), cy = hd - dia / 2;
    pieces.push(pc('tube', 'Body', [[0, 0], [r8(Lt), 0], [r8(Lt), r8(C)], [0, r8(C)]], { cut: 1, notes: ['Wrapped and seamed along the belly', `Leave a ${r8(Math.max(2.5, Lt * .2))} in opening in the belly seam to stuff`], place: { view: 'side', x: hd * .8, y: cy - dia / 2, z: 1 } }),
      pc('end', 'Tail end', ellipse(dia / 2, dia / 2, 36), { cut: 1, notes: ['Set into the tail end of the tube'], place: { view: 'back', x: 0, y: cy, z: 1 } }));
    joints.push({ name: 'Tail end into the tube', a: r8(C), b: Math.PI * dia, ease: [-.125, .125], why: 'the end disc walks the tube\'s round' });
    const x0 = hd * .8, side = capsule([x0, cy], [x0 + Lt - dia / 2, cy], dia / 2, dia / 2, 12); add('side', side); for (const f of [.3, .55, .8]) lines.side.push({ pts: soften([[x0 + Lt * f, cy - dia / 2], [x0 + Lt * f + dia * .08, cy], [x0 + Lt * f, cy + dia / 2]], 1) });
    const endV = ellipse(dia / 2, dia / 2, 36, 0, cy); add('front', endV, 'body', -1); add('back', endV);
    const S = { neck: { len: C, front: [0, cy + dia * .2], back: [0, cy + dia * .2], side: [x0 + dia * .1, cy + dia * .1] },
      leg: { front: [[dia * .32, hd]], side: [[x0 + Lt * .15, hd - dia * .1], [x0 + Lt * .8, hd - dia * .1]], span: C * .4, mode: 'four', short: true },
      tail: { back: [0, cy], side: [x0 + Lt - dia * .1, cy - dia * .1], span: dia * .6 },
      spine: { side: [[x0, cy - dia / 2], [x0 + Lt - dia / 2, cy - dia / 2]], len: Lt * .8, back: [[0, cy - dia / 2], [0, cy - dia * .3]] },
      belly: { side: [x0 + Lt * .5, cy + dia * .2], w: Lt * .5, h: dia * .4 }, spots: { side: [[x0 + Lt * .35, cy - dia * .2], [x0 + Lt * .6, cy - dia * .25], [x0 + Lt * .82, cy - dia * .18]], r: dia * .14 } };
    return { pieces, joints, views, lines, notes, sockets: S, height: hd, length: x0 + Lt, depth: dia, horizontal: true, opening: { view: 'side', at: [x0 + Lt * .5, cy + dia / 2], len: Math.max(2.5, Lt * .2), flat: true } };
  }
  // fish: on its side, the size its length; two sides from the nose over the back to the tail stock and back under; a belly gusset
  const L = H, bh = L * .42, N = [0, bh * .52], T = [L * .84, bh * .5];
  const topRun = soften([N, [L * .12, bh * .1], [L * .4, 0], [L * .66, bh * .14], [L * .82, bh * .36], T], 3), botRun = soften([T, [L * .66, bh * .78], [L * .4, bh * .92], [L * .14, bh * .86], N], 3);
  const side = [...topRun, ...botRun.slice(1, -1)], G = lens(lenOf(botRun), bh * .55);
  pieces.push(pc('body-side', 'Body side', side, { cut: 2, pair: true, notes: [`Leave a ${r8(Math.max(2.5, L * .16))} in opening in the top seam to stuff, closed by hand with a ladder stitch`], place: { view: 'side', x: 0, y: 0, z: 2 } }),
    pc('belly', 'Belly gusset', G.sew, { cut: 1, fabric: 'contrast', notes: ['Contrast: the pale underside, from under the chin to the tail stock'], place: { view: 'front', x: 0, y: bh * .5, z: 1 } }));
  joints.push({ name: 'Belly gusset into the sides', a: lenOf(botRun), b: lenOf(G.sew.slice(0, 21)), ease: [-.125, .125], why: 'each edge of the belly walks a side from the chin to the tail stock' });
  add('side', side); lines.side.push({ pts: botRun.slice(2, -2).map(([x, y]) => [x, y - bh * .04]) });
  const bw = bh * .8, fr = ellipse(bw / 2, bh / 2, 40, 0, bh / 2); add('front', fr); add('back', fr);
  const S = { face: { front: { eyes: [[-bw * .38, bh * .42], [bw * .38, bh * .42]], nose: [0, bh * .55], w: bw * .5 }, side: { eye: [L * .14, bh * .4], nose: [L * .02, bh * .55] }, size: bh * .05, mouth: 'smile' },
    arm: { front: [bw * .45, bh * .7], back: [bw * .45, bh * .7], side: [L * .3, bh * .72], span: lenOf(botRun) * .3, dir: [.7, .4] },
    tail: { back: [0, bh * .5], side: T, span: bh * .3, end: true },
    spine: { side: topRun.slice(Math.round(topRun.length * .2), Math.round(topRun.length * .8)), len: lenOf(topRun) * .6, back: [[0, 0], [0, bh * .1]] },
    belly: { side: [L * .45, bh * .78], w: L * .4, h: bh * .2 }, spots: { side: [[L * .35, bh * .25], [L * .52, bh * .2], [L * .62, bh * .32]], r: bh * .07 } };
  return { pieces, joints, views, lines, notes, sockets: S, height: bh, length: L * .84, depth: bw, horizontal: true, opening: { view: 'side', at: [L * .45, bh * .02], len: Math.max(2.5, L * .16), flat: true } };
}
// a round body's sockets (bean, ball, egg): the face on its front, the ears and horns on top, the arms at its sides, the feet at the front of its base
function roundSockets(front, w, h, dep, side, o = {}) {
  const sb = boxOf(side), half = front.filter(q => q[0] >= 0), eY = h * .12, eX = xAt(front, eY) * .62;
  // the ears where the outline is at their height (a narrow top takes them closer in), the arms and the wings on its edge
  return { face: { front: { eyes: [[-w * .14, h * .4], [w * .14, h * .4]], nose: [0, h * .47], w: Math.min(w * .5, xAt(front, h * .42) * 1.2) }, side: { eye: [xAt(side, h * .4, -1) + dep * .12, h * .4], nose: [xAt(side, h * .47, -1) + dep * .01, h * .47] }, size: h * .025, cheeks: [[-w * .26, h * .49], [w * .26, h * .49]] },
    ear: { front: [eX, eY - h * .015], side: [xAt(side, eY, -1) * .3, eY - h * .02], span: runAt(half, 0, h * .24) * .8, rot: .25 + Math.max(0, .3 - eX / (w * .5)) },
    top: { front: [0, h * .01], side: [-dep * .05, h * .02], span: w * .25 },
    arm: { front: [xAt(front, h * .52) * .94, h * .52], back: [xAt(front, h * .52) * .94, h * .52], side: [-dep * .2, h * .55], span: runAt(half, h * .4, h * .7), dir: [.5, .85] },
    leg: { front: [[w * .18, h * .97]], side: [[-dep * .3, h * .97]], span: o.feetSpan || w * .3, mode: 'feet', ring: o.ring ? o.ring(h * .86) : o.baseLen || w * 2 },
    tail: { back: [0, h * .78], side: [sb.x1 - dep * .02, h * .78], span: h * .25 },
    wing: { back: [xAt(front, h * .5) * .6, h * .5], front: [xAt(front, h * .48) * .92, h * .48], side: [dep * .1, h * .5], span: h * .3 },
    spine: { side: soften([[0, h * .02], [sb.x1 * .8, h * .3], [sb.x1, h * .7]], 2), len: h * .7, back: [[0, h * .04], [0, h * .8]] },
    belly: { front: [0, h * .7], w: w * .55, h: h * .42 }, spots: { back: [[-w * .2, h * .35], [w * .18, h * .55], [-w * .1, h * .72]], r: h * .05 } };
}
function flatSockets(front, w, h, dep) { const S = roundSockets(front, w, h, dep, ellipse(dep / 2, h / 2, 20, 0, h / 2)); S.face.size = h * .03; return S; }

// ---- the heads ----
// each in its own place: its top at y = 0, its middle at x = 0, its neck (the opening onto the body) at the bottom middle; drafted so the
// neck walks the body's neck opening → { pieces, joints, views, lines, h, neckAt: {front, side}, sockets: {face, ear, top} }
function headOf(kind, hh, neck) {
  const views = { front: [], back: [], side: [] }, lines = { front: [], back: [], side: [] }, joints = [], pieces = [], add = (v, pts, tone = 'body', z = 0) => views[v].push({ pts, tone, z });
  if (kind === 'ball') {
    const R = hh / 1.82, s = sphereTo(R, neck), g = gores(s.prof, 6), h = s.h;
    pieces.push(pc('head-gore', 'Head gore', g.sew, { cut: 6, notes: ['Six gores from the crown; the neck left open at their feet'], place: { view: 'front', x: 0, y: 0, z: 3 } }));
    joints.push({ name: 'Head gores: side to side', a: 1, b: 1, ease: [0, 0], why: 'the six gores are the same, each side walking its neighbour\'s' });
    joints.push({ name: 'Head onto the neck', a: neck, b: g.bottom * 6, ease: [-.125, .125], why: 'the gores\' feet walk the body\'s neck opening' });
    const half = s.prof.map(([y, r]) => [r, y]), out = whole([[0, 0], ...half.slice(1), [0, h]]); add('front', out); add('back', out); add('side', out);
    for (const f of [-.5, .5]) lines.front.push({ pts: s.prof.slice(0, -2).map(([y, r]) => [r * Math.sin(f), y]) });
    return { pieces, joints, views, lines, h, w: 2 * R, sockets: { face: { front: { eyes: [[-R * .36, h * .5], [R * .36, h * .5]], nose: [0, h * .62], w: R * 1.1 }, side: { eye: [-R * .7, h * .48], nose: [-R * .96, h * .6] }, size: h * .035, cheeks: [[-R * .55, h * .66], [R * .55, h * .66]] },
      ear: { front: [R * .66, h * .14], side: [R * .1, h * .06], span: g.length * .22, rot: .45 }, top: { front: [0, 0], side: [0, 0], span: R * .5 } } };
  }
  if (kind === 'flat') {
    // front and back, wide and soft, their flat feet each half the neck
    const hw = hh * .64, nb = neck / 4, half = [[0, 0], ...soften([[hw * .1, 0], [hw * .78, hh * .04], [hw, hh * .45], [hw * .86, hh * .86], [nb, hh]], 3), [0, hh]], out = whole(half);
    pieces.push(pc('head-front', 'Head front', out, { cut: 1, notes: ['The face embroidered before sewing'], place: { view: 'front', x: 0, y: 0, z: 3 } }), pc('head-back', 'Head back', out, { cut: 1, notes: ['Its neck edge onto the body\'s neck opening'], place: { view: 'back', x: 0, y: 0, z: 3 } }));
    joints.push({ name: 'Head onto the neck', a: neck, b: 4 * nb, ease: [-.125, .125], why: 'the front\'s and the back\'s flat feet walk the body\'s neck opening' });
    add('front', out); add('back', out); const sd = roundOff([[-hw * .4, hh * .02], [hw * .4, hh * .02], [hw * .55, hh * .5], [hw * .35, hh], [-hw * .35, hh], [-hw * .55, hh * .5]], 3); add('side', sd);
    return { pieces, joints, views, lines, h: hh, w: 2 * hw, sockets: { face: { front: { eyes: [[-hw * .4, hh * .55], [hw * .4, hh * .55]], nose: [0, hh * .64], w: hw * 1.2 }, side: { eye: [-hw * .42, hh * .52], nose: [-hw * .55, hh * .62] }, size: hh * .04, cheeks: [[-hw * .62, hh * .7], [hw * .62, hh * .7]] },
      ear: { front: [hw * .6, hh * .06], side: [0, hh * .04], span: runAt(half, 0, hh * .3) * .8, rot: .3 }, top: { front: [0, 0], side: [0, 0], span: hw * .4 } } };
  }
  // the bear head and the long snout: two sides (the head in profile, the nose toward -x) and a gusset from the nose over the crown to the
  // back of the neck; the two sides meet under the chin; the neck their two flat feet and the gusset's end
  const snout = kind === 'snout', hw = hh * (snout ? 1.15 : 1.02), g = hw * .16, ns = Math.max(.25, (neck - g) / 2);
  const P1 = [hw * .26, hh * .96], P0 = [P1[0] - ns, hh * .96], Nz = snout ? [-hw * .62, hh * .66] : [-hw * .48, hh * .6];
  const top = soften([Nz, snout ? [-hw * .45, hh * .5] : [-hw * .38, hh * .26], [-hw * .1, hh * .02], [hw * .26, hh * .06], [hw * .46, hh * .42], [hw * .4, hh * .78], P1], 3);
  const chin = soften([P0, [Math.min(P0[0], -hw * .05) - hw * .1, hh * .9], snout ? [-hw * .45, hh * .8] : [-hw * .4, hh * .76], Nz], 2);
  const sideP = [...top, ...chin.slice(0, -1)], run = lenOf(top); // the nose, over the crown to the back of the neck, the flat neck, the chin back to the nose
  // the gusset: as long round its edges as the sides' top run, narrow at the nose, widest over the crown, the neck's width at its end
  const gw = hw * .36, mk = Lg => { const n = 22, r = Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return [Math.max(.02, gw / 2 * Math.sin(Math.PI * Math.min(1, t * .9 + .02)) * (t > .85 ? 1 : 1) * (1 - t) + g / 2 * t), Lg * t]; }); return r; };
  const Lg = solve(L => lenOf(mk(L)), run, run * .5, run), gr = mk(Lg), gus = [...gr, ...mirror(gr).reverse()];
  pieces.push(pc('head-side', snout ? 'Head side and snout' : 'Head side', sideP, { cut: 2, pair: true, notes: [snout ? 'Cut in one with the snout: the two sides meet under the chin and the snout' : 'The two sides meet under the chin', 'The nose point meets the gusset'], place: { view: 'side', x: 0, y: 0, z: 3 } }),
    pc('head-gusset', 'Head gusset', gus, { cut: 1, notes: ['From the nose over the crown to the back of the neck'], place: { view: 'front', x: 0, y: 0, z: 4 } }));
  joints.push({ name: 'Head gusset into the sides', a: run, b: lenOf(gr), ease: [-.125, .125], why: 'each edge of the gusset walks a side from the nose to the back of the neck' });
  joints.push({ name: 'Head onto the neck', a: neck, b: 2 * dist(P0, P1) + g, ease: [-.125, .125], why: 'the sides\' flat feet and the gusset\'s end walk the body\'s neck opening' });
  const sb = boxOf(sideP), fw = hh * .54, frontO = roundOff([[0, 0], [fw * .7, hh * .04], [fw, hh * .4], [fw * .86, hh * .8], [fw * .4, hh], [-fw * .4, hh], [-fw * .86, hh * .8], [-fw, hh * .4], [-fw * .7, hh * .04]], 3);
  add('front', frontO); add('back', frontO); add('side', move(sideP, 0, 0));
  lines.front.push({ pts: soften([[-fw * .2, hh * .02], [-fw * .14, hh * .4], [-fw * .1, hh * .55]], 2) }, { pts: soften([[fw * .2, hh * .02], [fw * .14, hh * .4], [fw * .1, hh * .55]], 2) });
  lines.side.push({ pts: top.slice(2, -2).map(([x, y]) => [x + .06, y + .1]) });
  if (snout) { const sn = ellipse(fw * .32, hh * .18, 32, 0, hh * .66); add('front', sn, 'body', 1); }
  return { pieces, joints, views, lines, h: hh, w: 2 * fw, sideBox: sb, sockets: { face: { front: { eyes: [[-fw * .38, hh * .44], [fw * .38, hh * .44]], nose: [0, snout ? hh * .6 : hh * .62], w: fw * .9 }, side: { eye: [-hw * .14, hh * .4], nose: [Nz[0] + .1, Nz[1] - .05] }, size: hh * .03, cheeks: [[-fw * .62, hh * .66], [fw * .62, hh * .66]], snout },
    ear: { front: [fw * .7, hh * .1], side: [hw * .12, hh * .06], span: run * .3, rot: .4 }, top: { front: [0, 0], side: [-hw * .05, hh * .01], span: gw * .9 } } };
}

// ---- what goes on them ----
// an ear's outline, its base (the edge set into the seam) along y = 0 from -w/2 to w/2, the ear rising toward -y
function earOutline(kind, w) {
  if (kind === 'long') return soften([[-w / 2, 0], [-w * .55, -w * .8], [-w * .45, -w * 2.4], [0, -w * 2.9], [w * .45, -w * 2.4], [w * .55, -w * .8], [w / 2, 0]], 3);
  if (kind === 'pointed') return soften([[-w / 2, 0], [-w * .32, -w * .5], [0, -w * 1.02], [w * .32, -w * .5], [w / 2, 0]], 2);
  if (kind === 'fox') return soften([[-w / 2, 0], [-w * .3, -w * .8], [0, -w * 1.5], [w * .3, -w * .8], [w / 2, 0]], 2);
  if (kind === 'floppy') return soften([[-w / 2, 0], [-w * .62, -w * .7], [-w * .4, -w * 1.5], [0, -w * 1.75], [w * .4, -w * 1.5], [w * .62, -w * .7], [w / 2, 0]], 3);
  if (kind === 'big') return soften([[-w / 2, 0], [-w * .9, -w * .3], [-w * 1, -w * 1], [-w * .5, -w * 1.4], [w * .2, -w * 1.25], [w * .55, -w * .7], [w / 2, 0]], 3);
  if (kind === 'mouse') return soften([[-w / 2, 0], [-w * .95, -w * .45], [-w * .8, -w * 1.25], [0, -w * 1.55], [w * .8, -w * 1.25], [w * .95, -w * .45], [w / 2, 0]], 3);
  return soften([[-w / 2, 0], [-w * .62, -w * .62], [0, -w * .92], [w * .62, -w * .62], [w / 2, 0]], 3); // round
}
const EAR_W = { round: .3, pointed: .3, fox: .3, long: .2, floppy: .28, big: .42, mouse: .3 };
// a part placed in a view: its outline at the socket, turned, mirrored for the left
const at = (P, [x, y], rot = 0, sg = 1) => move(turn(sg < 0 ? mirror(P) : P, sg * rot), x * sg, y);

function partsOf(b, S, ctx) {
  const { H, hh, k } = ctx, views = { front: [], back: [], side: [] }, joints = [], pieces = [], notes = [], add = (v, pts, tone = 'body', z = 0) => views[v].push({ pts, tone, z, part: true });
  const pair = (sock, fn) => { for (const sg of [1, -1]) fn(sg, sock); };
  const unit = hh || H * .42; // a part's size is set by the head (or the body's top, when it is the head)
  // ears: outer in self, inner in contrast (a big ear lined), set into the seam at the top of the head
  if (b.ears !== 'none' && S.ear) {
    // an ear no wider at its base than the seam takes; a big ear's wide base pleated down to fit it (an elephant's)
    const big = b.ears === 'big', w0 = unit * EAR_W[b.ears] * k.ears, w = big ? w0 : Math.min(w0, S.ear.span * .95), O = earOutline(b.ears, w), base = big ? Math.min(w, S.ear.span * .9) : w;
    if (big && base < w - .01) notes.push(`The ears' bases pleated from ${r8(w)} in down to ${r8(base)} in to set into the head seam`);
    pieces.push(pc('ear', b.ears === 'big' ? 'Ear' : 'Ear', O, { cut: 4, pair: true, notes: [b.ears === 'big' ? `Two in self (the backs), two lined in contrast; interfaced so they stand out; the base pleated to ${r8(base)} in` : 'Two outer in self, two inner in contrast', 'Sewn and turned, the base left open; set into the head seam (or a slit) with the inner facing forward'], place: { view: 'front', x: S.ear.front[0], y: S.ear.front[1], z: 2 } }));
    joints.push({ name: 'Ears into the head seam', a: S.ear.span, b: base, ease: [-S.ear.span, 0], why: 'each ear\'s base set into the seam at the top of the head: no wider than the seam that takes it' });
    const hang = b.ears === 'floppy' ? Math.PI - .5 : b.ears === 'big' ? Math.PI / 2 + .2 : 0;
    for (const v of ['front', 'back']) pair(S.ear, sg => { const e = at(O, S.ear.front, (S.ear.rot || .3) + hang, sg); add(v, e, 'body', b.ears === 'big' ? -2 : 1.5); if (v === 'front' && b.ears !== 'floppy') add(v, at(scale(O, .62, .72), S.ear.front, (S.ear.rot || .3) + hang, sg), 'contrast', b.ears === 'big' ? -1.9 : 1.6); });
    add('side', at(scale(O, .5, 1), S.ear.side, hang ? hang * .8 : -.1, 1), 'body', b.ears === 'big' ? 4 : 1.5);
  }
  // the face: eyes and a nose always (as the eyes are chosen); a muzzle, a beak, a felt nose or a trunk on it
  const F = S.face, fw = F.front.w;
  if (b.face === 'muzzle') { const rx = fw * .32 * k.face, ry = rx * .7, m = ellipse(rx, ry, 32); pieces.push(pc('muzzle', 'Muzzle', m, { cut: 1, fabric: 'contrast', notes: ['Contrast: appliquéd (or stuffed lightly and sewn on) before the face is closed'], place: { view: 'front', x: F.front.nose[0], y: F.front.nose[1] + ry * .3, z: 5 } }));
    joints.push({ name: 'Muzzle on the face', a: fw, b: 2 * rx, ease: [-fw, 0], why: 'appliquéd: no wider than the face' }); add('front', move(m, F.front.nose[0], F.front.nose[1] + ry * .3), 'contrast', 5); add('side', ellipse(ry * .6, ry, 24, F.side.nose[0] + ry * .3, F.side.nose[1] + ry * .2), 'contrast', 5); }
  if (b.face === 'nose') { const rx = fw * .14 * k.face, m = ellipse(rx, rx * .7, 28); pieces.push(pc('nose', 'Nose', m, { cut: 1, fabric: 'contrast', notes: ['Felt (or leather), appliquéd with a satin-stitch edge'], place: { view: 'front', x: F.front.nose[0], y: F.front.nose[1], z: 6 } }));
    joints.push({ name: 'Nose on the face', a: fw, b: 2 * rx, ease: [-fw, 0], why: 'appliquéd: no wider than the face' }); add('front', move(m, ...F.front.nose), 'dark', 6); add('side', ellipse(rx * .5, rx * .7, 20, F.side.nose[0], F.side.nose[1]), 'dark', 6); }
  if (b.face === 'beak') { const bw = fw * .22 * k.face, bl = bw * 1.1, bk = soften([[-bw / 2, 0], [0, bl], [bw / 2, 0]], 1); pieces.push(pc('beak', 'Beak', [[-bw / 2, 0], [bw / 2, 0], [0, bl]], { cut: 2, fabric: 'contrast', notes: ['Two pieces, sewn and turned, stuffed firm; its open base sewn on by hand'], place: { view: 'front', x: F.front.nose[0], y: F.front.nose[1] - bl * .2, z: 6 } }));
    joints.push({ name: 'Beak on the face', a: fw, b: bw, ease: [-fw, 0], why: 'its base sewn on by hand: no wider than the face' }); add('front', move(bk, F.front.nose[0], F.front.nose[1] - bl * .25), 'beak', 6); add('side', [[F.side.nose[0] + bl * .4, F.side.nose[1] - bw * .3], [F.side.nose[0] - bl * .7, F.side.nose[1] + bw * .1], [F.side.nose[0] + bl * .4, F.side.nose[1] + bw * .4]], 'beak', 6); }
  if (b.face === 'trunk') { const tl = unit * .75 * k.face, tw = fw * .32, t0 = [F.front.nose[0], F.front.nose[1] - tw * .2], tube = [[0, 0], [tw * 1.6, 0], [tw * 1.15, tl], [tw * .45, tl]];
    pieces.push(pc('trunk', 'Trunk', tube.map(([x, y]) => [x - tw * .8, y]), { cut: 2, notes: ['Two pieces, sewn down both sides, stuffed firm, the tip turned up; sewn round its base onto the face'], place: { view: 'front', x: t0[0], y: t0[1], z: 6 } }));
    joints.push({ name: 'Trunk on the face', a: fw * 1.6, b: tw * 1.6, ease: [-fw * 1.6, 0], why: 'sewn round its base onto the face: no wider than the face' });
    add('front', capsule(t0, [t0[0] + tw * .1, t0[1] + tl * .9], tw * .5, tw * .3), 'body', 6); const sn = F.side.nose; add('side', capsule(sn, [sn[0] - tl * .5, sn[1] + tl * .65], tw * .5, tw * .3), 'body', 6); }
  // arms: set into the side seams
  if (b.arms !== 'none' && S.arm) {
    const L = (b.arms === 'dangly' ? H * .42 : b.arms === 'nub' ? H * .14 : b.arms === 'flipper' ? H * .24 : H * .3) * k.arms, base = Math.min(L * (b.arms === 'nub' ? .7 : b.arms === 'flipper' ? .4 : .32), S.arm.span * .9), shape = b.arms === 'flipper' ? soften([[-base / 2, 0], [-base * .62, L * .5], [0, L], [base * .62, L * .5], [base / 2, 0]], 3) : soften([[-base / 2, 0], [-base * .55, L * .7], [0, L], [base * .55, L * .7], [base / 2, 0]], 3);
    pieces.push(pc('arm', { nub: 'Arm nub', tube: 'Arm', flipper: 'Flipper', dangly: 'Arm' }[b.arms], shape, { cut: 4, pair: true, notes: [b.arms === 'flipper' ? 'Two pairs: sewn, turned and topstitched flat' : 'Two pairs: inner and outer, sewn, turned and stuffed', 'Its open base set into the side seam'], place: { view: 'front', x: S.arm.front[0], y: S.arm.front[1], z: 1 } }));
    joints.push({ name: 'Arms into the side seams', a: S.arm.span, b: base, ease: [-S.arm.span, 0], why: 'each arm\'s base set into the side seam: no wider than the seam that takes it' });
    const [dx, dy] = S.arm.dir || [.5, .85], r = base * .5;
    for (const v of ['front', 'back']) pair(S.arm, sg => { const a0 = [S.arm[v][0] * sg, S.arm[v][1]], a1 = [a0[0] + sg * dx * L * .8, a0[1] + dy * L * .8]; add(v, b.arms === 'flipper' ? ellipse(L * .45, r * .9, 28, (a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2, Math.atan2(a1[1] - a0[1], a1[0] - a0[0])) : capsule(a0, a1, r, r * 1.05), 'body', v === 'front' ? 2 : 2); });
    const s0 = S.arm.side; add('side', capsule(s0, [s0[0] - L * .45, s0[1] + L * .6], r, r * 1.05), 'body', 3);
  }
  // legs
  if (b.legs !== 'none' && S.leg) {
    const L = S.leg, mode = b.legs;
    if (mode === 'feet') { const fw = Math.min(L.span * .45, unit * .38) * k.legs, foot = soften([[-fw / 2, 0], [-fw * .55, fw * .45], [0, fw * .7], [fw * .55, fw * .45], [fw / 2, 0]], 2);
      pieces.push(pc('foot', 'Foot', foot, { cut: 4, pair: true, notes: ['Two pairs, sewn, turned and stuffed; set into the base seam at the front'], place: { view: 'front', x: L.front[0][0], y: L.front[0][1], z: 3 } }));
      joints.push({ name: 'Feet into the base seam', a: L.span, b: fw, ease: [-L.span, 0], why: 'each foot\'s base set into the seam round the base: no wider than the seam at the front' });
      pair(L, sg => add('front', ellipse(fw * .55, fw * .32, 24, L.front[0][0] * sg, L.front[0][1]), 'body', 3)); add('side', ellipse(fw * .55, fw * .3, 24, L.side[0][0] - fw * .2, L.side[0][1]), 'body', 3); }
    else if (mode === 'tentacles') { const n = 8, ring = L.ring || unit * 6, tw = Math.min(ring / n * .8, unit * .3) * k.legs, tl = H * .42 * k.legs, t = soften([[-tw / 2, 0], [-tw * .45, tl * .6], [0, tl], [tw * .45, tl * .6], [tw / 2, 0]], 3);
      pieces.push(pc('tentacle', 'Tentacle', t, { cut: 16, notes: ['Eight, each in two (the undersides in contrast if you like), sewn, turned, stuffed lightly; set round the base seam'], place: { view: 'front', x: 0, y: H * .9, z: 3 } }));
      joints.push({ name: 'Tentacles round the base', a: ring, b: n * tw, ease: [-ring, 0], why: 'eight bases side by side round the base seam: no more than its round' });
      const y = L.front[0][1] - tw * .2; for (let i = 0; i < 5; i++) { const f = (i - 2) / 2, x0 = f * ring / Math.PI * .45; add('front', capsule([x0, y], [x0 + f * tl * .5, y + tl * .55], tw * .5, tw * .28), 'body', 3 + (i === 2 ? .5 : 0)); }
      for (let i = 0; i < 3; i++) add('side', capsule([L.side[0][0] + i * tw * 1.2, L.side[0][1] - tw * .2], [L.side[0][0] + i * tw * 1.2 - tl * .4, L.side[0][1] + tl * .5], tw * .5, tw * .28), 'body', 3);
      for (let i = 0; i < 5; i++) { const f = (i - 2) / 2, x0 = f * ring / Math.PI * .45; add('back', capsule([x0, y], [x0 + f * tl * .5, y + tl * .5], tw * .5, tw * .28), 'body', -1); } }
    else {
      // legs on foot pads: each leg in two (inner and outer), its foot open for a pad solved to walk it
      const four = mode === 'four', dangly = mode === 'dangly', ll = (dangly ? H * .42 : four ? (L.short ? H * .12 : H * .3) : H * .28) * k.legs, lw = Math.min(dangly ? ll * .28 : four ? ll * .42 : ll * .5, L.span * .9), ft = lw * .9;
      const leg = soften([[-lw / 2, 0], [-lw * .52, ll * .7], [-ft / 2, ll]], 2).concat(soften([[ft / 2, ll], [lw * .52, ll * .7], [lw / 2, 0]], 2));
      const padR = solve(r => ellPer(r, r * .75), 2 * ft, .05, ft * 2);
      pieces.push(pc('leg', four ? 'Leg' : 'Leg', leg, { cut: four ? 8 : 4, pair: true, notes: [four ? 'Four legs, each inner and outer' : 'Two legs, each inner and outer', dangly ? 'Sewn, turned, stuffed lightly so they dangle; set into the seam' : 'Sewn and turned; the pad set into the foot; stuffed firm; sewn on (or set into the seam)'], place: { view: 'front', x: L.front[0][0], y: L.front[0][1], z: 3 } }));
      if (!dangly) { pieces.push(pc('foot-pad', 'Foot pad', ellipse(padR, padR * .75, 28), { cut: four ? 4 : 2, fabric: 'contrast', notes: ['Contrast, set into the foot of each leg'], place: { view: 'back', x: 0, y: H * .96, z: 3 } }));
        joints.push({ name: 'Foot pads into the legs', a: 2 * ft, b: ellPer(padR, padR * .75), ease: [-.125, .125], why: 'each pad walks its leg\'s foot opening (the inner\'s and the outer\'s foot edges)' }); }
      joints.push({ name: dangly ? 'Legs into the seam' : 'Legs onto the body', a: L.span, b: lw, ease: [-L.span, 0], why: 'each leg\'s top no wider than the seam (or the place) it is sewn to' });
      const r = lw * .5;
      if (four) { const [fr, hi] = L.front.length > 1 ? L.front : [L.front[0], [L.front[0][0] * 2.2, L.front[0][1]]];
        for (const v of ['front', 'back']) pair(L, sg => { add(v, capsule([fr[0] * sg, fr[1]], [fr[0] * sg, fr[1] + ll * .9], r, r * 1.05), 'body', v === 'front' ? 3 : -1); add(v, ellipse(r * 1.2, r * .8, 24, hi[0] * sg, hi[1] + ll * .1), 'body', v === 'front' ? .5 : 2); if (v === 'front') add(v, ellipse(r * .75, r * .35, 20, fr[0] * sg, fr[1] + ll * .9 + r * .4), 'contrast', 3.1); });
        for (const p of L.side) add('side', capsule(p, [p[0], p[1] + ll * .9], r, r * 1.05), 'body', 3); }
      else if (dangly) { for (const v of ['front', 'back']) pair(L, sg => add(v, capsule([L.front[0][0] * sg, L.front[0][1] - r], [L.front[0][0] * sg * 1.3, L.front[0][1] + ll * .9], r, r * 1.15), 'body', v === 'front' ? 3 : -1)); add('side', capsule([L.side[0][0], L.side[0][1] - r], [L.side[0][0] - ll * .3, L.side[0][1] + ll * .85], r, r * 1.15), 'body', 3); }
      else { pair(L, sg => { const a0 = [L.front[0][0] * sg, L.front[0][1]], a1 = [a0[0] * 1.15, a0[1] + ll * .55]; add('front', capsule(a0, a1, r, r * 1.08), 'body', 3); add('front', ellipse(r * .95, r * .7, 24, a1[0], a1[1] + r * .2), 'contrast', 3.1); add('back', capsule(a0, a1, r, r * 1.08), 'body', -1); });
        add('side', capsule(L.side[0], [L.side[0][0] - ll * .75, L.side[0][1] + ll * .1], r, r * 1.08), 'body', 3); add('side', ellipse(r * .35, r * .95, 20, L.side[0][0] - ll * .75 - r, L.side[0][1] + ll * .1), 'contrast', 3.1); }
    }
  }
  // the tail: set into the back seam
  if (b.tail !== 'none' && S.tail) {
    const T = S.tail, u = (S.tail.end ? H * .25 : H * .2) * k.tail, kind = b.tail;
    const outline = { pom: ellipse(u * .4, u * .4, 28), stub: ellipse(u * .22, u * .28, 24), long: soften([[-u * .08, 0], [-u * .07, u * 1.6], [0, u * 1.7], [u * .07, u * 1.6], [u * .08, 0]], 2), bushy: soften([[-u * .15, 0], [-u * .42, u * .7], [-u * .25, u * 1.45], [0, u * 1.6], [u * .25, u * 1.45], [u * .42, u * .7], [u * .15, 0]], 3),
      curly: [[0, 0], [u * 1.6, 0], [u * 1.6, u * .16], [0, u * .16]], fluke: soften([[-u * .1, 0], [-u * .7, u * .5], [-u * .5, u * .62], [0, u * .38], [u * .5, u * .62], [u * .7, u * .5], [u * .1, 0]], 2), fin: soften([[-u * .1, 0], [-u * .55, u * .7], [0, u * .45], [u * .55, u * .7], [u * .1, 0]], 1),
      spiked: soften([[-u * .16, 0], [-u * .1, u * 1.2], [0, u * 1.5], [u * .1, u * 1.2], [u * .16, 0]], 2) }[kind];
    const base = kind === 'pom' ? u * .3 : kind === 'stub' ? u * .3 : kind === 'curly' ? u * .16 : 2 * Math.max(...outline.filter(q => Math.abs(q[1]) < u * .05).map(q => Math.abs(q[0])), u * .1);
    pieces.push(pc('tail', { pom: 'Tail (pompom)', stub: 'Tail', long: 'Tail', bushy: 'Tail', curly: 'Curly tail', fluke: 'Tail fluke', fin: 'Tail fin', spiked: 'Tail' }[kind], outline, { cut: kind === 'pom' || kind === 'curly' ? 1 : 2, ...(kind === 'pom' ? { fabric: 'contrast' } : {}), notes: [kind === 'pom' ? 'A circle, gathered round its edge, stuffed and pulled up into a ball' : kind === 'curly' ? 'A strip folded and sewn into a tube, a pipe cleaner inside (3 years and up) or wound and stitched into a curl' : 'Two pieces, sewn, turned and stuffed', 'Sewn into the back seam'], place: { view: 'back', x: T.back[0], y: T.back[1], z: 4 } }));
    if (kind === 'spiked') { pieces.push(pc('tail-spikes', 'Tail spikes', [[0, 0], ...Array.from({ length: 4 }, (_, i) => [[(i + .5) * u * .3, -u * .14], [(i + 1) * u * .3, 0]]).flat(), [u * 1.2, u * .05], [0, u * .05]], { cut: 2, fabric: 'contrast', notes: ['Sewn, turned, set into the tail\'s top seam'], place: { view: 'back', x: 0, y: T.back[1], z: 4.5 } })); }
    joints.push({ name: 'Tail into the back seam', a: T.span, b: base, ease: [-T.span, 0], why: 'its base set into the back seam: no wider than the seam that takes it' });
    const tone = kind === 'pom' ? 'contrast' : kind === 'fluke' || kind === 'fin' ? 'body' : 'body', curl = kind === 'curly';
    const sidePts = curl ? (() => { const out = []; for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 3.2; out.push([T.side[0] + u * .25 * i / 18 + Math.cos(a) * u * .14, T.side[1] - Math.sin(a) * u * .14]); } return capsuleLine(out, u * .06); })()
      : kind === 'fluke' || kind === 'fin' ? at(outline, T.side, -Math.PI / 2, 1) : kind === 'pom' || kind === 'stub' ? move(outline, T.side[0] + u * .1, T.side[1]) : at(outline, T.side, -Math.PI / 2 - .5, 1);
    add('side', sidePts, tone, kind === 'fluke' || kind === 'fin' ? -1 : -1);
    add('back', kind === 'fluke' ? ellipse(u * .7, u * .12, 24, T.back[0], T.back[1]) : kind === 'fin' ? ellipse(u * .1, u * .6, 24, T.back[0], T.back[1]) : curl ? ellipse(u * .16, u * .16, 20, T.back[0], T.back[1]) : move(outline, T.back[0], T.back[1] - (kind === 'pom' || kind === 'stub' ? 0 : u * .3)), tone, 5);
    if (!ctx.horizontal && (kind === 'bushy' || kind === 'long' || kind === 'spiked')) add('front', at(outline, [S.belly?.w * .55 || H * .3, H * .9], -Math.PI / 2 - .9, 1), tone, -3);
  }
  // horns and antennae: set into the seam at the top of the head
  if (b.horns !== 'none' && S.top) {
    const u = unit * k.horns, T = S.top, one = b.horns === 'one';
    const cone = one ? [[-u * .09, 0], [0, -u * .5], [u * .09, 0]] : b.horns === 'antlers' ? soften([[-u * .05, 0], [-u * .05, -u * .25], [-u * .25, -u * .42], [-u * .2, -u * .48], [-u * .02, -u * .36], [0, -u * .6], [u * .05, -u * .58], [u * .05, 0]], 1) : b.horns === 'antennae' ? [[-u * .02, 0], [-u * .02, -u * .45], [u * .02, -u * .45], [u * .02, 0]] : soften([[-u * .08, 0], [-u * .02, -u * .34], [u * .04, -u * .38], [u * .08, 0]], 1);
    const base = 2 * Math.max(...cone.filter(q => Math.abs(q[1]) < .01).map(q => Math.abs(q[0])));
    pieces.push(pc(one ? 'horn' : b.horns === 'antennae' ? 'antenna' : b.horns === 'antlers' ? 'antler' : 'horn', one ? 'Horn' : b.horns === 'antennae' ? 'Antenna' : b.horns === 'antlers' ? 'Antler' : 'Horn', b.horns === 'antennae' ? [[0, 0], [u * .1, 0], [u * .1, u * .45], [0, u * .45]] : cone, { cut: one ? 1 : 4, ...(one ? {} : { pair: true }), fabric: 'contrast', notes: [one ? 'Rolled into a cone, stuffed firm, a spiral of stitching wound up it' : b.horns === 'antennae' ? 'A strip folded into a tube round a cord, a pompom (or a felt ball) at its tip' : 'Two pairs: sewn, turned and stuffed firm', 'Set into the seam at the top of the head'], place: { view: 'front', x: T.front[0], y: T.front[1], z: 2.8 } }));
    if (b.horns === 'antennae') pieces.push(pc('antenna-tip', 'Antenna tip', ellipse(u * .09, u * .09, 24), { cut: 2, fabric: 'contrast', notes: ['Gathered into a ball round the tip'], place: { view: 'front', x: 0, y: 0, z: 3 } }));
    // one horn in the seam at the top of the head; two (horns, antlers, antennae) apart, each in the seam on its side of the crown
    const span = one ? T.span : (S.ear?.span || T.span);
    joints.push({ name: one ? 'Horn into the top seam' : b.horns === 'antennae' ? 'Antennae into the head seams' : 'Horns into the head seams', a: span, b: base, ease: [-span, 0], why: one ? 'set into the seam at the top of the head: no wider than the seam there' : 'each set into the seam on its side of the crown: no wider than that seam' });
    const tone = 'horn';
    if (one) for (const v of ['front', 'back', 'side']) add(v, move(cone, T[v === 'back' ? 'front' : v][0], T[v === 'back' ? 'front' : v][1] + u * .04), tone, 2.8);
    else for (const v of ['front', 'back']) pair(T, sg => { const p = [T.front[0] + sg * Math.max(T.span * .32, u * .12), T.front[1] + u * .06]; const c = at(cone, p, .25, sg); add(v, c, tone, 2.8); if (b.horns === 'antennae') add(v, ellipse(u * .08, u * .08, 20, c.reduce((m, q) => q[1] < m[1] ? q : m)[0], c.reduce((m, q) => q[1] < m[1] ? q : m)[1]), 'contrast', 2.9); });
    if (!one) { const c = move(cone, T.side[0], T.side[1] + u * .04); add('side', c, tone, 2.8); if (b.horns === 'antennae') add('side', ellipse(u * .08, u * .08, 20, T.side[0], T.side[1] - u * .42), 'contrast', 2.9); }
  }
  // wings: set into the back (or side) seam
  if (b.wings !== 'none' && S.wing) {
    const u = H * .36 * k.wings, W = S.wing;
    const wing = b.wings === 'bird' ? soften([[0, 0], [u * .35, -u * .12], [u * .7, u * .1], [u * .55, u * .4], [u * .3, u * .5], [u * .1, u * .3]], 3) : b.wings === 'bat' ? soften([[0, 0], [u * .4, -u * .3], [u * .8, -u * .2], [u * .7, u * .05], [u * .55, -u * .02], [u * .45, u * .18], [u * .3, u * .08], [u * .15, u * .22]], 1) : soften([[0, 0], [u * .3, -u * .45], [u * .62, -u * .35], [u * .45, 0], [u * .58, u * .3], [u * .3, u * .42], [u * .05, u * .12]], 3);
    const base = u * (b.wings === 'bat' ? .22 : .2);
    pieces.push(pc('wing', 'Wing', wing, { cut: 4, pair: true, notes: [b.wings === 'bat' ? 'Two in self, two lined in contrast: sewn, turned, topstitched along the ribs' : 'Two in self, two lined in contrast: sewn, turned and topstitched; stuffed lightly', 'Set into the back seam (or sewn on by hand)'], place: { view: 'back', x: W.back[0], y: W.back[1], z: 4 } }));
    joints.push({ name: 'Wings into the back seam', a: W.span, b: base, ease: [-W.span, 0], why: 'each wing\'s base set into the seam: no wider than the seam that takes it' });
    pair(W, sg => { add('back', at(wing, W.back, -.2, sg), 'wing', 4); add('front', at(wing, W.front, -.3, sg), 'wing', -2); });
    add('side', at(wing, W.side, -.6, 1), 'wing', 4);
  }
  // down the back: spikes, a dorsal fin, a mane crest; a mane ruff round the face
  if (b.back !== 'none' && S.spine) {
    const sp = S.spine, len = sp.len * .9;
    if (b.back === 'spikes') { const n = Math.max(4, Math.round(len / (unit * .28))), st = len / n, sh = st * .9;
      pieces.push(pc('spikes', 'Spikes', [[0, 0], ...Array.from({ length: n }, (_, i) => [[(i + .5) * st, -sh], [(i + 1) * st, 0]]).flat(), [len, sh * .25], [0, sh * .25]], { cut: 2, fabric: 'contrast', notes: ['Sewn, turned and stuffed lightly, then set into the back seam'], place: { view: 'back', x: 0, y: sp.back[0][1], z: 4 } }));
      joints.push({ name: 'Spikes into the back seam', a: sp.len, b: len, ease: [-sp.len, 0], why: 'the strip set into the back seam: no longer than the seam' });
      add('side', spikesOn(sp.side, n, sh), 'contrast', -.5); add('back', spikesOn(sp.back, Math.max(3, Math.round(n * .7)), sh * .55, true), 'contrast', 4.5); }
    if (b.back === 'dorsal') { const u = H * .18 * k.tail, fin = soften([[0, 0], [u * .9, 0], [u * .6, -u * .7], [u * .1, -u * .8]], 1); pieces.push(pc('dorsal', 'Dorsal fin', fin, { cut: 2, notes: ['Sewn, turned and stuffed lightly; set into the top seam'], place: { view: 'side', x: 0, y: 0, z: 1 } }));
      joints.push({ name: 'Dorsal fin into the top seam', a: sp.len, b: u * .9, ease: [-sp.len, 0], why: 'its base set into the top seam: no longer than the seam' });
      const mid = sp.side[Math.floor(sp.side.length / 2)]; add('side', move(fin, mid[0] - u * .45, mid[1] + .05), 'body', -1); add('back', ellipse(u * .06, u * .4, 18, 0, sp.back[0][1] - u * .3), 'body', -1); add('front', ellipse(u * .06, u * .4, 18, 0, sp.back[0][1] - u * .3), 'body', -3); }
    if (b.back === 'crest') { pieces.push(pc('mane', 'Mane crest', [[0, 0], [r8(len * .6), 0], [r8(len * .6), r8(unit * .3)], [0, r8(unit * .3)]], { cut: 1, fabric: 'mane', notes: ['Long-pile faux fur (or a yarn fringe), folded along its length and set into the back seam from the crown down the neck; brushed out'], place: { view: 'back', x: 0, y: 0, z: 4 } }));
      joints.push({ name: 'Mane crest into the back seam', a: sp.len, b: len * .6, ease: [-sp.len, 0], why: 'set into the back seam: no longer than the seam' });
      // down the back of the head from the crown to the neck (the head faces left, its back toward +x)
      const hs = ctx.headAt?.side, crest = hs ? soften([[hs.x0 + hs.w * .58, hs.y0 + hs.h * .04], [hs.x0 + hs.w * .9, hs.y0 + hs.h * .4], [hs.x0 + hs.w * .98, hs.y1 + hs.h * .12]], 2) : sp.side.slice(0, Math.max(2, Math.round(sp.side.length * .55))); add('side', capsuleLine(crest, unit * .07), 'mane', 3.5); add('back', capsule(sp.back[0], [0, sp.back[0][1] + len * .3], unit * .12, unit * .08), 'mane', 4.5); }
    if (b.back === 'ruff' && ctx.headAt) { const R = ctx.headAt, rx = R.w * .78, ry = R.h * .62, ring = ellipse(rx, ry, 40, R.cx, R.cy), per = ellPer(rx, ry) * .82;
      pieces.push(pc('mane', 'Mane ruff', [[0, 0], [r8(per), 0], [r8(per), r8(unit * .38)], [0, r8(unit * .38)]], { cut: 1, fabric: 'mane', notes: ['Long-pile faux fur, the pile running away from the face: folded along its length and set into the seam round the face; brushed out'], place: { view: 'front', x: R.cx - per / 2, y: R.cy, z: 2.5 } }));
      joints.push({ name: 'Mane ruff round the face', a: ellPer(rx, ry), b: per, ease: [-ellPer(rx, ry), 0], why: 'set into the seam round the face: no longer than the seam' });
      add('front', roundOff(ring.map(([x, y], i) => { const k2 = i % 2 ? 1.12 : 1; return [R.cx + (x - R.cx) * k2, R.cy + (y - R.cy) * k2]; }), 2), 'mane', 2.5); add('back', ellipse(rx * 1.05, ry * 1.05, 36, R.cx, R.cy), 'mane', 3.2); add('side', ellipse(rx * .55, ry * 1.05, 32, R.sx + rx * .2, R.cy), 'mane', 2.5); }
  }
  // details: a belly patch, felt cheeks, felt spots
  const ex = b.extras || [];
  if (ex.includes('belly') && S.belly) { const B = S.belly, rx = (B.w || H * .3) * .5, ry = (B.h || H * .3) * .5, pt = ellipse(rx, ry, 36); pieces.push(pc('belly-patch', 'Belly patch', pt, { cut: 1, fabric: 'contrast', notes: ['Contrast: appliquéd with a satin-stitch edge (or set into the front) before the body is sewn'], place: { view: 'front', x: B.front?.[0] || 0, y: B.front?.[1] || H * .6, z: 2.4 } }));
    if (B.front) add('front', move(pt, B.front[0], B.front[1]), 'contrast', .4); if (B.side) add('side', ellipse(B.w * .5, B.h * .5, 30, B.side[0], B.side[1]), 'contrast', .4); }
  if (ex.includes('cheeks') && F.cheeks) { const r = fw * .11, c = ellipse(r, r * .7, 24); pieces.push(pc('cheek', 'Cheek', c, { cut: 2, fabric: 'felt', notes: ['Pink felt, appliquéd (or blush embroidered for under-3s)'], place: { view: 'front', x: F.cheeks[1][0], y: F.cheeks[1][1], z: 6 } })); for (const p of F.cheeks) add('front', move(c, p[0], p[1]), 'blush', 5.5); }
  if (ex.includes('spots') && S.spots) { const r = S.spots.r || H * .05, c = ellipse(r, r * .85, 24), spots = S.spots.back || S.spots.side, v = S.spots.back ? 'back' : 'side'; pieces.push(pc('spot', 'Spot', c, { cut: spots.length, fabric: 'felt', notes: ['Felt, appliquéd'], place: { view: v, x: spots[0][0], y: spots[0][1], z: 6 } })); for (const p of spots) add(v, move(c, p[0], p[1]), 'spot', 5.6); }
  return { pieces, joints, views, notes };
}
const capsuleLine = (pts, r) => { const L = pts.map((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; return [[p[0] - dy / l * r, p[1] + dx / l * r], [p[0] + dy / l * r, p[1] - dx / l * r]]; }); return [...L.map(q => q[0]), ...L.map(q => q[1]).reverse()]; };
// spikes along a line: triangles standing out from it (to the left of its run, which is up on a back drawn nose-left)
function spikesOn(line, n, h, centred = false) {
  const L = lenOf(line), out = []; let acc = 0, seg = 0; const pt = d => { while (seg < line.length - 2 && acc + dist(line[seg], line[seg + 1]) < d) { acc += dist(line[seg], line[seg + 1]); seg++; } const a = line[seg], b = line[seg + 1] || a, l = dist(a, b) || 1, t = (d - acc) / l; return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], n: centred ? [-1, 0] : [(b[1] - a[1]) / l, -(b[0] - a[0]) / l] }; };
  const st = L / n; out.push(pt(0).p); for (let i = 0; i < n; i++) { const m = pt((i + .5) * st), e = pt((i + 1) * st); out.push([m.p[0] + m.n[0] * h, m.p[1] + m.n[1] * h], e.p); }
  return out;
}

// ---- the plush, bolted together ----
// spec: { height, build } (the height its size: tall, or long for a tube or a fish) → { pieces, joints, views, lines, notes, face, opening, sockets }
// the size asked for is the toy's overall size as it stands stuffed (ears, horns and dangling legs included; a tube's or a fish's its length):
// drafted, measured as drawn, and drafted again until it comes out at that size
const madeSize = r => { const P = r.views[r.horizontal ? 'side' : 'front'].flatMap(i => i.pts); if (!P.length) return 0; const b = boxOf(P); return r.horizontal ? b.w : b.h; };
export function buildPlush(spec = {}) {
  const want = Number(spec.height) > 0 ? Number(spec.height) : 12; let H = want, r = null;
  for (let k = 0; k < 6; k++) { r = buildAt(spec, H); const got = madeSize(r); if (!got || Math.abs(got - want) < want * .005) break; H *= want / got; }
  return { ...r, height: want, drafted: H };
}
function buildAt(spec, H) {
  const b = cleanBuild(spec.build), k = b.size, B = PLUSH_LIBRARY.body[b.body];
  const horiz = Boolean(B.horizontal);
  // the head's height first (the body takes what is left of the plush's height), then the body (its neck opening), then the head drafted to it
  const hh = B.head ? (b.body === 'tube' ? H * .3 : H * (b.body === 'seated' ? .44 : .42)) * k.head : 0;
  const body = bodyOf(b.body, H, k, { h: hh });
  let head = null, S = { ...body.sockets }, headAt = null; const views = { front: [], back: [], side: [] }, lines = { front: [], back: [], side: [] }, pieces = [...body.pieces], joints = [...body.joints];
  for (const v of ['front', 'back', 'side']) { views[v].push(...body.views[v]); lines[v].push(...(body.lines[v] || [])); }
  if (B.head) {
    head = headOf(b.head, hh, body.sockets.neck.len);
    // the head sits on the neck: its neck (bottom middle) on the body's neck socket in each view
    const off = { front: [body.sockets.neck.front[0], body.sockets.neck.front[1] - head.h], back: [body.sockets.neck.back[0], body.sockets.neck.back[1] - head.h], side: [body.sockets.neck.side[0] - (b.head === 'gusset' || b.head === 'snout' ? (head.sideBox ? head.sideBox.x0 + head.sideBox.w * .62 : 0) : 0), body.sockets.neck.side[1] - head.h] };
    if (b.body === 'tube') { off.side = [body.sockets.neck.side[0] - (head.sideBox ? head.sideBox.x1 * .2 : head.w * .1), body.sockets.neck.side[1] - head.h * .9]; off.front[1] = body.sockets.neck.front[1] - head.h * .95; off.back[1] = off.front[1]; }
    if (b.body === 'seated') { off.front[1] = body.sockets.neck.front[1] - head.h * .82; off.back[1] = off.front[1]; }
    for (const v of ['front', 'back', 'side']) { const [dx, dy] = off[v]; for (const s of head.views[v]) views[v].push({ ...s, pts: move(s.pts, dx, dy), z: 3 + (s.z || 0) * .1 }); for (const l of head.lines[v] || []) lines[v].push({ ...l, pts: move(l.pts, dx, dy), z: 3 }); }
    for (const p of head.pieces) pieces.push(p); joints.push(...head.joints);
    const tr = (p, v) => [p[0] + off[v][0], p[1] + off[v][1]], HS = head.sockets;
    S.face = { front: { eyes: HS.face.front.eyes.map(p => tr(p, 'front')), nose: tr(HS.face.front.nose, 'front'), w: HS.face.front.w }, side: { eye: tr(HS.face.side.eye, 'side'), nose: tr(HS.face.side.nose, 'side') }, size: HS.face.size, cheeks: HS.face.cheeks.map(p => tr(p, 'front')), snout: HS.face.snout };
    S.ear = { front: tr(HS.ear.front, 'front'), side: tr(HS.ear.side, 'side'), span: HS.ear.span, rot: HS.ear.rot }; S.top = { front: tr(HS.top.front, 'front'), side: tr(HS.top.side, 'side'), span: HS.top.span };
    headAt = { cx: off.front[0], cy: off.front[1] + head.h * .5, w: head.w, h: head.h, sx: off.side[0] + (head.sideBox ? head.sideBox.x0 + head.sideBox.w / 2 : 0), side: boxOf(head.views.side.flatMap(i => move(i.pts, off.side[0], off.side[1]))) };
  }
  if (!headAt) { const bf = boxOf(body.views.front[0].pts); headAt = { cx: 0, cy: bf.y0 + bf.h * .4, w: bf.w * .7, h: bf.h * .7, sx: 0 }; }
  const unit = hh || (horiz ? body.height : H) * .42;
  const P = partsOf(b, S, { H: horiz ? body.height * 1.6 : H, hh: unit, k, headAt, horizontal: horiz });
  for (const v of ['front', 'back', 'side']) views[v].push(...P.views[v]); pieces.push(...P.pieces); joints.push(...P.joints);
  const notes = [...body.notes, ...P.notes];
  return { build: b, pieces, joints, views, lines, notes, face: S.face, opening: body.opening, horizontal: horiz, sockets: S };
}

// ---- a part on its own, for the picker ----
const TONES = { body: '#e9dccb', contrast: '#f6efe4', mane: '#c99b6b', horn: '#f3e2a8', wing: '#e3d3c0', beak: '#f0b44c', dark: '#3a302a', blush: '#f2c1b4', felt: '#f2c1b4', spot: '#d9c3a8' };
const pathOf = pts => 'M' + pts.map(q => `${r3(q[0])} ${r3(q[1])}`).join(' L') + ' Z';
export function partThumb(slot, id) {
  let b;
  if (slot === 'body') b = { body: id, ...(PLUSH_LIBRARY.body[id]?.head ? { head: 'ball' } : {}) };
  else if (slot === 'head') b = { body: 'torso', head: id === 'none' ? 'ball' : id };
  else b = { body: slot === 'legs' && id === 'four' ? 'seated' : (slot === 'tail' && ['fluke', 'fin'].includes(id)) || (slot === 'back' && id === 'dorsal') ? 'fish' : slot === 'back' && id === 'crest' ? 'seated' : slot === 'arms' && id === 'flipper' ? 'egg' : 'bean', ...(slot === 'back' && id === 'crest' ? { head: 'snout' } : {}), [slot]: slot === 'extras' ? [id] : id };
  let v; try { v = buildPlush({ height: 10, build: b }); } catch { return ''; }
  const view = slot === 'extras' && id === 'spots' ? 'back' : slot === 'tail' || (slot === 'back' && id !== 'ruff') || (v.horizontal && slot === 'body') ? 'side' : 'front';
  const items = v.views[view].slice().sort((a, c) => (a.z || 0) - (c.z || 0)), whole_ = slot === 'body' || slot === 'head' || id === 'none', mine = items.filter(i => whole_ || i.part);
  const bx0 = boxOf((mine.length ? mine : items).flatMap(i => i.pts)), pad = Math.max(bx0.w, bx0.h) * .14, bx = { ...bx0, x0: bx0.x0 - pad, y0: bx0.y0 - pad, w: bx0.w + 2 * pad, h: bx0.h + 2 * pad };
  const sw = r3(Math.max(bx.w, bx.h) / 60), svg = items.map(i => `<path d="${pathOf(i.pts)}" fill="${TONES[i.tone] || TONES.body}" stroke="#3a3530" stroke-width="${sw}"${whole_ || i.part ? '' : ' opacity=".35"'}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r3(bx.x0)} ${r3(bx.y0)} ${r3(bx.w)} ${r3(bx.h)}" width="56" height="56" aria-hidden="true">${svg}</svg>`;
}

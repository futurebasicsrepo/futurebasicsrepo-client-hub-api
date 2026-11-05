// Bags in the Design Lab: the kinds we design (backpacks, slings, totes, helmet bags, work bags, duffels, waist bags), their usual size and how
// each is carried and closed, the materials and hardware a bag is made from, and how a bag concept is photographed. Shared by the concept writer
// (src/lab-concepts.js), the board's views (src/lab-views.js) and the drawing in panels (src/lab-shoe-draw.js). No DOM, no Node.
// Sizes are inches (width × height × depth, the body without straps); capacity is litres.
export const BAG_TYPES = {
  rolltop: { label: 'Rolltop backpack', w: 12, h: 18, d: 6, l: 22, carry: 'two padded shoulder straps and a grab handle', closure: 'a rolled top closed by a side-release buckle or a hook strap', stage: 'night' },
  backpack: { label: 'Zip backpack', w: 12, h: 17, d: 5.5, l: 20, carry: 'two padded shoulder straps and a grab handle', closure: 'a clamshell or U-shaped two-way zip', stage: 'studio' },
  drawstring: { label: 'Top-loader backpack', w: 12, h: 17, d: 6, l: 18, carry: 'two shoulder straps', closure: 'a drawcord top under a flap', stage: 'studio' },
  sling: { label: 'Sling', w: 10, h: 6.5, d: 3, l: 3, carry: 'one adjustable strap worn across the body', closure: 'a top zip', stage: 'night' },
  tote: { label: 'Tote', w: 16, h: 14, d: 5.5, l: 18, carry: 'two handles, carried by hand or on the shoulder', closure: 'open, a magnetic snap or a top zip', stage: 'studio' },
  helmet: { label: 'Helmet bag', w: 19, h: 20, d: 5, l: 22, carry: 'two webbing handles and a detachable shoulder strap', closure: 'a full-width top zip under a flap', stage: 'still' },
  briefcase: { label: 'Work bag', w: 16, h: 11.5, d: 3.5, l: 10, carry: 'two short handles and a detachable shoulder strap', closure: 'a two-way top zip', stage: 'studio' },
  messenger: { label: 'Messenger', w: 15, h: 11, d: 4, l: 12, carry: 'one wide adjustable strap across the body', closure: 'a full flap with buckles or hook-and-loop', stage: 'still' },
  duffel: { label: 'Duffel', w: 22, h: 11, d: 11, l: 40, carry: 'two handles that wrap the body and a shoulder strap', closure: 'a long top zip', stage: 'still' },
  waist: { label: 'Waist bag', w: 11, h: 5.5, d: 2.5, l: 2, carry: 'an adjustable waist belt, also worn across the chest', closure: 'a curved top zip', stage: 'night' },
  pouch: { label: 'Shoulder pouch', w: 7.5, h: 9.5, d: 2, l: 1.5, carry: 'a thin shoulder strap worn across the body', closure: 'a top zip or a snap flap', stage: 'studio' }
};
export const BAG_BODIES = { nylon: 'Nylon twill or oxford (210–420D)', ripstop: 'Ripstop nylon', ballistic: 'Ballistic nylon (1050D)', cordura: 'Textured high-tenacity nylon (500–1000D)', laminate: 'Laminated sailcloth (waterproof, crinkled)', canvas: 'Cotton canvas (waxed or plain)', leather: 'Full-grain leather', recycled: 'Recycled polyester' };
export const BAG_CLOSURES = { zip: 'Zip', rolltop: 'Rolltop', flap: 'Flap with buckles', drawcord: 'Drawcord', snap: 'Magnetic snap', open: 'Open top' };

// how a bag is photographed (the same three sets as a shoe, src/lab-concepts.js FW_STAGES), chosen by its kind
const STAGE_WORDS = {
  studio: 'Set: a clean, warm studio. The bag stands on a seamless backdrop in a soft tone taken from its own colours, a gentle gradient behind it, soft key light from the upper left, a crisp rim light along its top edge and straps, a soft contact shadow below.',
  night: 'Set: a dark, technical studio. A deep backdrop in a dark tone of the bag\'s own colours, a strong rim light tracing the silhouette and the straps, a soft glow behind it, the bag standing on a dark floor with a soft shadow.',
  still: 'Set: an editorial still life. The bag rests on a raw surface (concrete, stone or oiled wood) against a muted backdrop, in low warm window light with long soft shadows.'
};
// → the words for the concept picture of a bag, from the concept's bag choices
export function bagShot(b = {}) {
  const t = BAG_TYPES[b.type], size = t ? `about ${b.w || t.w} × ${b.h || t.h} × ${b.d || t.d} in (${b.litres || t.l} L)` : '';
  const built = [b.body && BAG_BODIES[b.body] ? `${BAG_BODIES[b.body].toLowerCase()} body` : '', b.closure && BAG_CLOSURES[b.closure] ? `${BAG_CLOSURES[b.closure].toLowerCase()} closure` : t ? `closed by ${t.closure}` : '', t ? `carried by ${t.carry}` : ''].filter(Boolean);
  return [t ? `It is a ${t.label.toLowerCase()}, ${size}${built.length ? `: ${built.join(', ')}` : ''}.` : '',
    'A premium photoreal 3D product render, the way a bag designer presents a new design: a three-quarter view from the front, the camera slightly low, the whole bag in frame with room around it, the straps and handles arranged neatly, the bag holding its true shape with a light realistic load and a slight natural sag (not over-inflated, not empty).',
    STAGE_WORDS[t?.stage || 'studio'],
    'True proportions and real construction: clean panel lines, bound or folded edges, bartacks at the stress points, real webbing, buckles, zip pullers and their tape, real material texture (nylon weave, ripstop grid, canvas, leather grain). Sharp focus, high detail, rich but true colour.',
    'The bag only: no people, no hands, no props.'].filter(Boolean).join('\n');
}
// a bag's choices as the concept writer gives them, checked
const HEX = /^#[0-9a-f]{6}$/i, num = (v, a, z) => { const n = Number(v); return Number.isFinite(n) && n >= a && n <= z ? Math.round(n * 4) / 4 : null; };
export function cleanBag(b) {
  if (!b || typeof b !== 'object' || !BAG_TYPES[b.type]) return null;
  const c = b.colours && typeof b.colours === 'object' ? Object.fromEntries(['body', 'trim', 'webbing', 'hardware', 'lining'].filter(k => HEX.test(String(b.colours[k] || ''))).map(k => [k, String(b.colours[k]).toLowerCase()])) : {};
  const out = { type: b.type };
  for (const [k, a, z] of [['w', 3, 36], ['h', 3, 36], ['d', .5, 18], ['litres', .5, 90]]) { const v = num(b[k], a, z); if (v != null) out[k] = v; }
  if (BAG_BODIES[b.body]) out.body = b.body; if (BAG_CLOSURES[b.closure]) out.closure = b.closure;
  if (Object.keys(c).length) out.colours = c;
  return out;
}

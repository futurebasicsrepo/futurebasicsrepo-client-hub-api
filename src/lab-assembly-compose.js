// An assembly designed from the concept itself, for a product none of the starting points fit (a bike light, a drone, a kettle, a wearable):
// Claude lays out every part in the engine's own terms (its shapes, materials, processes, finishes, electronic parts and rules, so the result
// is checked and costed like any other), the engine cleans and checks it, and what the checks find wrong goes back to be fixed, twice at most.
//   composeAssembly({ concept, photo, ask, rounds }) → { spec, eng, rounds: [{ n, bad: [...] }], status: 'clear' | 'needs-work', why }
// The result is a starting assembly: the engineering review (src/lab-assembly-review.js) takes it on from there.
import sharp from 'sharp';
import { cleanAssembly, engineer, cellOf, RESINS, PROCESSES, FINISHES, FIXES, SHAPES, ELEC } from './lab-assembly.js';
// a bought-in electronic part's price: its list price, a cell's from its capacity (a pouch sized and priced as the starting points do, 18650s by the cell)
const priceOf = p => p.cost ?? (p.elec.kind === 'battery' ? cellOf(p.elec.mah || 1000).cost : p.elec.kind === 'li18650' ? Math.round(Math.max(1, (p.elec.mah || 3000) / 3000) * 170) / 100 : ELEC[p.elec.kind]?.cost);

const PART = {
  type: 'object', required: ['id', 'name', 'shape', 'size', 'at', 'resin', 'process'],
  properties: {
    id: { type: 'string', description: 'short, lowercase letters, digits and dashes, unique' }, name: { type: 'string' },
    shape: { type: 'string', enum: Object.keys(SHAPES) }, axis: { type: 'string', enum: ['x', 'y', 'z'], description: 'the axis a part is extruded along (a cylinder\'s length, a shell\'s depth); z by default' },
    size: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'its box in world x, y, z, mm' }, at: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'the centre of its box, mm; z = 0 is the bottom of the product' },
    wall: { type: 'number', description: 'mm, for a shell, cup or ring' }, open: { type: 'string', enum: ['+', '-'], description: 'which end of a shell or cup is open along its axis' }, r: { type: 'number', description: 'corner radius, mm' },
    resin: { type: 'string', enum: Object.keys(RESINS) }, process: { type: 'string', enum: Object.keys(PROCESSES) }, finish: { type: 'string', enum: FINISHES }, colour: { type: 'string', description: '#rrggbb' },
    draft: { type: 'number' }, undercuts: { type: 'integer' }, qty: { type: 'integer' }, fix: { type: 'string', enum: Object.keys(FIXES) }, fixQty: { type: 'integer' },
    parent: { type: 'string', description: 'the id of the part it sits inside or on, if any' }, order: { type: 'integer', description: 'assembly order, 1 first' },
    dir: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: 'the direction it comes away in the exploded view, a unit vector' }, lvl: { type: 'number', description: 'how far it comes away, 0 to 6' },
    elec: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: Object.keys(ELEC) }, mah: { type: 'integer' } }, description: 'for an electronic part: its kind (resin and process are then "bought in")' },
    cost: { type: 'number', description: 'unit cost in $, for a bought-in part that is not electronic' }
  }
};
export const COMPOSE_SCHEMA = {
  type: 'object', required: ['product', 'kind', 'parts', 'why'],
  properties: {
    product: { type: 'boolean', description: 'false when the concept is not a physical product that is made of parts' },
    kind: { type: 'string', enum: ['electronics', 'goods'] }, age: { type: 'string', enum: ['0+', '3+', '8+', '14+'] },
    parts: { type: 'array', items: PART, minItems: 1, maxItems: 40 },
    why: { type: 'string', description: 'two sentences: the architecture chosen and why' }
  }
};
export const COMPOSE_SYSTEM = `You are a senior product design engineer laying out a new product for injection moulding, die casting, stamping or machining and assembly, as the first engineering of a concept. Lay out every part a real product of this kind is made of: housings and covers, the parts that do the work, fasteners, seals, feet, windows, buttons and knobs, and for an electronic product the board and every electronic part on and off it (the battery or supply, the main chip, the radio, ports, sensors, drivers, lights, controls).
Rules the engine checks:
- Millimetres. z is up; z = 0 is the bottom of the product. size is the part's box in world x, y, z; at is the centre of that box.
- A shell (a housing open on one side) or a cup (a round one) has a wall and an open end along its axis ('+' or '-'); two halves meet at a parting line. A ring is a tube open both ends. A pcb is a circuit board (1–1.6 mm thick). Round parts (cyl, cup, ring) are round across their axis.
- A part with a parent sits inside the parent's inner space with at least 0.5 mm all round (a housing and the half that closes it count as one space). No two solid parts may take the same space. Electronic parts on a board sit on its surface with the board as parent. Sockets (USB-C, jacks, DC input, mains) reach the outside wall.
- Walls the moulder can fill: about 1–3.5 mm for PC/ABS and ABS, 0.8–3 mm PP, 1–2.5 mm die-cast zinc or aluminium; 1° of draft or more (3° for a texture); clear parts need a polish.
- Each part comes away in the exploded view along dir by lvl; give housings 0 or small, what is inside more, covers most.
Use only the shapes, materials, processes, finishes and electronic kinds given. Prefer fewer, well-made parts; do not invent electronics the product does not need.`;

const imageBlock = buf => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: buf.toString('base64') } });
const bads = E => E.checks.filter(c => c.level === 'bad');
export async function composeAssembly({ concept = {}, photo = null, ask, rounds = 2 } = {}) {
  const words = [concept.name && `"${String(concept.name).slice(0, 80)}"`, concept.category && `category ${concept.category}`, concept.description && String(concept.description).slice(0, 800), concept.twist && `what is ours: ${String(concept.twist).slice(0, 300)}`, concept.size && `size: ${concept.size}`].filter(Boolean).join('; ');
  const pic = photo ? await sharp(photo).flatten({ background: '#ffffff' }).resize({ width: 1000, height: 1000, fit: 'inside' }).jpeg({ quality: 82 }).toBuffer() : null;
  const intro = [{ type: 'text', text: `The concept: ${words || 'no words given'}.` }, ...(pic ? [{ type: 'text', text: 'Its picture:' }, imageBlock(pic)] : [])];
  let res = await ask(COMPOSE_SYSTEM, [...intro, { type: 'text', text: 'Lay out its parts.' }], COMPOSE_SCHEMA);
  if (!res || res.product === false) return { status: 'not-a-product', why: String(res?.why || 'The concept is not a product made of parts').slice(0, 300) };
  const specOf = r => cleanAssembly({ arch: 'custom', kind: r.kind === 'electronics' ? 'electronics' : 'goods', age: r.age, name: concept.name, parts: (r.parts || []).map(p => (p.elec && ELEC[p.elec.kind] ? { ...p, resin: 'bought in', process: 'bought in', cost: priceOf(p) } : p)) });
  let spec = specOf(res), E = engineer(spec); const log = [{ n: 1, parts: spec.parts.length, bad: bads(E).map(c => c.text) }];
  for (let n = 2; n <= rounds + 1 && bads(E).length; n++) {
    const fixed = await ask(COMPOSE_SYSTEM, [...intro, { type: 'text', text: `Your layout:\n${JSON.stringify(spec.parts.map(({ id, name, shape, axis, size, at, wall, open, r, resin, process, finish, draft, undercuts, qty, fix, parent, dir, lvl, elec }) => ({ id, name, shape, axis, size, at, wall, open, r, resin, process, finish, draft, undercuts, qty, fix, parent, dir, lvl, elec })))}\n\nThe engine found these problems:\n${bads(E).map(c => `- ${c.text}`).join('\n')}\n\nGive the whole layout again with them fixed; keep everything else as it was.` }], COMPOSE_SCHEMA);
    if (!fixed?.parts?.length) break;
    const next = specOf(fixed), En = engineer(next); if (bads(En).length > bads(E).length) break; // a repair that makes it worse is not taken
    spec = next; E = En; res = fixed; log.push({ n, parts: spec.parts.length, bad: bads(E).map(c => c.text) });
  }
  return { status: bads(E).length ? 'needs-work' : 'clear', spec, eng: E, rounds: log, why: String(res.why || '').slice(0, 400) };
}

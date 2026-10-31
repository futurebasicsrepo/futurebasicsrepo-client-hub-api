// How good the engineering is, measured: a dozen real kinds of product, each with what is known about it (its size, the parts it cannot do
// without, how many parts, what it costs to make and to tool), designed from its words alone (src/lab-assembly-compose.js), then reviewed
// (src/lab-assembly-review.js), and scored against what is known, before and after the review. It answers whether a review's 90 means a
// product a factory would recognise, and where the engine is weakest.
//   REFERENCE                                  → the products and what is known about each
//   scoreAgainst(E, ref)                       → { score (0–100), parts: { size, must, checks, count, unit, tool } (each 0–1), missing, size, notes }
//   runBenchmark({ ask, judges, only, onItem }) → { items: [{ id, name, compose, before, after, review }], summary }
// The figures are reference ranges, not one product's: sizes from the makers' published dimensions for the common products of each kind,
// part counts from public teardowns, costs to make at 5,000 a year (bill of materials, moulding and assembly, before margin) and tooling
// estimated for that class of product. Ranges are wide on purpose; as factory quotes arrive (src/lab-cost-calibration.js) they narrow.
import { engineer, ELEC } from './lab-assembly.js';
import { composeAssembly } from './lab-assembly-compose.js';
import { reviewAssembly } from './lab-assembly-review.js';

// must: what the product cannot do without, each as electronic kinds (any of) or a part whose name matches
const E_ = (label, ...kinds) => ({ label, kinds }), N_ = (label, re) => ({ label, re });
export const REFERENCE = [
  { id: 'powerbank', name: 'Pocket power bank', category: 'electronics', description: 'A 10,000 mAh pocket power bank for phones: one USB-C in and out, one USB-A out, four LEDs for the charge left, a button to check it. Plastic shell.',
    size: [92, 60, 22], must: [E_('Battery', 'li18650', 'battery'), E_('USB-C port', 'usbc'), E_('Charge and protection', 'pbms', 'charger'), E_('Charge LEDs', 'led'), E_('Button', 'button')], count: [8, 18], unit: [6, 12], tool: [15000, 45000] },
  { id: 'speaker', name: 'Waterproof Bluetooth speaker', category: 'electronics', description: 'A portable Bluetooth speaker, waterproof (IPX7), cylindrical, that lies on its side: one full-range driver and two passive radiators, about 12 hours of play, charges over USB-C, rubber end caps, fabric or perforated grille.',
    size: [181, 69, 74], must: [E_('Bluetooth', 'ble', 'wifi'), E_('Amplifier', 'amp', 'amp2'), E_('Driver', 'speaker', 'woofer'), E_('Battery', 'battery', 'li18650'), E_('USB-C port', 'usbc'), E_('Buttons', 'button'), E_('Charging', 'charger', 'pbms'), N_('Seal or gasket', /seal|gasket|o-?ring|cap/i)], count: [18, 45], unit: [15, 32], tool: [40000, 130000] },
  { id: 'bikelight', name: 'Rear bike light', category: 'electronics', description: 'A USB-rechargeable rear bike light: a bright red LED behind a clear red lens, one button for the modes, a rubber strap mount for the seat post, rain-proof.',
    size: [60, 30, 25], must: [E_('LED', 'led', 'ledcob'), E_('Battery', 'battery', 'li18650'), E_('USB-C port', 'usbc'), E_('Button', 'button'), E_('Charging', 'charger', 'pbms'), N_('Lens', /lens|window|diffuser/i), N_('Strap or mount', /strap|mount|clip|band/i)], count: [6, 16], unit: [2.5, 7], tool: [8000, 30000] },
  { id: 'mouse', name: 'Wireless mouse', category: 'electronics', description: 'A compact wireless mouse with a USB receiver: left and right buttons, a scroll wheel, an optical sensor, runs a year on one AA battery, on/off switch underneath.',
    size: [99, 60, 39], must: [E_('Radio', 'ble', 'wifi'), E_('Buttons', 'button'), E_('Scroll wheel', 'encoder'), E_('Battery', 'aa', 'battery'), N_('Optical sensor', /sensor|optical|lens/i)], count: [12, 28], unit: [3, 8], tool: [25000, 70000] },
  { id: 'smartplug', name: 'Wi-Fi smart plug', category: 'electronics', description: 'A US Wi-Fi smart plug: plugs into the wall, one socket on its face, switches a lamp or appliance up to 15 A with a relay, an app controls it, one button and a status LED. Flame-retardant plastic.',
    size: [51, 38, 33], must: [E_('Wi-Fi', 'wifi'), E_('Mains power supply', 'psu'), E_('Button', 'button'), E_('LED', 'led'), N_('Relay', /relay/i), N_('Plug pins and socket', /pin|prong|blade|socket|contact/i)], count: [10, 22], unit: [3, 8], tool: [20000, 60000] },
  { id: 'scale', name: 'Kitchen scale', category: 'electronics', description: 'A digital kitchen scale up to 5 kg in 1 g steps: a flat tempered-glass top, an LCD, tare and unit touch buttons, four load cells in the feet, two AAA batteries.',
    size: [200, 150, 20], must: [E_('Display', 'lcd', 'oled'), E_('Buttons', 'button', 'touch'), E_('Battery', 'aa', 'battery'), E_('Microcontroller', 'mcu', 'ble', 'wifi'), N_('Load cells', /load ?cell|strain|sensor/i), N_('Top plate', /top|plate|glass|platform/i)], count: [10, 22], unit: [3, 8], tool: [15000, 50000] },
  { id: 'fan', name: 'Handheld fan', category: 'electronics', description: 'A handheld USB-rechargeable fan: a five-blade fan in a round guard on a handle, three speeds on one button, runs four to eight hours, folds flat to stand on a desk.',
    size: [100, 45, 220], must: [E_('Motor', 'motor'), E_('Battery', 'li18650', 'battery'), E_('USB-C port', 'usbc'), E_('Button', 'button'), E_('Charging', 'charger', 'pbms'), N_('Fan blades', /blade|fan|impeller|rotor/i), N_('Guard', /guard|grille|cage/i)], count: [10, 22], unit: [3, 7], tool: [15000, 45000] },
  { id: 'desklamp', name: 'LED desk lamp', category: 'electronics', description: 'An LED desk lamp with a weighted round base, a jointed arm and a flat head, touch dimming in three steps, powered from a wall adapter.',
    size: [160, 160, 400], must: [E_('LEDs', 'ledcob', 'led'), E_('LED driver', 'leddrv', 'reg'), E_('Power in', 'dcjack', 'usbc', 'psu'), E_('Control', 'touch', 'button', 'pot'), N_('Arm or stem', /arm|stem|pole|neck/i), N_('Base', /base/i)], count: [10, 26], unit: [6, 15], tool: [20000, 70000] },
  { id: 'toothbrush', name: 'Sonic toothbrush', category: 'electronics', description: 'A rechargeable sonic toothbrush: a slim waterproof handle, a vibrating motor, one button, two minutes timer, charges on an inductive stand, a replaceable brush head.',
    size: [28, 28, 190], must: [E_('Motor', 'motor'), E_('Battery', 'battery', 'li18650', 'aa'), E_('Button', 'button'), E_('Charging', 'charger', 'pbms'), N_('Seal', /seal|gasket|o-?ring|overmould/i), N_('Brush head', /head|brush/i)], count: [8, 20], unit: [5, 12], tool: [25000, 70000] },
  { id: 'tag', name: 'Bluetooth item tracker', category: 'electronics', description: 'A small Bluetooth item tracker for keys: a square tag with a hole for a key ring, a buzzer to find it, one button, a replaceable CR2032 coin cell.',
    size: [38, 38, 7], must: [E_('Bluetooth', 'ble'), E_('Battery', 'battery'), E_('Button', 'button'), E_('Buzzer', 'speaker', 'amp'), N_('Key ring hole or loop', /ring|loop|hole|lanyard/i)], count: [5, 12], unit: [2, 5], tool: [12000, 35000] },
  { id: 'bottle', name: 'Insulated water bottle', category: 'goods', description: 'A 750 ml double-walled vacuum-insulated stainless steel water bottle with a screw lid that has a carry loop and a silicone seal.',
    size: [75, 75, 260], must: [N_('Bottle body', /body|bottle|vessel|wall/i), N_('Lid', /lid|cap/i), N_('Seal', /seal|gasket|o-?ring/i)], count: [3, 8], unit: [3, 8], tool: [10000, 40000] },
  { id: 'phonestand', name: 'Adjustable phone stand', category: 'goods', description: 'An adjustable desk stand for a phone or small tablet: a weighted aluminium base, a two-hinge arm and a cradle with silicone pads so the phone does not slip or scratch.',
    size: [90, 110, 150], must: [N_('Base', /base/i), N_('Arm', /arm|stem/i), N_('Hinge', /hinge|joint|pivot/i), N_('Cradle', /cradle|holder|rest|support/i), N_('Pads', /pad|grip/i)], count: [5, 14], unit: [3, 9], tool: [8000, 35000] }
];

const r2 = v => Math.round(v * 100) / 100;
// the assembly's overall size: the box round every part, sorted, so a product turned on its side still matches
function boxOf(spec) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of spec.parts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.at[k] - p.size[k] / 2); hi[k] = Math.max(hi[k], p.at[k] + p.size[k] / 2); }
  return lo.map((v, k) => Math.round(hi[k] - v));
}
// in range: 1; outside, falling to 0 at twice (or half) the edge, on a log scale
const near = (v, [a, b]) => (v >= a && v <= b) ? 1 : Math.max(0, 1 - Math.abs(Math.log(v < a ? v / a : v / b)) / Math.LN2);
export function scoreAgainst(E, ref) {
  const s = E.spec, box = boxOf(s).sort((a, b) => a - b), want = [...ref.size].sort((a, b) => a - b);
  const size = box.reduce((t, v, k) => t + near(v, [want[k] * .75, want[k] * 1.3]), 0) / 3;
  const has = m => m.kinds ? s.parts.some(p => p.elec && m.kinds.includes(p.elec.kind)) : s.parts.some(p => m.re.test(`${p.name} ${p.id}`));
  const missing = ref.must.filter(m => !has(m)).map(m => m.label), must = 1 - missing.length / ref.must.length;
  const bad = E.checks.filter(c => c.level === 'bad').length, checks = Math.max(0, 1 - bad / 3);
  const n = s.parts.reduce((t, p) => t + (p.qty || 1), 0), count = near(n, ref.count), unit = near(E.unit, ref.unit), tool = near(E.toolCost || 1, ref.tool);
  const parts = { size: r2(size), must: r2(must), checks: r2(checks), count: r2(count), unit: r2(unit), tool: r2(tool) };
  const score = Math.round(100 * (.2 * size + .25 * must + .15 * checks + .1 * count + .2 * unit + .1 * tool));
  return { score, parts, missing, size: box, partCount: n, unit: E.unit, toolCost: E.toolCost, bad };
}

export async function runBenchmark({ ask, judges = [], only = null, onItem = () => {} } = {}) {
  const items = [];
  for (const ref of REFERENCE.filter(r => !only || only.includes(r.id))) {
    const concept = { name: ref.name, category: ref.category, description: ref.description }, t0 = Date.now(), item = { id: ref.id, name: ref.name, want: { size: ref.size, count: ref.count, unit: ref.unit, tool: ref.tool } };
    try {
      const c = await composeAssembly({ concept, ask });
      if (c.status === 'not-a-product') { item.error = c.why; items.push(item); onItem(item); continue; }
      item.compose = { status: c.status, rounds: c.rounds.length, why: c.why }; item.before = scoreAgainst(c.eng, ref);
      const r = await reviewAssembly({ spec: c.spec, concept, judges });
      item.review = { status: r.status, score: r.score, rounds: r.rounds?.length || 0, changes: r.changes?.length || 0, rejected: r.rejected?.length || 0, beyond: (r.beyondModel || []).slice(0, 6) };
      item.after = scoreAgainst(engineer(r.spec), ref);
    } catch (e) { item.error = String(e.message || e).slice(0, 200); }
    item.secs = Math.round((Date.now() - t0) / 1000); items.push(item); onItem(item);
  }
  return { items, summary: summaryOf(items) };
}
// across the products: the average score before and after the review, each part of it, and whether the review's verdict agrees with it
export function summaryOf(items) {
  const ok = items.filter(i => i.after), avg = xs => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null, avgf = xs => xs.length ? r2(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
  const parts = Object.fromEntries(['size', 'must', 'checks', 'count', 'unit', 'tool'].map(k => [k, avgf(ok.map(i => i.after.parts[k]))]));
  const passed = ok.filter(i => i.review?.score >= 90), agree = ok.filter(i => (i.review?.score >= 90) === (i.after.score >= 80)).length;
  const missing = {}; ok.forEach(i => i.after.missing.forEach(m => { missing[m] = (missing[m] || 0) + 1; }));
  return { products: items.length, done: ok.length, failed: items.length - ok.length, before: avg(ok.map(i => i.before.score)), after: avg(ok.map(i => i.after.score)), parts,
    reviewPassed: passed.length, passedButWeak: passed.filter(i => i.after.score < 80).map(i => i.name), agreement: ok.length ? r2(agree / ok.length) : null,
    weakest: Object.entries(parts).filter(([, v]) => v != null).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([k]) => k), oftenMissing: Object.entries(missing).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} (${n})`) };
}
export const KNOWN_KINDS = Object.keys(ELEC);

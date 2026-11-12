// Design Lab engineering for hard goods, toys, home objects and electronics: the product as an assembly of real 3D parts, each with its
// material, process and finish, and the industrial engineering read from them. Shared by the service (src/lab-assembly-routes.js) and the
// page (src/lab-engineer.html, served at /lab/lab-assembly.js), so the screen, the drawing and the files always agree.
//   - parts: a box, a shell (a housing open on one side), a cylinder, a cup (a round shell), a ring, a ball or a circuit board; sizes in mm,
//     placed by the centre of their box, extruded along x, y or z; every part has an explode direction and level for the exploded view
//   - archetypes: a starting assembly drawn to the product's size (a round speaker, a handheld, a desk device; a tumbler, a case, a figure)
//   - moulding: wall, draft, undercuts (side actions), clear parts, size; mass, cycle, part cost; the tool (steel, cavities, cost, weeks)
//   - fit: each part inside its parent with clearance, no two solid parts in the same space, small parts for young children, food contact
//   - electronics: the parts on the board, the block diagram, the power budget (run time, standby, charge), the board's fit and cost,
//     the radio's keep-out, the heat, and the certifications (src/elec.js)
//   - out: triangle meshes (the page's viewer, STL), an exploded isometric drawing with balloons and the parts list, the BOM as rows
const hund = v => Math.round(v / 100) * 100, tens = v => Math.round(v / 10) * 10;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r0 = v => Math.round(v);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : d; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- materials and processes ------------------------------------------------------------------------------------------------------------------
// density g/cm³, price $/kg, the wall a moulder can fill (mm), shrink %, clamp tonnes per cm² of projected area, a colour to draw it in, food-safe
export const RESINS = {
  'ABS': { rho: 1.05, kg: 2.6, wall: [1.1, 3.6], shrink: .5, clamp: .35, col: '#d9d6cf' },
  'PC': { rho: 1.2, kg: 3.8, wall: [1, 4], shrink: .6, clamp: .45, col: '#cfd6dc' },
  'PC/ABS': { rho: 1.15, kg: 3.4, wall: [1, 3.5], shrink: .5, clamp: .4, col: '#c9c9c4' },
  'PP': { rho: .9, kg: 1.6, wall: [.8, 3.8], shrink: 1.5, clamp: .25, col: '#eceae4', food: true },
  'HIPS': { rho: 1.04, kg: 2, wall: [1, 3.5], shrink: .5, clamp: .3, col: '#e6e3dc' },
  'PA66 GF30': { rho: 1.37, kg: 4.5, wall: [.8, 3], shrink: .4, clamp: .5, col: '#3a3a3a' },
  'POM (acetal)': { rho: 1.41, kg: 3.2, wall: [.8, 3], shrink: 2, clamp: .45, col: '#f2f0ea' },
  'TPU': { rho: 1.2, kg: 5, wall: [.5, 3], shrink: 1, clamp: .3, col: '#2f3133' },
  'TPE': { rho: .95, kg: 4.5, wall: [.5, 3], shrink: 1.5, clamp: .25, col: '#333536' },
  'silicone (LSR)': { rho: 1.12, kg: 9, wall: [.3, 4], shrink: 2.5, clamp: .2, col: '#5b5e60', food: true },
  'PMMA (acrylic)': { rho: 1.18, kg: 3, wall: [.6, 3.8], shrink: .4, clamp: .4, col: '#e8f4f8', clear: true },
  'PC clear': { rho: 1.2, kg: 4.2, wall: [1, 4], shrink: .6, clamp: .45, col: '#e4f0f6', clear: true },
  'Tritan': { rho: 1.18, kg: 6, wall: [.8, 3.5], shrink: .6, clamp: .4, col: '#eef6f7', clear: true, food: true },
  'PETG': { rho: 1.27, kg: 2.8, wall: [.8, 3.5], shrink: .4, clamp: .35, col: '#e9f3f3', clear: true, food: true },
  'soft PVC (vinyl)': { rho: 1.3, kg: 2.2, wall: [1, 4], shrink: 1, clamp: .3, col: '#e7d9c8' },
  'EVA foam': { rho: .2, kg: 3, wall: [2, 60], shrink: 0, clamp: 0, col: '#2c2d30' },
  'aluminium 6061': { rho: 2.7, kg: 6, wall: [.8, 20], shrink: 0, clamp: 0, col: '#b9bcc0', metal: true },
  'stainless 304': { rho: 7.9, kg: 4, wall: [.4, 20], shrink: 0, clamp: 0, col: '#aeb2b6', metal: true, food: true },
  'zinc (Zamak 3)': { rho: 6.6, kg: 3.5, wall: [.8, 6], shrink: .7, clamp: .7, col: '#a7aaad', metal: true },
  'FR-4': { rho: 1.85, kg: 0, wall: [.4, 3.2], shrink: 0, clamp: 0, col: '#1f5c3a' },
  'steel SPCC': { rho: 7.85, kg: 1.1, wall: [.5, 3], shrink: 0, clamp: 0, col: '#36383b', metal: true },
  'MDF': { rho: .75, kg: 1.2, wall: [9, 25], shrink: 0, clamp: 0, col: '#b89a74' },
  'bought in': { rho: 1.5, kg: 0, wall: [0, 99], shrink: 0, clamp: 0, col: '#55585c' }
};
// how a part is made: does it need a tool, and what the tool is
export const PROCESSES = {
  'injection moulding': { tool: 'mould' }, 'overmoulding': { tool: 'mould', k: 1.6 }, 'LSR moulding': { tool: 'mould', k: 1.3 },
  'rotocasting': { tool: 'roto' }, 'blow moulding': { tool: 'blow' }, 'die casting': { tool: 'die' }, 'stamping': { tool: 'stamp' },
  'CNC machined': { tool: null }, 'CNC routed': { tool: null }, '3D printed': { tool: null }, 'die cut': { tool: 'rule' }, 'PCB fab and SMT': { tool: null }, 'bought in': { tool: null }
};
export const FINISHES = ['SPI A-2 (high gloss)', 'SPI B-1 (semi-gloss)', 'SPI C-1 (matte)', 'SPI D-2 (textured)', 'MT-11010 (fine texture)', 'soft-touch paint', 'spray paint', 'pad print', 'anodised', 'brushed', 'none'];
const TEXTURED = /SPI D|MT-|texture/i;
export const FIXES = { screws: { verb: 'Screw', s: 5 }, snap: { verb: 'Snap', s: 3 }, press: { verb: 'Press', s: 3 }, glue: { verb: 'Glue', s: 12 }, weld: { verb: 'Ultrasonic-weld', s: 6 }, adhesive: { verb: 'Stick', s: 4 }, solder: { verb: 'Solder', s: 8 }, place: { verb: 'Place', s: 3 }, thread: { verb: 'Screw on', s: 4 }, 'moulded in': { verb: 'Moulded in with', s: 0 } };
export const SHAPES = { box: 'Box', shell: 'Shell (a housing, open one side)', cyl: 'Cylinder', cup: 'Cup (a round shell)', ring: 'Ring', ball: 'Ball', pcb: 'Circuit board' };
// small-parts test cylinder (16 CFR 1501, EN 71-1): anything that fits inside it is a choking hazard for under-3s
const SMALL = { d: 31.7, h: 57.1 };

// ---- electronics: the parts on the board --------------------------------------------------------------------------------------------------------
// mA when working, µA asleep, the share of time it works, $ each, size (mm), the bus it talks on
export const ELEC = {
  'ble': { name: 'Bluetooth LE module (nRF52840)', ma: 6, ua: 3, duty: .2, cost: 4.2, size: [10, 15, 2], bus: 'core', radio: 'Bluetooth LE 5.3' },
  'wifi': { name: 'Wi-Fi + BLE module (ESP32-S3)', ma: 90, ua: 240, duty: .25, cost: 3.1, size: [18, 25.5, 3.1], bus: 'core', radio: 'Wi-Fi 2.4 GHz, Bluetooth LE' },
  'mcu': { name: 'Microcontroller (STM32G0)', ma: 5, ua: 1, duty: .3, cost: .9, size: [7, 7, 1], bus: 'core', radio: '' },
  'charger': { name: 'Li-ion charger (BQ25180)', ma: .3, ua: 1, duty: 1, cost: .9, size: [3, 3, 1], bus: 'power' },
  'reg': { name: '3.3 V regulator', ma: .05, ua: 1, duty: 1, cost: .2, size: [3, 3, 1], bus: 'power' },
  'usbc': { name: 'USB-C receptacle', ma: 0, ua: 0, duty: 0, cost: .35, size: [9, 7.5, 3.2], bus: 'power' },
  'led': { name: 'LED (RGB)', ma: 5, ua: 0, duty: .3, cost: .06, size: [2, 2, .6], bus: 'GPIO / PWM' },
  'button': { name: 'Tact switch', ma: 0, ua: 0, duty: 0, cost: .05, size: [6, 6, 3.5], bus: 'GPIO' },
  'amp': { name: 'Class-D amplifier (MAX98357)', ma: 4, ua: 1, duty: .5, cost: .8, size: [3, 3, .8], bus: 'I2S' },
  'speaker': { name: 'Speaker driver, 40 mm 3 W', ma: 180, ua: 0, duty: .5, cost: 1.3, size: [40, 40, 14], bus: 'amp', round: true },
  'mic': { name: 'MEMS microphone', ma: .8, ua: 0, duty: .5, cost: .45, size: [3.5, 2.7, 1], bus: 'PDM' },
  'imu': { name: 'Motion sensor (IMU)', ma: .6, ua: 3, duty: 1, cost: .9, size: [3, 2.5, .8], bus: 'I2C' },
  'env': { name: 'Temperature and humidity sensor', ma: .1, ua: .1, duty: .05, cost: .7, size: [2.5, 2.5, .9], bus: 'I2C' },
  'oled': { name: 'OLED display, 1.3 in', ma: 20, ua: 5, duty: .3, cost: 3.5, size: [35, 33, 1.5], bus: 'SPI' },
  'lcd': { name: 'IPS LCD, 2.4 in, with backlight', ma: 60, ua: 10, duty: .4, cost: 4.8, size: [42, 60, 2.6], bus: 'SPI' },
  'motor': { name: 'Vibration motor', ma: 80, ua: 0, duty: .02, cost: .4, size: [10, 10, 3], bus: 'PWM', round: true },
  'battery': { name: 'Li-ion pouch cell, 3.7 V', ma: 0, ua: 0, duty: 0, cost: 0, size: [34, 50, 6], bus: 'power' },
  // audio and hi-fi: the mechanisms, the signal chain, the drivers, mains power and the sockets on the back. `v` is the rail a part draws from
  // (3.7 V, the cell, when not given), so a 12 V amplifier and a 5 V CD loader are counted in watts, not as if they ran on the cell
  'cdmech': { name: 'CD loader (tray, laser pickup, spindle)', ma: 450, ua: 0, duty: .7, cost: 9.5, size: [150, 140, 32], bus: 'servo + I2S', v: 5, laser: true },
  'tapemech': { name: 'Cassette transport (motor, capstan, heads)', ma: 150, ua: 0, duty: 1, cost: 6.5, size: [96, 16, 64], bus: 'motor', v: 3 },
  'dac': { name: 'Audio DAC (PCM5102A)', ma: 20, ua: 5, duty: 1, cost: 1.4, size: [5, 6.5, 1.2], bus: 'I2S', v: 3.3 },
  'preamp': { name: 'Tape head preamp', ma: 8, ua: 0, duty: 1, cost: .45, size: [5, 4, 1.5], bus: 'analog', v: 3 },
  'hpamp': { name: 'Headphone amplifier', ma: 12, ua: 0, duty: 1, cost: .6, size: [3, 3, 1], bus: 'analog', v: 3 },
  'amp2': { name: 'Stereo class-D amplifier, 2 × 20 W (TPA3116)', ma: 1500, ua: 10, duty: .35, cost: 2.6, size: [30, 22, 16], bus: 'I2S', v: 12 },
  'woofer': { name: 'Woofer, 5.25 in', ma: 0, ua: 0, duty: 0, cost: 7.5, size: [130, 70, 130], bus: 'amp', round: true },
  'tweeter': { name: 'Tweeter, 1 in silk dome', ma: 0, ua: 0, duty: 0, cost: 3.2, size: [80, 40, 80], bus: 'amp', round: true },
  'psu': { name: 'AC-DC power supply, 100–240 V in, 12 V 36 W', ma: 0, ua: 0, duty: 0, cost: 5.5, size: [100, 60, 30], bus: 'power', mains: true },
  'iec': { name: 'IEC C8 mains inlet', ma: 0, ua: 0, duty: 0, cost: .45, size: [28, 20, 22], bus: 'power', port: true },
  'rca': { name: 'RCA jacks, stereo pair', ma: 0, ua: 0, duty: 0, cost: .4, size: [30, 14, 14], bus: 'line', port: true },
  'jack': { name: '3.5 mm headphone jack', ma: 0, ua: 0, duty: 0, cost: .15, size: [8, 8, 14], bus: 'analog out', port: true },
  'encoder': { name: 'Rotary encoder with push', ma: 0, ua: 0, duty: 0, cost: .45, size: [12, 20, 12], bus: 'GPIO' },
  'pot': { name: 'Volume wheel (potentiometer)', ma: 0, ua: 0, duty: 0, cost: .3, size: [6, 6, 16], bus: 'analog' },
  'ir': { name: 'IR remote receiver', ma: .4, ua: 350, duty: 1, cost: .25, size: [6, 6, 7], bus: 'GPIO', v: 3.3 },
  'vfd': { name: 'VFD display, 16 characters', ma: 80, ua: 0, duty: .9, cost: 6.5, size: [110, 26, 6], bus: 'SPI', v: 5 },
  'antenna': { name: 'External antenna, 2.4 GHz (on the back)', ma: 0, ua: 0, duty: 0, cost: 1.2, size: [10, 22, 10], bus: 'RF', port: true, round: true },
  // turntables, headphones, smart speakers, power banks and lamps
  'ttmotor': { name: 'Turntable motor, 12 V DC with speed control (belt drive)', ma: 110, ua: 0, duty: .8, cost: 4.8, size: [32, 32, 26], bus: 'PWM', v: 12, round: true },
  'cartridge': { name: 'Moving-magnet cartridge with stylus', ma: 0, ua: 0, duty: 0, cost: 6.5, size: [17, 26, 17], bus: 'phono' },
  'phono': { name: 'Phono preamp, RIAA (OPA1612)', ma: 6, ua: 0, duty: 1, cost: 1.9, size: [5, 6, 1.5], bus: 'analog', v: 12 },
  'dcjack': { name: 'DC barrel jack, 5.5 × 2.1 mm', ma: 0, ua: 0, duty: 0, cost: .25, size: [9, 14, 11], bus: 'power', port: true },
  'hpdriver': { name: 'Headphone driver, 40 mm dynamic', ma: 0, ua: 0, duty: 0, cost: 1.9, size: [40, 40, 11], bus: 'amp', round: true },
  // a power bank's controller carries its output: 20 W PD at 9 V, counted at half load, so the run time is how long the bank lasts in use;
  // out: that power leaves through the cable, so only the converter's loss (a tenth) warms the product
  'pbms': { name: 'Power bank controller and its output, PD 20 W (IP5328P)', ma: 2200, ua: 30, duty: .5, cost: 1.1, size: [5, 5, 1], bus: 'power', v: 9, out: true },
  'li18650': { name: 'Li-ion cells, 18650, 3,000 mAh each', ma: 0, ua: 0, duty: 0, cost: 0, size: [18, 65, 18], bus: 'power', round: true },
  'ledcob': { name: 'LED module, 6 W COB on an aluminium board', ma: 520, ua: 0, duty: .6, cost: 1.4, size: [28, 28, 3], bus: 'LED driver' },
  'leddrv': { name: 'LED driver, constant current, dimmable', ma: 2, ua: 20, duty: 1, cost: .55, size: [4, 4, 1], bus: 'PWM' },
  'touch': { name: 'Capacitive touch controller with its pad', ma: .2, ua: 3, duty: 1, cost: .3, size: [3, 3, 1], bus: 'GPIO' },
  'aa': { name: 'Battery holder, 2 × AA (replaceable)', ma: 0, ua: 0, duty: 0, cost: .35, size: [29, 14.5, 50], bus: 'power' }
};
// the cells a product runs from: a Li-ion pouch (3.7 V) or two AA cells (3 V, 2,500 mAh alkaline)
const CELLS = { battery: { v: 3.7 }, aa: { v: 3 }, li18650: { v: 3.7 } };
// a pouch cell's size and price from its capacity (about 500 Wh/L packed, 5 mm thick until it gets large)
export function cellOf(mah) {
  const m = num(mah, 50, 20000, 1000), vol = m * 3.7 / 500 * 1e6 / 1000, t = m > 3000 ? 8 : m > 1200 ? 6 : 5, a = vol / t, w = Math.sqrt(a * .62), l = a / w;
  return { size: [r1(w), r1(l), t], cost: r2(.9 + m * .0012), wh: r2(m * 3.7 / 1000) };
}

// the largest cell (in 50 mAh steps) that fits a space; a capacity the designer asked for is kept, and the fit check says if it does not fit
export function fitCell(mah, [w, l, t], asked = false) {
  if (asked) return num(mah, 50, 20000, 1000); let m = num(mah, 50, 20000, 1000);
  for (let i = 0; i < 60 && m > 50; i++) { const c = cellOf(m).size, [a, b] = [Math.min(c[0], c[1]), Math.max(c[0], c[1])]; if (a <= Math.min(w, l) && b <= Math.max(w, l) && c[2] <= t) break; m = Math.max(50, Math.round(m * .9 / 50) * 50); }
  return m;
}
// ---- profiles and meshes ---------------------------------------------------------------------------------------------------------------------
const SEG = 6, CIRC = 40, AXN = ['x', 'y', 'z'];
function roundRect(w, d, r) {
  r = Math.max(0, Math.min(r, w / 2 - .01, d / 2 - .01)); const out = [], cs = [[w / 2 - r, d / 2 - r, 0], [-w / 2 + r, d / 2 - r, 1], [-w / 2 + r, -d / 2 + r, 2], [w / 2 - r, -d / 2 + r, 3]];
  for (const [cx, cy, q] of cs) for (let i = 0; i <= SEG; i++) { const a = (q + i / SEG) * Math.PI / 2; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
const ellipse = (w, d, n = CIRC) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return [w / 2 * Math.cos(a), d / 2 * Math.sin(a)]; });
const area = pts => Math.abs(pts.reduce((s, q, i) => { const n = pts[(i + 1) % pts.length]; return s + q[0] * n[1] - n[0] * q[1]; }, 0) / 2);
const ROUND = new Set(['cyl', 'cup', 'ring']);
// the part in its own frame: the profile across (local x, y) and the length along local z, whatever axis it lies on in the world
function localDims(p) { const [x, y, z] = p.size; return p.axis === 'y' ? [x, z, y] : p.axis === 'x' ? [z, y, x] : [x, y, z]; }
// local → world turns (proper rotations, so nothing is mirrored): z-axis as is, y-axis Rx(−90°), x-axis Ry(+90°); and back
const toWorld = (p, [x, y, z]) => p.axis === 'y' ? [x, z, -y] : p.axis === 'x' ? [z, y, -x] : [x, y, z];
const toLocal = (p, [x, y, z]) => p.axis === 'y' ? [x, -z, y] : p.axis === 'x' ? [-z, y, x] : [x, y, z];
// A belt round two round parts (`loop`: their centres across the belt, in its own frame, and the radii it runs on, the larger first): its
// outline at `k` out from the running surfaces, as arcs and the two straight runs between them (for exact files), and as points going round
// anticlockwise, the same number whatever k is, so the inside and the outside of the belt are in step
export function loopSegs(L, k) {
  const [c1, c2] = L.c, [r1, r2] = L.r, ph = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]), th = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / Math.hypot(c2[0] - c1[0], c2[1] - c1[1])))), on = (c, r, a) => [c[0] + (r + k) * Math.cos(a), c[1] + (r + k) * Math.sin(a)], segs = [];
  for (let i = 0; i < 3; i++) { const a = ph + th + (2 * Math.PI - 2 * th) * i / 3, b = ph + th + (2 * Math.PI - 2 * th) * (i + 1) / 3; segs.push({ arc: true, c: c1, r: r1 + k, a: on(c1, r1, a), b: on(c1, r1, b), from: a, to: b }); }
  segs.push({ line: true, a: on(c1, r1, ph - th), b: on(c2, r2, ph - th) }, { arc: true, c: c2, r: r2 + k, a: on(c2, r2, ph - th), b: on(c2, r2, ph + th), from: ph - th, to: ph + th }, { line: true, a: on(c2, r2, ph + th), b: on(c1, r1, ph + th) });
  return segs;
}
function loopOutline(L, k) { const pts = []; for (const s of loopSegs(L, k)) { if (!s.arc) continue; const n = s.c === L.c[0] ? 16 : 20; for (let i = 0; i <= n; i++) { const a = s.from + (s.to - s.from) * i / n; if (i || !pts.length || Math.hypot(pts.at(-1)[0] - s.a[0], pts.at(-1)[1] - s.a[1]) > 1e-9) pts.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); } } return pts; }
const inPoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
function profilesOf(p) {
  const [w, d] = localDims(p), t = shellLike(p) ? Math.min(p.wall, Math.min(w, d) / 2 - .2) : 0;
  if (p.shape === 'ring' && p.loop) return { out: loopOutline(p.loop, t), inn: loopOutline(p.loop, 0), t };
  if (ROUND.has(p.shape)) return { out: ellipse(w, d), inn: t ? ellipse(w - 2 * t, d - 2 * t) : null, t };
  const r = p.r ?? 0; return { out: roundRect(w, d, r), inn: t ? roundRect(w - 2 * t, d - 2 * t, Math.max(r - t, 0)) : null, t };
}
const shellLike = p => p.shape === 'shell' || p.shape === 'cup' || p.shape === 'ring';
const openOf = p => p.shape === 'ring' || p.open === 'both' ? 'both' : p.open === '-' ? '-' : '+';
const axisOf = p => p.axis === 'y' ? 1 : p.axis === 'x' ? 0 : 2;

// ---- what a part carries besides its plain shape: openings cut through it and screw bosses standing on a housing's floor ------------------------
// Everything in the part's own frame, with u running from the floor (or the first face) to the open end: u = z for a shell open at +z, −z for
// one open at −z. An opening along the part's axis goes through the floor of a housing or right through a solid part; one across it is a
// window in a housing's side wall (a notch when it reaches the rim). An opening that cannot be cut (outside the floor, on a solid's edge,
// through a ball) is left out, so the clash it was meant to clear is still found.
//   → { w, d, L, r, t, round, sgn, floor, u0, uf, u1, holes: [{ cx, cy, hw, hd, round }], sides: [{ wall | phi, a, b, ua, ub }], bosses: [{ cx, cy, R, rp, ue }],
//       groove: { g, sk }, adds: [{ p, F }] }
const HOLE_N = 24;
export function featuresOf(p) {
  const [w, d, L] = localDims(p), round = ROUND.has(p.shape), r = round ? 0 : Math.max(0, Math.min(p.r ?? 0, w / 2 - .01, d / 2 - .01)), t = shellLike(p) ? Math.min(p.wall, Math.min(w, d) / 2 - .2) : 0, o = openOf(p);
  const sgn = shellLike(p) && o === '-' ? -1 : 1, floor = shellLike(p) && o !== 'both', F = { w, d, L, r, t, round, sgn, floor, shell: shellLike(p), u0: -L / 2, uf: floor ? -L / 2 + t : -L / 2, u1: L / 2, holes: [], sides: [], bosses: [], adds: [] };
  if (p.shape === 'ball') return F;
  if (p.shape === 'ring' && p.loop) { F.loop = { out: loopOutline(p.loop, t), inn: loopOutline(p.loop, 0) }; return F; } // a belt: its outline is the way round its two wheels
  F.adds = (p.adds || []).map(b => ({ p: b, F: featuresOf(b) })); // what is moulded on it (a lip): each a body of its own, placed from the part's centre
  if (p.shape === 'cyl' && p.flange) { F.flange = { k: p.flange.body / Math.min(w, d), za: p.flange.end === '+' ? L / 2 - p.flange.t : -L / 2, zb: p.flange.end === '+' ? L / 2 : -L / 2 + p.flange.t }; return F; } // a flanged part carries no openings
  const iw = w - 2 * t, id = d - 2 * t, ir = Math.max(r - t, 0), ax = axisOf(p);
  // is a box (centre, half sizes) inside the floor's inner outline with a margin?
  const inFloor = (cx, cy, hw, hd, m) => { const W2 = (floor ? iw : w) / 2 - m, D2 = (floor ? id : d) / 2 - m, R = floor ? ir : r; if (W2 <= hw || D2 <= hd) return false;
    if (round) return [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([a, b]) => ((cx + a * hw) / W2) ** 2 + ((cy + b * hd) / D2) ** 2 <= 1);
    if (Math.abs(cx) + hw > W2 || Math.abs(cy) + hd > D2) return false; const kx = Math.abs(cx) + hw - (W2 - R), ky = Math.abs(cy) + hd - (D2 - R); return !(kx > 0 && ky > 0 && kx * kx + ky * ky > R * R); };
  const apart = (a, b) => Math.abs(a.cx - b.cx) > a.hw + b.hw + .2 || Math.abs(a.cy - b.cy) > a.hd + b.hd + .2;
  for (const c of p.cuts || []) {
    const k = AXN.indexOf(c.axis), at = toLocal(p, c.at), sz = toLocal(p, c.size).map(Math.abs);
    if (k === ax) { if (shellLike(p) && !floor) continue; const h = { cx: at[0], cy: at[1], hw: sz[0] / 2, hd: sz[1] / 2, round: Boolean(c.round) }; if (h.hw > .1 && h.hd > .1 && inFloor(h.cx, h.cy, h.hw, h.hd, .3) && F.holes.every(q => apart(q, h))) F.holes.push(h); continue; }
    if (!shellLike(p)) continue;
    // a window in a side wall: which wall (the cut's axis and side), how wide along it, and from where to where along the part's axis
    const e = toLocal(p, [0, 1, 2].map(i => (i === k ? 1 : 0))), ki = Math.abs(e[0]) > .5 ? 0 : 1, side = Math.sign(e[ki]) * (c.at[k] < 0 ? -1 : 1), mi = 1 - ki, ua = Math.max(F.uf, sgn * at[2] - sz[2] / 2), ub = Math.min(F.u1, sgn * at[2] + sz[2] / 2);
    if (ub - ua < .1) continue; const half = [w, d][mi] / 2;
    if (round) { const lim = (half - t) * .96, a = Math.max(-lim, at[mi] - sz[mi] / 2), b = Math.min(lim, at[mi] + sz[mi] / 2); if (b - a < .1) continue;
      const ang = v => { const q = Math.asin(v / (half - t)); return ki === 0 ? (side > 0 ? q : Math.PI - q) : (side > 0 ? Math.PI / 2 - q : -Math.PI / 2 + q); }, x = [ang(a), ang(b)].sort((m, n) => m - n); F.sides.push({ phi: true, a: x[0], b: x[1], ua, ub }); }
    else { const lim = half - Math.max(r, t) - .05, a = Math.max(-lim, at[mi] - sz[mi] / 2), b = Math.min(lim, at[mi] + sz[mi] / 2); if (b - a < .1) continue; F.sides.push({ wall: ki, side, a, b, ua, ub }); }
  }
  // a groove round the rim for the other half's lip: the inside of the wall is taken away for `h` down from the rim, leaving a skin `sk` thick
  // outside it. A window that comes into that stretch is opened on through it to the rim, so the skin there is whole or gone, never a sliver.
  if (floor && p.groove && t - p.groove.t >= .25 && p.groove.h < L - t - .4) { const g = L / 2 - p.groove.h; F.groove = { g, sk: t - p.groove.t }; for (const m of F.sides) if (m.ub > g - .3) { m.ub = F.u1; m.ua = Math.max(F.uf, Math.min(m.ua, g - .3)); } }
  if (floor) for (const b of p.bosses || []) { const at = toLocal(p, b.at), R = Math.max(b.d * 1.2, b.d / 2 + 1.2), ue = sgn * at[2], q = { cx: at[0], cy: at[1], hw: R, hd: R, R, rp: b.d * .4, ue };
    // a screw that comes up through the floor into its boss: the hole in the floor and the boss's pilot are one bore
    const bore = F.holes.find(h => h.round && !h.boss && Math.hypot(h.cx - q.cx, h.cy - q.cy) < .05 && Math.abs(h.hw - h.hd) < 1e-6 && h.hw < R - .4); if (bore) q.rp = bore.hw;
    if (ue > F.uf + .3 && inFloor(q.cx, q.cy, R, R, .15) && F.holes.every(h => h === bore || apart(h, q)) && F.bosses.every(h => Math.hypot(h.cx - q.cx, h.cy - q.cy) > h.R + R + .2)) { if (bore) { bore.boss = true; q.bore = true; } F.bosses.push(q); } }
  return F;
}
// the outline across the part with the windows' edges added to it, outer and inner in step (the same number of points, one over the other)
function outlinesOf(F) {
  const { w, d, r, t, round } = F, marks = F.sides;
  if (F.loop) return { out: F.loop.out, inn: F.loop.inn, mid: null, ang: null };
  if (round) { const angs = new Set(Array.from({ length: CIRC }, (_, i) => i / CIRC * Math.PI * 2)), norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); for (const m of marks) { angs.add(norm(m.a)); angs.add(norm(m.b)); }
    const A = [...angs].sort((a, b) => a - b).filter((a, i, l) => i === 0 || a - l[i - 1] > 1e-6), at = (W, D) => A.map(a => [W / 2 * Math.cos(a), D / 2 * Math.sin(a)]); return { out: at(w, d), inn: t ? at(w - 2 * t, d - 2 * t) : null, mid: F.groove ? at(w - 2 * F.groove.sk, d - 2 * F.groove.sk) : null, ang: A }; }
  const build = (W, D, R) => { R = Math.max(0, Math.min(R, W / 2 - .01, D / 2 - .01)); const out = [], cs = [[W / 2 - R, D / 2 - R], [-W / 2 + R, D / 2 - R], [-W / 2 + R, -D / 2 + R], [W / 2 - R, -D / 2 + R]];
    // after each corner the flat run to the next: +y going −x, −x going −y, −y going +x, +x going +y
    const runs = [[1, 1, -1], [0, -1, -1], [1, -1, 1], [0, 1, 1]];
    cs.forEach(([cx, cy], q) => { for (let i = 0; i <= SEG; i++) { const a = (q + i / SEG) * Math.PI / 2; out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
      const [ki, side, dir] = runs[q], vs = [...new Set(marks.filter(m => m.wall === ki && m.side === side).flatMap(m => [m.a, m.b]))].sort((a, b) => dir * (a - b));
      for (const v of vs) out.push(ki === 1 ? [v, side * D / 2] : [side * W / 2, v]); });
    return out; };
  return { out: build(w, d, r), inn: t ? build(w - 2 * t, d - 2 * t, Math.max(r - t, 0)) : null, mid: F.groove ? build(w - 2 * F.groove.sk, d - 2 * F.groove.sk, Math.max(r - F.groove.sk, 0)) : null, ang: null };
}
// triangles of a flat outline with holes in it: each hole is joined to the outside by a bridge, then ears are clipped
function triPoly(outer, holes) {
  const A2 = P => P.reduce((s, a, i) => { const b = P[(i + 1) % P.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0), same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const tidy = P => P.filter((q, i) => !same(q, P[(i + 1) % P.length])), cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let poly = tidy(outer); if (A2(poly) < 0) poly = [...poly].reverse();
  const hs = holes.map(h => { const q = tidy(h); return A2(q) > 0 ? [...q].reverse() : q; }).sort((a, b) => Math.max(...b.map(q => q[0])) - Math.max(...a.map(q => q[0])));
  // a bridge from a hole's rightmost point to the nearest corner of the outline it can see: it crosses no edge (of the outline as bridged so
  // far, or of a hole still to come) and leaves that corner into the outline's inside
  const crosses = (a, b, c, d) => { const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b); return ((d1 > 1e-10 && d2 < -1e-10) || (d1 < -1e-10 && d2 > 1e-10)) && ((d3 > 1e-10 && d4 < -1e-10) || (d3 < -1e-10 && d4 > 1e-10)); };
  hs.forEach((h, hn) => {
    let mi = 0; for (let i = 1; i < h.length; i++) if (h[i][0] > h[mi][0]) mi = i; const M = h[mi], n = poly.length, edges = [poly, h, ...hs.slice(hn + 1)].flatMap(P => P.map((q, i) => [q, P[(i + 1) % P.length]]));
    let pi = -1, bd = Infinity; for (let i = 0; i < n; i++) { const V = poly[i], p = poly[(i + n - 1) % n], nx = poly[(i + 1) % n], dd = Math.hypot(V[0] - M[0], V[1] - M[1]); if (dd >= bd || dd < 1e-9 || V[0] < M[0] - 1e-9) continue; // to the right of the hole's rightmost point, so never across the hole itself
      const conv = cross(p, V, nx) >= 0, l1 = cross(p, V, M), l2 = cross(V, nx, M); if (conv ? !(l1 > 1e-10 && l2 > 1e-10) : (l1 < -1e-10 && l2 < -1e-10)) continue;
      if (edges.some(([a, b]) => crosses(M, V, a, b) || (!same(a, M) && !same(a, V) && Math.abs(cross(M, V, a)) < 1e-9 && (a[0] - M[0]) * (a[0] - V[0]) + (a[1] - M[1]) * (a[1] - V[1]) < 0))) continue; pi = i; bd = dd; }
    if (pi < 0) return;
    poly = [...poly.slice(0, pi + 1), ...h.slice(mi), ...h.slice(0, mi + 1), poly[pi], ...poly.slice(pi + 1)];
  });
  const idx = poly.map((_, i) => i), out = [], inside = (q, a, b, c) => cross(a, b, q) > -1e-10 && cross(b, c, q) > -1e-10 && cross(c, a, q) > -1e-10; // on an edge counts: a corner left on a triangle's side would open the surface
  for (let guard = 0; idx.length > 3 && guard < 40000; guard++) {
    let cut = -1; const n = idx.length;
    for (let k = 0; k < n && cut < 0; k++) { const a = poly[idx[(k + n - 1) % n]], b = poly[idx[k]], c = poly[idx[(k + 1) % n]]; if (cross(a, b, c) <= 1e-10) continue;
      let ok = true; for (const j of idx) { const q = poly[j]; if (same(q, a) || same(q, b) || same(q, c)) continue; if (inside(q, a, b, c)) { ok = false; break; } } if (ok) cut = k; }
    if (cut < 0) { let m = Infinity; for (let k = 0; k < n; k++) { const v = Math.abs(cross(poly[idx[(k + n - 1) % n]], poly[idx[k]], poly[idx[(k + 1) % n]])); if (v < m) { m = v; cut = k; } } }
    const a = poly[idx[(cut + n - 1) % n]], b = poly[idx[cut]], c = poly[idx[(cut + 1) % n]]; if (cross(a, b, c) > 1e-10) out.push(a, b, c); idx.splice(cut, 1);
  }
  if (idx.length === 3 && cross(poly[idx[0]], poly[idx[1]], poly[idx[2]]) > 1e-10) out.push(poly[idx[0]], poly[idx[1]], poly[idx[2]]);
  return out;
}
const holeLoop = h => h.round ? Array.from({ length: HOLE_N }, (_, i) => { const a = i / HOLE_N * Math.PI * 2; return [h.cx + h.hw * Math.cos(a), h.cy + h.hd * Math.sin(a)]; }) : [[h.cx + h.hw, h.cy - h.hd], [h.cx + h.hw, h.cy + h.hd], [h.cx - h.hw, h.cy + h.hd], [h.cx - h.hw, h.cy - h.hd]];
const ringLoop = (cx, cy, R) => Array.from({ length: HOLE_N }, (_, i) => { const a = i / HOLE_N * Math.PI * 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
// which stretches of u a wall column loses to the windows (merged), by the middle of the column
function lostOf(F, O) {
  const n = O.out.length, lost = Array.from({ length: n }, () => []);
  if (!F.sides.length) return lost;
  for (let i = 0; i < n; i++) { const a = O.out[i], b = O.out[(i + 1) % n], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (const m of F.sides) { let hit;
      if (m.phi) { const j = (i + 1) % n, a0 = O.ang[i], a1 = j ? O.ang[j] : 2 * Math.PI, mid = (a0 + a1) / 2; hit = [0, 2 * Math.PI, -2 * Math.PI].some(k => mid + k > m.a - 1e-9 && mid + k < m.b + 1e-9); }
      else { const on = m.wall === 1 ? Math.abs(a[1] - m.side * F.d / 2) < 1e-7 && Math.abs(b[1] - m.side * F.d / 2) < 1e-7 : Math.abs(a[0] - m.side * F.w / 2) < 1e-7 && Math.abs(b[0] - m.side * F.w / 2) < 1e-7, v = m.wall === 1 ? mx : my; hit = on && v > m.a - 1e-9 && v < m.b + 1e-9 && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9; }
      if (hit) lost[i].push([m.ua, m.ub]); }
    lost[i].sort((x, y) => x[0] - y[0]); const mg = []; for (const iv of lost[i]) { if (mg.length && iv[0] <= mg.at(-1)[1] + 1e-9) mg.at(-1)[1] = Math.max(mg.at(-1)[1], iv[1]); else mg.push([...iv]); } lost[i] = mg; }
  return lost;
}
// the part's triangles in its own frame, every one wound to face outward, the surface closed: [x, y, z, ...] nine numbers a triangle
function solidOf(p) {
  const T = [], tri = (a, b, c) => T.push(a, b, c);
  if (p.shape === 'ball') { const [a, b, c] = p.size.map(v => v / 2), n = 18, m = 12, P = (i, j) => { const th = i / m * Math.PI, ph = (j % n) / n * 2 * Math.PI; return i === 0 ? [0, 0, c] : i === m ? [0, 0, -c] : [a * Math.sin(th) * Math.cos(ph), b * Math.sin(th) * Math.sin(ph), c * Math.cos(th)]; };
    for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1); if (i < m - 1) tri(A, B, C); if (i > 0) tri(A, C, D); } return { T, sgn: 1, ball: true }; }
  const F = featuresOf(p), O = outlinesOf(F), { out, inn } = O, n = out.length, { u0, uf, u1 } = F, lost = lostOf(F, O), at = (q, u) => [q[0], q[1], u], mid = O.mid, g = mid ? F.groove.g : null; // g: where the groove's floor is
  // the heights on the upright edge at an outline point: the ends, and where a window in the column on either side starts and stops
  const lvl = i => [...new Set([...lost[(i + n - 1) % n], ...lost[i], ...(g == null ? [] : [[g]])].flat())].sort((a, b) => a - b), between = (l, a, b) => [a, ...l.filter(v => v > a + 1e-9 && v < b - 1e-9), b];
  // a strip of wall between two upright edges (P to Q going round anticlockwise) from a to b, facing out of the outline, or into it
  const strip = (P, Q, lp, lq, a, b, outward) => { const L1 = between(lp, a, b), L2 = between(lq, a, b); let i = 0, j = 0; while (i < L1.length - 1 || j < L2.length - 1) { const A = at(P, L1[i]), B = at(Q, L2[j]), C = j === L2.length - 1 || (i < L1.length - 1 && L1[i + 1] <= L2[j + 1]) ? at(P, L1[++i]) : at(Q, L2[++j]); outward ? tri(A, B, C) : tri(A, C, B); } };
  const kept = (i, a, b) => { const ks = []; let lo = a; for (const [x, y] of lost[i]) { if (x > lo + 1e-9) ks.push([lo, Math.min(x, b)]); lo = Math.max(lo, y); } if (lo < b - 1e-9) ks.push([lo, b]); return ks; };
  const flat = (poly, holes, u, up) => { let ts; if (!holes.length) { const c = poly.reduce((s, q) => [s[0] + q[0] / poly.length, s[1] + q[1] / poly.length], [0, 0]); ts = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-9) ts.push(c, a, b); } } else ts = triPoly(poly, holes);
    for (let i = 0; i < ts.length; i += 3) up ? tri(at(ts[i], u), at(ts[i + 1], u), at(ts[i + 2], u)) : tri(at(ts[i], u), at(ts[i + 2], u), at(ts[i + 1], u)); };
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d); };
  const loops = F.holes.map(holeLoop), tube = (loop, a, b, outward) => { for (let i = 0; i < loop.length; i++) strip(loop[i], loop[(i + 1) % loop.length], [], [], a, b, outward); };
  if (!inn && F.flange) { // a flanged round part: the flange's edge and face, the step down to the body, the body and its end
    const { k, za, zb } = F.flange, bod = out.map(q => [q[0] * k, q[1] * k]), low = za <= u0 + 1e-9;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; strip(out[i], out[j], [], [], za, zb, true); strip(bod[i], bod[j], [], [], low ? zb : u0, low ? u1 : za, true);
      low ? quad(at(out[i], zb), at(out[j], zb), at(bod[j], zb), at(bod[i], zb)) : quad(at(out[i], za), at(bod[i], za), at(bod[j], za), at(out[j], za)); }
    flat(out, [], low ? u0 : u1, !low); flat(bod, [], low ? u1 : u0, low);
    return { T, sgn: F.sgn };
  }
  if (!inn) { // a solid: the wall, the two faces with their holes, the holes' own walls
    for (let i = 0; i < n; i++) strip(out[i], out[(i + 1) % n], [], [], u0, u1, true);
    flat(out, loops, u0, false); flat(out, loops, u1, true); for (const l of loops) tube(l, u0, u1, false);
    return { T, sgn: F.sgn };
  }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, li = lvl(i), lj = lvl(j);
    // outside and inside faces of the wall, less the windows; the floor's edge below them
    if (F.floor && uf > u0) strip(out[i], out[j], [], [], u0, uf, true);
    for (const [a, b] of kept(i, uf, u1)) { strip(out[i], out[j], li, lj, a, b, true);
      if (g == null || b <= g + 1e-9) strip(inn[i], inn[j], li, lj, a, b, false); else if (a >= g - 1e-9) strip(mid[i], mid[j], li, lj, a, b, false);
      else { strip(inn[i], inn[j], li, lj, a, g, false); strip(mid[i], mid[j], li, lj, g, b, false); quad(at(mid[i], g), at(mid[j], g), at(inn[j], g), at(inn[i], g)); } } // the wall, the skin outside the groove, the groove's floor
    // round a window: the sill and the head, and the upright sides where the next column is still there
    for (const [a, b] of lost[i]) { if (F.floor || a > u0 + 1e-9) quad(at(out[i], a), at(out[j], a), at(inn[j], a), at(inn[i], a)); if (b < u1 - 1e-9) quad(at(out[i], b), at(inn[i], b), at(inn[j], b), at(out[j], b)); }
    const prev = lost[(i + n - 1) % n], cur = lost[i], c0 = [...prev, ...cur].flat(), cuts = [...new Set(g != null && c0.some(v => v < g - 1e-9) && c0.some(v => v > g + 1e-9) ? [...c0, g] : c0)].sort((a, b) => a - b), has = (l, v) => l.some(([x, y]) => v > x && v < y);
    for (let k = 0; k < cuts.length - 1; k++) { const a = cuts[k], b = cuts[k + 1], m = (a + b) / 2, hp = has(prev, m), hc = has(cur, m); if (hp === hc) continue;
      const I = g != null && a >= g - 1e-9 ? mid : inn, A = at(out[i], a), B = at(I[i], a), C = at(I[i], b), D = at(out[i], b);
      if (g != null && Math.abs(b - g) < 1e-9) { const M = at(mid[i], g); if (hc) { tri(M, D, A); tri(M, A, B); tri(M, B, C); } else { tri(M, C, B); tri(M, B, A); tri(M, A, D); } } // its top edge is in two pieces where the groove's floor meets it
      else if (hc) quad(A, B, C, D); else quad(A, D, C, B); }
    // the rim at the open end (and at the other end of a ring)
    if (!has(cur, u1 - 1e-6) && !cur.some(([, y]) => y >= u1 - 1e-9)) quad(at(out[i], u1), at(out[j], u1), at((mid || inn)[j], u1), at((mid || inn)[i], u1));
    if (!F.floor && !cur.some(([x]) => x <= u0 + 1e-9)) quad(at(out[i], u0), at(inn[i], u0), at(inn[j], u0), at(out[j], u0));
  }
  if (F.floor) { // the floor: its outside face, its inside face round the bosses, the openings through it, and each boss with its pilot hole
    const own = loops.filter((_, i) => !F.holes[i].boss);
    flat(out, loops, u0, false); flat(inn, [...own, ...F.bosses.map(b => ringLoop(b.cx, b.cy, b.R))], uf, true); for (const l of own) tube(l, u0, uf, false);
    for (const b of F.bosses) { const o = ringLoop(b.cx, b.cy, b.R), q = ringLoop(b.cx, b.cy, b.rp); tube(o, uf, b.ue, true); tube(q, b.bore ? u0 : uf, b.ue, false); if (!b.bore) flat(q, [], uf, true); for (let i = 0; i < o.length; i++) { const j = (i + 1) % o.length; quad(at(o[i], b.ue), at(o[j], b.ue), at(q[j], b.ue), at(q[i], b.ue)); } }
  }
  return { T, sgn: F.sgn };
}
// the part's triangles in world space, centred on p.at plus an offset: a closed surface, every triangle wound to face outward
export function meshOf(p, off = [0, 0, 0]) {
  const { T, sgn, ball } = solidOf(p), o = new Float32Array(T.length * 3), put = (q, i) => { const w = ball ? q : toWorld(p, [q[0], q[1], sgn * q[2]]); o[i] = w[0] + p.at[0] + off[0]; o[i + 1] = w[1] + p.at[1] + off[1]; o[i + 2] = w[2] + p.at[2] + off[2]; };
  for (let i = 0; i < T.length; i += 3) { put(T[i], i * 3); put(T[sgn < 0 ? i + 2 : i + 1], i * 3 + 3); put(T[sgn < 0 ? i + 1 : i + 2], i * 3 + 6); }
  if (!p.adds?.length) return o;
  // what is moulded on it follows, each a closed body of its own standing on the part (not fused into one skin)
  const more = p.adds.map(b => meshOf({ ...b, at: b.at.map((v, k) => v + p.at[k]) }, off)), all = new Float32Array(o.length + more.reduce((t, m) => t + m.length, 0)); all.set(o); let k = o.length; for (const m of more) { all.set(m, k); k += m.length; }
  return all;
}
// volume (mm³), the area the mould sees along its draw (cm²), and the outside area (mm²)
export function volumeOf(p) {
  if (p.shape === 'ball') { const [a, b, c] = p.size.map(v => v / 2); return 4 / 3 * Math.PI * a * b * c; }
  const [, , L] = localDims(p), { out, inn, t } = profilesOf(p), A = area(out);
  if (!inn) return p.shape === 'cyl' && p.flange ? A * p.flange.t + A * (p.flange.body / Math.min(...localDims(p).slice(0, 2))) ** 2 * (L - p.flange.t) : A * L;
  return openOf(p) === 'both' ? (A - area(inn)) * L : A * L - area(inn) * (L - t);
}
// the outside and inside surface (mm²), from the triangles: a rotocast or blown part is a skin of about 2 mm, not a solid
export function surfaceOf(p) { const m = meshOf(p, [-p.at[0], -p.at[1], -p.at[2]]); let A = 0; for (let i = 0; i < m.length; i += 9) { const u = [m[i + 3] - m[i], m[i + 4] - m[i + 1], m[i + 5] - m[i + 2]], v = [m[i + 6] - m[i], m[i + 7] - m[i + 1], m[i + 8] - m[i + 2]]; A += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; } return A; }
export function projectedCm2(p) { if (p.shape === 'ball') return Math.PI * p.size[0] * p.size[1] / 4 / 100; return area(profilesOf(p).out) / 100; }
const bboxOf = (p, off = [0, 0, 0]) => ({ lo: p.size.map((s, k) => p.at[k] + off[k] - s / 2), hi: p.size.map((s, k) => p.at[k] + off[k] + s / 2) });
// the space inside a shell: its box less the wall on the sides and on the closed end (the open end stays open)
function innerBox(p) {
  const b = bboxOf(p), ax = p.axis === 'y' ? 1 : p.axis === 'x' ? 0 : 2, t = p.wall, o = openOf(p), lo = [...b.lo], hi = [...b.hi];
  for (let k = 0; k < 3; k++) if (k !== ax) { lo[k] += t; hi[k] -= t; }
  if (o === '+') lo[ax] += t; else if (o === '-') hi[ax] -= t; // local +z is the world's +axis on every axis (toWorld), so '+' is open at the far end
  return { lo, hi };
}
// the room a part has inside a housing: a housing and the half that closes it (the same axis, open towards it, meeting at the parting line) make one space
function roomOf(par, parts) {
  const r = innerBox(par), ax = axisOf(par), b = bboxOf(par), o = openOf(par);
  for (const m of parts) { if (m === par || !shellLike(m) || axisOf(m) !== ax || openOf(m) === o || openOf(m) === 'both') continue; const mb = bboxOf(m), mi = innerBox(m);
    if (o === '+' && Math.abs(mb.lo[ax] - b.hi[ax]) < 1.5) r.hi[ax] = mi.hi[ax]; if (o === '-' && Math.abs(mb.hi[ax] - b.lo[ax]) < 1.5) r.lo[ax] = mi.lo[ax]; }
  return r;
}

// ---- cleaning what the page sends ---------------------------------------------------------------------------------------------------------------
const ID = /^[a-z0-9-]{1,32}$/, WAYS = ['+x', '-x', '+y', '-y', '+z', '-z'];
export function cleanPart(q = {}, i = 0) {
  const shape = SHAPES[q.shape] ? q.shape : 'box', resin = RESINS[q.resin] ? q.resin : 'ABS', process = PROCESSES[q.process] ? q.process : resin === 'bought in' ? 'bought in' : 'injection moulding';
  const size = [0, 1, 2].map(k => r1(num(q.size?.[k], .3, 2000, 20))), at = [0, 1, 2].map(k => r1(num(q.at?.[k], -3000, 3000, 0)));
  const p = { id: ID.test(String(q.id || '')) ? q.id : `p${i + 1}`, name: clip(q.name, 60) || `Part ${i + 1}`, shape, axis: ['x', 'y', 'z'].includes(q.axis) ? q.axis : 'z', size, at,
    resin, process, finish: FINISHES.includes(q.finish) ? q.finish : 'none', colour: /^#[0-9a-f]{6}$/i.test(q.colour || '') ? q.colour.toLowerCase() : RESINS[resin].col,
    qty: Math.round(num(q.qty, 1, 500, 1)), fix: FIXES[q.fix] ? q.fix : 'place', fixQty: Math.round(num(q.fixQty, 0, 50, 0)), order: Math.round(num(q.order, 0, 99, i + 1)),
    dir: [0, 1, 2].map(k => num(q.dir?.[k], -1, 1, k === 2 ? 1 : 0)), lvl: r1(num(q.lvl, -20, 20, 0)), parent: ID.test(String(q.parent || '')) ? q.parent : null };
  if (shellLike(p)) { p.wall = r2(num(q.wall, .3, 1000, 2)); p.open = q.open === '-' ? '-' : '+'; }
  if (shape === 'box' || shape === 'shell' || shape === 'pcb') p.r = r1(num(q.r, 0, 500, shape === 'pcb' ? .5 : 2));
  if (PROCESSES[process].tool) { p.draft = r1(num(q.draft, 0, 10, 1)); p.undercuts = Math.round(num(q.undercuts, 0, 12, 0)); }
  if (process === 'bought in' || process === 'CNC machined' || process === 'CNC routed' || process === '3D printed' || process === 'PCB fab and SMT') p.cost = r2(num(q.cost, 0, 5000, 0));
  if (q.food) p.food = true;
  if (q.small === false) p.small = false;
  if (q.elec && ELEC[q.elec.kind]) { const e = ELEC[q.elec.kind]; p.elec = { kind: q.elec.kind, ma: r2(num(q.elec.ma, 0, 5000, e.ma)), ua: r2(num(q.elec.ua, 0, 1e5, e.ua)), duty: r2(num(q.elec.duty, 0, 1, e.duty)) }; if (CELLS[q.elec.kind]) p.elec.mah = Math.round(num(q.elec.mah, 50, 20000, q.elec.kind === 'aa' ? 2500 : 1000)); }
  // what it passes through (an opening is cut there for it), where its other pieces sit (qty over 1: offsets from the one drawn), the
  // openings cut in it (worked out by cleanAssembly from the two above, and for sockets) and the screw bosses on a housing's floor
  const v3 = (a, lo, hi, d) => [0, 1, 2].map(k => r2(num(a?.[k], lo, hi, d)));
  // a flange on a round solid part (a speaker driver's): its full width holds for `t` at one end of its axis, the body behind it is `body` across
  if (shape === 'cyl' && q.flange && Number(q.flange.body) > 0) { const [fw, fd, fl] = localDims(p), ac = Math.min(fw, fd); if (ac > 1 && fl > .6) p.flange = { body: r1(num(q.flange.body, .3, ac - .4, ac * .8)), t: r1(num(q.flange.t, .2, fl - .2, Math.min(3, fl / 2))), end: q.flange.end === '+' ? '+' : '-' }; }
  // what is moulded on it: a `lip` round its rim that stands in the other half's wall (the groove that takes it is worked out on that half)
  if ((shape === 'shell' || shape === 'cup') && q.lip && ID.test(String(q.lip.into || ''))) p.lip = { into: q.lip.into, h: r1(num(q.lip.h, .5, 5, 1.2)), t: r2(num(q.lip.t, .3, Math.max(.3, p.wall - .4), Math.max(.4, r1(p.wall * .45)))) };
  if ((shape === 'shell' || shape === 'cup') && q.groove && Number(q.groove.t) > 0) p.groove = { h: r2(num(q.groove.h, .3, 8, 1.5)), t: r2(num(q.groove.t, .1, p.wall, p.wall / 2)), ...(ID.test(String(q.groove.for || '')) ? { for: q.groove.for } : {}) };
  // its snap hooks: which part they catch on, their size (beam length, thickness, width, how far the head stands out), and where each
  // leaves the part (from its centre), which way it runs and which way its head points
  if (q.snaps && ID.test(String(q.snaps.into || '')) && Array.isArray(q.snaps.hooks)) { const hs = q.snaps.hooks.slice(0, 12).filter(h => WAYS.includes(h?.along) && WAYS.includes(h?.out) && h.along[1] !== h.out[1]).map(h => ({ at: v3(h.at, -3000, 3000, 0), along: h.along, out: h.out }));
    if (hs.length) p.snaps = { into: q.snaps.into, len: r1(num(q.snaps.len, 3, 60, 8)), t: r2(num(q.snaps.t, .5, 4, 1)), w: r1(num(q.snaps.w, 1.5, 30, 5)), y: r2(num(q.snaps.y, .3, 3, 1)), hooks: hs }; }
  // a thread: the round part it screws onto (or into), its pitch, how many turns hold it and how deep the thread form is; the two diameters
  // are the two parts' own (the one's outside, the other's bore)
  if (ROUND.has(shape) && q.thread && ID.test(String(q.thread.onto || ''))) p.thread = { onto: q.thread.onto, pitch: r2(num(q.thread.pitch, .5, 12, 4)), turns: r2(num(q.thread.turns, .25, 12, 1.5)), depth: r2(num(q.thread.depth, .3, 4, 1.2)) };
  // hinge knuckles: the pin they turn on, where each is along the pin (from the pin's middle), how long each is and how wide across
  if ((shape === 'shell' || shape === 'cup') && q.knuckles && ID.test(String(q.knuckles.pin || '')) && Array.isArray(q.knuckles.at) && q.knuckles.at.length) p.knuckles = { pin: q.knuckles.pin, len: r1(num(q.knuckles.len, 1, 400, 8)), d: r1(num(q.knuckles.d, 2, 40, 7)), at: q.knuckles.at.slice(0, 12).map(v => r2(num(v, -2000, 2000, 0))) };
  // a belt: the two round parts it runs round, and the length it is bought at (its inside, lying slack); its outline is worked out from the two
  if (shape === 'ring' && Array.isArray(q.around) && q.around.length === 2 && q.around.every(x => ID.test(String(x))) && q.around[0] !== q.around[1]) { p.around = q.around.map(String); if (Number(q.len) > 0) p.len = r1(num(q.len, 5, 5000, 100)); }
  // openings of its own, that nothing passes through (a sip opening, a vent): where from its centre, how large, along which axis, round or square;
  // and for a cover that slides over one: the part the opening is in, and how far the cover moves to open it
  if (Array.isArray(q.holes)) { const hs = q.holes.slice(0, 8).map(c => ({ at: v3(c?.at, -3000, 3000, 0), size: v3(c?.size, .2, 3000, 1), axis: AXN.includes(c?.axis) ? c.axis : 'z', ...(c?.round ? { round: true } : {}) })); if (hs.length) p.holes = hs; }
  if (q.slides && ID.test(String(q.slides.over || ''))) p.slides = { over: q.slides.over, by: v3(q.slides.by, -500, 500, 0) };
  if (Array.isArray(q.through)) { const t = [...new Set(q.through.map(String).filter(x => ID.test(x)))].slice(0, 4); if (t.length) p.through = t; }
  if (Array.isArray(q.spots) && p.qty > 1) { const sp = q.spots.slice(0, p.qty - 1).map(a => v3(a, -3000, 3000, 0)); if (sp.length) p.spots = sp; }
  if (Array.isArray(q.cuts)) { const cs = q.cuts.slice(0, 40).map(c => ({ at: v3(c?.at, -3000, 3000, 0), size: v3(c?.size, .2, 3000, 1), axis: AXN.includes(c?.axis) ? c.axis : 'z', ...(c?.round ? { round: true } : {}), ...(ID.test(String(c?.for || '')) ? { for: c.for } : {}) })); if (cs.length) p.cuts = cs; }
  if (Array.isArray(q.bosses) && (shape === 'shell' || shape === 'cup')) { const bs = q.bosses.slice(0, 24).map(b => ({ at: v3(b?.at, -3000, 3000, 0), d: r1(num(b?.d, .8, 12, 2)) })); if (bs.length) p.bosses = bs; }
  if (shape === 'pcb') { p.resin = 'FR-4'; p.process = 'PCB fab and SMT'; p.layers = [2, 4, 6].includes(Number(q.layers)) ? Number(q.layers) : 2; p.colour = /^#[0-9a-f]{6}$/i.test(q.colour || '') ? p.colour : RESINS['FR-4'].col; }
  return p;
}
export const ARCHES = { puck: { kind: 'electronics', label: 'Round device (speaker, hub, puck)' }, handheld: { kind: 'electronics', label: 'Handheld (remote, power bank, tracker)' }, desk: { kind: 'electronics', label: 'Desk device with a display (clock, station)' },
  tumbler: { kind: 'goods', label: 'Tumbler or bottle (cup, lid, gasket, straw)' }, case: { kind: 'goods', label: 'Case or box (base, lid, hinge, latch)' }, figure: { kind: 'goods', label: 'Figure (vinyl collectible on a base)' },
  cdplayer: { kind: 'electronics', label: 'CD player (hi-fi component)' }, cassette: { kind: 'electronics', label: 'Cassette player (portable)' }, speaker: { kind: 'electronics', label: 'Powered speaker (bookshelf, Bluetooth)' }, custom: { kind: 'goods', label: 'Start from one part' } , turntable: { kind: 'electronics', label: 'Turntable (belt drive, phono out)' }, headphones: { kind: 'electronics', label: 'Over-ear headphones (Bluetooth)' }, smartspeaker: { kind: 'electronics', label: 'Smart speaker (Wi-Fi, mics, light ring)' }, powerbank: { kind: 'electronics', label: 'Power bank (18650 cells, USB-C PD)' }, lamp: { kind: 'electronics', label: 'Cordless table lamp (LED, touch dimmer)' } };
export const AGES = { '0+': 'All ages, under 3 included', '3+': '3 years and up', '8+': '8 years and up', '14+': 'Collectible, 14 and up' };
export function cleanAssembly(s = {}) {
  const arch = ARCHES[s.arch] ? s.arch : 'custom', parts = (Array.isArray(s.parts) ? s.parts : []).slice(0, 80).map(cleanPart);
  const seen = new Set(); for (const p of parts) { while (seen.has(p.id)) p.id = `${p.id}x`.slice(-32); seen.add(p.id); }
  for (const p of parts) if (p.parent && (!seen.has(p.parent) || p.parent === p.id)) p.parent = null;
  for (const p of parts) if (p.through) { p.through = p.through.filter(id => seen.has(id) && id !== p.id); if (!p.through.length) delete p.through; }
  for (const p of parts) if (p.lip && (!seen.has(p.lip.into) || p.lip.into === p.id)) delete p.lip;
  for (const p of parts) if (p.snaps && (!seen.has(p.snaps.into) || p.snaps.into === p.id)) delete p.snaps;
  for (const p of parts) if (p.thread && (!seen.has(p.thread.onto) || p.thread.onto === p.id)) delete p.thread;
  for (const p of parts) if (p.knuckles && (!seen.has(p.knuckles.pin) || p.knuckles.pin === p.id)) delete p.knuckles;
  for (const p of parts) if (p.around && p.around.some(id => !seen.has(id) || id === p.id)) { delete p.around; delete p.len; }
  for (const p of parts) if (p.slides && (!seen.has(p.slides.over) || p.slides.over === p.id)) delete p.slides;
  moulded(parts); belted(parts);
  const v = Number(s.v) >= 2 ? 2 : 1; // 2: made since parts say what they pass through; 1 (nothing saved): made before
  openings(parts, v < 2);
  const dm = s.dims && ['w', 'd', 'h'].every(k => Number(s.dims[k]) > 0) ? { w: r1(num(s.dims.w, .3, 5000, 1)), d: r1(num(s.dims.d, .3, 5000, 1)), h: r1(num(s.dims.h, .3, 5000, 1)) } : null; // the size asked for, when it was
  return { arch, kind: s.kind === 'electronics' || ARCHES[arch].kind === 'electronics' && s.kind !== 'goods' ? 'electronics' : 'goods', name: clip(s.name, 80),
    volume: Math.round(num(s.volume, 50, 1e7, 5000)), years: Math.round(num(s.years, 1, 10, 3)), age: AGES[s.age] ? s.age : '14+', chargeMa: Math.round(num(s.chargeMa, 50, 5000, 500)),
    labour: r2(num(s.labour, 1, 80, 6)), ...(dm ? { dims: dm } : {}), ...(v >= 2 ? { v } : {}), parts };
}
// The openings each part needs, worked out afresh every time so an opening follows the part it is for: a part that says it goes `through`
// another gets its outline (and each of its `spots`) cut there with 0.2 mm round it, and every socket and every clear window gets its
// opening in the housing wall it reaches. A window in a side wall, a hole in a floor or through a solid part; see featuresOf for what can be cut.
function cutFor(h, q, o) {
  const clr = .2, e = 1e-6, ax = axisOf(h), qa = q.at.map((v, k) => v + o[k]), hlo = h.at.map((v, k) => v - h.size[k] / 2), hhi = h.at.map((v, k) => v + h.size[k] / 2);
  // a flanged part goes through with its body where the host lies behind the flange
  const fa = axisOf(q), f0 = q.flange && (q.flange.end === '-' ? qa[fa] - q.size[fa] / 2 : qa[fa] + q.size[fa] / 2 - q.flange.t), behind = q.flange && !(hhi[fa] > f0 + e && hlo[fa] < f0 + q.flange.t - e), qs = behind ? q.size.map((v, k) => (k === fa ? v : v * q.flange.body / Math.min(...q.size.filter((_, i) => i !== fa)))) : q.size;
  const qlo = qa.map((v, k) => v - qs[k] / 2), qhi = qa.map((v, k) => v + qs[k] / 2);
  if ([0, 1, 2].some(k => qhi[k] <= hlo[k] + e || qlo[k] >= hhi[k] - e) || h.shape === 'ball') return [];
  const rel = qa.map((v, k) => r2(v - h.at[k])), rnd = k => (ROUND.has(q.shape) && axisOf(q) === k) || q.shape === 'ball', mk = (k, at) => ({ at, size: qs.map((v, i) => r2(i === k ? v : v + 2 * clr)), axis: AXN[k], ...(rnd(k) ? { round: true } : {}), for: q.id });
  if (!shellLike(h)) return [mk(ax, rel.map((v, k) => (k === ax ? 0 : v)))];
  const t = h.wall, op = openOf(h);
  if (op !== 'both') { const flo = op === '+' ? hlo[ax] : hhi[ax] - t; if (qlo[ax] < flo + t - e && qhi[ax] > flo + e) return [mk(ax, rel.map((v, k) => (k === ax ? r2(flo + t / 2 - h.at[ax]) : v)))]; }
  const out = []; for (const k of [0, 1, 2]) { if (k === ax) continue; for (const sg of [1, -1]) { const reach = sg > 0 ? qhi[k] - (hhi[k] - t) : (hlo[k] + t) - qlo[k]; if (reach > e) out.push(mk(k, rel.map((v, i) => (i === k ? r2(sg * (h.size[k] / 2 - t / 2)) : v)))); } }
  return out;
}
// An assembly saved before parts said what they pass through (no `v`) is read as it was meant: a part that plainly goes through a wall
// (in on one side and out on the other, or flush with the far face; much narrower than the wall; not a part that sits inside that housing)
// gets its opening, as if it had said so. Nothing is written into the saved parts: the opening is worked out each time it is opened. A part
// that only digs into a wall, a board corner in a rounded corner, a lid a size too small still clash, as they should.
function plainlyThrough(h, q, o) {
  if (q.parent === h.id && shellLike(h)) return false; if (h.parent === q.id || isScrew(q) || isScrew(h) || h.shape === 'ball' || h.elec || q.shape === 'pcb') return false;
  const e = .6, ax = axisOf(h), qa = q.at.map((v, k) => v + o[k]), qlo = qa.map((v, k) => v - q.size[k] / 2), qhi = qa.map((v, k) => v + q.size[k] / 2), hlo = h.at.map((v, k) => v - h.size[k] / 2), hhi = h.at.map((v, k) => v + h.size[k] / 2);
  if ([0, 1, 2].some(k => qhi[k] <= hlo[k] || qlo[k] >= hhi[k])) return false;
  const spans = (k, a, b) => qlo[k] <= a + e && qhi[k] >= b - e && (qlo[k] < a - .5 || qhi[k] > b + .5), narrow = k => [0, 1, 2].filter(i => i !== k).every(i => q.size[i] <= h.size[i] * .8 && qlo[i] > hlo[i] && qhi[i] < hhi[i]);
  if (!shellLike(h)) return spans(ax, hlo[ax], hhi[ax]) && narrow(ax);
  const t = h.wall, op = openOf(h);
  if (op !== 'both') { const flo = op === '+' ? hlo[ax] : hhi[ax] - t; if (spans(ax, flo, flo + t) && narrow(ax)) return true; if (qlo[ax] < flo + t && qhi[ax] > flo) return false; }
  return [0, 1, 2].some(k => k !== ax && ((spans(k, hhi[k] - t, hhi[k]) && qlo[k] > hlo[k] + t) || (spans(k, hlo[k], hlo[k] + t) && qhi[k] < hhi[k] - t)) && [0, 1, 2].filter(i => i !== k).every(i => q.size[i] <= h.size[i] * .8));
}
function openings(parts, before = false) {
  const byId = Object.fromEntries(parts.map(p => [p.id, p])); for (const p of parts) { delete p.cuts; if (p.holes) p.cuts = p.holes.map(c => ({ ...c, at: [...c.at], size: [...c.size] })); } // its own openings first
  const add = (h, q) => { for (const o of [[0, 0, 0], ...(q.spots || [])]) for (const ho of [[0, 0, 0], ...(h.spots || [])]) for (const c of cutFor(h, q, o.map((v, k) => v - ho[k]))) if ((h.cuts ||= []).length < 40 && !h.cuts.some(x => x.axis === c.axis && x.at.every((v, k) => Math.abs(v - c.at[k]) < .01))) h.cuts.push(c); };
  for (const q of parts) { for (const id of q.through || []) add(byId[id], q);
    // a socket reaches through the housing wall it sits at, and a clear part set into a housing wall is a window: both get their opening
    const socket = q.elec && (ELEC[q.elec.kind].port || q.elec.kind === 'usbc'), pane = RESINS[q.resin].clear && !shellLike(q);
    if (socket || pane) for (const h of parts) if (h !== q && shellLike(h) && !h.elec && (socket || !RESINS[h.resin].clear) && !(q.through || []).includes(h.id)) add(h, q);
    if (before && !socket && !pane && !q.through) for (const h of parts) if (h !== q && [[0, 0, 0], ...(q.spots || [])].some(o => plainlyThrough(h, q, o))) add(h, q); }
  // a lip stands on a rim an opening may come up through: what passes through the wall there passes through the lip too
  for (const h of parts) for (const b of h.adds || []) { delete b.cuts; if (b.kind !== 'lip') continue; const B = { ...b, at: b.at.map((v, k) => v + h.at[k]) };
    for (const id of new Set((h.cuts || []).map(c => c.for).filter(Boolean))) { const q = byId[id]; if (q) for (const o of [[0, 0, 0], ...(q.spots || [])]) for (const c of cutFor(B, q, o)) if ((b.cuts ||= []).length < 12) b.cuts.push(c); } }
}
// ---- what is moulded on a part beyond its plain shape, and what that takes out of the part it meets ------------------------------------------------
// Worked out afresh by cleanAssembly, like the openings, so it follows the parts. A housing half that says its `lip` goes into another half
// gets the lip as a body standing on its rim (`adds`), on the inner side of its wall, and the other half gets the `groove` that takes it: the
// inside of its wall cut back from the rim, 0.1 mm clear of the lip at the side and 0.3 mm at its top. A body that is moulded on starts
// 0.3 mm inside the part it stands on (SINK), so the two overlap and a union in CAD joins them cleanly.
const LIP_SIDE = .1, LIP_TOP = .3, SINK = .3, floored = p => p.shape === 'shell' || p.shape === 'cup';
// two halves that close rim to rim and the lip of `a` in the wall of `b`: the numbers, or { why } when there can be none
function lipPair(a, b) {
  if (!b) return { why: 'that part is not there' };
  if (!floored(a) || !floored(b)) return { why: `${b.name.toLowerCase()} is not a housing half` };
  const ax = axisOf(a), sa = a.open === '-' ? -1 : 1, sb = b.open === '-' ? -1 : 1, cr = [0, 1, 2].filter(k => k !== ax);
  if (axisOf(b) !== ax || sa === sb) return { why: 'the two do not open toward each other' };
  const gap = sa * ((b.at[ax] + sb * b.size[ax] / 2) - (a.at[ax] + sa * a.size[ax] / 2)); // from this rim on to the other's: 0 when they meet
  if (Math.abs(gap) > 1) return { why: `their rims are ${r1(Math.abs(gap))} mm apart` };
  const ta = Math.min(a.wall, Math.min(...cr.map(k => a.size[k])) / 2 - .2), tb = Math.min(b.wall, Math.min(...cr.map(k => b.size[k])) / 2 - .2), tl = Math.min(a.lip.t, ta - .3), k = ta - tl;
  if (tl < .3) return { why: 'its own wall is too thin to carry one' };
  // the wall the other half keeps outside the lip, where it is thinnest, and the step between the two outsides at the seam
  const faces = cr.flatMap(i => [[b.at[i] + b.size[i] / 2, a.at[i] + a.size[i] / 2], [-(b.at[i] - b.size[i] / 2), -(a.at[i] - a.size[i] / 2)]]), sk = Math.min(...faces.map(([fb, fa]) => fb - (fa - k))) - LIP_SIDE, step = Math.max(...faces.map(([fb, fa]) => Math.abs(fb - fa)));
  if (sk < .3 || tb - sk < .2) return { why: `${b.name.toLowerCase()} has no wall to take it (${r1(Math.max(sk, 0))} mm would be left outside the lip)` };
  return { ax, sa, gap, tl: r2(tl), k: r2(k), sk: r2(sk), gw: r2(tb - sk), step: r2(step) };
}
// A part that says it has snap hooks (`snaps`) gets each hook as bodies on it: the beam, the head at its end, and a foot that joins its root
// to the part's wall when the root is not already in the part; the part it catches on gets a catch for each, a ledge on its wall behind the
// head, 0.1 mm from it, with the beam 0.2 mm clear of it.
// The strain a hook may see once, as it is pushed home (%), each with where the figure is from (docs/design-lab.md has the full references).
// Where a resin maker's design guide has a table of snap-fit strains, the figure is the table's. Where none does, it is worked from a
// grade's datasheet by the rule in Bayer's guides (a hook pushed home once may be strained to about 70% of the strain at yield), and
// says so. A grade's own datasheet still decides: these are for a first design.
const BAYER = 'Bayer, Part and Mold Design, table 4-1', DUPONT = 'DuPont, General Design Principles, table 9.04', RULE = (pc, grade) => `70% of the ${pc}% it yields at, ${grade} datasheet`;
export const SNAP_LIMITS = {
  'PC': [4, BAYER], 'PC clear': [4, BAYER], 'PC/ABS': [2.5, BAYER], 'ABS': [1.8, BAYER],
  'POM (acetal)': [6, `${DUPONT}, Delrin 500 used once`], 'PA66 GF30': [1.2, `${DUPONT}, glass-reinforced Zytel, dry`],
  'Tritan': [4.2, RULE(6, 'Eastman Tritan TX1001')], 'PETG': [2.8, RULE(4, 'Eastman Eastar 6763')], 'PP': [7, RULE(10, 'LyondellBasell Moplen HP500N')], 'HIPS': [1, RULE(1.5, 'INEOS Styrolution PS 495F')],
  // acrylic is in no resin maker's table and has no yield point. A design guide gives 2% for a snap-fit used a few times (and says it may be
  // doubled for one used once: not done here, since 4% is most of the 5.5% Plexiglas 8N breaks at)
  'PMMA (acrylic)': [2, 'Maier, PRW Design Guides, typical data for snap-fits: a snap-fit used a few times'] };
export const SNAP_STRAIN = Object.fromEntries(Object.entries(SNAP_LIMITS).map(([resin, [pc]]) => [resin, pc]));
const snapFrom = resin => SNAP_LIMITS[resin]?.[1] || '';
const HEAD = 1.5, LEDGE = 1.5, FOOT = 2.5, wayOf = d => { const v = [0, 0, 0]; v['xyz'.indexOf(d[1])] = d[0] === '-' ? -1 : 1; return v; }, bare = p => featuresOf({ ...p, adds: undefined });
// how far from a point, along a direction, to a part's own material with nothing cut out of it (0 inside it); null when there is none within `max`
function reachTo(p, F, w, d, max) { const at = t => inPart(p, F, [w[0] + d[0] * t, w[1] + d[1] * t, w[2] + d[2] * t], true); if (at(0)) return 0;
  for (let t = .05; t <= max + 1e-9; t += .05) if (at(t)) { let lo = t - .05, hi = t; for (let i = 0; i < 6; i++) { const m = (lo + hi) / 2; if (at(m)) hi = m; else lo = m; } return r2(hi); } return null; }
// one hook of `a` (its snaps S, the hook h) and its catch on `b`, measured off the two bare parts: the bodies, and what was found
function hookBodies(a, b, Fa, Fb, S, h) {
  const A = wayOf(h.along), O = wayOf(h.out), T3 = [0, 1, 2].map(k => (A[k] || O[k] ? 0 : 1)), R = h.at.map((v, k) => v + a.at[k]), pos = (al, o) => R.map((v, k) => v + A[k] * al + O[k] * o);
  const box = (kind, a0, a1, o0, o1, w, own) => ({ kind, shape: 'box', axis: 'z', r: 0, size: [0, 1, 2].map(k => r2(Math.abs(A[k]) * (a1 - a0) + Math.abs(O[k]) * (o1 - o0) + T3[k] * w)), at: pos((a0 + a1) / 2, (o0 + o1) / 2).map((v, k) => r2(v - own.at[k])) });
  const L = S.len, t = S.t, hd = Math.min(HEAD, L / 3), rooted = inPart(a, Fa, pos(-.2, 0), true), gapA = rooted ? 0 : reachTo(a, Fa, pos(-FOOT / 2, t / 2), O, 4), za = L - hd - .1, gapB = b ? reachTo(b, Fb, pos(za - LEDGE / 2, t / 2), O, 4) : null;
  const mine = [box('hook', -SINK, L, -t / 2, t / 2, S.w, a), box('hook', L - hd, L, t / 2 - SINK, t / 2 + S.y, S.w, a)]; if (!rooted && gapA != null) mine.push(box('hook', -FOOT, 0, -t / 2, t / 2 + gapA + SINK, S.w, a));
  const ledge = gapB != null && gapB >= .45 ? box('catch', za - LEDGE, za, t / 2 + .2, t / 2 + gapB + SINK, S.w + 1, b) : null;
  return { mine, ledge, joined: rooted || gapA != null, gapA, gapB, eng: ledge ? r2(Math.min(S.y, gapB) - .2) : 0, hd, pos, O, T3 };
}
// A housing that says it has hinge `knuckles` on a pin gets each as bodies on it: a ring round the pin, bored 0.2 mm over the pin's diameter,
// and a lug that joins the ring to the housing's nearest wall, kept on the housing's own side of the pin so the other half can swing past.
function knuckleBodies(h, pin, Fh, off) {
  const pa = axisOf(pin), cr = [0, 1, 2].filter(k => k !== pa), pd = Math.min(...cr.map(k => pin.size[k])), K = h.knuckles, C = pin.at.map((v, k) => (k === pa ? v + off : v)), wall = r2((K.d - pd - .2) / 2);
  if (pin.shape !== 'cyl' || wall < .6) return { C, pd, pa };
  const ring = { kind: 'knuckle', shape: 'ring', axis: pin.axis, size: [0, 1, 2].map(k => (k === pa ? K.len : K.d)), at: C.map((v, k) => r2(v - h.at[k])), wall };
  // the nearest wall of the housing, out from the pin across it, looked for on the housing's own side of the pin (where the lug will be)
  let g = null, dir = null; for (const c of cr) for (const s of [1, -1]) { const sd = cr.find(k => k !== c), d = [0, 1, 2].map(k => (k === c ? s : 0)), r = reachTo(h, Fh, C.map((v, k) => (k === sd ? v + (h.at[sd] < C[sd] ? -1 : 1) * K.d / 4 : v)), d, K.d / 2 + 3); if (r && (g == null || r < g)) { g = r; dir = d; } }
  if (inPart(h, Fh, C, true)) g = 0; // the pin itself is in the housing's wall
  if (g == null || g < pd / 2 + .3) return { C, pd, pa, ring, g };
  const c = dir.findIndex(Boolean), sd = cr.find(k => k !== c), ss = h.at[sd] < C[sd] ? -1 : 1, a0 = pd / 2 + .7, a1 = g + SINK;
  const lug = a1 - a0 > .2 ? { kind: 'knuckle', shape: 'box', axis: 'z', r: 0, size: [0, 1, 2].map(k => r2(k === pa ? K.len : k === c ? a1 - a0 : K.d / 2 - .3)), at: C.map((v, k) => r2(v + (k === c ? dir[c] * (a0 + a1) / 2 : k === sd ? ss * (K.d / 2 + .3) / 2 : 0) - h.at[k])) } : null;
  return { C, pd, pa, ring, lug, g };
}
// A belt (`around` two round parts lying its way) is drawn round them: its outline (`loop`), its place and its size across are worked out
// from the two, at the height it is set at, so it follows them; where it cannot be (a part not round, one inside the other) it stays a plain ring
// and the check says why.
function runAt(p, ax, lv) { // the radius a round part carries a belt on at a height along its axis, and from where to where that surface runs
  const cr = [0, 1, 2].filter(k => k !== ax); if (!p || !ROUND.has(p.shape) || axisOf(p) !== ax || Math.abs(p.size[cr[0]] - p.size[cr[1]]) > .05) return null;
  const lo = p.at[ax] - p.size[ax] / 2, hi = lo + p.size[ax]; if (!(p.shape === 'cyl' && p.flange)) return { r: p.size[cr[0]] / 2, lo, hi };
  const f0 = p.flange.end === '+' ? hi - p.flange.t : lo, f1 = f0 + p.flange.t; return lv >= f0 - 1e-6 && lv <= f1 + 1e-6 ? { r: p.size[cr[0]] / 2, lo: f0, hi: f1 } : { r: p.flange.body / 2, lo: p.flange.end === '+' ? lo : f1, hi: p.flange.end === '+' ? f0 : hi };
}
function beltOn(p, byId) { // the two wheels (the larger first), the radii, how far apart, the path round them (on their surfaces) and the wrap on the small one
  const ax = axisOf(p), cr = [0, 1, 2].filter(k => k !== ax), a = runAt(byId[p.around[0]], ax, p.at[ax]), b = runAt(byId[p.around[1]], ax, p.at[ax]); if (!a || !b) return { why: `${[byId[p.around[0]], byId[p.around[1]]].filter((q, i) => ![a, b][i]).map(q => (q ? q.name.toLowerCase() : 'a part that is not there')).join(' and ')} is not a round part lying the belt's way` };
  const [P1, s1, P2, s2] = a.r >= b.r ? [byId[p.around[0]], a, byId[p.around[1]], b] : [byId[p.around[1]], b, byId[p.around[0]], a], C = Math.hypot(...cr.map(k => P2.at[k] - P1.at[k]));
  if (C < s1.r + s2.r + .5) return { why: `${P1.name.toLowerCase()} and ${P2.name.toLowerCase()} are ${r1(C)} mm apart, centre to centre, and ${r1(s1.r + s2.r)} mm across between them: they touch` };
  const th = Math.acos((s1.r - s2.r) / C); return { ax, cr, P1, P2, s1, s2, C, th, path: 2 * Math.sqrt(C * C - (s1.r - s2.r) ** 2) + (2 * Math.PI - 2 * th) * s1.r + 2 * th * s2.r, wrap: 2 * th * 180 / Math.PI };
}
function belted(parts) {
  const byId = Object.fromEntries(parts.map(p => [p.id, p]));
  for (const p of parts) { delete p.loop; if (!p.around || p.shape !== 'ring') continue; const G = beltOn(p, byId); if (G.why) continue; const t = p.wall;
    for (const k of G.cr) { const lo = Math.min(G.P1.at[k] - G.s1.r - t, G.P2.at[k] - G.s2.r - t), hi = Math.max(G.P1.at[k] + G.s1.r + t, G.P2.at[k] + G.s2.r + t); p.at[k] = r2((lo + hi) / 2); p.size[k] = r2(hi - lo); }
    const rel = P => toLocal(p, P.at.map((v, k) => (k === G.ax ? 0 : v - p.at[k]))).slice(0, 2).map(v => Math.round(v * 1e3) / 1e3); p.loop = { c: [rel(G.P1), rel(G.P2)], r: [G.s1.r, G.s2.r] }; }
}
function moulded(parts) {
  const byId = Object.fromEntries(parts.map(p => [p.id, p])); for (const p of parts) { delete p.adds; delete p.groove; }
  for (const a of parts) { if (!a.lip) continue; const b = byId[a.lip.into], L = lipPair(a, b); if (L.why || b.groove) continue;
    (a.adds ||= []).push({ kind: 'lip', shape: a.shape === 'cup' ? 'ring' : 'shell', open: 'both', axis: a.axis, size: a.size.map((v, i) => (i === L.ax ? r2(a.lip.h + SINK) : r2(v - 2 * L.k))), at: [0, 1, 2].map(i => (i === L.ax ? r2(L.sa * (a.size[i] + a.lip.h - SINK) / 2) : 0)), wall: L.tl, ...(a.shape === 'shell' ? { r: r2(Math.max((a.r ?? 0) - L.k, 0)) } : {}) });
    b.groove = { h: r2(a.lip.h - L.gap + LIP_TOP), t: L.gw, for: a.id }; }
  for (const a of parts) { if (!a.snaps) continue; const b = byId[a.snaps.into], Fa = bare(a), Fb = bare(b);
    for (const h of a.snaps.hooks) { const H = hookBodies(a, b, Fa, Fb, a.snaps, h); (a.adds ||= []).push(...H.mine); if (H.ledge) (b.adds ||= []).push({ ...H.ledge, for: a.id }); } }
  for (const h of parts) { if (!h.knuckles) continue; const pin = byId[h.knuckles.pin], Fh = bare(h); for (const off of h.knuckles.at) { const K = knuckleBodies(h, pin, Fh, off); if (K.ring) (h.adds ||= []).push(K.ring); if (K.lug) h.adds.push(K.lug); } }
}


// ---- archetypes: a starting assembly drawn to the product's size ---------------------------------------------------------------------------------
const P = (o, i) => cleanPart(o, i);
export function archetype(arch, dims = {}, { mah = null, radio = null, display = null, buttons = null, colour = null } = {}) {
  const c = colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null, parts = [];
  const add = o => parts.push(P({ ...o, colour: o.colour || (o.main && c) || undefined }, parts.length));
  // n screws of one kind as one line of the parts list: one is drawn, the rest are its spots; `pts` are their centres, each lying through the
  // part it holds and into the part that takes its thread. A boss is a screw post on a housing's floor, given by its free end.
  const part = id => parts.find(p => p.id === id), e2 = v => Math.round(v * 5) / 5;
  const screw = (id, name, d, len, axis, pts, o = {}) => add({ id, name, shape: 'cyl', axis, size: axis === 'x' ? [len, d, d] : axis === 'y' ? [d, len, d] : [d, d, len], at: pts[0], resin: 'bought in', process: 'bought in', cost: .02, qty: pts.length, spots: pts.slice(1).map(q => q.map((v, k) => v - pts[0][k])), fix: 'screws', order: 8, lvl: 2, ...o });
  const boss = (id, pts, d) => { const h = part(id); h.bosses = [...(h.bosses || []), ...pts.map(q => ({ at: q.map((v, k) => r2(v - h.at[k])), d }))]; };
  let made = null; // [w, d, h]: the size asked for, as built
  // snap hooks for a cover that closes on another housing half: tried at places round the rim (the middle of each wall first), and kept where
  // a hook is joined, finds a wall to catch on, is clear of every other part and has room to bend; sized so the resin takes the bend
  const snapOn = (ia, ib, want = 4) => { const a = part(ia), b = part(ib), lim = a && SNAP_STRAIN[a.resin]; if (!a || !b || !lim || !floored(a) || !floored(b) || axisOf(a) !== axisOf(b)) return;
    const ax = axisOf(a), sa = a.open === '-' ? -1 : 1, gap = sa * ((b.at[ax] - sa * b.size[ax] / 2) - (a.at[ax] + sa * a.size[ax] / 2)), rootIn = Math.min(6, a.size[ax] - a.wall - FOOT - .5), into = Math.min(8, b.size[ax] - b.wall - .6); if ((b.open === '-' ? -1 : 1) === sa || gap < -.01 || gap > 4 || rootIn < 2 || into < 4.6) return;
    const t = 1, w = 5, len = r1(rootIn + gap + into), Le = len - HEAD, eng = Math.min(.8, Math.floor(lim * .85 * Le * Le / (150 * t) * 10) / 10); if (eng < .4) return;
    const S = { into: ib, len, t, w, y: r2(eng + .2), hooks: [] }, g0 = S.y + .2, Fa = bare(a), Fb = bare(b), others = parts.filter(q => q !== a && q !== b).map(q => { const Fq = featuresOf(q); let sm = null; return [q, Fq, boxOf(q), () => (sm ||= samplesOf(q, Fq))]; }), cand = [];
    // is a body (a box, placed from its part's centre) in another part's material: by a grid through it no wider than 0.5 mm, and by the other part's own surface
    const span = (q, own) => [q.at.map((v, k) => own.at[k] + v - q.size[k] / 2 + .05), q.at.map((v, k) => own.at[k] + v + q.size[k] / 2 - .05)], gridOf = ([lo, hi]) => { const m = lo.map((v, k) => Math.max(2, Math.ceil((hi[k] - v) / .5))), pts = []; for (let i = 0; i <= m[0]; i++) for (let j = 0; j <= m[1]; j++) for (let k = 0; k <= m[2]; k++) pts.push([lo[0] + (hi[0] - lo[0]) * i / m[0], lo[1] + (hi[1] - lo[1]) * j / m[1], lo[2] + (hi[2] - lo[2]) * k / m[2]]); return pts; };
    const inOthers = sp => others.some(([q, Fq, Bq, sm]) => !sp[0].some((v, k) => Bq.hi[k] < v || Bq.lo[k] > sp[1][k]) && (sm().some(p3 => p3.every((v, k) => v > sp[0][k] && v < sp[1][k])) || gridOf(sp).some(p3 => inPart(q, Fq, p3))));
    for (const fr of [0, .5, -.5, .25, -.25, .75, -.75]) for (const c of [0, 1, 2]) { if (c === ax) continue; const d = 3 - ax - c, flat = a.shape === 'cup' ? 0 : a.size[d] / 2 - (a.r ?? 0) - w / 2 - 1; if (fr && flat < 8) continue;
      for (const s of [1, -1]) { const at = [0, 0, 0]; at[c] = r2(s * (a.size[c] / 2 - a.wall - g0 - t / 2)); at[d] = r2(fr * flat); at[ax] = r2(sa * (a.size[ax] / 2 - rootIn)); cand.push({ at, along: `${sa < 0 ? '-' : '+'}${AXN[ax]}`, out: `${s < 0 ? '-' : '+'}${AXN[c]}` }); } }
    for (const h of cand) { if (S.hooks.length >= want) break; const H = hookBodies(a, b, Fa, Fb, S, h); if (!H.joined || !H.ledge || H.gapB < S.y + .15 || S.hooks.some(o => Math.hypot(...o.at.map((v, k) => v - h.at[k])) < 15)) continue;
      const bend = [.5, .75, 1].flatMap(f => [-.4, 0, .4].map(tw => H.pos(len * f, -t / 2 - (eng + .3) * f * f).map((v, i) => v + H.T3[i] * tw * w))), root = H.pos(1, 0), al = wayOf(h.along), past = p3 => p3.reduce((s, v, k) => s + (v - root[k]) * al[k], 0) > 0;
      if (H.mine.some(q => inOthers(span(q, a))) || inOthers(span(H.ledge, b)) || bend.some(p3 => others.some(([q, Fq]) => inPart(q, Fq, p3)) || inPart(a, Fa, p3, true) || inPart(b, Fb, p3, true))) continue;
      if (H.mine.slice(0, 2).some(q => gridOf(span(q, a)).some(p3 => inPart(b, Fb, p3, true) || (past(p3) && inPart(a, Fa, p3, true)))) || gridOf(span(H.ledge, b)).some(p3 => inPart(a, Fa, p3, true))) continue; // nor in the two halves themselves (their bosses stand solid)
      S.hooks.push(h); }
    if (S.hooks.length >= 2) a.snaps = S; };
  const elec = (kind, o) => { const e = ELEC[kind]; add({ name: e.name, shape: e.round ? 'cyl' : 'box', size: o.size || e.size, resin: 'bought in', process: 'bought in', cost: e.cost, fix: kind === 'speaker' ? 'screws' : kind === 'battery' ? 'adhesive' : 'solder', fixQty: kind === 'speaker' ? 2 : 0, elec: { kind }, r: .3, ...o }); };
  if (arch === 'puck') {
    // a round device: a bottom housing on its foot with the cell and the board on three bosses, a light ring between the halves that shows
    // all the way round, and a top cover carrying the speaker under its grille, with the keys through it
    const D = num(dims.w, 50, 300, 96), H = num(dims.h, 25, 200, 48), w = 2, zb = 1.5, sh = e2(Math.max(5, Math.min(12, H * .25))), ht = e2(Math.max((H - zb - 3) * .36, sh + w + 1)), hb = e2(H - zb - 3 - ht), rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble', side = (D - 2 * w) * .68, mA = fitCell(mah || 2000, [side, side, Math.max(4, hb - w - 6)], Boolean(mah)), cell = cellOf(mA);
    made = [D, D, H];
    add({ id: 'bottom', name: 'Bottom housing', shape: 'cup', size: [D, D, hb], at: [0, 0, zb + hb / 2], wall: w, open: '+', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foot', name: 'Non-slip foot', shape: 'cyl', size: [D - 12, D - 12, 1.5], at: [0, 0, .75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
    const pz = zb + w + .2 + cell.size[2] + 2.3, top = pz + 1.6, pr = (D - 2 * w - 3) / 2 - 4, pb = [45, 165, 285].map(a => [pr * Math.cos(a * Math.PI / 180), pr * Math.sin(a * Math.PI / 180)]);
    screw('screws', 'Screw, M2 × 6 self-tapping', 2, 6, 'z', pb.map(q => [...q, top + 1 - 3]), { parent: 'pcb', through: ['pcb'], order: 3, lvl: 2 });
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: cell.size, at: [0, 0, zb + w + .2 + cell.size[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'battery', mah: mA }, lvl: .6 });
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [D - 2 * w - 3, D - 2 * w - 3, 1.6], r: D, at: [0, 0, pz + .8], fix: 'screws', fixQty: 3, order: 3, parent: 'bottom', lvl: 1.4, layers: rad === 'wifi' ? 4 : 2 });
    boss('bottom', pb.map(q => [...q, pz]), 2);
    elec(rad, { at: [-(D / 2 - 2 * w - 12), 0, top + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('usbc', { at: [D / 2 - w - 5, 0, top + 1.6], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('charger', { at: [D / 2 - w - 14, 8, top + .5], parent: 'pcb', order: 3, lvl: 1.7 }); elec('reg', { at: [D / 2 - w - 14, -8, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('amp', { at: [-6, -16, top + .4], parent: 'pcb', order: 3, lvl: 1.7 }); elec('mic', { at: [6, -18, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('led', { at: [0, D / 2 - w - 6, top + .3], parent: 'pcb', order: 3, lvl: 1.7, qty: 8 });
    const sd = Math.min(52, D - 30), ceil = H - w, sx = sd / 2 - 4;
    elec('speaker', { size: [sd, sd, sh], at: [0, 0, ceil - .5 - sh / 2], parent: 'top', order: 5, lvl: 3, dir: [0, 0, 1] });
    add({ id: 'pipe', name: 'Light ring', shape: 'ring', size: [D, D, 3], at: [0, 0, zb + hb + 1.5], wall: w + 1.2, resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'press', order: 4, lvl: 2.2 });
    add({ id: 'top', name: 'Top cover with grille', shape: 'cup', size: [D, D, ht], at: [0, 0, H - ht / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'snap', order: 6, lvl: 4, main: true });
    const nb = Math.round(num(buttons ?? undefined, 0, 6, 3)), sp = Math.min(14, D * .17), kd = Math.min(9, sp - 2.5);
    for (let i = 0; i < nb; i++) add({ id: `key${i + 1}`, name: `Button ${i + 1}`, shape: 'cyl', size: [kd, kd, w + .2], at: [(i - (nb - 1) / 2) * sp, D * .28, H - (w + .2) / 2], resin: 'silicone (LSR)', process: 'LSR moulding', through: ['top'], fix: 'press', order: 5, parent: null, lvl: 5.2 });
    screw('screws-spk', `Screw, M2 × ${Math.round(sh + 1.5)} (speaker)`, 2, sh + 1.7, 'z', [[-sx, 0, ceil - .5 - sh + (sh + 1.7) / 2], [sx, 0, ceil - .5 - sh + (sh + 1.7) / 2]], { order: 5, lvl: 2.6 });
  } else if (arch === 'handheld') {
    // a handheld: two shells closed by four screws that come up through the bottom's bosses and the board into the top's bosses, the cell
    // under the board, the keypad and the status window through the top, the USB-C port at the bottom end
    const W = num(dims.w, 25, 200, 46), Lg = num(dims.d, 50, 300, 128), H = num(dims.h, 8, 80, 18), w = 1.6, rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble', hb = e2(H / 2), room = [W - 2 * w - 2, Lg - 2 * w - 13, hb - w - .5], mA = fitCell(mah || 1200, room, Boolean(mah)), cell = cellOf(mA);
    made = [W, Lg, H];
    add({ id: 'bottom', name: 'Bottom housing', shape: 'shell', size: [W, Lg, hb], at: [0, 0, hb / 2], r: 8, wall: w, open: '+', lip: { into: 'top' }, resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1.5, undercuts: 1, order: 1, lvl: 0, main: true });
    const pz = hb + .2, bxs = W / 2 - w - 4, bys = Lg / 2 - w - 5, sl = e2(Math.min(hb + 4.2, 20)), sp4 = [[-bxs, -bys], [bxs, -bys], [bxs, bys], [-bxs, bys]];
    screw('screws', `Screw, M2 × ${Math.round(sl)} self-tapping`, 2, sl, 'z', sp4.map(q => [...q, pz + 1 + 3 - sl / 2]), { parent: 'pcb', through: ['bottom', 'pcb'], dir: [0, 0, -1], lvl: 2 });
    const bs = cell.size[1] > room[1] || cell.size[0] > room[0] ? [cell.size[1], cell.size[0], cell.size[2]] : cell.size; // turned to lie along the handheld when that fits better
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: bs, at: [0, -Lg / 2 + w + 11 + bs[1] / 2, w + .2 + bs[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'battery', mah: mA }, lvl: .7 });
    // the board runs the length of the inside: the status light at the top, the keys below it, then the radio module and the power parts,
    // and the USB-C port at the bottom end
    const nb = Math.round(num(buttons ?? undefined, 0, 12, 4)), rows = Math.ceil(nb / 2), ly = Lg / 2 - w - 8, key0 = Math.min(Lg * .28, ly - 9), ms = ELEC[rad].size;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [W - 2 * w - 1.5, Lg - 2 * w - 3, 1], r: 6, at: [0, 0, pz + .5], fix: 'screws', fixQty: 4, order: 3, parent: 'bottom', lvl: 1.4, layers: rad === 'wifi' ? 4 : 2 });
    boss('bottom', sp4.map(q => [...q, pz]), 2);
    const top = pz + 1, my = key0 - Math.max(rows - 1, 0) * 12 - (rows ? 5 : 0) - ms[1] / 2;
    elec(rad, { at: [0, my, top + ms[2] / 2], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('usbc', { at: [0, -(Lg / 2 - w - 3.75 + .2), pz - 1.6 + .1], parent: 'pcb', order: 3, lvl: 1.7 }); elec('charger', { at: [ms[0] / 2 + 4, my, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('reg', { at: [-(ms[0] / 2 + 4), my, top + .5], parent: 'pcb', order: 3, lvl: 1.7 }); elec('led', { at: [0, ly, top + .3], parent: 'pcb', order: 3, lvl: 1.7 });
    if (nb) { for (let i = 0; i < nb; i++) elec('button', { at: [(i % 2 ? 1 : -1) * W * .18, key0 - Math.floor(i / 2) * 12, top + 1.75], parent: 'pcb', order: 3, lvl: 1.7 }); add({ id: 'keypad', name: 'Keypad', shape: 'box', size: [W * .6, rows * 12, w + .4], r: 2, at: [0, key0 - (rows - 1) * 6, H - (w + .4) / 2], resin: 'silicone (LSR)', process: 'LSR moulding', through: ['top'], fix: 'place', order: 4, lvl: 2.6 }); }
    add({ id: 'lens', name: 'Status window', shape: 'box', size: [10, 4, w], r: 1, at: [0, ly, H - w / 2], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, through: ['top'], fix: 'adhesive', order: 7, lvl: 4.2 });
    add({ id: 'top', name: 'Top housing', shape: 'shell', size: [W, Lg, H - hb], at: [0, 0, hb + (H - hb) / 2], r: 8, wall: w, open: '-', resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1.5, undercuts: 0, fix: 'snap', order: 6, lvl: 3.4, main: true });
    boss('top', sp4.map(q => [...q, pz + 1]), 2);
  } else if (arch === 'desk') {
    // a desk device: front and back shells on four feet, closed by four screws from the back that run through the back's bosses and the
    // board into the front's; the display behind its lens in the front, the board standing at the back with the USB-C through the back wall
    const W = num(dims.w, 60, 400, 140), D = num(dims.d, 30, 300, 70), H = num(dims.h, 40, 300, 86), w = 2, zb = 1.5, Hs = e2(H - zb), zc = zb + Hs / 2, rad = radio === 'none' ? 'mcu' : radio === 'ble' ? 'ble' : 'wifi', disp = display === 'oled' || (display !== 'lcd' && (H < 75 || W < 80)) ? 'oled' : 'lcd';
    const df = e2(D * .4), db = D - df, ds = ELEC[disp].size;
    made = [W, D, H];
    add({ id: 'front', name: 'Front housing', shape: 'shell', axis: 'y', size: [W, df, Hs], at: [0, -D / 2 + df / 2, zc], r: 6, wall: w, open: '+', resin: 'PC/ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 0, fix: 'snap', order: 6, dir: [0, -1, 0], lvl: 3, main: true });
    add({ id: 'lens', name: 'Display lens', shape: 'box', axis: 'y', size: [Math.min(W - 24, ds[1] + 10), w, Math.min(Hs - 24, ds[0] + 10)], r: 2, at: [0, -D / 2 + w / 2, zc + Math.max(0, Math.min(4, (Hs - 2 * w - ds[0]) / 2 - .5))], resin: 'PC clear', finish: 'SPI A-2 (high gloss)', draft: .5, through: ['front'], fix: 'adhesive', order: 7, dir: [0, -1, 0], lvl: 4.4 });
    add({ id: 'display', name: ELEC[disp].name, shape: 'box', axis: 'y', size: [ds[1], ds[2], ds[0]], r: .5, at: [0, -D / 2 + w + ds[2] / 2 + .2, zc + Math.max(0, Math.min(4, (Hs - 2 * w - ds[0]) / 2 - .5))], resin: 'bought in', process: 'bought in', cost: ELEC[disp].cost, elec: { kind: disp }, fix: 'adhesive', order: 5, parent: 'front', dir: [0, -1, 0], lvl: 2 });
    const py = D / 2 - w - 7.5 - 1.1; /* the board stands at the back, so the USB-C port reaches the back wall */ add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'y', size: [W - 2 * w - 4, 1.6, Hs - 2 * w - 4], r: 5, at: [0, py, zc], fix: 'screws', fixQty: 4, order: 3, parent: 'back', dir: [0, 1, 0], lvl: 1, layers: 4 });
    const bk = py + .8; elec(rad, { size: [ELEC[rad].size[0], ELEC[rad].size[2], ELEC[rad].size[1]], axis: 'y', at: [W * .25, bk + ELEC[rad].size[2] / 2, zb + Hs * .62], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('usbc', { size: [9, 7.5, 3.2], at: [-W * .3, bk + 3.75, zb + w + 3.6], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('reg', { size: [3, 1, 3], axis: 'y', at: [-W * .2, bk + .5, zc], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 }); elec('env', { size: [2.5, .9, 2.5], axis: 'y', at: [-W * .32, bk + .45, zb + Hs * .7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('button', { size: [6, 6, 3.5], at: [W * .3, Math.min(D * .05, py - 4.3), H - w - .3 - 1.75], parent: 'back', order: 4, dir: [0, 0, 1], lvl: 1.6 });
    add({ id: 'back', name: 'Back housing', shape: 'shell', axis: 'y', size: [W, db, Hs], at: [0, D / 2 - db / 2, zc], r: 6, wall: w, open: '-', lip: { into: 'front' }, resin: 'PC/ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'place', order: 1, dir: [0, 1, 0], lvl: 0, main: true });
    const cx = W / 2 - w - 5, cz = Hs / 2 - w - 5, c4 = [[cx, zc + cz], [-cx, zc + cz], [-cx, zc - cz], [cx, zc - cz]], sl = e2(Math.min(D / 2 - py + 5, 30));
    screw('screws', `Screw, M2 × ${Math.round(sl)} self-tapping`, 2, sl, 'y', c4.map(q => [q[0], D / 2 - sl / 2, q[1]]), { parent: 'pcb', through: ['back', 'pcb'], dir: [0, 1, 0], lvl: 2.5 });
    boss('back', c4.map(q => [q[0], py + .8, q[1]]), 2); boss('front', c4.map(q => [q[0], py - .8, q[1]]), 2);
    const fx = W * .35, fy = D * .3;
    add({ id: 'feet', name: 'Foot pad', shape: 'cyl', size: [10, 10, 1.5], at: [fx, fy, .75], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, spots: [[-2 * fx, 0, 0], [-2 * fx, -2 * fy, 0], [0, -2 * fy, 0]], fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'cdplayer') {
    // a hi-fi component: a stamped steel chassis on four feet inside a steel cover that wraps over it, an aluminium front panel; the CD
    // loader's face comes through the panel, the mains supply sits at the back left, the main board at the back right with the line
    // outputs through the back, the display behind its window, and the buttons' caps reach through the panel to their switches
    const W = num(dims.w, 290, 500, 430), D = num(dims.d, 230, 450, 300), H = num(dims.h, 60, 160, 88), w = 1, so = 6, fh = 10, rad = radio === 'ble' ? 'ble' : radio === 'wifi' ? 'wifi' : 'mcu', cm = ELEC.cdmech.size, ant = rad !== 'mcu' ? 12 : 0;
    const Hc = e2(H - fh), yf = -D / 2 + 9.5, yb = D / 2 - ant, Dc = e2(yb - yf), yc = (yf + yb) / 2, cw = W - 2.4, cd = Dc - 2.4, ch = Hc - 1.2, x0c = -cw / 2, yf2 = yc - cd / 2, yb2 = yc + cd / 2; // the cover's box, and the chassis 1.2 mm inside it all round
    const steel = { resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', r: 1, wall: w };
    made = [W, D, H];
    add({ id: 'chassis', name: 'Chassis', shape: 'shell', size: [cw, cd, ch], at: [0, yc, fh + ch / 2], open: '+', ...steel, fix: 'place', order: 1, lvl: 0, main: true });
    const fx = W * .4, fy = Dc * .35, feet = [[fx, yc + fy], [-fx, yc + fy], [-fx, yc - fy], [fx, yc - fy]];
    add({ id: 'feet', name: 'Foot', shape: 'cup', size: [36, 36, fh], at: [...feet[0], fh / 2], wall: 2, open: '+', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, qty: 4, spots: feet.slice(1).map(q => [q[0] - feet[0][0], q[1] - feet[0][1], 0]), fix: 'screws', fixQty: 1, order: 2, dir: [0, 0, -1], lvl: 1 });
    const zf = fh + w, px0 = x0c + w + 6 + 50, py0 = yb2 - w - 8 - 30, lx = x0c + w + 4 + cm[0] / 2, lyc = -D / 2 + 1.5 + cm[1] / 2;
    elec('psu', { at: [px0, py0, zf + so + 15], parent: 'chassis', fix: 'screws', fixQty: 4, order: 2, lvl: 1 });
    elec('iec', { at: [x0c + w + 6 + 100 + 30, yb - 10, zf + so + 20], parent: 'chassis', fix: 'snap', order: 2, dir: [0, 1, 0], lvl: 1 });
    elec('cdmech', { at: [lx, lyc, zf + so + cm[2] / 2], parent: 'panel', through: ['panel', 'cover', 'chassis'], fix: 'screws', fixQty: 4, order: 3, lvl: 1.4 });
    const x0 = x0c + w + 6 + 104, x1 = cw / 2 - w - 4, y0 = lyc + cm[1] / 2 + 4, y1 = yb2 - w - 3, pw = x1 - x0, pd = y1 - y0, px = (x0 + x1) / 2, py = (y0 + y1) / 2, top = zf + so + 1.6; // behind the loader, right of the supply
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [pw, pd, 1.6], at: [px, py, zf + so + .8], fix: 'screws', fixQty: 4, order: 3, parent: 'chassis', lvl: 1.1 });
    elec(rad, { at: [px - pw * .2, py, top + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: 1.3 }); elec('dac', { at: [px + pw * .1, py - pd * .2, top + .6], parent: 'pcb', order: 3, lvl: 1.3 });
    elec('reg', { at: [px + pw * .3, py + pd * .1, top + .5], parent: 'pcb', order: 3, lvl: 1.3 }); elec('rca', { at: [px + pw * .25, yb - 7, top + 7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    const dx = cw / 2 - w - 12 - 55, dz = fh + Hc * .62, kz = fh + Hc * .28, kx = W * .3 - 32, k5 = [1, 2, 3, 4].map(i => [i * 16, 0, 0]), yin = yf2 + w + .3;
    if (ant) elec('antenna', { axis: 'y', at: [W / 2 - 40, yb + 1, fh + Hc * .6], parent: 'cover', fix: 'press', order: 8, dir: [0, 1, 0], lvl: 3.4 }); // a steel case: the radio needs its antenna outside
    elec('vfd', { axis: 'y', size: [110, 6, 26], at: [dx, yin + 3, dz], parent: 'chassis', fix: 'screws', fixQty: 2, order: 4, dir: [0, -1, 0], lvl: .6 });
    elec('ir', { at: [cw / 2 - w - 6.3, yin + 3, dz], parent: 'chassis', fix: 'adhesive', order: 4, dir: [0, -1, 0], lvl: .6 });
    elec('button', { name: 'Tact switches (play, pause, stop, skip, open)', qty: 5, spots: k5, size: [6, 3.5, 6], at: [kx, yin + 1.75, kz], parent: 'chassis', order: 4, dir: [0, -1, 0], lvl: .6 });
    add({ id: 'cover', name: 'Top cover', shape: 'shell', size: [W, Dc, Hc], at: [0, yc, fh + Hc / 2], open: '-', ...steel, fix: 'screws', fixQty: 6, order: 7, lvl: 3.2, main: true });
    add({ id: 'panel', name: 'Front panel', shape: 'box', axis: 'y', size: [W, 8, Hc], r: 1, at: [0, yf - 4, fh + Hc / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: r2(4 + W * H / 1e4 * 1.2), finish: 'anodised', fix: 'screws', fixQty: 4, order: 8, dir: [0, -1, 0], lvl: 1.6 });
    add({ id: 'window', name: 'Display window', shape: 'box', axis: 'y', size: [100, yin - (yf - 8), 20], r: 2, at: [dx, (yin + yf - 8) / 2, dz], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, parent: 'panel', through: ['panel', 'cover', 'chassis'], fix: 'adhesive', order: 9, dir: [0, -1, 0], lvl: 2.4 });
    add({ id: 'caps', name: 'Button caps', shape: 'box', axis: 'y', size: [12, yin + D / 2, 8], r: 1, at: [kx, (yin - D / 2) / 2, kz], resin: 'aluminium 6061', process: 'CNC machined', cost: .3, finish: 'anodised', qty: 5, spots: k5, through: ['panel', 'cover', 'chassis'], fix: 'press', order: 9, dir: [0, -1, 0], lvl: 2.4 });
    const st = (cx, cy, hw, hd) => [[cx - hw, cy - hd], [cx + hw, cy - hd], [cx + hw, cy + hd], [cx - hw, cy + hd]], so12 = [...st(px0, py0, 44, 24), ...st(lx, lyc + 6, 68, 58), ...st(px, py, pw / 2 - 5, pd / 2 - 5)];
    add({ id: 'standoffs', name: 'Standoff, M3 × 6, pressed into the chassis', shape: 'cyl', size: [5.5, 5.5, so], at: [...so12[0], zf + so / 2], resin: 'bought in', process: 'bought in', cost: .04, qty: 12, spots: so12.slice(1).map(q => [q[0] - so12[0][0], q[1] - so12[0][1], 0]), fix: 'press', order: 2, lvl: .6 });
    screw('screws-floor', 'Screw, M3 × 10 (supply, loader and board, up through the chassis and its standoffs)', 3, 10, 'z', so12.map(q => [...q, fh + 5]), { through: ['chassis', 'pcb'], dir: [0, 0, -1], lvl: 2 });
    screw('screws-feet', 'Screw, M3 × 12 (feet)', 3, 12, 'z', feet.map(q => [...q, 6]), { through: ['feet', 'chassis'], dir: [0, 0, -1], lvl: 2.6 });
    screw('screws-vfd', 'Screw, M3 × 6 (display)', 3, 6, 'y', [[dx - 52.5, yf + 3, dz], [dx + 52.5, yf + 3, dz]], { through: ['cover', 'chassis'], dir: [0, -1, 0], lvl: 1.2 });
    screw('screws-panel', 'Screw, M3 × 8 (front panel)', 3, 8, 'y', [[-W * .45, yin - .3 - 4, fh + 8], [W * .45, yin - .3 - 4, fh + 8], [-W * .45, yin - .3 - 4, H - 8], [W * .45, yin - .3 - 4, H - 8]], { through: ['cover', 'chassis'], dir: [0, 1, 0], lvl: 1.2 });
    screw('screws-cover', 'Screw, M3 × 6 (cover)', 3, 6, 'x', [-1, 1].flatMap(sx => [-.3, 0, .3].map(k => [sx * (W / 2 - 3), yc + k * Dc, fh + Hc * .5])), { through: ['cover', 'chassis'], dir: [1, 0, 0], lvl: 3.6 });
  } else if (arch === 'cassette') {
    // a portable cassette player standing up: the transport behind a clear door in the front, two AA cells beside it, the board on three
    // bosses behind both, the keys through the top, the headphone jack on top and the volume wheel through the right side, a belt clip
    const W = num(dims.w, 120, 220, 136), D = num(dims.d, 26, 70, 34), H = num(dims.h, 75, 180, 90), w = 1.6, Dh = e2(D - 2.5), df = e2(Dh / 2), Hs = H - 4, y0 = -D / 2, ym = y0 + df, yb = y0 + Dh, ms = ELEC.tapemech.size;
    const mx = -W / 2 + w + 2.5 + ms[0] / 2, my = y0 + w + .3 + ms[1] / 2, mz = Math.max(w + 2.5 + ms[2] / 2, Hs / 2 + 1);
    made = [W, D, H];
    add({ id: 'back', name: 'Back housing', shape: 'shell', axis: 'y', size: [W, Dh - df, Hs], r: 6, at: [0, (ym + yb) / 2, Hs / 2], wall: w, open: '-', lip: { into: 'front' }, resin: 'ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'place', order: 1, dir: [0, 1, 0], lvl: 1.6, main: true });
    elec('aa', { at: [W / 2 - w - 2.5 - 14.5, y0 + w + .3 + 7.25, w + 2.5 + 25], parent: 'front', fix: 'place', order: 2, dir: [0, -1, 0], lvl: 1.4, elec: { kind: 'aa', mah: mah || 2500 } });
    elec('tapemech', { at: [mx, my, mz], parent: 'front', fix: 'screws', fixQty: 3, order: 3, dir: [0, -1, 0], lvl: 1.6 });
    const by = my + ms[1] / 2 + 1.5, bh = Hs - 2 * w - 22, pz = w + 2 + bh / 2, bk = by + .5, bw = W - 2 * w - 4;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'y', size: [bw, 1, bh], r: 5, at: [0, by, pz], fix: 'screws', fixQty: 3, order: 4, parent: 'back', dir: [0, 1, 0], lvl: .4 });
    const back = (k, x, z) => { const e = ELEC[k].size; elec(k, { axis: 'y', size: [e[0], e[2], e[1]], at: [x, bk + e[2] / 2, z], parent: 'pcb', order: 4, dir: [0, 1, 0], lvl: .7 }); };
    back('preamp', -W * .25, pz + 10); back('hpamp', W * .18, pz + 10); back('mcu', 0, pz - 8); back('reg', W * .3, pz - 12);
    const kw = W * .5, kx = -W * .15, kyc = by + 3, kz0 = Hs - w - 2;
    elec('jack', { at: [W / 2 - w - 14, kyc + 2, Hs - 7], order: 5, dir: [0, 0, 1], lvl: .8 });
    elec('pot', { size: [6, 6, 16], at: [W / 2 - 3, kyc + 3, Hs * .7], through: ['back', 'front'], order: 5, dir: [1, 0, 0], lvl: .8 });
    elec('button', { name: 'Tact switches (play, stop, rewind, fast-forward, record)', qty: 5, spots: [1, 2, 3, 4].map(i => [i * kw / 5, 0, 0]), at: [kx - kw * .4, kyc, kz0 - .1 - 1.75], order: 5, dir: [0, 0, 1], lvl: .6 });
    add({ id: 'keys', name: 'Keys', shape: 'shell', size: [kw, 8, H - kz0], r: 1.5, at: [kx, kyc, (H + kz0) / 2], wall: 1.5, open: '-', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, through: ['back', 'front'], fix: 'place', order: 6, dir: [0, 0, 1], lvl: 1.4 });
    add({ id: 'front', name: 'Front housing', shape: 'shell', axis: 'y', size: [W, df, Hs], r: 6, at: [0, (y0 + ym) / 2, Hs / 2], wall: w, open: '+', resin: 'ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'snap', order: 7, dir: [0, -1, 0], lvl: 2.6, main: true });
    add({ id: 'door', name: 'Cassette door with window', shape: 'box', axis: 'y', size: [ms[0] - 16, w, ms[2] - 12], r: 3, at: [mx, y0 + w / 2, mz], resin: 'PC clear', finish: 'SPI A-2 (high gloss)', draft: .5, undercuts: 1, through: ['front'], fix: 'snap', order: 8, dir: [0, -1, 0], lvl: 3.4 });
    add({ id: 'clip', name: 'Belt clip', shape: 'box', axis: 'y', size: [36, 2.5, 50], r: 3, at: [0, D / 2 - 1.25, Hs * .55], resin: 'POM (acetal)', finish: 'SPI C-1 (matte)', draft: 1, fix: 'screws', fixQty: 2, order: 9, dir: [0, 1, 0], lvl: 2.6 });
    const b3 = [[-(bw / 2 - 5), pz + bh / 2 - 5], [bw / 2 - 5, pz + bh / 2 - 5], [0, pz - bh / 2 + 4]];
    boss('back', b3.map(q => [q[0], by + .5, q[1]]), 2);
    screw('screws-board', 'Screw, M2 × 5 (board)', 2, 5, 'y', b3.map(q => [q[0], by - .5 - 1 + 2.5, q[1]]), { parent: 'pcb', through: ['pcb'], dir: [0, -1, 0], lvl: 1 });
    screw('screws-deck', 'Screw, M2 × 18 (transport)', 2, 18, 'y', [[mx - ms[0] / 2 + 4, y0 + .6 + 9, mz], [mx + ms[0] / 2 - 4, y0 + .6 + 9, mz], [mx, y0 + .6 + 9, mz + ms[2] / 2 - 3]], { dir: [0, 1, 0], lvl: 2 });
    screw('screws-clip', 'Screw, M2 × 4 countersunk (belt clip)', 2, 4, 'y', [[-10, D / 2 - 2, Hs * .55 + 15], [10, D / 2 - 2, Hs * .55 + 15]], { through: ['clip'], dir: [0, 1, 0], lvl: 3.2 });
  } else if (arch === 'speaker') {
    // a powered bookshelf speaker: an MDF cabinet open at the front, closed by the baffle that carries the woofer and tweeter behind a
    // grille; the amplifier board stands on standoffs off the back, with the mains inlet, line input, volume and bass port through the back
    const W = num(dims.w, 130, 400, 170), D = num(dims.d, 190, 450, 230), H = num(dims.h, 220, 600, 280), t = 15, bf = 18, gr = 10, kn = 16, zb = 2, Hs = H - zb, y0 = -D / 2, yb = D / 2 - kn, cdp = e2(yb - y0 - gr - bf), rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble';
    const area = 2 * (W * Hs + D * Hs + W * D) / 1e6, wd = Math.max(70, Math.min(130, W - 34, Hs - 2 * t - 100)), tz = H - t - 46, wz = Math.max(zb + t + 5 + wd / 2, Math.min(zb + Hs * .36, tz - 45 - wd / 2 - 5)); // the tweeter at the top, the woofer below it with 5 mm between
    made = [W, D, H];
    add({ id: 'cab', name: 'Cabinet', shape: 'shell', axis: 'y', size: [W, cdp, Hs], r: 3, at: [0, yb - cdp / 2, zb + Hs / 2], wall: t, open: '-', resin: 'MDF', process: 'CNC routed', cost: r2(4.5 + area * 11), finish: 'none', fix: 'glue', order: 1, lvl: 0, main: true });
    const fx = W * .35, fy = D * .3;
    add({ id: 'feet', name: 'Foot pad', shape: 'cyl', size: [16, 16, 2], at: [fx, fy, 1], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, spots: [[-2 * fx, 0, 0], [-2 * fx, -2 * fy, 0], [0, -2 * fy, 0]], fix: 'adhesive', order: 2, dir: [0, 0, -1], lvl: 1.2 });
    const psy = yb - t - 37;
    elec('psu', { at: [0, psy, zb + t + .2 + 15], parent: 'cab', fix: 'screws', fixQty: 4, order: 2, lvl: 3.6 }); // the inside lifts out of the top in the exploded view
    const py = yb - t - 10, bhh = Math.min(Hs * .45, H - 2 * t - Math.min(50, W - 2 * t - 50) - 55 - zb), pz = zb + t + 44 + bhh / 2, ff = py - .8, bw = W - 2 * t - 6;
    add({ id: 'pcb', name: 'Amplifier board', shape: 'pcb', axis: 'y', size: [bw, 1.6, bhh], at: [0, py, pz], fix: 'screws', fixQty: 4, order: 3, parent: 'cab', lvl: 4.6, layers: 4 });
    const front = (k, x, z) => { const e = ELEC[k].size; elec(k, { axis: 'y', size: [e[0], e[2], e[1]], at: [x, ff - e[2] / 2, z], parent: 'pcb', order: 3, lvl: 4.6 }); };
    front('amp2', -W * .16, pz - bhh * .18); front(rad, W * .15, pz + bhh * .27); front('dac', W * .16, pz - bhh * .13); front('reg', -W * .2, pz + bhh * .3);
    elec('iec', { at: [-W * .2, yb - 10, zb + t + 16], parent: 'cab', fix: 'snap', order: 3, dir: [0, 1, 0], lvl: 1.2 });
    elec('rca', { at: [W * .12, yb - 7, zb + t + 14], parent: 'cab', fix: 'press', order: 3, dir: [0, 1, 0], lvl: 1.2 });
    elec('encoder', { at: [W * .12, yb - 10, zb + t + 34], through: ['cab'], fix: 'press', order: 3, dir: [0, 1, 0], lvl: 1.2 });
    add({ id: 'knob', name: 'Volume knob', shape: 'cyl', axis: 'y', size: [24, kn, 24], at: [W * .12, yb + kn / 2, zb + t + 34], resin: 'aluminium 6061', process: 'CNC machined', cost: 1.2, finish: 'anodised', fix: 'press', order: 9, lvl: 5.4 });
    const pl = Math.min(110, cdp - 30), pdia = Math.min(50, W - 2 * t - 50);
    add({ id: 'port', name: 'Bass port tube', shape: 'ring', axis: 'y', size: [pdia, pl, pdia], wall: 2.5, at: [-W / 2 + t + 8 + pdia / 2, yb - pl / 2, H - t - 8 - pdia / 2], resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, through: ['cab'], fix: 'glue', order: 4, lvl: 6 });
    add({ id: 'baffle', name: 'Baffle', shape: 'box', axis: 'y', size: [W, bf, Hs], r: 3, at: [0, y0 + gr + bf / 2, zb + Hs / 2], resin: 'MDF', process: 'CNC routed', cost: r2(1.5 + W * Hs / 1e6 * 11), finish: 'none', fix: 'glue', order: 6, dir: [0, -1, 0], lvl: 1.2 });
    const wdep = Math.min(70, cdp - t - 70), yf = y0 + gr, wb = e2(wd * .82); // each driver's flange lies on the baffle's face, its body goes through
    elec('woofer', { axis: 'y', size: [wd, wdep, wd], flange: { body: wb, t: 4, end: '-' }, at: [0, yf - 4 + wdep / 2, wz], parent: 'baffle', through: ['baffle'], fix: 'screws', fixQty: 4, order: 7, dir: [0, -1, 0], lvl: 1.8 });
    elec('tweeter', { axis: 'y', size: [80, 40, 80], flange: { body: 60, t: 3, end: '-' }, at: [0, yf - 3 + 20, tz], parent: 'baffle', through: ['baffle'], fix: 'screws', fixQty: 4, order: 7, dir: [0, -1, 0], lvl: 1.8 });
    add({ id: 'grille', name: 'Grille (cloth on a frame)', shape: 'shell', axis: 'y', size: [W - 4, gr, Hs - 4], r: 3, at: [0, y0 + gr / 2, zb + Hs / 2], wall: 2, open: '+', resin: 'ABS', finish: 'none', draft: 1, fix: 'press', order: 10, dir: [0, -1, 0], lvl: 2.8 });
    const so4 = [[-(bw / 2 - 5), pz - bhh / 2 + 5], [bw / 2 - 5, pz - bhh / 2 + 5], [bw / 2 - 5, pz + bhh / 2 - 5], [-(bw / 2 - 5), pz + bhh / 2 - 5]], sol = yb - t - (py + .8);
    add({ id: 'standoffs', name: `Standoff, M3 × ${Math.round(sol)}, threaded into the back`, shape: 'cyl', axis: 'y', size: [5.5, sol, 5.5], at: [so4[0][0], py + .8 + sol / 2, so4[0][1]], resin: 'bought in', process: 'bought in', cost: .05, qty: 4, spots: so4.slice(1).map(q => [q[0] - so4[0][0], 0, q[1] - so4[0][1]]), fix: 'press', order: 2, lvl: 4.2 });
    screw('screws-board', 'Screw, M3 × 6 (amplifier board)', 3, 6, 'y', so4.map(q => [q[0], py - .8 - 1 + 3, q[1]]), { parent: 'pcb', through: ['pcb'], dir: [0, -1, 0], lvl: 5 });
    screw('screws-psu', 'Screw, M4 × 20 wood (supply, up through the cabinet)', 4, 20, 'z', [[-44, psy - 24], [44, psy - 24], [44, psy + 24], [-44, psy + 24]].map(q => [...q, zb + 10]), { through: ['cab'], dir: [0, 0, -1], lvl: 2 });
    const rim = (cz, r, ft) => [45, 135, 225, 315].map(a => [r * Math.cos(a * Math.PI / 180), yf - ft + 8, cz + r * Math.sin(a * Math.PI / 180)]);
    screw('screws-drivers', 'Screw, M4 × 16 wood (drivers, through the flange into the baffle)', 4, 16, 'y', [...rim(wz, (wd + wb) / 4, 4), ...rim(tz, 35, 3)], { dir: [0, -1, 0], lvl: 2.4 });
  } else if (arch === 'turntable') {

    // a belt-drive turntable: an MDF plinth closed underneath by a steel plate on four feet, with the main bearing, the motor and the board
    // inside; the spindle comes up through the plinth and carries the sub-platter, the platter and its mat; the tonearm runs through its
    // pillar at the back right with the counterweight behind and the cartridge on its headshell over the record; the phono outputs and the
    // 12 V input go through the back, speed buttons at the front left, and a clear dust cover stands in front of its two hinges
    const W = num(dims.w, 380, 520, 420), D = num(dims.d, 320, 420, 340), H = num(dims.h, 110, 180, 125), t = 12, pd = 300, pt = 12, fh = 10, z0 = fh + 1.5, ph = e2(Math.min(62, H - z0 - pt - 43.5)), zt = z0 + ph, ceil = zt - t, px = -W / 2 + 14 + pd / 2, rad = radio === 'ble' ? 'ble' : 'mcu';
    const mdf = { resin: 'MDF', process: 'CNC routed', finish: 'spray paint' }, top = zt + 4 + pt + 3; // the record sits on the mat at this height
    made = [W, D, H];
    add({ id: 'plinth', name: 'Plinth', shape: 'shell', size: [W, D, ph], r: 4, at: [0, 0, z0 + ph / 2], wall: t, open: '-', ...mdf, cost: r2(3 + W * D / 1e6 * 14), fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'plate', name: 'Bottom plate', shape: 'box', size: [W - 4, D - 4, 1.5], r: 3, at: [0, 0, fh + .75], resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 6, order: 8, dir: [0, 0, -1], lvl: 1.4 });
    const fx = W * .4, fy = D * .38, feet = [[fx, fy], [-fx, fy], [-fx, -fy], [fx, -fy]];
    add({ id: 'feet', name: 'Isolation foot', shape: 'cup', size: [40, 40, fh], at: [fx, fy, fh / 2], wall: 2.5, open: '+', resin: 'TPE', finish: 'SPI C-1 (matte)', draft: 1, qty: 4, spots: feet.slice(1).map(q => [q[0] - fx, q[1] - fy, 0]), fix: 'screws', fixQty: 1, order: 9, dir: [0, 0, -1], lvl: 2.6 });
    const bl = Math.min(30, ph - t - 4), my = D / 2 - t - 26, mx = px - pd / 2 + 26;
    add({ id: 'bearing', name: 'Main bearing and spindle', shape: 'cyl', size: [26, 26, bl], at: [px, 0, ceil - .3 - bl / 2], resin: 'bought in', process: 'bought in', cost: 3.2, fix: 'screws', fixQty: 3, order: 2, parent: 'plinth', lvl: .8 });
    elec('ttmotor', { size: [32, 32, Math.min(26, ph - t - 4)], at: [mx, my, ceil - .3 - Math.min(26, ph - t - 4) / 2], parent: 'plinth', fix: 'screws', fixQty: 2, order: 2, lvl: .8 });
    const bw = 120, bd = 64, bx = W / 2 - t - 4 - bw / 2, by = D / 2 - t - .5 - bd / 2, bz = z0 + 6 + .8, onb = bz + .8;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [bw, bd, 1.6], at: [bx, by, bz], fix: 'screws', fixQty: 4, order: 3, parent: 'plinth', lvl: .8 });
    elec('phono', { at: [bx - 20, by - 10, onb + .75], parent: 'pcb', order: 3, lvl: .8 }); elec(rad, { at: [bx + 30, by - 14, onb + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: .8 }); elec('reg', { at: [bx + 4, by - 20, onb + .5], parent: 'pcb', order: 3, lvl: .8 });
    elec('rca', { name: 'RCA phono outputs, stereo pair, with ground post', at: [bx - 30, D / 2 - 7.5, onb + 7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: .8 });
    elec('dcjack', { at: [bx + 40, D / 2 - 7, onb + 5.5], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: .8 });
    const kx = -W / 2 + 40, ky = -D / 2 + t + 12, keys = [[16, 0, 0], [32, 0, 0]];
    elec('button', { name: 'Speed and start switches (33, 45, start)', qty: 3, spots: keys, at: [kx, ky, ceil - .3 - 1.75], parent: 'plinth', order: 4, lvl: .8 });
    add({ id: 'caps', name: 'Button caps', shape: 'cyl', size: [11, 11, t + 3.3], at: [kx, ky, ceil - .3 + (t + 3.3) / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: .3, finish: 'anodised', qty: 3, spots: keys, through: ['plinth'], fix: 'press', order: 9, lvl: 1.2 });
    add({ id: 'platter', name: 'Platter', shape: 'ring', size: [pd, pd, pt], wall: (pd - 7.4) / 2, at: [px, 0, zt + 4 + pt / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: 14, finish: 'brushed', fix: 'place', order: 5, lvl: 1.6 });
    add({ id: 'mat', name: 'Platter mat (felt)', shape: 'ring', size: [pd - 6, pd - 6, 3], wall: (pd - 6 - 7.4) / 2, at: [px, 0, zt + 4 + pt + 1.5], resin: 'EVA foam', process: 'die cut', fix: 'place', order: 6, lvl: 2.2 });
    const ax = px + pd / 2 + 28, ay = D / 2 - 52, az = top + 21.5, cx = px + 92, cy = -40, rear = ay + 42;
    add({ id: 'pillar', name: 'Tonearm pillar and bearing', shape: 'ring', size: [36, 36, az + 8 - zt], wall: 4, at: [ax, ay, zt + (az + 8 - zt) / 2], resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', draft: 1, fix: 'screws', fixQty: 3, order: 5, lvl: 1.4 });
    add({ id: 'arm', name: 'Tonearm tube', shape: 'cyl', axis: 'y', size: [7, rear - (cy - 8), 7], at: [ax, (rear + cy - 8) / 2, az], resin: 'aluminium 6061', process: 'CNC machined', cost: 2.4, finish: 'anodised', through: ['pillar'], fix: 'press', order: 7, lvl: 2.6 });
    add({ id: 'weight', name: 'Counterweight', shape: 'ring', axis: 'y', size: [22, 24, 22], wall: (22 - 7.2) / 2, at: [ax, rear - 12, az], resin: 'stainless 304', process: 'CNC machined', cost: 1.6, finish: 'brushed', fix: 'press', order: 7, dir: [0, 1, 0], lvl: 2.6 });
    add({ id: 'headshell', name: 'Headshell', shape: 'box', axis: 'x', size: [ax - 3.6 - cx + 6, 16, 5], r: 1, at: [(cx - 6 + ax - 3.6) / 2, cy, az], resin: 'aluminium 6061', process: 'CNC machined', cost: 1.1, finish: 'anodised', fix: 'press', order: 7, lvl: 2.6 });
    elec('cartridge', { at: [cx, cy, az - 2.5 - 8.5], fix: 'screws', fixQty: 2, order: 7, lvl: 2.2 });
    add({ id: 'cover', name: 'Dust cover', shape: 'shell', size: [W, D - 6, H - zt], r: 4, at: [0, -3, zt + (H - zt) / 2], wall: 3, open: '-', resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: 1, fix: 'place', order: 10, lvl: 4.4 });
    add({ id: 'hinge', name: 'Dust cover hinge', shape: 'box', size: [30, 6, 22], r: 2, at: [W * .32, D / 2 - 3, zt + 11], resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', qty: 2, spots: [[-W * .64, 0, 0]], fix: 'screws', fixQty: 2, order: 9, dir: [0, 1, 0], lvl: 1.6 });
    // what joins them: the spindle up from the bearing through the plinth, carrying the sub-platter the belt runs on, the platter and the mat
    add({ id: 'spindle', name: 'Spindle', shape: 'cyl', size: [7, 7, top + 6 - (ceil - .3)], at: [px, 0, (top + 6 + ceil - .3) / 2], resin: 'stainless 304', process: 'bought in', cost: .6, through: ['plinth'], fix: 'press', order: 2, lvl: 1.2 });
    add({ id: 'hub', name: 'Sub-platter (the belt runs on it)', shape: 'ring', size: [60, 60, 4], wall: (60 - 7.4) / 2, at: [px, 0, zt + 2], resin: 'POM (acetal)', finish: 'SPI C-1 (matte)', draft: 1, fix: 'press', order: 4, lvl: 1.4 });
    // the drive: the motor's shaft comes up through the plinth with the pulley on it, level with the sub-platter, and the belt runs round the two
    // under the platter; the belt is bought 5% shorter than its path
    const pl = t + .3 + 4.5, cd = Math.hypot(mx - px, my), tb = Math.acos((30 - 6) / cd), bp = 2 * Math.sqrt(cd * cd - 24 * 24) + (2 * Math.PI - 2 * tb) * 30 + 2 * tb * 6;
    add({ id: 'pulley', name: 'Motor pulley on its shaft', shape: 'cyl', size: [12, 12, pl], at: [mx, my, ceil - .3 + pl / 2], flange: { body: 3, t: 4, end: '+' }, resin: 'aluminium 6061', process: 'CNC machined', cost: .8, finish: 'none', through: ['plinth'], fix: 'press', order: 4, lvl: 1.4 });
    add({ id: 'belt', name: 'Drive belt, flat 3 × 0.8 mm', shape: 'ring', size: [20, 20, 3], wall: .8, at: [px, 0, zt + 2], around: ['hub', 'pulley'], len: Math.floor(bp * .95), resin: 'bought in', process: 'bought in', cost: .9, fix: 'place', order: 4, lvl: 1.5 });
    const so = [[bx - bw / 2 + 5, by - bd / 2 + 5], [bx + bw / 2 - 5, by - bd / 2 + 5], [bx + bw / 2 - 5, by + bd / 2 - 5], [bx - bw / 2 + 5, by - bd / 2 + 30]];
    add({ id: 'standoffs', name: 'Standoff, M3 × 6 brass, riveted to the plate', shape: 'cyl', size: [5.5, 5.5, 6], at: [...so[0], z0 + 3], resin: 'bought in', process: 'bought in', cost: .04, qty: 4, spots: so.slice(1).map(q => [q[0] - so[0][0], q[1] - so[0][1], 0]), fix: 'press', order: 2, lvl: .6 });
    screw('screws-board', 'Screw, M3 × 6 pan head (board)', 3, 6.5, 'z', so.map(q => [...q, z0 + 6 + 1.6 + 1 - 3.25]), { parent: 'pcb', through: ['pcb'], order: 3, lvl: 1 });
    const wy = D / 2 - t / 2, wx = W / 2 - t / 2;
    screw('screws-plate', 'Screw, M3 × 14 (plate and feet)', 3, 14, 'z', [[-wx, 0, fh + 7], [wx, 0, fh + 7], [-W * .25, wy, fh + 7], [W * .25, wy, fh + 7], [-W * .25, -wy, fh + 7], [W * .25, -wy, fh + 7], ...feet.map(q => [q[0], q[1], 7])], { through: ['plate', 'feet'], dir: [0, 0, -1], lvl: 3 });
    const pr = 16, tri = [90, 210, 330].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
    screw('screws-top', 'Screw, M3 × 16 (bearing, motor, pillar)', 3, 16, 'z', [...tri.map(q => [px + q[0] * 9, q[1] * 9, zt - 8]), [mx - 9, my, zt - 8], [mx + 9, my, zt - 8], ...tri.map(q => [ax + q[0] * pr, ay + q[1] * pr, zt - 2])], { through: ['plinth'], lvl: 1.8 });
    screw('screws-cart', 'Screw, M2.5 × 8 (cartridge)', 2.5, 8, 'z', [[cx, cy - 6.35, az - 1.5], [cx, cy + 6.35, az - 1.5]], { through: ['headshell'], lvl: 3 });
    screw('screws-hinge', 'Screw, M3 × 30 (hinges)', 3, 30, 'z', [[W * .32 - 9, D / 2 - 3, zt + 7], [W * .32 + 9, D / 2 - 3, zt + 7], [-W * .32 - 9, D / 2 - 3, zt + 7], [-W * .32 + 9, D / 2 - 3, zt + 7]], { through: ['hinge'], dir: [0, 1, 0], lvl: 2.4 });
  } else if (arch === 'headphones') {

    // over-ear Bluetooth headphones: a stainless spring band over a padded cushion, an aluminium slider down each side to a nylon yoke (a
    // hoop round the cup, pivoting on two screws); in each cup a 40 mm driver behind its baffle and a foam ear pad; the board and controls
    // in the right cup with the USB-C in its wall, the cell in the left
    const W = num(dims.w, 160, 220, 186), D = num(dims.d, 70, 110, 92), H = num(dims.h, 170, 240, 205), w = 2, cd = 36, cw = e2(D - 6.6), ch = 100, yk = ch + 6.6, zc = yk / 2, ox = W / 2;
    made = [W, D, H];
    const cup = (id, sx) => add({ id, name: sx < 0 ? 'Left ear cup' : 'Right ear cup', shape: 'cup', axis: 'x', size: [cd, cw, ch], at: [sx * (ox - cd / 2), 0, zc], wall: w, open: sx < 0 ? '+' : '-', resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1, undercuts: 1, fix: 'snap', order: 6, dir: [sx, 0, 0], lvl: 1.6, main: true });
    cup('cup-l', -1); cup('cup-r', 1);
    for (const sx of [-1, 1]) {
      const k = sx < 0 ? 'l' : 'r', inner = ox - cd; // the cup's open face, toward the head
      add({ id: `baffle-${k}`, name: `Baffle, ${sx < 0 ? 'left' : 'right'}`, shape: 'cyl', axis: 'x', size: [2, cw - 2 * w - 1, ch - 2 * w - 1], at: [sx * (inner + 1.5), 0, zc], resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'snap', order: 4, parent: `cup-${k}`, dir: [-sx, 0, 0], lvl: 1 });
      elec('hpdriver', { axis: 'x', size: [11, 40, 40], at: [sx * (inner + 2.8 + 5.5), 0, zc], parent: `cup-${k}`, fix: 'adhesive', order: 4, dir: [-sx, 0, 0], lvl: .6 });
      add({ id: `pad-${k}`, name: `Ear pad, ${sx < 0 ? 'left' : 'right'} (memory foam in PU leather)`, shape: 'ring', axis: 'x', size: [22, cw + 2, ch + 2], wall: 20, at: [sx * (inner - 11), 0, zc], resin: 'EVA foam', process: 'die cut', fix: 'snap', order: 8, dir: [-sx, 0, 0], lvl: 2.4 });
      add({ id: `yoke-${k}`, name: `Yoke, ${sx < 0 ? 'left' : 'right'}`, shape: 'ring', axis: 'x', size: [10, cw + 6.6, yk], wall: 3, at: [sx * (ox - cd / 2), 0, zc], resin: 'PA66 GF30', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'screws', fixQty: 2, order: 5, dir: [0, 0, 1], lvl: 1 });
      add({ id: `slider-${k}`, name: `Slider, ${sx < 0 ? 'left' : 'right'}`, shape: 'box', size: [6, 14, H - 2 - yk], r: 1, at: [sx * (ox - cd / 2), 0, (yk + H - 2) / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: .9, finish: 'anodised', fix: 'press', order: 5, dir: [0, 0, 1], lvl: 2 });
    }
    const rx = ox - w - 5, pz = zc, bh = ch - 2 * w - 34; // the board stands in the right cup on two bosses, parts on its inner face, the buttons on its outer face
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'x', size: [1.2, cw - 2 * w - 24, bh], r: 8, at: [rx, 0, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'cup-r', lvl: .8 });
    const side = (k, y, z, o = {}) => { const e = ELEC[k].size; elec(k, { size: [e[2], e[1], e[0]], at: [rx - .6 - e[2] / 2, y, z], parent: 'pcb', order: 3, lvl: .8, ...o }); };
    const rad = radio === 'wifi' ? 'wifi' : 'ble'; side(rad, 0, pz + 12); side('charger', -10, pz - 10); side('reg', 6, pz - 10); side('mic', 14, pz - 22); side('hpamp', -6, pz - 22);
    elec('usbc', { size: [3.2, 9, 7.5], at: [rx - .6 - 1.6, 0, zc - ch / 2 + w + 3.6], parent: 'cup-r', fix: 'adhesive', order: 3, dir: [0, 0, -1], lvl: .8 });
    elec('button', { name: 'Tact switches (power, volume up, volume down)', qty: 3, size: [3.5, 6, 6], at: [rx + .6 + 1.75, -12, pz - 8], parent: 'pcb', order: 3, dir: [1, 0, 0], lvl: .8 });
    elec('led', { size: [.6, 2, 2], at: [rx + .6 + .3, 14, pz - 16], parent: 'pcb', order: 3, dir: [1, 0, 0], lvl: .8 });
    const lx = -(ox - w - .3), mA = fitCell(mah || 600, [cw - 2 * w - 4, ch - 2 * w - 6, 8], Boolean(mah)), cell = cellOf(mA), bs = [cell.size[2], cell.size[0], cell.size[1]];
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: bs, at: [lx + bs[0] / 2, 0, zc], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'cup-l', elec: { kind: 'battery', mah: mA }, dir: [-1, 0, 0], lvl: .8 });
    add({ id: 'band', name: 'Headband spring', shape: 'box', size: [W - 34, 22, 2], r: 1, at: [0, 0, H - 1], resin: 'stainless 304', process: 'stamping', finish: 'brushed', fix: 'screws', fixQty: 4, order: 7, lvl: 3 });
    add({ id: 'cushion', name: 'Headband cushion (memory foam in PU leather)', shape: 'box', size: [W - 74, 30, 10], r: 4, at: [0, 0, H - 7], resin: 'EVA foam', process: 'die cut', fix: 'snap', order: 8, lvl: 2 });
    const bzs = [pz + bh / 2 - 4, pz - bh / 2 + 4], sxc = ox - cd / 2, yy = cw / 2 + .3;
    boss('cup-r', bzs.map(z => [rx + .6, 0, z]), 2);
    screw('screws-board', 'Screw, M2 × 5 (board)', 2, 5, 'x', bzs.map(z => [rx + 1.1, 0, z]), { parent: 'pcb', through: ['pcb'], dir: [-1, 0, 0], lvl: 1.2 });
    screw('screws-yoke', 'Screw, M2 × 6 shoulder (yoke pivots)', 2, 6, 'y', [[-sxc, yy, zc], [-sxc, -yy, zc], [sxc, yy, zc], [sxc, -yy, zc]], { through: ['yoke-l', 'cup-l', 'yoke-r', 'cup-r'], dir: [0, 1, 0], lvl: 2.2 });
    screw('screws-band', 'Screw, M2 × 6 countersunk (band)', 2, 6, 'z', [[-sxc, -3.5, H - 3], [-sxc, 3.5, H - 3], [sxc, -3.5, H - 3], [sxc, 3.5, H - 3]], { through: ['band'], lvl: 3.6 });
  } else if (arch === 'smartspeaker') {
    // a smart speaker: a round base on its foot holding the main board on three bosses, the Wi-Fi module, the amplifier and the DC input; a
    // fabric grille with the up-firing driver hung under its top; a light ring that shows all the way round; and a top cap with its board
    // of four microphones, the ring's LEDs and the buttons, whose caps come through the top
    const D = num(dims.w, 80, 200, 100), H = num(dims.h, 100, 260, 152), w = 2, zb = 1.5, hb = Math.round((H - zb) * .3), ht = 22, hg = e2(H - zb - hb - ht - 3), sd = Math.min(76, D - 16), z1 = zb + hb, z2 = z1 + hg;
    made = [D, D, H];
    add({ id: 'body', name: 'Base housing', shape: 'cup', size: [D, D, hb], at: [0, 0, zb + hb / 2], wall: w, open: '+', lip: { into: 'grille' }, resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foot', name: 'Non-slip foot', shape: 'cyl', size: [D - 14, D - 14, 1.5], at: [0, 0, .75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
    const pz = zb + w + 6, on = pz + .8, pr = (D - 2 * w - 4) / 2 - 4, pb = [90, 210, 330].map(a => [pr * Math.cos(a * Math.PI / 180), pr * Math.sin(a * Math.PI / 180)]);
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [D - 2 * w - 4, D - 2 * w - 4, 1.6], r: D, at: [0, 0, pz], fix: 'screws', fixQty: 3, order: 2, parent: 'body', lvl: .8, layers: 4 });
    elec('wifi', { at: [-D * .16, D * .06, on + ELEC.wifi.size[2] / 2], parent: 'pcb', order: 2, lvl: .8 }); elec('amp', { at: [D * .18, -D * .1, on + .4], parent: 'pcb', order: 2, lvl: .8 }); elec('reg', { at: [D * .18, D * .1, on + .5], parent: 'pcb', order: 2, lvl: .8 });
    elec('dcjack', { at: [0, -(D / 2 - 7.5), on + 5.5], parent: 'pcb', order: 2, dir: [0, -1, 0], lvl: .8 });
    add({ id: 'grille', name: 'Grille (fabric over a frame)', shape: 'cup', size: [D, D, hg], at: [0, 0, z1 + hg / 2], wall: w, open: '-', resin: 'ABS', finish: 'none', draft: 1, fix: 'snap', order: 4, lvl: 1.8, main: true });
    const sh = Math.min(34, hg - w - 4), sx = sd / 2 - 5;
    elec('speaker', { name: 'Speaker driver, 3 in full range 10 W', size: [sd, sd, sh], at: [0, 0, z2 - w - .3 - sh / 2], parent: 'grille', fix: 'screws', fixQty: 4, order: 3, dir: [0, 0, 1], lvl: 1.2 });
    add({ id: 'cap', name: 'Top cap', shape: 'cup', size: [D, D, ht], at: [0, 0, H - ht / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'snap', order: 6, lvl: 3, main: true });
    const tz = H - w - 7, tn = tz + .6, k0 = [-D * .12 - 7, -D * .1 - 7], k4 = [[14, 0, 0], [14, 14, 0], [0, 14, 0]], tx = D / 2 - w - 12;
    add({ id: 'top', name: 'Top board (microphones, lights, buttons)', shape: 'pcb', size: [D - 2 * w - 6, D - 2 * w - 6, 1.2], r: D, at: [0, 0, tz], fix: 'screws', fixQty: 2, order: 5, parent: 'cap', lvl: 2.4 });
    elec('mic', { name: 'MEMS microphones, an array of four', qty: 4, at: [D * .3, 0, tn + .5], parent: 'top', order: 5, lvl: 2.4 }); elec('led', { name: 'LEDs (RGB) for the light ring', qty: 12, at: [0, D * .36, tn + .3], parent: 'top', order: 5, lvl: 2.4 });
    elec('button', { name: 'Tact switches (action, mic off, volume up, down)', qty: 4, spots: k4, at: [...k0, tn + 1.75], parent: 'top', order: 5, lvl: 2.4 });
    add({ id: 'ring', name: 'Light ring', shape: 'ring', size: [D, D, 3], at: [0, 0, z2 + 1.5], wall: w + 1.6, resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'press', order: 5, lvl: 2.2 });
    add({ id: 'keys', name: 'Button caps', shape: 'cyl', size: [10, 10, H - (tn + 3.5)], at: [...k0, (H + tn + 3.5) / 2], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, spots: k4, through: ['cap'], fix: 'press', order: 7, lvl: 3.8 });
    boss('body', pb.map(q => [...q, pz - .8]), 2); boss('cap', [[-tx * .7, tx * .7, tn], [tx * .7, -tx * .7, tn]], 2);
    screw('screws-board', 'Screw, M2 × 5 (main board)', 2, 5, 'z', pb.map(q => [...q, on + 1 - 2.5]), { parent: 'pcb', through: ['pcb'], lvl: 1.4 });
    screw('screws-top', 'Screw, M2 × 5 (top board)', 2, 5, 'z', [[-tx * .7, tx * .7, tz - .6 - 1 + 2.5], [tx * .7, -tx * .7, tz - .6 - 1 + 2.5]], { parent: 'top', through: ['top'], dir: [0, 0, -1], lvl: 2 });
    screw('screws-spk', 'Screw, M3 × 8 (driver)', 3, 8, 'z', [[-sx, 0], [sx, 0], [0, -sx], [0, sx]].map(q => [...q, z2 - 4]), { through: ['grille'], lvl: 2.2 });
  } else if (arch === 'powerbank') {
    // a power bank: a pack of 18650 cells side by side, the controller board at one end on two screws that close the shells there, USB-C in
    // and out through the end, a four-LED fuel gauge behind its window and a button under its cap, in two PC/ABS shells
    const n = Math.round(num(mah ? mah / 3000 : undefined, 2, 4, 3)), L = num(dims.d, 110, 200, 146), w = 1.8, W = e2(Math.max(num(dims.w, 40, 100, 0), n * 18.6 + 2 * w + 3)), H = num(dims.h, 22, 40, 25), hb = e2(H / 2);
    made = [Number(dims.w) > 0 ? num(dims.w, 40, 100, W) : W, L, H]; // a width asked for that the cells do not fit in is kept, so the size check says how much wider it came out
    add({ id: 'bottom', name: 'Bottom shell', shape: 'shell', size: [W, L, hb], r: 6, at: [0, 0, hb / 2], wall: w, open: '+', lip: { into: 'top' }, resin: 'PC/ABS', finish: 'MT-11010 (fine texture)', draft: 3, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    const cy = -L / 2 + w + 2 + 32.5;
    add({ id: 'cells', name: `Li-ion cells, ${n} × 18650, ${n * 3000} mAh (1S${n}P)`, shape: 'box', size: [n * 18.4, 65, 18], at: [0, cy, w + .2 + 9], resin: 'bought in', process: 'bought in', cost: r2(n * 1.7), fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'li18650', mah: n * 3000 }, lvl: .8 });
    const by0 = cy + 32.5 + 4, by1 = L / 2 - w - 1, pl = by1 - by0, py = (by0 + by1) / 2, pz = w + 4, on = pz + .6, sxs = W / 2 - w - 4.5, sy = L / 2 - w - 12, sl = e2(Math.min(H - 5, 20));
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [W - 2 * w - 1.5, pl, 1.2], r: 5, at: [0, py, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'bottom', lvl: 1.4 });
    elec('pbms', { at: [-W * .18, py - pl * .1, on + .5], parent: 'pcb', order: 3, lvl: 1.4 }); elec('reg', { at: [W * .2, py - pl * .1, on + .5], parent: 'pcb', order: 3, lvl: 1.4 });
    elec('usbc', { name: 'USB-C receptacles, in and out', qty: 2, spots: [[W * .4, 0, 0]], at: [-W * .2, L / 2 - w - 3.75 + .2, on + 1.6], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.4 });
    elec('led', { name: 'LEDs, fuel gauge', qty: 4, at: [W * .18, py - pl * .3, on + .3], parent: 'pcb', order: 3, lvl: 1.4 });
    elec('button', { at: [W * .18, py + pl * .15, on + 1.75], parent: 'pcb', order: 3, lvl: 1.4 });
    add({ id: 'window', name: 'Fuel gauge window', shape: 'box', size: [12, 4, w], r: 1, at: [W * .18, py - pl * .3, H - w / 2], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, through: ['top'], fix: 'adhesive', order: 7, lvl: 4.2 });
    add({ id: 'key', name: 'Button cap', shape: 'cyl', size: [7, 7, H - (on + 3.5)], at: [W * .18, py + pl * .15, (H + on + 3.5) / 2], resin: 'silicone (LSR)', process: 'LSR moulding', through: ['top'], fix: 'press', order: 7, lvl: 4.2 });
    add({ id: 'top', name: 'Top shell', shape: 'shell', size: [W, L, H - hb], r: 6, at: [0, 0, hb + (H - hb) / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'MT-11010 (fine texture)', draft: 3, undercuts: 0, fix: 'snap', order: 6, lvl: 3.2, main: true });
    screw('screws', `Screw, M2 × ${Math.round(sl)} self-tapping`, 2, sl, 'z', [[-sxs, sy, sl / 2], [sxs, sy, sl / 2]], { parent: 'pcb', through: ['bottom', 'pcb'], dir: [0, 0, -1], lvl: 2 });
    boss('bottom', [[-sxs, sy, pz - .6], [sxs, sy, pz - .6]], 2); boss('top', [[-sxs, sy, on], [sxs, sy, on]], 2);
  } else if (arch === 'lamp') {

    // a cordless table lamp: a weighted die-cast base closed by a plate, holding the cell, the board and the USB-C input; an aluminium
    // tube carries the wires up through the diffuser and the LED board to the heat sink, which carries the pressed shade
    const Wd = num(dims.w, 90, 200, 120), H = num(dims.h, 200, 700, 380), Db = e2(Wd * .8), hh = 56, hb = 30, w = 2.5, tube = 14, zb = 1.5, ceil = zb + hb - w, st = H - 1.2 - .3 - 12;
    made = [Wd, Wd, H];
    add({ id: 'base', name: 'Weighted base', shape: 'cup', size: [Db, Db, hb], at: [0, 0, zb + hb / 2], wall: w, open: '-', resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', draft: 1.5, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'plate', name: 'Base plate', shape: 'cyl', size: [Db - 2 * w - .6, Db - 2 * w - .6, 1.5], at: [0, 0, zb + .75], resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 3, order: 8, dir: [0, 0, -1], lvl: 1.4 });
    add({ id: 'pad', name: 'Non-slip pad', shape: 'cyl', size: [Db - 16, Db - 16, 1.5], at: [0, 0, .75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 2.4 });
    const room = (Db - 2 * w) * .62, mA = fitCell(mah || 2600, [room, room, 8], Boolean(mah)), cell = cellOf(mA);
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: cell.size, at: [0, Db * .04, zb + 1.5 + .2 + cell.size[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'base', elec: { kind: 'battery', mah: mA }, lvl: .8 });
    const pz = ceil - 3, on = pz - .8, ye = Db / 2 - w - 6, py = -(ye + 8.5) / 2; // the board hangs under the top of the base on two bosses, between the stem and the wall, its parts facing down
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [Db * .4, ye - 8.5, 1.6], r: 6, at: [0, py, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'base', lvl: 1 });
    elec('mcu', { at: [-Db * .1, py, on - .5], parent: 'pcb', order: 3, lvl: 1 }); elec('charger', { at: [Db * .02, py, on - .5], parent: 'pcb', order: 3, lvl: 1 }); elec('leddrv', { at: [Db * .12, py, on - .5], parent: 'pcb', order: 3, lvl: 1 });
    elec('usbc', { at: [0, -(Db / 2 - w - 3.75 + .2), on - 1.6], parent: 'pcb', order: 3, dir: [0, -1, 0], lvl: 1 });
    add({ id: 'stem', name: 'Stem tube', shape: 'ring', size: [tube, tube, st - (ceil - 3)], wall: 1.2, at: [0, 0, (st + ceil - 3) / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: r2(1.2 + H / 400), finish: 'anodised', fix: 'press', order: 4, lvl: 1.6 });
    add({ id: 'shade', name: 'Shade', shape: 'cup', size: [Wd, Wd, hh], at: [0, 0, H - hh / 2], wall: 1.2, open: '-', resin: 'aluminium 6061', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 2, order: 5, lvl: 3, main: true });
    elec('ledcob', { name: 'LED module, 6 W, a ring board round the stem', size: [34, 34, 3], at: [0, 0, st - 1.5], parent: 'shade', fix: 'screws', fixQty: 2, order: 6, dir: [0, 0, -1], lvl: .8 }); const led = parts.at(-1).id;
    add({ id: 'sink', name: 'Heat sink (carries the shade on the stem)', shape: 'cyl', size: [44, 44, 12], at: [0, 0, st + 6], resin: 'aluminium 6061', process: 'die casting', finish: 'none', fix: 'press', order: 6, parent: 'shade', lvl: .4 });
    add({ id: 'diffuser', name: 'Diffuser (opal PC)', shape: 'cyl', size: [Wd - 2 * 1.2 - .6, Wd - 2 * 1.2 - .6, 2], at: [0, 0, H - hh + 4], resin: 'PC', finish: 'MT-11010 (fine texture)', draft: 3, fix: 'snap', order: 7, parent: 'shade', dir: [0, 0, -1], lvl: 1.4 });
    elec('touch', { name: 'Touch dimmer (controller and pad on top of the shade)', at: [Math.max(Wd * .25, 26), 0, H - 1.2 - .3 - .5], parent: 'shade', fix: 'adhesive', order: 6, lvl: .8 });
    part('stem').through = ['base', 'diffuser', led];
    const rb = Db / 2 - w - 6, pb = [90, 200, 340].map(a => [rb * Math.cos(a * Math.PI / 180), rb * Math.sin(a * Math.PI / 180)]), bxs = [-(Db * .2 - 4), Db * .2 - 4], byy = -12.5;
    boss('base', [...pb.map(q => [...q, zb + 1.5]), ...bxs.map(x => [x, byy, pz + .8])], 3);
    screw('screws-plate', 'Screw, M3 × 8 (base plate)', 3, 8, 'z', pb.map(q => [...q, zb + 4]), { through: ['plate'], dir: [0, 0, -1], lvl: 3 });
    screw('screws-board', 'Screw, M3 × 5 (board)', 3, 5, 'z', bxs.map(x => [x, byy, pz - .8 - 1 + 2.5]), { parent: 'pcb', through: ['pcb'], dir: [0, 0, -1], lvl: 1.6 });
    screw('screws-led', 'Screw, M2 × 6 (LED board)', 2, 6, 'z', [[-13, 0, st - 4 + 3], [13, 0, st - 4 + 3]], { through: [led], dir: [0, 0, -1], lvl: 1.6 });
    screw('screws-shade', 'Screw, M3 × 6 countersunk (shade)', 3, 6, 'z', [[-12, 0, H - 3], [12, 0, H - 3]], { through: ['shade'], lvl: 3.8 });
  } else if (arch === 'tumbler') {
    // a tumbler: the cup on its base pad, a lid whose skirt screws down over the cup's rim (1.5 turns of a 4 mm thread) with the seal squeezed
    // between the rim and the lid, the straw through the lid, and the sip opening through the lid under a slider that slides
    // toward the straw to open it (the opening is sized so the slider stops short of the straw). The width asked is the lid's, the height is to the straw's tip
    const D = num(dims.w, 50, 160, 88), H = num(dims.h, 80, 400, 180), w = 2.2, lh = 18, Db = e2(D - 6.8), lt = H - 20, bt = lt - 4, sl = Math.min(22, D * .3), ol = r1(Math.min(8, D * .37 - sl / 2 - 6.5)), oy = r1(D * .22 + sl / 2 - 1.5 - ol / 2); // the cup is 2.8 mm inside the lid's bore all round: 2.4 mm of thread and 0.4 mm clear on the diameter
    made = [D, D, H];
    add({ id: 'body', name: 'Cup body', shape: 'cup', size: [Db, Db, bt - 2], at: [0, 0, 2 + (bt - 2) / 2], wall: w, open: '+', resin: 'Tritan', finish: 'SPI A-2 (high gloss)', draft: 1, fix: 'place', order: 1, lvl: 0, food: true, main: true });
    add({ id: 'gasket', name: 'Lid seal', shape: 'ring', size: [Db, Db, 2], at: [0, 0, bt + 1], wall: w + 1, resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 2, lvl: 1.5, food: true });
    add({ id: 'lid', name: 'Lid', shape: 'cup', size: [D, D, lh], at: [0, 0, lt - lh / 2], wall: 2, open: '-', resin: 'PP', finish: 'SPI C-1 (matte)', draft: 1.5, undercuts: 1, fix: 'thread', thread: { onto: 'body', pitch: 4, turns: 1.5, depth: 1.2 }, holes: [{ at: [0, oy, lh / 2 - 1], size: [12, ol, 2], axis: 'z', round: true }], order: 3, lvl: 2.5, food: true, main: true });
    add({ id: 'slider', name: 'Sip slider', shape: 'box', size: [16, sl, 3], r: 3, at: [0, D * .22, lt + 1.5], slides: { over: 'lid', by: [0, -r1(ol + 2), 0] }, resin: 'PP', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'snap', order: 4, lvl: 3.4, food: true });
    add({ id: 'straw', name: 'Straw', shape: 'ring', size: [8, 8, H - 2 - w - 1], at: [0, -D * .15, (H + 2 + w + 1) / 2], wall: .9, resin: 'Tritan', process: 'injection moulding', finish: 'SPI A-2 (high gloss)', draft: .5, through: ['lid'], fix: 'place', order: 5, lvl: 4.4, food: true });
    add({ id: 'base', name: 'Base pad', shape: 'cyl', size: [Db - 8, Db - 8, 2], at: [0, 0, 1], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 6, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'case') {
    // a case: base and lid on four moulded-in feet, hinged along the back and latched on the front, inside the depth asked. The pin lies behind
    // the two back walls at the height where they meet, 3.7 mm out, in five knuckles 7 mm across: three on the base, two on the lid between them
    const W = num(dims.w, 60, 800, 220), D = num(dims.d, 40, 600, 160), H = num(dims.h, 25, 400, 72), w = 2.5, zb = 2, Ds = e2(D - 10.4), yc = -2, hb = e2((H - zb) * .7), fx = W * .38, fy = Ds * .35, Lp = r1(W * .8), kp = Lp / 5, kn = { pin: 'hinge', len: r1(kp - .4), d: 7 };
    made = [W, D, H];
    add({ id: 'base', name: 'Base', shape: 'shell', size: [W, Ds, hb], at: [0, yc, zb + hb / 2], r: 10, wall: w, open: '+', lip: { into: 'lid' }, knuckles: { ...kn, at: [-2 * kp, 0, 2 * kp] }, resin: 'PP', finish: 'SPI D-2 (textured)', draft: 3, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foam', name: 'Foam insert', shape: 'box', size: [W - 2 * w - 1, Ds - 2 * w - 1, hb * .7], r: 6, at: [0, yc, zb + w + .2 + hb * .35], resin: 'EVA foam', process: 'die cut', fix: 'place', order: 2, parent: 'base', lvl: 1.6 });
    add({ id: 'lid', name: 'Lid', shape: 'shell', size: [W, Ds, H - zb - hb], at: [0, yc, zb + hb + (H - zb - hb) / 2], r: 10, wall: w, open: '-', knuckles: { ...kn, at: [-kp, kp] }, resin: 'PP', finish: 'SPI D-2 (textured)', draft: 3, undercuts: 1, fix: 'place', order: 3, lvl: 3, main: true });
    add({ id: 'hinge', name: 'Hinge pin', shape: 'cyl', axis: 'x', size: [Lp, 3, 3], at: [0, D / 2 - 3.5, zb + hb], resin: 'stainless 304', process: 'bought in', cost: .12, qty: 1, fix: 'press', order: 4, dir: [0, 1, 0], lvl: 1.5 });
    add({ id: 'latch', name: 'Latch', shape: 'box', size: [Math.min(30, W * .4), 3.2, Math.min(16, (H - zb) * .5)], r: 1, at: [0, -D / 2 + 1.6, zb + hb], resin: 'POM (acetal)', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'snap', order: 5, dir: [0, -1, 0], lvl: 1.5 });
    add({ id: 'feet', name: 'Foot', shape: 'cyl', size: [Math.min(12, W * .15), Math.min(12, W * .15), 2], at: [fx, yc + fy, 1], resin: 'TPE', process: 'overmoulding', qty: 4, spots: [[-2 * fx, 0, 0], [-2 * fx, -2 * fy, 0], [0, -2 * fy, 0]], fix: 'moulded in', order: 6, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'figure') {
    // a vinyl figure on its base: legs, body, arms and head each seated on the next (the plugs that join them are not drawn)
    const H = num(dims.h, 60, 600, 180), k = H / 184;
    made = [128 * k, 90 * k, H];
    add({ id: 'base', name: 'Display base', shape: 'cup', size: [90 * k, 90 * k, 12 * k], at: [0, 0, 6 * k], wall: 2.5, open: '-', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'place', order: 1, lvl: 0 });
    add({ id: 'legs', name: 'Legs', shape: 'box', size: [44 * k, 26 * k, 46 * k], r: 10 * k, at: [0, 0, 12 * k + 23 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 2, lvl: 1, main: true });
    add({ id: 'body', name: 'Body', shape: 'ball', size: [56 * k, 40 * k, 60 * k], at: [0, 0, 58 * k + 30 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 3, lvl: 2, main: true });
    add({ id: 'arml', name: 'Left arm', shape: 'cyl', axis: 'x', size: [36 * k, 14 * k, 14 * k], at: [-46 * k, 0, 96 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 4, dir: [-1, 0, 0], lvl: 1.2 });
    add({ id: 'armr', name: 'Right arm', shape: 'cyl', axis: 'x', size: [36 * k, 14 * k, 14 * k], at: [46 * k, 0, 96 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 4, dir: [1, 0, 0], lvl: 1.2 });
    add({ id: 'head', name: 'Head', shape: 'ball', size: [74 * k, 66 * k, 66 * k], at: [0, 0, 118 * k + 33 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 5, lvl: 3, main: true });
  } else { made = [num(dims.w, 5, 2000, 100), num(dims.d, 5, 2000, 60), num(dims.h, 5, 2000, 40)]; add({ id: 'body', name: 'Body', shape: 'shell', size: made, at: [0, 0, made[2] / 2], r: 4, wall: 2, open: '+', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, order: 1, main: true }); }
  // a cover that snaps onto the other half of its housing gets its hooks
  for (const [a2, ia, ib] of [['puck', 'top', 'bottom'], ['handheld', 'top', 'bottom'], ['desk', 'front', 'back'], ['cassette', 'front', 'back'], ['smartspeaker', 'grille', 'body'], ['powerbank', 'top', 'bottom']]) if (arch === a2) snapOn(ia, ib);
  return cleanAssembly({ arch, kind: ARCHES[arch]?.kind, v: 2, ...(made ? { dims: { w: made[0], d: made[1], h: made[2] } } : {}), parts });
}
// the archetype a concept reads as, from its words (the designer's own words first)
export function guessArch(c = {}) {
  const t = [c.name, c.spec?.silhouette, c.spec?.description, c.spec?.category].join(' ').toLowerCase();
  if (/\b(cd|compact disc|disc player)\b/.test(t) && /\b(player|deck|hi-?fi|component|stereo|disc)\b/.test(t)) return 'cdplayer';
  if (/\b(cassette|walkman|tape (player|deck))\b/.test(t)) return 'cassette';
  if (/\b(turntable|record player|vinyl player|phonograph|lp player)\b/.test(t)) return 'turntable';
  if (/\b(headphones?|headset|over-?ear|on-?ear|cans)\b/.test(t) && !/\b(stand|hanger|case|hook)\b/.test(t)) return 'headphones';
  if (/\b(smart speaker|voice assistant|smart home speaker|home assistant|alexa|assistant speaker)\b/.test(t)) return 'smartspeaker';
  if (/\bpower ?bank|portable charger|battery pack\b/.test(t)) return 'powerbank';
  if (/\b(lamp|desk light|table light|night ?light|lantern|reading light)\b/.test(t)) return 'lamp';
  if (/\b(bookshelf|studio monitors?|powered speakers?|monitor speakers?|stereo speakers?|hi-?fi speakers?|floorstanding)\b/.test(t)) return 'speaker';
  if (c.category === 'electronics' || /\b(bluetooth|speaker|battery|usb|charger|electronic)\b/.test(t)) return /\b(remote|controller|power ?bank|handheld|tracker|clicker|key ?finder|fob|wand)\b/.test(t) ? 'handheld' : /\b(display|screen|clock|monitor|station|radio|frame)\b/.test(t) ? 'desk' : 'puck';
  if (/\b(tumbler|bottle|cup|mug|flask|drinkware|thermos|shaker)\b/.test(t)) return 'tumbler';
  if (/\b(figure|figurine|vinyl|collectible|doll|action figure|statue|mascot)\b/.test(t)) return 'figure';
  if (/\b(case|box|organi[sz]er|storage|container|tray|caddy|tin)\b/.test(t)) return 'case';
  return c.category === 'toys' ? 'figure' : 'case';
}
export const radioOf = c => { const t = [c.name, c.spec?.description, c.spec?.silhouette].join(' ').toLowerCase(); return /\bwi-?fi\b|\bsmart (home|hub|display)\b/.test(t) ? 'wifi' : /\b(bluetooth|wireless|ble|app)\b/.test(t) ? 'ble' : c.category === 'electronics' ? 'ble' : 'none'; };

// ---- the exploded view --------------------------------------------------------------------------------------------------------------------------
export function extentOf(parts) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of parts) for (const b of [bboxOf(p), ...(p.adds || []).map(a => bboxOf(a, p.at))]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.lo[k]); hi[k] = Math.max(hi[k], b.hi[k]); } return { lo, hi, size: lo.map((v, k) => hi[k] - v) }; }
// where each part sits when the view is pulled apart: along its direction by its level, a level being a share of the product's size; t 0..1
export function explodeOffsets(s, t = 1) {
  const e = extentOf(s.parts), gap = Math.max(...e.size) * .32 * t, out = {};
  for (const p of s.parts) { const l = Math.hypot(...p.dir) || 1; out[p.id] = p.dir.map(v => v / l * p.lvl * gap); }
  return out;
}

// ---- the engineering --------------------------------------------------------------------------------------------------------------------------
const toolSteel = shots => shots <= 10000 ? { steel: 'Aluminium 7075 (soft tool)', base: 2500, perCm2: 25, weeks: 3 } : shots <= 300000 ? { steel: 'P20 pre-hardened steel', base: 6000, perCm2: 45, weeks: 6 } : { steel: 'H13 hardened steel', base: 9000, perCm2: 65, weeks: 9 };
// one part: mass, the tool it needs, its cycle and its cost
// ---- how each part sits, for the 3D parts (src/lab-parts3d.js) in the page and in the files ----------------------------------------------------
// the outer housings (big opaque shells); which way a part faces: a socket toward the nearest outside wall, a part on a board away from the
// board, the rest by how it explodes; and the parts on a board in the board's own frame, so its traces, pads and silkscreen sit under them
const PORTS = new Set(['usbc', 'iec', 'rca', 'jack', 'antenna']), AX = ['x', 'y', 'z'];
export function housingsOf(s) { const all = extentOf(s.parts).size.reduce((a, b) => a * b, 1); return s.parts.filter(q => ['shell', 'cup'].includes(q.shape) && !RESINS[q.resin]?.clear && q.size[0] * q.size[1] * q.size[2] >= all * .2); }
export function faceOfPart(s, p) {
  if (p.elec && PORTS.has(p.elec.kind)) { const hs = housingsOf(s), e = extentOf(hs.length ? hs : s.parts); let best = null; for (let k = 0; k < 3; k++) for (const g of [-1, 1]) { const gap = g > 0 ? e.hi[k] - (p.at[k] + p.size[k] / 2) : (p.at[k] - p.size[k] / 2) - e.lo[k]; if (!best || gap < best.gap) best = { gap, axis: AX[k], sign: g }; } return { axis: best.axis, sign: best.sign }; }
  const par = p.parent && s.parts.find(q => q.id === p.parent); if (par && par.shape === 'pcb' && p.elec) { const a = AX.indexOf(par.axis || 'z'); return { axis: par.axis || 'z', sign: p.at[a] >= par.at[a] ? 1 : -1 }; }
  if (p.elec || /screw/i.test(p.name)) { const k = p.dir.findIndex(v => Math.abs(v) > .9); if (k >= 0) return { axis: AX[k], sign: Math.sign(p.dir[k]) }; }
  return { axis: p.axis || 'z', sign: 1 };
}
export function compsOnBoard(s, b) {
  const a = AX.indexOf(b.axis || 'z'), xi = [0, 1, 2].find(k => k !== a), Z = [0, 1, 2].map(k => k === a ? 1 : 0), X = [0, 1, 2].map(k => k === xi ? 1 : 0), Y = [Z[1] * X[2] - Z[2] * X[1], Z[2] * X[0] - Z[0] * X[2], Z[0] * X[1] - Z[1] * X[0]], yi = Y.findIndex(v => Math.abs(v) > .5);
  return s.parts.filter(q => q.parent === b.id && q.elec && !['battery', 'speaker'].includes(q.elec.kind)).map(q => { const d = q.at.map((v, k) => v - b.at[k]); return { x: +(d[xi]).toFixed(2), y: +(d[0] * Y[0] + d[1] * Y[1] + d[2] * Y[2]).toFixed(2), w: q.size[xi], d: q.size[yi], kind: q.elec.kind }; });
}
// ---- the cables: every part off the board wired to what drives it ---------------------------------------------------------------------------------
// What each kind is wired with, and to what: the main board, the supply (mains comes in through the inlet), or the amplifier (drivers).
// cost is the cable assembly at volume, plus per 100 mm of length; the length is the run between the two parts with a fifth for slack.
const CABLES = {
  psu: { to: 'board', label: 'DC power', type: '2-wire 18 AWG, JST VH', cost: .3, per: .04, kind: 'power' },
  iec: { to: 'psu', label: 'Mains in', type: '3-wire 18 AWG, crimped and sleeved', cost: .4, per: .06, kind: 'mains' },
  battery: { to: 'board', label: 'Battery', type: '2-wire 26 AWG, JST PH', cost: .1, per: .02, kind: 'power' },
  aa: { to: 'board', label: 'Battery', type: '2-wire 26 AWG, JST PH', cost: .1, per: .02, kind: 'power' },
  speaker: { to: 'amp', label: 'Speaker', type: '2-wire 24 AWG, JST PH', cost: .1, per: .02, kind: 'power' },
  woofer: { to: 'amp', label: 'Woofer', type: '2-wire 18 AWG, 6.3 mm spade', cost: .18, per: .03, kind: 'power' },
  tweeter: { to: 'amp', label: 'Tweeter', type: '2-wire 20 AWG, 2.8 mm spade', cost: .15, per: .03, kind: 'power' },
  amp2: { to: 'board', label: 'Amplifier', type: '6-wire 22 AWG (12 V, I2S), JST XH', cost: .25, per: .03, kind: 'signal' },
  cdmech: { to: 'board', label: 'Loader', type: '24-pin FFC, 0.5 mm pitch', cost: .3, per: .03, kind: 'ribbon' },
  tapemech: { to: 'board', label: 'Transport', type: '8-wire 28 AWG, JST SH', cost: .2, per: .02, kind: 'signal' },
  vfd: { to: 'board', label: 'Display', type: '20-pin FFC, 1.0 mm pitch', cost: .25, per: .03, kind: 'ribbon' },
  lcd: { to: 'board', label: 'Display', type: '40-pin FPC, 0.5 mm pitch', cost: .3, per: .03, kind: 'ribbon' },
  oled: { to: 'board', label: 'Display', type: '24-pin FPC, 0.5 mm pitch', cost: .25, per: .03, kind: 'ribbon' },
  button: { to: 'board', label: 'Buttons', type: '6-wire 28 AWG, JST SH', cost: .15, per: .02, kind: 'signal' },
  ir: { to: 'board', label: 'IR receiver', type: '3-wire 28 AWG, JST SH', cost: .1, per: .02, kind: 'signal' },
  encoder: { to: 'board', label: 'Encoder', type: '5-wire 28 AWG, JST SH', cost: .12, per: .02, kind: 'signal' },
  pot: { to: 'board', label: 'Volume', type: '3-wire 28 AWG, JST SH', cost: .1, per: .02, kind: 'signal' },
  jack: { to: 'board', label: 'Headphones', type: '4-wire 28 AWG, JST SH', cost: .1, per: .02, kind: 'signal' },
  usbc: { to: 'board', label: 'USB-C', type: '6-wire 26 AWG, JST GH', cost: .2, per: .02, kind: 'signal' },
  rca: { to: 'board', label: 'Line out', type: 'shielded 3-wire 28 AWG, JST SH', cost: .18, per: .03, kind: 'signal' },
  motor: { to: 'board', label: 'Motor', type: '2-wire 28 AWG, JST SH', cost: .08, per: .02, kind: 'power' },
  mic: { to: 'board', label: 'Microphone', type: '5-wire 30 AWG, JST SH', cost: .12, per: .02, kind: 'signal' },
  led: { to: 'board', label: 'LED', type: '4-wire 28 AWG, JST SH', cost: .08, per: .02, kind: 'signal' },
  ttmotor: { to: 'board', label: 'Motor', type: '4-wire 26 AWG (12 V, speed sense), JST XH', cost: .15, per: .02, kind: 'signal' },
  cartridge: { to: 'board', label: 'Tonearm wiring', type: '4-wire 38 AWG litz, shielded, to the phono input', cost: .9, per: .06, kind: 'signal' },
  hpdriver: { to: 'board', label: 'Driver', type: '2-wire 32 AWG litz, soldered', cost: .08, per: .02, kind: 'power' },
  li18650: { to: 'board', label: 'Cells', type: '2-wire 18 AWG on nickel strip, JST VH', cost: .2, per: .03, kind: 'power' },
  ledcob: { to: 'board', label: 'LED', type: '2-wire 22 AWG, JST PH', cost: .12, per: .02, kind: 'power' },
  touch: { to: 'board', label: 'Touch pad', type: '3-wire 30 AWG, JST SH', cost: .1, per: .02, kind: 'signal' },
  dcjack: { to: 'board', label: 'DC input', type: '2-wire 20 AWG, JST VH', cost: .1, per: .02, kind: 'power' },
  antenna: { to: 'board', label: 'Antenna', type: 'U.FL to RP-SMA, 1.13 mm coax', cost: .35, per: .05, kind: 'coax' }
};
export const CABLE_INK = { power: '#b3261e', mains: '#3a3d40', signal: '#e8e6df', ribbon: '#c98b2b', coax: '#141416' };
// a cable's two ends sit on the faces of the parts' boxes that look at each other
function endOf(p, to) { const d = to.map((v, k) => v - p.at[k]), t = Math.min(...[0, 1, 2].map(k => Math.abs(d[k]) < 1e-9 ? Infinity : p.size[k] / 2 / Math.abs(d[k]))); const at = p.at.map((v, k) => v + d[k] * Math.min(t, 1)), k = [0, 1, 2].reduce((a, b) => Math.abs(d[b]) * p.size[a] > Math.abs(d[a]) * p.size[b] ? b : a, 0); return { at, n: [0, 1, 2].map(i => i === k ? Math.sign(d[k]) || 1 : 0) }; }
// which way the product faces: the way its front panel (or its display, or its buttons) looks, else toward -y
export function frontOf(s) {
  const flat = p => p && Math.abs(p.dir[2]) < .5 && Math.hypot(p.dir[0], p.dir[1]) > .5, p = s.parts.find(q => /front|panel|fascia|bezel/i.test(q.name) && flat(q)) || s.parts.find(q => ['vfd', 'lcd', 'oled', 'button'].includes(q.elec?.kind) && flat(q));
  return p ? [Math.round(p.dir[0]), Math.round(p.dir[1]), 0] : [0, -1, 0];
}
export function harnessOf(s) {
  if (s.kind !== 'electronics') return [];
  const byId = Object.fromEntries(s.parts.map(p => [p.id, p])), boards = s.parts.filter(p => p.shape === 'pcb').sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2]), board = boards[0];
  const onBoard = p => p.parent && byId[p.parent]?.shape === 'pcb', find = k => s.parts.find(q => q.elec?.kind === k && !onBoard(q));
  const out = [];
  for (const p of s.parts) {
    const c = p.elec && CABLES[p.elec.kind]; if (!c || onBoard(p)) continue;
    const to = c.to === 'psu' ? find('psu') || board : c.to === 'amp' ? find('amp2') || board : board; if (!to || to.id === p.id) continue;
    const a = endOf(p, to.at), b = endOf(to, p.at), mm = Math.round(Math.hypot(...a.at.map((v, k) => v - b.at[k])) * 1.2 / 10) * 10 + 40;
    out.push({ id: `cable-${p.id}`, from: p.id, to: to.id, label: c.label, type: c.type, kind: c.kind, mm, unit: r2(c.cost + c.per * mm / 100) });
  }
  // any other board joins the main one by a flat flex cable
  for (const b of boards.slice(1)) { const a = endOf(b, board.at), e = endOf(board, b.at), mm = Math.round(Math.hypot(...a.at.map((v, k) => v - e.at[k])) * 1.2 / 10) * 10 + 40; out.push({ id: `cable-${b.id}`, from: b.id, to: board.id, label: 'Board to board', type: '12-pin FFC, 0.5 mm pitch', kind: 'ribbon', mm, unit: r2(.2 + .02 * mm / 100) }); }
  return out.map((c, i) => ({ ...c, n: `W${i + 1}` })); // W: a cable assembly's reference designator (IEEE 315)
}
// the cable's run, pulled apart with its parts: a curve leaving each end square to its face, as an assembler routes it (24 points)
export function cablePath(s, c, off = {}) {
  const A = s.parts.find(p => p.id === c.from), B = s.parts.find(p => p.id === c.to); if (!A || !B) return [];
  const mv = p => ({ ...p, at: p.at.map((v, k) => v + (off[p.id]?.[k] || 0)) }), a = endOf(mv(A), mv(B).at), b = endOf(mv(B), mv(A).at), L = Math.hypot(...a.at.map((v, k) => v - b.at[k])), h = Math.max(8, L * .35);
  const P0 = a.at, P1 = a.at.map((v, k) => v + a.n[k] * h), P2 = b.at.map((v, k) => v + b.n[k] * h), P3 = b.at;
  return Array.from({ length: 24 }, (_, i) => { const t = i / 23, u = 1 - t; return [0, 1, 2].map(k => u * u * u * P0[k] + 3 * u * u * t * P1[k] + 3 * u * t * t * P2[k] + t * t * t * P3[k]); });
}
export function partEng(p, s) {
  const R = RESINS[p.resin], pr = PROCESSES[p.process], v = pr.tool === 'roto' || pr.tool === 'blow' ? Math.min(volumeOf(p), surfaceOf(p) * 2) : volumeOf(p), g = p.resin === 'bought in' ? null : r1(v / 1000 * R.rho), shots = s.volume * p.qty * s.years, A = projectedCm2(p);
  const out = { id: p.id, mass: g, volume: r0(v), tool: null, unit: 0 };
  if (pr.tool === 'mould') {
    const st = toolSteel(shots), cav = p.cavities || (s.volume * p.qty > 200000 ? 4 : s.volume * p.qty > 50000 ? 2 : 1), slides = p.undercuts || 0, tex = TEXTURED.test(p.finish);
    const cost = hund((st.base + st.perCm2 * A) * (1 + .65 * (cav - 1)) * (pr.k || 1) + slides * 1800 + (tex ? 600 : 0));
    const cool = 2 * (shellLike(p) ? p.wall : Math.min(...p.size) / 2) ** 2 * (p.resin === 'PP' ? 1.3 : 1) + 6, cycle = p.process === 'LSR moulding' ? 25 : r1(Math.min(cool, 120));
    const tons = Math.max(50, Math.ceil(A * R.clamp * cav / 10) * 10), rate = 25 + .12 * tons;
    out.tool = { kind: 'Injection mould', steel: st.steel, cavities: cav, slides, cost, weeks: st.weeks + Math.max(0, slides - 2) + (tex ? 1 : 0), tons, cycle, life: shots };
    out.unit = r2(g / 1000 * R.kg * 1.05 + cycle / cav / 3600 * rate);
  } else if (pr.tool === 'roto') { const cost = hund(1500 + 10 * A); out.tool = { kind: 'Rotocast mould (electroformed nickel)', steel: 'Nickel / aluminium', cavities: 1, slides: 0, cost, weeks: 4, cycle: 600, life: shots }; out.unit = r2(g / 1000 * R.kg * 1.08 + .35); }
  else if (pr.tool === 'blow') { const cost = hund(3000 + 20 * A); out.tool = { kind: 'Blow mould', steel: 'Aluminium', cavities: 1, slides: 0, cost, weeks: 5, cycle: 30, life: shots }; out.unit = r2(g / 1000 * R.kg * 1.05 + .12); }
  else if (pr.tool === 'die') { const st = toolSteel(shots), cost = hund((st.base + st.perCm2 * A) * 1.4 + (p.undercuts || 0) * 2200); out.tool = { kind: 'Die-casting die', steel: 'H13 hardened steel', cavities: 1, slides: p.undercuts || 0, cost, weeks: 8, cycle: 40, life: shots }; out.unit = r2(g / 1000 * R.kg * 1.1 + .4); }
  else if (pr.tool === 'stamp') { const cost = hund(2500 + 15 * A); out.tool = { kind: 'Progressive stamping die', steel: 'D2 tool steel', cavities: 1, slides: 0, cost, weeks: 6, cycle: 2, life: shots }; out.unit = r2(g / 1000 * R.kg * 1.2 + .05); }
  else if (pr.tool === 'rule') { const cost = tens(250 + 2 * A); out.tool = { kind: 'Steel-rule cutting die', steel: 'Steel rule', cavities: 1, slides: 0, cost, weeks: 1, cycle: 4, life: shots }; out.unit = r2(g / 1000 * R.kg * 1.15 + .08); }
  else out.unit = r2(p.cost || 0);
  if (/paint/.test(p.finish)) out.unit = r2(out.unit + (/soft-touch/.test(p.finish) ? .45 : .25)); else if (p.finish === 'pad print') out.unit = r2(out.unit + .05); else if (p.finish === 'anodised') out.unit = r2(out.unit + .6);
  return out;
}
// ---- do the parts go together? ------------------------------------------------------------------------------------------------------------------
// Measured off the parts as they are built (their outlines, walls, floors, openings and bosses), point by point, not from the sums that
// placed them: every part touches another, no part's material is in another's, each screw goes through two parts and the parts list carries
// as many as the parts ask for, and the product is the size that was asked for. Each finding carries its `kind` and its measured number.
export const TOUCH = .5, CLASH = .25;
const SOFT = /silicone|TPE|TPU|EVA|soft PVC/, EPS = 1e-6;
export const isScrew = p => /\b(screw|bolt|rivet)s?\b/i.test(p.name) && !p.elec && p.shape === 'cyl';
function inOutline(F, W, D, R, x, y) {
  if (W <= 0 || D <= 0) return false;
  if (F.loop) return inPoly(W > F.w - 1e-3 ? F.loop.out : F.loop.inn, x, y); // a belt: inside its outer outline, or inside its inner one
  if (F.round) return (x * x) / (W * W / 4) + (y * y) / (D * D / 4) <= 1 + EPS;
  const ax = Math.abs(x), ay = Math.abs(y); if (ax > W / 2 + EPS || ay > D / 2 + EPS) return false;
  R = Math.max(0, Math.min(R, W / 2 - .01, D / 2 - .01)); const cx = W / 2 - R, cy = D / 2 - R; return !(ax > cx && ay > cy && (ax - cx) ** 2 + (ay - cy) ** 2 > R * R + EPS);
}
const inHole = (h, x, y) => h.round ? ((x - h.cx) / h.hw) ** 2 + ((y - h.cy) / h.hd) ** 2 <= 1 : Math.abs(x - h.cx) <= h.hw && Math.abs(y - h.cy) <= h.hd;
// is a point in the part's material? plain: its shape with nothing cut out of it and its bosses solid (what a screw goes through)
function inPart(p, F, w, plain = false) { if (!p.spots) return inPiece(p, F, w, plain); return inPiece(p, F, w, plain) || p.spots.some(o => inPiece(p, F, [w[0] - o[0], w[1] - o[1], w[2] - o[2]], plain)); }
function inPiece(p, F, w, plain) {
  const d = [w[0] - p.at[0], w[1] - p.at[1], w[2] - p.at[2]];
  for (const a of F.adds) if (inPiece(a.p, a.F, d, plain)) return true; // in what is moulded on it
  if (p.shape === 'ball') return (d[0] / (p.size[0] / 2)) ** 2 + (d[1] / (p.size[1] / 2)) ** 2 + (d[2] / (p.size[2] / 2)) ** 2 <= 1 + EPS;
  const l = toLocal(p, d), x = l[0], y = l[1], u = F.sgn * l[2];
  for (const b of F.bosses) if (u >= F.uf - EPS && u <= b.ue + EPS) { const q = Math.hypot(x - b.cx, y - b.cy); if (q <= b.R + EPS && (plain || q >= b.rp - EPS)) return true; }
  if (u < F.u0 - EPS || u > F.u1 + EPS || !inOutline(F, F.w, F.d, F.r, x, y)) return false;
  if (F.flange && (u < F.flange.za - EPS || u > F.flange.zb + EPS) && !inOutline(F, F.w * F.flange.k, F.d * F.flange.k, 0, x, y)) return false; // behind the flange, only the body
  if (!F.shell) return plain || !F.holes.some(h => inHole(h, x, y));
  if ((!F.floor || u > F.uf + EPS) && inOutline(F, F.w - 2 * F.t - 2 * EPS, F.d - 2 * F.t - 2 * EPS, Math.max(F.r - F.t, 0), x, y)) return false;
  if (plain) return true;
  if (F.groove && u > F.groove.g + EPS && inOutline(F, F.w - 2 * F.groove.sk - 2 * EPS, F.d - 2 * F.groove.sk - 2 * EPS, Math.max(F.r - F.groove.sk, 0), x, y)) return false; // in the groove round its rim
  if (F.floor && u <= F.uf + EPS) return !F.holes.some(h => inHole(h, x, y));
  for (const m of F.sides) { if (u < m.ua || u > m.ub) continue;
    if (m.phi) { const a = Math.atan2(y / (F.d / 2), x / (F.w / 2)); if ([0, 2 * Math.PI, -2 * Math.PI].some(k => a + k >= m.a && a + k <= m.b)) return false; }
    else { const v = m.wall === 1 ? x : y, c = (m.wall === 1 ? y : x) * m.side; if (v >= m.a && v <= m.b && c > 0) return false; } }
  return true;
}
// points on a part's surface, in the world: round its outline at several heights (inside and out for a housing), across its flat faces, on its bosses
function samplesOf(p, F) {
  const pts = [], Wd = l => { const w = p.shape === 'ball' ? l : toWorld(p, [l[0], l[1], F.sgn * l[2]]); return [w[0] + p.at[0], w[1] + p.at[1], w[2] + p.at[2]]; };
  if (p.shape === 'ball') { const [a, b, c] = p.size.map(v => v / 2); for (let i = 0; i <= 10; i++) for (let j = 0; j < (i % 10 ? 16 : 1); j++) { const th = i / 10 * Math.PI, ph = j / 16 * 2 * Math.PI; pts.push(Wd([a * Math.sin(th) * Math.cos(ph), b * Math.sin(th) * Math.sin(ph), c * Math.cos(th)])); } return pts; }
  const O = outlinesOf(F), oo = denser(O.out, 140, 1), ii = O.inn ? denser(O.inn, 140, 1) : null, nl = Math.max(2, Math.min(7, Math.ceil(F.L / 1.5) + 1)), lv = Array.from({ length: nl }, (_, i) => F.u0 + (F.u1 - F.u0) * i / (nl - 1));
  for (const u of lv) for (const q of oo) pts.push([q[0], q[1], u]);
  if (ii) for (const u of [...new Set([F.uf, ...lv.filter(v => v > F.uf)])]) for (const q of ii) pts.push([q[0], q[1], u]);
  if (O.mid) for (const u of [F.groove.g, (F.groove.g + F.u1) / 2, F.u1]) for (const q of denser(O.mid, 140, 1)) pts.push([q[0], q[1], u]); // round the groove
  if (F.flange) { const bo = denser(O.out.map(q => [q[0] * F.flange.k, q[1] * F.flange.k]), 100, 1); for (const u of [...lv, F.flange.za, F.flange.zb]) { for (const q of bo) pts.push([q[0], q[1], u]); for (const q of oo) pts.push([q[0], q[1], u]); } }
  const grid = (W, D, R, u) => { const n = 7; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = -W / 2 + W * (i + .5) / n, y = -D / 2 + D * (j + .5) / n; if (inOutline(F, W, D, R, x, y)) pts.push([x, y, u]); } };
  if (!F.shell) { grid(F.w, F.d, F.r, F.u0); grid(F.w, F.d, F.r, F.u1); } else if (F.floor) { grid(F.w, F.d, F.r, F.u0); grid(F.w - 2 * F.t, F.d - 2 * F.t, Math.max(F.r - F.t, 0), F.uf); }
  for (const b of F.bosses) for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * Math.PI; for (const R of [b.R, (b.R + b.rp) / 2]) pts.push([b.cx + R * Math.cos(a), b.cy + R * Math.sin(a), b.ue]); }
  for (const h of F.holes) for (const q of denser(holeLoop(h), 32, .5)) for (const u of F.shell ? [F.u0, F.uf] : [F.u0, F.u1]) pts.push([q[0], q[1], u]); // round each opening, where what passes through it comes nearest
  // round each window in a side wall, just outside its edge, on both faces of the wall
  for (const m of F.sides) for (const v of [m.a - .02, (m.a + m.b) / 2, m.b + .02]) for (const u of [m.ua - .02, (m.ua + m.ub) / 2, m.ub + .02]) for (const k of [0, F.t]) {
    if (m.phi) pts.push([(F.w / 2 - k) * Math.cos(v), (F.d / 2 - k) * Math.sin(v), u]); else { const c = m.side * ((m.wall === 1 ? F.d : F.w) / 2 - k); pts.push(m.wall === 1 ? [v, c, u] : [c, v, u]); } }
  const all = pts.map(Wd); for (const a of F.adds) all.push(...samplesOf({ ...a.p, at: a.p.at.map((v, k) => v + p.at[k]) }, a.F));
  return all.filter(w => inPart(p, F, w));
}
// an outline with points added along it, no further apart than its length over n (and no closer than lo)
function denser(P, n, lo) { const per = P.reduce((s, q, i) => s + Math.hypot(q[0] - P[(i + 1) % P.length][0], q[1] - P[(i + 1) % P.length][1]), 0), step = Math.max(lo, per / n), out = []; P.forEach((q, i) => { const m = P[(i + 1) % P.length], L = Math.hypot(m[0] - q[0], m[1] - q[1]); if (L < 1e-9) return; const k = Math.max(1, Math.ceil(L / step)); for (let j = 0; j < k; j++) out.push([q[0] + (m[0] - q[0]) * j / k, q[1] + (m[1] - q[1]) * j / k]); }); return out; }
// points inside a part's material that lie in a box of the world: down the middle of its walls and floor, and a grid through a solid
function coreOf(p, F, lo, hi) {
  const pts = [], n = 6; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) pts.push([lo[0] + (hi[0] - lo[0]) * (i + .5) / n, lo[1] + (hi[1] - lo[1]) * (j + .5) / n, lo[2] + (hi[2] - lo[2]) * (k + .5) / n]);
  if (F.shell && p.shape !== 'ball') { const Wd = l => { const w = toWorld(p, [l[0], l[1], F.sgn * l[2]]); return [w[0] + p.at[0], w[1] + p.at[1], w[2] + p.at[2]]; }, a = toLocal(p, lo.map((v, k) => v - p.at[k])), b = toLocal(p, hi.map((v, k) => v - p.at[k]));
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), ua = Math.max(F.uf, Math.min(F.sgn * a[2], F.sgn * b[2])), ub = Math.min(F.u1, Math.max(F.sgn * a[2], F.sgn * b[2]));
    const O = outlinesOf(F), mid = denser(O.out.map((q, i) => [(q[0] + O.inn[i][0]) / 2, (q[1] + O.inn[i][1]) / 2]), 260, .5).filter(q => q[0] >= x0 - EPS && q[0] <= x1 + EPS && q[1] >= y0 - EPS && q[1] <= y1 + EPS);
    if (ub >= ua) for (let i = 0; i < 5; i++) { const u = ua + (ub - ua) * (i + .5) / 5; for (const q of mid) pts.push(Wd([q[0], q[1], u])); }
    if (F.floor) for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) pts.push(Wd([x0 + (x1 - x0) * (i + .5) / 12, y0 + (y1 - y0) * (j + .5) / 12, (F.u0 + F.uf) / 2])); }
  return pts.filter(w => w.every((v, k) => v >= lo[k] - EPS && v <= hi[k] + EPS) && inPart(p, F, w));
}
// how far inside a part's material a point is: the shortest way out along the axes and across the part
function depthIn(p, F, w) {
  const c = toWorld(p, [1, 0, 0]), e = toWorld(p, [0, 1, 0]), l = toLocal(p, w.map((v, k) => v - p.at[k])), h = Math.hypot(l[0], l[1]) || 1, rad = [0, 1, 2].map(k => (c[k] * l[0] + e[k] * l[1]) / h);
  let best = Infinity; for (const d of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], rad, rad.map(v => -v)]) {
    const inAt = t => inPart(p, F, [w[0] + d[0] * t, w[1] + d[1] * t, w[2] + d[2] * t]); let a = 0, b = null; for (const t of [.05, .1, .25, .5, 1, 2, 4, 8, 16, 32]) { if (t >= best) break; if (!inAt(t)) { b = t; break; } a = t; }
    if (b == null) continue; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (inAt(m)) a = m; else b = m; } best = Math.min(best, b); }
  return best === Infinity ? 32 : best;
}
// for tests and tools: is this point of the world in the part's material (its openings open, its bosses standing)?
export const inMaterial = (p, w) => inPart(p, featuresOf(p), w);
// the box a part's material lies in: every piece of it, its bosses where they stand past its rim, and what is moulded on it
const boxOf = p => { const os = [[0, 0, 0], ...(p.spots || [])], bs = [...(p.bosses || []).map(b => ({ c: b.at, r: [0, 1, 2].map(() => Math.max(b.d * 1.2, b.d / 2 + 1.2)) })), ...(p.adds || []).map(b => ({ c: b.at, r: b.size.map(v => v / 2) }))]; return { lo: p.size.map((v, k) => p.at[k] + Math.min(-v / 2, ...bs.map(b => b.c[k] - b.r[k])) + Math.min(...os.map(o => o[k]))), hi: p.size.map((v, k) => p.at[k] + Math.max(v / 2, ...bs.map(b => b.c[k] + b.r[k])) + Math.max(...os.map(o => o[k]))) }; };
// everything the fit checks measure, by kind: { contact, clash, fasteners, size }, each a list of { id, level, kind, text, ... }
export function fitOf(s) {
  const parts = s.parts, n = parts.length, F = parts.map(featuresOf), B = parts.map(boxOf), S = new Array(n), smp = i => S[i] || (S[i] = samplesOf(parts[i], F[i])), name = p => p.name, low = p => p.name.toLowerCase();
  const out = { contact: [], clash: [], fasteners: [], size: [], lip: [], snap: [], thread: [], hinge: [], belt: [], opening: [] }, say = (kind, id, level, text, more = {}) => out[kind].push({ id, level, kind, text, ...more });
  const gap = (i, j) => Math.max(...[0, 1, 2].map(k => Math.max(B[j].lo[k] - B[i].hi[k], B[i].lo[k] - B[j].hi[k])));
  // ---- clash: one part's material in another's, deeper than a rounding ----
  const hard = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = parts[i], b = parts[j]; if (isScrew(a) || isScrew(b) || a.fix === 'moulded in' || b.fix === 'moulded in') continue;
    const lo = [0, 1, 2].map(k => Math.max(B[i].lo[k], B[j].lo[k])), hi = [0, 1, 2].map(k => Math.min(B[i].hi[k], B[j].hi[k])); if (lo.some((v, k) => hi[k] - v < CLASH)) continue;
    const inBox = w => w.every((v, k) => v >= lo[k] - EPS && v <= hi[k] + EPS); let deep = 0, hits = 0;
    const probe = (x, y, pts) => { let done = 0; for (const w of pts) { if (!inPart(parts[y], F[y], w)) continue; hits++; if (done++ > 60 && deep >= CLASH) continue; const d = depthIn(parts[y], F[y], w); if (d > deep) deep = d; } };
    probe(i, j, [...smp(i).filter(inBox), ...coreOf(a, F[i], lo, hi)]); probe(j, i, [...smp(j).filter(inBox), ...coreOf(b, F[j], lo, hi)]);
    if (deep < CLASH) continue; const soft = SOFT.test(a.resin) || SOFT.test(b.resin), d = r1(deep);
    if (soft) { if (deep > 1.5) say('clash', a.id, 'warn', `${name(a)} and ${name(b)}: the soft part is squeezed ${d} mm; more than 1.5 mm will not seat. Give it room.`, { with: b.id, depth: d }); continue; }
    hard.push([i, j]);
    const host = [a, b].find(q => shellLike(q)), guest = host === a ? b : a;
    say('clash', guest.id, 'bad', host ? `${name(guest)} goes ${d} mm into the ${shellLike(guest) ? 'material' : 'wall'} of ${low(host)} where it has no opening. Move it clear, make it smaller, or have it pass through ${low(host)} so an opening is cut for it.` : `${name(a)} and ${name(b)} are in the same material, ${d} mm deep. Move one of them, or have one pass through the other so an opening is cut.`, { with: host ? host.id : b.id, depth: d });
  }
  if (!out.clash.some(c => c.level === 'bad') && n > 1) say('clash', parts[0].id, 'ok', `No part is in another's material (walls, corners and openings measured, to ${CLASH} mm).`);
  // ---- contact: every part touches another, and all of them hang together ----
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]], diag = [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]].map(d => d.map(v => v * Math.SQRT1_2));
  const nearTo = (j, w, t, wide) => { if (w.some((v, k) => v < B[j].lo[k] - t - EPS || v > B[j].hi[k] + t + EPS)) return false; const p = parts[j], f = F[j]; if (inPart(p, f, w)) return true; const c = p.at.map((v, k) => v - w[k]), l = Math.hypot(...c) || 1;
    for (const d of [...dirs, c.map(v => v / l), ...(wide ? diag : [])]) if (inPart(p, f, [w[0] + d[0] * t, w[1] + d[1] * t, w[2] + d[2] * t])) return true; return false; };
  const touch = (i, j, t, wide) => gap(i, j) <= t && (smp(i).some(w => nearTo(j, w, t, wide)) || smp(j).some(w => nearTo(i, w, t, wide)));
  const adj = Array.from({ length: n }, () => []); for (const [i, j] of hard) { adj[i].push(j); adj[j].push(i); }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!adj[i].includes(j) && touch(i, j, TOUCH)) { adj[i].push(j); adj[j].push(i); }
  const comp = new Array(n).fill(-1); let nc = 0; for (let i = 0; i < n; i++) if (comp[i] < 0) { const st = [i]; comp[i] = nc; while (st.length) { const x = st.pop(); for (const y of adj[x]) if (comp[y] < 0) { comp[y] = nc; st.push(y); } } nc++; }
  const groups = Array.from({ length: nc }, (_, c) => parts.map((_, i) => i).filter(i => comp[i] === c)), vol = i => parts[i].size[0] * parts[i].size[1] * parts[i].size[2], weight = g => g.length * 1e12 + g.reduce((t, i) => t + vol(i), 0), main = groups.reduce((a, b) => (weight(b) > weight(a) ? b : a), groups[0] || []);
  for (const g of groups) { if (g === main) continue; const lead = g.reduce((a, b) => (vol(b) > vol(a) ? b : a)), rest = parts.map((_, i) => i).filter(i => comp[i] !== comp[lead]);
    // how far off: the smallest reach at which the group touches something outside itself
    let near = null, lo = TOUCH, hi = null; for (const t of [1, 2, 4, 8, 16, 32, 64, 128]) { const j = rest.find(j => g.some(i => touch(i, j, t, true))); if (j != null) { hi = t; near = j; break; } lo = t; }
    if (hi != null) for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2, j = rest.find(j => g.some(i => touch(i, j, m, true))); if (j != null) { hi = m; near = j; } else lo = m; }
    const others = g.length - 1, who = `${name(parts[lead])}${others ? ` and the ${others} part${others > 1 ? 's' : ''} on it` : ''}`;
    say('contact', parts[lead].id, 'warn', `${who} touch${others ? '' : 'es'} nothing${others ? ' else' : ''}: ${hi != null ? `the nearest part, ${low(parts[near])}, is ${r1(hi)} mm away` : 'no other part is within 128 mm'} (within ${TOUCH} mm counts as touching). Seat ${others ? 'them' : 'it'} on what holds ${others ? 'them' : 'it'}, or add the part that does.`, { gap: hi != null ? r1(hi) : null, parts: g.map(i => parts[i].id) }); }
  if (!out.contact.length && n > 1) say('contact', parts[0].id, 'ok', `Every part touches another and the product hangs together (within ${TOUCH} mm).`);
  // ---- fasteners: as many on the parts list as the parts ask for, and each one through two parts ----
  const screws = parts.filter(isScrew), fixed = parts.filter(p => p.fix === 'screws' && !isScrew(p)), need = fixed.reduce((t, p) => t + Math.max(1, p.fixQty) * p.qty, 0), have = screws.reduce((t, p) => t + p.qty, 0);
  if (need !== have) say('fasteners', (screws[0] || fixed[0]).id, 'warn', `Screws: the parts fixed by screws ask for ${need} (${fixed.map(p => `${low(p)} ${Math.max(1, p.fixQty) * p.qty}`).join(', ') || 'none'}) and the parts list carries ${have}${screws.length ? ` (${screws.map(p => `${p.name} × ${p.qty}`).join(', ')})` : ''}. Make them agree.`, { need, have });
  let loose = 0; for (const sc of screws) { const i0 = parts.indexOf(sc), ax = sc.size.indexOf(Math.max(...sc.size)), L = sc.size[ax], N = Math.max(8, Math.ceil(L / .1));
    [[0, 0, 0], ...(sc.spots || [])].forEach((o, pc) => { const len = {}; for (let k = 0; k < N; k++) { const w = sc.at.map((v, q) => v + o[q]); w[ax] += -L / 2 + L * (k + .5) / N; for (let j = 0; j < n; j++) if (j !== i0 && !isScrew(parts[j]) && w.every((v, q) => v >= B[j].lo[q] - 5 && v <= B[j].hi[q] + 5) && inPart(parts[j], F[j], w, true)) len[j] = (len[j] || 0) + L / N; }
      const thru = Object.keys(len).filter(j => len[j] >= .5); if (thru.length >= 2) return; loose++;
      say('fasteners', sc.id, 'warn', `${sc.name}${sc.spots?.length ? ` (piece ${pc + 1} of ${sc.qty})` : ''}: goes through ${thru.length ? `only ${low(parts[thru[0]])} (${r1(len[thru[0]])} mm of its ${L} mm)` : 'no part at all'}; a screw joins two parts. Put it through the part it holds and into the part that takes its thread.`, { through: thru.map(j => parts[j].id), piece: pc + 1 }); }); }
  if (screws.length && need === have && !loose) say('fasteners', screws[0].id, 'ok', `Screws: ${have} on the parts list for the ${need} the parts ask for, each through two parts.`);
  // ---- size: what was asked for against what the parts make ----
  if (s.dims) { const e = extentOf(parts).size, want = [s.dims.w, s.dims.d, s.dims.h], off = [0, 1, 2].filter(k => Math.abs(e[k] - want[k]) > .5);
    if (off.length) say('size', parts[0].id, 'warn', `Size: the parts make ${e.map(r1).join(' × ')} mm against the ${want.join(' × ')} mm asked for: ${off.map(k => `${r1(Math.abs(e[k] - want[k]))} mm ${e[k] > want[k] ? 'more' : 'less'} ${['wide', 'deep', 'tall'][k]}`).join(', ')}. Bring the parts inside the size, or start again at the size you want.`, { made: e.map(r1), asked: want });
    else say('size', parts[0].id, 'ok', `Size: ${e.map(r1).join(' × ')} mm, as asked.`, { made: e.map(r1), asked: want }); }
  // ---- lip and groove: where two halves close, the lip of one stands in the groove of the other; measured round the lip, off the two parts ----
  for (const a of parts) { if (!a.lip) continue; const b = parts.find(p => p.id === a.lip.into), ib = parts.indexOf(b), L = lipPair(a, b), lip = (a.adds || []).find(x => x.kind === 'lip');
    if (L.why || !lip || b.groove?.for !== a.id) { say('lip', a.id, 'bad', `${name(a)} has a lip for ${b ? low(b) : 'another half'}, but ${L.why || `${low(b)} already takes another part's lip`}, so nothing locates the two. Close them rim to rim, or take the lip off.`, { with: a.lip.into }); continue; }
    const B = { ...lip, at: lip.at.map((v, k) => v + a.at[k]) }, FB = featuresOf(B), O = outlinesOf(FB), n = O.out.length, Wd = l => toWorld(B, l).map((v, k) => v + B.at[k]), up = toLocal(B, [0, 1, 2].map(k => (k === L.ax ? L.sa : 0)));
    // from the lip's outer face out to the groove's wall, and from its top on to the groove's floor: how far before the other half's material
    const march = (w, d) => { if (inPart(b, F[ib], w)) return 0; for (let t = .02; t <= 1.21; t += .02) if (inPart(b, F[ib], [w[0] + d[0] * t, w[1] + d[1] * t, w[2] + d[2] * t])) return t; return null; };
    const side = [], top = []; let all = 0;
    const round = FB.round ? Array.from({ length: 120 }, (_, i) => { const q = i / 120 * 2 * Math.PI, c = Math.cos(q), s2 = Math.sin(q), l = Math.hypot(c / FB.w, s2 / FB.d) || 1; return [FB.w / 2 * c, FB.d / 2 * s2, c / FB.w / l, s2 / FB.d / l]; }) : null, flat = [];
    if (!round) { const per = O.out.reduce((t, q, i) => t + Math.hypot(O.out[(i + 1) % n][0] - q[0], O.out[(i + 1) % n][1] - q[1]), 0); // evenly round the outline, so a corner counts for its length
      for (let i = 0; i < n; i++) { const p0 = O.out[i], p1 = O.out[(i + 1) % n], len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); if (len < 1e-6) continue; const k = Math.max(1, Math.round(len / (per / 200))); for (let j = 0; j < k; j++) { const f = (j + .5) / k; flat.push([p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, (p1[1] - p0[1]) / len, -(p1[0] - p0[0]) / len]); } } }
    for (const [x, y, nx, ny] of round || flat) { if (!inPart(B, FB, Wd([x - nx * .05, y - ny * .05, 0]))) continue; all++; // not where the lip is cut away for an opening
      const s1 = march(Wd([x, y, 0]), toWorld(B, [nx, ny, 0])); if (s1 == null) continue; side.push(s1); const t1 = march(Wd([x - nx * L.tl / 2, y - ny * L.tl / 2, up[2] * (a.lip.h + SINK) / 2]), toWorld(B, up)); if (t1 != null) top.push(t1); }
    const eng = r2(a.lip.h - L.gap), share = all ? side.length / all : 0, c0 = side.length ? Math.min(...side) : 0, c1 = side.length ? Math.max(...side) : 0, t0 = top.length ? Math.min(...top) : null, more = { with: b.id, engaged: eng, clear: [r2(c0), r2(c1)], top: t0 == null ? null : r2(t0), skin: L.sk, round: r2(share) };
    const what = `The lip of ${low(a)} (${L.tl} mm thick, ${a.lip.h} mm tall)`;
    if (share < .5) say('lip', a.id, 'bad', `${what} finds the groove of ${low(b)} for only ${Math.round(share * 100)}% of its way round: the two halves are not the same outline where they meet. Make them the same size there.`, more);
    else if (eng < .3) say('lip', a.id, 'bad', `${what} stands only ${r1(Math.max(eng, 0))} mm into ${low(b)}: it locates nothing. Close the halves rim to rim, or make the lip taller.`, more);
    else if (c0 < .02) say('lip', a.id, 'bad', `${what} is hard against the wall of its groove in ${low(b)}: no clearance is left, so the halves will not close. Thin the lip or line the two halves up.`, more);
    else { const notes = [share < .9 && `it finds the groove for only ${Math.round(share * 100)}% of its way round (the two outlines differ where they meet)`, c1 > .35 && `it is ${r1(c1)} mm clear of the groove at its loosest, so the halves can shift`, eng < .8 && `it stands only ${r1(eng)} mm into the groove (0.8 mm or more locates well)`, L.sk < .6 && `only ${r1(L.sk)} mm of ${low(b)}'s wall is left outside it (0.6 mm or more fills)`, L.tl < .5 && `it is ${L.tl} mm thick (0.5 mm or more fills)`, t0 != null && t0 < .05 && 'its top is on the groove\'s floor before the rims meet', L.step > .3 && `the two outsides step ${r1(L.step)} mm at the seam`].filter(Boolean);
      if (notes.length) say('lip', a.id, 'warn', `${what} in the groove of ${low(b)}: ${notes.join('; ')}.`, more);
      else say('lip', a.id, 'ok', `Lip and groove: ${low(a)} locates ${low(b)}. ${what} stands ${r1(eng)} mm into its groove, ${r1(c0)} mm clear at the side and ${t0 == null ? LIP_TOP : r1(t0)} mm at its top, with ${r1(L.sk)} mm of wall left outside it.`, more); } }
  // ---- snap hooks: each joined to its part, a catch for it on the other part, how far it catches, how much it bends going home, room to bend ----
  for (const a of parts) { if (!a.snaps) continue; const S = a.snaps, b = parts.find(p => p.id === S.into); if (!b) { say('snap', a.id, 'bad', `${name(a)} has snap hooks for a part that is not there. Say which part they catch on.`, {}); continue; }
    const Fa = bare(a), Fb = bare(b), lim = SNAP_STRAIN[a.resin], Le = S.len - Math.min(HEAD, S.len / 3); let worst = 0, least = Infinity, wrong = 0;
    const tell = (k, level, text, more) => { wrong++; say('snap', a.id, level, `${name(a)}, snap hook ${k + 1} of ${S.hooks.length}: ${text}`, { with: b.id, hook: k + 1, ...more }); };
    if (!lim) { wrong++; say('snap', a.id, 'warn', `${name(a)} has snap hooks, and ${a.resin} is not a resin a hook is moulded in: it will not bend and spring back. Hold it another way, or make it in a resin that does.`, { with: b.id }); }
    S.hooks.forEach((h, k) => { const H = hookBodies(a, b, Fa, Fb, S, h), strain = H.eng > 0 ? r2(150 * S.t * H.eng / (Le * Le)) : 0;
      if (!H.joined) return tell(k, 'bad', `it is not joined to ${low(a)}: there is no wall within 4 mm of its root. Move it to a wall.`, {});
      if (H.gapB == null) return tell(k, 'bad', `it finds no wall of ${low(b)} to catch on within 4 mm of its head. Move it to where the two parts overlap, or lengthen it.`, {});
      if (!H.ledge || H.gapB < S.y + .05) return tell(k, 'bad', `its head stands ${S.y} mm out and the wall of ${low(b)} is ${H.gapB} mm away: the head is in the wall, with no room for a catch. Move the hook ${r1(S.y + .2 - H.gapB)} mm in, or shorten the head.`, { room: H.gapB });
      // room behind it: the beam bends back by what it catches, most at its tip, as the head rides over the catch
      let tight = null; for (const f of [.5, .75, 1]) for (const tw of [-.4, 0, .4]) { const need = (H.eng + .1) * f * f, w0 = H.pos(S.len * f - (f === 1 ? .05 : 0), -S.t / 2 - .02).map((v, i) => v + H.T3[i] * tw * S.w);
        for (let j = 0; j < n && !tight; j++) { if (w0.some((v, i) => v < B[j].lo[i] - 2 || v > B[j].hi[i] + 2)) continue; for (let d = 0; d <= need + 1e-9; d += .05) if (inPart(parts[j], F[j], w0.map((v, i) => v - H.O[i] * d))) { tight = { j, gap: r2(d), need: r2(need) }; break; } } }
      if (tight) return tell(k, 'bad', `it cannot bend: ${low(parts[tight.j])} is ${tight.gap} mm behind it and it has to move ${tight.need} mm there to pass its catch. Move the hook, or what is behind it.`, { behind: parts[tight.j].id, gap: tight.gap });
      if (lim && strain > lim) return tell(k, strain > lim * 1.5 ? 'bad' : 'warn', `it bends ${strain}% as it is pushed home and ${a.resin} takes about ${lim}% (${snapFrom(a.resin)}): it will whiten or break. Lengthen it to ${r1(Math.sqrt(150 * S.t * H.eng / lim) + Math.min(HEAD, S.len / 3))} mm, thin it, or let it catch less.`, { strain, engaged: H.eng });
      if (H.eng < .4) return tell(k, 'warn', `it catches only ${H.eng} mm under its catch (0.4 mm or more holds). Let its head stand further out.`, { engaged: H.eng });
      worst = Math.max(worst, strain); least = Math.min(least, H.eng); });
    if (!wrong && S.hooks.length < 2) say('snap', a.id, 'warn', `${name(a)} is held on ${low(b)} by one snap hook: it will rock on it. Give it two or more, on opposite sides.`, { with: b.id, hooks: 1 });
    else if (!wrong) say('snap', a.id, 'ok', `Snap fit: ${low(a)} holds on ${low(b)} by ${S.hooks.length} hooks (${S.len} mm long, ${S.t} mm thick, ${S.w} mm wide). Each catches ${least} mm under a catch on ${low(b)} and bends ${worst}% as it is pushed home (${a.resin} takes about ${lim}%: ${snapFrom(a.resin)}), with room behind it to bend.`, { with: b.id, hooks: S.hooks.length, engaged: least, strain: worst }); }
  // ---- a thread: the two diameters agreeing (the one part's outside with the thread on it inside the other's bore), the flanks catching, the
  //      turns fitting in the length the two overlap; measured off the two parts. The thread's turns are not in the solids. ----
  for (const a of parts) { if (!a.thread) continue; const T = a.thread, b = parts.find(p => p.id === T.onto), ax = axisOf(a), cr = [0, 1, 2].filter(k => k !== ax), circ = p => ROUND.has(p.shape) && Math.abs(p.size[cr[0]] - p.size[cr[1]]) < .05;
    if (!b || axisOf(b) !== ax || !circ(a) || !circ(b)) { say('thread', a.id, 'bad', `${name(a)} is to screw onto ${b ? low(b) : 'a part that is not there'}, and a thread needs two round parts on one axis. Make both round, lying the same way.`, { with: T.onto }); continue; }
    const [m, f] = a.size[cr[0]] < b.size[cr[0]] ? [a, b] : [b, a], off = r2(Math.hypot(...cr.map(k => a.at[k] - b.at[k]))), neck = m.size[cr[0]], tf = shellLike(f) ? Math.min(f.wall, f.size[cr[0]] / 2 - .2) : null;
    if (tf == null) { say('thread', a.id, 'bad', `${name(a)} and ${low(b)}: ${low(f)} is solid, so there is nothing for ${low(m)} to screw into. Make it a cup or a ring.`, { with: b.id }); continue; }
    const bore = r2(f.size[cr[0]] - 2 * tf), major = r2(neck + 2 * T.depth), minor = r2(bore - 2 * T.depth), clear = r2(bore - major), grip = r2(T.depth - Math.max(clear, 0) / 2), need = r2(T.turns * T.pitch);
    // the length the two overlap along the axis: the inner part's length inside the outer part's bore (past its floor, when it has one)
    const o = openOf(f), flo = f.at[ax] - f.size[ax] / 2 + (o === '+' ? tf : 0), fhi = f.at[ax] + f.size[ax] / 2 - (o === '-' ? tf : 0), over = r2(Math.max(0, Math.min(fhi, m.at[ax] + m.size[ax] / 2) - Math.max(flo, m.at[ax] - m.size[ax] / 2)));
    const more = { with: b.id, outside: m.id, inside: f.id, neck, major, bore, minor, clear, grip, need, over }, what = `Thread, ${low(f)} on ${low(m)} (⌀${major} mm over the thread on ${low(m)}, ⌀${bore} mm bore in ${low(f)}, ${T.pitch} mm pitch, ${T.depth} mm deep)`;
    if (off > .15) say('thread', a.id, 'bad', `${what}: the two are ${off} mm off one axis, so the thread cannot start. Centre one on the other.`, { ...more, off });
    else if (clear < 0) say('thread', a.id, 'bad', `${what}: the thread on ${low(m)} is ${r2(-clear)} mm larger than the bore it goes into, so it will not go on. Make ${low(m)} ⌀${r1(bore - .4 - 2 * T.depth)} mm or the bore ⌀${r1(major + .4)} mm.`, more);
    else if (grip <= 0) say('thread', a.id, 'bad', `${what}: the two threads do not reach each other; there is ${r2(clear / 2)} mm each side between them and the thread is ${T.depth} mm deep. Make ${low(m)} ⌀${r1(bore - .4 - 2 * T.depth)} mm, or the thread deeper.`, more);
    else if (need + 1 > over) say('thread', a.id, 'bad', `${what}: ${T.turns} turn${T.turns === 1 ? '' : 's'} need ${need} mm and 1 mm to run out, and ${low(f)} is over ${low(m)} for ${over} mm. Lengthen the overlap, or use fewer turns or a finer pitch.`, more);
    else { const notes = [grip < T.depth * .6 && `the flanks catch ${grip} mm of their ${T.depth} mm (${r2(clear)} mm clear on the diameter; 0.2 to 0.8 mm is usual): it may jump under load`, clear < .2 && `only ${r2(clear)} mm clear on the diameter: it will bind once the parts shrink (0.2 to 0.8 mm is usual)`, T.turns < 1 && `${T.turns} of a turn holds it: less than one full turn will not pull the lid down square`, T.depth > T.pitch * .6 && `a thread ${T.depth} mm deep at ${T.pitch} mm pitch is too steep to mould and release (keep the depth under 0.6 of the pitch)`].filter(Boolean);
      if (notes.length) say('thread', a.id, 'warn', `${what}: ${notes.join('; ')}.`, more);
      else say('thread', a.id, 'ok', `${what}: the diameters agree with ${r2(clear)} mm clear, the flanks catch ${grip} mm, and ${T.turns} turns take ${need} mm of the ${over} mm the two overlap. The STL and STEP show the two walls at the thread's roots (⌀${neck} mm and ⌀${bore} mm); the turns themselves are not drawn in them.`, more); } }
  // ---- a hinge: the pin through the knuckles of two housings, each knuckle joined to its housing, their places along the pin, and how far
  //      the half that moves swings before it meets the other, turned about the pin and measured point by point ----
  for (const pin of parts) { const hs = parts.filter(h => h.knuckles?.pin === pin.id); if (!hs.length) continue; const pa = axisOf(pin), lo = pin.at[pa] - pin.size[pa] / 2, hi = pin.at[pa] + pin.size[pa] / 2; let wrong = 0;
    const tell = (level, text, more = {}) => { wrong++; say('hinge', pin.id, level, `${name(pin)}: ${text}`, more); };
    if (pin.shape !== 'cyl') { tell('bad', `${hs.map(low).join(' and ')} turn on it, and a pin is a round bar. Make it a cylinder.`); continue; }
    const ks = hs.flatMap(h => { const Fh = bare(h); return h.knuckles.at.map(off => ({ h, off, ...knuckleBodies(h, pin, Fh, off) })); }).sort((x, y) => x.off - y.off), pd = ks[0].pd;
    if (hs.length !== 2) tell('bad', `only ${low(hs[0])} has knuckles on it; a hinge joins two parts. Give the other half its knuckles.`);
    for (const k of ks) { const a0 = pin.at[pa] + k.off - k.h.knuckles.len / 2, a1 = a0 + k.h.knuckles.len, at = r1(k.off);
      if (!k.ring) tell('bad', `the knuckle of ${low(k.h)} at ${at} mm is ${k.h.knuckles.d} mm across on a ${pd} mm pin: under 0.6 mm of wall round the bore. Make it ${r1(pd + 1.4)} mm or more across.`, { part: k.h.id });
      else if (a0 < lo - .05 || a1 > hi + .05) tell('bad', `it stops ${r1(Math.max(lo - a0, a1 - hi))} mm short of the end of the knuckle of ${low(k.h)} at ${at} mm. Lengthen the pin, or move the knuckle onto it.`, { part: k.h.id, short: r1(Math.max(lo - a0, a1 - hi)) });
      else if (k.g == null) tell('bad', `the knuckle of ${low(k.h)} at ${at} mm is not joined to it: no wall of ${low(k.h)} is within ${r1(k.h.knuckles.d / 2 + 3)} mm of the pin. Move the pin to the wall.`, { part: k.h.id });
      else if (k.g < k.h.knuckles.d / 2 - .26) tell('bad', `the knuckle of ${low(k.h)} at ${at} mm (${k.h.knuckles.d} mm across) is ${r1(k.h.knuckles.d / 2 - k.g)} mm into the wall behind it, which is ${r1(k.g)} mm from the pin: the other half's wall is in the same place, so the two cannot turn. Move the pin ${r1(k.h.knuckles.d / 2 + .2 - k.g)} mm out.`, { part: k.h.id, wall: r1(k.g) }); }
    // along the pin: no two knuckles in the same place, and the two halves' knuckles close enough that neither slides
    let slack = 0; for (let i = 1; i < ks.length; i++) { const a = ks[i - 1], b = ks[i], gp = r2((b.off - b.h.knuckles.len / 2) - (a.off + a.h.knuckles.len / 2));
      if (gp < .05) tell('bad', `the knuckles at ${r1(a.off)} mm (${low(a.h)}) and ${r1(b.off)} mm (${low(b.h)}) are ${gp < 0 ? `${-gp} mm into each other` : 'hard against each other'} along it. Leave 0.2 mm or more between them.`, { gap: gp }); else if (a.h !== b.h) slack = Math.max(slack, gp); }
    if (wrong || hs.length !== 2) continue;
    const [fx, mv] = hs[0].order <= hs[1].order ? hs : [hs[1], hs[0]], ifx = parts.indexOf(fx), imv = parts.indexOf(mv), c1 = (pa + 1) % 3, c2 = (pa + 2) % 3;
    const turn = (w, q) => { const o = [...w], y = w[c1] - pin.at[c1], z = w[c2] - pin.at[c2], cs = Math.cos(q), sn = Math.sin(q); o[c1] = pin.at[c1] + y * cs - z * sn; o[c2] = pin.at[c2] + y * sn + z * cs; return o; };
    const hits = (i, j, q) => smp(i).some(w0 => { const w = turn(w0, q); return !w.some((v, k) => v < B[j].lo[k] - 1e-6 || v > B[j].hi[k] + 1e-6) && inPart(parts[j], F[j], w) && depthIn(parts[j], F[j], w) >= CLASH; });
    let opens = 0; for (const sgn of [1, -1]) { let a = 180; for (let d = 5; d <= 180; d += 5) if (hits(imv, ifx, sgn * d * Math.PI / 180) || hits(ifx, imv, -sgn * d * Math.PI / 180)) { a = d - 5; break; } opens = Math.max(opens, a); }
    const n1 = ks.length, more = { parts: [fx.id, mv.id], knuckles: n1, opens, slack, bore: r2(pd + .2) }, what = `Hinge: ${low(mv)} turns on ${low(pin)} (⌀${pd} mm, in ⌀${r2(pd + .2)} mm bores) through ${n1} knuckles, ${ks.filter(k => k.h === fx).length} on ${low(fx)} and ${ks.filter(k => k.h === mv).length} on ${low(mv)}`;
    if (opens < 45) say('hinge', pin.id, 'bad', `${what}, but it opens only ${opens}° before ${low(mv)} meets ${low(fx)}. Move the pin out to the back of the two walls, at the height where they meet.`, more);
    else if (opens < 90 || slack > 1) say('hinge', pin.id, 'warn', `${what}: ${[opens < 90 && `it opens ${opens}° before ${low(mv)} meets ${low(fx)} (90° or more lets a hand in)`, slack > 1 && `${low(mv)} can slide ${slack} mm along the pin between the other half's knuckles (keep it under 1 mm)`].filter(Boolean).join('; ')}.`, more);
    else say('hinge', pin.id, 'ok', `${what}, each joined to its half by a lug, ${slack} mm apart along the pin. ${name(mv)} opens ${opens === 180 ? 'right over (180°)' : `${opens}°`} before it meets ${low(fx)}.`, more); }
  // ---- a belt: round its two wheels, level on both, and the length it is bought at against the path measured off them ----
  for (const p of parts) { if (!p.around) continue; const byId = Object.fromEntries(parts.map(q => [q.id, q])), G = beltOn(p, byId);
    if (G.why || !p.loop) { say('belt', p.id, 'bad', `${name(p)} cannot run: ${G.why || 'it is not drawn as a ring'}. A belt runs round two round parts that lie its way and stand apart.`, { with: p.around }); continue; }
    const ax = G.ax, b0 = p.at[ax] - p.size[ax] / 2, b1 = b0 + p.size[ax], offs = [G.P1, G.P2].map((P, i) => { const s = [G.s1, G.s2][i]; return [P, r2(Math.max(s.lo - b0, b1 - s.hi, 0))]; }).filter(x => x[1] > .2);
    const path = r1(G.path), wrap = Math.round(G.wrap), stretch = p.len ? r1((G.path - p.len) / p.len * 100) : null, under = p.len ? r1((G.path - p.len) / G.path * 100) : null, buy = Math.floor(G.path * .95), more = { with: [G.P1.id, G.P2.id], apart: r1(G.C), path, len: p.len ?? null, stretch, under, wrap };
    // How short a flat rubber belt is bought: its suppliers size one 5 to 10% under (PRB Line's catalogue: "deduct 5%-10%"; V-M Audio
    // Enthusiasts: "multiply by .95"), figures given in whole percents and read here against the belt's path. Over 15% stretched fails:
    // that limit is this check's own.
    const what = `${name(p)} round ${low(G.P1)} (⌀${r1(2 * G.s1.r)} mm) and ${low(G.P2)} (⌀${r1(2 * G.s2.r)} mm), ${r1(G.C)} mm apart: a path of ${path} mm`;
    if (offs.length) say('belt', p.id, 'bad', `${what}, but it is not level on ${offs.map(([P, v]) => `${low(P)} (${v} mm of its ${p.size[ax]} mm width is off the edge)`).join(' or ')}: it will walk off. Set the belt and the two running surfaces at one height.`, { ...more, off: offs[0][1] });
    else if (stretch == null) say('belt', p.id, 'warn', `${what}. No length is given for the belt: buy one ${buy} mm round the inside (5% under its path).`, more);
    else if (stretch <= 0 || stretch > 15) say('belt', p.id, 'bad', `${what}, and the belt is bought at ${p.len} mm: ${stretch <= 0 ? `it is ${r1(p.len - G.path)} mm too long and hangs slack` : `it has to stretch ${stretch}%, which it will not take for long`}. Buy one ${buy} mm round the inside (5% under its path: belt suppliers size a flat rubber belt 5 to 10% under).`, more);
    else { const notes = [(Math.round(under) < 5 || Math.round(under) > 10) && `bought at ${p.len} mm it is ${under}% under its path, stretched ${stretch}% (belt suppliers size a flat rubber belt 5 to 10% under: ${buy} mm is 5%)`, wrap < 120 && `it wraps only ${wrap}° of ${low(G.P2)} (120° or more grips)`, G.s2.r < 4 * p.wall && `${low(G.P2)} is ⌀${r1(2 * G.s2.r)} mm for a belt ${p.wall} mm thick (8 times the thickness or more lets it bend round)`].filter(Boolean);
      if (notes.length) say('belt', p.id, 'warn', `${what}: ${notes.join('; ')}.`, more);
      else say('belt', p.id, 'ok', `${what}. Bought at ${p.len} mm round the inside, ${under}% under its path (stretched ${stretch}%), it wraps ${wrap}° of ${low(G.P2)} and lies level on both.`, more); } }
  // ---- a part's own openings: each one really cut; and a cover that slides over one: it covers it shut, clears it open, stays on and meets nothing ----
  const holeAt = (h, Fh, o) => { const l = toLocal(h, o.at), ax = axisOf(h), k = AXN.indexOf(o.axis); if (k === ax) l[2] = Fh.shell && Fh.floor ? Fh.sgn * (Fh.u0 + Fh.uf) / 2 : 0; return toWorld(h, l).map((v, i) => v + h.at[i]); }; // its middle, in the floor or the wall it goes through
  const sizeOf = o => [0, 1, 2].filter(i => i !== AXN.indexOf(o.axis)).map(i => o.size[i]).join(' × ');
  for (const h of parts) { if (!h.holes) continue; const ih = parts.indexOf(h), lost = h.holes.filter(o => { const w = holeAt(h, F[ih], o); return inPart(h, F[ih], w) || !inPart(h, F[ih], w, true); });
    for (const o of lost) say('opening', h.id, 'bad', `${name(h)}: the ${sizeOf(o)} mm opening asked for ${r1(Math.hypot(...o.at))} mm from its middle cannot be cut there: it is off the part, within 0.3 mm of its edge, or on another opening. Move it in.`, { at: o.at });
    if (!lost.length && !parts.some(q => q.slides?.over === h.id)) say('opening', h.id, 'ok', `${name(h)}: ${h.holes.length === 1 ? `its ${sizeOf(h.holes[0])} mm opening is` : `its ${h.holes.length} openings are`} cut through it.`, { openings: h.holes.length }); }
  for (const sl of parts) { if (!sl.slides) continue; const h = parts.find(p => p.id === sl.slides.over), isl = parts.indexOf(sl), ih = parts.indexOf(h), ax = axisOf(h), cr = [0, 1, 2].filter(k => k !== ax), by = sl.slides.by, far = r1(Math.hypot(...by));
    const under = (w, off) => { const q = w.map((v, k) => v - off[k]); q[ax] = sl.at[ax]; return inPart(sl, F[isl], q); }, mine = (h.holes || []).filter(o => AXN.indexOf(o.axis) === ax && under(holeAt(h, F[ih], o), [0, 0, 0]));
    if (!mine.length) { say('opening', sl.id, 'bad', `${name(sl)} slides on ${low(h)}, and there is no opening in ${low(h)} under it. Give ${low(h)} its opening where the slider sits.`, { with: h.id }); continue; }
    for (const o of mine) { const c = holeAt(h, F[ih], o), hw = o.size[cr[0]] / 2, hd = o.size[cr[1]] / 2, rim = m => Array.from({ length: 24 }, (_, i) => { const a = i / 24 * 2 * Math.PI, e = o.round ? [Math.cos(a), Math.sin(a)] : [Math.max(-1, Math.min(1, 1.5 * Math.cos(a))), Math.max(-1, Math.min(1, 1.5 * Math.sin(a)))], w = [...c]; w[cr[0]] += e[0] * (hw + m); w[cr[1]] += e[1] * (hd + m); return w; });
      // shut: how much of the slider lies round the opening; open: is any of the opening still under it
      let cover = 0; for (const m of [.5, 1, 1.5, 2, 3]) { if (!rim(m).every(w => under(w, [0, 0, 0]))) break; cover = m; }
      const still = [c, ...rim(0)].filter(w => under(w, by)).length, more = { with: h.id, opening: [2 * hw, 2 * hd], cover, travel: far };
      const what = `${name(sl)} over the ${sizeOf(o)} mm opening in ${low(h)}`;
      if (cover < .5) { say('opening', sl.id, 'bad', `${what}: shut, it does not cover the opening with 0.5 mm to spare all round, so it leaks. Make the slider larger or the opening smaller.`, more); continue; }
      if (still) { say('opening', sl.id, 'bad', `${what}: slid ${far} mm it still covers part of the opening. Let it slide further, or move the opening toward the end it leaves.`, more); continue; }
      // slid open: nothing in its way, and still on the part it slides on
      // (the same two-way test as the clash check: the moved cover's surface and inside in each part, and each part's in the moved cover)
      const mv = { ...sl, at: sl.at.map((v, k) => v + by[k]) }, Bm = boxOf(mv), Sm = smp(isl).map(w => w.map((v, k) => v + by[k])); let hit = null;
      for (let j = 0; j < n && !hit; j++) { if (j === isl) continue; const lo = [0, 1, 2].map(k => Math.max(Bm.lo[k], B[j].lo[k])), hi = [0, 1, 2].map(k => Math.min(Bm.hi[k], B[j].hi[k])); if (lo.some((v, k) => hi[k] - v < CLASH)) continue; const inBox = w => w.every((v, k) => v >= lo[k] - EPS && v <= hi[k] + EPS);
        if ([...Sm.filter(inBox), ...coreOf(mv, F[isl], lo, hi)].some(w => inPart(parts[j], F[j], w) && depthIn(parts[j], F[j], w) >= CLASH) || [...smp(j).filter(inBox), ...coreOf(parts[j], F[j], lo, hi)].some(w => inPart(mv, F[isl], w) && depthIn(mv, F[isl], w) >= CLASH)) hit = parts[j]; }
      const sg = sl.at[ax] > h.at[ax] ? 1 : -1, lvl = h.at[ax] + sg * (h.size[ax] / 2 - .3), foot = [[0, 0], [.45, 0], [-.45, 0], [0, .45], [0, -.45], [.4, .4], [.4, -.4], [-.4, .4], [-.4, -.4]].map(([a, b]) => { const w = sl.at.map((v, k) => v + by[k]); w[cr[0]] += a * sl.size[cr[0]]; w[cr[1]] += b * sl.size[cr[1]]; w[ax] = lvl; return w; }), offEdge = foot.some(w => !inPart(h, F[ih], w, true));
      if (hit) say('opening', sl.id, 'bad', `${what}: slid ${far} mm to open, it runs into ${low(hit)}. Slide it the other way, or less far with a smaller opening.`, { ...more, into: hit.id });
      else if (offEdge) say('opening', sl.id, 'warn', `${what}: slid ${far} mm to open, it hangs over the edge of ${low(h)}. Keep it on the part.`, more);
      else say('opening', sl.id, 'ok', `${what}: shut, it covers the opening with ${cover} mm or more round it; slid ${far} mm it clears it, stays on ${low(h)} and meets nothing.`, more); } }
  return out;
}
// the moulding and fit checks: [{ id, level: 'bad'|'warn'|'ok', text }]
export function dfm(s) {
  const out = [], say = (id, level, text) => out.push({ id, level, text }), byId = Object.fromEntries(s.parts.map(p => [p.id, p]));
  for (const p of s.parts) {
    const R = RESINS[p.resin], pr = PROCESSES[p.process], big = Math.max(...p.size);
    if (pr.tool === 'mould' && shellLike(p)) {
      if (p.wall < R.wall[0]) say(p.id, 'bad', `${p.name}: a ${p.wall} mm wall is too thin for ${p.resin} (it fills from ${R.wall[0]} mm): it will short-shot. Thicken it to ${R.wall[0]} mm or more.`);
      else if (p.wall > R.wall[1]) say(p.id, 'warn', `${p.name}: a ${p.wall} mm wall is thick for ${p.resin} (up to ${R.wall[1]} mm): sink marks and a long cycle. Core it out to ${R.wall[1]} mm with ribs.`);
      else say(p.id, 'ok', `${p.name}: ${p.wall} mm wall suits ${p.resin} (${R.wall[0]}–${R.wall[1]} mm). Ribs at 50–60% of it (${r1(p.wall * .5)}–${r1(p.wall * .6)} mm), bosses ${r1(p.wall * .6)} mm thick.`);
    }
    if (pr.tool === 'mould' || pr.tool === 'die') {
      const need = TEXTURED.test(p.finish) ? 3 : /SPI A/.test(p.finish) ? .5 : 1;
      if ((p.draft ?? 0) < need) say(p.id, (p.draft ?? 0) < .5 ? 'bad' : 'warn', `${p.name}: ${p.draft ?? 0}° draft; ${p.finish === 'none' ? 'this finish' : p.finish} needs ${need}° or more to release without drag marks.`);
      if (p.undercuts) say(p.id, 'warn', `${p.name}: ${p.undercuts} undercut${p.undercuts > 1 ? 's' : ''} → ${p.undercuts} side action${p.undercuts > 1 ? 's' : ''} or lifter${p.undercuts > 1 ? 's' : ''} in the tool (about $${(p.undercuts * 1800).toLocaleString('en-US')}${p.undercuts > 2 ? ` and ${p.undercuts - 2} more week${p.undercuts === 3 ? '' : 's'}` : ''}). A pass-through core or an opening in the draw direction removes it.`);
      if (!shellLike(p) && p.shape !== 'ball' && Math.min(...p.size) > R.wall[1] * 1.5) say(p.id, 'warn', `${p.name}: solid ${r1(Math.min(...p.size))} mm thick in ${p.resin}: it will sink and take a long cycle. Core it out to a ${R.wall[1]} mm wall, or make it a shell.`);
      if (R.clear && !/SPI A/.test(p.finish)) say(p.id, 'warn', `${p.name}: a clear part needs an SPI A polish to stay clear; ${p.finish} will look frosted.`);
      if (big > 600) say(p.id, 'bad', `${p.name}: ${r0(big)} mm long needs a press over 500 t; split it or check the factory's largest press.`);
    }
    if (p.food && !R.food) say(p.id, 'bad', `${p.name}: touches food or drink, and ${p.resin} is not food-contact grade. Use PP, Tritan, PETG, LSR silicone or 304 stainless (FDA 21 CFR 177 / EU 10/2011).`);
    if (p.parent && byId[p.parent] && !(p.elec && (ELEC[p.elec.kind].port || p.elec.kind === 'usbc'))) { // a socket goes through its wall: the socket check below places it
      const par = byId[p.parent], room = shellLike(par) ? roomOf(par, s.parts) : bboxOf(par), b = bboxOf(p), clr = p.shape === 'pcb' ? .5 : .3;
      let worst = Infinity, axis = -1; for (let k = 0; k < 3; k++) { const m = Math.min(b.lo[k] - room.lo[k], room.hi[k] - b.hi[k]); if (m < worst) { worst = m; axis = k; } }
      if (shellLike(par) || par.shape === 'pcb') {
        if (par.shape === 'pcb') { const ok = [0, 1, 2].filter(k => k !== (par.axis === 'y' ? 1 : par.axis === 'x' ? 0 : 2)).every(k => b.lo[k] >= room.lo[k] - 4 && b.hi[k] <= room.hi[k] + 4); if (!ok) say(p.id, 'bad', `${p.name}: hangs off the edge of ${par.name}; move it onto the board.`); }
        else if (worst < -.05) say(p.id, 'bad', `${p.name}: does not fit inside ${par.name}: ${r1(-worst)} mm too big along ${'xyz'[axis]}. Make it smaller or the ${par.name.toLowerCase()} larger.`);
        else if (worst < clr) say(p.id, 'warn', `${p.name}: only ${r1(Math.max(worst, 0))} mm clear inside ${par.name}; keep ${clr} mm for tolerance.`);
      }
    }
  }
  // two solid parts in the same space (housings, rings and a part's own parent excepted)
  const solid = s.parts.filter(p => !shellLike(p)), inside = (a, b) => { let x = a; for (let i = 0; i < 6 && x; i++) { if (x.parent === b.id) return true; x = byId[x.parent]; } return false; };
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j]; if (inside(a, b) || inside(b, a) || a.qty > 1 || b.qty > 1) continue;
    const A = bboxOf(a), B = bboxOf(b), o = [0, 1, 2].map(k => Math.min(A.hi[k], B.hi[k]) - Math.max(A.lo[k], B.lo[k]));
    if (o.every(v => v > .2)) say(a.id, 'bad', `${a.name} and ${b.name} take the same space (${r1(Math.min(...o))} mm overlap). Move one of them.`);
  }
  // small parts: anything that comes off and fits the test cylinder is a choking hazard for under-3s
  if (s.age === '0+' || s.age === '3+') for (const p of s.parts) {
    if (p.fix === 'moulded in' || p.fix === 'solder' || p.small === false) continue; const d = [...p.size].sort((a, b) => a - b);
    if (d[0] <= SMALL.d && d[1] <= SMALL.d && d[2] <= SMALL.h) say(p.id, s.age === '0+' ? 'bad' : 'warn', s.age === '0+' ? `${p.name}: fits the small-parts cylinder (${SMALL.d} × ${SMALL.h} mm): not allowed for under-3s if it can come off (16 CFR 1501, EN 71-1). Make it larger or fix it so it passes the torque and tension tests.` : `${p.name}: a small part; label "Choking hazard: small parts. Not for children under 3 years" (16 CFR 1500.19).`);
  }
  // do the parts go together: clash by outline, contact, fasteners and size, measured off the parts as built (fitOf)
  const fit = fitOf(s); out.push(...fit.clash, ...fit.contact, ...fit.fasteners, ...fit.size, ...fit.lip, ...fit.snap, ...fit.thread, ...fit.hinge, ...fit.belt, ...fit.opening);
  if (s.kind === 'electronics') out.push(...elecChecks(s));
  return out;
}

// ---- electronics engineering ----------------------------------------------------------------------------------------------------------------------
const elecParts = s => s.parts.filter(p => p.elec);
// each part's draw at its own rail (`v`), summed as power and turned back into current at the cell: a 12 V amplifier and a 3 V tape motor
// add up honestly. Mains products have no cell: their figures are in watts.
export function power(s) {
  const es = elecParts(s), cell = es.find(p => CELLS[p.elec.kind]), cv = cell ? CELLS[cell.elec.kind].v : 3.7, mah = cell?.elec.mah || 0, vOf = p => ELEC[p.elec.kind].v || 3.7;
  const rows = es.filter(p => !CELLS[p.elec.kind]).map(p => ({ id: p.id, name: p.name, qty: p.qty, ma: p.elec.ma * p.qty, ua: p.elec.ua * p.qty, duty: p.elec.duty, v: vOf(p), avg: r2(p.qty * (p.elec.ma * p.elec.duty + p.elec.ua / 1000 * (1 - p.elec.duty))) }));
  const mw = rows.reduce((t, r) => t + r.avg * r.v, 0), sleepMw = rows.reduce((t, r) => t + r.ua / 1000 * r.v, 0), peakMw = rows.reduce((t, r) => t + r.ma * r.v, 0);
  const avg = mw / cv, sleep = sleepMw / cv, li = cell?.elec.kind === 'battery';
  return { rows, mah, cell: cell ? cell.elec.kind : null, volts: cv, wh: mah ? r2(mah * cv / 1000) : 0, avg: r2(avg), peak: r1(peakMw / cv), avgW: r2(mw / 1000), peakW: r2(peakMw / 1000), sleepUa: r1(sleep * 1000), runtime: mah && avg ? r1(mah * .85 / avg) : null, standby: mah && sleep ? r0(mah * .85 / sleep / 24) : null, charge: mah && li ? r1(mah / s.chargeMa * 1.15 + .3) : null, watts: r2(peakMw / 1000), mains: es.some(p => ELEC[p.elec.kind].mains), heatW: r2(es.filter(p => !CELLS[p.elec.kind]).reduce((t, p) => t + p.elec.ma * p.qty * vOf(p) * (ELEC[p.elec.kind].out ? .1 : 1), 0) / 1000) };
}
export function pcbOf(s) {
  const b = s.parts.find(p => p.shape === 'pcb'); if (!b) return null;
  const ax = b.axis === 'y' ? 1 : b.axis === 'x' ? 0 : 2, dims = [0, 1, 2].filter(k => k !== ax).map(k => b.size[k]), areaCm2 = r1(dims[0] * dims[1] / 100);
  const on = s.parts.filter(p => p.parent === b.id && p.elec), used = on.reduce((t, p) => { const d = [0, 1, 2].filter(k => k !== ax).map(k => p.size[k]); return t + d[0] * d[1] * p.qty; }, 0) / 100;
  const placements = on.reduce((t, p) => t + p.qty * (CELLS[p.elec.kind] || ['speaker', 'woofer', 'tweeter', 'psu', 'cdmech', 'tapemech'].includes(p.elec.kind) ? 0 : 6), 12);
  const fab = r2(areaCm2 * (b.layers >= 4 ? .09 : .05) + .3), smt = r2(.4 + placements * .012);
  return { id: b.id, w: r1(dims[0]), d: r1(dims[1]), layers: b.layers, areaCm2, fill: Math.round(used / areaCm2 * 100), placements, fab, smt, tallest: r1(Math.max(0, ...on.map(p => p.size[ax]))) };
}
function elecChecks(s) {
  const out = [], say = (id, level, text) => out.push({ id, level, text }), byId = Object.fromEntries(s.parts.map(p => [p.id, p])), pw = power(s), pcb = pcbOf(s);
  // metal blocks a radio when it surrounds it: a metal housing, cup or ring whose box the module sits in (a metal pillar beside it does not)
  const radio = elecParts(s).find(p => ELEC[p.elec.kind].radio), around = m => radio && [0, 1, 2].every(k => Math.abs(radio.at[k] - m.at[k]) <= m.size[k] / 2), metal = s.parts.filter(p => RESINS[p.resin].metal && shellLike(p) && around(p));
  if (radio && metal.length && !elecParts(s).some(p => p.elec.kind === 'antenna')) say(radio.id, 'bad', `${radio.name}: the ${metal.map(m => m.name.toLowerCase()).join(' and ')} ${metal.length > 1 ? 'are' : 'is'} metal and will block the radio. Use a plastic housing, or a plastic window over the antenna.`);
  const cell = elecParts(s).find(p => CELLS[p.elec.kind]);
  if (radio && cell) { const A = bboxOf(radio), B = bboxOf(cell), gap = Math.max(...[0, 1, 2].map(k => Math.max(B.lo[k] - A.hi[k], A.lo[k] - B.hi[k]))); if (gap < 5) say(radio.id, 'warn', `${radio.name}: the battery is ${r1(Math.max(gap, 0))} mm from the antenna; keep 5 mm of clear space (no copper, metal or battery) around its end.`); else say(radio.id, 'ok', `${radio.name}: ${r1(gap)} mm clear of the battery.`); }
  // every socket a plug goes into (USB-C, mains, RCA, the headphone jack) has to reach the outside wall on one of its faces
  // the housings: shells that make up a good share of the product (not keys, feet, a grille or a lid insert)
  const all = extentOf(s.parts).size.reduce((a, b) => a * b, 1), hs = s.parts.filter(p => shellLike(p) && !RESINS[p.resin].clear && p.shape !== 'ring' && p.size[0] * p.size[1] * p.size[2] >= all * .2);
  for (const u0 of elecParts(s).filter(p => p.elec.kind === 'usbc' || ELEC[p.elec.kind].port)) {
    // against the whole housing, so the line where two halves meet is not taken for an outside wall; standing proud of the wall counts as at it
    const u = bboxOf(u0), b = extentOf(hs); let best = Infinity; for (let k = 0; k < 3; k++) best = Math.min(best, Math.max(0, b.hi[k] - u.hi[k]), Math.max(0, u.lo[k] - b.lo[k]));
    if (best > 3.2) say(u0.id, 'bad', `${u0.name}: ${r1(best)} mm in from the outside wall; a plug reaches only a few mm in, so bring it to the wall (within ${r1((hs[0]?.wall || 2) + 1.2)} mm).`);
    else say(u0.id, 'ok', `${u0.name}: at the wall (${r1(best)} mm), through an opening in the housing${hs.some(h => PROCESSES[h.process].tool === 'mould') ? ' (a side action in the tool)' : ''}.`);
  }
  // a power source: something that draws power needs a cell, a mains supply or a socket to feed it (a review must not take the battery away)
  const draws = elecParts(s).filter(p => !CELLS[p.elec.kind] && (ELEC[p.elec.kind].ma || 0) > 0), feeds = elecParts(s).filter(p => CELLS[p.elec.kind] || ELEC[p.elec.kind].mains || ['usbc', 'dcjack', 'iec'].includes(p.elec.kind)); // a charger or regulator passes power on; it does not supply it
  if (draws.length && !feeds.length) say(draws[0].id, 'bad', `No power source: ${draws.slice(0, 3).map(p => p.name).join(', ')}${draws.length > 3 ? '…' : ''} need power, and there is no battery, mains supply or power socket. Add one.`);
  // mains inside: a certified supply, creepage, and the earth on a metal case
  const psu = elecParts(s).find(p => ELEC[p.elec.kind].mains);
  if (psu) { say(psu.id, 'ok', `${psu.name}: buy it already certified to IEC 62368-1, keep 6.4 mm from anything at mains voltage to any metal a person can touch, and fuse the inlet.`);
    const mc = s.parts.filter(p => RESINS[p.resin].metal && shellLike(p)); if (mc.length) say(psu.id, 'warn', `Mains in a metal case (${mc.map(m => m.name.toLowerCase()).join(', ')}): bond the case to earth through a 3-pin inlet (Class I) with a green-yellow lead and a star washer, or use a double-insulated (Class II) supply and a 2-pin inlet.`); }
  const laser = elecParts(s).find(p => ELEC[p.elec.kind].laser);
  if (laser) say(laser.id, 'ok', `${laser.name}: a Class 1 laser product; buy the loader with its IEC 60825-1 report, and keep the interlock that stops the laser with the tray open.`);
  if (pcb) { if (pcb.fill > 70) say(pcb.id, 'warn', `${byId[pcb.id].name}: parts cover ${pcb.fill}% of it; above 70% the routing gets hard: go to ${pcb.layers >= 4 ? 'a larger board' : '4 layers'}.`); else say(pcb.id, 'ok', `${byId[pcb.id].name}: ${pcb.w} × ${pcb.d} mm, ${pcb.layers} layers, ${pcb.fill}% covered.`); }
  if (pw.mah && pw.runtime != null && pw.runtime < 4) say(cell?.id || 'pcb', 'warn', `Battery: ${pw.runtime} h of use on a charge; a larger cell or a lower duty is worth a look.`);
  if (cell?.elec.kind === 'battery' && pw.wh > 100) say(cell.id, 'bad', `Battery: ${pw.wh} Wh is over 100 Wh: it ships as dangerous goods (Class 9) by sea only.`);
  if (cell && (s.age === '0+' || s.age === '3+')) say(cell.id, 'warn', 'A battery in a toy: the compartment must need a tool to open (a screw), per 16 CFR 1250 and EN 62115.');
  // heat: everything working at once, inside the housing's outside area, cooled by still air (h ≈ 10 W/m²K)
  const e = extentOf(s.parts.filter(p => shellLike(p))), aM2 = e.size.every(Number.isFinite) ? 2 * (e.size[0] * e.size[1] + e.size[0] * e.size[2] + e.size[1] * e.size[2]) / 1e6 : 0, rise = aM2 ? r1((pw.heatW ?? pw.watts) * .5 / (10 * aM2)) : 0;
  if (rise > 25) say(pcb?.id || 'pcb', 'bad', `Heat: about ${rise} °C over the room with everything on; the outside will pass 45 °C. Add vents, a spreader or lower the power.`); else if (rise > 15) say(pcb?.id || 'pcb', 'warn', `Heat: about ${rise} °C over the room with everything on; check touch temperatures against IEC 62368-1.`); else say(pcb?.id || 'pcb', 'ok', `Heat: about ${rise} °C over the room with everything on.`);
  return out;
}
// what the block diagram and the certification rules read: the radios, the battery, the power input
export function elecFacts(s) {
  const es = elecParts(s), radios = [...new Set(es.map(p => ELEC[p.elec.kind].radio).filter(Boolean))].join(', '), cell = es.find(p => CELLS[p.elec.kind]), aa = cell?.elec.kind === 'aa';
  return { radios: radios || 'none', batteryChemistry: cell ? (aa ? 'Alkaline AA, replaceable' : 'Li-ion') : 'none', batteryCapacity: cell ? String(cell.elec.mah) : '', batteryVoltage: cell ? (aa ? '3' : '3.7') : '', inputPower: es.some(p => ELEC[p.elec.kind].mains) ? 'AC mains, 100–240 V' : es.some(p => p.elec.kind === 'dcjack') ? 'DC 12 V barrel jack, from an external adapter' : es.some(p => p.elec.kind === 'usbc') ? 'USB-C, 5 V' : '' };
}
// the block diagram: power on the left, the brain in the middle, what it talks to on the right, each line named by its bus
export function blockSvg(s) {
  const es = elecParts(s), core = es.find(p => ELEC[p.elec.kind].bus === 'core'), pw = ['iec', 'psu', 'usbc', 'charger', 'battery', 'aa', 'reg'].map(k => es.find(p => p.elec.kind === k)).filter(Boolean);
  const per0 = es.filter(p => !['core', 'power'].includes(ELEC[p.elec.kind].bus)), per = [...per0.filter(p => ELEC[p.elec.kind].bus !== 'amp'), ...per0.filter(p => ELEC[p.elec.kind].bus === 'amp')].sort((a, b) => (/^amp2?$/.test(a.elec.kind) ? 0 : ELEC[a.elec.kind].bus === 'amp' ? .5 : 1) - (/^amp2?$/.test(b.elec.kind) ? 0 : ELEC[b.elec.kind].bus === 'amp' ? .5 : 1)), W = 760, rowH = 46, H = Math.max(pw.length, per.length, 3) * rowH + 70;
  const box = (x, y, w, t, sub, fill) => `<g><rect x="${x}" y="${y}" width="${w}" height="34" rx="8" fill="${fill}" stroke="#141416" stroke-width="1.2"/><text x="${x + w / 2}" y="${y + 15}" text-anchor="middle" font-size="11" font-weight="600">${esc(t)}</text><text x="${x + w / 2}" y="${y + 28}" text-anchor="middle" font-size="9" fill="#55585c">${esc(sub)}</text></g>`;
  let g = `<text x="20" y="22" font-size="13" font-weight="700">Block diagram</text><text x="${W - 20}" y="22" text-anchor="end" font-size="10" fill="#55585c">power → brain → what it drives</text>`;
  pw.forEach((p, i) => { const y = 40 + i * rowH; g += box(20, y, 190, ELEC[p.elec.kind].name.replace(/ \(.*/, ''), p.elec.kind === 'battery' ? `${p.elec.mah} mAh, 3.7 V` : p.elec.kind === 'aa' ? `${p.elec.mah} mAh, 3 V` : p.elec.kind === 'usbc' ? '5 V in' : p.elec.kind === 'reg' ? '3.3 V rail' : p.elec.kind === 'iec' ? '100–240 V in' : p.elec.kind === 'psu' ? '12 V out' : 'charges the cell', '#f4f1e8'); if (i) g += `<line x1="115" y1="${y - rowH + 34}" x2="115" y2="${y}" stroke="#c0392b" stroke-width="2" marker-end="url(#ar)"/>`; });
  const cy = 40 + (Math.max(pw.length, per.length, 1) - 1) * rowH / 2;
  if (core) { g += box(290, cy, 180, ELEC[core.elec.kind].name.replace(/ \(.*/, ''), ELEC[core.elec.kind].radio || 'microcontroller', '#e3f6ea'); if (pw.length) g += `<path d="M210 ${40 + (pw.length - 1) * rowH + 17} C 250 ${40 + (pw.length - 1) * rowH + 17}, 250 ${cy + 17}, 290 ${cy + 17}" fill="none" stroke="#c0392b" stroke-width="2" marker-end="url(#ar)"/><text x="250" y="${cy + 12}" font-size="9" fill="#c0392b" text-anchor="middle">3.3 V</text>`; if (ELEC[core.elec.kind].radio) g += `<path d="M380 ${cy} l 0 -14 m -8 0 l 8 -8 l 8 8" fill="none" stroke="#17603a" stroke-width="1.6"/>`; }
  const ampY = per.findIndex(p => /^amp2?$/.test(p.elec.kind));
  per.forEach((p, i) => { const y = 40 + i * rowH, bus = ELEC[p.elec.kind].bus; g += box(550, y, 190, ELEC[p.elec.kind].name.replace(/ \(.*/, '') + (p.qty > 1 ? ` × ${p.qty}` : ''), `${p.elec.ma} mA when on`, '#eef1f6');
    if (bus === 'amp' && ampY >= 0) { const ya = 40 + ampY * rowH; g += `<path d="M740 ${ya + 17} C 762 ${ya + 17}, 762 ${y + 17}, 742 ${y + 17}" fill="none" stroke="#141416" stroke-width="1.2" marker-end="url(#ar)"/><text x="${756}" y="${(ya + y) / 2 + 20}" font-size="9" text-anchor="middle" fill="#3a3d40" transform="rotate(-90 756 ${(ya + y) / 2 + 20})">speaker out</text>`; }
    else if (core) g += `<path d="M470 ${cy + 17} C 510 ${cy + 17}, 510 ${y + 17}, 550 ${y + 17}" fill="none" stroke="#141416" stroke-width="1.2" marker-end="url(#ar)"/><text x="546" y="${y + 12}" font-size="9" text-anchor="end" fill="#3a3d40">${esc(bus)}</text>`; });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W + 30} ${H}" width="${W + 30}" height="${H}" font-family="Helvetica, Arial, sans-serif"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="#3a3d40"/></marker></defs><rect width="${W + 30}" height="${H}" fill="#fff"/>${g}</svg>`;
}

// ---- the whole read: parts, tools, checks, cost, sequence --------------------------------------------------------------------------------------------
export function engineer(s0) {
  const s = cleanAssembly(s0), byId = Object.fromEntries(s.parts.map(p => [p.id, p])), parts = s.parts.map(p => ({ ...partEng(p, s), name: p.name }));
  const tools = parts.filter(x => x.tool).map(x => ({ id: x.id, name: x.name, ...x.tool })), toolCost = tools.reduce((t, x) => t + x.cost, 0), weeks = Math.max(0, ...tools.map(x => x.weeks));
  const pcb = s.kind === 'electronics' ? pcbOf(s) : null, pw = s.kind === 'electronics' ? power(s) : null;
  const seq = [...s.parts].sort((a, b) => a.order - b.order || (a.parent ? 1 : 0) - (b.parent ? 1 : 0)).filter((p, i, a) => !(p.parent && byId[p.parent]?.shape === 'pcb' && p.fix === 'solder' && a.findIndex(x => x.parent === p.parent && x.fix === 'solder') !== i));
  const steps = seq.map((p, i) => { const f = FIXES[p.fix], onBoard = p.parent && byId[p.parent]?.shape === 'pcb' && p.fix === 'solder'; return onBoard ? `${i + 1}. Build the board: reflow the parts on ${byId[p.parent].name.toLowerCase()} (SMT), test it on the fixture` : `${i + 1}. ${f.verb} ${p.qty > 1 ? `${p.qty} × ` : ''}${p.name.toLowerCase()}${p.parent && byId[p.parent] ? ` into ${byId[p.parent].name.toLowerCase()}` : ''}${p.fixQty ? ` (${p.fixQty} screw${p.fixQty > 1 ? 's' : ''})` : ''}`; });
  const harness = harnessOf(s); harness.forEach(c => steps.push(`${steps.length + 1}. Connect ${c.n}, ${c.label.toLowerCase()} (${c.type}): ${byId[c.from].name.toLowerCase()} to ${byId[c.to].name.toLowerCase()}`));
  const secs = s.parts.reduce((t, p) => t + (p.fix === 'solder' ? 0 : FIXES[p.fix].s * p.qty + p.fixQty * 5), 0) + (s.kind === 'electronics' ? 45 : 15) + harness.length * 8;
  const labour = r2(secs / 3600 * s.labour), parts$ = parts.reduce((t, x) => t + x.unit * (byId[x.id].qty), 0) + (pcb ? pcb.fab + pcb.smt : 0) + harness.reduce((t, c) => t + c.unit, 0);
  const unit = r2(parts$ + labour), amort = r2(toolCost / Math.max(1, s.volume));
  const laser = s.parts.some(p => p.elec && ELEC[p.elec.kind].laser) ? [{ name: 'IEC 60825-1 laser product, Class 1', market: 'All markets', why: 'A CD pickup is a laser: the product is labelled Class 1 and the report kept.' }, { name: 'FDA 21 CFR 1040.10 laser product report (CDRH)', market: 'US', why: 'A product with a laser needs a product report filed with the FDA before it is imported.' }] : [];
  const has = k => s.parts.some(p => p.elec?.kind === k), more = [
    ...(has('ledcob') ? [{ name: 'IEC 62471 photobiological safety (risk group)', market: 'All markets', why: 'An LED light source: its blue-light and glare hazard is measured and the risk group stated.' }, { name: 'EU ecodesign and energy label for light sources (2019/2020, 2019/2015)', market: 'EU', why: 'A product with its own light source: efficacy, flicker and the energy label.' }] : []),
    ...(has('hpdriver') ? [{ name: 'EN 50332-1/-2 sound pressure limits', market: 'EU', why: 'Headphones: the loudest they can play is measured and capped to protect hearing.' }] : []),
    ...(has('dcjack') ? [{ name: 'External adapter: DOE Level VI / EU ErP efficiency and its own safety listing', market: 'US, EU', why: 'It runs from a plug-in 12 V adapter, which is certified as a product of its own.' }] : [])];
  const certs = s.kind === 'electronics' ? [...(globalThis.FBElec?.certSuggestions?.(elecFacts(s), s.name) || []), ...laser, ...more] : s.age === '0+' || s.age === '3+' ? [{ name: 'ASTM F963', market: 'US', why: 'Toy safety for children under 14.' }, { name: 'CPSIA lead and phthalates, with a CPC', market: 'US', why: 'A children\'s product needs third-party testing and a certificate.' }, { name: 'EN 71-1, -2, -3 and the CE mark', market: 'EU', why: 'Toy Safety Directive 2009/48/EC.' }, { name: 'UKCA (Toys Safety Regulations 2011)', market: 'UK', why: 'Toys sold in Great Britain.' }] : s.parts.some(p => p.food) ? [{ name: 'FDA 21 CFR food contact (resins)', market: 'US', why: 'Parts that touch food or drink.' }, { name: 'EU 10/2011 and LFGB migration tests', market: 'EU, Germany', why: 'Plastics in contact with food.' }, { name: 'Prop 65 (BPA and phthalates)', market: 'California', why: 'A warning or a clean test.' }] : [{ name: 'Prop 65', market: 'California', why: 'A warning or a clean test for listed chemicals.' }, { name: 'REACH SVHC declaration', market: 'EU', why: 'Substances of very high concern.' }];
  return { spec: s, parts, tools, toolCost, weeks: weeks ? weeks + 2 : 0, checks: dfm(s), steps, labour, assemblySecs: secs, unit, amort, landed: r2(unit + amort), mass: r1(parts.reduce((t, x) => t + (x.mass || 0) * byId[x.id].qty, 0)), pcb, power: pw, certs, harness, extent: extentOf(s.parts).size.map(r1) };
}
// the parts list as rows, for the page, the drawing and the CSV: item, part, qty, material and process, finish, unit cost, tool
export function bomRows(E) {
  const byId = Object.fromEntries(E.spec.parts.map(p => [p.id, p])), rows = E.parts.map((x, i) => { const p = byId[x.id]; return { item: i + 1, id: p.id, name: p.name, qty: p.qty, material: p.resin === 'bought in' ? 'Bought in' : p.resin, process: p.process === 'bought in' ? (p.resin === 'bought in' ? '' : 'bought in') : p.process, finish: p.finish === 'none' ? '' : p.finish, colour: p.colour, mass: x.mass, unit: x.unit, tool: x.tool?.cost || 0 }; });
  if (E.pcb) rows.push({ item: rows.length + 1, id: 'pcba', name: `Board assembly (${E.pcb.layers}-layer, ${E.pcb.placements} placements)`, qty: 1, material: 'FR-4', process: 'PCB fab and SMT', finish: '', colour: '', mass: null, unit: r2(E.pcb.fab + E.pcb.smt), tool: 0 });
  for (const c of E.harness || []) rows.push({ item: rows.length + 1, id: c.id, name: `Cable ${c.n}: ${c.label}, ${c.mm} mm`, qty: 1, material: c.type, process: 'Cable assembly', finish: '', colour: '', mass: null, unit: c.unit, tool: 0 });
  rows.push({ item: rows.length + 1, id: 'labour', name: `Final assembly and test (${E.assemblySecs} s)`, qty: 1, material: '', process: 'Labour', finish: '', colour: '', mass: null, unit: E.labour, tool: 0 });
  return rows;
}
// costs: false for a factory (it quotes its own; our estimates stay with us)
export function bomCsv(E, { costs = true } = {}) { const q = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''); return [`Item,Part,Qty,Material,Process,Finish,Colour,Mass (g)${costs ? ',Unit cost ($),Tool cost ($)' : ''}`, ...bomRows(E).filter(r => costs || r.id !== 'labour').map(r => [r.item, r.name, r.qty, r.material, r.process, r.finish, r.colour, r.mass ?? '', ...(costs ? [r.unit, r.tool] : [])].map(q).join(','))].join('\n'); }

// ---- the tech pack: what the engineering lays into the product's pack (src/lab-handoff.js merges it) ---------------------------------------------
// The parts and cables as BOM lines, the assembly steps and the tools as construction lines, and for an electronic product the components, the
// certifications and the electrical facts. Unit costs go on the BOM lines (the pack hides them from factories); tool costs stay in the Lab.
const REFS = { mcu: 'U', ble: 'U', wifi: 'U', dac: 'U', amp: 'U', amp2: 'U', charger: 'U', reg: 'U', preamp: 'U', hpamp: 'U', imu: 'U', env: 'U', mic: 'MK', usbc: 'J', iec: 'J', rca: 'J', jack: 'J', antenna: 'ANT', button: 'SW', encoder: 'SW', pot: 'VR', led: 'D', speaker: 'LS', woofer: 'LS', tweeter: 'LS', battery: 'BT', aa: 'BT', motor: 'M', ir: 'U', vfd: 'DS', oled: 'DS', lcd: 'DS', psu: 'PS', cdmech: 'MECH', tapemech: 'MECH', ttmotor: 'M', cartridge: 'X', phono: 'U', dcjack: 'J', hpdriver: 'LS', pbms: 'U', li18650: 'BT', ledcob: 'D', leddrv: 'U', touch: 'U' };
export function packFromAssembly(E0) {
  const E = E0.spec ? E0 : engineer(E0), s = E.spec, byId = Object.fromEntries(s.parts.map(p => [p.id, p])), onBoard = p => p.parent && byId[p.parent]?.shape === 'pcb';
  const bom = bomRows(E).filter(r => r.id !== 'labour').map(r => { const p = byId[r.id]; return { component: r.name, material: r.material || '', spec: [r.process, r.finish, p && !p.elec && p.shape !== 'pcb' && p.wall ? `${p.wall} mm wall` : ''].filter(Boolean).join(' · '), color: r.colour && !/^#/.test(r.colour) ? r.colour : (p && !p.elec ? r.colour || '' : ''), placement: p?.parent && byId[p.parent] ? `In ${byId[p.parent].name.toLowerCase()}` : '', qty: String(r.qty), unit: 'pcs', cost: r.unit ? r.unit.toFixed(2) : '' }; });
  const construction = [
    ...E.steps.map(t => ({ area: `Assembly · ${t.match(/^(\d+)\./)?.[1] || ''}`.trim(), detail: t.replace(/^\d+\.\s*/, '') })),
    ...E.tools.map(t => ({ area: `Tooling · ${t.name}`, detail: [t.steel, t.cavities && `${t.cavities} cavit${t.cavities > 1 ? 'ies' : 'y'}`, t.actions ? `${t.actions} side action${t.actions > 1 ? 's' : ''}` : 'no side actions', t.weeks && `${t.weeks} weeks to T1`].filter(Boolean).join(', ') })),
    ...E.checks.filter(c => c.level !== 'ok').slice(0, 12).map(c => ({ area: `Engineering check · ${c.level === 'bad' ? 'fix before tooling' : 'watch'}`, detail: c.text }))
  ];
  let electronics = null;
  if (s.kind === 'electronics') {
    const n = {}, f = elecFacts(s), pw = E.power || {};
    const components = s.parts.filter(p => p.elec).map(p => { const k = p.elec.kind, pre = REFS[k] || 'X'; n[pre] = (n[pre] || 0) + p.qty; const c = E.harness.find(h => h.from === p.id); return { ref: p.qty > 1 ? `${pre}${n[pre] - p.qty + 1}–${pre}${n[pre]}` : `${pre}${n[pre]}`, part: p.name, mpn: (ELEC[k]?.name.match(/\(([A-Z0-9][A-Z0-9-]{3,})\)/) || [])[1] || '', maker: '', qty: String(p.qty), notes: onBoard(p) ? 'On the main board (SMT)' : c ? `Off the board, cable ${c.n} (${c.type})` : 'Off the board' }; });
    for (const c of E.harness) components.push({ ref: c.n, part: `Cable: ${c.label}, ${c.mm} mm`, mpn: '', maker: '', qty: '1', notes: c.type });
    const specs = { ...f, weight: `${Math.round(E.mass)} g`, ...(pw.runtime ? { runtime: `${pw.runtime} h` } : {}), ...(pw.chargeH ? { chargeTime: `${pw.chargeH} h` } : {}), ...(E.pcb ? {} : {}) };
    electronics = { specs: Object.fromEntries(Object.entries(specs).filter(([, v]) => v != null && String(v) !== '').map(([k, v]) => [k, String(v)])), components, certifications: E.certs.map(c => ({ name: c.name, market: c.market || '', notes: c.why || '' })) };
  }
  return { bom, construction, electronics, extent: E.extent, mass: E.mass };
}

// ---- files: STL and the exploded drawing ------------------------------------------------------------------------------------------------------------
// binary STL in mm, one solid for every part (qty drawn once), pulled apart by t (0 = assembled); with real (the parts' true shapes from
// src/lab-parts-mesh.js, about each part's centre) it writes those, otherwise the engineering's own boxes and shells
export function stlOf(s, { t = 0, only = null, real = null } = {}) {
  const off = explodeOffsets(s, t), meshes = s.parts.filter(p => !only || p.id === only).flatMap(p => real?.[p.id] ? real[p.id].map(m => moved(m.tri, p.at.map((v, k) => v + off[p.id][k]))) : [meshOf(p, off[p.id])]), n = meshes.reduce((a, m) => a + m.length / 9, 0);
  const buf = new ArrayBuffer(84 + n * 50), dv = new DataView(buf), head = 'Future Basics Design Lab assembly, mm'; for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i)); dv.setUint32(80, n, true);
  let o = 84; for (const m of meshes) for (let i = 0; i < m.length; i += 9) { const a = [m[i], m[i + 1], m[i + 2]], b = [m[i + 3], m[i + 4], m[i + 5]], c = [m[i + 6], m[i + 7], m[i + 8]], u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]), nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...nn) || 1; for (const x of [...nn.map(q => q / l), ...a, ...b, ...c]) { dv.setFloat32(o, x, true); o += 4; } o += 2; }
  return new Uint8Array(buf);
}
const moved = (tri, d) => { const o = new Float32Array(tri.length); for (let i = 0; i < tri.length; i += 3) { o[i] = tri[i] + d[0]; o[i + 1] = tri[i + 1] + d[1]; o[i + 2] = tri[i + 2] + d[2]; } return o; };
// the drawing's isometric projection, seen from (+x, +y, +z): [across, down] and how near (the larger, the nearer)
const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6);
export const isoOf = ([x, y, z]) => [(x - y) * ISO_C, -z + (x + y) * ISO_S], isoDepth = ([x, y, z]) => x + y + z;
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`; };
// an isometric drawing, pulled apart, each part ballooned with its item number, and the parts list beside it. With picture (the parts'
// true shapes rendered by src/lab-parts-mesh.js: { href, box: [x0, y0, x1, y1] in isoOf units }) it shows that; otherwise it paints the
// engineering's boxes far to near
export function drawingSvg(s0, { t = 1, title = '', picture = null, costs = true } = {}) {
  const E = engineer(s0), s = E.spec, off = explodeOffsets(s, t), pr = isoOf, depth = isoDepth;
  const L = [-.45, -.35, .82], ll = Math.hypot(...L), tris = [];
  if (!picture) for (const p of s.parts) { const m = meshOf(p, off[p.id]); for (let i = 0; i < m.length; i += 9) { const a = [m[i], m[i + 1], m[i + 2]], b = [m[i + 3], m[i + 4], m[i + 5]], c = [m[i + 6], m[i + 7], m[i + 8]], u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]), nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...nn); if (l < 1e-9) continue; const lit = Math.abs(nn[0] * L[0] + nn[1] * L[1] + nn[2] * L[2]) / l / ll; tris.push({ d: (depth(a) + depth(b) + depth(c)) / 3, pts: [a, b, c].map(pr), col: shade(p.colour, .62 + .45 * lit) }); } }
  tris.sort((p, q) => p.d - q.d);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const t3 of tris) for (const [x, y] of t3.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (picture) [x0, y0, x1, y1] = picture.box;
  const VW = 640, VH = 620, pad = 60, k = Math.min((VW - 2 * pad) / (x1 - x0 || 1), (VH - 2 * pad - 30) / (y1 - y0 || 1)), X = x => pad + (x - x0) * k, Y = y => pad + 30 + (y - y0) * k;
  const body = picture ? `<image href="${picture.href}" x="${X(x0).toFixed(1)}" y="${Y(y0).toFixed(1)}" width="${((x1 - x0) * k).toFixed(1)}" height="${((y1 - y0) * k).toFixed(1)}" preserveAspectRatio="none"/>` : tris.map(t3 => `<path d="M${t3.pts.map(([x, y]) => `${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join('L')}Z" fill="${t3.col}" stroke="${t3.col}" stroke-width=".4"/>`).join('');
  const rows = bomRows(E).filter(r => costs || r.id !== 'labour'), mid = (VW) / 2;
  const balloons = s.parts.map((p, i) => { const c = pr(p.at.map((v, kk) => v + off[p.id][kk])), px = X(c[0]), py = Y(c[1]), side = px < mid ? -1 : 1, bx = side < 0 ? 24 : VW - 24, by = Math.min(VH - 20, Math.max(50, py)); return { i: i + 1, px, py, bx, by }; });
  // keep balloons on each side from landing on one another
  // and from running off the sheet: a long column closes up (down to 16 apart) and is lifted to end inside it
  const lo = 50, hi = VH - 14;
  for (const side of [24, VW - 24]) { const b = balloons.filter(q => q.bx === side).sort((a, c) => a.by - c.by), gap = Math.max(16, Math.min(22, (hi - lo) / Math.max(1, b.length - 1))); for (let i = 1; i < b.length; i++) if (b[i].by - b[i - 1].by < gap) b[i].by = b[i - 1].by + gap; const over = (b.at(-1)?.by ?? 0) - hi; if (over > 0) for (let i = b.length - 1, lim = hi; i >= 0; i--, lim -= gap) b[i].by = Math.max(lo, Math.min(b[i].by, lim)); }
  const ball = balloons.map(b => `<line x1="${b.px.toFixed(1)}" y1="${b.py.toFixed(1)}" x2="${b.bx + (b.bx < mid ? 10 : -10)}" y2="${b.by.toFixed(1)}" stroke="#141416" stroke-width=".7"/><circle cx="${b.px.toFixed(1)}" cy="${b.py.toFixed(1)}" r="1.8" fill="#141416"/><circle cx="${b.bx}" cy="${b.by.toFixed(1)}" r="10" fill="#fff" stroke="#141416" stroke-width="1"/><text x="${b.bx}" y="${(b.by + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700">${b.i}</text>`).join('');
  const TX = VW + 20, rowH = 17, TW = 540, th = 40 + rows.length * rowH + 60, H = Math.max(VH, th + 20);
  const tab = `<text x="${TX}" y="44" font-size="13" font-weight="700">Parts list</text><g font-size="9.5"><text x="${TX}" y="64" font-weight="700">#</text><text x="${TX + 22}" y="64" font-weight="700">Part</text><text x="${TX + 220}" y="64" font-weight="700">Qty</text><text x="${TX + 250}" y="64" font-weight="700">Material · process</text>${costs ? `<text x="${TX + TW - 10}" y="64" text-anchor="end" font-weight="700">Unit $</text>` : ''}${rows.map((r, i) => `<text x="${TX}" y="${82 + i * rowH}">${r.item}</text><text x="${TX + 22}" y="${82 + i * rowH}">${esc(clip(r.name, 34))}</text><text x="${TX + 220}" y="${82 + i * rowH}">${r.qty}</text><text x="${TX + 250}" y="${82 + i * rowH}" fill="#3a3d40">${esc(clip([r.material, r.process].filter(Boolean).join(' · '), 42))}</text>${costs ? `<text x="${TX + TW - 10}" y="${82 + i * rowH}" text-anchor="end">${r.unit.toFixed(2)}</text>` : ''}`).join('')}</g>
    <line x1="${TX}" x2="${TX + TW - 10}" y1="${70 + rows.length * rowH}" y2="${70 + rows.length * rowH}" stroke="#141416" stroke-width=".8"/><text x="${TX}" y="${88 + rows.length * rowH}" font-size="10" font-weight="700">${costs ? `Unit cost $${E.unit.toFixed(2)} · tooling $${E.toolCost.toLocaleString('en-US')} · ` : ''}T1 samples in ${E.weeks} weeks · ${E.mass} g</text>`;
  const W = VW + TW + 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif" fill="#141416"><rect width="${W}" height="${H}" fill="#fff"/><text x="24" y="30" font-size="15" font-weight="700">${esc(title || s.name || 'Assembly')}</text><text x="24" y="46" font-size="10" fill="#55585c">Exploded view, isometric, not to scale · ${E.extent.join(' × ')} mm assembled</text>${body}${ball}${tab}</svg>`;
}
export { r1, r2 };

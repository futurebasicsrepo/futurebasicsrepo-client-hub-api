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
export const FIXES = { screws: { verb: 'Screw', s: 5 }, snap: { verb: 'Snap', s: 3 }, press: { verb: 'Press', s: 3 }, glue: { verb: 'Glue', s: 12 }, weld: { verb: 'Ultrasonic-weld', s: 6 }, adhesive: { verb: 'Stick', s: 4 }, solder: { verb: 'Solder', s: 8 }, place: { verb: 'Place', s: 3 }, 'moulded in': { verb: 'Moulded in with', s: 0 } };
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
const SEG = 6, CIRC = 40;
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
// local → world turns (proper rotations, so nothing is mirrored): z-axis as is, y-axis Rx(−90°), x-axis Ry(+90°)
const toWorld = (p, [x, y, z]) => p.axis === 'y' ? [x, z, -y] : p.axis === 'x' ? [z, y, -x] : [x, y, z];
function profilesOf(p) {
  const [w, d] = localDims(p), t = shellLike(p) ? Math.min(p.wall, Math.min(w, d) / 2 - .2) : 0;
  if (ROUND.has(p.shape)) return { out: ellipse(w, d), inn: t ? ellipse(w - 2 * t, d - 2 * t) : null, t };
  const r = p.r ?? 0; return { out: roundRect(w, d, r), inn: t ? roundRect(w - 2 * t, d - 2 * t, Math.max(r - t, 0)) : null, t };
}
const shellLike = p => p.shape === 'shell' || p.shape === 'cup' || p.shape === 'ring';
const openOf = p => p.shape === 'ring' ? 'both' : p.open === '-' ? '-' : '+';
// the part's triangles in world space (positions only; the viewer and the drawing light both sides), centred on p.at plus an offset
export function meshOf(p, off = [0, 0, 0]) {
  const tri = [], push = (...v) => { for (const q of v) { const w = toWorld(p, q); tri.push(w[0] + p.at[0] + off[0], w[1] + p.at[1] + off[1], w[2] + p.at[2] + off[2]); } };
  if (p.shape === 'ball') { const [a, b, c] = p.size.map(v => v / 2), n = 18, m = 12; for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) { const P = (ii, jj) => { const th = ii / m * Math.PI, ph = jj / n * 2 * Math.PI; return [a * Math.sin(th) * Math.cos(ph), b * Math.sin(th) * Math.sin(ph), c * Math.cos(th)]; }; const A = P(i, j), B = P(i + 1, j), C = P(i + 1, j + 1), D = P(i, j + 1); tri.push(...[A, B, C, A, C, D].flatMap(v => [v[0] + p.at[0] + off[0], v[1] + p.at[1] + off[1], v[2] + p.at[2] + off[2]])); } return new Float32Array(tri); }
  const [, , L] = localDims(p), z0 = -L / 2, z1 = L / 2, { out, inn, t } = profilesOf(p), n = out.length;
  const wall = (P, za, zb) => { for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; push([a[0], a[1], za], [b[0], b[1], za], [b[0], b[1], zb], [a[0], a[1], za], [b[0], b[1], zb], [a[0], a[1], zb]); } };
  const cap = (P, z) => { const c = P.reduce((s, q) => [s[0] + q[0] / P.length, s[1] + q[1] / P.length], [0, 0]); for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; push([c[0], c[1], z], [a[0], a[1], z], [b[0], b[1], z]); } };
  const rim = z => { for (let i = 0; i < n; i++) { const a = out[i], b = out[(i + 1) % n], c = inn[(i + 1) % n], d = inn[i]; push([a[0], a[1], z], [b[0], b[1], z], [c[0], c[1], z], [a[0], a[1], z], [c[0], c[1], z], [d[0], d[1], z]); } };
  wall(out, z0, z1);
  if (!inn) { cap(out, z0); cap(out, z1); return new Float32Array(tri); }
  const o = openOf(p);
  if (o === 'both') { wall(inn, z0, z1); rim(z0); rim(z1); }
  else if (o === '+') { wall(inn, z0 + t, z1); cap(out, z0); cap(inn, z0 + t); rim(z1); }
  else { wall(inn, z0, z1 - t); cap(out, z1); cap(inn, z1 - t); rim(z0); }
  return new Float32Array(tri);
}
// volume (mm³), the area the mould sees along its draw (cm²), and the outside area (mm²)
export function volumeOf(p) {
  if (p.shape === 'ball') { const [a, b, c] = p.size.map(v => v / 2); return 4 / 3 * Math.PI * a * b * c; }
  const [, , L] = localDims(p), { out, inn, t } = profilesOf(p), A = area(out);
  if (!inn) return A * L;
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
const axisOf = p => p.axis === 'y' ? 1 : p.axis === 'x' ? 0 : 2;
// the room a part has inside a housing: a housing and the half that closes it (the same axis, open towards it, meeting at the parting line) make one space
function roomOf(par, parts) {
  const r = innerBox(par), ax = axisOf(par), b = bboxOf(par), o = openOf(par);
  for (const m of parts) { if (m === par || !shellLike(m) || axisOf(m) !== ax || openOf(m) === o || openOf(m) === 'both') continue; const mb = bboxOf(m), mi = innerBox(m);
    if (o === '+' && Math.abs(mb.lo[ax] - b.hi[ax]) < 1.5) r.hi[ax] = mi.hi[ax]; if (o === '-' && Math.abs(mb.hi[ax] - b.lo[ax]) < 1.5) r.lo[ax] = mi.lo[ax]; }
  return r;
}

// ---- cleaning what the page sends ---------------------------------------------------------------------------------------------------------------
const ID = /^[a-z0-9-]{1,32}$/;
export function cleanPart(q = {}, i = 0) {
  const shape = SHAPES[q.shape] ? q.shape : 'box', resin = RESINS[q.resin] ? q.resin : 'ABS', process = PROCESSES[q.process] ? q.process : resin === 'bought in' ? 'bought in' : 'injection moulding';
  const size = [0, 1, 2].map(k => r1(num(q.size?.[k], .3, 2000, 20))), at = [0, 1, 2].map(k => r1(num(q.at?.[k], -3000, 3000, 0)));
  const p = { id: ID.test(String(q.id || '')) ? q.id : `p${i + 1}`, name: clip(q.name, 60) || `Part ${i + 1}`, shape, axis: ['x', 'y', 'z'].includes(q.axis) ? q.axis : 'z', size, at,
    resin, process, finish: FINISHES.includes(q.finish) ? q.finish : 'none', colour: /^#[0-9a-f]{6}$/i.test(q.colour || '') ? q.colour.toLowerCase() : RESINS[resin].col,
    qty: Math.round(num(q.qty, 1, 500, 1)), fix: FIXES[q.fix] ? q.fix : 'place', fixQty: Math.round(num(q.fixQty, 0, 50, 0)), order: Math.round(num(q.order, 0, 99, i + 1)),
    dir: [0, 1, 2].map(k => num(q.dir?.[k], -1, 1, k === 2 ? 1 : 0)), lvl: r1(num(q.lvl, -20, 20, 0)), parent: ID.test(String(q.parent || '')) ? q.parent : null };
  if (shellLike(p)) { p.wall = r2(num(q.wall, .3, 20, 2)); p.open = q.open === '-' ? '-' : '+'; }
  if (shape === 'box' || shape === 'shell' || shape === 'pcb') p.r = r1(num(q.r, 0, 500, shape === 'pcb' ? .5 : 2));
  if (PROCESSES[process].tool) { p.draft = r1(num(q.draft, 0, 10, 1)); p.undercuts = Math.round(num(q.undercuts, 0, 12, 0)); }
  if (process === 'bought in' || process === 'CNC machined' || process === 'CNC routed' || process === '3D printed' || process === 'PCB fab and SMT') p.cost = r2(num(q.cost, 0, 5000, 0));
  if (q.food) p.food = true;
  if (q.small === false) p.small = false;
  if (q.elec && ELEC[q.elec.kind]) { const e = ELEC[q.elec.kind]; p.elec = { kind: q.elec.kind, ma: r2(num(q.elec.ma, 0, 5000, e.ma)), ua: r2(num(q.elec.ua, 0, 1e5, e.ua)), duty: r2(num(q.elec.duty, 0, 1, e.duty)) }; if (CELLS[q.elec.kind]) p.elec.mah = Math.round(num(q.elec.mah, 50, 20000, q.elec.kind === 'aa' ? 2500 : 1000)); }
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
  return { arch, kind: s.kind === 'electronics' || ARCHES[arch].kind === 'electronics' && s.kind !== 'goods' ? 'electronics' : 'goods', name: clip(s.name, 80),
    volume: Math.round(num(s.volume, 50, 1e7, 5000)), years: Math.round(num(s.years, 1, 10, 3)), age: AGES[s.age] ? s.age : '14+', chargeMa: Math.round(num(s.chargeMa, 50, 5000, 500)),
    labour: r2(num(s.labour, 1, 80, 6)), parts };
}

// ---- archetypes: a starting assembly drawn to the product's size ---------------------------------------------------------------------------------
const P = (o, i) => cleanPart(o, i);
export function archetype(arch, dims = {}, { mah = null, radio = null, display = null, buttons = null, colour = null } = {}) {
  const c = colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null, parts = [];
  const add = o => parts.push(P({ ...o, colour: o.colour || (o.main && c) || undefined }, parts.length));
  const elec = (kind, o) => { const e = ELEC[kind]; add({ name: e.name, shape: e.round ? 'cyl' : 'box', size: o.size || e.size, resin: 'bought in', process: 'bought in', cost: e.cost, fix: kind === 'speaker' ? 'screws' : kind === 'battery' ? 'adhesive' : 'solder', fixQty: kind === 'speaker' ? 2 : 0, elec: { kind }, r: .3, ...o }); };
  if (arch === 'puck') {
    const D = num(dims.w, 50, 300, 96), H = num(dims.h, 25, 200, 48), w = 2, rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble', side = (D - 2 * w) * .68, mA = fitCell(mah || 2000, [side, side, Math.max(4, H * .64 - w - 6)], Boolean(mah)), cell = cellOf(mA);
    const hb = H * .64, ht = H - hb;
    add({ id: 'bottom', name: 'Bottom housing', shape: 'cup', size: [D, D, hb], at: [0, 0, hb / 2], wall: w, open: '+', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foot', name: 'Non-slip foot', shape: 'cyl', size: [D - 12, D - 12, 1.5], at: [0, 0, -.75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
    add({ id: 'screws', name: 'Screw, M2 × 6 self-tapping', shape: 'cyl', size: [2, 2, 6], at: [D * .3, 0, -3], resin: 'bought in', process: 'bought in', cost: .02, qty: 3, fix: 'screws', order: 8, dir: [0, 0, -1], lvl: 2 });
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: cell.size, at: [0, 0, w + .4 + cell.size[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'battery', mah: mA }, lvl: .6 });
    const pz = w + cell.size[2] + 2.5; add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [D - 2 * w - 3, D - 2 * w - 3, 1.6], r: D, at: [0, 0, pz + .8], fix: 'screws', fixQty: 3, order: 3, parent: 'bottom', lvl: 1.4, layers: rad === 'wifi' ? 4 : 2 });
    const top = pz + 1.6; elec(rad, { at: [-(D / 2 - 2 * w - 12), 0, top + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('usbc', { at: [D / 2 - w - 5, 0, top + 1.6], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('charger', { at: [D / 2 - w - 14, 8, top + .5], parent: 'pcb', order: 3, lvl: 1.7 }); elec('reg', { at: [D / 2 - w - 14, -8, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('amp', { at: [-6, -16, top + .4], parent: 'pcb', order: 3, lvl: 1.7 }); elec('mic', { at: [6, -18, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('led', { at: [0, D / 2 - w - 6, top + .3], parent: 'pcb', order: 3, lvl: 1.7, qty: 8 });
    const sd = Math.min(52, D - 30); elec('speaker', { size: [sd, sd, 12], at: [0, 0, H - w - 1 - 6], parent: 'top', order: 5, lvl: 3, dir: [0, 0, 1] });
    add({ id: 'pipe', name: 'Light ring', shape: 'ring', size: [D - 2 * w - 1, D - 2 * w - 1, 3], at: [0, 0, hb + 1.5], wall: 1.2, resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'press', order: 4, lvl: 2.2 });
    add({ id: 'top', name: 'Top cover with grille', shape: 'cup', size: [D, D, ht], at: [0, 0, hb + ht / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'snap', order: 6, lvl: 4, main: true });
    const nb = Math.round(num(buttons, 0, 6, 3)); for (let i = 0; i < nb; i++) add({ id: `key${i + 1}`, name: `Button ${i + 1}`, shape: 'cyl', size: [9, 9, 3], at: [(i - (nb - 1) / 2) * 14, D * .28, H + .5], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 5, parent: null, lvl: 5.2 });
  } else if (arch === 'handheld') {
    const W = num(dims.w, 25, 200, 46), Lg = num(dims.d, 50, 300, 128), H = num(dims.h, 8, 80, 18), w = 1.6, rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble', hb = H / 2, room = [W - 2 * w - 2, Lg - 2 * w - 13, hb - w - .5], mA = fitCell(mah || 1200, room, Boolean(mah)), cell = cellOf(mA);
    add({ id: 'bottom', name: 'Bottom housing', shape: 'shell', size: [W, Lg, hb], at: [0, 0, hb / 2], r: 8, wall: w, open: '+', resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1.5, undercuts: 1, order: 1, lvl: 0, main: true });
    add({ id: 'screws', name: 'Screw, M1.6 × 5', shape: 'cyl', size: [1.6, 1.6, 5], at: [0, Lg * .35, -2.5], resin: 'bought in', process: 'bought in', cost: .02, qty: 4, fix: 'screws', order: 8, dir: [0, 0, -1], lvl: 2 });
    const bs = cell.size[1] > room[1] || cell.size[0] > room[0] ? [cell.size[1], cell.size[0], cell.size[2]] : cell.size; // turned to lie along the handheld when that fits better
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: bs, at: [0, -Lg / 2 + w + 11 + bs[1] / 2, w + .4 + bs[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'battery', mah: mA }, lvl: .7 });
    // the board runs the length of the inside: the status light at the top, the keys below it, then the radio module and the power parts,
    // and the USB-C port at the bottom end
    const pz = hb + .2, nb = Math.round(num(buttons, 0, 12, 4)), rows = Math.ceil(nb / 2), key0 = Lg * .28, ms = ELEC[rad].size;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [W - 2 * w - 1.5, Lg - 2 * w - 3, 1], at: [0, 0, pz + .5], fix: 'screws', fixQty: 2, order: 3, parent: 'bottom', lvl: 1.4, layers: rad === 'wifi' ? 4 : 2 });
    const top = pz + 1, my = key0 - Math.max(rows - 1, 0) * 12 - (rows ? 5 : 0) - ms[1] / 2;
    elec(rad, { at: [0, my, top + ms[2] / 2], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('usbc', { at: [0, -(Lg / 2 - w - 3.75 + .2), pz - 1.6 + .1], parent: 'pcb', order: 3, lvl: 1.7 }); elec('charger', { at: [ms[0] / 2 + 4, my, top + .5], parent: 'pcb', order: 3, lvl: 1.7 });
    elec('reg', { at: [-(ms[0] / 2 + 4), my, top + .5], parent: 'pcb', order: 3, lvl: 1.7 }); elec('led', { at: [0, Lg * .42, top + .3], parent: 'pcb', order: 3, lvl: 1.7 });
    if (nb) { for (let i = 0; i < nb; i++) elec('button', { at: [(i % 2 ? 1 : -1) * W * .18, key0 - Math.floor(i / 2) * 12, top + 1.75], parent: 'pcb', order: 3, lvl: 1.7 }); add({ id: 'keypad', name: 'Keypad', shape: 'box', size: [W * .6, rows * 12, 2.4], r: 2, at: [0, key0 - (rows - 1) * 6, H - w + 1.2], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'place', order: 4, lvl: 2.6 }); }
    add({ id: 'lens', name: 'Status window', shape: 'box', size: [10, 4, 1], r: 1, at: [0, Lg * .42, H - .5], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'adhesive', order: 7, lvl: 4.2 });
    add({ id: 'top', name: 'Top housing', shape: 'shell', size: [W, Lg, H - hb], at: [0, 0, hb + (H - hb) / 2], r: 8, wall: w, open: '-', resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1.5, undercuts: 0, fix: 'snap', order: 6, lvl: 3.4, main: true });
  } else if (arch === 'desk') {
    const W = num(dims.w, 60, 400, 140), D = num(dims.d, 30, 300, 70), H = num(dims.h, 40, 300, 86), w = 2, rad = radio === 'none' ? 'mcu' : radio === 'ble' ? 'ble' : 'wifi', disp = display === 'oled' || (display !== 'lcd' && H < 75) ? 'oled' : 'lcd';
    const df = D * .4, db = D - df, ds = ELEC[disp].size;
    add({ id: 'front', name: 'Front housing', shape: 'shell', axis: 'y', size: [W, df, H], at: [0, -D / 2 + df / 2, H / 2], r: 6, wall: w, open: '+', resin: 'PC/ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 0, fix: 'snap', order: 6, dir: [0, -1, 0], lvl: 3, main: true });
    add({ id: 'lens', name: 'Display lens', shape: 'box', axis: 'y', size: [Math.min(W - 16, ds[1] + 10), 1.2, Math.min(H - 16, ds[0] + 10)], r: 2, at: [0, -D / 2 - .6, H / 2 + 4], resin: 'PC clear', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'adhesive', order: 7, dir: [0, -1, 0], lvl: 4.4 });
    add({ id: 'display', name: ELEC[disp].name, shape: 'box', axis: 'y', size: [ds[1], ds[2], ds[0]], r: .5, at: [0, -D / 2 + w + ds[2] / 2 + .4, H / 2 + 4], resin: 'bought in', process: 'bought in', cost: ELEC[disp].cost, elec: { kind: disp }, fix: 'adhesive', order: 5, parent: 'front', dir: [0, -1, 0], lvl: 2 });
    const py = D / 2 - w - 7.5 - 1.1; /* the board stands at the back, so the USB-C port reaches the back wall */ add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'y', size: [W - 2 * w - 4, 1.6, H - 2 * w - 4], at: [0, py, H / 2], fix: 'screws', fixQty: 4, order: 3, parent: 'back', dir: [0, 1, 0], lvl: 1, layers: 4 });
    const bk = py + .8; elec(rad, { size: [ELEC[rad].size[0], ELEC[rad].size[2], ELEC[rad].size[1]], axis: 'y', at: [W * .25, bk + ELEC[rad].size[2] / 2, H * .62], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('usbc', { size: [9, 7.5, 3.2], at: [-W * .3, bk + 3.75, w + 3.6], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('reg', { size: [3, 1, 3], axis: 'y', at: [-W * .2, bk + .5, H * .5], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 }); elec('env', { size: [2.5, .9, 2.5], axis: 'y', at: [-W * .32, bk + .45, H * .7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    elec('button', { size: [6, 6, 3.5], at: [W * .3, D * .05, H - w - 3.5], parent: 'back', order: 4, dir: [0, 0, 1], lvl: 1.6 });
    add({ id: 'back', name: 'Back housing', shape: 'shell', axis: 'y', size: [W, db, H], at: [0, D / 2 - db / 2, H / 2], r: 6, wall: w, open: '-', resin: 'PC/ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'place', order: 1, dir: [0, 1, 0], lvl: 0, main: true });
    add({ id: 'screws', name: 'Screw, M2 × 8 self-tapping', shape: 'cyl', axis: 'y', size: [2, 8, 2], at: [W * .35, D / 2 + 4, H * .8], resin: 'bought in', process: 'bought in', cost: .02, qty: 4, fix: 'screws', order: 8, dir: [0, 1, 0], lvl: 2.5 });
    add({ id: 'feet', name: 'Foot pad', shape: 'cyl', size: [10, 10, 1.5], at: [W * .35, 0, -.75], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'cdplayer') {
    // a hi-fi component: a stamped steel chassis and cover, an aluminium front panel, the CD loader at the front, the mains supply at the back left,
    // the main board at the back right with the line outputs through the back panel, the display and IR window behind the front panel
    const W = num(dims.w, 290, 500, 430), D = num(dims.d, 230, 450, 300), H = num(dims.h, 60, 160, 88), w = 1, tb = Math.min(30, H * .4), so = 6, rad = radio === 'ble' ? 'ble' : radio === 'wifi' ? 'wifi' : 'mcu', cm = ELEC.cdmech.size;
    const steel = { resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', r: 1, wall: w };
    add({ id: 'chassis', name: 'Chassis', shape: 'shell', size: [W, D, tb], at: [0, 0, tb / 2], open: '+', ...steel, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'feet', name: 'Foot', shape: 'cup', size: [36, 36, 10], at: [W * .4, D * .35, -5], wall: 2, open: '+', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, qty: 4, fix: 'screws', order: 2, dir: [0, 0, -1], lvl: 1 });
    elec('psu', { at: [-W / 2 + w + 6 + 50, D / 2 - w - 8 - 30, w + so + 15], parent: 'chassis', fix: 'screws', fixQty: 4, order: 2, lvl: 1 });
    elec('iec', { at: [-W / 2 + w + 6 + 100 + 30, D / 2 - 10.5, w + so + 20], parent: 'chassis', fix: 'screws', fixQty: 2, order: 2, dir: [0, 1, 0], lvl: 1 });
    elec('cdmech', { at: [-W / 2 + w + 4 + cm[0] / 2, -D / 2 + w + 2 + cm[1] / 2, w + so + cm[2] / 2], parent: 'chassis', fix: 'screws', fixQty: 4, order: 3, lvl: 1.4 });
    const x0 = -W / 2 + w + 6 + 104, x1 = W / 2 - w - 4, y0 = -D / 2 + w + 2 + cm[1] + 4, y1 = D / 2 - w - 3, pw = x1 - x0, pd = y1 - y0, px = (x0 + x1) / 2, py = (y0 + y1) / 2, top = w + so + 1.6; // behind the loader, right of the supply
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [pw, pd, 1.6], at: [px, py, w + so + .8], fix: 'screws', fixQty: 4, order: 3, parent: 'chassis', lvl: 1.1 });
    elec(rad, { at: [px - pw * .2, py, top + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: 1.3 }); elec('dac', { at: [px + pw * .1, py - pd * .2, top + .6], parent: 'pcb', order: 3, lvl: 1.3 });
    elec('reg', { at: [px + pw * .3, py + pd * .1, top + .5], parent: 'pcb', order: 3, lvl: 1.3 }); elec('rca', { at: [px + pw * .25, D / 2 - 7.5, top + 7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.3 });
    const dx = W / 2 - w - 12 - 55, dz = H * .62;
    if (rad !== 'mcu') elec('antenna', { axis: 'y', at: [W / 2 - 40, D / 2 - 1, H * .6], parent: 'cover', fix: 'screws', order: 8, dir: [0, 1, 0], lvl: 3.4 }); // a steel case: the radio needs its antenna outside
    elec('vfd', { axis: 'y', size: [110, 6, 26], at: [dx, -D / 2 + w + 3.4, dz], parent: 'chassis', fix: 'screws', fixQty: 2, order: 4, dir: [0, -1, 0], lvl: .6 });
    elec('ir', { at: [W / 2 - w - 6, -D / 2 + w + 4, dz], parent: 'chassis', order: 4, dir: [0, -1, 0], lvl: .6 });
    elec('button', { name: 'Tact switches (play, pause, stop, skip, open)', qty: 5, at: [W * .3, -D / 2 + w + 3.4, H * .28], parent: 'chassis', order: 4, dir: [0, -1, 0], lvl: .6 });
    add({ id: 'cover', name: 'Top cover', shape: 'shell', size: [W, D, H - tb], at: [0, 0, tb + (H - tb) / 2], open: '-', ...steel, fix: 'screws', fixQty: 6, order: 7, lvl: 3.2, main: true });
    add({ id: 'panel', name: 'Front panel', shape: 'box', axis: 'y', size: [W, 8, H], r: 1, at: [0, -D / 2 - 4, H / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: r2(4 + W * H / 1e4 * 1.2), finish: 'anodised', fix: 'screws', fixQty: 4, order: 8, dir: [0, -1, 0], lvl: 1.6 });
    add({ id: 'window', name: 'Display window', shape: 'box', axis: 'y', size: [124, 1.5, 34], r: 2, at: [dx, -D / 2 - 8 - .75, dz], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'adhesive', order: 9, dir: [0, -1, 0], lvl: 2.4 });
    add({ id: 'caps', name: 'Button caps', shape: 'box', axis: 'y', size: [12, 6, 8], r: 1, at: [W * .3, -D / 2 - 8 - 3, H * .28], resin: 'aluminium 6061', process: 'CNC machined', cost: .3, finish: 'anodised', qty: 5, fix: 'press', order: 9, dir: [0, -1, 0], lvl: 2.4 });
  } else if (arch === 'cassette') {
    // a portable cassette player standing up: the transport behind a clear door at the front left, two AA cells beside it, the board behind
    // both, the keys along the top, the headphone jack on top and the volume wheel on the right side, a belt clip on the back
    const W = num(dims.w, 120, 220, 136), D = num(dims.d, 26, 70, 34), H = num(dims.h, 75, 180, 90), w = 1.6, df = D / 2, ms = ELEC.tapemech.size;
    const mx = -W / 2 + w + .6 + ms[0] / 2, my = -D / 2 + w + .6 + ms[1] / 2, mz = Math.max(w + .6 + ms[2] / 2, H / 2 + 1);
    add({ id: 'back', name: 'Back housing', shape: 'shell', axis: 'y', size: [W, D - df, H], r: 6, at: [0, D / 2 - (D - df) / 2, H / 2], wall: w, open: '-', resin: 'ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'place', order: 1, dir: [0, 1, 0], lvl: 1.6, main: true });
    elec('aa', { at: [W / 2 - w - .6 - 14.5, -D / 2 + w + .6 + 7.25, w + .6 + 25], parent: 'front', fix: 'place', order: 2, dir: [0, -1, 0], lvl: 1.4, elec: { kind: 'aa', mah: mah || 2500 } });
    elec('tapemech', { at: [mx, my, mz], parent: 'front', fix: 'screws', fixQty: 3, order: 3, dir: [0, -1, 0], lvl: 1.6 });
    const by = my + ms[1] / 2 + 1.5, pz = w + 2 + (H - 2 * w - 22) / 2, bk = by + .5;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'y', size: [W - 2 * w - 4, 1, H - 2 * w - 22], at: [0, by, pz], fix: 'screws', fixQty: 3, order: 4, parent: 'back', dir: [0, 1, 0], lvl: .4 });
    const back = (k, x, z) => { const e = ELEC[k].size; elec(k, { axis: 'y', size: [e[0], e[2], e[1]], at: [x, bk + e[2] / 2, z], parent: 'pcb', order: 4, dir: [0, 1, 0], lvl: .7 }); };
    back('preamp', -W * .25, pz + 10); back('hpamp', W * .18, pz + 10); back('mcu', 0, pz - 8); back('reg', W * .3, pz - 12);
    elec('jack', { at: [W / 2 - w - 14, by + 3, H - 7.2], order: 5, dir: [0, 0, 1], lvl: .8 });
    elec('pot', { at: [W / 2 - 2.6, by + 6, H * .78], order: 5, dir: [1, 0, 0], lvl: .8 });
    elec('button', { name: 'Tact switches (play, stop, rewind, fast-forward, record)', qty: 5, at: [-W * .15, by + 2, H - w - 2.5], order: 5, dir: [0, 0, 1], lvl: .6 });
    add({ id: 'keys', name: 'Keys', shape: 'shell', size: [W * .5, 10, 8], r: 1.5, at: [-W * .15, by + 1, H + 2], wall: 1.5, open: '-', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'place', order: 6, dir: [0, 0, 1], lvl: 1.4 });
    add({ id: 'front', name: 'Front housing', shape: 'shell', axis: 'y', size: [W, df, H], r: 6, at: [0, -D / 2 + df / 2, H / 2], wall: w, open: '+', resin: 'ABS', finish: 'SPI B-1 (semi-gloss)', draft: 1, undercuts: 1, fix: 'snap', order: 7, dir: [0, -1, 0], lvl: 2.6, main: true });
    add({ id: 'door', name: 'Cassette door with window', shape: 'box', axis: 'y', size: [ms[0] + 4, 1.5, ms[2] + 2], r: 3, at: [mx, -D / 2 - .75, mz], resin: 'PC clear', finish: 'SPI A-2 (high gloss)', draft: .5, undercuts: 1, fix: 'snap', order: 8, dir: [0, -1, 0], lvl: 3.4 });
    add({ id: 'clip', name: 'Belt clip', shape: 'box', axis: 'y', size: [36, 2.5, 50], r: 3, at: [0, D / 2 + 1.25, H * .55], resin: 'POM (acetal)', finish: 'SPI C-1 (matte)', draft: 1, fix: 'screws', fixQty: 2, order: 9, dir: [0, 1, 0], lvl: 2.6 });
  } else if (arch === 'speaker') {
    // a powered bookshelf speaker: an MDF cabinet open at the front, closed by the baffle that carries the woofer and tweeter; the amplifier
    // board stands at the back with the mains inlet, line input and volume through the back panel; a bass port at the top of the back
    const W = num(dims.w, 130, 400, 170), D = num(dims.d, 190, 450, 230), H = num(dims.h, 220, 600, 280), t = 15, bf = 18, rad = radio === 'none' ? 'mcu' : radio === 'wifi' ? 'wifi' : 'ble';
    const area = 2 * (W * H + D * H + W * D) / 1e6, wd = Math.max(70, Math.min(130, W - 30, H - 2 * t - 100)), tz = H - t - 46, wz = Math.max(t + 5 + wd / 2, Math.min(H * .36, tz - 45 - wd / 2 - 5)); // the tweeter at the top, the woofer below it with 5 mm between
    add({ id: 'cab', name: 'Cabinet', shape: 'shell', axis: 'y', size: [W, D - bf, H], r: 3, at: [0, -D / 2 + bf + (D - bf) / 2, H / 2], wall: t, open: '-', resin: 'MDF', process: 'CNC routed', cost: r2(4.5 + area * 11), finish: 'none', fix: 'glue', order: 1, lvl: 0, main: true });
    add({ id: 'feet', name: 'Foot pad', shape: 'cyl', size: [16, 16, 2], at: [W * .35, D * .35, -1], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, fix: 'adhesive', order: 2, dir: [0, 0, -1], lvl: 1.2 });
    elec('psu', { at: [0, 11.5, t + .4 + 15], parent: 'cab', fix: 'screws', fixQty: 4, order: 2, lvl: 3.6 }); // the inside lifts out of the top in the exploded view
    const py = D / 2 - t - 14, pz = t + 4 + H * .225, ff = py - .8, bb = py + .8;
    add({ id: 'pcb', name: 'Amplifier board', shape: 'pcb', axis: 'y', size: [W - 2 * t - 6, 1.6, H * .45], at: [0, py, pz], fix: 'screws', fixQty: 4, order: 3, parent: 'cab', lvl: 4.6, layers: 4 });
    const front = (k, x, z) => { const e = ELEC[k].size; elec(k, { axis: 'y', size: [e[0], e[2], e[1]], at: [x, ff - e[2] / 2, z], parent: 'pcb', order: 3, lvl: 4.6 }); };
    front('amp2', -W * .18, pz - H * .08); front(rad, W * .15, pz + H * .12); front('dac', W * .16, pz - H * .06); front('reg', -W * .25, pz + H * .14);
    elec('iec', { at: [-W * .2, D / 2 - 10.5, pz - H * .13], parent: 'pcb', fix: 'screws', fixQty: 2, order: 3, lvl: 4.6 });
    elec('rca', { at: [W * .12, D / 2 - 7.5, pz - H * .13], parent: 'pcb', order: 3, lvl: 4.6 });
    elec('encoder', { at: [W * .12, D / 2 - 10.5, pz + H * .1], parent: 'pcb', order: 3, lvl: 4.6 });
    add({ id: 'knob', name: 'Volume knob', shape: 'cyl', axis: 'y', size: [30, 16, 30], at: [W * .12, D / 2 + 8, pz + H * .1], resin: 'aluminium 6061', process: 'CNC machined', cost: 1.2, finish: 'anodised', fix: 'press', order: 9, lvl: 5.4 });
    add({ id: 'port', name: 'Bass port tube', shape: 'ring', axis: 'y', size: [50, 110, 50], wall: 2.5, at: [0, D / 2 - 55, H * .82], resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'glue', order: 4, lvl: 6 });
    add({ id: 'baffle', name: 'Baffle', shape: 'box', axis: 'y', size: [W, bf, H], r: 3, at: [0, -D / 2 + bf / 2, H / 2], resin: 'MDF', process: 'CNC routed', cost: r2(1.5 + W * H / 1e6 * 11), finish: 'none', fix: 'glue', order: 6, dir: [0, -1, 0], lvl: 1.2 });
    elec('woofer', { axis: 'y', size: [wd, 70, wd], at: [0, -D / 2 - 1 + 35, wz], parent: 'baffle', fix: 'screws', fixQty: 4, order: 7, dir: [0, -1, 0], lvl: 1.8 });
    elec('tweeter', { axis: 'y', size: [80, 40, 80], at: [0, -D / 2 - 1 + 20, tz], parent: 'baffle', fix: 'screws', fixQty: 4, order: 7, dir: [0, -1, 0], lvl: 1.8 });
    add({ id: 'grille', name: 'Grille (cloth on a frame)', shape: 'shell', axis: 'y', size: [W - 4, 10, H - 4], r: 3, at: [0, -D / 2 - 7, H / 2], wall: 2, open: '+', resin: 'ABS', finish: 'none', draft: 1, fix: 'press', order: 10, dir: [0, -1, 0], lvl: 2.8 });
  } else if (arch === 'turntable') {
    // a belt-drive turntable: an MDF plinth closed by a steel plate, with the main bearing, the motor and the board inside; the platter and
    // its mat on the bearing, the tonearm on its pillar at the back right with the cartridge on its offset headshell over the record, the
    // phono outputs and the 12 V input through the back, speed buttons at the front left, and a clear dust cover on two hinges
    const W = num(dims.w, 380, 520, 420), D = num(dims.d, 320, 420, 340), H = num(dims.h, 110, 180, 125), ph = 62, t = 12, pd = 300, px = -W / 2 + 14 + pd / 2, rad = radio === 'ble' ? 'ble' : 'mcu';
    const mdf = { resin: 'MDF', process: 'CNC routed', finish: 'spray paint' }, top = ph + 4 + 16 + 3; // the record sits on the mat at this height
    add({ id: 'plinth', name: 'Plinth', shape: 'shell', size: [W, D, ph], r: 4, at: [0, 0, ph / 2], wall: t, open: '-', ...mdf, cost: r2(3 + W * D / 1e6 * 14), fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'plate', name: 'Bottom plate', shape: 'box', size: [W - 4, D - 4, 1.5], r: 3, at: [0, 0, .75], resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 6, order: 8, dir: [0, 0, -1], lvl: 1.4 });
    add({ id: 'feet', name: 'Isolation foot', shape: 'cup', size: [40, 40, 12], at: [W * .4, D * .38, -6], wall: 2.5, open: '+', resin: 'TPE', finish: 'SPI C-1 (matte)', draft: 1, qty: 4, fix: 'screws', order: 9, dir: [0, 0, -1], lvl: 2.6 });
    add({ id: 'bearing', name: 'Main bearing and spindle', shape: 'cyl', size: [26, 26, 36], at: [px, 0, 30], resin: 'bought in', process: 'bought in', cost: 3.2, fix: 'screws', fixQty: 3, order: 2, parent: 'plinth', lvl: .8 });
    elec('ttmotor', { at: [px - pd / 2 + 26, D / 2 - t - 26, 24], parent: 'plinth', fix: 'screws', fixQty: 2, order: 2, lvl: .8 });
    const bw = 120, bd = 64, bx = W / 2 - t - 4 - bw / 2, by = D / 2 - t - 4 - bd / 2, bz = 10, onb = bz + .8;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [bw, bd, 1.6], at: [bx, by, bz], fix: 'screws', fixQty: 4, order: 3, parent: 'plinth', lvl: .8 });
    elec('phono', { at: [bx - 20, by - 10, onb + .75], parent: 'pcb', order: 3, lvl: .8 }); elec(rad, { at: [bx + 30, by - 14, onb + ELEC[rad].size[2] / 2], parent: 'pcb', order: 3, lvl: .8 }); elec('reg', { at: [bx + 4, by - 20, onb + .5], parent: 'pcb', order: 3, lvl: .8 });
    elec('rca', { name: 'RCA phono outputs, stereo pair, with ground post', at: [bx - 30, D / 2 - 7.5, onb + 7], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: .8 });
    elec('dcjack', { at: [bx + 40, D / 2 - 7, onb + 5.5], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: .8 });
    elec('button', { name: 'Speed and start switches (33, 45, start)', qty: 3, at: [-W / 2 + 40, -D / 2 + t + 12, ph - t - 2.5], parent: 'plinth', order: 4, lvl: .8 });
    add({ id: 'caps', name: 'Button caps', shape: 'cyl', size: [11, 11, 3], at: [-W / 2 + 40, -D / 2 + t + 12, ph + 1.5], resin: 'aluminium 6061', process: 'CNC machined', cost: .3, finish: 'anodised', qty: 3, fix: 'press', order: 9, lvl: 1.2 });
    add({ id: 'platter', name: 'Platter', shape: 'cyl', size: [pd, pd, 16], at: [px, 0, ph + 4 + 8], resin: 'aluminium 6061', process: 'CNC machined', cost: 14, finish: 'brushed', fix: 'place', order: 5, lvl: 1.6 });
    add({ id: 'mat', name: 'Platter mat (felt)', shape: 'cyl', size: [pd - 6, pd - 6, 3], at: [px, 0, ph + 4 + 16 + 1.5], resin: 'EVA foam', process: 'die cut', fix: 'place', order: 6, lvl: 2.2 });
    const ax = px + pd / 2 + 28, ay = D / 2 - 52, az = top + 22, cx = px + 92, cy = -40;
    add({ id: 'pillar', name: 'Tonearm pillar and bearing', shape: 'ring', size: [36, 36, az - ph], wall: 4, at: [ax, ay, ph + (az - ph) / 2 - 3], resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', draft: 1, fix: 'screws', fixQty: 3, order: 5, lvl: 1.4 });
    add({ id: 'arm', name: 'Tonearm tube', shape: 'cyl', axis: 'y', size: [7, ay - 20 - cy, 7], at: [ax, (ay - 20 + cy) / 2, az], resin: 'aluminium 6061', process: 'CNC machined', cost: 2.4, finish: 'anodised', fix: 'press', order: 7, lvl: 2.6 });
    add({ id: 'weight', name: 'Counterweight', shape: 'cyl', axis: 'y', size: [26, 24, 26], at: [ax, ay + 18 + 13, az], resin: 'stainless 304', process: 'CNC machined', cost: 1.6, finish: 'brushed', fix: 'press', order: 7, dir: [0, 1, 0], lvl: 2.6 });
    add({ id: 'headshell', name: 'Headshell', shape: 'box', axis: 'x', size: [ax - 3.6 - cx + 6, 16, 5], r: 1, at: [(cx - 6 + ax - 3.6) / 2, cy, az], resin: 'aluminium 6061', process: 'CNC machined', cost: 1.1, finish: 'anodised', fix: 'screws', fixQty: 2, order: 7, lvl: 2.6 });
    elec('cartridge', { at: [cx, cy, az - 2.5 - 8.6], fix: 'screws', fixQty: 2, order: 7, lvl: 2.2 });
    add({ id: 'cover', name: 'Dust cover', shape: 'shell', size: [W, D, H - ph], r: 4, at: [0, 0, ph + (H - ph) / 2 + .5], wall: 3, open: '-', resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: 1, fix: 'place', order: 10, lvl: 4.4 });
    add({ id: 'hinge', name: 'Dust cover hinge', shape: 'box', size: [30, 6, 22], r: 2, at: [W * .32, D / 2 + 3, ph + 6], resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', qty: 2, fix: 'screws', fixQty: 2, order: 9, dir: [0, 1, 0], lvl: 1.6 });
  } else if (arch === 'headphones') {
    // over-ear Bluetooth headphones: a stainless spring band under a padded cushion, aluminium sliders, nylon yokes holding the two cups;
    // in each cup a 40 mm driver behind its baffle and a foam ear pad; the board, controls and USB-C in the right cup, the cell in the left
    const W = num(dims.w, 160, 220, 186), D = num(dims.d, 70, 110, 92), H = num(dims.h, 170, 240, 205), w = 2, cd = 36, cw = Math.min(84, D - 6), ch = 100, zc = 56, ox = W / 2;
    const cup = (id, sx) => add({ id, name: sx < 0 ? 'Left ear cup' : 'Right ear cup', shape: 'cup', axis: 'x', size: [cd, cw, ch], at: [sx * (ox - cd / 2), 0, zc], wall: w, open: sx < 0 ? '+' : '-', resin: 'PC/ABS', finish: 'soft-touch paint', draft: 1, undercuts: 1, fix: 'snap', order: 6, dir: [sx, 0, 0], lvl: 1.6, main: true });
    cup('cupL', -1); cup('cupR', 1);
    for (const sx of [-1, 1]) {
      const k = sx < 0 ? 'L' : 'R', inner = ox - cd; // the cup's open face, toward the head
      add({ id: `baffle${k}`, name: `Baffle, ${sx < 0 ? 'left' : 'right'}`, shape: 'box', axis: 'x', size: [2, cw - 2 * w - 2, ch - 2 * w - 2], r: 6, at: [sx * (inner + 1.5), 0, zc], resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'snap', order: 4, parent: `cup${k}`, dir: [-sx, 0, 0], lvl: 1 });
      elec('hpdriver', { axis: 'x', size: [11, 40, 40], at: [sx * (inner + 3 + 5.5), 0, zc], parent: `cup${k}`, fix: 'adhesive', order: 4, dir: [-sx, 0, 0], lvl: .6 });
      add({ id: `pad${k}`, name: `Ear pad, ${sx < 0 ? 'left' : 'right'} (memory foam in PU leather)`, shape: 'ring', axis: 'x', size: [22, cw + 2, ch + 2], wall: 20, at: [sx * (inner - 11), 0, zc], resin: 'EVA foam', process: 'die cut', fix: 'snap', order: 8, dir: [-sx, 0, 0], lvl: 2.4 });
      add({ id: `yoke${k}`, name: `Yoke, ${sx < 0 ? 'left' : 'right'}`, shape: 'box', size: [10, cw + 10, 3], r: 1, at: [sx * (ox - cd / 2), 0, zc + ch / 2 + 6], resin: 'PA66 GF30', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'screws', fixQty: 2, order: 5, dir: [0, 0, 1], lvl: 1 });
      add({ id: `slider${k}`, name: `Slider, ${sx < 0 ? 'left' : 'right'}`, shape: 'box', size: [6, 14, H - 22 - (zc + ch / 2 + 10)], r: 1, at: [sx * (ox - cd / 2), 0, (zc + ch / 2 + 10 + H - 22) / 2], resin: 'aluminium 6061', process: 'CNC machined', cost: .9, finish: 'anodised', fix: 'press', order: 5, dir: [0, 0, 1], lvl: 2 });
    }
    const rx = ox - w - 5, pz = zc; // the board stands in the right cup, parts on its inner face, the buttons on its outer face
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', axis: 'x', size: [1.2, cw - 2 * w - 14, ch - 2 * w - 34], r: 8, at: [rx, 0, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'cupR', lvl: .8 });
    const side = (k, y, z, o = {}) => { const e = ELEC[k].size; elec(k, { size: [e[2], e[1], e[0]], at: [rx - .6 - e[2] / 2, y, z], parent: 'pcb', order: 3, lvl: .8, ...o }); };
    const rad = radio === 'wifi' ? 'wifi' : 'ble'; side(rad, 0, pz + 12); side('charger', -10, pz - 10); side('reg', 6, pz - 10); side('mic', 14, pz - 22); side('hpamp', -6, pz - 22);
    elec('usbc', { size: [3.2, 9, 7.5], at: [rx - .6 - 1.6, 0, zc - ch / 2 + w + 4.5], parent: 'pcb', order: 3, dir: [0, 0, -1], lvl: .8 });
    elec('button', { name: 'Tact switches (power, volume up, volume down)', qty: 3, size: [3.5, 6, 6], at: [rx + .6 + 1.75, -12, pz - 8], parent: 'pcb', order: 3, dir: [1, 0, 0], lvl: .8 });
    elec('led', { size: [.6, 2, 2], at: [rx + .6 + .3, 14, pz - 16], parent: 'pcb', order: 3, dir: [1, 0, 0], lvl: .8 });
    const lx = -(ox - w - .6), mA = fitCell(mah || 600, [cw - 2 * w - 4, ch - 2 * w - 6, 8], Boolean(mah)), cell = cellOf(mA), bs = [cell.size[2], cell.size[0], cell.size[1]];
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: bs, at: [lx + bs[0] / 2, 0, zc], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'cupL', elec: { kind: 'battery', mah: mA }, dir: [-1, 0, 0], lvl: .8 });
    add({ id: 'band', name: 'Headband spring', shape: 'box', size: [W - 34, 22, 2], r: 1, at: [0, 0, H - 5], resin: 'stainless 304', process: 'stamping', finish: 'brushed', fix: 'screws', fixQty: 4, order: 7, lvl: 3 });
    add({ id: 'cushion', name: 'Headband cushion (memory foam in PU leather)', shape: 'box', size: [W - 74, 30, 10], r: 4, at: [0, 0, H - 13], resin: 'EVA foam', process: 'die cut', fix: 'snap', order: 8, lvl: 2 });
  } else if (arch === 'smartspeaker') {
    // a smart speaker: a round base holding the main board, the Wi-Fi module, the amplifier and the DC input; a fabric grille over the
    // up-firing driver; a top cap with its board of four microphones, the light ring's LEDs and the buttons
    const D = num(dims.w, 80, 200, 100), H = num(dims.h, 100, 260, 152), w = 2, hb = Math.round(H * .3), ht = 22, hg = H - hb - ht, sd = Math.min(76, D - 16);
    add({ id: 'body', name: 'Base housing', shape: 'cup', size: [D, D, hb], at: [0, 0, hb / 2], wall: w, open: '+', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foot', name: 'Non-slip foot', shape: 'cyl', size: [D - 14, D - 14, 1.5], at: [0, 0, -.75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 1.2 });
    const pz = w + 6, on = pz + .8;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [D - 2 * w - 4, D - 2 * w - 4, 1.6], r: D, at: [0, 0, pz], fix: 'screws', fixQty: 3, order: 2, parent: 'body', lvl: .8, layers: 4 });
    elec('wifi', { at: [-D * .16, D * .06, on + ELEC.wifi.size[2] / 2], parent: 'pcb', order: 2, lvl: .8 }); elec('amp', { at: [D * .18, -D * .1, on + .4], parent: 'pcb', order: 2, lvl: .8 }); elec('reg', { at: [D * .18, D * .1, on + .5], parent: 'pcb', order: 2, lvl: .8 });
    elec('dcjack', { at: [0, -(D / 2 - 7.5), on + 5.5], parent: 'pcb', order: 2, dir: [0, -1, 0], lvl: .8 });
    add({ id: 'grille', name: 'Grille (fabric over a frame)', shape: 'cup', size: [D, D, hg], at: [0, 0, hb + hg / 2], wall: w, open: '-', resin: 'ABS', finish: 'none', draft: 1, fix: 'snap', order: 4, lvl: 1.8, main: true });
    elec('speaker', { name: 'Speaker driver, 3 in full range 10 W', size: [sd, sd, 34], at: [0, 0, hb + 4 + 17], parent: 'grille', fix: 'screws', fixQty: 4, order: 3, dir: [0, 0, 1], lvl: 1.2 });
    add({ id: 'cap', name: 'Top cap', shape: 'cup', size: [D, D, ht], at: [0, 0, H - ht / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 0, fix: 'snap', order: 6, lvl: 3, main: true });
    const tz = H - w - 7, tn = tz + .6;
    add({ id: 'top', name: 'Top board (microphones, lights, buttons)', shape: 'pcb', size: [D - 2 * w - 6, D - 2 * w - 6, 1.2], r: D, at: [0, 0, tz], fix: 'screws', fixQty: 2, order: 5, parent: 'cap', lvl: 2.4 });
    elec('mic', { name: 'MEMS microphones, an array of four', qty: 4, at: [D * .3, 0, tn + .5], parent: 'top', order: 5, lvl: 2.4 }); elec('led', { name: 'LEDs (RGB) for the light ring', qty: 12, at: [0, D * .36, tn + .3], parent: 'top', order: 5, lvl: 2.4 });
    elec('button', { name: 'Tact switches (action, mic off, volume up, down)', qty: 4, at: [-D * .12, -D * .1, tn + 1.75], parent: 'top', order: 5, lvl: 2.4 });
    add({ id: 'ring', name: 'Light ring', shape: 'ring', size: [D - 2 * w - 1, D - 2 * w - 1, 3], at: [0, 0, H - ht + 2], wall: 1.6, resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'press', order: 5, parent: 'cap', lvl: 2.2 });
    add({ id: 'keys', name: 'Button caps', shape: 'cyl', size: [10, 10, 1.5], at: [-D * .12, -D * .1, H + .75], resin: 'silicone (LSR)', process: 'LSR moulding', qty: 4, fix: 'press', order: 7, lvl: 3.8 });
  } else if (arch === 'powerbank') {
    // a power bank: a pack of 18650 cells side by side, the controller board at one end with USB-C in and out, a four-LED fuel gauge behind
    // its window and a button, in two PC/ABS shells
    const n = Math.round(num(mah ? mah / 3000 : null, 2, 4, 3)), L = num(dims.d, 110, 200, 146), w = 1.8, W = Math.max(num(dims.w, 40, 100, 0), n * 18.6 + 2 * w + 3), H = num(dims.h, 22, 40, 25), hb = H / 2;
    add({ id: 'bottom', name: 'Bottom shell', shape: 'shell', size: [W, L, hb], r: 6, at: [0, 0, hb / 2], wall: w, open: '+', resin: 'PC/ABS', finish: 'MT-11010 (fine texture)', draft: 3, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    const cy = -L / 2 + w + 2 + 32.5;
    add({ id: 'cells', name: `Li-ion cells, ${n} × 18650, ${n * 3000} mAh (1S${n}P)`, shape: 'box', size: [n * 18.4, 65, 18], at: [0, cy, w + .4 + 9], resin: 'bought in', process: 'bought in', cost: r2(n * 1.7), fix: 'adhesive', order: 2, parent: 'bottom', elec: { kind: 'li18650', mah: n * 3000 }, lvl: .8 });
    const by0 = cy + 32.5 + 4, by1 = L / 2 - w - 1, pl = by1 - by0, py = (by0 + by1) / 2, pz = w + 4, on = pz + .6;
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [W - 2 * w - 1.5, pl, 1.2], at: [0, py, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'bottom', lvl: 1.4 });
    elec('pbms', { at: [-W * .18, py - pl * .1, on + .5], parent: 'pcb', order: 3, lvl: 1.4 }); elec('reg', { at: [W * .2, py - pl * .1, on + .5], parent: 'pcb', order: 3, lvl: 1.4 });
    elec('usbc', { name: 'USB-C receptacles, in and out', qty: 2, at: [-W * .2, L / 2 - w - 3.75 + .2, on + 1.6], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1.4 });
    elec('led', { name: 'LEDs, fuel gauge', qty: 4, at: [W * .18, py - pl * .3, on + .3], parent: 'pcb', order: 3, lvl: 1.4 });
    elec('button', { at: [W * .18, py + pl * .15, on + 1.75], parent: 'pcb', order: 3, lvl: 1.4 });
    add({ id: 'window', name: 'Fuel gauge window', shape: 'box', size: [12, 4, 1], r: 1, at: [W * .18, py - pl * .3, H - .5], resin: 'PMMA (acrylic)', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'adhesive', order: 7, lvl: 4.2 });
    add({ id: 'key', name: 'Button cap', shape: 'cyl', size: [7, 7, 1.5], at: [W * .18, py + pl * .15, H + .75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 7, lvl: 4.2 });
    add({ id: 'top', name: 'Top shell', shape: 'shell', size: [W, L, H - hb], r: 6, at: [0, 0, hb + (H - hb) / 2], wall: w, open: '-', resin: 'PC/ABS', finish: 'MT-11010 (fine texture)', draft: 3, undercuts: 0, fix: 'snap', order: 6, lvl: 3.2, main: true });
    add({ id: 'screws', name: 'Screw, M1.6 × 5', shape: 'cyl', size: [1.6, 1.6, 5], at: [0, L * .4, -2.5], resin: 'bought in', process: 'bought in', cost: .02, qty: 4, fix: 'screws', order: 8, dir: [0, 0, -1], lvl: 2 });
  } else if (arch === 'lamp') {
    // a cordless table lamp: a weighted die-cast base holding the cell, the board and the USB-C input; an aluminium tube carrying the
    // wires up to a pressed aluminium shade with the LED module, its diffuser and the touch dimmer on top
    const Db = num(dims.w, 90, 200, 120), H = num(dims.h, 200, 700, 380), Dh = Math.max(Db + 20, 150), hh = 56, hb = 30, w = 2.5, tube = 14;
    add({ id: 'base', name: 'Weighted base', shape: 'cup', size: [Db, Db, hb], at: [0, 0, hb / 2], wall: w, open: '-', resin: 'zinc (Zamak 3)', process: 'die casting', finish: 'spray paint', draft: 1.5, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'plate', name: 'Base plate', shape: 'cyl', size: [Db - 2 * w - 1, Db - 2 * w - 1, 1.5], at: [0, 0, .75], resin: 'steel SPCC', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 3, order: 8, dir: [0, 0, -1], lvl: 1.4 });
    add({ id: 'pad', name: 'Non-slip pad', shape: 'cyl', size: [Db - 16, Db - 16, 1.5], at: [0, 0, -.75], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'adhesive', order: 9, dir: [0, 0, -1], lvl: 2.4 });
    const room = (Db - 2 * w) * .62, mA = fitCell(mah || 2600, [room, room, 8], Boolean(mah)), cell = cellOf(mA);
    add({ id: 'battery', name: `Li-ion cell, ${mA} mAh`, shape: 'box', size: cell.size, at: [0, -Db * .08, 3 + cell.size[2] / 2], resin: 'bought in', process: 'bought in', cost: cell.cost, fix: 'adhesive', order: 2, parent: 'base', elec: { kind: 'battery', mah: mA }, lvl: .8 });
    const pz = hb - w - 3, on = pz - .8; // the board hangs under the top of the base, its parts facing down
    add({ id: 'pcb', name: 'Main board', shape: 'pcb', size: [Db * .5, Db * .32, 1.6], at: [0, Db * .2, pz], fix: 'screws', fixQty: 2, order: 3, parent: 'base', lvl: 1 });
    elec('mcu', { at: [-Db * .1, Db * .2, on - .5], parent: 'pcb', order: 3, lvl: 1 }); elec('charger', { at: [Db * .02, Db * .2, on - .5], parent: 'pcb', order: 3, lvl: 1 }); elec('leddrv', { at: [Db * .12, Db * .2, on - .5], parent: 'pcb', order: 3, lvl: 1 });
    elec('usbc', { at: [0, Db / 2 - w - 3.75 + .2, on - 1.6], parent: 'pcb', order: 3, dir: [0, 1, 0], lvl: 1 });
    add({ id: 'stem', name: 'Stem tube', shape: 'ring', size: [tube, tube, H - hb - hh + 6], wall: 1.2, at: [0, 0, hb + (H - hb - hh + 6) / 2 - 3], resin: 'aluminium 6061', process: 'CNC machined', cost: r2(1.2 + H / 400), finish: 'anodised', fix: 'screws', order: 4, lvl: 1.6 });
    add({ id: 'shade', name: 'Shade', shape: 'cup', size: [Dh, Dh, hh], at: [0, 0, H - hh / 2], wall: 1.2, open: '-', resin: 'aluminium 6061', process: 'stamping', finish: 'spray paint', fix: 'screws', fixQty: 2, order: 5, lvl: 3, main: true });
    elec('ledcob', { at: [0, 0, H - 1.2 - 14 - 1.5], parent: 'shade', fix: 'screws', fixQty: 2, order: 6, dir: [0, 0, -1], lvl: .8 });
    add({ id: 'sink', name: 'Heat sink', shape: 'cyl', size: [44, 44, 12], at: [0, 0, H - 1.2 - 7], resin: 'aluminium 6061', process: 'die casting', finish: 'none', fix: 'screws', fixQty: 2, order: 6, parent: 'shade', lvl: .4 });
    add({ id: 'diffuser', name: 'Diffuser (opal PC)', shape: 'cyl', size: [Dh - 2 * 1.2 - 3, Dh - 2 * 1.2 - 3, 2], at: [0, 0, H - hh + 4], resin: 'PC', finish: 'MT-11010 (fine texture)', draft: 3, fix: 'snap', order: 7, parent: 'shade', dir: [0, 0, -1], lvl: 1.4 });
    elec('touch', { name: 'Touch dimmer (controller and pad on top of the shade)', at: [Dh * .25, 0, H - 1.2 - 1.5], parent: 'shade', fix: 'adhesive', order: 6, lvl: .8 });
  } else if (arch === 'tumbler') {
    const D = num(dims.w, 50, 160, 88), H = num(dims.h, 80, 400, 180), w = 2.2, lh = 18;
    add({ id: 'body', name: 'Cup body', shape: 'cup', size: [D, D, H - lh + 4], at: [0, 0, (H - lh + 4) / 2], wall: w, open: '+', resin: 'Tritan', finish: 'SPI A-2 (high gloss)', draft: 1, fix: 'place', order: 1, lvl: 0, food: true, main: true });
    add({ id: 'gasket', name: 'Lid seal', shape: 'ring', size: [D - 2 * w + .6, D - 2 * w + .6, 4], at: [0, 0, H - lh + 1], wall: 2, resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 2, lvl: 1.5, food: true });
    add({ id: 'lid', name: 'Lid', shape: 'cup', size: [D + 3, D + 3, lh], at: [0, 0, H - lh / 2], wall: 2, open: '-', resin: 'PP', finish: 'SPI C-1 (matte)', draft: 1.5, undercuts: 1, fix: 'press', order: 3, lvl: 2.5, food: true, main: true });
    add({ id: 'slider', name: 'Sip slider', shape: 'box', size: [16, 22, 3], r: 3, at: [0, D * .22, H + 1.5], resin: 'PP', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'snap', order: 4, lvl: 3.4, food: true });
    add({ id: 'straw', name: 'Straw', shape: 'ring', size: [8, 8, H + 20], at: [0, -D * .15, (H + 20) / 2 + 2], wall: .9, resin: 'Tritan', process: 'injection moulding', finish: 'SPI A-2 (high gloss)', draft: .5, fix: 'place', order: 5, lvl: 4.4, food: true });
    add({ id: 'base', name: 'Base pad', shape: 'cyl', size: [D - 8, D - 8, 2], at: [0, 0, -1], resin: 'silicone (LSR)', process: 'LSR moulding', fix: 'press', order: 6, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'case') {
    const W = num(dims.w, 60, 800, 220), D = num(dims.d, 40, 600, 160), H = num(dims.h, 25, 400, 72), w = 2.5, hb = H * .7;
    add({ id: 'base', name: 'Base', shape: 'shell', size: [W, D, hb], at: [0, 0, hb / 2], r: 10, wall: w, open: '+', resin: 'PP', finish: 'SPI D-2 (textured)', draft: 3, undercuts: 1, fix: 'place', order: 1, lvl: 0, main: true });
    add({ id: 'foam', name: 'Foam insert', shape: 'box', size: [W - 2 * w - 1, D - 2 * w - 1, hb * .7], r: 6, at: [0, 0, w + .4 + hb * .35], resin: 'EVA foam', process: 'die cut', fix: 'place', order: 2, parent: 'base', lvl: 1.6 });
    add({ id: 'lid', name: 'Lid', shape: 'shell', size: [W, D, H - hb], at: [0, 0, hb + (H - hb) / 2], r: 10, wall: w, open: '-', resin: 'PP', finish: 'SPI D-2 (textured)', draft: 3, undercuts: 1, fix: 'place', order: 3, lvl: 3, main: true });
    add({ id: 'hinge', name: 'Hinge pin', shape: 'cyl', axis: 'x', size: [W * .8, 3, 3], at: [0, D / 2 + 2, hb], resin: 'stainless 304', process: 'bought in', cost: .12, qty: 1, fix: 'press', order: 4, dir: [0, 1, 0], lvl: 1.5 });
    add({ id: 'latch', name: 'Latch', shape: 'box', size: [30, 3, 16], r: 1, at: [0, -D / 2 - 1.5, hb], resin: 'POM (acetal)', finish: 'SPI C-1 (matte)', draft: 1, undercuts: 1, fix: 'snap', order: 5, dir: [0, -1, 0], lvl: 1.5 });
    add({ id: 'feet', name: 'Foot', shape: 'cyl', size: [12, 12, 2], at: [W * .38, D * .35, -1], resin: 'TPE', process: 'overmoulding', qty: 4, fix: 'moulded in', order: 6, dir: [0, 0, -1], lvl: 1.2 });
  } else if (arch === 'figure') {
    const H = num(dims.h, 60, 600, 180), k = H / 185;
    add({ id: 'base', name: 'Display base', shape: 'cup', size: [90 * k, 90 * k, 12 * k], at: [0, 0, 6 * k], wall: 2.5, open: '-', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, fix: 'place', order: 1, lvl: 0 });
    add({ id: 'legs', name: 'Legs', shape: 'box', size: [44 * k, 26 * k, 46 * k], r: 10 * k, at: [0, 0, 12 * k + 23 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 2, lvl: 1, main: true });
    add({ id: 'body', name: 'Body', shape: 'ball', size: [56 * k, 40 * k, 60 * k], at: [0, 0, 58 * k + 30.3 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 3, lvl: 2, main: true });
    add({ id: 'arml', name: 'Left arm', shape: 'cyl', axis: 'x', size: [36 * k, 14 * k, 14 * k], at: [-46.6 * k, 0, 96 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 4, dir: [-1, 0, 0], lvl: 1.2 });
    add({ id: 'armr', name: 'Right arm', shape: 'cyl', axis: 'x', size: [36 * k, 14 * k, 14 * k], at: [46.6 * k, 0, 96 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 4, dir: [1, 0, 0], lvl: 1.2 });
    add({ id: 'head', name: 'Head', shape: 'ball', size: [74 * k, 66 * k, 66 * k], at: [0, 0, 118.9 * k + 33 * k], resin: 'soft PVC (vinyl)', process: 'rotocasting', finish: 'spray paint', fix: 'press', order: 5, lvl: 3, main: true });
  } else add({ id: 'body', name: 'Body', shape: 'shell', size: [num(dims.w, 5, 2000, 100), num(dims.d, 5, 2000, 60), num(dims.h, 5, 2000, 40)], at: [0, 0, num(dims.h, 5, 2000, 40) / 2], r: 4, wall: 2, open: '+', resin: 'ABS', finish: 'SPI C-1 (matte)', draft: 1, order: 1, main: true });
  return cleanAssembly({ arch, kind: ARCHES[arch]?.kind, parts });
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
export function extentOf(parts) { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (const p of parts) { const b = bboxOf(p); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.lo[k]); hi[k] = Math.max(hi[k], b.hi[k]); } } return { lo, hi, size: lo.map((v, k) => hi[k] - v) }; }
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
  ledcob: { to: 'board', label: 'LED', type: '2-wire 22 AWG, up the stem', cost: .12, per: .02, kind: 'power' },
  touch: { to: 'board', label: 'Touch pad', type: '3-wire 30 AWG, up the stem', cost: .1, per: .02, kind: 'signal' },
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

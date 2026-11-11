// Design Lab product types that are not garments, bags or shoes: drinkware, wall art, home textiles, tech accessories, paper goods, pet,
// sports and car products, socks and sandals. Each is a simple technical flat at true proportion, in inches, with its print area named, front
// and back where the product has two sides. They are the product types the supplier catalogue sells and the Studio did not have
// (src/lab-catalog.js sends each catalogue item to one). src/lab-flats.js adds them to STYLES as kind 'goods' and draws them with goodsGeom().
// They are printed or bought in, not cut and sewn by the Lab, so they have no pattern and one size.
// The same file runs in the page (served as /lab/lab-goods.js) and on the service, so it uses neither the DOM nor Node.
//
// Each type: label, category (the concept's category in the Lab), group (how the catalogue is browsed), shape (one of the drawings below),
// base (its measurements, inches) and what the shape needs. `from` says where the size came from: a size in a catalogue item's own name, a
// published standard, or a typical size chosen here (said plainly, so nobody takes it for a supplier's spec: the measurements can be typed over).
const G = (label, group, shape, base, from, o = {}) => ({ label, group, shape, base, from, category: 'other', ...o });
const ACC = { category: 'accessories' };
export const GOODS = {
  // ---- drinkware: drawn from the side; the print area on a side is the part of the wrap that shows on it ----
  mug: G('Mug', 'Drinkware', 'cup', { diameter: 3.2, height: 3.75, wrapWidth: 8.5, printHeight: 3.5 }, 'the standard 11 oz ceramic mug: 3.2 in across, 3.75 in tall, wrap print area 8.5 × 3.5 in', { handle: [.14, .82, 1.05], sides: 2 }),
  tumbler: G('Tumbler', 'Drinkware', 'cup', { diameter: 2.9, height: 8.8, wrapWidth: 9.3, printHeight: 8 }, 'a typical 20 oz straight tumbler (2.9 in across, 8.2 in body under a 0.6 in lid, wrap 9.3 in around): chosen here', { lid: .6, straw: true, sides: 2 }),
  tumblerhandle: G('Tumbler with handle', 'Drinkware', 'cup', { diameter: 3.9, baseDiameter: 3, height: 10.6, wrapWidth: 9.5, printHeight: 4.5 }, 'a typical 40 oz handled travel tumbler (3.9 in across the top, a 3 in base for a cup holder, 10.6 in tall with its lid): chosen here', { lid: .8, straw: true, handle: [.1, .5, 1.3], profile: [[0, 't'], [.58, 't'], [.7, 'b'], [1, 'b']], printTop: .6, sides: 2 }),
  bottle: G('Water bottle', 'Drinkware', 'cup', { diameter: 2.9, height: 10.4, wrapWidth: 9.1, printHeight: 5 }, 'a typical 20 oz steel bottle (2.9 in across, 10.4 in tall with its cap): chosen here', { profile: [[0, .55], [.1, .55], [.2, 't'], [1, 't']], printTop: 3, sides: 2 }),
  canglass: G('Can glass', 'Drinkware', 'cup', { diameter: 3, height: 5.25, wrapWidth: 9.25, printHeight: 4 }, 'a typical 16 oz can-shaped glass (3 in across, 5.25 in tall): chosen here', { profile: [[0, .86], [.06, .86], [.14, 't'], [.94, 't'], [1, .9]], printTop: .8, sides: 2 }),
  pintglass: G('Pint glass', 'Drinkware', 'cup', { diameter: 3.5, baseDiameter: 2.4, height: 5.9, wrapWidth: 8, printHeight: 3.5 }, 'a typical 16 oz pint glass (3.5 in across the rim, 2.4 in at the base, 5.9 in tall): chosen here', { printTop: 1, sides: 2 }),
  wineglass: G('Stemless wine glass', 'Drinkware', 'cup', { diameter: 2.9, baseDiameter: 2.2, height: 4.6, wrapWidth: 6, printHeight: 2.25 }, 'a typical 15 oz stemless wine glass (2.9 in rim, 3.7 in at its widest, 4.6 in tall): chosen here', { profile: [[0, 't'], [.12, 1.12], [.3, 1.24], [.5, 1.28], [.7, 1.2], [.88, .98], [1, 'b']], printTop: 1, sides: 2 }),
  rocksglass: G('Rocks glass', 'Drinkware', 'cup', { diameter: 3.3, baseDiameter: 2.9, height: 3.5, wrapWidth: 8, printHeight: 2 }, 'a typical 10.5 oz rocks glass (3.3 in across, 3.5 in tall): chosen here', { printTop: .6, sides: 2 }),
  cancooler: G('Can cooler', 'Drinkware', 'cup', { diameter: 3, height: 4.6, wrapWidth: 9, printHeight: 3.5 }, 'a typical 12 oz can cooler (3 in across, 4.6 in tall): chosen here', { sides: 2 }),
  // ---- wall art and decor ----
  poster: G('Poster', 'Wall art and decor', 'panel', { width: 18, height: 24 }, '18 × 24 in, a standard poster size: chosen here'),
  canvas: G('Canvas print', 'Wall art and decor', 'panel', { width: 16, height: 20, depth: 1.25 }, '16 × 20 in on a 1.25 in gallery-wrap bar, a standard size: chosen here', { marks: ['depth'] }),
  sign: G('Metal sign', 'Wall art and decor', 'panel', { width: 12, height: 8 }, 'the catalogue\'s 12 × 8 in printed aluminium sign', { corner: .5, marks: ['holes'] }),
  tapestry: G('Wall tapestry', 'Wall art and decor', 'panel', { width: 60, height: 40 }, 'the catalogue\'s 40 × 60 in wall tapestry, hung wide', { marks: ['hem'] }),
  flag: G('Flag', 'Wall art and decor', 'panel', { width: 12, height: 18 }, 'the catalogue\'s 12 × 18 in garden flag', { marks: ['rod'], sides: 2 }),
  clock: G('Wall clock', 'Wall art and decor', 'disc', { diameter: 10 }, 'the catalogue\'s 10 in wall clock', { marks: ['hands'] }),
  // ---- home textiles ----
  pillow: G('Pillow', 'Home textiles', 'panel', { width: 18, height: 18 }, '18 × 18 in, a typical throw pillow (the catalogue lists 16 × 16 and 17 × 18): chosen here', { corner: .6, marks: ['hem'], sides: 2 }),
  pillowcase: G('Pillowcase', 'Home textiles', 'panel', { width: 30, height: 20 }, '20 × 30 in, the standard pillowcase', { marks: ['opening'], sides: 2 }),
  blanket: G('Blanket', 'Home textiles', 'panel', { width: 50, height: 60 }, 'the catalogue\'s 50 × 60 in blanket', { corner: 1, marks: ['hem'] }),
  towel: G('Towel', 'Home textiles', 'panel', { width: 30, height: 60 }, '30 × 60 in, the usual beach towel: chosen here', { marks: ['bands'] }),
  teatowel: G('Tea towel', 'Home textiles', 'panel', { width: 18, height: 26 }, 'the catalogue\'s 26 × 18 in dish towel', { marks: ['hem'] }),
  rug: G('Rug', 'Home textiles', 'panel', { width: 36, height: 24 }, '2 × 3 ft, a standard small rug: chosen here', { corner: .5, marks: ['border'] }),
  doormat: G('Door or bath mat', 'Home textiles', 'panel', { width: 30, height: 18 }, '18 × 30 in, the usual door mat: chosen here', { corner: .75, marks: ['border'] }),
  showercurtain: G('Shower curtain', 'Home textiles', 'panel', { width: 72, height: 72 }, '72 × 72 in, the standard shower curtain', { marks: ['rings'] }),
  curtain: G('Window curtain', 'Home textiles', 'panel', { width: 50, height: 84 }, '50 × 84 in, a standard curtain panel: chosen here', { marks: ['rod'] }),
  placemat: G('Placemat', 'Home textiles', 'panel', { width: 18, height: 14 }, '18 × 14 in, the usual placemat: chosen here', { corner: .5, marks: ['hem'] }),
  napkin: G('Napkin', 'Home textiles', 'panel', { width: 20, height: 20 }, '20 × 20 in, a dinner napkin: chosen here', { marks: ['hem'] }),
  tablerunner: G('Table runner', 'Home textiles', 'panel', { width: 72, height: 16 }, '16 × 72 in, a standard runner: chosen here', { marks: ['hem'] }),
  tablecloth: G('Tablecloth', 'Home textiles', 'panel', { width: 84, height: 60 }, '60 × 84 in, a standard six-seat cloth: chosen here', { marks: ['hem'] }),
  bedding: G('Duvet cover or comforter', 'Home textiles', 'panel', { width: 88, height: 88 }, '88 × 88 in, queen size: chosen here', { marks: ['hem'] }),
  apron: G('Apron', 'Home textiles', 'apron', { width: 27, height: 31, bibWidth: 10 }, 'a typical bib apron (27 in wide, 31 in long, a 10 in bib): chosen here'),
  stocking: G('Christmas stocking', 'Home textiles', 'sock', { width: 7.5, legLength: 18, footLength: 11, cuff: 3 }, 'a typical 18 in stocking, 7.5 in across the leg: chosen here', { sides: 2 }),
  // ---- tech ----
  phonecase: G('Phone case', 'Tech', 'panel', { width: 2.95, height: 6 }, 'a case for a 2.82 × 5.81 in phone (Apple\'s iPhone 15 dimensions) with its wall', { corner: .45, marks: ['camera'], ...ACC }),
  mousepad: G('Mouse pad', 'Tech', 'panel', { width: 9.25, height: 7.75 }, '9.25 × 7.75 in, the common printed mouse pad: chosen here', { corner: .5, ...ACC }),
  deskmat: G('Desk mat', 'Tech', 'panel', { width: 31.5, height: 15.75 }, '800 × 400 mm (31.5 × 15.75 in), the common desk mat: chosen here', { corner: .4, marks: ['hem'], ...ACC }),
  laptopsleeve: G('Laptop sleeve', 'Tech', 'panel', { width: 13.5, height: 10 }, 'a sleeve for a 13 in laptop (the catalogue lists 12, 13 and 15 in): outside size chosen here', { corner: .6, marks: ['zip'], sides: 2, ...ACC }),
  powerbank: G('Power bank', 'Tech', 'panel', { width: 2.8, height: 5.7 }, 'a typical 10,000 mAh power bank: chosen here', { corner: .3, marks: ['port'], ...ACC }),
  speaker: G('Speaker', 'Tech', 'cup', { diameter: 3, height: 7, wrapWidth: 4, printHeight: 2 }, 'a typical cylinder Bluetooth speaker, 3 in across and 7 in tall: chosen here', { printTop: 2.5, marks: ['grille'], ...ACC }),
  earbudscase: G('Earbuds case', 'Tech', 'panel', { width: 2.4, height: 1.8 }, 'the AirPods Pro charging case, 60.6 × 45.2 mm (Apple\'s dimensions)', { corner: .5, marks: ['lid'], ...ACC }),
  chargingpad: G('Wireless charging pad', 'Tech', 'disc', { diameter: 4 }, 'a typical 4 in round charging pad: chosen here', { marks: ['coil'], ...ACC }),
  // ---- paper and small goods ----
  sticker: G('Sticker', 'Paper and small goods', 'panel', { width: 3, height: 3 }, '3 × 3 in, a typical die-cut sticker: chosen here', { corner: .3 }),
  notebook: G('Notebook', 'Paper and small goods', 'panel', { width: 5.5, height: 8.5 }, 'the catalogue\'s 5.5 × 8.5 in bound journal', { corner: .2, marks: ['spine'], sides: 2 }),
  puzzle: G('Jigsaw puzzle', 'Paper and small goods', 'panel', { width: 20, height: 16 }, 'the catalogue\'s 16 × 20 in puzzle', { marks: ['pieces'] }),
  coaster: G('Coaster', 'Paper and small goods', 'panel', { width: 3.75, height: 3.75 }, '3.75 in square, a typical coaster: chosen here', { corner: .4 }),
  card: G('Playing cards', 'Paper and small goods', 'panel', { width: 2.5, height: 3.5 }, 'poker size, 2.5 × 3.5 in, the standard card', { corner: .125, sides: 2 }),
  calendar: G('Wall calendar', 'Paper and small goods', 'panel', { width: 11, height: 8.5 }, '11 × 8.5 in closed, a typical wall calendar: chosen here', { marks: ['spiral'] }),
  recordsleeve: G('Record sleeve', 'Music', 'panel', { width: 12.375, height: 12.375 }, 'a 12 in LP jacket, 12.375 in square (the standard jacket)', { marks: ['disc'], sides: 2 }),
  // ---- pets ----
  petbed: G('Pet bed', 'Pets', 'panel', { width: 28, height: 18 }, 'the catalogue\'s 28 × 18 in pet bed', { corner: 2.5, marks: ['bolster'] }),
  petbowl: G('Pet bowl', 'Pets', 'cup', { diameter: 5.5, baseDiameter: 6.5, height: 2.2, wrapWidth: 8, printHeight: 1.25 }, 'a typical steel pet bowl, 6.5 in across its base and 2.2 in tall: chosen here', { sides: 2 }),
  petcollar: G('Pet collar or leash', 'Pets', 'panel', { width: 20, height: 1 }, 'a 1 in wide collar, 20 in long (large): chosen here; a leash is the same strap, longer', { marks: ['buckle'], ...ACC }),
  petmat: G('Pet feeding mat', 'Pets', 'panel', { width: 19, height: 14 }, 'the catalogue\'s 14 × 19 in feeding mat (drawn as a rectangle; the catalogue cuts it as a bone or a fish)', { corner: 2 }),
  pettee: G('Pet tee', 'Pets', 'pettee', { length: 14, chest: 10, neckWidth: 6.5 }, 'a typical medium dog shirt, 14 in down the back and 10 in across the chest laid flat: chosen here', { sides: 2, ...ACC }),
  // ---- sports and outdoor ----
  yogamat: G('Yoga mat', 'Sports and outdoor', 'panel', { width: 24, height: 68 }, '24 × 68 in, the standard yoga mat', { corner: .5 }),
  ball: G('Ball', 'Sports and outdoor', 'disc', { diameter: 9.4 }, 'a size 7 basketball, 29.5 in around (9.4 in across)', { marks: ['seams'] }),
  skateboard: G('Skateboard deck', 'Sports and outdoor', 'panel', { width: 8.25, height: 32 }, 'a typical 8.25 × 32 in deck: chosen here', { corner: 4.125, marks: ['trucks'] }),
  paddle: G('Paddle', 'Sports and outdoor', 'paddle', { width: 7.9, length: 15.75, handle: 5 }, 'a typical pickleball paddle, 7.9 in wide and 15.75 in long with a 5 in handle: chosen here', { sides: 2 }),
  umbrella: G('Umbrella', 'Sports and outdoor', 'disc', { diameter: 38 }, 'a folding umbrella with a 42 in arc, about 38 in across when open: chosen here', { ngon: 8, marks: ['ribs'], ...ACC }),
  // ---- automotive ----
  carmat: G('Car mat', 'Automotive', 'panel', { width: 18, height: 27 }, 'a typical universal front mat, 18 × 27 in: chosen here', { corner: 2, marks: ['border'] }),
  seatcover: G('Car seat cover', 'Automotive', 'seatcover', { width: 21, height: 50 }, 'a typical universal front seat cover, 21 in wide and 50 in from the headrest to the front of the seat: chosen here'),
  wheelcover: G('Steering wheel cover', 'Automotive', 'disc', { diameter: 15, innerDiameter: 12 }, 'a 15 in cover, the standard wheel (14.5 to 15.5 in)', { marks: ['ring'] }),
  plate: G('Licence plate', 'Automotive', 'panel', { width: 12, height: 6 }, '12 × 6 in, the standard US plate', { corner: .5, marks: ['holes'] }),
  // ---- socks, scarves and sandals ----
  socks: G('Socks', 'Socks, scarves and sandals', 'sock', { width: 3.75, legLength: 8.5, footLength: 9.5, cuff: 1.5 }, 'a typical men\'s medium crew sock laid flat: chosen here', { sides: 2, ...ACC }),
  scarf: G('Scarf', 'Socks, scarves and sandals', 'panel', { width: 70, height: 10 }, 'a typical 10 × 70 in scarf: chosen here', { marks: ['fringe'], ...ACC }),
  flipflop: G('Flip-flop', 'Socks, scarves and sandals', 'sole', { length: 11.25, width: 4.25 }, 'a typical men\'s US 9 flip-flop, 11.25 in long: chosen here', { variant: 'thong', ...ACC }),
  slide: G('Slide sandal', 'Socks, scarves and sandals', 'sole', { length: 11, width: 4.3 }, 'a typical men\'s US 9 slide, 11 in long: chosen here', { variant: 'slide', ...ACC }),
  clog: G('Clog', 'Socks, scarves and sandals', 'sole', { length: 11.25, width: 4.4 }, 'a typical men\'s US 9 foam clog, 11.25 in long: chosen here', { variant: 'clog', ...ACC }),
  bandana: G('Bandana', 'Socks, scarves and sandals', 'triangle', { width: 22, height: 11 }, 'a 22 in bandana folded to its triangle, 11 in deep (a person\'s or a pet\'s): chosen here', ACC),
  facemask: G('Face mask', 'Socks, scarves and sandals', 'panel', { width: 7.5, height: 5 }, 'a typical adult cloth mask, 7.5 × 5 in: chosen here', { corner: 1, marks: ['loops'], ...ACC }),
  belt: G('Web belt', 'Socks, scarves and sandals', 'panel', { width: 48, height: 1.5 }, 'a 1.5 in web belt, 48 in long: chosen here', { marks: ['buckle'], ...ACC }),
  bib: G('Bandana bib', 'Kids and baby', 'triangle', { width: 15.5, height: 7.5 }, 'a typical baby bandana bib, 15.5 in across and 7.5 in deep: chosen here', ACC),
  cooler: G('Lunch bag or cooler', 'Bags', 'panel', { width: 10, height: 9 }, 'a typical soft lunch cooler, its front 10 in wide and 9 in tall: chosen here', { corner: .75, marks: ['zip', 'handle'], ...ACC }),
  // ---- what none of the above fits: a flat panel to place the artwork on ----
  other: G('Other product', 'Other', 'panel', { width: 12, height: 12 }, 'a 12 in square panel to place the artwork on: the product itself is not drawn')
};

export const GOODS_POM = { diameter: 'Diameter', baseDiameter: 'Diameter at the base', innerDiameter: 'Diameter of the opening', wrapWidth: 'Wrap print area, around', printHeight: 'Print area, height', depth: 'Depth of the edge', bibWidth: 'Bib width, top edge', legLength: 'Leg, top edge to the bottom of the heel', footLength: 'Foot, heel to toe', length: 'Length', chest: 'Chest, flat', neckWidth: 'Neck, flat', handle: 'Handle length' };

// ---- the drawings ----
const P = pts => 'M' + pts.map(q => q.map(n => +n.toFixed(3)).join(' ')).join(' L');
const boundsOf = pts => { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
// a rectangle with rounded corners, as a closed polygon from the top left, clockwise
function rrect(x0, y0, x1, y1, r = 0, n = 6) {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)); if (!r) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const arc = (cx, cy, a0) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + i / n * Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  return [...arc(x0 + r, y0 + r, Math.PI), ...arc(x1 - r, y0 + r, -Math.PI / 2), ...arc(x1 - r, y1 - r, 0), ...arc(x0 + r, y1 - r, Math.PI / 2)];
}
const ring = (cx, cy, r, n = 48) => Array.from({ length: n }, (_, i) => { const a = i / n * 2 * Math.PI - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const dot = (x, y, r = .15) => ({ d: `M${+(x - r).toFixed(3)} ${+y.toFixed(3)} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`, kind: 'seam' });
const line = (a, b, kind = 'seam') => ({ d: P([a, b]), kind });
const closed = (pts, kind = 'outline') => ({ d: P(pts) + ' Z', kind });
const bez = (a, c1, c2, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]; });
const flip = pts => pts.map(([x, y]) => [-x, y]);
// the print area on a side: 'print area' on the front, 'back print area' on the back; a one-sided product has none on its back
const named = (S, view, poly, name = 'print area') => (view === 'back' && S.sides !== 2 ? {} : { [view === 'back' ? `back ${name}` : name]: poly });
const out = (outline, parts, regions, keepouts, pom, extra = []) => ({ outline, parts, regions, keepouts, pom, bounds: boundsOf([...outline, ...extra]), anchorName: 'the top edge' });

// a flat panel: a poster, a towel, a phone case, a mat. Its top edge is y 0, its centre line x 0. The print area is the whole face.
function panel(S, m, view) {
  const w = m.width / 2, h = m.height, marks = S.marks || [], poly = rrect(-w, 0, w, h, S.corner || 0), parts = [closed(poly)], keep = [], extra = [], back = view === 'back';
  const inset = Math.min(.5, w * .08, h * .08);
  for (const k of marks) {
    if (k === 'hem') parts.push(closed(rrect(-w + inset, inset, w - inset, h - inset, Math.max(0, (S.corner || 0) - inset)), 'stitch'));
    if (k === 'border') parts.push(closed(rrect(-w + inset * 2, inset * 2, w - inset * 2, h - inset * 2, Math.max(0, (S.corner || 0) - inset * 2)), 'seam'));
    if (k === 'bands') for (const y of [h * .06, h * .94]) parts.push(line([-w, y], [w, y], 'stitch'));
    if (k === 'depth') { const d = m.depth || 1; parts.unshift(closed(rrect(-w - d, -d, w + d, h + d), 'stitch')); extra.push([-w - d, -d], [w + d, h + d]); }
    if (k === 'holes') { const r = Math.min(.19, h * .03), dx = w - Math.max(.5, w * .08), dy = Math.max(.5, h * .08); for (const [x, y] of [[-dx, dy], [dx, dy], [-dx, h - dy], [dx, h - dy]]) { parts.push(dot(x, y, r)); keep.push({ name: 'a mounting hole', poly: rrect(x - r * 2, y - r * 2, x + r * 2, y + r * 2), why: 'hole', level: 'fail' }); } }
    if (k === 'rod') { parts.push(line([-w, Math.min(2, h * .1)], [w, Math.min(2, h * .1)], 'stitch')); keep.push({ name: 'the rod pocket', poly: rrect(-w - 1, -1, w + 1, Math.min(2, h * .1)), why: 'rod', level: 'warn' }); }
    if (k === 'rings') { for (let i = 0; i < 12; i++) parts.push(dot(-w + (i + .5) * (2 * w / 12), 1, .3)); keep.push({ name: 'the ring holes', poly: rrect(-w - 1, -1, w + 1, 2), why: 'rod', level: 'fail' }); }
    if (k === 'opening') parts.push(line([w - 4, 0], [w - 4, h], 'stitch'));
    if (k === 'camera' && back) { const c = rrect(-w + .2, .2, -w + 1.55, 1.55, .35); parts.push(closed(c, 'seam')); keep.push({ name: 'the camera opening', poly: c, why: 'hole', level: 'fail' }); }
    if (k === 'camera' && !back) parts.push(closed(rrect(-w + .12, .12, w - .12, h - .12, Math.max(0, (S.corner || 0) - .12)), 'seam')); // the inside of the case, where the phone sits
    if (k === 'zip') { const y = S.shape === 'panel' && marks.includes('handle') ? h * .28 : .5; parts.push(line([-w + .4, y], [w - .4, y], 'stitch'), closed(rrect(w - 1.1, y - .12, w - .5, y + .12, .05), 'seam')); keep.push({ name: 'the zip', poly: rrect(-w - 1, y - .3, w + 1, y + .3), why: 'zip', level: 'fail' }); }
    if (k === 'handle') { const a = bez([-w * .45, 0], [-w * .45, -2.4], [w * .45, -2.4], [w * .45, 0], 20), b = bez([-w * .45 + .6, 0], [-w * .45 + .6, -1.7], [w * .45 - .6, -1.7], [w * .45 - .6, 0], 20); parts.push(closed([...a, ...b.reverse()])); extra.push([0, -1.9]); }
    if (k === 'port') parts.push(closed(rrect(-.25, .12, .25, .3, .06), 'seam'), ...[0, 1, 2, 3].map(i => dot(-w * .4 + i * .22, h - .35, .05)));
    if (k === 'lid') parts.push(line([-w, h * .36], [w, h * .36]), dot(0, h * .52, .05));
    if (k === 'spine') parts.push(line([(back ? 1 : -1) * (w - .45), 0], [(back ? 1 : -1) * (w - .45), h]));
    if (k === 'spiral') for (let i = 0; i < 22; i++) parts.push(dot(-w + (i + .5) * (2 * w / 22), .25, .09));
    if (k === 'pieces') { for (let i = 1; i < 6; i++) parts.push(line([-w + i * (2 * w / 6), 0], [-w + i * (2 * w / 6), h], 'rib')); for (let j = 1; j < 5; j++) parts.push(line([-w, j * h / 5], [w, j * h / 5], 'rib')); }
    if (k === 'disc' && !back) { const c = ring(w * .55, h / 2, h * .46); parts.unshift(closed(c)); parts.push(dot(w * .55, h / 2, h * .14), dot(w * .55, h / 2, .15)); extra.push([w * .55 + h * .46, h / 2]); } // the record, part way out of its jacket
    if (k === 'bolster') parts.push(closed(rrect(-w + 3, 3, w - 3, h - 3, 1.5), 'seam'));
    if (k === 'trucks') for (const y of [h * .19, h * .81]) for (const [dx, dy] of [[-.82, -1.05], [.82, -1.05], [-.82, 1.05], [.82, 1.05]]) parts.push(dot(dx, y + dy, .1));
    if (k === 'fringe') for (const sg of [-1, 1]) { for (let y = .4; y < h; y += .6) parts.push(line([sg * w, y], [sg * (w + 1.5), y], 'rib')); extra.push([sg * (w + 1.5), 0]); }
    if (k === 'loops') for (const sg of [-1, 1]) { parts.push({ d: P(bez([sg * w, h * .2], [sg * (w + 2.4), h * .1], [sg * (w + 2.4), h * .9], [sg * w, h * .8], 16)), kind: 'seam' }); extra.push([sg * (w + 1.9), h / 2]); }
    if (k === 'buckle') { parts.push(closed(rrect(-w - h * .9, -h * .2, -w + h * .5, h * 1.2, h * .15)), line([-w - h * .2, -h * .2], [-w - h * .2, h * 1.2])); for (let i = 0; i < 5; i++) parts.push(dot(w - h * (1.5 + i * 1.1), h / 2, Math.min(.12, h * .1))); extra.push([-w - h * .9, -h * .2], [-w, h * 1.2]); keep.push({ name: 'the buckle holes', poly: rrect(w - h * 7, -1, w + 1, h + 1), why: 'hole', level: 'warn' }); }
  }
  // the bolster of a pet bed is not printed: its print area is the cushion inside it
  const area = marks.includes('bolster') ? rrect(-w + 3, 3, w - 3, h - 3, 1.5) : poly;
  return out(poly, parts, named(S, view, area), keep, [{ key: 'width', from: [-w, h + .7], to: [w, h + .7] }, { key: 'height', from: [w + .7, 0], to: [w + .7, h] }], extra);
}
// a round product seen face on: a clock, a ball, a charging pad; with ngon, a flat-sided one (an umbrella's canopy from above)
function disc(S, m, view) {
  const r = m.diameter / 2, marks = S.marks || [], poly = S.ngon ? ring(0, r, r, S.ngon) : ring(0, r, r), parts = [closed(poly)], keep = [];
  for (const k of marks) {
    if (k === 'hands') { for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI; parts.push(line([Math.sin(a) * r * .9, r - Math.cos(a) * r * .9], [Math.sin(a) * r * .82, r - Math.cos(a) * r * .82])); } parts.push(line([0, r], [0, r * .35]), line([0, r], [r * .42, r * 1.1]), dot(0, r, .18)); keep.push({ name: 'the hands\' spindle', poly: rrect(-.5, r - .5, .5, r + .5), why: 'hole', level: 'fail' }); }
    if (k === 'coil') parts.push(closed(ring(0, r, r * .55), 'stitch'));
    if (k === 'seams') parts.push(line([-r, r], [r, r]), { d: P(bez([-r * .7, r * .29], [-r * .1, r * .7], [-r * .1, r * 1.3], [-r * .7, r * 1.71])), kind: 'seam' }, { d: P(bez([r * .7, r * .29], [r * .1, r * .7], [r * .1, r * 1.3], [r * .7, r * 1.71])), kind: 'seam' });
    if (k === 'ribs') { for (const q of poly) parts.push(line([0, r], q)); parts.push(dot(0, r, .35)); keep.push({ name: 'the tip of the umbrella', poly: rrect(-1, r - 1, 1, r + 1), why: 'hole', level: 'fail' }); }
    if (k === 'ring') { const hole = ring(0, r, (m.innerDiameter || m.diameter * .8) / 2); parts.push(closed(hole)); keep.push({ name: 'the opening', poly: hole, why: 'hole', level: 'fail' }); }
  }
  return out(poly, parts, named(S, view, poly), keep, [{ key: 'diameter', from: [-r, 2 * r + .7], to: [r, 2 * r + .7] }]);
}
// drinkware and other round things seen from the side. profile: [[how far down, 't' the top diameter | 'b' the base | a share of the top]...]
function cup(S, m, view) {
  const t = m.diameter, b = m.baseDiameter || t, lid = S.lid || 0, H = m.height, bodyH = H - lid, back = view === 'back', sg = back ? -1 : 1;
  const prof = (S.profile || [[0, 't'], [1, 'b']]).map(([f, d]) => [lid + f * bodyH, (d === 't' ? t : d === 'b' ? b : d * t) / 2]);
  const halfAt = y => { for (let i = 0; i + 1 < prof.length; i++) { const [y0, w0] = prof[i], [y1, w1] = prof[i + 1]; if (y >= y0 - 1e-9 && y <= y1 + 1e-9) return y1 === y0 ? Math.min(w0, w1) : w0 + (w1 - w0) * (y - y0) / (y1 - y0); } return prof[prof.length - 1][1]; };
  const right = prof.map(([y, w]) => [w, y]), poly = [...flip(right), ...right.slice().reverse()];
  const parts = [closed(poly)], extra = [], keep = [];
  if (lid) { const lw = prof[0][1] + .08; parts.push(closed(rrect(-lw, 0, lw, lid, Math.min(.15, lid / 3)))); }
  if (S.straw) { parts.push(closed([[sg * .25, 0], [sg * .55, -2.2], [sg * .8, -2.2], [sg * .5, 0]])); extra.push([sg * .8, -2.2]); }
  if (S.handle) { const [f0, f1, reach] = S.handle, y0 = lid + f0 * bodyH, y1 = lid + f1 * bodyH, x0 = halfAt(y0), x1 = halfAt(y1), th = Math.min(.4, reach * .3);
    const outer = bez([x0, y0], [x0 + reach * 1.25, y0], [x1 + reach * 1.25, y1], [x1, y1], 20), inner = bez([x0, y0 + th], [x0 + reach * 1.25 - th * 1.6, y0 + th], [x1 + reach * 1.25 - th * 1.6, y1 - th], [x1, y1 - th], 20);
    parts.push(closed([...outer, ...inner.reverse()].map(([x, y]) => [sg * x, y]))); extra.push([sg * (Math.max(x0, x1) + reach), (y0 + y1) / 2]); }
  if ((S.marks || []).includes('grille')) for (let y = lid + bodyH * .08; y < lid + bodyH * .3; y += .18) parts.push(line([-halfAt(y) + .15, y], [halfAt(y) - .15, y], 'rib'));
  // the part of the wrap that shows from this side: as tall as the print area, and as wide as the side is at its narrowest there (less a little
  // for the curve), or half the wrap if that is less
  const ph = Math.min(m.printHeight || bodyH, bodyH), top = lid + Math.min(S.printTop ?? (bodyH - ph) / 2, bodyH - ph), ys = [top, top + ph, ...prof.map(q => q[0]).filter(y => y > top && y < top + ph)];
  const half = Math.min(...ys.map(halfAt)) * .92, pw = Math.min(half, (m.wrapWidth || t * 3) / 4), area = rrect(-pw, top, pw, top + ph);
  return out(poly, parts, named(S, view, area), keep, [{ key: 'diameter', from: [-t / 2, -.5 - (S.straw ? 2.2 : 0)], to: [t / 2, -.5 - (S.straw ? 2.2 : 0)] }, { key: 'height', from: [-Math.max(t, b) / 2 - .7, 0], to: [-Math.max(t, b) / 2 - .7, H] }], extra);
}
// a sock laid flat, toe to the viewer's right on its outer side: the leg from the top edge to the heel, the foot from the heel to the toe
function sock(S, m, view) {
  const w = m.width, L = m.legLength, F = m.footLength, c = m.cuff || 0, sg = view === 'back' ? -1 : 1, x0 = -w / 2;
  const poly = [[x0, 0], [x0 + w, 0], [x0 + w, L - w], ...bez([x0 + F - w * .45, L - w], [x0 + F + w * .08, L - w], [x0 + F + w * .08, L], [x0 + F - w * .45, L], 10), ...bez([x0 + w * .5, L], [x0 + w * .12, L], [x0, L - w * .12], [x0, L - w * .55], 8)].map(([x, y]) => [sg * x, y]);
  const leg = rrect(x0 + .3, c + .3, x0 + w - .3, L - w - .2).map(([x, y]) => [sg * x, y]), foot = rrect(x0 + w, L - w + .35, x0 + F - w * .5, L - .35).map(([x, y]) => [sg * x, y]);
  const parts = [closed(poly), line([sg * x0, c], [sg * (x0 + w), c]), { d: P(bez([x0, L - w * .9], [x0 + w * .5, L - w * .8], [x0 + w * .8, L - w * .4], [x0 + w * .75, L], 8).map(([x, y]) => [sg * x, y])), kind: 'stitch' }, { d: P(bez([x0 + F - w * .75, L - w], [x0 + F - w * .55, L - w * .6], [x0 + F - w * .55, L - w * .4], [x0 + F - w * .75, L], 8).map(([x, y]) => [sg * x, y])), kind: 'stitch' }];
  for (let x = x0 + .25; x < x0 + w; x += .3) parts.push(line([sg * x, .08], [sg * x, c - .08], 'rib'));
  const b = view === 'back' ? 'back ' : '';
  return out(poly, parts, { [`${b}leg print area`]: leg, [`${b}foot print area`]: foot }, [{ name: 'the cuff', poly: rrect(-w, -1, w, c), why: 'cuff', level: 'warn' }],
    [{ key: 'width', from: [-w / 2, -.6], to: [w / 2, -.6] }, { key: 'legLength', from: [sg * (x0 - .7), 0], to: [sg * (x0 - .7), L] }, { key: 'footLength', from: [sg * x0, L + .7], to: [sg * (x0 + F), L + .7] }]);
}
// a sandal's footbed from above (the left foot, toes up): a flip-flop's thong, a slide's band or a clog's upper over it
function sole(S, m, view) {
  const L = m.length, w = m.width / 2, back = view === 'back';
  const side = [...bez([0, 0], [w * .9, 0], [w * 1.05, L * .12], [w, L * .3], 10), ...bez([w, L * .3], [w * .95, L * .5], [w * .72, L * .6], [w * .74, L * .8], 10).slice(1), ...bez([w * .74, L * .8], [w * .76, L * .96], [w * .4, L], [0, L], 10).slice(1)];
  const poly = [...side, ...flip(side).reverse().slice(1, -1)], parts = [closed(poly)], regions = {}, keep = [];
  const inner = poly.map(([x, y]) => [x * .86, L / 2 + (y - L / 2) * .94]);
  if (back) { parts.push(closed(inner, 'stitch')); for (let y = L * .12; y < L * .9; y += L * .07) parts.push(line([-w * .5, y], [w * .5, y + L * .02], 'rib')); return out(poly, parts, {}, [], [{ key: 'length', from: [w + .7, 0], to: [w + .7, L] }]); }
  if (S.variant === 'thong') { const post = [0, L * .17], band = sg => { const a = bez(post, [sg * w * .5, L * .22], [sg * w * .95, L * .4], [sg * w * .9, L * .58], 12), b = bez([post[0], post[1] + .45], [sg * w * .4, L * .3], [sg * w * .7, L * .44], [sg * w * .68, L * .58], 12); return closed([...a, ...b.reverse()]); };
    parts.push(band(1), band(-1), dot(post[0], post[1] + .15, .16)); regions['footbed print area'] = inner; keep.push({ name: 'the toe post', poly: rrect(-.4, L * .17 - .3, .4, L * .17 + .6), why: 'hole', level: 'fail' }); }
  else if (S.variant === 'slide') { const band = [[-w * 1.06, L * .2], [w * 1.06, L * .2], [w * 1.02, L * .5], [-w * 1.02, L * .5]]; parts.push(closed(band)); regions['strap print area'] = rrect(-w * .78, L * .23, w * .78, L * .47); regions['footbed print area'] = rrect(-w * .6, L * .56, w * .6, L * .94); }
  else { const top = [...side.filter(q => q[1] <= L * .56), [w * .97, L * .56]], upper = [...top, ...flip(top).reverse()]; parts.push(closed(upper), line([-w, L * .56], [w, L * .56])); for (const [x, y] of [[-.9, .16], [0, .13], [.9, .16], [-.45, .25], [.45, .25], [0, .34]]) parts.push(dot(x * w * .5, y * L, .16));
    parts.push({ d: P(bez([-w * .9, L * .6], [-w * .9, L * 1.02], [w * .9, L * 1.02], [w * .9, L * .6], 16)), kind: 'seam' }); regions['upper print area'] = rrect(-w * .62, L * .38, w * .62, L * .54); }
  return out(poly, parts, regions, keep, [{ key: 'length', from: [w + .7, 0], to: [w + .7, L] }, { key: 'width', from: [-w, L + .7], to: [w, L + .7] }]);
}
// a bib apron: the bib at the top, the body below it, a neck strap and waist ties
function apron(S, m, view) {
  const w = m.width / 2, h = m.height, bw = m.bibWidth / 2, by = h * .33;
  const sideR = bez([bw, 0], [bw, by * .6], [w * .7, by], [w, by], 10), poly = [[-bw, 0], ...sideR, [w, h], [-w, h], ...flip(sideR).reverse()];
  const parts = [closed(poly), { d: P(bez([-bw, 0], [-bw - 1, -9], [bw + 1, -9], [bw, 0], 20)), kind: 'seam' }, line([-w, by], [-w - 6, by + 1]), line([w, by], [w + 6, by + 1]), closed(rrect(-w + .5, .5 + by, w - .5, h - .5), 'stitch')];
  if (view === 'back') return out(poly, parts, {}, [], [{ key: 'width', from: [-w, h + .7], to: [w, h + .7] }], [[0, -6.8], [-w - 6, by], [w + 6, by]]);
  return out(poly, parts, { 'bib print area': rrect(-bw + .5, 1, bw - .5, by - .5), 'body print area': rrect(-w + 1, by + 1, w - 1, h - 1) }, [],
    [{ key: 'width', from: [-w, h + .7], to: [w, h + .7] }, { key: 'height', from: [w + .7, 0], to: [w + .7, h] }, { key: 'bibWidth', from: [-bw, -.5], to: [bw, -.5] }], [[0, -6.8], [-w - 6, by], [w + 6, by]]);
}
// a bandana or a bandana bib folded to its triangle: the long edge at the top, the point at the bottom
function triangle(S, m, view) {
  const w = m.width / 2, h = m.height, poly = [[-w, 0], [w, 0], [0, h]], k = .62, area = [[-w * k, h * .08], [w * k, h * .08], [0, h * (.08 + k * .92)]];
  const parts = [closed(poly), closed([[-w + .9, .3], [w - .9, .3], [0, h - .5]], 'stitch'), dot(-w + .45, .25, .12), dot(w - .45, .25, .12)];
  return out(poly, parts, named(S, view, area), [], [{ key: 'width', from: [-w, -.6], to: [w, -.6] }, { key: 'height', from: [w + .7, 0], to: [w + .7, h] }]);
}
// a dog's tee laid flat: the neck at the top, two short sleeves for the front legs, the back longer than the chest
function pettee(S, m, view) {
  const L = m.length, c = m.chest / 2, n = m.neckWidth / 2, back = view === 'back', len = back ? L * .62 : L;
  const right = [[n, 0], [c, L * .16], [c + 1.6, L * .3], [c + 1.1, L * .42], [c, L * .36], [c * .92, len]], poly = [...right.map(([x, y]) => [-x, y]), ...right.slice().reverse()];
  const parts = [closed(poly), { d: P(bez([-n, 0], [-n * .5, back ? 1.6 : .8], [n * .5, back ? 1.6 : .8], [n, 0], 10)), kind: 'seam' }, line([-c * .92 + .1, len - .5], [c * .92 - .1, len - .5], 'stitch')];
  const area = rrect(-c + 1.2, L * .2, c - 1.2, len - 1.2);
  return out(poly, parts, { [back ? 'chest print area' : 'back print area']: area }, [], [{ key: 'chest', from: [-c, len + .7], to: [c, len + .7] }, { key: 'length', from: [c + 2.3, 0], to: [c + 2.3, L] }], [[0, L]]);
}
// a car seat cover laid flat: the headrest, the backrest, then the seat
function seatcover(S, m, view) {
  const w = m.width / 2, h = m.height, hr = h * .16, bk = h * .62, hw = w * .5;
  const poly = [...rrect(-hw, 0, hw, hr, 1.5).slice(0, 14), [hw, hr], [w * .92, hr + .01], [w, bk], [w, h], [-w, h], [-w, bk], [-w * .92, hr + .01], [-hw, hr]];
  const parts = [closed(poly), line([-hw, hr], [hw, hr]), line([-w, bk], [w, bk]), closed(rrect(-w + 1.5, hr + 2, w - 1.5, bk - 2, 1), 'stitch'), closed(rrect(-w + 1.5, bk + 2, w - 1.5, h - 2, 1), 'stitch')];
  if (view === 'back') return out(poly, parts, {}, [], [{ key: 'width', from: [-w, h + .7], to: [w, h + .7] }]);
  return out(poly, parts, { 'backrest print area': rrect(-w + 1.5, hr + 2, w - 1.5, bk - 2), 'seat print area': rrect(-w + 1.5, bk + 2, w - 1.5, h - 2) }, [{ name: 'the fold between the back and the seat', poly: rrect(-w - 1, bk - 1, w + 1, bk + 1), why: 'fold', level: 'fail' }],
    [{ key: 'width', from: [-w, h + .7], to: [w, h + .7] }, { key: 'height', from: [w + .7, 0], to: [w + .7, h] }]);
}
// a paddle: its face and its handle
function paddle(S, m, view) {
  const w = m.width / 2, L = m.length, hd = m.handle, face = L - hd, hw = .65, f = rrect(-w, 0, w, face, Math.min(2.4, w * .6), 8);
  const poly = [...f.slice(0, 27), [hw, face], [hw, L], [-hw, L], [-hw, face], ...f.slice(27)]; // the handle let into the bottom edge of the face
  const parts = [closed(poly), closed(rrect(-w + .25, .25, w - .25, face - .25, Math.min(2.2, w * .55), 8), 'stitch'), line([-hw, face + .4], [hw, face + .4])];
  for (let y = face + .9; y < L - .2; y += .45) parts.push(line([-hw, y], [hw, y - .25], 'rib'));
  return out(poly, parts, named(S, view, rrect(-w + .7, .7, w - .7, face - .7), 'face print area'), [], [{ key: 'width', from: [-w, -.6], to: [w, -.6] }, { key: 'length', from: [w + .7, 0], to: [w + .7, L] }]);
}
const SHAPES = { panel, disc, cup, sock, sole, apron, triangle, pettee, seatcover, paddle };
// → { outline, parts: [{d, kind}], regions: {name: polygon}, keepouts, pom, bounds, anchorName }, as src/lab-flats.js geometry() gives for a garment
export function goodsGeom(S, m, view = 'front') { return (SHAPES[S.shape] || panel)(S, m, view === 'back' ? 'back' : 'front'); }
// does the product have a second side to print? (a mug's other side, a pillow's back; a poster has none)
export const goodsSides = S => (S?.sides === 2 ? ['front', 'back'] : ['front']);

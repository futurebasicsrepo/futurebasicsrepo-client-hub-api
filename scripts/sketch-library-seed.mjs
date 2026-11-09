// Seeds the sketch library with the kinds of piece the stock sketch pack is thin on: each entry is drawn front and back by the image model
// on its type's own sketch (POST /v1/lab/library/sketches/generate, two AI generations each) and joins the library as ours. Run against a
// deployed service with a Future Basics staff token:
//
//   BASE=https://… TOKEN=… node scripts/sketch-library-seed.mjs [--only cardigan,beanie] [--dry]
//
// An entry already in the library (by name) is skipped, so the script can be run again after a stop (the daily AI cap answers 429).
const BASE = process.env.BASE, TOKEN = process.env.TOKEN, DRY = process.argv.includes('--dry');
const onlyArg = process.argv.indexOf('--only'), ONLY = onlyArg > 0 ? process.argv[onlyArg + 1].split(',') : [];
export const SEED = [
  // knitwear (drawn on the crewneck, the polo and the vest)
  ['crewneck', 'Cable-knit crewneck', 'Chunky cable-knit sweater, crew neck, ribbed cuffs and hem, a centre cable panel flanked by two smaller cables'],
  ['crewneck', 'Shawl-collar cardigan', 'Heavy rib-knit cardigan with a wide shawl collar, five buttons, two patch pockets, ribbed cuffs and hem'],
  ['crewneck', 'V-neck sweater', 'Fine-gauge merino V-neck sweater, rib-knit V neckband, cuffs and hem, set-in sleeves'],
  ['crewneck', 'Turtleneck sweater', 'Rib-knit turtleneck with a folded roll collar, ribbed cuffs and hem, slim fit'],
  ['crewneck', 'Quarter-zip knit', 'Half-cardigan stitch knit with a quarter zip and a stand collar, raglan sleeves, ribbed cuffs and hem'],
  ['polo', 'Knit polo', 'Fine-gauge knit polo with an open johnny collar, no placket buttons, ribbed cuffs and hem, short sleeves'],
  ['vest', 'Sweater vest', 'V-neck knit sweater vest, ribbed V neckband, armholes and hem, a cable down the front'],
  // tailoring and coats (drawn on the jacket and the coat)
  ['jacket', 'Double-breasted blazer', 'Double-breasted six-button blazer with peak lapels, a chest welt pocket, two flap pockets, extended shoulders, a centre vent'],
  ['jacket', 'Unstructured sport coat', 'Single-breasted two-button sport coat with notch lapels, three patch pockets, soft shoulders, no lining showing'],
  ['jacket', 'Peacoat', 'Double-breasted wool peacoat with wide notch lapels, eight anchor buttons, slanted hand-warmer welt pockets, a back vent'],
  ['coat', 'Double-breasted overcoat', 'Long double-breasted wool overcoat with peak lapels, six buttons, two flap pockets, a centre-back vent, below the knee'],
  ['coat', 'Car coat', 'Single-breasted car coat with a point collar, a concealed button placket, two slash pockets, mid-thigh length'],
  ['coat', 'Raglan balmacaan coat', 'Balmacaan coat with raglan sleeves, a small turn-down collar, a concealed fly front, slash pockets, knee length'],
  // dresses
  ['dress', 'Shirt dress', 'Button-through shirt dress with a point collar, a self tie belt, two chest flap pockets, roll-up sleeves, knee length'],
  ['dress', 'Slip dress', 'Bias-cut slip dress with thin straps, a V neckline, a straight hem at mid calf'],
  ['dress', 'Wrap dress', 'Long-sleeve wrap dress with a V neckline, a waist tie, a flared skirt, knee length'],
  ['dress', 'Sweater dress', 'Rib-knit crewneck sweater dress, long sleeves, ribbed cuffs, straight fit to the knee'],
  ['dress', 'Tiered maxi dress', 'Sleeveless tiered maxi dress with a square neckline, three gathered tiers to the ankle'],
  // headwear (drawn on the cap, the bucket and the beanie)
  ['beanie', 'Cuffed rib beanie', 'Rib-knit beanie with a deep turned-back cuff, crown decreases at the top'],
  ['beanie', 'Fisherman beanie', 'Short shallow rib-knit fisherman beanie with a cuff, sits above the ears'],
  ['cap', 'Five-panel camp cap', 'Five-panel camp cap with a flat brim, a single front panel, a nylon strap with a side-release buckle'],
  ['cap', 'Trucker cap', 'Trucker cap with a structured foam front, mesh back panels, a curved brim and a plastic snapback'],
  ['cap', 'Dad cap', 'Unstructured six-panel dad cap, a curved brim, an adjustable strap with a brass buckle'],
  ['bucket', 'Reversible bucket hat', 'Reversible bucket hat with a sloped brim, topstitched rows round the brim, two eyelets each side'],
  // bottoms and active
  ['leggings', 'Flared leggings', 'High-rise leggings with a wide waistband and a flared leg from the knee'],
  ['leggings', 'Bike shorts', 'High-rise bike shorts with a wide waistband, a side drop-in pocket, mid-thigh length'],
  ['skirt', 'Pleated midi skirt', 'Knife-pleated midi skirt with a narrow waistband and a side zip'],
  ['skirt', 'Denim mini skirt', 'Five-pocket denim mini skirt with a front fly, belt loops and a raw hem'],
  ['pants', 'Pleated wide-leg trousers', 'High-rise wide-leg trousers with two forward pleats each side, slant pockets, a hook-and-bar waistband, cuffed hems'],
  ['shorts', 'Boardshorts', 'Fixed-waist boardshorts with a lace-up fly, a side seam pocket with a velcro flap, above the knee'],
];
const list = SEED.filter(([, label]) => !ONLY.length || ONLY.some(w => label.toLowerCase().includes(w.toLowerCase())));
if (DRY || !BASE || !TOKEN) { console.log(`${list.length} sketches to add${!BASE || !TOKEN ? ' (set BASE and TOKEN to add them)' : ''}:`); for (const [s, l] of list) console.log(`- ${l} (${s})`); process.exit(0); }
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const have = new Set(((await (await fetch(`${BASE}/v1/lab/library/sketches`, { headers: H })).json()).sketches || []).map(s => s.label));
for (const [style, label, words] of list) {
  if (have.has(label)) { console.log(`${label}: already in the library`); continue; }
  const r = await fetch(`${BASE}/v1/lab/library/sketches/generate`, { method: 'POST', headers: H, body: JSON.stringify({ style, label, words }) }), j = await r.json().catch(() => ({}));
  console.log(`${label}: ${r.status} ${j.error || j.id || ''}`);
  if (r.status === 429) { console.log('The daily AI cap is reached: run again tomorrow'); break; }
}

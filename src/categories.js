// Product categories, in one plain script that both the server (src/techpack.js, ai.js, plausible.js) and the page (/categories.js) read.
// A category decides what a first draft starts with (the measurements to take, the materials to list, the labels, the compliance to
// check) and what the sample room checks when the first sample arrives. The families below are the finer kinds the plausibility ranges
// know ("outerwear", "dress"); a group is what the people reading the pack think of: garment, footwear, headwear, plush, jewelry,
// electronics, bag, or just "product".
(function (root) {
  'use strict';
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  // ---- Which family is this product? Order matters: the first family whose words match wins ("dress shoe" is footwear, "plush keychain" is plush). ----
  const FAMILIES = [
    ['footwear', /\b(shoes?|sneakers?|boots?|booties|bootie|sandals?|slippers?|loafers?|oxfords?|derbys?|heels?|pumps?|clogs?|cleats?|footwear|trainers?|mules?|flip[- ]?flops?|moccasins?|espadrilles?|slides?|(?<!table |bed |stair |hall )runners?)\b/],
    ['headwear', /\b(caps?|hats?|beanies?|visors?|headbands?|balaclavas?|berets?|snapbacks?|bucket|trapper|fedoras?|durags?|bonnets?)\b/],
    ['plush', /\b(plush(ie|ies)?|stuffed|teddy bear|dolls?|squish(y|mallow)?|stuffies|stuffy)\b/],
    ['tech', /\b(power ?bank|chargers?|cables?|phone|airpods?|earbuds?|headphones?|laptop|tablet|ipad|mouse ?pad|desk ?mat|speaker|case for|usb|magsafe|stand)\b/],
    ['drink', /\b(bottles?|mugs?|cups?|tumblers?|flasks?|thermos|koozie|can cooler|glass(es)? ware|drinkware|jars?)\b/],
    ['jewelry', /\b(rings?|necklaces?|bracelets?|earrings?|pendants?|chains?|anklets?|brooch|jewell?ery|watch(es)?)\b/],
    ['eyewear', /\b(sunglasses|eyeglasses|glasses|goggles|eyewear)\b/],
    ['bag', /\b(bags?|totes?|backpacks?|duffe?ls?|pouch(es)?|purses?|clutch(es)?|satchels?|fanny ?packs?|crossbody|wallets?|luggage|messenger|rucksack|cases?)\b/],
    ['small', /\b(key ?chains?|key ?rings?|charms?|pins?|patch(es)?|stickers?|magnets?|badges?|lanyards?|ornaments?|coasters?|bookmarks?|decals?)\b/],
    ['box', /\b(box(es)?|cartons?|mailers?|packaging|tins?|sleeve box|hang ?tags?)\b/],
    ['hosiery', /\b(socks?|gloves?|mittens?|tights|stockings|leg ?warmers?|arm ?warmers?)\b/],
    ['belt', /\b(belts?|leash|pet collar|dog collar|harness|suspenders)\b/],
    ['flat', /\b(scarf|scarves|blankets?|towels?|throws?|bandanas?|shawls?|scrunchies?|rugs?|pillows?|cushions?|curtains?|banners?|flags?|tapestry|napkins?|aprons?)\b/],
    ['outerwear', /\b(jackets?|coats?|parkas?|puffers?|vests?|windbreakers?|blazers?|anoraks?|ponchos?|truckers?|bombers?|raincoats?|shackets?|overshirts?)\b/],
    ['dress', /\b(dress(es)?|gowns?|jumpsuits?|rompers?|overalls?|onesies?|bodysuits?|kaftans?|robes?)\b/],
    ['bottom', /\b(jeans?|pants?|trousers?|shorts|skirts?|leggings?|joggers?|chinos?|sweatpants?|culottes?|skorts?|cargos?|denim)\b/],
    ['top', /\b(shirts?|tees?|t-?shirts?|tops?|hoodies?|sweatshirts?|sweaters?|cardigans?|polos?|tanks?|blouses?|pullovers?|knits?|crewnecks?|jerseys?|henleys?|tunics?|camis?|bralettes?)\b/]
  ];
  const matchFamily = raw => {
    const text = norm(raw).replace(/\bcap sleeves?\b/g, ' ').replace(/\bshort sleeves?\b/g, ' ').replace(/\boxford (shirts?)\b/g, '$1').replace(/\boxford (cloth|weave|button[- ]?down)\b/g, ' ').replace(/\bbutton[- ]?down\b/g, ' ');
    for (const [name, re] of FAMILIES) if (re.test(text)) return name;
    return null;
  };
  // The category the assistant wrote ("Footwear — chunky-sole oxford") is richer than the title, so it is tried first.
  const familyOf = (category = '', title = '') => matchFamily(category) || matchFamily(title) || 'generic';

  const GROUP_OF = { top: 'garment', bottom: 'garment', outerwear: 'garment', dress: 'garment', hosiery: 'garment', footwear: 'footwear', headwear: 'headwear', plush: 'plush', jewelry: 'jewelry', tech: 'electronics', bag: 'bag' };
  const LABEL = { garment: 'Garment', footwear: 'Footwear', headwear: 'Headwear', plush: 'Plush', jewelry: 'Jewelry', electronics: 'Electronics', bag: 'Bag', other: 'Product' };
  // The group a product belongs to. Electronics also come from the electronics words in elec.js (a "smart" bottle is not a bottle).
  function groupOf(category = '', title = '') {
    const text = `${category} ${title}`;
    const E = root.FBElec;
    if (E && E.isElectronics(text) && familyOf(category, title) !== 'footwear' && familyOf(category, title) !== 'plush') return 'electronics';
    return GROUP_OF[familyOf(category, title)] || 'other';
  }

  // ---- Points of measure for the kinds that had no template: [code, name, how to measure, tolerance] in inches ----
  const PLUSH_POM = [
    ['A', 'Overall height', 'Seated on a flat surface, floor to top of head, uncompressed', '±0.5'],
    ['B', 'Head width', 'Widest point of the head, side to side', '±0.25'],
    ['C', 'Head height', 'Chin seam to top of head', '±0.25'],
    ['D', 'Body girth', 'Around the torso at its fullest point, tape lightly held', '±0.5'],
    ['E', 'Body depth', 'Front to back at the fullest point, uncompressed', '±0.5'],
    ['F', 'Arm length', 'Shoulder joint seam to the tip of the paw', '±0.25'],
    ['G', 'Leg length', 'Hip joint seam to the bottom of the foot', '±0.25'],
    ['H', 'Ear length', 'Base seam to the tip, laid flat', '±0.25'],
    ['I', 'Eye spacing', 'Centre of one eye to the centre of the other', '±0.125'],
    ['J', 'Nose width', 'Widest point of the nose', '±0.125'],
    ['K', 'Tail length', 'Base seam to the tip', '±0.25'],
    ['L', 'Seam allowance', 'Cut edge of the fabric to the stitch line', '±0.0625']
  ];
  const JEWELRY_POM = [
    ['A', 'Inner diameter', 'Inside of the ring or bangle, edge to edge across the centre', '±0.02'],
    ['B', 'Band width', 'Across the band at its widest point', '±0.01'],
    ['C', 'Band thickness', 'Through the band at the thinnest point', '±0.01'],
    ['D', 'Pendant height', 'Top of the bail to the bottom of the pendant', '±0.04'],
    ['E', 'Pendant width', 'Widest point, side to side', '±0.04'],
    ['F', 'Chain length', 'End to end with the clasp closed, laid straight', '±0.25'],
    ['G', 'Drop length', 'Top of the ear post or hook to the bottom of the piece', '±0.04'],
    ['H', 'Stone diameter', 'Across the stone or enamel field at its widest', '±0.01'],
    ['I', 'Clasp length', 'End to end, clasp closed', '±0.04']
  ];

  // ---- What a first draft of each kind starts with (the rows are prompts to confirm, marked as such in the pack) ----
  const SEED = {
    plush: {
      sizes: ['One size'],
      bom: [
        { component: 'Outer fabric', material: 'Polyester plush', spec: 'Pile height and weight TBD (e.g. 8 mm minky, 280 gsm)', placement: 'Body, head, limbs', qty: '', unit: 'm', notes: '' },
        { component: 'Contrast fabric', material: 'Short-pile polyester', spec: 'Belly, ears, paw pads', placement: 'As per callouts', qty: '', unit: 'm', notes: '' },
        { component: 'Filling', material: 'Polyester fibre fill', spec: 'Filled weight in grams TBD, clean and needle-checked', placement: 'Inside', qty: '', unit: 'g', notes: '' },
        { component: 'Eyes', material: 'Safety eyes, locking washers', spec: 'Diameter in mm TBD; embroidered instead for under-3s', placement: 'Face', qty: '2', unit: 'pcs', notes: '' },
        { component: 'Nose', material: 'Safety nose, locking washer or embroidery', spec: 'Shape and size TBD', placement: 'Face', qty: '1', unit: 'pc', notes: '' },
        { component: 'Thread', material: 'Polyester, colour matched', spec: 'Tex and colour per fabric', placement: 'Seams, closing stitch', qty: '', unit: 'm', notes: '' },
        { component: 'Embroidery thread', material: 'Polyester or rayon', spec: 'Pantone-matched', placement: 'Face details', qty: '', unit: 'm', notes: '' },
        { component: 'Sewn-in label', material: 'Printed satin', spec: 'Fibre content, country of origin, age grading, batch code, care', placement: 'Side seam', qty: '1', unit: 'pc', notes: '' },
        { component: 'Hang tag', material: 'Card with string loop', spec: 'Client artwork', placement: 'Ear or wrist', qty: '1', unit: 'pc', notes: '' }
      ],
      construction: [
        { area: 'Seams', detail: 'Pieces joined at 1/4" (6 mm) seam allowance, 10-12 stitches per inch, backstitched at both ends; seams double-stitched at stress points (limbs, ears, tail)' },
        { area: 'Eyes and nose', detail: 'Attached with locking washers before stuffing; each must hold a pull of 90 N (about 20 lb) for ten seconds without loosening' },
        { area: 'Filling', detail: 'Filled evenly to the specified weight, firm but not hard; no lumps; limbs and head filled first, then the body' },
        { area: 'Closing', detail: 'Closed with ladder stitch, 12 stitches per inch, thread buried; no raw fabric or fibre visible' },
        { area: 'Safety', detail: 'Every unit passes a needle detector before packing; no loose threads longer than 1/4"; no hard parts reachable inside the body' }
      ],
      labels: [
        { item: 'Sewn-in label', spec: 'Printed satin: fibre content and filling, country of origin, importer or brand address, batch or date code, age grading, surface-wash care. Confirm the wording the markets require.', placement: 'Side seam, inside, below the arm' },
        { item: 'Hang tag', spec: 'Card, client artwork, barcode, warnings as required', placement: 'Left ear loop' }
      ],
      packaging: { fold: 'Seated or standing, uncompressed', polybag: 'Individual polybag with a printed suffocation warning where required', carton: 'Master carton, TBD', unitsPerCarton: '', notes: 'Pack so the face and pile are not crushed; vacuum compression only if the client approves it.' },
      care: { instructions: 'Surface wash only with a damp cloth and mild soap. Do not machine wash, bleach or tumble dry. Air dry away from heat.', compliance: 'Toy safety: ASTM F963 and CPSIA (US); EN 71-1, -2 and -3 and UKCA (EU, UK). Small parts, flammability, seam strength, eye and nose pull test, filling cleanliness. Confirm the age grading and the lab.' }
    },
    jewelry: {
      sizes: ['One size'],
      bom: [
        { component: 'Base metal', material: '925 sterling silver / brass / stainless steel 316L', spec: 'Alloy and finish TBD; nickel-free and lead-free', placement: 'Body', qty: '1', unit: 'pc', notes: '' },
        { component: 'Plating', material: '14k gold / rhodium / none', spec: 'Thickness in microns TBD (e.g. 2 µm), over a barrier layer', placement: 'All visible surfaces', qty: '', unit: '', notes: '' },
        { component: 'Stone or enamel', material: 'Cubic zirconia / glass / hard enamel', spec: 'Size, cut and colour TBD', placement: 'As per callouts', qty: '', unit: 'pcs', notes: '' },
        { component: 'Chain', material: 'Cable, box or curb', spec: 'Link size and wire gauge TBD', placement: 'Neck or wrist', qty: '1', unit: 'pc', notes: '' },
        { component: 'Clasp and findings', material: 'Lobster clasp, jump rings, ear posts and backs', spec: 'Same alloy and plating as the body; nickel-free', placement: 'Closure', qty: '', unit: 'set', notes: '' },
        { component: 'Pouch or box', material: 'Microfibre pouch or rigid box', spec: 'Client artwork, anti-tarnish strip', placement: 'Packaging', qty: '1', unit: 'pc', notes: '' },
        { component: 'Hang tag', material: 'Card', spec: 'Material, care, barcode', placement: 'Attached by thread or loop', qty: '1', unit: 'pc', notes: '' }
      ],
      construction: [
        { area: 'Forming', detail: 'Cast, stamped or machined to the drawing; flash and sprue removed; no pitting, sharp edges or burrs on any surface that touches skin' },
        { area: 'Finishing', detail: 'Polished to a mirror or brushed finish as per the callouts; consistent across every unit and across pairs' },
        { area: 'Plating', detail: 'Plated to the specified thickness over a barrier layer; adhesion tested by tape; colour matched to the approved sample' },
        { area: 'Stone setting', detail: 'Stones set flush and secure: none loose when tapped or pulled; prongs closed, no snag on fabric' },
        { area: 'Joins', detail: 'Soldered or laser-welded joints clean and strong; jump rings closed with no gap; clasp opens and closes 5,000 times without failing' }
      ],
      labels: [
        { item: 'Stamp or hallmark', spec: 'Metal fineness (e.g. 925) and maker mark, as required by the sale market; confirm placement and depth', placement: 'Inside the band or on the clasp tag' },
        { item: 'Hang tag or pouch label', spec: 'Material, plating, nickel-free statement, care, barcode', placement: 'Pouch or card' }
      ],
      packaging: { fold: 'Individually in a pouch or box, held so it cannot tangle or scratch', polybag: 'Anti-tarnish strip inside a sealed bag', carton: 'Inner trays in a master carton, TBD', unitsPerCarton: '', notes: 'Chains are coiled loosely or hung; no pieces touching in the carton.' },
      care: { instructions: 'Keep dry. Remove before swimming, bathing or exercise. Store in the pouch. Wipe with a soft dry cloth; do not use chemical cleaners.', compliance: 'Nickel release and heavy metals: EU REACH Annex XVII (nickel, lead, cadmium); California Prop 65; for jewelry sold for children, CPSIA lead and cadmium limits. Precious-metal fineness per the market (hallmarking). Confirm the lab and the markets.' }
    },
    headwear: {
      construction: [
        { area: 'Crown', detail: 'Panels joined with flat-felled seams, 10 stitches per inch; top button covered; eyelets reinforced' },
        { area: 'Visor or brim', detail: 'Stiffener specified; stitch rows evenly spaced, 7 rows for a standard cap visor; curve matches the approved block' },
        { area: 'Sweatband', detail: 'Cotton or moisture-wicking band, sewn without twisting; tape covers the inside seam' },
        { area: 'Closure', detail: 'Adjuster type and range TBD; tested through 5,000 open-close cycles' }
      ]
    }
  };

  // ---- What the sample room checks, by stage. Pack facts (sample size, tolerances, colours, trims) are filled in when the page is drawn. ----
  const STAGES = ['First sample', 'Fit and pre-production sample', 'Before it ships'];
  const SAMPLE_CHECKS = {
    garment: {
      first: ['Fabric weight, hand and colour against the approved swatch or lab dip', 'Stitch type and stitches per inch on every seam named in the pack', 'Every label is present, in the right place, and reads correctly'],
      fit: ['Try it on the fit model or form and note any pulling, twisting or gaping', 'Check shrinkage and colour fastness after the first wash, in the care method written on the label', 'Compare the whole size run to the grade rules, not only the sample size'],
      final: ['Count the units by size and colour against the order', 'Check hangers, polybag, carton marks and folding', 'Pull a sample at random and re-measure it; any POM outside tolerance holds the batch']
    },
    footwear: {
      first: ['The last, size and width are the ones in the pack: try the sample on a foot form', 'Upper material, colour and every overlay match the callouts', 'Sole unit: the bond is clean, no glue lines or gaps, no wrinkles in the upper'],
      fit: ['Flex test: the sole flexes where the pack says, and the upper does not crack or crease badly', 'Wear test: walk 20 minutes, note any heel slip, pressure point or rub', 'Left and right are a true pair: height, toe spring and stitch lines mirror each other'],
      final: ['Count pairs by size and colour; check tissue, box and size marks', 'Pull test on the laces, eyelets and the sole edge', 'No odour, no loose threads, no glue marks; insoles are in place and lie flat']
    },
    headwear: {
      first: ['Crown height, visor length and curve against the approved block', 'Embroidery or patch: placement, stitch density and colour, with no puckering', 'Sweatband and inside tape are clean, flat and not twisted'],
      fit: ['Try it on at the sample size: it sits level and the adjuster reaches the range in the pack', 'Closure opens and closes smoothly; there is no pinch or rattle', 'Shape holds after being pressed flat for a day'],
      final: ['Count units by colour; check the stack shape in the carton', 'No loose threads, glue marks or stiffener showing through', 'Hang tag or sticker is on and reads correctly']
    },
    plush: {
      first: ['Pile, colour and face against the approved sample: the expression matches the callouts', 'Pull test on the eyes, nose and any hard parts: each holds 90 N for ten seconds', 'Stuffing is even and firm; the filled weight is within 5% of the pack'],
      fit: ['Overall height and head size within tolerance when seated, uncompressed', 'Seams: no gaps or fibre showing; pull each seam firmly and check it holds', 'Sewn-in label: wording, age grading and placement are right'],
      final: ['Every unit has passed the needle detector; keep the record with the batch', 'Smell and cleanliness: no odour, no stains, no loose fibre', 'Polybag warning, hang tag and carton marks are right; count by style and colour']
    },
    jewelry: {
      first: ['Dimensions with calipers against the drawing: ring size, width, thickness, drop', 'Plating colour and finish against the approved sample under daylight', 'Stones: none loose when tapped or pulled; settings smooth with no snag'],
      fit: ['Wear test: no skin discolouration, no sharp edges, and the clasp is easy to use with one hand', 'Weight of the piece within tolerance of the approved sample', 'Pairs (earrings) match in size, weight and finish'],
      final: ['Plating adhesion by tape test on a sample; nickel-release result on file', 'Hallmark or stamp is clear and in the right place', 'Each piece is in its pouch or box with the tag; count by style and size']
    },
    electronics: {
      first: ['It powers on and every function in the specification works', 'Battery: charges to full, holds charge, no heat, no swelling; the capacity matches the pack', 'Enclosure fit, finish and colour against the approved sample; no gaps, no sink marks'],
      fit: ['Run the tests in the Electronics section for this build stage, and write down every result', 'Drop and water tests to the rating in the specification, where the stage requires them', 'Radio range and pairing within the specification, on a clean bench'],
      final: ['Certification marks and ratings are printed correctly on the product and the packaging', 'Every unit passes the end-of-line functional test; keep the log with the batch', 'Count units; check cables, manuals and inserts; lithium cells ship with their transport paperwork']
    },
    bag: {
      first: ['Fabric, hardware and colour against the approved samples', 'Stitching at stress points (handles, strap anchors, base corners) is reinforced as specified', 'Zips run smoothly the full length; pulls and teeth are the right finish'],
      fit: ['Load test with the weight in the pack: handles, straps and seams hold', 'Dimensions within tolerance, empty and filled', 'Lining, pockets and organisation are as drawn'],
      final: ['Hardware tested: zips 5,000 cycles, buckles and rings do not slip', 'No loose threads, glue or marks; stuffing paper is removed', 'Count by colour; check the dust bag, tags and carton marks']
    },
    other: {
      first: ['Materials, colours and finish against the approved samples', 'Every callout in the pack: confirm it is present and as drawn', 'Every label and mark is present and reads correctly'],
      fit: ['Dimensions within tolerance on every point of measure', 'Function: it does what it is for, with no part loose, sharp or failing', 'Compare to the approved sample side by side in daylight'],
      final: ['Count by style and colour; check packaging and carton marks', 'Re-measure a random sample; anything outside tolerance holds the batch', 'No loose threads, glue marks, odour or damage']
    }
  };

  // Checks every product gets, each tied to the part of the pack it is read from (the page fills in the numbers).
  const GENERIC = {
    first: [{ check: 'Measure the sample at every point of measure', from: 'measure' }, { check: 'Colours match the Pantone references', from: 'colour' }, { check: 'Every material and trim is the one listed', from: 'materials' }, { check: 'Every numbered callout is present and as drawn', from: 'callouts' }],
    fit: [{ check: 'Measure again after the first wash or handling, and after any change', from: 'measure' }, { check: 'Every size in the run is graded as the pack says', from: 'sizes' }],
    final: [{ check: 'Every label is present, in place and correct', from: 'labels' }, { check: 'Artwork is where the pack puts it, at the stated size', from: 'artwork' }]
  };
  // Every sentence the sample-room page can print, so the factory-language pass translates them with the rest of the pack.
  const allChecks = group => {
    const out = [];
    for (const k of ['first', 'fit', 'final']) { GENERIC[k].forEach(g => out.push(g.check)); (SAMPLE_CHECKS[group] || SAMPLE_CHECKS.other)[k].forEach(c => out.push(c)); }
    return out;
  };

  const api = { GENERIC, allChecks, FAMILIES, matchFamily, familyOf, groupOf, GROUP_OF, LABEL, PLUSH_POM, JEWELRY_POM, SEED, STAGES, SAMPLE_CHECKS, labelOf: (category, title) => LABEL[groupOf(category, title)] };
  root.FBCat = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

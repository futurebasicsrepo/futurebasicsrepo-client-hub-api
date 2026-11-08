// DRAFT for review: the Design Lab's library of footwear flats, broken out by type, as the bag library is (scripts/bag-templates/build.mjs).
// Each entry becomes one original technical flat (side, top and back views, drawn once by the image model in a neutral prototype colourway and
// traced into panels by src/lab-shoe-draw.js), and starts a concept whose pattern is drafted by src/lab-footwear.js.
//
// Fields
//   id            footwear-<type>-<name>; the drawing files are <id>-side.png, <id>-top.png, <id>-back.png
//   type          the group it is listed under in the Sketch library (TYPES below)
//   label         what a designer calls it; generic, never a brand's model name
//   construction  how the sole is made and joined to the upper (CONSTRUCTIONS below); it decides the pattern's inside pieces
//   closure       lace | slip-on | elastic | strap | buckle | hook-and-loop | zip | toggle | none
//   height        low | mid | high (over the ankle) | calf | knee
//   pattern       the src/lab-footwear.js style that drafts it today, or 'new:<name>' for a style the pattern does not draft yet
//   priority      1 = build first (growing or largest), 2 = build next, 3 = round out the range; from the market review (MARKET below)
//
// The market review behind the priorities (US 2025, Circana via trade press; global figures vary widely by source):
//   - The US footwear market held at about $90 billion in 2025 in dollars, with units down in the low single digits.
//   - Performance led growth (+6%); running was up 9% in dollars and is the strongest single category.
//   - Sport lifestyle, the largest category, was up 4%, driven by running-inspired and soccer-inspired (terrace) styles.
//   - Fashion footwear was down 2%, with bright spots: high-shaft boots +14%, mules and clogs +5%, ballerinas and boat shoes.
//   - Slides and flip-flops grew while larger multi-strap sandals weakened.
//   - Safety and work footwear is forecast at about 6–9% a year (estimates $8–13 billion in 2025, by scope).
//   - Trend press for 2025: ballet flats, Mary Janes (flat and low heel), ballet-sneaker hybrids, chunkier loafers.
export const MARKET = [
  { type: 'running', trend: 'up', note: 'Running +9% in US dollar sales in 2025, the strongest category' },
  { type: 'lifestyle', trend: 'up', note: 'Sport lifestyle, the largest category, +4%: running-inspired and terrace styles lead' },
  { type: 'boots', trend: 'up', note: 'High-shaft boots +14% in 2025' },
  { type: 'clogs', trend: 'up', note: 'Mules and clogs +5% in 2025' },
  { type: 'work', trend: 'up', note: 'Safety footwear forecast at about 6–9% a year' },
  { type: 'outdoor', trend: 'up', note: 'Hiking and outdoor gained; forecast among the faster athletic segments' },
  { type: 'flats', trend: 'up', note: 'Ballerinas a 2025 bright spot; Mary Janes and ballet-sneaker hybrids in the trend press' },
  { type: 'sandals', trend: 'mixed', note: 'Slides and flip-flops up; larger multi-strap sandals down' },
  { type: 'court', trend: 'steady', note: 'Performance sport: tennis, basketball, pickleball, soccer' },
  { type: 'dress', trend: 'mixed', note: 'Fashion down 2% overall; boat shoes and clean loafers holding' },
  { type: 'heels', trend: 'down', note: 'Fashion softness; flats and low heels taking share in the trend press' },
  { type: 'home', trend: 'steady', note: 'Slippers: no reliable 2025 figure found' },
  { type: 'kids', trend: 'steady', note: 'No reliable 2025 figure found; a steady replacement market' }
];

export const TYPES = {
  lifestyle: 'Sneakers (lifestyle)', running: 'Running', court: 'Court and field sport', outdoor: 'Outdoor and hiking', boots: 'Boots',
  work: 'Work and safety', dress: 'Dress and loafers', clogs: 'Clogs and mules', sandals: 'Sandals and slides', flats: 'Flats and Mary Janes',
  heels: 'Heels', home: 'Slippers', kids: 'Kids'
};

// how each is built: what the pattern needs inside, and what the factory needs to make it
export const CONSTRUCTIONS = {
  cupsole: 'Cupsole: a moulded rubber cup, cemented and stitched round the upper (board-lasted)',
  vulcanized: 'Vulcanized: a rubber foxing tape and sole baked onto a canvas upper (slip-lasted)',
  strobel: 'Strobel: the upper sewn closed under the foot to a strobel sock, then a foam midsole and rubber outsole cemented on',
  plated: 'Strobel with a carbon or nylon plate in a high foam midsole (a racing shoe)',
  goodyear: 'Goodyear welt: the upper, insole rib and welt stitched; the outsole stitched to the welt (resoleable)',
  blake: 'Blake: the upper and outsole stitched through from inside (sleeker than a welt)',
  cemented: 'Cemented: the upper board-lasted and the sole glued on (most fashion shoes)',
  moccasin: 'Moccasin: a single piece wrapping under the foot, an apron stitched on top',
  injection: 'Injection moulded: a one-piece EVA or rubber shoe, no upper to cut (only straps or a liner)',
  footbed: 'Footbed: straps fixed into a moulded or cork footbed, then an outsole',
  dipped: 'Moulded rubber shaft and foot (a rain boot), a textile lining laid in the mould'
};

export const LIBRARY = [
  // ---- Sneakers (lifestyle): the largest category; running- and soccer-inspired styles lead its growth ----
  { id: 'footwear-lifestyle-court-low', type: 'lifestyle', label: 'Court sneaker, low', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 1 },
  { id: 'footwear-lifestyle-court-mid', type: 'lifestyle', label: 'Court sneaker, mid', construction: 'cupsole', closure: 'lace', height: 'mid', pattern: 'hightop', priority: 2 },
  { id: 'footwear-lifestyle-basketball-high', type: 'lifestyle', label: 'Retro basketball high-top', construction: 'cupsole', closure: 'lace', height: 'high', pattern: 'hightop', priority: 1 },
  { id: 'footwear-lifestyle-terrace', type: 'lifestyle', label: 'Terrace sneaker (T-toe, gum sole)', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 1 },
  { id: 'footwear-lifestyle-retro-runner', type: 'lifestyle', label: 'Retro runner (suede and mesh)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 1 },
  { id: 'footwear-lifestyle-chunky-runner', type: 'lifestyle', label: 'Chunky runner (layered overlays)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 2 },
  { id: 'footwear-lifestyle-canvas-low', type: 'lifestyle', label: 'Canvas low (vulcanized)', construction: 'vulcanized', closure: 'lace', height: 'low', pattern: 'new:vulc', priority: 1 },
  { id: 'footwear-lifestyle-canvas-high', type: 'lifestyle', label: 'Canvas high-top (vulcanized)', construction: 'vulcanized', closure: 'lace', height: 'high', pattern: 'new:vulc', priority: 2 },
  { id: 'footwear-lifestyle-canvas-slipon', type: 'lifestyle', label: 'Canvas slip-on (elastic side gores)', construction: 'vulcanized', closure: 'elastic', height: 'low', pattern: 'new:vulc', priority: 2 },
  { id: 'footwear-lifestyle-skate', type: 'lifestyle', label: 'Padded skate shoe', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 2 },
  { id: 'footwear-lifestyle-platform-court', type: 'lifestyle', label: 'Platform court sneaker', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 3 },
  { id: 'footwear-lifestyle-ballet-sneaker', type: 'lifestyle', label: 'Ballet sneaker (strap over the instep)', construction: 'cupsole', closure: 'strap', height: 'low', pattern: 'new:ballet-sneaker', priority: 1 },
  { id: 'footwear-lifestyle-trail-inspired', type: 'lifestyle', label: 'Trail-inspired sneaker (toggle laces)', construction: 'strobel', closure: 'toggle', height: 'low', pattern: 'runner', priority: 2 },
  { id: 'footwear-lifestyle-sneaker-boot', type: 'lifestyle', label: 'Sneaker boot (padded, lug cupsole)', construction: 'cupsole', closure: 'lace', height: 'high', pattern: 'hightop', priority: 3 },

  // ---- Running: the strongest category in 2025 (+9%) ----
  { id: 'footwear-running-daily', type: 'running', label: 'Daily trainer', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 1 },
  { id: 'footwear-running-max-cushion', type: 'running', label: 'Max-cushion trainer (rocker sole)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 1 },
  { id: 'footwear-running-racer', type: 'running', label: 'Plated racer', construction: 'plated', closure: 'lace', height: 'low', pattern: 'runner', priority: 1 },
  { id: 'footwear-running-stability', type: 'running', label: 'Stability trainer (medial post)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 2 },
  { id: 'footwear-running-trail', type: 'running', label: 'Trail runner (lugged, rock plate)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 1 },
  { id: 'footwear-running-knit', type: 'running', label: 'Knit-upper trainer (sock collar)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'new:knit', priority: 2 },
  { id: 'footwear-running-walking', type: 'running', label: 'Walking shoe (wide toe box)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 3 },
  { id: 'footwear-running-spike', type: 'running', label: 'Track spike', construction: 'plated', closure: 'lace', height: 'low', pattern: 'new:spike', priority: 3 },

  // ---- Court and field sport ----
  { id: 'footwear-court-basketball', type: 'court', label: 'Basketball shoe (performance, mid)', construction: 'strobel', closure: 'lace', height: 'mid', pattern: 'hightop', priority: 2 },
  { id: 'footwear-court-tennis', type: 'court', label: 'Tennis shoe (herringbone outsole)', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 2 },
  { id: 'footwear-court-pickleball', type: 'court', label: 'Pickleball and padel shoe', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 2 },
  { id: 'footwear-court-soccer-fg', type: 'court', label: 'Soccer boot (firm ground studs)', construction: 'cemented', closure: 'lace', height: 'low', pattern: 'new:cleat', priority: 2 },
  { id: 'footwear-court-futsal', type: 'court', label: 'Indoor and futsal shoe (gum sole)', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 2 },
  { id: 'footwear-court-trainer', type: 'court', label: 'Gym trainer (flat, stable)', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 3 },
  { id: 'footwear-court-golf', type: 'court', label: 'Spikeless golf shoe', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'sneaker', priority: 3 },

  // ---- Outdoor and hiking ----
  { id: 'footwear-outdoor-hiker-mid', type: 'outdoor', label: 'Hiking boot, mid (waterproof)', construction: 'strobel', closure: 'lace', height: 'mid', pattern: 'hiker', priority: 1 },
  { id: 'footwear-outdoor-hiker-low', type: 'outdoor', label: 'Light hiker, low', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'runner', priority: 2 },
  { id: 'footwear-outdoor-approach', type: 'outdoor', label: 'Approach shoe (rubber rand, lace to toe)', construction: 'cemented', closure: 'lace', height: 'low', pattern: 'new:approach', priority: 3 },
  { id: 'footwear-outdoor-backpacking', type: 'outdoor', label: 'Leather backpacking boot', construction: 'goodyear', closure: 'lace', height: 'high', pattern: 'boot', priority: 3 },
  { id: 'footwear-outdoor-snow', type: 'outdoor', label: 'Snow boot (insulated, rubber shell)', construction: 'cemented', closure: 'lace', height: 'calf', pattern: 'new:snow', priority: 2 },
  { id: 'footwear-outdoor-rain', type: 'outdoor', label: 'Rain boot (moulded rubber)', construction: 'dipped', closure: 'none', height: 'calf', pattern: 'new:moulded', priority: 2 },
  { id: 'footwear-outdoor-sport-sandal', type: 'outdoor', label: 'Sport sandal (webbing straps)', construction: 'footbed', closure: 'hook-and-loop', height: 'low', pattern: 'new:sandal', priority: 2 },
  { id: 'footwear-outdoor-water', type: 'outdoor', label: 'Water shoe (drainage, bungee lace)', construction: 'strobel', closure: 'toggle', height: 'low', pattern: 'runner', priority: 3 },

  // ---- Boots: high-shaft boots +14% in 2025 ----
  { id: 'footwear-boots-chelsea', type: 'boots', label: 'Chelsea boot', construction: 'goodyear', closure: 'elastic', height: 'high', pattern: 'chelsea', priority: 1 },
  { id: 'footwear-boots-lace-up', type: 'boots', label: 'Lace-up boot, 6 in', construction: 'goodyear', closure: 'lace', height: 'high', pattern: 'boot', priority: 1 },
  { id: 'footwear-boots-combat', type: 'boots', label: 'Combat boot, 8-eye (lug sole)', construction: 'goodyear', closure: 'lace', height: 'high', pattern: 'boot', priority: 1 },
  { id: 'footwear-boots-moc-toe', type: 'boots', label: 'Moc-toe boot (wedge sole)', construction: 'goodyear', closure: 'lace', height: 'high', pattern: 'new:moc-toe', priority: 2 },
  { id: 'footwear-boots-chukka', type: 'boots', label: 'Chukka and desert boot', construction: 'cemented', closure: 'lace', height: 'mid', pattern: 'new:chukka', priority: 2 },
  { id: 'footwear-boots-engineer', type: 'boots', label: 'Engineer boot (strap and buckle)', construction: 'goodyear', closure: 'buckle', height: 'calf', pattern: 'new:pull-on', priority: 3 },
  { id: 'footwear-boots-western', type: 'boots', label: 'Western boot (pull-on, stacked heel)', construction: 'goodyear', closure: 'none', height: 'calf', pattern: 'new:western', priority: 2 },
  { id: 'footwear-boots-knee-high', type: 'boots', label: 'Knee-high boot (inside zip)', construction: 'cemented', closure: 'zip', height: 'knee', pattern: 'new:tall', priority: 1 },
  { id: 'footwear-boots-shearling', type: 'boots', label: 'Shearling-lined pull-on boot', construction: 'cemented', closure: 'none', height: 'calf', pattern: 'new:pull-on', priority: 2 },
  { id: 'footwear-boots-lug-chelsea', type: 'boots', label: 'Lug-sole Chelsea (chunky)', construction: 'cemented', closure: 'elastic', height: 'high', pattern: 'chelsea', priority: 2 },

  // ---- Work and safety: forecast about 6–9% a year ----
  { id: 'footwear-work-safety-boot', type: 'work', label: 'Safety-toe work boot, 6 in', construction: 'goodyear', closure: 'lace', height: 'high', pattern: 'new:safety', priority: 1 },
  { id: 'footwear-work-wellington', type: 'work', label: 'Pull-on work boot (Wellington)', construction: 'goodyear', closure: 'none', height: 'calf', pattern: 'new:western', priority: 2 },
  { id: 'footwear-work-athletic', type: 'work', label: 'Composite-toe athletic work shoe', construction: 'strobel', closure: 'lace', height: 'low', pattern: 'new:safety', priority: 2 },
  { id: 'footwear-work-slip-resistant', type: 'work', label: 'Slip-resistant service shoe', construction: 'cemented', closure: 'lace', height: 'low', pattern: 'derby', priority: 2 },
  { id: 'footwear-work-logger', type: 'work', label: 'Logger boot, 8 in (raised heel)', construction: 'goodyear', closure: 'lace', height: 'calf', pattern: 'new:safety', priority: 3 },

  // ---- Dress and loafers ----
  { id: 'footwear-dress-derby', type: 'dress', label: 'Plain derby', construction: 'goodyear', closure: 'lace', height: 'low', pattern: 'derby', priority: 2 },
  { id: 'footwear-dress-oxford', type: 'dress', label: 'Cap-toe oxford', construction: 'goodyear', closure: 'lace', height: 'low', pattern: 'new:oxford', priority: 2 },
  { id: 'footwear-dress-brogue', type: 'dress', label: 'Wingtip brogue', construction: 'goodyear', closure: 'lace', height: 'low', pattern: 'new:oxford', priority: 3 },
  { id: 'footwear-dress-monk', type: 'dress', label: 'Double monk strap', construction: 'goodyear', closure: 'buckle', height: 'low', pattern: 'new:monk', priority: 3 },
  { id: 'footwear-dress-penny-loafer', type: 'dress', label: 'Penny loafer', construction: 'goodyear', closure: 'slip-on', height: 'low', pattern: 'loafer', priority: 1 },
  { id: 'footwear-dress-bit-loafer', type: 'dress', label: 'Bit loafer (metal bar)', construction: 'blake', closure: 'slip-on', height: 'low', pattern: 'loafer', priority: 2 },
  { id: 'footwear-dress-tassel-loafer', type: 'dress', label: 'Tassel loafer', construction: 'blake', closure: 'slip-on', height: 'low', pattern: 'loafer', priority: 3 },
  { id: 'footwear-dress-lug-loafer', type: 'dress', label: 'Lug-sole loafer (chunky)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'loafer', priority: 1 },
  { id: 'footwear-dress-boat', type: 'dress', label: 'Boat shoe (siped sole, rawhide lace)', construction: 'moccasin', closure: 'lace', height: 'low', pattern: 'new:moccasin', priority: 1 },
  { id: 'footwear-dress-driving', type: 'dress', label: 'Driving moccasin (pebble sole)', construction: 'moccasin', closure: 'slip-on', height: 'low', pattern: 'new:moccasin', priority: 3 },

  // ---- Clogs and mules: +5% in 2025 ----
  { id: 'footwear-clogs-moulded', type: 'clogs', label: 'Moulded foam clog (vents, heel strap)', construction: 'injection', closure: 'strap', height: 'low', pattern: 'new:moulded', priority: 1 },
  { id: 'footwear-clogs-suede-mule', type: 'clogs', label: 'Suede footbed clog (backless)', construction: 'footbed', closure: 'buckle', height: 'low', pattern: 'new:footbed-clog', priority: 1 },
  { id: 'footwear-clogs-wood', type: 'clogs', label: 'Leather clog on a wooden base', construction: 'footbed', closure: 'none', height: 'low', pattern: 'new:footbed-clog', priority: 2 },
  { id: 'footwear-clogs-loafer-mule', type: 'clogs', label: 'Loafer mule (backless)', construction: 'blake', closure: 'slip-on', height: 'low', pattern: 'new:mule', priority: 2 },
  { id: 'footwear-clogs-sneaker-mule', type: 'clogs', label: 'Sneaker mule (backless court)', construction: 'cupsole', closure: 'lace', height: 'low', pattern: 'new:mule', priority: 3 },
  { id: 'footwear-clogs-heeled-mule', type: 'clogs', label: 'Heeled mule (block heel)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:mule', priority: 2 },

  // ---- Sandals and slides: slides and flip-flops up, multi-strap sandals down ----
  { id: 'footwear-sandals-pool-slide', type: 'sandals', label: 'Pool slide (moulded)', construction: 'injection', closure: 'none', height: 'low', pattern: 'new:moulded', priority: 1 },
  { id: 'footwear-sandals-recovery-slide', type: 'sandals', label: 'Recovery slide (thick foam)', construction: 'injection', closure: 'none', height: 'low', pattern: 'new:moulded', priority: 1 },
  { id: 'footwear-sandals-two-strap', type: 'sandals', label: 'Two-strap footbed sandal', construction: 'footbed', closure: 'buckle', height: 'low', pattern: 'new:sandal', priority: 1 },
  { id: 'footwear-sandals-flip-flop', type: 'sandals', label: 'Flip-flop (thong)', construction: 'footbed', closure: 'none', height: 'low', pattern: 'new:sandal', priority: 1 },
  { id: 'footwear-sandals-fisherman', type: 'sandals', label: 'Fisherman sandal (woven straps)', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:sandal', priority: 2 },
  { id: 'footwear-sandals-strappy', type: 'sandals', label: 'Multi-strap flat sandal', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:sandal', priority: 3 },

  // ---- Flats and Mary Janes: ballerinas a 2025 bright spot ----
  { id: 'footwear-flats-ballet', type: 'flats', label: 'Ballet flat (drawstring topline)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:ballet', priority: 1 },
  { id: 'footwear-flats-mary-jane', type: 'flats', label: 'Mary Jane flat (instep strap)', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:ballet', priority: 1 },
  { id: 'footwear-flats-pointed', type: 'flats', label: 'Pointed-toe flat', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:ballet', priority: 2 },
  { id: 'footwear-flats-slingback', type: 'flats', label: 'Slingback flat', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:ballet', priority: 2 },
  { id: 'footwear-flats-espadrille', type: 'flats', label: 'Espadrille (jute sole)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:espadrille', priority: 3 },

  // ---- Heels: softer, low heels holding ----
  { id: 'footwear-heels-kitten', type: 'heels', label: 'Kitten-heel pump', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:pump', priority: 2 },
  { id: 'footwear-heels-mary-jane', type: 'heels', label: 'Mary Jane heel (block heel)', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:pump', priority: 2 },
  { id: 'footwear-heels-pump', type: 'heels', label: 'Pump (stiletto)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:pump', priority: 3 },
  { id: 'footwear-heels-slingback', type: 'heels', label: 'Slingback heel', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:pump', priority: 3 },
  { id: 'footwear-heels-block-sandal', type: 'heels', label: 'Block-heel sandal', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:sandal', priority: 3 },
  { id: 'footwear-heels-platform', type: 'heels', label: 'Platform heel', construction: 'cemented', closure: 'buckle', height: 'low', pattern: 'new:pump', priority: 3 },

  // ---- Slippers ----
  { id: 'footwear-home-moccasin', type: 'home', label: 'Moccasin slipper (fleece-lined)', construction: 'moccasin', closure: 'slip-on', height: 'low', pattern: 'new:moccasin', priority: 3 },
  { id: 'footwear-home-scuff', type: 'home', label: 'Scuff slipper (open back)', construction: 'cemented', closure: 'slip-on', height: 'low', pattern: 'new:mule', priority: 3 },
  { id: 'footwear-home-bootie', type: 'home', label: 'Slipper bootie (shearling)', construction: 'cemented', closure: 'slip-on', height: 'mid', pattern: 'new:pull-on', priority: 3 },

  // ---- Kids ----
  { id: 'footwear-kids-court', type: 'kids', label: "Kids' court sneaker (hook-and-loop)", construction: 'cupsole', closure: 'hook-and-loop', height: 'low', pattern: 'sneaker', priority: 2 },
  { id: 'footwear-kids-runner', type: 'kids', label: "Kids' runner (bungee lace)", construction: 'strobel', closure: 'toggle', height: 'low', pattern: 'runner', priority: 3 },
  { id: 'footwear-kids-first-walker', type: 'kids', label: 'First walker (soft sole)', construction: 'cemented', closure: 'hook-and-loop', height: 'mid', pattern: 'new:soft-sole', priority: 3 }
];

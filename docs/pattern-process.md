# Patterns and engineering drawings for a new product

The process every product follows, from the moment it is added or drawn to the moment a factory gets its pattern. A pattern is ready when it sews together into the product at its specified measurements, at every size, with everything it is made with. The Lab proves this by measurement, with no AI and no picture judged. The proof travels with the pattern to the factory.

This page is the runbook. How each part is drafted is in [design-lab.md](design-lab.md), under "Patterns" and "The construction check and the cut-and-sew proof". Where the starting measurements come from is in [measurement-sources.md](measurement-sources.md).

## What runs on its own

Nobody has to remember to run the check. It runs at each of these points:

| When | What runs | Where the result shows | What it stops |
|---|---|---|---|
| A garment or bag is opened on the Pattern page | `constructionCheck` at the piece's size, and again at every size of its run | The **Sews together** panel: pass or the first problems, a tick or cross for each size, and **Open the cut and sew proof** | Nothing; it is shown to the designer |
| The pattern is saved (`PUT /v1/lab/concepts/:id/pattern`) | The same check on the saved pattern | The panel refreshes | Nothing; it is shown |
| The factory package is built (`productionFiles` in `src/lab-pattern-routes.js`) | The check, plus the proof page | `pattern/cut-and-sew-proof.html` in the zip, beside the DXF, SVG and cut list. If anything fails, a note on the package says what | The note goes to whoever sends the package |
| Someone opens the proof (`GET /v1/lab/concepts/:id/pattern-proof.html?size=M`) | The check with seam edges, rendered by `src/lab-pattern-proof.js` | A page with the block sewn on paper, the seam and measurement tables, every piece and trim, and the cutting table | — |
| A drawn flat is saved and would join the growing sketch library (`keepInLibrary` in `src/lab-flats-routes.js`) | The check at every size | The server log, when it is not kept | The sketch is not kept in the library until its pattern passes, so nobody starts from a pattern that does not sew together |
| A sketch or a bag is added to the library in code (`FLAT_TEMPLATES`, `BAG_TEMPLATES`) | `test/pattern-check.test.js` checks every library garment at XS to XXL, and every bag | `npm test` | A change that breaks any library pattern fails the tests |
| Before a release, or after drafting changes | `npm run pattern:proof` | `pattern-proof/pattern-proof.html` for the whole library | It exits non-zero when anything fails, so it can gate a release |

Every pull request runs `npm test` and `npm run pattern:proof` in GitHub Actions (`.github/workflows/ci.yml`; see [checks.md](checks.md)), and the customer journeys beside them. A contributor or an agent still runs them before pushing. The repo instructions (`CLAUDE.md`) require them for any change to drafting.

## What the check proves

`constructionCheck(pat, { m, style })` in `src/lab-pattern-check.js` returns `{ seams, meas, cuts, missing, table, ok }`.

1. **Seams.** Each block labels its corners: front, back, sleeve, legs, skirt, a tailored body's three pieces and two-piece sleeve, a bikini brief. Each pair of edges sewn together is walked against the other. They must match within ⅛ in, or ease within the range a factory sews:
   - a sleeve cap into its armhole
   - a rib onto a neckline or a cuff
   - a waistband over the waist

   A bag is walked from its `assembly`, the list its drafting gives of every seam, zip and finished edge: the two sides of each seam of the shell and the lining, each zip in its opening, and that every edge of every piece is sewn or finished once.
2. **Collars, stands and hoods.** Each records the edge it is sewn on by, measured off its own outline (`neck: { len, to, extra }` on the piece). That edge is walked against the body's neckline, front edge to front edge or centre front to centre front.
3. **The made product.** It is measured off the pieces as sewn and compared with the spec, within factory tolerances:
   - tops: chest, length, shoulder, neck, sleeve
   - bottoms: waist, hip, rise, inseam, thigh, opening, sweep
   - bags: width, height, depth; a pocket or sleeve inside its panel; handle and strap ends clear of the seams; how far a flap comes down the front; how high a handle rises; how far the shoulder straps let out; binding tape against the seams it binds
   - a six-panel cap: head size, crown height (read back off the panel), the six panels across against the dome's round at three heights, the back opening, brim length at the centre front and brim width, the seam tape against the six crown seams
   - a bucket hat: head size at the brim seam, crown height up the band, brim length at the side seams and at the centre
   - a beanie: flat width and length, the cuff from its marked fold, the crown's petals across their feet; it must also be knitted 10 to 25% smaller round than a 22¾ in head
   - a tote: width, height with the top turned back, handle drop and handle width
4. **Clean outlines.** No cut piece crosses itself or has a corner sharper than 20°.
5. **Everything it is made with.** Each feature calls for the parts and trims a factory needs (`missingComponents`):
   - every garment: labels and thread
   - a fly: its zip and a waist button
   - a fixed waistband: fusing
   - a woven collar, stand, cuff or placket: fusing
   - a placket: buttons
   - a shirt cuff: a sleeve placket
   - a hood: a lining, and a drawcord and eyelets if it has a channel
   - a lined body: its sleeve linings
   - a bra: elastic
   - a cap: a top button, a back closure, eyelets, crown seam tape, front panel buckram, a brim board and a sweatband
   - a beanie: its yarn
   - a tote: its handles
   - a bag: a puller to each zip slider, a D-ring to each swivel hook, a slider on an adjustable strap, foam where it is padded, the lining's gusset, a drawcord's lock and eyelets, a structured tote's base board
   - a one-size piece needs no size label
6. **The cutting table.** Every piece is laid on its cloth at the cloth's width, nested by its outline (`layoutOf`). The table gives the yardage and how much of the cloth is used. No piece may be wider than its cloth.

`finishGarment` in `src/lab-pattern.js` runs on every garment as it is drafted. It adds the components drafting has not. So a new product usually arrives complete, and the check confirms it.

## A new product, step by step

1. **Start it.** Pick a library sketch, draw a flat in the Studio, or start from scratch. The style sets the base measurements, graded to every size.
2. **Say how it is built.** The construction (sleeve, collar, opening, pockets, waist, leg, panels, yoke, lining) comes from three sources: the sketch's name, the two-model read of the drawing, or what the designer sets on the Pattern page. Set it before trusting the pattern: a pocket or a hood that is not set is not drafted.
3. **Open Pattern.** Read the **Sews together** panel.
   - If it passes at every size, carry on.
   - If not, see "When it does not pass" below.
4. **Check against the drawing.** For trousers and shorts, the **Against the drawing** panel compares the legs with the sketch. **Follow the drawing** makes the leg opening the sketch's.
5. **Edit pieces only if you must.** Pieces edited by hand on the Pattern page are not walked, because the check reads the pattern as drafted. The panel and the factory package both say so. Check edited pieces on the sample.
6. **Send it.** The factory package carries:
   - the AAMA DXF of every size
   - the base-size DXF and SVG
   - the cut list and trims
   - the cut-and-sew proof

   If the check failed, the package carries a note saying what failed. Do not send a package with that note without telling the factory.

## When it does not pass

| The problem says | Usually | Where to fix it |
|---|---|---|
| A seam, for example "Side seam: front to back", is out of range | The two sides were drafted from different lengths. This often shows only at the ends of the size run. | The block in `topPieces` / `bottomPieces` (`src/lab-pattern.js`). Draft one side from the other's length, the way the sleeve cap is solved to the armhole (`fitCap`) and the trouser back to the front. |
| "… onto the neckline" | The collar, stand or hood was sized from a formula, not from the neckline it is sewn to | Size it from `neckLen`, or solve it the way the hood is, and record its `neck` |
| A measurement, for example "Chest, 1 in below the armhole", is off | The drawing pulled the shape away from the spec, or a feature took width the block did not give back | The style's measurements in `STYLES`, the sketch's traced proportions (`npm run pattern:proportions`), or the feature's drafting |
| "… crosses itself" or "a corner of N°, a sliver" | Two cuts meet past each other, or a curve's control point sits behind its start | The piece's drafting. Every outline is also tidied at the end (`tidy`), which removes hairline backtracks. |
| A bag: "… round the gusset" or "Zip gusset across …" | A gusset was sized from a formula, not from the panel edge it is sewn round; or the two halves of a zip gusset and the zip do not make the depth | `bagPattern` (`src/lab-pattern.js`): size the gusset with `pathOf` off the panel's own outline |
| A bag: "No edge left unsewn, none sewn twice" | A piece was added or reshaped without its seams being listed, or one edge is in two seams | The bag's `assembly` in `bagPattern`: every edge of every shell and lining piece is in one seam, one zip or one finish |
| "Missing …" | A feature was drafted without what it is made with | Add it in `finishGarment` (or where the feature is drafted). The rule is in `missingComponents`. |
| Fails at one size only | Grading moved a point past another, or an exact-match lookup missed by a hair | Compare that size's pattern with M; look for exact-equality lookups on drafted points |

After a fix, run `npm test` and `npm run pattern:proof`. Both must be clean before the change is pushed.

## Adding a style, a feature or an add-on

A new kind of garment, a new pocket or collar, or a new add-on is not done until the check covers it:

1. **Draft it** in `src/lab-pattern.js`. If it changes the body, update the block's corner labels (`BLOCK`, `lmark`, `legMark`).
2. **Walk its seams.** Add each new seam in `checkTop` / `checkBottom` (`src/lab-pattern-check.js`), with the ease a factory sews, and say why in `why`. A piece sewn to the neckline records `neck`. A bag's seams are not added in the check: label the new piece's corners (`at`) and list its seams in the bag's `assembly` in `bagPattern`; `checkBag` walks whatever the list holds, and fails when an edge is not in it.
3. **Measure it.** If it has a specified measurement, add a `measure(...)` with the factory tolerance. Add the base value to `STYLES` with its sources in `docs/measurement-sources.md`.
4. **List what it is made with.** Add the parts and trims in `finishGarment` (or where it is drafted), and the rule that requires them in `missingComponents`.
5. **Test it.** `test/pattern-check.test.js` already covers every library sketch. Add an assertion for the new feature, and a negative case if the rule is new.
6. **Prove it.** Run `npm run pattern:proof`, then open the cards for the styles it touches. Look at the cutting table as well as the numbers.
7. **Document it** in `docs/design-lab.md`. Update `src/platform-map.js` if a file, route or flow step changed, and the video brief if a client-visible tool changed (see `CLAUDE.md`).

## Other kinds of product

The construction check covers garments, bags, caps, bucket hats, beanies and totes, and plush built from parts (`src/lab-plush-parts.js`). The other kinds are drafted and checked their own way. Each is reached from the same Pattern or Engineering page and lands in the same factory package.

| Kind | Drafted by | Checked by | In the package |
|---|---|---|---|
| Footwear | `footwearPattern` (`src/lab-footwear.js`): the last, the size run, the upper flattened in pieces | `footwearChecks` checks the build: heel height against the style, toe spring under a high heel, a pointed toe on an athletic last, the collar against the ankle bone, a backless shoe's heel seat. It also lists the fitting sample and the tests (sole bond and others). The drawing is reviewed by `src/lab-shoe-review.js`. | The last (drawing and STL), the tech flats, every size as AAMA DXF |
| Plush (the seven fixed body types) | `plushPattern`: the toy as its pieces. A plush built from parts is covered by the construction check above. | `plushChecks` checks safety for the age: safety eyes and small parts for under-3s, how the tail is sewn, chrome-free leather, pile at the seams, the law label. The toy is reviewed by `src/lab-plush-review.js`. | The tech sheet, the pattern, the fill weight |
| Hard goods and electronics | `src/lab-assembly.js`: 3D parts, processes and tooling | `dfm`, per part: wall thickness for the resin, draft and undercuts, solid sections, clear parts, size against the press, food contact, and whether parts fit on and inside each other | Per-part 3D files, the BOM, tooling and cost |

Bringing one of these under the construction check follows the steps above: label its blocks, walk its seams, measure it, list its components.

## Limits

- The check proves the pattern makes the product it describes. It does not prove the product fits a body. Only a fitted sample does that, and corrections from the sample come back through the sample-corrections form.
- Pieces edited by hand are not walked. They are flagged.
- The notched tailored collar and the shearling collar are not yet walked against the neckline.
- Turning a piece end to end on the cutting table assumes the cloth has no nap. Corduroy, velvet and pile need one-way layouts.

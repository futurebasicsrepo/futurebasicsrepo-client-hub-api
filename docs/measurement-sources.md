# Where the starting measurements come from

Every piece in the Design Lab starts at its style's size-M measurements (`STYLES` in `src/lab-flats.js`) and grades from there. Anyone can change them on a piece; these are only the starting point. In November 2026 they were checked against about 60 published **garment** (not body) specs. Most came from blank-apparel spec sheets, with brand size guides for the women's styles.

## How the sources were read

- **Flat widths.** All widths are flat (half the circumference). A source that gave a circumference was halved.
- **Units.** Centimetres were converted to inches.
- **Sleeves.** A sleeve measured from the centre back had half the shoulder width taken off, so it reads from the shoulder point; those values are approximate.
- **Women's M.** Read as size 10.
- **Printful.** Printful's size tables repeat the supplier's own numbers, so they were used only where nothing else covered a style.
- **ASTM D5585 and D6240.** These body-measurement tables are paywalled and weren't used. For body sizes, the brands' own body charts were: men's M chest 38–40 in, women's M bust 37–38½ in.

## What changed

A value changed only where several sources agreed. Where a point is published by one source or none, it was left as it was. Those values are unverified, not known to be wrong.

| Style | Point | Was | Now | Sources (size M) |
|---|---|---|---|---|
| tee | chest | 21 | 20½ | Gildan 5000 20, Bella+Canvas 3001 20, Comfort Colors 1717 20¼, Next Level 3600 20½, Port & Co PC54 20, AS Colour 5001 20½, LA Apparel 1801 21 |
| tee | length | 28 | 29 | Same sources: 28 to 29¾, median 29 |
| longsleeve | chest / length / sleeve | 21 / 28 / 25 | 20½ / 29 / 26 | Next Level 3601, Gildan 2400, Bella+Canvas 3501, LA 1807, Champion |
| crewneck | length | 27 | 28 | Gildan 18000 and 19000, LA HF07, Champion S149, AS Colour 5160 |
| hoodie, zip hoodie | chest / length | 23 / 27½ | 22 / 28 | Gildan 18500 and 18600, Independent SS4500, Champion, LA HF09 (the Relaxed and Oversized fits add to it) |
| jacket | chest / length | 24 / 27 | 23 / 27½ | Port Authority J317, Lands' End windbreaker and down jacket, bombers and track jackets |
| shirt | chest / length | 22½ / 30 | 23 / 31 | Port Authority S608 (32, cut for tucking in), Lands' End pinpoint (33); 31 is worn untucked |
| short-sleeve shirt | chest | 22½ | 23 | As the shirt |
| polo | length | 28½ | 29½ | Port Authority K500 30, Gildan 64800 29½, Lands' End 29 |
| tank | length | 27 | 29 | Bella+Canvas 3480 28, AS Colour 5025 29½, Champion 29 |
| vest | chest / length | 21 / 25 | 22 / 27½ | Port Authority J325, J709 and J853, LA 54065, Stanley/Stella |
| dress | chest | 17½ | 18½ | Lands' End knit, ponte and piqué dresses, QVC (a woven or ponte dress; stretch dresses run about 17½) |
| cami | length | 18 | 20 | Bella+Canvas 6008 19⅜, Next Level 6733 23½ |
| pants | leg opening | 8½ | 8 | Lands' End deck pants, Taylor Stitch and Alex Mill chinos (a straight leg; slim is about 7½) |
| skirt | waist / hip / length / sweep | 14½ / 19½ / 17 / 22 | 16½ / 21½ / 19½ / 24½ | Lands' End chino, pincord and skort, QVC (woven skirts; a knit skirt's waist runs about 13) |
| leggings | waist | 13 | 13½ | QVC, Sport-Tek LPST890 and 891, LA 8300 |

### Grading

- **Unisex and men's tops:** published specs grade the chest **2 in a size** (flat) and the length 1 in. We used to grade the chest 1 in, so every size but M came out wrong.
- **Women's tops** (dress, bodysuit, swimsuit, bikini, bra, cami): 1 in across the chest and ½ in in length a size, as QVC and Lands' End grade.
- **Men's trousers and shorts:** 1½ in a size at the waist and the hip.
- **Women's bottoms:** 1 in a size.

### Checked and left as they were

These agree with the sources:
- tee sleeve and sleeve opening
- crewneck chest and sleeve
- hoodie and jacket sleeves
- polo chest
- tank chest
- dress length, shoulder and armhole
- swimsuit and bra chest
- pants waist, hip, rise and inseam
- leggings rise and inseam

These have no published source, or only one:
- **Tops:** armholes, neck widths and drops, sleeve openings, rib heights
- **Women's pieces:** every bodysuit point, bikini length
- **Shorts:** thigh and leg opening
- **Leggings:** hip, thigh and leg opening. QVC's single spec is looser, but ours suit compression fabric.

## The main links

- SanMar spec sheets (Bella+Canvas, Port & Company, Port Authority, Next Level, Carhartt, Sport-Tek, Gildan): `https://www.sanmar.com/p/<id>/specSheetMeasurements`, e.g. [3001](https://www.sanmar.com/p/9260/specSheetMeasurements), [PC54](https://www.sanmar.com/p/3985/specSheetMeasurements), [K500](https://www.sanmar.com/p/1225/specSheetMeasurements), [S608](https://www.sanmar.com/p/2716/specSheetMeasurements), [J317](https://www.sanmar.com/p/5503/specSheetMeasurements), [G18500](https://www.sanmar.com/p/115/specSheetMeasurements)
- Gildan 5000 and Comfort Colors 1717: [blankstyle 5000](https://www.blankstyle.com/files/specs/20774/SpecSheetMeasurements_5000.pdf), [blankstyle 1717](https://www.blankstyle.com/files/specs/2549/SpecSheetMeasurements_1717.pdf)
- Los Angeles Apparel product pages (garment measurements on each), e.g. [1801](https://losangelesapparel.net/products/the-1801-garment-dye)
- Lands' End garment specs: `https://www.landsend.com/garment_measurements/<id>_core_pdp_spec.pdf`, e.g. [knit dress](https://www.landsend.com/garment_measurements/441021_core_pdp_spec.pdf), [chino skirt](https://www.landsend.com/garment_measurements/412568_core_pdp_spec.pdf)
- QVC garment specs, e.g. [dress](https://www.qvc.com/wcsstore/US/content/html/garmentspecs/A/86/A603286_gs.html), [leggings](https://www.qvc.com/wcsstore/US/content/html/garmentspecs/A/90/A374290_gs.html)
- Printful size tables (supplier numbers): `https://api.printful.com/products/<id>/sizes`

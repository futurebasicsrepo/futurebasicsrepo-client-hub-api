# Make page (thefuturebasics.com/pages/make)

The Make page lives in the live Shopify theme. The files here are what goes into it.

| File here | Goes to |
| --- | --- |
| `sections-make-v4.liquid` | `sections/make-v4.liquid` (new) |
| `assets-make-v4.css` | `assets/make-v4.css` (new): the section's styles |
| `templates-page.make.json` | `templates/page.make.json` |
| `sections-make-v3.liquid` | `sections/make-v3.liquid`: the previous version, kept for rolling back |
| `sections-make-v5.liquid` | `sections/make-v5.liquid` (new): v4 with the two pieces below; `templates-page.make.json` now points at it |
| `snippets-make-try.liquid` | `snippets/make-try.liquid` (new): see it work and build one now |
| `assets-make-try.css` | `assets/make-try.css` (new): their styles |
| `sections-compare.liquid` | `sections/compare.liquid` (new): an honest comparison page |
| `sections-guide.liquid` | `sections/guide.liquid` (new): a guide page (the page's own body, a contents list, the free tech pack) |
| `assets-compare.css` | `assets/compare.css` (new): both pages' styles |
| `templates-page.compare-techpacker.json` | `templates/page.compare-techpacker.json` (new): Future Basics and Techpacker |
| `templates-page.compare-onbrand.json` | `templates/page.compare-onbrand.json` (new): Future Basics and Onbrand |
| `templates-page.guide.json` | `templates/page.guide.json` (new) |
| `page-what-goes-in-a-tech-pack.html` | the body of the page "What goes in a tech pack" (page editor, HTML view) |

The `systems` section (`sections/make-systems.liquid`) is unchanged and stays between the two halves.

## v5: see it work, build one now (November 2026)

v4 as it is, with two pieces under the graphics strip and a link to each under the hero's buttons:

- **See it work:** the Design Lab used for real, one click at a time. Seven screens taken in the Lab are followed by two screens of a tech pack already made:
  - a hoodie picked from the recipe menu;
  - a chest pocket and a stone wash added;
  - its colours;
  - the Studio;
  - its flats and their check;
  - its pattern, sewing together XS to XXL;
  - its pieces laid out to cut;
  - the factory's callouts;
  - the spec sheet.

  A green ring marks the spot each click lands on. It plays by itself once it is on screen; a visitor clicks the ring, the arrows or a step to go on. Nothing plays for people who ask for less motion. The screens and the spots come from `hub.thefuturebasics.com/help/assets/make-walk.json`. To take them again when the Lab's screens change, use a client token for a demo room with the Lab open, never a client's: `node scripts/make-walkthrough.mjs --base <hub> --token <that token>`. The spots are measured off the elements themselves.
- **Build one now:** the recipe menu without signing in.
  - What you pick: one of 9 staple bases, up to 4 add-ons that suit it, and a colour system and colour.
  - What it shows: the real flats, front and back, as pictures (the purchased flat sketches are never sent), and what its tech pack would say: how it is built, the details added, the measurements at M, the trims, and the pattern checked to sew together at every size.
  - Where it comes from: `GET /v1/public/make/menu`, `/piece` and `/flat.webp` on the hub (`src/make-demo.js`). No AI, kept in memory by piece, with a per-address hourly limit on new pieces (`MAKE_DEMO_LIMIT`, 240).
  - **Make this for real** opens `join?for=lab&recipe=…`. The join page keeps the piece; the Lab opens on it in the recipe menu, once.
- The hub's address is a section setting (`api_url`). If the hub cannot be reached, both pieces stay hidden and the page reads as v4.

Publish as for v4: merge and deploy the hub first, so the endpoints and `make-walk.json` are live, then load the five files onto a copy of the live theme, preview, and publish the copy. Roll back by pointing `templates/page.make.json` at `make-v4` (both sections).

## The free tech pack, comparison and guide pages (November 2026)

**Build one now** gains **download its tech pack**: the PDF of the piece the visitor built, made by the hub
(`GET /v1/public/make/techpack.pdf`, `src/make-demo.js`) from the same flats, graded measurements, construction and pattern check a Lab
piece's pack takes, through the same PDF (`src/tp-pdf.js`). No sign-up. It counts against the same hourly limit as a new piece, and each
piece's PDF is kept once made. A download pushes `make_techpack_download` to the data layer when the theme has one.

Three pages send people to it:

| Page (handle) | Template | Title |
| --- | --- | --- |
| `future-basics-vs-techpacker` | `page.compare-techpacker` | Future Basics or Techpacker? |
| `future-basics-vs-onbrand` | `page.compare-onbrand` | Future Basics or Onbrand? |
| `what-goes-in-a-tech-pack` | `page.guide` | What goes in a tech pack (body: `page-what-goes-in-a-tech-pack.html`) |

The guide's pictures are pages of a real free pack, served by the hub (`src/help-assets/guide-pack-*.webp`).

**Rules for the comparison pages.** Every fact about the other tool comes from its own site, is listed under sources, and is dated
(`as_of`). Where their site does not say something, the page says so ("not mentioned on its pricing page"), never that they cannot do it.
Each page says who should pick them. Re-read their pricing pages each quarter and update the rows and the date; change a claim about us
only when the product changes (and the video brief with it).

To publish: upload the files above to an unpublished copy of the theme, create the three pages with those handles and templates (the guide's
body pasted in), check them on the copy's preview, then publish the copy. Link the guide and the comparisons from the footer. A section's
schema name may be at most 25 characters, or Shopify refuses the file.

**Where it stands (16 November 2026).** On the Future Basics store, the theme copy "Future Basics — Storefront (make v5: see it work, free
tech pack)" holds every file above, checked against these copies. The three pages exist, unpublished, with their templates. The hub
answers only `thefuturebasics.com` (`ALLOWED_ORIGINS`), so on the copy's preview link (`the-future-basics.myshopify.com`) the see-it-work and
build-one-now sections stay hidden; they show once the copy is published on the real domain. A comparison page can be looked at on the
preview as `/pages/make?view=compare-techpacker` (or `compare-onbrand`). To go live: publish the theme copy, then publish the three pages.

## v4: the Design Lab leads, production follows (November 2026)

The page leads with the tools and what they lead to, and ends with Future Basics making what you design. The full-service packages are gone.

- **Hero:** "design it yourself. we make it properly." The main button opens the Design Lab (`hub.thefuturebasics.com/join?for=lab`); the free tech pack is second. The phone shows the recipe menu.
- **01 · the design lab: six ways in, one tech pack out.** A card with a real screen for each way: describe it (AI), the recipe menu, a sketch, from scratch, a whole line, a photo. A strip shows where every way leads: studio → flats, pattern or 3D parts → tech pack → factory sign-off → made by Future Basics.
- **Motion:** the hero turns a decorated hoodie from its back print to its stitched chest crest, with the sew-out playing in a chip. A strip of Future Basics graphics runs under the brand list. The separation plates pull apart in 3D and come back together. The flow strip pulses, and cards rise in on scroll where the browser supports scroll-driven animation. Everything stops for people who ask their device for reduced motion, and the videos play only while on screen.
- **Graphics to the factory:** colour separations (one plate per ink with its Pantone C, the white underbase, the job sheet), embroidery digitized (the sew-out played back, the digitiser's review, .dst and .exp), and the decoration sheet.
- **The tools inside:** the graphics library, the graphic generator (and a new print from one you have), techniques, materials and the pattern, each with a real screen, plus colour systems, iPad and the concept picture.
- **Every product type:** apparel, headwear, bags, footwear, plush, and toys, objects and electronics, each with a real screen from its own tools, plus a tile for home and accessories.
- **02 · the tech pack:**
  - the spec sheet, the checklist and factory sign-off
  - the tools by subscription: Design Lab $499 for 90 days, membership $100 a month, $48 a pack, first pack free
  - a comparison table
- **03 · made by future basics:** the figures, minimums and lead times per category, and "how it gets made" (design in the lab → tech pack → sample → produce → deliver).
- **Questions:** Design Lab questions first. Package and store questions are gone or rewritten; "what does production cost?" replaces "what does it actually cost?".

The screenshots are real screens from the live Lab, taken signed in to the Future Basics room with made-up demo pieces (deleted afterwards). They are served by the hub: `src/help-assets/make-*.webp`, at `https://hub.thefuturebasics.com/help/assets/<file>`. The line plan uses `lab-plan.jpg`, a real screen already in the help guide. The factory sign-off screenshot (`make-pack-callouts.webp`) is the current factory view of a made-up demo pack, shot on a local copy of the app because a tech pack cannot be deleted from production. The pattern screenshot comes from the same local demo piece.

Numbers on the page (26 bases, 31 add-ons, 382 sketches, prices) are the same as `docs/marketing/video-brief.md`. Update both when they change.

The screen recording at the top of "see it work" (`make-lab-session.mp4`, about 73 seconds, 2 MB) is the Lab in use, recorded as it runs with a cursor and a caption per step: the hoodie from the recipe menu to its pattern laid out on the cloth, then a pocket tee drawn with the brush on a blank page over its outline, filled and topstitched (the drawing is sped up 1.7×). It is in the store's Files like the sew-out, so it shows even where the hub's walkthrough data cannot load; its poster (`make-lab-session-poster.webp`) and the "draw it yourself" picture (`make-way-scratch.webp`) come from the same run. To record it again: `node scripts/make-recording.cjs --base <hub> --token <a demo room's client token>`, then upload the video to Files under the same name. The bags and footwear cards (`make-type-bags.webp`, `make-type-footwear.webp`) are six bags and six shoes from the Lab's library, each in a colourway of its own: `node scripts/make-type-cards.mjs`.

The sew-out video (`make-sewout-v3.mp4`) is in the store's Files (Content → Files) and the section loads it with `file_url`. The demo pieces in the screenshots (the Lane Six hoodie and the Future Tour tee) carry real Future Basics graphics from the Lab's library; they were made, separated and digitized on a local copy of the app.

## To publish

The new page is already loaded on a copy of the live theme: **Future Basics — Storefront (make v4: design lab)**, theme 168651063493, unpublished. Preview it at `https://thefuturebasics.com/pages/make?preview_theme_id=168651063493`.

1. Merge and deploy the hub PR first, so the screenshots at `hub.thefuturebasics.com/help/assets/make-*.webp` load.
2. Preview `/pages/make` on the copy (desktop and phone).
3. Publish the copy: Shopify admin → Online Store → Themes → the copy → Publish.

The copy was taken from the live theme, so the rest of the site is the same. Anything changed on the live theme after 2 November 2026 is not on the copy.

To do it by hand instead: duplicate the live theme, then in Edit code add `assets/make-v4.css` and `sections/make-v4.liquid` and replace `templates/page.make.json` with the files here.

A later save from the theme editor can overwrite `page.make.json`; edit the page's text in the theme editor afterwards rather than in the file.

## Roll back

Point `templates/page.make.json` back at `make-v3` (both `make` and `make_end` sections). `make-v3.liquid` is left in the theme untouched.

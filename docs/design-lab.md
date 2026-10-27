# Design Lab

A part of the work console for Danielle and Kyle (and anyone they tick it for on **Team access**). It looks at what brands like Ralph Lauren, Aimé Leon Dore and A-COLD-WALL* make and what is selling through, so line plans start from the market and the Future Basics brand code instead of a blank page.

All three parts are built.

| Part | What it does | State |
| --- | --- | --- |
| **L1 Library** | The brand code, the brands we watch, an automatic reader of the public web, the library of what it found | built (this document) |
| **L2 Line plan** | The trend read across every category, a price ladder held to the Zara line, a line plan drafted from the library and the brand code, margin against the brand code's economics | built (this document) |
| **L3 Concepts** | Concepts with the Future Basics twist, a "too close to the reference" check, an approval board, an approved concept becomes a product and runs the tech pack | built (this document) |

## Who can open it

The Lab is a held-back module on Team access: it is **not** part of the "Everything" preset, **not** part of the default for new people and **not** handed out by the one-time backfill. Owners (the Money list, or `ACCESS_ADMIN_EMAILS`) always have it. An owner ticks **Design Lab** on a person's card to give it to them. Every `/v1/lab/*` route belongs to the module, so reading and writing are both refused (`403`, `code: MODULE_ACCESS`) for anyone without it, and the menu entry and `/lab` page say so.

## Who it is for

Future Basics is **male-driven and unisex**: menswear first (men's sizing, proportions and fits), in pieces anyone can wear. It is part of the brand code ("Who it is for"), so it reaches every assistant prompt. A line plan leaves womenswear-only categories (dresses) out unless you ask for them by name, and concepts are designed for men first.

## The brand code

Kyle's direction, stored as editable settings (`labBrandCode`): *affordable, never cheap. Cheap is Shein; we like Zara. Gucci, Prada, Ralph Lauren and Aimé Leon Dore cuts and aesthetic, but not as rich in materials.* It holds a statement, the price anchor (Zara), the cuts we borrow from, materials, the look, what to avoid, notes and a list of **pieces we love**. Three to five pieces we love teach the Lab our taste far faster than words, so add them when you have them. The brand code is given to the AI before it reads or judges anything.

## The brands we watch

Seeded once: Ralph Lauren, Aimé Leon Dore, A-COLD-WALL*, Noah, Kith, Todd Snyder (reference), Zara (price anchor), Prada, Gucci (cuts only). Add, pause or remove any of them on the page. Each brand's role says what it is for.

## How the Lab reads a brand

In order, stopping when it has enough:

1. **The shop's own product feed.** Shopify shops publish `/products.json`: names, prices, pictures and which sizes are in stock. Read only if `robots.txt` allows it.
2. **The shop's own pages.** Structured product data (JSON-LD) on the home page and a couple of category or "new in" pages. If a page has none, the AI picks the products out of the links on it (it can only choose links that really are on the page).
3. **Search.** When a site refuses us (403, 429, a bot wall, an unreachable `robots.txt`), forbids robots, has no feed, or gave fewer than three pieces, the Lab uses web search and image search for the brand's new pieces and bestsellers. The scan log says it did and why.

Every piece then gets a design read from the AI (category, silhouette, fabric, colours, details, fit, season, a one-line summary). Search results that are an article, a list or a store page are dropped. Without an AI key the pieces are still saved, with a category taken from the shop's own words.

### Sell-through ("heat")

From a shop's own feed: the share of sizes sold out, weighted by how recently the piece went live. A new piece with most sizes gone is **Selling fast**; a piece that has sat fully stocked for months is not. It is a hint, not a sales number, and the page says so.

### What it keeps, and what it will not do

- Facts and a link: name, price, category, the cut and fabric in words, the page it came from and the **address** of the picture on the brand's own site. It never copies a picture, logo, print or name into our work.
- Obeys `robots.txt` (the `*` group, or a group that names `FutureBasicsLab`; longest rule wins). Says who it is (`FutureBasicsLab`), goes slowly (about 0.7 seconds between requests to a site), reads at most three feed pages and a few pages per site, and only fetches public addresses (the same safe fetcher the prototypes use).
- Items nobody saved are removed after 120 days of not being seen.

## The page

`/lab`: **Library** (filter by category, brand, word; sort by newest, selling fastest or price; save, hide, open the brand's own page; add a piece by pasting its address), **What's moving**, **Line plans**, **Concepts**, **Brands we watch** (read now, pause, remove, add), **Brand code**, and the log of what the Lab has read.

## What's moving (the trend read)

Plain arithmetic over the library, so it costs nothing and can be checked. Per category: how many pieces, the reference brands' price range and median, the price anchor's own range and median, how much of what has stock data is **moving** (heat 30 or more), how much is new this month, and the colours, fabrics, shapes and details that keep appearing (the same colour in different case counts once). Luxury "cuts only" brands (Prada, Gucci) feed the shapes and details but never the price evidence.

### The price ladder

The ladder is the price range a piece in that category is held to: **entry** (the anchor's 25th percentile), **core** (its median) and the **cap** (its 75th percentile, nothing above it). When the Lab has read at least three priced pieces from the price anchor (Zara) the ladder is Zara's own prices. When it has not, the ladder is **estimated** from the reference brands at 40% of their prices and is marked as an estimate; with fewer than three priced pieces there is no ladder and the page says so.

## Line plans

A plan is a season's assortment: pieces with a **role** (core, trend, hero, entry), a category, a target price, an estimated landed cost and a starting quantity. **Draft the plan** asks the assistant to build one from the library and the brand code: it is given the brand code, each category's ladder, colours, fabrics, shapes, details and the pieces that are moving, plus the role mix to aim for (about 15% hero, 30% trend, 15% entry, the rest core). It is told every piece is ours to design: no brand's product names, logos or prints, and each piece gets a specific "twist" that is ours. The answer is then made safe in code before it is saved: real categories only, prices clamped to the ladder cap, starting quantities near a factory's usual minimum (core 500, trend 300, hero 150, entry 500), and references only to library pieces that exist.

Everything is editable on the page: name, category, role, price, cost, quantity, drop and restore, add a piece, rename, mark the plan approved, delete it, and **download it as a CSV** (quoted for spreadsheets; a cell that starts like a formula is neutralised).

### Landed cost and margin

Until a concept becomes a real tech pack, landed cost is an **estimate**: the brand code's cost ratio (default 28% of the shelf price) times the price. A piece's cost stays empty, so the estimate follows the brand code if you change it, until you type the real cost; clearing it goes back to the estimate. Once a concept becomes a tech pack (Lab L3) the bill of materials gives the true landed cost. The brand code also holds the **lowest acceptable gross margin** (default 60%).

### What gets flagged

A piece above the ladder cap ("Above the Zara line for tops ($40)"), a margin under the floor, a piece with no price, a plan that leans on one category (over 40% with six or more pieces), no hero, no core, no entry price, and pieces with no quantity. Dropped pieces are not flagged and are left out of the totals (pieces, median price, blended margin, units, revenue at the shelf price, gross).

## Concepts

On a line plan, **Make concepts** on a planned piece asks the assistant for three different takes on it (you can add a steer such as "longer back, no pockets"). Each concept has a name, a plain-words description, shape, fabric, fit, colours, details and trims, and a **twist**: the specific thing on the piece that is ours. The assistant is given the brand code, the planned piece, the category's trend and the library pieces that inspired it, and is told every concept is our own design: never to name another brand or its products, and to keep materials simpler than the references so the price holds. Each concept is then drawn and checked.

### Future Basics on every concept

- **The logo, always.** Every concept carries the Future Basics logo. The assistant chooses the mark (the cue mark, the wordmark, or both), where it goes and how it is made (embroidered, woven patch, screen print and so on). If it forgets, the cue mark goes on at the usual place for that kind of piece.
- **The internal woven label, always.** Every concept carries a Future Basics internal woven label, in fixed words that suit the piece: the back neck seam on tops and outerwear, the inside sweatband on caps, the tongue lining on footwear, the inside waistband on bottoms, and so on. The assistant cannot change or drop it.
- **Drawn from our own brand files.** The picture is drawn by the image model with the logo place left plain, then our real logo files are laid on it (light on a dark garment, dark on a light one), with a small woven-label inset in the corner. A model never draws the lettering. The placement on the picture is a guide; the tech pack carries the exact spec.
- **Future Basics graphics, where it makes sense.** On a tee, a sweatshirt, a cap, a tote or outerwear the assistant also gives the piece one to three graphics. They are **not limited to our logo or its line and dot, nor to the logo colours.** The brands we study (Ralph Lauren, Aimé Leon Dore, A-COLD-WALL*) have taken their graphic programs deep, so ours goes deep too: crests and emblems, original lettering and numerals, stripes and bands, patterns, illustration, technical annotation. Each has a kind, a placement and a technique (screen print, embroidery, woven jacquard, puff print, flock print, appliqué, chenille patch and so on). A clean piece, such as tailoring, stays clean.
- **Original, always.** The assistant is told to study how those programs are built (their range, discipline and placement) and make ours our own: never to copy or imitate a mark, crest, lettering style, print or character, and never to name them. The words in a graphic are checked against brand names and trade dress, and the too-close check reads them.
- **How a graphic is kept.** The assistant draws it as an SVG. Lettering (`<text>` in Space Grotesk or IBM Plex Mono) is turned into **outlines from our own font files**, so it looks the same everywhere and never depends on an installed font; only the words are kept beside it. Anything else that could run, fetch or change (scripts, images, links, filters, patterns, style blocks) is dropped, along with drawings that are too big. Front graphics are laid on the concept's picture; ones for the back or a sleeve are in the spec, the brief and the artwork.
- You can change the logo, remove a graphic, or **redraw the picture** from the concept window (`LAB_DAILY_REDRAWS` limits redraws). The too-close check reads the graphics' words too.

### The graphic program

A line plan can have a **graphic program**: the season's graphics designed once as a system, so concepts share a world instead of each inventing its own. **Develop the graphic program** (in the plan view, with an optional steer such as "lean on numerals") asks the assistant for four to six motifs across different kinds, a palette in real colours (not only our logo colours), a story and rules for where and how many go on a piece. It is given the brand code, the plan's pieces and **what graphics the reference brands put on those kinds of piece** (read from the library), for the range and depth to match and never to copy. You can rename the program, remove a motif, develop it again or remove it.

When concepts are made for a piece, the program is in the prompt and a concept **applies motifs by id**, taking the motif's drawing, words and kind and choosing where and how it goes; it may add one new graphic of its own. A concept keeps its graphics once made, so editing the program later does not change concepts already made.

### The picture

Drawn by the image model from a prompt built from the concept alone. **No reference picture is ever sent to the image model**, brand names are stripped from the words it gets, and it is told no text, logos or brand marks. With no image model connected a concept is saved without a picture and says so. Pictures are stored on the concept (a JPEG and a small thumbnail) and served only to people with the Lab.

### The "too close" check

Before anyone can approve a concept it is checked against the library pieces it was drawn from:

1. **Names and trade dress.** A list of brand names (and the library's own brand names) and trade-dress terms such as a polo pony, a double G or a red tab. Any of them in a concept makes it "too close".
2. **Overlap.** How much the concept's design words (shape, fabric, fit, details) overlap with each reference, and how many details are word for word the same. 60% or three identical details is "too close", 40% or two is "look closely".
3. **A second opinion.** The assistant reads the concept next to the references and says whether it copies a distinctive design, with specific fixes. It can only make the verdict worse, never better.

**The check reads words, not pictures.** The concept's window therefore puts the pieces it was drawn from beside it, with links, so a person looks at both before approving. That look is the real check. The window also says when a concept was only checked on words.

Approval is blocked for "too close" unless a person writes down why (at least ten characters), which is kept on the concept and in its comments. A concept with no twist of its own is not approved. Editing an approved concept sends it back to draft, and an edit re-runs the word checks and marks the second opinion out of date until it is re-checked.

### The board

**Concepts** on the page: filter by status (draft, approved, rejected, tech pack) and by plan; open a concept to edit its words, price and quantity, see the check and the references, comment, **approve**, **reject** (with a reason), send it **back to draft**, **revise** it (a note such as "less boxy" makes a new concept that remembers its parent) or delete it. Every decision is written into the concept's comments with who made it.

### From an approved concept to a tech pack

**Send to tech pack** makes a product in the Future Basics room: the title is the concept's name, the brief carries the concept in words, our twist and the commercial targets (price, estimated landed cost, quantity), the concept's picture is the reference photo, and the tech pack assistant drafts the pack from them (when it is switched on). The brief says the picture is an AI render, not a sample. The planned piece is marked "tech pack" and links to the product (`/tech-packs/<product>`). The brief also carries who it is for, the logo, the woven label and the graphics, so the tech pack assistant starts from them. The concept's **artwork goes into the tech pack's Art tab**: the Future Basics logo, the woven label and each graphic, as transparent PNGs. A concept can only become a tech pack once; it then stays as the record and cannot be changed, rejected or deleted. The tech pack's own landed-cost estimate takes over from the ratio used in the plan.

## Automatic reading

A job runs every six hours and reads up to three brands that have not been read in 72 hours, inside a daily AI allowance. `LAB_AUTO=off` switches it off. A person can read one brand, or everything, at any time from the page.

## Settings

| | |
| --- | --- |
| `BRAVE_API_KEY` | web and image search (already used by the lead finder) |
| `ANTHROPIC_API_KEY` | the design read |
| `LAB_AUTO` | `off` stops the six-hourly job |
| `LAB_DAILY_CENTS` | daily AI allowance for reading (default 200, about two dollars); past it pieces are saved without a design read |
| `LAB_FETCH_DELAY_MS` | pause between requests to one site (default 700) |
| `LAB_DAILY_CONCEPTS` | how many concepts (each with a picture and a check) can be made in 24 hours (default 30) |
| `LAB_DAILY_PROGRAMS` | how many graphic programs can be developed in a day (default 12) |
| `LAB_DAILY_REDRAWS` | how many concept pictures can be redrawn in a day (default 30) |
| `LAB_DAILY_SAMPLES` | how many technique samples the image model can make real in a day (default 30) |
| `LAB_DAILY_STUDIO_AI` | how many AI changes and AI graphics the studio can make in a day (default 60; -1 for no limit) |
| `LAB_DAILY_PLANS` | how many assistant-drafted plans can be made in 24 hours (default 10) |
| `LAB_WEB_QUERIES`, `LAB_IMAGE_QUERIES` | searches per brand when falling back (default 4 and 3) |

## Where it lives

| | |
| --- | --- |
| Categories, robots rules, feed and page parsers, sell-through, brand code, watchlist (no network) | `src/lab.js` |
| The scanner, the AI read, saving, the due-brand job | `src/lab-scan.js` |
| The trend read, price ladder, line plan logic, the assistant's brief and the CSV (no network) | `src/lab-plan.js` |
| Lettering as outlines from our fonts | `src/lab-type.js` |
| The graphic program (motifs, palette, the assistant's brief) | `src/lab-program.js` |
| Concepts: the brand-name guard, the closeness check, the assistant's brief, the picture, the product brief (no web server) | `src/lab-concepts.js` |
| The concepts API | `src/lab-concept-routes.js` |
| Reads shared by the Lab's routes | `src/lab-data.js` |
| The API | `src/lab-routes.js` |
| The page | `src/lab.html` at `/lab` |
| Module and access | `src/staff-access.js` (`lab`, held back), `src/console-nav.js` |
| Tables | `lab_brands`, `lab_items`, `lab_scans`, `lab_plans`, `lab_plan_lines`, `lab_concepts`, `lab_concept_comments` (`src/db.js`) |
| Tests | `test/lab.test.js`, `test/lab-plan.test.js`, `test/lab-concepts.test.js`, `test/lab-program.test.js`, journeys J193 (API), J194 (library, brand code, watchlist), J195 (browser), J196 (trends and plans, API), J197 (plans, browser), J198 (concepts, API), J199 (concepts, browser), J200 (graphic program, API), J201 (graphic program, browser) |

In the menu the Lab is one entry (`/lab`); its seven sections (Library, What's moving, Line plans, Concepts, Assortment board, Brands we watch, Brand code) are tabs across the top of the page, with the one you are reading marked.

## Assortment board
A visual wall of the concepts (`/lab#assort`, files `src/lab-views.js`, `src/lab-view-routes.js`, table `lab_concept_views`). Each concept can have, beyond its one drawn picture:
- **Flats:** front and back, laid flat on white (a shoe in side profile, a cap or bag standing alone).
- **On model:** an adult man, front, three-quarter, side and back, framed for the product (full length for clothes, head and shoulders for headwear, lower legs for footwear, knees up for bags). Pieces with nobody wearing them (home and objects) get flats only.
- **A walk** (optional): a short clip of the front on-model view walking toward the camera and turning.

Every view is drawn by the image model **from the concept's own picture** (and the flat, and then the front on-model view, so the same man and outfit carry through the angles), with instructions to keep the shape, colours, logo and graphics exactly and to add no new marks. Views are made in the background, one concept at a time; the board shows the concept's own picture until a view lands and refreshes itself. **Make missing views** does the whole board (or the chosen plan); a concept's viewer can draw its views again. Redrawing a concept's picture deletes its views, because they were drawn from the old one.

The board has a **Flats / On model / Both** switch (remembered) and an **In play / Approved / All** filter (rejected concepts are off the board unless asked for). Opening a tile shows the viewer: pick an angle, drag across the picture, use the slider or the arrow keys, or press **Rotate** to turn the model through the views by itself (it holds still for people who ask their device for reduced motion). **Rotate is a turn through four still pictures, not a 3D model**; the walk is the real motion.

The walk needs a video model: set `LAB_VIDEO_PROVIDER=openai` with the OpenAI key (`LAB_VIDEO_MODEL`, default `sora-2`; `LAB_VIDEO_SECONDS`, default 8; `LAB_VIDEO_SIZE`, default 720x1280). With none connected the board says so and the rest still works. **The walk adapter has been written against OpenAI's videos API and tested only against a stand-in; the first real run may need its model name or options adjusted.**

Limits: `LAB_DAILY_VIEWS` (default 80 images a day), `LAB_DAILY_WALKS` (default 6), `LAB_MODEL_SIZE` (the on-model picture size, default 1024x1536). Each view is one image-model call, so a full concept is six, and the board's button says how many it will make.

API (all inside the Design Lab module): `GET /v1/lab/assortment?plan=&status=`, `POST /v1/lab/assortment/views {plan?, ids?}`, `POST /v1/lab/concepts/:id/views {kinds?, redo?}`, `GET /v1/lab/concepts/:id/views`, `GET /v1/lab/concepts/:id/views/:kind[?thumb=1]` (kind is `picture`, a view, or `walk`), `POST /v1/lab/concepts/:id/walk`.

## Where the logo and graphics go (placement)
The image model draws the piece anywhere in the frame, so fixed positions put marks off the garment or crooked. After the picture is drawn, a vision model (Claude, `ANTHROPIC_API_KEY`) looks at it and measures, for each mark, where it belongs on the item, how wide it should be and the angle of the cloth there (`src/lab-place.js`). It draws nothing: the marks are our own artwork, laid on at those measurements, turned to follow the cloth, kept inside the item's outline and away from handles, straps and zips. Its answer is sanity-checked (inside the item's box, a size near the hint, an angle within 35 degrees); with no key, an error or a nonsense answer the fixed positions are used. The plain picture is kept (`lab_concepts.raw`), so **Place the logo and graphics again** (on a concept) redoes only the placement, with no new picture. Concepts drawn before this was added have no plain copy: press **Redraw the picture** once. Limits: the marks follow the cloth's slope with a turn, not a full perspective warp, so a strongly three-quarter chest can still sit a little flat.

## Notes on using the Lab
- Questions the page asks (steering notes, reasons, revisions) now open in an in-page box. The browser's own `prompt()` can be switched off, which made those buttons do nothing.
- Pictures and views are revalidated with a tag every time they are fetched, so a redrawn picture or a redrawn view is never shown from the browser's old copy (before, a redraw could look like it had done nothing for five minutes).
- On the assortment board, **On model** shows the concept's own picture, labelled "Not made yet", until the on-model views are drawn with **Make missing views**; no extra service setting is needed for the stills (they use the same image model and key as the concept pictures). Failed views show their reason under the board's button.

## Graphics as real artwork
Graphics used to be simple shapes the assistant drew as SVG, which came out thin (a lone "1" on a tote). Now Claude writes each graphic as a brief (the idea, the layers from back to front, the colour of each, every line of lettering, the program's style such as "faded vintage tour tee, cracked ink") and the image model draws it as finished, multi-colour, layered artwork on a transparent background (`src/lab-art.js`, stored in `lab_art`).
- **Graphic program:** Develop the graphic program writes the program, then draws each motif's artwork in the background, one at a time; the plan page fills them in as they land. **Draw again** on a motif redraws just that one.
- **Concepts:** a concept that applies a motif uses its artwork; a new graphic is described in words and drawn when the concept is made. The image model then **prints the artwork on the piece** (it is given the artwork as a reference and told to reproduce it exactly, following the cloth), and our logo is laid on afterwards as before. **Redraw the picture** on an older concept gives its simple-shape graphics real artwork first.
- **Tech pack:** the artwork PNGs go into the Art tab with the logo and woven label.
- Every word is ours: words naming another brand are removed before drawing, and the prompt forbids imitating any existing logo, band, team, character or mascot. Check the spelling of the lettering on each artwork; image models usually get it right but not always.
- Limits: `LAB_DAILY_ART` (default 40 artworks a day). Each artwork is one image-model call.
- The "broken JSON" error on Make concepts came from the answer being cut off (the concepts carried hand-drawn SVG, and the room for the answer was small). Concepts no longer carry drawings, have more room, and a malformed answer is asked for once more before the error is shown.

## Logo placement rules, removing marks, the walk
- The logo goes where the concept says (its "Where the logo goes" text), not a fixed spot per category. A place the front picture cannot show (the back, the inside, the lining, under a flap) is left off the picture instead of being moved: the vision model answers "not visible" and the mark is skipped. Trousers default to the front right hip below the waistband (they used to default to "back pocket or hem", which put marks on the cuff).
- **No logo:** the Logo menu has "No logo on this piece". Saving a change to the logo or removing a graphic updates the picture straight away (placement only, no new picture). A graphic the image model printed into the picture needs **Redraw the picture** to come off; the page says so.
- Redraw and Place again report their progress and result right under the two buttons (they used to report at the bottom of the dialog, out of sight).
- **The walk:** the video model refuses reference pictures with a face, so the walk now starts from the on-model front view cropped from the shoulders down, framed without the face; if the picture is still refused, the walk is made from words alone. A failed walk shows its reason in the viewer.

## Adding pieces from photos and screenshots
The library takes pictures as well as links: **Add photos or screenshots** under the library (choose several at once), drop pictures on the library, or paste a screenshot anywhere on the Lab page. Each picture is shrunk in the browser, sent on its own (`POST /v1/lab/items/photo`), read by a vision model into the same facts a shop listing gives (name, category, shape, fabric, fit, colours, details, the graphics on it, and the brand when it is plainly shown), and added as a **saved** piece. An optional Brand field tags the batch; a brand on the watchlist is matched by name, any other is kept as a label. The picture is kept (`lab_items.photo`, full size at `GET /v1/lab/items/:id/photo`; the card shows a small copy) and the piece is used by trends, plans and concepts like any other. With no Claude key the picture is still added, just without the facts.

## The studio: finishing a concept by hand and with AI

**Open in the studio** on a concept (or on its card in the assortment viewer) opens `/lab/studio?concept=<id>`. It is a layered editor that runs in the page itself, with no outside software.

- **Layers.** The concept's picture is the base layer. You can add type, shapes, paintings, our marks (cue mark, wordmark, lockup), the concept's own graphics, and your own pictures (button, drop or paste). Each layer can be hidden, locked, reordered, duplicated or deleted. It has an opacity and a blend mode. **Multiply** makes a print take the fabric's folds, and **Sit it in the fabric** sets that with a little wear in one click.
- **By hand.**
  - **Brush:** paints on a painting layer, or starts a new one.
  - **Eraser:** rubs out any picture layer.
  - **Distress brush:** wears a layer away, like an old print.
  - **Type** and **shapes:** stay editable. Type can be bold or italic, spaced, outlined and **arched** (for a college or rock-tee arc). **Turn into pixels** lets you paint on type or a shape and rub it out.
  - **Eyedropper:** picks a colour from the picture.
  - Undo and redo cover every step.
- **Colour.** Every layer has hue, saturation, brightness and contrast. **Recolour** turns a mark or graphic into one colour. The swatches are the Future Basics colours and the plan's graphic-program palette; clicking one with a layer selected colours that layer.
- **Distress.** Every layer has an even wear: a worn print (specks and grain), cracked ink, or faded and washed out. You set the amount and grain size, and **Another pattern** gives a new one.
- **AI.**
  - **Change the piece:** sends everything visible to the image model with your words. With an area painted first (the area tool), only that area changes, and the answer is clipped to it so the rest stays exactly as it was.
  - **Make a graphic:** draws a new graphic on a clear background.
  - Either way the result comes back as a new layer on top, so nothing you made is lost. Prompts that name another brand are refused, the same as the rest of the Lab.
- **Saving.**
  - **Save** (Ctrl S) keeps the layers with the concept, and the studio also saves on its own while there are changes. Reopening the studio brings the design back exactly as it was saved.
  - **Use as the concept picture** makes everything visible the concept's picture. Its views are drawn again from it, and an approved concept goes back to draft.
  - The picture from before the studio is kept: **Put the old picture back** restores it.
  - After that, the logo and graphics are part of the picture, so **Place the logo and graphics again** says to move them in the studio instead.
- **Export.**
  - **Picture (PNG)** at full size.
  - **The selected layer (PNG)** with a clear background, for a print file.
  - **Layers for Illustrator (SVG)**, one group per layer. Plain type and shapes stay live vectors; anything recoloured partly, adjusted or distressed is placed as its picture.
- Fonts other than Space Grotesk and IBM Plex Mono are the computer's own (serif, slab, condensed, script, typewriter), so they can look slightly different on another machine. The SVG names the font.
- Routes: `src/lab-studio-routes.js` (`GET/PUT /v1/lab/concepts/:id/studio`, `GET …/studio/plain`, `POST …/studio/ai`, `POST …/studio/apply`, `POST …/studio/restore`). The page is `src/lab-studio.html`, and the table is `lab_studio_docs`. A saved design can be up to 30 MB and 80 layers. A layer's picture can only come from the design itself, a Lab graphic or one of our marks, never from an outside address.

## Graphics and techniques: the library

**Graphics and techniques** (a Lab tab, `/lab/library`) is where everything we have made lives, so it can be used on any piece later.

### Graphics
- **Every graphic is kept.** That covers graphics drawn for a line plan's program, for a concept, in the studio, drawn here, and our own uploads. They stay in the library even when the plan or concept they were made for is deleted.
- **Draw a new graphic.** Say what it is, the words on it (spelled exactly), the ink colours, a style, and what it is **made for**. The technique's design rules (line weights, number of colours) go to the image model. One to three takes at a time. Other brands' names are refused.
- **Add our own artwork** (PNG, JPEG or WebP). Transparency is kept.
- **Find and manage.**
  - Search by words, tag, where it came from, or technique.
  - Open a graphic to see it on fabric (jersey, fleece, twill, canvas, denim, any colour), made as any technique.
  - Rename and tag it, give it its usual technique, download it, or **put it on a concept**: where it goes and how it is made. It is placed on the concept's picture straight away.
  - **Take out of the library** hides it. Pieces that use it keep it.

### Techniques
- **The starting set** (all of them can be changed):
  - Embroidery: satin stitch, 3D puff, chain stitch, fill stitch.
  - Print: plastisol, water-based or discharge, vintage cracked, puff print, halftone, foil.
  - Heat transfer: glossy, soft-touch matte, reflective.
  - Patches: chenille, woven, rubber, deboss.
  - Wear: worn-in, sun-faded, heavily distressed.
- **What each technique holds:**
  - **How it looks here.** The page draws it straight away and for free (`src/lab-finish.js`): stitches with thread sheen, raised puff and rubber with light and shadow, ink grain, soaked-in ink, halftone dots, metal foil, glossy film, chenille pile, woven threads, a pressed-in deboss. Each has strength, direction, how raised it is, shine, blend, opacity, saturation and wear.
  - **How the real thing looks**: the words the image model gets for **Make it real**.
  - **How to design artwork for it**: given to the image model whenever a graphic is drawn for this technique.
  - **A note for the factory.**
  - **Up to four reference photos** of the real thing. They go to the image model next to the piece, so it matches real thread, ink or film.
- **Make it real** (on the technique) makes the mock-up on fabric into a photograph of the real thing. It is kept as the technique's sample.
- You can change, **duplicate** (photos and all) or delete any technique, or add a new one.

### Using them on pieces
- **In a concept:** **Add from the graphics library** (under the graphics) adds one: choose where it goes and how it is made. It is placed on the picture, and its technique goes on the tech pack (the graphic's artwork file is labelled with it).
- **In the studio:**
  - The Add tab lists the library.
  - Any layer can be **made as** a technique. It shows at once, and stitches and dots keep a real size at any scale.
  - **Make it real with AI** asks the image model for the real technique inside that layer's area only, with the technique's words and reference photos. The result comes back as a new top layer.
  - **Save to the library** keeps a layer's artwork for other pieces.
  - Graphics made in the studio's AI tab go into the library on their own, made for the chosen technique.
- Routes: `src/lab-library-routes.js` (`/v1/lab/library/graphics…`, `/v1/lab/library/techniques…`, `POST /v1/lab/concepts/:id/graphics`). The techniques and the starting set are in `src/lab-library.js`, the drawing is in `src/lab-finish.js` (served as `/lab/finish.js`), and the page is `src/lab-library.html`. Tables: `lab_art` (with `in_library`, `tags`, `source`, `technique_id`), `lab_techniques` and `lab_technique_photos`.

## Flats and placement, and "can it be made?"

**Flats and placement** (in the concept window, `/lab/flats?concept=<id>`) draws the piece as measured technical flats, front and back, the way a factory reads them. Nothing on it is drawn by an image model.

- **The drawing is a professional flat sketch** from the flat-sketch pack Future Basics bought (Kyle's Google Drive, "Mens Sketches" and "Hats"): 29 sketches across tees, long sleeves, crewnecks, hoodies, zip hoodies, jackets, pants, shorts and the six-panel cap. Each piece starts on the sketch that fits its words and fit (a boxy tee on the boxy tee, a cargo pant on the cargo pant); **Drawing** on the Garment tab picks another, or **Simple outline** for the drawing built from the measurements. Beanies and totes have no sketch yet and use the simple outline.
- **The sketch is lined up with the measurements.** For each sketch, `scripts/flat-templates/build.mjs` finds the front and back views on the page and measures them: the centre line, the chest between the side seams (or the waistband, or the cap's crown), the high point of the shoulder (or the top of the waistband, or the brim seam) and the hem. The page scales the sketch so its chest or waist matches the piece's, and its length too, held within 12% so it never looks stretched. Placements are measured from the same points, and the checks (collar, zip, pocket, seams, edges) work from the measurements, so they agree with the spec whatever the sketch.
- The sketches live in `src/flat-templates/` and what was measured in `src/lab-flat-templates.js` (generated: change the script and run `node scripts/flat-templates/build.mjs <folder of the downloaded SVGs>`; `PROOF_DIR=<folder>` writes a picture of each sketch with its measurements marked, to check by eye). The pack is licensed to Future Basics: keep the repository private, and the sketches are served only to the Design Lab pages (`/lab/flat-templates/<file>`). The spec sheet and the tech-pack pictures carry the sketch inside the file.

- **Styles.** T-shirt, long-sleeve tee, crewneck sweatshirt, pullover hoodie, zip hoodie, zip jacket, pants, shorts, six-panel cap, cuffed beanie and tote.
  - The style, fit (slim, regular, relaxed, boxy, oversized, wide) and details (dropped shoulder, cropped, pleats, pockets, drawcords) are read from the concept's words.
  - Change any of them on the Garment tab. Every sample-size (M) measurement can be typed in.
  - Other categories say they are not drawn yet.
- **Placements.**
  - The concept's logo and graphics start where the concept says: left chest, full front, back, sleeve, and so on. A logo that would land on a graphic goes to the back neck instead.
  - Drag one to move it, or type its width, its distance from the centre and its top edge.
  - Each says where it is the way a sample room measures it, for example: "6 in (15.2 cm) below the HPS, centre 4 in from the CF toward the wearer's left". On the front, the viewer's right is the wearer's left.
  - Add our marks or any library graphic. Each placement has its technique.
- **The check** (live as you work, and kept on save):
  - **On the piece.** It sits on the piece and clear of seams, by the technique's distance.
  - **Clear of construction.** It does not cross:
    - the collar, a rib hem or cuff;
    - a zip, a fly, a waistband or the crotch;
    - a pocket (that one is a warning);
    - a brim seam or the beanie's fold.
  - **Within the technique's size**: the hoop or the platen.
  - **The artwork at its placed size:**
    - **Fine detail:** the share finer than the technique's finest line, with the size at which it would hold;
    - **Inks:** more inks or threads than the technique is priced for;
    - **Shading:** smooth shading a screen cannot print without halftones;
    - **Stitches:** for embroidery, a stitch count.
  - **Overlaps:** two placements on top of each other.
  - Problems are marked "cannot be made as drawn", "check" or "ready".
- **What each technique can make** is set in the library (Graphics and techniques, a technique, "What it can make"): finest line in mm, inks or threads it is priced for, largest width and height, room from seams, and stitches per square inch for embroidery. The starting set comes filled in.
- **Approval.** While the saved flats have problems that stop the piece being made, approving it asks why it is fine anyway, and the reason is kept on the concept. This works like the "too close" check.
- **The spec sheet** (17 × 11 in, print or save as PDF) has:
  - both flats with every placement measured;
  - a placement list, each with its technique, size and plain-words position;
  - the points of measure, graded XS to XXL with tolerances;
  - the check's verdict.
- **The tech pack.** When an approved concept becomes a tech pack, the spec sheet and the front and back flats go into its artwork. **Add to the tech pack** on the flats page adds them again after a change.
- Routes: `src/lab-flats-routes.js` (`GET/PUT /v1/lab/concepts/:id/flats`, `POST …/flats/check`, `GET …/flats/sheet.svg`, `POST …/flats/tech-pack`). The templates, measurements, grading, wording and drawing checks are in `src/lab-flats.js`, shared with the page as `/lab/flats.js`. The page is `src/lab-flats.html`, and the table is `lab_flats` (with `lab_techniques.rules`).

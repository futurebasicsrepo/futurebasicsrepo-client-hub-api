# Design Lab

The whole route from a line plan to a corrected sample, and the design service for clients, is in [design-to-factory.md](design-to-factory.md).

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

## Finding your way round

The Design Lab is one section of the work console (`docs/work-console-nav.md`). Its parts are the tabs across the top of every Lab page, in the
order the work goes: **Line plans · Concepts · Studio · Assortment · Sketch pack · Graphics & techniques · Materials · Research**. Each is
its own page: on `/lab`, Line plans, Concepts, Assortment and Research each show on their own. A client in their own Lab gets the same row
(`src/lab-nav.js`, served as `/lab/nav.js`), with **← Your hub** first and no Research. Opening the Studio from the tabs, without a concept,
shows a concept picker, including the concepts that already have a tech pack.

**A piece's step bar.** Wherever a concept is open, the same bar says where it is in the work and makes every step one press away:

  ‹ *its line plan*    **Concept · Picture · Flats · Pattern · Tech pack**

- It is at the top of the concept (the concept window on `/lab`), in the Studio's toolbar (in place of the old **Lab ▾** menu and
  **← Concepts**), and under the tech pack's breadcrumb.
- In the Studio, **Picture**, **Flats** and **Pattern** switch the view in place; on the flats, **Front** and **Back** sit beside it.
- **Tech pack** opens the pack once there is one. Before that, in the Studio it opens the checklist that says what is still needed.
- The step you are on is dark; on a phone the bar scrolls so it stays in sight.
- The ‹ link goes back to the concept's own line plan (`/lab?plan=…`), not the top of the Lab.
- It is `FBLabNav.steps(el, concept, { at, onStep })` in `src/lab-nav.js`. The Studio's data (`GET /v1/lab/concepts/:id/studio`) and the tech pack's (`lab`) carry the plan and the pack it needs.

So line plan → concept → Studio → pattern → tech pack is one press per step.

**The Studio's name** is the Studio everywhere: the tab, its title, "Open in the Studio" on a concept and a sketch.

**On a phone** the Studio's toolbar keeps the step bar, the piece's name, Save and the panel; the rest folds behind **More**. The Pattern view
keeps what to show, Explode it and the size, and folds editing and the files the same way.

**New design: one way in.** Staff and clients start a piece the same way: **+ New design** leads the Design Lab's row of tabs (the console's for staff, the Lab's own row for a client), sits on an empty Concepts page and in the Studio's concept picker, and leads the hub's Design Lab pills (`/lab?new=1` opens it on any Lab page). It offers:
- **With AI:** what it is, a category and a few optional words. The piece is added to the room's own *Quick concepts* plan (made the first time; staff use one with no room) and 1–4 concepts are drawn for it, then the board opens on that plan.
- **From a sketch:** the sketch pack (below).
- **From scratch:** the Studio's blank-page form, focused (`/lab/studio?start=scratch`).
- **A whole line:** Line plans, where the assistant drafts a season's pieces.
- **Carry on:** every concept.

The launcher lives in `src/lab-nav.js` (`FBLabNav.openNew()`); anything marked `data-new-design` opens it.

**The sketch pack** (`/lab/sketches`): every flat sketch we draw from, searchable and filtered by range (men's, women's, accessories) and style. Its **Catalogue** tab lists the supplier's 1,846 products to start from, with no prices (see "The Catalogue" below). Picking a sketch opens it in a sheet over the gallery (from the side on a wide screen, from the bottom on a phone), so nobody scrolls to find what to do next. In the sheet:

1. **Cloth.** The room's fabrics as swatches, or **Decide later**. A cloth starts in its own first colour.
2. **Colour.** The cloth's own colours first, then a house set, then any colour from the wheel. The sketch is redrawn in the colour as it is picked (its white cloth swapped for it).
3. **Open in the Studio.** Starts a new concept from that sketch (its name, category and silhouette from the sketch; no plan and no AI; `POST /v1/lab/concepts/from-sketch {template, colour?: {name, hex}}`), puts the cloth on it as its main fabric in that colour (`POST /v1/lab/concepts/:id/materials`), and opens the Studio on its front flat at the sketch's proportions, drawn in the colour (the flats start in `spec.color` until they are saved).

**Or put this sketch on a concept you already have** (folded at the foot of the sheet) opens that concept in the Studio on its flat front, drawn from the sketch (`/lab/studio?concept=…&view=front&template=…`). A second shelf shows the parts (pockets, zips, collars, trims, buttons).

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

## Self-serve: a client's room buys the Lab

A client can open the Design Lab on their own room, from the hub, for a fixed price plus a metered part (`src/lab-access.js`, `src/lab-selfserve-routes.js`).

**What they get.** The studio, the flats and the libraries, on their own work: line plans, concepts, the studio, flats, the graphics they draw or upload, their fonts, the decoration quotes they record. Tech packs are included while the Lab is open (a photo pack is never locked for a room with the Lab: its `billing` reads `lab`). The research side (the brands we watch, the pieces we found, what's moving, the brand code), the Future Basics taste and the client list stay Future Basics only; the room's libraries hold only its own work plus the read-only starter set (see *A room's team, and the libraries it shares*).

**How the price works: fixed + variable.** A fee opens the Lab for a period and includes a handful of AI generations. Past them each generation is metered: a picture counts as one, the on-model views one each, a walk four, a 3D try-on three (`UNITS`). The unbilled part is invoiced in rounds (a Shopify draft order tagged `fb-design-lab-ai`, emailed to the client, also on their hub card) once it reaches the billing round; generations pause when the room owes more than the cap, and continue once the open invoice is paid. Each access row keeps the numbers it was sold at, so a price change never moves a live room.

**Buying it.** The hub's Design Lab card shows the offer and opens a Shopify checkout (a draft order tagged `fb-design-lab`). The payment sync recognises the order by its tag and opens the Lab; the hub's "I have paid" asks straight away. With Shopify not connected, the card says payments are not set up, and staff open the Lab from the room instead (**Give access** on the client's room in the console, with the days, the included generations, the price and the cap as fields when they should differ). Staff can also end it, invoice the unbilled generations now, and mark an invoice paid by other means.

**Scoping.** Every Lab route runs the gate (`labAccess.gate`) instead of `adminOnly`: staff pass as before; a client passes while their access is live and then `req.lab.clientId` scopes the lists (plans, concepts, graphics, fonts, decoration quotes) and the gate checks that the `:id` in the url (a concept, a plan, a graphic, a font, a quote, a poll) belongs to their room. `client_id` is kept on `lab_concepts`, `lab_art`, `lab_fonts` and `lab_decor_quotes` by triggers from the plan, so a plan moved to a client carries its concepts and artwork with it.

**In the hub.** Once the Lab is open, the hub's Design Lab section is part of the room, not a page apart: the Lab's tools as pills (Line plans and concepts, Studio, Sketches, Graphics and techniques, Materials and trims), then the room's line plans as project cards like the room's projects (season, pieces, status, last change; **Open line plan** goes to `/lab?plan=<id>`, which opens and folds the list to that plan), and a **New line plan** card. Past six plans a link leads to all of them.

**In the work console.** The client's room in Work shows the same design work (`GET /v1/admin/clients/:id/design`): the Overview carries the room's line plans as project cards, and the rail's **Design Lab** item carries everything, drawn as the hub draws it. That means the Lab's tools as pills, every line plan on the room as a card, and every concept as a card with the client's say on it: approved, changes asked for with their note, or already a tech pack. Each plan card says who made it (the client, or Future Basics for them) and whether it is shared yet. The concepts filter to the changes the client asked for, the ones they approved, the tech packs and the ones still in design; the rail says how many changes are waiting. Each card opens in the Lab, and a tech pack opens in the room.

**In the Lab, by room.** Staff see every room's line plans; each names its room (or Future Basics), and the list narrows to one room with the Rooms menu or `/lab?client=<id>` (`client=none` for Future Basics' own). The room's **Line plans for this room** pill opens the Lab that way.

**Estimates.** Every cost the Lab shows a client (the plan's cost column, the decoration costs on the flats and the decoration sheet, the studio check, the tech pack's cost block) says it is an estimate: the factory's quote confirms it.

**Make it.** On a client's tech pack a **Make it** tab offers two ways to production: **Ask Future Basics to make this** (a request with a quantity and a note; it lands on Production attention in the console and emails the team; staff answer it from the client's room: *we are pricing it*, *order placed*, or *decline*, each with a word to the client), and **Send it to your own factory** (a private quotation link to the published pack, with the quote form, emailed to the factory if an address is given; what the factory sends back shows on the tab; up to twelve links open at a time). An unpublished pack cannot be sent out: Future Basics reviews it first.

**Pages.** The Lab pages accept the client's hub token (`fb.client.token`) as well as the staff one; in client mode the research side and the console's side menu are gone, the Lab's own menu leads back to the hub, and the technique editor is hidden. The hub has a **Design Lab** link and card (the offer, or the meter and the open invoices). The public pricing page carries the Lab as a third design tier, from `/v1/pricing`.

| Setting | |
| --- | --- |
| `DESIGN_LAB_SELF_SERVE` | `off` hides the offer and refuses the checkout (staff can still give access) |
| `DESIGN_LAB_PRICE_CENTS` | the fee (default 49900) |
| `DESIGN_LAB_DAYS` | the period (default 90) |
| `DESIGN_LAB_INCLUDED_AI` | generations included (default 40) |
| `DESIGN_LAB_AI_PRICE_CENTS` | a generation past them (default 250) |
| `DESIGN_LAB_AI_BILL_AT_CENTS` | the billing round (default 2500) |
| `DESIGN_LAB_AI_UNPAID_CAP_CENTS` | generations pause past this much owed (default 15000; 0 for no cap) |

**A failed generation is not counted.** Every AI step records its charge on the request. If the step then fails (the image model errors or times out, or the server fails after the charge), the response is a server error and the charge is given back (`refund` in `src/lab-access.js`, run for every Lab response of 500 or above). Nothing failed counts against the included generations or is billed.

Routes: `GET /v1/client/lab`, `POST /v1/client/lab/checkout`, `POST /v1/client/lab/landed`, `POST /v1/client/lab/invoices/:id/landed`, `GET /v1/client/lab/usage`; `GET /v1/products/:id/make`, `POST /v1/products/:id/make-request`, `POST|DELETE /v1/products/:id/quote-links[/:sid]`; staff `GET|PATCH /v1/admin/clients/:id/lab` (`comp`, `end`, `bill`), `POST /v1/admin/lab/invoices/:id/paid`, `GET|PATCH /v1/admin/make-requests[/:id]`. Tables: `lab_access`, `lab_ai_usage`, `lab_ai_invoices`, `make_requests`. Tests: `test/lab-access.test.js`, journey J232.

**The flat follows the picture.** A concept's flat is drawn as the garment its picture shows: the vision model reads the picture (cached per picture) for the garment type, its fit and the colour of its main cloth, and the picture wins over the line's category, so a trucker jacket in a Tops line is drawn from a jacket sketch in its denim colour, not as a sweatshirt. The words still decide when there is no picture, and a jacket is a jacket in any line (trucker, bomber, chore coat, shacket, anorak…). A flat saved before as another garment says so above the drawing (**The picture shows a … ; this flat is drawn as a …**) with **Redraw from the picture**: the garment, fit and colour come from the picture, the graphics come along, and nothing is kept until Save. `GET /v1/lab/concepts/:id/flats/from-picture`.

**Removing a graphic from the flat** takes it off the garment on the picture too (one record): it stays a layer on the picture, and the next save no longer puts it back on the flats.

**Charges off for a room.** On a room in the work console, **Design Lab charges** is a switch like free tech pack access. Switched on (charges off), the room's Lab is open at once with no fee and no end date; AI generations are counted but never billed or paused, and tech packs come with the open Lab. An invoice raised before stays owed. Switched back off, a room with no paid period sees the offer again; its plans and concepts stay. Stored as `clients.lab_free`; `PATCH /v1/admin/clients/:id/lab {action: 'free'|'charge'}`, written on the room's record.

**Inviting a designer.** On a room in the work console, **Invite a designer** takes an email: the address may then sign in to the room (it is added to the room's allowed emails, as a teammate added from the hub is), the invite is on the room's record, and the designer gets the welcome by email: how to keep the Lab on an iPad's home screen, how to sign in with the emailed code, and the ways in: New design, the Studio with its Board, ⌘K and the pen, the Embroidery check, the Checklist and the pack's Production files. An address that already signs in to another room is refused (one person, one room). `POST /v1/admin/clients/:id/lab/invite {email, name?}`.

**Who opens this room.** A person is in one room at a time, and the hub opens the room their session holds, so a charges switch flipped on one room never reaches someone whose hub opens another. Under the switch, the console lists any address on the room (its list, its contact, its team) that opens a different room, by name, with **Move them here**: the address comes off every other room's list and onto this one, their user moves here, and the session they hold on the old room ends ("Your room changed. Sign in again", code `MOVED`); signing in again opens this room. A room that is not active takes nobody. When two rooms could take an address at sign-in, the room that lists it wins over one that only claims its domain, then the room the person is already in, then the oldest. `GET /v1/admin/clients/:id/lab/people`, `POST /v1/admin/clients/:id/lab/people/move {email}`.

**How to start.** The first time a client's designer opens the Lab, a short welcome shows the same steps (New design, the Studio and its Board, drawing with the pen and ⌘K, the Embroidery check, Simple or Pro, the Checklist to the tech pack and its Production files) (the iPad step is left out once the Lab runs from the home screen). **Got it** puts it away; **How to start** in the Lab's header brings it back.

## The Studio's production tools (a product and its packaging)

The tools a designer reaches for in Illustrator when artwork has to become a physical product or its pack, on the same keys (`src/lab-studio-ill.js`). They are in **Pro**, on the rail, in ⌘K, and under **Document** in the top bar.

| Tool | Keys | What it does |
| --- | --- | --- |
| Select · Edit points · Pen | V · A · P | Move whole layers; drag single points and handles; draw paths (these were already there) |
| Artboards | ⇧O | One board per face of a pack, drawn on the picture, sized in mm or inches with its bleed (red, outside the trim). **Document → Artboards → Lay out the box** turns length, width, depth and glue flap into seven faces at their real size, with the dieline as a magenta cut path |
| Divide · Shape builder | ⇧M | Divide cuts overlapping shapes into every piece; the shape builder merges the pieces you drag across and takes away the one you Alt-click. Union, subtract, intersect and exclude were already there |
| Reflect · Scale | O · S | Mirror across a vertical, horizontal or angled axis; scale by a percentage, width and height apart, or to an exact size in mm or inches. Both can make a copy |
| Width | ⇧W | Drag at a point of a path to make the line thicker or thinner there, or choose a profile (taper, thin at one end, bulge) |
| Outline mode | ⌘Y | Only the bare paths and their points; a stray point shows red. **Document → Preflight** lists stray points, open filled paths, parts under 0.5 mm, lines under 0.1 mm, pictures under 150 pixels to the inch at their size, fonts to send, and masks that lost their shape; stray points go in one press |
| Measure · Info | ⇧U · ⌘U | Distance, angle and Δx/Δy between two points; Info shows where the pointer is and the size of what is chosen. mm or inches is set in Document |
| Symbols | | One master, many instances: change any instance and every other follows. Place more from Document → Symbols; unlink one to change it alone |
| Fills | | Linear and radial gradients (they stay gradients in the SVG), a four-corner mesh with a centre colour, and pattern fills tiled from another layer or from a tile the image model draws (it counts as one AI graphic) |
| Type on a path | ⇧T | Words that run along a path, an ellipse or a rectangle: font, size, start and spacing |
| Global swatches | | Named colours with their nearest Pantone C; a layer coloured from one changes when it does. Picking a colour by hand unlinks it |
| Clipping mask · Groups | ⌘7 · ⌥⌘7 · ⌘G · ⇧⌘G | The top shape clips the layers chosen under it (a clip path in the SVG); groups are chosen and moved together |
| 3D mockup | | The picture, or one artboard, on a can, a box (its faces from artboards named Front, Back, Left side, Right side, Top, Bottom), a bottle or a pouch; drag to turn it; save a picture |
| Package | | One zip for the vendor: the picture as PNG and SVG, each artboard with its bleed as PNG and SVG, every picture used at its own size, the fonts the Lab holds (Google fonts named), `colours.csv` with every colour's Pantone C, and `report.txt` with the sizes, the symbols and the preflight |

The ellipse moved to **L** and the line to **\\** to match Illustrator; showing and hiding the panel moved to **⌘\\**. Artboards, symbols and swatches are saved with the design (the server keeps them within bounds: 60 artboards, 200 symbols, 200 swatches); everything else new lives on the layer under `ill`. Journey J284 walks through all of it in a browser.

## On an iPad, with the Pencil

The Lab installs as its own home-screen app (`/lab.webmanifest`: standalone, opening on `/lab`; the Lab pages carry the Apple home-screen tags and icon). In Safari: Share, then Add to Home Screen. The installed app keeps its own sign-in: sign in once inside it with the emailed code.

| On the picture | What happens |
| --- | --- |
| The Pencil | draws, erases and distresses; pressing harder draws wider (**Pencil pressure** in the brush options); every sample it reports is used, so quick curves stay smooth |
| A finger, before any Pencil | draws like a mouse |
| A finger, once the Pencil has been used | moves the view; a palm resting on the screen paints nothing, and the Pencil wins over it |
| Two fingers | on the selected graphic (Select tool): resize it, turn it and move it, as one Undo step; anywhere else: pinch to zoom and move the view. A stroke a finger had started is undone |
| Handles | corners and the turn knob take a fingertip (a bigger target than for a mouse); the tool rail and zoom buttons are 46 px on a touch screen |

The flats zoom too: two fingers pinch and move them, one finger moves them once zoomed (a placement under the finger still drags), Ctrl and the wheel zoom on a computer, and **Fit** shows the whole piece again. A pinch that starts while a placement is being dragged puts it back where it was. On Design, and on any console page on a touch screen narrower than a desktop, the console menu starts folded to its icons (a person's own choice is kept). Installed, exports (the picture, a layer, the Illustrator SVG, the stitch file, the separations) open in the app's sheet with Share and Save rather than as a download that leaves the app.

**Nothing sits on the work.** Three things used to cover the drawing or the tools, and no longer do. Journey J301 checks each.

- The guide's mouse has the foot of the tool rail to itself: the rail keeps that room free, so its last tools scroll clear of it.
- The tool names (the rail's first button; on by default on a touch screen) are the tool's name only, and the tool in hand also says what
  it does. They ran 300 px over the garment on an iPad before.
- **Front** and **Back** under the Pattern's two views are written at about 12 px on the screen however far the drawing is zoomed out to
  fit. They were 6 px on a laptop.

**A short screen.** On a screen 800 px tall or less and over 980 px wide (a 13-inch laptop, a browser with its toolbars showing; not an iPad on its side, which is 820), the Studio's brand bar gives its 72 px to the work: the Studio's own bar and the left menu start at the top. It holds only the wordmark there, and the left menu's first icon goes home. On Pattern at 1280 by 720 the working area goes from 493 to 565 px tall. The pattern's frame is sized to the row it is given on a wide screen, so the end of the Pattern page is always in reach (it ran 29 px past the bottom of the screen when the bar wrapped to two rows). Journey J301 checks both, and the pattern's colours.

**Room to draw.** **Panel** (or `\`) folds the right-hand panel away, on the picture and on both flats, so the drawing takes the width. **Focus** (or `F`) hides the page header, the console menu and the Guide switch, and asks for full screen where the browser allows it. The drawing (the picture, a flat or the pattern) then takes the whole screen and everything else floats over it in Liquid Glass (frosted, translucent): the bar is a capsule along the top with the essentials (the views, the checklist, Save, More, Panel, Focus; More opens the rest; the steps, Undo and Redo, which are on the rail, step aside), the tool rail is the tool palette (below), the tool's options a capsule under the bar, the panel a card on the right, and the zoom buttons, the size dock and, on the flats, their own size, measurements and zoom bar (a capsule at the foot) are glass too. The picture fits into the room the glass leaves. Side by side keeps its columns. Both are kept on the device for the next time Design opens, and a second press brings them back.

**The tool palette** (`src/lab-studio-palette.js`, Focus only). In Focus the rail becomes a palette like a notes app's pencil case, the same
on the picture, a garment's flats and a bag's or a shoe's drawing:
- **Open**, it is one dark glass dock: Undo and Redo, then every tool laid out in the rail's groups (none hidden in a group, so Polygon,
  Star, Distress, Width, Measure and the rest are each one tap), the tool in hand lifted, a coloured tip on the tools that draw in the
  colour, and the size on the brush, the eraser, Distress and Liquify; then the colours (the last used, black, white and the brand's) and
  any colour; then a menu.
- **Where it sits**: drag it by its handle to the top (the default, under the options), the foot, the left or the right (on a side it stands
  upright); drop it in a corner, or choose Shrink in its menu, and it **shrinks to one round button** showing the tool in hand and its
  colour. Tap the button to open it again. Where it sits and whether it is shrunk are kept on the device.
- **On a bag's or a shoe's drawing** the tools that work only on the picture (the AI area, Distress, the ruler…) are dimmed and say so.
- It is the rail underneath: a tool or colour picked on the palette is the Studio's, with its options bar and size dock as before. The
  menu's **What each tool does** lists every tool with a line on what it does.

Outside Focus the rail stays as it is; with its names shown (the list button at its top) it lists every tool, not only the one in front of
each group. Journey J294.

**Nothing floats over anything** (Focus). The palette publishes the room it takes on its edge (`--pal-l`, `--pal-t`, `--pal-r`, `--pal-b`,
on the Studio and inside the flats and drawing frames), and the options bar, the side panel, the zoom, the size dock and the canvas keep
clear of it; the options bar also stops at the side panel. The palette shows only where its tools draw (the picture and the flats); on the
Pattern and Board views it stands aside, and in Focus the Pattern page floats its own bar at the foot in glass. The **No picture yet** prompt
takes a place in the Studio's bar on a wide screen, when the bar has the room on the rows it already has (the Flats and Pattern views on a
laptop); where it would cost the work a row, in Focus and on a narrow screen it floats above the bottom bars, in the room left of the
panel. Journeys J296 and J301.

**On the flats**, two fingers on a graphic resize it about its centre, keeping its shape (anywhere else they zoom the flat). What is drawn on a flat covers the whole window, not only the garment's frame: the drawing spans all the window shows at full view, and an older, smaller drawing grows to the window before the next stroke, keeping what is on it.

**Zoom.** Moving or zooming the picture does not put its layers together again each frame (that made pinches slow and jumpy). A trackpad pinch (Magic Keyboard), which Safari reports only as gesture events, zooms the picture or the flat under the pointer, and Safari's own page zoom (a pinch or double tap anywhere in Design) is turned off. The flats have − / % / + / Fit like the picture, a two-finger trackpad scroll moves a zoomed flat, and a pinch keeps the point between the fingers where it is. The flat is redrawn as it changes, so a finger's lift could reach an element no longer there and leave a finger "down" for ever, which threw every later pinch off: the flat's canvas now keeps every touch, and the first finger down clears any finger whose lift went missing.

**On the graphics chip.** The picture is drawn on the device's graphics chip (WebGL2, `src/lab-gl.js`) by default: the page and the picture are textures moved by one matrix a frame, so panning, pinching, turning and dragging a layer stay smooth on an iPad. **Draw on the graphics chip** in the Hand tool's options turns it off for that device (kept in `fb.studio.gl`), as does `?gl=0`; a browser without WebGL2, or one that loses the chip's context, draws on the canvas as before. While the flats or the pattern fill the workspace, the picture behind them and its layer list are not drawn (a logo or a size the flats' autosave carries back would otherwise redraw the embroidery look out of sight, a hitch mid-drag); they are drawn as the picture is shown again. `npm run perf` (and journey J291) measures both: everything on the canvas against its budgets, then the picture on the chip against its own (`scripts/perf/budgets.json`, "picture on the graphics chip"); `--gl 0` or `--gl 1` runs one.

**Scribble.** iPadOS can take a Pencil on a web page as handwriting (Scribble) or the start of a text selection, and then the stroke never reaches the drawing. The stage on the picture and the drawing layer on the flats hold the Pencil's own touches (`touchType` stylus) so they stay strokes; fingers are left alone.

**The same tools on the flats.** On Flat front and Flat back the tool rail and its options stay. Brush, eraser, distress, type, box, ring and line draw on the flat itself: one drawing per view, kept as a picture (`POST /v1/lab/concepts/:id/flats/markup`, a `lab_art` row with source `flat`) and laid over that view's box in inches (`markup: { template, front: { art, x, y, w, h }, back }` on the flat). So it zooms with the flat, and the spec sheet, the decoration sheet and the tech pack draw it. It is kept only with the sketch it was drawn on, and a view rubbed out completely is dropped at save. **Select** moves graphics as before, **Hand** moves the view, and **Paint the area for the AI** becomes the flat's AI box. Warp, pick and the ruler work on the picture only, so they step aside. Undo and Redo (and Ctrl Z) step through the strokes on the flat. The Pencil and finger rules are the picture's: once a Pencil is used, one finger moves the view and two fingers pinch.

The picture or the flats fill the screen (side by side was dropped: each wants the whole iPad). Installed, the spec sheet and the decoration sheet open inside the app with **Share or print** (Print, Save to Files, Mail, AirDrop) and **Save**, since a new window would leave the app.

## A room's team, and the libraries it shares

**The team.** Anyone on a client room can add teammates from the hub's **Team** section (`src/room-team-routes.js`): an email and, if they like, a name. The address joins the room's sign-in list, a user row is made for it, and the teammate gets an email with the way in; they sign in with a six-digit code like everyone else. Everyone on the team sees the whole room: projects, tech packs, files, messages, and the Design Lab with its plans, concepts and libraries. AI generations from the whole team count against the room's one meter. A room holds up to 25 people.
- An address that already signs in to another active room is refused: one person, one room. Future Basics addresses are refused too; staff already reach every room.
- **Taking someone off.** A teammate can take another off the team (not themselves, and never the owner, the room's contact address; Future Basics changes the owner from the console). Their session stops working at once (every client request checks, with a 20-second cache the team routes clear), and they cannot sign in again, even when the room's email domain would let them in. What they made stays, by name. Adding them again lets them back in.

**Who sees what.** There are two sides, kept apart:
- **Future Basics staff** (anyone signed in to the work console with the Lab) see everything: our own work and every client room's plans, concepts, graphics, fonts, materials and techniques. A client's row is marked with the room's name in the graphics, materials and techniques lists.
- **A client and their team** see only their own room's work. Our graphics, fonts and the materials and techniques we add never reach a room, and neither does another room's work. The one exception is the built-in **starter set** of materials and techniques (screen print, embroidery, the base fabrics and trims) that the flats and the costing need: a room reads and uses those, cannot change them, and can copy a starter technique into the room to make its own version.

| Library | A room sees | Future Basics staff see |
| --- | --- | --- |
| Graphics | what the team draws, uploads or makes in the studio | every graphic, every room's |
| Fonts | fonts the team uploads | every font |
| Materials, trims and tags | the team's own, plus the starter set (read-only) | every material, every room's |
| Techniques | the team's own and their copies, plus the starter set (read-only) | every technique, every room's |

The gate answers 404 to a room asking for anything outside this, by list, by id or by a query parameter. `lab_materials` and `lab_techniques` carry `client_id` (null for ours, `builtin` for the starter set), and the flats and studio list only the techniques a piece's room may use: a client's piece gets its room's own plus the starter set, one of ours gets all of ours.

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
- **Flats:** front and back, laid flat on white (a cap or bag standing alone). A shoe's two flats are its **side profile** (the outside, toe to the right, square to the camera, so the pattern can read its outline) and its **heel** from behind.
- **Design sheet** (shoes and bags): one wide board (1536 × 1024) drawn from the concept picture, the way designers present a design. A shoe: a large side profile at its true proportions, the top, the outsole and the heel. A bag: a large front, then the back, the side and the open top. Four small colourways of the same shape along the bottom. No text on it.
- **On model:** an adult man, front, three-quarter, side and back, framed for the product (full length for clothes, head and shoulders for headwear, lower legs for footwear, knees up for bags). Pieces with nobody wearing them (home and objects) get flats only.
- **A walk** (optional): a short clip of the front on-model view walking toward the camera and turning.

Every view is drawn by the image model **from the concept's own picture** (and the flat, and then the front on-model view, so the same man and outfit carry through the angles), with instructions to keep the shape, colours, logo and graphics exactly and to add no new marks. Views are made in the background, one concept at a time; the board shows the concept's own picture until a view lands and refreshes itself. **Make missing views** does the whole board (or the chosen plan); a concept's viewer can draw its views again. Redrawing a concept's picture deletes its views, because they were drawn from the old one.

The board has a **Flats / On model / Both** switch (remembered) and an **In play / Approved / All** filter (rejected concepts are off the board unless asked for). Opening a tile shows the viewer: pick an angle, drag across the picture, use the slider or the arrow keys, or press **Rotate** to turn the model through the views by itself (it holds still for people who ask their device for reduced motion). **Rotate is a turn through four still pictures, not a 3D model**; the walk is the real motion.

The walk needs a video model. With a Google AI key (`GEMINI_API_KEY`, or the `google_ai_studio` variable) it is made by Google's Veo (`GEMINI_VIDEO_MODEL`, default `veo-3.1-generate-preview`; `LAB_VIDEO_SECONDS` 4, 6 or 8, default 8; `LAB_VIDEO_ASPECT`, default 9:16), in place of OpenAI's video model, which OpenAI shut down on 24 September 2026. `LAB_VIDEO_PROVIDER=off` switches it off. With none connected the board says so and the rest still works. **The Veo adapter (`src/google-ai.js`) is tested against a stand-in; the first real run may need its model name or options adjusted.**

### Which image model draws what
Two image providers can be connected: OpenAI (`OPENAI_API_KEY`) and Google (`GEMINI_API_KEY`, taken as set; a looser name such as `google_ai_studio` is used only when its value looks like a Google API key). At start the server logs whether a key was found (and, if one is set but not used, why, without the key) and then whether Google accepts it (`google key check`). With both, `src/check.js` routes each job to the one that does it best, and the other takes over if the first fails:
- **Edits with reference pictures** (the picture drawn from the flats, on-model views, a print laid on a garment, the flat drawn from the picture, the studio's AI changes): Google's image model first (`GEMINI_IMAGE_MODEL`, default `gemini-3-pro-image-preview`, falling back to `gemini-2.5-flash-image`). It keeps the garment, logo and proportions it is given more faithfully.
- **Pictures from words alone** (artwork, a concept's first picture), **edits inside a painted mask** and **transparent artwork**: OpenAI first (Google's API takes no mask and draws on a ground).
- `IMAGE_EDIT_PROVIDER` and `IMAGE_GEN_PROVIDER` (`google` or `openai`) override the routing; `IMAGE_PROVIDER=google` uses Google only. The server says at start which variable the Google key came from and how jobs are routed (never the key).

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

## Design: the picture and its flats in one workspace

A concept is designed in one place, `/lab/studio?concept=<id>`. A switch in its bar shows the concept four ways:

| View | What it shows | Address |
| --- | --- | --- |
| **Picture** | the concept's picture as layers (below: the studio) | `/lab/studio?concept=<id>` |
| **Flat front** / **Flat back** | the measured flats with their own panel: Placements, Design, Garment, Measurements (see Flats and placement below) | `…&view=front`, `…&view=back` |

- **One header.** The concept's name, the Lab menu, one **Save** and the view switch are shared. The picture's buttons (Undo, Import, 3D, Export, Versions, Use as the concept picture) show with the picture; the flats' (Spec sheet, Decoration sheet, Send to the tech pack) show with the flats. Each side says whether it is saved.
- **One Save.** Save (or Ctrl S, on either side) saves unsaved flats first, then the picture. The picture's layers that have a place on the piece then go onto the flats at their size, and the flats reload with them.
- **The picture's graphics are on the flats when you look.** Switching from the picture to a flat puts its placed graphics on the flats first, without waiting for a save.
- **How it is built (pass 1).** The flats page (`src/lab-flats.html`) runs inside the workspace in a frame from the same site (`/lab/flats?concept=<id>&embed=full`, or `embed=compact` for side by side), loaded the first time a flat is shown. It exposes `window.FBFlats` (dirty, save, view, mode, the sheets) and calls the workspace's `window.FBDesign`. Opened on its own, `/lab/flats` sends you to the workspace; only that page may be framed, and only by the site itself (`frame-ancestors 'self'`). The next two passes are below.
- **On a phone** the picture or the flats fill the screen.

### One placement model: inches on the garment

Where a graphic goes and how big it is lives in one record: its placement on the flats, in inches from the high point of the shoulder and the centre front. A layer on the picture with a place on the garment (**Goes on**) is that placement drawn on the picture.

| You do this | The other side follows |
| --- | --- |
| Set a layer's width on the picture, or choose where it goes | The flats take its size and place on the next save, or when you switch to a flat |
| Change its width on the flats and save | The layer on the picture is resized to match (the flats keep eighths of an inch, so smaller gaps are left alone) |
| Take it off the flats and save | The layer stays on the picture, with no place on the garment, and does not come back on the next save |
| Save the picture while the flats have unsaved changes | The flats are saved first and their sizes taken, so nothing set on the flats is undone |

**Graphics added on the flats come onto the picture.** A logo or library graphic added on the flats (front) appears on the picture by itself once the flats are saved: at its size, placed from its inches at the picture's scale (the garment's top and centre in the picture are found from the base picture), with its place on the garment set. Move it to where it sits in the picture. On the next save the picture's layer takes the flats placement over (same spot), so from then on it is one record drawn on both. A layer taken off the picture comes off the flats and is not brought back (the picture remembers what it has taken: `doc.linked`). What came with the concept (its logo and graphics) is usually already drawn in its picture, so it waits for **Put on the picture** in the list below; back placements stay on the flats, since the picture shows the front.

The Layers panel lists **On the garment · in inches**: every placement on the flats, front or back, with its size and where it sits. One drawn from the picture chooses its layer; any other opens it on the flats.

### Simple and Pro

A switch in the header shows the essentials or every tool, on both sides. A client's room starts on **Simple** and Future Basics on **Pro**; the choice is remembered in the browser.

| | Simple | Pro adds |
| --- | --- | --- |
| Picture | select, move, brush, eraser, type, shapes, the AI area, Add, AI, layers, Export as a picture | distress, the ruler, warp, the colour picker, Illustrator import and export, colour separations |
| Flats | placements, the Design tab (colour, details, AI redraw), the Garment tab, placement measurements | the Measurements table, points of measure, stitch lines, artwork sizes per garment size |

### The checklist: before the tech pack

**Checklist** in the header (`GET /v1/lab/concepts/:id/ready`, `src/lab-ready.js`) shows how many of these are done, and opens a list with where to fix each:

| Item | Holds the tech pack up when |
| --- | --- |
| The concept picture | there is none yet |
| Graphics placed on the garment | never: a layer with no place is worth a look |
| The flats saved | they are not |
| It can be made as drawn | the flats check has problems (things to check are worth a look) |
| The main fabric chosen | no material is chosen (materials with no fabric are worth a look) |
| Our twist written down | it is missing: approval needs it |
| Not too close to what inspired it | never: shown when the check says too close |
| Approved | it is not |

When nothing holds it up, the list offers **Send to the tech pack**; once it is a tech pack, **Open the tech pack**.

### The studio: the picture, by hand and with AI

**Open in the Studio** on a concept (or **Picture** in its step bar) opens it on its picture. It is a layered editor that runs in the page itself, with no outside software.

- **Layers.** The concept's picture is the base layer. You can add type, shapes, paintings, our marks (cue mark, wordmark, lockup), the concept's own graphics, and your own pictures (button, drop or paste). Each layer can be hidden, locked, reordered, duplicated or deleted. It has an opacity and a blend mode. **Multiply** makes a print take the fabric's folds, and **Sit it in the fabric** sets that with a little wear in one click.
- **By hand.**
  - **Brush:** paints on a painting layer, or starts a new one.
  - **Eraser:** rubs out any picture layer.
  - **Distress brush:** wears a layer away, like an old print.
  - **Type** and **shapes:** stay editable. Type can be bold or italic, spaced, outlined and **arched** (for a college or rock-tee arc). **Turn into pixels** lets you paint on type or a shape and rub it out.
  - **Eyedropper:** picks a colour from the picture.
  - Undo and redo cover every step.
- **Working like a designer** (`src/lab-studio-pro.js`, served at `/lab/studio-pro.js`).
  - **Several layers at once.** Shift-click a layer on the picture or in the list to add it to the choice or take it away, drag a box on the empty picture (or over the garment photo) to choose every layer it touches, or press ⌘A. Chosen layers move, nudge (arrows, Shift for 10), duplicate (⌘D) and delete together. Esc chooses none.
  - **Smart guides.** A layer, or several, being dragged snaps its edges and middle to the picture's edges and middle and to every other layer's, with the line shown in magenta. Hold Alt to move freely.
  - **Align and space.** The bar above the picture, with the select tool, aligns the choice left, centre, right, top, middle or bottom (to each other, or to the picture when one layer is chosen) and spaces three or more evenly. The keys are Alt A, H, D, W, V and S.
  - **Where it is, typed.** X, Y, W and H are in the Place section, in inches once the picture has a size (pixels until then). They measure the ink, not the empty margin round type.
  - **⌘K** finds any command by name: tools, align, zoom, the views, every export, embroidery, Made as, versions, 3D, the sheets, New design. **?** lists every key. The tools already had one-letter keys: V, H, B, E, D, T, R, O, L, I, M, U and W.
- **Drawing with paths** (`src/lab-studio-vec.js`, served at `/lab/studio-vec.js`).
  - **The pen (P).** Click for a sharp point, drag for a curve (Shift keeps to 45°). Click the first point to close the shape, which fills it; Enter or Esc leaves it open; Backspace takes the last point back.
  - **Edit points (A).** Drag a point or one of its handles. A smooth point's handles stay in line; hold Alt to break them apart. Alt-click a point to make it sharp or smooth, click the line to add a point (the curve keeps its shape), and Delete takes the chosen point away. Pressing A on a rectangle, ellipse or line turns it into a path first.
  - **Turn into a path** (in a shape's settings) makes a rectangle, ellipse or line editable points, at the same size.
  - **Combine the shapes.** With two shapes or more chosen, the bar above the picture and the panel offer Union, Subtract (the ones on top cut out of the bottom one), Intersect and Exclude. The result is one path in the bottom shape's place and colour, filled even-odd, and undo brings the shapes back. The clipping is polygon-clipping (MIT), served from `/lab/vendor/polygon-clipping.js`. Curves are kept to within a third of a pixel, as points.
  - A path goes to Illustrator as an SVG `<path>`, and a group holding one path comes back from Illustrator as an editable path (M, L, H, V, C, S, Q, T and Z; a path with arcs comes in as a picture). A path is saved as `shape: 'path'` with `paths: [{ closed, nodes: [[x, y, inX, inY, outX, outY]] }]` round the layer's centre; the server takes up to 40,000 points a layer.
- **The flats panel is where the work is done** (`src/lab-flats.html`, in the Design workspace). The top bar keeps the essentials: steps, view, level, checklist, undo, save, panel and focus. The panel tabs:
  - **Graphics:** the marks, **A new graphic**, the library and the all-over print. **Open the graphic studio** opens the Studio on a clear canvas in a window over the piece (`/lab/studio?new=graphic&pick=1`; the Studio may be framed by itself, `frame-ancestors 'self'`). There you can draw, set type or make it with AI. **Put it on the garment** keeps it in the library and places it on the flat in view. **Upload artwork** (PNG, JPEG, WebP or SVG) does the same with a file of your own.
  - **Design**, as before.
  - **Garment:** **Fabrics, trims & labels** (the materials window) and **Edit recipe**, then **Wash & distress** and the piece.
  - **Sheets:** the spec sheet, the decoration sheet and **Send to the tech pack**.
  - **Measurements** (Pro).
- **The board and components** (`src/lab-studio-board.js`, served at `/lab/studio-board.js`).
  - **Board** (in the view switch, or ⌘K "Show the board") lays every frame of the piece side by side, drawn from the design as it is: the picture, the flat front and back with their graphics, the flat in each of the concept's colourways, and the flat at each size when the artwork is graded. A frame opens its view. The flats come from the flats page's own drawing (`FBFlats.frame(view, {color, size})`, `renderSvg` with `plain` and `withArt`), so the board and the flats never disagree. The frame size slider sets how big they are.
    - **Make the turns from the flats** (the green pill, top left) draws the piece on a model from the front, three-quarter, side and back. The turns follow the flats as they are now. It saves the flats first. The service draws the saved flats as pictures (`flatPictures` in `src/lab-flats-routes.js`) and gives them to the image model as the first references, front then back (`from: 'flats'` on `POST /v1/lab/concepts/:id/views`, `FROM_FLATS` in `src/lab-views.js`). The flats win over the picture; the picture gives only the look of the cloth. It works without a concept picture, replaces the turns made before, and is metered as four views. The board's **Turns** row shows each turn as it is drawn, in a portrait frame on the model's grey so the whole figure shows, head to shoes. **Tap a turn** to open it large (`#turnZoom`): the full picture fitted to the screen; pinch, the wheel, a double tap or − and + zoom (up to 8×), a drag pans, Fit goes back, ‹ › and the arrow keys step through the turns, Save downloads it, Escape closes. In Focus the board keeps clear of the panel and the palette stands aside. Journey J296.
      - **Edit** (in the large view) puts the turn right by hand. The piece's graphics (every one placed on its flats, the side this turn faces first; `GET /v1/lab/concepts/:id/turn-graphics`) are offered: tap one and it lands on the turn, to be dragged into place, sized by its corner and turned by its dot. **Paint an area** and say what to change ("make the belt loop mustard yellow"); the piece's coloured parts are offered as chips that write that for you. **Apply** (`POST /v1/lab/concepts/:id/views/:kind/edit`) sets the graphics on the picture where they were put, then the image model works them into the cloth (printed or stitched, following the folds and light) and changes the painted area as asked, keeping everything else; it is one AI generation. With **Work the graphics into the cloth** off and nothing painted, the graphics are only set on, with no AI. **Undo last edit** (`…/undo`) goes back to the turn as it was (the turn before the edit is kept in `lab_concept_views.prev`; undo again redoes it). Journey J297.
    - The turns keep the parts coloured on the flats: a belt loop, a pocket or a yoke coloured on the Garment tab goes into every turn that faces it, by name, colour and side (`details` from `flatPictures`, `detailsPrompt` in `src/lab-views.js`).
    - **Every graphic is on every turn it faces.** Each placed graphic goes to the image model as its own reference image: its art on the garment colour, last in the list. The prompt names its technique, size and place from the flats (`graphics` from `flatPictures`, `turnGraphics` and `graphicsPrompt` in `src/lab-views.js`). The front and three-quarter turns get the front graphics, and the back turn gets the back ones. This holds for turns drawn from the picture too, so the back graphic is never lost. When the vision model is connected (`ANTHROPIC_API_KEY`), each finished front, three-quarter and back turn is read against its artwork. A turn missing a graphic is drawn once more, naming what was left out. If one is still missing, the turn keeps a note under it on the board: "Check this turn: … may be missing."
    - **Walk** (under the turns): an 8-second film of the model walking in the piece, made from the front turn by the video model (Google's Veo, with the Google AI key `GEMINI_API_KEY`; `POST /v1/lab/concepts/:id/walk`). It plays on the board; **Make it again** redoes it after the turns change. Without a video model, the row says so. The same walk is in the Lab's Assortment board.
  - **Components.** A graphic from the library is a component, and every layer showing it is a copy, marked ◇ in the layers. A copy's size, place, turn and colour are its own. **Swap…** puts another library graphic in its place at the same width, for that copy or every copy on the piece. **Choose every copy** selects them all. **Edit the main** opens the graphic itself in the Studio, and its update reaches the copies the next time a design opens. **Detach** keeps it as a plain picture. **Make a component** puts any layer (type, a shape, a path, a picture) into the library and makes the layer its first copy. Duplicating a copy makes another copy. A copy is a layer whose `src` is `/v1/lab/art/:id` and whose pixels have not been painted on.
- Clicking the picture takes the keys back from a field in the panel, so tool keys and shortcuts work straight after typing a size.
- **Colour.** Every layer has hue, saturation, brightness and contrast. **Recolour** turns a mark or graphic into one colour. The swatches are the Future Basics colours and the plan's graphic-program palette; clicking one with a layer selected colours that layer.
- **Distress.** Every layer has an even wear: a worn print (specks and grain), cracked ink, or faded and washed out. You set the amount and grain size, and **Another pattern** gives a new one.
- **AI.**
  - **Change the piece:** sends everything visible to the image model with your words. With an area painted first (the area tool), only that area changes, and the answer is clipped to it so the rest stays exactly as it was.
  - **Make a graphic:** draws a new graphic on a clear background.
  - Either way the result comes back as a new layer on top, so nothing you made is lost. Prompts that name another brand are refused, the same as the rest of the Lab.
- **Saving.**
  - **Save** (Ctrl S) keeps the layers with the concept. The studio and the flats also save on their own a few seconds after each change (never mid-stroke), and say when: "Saving…", then "Saved just now" or "Saved 4 min ago" (the clock time on hover). A save that fails says why and is tried again.
  - **Draw the picture from the flats** saves what is open first, and nothing saves while the image model draws. The new picture becomes the base layer; what was laid on the old base (a logo, type, graphics from the flats) stays on top. Reopening the studio brings the design back exactly as it was saved.
  - **Use as the concept picture** makes everything visible the concept's picture, and an approved concept goes back to draft. Its turns (the piece on a model from the front, three-quarter, side and back) start drawing from it straight away, metered like any views. A piece nobody wears gets its front and back product views instead. The walk can be made again on the board.
  - The picture from before the studio is kept: **Put the old picture back** restores it.
  - After that, the logo and graphics are part of the picture, so **Place the logo and graphics again** says to move them in the studio instead.
- **Export.**
  - **Picture (PNG)** at full size.
  - **The selected layer (PNG)** with a clear background, for a print file.
  - **Layers for Illustrator (SVG)**, one group per layer. Plain type and shapes stay live vectors; anything recoloured partly, adjusted or distressed is placed as its picture.
- Fonts other than Space Grotesk and IBM Plex Mono are the computer's own (serif, slab, condensed, script, typewriter), so they can look slightly different on another machine. The SVG names the font.
- Routes: `src/lab-studio-routes.js` (`GET/PUT /v1/lab/concepts/:id/studio`, `GET …/studio/plain`, `POST …/studio/ai`, `POST …/studio/apply`, `POST …/studio/restore`). The page is `src/lab-studio.html`, and the table is `lab_studio_docs`. A saved design can be up to 30 MB and 80 layers. A layer's picture can only come from the design itself, a Lab graphic or one of our marks, never from an outside address.

- **Remove the graphic** (AI tab): a selected graphic layer is simply removed; otherwise the painted area, or the area the vision model finds (`POST /v1/lab/concepts/:id/studio/find-graphics {image}`, the concept's own graphics asked for by placement), is filled with plain fabric by the image model as a new layer on top, and the studio then offers to take the graphic off the concept's words too, so a redraw and the tech pack do not bring it back. Every AI button also says in a toast when it fails, not only at the foot of the panel.

## The smaller items: 3D try-on, our own fonts, the Illustrator round-trip

- **3D try-on** (`src/lab-tryon-routes.js`, table `lab_concept_models`): the concept's picture, or what is on the studio canvas right now, goes to the 3D service (Meshy, the same key as the tech pack's 3D shape) with the texture switched on, so the model comes back painted with the design. `POST /v1/lab/concepts/:id/tryon {image?}` starts one (staff only, by hand: it spends credits; one at a time per concept; `LAB_DAILY_TRYON`, default 8), `GET …/tryon` lists them, `GET …/tryon/:mid/model.glb` is the model. The viewer (`src/stl-viewer.js`) reads GLB now as well as STL (`FBStl.parseGlb`, node transforms, strides, flat normals when none are given) and paints the texture. In the studio: the 3D button opens the dialog (Make it from the canvas / From the concept picture); the concept window's 3D try-on button opens the studio on it. Under `AI_FIXTURE` the service is a stand-in that returns a flat slab with the picture on its front (`fixtureGlb`).
- **Our own fonts** (`lab_fonts`, routes in `src/lab-studio-routes.js`): a TTF, OTF, WOFF or WOFF2 uploaded once (`POST /v1/lab/fonts {name, file}`, told by its first bytes) is served from the Lab and loaded by the studio with the FontFace API wherever it opens, so type sets the same on every machine. The type panel offers Built in and Our fonts, with Add a font…; the graphics library page lists and removes them. The SVG export names the font by its name (install it in Illustrator to see it there).
- **Illustrator round-trip** (Import in the studio's top bar): the studio's own SVG export comes back as layers. A group that is still type comes back as type (its words, font, size, weight, spacing, colour, outline), a rectangle, ellipse or line as a shape, a picture as a picture layer, and anything redrawn in Illustrator (paths, effects) as a picture layer at the canvas size; the base stays. Any other SVG comes in as one picture layer per top-level piece, on top. Undo takes an import back.

## Graphics and techniques: the library

**Made as, in the studio.** Every graphic, mark or type layer has a Made as section at the top of its panel: the library's techniques as live previews drawn on that layer, grouped by kind (embroidery, print, heat transfer, patches and appliqué, other ways, distressing), one click to make the layer that way; "See it made every way" lays the layer out every way on a piece of cloth (jersey, fleece, twill, canvas or denim, any colour). The library ships 44 ways: satin, puff, chain, fill, metallic-thread, tonal and run-stitch embroidery; plastisol, water-based, vintage cracked, crackle, puff, high-density, halftone, foil, metallic ink, glitter, flock, direct-to-garment and gel prints; glossy, matte, 3D silicone, DTF, matte and gloss vinyl, reflective, holographic and sublimation transfers; chenille, woven, embroidered, rubber, leather patches, tackle twill and deboss; knit-in jacquard, laser etch, metal plaque, rhinestones and studs; three washes. The renderer (`src/lab-finish.js`) draws each with its own effect (silicone, flock, hd, metallic with sparkle, etch, knit, twill, leather, stud, and metallic thread on stitches); each carries the words for the image model, the artwork guide and the factory note.

**Graphics and techniques** (a Lab tab, `/lab/library`) is where everything we have made lives, so it can be used on any piece later.

### Graphics
- **Every graphic is kept.** That covers graphics drawn for a line plan's program, for a concept, in the studio, drawn here, and our own uploads. They stay in the library even when the plan or concept they were made for is deleted.
- **Draw a new graphic.** Say what it is, the words on it (spelled exactly), the ink colours, a style, and what it is **made for**. The technique's design rules (line weights, number of colours) go to the image model. One to three takes at a time. Other brands' names are refused.
- **Add our own artwork** (PNG, JPEG or WebP). Transparency is kept.
- **Build a graphic in the studio.** Opens the studio on a clear canvas (`/lab/studio?new=graphic`): draw with AI, paint, type, add our marks, parts from the sketch pack and other library graphics as layers. **Keep in the library** saves the finished picture with its layers. Opening a kept graphic offers **Rework in the studio**, which brings the layers back as they were; **Update the graphic** replaces the picture and its layers, or keep the rework as a new one.
- **Find and manage.**
  - Search by words, tag, where it came from, or technique.
  - Open a graphic to see it on fabric (jersey, fleece, twill, canvas, denim, any colour), made as any technique.
  - Rename and tag it, give it its usual technique, download it, or **put it on a concept**: where it goes and how it is made. It is placed on the concept's picture straight away.
  - **Factory job file**: the graphic made as a technique, at a width, on a garment colour, as the zip a factory or digitiser works from (separations with Pantones, films, underbase, halftone and mesh; or threads, stitch, backing and stitch count; or the cut line and edge; a one-page job sheet and `job.json`). The summary shows before the download. `GET /v1/lab/library/graphics/:id/job?technique=&widthIn=&garment=[&preview=1]`, made in `src/lab-jobfile.js`. The tech pack's artwork card offers the same (**Job file**) for a graphic that came from the library.
  - **Put it on a product**: search any product in any client's room, give a placement and width, and the graphic goes on its tech pack as artwork (Pantones read, placed on the front view). If the product has no pack yet, one is made. The same graphics are offered inside the tech pack, **From the graphics library** beside Upload artwork.
  - **Take out of the library** hides it. Pieces that use it keep it.

### Techniques
- **The starting set** (all of them can be changed):
  - Embroidery: satin stitch, 3D puff, chain stitch, fill stitch.
  - Print: plastisol, water-based or discharge, vintage cracked, puff print, halftone, foil.
  - Heat transfer: glossy, soft-touch matte, reflective.
  - Patches: chenille, woven, rubber, deboss.
  - Wear: worn-in, sun-faded, heavily distressed.
  - On products that are not cloth (a mug, a glass, a phone case, a poster): sublimation on coated blanks, UV print, pad print, screen print on glass, laser engraving, digital print on paper, offset print.
- **What it is made on.** Each technique says what it is made on: cloth, fabric-faced foam and rubber, ceramic, glass, coated metal, plastic and composites, paper, card and canvas, or wood (`surfaces`; a technique that says nothing is made on cloth). A piece is offered the techniques made on what it is, so a garment is offered the garment techniques and a mug a mug's ("Techniques that fit the product", below). The technique's editor has a **Made on** row.
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
  - The Add tab lists the library, and **From the sketch pack**: pockets, zips, collars, trims and buttons drawn in flat-sketch lines, added as a layer to place and size, then blended in with “Change it with AI”.
  - Any layer can be **made as** a technique. It shows at once, and stitches and dots keep a real size at any scale.
  - **Make it real with AI** asks the image model for the real technique inside that layer's area only, with the technique's words and reference photos. The result comes back as a new top layer.
  - **Save to the library** keeps a layer's artwork for other pieces.
  - Graphics made in the studio's AI tab go into the library on their own, made for the chosen technique.
- Studio routes for the library: `GET /v1/lab/library/studio?art=`, `POST /v1/lab/library/studio/keep`, `PUT /v1/lab/library/graphics/:id/studio`, `POST /v1/lab/library/graphics/:id/studio/apply`, `POST /v1/lab/library/studio/ai` (in `src/lab-studio-routes.js`; the layers live in `lab_art.doc`). Onto a product: `POST /v1/admin/products/:id/tech-pack/artwork` and `GET /v1/admin/products/search`.
- Routes: `src/lab-library-routes.js` (`/v1/lab/library/graphics…`, `/v1/lab/library/techniques…`, `POST /v1/lab/concepts/:id/graphics`). The techniques and the starting set are in `src/lab-library.js`, the drawing is in `src/lab-finish.js` (served as `/lab/finish.js`), and the page is `src/lab-library.html`. Tables: `lab_art` (with `in_library`, `tags`, `source`, `technique_id`), `lab_techniques` and `lab_technique_photos`.

## Reviewing together: pins, versions, review links

- **Pinned comments** (`lab_concept_comments.pin`: `{on: 'picture'|'flats', x, y}` as fractions): pinned from the concept window (Pin to a spot, click the picture), from the client's hub and from a review link. **Done** sets `resolved_at`; reopen clears it. `POST /v1/lab/concepts/:id/comments/:cid/resolve {resolved}`.
- **Studio versions** (`lab_studio_versions`): kept on every apply (with the layers) and on `POST /v1/lab/concepts/:id/studio/versions {image, doc, note}`; `GET …/versions`, `GET …/versions/:n` (the layers), `GET …/versions/:n/image[?thumb=1]`. The studio's **Versions** dialog compares two with a wipe and opens an old one's layers.
- **Review links** (`lab_shares`, `src/lab-share-routes.js`, page `src/lab-share.html`): `POST /v1/lab/concepts/:id/shares {audience, label, days}` gives the link once (only its hash is kept); `GET` lists; `DELETE …/shares/:sid` turns one off. Public: `GET /v1/lab/share/:token` (the piece, flats, colourways, the comments meant for them), `…/image`, `…/flats.svg`, `POST …/comments {name, body, pin}`. Rate-limited by address; expired or turned-off links answer 410.

## The whole range at once: one instruction, learned taste, lookbook and poll

- **Across the whole range** (`src/lab-range.js`, `src/lab-range-routes.js`): on a line plan, one instruction in plain words (“make every tee 260 gsm and swap the accent to olive”). `POST /v1/lab/plans/:id/range/preview {instruction, which}` has the assistant work out the change per piece (fabric, shape, fit, trims, colours, details, twist, description; only the fields the instruction touches) and says which pieces it leaves alone and why. Nothing is applied until `POST …/range/apply {instruction, changes}` with the ticked changes; each one goes through the same door as an edit by hand (the words are checked again, an approved piece goes back to draft, a note says what was changed and why). A tech pack is never changed from here. Pictures are redrawn afterwards, one at a time, if you want them. Daily cap `LAB_DAILY_RANGE` (40).
- **The Lab learns our taste** (`src/lab-taste.js`, setting `labTaste`): every approval, rejection and client verdict is counted per trait (fabric, shape, fit, colour, detail, graphic technique, category, price band) with the reasons written when something was turned down. It is read again on its own after every verdict; `POST /v1/lab/taste/refresh {ai: true}` also has the assistant write what the record says in a few lines. The assistant is given it (the brand code first, then the taste) before it designs concepts for our own lines and before a range change; a client's line is their taste, so it is left out. The Brand code section shows the counts and has the switch (`PUT /v1/lab/taste {use}`).
- **The lookbook** (`src/lab-lookbook.js`): `GET /v1/lab/plans/:id/lookbook.pdf?which=in_play|approved`: a cover, the contents, one page per piece (its picture and its words, the planned price; nothing from the check or the cost), in the brand template.
- **The customer poll** (`lab_polls`, `lab_poll_votes`, page `src/lab-poll.html` at `/lab/poll/:token`): `POST /v1/lab/plans/:id/polls {title?, intro?, which?, days?}` gives the link once (only its hash is kept; the plan keeps it on screen until you leave). Anyone with the link sees the pieces and answers, piece by piece: would you buy it (yes, maybe, no), the price (would pay more, fair, too high), what they would change, and optionally who they are. One person is one key (their email when given, else their address), so answering again replaces the earlier answers. `GET /v1/lab/polls/:pid/results` is the demand read: per piece, yes counts 1 and maybe ½ as a share of the people who voted, a rank, a price feel and a plain read (make it ≥ 70 %, worth a sample ≥ 45 %, think again). Staff hear when the first person and every tenth answers. `POST …/polls/:pid/close` stops the link; the results stay.

## Decoration to the factory: real size, separations, the decoration sheet, cost, warp, tone on tone, one graphic across the range

These turn a graphic into something a decorator can quote and make. The rules and prices live in `src/lab-decor.js`.

- **Size in inches, with placement rules.** Every placement has the sizes that read well there, by the trade's usual ranges for menswear:

  | Placement | Usual width |
  | --- | --- |
  | Left chest | 2.5–4 in |
  | Centre chest | 4–8 in |
  | Full front | 9–12 in |
  | Full back | 10–13 in |
  | Back neck | 1.5–3.5 in |
  | Sleeve | 2–3.5 in |
  | Thigh | 2.5–6 in |
  | Cap front | 2–4.5 in, at most 2.25 in tall |

  Hip, back pocket, cap side and bag have their own ranges too. A graphic too big for its technique fails. One too wide, too small or too tall for its spot is a warning.
- **In the studio, the ruler (U) sets the real size.** Drag across something whose size you know, then type its length in inches or cm. Until then the scale is estimated from how wide the piece is in the picture: about 28 in across for a tee, 30 for a hoodie, 20 for a pant, 8 for a cap. The scale is saved with the design.
  - Every graphic, mark or type layer shows its width and height in inches and cm, under **Size on the piece**. Typing a width sizes it.
  - **Goes on** picks the placement. **Check the size and cost** asks `POST /v1/lab/studio/check`. It answers with the size against the placement and the technique, the finest line at that size, the inks and a cost a piece.
- **Colour separations.** **Colour separations…** on a layer shows one plate per ink with its Pantone C, and the white underbase on a dark garment; **Inks / Films** switches between how each ink prints and the film the screen is burnt from. The note gives the press order. **Download the files** gives the job zip for the printer. This uses the same job file as the library (`POST /v1/lab/studio/separations`).
  - How the inks are found (`src/lab-separate.js`): every colour that fills an area of its own is an ink, however small (a 1% star keeps its plate). The soft edge where two colours meet goes to the nearer one, so no plate carries a ghost outline of another. A gradient or fade is two inks shared as tones; the films screen the tones as halftone dots, each plate at its own angle (22.5°, 52.5°, 82.5°…). Solid art is printed as solid spot colours, with no halftone.
  - Not printed: an ink the colour of the garment (the garment shows through), and the background of a picture with no transparency (a logo saved as a JPG on white) where it joins the edge. White lettering inside the art still prints. Each one is listed under the warnings.
  - The underbase sits under every ink that is not near-black, choked half a point inside it. Every film has registration marks in a half-inch margin.
- **Warp to the piece.** Presets are arc up, arc down, bulge, wrap round the body and wave, with an amount. **Flat again** removes the warp. The warp tool (W) drags the 16 points of the grid by hand. Warp is only how the mark looks on the picture. The size, the separations and the factory files stay flat.
- **Tone on tone.** **Tone on tone…** samples the fabric under the layer. It offers that colour dyed to match, plus three steps lighter and three darker, each with its nearest Pantone C. A click recolours the mark and keeps the Pantone on the layer.
- **The cost goes into the BOM.** Saving the flats prices each placement and keeps the lines on the concept as `spec.decorations`.
  - Each line has its size, colours, Pantones, technique, setup and a cost a piece. A setup is screens per colour, a digitised design, a mould or a die, shared over the planned quantity (300 by default).
  - The concept's landed cost and margin count the decorations. The materials panel shows them as **Decoration**.
  - The tech pack BOM has a row per decoration, marked "From the flats", with its size, Pantones and cost.
  - Starting prices per base technique are in `DECOR_COST`. A technique can carry its own in its rules (`rules.cost`).
- **The decoration sheet.** **Decoration sheet** on the flats opens `GET /v1/lab/concepts/:id/flats/decorations.pdf`. It has one page per graphic, in the brand template:
  - the size, colours and cost a piece
  - the artwork and the flat with that placement picked out
  - where it goes, the Pantones, and the technique's factory note and rules
  - what to check before it is made
- **One graphic across the range.** On a line plan, **One graphic across the range** takes a library graphic, a spot and how it is made. "The usual spot per piece" means left chest on tops, knitwear, outerwear and tailoring, front chest on dresses, thigh on bottoms, cap front on headwear and bag front on bags.
  - **Preview on every piece** draws it on each concept's picture (`POST /v1/lab/plans/:id/mockup`). The model places it where it can; otherwise the usual spot is used. Nothing is kept yet.
  - **Put it on the ticked pieces** (`POST /v1/lab/plans/:id/mockup/apply`) adds it to each concept's graphics and redraws its picture. Pieces that are already tech packs, that have no such spot, that already carry the graphic or that already have four are left alone, with the reason.

## From the studio to the factory: studio graphics on the flats, sizes per garment size, inks per colourway, vector and stitch files, all-over repeats, factory quotes

- **Studio graphics reach the flats.** In the studio, a graphic, mark or type layer with a place chosen under **Goes on** goes to the concept when the design is saved.
  - It becomes one of the concept's graphics, with its size in inches (`POST /v1/lab/concepts/:id/studio/graphics`).
  - Saved flats get it as a placement at that size. Saving again resizes it in place and keeps its top edge where it was. Clearing its place takes it off.
  - A concept with no saved flats starts them with it.
  - On the flats page these placements are marked "from the studio". From there they reach the decoration sheet, the cost and the tech pack like any other graphic.
- **Artwork by garment size.** On the flats, the selected placement offers **One size for all**, **Two sizes** or **Three sizes** (`POST /v1/lab/concepts/:id/flats/suggest`).
  - The artwork is scaled with the chest (the hip on bottoms, the width on a tote) from the sample size, then rounded to ¼ in. Every width can be changed.
  - The size picker draws each size's artwork.
  - The spec sheet, the decoration sheet, the BOM and the construction lines give the size for each group, for example "XS–M 9½ in · L–XXL 10½ in".
- **Inks per colourway.** **Suggest inks for each colourway** checks every ink against every colourway on the concept. An ink too close to the garment is lightened on a dark colourway, or darkened on a light one, until it reads. The rest stay as drawn. Each one can be picked by hand.
  - The decoration sheet has an "Inks on each colourway" table with Pantones. The tech pack gets a construction line per graphic.
- **Vector and embroidery files** (`src/lab-vector.js`).
  - **Vector (SVG)** traces each ink of a graphic to filled paths, at its width in inches, with its Pantone, for a screen printer or Illustrator.
  - **Embroidery file…** digitizes the graphic for an embroidery machine (`src/lab-digitize.js`) and opens the embroidery window: the design sewn out as thread on the garment colour, the stitches, size, threads and colour changes, trims and minutes a piece, the thread sequence with each thread's Pantone and stitches, and the warnings.
    - How it is built: first the artwork is cleaned the way a digitiser redraws it. Each pixel goes to the thread most of its neighbourhood (about 0.3 mm round) belongs to, so a distressed, cracked or scanned graphic's nicked and grainy edges become clean, straight ones. Cracks and slivers under 0.45 mm wide in a colour that covers a real area elsewhere are folded into the colour round them, and specks under 1.5 mm² go too. A colour the clean-up would mostly erase (small lettering, a pinstripe) is a detail of its own and is kept for the review to judge. Then each colour is cut into shapes. A shape too wide for satin that has thin strokes running off it (a border joined to a solid block, a frame round a panel) is split the way a digitiser splits it: the body is fill, and each stroke 1 to 3 mm wide and at least three times as long as it is wide is a satin part of its own, so fill rows never end in a staircase along a thin border. A shape no wider than the satin limit (6 mm) is satin: stitches cross it edge to edge over a centre-walk underlay, longer stitches split. A straight stroke takes one angle, the one that crosses it shortest; a curved one (a ring, an O, script, an arc) gets turning satin: the shape is thinned to its centre line, cut into columns at junctions (a stroke that runs straight through one stays one column, the others stop at its edge) and at sharp corners (one column runs through the corner and the next starts at its edge, so the corner is sewn once and not fanned), and every stitch is laid square to the line as it curves, spaced on the outside of the curve, with short stitches on the inside so it does not bunch. The edges of a column are eased over about 0.8 mm (a median, then a mean), so a satin border runs smooth. If the centre line cannot be traced cleanly the shape keeps one angle. Wider shapes are tatami fill: 0.35 mm rows at 45°, needle points staggered so no lines show, over a tatami underlay at right angles. The ends of neighbouring rows are eased into a line (never more than 0.3 mm, so a real corner stays a corner), so fill and one-angle satin edges sew straight. Satin rows are 0.2 mm apart. Both edges are pushed out by the pull compensation. Thin satin outlines (up to 3 mm) that lie between their own colour and one sewn after it are sewn last, in a pass of their own at the end, so the other colour's row ends tuck under them; a counter (the hole in an O, all round one colour) is not an outline and stays where it is. `strokes: false` and `outlinesLast: false` turn these off. Shapes are sewn nearest-first; a move inside the same shape runs underneath in small stitches, any other move jumps with a lock stitch either side, and a long one trims. A thread the colour of the garment is not sewn.
    - The settings: width, fill angle, fill density (dense 0.35 mm, the default, to open 0.6 mm), satin up to 5, 6 (the default), 7 or 9 mm, pull compensation (none to 0.3 mm for knits and fleece), underlay on or off. Changing one digitizes again.
    - **What the machine will make, without a digitiser** (`src/lab-sewout.js`, the window's part is `src/lab-studio-emb.js`):
      - **Sewn:** every stitch drawn as thread about 0.42 mm thick, lit as a cylinder with its sheen and ply twist; satin raised over its underlay, fill flatter; the shadow it casts on the cloth. The cloth is the garment colour as a knit, fleece, twill or woven (the Fabric choice). Jumps and trims are not drawn. It comes back as a JPEG, about 1 s for a 10,000-stitch logo.
      - **Sewing:** the stitches played back in the order the machine sews them, colour by colour, with the needle shown, the stitch and thread it is on and the minutes in at 750 a minute. Pause and drag to any stitch. The stream is `frames` (base64 Int16 x, y, flag in 0.1 mm; 0 stitch, 1 jump, 2 trim, 3 colour change).
      - **On the garment:** the thread alone, with its shadow (`onGarment: true` returns a see-through PNG and the area it covers), laid on the Studio picture in place of the artwork, at its size and turn, close up.
      - **The review** a digitiser would give: a score out of 100 and a verdict (Ready to sew, Worth a check, Fix before production), how closely the stitches match the artwork (overlap, coverage, thread past its edges), and each thing worth fixing: density too high or low, satin too narrow or too wide, stitches over 8 mm long, five or more layers stacked, lettering under 5 mm, jumps left untrimmed, too many threads, no underlay, pull, the hoop it needs. Each fix is one of the window's settings, so **Fix it** (or **Fix all**) sets it and digitizes again, and the toast says the new score.
      - The job zip's `stitch-preview.png` is the same render, and `job.json` carries the review. Satin turns with a curved stroke, so a ring or an arc sews without long floats; if a shape still ends up at one angle with stitches over 8 mm (its centre line could not be traced), the review flags it and its fix sews that shape as fill.
    - Downloads: **Tajima .dst** (every commercial machine), **Melco .exp**, and **Download everything** (both files, the sew-out preview, the job sheet with the sequence, and job.json). Shapes under 1 mm wide and designs over 20,000 stitches are flagged. Run one sew-out before production.
  - Both are in the graphics library (`GET /v1/lab/library/graphics/:id/vector.svg`, `GET …/embroidery?widthIn=&garment=&format=dst|exp`) and in the studio (`POST /v1/lab/studio/vector`, `POST /v1/lab/studio/embroidery` with `fillAngle`, `rowMm`, `satinMaxMm`, `pullMm`, `underlay`, `format: dst | exp | zip`).
- **All-over repeats** (`src/lab-repeat.js`). **Make an all-over repeat** on a library graphic offers straight, half-drop, brick, mirror or tossed. It takes the repeat width in inches, the motif's size and turn, and a ground colour or clear (`POST /v1/lab/library/repeat`).
  - **Keep in the library** saves the seamless tile with its size.
  - On a piece's flats, **All-over print** lays it over the cloth only, with the sketch's lines on top. It is made as all-over sublimation, all-over screen print or jacquard knit.
  - It is priced by the cloth it covers, front, back and sleeves at the sample size. It has its own page on the decoration sheet and a BOM row on the tech pack.
- **Factory quotes calibrate the costs.** Under **What the decorations cost** on the flats, **Record the factory's quote** keeps what the factory charged (`/v1/lab/decor/quotes`). It is stored next to our estimate for the same size, colours and quantity.
  - The factor is the median of quote ÷ estimate, per technique, or per base technique when a technique has none.
  - One quote moves the estimate a third of the way. Three or more move it all the way. It is bounded between 0.3× and 3×.
  - Every cost after that uses the factor, in the flats, the studio check and the tech pack. The basis says so, for example "×1.20 from 3 factory quotes". A wrong quote can be deleted.

## Materials, trims and tags: the library

**Materials, trims and tags** (a Lab tab, `/lab/materials`) is what we make pieces of, kept once and chosen on any concept.

- **Fabrics**: weight (gsm), composition, construction (loopback fleece, French terry, heavy jersey, twill, denim, ripstop…), width, finish, stretch, shrinkage; the mill, our code, price per metre, MOQ and lead time; a swatch photo; the colours it comes in, each matched to a Pantone C.
- **Trims**: zips, buttons, snaps, rivets, eyelets, drawcords, aglets, elastic, thread…, with size, material, finish, how many a piece takes, and the price.
- **Tags and labels**, in their shapes and sizes, drawn to scale on the page: neck labels (woven end-fold, printed tagless), size tabs, care and content labels (centre fold), hem and sleeve tags, waistband labels and back pocket patches for pants, locker loop and sweatband labels, size stickers, and hang tags (rectangle, square, circle, shield, book fold) with their board, print, eyelet and string. Each says what it is for (shirts, pants, outerwear, knitwear, headwear, accessories), how it folds and where it is sewn. A new tag is drawn as it is typed; the drawing is also at `GET /v1/lab/materials/:id/tag.svg`.
- **Pictures on every card.** A fabric or trim without a swatch photo is drawn (`src/lab-swatches.js`): a cut swatch in its weave or knit (plain weave, twill, denim with its selvedge, jersey, rib, ripstop, corduroy), its corner turned to show the back (terry loops, brushed fleece), in its first colour; a trim as it looks (zip with metal teeth or coil, buttons, shank buttons, rivets, snaps, eyelets, cords with aglets, elastic, thread cone, buckle…) in its metal finish. A photo, when added, replaces the drawing. Tags are drawn whole inside the tile, string and eyelet included, and their words are sized to fit the tag.
- **Photos of real cloth.** Over the drawing, a fabric shows a close-up photo of a similar cloth (`src/lab-photos.js`), recoloured to its first colour (or, in Design, the colour chosen on the garment), so one photo serves every colourway: denim (raw, rinsed and washed), sweatshirt fleece, terry loops, polar fleece, sherpa, jersey and melange, waffle, jumper knits, poplin, twill, canvas from light to heavy duck, ripstop, nylon shells, polyester wovens, corduroy, satin, linen, melton, velour and scuba. The photo is picked from the construction, finish and weight; the form's **Photo** lets you choose another, or **No photo** to keep the drawing. Rib and mesh have no photo yet and stay drawn. Trims are drawings except a brass metal zip and brass aglets. Your own swatch photo always comes first.
  - Where the photos come from: close-ups cut from free photo scans, all free for commercial use. Poly Haven and ambientCG are CC0; the ripstop, zip and aglet photos are from Wikimedia Commons under CC BY-SA, and every photo's credit and licence shows under it in the form. `node scripts/build-material-photos.mjs` downloads and cuts them again into `src/material-photos/` (grey, levelled, 640 px); the server recolours them at `/lab/material-photos/<id>.jpg?c=<hex>&s=160|320|640`.
- **The starting library** has 113 fabrics, among them denim from 5 oz chambray to 16 oz selvedge (raw, rinsed, stone washed, bleached, overdyed black, ecru, stretch), fleece from 280 gsm polar to 520 gsm heavyweight brushed (cotton, CVC, organic, sherpa), French terry and loopback from 240 to 450 gsm, knits (slub, heather, interlock, piqué, waffle, 1×1 and 2×2 rib, 12-gauge merino and 5-gauge cotton jumper knits), polyesters (wicking interlock, tricot, pongee, softshell, 4-way stretch, mesh), ripstop (30D and 40D nylon, cotton, NYCO, 210D polyester), nylon (taffeta cire, 2-layer taslan, 420D oxford, 1000D Cordura) and canvas from 7 oz to 18 oz duck (washed, garment dyed, brushed, waxed, hemp). Mills and prices are starting points to confirm.
- **More cottons, leathers and vegan leathers.** The library also has:
  - **Shirting cottons by weave and weight:** 95 gsm 2-ply poplin, 120 poplin, stretch poplin, broadcloth, pinpoint, oxford and royal oxford, end-on-end, seersucker, voile, lawn, double gauze, dobby, twill shirting, brushed cotton flannel and two linens.
  - **Bottomweights:** drill, gabardine, stretch chino, brushed twill, moleskin, 8-wale corduroy, needlecord, cavalry twill, herringbone and sateen.
  - **Tee jerseys** at 140, 220 and 300 gsm.
  - **12 leathers**, sold by the square foot and described by thickness: lambskin nappa, full-grain and top-grain cowhide, goat and split suede, nubuck, pebble grain, waxed pull-up, vegetable-tanned, horsehide, patent and shearling.
  - **14 vegan leathers:** PU, recycled PU, bio-based PU, microfibre leather and suede, cactus, apple, grape, pineapple-leaf fibre, mycelium, cork, faux patent, faux suede and faux shearling.

  A fabric can carry a thickness (mm) as well as a weight.
- **Browsing fabrics:**
  - **By family:** jersey, fleece and terry, knitwear and rib, shirting cottons and linen, twills and chinos, denim, canvas, outerwear and technical, wool, leather and vegan leather. The families are worked out from the construction and composition (`fabricFamily` in `src/lab-materials.js`).
  - **By weight band:** light, mid or heavy for what the cloth is (`weightBand`). Leather's band comes from its thickness.
  - **Ounces:** wovens also show oz/yd².

  On the page, family chips and a weight menu sit above the grid, and **All** groups the fabrics by family, light to heavy.
- **Leather pictures:** leathers show a pebble-grain, pull-up, suede or cork photo (ambientCG, CC0). A smooth or patent leather is drawn as a hide with its sheen instead of a photo.
- **The fabric check:** it reads a leather as leather. It no longer asks for a gsm, it asks for the thickness, and it warns when a knit garment is cut from a leather.
- A starting set of 10 fabrics, 11 trims and 16 tags is put in once; all of it is ours to change. Taking one out of the library leaves it on the concepts that use it.

**Footwear, plush and toys, plastics and acrylics** (`src/lab-materials-goods.js`) sit beside fabrics, trims and tags, each with its own
details and drawn as what it is (`src/lab-swatches.js`):

- **Footwear materials**: upper leathers (full grain, nappa, pebble, patent), suede and nubuck, synthetic leather, engineered mesh, knit and
  canvas uppers, linings, collar foam, midsoles (EVA, supercritical PEBA), outsoles (rubber cupsole, carbon rubber, leather sole), insole board,
  sockliner, counter and toe puff, laces and eyelets: what it is, the finish, thickness, hardness (Shore A), what a pair takes; leather by the
  square foot. Drawn as a cut hide with its grain, nap or gloss, a mesh with its holes, a foam or sole block, an outsole's tread.
- **Plush and toy materials**: minky, short pile, velboa, faux fur, felt, fibre fill, polypellets, 12 mm safety eyes, safety noses, embroidery
  thread: pile height, weight, size, and the safety it is tested to (EN 71, ASTM F963) and its age. Drawn with its pile or fur, a safety eye
  with its washer.
- **Plastics and acrylics**: ABS (general and V-0), PC/ABS, clear PC, PP, PA66 GF30, POM, TPU, TPE, LSR silicone, cast and extruded acrylic,
  frosted acrylic, PETG: the resin, grade, process (injection, overmould, 2K, CNC, laser cut, thermoformed, 3D printed), finish (SPI, MT
  texture, VDI, soft-touch, UV coat, frosted, polished), opaque, translucent or clear, UL94 rating, wall thickness, density and shrinkage; by the
  kilo or the sheet. Drawn as a moulded colour plaque with its stepped thickness and finish; clear and translucent ones over a checker.

**On a product's parts.** A shoe, a plush, a toy, a home object and an electronics enclosure have parts (`PARTS`): a shoe's upper, overlays,
lining, foam, midsole, outsole, insole, stiffeners, laces and eyelets; a plush's body, contrast, eyes, nose, fill and thread; an enclosure's
housing top and bottom, buttons, lens, light pipe and gasket. A material is put on a part (`POST /v1/lab/concepts/:id/materials {material,
part}`), in its first colour until another is chosen; a part takes one material, so choosing another replaces it. On the **Pattern** page a
shoe's and a plush's **Materials** list each part with its swatch, **Choose…** from the library (what suits the part first), its colour and
**Remove**; the tech flats are drawn in them (`src/lab-looks.js`): each part in its colour, a suede's nap, a mesh's holes, a knit, a pebble grain,
patent's gloss, a fur's strands, and so is the tech flats SVG. The concept window has **Add a material to a part**, and Design's
**Fabrics, trims & labels** has the kinds the product takes, each line saying the part it goes on. The tech pack's BOM names the part.

**In Design** (the picture and both flats), **Fabrics, trims & labels** opens the same bill of materials beside the library: each fabric, trim and tag drawn (or its swatch photo), searchable, with **Add to the garment** (the first fabric is the main one, the next the contrast). Each line on the garment can change what it is used as, its colour, how much a piece takes and where it goes (a label's default: how it is attached), or come off; the materials, making, landed cost and margin follow, and the tech pack takes the lines.

**Necklines.** Under **Neckline** in the flats' Design tab, a knit top can switch its neckline the way it swaps a pocket or a zip. The choices are **As drawn**, **Thin crew** (1/2" rib), **Regular crew** (7/8"), **V neck** (mitred, 3/4"), **Mock neck** (a 1 3/4" stand) and **Turtleneck** (a folded 2 3/4" stand). The shapes are in `src/lab-neck.js`.
- **Which pieces:** tees, long sleeves, crewnecks, tanks, dresses, bodysuits, camis and swimsuits. Hooded, collared and open-front pieces keep their own.
- **Drawing:** the new neckline is drawn front and back from the piece's neck width and drops, in the garment's colour, with rib wales, the opening and a coverstitch. A neckline-shaped cover hides the sketch's own neckline and leaves the shoulder line and raglan seams alone.
- **Saved and written:** the flat's params keep it (`neckline`). The tech pack's construction notes and the flats sheet give the rib spec, and **Draw the picture from the flats** names it in the prompt.
- **Measurements:** choosing a neckline sets the piece's neck points of measure from the style's standard (`necklineMeasures`). Every surface reads those same numbers: the drawing, the Garment tab, the Measurements tab, the graded table, the spec sheet, the tech pack's points of measure and the factory handoff.
  - **V neck:** the front drop goes 2 1/4" deeper to the V point, with a 3/4" rib.
  - **Mock and turtle:** the neck is narrower (by 3/4" and 1"). The front drop rises to the collar seam. The rib row becomes the finished stand height: 1 3/4" for a mock, 2 3/4" folded for a turtle.
  - **Thin crew:** a 1/2" rib.
  - **Names:** the points of measure take the neckline's names, such as "Front neck drop to the V point" and "Collar stand height, finished (folded)" (`necklinePomName`).
  - **Editing:** the numbers can still be typed over in the Garment tab, and the drawing follows. A style or fit change sets them again.

**Wash and distress.** The Studio's **Wash & distress** button, beside Fabrics, trims & labels, opens that section of the flats' Garment tab. It is defined in `src/lab-wash.js`, tuned against vintage streetwear references.

**Wash.** Choose from:
- rinse, silicone softener, enzyme;
- garment dye, pigment dye, overdye/tint, dirty wash (a yellow-brown vintage tint);
- stone, acid, snow;
- PP spray, spray fade (the ombré look), bleach, mineral;
- ozone, laser fade, sun-faded.

Each comes in Light, Medium or Heavy, with the factory's own words shown under it. A wash also tells the factory that the pack's measurements are finished, after the wash. It gives a shrink allowance for the pattern (`washShrink`): about 1.5% for low-impact finishes, 2% soft, 3% stone or bleach and 4% dye, scaled for Light and Heavy. The spec sheet's points of measure are headed "finished, after wash", and the tech pack's points of measure note the allowance. A wash is drawn the way it wears:
- **Fades:** the high points fade, meaning the chest, hood and shoulders on a top, or the thighs and knees on a bottom.
- **Seams:** dye settles in the seams and edges.
- **Ribs:** the hem band, cuffs and (except under a hood) the collar stay darker.
- **Particular washes:** spray and sun fades lighten from the top down, acid marbles, snow speckles, and laser fade adds whiskers on jeans.

The positions come from the garment's own measurements: neckline, hem, ribs, cuffs, rise and knee.

**Distressing.** An on/off switch, an amount slider (0–100), and **Where**: all over, edges only, or body only.
- **Edges:** chewed nicks around the collar, cuffs and hem (or the pocket openings, waistband and hems of a bottom), plus a ragged hem with a fringe hanging past the edge.
- **Body:** pinhole clusters, holes, worn patches, open knee rips with the weft across them on trousers, and dirt marks on heavy wear.
- **The summary:** the section lists what you get, and the tech pack's construction notes use the same words.

**Where it goes.**
- **On the flats:** both are drawn inside the garment, apart from the fringe, and kept in the flat's params (`wash`, `distress` with `focus`).
- **For the factory:** the tech pack's construction notes and the flats sheet list them in factory words.
- **The picture:** **Draw the picture from the flats** adds them to the prompt.

**Labels on the flats.** Every tag chosen on a concept is drawn on its flats in Design and on the tech pack's flats sheet, at its real size, where it is sewn (`tagMarks` in `src/lab-flats.js`):
- **Seen from that side (drawn with their face):**
  - a neck label and its size tab, through the neck opening on the front;
  - a hem tag at the left side of the hem;
  - a sleeve tag on the left sleeve;
  - a locker loop on the back;
  - a back pocket patch on trousers.
- **Inside (a dashed outline with what it is):**
  - the neck label from the back;
  - a care label in the left side seam;
  - a waistband label;
  - a cap's sweatband label.
- **Not drawn:** hang tags and stickers, which are not sewn in.

What a label shows and where it sits:
- **Designed face:** a label designed in the studio shows its designed face. The face is read from the library's copy of the tag, so a design made after the tag was put on the garment still shows.
- **Moving a label:** drag it on the flats with a mouse, pen or finger. It keeps its place on that view (`tagPos` in the flat's params), and the tech pack sheet draws it there too.

**Tags and labels in the studio.** **Design** on a tag's card (or **Design it in the studio** in its form, or **Design it** beside a tag on a garment in Design's Fabrics, trims & labels) opens the tag in the studio (`/lab/studio?tag=<id>`, with `&for=<concept>` from a garment) at its real size: its blank face (shape, fold, weave, colour) is a picture layer and each line of its words is a type layer, and every studio tool works on it (fonts, words, colours, graphics from the library, drawing, the AI). **Use on the tag** (and every save) puts the design on the tag as its face (`spec.face`, a graphic in the library): the library cards, the tag's picture and the sheets draw the face instead of typing the words, and the tech pack names it in the label row and carries a picture of each designed label. Starter tags are shared by every room, so designing one makes a copy, "… (ours)", in your own library. **Add to a garment** puts the label on a garment's bill of materials (straight onto the garment it came from, or one you pick), and a copy takes the starter's place on it. The design is in the graphics library too, so it can be placed on the flat like any graphic.

**On a concept** (the concept window, "Materials, tags and colourways"): add the main fabric (the one before becomes the contrast), rib, lining, trims and tags. Each pick takes the usual quantity for that kind of piece (a top takes 1.3 m, a jacket 2.6 m; a trim its count per piece) which can be changed. The cost adds up: materials + making (the usual cut-make-trim for the category, or ours) + freight and duty (18%, or ours) = landed cost, and the margin against the target price. The concept's cost follows, so the plan's margin flags read it. The fabric words on the concept follow the main fabric.

**Colourways** are set on the concept (name and colour; the Pantone, and the thread's, are read from the colour) and shown side by side on the assortment board: the flat washed in each colour under the tile.

**In the studio**, the AI tab's "The fabric" picks from the library: **Use it on the concept** (cost and margin update) and **Redraw the piece in it** (the image model draws the piece in that cloth and colour, as a new layer).

**To the tech pack**: every material becomes a BOM line with its spec, supplier, code, colour, quantity, unit and unit cost (marked "From the materials library", replaced when sent again); every tag becomes a line in Labels (size, shape, fold, material, print, string, where it goes, the words on it); the colourways go on with their Pantones. They travel with the flats, or on their own when there are no flats yet.

Routes: `src/lab-materials-routes.js` (`/v1/lab/materials…`, `/v1/lab/concepts/:id/materials…`, `…/costing`, `…/colourways`); the data, starting set and costing in `src/lab-materials.js`; the tag drawing in `src/lab-tags.js` (served as `/lab/lab-tags.js`); the page `src/lab-materials.html`. Table: `lab_materials`; a concept keeps its picks in `spec.materials`, its costing in `spec.costing` and its colourways in `spec.colourways`.

## Flats and placement, and "can it be made?"

**Which sketch a piece is drawn from.** The concept's words are read for the piece's family (jeans, chinos, sweatpants, track pants…: from its name, silhouette and fabric only, so a ripstop pocket lining does not make a twill pant a track pant), its silhouette (flared, straight, wide, slim…) and its features (cargo pockets, double knee, pleats, carpenter loops…). Every sketch of the style is scored (`rankTemplates` in `src/lab-flats.js`): a feature the sketch has that the concept never asked for counts against it, so a plain boot-cut twill pant is not drawn from a skinny double-knee cargo because it shares a word. With an Anthropic key the vision model then confirms the pick from the concept's picture among the best-scored sketches (cached per picture; off under `AI_FIXTURE`). The Garment tab still lets you pick any sketch by hand.

**Footwear is not drawn as a pant.** A concept whose words read as footwear (boot, sneaker, trainer, shoe, loafer, sandal, mule, clog, slide), with no pant words (boot-cut, pants, jeans, cargo…), is not drawn as a garment, wherever its line sits; outside a footwear line the flats say so and ask for it to be moved. In a footwear line it is drawn in panels (below). Before this a boot in a Bottoms line was drawn as a pant.

**Flats and placement** (the flat views of Design: **Flats** on a concept opens `/lab/studio?concept=<id>&view=front`) draws the piece as measured technical flats, front and back, the way a factory reads them. Nothing on it is drawn by an image model.

- **The drawing is a professional flat sketch** from the flat-sketch pack Future Basics bought (Kyle's Google Drive: "Mens Sketches", "Womans Sketches" and "Accessories, Pockets, Zippers"). Every drawing in it is here: 381 sketches.
  - **Men's:** tees and jerseys, long sleeves, crews, hoodies, zips, polos, shirts, tanks, jackets, coats, vests, pants, shorts, the cap and the bucket hat.
  - **Women's:** dresses, skirts, leggings, bodysuits, swimsuits, bikinis, sports bras, camis, tanks, vests, outerwear, sweats and jerseys.
  - **Choosing one:** each piece starts on the sketch whose name best fits its words (a pleated tennis skirt on the pleated skirt) and its fit. **Drawing** on the Garment tab is a searchable gallery of thumbnails; **Every style** lets you pick a sketch of another style. A piece starts at its sketch's own proportions, so a cropped tee starts shorter. **Simple outline** draws from the measurements instead.
  - **No sketch yet:** beanies and totes use the simple outline.
- **The sketch is lined up with the measurements.** For each sketch, `scripts/flat-templates/build.mjs` finds the front and back views on the page and measures them: the centre line, the chest between the side seams (or the waistband, or the cap's crown), the high point of the shoulder (or the top of the waistband, or the brim seam) and the hem. The page scales the sketch so its chest or waist matches the piece's, and its length too: at the start held within 12% of its own proportions so it never looks stretched, and after that following the length when it is changed (a shorter body is drawn shorter). Placements are measured from the same points, and the checks (collar, zip, pocket, seams, edges) work from the measurements, so they agree with the spec whatever the sketch.
- **Design tab: change the drawing.** Every sketch can be reworked without leaving the page. **From the sketch pack** places the pack's own add-on parts (about 200 pockets, zips, collars, trims and buttons, cut from its add-on sheets) on the flat:
  - **Colour.** A swatch or any colour recolours the whole piece: the white cloth takes the colour and the sketch's lines and shading stay. A dark colour gets light lines so the drawing still reads.
    The colour fills the garment's silhouette: the sketch's lines and everything they enclose, never the space around the piece or between its legs (`src/lab-flat-mask.js`). Some of the bought sketches fill those negative spaces white and leave the panels empty, so a plain recolour landed in the wrong places. Each sketch's silhouette is made ahead of time in `src/flat-templates/masks/` (`npm run flat-masks` after adding or changing sketches; `--all` remakes every one) and served at `/lab/flat-masks/<sketch>.png`; a missing one is made the first time it is needed.
  - **Details.** Patch, flap, welt, cargo, kangaroo, slant, jean and zip pockets; single, double or triple pleats; drawcords; zips; button plackets. Each lands where that detail usually goes, then drags into place or takes exact sizes in inches. Each has its own topstitch (single, double or triple needle, chain stitch, coverstitch, zigzag, bartack, blind hem), thread colour and fabric colour. **Mirror** copies one to the other side; **Cover up** hides something on the sketch, like the pocket you are replacing.
  - **Stitch lines.** Click along a seam or edge, then double-click or press Enter. Pick the stitch type, the thread colour and the stitches per inch.
  - **Coloured panels.** Press **Colour a panel**, then tap a panel of the sketch (a sleeve, the hood, a cuff, the body, a rib). It takes the colour right up to its seams: the sketch is read as pixels, the panel is everything between its dark lines, and its outline is kept as a colour block (`src/lab-flat-panels.js`). A tap on one stripe of a rib takes the whole band. **Both sides** colours the same panel on the other side too (the other sleeve, cuff or hood half). Tap a coloured panel again to give it the new colour. Each coloured panel is listed with its colour, name and **Remove**. **Block by hand** (Pro) still draws a block point by point, for an area that is not one of the sketch's panels.
  - **Cloth.** The library's fabrics, in the garment's colour. Picking one makes it the main fabric (it replaces the one before, so the cost and tech pack take it) and the flat shows its surface over the colour. A fabric chosen in the Studio's Fabrics, trims & labels window shows on the flat too.
  - **Redraw an area with AI.** Drag a box round a part of the drawing and say what to change ("make this a cargo pocket with a flap", "add double forward pleats", "add an elastic waist with a drawstring"). The image model redraws only that area, in black-and-white flat-sketch lines, and the colour goes back on over it. It is capped at `LAB_DAILY_FLAT_AI` a day (60 by default); the pictures are kept with the concept, out of the graphics library.
  - The spec sheet lists the main colour and every detail and stitch line under **Colour, details and stitching**, in words a factory reads (for example "Front: Patch pocket, 4½ in × 5 in, … ; topstitch double needle in #e0218a thread").
 and what was measured in `src/lab-flat-templates.js` (generated from `scripts/flat-templates/catalogue.tsv`, each drawing's style and name, and `parts.tsv`, the add-on sheets. Change them, then run `node scripts/flat-templates/build.mjs <download folder with all/, womens/ and acc/>`; it measures on four processes and takes about ten minutes; `PROOF_DIR=<folder>` writes a picture of each sketch with its measurements marked, to check by eye). The pack is licensed to Future Basics: keep the repository private, and the sketches are served only to the Design Lab pages (`/lab/flat-templates/<file>`). The spec sheet and the tech-pack pictures carry the sketch inside the file.

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

## The recipe menu: design by picking

Design Lab → **Recipe menu** (`/lab/recipe`): in the staff tab row, the hub's Design Lab, the client room's Design Lab view in Work, and on **+ New design**. On a phone the bases scroll sideways and a bar at the foot shows the piece as it is picked, with **Open** to hand. Pip has a guide for it. It is for someone who is not a designer: they choose a piece the way they would order it.

1. **The base.** A staple at its usual fit: classic, boxy or oversized tee, long-sleeve, tank, polo, crewneck, hoodie, zip hoodie, button-up and camp shirts, zip jacket, vest, coat, straight or wide trousers, shorts, leggings, a dress, skirt, cami and bodysuit, a six-panel cap, bucket hat, cuffed beanie and a tote bag.
2. **Add-ons.** Pockets (chest, flap, kangaroo, zip, slant, jean, cargo, back welts, side pockets, a tote's front pocket), closures (quarter zip, button placket, drawcord waist, zip front, button front), collars (polo, johnny, retro, half-zip, rugby, henley and V-neck on knits; thin crew, mock neck and turtleneck drawn on the knit's own sketch with their measurements; shearling, shirt and stand collars on a jacket; band, camp and button-down on a shirt; one at a time), **wash & wear** (garment dyed, vintage stone wash, acid wash, sun faded, dirty vintage tint; worn edges, distressed, heavily destroyed; one wash and one wear at a time, drawn and written for the wash house as in the Studio) and finishes (front pleats, cropped, and **contrast pockets and trims**, which puts the pockets in the system's next colour; it waits, marked "add a pocket first", until a pocket it can colour is on). Only the add-ons that suit the base are shown. Tapping a second add-on that goes in the same place (a flap pocket after a chest pocket, a second collar) **replaces** the first rather than stacking on it, and so does a second add-on that changes the sketch (a shirt collar after a shearling collar). **Cropped goes with anything:** alone it uses the pack's cropped sketch where there is one; with a collar (or on a piece with no cropped sketch) it cuts that sketch 4 in shorter. The cut is a band of the body taken out above the hem band (`crop` on the flat, drawn by `renderSvg`). The hem band, its stitching and the long sleeves stay as drawn, and the body is found from the sketch's outline across the hem. The flats' **Cropped** box does the same on any sketch, and the tech pack says how much was taken out. An add-on the sketch already draws (a pullover hoodie's kangaroo pocket, a chino's slant and back pockets, cropped on the boxy tee) shows as **on the sketch** and cannot be added on top. Add-ons drawn on the back (back welt pockets) say **on the back**, since the preview shows the front. The picked base, add-ons, colour system and cloth glow green (the line plans' selected style).
3. **A colour system.** Washed earth, Workwear, Monochrome, Coastal, Forest, Sport, Pastel, Future Basics, or four colours of your own. The chosen colour is the garment. The next colour in the system is the stitching. Every colour becomes a colourway on the tech pack.
4. **The cloth** (optional), with the fabric check below shown as you pick.
5. **Fit it together** (optional). Sliders for the base's lines, **Body width** and **Length** (±6 in, in ⅛ in), and for each placed add-on its **Size** (50–180%), **Up / down** (±8 in) and **Across** (±6 in; for a pair, **Apart**: both move out or in together, mirrored). The drawing follows as you slide, and **Put it back as it was** clears them all. Add-ons the sketch draws itself (a collar, a hoodie's kangaroo pocket, a chino's pockets) have no sliders: they move with the body.

The piece is drawn as you pick, on the same flats the Studio uses. **Open in the Studio** makes the concept, its flats and its colourways in one go, and opens it there.

How the drawing is made (`src/lab-recipe.js`, `cookRecipe`):
- The add-ons choose the sketch from the sketch pack. For example, cargo pockets pick the cargo trousers and pleats pick the pleated trouser.
- A detail the sketch already draws is not drawn again: a hoodie's kangaroo pocket, or a chino's front and back pockets (`shown`; `drawnOn` lists them for the page).
- Each base starts on a plain sketch of its own (`sketch` on the base, `baseSketch`), so an added pocket is never laid over one the sketch already has: the button-up is the plain classic shirt, not the Western shirt with two flap pockets. A button-down collar draws its two buttons at the collar points (the `button` detail in `src/lab-flats.js`).
- Every add-on a base offers changes the drawing or shows as on the sketch; `test/lab-recipe.test.js` checks each one, so a chip that does nothing fails the tests.
- Anything else is added as a flats detail, placed where that kind of detail usually goes. Pairs are mirrored left and right.
- **A collar is never laid over the base's neckline.** It picks the sketch drawn with that collar, so it always sits right: a classic tee with a polo collar is drawn on the classic polo sketch and becomes a polo (named "… classic polo"); a sweatshirt with a rugby collar is the rugby-collar sweatshirt. Each collar add-on says which sketch it uses for each base (`sketch` in `RECIPE_ADDONS`).
- The piece is measured as its sketch is drawn (`fitToTemplate`, the same as picking a sketch on the flats page), then the Fit it together changes apply: body width and length change the measurements (chest or waist, length or inseam), and each add-on's size and place change its detail.
- The sketch is stretched to follow those changes (`drawingOf` in `src/lab-flats.js`): wider makes it wider for the same height; shorter makes it less tall for the same width. At a piece's start (its style's usual measurements, or fitted to the sketch) it is drawn exactly as before, within 12% of the sketch's own proportions.

The concept keeps `spec.recipe` (base, add-ons, colour system, which colour is the garment, your own colours if you picked them, and `fit`: `{ m: { width, length }, adjust: { [add-on]: { size, dy, dx } } }`, cleaned by `cleanFit`).

**Edit recipe.** In the Studio a piece made from the menu has **Edit recipe** in its header. It opens the menu on the piece's own picks and how it was fitted together; change any of them and press **Save the changes**. The flats are cooked again from the new picks, and its colourways follow. Graphics placed on the flats and details added by hand stay. A tech pack cannot be changed this way. Routes: `GET|PUT /v1/lab/concepts/:id/recipe`.

**The picture from the flats.** A piece made from the menu (or a sketch) has flats but no picture. The Studio shows a bar, **Draw the picture from the flats**, and the checklist's picture item says the same. One press sends the front flat, in its colour and with its details, to the image model as the reference for a product photograph. The answer becomes the concept picture. It is one AI generation, counted with the flats' AI redraws (`LAB_DAILY_FLAT_AI`). It is refused when the piece already has a picture unless you ask to replace it, and the picture before is kept so the Studio can put it back. Route: `POST /v1/lab/concepts/:id/flats/picture {replace?}`. No AI is used, so nothing is charged.

Routes:
- `GET /v1/lab/recipe` returns the menu.
- `POST /v1/lab/concepts/from-recipe {base, addons, system (an id or {name, colours}), colour, name?}` returns `{concept, studio}`.

## Does the fabric suit the style?

`src/lab-fabric-fit.js` checks each chosen cloth against what the garment needs:
- **Knit or woven.** A tee, hoodie or polo is cut from a knit; a shirt, coat or tote from a woven.
- **Weight.** Each style has a usual range in gsm. A 180 gsm hoodie is light; a 400 gsm tee is heavy.
- **Stretch.** Leggings, swim and sports bras need four-way stretch. A slim woven trouser wants 2–3% elastane.
- **The rib and the lining.** A rib must be a stretch knit. A lining should be lighter than the shell.

Stretch is read from the cloth's stretch words, the elastane in its composition, and a knit's own give.

Where it shows:
- In the Studio's **Fabrics, trims and labels** window, at the top of "On this garment". Every fabric in the library is marked as it is listed (suits it, worth a look, or not for this piece), and the ones that suit come first. The Studio's AI tab shows it under **The fabric** too.
- **Keep it on purpose**: when the check calls a fabric wrong (a woven legging that is the whole idea), anyone working on the piece can keep it, with a reason. The reason, who gave it and when are kept on the concept and shown on the checklist, and the item no longer holds the tech pack up. It holds only while that fabric is the main one; choose another and it is checked afresh. **Take it back** undoes it. Route: `PUT|DELETE /v1/lab/concepts/:id/fabric-accept {reason}`.
- On the **checklist** as **The fabric suits the style**, once a fabric and the flats are both there. A real problem holds the tech pack up, for example a twill on leggings. Anything else is worth a look and does not hold it up.
- On the **sketch pack** sheet and the **recipe menu**, the moment a cloth is picked.

**When the fabric does not say enough.** The check never guesses what a material leaves out. A fabric with no weight, a cloth that does not say what it is, or a stretch fabric that does not say how much it stretches (or what it is made of) is **asked about** right under the check. A short form asks for just the missing details: what it is, the weight in gsm, the stretch, what it is made of. **Save** fills them in on this piece, and the check reads them at once. If the person may change the library's own material (staff, or the room that added it, but never the built-in starter set), the library learns the details too. Nothing missing makes the verdict worse: the check says "Nothing wrong so far, but 1 detail is missing to check it fully", and the checklist shows it as worth a look. Route: `PUT /v1/lab/concepts/:id/materials/:mid/spec?part= {construction, weightGsm, stretch, composition, thicknessMm, hardness, pileMm, safety}` (`part` is a shoe's or plush's part, or a role for clothing). The form is `src/lab-fit-ask.js`.

## Do a shoe's and a plush's materials suit them?

A shoe and a plush are made from their pattern, so they are checked on their **parts** (`footwearFit` and `plushFit` in `src/lab-fabric-fit.js`, `materialFit` choosing by category). The check shows under **Materials** on the Pattern page, with the same "what is missing" form, and on the checklist as **The materials suit a shoe** or **a plush**. Keep it on purpose works the same way, keyed to the upper or the body.

A shoe:
- **The upper**: leather under 0.9 mm tears when it is lasted and creases early; over 2.2 mm it is stiff where the foot bends. Patent on the vamp cracks across the flex. A cloth upper under 250 gsm needs a backer.
- **The lining** should not be thicker than the upper.
- **The outsole**: under 55 Shore A it wears through fast; over 80 it slips; under 3 mm it is thin. A leather sole is not asked for its hardness.
- **The midsole**: over 70 is a harsh ride; under 30 it packs down.
- What is not known is asked for: the upper's thickness, the sole's hardness. With no sole chosen yet, it says so.

A plush:
- **The body**: a woven has no give (the stuffed shape comes out lumpy); felt is stiff and pills; a pile over 20 mm hides the face; under 180 gsm the fill shows through.
- **Hard safety eyes and noses** are small parts, not allowed on a toy for under-3s. They pass once the material's safety field says 3+ (the built-in safety eyes do). Without a standard, the standard is asked for.
- **Pellets** need a sewn inner bag and are not for under-3s.

## New prints from old

In the graphics library press **Make a new print** (under Build one yourself), pick the graphic by its picture and, to blend, a second one. The Studio's AI tab links to it too (`/lab/library?print=1`, with `&art=` to start from one graphic). Or open a graphic and use **A new print from this one**:
- **In this style, showing something new.** The image model draws a new textile print with the same marks, palette, density and technique, showing what you name (for example "palm leaves and surfboards").
- **Blend with another print.** Two library graphics are fused into one design. The mix slider leans toward either one.

Untick **Fill the square** for a single graphic instead of an all-over fabric. In a graphic's panel the print to blend with is picked by its picture too.

**See it before it is kept.** The print comes back as a draft, shown large with its name:
- **Keep it** puts it in the library as a **New print**, under the name in the box.
- **Try again** draws another from the same picks (one more generation) and drops this one. Keep it and Discard wait while it draws.
- **Discard** drops it. Closing New print with a draft still showing discards it too.
- A draft is never in the library listing. One nobody kept is cleared after a day.

Once kept, **Make it a repeat** opens it at its all-over repeat with a half-drop already drawn (no AI: the repeat is made from the picture); **Keep in the library** keeps the repeat for a piece's flats. This is the way to turn a print that came out as a single scene into fabric. **Open it** puts it on a piece.

Routes: `POST /v1/lab/library/prints {mode: style|blend, art, subject?, mix?, fill?, name?, replaces?}` (a draft; `replaces` is the draft Try again drops), `POST /v1/lab/library/prints/:id/keep {name?}`, `DELETE /v1/lab/library/prints/:id` (a draft only). A print counts toward `LAB_DAILY_ART` and charges a room one graphic.

A room's graphics stay its own: a new print, and an all-over repeat, can only be made from the room's own graphics, and are kept in that room.

## The Catalogue: start from any product our supplier makes

The sketch pack (`/lab/sketches`) has a third tab beside Sketches and Parts: **Catalogue**. It lists every product in our supplier's catalogue (the OpenWav Enterprise Catalogue, Fall 2026: 1,846 products) as something to start a design from. A client's room with the Lab sees it; a room without the Lab does not.

- **No prices.** What we pay the supplier never reaches the Lab. The Lab reads the catalogue through `src/lab-catalog.js`, which keeps a product's id, name and brand and the base it opens on, and nothing else. The costs stay in `src/price-catalog.js`, which only staff routes read (the pricing card in the work console). `test/lab-catalog.test.js` and `test/lab-catalog-routes.test.js` hold every Lab answer to no `costCents`, no price status and no dollar amount.
- **Browsing.** A search box (every word typed must match, and a word stands for its like, as in the staff search; the products that say the very word come first), a group filter with counts, and the number of products. Cards load 48 at a time. Each card shows the drawing the product opens on, its name, its brand and **Open in the Studio**.
- **What a product opens on.** Each product is sent, by its name, to one base. The catalogue's own sections are not used, because they are noisy ("Accessories / Bags" holds tees and polos). The rules are an ordered list in `src/lab-catalog.js` (`RULES`), and the sketch within a style is picked by words in the name (`SKETCH`): crop, oversized, raglan, zip, jogger, cargo and so on, else the style's plainest sketch.

| Opens on | Products |
|---|---|
| A style and its closest library sketch (tee, hoodie, polo, pants…) | 1,105 |
| A style drawn from its measurements (a beanie, a flat tote) | 53 |
| A library bag (backpack, duffel, sling, pouch, messenger, waist bag, structured tote) | 113 |
| A library shoe (court low and mid, basketball high-top, daily runner…) | 30 |
| A product type added for the catalogue (below) | 491 |
| A plain 12 in panel, for what the Studio has no drawing for (a massage gun, a folding chair, a surfboard) | 54 |

- **Opening one.** `POST /v1/lab/concepts/from-catalog { item, colour? }` makes a concept named after the product on its base and opens the Studio. A product on a library sketch, bag or shoe is started by the route that already does that (`from-sketch`, `from-library-bag`, `from-library-footwear`), so each kind of concept is made one way. The concept remembers its product (`spec.catalog`: id, name, brand), and keeps it when its words are edited.
- **For staff.** When that concept becomes a product, the pricing card's "Closest to this product" lists the catalogue item the design was started from first, marked as such.
- `GET /v1/lab/catalog?q=&group=&limit=&offset=` is the list. Both routes sit behind the Lab's gate (`src/lab-catalog-routes.js`).

## Product types beyond clothes: mugs, posters, pillows and the rest

The catalogue sells things the Studio had no drawing for. Each is now a style of the flats, of kind `goods` (`src/lab-goods.js`): 70 product types and a plain panel.

| Group | Product types |
|---|---|
| Drinkware | mug, tumbler, tumbler with handle, water bottle, can glass, pint glass, stemless wine glass, rocks glass, can cooler |
| Wall art and decor | poster, canvas print, metal sign, wall tapestry, flag, wall clock |
| Home textiles | pillow, pillowcase, blanket, towel, tea towel, rug, door or bath mat, shower curtain, window curtain, placemat, napkin, table runner, tablecloth, duvet cover or comforter, apron, Christmas stocking |
| Tech | phone case, mouse pad, desk mat, laptop sleeve, power bank, speaker, earbuds case, wireless charging pad |
| Paper and small goods | sticker, notebook, jigsaw puzzle, coaster, playing cards, wall calendar |
| Pets | pet bed, pet bowl, pet collar or leash, pet feeding mat, pet tee |
| Sports and outdoor | yoga mat, ball, skateboard deck, paddle, umbrella |
| Automotive | car mat, car seat cover, steering wheel cover, licence plate |
| Socks, scarves and sandals | socks, scarf, bandana, flip-flop, slide sandal, clog, face mask, web belt |
| Kids and baby, Bags, Music | bandana bib, lunch bag or cooler, record sleeve |

- **The flat.** Each is drawn at true proportion from its measurements, in inches, with its **print area** named, and a back where the product has two sides (a pillow's back; a poster has none; drinkware has its sides and its wrap, below). A graphic starts in the middle of the print area, clear of what cannot be printed (a clock's spindle, a zip, a phone case's camera opening).
- **Sizes.** Each type says where its size came from (`from` in `src/lab-goods.js`): a size in a catalogue item's own name (a 50 × 60 in blanket, a 12 × 8 in metal sign, a 28 × 18 in pet bed), a published standard (an 11 oz mug, a 12 × 6 in US plate, a 12.375 in LP jacket, a 24 × 68 in yoga mat), or a typical size chosen here and marked "chosen here". They are starting sizes, not a supplier's spec: type the real ones in the measurements. They are kept to the eighth of an inch the flats work in (a mug is 3¼ in across).
- **Drinkware has a wrap.** A mug, tumbler, bottle or glass is printed on one sheet laid round it, so a cup's two views are not a front and a back. They are **Sides** and **Wrap** (a speaker, which has one side: Front and Wrap):
  - **Wrap** is the print area laid flat at true size: "Wrap print area, around" wide and "Print area, height" tall, as far below the top edge of the cup as the print area starts. A graphic placed here is printed round the cup, and one graphic can fill it from end to end. Blue lines mark where the **centre of the front** and the **centre of the back** fall, and the **handle** where the wrap reaches it; where a centre or the handle falls past the ends of the wrap, a line under the wrap says how far ("The handle is ⅞ in past each end of the wrap"). A cup with a handle is wrapped from one side of the handle round to the other, so the middle of its wrap is opposite the handle and the front (drawn with the handle to the right) is a quarter turn to the right of it. A cup with no handle is wrapped from the middle of its front, and its ends meet at the back.
  - **Sides** is the cup seen from the front, and from the back beside it. A graphic can still be placed on one side, measured from that side's top edge and centre line. What is placed on the Wrap is drawn on each side where it falls, narrower toward the edges as the cup curves away. It is moved on the Wrap, not here. On a glass that tapers (a pint glass, a wine glass) the sides show the wrap as wide as the glass is at each height, which is close and not exact: a flat sheet is curved to fit a taper by the supplier's template, and the Wrap says so.
  - **How it is kept.** The wrap is kept in the second of the two views every flat has (`view: 'back'`), so saving, the check, the spec sheet, the decoration sheet and the factory files work as they do for a garment. It is called Wrap wherever a view or a graphic is named: the Studio's view buttons, the placement's own menu, the spec sheet ("Wrap: On the wrap, ⅜ in below the top edge of the mug…"), the decoration sheet and the tech pack. `viewLabel` and `sideOf` in `src/lab-flats.js` give the names; `wrapOf` in `src/lab-goods.js` gives the wrap and where the centres fall.
  - **On the tech pack.** The pack takes three pictures: the front, the back (each with what the wrap puts on it) and "Technical flat · wrap, laid flat" as its flat view.
  - **A graphic saved on a cup's back before there was a wrap** is moved, when it is read, to the back drawn beside the front, the same distance from its centre line (`upgradePlacements`; a graphic saved on the wrap carries `wrap: true`, so the two are never confused). A colour block or a hand drawing made on a cup's old back view is not moved: it shows on the Wrap at the same inches.
- **One size, no pattern.** These are printed or bought in, not cut and sewn by the Lab. The Pattern page says so plainly ("A mug is printed or bought in, not cut and sewn, so it has no pattern and no size run"), and the size menu shows One size.
- **The check.** The edge of a print area is an edge, not a seam: a graphic within an eighth of it is flagged. A graphic put on the back of a one-sided product is told that side is not printed.
- **Techniques that fit the product.** Each product type is decorated on one surface (`surface` in `src/lab-goods.js`; typical of the product, not a supplier's word), and Made as offers the techniques made on it:

| Decorated on | Product types | Offered |
|---|---|---|
| Ceramic | mug, coaster | Sublimation on coated blanks, UV print, Pad print, Screen print on glass |
| Glass | can glass, pint glass, stemless wine glass, rocks glass | the same, and Laser engraving |
| Coated metal | tumbler, tumbler with handle, water bottle, pet bowl, metal sign, licence plate | the same as glass |
| Plastic and composites | wall clock, phone case, power bank, speaker, earbuds case, charging pad, ball, paddle | Sublimation on coated blanks, UV print, Pad print, Laser engraving |
| Paper, card and canvas | poster, canvas print, sticker, notebook, puzzle, playing cards, calendar, record sleeve | Digital print on paper, Offset print |
| Wood | skateboard deck | UV print, Laser engraving |
| Fabric-faced foam and rubber | can cooler, mouse pad, desk mat, laptop sleeve, door or bath mat, car mat, pet feeding mat, yoga mat, flip-flop, slide sandal, clog | Sublimation (all over), Plastisol screen print, DTF transfer, UV print |
| Cloth | home textiles, the tapestry and the flag, socks, scarves, bandanas, the bib, the pet tee, bed and collar, the lunch bag, the umbrella and the rest that is sewn | the garment techniques, embroidery among them |

  - The plain panel ("Other product"), whose product is not known, is offered every technique. A garment is offered exactly what it was.
  - A new graphic on a product type starts as its usual technique (a mug: sublimation; a glass: screen print on glass; a poster: digital print). A graphic that names no technique of its own is made as that one, and its Made as shows it.
  - **The check.** A technique that is not made on the piece fails the check: "Crest is set to Satin stitch embroidery, which is not made on a mug. Choose a technique from its list." A concept saved before this with a garment technique on a mug shows that until another is chosen; the technique stays listed, marked "(not made on this)". Each technique's own size and colour rules hold as before (a pad print is about 3 in across at most).
  - **Cost.** These seven have **no cost estimate**. The figures in `src/lab-decor.js` were worked out for garments, and no figure was made up for a mug: the page, the decoration sheet and the tech pack say "No estimate yet" (the supplier's quote sets it), and nothing is added to the piece's cost. To estimate one, put its figures in `DECOR_COST` from real quotes. A factory quote recorded for one of them is kept, but has no estimate to correct.
  - **Factory files.** A product technique's job folder holds the artwork at size, its colours and a job sheet that says what the supplier decides (time and temperature for a sublimation blank, white under a UV print). It gives no garment press or screen settings.
- **Panels that apply.** For a product type the Studio's Garment tab is **Product**. It keeps Colour a part, the product and its measurements; the Design tab keeps Colour and its drawing tools. What is sewn from cloth (a towel, a pillow, an apron) keeps the Cloth picker, Fabrics, trims and labels, the labels, pockets, zips and stitch lines; a mug, a poster or a phone case has none of them. No product type has a wash, a fit, a neckline, the garment sketch gallery or Draw from the picture, and none keeps a wash or a neckline when saved (`goodsTakes` in `src/lab-goods.js`). The line under the drawing says how a product is measured (from its top edge and centre line), and for a cup what each view is. The spec sheet and the tech pack do not give a product type a fit or a self fabric.
- Tests: `test/lab-wrap.test.js` (the wrap, its guides, what the sides show, the routes), `test/lab-product-techniques.test.js` (what each product is offered, the check, no made-up cost, the seed). Journey J311 walks a mug in the Studio beside a tee.
- The concept's category is Accessories (what is worn or carried, and tech accessories) or Other. Home, Toys and Electronics concepts open the 3D engineer instead of flats, so a printed mug is not put there.

## Starting from scratch

**Design** (`/lab/studio`, with no concept chosen) offers **Start from scratch**: name it (optional), choose what it is and, for clothes, the style
(`POST /v1/lab/concepts/from-scratch {name?, category, style?, shape?}`). The concept has no plan and uses no AI. Design opens on white paper with
the product's own outline under it as a locked **guide**:

- a garment shows its flat's pieces;
- a plush shows its shape;
- footwear, toys and electronics get a dot grid.

The guide is drawn at real size, so the studio knows the inches from the start (no ruler needed). Hide or delete the guide in Layers when you are
done. A garment started from scratch draws its flats as a plain outline to draw over (`template: 'none'`), not from a sketch in the sketch pack.

## Patterns: the product exploded into the pieces it is cut from

A sketch the pack's measuring script reads wrong is corrected by hand in `SKETCH_FIXES` (`src/lab-flats.js`). Only the length the sketch suggests (its ratio) is corrected. The drawing is still laid over inches as measured (`measuredRatio`, `fitToTemplate(p, true)` in `drawingOf`), because colour blocks and graphics already placed on a piece are kept in inches and would otherwise slip off the drawing. The shearling aviator read a third too long, so new aviators came out 37 in long; they now come out about 29½. When a piece's measurements change how its sketch is laid over inches (a length typed in, the sketch picked again, the fit, cropped), what is drawn on the sketch (colour blocks, stitch lines, cover-ups, parts, details) moves with the drawing (`remapEdits`). Graphics keep their inches, which are the spec.

**Pattern** is a step of the piece in the Studio, after Picture and Flats (`/lab/pattern`, in a frame; the drafting is `src/lab-pattern.js`, shared by
the page and the service).

- **Garments** are drafted from the flats' own measurements, so the pattern grades with the size picked:
  - tops: front and back on the fold (a pair of fronts when it opens), sleeves whose cap is sized to the armhole, neck, cuff and hem ribs,
    hood sides, the kangaroo pocket, and for shirts a yoke, collar, stand and cuffs;
  - jackets take what their sketch draws. A shearling aviator gets a one-piece shearling collar on the fold (with a self under collar), a
    shearling hem band split at the zip, and shearling cuffs, with no knit rib. A stand-collar or funnel bomber gets a folded stand collar, and a
    collared jacket (Harrington, trucker, chore, blouson…) a top and under collar. The aviator's collar is drafted as a crescent with rounded points, so it lies over the shoulders as it does in the picture. Its chest strap (pointed, four eyelets, tucked under the collar) is cut as a piece. Its sleeves are full: they keep most of their width to the wrist and are gathered into narrower shearling cuffs. Jackets and coats with welt pockets get the welts (slanted
    on aviators, bombers and bikers) and their pocketing bags;
  - a lined jacket, coat or vest (`o.unlined` leaves it out) gets its inside, drafted from the shell's own lines as a pattern room does:
    - **facings:** the front facing (front edge, neck and 1¼ in of shoulder, a 3 in band) and the back neck facing (2½ in deep), both fused;
    - **lining:** the front lining is the front less the facing. The back lining is cut on the fold with 1 in more at the centre back for the pleat. The sleeve lining has its underarm raised ½ in and is ½ in longer for a jump pleat. All are sewn to the hem band seam with a ½ in jump (or hemmed ½ in up);
    - **fusing pieces:** facings, under collar, welts, zip guard and chest strap;
    - **zip guard:** behind the zip;
    - **pockets:** a self pocket facing behind each welt's mouth, and an inside pocket in the lining (a lining welt and a pocketing bag);
    - **under collar:** in self.
  - its **trims** (`pattern.trims`): the separating zip sized to the front, zip puller, stay tape for the pocket mouths, eyelets for the strap, hanger loop, main, size and care labels with where they go, thread, and seam tape for shearling. They show as a Trims table on the pattern page. The production files carry `pattern/cut-list-and-trims.csv`: every piece cut, with fabric, quantity and notes, then the trims;
  - on the product the pieces sit as a flat draws them. A long sleeve hangs nearly straight beside the body, its cap rounding over the shoulder (a full aviator sleeve bowing out); a short sleeve is shown folded, hung from the shoulder and the underarm.
    The cuffs sit on the sleeve ends, the hem band shows the front's share of its strip, and the neck rib follows the neckline. The back view shows what wraps round to it: both sleeves and cuffs, the hem band and a shearling collar's back (copies, not cut again). The inside pieces are hidden under the shell;
  - bottoms: front and back legs (the back crotch longer), the waistband, pocket bags in pocketing, the fly facing, back pockets;
  - caps: six crown panels, the brim with its board, the sweatband; bucket hats, beanies (knit to shape) and totes too.

  Each piece has its sew line, the cutting line (the seam allowance: ⅜ in for knits, ½ in for wovens, or as chosen), a grain line, notches, and
  how many to cut and from which cloth.
- **Plush** is drafted from a kit: a **body type** and the **parts** that go on it (see *The plush kit* below). The pieces carry a ¼ in
  allowance, the pile direction, their notches and the stuffing opening. Each body type is drafted with how it goes together (see *How a
  fixed body type goes together* below).
- **The exploded view shows every piece cut, at every step.** A piece cut 4 (two pairs, inner and outer) is four outlines; a lining under an
  ear and the pads under the feet lift off with the rest. The inner layers come off beside the outer ones, and once spread no two pieces
  cover each other. Each one is labelled with its count (Front leg 3/4), and the bar says how many there are to cut. A unit test holds this
  for every garment style, every plush shape and every shoe style: the shown cuts equal the sum of the pieces' cuts at each step, and each
  lands on its own place in the cutting layout.
- **The plush views are drawn in the round.** Each stuffed part is shaded (lit from the upper front, with a sharper sheen for leather). On
  the side view, the far ear, arm and leg are a tone deeper behind the body. The head, the ears, the arm and the haunch throw soft shadows,
  and the toy sits on a ground shadow. The bear's legs are sewn on outside the body at the hip, as a jointed bear's are, and the elephant
  sits on a rounded haunch with its foot and pad turned forward.
- **Plush safety checks** follow the age (ASTM F963 and EN 71): safety eyes on a toy for under-3s fail; small appendages and long pile are
  flagged; the law label and tracking label are listed. The page estimates the fill in grams.

### The plush kit: body types and parts

A plush is not drawn as the nearest of a few fixed toys: it is built from a body type and the parts it needs, so a fox, a unicorn, a dragon
or a shark is drafted and drawn as itself (`PLUSH_SHAPES` and `PLUSH_PARTS` in `src/lab-pattern.js`, drawn by `src/lab-plush-views.js`).

- **Body types:** a standing bear (upright: bears, monkeys, people), **four-legged sitting** (dog, cat, fox, lion, horse, unicorn, deer,
  dinosaur…: head sides and gusset with its snout, body sides, underbody, front and hind legs on four pads), the elephant, a **sea creature**
  (whale, shark, dolphin, fish: body sides, a belly in the contrast cloth, side fins, a dorsal fin and a fluke or a tail fin; sized by its
  length), a bean character, a bunny and a pillow character.
- **Parts**, each on the body types that take it: a snout (none, short, long, broad), horns (one, two, antlers), a mane (a ruff round the face,
  or a crest down the back of the neck, in its own colour), wings (lined), spikes down the back, a dorsal fin, the tail's kind (short, long,
  bushy, tuft, hair; a fluke or a fin at sea) and the head's size against the body (80% to 130%). Ears may also be floppy.
- Each part adds its pieces, cut and counted (so the exploded view and the cutting layout carry them), and is drawn on the front, back and
  side. The label says what the toy is and what it is cut as: *Fox · four-legged sitting body*.
- **From the concept.** The concept's words and the reading of its picture choose the body type and the parts, so a concept opens in Pattern
  as the animal it shows. A concept saved before the kit keeps its old shape until its picture is read again or its body type is changed.

### The plush developer check

**Developer check** on a plush's Pattern page brings the drawing close to the concept's picture, the same way as a shoe's (below), with
`src/lab-plush-review.js`:

1. **Two soft-toy developers**, Claude and, when `OPENAI_API_KEY` is set, an OpenAI vision model (`SHOE_CHECKER` picks them, both by
   default), each look at the picture and the toy's front, back and side on one sheet, on their own, and score six points out of 100: the
   body type and proportions (25%), the face (20%), the ears (10%), the legs and arms (15%), the parts (15%) and the colours (15%). The
   stricter score stands.
2. **They ask for changes to the toy's choices** from the kit, never to the drawing: the body type, ears, snout, horns, mane, tail, wings,
   spikes, dorsal fin, head size, height, cloth, eyes and colours. A new body type brings its own parts and keeps the colours, cloth, eyes,
   logos and sketches; a part the body type cannot take is not made. A plush built from parts is changed by its parts instead:
   `part.<slot>` (a part in a slot, the body included), `part.extras` and `size.<slot>`, with the parts menu in the brief. A part that does
   not go on the body is not made, so the part already there is never lost. A fixed type changed to `build` keeps its parts and its height
   (`buildFromKit`), so a developer can turn a four-legged animal into a dragon with bat wings, part by part. What both ask for is made (numbers within 15%, and colours that nearly
   match, are met in the middle); where they ask for different things, the choice is left and listed for a person. What the kit cannot show
   (a scarf, a printed pattern) is listed for a person too.
3. **Round after round** the toy is drawn again and scored, until it clears **90**, there is nothing left to change, or two rounds gain
   nothing (at most four). Below 90 it says a person is needed. **Use it** puts the result on the page, to save.

The routes are the shoe's (`POST /v1/lab/concepts/:id/pattern/review`, then `GET …/review/:rid`), with the same daily cap
(`SHOE_REVIEW_DAILY`). Without Claude it says only the pattern's own checks ran. `PLUSH_REVIEW_FIXTURE` stands in for the judges in tests.

**Product → Exploded → Cutting layout.** The slider (or **Explode it**) lifts the pieces off the product (front and back side by side), spreads
them out, then lays every cut flat on the cloth. The cutting layout shows each fabric at its width, how much it takes (yards), and how much of
the cloth is used. That is an estimate from a simple row layout; the factory's marker does better.

Files: `GET /v1/lab/concepts/:id/pattern.dxf` (R12, inches, on the CUT, SEW, GRAIN, NOTCH and TEXT layers, for Gerber, Lectra, Optitex or CLO)
and `pattern.svg` (every piece at real size: print at 100%), each for the size asked for (`?size=L&width=60`). A plush's choices, and a
garment's seam allowance and cloth width, are kept in `lab_patterns` (`GET|PUT /v1/lab/concepts/:id/pattern`).

A pattern from the Lab is a **first block from the measurements**: a pattern maker trues it up on the first sample. Toys and objects (tooling) and
electronics (the engineering) say so on the Pattern view: they come next, one at a time.

## The line plan page

An open plan (`drawPlan` in `src/lab.html`) is laid out as Liquid Glass over a slow field of colour: the plan's name, season and actions; its
totals (they count up when the plan opens); a bar that stays under the tabs as you scroll, with the plan's sections (Pieces, Price ladder,
Graphic program, Across the range) and, while anything is being made, a pill that says so and jumps to it; then each piece as a card, its
role shown by the stripe down its side, its price, cost, margin (with a bar, green at 65% and up) and quantity, and its actions.

**Make concepts says where it is on the piece's own card**, from the press until the concepts are on the board: the step it is probably on
(design, draw, check, from the usual timings, since the service only says running or done), the time so far and a bar. The request asks for
the work at once (`?wait=0`) and the job is kept in this browser (`fb.lab.making`), so leaving the page or reloading it picks the work up
again. When it is done the card says how many concepts were made, with a link to them on the board, and a note rises at the bottom; the page
does not jump away, so several pieces can be made at once. Before this the button showed a tick as soon as the request was accepted, while
the work was still running further down the page. Journeys J197, J199 and J201.

## Footwear: the last, the size run, and the upper in pieces

A footwear concept (`src/lab-footwear.js`, shared by the page and the service) starts from its style:

- court sneaker (cupsole), runner (EVA midsole), derby, penny loafer, Chelsea boot, or 6 in lace-up boot;
- or the style is read from its words.

Pattern shows the shoe on its **last**. The page also lists the last's numbers, the size run, the tooling, the leather and the components.

**The last** is drafted from:

- **the size**, in US men's, US women's, UK, EU (Paris points) or Mondopoint. A full US size is ⅓ in of foot.
- **the width**: B to EEEE for men, AA to E for women.
- **the toe shape**, which sets the toe allowance (round ½ in, almond ¾ in, square ⅝ in, pointed 1¼ in).
- **the heel height and toe spring** (each style has its own defaults).

From those, the page gives the last's length, foot length, ball and instep girths (a men's D at US 9 is 9⅜ in round the ball, graded ¼ in a size
and a width), ball and heel widths, and where the ball sits. **Last spec (SVG)** draws the side and the bottom with those numbers for the last
maker, in any size (`GET /v1/lab/concepts/:id/last.svg?size=`).

**The upper** is drafted on the last's standard (its flattened side):

- **Pieces of the upper:** the vamp (cut whole: the half on the standard mirrored over the centre line), the quarters (outside and inside, the
  inside collar ⅛ in lower), the eyestays and the tongue for laced styles, the toe cap, the heel overlay, the back tab, the elastic gores of a
  Chelsea, and the moc apron of a loafer.
- **Inside the shoe:** the quarter and vamp linings, the tongue (a face, a lining with the size label printed on it, and the foam between), a heel grip over the counter, non-woven backers under the eyestay and the topline, the heel counter and toe puff (thermoplastic), and the sockliner.
  - **Padding by style** (`PADDING`): collar and tongue foam in mm, from none on a loafer or a Chelsea to 10 mm on a hiking boot's collar.
  - **Under the foot** (`lastingOf`): board-lasted styles fold a ⅝ in lasting allowance onto an insole board; runners and hikers are strobel-lasted, their upper's edge (3/16 in) stitched to a strobel sock.
  - **Warm and waterproof:** an insulated lining (200 g) adds an insulation layer cut as the linings, and shearling is a lining choice; a membrane (on by default for a hiking boot) adds a sewn, seam-taped bootie between the upper and the lining. All of these reach the bill of materials.
- **Allowances:** each piece carries the ⅝ in lasting allowance and ⅜ in overlaps.
- **How many to cut** is for a pair of shoes: 2 of a piece there is one of on a shoe, 4 of a piece drawn for one side that goes on both.
- **The lines agree before the shoe is drafted.** The collar, the vamp line, where the lacing starts and the eyelets are each set on their own (dragged, or read off a picture), so `footwearPattern` reconciles them and says in the notes what it moved:
  - on a low shoe the lacing (a slip-on's throat) starts ½ in or more in front of the ankle bone
  - a laced low shoe keeps 1⅛ in of lace edge behind the vamp line; the vamp line moves forward when there is no room
  - on a boot or a high-top the front of the leg stays a fifth of the foot's length behind the vamp line
  - eyelets are never closer than ⅜ in: a short lace edge takes fewer than were asked for
  - a Chelsea's gore is 3⅜ in on a 6 in collar and the same share of a lower one
- **Does it go together** (`footwearAssembly`, on every pattern as `assembly`; what fails is a finding on the Pattern page):
  - every piece cut whole (vamp, toe cap, saddle, vamp lining, toe puff) is measured along sections marked across it against a tape over the last there: its allowance is left each side, never 1/16 in short, and at the tip of the toe
  - the vamp's fold against the last's centre line; the lining and the toe puff inside the vamp
  - the back seam's two sides; each quarter's allowance; the quarters' (a Chelsea's front shaft's) front edge against the line it laps to on the vamp
  - a boot's or a high-top's leg as high as cut as it is drawn, from the back seam to the front of the leg
  - a Chelsea's gore into the back quarter and the front shaft, level across the collar
  - a strobel upper's edge against the sock's, notch to notch along each side and round the heel and the toe
  - the tongue as long as the lace edge (measured off the eyestay), ⅜ in under the vamp and 2 in above the collar; its lining and foam
  - the counter below the topline and short of the upper's edge; the insole, sock and sockliner against the bottom of the last
  - what a shoe cannot be made without (counter, toe puff, insole or sock, tongue and eyestays on a laced shoe, a Chelsea's gores)
  `test/lab-footwear-assembly.test.js` holds every style and variant to it at three sizes and across the choices that used to break, and breaks twelve shoes on purpose. `npm run pattern:proof` counts footwear too.
- **The sole unit** (cupsole, EVA midsole, or a stitched outsole and heel) is shown as a moulded component: it is never cut.

**Sandals, clogs, slides and mules** (`openPattern` in `src/lab-footwear.js`). Four more styles, each with the ways it is made (`VARIANTS`, the
Pattern page's **Made as**):
- **Sandal** (two-strap, thong, fisherman, multi-strap): nothing is lasted. Each strap is cut flat, its length the way over the foot at its place
  (half round an ellipse as wide as the footbed and as high as the last, less a little so it sits snug), with ⅝ in tucked under the footbed at
  each side; a buckled strap is split into its holed side and its buckle side. Every strap is lined. A thong has a toe post and a strap to each
  side; a fisherman sandal five cross straps, a centre strap, a heel strap with a counter, and an ankle strap with its buckle tab. The footbed
  (cork and latex, or die-cut EVA for a thong) and the outsole are made, not cut; the top cover is cut from the bottom of the last.
- **Footbed clog** (suede with a buckle strap, or on a wooden base): a closed vamp cut whole, tucked under a cork footbed, or turned under and
  tacked round a carved wooden base; no back.
- **Moulded** (pool slide, recovery slide, moulded clog): injected in one piece. Only a pool slide's strap is cut; a recovery slide has nothing
  to cut; a clog's pivoting heel strap is moulded and riveted. Tooling is an injection mould a size (no lasts), cut oversize for the EVA's shrink.
- **Mule** (loafer, heeled, sneaker): the closed-shoe draft with no back: the sides start a third of the way along, low at the back, and there
  is no counter, heel grip or back tab. A heeled mule over 1½ in is flagged.

Each has its components (footbed, top cover, outsole, buckles, toe post plug, tacks, rivets), its tooling (footbed and outsole moulds, cutting
knives, a CNC program for a wooden base, injection moulds) and its checks (strap fit on a low and a high instep, the toe post, the EVA's shrink,
a clog's throat). The tech flats draw them too: the straps or the shell on the footbed, the footbed showing from above, no toe line on an open
toe. The footwear catalogue's sandals and clogs now name these styles, so 50 of its 91 styles can be drafted. Journey J295.

Product → Exploded → Cutting layout works as for clothes, with the side and the bottom of the shoe side by side. The size picker redraws the
whole shoe in any size of the run; the DXF and SVG come in the size asked for.

**The size run** covers every size from and to, in half sizes or not. For each size it gives the last length in mm, the ball girth, the EU and UK
equivalents, and which sole **mould** the size shares (one mould for each pair of half sizes).

**Tooling** counts the lasts (a pair a size) and the moulds, with rough cost ranges and how many weeks they take. **Leather** is given in square
feet for a pair, with a quarter allowed for cutting round the hide's flaws.

**Before the sample**, the page flags:

- a heel outside the style's usual range;
- a high heel with too little toe spring;
- a pointed athletic toe;
- a collar that sits on the ankle bone.

It then lists the fitting and size-run samples and the tests (sole bond, flex, abrasion, colour fastness, restricted substances).

## Bags

Bags are designed the way the best bag lines are (`src/lab-bags.js`): the kinds we make are a rolltop, a clamshell zip and a top-loader
backpack, a sling, a tote, a helmet bag, a two-way work bag, a messenger, a duffel, a waist bag and a crossbody pouch, each with its usual
size in inches, its litres, how it is carried and how it closes.

- **The concept writer** (`CATEGORY_WORDS.bags`) designs a bag in order: the shape and proportion (a backpack about 1 : 1.4–1.5 width to
  height and 0.4 of its width deep), how it opens and is carried, the panels in at most two fabrics and one accent, and one hero idea of our
  own visible from the front. It names real bag materials (denier, ripstop, ballistic, laminated sailcloth, waxed canvas, leather), real
  hardware in one family and one finish with one zip gauge, and real construction, and leaves out gimmicks. No brand is named to it. The
  concept carries `spec.bag` (kind, inches, litres, body, closure, colours of the body, trim, webbing, hardware and lining).
- **The picture** (`bagShot`) is a premium three-quarter render with a light realistic load and a slight natural sag (not over-inflated),
  on a set chosen by kind: a clean warm studio (zip backpacks, totes, work bags, pouches), a dark technical studio with the bag standing on
  a dark floor (rolltops, slings, waist bags), or an editorial still life (helmet bags, messengers, duffels). As for shoes, no logo is pasted
  on it and no dark card: a small quiet lockup in the corner.
- **The board** gives a bag its front and back flats, the on-model views and a design sheet.
- **Drawn in panels in the Studio**: a bag's Flats in the Studio is its drawing in panels (below), in four views: **Front, Back, Side,
  Top**. The front is drawn from the board's front view (drawn from the picture first when missing); back, side and top from the front.
- **The library of bag flats** (`src/bag-templates`, `src/lab-bag-templates.js`, built by `scripts/bag-templates/build.mjs`): eleven
  original bag technical flats, one per kind, each with its front, back and side, drawn once in a neutral prototype colourway (light-grey
  body, darker-grey webbing and trim, black hardware) and traced into panels. They sit in the Sketch library under **Bags**. A bag opens
  there with its three views; the colour picked goes on its body. **Open in the Studio** makes a new bag concept with the drawings in place
  (`POST /v1/lab/concepts/from-library-bag`), and **Or put this on a concept you already have** puts them on a bag concept
  (`POST /v1/lab/concepts/:id/shoe-drawing/from-library`). No image model is used, so nothing is charged. A view not in the library (the
  top) is drawn from the front drawing as it stands, the designer's edits included. **Back to the drawing as traced** on a library view
  goes back to the library's drawing.
- **The tech pack** takes a bag's drawings as its technical flats (each view and one sheet of them all), with its kind, size, carry and
  closure under construction, even when an older tote-style flat was saved for it.

### A shoe drawn in panels (the Studio)

A footwear (or bag, above) concept's **Flats** in the Studio (`/lab/shoe-flats`, in the Studio's frame; `src/lab-shoe-draw.js`, `src/lab-shoe-draw-routes.js`, table
`lab_shoe_drawings`) is the shoe as a footwear technical flat, the way a designer draws one, in five views: **Outside, Inside, Top, Bottom, Heel**.

- **How it is drawn.** The image model redraws the shoe's side profile (the board's flat front view, drawn from the concept picture first when
  missing) as line art: even black outlines, dashed stitching, one flat colour per panel. Inside, top, bottom and heel are then drawn from that
  outside drawing, so all five are the same shoe. About a minute a view; `LAB_DAILY_SHOE_DRAWINGS` (60) caps the views a day; a room is charged
  one unit a view.
- **How it is traced** (`traceShoe`, no AI): the very dark thin strokes are the line work; every run of one colour inside them is a panel; slivers
  (soft edges) are line work too; panels grow under the lines so neighbours meet with no gap; each panel is followed along its edge, simplified
  and drawn as smooth curves. Panels drawn in one colour share it exactly. The lines that are not a panel's edge (stitching, sipes, tread, laces)
  are kept as a details layer.
- **What the designer does.** Pick a panel: recolour it (or every panel in that colour), name it (vamp, quarter, toe cap…), hide it, or reshape
  it by dragging its points: points of neighbouring panels that sit on the same spot move with it, so a shared seam stays shared. Double-click an
  edge to add a point, Alt-click a point to remove it. **Colours in this view** recolours a whole colour at once (a colourway), and **Same
  colours on every view** carries it to the other four. Stitching and tread lines switch on and off. Undo and redo; **Back to the drawing as
  traced**; **Draw again**; Download SVG; the Studio's spec sheet button opens all five views on one sheet.
- **Colours follow the drawing.** The pattern takes its colours from the outside drawing (`drawingColours`) whenever the drawing was changed
  after the pattern was last saved: the last edit wins, so a colour then changed on the Pattern page stays until the drawing changes again. A
  panel the designer named says its part (vamp, quarter, tongue → upper; toe cap, mudguard, eyestay, heel counter, cage → overlay; midsole,
  foxing, welt → sole; outsole, tread → outsole; laces; lining). The rest are read from where their colour sits: the colour along the ground is
  the outsole, the broad colour just above it the sole (the outsole's colour when there is none), and above the sole line the largest colour is
  the upper and the next the overlay. The Pattern page says which colours came from the drawing; re-reading the shoe keeps them. A material
  chosen for a part, with its own colour, still wins on that part.
- **One shoe.** The Pattern page reads the shoe from the designer's outside drawing as saved (before the side profile or the picture), so the
  last's outline, collar and toe spring follow the drawing's edits, and lays that drawing under the shoe. A shoe sent to its tech pack takes these
  drawings as its technical flats (each view and one sheet of all of them) in place of the views drawn from the pattern.

**The Studio's tools on the drawing.** The drawing page tells the Studio when it is ready, so the Studio's rail, options bar, Panel and Focus
reach it as they reach a garment's flats:
- **Panel** folds its panel away; **Focus** floats its own bar (views, undo, save) at the foot, its panel on the right and its zoom in the
  corner, in Liquid Glass, so nothing sits under the Studio's floating bar.
- **Zoom**: pinch, Ctrl or ⌘ and the wheel, the − / + / Fit pill, ⌘+ ⌘− ⌘0, the hand tool or the space bar to move around. With a Pencil,
  fingers move and pinch the view while the Pencil draws.
- **Select** picks a panel (recolour, rename, reshape its points) or a graphic (drag, a corner sizes it, the green knob turns it).
- **Fill** paints a tapped panel in the rail's colour; **Pick** takes a panel's colour for Fill, the brush and new shapes.
- **Liquify** (Push, Twirl, Pinch, Bloat, at the bar's strength) moves panels, seams and stitching together under the brush; where the brush
  first reaches a panel, its long straight runs get points along them so they bend where they are pushed.
- **Brush** and **Line** draw lines on it; **Type** puts words on it; **Rectangle**, **Ellipse** and the **Pen** add new panels, outlined
  like the rest; the **Eraser** rubs out what was drawn or a panel that was added.
- **The options bar** flips, brings forward, sends back, duplicates and removes the chosen panel or graphic.
- **Graphics**: the panel's Graphics, **Add from the library**, places a library graphic on the view; a graphic kept in the graphic studio
  lands on it too.

Lines, words, added panels, liquified stitching and graphics are saved with the drawing (`marks`, `graphics`, `details` in
`cleanDrawing`), and `shoeSvg` draws them, each graphic's picture put in by `withArt`, so the SVG, the board and the tech pack show them.
The pattern and engineer pages fold their panel with the Studio's Panel button too. Journey J293.

Routes: `GET|POST /v1/lab/concepts/:id/shoe-drawing`, `PUT /v1/lab/concepts/:id/shoe-drawing/:view`, `POST …/:view/reset`,
`GET …/:view.svg` (or `?art=1` for the line art). Journey J280.

**The library of footwear flats** (`src/footwear-templates`, `src/lab-footwear-templates.js`, built by `scripts/footwear-templates/build.mjs`
from the catalogue in `scripts/footwear-templates/catalogue.mjs`). The catalogue is the range a footwear designer works across: 91 styles in 13
types (lifestyle sneakers, running, court and field sport, outdoor and hiking, boots, work and safety, dress and loafers, clogs and mules,
sandals and slides, flats and Mary Janes, heels, slippers, kids), each with its construction, closure, height, the pattern style it is
drafted in (or the new style it needs) and a priority, with a note on each type's market. A style is in the library once it is drawn: an
original technical flat in its five views, drawn once in a neutral prototype colourway (light-grey upper, darker-grey overlays, pale-cream
midsole, mid-grey outsole) and traced into panels. Thirty-eight are drawn so far. They sit in the Sketch library under **Footwear**, by type; the
colour picked goes on the upper. **Open in the Studio** makes a new footwear concept with the five drawings in place and its pattern drafted
in the library shoe's style (`POST /v1/lab/concepts/from-library-footwear`); **Or put this on a concept you already have** puts them on a
footwear concept (`POST /v1/lab/concepts/:id/shoe-drawing/from-library`, which refuses a bag on a shoe and a shoe on a bag). No image model is
used, so nothing is charged. **Back to the drawing as traced** goes back to the library's drawing. `GET /v1/lab/library/footwear` lists them,
`GET /v1/lab/library/footwear/:id` gives one with its views. Journey J292.

### How a shoe concept is designed and drawn

The concept writer gets a footwear designer's brief (`CATEGORY_WORDS.footwear` in `src/lab-concepts.js`). It designs the sole unit first (cupsole
sidewall, a sculpted EVA midsole, or a stitched sole and heel), then the silhouette, then the blocking of the upper's panels in two or three tones
with one accent, and one hero idea of our own that shows from the side. It names real footwear materials and colours, and leaves out gimmicks
(bolt-on hardware, patches, straps that do nothing).

The picture (`footwearShot`) is a premium photoreal render: a three-quarter view of the outside, toe to the right, camera slightly low, built from
the concept's own shoe choices (style, upper, toe, toe cap, mudguard, sole). The set follows the style (`FW_STAGE_OF`): court sneakers, derbies and
loafers on a clean, warm studio float; runners and high-tops in a dark studio with a rim light; boots as an editorial still life. Our logo is not
pasted flat on a shoe, and the dark label card is left off: the picture carries only a small, quiet lockup in the bottom-left corner, ink or white
to suit the set. The logo and the label are on the tech flats and the pack.

**See it made** on the Pattern page draws the shoe from its tech flats in side profile, on a seamless set in a tone from its own colours.

### Reading a shoe from its picture

A footwear concept with a picture (an AI concept, the studio's picture, or a photo) is read by `src/lab-shoe-read.js`, so its last and its upper
follow what was designed. The styles cover athletic shoes and boots alike: court sneaker, high-top, runner, derby, loafer, Chelsea, lace-up boot
and hiking boot.

**Which picture.** A shoe's concept picture is a three-quarter render on a styled set (see *How a shoe concept is designed and drawn* below), so the
outline is read from its **side profile** (the board's flat front view) when there is one. When there is not, it is drawn from the concept picture
first (one image), kept on the board, and read. The answer says which picture was read (`from`: `side` or `picture`), and the page lays that one
under the shoe.

**The outline** (no AI) separates the shoe from a plain background and finds which way the toe points. From the top and bottom edges, heel to
toe, it measures:

- the collar height (just in front of a pull tab);
- whether it has a shaft;
- the dip at the ankle and the toe spring.

It suggests a high-top or a boot when the collar says so. A front, top or sole view is not read as a side.

**The eye** (the vision model, when Claude is connected) reads:

- the style and the toe;
- the toe cap, the mudguard and the heel overlay;
- the upper and the sole;
- the eyelets a side, where the vamp seam and the lacing sit along the length, the collar, the heel and the sole thickness;
- the colour of each part.

The outline's collar wins over the eye's guess. A new style brings its own heel, toe spring and toe until the picture says otherwise.

`POST /v1/lab/concepts/:id/pattern/from-picture` returns the shoe the picture asks for and what would change, each change with where it came from.
Nothing is saved. Pattern does this by itself the first time a pictured shoe is opened with no shoe chosen yet. It shows the changes, and **Use it**
applies them. The concept's picture is then laid over the shoe's side, lined up on the last (its length is the last's, its bottom the ground), so
the drafted pieces can be checked against the design. The picture can be hidden. **Read the shoe from the picture** reads it again, for example after
the picture changes.

What the picture sets can also be set by hand, and every value is bounded:

- the collar height and the sole thickness;
- the vamp line and where the lacing starts (as shares of the length);
- the eyelets, the mudguard and the heel overlay;
- the sole type and the colours.


### Bag patterns

A bag concept opens on the Pattern page as kind `bag` (`bagPattern` in `src/lab-pattern.js`; `cleanBagSpec` in `src/lab-pattern-routes.js`), drafted from its kind and body size (width × height × depth; from the concept's bag choices, else the kind its name says, else a tote):

- **Zip backpack:** front and padded back panels rounded at all four corners; a clamshell zip gusset in two halves over the top and down the sides, and a base gusset across the bottom and up each side; padded shoulder straps; a front zip pocket; a laptop sleeve.
- **Rolltop:** the panels and the gusset carried up 8 in for the roll, side straps and buckles, a stiffener in the roll edge.
- **Top-loader:** a drawcord channel round the top, a lid flap that crosses the top and comes down the front to its buckles.
- **Tote:** a gusset down a side, across the bottom and up the other; the top 1½ in turned to the inside, the lining sewn to its edge; handles; a base board.
- **Helmet bag, work bag, pouch:** the same gusset, and the top closed by a zip between two top panels; a helmet bag's zip flap, a work bag's laptop sleeve.
- **Messenger:** a flap hinged on the back's top edge that crosses the top and comes most of the way down the front, with buckles and hook-and-loop.
- **Duffel:** one body wrapped round two round ends, its two long edges meeting at the zip along the top; handles each side of the zip.
- **Sling, waist bag:** crescent panels, a zip gusset in two halves over the top and a gusset round the belly, a front pocket inside the panel's outline.

**How a bag goes together.** Each panel and gusset labels its corners, and the pattern carries its `assembly`: every seam as the two runs of outline sewn together, every zip with the two edges it joins and its length, every edge finished on its own (a channel folded, a flap bagged out), and everything sewn onto a panel with where it sits (a pocket, a sleeve, handle and strap ends). Rules the drafting keeps:

- A gusset is as long as the panel edge it is sewn round, measured off that panel's outline, rounded corners included.
- A zip gusset is two halves; the halves and the ½ in of zip between them make the depth. A bag under 1¼ in deep has its zip sewn straight to the two panels.
- A zip is 1 in shorter than its opening, so it stops ½ in short of each end, under a tab.
- The lining is built the way the shell is (its panels, its gusset, its zip gusset or top panels) and joined at the top or caught in the zip seam.
- A handle is long enough to rise 11 in (a tote, to go over a shoulder) or 5 to 9 in (hand carried) with its two ends stitched down 2 in.
- A detachable strap's swivel hooks have D-rings to clip to; every zip slider has a puller; binding tape covers every inside seam.

Every bag lists its zips (gauge, way and length), webbing, buckles, hooks, rings, sliders, foam, spacer mesh, binding and thread. A gusset, a lining or a sleeve sits under the panel on the product, so the explode shows it. It is a first block from the size: sample it, then true the panels to the drawing.

## The construction check and the cut-and-sew proof

The runbook for a new product — what runs on its own, what to do when it fails, how to add a style or feature — is [pattern-process.md](pattern-process.md).

A pattern is only right if it sews together into the garment it was drafted for. `constructionCheck` (`src/lab-pattern-check.js`) proves that by measurement, with no AI and no picture. It runs in the page and on the service.

- **Seams.** Each block a garment is built from (`pat.block`) labels its corners: the front, back and sleeve; each leg; a skirt; a tailored jacket's front, side body, back and two-piece sleeve; a bikini brief. Each pair of edges sewn together is walked against the other. They must match within ⅛ in, or ease within the range a factory sews:
  - a set-in cap ¼ to ¾ in into its armhole on a knit, ¾ to 1½ in on a woven
  - a back shoulder ⅛ to ½ in onto the front of a tailored jacket
  - a rib stretched 8 to 22% onto the neckline
  - a waistband 1 to 2¼ in over the waist, to overlap at the fly
- **The made garment.** Measured off the pieces as they are sewn, against the spec within factory tolerances:
  - tops: chest 1 in below the armhole, length from the high point of the shoulder, shoulder, neck, sleeve and opening
  - bottoms: waist, hip, rise along its seam, inseam, thigh, leg opening, sweep
  - bags: width, height and depth
- **A bag's assembly.** `checkBag` walks the pattern's `assembly`: the two sides of every seam of the shell and the lining; the two edges each zip joins, and the zip in its opening; that every edge of every piece is sewn or finished once (none left open, none used twice); that a pocket or sleeve lies inside the panel it is sewn on, and handle and strap ends sit clear of its seams; that a flap or lid reaches down the front; that a handle rises; that the shoulder straps let out past the back; that the binding tape covers the inside seams. `missingComponents` asks for a puller to each slider, a D-ring to each swivel hook, a slider on an adjustable strap, foam where a part is padded, the lining's gusset, a drawcord's lock and eyelets, a tote's base board.
- **Collars, stands and hoods.** Each records the length of the edge it is sewn on by, measured off its own outline, and is walked against the body's neckline. The neckline runs front edge to front edge for a shirt stand, or centre front to centre front, less any designed turn-back at a zip. A hood's neck edge is solved to half the neckline.
- **Clean outlines.** No cut piece may cross itself or have a corner sharper than 20°.
- **Everything it is made with.** Every garment goes through `finishGarment` (`src/lab-pattern.js`). It adds whatever drafting has not:
  - labels: main, size, care and content
  - thread, estimated from the seams and the stitch
  - a back neck tape on knit tops
  - a fly's zip and waist button, waistband fusing
  - a skirt's zip and hook
  - fusing on woven collars, stands, cuffs and plackets
  - a shirt's sleeve plackets
  - a hood's lining and drawcord
  - a placket's buttons
  - a bra's elastics

  A tailored jacket's sleeve linings are cut from its top and under sleeves. `missingComponents` (`src/lab-pattern-check.js`) holds every garment to the same list, so a missing part fails the check like a seam that does not walk.
- **The cutting table.** `layoutOf` builds a marker for each cloth at its width:
  - each piece is dropped, by its outline, to the lowest place it fits
  - a piece may be turned end to end, its grain kept along the selvedge
  - the shortest of several orders is kept, never longer than plain rows
  - every layout item has `at(pts)` for drawing a piece where it lies

**Headwear and totes** are one size and checked against a 22¾ in head (adjustable caps and bucket hats fit about 21½ to 24 in):
- **Six-panel cap.** Each panel is a sixth of the dome: as long as a quarter of the dome is round (so the crown height reads back off it), and at every point of its length as wide as a sixth of the dome is round there, so the six lie round the crown and meet in a point under the button. The check measures the six across at a quarter, half and three quarters of the way down against the dome's round. Each back panel has the back opening cut from its foot (1⅛ in across, 1½ in up). The brim's inner edge spans the brim's width and is bowed to run across the two front panels and an eighth of each side panel. Its centre length is set from the seam. The board is the brim inset ¼ in, with its two points left out. The sweatband is the feet of the six panels as cut (the back two short by the opening), plus ½ in turned back at each end; the check measures the feet off the panels. The seam tape covers the six crown seams.
- **Bucket hat.** Its two widths are the sketch's, seen from the front: the crown width is across the hat at the brim seam and the brim width across the brim's edge, so the brim stands out half their difference each side (1¾ in of a 2¼ in brim on the base hat) and the check measures that off the pieces; a wider crown is a bigger head opening, 2 in round for each inch across. The head opening is the band's foot. The band and the brim are each a cone round the head, so each is cut as part of a ring: its curved edges the two seams, its straight ends the side seams. The band's top is the crown's round and the crown's height runs up its slant; the brim's inner edge is the band's foot and it is the same length at its side seams as at its centre (both are checked). The crown oval is solved to the band's top.
- **Tote.** The body is cut twice the height plus the two 1½ in turn-backs, with the bottom fold and the turn-backs marked at each edge; the check walks each side seam's front edge against its back edge off the outline.
- **Beanie.** Knitted flat and linked at the back. The crown is closed by decreases at four points, so the top of the piece is four petals whose feet make the whole round; the cuff's fold is marked, and the cuff is measured from the fold to the edge.

`npm run pattern:proof` writes `pattern-proof/pattern-proof.html`. It covers every library garment at M, with a strip of XS to XXL, and every bag. Each card shows:
- the block pieces (a bag: the pieces of its shell, the long gussets under the panels), with each seam's two sides in one colour
- the seam and measurement tables
- the cutting table

`test/pattern-check.test.js` holds the whole library at every size, and every bag at its own size and at smaller, larger, shallower and deeper ones, to the check. It also breaks bag patterns on purpose (a gusset an inch short, a seam left out, a zip longer than its opening, a pocket off its panel, hooks with no rings) and requires each to be caught.

## Editing pieces and the AAMA/ASTM DXF

A drafted pattern is a start: a pattern maker can change every piece on the Pattern view and keep what they changed.

**A tailored jacket** (a blazer, a sport coat, a tailored overcoat: a jacket or coat with a lapel collar; `tailoredPieces` in `src/lab-pattern.js`) is cut as a tailor cuts it, not as a zip jacket with a lapel: a front with its lapel cut in one and rolled to the break, a side body under the arm, a back seamed down the centre with a vent, a top collar and a melton under collar, a facing, a two-piece sleeve with a cuff vent, a chest welt and flap pockets, a full lining, canvas and fusing, and no rib anywhere. **Double-breasted** (`breasted: 'double'`) takes a 3¼ in overlap and six buttons, and a peak lapel unless the lapel is set to notch; single-breasted a 1 in stand and two buttons. The concept's own words ("double-breasted", "peak lapel") are kept on its flats as it starts (`options.construction`, kept through a save), and **Read it from the drawing** reads both.

**The flats follow the picture.** A concept with a picture whose flats were never saved is drawn from its picture the first time its flats open (once per concept on the device; two AI generations): the stock sketch gives only the canvas, the scale, the centre line and the neck, and the image model traces everything else from the picture: the shoulder line (an extended or dropped shoulder stays so), the sleeves, the length and hem, a double-breasted closure with its buttons, the lapels and the pockets. The sketch is picked first by the words and then by the vision model from every sketch of the style (a "double-breasted" or "peak lapel" jacket is drawn from a blazer, never from the zip jacket).

**The sketch library grows** (`lab_sketches`; routes in `src/lab-flats-routes.js`). A piece's flats drawn from its picture are kept in the library when they are saved: the sketch they were drawn on (their frame, so they still measure in inches), the front and back drawings (the library's own copies; deleting the piece leaves them), what the piece is built with, its measurements and its name; saved again, the entry follows. A client's stays in that room; ours are everyone's. The library is used three ways:
- **Picking the sketch for a new piece** offers the grown sketches of its style beside the stock ones to the vision model; one chosen starts the flats as it is (its drawings copied over, `spec.drawnStart`), with no AI.
- **Nothing in the library fits**: the flats are drawn from the concept's own picture the first time they open (above), and when they are saved the drawing joins the library, so the next piece like it starts from it.
- **The sketch pack** (`/lab/sketches`) shows the grown sketches first ("Drawn from our pieces"), filtered with the rest; **Start a piece from it** opens a new piece on it (`POST /v1/lab/concepts/:id/flats/from-library-sketch`), and **Remove** takes it out (staff, or the room it belongs to; the pieces drawn from it keep their flats). `GET /v1/lab/library/sketches`, `…/:id/front|back|thumb`, `DELETE …/:id`. Journey J298.

**Add a sketch** (the sketch pack, Future Basics staff): the kind of piece, a name and what it is like; the image model draws its front and back technical flats on that kind's own sketch (so they measure in inches) and they join the library as ours (`POST /v1/lab/library/sketches/generate`, two AI generations). `scripts/sketch-library-seed.mjs` adds the kinds the stock pack is thin on (knitwear, tailoring and coats, dresses, headwear, active and skirts; 30 to start) against a deployed service with a staff token, skipping what is already there.

A sketch chosen by the person (a piece started from the sketch pack) is the sketch its flats are drawn on, whatever its name suggests.

**Checking the patterns before release** (internal; not in the product). Two scripts keep the library's patterns honest against their sketches:
- `scripts/pattern-read-sketches.mjs` shows each library sketch (front and back) to Claude and an OpenAI model, each on its own, and keeps what both see in `src/lab-template-construction.js`: for trousers and shorts the front pockets (slash, jeans scoop, with or without a coin pocket), cargo pockets, a carpenter's rule pocket and hammer loop, back pockets and their style (jeans, square, welt), a back yoke, belt loops, the waist, pleats, the knee, the leg, a curved hem, the ankle (cuff, elastic) and side panels or stripes; for tops the sleeve, hood, collar, opening, pockets, yokes, panels, quilting and belt. `constructionOf` drafts from it ahead of the sketch's name.
- `scripts/pattern-judge.mjs` (`npm run pattern:judge`) drafts every library sketch as a new piece would be, sets the sketch beside the pattern put together (as the Pattern page's product view), and has both models score each pair part by part and name the fix. It writes a report page (worst first) and its JSON; answers are kept by the pattern's fingerprint, so a run after a fix asks only about what changed.
- The starting measurements of every style (size M) and their grading were checked against about 60 published garment spec sheets; the sources and what changed are in `docs/measurement-sources.md`.
- `scripts/pattern-score.mjs` (`npm run pattern:score`) is the yardstick that needs no AI: it fills the sketch's outline and the pattern put together on a quarter-inch grid and scores shape (overlap with the sketch scaled to the pattern's width), proportions (width at 24 heights), size (overlap in true inches), trace (overlap in inches once a top's sketch is brought to the pattern's length) and features (each detail the sketch reads say it has, found on the pattern). It writes `score.json` and a page of overlays, the sketch in red over the pattern, worst first. Run it before and after a drafting change.
- `scripts/pattern-read-proportions.mjs` (`npm run pattern:proportions`) traces each top's proportions off its sketch: the shoulder, the armhole, the sleeve length and the angle the sleeve is drawn at are moved one at a time until the pattern, put together, lies closest over the flat drawing (the sketch brought to the piece's length, since the pack draws long). What helps is kept in `src/lab-template-proportions.js` as the change from the style's own measurements; `fitToTemplate` applies it when a piece starts from that sketch, so a boxy sketch drafts boxy and a dropped shoulder drafts dropped. The sketch's proportions win over the style's standard for these; the length still follows the sketch's ratio within the band its name allows, because the pack's own chest reads are too uneven to trust a length off them alone. The sleeve opening is not traced: it is cut to the arm.
- Bodysuits and dresses have their own blocks (`bodyProfile` in `src/lab-flats.js`). The side seam runs from the underarm to the hem through the widths the sketch draws at 11 heights, each taken against the sketch's own bust (not the pack's chest line, which is off on several dresses) and kept within what a body can be. So an A-line flares, a column stays straight and a slip skims. A bodysuit's leg is cut round to a narrow crotch, with a lined gusset, a snap tape and leg elastic; a dress gets waist darts where it is fitted, and an invisible centre-back zip (or the front zip its sketch shows). Sleeves come from the sketch's name (long sleeve, tee, short sleeve) unless the sketch read saw none; a long sleeve that hangs against the body keeps the usual body above the hip.
- Sleeves on the product are drawn as a flat sketch draws them: the outer edge straight from the shoulder point at the sleeve's angle for its full length, the hem straight across at the opening, the inner edge back to the underarm; a long sleeve hangs just clear of the body, a short one is held out at the angle its sketch is traced at. A cuff sits on the sleeve's end and carries on along it. A sketch's name sets its sleeve against its style's: a long-sleeve polo or tee gets a long sleeve and a rib cuff, a short-sleeve shirt a short one. The traced sleeve length stays within 1½ in of the style's (the pack draws sleeves long).
- Headwear on the product is seen from the front: a cap's crown a dome (the two fronts meeting at the centre seam, the sides at its edges) over a curved visor; a bucket hat's band with its crown a thin top edge and the brim sloping down and out.
- A shoe started from the library is drafted as that shoe, not only as its kind: its collar height and toe spring traced from its outside drawing, its upper and toe cap from its name (`npm run footwear:library` → `src/lab-footwear-template-specs.js`).
- Swimsuits take the bodysuit block, lined throughout, with swim elastic at the legs and edges. Camis take the dress-style side seam (up to a babydoll's flare). A piece with no shoulders is cut by its name: strapless, tube and bandeau pieces run straight across their top edge, and the length is measured from that edge, with gripper elastic and boning in a woven dress. Camis and slips sit on rouleau straps sewn at the cups, with sliders at the back. A bikini is a set: triangle or scoop cups on an underband with straps or a halter tie (or a bandeau), and a brief whose legs are cut to a narrow crotch, high-waisted or as a boy short where its name says so, with a belt where the sketch has one. The pack's bikini outlines fill the gap between the top and the brief, so their trace score understates the set. Lengths by name: a mini dress or skirt is 0.82–0.9 of the style's standard, a midi 1.1–1.3, a maxi or a gown 1.35–1.6.
Both need `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`. On the 92 trouser and shorts sketches the first round took the average score from 44 to 52 (pants) and 39 to 50 (shorts).

**Against the drawing** (in the pattern panel, trousers and shorts drawn from a sketch; `drawnCheck` in `src/lab-pattern.js`). The
pattern's front is put together (each leg laid flat, the legs meeting at the centre) and measured where the sketch is: the hip across, and
each leg at the thigh, the knee and the hem, beside the sketch's own widths (`drawnLegs` in `src/lab-flats.js`, read from the sketch's
outline in inches). The legs' shape is the design, so the knee and the hem are compared against the thigh: more than about a seventh off
the sketch's proportion is flagged, a smaller gap (over 5%) is said; the hip is said, not flagged (a sketch is drawn slimmer at the hip
than a body, and the pattern keeps the hip measurement). **Follow the drawing** (`POST /v1/lab/concepts/:id/flats/follow-drawing`,
`followTheDrawing`) makes the leg opening and the knee the sketch's, then trues them on the drafted pattern until the hem stands to the
thigh as the sketch's does (within about 2%); the flats keep it (`legsDrawn`, `kneeRatio`), and the Studio reloads them. A sketch picked
for a new piece already gives its legs, so a straight sketch is not cut tapered nor a slim one wide. Journey J296.

**Built with** (in the pattern panel, garments) says how the piece is built, the description the pattern is drafted from (`src/lab-construction.js`):
- **What it covers:** the sleeve (set-in, raglan, dropped, none), hood, collar, opening (zip, half or quarter zip, buttons, snaps, placket), front and back yokes, the pockets (kangaroo, split kangaroo, welt, flap, chest, flap chest, patch hip, cargo, five-pocket, slash), the waist (fixed, elastic, drawcord), double knee, the leg (straight, flare, wide, taper, balloon), pleats, panels and stripes, quilting, a belt and the lining.
- **Where it comes from, in order:** what is set on the piece, then what the library sketch's name says ("double-knee carpenter pants", "raglan boxy tee"), then the style's own (a zip hoodie has a split kangaroo).
- **Change it** sets any of it by hand; the pattern redrafts as you go and it saves with the pattern (`spec.construction`), so the production files use it too.
- **Read it from the drawing** has the vision model read the concept's picture and the drawn flats (`POST /v1/lab/concepts/:id/pattern/construction/read`), so a freehand drawing, which has no name to go by, drafts as what it shows. Nothing is kept until it is saved.
- **The sketch's length** is trusted only as far as its name says it is meant to go (`fitToTemplate`): a cropped sketch may shorten the piece, a long one lengthen it, and any other moves it at most about a tenth. This stops a misread hem from making a T-shirt dress 20 in long.
- `node scripts/pattern-audit.mjs` drafts every library sketch. It reports any piece floating off the product, and any feature a sketch's name promises that the pattern does not have.

**Edit pieces** turns the drawing into the chosen piece on a 1 in grid. In edit mode:

- **Freehand (a mouse, a finger or a Pencil):**
  - **✎ Redraw edge:** draw along part of the outline, from the outline to the outline, and that stretch takes your line. The hand's wobble is taken out and each point set on the 1/16 in (`replaceEdge`, `cleanStroke`).
  - **✂ Cut in two:** draw a line right across the piece and it is cut along it into two pieces, each with its own seam allowance: a new seam, a yoke, a panel (`splitPiece`).
  - **◯ Draw a piece:** draw a closed shape and it becomes a new piece (`drawnPiece`).
  - Each is one step in Undo.

- **Points:** drag a point, or move it with the arrow keys (1/16 in; ¼ in with Shift). You can also type its position in fractions (`24 1/4`).
  **Add point** puts one between the chosen point and the next; **Delete point** (or Delete) removes it. A piece keeps at least three.
- **Notches:** **Notch** (or N) puts a notch on the chosen point, or takes it off.
- **The piece:** rename it, and set how many to cut, the cloth, the seam allowance, the grain angle and whether it is cut in mirrored pairs.
  **Duplicate** copies the piece; **New piece** starts a 6 × 8 in rectangle; **Remove piece** takes it out of the pattern.
- **Undo, redo and reset:** Undo and Redo (Ctrl+Z, Shift+Ctrl+Z) go back and forward through every change. **Reset piece** returns a piece to
  its draft.
- **Measure and walk a seam:** Shift-click a second point to measure the run along the sew line between the two. Set that run as seam A, then
  set its partner on another piece as seam B. The page gives both lengths and how much one is shorter, so the seams can be walked before sewing.

**Save the pattern** keeps the changes in `lab_patterns.spec.edits`:

- the size they were made in;
- for each changed piece, its sew line, notches, box and settings;
- the added pieces and the removed ones.

Changing the shoe, the plush or the seam allowance keeps the edits.

**Grading the edits.** At other sizes, an edited outline is carried from its box to the drafted piece's box at that size, so a change grades in
proportion with the draft. A pattern maker checks the graded nest before sending it.

**The AAMA/ASTM DXF** (`pattern.dxf?format=aama`, the **DXF** button and **Files**) is the exchange file Gerber AccuMark, Lectra Modaris,
Optitex and CLO import as a graded pattern:

- **Pieces and sizes:** one block for each piece in each size.
- **Layers:**
  - 1: the cut line;
  - 2: the turn points;
  - 4: the notches;
  - 7: the grain line;
  - 14: the sew line;
  - 15: the annotation.
- **Text on each piece:** Piece Name, Quantity, Size and Material.
- **Text on the file:** Style Name, Sample Size, Units and the Size List.

The file comes in one size or the whole run (`&sizes=all`), in inches or millimetres (`&units=mm`). The plain DXF (CUT/SEW/GRAIN/NOTCH/TEXT
layers) is still there for anything else.

**Both DXFs are written whole** (`src/lab-dxf.js`). A strict reader such as GroupDocs/Aspose, or a cutting-room system, opens them. The first
plain DXF had only a header and the entities, and strict readers failed on it with "Object reference not set to an instance of an object". Each
file now has:
- **Header:** the R12 version (AC1009) and the drawing's extents.
- **Tables:** viewport, line type, every layer it draws on, text style, application id and dimension style.
- **Blocks:** model and paper space.
- **Entities:** each with a handle.

Text is plain ASCII. In the AAMA file, each cloth's layout sits below the last, so contrast pieces no longer land on the self pieces. The
plain DXF's labels are sized to their piece: the name, then the cut. Every file checked passes ezdxf's strict reader and auditor with no errors
and no fixes, and dxf-parser reads them all.

## 3D lasts: importing one, having one made, drafting on it

A footwear concept can work from a real last instead of the drafted one. The **3D last** panel on the Pattern view handles this
(`src/lab-last3d.js` measures, `src/lab-last-routes.js` serves).

**Import a last** takes the file a last maker or a scanner made: STL (binary or text), OBJ or GLB, up to 75 MB. The units (mm, cm, inches or
metres) are worked out from its length, or chosen. The Lab then:

- **stands it the way a last stands**, whatever way the file has it:
  - heel to toe along its length;
  - the cone up;
  - the tread level across the ball;
  - turned only, never mirrored, so a left last stays a left last;
- **measures it** as a last maker would:
  - last length and the ball's place;
  - ball and instep girths, taken round the outside of the section like a tape;
  - ball and heel widths at the feather line;
  - heel height and toe spring;
  - back and toe heights, and volume;
  - which foot it is;
- **compares it** with the drafted last in the same size, number by number;
- **flags holes:** a few small holes, as scans often have, are said and do not matter. Large ones are flagged.

**Heel height.** Give the heel height the last was made for; the shoe's own heel is offered. The last is then rocked about the ball until the
heel seat stands exactly that high, and the toe spring is measured from there. Leave it empty and the last is stood on its ball as an
estimate. That is close for a low heel and can be off by a few degrees on a high one, because a last's bottom is nearly flat round the ball.

**Draft the shoe on it** puts the measured last in the shoe (`spec.last3d`):

- the size becomes the nearest one in the shoe's system;
- the heel height and the toe spring become the last's;
- the upper is drafted on its side profile and its bottom outline;
- other sizes grade from it as the drafted last grades: the length by the draft's own steps, the sections by ¼ in of ball girth a size.

**Stop drafting on it** goes back to the drafted last.

**Make one with the 3D service** (Meshy, `MESHY_API_KEY`) draws the drafted last from four sides and sends the pictures to the service's
multi-view model. **From pictures of a last…** sends one to four photos of a real last instead. The service's model has no units, so it is:

- scaled to the drafted size's length;
- scaled across until its ball girth is the size's;
- stood on the heel height;
- measured like an imported one.

Making a last counts as three AI generations on a client's meter, and the service makes at most `LAB_DAILY_LASTS` (6) a day.

Files:

- each last as an STL (`/lasts/:lid/last.stl`), in mm with Z up, turned the way it stands;
- the drafted last, or the one in use, lofted into 3D at any size (`GET /v1/lab/concepts/:id/last.stl?size=`), for CAD or a last maker.

Routes:

- `GET|POST /v1/lab/concepts/:id/lasts`;
- `POST …/lasts/generate`;
- `POST …/lasts/:lid/use` and `POST …/lasts/unuse`;
- `DELETE …/lasts/:lid`.

## On the last: the upper flattened off the last, seams drawn on it

The side view draws a height as it looks from the side. Over the instep and round the heel the surface turns away, so the distance up the
last is longer, and a pattern cut to the side view comes up short there. The upper's pieces are now cut **flattened off the last's surface**
(`src/lab-last-shell.js`, shared by the page and the service).

**The shell.** Each section of the last is taken from the feather line (where the side meets the bottom) up to the top centre, on the
outside and on the inside. The sections come from the last in use: the drafted one, or a measured 3D last's side profile and bottom outline.

**Flattening.** Each half is flattened the way a taped forme is peeled off a last, by a least-squares conformal map: the angles are kept and
the stretch is spread evenly. It is scaled to the surface's own area and lined up over the side view. The page states the stretch: about 8%
on average and up to about 25% at the toe's tip, where the last turns tightest. A pattern engineer trues up the toe on the fitting sample, as
before.

**The pieces.** Each piece of the upper is carried from the side view onto the surface and off it, flat:

- the pieces of the inside quarter on the inside half, the rest on the outside;
- the lasting allowance below the feather line carried straight on;
- a leg stood straight up from the last's shoulder: the back of the last, under the leg, is open at the top, so above the point where a section's side leaves upright a height is carried straight on up the sheet and not round over the top (carried round, a 6 in collar was cut 6½ in high at the middle of the leg and bowed). How far forward the leg comes is the style's: a boot's to the front of its leg, a low shoe's to the ankle bone;
- a piece cut whole made as wide at every section as a tape over the last there, and its fold never longer than the last's centre line (no flat sheet holds every section's length: round a square toe box the flattening left it 1/16 in a side narrow);
- a piece cut whole (the vamp, the toe cap) flattened on one side and mirrored over its flattened centre line;
- its side-view outline kept for how it shows on the shoe.

Over the instep the flattened quarters and vamp come out taller than the side view, as they should. Untick **Cut the pieces flattened off the
last's surface** to go back to the side view.

**On the last** (on the Pattern view, for footwear) shows the shoe on its last in 3D, with every piece's lines on it:

- drag to turn it, or use **Outside**, **Inside** and **Top**;
- **Draw a seam**: click along the last where it runs, across a piece from edge to edge (the line is carried on to meet the edges);
- choose the piece it crosses, then **Cut it along the seam**.

The piece is cut in two, for example the outside quarter into a back and a front quarter. Both halves are flattened, notched where the seam
meets the edges, and named. They are in the AAMA DXF with the rest.

Seams are kept with the shoe (`spec.seams`: up to 8, each with its side, the piece and its points in side-view inches) and are listed with
**Remove**. A seam that no longer crosses its piece (after a style change, say) is left out and the pattern's notes say so. A piece cut whole
(the vamp, the toe cap) is not cut by a seam.

## Tech flats: the shoe from four sides

A shoe's product view on the Pattern page, and **Tech flats (SVG)** under Files (`GET /v1/lab/concepts/:id/flats.svg`, 1:1 in inches), draw the
shoe as tech flats (`src/lab-footwear-views.js`, shared by the page and the service):

- **Lateral and medial:** each side's own pieces as they show on the shoe. The inside has the inside quarter, a seam drawn on one side shows on
  that side only, and the inside view is drawn toe left.
- **Drawing details:**
  - the heel curve and the rounded toe (the side view the pattern is drafted on is square at both ends);
  - stitching inside every overlay's edge;
  - eyelets where the eyestay holds them, and the laces crossing over;
  - the sole unit as it is moulded. A cupsole or midsole is flared at the heel, bevelled and rocked at the toe, with its outsole. A stitched sole
    is a thin sole following the last up through the waist, on a stacked heel with its breast square under the heel's front.
- **Top:** the shoe from above in the foot's shape, not the last's bottom: a near-straight inside edge, the outside curving out to the little
  toe, widest across the ball, a narrow round heel, no pinch at the waist. It shows the foot opening (the padded collar, the lining wall and
  the sockliner inside), the tongue's top at the front of the opening, the eyestays with their eyelets and the laces over the instep, and the
  midsole or welt round the edge. A boot or high-top shows its leg opening. The pieces' lines are carried round from the side.
- **Bottom:** the same outline: rubber pads under the forefoot and the heel with flex grooves across the ball, or a stacked heel and the welt's
  stitching on a stitched sole.

Colours come from the shoe's colours (read from its picture or set): the upper, the overlays, the sole and the outsole. Without colours the
shoe is drawn in its upper's natural shade. With the concept's picture, the picture lies under the lateral view, lined up on the ground.

The drawing follows the pattern. The lines (where the vamp, the quarters and the lacing sit) are the style's until they are read from the
picture by the vision model or set by hand: a picture read by its outline alone gives the shoe's proportions, not its design lines.

### The developer check

**Developer check** on the Pattern page (with the concept's picture) has the drawing checked against the picture, the way the design and
developer assistants go over a tech pack (`src/lab-shoe-review.js`):

1. **The outline first, no AI.** The picture's outline sets the collar, the toe spring and the sole (as in *Reading a shoe from its picture*).
   The drawing's length against height is measured against the picture's, and the pattern's warnings and the eyelet spacing are checked.
2. **Then two footwear developers** look at the picture and the four views, each on its own: Claude and, when `OPENAI_API_KEY` is set, an
   OpenAI vision model (`OPENAI_CHECK_MODEL`, as the colourway check). `SHOE_CHECKER=claude|openai|both` (both by default). The stricter score
   stands, and a gap of 15 points or more between them is shown as worth a look by a person. Each scores six points out of 100:
   silhouette and proportions (25%), toe (10%), collar and topline (15%), lacing and throat (15%), the pieces of the upper (20%) and the sole
   (15%). A drawing whose outline is more than 8% off the picture's loses points whatever the developer says.
3. **They ask for changes to the shoe's choices**, never to the drawing. What both ask for is made (numbers that nearly agree are met in the
   middle); what only one asks for is made unless the other asks for something else for the same choice, which is left as it is and listed
   for a person. A judge that cannot answer is left out of that round. The choices are: the style, the toe, the sole, the upper, the collar, where the vamp and
   the lacing sit, the eyelets, the sole's thickness, the heel and the toe spring, a toe cap, a mudguard, a heel overlay and the colours. Each
   is bounded like any other choice and says why. What the choices cannot show (a sock collar, graphics, a carbon plate) is listed for a
   person instead.
4. **Round after round** the changes are made, the views drawn again and scored, until the score clears **90**, there is nothing left to change,
   or two rounds in a row gain nothing (at most four rounds). The result is the best-scoring shoe; below 90 it says a person is needed.

The page follows each round as it runs. Nothing is saved: **Use it** puts the changes on the shoe on the page, to save. The review starts from
the shoe on the page, saved or not.

- `POST /v1/lab/concepts/:id/pattern/review` `{spec?}` starts it → `202 {id, reviewer, bar}` (one review of a shoe at a time: `409`).
- `GET /v1/lab/concepts/:id/pattern/review/:rid` → `{status: running|done|failed, result: passed|needs-person|checks-only, rounds, outline,
  spec, changes, score, beyondDrawing, note}`.
- Without Claude (no `ANTHROPIC_API_KEY`), only the outline and the fixed checks run (`checks-only`) and it says so. Reviews with Claude are
  capped at `SHOE_REVIEW_DAILY` a day (40 by default); past it, only the outline and the checks run. `SHOE_REVIEW_FIXTURE` (a JSON array of the
  developer's answers for one judge, or `{name: [answers]}` for several, or a file of either) stands in for the judges in tests.

## Drawing by hand: sketches on every view and on the last

A shoe can be designed by hand as freely as with the drafted lines, and the two mix (`src/lab-sketch.js`, shared by the page and the service):

- **Sketch** on the Pattern page draws on any of the four views (outside, inside, top, bottom) with a Pencil, a mouse or a finger. A Pencil
  draws with its pressure; once a Pencil has been used, fingers never draw, so a palm resting on the screen does nothing. Pen, Eraser (rubs
  out a whole line), inks (graphite, red, blue, green), Fine/Medium/Bold, Undo.
- **On the last**, then **Sketch on it**, draws on the last in 3D. A line carried over the top goes on as a new line on the other side.
- **The sides are one drawing.** A line on the outside or the inside is kept in the side view's own inches (x from the heel's back, y downward),
  the coordinates the last's surface is mapped from: a line drawn on the last shows on the flat side view, and one drawn on the side view
  shows on the last. Top and bottom lines stay on their views.
- **Make a seam** turns a hand-drawn line on a side into a seam: tap it, choose the piece it crosses, and the piece is cut along it (thinned to
  the points that shape it). The line becomes the seam.
- **Paper sketches.** A photo or scan of a drawing on paper, or a picture from any drawing app (Procreate, Illustrator, a camera), can lie over
  any view, blended in, to trace or keep beside the drafted lines: **Paper sketch…** in the Sketches panel, **Move sketch** to line it up, with sliders for
  its size and how strongly it shows. It is kept straight away, re-encoded (only the pixels are kept), and is not part of the tech flats.
- The lines are saved with the shoe (`spec.sketches`, up to 300 lines and 30,000 points) and drawn into the tech flats and their SVG, and so
  the developer check sees them too.

Routes for paper sketches: `GET /v1/lab/concepts/:id/pattern/underlays` (which views have one and where it sits), `GET|PUT|PATCH|DELETE
/v1/lab/concepts/:id/pattern/underlays/:view` (the picture; `PUT {image: data URL, place?}`, `PATCH {place: {x, y, w, opacity}}`, in the view's
inches; a picture up to 15 MB).

### How a fixed body type goes together

The seven fixed body types (bear, four-legged sitting, elephant, sea creature, bean, bunny, pillow) are drafted the way bags are
(`draftFixed` in `src/lab-pattern.js`). Every piece names the ends of the edge it is sewn by (`at`) and carries a notch where a factory
needs one. Every piece that depends on another is sized from the edge it is sewn to, measured off that piece's outline:

- **A head gusset** is as long, tip to tip, as the head side's edge it is sewn along, and carries the head side's notches (the brow, the
  root of an elephant's trunk, the two ear notches). A bear's runs from the nose over the crown to the back of the neck. A four-legged
  animal's runs from the nose up the top of the snout, over the brow and the crown to the back of the head. An elephant's runs from the
  tip of the trunk up its top, over the brow and the crown to the back of the head. The head side's brow notch is a match point on that
  seam, not where the gusset starts.
- **A foot pad** is as far round as its leg's open foot. On a four-legged body the hind foot is made as far round as the front, so one pad
  fits all four, and the front leg is as long as the drop from its notch to the ground, so its sole is level with the seat.
- **A base** (bean, bunny) is as far round as the front's and the two backs' bottom edges, with notches at the centre front, the centre
  back and the two side seams.
- **An underbody gusset** runs from the chest notch to the seat, as long as the body side's edge between them. A sea creature's belly
  gusset is as long as the body side's belly edge.
- **The neck.** A bear's body neck is the head's: each front and back takes half of a head side's neck edge. A sitting animal's head sits
  on the body side's top and the top of its chest; the chest seam runs from there to the chest notch.
- **A bear's back** is 6% fuller than its front, and its length is trued so the side seams walk each other.
- **An ear lining** is the size of its ear. An elephant's ear is pleated (a quarter of its base taken up) into the gusset seam.
- **The kit's added parts** are sized from the seam they go into, and are in the assembly as the body's own parts are:
  - **A row of spikes** is as long as its seam: on a four-legged toy the back seam from the neck to the tail (closed in by hand with the
    stuffing opening where it crosses it), on a sea creature the top seam from the nose to the dorsal fin (to the opening on one with no
    fin). Two layers, sewn round the points and turned.
  - **A mane** is a strip folded in half along its length. A ruff lies in the seam that joins the head to the neck, all the way round, its
    ends joined. A crest is stitched down the centre of the head gusset from between the ears, then lies in the back seam from the neck to
    the stuffing opening; it is as long as those two together.
  - **One horn** is a cone: a sector of a circle whose two straight edges are sewn together. Its base sits ⅛ in inside each seam of the
    head gusset (a tenth of the gusset's width on a small toy).
  - **Two horns, antlers and wings** are two pairs each, sewn round and turned, their bases turned in and sewn on by hand. On a toy for
    under-3s that is a warning: each has to take the 15 lbf pull.
- **Ears, arms, fins and a tail** are caught in a seam between two notches as far apart as the part's base: a bear's and a four-legged
  animal's ears in the gusset seam, a bear's arms in the side seam, a bean's ears and arm nubs in the side seams, a pillow's ears in the
  front seam, a sea creature's fins in the belly seam and its dorsal fin in the top seam, a tail in the back seam. A sea creature's tail
  has a root as wide as the end of the tail stock. Legs are stuffed, closed and sewn on by hand at their notch.
- **A pillow's** front is the size asked for (as tall as its height and 82% as wide), and its side gusset is as long as the front is
  round.
- **The stuffing opening** is marked by two notches in its seam, with at least ⅜ in of seam beyond each end.
- **The size.** The toy is drafted, its height measured off its pieces, and drafted again until it stands the height asked for (a sea
  creature: its length), whatever the head's size and with or without legs or a tail.

`pat.assembly` lists every seam as its two runs (`{ name, a: [piece, [corners…], copy], b, gap?, why? }`), every edge finished on its own
(`fin`) and the stuffing opening (`open`, `len`). `pat.trims` lists the fibre fill with its weight, the thread, the law label and the
eyes (safety eyes, or floss), and what the parts call for: a pouch of pellets on a bean's or a bunny's base (3 years and up only), yarn
for a tufted tail, interfacing behind an elephant's ears, antlers and wings. The construction check walks the assembly
(`checkPlushShape` in `src/lab-pattern-check.js`, see [pattern-process.md](pattern-process.md)).

`test/pattern-check.test.js` covers every body type at 4 to 48 in with every part it offers, and thirty patterns broken on purpose (a
head gusset an inch short, a foot pad or a base too small, a seam left out, the fill removed), each caught by the check that is about it.

## Plush built from parts

On the Pattern page a plush's body type can be **Built from parts** (`src/lab-plush-parts.js`). Start from one of twenty plush, then swap any part. Each part shows as a picture of itself, and each has a size slider. The starting plush are:

teddy bear, bunny, cat, dog, fox, lion, unicorn, dragon, elephant, owl, penguin, frog, octopus, monster, bee, whale, shark, caterpillar, sausage dog, cloud friend.

| Slot | Parts |
|---|---|
| Body | Bean, ball (six gores and a base), egg, pillow, upright body (takes a head), sitting four-legged (takes a head), long tube (takes a head; its size is its length), fish (its size is its length) |
| Head | Ball (six gores), bear (two sides and a gusset), flat face, long snout |
| Ears | Round, pointed, tall pointed, long, floppy, big and lined, big round |
| Face | Eyes and a nose, muzzle patch, beak, felt nose, trunk |
| Arms | Nubs, arms, flippers, long and dangly |
| Legs | Feet, sitting legs on pads, four legs on pads, long and dangly, eight tentacles |
| Tail | Pompom, stub, long, bushy, curly, fluke, tail fin, spiked |
| Horns | One, two, antlers, antennae |
| Wings | Feathered, bat or dragon, butterfly |
| Down the back | Spikes, dorsal fin, mane crest, mane ruff |
| Details | Belly patch, cheeks, spots |

A part goes only on a body that takes it. For example, four legs go on the sitting body or the tube, and tentacles go on a round body. Each part is drafted to where it is sewn:
- A head's neck is drafted to the body's neck opening. A ball head's gores are cut where their feet make the neck's round. A bear head's flat feet and gusset end make it.
- A foot pad is solved to walk its leg's foot opening.
- A ball's or an egg's base is solved to walk its gores' feet.
- A gusset is as long round its edges as the seam it runs along.
- An ear, a limb, a tail, a horn or a wing is no wider at its base than the seam it is set into. A big ear's base is pleated to fit.

Every join is recorded on the pattern (`pat.build.joints`). The construction check walks each one and measures the toy as drawn stuffed. The size asked for is the toy's overall size, ears and dangling legs included (a tube's or a fish's is its length). The pattern is drafted, measured and drafted again until it comes out at that size.

A built plush also lists:
- its fill, in grams
- its thread
- the law label
- its eyes: a pair of safety eyes, or floss

It is checked on the Pattern page (Sews together), in the factory package and on the proof page. Its views are drawn from its parts' own outlines.

`test/plush-parts.test.js` covers:
- every starting plush at 6 to 36 in
- every part on every body that takes it (over 400 combinations)

## Plush tech flats: the toy as it will be made

A plush's product view on the Pattern page, and **Tech flats (SVG)** under Files (`GET /v1/lab/concepts/:id/flats.svg`, 1:1 in inches), draw it
from the front, the back and the side as it is when stuffed and sewn (`src/lab-plush-views.js`), from the same sizes the pattern is drafted to. A toy with no legs, or with a bigger or smaller head, is drafted larger or smaller so that it still measures the height asked for, and its drawing is scaled the same way: its body, from the side, is as tall as the usual toy of its type is drawn. The views:

- **Bear:** the head with the gusset's two seams over the crown, round, pointed or long ears with the inner ear in contrast, the muzzle in
  contrast with an embroidered nose and mouth, arms at the shoulders and legs under the body (their seams), from the side the head's profile
  as the head side is cut, the foot turned forward with its pad.
- **Bean and bunny:** the body, ears, arm nubs, a face (eyes, nose, mouth, cheeks), the base's seam just showing; the tail from the back and
  the side.
- **Pillow:** the front and back with their seam, and from the side the gusset's depth, thickest in the middle where it is filled.
- **The eyes as made:** embroidered (satin-stitched), 12 mm safety eyes (with the washer ring) or felt (sewn flat on white).
- **Construction:** the centre-front and centre-back seams, the opening left to stuff closed with a ladder stitch (as long as the pattern says),
  the sewn-in law label in its side seam, the height down the front. Long-pile fur is drawn with a tufted edge.

The views can be sketched on by hand and have paper sketches laid over them, as a shoe's can (*Drawing by hand*, above), on `front`, `back`
and `side`.

## Lines by hand and by the model, either way

The lines on a shoe's or a plush's tech flats come from two places: the ones a designer draws (sketches and seams) and the model's own (the
lines the pattern is drafted from). Either can be worked by hand, and either can become the other (`src/lab-lines.js`, shared by the page
and the service).

**Reshape** (in **Sketch** on the Pattern page) works on every line:

- **The model's lines.** A shoe draws a green dot on each of its own lines, on the outside and the inside:
  - the vamp line;
  - where the lacing starts;
  - the collar;
  - the toe cap;
  - the mudguard;
  - the heel overlay.

  Dragging a dot moves that line, along the shoe or up and down. When it is let go, the shoe is drafted again from where the line was left:
  the pieces, the last's flattened pattern, the tech flats and the files all follow. Each line is held within what can be made. The toe cap's
  length (`capLen`), the mudguard's height (`mudH`) and the heel overlay's height (`heelH`) are new settings; the others were already there.
  A plush has one such dot, at the top of its front view: dragging it changes the toy's height.
- **Lines drawn by hand.** Drag any part of a line to bend it there. The dragged point moves the whole way and its neighbours follow less
  further off, as a pencil line is pushed, and the pressure each point was drawn with is kept. **Bend close / soft / wide** sets how much of
  the line follows. **Smooth** evens the line out, keeping its ends; **Delete** takes it off.
- **A hand line made the model's.** With a line drawn on the outside or the inside chosen, **Make it the model's line** (vamp line, collar,
  toe cap…) moves that model line to where the hand line is, and drafts the shoe again. The hand line becomes the model's.
- **A model line traced by hand.** **Trace by hand** beside each of the shoe's lines (in the Sketches panel, with what each one is now) copies
  it onto the outside as a blue hand line. It can then be bent, made a seam, or made the model's line again.
- **Seams.** A seam's line can be dragged too: the piece is cut again along it where it is left. **Back to a sketch** turns a seam back into a
  red hand line, and the piece is whole again.
- **Undo** covers all of it (the shoe's lines, its seams and its sketches), as does saving.

**On a garment's flats** (Design tab), a chosen stitch line or colour block shows a dot on each of its points. Drag a dot to move a point.
Double-tap or double-click the line to put a point in, or a dot to take it away (a stitch line keeps two points, a block three). This works
with a Pencil too: it is read from the pointer, not from the browser's double click, which goes missing when the drawing is redrawn under
the first tap.

## Plush concepts: photo-real, then patterned like clothing and footwear

**Concepts.** A plush planned in a line plan gets AI concepts written as plush:

- **What the assistant is told** (`CATEGORY_WORDS` in `src/lab-concepts.js`): a plush is cut from pattern pieces and stuffed, and is built
  from the plush parts library (see *Plush built from parts*). It is given the whole library (`partsMenu`): every part in every slot, and
  which parts go on which body. It is also told the toy is for children unless the brief says otherwise: embroidered eyes for any age, safety eyes only
  for 3 and up, no small hard parts, no long pile on a baby toy. Its character comes from proportion, the face and colour, with at most one
  embroidered motif.
- **What each concept says** (`spec.plush`): `shape: "build"` and its parts (`build`: the body, head, ears, face, arms, legs, tail, horns,
  wings, what runs down the back, the details, and a size for each part), its height, the pile, the eyes, the age, and the body and contrast
  colours. These are the Pattern page's own choices. A part that does not go on its body is dropped (`cleanBuild`). A concept written on a
  fixed body type (bear, quad, bean…) is still kept.
- **Its picture prompt** describes the toy from its parts (`buildWords`): "a dragon about 14 inches tall: a sitting four-legged body with a long
  snout, pointed ears, four legs, a spiked tail, two horns, bat wings, spikes down its back and a contrast belly patch". A long tube or a fish
  is drawn resting on its belly, seen from the side.
- **Logo and label.** The logo is a small embroidered mark on a foot pad, never laid on the picture. The law label is a tush tag in the side
  seam.
- **Footwear concepts** say their style, toe, pieces, upper, sole and colours the same way (`spec.footwear`), and their pattern starts from
  them.

**The picture** is drawn by the image model as a sewn, stuffed sample: sitting up, real pile with its texture, the seams just visible, the
embroidery stitched, on a plain background. A shoe is drawn in side profile, so its outline can be read. The board's views of a plush, a toy,
a gadget or a home object are the product alone, front and back: nobody wears it, so there is no model and no walk.

**The pattern.**

- **First open.** Pattern opens on what the concept said (a 12 in bear in its colours). With a picture, it reads the toy from the picture by
  itself the first time (`src/lab-plush-read.js`, `POST …/pattern/from-picture`, which now takes a plush): the vision model reads the shape,
  height, parts, pile, eyes and colours, over the concept's words. It also names the parts the toy is made of from the parts library
  (`build`, with the parts menu in its prompt). A concept built from parts stays built from parts: the picture's parts are read, not a fixed
  body type, and the fixed type's ears, snout or tail are not offered as changes. A picture read as `build` turns a fixed type into parts.
- **What would change.** The page lists each change and where it came from; **Use it** applies them. A new shape brings its own size and
  parts but keeps the pile, eyes and age. A toy for under-3s keeps embroidered eyes whatever the picture shows.
- **Colours.** The colours read are kept on the plush (`spec.colours`) and draw its tech flats until a material is put on the part.

**See it made** (`POST /v1/lab/concepts/:id/pattern/render`, a plush or a shoe):

- The tech flats as they stand (a plush's front, a shoe's outside), in the materials on their parts, go to the image model. It draws the made
  sample from them, and that becomes the concept's picture. An approved concept goes back to draft, as when the picture changes in the
  studio.
- So a toy patterned by hand gets its photo-real picture, and a picture changed by hand can be read back into the pattern.
- It is capped at `LAB_DAILY_REDRAWS` a day.

## The same tools for every product

Footwear and plush now take the tools clothing has, where they apply:

| Tool | Clothing | Footwear and plush |
| --- | --- | --- |
| AI concepts and their picture | yes | written and drawn as what they are (above) |
| The board's views | flat and on a model | a shoe on feet; a plush, toy, gadget or home object as the product alone |
| Materials on parts | **now**: body, contrast, rib, lining, pocketing, fusing, zip, buttons, drawcord, thread | yes |
| Hand sketching, reshaping lines | flats: stitch lines and blocks by their points | every view, the last, the model's lines |
| Read from the picture | flats from the picture | a shoe and now a plush |
| See it made (photo-real from the pattern) | the studio's AI | yes |
| The checklist | flats, the flats check, the main fabric | the pattern saved, its checks (a plush's safety fails hold it up), the material on the upper or the body |
| Send to the tech pack | flats, spec sheet, measurements | tech flats as the pack's lateral, medial, top and outsole (a plush's front, back and side), the sheet, the pattern's notes, the size run, the materials |
| Colourways | the flats washed in each | **See it in a colourway** on Pattern draws the upper or the body in it |
| The studio's scale | a garment's width | a shoe about 11½ in long, a plush about 10 in across, until the ruler sets it; graphics are sized there and their place written on the pack, as "Goes on" lists garment places only |

**Clothing's parts.** A garment's parts are its cloths (each is what its pattern pieces are cut from) and its trims (`src/lab-materials-goods.js`):

- **On Pattern.** The **Materials** list shows each part. The body shows the concept's main fabric until it takes its own: a cloth part takes
  the place of the concept's fabric of the same role, so nothing is counted twice.
- **Choosing one.** **Choose…** searches the library.
- **What follows.** Each piece is drawn in its cloth's colour, with light ink on a dark cloth. Until the body takes a material, a garment is drawn in the colour of its flats (the colour the designer chose there), its rib a shade off it, so the pattern looks like the product from the first open. On a dark cloth the line round each piece is a lighter shade of the cloth, so a seam between two pieces of the same dark cloth still shows. The cutting layout cuts each cloth at its own
  width (a 100 cm rib at 39 in, wider when a piece needs it) and names the material. A cloth part takes its share of the usual metres for the
  piece (the rib a fifth, the lining nine tenths), and the BOM names the part.

**Not yet:**

- Placing a logo or graphic in inches on a shoe's or a plush's views, with the "can it be made" check: graphics are sized in the studio and
  their place is written on the pack.
- A shoe or a plush in the range mockup.
- Toys, home objects and electronics still have no pattern or tooling (Phase C and D).

## An elephant, leather, and logos on a shoe or a plush

**The elephant** is a plush shape of its own (`src/lab-pattern.js`, `src/lab-plush-views.js`). It sits, with:

- a head and trunk cut in one (two sides that meet down the trunk's underside, and a gusset from the back of the head over the brow and down the top of the trunk to its tip, as long as the head side's edge);
- big ears, in self and lined in contrast;
- a body in two sides with an underbody gusset;
- four legs, each in two, on contrast foot pads;
- a tail with a yarn tuft.

It is drawn from the front, the back and the side.

**Other characters.** A concept, a picture reading and the page each keep what the character is (`spec.animal`: "elephant", "fox"…). When the
pattern has no shape for it, it is drafted as the nearest one and the page says so: reshape and sketch over it to make it the character.

**The bear's side view** is drawn again:

- a round head with the muzzle standing out in front;
- the ear at the back of the crown;
- the arm hanging in front of a fuller belly;
- the foot turned forward on its pad.

**Leather and other cloths for a plush.** Nappa lambskin, vegan leather, suede, cotton velvet and bouclé join the piles.

- **The concept assistant** is told to make a plush in the material the brief names: a luxury plush in leather is ours to make.
- **The flats** show leather with a grain and suede and velvet with a nap.
- **The pattern:**
  - Leather and suede are sewn with a ⅜ in allowance.
  - The notes say to ease the pieces and notch the curves.
  - The notes also say to sew with a leather needle and bonded thread and to press the seams with a roller.
  - A leather toy for under-3s is flagged for chrome-free leather and the restricted-substances tests.

**Logos and graphics on a shoe's or a plush's views** (`src/lab-logos.js`, the Pattern page's **Logos and graphics**):

- **Placing one.** Our cue mark, wordmark or lockup, or a graphic from the library, goes on a view in inches:
  - a shoe's outside, inside or top, in the side view's inches, as its sketches are;
  - a plush's front, back or side.
- **Moving and sizing.** Each placed logo is framed so it can be seen and grabbed; drag it to move it. Set its width (its proportions are
  kept), its view, how it is made and, for a mark, a dark or a light ink. A mark on a dark cloth starts in the light ink.
- **The checks:**
  - **Size:** within its technique's sizes, for example embroidery 0.4–4 in and a deboss 0.3–3 in.
  - **On a shoe:** which piece it lands on, whether it crosses a seam, or whether it is off the upper.
  - **On a plush's cloth:** embroidery perforates leather, so deboss it or use an appliqué; a pile cannot be debossed.
  - **On a baby toy:** a label is sewn flat on all four sides.
- **Where they go:** the tech flats and their SVG, and the tech pack, which also gets each placement written out in words (what, how, how big,
  on which piece, where its centre is). The photo-real picture (**See it made**) is drawn without them, since an image model redraws lettering.

## Engineering: hard goods, toys, home objects and electronics as 3D parts

Electronics, toys and home objects are not cut from a pattern, so for them the piece's fourth step reads **Engineering** (the Flats step is
left out). It opens `/lab/engineer` in the Design frame; the engineering is `src/lab-assembly.js`, shared by the page and the service, so the
screen, the drawing and the files agree. Routes: `src/lab-assembly-routes.js`; stored in `lab_assemblies` (one row a concept).

- **The parts.** Each part is a real solid in millimetres: a box, a shell (a housing open on one side), a cylinder, a cup (a round shell), a
  ring, a ball or a circuit board, lying along x, y or z, with its material (resin, metal, foam, FR-4 or bought in), process, finish, colour,
  quantity, draft, undercuts, how it is fixed, what it sits in, the order it is built, and the direction and distance it explodes.
- **Starting points** (`Start from…`), drawn to the size you give: a round device (speaker, hub), a handheld (remote, power bank), a desk
  device with a display, a tumbler, a case, a figure, or one part; and audio with its full parts count:
  - **CD player** (hi-fi component): stamped steel chassis and cover, aluminium front panel and button caps, the CD loader (tray, laser
    pickup, spindle), a 100–240 V supply and IEC inlet, the main board with the DAC and RCA outputs, a VFD display behind a window, the IR
    receiver. A radio brings an external antenna (a steel case blocks it); the laser brings IEC 60825-1 and the FDA laser report; mains in a
    steel case brings the earth bond.
  - **Cassette player** (portable): the tape transport (motor, capstan, heads) behind a clear door, two AA cells (replaceable: no lithium
    shipping tests, run time from 7.5 Wh), the board with the tape preamp and headphone amp, keys on top, the jack and the volume wheel.
  - **Powered speaker** (bookshelf, Bluetooth): MDF cabinet and baffle (CNC routed), woofer and tweeter, bass port, grille, the 2 × 20 W
    amplifier board standing at the back with the mains inlet, line in and volume through the back panel.
  - **Turntable** (belt drive): MDF plinth on a steel plate with isolation feet, the main bearing and the 12 V motor inside, a 300 mm
    aluminium platter and felt mat, the tonearm on a cored zinc pillar with its counterweight and an offset headshell carrying the
    moving-magnet cartridge over the record, the phono preamp board with RCA outputs and a DC input at the back, speed buttons, a clear dust
    cover on two hinges. The tonearm wiring (shielded litz) runs to the phono input; the plug-in adapter brings its own listing.
  - **Over-ear headphones** (Bluetooth): two PC/ABS cups with a 40 mm driver behind each baffle and memory-foam pads, nylon yokes,
    aluminium sliders, a stainless spring band under its cushion; the board, buttons, LED and USB-C in the right cup, the cell in the left
    (its wires run through the band). Brings EN 50332 (sound pressure limits) as well as the radio and battery approvals.
  - **Smart speaker** (Wi-Fi): a base with the main board, Wi-Fi module, amplifier and DC input; an up-firing 3 in driver under a fabric
    grille; a top cap with its own board (four microphones, twelve LEDs for the light ring, four buttons) joined to the main board by a
    flex cable.
  - **Power bank**: 2 to 4 × 18650 cells side by side (from the capacity asked for), the PD controller board with USB-C in and out, a
    four-LED fuel gauge behind its window and a button, in two textured shells. Its controller carries the output (20 W at half load), so
    the run time is how long it lasts in use, and since that power leaves through the cable only the converter's loss counts as heat.
  - **Cordless lamp**: a die-cast weighted base with the cell, the board (charger, LED driver) and USB-C, an aluminium stem the wires run up,
    a pressed aluminium shade with the COB LED on its heat sink, an opal diffuser and a touch dimmer on top. Brings IEC 62471
    (photobiological safety) and the EU light-source ecodesign and energy label.
  Each part draws at its own rail (`v`): a 12 V amplifier and a 5 V CD loader are counted in watts, and a battery's run time comes from
  the energy at its cell. Every socket (USB-C, mains, RCA, the jack) is checked against the outside of the housing on all three axes. With nothing saved, the page shows the one the concept's words point to.
  **Read the picture** asks Claude for the kind, size and features (`ASSEMBLY_READ_FIXTURE` stands in for it in tests); without a picture or
  a key it reads the words.
- **The 3D view** is three.js served from this site (`/lab/vendor/three/…`, the npm package; no outside scripts), with physically based
  materials, reflections from a studio environment, tone mapping and soft shadows. Every part is drawn as the real thing by
  `src/lab-parts3d.js`, at the exact size the engineering uses: chips with their markings and pins, radio modules under shield cans, the
  board with traces, pads, vias and silkscreen drawn under the real parts and small passives around them, USB-C, RCA, the mains inlet, the
  jack, tact switches, LEDs, encoders, a glowing VFD and screens, the battery pouch with its label and protection board, AA cells with
  springs, woofer and tweeter (basket, cone, surround, dust cap, spider, magnet; silk dome), the class-D board and heatsink, the open-frame
  supply (transformer, capacitors, fuse), the CD loader with an iridescent disc, the tape transport with a cassette in it; housings with
  bevelled edges and their screw bosses where the engineering has them, clear parts that transmit light, brushed and anodised metal, painted steel, MDF grain, grille
  cloth, knurled knobs, screws with threads. A socket faces the nearest outside wall, a part on a board faces away from it. The first view
  looks across the way the parts pull apart. **Zoom to part** closes in on the chosen part; **Files → Picture of this view** saves a PNG.
  Drag to turn, pinch or scroll to zoom, two fingers to move, double-click to reset. **Explode it** or the slider
  pulls every part away along its own direction; **Numbers** puts the item number on each part; **See inside** makes the housings clear.
  Tap a part (or its number, or its row) to edit it; everything is checked and costed again at once.
- **Tooling.** Per part: the tool (injection mould, LSR, rotocast, blow, die-cast, stamping or a cutting die), the steel picked from the
  volume over the tools' life (aluminium to 10,000 shots, P20 to 300,000, hardened H13 beyond), cavities, side actions, press tonnage, cycle,
  tool cost and weeks; T1 samples are the longest tool plus two weeks. Unit cost is resin, machine time, finish, bought-in parts, the board
  and the line's labour; estimates to plan with until a factory quotes.
- **Checks.** Wall against the resin's range (ribs and bosses sized from it), draft for the finish (3° for a texture), undercuts, clear parts
  without an SPI A polish, solid sections that will sink, parts over 600 mm, food contact (PP, Tritan, PETG, LSR, 304), each part inside its
  housing with clearance (a housing and the half that closes it are one space), two parts in one space, and small parts for under-3s.
- **Do the parts go together** (`fitOf`, part of `dfm`). Measured off the parts as they are built (outlines, walls, floors, openings, bosses,
  every piece of a part with a quantity), not from the sums that placed them. Each finding carries its `kind` and its number:
  - `clash` (fix before tooling): a part 0.25 mm or more into another's material where there is no opening: a rectangular cell in a round
    housing, a board corner in a rounded corner, a part through a wall. A soft part (silicone, TPE, TPU, foam, vinyl) may be squeezed up
    to 1.5 mm; screws and moulded-in parts are left out.
  - `contact` (watch): a part, or a group of parts, that touches nothing else within 0.5 mm, with how far the nearest part is.
  - `fasteners` (watch): the screws on the parts list against what the screw-fixed parts ask for (`fixQty` × quantity), and each screw
    through two parts.
  - `size` (watch): the size the parts make against the size asked for at **Start from…** (kept on the assembly as `dims`), over 0.5 mm.
  Contact, fasteners and size stay at watch, not fix before tooling. Measured on the 15 starting assemblies as they were saved before they
  were rebuilt: 12 have a contact or fastener finding (38 contact findings, 27 of them a gap of 2 mm or less: drawn loosely, not a part
  missing), so every such saved assembly would turn red and lose up to 30 review points for what a parts list or a nudge puts right; a
  part just added with **Add part** starts 20 mm outside the product; and the size asked goes stale when a designer resizes a housing on
  purpose. On the 60 assemblies the starting points make today none of the three is raised, so a clash (a part in another's material)
  is the one that blocks.
- **Openings, bosses and screws.** A part says what it passes `through` (a key through its cover, a shaft through a panel, a screw through
  a board) and the opening is cut there with 0.2 mm round it, worked out each time so it follows the part; sockets and clear windows get
  theirs without being told. A part with a quantity can list where its other pieces are (`spots`). A round solid part can have a `flange`
  (a speaker driver's: full width for a few millimetres at one end, a narrower body behind), so it lies on a baffle's face, goes through
  with its body, and its screws go through the flange into the baffle. A housing carries screw `bosses` on its
  floor. Screws are parts: one line a kind, every position listed, lying through the part held and into the part that takes the thread.
  On the page, the chosen part's editor has **Passes through** (up to three parts), the places of its other pieces when its quantity is
  over one (every piece has its fields, in a list that scrolls), and for a housing its screw bosses (**Add a screw boss**: x, y, z of the free end from the part's centre, and the screw's
  diameter); for a round solid part, its flange (off, or at the near or far end, with the body's diameter behind it and the flange's
  thickness); it also says which openings are cut in the part and for what.
  Openings and bosses are in the part's solid: its STL, and its STEP as exact faces (holes through a floor or a solid part, bosses, and
  windows in a housing's side walls with their sides, sill and head, a notch where one reaches the rim). The 3D view shows them too: a
  housing with a window in a side wall is drawn from its solid.
- **How the halves and the moving parts join.** These are drawn at their real size, in the part's solid where the solids can carry them, and
  each has its own finding in `fitOf` and `dfm`, with the numbers it was measured at. They are set on the part in the saved assembly; the
  page shows their findings but has no fields for them yet.
  - **Lip and groove** (`lip`, kind `lip`). A housing half says its lip goes into the other half (`lip: { into, h, t }`: 1.2 mm tall and
    45% of the wall thick unless given). The lip stands on the inner side of its rim; the other half gets the groove that takes it, cut
    back from the inside of its wall, 0.1 mm clear of the lip at the side and 0.3 mm at its top, worked out each time so it follows the two
    parts. The check measures round the lip, off the two parts: how far it stands into the groove (0.8 mm or more locates), the
    clearance at its tightest and loosest (none left, or the halves not closing rim to rim, is fix before tooling; over 0.35 mm is watch),
    the wall left outside it (0.6 mm or more), how much of its way round it finds the groove, and the step between the two outsides at
    the seam. Six starting assemblies close this way: handheld, desk device, cassette player, smart speaker (base and grille), power
    bank and case. Where an opening comes up through the rim (the handheld's USB-C port) the lip and the groove stop with the wall.
    In the files: the groove is in the half's solid, in its STL and as exact faces in its STEP (its wall, its floor, the thinner rim).
    The lip is a closed body of its own in the same STL and a second solid in the STEP, named for its part, starting 0.3 mm inside
    the rim it stands on; it is not fused into the half's skin, so a toolmaker joins the two with one union.
  - **Snap hooks** (`snaps`, kind `snap`). A part says which part its hooks catch on, their size and where each leaves it
    (`snaps: { into, len, t, w, y, hooks: [{ at, along, out }] }`: beam length, thickness, width, how far the head stands out; `along` and
    `out` are a direction each, such as `-z` and `+x`). Each hook is three bodies on its part (a foot on the wall, the beam, the head) and
    the other part gets a catch for it: a ledge on its wall behind the head, 0.1 mm from it, the beam 0.2 mm clear. The check measures
    each hook off the two parts: that its root is joined to its part, that there is a wall to catch on and how far away it is, how far
    the head catches under the catch (0.4 mm or more), how much the beam bends as it is pushed home (1.5 × thickness × catch ÷ length²)
    against what the resin takes once, and that nothing is behind the beam where it has to bend. The strain figures are guide values for
    a first design, to be confirmed on the resin's datasheet: PC 4%, PP and POM 4%, Tritan 3%, PC/ABS and PETG 2.5%, ABS 2%, HIPS,
    PMMA and glass-filled PA66 1.5%. A starting assembly's cover gets its hooks where they measure clear (the middle of each wall is
    tried first): the desk device's front (4), the cassette player's front (2) and the smart speaker's grille (4) have them, each
    catching 0.8 mm and bending 0.77%. The handheld's, the round device's and the power bank's covers have none drawn at their default
    sizes: the board, the light ring or the cells are within 1.5 mm of the wall, and a hook needs 2.2 mm; their fix still says snap, and
    no finding is made for a hook that is not there. Parts that snap on without being a housing half (a slider, a latch, ear pads, a
    cassette door) have no hooks drawn either. In the files: hooks and catches are closed bodies of their own in their part's STL and
    solids in the STEP, named for their part, each starting 0.3 mm inside what it stands on; they are not fused into the part's skin.
  - **A thread** (`thread`, kind `thread`; fixed by **thread** on the parts list, "Screw on" in the assembly steps). A round part says
    what it screws onto, the pitch, how many turns hold it and how deep the thread form is (`thread: { onto, pitch, turns, depth }`). The
    two diameters are the two parts' own: the inner part's outside with the thread standing on it, and the outer part's bore. The check
    measures them off the two parts: the thread's crests inside the bore with 0.2 to 0.8 mm clear on the diameter (larger than the bore
    is fix before tooling), the flanks catching 60% of their depth or more (not reaching each other is fix before tooling), the two on
    one axis, and the turns fitting in the length the two overlap with 1 mm to run out. The tumbler's lid screws onto the cup: ⌀83.6 mm
    over the thread in a ⌀84 mm bore at the default size, 4 mm pitch, 1.2 mm deep, 1.5 turns over 6 mm of a 14 mm overlap.
    In the files: the STL and STEP show the cup and the lid's bore at the thread's roots, with the room for the thread between them. The
    turns themselves are not drawn: the solids have no helical faces, so the toolmaker cuts the thread from the numbers in the finding.
  - **A hinge** (`knuckles`, kind `hinge`). A housing says which pin its knuckles turn on, where each is along the pin, how long and how
    wide across (`knuckles: { pin, at, len, d }`). Each knuckle is a ring round the pin, bored 0.2 mm over the pin, and a lug that joins it
    to the housing's nearest wall on the housing's own side of the pin. The check goes along the pin: two parts have knuckles on it, the
    pin reaches through every one, each is joined to its housing and none sits in a wall, no two are in the same place and the moving
    half cannot slide more than 1 mm between the other's. Then the half that goes on later is turned about the pin in 5° steps, both
    ways, and every point of it is tested against the other half: how far it opens before the two meet (under 45° is fix before tooling,
    under 90° is watch). The case has five knuckles 7 mm across on a ⌀3 mm pin, three on the base and two on the lid, 0.4 mm apart;
    the pin lies 3.7 mm behind the back walls at the height where they meet, and the lid opens right over (180°). The case's shells are
    4 mm shallower than before to keep the knuckles inside the depth asked.
    In the files: rings and lugs are closed bodies in their housing's STL and solids in its STEP, starting 0.3 mm inside the wall; not
    fused into the housing's skin. The pin is a part, as it was.
- **An assembly saved before these rules** (it carries no `v`; a starting point or a design from a concept made now carries `v: 2`) is read as
  it was meant when it is opened: a part that plainly goes through a wall (in on one side and out on the other or flush with the far
  face, much narrower than the wall, and not a part that sits inside that housing) gets its opening, worked out each time and never written
  into the saved parts. On the 15 starting assemblies as they were saved before, that clears 9 of 17 clash findings (the cassette's keys,
  the speaker's drivers and port, the lamp's stem, the tumbler's straw); the 8 left are misfits the old drawings really had, and say so:
  board corners in rounded housing corners (handheld, power bank), the cassette's cell holder in a corner, the tumbler lid 0.5 mm into
  the cup, the turntable's plate and pillar sunk into the plinth, the headphones' square baffles in oval cups. Give the board a corner
  radius or move the part on the page, or start the piece again from its starting point.
- **Starting points are built inside the size asked**, feet, keys, knobs and hinges included, from the table up. A size that cannot hold its
  parts (a 25 × 50 × 8 mm handheld, a cell asked for that is larger than its housing) still builds, and the checks say what does not fit.
- **Electronics.** The parts on the board are parts like any other. The page adds the block diagram (power → the main chip → what it drives,
  each line named by its bus), the power budget (run time, standby, charge time, Wh; the share of time each part is on can be set), the board
  (size, layers, how full, placements, fab and SMT cost), the USB-C port at the wall, the radio clear of the battery and of metal, the heat
  with everything on, and the certifications to plan for (`src/elec.js`).
- **Cables.** Every electronic part off the board is wired to what drives it (`harnessOf`): the supply to the board, mains in through the
  inlet to the supply, a driver to the amplifier, a loader or a display by a flat flex cable, controls and sockets by a small multi-wire
  lead, and a second board joins the main one by a flat flex cable; each cable is numbered W1, W2… (W, a cable's reference designator), typed (wires, gauge, connector), sized (the run with a fifth for slack) and costed. They are on the
  parts list, in the assembly steps ("Connect W1…") and the time, listed under Assembly → Cables, and drawn in the view as runs between
  their parts, coloured by what they carry (red power, grey mains, amber flex, white signal, black coax) with their numbers; the **Cables**
  button shows or hides them. The drawing carries them too.
- **Parts that open.** A CD loader's tray, with the disc on it, slides out toward the product's front (`frontOf`: the way its front panel
  looks) as the view pulls apart, so the laser sled on its rails and the spindle show; the exploded STL and drawing show it open.
- **The board's fixing.** Its mounting holes are where its screws pass through it; the screws, and the standoffs under a board on steel or
  MDF, are parts on the list, as many as the board says it is fixed by.
- **Design it from the concept** (Start from…, `src/lab-assembly-compose.js`): for a product none of the starting points fit (a bike light,
  a drone, a kettle), Claude lays out every part from the concept's picture and words in the engine's own terms (its shapes, materials,
  processes, finishes and electronic parts, with its rules for units, placement, walls and draft), so it is checked, wired, costed and
  certified like any other. What the checks find wrong goes back to be fixed, twice at most; a repair that makes it worse is not taken.
  The result is saved as a start; the review takes it on from there. `ENGINEERING_COMPOSE_DAILY` (30) caps a day's;
  `ASSEMBLY_COMPOSE_FIXTURE` stands in for Claude in tests.
- **Engineering review** (Checks tab, `src/lab-assembly-review.js`): product engineers (Claude, and an OpenAI model when
  `OPENAI_API_KEY` is set; `ENGINEERING_CHECKER=claude|openai|both`) look at the assembly against the concept's picture (or its words) and
  at what a product of its kind needs. They see it assembled and pulled apart (its real parts), its parts list and the engine's read, and
  score six points out of 100: reads as the concept, nothing missing, made the way it should be, goes together, works and is safe, cost
  holds up. The stricter judge's score stands, less 10 for each problem the engine still finds (up to 30); 90 passes. They ask for edits
  as bounded operations (set one field of a part, add a part, remove one): what both ask for (numbers and sizes met in the middle), or one
  asks for and the other does not dispute, is made, unless it adds a problem to the engine's checks, when it is refused and they are told
  why. The last part of its kind the product works by (its only battery, radio, amplifier or board) is never just removed: a judge replaces it
  (additions are made before removals) or changes it, and the engine flags an electronic product left with no battery, mains supply or
  power socket. Rounds repeat until the bar, nothing left to change, or two rounds without gain; the best assembly seen is the result. What the parts
  cannot show (a gasket groove, a living hinge) is listed for an engineer, and disagreements are shown. Nothing is saved until **Use these
  changes**. Capped at `ENGINEERING_REVIEW_DAILY` (40) a day; `ENGINEERING_REVIEW_FIXTURE` stands in for the judges in tests.
- **Costs calibrated from factory quotes** (`src/lab-cost-calibration.js`, table `lab_cost_samples`): each time a factory quotes a tech
  pack whose product was engineered here (from the factory's link, or entered by staff for it), the quote is kept beside the engine's
  estimate for that assembly as it is then: the unit price at the quote's tier nearest the costed volume, the tooling and the lead time.
  For electronics and for other goods apart, the median of quote ÷ estimate is pulled toward 1 while samples are few (weight n / (n + 3))
  and kept between 0.4 and 2.5; quotes in another currency than USD are kept but not counted. The summary then shows the unit, tooling and
  weeks *on quotes* beside the engine's own figures, with how many quotes they rest on. A factory's unit price includes its margin, so the
  unit factor carries that gap too. `GET /v1/lab/engineering/calibration` lists the factors and samples; `POST …/calibration/learn` re-reads
  every quote (staff).
- **Benchmark** (`/lab/engineering/benchmark`, staff, under **Sites & health → Engineering benchmark** in Work; `src/lab-benchmark.js`, table `lab_benchmark_runs`): how good the engineering is,
  measured. Twelve kinds of product (a power bank, a waterproof Bluetooth speaker, a rear bike light, a wireless mouse, a Wi-Fi smart plug,
  a kitchen scale, a handheld fan, an LED desk lamp, a sonic toothbrush, a Bluetooth tracker, an insulated bottle, a phone stand), each
  with what is known about it: its size (published dimensions of the common products of its kind), the parts it cannot do without, a part
  count from public teardowns, and ranges for the cost to make at 5,000 a year and its tooling. **Run the benchmark** designs each from its
  words alone, reviews it with the judges configured, and scores it out of 100 before and after the review: size 20, must-have parts 25,
  the engine's checks 15, part count 10, cost to make 20, tooling 10 (in range scores full, falling to nothing at twice or half). The
  summary gives the averages, the weakest measures, what is most often missing, and whether the review's verdict agrees (a 90 on review
  against 80 here); a product that passed the review but scores weakly here is named, as that is where the review's 90 is not enough. One
  run at a time in the background, the table filling as each product finishes (about half an hour for all twelve); one product can be run
  alone. `ENGINEERING_BENCHMARK_DAILY` (3) caps a day's runs; with the fixtures, the same answers stand in for every product.
- **Health** (Sites & health → Platform health, section *Design Lab and engineering*): **Design Lab on client rooms** (rooms with the Lab paid
  for or free, checkouts not paid, the week's AI generations, AI usage invoiced and unpaid; a warning when an invoice sits unpaid past two
  weeks) and **Design Lab engineering** (who reviews, the daily limits, the last benchmark and its score, how many factory quotes calibrate
  costs; a warning when the last benchmark did not finish or scored under 70). The OpenAI card says its key is also the second reviewer.
- **Files** (from the saved assembly): **STEP** for CAD (`src/lab-step.js`, AP214, mm): every part an exact solid at its real place, flat
  faces as planes and rounded or round faces as cylinders with their radii, named and coloured, so SolidWorks, Fusion or a toolmaker can
  measure and edit it (an elliptical part is faceted, a ball a faceted ellipsoid; all closed solids, checked with OpenCascade); STL
  assembled, exploded, or one part (mm); the exploded isometric drawing with balloons and the parts
  list (SVG); the parts list (CSV); the block diagram (SVG). The STL and the drawing carry the **parts' real shapes**, the same 3D parts the
  page shows (the driver's basket and cone, the board with its chips and passives, bosses and ribs inside a housing), built on the server
  (`src/lab-parts-mesh.js`, three.js without textures; a texture's ground colour is kept, so a board reads as solder mask). The drawing's
  picture is rendered with a depth buffer and ink lines where parts meet; balloons and the parts list stay vector. `?simple=1` gives the
  engineering's plain boxes and shells (a lighter STL). The last dozen products' shapes are kept in memory, so a second download is quick.

- **Into the tech pack.** Files → *Send to the tech pack* (once the concept has a pack) lays the engineering into it (`packFromAssembly`,
  merged by `src/lab-handoff.js`): the assembled and exploded views as sketches; every part, the board assembly and each cable as BOM
  lines (marked *From engineering*, with unit costs, which the pack hides from factories); the assembly steps, each tool (steel, cavities,
  side actions, weeks to T1, no tool cost) and the checks still open as construction lines; and for an electronic product its components
  with reference designators (U1, J1, SW1–SW5, W1…), the certifications (one the pack already has keeps its status) and the electrical facts
  the pack has not filled in. Sending again replaces what engineering sent last time and nothing else; a published pack goes out as the next
  version with what changed, as the flats do.
- **The factory's production package** gains `engineering/`: the assembly for CAD (STEP) and in place (STL, real shapes), a STEP and an STL per part the factory makes
  (`parts/NN-name.stl`, NN its item on the parts list) for the toolmaker, the exploded drawing, the parts list, the cables and the block
  diagram, all without our costs. The README says what each is; when the engineering changed after the version was published, it says so.

The client's room uses the same page on its own concepts; another room's concept answers 404. Journey **J267**.

## What clients see first (audit, phase 1)

- **Pricing on a phone** stacks one plan per row. The page sets the column count as `--cols` (four, or three when membership is off), so the phone and tablet rules still apply. An inline `grid-template-columns` used to override them.
- **A client's Lab home** counts their own work: line plans, concepts, still in draft, approved, tech packs. Each tile links to its tab. The market-research tiles (pieces, brands watched, search · AI read) are for staff only.
- **The board asks only for pictures that exist.** A tile with no picture shows "No picture" without fetching. Colourway swatches tint the flat when it is ready, or the picture when there is one, and otherwise stay a plain swatch. There are no more 404s for missing views.
- **The Studio opens where the work is.** A piece with flats but no picture (for example from the recipe menu) opens on its flat front, with the "Draw the picture from the flats" bar. A scratch page, a drawn picture or `?view=` still decide as before. The blank-page hint shows only when the Studio opens on the Picture view.

Journey J273 covers all four.

## Easy on a phone (audit, phase 2)

- **The step bar** fits all five steps on a 390px screen: no separators, tighter padding, and taller pills under 440px.
- **Tap sizes:** `cue.css` makes buttons, pills, chips, segments and steps at least 36px tall on touch screens and narrow windows. Check boxes are 20px there. The map's region buttons on Factories and the language switch on Start were enlarged too.
- **Materials kinds** sit in one sliding row with a fade at the edge. The picked kind scrolls into view, and search takes the full width.
- **The Studio's concept list** (also `/lab/engineer` with no concept) wraps long names inside the screen.
- **The help tab** fades out (and ignores taps) while the page scrolls on a phone, and comes back when the page rests. It fades rather than slides so it never sits past the edge of the screen.
- **The Clients page** on a phone opens straight on its clients. The section tab already says Clients, so the banner, the orbit and the moving rail are left out. A client cover photo that fails to load is removed rather than shown broken.

Journey J274 covers these.

## Polish (audit, phase 3)

- **Builds:** when several builds share one sync problem (a refused GitHub token, say), it is said once above the builds, and each of those cards reads "Not synced: see above". A problem only one build has stays on its card.
- **The work console menu** resets `.lbl` inside the sidebar, so a page's own label style (the Brand page's small uppercase mono) no longer restyles the menu.
- **Controls with no name:** the sweep's flags on /help, /join, /prototypes and the tech pack were false positives. Each control has visible text, or is the hidden spam trap on /join, so nothing changed.

Journey J275 covers the first two.

## After the re-audit

- **Help tab:** at rest on a phone it is a slim 24px handle that stays in the side gutter, so it no longer covers the start of a row. It still fades while the page scrolls.
- **Studio header on a phone:** Edit recipe sits under More, so the Checklist, Save, More and Panel buttons fit on one row. The flats and pattern views have two rows of buttons instead of three.
- **Clients on a phone:** the list starts right under the section tabs.

J274 checks all three.

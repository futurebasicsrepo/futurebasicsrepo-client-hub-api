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

Every Lab page carries the same navigation (`src/lab-nav.js`, served as `/lab/nav.js`), in three groups and the order the work happens: **Make** (Line plans, Concepts, Design, Assortment board), **Libraries** (Sketch pack, Graphics & techniques, Materials, trims & tags) and **Research** (Pieces we found, What's moving, Brands we watch, Brand code), with the flow written out on the right (Line plan → Concepts → Design → Tech pack → Factory → Samples) and the current step marked. Design shows the same groups as a **Lab ▾** menu in its bar. Opening the studio or the flats from the navigation, without a concept, shows a concept picker. The console's Design Lab link opens `/lab`, where the work comes first on the page (plans, concepts, the board), then the three libraries as cards, then the research.

**The sketch pack** (`/lab/sketches`): every flat sketch we draw from, searchable and filtered by range (men's, women's, accessories) and style, each opening large with its front and back; **Open in Design** starts a new concept from that sketch (its name, category and silhouette from the sketch; no plan and no AI needed; `POST /v1/lab/concepts/from-sketch {template}`) and opens Design on its front flat at the sketch's proportions (a double-click on a picked sketch does the same); **Put it on a concept** opens that concept in Design on its flat front, drawn from the sketch (`/lab/studio?concept=…&view=front&template=…`). A second shelf shows the parts (pockets, zips, collars, trims, buttons).

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

Routes: `GET /v1/client/lab`, `POST /v1/client/lab/checkout`, `POST /v1/client/lab/landed`, `POST /v1/client/lab/invoices/:id/landed`, `GET /v1/client/lab/usage`; `GET /v1/products/:id/make`, `POST /v1/products/:id/make-request`, `POST|DELETE /v1/products/:id/quote-links[/:sid]`; staff `GET|PATCH /v1/admin/clients/:id/lab` (`comp`, `end`, `bill`), `POST /v1/admin/lab/invoices/:id/paid`, `GET|PATCH /v1/admin/make-requests[/:id]`. Tables: `lab_access`, `lab_ai_usage`, `lab_ai_invoices`, `make_requests`. Tests: `test/lab-access.test.js`, journey J232.

**The flat follows the picture.** A concept's flat is drawn as the garment its picture shows: the vision model reads the picture (cached per picture) for the garment type, its fit and the colour of its main cloth, and the picture wins over the line's category, so a trucker jacket in a Tops line is drawn from a jacket sketch in its denim colour, not as a sweatshirt. The words still decide when there is no picture, and a jacket is a jacket in any line (trucker, bomber, chore coat, shacket, anorak…). A flat saved before as another garment says so above the drawing (**The picture shows a … ; this flat is drawn as a …**) with **Redraw from the picture**: the garment, fit and colour come from the picture, the graphics come along, and nothing is kept until Save. `GET /v1/lab/concepts/:id/flats/from-picture`.

**Removing a graphic from the flat** takes it off the garment on the picture too (one record): it stays a layer on the picture, and the next save no longer puts it back on the flats.

**Charges off for a room.** On a room in the work console, **Design Lab charges** is a switch like free tech pack access. Switched on (charges off), the room's Lab is open at once with no fee and no end date; AI generations are counted but never billed or paused, and tech packs come with the open Lab. An invoice raised before stays owed. Switched back off, a room with no paid period sees the offer again; its plans and concepts stay. Stored as `clients.lab_free`; `PATCH /v1/admin/clients/:id/lab {action: 'free'|'charge'}`, written on the room's record.

**Inviting a designer.** On a room in the work console, **Invite a designer** takes an email: the address may then sign in to the room (it is added to the room's allowed emails, as a teammate added from the hub is), the invite is on the room's record, and the designer gets the welcome by email: how to keep the Lab on an iPad's home screen, how to sign in with the emailed code, and what Design, Simple and Pro, and the Checklist are. An address that already signs in to another room is refused (one person, one room). `POST /v1/admin/clients/:id/lab/invite {email, name?}`.

**Who opens this room.** A person is in one room at a time, and the hub opens the room their session holds, so a charges switch flipped on one room never reaches someone whose hub opens another. Under the switch, the console lists any address on the room (its list, its contact, its team) that opens a different room, by name, with **Move them here**: the address comes off every other room's list and onto this one, their user moves here, and the session they hold on the old room ends ("Your room changed. Sign in again", code `MOVED`); signing in again opens this room. A room that is not active takes nobody. When two rooms could take an address at sign-in, the room that lists it wins over one that only claims its domain, then the room the person is already in, then the oldest. `GET /v1/admin/clients/:id/lab/people`, `POST /v1/admin/clients/:id/lab/people/move {email}`.

**How to start.** The first time a client's designer opens the Lab, a short welcome shows the same steps (the iPad step is left out once the Lab runs from the home screen). **Got it** puts it away; **How to start** in the Lab's header brings it back.

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

**Room to draw.** **Panel** (or `\`) folds the right-hand panel away, on the picture and on both flats, so the drawing takes the width. **Focus** (or `F`) hides the page header, the console menu and the Guide switch, trims the words around the flat, and asks for full screen where the browser allows it. Both are kept on the device for the next time Design opens, and a second press brings them back.

**On the flats**, two fingers on a graphic resize it about its centre, keeping its shape (anywhere else they zoom the flat). What is drawn on a flat covers the whole window, not only the garment's frame: the drawing spans all the window shows at full view, and an older, smaller drawing grows to the window before the next stroke, keeping what is on it.

**Zoom.** Moving or zooming the picture does not put its layers together again each frame (that made pinches slow and jumpy). A trackpad pinch (Magic Keyboard), which Safari reports only as gesture events, zooms the picture or the flat under the pointer, and Safari's own page zoom (a pinch or double tap anywhere in Design) is turned off. The flats have − / % / + / Fit like the picture, a two-finger trackpad scroll moves a zoomed flat, and a pinch keeps the point between the fingers where it is. The flat is redrawn as it changes, so a finger's lift could reach an element no longer there and leave a finger "down" for ever, which threw every later pinch off: the flat's canvas now keeps every touch, and the first finger down clears any finger whose lift went missing.

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

**Open in Design** on a concept (or on its card in the assortment viewer) opens it on its picture. It is a layered editor that runs in the page itself, with no outside software.

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
    - How it is built: each colour is cut into shapes. A shape no wider than the satin limit (7 mm) is satin: stitches cross it edge to edge at the angle that crosses it shortest, over a centre-walk underlay, longer stitches split. Wider shapes are tatami fill: 0.4 mm rows at 45°, needle points staggered so no lines show, over a tatami underlay at right angles. Both edges are pushed out by the pull compensation. Shapes are sewn nearest-first; a move inside the same shape runs underneath in small stitches, any other move jumps with a lock stitch either side, and a long one trims. Specks under 0.6 mm² are folded into what surrounds them; a thread the colour of the garment is not sewn.
    - The settings: width, fill angle, fill density (dense 0.35 mm to open 0.6 mm), satin up to 5, 7 or 9 mm, pull compensation (none to 0.3 mm for knits and fleece), underlay on or off. Changing one digitizes again.
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
- **The starting library** has 57 fabrics: denim from 5 oz chambray to 16 oz selvedge (raw, rinsed, stone washed, bleached, overdyed black, ecru, stretch), fleece from 280 gsm polar to 520 gsm heavyweight brushed (cotton, CVC, organic, sherpa), French terry and loopback from 240 to 450 gsm, knits (slub, heather, interlock, piqué, waffle, 1×1 and 2×2 rib, 12-gauge merino and 5-gauge cotton jumper knits), polyesters (wicking interlock, tricot, pongee, softshell, 4-way stretch, mesh), ripstop (30D and 40D nylon, cotton, NYCO, 210D polyester), nylon (taffeta cire, 2-layer taslan, 420D oxford, 1000D Cordura) and canvas from 7 oz to 18 oz duck (washed, garment dyed, brushed, waxed, hemp). Mills and prices are starting points to confirm.
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

**Tags and labels in the studio.** **Design** on a tag's card (or **Design it in the studio** in its form, or **Design it** beside a tag on a garment in Design's Fabrics, trims & labels) opens the tag in the studio (`/lab/studio?tag=<id>`, with `&for=<concept>` from a garment) at its real size: its blank face (shape, fold, weave, colour) is a picture layer and each line of its words is a type layer, and every studio tool works on it (fonts, words, colours, graphics from the library, drawing, the AI). **Use on the tag** (and every save) puts the design on the tag as its face (`spec.face`, a graphic in the library): the library cards, the tag's picture and the sheets draw the face instead of typing the words, and the tech pack names it in the label row and carries a picture of each designed label. Starter tags are shared by every room, so designing one makes a copy, "… (ours)", in your own library. **Add to a garment** puts the label on a garment's bill of materials (straight onto the garment it came from, or one you pick), and a copy takes the starter's place on it. The design is in the graphics library too, so it can be placed on the flat like any graphic.

**On a concept** (the concept window, "Materials, tags and colourways"): add the main fabric (the one before becomes the contrast), rib, lining, trims and tags. Each pick takes the usual quantity for that kind of piece (a top takes 1.3 m, a jacket 2.6 m; a trim its count per piece) which can be changed. The cost adds up: materials + making (the usual cut-make-trim for the category, or ours) + freight and duty (18%, or ours) = landed cost, and the margin against the target price. The concept's cost follows, so the plan's margin flags read it. The fabric words on the concept follow the main fabric.

**Colourways** are set on the concept (name and colour; the Pantone, and the thread's, are read from the colour) and shown side by side on the assortment board: the flat washed in each colour under the tile.

**In the studio**, the AI tab's "The fabric" picks from the library: **Use it on the concept** (cost and margin update) and **Redraw the piece in it** (the image model draws the piece in that cloth and colour, as a new layer).

**To the tech pack**: every material becomes a BOM line with its spec, supplier, code, colour, quantity, unit and unit cost (marked "From the materials library", replaced when sent again); every tag becomes a line in Labels (size, shape, fold, material, print, string, where it goes, the words on it); the colourways go on with their Pantones. They travel with the flats, or on their own when there are no flats yet.

Routes: `src/lab-materials-routes.js` (`/v1/lab/materials…`, `/v1/lab/concepts/:id/materials…`, `…/costing`, `…/colourways`); the data, starting set and costing in `src/lab-materials.js`; the tag drawing in `src/lab-tags.js` (served as `/lab/lab-tags.js`); the page `src/lab-materials.html`. Table: `lab_materials`; a concept keeps its picks in `spec.materials`, its costing in `spec.costing` and its colourways in `spec.colourways`.

## Flats and placement, and "can it be made?"

**Which sketch a piece is drawn from.** The concept's words are read for the piece's family (jeans, chinos, sweatpants, track pants…: from its name, silhouette and fabric only, so a ripstop pocket lining does not make a twill pant a track pant), its silhouette (flared, straight, wide, slim…) and its features (cargo pockets, double knee, pleats, carpenter loops…). Every sketch of the style is scored (`rankTemplates` in `src/lab-flats.js`): a feature the sketch has that the concept never asked for counts against it, so a plain boot-cut twill pant is not drawn from a skinny double-knee cargo because it shares a word. With an Anthropic key the vision model then confirms the pick from the concept's picture among the best-scored sketches (cached per picture; off under `AI_FIXTURE`). The Garment tab still lets you pick any sketch by hand.

**Footwear is not drawn as a pant.** A concept whose words read as footwear (boot, sneaker, trainer, shoe, loafer, sandal, mule, clog, slide), with no pant words (boot-cut, pants, jeans, cargo…), gets no flats, wherever its line sits; the flats say it reads as footwear and that flats are not drawn for footwear yet. Before this a boot in a Bottoms line was drawn as a pant.

**Flats and placement** (the flat views of Design: **Flats** on a concept opens `/lab/studio?concept=<id>&view=front`) draws the piece as measured technical flats, front and back, the way a factory reads them. Nothing on it is drawn by an image model.

- **The drawing is a professional flat sketch** from the flat-sketch pack Future Basics bought (Kyle's Google Drive: "Mens Sketches", "Womans Sketches" and "Accessories, Pockets, Zippers"). Every drawing in it is here: 381 sketches.
  - **Men's:** tees and jerseys, long sleeves, crews, hoodies, zips, polos, shirts, tanks, jackets, coats, vests, pants, shorts, the cap and the bucket hat.
  - **Women's:** dresses, skirts, leggings, bodysuits, swimsuits, bikinis, sports bras, camis, tanks, vests, outerwear, sweats and jerseys.
  - **Choosing one:** each piece starts on the sketch whose name best fits its words (a pleated tennis skirt on the pleated skirt) and its fit. **Drawing** on the Garment tab is a searchable gallery of thumbnails; **Every style** lets you pick a sketch of another style. A piece starts at its sketch's own proportions, so a cropped tee starts shorter. **Simple outline** draws from the measurements instead.
  - **No sketch yet:** beanies and totes use the simple outline.
- **The sketch is lined up with the measurements.** For each sketch, `scripts/flat-templates/build.mjs` finds the front and back views on the page and measures them: the centre line, the chest between the side seams (or the waistband, or the cap's crown), the high point of the shoulder (or the top of the waistband, or the brim seam) and the hem. The page scales the sketch so its chest or waist matches the piece's, and its length too, held within 12% so it never looks stretched. Placements are measured from the same points, and the checks (collar, zip, pocket, seams, edges) work from the measurements, so they agree with the spec whatever the sketch.
- **Design tab: change the drawing.** Every sketch can be reworked without leaving the page. **From the sketch pack** places the pack's own add-on parts (about 200 pockets, zips, collars, trims and buttons, cut from its add-on sheets) on the flat:
  - **Colour.** A swatch or any colour recolours the whole piece: the white cloth takes the colour and the sketch's lines and shading stay. A dark colour gets light lines so the drawing still reads.
    The colour fills the garment's silhouette: the sketch's lines and everything they enclose, never the space around the piece or between its legs (`src/lab-flat-mask.js`). Some of the bought sketches fill those negative spaces white and leave the panels empty, so a plain recolour landed in the wrong places. Each sketch's silhouette is made ahead of time in `src/flat-templates/masks/` (`npm run flat-masks` after adding or changing sketches; `--all` remakes every one) and served at `/lab/flat-masks/<sketch>.png`; a missing one is made the first time it is needed.
  - **Details.** Patch, flap, welt, cargo, kangaroo, slant, jean and zip pockets; single, double or triple pleats; drawcords; zips; button plackets. Each lands where that detail usually goes, then drags into place or takes exact sizes in inches. Each has its own topstitch (single, double or triple needle, chain stitch, coverstitch, zigzag, bartack, blind hem), thread colour and fabric colour. **Mirror** copies one to the other side; **Cover up** hides something on the sketch, like the pocket you are replacing.
  - **Stitch lines.** Click along a seam or edge, then double-click or press Enter. Pick the stitch type, the thread colour and the stitches per inch.
  - **Colour blocks.** Click round a panel (a sleeve, a yoke, a hood lining) to give it its own colour. The sketch's lines show through.
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

**Pattern** sits beside Picture, Flat front and Flat back in Design (`/lab/pattern`, in a frame; the drafting is `src/lab-pattern.js`, shared by
the page and the service).

- **Garments** are drafted from the flats' own measurements, so the pattern grades with the size picked:
  - tops: front and back on the fold (a pair of fronts when it opens), sleeves whose cap is sized to the armhole, neck, cuff and hem ribs,
    hood sides, the kangaroo pocket, and for shirts a yoke, collar, stand and cuffs;
  - bottoms: front and back legs (the back crotch longer), the waistband, pocket bags in pocketing, the fly facing, back pockets;
  - caps: six crown panels, the brim with its board, the sweatband; bucket hats, beanies (knit to shape) and totes too.

  Each piece has its sew line, the cutting line (the seam allowance: ⅜ in for knits, ½ in for wovens, or as chosen), a grain line, notches, and
  how many to cut and from which cloth.
- **Plush** is drafted from a few choices: a bear (head sides and gusset, muzzle, body front and back, arms, legs, foot pads, ears), a bean
  character, a bunny or a pillow character. You also choose the height, the ears, the arms, legs and tail, the pile fabric, the eyes and the age.
  The pieces carry a ¼ in allowance, the pile direction, and the stuffing opening.
- **Plush safety checks** follow the age (ASTM F963 and EN 71): safety eyes on a toy for under-3s fail; small appendages and long pile are
  flagged; the law label and tracking label are listed. The page estimates the fill in grams.

**Product → Exploded → Cutting layout.** The slider (or **Explode it**) lifts the pieces off the product (front and back side by side), spreads
them out, then lays every cut flat on the cloth. The cutting layout shows each fabric at its width, how much it takes (yards), and how much of
the cloth is used. That is an estimate from a simple row layout; the factory's marker does better.

Files: `GET /v1/lab/concepts/:id/pattern.dxf` (R12, inches, on the CUT, SEW, GRAIN, NOTCH and TEXT layers, for Gerber, Lectra, Optitex or CLO)
and `pattern.svg` (every piece at real size: print at 100%), each for the size asked for (`?size=L&width=60`). A plush's choices, and a
garment's seam allowance and cloth width, are kept in `lab_patterns` (`GET|PUT /v1/lab/concepts/:id/pattern`).

A pattern from the Lab is a **first block from the measurements**: a pattern maker trues it up on the first sample. Toys and objects (tooling) and
electronics (the engineering) say so on the Pattern view: they come next, one at a time.

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
- **Inside the shoe:** the linings, the collar foam, the heel counter and toe puff (thermoplastic), the insole board and the sockliner.
- **Allowances:** each piece carries the ⅝ in lasting allowance and ⅜ in overlaps.
- **The sole unit** (cupsole, EVA midsole, or a stitched outsole and heel) is shown as a moulded component: it is never cut.

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

### Reading a shoe from its picture

A footwear concept with a picture (an AI concept, the studio's picture, or a photo) is read by `src/lab-shoe-read.js`, so its last and its upper
follow what was designed. The styles cover athletic shoes and boots alike: court sneaker, high-top, runner, derby, loafer, Chelsea, lace-up boot
and hiking boot.

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

## Editing pieces and the AAMA/ASTM DXF

A drafted pattern is a start: a pattern maker can change every piece on the Pattern view and keep what they changed.

**Edit pieces** turns the drawing into the chosen piece on a 1 in grid. In edit mode:

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
- the lasting allowance below the feather line and a boot's shaft above the last carried straight on;
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

## Plush tech flats: the toy as it will be made

A plush's product view on the Pattern page, and **Tech flats (SVG)** under Files (`GET /v1/lab/concepts/:id/flats.svg`, 1:1 in inches), draw it
from the front, the back and the side as it is when stuffed and sewn (`src/lab-plush-views.js`), from the same sizes the pattern is drafted to:

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

- **What the assistant is told** (`CATEGORY_WORDS` in `src/lab-concepts.js`): a plush is cut from pattern pieces and stuffed. It is told the
  shapes the pattern can cut, and that the toy is for children unless the brief says otherwise: embroidered eyes for any age, safety eyes only
  for 3 and up, no small hard parts, no long pile on a baby toy. Its character comes from proportion, the face and colour, with at most one
  embroidered motif.
- **What each concept says** (`spec.plush`): what it is cut as (bear, bean, bunny or pillow), its height, ears, arms, legs and tail, the pile,
  the eyes, the age, and the body and contrast colours. These are the Pattern page's own choices.
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
  height, parts, pile, eyes and colours, over the concept's words.
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
- **What follows.** Each piece is drawn in its cloth's colour, with light ink on a dark cloth. The cutting layout cuts each cloth at its own
  width (a 100 cm rib at 39 in, wider when a piece needs it) and names the material. A cloth part takes its share of the usual metres for the
  piece (the rib a fifth, the lining nine tenths), and the BOM names the part.

**Not yet:**

- Placing a logo or graphic in inches on a shoe's or a plush's views, with the "can it be made" check: graphics are sized in the studio and
  their place is written on the pack.
- The developer's two-judge check for a plush (a shoe has it).
- A shoe or a plush in the range mockup.
- Toys, home objects and electronics still have no pattern or tooling (Phase C and D).

## An elephant, leather, and logos on a shoe or a plush

**The elephant** is a plush shape of its own (`src/lab-pattern.js`, `src/lab-plush-views.js`). It sits, with:

- a head and trunk cut in one (two sides that meet down the trunk's underside, and a gusset from the back of the head over the brow and down the top of the trunk);
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

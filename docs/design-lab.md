# Design Lab

A part of the work console for Danielle and Kyle (and anyone they tick it for on **Team access**). It looks at what brands like Ralph Lauren, Aimé Leon Dore and A-COLD-WALL* make and what is selling through, so line plans start from the market and the Future Basics brand code instead of a blank page.

All three parts are built.

| Part | What it does | State |
| --- | --- | --- |
| **L1 Library** | The brand code, the brands we watch, an automatic reader of the public web, the library of what it found | built (this document) |
| **L2 Line plan** | The trend read across every category, a price ladder held to the Zara line, a line plan drafted from the library and the brand code, margin against the brand code's economics | built (this document) |
| **L3 Concepts** | Concepts with the Future Basics twist, a "too close to the reference" check, an approval board, an approved concept becomes a product and runs the tech pack | built (this document) |

## Who can open it

The Lab is a held-back module on Team access: it is **not** part of the "Everything" preset, **not** part of the default for new people and **not** handed out by the one-time backfill. Owners (the Money list, or `ACCESS_ADMIN_EMAILS`) always have it. An owner ticks **Design Lab** on a person's card to give it to them. Every `/v1/lab/*` route belongs to the module, so reading and writing are both refused (`403`, `code: MODULE_ACCESS`) for anyone without it, and the menu group and `/lab` page say so.

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
- **Future Basics graphics, where it makes sense.** On a tee, a sweatshirt, a cap or a tote the assistant also designs one or two original graphics from simple shapes and our line-and-dot idea, never copied from anyone and never containing text. Each has a placement and a technique (screen print, embroidery, woven jacquard, puff print and so on). A drawing is only kept if it is plain shapes in brand colours (no text, images, links or scripts). Graphics on the front are laid on the picture; ones that go on the back or a sleeve are in the spec and the brief. A clean piece, such as tailoring, stays clean.
- You can change the logo, remove a graphic, or **redraw the picture** from the concept window (`LAB_DAILY_REDRAWS` limits redraws). The too-close check reads the graphics' words too.

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

**Send to tech pack** makes a product in the Future Basics room: the title is the concept's name, the brief carries the concept in words, our twist and the commercial targets (price, estimated landed cost, quantity), the concept's picture is the reference photo, and the tech pack assistant drafts the pack from them (when it is switched on). The brief says the picture is an AI render, not a sample. The planned piece is marked "tech pack" and links to the product (`/tech-packs/<product>`). The brief also carries who it is for, the logo, the woven label and the graphics, so the tech pack assistant starts from them. A concept can only become a tech pack once; it then stays as the record and cannot be changed, rejected or deleted. The tech pack's own landed-cost estimate takes over from the ratio used in the plan.

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
| `LAB_DAILY_REDRAWS` | how many concept pictures can be redrawn in a day (default 30) |
| `LAB_DAILY_PLANS` | how many assistant-drafted plans can be made in 24 hours (default 10) |
| `LAB_WEB_QUERIES`, `LAB_IMAGE_QUERIES` | searches per brand when falling back (default 4 and 3) |

## Where it lives

| | |
| --- | --- |
| Categories, robots rules, feed and page parsers, sell-through, brand code, watchlist (no network) | `src/lab.js` |
| The scanner, the AI read, saving, the due-brand job | `src/lab-scan.js` |
| The trend read, price ladder, line plan logic, the assistant's brief and the CSV (no network) | `src/lab-plan.js` |
| Concepts: the brand-name guard, the closeness check, the assistant's brief, the picture, the product brief (no web server) | `src/lab-concepts.js` |
| The concepts API | `src/lab-concept-routes.js` |
| Reads shared by the Lab's routes | `src/lab-data.js` |
| The API | `src/lab-routes.js` |
| The page | `src/lab.html` at `/lab` |
| Module and access | `src/staff-access.js` (`lab`, held back), `src/console-nav.js` |
| Tables | `lab_brands`, `lab_items`, `lab_scans`, `lab_plans`, `lab_plan_lines`, `lab_concepts`, `lab_concept_comments` (`src/db.js`) |
| Tests | `test/lab.test.js`, `test/lab-plan.test.js`, `test/lab-concepts.test.js`, journeys J193 (API), J194 (library, brand code, watchlist), J195 (browser), J196 (trends and plans, API), J197 (plans, browser), J198 (concepts, API), J199 (concepts, browser) |

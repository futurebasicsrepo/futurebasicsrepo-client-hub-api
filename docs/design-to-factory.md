# Design to factory: the whole flow

This page follows one product from the first idea to a corrected sample: line plan → concepts → studio → flats → tech pack → factory → samples → corrections → back to the factory. For each stage it says:

- who does it;
- where it happens;
- what to press;
- what carries forward to the next stage;
- how to get back to the stage before.

Pip, the helper mouse, walks each stage on screen. Turn on **Guide** at the bottom left of the page.

## The flow at a glance

```
 Design Lab (/lab)                                        Tech pack (/tech-packs/:id)          Factory link (/tp/:token)
 ┌──────────┐   ┌──────────┐   ┌───────────────────────┐  send   ┌──────────────┐  publish  ┌──────────────────┐
 │Line plan │ → │ Concepts │ → │ Design: the picture   │ ──────→ │  Tech pack   │ ────────→ │ reads vN in its  │
 │ pieces,  │   │ drawn,   │   │ and its flats, front  │         │ measurements,│    v1     │ language, writes │
 │ prices,  │   │ checked, │   │ and back: by hand, AI │         │ sketches,    │           │ to us in Messages│
 │ margins  │   │ approved │   │ 382 sketches + parts  │         │ BOM, colour  │           └────────┬─────────┘
 └──────────┘   └────▲─────┘   └──────────────────┬────┘         └──────▲───────┘                    │ "the proto shipped"
                     │ the client approves        │ sent again           │ v2, v3… (each kept)       ▼ we record it sent
                     │ in their hub               └─────────────────────►│                  ┌──────────────────┐
                                                                         └──────────────────│  Sample review   │
                                                                            corrections,    │ measured vs spec,│
                                                                            accepted sizes, │ corrections,     │
                                                                            next sample     │ verdict          │
                                                                                            └──────────────────┘
```

## 1. Line plan

**Who:** the design team, in the work console, in the **Design Lab** (`/lab`, Line plans). Owners have the Lab by default; anyone else needs it ticked on Team access.

**Make one:**
1. Name the plan and the season, and say the idea in a sentence.
2. Press **Draft the plan**.

The assistant plans the pieces from the market read (Library and What's moving). Each piece gets a role (core, trend, hero, entry), a target price, an estimated landed cost and a quantity. You can change any of them, and the margins follow.

**For a client (the design service):** open the plan and use **Who this line is for**:
1. Pick the client's room.
2. Write their brand name and a sentence about the brand.
3. When it is ready, tick **Show it in their hub** and save. Sharing it the first time emails them.

Concepts for a client's line are written for their brand. The logo is left out of the picture: the logo mark is "none". You place their own logo later from the graphics library in Flats and placement.

**Carries forward:** each planned piece's name, category, role, brief, twist, target price, cost and quantity go to its concepts.

## 2. Concepts

**Who:** the design team, on the **Concepts** board.

**Make them:** on a planned piece, press **Make concepts**. The assistant writes several takes and the image model draws each one.

**Each concept is checked against what inspired it.** A "too close" verdict needs a change or a written reason before it can be approved.

**Open a concept to work on it:**
- edit its words;
- **Revise…** with a steer;
- add a graphic from the library;
- comment.

For a client's line, the window also shows:
- the client's verdict and note from their hub;
- a **Visible to the client** tick on comments, so your reply reaches them. Comments without it stay internal.

**Approve:**
- A concept is approved when it is ours.
- If its flats have been drawn and they cannot be made as drawn, approval also asks for a reason.
- If the flats were never drawn, approval goes ahead. How the flats would start is checked anyway, and anything that fails is written on the concept, so nothing is missed silently.

**Carries forward:** the picture, the words, the logo and graphics with where they go, and the price, cost and quantity.

**Materials, tags and colourways** (in the concept window): what the piece is made of, from the materials library (`/lab/materials`): main fabric, contrast, rib, lining, trims, and the tags and labels in their shapes and sizes. The landed cost (materials + making + freight and duty) and the margin follow; colourways go side by side on the assortment board.

**Carries forward:** the BOM lines (with unit costs), the labels and the colourways, into the tech pack.

## 3. Studio

**Who:** the design team, from **Open in Design** on a concept: the **Picture** view of the Design workspace (`/lab/studio?concept=…`), which also shows the flats (step 4).

**What it does:** the concept's picture opens as layers. You can:
- paint, type, and add marks and library graphics;
- add **parts from the sketch pack** (Add → From the sketch pack): pockets, zips, collars, trims and buttons drawn in flat-sketch lines, as a layer you place and size, then blend in with “Change it with AI”;
- recolour and distress;
- have the image model redraw the whole piece or a painted area.
- set the real size with the **ruler** (U), then read each mark's size in inches and cm, check it against where it goes, and see its cost a piece;
- see a graphic's **colour separations** (a plate per ink, with Pantones) and download them for the printer;
- download a layer as **vector paths (SVG)** or as an **embroidery stitch file (.dst)**;
- choose where a layer **goes on** the piece: saving puts it on the concept and its flats at its size;
- **warp** a mark to the piece (arc, bulge, wrap, wave, or by hand with the warp tool, W), while its factory size stays flat;
- recolour a mark **tone on tone** from the fabric under it, with Pantone codes.

**Use as the concept picture** makes the finished picture the concept's. **Restore** puts back the picture the concept had before.

- choose **the fabric** from the materials library (AI tab): the concept is made of it, and the image model can redraw the piece in that cloth.

**Carries forward:** the finished picture. It becomes the tech pack's first sketch.

## 4. Flats and placement

**Who:** the design team, from **Flats** on a concept, or the **Flat front** and **Flat back** views of Design (`/lab/studio?concept=…&view=front`). The flats and the picture are one workspace: **Side by side** shows both, and one Save keeps both.

**What it shows:** the piece drawn from a professional flat sketch, front and back, scaled to its measurements. Every drawing in the flat-sketch pack is there: 382 sketches, men's and women's.

| Range | Styles |
| --- | --- |
| Men's | tees and jerseys, long sleeves, crews, hoodies, zips, polos, shirts (short and long sleeve), tanks, jackets, coats, vests, pants (pleated trousers included), shorts, the cap and the bucket hat |
| Women's | dresses, skirts, leggings, bodysuits, swimsuits, bikinis, sports bras, cami tops, tanks, vests, outerwear, sweats, jerseys |

**Pick the drawing** on Garment: a gallery of thumbnails, this style's first. Search it by name (cargo, pleated, halter, cropped…), narrow it to men's or women's, or tick **Every style** to choose a sketch of another style (the piece becomes that style). A piece starts at its sketch's own proportions: a cropped tee is shorter, a maxi dress longer, long jorts have a longer inseam.

The concept's own words pick the first sketch: a "pleated tennis skirt" starts on the pleated skirt.

**Tabs:**
- **Placements:** every logo and graphic, placed in inches from the HPS and the centre front, with its technique.
- **Design:** change the drawing itself.
  - **Colour:** a garment colour, and colour blocks for contrast panels.
  - **Details:** pockets (patch, flap, welt, cargo, kangaroo, slant, jean, zip), pleats, drawcords, zips, button plackets, and a cover-up to hide something on the sketch.
  - **From the sketch pack:** the pack's own add-on parts, cut out one by one: about 200 pockets, zips and pullers, collars, trims and buttons, drawn in the same lines. Add one, drag it into place, size it, mirror it. It takes the garment's colour, and the tech pack names it.
  - **Stitch lines:** in eight stitch types, with thread colour and stitches per inch.
  - **Redraw an area with AI:** drag a box, say what to change, and the image model redraws only that area in the same flat-sketch lines.
- **Garment:** the style, the fit, the sketch it is drawn from, and the sample-size measurements. Every other size is graded from these.
- **Measurements:** the graded points of measure.

**Save** checks that everything can be made:
- each placement is on the piece and clear of seams, collars, zips and pockets;
- it is within the technique's size;
- its artwork holds the technique's finest line.

**Spec sheet** prints the flats with every placement, detail and stitch, in words a factory reads.

**Save** also prices each decoration: its size, colours as Pantone C, the setup (screens, a digitised design, a mould) shared over the planned quantity, and a cost a piece. The total goes into the concept's landed cost and margin.

**For the factory**, on the selected placement: **artwork by garment size** (one, two or three artwork sizes across the run, scaled with the chest) and **inks by colourway** (an ink lost on a colourway is moved until it reads). **All-over print** lays a repeat from the library over the whole piece. **What the decorations cost** lists each decoration's price a piece, with **Record the factory's quote**: real quotes move later estimates towards what factories charge.

**Decoration sheet** gives the decorator one page per graphic. Each page has the size, the Pantones, the technique with its factory note and rules, the cost, where it goes on the flat, and what to check before it is made.

**Carries forward, through Send to tech pack:**
- the graded points of measure and the size run;
- the front and back flats, as the pack's sketches and as files;
- every placement, detail and stitch, as construction lines;
- decorations (with their size, Pantones and cost a piece), contrast threads and colour blocks, as BOM lines;
- the main colour, as the first colourway;
- the target retail price;
- a note with the target landed cost, the quantity and the line plan.

**Send to the tech pack** on the flats page sends them again after a change. It replaces what came from the flats last time and never doubles a file. Once the pack has been published, flats sent again go out as the **next version** (v2, v3…): the version before stays exactly as it was. Sent again with nothing changed, they make no new version.

## 5. Tech pack

**Who:** the team, in the work console (`/tech-packs/:id`). For a client's line, the client also sees it in their hub.

**What the Lab wrote stays as the designer set it.** The assistant (Run assistant / Re-run assistant) drafts and checks, but never rewrites rows that came from the Lab: the flats' measurements ("From the flats"), the materials library's BOM lines and colourways ("From the materials library"), the flats' construction lines ("Flats · …") and sample corrections ("Correction · …"). Its own rows go beside them, and the pack's notes say how many Lab rows were kept. What it would question shows in its checks (the Check tab, the exchange), as findings for a person to act on.

**How it starts:** **Send to tech pack** on an approved concept makes the product and its tech pack:
- in the Future Basics room for our own line;
- in the client's own room for a client's line, under their brand and without our logo or label files.

The assistant drafts what the concept did not give, such as materials, care and labels. Anything already in the pack from the flats, or typed by anyone, is kept.

**Getting around:** the breadcrumb leads back to the concept and its flats (**From the Design Lab: concept · flats**).

**Publish** makes a numbered version. A client approves it in their hub by signing with their full name. Each later version says what changed.

**The chain of versions:** a published version is never changed. Corrections, flats sent again, anything specified, go out as the next version, and every version is kept. On the pack's Style tab, under Revisions, **View v1** (or any version) shows it exactly as it was published; press it again to go back to the draft.

## 6. Factory

**Who:**
- The team assigns the factory.
- The factory works on its own private link, in its language. It needs no account.

**Assign:** on the published pack, choose the factory and send it for a quote or to make.

**On its link, the factory reads and writes in Messages.** It reads every version and what changed in it, and writes to Future Basics in **Messages**, about the whole pack or about a single callout (**Ask about this**). It has no buttons that change anything.

**The team records what the factory says:**
- its quote (Sign tab, **Record a quote**);
- that it acknowledges the callouts and countersigns (**for the factory**, each marked as done by Future Basics);
- that a sample shipped, with its tracking (Samples, **Record it sent**).

A factory asked to quote again sees what changed in each version too.

**Letting factories act on their own links:** the Factories page has a switch, *Let factories quote, acknowledge, countersign and mark samples sent on their own links*. Off is the default. On gives the factory those buttons back. `FACTORY_ACTIONS=on` in the environment does the same when nothing is set on the page.

## 7. Samples and corrections

**Who:** the team, on the pack's Samples block. The factory sees the samples on its link.

**Plan them:**
1. **Add the usual stages:** proto, fit, pre-production and top of production.
2. Set the quantity and due date.

The factory sees what is due. When it ships, it says so in Messages; the team presses **Record it sent**, adds the tracking, and the sample shows **Sent · tracking …** on the pack and on the factory's link. Tracking is not part of the spec, so it is no new version.

**Review a sample when it arrives:**
1. Press **Review this sample** and type what you measured off it for each point of measure.
2. The table shows how far off each point is and marks anything out of tolerance ⚠.
3. Tick **Make it the spec** to accept a measurement. The size run moves with it.
4. Add corrections (where, and what to change).
5. Choose **Approve this sample** or **Needs corrections**.
6. Press **Make v2 from this review** (the number is the next version's).

**What that press writes into the pack, and sends to the factory as the next version:**
- the accepted measurements, as the new spec;
- every correction, as a construction line (`Correction · Proto sample: …`);
- every measurement still out and not accepted, as a correction;
- the sample's status set to approved or revise;
- the next sample asked for, or a "(corrected)" one added.

It asks first, then publishes the next version for the factory. The version the factory sampled from stays exactly as it was. Cancel keeps the corrections in the draft to publish later.

### The sample held up against the design, and the time-and-action calendar

- **Photographs of the sample** go on its review (up to four). **Compare with the approved design** sends them to the vision model next to the pack's own pictures and spec (artwork placements in inches, colourways with Pantones, materials, construction lines, labels). Back comes a score, a verdict and the differences, each with where, what kind (placement, colour, wash, construction, measurement, material, artwork, label), how serious, what the design says and what the sample shows. **Add the differences as corrections** writes them onto the review; the next version carries them to the factory. The comparison is kept on the pack.
- **Time and action.** Under the samples, every step with its due date, the day it was sent, the day it was reviewed and where it stands (done, late by n days, due soon, on track, no date). **Date the samples** dates every undated sample in order from the day the pack goes out (proto 14 days, fit 12, pre-production 14, top of production 7; a corrected sample 70% of that); **Date them all again** redoes them. A sample past its date shows on the console's **Production attention**, on the factory until it ships and on us once it has.

## 8. Back to the factory

The corrected version is published by the review itself (or by **Publish**, if you kept it as a draft). On its link the factory:
- reads the new version;
- sees **What changed in vN**: the measurements, the corrections and the samples;
- keeps its acknowledgements for callouts that did not change;
- is asked for the next sample;
- answers in Messages.

The loop runs again until the sample is approved, then pre-production and top of production follow.

## The design service: what the client sees

Shared lines appear in the client's hub under **Design**, with a link in the top menu. For each piece the client sees:
- the picture;
- the idea;
- the target price and quantity;
- **Flats and measurements**: the spec sheet;
- the team's replies.

**Their choices on each piece:**
- **Approve** it;
- **Ask for changes**, saying what (the fit, a colour, a detail);
- send **Just a question**.

The team is emailed either way. An approved piece moves to **Your tech packs** once the team sends it to a tech pack. From there it is the same as any pack: approve it, approve the quote, pay the deposit, and follow the samples.

Nobody else sees a client's line. Another client, or anyone without the link, gets nothing.

## Selling it

The pricing page (`/pricing`) has two sections:
- **Tech packs:** first pack free, one pack, membership, or a project with us.
- **Design with us:** two packages, **Design a piece** and **Design a line**.

The design packages show **Quoted** until their prices are set in the service's environment:
- `DESIGN_PIECE_PRICE_CENTS`: price per piece;
- `DESIGN_LINE_PRICE_CENTS`: shown as "From …";
- `DESIGN_CONTACT_URL`: where their buttons go (the contact page by default).

Packs made from the design service skip the per-pack paywall. They are billed as part of the design work, through Money and Agreements like any project.

- **The Design Lab (self-serve):** a third tier. A fixed fee opens the Lab on the client's own room for a period with some AI generations included; the rest are metered and invoiced in rounds. Tech packs come with it, every cost is marked as an estimate the factory confirms, and a finished pack goes to the client's own factory for a quotation or to Future Basics to make. See *Self-serve: a client's room buys the Lab* in `docs/design-lab.md`.

## Reviewing together

- **Comments pinned to a spot.** In the concept window, press **Pin to a spot**, click the picture, write the comment. Pins are numbered to the comments; a comment is marked **Done** once dealt with (and can be reopened). A client in their hub, and anyone on a review link, can pin too.
- **Studio versions.** Every picture used as the concept is kept as a version, and **Keep this as a version** keeps one on purpose (the last forty). **Versions** in the studio lists them; tick two to see them side by side with a wipe; **Open its layers** puts an old version back on the canvas to carry on from.
- **A view-only link.** In the concept window, **Share for review** makes a link for the client, the factory or anyone (7, 30 or 90 days). It opens without a sign-in (`/lab/share/<token>`): the piece, the flats, the colourways and the comments; they add comments, pinned or not, under their name; nothing on it can change the design. The link is shown once; **Turn off** stops it. Opens are counted. Comments left on a link reach the team by email and show on the concept with "(client)" or "(factory)".

## Graphics: where they come from and where they go

A graphic can start in four places, and every one of them ends in the **graphics library** (`/lab/library`), so it can be used on any piece later:

| Starts | How |
| --- | --- |
| A line plan's program or a concept | drawn by the image model when the plan or concept is made |
| The library | **Draw a new graphic**: words, ink colours, a style and what it is made for |
| Our own files | **Add our own artwork** (PNG, JPEG, WebP; transparency kept) |
| The library's studio | **Build a graphic in the studio** opens the studio on a clear canvas: draw with AI, paint, type, add marks, parts from the sketch pack and other library graphics as layers, then **Keep in the library**. The layers are kept with it, so **Rework in the studio** opens it again as it was built, and **Update the graphic** replaces it |

From the library a graphic goes:

- **onto a concept** (Put it on a concept: where, and made how), placed on the picture, with its technique on the tech pack;
- **onto any product** (Put it on a product: search any client's products): it lands on the product's tech pack as artwork, Pantones read, placed on the front view at the width you give; the pack is made first if the product has none yet;
- **onto the flats** (Design → Add a graphic) as a placement with inches from the HPS and centre front;
- **into a tech pack from the pack itself**: **From the graphics library** beside Upload artwork, on the artwork tab.

**The job file.** A graphic plus a technique becomes the production artwork pack a factory or digitiser works from: on a graphic in the library (**Factory job file**: made as, width, garment colour) or on the tech pack's artwork card (**Job file**, at the width it is placed). It is a zip:

| Technique | What is inside |
| --- | --- |
| Every job | `artwork-300dpi.png`; one `ink-NN-<pantone>.png` (the colour on a clear ground) and `film-NN-<pantone>.png` (black-on-white film positive) per colour; `job-sheet.pdf` (one page: size in inches and mm, colours as Pantone C with coverage, settings, warnings); `job.json`; `README.txt` |
| Screen print | `underbase.png` when the garment is dark (white under every light colour, choked); mesh count, lpi, angle and dot shape, ink type, flash and cure, from the technique (plastisol, water-based, discharge, halftone, puff, foil, flock, rubber, vintage) |
| Embroidery | the threads to match (Pantone), the stitch (satin, tatami fill, chain, satin over foam), backing, underlay, pull compensation, the smallest satin column, and an estimated stitch count from the technique's density and the area covered |
| Heat transfer | `artwork-mirrored-300dpi.png` for the carrier, finish, carrier, press settings |
| Patches | `cut-line.png` (the shape grown by 2 mm), edge finish (merrowed or laser-cut), base and backing |

The summary (colours, screens or stitches, warnings) shows in the library before anything is downloaded, and changes with the technique, width and garment colour. Warnings come from the technique's rules: a source too small for the width, more colours than it is priced for, a size over its limit, too many stitches for a knit.

Parts from the sketch pack (pockets, zips, collars, trims, buttons) go the same way: onto the flats (Design → Parts) and onto a concept or a graphic in the studio (Add → From the sketch pack).

## Every button answers

Every page loads `/feedback.js`.

- **Working:** a button that starts something keeps its words; a light sheen sweeps across it and a thin green line creeps along its bottom edge while it runs.
- **Worked:** the line runs home and the button glows green for a moment; a note rises at the bottom of the screen ("Save: done"), with a hairline that drains while it stays.
- **Failed:** the line turns red and the button shakes, with a note that says what failed and why, in the service's own words: "Approve: Say what to change", "Send: you are signed out: sign in again", or "could not reach the service".
- **Failed without saying so:** a press whose work fails and nothing else reports it is reported the same way.

**Hooks for page code:**
- `FBN.toast(text, kind)` adds a note.
- `FBN.run(button, work)` shows the same states for work that is not a request.
- `data-fb="off"` on a button leaves it alone.

## Pip, the guide

| Guide | Where | What it walks through |
| --- | --- | --- |
| Plan a line and make concepts | `/lab` | the Lab's sections, a new plan, who it is for, making concepts, the board |
| Take a concept to a tech pack | `/lab`, a concept open | the check, the studio, the flats, approve, send to tech pack |
| Finish a concept in Design | `/lab/studio`, the picture | the view switch, layers, AI changes, use as the concept picture |
| Draw and change the flats | `/lab/studio`, a flat view | front, back or side by side, the flats and their panel, one Save, the sheets and the tech pack |
| Publish, send to a factory, review samples | a tech pack, work console | where it came from, publish, assign a factory, samples, review a sample |
| Review your line | the client's hub | the line, flats, approve, ask for changes |

Each guide offers the next one when it ends. The client's own guides for tech packs (check your draft, approve, quote and deposit, messages) carry on from **Review your line**.

## Tests

| Journey | Covers |
| --- | --- |
| J214, J215 | Flats over HTTP and in a browser: the sketches; the Design tab (colour, details, stitch lines, AI redraws); the spec sheet; and the hand-off to the tech pack (measurements, sketches, construction, notes; sending again never doubles) |
| J216 | The design service: a client's line, shared, with verdicts, replies, privacy, and the tech pack in the client's room. Includes the hub in a browser |
| J217 | The whole loop over HTTP: concept → tech pack → publish → factory → sample sent → review → version 2 → the factory sees the corrections and the next sample |
| J218 | The factory views and writes in Messages: no buttons (acknowledge, quote, countersign, sample sent all refused), the team records the shipped sample, the corrections go out as v2 while v1 is kept exactly, flats sent unchanged make no version, flats changed go out as v3. Includes the factory page in a browser |
| J235 | Design, one placement model and two levels: a size set on the flats comes back to the picture; taken off the flats it stays on the picture only; the On the garment list; Simple and Pro on both sides; the checklist over HTTP and in the header; a client starts on Simple |
| J234 | One Design workspace: a concept opens on its picture; Flat front, Flat back and Side by side on the same page; a graphic placed on the picture is on the flats when they are shown; one Save keeps the flats and the picture; the old flats address lands here; a phone fits |
| J233 | A room's team and its libraries: a teammate added from the hub signs in with a code and works on the same plans, graphics, materials and techniques; a room sees only its own work plus the read-only starter materials and techniques, never Future Basics' or another room's; staff see everything, each room's marked; a starter technique copied and changed; a teammate taken off loses their session and sign-in at once, and can be added again; the hub's Team section and the room-only library in a browser |
| J232 | The self-serve Design Lab: a client room locked out until the Lab is opened on it; their plans, concepts and graphics theirs alone while staff see everything; generations metered, invoiced, capped and unblocked when paid; tech packs covered; the make request on Production attention and answered; the factory quotation link; the hub card, the Lab and the Make it tab in a browser |
| J231 | From the studio to the factory: a studio layer on the flats at its size (resized, removed, on new flats), artwork by garment size, inks per colourway, an all-over repeat made in the library and priced on the flats, the decoration sheet and tech pack carrying them, factory quotes moving the costs, vector and .dst files; the flats, library and studio pages in a browser |
| J230 | Decoration to the factory: each flats placement priced into the landed cost and the tech pack BOM, the decoration sheet PDF, the studio size check and separations, the ruler, warp and tone on tone in a browser, one library graphic previewed and put across the range |
| J229 | Made as: 44 ways to make a graphic across six kinds, picked in the studio from live previews on the layer or from the every-way wall on cloth, by name too; the library page shows them all |
| J228 | The smaller items: our own fonts (uploaded, served, set in type, listed in the library), the Illustrator round-trip (the studio SVG back as editable layers; a foreign SVG as picture layers), the 3D try-on (from the concept picture and from the canvas, the GLB shown painted in our viewer) |
| J227 | Every tool in the studio works, clicked one by one in a browser: the rail and zoom, every Add, every Layers control, every AI control (Change it, Make it, Remove the graphic, the fabric), undo, redo, save, export, versions, use as the picture; Remove the graphic takes a printed graphic off the piece in one go |
| J226 | Range-level work: one instruction across the collection previewed per piece and applied only where ticked; the Lab learning our taste from what is approved and rejected and reading it before it designs; a lookbook in one click; a customer poll whose votes become a demand read per piece. Over HTTP and in a browser, on the plan and on a phone |
| J225 | Finding your way round: one navigation on every Lab page (Make, Libraries, Research, the flow), concept pickers for the studio and the flats, the sketch pack page (search, ranges, styles, parts) putting a sketch on a concept, the assistant leaving Lab rows alone |
| J224 | The sample loop: the time-and-action calendar dated from the day the pack goes out, late samples on Production attention; photographs on the review compared with the approved design by the vision model, the differences made corrections. Over HTTP and in a browser |
| J223 | Reviewing together: pinned comments, done and reopened; studio versions kept on use and on purpose, two side by side with a wipe, an old one's layers reopened; a view-only link for the factory and the client: opens without sign-in, takes a pinned comment, cannot change anything, stops when turned off. Over HTTP and in a browser |
| J222 | Materials, trims and tags: the library and its tags drawn to size; picks on a concept with the cost breakdown and margin; colourways with Pantones on the board; the BOM, labels and colourways on the tech pack; the studio's fabric picker. Over HTTP and in a browser |
| J221 | The job file: a library graphic made as plastisol (inks, films, underbase, halftone, mesh), as embroidery (threads, stitch, backing, stitch count), as a patch (cut line, edge) and as a transfer (mirrored); the zip and its contents; the summary and download in a browser from the library and from the tech pack's artwork card |
| J220 | Graphics anywhere: a graphic built in the library's studio (AI drawing, a sketch-pack part as a layer), kept with its layers, reworked and updated; a part from the pack on a concept in the studio; a library graphic onto any product's tech pack as artwork placed on the front, over HTTP and in a browser |
| J219 | Every press answers: working, then a tick and a note, or a red mark and a note saying what failed; an uncaught failure is reported too |
| J102 | Samples on the factory link, including marking one sent with its tracking (with factory buttons on) |
| J162 | Pip on the hub and Home. Every guide has a title, a "do" and a "why" on each step, and valid selectors |

**Unit tests:**
- `test/lab-flats.test.js`: every sketch in the pack (its file, thumbnail and views), the new styles, the sketch's own proportions, the add-on parts, and the edits;
- `test/lab-handoff.test.js`: what the flats give the pack;
- `test/lab-share.test.js`: pins and the link token;
- `test/lab-keep.test.js`: the assistant leaves the Lab's rows exactly as set;
- `test/lab-tryon.test.js`: the textured GLB built and read back (transforms, strides, flat normals), the stand-in 3D service, font files by their first bytes;
- `test/lab-range.test.js`: the taste counts and words, the range change per piece and its cleaning, the poll votes and the demand read, the lookbook PDF;
- `test/sample-loop.test.js`: the calendar, the comparison's shape and fixture, the written design the model reads, what the pack keeps;
- `test/lab-materials.test.js`: the starting set, cleaning, the tag drawing, the costing, and what the pack takes;
- `test/lab-decor.test.js`: placement words and sizes, the size findings, the decoration cost by technique (screens, stitches, area, its own numbers) and how it counts in the landed cost, artwork by garment size, inks per colourway, the quote calibration, and what the flats keep;
- `test/lab-vector.test.js`: the vector trace, the stitch plan and the .dst file read back, and the repeats;
- `test/room-team.test.js`: the team list (owner first, invited addresses, removed people and staff left out) and the gate's rules (a room reaches only its own rows, plus the starter set to read);
- `test/lab-access.test.js`: the Lab's pricing from the environment, the meter (included, over, billed, paid, the cap), the gate (staff, a locked room, the staff-only parts, a row that is not theirs), and the payment sync reading the Lab's orders;
- `test/lab-jobfile.test.js`: the job file per technique (separations, underbase, films, settings, stitch count, cut line, the zip);
- `test/sample-review.test.js`: reviews and the next version.

## Not built yet

- **A sample's photos are not attached to its review.** They live in the product's files and messages.
- **Saving flats after a concept is approved does not send it back to draft.** The approval and its reasons stand.

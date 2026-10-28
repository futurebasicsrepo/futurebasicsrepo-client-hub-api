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
 ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────┐  send   ┌──────────────┐  publish  ┌──────────────────┐
 │Line plan │ → │ Concepts │ → │  Studio  │ → │ Flats  │ ──────→ │  Tech pack   │ ────────→ │ reads vN in its  │
 │ pieces,  │   │ drawn,   │   │ finish by│   │ 382    │         │ measurements,│    v1     │ language, writes │
 │ prices,  │   │ checked, │   │ hand and │   │sketches│         │ sketches,    │           │ to us in Messages│
 │ margins  │   │ approved │   │ AI       │   │ + parts│         │ BOM, colour  │           └────────┬─────────┘
 └──────────┘   └────▲─────┘   └──────────┘   └───┬────┘         └──────▲───────┘                    │ "the proto shipped"
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

**Who:** the design team, from **Open in the studio** on a concept.

**What it does:** the concept's picture opens as layers. You can:
- paint, type, and add marks and library graphics;
- add **parts from the sketch pack** (Add → From the sketch pack): pockets, zips, collars, trims and buttons drawn in flat-sketch lines, as a layer you place and size, then blend in with “Change it with AI”;
- recolour and distress;
- have the image model redraw the whole piece or a painted area.

**Use as the concept picture** makes the finished picture the concept's. **Restore** puts back the picture the concept had before.

- choose **the fabric** from the materials library (AI tab): the concept is made of it, and the image model can redraw the piece in that cloth.

**Carries forward:** the finished picture. It becomes the tech pack's first sketch.

## 4. Flats and placement

**Who:** the design team, from **Flats and placement** on a concept (`/lab/flats?concept=`).

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

**Carries forward, through Send to tech pack:**
- the graded points of measure and the size run;
- the front and back flats, as the pack's sketches and as files;
- every placement, detail and stitch, as construction lines;
- decorations, contrast threads and colour blocks, as BOM lines;
- the main colour, as the first colourway;
- the target retail price;
- a note with the target landed cost, the quantity and the line plan.

**Send to the tech pack** on the flats page sends them again after a change. It replaces what came from the flats last time and never doubles a file. Once the pack has been published, flats sent again go out as the **next version** (v2, v3…): the version before stays exactly as it was. Sent again with nothing changed, they make no new version.

## 5. Tech pack

**Who:** the team, in the work console (`/tech-packs/:id`). For a client's line, the client also sees it in their hub.

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
| Finish a concept in the studio | `/lab/studio` | layers, AI changes, use as the concept picture |
| Draw and change the flats | `/lab/flats` | the drawing, Garment, Design (details, AI redraw), save, send on |
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
| J222 | Materials, trims and tags: the library and its tags drawn to size; picks on a concept with the cost breakdown and margin; colourways with Pantones on the board; the BOM, labels and colourways on the tech pack; the studio's fabric picker. Over HTTP and in a browser |
| J221 | The job file: a library graphic made as plastisol (inks, films, underbase, halftone, mesh), as embroidery (threads, stitch, backing, stitch count), as a patch (cut line, edge) and as a transfer (mirrored); the zip and its contents; the summary and download in a browser from the library and from the tech pack's artwork card |
| J220 | Graphics anywhere: a graphic built in the library's studio (AI drawing, a sketch-pack part as a layer), kept with its layers, reworked and updated; a part from the pack on a concept in the studio; a library graphic onto any product's tech pack as artwork placed on the front, over HTTP and in a browser |
| J219 | Every press answers: working, then a tick and a note, or a red mark and a note saying what failed; an uncaught failure is reported too |
| J102 | Samples on the factory link, including marking one sent with its tracking (with factory buttons on) |
| J162 | Pip on the hub and Home. Every guide has a title, a "do" and a "why" on each step, and valid selectors |

**Unit tests:**
- `test/lab-flats.test.js`: every sketch in the pack (its file, thumbnail and views), the new styles, the sketch's own proportions, the add-on parts, and the edits;
- `test/lab-handoff.test.js`: what the flats give the pack;
- `test/lab-materials.test.js`: the starting set, cleaning, the tag drawing, the costing, and what the pack takes;
- `test/lab-jobfile.test.js`: the job file per technique (separations, underbase, films, settings, stitch count, cut line, the zip);
- `test/sample-review.test.js`: reviews and the next version.

## Not built yet

- **Studio layers and AI art do not reach the concept's graphics list.** Only the finished picture does, so a graphic added in the studio is not placed on the flats by itself.
- **A self-serve Design Lab for clients.** The service runs the Lab for them; the data is per line plan and per client, ready for it.
- **A sample's photos are not attached to its review.** They live in the product's files and messages.
- **Saving flats after a concept is approved does not send it back to draft.** The approval and its reasons stand.

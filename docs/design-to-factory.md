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
 Design Lab (work console, /lab)                                   Tech pack (/tech-packs/:id)                  Factory (/tp/:token)
 ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   send   ┌──────────────┐  publish  ┌──────────────┐  acknowledge, quote,
 │Line plan │ → │ Concepts │ → │  Studio  │ → │  Flats   │ ───────→ │  Tech pack   │ ────────→ │   Factory    │  countersign
 │ pieces,  │   │ drawn,   │   │ finish   │   │ measured,│          │ measurements,│  vN       │ reads vN in  │
 │ prices,  │   │ checked, │   │ by hand  │   │ placed,  │          │ sketches,    │           │ its language │
 │ margins  │   │ approved │   │ and AI   │   │ edited   │          │ BOM, colour  │           └──────┬───────┘
 └──────────┘   └──────────┘   └──────────┘   └──────────┘          └──────▲───────┘                  │ marks the sample sent
       │              ▲  client approves in their hub (design service)     │ next version: accepted        ▼ (with tracking)
       │              └─────────────────────────────────                  │ measurements, corrections,  ┌──────────────┐
       └── a client's line is designed in their brand                     └──── next sample asked for ── │Sample review │
                                                                                                          │ measured vs  │
                                                                                                          │ spec, verdict│
                                                                                                          └──────────────┘
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

## 3. Studio

**Who:** the design team, from **Open in the studio** on a concept.

**What it does:** the concept's picture opens as layers. You can:
- paint, type, and add marks and library graphics;
- recolour and distress;
- have the image model redraw the whole piece or a painted area.

**Use as the concept picture** makes the finished picture the concept's. **Restore** puts back the picture the concept had before.

**Carries forward:** the finished picture. It becomes the tech pack's first sketch.

## 4. Flats and placement

**Who:** the design team, from **Flats and placement** on a concept (`/lab/flats?concept=`).

**What it shows:** the piece drawn from a professional flat sketch, front and back, scaled to its measurements. The sketches come from the flat-sketch pack: 30 sketches across tees, long sleeves, crews, hoodies, zips, jackets, pants (pleated trousers included), shorts and the cap.

**Tabs:**
- **Placements:** every logo and graphic, placed in inches from the HPS and the centre front, with its technique.
- **Design:** change the drawing itself.
  - **Colour:** a garment colour, and colour blocks for contrast panels.
  - **Details:** pockets (patch, flap, welt, cargo, kangaroo, slant, jean, zip), pleats, drawcords, zips, button plackets, and a cover-up to hide something on the sketch.
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

**Send to the tech pack** on the flats page sends them again after a change. It replaces what came from the flats last time and never doubles a file.

## 5. Tech pack

**Who:** the team, in the work console (`/tech-packs/:id`). For a client's line, the client also sees it in their hub.

**How it starts:** **Send to tech pack** on an approved concept makes the product and its tech pack:
- in the Future Basics room for our own line;
- in the client's own room for a client's line, under their brand and without our logo or label files.

The assistant drafts what the concept did not give, such as materials, care and labels. Anything already in the pack from the flats, or typed by anyone, is kept.

**Getting around:** the breadcrumb leads back to the concept and its flats (**From the Design Lab: concept · flats**).

**Publish** makes a numbered version. A client approves it in their hub by signing with their full name. Each later version says what changed.

## 6. Factory

**Who:**
- The team assigns the factory.
- The factory works on its own private link, in its language. It needs no account.

**Assign:** on the published pack, choose the factory and send it for a quote or to make.

**On its link, the factory:**
- acknowledges each callout;
- asks questions on a callout;
- sends a quote;
- countersigns to lock the version for production;
- marks a sample sent, with its tracking.

A factory asked to quote again sees what changed in each version too.

**Covering for a factory:** Future Basics can act for a factory that does not use its link. It can record a quote, acknowledge, or countersign, each marked as done for the factory.

## 7. Samples and corrections

**Who:** the team, on the pack's Samples block. The factory sees the samples on its link.

**Plan them:**
1. **Add the usual stages:** proto, fit, pre-production and top of production.
2. Set the quantity and due date.

The factory sees what is due and presses **Mark this sample sent**. The team is emailed, and the sample shows **Sent · tracking …**.

**Review a sample when it arrives:**
1. Press **Review this sample** and type what you measured off it for each point of measure.
2. The table shows how far off each point is and marks anything out of tolerance ⚠.
3. Tick **Make it the spec** to accept a measurement. The size run moves with it.
4. Add corrections (where, and what to change).
5. Choose **Approve this sample** or **Needs corrections**.
6. Press **Make the next version from this review**.

**What that press writes into the pack:**
- the accepted measurements, as the new spec;
- every correction, as a construction line (`Correction · Proto sample: …`);
- every measurement still out and not accepted, as a correction;
- the sample's status set to approved or revise;
- the next sample asked for, or a "(corrected)" one added.

## 8. Back to the factory

**Publish** the corrected pack. On its link the factory:
- reads the new version;
- sees **What changed in vN**: the measurements, the corrections and the samples;
- keeps its acknowledgements for callouts that did not change;
- is asked for the next sample.

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
| J102 | Samples on the factory link, including marking one sent with its tracking |
| J162 | Pip on the hub and Home. Every guide has a title, a "do" and a "why" on each step, and valid selectors |

**Unit tests:**
- `test/lab-flats.test.js`: sketches and edits;
- `test/lab-handoff.test.js`: what the flats give the pack;
- `test/sample-review.test.js`: reviews and the next version.

## Not built yet

- **Studio layers and AI art do not reach the concept's graphics list.** Only the finished picture does, so a graphic added in the studio is not placed on the flats by itself.
- **A self-serve Design Lab for clients.** The service runs the Lab for them; the data is per line plan and per client, ready for it.
- **A sample's photos are not attached to its review.** They live in the product's files and messages.
- **Saving flats after a concept is approved does not send it back to draft.** The approval and its reasons stand.

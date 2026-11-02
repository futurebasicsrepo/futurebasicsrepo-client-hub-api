# Make page (thefuturebasics.com/pages/make)

The Make page lives in the live Shopify theme. The files here are what goes into it.

| File here | Goes to |
| --- | --- |
| `sections-make-v4.liquid` | `sections/make-v4.liquid` (new) |
| `templates-page.make.json` | `templates/page.make.json` |
| `sections-make-v3.liquid` | `sections/make-v3.liquid`: the previous version, kept for rolling back |

The `systems` section (`sections/make-systems.liquid`) is unchanged and stays between the two halves.

## v4: the Design Lab leads, production follows (November 2026)

The page leads with the tools and what they lead to, and ends with Future Basics making what you design. The full-service packages are gone.

- **Hero:** "design it yourself. we make it properly." The main button opens the Design Lab (`hub.thefuturebasics.com/join?for=lab`); the free tech pack is second. The phone shows the recipe menu.
- **01 · the design lab: six ways in, one tech pack out.** A card with a real screen for each way: describe it (AI), the recipe menu, a sketch, from scratch, a whole line, a photo. A strip shows where every way leads: studio → flats, pattern or 3D parts → tech pack → factory sign-off → made by Future Basics.
- **Every product type:** apparel, headwear, bags, footwear, plush, and toys, objects and electronics, each with a real screen from its own tools, plus a tile for home and accessories.
- **02 · the tech pack:**
  - the spec sheet, the checklist and factory sign-off
  - the tools by subscription: Design Lab $499 for 90 days, membership $100 a month, $48 a pack, first pack free
  - a comparison table
- **03 · made by future basics:** the figures, minimums and lead times per category, and "how it gets made" (design in the lab → tech pack → sample → produce → deliver).
- **Questions:** Design Lab questions first. Package and store questions are gone or rewritten; "what does production cost?" replaces "what does it actually cost?".

The screenshots are real screens from the live Lab, taken signed in to the Future Basics room with made-up demo pieces (deleted afterwards). They are served by the hub: `src/help-assets/make-*.webp`, at `https://hub.thefuturebasics.com/help/assets/<file>`. The line plan uses `lab-plan.jpg` and the factory callouts use `05-callouts.jpg`, both real screens already in the help guide.

Numbers on the page (26 bases, 31 add-ons, 382 sketches, prices) are the same as `docs/marketing/video-brief.md`. Update both when they change.

## To publish (safer way)

1. Shopify admin → Online Store → Themes → the live theme → ⋯ → Duplicate.
2. On the copy: ⋯ → Edit code. Add `sections/make-v4.liquid` and replace `templates/page.make.json` with the files here.
3. Preview `/pages/make` on the copy (desktop and phone), then publish the copy.

A later save from the theme editor can overwrite `page.make.json`; edit the page's text in the theme editor afterwards rather than in the file.

## Roll back

Point `templates/page.make.json` back at `make-v3` (both `make` and `make_end` sections). `make-v3.liquid` is left in the theme untouched.

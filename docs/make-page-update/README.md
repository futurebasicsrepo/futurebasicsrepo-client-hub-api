# Make page (thefuturebasics.com/pages/make)

The Make page lives in the live Shopify theme. The files here are what goes into it.

| File here | Goes to |
| --- | --- |
| `sections-make-v4.liquid` | `sections/make-v4.liquid` (new) |
| `templates-page.make.json` | `templates/page.make.json` |
| `sections-make-v3.liquid` | `sections/make-v3.liquid`: the previous version, kept for rolling back |

The `systems` section (`sections/make-systems.liquid`) is unchanged and stays between the two halves.

## v4: the Design Lab leads (November 2026)

The page now leads with the tools, and the made-with-us service follows.

- **Hero:** "design it yourself. we make it properly." The main button opens the Design Lab (`hub.thefuturebasics.com/join?for=lab`). The free tech pack is the second button. The phone shows the recipe menu.
- **01 · design lab:**
  - the recipe menu
  - real flats and the sketch pack
  - the Studio
  - the tech pack and factory sign-off
  - a "beyond clothing" band: footwear, plush, patterns, hard goods and electronics, line plans, review, the production package
- **Pricing:** four cards (first pack free, $48, $100 a month, the Design Lab at $499 for 90 days) and a comparison table.
- **02 · made with us:** the earlier "what we've made" half, unchanged blocks (figures, what we make, how a full build runs, packages).
- **Questions:** four new ones on the Design Lab come first. The close is "open the design lab." and "build the whole thing."

The Design Lab screenshots are taken from the live Lab and served by the hub: `src/help-assets/make-recipe.webp`, `make-sketch-sheet.webp`, `make-studio.webp`, `make-sketches.webp` and `make-phone-recipe.webp`, at `https://hub.thefuturebasics.com/help/assets/<file>`. They show only made-up demo pieces. The three phone pictures and the callouts picture are the theme's existing files.

Numbers on the page (26 bases, 31 add-ons, 8 colour systems, 382 sketches, 203 parts, prices) are the same as `docs/marketing/video-brief.md`. Update both when they change.

## To publish (safer way)

1. Shopify admin → Online Store → Themes → the live theme → ⋯ → Duplicate.
2. On the copy: ⋯ → Edit code. Add `sections/make-v4.liquid` and replace `templates/page.make.json` with the files here.
3. Preview `/pages/make` on the copy (desktop and phone), then publish the copy.

A later save from the theme editor can overwrite `page.make.json`; edit the page's text in the theme editor afterwards rather than in the file.

## Roll back

Point `templates/page.make.json` back at `make-v3` (both `make` and `make_end` sections). `make-v3.liquid` is left in the theme untouched.

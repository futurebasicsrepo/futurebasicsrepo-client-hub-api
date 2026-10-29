# Make page · the Design Lab section

`sections/make-lab.liquid` adds the Design Lab to the Make page of thefuturebasics.com (theme: "Future Basics — Storefront", Ritual 3.2.0).
It is self-contained: its own styles (every class starts `.fbl`), no scripts, and it uses the page's own fonts and colours.

## Positioning

- **What it is:** a design-to-factory lab for real product, built and used by a production studio. Plan a line, draw on a real flat with an
  Apple Pencil, dress it in real fabric, and get out the files a factory and a decorator work from.
- **Who it is for:** independent designers, small brands, product developers and technical designers. It is for anyone who would otherwise
  pay $300–800 a pack in Illustrator, spreadsheets and freelancers, or who can't justify $10,000+ a year for enterprise PLM.
- **The promise:** "design it here. hand the factory a file it can make."
- **Beyond apparel, said truthfully:** after the six steps, a "not only apparel" band splits the Lab into three parts:
  - **Design it in the Lab:** apparel and headwear (the sketch pack has the six-panel cap and the bucket hat).
  - **Decorate anything:** separations, films, embroidery stitch files, patches, woven labels and hang tags, for any product.
  - **Spec it in the tech pack:** plush, bags and jewelry, toys and objects, footwear and electronics, with each one's minimum and lead time.
    Footwear and electronics are development programmes, so they point to "start a project".
  The Lab doesn't draw plush patterns, shoe lasts, hard-goods tooling or electronics, so the page doesn't claim it does.
- **Where it sits:** the Make page climbs a ladder: 01 · experience (what we make) → 02 · platform (a free tech pack) → **03 · design lab** (the
  whole design tool, $499 for 90 days) → 04 · systems (software). The section ends on "we make it", which leads the Lab back into production work.

## Install

1. Online Store → Themes → … → **Duplicate** the live theme, and work on the copy.
2. On the copy: … → **Edit code** → Sections → **Add a new section** → `make-lab` → paste `make-lab.liquid` → Save.
3. **Customize** → Pages → `make` → **Add section** → "Make · Design Lab". Drag it **below the main Make section** (the one with the hero,
   01 · experience and 02 · platform) and **above** the systems section.
4. In the systems section, change its label from `03 · systems` to `04 · systems`.
5. Preview it on a phone and on desktop, then **Publish** the copy.

Everything in the section can be edited in Customize: the eyebrow, the two title lines, the lede, the button, the small print, the price, the
days, the AI allowance and its price, the "start a project" link (default `/pages/contact`) and the hub address.

The screenshots are served by the hub at `https://hub.thefuturebasics.com/help/assets/lab-*.jpg` (from `src/help-assets/`). Replace those files
to update the pictures; the theme doesn't need to change.

The buttons open `hub.thefuturebasics.com/join?for=lab&utm_campaign=make_lab`. This creates the visitor's room and lands them on the Design
Lab in their hub, with the checkout. The UTM tags go into the room's attribution.

## Suggested hero copy

The hero currently reads "real product, made properly. now with your own tools." To lead with the Lab:

- Headline: **design it here. we'll make it.**
- Primary button: **open the design lab** → `https://hub.thefuturebasics.com/join?for=lab&utm_source=thefuturebasics&utm_medium=site&utm_campaign=make_hero`
- Secondary button: **start a project** → `/pages/contact`

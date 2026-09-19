# Common Ground redesign — design brief

## The store today
Common Ground (134 S 11th St, Center City Philadelphia) is a consignment shop for collectible sneakers, streetwear,
vintage and designer pieces. Current site is a stock Shopify theme: generic type, weak hierarchy, filters buried
and unreliable, no clear "Shop all" entry point, no personality despite a brand with a lot of it.

## North star
"The block party version of a sneaker store." Nostalgic (Saturday-morning-TV, Windows 98, Y2K rave flyers, sticker
bombed skate decks) but built like a modern conversion-first store. Every screen should be fun to scroll and
instantly scannable.

## Principles
1. **One click to the whole inventory.** "Shop all" lives in the nav, the hero, the mega menu, the mobile drawer,
   the empty cart and the 404. Every collection is "Shop all X" and carries the full filter stack.
2. **Filters are the product.** Brand / Type / Size / Price / In-stock are always visible on desktop and one tap
   away on mobile. Size is a grid of tappable chips. Results update without a page load, and the URL stays
   shareable.
3. **Motion with intent.** Motion signals interactivity (tilt, hover swap, glitch), rewards scrolling (reveal,
   parallax, marquees) and confirms actions (cart-count bump, "Added ✓"). Nothing loops on the product grid;
   nothing blocks reading. Reduced-motion users get the calm version automatically.
4. **Consignment cues.** "Only one — it's consignment" on single-unit items; sold-out stays visible (struck
   through) so the catalogue feels alive; NEW stickers for the last 14 days.

## Visual language
- **Paper + ink + hot accents.** Cream paper with dot-grid, 3px black borders, hard offset shadows (no blur).
- **Stickers** — hand-cut star badges, slightly rotated, used for NEW / SALE / SOLD OUT and hero call-outs.
- **Chrome** — Win98 bevel buttons for utility actions (filter toggle, secondary CTAs).
- **Marquees** — huge outlined brand ticker between hero and tiles; announcement ticker above the header.
- **CRT** — faint scanline overlay across the whole page, toggleable.
- **Type** — Archivo Black display in all caps with a hot-pink offset shadow; Space Grotesk body; VT323 pixel
  type for kickers, counts and breadcrumbs.

## Page map
Home → Shop all → Collection (Shop all X) → Product → Cart drawer → Checkout
Search (with facets) · Collections index · Pages (Sell / About / Contact) · Blog · Account.

## Hero
Full-bleed storefront photo from the current site (the client's own asset — drop it into *Hero → Image*),
darkened 35%, with the wordmark rising word-by-word, a rotating "EST. 2012" sticker and two CTAs:
**Shop all** (primary) and **New arrivals**.

## Open items for the client
- Supply the landing-page photo and a logo file (or keep the wordmark).
- Confirm collection names / order for the mega menu.
- Confirm which product attributes are consistently filled (Vendor, Type, Size) so filters are populated.
- Decide on shipping threshold copy for the announcement ticker.

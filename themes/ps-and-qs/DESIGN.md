# Ps & Qs redesign: design brief

## The shop
Ps & Qs has been at 820 South Street, Philadelphia, since 2012. It is family-owned by brothers Ky and Rick Cao
and their friend Jackson Fu, who first ran Abakus Takeout in Chinatown (2008–2013). The shop carries
hand-picked streetwear and workwear (Carhartt WIP, Stüssy, New Balance, Pendleton, Universal Works, Norse
Projects, Paratodo, Students, thisisneverthat) plus its own Philly-made Ps & Qs label. The name comes from the Philly saying
*"get your Ps and Qs in order."* Its strength is community. Collaborators include Tretorn × Publish (2015),
anniversary capsules with fellow shops Ubiq and Lapstone & Hammer (2019), the *Fight The Virus Not The People* tee
for the Philadelphia Suns (2020), the Philadelphia Union's *Year of the Snake* capsule (2025), Pat's King of Steaks
and Hat Club.

## What's wrong today
- A stock theme with no point of view, for a brand that has one
- The same meta description on the homepage, FAQ and every collection
- Thin auto-generated URLs indexed (`/collections/vendors?q=…`, tag-filtered collections)
- Three spellings of the house brand (P's & Q's / Ps & Qs / Ps&Qs), which splits the brand filter and confuses search
- The store (hours, pickup, address) is barely present online, and there's no structured data for the shop as a place
- No way to shop by size, even though size is the first filter every apparel customer applies

## North star: "Mind your p's & q's"
Printers set metal type backwards, and a lowercase **p** is a **q** turned around. Typesetters told apprentices to
*mind their p's and q's*. That's the whole design system: a print shop on South Street. The paper is paper, the
ink is ink, and every piece of motion is something a press or a piece of type would do.

## Visual language
| Element | Treatment |
| --- | --- |
| Palette | Paper `#F2EDE3`, ink `#141210`, press red `#D2261C`, jade `#0F6B5A` (second ink and "fits you"), gold leaf `#E7B23A`. Red nods to the Union capsule and Chinatown; jade to the Chinatown roots. |
| Type | **Fraunces** (variable: SOFT and WONK axes) for display, a warm old-style face at heavy weights. **Inter Tight** for UI and body. **DM Mono** for the typesetter's marks (kickers, sizes, counts). All self-hosted on Shopify's CDN. |
| Rules | 1px ink rules, hard 3px offset shadows on buttons that "press" when clicked. No blur shadows. |
| Stamps | Rubber-stamp labels (New, Sale, Sold out, Collab, Made in Philly), slightly rotated. |
| Texture | Fine paper grain over the page (toggle). |

## Motion system (every effect obeys Theme settings → Motion and `prefers-reduced-motion`)
1. **The Mirror (hero).** Two giant glyphs, **p & q**, are windows onto photography (background-clip text). On
   scroll they turn in 3D, so the p becomes a q and the q becomes a p, while the ampersand spins. The pointer drifts
   the photos inside the letterforms. The headline *sets* word by word like a composing stick.
2. **Off-register headings.** Section titles print with a red and a jade pass slightly out of line, then snap into
   register as they reach the middle of the screen. Hover knocks them out again.
3. **Press-roll reveals.** Product images ink in top-down, like a sheet under the roller. Hover rolls the second
   image down over the first.
4. **The type case.** Collections sit in a printer's California job case. Each compartment holds a cast metal
   sort showing its letter *mirrored*. Hover (or scroll it to the middle of the screen on phones) and the sort lifts,
   flips to read correctly, and the collection photo inks in.
5. **Composing stick.** The brand marquee runs forward as you scroll down and reverses when you scroll up.
6. **Proof sheet.** The community timeline (The Block) is a contact sheet you drag through: grayscale frames that
   develop into colour on hover, with outlined year numbers.
7. **Type-sort cursor.** A small red mirrored *q* follows the pointer and prints as a readable *p* over anything
   clickable (desktop only).
8. **Scrubbed glyphs.** The collection banner's letter and the giant footer *p q* mirror as they cross the viewport.
9. Page transitions use the cross-document View Transitions API where the browser supports it.

## Getting the right product to the right person
- **Fit profile ("My sizes").** Tops, waist and shoe sizes are saved once, in the browser only. Afterwards:
  - collections gain an **In my size** switch that applies Shopify's native Size filter
  - cards flag **In your size** and highlight the matching size chips
  - product pages pre-select the shopper's size
  - the homepage **In your size** rail shows only what fits
- **One-tap add.** On cards, the in-stock sizes *are* the add-to-bag buttons, so adding takes no trip to the product page.
- **Shop by intent.** Entry points for how people actually shop ("A gift under $75", "Made in Philly",
  "Pants that fit"), not only by category.
- **Predictive search** returns products, collections and query suggestions as you type. Press `/` anywhere to search.
- **Recommendations.** *Complete the fit* (complementary, set in Search & Discovery) and *You might also like*
  (related), lazy-loaded.
- **Recently viewed** follows the shopper across the homepage, collections and products.
- **Local.** The shop shows live open/closed status, one-tap directions and call, pickup availability per size on
  every product, and a free-shipping meter in the bag.

## Page map
Home → Shop (mega menu: types, brands, featured drop) → Collection (banner, facets, In my size) → Product
(gallery, sizes, pickup, story, fit, complete the fit) → Bag drawer → Checkout.
About (story, The Block, visit, FAQ) · FAQ · Journal · Search · Account · `/pages/llms` for AI assistants.

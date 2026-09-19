# Common Ground — Rewind

A from-scratch Shopify Online Store 2.0 theme for the [commonground12.com](https://commonground12.com) redesign.
Philly sneaker & streetwear consignment, dressed in '90s / early-2000s nostalgia, with motion baked in and
filters that actually work.

## What's in the box

| Area | What you get |
| --- | --- |
| **Navigation** | Sticky header. **Shop all** is always the first nav item and opens a mega menu listing every collection with live product counts, plus "New arrivals" and "In stock now" shortcuts. Mobile gets a slide-in drawer with the same structure. |
| **Shop all** | `/collections/all` uses the same collection template as every other collection, so it gets the full filter set. Every collection page is titled "Shop all {Collection}" and shows quick-jump chips to sibling collections. |
| **Filters** | Native Shopify storefront filtering (`collection.filters` / `search.filters`) rendered as a sidebar on desktop and a drawer on mobile. Brand, Type, Size (rendered as a size grid), Price, Availability, Color, Tags. Changes are applied over AJAX via the Section Rendering API with URL sync, active-filter chips, result counts and "Clear all". |
| **Search** | Full search page with the same facets, plus idle-state collection chips. |
| **Product** | Sticky gallery with thumbs, click-to-zoom and arrow-key navigation, sold-out swatches struck through, variant-aware price/SKU/media, AJAX add-to-bag, "Only one — it's consignment" nudge for single-unit stock, accordions, related products. |
| **Cart** | Slide-out drawer with quantity steppers and remove, re-rendered from the server after every change. Full cart page as a fallback. |
| **Home** | Hero on the storefront photo with word-by-word rise-in, glitch-on-hover heading, REC timecode, rotating sticker and parallax; brand marquee; milk-crate collection tiles (auto-populates from every non-empty collection); "Just walked in" and "Grails" product rails; image-with-text; newsletter. |
| **Motion** | Reveal-on-scroll, 3D card tilt, sticker cursor trail, glitch text, marquees, film-grain + CRT scanline overlay, VCR on-screen display (blinking REC timecode on the hero, "▶ PLAY" on product hover, "NO SIGNAL" static on sold-out), cross-document View Transitions, cart-count bump. Theme setting `Motion level` (Full / Medium / Off) and every effect obeys `prefers-reduced-motion`. |
| **Everything else** | Blog, article, pages, contact form, 404, password page, gift card, and all customer account templates. |

## Design system

Derived from the shop-window photo (stacked CRT TVs, milk crates, VHS sleeves, a camcorder, astroturf, the
"Come in We're OPEN" sign). That photo ships in `assets/hero-storefront.jpg` and is the hero until you pick another.
Tokens are CSS custom properties in `layout/theme.liquid`, editable in **Theme settings → Colors**.

| Token | Default | Role |
| --- | --- | --- |
| `--c-bg` | `#EDE6D3` | VHS-label cream with film grain |
| `--c-ink` | `#141414` | CRT black: text, 3px borders, hard shadows, TV bezels |
| `--c-hot` | `#E0322B` | REC red: primary CTA, sale stickers, hover shadow |
| `--c-volt` | `#1E7A3C` | Astroturf green: kickers, newsletter band, footer, hover states |
| `--c-acid` | `#F5C518` | Simpsons-sleeve yellow: hover fills, NEW stickers, brand marquee |
| `--c-tang` | `#2457C5` | Track-jacket blue: crate tiles, second text shadow |
| chrome greys | `#C0C0C0` etc. | Win98-style bevel buttons |

Type: **Archivo Black** (display, all caps), **Space Grotesk** (body), **VT323** (pixel accents: kickers, counts, breadcrumbs). Loaded from Google Fonts; swap to Shopify-hosted fonts via `font_face` if you want to silence the theme-check `RemoteAsset` warnings.

## Sell to us, Whatnot, logo, seal

- **Sell page** — create a page with template `page.sell`, add it to the main menu as "Sell". Submissions (with photos) post to the hub API set in Theme settings → Consignment; sellers get a ticket link to accept / counter offers. Staff work them at work.thefuturebasics.com/consign.
- **Channel 12 (Whatnot)** — install the Whatnot sales channel from the Shopify App Store to sync products and orders. Theme settings → Whatnot live holds the channel URL, the live toggle (site-wide ON AIR badge) and next-show date (countdown). Tag products `whatnot` for a LIVE sticker.
- **Logo** — `snippets/logo.liquid` / `assets/logo.svg` is an outlined SVG recreation of the striped-chrome wordmark. Upload the original artwork via Header → Logo to use the exact file.
- **Seal** — the hero's gold "seal of quality" is `snippets/seal.liquid`; ring, top, big and bottom text are Hero settings.
- **Shoebox cart** — the cart icon is a shoebox; the lid pops and the count jumps out on add-to-cart, and stays ajar while the bag has items.

## Setup checklist (in Shopify admin)

1. **Online Store → Themes → Add theme → Upload zip** (or `shopify theme push`, below). Do **not** publish until content is ready.
2. **Customize → Hero → Image**: optional. The storefront photo is bundled and used by default; pick a different one here if you want. Set *Image darken* to taste.
3. **Navigation**: keep `main-menu` for pages (Sell, About, Contact). Optional: create a `shop-menu` and select it under *Header → Shop dropdown menu* to control the order of collections; otherwise the mega menu lists every collection automatically.
4. **Apps → Search & Discovery → Filters**: turn on **Vendor (Brand)**, **Product type**, **Size** (the variant option), **Price**, **Availability**, and **Color** / tags if used. This is what makes the filter sidebar populate. Nothing else is required.
5. Make sure every product has **Vendor** (brand), **Product type** (Sneakers / Tees / Hats / Collectibles…) and a **Size** option set, because those are what people filter on.
6. **Collections**: the "Pick a lane" tiles and mega menu use collection images. Give each collection an image.
7. Theme settings → **Motion**: leave on *Full send*, or drop to *Medium* if the client prefers calmer.

## Local development / deploy

```bash
npm i -g @shopify/cli
cd themes/common-ground
shopify theme check                      # lint (0 errors expected; RemoteAsset warnings are the Google Fonts links)
shopify theme dev --store <store>.myshopify.com   # live preview against a store
shopify theme push --unpublished --store <store>.myshopify.com   # upload as a new unpublished theme
```

## File map

```
layout/        theme.liquid, password.liquid
templates/     index, collection, product, cart, search, page, page.contact, list-collections, 404, blog, article, password, gift_card, customers/*
sections/      header-group.json, footer-group.json, header, announcement-bar, footer, cart-drawer,
               hero, marquee, collection-list, featured-collection, image-with-text, newsletter, rich-text,
               collection-banner, main-collection, main-search, main-list-collections, main-product, related-products,
               main-cart, main-page, contact-form, main-404, main-blog, main-article, main-password, customers-*
snippets/      product-card, price, sticker, facets, pagination, icon, meta-tags, address-fields
assets/        base.css, motion.js, cart.js, facets.js, product.js, customer.js
config/        settings_schema.json, settings_data.json
locales/       en.default.json
```

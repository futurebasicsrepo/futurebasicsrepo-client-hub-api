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
| **Home** | Hero with word-by-word rise-in and glitch-on-hover heading, rotating sticker, parallax photo; brand marquee; colour-blocked collection tiles (auto-populates from every non-empty collection); "Just walked in" and "Grails" product rails; image-with-text; newsletter. |
| **Motion** | Reveal-on-scroll, 3D card tilt, sticker cursor trail, glitch text, marquees, CRT scanline overlay, cross-document View Transitions, cart-count bump. Theme setting `Motion level` (Full / Medium / Off) and every effect obeys `prefers-reduced-motion`. |
| **Everything else** | Blog, article, pages, contact form, 404, password page, gift card, and all customer account templates. |

## Design system

Defined once as CSS custom properties in `layout/theme.liquid` and editable in **Theme settings → Colors**.

| Token | Default | Role |
| --- | --- | --- |
| `--c-bg` | `#F4EFE4` | Paper background with a subtle dot grid |
| `--c-ink` | `#111111` | Text, 3px borders, hard offset shadows |
| `--c-hot` | `#FF2D95` | Primary CTA, sale stickers, hover shadow |
| `--c-volt` | `#1F3BFF` | Links, kickers, newsletter band |
| `--c-acid` | `#C8FF00` | Hover fills, "NEW" stickers, marquee |
| `--c-tang` | `#FF6A00` | Sale stickers, tile accents |
| chrome greys | `#C0C0C0` etc. | Win98-style bevel buttons |

Type: **Archivo Black** (display, all caps), **Space Grotesk** (body), **VT323** (pixel accents: kickers, counts, breadcrumbs). Loaded from Google Fonts; swap to Shopify-hosted fonts via `font_face` if you want to silence the theme-check `RemoteAsset` warnings.

## Setup checklist (in Shopify admin)

1. **Online Store → Themes → Add theme → Upload zip** (or `shopify theme push`, below). Do **not** publish until content is ready.
2. **Customize → Hero → Image**: drop the storefront / landing-page photo from the current commonground12.com home page. 2400×1400 or larger. Set *Image darken* to taste.
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

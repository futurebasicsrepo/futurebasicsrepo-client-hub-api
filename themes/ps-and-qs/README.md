# Ps & Qs: "Mind Your"

A from-scratch Shopify Online Store 2.0 theme for [psandqs.com](https://psandqs.com). It is built for a family-owned
South Street shop, for the channels commerce runs through now (search, social, marketplaces and AI assistants), and
for motion that means something. The concept and system are in [DESIGN.md](DESIGN.md).

## What's in the box

| Area | What you get |
| --- | --- |
| **Home** | Mirror hero (p ⟷ q glyphs over photography), composing-stick brand marquee, Shop-by-intent chips, Just printed rail, the type case (collections), an In your size rail, the house line, The Block (collab/community proof sheet), Visit the shop (live open/closed), FAQ, recently viewed. Every section is editable in the theme editor. |
| **Fit profile** | "My sizes" dialog (tops / waist / shoes). Drives the In my size filter switch, "In your size" card flags, size pre-selection on product pages and the fit rail. Stored in the shopper's browser only. |
| **Collections** | Big typeset banner with a scrubbed mirrored letter, collapsible SEO description, quick-jump chips, native Shopify filters (sidebar on desktop, drawer on mobile) applied without page reloads and kept in the URL, In my size switch, one-tap size add on cards. |
| **Product** | Gallery (grid on desktop, swipe on mobile, click-to-zoom), variant-aware price/SKU/media, sold-out sizes struck through, fit notes, **pickup availability per size**, story / material accordions from metafields, Shop Pay button, *Complete the fit* + *You might also like* recommendations, recently viewed. |
| **Cart** | Slide-out bag with free-shipping meter, quantity steppers, pickup reminder; a full cart page with note field as fallback. |
| **Search** | Header overlay with predictive search (products, collections, suggestions); `/` opens it anywhere. Full results page with the same filters. |
| **Everything else** | About and FAQ page templates, journal (blog) and article, contact, 404, password (email capture), gift card and all customer account templates. |

## SEO, structured data and AI answer engines

| What | Where |
| --- | --- |
| `Organization` + `ClothingStore` (address, hours, phone, founders, founding year, socials) + `WebSite` with `SearchAction` | `snippets/structured-data.liquid`, fed by **Theme settings → Store & brand facts** |
| `ProductGroup` with one `Product` per size/color (SKU, GTIN, price, availability, exchange policy; free-shipping details only on offers over the threshold) | `snippets/product-schema.liquid` |
| `CollectionPage` + `ItemList`, `BreadcrumbList`, `FAQPage`, `Article` | matching sections |
| Generated meta descriptions from real data when none is written (fixes the duplicate description on every page) | `snippets/meta-description.liquid` |
| `noindex, follow` on thin URLs: vendor/type lookups, tag-filtered and facet-filtered collections, search | `layout/theme.liquid` |
| `robots.txt`: Shopify defaults kept, thin URLs blocked, AI search crawlers (OAI-SearchBot, ChatGPT-User, GPTBot, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended) explicitly allowed | `templates/robots.txt.liquid` |
| **llms.txt**: a plain-language brief for assistants (facts, brands, collections, pages) | `templates/page.llms.liquid` → `/pages/llms`, redirect `/llms.txt` to it |
| **Assistant catalog**: any collection as Markdown with prices, in-stock sizes, fit and material (`?view=llms`) | `templates/collection.llms.liquid` |

## Setup checklist (Shopify admin)

1. **Online Store → Themes → Add theme → Upload zip** (or `shopify theme push --unpublished`). Don't publish until content is in.
2. **Theme settings → Store & brand facts.** Confirm every value (see *Facts to verify* below). They go straight into Google, Maps and AI answers.
3. **Customize → Mirror hero.** Pick two portrait photos (shop interior, a crew shot, a fit). Add a storefront photo to *Visit the shop*.
4. **Navigation.** `main-menu`: New, Ps & Qs, Journal, Visit (About page). Optional `shop-menu` for the Shop dropdown categories. `footer`: FAQ, Shipping & exchanges, Contact, Our story.
5. **Pages.** Create *About* (template `page.about`), *FAQ* (`page.faq`), *Contact* (`page.contact`) and *For AI assistants* (`page.llms`). Pick the last one in Theme settings → Store & brand facts → AI assistant page.
6. **Online Store → Navigation → URL redirects.** Add `/llms.txt` → `/pages/llms` (your AI assistant page's URL).
7. **Apps → Search & Discovery.**
   - *Filters*: turn on Vendor, Product type, **Size** (variant option), Price, Availability, Color. The In my size switch needs the Size filter.
   - *Product recommendations*: add complementary pairs (pant ↔ belt, hoodie ↔ hat) to fill *Complete the fit*.
   - *Synonyms*: `wip, carhartt wip`, `crewneck, crew, sweatshirt`, `ps and qs, p's & q's, psqs`.
8. **Settings → Shipping and delivery → Local pickup.** Enable it for the South Street location so product pages show "Pickup available".
9. **Run the catalog audit** (below) and work through the report. Collections: write 80–200 word descriptions (brand, fit, why it's here) and give each an image.
10. **Theme settings → Motion.** Leave on *Full*; *Medium* keeps reveals and tickers only.

## Catalog audit (run first, then monthly)

```bash
SHOPIFY_STORE_DOMAIN=<store>.myshopify.com SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_... \
  node scripts/psandqs-catalog-audit.mjs --setup            # create metafield definitions + read-only report
  node scripts/psandqs-catalog-audit.mjs --apply            # normalise house vendor to "Ps & Qs", fill empty alt text
```

The audit writes `psandqs-catalog-audit.csv` with every product's gaps: vendor spelling, missing type or Shopify product category,
thin descriptions, fewer than three images, missing alt text, apparel without a Size option, missing fit notes, SKUs, GTINs
(branded goods), and products not published online. Every channel below reads this same data.

## Channel playbook: the same catalog everywhere

| Channel | How | Why it matters for Ps & Qs |
| --- | --- | --- |
| **Google (Shopping, free listings, local inventory, AI Overviews)** | Google & YouTube app; fill product category + GTINs; connect Shopify POS inventory for **local inventory ads / "in stock nearby"** | Shoppers searching "Carhartt Single Knee Philadelphia" see it's on the shelf on South Street |
| **Google Business Profile** | Link to the storefront, hours matching Theme settings, weekly posts for drops, "See what's in store" | Maps is the front door for a walk-in shop |
| **AI assistants (ChatGPT, Perplexity, Copilot, Gemini)** | Keep Shopify's catalog/agentic channels enabled in admin; `robots.txt` allows their crawlers; `/pages/llms` + `?view=llms`; complete product data | "Where can I buy Paratodo pants in Philly?" should answer *Ps & Qs* |
| **Meta (Instagram + Facebook Shops)** | Facebook & Instagram app; tag products in @psqsshop posts and Reels | The community already lives on Instagram |
| **TikTok Shop** | TikTok app; collab drops and shop-hang content | Drop culture, creator affiliates from the Philly scene |
| **Shop app** | Automatic with Shop Pay; post drops to the shop's Shop page | Followers get drop notifications for free |
| **Pinterest** | Pinterest app for catalog pins | Evergreen discovery for workwear and outerwear |
| **Collab partners** | Link collab products from The Block; ask partners (Union, Pat's, Hat Club) to link back | Authority links for the brand entity and for the capsules |

## Facts to verify with the client before launch

These came from public press and listings. The research couldn't reach psandqs.com directly, so confirm each one:

- Hours (Mon–Sat 12–7, Sun 12–6), phone (215) 592-0888, and the free-shipping threshold ($250) / exchanges-only policy (30 days)
- The founding story and names (Ky Cao, Rick Cao, Jackson Fu; Abakus Takeout 2008; South St 2012)
- Every moment in *The Block*: years, partners and links (Tretorn × Publish 2015, Ps & Qs For Her 2016, the Ubiq / Lapstone & Hammer capsule 2019, the Philadelphia Suns tee 2020, the Union *Year of the Snake* capsule 2025, the Hat Club *Group Chat Pack* 2026). Add the Pat's King of Steaks tee once its year is confirmed.
- Collection handles used in the homepage defaults: `ps-qs`, `mens-bottoms`, `headwear`, `carhartt-work-in-progress`, `accessories-1`, `totes`, `new-arrivals`
- Whether Ps & Qs For Her (1018 Pine St) is still open; if it is, add it as a second location in structured data

## Local development

```bash
npm i -g @shopify/cli
cd themes/ps-and-qs
shopify theme check                       # 0 offenses expected
shopify theme dev --store <store>.myshopify.com
shopify theme push --unpublished --store <store>.myshopify.com
```

## File map

```
layout/     theme.liquid, password.liquid
templates/  index, collection, collection.llms, product, product.card, cart, search, page, page.about, page.faq,
            page.contact, page.llms, list-collections, blog, article, 404, password, gift_card, robots.txt, customers/*
sections/   header (+ mega menu, search overlay, mobile drawer), announcement-bar, footer, cart-drawer,
            hero-mirror, marquee, intents, type-case, product-rail, image-with-text, rich-text, the-block,
            store-visit, faq, recently-viewed, collection-banner, main-collection, main-search, main-list-collections,
            main-product, pickup-availability, product-recommendations, predictive-search, main-cart, main-page,
            contact-form, main-blog, main-article, main-404, main-password, customers-*
snippets/   structured-data, product-schema, meta-description, meta-tags, breadcrumbs, product-card, price, stamp,
            ship-meter, fit-profile, facets, pagination, logo, icon, address-fields
assets/     base.css, motion.js, fit.js, header.js, cart.js, facets.js, product.js, customer.js,
            fraunces(-italic).woff2, inter-tight.woff2, dm-mono.woff2 (SIL Open Font License)
```

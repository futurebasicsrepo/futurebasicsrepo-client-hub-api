# The Shopify app: design to a sale on your store

What exists, what the tech pack can already hand to Shopify, what it cannot yet, and the order to build it in. The idea: a merchant designs and develops a product in the hub, and the same record becomes a draft product on their Shopify store, with its variants, cost, media and specification, and stays linked as it moves from sample to production to on-sale.

## What exists today

- Staff can push a product to the store as a draft (`POST /v1/admin/products/:id/publish-shopify`): title, vendor, type, handle, description, metafields from the product brief and configuration, then create or update. It writes `shopify_product_id`, status and sync time back. Price tiers (cost, wholesale, SRP) exist per product.
- Products, customers, paid orders and draft orders sync from the store; payments for tech packs are read from Shopify orders.
- The tech pack has a clean, versioned, signed record of the product: sizes, colourways with Pantone, bill of materials, measurements, construction, artwork and placements, labels, packaging, care, and (new) a style number and a change list between versions.

## What the tech pack hands to Shopify, field by field

| Shopify | From the pack | Ready? |
|---|---|---|
| Product title, description | style name, description | yes |
| Options: Size, Colour | `sizes`, `colorways` | yes (cross product = variants) |
| Media | hero, colour renderings, views, artwork | yes: `GET /v1/admin/products/:id/tech-pack/media` returns signed, expiring URLs Shopify can fetch (`/m/…`). Storage is still inline; see release-readiness. |
| Metafields (specification) | BOM, measurements, construction, care, fibre, label list | yes, as JSON metafields (`custom.techpack_*`), read-only to the merchant |
| Tags and collection | category, season, client | yes |
| Variant SKU, barcode | `commercial.variants[]` (generated from style number, colour and size; barcode checksum-checked) | yes |
| Variant price, compare-at | `commercial.retailPrice`, `compareAtPrice`, per-variant override | yes |
| Variant cost (`inventoryItem.cost`) | accepted quote tier | partly: quote exists, not linked to the pack version it priced |
| Weight, dimensions | `commercial.weightGrams`, packed length, width, height | yes |
| HS code, country of origin | `commercial.hsCode`; origin read from the care text as an ISO code (`FBCommercial.countryCode`) | yes (`inventoryItem.harmonizedSystemCode`, `countryCodeOfOrigin`) |
| Status | pack lifecycle | map: published → DRAFT, factory countersigned and sample approved → ready, production complete → ACTIVE |

## Build order

1. ~~A Commercial section on the tech pack~~ done: SKU per size and colour, price, weight, packed size, HS code, origin; versioned and diffed, price never shown to a factory.
2. ~~Pictures as URLs~~ done for export (signed links). Moving the storage itself to files is a separate, later change.
3. ~~**The export, as a button first**~~ built, for the store this server is connected to. In a published pack's More menu (staff): **Create on Shopify…** shows a preview (what will be made, what blocks it, what is only worth fixing), then creates a **DRAFT** product in one `productSet` call: options Size and Colour, a variant per size and colour (SKU, barcode, price, compare-at, cost from the first price tier, weight in grams, HS code, country of origin), up to eight product pictures from the signed links, the `techpack.*` metafields (style number, version, link back, fibre, care, origin, sizes, materials, construction, measurements, inspection) and the description. Every export is recorded (`shopify_exports`) with the prices it sent.
   - **Who owns what after the first export:** the pack owns the specification; Shopify owns how it is sold. A re-export updates the specification and the metafields, adds new sizes and colours, and **never deletes anything, never retitles, never touches description, tags or status, and sets a price only when the pack's price moved since the last export** (so a price the merchant changed stands). A variant in the store that is not in the pack is reported and left alone. Pictures are added on creation only.
   - **Engine:** `src/pack-export.js` (`buildShopifyExport` is pure; `exportToShopify` takes `exec(query, variables)`), routes `GET/POST /v1/admin/products/:id/tech-pack/shopify-export`. All five operations were validated against the Admin schema. Tested end to end against the stand-in store (J103), including a merchant who changed the title and price and added a variant in between.
4. **The app shell, which is what lets a customer export to their own store**: Shopify OAuth install per merchant (today there is one connected store, Future Basics'), a token per merchant, and `exportToShopify` called with that merchant's `exec`. The embedded admin page lists linked products with lifecycle stage and version and has a "send this version" button; a theme block shows specification and care from the metafields. The export itself does not change.
5. **Keep it linked**: webhooks for product update and delete; when the merchant changes price or title in Shopify, show it against the pack rather than overwriting; when a new pack version is published, offer "update the store draft" with the change list.
6. **The sale loop**: inventory, orders and sell-through per product shown back in the hub next to the pack, so the next version of the pack starts from what sold.

## Decisions to make before step 3

- One app for the merchant to install (their store), or the current single Future Basics store with merchants as customers. The first is the product; the second is what exists, and the export button works against it today.
- Whether the pack or Shopify is the source of truth for price after launch. Recommended: the pack for cost and specification, Shopify for price once ACTIVE.
- Plans and pricing for the app (scoped separately).

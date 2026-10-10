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
3. **The export, as a button first**: "Create on your Shopify store". Draft product, options (Size, Colour), variants with SKU, barcode, price, cost (from the accepted quote), weight and HS code, media from the signed links, spec metafields. Idempotent: running it again updates the same product and reports what changed (reuse the pack diff). Store the mapping per pack version.
4. **The app shell**: Shopify OAuth install (merchant, not the single store token used today), embedded admin page listing linked products with lifecycle stage and version, "open in hub" links, and a theme block showing specification and care from the metafields.
5. **Keep it linked**: webhooks for product update and delete; when the merchant changes price or title in Shopify, show it against the pack rather than overwriting; when a new pack version is published, offer "update the store draft" with the change list.
6. **The sale loop**: inventory, orders and sell-through per product shown back in the hub next to the pack, so the next version of the pack starts from what sold.

## Decisions to make before step 3

- One app for the merchant to install (their store), or the current single Future Basics store with merchants as customers. The first is the product; the second is what exists.
- Whether the pack or Shopify is the source of truth for price after launch. Recommended: the pack for cost and specification, Shopify for price once ACTIVE.
- Plans and pricing for the app (scoped separately).

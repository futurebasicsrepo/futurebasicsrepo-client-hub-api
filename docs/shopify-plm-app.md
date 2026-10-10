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
4. ~~**The app shell, which is what lets a customer export to their own store**~~ the install and the export are built; the embedded admin page and theme block are not.
   - **Connect a store** (hub home, "Your Shopify store"): the customer types `their-store.myshopify.com`; the hub stores a single-use state (15 minutes, tied to their room and that shop) and sends them to Shopify's authorize page. Shopify returns them to `GET /v1/shopify/callback`, which trades the code for an offline token only if **all** of these hold: the query's HMAC verifies with our app secret, the shop is a real `*.myshopify.com` name, the timestamp is fresh, the state is ours, unused, unexpired and for that same shop, and the granted scopes include products. Anything else lands back on the hub with a plain-words reason and connects nothing. A used state cannot be replayed.
   - **The token** is sealed (AES-256-GCM, key from `SHOPIFY_TOKEN_KEY`, else derived from the app secret) before it reaches `client_shopify_stores`; the hub never returns it. A 401 or 403 from the store marks it **needs reconnecting** (hub shows Reconnect; exports are blocked with the same words) and reconnecting the same shop reuses its row. If the key changes, stores ask to reconnect rather than failing obscurely.
   - **Uninstall**: an `APP_UNINSTALLED` webhook is registered at install (`webhookSubscriptionCreate` with `uri`). `POST /shopify/webhooks` verifies the signature over the raw body (route-level `preParsing`, nothing else is affected), then marks the store removed and wipes its token. The three privacy topics (`customers/data_request`, `customers/redact`, `shop/redact`) answer 200: we keep nothing about a store's own customers; `shop/redact` also removes our copy of the store. Disconnecting from the hub does the same locally and says to remove the app in Shopify admin too.
   - **Export**: `GET/POST /v1/products/:id/tech-pack/shopify-export` for the customer (ownership checked, their store only, 404 for anyone else), and the staff route takes an optional `storeId` to send to a customer's store. History is per store (`shopify_exports.store_id`), so a re-send to the customer's store continues the same product and Future Basics' own store keeps its own record. **Cost on a customer's store is what they pay us (the wholesale price); our internal unit cost never leaves.** The customer's export never writes the product's own Shopify link (that belongs to Future Basics' store).
   - **Setup on the server**: create the app in the Shopify Partner dashboard (distribution: custom or public), set the redirect URL to `https://<api>/v1/shopify/callback`, and set `SHOPIFY_APP_CLIENT_ID`, `SHOPIFY_APP_CLIENT_SECRET`; optionally `SHOPIFY_TOKEN_KEY`, `SHOPIFY_APP_SCOPES` (default `read_products,write_products`), `SHOPIFY_APP_REDIRECT_URI` and `SHOPIFY_WEBHOOK_URL` (both default to the request host). Point the app's compliance webhook URLs at `https://<api>/shopify/webhooks`. Until the two app variables are set, the hub panel stays hidden and the pack dialog says connecting is not switched on.
   - **Tested** (unit: signature, state, shop name, sealing, retry, refused token; journey J104 against the stand-in store: forged, replayed, wrong-shop, expired, bad-code and no-permission callbacks, the install, the export to the customer's store and not ours, cost, another customer's access, the price a merchant set standing, revoke and reconnect, the signed and unsigned webhook, disconnect, and the hub and dialog in a browser). **Not tested against real Shopify**: the authorize screen, a real offline token, real webhook delivery. First connection should be tried on a development store.
   - Not built: the embedded admin page inside Shopify and the theme block.
5. **Keep it linked**: webhooks for product update and delete; when the merchant changes price or title in Shopify, show it against the pack rather than overwriting; when a new pack version is published, offer "update the store draft" with the change list.
6. **The sale loop**: inventory, orders and sell-through per product shown back in the hub next to the pack, so the next version of the pack starts from what sold.

## Decisions to make before step 3

- One app for the merchant to install (their store), or the current single Future Basics store with merchants as customers. The first is the product; the second is what exists, and the export button works against it today.
- Whether the pack or Shopify is the source of truth for price after launch. Recommended: the pack for cost and specification, Shopify for price once ACTIVE.
- Plans and pricing for the app (scoped separately).

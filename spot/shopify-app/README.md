# Spot app for Shopify

One-click install for stores. It adds an **Ask someone to pay** block that
merchants drag onto their product and cart pages in the theme editor. Shoppers
tap it, their cart opens in Spot (priced by Shopify, never by the page), and
they send it to whoever's paying.

What's here:

- `shopify.app.toml`: the app's config. It covers the scopes (`read_products`
  and `read_themes`), the app URL (`https://spotmeplease.com/shopify`) and the webhooks
  (uninstall and the three privacy topics).
- `extensions/spot-button/`: the theme app extension. It holds the block and
  its design settings (text, style, colors, roundness, size, width, alignment,
  font), plus the script and styles.
- The server side lives in `spot/src/shopifyapp.js`.

## Set it up (about 15 minutes)

1. **Create the app.**
   1. Go to [dev.shopify.com](https://dev.shopify.com) → **Apps** →
      **Create app** → **Start from Dev Dashboard**, and name it **Spot**.
   2. Open its **Settings** and copy the **Client ID** and **Secret**.
2. **Give Spot the keys.**
   1. In Railway → Spot service → **Variables**, add
      `SHOPIFY_APP_CLIENT_ID` and `SHOPIFY_APP_CLIENT_SECRET`.
   2. Railway redeploys.
   3. `/admin/health` then shows "Spot app for Shopify" as set up.
3. **Deploy the config and the block.** On your computer:
   1. Paste the Client ID over `PASTE_CLIENT_ID_HERE` in `shopify.app.toml`.
   2. Run, from this folder:

      ```sh
      cd spot/shopify-app
      npm install
      npm run deploy      # logs you in to Shopify the first time
      ```

   3. Say yes to releasing the new version. This uploads the scopes, URLs,
      webhooks and the theme block.
4. **Try it on a dev store.**
   1. Dev Dashboard → your app → **Test your app** (or **Install app**) and
      pick a development store.
   2. Shopify asks for the `read_products` and `read_themes` scopes and then opens Spot inside
      the admin. It should say **Spot is on for (store) ✓ Verified**.
   3. Press **Add to product pages**, then press **Save** in the theme editor.
   4. Open a product on the storefront, tap **Ask someone to pay**, and check
      that the cart opens in Spot with the right price.
5. **List it (when ready).** In the Partner Dashboard, create the App Store
   listing. It needs:
   - the icon (`spot/brand/`)
   - screenshots (the block on a product page, and the admin page)
   - the privacy policy URL `https://spotmeplease.com/privacy`
   - support email `hello@spotmeplease.com`

   Shopify reviews new apps, usually in one to two weeks.

## How it works

- **Install:** Shopify's managed install grants `read_products` and `read_themes`, and then
  loads `/shopify` in the admin. App Bridge gives the page a session token, and
  Spot trades it for the store's offline access token (token exchange).
  - The token is stored encrypted with a key derived from the app secret.
  - Spot makes the store a merchant marked verified. Shopify serves the store
    from its domain, so payers see "sent from (store)'s checkout ✓".
- **The block:** it sends `{ shop, lines: [{ variant_id, quantity }] }` to
  `POST /v1/shopify/asks`, and only from the store's own domains.
  - Spot looks up those variants in the store's catalog: active, for sale,
    priced in US dollars. It builds the cart from them, and the shopper lands
    on `/new?draft=…`.
  - On the cart page, the block reads `/cart.js`. On a product page, it reads
    the selected variant and quantity from the theme's product form.
- **Uninstall:** Spot drops the token at once, and the button stops working.
  `shop/redact` (48 hours later) deletes the store's record. Spot reads no
  Shopify customer data, so the customer privacy webhooks only acknowledge.

## Where the button goes

Spot reads the live theme (`read_themes`, never writes) and picks a place for
each of the product and cart templates:

1. the first section in the template whose schema takes app blocks
   (`{"type": "@app"}`), by its real section id;
2. otherwise the theme's Apps section (`sections/apps.liquid`), as its own section;
3. otherwise no link. The admin page tells the merchant to add Shopify's
   standard Apps section, or to ask their theme developer to let the main
   section take app blocks. A link to a place the theme can't take shows
   Shopify's "There is a problem with the app block" error.

## Limits for now

- US-dollar stores only.
- The block sends items only; shipping and tax aren't added to the Spot cart
  yet. When the store supports agent checkout, the payer pays on the store's
  own checkout, which adds them.
- Extra storefront domains beyond the primary one (for example, separate
  domains per Markets region) aren't recognised yet.

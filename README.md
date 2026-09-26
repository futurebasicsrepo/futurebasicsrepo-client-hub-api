# Future Basics Client Hub API

Backend for the Future Basics Shopify client hub. It provides tenant-scoped email-code login, client profiles, Shopify product and customer sync, multi-project workspaces, project messaging, requests, uploads, invoices, and dashboard data.

## Railway services

- API service built from this repository
- PostgreSQL database exposed as `DATABASE_URL`
- Persistent volume mounted at `/data` for uploaded PDF, AI, image, and ZIP files

## Required variables

`DATABASE_URL`, `JWT_SECRET`

Production URLs:

- `WORK_HUB_URL=https://work.thefuturebasics.com`
- `CLIENT_HUB_URL=https://hub.thefuturebasics.com`
- `START_PROJECT_URL=https://thefuturebasics.com/pages/contact`
- `ALLOWED_ORIGINS=https://thefuturebasics.com,https://work.thefuturebasics.com,https://hub.thefuturebasics.com`

For live email codes also set `RESEND_API_KEY` and `AUTH_FROM_EMAIL`. Set `INTAKE_NOTIFICATION_EMAIL` to the team inbox that should receive every new public project brief (defaults to `kyle@thefuturebasics.com`). Without Resend, codes are written to deploy logs for setup testing and intake submissions are still saved, but no notification email is sent.

For Future Basics staff Google Workspace SSO, configure a Google OAuth 2.0 Web application with the authorized redirect URI `https://work.thefuturebasics.com/v1/auth/google/callback`, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. `GOOGLE_REDIRECT_URI` is optional when using the production URL. The server verifies Google's signed identity token, verified-email status, and the `thefuturebasics.com` hosted domain before issuing an admin session.

## Consignment / trade-in counter (Common Ground)

The Common Ground storefront's **Sell** page (`themes/common-ground`, template `page.sell`) posts items with photos to this API. Staff review them at `work.thefuturebasics.com/consign`, make an offer, and the seller accepts, counters or declines from a tokenised ticket link. Every move emails the other side.

Variables:

- `ALLOWED_ORIGINS` must include the storefront origin(s), e.g. `https://commonground12.com,https://fkgwpw-8u.myshopify.com`
- `CONSIGN_TICKET_URL` — the storefront Sell page, e.g. `https://commonground12.com/pages/sell` (the seller's ticket link is `<url>?t=<token>`)
- `CONSIGN_NOTIFICATION_EMAIL` — inbox for new submissions and seller responses (defaults to `INTAKE_NOTIFICATION_EMAIL`)
- `CONSIGN_FROM_EMAIL` — sender for seller emails (defaults to `AUTH_FROM_EMAIL`)

Endpoints:

- `POST /v1/public/consignments` — multipart: `seller_name`, `seller_email`, `seller_phone`, `item_title`, `brand`, `size`, `condition` (deadstock|like_new|used_good|used_fair), `deal_type` (either|cash|consign|trade), `asking_cents`, `details`, up to 5 `images`. Rate limited per IP; honeypot field `company_fax`.
- `GET /v1/public/consignments/:token` — the seller's ticket: item, photos, offer thread, status
- `POST /v1/public/consignments/:token/respond` — `{ action: counter|accept|decline, amount_cents?, note? }`
- `GET /v1/public/consignment-images/:id`
- `GET /v1/admin/consignments?status=open|accepted|paid|declined|all`, `GET /v1/admin/consignments/:id`
- `POST /v1/admin/consignments/:id/offers` — `{ action: offer|counter|accept|decline, amount_cents?, note? }`
- `PATCH /v1/admin/consignments/:id` — `{ status?, staff_notes? }` (reviewing, paid, withdrawn…)

Negotiation rules live in `src/consign.js` (unit tests in `test/consign.test.js`): the shop opens with an offer; only the side that does not hold the open offer can counter, accept or decline; accepting locks `agreed_cents` and closes the ticket.

## Make an offer (Common Ground)

Buyer-initiated haggling on a live product, gated per-product by a metafield — the opposite direction from the consignment flow above (there the shop opens with an offer to buy from a seller; here a buyer offers to buy from the shop). A buyer opens with one offer and completes a real Shopify checkout for it immediately — **that's where the card is captured; it never touches this API**. The shop then has 24 hours to accept, counter, or decline. If the shop counters, the buyer has 24 hours to accept (a fresh checkout at the counter price) or decline. Either side missing its 24-hour window auto-expires the offer. This is a two-round negotiation by design — the buyer can't counter back a second time — to keep the payment/hold bookkeeping tractable; see `src/offers.js` for the full state machine and the scope note at the top of that file.

Card handling is Shopify Payments only, via draft-order checkout — no Stripe, no card data ever reaches this server. Each round's checkout creates a real order; `orderCancel` (with `refundMethod.originalPaymentMethodsRefund: true`) releases it on decline/expire — this call voids an uncaptured authorization or refunds a captured sale, whichever the store's payment-capture setting produced, so it works regardless of whether the store auto-captures. `orderCapture` finalizes it on accept. Because this uses the shop's own checkout rather than a delayed-capture API Shopify doesn't expose headlessly, the buyer's card is briefly authorized/charged for their own opening offer even before the shop responds — declines and expirations are refunded automatically by the sweep below.

**One-time setup per store:** run `node scripts/setup-offer-metafields.mjs` (needs `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_ADMIN_ACCESS_TOKEN`, same values as the hub API) to create the `custom.accepts_offers` (boolean) and `custom.offer_min_percent` (integer, default 50) product metafield definitions. After that, staff toggle offers on per product from the normal Metafields editor in Shopify admin — no app install. Also create a storefront page at `/pages/offer` using the `page.offer` template (`themes/common-ground`) so counter-offer links resolve; set `OFFER_TICKET_URL` to it.

Variables (all optional, each falls back to the matching `CONSIGN_*` value):

- `OFFER_TICKET_URL` — the storefront offer-status page, e.g. `https://commonground12.com/pages/offer`
- `OFFER_NOTIFICATION_EMAIL` — inbox for new offers and buyer responses
- `OFFER_FROM_EMAIL` — sender for buyer emails

Endpoints:

- `POST /v1/public/offers` — JSON: `variant_id`, `quantity`, `amount` (dollars) or `amount_cents`, `buyer_name`, `buyer_email`, `buyer_phone?`, `note?`. Validates against the live Shopify price + `accepts_offers`/`offer_min_percent` metafields, opens a draft order at the offer price, and returns `checkout_url` for the buyer to pay. Rate limited per IP; honeypot field `company_fax`.
- `GET /v1/public/offers/:token` — the buyer's ticket: status, amount, move thread
- `POST /v1/public/offers/:token/respond` — `{ action: accept|decline, note? }`, buyer responding to a counter; `accept` returns a fresh `checkout_url`
- `GET /v1/admin/offers?status=open|accepted|declined|expired|all`, `GET /v1/admin/offers/:id`
- `POST /v1/admin/offers/:id/respond` — `{ action: counter|accept|decline, amount_cents?, note? }`
- `PATCH /v1/admin/offers/:id` — `{ staff_notes? }`

A background sweep (every 5 minutes) polls unpaid offers' draft-order status to detect completed checkouts and start the 24h clock, cancels checkouts abandoned for 2+ hours, and auto-expires (with refund/void) any offer whose 24h response window lapsed.

## Endpoints

- `GET /health`
- `GET /` — client gate on `hub.thefuturebasics.com`, staff UI on `work.thefuturebasics.com`
- `GET /clients/:id` — full-page staff client workspace
- `GET /hub` — client gate fallback
- `GET /admin` — staff UI fallback
- `POST /v1/auth/code` — `{ "email": "name@ouster.com" }`
- `POST /v1/auth/verify` — `{ "email": "...", "code": "123456" }`
- `GET /v1/auth/google/start` — begin Future Basics Google Workspace SSO
- `GET /v1/auth/google/callback` — Google OAuth callback
- `GET /v1/session` — current user and tenant, Bearer token
- `GET /v1/dashboard` — Bearer token
- `POST /v1/admin/clients/:id/archive` / `restore` — reversible staff client-room archive controls
- `POST /v1/admin/projects/:id/archive` / `restore` — reversible project archive controls
- `GET /v1/admin/projects/:id/share` — secure client-room link and PDF export metadata
- `POST /v1/projects/:id/messages` — add a client message to a project thread, Bearer token
- `GET /v1/projects/:id/share.pdf` — authenticated client-ready product collection with units, setup, shipping, and totals
- `GET /v1/products/:id` — client product details, issued quote, and quote-decision readiness, Bearer token
- `POST /v1/quotes/:id/decision` — approve or decline a complete issued quote and notify the work console, Bearer token
- `POST /v1/requests` — Bearer token
- `POST /v1/requests/:id/files` — multipart field `file`, Bearer token

Each client can have multiple approved email domains and multiple active projects. Products belong to projects, and each project has a shared staff/client message thread. Archived client rooms and projects remain recoverable to staff but are removed from active client access. A domain can belong to only one client room. Future Basics staff authenticate with `thefuturebasics.com` and are routed to the internal operations hub. Client API reads and writes remain scoped to the `clientId` signed into the session token.

## Pulling products off the live Common Ground store

`scripts/pull-commonground-products.mjs` reads the public `products.json` feed of
commonground12.com, saves every product photo, and writes a Shopify-importable
CSV. With `--push` and an Admin API token it creates the products (images,
options, variants, prices, stock) directly in another store.

```sh
node scripts/pull-commonground-products.mjs --limit 30 --out ./commonground-export
# then Products -> Import -> commonground-export/products.csv in the target admin

# or create them straight in the trial store (Settings -> Apps -> Develop apps -> Admin API token
# with write_products + write_inventory):
SHOPIFY_STORE=fkgwpw-8u SHOPIFY_ADMIN_TOKEN=shpat_... \
  node scripts/pull-commonground-products.mjs --limit 30 --push
```

Products are created as drafts; add `--active` to publish them.

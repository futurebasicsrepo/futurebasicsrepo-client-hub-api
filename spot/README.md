# Spot

**The yes button for AI shopping.**

AI can find it and fill the cart; a person has to say yes to paying. Spot is that yes: from the user, or from whoever's paying, with rules the user sets for their AI and signed proof of every approval.

- **Pay the store directly.** For stores with agent checkout (UCP), Spot builds the store's own checkout and the payer pays the store there. The store is the seller; no fee, and Spot never holds the money.
- **Rules and approvers.** Each AI key on an account gets limits (per order, per month, allowed stores). Outside them, asks are refused, or go to an approver who agreed by email.
- **Store button.** Stores embed "Ask someone to pay" by their checkout; the shopper's cart opens in Spot at the store's prices.
- **Trust.** Every yes is a signed approval (EdDSA JWS, keys at `/.well-known/spot-keys.json`); Spot signs its requests to stores (RFC 9421, Web Bot Auth); each AI key has an activity log with an off switch.

Otherwise, Spot turns any shopping cart into a link. Whoever opens the link buys that cart **from Spot** in one tap, as a gift or for themselves. Spot then orders exactly those items from the store with its own single-use card and ships them to the requester, so nobody receives cash or a card. If the requester just wants money straight to them, the link can send the payer to Venmo or Cash App instead, and then Spot isn't part of the payment.

This is a standalone prototype. It lives in this repo for now and shares nothing with the client hub, so it can move to its own repo as is.

```
spot/
  src/cart.js       validation, money math, state machine, merchant lock (pure, unit tested)
  src/capture.js    link → cart (JSON-LD / Open Graph), screenshot → cart (Claude vision)
  src/providers.js  sandbox (no money) and Stripe (PaymentIntents + Issuing)
  src/spot.js       service layer: every state change goes through here
  src/server.js     Fastify routes + Stripe webhooks
  src/site.js       the public website at /  (the app is at /new)
  src/sitefx.js     the site's human/playful layer: cast, hand-drawn marks, scroll story, chat wall
  src/integrations.js  /integrations: extension, MCP, API, store buttons, coming soon
  src/extension.js  the "Spot this" Chrome extension, zipped at /downloads/spot-extension.zip
  src/pages.js      the three pages: composer (/new), pay, requester
  src/client/home.js  the composer's behaviour (capture → check → send)
  src/sharecard.js  link-preview image + the mascot (satori → resvg)
  src/db.js         Node's built-in SQLite
  src/fulfill/      "order it for me": Shopify cart builder + the checkout agent
  src/agentapi.js   REST + MCP API for other AI agents (enforces each key's rules)
  src/direct.js     pay the store directly: the store's own UCP checkout
  src/rules.js      spending rules for AI keys, and the account's approver
  src/signing.js    Ed25519 keys: signed approvals (JWS) and signed requests (RFC 9421)
  src/approvals.js  record and read signed approvals
  src/merchants.js  the store's "Ask someone to pay" button, keys and domain verification
```

## Run it

```bash
cd spot
npm install
npm start          # http://localhost:3000, sandbox mode
npm test
```

With no Stripe keys set, Spot runs in **sandbox mode**. Payment is a "Pay (test)" button, Spot's card is a fake Visa number, and the requester page has a "Test the store's side" box that plays what the store does with Spot's card: an authorization, a capture, a refund for a return, or a release. That's enough to demo the full loop on two phones.

## How it works

1. **Capture: one box.** Paste a link or any shared text that has a link in it, drop or paste a screenshot, or just say what you want ("black Salomon XT-6 in 10.5"). Links are read from JSON-LD `Product` data, then Open Graph / `product:price` tags. Screenshots are read by Claude with a JSON schema. Descriptions are looked up by Claude with web search; with no API key they become an editable item. If a link was read confidently (every price found, store known) and the requester is known on this device, Spot skips the review step and goes straight to Send. Everything else gets a quick check first. The "Spot this" bookmarklet, `/new?url=` and `/new?text=` all feed the same box.
   **Sending:** one Send button (the phone's share sheet with the message already written), "Ask Mom"-style buttons for saved people (a text message already written; Android can pick from contacts), plus Text, WhatsApp and Copy. The requester's name, payout handles, favourite people and their recent Spots ("My Spots") are remembered in `localStorage` on that device. A link can be edited until someone starts paying, and the share card redraws.
2. **Share.** When the link (`/c/<12 chars>`) is pasted into iMessage, WhatsApp, Slack, Discord or X, it shows a share card drawn for that cart (`/c/<token>/card.png`, 1200×630 PNG, `src/sharecard.js`). The card has Spot the mascot asking "psst… can you spot Kyle?", the item, the store and the price. It redraws to "Mom spotted Kyle!" with a happy mascot once the cart is paid. The pay page is a short chat from Spot, not a form. The mascot's eyes follow the pointer, and paying ends in confetti.
3. **Pay: the payer buys the cart from Spot.** Stripe Payment Element: Apple Pay, Google Pay or card. The price is the cart, plus a cushion for tax and price changes (5%, max $15, and whatever the store doesn't charge goes back), plus a Spot fee: $2 per ask (once, however many stores) plus card processing (2.9% + 30¢), grossed up so Spot keeps $2 after Stripe. Before taking money, Spot checks it can actually order from that store (a UCP store, or the checkout agent is on); if not, the payer is pointed to the Venmo / Cash App handoff. The payer gets a receipt from Spot (`/c/<token>/receipt?p=…`, signed) with a cancel-for-a-full-refund button that works until the order is placed.
4. **Spot's card.** Before the payer's card is touched, Spot gets the store's real total for the address and makes its card switched off; then the payer's card is only *held* (`capture_method: manual`). When the hold is in (`payment_intent.amount_capturable_updated`, or the pay page checking straight after), Spot switches on its single-use Stripe Issuing virtual card to **its own company cardholder** (`STRIPE_ISSUING_CARDHOLDER`). Nobody outside Spot ever sees it: there is no reveal route, and the requester's page only learns that ordering can start.
5. **Merchant lock.** Every charge on the card hits the `issuing_authorization.request` webhook. Spot approves it only if the card is unused, the merchant isn't cash-like (ATMs, money transfer, stored value, quasi-cash, gambling, pawn and more, checked by Stripe category and MCC), the merchant's name or domain matches the cart's store (never a single generic word), and the amount fits what the payer paid for the goods. The card carries the same limits as Stripe spending controls (`all_time` limit plus `blocked_categories`) in case the webhook is down. The first approved charge completes the cart, and every later charge is declined. That approval is the store accepting the order, so it's when the payer's hold is captured; a capture that fails is retried by the money sweep. If Spot can't order it, the hold is released instead of refunded, and the payer is told they were never charged. Carts can't contain gift cards, prepaid cards or other cash equivalents.
6. **After the store charges** (`issuing_transaction.created`, `issuing_authorization.updated`): Spot cancels the card, and whatever the store didn't charge goes back to the payer as a partial refund. A store refund for a return is passed on to the payer. A reversed authorization refunds the payer in full. An expired one waits 30 days for a late capture first. Each Stripe transaction is recorded once (`issuing_txns`), so a webhook delivered twice never refunds twice. The fee is only refunded with the whole payment.
7. **Disputes** (`charge.dispute.created`) stop Spot's card, block the payer's card fingerprint, and show up on /admin.

Cart states: `open → paid → card_issued → completed`, plus `canceled`, `expired` (72h), `refunding` and `refunded`. Handoff carts go `open → completed` when the requester taps "I got the money". Transitions use a compare-and-set on the status column, so duplicate webhooks can't issue two cards or approve two charges.

**Refunds never race a charge.** A full refund first moves the cart to `refunding` (so any authorization arriving from then on is declined), then cancels the card, then refunds the payment. If Stripe fails midway, the cart stays `refunding`, and the sweeper retries every 5 minutes with the same idempotency key. A card cart Spot hasn't ordered within `SPOT_ORDER_DEADLINE_HOURS` (72) is refunded automatically.

## Order it for me

Once a cart is paid and its card exists, the requester can have Spot place the order.

- **UCP stores (no browser, no AI):** stores that publish a [Universal Commerce Protocol](https://ucp.dev) profile at `/.well-known/ucp` get their order through the store's own checkout API (`src/fulfill/ucp.js`), and this works even with `SPOT_AGENT` off. Spot acts as a UCP *platform*: its profile is at `/.well-known/ucp`, and every request names it in the `UCP-Agent` header.
  1. `POST /catalog/lookup` with each item's product URL, then pick the variant that matches the captured size or colour.
  2. `POST /checkout-sessions` with the items and the buyer.
  3. `PUT` the shipping address, then `PUT` again choosing the cheapest option for each package.
  4. The requester confirms the store's own total.
  5. Spot's card is fetched only now, after the confirm, and goes only to the store's card tokenizer (the shared UCP Tokenization API, bound to that checkout, over HTTPS).
  6. `POST …/complete` places the order, and the store returns its order id and link.

  If the store wants a person (`requires_escalation`, a 3-D Secure challenge, or no card tokenizer Spot can use), the order stops as "needs you": the requester can retry, and if Spot can't order it in time the payer is refunded. If the store's catalog doesn't know an item, Spot falls back to the routes below. UCP is still a draft spec, and this targets version `2026-08-25`.
- **Shopify stores (no AI):** `src/fulfill/shopify.js` reads the store's `/products/<handle>.js`, picks the variant that matches the captured size or colour, and builds a cart permalink with contact and shipping prefilled. Shopify doesn't let anyone pay on a store they don't own without a person or a browser on the payment step, so the agent (or the requester) does that part.
- **Checkout agent:** `src/fulfill/agent.js` runs Claude against a real Chromium page through a small tool set (`navigate`, `click`, `type`, `select`, `fill_payment`, `wait`, `ready_to_place_order`, `order_placed`, `need_human`). The page is described as text, with a ref for every interactive element, across iframes. Guardrails are enforced in code:
  - The model never sees the card. `fill_payment` fetches it at that moment and types it server-side, page snapshots mask payment fields and card-like numbers, and `type` refuses payment fields. The confirm screenshot the requester sees has card fields and payment iframes painted over (`CARD_FIELDS`). If a store checks the billing address, the agent uses Spot's (`SPOT_CARD_BILLING`).
  - Top-level pages must stay on the store's own site (plus Shopify checkout hosts). Anything else is undone.
  - The store's total must fit the card limit before the requester is asked.
  - Nothing is placed until the requester taps **Place order** on their page, which shows a screenshot of the filled-in checkout and the total. The agent pauses up to 10 minutes.
  - There are caps on steps and time. Whenever it's stuck (a CAPTCHA, a required login, out of stock), it stops as "needs you" for a retry. Nobody is ever handed the card.
- The requester page has the shipping form, live progress, the confirm step and the result. State is on `cart.fulfillment`. The browser session is in memory, so a restart mid-checkout ends that attempt.

## Accounts

Sign in at `/signin` with a 6-digit code, sent by email (Resend) or by text (Twilio). There are no passwords. This is the first option on the page, with an Email | Text switch. Texted codes end with a WebOTP line (`@host #code`), so phones can offer to autofill them. Numbers that replied STOP are refused. A text-only account has no email until one is added for receipts. **Continue with Google** and **Continue with Facebook** sit below it, and each appears once its keys are set. The Google and Facebook buttons use the standard authorization-code flow (Google with PKCE). The state rides in a signed, 10-minute cookie. Accounts are matched by the provider's user ID, then by a verified email, so every sign-in method with the same email reaches one account. When no email service is configured, test mode shows the code on screen.

**Passkeys (Face ID, Touch ID, Windows Hello).** After the first sign-in, you can add a passkey from `/account`. After that, the sign-in page offers it two ways: in the email box's autofill (conditional UI), and on a "Use Face ID or a passkey" button. Passkeys are discoverable, so there's no email to type first. Verification uses `@simplewebauthn/server`. Only the public key and signature counter are stored, and challenges are single use and expire after 5 minutes. A passkey only works on the domain it was made on, so ones made on the Railway address won't carry over to spotmeplease.com.

`/account` has five parts:
- **Ready for you:** carts and flights your AI handed back to you.
- **Your Spots:** every Spot you made, on any device. Spots made on a device before signing in are claimed with their private keys.
- **Saved details:** your name, shipping address and travelers, which pre-fill checkout.
- **Sign-in methods:** your email, your phone, connected Google or Facebook, and passkeys. Add or change an email or phone with a code sent to it. If that email or phone already had its own Spot account, which happens when you once signed in by text and once by email, the code proves you own both. The two accounts then merge into one: Spots, AI keys, sign-in methods, passkeys and open sessions move over, and blank profile fields are filled in. Link codes are tied to the signed-in account and can't be used to sign in.
- **Your AI:** API keys tied to the account, which you can connect or disconnect.

A signed-in owner opens their own Spots without the private key. Codes and sessions are stored hashed. The session cookie is `HttpOnly; SameSite=Lax`, and account writes are JSON-only.

## Notifications

`src/events.js` tells people when something happens. It uses email (Resend) and text (Twilio), with a branded email layout (`emailLayout` in `notify.js`).

| Event | Who | How |
|---|---|---|
| covered | requester | email + text |
| confirm_needed (tap Place order, 10 min) | requester | email + text |
| needs_you | requester | email |
| ordered | requester, and the payer (thank-you) | email |
| booked | traveler | email + text |
| booking_failed | traveler | email |
| ready (your account's AI handed you a cart and didn't send it) | account | email |

- **Who gets it:** the requester's account first, then the email or phone given on the cart.
- **Links:** they open the requester's private page with an HMAC signature. The secret is stored in the database, since the manage key is only kept hashed.
- **Sent once:** each message goes out once per cart (the `notices` table).
- **STOP:** texts skip numbers that replied STOP.
- **Never blocks:** sending never blocks or breaks the flow that triggered it.

## Backups

The database is one SQLite file on the Railway volume, so Spot backs itself up (`src/backup.js`).

- **Daily at 10:00 UTC** (`SPOT_BACKUP_HOUR_UTC`). It also runs right away if the last good backup is over 26 hours old, for example on the first boot.
- **A consistent copy while running:** `VACUUM INTO` makes the copy, then `PRAGMA integrity_check` checks it before it's kept, and the copy is gzipped.
- **Two places:**
  - The last 3 stay on the volume, in `backups/` next to the database, for a quick undo.
  - Each one is also uploaded to an S3-compatible bucket, off the volume. The bucket keeps every day for 30 days, then one per month for a year. The uploader is a tiny S3 client with Signature V4 (`src/s3.js`, checked against AWS's published examples), so there's no SDK.
- **Failures** retry hourly and email `SPOT_ALERT_EMAIL` (or `SPOT_CONTACT_EMAIL`), at most once a day.
- **/admin** shows the last good backup, its size and counts, whether it reached the bucket, and has **Back up now**.

**Restore:** set `SPOT_RESTORE_FROM` and redeploy. Before the database opens, Spot downloads and checks the backup, keeps the current file as `spot.db.before-restore-<time>`, and swaps the backup in. A marker stops it from restoring again on the next restart, but remove the variable afterwards. It takes one of:
- `latest`
- a backup name (`spot-2026-09-28T100000Z.db.gz`)
- `local:<name>`, for a copy on the volume

A backup that fails its check is refused, and the current database is left alone.

## Spot for AI agents (REST + MCP)

Shopping agents can build carts but can't make someone else pay. Spot gives them three verbs:

| MCP tool | REST | |
|---|---|---|
| `create_spot_ask` | `POST /v1/agent/asks` | items, or a url, or a description → pay link, share message, share-card URL, and (once only) the requester's private page |
| `get_spot_ask` | `GET /v1/agent/asks/:id` | status and the next step |
| `order_spot_ask` | `POST /v1/agent/asks/:id/order` | once paid, place the order at the store (the requester still confirms the final tap) |

### Rules, approvers and signed approvals

Keys made from an account (`POST /v1/me/keys`) follow that account's rules, set with `POST /v1/me/keys/:name/rules`:

```json
{ "max_order_cents": 7500, "monthly_cents": 20000, "stores": ["target.com"], "approver": "over_limit" }
```

`approver` is `never` (refuse), `over_limit` (send asks over a limit to the approver) or `always`. A store outside `stores` is always refused. Refusals are `403` with the reason. The approver is set with `POST /v1/me/approver {email, name}` and only counts once they agree from the email (`/approver/confirm`, a button, so link scanners can't agree for them). Routed asks become "someone else pays" carts shipped to the user, and `get_spot_ask` shows `sent_to_approver`.

Every yes (paying on Spot, paying the store, or tapping Place order) is recorded as a signed approval: a compact JWS (EdDSA) with the store, items, amount, who approved, how, and which AI asked. `get_spot_ask` returns `approvals` and `approval_url`; `GET /v1/approvals/:id` returns the JWS; `/approvals/:id` is the page people see. Keys: `/.well-known/spot-keys.json`. Spot also signs its requests to stores (UCP calls, product pages) with HTTP Message Signatures, `tag="web-bot-auth"`; keys at `/.well-known/http-message-signatures-directory`.

Each key's activity (asked, sent to approver, blocked, ordered, messages sent) is on the account page, with Disconnect.

### Your AI's card (fund your own AI)

An account saves its own card once (`/account#ai-card`, a Stripe SetupIntent;
the number goes to Stripe). Each AI key's rules then say how its asks for the
account holder get paid (`pay`):

- `link`: a link to pay, as before (the default).
- `tap`: Spot texts/emails "Approve $84 at Nike with your Visa •4242?". The
  signed-in owner taps Approve on the manage page
  (`POST /v1/carts/:token/manage/pay-saved`) and the saved card pays. Signed
  approval: `approved_by: requester, how: approved_saved_card`.
- `auto`: a separate opt-in on the account (`POST /v1/me/funding/auto
  { on: true, agree: true }`), and the key needs a `max_order_cents`. Inside
  the rules Spot charges the card off-session right away, and places the order
  without the final tap when the store's total is inside the card's cap.
  Signed approvals: `approved_by: rules`, `how: paid_by_rules`, then
  `placed_order`. A decline or a bank check falls back to `tap`.

Either way Spot buys with a single-use card capped at the order and locked to
the store, as for every Spot purchase. The kill switch (`POST /v1/me/ai/stop`)
refuses every ask from the account's AIs and cancels and refunds AI-paid
cards that haven't started ordering; `/v1/me/ai/resume` turns it back on. A
new card needs its own automatic opt-in; removing the card puts keys back on
links. The public explainer is `/agent-card`.

### Pay the store directly

`settle: "direct"` (MCP `pay_at_store`, on by default when the store's `/.well-known/ucp` offers checkout). The requester adds where it ships; then the payer taps Pay, Spot creates the store's checkout session (items, buyer email, ship-to, cheapest shipping) and redirects to its `continue_url`. Spot polls the session until it's `completed` and the cart completes with the store's order number. `GET /v1/stores/check?url=` tells the composer whether a store supports it.

### Multi-store asks (bundles)

One link and one payment for carts from 2–5 stores. `POST /v1/bundles {requester, note, for, stores: [{merchant, items, extras_cents}]}` (the composer's "+ Add a cart from another store", or `stores` on `create_spot_ask`) makes one ordinary card cart per store (`bundle_id`, `bundle_index`), all opened by the same private key, plus a bundle at `/b/:token`.

- **One payment:** the Stripe PaymentIntent is for the bundle's total. Each store's cart holds `"<payment>#<n>"` as its `payment_ref`, and refunds strip the suffix and always name that cart's amount, so one store's refund never touches another's share.
- **A card per store:** after payment each store's cart gets its own single-use card, locked to that store and amount, and is ordered, captured, refunded and deadlined on its own. If a store can't be ordered within 72h, only its share goes back.
- **Pages:** `/b/:token` (pay), `/b/:token/manage` (shipping once for every store, then each store's own page to confirm its order), `/b/:token/receipt` (per-store status and cancel whatever isn't ordered).
- **Limits:** the whole bundle is capped at `SPOT_MAX_CART_CENTS`; always paid on Spot (not handoff or pay-at-store); a dispute stops every store's card. Spending rules check every store against the key's allowlist and the total against its limits.

### Store button

`POST /v1/merchants {domain, name, email}` returns a publishable key and the snippet. `/embed/button.js` renders the button; on tap it posts the cart (`window.SpotCart()` or `data-items`) to `POST /v1/merchant/asks`, which only answers the store's own origins, and opens `/new?draft=…`. The store's items and prices are used when the cart is created; editing them drops the ✓. A file at `https://<domain>/.well-known/spot-merchant.txt` containing `spot-merchant=<id>` plus `POST /v1/merchants/verify` marks the store verified.

### Finish on your phone

An agent can also build a cart for its own user ("find me these flights") and hand it over to pay. Pass `for: "self"` (MCP: `for_me: true`) and you get back a private `finish_link`. Options:

- `ship_to`: prefill the shipping address
- `expires_minutes` (5–4320): how long the price is held; the page shows a countdown
- `notify: {email, phone}` (MCP: `send_to_email`, `send_to_phone`): Spot texts or emails the link. `delivered` reports `sent`, `failed`, `not_configured` or `bad_number` for each channel

The user opens the link, checks the address, and pays with Apple Pay, Google Pay or a card. The merchant-locked card issues, and if `SPOT_AGENT=on` the checkout agent starts the order by itself. The user still confirms the last tap.

### Flights (Duffel)

"Find me a flight to SFO on the 17th". The agent searches real fares, you pick one, and it sends you a link to finish on your phone.

| MCP tool | REST | |
|---|---|---|
| `search_flights` | `POST /v1/agent/flights/search` | origin, destination, dates, adults, cabin → a few offers (cheapest first plus the best nonstop), each with an `offer_id` |
| `create_flight_ask` | `POST /v1/agent/flights/asks` | holds one offer and returns a `finish_link`, which Spot can text or email |

On the finish page you add who's flying (names as on your ID, date of birth), plus an email and phone for the airline. Spot re-checks the fare. If the price moved, the page shows the new total before you're charged. Then you pay, and Spot books through Duffel and shows the confirmation code.

- **No card:** Spot pays the airline from its Duffel balance, so keep the balance topped up in the Duffel dashboard.
- **Live flights are off by default:** with a live Stripe key (`sk_live_`), `create_flight_ask` refuses unless `SPOT_FLIGHTS_LIVE=on`. Spot buying tickets for travelers makes it a seller of travel, so settle registration (or Duffel's customer-card method, where the airline is merchant of record) first.
- **If the airline refuses the booking,** you're refunded straight away.
- **The link only lives as long as the fare is held,** usually about 20–30 minutes.
- **Fares are USD only for now.**

Without `DUFFEL_ACCESS_TOKEN`, a demo airline ("Spot Air") returns made-up fares so you can try the flow. With a `duffel_test_…` token you get Duffel's test airline, and a `duffel_live_…` token books real tickets.

MCP is streamable HTTP at `POST /mcp` (stateless). To list it in MCP directories, see [docs/mcp-listing.md](docs/mcp-listing.md) and `server.json`. Going live step by step: [docs/go-live.md](docs/go-live.md). Both need `Authorization: Bearer <key>` from `SPOT_API_KEYS`. Each ask belongs to the agent that made it.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `PUBLIC_URL` | request host | Base for share links, e.g. `https://spotmeplease.com`. When set, page views on `www.` or the Railway domain redirect to it; API, MCP, webhook and `/health` requests are never redirected |
| `MCP_REGISTRY_AUTH` | | `v=MCPv1; k=ed25519; p=…`, served at `/.well-known/mcp-registry-auth` so the MCP Registry can verify the domain (see docs/mcp-listing.md) |
| `SPOT_DB` | `./data/spot.db` | SQLite file; put it on a volume |
| `SPOT_FEE_BPS` | `400` | Payer fee, basis points |
| `SPOT_FEE_FIXED_CENTS` | `0` | |
| `SPOT_MAX_CART_CENTS` | `50000` | Cap per link |
| `SPOT_EXPIRES_HOURS` | `72` | |
| `ANTHROPIC_API_KEY` | | Turns on screenshot capture |
| `SPOT_VISION_MODEL` | `claude-opus-5` | |
| `SPOT_AGENT` | off | `on` lets the checkout agent run (needs `ANTHROPIC_API_KEY`) |
| `SPOT_AGENT_MODEL` | `claude-opus-5` | |
| `SPOT_AGENT_MAX` | `2` | Checkouts running at once |
| `SPOT_API_KEYS` | | `name:secret,name2:secret2` for the agent API / MCP |
| `SPOT_OPEN_KEYS` | on | Self-serve agent keys from `/integrations#mcp` (`POST /v1/agent/keys`). Set `off` to allow only `SPOT_API_KEYS` |
| `SPOT_KEY_ASKS_PER_DAY` / `SPOT_KEY_MESSAGES_PER_DAY` / `SPOT_KEY_SEARCHES_PER_DAY` | `100` / `20` / `200` | Daily quotas for self-serve keys; `SPOT_API_KEYS` partners have none |
| `RESEND_API_KEY` | | Emails finish links |
| `SPOT_FROM_EMAIL` | `Spot <spot@resend.dev>` | From address (a domain verified in Resend) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` | | Texts finish links. Texts start with “Spot:” and end with “Reply STOP to opt out.” Set the number's incoming-message webhook to `POST /v1/webhooks/twilio` (signed), and Spot will never text a number that replied STOP |
| `DUFFEL_ACCESS_TOKEN` | | Turns on real flight search and booking (`duffel_test_…` or `duffel_live_…`) |
| `SPOT_MAX_FLIGHT_CENTS` | `200000` | Cap per flight |
| `SPOT_LEGAL_NAME` | `the Spot team` | Who runs Spot, named on `/terms` and `/privacy` |
| `SPOT_CONTACT_EMAIL` | `hello@spotmeplease.com` | Contact address on the legal pages |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Turns on "Continue with Google". Redirect URI: `<PUBLIC_URL>/auth/google/callback` |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | | Turns on "Continue with Facebook". Redirect URI: `<PUBLIC_URL>/auth/facebook/callback` |
| `BACKUP_S3_ENDPOINT` / `BACKUP_S3_BUCKET` / `BACKUP_S3_REGION` / `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | unset (volume only) | Where daily backups go. On Railway, reference the bucket's `ENDPOINT`, `BUCKET`, `REGION`, `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`. `BACKUP_S3_PATH_STYLE=1` for older buckets that need path-style URLs |
| `SPOT_BACKUP_HOUR_UTC` | `10` | Hour of the daily backup |
| `SPOT_ALERT_EMAIL` | `SPOT_CONTACT_EMAIL` | Who hears about failed backups |
| `SPOT_RESTORE_FROM` | unset | Restore at startup: `latest`, a backup name, or `local:<name>`. Remove it afterwards |
| `SPOT_SESSION_SECRET` | random per start | Signs the short sign-in cookie. Set it so a restart doesn't cancel sign-ins in progress |
| `SPOT_ADMIN_TOKEN` | | 16+ random characters. Turns on `/admin` (held payments, recent carts, block list, API keys, signups) |
| `SPOT_MAX_LINKS_PER_IP_DAY` | `30` | Links one network can make per day |
| `SPOT_MAX_PAYMENTS_PER_CARD_DAY` / `SPOT_MAX_CARD_CENTS_DAY` | `3` / `100000` | One card paying more Spots, or more money, in 24h is held for review |
| `SPOT_MAX_RECEIVED_CENTS_DAY` | `150000` | One requester receiving more than this in 24h is held |
| `SPOT_FIRST_PAYMENT_HOLD_CENTS` | `40000` | A card's first payment above this is held (not for "for me" carts) |
| `STRIPE_SECRET_KEY` | | Turns on Stripe mode |
| `STRIPE_PUBLISHABLE_KEY` | | For the pay page |
| `STRIPE_WEBHOOK_SECRET` | | Webhook endpoint: `POST /v1/webhooks/stripe`, events `payment_intent.succeeded`, `payment_intent.amount_capturable_updated`, `issuing_authorization.request`, `issuing_authorization.updated`, `issuing_transaction.created` and `charge.dispute.created` |
| `STRIPE_ISSUING_CARDHOLDER` | | Spot's own company cardholder (`ich_…`), made once in the Stripe dashboard. Every card is issued to it |
| `SPOT_CARD_BILLING` | | The company cardholder's billing address as `line1|city|state|zip`, used when a store checks it |
| `SPOT_ORDER_DEADLINE_HOURS` | `72` | A paid card cart Spot hasn't ordered by then is refunded in full |
| `SPOT_FLIGHTS_LIVE` | off | With a live Stripe key, flights are refused unless this is `on` |
| `SPOT_APPROVAL_KEY` | made on first start | Ed25519 private key (PKCS#8 PEM) for signed approvals. Set it to pin the key across database restores |
| `SPOT_REQUEST_KEY` | made on first start | Ed25519 private key (PKCS#8 PEM) for signing requests to stores |

The payer's name comes from their Apple Pay / Google Pay / card details, and the pay page shows wallet buttons first.

## What's verified and what isn't

- **Verified:** 115+ tests (`npm test`) cover multi-store asks (one payment, a card per store, per-store refunds, disputes, the AI path),  paying the store directly (against a fake UCP store), spending rules and approver routing, signed approvals and request signatures, the store button's origin check and domain verification, and cover validation, fees and the cushion, the state machine, merchant matching, blocked categories, gift-card rules, authorization limits, the refund race, captures, partial refunds, returns, reversals, disputes, the payer cancel link, the order deadline, screenshot masking, link and screenshot parsing, SSRF blocking, and full HTTP flows for the card, handoff, expiry, cancel, refund and failed-issue-retry paths. The Stripe webhook routes are tested with a fake Stripe provider. The full requester → payer → card → checkout loop was clicked through in headless Chromium in sandbox mode.
- **Not yet run against real Stripe.** The Stripe provider is written against the documented API but hasn't been run with test keys. Issuing also has to be enabled on the Stripe account, which is an application process.
- **Before live money:**
  - Counsel's sign-off that Spot as the seller isn't money transmission where it launches, a sales-tax view on reselling, and Stripe's approval of the Issuing use case (Spot's own cards to buy what customers bought from Spot).
  - PCI DSS: Spot's checkout handles its own card number in server memory (fetched at the payment step, never logged or stored, masked in screenshots), which is in PCI scope. Get an assessor's view (likely SAQ D).
  - Move the manage key out of the URL into a login or magic link.
  - Add KYC on requesters and a payout hold for new accounts.
  - Move to Postgres once there's more than one instance.

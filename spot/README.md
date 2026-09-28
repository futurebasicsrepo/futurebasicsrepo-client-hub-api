# Spot

**Your cart, anywhere. Someone else's tap.**

Spot turns any shopping cart into a link. Whoever opens the link covers it in one tap. The money goes onto a one-time virtual card that only works at that store, for that amount, so it can't be cashed out. If the requester just wants money straight to them, the link can send the payer to Venmo or Cash App instead.

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
  src/agentapi.js   REST + MCP API for other AI agents
```

## Run it

```bash
cd spot
npm install
npm start          # http://localhost:3000, sandbox mode
npm test
```

With no Stripe keys set, Spot runs in **sandbox mode**. Payment is a "Pay (test)" button, the card is a fake Visa number, and the requester page has a "Test checkout" box that simulates the store charging the card. That's enough to demo the full loop on two phones.

## How it works

1. **Capture: one box.** Paste a link or any shared text that has a link in it, drop or paste a screenshot, or just say what you want ("black Salomon XT-6 in 10.5"). Links are read from JSON-LD `Product` data, then Open Graph / `product:price` tags. Screenshots are read by Claude with a JSON schema. Descriptions are looked up by Claude with web search; with no API key they become an editable item. If a link was read confidently (every price found, store known) and the requester is known on this device, Spot skips the review step and goes straight to Send. Everything else gets a quick check first. The "Spot this" bookmarklet, `/new?url=` and `/new?text=` all feed the same box.
   **Sending:** one Send button (the phone's share sheet with the message already written), "Ask Mom"-style buttons for saved people (a text message already written; Android can pick from contacts), plus Text, WhatsApp and Copy. The requester's name, payout handles, favourite people and their recent Spots ("My Spots") are remembered in `localStorage` on that device. A link can be edited until someone starts paying, and the share card redraws.
2. **Share.** When the link (`/c/<12 chars>`) is pasted into iMessage, WhatsApp, Slack, Discord or X, it shows a share card drawn for that cart (`/c/<token>/card.png`, 1200×630 PNG, `src/sharecard.js`). The card has Spot the mascot asking "psst… can you spot Kyle?", the item, the store and the price. It redraws to "Mom spotted Kyle!" with a happy mascot once the cart is paid. The pay page is a short chat from Spot, not a form. The mascot's eyes follow the pointer, and paying ends in confetti.
3. **Pay.** Stripe Payment Element: Apple Pay, Google Pay or card. The payer pays the cart plus a 4% fee.
4. **Card.** When `payment_intent.succeeded` arrives, Spot issues a Stripe Issuing virtual card. The requester's private page shows it.
5. **Merchant lock.** Every charge on the card hits the `issuing_authorization.request` webhook. Spot approves it only if the card is unused, the merchant name or URL matches the cart's store, and the amount is within the cart total plus 5% (max $15) for tax drift. The card also carries a Stripe `all_time` spending limit as a backstop if the webhook is down. The first approved charge completes the cart, and every later charge is declined.

Cart states: `open → paid → card_issued → completed`, plus `canceled`, `expired` (72h) and `refunded`. Handoff carts go `open → completed` when the requester taps "I got the money". Transitions use a compare-and-set on the status column, so duplicate webhooks can't issue two cards or approve two charges.

## Order it for me

Once a cart is paid and its card exists, the requester can have Spot place the order.

- **UCP stores (no browser, no AI):** stores that publish a [Universal Commerce Protocol](https://ucp.dev) profile at `/.well-known/ucp` get their order through the store's own checkout API (`src/fulfill/ucp.js`), and this works even with `SPOT_AGENT` off. Spot acts as a UCP *platform*: its profile is at `/.well-known/ucp`, and every request names it in the `UCP-Agent` header.
  1. `POST /catalog/lookup` with each item's product URL, then pick the variant that matches the captured size or colour.
  2. `POST /checkout-sessions` with the items and the buyer.
  3. `PUT` the shipping address, then `PUT` again choosing the cheapest option for each package.
  4. The requester confirms the store's own total.
  5. The one-time card goes only to the store's card tokenizer (the shared UCP Tokenization API, bound to that checkout).
  6. `POST …/complete` places the order, and the store returns its order id and link.

  If the store wants a person (`requires_escalation`, a 3-D Secure challenge, or no card tokenizer Spot can use), the requester gets the store's `continue_url`: its checkout with the cart and address already filled in. If the store's catalog doesn't know an item, Spot falls back to the routes below. UCP is still a draft spec, and this targets version `2026-08-25`.
- **Shopify stores (no AI):** `src/fulfill/shopify.js` reads the store's `/products/<handle>.js`, picks the variant that matches the captured size or colour, and builds a cart permalink with contact and shipping prefilled. Shopify doesn't let anyone pay on a store they don't own without a person or a browser on the payment step, so the agent (or the requester) does that part.
- **Checkout agent:** `src/fulfill/agent.js` runs Claude against a real Chromium page through a small tool set (`navigate`, `click`, `type`, `select`, `fill_payment`, `wait`, `ready_to_place_order`, `order_placed`, `need_human`). The page is described as text, with a ref for every interactive element, across iframes. Guardrails are enforced in code:
  - The model never sees the card. `fill_payment` types it server-side, page snapshots mask payment fields and card-like numbers, and `type` refuses payment fields.
  - Top-level pages must stay on the store's own site (plus Shopify checkout hosts). Anything else is undone.
  - The store's total must fit the card limit before the requester is asked.
  - Nothing is placed until the requester taps **Place order** on their page, which shows a screenshot of the filled-in checkout and the total. The agent pauses up to 10 minutes.
  - There are caps on steps and time. Whenever it's stuck (a CAPTCHA, a required login, out of stock), it hands back to the requester with a prefilled checkout link and the card.
- The requester page has the shipping form, live progress, the confirm step and the result. State is on `cart.fulfillment`. The browser session is in memory, so a restart mid-checkout ends that attempt.

## Accounts

Sign in at `/signin` with a 6-digit code, sent by email (Resend) or by text (Twilio). There are no passwords. This is the first option on the page, with an Email | Text switch. Texted codes end with a WebOTP line (`@host #code`), so phones can offer to autofill them. Numbers that replied STOP are refused. A text-only account has no email until one is added for receipts. **Continue with Google** and **Continue with Facebook** sit below it, and each appears once its keys are set. The Google and Facebook buttons use the standard authorization-code flow (Google with PKCE). The state rides in a signed, 10-minute cookie. Accounts are matched by the provider's user ID, then by a verified email, so every sign-in method with the same email reaches one account. When no email service is configured, test mode shows the code on screen. `/account` has four parts:
- **Ready for you:** carts and flights your AI handed back to you.
- **Your Spots:** every Spot you made, on any device. Spots made on a device before signing in are claimed with their private keys.
- **Saved details:** your name, shipping address and travelers, which pre-fill checkout.
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

## Spot for AI agents (REST + MCP)

Shopping agents can build carts but can't make someone else pay. Spot gives them three verbs:

| MCP tool | REST | |
|---|---|---|
| `create_spot_ask` | `POST /v1/agent/asks` | items, or a url, or a description → pay link, share message, share-card URL, and (once only) the requester's private page |
| `get_spot_ask` | `GET /v1/agent/asks/:id` | status and the next step |
| `order_spot_ask` | `POST /v1/agent/asks/:id/order` | once paid, place the order at the store (the requester still confirms the final tap) |

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

- **No one-time card:** Spot pays the airline from its Duffel balance, so keep the balance topped up in the Duffel dashboard.
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
| `SPOT_SESSION_SECRET` | random per start | Signs the short sign-in cookie. Set it so a restart doesn't cancel sign-ins in progress |
| `SPOT_ADMIN_TOKEN` | | 16+ random characters. Turns on `/admin` (held payments, recent carts, block list, API keys, signups) |
| `SPOT_MAX_LINKS_PER_IP_DAY` | `30` | Links one network can make per day |
| `SPOT_MAX_PAYMENTS_PER_CARD_DAY` / `SPOT_MAX_CARD_CENTS_DAY` | `3` / `100000` | One card paying more Spots, or more money, in 24h is held for review |
| `SPOT_MAX_RECEIVED_CENTS_DAY` | `150000` | One requester receiving more than this in 24h is held |
| `SPOT_FIRST_PAYMENT_HOLD_CENTS` | `40000` | A card's first payment above this is held (not for "for me" carts) |
| `STRIPE_SECRET_KEY` | | Turns on Stripe mode |
| `STRIPE_PUBLISHABLE_KEY` | | For the pay page |
| `STRIPE_WEBHOOK_SECRET` | | Webhook endpoint: `POST /v1/webhooks/stripe`, events `payment_intent.succeeded` and `issuing_authorization.request` |

In Stripe mode, the card needs the requester's billing address (Issuing cardholders require one). Making a link never asks for it: once someone pays, the requester's page asks for it and the card issues right away. The payer's name comes from their Apple Pay / Google Pay / card details, and the pay page shows wallet buttons first.

## What's verified and what isn't

- **Verified:** 22 tests (`npm test`) cover validation, fees, the state machine, merchant matching, authorization limits, link and screenshot parsing, SSRF blocking, and full HTTP flows for the card, handoff, expiry, cancel, refund and failed-issue-retry paths. The Stripe webhook routes are tested with a fake Stripe provider. The full requester → payer → card → checkout loop was clicked through in headless Chromium in sandbox mode.
- **Not yet run against real Stripe.** The Stripe provider is written against the documented API but hasn't been run with test keys. Issuing also has to be enabled on the Stripe account, which is an application process.
- **Before live money:**
  - Show card numbers with Stripe Issuing Elements, not `expand: ['number']`, which is test-mode only.
  - Move the manage key out of the URL into a login or magic link.
  - Add KYC on requesters and a payout hold for new accounts.
  - Move to Postgres once there's more than one instance.

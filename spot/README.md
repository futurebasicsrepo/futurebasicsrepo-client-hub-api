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

- **Shopify stores (no AI):** `src/fulfill/shopify.js` reads the store's `/products/<handle>.js`, picks the variant that matches the captured size or colour, and builds a cart permalink with contact and shipping prefilled. Shopify doesn't let anyone pay on a store they don't own without a person or a browser on the payment step, so the agent (or the requester) does that part.
- **Checkout agent:** `src/fulfill/agent.js` runs Claude against a real Chromium page through a small tool set (`navigate`, `click`, `type`, `select`, `fill_payment`, `wait`, `ready_to_place_order`, `order_placed`, `need_human`). The page is described as text, with a ref for every interactive element, across iframes. Guardrails are enforced in code:
  - The model never sees the card. `fill_payment` types it server-side, page snapshots mask payment fields and card-like numbers, and `type` refuses payment fields.
  - Top-level pages must stay on the store's own site (plus Shopify checkout hosts). Anything else is undone.
  - The store's total must fit the card limit before the requester is asked.
  - Nothing is placed until the requester taps **Place order** on their page, which shows a screenshot of the filled-in checkout and the total. The agent pauses up to 10 minutes.
  - There are caps on steps and time. Whenever it's stuck (a CAPTCHA, a required login, out of stock), it hands back to the requester with a prefilled checkout link and the card.
- The requester page has the shipping form, live progress, the confirm step and the result. State is on `cart.fulfillment`. The browser session is in memory, so a restart mid-checkout ends that attempt.

## Spot for AI agents (REST + MCP)

Shopping agents can build carts but can't make someone else pay. Spot gives them three verbs:

| MCP tool | REST | |
|---|---|---|
| `create_spot_ask` | `POST /v1/agent/asks` | items, or a url, or a description → pay link, share message, share-card URL, and (once only) the requester's private page |
| `get_spot_ask` | `GET /v1/agent/asks/:id` | status and the next step |
| `order_spot_ask` | `POST /v1/agent/asks/:id/order` | once paid, place the order at the store (the requester still confirms the final tap) |

MCP is streamable HTTP at `POST /mcp` (stateless). Both need `Authorization: Bearer <key>` from `SPOT_API_KEYS`. Each ask belongs to the agent that made it.

## Configuration

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | |
| `PUBLIC_URL` | request host | Base for share links, e.g. `https://spot.example` |
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

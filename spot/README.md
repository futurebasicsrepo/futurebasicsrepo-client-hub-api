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
  src/pages.js      the three pages: create, pay, requester
  src/sharecard.js  link-preview image + the mascot (satori → resvg)
  src/db.js         Node's built-in SQLite
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

1. **Capture.** Paste a product or cart link, upload a screenshot, or type items. The "Spot this" bookmarklet on the home page sends whatever page you're on straight into capture. Links are read from JSON-LD `Product` data, then Open Graph / `product:price` tags. Screenshots are read by Claude with a JSON schema. Either way the requester reviews every line before a link exists.
2. **Share.** When the link (`/c/<12 chars>`) is pasted into iMessage, WhatsApp, Slack, Discord or X, it shows a share card drawn for that cart (`/c/<token>/card.png`, 1200×630 PNG, `src/sharecard.js`). The card has Spot the mascot asking "psst… can you spot Kyle?", the item, the store and the price. It redraws to "Mom spotted Kyle!" with a happy mascot once the cart is paid. The pay page is a short chat from Spot, not a form. The mascot's eyes follow the pointer, and paying ends in confetti.
3. **Pay.** Stripe Payment Element: Apple Pay, Google Pay or card. The payer pays the cart plus a 4% fee.
4. **Card.** When `payment_intent.succeeded` arrives, Spot issues a Stripe Issuing virtual card. The requester's private page shows it.
5. **Merchant lock.** Every charge on the card hits the `issuing_authorization.request` webhook. Spot approves it only if the card is unused, the merchant name or URL matches the cart's store, and the amount is within the cart total plus 5% (max $15) for tax drift. The card also carries a Stripe `all_time` spending limit as a backstop if the webhook is down. The first approved charge completes the cart, and every later charge is declined.

Cart states: `open → paid → card_issued → completed`, plus `canceled`, `expired` (72h) and `refunded`. Handoff carts go `open → completed` when the requester taps "I got the money". Transitions use a compare-and-set on the status column, so duplicate webhooks can't issue two cards or approve two charges.

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
| `STRIPE_SECRET_KEY` | | Turns on Stripe mode |
| `STRIPE_PUBLISHABLE_KEY` | | For the pay page |
| `STRIPE_WEBHOOK_SECRET` | | Webhook endpoint: `POST /v1/webhooks/stripe`, events `payment_intent.succeeded` and `issuing_authorization.request` |

In Stripe mode, card carts need the requester's billing address, which is required to create an Issuing cardholder. The create page asks for it.

## What's verified and what isn't

- **Verified:** 22 tests (`npm test`) cover validation, fees, the state machine, merchant matching, authorization limits, link and screenshot parsing, SSRF blocking, and full HTTP flows for the card, handoff, expiry, cancel, refund and failed-issue-retry paths. The Stripe webhook routes are tested with a fake Stripe provider. The full requester → payer → card → checkout loop was clicked through in headless Chromium in sandbox mode.
- **Not yet run against real Stripe.** The Stripe provider is written against the documented API but hasn't been run with test keys. Issuing also has to be enabled on the Stripe account, which is an application process.
- **Before live money:**
  - Show card numbers with Stripe Issuing Elements, not `expand: ['number']`, which is test-mode only.
  - Move the manage key out of the URL into a login or magic link.
  - Add KYC on requesters and a payout hold for new accounts.
  - Move to Postgres once there's more than one instance.

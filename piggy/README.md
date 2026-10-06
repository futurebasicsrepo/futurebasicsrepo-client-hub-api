# Piggy: tap to give

You tap your phone on a piggy bank, tip jar or collection plate. You pick $1, $3, $5 or another amount, then pay with Apple Pay or Google Pay. The jar's backlit display goes up as soon as the payment clears. The payer doesn't install an app.

## Architecture

```
 ┌──────────── the jar ────────────┐          ┌──────────── phone ────────────┐
 │ NTAG215 NFC sticker + QR code   │   tap    │ Safari / Chrome opens         │
 │   https://<host>/j/<slug>       │ ───────▶ │   /j/<slug>                   │
 │                                 │          │ $1 · $3 · $5 · Other          │
 │ ESP32-C3 + Wi-Fi                │          │ Apple Pay / Google Pay button │
 │ amber LED / e-ink on the bottom │          │ (Stripe Express Checkout)     │
 └──────────────┬──────────────────┘          └───────────────┬───────────────┘
                │ GET /api/device/<slug>                      │ POST /api/jars/<slug>/intents
                │ x-device-key (every ~10s,                   │ stripe.confirmPayment()
                │ or long-poll / MQTT later)                  │ POST /api/payments/<pi>/sync
                ▼                                             ▼
        ┌──────────────────────── piggy (this service, Railway) ───────────────────────┐
        │ Node 22 http server · SQLite on a /data volume · in-process event bus (SSE)   │
        │ jars(slug, kind, presets, goal, balance, device_key) · payments(pi id, amount)│
        └──────────────────────────────────────┬────────────────────────────────────────┘
                                               │ PaymentIntents, webhooks,
                                               ▼ payment method domains
                                            Stripe
```

**Why it's built this way**

- **Tag = URL, nothing else.** iPhones (XS and later) and Android phones read an NDEF URL tag in the background with no app. A $0.20 NTAG215 sticker inside the shell works, and so does a QR code printed on the bottom for older phones. The tag holds no secrets, so if someone clones it, it can only send money to the same jar.
- **The wallet button comes from Stripe's Express Checkout Element in deferred-intent mode.** The Apple Pay or Google Pay button renders as soon as the page loads, before any PaymentIntent exists. Its amount follows the chip you pick. The intent is created on the server only when you confirm, so abandoned taps leave no orphan intents.
- **The server decides the amount.** It records `amount_received` from Stripe, not what the browser claims. Each PaymentIntent id is credited once, whichever arrives first: the webhook or the browser's `/sync` call.
- **The hardware stays simple.** The microcontroller only reads its balance with a per-device key. It never touches payments, so the device needs no PCI scope and no secure element.
- **Apple Pay domains register themselves.** On boot the server registers `PUBLIC_URL` with Stripe (`paymentMethodDomains`). If Stripe asks for the verification file, it is served from `APPLE_PAY_DOMAIN_ASSOCIATION`.

**Money flow by use case**

| Device | Who gets the money | Stripe setup for production |
| --- | --- | --- |
| Piggy bank | The child's savings account | Connect: a custodial account per family, with transfers to a partner bank (Unit, Treasury Prime) or payouts to the parent's bank |
| Tip jar | The business or its staff | Connect Express account per venue, with `transfer_data.destination` on the intent |
| Collection plate | The church | The church's own Stripe account (direct charges) and Stripe's nonprofit pricing |

Fees matter at $1: Stripe's 2.9% + 30¢ takes 33¢ of a $1 tap. Options include a "cover the fee" toggle, a $3 default, nonprofit rates for churches, or batching small amounts.

## Running it

```
npm install
npm run dev          # http://localhost:3000, demo mode
npm test
```

Without Stripe keys the app runs in **demo mode**: the pages are the same, and a "simulate" button stands in for the wallet.

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` | Turn on real Apple Pay / Google Pay (test keys work) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `POST /webhooks/stripe` (`payment_intent.succeeded`) |
| `PUBLIC_URL` | e.g. `https://piggy.up.railway.app`, registered with Stripe for wallets on boot |
| `APPLE_PAY_DOMAIN_ASSOCIATION` | Contents of Apple's verification file, if Stripe asks you to host one |
| `ADMIN_TOKEN` | Bearer token for `POST /api/jars` (provisioning a new device) |
| `MIN_CENTS`, `MAX_CENTS` | Amount limits (default $1 to $500) |
| `PIGGY_DB` | SQLite path (default `/data/piggy.db` in Docker) |

## The fun part

- Each jar has a mascot: a pig, a glass tip jar, or a plain wooden plate for churches. The pig and the jar react to the amount picked: a smile for $1, a grin for $3, star eyes for $5, heart eyes for $10 and up. Their eyes follow your finger.
- When the payment goes through, the screen floods with colour from the pay button. A coin flies into the mascot's slot, then there's a burst of coins and confetti, and it rains coins at $5 and up. The balance counts up like a cash register, and crossing 25, 50, 75 or 100% of a goal sets off fireworks and a banner.
- Sound is synthesised in the browser with no audio files. It's on for piggy banks and tip jars and off by default for plates, with a mute toggle. Android phones also vibrate.
- The payer can send one emoji cheer, which floats up on the jar's live display. The success screen also says how many tips or deposits came in today.
- The plate stays calm: a soft glow, rising sparks and a chime instead of confetti.
- With reduced motion turned on, the big effects are skipped.

The motion and sound kit is `public/fun.js`, which has no dependencies.

## Endpoints

- `GET /j/:slug`: tap page (the URL written to the NFC tag)
- `GET /d/:slug`: browser stand-in for the backlit bottom display, live over SSE
- `GET /api/jars/:slug`, `GET /api/jars/:slug/stream` (SSE)
- `GET /api/device/:slug` with `x-device-key`: balance for the hardware
- `POST /api/jars/:slug/intents` `{ amount_cents }` returns `{ id, client_secret }`
- `POST /api/payments/:pi/sync`: look up a confirmed intent and credit it
- `POST /api/jars/:slug/demo-pay` `{ amount_cents }`: demo mode only
- `POST /api/jars/:slug/cheer` `{ payment_id, cheer }`: one emoji per payment, from that jar's own set; it pops up on the display
- `POST /webhooks/stripe`
- `POST /api/jars` (admin) `{ slug, kind: piggy|tip|plate, name, owner?, tagline?, presets?, goal_cents? }` returns `{ device_key, tag_url }`

## Provisioning a device

1. `POST /api/jars` to get a `device_key` and a `tag_url`.
2. Write `tag_url` to the NFC sticker as an NDEF URI record (NXP TagWriter or `nfc-tools`), then lock it.
3. Print the same URL as a QR code on the bottom.
4. Flash the ESP32 with Wi-Fi credentials, the slug and the `device_key`. Use BLE or a captive portal to set up Wi-Fi at the customer's home.

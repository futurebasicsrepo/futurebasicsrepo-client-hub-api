# Modish Nail Spa concept site: "Polished, with a pour."

A rebuilt site for Modish Nail Spa (modishnailspaphiladelphia.com), with spas in Roxborough (7126 Ridge Ave) and Conshohocken (34 Ridge Pike). It is also Future Basics' showcase for salons and spas. The pitch: **book the chair, bring them back.** The website sells the experience, and the system behind it keeps chairs full.

Static HTML, CSS and JS with no build step to deploy. It is served on Railway by Caddy (`Dockerfile`, `Caddyfile`).

## Pages

| Path | What it does |
| --- | --- |
| `/` | Campaign hero with live open/closed status and walk-in wait, signature services you can add to your visit, a lookbook with "Book this look", the complimentary-drinks story, the clean promise, a remote walk-in waitlist, both spas with today's hours, gift cards and an FAQ |
| `/menu/` | The salon's full published price list (8 categories). Search, category filters and a **+** on every item to build a visit |
| `/book/` | Booking: spa → services (with quick add-ons) → technician → day and time (slots fit the visit's length; Sundays closed) → details. Shows a running total and time, ends with a real `.ics` add-to-calendar file and directions |
| `/looks/` | 11 real sets from their gallery, each mapped to the exact services it takes (for example, Pearl cat eye = gel manicure + cat eye + shape = $50). "Book this look" fills in the visit |
| `/gift-cards/` | E-gift builder: amount, design, suggested treat, message and delivery, with a live card preview |
| `/parties/` | Bridal, birthday and shower group requests |
| `/nail-salon-roxborough/` | Local search page for 19128 with NailSalon schema |
| `/owner/` | **Salon console (sales demo):** today's book, the walk-in queue with one-tap "chair ready" texts, fill reminders (gel 2–3 weeks, dip 3–4, acrylic fills), slow-hour fill (heat map plus an offer text that books empty afternoon chairs), review requests that route unhappy guests to the manager, gift cards and parties |

Shared on every page:
- **The visit tray.** Services you add follow you between pages, with a running total and time.
- **"Ask Modish".** A chat that quotes real prices for any service you name ("how much is a deluxe pedicure" → $43, about 50 min), plus wait times, hours, drinks, cleanliness, gift cards and parties.

**Demo loop:** anything done on the public site (a booking, the waitlist, a gift card, a party request) is stored in that browser and appears in `/owner/` marked "You, just now".

## What's real and what's illustrative

**Real**, from their site:
- Prices for every service
- Both addresses, the phone and email
- Hours (Mon–Sat 9:30–7, Sunday closed)
- Complimentary wine, beer and soft drinks
- Their cleanliness practices
- GoCheckin as the current booking system
- Their Google, Yelp and Facebook links
- The gallery photos (cropped out of their branded frames) and the salon interiors

**Illustrative** (confirm or replace before launch):
- Service durations
- Walk-in wait estimates and booking availability
- All console data
- The suggested treat prices on gift cards
- That Conshohocken keeps the same hours (their site lists one set)
- "21+ for alcohol" wording

**Not invented:** reviews and ratings. The site links out to Google, Yelp and Facebook. The console's review replies are labeled as samples, and technicians are shown as "Requested tech", not by name.

## Taking it live

- **Booking:** connect to the salon's appointment system (they use GoCheckin today, booking ID 7801) or its replacement. Bookings, waitlist entries and party requests then post there and text confirmations.
- **Walk-in wait:** read the live check-in queue.
- **Texts** (waitlist, reminders, fill reminders, slow-hour offers, review asks): send through an SMS provider with TCPA consent, which the forms already collect. Include STOP handling and a per-guest frequency cap.
- **Gift cards:** take payment through the salon's processor (Square, Stripe or their POS) and redeem by code at the desk.

## Design

- **Type:** Bodoni Moda (display), a fashion-magazine serif that echoes the gold MODISH logo. Jost (text) echoes the logo's spaced "NAIL SPA".
- **Color:** espresso, bone and logo gold, with a blush nude.
- **Signature shape:** the **arch**, taken from the salon's own archways (see the interior photos).
- **Motion:** arches rise on load, a lookbook marquee, the visit tray, and a hamburger menu that folds into an X and turns. All of it is off under `prefers-reduced-motion`.

## Editing

Pages are plain HTML. The shared header and footer live in `build.mjs` between `<!--md:header-->` / `<!--md:footer-->` markers. Prices, looks, hours and locations live in `assets/site.js` (`MENU`, `LOOKS`, `MODISH`). After editing, run:

```
node sites/modish/build.mjs
```

The build also fingerprints CSS/JS links (`site.css?v=…`), so browsers always load the latest files.

## Hosting

Railway service with root directory `/sites/modish`. Caddy serves pages, CSS and JS as `no-cache` (revalidated by ETag) and caches images for a day. The preview sends `X-Robots-Tag: noindex` and a disallow-all `robots.txt`, so the concept never competes with the salon's real site in search. `README.md`, `build.mjs` and the hosting files are never served.

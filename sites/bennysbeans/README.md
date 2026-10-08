# Benny's Beans concept site: "Roasted after you order."

A rebuilt site for Benny's Beans · Russian River Roastery (russianriverroastery.com), a one-person small-batch roaster in Guerneville, CA (est. 2023). It is also Future Basics' showcase for coffee businesses. The pitch: **the freshest coffee in the country, and a system that makes two roast days a week run themselves.**

Their current site is a Hostinger AI-builder template with a "LOGO" placeholder and stock photos. The business underneath it is strong: roasted to order, real reviews, two farmers markets, will-call pickup, wholesale and subscriptions. This concept puts that business on the page.

Design is inspired by Jimmy Butler's **Bigface Coffee**: confident minimalism, oversized expanded type, pill shapes, lots of bone-white space and one big mark. Here the mark is Benny's own coffee-ring stamp from his kraft bags.

Static HTML, CSS and JS with no build step to deploy. It is served on Railway by Caddy (`Dockerfile`, `Caddyfile`).

## Pages

| Path | What it does |
| --- | --- |
| `/` | Campaign hero with a live roast clock (next roast, cutoff countdown, ship date), "four days from green to your mug" timeline with real dates, filterable lineup of all 7 coffees, subscription mini-builder, where Benny is this week (will-call and markets, with "at the market now" status), his real reviews, wholesale and an FAQ |
| `/shop/` | The full catalog: filter by flavor, caffeine and brew method, sort, sampler bundle, 5 lb value callout, coasters, roast-level and grind guides |
| `/coffee/?c=<id>` | Product page for each coffee: size, roast (with Benny's recommended range), grind, live "roasts on / ships on / arrives" block, a roast slider that shows how the cup changes, brew methods and pairings |
| `/checkout/` | Ship, will-call at True Value or farmers-market pickup, roast-date stamp, SMS opt-in, subscription upsell. Confirmation shows the roast → ship → arrive timeline and a real `.ics` file |
| `/subscribe/` | Subscription builder (Benny's pick, light or dark rotation, or a fixed coffee; 1, 2 or 5 lb; weekly to monthly; ship or pickup), a cups-per-day helper, the next four roast dates, and a preview of the subscriber's manage view (skip, swap, pause, text SKIP) |
| `/brew/` | "Find your bean" quiz, brew-ratio calculator, a step-by-step brew timer, method guides, roast-date freshness and arabica vs. robusta explainers |
| `/find-us/` | Markets and will-call, a two-week roast, ship and market calendar, and market pre-orders (reserve now, pay at the booth) with a pickup code and calendar file |
| `/wholesale/` | Cafés, restaurants, offices and vacation rentals. Pricing calculator, the rental welcome-bag program (with a live co-branded card mock), sample request and a quote form |
| `/gifts/` | E-gift card builder with live preview, gift subscriptions, coasters and quick-pick bags |
| `/story/` | Benny in his own words, how a bag is made (source, roast, cool, grind, ship), the shade-grown Indian estates, Roaster's Choice |
| `/coffee-roaster-guerneville/` | Local search page for Guerneville and the lower Russian River, with Store and FAQPage schema |
| `/roaster/` | **Roaster console (sales demo):** see below |

Shared on every page:
- **The bag.** A cart drawer with a free-shipping meter ($60), a coaster upsell when you're close and a "roasts Monday, ships Tuesday" note.
- **"Ask Benny".** A chat that knows the lineup, prices, roast days, shipping, pickup, markets, subscriptions and wholesale, recommends coffees ("something strong", "for espresso", "decaf") and can add a bag.
- **Every coffee is drawn as its bag.** `BB.bag()` renders a kraft bag with the coffee's colored label and the real coffee-ring stamp, so product imagery is consistent without a photo shoot.

**Demo loop:** anything done on the public site (an order, a subscription, a market pre-order, a sample or wholesale request, a gift card, a quiz result) is stored in that browser and appears in `/roaster/` marked "You, just now".

## The roaster console

The operations side for a one-person roaster that sells online, by subscription, at two markets, at will-call and wholesale:
- **Roast day:** every order due on the next roast (web, subscriptions, market pre-orders, wholesale standing orders) rolled into a batch plan by coffee and roast level, with green coffee needed after roast loss, batches by roaster capacity, a roast schedule, grind and pack list, printable bag labels, ship list, will-call shelf and market box.
- **Orders, subscriptions** (MRR, renewals, churn risk), **green coffee inventory** (weeks of cover, reorder alerts, cost and margin per bag), **markets** (what to bring, sales log), **wholesale** (accounts, standing orders, invoices, samples), and **customers and texts** (who's running low, reorder nudges, review requests, new-coffee broadcasts).

## What's real and what's illustrative

**Real**, from their site and store (Oct 2026):
- All 7 coffees, their tasting notes and descriptions, and the badges (Top seller, High octane, Back in stock)
- Prices: $20 for 1 lb, $80 for 5 lb, coasters $5 and $12, 5 lb monthly light or dark subscriptions at $80
- Roast levels (Light to French, and the new Roaster's Choice) and grinds
- Roast days Monday and Wednesday, ships the next day, free shipping at $60+
- Text line 707-899-4183
- Will-call at True Value Hardware of Guerneville
- Occidental Farmers Market (Thursdays 4–8) and Cloverdale Certified Farmers Market (Sundays 9:30–1)
- Benny's own words on cooling, low-RPM grinding and being self-taught
- The Indian coffees' certifications (minority women-owned, handpicked, shade grown, kosher)
- All 8 customer reviews, verbatim (lightly trimmed with ellipses)
- Photos: the bag and latte, the three coasters, the coffee cherries, the beans, the latte, the arabica/robusta beans and the Coorg estate, all from their site. Sweet Maria's watermarked green-coffee photos and AI images were left out.

**Illustrative** (confirm or replace before launch):
- Order cutoff (midnight before a roast day), transit times, will-call ready time and the under-$60 shipping estimate
- True Value's street address (15600 River Rd, from a directory listing)
- Which review belongs to Sarah M. (the "4th round / Blue Bottle" review appears unattributed in their page source)
- Which coffee each badge belongs to (the badges sit between descriptions on their page)
- Subscription sizes and frequencies beyond the real 5 lb monthly, the cups-per-day math, and skip/swap/pause by text
- Wholesale prices, the rental welcome-bag sizes and referral credit
- Market pre-order, pickup codes, and anything about market seasons
- All console data (sample customers, accounts, inventory, sales history, roaster capacity, roast loss)
- Gift card terms

**Not invented:** reviews, ratings and review counts.

## Taking it live

- **Commerce:** move the catalog to Shopify (or keep their Hostinger store and point checkout at it). Products map one-to-one: coffee × size, with roast and grind as variant options. Subscriptions run through Shopify Subscriptions (or Recharge). Gift cards are native.
- **Roast day:** the console's batch plan reads open orders, subscription renewals and pre-orders for the next roast date. Orders are tagged with that date at checkout.
- **Texts** (roasted, shipped, ready for pickup, market reminders, reorder nudges, review asks): send through an SMS provider with TCPA consent, which the forms collect. Include STOP handling and a frequency cap. SKIP and PAUSE replies map to subscription actions.
- **Labels and packing slips** print from the console; shipping labels through Shopify Shipping or Shippo.

## Design

- **Type:** Archivo at its widest (125) and heaviest for the big talk, DM Mono for roast dates and stamps, Allura only inside the coffee-ring mark (it echoes the script on Benny's bags).
- **Color:** bone, ink and kraft, with one loud coffee-cherry red and a deep river green.
- **Signature shape:** the **coffee ring** from his stamp, oversized and slowly turning in the hero, and the kraft bag with a colored label for every coffee.
- **Motion:** the ring turns, the hero bag floats, a roast-day ticker runs under the concept bar, cards rise on scroll, the cart icon bumps. All of it is off under `prefers-reduced-motion`.

## Editing

Pages are plain HTML. The shared header and footer live in `build.mjs` between `<!--bb:header-->` / `<!--bb:footer-->` markers. Coffees, prices, roast days, markets and pickup live in `assets/site.js` (`COFFEES`, `PRICE`, `BB.markets`, `BB.pickup`). After editing, run:

```
node sites/bennysbeans/build.mjs
```

The build also fingerprints CSS/JS links (`site.css?v=…`), so browsers always load the latest files.

## Hosting

Railway service with root directory `/sites/bennysbeans`. Caddy serves pages, CSS and JS as `no-cache` (revalidated by ETag) and caches images for a day. The preview sends `X-Robots-Tag: noindex` and a disallow-all `robots.txt`, so the concept never competes with Benny's real site in search. `README.md`, `build.mjs` and the hosting files are never served.

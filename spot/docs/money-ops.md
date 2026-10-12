# Money operations runbook

Spot is the seller of every card cart. (Carts paid at the store directly are different: the store is the seller, Spot never holds that money, and returns go to the store. Nothing on this page applies to them except "Things only a person can decide".) The payer buys the cart from Spot, and Spot buys it from the store with its own single-use Issuing card and ships it to the requester. This page is what a person does to keep that honest. Most of it is automatic; the rest shows up on **/admin → Money to check**.

## What Spot does by itself

| Event | What happens | Where it's coded |
|---|---|---|
| Payer pays | Receipt email from Spot with a cancel link; card issued to Spot's company cardholder | `spot.paymentSucceeded`, `events.js` receipt |
| Payer or requester cancels before ordering | Cart → `refunding` → card canceled → full refund (fee included) | `spot.refundCart` |
| Store authorizes | Approved only for that store, not cash-like, within what the payer paid for the goods; single use | `cart.decideAuthorization` |
| Store captures | Card canceled at once | `spot.recordIssuingTxn` |
| Authorization closes | Unused goods money refunded to the payer | `spot.authorizationClosed` |
| Store reverses | Full refund | `spot.authorizationClosed` |
| Authorization expires, no charge | Waits 30 days for a late capture, then full refund | `spot.sweepMoney` |
| Store refunds a return | Same amount refunded to the payer (fee kept) | `spot.recordIssuingTxn` |
| Not ordered within 72h | Full refund, both people told | `spot.sweepMoney` |
| Refund fails at Stripe | Cart stays `refunding`; retried every 5 min with the same idempotency key | `spot.sweepMoney` |
| Payer disputes | Card canceled, payer's card fingerprint blocked, flagged on /admin | `spot.dispute` |

## Multi-store asks

One Stripe payment covers several store carts. Each store's cart has its own card, and its `payment_ref` is `<payment>#<n>`. On /admin each store's cart shows as its own row; refunding one refunds only its share (Stripe allows several partial refunds up to the payment). A dispute on the payment stops every store's card and flags every row. In Stripe you'll see one payment with several refunds. That's expected.

## Daily (5 minutes)

1. Open **/admin**. **Money to check** should say "All square". For each card it lists:
   - **Refund stuck:** Stripe is failing. Check the Stripe status page. Spot keeps retrying; **Refund the rest** forces a retry now.
   - **Order needs a retry:** the store blocked Spot's checkout. Try the order again from the requester's link, or refund. Spot refunds by itself at 72h.
   - **Store charged after the payer was refunded:** Spot paid the store but the payer has their money. Contact the store to cancel the order, or recover it from the requester. This should be rare, and the race fix prevents the common case.
   - **Store charged more than paid for the goods:** shouldn't be possible (the card limit is the same number). Check the Stripe Issuing transaction.
   - **Disputed:** see below.
2. **Price drops to claim** lists orders whose store lowered the price within 30 days of the order (Spot checks each one daily: the exact size and colour bought, from the store's own data). For each:
   - Ask the store for the difference under its price-adjustment policy, by chat, email or phone, with the order number shown. Ask for it back on the original card.
   - Tap **Claimed, tell the payer**. Only now is the payer emailed ("we asked for $X back"), so nobody is promised money we haven't asked for.
   - When the store pays, it lands on Spot's paused card and Spot passes it to the payer automatically ("matched its lower price"). The drop leaves the list.
   - **Dismiss** if it isn't worth it (or the store has no such policy); **Store said no** on a claimed one. If a store pays some other way (a gift card, store credit), refund the payer by hand from Stripe.
   - A drop counts at $1 and 3% under what was paid. If the price goes back up before you claim it, it drops off the list (most stores only match a live price).
3. Check the **Issuing balance** in Stripe (Balances → Issuing). Cards spend from it, while payer money lands in the payments balance. Top it up before it runs low. A card authorization fails if the balance can't cover it.
4. **Backups** on /admin should be green.

## Returns

The Terms say returns go through Spot. Most start themselves: on the order page, the requester taps **Need to send it back?**, picks the item and why, and gets the store's own return steps (read by AI off the store's policy page) with the order number and their email filled in, by email too. It shows on **/admin → Returns**. When the store refunds Spot's (paused) card, Spot refunds the payer by itself and the return leaves the list. Step in when a store needs Spot itself to start it (the order was placed in Spot's name), and use **Done another way** for store credit, a check, or a return that isn't going ahead.

When a payer or requester emails hello@ instead:

1. Find the cart on /admin (search the recent list by store or item).
2. Start the return with the store under its policy, using the order number on the cart. The item ships back from the requester.
3. When the store refunds, it lands on Spot's (canceled) card as an Issuing refund transaction. Spot passes the same amount to the payer automatically and emails them. Nothing to do.
4. If the store refunds some other way (store credit, a check), refund the payer by hand from Stripe, and note it on the cart.

## Disputes (chargebacks)

1. Stripe emails you, and the cart shows **Disputed** on /admin. Spot has already stopped the card and blocked the payer's card.
2. In Stripe → Disputes, respond with:
   - the receipt (items, the store, the ship-to name)
   - the store's order confirmation or tracking
   - the cart's activity from /admin
3. If nothing was ordered yet, accept the dispute; the money goes back to the payer through the bank.

## Weekly

- **Reconcile:** in Stripe, for the week:
  - payments collected − refunds should equal Issuing spend + Spot fees kept + the payments balance change
  - any gap shows up per cart on /admin
- Review **held payments** and the **block list** on /admin.

## Things only a person can decide

- Raising `SPOT_MAX_CART_CENTS` ($500 today) or the fraud limits.
- Turning on live flights (`SPOT_FLIGHTS_LIVE`). This waits on the seller-of-travel decision (see docs/go-live.md step 4).
- Any change to the Terms (`src/legal.js`), which should go past counsel.
- Which stores get the ✓. Verification is automatic (a file on the store's domain), but you can see every store on /admin → Stores with the button.

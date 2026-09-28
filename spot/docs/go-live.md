# Spot go-live checklist

Work through it in order. Each step says where to click and exactly what to set. Put keys and secrets straight into **Railway → spot → Variables**, never into chat or git. Setting a Railway variable redeploys Spot, which takes about a minute.

## 1. Domain (about 10 minutes, then a wait)

1. **DNS at your registrar** for spotmeplease.com:

   | Type | Name | Value |
   |---|---|---|
   | CNAME (or ALIAS/ANAME if `@` can't be a CNAME) | `@` | `uf1sacgk.up.railway.app` |
   | CNAME | `www` | `pke668lj.up.railway.app` |

   On Cloudflare, use "DNS only" (the grey cloud) until Railway verifies.
2. **Merge the open Spot pull requests** on GitHub. Railway deploys each one automatically.
3. **Wait for Railway to verify.** Go to Railway → spot → Settings → Networking. Both domains should show a green check and an issued certificate. This usually takes minutes, sometimes up to an hour.
4. **Set these Railway variables:**
   - `PUBLIC_URL` = `https://spotmeplease.com`
   - `SPOT_LEGAL_NAME` = your company's legal name (it appears on /terms and /privacy)
   - `SPOT_CONTACT_EMAIL` = `hello@spotmeplease.com` (or whatever you'll read)
5. **Make that inbox real.** Use Cloudflare Email Routing (free) or your registrar's email forwarding to send hello@spotmeplease.com to your inbox.

## 1a. Sign in with Google and Facebook (20 minutes)

Email-code sign-in works as soon as Resend is set up (step 5). These two buttons are optional, and each one appears once its keys are set.

**Google**
1. console.cloud.google.com → create a project called "Spot".
2. APIs & Services → OAuth consent screen:
   - User type: External
   - App name: Spot
   - Support email: yours
   - Authorized domain: `spotmeplease.com`
   - Privacy link: https://spotmeplease.com/privacy
   - Terms link: https://spotmeplease.com/terms
   - Scopes: `openid`, `email`, `profile`
   - Publish the app.
3. Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI: `https://spotmeplease.com/auth/google/callback`.
4. Set the Railway variables `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Facebook (Meta)**
1. developers.facebook.com → My Apps → Create app. Use case: "Authenticate and request data from users with Facebook Login".
2. Facebook Login → Settings → Valid OAuth Redirect URIs: `https://spotmeplease.com/auth/facebook/callback`.
3. App settings → Basic:
   - App domain: `spotmeplease.com`
   - Privacy Policy URL: https://spotmeplease.com/privacy
   - Terms: https://spotmeplease.com/terms
   - User data deletion → Instructions URL: https://spotmeplease.com/privacy#delete
   - Pick a category and add an icon.
4. Permissions: `email` and `public_profile` (standard access is enough). Switch the app to **Live**.
5. Set the Railway variables `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`.

**Both:** set `SPOT_SESSION_SECRET` to the output of `openssl rand -hex 32`, so a redeploy doesn't cancel sign-ins in progress.

## 1b. Admin page (2 minutes)

1. Make a long random token on your computer: `openssl rand -hex 24`.
2. Set the Railway variable `SPOT_ADMIN_TOKEN` to it, and keep a copy in your password manager.
3. Open https://spotmeplease.com/admin and sign in with the token. Held payments, recent carts, the block list, API keys and signups all live here.

## 2. Stripe (about 30 minutes, plus Stripe's review)

1. **Create and activate an account** at dashboard.stripe.com. Enter your business details and bank account. Use https://spotmeplease.com as the website, and https://spotmeplease.com/terms and /privacy for the policy links.
2. **Apply for Issuing** under Dashboard → Issuing → Get started. Stripe has to approve this. Describe it like this: *"Single-use virtual cards funded by a customer's payment, locked to one merchant and capped at the cart amount, used to buy that cart."*
3. **Register the Apple Pay and Google Pay domains** under Settings → Payment method domains. Add `spotmeplease.com` and `www.spotmeplease.com`.
4. **Add the webhook** under Developers → Webhooks → Add endpoint:
   - URL: `https://spotmeplease.com/v1/webhooks/stripe`
   - Events: `payment_intent.succeeded` and `issuing_authorization.request`
   - Copy the signing secret.
5. **Turn on real-time card authorizations** in Issuing settings, pointed at the same endpoint. This is how Spot declines a card used at the wrong store.
6. **Tighten Radar** under Radar → Rules. Spot's own rules (see /admin) catch patterns across links. Radar catches bad cards. Turn on "Block if CVC verification fails" and "Block if postal code verification fails", and review payments Radar scores as elevated risk.
7. **Set the Railway variables** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STRIPE_WEBHOOK_SECRET`. Start with the **test** keys (`sk_test_…`, `pk_test_…`) and do step 8 first. Swap to live keys once it all works.

## 3. AI (5 minutes)

1. Go to console.anthropic.com → API keys → Create key.
2. Set the Railway variables `ANTHROPIC_API_KEY` and `SPOT_AGENT` = `on`. This turns on screenshot reading and the checkout assistant.

## 4. Flights (10 minutes)

1. **Sign up** at duffel.com, then Developers → Access tokens → create a **test** token.
2. **Set the Railway variable** `DUFFEL_ACCESS_TOKEN` = `duffel_test_…`. This uses Duffel's test airline, so no real tickets are booked.
3. **Before real tickets:** complete Duffel's go-live verification, top up the Duffel balance (it pays the airlines), then swap in the `duffel_live_…` token.

## 5. Email (15 minutes)

1. Go to resend.com → Domains → Add `spotmeplease.com` and add the DNS records it shows (SPF and DKIM) at your registrar.
2. Set the Railway variables:
   - `RESEND_API_KEY`
   - `SPOT_FROM_EMAIL` = `Spot <hi@spotmeplease.com>`

## 6. Text messages (30 minutes, then a few days of carrier review)

US texting needs an approved **A2P 10DLC** brand and campaign. Until they're approved, texts to US numbers are blocked or filtered. In the meantime, agents still get the link to hand over themselves.

1. **Buy a number:** twilio.com → Phone Numbers → Buy a number (a US local number).
2. **Register the brand:** Messaging → Regulatory compliance → A2P 10DLC. You'll need your legal business name, EIN and address.
3. **Register the campaign.** Use case: *Account notifications* (or *Customer care*). Paste this:
   - **Description:** Spot sends transactional texts only to people who ask for them: a private link to review and pay for a shopping cart or flight that their AI assistant prepared for them, and updates about that order or trip. No marketing.
   - **Sample 1:** `Spot: Your cart is ready 🛒 Dunk Low from Nike, $119.60. Finish on your phone: https://spotmeplease.com/c/Ab12Cd34Ef56/manage?k=… Reply STOP to opt out.`
   - **Sample 2:** `Spot: Your flight is ready ✈️ AUS → SFO · Fri, Oct 17, Delta, $258.96. The fare only holds for a bit. Finish on your phone: https://spotmeplease.com/c/Gh78Ij90Kl12/manage?k=… Reply STOP to opt out.`
   - **How people opt in:** A user asks their AI assistant, which is connected to Spot, to text them a link, and gives their own mobile number in that request. Spot's terms only allow agents to text a user's own number with their permission (https://spotmeplease.com/terms#texts). Every message names Spot and says how to opt out.
   - **Opt-out message:** `Spot: You're unsubscribed and won't get more texts. Reply START to resubscribe.`
   - **Help message:** `Spot: order and trip texts you asked for. Help: hello@spotmeplease.com. Msg & data rates may apply. Reply STOP to opt out.`
   - **Privacy and terms links:** https://spotmeplease.com/privacy and https://spotmeplease.com/terms
4. **Set Twilio's automatic replies:** Messaging Service → Opt-Out Management. Use the opt-out and help messages above. Twilio sends these itself, and Spot records STOP and START.
5. **Point incoming texts at Spot:** Phone number → Messaging → "A message comes in": Webhook, POST, `https://spotmeplease.com/v1/webhooks/twilio`.
6. **Set the Railway variables** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` = the number in `+1…` format.

Carriers sometimes push back when people sign up to texts through a third party, here an AI agent. If the campaign is rejected, the fix is an opt-in on a Spot page: a "Text me updates" checkbox on the finish page. Ask Claude to add it.

## 7. MCP directory (5 minutes)

Follow `docs/mcp-listing.md`. In short: make the signing key on your computer, set `MCP_REGISTRY_AUTH` in Railway, then run `mcp-publisher login http --domain spotmeplease.com …` and `mcp-publisher publish`.

## 8. Try the whole thing (10 minutes, still on test keys)

1. Open https://spotmeplease.com and make a Spot from a real product link.
2. Open the link on your phone and pay with Stripe's test card `4242 4242 4242 4242`.
3. On your private page, add a billing address. A card should appear. Then try "Order it for me".
4. Ask your AI (with Spot connected at /integrations#mcp) for a flight, and finish it from the link.
5. Text STOP to the Twilio number. The next text to that number should come back as `opted_out`.

Once all of that works, swap in the **live** Stripe keys, and later the live Duffel token.

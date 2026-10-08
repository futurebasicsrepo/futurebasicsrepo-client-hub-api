// /terms and /privacy: plain-English drafts written to match what Spot
// actually does (see README). Have a lawyer review before real money moves.
//
//   SPOT_LEGAL_NAME      who operates Spot (default "Spot")
//   SPOT_CONTACT_EMAIL   where people write (default hello@spotmeplease.com)
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

export const UPDATED = 'September 28, 2026';

const CSS = `
.legal{padding:64px 0 90px}
.legal .wrap{max-width:760px}
.legal h1{font-size:clamp(40px,6vw,62px)}
.legal .upd{color:var(--muted);margin:12px 0 30px}
.legal h2{font-size:26px;letter-spacing:-.02em;margin:40px 0 10px}
.legal p,.legal li{color:var(--ink);opacity:.88;line-height:1.65}
.legal ul{padding-left:22px}.legal li{margin:6px 0}
.legal .sum{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px 24px;margin:0 0 10px}
.legal .sum p{margin:6px 0}
.legal a{color:var(--spot)}
`;

function page({ origin, path, title, desc, body }) {
  return `${siteHead({ title, desc, origin, path, extraCss: CSS })}
${siteNav()}
<main class="legal"><div class="wrap">
${body}
</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}})();</script>
</body></html>`;
}

const who = (env) => env.SPOT_LEGAL_NAME || 'the Spot team';
const mail = (env) => env.SPOT_CONTACT_EMAIL || 'hello@spotmeplease.com';

export function termsPage({ origin, env = process.env }) {
  const name = who(env);
  const email = mail(env);
  return page({
    origin,
    path: '/terms',
    title: 'Terms · Spot',
    desc: 'The terms for using Spot: buying carts through Spot, flights, refunds and returns, the AI agent API and text messages.',
    body: `
<p class="kicker">Legal</p>
<h1>Terms of Service</h1>
<p class="upd">Last updated ${UPDATED}</p>
<div class="sum"><p><b>The short version.</b> Spot turns a cart into a link. Whoever opens it can buy that cart from Spot, as a gift or for themselves. Spot then orders exactly those items from the store with its own card and ships them to the person the link is for. Nobody gets cash or a card. Nothing is ordered without a person saying yes, and if Spot can’t order it, the buyer gets a full refund.</p></div>

<h2>1. Who we are</h2>
<p>Spot is run by ${name} (“Spot”, “we”). These terms cover spotmeplease.com, Spot links, the Spot browser extension, and the Spot API and MCP server. By using any of them you agree to these terms.</p>

<h2>2. What Spot does</h2>
<ul>
<li><b>Spot me.</b> You (the <i>requester</i>) make a link for a cart from an online store. Someone else (the <i>buyer</i>, who we also call the payer) opens it and buys that cart from Spot as a gift for you. Spot orders exactly those items from the store and has them shipped to you.</li>
<li><b>Finish for me.</b> An AI assistant builds a cart or finds a flight for you and sends you a private link. You check it and buy it from Spot yourself.</li>
<li><b>Flights.</b> Fares come from airlines through our booking partner. When you pay, Spot buys the ticket from the airline in the traveler’s name. The airline operates the flight, and its fare rules apply (changes, cancellations, baggage, check-in).</li>
<li><b>Pay the store directly.</b> For stores that support agent checkout (the Universal Commerce Protocol), Spot sets up the store’s own checkout with the cart, shipped to the requester, and the buyer pays the store there. See section 3.</li>
<li><b>Rules and approvers.</b> If you connect an AI assistant to your Spot account, you can set limits for it and name an approver who pays for, or declines, what falls outside them. Your approver agrees by email first.</li>
<li><b>Several stores in one Spot.</b> One link can hold carts from up to five stores. The buyer pays once, and Spot buys each store’s cart separately, so each is ordered, refunded and returned on its own (sections 3–5 apply to each store’s cart).</li>
<li><b>Store buttons.</b> Stores can add an “Ask someone to pay” button that opens their cart in Spot. The cart, prices and store come from the store.</li>
<li><b>Ordering.</b> Spot fills in the store’s checkout with its own single-use card. It always stops and shows the store’s total first, and only places the order when the requester taps Place order.</li>
</ul>

<h2>3. Who the seller is</h2>
<p><b>When you pay the store directly</b> (the store’s own checkout page, opened from Spot), the store is the seller. You’re buying from the store under its terms: its price, receipt, shipping, returns and support. Spot doesn’t take that payment, doesn’t charge a fee for it, and isn’t a party to that sale. Spot only set up the checkout and shows its status.</p>
<p><b>When you pay on Spot</b>, you’re buying the cart from Spot, and your receipt comes from Spot. Spot buys the items from the store and has the store ship them to the requester’s address. The store is responsible for the product itself (its quality, warranty and safety) and for delivery; Spot handles your order, cancellations, refunds and returns. Handoff links that send money straight to Venmo or Cash App are different: that money goes directly to the requester, and Spot isn’t part of that transaction.</p>

<h2>4. Payments and fees</h2>
<ul>
<li>Card, Apple Pay and Google Pay payments are processed by Stripe. Spot never sees or stores the buyer’s card number.</li>
<li>The price is the cart (items plus the estimated shipping and tax), plus a Spot fee (currently 4%), plus a small allowance for tax and price changes at the store (5% of the cart, at most $15). All of it is shown before you pay. Whatever part of the allowance the store doesn’t charge is refunded to you automatically.</li>
<li>Spot buys the cart with its own single-use card, limited to that store and to what you paid for the goods. Nobody receives cash, a card or store credit, and the card can’t be used anywhere else.</li>
<li>Spot doesn’t sell gift cards, prepaid cards, crypto, money orders or other cash equivalents, and won’t order them.</li>
<li>Handoff links that send money straight to Venmo or Cash App carry no Spot fee.</li>
<li>Paying the store directly carries no Spot fee. The store sets the price, including shipping and tax, and shows it before you pay.</li>
</ul>

<h2>5. Cancellations, refunds and returns</h2>
<ul>
<li><b>Before the order is placed</b>, the buyer can cancel from the link in their receipt, and the requester can cancel from their Spot page. Either way the buyer gets a full refund, Spot fee included.</li>
<li><b>Several stores:</b> if one store’s cart can’t be ordered, or is canceled, the buyer gets back that store’s share (its items, allowance and Spot fee); the others go ahead.</li>
<li><b>If Spot can’t order it</b> within 3 days of payment (the store is out of stock, won’t accept the order, or anything else), the buyer is refunded in full automatically.</li>
<li><b>If the store charges less</b> than the buyer paid for the goods, or cancels, the difference (or everything) goes back to the buyer automatically.</li>
<li><b>Returns:</b> contact us at <a href="mailto:${email}">${email}</a> within the store’s return window. We arrange the return with the store under its return policy, and when the store refunds Spot, we refund the buyer that amount. The Spot fee is refunded only when the whole order is.</li>
<li><b>Flights:</b> if the airline can’t issue a ticket you paid for, you’re refunded in full automatically. Once a ticket is issued, changes and refunds follow the airline’s fare rules.</li>
<li><b>Paid the store directly?</b> Cancellations, refunds and returns go through the store under its policies; contact the store. We’re glad to help you reach them.</li>
<li>If a link expires or is canceled before anyone pays, nothing is charged.</li>
<li>Refunds go back to the original card or wallet and usually appear within 5–10 business days.</li>
</ul>

<h2>6. Your responsibilities</h2>
<p>You must be at least 18 (or the age of majority where you live) and give accurate information: your name, shipping address and, for flights, each traveler’s details exactly as on their ID. You’re responsible for anything done with your private Spot links, so keep them private.</p>

<h2>7. What you can’t use Spot for</h2>
<ul>
<li>Fraud, stolen cards, or asking people for money under false pretenses.</li>
<li>Getting cash or cash equivalents: gift cards, prepaid cards, crypto, money transfers, or anything bought to resell for cash.</li>
<li>Anything illegal where you or the store are, or anything Stripe or its partner banks prohibit (for example weapons, drugs, adult content, gambling).</li>
<li>Harassing people with requests, or texting or emailing links to people who didn’t ask for them.</li>
<li>Interfering with Spot, getting around its limits, or scraping it.</li>
</ul>
<p>We may decline, pause or refund any payment, and close accounts or API keys, to stop fraud or abuse.</p>

<h2>8. AI agents and the API</h2>
<ul>
<li>API keys are for you and your app. Keep them secret. Free keys have daily limits; we may change limits or revoke keys used for abuse.</li>
<li>Your agent may only send a Spot link, text or email to a person who asked for it, such as its own user. It must not buy anything, or state that something is bought, without the person completing payment on Spot (or, for a Spot account that saved a card and set your agent to use it, without that account’s approval as described below). Spot, not the agent, is the seller of anything bought through Spot.</li>
<li><b>Your AI’s card.</b> If you save a card on your Spot account, you authorize Spot to charge it for purchases your AI asks for, in two ways you choose for each AI: (a) <b>Approve with a tap</b>, where Spot charges your card only when you tap Approve for that purchase; or (b) <b>Pay automatically</b>, a separate opt-in you turn on in your account, where Spot charges your card without asking you each time for purchases inside the rules you set for that AI (a maximum per order is required, and each charge is no more than that purchase’s total). You can switch an AI back to a tap, turn automatic payment off, remove your card, or stop all AI spending at any time in your account; that applies to purchases your AI asks for afterwards. Purchases paid this way are Spot purchases like any other (sections 3 to 5).</li>
<li>Agents act for their users, not for Spot. You’re responsible for what your agent tells people.</li>
<li>Keys made from a Spot account follow that account’s rules. When an ask breaks them, Spot refuses it or sends it to the account’s approver; your agent must not try to get around those rules (for example by splitting an order).</li>
<li>When a person approves a purchase, Spot issues a signed record of what they approved. It’s evidence of that person’s approval, not a guarantee of payment, delivery or price.</li>
<li><b>Stores</b> using the “Ask someone to pay” button must send accurate items and prices from their own checkout, and may only use their key on their own domain.</li>
</ul>

<h2 id="texts">9. Text messages</h2>
<ul>
<li><b>Program:</b> Spot sign-in codes, and order and trip messages. When you ask to sign in by text, we text you a one-time code. When you enter your number on spotmeplease.com and confirm it with that code, you agree to receive texts about your Spot activity: links to finish or approve a purchase, and updates about that cart or trip. We only text numbers confirmed this way; if an assistant gives us a number that hasn’t been confirmed, we email instead. We don’t send marketing texts, and texting is never required to use Spot.</li>
<li><b>Frequency:</b> varies; usually one to three messages per request.</li>
<li><b>Cost:</b> message and data rates may apply.</li>
<li><b>Opt out:</b> reply <b>STOP</b> at any time and we won’t text that number again. Reply <b>START</b> to opt back in, or <b>HELP</b> for help. You can also email <a href="mailto:${email}">${email}</a>.</li>
<li>Carriers aren’t liable for delayed or undelivered messages. See our <a href="/privacy">Privacy Policy</a> for how we handle phone numbers.</li>
</ul>

<h2>10. Disclaimers and liability</h2>
<p>Spot is provided “as is”. We work hard to keep it running and accurate, but we can’t promise it will be uninterrupted or error-free, or that a store or airline will fulfill an order. To the fullest extent the law allows, Spot isn’t liable for indirect or consequential losses, and our total liability for any claim is limited to the fees you paid Spot in the 12 months before it. Nothing here limits rights you have under consumer law that can’t be limited.</p>

<h2>11. Changes</h2>
<p>We may update these terms. If a change is significant we’ll say so on this page before it takes effect; using Spot after that means you accept the new terms.</p>

<h2>12. Contact</h2>
<p>Questions: <a href="mailto:${email}">${email}</a>.</p>`,
  });
}

export function privacyPage({ origin, env = process.env }) {
  const name = who(env);
  const email = mail(env);
  return page({
    origin,
    path: '/privacy',
    title: 'Privacy · Spot',
    desc: 'What Spot collects, why, who it is shared with, and your choices.',
    body: `
<p class="kicker">Legal</p>
<h1>Privacy Policy</h1>
<p class="upd">Last updated ${UPDATED}</p>
<div class="sum"><p><b>The short version.</b> We collect what it takes to get your cart paid for and delivered, or your flight booked. We share it only with the companies that make that happen. We don’t sell your data, and we never share your phone number for anyone’s marketing.</p></div>

<h2>1. Who we are</h2>
<p>Spot is run by ${name}. This policy covers spotmeplease.com, Spot links, the browser extension, and the Spot API and MCP server.</p>

<h2>2. What we collect</h2>
<ul>
<li><b>Carts:</b> the store, items, prices, product links and images, and any note you add. If you share a screenshot, we read it to find the items.</li>
<li><b>Requesters:</b> your name, and when needed your email, phone number and shipping address. Venmo or Cash App handles if you add them.</li>
<li><b>Payers:</b> Stripe collects the card or wallet details; we receive only the payer’s first name, the email on the payment (used for Spot’s receipt, refunds, and to tell you when the gift was ordered), a fingerprint of the card used (to stop fraud), the amount and whether it succeeded. We never see or store the payer’s card number.</li>
<li><b>Your saved card:</b> if you save a card for your AI’s purchases, Stripe collects and keeps the card details; we keep only Stripe’s reference to it, plus the brand, last four digits and expiry to show you, and a fingerprint of the card (to stop fraud). We never see or store the card number.</li>
<li><b>Spot’s cards:</b> Spot buys each cart with its own single-use card, issued to Spot by Stripe’s partner banks. Its details are used only by Spot’s checkout at that store, never shown to anyone, and never stored by Spot.</li>
<li><b>Flights:</b> each traveler’s name, date of birth and gender as on their ID, plus a contact email and phone, which airlines require.</li>
<li><b>Accounts:</b> if you sign in by text, your mobile number. If you sign in with Google or Facebook, we receive your name, email address and an account ID from them, and nothing else (no contacts, posts or friends). If you add a passkey (Face ID, Touch ID or similar), only its public key: your fingerprint or face never leaves your device. Your email, and anything you choose to save (your name, shipping address, travelers’ names and dates of birth), plus which Spots and AI connections belong to your account.</li>
<li><b>Agents and developers:</b> your email and API key usage.</li>
<li><b>Technical:</b> IP address, browser type and basic logs, for security and to keep Spot working.</li>
</ul>

<h2>3. How we use it</h2>
<p>To create and show your links, take payments, buy and ship the carts you pay for and book flights, handle refunds and returns, send the messages you asked for, prevent fraud and abuse, provide support, and meet legal obligations.</p>

<h2>4. Who we share it with</h2>
<ul>
<li><b>Stripe</b>, for payments, refunds and Spot’s cards.</li>
<li><b>Stores</b> Spot buys from, to ship your order (the requester’s name, shipping address, email and phone). Spot pays with its own card.</li>
<li><b>Stores you pay directly</b>: Spot sends the store the cart, the requester’s name and shipping address, and the buyer’s email, so the store can take the payment on its own checkout and send its receipt. Your card goes to the store’s payment provider, never to Spot.</li>
<li><b>Your approver</b>, if you name one: the cart your AI put together, the store and the total, why it came to them, and your first name and shipping address (so it can ship to you).</li>
<li><b>Airlines and our flight-booking partner (Duffel)</b>, for traveler details and payment for your booking.</li>
<li><b>Anthropic</b>, which provides the AI that reads screenshots and fills in store checkouts. Card numbers are never sent to it.</li>
<li><b>Twilio and Resend</b>, to deliver texts and emails you asked for.</li>
<li><b>Railway</b>, which hosts Spot.</li>
<li>Authorities, when the law requires it or to protect people from fraud or harm.</li>
</ul>
<p>We don’t sell or rent personal information. <b>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</b> Text-messaging opt-in data and consent are never shared with anyone except the providers that deliver our messages.</p>

<h2>5. The person who paid, and the person who asked</h2>
<p>A payer sees the cart, the requester’s first name and the store, never the requester’s address or card, except on a store’s own checkout when paying the store directly, where the ship-to address is shown. A requester sees the payer’s first name, never their card or contact details. Signed approval records contain the store, items, amount, whether the buyer or the requester approved, and which AI asked, but no names, addresses or card details.</p>

<h2>6. How long we keep it</h2>
<p>Cart and order records are kept for as long as needed for refunds, disputes, fraud prevention and accounting (generally up to 7 years for payment records). Screenshots are used to read the cart and aren’t kept. You can ask us to delete your information sooner where the law allows.</p>

<h2 id="delete">7. Your choices, and deleting your data</h2>
<ul>
<li>Reply <b>STOP</b> to any Spot text to stop texts to that number.</li>
<li>To delete your account and data, including anything received from Google or Facebook, email <a href="mailto:${email}">${email}</a> from the address on your account with the subject “Delete my Spot account”. We confirm and delete within 30 days, keeping only payment records the law requires. You can also remove Spot from your Google or Facebook account settings at any time.</li>
<li>Email <a href="mailto:${email}">${email}</a> to access, correct or delete your information, or to ask a question. Depending on where you live (for example California or the EU/UK) you may have further rights, and we’ll honor them.</li>
</ul>

<h2>8. Security</h2>
<p>Private links use long random keys; sign-in codes, sessions and API keys are stored only as hashes; passkeys are stored only as public keys; and all traffic is encrypted. No system is perfect, so keep your private Spot links to yourself.</p>

<h2>9. Children</h2>
<p>Spot is for adults. We don’t knowingly collect information from children under 13, and anyone under 18 should use Spot only with a parent or guardian.</p>

<h2>10. Changes and contact</h2>
<p>We’ll post updates here and change the date above. Questions: <a href="mailto:${email}">${email}</a>.</p>`,
  });
}

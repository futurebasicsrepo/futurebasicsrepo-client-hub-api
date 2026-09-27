// /terms and /privacy: plain-English drafts written to match what Spot
// actually does (see README). Have a lawyer review before real money moves.
//
//   SPOT_LEGAL_NAME      who operates Spot (default "Spot")
//   SPOT_CONTACT_EMAIL   where people write (default hello@spotmeplease.com)
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

export const UPDATED = 'September 27, 2026';

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
    desc: 'The terms for using Spot: cart links, one-time cards, flights, the AI agent API and text messages.',
    body: `
<p class="kicker">Legal</p>
<h1>Terms of Service</h1>
<p class="upd">Last updated ${UPDATED}</p>
<div class="sum"><p><b>The short version.</b> Spot turns a cart into a link. Whoever opens it can pay, and the money goes onto a one-time card that only works at that store for about that amount. For flights, Spot books with the airline once you pay. Nothing is ever ordered without a person saying yes. The store or airline sells you the thing; Spot helps you pay for it.</p></div>

<h2>1. Who we are</h2>
<p>Spot is run by ${name} (“Spot”, “we”). These terms cover spotmeplease.com, Spot links, the Spot browser extension, and the Spot API and MCP server. By using any of them you agree to these terms.</p>

<h2>2. What Spot does</h2>
<ul>
<li><b>Spot me.</b> You (the <i>requester</i>) make a link for a cart. Someone else (the <i>payer</i>) opens it and pays. That money goes onto a single-use virtual card locked to that store and capped near the cart total, which you or Spot’s checkout assistant then use to buy the cart.</li>
<li><b>Finish for me.</b> An AI assistant builds a cart or finds a flight for you and sends you a private link. You check it and pay yourself.</li>
<li><b>Flights.</b> Fares come from airlines through our booking partner. When you pay, Spot books the ticket in your name. The airline’s fare rules apply (changes, cancellations, baggage, check-in).</li>
<li><b>Checkout assistant.</b> Spot can fill in a store’s checkout for you. It always stops and shows you the total, and it only places the order when you tap Place order.</li>
</ul>

<h2>3. Spot isn’t the store</h2>
<p>The store or airline is the seller. It is responsible for the product, prices, taxes, shipping, returns, warranties and the ticket. Questions about an order or a trip go to them first; we’ll help where we can.</p>

<h2>4. Payments and fees</h2>
<ul>
<li>Card, Apple Pay and Google Pay payments are processed by Stripe. One-time cards are issued through Stripe’s card-issuing partner banks. Spot never sees or stores the payer’s card number.</li>
<li>The payer pays a Spot fee (currently 4%), always shown before paying. Handoff links that send money straight to Venmo or Cash App go outside Spot and carry no Spot fee.</li>
<li>Prices can change between making a link and checking out. The one-time card allows a small cushion (up to 5%, at most $15) for tax and shipping changes; anything above it is declined.</li>
<li>Money on a one-time card can only be spent at that store. It can’t be withdrawn, transferred or turned into cash.</li>
</ul>

<h2>5. Refunds and cancellations</h2>
<ul>
<li>Until the card is used, the requester can refund the payer in full from their Spot page.</li>
<li>If a link expires or is canceled before anyone pays, nothing is charged.</li>
<li>If an airline can’t book a fare you paid for, you’re refunded in full automatically.</li>
<li>After an order is placed or a ticket is issued, refunds follow the store’s or airline’s policy. The Spot fee is refunded only when the whole payment is.</li>
</ul>

<h2>6. Your responsibilities</h2>
<p>You must be at least 18 (or the age of majority where you live) and give accurate information: your name, shipping address and, for flights, each traveler’s details exactly as on their ID. You’re responsible for anything done with your private Spot links, so keep them private.</p>

<h2>7. What you can’t use Spot for</h2>
<ul>
<li>Fraud, stolen cards, or asking people for money under false pretenses.</li>
<li>Cash or cash equivalents: gift cards, prepaid cards, crypto, money transfers, or anything bought to resell for cash.</li>
<li>Anything illegal where you or the store are, or anything Stripe or its partner banks prohibit (for example weapons, drugs, adult content, gambling).</li>
<li>Harassing people with requests, or texting or emailing links to people who didn’t ask for them.</li>
<li>Interfering with Spot, getting around its limits, or scraping it.</li>
</ul>
<p>We may decline, pause or refund any payment, and close accounts or API keys, to stop fraud or abuse.</p>

<h2>8. AI agents and the API</h2>
<ul>
<li>API keys are for you and your app. Keep them secret. Free keys have daily limits; we may change limits or revoke keys used for abuse.</li>
<li>Your agent may only send a Spot link, text or email to a person who asked for it, such as its own user. It must not buy anything, or state that something is bought, without the person completing payment on Spot.</li>
<li>Agents act for their users, not for Spot. You’re responsible for what your agent tells people.</li>
</ul>

<h2 id="texts">9. Text messages</h2>
<ul>
<li><b>Program:</b> Spot order and trip messages. When you (or an assistant acting at your request) ask Spot to send a link to your phone, we text you that link and updates about that cart or trip. We don’t send marketing texts.</li>
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
<li><b>Requesters:</b> your name, and when needed your email, phone number, shipping address, and a billing address for the one-time card. Venmo or Cash App handles if you add them.</li>
<li><b>Payers:</b> Stripe collects the card or wallet details; we receive only the payer’s first name, the amount and whether it succeeded. We never see or store the payer’s card number.</li>
<li><b>One-time cards:</b> the card is held by Stripe. We show its details only on the requester’s private page and use them only to check out at that store.</li>
<li><b>Flights:</b> each traveler’s name, date of birth and gender as on their ID, plus a contact email and phone, which airlines require.</li>
<li><b>Accounts:</b> your email, and anything you choose to save (your name, shipping address, travelers’ names and dates of birth), plus which Spots and AI connections belong to your account.</li>
<li><b>Agents and developers:</b> your email and API key usage.</li>
<li><b>Technical:</b> IP address, browser type and basic logs, for security and to keep Spot working.</li>
</ul>

<h2>3. How we use it</h2>
<p>To create and show your links, take payments, issue one-time cards, place orders and book flights, send the messages you asked for, prevent fraud and abuse, provide support, and meet legal obligations.</p>

<h2>4. Who we share it with</h2>
<ul>
<li><b>Stripe</b>, for payments and one-time cards.</li>
<li><b>Stores</b> you’re buying from, when Spot checks out for you (name, shipping address, email, phone and the one-time card).</li>
<li><b>Airlines and our flight-booking partner (Duffel)</b>, for traveler details and payment for your booking.</li>
<li><b>Anthropic</b>, which provides the AI that reads screenshots and fills in store checkouts. Card numbers are never sent to it.</li>
<li><b>Twilio and Resend</b>, to deliver texts and emails you asked for.</li>
<li><b>Railway</b>, which hosts Spot.</li>
<li>Authorities, when the law requires it or to protect people from fraud or harm.</li>
</ul>
<p>We don’t sell or rent personal information. <b>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</b> Text-messaging opt-in data and consent are never shared with anyone except the providers that deliver our messages.</p>

<h2>5. The person who paid, and the person who asked</h2>
<p>A payer sees the cart, the requester’s first name and the store, never the requester’s address or card. A requester sees the payer’s first name, never their card or contact details.</p>

<h2>6. How long we keep it</h2>
<p>Cart and order records are kept for as long as needed for refunds, disputes, fraud prevention and accounting (generally up to 7 years for payment records). Screenshots are used to read the cart and aren’t kept. You can ask us to delete your information sooner where the law allows.</p>

<h2>7. Your choices</h2>
<ul>
<li>Reply <b>STOP</b> to any Spot text to stop texts to that number.</li>
<li>Email <a href="mailto:${email}">${email}</a> to access, correct or delete your information, or to ask a question. Depending on where you live (for example California or the EU/UK) you may have further rights, and we’ll honor them.</li>
</ul>

<h2>8. Security</h2>
<p>Private links use long random keys; sign-in codes, sessions and API keys are stored only as hashes; and all traffic is encrypted. No system is perfect, so keep your private Spot links to yourself.</p>

<h2>9. Children</h2>
<p>Spot is for adults. We don’t knowingly collect information from children under 13, and anyone under 18 should use Spot only with a parent or guardian.</p>

<h2>10. Changes and contact</h2>
<p>We’ll post updates here and change the date above. Questions: <a href="mailto:${email}">${email}</a>.</p>`,
  });
}

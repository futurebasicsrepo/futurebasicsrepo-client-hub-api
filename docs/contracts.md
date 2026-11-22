# Contracts

A basic contract and signature process for digital work (websites, apps, software) and for physical product development (hats, shirts, shoes, electronics). It pulls what the platform already knows about the deal and the project into a fixed-fee agreement, sends it to the client as a private link, collects a typed-name signature with an audit trail, and turns the payment schedule into invoices. There are two standard agreements, chosen per customer: **digital work** and **physical product development** (see below).

Staff work in **Win, Contracts** (`/contracts`). Clients never sign in: they open the link they were emailed (`/sign/<link>`).

> The standard clauses are a sensible starting point written in plain English, not legal advice. Have a lawyer read them (and the Settings page's governing law) before the first contract goes out. The wording of every clause can be edited per contract.

## The flow

1. **Start from a deal or a project, and pick the type.** In Sales, a deal in meeting, proposal or won has a **Make a contract** button; or Contracts, **+ New contract** lists the deals and live software projects. The client company, the signer (the deal's contact), the client's address, the fee (the deal's value) and a starting payment plan come across. The address is the one on file: what the client gave in the hub (**Business address and billing**), else the address on their last contract, else on their last invoice, else their Shopify customer's default address. A draft opened with no address takes it the same way, and on a blank contract it fills in once the company or the signer's email is typed. The editor says where it came from. Changing it in a contract changes that contract only; the account keeps its own. The **Type of agreement** menu on that screen sets the wording: left on "Choose from the deal or project" it follows the project (software is digital, any other project is a physical product) or, for a deal with no project, the words in the deal's title (hat, shirt, shoe, electronics, factory, sample and the like mean a product); pick Website, App, Other digital work or Physical product to override it. The type can still be changed in the editor.
2. **Fill in the rest.** What is delivered (one per line) and what is not, the dates, how the fee is paid, optional monthly hosting, and the legal terms. The wording of each clause can be edited; words in `{{double braces}}` are filled from the contract. A draft can be saved half-finished; the page lists what is missing before it can be sent.
3. **Send for signature.** The signer gets an email with the fee, the payment plan and a **Review and sign** button. The text is frozen at that moment and fingerprinted (SHA-256). A signer for Future Basics can sign at the same time (**Sign for Future Basics now**) or countersign later.
4. **The client reads and signs.** The page shows the whole agreement, what they will pay and when, and a signing panel: type your full name, tick that you have read and agree, tick that you agree to sign electronically; for automatic payments, tick the authorization; if the plan lets them choose, pick ACH or card. It works on a phone. They can also decline and say why.
5. **Countersign.** When the client has signed, staff are emailed. A signer (the people named for Money: Kyle and Danielle) presses **Sign for Future Basics**. The agreement is then final: the deal moves to **Won**, the client is emailed their signed copy (the signed PDF is attached, `<client> - Agreement <number> (signed).pdf`, with the link as well), and a certificate page is added to the PDF.
6. **Invoices.** A contract paid by card or ACH (Stripe or QuickBooks Payments) gets them as soon as both parties have signed; on a contract paid by invoice a signer presses **Draft the invoices** (here or on the Money overview, under **Coming from contracts**, where every sent and signed contract shows what it will bring in): one draft invoice per payment in the schedule (deposit on signing, monthly payments on their dates, balance due on delivery), linked to the deal, the project and the contract. They go through the normal Money flow (QuickBooks pay link, payments, overdue). Done once per contract.

7. **Invoices made outside the schedule.** An invoice made in Money on its own (a quick invoice paid through a Shopify link, say) can be tied to its contract: in the contract's **Invoices** box, a signer presses **Link an invoice** and picks from the open Money invoices for the same client, project, deal or company. It takes the contract's client, deal and project. The box lists every invoice on the contract with what has been paid on each, and adds up invoiced and paid against the fee. **Unlink** takes back one linked by hand (never one drafted from the schedule). Both are on the contract's trail.
8. **Close it out.** **Close out** settles a contract that will never go further: a client who paid without signing, or an executed contract whose work is done. It works on a sent, client-signed, signed or expired contract. It asks for a note (on an unsigned contract it suggests "Accepted by payment: the client paid the invoice without signing.") and records on the trail how it ended: who had signed, and how much of the linked invoices was paid. The deal moves to **Won**. A closed contract cannot be revised, voided or signed; **Reopen** puts it back where it was. Closed contracts are under the **Closed out** filter.

Then, as ever, **Start project** on the won deal.

### Every contract is in the Sales pipeline

A contract is a deal in Sales from the moment it has a fee, whether it was started from a deal, a project or nothing at all (`src/sales-deals.js`). A contract made without a deal opens one for the client's company and the signer, and keeps it, so its invoices carry the deal too.

| The contract | The deal |
|---|---|
| a draft with a fee | **Meeting**, worth the contract's total (a draft never pulls a deal that is further along back) |
| sent, or signed by the client | **Proposal** |
| signed by both | **Won**, at the signed total |
| closed out (paid without signing, or the work is done) | **Won** |
| declined, expired or voided | **Lost**, with the reason, unless something else on the deal is still out (a newer version, a quote) |
| replaced by a new version | nothing: the new version carries the deal on |

A won deal stays won. The deal's timeline says each move once. Product quotes (one product, issued from its page) follow the same rules: issued is a Proposal, accepted is Won, declined is Lost, and every version of a product's quote is one deal. Order quotes were already deals (Proposal when sent, Won when accepted); a comp or discount at the invoice stage now changes the won value to what is invoiced. Every hour, a job ties in any contract or quote that is out of step with its deal, including those made before this.

## Physical product agreements

For customers whose project is a product (hats, shirts, shoes, electronics, bags), choose **Physical product development**. The fixed fee pays for our development work: design, tech packs, sampling management, sourcing. Everything else (samples, materials, tooling, production, inspection, testing, freight, duties) is outside the fee unless the scope says it is in. The wording is in [contracts-product-agreement.md](contracts-product-agreement.md), made from the code with the defaults, for a lawyer to read.

**Priced per unit.** A product contract can charge per unit instead of a fixed fee, for an order of goods such as 400 hats. Under **Price and how it is paid**, set **Charge** to *Per unit* and list each item with its quantity and unit price. The total is their sum and the payment schedule follows it. The server recomputes the total from the lines (`fee.charge: 'unit'`, `fee.units` in `src/contracts.js`), whatever total is sent. On the contract the clause is titled **Price**, says the unit prices hold for those quantities, and shows the lines above the total, on the signing page and in the PDF. Websites and software stay fixed-fee.

**From an order quote.** An agreement started from a quote (**Turn into a contract** on the quote in the client room's Invoices & payments, on the quote in the deal window in Sales, or **Start the agreement** under a product's Commerce: `/contracts?quote=<id>`; **Make a contract** on a deal or project that has an accepted or sent quote also uses it; a product quote, issued from a product's page, drafts the same way with `?productQuote=<id>`: its quantity at the client's unit price, tooling and freight as untaxed lines) is priced per unit from the quote: one line per product at its quantity and unit price (sizes named), one line per other line on the quote (setup, freight) at quantity 1, a comped line at $0 and a discount as a line below zero, as the quote's invoice would charge them. The scope lists what is ordered and the quote's notes; the production clause then reads as the order for that run. The contract remembers its quote (`contracts.quote_id`), so the quote then links to the contract instead of offering another.

**Sales tax on products only, by where they are delivered.** A contract priced per unit charges sales tax on its products and nothing else: each line has a **Taxed** box, ticked for products and unticked for shipping, setup and service fees (a quote's other lines come across unticked; a discount stays taxed, since it lowers what the products cost). The rate follows where the goods are delivered, because Future Basics is registered to collect sales tax in Pennsylvania only:

| Delivered to | Sales tax |
| --- | --- |
| Pennsylvania | the rate in **Settings → Pennsylvania sales tax** (6%), plus 2% in Philadelphia or 1% in Allegheny County |
| any other state | none: the contract says any use tax there is the client's |
| outside the US | none: import duties and taxes there are the client's |
| any address, with a resale or exemption certificate | none |

The editor has **Delivered to** (filled from the client's address, the state read from it), **State**, **Local tax** for Pennsylvania, and **The client gave us a resale or exemption certificate**. The rate is worked out from them and shown; a contract with taxed lines cannot be sent until the state is known. The contract shows the subtotal, the tax line (or "none: delivered to New York") and the total with tax; the price clause says why. Invoices drafted from it split each payment into its share of the products (taxed) and of shipping, setup and services (not taxed), so Money charges the tax as tax and the invoices add up to the contract to the cent. Money invoices have the same **Taxed** box on each line. Pennsylvania does not tax most everyday clothing: untick **Taxed** on clothing lines delivered in PA. The rates and the registered states are for the company to confirm; to collect in another state later, add it to `REGISTERED_STATES` in `src/contracts.js`.

What is different from the digital agreement:

| Clause | What it says |
| --- | --- |
| Samples and approval | up to *N* rounds are included (set per contract, default 2); extra rounds are quoted; the client approves each sample in writing; the **approved sample plus the tech pack** is the standard production is made and inspected against; production waits for an approved pre-production sample |
| Production runs | by option: **we order from the factory and supply the goods** (the default: each run is confirmed by a written order showing only the client's price, with a deposit % set per contract; the client does not see what we pay the factory, our quotes or our margin; we answer to the client for goods that do not match the approved sample, with liability for those goods limited to their price; no cancelling once materials are bought), **the client orders from the factory directly** (we manage the order and inspection but are not the manufacturer), or **not covered** (the clause is left out) |
| Quality and inspection | goods are inspected before they ship to an AQL (default 2.5 major / 4.0 minor); failures are reworked or remade before shipping; later claims need photos within the warranty days |
| Where the product is sold | the client is responsible for labelling, safety and certification where it sells; the wording lists the rules for the chosen categories (apparel, headwear, footwear, electronics, bags and accessories), for example FCC/UL/CE/RoHS and lithium battery shipping for electronics |
| Factory introductions | the client will not go around us to a factory we introduce (contact it, or order the same or a similar product from it) for a period set per contract, default 24 months, except a factory it already worked with and told us about before the introduction; breaching it lets us recover our losses, including the margin on those orders. **Optional per contract**: a checkbox in the product options turns it off and leaves the clause out |
| Ownership | designs, patterns, tech packs and artwork are the client's once paid; Future Basics keeps its tools, templates and base patterns; **tooling, molds and lasts paid for by the client are the client's**, even at the factory |
| Shipping, duties and risk | per Incoterm (EXW, FOB or DDP); freight, duties and taxes are the client's unless an order says otherwise; the client is importer of record |
| Our promise / Liability | no promise of sales, certification or factory dates; the client is responsible for the product it sells under its name and should carry product liability insurance |
| No hosting clause | hosting does not apply |

Payments work as for digital work, but a payment that waits for the work falls due at a point the contract chooses, under **Balance due** in the payment plan (`plan.balanceOn`):

- **On final sample approval** (the default). Staff press **Record final sample approval** (the button that says Record delivery on a digital contract) and those payments fall due.
- **Before production ships** (`ship`). The agreement, the email, the signing page and the balance invoice say "before production ships" (the timeline's date becomes the estimated ship date). Staff press **Record production ready to ship** when the order is ready, and the balance falls due that day, so it is paid before the goods leave.

Either way it is the one moment staff record on the contract (`delivered_on`), so automatic payments, invoices and reminders work the same. Invoices drafted from a product contract are product work (so their payment link follows the product-development route), and the starting milestone plan is a kick-off payment and a payment on final sample approval.

Production orders are not part of this plan: each run is confirmed by a written order outside the contract's fixed fee (we order from the factory, and the order shows the client's price only), or, when the client orders directly, the client pays the factory.

## Previewing the PDF

**Preview PDF** in the contract editor makes the PDF the client will download, from what is on the form at that moment, saved or not (`POST /v1/contracts/render.pdf`). It opens in a new tab, marked **Draft**, with the payment schedule as it will be sent. Any field still empty shows as its `{{placeholder}}`, so a gap is seen before the contract goes out. Nothing is saved. **Preview** still shows the wording on the page.

## Handwritten signatures in ink

Whoever signs for Future Basics signs with their own handwritten signature, in blue ink, when they have one. They give it once on **Settings → My signature** (`/signature`), by uploading a photo or scan of it in dark ink on light paper, or by signing on the page with a mouse, a pen or a finger.

- **The ink (`src/signatures.js`, `inkify`):** the paper is taken away and the strokes are coloured a ballpoint blue. The blue is deeper where the line is heavy, with a fine grain and a little bleed at the edges. The page shows the ink before it is kept.
- **Snapshots:** every signature given is kept as a mark (`signature_marks`), and `staff_signatures` says which mark is the person's now. Signing a contract (**Sign for Future Basics**, or signing when sending) or a tech pack (**Sign as Future Basics**) records the id of the signer's mark in the signature (`ink`). A document keeps the signature it was signed with: changing or removing yours later never changes one already signed.
- **Signing where you are:** wherever you sign for Future Basics (**Send** with *Sign for Future Basics now*, or **Sign for Future Basics**), the dialog shows the signature it goes on with. With none on file you can sign in a box there (mouse, pen or finger) or upload a picture. It becomes yours, so the contract is signed with it. Skip it and the typed name signs.
- **A contract signed with a typed name:** while it waits on the client, the person who signed sees **Add my handwritten signature** on it (`POST /v1/contracts/:id/ink`). Their ink goes on that same signature. The agreement, its fingerprint and the time of signing stay as they were, and the audit trail records it (`signed_provider_ink`).
- **Where it shows:** the ink sits on the signing line of the contract PDF, in the Signatures box on the client's signing page, in the work console, and on the tech pack's Future Basics signature, including its printed copy. Without a signature, the typed name signs as before.
- **The client signs with a finger too:** the signing page has a pad above the name. The client signs on it with a finger (or a pen or a mouse; `src/sign-pad.js`) and types their full name, and the page asks for both. The drawing goes with the signature (`ink` on `POST /v1/public/contracts/:token/sign`), is turned into the same blue ink and kept as a mark of its own, and the contract keeps its id in the client's signature. It shows on the client's signing line in the PDF, in the Signatures box on the signing page and in the work console, and the certificate of signing says the client signed by hand. A drawing the server cannot read is refused with "Sign in the box again".
- **Quotes are signed the same way:** in the client hub, **Accept** on an order quote and **Approve** on a product's quote open a sheet with the same pad and the name. The signature is kept on the quote (`order_quotes.accepted_signature`, `quotes.decision_signature`: the name, the time, the address and device, and the ink). Staff see "Accepted and signed by" with the ink on the quote in the client's room.
- **How it is served:** a mark is served by its unguessable id only, at `/v1/public/signature-marks/:id`, the same way a signing link's token is its key. It is never listed, and is sent private and noindex.

## Payment plans

The fee is fixed. A plan splits it into payments that must add up to the fee to the cent.

| Plan | What it makes |
| --- | --- |
| Pay in full | one payment on signing |
| Deposit and balance | a deposit on signing (50% unless changed), the balance on delivery or on a date |
| Monthly | an optional deposit on signing, then 2 to 48 equal monthly payments from a chosen date (the odd cents go on the last; a 31st becomes the month's last day) |
| By milestone | named payments by percentage, each on a date, on signing or on delivery |

How the client pays is part of the plan: **invoice** for each payment (pay online), **ACH on file**, **card on file**, or **either** (the client chooses when signing). With **automatic payments** switched on, the contract carries an authorization the client agrees to separately when signing: Future Basics may charge the ACH account or card on file for each payment on its due date and for no other amount, with a receipt each time, cancellation on three business days' notice, and one retry after a failure.

**Taking the payments:** with QuickBooks Payments switched on, the client adds the card or bank account on their signing page and each payment is taken on its due date: see [autopay.md](autopay.md). Until QuickBooks Payments is switched on, the choice and the authorization are recorded, and each scheduled payment is a draft invoice that is paid the usual way.

## Trust and the audit trail

- The signing link is made from the contract's id, a version number and the server's secret: nothing to look up, nothing stored, unguessable, and the same link every time it is sent again. **Replace link** bumps the version and the old link stops working at once.
- What was sent is what is signed. A sent contract cannot be edited; **Revise** makes version 2 (`FB-C-2026-001-v2`), and voids the one that was out.
- The client's signature records the typed name and title, the time, the address and device they signed from, the hash of the text, the consents, the payment method chosen and whether they authorized automatic payments. Opening the link is recorded too (first open emails staff).
- The PDF has the letterhead, every clause, the payment schedule, the signature blocks, and, once anyone has signed, a **certificate of signing** page with the fingerprint and the trail.
- A link expires after 14 days by default (set per contract). Expired, declined, void and fully signed contracts cannot be signed again. Two signatures at once: exactly one counts.
- A signed agreement shows on the contact's timeline in the CRM.

## Who can do what

Any signed-in teammate can draft, send, remind, revise, void and read contracts. Signing for Future Basics, drafting invoices, linking or unlinking an invoice and closing out or reopening a contract are for the people named for Money (`MONEY_ACCESS_EMAILS`, default Danielle and Kyle). The legal basics (who signs for us, our address, the governing law) are set once under **Settings** and fill the wording; a contract cannot be sent until they are set.

## Where it lives

| | |
| --- | --- |
| Rules, plans, clauses (digital and product), hash, token | `src/contracts.js` (no database or web server in it) |
| Routes (staff and public) | `src/contracts-routes.js`, listed at the top of the file |
| PDF | `src/contract-pdf.js` (on `brand-pdf.js`) |
| Staff page | `src/contracts.html` at `/contracts`, in the console menu under Win |
| The client's page | `src/sign.html` at `/sign/<link>` |
| Tables | `contracts`, `contract_events`, and `money_invoices.contract_id` |
| Tests | `test/contracts.test.js`, journeys J164 (API), J165 (browser), J188 (a product contract end to end), J189 (the product options in a browser), J316 (an invoice paid without signing: link, close out, reopen), J317 (the client's address from the account), J318 (a contract from an order quote: per-unit lines, untaxed setup and freight, tax on products, its invoices), J319 (Turn into a contract from the room and Sales, product quotes, Money's won-not-invoiced list) |
| Automatic payments | `src/autopay.js`, `src/qb-payments.js`, see `docs/autopay.md` |

## In the client hub

A contract belongs to a client (`contracts.client_id`). It is set from the project when there is one; otherwise from the signer's email (the hub user with that email, then the client's contact or allowed emails, then the company name), when a draft is saved and again when it is sent. At startup, contracts still without a client are tied the same way.

Once sent, the hub's dashboard carries it (`agreements`; a closed-out contract is not listed there): a signing request shows in **Waiting on you** ("Sign ...", or "Add your payment details" when automatic payments were agreed but no card or account is on file yet), and every sent or signed agreement stays under **Your agreements** with its status, summary and, once signed by both, the signed PDF. A contract is also matched to a signed-in person by the email it is addressed to, wherever it is filed (never in a staff preview). Only the signer's own sign-in gets the private signing link; a teammate sees the agreement without it, and a staff preview of the hub never gets a link. Covered by journey J171.

## Not built yet

- Reminders on a schedule (today staff press **Send a reminder**, once a day at most).
- Production orders as their own signable document (today an order through us is confirmed in writing, outside the contract).
- Change requests that attach to a signed contract.

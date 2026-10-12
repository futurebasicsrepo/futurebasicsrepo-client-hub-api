# Contracts

A basic contract and signature process for digital work (websites, apps, software). It pulls what the platform already knows about the deal and the project into a fixed-fee agreement, sends it to the client as a private link, collects a typed-name signature with an audit trail, and turns the payment schedule into invoices. The tech pack plays this part for product development; this is the equivalent for digital work.

Staff work in **Win, Contracts** (`/contracts`). Clients never sign in: they open the link they were emailed (`/sign/<link>`).

> The standard clauses are a sensible starting point written in plain English, not legal advice. Have a lawyer read them (and the Settings page's governing law) before the first contract goes out. The wording of every clause can be edited per contract.

## The flow

1. **Start from a deal or a project.** In Sales, a deal in meeting, proposal or won has a **Make a contract** button; or Contracts, **+ New contract** lists the deals and live software projects. The client company, the signer (the deal's contact), the fee (the deal's value) and a starting payment plan come across.
2. **Fill in the rest.** What is delivered (one per line) and what is not, the dates, how the fee is paid, optional monthly hosting, and the legal terms. The wording of each clause can be edited; words in `{{double braces}}` are filled from the contract. A draft can be saved half-finished; the page lists what is missing before it can be sent.
3. **Send for signature.** The signer gets an email with the fee, the payment plan and a **Review and sign** button. The text is frozen at that moment and fingerprinted (SHA-256). A signer for Future Basics can sign at the same time (**Sign for Future Basics now**) or countersign later.
4. **The client reads and signs.** The page shows the whole agreement, what they will pay and when, and a signing panel: type your full name, tick that you have read and agree, tick that you agree to sign electronically; for automatic payments, tick the authorization; if the plan lets them choose, pick ACH or card. It works on a phone. They can also decline and say why.
5. **Countersign.** When the client has signed, staff are emailed. A signer (the people named for Money: Kyle and Danielle) presses **Sign for Future Basics**. The agreement is then final: the deal moves to **Won**, the client is emailed their signed copy, and a certificate page is added to the PDF.
6. **Invoices.** On a fully signed contract a signer presses **Draft the invoices**: one draft invoice per payment in the schedule (deposit on signing, monthly payments on their dates, balance due on delivery), linked to the deal, the project and the contract. They go through the normal Money flow (QuickBooks pay link, payments, overdue). Done once per contract.

Then, as ever, **Start project** on the won deal.

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

Any signed-in teammate can draft, send, remind, revise, void and read contracts. Signing for Future Basics and drafting invoices are for the people named for Money (`MONEY_ACCESS_EMAILS`, default Danielle and Kyle). The legal basics (who signs for us, our address, the governing law) are set once under **Settings** and fill the wording; a contract cannot be sent until they are set.

## Where it lives

| | |
| --- | --- |
| Rules, plans, clauses, hash, token | `src/contracts.js` (no database or web server in it) |
| Routes (staff and public) | `src/contracts-routes.js`, listed at the top of the file |
| PDF | `src/contract-pdf.js` (on `brand-pdf.js`) |
| Staff page | `src/contracts.html` at `/contracts`, in the console menu under Win |
| The client's page | `src/sign.html` at `/sign/<link>` |
| Tables | `contracts`, `contract_events`, and `money_invoices.contract_id` |
| Tests | `test/contracts.test.js`, journey J164 (API), J165 (browser) |
| Automatic payments | `src/autopay.js`, `src/qb-payments.js`, see `docs/autopay.md` |

## Not built yet

- Reminders on a schedule (today staff press **Send a reminder**, once a day at most).
- A contract template per kind of work (the one standard set is used for websites, apps and other digital work).
- Change requests that attach to a signed contract.

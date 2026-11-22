# Money

`/money` (menu: Settings → Money) is the financial hub: every invoice, every payment, what is owed and what is late. **Only the admins named in `MONEY_ACCESS_EMAILS` can use it** (comma separated; `@domain.com` names a whole domain). With nothing set it is `danielle@thefuturebasics.com` and `kyle@thefuturebasics.com`; anyone else, including other admins, gets a 403 from every Money endpoint and does not see the menu item. The tech pack **payment gate** (who pays, who is free) is still on the Clients page and is linked from Money → Settings.

## What is in it
- **Overview:** money received in 30 and 90 days, what is owed, what is overdue, what needs sorting, what is owed by how late (not yet due, 1 to 30, 31 to 60, 61 to 90, over 90), where money came from, top clients, late invoices.
- **Invoices:** create, edit, send (mark sent), record a part payment, mark paid, put back to unpaid, void, delete a draft, download the PDF. An invoice has lines (what, quantity, rate), terms (the due date follows them), a tax rate that is shown and charged or not, **deposits already paid** (a credit line such as “Deposit Paid 3/9”), an optional **amount due now**, and notes. Numbers continue from the highest plain number (11106 → 11107).
- **The PDF** is the Future Basics invoice in use today (the brand letterhead and the green cue, a status pill, Bill to and the dates, the lines, totals with any deposit and the final amount due in the dark box, how to pay, notes). The bank details printed under **Payment instructions** come from Money → Settings, one line per row. They are not in the code.
- **Ledger:** every payment from every source (entered by hand, imported past invoices, QuickBooks, and the Shopify payments the gate already records), searchable and filterable by source.
- **Import past invoices:** a CSV with a header row (Company and Amount are needed; Invoice, Date, Due date, Terms, Description, Qty, Rate, Contact, Email, Address, Tax rate, Tax, Deposit, Deposit label, Due now, Due now label, Notes, Status, Paid on are read). Rows with the same invoice number are the lines of one invoice. A preview says what would come in; importing the same file again adds nothing. Past invoices with no paid date come in as **payment not recorded**: they are not counted as owed or late until someone marks each paid or unpaid.

## States
`draft` → `sent` (open, part-paid or overdue by its due date and what has been received) → `paid`; `void`; `unrecorded` (a past invoice whose payment was never written down). Overdue is worked out each time from the due date and the payments, never stored.

## Data
`money_invoices` and `money_payments` (see `src/db.js`). The rules are plain functions in `src/money.js` (`test/money.test.js`); the staff API is `src/money-routes.js`; the PDF is `src/money-pdf.js` (Space Grotesk and IBM Plex Mono through `src/brand-pdf.js`, the same as every other document). Platform health has a Money card (instructions saved, overdue, past invoices to settle).

## Sales tax on some lines only

Each line has a **Taxed** box. **Charge this tax** applies the rate to the ticked lines only, so products can be taxed while shipping, setup and service fees are not (`lines[].taxable: false`, `invoiceTotals` in `src/money.js`). Lines are taxed unless unticked; QuickBooks still gets the tax as one line of the amount charged.

## Payment links on the invoice
The kind of work decides how a client pays, and the link prints in the PDF's "How to pay" card (and can be copied from the invoice).
- **Product development → Shopify.** Money makes a Shopify draft order for the amount due now (the balance after deposits, or the "amount due now" you set) and uses its checkout link. When the checkout is paid, a check every 30 minutes (or `POST /v1/money/shopify-links/sync`) records the payment once, as a Shopify payment on the invoice, and settles it.
- **Software development → QuickBooks.** The invoice is made in QuickBooks first if it is not there yet (not emailed), then QuickBooks's own pay page for it (card and bank) is read back. QuickBooks only gives that page to an invoice with the client's email and online payments on. Payments made there come back through the QuickBooks payment read.
- **Choosing the kind:** on the invoice, pick the **project** (a project knows whether it is product or software development, and sets the client) or choose the **kind of work** directly. With neither chosen there is no link.
- Editing an invoice drops its Shopify link (the amount may have changed): make it again from the invoice. A paid or void invoice prints no link.
- The QuickBooks email to the client, when you use "Create and email from QuickBooks", is QuickBooks's own design. The PDF from Money, the work console and the hub is the Future Basics one.

## What PDFs are called

Every invoice, receipt and agreement PDF is named for the client, then what it is and its number: `Comet over Delphi - Invoice 1043.pdf`, `Comet over Delphi - Receipt R-1043.pdf`, `Comet over Delphi - Agreement FB-C-2026-004 (signed).pdf` (`src/pdf-name.js`). The download buttons in the work console, Money, Contracts, the client's hub and the signing page save the file under that name, and the emails attach it under the same name, so a phone keeps it instead of calling it "Unknown.pdf".

## Receipts

Once a client has paid, they get a **receipt**: the invoice's twin on the same letterhead (`src/receipt-pdf.js`). It is headed Receipt with a green Paid pill and numbered `R-` plus the invoice number. It shows:

- who paid;
- when the payment was made and how: Shopify checkout (with its order number), wire, ACH, card, check;
- the invoice's own lines and totals, each payment taken off, and a balance of $0.00 when it is paid in full, in the same dark box as the invoice.

A part payment makes a receipt for what came in, with the balance still due.

- **Money:** a paid (or part-paid) invoice has **Download receipt** and **Email the receipt** under its payments. The email goes to the invoice's contact, or to an address you type, with an optional note and the PDF attached. Replies come to whoever sent it. The invoice shows who it was last sent to and when. Routes: `GET /v1/money/invoices/:id/receipt.pdf`, `POST /v1/money/invoices/:id/receipt { to?, message? }`.
- **A project's invoices** (the Shopify draft orders made from a project, a quote or a sample deposit): in the work console's project money section a paid invoice has **Download receipt** and **Email receipt**. The payment date and order number come from the Shopify order the payment sync recorded; an invoice marked paid by hand shows the day it was marked. Routes: `GET /v1/invoices/:id/receipt.pdf` (staff, and the client for their own), `POST /v1/admin/invoices/:id/receipt { to?, message? }`.
- **The client** downloads the receipt for any paid invoice from their hub.

- **A contract's payments send their own receipt.** An automatic payment (card or bank, through QuickBooks Payments or Stripe) emails the client the receipt with the PDF attached as soon as it is taken. It shows the payment even if QuickBooks has not booked it yet. A contract's invoice the client pays through its QuickBooks link is receipted on the next QuickBooks sync, once, and only for a payment from the last few days, so connecting QuickBooks again never mails receipts for old payments. Either way the invoice in Money shows the receipt as sent.

Otherwise nothing is emailed without someone pressing the button, and a receipt that could not be sent (no email service) says so and is not marked sent.

## QuickBooks Online
Money → Settings has a QuickBooks panel: **Connect** (sign in at Intuit; Danielle or Kyle only), **Test connection** (reads the company name, changes nothing), **Read payments now**, **Disconnect**.
- **Railway variables:** `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENV` (`sandbox` or `production`; start with sandbox). Register the redirect URI `https://work.thefuturebasics.com/v1/money/quickbooks/callback` in the Intuit app. Tokens are saved sealed (AES-GCM) and refreshed automatically.
- **Invoices are made here and pushed to QuickBooks:** the customer and item are found or created, the invoice goes over with the same lines, tax, deposit and terms, and can be emailed from QuickBooks (card and bank payment turned on). The PDF the client gets from work/hub stays the Future Basics template.
- **Payments come back** every 30 minutes (and on “Read payments now”): each QuickBooks payment is recorded once against its invoice (unique `qb_id`). A payment with no matching invoice is recorded only if it was paid on or after the connect date, so old books do not flood the ledger.
- **For Intuit's app review:** the sign-in addresses are read from Intuit's discovery document (kept for a day; the built-in addresses are used if it cannot be read, and only an `intuit.com` address is ever trusted with the client secret). Every failed QuickBooks call is logged (status, `intuit_tid`, Intuit's error code and message, the path, never a token or a body) and the Money page's last error ends with the `intuit_tid` so Intuit support can find the call.
- Platform health has a QuickBooks card (connected, needs reconnect, last sync, last error with secrets scrubbed).

## On the work home Today list
Late invoices come first in **Reach out today** on the work home, for the people Money is open to (Danielle and Kyle): up to three rows, most overdue first, each with the company, the invoice number, what is owed and how many days late, then one line for the rest ("N more late invoices, $X late in all"). A row opens that invoice (`/money?invoice=<id>`). It reads the same `/v1/money/overview` the Money page uses after the page has loaded, so everyone else gets a refusal and sees the list exactly as before. Journey J150.

## Invoices from a won deal or a project
- **From a won deal:** a won deal in Sales has a **Make an invoice** link (`/money?deal=<id>`). In Money, **From a deal or project** lists won deals (not-yet-invoiced first, each showing the invoices already made for it) and the live projects. Choosing one opens the editor filled in: the company, contact and email from the deal (or the client it belongs to), and one line at the deal's title and value. Save draft makes the invoice and ties it to the deal (`money_invoices.deal_id`).
- **From a project:** the client, contact, kind of work (so the right payment link) and a line named for the project; the amount is left for you to enter.
- **Not billed twice by accident:** starting from something already invoiced asks first (and names the invoice numbers). A voided invoice does not count as billing.
- **Coming from contracts** on the Money overview lists every contract that is out for signature, signed by the client, or signed by both, with the part of its fee that no sent invoice carries yet (the **Under contract** tile adds them up). Each row links to the contract and says how it is paid: by invoice, or through Stripe or QuickBooks Payments by card or ACH, and whether payments are automatic. A contract signed by both without invoices has a **Draft the invoices** button; once an invoice drafted from it is sent, that amount counts in **Owed to us** instead, so nothing is counted twice.
- A contract paid by card or ACH gets its invoices drafted the moment both parties have signed (linked to it by `contract_id`), so the processor's charges have them to settle. A contract paid by invoice still waits for a signer to press **Draft the invoices**.
- **An invoice on a contract** shows a **contract FB-C-…** chip in its detail that opens the contract. An invoice made here on its own can be linked to a contract from the contract (**Link an invoice**, see [contracts.md](contracts.md)); the contract can then be closed out once it is paid.
- **Won, not invoiced yet** lists won deals from the last year that nothing bills yet, each with an **Invoice it** button. A deal is billed when a Money invoice is on it or on one of its contracts, a contract on it is out, signed or closed out, an accepted order quote on it has its Shopify checkout, or a product quote on it has its Shopify checkout or a hub invoice.
- API: `GET /v1/money/sources`, `GET /v1/money/draft?deal=<id>|project=<id>` (a filled-in invoice, nothing saved), and `dealId` on invoice create and edit. Journeys J153 (API) and J154 (browser).

## Shopify Payments payouts
**Money → Payouts** shows what Shopify Payments paid into the bank and what it kept: sales paid out, fees (and the share of sales they are) and what reached the bank over 30 and 90 days, what is scheduled, and each payout (date, status, sales, refunds, fees, paid out). It is read every 6 hours (job **Shopify payouts**) and on **Read payouts now**; reading again never doubles a payout, and a scheduled one is updated in place when it is paid.
- The fee on a payout is what is left between the money that moved (sales, refunds, adjustments, held and retried funds) and what was paid out, so it is right however Shopify signs each fee line.
- **One thing to set up:** the Shopify app needs the **`read_shopify_payments_payouts`** access scope. Until it has it, Money → Payouts and Platform health say so in those words ("add the read_shopify_payments_payouts access scope to the Shopify app and approve it", followed by Shopify's own words, which name any other scope it wants); nothing else is affected. A store that is not on Shopify Payments is told so rather than shown an error.
- API: `GET /v1/money/payouts`, `POST /v1/money/payouts/sync` (Money-only). Data: `money_payouts` (`src/shopify-payouts.js` has the query and the arithmetic, `test/money-payouts.test.js`). Platform health has a **Bank payouts and fees** card. Journeys J155 (against the stand-in store: scope refusal, paging, no double counting, no Shopify Payments) and J156 (the tab).

## Next
Nothing planned. Possible later: match each payout's sales to the Shopify payments in the ledger, and book fees to QuickBooks.

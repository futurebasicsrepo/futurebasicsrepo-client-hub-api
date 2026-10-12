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

## Payment links on the invoice
The kind of work decides how a client pays, and the link prints in the PDF's "How to pay" card (and can be copied from the invoice).
- **Product development → Shopify.** Money makes a Shopify draft order for the amount due now (the balance after deposits, or the "amount due now" you set) and uses its checkout link. When the checkout is paid, a check every 30 minutes (or `POST /v1/money/shopify-links/sync`) records the payment once, as a Shopify payment on the invoice, and settles it.
- **Software development → QuickBooks.** The invoice is made in QuickBooks first if it is not there yet (not emailed), then QuickBooks's own pay page for it (card and bank) is read back. QuickBooks only gives that page to an invoice with the client's email and online payments on. Payments made there come back through the QuickBooks payment read.
- **Choosing the kind:** on the invoice, pick the **project** (a project knows whether it is product or software development, and sets the client) or choose the **kind of work** directly. With neither chosen there is no link.
- Editing an invoice drops its Shopify link (the amount may have changed): make it again from the invoice. A paid or void invoice prints no link.
- The QuickBooks email to the client, when you use "Create and email from QuickBooks", is QuickBooks's own design. The PDF from Money, the work console and the hub is the Future Basics one.

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
- **Won, not invoiced yet** on the Money overview lists won deals from the last year that no invoice bills, each with an **Invoice it** button.
- API: `GET /v1/money/sources`, `GET /v1/money/draft?deal=<id>|project=<id>` (a filled-in invoice, nothing saved), and `dealId` on invoice create and edit. Journeys J153 (API) and J154 (browser).

## Shopify Payments payouts
**Money → Payouts** shows what Shopify Payments paid into the bank and what it kept: sales paid out, fees (and the share of sales they are) and what reached the bank over 30 and 90 days, what is scheduled, and each payout (date, status, sales, refunds, fees, paid out). It is read every 6 hours (job **Shopify payouts**) and on **Read payouts now**; reading again never doubles a payout, and a scheduled one is updated in place when it is paid.
- The fee on a payout is what is left between the money that moved (sales, refunds, adjustments, held and retried funds) and what was paid out, so it is right however Shopify signs each fee line.
- **One thing to set up:** the Shopify app needs the **`read_shopify_payments`** access scope. Until it has it, Money → Payouts and Platform health say so in those words ("add the read_shopify_payments access scope to the Shopify app and approve it"); nothing else is affected. A store that is not on Shopify Payments is told so rather than shown an error.
- API: `GET /v1/money/payouts`, `POST /v1/money/payouts/sync` (Money-only). Data: `money_payouts` (`src/shopify-payouts.js` has the query and the arithmetic, `test/money-payouts.test.js`). Platform health has a **Shopify Payments payouts** card. Journeys J155 (against the stand-in store: scope refusal, paging, no double counting, no Shopify Payments) and J156 (the tab).

## Next
Nothing planned. Possible later: match each payout's sales to the Shopify payments in the ledger, and book fees to QuickBooks.

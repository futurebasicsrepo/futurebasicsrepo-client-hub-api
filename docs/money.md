# Money

`/money` (menu: Settings → Money) is the financial hub: every invoice, every payment, what is owed and what is late. **Only the admins named in `MONEY_ACCESS_EMAILS` can use it** (comma separated; `@domain.com` names a whole domain). With nothing set it is `danielle@thefuturebasics.com` and `kyle@thefuturebasics.com`; anyone else, including other admins, gets a 403 from every Money endpoint and does not see the menu item. The tech pack **payment gate** (who pays, who is free) is still on the Clients page and is linked from Money → Settings.

## What is in it
- **Overview:** money received in 30 and 90 days, what is owed, what is overdue, what needs sorting, what is owed by how late (not yet due, 1 to 30, 31 to 60, 61 to 90, over 90), where money came from, top clients, late invoices.
- **Invoices:** create, edit, send (mark sent), record a part payment, mark paid, put back to unpaid, void, delete a draft, download the PDF. An invoice has lines (what, quantity, rate), terms (the due date follows them), a tax rate that is shown and charged or not, **deposits already paid** (a credit line such as “Deposit Paid 3/9”), an optional **amount due now**, and notes. Numbers continue from the highest plain number (11106 → 11107).
- **The PDF** is the Future Basics invoice in use today (the mark top left, Bill to and the invoice facts on the left, the black SERVICES bar, totals with any deposit and the final amount due, notes). The bank details printed under **Payment instructions** come from Money → Settings, one line per row. They are not in the code.
- **Ledger:** every payment from every source (entered by hand, imported past invoices, QuickBooks, and the Shopify payments the gate already records), searchable and filterable by source.
- **Import past invoices:** a CSV with a header row (Company and Amount are needed; Invoice, Date, Due date, Terms, Description, Qty, Rate, Contact, Email, Address, Tax rate, Tax, Deposit, Deposit label, Due now, Due now label, Notes, Status, Paid on are read). Rows with the same invoice number are the lines of one invoice. A preview says what would come in; importing the same file again adds nothing. Past invoices with no paid date come in as **payment not recorded**: they are not counted as owed or late until someone marks each paid or unpaid.

## States
`draft` → `sent` (open, part-paid or overdue by its due date and what has been received) → `paid`; `void`; `unrecorded` (a past invoice whose payment was never written down). Overdue is worked out each time from the due date and the payments, never stored.

## Data
`money_invoices` and `money_payments` (see `src/db.js`). The rules are plain functions in `src/money.js` (`test/money.test.js`); the staff API is `src/money-routes.js`; the PDF is `src/money-pdf.js` (font: Rubik Mono One, SIL OFL, with its licence in `src/fonts`). Platform health has a Money card (instructions saved, overdue, past invoices to settle).

## Next
QuickBooks Online (connect, create and send the invoice there, read payments back), Shopify Payments payouts and fees, overdue invoices on the work home's Today list, and invoices made from a won deal or a project.

# Automatic payments (QuickBooks Payments)

A signed contract with **automatic payments** takes each payment in its schedule from a card or bank account the client puts on file once, on the date it falls due. QuickBooks is the processor for now; the books stay in QuickBooks, so the accountant's workflow does not change.

## Turning it on (once)

1. In the Intuit developer account, open the app that is already connected for Money and add the **Payments** permission (`com.intuit.quickbooks.payment`). The QuickBooks company needs a **QuickBooks Payments** merchant account (approved by Intuit); the sandbox has one for testing.
2. Set `QUICKBOOKS_PAYMENTS=on` on the service (and `QUICKBOOKS_ENV=production` when using the live books).
3. In **Money, Settings**, Disconnect and Connect QuickBooks again so the sign-in includes the new permission. The settings card then shows "allowed". Until then the contract page says why payments cannot be taken.

Nothing changes for contracts without automatic payments, or while this is off: they keep working as invoices.

## The flow

1. The contract is sent with automatic payments on and card, ACH, or either. The client authorizes them when signing (a separate tick).
2. Right after signing, the client's page asks for the card or bank account. The number goes **from the browser straight to Intuit**, which returns a one-time token; only the token reaches us. We save the card or account on file at Intuit and keep its id, the last four digits and the authorization that was shown (who, when, from where, the text).
3. Once both sides have signed, the payments job (hourly, plus straight away when details are saved or the contract is countersigned) drafts the invoices from the schedule, puts each one in QuickBooks, and takes every payment that has fallen due, once.
4. Three days before each payment the client is emailed the amount, date and card. After each payment they get a receipt.
5. A payment that is taken is recorded in QuickBooks as a Payment against that invoice (reference: the charge id) and in the ledger, and the invoice is marked paid.

## Rules

- A payment is taken only on its due date, for exactly its amount. Payments due on delivery wait until a signer presses **Record delivery** (or the contract has a completion date).
- A card is answered at once. A bank debit is **pending** until the bank settles it (a few days); the job asks again each hour. Nothing is booked or receipted until it settles.
- A declined payment is retried **once, three days later**. After the second decline it stops: the client is emailed the invoice pay link and a way to update their details, staff are told, and a signer can press **Charge now** after the client updates their details.
- Every attempt has its own fixed Request-Id, so running the job twice, or two servers at once, can never take the money twice. Nothing is charged while the invoice is already paid.
- If QuickBooks is down when a payment was taken, the payment is marked "taken, not yet in QuickBooks" and booked on the next run. It is never lost or booked twice.
- Signers (Kyle and Danielle) can pause and resume, take a payment by hand, and record delivery. Any teammate can ask the client for their details. The client can replace the card or account from their agreement link any time; the old one is removed at Intuit.

## Where it lives

| | |
| --- | --- |
| Rules (what is due, retries, notices) and the runner | `src/autopay.js` |
| The only file that knows Intuit's payments API (tokens, save on file, charge, bank debit, status) | `src/qb-payments.js` |
| Routes | `src/contracts-routes.js` (client: `POST /v1/public/contracts/:token/payment-method`; staff: `/v1/contracts/:id/autopay/*`, `/delivered`, `/v1/contracts/autopay/run`) |
| Client's card and bank form | `src/sign.html` |
| Staff panel | `src/contracts.html` (Automatic payments) |
| Tables | `contract_payment_methods`, `contract_charges` |
| Tests | `test/autopay.test.js`, journeys J167 (card), J168 (bank), J169 (browser) |

## Moving off QuickBooks later

The rules never call Intuit directly: they use a processor with four functions (`saveInstrument`, `removeInstrument`, `charge`, `status`), written once in `qb-payments.js`. A different processor means a new file with the same four functions and the browser form's token step; the schedule, retries, notices, receipts and ledger stay as they are. What QuickBooks does for the accountant today (invoices, payments against invoices, deposits, tax reports) would then need its own replacement before switching.

## To check on the first live payment

This was built against Intuit's published API and a stand-in server, not a live account. On the first real charge (sandbox first), check:

- the card form can reach Intuit's tokens address from the browser (the signing page already allows it in its content security policy);
- the charge and the bank debit go through, and the bank debit's status changes from pending to succeeded;
- the Payment recorded in QuickBooks against the invoice matches the deposit that Intuit makes to the bank. If the accountant would rather have the charge recorded another way, only `recordPayment` in `src/quickbooks.js` changes.

## Payment details still owed

When a client signed with automatic payments but has not put a card or bank account on file, the hourly run emails the signer (an hour after signing, so nobody adding them right now gets one) and reminds them every 3 days, at most 3 times (`askForDetails`, `REMIND_DAYS`, `REMIND_MAX`). Staff asking by hand ("Ask for details") counts as one of the emails. The email stops as soon as details are on file. The hub also shows "Add your payment details" under Waiting on you, and the hub's top menu has an Agreements link. Journey J172.

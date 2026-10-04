# Customer journeys

Scripted customers who make mistakes on purpose, so a change that breaks a path a real person takes fails here and not in production.

`npm run journeys` starts four throwaway servers and a stand-in Shopify store and runs 51 journeys. Each one asserts the outcome a customer needs: a clear message, no 5xx, no hang, nothing lost.

| File | Server | Journeys |
|---|---|---|
| `api.mjs` | A: fixture assistant, billing on, no dev bypass | J01–J15 and J28–J30, J32, J34, J35, J36, J39, J44, J48, J50, J52 and J54: happy path, `/start` input mistakes, oversized and heavy uploads, a photo with no product, double-tap, sign-in codes (wrong, reused, expired, pasted with a space), code guessing and spam, second pack locked then paid, members, editor saves with garbage, edits racing the assistant and a stale tab, who may touch whose draft, starting from inside the hub, after submit, asking for a code with an unknown, pending or archived email, running the assistant again on a finished draft, staff start over, pre-claiming a room with someone else's address, the platform health calls (staff only, complete, no secrets), the product card following the tech pack (client edits, staff edits, publish, blanks never erase), the hub project thread endpoint (names written for a reader, product talk folded in, only your own project) |
| `browser.mjs` | A, phone viewport | J20–J27, J31, J33, J26, J37, J38, J40, J41, J42, J45, J49 and J51: every `/start` mistake in the page, no signal on submit, bad server answers (413, 502, 429, 500, HTML 200), triple-tap, expired and missing sessions on the editor link, the code card (resend, wrong email, wrong code), the locked pack and the pay buttons, two tabs on one draft, getting to the tech pack and back (breadcrumbs, the More menu, back lands on the same product), the platform health page (opens from the header, every connection, tabs, chart tooltip and table, phone width), staff Start over in the console editor, a /start session that ends with the editor open, and the Message Future Basics button when checkout will not open, the product card in the hub and the work console following the tech pack, the same chat in the work console's room thread and the hub's project messages (bubbles, quoted replies, attachments, live refresh) |
| `shopify-down.mjs` | B: Shopify unreachable | J16–J17: checkout and unlock with the store down, the `/start` rate limit |
| `payments.mjs` | D: a stand-in Shopify store the server reads | J46–J47: a tech pack paid in the store reaches the ledger, the pack, the client card and the Platform page without anyone pressing sync; an outage and a paid-but-locked pack turn the check amber; the console card, room and Platform page show it |
| `model-down.mjs` | C: model API failing | J18, J19, J43 and J53: the customer is told it is on our side and keeps their three tries; staff get one alert, not one per failure |

Needs Postgres at `DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/fbhub_tp`) and `psql` on the path. The browser journeys need Playwright (`PLAYWRIGHT_PATH`, or on the module path); without it they are skipped. Fixture pictures are drawn at run time, nothing binary is committed.

Payments are simulated by marking the pack paid in the database, the same row the Shopify check writes.

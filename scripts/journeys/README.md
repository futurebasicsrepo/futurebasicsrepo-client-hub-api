# Customer journeys

Scripted customers who make mistakes on purpose, so a change that breaks a path a real person takes fails here and not in production.

`npm run journeys` starts three throwaway servers and runs 45 journeys. Each one asserts the outcome a customer needs: a clear message, no 5xx, no hang, nothing lost.

| File | Server | Journeys |
|---|---|---|
| `api.mjs` | A: fixture assistant, billing on, no dev bypass | J01–J15 and J28–J30, J32, J34, J35, J36, J39 and J44: happy path, `/start` input mistakes, oversized and heavy uploads, a photo with no product, double-tap, sign-in codes (wrong, reused, expired, pasted with a space), code guessing and spam, second pack locked then paid, members, editor saves with garbage, edits racing the assistant and a stale tab, who may touch whose draft, starting from inside the hub, after submit, asking for a code with an unknown, pending or archived email, running the assistant again on a finished draft, staff start over, pre-claiming a room with someone else's address, the platform health calls (staff only, complete, no secrets), the product card following the tech pack (client edits, staff edits, publish, blanks never erase) |
| `browser.mjs` | A, phone viewport | J20–J27, J31, J33, J26, J37, J38, J40, J41, J42 and J45: every `/start` mistake in the page, no signal on submit, bad server answers (413, 502, 429, 500, HTML 200), triple-tap, expired and missing sessions on the editor link, the code card (resend, wrong email, wrong code), the locked pack and the pay buttons, two tabs on one draft, getting to the tech pack and back (breadcrumbs, the More menu, back lands on the same product), the platform health page (opens from the header, every connection, tabs, chart tooltip and table, phone width), staff Start over in the console editor, a /start session that ends with the editor open, and the Message Future Basics button when checkout will not open, the product card in the hub and the work console following the tech pack |
| `shopify-down.mjs` | B: Shopify unreachable | J16–J17: checkout and unlock with the store down, the `/start` rate limit |
| `model-down.mjs` | C: model API failing | J18, J19 and J43: the customer is told it is on our side and keeps their three tries; staff get one alert, not one per failure |

Needs Postgres at `DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/fbhub_tp`) and `psql` on the path. The browser journeys need Playwright (`PLAYWRIGHT_PATH`, or on the module path); without it they are skipped. Fixture pictures are drawn at run time, nothing binary is committed.

Payments are simulated by marking the pack paid in the database, the same row the Shopify check writes.

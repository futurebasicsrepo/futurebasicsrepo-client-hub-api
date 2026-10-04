# Customer journeys

Scripted customers who make mistakes on purpose, so a change that breaks a path a real person takes fails here and not in production.

`npm run journeys` starts three throwaway servers and runs 37 journeys. Each one asserts the outcome a customer needs: a clear message, no 5xx, no hang, nothing lost.

| File | Server | Journeys |
|---|---|---|
| `api.mjs` | A: fixture assistant, billing on, no dev bypass | J01–J15 and J28–J30, J32, J34, J35, J36: happy path, `/start` input mistakes, oversized and heavy uploads, a photo with no product, double-tap, sign-in codes (wrong, reused, expired, pasted with a space), code guessing and spam, second pack locked then paid, members, editor saves with garbage, edits racing the assistant and a stale tab, who may touch whose draft, starting from inside the hub, after submit, asking for a code with an unknown, pending or archived email, running the assistant again on a finished draft, staff start over, pre-claiming a room with someone else's address |
| `browser.mjs` | A, phone viewport | J20–J27, J31, J33 and J37: every `/start` mistake in the page, no signal on submit, bad server answers (413, 502, 429, 500, HTML 200), triple-tap, expired and missing sessions on the editor link, the code card (resend, wrong email, wrong code), the locked pack and the pay buttons, two tabs on one draft, getting to the tech pack and back (breadcrumbs, the More menu, back lands on the same product) |
| `shopify-down.mjs` | B: Shopify unreachable | J16–J17: checkout and unlock with the store down, the `/start` rate limit |
| `model-down.mjs` | C: model API failing | J18–J19: the customer is told it is on our side and keeps their three tries |

Needs Postgres at `DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/fbhub_tp`) and `psql` on the path. The browser journeys need Playwright (`PLAYWRIGHT_PATH`, or on the module path); without it they are skipped. Fixture pictures are drawn at run time, nothing binary is committed.

Payments are simulated by marking the pack paid in the database, the same row the Shopify check writes.

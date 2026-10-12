# Platform health and connections

`/platform` (menu: Settings → Platform health) shows live checks of everything the platform depends on, grouped:

| Group | Checks |
| --- | --- |
| Infrastructure | Database, file storage, the server |
| Connections to other services | Shopify (and the payment sync), the assistant (Claude), sign-in email, Google sign-in, the render model, 3D models, the automatic studio, photo cutout |
| Listening and AI readers | ChatGPT and Grok (a free "list models" call tells whether the key is good), Reddit (signs in with the key), Hacker News and news, Brave web search, X, Discord, and the listening pipeline as a whole (watches on or failing, posts waiting, today's reading limit, spend, the automatic job) |
| Sales, email and chat | Sales email (key, a verified sending domain, the webhook secret that brings replies and bounces back, the postal address in the footer, and bounces in the last 7 days), website chat (visitors left waiting for a person), sales automations (paused, stuck steps) |
| Builds, stores and delivery | The showcase's GitHub sync (token and requests left), client stores (Shopify, Square, Wix connections and pushes in the last 7 days) |

Below the cards: payments, the web server, background jobs, **settings that can quietly go wrong** (now including the listening keys, the AI readers, sales email setup, the GitHub token and the sealing key for client store tokens), and recent failures.

Rules:
- A check never spends paid quota. Brave and X are judged by the last real listening run of their watches, not by a test search; ChatGPT, Grok, Reddit and Discord use free key checks.
- A service that cannot be reached shows a warning that names it, with the rest of the card's facts still shown.
- No key or secret is returned, only whether it is set.
- The code is `src/platform-coverage.js`; the rules are plain functions covered by `test/platform-coverage.test.js`, and journey J136 checks the whole answer.

## Client sites
Every build with a live address (and not archived) is checked every 5 minutes (job **Site checks**), wherever it is hosted. A check reads the page, times the answer, and looks at the certificate and, once a day, the domain registration.
- **Up / slow / down.** One failed check is a blip and changes nothing; two in a row is **down**; three answers in a row slower than 5 seconds is **slow**. A site behind a sign-in (401 or 403) counts as up; an error page (404, 5xx) or no answer does not.
- **Alerts (today).** Each is said once and again if it comes back after a fix: *down*, *slow*, *back up*, *certificate runs out in N days* (warning at 21, urgent at 7), *domain name runs out in N days* (warning at 30, urgent at 7). Every one is a console notice; down, back up and the urgent expiries are also emailed to staff. One alert policy for all of Health (who hears what, escalation, quiet hours) is the next step.
- **Where it shows.** Platform health has a **Client sites** card (names the site that is down, lists each site's answer time and expiry days), and a project on Home shows **Site up / slow / down** next to its name. `GET /v1/admin/sites` lists every watched site with its 30-day uptime; `POST /v1/admin/sites/check` runs a sweep now.
- **Notes.** The domain lookup uses the public registry service (RDAP) and is best effort: if it cannot tell, nothing is said. Addresses must be public websites. `SITE_SLOW_MS` changes the slow limit. Data: `site_monitors` (current state) and `site_checks` (35 days of history for uptime). Rules in `src/site-monitor.js`, tests in `test/site-monitor.test.js`, journey J159.

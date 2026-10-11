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

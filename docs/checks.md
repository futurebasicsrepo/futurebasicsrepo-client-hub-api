# Checks: what runs before a change is merged

Every pull request is checked by GitHub Actions (`.github/workflows/ci.yml`). Nobody has to remember to run anything. Main is checked again after each merge.

| Check | What it runs | What it proves | How long |
|---|---|---|---|
| **Tests and pattern proof** | `npm test`, then `npm run pattern:proof` | The unit tests pass. Every library garment, bag and plush sews together at every size (see [pattern-process.md](pattern-process.md)). Every API route needs a sign-in or is open for a stated reason. The platform map matches the code. | A few minutes |
| **Customer journeys (core)** and **(lab)** | `npm run journeys`, shared between two machines (`JOURNEY_SUITE=core` is everything but the Design Lab, `lab` is the Design Lab) | Scripted customers and staff drive real servers through the API and a browser, against Postgres, with stand-ins for paid services. About 300 journeys. | Tens of minutes |

The journeys run on pull requests only. Main has just passed them on the pull request that was merged.

One more check uses the paid models, so it does not run on every pull request: **Flats ↔ picture, live** (`.github/workflows/flats-live.yml`). It runs `node scripts/flats-roundtrip.mjs --live`: every piece in the battle test and every real miss kept in `test/fixtures/trip-cases` is drawn from its flats by the image model, checked detail by detail and read back by Claude. That is about one image generation and two Claude vision calls a piece. It fails when the pictures keep fewer of the checked details than the last kept run (`src/lab-trip-baseline.json`), by more than one detail.
- **When it runs:** every Monday; by hand (**Actions → Flats ↔ picture, live → Run workflow**); and on a pull request labelled `trip-live`, for a change to the prompts, the reads or the models.
- **What it needs:** the repository secrets `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` (or `GEMINI_API_KEY`). Without them it fails and says which are missing.
- **Keeping the bar:** run it by hand with **Keep the bar** ticked. A full run that is no worse becomes the new bar; the job prints the new `src/lab-trip-baseline.json` to commit.
- **The report:** each flat, its picture and the flat read back, side by side, under the run's **Artifacts** (`flats-roundtrip`, kept 30 days).

When a check fails, the run keeps what explains it for a week: the proof page (`pattern-proof`) or the journey servers' logs (`journey-logs-core`, `journey-logs-lab`), under the run's **Artifacts**.

A browser journey that fails also prints what its pages said in a pop-up (`the page said: alert: …`), since a page that reports a refused press in an alert shows nothing of it in a picture. It also keeps a picture of each of its pages (`journey-logs-*/shots/J31-2.png`): a timeout says which element never came, and the picture says what was on the screen instead. Locally, `JOURNEY_SHOT_DIR=/some/folder npm run journeys` does the same.

The Studio's latency budget (journey J291, `npm run perf`) is a measurement, and a shared machine only ever adds time to one. So an interaction over its budget is measured a second time, from a fresh browser and the same fixture, and counts only when it is over both times (`runPerfTwice` in `scripts/perf/studio-perf.mjs`). Code that got slower is over every time. The budgets in `scripts/perf/budgets.json` do not move for this.

## Making the checks required

The workflow reports the checks. GitHub only blocks a merge on them when the repository says so:

1. Repository **Settings → Branches → Add branch ruleset** (or a branch protection rule) for `main`.
2. Turn on **Require status checks to pass**.
3. Add **Tests and pattern proof**, **Customer journeys (core)** and **Customer journeys (lab)**.

Railway deploys main on merge. To hold a deploy until the checks pass, turn on **Wait for CI** on the service in Railway.

## Nothing breaks quietly

Journey **J300** is the standing version of a page-by-page audit:

- **Every page opens.** 28 staff and designer pages are opened at a desktop, an iPad and a phone size. None may throw a page error, run off the side of the screen, come up blank, or show `undefined`, `NaN` or `[object Object]`.
- **A failed save says so.** A pattern is saved while the service fails, and again with no connection. The note must be in plain words and say the work is still on the page. Leaving the Studio with the pattern unsaved must ask first.
- **Offline is said.** With no connection, a strip across the top says so, and goes when the connection is back.
- **The server answers once.** A signed-out request must leave no error in the failure log.
- **A broken page is reported.** A page's own failure reaches the failure log, without the token in its link.

## What a person sees when something fails

`src/feedback.js` is loaded on every page that has buttons, the Pattern, Shoe flats and Engineering pages included.

| What happened | What the person is told |
|---|---|
| The request never reached the service | "Could not reach the service. Check your connection and try again. Nothing is lost: what you changed is still on this page." |
| The service failed without a reason of its own | "The service had a problem (500); try again in a moment. Nothing is lost: what you changed is still on this page." |
| The service gave a reason | The reason, in the service's own words |
| The device is offline | A strip across the top, until it is back |
| The page is left with unsaved work | The browser asks first. A page registers its unsaved work with `FBN.guard(() => dirty)`. The Studio asks for its picture, its flats and the pattern or engineering page in its frame. |

## What the team sees when something fails

Platform health (Sites & health in the work console) keeps a failure log (`platform_events`, the newest 500):

- **Server failures** (`web`): any answer of 500 or above, with its route.
- **Unwaited work that failed** (`server`): a promise nobody caught. The service carries on.
- **Outside services** (`anthropic`, `shopify`, `github` and the rest): each failed call.
- **Browser failures** (`browser`): a fault in a page's own code, sent by `src/feedback.js` to `POST /v1/public/client-errors`.
  - Only code faults are sent (a thrown `TypeError`, a missing name). A lost connection, or an answer from the service, is not.
  - At most five a page, and thirty an hour from one address.
  - The link's query is dropped, and a long path segment (an id, a share token) is written as `:id`.

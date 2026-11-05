# Security and keeping our work ours

What protects the platform, and what stops someone from lifting the Design Lab and rebuilding it with AI. The plan runs in phases; this
page records what is in place.

## Already in place (before this work)

- Every API call needs a sign-in (a signed JWT). Staff are held to the modules ticked for them on Team access, and a staff session counts only when it comes through Cloudflare Access on the work console.
- A client's room sees only its own rows (`src/lab-access.js` gate). Journeys J232 and J271 check that one room cannot read or change another's work.
- Sign-in codes are throttled per email and per IP. A session from `/start` works only until the address is verified.
- Security headers go on every response: a content security policy, HSTS, no framing, nosniff and a referrer policy.
- AI prompts and provider keys never leave the server. AI spend is metered per room and capped.
- Share, poll and factory links carry their own unguessable token and send no referrer.

## Phase 1: the Lab's own work only for the people it is open to (`src/guard.js`)

Before this, the Lab's pages, its engines (`/lab/*.js`: the pattern, footwear, 3D assembly, recipe, fabric check and last code) and its drawings (the sketch pack, masks, parts and material photos) were served to anyone. Only the data behind them needed a sign-in. Someone could download the engines and ask an AI to rebuild them.

### How it works

- Every GET under `/lab` needs the **Lab session cookie** `fb_lab`. The cookie is:
  - **Signed** with the server secret.
  - **Scoped to the Lab:** the audience is `lab-pages`, so a sign-in token cannot stand in for it.
  - **Short-lived:** it lasts 12 hours.
  - **Locked down:** it is HttpOnly (page scripts cannot read it), SameSite=Lax, Path=`/lab`, and marked Secure over https.
- The cookie comes from `GET /v1/lab/door`, which runs the same checks as every Lab API call:
  - a valid sign-in;
  - for staff, the Design Lab module;
  - for a client, a room with the Lab open.
  
  A client whose room has no Lab gets `403 LAB_LOCKED` and no cookie.
- **No cookie on a page** (no file extension, such as `/lab/studio`): the reply is a small **door** page, not the Lab. If the browser already holds a sign-in, the door asks for the cookie and reloads once. It never loops: a second try within 8 seconds shows a notice instead. Otherwise the door shows the same notices the Lab gives:
  - "Sign in first";
  - "The Design Lab is not open on your room yet";
  - "The Design Lab is not turned on for you".
- **No cookie on a script or picture:** the reply is `401`.
- **Caching:** every Lab response is marked `private`, so a cache in front of the app (Cloudflare) never hands the engines to someone else.
- **Warm-up:** the work console nav and the client hub (when the room's Lab is open) fetch the cookie quietly once per tab. People going into the Lab from there go straight in.

### Still open on purpose

- `/lab/share/:token` and `/lab/poll/:token`: their token is the key.
- `/lab/nav.js`: the tech pack page uses it.
- `/lab/vendor/*`: open-source code (three.js, polygon clipping).

### Search engines and AI crawlers

- `robots.txt` turns the known AI crawlers away from everything: GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot, Bytespider, Applebot-Extended, meta-externalagent and others. Search engines may see only the public pages (`/`, `/pricing`, `/start`, `/help`, `/join`).
- Every other response carries `x-robots-tag: noindex, nofollow, noarchive`.
- This only stops crawlers that obey it. The cookie is what actually keeps the Lab closed.

J276 checks all of this:
- the engines and pages are refused signed out;
- the door's checks hold;
- a sign-in token passed off as the cookie, or a tampered cookie, is refused;
- share and poll links stay open;
- a signed-in browser goes straight through, including to `/lab#board`;
- the locked and signed-out notices show;
- robots and noindex are right.

## Phase 2: catch copying (`src/watch.js`)

Phase 1 keeps strangers out. Phase 2 is for someone who has a real account and uses it to pull the libraries out wholesale, or passes our files on.

### Read limits on the libraries

Each account's pulls are counted per hour, by kind:

| Kind | What counts | Notice at (per hour) |
|---|---|---|
| Full-size sketches | `/lab/flat-templates/*`, masks, parts | 300 |
| Sketch thumbnails | `/lab/flat-templates/thumbs/*` | 3,000 |
| Swatches and material photos | `/lab/material-photos/*`, `/v1/lab/materials/:id/swatch` | 600 |
| Graphic files | a library graphic's vector and stitch files | 150 |
| Technique photos | technique photos and samples | 300 |
| Exported files | any download (a response with a file name) | 60 |

- Ordinary work stays far below these. Past the notice level, an **unusual pull** is recorded once that hour.
- Past **five times** the notice level, a **client** account is paused on that kind for the rest of the hour: the reply is `429` with code `PULL_LIMIT` and a plain sentence saying to ask Future Basics. The rest of the Lab keeps working.
- **Staff are never paused**, only recorded.
- Who counts: the signed-in account (the API sign-in or the Lab page cookie); without one, the address.

### A reference in every export

- Every download gets a reference (`ABCD-1234-EF56`), logged in `export_log` with the account, room, address, path, file name, type and size. The reply carries it in `x-export-ref`.
- For the design work (everything the Lab exports, and a tech pack's factory package), the reference is written into the file itself, with the date, the room and "not for redistribution or AI training":
  - SVG, HTML: a comment at the top (after the XML declaration);
  - DXF: a 999 comment line; STEP: a comment after the header line;
  - STL: the 80-byte header (binary) or the `solid` line (ASCII);
  - PDF: the document's keywords, added as an incremental update so the pages are untouched;
  - zip: a `FUTURE-BASICS-EXPORT.txt` manifest alongside the other files.
- CSV, pictures and stitch files are recorded but not changed (a line inside would break them).
- Not changed either: invoices, contracts, a client's own uploads, and a Shopify theme zip (the store refuses anything extra at its root).
- **Tracing a file:** staff look a reference up with `GET /v1/admin/exports/:ref`. It answers who took the file, from which room, when, and what it was.

### On Platform health

The **Copy watch** card (group *Security and copying*) shows files exported in the last day and the latest unusual pulls and pauses (who, which room, how many of what). It turns amber on an unusual pull and red on a pause in the last day. Events live in `security_events`.

J277 checks this end to end:
- a client's vector file carries its reference and staff can trace it;
- 750 pulls in an hour all answer, the 151st is recorded;
- the 751st is paused and recorded;
- the rest of the Lab keeps working, and staff are not paused;
- the Platform card shows the pause.

Unit tests (`test/watch.test.js`) check every file format still reads after marking.

## Phase 3: harden

### Pinned dependencies

- `package-lock.json` pins every package, and the Docker build installs with `npm ci --omit=dev`, so production runs exactly the versions that were tested. The old `pnpm-lock.yaml` (out of date, and unused by the build) is gone.
- `npm run audit:deps` checks the production packages against known advisories and fails on high or critical ones. Run it with the tests, and before a deploy.
- To update a package: `npm install <name>@<version>`, run the tests and journeys, commit the lockfile with it.

### Every route needs a sign-in, or a reason

`test/route-auth.test.js` reads every API route in `src/*.js` (about 720). A route passes when it has a sign-in check (a `preHandler`). The open ones are each on a list with the reason they are open:
- signing in itself;
- links whose token is the key (factory, share, poll, contracts, invitations);
- the visitor chat;
- signed webhooks and OAuth callbacks;
- development helpers that answer 404 in production;
- the public pricing information.

A new route without a sign-in fails the test until someone adds it to the list with a reason. No staff or Lab route may be on it. Which room a signed-in person can reach is checked by the journeys (J232, J271 and others).

### Sign out everywhere

- Every person has a "signed out at" time (`users.sessions_valid_after`). Any session issued before it stops working at once: the API sign-in (`401 SIGNED_OUT`) and the Lab page cookie (the engines refuse it, the pages show the door).
- **A client:** *Your team* in the hub has **Sign out everywhere** on their own row (for a lost phone or laptop). It signs this device out too.
- **Staff for a client's person:** `POST /v1/admin/users/:id/sign-out`.
- **Danielle and Kyle for anyone on the team:** **Sign out everywhere** on each card on Team access. Other staff cannot sign out someone on the team.
- Signing in again works straight away (a session from the same second as the sign-out is ended too).
- The Lab cookie also stops working when its person is taken off their room's team, or moved to another room.
- Sessions still last 7 days (the Lab cookie 12 hours). With sign-out everywhere in place, there is no need to make everyone sign in more often.

J278 checks sign-out everywhere end to end.

### Terms of use

`docs/terms-draft.md` has draft clauses for a lawyer to review:
- no copying or rebuilding the platform;
- no reverse engineering;
- no scraping or bulk downloading;
- no training or prompting AI on the platform to build a rival;
- no sharing sign-ins;
- the download record and file references, and automatic pauses.

It is not in force or shown anywhere yet.

### The shared workspace and sample reviews stay in the room

- Team chat (`src/team-chat-routes.js`): a room's channels are its own. Staff read and write only in channels the team brought Future Basics into (by switching it on, or by `@futurebasics`); every other channel is refused to them as not found. Another room is refused everything.
- The board and presence (`src/workspace-routes.js`): tasks go only to someone on the room's team or to Future Basics; a heartbeat is accepted only for a pack, review or concept in the person's own room. A client preview never shows as a person and cannot write.
- Sample reviews (`src/sample-form-routes.js`): only the room and staff reach a review; the form a client gets carries no costs, suppliers or prices; only staff write a review into the pack.
- A staff save of a tech pack made from an older copy is refused when someone else saved in between (`tech_packs.updated_by`), so a hand-over or a colleague's edit is never wiped.
- Journeys J282 and J283 try each of these from a second room, a preview and a staff session.

## Next phase

- **Phase 4 (optional):** move the most valuable engine work (pattern drafting, 3D assembly) to the server, so the browser gets results, never the method.

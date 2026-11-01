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

## Next phases

- **Phase 2, catch copying:**
  - Per-account read limits on the libraries (sketches, materials, techniques, graphics), with an alert on Platform health for unusual pulls.
  - An account fingerprint in every export: PDF metadata, an SVG comment, a zip manifest.
- **Phase 3, harden:**
  - A lockfile and a dependency audit with the tests.
  - An automated test that every API route refuses signed-out users and other rooms.
  - Shorter sessions with revocation.
  - Terms-of-use wording (no scraping, no reverse engineering, no training AI on the output) for a lawyer to review.
- **Phase 4 (optional):** move the most valuable engine work (pattern drafting, 3D assembly) to the server, so the browser gets results, never the method.

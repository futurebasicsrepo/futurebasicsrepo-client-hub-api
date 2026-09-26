# incha.tv

A fan-first media platform by INCHA Studios. Fans upload clips and photos, lightly edit them, and publish them publicly, unlisted, or privately. Others can upvote, comment, and share.

```
incha-tv/
  api/   Fastify + Postgres API, serves media        → Railway
  web/   Next.js (App Router) frontend               → Vercel
```

## What v1 does

- **Accounts.** Email/handle + password sign-up and sign-in (scrypt hashes, 30-day JWT). Profiles have a display name and bio.
- **Upload.** Drag-and-drop any phone video (MP4, MOV including iPhone HEVC, WebM, MKV, 3GP) or JPG/PNG/GIF/WebP images up to 500 MB, with a progress bar. Every upload starts as a private draft.
- **Media conversion.** Every uploaded video is converted in the background (ffmpeg) to H.264/AAC MP4 with fast-start, at most 1080p, so it plays in every browser and phone. Files that are already H.264/AAC are only remuxed, which takes seconds. A poster frame is grabbed automatically if the creator hasn't set a cover. Studio shows "Converting…" and swaps in the new file when it's done. Creators can publish straight away; the post shows up in feeds once it's playable. Conversions resume after a restart.
- **Light editing (Studio).**
  - Trim with start/end handles or "start/end at playhead". The original file is kept; the trim window is applied at playback, so it can be changed later.
  - Cover frame: grab the current video frame, or upload an image.
  - Looks: six filter presets (Raw, Terrace, Matchday, Floodlight, Vintage, Mono).
  - Title, description, and fandom. Picking a fandom that doesn't exist creates it.
- **Publishing.**
  - **Public:** shows in the feed, fandom pages, and profile.
  - **Unlisted:** anyone with the link can watch.
  - **Private:** only the owner can see it.
  - A post can be unpublished back to a draft, or deleted (which also deletes its files).
- **Feed.** Hot (score with time decay), New, and Top. Can be filtered by fandom or creator, and searched by text.
- **Engagement.**
  - Upvotes: one per user, toggle on and off, updated optimistically in the UI.
  - Comments are threaded one level deep. Authors can delete their own comments, and post owners can remove any comment on their post.
  - View counts are de-duplicated per viewer for 30 minutes.
- **Sharing.**
  - Native share sheet on mobile.
  - Copy link, WhatsApp, X, Facebook, Reddit, and email.
  - Server-rendered Open Graph and Twitter tags on `/p/:id`, so links unfurl with the cover image.
- **Media privacy.** Public media is served at stable, cacheable URLs. Draft, unlisted, and private media need a signed URL (HMAC with expiry), which the API only issues to viewers allowed to see the post. All media supports HTTP range requests, so video seeking works.

## Brand

The tokens live at the top of `web/app/globals.css`: ink black, cream paper, a flare-orange accent, Anton for display type, and Inter for body text. The direction comes from INCHA's Philly and soccer terrace culture ("En las buenas y en las malas"). Swap in the official brand hex values and typefaces there, and the whole UI follows.

## Local development

```bash
# API (needs Postgres)
cd incha-tv/api
cp .env.example .env            # set DATABASE_URL, JWT_SECRET
npm install
node --env-file=.env src/server.js   # http://localhost:4000

# Web
cd incha-tv/web
cp .env.example .env.local      # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                     # http://localhost:3000
```

Tests:

```bash
cd incha-tv/api
npm test                                                     # unit tests
TEST_DATABASE_URL=postgres://…/incha_test npm test           # + full API flow (drops & recreates tables!)
cd ../web && npm run typecheck && npm run build
```

## Deploying

### Current environments

| | Where | URL |
| --- | --- | --- |
| Web | Vercel, **Future Basics** team, project `incha-tv` | https://incha-tv-future-basics.vercel.app |
| API | Railway project `incha-tv` → service `incha-api` (root `/incha-tv/api`, volume `/data`) | https://incha-api-production.up.railway.app |
| DB | Railway project `incha-tv` → `Postgres` (referenced as `${{Postgres.DATABASE_URL}}`) | private network only |

Config-as-code (`railway.json`) is deprecated on Railway, so the service's build and deploy settings live on the service itself. The file here is kept as documentation. The API service deploys from the PR branch until it merges; point it at `main` after that.

### Railway (API + Postgres + media volume)

1. Create a new Railway project with a **PostgreSQL** database.
2. Add a service from this GitHub repo and set **Root Directory** to `incha-tv/api`. The service picks up `railway.json` and the `Dockerfile` there.
3. Attach a **volume** mounted at `/data`. Uploads are stored in `/data/media`.
4. Set these variables:
   - `DATABASE_URL`: reference the Postgres service's `DATABASE_URL`.
   - `JWT_SECRET`: a long random string.
   - `MEDIA_SECRET`: optional. Another long random string for signing media URLs.
   - `ALLOWED_ORIGINS`: `https://incha.tv,https://www.incha.tv,https://*.vercel.app`
   - `PUBLIC_API_URL`: for example `https://api.incha.tv`.
   - Optional: `MAX_LIVE_STREAMS` (default 3), `TRANSCODE_CONCURRENCY` (default 1), `TRANSCODE=off` to skip conversion.
   - The Docker image installs ffmpeg. Live segments and recordings live in `/data/live` on the same volume.
5. Add the custom domain `api.incha.tv`. The health check is `/health`. Tables and starter fandoms are created automatically on boot.

### Vercel (web)

1. Import the repo and set **Root Directory** to `incha-tv/web`. The framework is detected as Next.js.
2. Set the environment variables `NEXT_PUBLIC_API_URL=https://api.incha.tv` and `NEXT_PUBLIC_SITE_URL=https://incha.tv`.
3. Add the domains `incha.tv` and `www.incha.tv`.

## API reference

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/v1/auth/signup` | – | `{ email, handle, password, displayName? }` |
| POST | `/v1/auth/login` | – | `{ login (email or handle), password }` |
| GET/PATCH | `/v1/me` | ✓ | PATCH `{ displayName?, bio? }` |
| GET | `/v1/me/posts` | ✓ | All of your posts, including drafts |
| GET | `/v1/posts` | – | `sort=hot\|new\|top`, `fandom`, `creator`, `q`, `limit`, `offset` |
| POST | `/v1/posts` | ✓ | multipart `file` → draft post |
| GET | `/v1/posts/:id` | – | public/unlisted, or owner |
| PATCH | `/v1/posts/:id` | owner | `title, description, fandom, filter, visibility, duration, trimStart, trimEnd` |
| POST | `/v1/posts/:id/cover` | owner | multipart `file` (JPG/PNG/WebP) |
| POST | `/v1/posts/:id/publish` | owner | `{ visibility }` |
| POST | `/v1/posts/:id/unpublish` | owner | back to draft |
| DELETE | `/v1/posts/:id` | owner | deletes files too |
| POST | `/v1/posts/:id/vote` | ✓ | `{ value: 1\|0 }` (omit to toggle) |
| POST | `/v1/posts/:id/view` | – | de-duplicated per viewer |
| GET/POST | `/v1/posts/:id/comments` | POST ✓ | `{ body, parentId? }` |
| DELETE | `/v1/comments/:id` | author / post owner | |
| GET | `/v1/fandoms`, `/v1/fandoms/:slug`, `/v1/users/:handle` | – | |
| GET | `/media/:key` | public, or signed `?exp&sig` | Range requests supported |
| POST | `/v1/matches` | ✓ | `{ home, away, competition?, venue?, kickoffAt?, halfLength?, youth?, visibility? }` — creator is the scorekeeper |
| GET | `/v1/matches` | – | `filter=live\|upcoming\|recent`, `team`; public, non-youth only |
| GET | `/v1/me/matches` | ✓ | matches you keep score for |
| GET | `/v1/matches/:id` | – | match + events + clips (`canScore` for the scorekeeper) |
| GET | `/v1/matches/:id/stream` | – | Server-Sent Events: `update` with the full snapshot on every change |
| POST | `/v1/matches/:id/events` | scorekeeper | `{ type: kickoff\|halftime\|second_half\|fulltime\|goal\|yellow\|red\|note, side?, player?, minute? }` |
| DELETE | `/v1/matches/:id/events/:eventId` | scorekeeper | undo a goal, card or note |
| GET | `/v1/teams/:slug` | – | team, W/D/L record, matches |
| POST | `/v1/matches/:id/streams` | ✓ | go live on a match (not youth, not finished) → `{ stream }` with `hlsUrl` |
| POST | `/v1/streams/:id/chunks?seq=n` | streamer | `application/octet-stream` MediaRecorder chunk (≤ 8 MB); returns `{ next }`, 409 with `next` when out of order |
| POST | `/v1/streams/:id/end` | streamer | stop and save the recording → `{ stream, replayPostId }` |
| GET | `/v1/streams/:id` | – | stream status |
| GET | `/live/:id/index.m3u8`, `/live/:id/segNNNNN.ts` | – | HLS for viewers |

Clips join a match via `PATCH /v1/posts/:id { matchId, matchMinute }`. Youth matches are always unlisted, never appear in lists, and their clips can't be published publicly.

## Match centre

### Go live

Anyone signed in can stream a match from their phone's browser. There's no app to install and no stream key.

- The phone records with `MediaRecorder` (WebM on Chrome/Android, fragmented MP4 on iPhone Safari) and posts one-second chunks to `POST /v1/streams/:id/chunks?seq=n`. Chunks are sent in order, retried through signal drops, and deduplicated by sequence number.
- For each stream, the API runs one ffmpeg process that encodes 720p H.264/AAC into a rolling HLS playlist at `/live/:id/index.m3u8` (2-second segments). Viewers watch it about 10 seconds behind, with native HLS on Safari and hls.js elsewhere. At the same time it writes a recording.
- When the streamer stops, or the phone goes quiet for 30 seconds, the recording becomes a **private draft clip** in their Studio, attached to the match at the minute the stream started. From there they can trim the goal and post it.
- Several fans can stream the same match. Viewers switch between "cams" on the match page, and match cards show a "Live video" badge.
- Limits: one stream per person, `MAX_LIVE_STREAMS` at once across the server (default 3, since each stream uses about 1–2 vCPU), and 3 hours per stream. **Youth matches can't be streamed.**
- If the API restarts mid-stream, the stream is closed and what was recorded so far is saved.

Anyone signed in can start a match and becomes its scorekeeper: kick-off, goals (with scorer), cards, half time and full time are tapped in from the sideline and pushed to every viewer over Server-Sent Events. Fans at the game attach clips at a minute, and the match page reads like a live blog. The live-update fan-out is in-process, so the API should stay on one instance until it moves to Redis/Postgres `LISTEN/NOTIFY`.

## Next steps (not in v1)

- Push notifications for goals, co-scorekeepers, "clip that" instant replay, and auto highlight reels per match.

- **Transcoding at scale.** Conversion and live encoding run inside the API process, which is fine for one instance. Past that, move them to a separate worker service, and move media to object storage.
- **Object storage.** Move media to S3/R2 or Railway Buckets with a CDN in front. `api/src/storage.js` is the only file that changes.
- **Email.** Verification and password reset via Resend.
- **Moderation.** Report button, admin queue, rate limits backed by Redis once there's more than one API instance.
- **Growth.** Follows, notifications, and a "for you" feed.
- **Product.** Merch links to the INCHA shop on creator and fandom pages.

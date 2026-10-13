# Builds showcase

A sign-in-gated place where Future Basics shows clients and prospects the technical work it has built (Spot, Benny's Beans, Modish Nail Spa, NursePartners, Common Ground, Cuesea, incha.tv, …) and, later, houses builds made for clients so they can be reviewed privately.

It is served by the same service as the hub and work console, on its own host: **builds.thefuturebasics.com**.

## Who sees what

Every build has a **visibility**:

| Visibility | Who can see it |
|---|---|
| `listed` | every existing client, and anyone holding an invite for "all listed builds" |
| `invite` | only people invited to that particular build |
| `hidden` | staff only (a draft, or something withdrawn) |

An **invite** is an email address, an optional build (none = all listed builds), an expiry (default 30 days) and can be revoked at any time. Archived builds are visible to staff only.

Staff see every build, and their own views are not recorded.

## Sign-in

No passwords. A visitor enters their email; if the address belongs to a client, a staff member or holds an active invite, a six-digit code is emailed from @thefuturebasics.com. The response is identical whether or not the address is known (no enumeration). A correct code sets an HttpOnly cookie `fb_builds` (14 days). Codes reuse the hub's `login_codes` table, throttling and attempt limits.

## What gets recorded

Each time a signed-in non-staff person opens a build page (`open`) or follows "Open the live build" (`demo`), a row goes to `build_views`. Staff read it in **Builds admin → Activity**: who looked at what, when, and whether they went on to the live build. This is the warm-lead signal for follow-up.

## Staff page

### The collection page
`builds.` looks like a store's collection page. Each build is a product card: a window onto the real site, its sector and status, its first three key features (the "highlights" staff write), what it is built with, and when it last changed. The left side filters by sector, status and technology (counts follow the other filters; on a phone they sit behind a Filters button); search covers names, taglines, sectors, technologies and features; sort by featured order, recently updated or A to Z. A build opens as a product page: the picture, status / updated / feature count, the live button and extra links, every feature, what it is built with, what's new, and more builds underneath.

**Pictures.** A card shows the cover staff uploaded; if none, a bundled picture of the real site from `src/builds-previews/<slug>.jpg`; if neither, a placeholder. Refresh the bundled pictures with `node scripts/capture-build-previews.mjs [slug…]`. A store behind Shopify's password page needs its password in the environment for the run (`CAPTURE_PASSWORDS="slug=password"`); passwords are never written to the repo. To add a build to the script, add its address to `SITES` there and run it for that slug.

`/builds/admin` (work console sign-in): add, edit, reorder and hide builds; upload a cover image (shrunk in the browser); manage invites; read activity.

**Also see** (extra links): each build can carry up to eight more links, one per line as `Label — https://address`: a walkthrough, a demo, hardware drawings, a store preview. Visitors see the labels under "Also see" and clicking one goes through the showcase (`/builds/go/<slug>/<n>`), which records the look like the live-build link and then sends them on. The address itself is never sent to the viewer's page. Only web addresses are accepted. A link on an artifact or any page that is shared outside the showcase is not protected by the sign-in; use it for demos with stand-in data. The seed list (below) is created **hidden**, so nothing is public until it has been reviewed there.

## Seed builds

Created once, hidden: Spot, Benny's Beans, Modish Nail Spa, NursePartners, Common Ground, Cuesea (details to fill in), incha.tv (no live URL yet). Add vtpconcept, cg12concept and others from the admin page.

## Services we host for a client

A service we run for a client (today: the Common Ground **make-an-offer service** on our Railway account) has a **hidden entry** on Builds, made once at start if it is missing (`HOSTED_SERVICES` in `src/builds.js`). Its address is the service's health page, so the site checks watch it like any client site (up, slow, down, with an alert) and it shows on Platform health and the work home. Staff can edit it afterwards or archive it; it is not put back. To keep another service we host under watch, add it to that list.

## Housing a client's build

A build we host (a static site or a small app on Railway) can be kept private with the showcase's sign-in. Put Caddy in front of it and use `forward_auth`:

```caddyfile
client-demo.thefuturebasics.com {
  forward_auth https://builds.thefuturebasics.com {
    uri /v1/builds/auth/check?slug=client-demo
    copy_headers Cookie
  }
  reverse_proxy client-demo.internal:3000
}
```

`/v1/builds/auth/check?slug=…` answers `200` when the cookie belongs to someone who may see that build and `401` otherwise. For the cookie to reach `client-demo.thefuturebasics.com`, set `BUILDS_COOKIE_DOMAIN=.thefuturebasics.com`. A 401 should redirect the visitor to `https://builds.thefuturebasics.com/#/<slug>` to sign in.

## Keeping it current as the apps change

Each build can say where its code lives: the **Repository** address (GitHub) and, when the build is a folder inside a bigger repository, the **Folder**. Most of ours live in the hub repository (Spot in `spot/`, the coffee, nail and home care sites in `sites/…`, the Common Ground theme in `themes/common-ground`); the piggy bank and incha.tv (`futurebasicsrepo/incha-tv`, moved out of the hub's `incha-tv/` folder) have their own repositories. A build whose code moves follows it at the next start, unless staff have already pointed it elsewhere (`MOVED_BUILD_REPOS` in `src/builds.js`). Existing builds are filled in once, at the first start after this change, and only where staff have not set anything.

Every hour (or when you press **Check GitHub now** on the *What's new* tab) the service looks at each build's repository:

- **Updated date.** The newest commit that touched the build's folder. Cards show "Updated Oct 9"; a build page shows it above its news.
- **What's new.** Each pull request merged into the default branch that touched the build's folder is queued, cleaned up into a plain line (no "feat:", no "(#227)", no full stop), on the *What's new* tab. Staff publish it, editing the words first if they like, or dismiss it. A build can be set to **publish its changes automatically** instead. Staff can also write a line by hand for changes that do not come through GitHub.
- The first look at a build only records the time; it does not put the build's history in the queue.
- Visitors only ever get the cleaned line and its date. The pull request's own title, number and address, and any sync problem, stay with staff.
- A repository GitHub cannot read (wrong address, or a token that cannot see it) is shown on that build's row in words staff can act on, and does not stop the others.

Needs one setting on the hub service: **`BUILDS_GITHUB_TOKEN`** (or `GITHUB_TOKEN`), a read-only GitHub token (fine-grained: *Contents*, *Pull requests* and *Metadata* read) for every repository whose builds are listed. Without it the hourly job does not run and public repositories can still be checked with the button. The job appears on the Platform page as "Showcase update sync".

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `BUILDS_URL` | `https://builds.thefuturebasics.com` | where sign-in emails link to |
| `BUILDS_GITHUB_TOKEN` | unset | read-only GitHub token so the showcase can follow each build's repository (see above) |
| `BUILDS_COOKIE_DOMAIN` | unset (host-only cookie) | share the sign-in with housed builds on sibling subdomains |

JWT secret, mail sending and the database are the service's existing settings.

## Going live

1. Merge, deploy.
2. Railway → the service → Settings → Networking → add custom domain `builds.thefuturebasics.com`; add the CNAME it shows at the DNS provider.
3. Open `/builds/admin`, review the seeded builds, fill in Cuesea, set visibility to `listed` for the ones to show clients, and invite people.

## API (summary)

Viewer: `POST /v1/builds/auth/code|verify|logout`, `GET /v1/builds/me`, `GET /v1/builds`, `GET /v1/builds/:slug`, `GET /v1/builds/:slug/cover`, `GET /builds/go/:slug` (tracked redirect to the live build), `GET /builds/go/:slug/:n` (the same for extra link *n*).
Staff: `GET|POST /v1/admin/builds`, `PUT|DELETE /v1/admin/builds/:id`, `PUT|GET /v1/admin/builds/:id/cover`, `GET|POST /v1/admin/builds/invites`, `DELETE /v1/admin/builds/invites/:id`, `GET /v1/admin/builds/activity`, `POST /v1/admin/builds/sync`, `GET /v1/admin/builds/updates?status=`, `PUT /v1/admin/builds/updates/:id`, `POST /v1/admin/builds/:id/updates`.

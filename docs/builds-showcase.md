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

`/builds/admin` (work console sign-in): add, edit, reorder and hide builds; upload a cover image (shrunk in the browser); manage invites; read activity.

**Also see** (extra links): each build can carry up to eight more links, one per line as `Label — https://address`: a walkthrough, a demo, hardware drawings, a store preview. Visitors see the labels under "Also see" and clicking one goes through the showcase (`/builds/go/<slug>/<n>`), which records the look like the live-build link and then sends them on. The address itself is never sent to the viewer's page. Only web addresses are accepted. A link on an artifact or any page that is shared outside the showcase is not protected by the sign-in; use it for demos with stand-in data. The seed list (below) is created **hidden**, so nothing is public until it has been reviewed there.

## Seed builds

Created once, hidden: Spot, Benny's Beans, Modish Nail Spa, NursePartners, Common Ground, Cuesea (details to fill in), incha.tv (no live URL yet). Add vtpconcept, cg12concept and others from the admin page.

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

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `BUILDS_URL` | `https://builds.thefuturebasics.com` | where sign-in emails link to |
| `BUILDS_COOKIE_DOMAIN` | unset (host-only cookie) | share the sign-in with housed builds on sibling subdomains |

JWT secret, mail sending and the database are the service's existing settings.

## Going live

1. Merge, deploy.
2. Railway → the service → Settings → Networking → add custom domain `builds.thefuturebasics.com`; add the CNAME it shows at the DNS provider.
3. Open `/builds/admin`, review the seeded builds, fill in Cuesea, set visibility to `listed` for the ones to show clients, and invite people.

## API (summary)

Viewer: `POST /v1/builds/auth/code|verify|logout`, `GET /v1/builds/me`, `GET /v1/builds`, `GET /v1/builds/:slug`, `GET /v1/builds/:slug/cover`, `GET /builds/go/:slug` (tracked redirect to the live build), `GET /builds/go/:slug/:n` (the same for extra link *n*).
Staff: `GET|POST /v1/admin/builds`, `PUT|DELETE /v1/admin/builds/:id`, `PUT|GET /v1/admin/builds/:id/cover`, `GET|POST /v1/admin/builds/invites`, `DELETE /v1/admin/builds/invites/:id`, `GET /v1/admin/builds/activity`.

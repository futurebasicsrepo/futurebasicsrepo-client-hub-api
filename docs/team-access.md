# Team access

Danielle and Kyle decide which parts of the work console each person on the team can open. A person sees, and the service serves them, only the modules ticked for them.

The page is **Team, Team access** in the work console menu (`/team`). It is only for the owners.

## Who is an owner

The people named for Money (`MONEY_ACCESS_EMAILS`, default Danielle and Kyle) are the owners. `ACCESS_ADMIN_EMAILS` (comma separated, `@domain.com` names a whole domain) replaces that list for this page only. Owners always have everything, cannot be restricted or paused, and are the only ones who can open Team access.

## The modules

| Module | What it opens |
| --- | --- |
| Messages and chats | the client message inbox and the website chats |
| Contacts and sales | contacts, companies, pipeline, tasks, opportunities, sales email and templates |
| Sales automations | automatic follow-ups and sequences |
| Press | releases, pitches, the media list, coverage |
| Contracts | drafting, sending and tracking agreements (signing for Future Basics stays with the Money people) |
| Intelligence | signals and their sources |
| Site prototypes | prototypes for prospects and the lead finder |
| Builds showcase | the showcase of what we build, its viewers and invites |
| Clients and projects | client rooms, projects, products and tech packs, approvals, production, quotes, files, assistant learning |
| Factories | the factory list, map, skills and assigned work |
| Platform health | health checks, connections, usage |
| Brand and assets | logos, fonts, colours, downloads |
| Design Lab | what other brands make and what is selling, our brand code, line plans and concepts (see `docs/design-lab.md`). **Held back**: never part of Everything or of the default for new people; an owner ticks it for a person on purpose |

Not modules: **My day** (open to everyone on the team, but each part of it only shows what the person has been given), **Money** and signing for Future Basics (the Money list), **Team access** (owners only) and changing the **Payment gate** (the owners only; anyone with Clients and projects can read it).

## What a person sees

- The menu only shows what they can open: a part they cannot open is not among the tabs, and a section with nothing in it disappears from the sidebar.
- A page that belongs to one module (Contracts, Intelligence, Prototypes, Builds, Factories, Platform health, Brand) says "This part of the console is not turned on for you" and who to ask, instead of showing an empty page.
- On the pages that hold several modules (Sales, the client console) a part they cannot open is refused with the same message at the top of the page.
- It is enforced by the service, not only hidden: a request for a module they were not given is refused (`403`, `code: MODULE_ACCESS`) whichever way it arrives. This includes the routes staff share with clients to work inside a client's room.

## What the owners do on the page

- **New people start with**: what someone gets the first time they sign in with a @thefuturebasics.com address, until an owner looks at them. It starts as nothing (they see My day and nothing else).
- **The team**: one card per person, with the modules in groups. **Start from** ticks the usual set for a role (Sales, Delivery, Everything, Nothing yet) and the boxes can still be changed. A **note** is private to the owners. **Pause access** shuts the person out of the whole console until it is turned back on; nothing is deleted and their modules are kept.
- People nobody has looked at yet are listed first, open, and the menu shows the owners how many are waiting.
- Each card says when the person **first signed in** (when their account was made) and when they **last signed in**, by Google or by an emailed code. Sign-ins are recorded from 26 October 2026; before that only emailed-code sign-ins left a trace, so those were filled in and a Google-only person shows "no sign-in recorded" until their next one. A session lasts seven days, so someone can be working without a new sign-in for up to a week.
- **Recent changes** records who changed what, and when.

## When this went live

Everyone who was staff at that moment was given every module (except the held-back Design Lab), so nothing changed for them until an owner restricts them. People who sign in for the first time afterwards start with the owners' default.

## Settings

| | |
| --- | --- |
| `ACCESS_ADMIN_EMAILS` | who the owners are for this page (default: the Money list) |
| `STAFF_ACCESS_DEFAULT` | where "New people start with" begins before an owner saves one: `all`, a comma separated list of module ids, or nothing (default). Once an owner saves the default on the page, that wins. The journey suite sets it to `all` for its throwaway staff. |

## Where it lives

| | |
| --- | --- |
| Modules, which route belongs to which, who is an owner, the check | `src/staff-access.js` (no web server in it) |
| The owners' API and a person's own `me` | `src/staff-access-routes.js` |
| The page | `src/team.html` at `/team` |
| The check on every staff request | `authenticate` in `src/server.js`, by route pattern (also how My day leaves out what a person cannot open) |
| The menu and the no-access notices | `src/console-nav.js` |
| Tables | `staff_access` (one row per person), `staff_access_log` |
| Tests | `test/staff-access.test.js`, journeys J190 (API) and J191 (browser) |

A change takes effect straight away on the instance that saved it and within about ten seconds on any other.

## Not covered

- Emails the platform sends to the whole team (a new message, a new lead) go to the notification address, not per person.
- A person with Contacts and sales can see the client's name wherever a contact is linked to a client; they cannot open the client's room without Clients and projects.
- A staff member who is also named in `MONEY_ACCESS_EMAILS` is an owner for this page too.

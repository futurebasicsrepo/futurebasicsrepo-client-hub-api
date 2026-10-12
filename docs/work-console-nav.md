# Work console navigation

The staff pages (`/admin`, `/sales`, `/builds/admin`) share one left-hand menu, drawn by `src/console-nav.js` (served at `/console-nav.js`). A page adds `<script src="/console-nav.js" defer></script>` and nothing else; the menu hides itself while the page shows its sign-in panel.

## How it is grouped
The menu follows the stage of the work, in the order a teammate meets it, so one generalist can carry a customer from first hello to final invoice.

| Group | Items | Where each lives |
| --- | --- | --- |
| My day (top) | My day | `/home`: this week, **My accounts**, who to reach out to, prototypes, projects in flight |
| Inbox | Messages, Chats | `/admin#inbox`, `/sales#chats` |
| People | Contacts, Clients, Tasks, Fair contacts | `/sales#contacts`, `/admin#clientsHead`, `/sales#tasks`, `/admin#partnersSection` |
| Win | Sales today, Pipeline, Opportunities, Intelligence, Site prototypes, Builds showcase, Automations, Press | `/sales#today|pipeline|opportunities|automations|press`, `/intel`, `/prototypes`, `/builds/admin#builds` (its What's new, Invites and Who looked are tabs on that page) |
| Deliver | Projects, Waiting on approval, Production attention, Factories, Assistant learning | `/home#projPanel`, sections of `/admin`, `/factories` |
| Money | Money (only for the people it is open to), Payment gate | `/money`, `/admin#accessPanel` |
| Sites and health | Platform health, Connections | `/platform` (its Client sites card), `/admin#connections` |

Every place the old menu led to is still one click away; items only moved. Nothing that does a different job was merged: the three production queues stay separate sections.

## Behaviour
- Sales and Builds admin read `#tab` from the address, so a menu item opens straight to a tab and the tabs keep the address in step.
- On `/admin` the menu scrolls to a section (closing Platform health or a client's room first); arriving from another page waits for the data to load, then scrolls.
- The marker shows where you are: by address and tab on Sales / Builds, by scroll position on the console home.
- Badges mirror counts the page already draws (`#mcCount` for Messages, `#chatCount` for Chats, `#taskCount` for Tasks, `#oppCount` for Opportunities, `#newCount` for Builds showcase).
- Desktop: "Collapse" shrinks it to an icon rail (remembered; a client's room starts collapsed because it has its own rail). Phone: a button in the header opens it as a drawer.

To add an item, edit `NAV` at the top of `console-nav.js`.

**Update:** Home now goes to `/home` (leads, prototypes, projects in flight; see `work-home.md`). The old home with the client list and production queues is the page `/admin`, reached by **Clients** (its top is marked Clients in the menu).

# Work console navigation

The staff pages (`/admin`, `/sales`, `/builds/admin`) share one left-hand menu, drawn by `src/console-nav.js` (served at `/console-nav.js`). A page adds `<script src="/console-nav.js" defer></script>` and nothing else; the menu hides itself while the page shows its sign-in panel.

## How it is grouped
Four groups by the kind of work, with My day and the Design Lab on their own at the top level. (The earlier nine groups were by stage of the work; Win had become a grab-bag of ten unrelated things, Money and Team held one or two items each, and the Design Lab alone took six lines.)

| Group | Items | Where each lives |
| --- | --- | --- |
| My day | My day | `/home`: this week, **Start a tech pack**, My accounts, who to reach out to, prototypes, projects in flight |
| Inbox | Messages, Chats | `/admin#inbox`, `/sales#chats` |
| Clients | Clients, Projects, Waiting on approval, Production attention, Factories, Contracts, Assistant learning | `/admin#clientsHead`, `/home#projPanel`, sections of `/admin`, `/factories`, `/contracts` |
| Sales | Sales today, Contacts, Tasks, Pipeline, Opportunities, Intelligence, Site prototypes, Builds showcase, Fair contacts, Automations, Press | `/sales#today|contacts|tasks|pipeline|opportunities|automations|press`, `/intel`, `/prototypes`, `/builds/admin#builds`, `/admin#partnersSection` |
| Design Lab | one entry (owners, or whoever was given it) | `/lab`; its six sections (Library, What's moving, Line plans, Concepts, Brands we watch, Brand code) are tabs across the top of that page |
| Business | Money (only for the people it is open to), Payment gate, Platform health, Connections, Brand and assets, Team access | `/money`, `/admin#accessPanel`, `/platform`, `/admin#connections`, `/brand`, `/team` |

Every place the old menu led to is still one click away; items only moved. Nothing that does a different job was merged: the three production queues stay separate sections.

## Quick actions at the top
- **Start a tech pack** (green button): a box with the client (newest first), the product name, an optional photo and note. It makes the product the way a client room does, the assistant drafts the pack, and the pack opens. The same box opens from the **Start a tech pack** button on My day, where the eight newest clients are also one tap each (the client is chosen when the box opens). It reads `GET /v1/admin/client-picker`, which gives people without Clients and projects an empty list and hides the button for them.
- **Jump to…** filters the menu as you type (names and a few extra words each item answers to, such as "invoices" for Money). Enter opens the first match; Esc clears; `/` focuses it from anywhere on the page.
- **Fold a group** by pressing its title; the menu remembers which are folded on this device, and unfolds the one you arrive in.

## Behaviour
- Sales and Builds admin read `#tab` from the address, so a menu item opens straight to a tab and the tabs keep the address in step.
- On `/admin` the menu scrolls to a section (closing Platform health or a client's room first); arriving from another page waits for the data to load, then scrolls.
- The marker shows where you are: by address and tab on Sales / Builds, by scroll position on the console home.
- Badges mirror counts the page already draws (`#mcCount` for Messages, `#chatCount` for Chats, `#taskCount` for Tasks, `#oppCount` for Opportunities, `#newCount` for Builds showcase).
- Desktop: "Collapse" shrinks it to an icon rail (remembered; a client's room starts collapsed because it has its own rail). Phone: a button in the header opens it as a drawer.

To add an item, edit `NAV` at the top of `console-nav.js`.

**Update:** Home now goes to `/home` (leads, prototypes, projects in flight; see `work-home.md`). The old home with the client list and production queues is the page `/admin`, reached by **Clients** (its top is marked Clients in the menu).

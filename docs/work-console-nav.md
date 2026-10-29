# Work console navigation

Every staff page shares one navigation in two levels, drawn by `src/console-nav.js` (served at `/console-nav.js`). A page adds `<script src="/console-nav.js" defer></script>` and nothing else; the menu hides itself while the page shows its sign-in panel.

- **The sidebar** on the left lists the eight **sections**, in the order a day goes.
- **The tab row** across the top of the page shows the **parts** of the section you are in, with the one you are on marked. It is the only row of tabs a page has for that: Sales no longer draws its own.

So there is one place for "where am I" (the dark section on the left, the dark tab across the top) and one name for each place.

## The sections and their parts

| Section | Parts (the tabs) | Where each lives |
| --- | --- | --- |
| My day | My day | `/home`: this week, **Start a tech pack**, My accounts, who to reach out to, prototypes, projects in flight |
| Inbox | Messages, Chats | `/admin#inbox`, `/sales#chats` |
| Clients | Clients, Projects, Waiting on approval, Production attention, Factories, Contracts, Fair contacts, Assistant learning | `/admin#clientsHead`, `/home#projPanel`, `/admin#approvals`, `/admin#production`, `/factories`, `/contracts`, `/admin#partnersSection`, `/admin#assistantLearning` |
| Sales | Today, Pipeline, Contacts, Tasks, Opportunities, Intelligence, Site prototypes, Builds showcase, Automations, Press | `/sales#today|pipeline|contacts|tasks|opportunities|automations|press`, `/intel`, `/prototypes`, `/builds/admin#builds` |
| Design Lab | Line plans, Concepts, Studio, Assortment, Sketch pack, Graphics & techniques, Materials, Research | `/lab#plans`, `/lab#board`, `/lab/studio`, `/lab#assort`, `/lab/sketches`, `/lab/library`, `/lab/materials`, `/lab#research` |
| Money | Money (only for the people it is open to) | `/money` |
| Sites & health | Platform health, Connections | `/platform`, `/admin#connections` |
| Settings | Team access, Brand and assets, Payment gate | `/team`, `/brand`, `/admin#accessPanel` |

A section's sidebar link goes to its first part this person can open. A section with one part (My day, Money) has no tab row. A section with nothing this person can open is not shown.

Every place the old menu led to is still here; only Fair contacts moved (from Sales to Clients, beside the factories it lists) and Business became Money, Sites & health and Settings.

## One part at a time
A part is its own page, even where several share one address:

- **`/admin`** shows one part at a time, chosen by `#part` (Clients by default). The "work in motion" banner shows only on Clients.
- **`/lab`** shows Line plans, Concepts, Assortment or Research, chosen by `#plans`, `#board`, `#assort` or `#research` (Line plans by default). The older addresses `#library`, `#trends`, `#brands` and `#code` open Research at that part. A line plan opens from its address too: `/lab?plan=…`.
- **Sales** and **Builds showcase** switch their tab from `#part`, without a page load; the address keeps in step.

A page with its own way through can leave the tab row out with `<html data-fbtabs="off">`: the Studio with a piece open (it has the piece's step bar, `docs/design-lab.md`) and the tech pack (its own tabs).

## Quick actions at the top
- **Start a tech pack** (green button): a box with the client (newest first), the product name, an optional photo and note. It makes the product the way a client room does, the assistant drafts the pack, and the pack opens. The same box opens from the **Start a tech pack** button on My day. It reads `GET /v1/admin/client-picker`, which gives people without Clients and projects an empty list.
- **Jump to…** lists every part that matches as you type (its name, its section, and a few extra words each answers to, such as "invoices" for Money), from any section. Enter opens the first; Esc clears; `/` focuses it from anywhere on the page.

## Behaviour
- **The logo** on every staff page, the tech pack included, goes to My day.
- **The tech pack** has the sidebar too (sections only; its own tabs are the tab row), so leaving it is one press.
- **Badges** mirror counts the page already draws (`#mcCount` Messages, `#chatCount` Chats, `#taskCount` Tasks, `#oppCount` Opportunities, `#newCount` Builds showcase): on the part, and added up on its section.
- **Desktop:** "Collapse" shrinks the sidebar to an icon rail, with a dot on a section that has something waiting (remembered; a client's room and the Studio start collapsed).
- **Phone:** a button in the header opens the sidebar as a drawer of the eight sections; the tab row stays across the top and scrolls sideways.

To add a part, add it to its section in `NAV` at the top of `console-nav.js`.

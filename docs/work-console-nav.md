# Work console navigation

The staff pages (`/admin`, `/sales`, `/builds/admin`) share one left-hand menu, drawn by `src/console-nav.js` (served at `/console-nav.js`). A page adds `<script src="/console-nav.js" defer></script>` and nothing else; the menu hides itself while the page shows its sign-in panel.

## How it is grouped

| Group | Items | Where each lives |
| --- | --- | --- |
| (top) | Home, Inbox | `/admin`, `/admin#inbox` |
| Customers | Clients, Sales today, Contacts, Pipeline, Tasks | `/admin#clientsHead`; `/sales#today|contacts|pipeline|tasks` |
| Production | Factories, Waiting on approval, Production attention, Assistant learning | sections of `/admin` |
| Builds showcase | Builds, What's new, Invites, Who looked | `/builds/admin#builds|updates|invites|activity` |
| Settings | Platform health, Connections, Payment gate | `/platform`, `/admin#connections`, `/admin#accessPanel` |

Grouping follows what the work is for, not which page it lives on. Nothing was merged that does a different job: the three production queues stay separate sections, they just sit under one heading; the Sales and Builds tabs became menu items (the tabs still work and the menu follows them).

## Behaviour
- Sales and Builds admin read `#tab` from the address, so a menu item opens straight to a tab and the tabs keep the address in step.
- On `/admin` the menu scrolls to a section (closing Platform health or a client's room first); arriving from another page waits for the data to load, then scrolls.
- The marker shows where you are: by address and tab on Sales / Builds, by scroll position on the console home.
- Badges mirror counts the page already draws (`#mcCount` for Inbox, `#taskCount` for Tasks, `#newCount` for What's new).
- Desktop: "Collapse" shrinks it to an icon rail (remembered; a client's room starts collapsed because it has its own rail). Phone: a button in the header opens it as a drawer.

To add an item, edit `NAV` at the top of `console-nav.js`.

# Notes for working on this repository

## Keep the platform map up to date

The work console has an interactive map of the whole platform (Sites & health → Platform map, `/platform/map`). The team uses it to walk technical partners through how everything fits together, so it has to match the code.

When a change adds, moves, renames or removes a part of the platform, update `src/platform-map.js` in the same PR. That includes a page, a routes file, a service, a table, an outside service, a background job or a step in how work flows. What to update:

- **Boxes (`NODES`):** the `code` list (files), the `data` list (tables), `what` (one plain paragraph), and `talks`.
- **Links (`EDGES`):** add or remove a link when two parts start or stop talking.
- **Flows (`FLOWS`):** when a change alters one of the five flows, update its steps. The flows are Design Lab to factory, Photo to tech pack, Lead to cash, How a request is checked, and What runs on its own.
- **The page:** `src/platform-map.html` only renders. Its static sections ("One request, start to finish", "Build, test, deploy") need an edit only when those facts change.

`test/platform-map.test.js` fails when a page or routes file is on no box, when a box names a file that no longer exists, or when a link or flow step names a missing box. Journey J279 checks the page and its access rules. The counts at the top of the page (routes, pages, tables, jobs) are live and need no edits.

## Keep the video brief up to date

`docs/marketing/video-brief.md` is the brief for promotional videos about the Design Lab and its tools. When a change adds, renames or removes a tool a client can see, or changes a price or a number quoted in it (sketches, bases, add-ons, colour systems, factory languages), update the brief in the same PR.

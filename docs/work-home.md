# The work home

`/home` (and `/` on the work host) is the first page staff see. It is built around three jobs, in this order: get more leads, put prototypes in front of the right people to close deals, and keep every project in flight moving. The old home, with the client list and the production queues, is now the **Clients** page (`/admin`); the left menu's Home goes to `/home` and Clients goes to the client list.

## What is on it

1. **This week** (four numbers, each a link): new leads in 7 days (with the change on the week before; people who are already clients or were imported in bulk are not counted), people who looked at a prototype in 7 days (and how many opened a live build), deals in play (count, open value and the likely value), and what was won in 30 days.
2. **Reach out today**: tasks due, the top posts from Intelligence worth a look (`Post · <score>`, opening `/intel?signal=<id>`), the hottest and warmest contacts from Sales, and leads that arrived in the last 21 days and have had no email, call, meeting or chat from us. Each row opens that person's card in Sales (`/sales?contact=<id>`).
3. **Prototypes that can close deals**: builds that are concept or in progress, warmest first. Each says who has looked this week, who is invited, which client it is for, what it is built with, and what to do next (say hello, nudge an invitee, invite someone). Buttons: Invite someone, **Push to a store**, Open site. Under it, **Best to show right now**: finished builds people look at most in 30 days.
4. **Projects in flight**: software and product projects together, with filters (All, Software, Product, Waiting on us). The ones the client wrote to last come first. A software project shows its stage and a seven-step rail; each row opens that project in its client room.
5. Approvals waiting and production problems, as links to the queues on the Clients page.

All of it comes from `GET /v1/sales/overview` (the Sales numbers) and `GET /v1/admin/home` (leads waiting, prototypes, projects, what is waiting), both staff only. The rules are in `src/home.js`, the queries in `src/home-routes.js`, the page in `src/work-home.html`.

The quick actions at the top: add a lead (Sales contacts), new prototype (opens the new build form), new project (the client list).

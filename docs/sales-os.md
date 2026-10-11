# Sales OS

The CRM for the tech sales channel (see `sales-channel-plan.md`). Staff only, at **/sales** (a "Sales" link sits next to "Builds" in the work console header on larger screens). It uses the work console sign-in.

## What is in phase 1

- **Today.** Open pipeline, a forecast weighted by stage odds (New 10%, Contacted 20%, Meeting 40%, Proposal 60%), what has been won, new contacts this week; the tasks due or overdue; who is warm right now; deals that have gone quiet (nothing for 7 days); the latest activity.
- **Pipeline.** A board of deals by stage: New, Contacted, Meeting, Proposal, Won, Lost. Drag a card to another column, or use the menu on the card (the only way on a phone). Losing a deal asks why and keeps the answer. Every move is written to the contact's timeline.
- **Contacts.** Search by name, email, company or tag; filter by source and warmth. A contact has a company, tags, notes, a timeline, deals and tasks. A contact can be marked "do not email" (kept on the record; the email phase will respect it).
- **Tasks.** Next steps with a due date, per contact or deal. Ticking one off is logged on the timeline.
- **Bringing people in.** Add by hand; paste a list (CSV with a header row: name, email, company, phone, title, tags; up to 500, duplicates by email are recognised); or import the hub's clients and website leads (people already here are linked, not duplicated). A hub client's contact keeps a link to the client.

## Leads from the showcase

Nobody has to type anyone in. When staff invite someone to the builds showcase, they become a contact (source *Showcase*) with the invitation, and the note, on their timeline. When they look at a build, the timeline says so ("Looked at Benny's Beans in the showcase"); a deal "Showcase interest: …" is started once and not duplicated by further looks; and when they click through to the live build the timeline says that too and a follow-up task is created for the next working day (only if they have no open task already). Staff looking at builds does not create leads.

## How warm

A look counts 2, a click-through 5, a call 3, a meeting 4, an email back 6. Each counts for half as much every week. Hot is 6 or more, warm 1.5 or more. Notes and system lines count for nothing: warmth is what *they* did.

## Data

`sales_companies`, `sales_contacts` (unique by lower-cased email; consent fields `email_ok` and `unsubscribed_at`), `sales_deals`, `sales_activities` (the timeline), `sales_tasks`. Deleting a contact deletes their timeline and tasks. API under `/v1/sales/*` (staff only); the rules live in `src/sales.js`, storage and routes in `src/sales-routes.js`, the page is `src/sales.html`.

## Next phases

1. **Email**: send from @thefuturebasics.com and receive replies into the timeline (respecting "do not email", with one-click unsubscribe), templates.
2. **Automations**: triggers (viewed a build, clicked through, replied, stage changed, silent for N days) to actions (send a template, create a task, move a stage, notify), with stop conditions and send caps. The follow-up task above is the first, hard-wired example.
3. **Chat** on the public site and showcase, handing to a person.
4. **Opportunity finder and press comms.**

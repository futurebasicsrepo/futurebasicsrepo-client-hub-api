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

## Email (phase 2)

Resend is only the pipe. Who may be emailed, what is said, what is remembered and what happens when someone replies, bounces or says stop are all ours (`src/sales-email.js`, `src/sales-email-routes.js`).

- **Sending.** On a contact's card, the Email box: pick a template (or write from scratch), edit, send. Blanks like `{{first_name|there}}` are filled in; if we do not know something and there is no fallback, the send is refused and says what is missing. Plain text with a light HTML version, sent one to one.
- **Every email carries** your name, your business mailing address, and an unsubscribe link, plus the `List-Unsubscribe` one-click headers mail apps use. Without a mailing address nothing can be sent (set it in **Email settings**; commercial email must carry one).
- **Who may be emailed.** Only people who know us: a hub client, someone invited to the showcase, someone who looked at or opened a build, wrote to us, met or spoke with us. For anyone else the card says so and asks you to confirm that you have spoken with them or they asked you to write; the record then says you did. Nothing overrides an unsubscribe, a bounce or a spam complaint.
- **Stopping.** The unsubscribe page asks first (so mail scanners cannot unsubscribe people by opening links); the one-click POST from a mail app works directly. A reply that says stop or unsubscribe does the same. Staff cannot undo someone's own unsubscribe. A hard bounce or a spam complaint switches the address off too; a temporary bounce (mailbox full) does not.
- **Replies.** A reply to `kyle@mail.thefuturebasics.com` is received by Resend and sent to us. It lands on the contact's timeline (they get hotter), a task "Reply to …" appears on Today, and you get an email with the text. Someone new who writes in becomes a contact with a deal. Automatic out-of-office replies are logged but make no work. Mail from our own sending address is ignored. Press **Reply** on a message in the timeline to answer it.
- **Limits.** A daily limit (default 60, change it in settings) stops us using up Resend's allowance; the hub's own sign-in codes and notices share the same account, which allows 100 a day on the free plan and 3,000 a month. Resend's Pro plan is $20 a month for 50,000 with no daily limit.

### One-time setup

1. **Env vars on the hub service:** `RESEND_API_KEY` (already set for sign-in codes; `SALES_RESEND_API_KEY` overrides it for sales if you want a separate key), `RESEND_WEBHOOK_SECRET` (step 3). Optional: `SALES_FROM_ADDRESS`, `SALES_POSTAL_ADDRESS`, `SALES_DAILY_CAP` (all can be set on the Email settings page instead).
2. **Receiving replies.** In Resend, open the domain `mail.thefuturebasics.com` and switch on **Receiving**. Resend shows one MX record; add it at your DNS provider for the **`mail`** name only, so Gmail on the main domain is untouched.
3. **The webhook.** In Resend → Webhooks → add an endpoint `https://hub.thefuturebasics.com/webhooks/resend` (the settings page shows the exact address) for the events *email.delivered, email.bounced, email.failed, email.suppressed, email.complained, email.received*. Copy its signing secret (starts `whsec_`) into `RESEND_WEBHOOK_SECRET` on the hub service.
4. **Email settings** in the Sales page: your name, the from address (`kyle@mail.thefuturebasics.com` is verified today), your mailing address, then **Send me a test**.

Webhooks are checked against the signing secret and refused if the signature is wrong or older than five minutes. If Resend cannot give us a received message's body yet, we answer with an error so it tries again.

## Next phases

1. ~~Email~~ (done, above).
2. **Automations**: triggers (viewed a build, clicked through, replied, stage changed, silent for N days) to actions (send a template, create a task, move a stage, notify), with stop conditions and send caps. The follow-up task above is the first, hard-wired example.
3. **Chat** on the public site and showcase, handing to a person.
4. **Opportunity finder and press comms.**

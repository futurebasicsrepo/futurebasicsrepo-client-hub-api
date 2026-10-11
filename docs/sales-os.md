# Sales OS

The CRM for the tech sales channel (see `sales-channel-plan.md`). Staff only, at **/sales** (a "Sales" link sits next to "Builds" in the work console header on larger screens). It uses the work console sign-in.

## What is in phase 1

- **Today.** Open pipeline, a forecast weighted by stage odds (New 10%, Contacted 20%, Meeting 40%, Proposal 60%), what has been won, new contacts this week; the tasks due or overdue; who is warm right now; deals that have gone quiet (nothing for 7 days); the latest activity.
- **Pipeline.** A board of deals by stage: New, Contacted, Meeting, Proposal, Won, Lost. Drag a card to another column, or use the menu on the card (the only way on a phone). Losing a deal asks why and keeps the answer. Every move is written to the contact's timeline.
- **Contacts.** Search by name, email, company or tag; filter by source and warmth. A contact has a company, tags, notes, a timeline, deals and tasks. A contact can be marked "do not email" (kept on the record; the email phase will respect it).
- **Tasks.** Next steps with a due date, per contact or deal. Ticking one off is logged on the timeline.
- **Bringing people in.** Add by hand; paste a list (CSV with a header row: name, email, company, phone, title, tags; up to 500, duplicates by email are recognised); or import the hub's clients and website leads (people already here are linked, not duplicated). A hub client's contact keeps a link to the client.

## One CRM, segmented by tags
Tech pack customers, build customers and leads live in the same contact list; tags are what tell them apart.
- **Automatic tags.** Every hour (and on "Import hub clients and leads") the hub is synced into the CRM: every active client and every non-staff sign-in becomes a contact. They are tagged `lead` or `client` by their status in the hub, plus `tech-pack` when they have a tech pack. Those three tags are kept in step with the hub; any other tag staff add is never touched. A client who has opted out of marketing is marked "do not email" once, and a note is left on their timeline. Showcase sign-ins get `showcase`.
- **Your tags.** Add or remove tags on a contact's card (typed tags are cleaned: "Hot Prospect" becomes `hot-prospect`). Tick several rows in Contacts to tag or untag them all at once (500 at a time). Use `builds` for people who bought a build.
- **Filtering.** Click a tag to show only people who have it, click again to hide them, a third time to clear. Several tags narrow the list (people with all of them).
- **Saved views.** "Save this view" keeps the current tags/search/source under a name. Starter views: Tech pack customers, Builds customers, Leads, Showcase interest. Their counts show on Today. These views are also what the email phase will use to choose who to write to.

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

## Automations (phase 3)
Sales page → **Automations** (menu: Customers → Automations). An automation is a **trigger** and a list of **steps**, run once per person.

**Triggers:** someone looks at a build; someone opens a live build; a new contact is added (optionally "from website", etc.); a tag is added; a deal moves to a stage; a contact writes back; an open deal has had nothing for N days.
Contacts brought in by an import or the hourly hub sync do not start "new contact" automations (so a bulk import never mails anyone); a tag the sync adds (`client`, `tech-pack`) does start "tag is added" ones.

**Steps:** *Wait* (hours or days), *Task* (a task for staff, with `{{first_name}}`, `{{name}}`, `{{company}}`, `{{build}}` filled in), *Tag* (add or remove), *Email* (a template from Email → Templates).

**Starter automations** are made switched off: follow up after someone looks at a build; someone opened a live build; a deal has gone quiet (7 days); new website lead. Every automation starts off. **Try on a contact** shows what each step would do for that person right now without doing it.

**What keeps it safe**
- An email step goes through exactly the same rules as email written by hand: a relationship (they are a client, looked at a build, were invited, wrote or met with us), never to anyone who unsubscribed, bounced or complained, the mailing address and from-address are set, and the daily limit holds. It is never "confirmed" on staff's behalf. For someone nothing shows we know, the step is skipped and **you get a task** to write yourself; for someone who opted out it is skipped quietly.
- **Working hours:** automatic email goes out only inside a window (default 9am to 6pm US Eastern, weekdays; set in Working hours, in UTC). Outside it, the step waits for the next window; at the daily limit it waits for tomorrow. Tasks and tags are not held back. If email is not set up yet, people wait rather than lose their step.
- **Stop if they write back** (on by default): a reply, an opt-out (link, reply or bounce), or marking them "do not email" cancels everything waiting for that person. Staff can also stop one person partway from their card.
- **Once per person** unless you choose "again after N days".
- A step is written to the log before it is done, so a crash can lose a step but never repeat one (no double emails).
- An automation that takes in more than 40 people within an hour (an unusual trigger, or a runaway tag) **switches itself off** with a note. Staff tagging a list on purpose is not counted.
- **Working hours → Pause every automation** stops everything at once; people part way stay where they are.
- Editing an automation changes what people part way through do next (they keep their place by step number); switching one off holds them until it is on again; deleting one stops them where they are and leaves every record alone.

**How it runs:** a job every minute does what is due ("Run what is due now" does the same on demand). It is listed with the other background jobs on Platform health.

## Chat and the handoff to a person (phase 4)
A chat button on the **builds showcase** (and on thefuturebasics.com once the script is added) opens a small window. A visitor talks to an assistant first; a person takes over when they ask or when the assistant should not answer. Staff work from **Sales → Chats** (menu: Customers → Chats; the count is chats waiting for a person).

**The visitor's side.** The window is a page of its own (`/chat-frame`) inside an iframe, so nothing on the host page can read the conversation and the page's styles cannot break it. The conversation is kept by a private token in the visitor's browser. Inside the showcase the visitor is already signed in, so the chat is tied to their contact from the first message and notes which build they were looking at ("Talk to us about one like it" on a build page opens the chat with that build in mind; the email address stays below it). On the public site they are anonymous until a person is needed; then the window asks where to reach them ("Where can we reach you if you step away?"). They become a CRM contact (source `website` or `showcase`, tag `chat`). A showcase visitor's address is verified (they signed in with a code), so their chat counts on their timeline as "chatted with us": it counts as knowing us for email, stops waiting automations, and starts "a contact writes back" ones. An address typed on the public site is not proof of who they are, so it is marked *not verified* in Chats, their messages are recorded as notes, and none of that happens (staff can still reply in the chat, and the reply is emailed to that address if they have stepped away).

**Add it to thefuturebasics.com:** Chat settings shows the line to paste before the closing body tag of the theme: `<script src="https://hub.thefuturebasics.com/chat-widget.js" defer></script>`. `window.fbChat.open({looking: 'slug'})` opens it from anywhere.

**The assistant** answers only from facts: what Future Basics does, optional extra facts staff add in Chat settings, and the builds *that visitor may see* (nothing specific for someone not signed in to the showcase; it says builds are shown by invite and offers a person). It is short and plain, links only to our own sites, and never asks for secrets. It hands to a person, without asking the model, when someone asks for one or sounds upset; it also hands over for price, quotes, timelines, minimums, contracts or when it is unsure, and after twelve answers in one chat. What visitors type is treated as untrusted: length-limited (1,000 characters), shown as text, and given to the model as a message, never as instructions. Without an `ANTHROPIC_API_KEY` (or with the assistant switched off, or at its daily limit) every chat goes straight to a person. `CHAT_MODEL` picks the model (default Haiku).

**When it hands over,** the chat shows "waiting for a person", staff get an email, a CRM task ("Chat waiting: …") and a count on the Chats tab and menu. Staff can read the thread, **reply**, **take over**, **hand back to the assistant**, **close**, or open the contact. While a person has it the assistant stays quiet. If the visitor has stepped away (no activity for two minutes) and we have their email, a reply is emailed to them too. A reply, like any message from them, stops automations that were waiting to write to that person; their messages also fire the "a contact writes back" automation trigger.

**Limits:** a message is dropped if a hidden field is filled in (robots); each address may send 60 messages an hour and open 8 new chats an hour (and 3,000 messages / 300 new chats an hour in all); a chat takes 120 messages a day; the assistant answers at most 300 times a day (set in Chat settings). Chat can be switched off entirely.

## Next phases

1. ~~Email~~ and ~~Automations~~ (done, above). Possible next steps for automations: a "move the deal" step, notifying staff in chat/email, and branching on a reply or a click.
2. ~~Chat with a handoff to a person~~ (done, above). Possible next steps: attachments, notifying staff in the Message Center, a chat that continues over email, chat on the hub for clients.
3. **Opportunity finder and press comms.**

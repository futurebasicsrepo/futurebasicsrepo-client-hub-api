# Future Basics tech sales channel — plan

The second line of work alongside tech packs: building and selling websites, apps and integrations. Three stages, each useful on its own and each feeding the next.

## 1. Showcase (this PR)

Sign-in-gated gallery of what we have built, plus a way to house a client's build privately. See `builds-showcase.md`.
Outcome: prospects and clients can see real work, we see who looked at what.

## 2. Sales OS

One system for finding, talking to and closing customers, so that less needs a person.

- **CRM core**: companies, people, deals with stages, notes, tasks, source. The hub's clients and the showcase's invitees become contacts rather than separate lists.
- **Email**: send from @thefuturebasics.com, receive replies into the contact's thread (inbound parsing), one timeline per contact. Needs a warmed sending domain, SPF/DKIM/DMARC, one-click unsubscribe and a suppression list (CAN-SPAM / GDPR).
- **Chat**: the hub's chat component on the public site and showcase, handing to a person when the visitor asks or the deal is warm.
- **Automations / flows**: triggers (build viewed, demo clicked, reply received, stage changed, no reply for N days) → actions (send a template, create a task, move a stage, notify). Proven patterns first: speed-to-lead, follow-up after a view, no-reply nudges, post-demo recap, win-back. Every flow has a stop condition (reply, unsubscribe) and a send cap.
- **Opportunity finder**: surfaces businesses with a weak site (the rebuild engine's audit is the same signal), recent openings, press mentions and funding, ranked, with a drafted first message for a person to approve.
- **Press comms**: media list, pitch drafts, release templates, follow-up tracking. Replaces reliance on social with direct, trackable outreach.
- **Measurement**: opens/clicks/replies per flow, A/B on subject and first line, pipeline by source.

Principle: the system drafts and sequences, a person approves anything new going to a stranger until a flow has proven itself.

## 3. Rebuild engine

Input a URL of a weak site; get v1/v2/v3 rebuilds.

1. **Crawl** the site (pages, copy, images, structure, contact details, performance and accessibility basics).
2. **Audit report** (what is wrong, in plain words) — also usable as the hook in outreach.
3. **Generate** v1 (faithful rebuild, fixed), v2 (restructured for the business's real goal), v3 (the ambitious version, like the coffee shop: real functionality for the sector, not just a prettier page).
4. **Repo**: each build is a repository under our GitHub org from a template.
5. **Deploy**: static or simple → Vercel; needs a server, database or console → Railway. Preview URL per version.
6. **Review**: a person approves before anything is shown or sent; versions appear in the showcase as invite-only builds for that prospect.
7. **Guardrails**: cost cap per run and per day, rate limits on crawling, respect robots.txt, never copy a third party's brand assets into something public without review, and a takedown path (delete repo + deployment + invite).

## Order of work

1. Showcase (done; it now follows app updates from GitHub, see `builds-showcase.md`).
2. CRM core and email send/receive (done, see `sales-os.md`).
3. Automations engine with the first three flows.
4. Rebuild engine behind staff approval.
5. Chat widget, opportunity finder, press comms.

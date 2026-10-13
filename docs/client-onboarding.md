# New-client onboarding

A new client tells us who they are **once**, the first time they sign in to their hub. There is one path in, whether they came from a text, an email or a won deal.

```
text / email / won deal  →  join page (/j/kyle)  →  room opens  →  hub  →  setup form (once)
```

## The ways in

| Way in | What happens |
|---|---|
| **Text link** `https://hub.thefuturebasics.com/j/<handle>` | A short, phone-first page. It says who sent it ("Kyle sent you this link"), takes company, name and email, opens their room and signs them in. The room remembers whose link it was (`acquisition.staff`), shown on the room as "via kyle's link". |
| **Sales email** "Open your Future Basics hub" | A starter template with `{{join_link}}`: the same page, in the sender's name, already filled in with the contact's name, email and company. Send it from a contact card, or use the template in an automation step. |
| **Won deal → Start project** | Makes the room as before (the contact can sign in with an emailed code). The room is marked as owing its details. |
| **Anything else** | Staff can ask any room to do it: the room's **More** menu, "Ask them to finish onboarding". |

The handle is the part before the @ of a staff email (`kyle@thefuturebasics.com` → `/j/kyle`). Only a handle that belongs to a staff member is believed; any other path, and plain `/j` or `/join`, is the generic page.

## Where staff find the link

* **Home** (the first screen on a phone): a dark **New-customer link** tile with **Share** (the phone's own share sheet), **Text it** and **Copy**.
* **Sales** → **New-customer link** (top right): the general link, the words to send, **Text it** (opens the messages app with the text ready), **Copy link**, **Copy the text**.
* **A contact card** → "Not on the hub yet? Text or copy their hub link": the same, filled in for that person, with their phone number on the Text it button.
* `GET /v1/admin/join-link?name=&email=&company=` returns `{ handle, link, general, text }` for the signed-in staff member.

## The setup form

Shown in the hub on the first visit when the room is **pending**. "Later" hides it for that visit; a card stays in **Waiting on you** until it is done. It never comes back once saved (people can still change answers by reopening it from the card staff can ask for).

What it asks: name, role, **mobile number**, how and when to reach them; company, legal name, website, where they sell and the store address; business address and a separate invoice email; **what they want to get done**; how they heard about us. Name, company, mobile number and what they want are required.

It does **not** ask for payment details: those are only taken on Stripe's page when an agreement is signed (see `autopay.md`).

## What it changes

* The room: `name`, `contact_name`, `contact_phone`, `website_url`; the whole record in `clients.onboarding` and `onboarding_status` = `done`.
* The signed-in user's name.
* The CRM contact tied to the client (by room or email): blank name, phone and title are filled in, never overwritten. The timeline says "Finished the hub onboarding form".
* Staff get one email the first time ("<Company> finished onboarding") with every answer. The answers are on the room in the work console under the contact line.

## Details

* `clients.onboarding_status` is `null` (never asked: every room from before this), `pending`, or `done`. Set to `pending` by the join page (new room, or a lead that is activated), by Start project when it makes a room, and by staff.
* Routes: `GET|POST /v1/onboarding` (client only; staff and previews are refused), `POST /v1/admin/clients/:id/onboarding { status: 'pending' | 'done' }`, `GET /j`, `GET /j/:handle`.
* `/v1/session` carries `client.onboarding_status`; `/v1/dashboard` adds a `kind: 'onboarding'` item to `waiting` while pending.
* The starter template is added once to a place that already has its templates (and never again if it is deleted).
* Code: `src/onboarding.js` (validation, links, routes), `src/join.html`, the setup form in `src/client.html`, the share dialog in `src/sales.html`. Tests: `test/onboarding.test.js`; journeys J181 (API), J182 and J183 (phone, browser).

# Handoffs and queues

Every step of a tech pack hands the work to someone. Each handoff does three things: it tells the next party (email or a notice), it puts the item in their queue, and it moves the "ball" marker. Journey **J84** walks the whole chain and checks all three at every step.

| # | Step | From → to | Told by | Their queue / signal |
|---|------|-----------|---------|----------------------|
| 1 | Factory signs up at the fair | Factory → Future Basics | Email + console notice to staff; email with its link to the factory | Factory page + start link, "0 need your action" |
| 2 | Customer starts a pack (own link or a factory's) | Customer → assistants | | Customer: **Waiting on you → Finish your tech pack and send it to us**. Staff: **Check the analysis** (when the assistants were used) |
| 3 | Customer submits | Customer → Future Basics | Email + notice to staff | Staff: **Review** item (replaces the analysis item). Customer's draft item clears. Ball: Future Basics |
| 4 | Staff publish v1 | Future Basics → client (and referring factory) | What the team chooses in the publish dialog (below): an email to the client's contact linking to the pack, and a message in the project thread; email to the referring factory with its own quotation link (no customer name or email) | Client: **Approve tech pack**. Factory page: **N need your action**, state "Waiting for your quote". Ball: factory while a quote is awaited |
| 5 | Factory quotes (or revises) | Factory → Future Basics | Email + notice to staff | Staff: comparison; factory's count drops. Staff can send quotes to the client's portal (client gets a notice) |
| 6 | Client approves | Client → Future Basics | Email + notice to staff | Staff: **Countersign**. Ball: Future Basics |
| 7 | Staff assign a producing factory | Future Basics → factory | Email to the factory (its own link) | Factory page: state "To read and confirm", count +1 |
| 8 | Staff sign | Future Basics → factory | Email: "Ready for you to countersign" | Leaves staff queue. Ball: factory |
| 9 | Factory acknowledges and countersigns | Factory → everyone | Email to staff, notice to the client | Locked. Factory count drops, state "Confirmed" |
| – | A new version is published | Future Basics → client, factories holding the old one | The same choices for the client (below); email to each factory | Approval chain restarts; a factory's old link shows the newer version |
| – | A factory writes (Messages tab) | Factory → staff | Email + notice | Staff queue: **Factory message**; dot on the Sign tab. The client never sees these |
| – | A party does not use their controls | Staff act for them | Marked "Future Basics (staff) for <name>: <how>" | Client can undo a recorded approval until we have signed. Projects never stall |

## Telling the client when you publish

Publishing opens a dialog with a revision note and **Tell the client**. Both boxes are on by default and are independent:

- **Email** the client's contact (the contact name and address on the client record), with a link to review and approve it. The note and an optional message for the client are in the email. **Also email these people** copies it to up to five more addresses (the client's other people).
- **Post in the project thread**: a message from the publisher in the client's project thread. It shows in the **Message Center** in the work console and in the client's hub (with a notification), so everyone can see what was sent. If an email also went out, the message says so.
- With both unticked the version is published quietly: the client is told nothing.

A Future Basics room is never emailed or posted to; a client with no contact email gets no email (but the extra addresses still can); a product that is not in a project has no thread. After publishing, the result line says what happened (for example "Published v2 · emailed pat@acme.com · posted in the project thread"), and the team's activity record for the product keeps who was told. The reason typed for publishing past a failed check stays on the version and is never sent to the client. The API takes `notify: { email, thread, copyTo, message }` on `POST /v1/admin/products/:id/tech-pack/publish` and answers with what was done in `notify`; journey **J192** checks every combination.

## Rules that hold at every step

- A factory never sees the client's name or email on quotation or referral packs.
- Only hashes of links are stored; links are derived from a server secret (`JWT_SECRET` must not change).
- A delivery failure is logged and never fails the action that caused it; the in-app signal still shows.
- For tests, `EMAIL_CAPTURE=1` keeps outgoing emails in memory and exposes them at `/v1/dev/outbox` (404 otherwise).

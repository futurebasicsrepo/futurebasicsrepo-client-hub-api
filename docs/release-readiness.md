# Tech pack: release readiness

A pressure test of every way into a tech pack and every hand-off on the way to a factory, run as a client, as staff and as a factory, on a phone and on a desktop. What was checked, what was fixed, and what is still open, with an honest line on what was not verified.

## Ways in

| Door | Who | Goes to |
|---|---|---|
| `/start` (photo, sketch, screenshot, graphic + description) | new client, no account | a room and a drafted pack, signed in by link |
| `/hub` → Start a tech pack (now also "choose from your saved files") | client | a drafted pack |
| `/tech-packs/new`, `/tech-packs/:id` | client, staff | the editor |
| `/join`, `/fair`, `/booth`, `/consign`, `/i/:code` | factories and their buyers, invited clients | a pack started for a buyer, or a room |
| `/tp/:token`, `/factory/:token` | factory, no account | read, acknowledge, quote, countersign |
| `/print/:id`, the PDF | anyone with the pack | the printed pack |
| work console `/clients/:id`, `/projects/:id`, Message Center | staff | review, publish, share, sign |

## Checked and holding

- **Access control.** Another client's draft, published view, approval, files, flags and edits all answer 404; no token 401; a client on a staff route 403; a bad factory link says so in words. Factory links cannot edit anything.
- **The chain.** Client approves before any review link exists; a factory cannot acknowledge a version the client has not signed (it keeps showing the approved one, read-only, with a note); it cannot countersign before Future Basics; signatures never carry to the next version.
- **Honest gates.** Publishing an unready pack is refused with reasons and goes through only with a written reason that stays on the version.

## Fixed in this pass

| Problem a factory or client met | Fix |
|---|---|
| A new version said "open it to see what changed" and nothing showed what changed | Every publish now computes a field-level diff against the version before. It opens the pack for the factory and the client ("What changed in v2", folded away once read), is in the factory email and on the PDF sign-off page, and is kept on the revision. |
| The factory was emailed about a version its link could not open yet (it stays on the approved version until the client approves) | Review links are told when the client approves; quotation links, which show the newest version at once, are told at publish. |
| Every new version meant acknowledging every callout again | Acknowledgements stand for callouts whose words did not change; only changed ones come back. Signatures never carry. |
| Forty callouts, forty presses | "Acknowledge all N remaining", one confirmation, all-or-nothing on the server. |
| A product with no artwork showed "artwork missing / no placements" on the factory's readiness list | Not applicable when there is no artwork. |
| No style number on the page a factory prices from | Assigned (FB-yy-0001) when the pack is published; a typed one is kept. The client is no longer asked for it. |
| Packing, labels, origin, fibre and sourcing were nowhere in the checklist | A "not required, but a factory will ask" list on the client's Submit tab. |
| 300 KB pages and multi-megabyte pack JSON went uncompressed to phones | Text responses are gzipped for browsers that accept it. |
| (earlier pass) Concept render did not reach Callouts or Check; no way to adjust the logo; no way to reuse saved files | Concept render is the front view, the logo is the client's own file placed on it, "from your files" on image uploads. |

## Closed in the second pass

| Gap | What was built |
|---|---|
| A single photo could never pass the mockup gate, so staff typed an override reason on every first publish | **Ask for the missing view.** The publish refusal names the views that are missing and offers to ask the client: a message in their project thread, an email, a notification, and a banner in their editor with an "Add the back view" button. It clears itself when the picture is in. |
| No commercial data | **Commercial block** (Materials tab): retail and compare-at price, currency, weight, packed size, HS code, a SKU and barcode for every size and colour (generated, kept when refreshed, barcodes checksum-checked), country of origin read as a code. A factory gets everything except what the client charges; the PDF and the "what changed" list leave price out. |
| Questions went to the pack, not to a callout | **Ask about this** on every callout. A factory's question is attached to the callout (and shows in its Messages thread with the callout named); staff see it open on that callout and answer in place or mark it resolved; the factory is emailed the answer; the client writes to their project thread with the callout named. |
| New labels were English only | The changes card, acknowledge-all, questions, Commercial, samples and inspection are translated into the five factory languages, including numbered lines and the item-by-item change summary. |
| No sample plan, no inspection standard | **Samples** (proto, fit, pre-production, top of production, with quantity, date and status) and **Inspection & tests** (AQL, level, written standard, test list) on the pack, in the diff, the PDF and the factory page. |
| Open questions were invisible to staff outside the pack | A waiting callout question shows in the staff queue ("2 new messages, 1 about a callout") and clears when answered or resolved. The Materials table's Notes column is no longer squeezed. |
| Pictures only existed inside the pack | **Signed links to every picture of the published pack** (`/m/…`, expiring, tamper-proof, sandboxed; staff and client list routes). This is what Shopify fetches media from. |

## Still open, in the order they will hurt

1. **Pictures are still stored as base64 inside the pack JSON** (and again inside every published version). The signed links solve the export, not the size: a pack with forty callout photos is still megabytes in the database and in the page payload. The fix is a content-addressed picture store with the pack holding references; it touches the PDF, the check, the studio and the files folder, so it is its own change with its own test pass.
2. **Staff publish still uses browser `confirm` and `prompt` boxes.** They work; they are not the experience the rest of the console has.
3. **Browser dialogs** (the confirmation on "Acknowledge all") are English only.
4. **The Shopify export itself** is the next build; the data and the picture links are ready.

## Not verified here

- The concept render and hero against the live image model (only the fixture was exercised).
- The PDF by eye (no PDF renderer in this environment; it builds and carries the new section).
- Real phones on mobile networks, and load.

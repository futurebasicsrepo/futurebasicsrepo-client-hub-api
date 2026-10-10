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

## Still open, in the order they will hurt

1. **A single photo can never pass the mockup gate.** Front and back (lateral and medial for footwear) are required, a client starts with one photo, so staff type an override reason on every first publish. Needs a "ask the client for the missing view" action that sends the request and holds the pack.
2. **Pictures live inside the pack JSON as base64.** Compression helps; it does not fix a pack of 40 callout photos, and Shopify needs media as files. Move images to the files store and reference them before the Shopify app.
3. **No commercial section** (retail price, SKU per size and colour, weight, barcode, HS code, country of origin as data). The Shopify app needs all of it; see `shopify-plm-app.md`.
4. **Questions are per pack, not per callout.** A factory unsure about callout 5 writes in Messages and the answer is not attached to it.
5. **No sample stages** (proto, fit, pre-production) with their own approvals and photos, and no inspection criteria (AQL, test list) section.
6. **New interface strings are English only** (the changes card, acknowledge-all). Pack content is translated; these labels are not.

## Not verified here

- The concept render and hero against the live image model (only the fixture was exercised).
- The PDF by eye (no PDF renderer in this environment; it builds and carries the new section).
- Real phones on mobile networks, and load.

# Cost estimate, Excel/CSV exports and public pricing

Three things a tech pack buyer asks for first, added after comparing against other AI tech pack tools.

## Cost estimate

Where: the **Materials** tab of a pack. Not shown on a factory's page, and never sent to a factory.

- Every line of the bill of materials has a **Unit cost** (cost of one unit of that material: per metre, per piece). Line cost is quantity × unit cost; a line with a cost and no quantity counts once.
- A **Cost estimate** block holds the rest, per unit of the finished product, in the pack's currency (`commercial.cost`): labour, decoration, packaging, freight, duty (% of the goods), waste (% on materials), and up to six **price breaks** (order size and the % taken off the goods at that size).
- The block works out: materials, waste, goods, duty, **landed cost of one unit**, the margin against the retail price, and the landed cost and margin at each price break. Materials with no cost are counted ("1 material has no cost yet"), never guessed.
- It is the client's own arithmetic, not a quote. A factory's quote replaces it.
- The sums live in one place, `FBCommercial.costSummary` in `src/commercial.js`, which the page, the exports and the Shopify export all read.
- In a customer's own Shopify store, the landed cost fills the item cost when there is no wholesale price.

Privacy: `publishedTechPackView` blanks `bom[].cost` and `commercial.cost` for the factory audience; the version diff never lists a cost; the PDF has no cost.

## Excel and CSV

`src/pack-sheets.js` builds the sheets and writes a real `.xlsx` by hand (no dependency) or a CSV per sheet.

Sheets: Overview, Materials (with live line-cost formulas), Measurements (one column per size), Colourways, Construction, Labels, Samples, SKUs, Cost. Empty sheets are left out.

| Who | Route |
| --- | --- |
| Client, published version | `GET /v1/products/:id/tech-pack/export` |
| Client, their own draft | `GET /v1/products/:id/tech-pack/draft/export` |
| Staff | `GET /v1/admin/products/:id/tech-pack/export` (the working copy; `?live=1` for the published version) |
| Factory | `GET /v1/tp/:token/export` (no Cost sheet, no unit cost, no retail price, no SKU prices; a quotation link also leaves out the client's name) |

Add `?format=csv&sheet=materials` (or `measurements`, `colourways`, `construction`, `labels`, `samples`, `skus`, `cost`) for one sheet as CSV. A cell that starts with `=`, `+`, `-` or `@` gets a `'` in the CSV, and text in the workbook is stored as text, so nothing typed into a pack runs as a formula.

The editor has **Download Excel** (More menu for clients and staff, an Excel button on a factory page).

## Public pricing

`/pricing` is a public page; `/v1/pricing` is the data behind it (single pack price, membership if a checkout link is set, whether the gate is on). `/start` links to it from "First pack free". The numbers are the live ones (`TECH_PACK_PRICE_CENTS`, `MEMBERSHIP_PRICE_CENTS`, `MEMBERSHIP_CHECKOUT_URL`); when the gate is off the page says packs are free while launching.

Tiers on the page: first pack free, one pack, membership (when configured), and a project with us (packs included once a project invoice is paid; priced by quote).

## Tests

`test/pack-cost-sheets.test.js` (the sums, cleaning, factory privacy, diff, CSV, XLSX) and journey J187 (costs saved, downloads for client, staff and factory, the factory page has no cost, public prices, the editor in a browser).

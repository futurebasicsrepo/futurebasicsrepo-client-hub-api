# Factories

One page for every factory (`/factories`, menu: Production → Factories): who makes what, where they are, and what is in their hands.

## What is on it
- **The list:** a factory is a supplier. Factories met at a fair that are not suppliers yet are listed too (grey, “Met at a fair”); saving their makes and skills, or “Add as a supplier”, makes the supplier record. Each card shows what they make, their skills, a light and a line of counts.
- **What they make** (product types) uses the families the tech packs already know (`src/categories.js`: tops, bottoms, outerwear, dresses, socks and gloves, footwear, hats, bags, flat textiles, belts and pet gear, plush, drinkware, jewelry, eyewear, pins and keychains, boxes, accessories, electronics). **Skills** are a fixed list (cut and sew, knitting, embroidery, screen printing, DTF/DTG, injection moulding, PCB assembly, low minimums, in-house QC and more) plus any skill typed in. Both live in `src/factories.js`; filter the list by any mix of them, by status, country, or a search.
- **The map** is drawn by the page itself from Natural Earth country outlines (public domain), no map service and no outside scripts (`src/assets/world-map.json`, made with `node scripts/build-world-map.mjs countries-110m.json`). A pin is worked out from the city, or the country when the city is not known; set a latitude and longitude by hand to place it exactly, clear them to go back. Pins are sized by the packs in their hands and coloured by the worst light among the factories in them. Click a pin to list just those; zoom buttons for East Asia, South Asia, Europe and the Americas.
- **The light:** red = something it holds is late (a project date passed, or a production run past its arrival date); amber = waiting on the factory (a quote not in, a pack not yet read and signed) or a new message from them; green = work in hand and nothing stuck; grey = nothing assigned.

## Import from Alibaba
The **Import from Alibaba** button brings in the factories we have bought from on Alibaba. Staff export the past orders as a CSV with one row per supplier. The export is made by the Claude in Chrome side panel from My Alibaba → Orders, with these columns: company, store link, place, contacts, orders, order numbers, what was ordered and what was spent. The hub never signs in to Alibaba itself.
- **Preview:** every supplier is listed with its place, orders, spend and a guess at what it makes and its skills. The guess counts only the lines that make up a fifth of the spend, because Alibaba titles are stuffed with keywords. A supplier is ticked when we bought from it more than once, or for more than $300. One-off small buys, orders never paid, and rows with no company name are left unticked, each with the reason. **Change** under a row edits its types and skills before import.
- **Import:** a new supplier gets its place (pinned on the map), its Alibaba store as its website, the types and skills, and a note of the orders. A supplier already in the hub (same name) keeps what was set by hand: empty fields are filled, types and skills are added to, and the note is added once, so importing the same file twice changes nothing more.
- `POST /v1/admin/factories/import/preview {csv}` and `POST /v1/admin/factories/import {csv, pick:[{name, productTypes, skills}]}`, staff only. The reader is `src/factory-import.js` (`test/factory-import.test.js`).

## One factory
- **Work in hand:** the projects its packs sit in (status, next milestone, date, “late” or days left), each tech pack with where it stands (waiting for their quote, quoted, waiting to read and sign, signed, closed) and a link into the pack, the files marked visible to the factory (download), and production runs (PO, quantity, status, sample status, arrival date, late flag).
- **Makes and skills:** tick the types and skills, add others, city, country, website, lead time, a map pin and notes.
- **Contact and page:** contact details and the private factory page (copy, email, make a new link).

## Data and API
Columns on `suppliers`: `city, website, product_types, skills, lat, lng, geo_manual` (`src/db.js`). Staff only: `GET /v1/admin/factories`, `GET /v1/admin/factories/map`, `GET|PATCH /v1/admin/factories/:id` (`partner:<id>` for a fair contact). Rules are plain functions in `src/factories.js` (`test/factories.test.js`); the routes are `src/factories-routes.js`.

# Software projects and pushing a build to a store

A client room holds two kinds of project.

| Kind | What it is | What the room shows |
|---|---|---|
| Product development | Tech packs, factories, production (as before) | Products, tech pack state, the product stage |
| Software development | A site or app we build for the client | A stage rail, the **build** it is tied to (live site, tech stack, key features), where the client sells, the project thread |

Staff choose the kind in **+ project**. A software project can be tied to an existing build or **make a new build** with the project's name (hidden, in progress); the build is then filled in under **Builds**. The client sees the same project on their hub: a card with its stage, and a page with the stage rail, the live site, what it is built with, what it does, and a link to the build in the showcase.

## Stages

Discovery → Prototype → Build → Client review → Launch → Live → Support. Staff move a project along from the stage menu on the project. "Client review" is the stage where the client has the ball.

## Who can see the build

A build tied to one of a client's own projects is visible to that client in the builds showcase even while it is hidden from everyone else (they are the people it is being built for). It stops being visible when the build is untied from the project, the project is archived, or the build is archived.

## Where the client sells

Each client has a **where they sell** preference: Shopify, Square, Wix or something else. It is set on the software project (and in the push window).

## Pushing a build to the client's store

A build that sells things carries a **catalog**: the products its site shows. Staff write them in the push window, one per line: `Name | price | code | picture address | description`. **Builds → Push to a store** (or the **Push to …** button on the project) opens the window for that build and client.

- **Shopify**: the client's own store, connected by the client from their hub (Your Shopify store). Products are made as **drafts**.
- **Square**: staff paste the client's access token (and currency) once. Products go in through the Catalog API (`/v2/catalog/batch-upsert`), one item with one variation each.
- **Wix**: staff paste the client's API key (and the site id if the key is for the whole account). Products go in through Stores Catalog V3 (`/stores/v3/products`); each picture is imported into the site's media first. A site on the old V1 catalog is told so and nothing is written.

Rules that hold for all three:

- A push only **adds**. A product an earlier push made (matched by its code) is left exactly as the client has it, and nothing is ever deleted.
- **See what will be made** previews the push and sends nothing. Pushing asks for confirmation.
- Square and Wix show products in the store as soon as they are made; look before you push to a live store.
- A saved token or key is sealed at rest (`SHOPIFY_TOKEN_KEY`, or the Shopify app secret) and is never sent back to a browser. A token the store refuses marks the connection to be redone and nothing is made.
- Two pushes at once to the same store cannot make the same product twice.
- Every push is kept (who, when, which store, what was made, what failed and why).

The Square and Wix request shapes follow their published documentation; they have been tested against stand-in servers, not live accounts. Try a first push against a test store.

Environment (all optional): `SQUARE_API_ORIGIN`, `SQUARE_API_VERSION`, `WIX_API_ORIGIN` (to point at a test server); `SHOPIFY_TOKEN_KEY` (the sealing key when no Shopify app secret is set).

## Sending the site itself (a theme) to the client's Shopify

A build can be a **Shopify theme** we made (today: Common Ground, in `themes/common-ground`, shipped with the service). In the push window, for a client who sells on Shopify, **Send the site itself** puts the theme into their store as an **unpublished draft**: they preview it from Online Store, Themes and publish it when they are ready. Nothing on their live store changes, and a theme is never sent published.

Two ways, both from that window:
- **Download the zip** and upload it in their Themes page (Add theme, Upload zip file). Needs nothing from them but a staff or collaborator login.
- **Send it from here.** Shopify only lets an app change themes with its own approval, but an app made in the client's own store is allowed. The client makes one in **Settings, Apps and sales channels, Develop apps, Create an app**, gives it **Themes: read and write**, installs it and copies the **Admin API access token** (shown once). Staff save the store address and that token in the push window; it is sealed at rest like the Square and Wix keys and never shown again. We then ask Shopify to create the theme (`themeCreate`, role unpublished) from a **signed address on our service that expires in 15 minutes** and serves the zip (`/v1/public/theme-zip/<theme>.<expires>.<signature>.zip`, no sign-in, that theme only). A token Shopify refuses marks the connection to be redone; Shopify's own error is shown. Every send is kept in the build's push history.

API: `GET /v1/admin/themes`, `GET /v1/admin/themes/:key/zip`, `PUT /v1/admin/clients/:id/commerce/connection { platform: 'shopify-theme', shop, token }`, `POST /v1/admin/builds/:id/push-theme { clientId, theme, name?, preview? }` (staff). `SHOPIFY_THEME_ORIGIN` points it at a test server. Journeys J178 (API) and J179 (browser); `test/theme-pack.test.js` reads the zip back byte for byte.

Not done: sending through the Shopify app clients connect from their hub (it asks for products only; changing themes needs Shopify's approval of the app first), and making a theme live: that stays the client's click.

## Pictures on client tiles

A client's tile in the work console and the product pictures on their hub come from `/r/<id>/<signature>.jpg`. That route reads the picture out of the stored tech pack; since pack pictures moved into `pack_blobs` it must ask for the picture as a JSON value (so the database layer swaps the stored reference back into the image) rather than as text. Journey J127 loads a client's tile picture and checks it is a real image.

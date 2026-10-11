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

## Pictures on client tiles

A client's tile in the work console and the product pictures on their hub come from `/r/<id>/<signature>.jpg`. That route reads the picture out of the stored tech pack; since pack pictures moved into `pack_blobs` it must ask for the picture as a JSON value (so the database layer swaps the stored reference back into the image) rather than as text. Journey J127 loads a client's tile picture and checks it is a real image.

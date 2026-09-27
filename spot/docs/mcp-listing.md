# Listing Spot's MCP server

Spot's MCP server is remote (streamable HTTP at `/mcp`). Agents connect with a free self-serve key from `/integrations#mcp` (`POST /v1/agent/keys`). Each key gets 100 asks, 20 texts/emails and 200 flight searches a day. Set `SPOT_OPEN_KEYS=off` to turn self-serve keys off, and give partners unlimited keys through `SPOT_API_KEYS`.

## 1. Official MCP Registry

The official registry also feeds the GitHub MCP Registry and the VS Code MCP gallery.

`server.json` in this folder is ready. Its name is `com.spotmeplease/spot`, so the registry needs proof that you own spotmeplease.com. Spot serves that proof itself at `https://spotmeplease.com/.well-known/mcp-registry-auth`.

1. Make a signing key on your own computer and keep the private half private. Don't paste it into chat or commit it:
   ```sh
   openssl genpkey -algorithm Ed25519 -out spot-registry-key.pem
   echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in spot-registry-key.pem -pubout -outform DER | tail -c 32 | base64)"
   ```
2. In Railway, set `MCP_REGISTRY_AUTH` to the whole `v=MCPv1; …` line that printed. This is the public half, so it's safe.
3. Publish:
   ```sh
   brew install mcp-publisher      # or download from github.com/modelcontextprotocol/registry/releases
   cd spot
   PRIVATE_KEY=$(openssl pkey -in spot-registry-key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')
   mcp-publisher login http --domain spotmeplease.com --private-key "$PRIVATE_KEY"
   mcp-publisher publish           # reads ./server.json
   ```

To publish a new version, bump `version` in `server.json` and run `publish` again. Keep `spot-registry-key.pem` somewhere safe, because you need it for every future publish.

If you'd rather use GitHub instead of the domain, change the name to `io.github.futurebasicsrepo/spot` and run `mcp-publisher login github`.

## 2. Other directories

Most of these pick things up from the official registry. The rest take a short form.

| Directory | How |
|---|---|
| PulseMCP (pulsemcp.com) | Imports from the official registry. You can also use the "Submit" form. |
| Smithery (smithery.ai) | "Add server", then the remote URL. It asks for the Authorization header as a secret. |
| mcp.so | "Submit", then the GitHub URL or remote URL, plus the copy below. |
| Glama (glama.ai/mcp) | "Add server". Remote servers are supported. |
| Claude connectors | Users add it in Claude with Settings → Connectors → Add custom connector, using the `/mcp` URL and their key. |

## Copy

**Name:** Spot

**One line (≤100 chars):** Let AI agents ask someone else to pay for a cart, or text you a cart or flight to finish in a tap.

**Description:**
Spot is the pay-for-me layer for AI shopping. Agents can build carts but can't pay, and Spot gives them two ways to finish:

- **Spot me:** turn any cart into a link someone else pays with one tap (Apple Pay, Google Pay or card). Their money goes onto a one-time card locked to that store and amount, so it can only buy that cart.
- **Finish for me:** your agent finds it (any store's cart, or a real flight), holds the price, and texts you a link. You check it, tap Apple Pay, and Spot orders or books it. Nothing is spent without a person.

**Tools:**
- `create_spot_ask`: items, a link or a description → a pay link for someone else, or (`for_me`) a finish link texted or emailed to your user
- `search_flights`: live fares, cheapest first plus the best nonstop
- `create_flight_ask`: hold a fare and send your user a link to book it
- `get_spot_ask`: status and the next step (waiting, paid, ordering, ordered, booked)
- `order_spot_ask`: once paid, place the order at the store (the user confirms the last tap)

**Tags:** payments, shopping, commerce, checkout, flights, travel, agents

**Auth:** `Authorization: Bearer <key>`. Keys are free at `/integrations#mcp`.

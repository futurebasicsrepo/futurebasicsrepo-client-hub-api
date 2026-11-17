# The Design Lab connector (MCP)

A room's own AI tool can design in the Design Lab for that room. It starts a piece, places the brand's logo, checks that the piece can be made and makes the tech pack. The connector is an MCP server at `/mcp` on the client hub (`src/mcp-routes.js`).

## Connecting a tool

1. In the hub, open the **Design Lab** card. Under **Use it from your AI tool**, name the tool and press **Make a key**.
2. Copy the key. It is shown once, and only its hash is kept.
3. Add the key to the tool with the snippet the hub shows:
   - **Claude Code:** `claude mcp add --transport http future-basics https://<hub>/mcp --header "Authorization: Bearer fbk_…"`
   - **Cursor, VS Code, Windsurf** and other tools that take a remote server URL: add the `mcpServers` JSON with the URL and the `Authorization` header.
   - **Claude Desktop:** add the `mcp-remote` entry to its config file (Settings → Developer → Edit config), then restart it. It needs Node.js.
4. Ask it for something, for example: "Start a heavyweight hoodie in the Washed earth colours, put our wordmark across the chest, check it can be made, and make the tech pack."

ChatGPT and claude.ai on the web add connectors by signing in (OAuth). That is the next version. Until then, they cannot use a key.

A key can be turned off at any time from the same card, by anyone on the room's team. A room holds at most 10 live keys.

## What it can do

| Tool | What it does |
|---|---|
| `list_recipe` | The recipe menu: the bases, the add-ons each base takes, the colour systems |
| `start_piece` | A new piece from a base, add-ons and a colour. Its flats are measured, drawn and coloured. |
| `list_pieces` | The room's pieces and where each stands |
| `get_piece` | A piece's measurements (inches, sample size), its logos and graphics and where they sit, and what the flats check found |
| `set_measurements` | Change measurements or the fit. Unknown keys are refused, and so is a change of more than 60% at once. |
| `place_logo` | The cue mark, wordmark or lockup, where that spot usually takes it (left chest, full front, back, sleeve, hem) |
| `check_piece` | The flats check. `apply_fixes: true` runs the same one-tap fixes as the Flats page and saves. |
| `get_pattern` | The pattern's proof: seams walked, measured to spec at every size, yardage, and what the samples taught the pattern |
| `make_tech_pack` | Approve the piece and make its tech pack in the room. Needs the twist in the user's words. |
| `ask_us_to_make_it` | Ask Future Basics to make it. Needs `confirm: true`, which the tool sends only when the user has asked. |

## What keeps it safe

- **It acts as a person, in a room.** A key belongs to the person on the team who made it. Each call gets a five-minute session for that person and room. The session goes through the same Lab routes as the pages, so these all apply unchanged:
  - the Lab gate and the room scoping, so it only sees and changes its own room's rows
  - the team checks: someone taken off the team, moved to another room or signed out everywhere stops working at once
  - every check the pages run
- **Staff cannot hold a key.** Staff use the work console.
- **It spends nothing and orders nothing.**
  - No tool uses an AI generation, sends anything to a factory or takes a payment.
  - "Ask Future Basics to make it" puts a request in front of our team, as the button in the hub does. Nothing is ordered until the room accepts a quote.
- **A person still makes the calls that are a person's.**
  - Approving a piece the check says is too close to what inspired it is a choice for a person in the studio.
  - So is approving a piece the flats check says cannot be made. The tool is told to run the fixes.
- **Limits and logging.**
  - 120 calls a minute per key.
  - Request logs leave out the connector's calls, and keys never appear in URLs.
  - What a tool starts, makes or asks for is written on the room as `ai-connector` activity, which also tells us how many tech packs begin in a room's own AI tool.

## The protocol

- **Transport:** MCP over Streamable HTTP. Every answer is plain JSON, with no event stream and no session id to keep.
- **Methods:** `initialize` (protocol versions 2025-06-18, 2025-03-26 and 2024-11-05), `ping`, `tools/list` and `tools/call`. Notifications get 202.
- **Other requests:**
  - `GET` and `DELETE` on `/mcp` answer 405.
  - A missing or wrong key gets 401 with `WWW-Authenticate: Bearer`.
  - Batches are refused.
- **Tests:** `test/mcp.test.js`. The connector was also checked end to end with the official MCP client SDK.

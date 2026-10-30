# Daylight: the shared look of the hub and the console

One stylesheet, `src/cue.css` (served at `/cue.css`), is linked last on every client hub and work console page. It sets the colours and the shared pieces, and the pages' own styles build on it. Print is left alone: everything in it is for the screen, so tech pack PDFs and printed packs look as before.

## Colours

| Token | Value | Use |
| --- | --- | --- |
| `--fog` (paper) | `#F1F1EC` | The ground of every page, with a faint 96 px grid |
| `--paper` (white) | `#FFFFFF` | What sits on the ground: panels, cards, the sidebar |
| `--ink` | `#141416` | Type, lines, the selected state, and the dark moments below |
| `--cue` | `#4BFF9A` | Fills only: the dot, the one main action, a highlight. Never text on paper |
| `--cue-text` | `#067A3E` | When cue has to be text on paper (a status line) |
| `--dim` (graphite) | `#5B5E66` | Labels and notes (about 6:1 on paper) |
| `--line` | 14% ink | Hairlines on panels and dividers |

A cue dot on paper always has an ink ring (`box-shadow: 0 0 0 1.5px var(--ink)`) so it reads.

## Where it goes dark

Ink is a moment, not the room. Three places:

- **The phone menu.** In the console and the hub, the menu opens as an ink sheet. The sections are in big light type at the right, joined by lines drawn from one dot, with the current one underlined in cue. The lines are drawn from where the names actually are, each time the menu opens.
- **A button that is thinking.** It turns ink with the cue dots running (see `feedback.js`).
- **The selected state.** A chosen tab, the current step or a filter that is on.

Everything that used to be an ink block is now a white panel with a hairline: Waiting on you, the new-customer link, the tech pack cover, the page heroes, dialog heads, the Shopify connection and the money summary.

## Type

- Headlines are Space Grotesk at weight 300, set big and tight. My day's greeting and the client's room name are the largest.
- Labels, counts and states are IBM Plex Mono, small, upper case, tracked out.
- Body text is Space Grotesk at 14–15 px.

## The header and the sidebar

- **The header** is paper, blurred, with a hairline under it. The wordmark is in ink and keeps its cue line under BASICS.
- **The sidebar** is white. The open section sits on paper, with a cue dot on its icon.
- **The section tab row** is paper. The open part is ink.

## Adding a page

- Link `/cue.css` just before `</head>`, after the page's own styles.
- Use the tokens rather than hex values.
- Draw a large surface as a white panel with `border: 1px solid var(--line)`, not an ink block.

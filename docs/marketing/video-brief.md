# Video brief: the Design Lab and the tools

A brief for making short promotional videos (15 to 60 seconds) about the Future Basics Design Lab and the tools around it. It is written so
someone with no other context can plan, script and cut a video that is accurate. Every claim here is true of the product today (November
2026). If a feature is not in this brief, check `docs/design-lab.md` and `docs/design-to-factory.md` before showing or promising it.

**Keep it current.** When a tool, a price or a number below changes, update this file in the same PR. The Design Lab card in the client hub (the reel, `LAB_REEL` in `src/client.html`) quotes the same numbers (26 bases, 42 details, 8 colour systems, 382 flat sketches across 24 styles, 12 leathers, 14 vegan leathers): change them there too.

---

## 1. What Future Basics is, in one breath

Future Basics takes a product from an idea to a factory-ready tech pack, and then through samples to production. The **Design Lab** is the
studio where that happens. It is used by our own team, and clients can open it in their own room: pick or draw a piece, colour it, place
graphics, and it comes out as a tech pack that a factory can quote from and make.

**The short line:** *From idea to factory, in one place.*

## 2. The value proposition

| For | The problem | What we give them |
| --- | --- | --- |
| **Brand founders and small labels** | Getting from an idea to something a factory will quote takes a designer, a tech designer, a pattern maker and weeks of email. | Design by picking, real flats, and a tech pack a factory can read, in an afternoon. |
| **Artists, labels and merch teams** | Merch looks generic, and nobody on the team speaks "factory". | Their own graphics on real garments, colourways from a colour system, and a pack and production package for the factory. |
| **Designers** | The pro tools are expensive and do not connect: Illustrator for flats, spreadsheets for specs, email for factories. | One workspace: picture, flats, measurements, materials, decoration and the pack, with an iPad and Apple Pencil mode. |
| **Factories** | Packs arrive incomplete and in a language they have to translate. | A link to the pack in their language (Chinese, Spanish, Portuguese or Italian), messages on the pack, and every version kept. |

**Three proof points to lean on:**

1. **It is a real flat, not an AI picture.** Pieces are drawn on a library of 382 professional flat sketches across 24 garment styles, measured in inches,
   front and back. What you see is what the factory gets.
2. **It goes all the way to the factory.** The same piece becomes the tech pack: measurements, bill of materials, colourways with Pantone C
   codes, decoration sheets, costing, PDF and Excel export, and a factory link.
3. **No design skills needed to start.** The recipe menu lets anyone build a piece by picking a base, add-ons and a colour system.

## 3. The tools to feature

The ones to lead with are first.

### Recipe menu (lead with this)
`/lab/recipe`. Design by picking, the way you would order food.

1. **Pick a base:** 26 staples at their usual fit. These are the tee (classic, boxy, oversized), long-sleeve, tank, polo, crewneck, hoodie,
   zip hoodie, button-up and camp shirts, zip jacket, vest, coat, straight and wide trousers, shorts, leggings, dress, skirt, cami, bodysuit,
   six-panel cap, bucket hat, beanie and tote.
2. **Add details** (42 add-ons): pockets, zips, plackets, drawcords, collars (polo, johnny, rugby, henley, V-neck, button-down, camp, stand,
   shearling, thin crew, mock neck, turtleneck…), pleats, cropped (with any collar: a cropped shearling aviator), contrast pockets, and wash &
   wear (garment dyed, vintage stone wash, acid wash, sun faded, dirty vintage tint, worn edges, distressed, heavily destroyed).
3. **Pick a colour system** (8 ready-made, or four colours of your own). The first colour is the garment, the next is the stitching, and
   every colour becomes a colourway.
4. **Optional:** pick the cloth. The drawing takes on its surface (denim reads as denim, sherpa as sherpa) in the colour you picked. It comes with a fabric check that flags cloth that does not suit the style. You can also fit it together
   with sliders for body width, length, and the size and place of each pocket.
5. **Open in the Studio:** the concept, its flats and its colourways are made in one go.

**What makes it good on camera:** the drawing updates live with every tap, and a picked option glows green. A collar never sits on top of
the neckline: the piece moves to the sketch that has that collar. A second pocket replaces the first instead of stacking. Details the sketch
already has show as "on the sketch".

### The Studio (the design workspace)
`/lab/studio`. One workspace with four views of a piece: the picture, the flat front, the flat back, and the pattern or engineering.

- On the flats: **Colour a panel** (tap a sleeve and both sleeves take the colour, right to their seams; a tap on a rib takes the whole band)
  and **Cloth** (pick a fabric and the flat shows its surface; it becomes the garment's main fabric).

- **Necklines:** swap a tee's neck like a pocket: thin crew, regular crew, V neck, mock neck or turtleneck, drawn on the flats and specced for the factory.
- **Wash & distress:**
  - Pick a wash at light, medium or heavy: spray fade, pigment, dirty vintage, stone, acid, snow, enzyme, potassium permanganate, bleach or mineral.
  - Switch on distressing, slide it up, and choose edges only or the body.
  - The flat shows a vintage fade with dark ribs, chewed collars, ragged hems and knee rips, and the factory gets the words.
- Pro drawing tools: a pen tool with editable curves, shape booleans, snapping and guides, align and distribute, ⌘K to find any command,
  and SVG in and out.
- The tools a physical product and its packaging need, on the same keys as Illustrator:
  - **Artboards (⇧O):** one board per face of a pack, sized in mm or inches with its bleed; **Lay out a box** turns a length, width
    and depth into seven faces and the dieline to cut it.
  - **Divide** and the **Shape builder (⇧M):** cut overlapping shapes into pieces, drag across pieces to merge them.
  - **Reflect (O)** and **Scale (S):** mirror or resize to an exact size, as a copy if wanted.
  - **Width (⇧W):** a line that tapers or swells along its length.
  - **Outline mode (⌘Y)** and **Preflight:** bare paths, stray points shown in red and removed in one press.
  - **Measure (⇧U)** and **Info (⌘U):** distances and angles in mm or inches.
  - **Symbols:** change one screw or button and every copy follows.
  - **Fills:** linear and radial gradients, a four-corner mesh, and pattern fills from a layer or a tile the image model draws.
  - **Type on a path (⇧T):** words round a can's rim or a bottle's shoulder.
  - **Global swatches:** named colours with their Pantone C; change the swatch and everything using it changes.
  - **Clipping masks (⌘7)** and **groups (⌘G)**.
  - **3D mockup:** the artwork on a can, a box, a bottle or a pouch, turned in 3D.
  - **Package:** one zip for the vendor with the picture, the SVG, every artboard, every linked picture, the fonts, the colours with
    their Pantone C and a report.
- A board shows the picture, flats, colourways and sizes side by side.
- **Freehand pattern edits:** in the pattern, draw over a piece to redraw an edge, cut it in two along a new seam, or draw a new piece; **Built with** shows what the pattern is drafted from (raglan, yoke, cargo, double knee…) and can read it from a freehand drawing.
- **A new graphic, right on the flats:** open the graphic studio from the panel, draw or make it with AI, and **Put it on the garment**; or upload your own artwork.
- **Make the turns from the flats** draws the piece on a model from four sides, every logo and graphic in place, and **Make the walk** films the model walking in it, right on the board.
- **iPad and Apple Pencil:** pressure, palm rejection, pinch, pan and a two-finger turn of the picture and the flat (it snaps square; Fit straightens it). Undo and redo sit at the top of the tool rail, and the rail can show each tool's name and what it does. The brush has eight tips (round, pencil, ink pen, marker, airbrush, calligraphy, chalk, spray) and the eraser a hard and a soft one, each with its own size on a big slider beside the canvas. It can be kept on the home screen like an app.
- **Draw the picture from the flats:** one tap turns the coloured flat into a concept picture.
- Every detail from the recipe can be moved, resized, recoloured or removed on the flats. **Edit recipe** reopens the menu with the piece's
  own picks.

### Sketch pack
`/lab/sketches`. 382 flat sketches (men's, women's and accessories) and 203 parts: pockets, zips, collars, trims and buttons. Pick one and
open it in the Studio with your material and colour already applied. The cloth is ranked for the sketch you picked: for a tee, the best tee jerseys come first, then what also suits it,
then what works with changes, with the cloth that does not suit it folded away. Type to filter by any word or weight ("organic", "180").

### Graphics, prints and decoration
- Graphics as real artwork, placed in inches on the garment and drawn on both the picture and the flats.
- **Graphics studio, three engines at once:** type what it is, tap a season (12, each with its own palette) and a style (10), choose
  1 to 8 inks, and Claude, OpenAI and Google each draw their take side by side. If one engine is down, the others still answer.
- **Every generated graphic arrives as vector inks:** one layer per ink with its Pantone. Recolour an ink, merge two, drop one, try a
  season's palette or shuffle the colours; trace it again finer or bolder, thicken the lines, add a key line, edit the points.
- **Type like a merch designer:** 47 free, open-source fonts (varsity, retro, script, hand-drawn, stencil, western, blackletter,
  seasonal), picked by eye with your own words set in each. All caps or title case, stretch, a second outline for the varsity look, and a
  drop shadow or 3D block that prints as solid ink.
- **Print filters:** turn any layer into halftone dots (round, square, diamond, line or cross, any size and angle), hand-drawn stipple,
  a few flat colours (posterize), one solid ink, or a two-ink duotone, with a live preview. Every result is printable in a few screens.
- **Type in a shape:** bridge, bulge, pinch, flag, wave, rise and grow, on top of arch; the words stay editable.
- **Drawing like Procreate:** a Steady slider smooths a shaky line, QuickShape snaps a rough circle, oval, triangle or line to a clean one
  when you hold the Pencil still, Lock paints only inside what is already painted, and Fill colours inside your lines with one tap.
- **On garments:** the graphic on eight shirt colours (or any colour); it says which ink is knocked out by the shirt and when a dark
  shirt needs a white underbase.
- **Colour at the tip of the Pencil:** recent colours and the brand's palette sit right on the brush bar; the rainbow swatch opens any colour.
- **Pencil to outlines:** sketch with the Apple Pencil on the picture or right on the flat, tap **Outlines**, and the drawing becomes
  clean vector lines. Tap **Refine** for cleaner and smoother lines, up to six times; the original drawing is kept underneath.
- **Straight to print:** put it on the garment, see the separations, or download the vector as SVG, or as a PDF with the art and a film
  page for every ink.
- **New prints from old:** blend two prints, or make a print in the style of another, with a preview before you keep it. Any kept print can
  become an all-over repeat.
- **Embroidery:** a realistic sew-out preview with playback, and a quality report.
- **Decoration sheet:** graphics at real size, colour separations, and inks per colourway.

### Materials and trims
A library of photo-real fabric and trim swatches, recoloured to your colour. It covers fabrics, footwear materials, plush, plastics and
acrylics.

The fabrics are browsed by family and weight:
- tee jersey by fibre, spinning and weight, from 120 gsm featherweight Supima to 330 gsm loop-wheeled heavyweight (Pima, Egyptian, organic, ring-spun, slub, pigment-dyed, tubular);
- shirting cottons from voile and lawn to oxford and flannel;
- chinos, cords and moleskin;
- 12 leathers;
- 14 vegan leathers, from PU to cactus, apple, mycelium and cork.

Labels chosen on a garment are drawn on its flats where they are sewn; they can be added and removed in one tap from the flat's Garment panel.

### Beyond clothing (good for a "it does more than tees" cut)
- **Bags:** backpacks, slings, totes, helmet bags, work bags, messengers, duffels and waist bags, designed as a bag designer would and rendered on a set that suits each; a design sheet; drawn in panels a designer recolours and reshapes; and a library of eleven original bag flats to start from.
- **Footwear:** concepts drawn as designer-grade three-quarter renders on a set that suits the shoe, a design sheet (side, top, outsole, heel and four colourways on one board), the shoe drawn as a technical flat in five views and traced into panels a designer recolours and reshapes in the Studio, a parametric shoe last, the upper flattened off the last into pattern pieces, a size run, and a tech flat from four sides.
- **Plush:** photo-real concepts, patterned like clothing.
- **Patterns:** the product shown exploded into the pieces it is cut from, with an AAMA/ASTM DXF export.
- **Engineering:** hard goods, toys, home objects and electronics as 3D parts in an exploded view, with tooling and cost, a bill of materials,
  and STL and STEP files. Starting points include a CD player, turntable, headphones, a smart speaker, a power bank and a lamp.

### Sample review form (good for a "from the table" cut)
`/samples/:product`. The form a team fills in when a sample arrives, made from the tech pack the sample was made to, on a tablet at the table.

- Every measurement at the sample size, with its tolerance: out of tolerance turns red as you type; **Make it the spec** accepts the sample's number and the size run moves with it.
- Every callout, artwork placement, material, colourway, construction line and label from the pack, each one OK, Fix or N/A. A Fix says what to change, must fix or should fix, with a photo.
- Tap the flat to pin anything the pack does not name.
- A verdict (approved, approved with changes, another sample, rejected), then **Hand over to the tech pack**: the fixes become corrections in the next version, and the pins become callouts the factory sees in its language.
- The next sample's form opens with the last one's fixes at the top.

**What makes it good on camera:** the "What goes into the tech pack" list writing itself as the room ticks through the lines.

### Shared workspace
`/workspace`, in the hub. Where a brand's team works together.

- **Team chat:** a #general channel and one per drop or product. Live: a teammate's message appears on everyone's open page the moment it is sent. The team's channels are theirs; typing **@futurebasics** brings Future Basics into a channel. **@name** reaches a teammate by email.
- **Board:** tasks given to a teammate or to Future Basics, with To do, Doing, In review and Done, due dates, and late ones marked.
- **Who's here:** who has a tech pack, a sample review or a piece in the Studio open right now. The same initials show on the pack and next to Save in the Studio, and a save from an older copy never overwrites someone else's.

### Your sites (in the hub)
The sites and prototypes Future Basics builds for a brand land in the brand's own room. Each shows its picture, where it stands (concept, in progress, live) and a note from Future Basics, with **Open** and **Send notes**. Notes go straight back to the Future Basics team.
- Each site sits in a project with its stages, the agreement and invoices.
- A **go-live checklist** splits launch into the brand's side and ours. Theirs shows under Needs attention with a Done button, and both sides tick off on the project so everyone sees how close it is.

### The tech pack and the factory
- Measurements in inches with cm alongside, a bill of materials, colourways with Pantone C codes, callouts pinned on the picture, sample
  stages and inspection criteria.
- A **cost estimate:** landed cost per unit, margin against retail, and price breaks. Export to PDF, Excel or CSV.
- A **factory link** in their language, with messages on the pack. A quotation link hides the client's name. Every version is kept, and the
  factory is told what changed.
- **Production package:** one zip with everything a factory needs.

## 4. Prices (live numbers; check `/pricing` before publishing)

| Offer | Price |
| --- | --- |
| First tech pack | Free |
| One tech pack | $48 |
| Membership | $100 a month |
| Design Lab in your own room | $499 for 90 days, including 40 AI generations; $2.50 a generation after that |
| A project with us (design and development) | Priced by quote |

Do not put prices in a video unless the video is about pricing. If you do, send viewers to **hub.thefuturebasics.com/pricing**.

## 5. Video ideas

Each one is a single idea, made for a phone screen first (9:16), with captions on: most people watch without sound.

| # | Title | Length | The beat |
| --- | --- | --- | --- |
| 1 | **"Order a hoodie like you order food"** | 20–30 s | Recipe menu: pick a hoodie, cropped, zip pocket, Washed earth colours, then a fleece. The drawing changes with each tap, then Open in the Studio. End card. |
| 2 | **"It's a real flat"** | 20 s | A piece's flats, front and back, zoomed in to the stitch lines and measurements, then the tech pack page with the same flat. "What you see is what the factory gets." |
| 3 | **"One idea, eight colourways"** | 15 s | Flip through the colour systems on one piece. Quick cuts, one per colour. |
| 4 | **"From sketch to factory"** | 45–60 s | The whole route: recipe, Studio (place a graphic), tech pack (measurements, BOM, cost), factory link in Chinese. A timer in the corner. |
| 5 | **"Collars that sit right"** | 15 s | Tee, then Polo collar: the piece moves to the polo sketch. Button-up, then Button-down: the buttons appear on the collar points. |
| 6 | **"Draw it on an iPad"** | 20–30 s | Apple Pencil in the Studio: the pen tool, a graphic placed on the chest, then flipping to the flat. |
| 7 | **"Make a print from two prints"** | 20 s | Blend two prints, preview, keep, then make it an all-over repeat on a shirt. |
| 8 | **"Not just clothes"** | 30 s | A shoe last and its upper pieces, a plush, then an exploded CD player in 3D. |
| 9 | **"What does it cost to make?"** | 20 s | The cost estimate block: landed cost, margin, price breaks, then export to Excel. |
| 10 | **"The sample review"** | 30 s | A hoodie sample on the table, an iPad beside it. Type two measurements (one turns red), mark a callout Fix, tap the flat to pin the hem, choose Another sample, Hand over. Cut to the tech pack: the corrections and the pin on the flat. |
| 11 | **"Your team, one room"** | 20 s | #tour-hoodie channel, @futurebasics brings us in, a task moves to Done on the board, two sets of initials on the same tech pack. |
| 12 | **"Box to mockup"** | 30 s | Lay out a 120 × 160 × 40 mm box: seven faces and the dieline appear. Drop the artwork on the front, type round the lid, then the 3D mockup turns the box in your hand. End on Package. |

**A shape that works for each one:** a hook in the first 2 seconds (show the result first), then the steps, then the payoff, then an end card
with the URL.

## 6. Look and sound

- **Colours:** Ink `#141416`, Paper `#FFFFFF`, Fog `#F5F5F2`, Dim `#727278`. The one accent is **Cue green `#4BFF9A`**, the same glow the
  app uses on a picked option. Use it for one highlight at a time, never as a background.
- **Type:** Space Grotesk for titles and captions, IBM Plex Mono for small labels and numbers.
- **The mark:** the cue, a green line and a dot (work moving from one pair of hands to the next). It works well as a transition or a
  progress line between steps. The files are on the Brand page in the work console (`/brand`).
- **End card:** the wordmark and **thefuturebasics.com** (or hub.thefuturebasics.com/pricing for pricing videos).
- **Tone:** plain and confident; show, don't claim. Short sentences. No hype words ("revolutionary", "game-changing"), and no exclamation
  marks.
- **Who it's for:** Future Basics is male-driven and unisex. Lead with menswear pieces in unisex fits. Women's pieces are on the menu and
  can appear, but they are not the lead.

## 7. Rules (please read)

- **Use made-up work only.** Never show a real client's name, room, products, graphics or tech packs. Make demo pieces in a test room.
- **Don't name other brands.** The Lab reads the market and keeps a list of brands it watches; keep that list, and any brand name, out of
  videos.
- **Don't show staff-only screens:** the work console, Money, the CRM, client lists or the research library.
- **Don't promise what isn't built.** If it is not in section 3, ask before showing it.
- **AI generations cost money.** The picture, views, walk and 3D try-on are metered. Plan the shots and reuse a made piece rather than
  generating again and again.
- **Avoid screen-recording sign-in codes or email inboxes.**

## 8. Where to record

| What | Where |
| --- | --- |
| Recipe menu | `/lab/recipe` |
| Studio | `/lab/studio?concept=…` (open one from the recipe menu) |
| Sketch pack | `/lab/sketches` |
| Graphics, prints | `/lab/library` |
| Materials | `/lab/materials` |
| Pricing (public) | `/pricing` |
| Start a project (public) | `/start` |

All are on hub.thefuturebasics.com. The Lab pages need a signed-in room with the Lab open.

## 9. Words to use

| Say | Instead of |
| --- | --- |
| tech pack | spec document |
| flats, flat sketch | line drawing, vector |
| colour system, colourway | palette, variant |
| the factory | the vendor, the supplier |
| your room | your account, your workspace |
| the Design Lab | the app, the platform |

## 10. Source documents

- `docs/design-lab.md`: everything the Lab does, in detail.
- `docs/design-to-factory.md`: the route from a line plan to a corrected sample.
- `docs/cost-exports-pricing.md`: costing, exports and the pricing page.
- `docs/brand-kit.md`: brand files and rules.

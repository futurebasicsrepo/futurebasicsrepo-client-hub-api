# Brand and assets

`/brand` on the work console (work.thefuturebasics.com/brand, also in the left menu as **Brand and assets**): the Future Basics wordmark and the cue mark, icons, social and email images, colours, fonts and a short guide, to use and download. Open to every signed-in staff member (anyone with an `@thefuturebasics.com` sign-in); clients and strangers get nothing.

## What is on it

| Section | Files |
|---|---|
| **Wordmark** (Ink, White, Black one-colour, Cue green) | Web: SVG, PNG 600 / 1200 / 2400 px (transparent), WebP. Print: SVG, PDF (vector; RGB, and CMYK black K100 for one-colour print), PNG 300 dpi (4000 px), TIFF 300 dpi, JPG on white 300 dpi. Also a white-on-Ink panel (PNG for screens, JPG 300 dpi for print). |
| **The mark** (the cue: a line and a dot) | Ink line + Cue dot, White line + Cue dot, and two one-colour versions (black, white) as SVG, PDF (RGB, or CMYK black), PNG 600/1200, WebP, PNG and TIFF at 300 dpi, JPG on white. The **wordmark + cue** lockup (Ink, White) as SVG, PDF, PNG, 300 dpi PNG. **Moving** versions: an animated SVG (light and dark; plays as an image, stops for reduced motion) and a GIF (on Ink, on white) for email, Slack and slides. |
| **App icon and favicons** | The compact mark on a square, on Ink / Paper / Cue (SVG, PNG 1024, PNG 512). The wordmark on a square is kept as "Name on a square" for places that can read it. `favicon.ico` (16/32/48), favicon PNGs, Apple touch icon 180, web app icon 192, maskable 512. |
| **Social and email** | Profile pictures 1080 (Ink, Paper), link preview 1200 × 630, LinkedIn banner 1584 × 396, X header 1500 × 500, email signature logo (Ink and white, 480 px for a 240 px display). |
| **Colour files** | `future-basics-colors.css` (variables) and `.json` (HEX, RGB, approximate CMYK, nearest Pantone C chip). |
| **Fonts** | Space Grotesk and IBM Plex Mono: web `.woff2`, installable `.ttf` (Regular, Medium, Bold / Regular, Medium), a web font CSS, and both SIL Open Font Licences. |
| **Brand guide** | A three-page PDF: logo and mark rules, where the mark goes, colours (with RGB, CMYK, Pantone) and type. |

**Download everything** makes one zip, foldered: Wordmark (Vector, Web, Print), App icon and favicons, Social and email, Colours, Fonts (Web, Install on a computer), Brand guide.

## Where it all comes from

Nothing is a separate copy to keep up to date. Every file is made from the one wordmark (`src/icons/wordmark-white.svg`) and the fonts and colours the hub itself uses (`src/fonts`, `src/brand-pdf.js`), the first time it is asked for, and kept in memory until the server restarts. Change the wordmark file and every logo, icon, banner and PDF follows.

## The mark and where it goes

The mark is the green line and dot the console headers and PDF letterheads already used: a line that has been running and a dot that has arrived, standing for work moving from one pair of hands to the next. The Brand page maps nine places it goes (headers, loading, progress and handoffs, section breaks and empty states, favicon and app icon, documents, email, social, print) and says which are in use today and which are new. Geometry (so anyone can rebuild it): a 304 × 40 box, a 240 × 20 line with round ends, a 24 gap, a dot 40 across. Squares use a stouter, shorter cut so it still reads at 16 px. Rules: always runs forward (line left, dot right), the dot is always Cue, one dot of clear space, 48 px / 12 mm minimum, move it only while something is running and one per screen.

## Rules shown on the page

These are starting rules written from how the hub already uses the brand; edit them in `src/brand.html` and `src/brand-kit.js` (the guide PDF) if you want different ones: clear space equal to the wordmark's height, no smaller than 120 px on screen or 30 mm in print, Ink on light and white on dark, one colour (black) in print, Cue only on Ink, never stretch, skew, outline or add shadows.

## Notes

* CMYK numbers are a plain conversion for a first look. For an exact print match give the printer the Pantone chip or ask for a proof. The Pantone chips are the nearest computed matches (see `pantone-c.js`); PANTONE is a registered trademark of Pantone LLC.
* There is no EPS or AI file. The PDF and SVG are true vector and open in Illustrator, Affinity, Figma and print shops' software.
* Routes: `GET /v1/brand` (catalogue), `GET /v1/brand/files/:file`, `GET /v1/brand/kit.zip`. Code: `src/brand-kit.js`, `src/brand.html`. Tests: `test/brand-kit.test.js`, journeys J184 (API) and J185 (browser, desktop and phone).

## Where the mark is used in the product

* **Icons**: the hub's favicon, home-screen and app icons (`src/icons/icon-*.png`, `apple-touch-icon.png`, `icon.svg`) and the link-preview picture (`og-brand.png`, 1200 × 630, the wordmark with the cue) are written from the brand kit by `node scripts/build-brand-icons.mjs`. Run it again if the wordmark or the mark changes. The Tech Pack app (`/start`, the tech pack editor) keeps its own icons (`techpack-v3-*`); `og-join.png` is its own designed card.
* **Link previews**: `/start`, `/help`, `/join`, `/fair`, the hub, the contract signing page and the builds showcase carry Open Graph and Twitter tags, so a texted link shows a picture and a title.
* **Headers**: the cue line under the name, as the console headers draw it, is now also on `/start`, the help page, the factory sign-up, the factory tech-pack page and the quote invite.
* **Email**: `hubEmailShell` opens with the line and dot, drawn in plain HTML (no image to block).
* **Not changed**: PDFs (the dot after the name in the letterhead already is the mark), the Tech Pack app icons, external listings (Stripe checkout, Google sign-in, Shopify, Resend). Use the icon files from the Brand page for those.

The hub and the console share one look built from these colours and fonts: see [daylight.md](daylight.md).

# Brand and assets

`/brand` on the work console (work.thefuturebasics.com/brand, also in the left menu as **Brand and assets**): the Future Basics wordmark, icons, social and email images, colours, fonts and a short guide, to use and download. Open to every signed-in staff member (anyone with an `@thefuturebasics.com` sign-in); clients and strangers get nothing.

## What is on it

| Section | Files |
|---|---|
| **Wordmark** (Ink, White, Black one-colour, Cue green) | Web: SVG, PNG 600 / 1200 / 2400 px (transparent), WebP. Print: SVG, PDF (vector; RGB, and CMYK black K100 for one-colour print), PNG 300 dpi (4000 px), TIFF 300 dpi, JPG on white 300 dpi. Also a white-on-Ink panel (PNG for screens, JPG 300 dpi for print). |
| **App icon and favicons** | The wordmark centred on a square, on Ink / Paper / Cue (SVG, PNG 1024, PNG 512). `favicon.ico` (16/32/48), favicon PNGs, Apple touch icon 180, web app icon 192, maskable 512. |
| **Social and email** | Profile pictures 1080 (Ink, Paper), link preview 1200 × 630, LinkedIn banner 1584 × 396, X header 1500 × 500, email signature logo (Ink and white, 480 px for a 240 px display). |
| **Colour files** | `future-basics-colors.css` (variables) and `.json` (HEX, RGB, approximate CMYK, nearest Pantone C chip). |
| **Fonts** | Space Grotesk and IBM Plex Mono: web `.woff2`, installable `.ttf` (Regular, Medium, Bold / Regular, Medium), a web font CSS, and both SIL Open Font Licences. |
| **Brand guide** | A two-page PDF: logo rules, colours (with RGB, CMYK, Pantone) and type. |

**Download everything** makes one zip, foldered: Wordmark (Vector, Web, Print), App icon and favicons, Social and email, Colours, Fonts (Web, Install on a computer), Brand guide.

## Where it all comes from

Nothing is a separate copy to keep up to date. Every file is made from the one wordmark (`src/icons/wordmark-white.svg`) and the fonts and colours the hub itself uses (`src/fonts`, `src/brand-pdf.js`), the first time it is asked for, and kept in memory until the server restarts. Change the wordmark file and every logo, icon, banner and PDF follows.

## Rules shown on the page

These are starting rules written from how the hub already uses the brand; edit them in `src/brand.html` and `src/brand-kit.js` (the guide PDF) if you want different ones: clear space equal to the wordmark's height, no smaller than 120 px on screen or 30 mm in print, Ink on light and white on dark, one colour (black) in print, Cue only on Ink, never stretch, skew, outline or add shadows.

## Notes

* CMYK numbers are a plain conversion for a first look. For an exact print match give the printer the Pantone chip or ask for a proof. The Pantone chips are the nearest computed matches (see `pantone-c.js`); PANTONE is a registered trademark of Pantone LLC.
* There is no EPS or AI file. The PDF and SVG are true vector and open in Illustrator, Affinity, Figma and print shops' software.
* Routes: `GET /v1/brand` (catalogue), `GET /v1/brand/files/:file`, `GET /v1/brand/kit.zip`. Code: `src/brand-kit.js`, `src/brand.html`. Tests: `test/brand-kit.test.js`, journeys J184 (API) and J185 (browser, desktop and phone).

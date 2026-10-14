# Make page update (thefuturebasics.com/pages/make)

The Make page lives in the live Shopify theme ("Future Basics — Storefront (jacket colourways)"), in two files. The files here are the live versions with the new editions added. `make-page.diff` shows exactly what changed. The Shopify tool this session had cannot write to the live theme, so someone with the admin needs to apply it.

| File here | Goes to |
| --- | --- |
| `sections-make-v3.liquid` | `sections/make-v3.liquid` |
| `templates-page.make.json` | `templates/page.make.json` |

## What changed

- Hero text: cost it, download it as Excel or PDF.
- Platform section: "PDF and Excel export", a cost-estimate bullet, four new tiles (cost estimate, Excel and CSV, your costs stay yours, a short first sign-in), money-in-the-flow now mentions agreements and autopay, a "see pricing" button (hub.thefuturebasics.com/pricing), and the $48 line lists the cost estimate and Excel.
- FAQ: the $48 and first-pack answers updated, and two new questions ("can i open it in excel?", "is the cost estimate a quote?").
- Systems: the payments card mentions agreements with payment plans and autopay, the operations card mentions the sales CRM, "400+" becomes "1,000+" automated checks, and the client hub build lists costing and Excel export.

## To publish (safer way)

1. Shopify admin → Online Store → Themes → the live theme → ⋯ → Duplicate.
2. On the copy: ⋯ → Edit code. Replace `sections/make-v3.liquid` and `templates/page.make.json` with the two files.
3. Preview `/pages/make` on the copy (desktop and phone), then publish the copy.

Editing the live theme directly also works; note that a later save from the theme editor can overwrite `page.make.json`.

The pricing links assume hub.thefuturebasics.com/pricing is live (it is as of the merge of PR #373).

## Roll back

The previous versions are the left side of `make-page.diff`.

# The other views, drawn from the hero

A tech pack needs two mockup views: **lateral + medial** for a shoe, **front + back** for anything else. Customers usually upload one photo. Once the hero image is approved (a person approved it, or it scored high enough to approve itself), the missing views are drawn from it.

## How it works

1. The hero is approved. If a view is missing, a run starts by itself (switch off with `VIEWS_AUTO=off`). The Callouts tab also has **Draw the missing views from the hero** for staff and the client, for a retry.
2. For each missing view the image model gets the approved hero and the original photo and draws the product side-on (lateral = outer side, medial = inner side) or straight on (front, back). Two tries per view (`VIEWS_CANDIDATES`, 1 to 3).
3. A vision model judges each try against the hero: is it really the requested view (a mirrored copy, a pair or a three-quarter angle is not), and is it the same product (shape, materials, colours, details, no invented logos)? A view goes on the pack only if the angle is right and the score is at least the hero bar (`HERO_APPROVE_MIN`, 80).
4. A view that passes is saved on the pack at once, marked "drawn from the approved hero image" (its id starts `hv-`). A view that does not pass is left out and the reason is shown: a wrong picture on a factory document is worse than a missing one.

Rules: a picture someone uploaded for that view is never replaced; a newer drawing replaces an earlier drawing; a page that was open and saves an older copy does not wipe views that arrived in the last few minutes; at most `VIEWS_PER_PRODUCT_DAY` (4) runs per product per day; the pack's edit time is not bumped (a picture arriving is not an edit).

## The checklist wording

"Still missing" and the readiness checks name the product from what was uploaded (`productKind` in `src/techpack.js`): a shoe asks for "Both mockup views (lateral + medial)" and "Artwork placed on the shoe", apparel for front + back and "the garment", an unknown product for the either-or wording. Nothing says "garment" for a shoe.

## Where it lives

| | |
| --- | --- |
| Prompts, judging, placing | `src/views.js` |
| Run, routes, auto start | `src/server.js` (`startViews`, `runViews`, `/v1/products/:id/tech-pack/draft/views`, `/v1/admin/products/:id/tech-pack/views`) |
| Table | `tech_pack_views` |
| Banner and button | `src/techpack.html` (`viewsBanner`, `viewsWatch`) |
| Tests | `test/views.test.js`, journey J166 |

# nickriggle.com redesign

Single-file static site (`index.html`) for Nick Riggle: philosopher at the University of San Diego, author of *This Beauty*, *On Being Awesome*, and *Aesthetic Life and Why It Matters*.

## Design

- **Look**: dark-first, warm ink ground with ivory "paper" plates and a burnished gold accent. Cormorant Garamond for display, Manrope for body and labels (Google Fonts, with system fallbacks).
- **Two audiences, one page**: a Student / Colleague switch in the hero and nav reorders the sections. Students (defaulted on touch devices and narrow screens) get "Start here", Books, and Teaching first. Colleagues (defaulted on desktop) get About, Research, Books, and Talks first. The choice is remembered per browser.
- **Motion**: name-reveal curtain on first visit, drifting gold arcs on a canvas behind the hero with pointer parallax, rotating hero word, scroll-linked word-by-word intro, line-mask reveals, journal marquee, 3D tilting book covers, pinned horizontal book rail on desktop (native snap rail on mobile), expanding research threads, count-up stats with a traced skate arc, custom cursor on pointer devices. Everything honours `prefers-reduced-motion`.
- **Libraries**: GSAP 3.12.5 + ScrollTrigger from cdnjs, used only for parallax and the desktop pinned rail. The page works fully without them.

## Content to confirm before launch

All copy was assembled from public sources (USD, PhilPeople, publisher pages, press). Confirm against Nick's current CV and the live Squarespace site:

- Publication venues and years in the Research section.
- Talks list (Georgia State keynote Oct 2025, Oberlin Feb 2026, Indiana Apr 2026) and any newer dates.
- Teaching copy is intentionally general; add current course titles and posted office hours.
- Book covers are CSS placeholders. Swap in real jacket art inside each `.cover-face`.
- Portrait frame (`.frame`) is a placeholder monogram. Drop a photo in as an `<img>` inside the frame.
- Outbound links (Bookshop, Penguin Random House, Aeon, Psyche, podcast, speaker bureau) were taken from search results and should be clicked through once.

## Deploy

Static: point any host (Vercel, Netlify, Railway static, or Squarespace code injection for a full-page override) at this folder. No build step.

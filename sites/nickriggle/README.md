# nickriggle.com redesign

Static site (`index.html` plus `assets/`) for Nick Riggle: Professor of Philosophy at the University of San Diego, author of *This Beauty*, *On Being Awesome*, *Aesthetic Life and Why It Matters*, and the forthcoming *Understanding Aesthetic Life: Essays*.

## Design

- **Look**: dark-first, warm ink ground with ivory "paper" plates and a burnished gold accent. Cormorant Garamond for display, Manrope for body and labels (Google Fonts, with system fallbacks).
- **Two audiences, one page**: a Student / Colleague switch in the hero and nav reorders the sections. Students (defaulted on touch devices and narrow screens) get "Start here", Books, and Teaching first. Colleagues (defaulted on desktop) get About, Research, Books, and Talks first. The choice is remembered per browser.
- **Motion**: name-reveal curtain on first visit, drifting gold arcs on a canvas behind the hero with pointer parallax, rotating hero word, scroll-linked word-by-word intro, line-mask reveals, journal marquee, 3D tilting book covers, pinned horizontal book rail on desktop (native snap rail on mobile), expanding research threads, count-up stats with a traced skate arc, custom cursor on pointer devices. Everything honours `prefers-reduced-motion`.
- **Libraries**: GSAP 3.12.5 + ScrollTrigger from cdnjs, used only for parallax and the desktop pinned rail. The page works fully without them.

## Content sources

All copy is drawn from the August 2026 CV (`assets/Nick-Riggle-CV-August-2026.pdf`): appointments, books, every article and chapter with venue and year, awards, upcoming and recent talks, service, and graduate committees. Book jackets and the hero portrait in `assets/` are the real images. Public-writing links to the New York Times, Scientific American, and Philosophy Talk point at site searches; replace with the article URLs when convenient.

## Still to add

- Current course titles and posted office hours in the Teaching section (the CV does not list courses).
- Pre-order links for *Understanding Aesthetic Life* once Oxford publishes the product page.

## Sharing

`index.html` carries Open Graph and Twitter card tags pointing at `assets/og.jpg` (1200x630) with absolute URLs. They currently point at `https://nickriggle.vercel.app`; when the site moves to nickriggle.com, replace that base URL in the `<head>` (canonical, og:url, og:image, twitter:image, apple-touch-icon).

## Deploy

Static: point any host (Vercel, Netlify, Railway static, or Squarespace code injection for a full-page override) at this folder. No build step.

# NursePartners concept site: home care showcase

A rebuilt site for NursePartners, Inc. (nursepartners.org), starting from their
[South Philadelphia home care page](https://nursepartners.org/south-philadelphia-home-care/).
It doubles as Future Basics' showcase for home care agencies. The pitch is **"fill the roster, convert the daughter"**, and the website is the credibility layer underneath.

Static HTML, CSS and JS with no build step to deploy. Point any static host at this folder.

## Pages

| Path | Audience | What it shows |
| --- | --- | --- |
| `/` | Adult child researching at 10pm | Three entry points (families, referral partners, CNAs), nurse-led proof, how care starts, a quick cost estimate, a GEMS dementia explorer, a Friday-update teaser, and an FAQ with FAQ schema |
| `/south-philadelphia-home-care/` | Local search | A ZIP checker with real minimums, a rowhome safety checklist, neighborhoods, hospital discharge help, a local FAQ, and Service, Breadcrumb and FAQ schema |
| `/paying-for-care/` | Families confused about money | A cost calculator (rate × schedule, minus LTC daily benefit and VA A&A, with the elimination-period cost), a six-item LTC policy checklist, a benefits checker (VA, PA CHC waiver, LIFE, LTC, Medicare), and a guide to every way to pay |
| `/free-assessment/` | The conversion moment | A five-step booking wizard with a ZIP and minimum check, discharge timing, slot picker, payer hints and TCPA text consent. It never asks for health details |
| `/careers/` | CNAs | Text-style screening (role, certification, experience, areas, availability, transport, shifts) that books the interview, plus pay, benefits and JobPosting schema |
| `/referral-partners/` | Discharge planners, social workers, attorneys | A live start-capacity board, a minimum-necessary referral form, Monday capacity digest signup, and in-services |
| `/family-updates/` | Families (and the retention pitch) | A sample Friday digest, the raw CNA shorthand it was written from, and how it stays private |
| `/dementia-care/` | Families | The GEMS model and Positive Approach to Care, and who leads it |
| `/agency-console/` | **The owner (sales demo)** | Overnight summary, open-shift fill by text, recruiting kanban with ghost re-engagement, an inquiry inbox with an own-vs-rent ROI calculator, digest approval queue, referral-partner nurture, review engine and local SEO, and PHI and hiring guardrails |

Every public page also has the **Care Line**, an after-hours agent. It answers questions about cost, minimums, LTC insurance, VA Aid & Attendance, Medicaid and Medicare, start times, caregivers, dementia care and service areas. It checks ZIPs and books the free assessment in chat. It shows a gentle notice when someone types health details, and it sends emergencies to 911 and the on-call line.

**Demo loop:** anything you do on the public site (chat booking, assessment form, calculator email, referral, text-to-apply) is saved to that browser's `localStorage`. It then appears in `/agency-console/` marked "You, just now". Run through the site as "the daughter", then open the console as "the owner".

## What's real and what's illustrative

These are real, taken from nursepartners.org:
- Founded in 2002 by Angela Geiger RN, and the leadership roles
- CNA-only hiring with one year of long-term care experience
- The 4-hour (inner) and 6-hour (outer) twice-weekly minimums
- Assessment and start within 24 hours, and a clinician on call 24/7
- LTC assignment of benefits and the 3% credit card surcharge
- The GEMS and Positive Approach to Care approach
- Offices, phone number and service areas
- CNA, LPN and RN pay and benefits
- Licensed by the PA Department of Health, not a Medicare agency

These are researched public figures, set in `assets/site.js` → `NP`:
- VA pension MAPR for Dec 2025 – Nov 2026: about $2,424 a month for a veteran and about $1,557 for a surviving spouse, with a $163,699 net-worth limit
- PA waiver limits for 2026: $2,982 a month income and $8,000 in assets
- CareScout 2025 Pennsylvania median of $34 an hour

These are **illustrative** and must be confirmed or replaced before launch:
- Hourly rates in `NP.rates` (sample rate card)
- Every console metric, name and client
- The capacity board values
- The sample family digest
- The inner-ring ZIP list in `NP.coverage`, which approximates "east of I-476"
- Office hours (assumed weekdays 8 to 5)

No reviews or testimonials were invented. The site links to their Caring.com reviews, and the console shows how a review engine would grow them.

## Design

Campaign line: **"Still home."** with a rotating second line (*Still Mom. Still Dad. Still Nana. Still herself.*), built from the agency's own "There's no place like home."

- **Type:** one variable grotesk, Archivo (Google Fonts). Condensed heavy caps for display (`font-stretch:68%`), regular width at 18px for reading.
- **Color:** the logo's plum pushed to near-black ink (`#14061c`), and its pale lime pushed to a single "volt" accent (`#dcf05a`) for highlights, CTAs and the ticker. Everything else is paper and white.
- **Photography:** square, full-bleed, plum duotone with film grain (`.duo`, `.photo`, `.campaign .bg`). This hides the low resolution of the current photos; color returns on hover. A real shoot should replace them.
- **Motion:** proof-point ticker, manifesto words that light up on scroll (`.manifesto`), count-up numbers (`data-count`), and the hero rotator (`data-rotate`). All of it is off under `prefers-reduced-motion`.
- **Components:** numbered index rows for the three audiences, rule-divided steps and stats instead of floating cards, a volt CTA band, and a giant "Still home." footer wordmark.

## Taking it live

The concept runs fully in the browser and sends nothing anywhere. A production build would add:

- **Leads:** form and chat posts go to the Future Basics API, then the agency's CRM and calendar. "As soon as possible" requests page the on-call nurse.
- **Care Line:** the knowledge base in `site.js` becomes the system prompt and tools for an LLM agent. Keep the same scope: no clinical intake, and booking only.
- **SMS:** a HIPAA-eligible provider with a signed BAA. Messages carry times and links only.
- **Shift fill and recruiting:** read from the agency's scheduling system (they use TeamBridge for applications today). A person makes every hiring decision. Applicants are never asked about criminal or salary history before a conditional offer (Philadelphia Fair Chance and wage equity rules).
- **Family digests:** visit notes are drafted only through BAA-covered vendors. A nurse approves every digest before it sends. Recipients are authorized in writing by the client or POA.
- **Franchise check:** this pitch targets independent and private-pay agencies. NursePartners is independent.

## Editing

Pages are plain HTML. The shared header and footer sit between `<!--np:header-->` and `<!--np:footer-->` markers. Edit them in `build.mjs`, then run:

```
node sites/nursepartners/build.mjs
```

The build also fingerprints every CSS/JS link with a hash of the file (`site.css?v=3fa9c1`), so run it after editing `site.css`, `site.js`, `console.css` or `console.js`. Browsers then fetch the new file on their next visit instead of showing a cached copy.

Agency facts (phone, rates, benefit figures) live in one object at the top of `assets/site.js`. The photos are the agency's own images from their current site (`carepartner-walk` is stock). Replace them with a real photo shoot before launch.

## Hosting

`Dockerfile` + `Caddyfile` serve this folder on Railway (set the service's root directory to `/sites/nursepartners`). Pages, CSS and JS are served `Cache-Control: no-cache` (revalidated by ETag, so a deploy shows up on the next load), and images cache for a day. The preview sends `X-Robots-Tag: noindex` and a disallow-all `robots.txt` so the concept never competes with nursepartners.org in search; remove both if this becomes the agency's real site.

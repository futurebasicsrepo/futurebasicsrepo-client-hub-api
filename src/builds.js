// The builds showcase: the technical builds Future Basics shows to clients and prospects (concept sites, apps, integrations), behind a sign-in.
// Pure rules live here (what a build is, who may see which, what the seed list holds) so they are tested without a database or a browser.
//
// Who sees what. A build has a visibility:
//   listed  - anyone signed in who has an invite for "all listed builds", and every existing client
//   invite  - only a person invited to that build by name
//   hidden  - staff only (a draft, or something withdrawn)
// An invite has an optional build: none means "all listed builds", one means that build (listed or invite-only). Invites expire and can be revoked.

export const STATUSES = ['live', 'concept', 'in-progress', 'archived'];
export const VISIBILITIES = ['listed', 'invite', 'hidden'];
export const HOSTINGS = ['railway', 'vercel', 'shopify', 'github-pages', 'other'];
export const STATUS_LABELS = { live: 'Live', concept: 'Concept', 'in-progress': 'In progress', archived: 'Archived' };

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clipBlock = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const RESERVED = new Set(['me', 'auth', 'admin', 'go', 'invites', 'activity', 'cover']); // paths the showcase itself uses
export const slugify = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
// http(s) only, no credentials in the address: this is where a visitor is sent
export function cleanUrl(v) {
  const s = String(v || '').trim(); if (!s) return '';
  try { const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s); if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null; return u.toString().replace(/\/$/, u.pathname === '/' && !u.search && !u.hash ? '' : '/'); } catch { return null; }
}

// → { value } or { error }
export function cleanBuild(input = {}, { partial = false } = {}) {
  const i = input && typeof input === 'object' ? input : {}, out = {}, has = k => !partial || k in i;
  if (has('name')) { out.name = clip(i.name, 80); if (!out.name) return { error: 'A build needs a name' }; }
  if (has('slug') || (!partial && out.name)) { out.slug = slugify(i.slug || out.name); if (!out.slug) return { error: 'The address needs letters or numbers' }; if (RESERVED.has(out.slug)) return { error: `“${out.slug}” is used by the showcase itself; pick another address` }; }
  if (has('tagline')) out.tagline = clip(i.tagline, 140);
  if (has('sector')) out.sector = clip(i.sector, 40);
  if (has('status')) { out.status = STATUSES.includes(i.status) ? i.status : 'concept'; }
  if (has('visibility')) { out.visibility = VISIBILITIES.includes(i.visibility) ? i.visibility : 'hidden'; }
  if (has('hosting')) out.hosting = HOSTINGS.includes(i.hosting) ? i.hosting : 'other';
  for (const [k, col] of [['liveUrl', 'live_url'], ['repoUrl', 'repo_url']]) if (has(k)) { const u = cleanUrl(i[k]); if (u === null) return { error: `${k === 'liveUrl' ? 'The live address' : 'The repository address'} must be a web address (https://…)` }; out[col] = u; }
  if (has('stack')) out.stack = (Array.isArray(i.stack) ? i.stack : String(i.stack || '').split(',')).map(x => clip(x, 30)).filter(Boolean).slice(0, 14);
  if (has('summary')) out.summary = clipBlock(i.summary, 2000);
  if (has('highlights')) out.highlights = (Array.isArray(i.highlights) ? i.highlights : []).map(h => ({ title: clip(h?.title, 80), text: clip(h?.text, 280) })).filter(h => h.title || h.text).slice(0, 8);
  if (has('links')) {
    const list = Array.isArray(i.links) ? i.links : [], links = [];
    for (const l of list) {
      const url = cleanUrl(l?.url); if (url === null || (!url && (l?.label || l?.url))) return { error: `“${clip(l?.label || l?.url, 40)}” needs a web address (https://…)` };
      if (url) links.push({ label: clip(l.label, 60) || new URL(url).hostname.replace(/^www\./, ''), url });
    }
    out.links = links.slice(0, 8);
  }
  if (has('sortOrder')) { const n = Number(i.sortOrder); out.sort_order = Number.isFinite(n) ? Math.max(0, Math.min(9999, Math.round(n))) : 100; }
  return { value: out };
}

// "Title — text" lines (one highlight per line) ⇄ the stored list, for the admin form
export const highlightsFromText = text => String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = /^(.*?)\s+[—–-]\s+(.*)$/.exec(l); return m ? { title: m[1], text: m[2] } : { title: l, text: '' }; });
export const highlightsToText = list => (list || []).map(h => h.text ? `${h.title} — ${h.text}` : h.title).join('\n');

// "Label — https://address" lines (one extra link per line) ⇄ the stored list, for the admin form. The address is the last word on the line.
export function linksFromText(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const at = l.search(/\S+$/), url = l.slice(at), label = l.slice(0, at).replace(/[\s—–|:-]+$/, '').trim();
    return { label, url };
  });
}
export const linksToText = list => (list || []).map(l => `${l.label} — ${l.url}`).join('\n');

const active = (inv, now) => !inv.revoked_at && new Date(inv.expires_at).getTime() > now;

// The viewer: { staff, client, invites: [{ build_id, expires_at, revoked_at }] }
export function canSee(build, viewer, now = Date.now()) {
  if (!build || !viewer) return false;
  if (viewer.staff) return true;
  if (build.visibility === 'hidden' || build.status === 'archived') return false;
  const mine = (viewer.invites || []).filter(inv => active(inv, now));
  if (mine.some(inv => inv.build_id === build.id)) return true;
  if (build.visibility === 'listed') return Boolean(viewer.client) || mine.some(inv => !inv.build_id);
  return false;
}
export const visibleBuilds = (builds, viewer, now = Date.now()) => builds.filter(b => canSee(b, viewer, now)).sort((a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name));

// is this address allowed to ask for a sign-in code at all?
export const hasAnyAccess = (viewer, now = Date.now()) => Boolean(viewer && (viewer.staff || viewer.client || (viewer.invites || []).some(inv => active(inv, now))));

// The builds already made, seeded once, hidden until they have been reviewed in the console.
export const SEED_BUILDS = [
  { slug: 'spot', name: 'Spot', tagline: 'The yes button for AI shopping.', sector: 'Commerce · AI', status: 'live', hosting: 'railway', liveUrl: 'https://spotmeplease.com',
    summary: 'AI can find it and fill the cart; a person has to say yes to paying. Spot is that yes: from the user, or from whoever is paying, with rules the user sets for their AI and signed proof of every approval. Stores embed an "Ask someone to pay" button by their checkout.',
    highlights: [{ title: 'Rules for every AI key', text: 'Per-order and monthly limits, allowed stores, refused or sent to an approver' }, { title: 'Signed approvals', text: 'EdDSA-signed proof of every yes; requests to stores are signed too' }, { title: 'Store button', text: "Opens the shopper's cart at the store's own prices" }], stack: ['Node', 'Fastify', 'Postgres', 'Shopify app', 'Railway'] },
  { slug: 'bennys-beans', name: "Benny's Beans", tagline: 'Roasted after you order.', sector: 'Coffee · Retail', status: 'concept', hosting: 'railway', liveUrl: 'https://bennys-beans.up.railway.app',
    summary: "A rebuilt site for a one-person small-batch roaster, and a system that makes two roast days a week run themselves: shop, subscriptions, brew guides, wholesale, find-us, gifts, and a roaster console. Built as Future Basics' showcase for coffee businesses.",
    highlights: [{ title: 'Live roast clock', text: 'The hero shows the next roast day and what is still open to order' }, { title: 'Roaster console', text: 'The roaster runs the order-to-roast cycle from one screen' }, { title: 'Subscriptions and wholesale', text: 'Both are on the page, not a contact form' }], stack: ['Static HTML/CSS/JS', 'Caddy', 'Railway'] },
  { slug: 'modish-nail-spa', name: 'Modish Nail Spa', tagline: 'Polished, with a pour.', sector: 'Salons · Spas', status: 'concept', hosting: 'railway', liveUrl: 'https://modish-site-production.up.railway.app',
    summary: 'A rebuilt site for a two-location nail spa. The website sells the experience and the system behind it keeps chairs full: live open/closed status and walk-in wait, a lookbook with "Book this look", booking by service, technician and time, a remote walk-in waitlist, gift cards, and an owner view.',
    highlights: [{ title: 'Book the chair', text: 'Spa → services → technician → a time that fits the visit' }, { title: 'Remote waitlist', text: 'Walk-ins join from their phone and are told when to come' }, { title: 'Owner console', text: 'Bookings, waitlist and gift cards in one place' }], stack: ['Static HTML/CSS/JS', 'Caddy', 'Railway'] },
  { slug: 'nursepartners', name: 'NursePartners', tagline: 'Fill the roster, convert the daughter.', sector: 'Healthcare · Home care', status: 'concept', hosting: 'railway', liveUrl: 'https://nursepartners-site-production.up.railway.app',
    summary: "A rebuilt site for a home care agency, aimed at the adult child researching at 10pm, referral partners and caregivers: a cost calculator, local pages with a ZIP checker, a dementia care explorer, weekly family updates, and an agency console.",
    highlights: [{ title: 'Three entry points', text: 'Families, referral partners and caregivers each get their own path' }, { title: 'Cost calculator', text: 'Rate × schedule, minus what long-term-care cover pays' }, { title: 'Local search pages', text: 'ZIP checker, neighbourhoods and FAQ markup' }], stack: ['Static HTML/CSS/JS', 'Railway'] },
  { slug: 'common-ground', name: 'Common Ground', tagline: "Philly sneaker and streetwear consignment, dressed in '90s nostalgia.", sector: 'Retail · Shopify', status: 'live', hosting: 'shopify', liveUrl: 'https://commonground12.com', repoUrl: '',
    summary: 'A from-scratch Shopify theme for a consignment and trade-in store, with a mega menu of every collection, filters that work, a Sell page that sends items with photos to an offers system, and a staff counter for making offers.',
    highlights: [{ title: 'Real filtering', text: 'Brand, type, size grid, price, availability, colour and tags over AJAX' }, { title: 'Sell and trade-in', text: 'Sellers send photos and get an offer thread on a private link' }], stack: ['Shopify Online Store 2.0', 'Liquid', 'Fastify', 'Postgres'] },
  { slug: 'cuesea', name: 'Cuesea', tagline: '', sector: '', status: 'live', hosting: 'other', liveUrl: 'https://cuesea.ai', summary: 'To fill in.', highlights: [], stack: [] },
  { slug: 'incha-tv', name: 'incha.tv', tagline: 'A fan-first media platform by INCHA Studios.', sector: 'Media', status: 'in-progress', hosting: 'vercel',
    summary: 'Fans upload clips and photos, lightly edit them, and publish publicly, unlisted or privately. Videos are converted in the background to play on any phone; others can upvote, comment and share.',
    highlights: [{ title: 'Any phone video', text: 'iPhone HEVC and others converted to H.264 in the background' }, { title: 'Private by default', text: 'Every upload starts as a private draft' }], stack: ['Next.js', 'Fastify', 'Postgres', 'ffmpeg', 'Vercel', 'Railway'] }
];

// The Design Lab: pure logic, no web server and no network in it (lab-scan.js reads the web, lab-routes.js serves it).
//
// The Lab is for Danielle and Kyle (and anyone they tick it for on Team access). It watches what brands like Ralph Lauren, Aimé Leon Dore and
// A-COLD-WALL* make and what is selling through, so line plans start from the market and the Future Basics brand code, not from a blank page.
//
// What it keeps about another brand's product is facts and a link: the name, the price, the category, the cut and fabric in words, the page it came
// from and the address of its picture. It never copies a picture, a logo, a print or a name onto our own work.
export const CATEGORIES = [
  { id: 'tops', label: 'Tops and jersey', hint: 'Tees, shirts, polos, sweatshirts, hoodies' },
  { id: 'knitwear', label: 'Knitwear', hint: 'Sweaters, cardigans, knit polos' },
  { id: 'outerwear', label: 'Outerwear', hint: 'Jackets, coats, vests, bombers' },
  { id: 'tailoring', label: 'Tailoring', hint: 'Blazers, suits, tailored trousers' },
  { id: 'bottoms', label: 'Bottoms', hint: 'Pants, shorts, denim, skirts' },
  { id: 'dresses', label: 'Dresses and sets', hint: 'Dresses, jumpsuits, matching sets' },
  { id: 'headwear', label: 'Headwear', hint: 'Caps, hats, beanies, bucket hats' },
  { id: 'footwear', label: 'Footwear', hint: 'Sneakers, boots, loafers, sandals' },
  { id: 'bags', label: 'Bags', hint: 'Totes, backpacks, duffels, small bags' },
  { id: 'accessories', label: 'Accessories', hint: 'Belts, scarves, socks, eyewear, jewellery, wallets' },
  { id: 'home', label: 'Home and objects', hint: 'Blankets, candles, mugs, things for a room' },
  { id: 'other', label: 'Other', hint: 'Anything that does not fit yet' }
];
export const CATEGORY_IDS = CATEGORIES.map(c => c.id);
export const categoryLabel = id => CATEGORIES.find(c => c.id === id)?.label || 'Other';
export const cleanCategory = v => { const s = String(v || '').trim().toLowerCase(); return CATEGORY_IDS.includes(s) ? s : ''; };

// Guess the category from the words a shop uses, in an order where the more specific word wins ("knit polo" is knitwear, "sneaker sock" is footwear).
const RULES = [
  ['footwear', /\b(sneakers?|trainers?|boots?|loafers?|sandals?|slides?|mules?|clogs?|oxfords?|derbys?|moccasins?|espadrilles?|slippers?|footwear|shoes?|pumps?|heels?)\b/i],
  ['headwear', /\b(caps?|hats?|beanies?|bucket|visors?|balaclavas?|berets?|headband|trucker|fedora|snapback)\b/i],
  ['bags', /\b(bags?|totes?|backpacks?|rucksacks?|duffels?|duffles?|satchels?|crossbody|messenger|clutch|pouch|briefcase|holdall)\b/i],
  ['knitwear', /\b(sweaters?|jumpers?|cardigans?|knit|knitted|pullover|cashmere|merino|fisherman|aran)\b/i],
  ['tailoring', /\b(blazers?|suits?|tuxedo|sport ?coat|waistcoat|tailored|pleated trousers?|dress pants?)\b/i],
  ['outerwear', /\b(jackets?|coats?|parkas?|anoraks?|bombers?|vests?|gilets?|windbreakers?|puffers?|trench|overcoat|shell|fleece|varsity|harrington|peacoat|outerwear|cape|shackets?)\b/i],
  ['dresses', /\b(dress(es)?|jumpsuits?|rompers?|playsuits?|co-?ords?|matching set|two-?piece)\b/i],
  ['bottoms', /\b(pants?|trousers?|shorts?|jeans?|denim|chinos?|joggers?|sweatpants?|cargos?|skirts?|leggings?|culottes?|bottoms?)\b/i],
  ['accessories', /\b(belts?|scarf|scarves|socks?|gloves?|sunglasses|eyewear|glasses|watch(es)?|jewel(l)?ery|necklace|bracelet|ring|wallets?|keychain|keyring|tie|bow ?tie|bandana|cufflinks?|lanyard|umbrella|accessor(y|ies))\b/i],
  ['home', /\b(blankets?|throws?|pillows?|cushions?|candles?|mugs?|towels?|rugs?|tableware|glassware|poster|print|book|vase|lamp|chair|home)\b/i],
  ['tops', /\b(over-?shirts?|t-?shirts?|tees?|shirts?|polos?|henley|tanks?|tops?|hoodies?|hoodie|sweatshirts?|crew ?necks?|crews?|jersey|rugby|blouse|camp collar|long ?sleeve|short ?sleeve|button[- ]?(up|down))\b/i]
];
export function categorize({ title = '', type = '', tags = [] } = {}) {
  const typed = String(type || '').trim();
  if (typed) { for (const [id, re] of RULES) if (re.test(typed)) return id; }
  const hay = `${title} ${(Array.isArray(tags) ? tags : String(tags || '').split(',')).join(' ')}`;
  for (const [id, re] of RULES) if (re.test(hay)) return id;
  return 'other';
}

// ---- robots.txt -------------------------------------------------------------------------------------------------------------------------------
// The scanner only reads what a site's robots.txt allows to anyone ("*") or to our own name. Longest matching rule wins; Allow beats Disallow on a tie.
export const LAB_AGENT = 'futurebasicslab';
export function parseRobots(text) {
  const rules = []; let group = [], inRules = false, any = false;
  const flush = () => { group = []; inRules = false; };
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (inRules) flush(); group.push(val.toLowerCase()); continue; }
    if (key === 'allow' || key === 'disallow') {
      inRules = true; any = true;
      if (!group.some(g => g === '*' || g === LAB_AGENT)) continue;
      const specific = group.includes(LAB_AGENT);
      rules.push({ allow: key === 'allow', path: val, specific });
    }
  }
  // a group that names us beats the "*" group entirely
  const named = rules.filter(r => r.specific);
  return { rules: named.length ? named : rules, any };
}
const patternToRe = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$').replace(/\$$/, '$'));
export function robotsAllows(robots, path) {
  const p = String(path || '/') || '/'; let best = null;
  for (const r of robots?.rules || []) {
    if (!r.path) continue; // an empty Disallow allows everything
    let re; try { re = patternToRe(r.path); } catch { continue; }
    if (!re.test(p)) continue;
    const len = r.path.replace(/[*$]/g, '').length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
  }
  return best ? best.allow : true;
}

// ---- money and sell-through --------------------------------------------------------------------------------------------------------------------
export const toCents = v => { const n = Number(String(v ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : null; };
const daysSince = (iso, now) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? Math.max(0, Math.floor((now.getTime() - t) / 86_400_000)) : null; };

// A shop's public product feed tells which sizes are still in stock. A product with sizes gone is moving; a product that has been live a long time with
// everything in stock is not. This is a proxy for selling through, never a sales number, and the page says so.
export function sellThrough({ variants = [], publishedAt = '', now = new Date() } = {}) {
  const total = variants.length, avail = variants.filter(v => v && v.available !== false).length;
  const days = daysSince(publishedAt, now);
  if (!total) return { variants: 0, available: 0, soldOutShare: null, daysLive: days, heat: null };
  const soldOutShare = Math.round(((total - avail) / total) * 100) / 100;
  const recency = days == null ? 0.75 : days <= 45 ? 1 : days <= 180 ? 0.85 : 0.6;
  const heat = total >= 2 ? Math.min(100, Math.round(soldOutShare * 100 * recency + (days != null && days <= 21 && soldOutShare > 0 ? 15 : 0))) : null;
  return { variants: total, available: avail, soldOutShare, daysLive: days, heat };
}
export const heatLabel = h => h == null ? '' : h >= 60 ? 'Selling fast' : h >= 30 ? 'Moving' : h > 0 ? 'Some sizes gone' : 'Fully in stock';

// ---- reading a shop's own product feed (Shopify /products.json) -------------------------------------------------------------------------------------
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const plain = html => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z#0-9]+;/gi, ' ');
export function shopifyItems(json, origin, { now = new Date() } = {}) {
  const out = [];
  for (const p of Array.isArray(json?.products) ? json.products : []) {
    const handle = clip(p.handle, 200); if (!handle || !p.title) continue;
    const prices = (p.variants || []).map(v => toCents(v.price)).filter(Boolean);
    const tags = Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map(s => s.trim()).filter(Boolean);
    const st = sellThrough({ variants: p.variants || [], publishedAt: p.published_at || p.created_at, now });
    out.push({
      url: `${origin}/products/${handle}`, title: clip(p.title, 200), imageUrl: clip(p.images?.[0]?.src || p.image?.src, 600),
      priceCents: prices.length ? Math.min(...prices) : null, currency: 'USD', category: categorize({ title: p.title, type: p.product_type, tags }),
      productType: clip(p.product_type, 80), vendor: clip(p.vendor, 80), tags: tags.slice(0, 12).map(t => clip(t, 40)),
      description: clip(plain(p.body_html), 500), publishedAt: p.published_at || p.created_at || null, sellthrough: st
    });
  }
  return out;
}

// ---- reading a page's own markup (JSON-LD, Open Graph) -----------------------------------------------------------------------------------------------
const abs = (u, base) => { try { const x = new URL(String(u || '').trim(), base); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : ''; } catch { return ''; } };
const imgOf = i => Array.isArray(i) ? imgOf(i[0]) : typeof i === 'string' ? i : i?.url || i?.contentUrl || '';
function walkLd(node, found) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walkLd(n, found); return; }
  const type = [].concat(node['@type'] || []).map(String);
  if (type.includes('Product') || type.includes('ProductGroup')) found.push(node);
  for (const k of ['@graph', 'itemListElement', 'item', 'hasVariant', 'mainEntity']) if (node[k]) walkLd(node[k], found);
}
export function jsonLdProducts(html, pageUrl) {
  const found = [];
  for (const m of String(html || '').matchAll(/<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walkLd(JSON.parse(m[1].trim()), found); } catch { /* a broken block is skipped */ }
  }
  const out = [];
  for (const p of found) {
    const offer = [].concat(p.offers || [])[0] || {}, price = offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price;
    const url = abs(p.url || offer.url || pageUrl, pageUrl), title = clip(p.name, 200); if (!url || !title) continue;
    out.push({ url, title, imageUrl: abs(imgOf(p.image), pageUrl), priceCents: toCents(price), currency: clip(offer.priceCurrency, 3) || 'USD', category: categorize({ title, type: p.category }), productType: clip(typeof p.category === 'string' ? p.category : '', 80), vendor: clip(p.brand?.name || p.brand, 80), tags: [], description: clip(p.description, 500), publishedAt: null, sellthrough: null });
  }
  return out;
}
const meta = (html, name) => { const m = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${name}["'][^>]*>`, 'i').exec(html); if (!m) return ''; const c = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(m[0]); return c ? (c[1] ?? c[2] ?? '') : ''; };
export function openGraphItem(html, pageUrl) {
  const h = String(html || ''), title = clip(meta(h, 'og:title') || (/<title[^>]*>([^<]*)/i.exec(h) || [])[1], 200); if (!title) return null;
  return { url: abs(meta(h, 'og:url') || pageUrl, pageUrl), title, imageUrl: abs(meta(h, 'og:image'), pageUrl), priceCents: toCents(meta(h, 'product:price:amount') || meta(h, 'og:price:amount')), currency: clip(meta(h, 'product:price:currency') || meta(h, 'og:price:currency'), 3) || 'USD',
    category: categorize({ title }), productType: '', vendor: clip(meta(h, 'og:site_name'), 80), tags: [], description: clip(meta(h, 'og:description') || meta(h, 'description'), 500), publishedAt: null, sellthrough: null };
}
// Links on a page that look like a shop's category or "new in" pages (same site only), for when there is no product feed.
export function shopLinks(html, pageUrl, max = 3) {
  let host; try { host = new URL(pageUrl).hostname; } catch { return []; }
  const seen = new Set(), scored = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"#]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const u = abs(m[1], pageUrl); if (!u) continue; let x; try { x = new URL(u); } catch { continue; }
    if (x.hostname !== host || seen.has(x.pathname) || x.pathname === '/' ) continue;
    const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    let s = 0; if (/new|arrival|latest|just in/.test(label + x.pathname)) s += 3; if (/\/(collections?|shop|men|women|category|c)\b/.test(x.pathname)) s += 2; if (/best.?sell|popular/.test(label + x.pathname)) s += 2;
    if (/cart|account|login|search|policy|help|about|contact|gift|careers|store-locator/.test(x.pathname)) s = 0;
    if (s > 0) { seen.add(x.pathname); scored.push([s, u]); }
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, max).map(x => x[1]);
}

// ---- the brand code ----------------------------------------------------------------------------------------------------------------------------
// How Future Basics decides what is ours. Kyle's words: cheap is Shein; we like Zara; affordable, with the cuts and attitude of Gucci, Prada, Ralph Lauren and
// Aimé Leon Dore, but not as rich in materials. Danielle and Kyle edit it on the Lab page; the exemplar pieces they add later sharpen it.
export const DEFAULT_BRAND_CODE = {
  statement: 'Affordable, never cheap. Zara-level prices with the cuts and attitude of Gucci, Prada, Ralph Lauren and Aimé Leon Dore, in simpler materials.',
  priceAnchor: { name: 'Zara', note: 'Where our shelf price should sit. If a piece would cost more than Zara charges for the same thing, the materials or the trims need a second look.' },
  cutReferences: ['Gucci', 'Prada', 'Ralph Lauren', 'Aimé Leon Dore'],
  materials: 'Honest and simple, not rich: good cotton, cotton blends, brushed fleece, plain wool blends and clean synthetics. No cashmere, no leather unless it earns its price.',
  looks: ['Preppy and heritage shapes made modern', 'Quiet logos and small details over loud branding', 'Considered proportions: a relaxed, drawn-out silhouette', 'Neutral and heritage colours with one confident accent'],
  avoid: ['Shein-tier fast fashion: thin fabric, loud trends that last a month, poor finishing', 'Copying a brand\'s logo, print, name or distinctive artwork', 'Materials that make the price jump past the Zara line'],
  exemplars: [],
  notes: '',
  // What a plan is held to: landed cost as a share of the shelf price, and the lowest gross margin that is acceptable.
  economics: { costRatio: 0.28, minMarginPct: 60 }
};
const list = (v, n, len) => (Array.isArray(v) ? v : String(v ?? '').split(/\r?\n/)).map(s => clip(s, len)).filter(Boolean).slice(0, n);
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
export function cleanEconomics(v, base = DEFAULT_BRAND_CODE.economics) {
  const e = v && typeof v === 'object' ? v : {}, b = base || DEFAULT_BRAND_CODE.economics;
  return { costRatio: Math.round(num(e.costRatio, 0.05, 0.9, b.costRatio) * 1000) / 1000, minMarginPct: Math.round(num(e.minMarginPct, 0, 95, b.minMarginPct)) };
}
export function cleanBrandCode(input = {}, base = DEFAULT_BRAND_CODE) {
  const b = input && typeof input === 'object' ? input : {};
  const pa = b.priceAnchor && typeof b.priceAnchor === 'object' ? b.priceAnchor : {};
  const ex = (Array.isArray(b.exemplars) ? b.exemplars : base.exemplars || []).map(e => ({ name: clip(e?.name, 120), why: clip(e?.why, 400), url: /^https?:\/\//i.test(String(e?.url || '')) ? clip(e.url, 500) : '' })).filter(e => e.name).slice(0, 10);
  return {
    statement: clip(b.statement ?? base.statement, 600) || base.statement,
    priceAnchor: { name: clip(pa.name ?? base.priceAnchor.name, 80) || base.priceAnchor.name, note: clip(pa.note ?? base.priceAnchor.note, 400) },
    cutReferences: b.cutReferences === undefined ? base.cutReferences : list(b.cutReferences, 12, 60),
    materials: clip(b.materials ?? base.materials, 600),
    looks: b.looks === undefined ? base.looks : list(b.looks, 12, 200),
    avoid: b.avoid === undefined ? base.avoid : list(b.avoid, 12, 240),
    exemplars: ex, notes: clip(b.notes ?? base.notes, 1200),
    economics: cleanEconomics(b.economics, base.economics)
  };
}
// The brand code as a paragraph the AI is given before it reads or judges anything.
export function brandCodeWords(code) {
  const c = code || DEFAULT_BRAND_CODE;
  return [`Brand: ${c.statement}`, `Price anchor: ${c.priceAnchor.name}. ${c.priceAnchor.note}`, `Cuts we borrow from: ${c.cutReferences.join(', ')}.`, `Materials: ${c.materials}`, `Looks: ${c.looks.join('; ')}.`, `Never: ${c.avoid.join('; ')}.`,
    ...(c.exemplars.length ? [`Pieces we love: ${c.exemplars.map(e => `${e.name}${e.why ? ' (' + e.why + ')' : ''}`).join('; ')}.`] : [])].join('\n');
}

// ---- the watchlist -----------------------------------------------------------------------------------------------------------------------------
export const BRAND_ROLES = [
  { id: 'reference', label: 'Reference', hint: 'A brand whose cuts, taste and sell-through we study' },
  { id: 'price', label: 'Price anchor', hint: 'Where our shelf price has to sit' },
  { id: 'cuts', label: 'Cuts only', hint: 'Luxury houses we borrow proportions from, usually behind bot walls, read through search' }
];
export const SEED_BRANDS = [
  { name: 'Ralph Lauren', site: 'https://www.ralphlauren.com', role: 'reference', note: 'Heritage, preppy, polo, knit and outerwear' },
  { name: 'Aimé Leon Dore', site: 'https://www.aimeleondore.com', role: 'reference', note: 'New York, heritage sportswear, quiet and considered' },
  { name: 'A-COLD-WALL*', site: 'https://www.a-cold-wall.com', role: 'reference', note: 'Industrial, technical shapes, graphic restraint' },
  { name: 'Noah', site: 'https://noahny.com', role: 'reference', note: 'Preppy, skate and sailing, clean graphics' },
  { name: 'Kith', site: 'https://kith.com', role: 'reference', note: 'Streetwear with tailoring, strong seasonal lines' },
  { name: 'Todd Snyder', site: 'https://www.toddsnyder.com', role: 'reference', note: 'Modern American menswear at an easier price' },
  { name: 'Zara', site: 'https://www.zara.com/us', role: 'price', note: 'The price line we hold ourselves to' },
  { name: 'Prada', site: 'https://www.prada.com', role: 'cuts', note: 'Proportion and restraint' },
  { name: 'Gucci', site: 'https://www.gucci.com', role: 'cuts', note: 'Colour, detail and attitude' }
];
export function cleanBrand(input = {}) {
  const b = input && typeof input === 'object' ? input : {}, name = clip(b.name, 80); if (!name) return { error: 'Give the brand a name' };
  let site = '';
  if (String(b.site || '').trim()) { const s = String(b.site).trim(); try { const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : 'https://' + s); if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw new Error('x'); site = u.origin + (u.pathname.replace(/\/$/, '') || ''); } catch { return { error: 'That does not look like a web address' }; } }
  const role = BRAND_ROLES.some(r => r.id === b.role) ? b.role : 'reference';
  return { name, site, role, note: clip(b.note, 240), enabled: b.enabled === undefined ? true : Boolean(b.enabled) };
}
export const ITEM_STATUSES = ['new', 'saved', 'hidden'];

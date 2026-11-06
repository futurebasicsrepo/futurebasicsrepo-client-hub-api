// Bringing the factories we buy from on Alibaba into the hub. Staff export their past orders as a CSV, one row per supplier (the export the
// Claude in Chrome side panel makes from My Alibaba → Orders: company, store link, place, contacts, orders, what was ordered, what was spent).
// The Factories page reads it (preview), staff choose which suppliers are factories we make with, and those are added or filled in (import):
//   - a new one becomes a supplier with its place (pinned on the map), its Alibaba store as its website, what it makes and its skills as
//     guessed from what we ordered, and a note of the orders;
//   - one already in the hub (same name) keeps what was set by hand; empty fields are filled, product types and skills are added to, and the
//     note is added once.
// Nothing here talks to Alibaba. Pure functions: the routes are in src/factories-routes.js.
import { TYPE_KEYS, SKILL_KEYS } from './factories.js';

// RFC 4180: quoted fields may hold commas, quotes ("") and line breaks; a byte-order mark is dropped
export function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, ''), rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const head = (rows.shift() || []).map(h => h.trim());
  return rows.filter(r => r.some(v => String(v).trim())).map(r => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? '').trim()])));
}

// what we bought, read for what the factory makes and what it can do (the hub's own vocabulary, src/factories.js)
const TYPES = [
  ['top', /\b(t-?shirts?|tees?|hoodies?|hoody|sweatshirts?|jerseys?|polos?|shirts?|tops?|tank|crewneck|quarter zip|half zip|sweaters?|knitwear|golf apparel)\b/i],
  ['bottom', /\b(jeans|denim|pants|trousers|shorts|joggers|skirts?|leggings)\b/i],
  ['outerwear', /\b(jackets?|coats?|parkas?|vests?|windbreakers?|puffer)\b/i],
  ['dress', /\b(dress(es)?|jumpsuits?|bodysuits?|swimsuits?)\b/i],
  ['hosiery', /\b(socks?|gloves?)\b/i],
  ['footwear', /\b(shoes?|boots?|sneakers?|footwear|sandals?|slippers?)\b/i],
  ['headwear', /\b(caps?|hats?|beanies?|bucket hat|visors?|5 panel|6 panel|snapback|trucker)\b/i],
  ['bag', /\b(bags?|totes?|backpacks?|pouch(es)?|wallets?|cases?)\b/i],
  ['flat', /\b(blankets?|scarf|scarves|towels?|bandanas?)\b/i],
  ['plush', /\b(plush|stuffed|soft toys?)\b/i],
  ['drink', /\b(mugs?|cups?|tumblers?|bottles?|drinkware|flasks?)\b/i],
  ['jewelry', /\b(jewel(le)?ry|rings?|necklaces?|bracelets?|earrings?|chains?|pendants?|watch(es)?)\b/i],
  ['eyewear', /\b(sunglasses|eyewear|glasses)\b/i],
  ['small', /\b(keychains?|key chains?|patch(es)?|pins?|badges?|stickers?|lanyards?)\b/i],
  ['box', /\b(boxe?s?|packaging|carriers?|match(es|box|books?)?|gift box|display (box|stand|cabinet)|mailers?)\b/i],
  ['tech', /\b(power banks?|chargers?|cables?|headphones?|earphones?|phone cases?)\b/i],
  ['electronics', /\b(players?|walkman|mp3|mp4|speakers?|cassette|led|hologram|display|printer|e ink|nfc)\b/i]
];
const SKILLS = [
  ['cut-sew', /\b(oem|odm|cut and sew|tailor(ed)?|custom (made|design)|manufactur)/i], ['knit', /\bknit(ted|ting)?\b/i], ['woven', /\b(woven|linen|denim|selvedge|canvas)\b/i],
  ['embroidery', /\bembroider(ed|y)\b/i], ['screen-print', /\bscreen ?print/i], ['sublimation', /\bsublimat/i], ['heat-transfer', /\b(heat transfer|reflective logo|labels?)\b/i],
  ['dye-wash', /\b(dyed|garment dye|wash(ed)?)\b/i], ['leather', /\bleather\b/i], ['silicone', /\b(silicone|pvc|rubber)\b/i], ['enamel', /\benamel\b/i],
  ['injection', /\b(injection|vinyl (figure|toy)|action figure|resin)\b/i], ['laser', /\blaser\b/i], ['private-label', /\bprivate label\b/i]
];
// what was spent on one line of the export: "… — 3 Pieces @ USD 165.00; 1 Pieces @ USD 49.00"
const lineValue = t => { let v = 0; for (const m of String(t).matchAll(/([\d.,]+)\s+[A-Za-z]+\s+@\s+[A-Z]{3}\s+([\d.,]+)/g)) { const q = Number(m[1].replace(/,/g, '')), pr = Number(m[2].replace(/,/g, '')); if (q > 0 && pr >= 0) v += q * pr; } return v; };
const money = v => { const n = Number(String(v || '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };
const col = (r, ...names) => { for (const n of names) if (r[n] != null && r[n] !== '') return r[n]; return ''; };
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// the rows of an Alibaba supplier export → one candidate factory per supplier, with a suggested choice and why
export function fromAlibaba(records) {
  const out = [];
  for (const r of records) {
    const name = clip(col(r, 'Supplier (company)', 'Supplier', 'Company'), 160);
    const products = col(r, 'Products ordered (quantity x unit price / unit)', 'Products ordered').split('\n').map(x => clip(x, 300)).filter(Boolean);
    // Alibaba titles are stuffed with keywords, so a guess counts only where the money went: each line weighs what was spent on it, and a type
    // or skill is kept when the lines that name it make up a fifth of the spend (the three and four biggest)
    const lines = products.map(t => ({ t, v: lineValue(t) })), all = lines.reduce((a, l) => a + l.v, 0) || lines.length || 1, w = l => (all === lines.length ? 1 : l.v);
    const share = list => list.map(([k, re]) => [k, lines.filter(l => re.test(l.t)).reduce((a, l) => a + w(l), 0) / all]).filter(([, x]) => x >= .2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    const productTypes = share(TYPES).filter(k => TYPE_KEYS.includes(k)).slice(0, 3);
    const sewn = productTypes.some(k => ['top', 'bottom', 'outerwear', 'dress', 'bag', 'headwear'].includes(k));
    const skills = share(SKILLS).filter(k => SKILL_KEYS.includes(k) && (k !== 'cut-sew' || sewn)).slice(0, 4);
    const orders = Math.max(0, Math.round(Number(col(r, 'Number of orders')) || 0)), spentCents = money(col(r, 'Total spent USD (excl. closed & unpaid orders)', 'Total spent USD')), allCents = money(col(r, 'Total of all orders USD (incl. closed & unpaid)'));
    const valid = Boolean(name) && !/^(undefined|null|n\/a|-)$/i.test(name);
    // suggested: a supplier we have really bought from, more than once or for more than a few hundred dollars; one-off small buys and orders
    // never paid are left for staff to tick if they are factories after all
    const suggest = valid && (orders >= 2 || spentCents >= 30000) && spentCents > 0;
    const why = !valid ? 'No company name on the order' : spentCents <= 0 ? 'No paid orders (closed or unpaid)' : suggest ? (orders >= 2 ? `${orders} orders` : 'A sizeable order') : 'One small order';
    out.push({
      name: valid ? name : '', valid, suggest, why, website: /^https?:\/\//i.test(col(r, 'Store link')) ? clip(col(r, 'Store link'), 200) : '',
      country: clip(col(r, 'Country'), 80), province: clip(col(r, 'Province/State', 'Province'), 80), city: clip(col(r, 'City'), 80), address: clip(col(r, 'Supplier address', 'Address'), 300),
      contacts: clip(col(r, 'Contact person(s) on orders', 'Contact'), 200), orders, firstOrder: clip(col(r, 'First order date'), 10), lastOrder: clip(col(r, 'Last order date'), 10),
      orderNumbers: col(r, 'Order numbers').split(/[;,\s]+/).filter(x => /^\d{6,}$/.test(x)).slice(0, 200), products, spentCents, allCents, currency: clip(col(r, 'Currency') || 'USD', 3), productTypes, skills
    });
  }
  return out.sort((a, b) => b.spentCents - a.spentCents);
}

const usd = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// the note kept on the factory: where it came from, the orders, and what we made with it (the first lines of it, up to the note's length)
export function noteFor(f, on = new Date().toISOString().slice(0, 10)) {
  const head = [`From our Alibaba orders (imported ${on}): ${f.orders} order${f.orders === 1 ? '' : 's'}${f.firstOrder ? `, ${f.firstOrder === f.lastOrder ? f.firstOrder : `${f.firstOrder} to ${f.lastOrder}`}` : ''}, ${usd(f.spentCents)} spent.`,
    f.contacts ? `Contact on the orders: ${f.contacts}.` : '', f.address ? `Address: ${f.address}.` : '', f.orderNumbers.length ? `Order numbers: ${f.orderNumbers.join(', ')}.` : ''].filter(Boolean).join('\n');
  let body = '', n = 0;
  for (const p of f.products) { const line = `\n- ${p}`; if ((head + '\nWhat we ordered:' + body + line).length > 1900) break; body += line; n++; }
  const more = f.products.length - n;
  return clip2(head + (n ? '\nWhat we ordered:' + body : '') + (more > 0 ? `\n…and ${more} more` : ''), 2000);
}
const clip2 = (v, n) => String(v).slice(0, n);
export const IMPORT_MARK = 'From our Alibaba orders';

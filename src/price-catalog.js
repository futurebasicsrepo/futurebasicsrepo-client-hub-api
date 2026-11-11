// The price catalogue: suppliers' price lists, read once into src/price-catalog/*.json (scripts/price-catalog/build.mjs), that staff choose a
// starting cost from when they price a product. Nothing here changes a product: a catalogue item only fills in the tier form, and the tier
// that is saved is the product's own, changed like any other. Plain functions; the routes are in src/product-sheet-routes.js.
import { readdirSync, readFileSync } from 'node:fs';

const DIR = new URL('./price-catalog/', import.meta.url);
let loaded = null;

// every catalogue file, each item given an id ("openwav-fall-2026:17") and the words it is found by
export function loadCatalogs(dir = DIR) {
  if (loaded && dir === DIR) return loaded;
  const out = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const c = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    out.push({ key: c.key, title: c.title, notes: c.notes || '', currency: c.currency || 'USD', minimum: c.minimum || 1, sections: c.sections || [],
      items: (c.items || []).map((i, n) => ({ id: `${c.key}:${n}`, name: i.name, brand: i.brand || '', category: i.category, section: i.section, costCents: i.costCents ?? null, price: i.price, catalog: c.key, words: wordsOf(`${i.name} ${i.brand || ''} ${i.section}`), head: itemHead(i.name) })) });
  }
  if (dir === DIR) loaded = out;
  return out;
}

// ---- words: how a product's name and a catalogue item's name are compared ----
const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'with', 'for', 'in', 'on', 'to', 'by', 'our', 'pack', 'set', 'unisex', 'mens', 'womens', 'men', 'women', 'adult', 'custom', 'personalized', 'x']);
// words that mean the same thing when pricing: a tee is a t-shirt, a cap is a hat
const SAME = [['tee', 'tshirt', 'shirt'], ['cap', 'hat', 'snapback', 'trucker'], ['hoodie', 'hooded', 'hoody'], ['crewneck', 'crew', 'sweatshirt'], ['bottle', 'tumbler', 'flask'], ['mug', 'cup'], ['tote', 'bag'], ['sticker', 'decal'],
  ['notebook', 'journal'], ['pants', 'jogger', 'sweatpants', 'trouser'], ['shorts', 'short'], ['poster', 'print'], ['beanie', 'toque'], ['jacket', 'coat', 'windbreaker', 'anorak'], ['sock', 'socks'], ['blanket', 'throw'], ['puzzle', 'jigsaw'], ['mousepad', 'deskmat']];
const GROUP = new Map(SAME.flatMap((g, n) => g.map(w => [w, n])));
export function wordsOf(text) {
  return [...new Set(String(text || '').toLowerCase().replace(/t[- ]?shirts?/g, 'tshirt').replace(/long[- ]sleeve/g, 'longsleeve').replace(/mouse ?pad|desk mat/g, m => (m.startsWith('m') ? 'mousepad' : 'deskmat')).replace(/['’]s\b/g, 's')
    .split(/[^a-z0-9]+/).filter(w => w.length > 1 && !STOP.has(w)).map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)))];
}
// The thing itself, as English names it: the last word. "Water Bottle" is a bottle; "Steel Pen" is a pen, not steel. A product's colour or
// nickname after a dash or in quotes is set aside ("Cap — Tan", Long Sleeve "Yosemite"); an item's size in brackets and its style code too.
const lastWord = text => wordsOf(text).filter(w => !/^v?\d+$/.test(w)).pop() || '';
export const productHead = title => lastWord(String(title || '').replace(/["“”][^"“”]*["“”]/g, ' ').split(/\s[—–-]\s/)[0].split(':').pop());
export const itemHead = name => { const parts = String(name || '').replace(/\([^)]*\)/g, ' ').split(/\s-\s/).filter(p => /[a-z]{3}/i.test(p)); return lastWord(parts.filter(p => !/^\s*\S*\d\S*\s*$/.test(p)).pop() || parts.pop() || ''); };
const sameAs = (a, b) => a === b || (GROUP.has(a) && GROUP.get(a) === GROUP.get(b));
// every word wanted is among an item's words: the word itself, a word that stands for its like, or the start of one ("tum" finds tumblers)
export const wordsMatch = (words, want) => want.every(w => words.some(x => sameAs(x, w) || (w.length > 2 && x.startsWith(w))));
const view = (i, catalogs) => ({ id: i.id, name: i.name, brand: i.brand, category: i.category, section: i.section, costCents: i.costCents, price: i.price, catalog: i.catalog, catalogTitle: catalogs.find(c => c.key === i.catalog)?.title || '' });
const byPrice = (a, b) => (a.costCents == null) - (b.costCents == null) || (a.price === 'projected') - (b.price === 'projected') || (a.costCents || 0) - (b.costCents || 0) || a.name.localeCompare(b.name);

// Search: every word typed must be in the item (its name, brand or section), a word standing for its like ("tee" finds T-Shirts). Items
// with a price come first (this is a list to price from), then the ones that say the very word, then the cheapest.
export function searchCatalog({ q = '', category = '', limit = 30 } = {}, catalogs = loadCatalogs()) {
  const want = wordsOf(q), all = catalogs.flatMap(c => c.items).filter(i => !category || i.category === category);
  const hits = want.length ? all.filter(i => wordsMatch(i.words, want)) : all;
  const sorted = want.length ? [...hits].sort((a, b) => (a.costCents == null) - (b.costCents == null) || want.filter(w => b.words.includes(w)).length - want.filter(w => a.words.includes(w)).length || byPrice(a, b)) : [...hits].sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
  return { total: hits.length, items: sorted.slice(0, Math.max(1, Math.min(200, Number(limit) || 30))).map(i => view(i, catalogs)) };
}

// What kind of thing a product is, in the catalogue's own sections: a product's kind (src/product-sheet.js kindOf) points at where to look.
const KIND = { tee: ['T-Shirts'], 'long-sleeve': ['T-Shirts', 'Shirts'], hoodie: ['Hoodies'], crewneck: ['Sweatshirts'], jacket: ['Outerwear'], cap: ['Hats', 'Headwear'], beanie: ['Hats', 'Headwear'], bag: ['Bags'], bottle: ['General'],
  pants: ['Bottoms', 'Joggers'], jersey: ['Activewear', 'Fan Merch'], sock: ['Socks'], notebook: ['Home & Office'], print: ['Wall Art'], shoe: ['Footwear'], sticker: ['General'] };

// Suggestions for one product: the items whose names share the most with the product's (its words, its kind), priced ones first. A product
// nothing in the catalogue resembles gets none, so a weak guess is never offered as a starting price.
// A product whose design was started from a catalogue item in the Design Lab (its concept remembers the item: product.catalogId) gets that very
// item first, marked startedFrom, whatever its title has become; the alike follow.
export function suggestFor(product = {}, n = 5, catalogs = loadCatalogs()) {
  const alike = alikeFor(product, n, catalogs), exact = product.catalogId ? catalogs.flatMap(c => c.items).find(i => i.id === product.catalogId) : null;
  return exact ? [{ ...view(exact, catalogs), startedFrom: true }, ...alike.filter(x => x.id !== exact.id)].slice(0, Math.max(1, n)) : alike;
}
function alikeFor(product = {}, n = 5, catalogs = loadCatalogs()) {
  const want = wordsOf(`${product.title || ''} ${product.kind || ''}`), kindWords = wordsOf(product.kind || ''), sections = KIND[product.kind] || [], head = productHead(product.title) || kindWords[0] || '';
  if (!want.length) return [];
  const scored = [];
  for (const i of catalogs.flatMap(c => c.items)) {
    let score = 0, exact = 0;
    for (const w of want) { if (i.words.includes(w)) { score += 3; exact++; } else if (i.words.some(x => sameAs(x, w))) score += 2; }
    if (!score) continue;
    if (head) score += sameAs(i.head, head) ? 3 : i.words.some(x => sameAs(x, head)) ? 1 : 0;      // the same thing counts most
    if (kindWords.some(w => i.words.some(x => sameAs(x, w)))) score += 1;
    if (sections.includes(i.section)) score += 2;
    if (i.costCents == null) score -= 3;
    scored.push({ i, score, exact });
  }
  const best = scored.sort((a, b) => b.score - a.score || b.exact - a.exact || byPrice(a.i, b.i)), top = best[0]?.score || 0;
  if (top < 5) return [];                                   // one loose word in common ("steel", "pencil") is not a likeness
  return best.filter(x => x.score >= Math.max(5, top - 3)).slice(0, n).map(x => view(x.i, catalogs));
}

export const catalogSummary = (catalogs = loadCatalogs()) => catalogs.map(c => ({ key: c.key, title: c.title, notes: c.notes, minimum: c.minimum, count: c.items.length, priced: c.items.filter(i => i.costCents != null).length,
  categories: [...new Set(c.sections.map(s => s.category))].map(name => ({ name, count: c.sections.filter(s => s.category === name).reduce((a, s) => a + s.count, 0) })) }));

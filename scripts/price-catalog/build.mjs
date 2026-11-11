// Reads a supplier's catalogue into the price catalogue the work console suggests starting prices from (src/price-catalog.js).
//
//   pdftotext -raw "Enterprise Catalogue Fall 2026.pdf" catalogue.txt
//   node scripts/price-catalog/build.mjs catalogue.txt openwav-fall-2026 "OpenWav Enterprise Catalogue, Fall 2026"
//
// Writes src/price-catalog/<key>.json. The catalogue's own index states how many products each section holds; the import stops with an
// error when what it read does not add up to those counts, so a page that came out of the PDF wrong cannot slip in as a short list.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [, , file, key, title] = process.argv;
if (!file || !key || !title) { console.error('usage: node scripts/price-catalog/build.mjs <pdftotext -raw output> <key> "<title>"'); process.exit(2); }
const text = readFileSync(file, 'utf8'), start = text.search(/All [\d,]+ products, by category\./);
if (start < 0) { console.error('The full index was not found ("All N products, by category.")'); process.exit(1); }
const stated = Number(text.slice(start).match(/All ([\d,]+) products/)[1].replace(/,/g, ''));
const lines = text.slice(start).split('\n').map(l => l.replace(/\f/g, '').trim()).filter(Boolean);

// the brands and makers the catalogue names, longest first, so "Independent Trading Co." wins over "Independent"
const BRANDS = ['Independent Trading Co.', 'Augusta Sportswear', 'American Apparel', 'Comfort Colors', 'Stanley/Stella', 'Bella + Canvas', 'BELLA + CANVAS', 'Port Authority', 'Rabbit Skins', 'YP Classics', 'Arctic Zone',
  'Custom Knits', 'LA Apparel', 'Shaka Wear', 'Next Level', 'AS Colour', 'Threadfast', 'econscious', 'Richardson', 'Sport-Tek', 'Colortone', 'Carhartt', 'Champion', 'Columbia', 'CamelBak', 'Burnside', 'Dri Duck', 'Paragon',
  'Nautica', 'Dickies', 'Gildan', 'Tultex', 'Badger', 'Adidas', 'mophie', 'Hanes', 'Welly', 'OTTO', 'OGIO', 'Nike', 'Thor', 'Cuts'];
const brandOf = name => { const b = BRANDS.find(x => name.toLowerCase().startsWith(x.toLowerCase()) || new RegExp(`(^|[\\s-])${x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([\\s-]|$)`, 'i').test(name)); return b ? (b === 'BELLA + CANVAS' ? 'Bella + Canvas' : b) : ''; };
// a section's heading is printed in spaced capitals ("K I D S & B A B Y"), which loses the spaces between its words: the known ones are put back
const SECTION = { 'Kids&Baby': 'Kids & Baby', Buckethats: 'Bucket Hats', Fanmerch: 'Fan Merch', Phonecases: 'Phone Cases', Techaccessories: 'Tech Accessories', Petaccessories: 'Pet Accessories', Physicalmedia: 'Physical Media',
  'Home&Office': 'Home & Office', 'Garden&Outdoor': 'Garden & Outdoor', 'Sports&Games': 'Sports & Games', Wallart: 'Wall Art', Campshirts: 'Camp Shirts' };
const titleCase = s => s.toLowerCase().replace(/(^|[\s&/-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/\bAnd\b/g, 'and');

const items = [], sections = []; let category = '', sub = null, carry = '';
// one entry ends at its price ("from $12.34", with * when projected), "Available soon" or "By quote"; a short row can hold several entries
const END = /\s*(?:from \$([\d,]+\.\d{2})\s*(\*)?|(Available soon)|(By quote))(?=\s|$)/g;
for (const raw of lines) {
  if (/^Prices are wholesale/.test(raw)) break;
  const cat = raw.match(/^(.+?) ([\d,]+) PRODUCTS$/);
  if (cat && !carry) { category = cat[1].replace(/\s*&\s*/g, ' & ').trim(); continue; }
  const head = raw.match(/^((?:[A-Z0-9&'’,.\/-] ?)+?) {1,2}(\d+)$/);           // "A C T I V E W E A R 35": spaced capitals, then how many
  if (head && !carry && /^(?:\S ){2,}\S?/.test(head[1] + ' ')) { sub = { category, name: (n => SECTION[n] || n)(titleCase(head[1].replace(/ (?=\S( |$))/g, '').replace(/\s+/g, ' ').trim())), stated: Number(head[2]), read: 0 }; sections.push(sub); continue; }
  if (!sub) continue;
  const line = (carry ? carry + ' ' : '') + raw; let at = 0, m; END.lastIndex = 0;
  while ((m = END.exec(line))) {
    const name = line.slice(at, m.index).replace(/\s+/g, ' ').trim(); at = END.lastIndex; if (!name) continue;
    items.push({ name, category: sub.category, section: sub.name, brand: brandOf(name), costCents: m[1] ? Math.round(Number(m[1].replace(/,/g, '')) * 100) : null, price: m[1] ? (m[2] ? 'projected' : 'live') : m[3] ? 'soon' : 'quote' });
    sub.read++;
  }
  carry = line.slice(at).trim();                                               // a long name runs on to the next line
}
const off = sections.filter(s => s.read !== s.stated);
console.log(`${items.length} items in ${sections.length} sections of ${new Set(sections.map(s => s.category)).size} categories (the catalogue says ${stated})`);
if (off.length || items.length !== stated || carry) {
  for (const s of off) console.error(`  ${s.category} / ${s.name}: read ${s.read}, the catalogue says ${s.stated}`);
  if (carry) console.error(`  left over at the end: ${carry.slice(0, 120)}`);
  console.error('The import does not add up to the catalogue\'s own counts. Nothing was written.'); process.exit(1);
}
mkdirSync(new URL('../../src/price-catalog/', import.meta.url), { recursive: true });
const out = new URL(`../../src/price-catalog/${key}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ key, title, currency: 'USD', minimum: 1, notes: 'Wholesale to us, in USD, before decoration options and shipping. "live" is the platform price, "projected" is the projected wholesale confirmed on order, "soon" has no price yet, "quote" is priced per order.',
  sections: sections.map(s => ({ category: s.category, name: s.name, count: s.read })), items }) + '\n');
const priced = items.filter(i => i.costCents != null);
console.log(`wrote ${out.pathname}: ${priced.length} priced (${items.filter(i => i.price === 'live').length} live, ${items.filter(i => i.price === 'projected').length} projected), ${items.filter(i => i.price === 'soon').length} with no price yet, ${items.filter(i => i.price === 'quote').length} by quote; ${items.filter(i => i.brand).length} with a brand`);

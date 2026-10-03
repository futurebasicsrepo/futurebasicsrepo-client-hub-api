#!/usr/bin/env node
/**
 * Ps & Qs catalog audit — makes the catalog ready for every channel the theme and Shopify
 * syndicate to (Google Shopping / free listings, Meta, TikTok, Pinterest, the Shop app, and
 * AI shopping agents via Shopify Catalog). A theme can only surface data that exists; this
 * finds what's missing, product by product.
 *
 *   SHOPIFY_STORE_DOMAIN=psandqs.myshopify.com SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_... \
 *     node scripts/psandqs-catalog-audit.mjs [--setup] [--apply] [--out report.csv]
 *
 *   (no flags)  Read-only. Prints a scorecard and writes a CSV of every product's issues.
 *   --setup     Creates the product metafield definitions the theme reads:
 *               custom.fit_notes, custom.material, custom.story, custom.gender
 *   --apply     Safe, reversible fixes only:
 *               - normalises the house brand's vendor spelling to HOUSE_VENDOR ("Ps & Qs")
 *               - fills empty image alt text with "<title> — <vendor>" (+ view number)
 *
 * Zero dependencies; Node 20+. Same env vars as src/shopify.js and setup-offer-metafields.mjs.
 */
import fs from 'node:fs';

const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const version = process.env.SHOPIFY_API_VERSION || '2026-07';
const HOUSE_VENDOR = process.env.HOUSE_VENDOR || 'Ps & Qs';
// Every spelling of the house brand seen on the live store and in search results.
const HOUSE_ALIASES = [/^p'?s\s*(&|and)\s*q'?s$/i, /^ps\s*&\s*qs$/i, /^p's & q's brand$/i, /^psqs$/i, /^premium quality$/i];

const args = new Set(process.argv.slice(2));
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > -1 ? process.argv[outIdx + 1] : 'psandqs-catalog-audit.csv';

if (!domain || !token) {
  console.error('Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN and re-run.');
  process.exit(1);
}

async function gql(query, variables = {}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables })
    });
    const body = await res.json();
    const throttled = body.errors?.some(e => e.extensions?.code === 'THROTTLED');
    if (throttled || res.status === 429) { await new Promise(r => setTimeout(r, 1000 * 2 ** attempt)); continue; }
    if (!res.ok || body.errors?.length) throw new Error(body.errors?.map(e => e.message).join('; ') || `HTTP ${res.status}`);
    return body.data;
  }
  throw new Error('Throttled too many times');
}

/* ---------- --setup: metafield definitions the theme reads ---------- */
const DEFINITIONS = [
  { key: 'fit_notes', name: 'Fit notes', type: 'single_line_text_field', description: 'How it fits, e.g. "Boxy and cropped. Size down for a closer fit." Shown under the size picker and fed to AI assistants.' },
  { key: 'material', name: 'Material & care', type: 'single_line_text_field', description: 'e.g. "430gsm cotton fleece, made in Philadelphia". Used in product structured data.' },
  { key: 'story', name: 'The story', type: 'rich_text_field', description: 'The why behind a collab or house piece. Shown as its own accordion.' },
  { key: 'gender', name: 'Gender (for feeds)', type: 'single_line_text_field', description: 'male, female or unisex. Used in structured data and shopping feeds.', validations: [{ name: 'choices', value: JSON.stringify(['male', 'female', 'unisex']) }] }
];
async function setup() {
  const m = `mutation($d: MetafieldDefinitionInput!) { metafieldDefinitionCreate(definition: $d) { createdDefinition { id } userErrors { message } } }`;
  for (const d of DEFINITIONS) {
    const r = await gql(m, { d: { ...d, namespace: 'custom', ownerType: 'PRODUCT', access: { storefront: 'PUBLIC_READ' } } });
    const { createdDefinition, userErrors } = r.metafieldDefinitionCreate;
    console.log(createdDefinition ? `✓ custom.${d.key} created` : `- custom.${d.key}: ${userErrors.map(e => e.message).join('; ')} (fine if it already exists)`);
  }
}

/* ---------- Audit ---------- */
const PRODUCTS = `query($after: String) {
  products(first: 50, after: $after, query: "status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id title handle vendor productType tags descriptionHtml onlineStoreUrl
      seo { title description }
      category { fullName }
      options { name }
      fit: metafield(namespace: "custom", key: "fit_notes") { value }
      material: metafield(namespace: "custom", key: "material") { value }
      media(first: 20) { nodes { ... on MediaImage { id alt } } }
      variants(first: 100) { nodes { sku barcode } }
    }
  }
}`;

function audit(p) {
  const issues = [];
  const words = (p.descriptionHtml || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const images = p.media.nodes.filter(n => n.id);
  const isHouse = HOUSE_ALIASES.some(r => r.test(p.vendor.trim()));
  if (!p.vendor) issues.push(['vendor', 'Missing vendor (brand) — the Brand filter and feeds depend on it']);
  if (isHouse && p.vendor !== HOUSE_VENDOR) issues.push(['vendor', `House brand spelled "${p.vendor}" — use "${HOUSE_VENDOR}" everywhere`]);
  if (!p.productType) issues.push(['type', 'Missing product type (Hoodies, Pants, Headwear…) — powers the Type filter and menus']);
  if (!p.category) issues.push(['category', 'No Shopify product category — Google/Meta/TikTok map taxonomy from this']);
  if (words < 40) issues.push(['description', `Thin description (${words} words) — aim for 60–150: fit, fabric, weight, where it's made`]);
  if (!p.seo?.description) issues.push(['seo', 'No SEO description (theme generates one, but a written one converts better)']);
  if (images.length === 0) issues.push(['images', 'No images']);
  else if (images.length < 3) issues.push(['images', `Only ${images.length} image(s) — feeds and the PDP want front, back, detail, on-body`]);
  const noAlt = images.filter(i => !i.alt).length;
  if (noAlt) issues.push(['alt', `${noAlt} image(s) without alt text`]);
  const sized = p.options.some(o => /size/i.test(o.name));
  const apparel = /tee|shirt|hoodie|crew|sweat|pant|short|jacket|jean|fleece|sneaker|shoe|knit|vest/i.test(`${p.productType} ${p.title}`);
  if (apparel && !sized) issues.push(['size', 'Apparel without a "Size" option — the size filter, fit profile and one-tap add need it']);
  if (apparel && !p.fit?.value) issues.push(['fit', 'No fit notes (custom.fit_notes)']);
  const noSku = p.variants.nodes.filter(v => !v.sku).length;
  if (noSku) issues.push(['sku', `${noSku} variant(s) without SKU`]);
  const noGtin = p.variants.nodes.filter(v => !v.barcode).length;
  if (noGtin && !isHouse) issues.push(['gtin', `${noGtin} variant(s) without barcode/GTIN — branded goods need it for Google Shopping`]);
  if (!p.onlineStoreUrl) issues.push(['channel', 'Not published to the Online Store']);
  return { issues, isHouse, images };
}

async function applyFixes(p, { isHouse, images }) {
  if (isHouse && p.vendor !== HOUSE_VENDOR) {
    const r = await gql(`mutation($p: ProductUpdateInput!) { productUpdate(product: $p) { userErrors { message } } }`, { p: { id: p.id, vendor: HOUSE_VENDOR } });
    const e = r.productUpdate.userErrors; console.log(e.length ? `  ✗ vendor ${p.handle}: ${e[0].message}` : `  ✓ vendor → ${HOUSE_VENDOR}: ${p.handle}`);
  }
  const missing = images.filter(i => !i.alt);
  if (missing.length) {
    const brand = isHouse ? HOUSE_VENDOR : p.vendor;
    const files = missing.map(i => ({ id: i.id, alt: `${p.title} — ${brand}${images.length > 1 ? `, view ${images.indexOf(i) + 1}` : ''}`.slice(0, 500) }));
    const r = await gql(`mutation($f: [FileUpdateInput!]!) { fileUpdate(files: $f) { userErrors { message } } }`, { f: files });
    const e = r.fileUpdate.userErrors; console.log(e.length ? `  ✗ alt ${p.handle}: ${e[0].message}` : `  ✓ alt text on ${files.length} image(s): ${p.handle}`);
  }
}

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

async function main() {
  if (args.has('--setup')) await setup();
  const rows = [['handle', 'title', 'vendor', 'type', 'issue_count', 'issues'].map(csv).join(',')];
  const tally = {}; let after = null, total = 0, clean = 0;
  do {
    const data = await gql(PRODUCTS, { after });
    for (const p of data.products.nodes) {
      total++;
      const result = audit(p);
      if (!result.issues.length) clean++;
      for (const [k] of result.issues) tally[k] = (tally[k] || 0) + 1;
      rows.push([p.handle, p.title, p.vendor, p.productType, result.issues.length, result.issues.map(i => i[1]).join(' | ')].map(csv).join(','));
      if (args.has('--apply')) await applyFixes(p, result);
    }
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after);

  fs.writeFileSync(OUT, rows.join('\n') + '\n');
  console.log(`\nPs & Qs catalog: ${total} active products, ${clean} channel-ready (${total ? Math.round(clean / total * 100) : 0}%)`);
  for (const [k, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log(`\nPer-product report: ${OUT}${args.has('--apply') ? '' : '\nRe-run with --apply to normalise the house vendor and fill missing alt text.'}`);
}

main().catch(err => { console.error(err.message); process.exit(1); });

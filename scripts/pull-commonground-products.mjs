#!/usr/bin/env node
/**
 * Pull products (with photos) off the live commonground12.com storefront and
 * either write a Shopify-importable CSV or create them directly in another
 * store through the Admin GraphQL API.
 *
 *   node scripts/pull-commonground-products.mjs                 # 30 products -> ./commonground-export
 *   node scripts/pull-commonground-products.mjs --limit 50 --out ./export
 *   SHOPIFY_STORE=fkgwpw-8u SHOPIFY_ADMIN_TOKEN=shpat_... \
 *     node scripts/pull-commonground-products.mjs --push        # also create them in that store
 *
 * Output:
 *   <out>/products.json   raw products.json feed (what the storefront serves)
 *   <out>/photos/         every product image, <handle>-<n>.<ext>
 *   <out>/products.csv    Shopify CSV (Products -> Import). Image Src points at the
 *                         original CDN URLs so Shopify fetches them itself.
 *
 * Zero dependencies; needs Node 20+ (global fetch).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API_VERSION = '2025-07';

export function parseArgs(argv) {
  const args = { store: 'https://commonground12.com', limit: 30, out: './commonground-export', push: false, status: 'DRAFT' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--store') args.store = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--push') args.push = true;
    else if (a === '--active') args.status = 'ACTIVE';
  }
  args.store = args.store.replace(/\/+$/, '');
  if (!/^https?:\/\//.test(args.store)) args.store = 'https://' + args.store;
  return args;
}

/** Fetch products.json pages until we have `limit` products that carry at least one image. */
export async function fetchProducts(store, limit, fetchImpl = fetch) {
  const picked = [];
  for (let page = 1; picked.length < limit && page <= 20; page++) {
    const res = await fetchImpl(`${store}/products.json?limit=250&page=${page}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`GET products.json page ${page}: HTTP ${res.status}`);
    const { products = [] } = await res.json();
    if (products.length === 0) break;
    for (const p of products) {
      if (!p.images || p.images.length === 0) continue;
      picked.push(p);
      if (picked.length >= limit) break;
    }
  }
  return picked;
}

export function imageExt(src) {
  const m = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(src);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

export function cleanImageUrl(src) {
  return src.split('?')[0];
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const CSV_HEADER = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value', 'Option3 Name', 'Option3 Value',
  'Variant SKU', 'Variant Grams', 'Variant Inventory Tracker', 'Variant Inventory Qty', 'Variant Inventory Policy',
  'Variant Fulfillment Service', 'Variant Price', 'Variant Compare At Price', 'Variant Requires Shipping', 'Variant Taxable',
  'Image Src', 'Image Position', 'Image Alt Text', 'Status',
];

/** Build a Shopify products CSV from products.json entries. */
export function toShopifyCsv(products, { status = 'draft' } = {}) {
  const rows = [CSV_HEADER];
  for (const p of products) {
    const opts = p.options || [];
    const images = p.images || [];
    const variants = p.variants && p.variants.length ? p.variants : [{ price: '0.00', available: false }];
    const rowCount = Math.max(variants.length, images.length);
    for (let i = 0; i < rowCount; i++) {
      const v = variants[i];
      const img = images[i];
      const first = i === 0;
      const row = new Array(CSV_HEADER.length).fill('');
      row[0] = p.handle;
      if (first) {
        row[1] = p.title;
        row[2] = p.body_html || '';
        row[3] = p.vendor || '';
        row[4] = p.product_type || '';
        row[5] = (p.tags || []).join(', ');
        row[6] = 'TRUE';
      }
      if (v) {
        for (let o = 0; o < 3; o++) {
          const opt = opts[o];
          if (!opt) continue;
          if (first) row[7 + o * 2] = opt.name;
          row[8 + o * 2] = v[`option${o + 1}`] ?? '';
        }
        row[13] = v.sku || '';
        row[14] = v.grams ?? 0;
        row[15] = 'shopify';
        row[16] = v.available ? 1 : 0;
        row[17] = 'deny';
        row[18] = 'manual';
        row[19] = v.price;
        row[20] = v.compare_at_price || '';
        row[21] = v.requires_shipping === false ? 'FALSE' : 'TRUE';
        row[22] = v.taxable === false ? 'FALSE' : 'TRUE';
      }
      if (img) {
        row[23] = cleanImageUrl(img.src);
        row[24] = img.position || i + 1;
        row[25] = img.alt || p.title;
      }
      if (first) row[26] = status;
      rows.push(row);
    }
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

/** Map a products.json entry to a productSet input for the Admin GraphQL API. */
export function toProductSetInput(p, { status = 'DRAFT', locationId } = {}) {
  const opts = (p.options || []).filter((o) => o && o.name);
  const input = {
    title: p.title,
    handle: p.handle,
    descriptionHtml: p.body_html || '',
    vendor: p.vendor || undefined,
    productType: p.product_type || undefined,
    tags: p.tags || [],
    status,
    files: (p.images || []).map((img) => ({ originalSource: cleanImageUrl(img.src), alt: img.alt || p.title, contentType: 'IMAGE' })),
  };
  const isDefault = opts.length === 1 && opts[0].name === 'Title' && opts[0].values?.length === 1;
  if (opts.length && !isDefault) {
    input.productOptions = opts.map((o) => ({ name: o.name, values: (o.values || []).map((name) => ({ name })) }));
  }
  input.variants = (p.variants || []).map((v) => {
    const variant = {
      price: v.price,
      compareAtPrice: v.compare_at_price || undefined,
      sku: v.sku || undefined,
      taxable: v.taxable !== false,
      inventoryPolicy: 'DENY',
    };
    if (input.productOptions) {
      variant.optionValues = opts.map((o, i) => ({ optionName: o.name, name: v[`option${i + 1}`] }));
    }
    if (locationId) {
      variant.inventoryItem = { tracked: true };
      variant.inventoryQuantities = [{ locationId, name: 'available', quantity: v.available ? 1 : 0 }];
    }
    return variant;
  });
  if (input.variants.length === 0) input.variants = [{ price: '0.00', inventoryPolicy: 'DENY' }];
  return input;
}

async function adminGraphql(store, token, query, variables) {
  const shop = store.includes('.') ? store : `${store}.myshopify.com`;
  const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-shopify-access-token': token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function pushProducts(products, { store, token, status }) {
  const loc = await adminGraphql(store, token, `{ locations(first: 1, query: "active:true") { nodes { id name } } }`);
  const locationId = loc.locations.nodes[0]?.id;
  const results = [];
  for (const p of products) {
    const input = toProductSetInput(p, { status, locationId });
    const data = await adminGraphql(store, token, `mutation ($input: ProductSetInput!) {
      productSet(input: $input, synchronous: true) { product { id handle } userErrors { field message } } }`, { input });
    const { product, userErrors } = data.productSet;
    if (userErrors.length) console.error(`  ! ${p.handle}: ${userErrors.map((e) => e.message).join('; ')}`);
    else console.log(`  + ${p.handle} -> ${product.id}`);
    results.push({ handle: p.handle, id: product?.id || null, errors: userErrors });
  }
  return results;
}

async function downloadPhotos(products, dir) {
  await mkdir(dir, { recursive: true });
  let n = 0;
  for (const p of products) {
    let i = 0;
    for (const img of p.images || []) {
      i++;
      const url = cleanImageUrl(img.src);
      const file = join(dir, `${p.handle}-${i}.${imageExt(url)}`);
      const res = await fetch(url);
      if (!res.ok) { console.error(`  ! ${url}: HTTP ${res.status}`); continue; }
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      n++;
    }
  }
  return n;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Pulling up to ${args.limit} products from ${args.store} ...`);
  const products = await fetchProducts(args.store, args.limit);
  console.log(`  ${products.length} products, ${products.reduce((n, p) => n + p.images.length, 0)} images`);

  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'products.json'), JSON.stringify({ products }, null, 2));
  await writeFile(join(args.out, 'products.csv'), toShopifyCsv(products, { status: args.status.toLowerCase() }));
  console.log(`  wrote ${join(args.out, 'products.csv')} and products.json`);

  const saved = await downloadPhotos(products, join(args.out, 'photos'));
  console.log(`  saved ${saved} photos to ${join(args.out, 'photos')}`);

  if (args.push) {
    const store = process.env.SHOPIFY_STORE;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;
    if (!store || !token) throw new Error('--push needs SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN');
    console.log(`Creating ${products.length} products in ${store} as ${args.status} ...`);
    const results = await pushProducts(products, { store, token, status: args.status });
    const ok = results.filter((r) => r.id).length;
    console.log(`  ${ok}/${results.length} created`);
    if (ok !== results.length) process.exitCode = 1;
  } else {
    console.log('Next: Shopify admin -> Products -> Import -> products.csv (or re-run with --push).');
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => { console.error(err.message || err); process.exit(1); });
}

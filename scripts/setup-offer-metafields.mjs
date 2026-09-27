#!/usr/bin/env node
/**
 * One-off setup for the "Make an offer" feature: creates the two product metafield
 * definitions the theme and hub API read (custom.accepts_offers, custom.offer_min_percent),
 * so merchants get a normal Metafields editor on every product page in Shopify admin —
 * no per-product app install, just flip the checkbox and (optionally) set a floor %.
 *
 * Run once per store:
 *   SHOPIFY_STORE_DOMAIN=fkgwpw-8u.myshopify.com SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_... \
 *     node scripts/setup-offer-metafields.mjs
 *
 * Safe to re-run: metafieldDefinitionCreate fails harmlessly if the definition already exists.
 * Zero dependencies; needs Node 20+ (global fetch). Uses the same env vars as src/shopify.js.
 */
const domain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const version = process.env.SHOPIFY_API_VERSION || '2026-07';

if (!domain || !token) {
  console.error('Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN (same values the hub API uses on Railway) and re-run.');
  process.exit(1);
}

const MUTATION = `mutation CreateOfferMetafieldDefinition($definition: MetafieldDefinitionInput!) {
  metafieldDefinitionCreate(definition: $definition) {
    createdDefinition { id name namespace key }
    userErrors { field message code }
  }
}`;

const DEFINITIONS = [
  {
    namespace: 'custom', key: 'accepts_offers', name: 'Accepts offers', type: 'boolean',
    description: 'Show the "Make an offer" button on this product’s page.',
    access: { admin: 'MERCHANT_READ_WRITE', storefront: 'PUBLIC_READ' }
  },
  {
    namespace: 'custom', key: 'offer_min_percent', name: 'Minimum offer (% of price)', type: 'number_integer',
    description: 'Lowest offer accepted, as a percent of list price. Leave blank to use the default (50%).',
    validations: [{ name: 'min', value: '1' }, { name: 'max', value: '99' }],
    access: { admin: 'MERCHANT_READ_WRITE', storefront: 'PUBLIC_READ' }
  }
];

async function main() {
  for (const definition of DEFINITIONS) {
    const response = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query: MUTATION, variables: { definition: { ...definition, ownerType: 'PRODUCT' } } })
    });
    const payload = await response.json();
    if (!response.ok || payload.errors?.length) {
      console.error(`✗ ${definition.key}:`, payload.errors?.map(e => e.message).join('; ') || response.status);
      continue;
    }
    const { createdDefinition, userErrors } = payload.data.metafieldDefinitionCreate;
    if (createdDefinition) console.log(`✓ ${definition.namespace}.${definition.key} created (${createdDefinition.id})`);
    else console.log(`- ${definition.key}: ${userErrors.map(e => e.message).join('; ')} (fine if it already exists)`);
  }
  console.log('\nDone. In Shopify admin, open a product → Metafields to set "Accepts offers" per product.');
}

await main();

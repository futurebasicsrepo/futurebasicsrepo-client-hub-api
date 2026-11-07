// A look at a site in a client's room, for its card: its share picture (og:image) and what it runs on. One page fetch through the
// same safe fetch the prototyper uses (public addresses only, size and time capped), then the picture. Plain functions with the
// network passed in, so the tests need no live site.
import { safeFetch } from './proto-crawl.js';

const MAX_IMAGE = 2_500_000;
const meta = (h, key) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, 'i'), tag = re.exec(h)?.[0] || '';
  const m = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag); return m ? (m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim() : '';
};
const abs = (u, base) => { try { const x = new URL(String(u).trim(), base); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : ''; } catch { return ''; } };
const squash = s => String(s || '').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// what a page runs on, from its HTML and headers: [key, label]; the first that matches wins
const PLATFORMS = [
  ['shopify', 'Shopify', (h, hd) => /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i.test(h) || 'x-shopid' in hd || /shopify/i.test(hd['powered-by'] || '')],
  ['squarespace', 'Squarespace', h => /static1\.squarespace\.com|Squarespace/i.test(h)],
  ['wix', 'Wix', (h, hd) => /wixstatic\.com|wix\.com/i.test(h) || 'x-wix-request-id' in hd],
  ['webflow', 'Webflow', h => /webflow\.(com|io)|data-wf-site/i.test(h)],
  ['framer', 'Framer', h => /framerusercontent\.com|framer\.com\/m\//i.test(h)],
  ['bigcommerce', 'BigCommerce', h => /bigcommerce\.com|cdn11\.bigcommerce/i.test(h)],
  ['woocommerce', 'WooCommerce', h => /woocommerce/i.test(h)],
  ['wordpress', 'WordPress', h => /wp-content|wp-includes/i.test(h)],
  ['nextjs', 'Next.js', (h, hd) => /__NEXT_DATA__|\/_next\/static\//.test(h) || /next\.js/i.test(hd['x-powered-by'] || '')],
  ['nuxt', 'Nuxt', h => /__NUXT__|\/_nuxt\//.test(h)],
  ['gatsby', 'Gatsby', h => /___gatsby/.test(h)],
  ['astro', 'Astro', h => /astro-island|data-astro-cid/i.test(h)]
];
const HOSTS = [['vercel', 'Vercel', hd => 'x-vercel-id' in hd || /vercel/i.test(hd.server || '')], ['netlify', 'Netlify', hd => 'x-nf-request-id' in hd || /netlify/i.test(hd.server || '')],
  ['cloudflare', 'Cloudflare', hd => 'cf-ray' in hd], ['railway', 'Railway', hd => /railway/i.test(hd.server || '') || 'x-railway-edge' in hd || 'x-railway-request-id' in hd],
  ['shopify', 'Shopify', hd => 'x-shopid' in hd || 'x-shardid' in hd], ['github-pages', 'GitHub Pages', hd => /github\.com/i.test(hd.server || '')]];
const TOOLS = [['Google Analytics', /googletagmanager\.com\/gtag|google-analytics\.com/i], ['Google Tag Manager', /googletagmanager\.com\/gtm\.js/i], ['Meta Pixel', /connect\.facebook\.net\/[^"']*fbevents/i],
  ['Klaviyo', /klaviyo/i], ['Shop Pay', /shop-pay|shopify-pay|shop_pay/i], ['Stripe', /js\.stripe\.com/i], ['Recharge', /rechargeapps|rechargecdn/i], ['Yotpo', /yotpo/i], ['Judge.me', /judge\.me/i],
  ['Gorgias', /gorgias/i], ['Hotjar', /hotjar/i], ['TikTok Pixel', /analytics\.tiktok\.com/i], ['Tailwind', /tailwindcss|tw-[a-z]/i]];

// Everything the card needs from one page: { title, image, platform, platformLabel, host, hostLabel, shop, theme, password, tools[] }
export function readPage(html, pageUrl, headers = {}) {
  const h = String(html || ''), hd = Object.fromEntries(Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const p = PLATFORMS.find(([, , t]) => t(h, hd)) || [], host = p[0] === 'shopify' ? HOSTS.find(x => x[0] === 'shopify') : HOSTS.find(([, , t]) => t(hd)) || [];
  const shop = (/Shopify\.shop\s*=\s*["']([a-z0-9-]+\.myshopify\.com)["']/i.exec(h) || /["']([a-z0-9-]+\.myshopify\.com)["']/i.exec(h) || [])[1] || '';
  const theme = squash((/Shopify\.theme\s*=\s*\{[^}]*?"name"\s*:\s*"([^"]{1,80})"/i.exec(h) || [])[1] || '');
  let path = ''; try { path = new URL(pageUrl).pathname; } catch { /* no path */ }
  const password = /\/password\/?$/.test(path) || /template-password|password-page|id=["']password["'][^>]*type=["']password|"template"\s*:\s*"password"/i.test(h);
  const title = squash(meta(h, 'og:site_name') || meta(h, 'og:title') || (/<title[^>]*>([^<]{1,160})<\/title>/i.exec(h) || [])[1] || '');
  const raw = meta(h, 'og:image:secure_url') || meta(h, 'og:image') || meta(h, 'twitter:image'), image = raw ? abs(raw, pageUrl) : '';
  return { title: title.slice(0, 120), image, platform: p[0] || '', platformLabel: p[1] || '', host: host[0] || (p[0] === 'shopify' ? 'shopify' : ''), hostLabel: host[1] || (p[0] === 'shopify' ? 'Shopify' : ''),
    shop, theme, password, tools: TOOLS.filter(([, re]) => re.test(h)).map(([n]) => n).slice(0, 8) };
}

// Look at the site: → { facts, image: { type, body } | null }. facts also carries how it answered: { status, ms, url (after redirects), checkedAt, error? }
export async function peekSite(url, opts = {}) {
  const checkedAt = new Date().toISOString();
  let page; try { page = await safeFetch(url, { ...opts, maxBytes: 1_200_000 }); }
  catch (e) { return { facts: { error: String(e.message || e).slice(0, 160), checkedAt }, image: null }; }
  const facts = { ...readPage(page.text, page.url, page.headers), status: page.status, ms: page.ms, url: page.url, checkedAt };
  let image = null;
  if (facts.image) {
    try {
      const r = await safeFetch(facts.image, { ...opts, maxBytes: MAX_IMAGE, binary: true, accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' });
      const type = String(r.type || '').split(';')[0].trim().toLowerCase();
      if (r.ok && /^image\/(png|jpe?g|webp|gif|avif)$/.test(type) && !r.truncated && r.body?.length > 500) image = { type, body: r.body };
    } catch { /* no picture: the card shows the name */ }
  }
  return { facts, image };
}

// The black tile on a site's card: what it runs on, whether it is up, the client's store connection, and the stack, in plain words.
// r: { platform?, hosting?, stack?, catalog?, monitor?, facts?, buildStatus? }; stores: the room's connected Shopify stores ({ status, shop, name })
const HOSTING = { railway: 'Railway', vercel: 'Vercel', shopify: 'Shopify', 'github-pages': 'GitHub Pages', netlify: 'Netlify', cloudflare: 'Cloudflare' };
const PLATFORM_OF_HOST = { shopify: 'Shopify' };
export function siteStack(r = {}, stores = []) {
  const f = r.facts || {}, m = r.monitor || null, stack = (r.stack || []).filter(Boolean);
  const fromStack = stack.find(s => /shopify|next\.?js|wordpress|webflow|squarespace|wix|framer|astro|nuxt|gatsby|remix|sveltekit/i.test(s)) || '';
  const platform = f.platformLabel || (fromStack ? fromStack.replace(/ Online Store 2\.0$/i, '') : '') || PLATFORM_OF_HOST[r.hosting] || '';
  const hosting = HOSTING[r.hosting] || f.hostLabel || '';
  const onShopify = /shopify/i.test(platform) || r.hosting === 'shopify' || Boolean(f.shop);
  // live state: the monitor's (a build we watch) beats the last look; a Shopify password page is "password on"
  let state = 'unknown', stateWord = 'Not checked yet', ms = null;
  if (m && m.state && m.state !== 'unknown') { state = m.state; stateWord = { up: 'Up', slow: 'Slow', down: 'Down' }[m.state]; ms = m.response_ms ?? m.responseMs ?? null; }
  else if (f.error) { state = 'down'; stateWord = 'Not answering'; }
  else if (f.status) { state = f.status >= 200 && f.status < 400 ? 'up' : 'down'; stateWord = state === 'up' ? 'Up' : `Error ${f.status}`; ms = f.ms ?? null; }
  if (f.password && state === 'up') { state = 'locked'; stateWord = 'Password on'; }
  const live = r.url ? (state === 'locked' ? 'Pre-launch' : state === 'up' ? 'Live' : state === 'down' ? 'Not reachable' : 'Online') : 'Not online yet';
  const live2 = stores.find(s => s.status === 'connected'), anyStore = stores[0];
  const store = !onShopify ? null : live2 ? { state: 'connected', word: 'Connected', detail: live2.name || live2.shop } : anyStore ? { state: 'reconnect', word: 'Reconnect', detail: anyStore.name || anyStore.shop } : { state: 'none', word: 'Not connected', detail: f.shop || '' };
  const up30 = m?.up30 ?? null;
  const chips = [...new Set([...(stack.length ? stack : [platform, hosting].filter(Boolean)), ...(f.theme ? [`Theme: ${f.theme}`] : []), ...(f.tools || [])])].slice(0, 10);
  return { platform, hosting, onShopify, state, stateWord, ms, live, store, up30, products: Number(r.catalog) || 0, theme: f.theme || '', shop: live2?.shop || f.shop || '', checkedAt: m?.checked_at || m?.checkedAt || f.checkedAt || null, chips };
}

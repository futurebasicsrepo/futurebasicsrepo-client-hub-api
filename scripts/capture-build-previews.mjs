// Takes the picture each build's card shows: its real site, at 1280x800, saved to src/builds-previews/<slug>.jpg.
//   node scripts/capture-build-previews.mjs              every build below
//   node scripts/capture-build-previews.mjs spot cuesea  just those
// A store behind Shopify's password page: pass its password in the environment, never in this file:
//   CAPTURE_PASSWORDS="cg12concept=...,vtpconcept=..." node scripts/capture-build-previews.mjs cg12concept
// Needs Playwright (npm i -D playwright, or a global install). Uses HTTPS_PROXY when it is set.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright')); }

const SITES = {
  spot: 'https://spotmeplease.com',
  'bennys-beans': 'https://bennys-beans.up.railway.app',
  'modish-nail-spa': 'https://modish-site-production.up.railway.app',
  nursepartners: 'https://nursepartners-site-production.up.railway.app',
  'common-ground': 'https://commonground12.com',
  cuesea: 'https://cuesea.ai',
  cg12concept: 'https://cg12concept.myshopify.com',
  vtpconcept: 'https://vtpconcept.myshopify.com'
};
const passwords = Object.fromEntries(String(process.env.CAPTURE_PASSWORDS || '').split(',').filter(Boolean).map(p => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1)]; }));
const only = process.argv.slice(2), out = new URL('../src/builds-previews/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {});
let failed = 0;
for (const [slug, url] of Object.entries(SITES)) {
  if (only.length && !only.includes(slug)) continue;
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  try {
    if (passwords[slug]) { await page.goto(url + '/password', { waitUntil: 'networkidle', timeout: 30000 }); await page.fill('input[type=password]', passwords[slug]); await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }).catch(() => {}), page.click('button[type=submit], input[type=submit]')]); }
    else await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}${slug}.jpg`, type: 'jpeg', quality: 72 });
    console.log('ok  ', slug);
  } catch (e) { failed++; console.log('FAIL', slug, e.message.split('\n')[0]); }
}
await browser.close(); process.exit(failed ? 1 : 0);

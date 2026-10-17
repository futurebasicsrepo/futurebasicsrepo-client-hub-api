// Reading a small business's existing website: fetch it safely, pull out what the rebuilt site needs (the name, services, phone, colours, pictures)
// and audit it, so a sales rep can see in a minute how bad the site is and what to say. Plain functions with the network passed in (no live site is
// needed by the tests). The audit uses no AI and costs nothing, so it can run over a whole list of leads.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 1_500_000, TIMEOUT_MS = 12_000, UA = 'Mozilla/5.0 (compatible; FutureBasicsPrototyper/1.0; +https://thefuturebasics.com)';

// ---------- an address we are willing to fetch ----------
export function isPublicIp(ip) {
  const v = net.isIP(ip); if (!v) return false;
  if (v === 4) { const [a, b] = ip.split('.').map(Number); return !(a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224); }
  const x = ip.toLowerCase(); if (x === '::1' || x === '::' || x.startsWith('fe80') || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('ff')) return false;
  if (x.startsWith('::ffff:')) return isPublicIp(x.slice(7)); return true;
}
// "plumberjoe.com", "http://www.joes-plumbing.com/about" → a clean https address, or { error }
export function cleanSiteUrl(input) {
  let s = String(input || '').trim(); if (!s) return { error: 'Paste the address of the site' };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  let u; try { u = new URL(s); } catch { return { error: 'That does not look like a web address' }; }
  if (!['http:', 'https:'].includes(u.protocol)) return { error: 'Only http and https addresses can be read' };
  if (u.username || u.password) return { error: 'The address cannot hold a sign-in' };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') && !net.isIP(host)) return { error: 'That address has no domain (like joesplumbing.com)' };
  if (net.isIP(host) && !isPublicIp(host)) return { error: 'That address is not a public website' };
  if (/(^|\.)(localhost|local|internal|invalid)$/.test(host)) return { error: 'That address is not a public website' };
  if (u.port && !['80', '443'].includes(u.port)) return { error: 'Only the normal web ports can be read' };
  u.hash = ''; return { url: u.toString(), host: host.replace(/^www\./, '') };
}

// Fetch one page: redirects followed by hand (each hop checked), size and time capped. → { url, status, ok, type, text, ms, bytes, truncated }
export async function safeFetch(url, { fetchImpl = fetch, lookup = (h => dns.lookup(h, { all: true })), timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, maxRedirects = 4, userAgent = UA, accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  let cur = url; const t0 = Date.now();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const c = cleanSiteUrl(cur); if (c.error) throw new Error(c.error);
    const host = new URL(c.url).hostname;
    if (!net.isIP(host)) { let addrs; try { addrs = await lookup(host); } catch { throw new Error(`The site ${host} could not be found`); } if (!addrs.length || addrs.some(a => !isPublicIp(a.address))) throw new Error('That address does not lead to a public website'); }
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res; try { res = await fetchImpl(c.url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Language': 'en-US,en;q=0.8' } }); }
    catch (e) { clearTimeout(timer); throw new Error(e.name === 'AbortError' ? `The site took longer than ${Math.round(timeoutMs / 1000)} seconds to answer` : `The site could not be reached (${String(e.cause?.code || e.message).slice(0, 60)})`); }
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get('location')) { clearTimeout(timer); cur = new URL(res.headers.get('location'), c.url).toString(); continue; }
    const type = String(res.headers.get('content-type') || ''); let text = '', bytes = 0, truncated = false;
    try {
      if (res.body?.getReader) {
        const rd = res.body.getReader(), parts = [];
        for (;;) { const { done, value } = await rd.read(); if (done) break; bytes += value.length; if (bytes > maxBytes) { truncated = true; try { await rd.cancel(); } catch { /* done reading */ } break; } parts.push(value); }
        text = Buffer.concat(parts.map(p => Buffer.from(p))).toString('utf8');
      } else { const b = Buffer.from(await res.arrayBuffer()); bytes = b.length; truncated = bytes > maxBytes; text = b.subarray(0, maxBytes).toString('utf8'); }
    } finally { clearTimeout(timer); }
    return { url: c.url, status: res.status, ok: res.status >= 200 && res.status < 400, type, text, ms: Date.now() - t0, bytes, truncated };
  }
  throw new Error('The site redirects too many times');
}

// ---------- reading the page ----------
const decode = s => String(s || '').replace(/&nbsp;/g, ' ').replace(/&copy;/g, '©').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => { const c = Number(n); return c > 31 && c < 65536 ? String.fromCharCode(c) : ' '; }).replace(/&[a-z]+;/g, ' ');
const squash = s => decode(s).replace(/\s+/g, ' ').trim();
const stripTags = s => squash(String(s || '').replace(/<[^>]*>/g, ' '));
const attr = (tag, name) => { const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : ''; };
const abs = (u, base) => { try { const x = new URL(String(u).trim(), base); return ['http:', 'https:'].includes(x.protocol) ? x.toString() : ''; } catch { return ''; } };
const uniq = (a, n = 20) => [...new Set(a.filter(Boolean))].slice(0, n);

const PHONE = /(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/g;
const CONSTRUCTORS = [['wix', /wixstatic\.com|wix\.com|X-Wix/i], ['squarespace', /squarespace/i], ['godaddy', /godaddy|secureserver\.net|websitebuilder/i], ['weebly', /weebly/i], ['wordpress', /wp-content|wp-includes|wordpress/i], ['webflow', /webflow/i], ['shopify', /cdn\.shopify\.com/i], ['joomla', /joomla/i], ['frontpage', /FrontPage|MS_FrontPage/i]];
const SOCIAL = ['facebook', 'instagram', 'youtube', 'linkedin', 'twitter', 'x', 'tiktok', 'yelp', 'nextdoor', 'google'];

// Everything the rebuild and the audit need from one page of HTML.
export function extractFacts(html, pageUrl, { headers = {}, ms = 0, bytes = 0 } = {}) {
  const h = String(html || ''), body = (/<body[\s>][\s\S]*$/i.exec(h) || [h])[0];
  const clean = body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const tag = re => [...h.matchAll(re)].map(m => m[0]);
  const title = squash((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '');
  const meta = n => { const t = tag(new RegExp(`<meta[^>]+(?:name|property)\\s*=\\s*["']${n}["'][^>]*>`, 'ig'))[0]; return t ? attr(t, 'content') : ''; };
  const heads = n => uniq([...clean.matchAll(new RegExp(`<h${n}[^>]*>([\\s\\S]*?)<\\/h${n}>`, 'gi'))].map(m => stripTags(m[1])).filter(x => x.length > 2 && x.length < 120), 30);
  // links: where they go, and what they say
  const links = [...clean.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: attr(m[0], 'href'), text: stripTags(m[1]), tag: m[0] }));
  const nav = (/<nav[\s\S]*?<\/nav>/i.exec(clean) || [''])[0];
  const navLabels = uniq([...nav.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map(m => stripTags(m[1])).filter(x => x && x.length < 40), 14);
  const tels = uniq(links.filter(l => /^tel:/i.test(l.href)).map(l => l.href.replace(/^tel:/i, '').replace(/[^\d+]/g, '')), 5);
  const text = stripTags(clean);
  const phones = uniq([...tels.map(t => t.replace(/^\+?1(\d{10})$/, '$1')), ...[...text.matchAll(PHONE)].map(m => `${m[1]}${m[2]}${m[3]}`)], 5).map(p => p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);
  const emails = uniq([...links.filter(l => /^mailto:/i.test(l.href)).map(l => l.href.replace(/^mailto:/i, '').split('?')[0]), ...[...text.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g)].map(m => m[0])].map(e => e.toLowerCase()).filter(e => !/\.(png|jpg|gif|webp|svg)$/.test(e) && !/example\.|sentry|wixpress|@2x/.test(e)), 4);
  const addr = (/\b\d{2,6}\s+[A-Za-z0-9.' -]{3,40}\b(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Hwy|Highway|Pike|Pkwy|Parkway)\b\.?,?\s+[A-Za-z .'-]{2,30},?\s+[A-Z]{2}\s+\d{5}/.exec(text) || [''])[0];
  const hours = (/\b(?:Mon(?:day)?|Open)[^.]{0,20}(?:-|–|to|through)\s*(?:Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)[^.]{0,60}\d\s*(?:am|pm|a\.m\.|p\.m\.)[^.]{0,40}/i.exec(text) || [''])[0].slice(0, 120);
  // services: list items and small headings that sit near the words "service", "we offer", "what we do"
  const services = uniq([...clean.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(m => stripTags(m[1])).filter(x => x.length > 3 && x.length < 60 && !/^(home|about|contact|menu|blog|faq|login|gallery|privacy|terms|search|services?)$/i.test(x) && !/[@]|\d{3}[\s.-]\d{4}/.test(x)), 24);
  // look: the colours the page uses most (CSS), the fonts, the pictures
  const css = tag(/<style[\s\S]*?<\/style>/gi).join(' ') + ' ' + (clean.match(/style\s*=\s*"[^"]*"/gi) || []).join(' ');
  const count = new Map(); for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) { let c = m[1].toLowerCase(); if (c.length === 3) c = c.split('').map(x => x + x).join(''); if (c === 'ffffff' || c === '000000') continue; count.set(c, (count.get(c) || 0) + 1); }
  const colors = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => '#' + c).filter(c => { const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return Math.max(r, g, b) - Math.min(r, g, b) > 24; }).slice(0, 5);
  const fonts = uniq([...css.matchAll(/font-family\s*:\s*([^;}"]+)/gi)].map(m => m[1].split(',')[0].replace(/["']/g, '').trim()).filter(f => f && !/^(inherit|initial|sans-serif|serif|monospace|arial|helvetica|times new roman|verdana|tahoma|georgia)$/i.test(f)), 4);
  const imgs = tag(/<img\b[^>]*>/gi).map(t => ({ src: abs(attr(t, 'data-src') || attr(t, 'src'), pageUrl), alt: attr(t, 'alt'), w: Number(attr(t, 'width')) || 0, h: Number(attr(t, 'height')) || 0 })).filter(i => i.src && !/\.(svg)(\?|$)/i.test(i.src) && !/pixel|spacer|tracking|1x1|blank|facebook\.com\/tr/i.test(i.src));
  const logoTag = tag(/<img\b[^>]*>/gi).find(t => /logo/i.test(t));
  const logo = logoTag ? abs(attr(logoTag, 'src'), pageUrl) : '', og = abs(meta('og:image'), pageUrl);
  const social = {}; for (const l of links) { const u = abs(l.href, pageUrl); if (!u) continue; const host = new URL(u).hostname.replace(/^www\./, ''); for (const s of SOCIAL) if (host === `${s}.com` || host.endsWith(`.${s}.com`) || (s === 'x' && host === 'x.com') || (s === 'google' && /maps\.google|g\.page|goo\.gl\/maps/.test(u))) if (!social[s]) social[s] = u; }
  const ld = tag(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi).map(t => t.replace(/^<script[^>]*>|<\/script>$/gi, '')); const ldTypes = []; let ldName = ''; for (const j of ld) { try { const o = JSON.parse(j); for (const x of Array.isArray(o) ? o : o['@graph'] || [o]) if (x && x['@type']) { ldTypes.push(...[].concat(x['@type'])); if (!ldName && typeof x.name === 'string' && [].concat(x['@type']).some(t => /Business|Plumber|Electrician|Contractor|HVAC|Roofing|Organization|Service|Store|Home|Painter|Locksmith/i.test(String(t))) && !/WebSite|WebPage/i.test([].concat(x['@type']).join(' '))) ldName = squash(x.name); } } catch { /* a broken block counts as no structured data */ } }
  const generator = (CONSTRUCTORS.find(([, re]) => re.test(h) || re.test(JSON.stringify(headers))) || [''])[0];
  const lower = text.toLowerCase(), year = Math.max(0, ...[...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map(m => Number(m[1])).filter(y => y > 1995 && y < 2100));
  const jq = /jquery[-.]?(?:min\.)?(\d)\.(\d+)/i.exec(h);
  return {
    url: pageUrl, title, description: meta('description'), ogTitle: meta('og:title'), siteName: meta('og:site_name'), ldName, h1: heads(1), h2: heads(2), h3: heads(3), navLabels, phones, emails, address: addr, hours, services, colors, fonts, logo, ogImage: og, images: imgs.slice(0, 16), social, schemaTypes: uniq(ldTypes, 8),
    text: text.slice(0, 6000), textLength: text.length, links: links.map(l => ({ href: abs(l.href, pageUrl), text: l.text })).filter(l => l.href).slice(0, 120), generator, copyrightYear: year,
    tech: {
      viewport: /<meta[^>]+name\s*=\s*["']viewport["']/i.test(h), https: /^https:/i.test(pageUrl), telLinks: tels.length, forms: (clean.match(/<form\b/gi) || []).length, tables: (clean.match(/<table\b/gi) || []).length, fontTags: (h.match(/<font\b|<center\b|<marquee\b|<blink\b/gi) || []).length,
      flash: /\.swf\b|<object[^>]+flash|<embed[^>]+flash/i.test(h), jquery: jq ? `${jq[1]}.${jq[2]}` : '', scripts: (h.match(/<script\b/gi) || []).length, stylesheets: (h.match(/<link[^>]+stylesheet/gi) || []).length, imgs: imgs.length, imgsNoAlt: imgs.filter(i => !i.alt).length, inlineStyles: (clean.match(/\sstyle\s*=/gi) || []).length,
      hasOg: Boolean(meta('og:title') || og), hasCanonical: /rel\s*=\s*["']canonical["']/i.test(h), pageKB: Math.round((bytes || h.length) / 1024), fetchMs: ms, mixed: /^https:/i.test(pageUrl) && /(?:src|href)\s*=\s*["']http:\/\//i.test(h), iframes: (h.match(/<iframe\b/gi) || []).length
    },
    signals: {
      reviews: /review|testimonial|5[- ]star|stars?\b|rated|google reviews/.test(lower), licensed: /licen[sc]ed|insured|bonded|license\s*(?:no|#|number)|\blic\b/.test(lower), emergency: /24\s*[\/x-]?\s*7|24[- ]hour|emergency|same[- ]day|after[- ]hours/.test(lower), freeEstimate: /free\s+(?:estimate|quote|consultation|inspection|assessment)/.test(lower), financing: /financing|payment plans?|0%\s*apr/.test(lower),
      serviceArea: /service area|areas? we serve|serving\s+[A-Z]|proudly serving|counties|and surrounding/.test(text) || /service area|areas? we serve|proudly serving/.test(lower), booking: /book (?:online|now|an appointment)|schedule (?:online|service|an appointment)|request (?:service|an appointment)/.test(lower), warranty: /warrant|guarantee/.test(lower),
      ecommerce: /add to cart|checkout|shopping cart/.test(lower), portal: /client portal|patient portal|customer portal|log ?in\b/.test(lower)
    }
  };
}

// The pages worth reading after the home page: services, about, contact, areas. Same site only.
export function pickSubpages(facts, max = 3) {
  let home; try { home = new URL(facts.url); } catch { return []; }
  const want = [/service|what-we-do|repair|install|plumbing|electric|roof|hvac|heating|cooling|care\b/i, /about|story|team|who-we-are/i, /contact|quote|estimate|request|schedule|book/i, /area|location|serving|city|town/i];
  const seen = new Set([home.pathname.replace(/\/$/, '') || '/']), out = [];
  for (const re of want) {
    const l = facts.links.find(x => { try { const u = new URL(x.href); const p = u.pathname.replace(/\/$/, '') || '/'; return u.hostname.replace(/^www\./, '') === home.hostname.replace(/^www\./, '') && !seen.has(p) && !/\.(pdf|jpe?g|png|gif|zip|docx?)$/i.test(p) && (re.test(x.text) || re.test(p)); } catch { return false; } });
    if (l) { const p = new URL(l.href).pathname.replace(/\/$/, '') || '/'; seen.add(p); out.push(l.href.split('#')[0]); }
    if (out.length >= max) break;
  }
  return out;
}

// Fold what the other pages say into the home page's facts.
export function mergeFacts(home, pages) {
  const f = { ...home, pages: [{ url: home.url, title: home.title }], services: [...home.services], phones: [...home.phones], emails: [...home.emails], images: [...home.images], h2: [...home.h2], h3: [...home.h3], extraText: '' };
  for (const p of pages) {
    f.pages.push({ url: p.url, title: p.title });
    f.services = uniq([...f.services, ...p.services], 30); f.phones = uniq([...f.phones, ...p.phones], 5); f.emails = uniq([...f.emails, ...p.emails], 4); f.images = [...f.images, ...p.images.filter(i => !f.images.some(x => x.src === i.src))].slice(0, 24);
    f.h2 = uniq([...f.h2, ...p.h2], 40); f.h3 = uniq([...f.h3, ...p.h3], 40); if (!f.address && p.address) f.address = p.address; if (!f.hours && p.hours) f.hours = p.hours; f.extraText += ' ' + p.text.slice(0, 2500);
    for (const k of Object.keys(p.signals)) f.signals[k] = f.signals[k] || p.signals[k]; for (const [k, v] of Object.entries(p.social)) if (!f.social[k]) f.social[k] = v;
    f.tech.forms += p.tech.forms; f.tech.telLinks += p.tech.telLinks;
  }
  f.extraText = f.extraText.trim().slice(0, 7000); return f;
}

// Read a whole small site: the home page, then up to three more pages. Failure of a sub page is not failure of the site.
export async function crawlSite(input, opts = {}) {
  const c = cleanSiteUrl(input); if (c.error) throw new Error(c.error);
  const first = await safeFetch(c.url, opts);
  if (!first.ok) throw new Error(`The site answered ${first.status}${first.status === 403 ? ' (it may block automated visitors)' : ''}`);
  if (first.type && !/html|xml|text/i.test(first.type)) throw new Error('That address is not a web page');
  const home = extractFacts(first.text, first.url, { ms: first.ms, bytes: first.bytes });
  const subs = []; for (const u of pickSubpages(home)) { try { const r = await safeFetch(u, opts); if (r.ok && /html|text/i.test(r.type || 'text/html')) subs.push(extractFacts(r.text, r.url, { ms: r.ms, bytes: r.bytes })); } catch { /* skip the page */ } }
  const facts = mergeFacts(home, subs); facts.host = c.host; facts.inputUrl = c.url; facts.truncated = first.truncated; return facts;
}

// ---------- the audit: what is wrong with the site, in words a rep can say ----------
// Each finding: id, area, weight (points off 100), title, pitch (the sentence to say to the owner).
export function auditSite(f, { now = new Date() } = {}) {
  const t = f.tech, s = f.signals, I = [], add = (id, area, weight, title, pitch) => I.push({ id, area, weight, title, pitch });
  const year = now.getFullYear();
  if (!t.viewport) add('no-viewport', 'mobile', 22, 'Not built for phones', 'Most people looking for a plumber or electrician are on their phone, and your site shows up as a tiny desktop page they have to pinch and zoom.');
  if (!t.https) add('no-https', 'trust', 14, 'No secure connection (no https)', 'Browsers mark your site "Not secure", which scares off customers before they read a word.');
  if (t.https && t.mixed) add('mixed', 'trust', 4, 'Mixed secure and insecure content', 'Parts of the page load insecurely, so browsers can show a warning.');
  if (!t.telLinks && f.phones.length) add('no-tap-to-call', 'conversion', 12, 'The phone number is not tap-to-call', 'On a phone, people have to copy your number by hand instead of tapping once to call you.');
  if (!f.phones.length) add('no-phone', 'conversion', 14, 'No phone number found on the page', 'A visitor who is ready to call cannot find your number.');
  if (!t.forms && !s.booking) add('no-form', 'conversion', 8, 'No way to request a quote or service online', 'There is no form or booking button, so every visit that is not a phone call is lost.');
  if (!s.freeEstimate && !s.emergency) add('no-offer', 'conversion', 5, 'No clear offer (free estimate, 24/7, same day)', 'Nothing tells a visitor why to pick you over the next result.');
  if (!s.reviews) add('no-reviews', 'trust', 7, 'No reviews or testimonials', 'Customers choose the business with proof, and your site shows none.');
  if (!s.licensed) add('no-license', 'trust', 6, 'No licence or insurance shown', 'People let a trade into their home on trust: your licence and insurance should be the first thing they see.');
  if (!s.serviceArea) add('no-area', 'seo', 4, 'No service area', 'Visitors (and Google) cannot tell which towns you serve.');
  if (t.fontTags || t.tables > 3 || t.flash) add('old-markup', 'design', 12, 'Built with outdated web technology', 'The page is built the way sites were in 2008 (tables, font tags or Flash), and it looks it.');
  if (t.jquery && Number(t.jquery.split('.')[0]) < 3) add('old-jquery', 'design', 3, `Old scripts (jQuery ${t.jquery})`, 'The site runs old code that is slow and has known security holes.');
  if (f.copyrightYear && f.copyrightYear <= year - 3) add('stale', 'trust', 6, `Footer says © ${f.copyrightYear}`, `The footer says ${f.copyrightYear}: it looks like nobody has touched the site for years, so visitors wonder if you are still in business.`);
  if (t.pageKB > 900 || t.fetchMs > 4000) add('slow', 'speed', 8, 'Slow to load', `The home page is ${t.pageKB} KB and took ${(t.fetchMs / 1000).toFixed(1)} seconds: most visitors leave after three.`);
  if (t.scripts > 25) add('script-heavy', 'speed', 3, `${t.scripts} scripts on one page`, 'The page loads dozens of scripts, which slows it down on a phone.');
  if (f.generator && /wix|weebly|godaddy|frontpage|joomla/.test(f.generator)) add('builder', 'design', 5, `Built on ${f.generator[0].toUpperCase() + f.generator.slice(1)}`, 'It is a template-built site that looks like every other one and is hard to make rank.');
  if (!f.title || f.title.length < 12 || /^(home|welcome|untitled|index)\b/i.test(f.title)) add('bad-title', 'seo', 6, 'Weak page title', 'The title that shows in Google says almost nothing about what you do or where.');
  if (!f.description) add('no-description', 'seo', 4, 'No search description', 'Google writes the snippet for you, usually badly.');
  if (!f.schemaTypes.length) add('no-schema', 'seo', 4, 'No local business data for Google', 'Google cannot show your hours, rating and area in the results.');
  if (!t.hasOg) add('no-og', 'seo', 2, 'No preview when the link is shared', 'Texting your site to someone shows a bare link, not a branded card.');
  if (t.imgs && t.imgsNoAlt / t.imgs > .5) add('no-alt', 'seo', 3, 'Pictures have no descriptions', 'Search engines and screen readers cannot tell what the pictures show.');
  if (f.textLength < 400) add('thin', 'design', 6, 'Almost no content', 'There is very little on the page to convince anyone.');
  const score = Math.max(0, 100 - I.reduce((a, x) => a + x.weight, 0));
  const pages = f.pages?.length || 1, complex = s.ecommerce || s.portal || t.forms > 4;
  const quickTurn = !complex && f.navLabels.length <= 10 && pages <= 6 && f.textLength < 9000;
  const sorted = [...I].sort((a, b) => b.weight - a.weight);
  return { score, grade: score >= 80 ? 'good' : score >= 60 ? 'tired' : score >= 40 ? 'poor' : 'bad', issues: sorted, top: sorted.slice(0, 4).map(x => ({ title: x.title, pitch: x.pitch })), quickTurn, complex: Boolean(complex), areas: ['mobile', 'trust', 'conversion', 'speed', 'seo', 'design'].map(a => ({ area: a, points: I.filter(x => x.area === a).reduce((s2, x) => s2 + x.weight, 0) })) };
}

// Turning what was read from a site into a new, high-standard prototype: the brief, the standard it is held to, the call to Claude (streamed, one HTML file),
// a deterministic template used when Claude is not connected (and by the tests), the quality gate every prototype must pass, and the quiet fixes applied to it.
import vm from 'node:vm';
import Anthropic from '@anthropic-ai/sdk';
import { industryByKey, FEATURES, SIGNATURE_COMMON } from './proto-industry.js';

export const MAX_HTML_KB = 450;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hex = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '';

// What the rebuild is told about this business. Only facts from their site go in as facts; anything else is flagged as illustrative.
export function buildBrief(facts, audit, industryKey, { company = '', notes = '', city = '' } = {}) {
  const ind = industryByKey(industryKey);
  const nameFrom = () => { const t = (facts.ogTitle || facts.title || '').split(/\s[|–—:·-]\s|\s-\s/)[0].trim(); const h = (facts.h1 || [])[0] || ''; const guess = [t, h].find(x => x && x.length >= 3 && x.length <= 48 && !/^(home|welcome|untitled)/i.test(x)); return guess || (facts.host || 'Your business').replace(/\.[a-z.]+$/i, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); };
  const where = /\b([A-Z][a-z]+(?: [A-Z][a-z]+)*),? ([A-Z]{2})\b(?: \d{5})?/.exec(`${facts.address || ''} ${facts.title || ''} ${facts.description || ''}`);
  const services = [...new Set((facts.services || []).map(s => clip(s, 50)).filter(s => s.length > 3 && !/^\d/.test(s)))].slice(0, 12);
  const own = (facts.colors || []).map(hex).filter(Boolean);
  const images = (facts.images || []).filter(i => i.src && (!i.w || i.w >= 200) && !/icon|sprite|badge|logo|button|arrow|bullet/i.test(i.src)).slice(0, 8).map(i => ({ src: i.src, alt: clip(i.alt, 100) }));
  return {
    name: clip(company, 60) || nameFrom(), host: facts.host || '', sourceUrl: facts.inputUrl || facts.url || '', industry: { key: ind.key, label: ind.label, schema: ind.schema },
    city: clip(city, 60) || (where ? `${where[1]}, ${where[2]}` : ''), tagline: clip(facts.description, 160),
    contact: { phone: (facts.phones || [])[0] || '', email: (facts.emails || [])[0] || '', address: clip(facts.address, 120), hours: clip(facts.hours, 120) },
    services: services.length >= 3 ? services : ind.services, servicesFrom: services.length >= 3 ? 'their site' : 'the trade (illustrative)',
    colors: own.length ? own.slice(0, 3) : ind.accent, colorsFrom: own.length ? 'their site' : 'the trade',
    logo: facts.logo || '', ogImage: facts.ogImage || '', images, social: facts.social || {},
    proof: { reviews: Boolean(facts.signals?.reviews), licensed: Boolean(facts.signals?.licensed), emergency: Boolean(facts.signals?.emergency), freeEstimate: Boolean(facts.signals?.freeEstimate), financing: Boolean(facts.signals?.financing), serviceArea: Boolean(facts.signals?.serviceArea), warranty: Boolean(facts.signals?.warranty) },
    theirWords: clip(`${(facts.h1 || []).join('. ')}. ${(facts.h2 || []).slice(0, 8).join('. ')}. ${facts.text || ''}`, 1800),
    problems: (audit?.top || []).map(t => t.title), notes: clip(notes, 600),
    playbook: { audience: ind.audience, tone: ind.tone, cta: ind.cta, sections: ind.sections, faqs: ind.faqs, notes: ind.notes || '' },
    features: [...SIGNATURE_COMMON.map(f => ({ id: f.id, ...f })), ...ind.features.map(id => ({ id, ...FEATURES[id] }))]
  };
}

// ---------- the standard ----------
export const STANDARD = `You build prototype websites for Future Basics, a software studio. A prototype is shown to the owner of a small trade or home-care business whose current site is tired. In one look it must make them think "that is the site I wish I had", and it must be genuinely better for their customers.

Output ONE complete HTML document (<!doctype html> to </html>) and nothing else: no explanation, no code fence. All CSS and JavaScript are inline. No external scripts, no frameworks, no libraries, no external stylesheets other than an optional Google Fonts link. The file must be under ${MAX_HTML_KB} KB.

THE STANDARD (every point is checked):
1. Mobile first, responsive from 320px up. <meta name="viewport">, <html lang="en">, a descriptive <title> (30 to 65 characters, business, trade and town) and a meta description.
2. Semantic and accessible: <header>, <nav>, <main>, <footer>, one <h1>, headings in order, a skip link, visible focus states, alt text on every image, labels on every field, buttons that are buttons, colour contrast of at least 4.5:1, tap targets of at least 44px.
3. The phone number is the hero of the page for a trade business: a tel: link in the header, in the hero and in a sticky bottom call bar on phones.
4. Conversion: one primary action (call) and one secondary (request a quote or service), repeated at natural points. A short request form that never submits anywhere: the script shows a friendly "Thanks, this is a prototype" confirmation.
5. Trust, in this order of importance for the trade: licence and insurance, reviews, years in business, guarantees, local proof. Use ONLY facts given in the brief. Never invent a licence number, a review, a certification, a year, a statistic or a person's name.
6. Anything the brief does not give you but the page needs (sample reviews, ballpark prices, counts, service areas, hours) is allowed ONLY if it is clearly marked: put data-illustrative on the element and show a small visible "Sample" tag. Keep these few.
7. Motion that sets Future Basics apart, tasteful and fast: an animated hero (CSS or inline SVG), line-by-line headline reveal, scroll reveals with stagger (IntersectionObserver), count-up numbers, buttons that respond, smooth state changes in the interactive feature, a subtle parallax or drawn-line accent. Use transform and opacity only. Wrap ALL motion in @media (prefers-reduced-motion: no-preference) or honour prefers-reduced-motion by turning it off. The page must be fully readable with scripting off (reveals must not hide content without JS).
8. At least one interactive feature from the list in the brief, built properly in vanilla JavaScript: keyboard operable, announced with aria-live where it changes, and working on a phone.
9. Performance: no render-blocking resources, system font stack or one optional font link, images lazy-loaded with width and height, inline SVG for illustration, no layout shift.
10. SEO: LocalBusiness JSON-LD (use the schema type in the brief) with only real facts, Open Graph tags, a clear h1 with trade and town, service sections that could each rank.
11. Design: a confident, specific visual identity for THIS trade, built from their brand colours if they have any (else the accent colours in the brief). Generous spacing, a real type scale, one display face moment, large photography or illustration, no stock-site clichés, nothing that looks like a template. It should feel like a premium studio made it.
12. Copy: plain words for the audience in the brief, written for their customers, short sentences, no jargon, no fear tactics, no superlatives you cannot back up. Use their own words and services where you can.
13. Their images may be used by their given URLs (loading="lazy", with an onerror handler that hides a broken image); otherwise draw illustrations with inline SVG or CSS. Do not use any other image URL.
14. The business name, phone, email, address and hours must appear exactly as given. If something is not given, omit it rather than inventing it (a "Request a call back" form replaces a missing email).
15. Add data-prototype-footer to the footer and include a discreet line "Prototype by Future Basics" in it linking to https://thefuturebasics.com.`;

export function userPrompt(brief) {
  const b = { ...brief }; delete b.problems;
  return `Build the prototype for this business.\n\nBRIEF (JSON):\n${JSON.stringify(b, null, 1)}\n\nWhat is wrong with their current site (so the new one fixes each of these): ${(brief.problems || []).join('; ') || 'it is dated'}.\n\nChoose the sections from playbook.sections, adapted to this business; build every feature listed under features (common ones everywhere, the others where they fit; at least one trade-specific interactive feature). Remember: only their facts as facts, everything else marked data-illustrative.`;
}

// ---------- asking Claude ----------
export const PROTO_MODEL = env => env.PROTOTYPE_MODEL || 'claude-opus-5-5';
export const protoAiReady = (env = process.env) => Boolean(env.ANTHROPIC_API_KEY);

// The HTML in an answer, however it was wrapped.
export function extractHtml(text) {
  const t = String(text || ''); const a = t.search(/<!doctype html|<html[\s>]/i); if (a < 0) return '';
  const z = t.toLowerCase().lastIndexOf('</html>'); return (z >= 0 ? t.slice(a, z + 7) : t.slice(a)).trim();
}

// → { html, usage: { input, output }, model, stop }. Streams (the page is long), so no request timeout trips on it.
export async function generateWithClaude(brief, { env = process.env, client = null, extra = '', effort = 'high', maxTokens = 48000 } = {}) {
  if (!env.ANTHROPIC_API_KEY && !client) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
  const c = client || new Anthropic(), model = PROTO_MODEL(env);
  const stream = c.messages.stream({ model, max_tokens: maxTokens, system: STANDARD, output_config: { effort }, messages: [{ role: 'user', content: userPrompt(brief) + (extra ? `\n\n${extra}` : '') }] });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to build this site');
  const text = msg.content.filter(x => x.type === 'text').map(x => x.text).join('');
  const html = extractHtml(text); if (!html) throw new Error('Claude did not send a web page');
  return { html, usage: { input: msg.usage?.input_tokens || 0, output: msg.usage?.output_tokens || 0 }, model, stop: msg.stop_reason };
}

// ---------- the quality gate ----------
// Each check: id, label, required (a failing required check blocks publishing), ok, detail. Run on the HTML as built, after autofix.
export function qaCheck(html, brief = {}) {
  const h = String(html || ''), lower = h.toLowerCase(), checks = [], add = (id, label, ok, required = true, detail = '') => checks.push({ id, label, ok: Boolean(ok), required, detail });
  const kb = Math.round(Buffer.byteLength(h) / 1024);
  const scripts = [...h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const bad = []; for (const m of scripts) { if (/\bsrc\s*=/.test(m[1])) { bad.push('external script'); continue; } if (/application\/(ld\+)?json/.test(m[1])) continue; try { new vm.Script(m[2]); } catch (e) { bad.push(`script error: ${String(e.message).slice(0, 60)}`); } }
  const ld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)]; let ldOk = ld.length > 0; for (const m of ld) { try { JSON.parse(m[1]); } catch { ldOk = false; } }
  const imgs = [...h.matchAll(/<img\b[^>]*>/gi)].map(m => m[0]), links = [...h.matchAll(/<link\b[^>]*>/gi)].map(m => m[0]);
  const phone = (brief.contact?.phone || '').replace(/\D/g, ''), text = h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ');
  const h1s = (h.match(/<h1\b/gi) || []).length, title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '';
  add('doctype', 'Starts with a doctype', /^\s*<!doctype html/i.test(h));
  add('lang', 'Declares its language', /<html[^>]+\blang\s*=/i.test(h));
  add('viewport', 'Built for phones (viewport)', /<meta[^>]+name\s*=\s*["']viewport["']/i.test(h));
  add('title', 'A descriptive title (20 to 70 characters)', title.trim().length >= 20 && title.trim().length <= 70, true, title.trim().length + ' characters');
  add('description', 'A search description', /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*(?:"[^"]{40,}"|'[^']{40,}')/i.test(h));
  add('h1', 'Exactly one main heading', h1s === 1, true, `${h1s} found`);
  add('landmarks', 'Header, main and footer landmarks', /<header\b/i.test(h) && /<main\b/i.test(h) && /<footer\b/i.test(h));
  add('size', `Under ${MAX_HTML_KB} KB`, kb <= MAX_HTML_KB, true, `${kb} KB`);
  add('no-external-js', 'No external scripts, and every script runs', bad.length === 0, true, bad.slice(0, 3).join('; '));
  add('no-external-css', 'No external stylesheets (except fonts)', links.every(l => !/rel\s*=\s*["']stylesheet/i.test(l) || /fonts\.googleapis\.com/i.test(l)));
  add('no-submit', 'Forms never submit anywhere', ![...h.matchAll(/<form\b[^>]*>/gi)].some(m => /\baction\s*=\s*["']?https?:/i.test(m[0])));
  add('alt', 'Every image has alt text', imgs.every(i => /\balt\s*=/i.test(i)), true, `${imgs.filter(i => !/\balt\s*=/i.test(i)).length} without`);
  add('labels', 'Form fields are labelled', [...h.matchAll(/<(input|select|textarea)\b[^>]*>/gi)].filter(m => !/type\s*=\s*["']?(hidden|submit|button|checkbox|radio)/i.test(m[0])).every(m => /aria-label|aria-labelledby|\bid\s*=/i.test(m[0])));
  add('reduced-motion', 'Respects reduced-motion settings', /prefers-reduced-motion/i.test(h));
  add('motion', 'Has motion (animation, transitions, scroll reveals)', /@keyframes|animation\s*:|transition\s*:|IntersectionObserver/i.test(h));
  add('reveal-observer', 'Scroll reveals', /IntersectionObserver/i.test(h), false);
  add('interactive', 'Has an interactive feature (script and a control)', scripts.some(m => !/\bsrc\s*=|ld\+json/.test(m[1]) && /addEventListener|onclick/.test(m[2])) && /<(button|input|select|summary)\b/i.test(h));
  add('tel', 'Tap-to-call link', !phone || /href\s*=\s*["']tel:/i.test(h), true, phone ? '' : 'no phone known');
  add('phone-text', 'The phone number is shown as given', !phone || text.replace(/\D/g, '').includes(phone));
  add('call-bar', 'Sticky call bar for phones', !phone || /position\s*:\s*fixed[\s\S]{0,400}tel:|tel:[\s\S]{0,400}position\s*:\s*fixed|call-?bar|sticky-?call/i.test(h), false);
  add('schema', 'Local business data (JSON-LD)', ldOk);
  add('og', 'Link preview tags', /property\s*=\s*["']og:title["']/i.test(h), false);
  add('name', 'Shows the business name', !brief.name || text.toLowerCase().includes(String(brief.name).toLowerCase().slice(0, 18)));
  add('no-lorem', 'No placeholder text', !/lorem ipsum|\{\{|todo:|your text here|insert .* here/i.test(h));
  add('skip-link', 'Skip to content link', /href\s*=\s*["']#(main|content)/i.test(h), false);
  add('lazy', 'Images load lazily', !imgs.length || imgs.every(i => /loading\s*=\s*["']lazy/i.test(i)), false);
  add('footer-credit', 'Prototype credit in the footer', /Prototype by Future Basics/i.test(h), false);
  const illustrative = [...h.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-illustrative\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => clip(m[2].replace(/<[^>]+>/g, ' '), 90)).filter(Boolean).slice(0, 12);
  const req = checks.filter(c => c.required), ok = checks.filter(c => c.ok).length;
  return { pass: req.every(c => c.ok), score: Math.round(100 * ok / checks.length), checks, failed: req.filter(c => !c.ok), advisory: checks.filter(c => !c.required && !c.ok), sizeKB: kb, illustrative, usesTheirImages: (brief.images || []).some(i => h.includes(i.src)) };
}

// The fixes that are always safe, so a good page is never blocked for a missing attribute.
export function autofix(html, brief = {}) {
  let h = String(html || '').trim();
  if (!/^\s*<!doctype html/i.test(h)) h = '<!doctype html>\n' + h;
  if (!/<html[^>]+\blang\s*=/i.test(h)) h = h.replace(/<html\b([^>]*)>/i, '<html lang="en"$1>');
  if (!/<meta[^>]+charset/i.test(h)) h = h.replace(/<head\b[^>]*>/i, m => `${m}\n<meta charset="utf-8">`);
  if (!/<meta[^>]+name\s*=\s*["']viewport["']/i.test(h)) h = h.replace(/<head\b[^>]*>/i, m => `${m}\n<meta name="viewport" content="width=device-width,initial-scale=1">`);
  h = h.replace(/<script\b([^>]*\bsrc\s*=[^>]*)>\s*<\/script>/gi, '');                         // no outside scripts, ever
  h = h.replace(/(<form\b[^>]*?)\s+action\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1');       // forms never leave the page
  h = h.replace(/<img\b(?![^>]*\balt\s*=)([^>]*)>/gi, '<img alt=""$1>');
  h = h.replace(/<img\b(?![^>]*\bloading\s*=)([^>]*)>/gi, '<img loading="lazy"$1>');
  h = h.replace(/<a\b([^>]*\btarget\s*=\s*["']_blank["'][^>]*)>/gi, (m, a) => /rel\s*=/.test(a) ? m : `<a${a} rel="noopener noreferrer">`);
  if (!/prefers-reduced-motion/i.test(h)) h = h.replace(/<\/head>/i, `<style>@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}</style>\n</head>`);
  if (!/application\/ld\+json/i.test(h) && brief.name) {
    const ld = { '@context': 'https://schema.org', '@type': brief.industry?.schema || 'LocalBusiness', name: brief.name, ...(brief.contact?.phone ? { telephone: brief.contact.phone } : {}), ...(brief.contact?.email ? { email: brief.contact.email } : {}), ...(brief.contact?.address ? { address: brief.contact.address } : {}) };
    h = h.replace(/<\/head>/i, `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n</head>`);
  }
  return h;
}

// ---------- the template (no AI): a solid, moving site from the facts alone ----------
export function templateSite(brief) {
  const b = brief, [c1, c2] = [b.colors[0] || '#2563eb', b.colors[1] || '#f59e0b'], tel = b.contact.phone ? 'tel:' + b.contact.phone.replace(/\D/g, '') : '', phone = esc(b.contact.phone);
  const ind = b.industry, pb = b.playbook, name = esc(b.name), city = esc(b.city), services = b.services.slice(0, 9);
  const hero = (b.proof.emergency ? 'Fast help when you need it' : pb.cta[1] === 'Get a free quote' ? 'Honest work, a fair price' : 'Done right, the first time');
  const rawTitle = `${b.name}: ${ind.label.split(' (')[0]}${b.city ? ' in ' + b.city : ''} | Call ${b.contact.phone || 'today'}`, title = esc((rawTitle.length < 26 ? rawTitle + ' | Local experts' : rawTitle).slice(0, 68));
  const features = new Set((b.features || []).map(f => f.id));
  const sample = (t, s = 'Sample') => `<span class="tag" data-illustrative>${s}</span>`;
  const svc = services.map((s, i) => `<article class="card rv" style="--i:${i}"><span class="ic" aria-hidden="true">${i + 1}</span><h3>${esc(s)}</h3><p>${b.servicesFrom === 'their site' ? 'Call or request a visit and we will take care of it.' : 'One of the things we do.'}</p></article>`).join('');
  const picker = services.slice(0, 6).map(s => `<button type="button" class="pick" data-s="${esc(s)}">${esc(s)}</button>`).join('');
  const faq = pb.faqs.map(q => `<details><summary>${esc(q)}</summary><p data-illustrative>${sample()} Ask us: we are happy to answer this on the phone or in your free visit.</p></details>`).join('');
  const quiz = features.has('care-needs-quiz');
  const ld = { '@context': 'https://schema.org', '@type': ind.schema, name: b.name, ...(b.contact.phone ? { telephone: b.contact.phone } : {}), ...(b.contact.email ? { email: b.contact.email } : {}), ...(b.contact.address ? { address: b.contact.address } : {}), ...(b.sourceUrl ? { url: b.sourceUrl } : {}) };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="description" content="${esc(b.tagline || `${b.name} offers ${services.slice(0, 3).join(', ').toLowerCase()}${b.city ? ' in ' + b.city : ''}. Call ${b.contact.phone || 'us'} or request a quote online.`).slice(0, 158)}">
<meta property="og:title" content="${name}"><meta property="og:type" content="website">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>
:root{--c1:${c1};--c2:${c2};--ink:#12151c;--mut:#5b6472;--bg:#fbfbf9;--card:#fff;--line:rgba(18,21,28,.12)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:400 17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
a{color:inherit}h1,h2,h3{line-height:1.1;margin:0;letter-spacing:-.02em}h1{font-size:clamp(2.2rem,6vw,4.4rem);font-weight:800}h2{font-size:clamp(1.7rem,4vw,2.7rem);font-weight:800}h3{font-size:1.15rem}
.wrap{max-width:1100px;margin:0 auto;padding:0 20px}.skip{position:absolute;left:-999px;top:8px;background:#fff;padding:8px 12px;z-index:60}.skip:focus{left:8px}
header.top{position:sticky;top:0;z-index:40;background:rgba(251,251,249,.9);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}header .wrap{display:flex;align-items:center;justify-content:space-between;gap:12px;height:64px}.brand{font-weight:800;text-decoration:none;font-size:1.1rem}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;border:2px solid var(--ink);background:var(--ink);color:#fff;font:700 1rem system-ui;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.18)}.btn:focus-visible,.pick:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--c2);outline-offset:2px}.btn.alt{background:transparent;color:var(--ink)}.btn.go{background:var(--c1);border-color:var(--c1)}
.hero{position:relative;overflow:hidden;padding:72px 0 64px;background:radial-gradient(1200px 500px at 85% -10%,color-mix(in srgb,var(--c1) 22%,transparent),transparent),var(--bg)}.hero p.lead{font-size:1.25rem;color:var(--mut);max-width:34em;margin:18px 0 28px}.hero .acts{display:flex;gap:12px;flex-wrap:wrap}
.blob{position:absolute;border-radius:50%;filter:blur(40px);opacity:.35;pointer-events:none}.b1{width:380px;height:380px;background:var(--c1);right:-80px;top:-60px}.b2{width:260px;height:260px;background:var(--c2);right:180px;bottom:-90px}
.eyebrow{display:inline-block;font:700 .8rem system-ui;letter-spacing:.14em;text-transform:uppercase;color:var(--c1);margin-bottom:14px}
.trust{background:var(--ink);color:#fff;padding:18px 0}.trust ul{display:flex;gap:10px 34px;flex-wrap:wrap;list-style:none;margin:0;padding:0;font-weight:600}.trust li:before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c2);margin-right:10px}
section{padding:72px 0}.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));margin-top:30px}.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:24px;transition:transform .25s,box-shadow .25s}.card:hover{transform:translateY(-4px);box-shadow:0 14px 34px rgba(0,0,0,.1)}.ic{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:color-mix(in srgb,var(--c1) 14%,#fff);color:var(--c1);font-weight:800;margin-bottom:12px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:20px;margin-top:26px}.stat b{display:block;font-size:2.6rem;font-weight:800;color:var(--c1)}.stat span{color:var(--mut)}
.tool{background:var(--card);border:1px solid var(--line);border-radius:24px;padding:28px;margin-top:26px}.picks{display:flex;gap:10px;flex-wrap:wrap}.pick{min-height:48px;padding:0 18px;border-radius:14px;border:2px solid var(--line);background:#fff;font:600 1rem system-ui;cursor:pointer;transition:all .2s}.pick[aria-pressed=true]{background:var(--c1);color:#fff;border-color:var(--c1);transform:scale(1.03)}
.out{margin-top:18px;padding:18px;border-radius:16px;background:color-mix(in srgb,var(--c1) 8%,#fff);min-height:64px}
.steps{counter-reset:s;display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin-top:28px}.steps li{list-style:none;counter-increment:s;padding:22px;border-radius:18px;background:var(--card);border:1px solid var(--line);position:relative}.steps li:before{content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--c2);color:#111;font-weight:800;margin-bottom:10px}
.tag{display:inline-block;font:700 .65rem system-ui;letter-spacing:.1em;text-transform:uppercase;padding:2px 8px;border-radius:99px;background:#eee;color:#555;margin-right:8px;vertical-align:2px}
details{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 18px;margin-top:10px}summary{cursor:pointer;font-weight:700;padding:12px 0}
form.q{display:grid;gap:12px;margin-top:24px;max-width:560px}label{font-weight:600;display:grid;gap:6px}input,select,textarea{font:inherit;padding:12px 14px;border-radius:12px;border:2px solid var(--line);background:#fff}textarea{min-height:100px}
.cta{background:var(--c1);color:#fff;border-radius:28px;padding:44px 28px}.cta .btn{background:#fff;color:#111;border-color:#fff}
footer{padding:36px 0 100px;color:var(--mut);font-size:.95rem}footer a{color:inherit}
.callbar{display:none}@media(max-width:720px){.callbar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;gap:8px;padding:10px 12px;background:#fff;border-top:1px solid var(--line)}.callbar .btn{flex:1}header .btn{display:none}section{padding:52px 0}.hero{padding:44px 0}}
.js .rv{opacity:0;transform:translateY(22px)}.js .rv.in{opacity:1;transform:none}
@media (prefers-reduced-motion:no-preference){.rv{transition:opacity .7s cubic-bezier(.2,.7,.2,1) calc(var(--i,0)*70ms),transform .7s cubic-bezier(.2,.7,.2,1) calc(var(--i,0)*70ms)}.b1{animation:fl 14s ease-in-out infinite}.b2{animation:fl 11s ease-in-out infinite reverse}@keyframes fl{50%{transform:translate(-30px,24px) scale(1.08)}}.hero h1 span{display:inline-block;animation:up .9s cubic-bezier(.2,.7,.2,1) both}.hero h1 span:nth-child(2){animation-delay:.12s}@keyframes up{from{opacity:0;transform:translateY(34px)}}.pulse{animation:pu 2s infinite}@keyframes pu{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c1) 50%,transparent)}100%{box-shadow:0 0 0 18px transparent}}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js .rv{opacity:1;transform:none}}
</style></head><body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap"><a class="brand" href="#top">${name}</a>${tel ? `<a class="btn go" href="${tel}">Call ${phone}</a>` : `<a class="btn go" href="#contact">${esc(pb.cta[1])}</a>`}</div></header>
<main id="main"><div id="top" class="hero"><div class="blob b1" aria-hidden="true"></div><div class="blob b2" aria-hidden="true"></div><div class="wrap">
<span class="eyebrow">${esc(ind.label.split(' (')[0])}${city ? ' · ' + city : ''}</span>
<h1><span>${esc(hero)}.</span> <span>${name}.</span></h1>
<p class="lead">${esc(b.tagline || `${services.slice(0, 3).join(', ')}${city ? ' in ' + b.city : ''}. Talk to a real person today.`)}</p>
<div class="acts">${tel ? `<a class="btn go pulse" href="${tel}">Call ${phone}</a>` : ''}<a class="btn alt" href="#contact">${esc(pb.cta[1])}</a></div></div></div>
<div class="trust"><div class="wrap"><ul>${b.proof.licensed ? '<li>Licensed and insured</li>' : ''}${b.proof.emergency ? '<li>Emergency service</li>' : ''}${b.proof.freeEstimate ? '<li>Free estimates</li>' : ''}${b.proof.warranty ? '<li>Work guaranteed</li>' : ''}${b.proof.reviews ? '<li>Trusted by neighbours</li>' : ''}<li>${b.city ? 'Serving ' + city : 'Local and family run'}</li></ul></div></div>
<section id="services"><div class="wrap"><h2 class="rv">${quiz ? 'How we can help' : 'What we do'}</h2><div class="grid">${svc}</div></div></section>
<section style="background:#fff"><div class="wrap"><h2 class="rv">${quiz ? 'Find the right kind of care' : 'What is going on?'}</h2><div class="tool rv" id="tool"><div class="picks" role="group" aria-label="Choose one">${picker}</div><div class="out" id="out" aria-live="polite" data-illustrative>${sample()} Pick one and we will show what usually happens next.</div></div>
<div class="stats"><div class="stat rv"><b data-n="24" data-illustrative>24</b><span>hour phone line ${sample()}</span></div><div class="stat rv"><b data-n="60" data-illustrative>60</b><span>minute average response ${sample()}</span></div><div class="stat rv"><b data-n="100" data-illustrative>100</b><span>percent satisfaction goal ${sample()}</span></div></div></div></section>
<section><div class="wrap"><h2 class="rv">How it works</h2><ol class="steps" style="padding:0"><li class="rv"><h3>You call or ask</h3><p>Tell us what is going on.</p></li><li class="rv" style="--i:1"><h3>We show up</h3><p>On time, in clean uniforms, with the right tools.</p></li><li class="rv" style="--i:2"><h3>Fixed right</h3><p>You see the price before we start.</p></li></ol></div></section>
<section style="background:#fff"><div class="wrap"><h2 class="rv">Questions people ask</h2>${faq}</div></section>
<section id="contact"><div class="wrap"><div class="cta rv"><h2>${esc(pb.cta[1])}</h2><p>${tel ? `Call <a href="${tel}" style="font-weight:800">${phone}</a> or send us a note.` : 'Send us a note and we will call you back.'}</p>
<form class="q" id="f"><label for="n">Your name<input id="n" name="n" autocomplete="name" required></label><label for="p">Phone<input id="p" name="p" type="tel" autocomplete="tel" required></label><label for="m">What do you need?<textarea id="m" name="m"></textarea></label><button class="btn" type="submit">Send</button><p id="ok" role="status" aria-live="polite"></p></form></div></div></section>
</main>
<footer data-prototype-footer><div class="wrap"><strong>${name}</strong>${b.contact.address ? ' · ' + esc(b.contact.address) : ''}${b.contact.hours ? ' · ' + esc(b.contact.hours) : ''}${b.contact.email ? ` · <a href="mailto:${esc(b.contact.email)}">${esc(b.contact.email)}</a>` : ''}<br>Prototype by <a href="https://thefuturebasics.com" rel="noopener noreferrer">Future Basics</a>. Items marked Sample are placeholders.</div></footer>
<div class="callbar">${tel ? `<a class="btn go" href="${tel}">Call</a>` : ''}<a class="btn alt" href="#contact">${esc(pb.cta[1])}</a></div>
<script>
document.documentElement.classList.add('js');
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.15});document.querySelectorAll('.rv').forEach(el=>io.observe(el));
const cio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;cio.unobserve(e.target);const t=+e.target.dataset.n,s=performance.now();(function f(n){const k=Math.min(1,(n-s)/1100);e.target.textContent=Math.round(t*(1-Math.pow(1-k,3)));if(k<1)requestAnimationFrame(f)})(s)}));document.querySelectorAll('[data-n]').forEach(el=>cio.observe(el));
const out=document.getElementById('out');document.querySelectorAll('.pick').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.pick').forEach(x=>x.setAttribute('aria-pressed','false'));b.setAttribute('aria-pressed','true');out.textContent='${quiz ? 'We would start with a free, friendly visit to talk about' : 'Most calls about'} '+b.dataset.s.toLowerCase()+' ${quiz ? 'and what would help most.' : 'are sorted out the same day. Call now or send a note.'}'}));
document.getElementById('f').addEventListener('submit',e=>{e.preventDefault();document.getElementById('ok').textContent='Thanks. This is a prototype, so nothing was sent.'});
</script></body></html>`;
}

// What one build costs (Claude's list price per million tokens for the model), so staff can see it.
export const protoCostCents = (usage, env = process.env) => { const [i, o] = String(env.PROTOTYPE_PRICE || '5,25').split(',').map(Number); return Math.round(((usage.input * i + usage.output * o) / 1_000_000) * 100 * 100) / 100; };

// The whole step: ask Claude, fix what is always safe to fix, check it; one repair pass if a required check fails; the template if Claude is not connected.
export async function buildPrototype(brief, { env = process.env, client = null, onStep = () => {}, generate = generateWithClaude } = {}) {
  let usage = { input: 0, output: 0 }, model = 'template', html = '', note = '';
  if (protoAiReady(env) || client) {
    onStep('Designing and building with Claude');
    const r = await generate(brief, { env, client }); html = r.html; usage = r.usage; model = r.model;
    html = autofix(html, brief); let qa = qaCheck(html, brief);
    if (!qa.pass) {
      onStep('Fixing what the quality check found');
      const list = qa.failed.map(c => `- ${c.label}${c.detail ? ` (${c.detail})` : ''}`).join('\n');
      try { const r2 = await generate(brief, { env, client, extra: `Your previous attempt failed these required checks:\n${list}\nBuild the whole page again so that every one passes. Here is the previous attempt to improve on:\n${html.slice(0, 60000)}` }); usage = { input: usage.input + r2.usage.input, output: usage.output + r2.usage.output }; const fixed = autofix(r2.html, brief), qa2 = qaCheck(fixed, brief); if (qa2.pass || qa2.failed.length < qa.failed.length) { html = fixed; qa = qa2; } } catch (e) { note = `The repair pass failed: ${e.message}`; }
    }
    if (!qa.pass) { const t = autofix(templateSite(brief), brief); const qt = qaCheck(t, brief); if (qt.pass) { html = t; model = 'template'; note = (note ? note + ' ' : '') + 'Claude\'s page did not pass the quality check, so the standard template was used.'; qa = qt; } }
    return { html, qa, usage, model, note };
  }
  onStep('Building from the template (Claude is not connected)');
  html = autofix(templateSite(brief), brief); return { html, qa: qaCheck(html, brief), usage, model, note: 'Claude is not connected, so this uses the standard template.' };
}

// ---------- the studio: change a page that already exists, one instruction at a time ----------
export const EDIT_RULES = `You are revising a prototype website that already exists, for a Future Basics teammate who is shaping it step by step. Return the COMPLETE updated HTML document (<!doctype html> to </html>) and nothing else: no explanation, no code fence.

Make the change that was asked for and only that. Keep every other section, sentence, class, script and style exactly as it is, so the page does not drift from one version to the next. The standard above still holds for the whole page after your change: keep the tap-to-call links and the sticky call bar, the reduced-motion handling, the structured data, the skip link and the "Prototype by Future Basics" footer line. Facts come only from the brief; anything new that the brief does not give you (sample reviews, prices, counts, areas, hours) is marked data-illustrative with a visible "Sample" tag.

If the request would break the standard (removing the phone number or the footer credit, adding an outside script, a form that sends data somewhere, text that cannot be read), do the closest version that keeps the standard. If the request is about a part of the page that does not exist, add it where it belongs.`;

export function editPrompt(html, instruction, brief, history = []) {
  const b = { ...brief }; delete b.problems;
  const past = history.length ? `\n\nEarlier changes already made in this session (for context, do not redo them):\n${history.map(h => `- ${clip(h.instruction, 200)}`).join('\n')}` : '';
  return `BRIEF (JSON), the only source of facts:\n${JSON.stringify(b, null, 1)}${past}\n\nTHE CURRENT PAGE:\n${html}\n\nTHE CHANGE TO MAKE:\n${clip(instruction, 1200)}\n\nReturn the complete updated page.`;
}

// → { html, usage, model, stop }. Same streaming as the first build, with the current page in the prompt.
export async function editWithClaude(html, instruction, brief, { env = process.env, client = null, history = [], extra = '', effort = 'medium', maxTokens = 48000 } = {}) {
  if (!env.ANTHROPIC_API_KEY && !client) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
  const c = client || new Anthropic(), model = PROTO_MODEL(env);
  const stream = c.messages.stream({ model, max_tokens: maxTokens, system: `${STANDARD}\n\n${EDIT_RULES}`, output_config: { effort }, messages: [{ role: 'user', content: editPrompt(html, instruction, brief, history) + (extra ? `\n\n${extra}` : '') }] });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to make this change');
  if (msg.stop_reason === 'max_tokens') throw new Error('The page is too long to change in one go: ask for something smaller');
  const text = msg.content.filter(x => x.type === 'text').map(x => x.text).join('');
  const out = extractHtml(text); if (!out) throw new Error('Claude did not send back a web page');
  return { html: out, usage: { input: msg.usage?.input_tokens || 0, output: msg.usage?.output_tokens || 0 }, model, stop: msg.stop_reason };
}

// What a change did, in words a person can scan: headings added and removed, and the size.
export function changeSummary(before, after) {
  const heads = h => [...String(h || '').matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map(m => clip(m[1].replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'), 70)).filter(Boolean);
  const a = heads(before), b = heads(after), count = (arr, x) => arr.filter(y => y === x).length;
  const added = [...new Set(b.filter(x => count(b, x) > count(a, x)))].slice(0, 8), removed = [...new Set(a.filter(x => count(a, x) > count(b, x)))].slice(0, 8);
  const kb = t => Math.round(Buffer.byteLength(String(t || '')) / 102.4) / 10;
  return { added, removed, sizeKB: kb(after), deltaKB: Math.round((kb(after) - kb(before)) * 10) / 10, same: String(before || '') === String(after || '') };
}

// Ask Claude for the change, fix what is always safe to fix, check it against the standard; one repair pass. A change that makes the page worse than it was is not applied.
export async function editPrototype(html, instruction, brief = {}, { env = process.env, client = null, onStep = () => {}, generate = editWithClaude, history = [] } = {}) {
  if (!protoAiReady(env) && !client) throw new Error('Changing a page needs Claude connected (the service needs ANTHROPIC_API_KEY)');
  const base = qaCheck(html, brief);
  onStep('Making the change with Claude');
  const r = await generate(html, instruction, brief, { env, client, history }); let usage = { ...r.usage }, out = autofix(r.html, brief), qa = qaCheck(out, brief);
  const worseOf = q => q.failed.filter(c => !base.failed.some(b => b.id === c.id));
  if (worseOf(qa).length) {
    onStep('Fixing what the quality check found');
    const list = worseOf(qa).map(c => `- ${c.label}${c.detail ? ` (${c.detail})` : ''}`).join('\n');
    try {
      const r2 = await generate(html, instruction, brief, { env, client, history, extra: `Your previous attempt at this change failed these required checks:\n${list}\nMake the same change again so that every one passes.` });
      usage = { input: usage.input + r2.usage.input, output: usage.output + r2.usage.output }; const fixed = autofix(r2.html, brief), q2 = qaCheck(fixed, brief); if (worseOf(q2).length <= worseOf(qa).length) { out = fixed; qa = q2; }
    } catch { /* keep the first attempt and judge it below */ }
  }
  if (out.length < html.length * 0.4) throw new Error('Claude sent back a much shorter page than the one it was given, so nothing was changed. Try asking for it differently.');
  const worse = worseOf(qa);
  if (worse.length) throw new Error(`The change would break the quality check (${worse.slice(0, 3).map(c => c.label).join('; ')}), so nothing was changed. Try wording it differently.`);
  return { html: out, qa, usage, model: r.model, note: '' };
}

// Journeys only (PROTOTYPE_TEST_EDIT): a change that adds the instruction as a section, so the studio can be exercised without Claude.
export async function stubEdit(html, instruction, brief = {}, { onStep = () => {} } = {}) {
  onStep('Making the change (test)');
  await new Promise(r => setTimeout(r, Number(process.env.PROTOTYPE_TEST_EDIT_MS || 0)));
  if (/^FAIL/i.test(instruction)) throw new Error('The change would break the quality check (test), so nothing was changed.');
  const out = autofix(html.replace(/<\/main>/i, `<section data-edit="1"><h2>${esc(clip(instruction, 160))}</h2><p>Added in the studio.</p></section></main>`), brief);
  return { html: out, qa: qaCheck(out, brief), usage: { input: 10, output: 20 }, model: 'test', note: '' };
}

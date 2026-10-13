// /brand: Spot's logos, mascot, colors and fonts, for the team only.
//
// Staff (signed in with a confirmed company email, staff.js) see the page
// and can download every file. Signed out → sign in first. Anyone else → 404,
// so the page doesn't say it exists.
//
//   GET /brand               the page
//   GET /brand/files/:name   one file, as a download
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { sessionUserId } from './accounts.js';
import { isStaff } from './staff.js';
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TYPES = { svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', gif: 'image/gif', woff2: 'font/woff2' };

// Every downloadable file: name → [where it is, what it's for].
const require = createRequire(import.meta.url);
const font = (pkg, file) => require.resolve(`${pkg}/files/${file}`);
export const BRAND_FILES = {
  // Logo
  'spot-logo.svg': ['../brand/spot-logo.svg', 'The mark, vector. Use this wherever you can.'],
  'spot-logo-1200.png': ['../brand/spot-logo-1200.png', 'The mark on cream, 1200 px.'],
  'spot-logo-1024-transparent.png': ['../brand/spot-logo-1024-transparent.png', 'The mark, transparent, 1024 px.'],
  'spot-app-icon-512.png': ['../brand/spot-app-icon-512.png', 'App and home-screen icon, 512 px.'],
  // Mascot
  'spot-hi.webp': ['../assets/spot-hi.webp', 'Waving hello. Greetings, empty states.'],
  'spot-yay.webp': ['../assets/spot-yay.webp', 'Celebrating. Paid, ordered, done.'],
  'spot-oh.webp': ['../assets/spot-oh.webp', 'Surprised. Errors and “hmm” moments.'],
  'spot-sleep.webp': ['../assets/spot-sleep.webp', 'Asleep. Expired, quiet, nothing yet.'],
  'spot-peek.webp': ['../assets/spot-peek.webp', 'Peeking over an edge. Pair with spot-paws.'],
  'spot-paws.webp': ['../assets/spot-paws.webp', 'Paws only, to sit in front of a card.'],
  'spot-face.webp': ['../assets/spot-face.webp', 'Face only. The live logo.'],
  'spot-face-blink.webp': ['../assets/spot-face-blink.webp', 'Face, blinking. The logo’s second frame.'],
  'spot-ask.png': ['../assets/card/spot-ask.png', 'Share card: asking.'],
  'spot-yay.png': ['../assets/card/spot-yay.png', 'Share card: covered.'],
  'email-spot.gif': ['../assets/email-spot.gif', 'Waving, hopping, cheering. Top of every email.'],
  // Link previews
  'og-site.jpg': ['../assets/og-site.jpg', 'Link preview for the site, 1200×630.'],
  'og-early.jpg': ['../assets/og-early.jpg', 'Link preview for early access, 1200×630.'],
  // Fonts
  'bricolage-grotesque-400.woff2': [font('@fontsource/bricolage-grotesque', 'bricolage-grotesque-latin-400-normal.woff2'), 'Bricolage Grotesque Regular'],
  'bricolage-grotesque-600.woff2': [font('@fontsource/bricolage-grotesque', 'bricolage-grotesque-latin-600-normal.woff2'), 'Bricolage Grotesque SemiBold'],
  'bricolage-grotesque-800.woff2': [font('@fontsource/bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff2'), 'Bricolage Grotesque ExtraBold'],
  'caveat-700.woff2': [font('@fontsource/caveat', 'caveat-latin-700-normal.woff2'), 'Caveat Bold'],
};

// Read once; a missing file is left out (and logged), never a crash at start.
const files = Object.fromEntries(
  Object.entries(BRAND_FILES).flatMap(([name, [path]]) => {
    try {
      const body = readFileSync(path.startsWith('/') ? path : new URL(path, import.meta.url));
      return [[name, { body, type: TYPES[name.split('.').pop()] }]];
    } catch (err) {
      console.error(`brand file missing: ${name} (${err.code || err.message})`);
      return [];
    }
  }),
);
const kb = (name) => (files[name] ? `${Math.max(1, Math.round(files[name].body.length / 1024))} KB` : 'missing');

const COLORS = [
  ['Spot orange', '--spot', '#ff5a36', '#ff6a47', 'The brand. Buttons, the mark, the one thing to tap.'],
  ['Ink', '--ink', '#1b1712', '#f4efe8', 'Text. Never pure black.'],
  ['Cream', '--bg', '#fbf7f1', '#141210', 'The page.'],
  ['Cream 2', '--bg2', '#f4ece1', '#1b1814', 'Wells, inputs, quiet panels.'],
  ['Card', '--card', '#ffffff', '#1f1b17', 'Cards and chat bubbles.'],
  ['Muted', '--muted', '#6f675c', '#a79e92', 'Secondary text.'],
  ['Line', '--line', '#e8e0d4', '#322d27', 'Borders and dividers.'],
  ['Sunny', '--spot2', '#ffb347', '#ffb347', 'Spot’s second warm color. Highlights, confetti.'],
  ['Your AI', '--ai', '#5b5bd6', '#9a98ff', 'The one cool accent: your AI’s side of things.'],
  ['OK green', '--ok', '#1d8a52', '#1d8a52', 'Paid, verified, done.'],
  ['Night', '--night', '#16130f', '#0e0c0a', 'Dark panels on the light site.'],
];

const CSS = `
.brandpg{padding:48px 0 96px}.brandpg .wrap{max-width:1040px}
.brandpg h1{font-size:clamp(40px,6vw,64px);letter-spacing:-.04em;margin:6px 0 8px}
.brandpg h2{font-size:28px;letter-spacing:-.02em;margin:56px 0 6px}
.brandpg .sub{color:var(--muted);margin:0 0 20px;max-width:640px}
.bgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.bitem{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column}
.bitem .pv{aspect-ratio:4/3;display:grid;place-items:center;background:var(--bg2);padding:16px}
.bitem .pv.dark{background:var(--night)}
.bitem .pv img{max-width:100%;max-height:100%;object-fit:contain}
.bitem .meta{padding:12px 14px 14px;display:flex;flex-direction:column;gap:4px;flex:1}
.bitem b{font-size:15px;word-break:break-all}
.bitem small{color:var(--muted);font-size:13px;line-height:1.4;flex:1}
.bitem a.dl{align-self:flex-start;margin-top:8px;font-weight:700;font-size:14px;color:var(--spot);text-decoration:none}
.bitem a.dl:hover{text-decoration:underline}
.swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.sw{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.sw .chips{display:grid;grid-template-columns:1fr 1fr;height:84px}
.sw .chips span{display:flex;align-items:flex-end;padding:8px 10px;font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace}
.sw .meta{padding:12px 14px}
.sw b{display:block}.sw small{color:var(--muted);font-size:13px;line-height:1.4;display:block;margin-top:4px}
.sw code{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
.copy{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer}
.copy:hover{text-decoration:underline}
.fonts{display:grid;gap:14px}
.fontc{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px 24px}
.fontc .spec{font-size:clamp(34px,5vw,56px);line-height:1.05;letter-spacing:-.03em;margin:8px 0 14px;overflow-wrap:anywhere}
.fontc .row{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;color:var(--muted);font-size:14px}
.fontc .row a{color:var(--spot);font-weight:700;text-decoration:none}
.weights{display:flex;flex-wrap:wrap;gap:6px 22px;margin:0 0 12px;font-size:20px}
.rules{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:0;padding:0;list-style:none}
.rules li{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;line-height:1.5}
.rules li b{display:block;margin-bottom:4px}
.toc{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}
.toc a{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);text-decoration:none;color:var(--ink);font-weight:600;font-size:14px}
@font-face{font-family:Hand;src:url(/fonts/caveat-700.woff2) format('woff2');font-weight:700;font-display:swap}
`;

function item(name, { dark = false, preview = true } = {}) {
  const [, about] = BRAND_FILES[name];
  const img = preview && files[name] && !name.endsWith('.woff2') ? `<img src="/brand/files/${esc(name)}?view=1" alt="${esc(about)}" loading="lazy">` : '';
  return `<div class="bitem"><div class="pv${dark ? ' dark' : ''}">${img}</div><div class="meta"><b>${esc(name)}</b><small>${esc(about)}</small><a class="dl" href="/brand/files/${esc(name)}" download>Download · ${kb(name)}</a></div></div>`;
}

export function brandPage({ origin }) {
  const swatch = ([label, token, light, dark, use]) => `<div class="sw"><div class="chips"><span style="background:${light};color:${pick(light)}"><button class="copy" data-copy="${light}">${light}</button></span><span style="background:${dark};color:${pick(dark)}"><button class="copy" data-copy="${dark}">${dark}</button></span></div><div class="meta"><b>${esc(label)}</b><code>var(${token})</code> · light / dark<small>${esc(use)}</small></div></div>`;
  return `${siteHead({ title: 'Brand · Spot', desc: 'Spot’s logos, mascot, colors and fonts', origin, path: '/brand', extraCss: CSS }).replace('<head>', '<head><meta name="robots" content="noindex">')}
${siteNav()}
<main class="brandpg"><div class="wrap">
<p class="kicker">Spot team only</p>
<h1>Spot’s brand</h1>
<p class="sub">Logos, the mascot, colors and fonts. Everything here is what the app and site use today. Don’t share this page outside The Future Basics; send the files instead.</p>
<nav class="toc"><a href="#logo">Logo</a><a href="#mascot">Mascot</a><a href="#color">Color</a><a href="#type">Type</a><a href="#previews">Link previews</a><a href="#rules">Rules</a></nav>

<h2 id="logo">Logo</h2>
<p class="sub">The mark is Spot’s face: an orange circle with two eyes and a smile. On the site it’s the 3D plush’s face, and it blinks. Keep clear space of half the mark’s width around it, and never stretch, outline or recolor it.</p>
<div class="bgrid">${item('spot-logo.svg')}${item('spot-logo.svg', { dark: true }).replace('<b>spot-logo.svg</b>', '<b>spot-logo.svg <small style="display:inline">on dark</small></b>')}${item('spot-logo-1200.png')}${item('spot-logo-1024-transparent.png', { dark: true })}${item('spot-app-icon-512.png')}</div>

<h2 id="mascot">Mascot</h2>
<p class="sub">Spot is a small orange plush who wants to help. Pick the pose that matches the moment, one Spot per screen, and let him be the only character.</p>
<div class="bgrid">${['spot-hi.webp', 'spot-yay.webp', 'spot-oh.webp', 'spot-sleep.webp', 'spot-peek.webp', 'spot-paws.webp', 'spot-face.webp', 'spot-face-blink.webp', 'spot-ask.png', 'spot-yay.png', 'email-spot.gif'].map((n) => item(n)).join('')}</div>

<h2 id="color">Color</h2>
<p class="sub">Warm cream and ink, with Spot orange for the one thing to tap. Each color has a light and a dark value; tap a value to copy it.</p>
<div class="swatches">${COLORS.map(swatch).join('')}</div>

<h2 id="type">Type</h2>
<p class="sub">Two fonts, both free under the SIL Open Font License.</p>
<div class="fonts">
<div class="fontc"><b>Bricolage Grotesque</b> · headlines and everything else
<div class="spec" style="font-weight:800">Your AI shops. You say yes.</div>
<div class="weights"><span style="font-weight:400">Regular 400</span><span style="font-weight:600">SemiBold 600</span><span style="font-weight:800">ExtraBold 800</span></div>
<div class="row"><span>Headlines 800, tight tracking (−0.04em). Body 400 at 17px / 1.55. Buttons 800.</span></div>
<div class="row" style="margin-top:10px"><a href="/brand/files/bricolage-grotesque-400.woff2" download>400.woff2</a><a href="/brand/files/bricolage-grotesque-600.woff2" download>600.woff2</a><a href="/brand/files/bricolage-grotesque-800.woff2" download>800.woff2</a><a href="https://fonts.google.com/specimen/Bricolage+Grotesque" target="_blank" rel="noopener">Install for desktop (Google Fonts) ↗</a></div></div>
<div class="fontc"><b>Caveat</b> · Spot’s handwriting, small doses only
<div class="spec" style="font-family:Hand,cursive;font-weight:700;letter-spacing:0">bye! go ask for the thing.</div>
<div class="row"><span>Bold 700. Asides, notes and hand-drawn labels, never body copy or buttons.</span></div>
<div class="row" style="margin-top:10px"><a href="/brand/files/caveat-700.woff2" download>700.woff2</a><a href="https://fonts.google.com/specimen/Caveat" target="_blank" rel="noopener">Install for desktop (Google Fonts) ↗</a></div></div>
</div>

<h2 id="previews">Link previews</h2>
<p class="sub">What shows when a Spot link is pasted into iMessage, WhatsApp, Slack or X.</p>
<div class="bgrid">${item('og-site.jpg')}${item('og-early.jpg')}</div>

<h2 id="rules">Rules</h2>
<ul class="rules">
<li><b>Say it plainly</b>Short words, short sentences. “Spot pays the store”, not “Spot facilitates settlement”.</li>
<li><b>Lowercase when Spot talks</b>Spot’s own chat bubbles are casual and lowercase (“hey 👋”, “ready! who should I ask?”). Headlines and UI are sentence case.</li>
<li><b>One orange thing</b>Spot orange marks the one action on a screen. Everything else is ink, cream and muted.</li>
<li><b>Names</b>Spot (the app and the mascot), a Spot (one ask), Shop, Discover, Kid Spot, Price Shield. Never “SPOT”.</li>
</ul>
</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}})();
document.addEventListener('click',async e=>{const b=e.target.closest('[data-copy]');if(!b)return;try{await navigator.clipboard.writeText(b.dataset.copy);const t=b.textContent;b.textContent='copied';setTimeout(()=>{b.textContent=t},1200)}catch{}});</script>
</body></html>`;
}

// Readable text on a swatch.
function pick(hex) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.6 ? '#1b1712' : '#ffffff';
}

export function registerBrand(app, { db, env, urlFor }) {
  // undefined: signed out (sign in first); false: signed in, not staff.
  const who = (req) => {
    const uid = sessionUserId(db, req);
    return uid ? isStaff(db, env, uid) : undefined;
  };
  const deny = (req, reply, ok) => {
    reply.header('cache-control', 'no-store');
    if (ok === undefined) return reply.redirect(`/signin?next=${encodeURIComponent(req.url.split('?')[0])}`, 302);
    return reply.code(404).type('text/plain; charset=utf-8').send('Not found');
  };
  app.get('/brand', async (req, reply) => {
    const ok = who(req);
    if (!ok) return deny(req, reply, ok);
    return reply.header('cache-control', 'private, no-store').type('text/html; charset=utf-8').send(brandPage({ origin: urlFor(req, '') }));
  });
  app.get('/brand/files/:name', async (req, reply) => {
    const ok = who(req);
    if (!ok) return deny(req, reply, ok);
    const f = Object.hasOwn(files, req.params.name) ? files[req.params.name] : null;
    if (!f) return reply.code(404).send();
    reply.header('cache-control', 'private, max-age=3600').type(f.type);
    if (!req.query.view) reply.header('content-disposition', `attachment; filename="${req.params.name}"`);
    return reply.send(f.body);
  });
}

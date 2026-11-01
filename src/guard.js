// Keeping the Design Lab's own work to the people it is open to, and the app out of search engines and AI crawlers.
//
// The Lab's pages, its engines (the pattern, footwear, 3D assembly, recipe and fabric code under /lab/*.js) and its drawings (the sketch
// pack, masks, parts, material photos) used to be served to anyone who asked: the data behind them needed a sign-in, the code did not.
// Now every GET under /lab needs a Lab session cookie. The cookie is handed out by GET /v1/lab/door, which runs the same checks as
// every Lab API call (a valid sign-in, a staff member with the Design Lab module, or a client whose room has the Lab open) and sets a
// short-lived, HttpOnly cookie scoped to /lab. A browser that is signed in but has no cookie yet (an old session, a token set by the
// hub) gets a small door page that asks for one with its saved sign-in and reloads; someone who is not signed in, or whose room does
// not have the Lab, gets the same messages the Lab itself gives. Scripts and pictures asked for without the cookie get a 401.
//
// What stays open: share and poll links (/lab/share/:token, /lab/poll/:token: their own token is the key), the small nav script the tech
// pack page uses (/lab/nav.js) and the open-source vendor files (/lab/vendor/*). Everything the Lab sends is marked private, so a cache
// in front of the app (Cloudflare) never hands it to someone else.
//
// robots.txt lets search engines see only the public pages (sign-in, pricing, start, help, join) and turns AI crawlers away from all of
// it; every other response says noindex. That only stops crawlers that obey it; the cookie is what actually keeps the Lab closed.
import { SignJWT, jwtVerify } from 'jose';

export const LAB_COOKIE = 'fb_lab';
const AUD = 'lab-pages', ISS = 'future-basics-client-hub', HOURS = 12;
const PUBLIC = /^\/lab\/(?:share|poll)\/|^\/lab\/nav\.js$|^\/lab\/vendor\//;
const isLab = p => p === '/lab' || p.startsWith('/lab/');
export const labGuarded = p => isLab(p) && !PUBLIC.test(p);
// a page is a path without a file extension (/lab, /lab/studio, /lab/engineering/benchmark); anything else is a script or a picture
const isPage = p => !/\.[a-z0-9]{1,5}$/i.test(p.split('/').pop() || '');
// the pages a search engine may list; everything else is the app
const INDEXABLE = new Set(['/', '/pricing', '/start', '/help', '/join']);
// crawlers that gather pages for AI models: none of them may read anything here
export const AI_CRAWLERS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'CCBot', 'Google-Extended', 'PerplexityBot', 'Perplexity-User', 'Bytespider', 'Applebot-Extended', 'meta-externalagent', 'FacebookBot', 'Diffbot', 'cohere-ai', 'Omgilibot', 'ImagesiftBot', 'Timpibot', 'YouBot', 'Amazonbot'];
export function robotsTxt() {
  return [...AI_CRAWLERS.map(a => `User-agent: ${a}\nDisallow: /\n`),
    `User-agent: *\n${[...INDEXABLE].filter(p => p !== '/').map(p => `Allow: ${p}$`).join('\n')}\nAllow: /$\nDisallow: /\n`].join('\n');
}
const cookieOf = (req, name) => { for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); } return ''; };
const secureReq = req => req.protocol === 'https' || /^https/i.test(String(req.headers['x-forwarded-proto'] || ''));

export function registerGuard(app, { secret, authenticate, labGate }) {
  async function session(req) {
    const t = cookieOf(req, LAB_COOKIE); if (!t) return null;
    try { return (await jwtVerify(t, secret, { issuer: ISS, audience: AUD })).payload; } catch { return null; }
  }
  // the Lab session: the same checks as any Lab API call, then a cookie the pages and their scripts can travel on
  app.get('/v1/lab/door', { preHandler: [authenticate, labGate] }, async (req, reply) => {
    const a = req.auth || {};
    const token = await new SignJWT({ role: a.role, ...(a.clientId ? { clientId: a.clientId } : {}) }).setProtectedHeader({ alg: 'HS256' }).setSubject(String(a.sub || ''))
      .setIssuer(ISS).setAudience(AUD).setIssuedAt().setExpirationTime(`${HOURS}h`).sign(secret);
    reply.header('set-cookie', `${LAB_COOKIE}=${token}; Path=/lab; Max-Age=${HOURS * 3600}; HttpOnly; SameSite=Lax${secureReq(req) ? '; Secure' : ''}`).header('cache-control', 'no-store');
    return { ok: true, hours: HOURS };
  });
  app.get('/robots.txt', (_req, reply) => reply.header('cache-control', 'public, max-age=3600').type('text/plain; charset=utf-8').send(robotsTxt()));
  app.addHook('onRequest', async (req, reply) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return;
    const p = String(req.url || '').split('?')[0];
    if (!labGuarded(p)) return;
    if (await session(req)) { req.labPage = true; return; }
    reply.header('cache-control', 'no-store').header('x-robots-tag', 'noindex, nofollow');
    if (!isPage(p)) return reply.code(401).type('text/plain; charset=utf-8').send('Sign in to the Design Lab first');
    return reply.code(200).type('text/html; charset=utf-8').send(DOOR);
  });
  app.addHook('onSend', async (req, reply, payload) => {
    const p = String(req.url || '').split('?')[0];
    if (req.labPage) { const cc = String(reply.getHeader('cache-control') || '').replace(/\bpublic\b/g, 'private'); reply.header('cache-control', /\b(private|no-store)\b/.test(cc) ? cc : `private${cc ? ', ' + cc : ', no-cache'}`); }
    if (!INDEXABLE.has(p) && !reply.getHeader('x-robots-tag')) reply.header('x-robots-tag', 'noindex, nofollow, noarchive');
    return payload;
  });
}

// The door: the same look and words as the Lab's own sign-in notice. It asks for the Lab session with the sign-in this browser already
// has, and reloads once; it never loops (a second try in a few seconds shows the notice instead).
const DOOR = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Design Lab · Future Basics</title><link rel="stylesheet" href="/cue.css">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--fog,#f5f5f2);font:400 15px/1.5 'Space Grotesk',system-ui,sans-serif;color:#141416}
.box{max-width:440px;margin:24px;padding:28px;border:1px solid rgba(20,20,22,.14);border-radius:22px;background:#fff}.box h1{font:300 30px/1.1 'Space Grotesk',system-ui,sans-serif;letter-spacing:-.02em;margin:0 0 10px}
.note{color:#5b5e66;margin:0 0 16px}.row{display:flex;gap:8px;flex-wrap:wrap}.row a{border:1px solid #141416;border-radius:999px;padding:9px 16px;text-decoration:none;color:#141416;font-weight:600;min-height:36px;box-sizing:border-box}.row a.go{background:#141416;color:#fff}
.wait{color:#5b5e66}.hidden{display:none}</style></head><body><main class="box" id="needSignin" aria-live="polite"><h1>Opening the Design Lab…</h1><p class="note wait">Checking your sign-in.</p><div class="row hidden"></div></main>
<script>(async()=>{const box=document.getElementById('needSignin'),h=box.querySelector('h1'),n=box.querySelector('.note'),row=box.querySelector('.row');
const say=(t,m,links)=>{h.textContent=t;n.textContent=m;n.classList.remove('wait');row.innerHTML=links.map(([l,u,go])=>'<a href="'+u+'"'+(go?' class="go"':'')+'>'+l+'</a>').join('');row.classList.remove('hidden')};
const signin=()=>say('Sign in first','Future Basics signs in at the work console. A client whose room has the Design Lab signs in at their hub, then comes back here.',[['Your hub','/',true],['Work console','/admin']]);
let t='';try{t=localStorage.getItem('fb.admin.token')||localStorage.getItem('fb.client.token')||''}catch{}
if(!t)return signin();
let tried=0;try{tried=Number(sessionStorage.getItem('fb.lab.door')||0)}catch{}
if(Date.now()-tried<8000)return say('The Design Lab did not open','This browser did not keep the Lab session. Allow cookies for this site, then try again.',[['Try again',location.href,true]]);
let r,j={};try{r=await fetch('/v1/lab/door',{headers:{Authorization:'Bearer '+t},credentials:'same-origin'});j=await r.json().catch(()=>({}))}catch{return say('The Design Lab did not open','The connection dropped. Try again in a moment.',[['Try again',location.href,true]])}
if(r.ok){try{sessionStorage.setItem('fb.lab.door',String(Date.now()))}catch{}location.reload();return}
if(j.code==='LAB_LOCKED')return say('The Design Lab is not open on your room yet','Open it from the Design Lab card in your hub: a fixed price for the period, with AI generations included.',[['Your hub','/#lab',true]]);
if(r.status===403)return say('The Design Lab is not turned on for you','It is for Danielle and Kyle. If you need it, ask one of them to tick Design Lab for you on Team access.',[['Work console','/home',true]]);
signin()})()</script></body></html>`;

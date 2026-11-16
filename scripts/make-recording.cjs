// The Make page's screen recording (thefuturebasics.com/pages/make, "see it work"): the Design Lab used for real, with a cursor you can see
// and a caption for each step. A hoodie from the recipe menu, a chest pocket and a vintage wash, a colour system, opened in the Studio as
// measured flats (front, then back), its pattern drafted, exploded and laid out on the cloth; then a pocket tee drawn with the brush on a blank
// page over its outline, filled and topstitched. Frames come from the browser's own screencast as they are drawn, so the video runs at the
// Lab's real speed; only the drawing is sped up (1.7x).
//
//   node scripts/make-recording.cjs --base http://127.0.0.1:3300 --token <a client token whose room has the Design Lab> [--out dir] [--video file]
//
// Writes the video (H.264, 1440 x 900, default <tmp>/make-lab-session.mp4: it goes to Shopify Files, not the repository) and, in <out>
// (default src/help-assets), make-lab-session-poster.webp and make-way-scratch.webp (the drawing,
// for the "draw it yourself" card); the two stills are served at hub.thefuturebasics.com/help/assets/. Needs ffmpeg with libx264. Take it in a
// demo room with made-up pieces, never a client's, at 1440 x 900: the strokes are drawn over the Studio's own guide at that size.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const sharp = require('sharp'); const os = require('os'); const { join } = require('path');
const arg = (k, d = '') => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const B = arg('base'), T = arg('token') || process.env.WALK_TOKEN, DEST = arg('out', join(__dirname, '..', 'src', 'help-assets'));
if (!B || !T) { console.error('usage: node scripts/make-recording.cjs --base <server> --token <client token with the Design Lab> [--out dir] [--video file]'); process.exit(2); }
const OUT = fs.mkdtempSync(join(os.tmpdir(), 'fb-rec-'));
// hand-drawn strokes for the Studio: bezier paths sampled to points with a little wobble, drawn with the mouse
const cub = (a, c1, c2, b, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u*u*u*a[0] + 3*u*u*t*c1[0] + 3*u*t*t*c2[0] + t*t*t*b[0], u*u*u*a[1] + 3*u*u*t*c1[1] + 3*u*t*t*c2[1] + t*t*t*b[1]]; });
const lin = (a, b, step = 6) => { const n = Math.max(2, Math.round(Math.hypot(b[0]-a[0], b[1]-a[1]) / step)); return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0]-a[0]) * i / n, a[1] + (b[1]-a[1]) * i / n]); };
const path = (...segs) => segs.flatMap((s, i) => i ? s.slice(1) : s);
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - .5);
const wob = (pts, a = .6) => pts.map(([x, y]) => [x + rnd() * a, y + rnd() * a]);
const mir = (pts, cx = 581) => pts.map(([x, y]) => [2 * cx - x, y]);
async function stroke(p, pts, { delay = 6 } = {}) {
  await p.mouse.move(pts[0][0], pts[0][1]); await p.mouse.down();
  for (const [x, y] of pts.slice(1)) { await p.mouse.move(x, y); if (delay) await p.waitForTimeout(delay); }
  await p.mouse.up(); await p.waitForTimeout(120);
}
const setRange = (p, i, v) => p.evaluate(([i, v]) => { const r = [...document.querySelectorAll('input[type=range]')].filter(e => e.getBoundingClientRect().width > 0)[i]; const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(r, v); r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); }, [i, v]);
const setColour = (p, hex) => p.evaluate(h => { const c = document.querySelector('#curPicker'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(c, h); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('change', { bubbles: true })); }, hex);
// the tee over the Studio's guide (screen px at 1440×900, the page fit)
const TEE = {
  silhouette: path(lin([523,309],[427,328]), lin([427,328],[322,424]), lin([322,424],[406,510]), lin([406,510],[409,793]), lin([409,793],[753,793]), lin([753,793],[756,510]), lin([756,510],[840,424]), lin([840,424],[735,328]), lin([735,328],[639,309]), cub([639,309],[634,340],[606,352],[581,352]), cub([581,352],[556,352],[528,340],[523,309])),
  rib: cub([516,309],[519,352],[552,367],[581,367]).concat(cub([581,367],[610,367],[643,352],[646,309]).slice(1)),
  armL: cub([427,328],[424,400],[421,458],[409,482]),
  stitchSleeveL: lin([332,415],[413,498]), stitchHem: lin([413,780],[749,780]),
  pocket: path(lin([640,404],[690,404]), lin([690,404],[690,448]), cub([690,448],[690,456],[684,460],[665,463]), cub([665,463],[646,460],[640,456],[640,448]), lin([640,448],[640,404])),
};

const OVERLAY = () => {
  const make = () => {
    if (document.getElementById('__cur')) return;
    const st = document.createElement('style'); st.textContent = `#__cur{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:26px;height:30px;transform:translate(var(--x),var(--y));will-change:transform}
#__cur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}#__rip{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(75,255,154,.45);border:2px solid #17603a;opacity:0;transform:scale(.3)}
#__rip.go{animation:__r .5s ease-out}@keyframes __r{0%{opacity:.9;transform:scale(.3)}100%{opacity:0;transform:scale(1.25)}}
#__cap{position:fixed;left:50%;bottom:28px;z-index:2147483645;pointer-events:none;transform:translateX(-50%);background:#141416;color:#fff;font:600 19px/1.3 "Space Grotesk",Inter,Helvetica,Arial,sans-serif;letter-spacing:.01em;padding:12px 22px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.25);transition:opacity .35s;opacity:0;white-space:nowrap}
#__cap b{color:#4bff9a;font-weight:600;margin-right:10px}`;
    document.documentElement.appendChild(st);
    const c = document.createElement('div'); c.id = '__cur'; c.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2l0 22 6-5.5 4 9 4-1.8-4-8.7 8.2-.4z" fill="#141416" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = '__rip'; const cap = document.createElement('div'); cap.id = '__cap';
    document.documentElement.append(c, r, cap);
    let pos = [720, 450]; try { pos = JSON.parse(sessionStorage.getItem('__pos')) || pos; } catch {}
    c.style.setProperty('--x', pos[0] - 2 + 'px'); c.style.setProperty('--y', pos[1] - 2 + 'px');
    addEventListener('mousemove', e => { if (window.__glide) return; c.style.transition = 'none'; c.style.setProperty('--x', e.clientX - 2 + 'px'); c.style.setProperty('--y', e.clientY - 2 + 'px'); try { sessionStorage.setItem('__pos', JSON.stringify([e.clientX, e.clientY])); } catch {} }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', make); else make();
};
(async () => {
  fs.mkdirSync(OUT + '/f', { recursive: true });
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 / 3 });
  await ctx.addInitScript(t => { localStorage.setItem('fb.client.token', t); localStorage.setItem('fb.helper.on', '0'); }, T);
  await ctx.addInitScript(OVERLAY);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p); const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async f => { const file = `${OUT}/f/${String(n++).padStart(5, '0')}.jpg`; fs.writeFileSync(file, Buffer.from(f.data, 'base64')); frames.push([file, f.metadata.timestamp]); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  let at = [720, 450];
  const glide = async (x, y, ms = 650) => {
    await p.evaluate(([x, y, ms]) => { window.__glide = true; const c = document.getElementById('__cur'); if (!c) return; c.style.transition = `transform ${ms}ms cubic-bezier(.45,.05,.25,1)`; c.style.setProperty('--x', x - 2 + 'px'); c.style.setProperty('--y', y - 2 + 'px'); try { sessionStorage.setItem('__pos', JSON.stringify([x, y])); } catch {} }, [x, y, ms]);
    await p.mouse.move(x, y, { steps: 12 }); await p.waitForTimeout(ms + 40); await p.evaluate(() => { window.__glide = false; }); at = [x, y];
  };
  const ripple = () => p.evaluate(([x, y]) => { const r = document.getElementById('__rip'); if (!r) return; r.style.left = x + 'px'; r.style.top = y + 'px'; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go'); }, at);
  const centre = async loc => { await loc.scrollIntoViewIfNeeded(); const r = await loc.boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const find = async (sel, wait = 20000) => { const t0 = Date.now(); for (;;) { for (const f of p.frames()) { const l = f.locator(sel).first(); if (await l.count().catch(() => 0) && await l.isVisible().catch(() => false)) return l; } if (Date.now() - t0 > wait) throw new Error('nothing shows ' + sel); await p.waitForTimeout(250); } };
  const click = async (target, { ms = 650, pause = 250 } = {}) => { const loc = typeof target === 'string' ? await find(target) : target; const [x, y] = await centre(loc); await glide(x, y, ms); await p.waitForTimeout(pause); await ripple(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(350); };
  const hover = async (target, ms = 600) => { const loc = typeof target === 'string' ? await find(target) : target; const [x, y] = await centre(loc); await glide(x, y, ms); };
  const cap = (t, s = '') => p.evaluate(([t, s]) => { const c = document.getElementById('__cap'); if (!c) return; c.innerHTML = t ? (s ? `<b>${s}</b>` : '') + t : ''; c.style.opacity = t ? 1 : 0; }, [t, s]);
  const draw = async (pts, delay = 9) => { await glide(pts[0][0], pts[0][1], 450); await p.mouse.down(); for (const [x, y] of pts.slice(1)) { await p.mouse.move(x, y); await p.waitForTimeout(delay); } await p.mouse.up(); at = pts[pts.length - 1]; await p.waitForTimeout(150); };

  await p.goto(B + '/lab/recipe', { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1920, maxHeight: 1200, everyNthFrame: 1 });
  const t0 = Date.now(); const mark = []; const chap = s => mark.push([s, (Date.now() - t0) / 1000]);
  await cap('Pick a base from the recipe menu', '1'); chap('recipe');
  await hover('[data-base="tee"]', 800); await hover('[data-base="crewneck"]', 500); await click('[data-base="hoodie"]');
  await p.waitForTimeout(700); await cap('Add only what suits it', '2');
  await click('[data-addon="chest-pocket"]'); await click('[data-addon="wash-vintage"]'); await p.waitForTimeout(500);
  await cap('Pick a colour system', '3'); await click('[data-main="1"]'); await p.waitForTimeout(500);
  await click('#name'); await p.fill('#name', ''); await p.keyboard.type('Everyday hoodie', { delay: 55 }); await p.waitForTimeout(400);
  await cap('Open it in the Studio', '4');
  const open = await find('#open'); const [ox, oy] = await centre(open); await glide(ox, oy); await ripple();
  await Promise.all([p.waitForURL(/\/lab\/studio/, { timeout: 60000 }), p.mouse.down().then(() => p.mouse.up())]);
  await p.waitForLoadState('networkidle'); await find('text=Can be made as drawn', 30000); await p.waitForTimeout(800); chap('studio');
  await cap('Measured flats, checked as you go', '5'); await hover('text=Can be made as drawn', 900); await p.waitForTimeout(700);
  await click('button:has-text("Flat back"), a:has-text("Flat back")'); await p.waitForTimeout(1500);
  await click('button:has-text("Flat front"), a:has-text("Flat front")'); await p.waitForTimeout(1200);
  await cap('The pattern drafts itself, graded XS to XXL', '6'); await click('[data-step="pattern"]');
  await p.waitForLoadState('networkidle'); await find('text=Sews together', 40000); await p.waitForTimeout(1500); chap('pattern');
  await hover('text=Sews together', 900); await p.waitForTimeout(900);
  await click('button:has-text("Explode it")'); await p.waitForTimeout(2600);
  await cap('Every piece, laid out on the cloth', '7'); await click('button:has-text("Cutting layout")'); await p.waitForTimeout(3000);
  await cap(''); await p.waitForTimeout(300);
  // or draw it yourself
  await p.goto(B + '/lab/studio', { waitUntil: 'networkidle' }); chap('draw');
  await cap('Or start from a blank page', '8');
  await click('#scName'); await p.keyboard.type('Weekend pocket tee', { delay: 50 }); await p.selectOption('#scCat', 'tops');
  const go = await find('#scGo'); const [gx, gy] = await centre(go); await glide(gx, gy); await ripple();
  await Promise.all([p.waitForURL(/scratch=1/, { timeout: 30000 }), p.mouse.down().then(() => p.mouse.up())]);
  await p.waitForLoadState('networkidle'); await p.waitForTimeout(1500);
  await cap('Draw over the guide, at real size', '9');
  await click('[data-tool="brush"]'); await click('button:has-text("Ink pen")'); await setRange(p, 0, 5); await setColour(p, '#1b1b1d');
  await draw(wob(TEE.silhouette), 11); await draw(wob(TEE.rib)); await draw(wob(TEE.armL)); await draw(wob(mir(TEE.armL))); await draw(wob(TEE.pocket));
  await setRange(p, 0, 3); await draw(wob(cub([523,309],[548,322],[614,322],[639,309]), .3));
  await cap('Fill it, stitch it', '10');
  await click('[data-tool="fill"]'); await setColour(p, '#c9a97c');
  for (const pt of [[520, 600], [380, 440], [782, 440], [665, 430], [560, 360]]) { await glide(pt[0], pt[1], 380); await ripple(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(300); }
  await setColour(p, '#a8875c'); await glide(581, 330, 350); await ripple(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(300);
  await click('[data-tool="brush"]'); await click('button[title*="Even dashes"], button[aria-label*="Even dashes"]'); await setRange(p, 0, 7); await setColour(p, '#3a2c1c');
  await draw(wob(TEE.stitchSleeveL, .2)); await draw(wob(mir(TEE.stitchSleeveL), .2)); await draw(wob(TEE.stitchHem, .2), 6); await draw([[645,412],[665,412],[685,412]]);
  await p.waitForTimeout(600); await glide(1146, 315, 700); await ripple(); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500);
  await glide(700, 640, 600);
  // the drawing as a still, without the cursor, for the "draw it yourself" card
  await p.evaluate(() => { for (const id of ['__cur', '__cap']) document.getElementById(id).style.visibility = 'hidden'; });
  const still = await p.screenshot(); await p.evaluate(() => { for (const id of ['__cur', '__cap']) document.getElementById(id).style.visibility = ''; });
  // the drawing filling the card: the tool rail and the brush's size beside it, the page and the tee (from 150 px down, 933 × 700 px of the 1440 × 900 screen)
  await sharp(still).extract({ left: 0, top: 200, width: 1244, height: 933 }).resize(1200, 900).webp({ quality: 82 }).toFile(join(DEST, 'make-way-scratch.webp'));
  await cap('Its flats and pattern follow. Then a tech pack your factory signs off.'); await p.waitForTimeout(3200);
  await cdp.send('Page.stopScreencast'); await p.waitForTimeout(300);
  console.log('frames', frames.length, 'chapters', JSON.stringify(mark), 'errors', errs.slice(0, 3));
  // a constant-rate video from the frames as they came
  const list = frames.map(([f, t], i) => `file '${f}'\nduration ${Math.max(.001, ((frames[i + 1]?.[1] ?? t + 1.2) - t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1)[0]}'\n`;
  fs.writeFileSync(OUT + '/list.txt', list); await b.close();
  const raw = OUT + '/raw.mp4', mp4 = arg('video', join(os.tmpdir(), 'make-lab-session.mp4'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT + '/list.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18', raw]);
  // the drawing, from just after the blank page opens to the last caption, sped up
  const end = frames.at(-1)[1] - frames[0][1], d0 = mark.find(m => m[0] === 'draw')[1] + 1.5, d1 = end - 3.5;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-filter_complex',
    `[0:v]trim=0:${d0},setpts=PTS-STARTPTS[a];[0:v]trim=${d0}:${d1},setpts=(PTS-STARTPTS)/1.7[b];[0:v]trim=${d1},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1,fps=30,format=yuv420p[v]`,
    '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22', '-movflags', '+faststart', '-an', mp4]);
  const poster = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(mark.find(m => m[0] === 'pattern')[1] + 4), '-i', raw, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']);
  await sharp(poster).webp({ quality: 80 }).toFile(join(DEST, 'make-lab-session-poster.webp'));
  fs.rmSync(OUT, { recursive: true, force: true });
  console.log(`${mp4} (${Math.round(fs.statSync(mp4).size / 1024)} KB): upload it to Shopify Files as make-lab-session.mp4; the stills are in ${DEST}`);
})().catch(e => { console.error(e); process.exit(1); });

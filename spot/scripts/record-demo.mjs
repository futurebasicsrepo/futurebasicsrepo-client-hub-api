// Records the "Ask your AI. Finish on your phone." demo clip against a
// local Spot in demo mode (demo airline, sandbox payments), so it can be
// re-shot after any design change:
//
//   node scripts/record-demo.mjs [out-dir]     → out-dir/spot-flight-demo.webm
//
// For an MP4 (phones, social): ffmpeg -i spot-flight-demo.webm -c:v libx264
//   -pix_fmt yuv420p -crf 20 -movflags +faststart spot-flight-demo.mp4
//
// Scenes: 1) you ask your AI for a flight (real demo search results),
// 2) the text arrives on your lock screen, 3) the real Spot finish page,
// filled in and paid, 4) booked, then an end card.
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { buildApp } from '../src/server.js';
import { openDb } from '../src/db.js';
import { sandboxProvider } from '../src/providers.js';

const out = process.argv[2] || './demo-out';
mkdirSync(out, { recursive: true });
const W = 430;
const H = 932;
const PORT = 4610;

const app = buildApp({ db: openDb(':memory:'), provider: sandboxProvider(), logger: false, env: { SPOT_API_KEYS: 'demo:demo' } });
const H_AUTH = { authorization: 'Bearer demo' };
let found, pick, ask, finish, options, dateLabel;
// Scenes 1–2 and the end card: a small page driven by a timeline.
app.get('/demo', async (req, reply) => {
  reply.type('text/html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-800.woff2) format('woff2');font-weight:800}
*{box-sizing:border-box}body{margin:0;height:100vh;overflow:hidden;font-family:-apple-system,system-ui,sans-serif;background:#fbf7f1}
.cap{position:fixed;left:0;right:0;top:0;z-index:9;padding:18px 22px 14px;background:linear-gradient(#fbf7f1 70%,transparent);font:800 26px/1.1 Bricolage,system-ui;letter-spacing:-.03em;color:#1b1712}
.cap span{color:#ff5a36}
.scene{position:absolute;inset:0;opacity:0;transition:opacity .5s}.scene.on{opacity:1}
/* chat */
.chat{padding:92px 16px 16px;display:flex;flex-direction:column;gap:10px;height:100%}
.hdr{display:flex;align-items:center;gap:10px;padding:0 4px 8px;border-bottom:1px solid #eee7dc}
.av{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#ff5a36,#ffb347);display:grid;place-items:center;color:#fff;font-size:18px}
.hdr b{font-size:16px}.hdr small{display:block;color:#8a8175;font-size:12px}
.m{max-width:84%;padding:11px 14px;border-radius:20px;font-size:16px;line-height:1.35;opacity:0;transform:translateY(10px);transition:all .35s cubic-bezier(.2,.9,.3,1.2)}
.m.on{opacity:1;transform:none}
.me{align-self:flex-end;background:#0a84ff;color:#fff;border-bottom-right-radius:6px}
.ai{align-self:flex-start;background:#fff;border:1px solid #eee7dc;border-bottom-left-radius:6px;color:#1b1712}
.dots i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#bbb;margin:0 2px;animation:b 1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes b{0%,100%{transform:none}50%{transform:translateY(-4px)}}
.opts{display:grid;gap:8px;margin-top:8px}
.opt{display:grid;grid-template-columns:1fr auto;align-items:center;padding:10px 12px;border-radius:14px;border:1.5px solid #eee7dc;font-size:15px;background:#fbf7f1}
.opt b{font-size:16px}.opt small{color:#8a8175}.opt .p{font-weight:800;font-size:17px}
.opt.pick{border-color:#ff5a36;background:#fff4f0;box-shadow:0 0 0 3px rgba(255,90,54,.15)}
.typing{font-family:inherit}
/* lock screen */
.lock{background:radial-gradient(120% 80% at 30% 10%,#ff8a5c,#6b2fd6 55%,#1b1036);color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:120px}
.lock .time{font:300 88px/1 -apple-system,system-ui;letter-spacing:-2px}.lock .date{font-size:18px;opacity:.85;margin-top:6px}
.note{position:absolute;left:12px;right:12px;top:300px;background:rgba(255,255,255,.82);backdrop-filter:blur(18px);color:#111;border-radius:22px;padding:13px 14px;transform:translateY(-240px);opacity:0;transition:all .6s cubic-bezier(.2,.9,.3,1.1);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.note.on{transform:none;opacity:1}
.note .row{display:flex;align-items:center;gap:8px;font-size:13px;color:#555}.note .ic{width:22px;height:22px;border-radius:6px;background:#34c759;display:grid;place-items:center;color:#fff;font-size:13px}
.note b{display:block;font-size:15px;margin:6px 0 2px;color:#111}.note p{margin:0;font-size:15px;line-height:1.3}
.tap{position:absolute;width:54px;height:54px;border-radius:50%;background:rgba(255,255,255,.55);left:50%;top:360px;margin-left:-27px;transform:scale(0);opacity:0}
.tap.on{animation:t .6s ease-out forwards}@keyframes t{0%{transform:scale(.3);opacity:1}100%{transform:scale(1.6);opacity:0}}
/* end card */
.end{background:#ff5a36;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 34px}
.end .logo{display:flex;align-items:center;gap:10px;font:800 34px Bricolage,system-ui}.end .logo i{width:26px;height:26px;border-radius:50%;background:#fff}
.end h1{font:800 52px/1 Bricolage,system-ui;letter-spacing:-.04em;margin:28px 0 14px}.end p{font-size:19px;line-height:1.4;opacity:.92;margin:0}
.end .url{margin-top:30px;display:inline-block;background:#fff;color:#ff5a36;font-weight:800;padding:12px 18px;border-radius:999px;font-size:17px}
</style></head><body>
<div class="cap" id="cap"></div>
<section class="scene" id="s1"><div class="chat" id="chat"><div class="hdr"><div class="av">✦</div><div><b>Your AI</b><small>with Spot</small></div></div></div></section>
<section class="scene lock" id="s2"><div class="time">9:41</div><div class="date">${new Date(Date.now()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
  <div class="note" id="note"><div class="row"><div class="ic">💬</div>MESSAGES<span style="margin-left:auto">now</span></div><b>Spot</b><p>Your flight is ready ✈️ AUS → SFO, ${dateLabel}, $${(ask.total_cents / 100).toFixed(2)}. The fare only holds for a bit. Finish on your phone: spot.link/…</p></div><div class="tap" id="tap"></div></section>
<section class="scene end" id="s3"><div class="logo"><i></i>Spot</div><h1>Ask your AI.<br>Finish on your phone.</h1><p>Your AI finds it and holds the price. You tap Apple Pay. Or send it to someone else to pay.</p><span class="url">Add Spot to your AI →</span></section>
<script>
const OPTS=${JSON.stringify(options)};
const $=(s)=>document.querySelector(s),wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const cap=(h)=>{$('#cap').innerHTML=h};
const scene=(id)=>document.querySelectorAll('.scene').forEach(s=>s.classList.toggle('on',s.id===id));
const say=async(cls,html,{type=false}={})=>{const m=document.createElement('div');m.className='m '+cls;$('#chat').append(m);
  if(type){m.textContent='';requestAnimationFrame(()=>m.classList.add('on'));for(let i=1;i<=html.length;i++){m.textContent=html.slice(0,i);await wait(34)}}
  else{m.innerHTML=html;requestAnimationFrame(()=>m.classList.add('on'))}return m};
window.play=async(scenes)=>{
  if(scenes.includes('chat')){scene('s1');cap('1. <span>Ask your AI</span>');await wait(500);
    await say('me','find me a flight to SFO on the 17th. morning, nonstop pls',{type:true});await wait(500);
    const d=await say('ai','<span class="dots"><i></i><i></i><i></i></span>');await wait(1300);
    d.innerHTML='Here’s what I found, live fares ✈️<div class="opts">'+OPTS.map(o=>'<div class="opt'+(o.pick?' pick':'')+'"><div><b>'+o.dep+' → '+o.arr+'</b> <small>'+o.stops+'</small></div><div class="p">'+o.price+'</div></div>').join('')+'</div>';
    await wait(2600);await say('me','the nonstop 👍',{type:true});await wait(500);
    await say('ai','Holding that fare. Texting you a link to finish ✈️');await wait(2000)}
  if(scenes.includes('text')){scene('s2');cap('2. <span>Get a text</span>');await wait(900);$('#note').classList.add('on');await wait(2400);$('#tap').classList.add('on');await wait(700)}
  if(scenes.includes('end')){$('#cap').innerHTML='';scene('s3');await wait(3200)}
  return true};
</script></body></html>`);
});

const day = (() => {
  const d = new Date(Date.now() + 20 * 864e5);
  return d.toISOString().slice(0, 10);
})();
found = (await app.inject({ method: 'POST', url: '/v1/agent/flights/search', headers: H_AUTH, payload: { origin: 'AUS', destination: 'SFO', departure_date: day } })).json();
pick = found.offers.find((o) => o.slices[0].stops === 0) || found.offers[0];
ask = (await app.inject({ method: 'POST', url: '/v1/agent/flights/asks', headers: H_AUTH, payload: { offer_id: pick.offer_id, requester: { name: 'Kyle' }, note: 'nonstop, morning, aisle-friendly' } })).json();
finish = ask.finish_link.replace(/^https?:\/\/[^/]+/, `http://localhost:${PORT}`);

const t12 = (iso) => {
  const h = +iso.slice(11, 13);
  return `${h % 12 || 12}:${iso.slice(14, 16)}${h < 12 ? 'a' : 'p'}`;
};
options = found.offers.slice(0, 3).map((o) => ({
  id: o.offer_id,
  dep: t12(o.slices[0].departing_at),
  arr: t12(o.slices[0].arriving_at),
  stops: o.slices[0].stops ? `${o.slices[0].stops} stop` : 'nonstop',
  price: `$${Math.round(o.total_cents / 100)}`,
  pick: o.offer_id === pick.offer_id,
}));
dateLabel = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

await app.listen({ port: PORT });
// Without this flag the recording is captured at 1x and fills a quarter of the frame.
const browser = await chromium.launch({ args: ['--force-device-scale-factor=2'] });
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, recordVideo: { dir: out, size: { width: W * 2, height: H * 2 } } });
const page = await context.newPage();
const caption = (html) =>
  page.evaluate((h) => {
    let c = document.getElementById('democap');
    if (!c) {
      c = document.createElement('div');
      c.id = 'democap';
      c.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;padding:16px 22px 22px;background:linear-gradient(transparent,#fbf7f1 35%);font:800 26px/1.1 Bricolage,system-ui;letter-spacing:-.03em;color:#1b1712;pointer-events:none';
      document.body.append(c);
    }
    c.innerHTML = h;
  }, html);

await page.goto(`http://localhost:${PORT}/demo`);
await page.evaluate(() => window.play(['chat', 'text']));

await page.goto(finish);
await page.waitForSelector('#finish');
await caption('3. <span style="color:#ff5a36">Check it. Tap pay.</span>');
await page.waitForTimeout(1600);
await page.mouse.wheel(0, 520);
await page.waitForTimeout(700);
const typeIn = async (sel, text) => {
  await page.click(sel);
  await page.fill(sel, '');
  await page.type(sel, text, { delay: 45 });
};
await typeIn('[name=f0]', 'Riggle');
await page.fill('[name=b0]', '1990-04-02');
await page.selectOption('[name=x0]', 'm');
await typeIn('[name=email]', 'kyle@example.com');
await typeIn('[name=phone]', '512 555 0100');
await page.waitForTimeout(500);
await page.click('#payBtn');
await page.waitForSelector('.pnr', { timeout: 15000 });
await page.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
await caption('4. <span style="color:#ff5a36">Booked ✈️</span>');
await page.waitForTimeout(3600);

await page.goto(`http://localhost:${PORT}/demo`);
await page.evaluate(() => window.play(['end']));

const video = page.video();
await context.close();
const file = join(out, 'spot-flight-demo.webm');
renameSync(await video.path(), file);
await browser.close();
await app.close();
console.log(file);

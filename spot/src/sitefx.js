// The human, playful layer of the website: an illustrated cast, hand-drawn
// marks, a scroll-driven story, the group-chat wall and a handwritten note.
// Pure markup + CSS + one script; everything calms down under
// prefers-reduced-motion.

// ─── The cast ───────────────────────────────────────────────────────────────
// Friendly drawn people (not photos, not "real" customers).
export function personSvg({ skin = '#f2c7a5', hair = '#3b2a20', style = 'short', glasses = false, shirt = '#2a6df4', id = '' } = {}) {
  const hairShape = {
    short: `<path d="M34 50c0-22 14-34 30-34s30 12 30 34c-6-10-16-15-30-15s-24 5-30 15z" fill="${hair}"/>`,
    bun: `<circle cx="64" cy="14" r="12" fill="${hair}"/><path d="M32 54c0-24 14-36 32-36s32 12 32 36c-4-12-16-20-32-20s-28 8-32 20z" fill="${hair}"/>`,
    curly: [30, 44, 58, 72, 86, 98].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 26 : 32}" r="12" fill="${hair}"/>`).join(''),
    cap: `<path d="M32 46c0-20 14-30 32-30s32 10 32 30z" fill="${hair}"/><path d="M60 44h46c4 0 6 4 2 6H60z" fill="${hair}"/>`,
  }[style];
  const eyes = glasses
    ? `<circle cx="51" cy="60" r="9" fill="none" stroke="#1b1712" stroke-width="3"/><circle cx="77" cy="60" r="9" fill="none" stroke="#1b1712" stroke-width="3"/><path d="M60 60h8" stroke="#1b1712" stroke-width="3"/>`
    : '';
  return `<svg viewBox="0 0 128 128" class="person" ${id ? `id="${id}"` : ''} aria-hidden="true">
<path d="M22 128c2-24 20-36 42-36s40 12 42 36z" fill="${shirt}"/>
<circle cx="64" cy="60" r="32" fill="${skin}"/>
${hairShape}
<g class="p-eyes"><circle cx="51" cy="61" r="3.6" fill="#1b1712"/><circle cx="77" cy="61" r="3.6" fill="#1b1712"/></g>
${eyes}
<circle cx="44" cy="72" r="5" fill="#ff8f70" opacity=".45"/><circle cx="84" cy="72" r="5" fill="#ff8f70" opacity=".45"/>
<path class="p-mouth" d="M56 76q8 7 16 0" stroke="#1b1712" stroke-width="3.2" fill="none" stroke-linecap="round"/>
<path class="p-joy" d="M54 74q10 13 20 0z" fill="#1b1712" opacity="0"/>
</svg>`;
}

const storeSvg = `<svg viewBox="0 0 128 128" class="person store" aria-hidden="true">
<rect x="18" y="52" width="92" height="64" rx="6" fill="#fff" stroke="#1b1712" stroke-width="3"/>
<path d="M14 36h100l-6 20H20z" fill="#ff5a36" stroke="#1b1712" stroke-width="3" stroke-linejoin="round"/>
<path d="M34 36l-4 20M54 36l-2 20M74 36l2 20M94 36l4 20" stroke="#fff" stroke-width="6"/>
<rect x="30" y="68" width="30" height="48" rx="3" fill="#ffe3d8" stroke="#1b1712" stroke-width="3"/>
<rect x="70" y="68" width="28" height="22" rx="3" fill="#dff2e8" stroke="#1b1712" stroke-width="3"/>
<circle cx="55" cy="94" r="2.5" fill="#1b1712"/>
</svg>`;

// ─── Hand-drawn marks ───────────────────────────────────────────────────────
export const circleMark = `<svg class="hd-circle" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M18 70C20 30 120 10 220 12c90 2 170 20 166 58-4 38-110 46-200 44C90 112 10 104 20 62c6-24 60-40 120-46"/></svg>`;
export const underlineMark = `<svg class="hd-under" viewBox="0 0 300 20" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M4 14c50-8 120-10 180-6 40 3 80 2 112-4"/></svg>`;
const arrowMark = (d, cls) => `<svg class="hd-arrow ${cls}" viewBox="0 0 160 120" aria-hidden="true"><path pathLength="1" d="${d}"/><path pathLength="1" class="head" d="M128 84l16 14-20 4"/></svg>`;

// ─── Sections ───────────────────────────────────────────────────────────────
export function heroNotes() {
  return `
  <div class="note n-mom" aria-hidden="true">that’s my mom 👀${arrowMark('M10 20C40 10 90 20 110 50s28 40 34 48', 'a1')}</div>
  <div class="sticker s1" aria-hidden="true">no app needed ✌️</div>
`;
}

export function storySection() {
  const you = personSvg({ skin: '#e8b48f', hair: '#2b1d14', style: 'cap', shirt: '#ff5a36', id: 'pYou' });
  const mom = personSvg({ skin: '#c98b62', hair: '#1b1210', style: 'bun', glasses: true, shirt: '#1d8a52', id: 'pMom' });
  return `
<section class="story" id="how" aria-label="How Spot works, start to finish">
  <div class="pin">
    <div class="wrap story-inner">
      <div class="story-copy">
        <p class="kicker">How it works</p>
        <h2>One little link, <span class="scrib">start to finish${underlineMark}</span></h2>
        <ol class="beats">
          <li data-beat="0" data-n="1"><b>You spot it.</b> Paste a link, a screenshot, or just say it. Spot turns it into a cute card.</li>
          <li data-beat="1" data-n="2"><b>Mom taps.</b> One tap of Apple Pay. Her money can only buy that cart, from one store or several.</li>
          <li data-beat="2" data-n="3"><b>It ships.</b> Spot fills in the checkout, you tap Place order, and a box is on its way.</li>
        </ol>
        <div class="progress" aria-hidden="true"><i></i></div>
        <p class="hint" aria-hidden="true">keep scrolling ↓</p>
      </div>
      <div class="scene" aria-hidden="true">
        <svg class="lanes" viewBox="0 0 600 520">
          <path id="lane0" d="M110 400C130 250 250 150 300 120"/>
          <path id="lane1" d="M300 120C380 120 480 230 490 390"/>
          <path id="lane2" d="M490 400C400 500 200 500 110 410"/>
        </svg>
        <div class="actor a-you">${you}<span>you</span></div>
        <div class="actor a-mom">${mom}<span>mom</span></div>
        <div class="actor a-store">${storeSvg}<span>the store</span></div>
        <div class="token" id="token">
          <div class="t t-card"><b>psst… spot me?</b><small>Super Puff · $271</small></div>
          <div class="t t-coin">$</div>
          <div class="t t-box">📦</div>
        </div>
        <div class="pop pop1">🧡</div><div class="pop pop2">tap!</div><div class="pop pop3">yay!!</div>
      </div>
    </div>
  </div>
</section>`;
}

const CHATS = [
  ['can you spot me for the concert fit 🥺', 'r'],
  ['it’s literally $40 and it’s for school', 'l'],
  ['birthday list, no pressure (pressure)', 'r'],
  ['ok but can you just get it, venmo feels weird', 'l'],
  ['the good headphones pls, the flight is 11 hrs', 'r'],
  ['sent ✅ go get your jacket', 'l'],
  ['new mic fund 🎙️ link in bio', 'r'],
  ['you’re the best, it already shipped!!', 'l'],
  ['happy early birthday 🎂 spotted', 'l'],
  ['dorm bedding before move-in?? 🙏', 'r'],
  ['moving-out gift?? the good pans 🍳', 'r'],
  ['honestly easier than venmo lol', 'l'],
];

export function chatWallSection() {
  const col = (items, i) => `<div class="cw-col c${i}"><div class="cw-track">${[...items, ...items].map(([t, s]) => `<div class="cw ${s}">${t}</div>`).join('')}</div></div>`;
  return `
<section class="sec chatwall">
  <div class="wrap">
    <p class="kicker reveal">Sound familiar?</p>
    <h2 class="reveal">The group chat, <span class="scrib">basically${underlineMark}</span></h2>
    <p class="lead reveal">The kinds of things people say right before they send a Spot.</p>
  </div>
  <div class="cw-wall" aria-hidden="true">
    ${col([CHATS[0], CHATS[1], CHATS[5], CHATS[9]], 1)}${col([CHATS[2], CHATS[3], CHATS[7], CHATS[10]], 2)}${col([CHATS[4], CHATS[11], CHATS[6], CHATS[8]], 3)}
  </div>
</section>`;
}

export function noteSection(buddy) {
  return `
<section class="sec noteSec"><div class="wrap">
  <div class="letter reveal">
    <div class="tape" aria-hidden="true"></div>
    <p class="hand big">Asking for things is awkward.</p>
    <p>Being asked shouldn’t feel like a chore either. So we made the ask a little cute, and the yes a single tap. The money can only buy the thing, the thing shows up at the door, and nobody has to ask “what’s your Venmo again?”</p>
    <p class="hand sign">— the Spot team 🧡</p>
    <div class="letter-buddy" aria-hidden="true">${buddy}</div>
  </div>
</div></section>`;
}

// ─── CSS ────────────────────────────────────────────────────────────────────
export const FX_CSS = `
@font-face{font-family:Hand;src:url(/fonts/caveat-700.woff2) format('woff2');font-weight:700;font-display:swap}
.hand{font-family:Hand,'Bradley Hand',cursive;font-weight:700}

/* paper grain */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:50;opacity:.05;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
@media (prefers-color-scheme:dark){body::after{opacity:.08}}

/* hand-drawn marks */
.circled{position:relative;display:inline-block;white-space:nowrap}
.hd-circle{position:absolute;left:-6%;top:-14%;width:112%;height:128%;overflow:visible;pointer-events:none}
.hd-circle path,.hd-under path,.hd-arrow path{fill:none;stroke:var(--spot);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}
.hd-circle path{stroke:#1b1712;stroke-width:4}
@media (prefers-color-scheme:dark){.hd-circle path{stroke:#f4efe8}}
.drawn .hd-circle path{animation:draw 1.1s .5s cubic-bezier(.6,0,.3,1) forwards}
.scrib{position:relative;display:inline-block;white-space:nowrap}
.hd-under{position:absolute;left:0;bottom:-.12em;width:100%;height:.35em;overflow:visible}
.reveal.in .hd-under path,.in .hd-under path,.story.on .hd-under path{animation:draw .9s .25s ease-out forwards}
@keyframes draw{to{stroke-dashoffset:0}}

/* hero notes + stickers */
.note{position:absolute;z-index:3;white-space:nowrap;font-family:Hand,cursive;font-weight:700;font-size:28px;color:var(--ink);transform:rotate(-6deg);opacity:0;animation:pop .5s 1.6s cubic-bezier(.2,.9,.3,1.3) forwards}
.note.n-mom{right:calc(100% - 4px);top:9%}
.note .hd-arrow{position:absolute;left:55%;top:32px;width:110px;height:80px;overflow:visible}
.note .hd-arrow path{stroke:var(--ink);stroke-width:3.2;animation:draw .8s 2.1s ease-out forwards}
.sticker{position:absolute;z-index:3;white-space:nowrap;background:#fff;color:#1b1712;border-radius:14px;padding:10px 14px;font-weight:800;font-size:15px;line-height:1.15;box-shadow:0 10px 24px rgba(27,23,18,.16),0 0 0 3px #fff inset;border:2px solid #1b1712;opacity:0;animation:stick .45s cubic-bezier(.2,.9,.3,1.4) forwards}
.sticker u{text-decoration-color:var(--spot);text-decoration-thickness:3px}
.sticker.s1{right:calc(100% - 16px);bottom:18%;transform:rotate(-9deg);animation-delay:2.4s;background:#fff3b0}
.sticker.s2{right:-12%;top:30%;transform:rotate(8deg);animation-delay:2.8s}
@keyframes stick{from{opacity:0;scale:1.6}to{opacity:1;scale:1}}
@keyframes pop{from{opacity:0;scale:.7}to{opacity:1;scale:1}}
@media (max-width:1180px){.note,.sticker{display:none}}

/* hero mascot: blink, wave, say hi */
.hero .buddy{cursor:pointer}
.hero .buddy .open{transform-origin:100px 90px;animation:blink 4.6s infinite}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.hi{position:absolute;right:calc(max(2vw,8px) + 90px);top:26px;background:var(--ink);color:var(--bg);font-weight:800;font-size:15px;border-radius:14px 14px 4px 14px;padding:7px 12px;opacity:0;animation:pop .4s .9s forwards}
.hi span{display:inline-block;transform-origin:70% 80%;animation:wave 1.6s 1.2s 2}
@keyframes wave{0%,100%{rotate:0}20%{rotate:18deg}40%{rotate:-10deg}60%{rotate:14deg}80%{rotate:-4deg}}
@media (max-width:900px){.hi{display:none}}

/* confetti */
.confetti{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:4}
.confetti i{position:absolute;width:9px;height:14px;border-radius:2px;left:var(--x);top:var(--y);animation:burst 1.3s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes burst{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}
.spark{position:fixed;pointer-events:none;z-index:60;font-size:16px;animation:spark .9s ease-out forwards}
@keyframes spark{to{transform:translateY(-34px) scale(.4);opacity:0}}

/* buttons get a little life */
.btn.primary:hover{animation:wiggle .5s}
@keyframes wiggle{0%,100%{rotate:0}25%{rotate:-3deg}75%{rotate:3deg}}

/* scroll story */
.story{position:relative;height:340vh;background:var(--bg2)}
.story .pin{position:sticky;top:0;height:100vh;display:flex;align-items:center;overflow:hidden;padding-top:66px;box-sizing:border-box}
.story-inner{display:grid;grid-template-columns:.9fr 1.1fr;gap:40px;align-items:center;width:100%}
.beats{list-style:none;padding:0;margin:26px 0 0;display:flex;flex-direction:column;gap:14px}
.beats li{padding:14px 16px 14px 56px;border-radius:18px;position:relative;color:var(--muted);transition:all .35s;border:1px solid transparent}
.beats li::before{content:attr(data-n);position:absolute;left:14px;top:13px;width:28px;height:28px;border-radius:50%;background:var(--line);color:var(--muted);display:grid;place-items:center;font-weight:800;transition:all .35s}
.beats li b{color:var(--ink)}
.beats li.on{background:var(--card);border-color:var(--line);color:var(--ink);box-shadow:0 12px 30px rgba(27,23,18,.08);transform:translateX(6px)}
.beats li.on::before{background:var(--spot);color:#fff}
.progress{height:6px;border-radius:99px;background:var(--line);margin-top:22px;overflow:hidden}
.progress i{display:block;height:100%;width:calc(var(--p,0)*100%);background:var(--spot);border-radius:99px}
.story .hint{font-family:Hand,cursive;font-size:24px;color:var(--muted);margin-top:10px;transition:opacity .3s}
.scene{position:relative;aspect-ratio:600/520;width:100%}
.lanes{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.lanes path{fill:none;stroke:var(--muted);stroke-width:3;stroke-dasharray:2 12;stroke-linecap:round;opacity:.5}
.actor{position:absolute;width:21%;display:flex;flex-direction:column;align-items:center;gap:4px;transform:translate(-50%,-50%);transition:transform .3s}
.actor span{font-family:Hand,cursive;font-size:24px;font-weight:700}
.actor .person{width:100%;height:auto;filter:drop-shadow(0 10px 16px rgba(27,23,18,.15))}
.a-you{left:18%;top:80%}.a-mom{left:50%;top:21%}.a-store{left:82%;top:80%}
.actor.happy .p-mouth{opacity:0}.actor.happy .p-joy{opacity:1}
.actor.bump{animation:bump .5s}
@keyframes bump{40%{transform:translate(-50%,-50%) scale(1.12) rotate(-4deg)}}
.token{position:absolute;left:0;top:0;transform:translate(-50%,-50%);z-index:3;will-change:left,top}
.token .t{display:none}
.token[data-k="0"] .t-card,.token[data-k="1"] .t-coin,.token[data-k="2"] .t-box{display:grid}
.t-card{background:#fff;color:#1b1712;border-radius:14px;padding:10px 12px;box-shadow:0 12px 26px rgba(27,23,18,.2);border:2px solid #1b1712;rotate:-6deg;font-size:14px;line-height:1.2;white-space:nowrap}
.t-card small{color:#6f675c}
.t-coin{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe27a,#ffb347 60%,#e8912a);border:3px solid #1b1712;place-items:center;font-weight:800;font-size:24px;color:#1b1712;box-shadow:0 10px 20px rgba(27,23,18,.2);animation:spin 1.2s linear infinite}
@keyframes spin{50%{transform:scaleX(.3)}}
.t-box{font-size:48px;filter:drop-shadow(0 10px 12px rgba(27,23,18,.25));animation:hop .6s ease-in-out infinite alternate}
@keyframes hop{to{transform:translateY(-8px) rotate(6deg)}}
.pop{position:absolute;font-family:Hand,cursive;font-weight:700;font-size:30px;color:var(--spot);opacity:0;transform:translate(-50%,-50%) scale(.6);transition:all .35s cubic-bezier(.2,.9,.3,1.4);pointer-events:none}
.pop.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
.pop1{left:36%;top:30%}.pop2{left:66%;top:14%}.pop3{left:18%;top:58%}
@media (max-width:900px){
  .story{height:300vh}
  .story-inner{grid-template-columns:1fr;gap:10px}
  .story-copy h2{font-size:28px}.beats{margin-top:10px;gap:8px}.beats li{padding:10px 12px 10px 48px;font-size:15px;line-height:1.35;transform:none!important}.beats li:not(.on){display:none}
  .progress{margin-top:12px}
  .story .hint,.story-copy .kicker{display:none}
  .scene{width:min(100%,42vh);margin:0 auto}
  .actor span{font-size:18px}
}
@media (prefers-reduced-motion:reduce){
  .story{height:auto}.story .pin{position:static;height:auto;padding:90px 0}
  .beats li{color:var(--ink)}.beats li:not(.on){display:block}.story .hint,.progress,.token,.pop{display:none}
}

/* group chat wall */
.chatwall{overflow:hidden}
.cw-wall{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;max-width:1120px;margin:40px auto 0;padding:0 20px;height:420px;overflow:hidden;-webkit-mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent)}
.cw-track{display:flex;flex-direction:column;gap:12px;animation:rise 26s linear infinite}
.cw-col.c2 .cw-track{animation-duration:32s;animation-delay:-9s}.cw-col.c3 .cw-track{animation-duration:29s;animation-delay:-4s}
@keyframes rise{to{transform:translateY(-50%)}}
.cw{padding:11px 15px;border-radius:20px;font-size:16px;max-width:88%;box-shadow:0 4px 14px rgba(27,23,18,.06)}
.cw.r{align-self:flex-end;background:#0a84ff;color:#fff;border-bottom-right-radius:6px}
.cw.l{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-bottom-left-radius:6px}
@media (max-width:760px){.cw-wall{grid-template-columns:1fr 1fr}.cw-col.c3{display:none}}
@media (prefers-reduced-motion:reduce){.cw-track{animation:none}}

/* handwritten letter */
.noteSec{padding-top:40px}
.letter{position:relative;max-width:640px;margin:0 auto;background:#fffdf7;color:#2a241d;border-radius:6px;padding:46px 44px 40px;box-shadow:0 30px 60px rgba(27,23,18,.12),0 2px 0 #eadfce;rotate:-1.2deg;background-image:repeating-linear-gradient(#fffdf7 0 34px,#eee3d3 34px 35px)}
.letter p{font-size:18px;line-height:35px;margin:0 0 0}
.letter .big{font-size:40px;line-height:1.1;margin-bottom:12px;color:var(--spot)}
.letter .sign{font-size:30px;margin-top:14px;text-align:right}
.tape{position:absolute;top:-14px;left:50%;width:120px;height:30px;translate:-50% 0;rotate:3deg;background:rgba(255,179,71,.55);border-radius:3px}
.letter-buddy{position:absolute;left:-40px;bottom:-30px;width:90px;rotate:-10deg}
@media (max-width:600px){.letter{padding:36px 22px 30px}.letter-buddy{display:none}}

/* footer wave */
.bye{display:flex;align-items:center;gap:10px;font-family:Hand,cursive;font-size:24px}
.bye svg{width:44px;height:44px}
`;

// ─── Script ─────────────────────────────────────────────────────────────────
export const FX_JS = `
  // Headline circle draws in once fonts settle.
  (document.fonts?document.fonts.ready:Promise.resolve()).then(()=>document.querySelector('.hero')?.classList.add('drawn'));

  // Confetti helper: bursts from an element.
  window.spotConfetti=(host,x='50%',y='40%',n=38)=>{if(reduce||!host)return;const c=document.createElement('div');c.className='confetti';
    const cols=['#ff5a36','#ffb347','#1d8a52','#4b7bff','#ffd23f','#ff8fb1'];
    for(let i=0;i<n;i++){const p=document.createElement('i');const a=Math.random()*Math.PI*2,d=80+Math.random()*170;
      p.style.cssText='--x:'+x+';--y:'+y+';--dx:'+(Math.cos(a)*d).toFixed(0)+'px;--dy:'+(Math.sin(a)*d-60).toFixed(0)+'px;--r:'+(Math.random()*720-360).toFixed(0)+'deg;background:'+cols[i%cols.length];c.appendChild(p)}
    host.appendChild(c);setTimeout(()=>c.remove(),1500)};

  // Click the mascot for a little celebration.
  const hb=document.querySelector('.hero .buddy');hb&&hb.addEventListener('click',()=>spotConfetti(hb,'50%','50%',30));

  // Sparkles trail the pointer across the hero (desktop only).
  const hero=document.querySelector('.hero');let last=0;
  if(hero&&!reduce&&matchMedia('(hover:hover)').matches)hero.addEventListener('pointermove',e=>{const now=performance.now();if(now-last<70)return;last=now;
    const s=document.createElement('span');s.className='spark';s.textContent=['✦','♡','✧','·'][Math.floor(Math.random()*4)];s.style.left=e.clientX+'px';s.style.top=e.clientY+'px';s.style.color=['#ff5a36','#ffb347','#4b7bff'][Math.floor(Math.random()*3)];document.body.appendChild(s);setTimeout(()=>s.remove(),900)});

  // Scroll story: the token rides three lanes as you scroll.
  const story=document.querySelector('.story');
  if(story){
    const lanes=[0,1,2].map(i=>document.getElementById('lane'+i)),tok=document.getElementById('token'),scene=story.querySelector('.scene'),svg=story.querySelector('.lanes');
    const beats=[...story.querySelectorAll('.beats li')],bar=story.querySelector('.progress'),hint=story.querySelector('.hint');
    const you=story.querySelector('.a-you'),mom=story.querySelector('.a-mom'),shop=story.querySelector('.a-store'),pops=[...story.querySelectorAll('.pop')];
    let lastK=-1;
    const frame=()=>{
      const r=story.getBoundingClientRect(),total=story.offsetHeight-innerHeight;
      let p=reduce?1:Math.min(1,Math.max(0,-r.top/total));
      story.style.setProperty('--p',p);bar&&bar.style.setProperty('--p',p);story.classList.toggle('on',p>0.02||reduce);
      if(hint)hint.style.opacity=p>0.05?0:1;
      const k=Math.min(2,Math.floor(p*3)),t=Math.min(1,(p*3)-k);
      const lane=lanes[k],len=lane.getTotalLength(),pt=lane.getPointAtLength(len*(k===2&&p>=0.999?1:t));
      const box=svg.viewBox.baseVal,sw=scene.clientWidth/box.width,sh=scene.clientHeight/box.height;
      tok.style.left=(pt.x*sw)+'px';tok.style.top=(pt.y*sh)+'px';tok.dataset.k=k;
      beats.forEach((b,i)=>b.classList.toggle('on',i===k));
      mom.classList.toggle('happy',k>=1);shop.classList.toggle('happy',k>=2);you.classList.toggle('happy',k===2&&t>0.85||p>=0.999);
      pops[0].classList.toggle('show',k===0&&t>0.8);pops[1].classList.toggle('show',k===1&&t<0.35);pops[2].classList.toggle('show',k===2&&t>0.85);
      // Whoever just received the token does a little bump.
      if(k!==lastK){if(lastK!==-1){const a=[you,mom,shop][k];a.classList.remove('bump');void a.offsetWidth;a.classList.add('bump')}lastK=k}
      if(p>=0.995&&!story.dataset.party){story.dataset.party=1;spotConfetti(scene,'18%','70%',44)}
      if(p<0.9)delete story.dataset.party;
    };
    let ticking=false;addEventListener('scroll',()=>{if(!ticking){ticking=true;requestAnimationFrame(()=>{frame();ticking=false})}},{passive:true});
    addEventListener('resize',frame);frame();
  }
`;

export function byeFooter(buddy) {
  return `<span class="bye" aria-hidden="true">${buddy}bye! go ask for the thing.</span>`;
}

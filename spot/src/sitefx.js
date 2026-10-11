// The human, playful layer of the website: an illustrated cast, hand-drawn
// marks, the how-it-works picture, the group-chat wall and the note.
// Pure markup + CSS + one script; everything calms down under
// prefers-reduced-motion.

import { assetUrl } from './assets.js';

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

// The cast's other faces: your AI, work, and a train for the travel case.
const aiSvg = `<svg viewBox="0 0 128 128" class="person tile" aria-hidden="true"><rect x="16" y="16" width="96" height="96" rx="28" fill="#5b5bd6"/><path d="M64 34l6.5 17.5L88 58l-17.5 6.5L64 82l-6.5-17.5L40 58l17.5-6.5z" fill="#fff"/><path d="M88 76l2.6 7 7 2.6-7 2.6L88 95l-2.6-6.8-7-2.6 7-2.6z" fill="#fff" opacity=".75"/></svg>`;
const workSvg = `<svg viewBox="0 0 128 128" class="person tile" aria-hidden="true"><rect x="16" y="16" width="96" height="96" rx="28" fill="#1d3b5c"/><rect x="34" y="50" width="60" height="40" rx="7" fill="#f4efe8"/><path d="M52 50v-6a5 5 0 0 1 5-5h14a5 5 0 0 1 5 5v6" fill="none" stroke="#f4efe8" stroke-width="5"/><path d="M34 66h60" stroke="#1d3b5c" stroke-width="4"/><rect x="58" y="62" width="12" height="9" rx="2" fill="#ffb347"/></svg>`;
const trainSvg = `<svg viewBox="0 0 128 128" class="person store" aria-hidden="true"><rect x="30" y="20" width="68" height="80" rx="16" fill="#fff" stroke="#1b1712" stroke-width="3"/><rect x="40" y="32" width="48" height="28" rx="6" fill="#dff2e8" stroke="#1b1712" stroke-width="3"/><path d="M30 70h68" stroke="#ff5a36" stroke-width="6"/><circle cx="46" cy="86" r="5" fill="#1b1712"/><circle cx="82" cy="86" r="5" fill="#1b1712"/><path d="M44 100l-10 14M84 100l10 14M38 110h52" stroke="#1b1712" stroke-width="3" stroke-linecap="round"/></svg>`;

// How it works: one picture for every way Spot is used. Someone asks (you or
// your AI), whoever's paying says yes once (you, mom, work), Spot buys it
// with a one-time card that only works at that store, and it shows up. Three
// scenarios play in a loop; the chips pick one.
export function storySection(spot) {
  const you = personSvg({ skin: '#e8b48f', hair: '#2b1d14', style: 'cap', shirt: '#ff5a36' });
  const mom = personSvg({ skin: '#c98b62', hair: '#1b1210', style: 'bun', glasses: true, shirt: '#1d8a52' });
  const node = (cls, faces) => `<div class="hw-node ${cls}">${Object.entries(faces).map(([k, svg]) => `<div class="hw-face" data-k="${k}">${svg}</div>`).join('')}<span class="hw-name"></span><span class="hw-role"></span></div>`;
  return `
<section class="sec story" id="how" aria-label="How Spot works, start to finish"><div class="wrap story-inner">
  <div class="story-copy">
    <p class="kicker reveal">How it works</p>
    <h2 class="reveal">One yes. <span class="scrib">Spot does the rest.${underlineMark}</span></h2>
    <div class="hw-chips reveal" role="group" aria-label="Pick an example">
      <button type="button" data-s="0" aria-pressed="true">Your AI shops</button><button type="button" data-s="1" aria-pressed="false">Mom spots you</button><button type="button" data-s="2" aria-pressed="false">Work pays</button>
    </div>
    <ol class="beats reveal">
      <li data-n="1"><b>Ask.</b> You or your AI send the exact thing: the store, the size, the price.</li>
      <li data-n="2"><b>Yes.</b> Whoever’s paying taps once. You, mom, or work. Their card never touches the store.</li>
      <li data-n="3"><b>Spot buys it.</b> With a one-time card that only works at that store, for that amount. Then it closes.</li>
      <li data-n="4"><b>It shows up.</b> At the door, or as an e-ticket. Whatever isn’t spent goes back.</li>
    </ol>
  </div>
  <div class="scene" aria-hidden="true">
    <svg class="lanes" viewBox="0 0 600 520"><g class="lane-base"><path id="ln0"/><path id="ln1"/><path id="ln2"/><path id="ln3"/></g><g class="lane-live"><path id="lv0" pathLength="1"/><path id="lv1" pathLength="1"/><path id="lv2" pathLength="1"/><path id="lv3" pathLength="1"/></g></svg>
    ${node('n-ask', { you, ai: aiSvg })}
    ${node('n-pay', { you, mom, work: workSvg })}
    <div class="hw-node n-spot"><div class="hw-spot">${spot}</div><span class="hw-name">Spot</span></div>
    ${node('n-store', { store: storeSvg, train: trainSvg })}
    <span class="hw-yes">YES</span>
    <div class="hw-tok" id="hwTok">
      <div class="tk tk-ask"><b></b><small></small></div>
      <div class="tk tk-yes">✓</div>
      <div class="tk tk-card"><span class="tk-brand"><i></i>Spot · one order</span><span class="tk-num">•••• 0417</span><span class="tk-only"></span><span class="tk-stamp">used · closed</span></div>
      <div class="tk tk-box"></div>
    </div>
    <span class="hw-pop" id="hwPop"></span>
  </div>
</div></section>`;
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

// The note: a heavy card with Spot peeking over the top, paws on the edge,
// and an inked YES stamp for a signature. Spot and his paws are two stills
// from the 3D model (behind and in front of the card).
const STAMP = `<svg class="lt-stamp" viewBox="0 0 120 120" aria-hidden="true"><defs><filter id="ltInk" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="7" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.7 1.65" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter><path id="ltRing" d="M60 60m-42.5 0a42.5 42.5 0 1 1 85 0a42.5 42.5 0 1 1-85 0"/></defs><g filter="url(#ltInk)"><circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="3.2"/><circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" stroke-width="1.6"/><text font-size="10" font-weight="800" letter-spacing="2.6" fill="currentColor"><textPath href="#ltRing">ONE TAP · NO VENMO · SPOT ·</textPath></text><text x="60" y="68.5" text-anchor="middle" font-size="23" font-weight="900" letter-spacing="1.5" fill="currentColor">YES</text></g></svg>`;

export function noteSection() {
  return `
<section class="sec noteSec"><div class="wrap">
  <figure class="letter reveal">
    <img class="lt-spot" src="${assetUrl('spot-peek.webp')}" alt="" width="320" height="358" loading="lazy" decoding="async">
    <div class="lt-paper">
      <h2 class="lt-head">Asking for things is awkward.</h2>
      <p>Being asked shouldn’t feel like a chore either. So we made the ask a little cute, and the yes a single tap. The money can only buy the thing, the thing shows up at the door, and nobody has to ask “what’s your Venmo again?”</p>
      <p class="lt-sign">— the Spot team</p>
      ${STAMP}
    </div>
    <img class="lt-paws" src="${assetUrl('spot-paws.webp')}" alt="" width="320" height="358" loading="lazy" decoding="async">
  </figure>
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

/* confetti */
.confetti{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:4}
.confetti i{position:absolute;width:9px;height:14px;border-radius:2px;left:var(--x);top:var(--y);animation:burst 1.3s cubic-bezier(.2,.7,.3,1) forwards}
@keyframes burst{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--r));opacity:0}}


/* how it works */
.story{background:var(--bg2);overflow:hidden}
.story-inner{display:grid;grid-template-columns:.85fr 1.15fr;gap:48px;align-items:center}
.hw-chips{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0 6px}
.hw-chips button{font:inherit;font-weight:700;font-size:14.5px;padding:9px 15px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--muted);cursor:pointer;transition:background .25s,color .25s,border-color .25s}
.hw-chips button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.beats{list-style:none;padding:0;margin:18px 0 0;display:flex;flex-direction:column;gap:6px}
.beats li{position:relative;padding:12px 14px 12px 54px;border-radius:16px;color:var(--muted);line-height:1.45;transition:background .45s var(--ease-soft,ease),color .45s,box-shadow .45s}
.beats li::before{content:attr(data-n);position:absolute;left:13px;top:11px;width:28px;height:28px;border-radius:50%;background:var(--line);color:var(--muted);display:grid;place-items:center;font-weight:800;font-size:14px;transition:background .45s,color .45s}
.beats li::after{content:'';position:absolute;left:54px;right:14px;bottom:7px;height:2px;border-radius:2px;background:var(--spot);transform-origin:0 50%;transform:scaleX(var(--f,0));opacity:0;transition:opacity .3s}
.beats li b{color:var(--ink)}
.beats li.on{background:var(--card);color:var(--ink);box-shadow:0 10px 28px rgba(27,23,18,.07)}
.beats li.on::before,.beats li.done::before{background:var(--spot);color:#fff}.beats li.on::after{opacity:.5}
.scene{position:relative;aspect-ratio:600/520;width:100%}
.lanes{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.lanes path{fill:none;stroke-linecap:round}
.lane-base path{stroke:var(--muted);stroke-width:2.5;stroke-dasharray:1.5 10;opacity:.45}
.lane-live path{stroke:var(--spot);stroke-width:3.5;stroke-dasharray:1;stroke-dashoffset:1;opacity:.85}
.hw-node{position:absolute;width:19%;display:flex;flex-direction:column;align-items:center;translate:-50% -50%;transition:scale .5s cubic-bezier(.2,1.6,.4,1)}
.hw-node.bump{scale:1.1}
.n-ask{left:16%;top:44%}.n-pay{left:50%;top:15%}.n-spot{left:50%;top:55%;width:23%}.n-store{left:84%;top:44%}
.hw-face{display:none;width:100%}.hw-face.on{display:block;animation:faceIn .5s cubic-bezier(.2,1.3,.4,1)}
@keyframes faceIn{from{opacity:0;scale:.8}}
.hw-face .person{width:100%;height:auto;display:block;filter:drop-shadow(0 10px 14px rgba(27,23,18,.14))}
.hw-node.happy .p-mouth{opacity:0}.hw-node.happy .p-joy{opacity:1}
.hw-name{font-family:Hand,cursive;font-size:24px;font-weight:700;line-height:1;margin-top:2px;white-space:nowrap}
.hw-role{font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.hw-spot{width:100%;filter:drop-shadow(0 14px 16px rgba(217,61,27,.22))}
.hw-spot.hop{animation:hwhop .7s cubic-bezier(.3,1.5,.5,1)}
@keyframes hwhop{30%{transform:translateY(-14%) scale(.96,1.05)}60%{transform:translateY(0) scale(1.05,.95)}}
.hw-yes{position:absolute;left:66%;top:20%;translate:-50% -50%;padding:7px 16px;border-radius:99px;background:var(--spot);color:#fff;font-weight:800;letter-spacing:.08em;font-size:14px;box-shadow:0 4px 0 #b8391c,0 10px 18px rgba(217,61,27,.3);opacity:0;scale:.6;transition:opacity .25s,scale .35s cubic-bezier(.2,1.6,.4,1),box-shadow .12s,transform .12s}
.hw-yes.show{opacity:1;scale:1}.hw-yes.press{transform:translateY(3px);box-shadow:0 1px 0 #b8391c,0 4px 8px rgba(217,61,27,.25)}
.hw-tok{position:absolute;left:0;top:0;z-index:3;translate:-50% -50%;pointer-events:none;will-change:left,top,transform}
.tk{position:absolute;left:50%;top:50%;translate:-50% -50%;opacity:0;scale:.7;transition:opacity .3s,scale .45s cubic-bezier(.2,1.4,.4,1)}
.hw-tok[data-k="ask"] .tk-ask,.hw-tok[data-k="yes"] .tk-yes,.hw-tok[data-k="card"] .tk-card,.hw-tok[data-k="box"] .tk-box{opacity:1;scale:1}
.tk-ask{background:#fff;color:#1b1712;border-radius:14px;padding:9px 12px;border:2px solid #1b1712;box-shadow:0 10px 22px rgba(27,23,18,.18);font-size:13.5px;line-height:1.2;white-space:nowrap;rotate:-4deg}
.tk-ask b{display:block}.tk-ask small{color:#6f675c}
.tk-yes{width:46px;height:46px;border-radius:50%;background:#1fa64a;color:#fff;display:grid;place-items:center;font-weight:900;font-size:22px;box-shadow:0 0 0 5px color-mix(in srgb,#1fa64a 25%,transparent),0 10px 18px rgba(20,90,40,.3)}
.tk-card{width:138px;height:86px;border-radius:11px;padding:9px 11px;box-sizing:border-box;background:linear-gradient(135deg,#2a2622,#14110e);color:#f4efe8;box-shadow:0 14px 24px rgba(27,23,18,.3),inset 0 1px 0 rgba(255,255,255,.1);display:flex;flex-direction:column;font-size:10px;rotate:-6deg}
.tk-brand{font-weight:800;font-size:11px;display:flex;align-items:center;gap:5px}.tk-brand i{width:9px;height:9px;border-radius:50%;background:#ff5a36}
.tk-num{margin-top:auto;font:600 12.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.06em}.tk-only{opacity:.7;margin-top:4px;white-space:nowrap}
.tk-stamp{position:absolute;right:8px;top:30px;border:2px solid #7be3a6;color:#7be3a6;border-radius:5px;padding:1px 6px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:9.5px;rotate:-12deg;opacity:0;scale:1.6;transition:opacity .2s,scale .35s cubic-bezier(.2,1.6,.4,1)}
.tk-card.used .tk-stamp{opacity:1;scale:1}
.tk-box{font-size:46px;line-height:1;filter:drop-shadow(0 10px 12px rgba(27,23,18,.25))}
.hw-pop{position:absolute;z-index:4;font-family:Hand,cursive;font-weight:700;font-size:28px;color:var(--spot);white-space:nowrap;translate:-50% -50%;opacity:0;scale:.6;transition:opacity .3s,scale .4s cubic-bezier(.2,1.5,.4,1);pointer-events:none}
.hw-pop.show{opacity:1;scale:1}
@media (max-width:900px){
  .story-inner{grid-template-columns:1fr;gap:12px}
  .scene{order:-1;max-width:520px;margin:0 auto;width:100%}
  .story-copy{order:0}.beats li:not(.on){display:none}.beats{min-height:96px}
  .hw-name{font-size:19px}.hw-role{font-size:10px}.tk-ask{font-size:12px}.tk-card{width:118px;height:74px}
}
@media (max-width:900px){.story-copy .kicker,.story-copy h2{order:-2}}
@media (prefers-reduced-motion:reduce){
  .beats li{color:var(--ink)}.beats li:not(.on){display:block}.beats li::after{display:none}
  .lane-live path{stroke-dashoffset:0}.hw-tok,.hw-yes,.hw-pop{display:none}.hw-face.on{animation:none}
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

/* the note */
.noteSec{padding-top:130px}
.letter{position:relative;max-width:640px;margin:0 auto;rotate:-1deg}
.lt-paper{position:relative;z-index:1;border-radius:3px;padding:54px 56px 48px;color:#3b342b;
  background:radial-gradient(120% 90% at 30% 0%,#fffdf8,#fbf5ea 70%,#f5ecdd),#fbf5ea;
  box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 1px 1px rgba(60,40,20,.10),0 8px 16px -6px rgba(60,40,20,.16),0 50px 80px -36px rgba(40,24,10,.45)}
.lt-paper::before{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:.5;mix-blend-mode:multiply;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .55 0 0 0 0 .45 0 0 0 0 .35 0 0 0 .09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E")}
.lt-head{font-size:clamp(30px,4.2vw,44px);letter-spacing:-.04em;line-height:1;color:#1b1712;margin:0 0 18px;max-width:12em}
.lt-paper p{font-size:19px;line-height:1.6;margin:0;max-width:27em;text-wrap:pretty}
.lt-paper p:not(.lt-sign){padding-right:min(120px,14%)}
.lt-paper .lt-sign{margin-top:22px;font-weight:700;color:#1b1712}
.lt-stamp{position:absolute;right:34px;bottom:30px;width:112px;color:#e0401f;rotate:-14deg;opacity:.95;mix-blend-mode:multiply}
.letter.in .lt-stamp{animation:thump .45s 1.1s cubic-bezier(.3,1.6,.5,1) both}
@keyframes thump{from{opacity:0;scale:1.5}}
/* Spot climbs up behind the card and grips the edge */
.lt-spot,.lt-paws{position:absolute;right:13%;top:-116px;width:150px;height:auto;pointer-events:none}
.lt-spot{z-index:0}.lt-paws{z-index:2}
.letter.in .lt-spot,.letter.in .lt-paws{animation:climb .8s .35s cubic-bezier(.25,1.4,.5,1) both}
@keyframes climb{from{translate:0 70px}}
@media (max-width:600px){
  .noteSec{padding-top:110px}
  .lt-paper{padding:38px 24px 112px}.lt-paper p{font-size:17.5px}
  .lt-stamp{width:88px;right:22px;bottom:20px}
  .lt-spot,.lt-paws{width:124px;top:-96px;right:8%}
  .lt-paper p:not(.lt-sign){padding-right:0}
}
@media (prefers-reduced-motion:reduce){.letter.in .lt-spot,.letter.in .lt-paws,.letter.in .lt-stamp{animation:none}}

/* footer wave */
.bye{display:flex;align-items:center;gap:10px;font-family:Hand,cursive;font-size:24px}
.bye .buddy3d{width:56px;margin:-8px 0 -12px}.bye .buddy3d img{display:block;width:100%;height:auto}
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

  // How it works: the ask travels from whoever asks, to whoever pays, to
  // Spot, to the store, and the thing comes back. Eased along each lane.
  const story=document.querySelector('.story');
  if(story){
    const $s=q=>story.querySelector(q),scene=$s('.scene'),tok=$s('#hwTok'),yesb=$s('.hw-yes'),pop=$s('#hwPop'),spotEl=$s('.hw-spot');
    const N={ask:$s('.n-ask'),pay:$s('.n-pay'),spot:$s('.n-spot'),store:$s('.n-store')};
    const base=[0,1,2,3].map(i=>$s('#ln'+i)),live=[0,1,2,3].map(i=>$s('#lv'+i));
    const steps=[...story.querySelectorAll('.beats li')],chips=[...story.querySelectorAll('.hw-chips button')];
    const P={ask:[96,229],pay:[300,78],spot:[300,286],store:[504,229]};
    const SC=[
      {ask:['ai','your AI','asks'],pay:['you','you','says yes'],store:['store','nike.com','sells it'],to:'pay',note:['Dunk Low · 10.5','$115 · want it?'],only:'only at nike.com · $119.60',box:'📦',end:'got ’em!'},
      {ask:['you','you','asks'],pay:['mom','mom','says yes'],store:['store','the store','sells it'],to:'ask',note:['psst… spot me?','Puffer jacket · $271'],only:'only at the store · $284',box:'📦',end:'yay!!'},
      {ask:['you','you','asks'],pay:['work','work','approves'],store:['train','Amtrak','sells it'],to:'ask',note:['Train to NYC','Sat 7:05am · $53'],only:'only at amtrak.com · $56.95',box:'🎫',end:'all aboard!'},
    ];
    // a gentle curve from a to b, bowed toward c, trimmed so it starts and ends at the edge of each face
    const curve=(a,b,c,ta=54,tb=54)=>{const u=(p,q,t)=>{const dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy)||1;return[p[0]+dx/l*t,p[1]+dy/l*t]};const s0=u(a,c,ta),e0=u(b,c,tb);return 'M'+s0.join(' ')+'Q'+c.join(' ')+' '+e0.join(' ')};
    const lay=(sc)=>{const ds=[curve(P.ask,P.pay,[118,96],56,50),curve(P.pay,P.spot,[322,182],46,62),curve(P.spot,P.store,[420,322],62,52),sc.to==='ask'?curve(P.store,P.ask,[300,560],56,56):curve(P.store,P.pay,[548,96],52,50)];
      ds.forEach((d,i)=>{base[i].setAttribute('d',d);live[i].setAttribute('d',d);live[i].style.strokeDashoffset=1})};
    const face=(node,[k,name,role])=>{node.querySelectorAll('.hw-face').forEach(f=>f.classList.toggle('on',f.dataset.k===k));node.querySelector('.hw-name').textContent=name;node.querySelector('.hw-role').textContent=role};
    const setStep=(i,f=0)=>steps.forEach((li,j)=>{li.classList.toggle('on',j===i);li.classList.toggle('done',j<i);li.style.setProperty('--f',j===i?f:j<i?1:0)});
    const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
    const box=svg=>{const vb=svg.viewBox.baseVal;return[scene.clientWidth/vb.width,scene.clientHeight/vb.height]};
    const at=(x,y)=>{const[sx,sy]=box(base[0].ownerSVGElement);tok.style.left=(x*sx)+'px';tok.style.top=(y*sy)+'px'};
    let gen=0;const wait=(ms,g)=>new Promise((r,j)=>setTimeout(()=>g===gen?r():j('stop'),ms));
    const ride=(i,ms,step,g)=>new Promise((res,rej)=>{const path=base[i],len=path.getTotalLength(),t0=performance.now();
      const fr=now=>{if(g!==gen)return rej('stop');const k=Math.min(1,(now-t0)/ms),e=ease(k),pt=path.getPointAtLength(len*e),ah=path.getPointAtLength(Math.min(len,len*e+2));
        at(pt.x,pt.y);tok.style.transform='rotate('+(Math.max(-8,Math.min(8,Math.atan2(ah.y-pt.y,ah.x-pt.x)*180/Math.PI*.12))).toFixed(2)+'deg)';
        live[i].style.strokeDashoffset=1-e;setStep(step,e);
        if(k<1)requestAnimationFrame(fr);else res()};requestAnimationFrame(fr)});
    const bump=n=>{n.classList.remove('bump');void n.offsetWidth;n.classList.add('bump');setTimeout(()=>n.classList.remove('bump'),500)};
    const say=(t,x,y)=>{pop.textContent=t;pop.style.left=x+'%';pop.style.top=y+'%';pop.classList.add('show');setTimeout(()=>pop.classList.remove('show'),1100)};
    const setup=(sc,k)=>{chips.forEach((c,j)=>c.setAttribute('aria-pressed',String(j===k)));face(N.ask,sc.ask);face(N.pay,sc.pay);face(N.store,sc.store);lay(sc);
      Object.values(N).forEach(n=>n.classList.remove('happy'));tok.dataset.k='';tok.querySelector('.tk-ask b').textContent=sc.note[0];tok.querySelector('.tk-ask small').textContent=sc.note[1];
      tok.querySelector('.tk-only').textContent=sc.only;tok.querySelector('.tk-card').classList.remove('used');tok.querySelector('.tk-box').textContent=sc.box;yesb.classList.remove('show','press');setStep(0,0)};
    const play=async(k,g)=>{const sc=SC[k];setup(sc,k);await wait(450,g);
      at(...P.ask);bump(N.ask);tok.dataset.k='ask';await wait(700,g);
      await ride(0,1500,0,g);bump(N.pay);setStep(1,0);yesb.classList.add('show');await wait(650,g);
      yesb.classList.add('press');await wait(160,g);yesb.classList.remove('press');N.pay.classList.add('happy');say('tap!',70,9);tok.dataset.k='yes';await wait(420,g);yesb.classList.remove('show');
      await ride(1,1000,1,g);spotEl.classList.remove('hop');void spotEl.offsetWidth;spotEl.classList.add('hop');spotEl.querySelector('.spotb')?.classList.add('happy');setStep(2,0);
      tok.dataset.k='card';await wait(650,g);spotEl.querySelector('.spotb')?.classList.remove('happy');
      await ride(2,1400,2,g);bump(N.store);N.store.classList.add('happy');tok.querySelector('.tk-card').classList.add('used');await wait(900,g);
      setStep(3,0);tok.dataset.k='box';await wait(450,g);
      await ride(3,1800,3,g);const dest=sc.to==='ask'?N.ask:N.pay;bump(dest);dest.classList.add('happy');tok.dataset.k='';
      say(sc.end,sc.to==='ask'?16:50,sc.to==='ask'?25:-2);spotConfetti(scene,sc.to==='ask'?'16%':'50%',sc.to==='ask'?'40%':'14%',36);setStep(3,1);await wait(2600,g)};
    if(reduce){const still=j=>{setup(SC[j],j);live.forEach(l=>l.style.strokeDashoffset=0);steps.forEach(li=>li.classList.add('on'))};still(1);chips.forEach((c,j)=>c.addEventListener('click',()=>still(j)))}
    else{
      let visible=false,k=0;const run=async()=>{const g=++gen;try{for(;;){while(!visible)await wait(300,g);await play(k,g);k=(k+1)%SC.length}}catch(e){}};
      chips.forEach((c,j)=>c.addEventListener('click',()=>{k=j;run()}));
      setup(SC[0],0);
      new IntersectionObserver(es=>{visible=es[0].isIntersecting;if(visible&&!story.dataset.go){story.dataset.go=1;run()}},{threshold:.35}).observe(scene)}
  }
`;

export function byeFooter(buddy) {
  return `<span class="bye" aria-hidden="true">${buddy}bye! go ask for the thing.</span>`;
}

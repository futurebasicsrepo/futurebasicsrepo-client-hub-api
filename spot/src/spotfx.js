// The home page's depth and motion: a 3D Spot with arms, a pressable YES
// button, layered cards that move with the pointer and the scroll, the three
// beats of what Spot does, and a little Spot that rides along the page and
// says something about each section. Everything is decorative (aria-hidden
// where it repeats the copy) and calms down under prefers-reduced-motion.

// The character, with depth: a lit body, arms that wave, feet, eyes that
// follow the pointer and blink. `id` keeps gradient ids unique per copy.
export function spotBuddy(id = 'b') {
  return `<svg class="spotb" viewBox="0 0 240 262" aria-hidden="true">
<defs>
<radialGradient id="sb-body-${id}" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#ff9a6e"/><stop offset=".55" stop-color="#ff5a36"/><stop offset="1" stop-color="#d93d1b"/></radialGradient>
<radialGradient id="sb-shine-${id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<ellipse class="sb-shadow" cx="120" cy="250" rx="62" ry="9" fill="#1b1712" opacity=".14"/>
<g class="sb-all">
<g class="sb-feet"><ellipse cx="94" cy="232" rx="20" ry="11" fill="#c8361a"/><ellipse cx="146" cy="232" rx="20" ry="11" fill="#c8361a"/></g>
<g class="sb-arm sb-arm-l"><path d="M42 150 C26 160 18 176 20 194" stroke="#e5492a" stroke-width="18" stroke-linecap="round" fill="none"/><circle cx="20" cy="196" r="11" fill="#e5492a"/></g>
<g class="sb-arm sb-arm-r"><path d="M198 150 C214 160 222 176 220 194" stroke="#e5492a" stroke-width="18" stroke-linecap="round" fill="none"/><circle cx="220" cy="196" r="11" fill="#e5492a"/></g>
<circle cx="120" cy="134" r="88" fill="url(#sb-body-${id})"/>
<ellipse cx="88" cy="90" rx="30" ry="20" fill="url(#sb-shine-${id})" transform="rotate(-25 88 90)"/>
<path d="M50 176 A88 88 0 0 0 190 176" stroke="#b8301a" stroke-opacity=".25" stroke-width="6" fill="none"/>
<g class="sb-face">
<g class="sb-eyes"><ellipse cx="96" cy="124" rx="16" ry="19" fill="#fff"/><ellipse cx="144" cy="124" rx="16" ry="19" fill="#fff"/>
<g class="sb-pupils"><circle cx="96" cy="127" r="9" fill="#1b1712"/><circle cx="144" cy="127" r="9" fill="#1b1712"/><circle cx="99.5" cy="123" r="3" fill="#fff"/><circle cx="147.5" cy="123" r="3" fill="#fff"/></g></g>
<g class="sb-joy"><path d="M82 126 q14 -16 28 0M130 126 q14 -16 28 0" stroke="#1b1712" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<path class="sb-smile" d="M106 158 q14 11 28 0" stroke="#1b1712" stroke-width="6" fill="none" stroke-linecap="round"/>
<path class="sb-grin" d="M100 154 q20 30 40 0 z" fill="#1b1712"/><path class="sb-grin" d="M110 166 q10 6 20 0" fill="#ff8fa0"/>
<circle cx="74" cy="152" r="11" fill="#ff9a7e" opacity=".9"/><circle cx="166" cy="152" r="11" fill="#ff9a7e" opacity=".9"/>
</g></g></svg>`;
}

// Hero: the YES button with Spot standing on it, and the order around them.
export function yesStage() {
  return `<div class="yesstage" id="yesStage">
  <div class="layer" data-depth="38"><div class="chip chip-ai fa"><span class="ico">🤖</span><span><b>Claude</b><small>Found Dunk Low, size 10.5 · $115</small></span></div></div>
  <div class="layer" data-depth="62"><div class="chip chip-ask fb" id="askChip"><span class="ico">👆</span><span><b class="st-wait">Approve $119.60?</b><b class="st-done">Approved ✓ signed</b><small>Nike · your Visa •4242 pays</small></span></div></div>
  <div class="layer" data-depth="24"><div class="vcard fc" id="vcard"><div class="vtop"><span class="vbrand"><i></i>Spot</span><span class="vkind">one order</span></div><div class="vchip"></div><div class="vnum">•••• 0417</div><div class="vrows"><span>Cap</span><b>$119.60</b><span>Only at</span><b>nike.com</b></div><div class="vstamp">used · closed</div></div></div>
  <div class="layer" data-depth="50"><div class="chip chip-train fd"><span class="ico">🚆</span><span><b>Booked</b><small>NE Regional 170 · PHL → NYP</small></span></div></div>
  <div class="layer" data-depth="30"><div class="chip chip-mom fe"><span class="ico">💸</span><span><b>Mom said yes</b><small>Super Puff · $271</small></span></div></div>
  <div class="layer layer-spot" data-depth="46"><div class="herospot" id="heroSpot"><div class="sayhi" aria-hidden="true">hi! I’m Spot 👋</div>${spotBuddy('hero')}</div></div>
  <button class="yesbtn" id="yesBtn" type="button" aria-label="Press yes, like approving an order"><span class="cap">YES</span></button>
  <div class="yescount" id="yesCount" aria-live="polite">go on, press it</div>
</div>`;
}

// What Spot does, in three beats.
export function beatsSection() {
  return `<section class="sec beats3 blobby" id="how-it-works" data-say="Three steps. I do the boring one 😌"><div class="wrap">
  <p class="kicker reveal">How Spot works</p>
  <h2 class="reveal">Your AI does the shopping.<br>A person does the yes.</h2>
  <div class="beat-row">
    <article class="beat tilt reveal"><span class="bn">1</span><h3>Ask your AI</h3><p>Add Spot to Claude or ChatGPT once. Then just ask for the thing: sneakers, a flight, the 7am train to New York.</p>
      <div class="bvis chatvis" aria-hidden="true"><div class="cb me">earliest train to NYC saturday?</div><div class="cb ai">7:05am, $53. Sent you a Spot 🚆</div></div></article>
    <article class="beat tilt reveal"><span class="bn">2</span><h3>Someone says yes</h3><p>You tap Approve, or it goes to whoever’s paying: Mom, a partner, your finance inbox. Your rules decide which, and every yes is signed.</p>
      <div class="bvis yesvis" aria-hidden="true"><span class="mini-yes">Approve $57.77</span><span class="or">or</span><span class="mini-mom">ask Mom 💸</span></div></article>
    <article class="beat tilt reveal"><span class="bn">3</span><h3>Spot buys it</h3><p>Spot makes a card just for that order: capped at the total, locked to that store, closed after. Your AI never sees a card number.</p>
      <div class="bvis cardvis" aria-hidden="true"><div class="mcard"><span>•••• 0417</span><b>$57.77 cap</b><em>amtrak.com only</em><i>closed ✓</i></div></div></article>
  </div>
  <div class="modechips reveal">
    <a href="#how">💸 Someone else pays</a><a href="#for-you">✈️ Flights &amp; 🚆 trains</a><a href="#rules">🧾 Rules &amp; a kill switch</a><a href="/agent-card">💳 Your AI’s card</a><a href="#stores">🛍️ Pay the store directly</a>
  </div>
</div></section>`;
}

// The little Spot that rides along the page.
export function guideSpot() {
  return `<div class="guide" id="guide" aria-hidden="true"><div class="gsay" id="gsay"></div><button class="gspot" id="gspot" type="button" tabindex="-1">${spotBuddy('guide')}</button></div>`;
}

export const SPOTFX_CSS = `
/* ── Spot the character ── */
.spotb{width:100%;height:auto;display:block;overflow:visible}
.spotb .sb-all{transform-origin:120px 240px;transform-box:view-box}
.spotb .sb-arm{transform-box:view-box}
.spotb .sb-arm-l{transform-origin:42px 150px}.spotb .sb-arm-r{transform-origin:198px 150px}
.spotb .sb-eyes{transform-origin:120px 124px;transform-box:view-box;transition:transform .08s}
.spotb .sb-joy,.spotb .sb-grin{display:none}
.spotb.happy .sb-eyes,.spotb.happy .sb-smile{display:none}.spotb.happy .sb-joy,.spotb.happy .sb-grin{display:inline}
.spotb.blink .sb-eyes{transform:scaleY(.08)}
.spotb .sb-arm-r{animation:wave 2.6s ease-in-out infinite}
@keyframes wave{0%,50%,100%{transform:rotate(0)}58%{transform:rotate(-125deg)}65%{transform:rotate(-95deg)}72%{transform:rotate(-128deg)}79%{transform:rotate(-98deg)}88%{transform:rotate(-10deg)}}
.spotb.happy .sb-arm-l{animation:cheerL .5s ease-in-out infinite alternate}.spotb.happy .sb-arm-r{animation:cheerR .5s ease-in-out infinite alternate}
@keyframes cheerL{from{transform:rotate(115deg)}to{transform:rotate(150deg)}}@keyframes cheerR{from{transform:rotate(-115deg)}to{transform:rotate(-150deg)}}

/* ── Hero ── */
.hero2{padding:56px 0 30px;position:relative;overflow:hidden;isolation:isolate}
.hero2 .grid{display:grid;grid-template-columns:1.02fr .98fr;gap:30px;align-items:center}
.hero2 h1{font-size:clamp(46px,7.6vw,92px)}
.hero2 .lead{font-size:clamp(18px,2vw,21px);max-width:540px;margin-top:20px;color:var(--muted)}
.hero2 .lead b{color:var(--ink)}
.hero2 .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.hero2 .proof{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}
.hero2 .proof span{font-size:13.5px;font-weight:600;padding:7px 12px;border-radius:99px;background:color-mix(in srgb,var(--card) 80%,transparent);border:1px solid var(--line);box-shadow:0 1px 0 rgba(255,255,255,.6) inset,0 6px 16px -10px rgba(27,23,18,.3)}
.hero2 .works{margin-top:16px;font-size:14px;color:var(--muted)}.hero2 .works b{color:var(--ink)}
@media (max-width:900px){.hero2 .grid{grid-template-columns:1fr}.hero2{padding-top:30px}.hero2 .proof span{font-size:12.5px;padding:6px 10px}}

.yesstage{position:relative;height:560px;perspective:1100px}
@media (max-width:900px){.yesstage{height:470px;margin-top:6px}}
@media (max-width:420px){.yesstage{height:430px}}
.yesstage .layer{position:absolute;inset:0;pointer-events:none}
.yesstage .layer>*{pointer-events:auto}
.chip{position:absolute;display:flex;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:10px 14px 10px 10px;font-size:14px;line-height:1.25;
  box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 2px 4px rgba(27,23,18,.05),0 18px 40px -16px rgba(27,23,18,.35);white-space:nowrap}
.chip .ico{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;font-size:20px;background:var(--bg2);flex:none}
.chip b{display:block;font-size:15px}.chip small{color:var(--muted);font-size:12.5px}
.chip-ai{left:0;top:1%}.chip-ask{right:0;top:12%}.chip-train{left:0;bottom:24%}.chip-mom{right:0;bottom:30%}
.chip-ask .ico{background:color-mix(in srgb,var(--spot) 16%,transparent)}
.chip-ask .st-done{display:none;color:var(--ok)}.yesstage.approved .chip-ask .st-wait{display:none}.yesstage.approved .chip-ask .st-done{display:block}
.yesstage.approved .chip-ask{border-color:color-mix(in srgb,var(--ok) 50%,var(--line))}
@media (max-width:900px){.chip{font-size:13px;padding:8px 11px 8px 8px}.chip .ico{width:32px;height:32px;font-size:17px}.chip b{font-size:13.5px}.chip small{font-size:11.5px}.chip-ask{top:17%}.chip-train,.chip-mom{display:none}}

.vcard{position:absolute;left:1%;top:20%;width:200px;aspect-ratio:1.586;border-radius:16px;padding:14px 16px;color:#eef0f7;
  background:linear-gradient(150deg,#1f2a4a,#0d1428 70%);box-shadow:0 30px 60px -22px rgba(13,20,40,.65),0 1px 0 rgba(255,255,255,.08) inset;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
  transform:rotateY(18deg) rotateX(8deg) rotate(-8deg);display:flex;flex-direction:column;overflow:hidden}
.vcard::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.18) 45%,transparent 60%);transform:translateX(-120%);animation:sheen 4.5s ease-in-out infinite}
@keyframes sheen{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.vcard .vtop{display:flex;justify-content:space-between;font-family:Bricolage,system-ui,sans-serif}.vcard .vbrand{font-weight:800;font-size:14px}
.vcard .vbrand i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff5a36;margin-right:5px}
.vcard .vkind{font-size:9px;letter-spacing:.16em;text-transform:uppercase;opacity:.65}
.vcard .vchip{width:30px;height:22px;border-radius:5px;background:linear-gradient(135deg,#e2cd85,#a98f45);margin:9px 0 7px}
.vcard .vnum{font-size:14px;letter-spacing:.12em}
.vcard .vrows{margin-top:auto;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:10px}.vcard .vrows span{opacity:.6;text-transform:uppercase}.vcard .vrows b{text-align:right}
.vcard .vstamp{position:absolute;right:10px;top:42%;transform:rotate(-14deg) scale(1.6);opacity:0;border:2px solid #7be3a6;color:#7be3a6;border-radius:6px;padding:2px 7px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .2s}
.yesstage.used .vcard .vstamp{opacity:1;transform:rotate(-14deg) scale(1)}
@media (max-width:900px){.vcard{width:150px;left:0;top:33%;padding:10px 12px}.vcard .vrows{font-size:8.5px}.vcard .vnum{font-size:12px}}

.herospot{position:absolute;left:50%;bottom:116px;width:230px;margin-left:-95px;cursor:pointer;transform-origin:50% 100%;animation:bob 3.4s ease-in-out infinite}
.herospot .spotb{filter:drop-shadow(0 22px 26px rgba(217,61,27,.32))}
.herospot.jump{animation:jump .9s cubic-bezier(.3,1.4,.5,1)}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes jump{0%{transform:translateY(0) scale(1,1)}15%{transform:translateY(6px) scale(1.12,.86)}45%{transform:translateY(-92px) scale(.94,1.08) rotate(-6deg)}70%{transform:translateY(0) scale(1.1,.9)}85%{transform:translateY(-10px) scale(1)}100%{transform:translateY(0)}}
.sayhi{position:absolute;left:62%;top:-6px;background:var(--ink);color:var(--bg);font-weight:800;font-size:14px;border-radius:14px 14px 14px 4px;padding:7px 12px;white-space:nowrap;opacity:0;animation:pop .45s 1s cubic-bezier(.2,1.5,.4,1) forwards}
@media (max-width:900px){.herospot{width:170px;margin-left:-60px;bottom:100px}.sayhi{font-size:12.5px;left:55%}}

.yesbtn{position:absolute;left:50%;bottom:34px;width:240px;height:84px;margin-left:-120px;border:0;padding:0;background:none;cursor:pointer;border-radius:999px;-webkit-tap-highlight-color:transparent}
.yesbtn::before{content:'';position:absolute;inset:16px 0 0;border-radius:999px;background:linear-gradient(#b8331a,#8f2410);box-shadow:0 18px 30px -12px rgba(143,36,16,.6),0 3px 0 rgba(0,0,0,.08)}
.yesbtn .cap{position:absolute;left:0;right:0;top:0;height:68px;border-radius:999px;display:grid;place-items:center;font:800 30px/1 Bricolage,system-ui,sans-serif;letter-spacing:.04em;color:#fff;
  background:radial-gradient(120% 140% at 30% 15%,#ff8a62,#ff5a36 55%,#e8441f);box-shadow:0 2px 0 rgba(255,255,255,.35) inset,0 -6px 14px rgba(0,0,0,.12) inset;transition:transform .09s ease-out;text-shadow:0 2px 0 rgba(143,36,16,.45)}
.yesbtn:hover .cap{transform:translateY(-2px)}
.yesbtn:active .cap,.yesbtn.down .cap{transform:translateY(13px)}
.yesbtn:focus-visible{outline:3px solid var(--spot2);outline-offset:6px}
.yescount{position:absolute;left:0;right:0;bottom:0;text-align:center;font-size:13px;font-weight:600;color:var(--muted)}
@media (max-width:900px){.yesbtn{width:200px;height:74px;margin-left:-100px;bottom:30px}.yesbtn .cap{height:58px;font-size:26px}}

/* gentle floating, on the inner element so the pointer/scroll transform stays separate */
.fa{animation:fl1 6s ease-in-out infinite}.fb{animation:fl2 7s ease-in-out infinite}.fc{animation:flc 8s ease-in-out infinite}.fd{animation:fl1 6.5s -2s ease-in-out infinite}.fe{animation:fl2 7.5s -3s ease-in-out infinite}
@keyframes fl1{0%,100%{translate:0 0;rotate:-2deg}50%{translate:0 -12px;rotate:1deg}}
@keyframes fl2{0%,100%{translate:0 0;rotate:2deg}50%{translate:0 -9px;rotate:-1deg}}
@keyframes flc{0%,100%{translate:0 0}50%{translate:0 -14px}}

/* ── depth everywhere ── */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
@media (prefers-color-scheme:dark){body::after{mix-blend-mode:screen;opacity:.035}}
.blobby{position:relative;isolation:isolate;overflow:hidden}
.blobby::before,.blobby::after,.hero2::before,.hero2::after{content:'';position:absolute;z-index:-1;border-radius:50%;filter:blur(60px);opacity:.5;pointer-events:none}
.blobby::before,.hero2::before{width:520px;height:520px;left:-160px;top:-120px;background:radial-gradient(circle,color-mix(in srgb,var(--spot2) 70%,transparent),transparent 70%);animation:drift 18s ease-in-out infinite alternate}
.blobby::after,.hero2::after{width:460px;height:460px;right:-140px;bottom:-140px;background:radial-gradient(circle,color-mix(in srgb,var(--spot) 45%,transparent),transparent 70%);animation:drift 22s -6s ease-in-out infinite alternate-reverse}
@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(90px,60px) scale(1.15)}}
.feat,.use,.rulecard,.storedemo,.beat,.agentwin,.tablewrap{box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 2px 4px rgba(27,23,18,.04),0 24px 50px -28px rgba(27,23,18,.35)}
.tilt{transform-style:preserve-3d;transition:transform .25s ease-out,box-shadow .25s}
.tilt:hover{box-shadow:0 1px 0 rgba(255,255,255,.7) inset,0 4px 8px rgba(27,23,18,.06),0 36px 70px -30px rgba(27,23,18,.45)}

/* ── the three beats ── */
.beat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:40px;perspective:1200px}
@media (max-width:860px){.beat-row{grid-template-columns:1fr}.beat .bn{font-size:54px}.beat h3{padding-right:46px}}
.beat{position:relative;background:var(--card);border:1px solid var(--line);border-radius:26px;padding:26px 24px 22px;display:flex;flex-direction:column}
.beat.reveal{opacity:0;transform:rotateX(28deg) translateY(40px);transform-origin:50% 100%;transition:opacity .7s,transform .9s cubic-bezier(.2,.9,.3,1)}
.beat.reveal.in{opacity:1;transform:none}
.beat-row .beat:nth-child(2){transition-delay:.12s}.beat-row .beat:nth-child(3){transition-delay:.24s}
.beat .bn{position:absolute;right:18px;top:12px;font:800 76px/1 Bricolage,system-ui,sans-serif;color:transparent;-webkit-text-stroke:2px color-mix(in srgb,var(--spot) 45%,transparent);letter-spacing:-.06em}
.beat h3{font-size:26px;margin-bottom:8px}.beat p{color:var(--muted)}
.bvis{margin-top:auto;padding-top:20px;transform:translateZ(30px)}
.chatvis{display:grid;gap:7px}.chatvis .cb{font-size:13.5px;padding:8px 12px;border-radius:16px;max-width:88%}
.chatvis .me{justify-self:end;background:#0a84ff;color:#fff;border-bottom-right-radius:5px}.chatvis .ai{background:var(--bg2);border-bottom-left-radius:5px}
.yesvis{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.yesvis .mini-yes{background:var(--spot);color:#fff;font-weight:800;border-radius:99px;padding:10px 16px;box-shadow:0 5px 0 #b8331a;font-size:14px}
.yesvis .or{color:var(--muted);font-size:13px}.yesvis .mini-mom{border:1.5px dashed var(--line);border-radius:99px;padding:8px 14px;font-weight:600;font-size:14px}
.cardvis .mcard{position:relative;border-radius:14px;padding:12px 14px;color:#eef0f7;background:linear-gradient(150deg,#1f2a4a,#0d1428);font:600 12px/1.5 ui-monospace,Menlo,monospace;display:grid;grid-template-columns:1fr auto;gap:2px 10px;box-shadow:0 18px 30px -16px rgba(13,20,40,.6)}
.cardvis .mcard em{font-style:normal;opacity:.7}.cardvis .mcard i{font-style:normal;color:#7be3a6;justify-self:end}
.modechips{display:flex;flex-wrap:wrap;gap:10px;margin-top:30px}
.modechips a{text-decoration:none;font-weight:600;font-size:15px;padding:10px 16px;border-radius:99px;background:var(--card);border:1px solid var(--line);box-shadow:0 6px 16px -10px rgba(27,23,18,.35);transition:transform .15s}
.modechips a:hover{transform:translateY(-2px)}

/* ── the guide ── */
.guide{position:fixed;right:16px;bottom:14px;z-index:50;display:flex;align-items:flex-end;gap:8px;transform:translateY(140%);transition:transform .5s cubic-bezier(.2,1.4,.4,1);pointer-events:none}
.guide.on{transform:none}
.gspot{width:74px;border:0;background:none;padding:0;cursor:pointer;pointer-events:auto;animation:bob 3s ease-in-out infinite;filter:drop-shadow(0 10px 14px rgba(217,61,27,.3))}
.gspot.jump{animation:jump .9s cubic-bezier(.3,1.4,.5,1)}
.gsay{max-width:230px;background:var(--ink);color:var(--bg);font-weight:700;font-size:14px;line-height:1.3;border-radius:16px 16px 4px 16px;padding:9px 13px;margin-bottom:46px;opacity:0;transform:translateY(8px) scale(.9);transform-origin:100% 100%;transition:opacity .25s,transform .3s cubic-bezier(.2,1.5,.4,1)}
.gsay.show{opacity:1;transform:none}
@media (max-width:600px){.gspot{width:56px}.gsay{font-size:13px;max-width:190px;margin-bottom:34px}.guide{right:10px;bottom:10px}}

@media (prefers-reduced-motion:reduce){
  .fa,.fb,.fc,.fd,.fe,.herospot,.gspot,.vcard::after,.blobby::before,.blobby::after,.hero2::before,.hero2::after,.spotb .sb-arm-r,.spotb.happy .sb-arm-l,.spotb.happy .sb-arm-r{animation:none}
  .beat.reveal{opacity:1;transform:none}.guide{transition:none}
}
`;

// Client side. Expects `reduce` and `spotConfetti` from SITE_JS / FX_JS.
export const SPOTFX_JS = `
  // Every Spot blinks now and then, and looks at the pointer.
  const spots=[...document.querySelectorAll('.spotb')];
  const blink=()=>{spots.forEach(s=>{if(s.classList.contains('happy'))return;s.classList.add('blink');setTimeout(()=>s.classList.remove('blink'),130)});setTimeout(blink,2600+Math.random()*2600)};
  if(!reduce)setTimeout(blink,1800);
  addEventListener('pointermove',e=>{spots.forEach(s=>{const p=s.querySelector('.sb-pupils'),f=s.querySelector('.sb-face');if(!p)return;const r=s.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return;
    const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height*.48),d=Math.hypot(dx,dy)||1,k=Math.min(6,d/40);
    p.setAttribute('transform','translate('+(dx/d*k).toFixed(1)+' '+(dy/d*k).toFixed(1)+')');f&&f.setAttribute('transform','translate('+(dx/d*k*.5).toFixed(1)+' '+(dy/d*k*.35).toFixed(1)+')')})},{passive:true});
  const cheer=(el,svg,ms=1500)=>{if(!el)return;el.classList.remove('jump');void el.offsetWidth;el.classList.add('jump');svg&&svg.classList.add('happy');clearTimeout(el._t);el._t=setTimeout(()=>{svg&&svg.classList.remove('happy');el.classList.remove('jump')},ms)};

  // The hero: layers move with the pointer and the scroll; YES approves the order.
  const st=document.getElementById('yesStage');
  if(st){
    const layers=[...st.querySelectorAll('.layer')];let px=0,py=0,raf=0;
    const place=()=>{raf=0;const sy=Math.min(scrollY,900);layers.forEach(l=>{const d=+l.dataset.depth||0,ds=l.classList.contains('layer-spot')?0:d;l.style.transform='translate3d('+(px*d*.6).toFixed(1)+'px,'+(py*d*.6-sy*ds*.0025).toFixed(1)+'px,'+(d*.5).toFixed(0)+'px)'})};
    const ask=()=>{if(!raf)raf=requestAnimationFrame(place)};
    if(!reduce){document.querySelector('.hero2').addEventListener('pointermove',e=>{px=e.clientX/innerWidth-.5;py=e.clientY/innerHeight-.5;ask()},{passive:true});
      addEventListener('scroll',ask,{passive:true});
      addEventListener('deviceorientation',e=>{if(e.gamma==null)return;px=Math.max(-.5,Math.min(.5,e.gamma/40));py=Math.max(-.5,Math.min(.5,(e.beta-45)/50));ask()},{passive:true})}
    const btn=document.getElementById('yesBtn'),hs=document.getElementById('heroSpot'),hsvg=hs&&hs.querySelector('.spotb'),count=document.getElementById('yesCount');let n=0,busy=0;
    const lines=['approved. signed. sent ✍️','another yes! 🧡','the store got the order 📦','card used, then closed 🔒','you’re good at this','ok now ask your AI for real →'];
    const yes=()=>{n++;btn.classList.add('down');setTimeout(()=>btn.classList.remove('down'),140);
      cheer(hs,hsvg);spotConfetti(st,'50%','62%',46);
      st.classList.add('approved');clearTimeout(busy);setTimeout(()=>st.classList.add('used'),700);
      busy=setTimeout(()=>st.classList.remove('approved','used'),3600);
      count.textContent=(n>1?'yes ×'+n+' · ':'')+lines[(n-1)%lines.length]};
    btn&&btn.addEventListener('click',yes);
    hs&&hs.addEventListener('click',()=>{cheer(hs,hsvg,1100);spotConfetti(hs,'50%','45%',24)});
    place();
  }

  // Cards tilt toward the pointer.
  if(!reduce&&matchMedia('(hover:hover)').matches)document.querySelectorAll('.tilt').forEach(el=>{
    el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform='perspective(900px) rotateY('+(x*9).toFixed(1)+'deg) rotateX('+(-y*9).toFixed(1)+'deg) translateZ(6px)'});
    el.addEventListener('pointerleave',()=>{el.style.transform=''})});

  // The little Spot: shows up after the hero and says something about each section.
  const guide=document.getElementById('guide'),gsay=document.getElementById('gsay'),gspot=document.getElementById('gspot'),gsvg=gspot&&gspot.querySelector('.spotb');
  if(guide){
    let hideT=0;const say=(t,ms=4200)=>{if(!t)return;gsay.textContent=t;gsay.classList.add('show');clearTimeout(hideT);hideT=setTimeout(()=>gsay.classList.remove('show'),ms)};
    const hero=document.querySelector('.hero2');
    new IntersectionObserver(es=>{const out=!es[0].isIntersecting;guide.classList.toggle('on',out);if(!out)gsay.classList.remove('show')},{threshold:.15}).observe(hero);
    const seen=new Set();
    const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&guide.classList.contains('on')&&!seen.has(e.target)){seen.add(e.target);say(e.target.dataset.say)}}),{threshold:.45});
    document.querySelectorAll('[data-say]').forEach(s=>io.observe(s));
    const quips=['boing!','that tickles 😆','I only buy what you said yes to','hi again 👋','one card per order. always.','tap tap tap'];let q=0;
    gspot.addEventListener('click',()=>{cheer(gspot,gsvg,1000);say(quips[q++%quips.length],2600);spotConfetti(guide,'80%','30%',18)});
  }
`;

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

// Hero: the YES button with Spot standing on it, and the order around them:
// what the AI found (top left), the approval it needs (right), and the
// one-order card that pays (left). Three cards, one style, no overlaps.
const icon = {
  ai: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6z" fill="currentColor"/><path d="M15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" opacity=".6"/></svg>',
  ok: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.2l6 2.3v4.6c0 4-2.6 7-6 8.7-3.4-1.7-6-4.7-6-8.7V4.5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M7.2 10.1l2 2 3.8-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
export function yesStage() {
  return `<div class="yesstage" id="yesStage">
  <div class="halo" aria-hidden="true"></div>
  <div class="layer" data-depth="10"><div class="chip chip-ai fa"><span class="ico">${icon.ai}</span><span><b>Claude</b><small>Found Dunk Low, size 10.5 · $115</small></span></div></div>
  <div class="layer" data-depth="16"><div class="chip chip-ask fb" id="askChip"><span class="ico">${icon.ok}</span><span><b class="st-wait">Approve $119.60?</b><b class="st-done">Approved ✓ signed</b><small>Nike · your Visa •4242 pays</small></span></div></div>
  <div class="layer" data-depth="8"><div class="vcard fc" id="vcard"><div class="vtop"><span class="vbrand"><i></i>Spot</span><span class="vkind">one order</span></div><div class="vchip"></div><div class="vnum">•••• 0417</div><div class="vrows"><span>Cap</span><b>$119.60</b><span>Only at</span><b>nike.com</b></div><div class="vstamp">used · closed</div></div></div>
  <div class="yesgroup">
    <div class="herospot" id="heroSpot">${spotBuddy('hero')}</div>
    <button class="yesbtn" id="yesBtn" type="button" aria-label="Press yes, like approving an order"><span class="cap">YES</span></button>
    <div class="yescount" id="yesCount" aria-live="polite">go on, press it</div>
  </div>
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
    <a href="#how">Someone else pays</a><a href="#for-you">Flights &amp; trains</a><a href="#rules">Rules &amp; a kill switch</a><a href="/agent-card">Your AI’s card</a><a href="#stores">Pay the store directly</a>
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
.hero2{padding:64px 0 48px;position:relative;overflow:hidden;isolation:isolate}
.hero2 .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center}
.hero2 h1{font-size:clamp(40px,5.6vw,74px);line-height:.98;letter-spacing:-.04em}
.hero2 .lead{font-size:clamp(17px,1.5vw,19px);max-width:520px;margin-top:22px;color:var(--muted)}
.hero2 .lead b{color:var(--ink);font-weight:600}
.hero2 .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.hero2 .proof{display:flex;flex-wrap:wrap;gap:10px 22px;margin:28px 0 0;padding:0;list-style:none}
.hero2 .proof li{display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:600;color:var(--ink)}
.hero2 .proof svg{width:18px;height:18px;flex:none;color:var(--spot)}
.hero2 .works{margin-top:14px;font-size:14px;color:var(--muted);max-width:520px}.hero2 .works b{color:var(--ink);font-weight:600}
@media (max-width:900px){.hero2 .grid{grid-template-columns:1fr;gap:28px}.hero2{padding:32px 0 24px}}
@media (max-width:600px){.hero2 .cta .btn{flex:1 1 100%}.hero2 .proof{flex-direction:column;gap:10px}}

/* the stage is drawn at 540×520 and zoomed down in narrower columns */
.yesstage{position:relative;width:540px;max-width:100%;height:520px;margin:0 auto}
@media (max-width:1180px) and (min-width:901px){.yesstage{zoom:.86}}
.yesstage .halo{position:absolute;left:56%;top:58%;width:440px;height:440px;translate:-50% -50%;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--spot) 16%,transparent) 0,color-mix(in srgb,var(--spot) 6%,transparent) 45%,transparent 70%)}
.yesstage .layer{position:absolute;inset:0;pointer-events:none}
.yesstage .layer>*{pointer-events:auto}
.chip{position:absolute;display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 18px 12px 12px;font-size:14px;line-height:1.3;box-shadow:var(--sh-2);white-space:nowrap}
.chip .ico{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--spot) 12%,transparent);color:var(--spot);flex:none}
.chip .ico svg{width:20px;height:20px}
.chip b{display:block;font-size:15px;font-weight:800;letter-spacing:-.01em}.chip small{display:block;color:var(--muted);font-size:13px;margin-top:1px}
.chip-ai{left:0;top:28px}.chip-ask{right:0;top:118px}
.chip-ask .st-done{display:none;color:var(--ok)}.yesstage.approved .chip-ask .st-wait{display:none}.yesstage.approved .chip-ask .st-done{display:block}
.yesstage.approved .chip-ask{border-color:color-mix(in srgb,var(--ok) 50%,var(--line))}
.yesstage.approved .chip-ask .ico{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}

.vcard{position:absolute;left:6px;top:240px;width:188px;aspect-ratio:1.586;border-radius:14px;padding:13px 15px;color:#eef0f7;
  background:linear-gradient(150deg,#26324f,#0f1629 70%);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 24px 40px -22px rgba(13,20,40,.7);font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;
  rotate:-5deg;display:flex;flex-direction:column;overflow:hidden}
.vcard::after{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.12) 45%,transparent 60%);transform:translateX(-120%);animation:sheen 7s ease-in-out infinite}
@keyframes sheen{0%,70%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.vcard .vtop{display:flex;justify-content:space-between;align-items:center;font-family:Bricolage,system-ui,sans-serif}.vcard .vbrand{font-weight:800;font-size:14px}
.vcard .vbrand i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ff5a36;margin-right:5px}
.vcard .vkind{font-size:9px;letter-spacing:.16em;text-transform:uppercase;opacity:.65}
.vcard .vchip{width:28px;height:20px;border-radius:5px;background:linear-gradient(135deg,#e2cd85,#a98f45);margin:9px 0 7px}
.vcard .vnum{font-size:14px;letter-spacing:.12em}
.vcard .vrows{margin-top:auto;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:10px}.vcard .vrows span{opacity:.6;text-transform:uppercase}.vcard .vrows b{text-align:right}
.vcard .vstamp{position:absolute;right:10px;top:42%;transform:rotate(-14deg) scale(1.6);opacity:0;border:2px solid #7be3a6;color:#7be3a6;border-radius:6px;padding:2px 7px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;transition:transform .35s cubic-bezier(.2,1.6,.4,1),opacity .2s}
.yesstage.used .vcard .vstamp{opacity:1;transform:rotate(-14deg) scale(1)}

.yesgroup{position:absolute;left:58%;bottom:0;width:230px;translate:-50% 0;display:flex;flex-direction:column;align-items:center}
.herospot{position:relative;width:196px;margin-bottom:-14px;z-index:1;cursor:pointer;transform-origin:50% 100%;animation:bob 4s ease-in-out infinite}
.herospot .spotb{filter:drop-shadow(0 16px 18px rgba(217,61,27,.22))}
.herospot.jump{animation:jump .9s cubic-bezier(.3,1.4,.5,1)}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes jump{0%{transform:translateY(0) scale(1,1)}15%{transform:translateY(6px) scale(1.12,.86)}45%{transform:translateY(-92px) scale(.94,1.08) rotate(-6deg)}70%{transform:translateY(0) scale(1.1,.9)}85%{transform:translateY(-10px) scale(1)}100%{transform:translateY(0)}}

.yesbtn{position:relative;width:220px;height:78px;border:0;padding:0;background:none;cursor:pointer;border-radius:999px;-webkit-tap-highlight-color:transparent;flex:none}
.yesbtn::before{content:'';position:absolute;inset:14px 0 0;border-radius:999px;background:linear-gradient(#b8331a,#8f2410);box-shadow:0 14px 24px -14px rgba(143,36,16,.7)}
.yesbtn .cap{position:absolute;left:0;right:0;top:0;height:64px;border-radius:999px;display:grid;place-items:center;font:800 28px/1 Bricolage,system-ui,sans-serif;letter-spacing:.06em;color:#fff;
  background:radial-gradient(120% 140% at 30% 15%,#ff8a62,#ff5a36 55%,#e8441f);box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 -6px 14px rgba(0,0,0,.1) inset;transition:transform .09s ease-out}
.yesbtn:hover .cap{transform:translateY(-2px)}
.yesbtn:active .cap,.yesbtn.down .cap{transform:translateY(12px)}
.yesbtn:focus-visible{outline:3px solid var(--spot2);outline-offset:6px}
.yescount{margin-top:12px;min-height:20px;text-align:center;font-size:13px;font-weight:600;color:var(--muted);white-space:nowrap}

/* tablet and phone: same three cards, re-laid for a narrower stage */
@media (max-width:900px){
  .yesstage{width:min(100%,460px);height:470px}
  .chip-ai{top:0}.chip-ask{top:84px}.vcard{top:214px;width:164px;left:0}
  .yesgroup{left:62%}.herospot{width:172px}.halo{left:62%}
}
@media (max-width:600px){
  .yesstage{height:392px;margin-top:8px}
  .chip{padding:10px 14px 10px 10px}.chip .ico{width:32px;height:32px}.chip b{font-size:14px}.chip small{font-size:12.5px}
  .chip-ai{left:0;top:0}.chip-ask{right:0;top:70px}
  .vcard{display:none}
  .yesgroup{left:50%}.yesstage .halo{left:50%;top:64%;width:340px;height:340px}.herospot{width:168px}
}

/* gentle floating, on the inner element so the pointer/scroll transform stays separate */
.fa{animation:fl1 9s ease-in-out infinite}.fb{animation:fl1 10s -3s ease-in-out infinite}.fc{animation:fl1 11s -6s ease-in-out infinite}
@keyframes fl1{0%,100%{translate:0 0}50%{translate:0 -5px}}

/* ── depth everywhere ── */
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:60;opacity:.05;mix-blend-mode:multiply;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
@media (prefers-color-scheme:dark){body::after{mix-blend-mode:screen;opacity:.035}}
.blobby{position:relative;isolation:isolate;overflow:hidden}
.blobby::before,.blobby::after,.hero2::before,.hero2::after{content:'';position:absolute;z-index:-1;border-radius:50%;filter:blur(80px);opacity:.22;pointer-events:none}
.blobby::before,.hero2::before{width:520px;height:520px;left:-200px;top:6%;background:radial-gradient(circle,color-mix(in srgb,var(--spot2) 70%,transparent),transparent 70%)}
.blobby::after,.hero2::after{width:460px;height:460px;right:-180px;bottom:8%;background:radial-gradient(circle,color-mix(in srgb,var(--spot) 45%,transparent),transparent 70%)}
@keyframes drift{from{transform:translate(0,0) scale(1)}to{transform:translate(90px,60px) scale(1.15)}}
.feat,.use,.rulecard,.storedemo,.beat,.agentwin,.tablewrap{box-shadow:var(--sh-2)}
.tilt{transform-style:preserve-3d;transition:transform .25s ease-out,box-shadow .25s}
.tilt:hover{box-shadow:var(--sh-3)}

/* ── the three beats ── */
.beat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:40px;perspective:1200px}
@media (max-width:860px){.beat-row{grid-template-columns:1fr}}
.beat h3{padding-right:44px}
.beat{position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px 24px;display:flex;flex-direction:column}
.beat.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s,transform .7s cubic-bezier(.2,.9,.3,1)}
.beat.reveal.in{opacity:1;transform:none}
.beat-row .beat:nth-child(2){transition-delay:.12s}.beat-row .beat:nth-child(3){transition-delay:.24s}
.beat .bn{position:absolute;right:22px;top:22px;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font:800 15px/1 Bricolage,system-ui,sans-serif;color:var(--spot);background:color-mix(in srgb,var(--spot) 12%,transparent)}
.beat h3{font-size:22px;margin-bottom:8px}.beat p{color:var(--muted)}
.bvis{margin-top:auto;padding-top:20px;transform:translateZ(30px)}
.chatvis{display:grid;gap:7px}.chatvis .cb{font-size:13.5px;padding:8px 12px;border-radius:16px;max-width:88%}
.chatvis .me{justify-self:end;background:#0a84ff;color:#fff;border-bottom-right-radius:5px}.chatvis .ai{background:var(--bg2);border-bottom-left-radius:5px}
.yesvis{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.yesvis .mini-yes{background:var(--spot);color:#fff;font-weight:800;border-radius:99px;padding:10px 16px;box-shadow:0 3px 0 #b8331a;font-size:14px}
.yesvis .or{color:var(--muted);font-size:13px}.yesvis .mini-mom{border:1.5px dashed var(--line);border-radius:99px;padding:8px 14px;font-weight:600;font-size:14px}
.cardvis .mcard{position:relative;border-radius:14px;padding:12px 14px;color:#eef0f7;background:linear-gradient(150deg,#1f2a4a,#0d1428);font:600 12px/1.5 ui-monospace,Menlo,monospace;display:grid;grid-template-columns:1fr auto;gap:2px 10px;box-shadow:0 18px 30px -16px rgba(13,20,40,.6)}
.cardvis .mcard em{font-style:normal;opacity:.7}.cardvis .mcard i{font-style:normal;color:#7be3a6;justify-self:end}
.modechips{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
.modechips a{display:inline-flex;align-items:center;gap:8px;min-height:44px;text-decoration:none;font-weight:600;font-size:15px;padding:0 16px;border-radius:99px;background:var(--card);border:1px solid var(--line);color:var(--ink);transition:border-color .15s,color .15s}
.modechips a::after{content:'→';color:var(--muted);transition:transform .15s}
.modechips a:hover{border-color:color-mix(in srgb,var(--spot) 50%,var(--line))}.modechips a:hover::after{transform:translateX(2px);color:var(--spot)}

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

// "See it in a chat": the AI chat you already use on one side, your phone on
// the other. You ask, the AI picks, Spot texts you; then either you finish it
// or someone else pays. Scenarios loop, alternating who pays.
export function handoffSection() {
  return `<section class="sec seeit blobby" id="see-it" data-say="Just ask. I’ll text you 📲"><div class="wrap">
  <p class="kicker reveal">See it in a chat</p>
  <h2 class="reveal">Ask in the chat you already use.<br>Finish from a text.</h2>
  <p class="lead reveal">No new app to learn. Tell Claude or ChatGPT what you want and to send you a Spot. It picks the stuff, and Spot texts or emails you a link to check out, or sends it to whoever’s paying.</p>
  <div class="seeit-grid reveal">
    <div class="aichat tilt" aria-hidden="true">
      <div class="ac-bar"><i></i><i></i><i></i><span>Your AI chat · Claude, ChatGPT, any app with Spot</span></div>
      <div class="ac-body" id="acBody"></div>
      <div class="ac-input"><span id="acType"></span><i class="caret"></i><b>↑</b></div>
    </div>
    <div class="ac-arrow" aria-hidden="true"><span class="ac-dot"></span></div>
    <div class="sphone" aria-hidden="true">
      <div class="sp-screen" id="spScreen">
        <div class="sp-lock"><div class="sp-time">9:41</div><div class="sp-date">Friday, October 9</div></div>
        <div class="sp-note" id="spNote"><div class="sp-app"><span class="dot"></span>Messages · Spot</div><div class="sp-msg" id="spMsg"></div></div>
        <div class="sp-page" id="spPage"></div>
      </div>
    </div>
  </div>
  <div class="seeit-paths reveal"><span class="sp-path" data-path="self">You check out</span><span class="sp-path" data-path="other">Someone else pays</span></div>
  <p class="sr-only">Example: you ask your AI for a blue hoodie and to send you a Spot. It picks one, Spot texts you a link, and you pay with Apple Pay. Or you ask it to have Mom spot you: Spot makes a link for Mom, she pays, and it ships to you.</p>
</div></section>`;
}

export const HANDOFF_CSS = `
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.seeit-grid{display:grid;grid-template-columns:1.15fr 70px .85fr;align-items:center;gap:10px;margin-top:40px}
@media (max-width:900px){.seeit-grid{grid-template-columns:1fr;gap:18px}.ac-arrow{width:60px;justify-self:center;transform:rotate(90deg);margin:22px 0}}
.aichat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;height:460px;box-shadow:var(--sh-3)}
@media (max-width:900px){.aichat{height:420px}}
.ac-bar{display:flex;align-items:center;gap:6px;padding:11px 14px;border-bottom:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.ac-bar i{width:10px;height:10px;border-radius:50%;background:var(--line)}.ac-bar span{margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ac-body{flex:1;padding:16px;display:flex;flex-direction:column;gap:10px;overflow:hidden;justify-content:flex-end}
.ac-body>*{animation:acin .35s cubic-bezier(.2,1.2,.4,1) both}
@keyframes acin{from{opacity:0;transform:translateY(10px)}}
.ac-u{align-self:flex-end;max-width:82%;background:var(--bg2);border-radius:18px 18px 4px 18px;padding:9px 13px;font-size:14.5px}
.ac-a{max-width:92%;font-size:14.5px;line-height:1.45}.ac-a b{font-weight:800}
.ac-think{display:flex;gap:4px;padding:6px 0}.ac-think i{width:7px;height:7px;border-radius:50%;background:var(--muted);opacity:.5;animation:think 1s infinite}.ac-think i:nth-child(2){animation-delay:.15s}.ac-think i:nth-child(3){animation-delay:.3s}
@keyframes think{50%{opacity:1;transform:translateY(-3px)}}
.ac-items{display:flex;gap:8px;flex-wrap:wrap}
.ac-item{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:7px 10px 7px 7px;font-size:12.5px;background:var(--bg);animation:acin .35s both}
.ac-item .em{width:34px;height:34px;border-radius:10px;background:var(--bg2);display:grid;place-items:center;font-size:18px}.ac-item b{display:block;font-size:13px}.ac-item small{color:var(--muted)}
.ac-tool{align-self:flex-start;font:600 12px/1 ui-monospace,Menlo,monospace;color:var(--spot);background:color-mix(in srgb,var(--spot) 10%,transparent);border-radius:99px;padding:7px 11px}
.ac-tool.ok::after{content:' ✓';color:var(--ok)}
.ac-input{display:flex;align-items:center;gap:2px;margin:10px;border:1.5px solid var(--line);border-radius:16px;padding:11px 12px;font-size:14.5px;min-height:46px}
.ac-input span{flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ac-input .caret{width:2px;height:18px;background:var(--spot);animation:blinkc 1s steps(1) infinite}
.ac-input b{margin-left:auto;width:28px;height:28px;border-radius:50%;background:var(--ink);color:var(--bg);display:grid;place-items:center;font-size:14px;flex:none}
@keyframes blinkc{50%{opacity:0}}
.ac-arrow{position:relative;height:4px;border-top:3px dotted color-mix(in srgb,var(--spot) 55%,transparent)}
.ac-dot{position:absolute;left:0;top:-9px;width:16px;height:16px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 5px color-mix(in srgb,var(--spot) 22%,transparent);opacity:0}
.seeit.fly .ac-dot{animation:fly .9s ease-in-out}
@keyframes fly{0%{opacity:1;left:0}100%{opacity:1;left:calc(100% - 16px)}}
.sphone{justify-self:center;width:250px;height:500px;border-radius:44px;padding:11px;background:#16130f;box-shadow:0 2px 0 #3a332b inset,0 40px 70px -30px rgba(27,23,18,.6);transform:rotate(3deg)}
.sphone.buzz{animation:buzz .5s}
@keyframes buzz{20%,60%{transform:rotate(3deg) translateX(-4px)}40%,80%{transform:rotate(3deg) translateX(4px)}}
.sp-screen{position:relative;height:100%;border-radius:34px;overflow:hidden;background:linear-gradient(160deg,#ffb38a,#ff6a47 55%,#c93a1c)}
.sp-lock{text-align:center;color:#fff;padding-top:48px}.sp-time{font-size:56px;font-weight:600;letter-spacing:-.02em;line-height:1}.sp-date{font-size:13px;opacity:.9;margin-top:4px}
.sp-note{position:absolute;left:10px;right:10px;top:150px;background:rgba(255,255,255,.88);backdrop-filter:blur(10px);border-radius:18px;padding:10px 12px;font-size:12.5px;line-height:1.35;color:#1b1712;opacity:0;transform:translateY(-20px) scale(.96);transition:all .4s cubic-bezier(.2,1.3,.4,1)}
.sp-note.show{opacity:1;transform:none}
.sp-app{font-size:11px;color:#6f675c;margin-bottom:3px;display:flex;align-items:center;gap:6px}.sp-app .dot{width:14px;height:14px;border-radius:4px;background:#ff5a36}
.sp-page{position:absolute;inset:0;background:#fbf7f1;color:#1b1712;padding:18px 14px;transform:translateY(100%);transition:transform .45s cubic-bezier(.2,.9,.3,1);display:flex;flex-direction:column;gap:8px;font-size:13px}
.sp-page.show{transform:none}
.sp-page h4{margin:8px 0 2px;font-size:19px;letter-spacing:-.02em}.sp-page .sub{color:#6f675c;font-size:12px}
.sp-line{display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #e8e0d4;padding:6px 0}.sp-line.total{font-weight:800;border:0}
.sp-btn{margin-top:auto;border-radius:99px;padding:12px;text-align:center;font-weight:800;background:#111;color:#fff;transition:transform .12s}
.sp-btn.spot{background:#ff5a36}.sp-btn.press{transform:scale(.95)}
.sp-done{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:rgba(251,247,241,.94);font-weight:800;font-size:20px;opacity:0;transition:opacity .3s}
.sp-done.show{opacity:1}.sp-done small{display:block;font-weight:600;font-size:12.5px;color:#6f675c;margin-top:4px}
.sp-thread{display:flex;flex-direction:column;gap:6px;margin-top:6px}.sp-thread .tb{max-width:85%;padding:7px 10px;border-radius:15px;font-size:12.5px}
.sp-thread .tme{align-self:flex-end;background:#0a84ff;color:#fff}.sp-thread .tthem{background:#e9e4dc}
.sp-link{align-self:flex-end;width:80%;border-radius:14px;overflow:hidden;background:#fff;border:1px solid #e8e0d4;font-size:12px}
.sp-link .img{height:62px;background:linear-gradient(135deg,#ffb347,#ff5a36);display:grid;place-items:center;color:#fff;font-weight:800}.sp-link .cap{padding:6px 9px}
.seeit-paths{display:flex;gap:10px;justify-content:center;margin-top:26px;flex-wrap:wrap}
.sp-path{padding:9px 16px;border-radius:99px;border:1px solid var(--line);font-weight:600;font-size:14.5px;background:var(--card);color:var(--muted);transition:all .2s}
.sp-path.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
@media (prefers-reduced-motion:reduce){.ac-body>*,.ac-item{animation:none}.sphone{transform:none}}
`;

export const HANDOFF_JS = `
  const seeit=document.getElementById('see-it');
  if(seeit){
    const body=document.getElementById('acBody'),typed=document.getElementById('acType'),note=document.getElementById('spNote'),msg=document.getElementById('spMsg'),page=document.getElementById('spPage'),phone=seeit.querySelector('.sphone');
    const paths=[...seeit.querySelectorAll('.sp-path')];
    const S=[
      {path:'self',ask:'find me a blue hoodie, medium, something cozy under $70, and send me a Spot',
       say:'Found a good one: heavyweight, navy, true to size.',items:[['🧥','Heavyweight hoodie','Navy · M · Northwind Co.','$64']],
       sms:'Spot: Your cart is ready. Heavyweight hoodie from Northwind Co., $69.76. Review and finish here: spotmeplease.com/c/x7Qh Reply STOP to opt out.',
       lines:[['Heavyweight hoodie · M','$64.00'],['Price changes (unused back)','$3.20'],['Spot fee','$2.56'],['Total','$69.76']],done:['Ordered 📦','Northwind Co. · arrives Tue']},
      {path:'other',ask:'put together a beach weekend fit under $150 (linen shirt, shorts, sandals) and ask my mom to spot me',
       say:'Here’s the fit, all from Coastline Supply. I made Mom a Spot 👇',items:[['👕','Linen shirt','Sand · M','$58'],['🩳','Drawstring shorts','Navy · 32','$42'],['🩴','Slide sandals','Size 10','$38']],
       mom:true,done:['Mom spotted you 💸','Coastline Supply · ships to you']},
      {path:'self',ask:'earliest train to NYC saturday morning, send me a Spot',
       say:'Northeast Regional 170 leaves Philly 7:05am, in at 8:31. $53.',items:[['🚆','NE Regional 170','Sat · PHL 7:05 → NYP 8:31','$53']],
       sms:'Spot: Your train is ready to book. Sat, Oct 10, 7:05 AM–8:31 AM · Coach · 1 passenger, Amtrak, $57.77. Add who\\'s riding and finish here: spotmeplease.com/c/m2Lp Reply STOP to opt out.',
       lines:[['NE Regional 170 · Coach','$53.00'],['Fare changes (unused back)','$2.65'],['Spot fee','$2.12'],['Total','$57.77']],done:['Booked 🚆','Amtrak emails your e-ticket']}
    ];
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const el=(cls,html)=>{const d=document.createElement('div');d.className=cls;d.innerHTML=html;return d};
    const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const item=i=>'<div class="ac-item"><span class="em">'+i[0]+'</span><span><b>'+esc(i[1])+'</b><small>'+esc(i[2])+'</small></span><b style="margin-left:6px">'+i[3]+'</b></div>';
    const reset=()=>{body.innerHTML='';typed.textContent='';note.classList.remove('show');page.classList.remove('show');page.innerHTML=''};
    const show=(s)=>{ // the end state, for reduced motion
      body.append(el('ac-u',esc(s.ask)),el('ac-a',esc(s.say)),el('ac-items',s.items.map(item).join('')),el('ac-tool ok','→ Spot · '+(s.mom?'create_spot_ask':s.items[0][0]==='🚆'?'create_train_ask':'create_spot_ask')));
      paths.forEach(p=>p.classList.toggle('on',p.dataset.path===s.path))};
    const play=async(s)=>{
      reset();paths.forEach(p=>p.classList.toggle('on',p.dataset.path===s.path));
      for(let i=1;i<=s.ask.length;i++){typed.textContent=s.ask.slice(0,i);await wait(26)}
      await wait(350);typed.textContent='';body.append(el('ac-u',esc(s.ask)));
      const th=el('ac-think','<i></i><i></i><i></i>');await wait(300);body.append(th);await wait(1100);th.remove();
      body.append(el('ac-a',esc(s.say)));await wait(500);
      const box=el('ac-items','');body.append(box);for(const i of s.items){box.insertAdjacentHTML('beforeend',item(i));await wait(320)}
      await wait(400);const tool=el('ac-tool','→ Spot · '+(s.mom?'create_spot_ask':s.items[0][0]==='🚆'?'create_train_ask':'create_spot_ask'));body.append(tool);await wait(700);tool.classList.add('ok');
      body.append(el('ac-a',s.mom?'Sent Mom the link with a note from you 🧡':'Sent you a Spot. Check your texts 📲'));
      seeit.classList.remove('fly');void seeit.offsetWidth;seeit.classList.add('fly');await wait(900);
      if(s.mom){
        page.innerHTML='<div class="sub">Messages · Mom</div><div class="sp-thread"><div class="tb tme">ok don’t laugh, beach weekend fit 🙈</div><div class="sp-link"><div class="img">psst… spot me?</div><div class="cap"><b>Coastline Supply · 3 items</b><br>$150.42 · tap to spot</div></div></div><div class="sp-done" id="spDone"></div>';
        page.classList.add('show');await wait(1300);
        page.querySelector('.sp-thread').insertAdjacentHTML('beforeend','<div class="tb tthem">omg fine 😂</div>');await wait(900);
      }else{
        msg.textContent=s.sms;note.classList.add('show');phone.classList.remove('buzz');void phone.offsetWidth;phone.classList.add('buzz');await wait(1900);
        page.innerHTML='<div class="sub">spotmeplease.com</div><h4>'+(s.items[0][0]==='🚆'?'Your train is ready 🚆':'Your cart is ready 🛒')+'</h4>'+s.lines.map((l,i)=>'<div class="sp-line'+(i===s.lines.length-1?' total':'')+'"><span>'+esc(l[0])+'</span><span>'+l[1]+'</span></div>').join('')+'<div class="sp-btn" id="spBtn">Pay '+s.lines[s.lines.length-1][1]+'</div><div class="sp-done" id="spDone"></div>';
        page.classList.add('show');await wait(1400);const b=document.getElementById('spBtn');b.classList.add('press');await wait(160);b.classList.remove('press');await wait(300);
      }
      const d=document.getElementById('spDone');d.innerHTML=esc(s.done[0])+'<small>'+esc(s.done[1])+'</small>';d.classList.add('show');spotConfetti(phone,'50%','45%',30);
      await wait(3200);
    };
    if(reduce)show(S[0]);
    else{let started=false;new IntersectionObserver(async es=>{if(!es[0].isIntersecting||started)return;started=true;for(let k=0;;k++)await play(S[k%S.length])},{threshold:.3}).observe(seeit)}
  }
`;

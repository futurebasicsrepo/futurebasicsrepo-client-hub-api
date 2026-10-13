// The public website at "/". The app itself lives at /new.
// Visuals are the real product: the share card is rendered by sharecard.js
// (/site/card-*.png) and the mascot is the same SVG the app uses.
import { HOME_SCREEN_TAGS } from './appicon.js';
import { assetUrl, logoFaceCss } from './assets.js';
import { buddySvg } from './pages.js';
import { STANDARDS_CSS, standardsStrip } from './standards.js';
import { FX_CSS, FX_JS, byeFooter, circleMark, storySection } from './sitefx.js';
import { HANDOFF_CSS, HANDOFF_JS, SPOTFX_CSS, SPOTFX_JS, guideSpot, handoffSection, spotBuddy, yesStage } from './spotfx.js';

const buddyNoId = (happy) => buddySvg(happy).replace(' id="buddy"', '');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SITE_CSS = `
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-400.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-600.woff2) format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-800.woff2) format('woff2');font-weight:800;font-display:swap}
:root{--bg:#fbf7f1;--bg2:#f4ece1;--card:#fff;--ink:#1b1712;--muted:#6f675c;--line:#e8e0d4;--spot:#ff5a36;--spot2:#ffb347;--ok:#1d8a52;--night:#16130f;--night2:#221d18;
  /* the one cool accent: your AI's side of things (Spot's side is warm) */
  --ai:#5b5bd6;
  --ease-soft:cubic-bezier(.45,0,.25,1);--ease-out:cubic-bezier(.16,1,.3,1);--ease-spring:cubic-bezier(.34,1.56,.64,1);
  --radius:20px;--r-md:14px;--r-sm:10px;--wrap:1200px;--gutter:20px;--sec:clamp(72px,9vw,112px);
  --sh-1:0 1px 2px rgba(27,23,18,.05),0 4px 14px -8px rgba(27,23,18,.16);--sh-2:0 1px 2px rgba(27,23,18,.04),0 16px 36px -20px rgba(27,23,18,.28);--sh-3:0 2px 4px rgba(27,23,18,.04),0 28px 56px -28px rgba(27,23,18,.34)}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--bg2:#1b1814;--card:#1f1b17;--ink:#f4efe8;--muted:#a79e92;--line:#322d27;--spot:#ff6a47;--night:#0e0c0a;--night2:#1a1612;--ai:#9a98ff;
  --sh-1:0 1px 2px rgba(0,0,0,.3),0 4px 14px -8px rgba(0,0,0,.5);--sh-2:0 1px 2px rgba(0,0,0,.25),0 16px 36px -20px rgba(0,0,0,.6);--sh-3:0 2px 4px rgba(0,0,0,.25),0 28px 56px -28px rgba(0,0,0,.7)}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 Bricolage,ui-sans-serif,-apple-system,system-ui,sans-serif;overflow-x:hidden;padding-top:env(safe-area-inset-top,0px)}
/* Home-screen app on iPhone: pages scroll under a solid strip, not the status bar. */
body::before{content:'';position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);background:var(--bg);z-index:40;pointer-events:none}
a{color:inherit}img{max-width:100%;height:auto;display:block}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 var(--gutter)}
h1,h2,h3{font-weight:800;letter-spacing:-.035em;line-height:1.04;margin:0;text-wrap:balance}
h1{font-size:clamp(40px,6vw,76px);line-height:1}h2{font-size:clamp(32px,4.4vw,52px)}h3{font-size:21px;letter-spacing:-.02em;line-height:1.2}
p{margin:0}.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;min-height:52px;padding:0 24px;font-weight:800;font-size:17px;line-height:1;text-decoration:none;border:0;cursor:pointer;font-family:inherit;white-space:nowrap;transition:transform .15s,background-color .15s,border-color .15s,box-shadow .15s}
.btn:active{transform:scale(.98)}
.btn.primary{background:var(--spot);color:#fff;box-shadow:0 1px 0 rgba(255,255,255,.18) inset,0 8px 20px -10px color-mix(in srgb,var(--spot) 70%,transparent)}
.btn.primary:hover{background:color-mix(in srgb,var(--spot) 90%,#000)}
.btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.btn.ghost:hover{border-color:color-mix(in srgb,var(--ink) 30%,var(--line))}
/* focus rings are stitched, like Spot's seams */
:where(a,button,summary,input,select,textarea,[tabindex]):focus-visible{outline:2px dashed var(--spot);outline-offset:3px}
::selection{background:color-mix(in srgb,var(--spot) 24%,transparent)}
.pill{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;padding:6px 12px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.pill i{width:7px;height:7px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 3px color-mix(in srgb,var(--spot) 20%,transparent)}
.sec{padding:var(--sec) 0}.sec.alt{background:var(--bg2)}
.kicker{font-weight:700;color:var(--spot);letter-spacing:.06em;text-transform:uppercase;margin-bottom:14px;font-size:13px}
.lead{font-size:clamp(17px,1.6vw,20px);line-height:1.55;color:var(--muted);max-width:620px;margin-top:18px}

/* nav: one row at every width. Links fold into "More" (then "Menu") instead of wrapping. */
nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:20;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .2s}
nav.scrolled{border-bottom-color:var(--line)}
nav>.wrap{max-width:var(--wrap);display:flex;align-items:center;gap:8px;height:68px;white-space:nowrap}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;letter-spacing:-.03em;text-decoration:none;flex:none}
.logo span{width:20px;height:20px;flex:none;border-radius:50%;background:var(--spot);box-shadow:0 0 0 4px color-mix(in srgb,var(--spot) 20%,transparent)}
/* the logo is Spot's face: the plush, head only */
nav .logo span{width:30px;height:30px}
${logoFaceCss('.logo span')}
nav .links{display:flex;align-items:center;gap:2px;margin-left:auto;font-weight:600;font-size:15px}
nav .links>a,nav .navmore summary{display:flex;align-items:center;gap:4px;height:40px;padding:0 12px;border-radius:var(--r-sm);text-decoration:none;color:var(--muted);transition:color .15s,background-color .15s;cursor:pointer}
nav .links>a:hover,nav .navmore summary:hover,nav .navmore[open] summary{color:var(--ink);background:color-mix(in srgb,var(--ink) 6%,transparent)}
nav .links>a[aria-current]{color:var(--ink)}
nav details.navmore{position:relative;border:0;padding:0}
nav .navmore summary{font-size:15px;font-weight:600;letter-spacing:0;justify-content:flex-start}nav .navmore summary::after{content:none}
nav .navmore summary{list-style:none}nav .navmore summary::-webkit-details-marker{display:none}
nav .navmore summary svg{transition:transform .2s;opacity:.7}nav .navmore[open] summary svg{transform:rotate(180deg)}
nav .navmore .ml-menu{display:none}
nav .menu{position:absolute;right:0;top:calc(100% + 8px);min-width:220px;display:flex;flex-direction:column;padding:6px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-3)}
nav .menu a{display:none;padding:0 12px;height:44px;align-items:center;border-radius:var(--r-sm);text-decoration:none;color:var(--ink);font-weight:600}
nav .menu a:hover{background:color-mix(in srgb,var(--ink) 6%,transparent)}nav .menu a[aria-current]{color:var(--spot)}
nav .menu .m3{display:flex}
nav .menu .mstaff{display:flex}nav .menu a[hidden]{display:none}
nav .navacts{display:flex;align-items:center;gap:8px;margin-left:12px;flex:none}
nav .btn{min-height:40px;padding:0 16px;font-size:15px}
@media (max-width:1180px){nav .links .p2{display:none}nav .menu .m2{display:flex}}
@media (max-width:900px){nav .links .p1{display:none}nav .menu .m1{display:flex}nav .navmore .ml-more{display:none}nav .navmore .ml-menu{display:inline}}
@media (max-width:600px){nav .links>a,nav #navAcct{display:none}nav .links{margin-left:auto}nav .menu a{display:flex}nav .navmore summary{padding:0 10px}nav .navacts{margin-left:4px}nav>.wrap{height:64px}nav .btn{min-height:44px;padding:0 15px}}
@media (max-width:380px){nav .btn{padding:0 12px;font-size:14px}.logo{font-size:20px;gap:8px}nav .navacts{gap:6px}}

/* hero */
.hero{padding:64px 0 90px;position:relative}
.hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center}
.hero h1 em{font-style:normal;color:var(--spot)}
.hero .grid>*{min-width:0}@media (max-width:520px){.hero h1{font-size:clamp(30px,9.6vw,44px)}}
.hero .cta{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}
.hero .fine{margin-top:16px;font-size:14px;color:var(--muted)}
.hero .buddy{position:absolute;right:max(2vw,8px);top:14px;width:84px;height:84px;animation:bob 3.2s ease-in-out infinite}
@keyframes bob{50%{transform:translateY(-6px)}}
@media (max-width:900px){.hero .grid{grid-template-columns:1fr}.hero .buddy{display:none}.hero{padding-top:36px}}

/* phone */
.phone{width:min(360px,100%);margin:0 auto;border-radius:48px;background:#0d0d0f;padding:12px;box-shadow:0 40px 80px rgba(27,23,18,.22),0 0 0 1px rgba(0,0,0,.08);transform:rotate(2deg)}
.screen{background:#fff;border-radius:38px;height:620px;overflow:hidden;position:relative;color:#000;font-family:-apple-system,system-ui,sans-serif}
.screen .top{display:flex;flex-direction:column;align-items:center;padding:30px 0 10px;border-bottom:1px solid #eee;background:#f8f8f8}
.screen .avatar{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#b8a99a,#8c7b6b);color:#fff;display:grid;place-items:center;font-weight:600}
.screen .who{font-size:12px;margin-top:4px;color:#333}
.thread{padding:14px 12px;display:flex;flex-direction:column;gap:7px}
.b{max-width:78%;padding:8px 13px;border-radius:19px;font-size:15px;line-height:1.3;opacity:0;transform:translateY(8px) scale(.97);transition:all .35s cubic-bezier(.2,.9,.3,1.2)}
.b.me{align-self:flex-end;background:#0a84ff;color:#fff}.b.them{align-self:flex-start;background:#e9e9eb}
.b.shown{opacity:1;transform:none}
.b.linkcard{padding:0;overflow:hidden;background:#e9e9eb;width:82%;max-width:82%}
.linkcard .imgs{position:relative;aspect-ratio:1200/630}
.linkcard .imgs img{position:absolute;inset:0;width:100%;height:100%;transition:opacity .6s}
.linkcard .imgs .covered{opacity:0}.linkcard.flip .imgs .covered{opacity:1}
.linkcard .cap{padding:7px 11px;font-size:13px;font-weight:600;color:#111}.linkcard .cap small{display:block;color:#888;font-weight:400}
@media (prefers-reduced-motion:reduce){.b{opacity:1;transform:none;transition:none}.hero .buddy{animation:none}}

/* chips */
.strip{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:10px}
.strip span{padding:9px 15px;border-radius:99px;border:1px solid var(--line);background:var(--card);font-weight:600;font-size:15px;color:var(--muted)}

/* steps */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:54px}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:26px;display:flex;flex-direction:column;gap:12px}
.step .n{width:38px;height:38px;border-radius:50%;background:var(--spot);color:#fff;display:grid;place-items:center;font-weight:800}
.step .vis{margin-top:auto;border-radius:16px;background:var(--bg);border:1px solid var(--line);padding:14px;font-size:15px;min-height:128px;display:flex;flex-direction:column;justify-content:center;gap:8px}
.fake-input{background:var(--card);border:2px solid var(--line);border-radius:14px;padding:10px 12px;color:var(--muted)}
.fake-input b{color:var(--ink);font-weight:600}
.fake-btn{align-self:flex-end;background:var(--spot);color:#fff;font-weight:800;border-radius:10px;padding:6px 12px;font-size:14px}
.ordered{display:flex;align-items:center;gap:10px;font-weight:800}.ordered i{font-style:normal;font-size:26px}
@media (max-width:860px){.steps{grid-template-columns:1fr}}

/* features */
.feats{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:54px}
.feat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:28px}
.feat .ic{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:18px;color:var(--spot);background:color-mix(in srgb,var(--spot) 12%,transparent)}.feat .ic svg{width:22px;height:22px}
.feat p{color:var(--muted);margin-top:10px}
@media (max-width:760px){.feats{grid-template-columns:1fr 1fr;gap:10px;margin-top:30px}.feat{padding:16px}.feat .ic{width:36px;height:36px;margin-bottom:10px}.feat h3{font-size:17px}.feat p{font-size:14px;margin-top:6px}}@media (max-width:380px){.feats{grid-template-columns:1fr}}

/* compare */
.tablewrap{margin-top:46px;overflow-x:auto;border-radius:var(--radius);border:1px solid var(--line);background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:16px}
th,td{padding:16px 18px;text-align:center;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;font-weight:600}
tr:last-child td{border-bottom:0}
thead th{font-size:15px;color:var(--muted);font-weight:600}
thead th.us{color:var(--spot);font-weight:800;font-size:17px}
td.us{background:color-mix(in srgb,var(--spot) 7%,transparent);font-weight:800}
tr.cost td{font-weight:800}
.price{margin:18px auto 0;max-width:640px;text-align:center;color:var(--muted);font-size:15px}
.price b{color:var(--ink)}
.swipe{display:none}
@media (max-width:640px){
  table{min-width:560px;font-size:14px}
  th,td{padding:12px 10px}
  th:first-child,td:first-child{position:sticky;left:0;z-index:1;background:var(--card);width:150px;min-width:150px;box-shadow:1px 0 0 var(--line)}
  thead th{font-size:13px}
  .swipe{display:block;margin:8px 0 0;text-align:right;color:var(--muted);font-size:13px}
}
.y{color:var(--ok);font-weight:800}.n{color:var(--muted)}

/* uses */
/* what you can ask for */
.asks{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:40px}
.askc{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px;display:grid;gap:8px;align-content:start}
.askc .e{font-size:30px;line-height:1}
.askc h3{font-size:19px;margin:0}
.askc .q{font-weight:700;font-size:15px;background:color-mix(in srgb,var(--spot) 11%,var(--card));border-radius:14px 14px 14px 4px;padding:7px 12px;justify-self:start}
.askc p{color:var(--muted);font-size:15px;margin:0}
@media (max-width:860px){.asks{grid-template-columns:1fr 1fr}}@media (max-width:520px){.asks{grid-template-columns:1fr;gap:10px;margin-top:28px}.askc{grid-template-columns:auto 1fr;column-gap:12px;padding:16px}.askc .e{grid-row:1/4;font-size:26px}}
/* Phones: builders and stores get the words and a link; the demos are for big screens. */
@media (max-width:760px){.agentwin,.storedemo{display:none}}
.toolsmore{margin-top:22px}.toolsmore summary{cursor:pointer;font-weight:700}
.toolsmore .tools{margin-top:12px}
.stdh{margin-top:46px;font-size:22px}.stdp{color:var(--muted);margin-top:8px;max-width:620px}
.joinmore{max-width:560px;margin:30px auto 0;text-align:left}.joinmore summary{cursor:pointer;color:var(--muted);font-weight:600;text-align:center}
.join .cta{display:flex;gap:12px;flex-wrap:wrap}
.uses{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:54px}
.use{border-radius:var(--radius);padding:28px;color:#fff;min-height:240px;display:flex;flex-direction:column;gap:10px}
.use:nth-child(1){background:linear-gradient(150deg,#ff5a36,#ff8a3d)}
.use:nth-child(2){background:linear-gradient(150deg,#2b2520,#453830)}
.use:nth-child(3){background:linear-gradient(150deg,#176b41,#1d8a52)}
.use .q{margin-top:auto;background:rgba(255,255,255,.16);border-radius:16px 16px 16px 5px;padding:10px 14px;font-weight:600;align-self:flex-start}
.use p{opacity:.92}
@media (max-width:860px){.uses{grid-template-columns:1fr}}

/* agents */
.agents{background:var(--night);color:#f4efe8}
.agents .grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.agents .lead{color:#b9afa3}
.tools{margin-top:26px;display:flex;flex-direction:column;gap:12px}
.tool{display:flex;gap:14px;align-items:baseline}
.tool code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--spot2);font-size:15px;white-space:nowrap}
.tool span{color:#b9afa3;font-size:15px}
pre{margin:0;background:var(--night2);border:1px solid #2e2821;border-radius:18px;padding:22px;overflow-x:auto;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e9e2d8}
pre .k{color:#ffb347}pre .s{color:#8fd6a8}pre .c{color:#7d7368}
.agents .btn.ghost{color:#f4efe8;border-color:#3a332b}
@media (max-width:900px){.agents .grid{grid-template-columns:1fr}pre{font-size:12px;padding:16px}}

/* safety */
.rulecard,.storedemo{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px;box-shadow:0 20px 50px -30px rgba(0,0,0,.35);max-width:440px;justify-self:center;width:100%}
.rc-head{display:flex;justify-content:space-between;align-items:baseline;font-weight:800;font-size:18px;margin-bottom:10px}.rc-head small{font-weight:600;color:var(--muted);font-size:13px}
.rc-row{display:flex;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--line);font-size:15px}.rc-row span{color:var(--muted)}
.rc-log{margin-top:12px;display:grid;gap:7px;font-size:14px}.rc-log div{display:flex;gap:8px;align-items:center}.rc-log em{font-style:normal;color:var(--muted);font-size:12px}
.rc-log i{width:9px;height:9px;border-radius:50%;flex:none;background:var(--ok)}.rc-log i.warn{background:var(--spot2)}.rc-log i.no{background:var(--spot)}
.sd-line{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line);font-size:15px}.sd-line.total{font-weight:800;border-bottom:0}
.sd-btn{margin-top:10px;border-radius:999px;padding:14px;text-align:center;font-weight:800;display:flex;justify-content:center;align-items:center;gap:8px}.sd-btn.dark{background:var(--ink);color:var(--bg)}.sd-btn.spot{background:#ff5a36;color:#fff}.sd-btn i{width:11px;height:11px;border-radius:50%;background:#fff}
.storedemo small{display:block;text-align:center;color:var(--muted);font-size:12px;margin-top:6px}
/* shop with Spot */
.shopdemo{position:relative;background:var(--card);border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:0 24px 60px -34px rgba(0,0,0,.4);max-width:380px;width:100%;justify-self:center}
.shopdemo .ph{aspect-ratio:4/3;display:grid;place-items:center;font-size:86px;background:linear-gradient(160deg,#efe6d8,#f6efe5)}
.shopdemo .badge{position:absolute;top:12px;left:12px;background:var(--ink);color:var(--bg);font-weight:800;font-size:12px;border-radius:99px;padding:5px 10px}
.shopdemo .pb{padding:16px 18px 18px}.shopdemo .st{font-size:13px;font-weight:700;color:var(--muted);display:flex;gap:8px;align-items:center}.shopdemo .st i{font-style:normal;color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent);border-radius:99px;padding:2px 8px;font-size:12px}
.shopdemo .t{font-weight:800;font-size:19px;margin-top:4px;letter-spacing:-.01em}.shopdemo .v{color:var(--muted);font-size:14px}
.shopdemo ul{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:7px;font-size:14px}.shopdemo li{display:flex;gap:8px;align-items:flex-start}.shopdemo li span{flex:none;width:20px;text-align:center}.shopdemo li a{color:var(--muted);font-size:12px;margin-left:4px}
.shopdemo .pr{display:flex;align-items:baseline;gap:8px;margin-top:14px;font-weight:800;font-size:24px}.shopdemo .pr s{font-size:15px;color:var(--muted);font-weight:600}.shopdemo .pr small{font-size:12px;font-weight:800;color:var(--ok)}
.shopdemo .b1,.shopdemo .b2{display:block;text-align:center;border-radius:999px;padding:12px;font-weight:800;margin-top:10px}.shopdemo .b1{background:#ff5a36;color:#fff}.shopdemo .b2{border:1px solid var(--line)}
.shopdemo .tl{display:flex;justify-content:center;gap:18px;margin-top:10px;font-size:13px;color:var(--muted);font-weight:600}
.after{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:48px}.after>div{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px}.after .e{font-size:26px}.after h3{font-size:18px;margin:8px 0 6px}.after p{color:var(--muted);font-size:15px;margin:0}
.afterh{margin-top:64px;font-size:clamp(24px,3.2vw,34px);letter-spacing:-.02em}
@media (max-width:860px){.after{grid-template-columns:1fr}.shopsec .grid{grid-template-columns:1fr}}
.safe{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:46px}
.safe div{border-top:3px solid var(--spot);padding-top:16px}
.safe p{color:var(--muted);margin-top:8px;font-size:16px}
@media (max-width:860px){.safe{grid-template-columns:1fr 1fr}}@media (max-width:520px){.safe{grid-template-columns:1fr}}

/* faq */
.faq{max-width:780px;margin:46px auto 0}
details{border-bottom:1px solid var(--line);padding:20px 0}
summary{cursor:pointer;font-weight:800;font-size:19px;letter-spacing:-.015em;list-style:none;display:flex;justify-content:space-between;gap:16px}
summary::-webkit-details-marker{display:none}
summary::after{content:'+';color:var(--spot);font-size:26px;line-height:1;transition:transform .2s}
details[open] summary::after{transform:rotate(45deg)}
details p{color:var(--muted);margin-top:12px}

/* signup */
.join{text-align:center}
.join form{display:flex;gap:10px;max-width:560px;margin:30px auto 0;flex-wrap:wrap;justify-content:center}
.join input,.join select{font:inherit;font-size:16px;padding:14px 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--card);color:var(--ink);flex:1 1 220px;min-width:0}
.join select{flex:0 1 auto}
.join .msg{margin-top:14px;font-weight:600;min-height:1.5em}
.hp{position:absolute;left:-9999px}

/* hero stage: floating callouts + tilt */
.stage{position:relative;perspective:1200px;width:min(360px,100%);margin:0 auto}
.stage .phone{transition:transform .25s ease-out;will-change:transform}
.float{position:absolute;z-index:2;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px 14px;font-weight:600;font-size:14px;box-shadow:0 14px 34px rgba(27,23,18,.14);display:flex;gap:8px;align-items:center;animation:drift 6s ease-in-out infinite;white-space:nowrap}
.float b{color:var(--spot)}
.float.f4{left:-12%;top:18%;animation-delay:-1s}.float.f5{left:calc(100% - 96px);bottom:1%;animation-delay:-3s}
.modes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:24px 0 4px;max-width:560px}
.mode{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-radius:18px;background:var(--card);border:1.5px solid var(--line);text-decoration:none;color:var(--ink);transition:transform .2s,border-color .2s,box-shadow .2s}
.mode:hover{transform:translateY(-2px) rotate(-.5deg);border-color:var(--spot);box-shadow:0 12px 26px rgba(27,23,18,.1)}
.mode .mi{font-size:26px;line-height:1}.mode b{display:block;font-size:17px}.mode small{display:block;color:var(--muted);font-size:14px;line-height:1.35;margin-top:2px}
@media (max-width:520px){.modes{grid-template-columns:1fr}}
.handoff .grid,#rules .grid,.stores .grid,.shopsec .grid{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
@media (max-width:900px){.handoff .grid,#rules .grid,.stores .grid,.shopsec .grid{grid-template-columns:1fr}}
.handoff .phone{transform:rotate(-2deg)}
.ticks{list-style:none;padding:0;margin:22px 0 0;display:grid;gap:12px}
.ticks li{position:relative;padding-left:34px;color:var(--muted)}.ticks li b{color:var(--ink)}
.ticks li::before{content:'✓';position:absolute;left:0;top:1px;width:22px;height:22px;border-radius:50%;background:color-mix(in srgb,var(--spot) 14%,transparent);color:var(--spot);font-weight:800;font-size:13px;display:grid;place-items:center}
.screen .avatar.ai{background:linear-gradient(135deg,#ff5a36,#ffb347);font-size:20px}
.b.tripcard{padding:0;width:84%;max-width:84%;background:#fff;border:1px solid #e3e3e6;box-shadow:0 6px 18px rgba(0,0,0,.08)}
.tc{padding:12px 13px 10px;position:relative}
.tr{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center}.tr b{display:block;font-size:17px}.tr span{font-size:11px;color:#777;font-weight:700;letter-spacing:.05em}
.tl{text-align:center}.tl i{display:block;height:2px;background:#ddd;position:relative;margin:0 2px}.tl i::after{content:'✈';position:absolute;right:-5px;top:-9px;font-style:normal;font-size:12px;color:#ff5a36}.tl em{font-style:normal;font-size:10px;color:#888}
.tm{display:flex;justify-content:space-between;font-size:12px;color:#666;margin-top:8px}.tm .tp{font-weight:800;color:#111;font-size:14px}
.tb,.tdone{margin-top:9px;border-radius:10px;padding:8px;text-align:center;font-weight:700;font-size:13px;transition:opacity .4s,transform .4s}
.tb{background:#ff5a36;color:#fff}.tdone{background:#e7f6ee;color:#1d8a52;position:absolute;left:13px;right:13px;bottom:10px;opacity:0;transform:scale(.9)}
.tripcard.done .tb{opacity:0}.tripcard.done .tdone{opacity:1;transform:none}
.float.f1{left:-4%;top:14%}.float.f2{left:calc(100% - 96px);top:52%;animation-delay:-2s}.float.f3{left:calc(100% - 120px);bottom:10%;animation-delay:-4s}
@keyframes drift{0%,100%{transform:translateY(0) rotate(-1.5deg)}50%{transform:translateY(-12px) rotate(1deg)}}
@media (max-width:1180px){.float{display:none}}

/* marquee */
.marquee{padding:24px 0 8px;overflow:hidden;display:flex;flex-direction:column;gap:12px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mrow{display:flex;gap:12px;width:max-content;animation:slide 70s linear infinite}
.mrow.rev{animation-direction:reverse;animation-duration:84s}
.marquee:hover .mrow{animation-play-state:paused}
@keyframes slide{to{transform:translateX(-50%)}}
.ask{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:var(--r-md);padding:10px 16px 10px 10px;min-width:270px}
.ask .em{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;font-size:21px;background:var(--bg2);flex:none}
.ask b{display:block;font-size:15px;line-height:1.2}.ask small{color:var(--muted);font-size:13px}
.ask .amt{margin-left:auto;font-weight:800;font-size:15px}
.ask .tag{font-size:12px;font-weight:700;color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent);padding:3px 9px;border-radius:99px;margin-left:8px}
@media (prefers-reduced-motion:reduce){.mrow{animation:none;flex-wrap:wrap;width:auto;justify-content:center;padding:0 var(--gutter)}.mrow .ask:nth-child(n+7){display:none}.mrow.rev{display:none}.float{animation:none}}
@media (prefers-reduced-motion:reduce) and (max-width:600px){.mrow .ask:nth-child(n+4){display:none}.ask{min-width:0;width:100%}}
@media (max-width:600px){.sec .cta .btn{flex:1 1 100%}}

/* staggered steps */
.steps .step:nth-child(2){transition-delay:.12s}.steps .step:nth-child(3){transition-delay:.24s}
.feats .feat:nth-child(2),.uses .use:nth-child(2),.safe div:nth-child(2){transition-delay:.1s}
.feats .feat:nth-child(3),.uses .use:nth-child(3),.safe div:nth-child(3){transition-delay:.2s}
.feats .feat:nth-child(4),.safe div:nth-child(4){transition-delay:.3s}
.step,.feat,.use{transition:opacity .6s,transform .6s,box-shadow .25s,translate .25s}
.step:hover,.feat:hover{translate:0 -2px}

/* agent demo */
.agentwin{background:var(--night2);border:1px solid #2e2821;border-radius:var(--radius);overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
.agentwin .bar{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid #2e2821;color:#9a8f82;font-size:13px}
.agentwin .bar i{width:10px;height:10px;border-radius:50%;background:#3a332b}
.agentwin .bar span{margin-left:8px}
.agentlog{padding:18px;display:flex;flex-direction:column;gap:10px;min-height:430px;font-size:15px}
.al{opacity:0;transform:translateY(6px);transition:all .35s}.al.on{opacity:1;transform:none}
.al.user{align-self:flex-end;background:var(--spot);color:#fff;border-radius:16px 16px 4px 16px;padding:9px 13px;max-width:82%}
.al.bot{align-self:flex-start;color:#eee6da;max-width:90%}
.al.call{align-self:flex-start;font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--spot2);background:#2a241d;border:1px solid #3a322a;border-radius:10px;padding:6px 10px}
.al.call em{font-style:normal;color:#8fd6a8}
.al.event{align-self:center;font-size:13px;font-weight:700;color:#8fd6a8;background:rgba(29,138,82,.15);border-radius:99px;padding:5px 12px}
.al.card{align-self:flex-start;width:70%;border-radius:14px;overflow:hidden;border:1px solid #3a322a}
.caret{display:inline-block;width:8px;height:1.1em;background:#eee6da;vertical-align:-2px;margin-left:2px;animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.agents .more{margin-top:18px;color:#b9afa3;font-size:15px}.agents .more a{color:#fff}

footer{padding:40px 0 56px;color:var(--muted);font-size:15px;border-top:1px solid var(--line)}
footer .wrap{display:flex;gap:12px 20px;flex-wrap:wrap;align-items:center}
footer a{text-decoration:none}footer a:hover{color:var(--ink)}footer .sp{margin-left:auto}
footer .flinks{display:flex;flex-wrap:wrap;gap:8px 22px;flex-basis:100%;padding-top:6px;font-size:14.5px}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s,transform .6s}.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
`;

const tick = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor" opacity=".14"/><path d="M6.2 10.3l2.4 2.4 5.2-5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const check = '<span class="y">✓</span>';
const cross = '<span class="n">—</span>';

export function siteHead({ title, desc, origin, path = '/', extraCss = '', image = 'og-site.jpg' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#ff5a36">${HOME_SCREEN_TAGS}
<meta property="og:type" content="website"><meta property="og:site_name" content="Spot"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin)}${esc(path)}"><meta property="og:image" content="${esc(origin)}${esc(assetUrl(image))}"><meta property="og:image:width" content="2400"><meta property="og:image:height" content="1260"><meta property="og:image:alt" content="Spot, the plush, standing on a YES button: the yes button for AI shopping"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(origin)}${esc(assetUrl(image))}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16.5' r='13' fill='%23ff5a36'/%3E%3Cellipse cx='12' cy='14.5' rx='2.9' ry='3.4' fill='%23fff'/%3E%3Cellipse cx='20' cy='14.5' rx='2.9' ry='3.4' fill='%23fff'/%3E%3Ccircle cx='12.3' cy='15.3' r='1.7' fill='%231b1712'/%3E%3Ccircle cx='20.3' cy='15.3' r='1.7' fill='%231b1712'/%3E%3Cpath d='M13.4 20.2q2.6 2 5.2 0' stroke='%231b1712' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="preload" href="/fonts/bricolage-800.woff2" as="font" type="font/woff2" crossorigin>
<style>${SITE_CSS}${FX_CSS}${extraCss}</style></head><body>`;
}

// Links carry a priority: p1 stays inline longest, p2 folds into "More" at
// mid widths, p3 always lives in "More". The menu repeats every link and
// shows only the ones folded away at the current width, so nothing wraps.
const NAV_LINKS = [
  ['/connect', 'Add to your AI', 'connect', 1],
  ['/#how', 'How it works', 'how', 1],
  ['/#kidspot', 'Kid Spot', 'kidspot', 1],
  ['/agent-card', 'Your AI’s card', 'card', 2],
  ['/#agents', 'For AI builders', 'agents', 3],
  ['/#stores', 'For stores', 'stores', 3],
  ['/#rules', 'Rules for your AI', 'rules', 3],
  ['/standards', 'Open standards', 'standards', 3],
  ['/#trust', 'Trust', 'trust', 3],
  ['/#faq', 'FAQ', 'faq', 3],
];
const chevron = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function siteNav(active = '') {
  const a = ([href, label, key, p], cls) => `<a class="${cls}${p}" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav id="nav"><div class="wrap">
  <a class="logo" href="/"><span></span>Spot</a>
  <div class="links">${NAV_LINKS.filter((l) => l[3] < 3).map((l) => a(l, 'p')).join('')}<details class="navmore" id="navMore"><summary><span class="ml-more">More</span><span class="ml-menu">Menu</span>${chevron}</summary><div class="menu">${NAV_LINKS.map((l) => a(l, 'm')).join('')}<a class="macct" href="/signin?next=/account" id="navAcctM">Sign in</a><a class="mstaff" href="/admin" id="navAdminM" hidden>Admin</a><a class="mstaff" href="/admin/health" id="navHealthM" hidden>Health</a></div></details></div>
  <div class="navacts"><a class="btn ghost" href="/signin?next=/account" id="navAcct">Sign in</a><a class="btn primary" href="/new" id="navCta">Make a Spot</a></div>
</div></nav>`;
}

export function siteFooter() {
  return `<footer><div class="wrap"><a class="logo" href="/" style="font-size:18px"><span style="width:24px;height:24px"></span>Spot</a>${byeFooter(buddyNoId(true))}<span class="sp"></span><span class="flinks"><a href="/connect">Add to your AI</a><a href="/new">Make a Spot</a><a href="/agent-card">Your AI’s card</a><a href="/#rules">Rules for your AI</a><a href="/integrations">Integrations</a><a href="/#agents">For AI builders</a><a href="/integrations#stores">For stores</a><a href="/#trust">Trust</a><a href="/standards">Open standards</a><a href="/#faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></span></div></footer>`;
}

// Nav shadow, returning-user CTA, reveal-on-scroll, early-access forms.
export const SITE_JS = `
  const nav=document.getElementById('nav');
  addEventListener('scroll',()=>nav&&nav.classList.toggle('scrolled',scrollY>8),{passive:true});
  const more=document.getElementById('navMore');
  if(more){addEventListener('click',e=>{if(more.open&&(!more.contains(e.target)||e.target.closest('.menu a')))more.open=false});
    addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){more.open=false;more.querySelector('summary').focus()}})}
  try{if(localStorage.getItem('spot:me'))document.getElementById('navCta').textContent='Open Spot'}catch{}
  try{if(localStorage.getItem('spot:in'))for(const id of ['navAcct','navAcctM']){const n=document.getElementById(id);if(n){n.textContent='My Spots';n.href='/account'}}}catch{}
  // Spot team: set by the account page from /v1/me (the dashboards still check on the server).
  try{if(localStorage.getItem('spot:in')&&localStorage.getItem('spot:staff'))for(const id of ['navAdminM','navHealthM']){const n=document.getElementById(id);if(n)n.hidden=false}}catch{}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function joinList(body){const r=await fetch('/v1/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong')}
`;

export const HOME2_CSS = `
.h2demo{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:var(--sh-2)}
.h2pill{align-self:flex-start;background:var(--ink);color:var(--bg);border-radius:999px;padding:9px 16px;font-weight:700;font-size:15px}
.h2shop{display:flex;align-items:center;gap:12px;background:var(--bg);border-radius:18px;padding:12px 14px}
.h2shop i{font-style:normal;width:44px;height:44px;border-radius:12px;background:var(--bg2);display:grid;place-items:center;font-size:24px;flex:none}
.h2shop span{display:flex;flex-direction:column;flex:1;min-width:0}.h2shop small{color:var(--muted);font-size:14px}.h2shop em{font-style:normal;font-weight:800}
.h2ping{background:var(--bg);border-radius:20px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--sh-1)}
.h2ping .hd{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;font-weight:600}.h2ping .ic{width:20px;height:20px;border-radius:6px;background:var(--spot)}
.h2ping b{font-size:17px}.h2ping .acts{display:flex;gap:8px;margin-top:8px}
.h2ping .acts span{flex:1;text-align:center;border-radius:999px;padding:9px;font-weight:800;font-size:15px;background:var(--bg2)}.h2ping .acts span.go{background:var(--spot);color:#fff}
.h2ok{border-radius:16px;padding:11px 14px;font-weight:600;font-size:15px;background:color-mix(in srgb,var(--ok) 12%,var(--card))}
.builders h2{margin-bottom:24px}
.b2{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
.b2c{display:flex;flex-direction:column;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px 24px;text-decoration:none;color:var(--ink);box-shadow:var(--sh-1);transition:transform .2s var(--ease-out),box-shadow .2s}
.b2c:hover{transform:translateY(-2px);box-shadow:var(--sh-2)}
.b2c .e{font-size:28px}.b2c b{font-size:20px;letter-spacing:-.015em;line-height:1.2}.b2c small{color:var(--muted);font-size:15px;line-height:1.5}
.b2c em{font-style:normal;font-weight:800;color:var(--spot);margin-top:auto}
@media (max-width:900px){.h2demo{margin-top:28px}}
`;

export function sitePage({ origin, provider }) {
  const title = 'Spot: shop anything, from any store';
  const desc = 'Paste a link, a screenshot or a TikTok, or just say what you want. Spot finds it at the stores that have it, even ones you’ve never heard of. You, or whoever’s paying, taps yes, and Spot buys it. Kid Spot for teens, Price Shield after you buy.';
  return `${siteHead({ title, desc, origin, path: '/', extraCss: SPOTFX_CSS + HANDOFF_CSS + STANDARDS_CSS + HOME2_CSS })}

${siteNav()}

<header class="hero hero2"><div class="wrap"><div class="grid">
  <div>
    <span class="pill"><i></i>Every store, one app${provider === 'sandbox' ? ' · test mode' : ''}</span>
    <h1 style="margin-top:22px">Spot anything.<br>From <em class="circled">any store${circleMark}</em>.</h1>
    <p class="lead">Paste a link, a screenshot or a TikTok, or just say what you want. Spot finds it at the stores that have it, even ones you’ve never heard of. When you, or whoever’s paying, taps yes, Spot buys it with <b>a card made for that one order</b>.</p>
    <div class="cta"><a class="btn primary" href="/new">Start spotting →</a><a class="btn ghost" href="/connect">Add Spot to your AI</a></div>
    <ul class="proof"><li>${tick}Big stores and small shops</li><li>${tick}Someone else can pay</li><li>${tick}Price Shield after you buy</li></ul>
    <p class="works">Also inside <b>Claude</b> and <b>ChatGPT</b>. The person paying doesn’t need an account.</p>
  </div>
  ${yesStage()}
</div></div></header>

<section class="marquee" aria-label="Examples of things people ask for with Spot">
  <div class="mrow"><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">👟</div><div><b>Trail runners, size 10.5</b><small>Trailhead Supply · birthday</small></div><span class="amt">$200</span></div><div class="ask"><div class="em">🛏️</div><div><b>Dorm bedding set</b><small>Hearth & Loom · move-in</small></div><span class="amt">$118</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎙️</div><div><b>Podcast mic</b><small>Signal Goods · creator fund</small></div><span class="amt">$129</span></div><div class="ask"><div class="em">💄</div><div><b>Skincare restock</b><small>Dewdrop · “pls 🥺”</small></div><span class="amt">$64</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">👟</div><div><b>Trail runners, size 10.5</b><small>Trailhead Supply · birthday</small></div><span class="amt">$200</span></div><div class="ask"><div class="em">🛏️</div><div><b>Dorm bedding set</b><small>Hearth & Loom · move-in</small></div><span class="amt">$118</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎙️</div><div><b>Podcast mic</b><small>Signal Goods · creator fund</small></div><span class="amt">$129</span></div><div class="ask"><div class="em">💄</div><div><b>Skincare restock</b><small>Dewdrop · “pls 🥺”</small></div><span class="amt">$64</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div></div>
  <div class="mrow rev" aria-hidden="true"><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">📚</div><div><b>Semester textbooks</b><small>Campus Books</small></div><span class="amt">$142</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🧥</div><div><b>The Super Puff jacket</b><small>Kiln & Co. · it’s cold</small></div><span class="amt">$250</span></div><div class="ask"><div class="em">🪴</div><div><b>Monstera + pot</b><small>Leaf Lab · housewarming</small></div><span class="amt">$58</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎨</div><div><b>Gouache set</b><small>Paper Fox · art class</small></div><span class="amt">$46</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">📚</div><div><b>Semester textbooks</b><small>Campus Books</small></div><span class="amt">$142</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🧥</div><div><b>The Super Puff jacket</b><small>Kiln & Co. · it’s cold</small></div><span class="amt">$250</span></div><div class="ask"><div class="em">🪴</div><div><b>Monstera + pot</b><small>Leaf Lab · housewarming</small></div><span class="amt">$58</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎨</div><div><b>Gouache set</b><small>Paper Fox · art class</small></div><span class="amt">$46</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div></div>
</section>

<section class="sec alt shopsec" id="shop" data-say="I read the fine print so you don’t have to 🔎"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Spot &amp; Shop</p>
    <h2 class="reveal">Everything you’d check,<br>already checked.</h2>
    <p class="lead reveal">Ask Spot for anything and every pick comes with what you’d normally open five tabs for, read from the store’s own pages, with the link to prove it.</p>
    <ul class="ticks reveal">
      <li><b>One feed for everything you find.</b> Every search lands in Shop, newest first. Sort and filter it however you like.</li>
      <li><b>The store’s own policy.</b> Price protection, free returns and how long you have, linked to the page Spot read.</li>
      <li><b>When it gets to you.</b> A delivery date for your address, not “3–7 business days.”</li>
      <li><b>Fit and reviews.</b> What buyers say, and the size to order based on the size you saved.</li>
      <li><b>The best price.</b> Spot checks other stores for the exact same thing, and tries promo codes before you pay.</li>
      <li><b>Your taste, out in the open.</b> What you open, keep and pass on shapes what Spot shows next. See what it learned and edit it any time.</li>
      <li><b>Picks aren’t for sale.</b> What Spot earns never changes what it shows you. If a cheaper store pays Spot nothing, Spot still sends you there.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/new">Start shopping →</a></div>
  </div>
  <div class="shopdemo tilt reveal" aria-label="Example: a product card on Spot">
    <span class="badge">Spot’s pick</span>
    <div class="ph" aria-hidden="true">👟</div>
    <div class="pb">
      <div class="st">Trailhead Supply <i>In stock</i></div>
      <div class="t">XT Trail Runner</div><div class="v">Black · 10.5</div>
      <ul>
        <li><span>🛡️</span><div>Price protection, 14 days <a href="#shop">source</a></div></li>
        <li><span>↩️</span><div>Free returns within 30 days</div></li>
        <li><span>🚚</span><div>Arrives Thursday</div></li>
        <li><span>⭐</span><div>4.7 from 2,140 buyers · runs half small, we’d get you an 11</div></li>
        <li><span>🏷️</span><div>Code TRAIL10 takes $13 off. Spot tried it.</div></li>
      </ul>
      <div class="pr">$129 <s>$160</s><small>lowest Spot has seen</small></div>
      <span class="b1">Pay with Spot</span><span class="b2">Let someone else pay</span>
      <div class="tl"><span>👀 Watch price</span><span>At the store ↗</span></div>
    </div>
  </div>
</div>
  <h3 class="afterh reveal" id="shield">After you buy, Price Shield keeps working.</h3>
  <div class="after">
    <div class="reveal"><div class="e">🛡️</div><h3>Price Shield</h3><p>Spot keeps watching the price for as long as the store adjusts it. If it drops, you get a ping, and one tap asks the store for the difference.</p></div>
    <div class="reveal"><div class="e">📦</div><h3>Every order, one list</h3><p>Every store’s order in one place, with tracking from the carrier.</p></div>
    <div class="reveal"><div class="e">↩️</div><h3>Returns</h3><p>Start a return from your order and Spot takes it from there. The refund goes back to whoever paid.</p></div>
  </div>
</div></section>

<section class="sec" id="discover" data-say="Shops you’ve never heard of 🧭"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Discover</p>
    <h2 class="reveal">Find the shops<br>nobody else shows you.</h2>
    <p class="lead reveal">Shopping is flat when everyone gets the same five stores. Turn on Discover and Spot skips the big-box stores, and the shops you’ve already seen, so every search turns up somewhere new.</p>
    <ul class="ticks reveal">
      <li><b>Independent and small-batch.</b> Makers and specialty shops, found for what you asked for.</li>
      <li><b>Still one tap to buy.</b> Same checkout, same Spot card, same Price Shield.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/new?discover=1">Try Discover →</a></div>
  </div>
  <div class="h2demo tilt reveal" aria-hidden="true">
    <span class="h2pill">🧭 Discover: on</span>
    <div class="h2shop"><i>🏺</i><span><b>Kiln &amp; Co.</b><small>Small-batch ceramics</small></span><em>$48</em></div>
    <div class="h2shop"><i>🧥</i><span><b>Northbound Supply</b><small>Independent outerwear</small></span><em>$210</em></div>
    <div class="h2shop"><i>🕯️</i><span><b>Hollow Pine Goods</b><small>Made by hand</small></span><em>$32</em></div>
  </div>
</div></div></section>

<section class="sec alt blobby" id="kidspot" data-say="Small stuff goes through 🧒"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Kid Spot</p>
    <h2 class="reveal">Small stuff goes through.<br>Big stuff pings you.</h2>
    <p class="lead reveal">For teens 13 to 17. Add your teen, pick the stores and a limit, and anything inside it is paid from your card on its own. Everything else comes to you for a one-tap yes.</p>
    <ul class="ticks reveal">
      <li><b>Your stores, your limit.</b> An amount that goes through on its own, a monthly cap, and the stores you approve.</li>
      <li><b>One tap for the rest.</b> A ping with what they picked, from where, and why it came to you. Approve or pass.</li>
      <li><b>Never the adults-only stuff.</b> No vapes, alcohol, CBD or worse, whatever the rules say.</li>
      <li><b>You see everything.</b> Every ask, every purchase, a receipt for each. Pause or remove any time.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/account#family">Set up Kid Spot →</a></div>
  </div>
  <div class="h2demo tilt reveal" aria-hidden="true">
    <div class="h2ping"><div class="hd"><span class="ic"></span>Spot · now</div><b>Morgan wants Dunk Low</b><span>Nike · $125.35, over your $25 limit</span><div class="acts"><span class="go">Approve</span><span>Not now</span></div></div>
    <div class="h2ok">✓ Crew socks · $18 went through on its own</div>
    <div class="h2ok">✓ Graphing calculator · $22 went through on its own</div>
  </div>
</div></div></section>

${storySection(spotBuddy("story"))}

<section class="sec" id="ask" data-say="Flights, trains, carts. Ask away ✈️🚆🛒"><div class="wrap">
  <p class="kicker reveal">What you can ask for</p>
  <h2 class="reveal">Every “can you get me this?”</h2>
  <div class="asks">
    <div class="askc reveal"><span class="e" aria-hidden="true">✈️</span><h3>Flights</h3><div class="q">“nonstop to SFO on the 17th”</div><p>Live fares, held while you decide, booked the second you pay. Your confirmation code shows up right away.</p></div>
    <div class="askc reveal"><span class="e" aria-hidden="true">🚆</span><h3>Trains</h3><div class="q">“earliest train to NYC saturday”</div><p>The exact Amtrak train your AI picked. Add who’s riding, pay, and the e-ticket lands in your inbox.</p></div>
    <div class="askc reveal"><span class="e" aria-hidden="true">🛒</span><h3>Any store’s cart</h3><div class="q">“black trail runners, 10.5”</div><p>Your AI builds the cart, Spot buys exactly that and it ships to you. Your saved sizes, already filled in.</p></div>
    <div class="askc reveal"><span class="e" aria-hidden="true">🧺</span><h3>Several stores, one link</h3><div class="q">“dorm stuff from 3 stores”</div><p>Up to 5 stores in one Spot. One payment, and Spot orders from each.</p></div>
    <div class="askc reveal"><span class="e" aria-hidden="true">🧒</span><h3>Kid Spot</h3><div class="q">“mom, can you spot me? 👀”</div><p>Back-to-school and birthday lists. Small stuff at stores you approve goes through; the rest pings you.</p></div>
    <div class="askc reveal"><span class="e" aria-hidden="true">🎙️</span><h3>Friends &amp; creators</h3><div class="q">“new mic fund 🎙️”</div><p>Treat-mes without the screenshot-and-Venmo dance, or a Spot in your bio for the gear you need.</p></div>
  </div>
</div></section>

${handoffSection()}

<section class="sec alt blobby" id="rules" data-say="Rules are rules. Even for robots 🤖"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Rules and approvers</p>
    <h2 class="reveal">Let your AI shop.<br>Keep the say.</h2>
    <p class="lead reveal">Every AI you connect gets its own rules. Inside them, it hands you the cart to finish. Outside them, it’s refused, or it goes to your approver: a parent, a partner, your finance inbox. They pay for it or turn it down.</p>
    <ul class="ticks reveal">
      <li><b>Limits.</b> A cap per order and per month, per AI.</li>
      <li><b>Only these stores.</b> An allowlist, so a kid’s AI shops at Target, not everywhere.</li>
      <li><b>An approver.</b> They agree by email first, and every ask shows exactly what the AI picked and why it came to them.</li>
      <li><b>See everything.</b> Each AI’s activity (asked, blocked, ordered) sits on your account, with an off switch that works instantly.</li>
      <li><b>Its own card, not yours.</b> Save your card once; each purchase gets a Spot card capped at the order and locked to the store. Approve with a tap, or opt in to let it pay inside the rules. <a href="/agent-card">How it works</a></li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/account">Set rules →</a><a class="btn ghost" href="#trust">How approvals are signed</a></div>
  </div>
  <div class="rulecard tilt reveal" aria-label="Example: spending rules for an AI assistant">
    <div class="rc-head"><span>🤖 claude</span><small>$84 of $200 this month</small></div>
    <div class="rc-row"><span>Max per order</span><b>$75</b></div>
    <div class="rc-row"><span>Max per month</span><b>$200</b></div>
    <div class="rc-row"><span>Only these stores</span><b>target.com, rei.com</b></div>
    <div class="rc-row"><span>Over a limit</span><b>Send to Mom</b></div>
    <div class="rc-log">
      <div><i class="ok"></i>Asked · Trail socks, REI · $18</div>
      <div><i class="warn"></i>Sent to Mom · Rain shell, REI · $129 <em>over $75</em></div>
      <div><i class="no"></i>Blocked · Sneakers, other store</div>
      <div><i class="ok"></i>Mom approved · signed ✓</div>
    </div>
  </div>
</div></div></section>

<section class="sec" id="why" data-say="I can only buy that thing. Promise."><div class="wrap">
  <p class="kicker reveal">Why Spot</p>
  <h2 class="reveal">How Spot compares.</h2>
  <div class="tablewrap reveal"><table>
    <thead><tr><th></th><th class="us">Spot</th><th>AI shopping apps</th><th>Payment requests</th><th>Shared-cart links</th></tr></thead>
    <tbody>
      <tr><td>Works with any store</td><td class="us">${check}</td><td>Some</td><td>${cross}</td><td>Some</td></tr>
      <tr><td>Works inside ChatGPT and Claude</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Someone else can pay</td><td class="us">${check}</td><td>${cross}</td><td>${check}</td><td>${check}</td></tr>
      <tr><td>Payer just taps, no checkout</td><td class="us">${check}</td><td>${cross}</td><td>${check}</td><td>${cross}</td></tr>
      <tr><td>Money can only buy the item</td><td class="us">${check}</td><td>${check}</td><td>${cross}</td><td>${check}</td></tr>
      <tr><td>Spending rules and an approver for your AI</td><td class="us">${check}</td><td>Some</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Signed proof of who approved what</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Ordered for you</td><td class="us">${check}</td><td>${check}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>The store’s own policy, with the source</td><td class="us">${check}</td><td>Some</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Claims price drops after you buy</td><td class="us">${check}</td><td>Some</td><td>${cross}</td><td>${cross}</td></tr>
      <tr class="cost"><td>What it costs</td><td class="us">$2 + card fee</td><td>Free</td><td>Free</td><td>Free</td></tr>
    </tbody>
  </table></div>
  <p class="swipe">Swipe to compare →</p>
  <p class="price reveal"><b>$2 per Spot plus card processing</b> (2.9% + 30¢), paid by whoever pays, however many stores are in it. Free when the store takes the payment directly, or when it goes straight to your Venmo or Cash App. A little extra is held for tax and price changes, and whatever the store doesn’t charge comes back.</p>
</div></section>

<section class="sec builders" id="builders"><div class="wrap">
  <p class="kicker reveal">Build with Spot</p>
  <h2 class="reveal">For AI builders and stores.</h2>
  <div class="b2 reveal">
    <a class="b2c" id="agents" href="/integrations#mcp"><span class="e">🤖</span><b>Your agent builds the cart. Spot gets the yes.</b><small>MCP and REST, signed approvals, your user’s rules enforced for you. <u>See the 7 tools</u></small><em>Get a free key →</em></a>
    <a class="b2c" id="stores" href="/integrations#stores"><span class="e">🛍️</span><b>Don’t lose the sale to “I’ll ask my mom.”</b><small>An <b>Ask someone to pay</b> button by your checkout. Paid on your own checkout when you support UCP.</small><em>Add the button →</em></a>
  </div>
</div></section>

<section class="sec" id="trust" data-say="Every yes gets signed ✍️"><div class="wrap">
  <p class="kicker reveal">Trust</p>
  <h2 class="reveal">Every yes is a person’s, and you can prove it.</h2>
  <div class="safe">
    <div class="reveal"><h3>Signed approvals</h3><p>When someone pays or taps Place order, Spot signs exactly what they approved: the store, the items, the amount, who, when, and which AI asked. Anyone can check it against Spot’s public keys.</p></div>
    <div class="reveal"><h3>Exactly that cart</h3><p>Money paid through Spot buys only those items from that store, with a single-use card nobody ever sees. No cash, gift cards or cash-outs.</p></div>
    <div class="reveal"><h3>An activity log for your AI</h3><p>What each AI asked for, what was blocked and why, what got ordered. Disconnect it and it stops that second.</p></div>
    <div class="reveal"><h3>Money back, automatically</h3><p>Canceled, not orderable, or cheaper at the store? The difference goes straight back to whoever paid.</p></div>
  </div>
  <h3 class="stdh reveal">Built on open standards</h3>
  <p class="stdp reveal">Spot speaks the protocols AI apps, stores and payment networks use, and you can check each one yourself.</p>
  ${standardsStrip()}
</div></section>


<section class="sec alt" id="faq" data-say="Ask me anything. Well, these."><div class="wrap">
  <p class="kicker reveal" style="text-align:center">FAQ</p>
  <h2 class="reveal" style="text-align:center">Questions</h2>
  <div class="faq">
    <details><summary>What does it cost?</summary><p>When the store supports agent checkout, the person paying pays the store directly and Spot is free. Otherwise, when Spot buys it for you, the payer adds a Spot fee of $2 plus card processing (2.9% + 30¢ of what they pay) and a small allowance for tax and price changes (up to 5%, at most $15) that comes back if the store doesn’t charge it. Everything is shown before they pay. “Send it straight to my Venmo or Cash App” is free too, because the money never goes through Spot.</p></details>
    <details><summary>Can I ask for things from different stores in one Spot?</summary><p>Yes. Add a cart from another store before you send it (up to 5 stores, and your AI can do the same). Whoever’s paying covers all of it in one tap, and Spot orders from each store separately. If one store can’t be ordered, they get that store’s share back automatically and the rest still ships.</p></details>
    <details><summary>What’s “pay the store directly”?</summary><p>Some stores support agent checkout (the Universal Commerce Protocol). For those, Spot sets up the store’s own checkout with exactly your cart, shipped to you, and the person paying pays the store there. The store is the seller: its receipt, its returns. Spot never holds the money or sees a card.</p></details>
    <details><summary>Can I limit what my AI spends?</summary><p>Yes. On your account, each AI you connect can have a cap per order and per month, and a list of stores it can shop at. Anything outside those is refused, or sent to your approver to pay for or turn down. You can see everything each AI did, and disconnect it any time.</p></details>
    <details><summary>What’s a signed approval?</summary><p>A record of exactly what a person said yes to (the store, items, amount, who and when, and which AI asked), signed with Spot’s key. It’s linked from receipts, your AI can fetch it, and anyone can check it against Spot’s public keys at /.well-known/spot-keys.json.</p></details>
    <details><summary>How does a store add the button?</summary><p>Register your domain on the <a href="/integrations#stores">integrations page</a> and paste two lines by your checkout. The key only works on your own domain. Put a small file on your site to verify it, and your carts show a ✓ to whoever pays.</p></details>
    <details><summary>Which stores work?</summary><p>Any online store. Spot reads links, screenshots and plain descriptions. Shopify stores are the smoothest, and stores that support agent checkout (the Universal Commerce Protocol) are ordered straight through their own checkout. Before anyone pays, Spot checks it can order from that store. If a store blocks it later and Spot can’t order within 3 days, whoever paid gets a full refund automatically.</p></details>
    <details><summary>Can my AI book flights with Spot?</summary><p>Yes. Add Spot to your assistant and ask for a flight. It searches live fares, holds the one you like and texts you a link. You add who’s flying, tap Apple Pay, and Spot books it with the airline and shows your confirmation code. If the airline can’t book it, you’re refunded right away.</p></details>
    <details><summary>Can my AI spend my money without me?</summary><p>Not unless you turn that on. By default every purchase waits for a person: you tap Approve, or whoever’s paying does. You can opt in to let one AI pay on its own, but only inside a cap per order you set, and “Stop all AI spending” on your account turns it off at once. Either way your AI never gets a card number: Spot makes a new card for each order, capped at it and locked to that store.</p></details>
    <details><summary>How do I add Spot to Claude or ChatGPT?</summary><p>The quick start at <a href=\"/connect\">spotmeplease.com/connect</a> walks you through it. In Claude, go to Settings → Connectors → Add custom connector. In ChatGPT, go to Settings → Apps &amp; Connectors → Create. Paste <code>${origin}/mcp</code>, sign in to Spot and tap Allow. That’s it: no key to copy. Your AI then shows up on your account, where you can set its rules or disconnect it.</p></details>
    <details><summary>Can my AI buy train tickets?</summary><p>Yes. Ask for a train and your AI picks the exact one (Amtrak and other operators that sell online). You add who’s riding, pay, and Spot buys that train for you. You see the operator’s real total before anything is bought, and the e-ticket comes straight to your email.</p></details>
    <details><summary>Does Spot get paid to recommend things?</summary><p>No store can pay to be picked. Spot’s picks come from what fits your ask and your taste, and Spot will point you to a cheaper store even when that store pays Spot nothing. When someone pays at a store through Spot’s link, the store may pay Spot a small commission; the price is the same for them, and the pay page says so.</p></details>
    <details><summary>What’s Discover?</summary><p>A switch on the Spot screen. With it on, Spot leaves out the big-box stores and the shops you’ve already been shown, and looks for independent and lesser-known shops that have what you asked for. Turn it off any time.</p></details>
    <details><summary>What’s Kid Spot? Who is it for?</summary><p>Teens 13 to 17, added by a parent or guardian from their Spot account. The parent picks approved stores and an amount that goes through on its own; inside that, their saved card pays and Spot orders it. Anything else pings the parent to approve in one tap. Adults-only things (alcohol, nicotine and vapes, cannabis and CBD, guns and ammunition, adult products) are never bought for a teen. Spot isn’t for anyone under 13.</p></details>
    <details><summary>What’s Price Shield? What if the price drops after I buy?</summary><p>When Spot buys it, Spot keeps checking the price for as long as the store offers price adjustments (or 30 days). If it drops by at least $1 and 3%, Spot asks the store for the difference, and when the store pays it, it goes straight back to whoever paid.</p></details>
    <details><summary>Where do the return policy and delivery dates come from?</summary><p>From the store itself. Spot reads the store’s own policy pages and shows the link next to what it found. Delivery dates come from the store’s shipping options for your address when it has them, otherwise from its stated shipping times. If Spot can’t find it, it doesn’t guess.</p></details>
    <details><summary>Does the person paying need an account?</summary><p>No. They open your link and pay with Apple Pay, Google Pay or a card. That’s it.</p></details>
    <details><summary>Why does Spot buy it instead of sending money?</summary><p>For stores that can’t take the payment directly, it’s what makes people comfortable saying yes: their money buys exactly what you asked for, and you can’t get cash instead. The person paying gets a receipt from Spot, and returns go through Spot. It also shuts out the fraud that plagues cash transfers.</p></details>
    <details><summary>What if I change my mind?</summary><p>Until Spot places the order, you can cancel from your Spot page, and the person who paid can cancel from their receipt. Either way they get a full refund. After that, returns go through Spot: when the store refunds Spot, Spot refunds whoever paid. Paid the store directly? Then the store’s own cancellation and return policy applies.</p></details>
    <details><summary>Is Spot live?</summary><p>${provider === 'sandbox' ? 'This copy of Spot runs in test mode, so no real money moves. Try the whole flow for free.' : 'Yes. Payments and Spot’s one-time cards run on Stripe.'}</p></details>
  </div>
</div></section>

<section class="sec join blobby" id="join" data-say="Go on, ask for the thing 🧡"><div class="wrap">
  <h2 class="reveal">Go ask for the thing.</h2>
  <p class="lead reveal" style="margin-left:auto;margin-right:auto">Spot anything, from any store. Or add Spot to your AI once and just ask.</p>
  <div class="cta reveal" style="justify-content:center;margin-top:26px"><a class="btn primary" href="/new">Start spotting →</a><a class="btn ghost" href="/connect">Add Spot to your AI</a></div>
  <details class="joinmore reveal"><summary>Building an agent, running a store or a creator? Get updates</summary>
  <form id="joinForm">
    <input type="email" name="email" required placeholder="you@email.com" aria-label="Email" autocomplete="email">
    <select name="kind" aria-label="I am"><option value="agent">I’m building an agent</option><option value="store">I run a store</option><option value="creator">I’m a creator</option><option value="asker">Just keep me posted</option></select>
    <input class="hp" name="company_fax" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn primary">Send me updates</button>
  </form>
  <p class="msg" id="joinMsg" aria-live="polite"></p></details>
</div></section>

${guideSpot()}
${siteFooter()}

<script>
(()=>{
${SITE_JS}
${FX_JS}
${SPOTFX_JS}
${HANDOFF_JS}
  // Agent demo: plays when scrolled into view, types the assistant's lines, loops.
  const log=document.getElementById('agentlog');
  if(log){
    const lines=[...log.children];
    const type=(el)=>new Promise(res=>{const full=el.dataset.type;if(!full||reduce){if(full)el.textContent=full;return res()}
      el.innerHTML='<span></span><i class="caret"></i>';const span=el.firstChild;let i=0;
      const tick=()=>{span.textContent=full.slice(0,++i);i<full.length?setTimeout(tick,18):(el.querySelector('.caret').remove(),res())};tick()});
    const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
    let running=false;
    const run=async()=>{if(running)return;running=true;
      for(;;){lines.forEach(l=>{l.classList.remove('on');if(l.dataset.type)l.textContent=''});await wait(500);
        for(const l of lines){l.classList.add('on');await type(l);await wait(l.classList.contains('event')?1100:l.classList.contains('call')?700:500)}
        if(reduce)break;await wait(4200)}};
    if(reduce)lines.forEach(l=>{l.classList.add('on');if(l.dataset.type)l.textContent=l.dataset.type});
    else new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){run();o.disconnect()}},{threshold:.35}).observe(log);
  }
  // "Get an API key" preselects the agent option.
  document.querySelectorAll('[data-kind]').forEach(a=>a.addEventListener('click',()=>{const k=document.querySelector('#joinForm [name=kind]');if(k)k.value=a.dataset.kind}));
  const f=document.getElementById('joinForm'),msg=document.getElementById('joinMsg');
  f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
    try{await joinList(Object.fromEntries(new FormData(f)));msg.textContent='You’re in. We’ll keep you posted 🧡';f.reset()}catch(err){msg.textContent=err.message}finally{b.disabled=false}});
})();
</script>
</body></html>`;
}

// The public website at "/". The app itself lives at /new.
// Visuals are the real product: the share card is rendered by sharecard.js
// (/site/card-*.png) and the mascot is the same SVG the app uses.
import { buddySvg } from './pages.js';
import { FX_CSS, FX_JS, byeFooter, chatWallSection, circleMark, heroNotes, noteSection, storySection } from './sitefx.js';

const buddyNoId = (happy) => buddySvg(happy).replace(' id="buddy"', '');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const SITE_CSS = `
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-400.woff2) format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-600.woff2) format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:Bricolage;src:url(/fonts/bricolage-800.woff2) format('woff2');font-weight:800;font-display:swap}
:root{--bg:#fbf7f1;--bg2:#f4ece1;--card:#fff;--ink:#1b1712;--muted:#6f675c;--line:#e8e0d4;--spot:#ff5a36;--spot2:#ffb347;--ok:#1d8a52;--night:#16130f;--night2:#221d18;--radius:22px}
@media (prefers-color-scheme:dark){:root{--bg:#141210;--bg2:#1b1814;--card:#1f1b17;--ink:#f4efe8;--muted:#a79e92;--line:#322d27;--spot:#ff6a47;--night:#0e0c0a;--night2:#1a1612}}
*{box-sizing:border-box}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.55 Bricolage,ui-sans-serif,-apple-system,system-ui,sans-serif;overflow-x:hidden}
a{color:inherit}img{max-width:100%;height:auto;display:block}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
h1,h2,h3{font-weight:800;letter-spacing:-.035em;line-height:1.02;margin:0}
h1{font-size:clamp(44px,7.4vw,86px)}h2{font-size:clamp(34px,5vw,56px)}h3{font-size:22px;letter-spacing:-.02em;line-height:1.15}
p{margin:0}.muted{color:var(--muted)}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:999px;padding:15px 24px;font-weight:800;font-size:17px;text-decoration:none;border:0;cursor:pointer;font-family:inherit;transition:transform .15s}
.btn:active{transform:scale(.97)}
.btn.primary{background:var(--spot);color:#fff;box-shadow:0 10px 28px color-mix(in srgb,var(--spot) 35%,transparent)}
.btn.ghost{background:transparent;color:var(--ink);border:1.5px solid var(--line)}
.pill{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;padding:7px 13px;border-radius:99px;background:var(--card);border:1px solid var(--line)}
.pill i{width:8px;height:8px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 4px color-mix(in srgb,var(--spot) 22%,transparent)}
.sec{padding:110px 0}.sec.alt{background:var(--bg2)}
.kicker{font-weight:600;color:var(--spot);letter-spacing:.02em;margin-bottom:14px;font-size:15px}
.lead{font-size:clamp(18px,2vw,21px);color:var(--muted);max-width:640px;margin-top:18px}

/* nav */
nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid transparent;transition:border-color .2s}
nav.scrolled{border-bottom-color:var(--line)}
nav .wrap{display:flex;align-items:center;gap:22px;height:66px}
.logo{display:flex;align-items:center;gap:10px;font-weight:800;font-size:22px;letter-spacing:-.03em;text-decoration:none}
.logo span{width:22px;height:22px;border-radius:50%;background:var(--spot);box-shadow:0 0 0 5px color-mix(in srgb,var(--spot) 22%,transparent)}
nav .links{display:flex;gap:22px;margin-left:auto;font-weight:600;font-size:15px}
nav .links a{text-decoration:none;color:var(--muted)}nav .links a:hover,nav .links a[aria-current]{color:var(--ink)}
nav .btn{padding:10px 18px;font-size:15px}
@media (max-width:760px){nav .links{display:none}nav .btn{margin-left:auto}}

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
.feat{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:30px}
.feat .ic{font-size:30px;margin-bottom:14px}
.feat p{color:var(--muted);margin-top:10px}
@media (max-width:760px){.feats{grid-template-columns:1fr}}

/* compare */
.tablewrap{margin-top:46px;overflow-x:auto;border-radius:var(--radius);border:1px solid var(--line);background:var(--card)}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:16px}
th,td{padding:16px 18px;text-align:center;border-bottom:1px solid var(--line)}
th:first-child,td:first-child{text-align:left;font-weight:600}
tr:last-child td{border-bottom:0}
thead th{font-size:15px;color:var(--muted);font-weight:600}
thead th.us{color:var(--spot);font-weight:800;font-size:17px}
td.us{background:color-mix(in srgb,var(--spot) 7%,transparent);font-weight:800}
.y{color:var(--ok);font-weight:800}.n{color:var(--muted)}

/* uses */
.uses{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:54px}
.use{border-radius:var(--radius);padding:26px;color:#fff;min-height:250px;display:flex;flex-direction:column;gap:12px}
.use:nth-child(1){background:linear-gradient(150deg,#ff5a36,#ff8a3d)}
.use:nth-child(2){background:linear-gradient(150deg,#2a6df4,#6a5cff)}
.use:nth-child(3){background:linear-gradient(150deg,#1d8a52,#3cb371)}
.use .q{margin-top:auto;background:rgba(255,255,255,.18);border-radius:16px 16px 16px 5px;padding:10px 14px;font-weight:600;align-self:flex-start}
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
.safe{display:grid;grid-template-columns:repeat(4,1fr);gap:18px;margin-top:46px}
.safe div{border-top:3px solid var(--spot);padding-top:16px}
.safe p{color:var(--muted);margin-top:8px;font-size:16px}
@media (max-width:860px){.safe{grid-template-columns:1fr 1fr}}@media (max-width:520px){.safe{grid-template-columns:1fr}}

/* faq */
.faq{max-width:780px;margin:46px auto 0}
details{border-bottom:1px solid var(--line);padding:20px 0}
summary{cursor:pointer;font-weight:800;font-size:20px;letter-spacing:-.015em;list-style:none;display:flex;justify-content:space-between;gap:16px}
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
.handoff .grid,#rules .grid,.stores .grid{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
@media (max-width:900px){.handoff .grid,#rules .grid,.stores .grid{grid-template-columns:1fr}}
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
.marquee{padding:34px 0 8px;overflow:hidden;display:flex;flex-direction:column;gap:14px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mrow{display:flex;gap:14px;width:max-content;animation:slide 48s linear infinite}
.mrow.rev{animation-direction:reverse;animation-duration:56s}
.marquee:hover .mrow{animation-play-state:paused}
@keyframes slide{to{transform:translateX(-50%)}}
.ask{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px 16px 12px 12px;min-width:270px}
.ask .em{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-size:24px;background:var(--bg2);flex:none}
.ask b{display:block;font-size:15px;line-height:1.2}.ask small{color:var(--muted);font-size:13px}
.ask .amt{margin-left:auto;font-weight:800;font-size:15px}
.ask .tag{font-size:12px;font-weight:700;color:#fff;background:var(--ok);padding:3px 8px;border-radius:99px;margin-left:8px}
@media (prefers-reduced-motion:reduce){.mrow{animation:none;flex-wrap:wrap;width:auto;justify-content:center}.mrow.rev{display:none}.float{animation:none}}

/* staggered steps */
.steps .step:nth-child(2){transition-delay:.12s}.steps .step:nth-child(3){transition-delay:.24s}
.feats .feat:nth-child(2),.uses .use:nth-child(2),.safe div:nth-child(2){transition-delay:.1s}
.feats .feat:nth-child(3),.uses .use:nth-child(3),.safe div:nth-child(3){transition-delay:.2s}
.feats .feat:nth-child(4),.safe div:nth-child(4){transition-delay:.3s}
.step,.feat,.use{transition:opacity .6s,transform .6s,box-shadow .25s,translate .25s}
.step:hover,.feat:hover{translate:0 -4px;box-shadow:0 18px 40px rgba(27,23,18,.08)}

/* agent demo */
.agentwin{background:var(--night2);border:1px solid #2e2821;border-radius:22px;overflow:hidden;box-shadow:0 30px 70px rgba(0,0,0,.35)}
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

footer{padding:40px 0 60px;color:var(--muted);font-size:15px}
footer .wrap{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
footer a{text-decoration:none}footer .sp{margin-left:auto}
.reveal{opacity:0;transform:translateY(18px);transition:opacity .6s,transform .6s}.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
`;

const check = '<span class="y">✓</span>';
const cross = '<span class="n">—</span>';

export function siteHead({ title, desc, origin, path = '/', extraCss = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="#ff5a36">
<meta property="og:type" content="website"><meta property="og:site_name" content="Spot"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(origin)}${esc(path)}"><meta property="og:image" content="${esc(origin)}/site/card-open.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='12' fill='%23ff5a36'/%3E%3C/svg%3E">
<link rel="preload" href="/fonts/bricolage-800.woff2" as="font" type="font/woff2" crossorigin>
<style>${SITE_CSS}${FX_CSS}${extraCss}</style></head><body>`;
}

export function siteNav(active = '') {
  const a = (href, label, key) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav id="nav"><div class="wrap">
  <a class="logo" href="/"><span></span>Spot</a>
  <div class="links">${a('/#how', 'How it works', 'how')}${a('/#rules', 'Rules for your AI', 'rules')}${a('/#agents', 'For AI builders', 'agents')}${a('/#stores', 'For stores', 'stores')}${a('/#trust', 'Trust', 'trust')}${a('/#faq', 'FAQ', 'faq')}${a('/account', 'My Spots', 'account')}</div>
  <a class="btn primary" href="/new" id="navCta">Make a Spot</a>
</div></nav>`;
}

export function siteFooter() {
  return `<footer><div class="wrap"><a class="logo" href="/" style="font-size:18px"><span style="width:16px;height:16px"></span>Spot</a>${byeFooter(buddyNoId(true))}<span class="sp"></span><a href="/new">Make a Spot</a><a href="/integrations">Integrations</a><a href="/#agents">For AI builders</a><a href="/integrations#stores">For stores</a><a href="/#trust">Trust</a><a href="/#faq">FAQ</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div></footer>`;
}

// Nav shadow, returning-user CTA, reveal-on-scroll, early-access forms.
export const SITE_JS = `
  const nav=document.getElementById('nav');
  addEventListener('scroll',()=>nav&&nav.classList.toggle('scrolled',scrollY>8),{passive:true});
  try{if(localStorage.getItem('spot:me'))document.getElementById('navCta').textContent='Open Spot'}catch{}
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  async function joinList(body){const r=await fetch('/v1/waitlist',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong')}
`;

export function sitePage({ origin, provider }) {
  const title = 'Spot: the yes button for AI shopping';
  const desc = 'AI can find it and fill the cart. Spot gets the yes, from you or from whoever’s paying, with rules you set and signed proof of every approval. One tap, and the store gets the order.';
  return `${siteHead({ title, desc, origin, path: '/' })}

${siteNav()}

<header class="hero"><div class="wrap">
  <div class="buddy" title="hi!">${buddySvg(false)}</div><div class="hi" aria-hidden="true">hi! <span>👋</span></div>
  <div class="grid">
    <div>
      <span class="pill"><i></i>Early access${provider === 'sandbox' ? ' · test mode' : ''}</span>
      <h1 style="margin-top:22px">The <em class="circled">yes button${circleMark}</em> for AI shopping.</h1>
      <p class="lead">AI can find it and fill the cart. Spot gets the yes, from you or from whoever’s paying. One tap, and the store gets the order.</p>
      <div class="modes">
        <a class="mode" href="#how"><span class="mi">💸</span><span><b>Spot me</b><small>Someone else pays. Their money can only buy that cart.</small></span></a>
        <a class="mode" href="#for-you"><span class="mi">🤖</span><span><b>Finish for me</b><small>Your AI finds it, you tap Apple Pay. Even flights.</small></span></a>
        <a class="mode" href="#rules"><span class="mi">🧾</span><span><b>Rules for your AI</b><small>Limits, allowed stores, and an approver for the rest.</small></span></a>
        <a class="mode" href="#stores"><span class="mi">🛍️</span><span><b>Pay the store directly</b><small>Where stores support it: no Spot fee, the store’s own checkout.</small></span></a>
      </div>
      <div class="cta"><a class="btn primary" href="/new">Make a Spot →</a><a class="btn ghost" href="/integrations#mcp">Add Spot to your AI</a></div>
      <p class="fine">Nothing to download. The person paying doesn’t need an account. Your AI never gets a card number.</p>
    </div>
    <div class="stage" id="stage">${heroNotes()}
    <div class="float f2" aria-hidden="true">🎉 Mom spotted you</div>
    <div class="float f3" aria-hidden="true">📦 Ordered · arrives Thu</div>
    <div class="phone" aria-label="A Spot link being sent in a text message and getting paid">
      <div class="screen">
        <div class="top"><div class="avatar">M</div><div class="who">Mom</div></div>
        <div class="thread" id="thread">
          <div class="b me">ok don’t laugh 🙈</div>
          <div class="b me linkcard" id="lc"><div class="imgs"><img src="/site/card-open.png" alt="Share card: psst… can you spot Kyle? Super Puff jacket, $271, tap to spot" width="1200" height="630"><img class="covered" src="/site/card-covered.png" alt="Share card after paying: Mom spotted Kyle!" width="1200" height="630"></div><div class="cap">psst… can you spot Kyle?<small>spot</small></div></div>
          <div class="b them">omg fine 😂</div>
          <div class="b them">done ✅</div>
          <div class="b me">ILY 🧡 it’s ordered</div>
        </div>
      </div>
    </div>
    </div>
  </div>
</div></header>

<section class="marquee" aria-label="Examples of things people ask for with Spot">
  <div class="mrow"><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">👟</div><div><b>Trail runners, size 10.5</b><small>Trailhead Supply · birthday</small></div><span class="amt">$200</span></div><div class="ask"><div class="em">🛏️</div><div><b>Dorm bedding set</b><small>Hearth & Loom · move-in</small></div><span class="amt">$118</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎙️</div><div><b>Podcast mic</b><small>Signal Goods · creator fund</small></div><span class="amt">$129</span></div><div class="ask"><div class="em">💄</div><div><b>Skincare restock</b><small>Dewdrop · “pls 🥺”</small></div><span class="amt">$64</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">👟</div><div><b>Trail runners, size 10.5</b><small>Trailhead Supply · birthday</small></div><span class="amt">$200</span></div><div class="ask"><div class="em">🛏️</div><div><b>Dorm bedding set</b><small>Hearth & Loom · move-in</small></div><span class="amt">$118</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎙️</div><div><b>Podcast mic</b><small>Signal Goods · creator fund</small></div><span class="amt">$129</span></div><div class="ask"><div class="em">💄</div><div><b>Skincare restock</b><small>Dewdrop · “pls 🥺”</small></div><span class="amt">$64</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div></div>
  <div class="mrow rev" aria-hidden="true"><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">📚</div><div><b>Semester textbooks</b><small>Campus Books</small></div><span class="amt">$142</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🧥</div><div><b>The Super Puff jacket</b><small>Kiln & Co. · it’s cold</small></div><span class="amt">$250</span></div><div class="ask"><div class="em">🪴</div><div><b>Monstera + pot</b><small>Leaf Lab · housewarming</small></div><span class="amt">$58</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎨</div><div><b>Gouache set</b><small>Paper Fox · art class</small></div><span class="amt">$46</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎮</div><div><b>Wireless controller</b><small>Pixel Depot · good grades</small></div><span class="amt">$69</span></div><div class="ask"><div class="em">📚</div><div><b>Semester textbooks</b><small>Campus Books</small></div><span class="amt">$142</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🧥</div><div><b>The Super Puff jacket</b><small>Kiln & Co. · it’s cold</small></div><span class="amt">$250</span></div><div class="ask"><div class="em">🪴</div><div><b>Monstera + pot</b><small>Leaf Lab · housewarming</small></div><span class="amt">$58</span><span class=tag>spotted</span></div><div class="ask"><div class="em">🎨</div><div><b>Gouache set</b><small>Paper Fox · art class</small></div><span class="amt">$46</span></div><div class="ask"><div class="em">🎧</div><div><b>Noise-cancelling headphones</b><small>Northwind Audio · “for the flight”</small></div><span class="amt">$249</span><span class=tag>spotted</span></div></div>
</section>

${storySection()}

<section class="sec handoff" id="for-you"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Your AI shops. You tap.</p>
    <h2 class="reveal">Ask your AI.<br>Finish on your phone.</h2>
    <p class="lead reveal">“Find me a flight to SFO on the 17th.” Your assistant finds it, holds the price and texts you a Spot. You open it, check it and tap Apple Pay. Done.</p>
    <ul class="ticks reveal">
      <li><b>Real flights.</b> Live fares from the airlines, booked the second you pay, with your confirmation code right there.</li>
      <li><b>Any store’s cart.</b> Your AI puts the cart together, and Spot buys it from the store and ships it to you.</li>
      <li><b>Price held, clock showing.</b> The link counts down while the fare or price is held, so nothing changes under you.</li>
      <li><b>You always have the last tap.</b> Your AI can’t spend a cent without a person saying yes.</li>
      <li><b>Rules it can’t argue with.</b> Cap each order and each month, pick the stores, and send anything over the line to someone you trust.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/integrations#mcp">Add Spot to your AI →</a><a class="btn ghost" href="#agents">For developers</a></div>
  </div>
  <div class="stage" id="stage2">
    <div class="float f4" aria-hidden="true">⏳ fare held 29:58</div>
    <div class="float f5" aria-hidden="true">✈️ Booked · <b>QX7R2P</b></div>
    <div class="phone" aria-label="Your AI assistant texts you a flight it found; you tap to finish and it's booked">
      <div class="screen">
        <div class="top"><div class="avatar ai">✦</div><div class="who">Your AI</div></div>
        <div class="thread" id="thread2">
          <div class="b me">find me a flight to SFO on the 17th, morning, nonstop pls</div>
          <div class="b them">On it ✈️ Best nonstop: 9:40am, lands 11:55. $249. Holding the fare for you, tap to finish 👇</div>
          <div class="b them tripcard" id="trip"><div class="tc"><div class="tr"><div><b>9:40a</b><span>AUS</span></div><div class="tl"><i></i><em>nonstop</em></div><div style="text-align:right"><b>11:55a</b><span>SFO</span></div></div><div class="tm"><span>Fri, Oct 17 · 1 adult</span><span class="tp">$249</span></div><div class="tb">Finish on Spot · ⏳ 29:58</div><div class="tdone">✓ Booked · QX7R2P</div></div></div>
          <div class="b me">done 🙌</div>
          <div class="b them">You’re booked. Confirmation QX7R2P. Aisle seat’s yours 😉</div>
        </div>
      </div>
    </div>
  </div>
</div></div></section>

<section class="sec alt" id="rules"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">Rules and approvers</p>
    <h2 class="reveal">Let your AI shop.<br>Keep the say.</h2>
    <p class="lead reveal">Every AI you connect gets its own rules. Inside them, it hands you the cart to finish. Outside them, it’s refused, or it goes to your approver: a parent, a partner, your finance inbox. They pay for it or turn it down.</p>
    <ul class="ticks reveal">
      <li><b>Limits.</b> A cap per order and per month, per AI.</li>
      <li><b>Only these stores.</b> An allowlist, so a kid’s AI shops at Target, not everywhere.</li>
      <li><b>An approver.</b> They agree by email first, and every ask shows exactly what the AI picked and why it came to them.</li>
      <li><b>See everything.</b> Each AI’s activity (asked, blocked, ordered) sits on your account, with an off switch that works instantly.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/account">Set rules →</a><a class="btn ghost" href="#trust">How approvals are signed</a></div>
  </div>
  <div class="rulecard reveal" aria-label="Example: spending rules for an AI assistant">
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

<section class="sec" id="why"><div class="wrap">
  <p class="kicker reveal">Why Spot</p>
  <h2 class="reveal">Asking is awkward.<br>Spot makes it a tap.</h2>
  <div class="feats">
    <div class="feat reveal"><div class="ic">🔒</div><h3>It can only buy that.</h3><p>They buy exactly that cart from Spot, and Spot orders it and ships it to you. No cash changes hands, so saying yes is easy.</p></div>
    <div class="feat reveal"><div class="ic">📱</div><h3>Nothing to download.</h3><p>They open your link and pay with Apple Pay, Google Pay or a card. No app, no sign-up, no “what’s your Venmo?”</p></div>
    <div class="feat reveal"><div class="ic">🛍️</div><h3>Any store, or straight to the store.</h3><p>Links, screenshots, or a few words. Stores with agent checkout get paid directly, with no Spot fee.</p></div>
    <div class="feat reveal"><div class="ic">✅</div><h3>You confirm the order.</h3><p>Spot’s checkout assistant fills in the store’s checkout for you, then waits. Nothing is placed until you tap.</p></div>
  </div>
  <div class="tablewrap reveal"><table>
    <thead><tr><th></th><th class="us">Spot</th><th>Payment requests</th><th>Shared-cart links</th><th>Wishlists</th></tr></thead>
    <tbody>
      <tr><td>Works with any store</td><td class="us">${check}</td><td>${cross}</td><td>Some</td><td>${check}</td></tr>
      <tr><td>Payer just taps, no checkout</td><td class="us">${check}</td><td>${check}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Money can only buy the item</td><td class="us">${check}</td><td>${cross}</td><td>${check}</td><td>${check}</td></tr>
      <tr><td>Ask in the moment</td><td class="us">${check}</td><td>${check}</td><td>${check}</td><td>${cross}</td></tr>
      <tr><td>Your AI can hand it to you to finish</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Spending rules and an approver for your AI</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Signed proof of who approved what</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>${cross}</td></tr>
      <tr><td>Ordered for you</td><td class="us">${check}</td><td>${cross}</td><td>${cross}</td><td>Some</td></tr>
    </tbody>
  </table></div>
</div></section>

${chatWallSection()}

<section class="sec alt"><div class="wrap">
  <p class="kicker reveal">Made for</p>
  <h2 class="reveal">Every “can you get me this?”</h2>
  <div class="uses">
    <div class="use reveal"><h3>Family</h3><p>Birthday lists, back-to-school, “the good headphones.” Parents see exactly what they’re buying.</p><div class="q">“Mom, can you spot me? 👀”</div></div>
    <div class="use reveal"><h3>Partners & friends</h3><p>Send a treat-me without the screenshot-and-Venmo dance. It shows up at the door.</p><div class="q">“it’s on me 🧡”</div></div>
    <div class="use reveal"><h3>Creators</h3><p>Put a Spot in your bio. Fans cover the gear you actually need, from any store.</p><div class="q">“new mic fund 🎙️”</div></div>
  </div>
</div></section>

<section class="sec agents" id="agents"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">For AI agents</p>
    <h2 class="reveal">Your agent builds the cart.<br>Spot gets the yes.</h2>
    <p class="lead reveal">Agents can find anything, but a person has to say yes to paying. Spot is that step: hand the cart to your user, or to whoever’s paying, and get back a signed approval once they do. Over MCP or REST, with no card numbers anywhere near your agent.</p>
    <div class="tools reveal">
      <div class="tool"><code>create_spot_ask</code><span>cart, link or description → a pay link for someone else, or <b>for_me</b>: a finish link texted to your user</span></div>
      <div class="tool"><code>search_flights</code><span>live fares, cheapest first plus the best nonstop</span></div>
      <div class="tool"><code>create_flight_ask</code><span>hold a fare and text your user a link to book it</span></div>
      <div class="tool"><code>get_spot_ask</code><span>waiting, paid, ordering, ordered, booked</span></div>
      <div class="tool"><code>order_spot_ask</code><span>once paid, place the order at the store</span></div>
      <div class="tool"><code>pay_at_store</code><span>stores with agent checkout (UCP): the payer pays the store directly, no fee</span></div>
    </div>
    <p class="more reveal">Your user’s rules are enforced for you: over a limit, the ask is refused with the reason, or sent to their approver. Every yes comes back as a signed approval you can verify.</p>
    <div class="cta" style="margin-top:30px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="#join" data-kind="agent">Get an API key</a><a class="btn ghost" href="/integrations#mcp">Set up MCP →</a></div>
    <p class="more reveal">Works with Claude and any app that speaks MCP. <a href="/integrations">See all integrations</a></p>
  </div>
  <div class="agentwin reveal" aria-label="Demo: an AI assistant uses Spot to ask someone to pay and then orders">
    <div class="bar"><i></i><i></i><i></i><span>Your AI assistant · with Spot</span></div>
    <div class="agentlog" id="agentlog">
      <div class="al user">find black trail runners in 10.5 and ask mom to get them for my birthday 🎂</div>
      <div class="al bot" data-type="Found the Trailhead Supply XT runners in black, size 10.5, for $200."></div>
      <div class="al call">→ create_spot_ask <em>{ items: 1, merchant: "Trailhead Supply" }</em></div>
      <div class="al bot" data-type="Here’s the Spot for Mom. I sent it to her with your note 👇"></div>
      <div class="al card"><img src="/site/card-agent.png" alt="Spot share card: psst… can you spot Kyle? Trail runners, $208" width="1200" height="630" loading="lazy"></div>
      <div class="al event">💸 Mom spotted you · $208.00</div>
      <div class="al call">→ order_spot_ask <em>{ ship_to: "home" }</em></div>
      <div class="al bot" data-type="Checkout is filled in. Tap Place order on your Spot page and they’re yours."></div>
      <div class="al event">📦 Ordered #2231 · arrives Thursday</div>
    </div>
  </div>
</div></div></section>

<section class="sec stores" id="stores"><div class="wrap"><div class="grid">
  <div>
    <p class="kicker reveal">For stores</p>
    <h2 class="reveal">Don’t lose the sale to “I’ll ask my mom.”</h2>
    <p class="lead reveal">Put an <b>Ask someone to pay</b> button by your checkout. The shopper’s cart, at your prices, becomes a link they send to whoever’s paying. You get the order either way.</p>
    <ul class="ticks reveal">
      <li><b>Paid on your own checkout.</b> If your store supports agent checkout (UCP), the payer pays you directly. You’re the seller, it’s your receipt, and Spot never holds the money.</li>
      <li><b>Two lines of code.</b> A publishable key that only works on your domain. Verify the domain and your carts show a ✓.</li>
      <li><b>Know it’s Spot.</b> Spot signs its requests to your store (HTTP Message Signatures, Web Bot Auth), so you can tell it from other bots.</li>
    </ul>
    <div class="cta reveal" style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap"><a class="btn primary" href="/integrations#stores">Add the button →</a></div>
  </div>
  <div class="storedemo reveal" aria-label="A store checkout with an Ask someone to pay button">
    <div class="sd-line"><span>Trail Jacket · M</span><b>$189.00</b></div>
    <div class="sd-line"><span>Shipping</span><b>$8.00</b></div>
    <div class="sd-line total"><span>Total</span><b>$197.00</b></div>
    <div class="sd-btn dark">Checkout</div>
    <div class="sd-btn spot"><i></i>Ask someone to pay</div>
    <small>They pay, it ships to you. Powered by Spot</small>
  </div>
</div></div></section>

<section class="sec" id="trust"><div class="wrap">
  <p class="kicker reveal">Trust</p>
  <h2 class="reveal">Every yes is a person’s, and you can prove it.</h2>
  <div class="safe">
    <div class="reveal"><h3>Signed approvals</h3><p>When someone pays or taps Place order, Spot signs exactly what they approved: the store, the items, the amount, who, when, and which AI asked. Anyone can check it against Spot’s public keys.</p></div>
    <div class="reveal"><h3>Exactly that cart</h3><p>Money paid through Spot buys only those items from that store, with a single-use card nobody ever sees. No cash, gift cards or cash-outs.</p></div>
    <div class="reveal"><h3>An activity log for your AI</h3><p>What each AI asked for, what was blocked and why, what got ordered. Disconnect it and it stops that second.</p></div>
    <div class="reveal"><h3>Money back, automatically</h3><p>Canceled, not orderable, or cheaper at the store? The difference goes straight back to whoever paid.</p></div>
  </div>
</div></section>

${noteSection(buddyNoId(true))}

<section class="sec alt" id="faq"><div class="wrap">
  <p class="kicker reveal" style="text-align:center">FAQ</p>
  <h2 class="reveal" style="text-align:center">Questions</h2>
  <div class="faq">
    <details><summary>What does it cost?</summary><p>When the store supports agent checkout, the person paying pays the store directly and Spot is free. Otherwise, when Spot buys it for you, the payer adds a 4% Spot fee plus a small allowance for tax and price changes (up to 5%, at most $15) that comes back if the store doesn’t charge it. Everything is shown before they pay. “Send it straight to my Venmo or Cash App” is free too, because the money never goes through Spot.</p></details>
    <details><summary>Can I ask for things from different stores in one Spot?</summary><p>Yes. Add a cart from another store before you send it (up to 5 stores, and your AI can do the same). Whoever’s paying covers all of it in one tap, and Spot orders from each store separately. If one store can’t be ordered, they get that store’s share back automatically and the rest still ships.</p></details>
    <details><summary>What’s “pay the store directly”?</summary><p>Some stores support agent checkout (the Universal Commerce Protocol). For those, Spot sets up the store’s own checkout with exactly your cart, shipped to you, and the person paying pays the store there. The store is the seller: its receipt, its returns. Spot never holds the money or sees a card.</p></details>
    <details><summary>Can I limit what my AI spends?</summary><p>Yes. On your account, each AI you connect can have a cap per order and per month, and a list of stores it can shop at. Anything outside those is refused, or sent to your approver to pay for or turn down. You can see everything each AI did, and disconnect it any time.</p></details>
    <details><summary>What’s a signed approval?</summary><p>A record of exactly what a person said yes to (the store, items, amount, who and when, and which AI asked), signed with Spot’s key. It’s linked from receipts, your AI can fetch it, and anyone can check it against Spot’s public keys at /.well-known/spot-keys.json.</p></details>
    <details><summary>How does a store add the button?</summary><p>Register your domain on the <a href="/integrations#stores">integrations page</a> and paste two lines by your checkout. The key only works on your own domain. Put a small file on your site to verify it, and your carts show a ✓ to whoever pays.</p></details>
    <details><summary>Which stores work?</summary><p>Any online store. Spot reads links, screenshots and plain descriptions. Shopify stores are the smoothest, and stores that support agent checkout (the Universal Commerce Protocol) are ordered straight through their own checkout. Before anyone pays, Spot checks it can order from that store. If a store blocks it later and Spot can’t order within 3 days, whoever paid gets a full refund automatically.</p></details>
    <details><summary>Can my AI book flights with Spot?</summary><p>Yes. Add Spot to your assistant and ask for a flight. It searches live fares, holds the one you like and texts you a link. You add who’s flying, tap Apple Pay, and Spot books it with the airline and shows your confirmation code. If the airline can’t book it, you’re refunded right away.</p></details>
    <details><summary>Can my AI spend my money without me?</summary><p>No. Your assistant can find things and build the cart, but every Spot waits for a person to pay, and orders wait for your last tap. Your AI never gets a card number.</p></details>
    <details><summary>Does the person paying need an account?</summary><p>No. They open your link and pay with Apple Pay, Google Pay or a card. That’s it.</p></details>
    <details><summary>Why does Spot buy it instead of sending money?</summary><p>For stores that can’t take the payment directly, it’s what makes people comfortable saying yes: their money buys exactly what you asked for, and you can’t get cash instead. The person paying gets a receipt from Spot, and returns go through Spot. It also shuts out the fraud that plagues cash transfers.</p></details>
    <details><summary>What if I change my mind?</summary><p>Until Spot places the order, you can cancel from your Spot page, and the person who paid can cancel from their receipt. Either way they get a full refund. After that, returns go through Spot: when the store refunds Spot, Spot refunds whoever paid.</p></details>
    <details><summary>Is Spot live?</summary><p>Spot is in early access. ${provider === 'sandbox' ? 'Right now it runs in test mode, so no real money moves. Try the whole flow for free.' : 'Payments run on Stripe.'}</p></details>
  </div>
</div></section>

<section class="sec join" id="join"><div class="wrap">
  <h2 class="reveal">Want in early?</h2>
  <p class="lead reveal" style="margin-left:auto;margin-right:auto">Leave your email and we’ll let you know when real payments go live, or send you an API key for your agent.</p>
  <form id="joinForm" class="reveal">
    <input type="email" name="email" required placeholder="you@email.com" aria-label="Email" autocomplete="email">
    <select name="kind" aria-label="I am"><option value="asker">I want to ask</option><option value="agent">I’m building an agent</option><option value="creator">I’m a creator</option><option value="store">I run a store</option></select>
    <input class="hp" name="company_fax" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn primary">Join</button>
  </form>
  <p class="msg" id="joinMsg" aria-live="polite"></p>
  <p style="margin-top:26px"><a class="btn ghost" href="/new">Or try it now →</a></p>
</div></section>

${siteFooter()}

<script>
(()=>{
${SITE_JS}
${FX_JS}
  // Hero conversation: plays, flips the card to "covered", loops.
  const bubbles=[...document.querySelectorAll('#thread .b')],lc=document.getElementById('lc');
  if(reduce){bubbles.forEach(b=>b.classList.add('shown'));lc.classList.add('flip')}
  else{
    const play=()=>{bubbles.forEach(b=>b.classList.remove('shown'));lc.classList.remove('flip');
      const t=[400,1300,3000,4300,4700,5600];
      bubbles.forEach((b,i)=>setTimeout(()=>b.classList.add('shown'),t[i]));
      setTimeout(()=>{lc.classList.add('flip');spotConfetti(stage,'62%','34%')},t[3]);
      setTimeout(play,10500)};
    play();
  }
  // AI handoff phone: plays when scrolled into view, the trip card flips to "booked", loops.
  const t2=document.getElementById('thread2'),trip=document.getElementById('trip');
  if(t2){const bs=[...t2.children];
    if(reduce){bs.forEach(b=>b.classList.add('shown'));trip.classList.add('done')}
    else{const play2=()=>{bs.forEach(b=>b.classList.remove('shown'));trip.classList.remove('done');
        const t=[300,1500,2600,4600,5600];bs.forEach((b,i)=>setTimeout(()=>b.classList.add('shown'),t[i]));
        setTimeout(()=>{trip.classList.add('done');spotConfetti(document.getElementById('stage2'),'55%','52%')},4800);
        setTimeout(play2,11000)};
      new IntersectionObserver((es,o)=>{if(es[0].isIntersecting){play2();o.disconnect()}},{threshold:.3}).observe(t2)}}
  // Phone tilts toward the pointer.
  const stage=document.getElementById('stage'),phone=stage&&stage.querySelector('.phone');
  if(phone&&!reduce)stage.addEventListener('pointermove',e=>{const r=stage.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;phone.style.transform='rotateY('+(x*14).toFixed(1)+'deg) rotateX('+(-y*10).toFixed(1)+'deg) rotate(2deg)'});
  stage&&stage.addEventListener('pointerleave',()=>{phone.style.transform=''});
  // Mascot watches the pointer.
  const svg=document.querySelector('.buddy svg'),pupils=svg&&svg.querySelector('.pupils');
  addEventListener('pointermove',e=>{if(!pupils)return;const r=svg.getBoundingClientRect(),dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),d=Math.hypot(dx,dy)||1,k=Math.min(7,d/30);pupils.setAttribute('transform','translate('+(dx/d*k).toFixed(1)+' '+(dy/d*k).toFixed(1)+')')},{passive:true});
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
  document.querySelectorAll('[data-kind]').forEach(a=>a.addEventListener('click',()=>{document.querySelector('#joinForm [name=kind]').value=a.dataset.kind}));
  const f=document.getElementById('joinForm'),msg=document.getElementById('joinMsg');
  f.addEventListener('submit',async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;
    try{await joinList(Object.fromEntries(new FormData(f)));msg.textContent='You’re on the list 🧡';f.reset()}catch(err){msg.textContent=err.message}finally{b.disabled=false}});
})();
</script>
</body></html>`;
}

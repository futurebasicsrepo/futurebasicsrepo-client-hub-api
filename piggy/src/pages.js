// Server-rendered pages. No build step: each page is one HTML string with its
// own inline script, so what the NFC tap opens is a single fast request.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const money = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

const PIG = `<svg viewBox="0 0 64 64" aria-hidden="true" class="pig"><ellipse cx="32" cy="36" rx="24" ry="20" fill="var(--pig)"/><path d="M14 22 L12 8 L24 17Z M50 22 L52 8 L40 17Z" fill="var(--pig-ear)"/><ellipse cx="32" cy="41" rx="9" ry="6.5" fill="var(--pig-ear)"/><circle cx="29" cy="41" r="1.8" fill="var(--ink)" opacity=".55"/><circle cx="35" cy="41" r="1.8" fill="var(--ink)" opacity=".55"/><circle cx="23" cy="30" r="2.6" fill="var(--ink)"/><circle cx="41" cy="30" r="2.6" fill="var(--ink)"/><rect x="26" y="15" width="12" height="2.6" rx="1.3" fill="var(--ink)" opacity=".35"/></svg>`;

const BASE_CSS = `
:root{--bg:#fbf6f1;--card:#fff;--ink:#2a1a17;--muted:#7d6b66;--line:#ecdfd6;--brand:#7a1014;--brand-ink:#fff;--pig:#f4b3a4;--pig-ear:#ea8f7d;--chip:#fff;--chip-on:#7a1014;--glow:#ffb547;--ok:#1f7a4a}
@media (prefers-color-scheme:dark){:root{--bg:#171110;--card:#221a18;--ink:#f6ece7;--muted:#b19f99;--line:#3a2d2a;--brand:#e2606a;--brand-ink:#1b0d0e;--chip:#221a18;--chip-on:#e2606a}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,.serif{font-family:Fraunces,Georgia,serif;letter-spacing:-.02em}
a{color:var(--brand)}
.wrap{max-width:460px;margin:0 auto;padding:20px 16px 40px}
.pig{width:56px;height:56px;flex:none}
.muted{color:var(--muted)}
.btn{display:block;width:100%;border:0;border-radius:14px;padding:16px;font:600 17px/1 Inter,system-ui,sans-serif;background:var(--brand);color:var(--brand-ink);cursor:pointer}
.btn:disabled{opacity:.45;cursor:default}
.err{color:#c0392b;min-height:1.2em;font-size:14px;margin:8px 0 0}
.badge{display:inline-block;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}`;

function shell(title, body, { css = '', head = '', bodyClass = '' } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#7a1014"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}${css}</style>${head}</head><body${bodyClass ? ` class="${bodyClass}"` : ''}>${body}</body></html>`;
}

// ─── Mascots: a face for each kind of jar, with moods the tap page can set ──
const MASCOT_CSS = `
:root{--pig-hi:#ffd3c7;--pig-inner:#ffc0b3;--pig-dark:#3b1f1c;--blush:#ff7f8e;--glass:#e3f1f6;--glass-edge:#9cc7d6;--lid:#c98a5a;--wood:#7b4a2c;--wood-hi:#a86d45;--felt:#7d2128}
.mascot{display:block;overflow:visible}
.mascot .eyes,.mascot .mouth{display:none}
.mascot[data-mood=idle] .eyes-normal,.mascot[data-mood=m1] .eyes-normal,.mascot[data-mood=m2] .eyes-normal,
.mascot[data-mood=m3] .eyes-star,.mascot[data-mood=big] .eyes-heart,.mascot[data-mood=happy] .eyes-happy,.mascot[data-mood=gulp] .eyes-happy{display:inline}
.mascot[data-mood=idle] .mouth-small,.mascot[data-mood=m1] .mouth-small,
.mascot[data-mood=m2] .mouth-big,.mascot[data-mood=m3] .mouth-big,.mascot[data-mood=big] .mouth-big,.mascot[data-mood=happy] .mouth-big,
.mascot[data-mood=gulp] .mouth-o{display:inline}
.mascot .eye{transform-box:fill-box;transform-origin:center;animation:blink 5s infinite}
.mascot .eye:nth-child(2){animation-delay:.05s}
.mascot .pupil{transition:transform .25s ease-out}
.mascot .ear{transform-box:fill-box}
.mascot .ear-l{transform-origin:85% 95%}.mascot .ear-r{transform-origin:15% 95%}
.mascot.wiggle .ear-l{animation:earL .55s}.mascot.wiggle .ear-r{animation:earR .55s}
.mascot .body{transform-box:fill-box;transform-origin:50% 100%;animation:float 3.4s ease-in-out infinite}
.mascot .eyes-star path{transform-box:fill-box;transform-origin:center;animation:spin 3s linear infinite}
.mascot .eyes-heart path{transform-box:fill-box;transform-origin:center;animation:beat .7s ease-in-out infinite}
.mascot .ring{transition:stroke-width .4s,opacity .4s;opacity:.55}
.mascot.glow .ring{stroke-width:9;opacity:1;filter:drop-shadow(0 0 10px var(--glow))}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.08)}}
@keyframes earL{30%{transform:rotate(-14deg)}60%{transform:rotate(8deg)}}
@keyframes earR{30%{transform:rotate(14deg)}60%{transform:rotate(-8deg)}}
@keyframes float{50%{transform:translateY(-5px)}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes beat{50%{transform:scale(1.18)}}
@media (prefers-reduced-motion:reduce){.mascot *{animation:none!important}}
.fly-coin{position:fixed;left:0;top:0;width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff3b8,#ffcf3f 52%,#c98a00);box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 8px 20px rgba(0,0,0,.28);display:grid;place-items:center;font:800 14px Inter,system-ui,sans-serif;color:#6b4300;z-index:70;pointer-events:none;will-change:transform}`;

function star(cx, cy, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
  }
  return d + 'Z';
}
const heart = (cx, cy, s) => `M${cx},${cy + s * 0.9} C${cx - s * 1.6},${cy - s * 0.1} ${cx - s * 0.7},${cy - s * 1.3} ${cx},${cy - s * 0.45} C${cx + s * 0.7},${cy - s * 1.3} ${cx + s * 1.6},${cy - s * 0.1} ${cx},${cy + s * 0.9}Z`;

// Eyes and mouths, shared by the pig and the jar. ey/my move them per body.
function face(ey, my) {
  const eye = (x) => `<g class="eye"><ellipse cx="${x}" cy="${ey}" rx="13" ry="15" fill="#fff"/><circle class="pupil" cx="${x + 2}" cy="${ey + 3}" r="8" fill="var(--pig-dark)"/><circle cx="${x + 5}" cy="${ey - 1}" r="2.6" fill="#fff"/></g>`;
  return `
  <g class="eyes eyes-normal">${eye(70)}${eye(130)}</g>
  <g class="eyes eyes-star" fill="#ffc83d" stroke="#b77900" stroke-width="1.5" stroke-linejoin="round"><path d="${star(70, ey, 15)}"/><path d="${star(130, ey, 15)}"/></g>
  <g class="eyes eyes-heart" fill="#ff4d6d"><path d="${heart(70, ey, 11)}"/><path d="${heart(130, ey, 11)}"/></g>
  <g class="eyes eyes-happy" fill="none" stroke="var(--pig-dark)" stroke-width="5" stroke-linecap="round"><path d="M57,${ey + 4} Q70,${ey - 11} 83,${ey + 4}"/><path d="M117,${ey + 4} Q130,${ey - 11} 143,${ey + 4}"/></g>
  <path class="mouth mouth-small" d="M86,${my} Q100,${my + 9} 114,${my}" fill="none" stroke="var(--pig-dark)" stroke-width="3.5" stroke-linecap="round"/>
  <g class="mouth mouth-big"><path d="M79,${my - 4} Q100,${my + 22} 121,${my - 4} Z" fill="var(--pig-dark)"/><path d="M90,${my + 6} Q100,${my + 15} 110,${my + 6} Q100,${my + 9} 90,${my + 6}Z" fill="#ff7a8a"/></g>
  <ellipse class="mouth mouth-o" cx="100" cy="${my + 4}" rx="7" ry="8" fill="var(--pig-dark)"/>`;
}

export function mascot(kind, id) {
  const open = `<svg class="mascot" id="${id}" data-mood="idle" viewBox="0 0 200 190" aria-hidden="true">`;
  if (kind === 'plate') {
    return `${open}<g class="body">
      <ellipse cx="100" cy="104" rx="92" ry="80" fill="var(--wood)"/>
      <ellipse cx="100" cy="100" rx="92" ry="80" fill="var(--wood-hi)"/>
      <ellipse class="ring" cx="100" cy="100" rx="80" ry="69" fill="none" stroke="var(--glow)" stroke-width="5"/>
      <ellipse cx="100" cy="100" rx="68" ry="58" fill="var(--wood)"/>
      <ellipse class="slot" cx="100" cy="102" rx="58" ry="49" fill="var(--felt)"/>
      <g fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"><path d="M92,88 a14,14 0 0 1 0,28"/><path d="M101,80 a24,24 0 0 1 0,44"/><path d="M110,72 a34,34 0 0 1 0,60"/></g>
    </g></svg>`;
  }
  if (kind === 'tip') {
    return `${open}<g class="body">
      <rect x="56" y="10" width="88" height="22" rx="7" fill="var(--lid)"/>
      <rect class="slot" x="80" y="16" width="40" height="6" rx="3" fill="var(--pig-dark)"/>
      <rect x="64" y="30" width="72" height="12" rx="3" fill="var(--glass-edge)"/>
      <rect x="28" y="40" width="144" height="146" rx="36" fill="var(--glass)" stroke="var(--glass-edge)" stroke-width="3"/>
      <g fill="#ffcf3f" stroke="#c98a00" stroke-width="1.5"><ellipse cx="72" cy="172" rx="18" ry="6"/><ellipse cx="104" cy="175" rx="18" ry="6"/><ellipse cx="132" cy="170" rx="18" ry="6"/><ellipse cx="90" cy="166" rx="18" ry="6"/><ellipse cx="118" cy="163" rx="18" ry="6"/></g>
      <path d="M44,70 Q40,110 46,140" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".7"/>
      <circle cx="52" cy="122" r="12" fill="var(--blush)" opacity=".45"/><circle cx="148" cy="122" r="12" fill="var(--blush)" opacity=".45"/>
      ${face(92, 136)}
    </g></svg>`;
  }
  return `${open}<g class="body">
    <g class="ear ear-l"><path d="M46,64 L30,10 Q31,3 38,7 L90,40 Z" fill="var(--pig-ear)"/><path d="M50,56 L39,21 L77,43 Z" fill="var(--pig-inner)"/></g>
    <g class="ear ear-r"><path d="M154,64 L170,10 Q169,3 162,7 L110,40 Z" fill="var(--pig-ear)"/><path d="M150,56 L161,21 L123,43 Z" fill="var(--pig-inner)"/></g>
    <ellipse cx="100" cy="110" rx="82" ry="72" fill="url(#shade-${id})"/>
    <rect class="slot" x="78" y="42" width="44" height="7" rx="3.5" fill="var(--pig-dark)"/>
    <circle cx="48" cy="128" r="15" fill="var(--blush)" opacity=".5"/><circle cx="152" cy="128" r="15" fill="var(--blush)" opacity=".5"/>
    ${face(94, 162)}
    <ellipse cx="100" cy="132" rx="32" ry="23" fill="var(--pig-ear)"/>
    <ellipse cx="89" cy="132" rx="5.5" ry="8" fill="var(--pig-dark)" opacity=".7"/><ellipse cx="111" cy="132" rx="5.5" ry="8" fill="var(--pig-dark)" opacity=".7"/>
  </g>
  <defs><radialGradient id="shade-${id}" cx=".4" cy=".32" r=".8"><stop offset="0" style="stop-color:var(--pig-hi)"/><stop offset="1" style="stop-color:var(--pig)"/></radialGradient></defs></svg>`;
}

// ─── Tap page: what the phone opens when it touches the jar ─────────────────
const TAP_CSS = `
.wrap{padding-top:12px}
.hero{display:grid;justify-items:center;text-align:center;gap:2px;position:relative;margin-bottom:18px}
.stage{position:relative;width:188px;height:180px;display:grid;place-items:center}
.stage .mascot{width:176px;height:168px;position:relative;z-index:1}
.rings i{position:absolute;left:50%;top:50%;width:120px;height:120px;margin:-60px;border-radius:50%;border:3px solid var(--brand);opacity:0;pointer-events:none}
.arrive .rings i{animation:ring 1.4s cubic-bezier(.2,.6,.3,1) forwards}
.arrive .rings i:nth-child(2){animation-delay:.18s}.arrive .rings i:nth-child(3){animation-delay:.36s}
@keyframes ring{0%{opacity:.6;transform:scale(.6)}100%{opacity:0;transform:scale(2.4)}}
.arrive .mascot{animation:pop-in .7s cubic-bezier(.3,1.6,.5,1) both}
@keyframes pop-in{0%{transform:scale(.4) translateY(30px);opacity:0}100%{transform:none;opacity:1}}
.hero h1{font-size:28px;line-height:1.1;margin:6px 0 0;text-wrap:balance}
.hero .tag{margin:0}
.goal{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 16px;margin-bottom:22px}
.goal .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.bar{position:relative;height:14px;border-radius:99px;background:var(--line);overflow:visible;margin-top:10px}
.bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--pig-ear),var(--brand));border-radius:99px;transition:width 1.2s cubic-bezier(.2,.8,.2,1)}
.bar b{position:absolute;right:-6px;top:50%;transform:translateY(-50%);font-size:20px}
h2{font-size:20px;margin:0 0 12px}
.chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.chip{appearance:none;border:2px solid var(--line);background:var(--chip);color:var(--ink);border-radius:18px;padding:12px 0 14px;font:700 22px/1 Inter,system-ui,sans-serif;cursor:pointer;display:grid;gap:6px;justify-items:center;transition:background .15s,border-color .15s,color .15s;touch-action:manipulation}
.chip .t{font-size:22px;line-height:1;transition:transform .3s cubic-bezier(.3,1.8,.5,1)}
.chip.small{font-size:16px;align-content:center}
.chip:active{transform:scale(.94)}
.chip[aria-pressed=true]{background:var(--chip-on);border-color:var(--chip-on);color:var(--brand-ink)}
.chip[aria-pressed=true] .t{transform:scale(1.3) rotate(-8deg)}
.custom{display:none;margin-top:12px;position:relative}.custom.on{display:block;animation:pop-in .35s cubic-bezier(.3,1.6,.5,1)}
.custom span{position:absolute;left:18px;top:50%;transform:translateY(-50%);font:700 26px Inter,sans-serif;color:var(--muted)}
.custom input{width:100%;border:2px solid var(--brand);border-radius:16px;padding:16px 16px 16px 40px;font:700 26px Inter,sans-serif;background:var(--card);color:var(--ink);outline:0}
.total{display:flex;justify-content:space-between;align-items:baseline;margin:22px 0 12px}
.total b{font:800 40px/1 Fraunces,Georgia,serif;display:inline-block}
#express{min-height:56px}
details{margin-top:14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
summary{padding:14px 16px;cursor:pointer;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}
details .in{padding:0 16px 16px}
.demo{border:1px dashed var(--brand);border-radius:14px;padding:12px 14px;font-size:14px;margin-bottom:12px}
#demoGo{font-size:19px;padding:19px;box-shadow:0 6px 0 color-mix(in srgb,var(--brand) 60%,#000);transition:transform .08s,box-shadow .08s}
#demoGo:active{transform:translateY(4px);box-shadow:0 2px 0 color-mix(in srgb,var(--brand) 60%,#000)}
.secure{display:flex;gap:6px;align-items:center;justify-content:center;font-size:13px;margin-top:18px}
.mute{position:fixed;top:calc(10px + env(safe-area-inset-top,0px));right:12px;z-index:5;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--card);font-size:20px;cursor:pointer}
/* the celebration */
.done{position:fixed;inset:0;z-index:40;display:flex;flex-direction:column;align-items:center;justify-content:safe center;gap:6px;overflow-y:auto;text-align:center;padding:24px 16px calc(24px + env(safe-area-inset-bottom,0px));color:#fff;background:var(--party);clip-path:circle(0 at var(--ox,50%) var(--oy,80%))}
.done[hidden]{display:none}
.done.on{animation:wipe .6s cubic-bezier(.7,0,.3,1) forwards}
@keyframes wipe{to{clip-path:circle(150% at var(--ox,50%) var(--oy,80%))}}
.done .sun{position:fixed;left:50%;top:30%;width:900px;height:900px;margin:-450px;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.09) 0 10deg,transparent 10deg 20deg);border-radius:50%;animation:turn 30s linear infinite;pointer-events:none}
@keyframes turn{to{transform:rotate(360deg)}}
.done > *:not(.sun){position:relative}
.done .mascot{width:170px;height:160px;flex:none}
@media (max-height:760px){.done{gap:2px}.done .mascot{width:120px;height:114px}.done .amt{font-size:54px}.done .tally{font-size:28px;padding:8px 20px;margin-top:6px}.done .gbar{margin-top:8px}.milestone{margin-top:6px;font-size:16px}.cheers{margin-top:8px}.cheer{width:50px;height:50px;font-size:24px}.done .btn{margin-top:10px;padding:14px}}
.done .amt{font:800 clamp(56px,18vw,84px)/1 Fraunces,Georgia,serif;margin-top:4px;text-shadow:0 4px 0 rgba(0,0,0,.18);opacity:0}
.done .amt.slam{animation:slam .55s cubic-bezier(.3,1.7,.5,1) forwards}
@keyframes slam{0%{opacity:0;transform:scale(2.6)}100%{opacity:1;transform:none}}
.done .msg{font-size:18px;max-width:30ch;text-wrap:balance}
.done .tally{margin-top:10px;padding:12px 24px;border-radius:18px;background:#1b1210;color:#ffcf73;font:800 36px/1 Inter,system-ui,sans-serif;text-shadow:0 0 14px rgba(255,170,60,.9);font-variant-numeric:tabular-nums;min-width:160px}
.done .gbar{width:min(300px,80vw);height:12px;border-radius:99px;background:rgba(255,255,255,.22);margin-top:12px;overflow:hidden}
.done .gbar i{display:block;height:100%;width:0;background:#ffd76a;border-radius:99px;transition:width 1.4s cubic-bezier(.2,.8,.2,1)}
.done .glabel{font-size:14px;opacity:.85}
.milestone{margin-top:10px;padding:8px 16px;border-radius:99px;background:#ffd76a;color:#5a2a00;font:800 18px Inter,sans-serif;animation:pop-in .6s cubic-bezier(.3,1.8,.5,1)}
.social{font-weight:600;opacity:0;transition:opacity .5s}.social.on{opacity:.95}
.cheers{margin-top:14px;opacity:0;transform:translateY(20px);transition:opacity .5s,transform .5s cubic-bezier(.3,1.5,.5,1)}
.cheers.on{opacity:1;transform:none}
.cheers p{margin:0 0 8px;font-size:15px;opacity:.9}
.cheer-row{display:flex;gap:10px;justify-content:center}
.cheer{width:58px;height:58px;border-radius:50%;border:0;background:rgba(255,255,255,.18);font-size:28px;cursor:pointer;transition:transform .15s,background .15s;touch-action:manipulation}
.cheer:hover{background:rgba(255,255,255,.3)}.cheer:active{transform:scale(.88)}
.cheer:disabled{opacity:.4}
.done .btn{max-width:280px;margin-top:18px;background:#fff;color:#7a1014}
:root{--party:radial-gradient(circle at 50% 30%,#ff8fa3,#d94164 45%,#7a1014)}
.kind-tip{--party:radial-gradient(circle at 50% 30%,#ffd27a,#f08a3c 45%,#9a3412)}
.kind-plate{--party:radial-gradient(circle at 50% 30%,#3b3357,#201a33 55%,#100c1c)}
.kind-plate .done .sun{background:radial-gradient(circle,rgba(255,215,140,.35),transparent 60%);animation:breathe 4s ease-in-out infinite}
@keyframes breathe{50%{transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){.done.on{animation:none;clip-path:none}.done .sun{animation:none}}`;

export function tapPage({ jar, kind, live, publishable_key, min_cents, max_cents }) {
  const presets = jar.presets;
  const start = presets[Math.min(1, presets.length - 1)];
  const pct = jar.goal_cents ? Math.min(100, (100 * jar.balance_cents) / jar.goal_cents) : 0;
  const goal = jar.goal_cents
    ? `<div class="goal"><div class="row"><b id="bal">${money(jar.balance_cents)}</b><span class="muted" id="toGo">${pct >= 100 ? 'Goal reached!' : `${money(jar.goal_cents - jar.balance_cents)} to go`}</span></div><div class="bar"><i id="barFill" data-pct="${pct}"></i><b aria-hidden="true">🎯</b></div></div>`
    : '';
  const done = {
    piggy: `<div class="msg" id="doneMsg"></div><div class="tally" id="tally"><span id="tallyNum">${money(jar.balance_cents)}</span></div>${jar.goal_cents ? '<div class="gbar"><i id="gFill"></i></div><div class="glabel" id="gLabel"></div>' : ''}`,
    tip: '<div class="msg" id="doneMsg"></div>',
    plate: '<div class="msg" id="doneMsg"></div>',
  }[jar.kind];
  const body = `
<button class="mute" id="mute" type="button" aria-label="Sound">🔊</button>
<main class="wrap">
  <header class="hero" id="hero">
    <div class="stage"><div class="rings" aria-hidden="true"><i></i><i></i><i></i></div>${mascot(jar.kind, 'pig')}</div>
    <span class="badge">${esc(kind.label)}</span>
    <h1>${esc(jar.name)}</h1>
    ${jar.tagline ? `<p class="muted tag">${esc(jar.tagline)}</p>` : ''}
  </header>
  ${goal}
  <h2>How much?</h2>
  <div class="chips" role="group" aria-label="Amount">
    ${presets.map((c, i) => `<button class="chip" data-c="${c}" aria-pressed="${c === start}">${kind.treats[i] ? `<span class="t" aria-hidden="true">${kind.treats[i]}</span>` : ''}${money(c)}</button>`).join('')}
    <button class="chip small" data-c="custom" aria-pressed="false">${kind.treats.length ? '<span class="t" aria-hidden="true">✨</span>' : ''}Other</button>
  </div>
  <label class="custom" id="customBox"><span>$</span><input id="custom" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Custom amount"></label>
  <div class="total"><span class="muted">${esc(kind.verb)}</span><b id="total">${money(start)}</b></div>
  <div id="payArea">
  ${live
    ? `<div id="express"></div>
  <details id="cardBox"><summary>Pay with card instead</summary><div class="in"><div id="payEl"></div><button class="btn" id="cardGo" style="margin-top:14px" disabled>${esc(kind.verb)} <span class="amtLabel">${money(start)}</span></button></div></details>`
    : `<div class="demo"><b>Demo mode.</b> No Stripe keys are set, so this button stands in for Apple Pay / Google Pay and no card is charged.</div>
  <button class="btn" id="demoGo">${esc(kind.verb)} <span class="amtLabel">${money(start)}</span></button>`}
  </div>
  <p class="err" id="err" role="alert"></p>
  <div class="secure muted"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z"/></svg>Payments processed securely by Stripe</div>
</main>
<div class="done" id="done" hidden aria-live="polite">
  <div class="sun" aria-hidden="true"></div>
  ${mascot(jar.kind, 'pig2')}
  <div class="amt" id="doneAmt"></div>
  ${done}
  <div class="milestone" id="milestone" hidden></div>
  <div class="social" id="social"></div>
  <div class="cheers" id="cheers"><p id="cheerQ"></p><div class="cheer-row">${kind.cheers.map((c) => `<button class="cheer" type="button" data-cheer="${c}" aria-label="Send ${c}">${c}</button>`).join('')}</div></div>
  <button class="btn" type="button" onclick="location.replace(location.pathname)">Done</button>
</div>`;

  const script = `
const JAR=${json(jar)},KIND=${json(kind)},MIN=${min_cents},MAX=${max_cents};
const $=(s)=>document.querySelector(s),$$=(s)=>Array.from(document.querySelectorAll(s));
const fmt=(c)=>'$'+(c/100).toFixed(c%100?2:0);
const F=window.Fun,MKEY='piggy-muted-'+JAR.kind;
const since=()=>new Date().setHours(0,0,0,0);
let amount=${start},valid=true,onAmount=null;
async function api(path,body){const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'Something went wrong');return j}
function err(m){$('#err').textContent=m||''}

// Sound: on for piggy banks and tip jars, off by default in church.
F.loadMuted(MKEY,JAR.kind==='plate');
const muteBtn=$('#mute');
function paintMute(){muteBtn.textContent=F.muted?'🔈':'🔊';muteBtn.setAttribute('aria-label',F.muted?'Turn sound on':'Turn sound off')}
paintMute();muteBtn.onclick=()=>{F.setMuted(!F.muted,MKEY);paintMute();if(!F.muted)F.sfx.pop()};

// The mascot reacts to the amount, and its eyes follow your finger.
const pig=$('#pig');
function moodFor(c){if(JAR.kind==='plate')return 'idle';const i=JAR.presets.indexOf(c);if(i>=0)return ['m1','m2','m3'][Math.min(i,2)];if(c>=1000)return 'big';return c>JAR.presets[JAR.presets.length-1]?'m3':'m2'}
function setMood(m){if(pig.dataset.mood===m)return;pig.dataset.mood=m;F.bounce(pig,1.1);pig.classList.remove('wiggle');void pig.getBoundingClientRect();pig.classList.add('wiggle')}
addEventListener('pointermove',(e)=>{const r=pig.getBoundingClientRect();const dx=(e.clientX-(r.left+r.width/2))/r.width,dy=(e.clientY-(r.top+r.height/2))/r.height;const k=(v)=>Math.max(-3.5,Math.min(3.5,v*9)).toFixed(1);$$('#pig .pupil').forEach((p)=>p.style.transform='translate('+k(dx)+'px,'+k(dy)+'px)')});
requestAnimationFrame(()=>{$('#hero').classList.add('arrive');setMood(moodFor(amount))});
const bar=$('#barFill');if(bar)setTimeout(()=>{bar.style.width=bar.dataset.pct+'%'},250);

function setAmount(c){
  valid=Number.isInteger(c)&&c>=MIN&&c<=MAX;if(valid)amount=c;
  const t=$('#total'),txt=valid?fmt(c):'—';
  if(t.textContent!==txt){t.textContent=txt;if(!F.reduce)t.animate([{transform:'translateY(45%) scale(.8)',opacity:0},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.3,1.6,.5,1)'})}
  $$('.amtLabel').forEach((e)=>e.textContent=valid?fmt(c):'');
  err(valid||!c?'':'Pick between '+fmt(MIN)+' and '+fmt(MAX));
  if(valid)setMood(moodFor(c));
  onAmount&&onAmount(valid);
}
$$('.chip').forEach((b)=>b.onclick=()=>{
  $$('.chip').forEach((x)=>x.setAttribute('aria-pressed',x===b));
  const custom=b.dataset.c==='custom';$('#customBox').classList.toggle('on',custom);
  if(custom){$('#custom').focus();setAmount(Math.round(parseFloat($('#custom').value||'0')*100))}else setAmount(Number(b.dataset.c));
  F.sfx.pop();F.buzz(8);
  const r=b.getBoundingClientRect();F.burst({x:r.left+r.width/2,y:r.top+8,count:16,kinds:['confetti'],speed:[3,8],life:[30,55],size:[4,8]});
});
$('#custom').oninput=(e)=>{e.target.value=e.target.value.replace(/[^0-9.]/g,'').replace(/(\\..*)\\./g,'$1').replace(/(\\.\\d{2}).+/,'$1');setAmount(Math.round(parseFloat(e.target.value||'0')*100))};

// ─── the big moment ───
const ORD=(n)=>n+(['th','st','nd','rd'][(n%100-20)%10]||['th','st','nd','rd'][n%100]||'th');
const MSG={piggy:'added to '+JAR.owner+"'s piggy bank",tip:'tipped to '+JAR.owner+'. Thank you!',plate:'Thank you for your gift to '+JAR.owner};
async function celebrate(r){
  const done=$('#done'),pig2=$('#pig2'),before=r.jar.balance_cents-r.amount_cents;
  const src=$('#payArea').getBoundingClientRect();
  done.style.setProperty('--ox',(src.left+src.width/2)+'px');done.style.setProperty('--oy',(src.top+src.height/2)+'px');
  $('#doneAmt').textContent=fmt(r.amount_cents);$('#doneMsg').textContent=MSG[JAR.kind];
  if($('#tallyNum'))$('#tallyNum').textContent=fmt(before);
  pig2.dataset.mood='gulp';
  done.hidden=false;done.classList.add('on');document.body.style.overflow='hidden';
  F.sfx.whoosh();F.buzz(15);
  await F.sleep(450);
  await F.flyCoin($('#payArea'),pig2.querySelector('.slot'),{label:fmt(r.amount_cents)});
  // Landed.
  const plate=JAR.kind==='plate';
  F.bounce(pig2,1.28);F.sfx.coin();setTimeout(()=>plate?F.sfx.chime():F.sfx.chaching(),110);F.buzz([30,40,70]);
  if(!plate)F.shake(done,7);
  pig2.dataset.mood='happy';pig2.classList.add('glow');
  const pr=pig2.getBoundingClientRect(),px=pr.left+pr.width/2,py=pr.top+pr.height*.35;
  const big=Math.min(3,1+r.amount_cents/500);
  if(plate){F.burst({x:px,y:py,count:60,kinds:['spark'],speed:[1,5],gravity:-.03,life:[100,170],size:[6,15]})}
  else{
    F.burst({x:px,y:py,count:Math.round(90*big),kinds:JAR.kind==='tip'?['confetti','coin','heart']:['confetti','coin'],speed:[6,17]});
    if(r.amount_cents>=500)setTimeout(()=>F.rain({kinds:['coin','confetti'],duration:900+500*big,perFrame:2}),250);
  }
  $('#doneAmt').classList.add('slam');
  if(JAR.kind==='piggy')await F.countUp($('#tallyNum'),before,r.jar.balance_cents,{fmt:(v)=>fmt(Math.round(v)),dur:1300});
  if(JAR.goal_cents&&$('#gFill')){
    const pb=Math.min(100,100*before/JAR.goal_cents),pa=Math.min(100,100*r.jar.balance_cents/JAR.goal_cents);
    $('#gFill').style.width=pb+'%';requestAnimationFrame(()=>requestAnimationFrame(()=>{$('#gFill').style.width=pa+'%'}));
    $('#gLabel').textContent=pa>=100?'Goal reached!':Math.floor(pa)+'% of '+fmt(JAR.goal_cents);
    const hit=[25,50,75,100].filter((m)=>pb<m&&pa>=m).pop();
    if(hit){
      await F.sleep(900);
      const m=$('#milestone');m.textContent=hit===100?'🎯 Goal reached!':hit===50?'Halfway there!':hit+'% of the way!';m.hidden=false;
      F.sfx.fanfare();F.buzz([60,40,60,40,120]);
      for(let i=0;i<4;i++)setTimeout(()=>F.burst({x:innerWidth*(.2+Math.random()*.6),y:innerHeight*(.15+Math.random()*.25),count:70,kinds:['confetti'],speed:[4,11]}),i*320);
    }
  }
  if(!plate&&r.today_count){
    $('#social').textContent=r.today_count===1?(JAR.kind==='tip'?'First tip of the day!':'First deposit today!'):(JAR.kind==='tip'?"You're the "+ORD(r.today_count)+' tip today 🙌':ORD(r.today_count)+' deposit today');
    $('#social').classList.add('on');
  }
  await F.sleep(400);
  $('#cheerQ').textContent=plate?'Add a blessing':'Send a cheer to '+(JAR.kind==='piggy'?JAR.owner+"'s pig":JAR.owner);
  $('#cheers').classList.add('on');
  $$('.cheer').forEach((b)=>b.onclick=async()=>{
    $$('.cheer').forEach((x)=>x.disabled=true);
    const bb=b.getBoundingClientRect();F.burst({x:bb.left+bb.width/2,y:bb.top,count:14,kinds:['emoji'],text:b.dataset.cheer,speed:[5,12],gravity:.25});F.sfx.pop();F.buzz(12);
    try{await api('/api/jars/'+JAR.slug+'/cheer',{payment_id:r.payment_id,cheer:b.dataset.cheer});$('#cheerQ').textContent='Sent! '+b.dataset.cheer+' just popped up on the '+(JAR.kind==='piggy'?'pig':JAR.kind==='tip'?'jar':'plate')+'.'}
    catch(e){$('#cheerQ').textContent=e.message}
  });
}
${live ? liveScript(jar, kind, publishable_key) : `$('#demoGo').onclick=async()=>{if(!valid)return;const b=$('#demoGo');b.disabled=true;err();try{await celebrate(await api('/api/jars/'+JAR.slug+'/demo-pay',{amount_cents:amount,since:since()}))}catch(e){err(e.message);b.disabled=false}};
onAmount=(ok)=>{$('#demoGo').disabled=!ok};`}`;
  return shell(`${kind.verb} · ${jar.name}`, body + `<script src="/static/fun.js"></script><script>${script}</script>`, {
    css: MASCOT_CSS + TAP_CSS,
    head: (live ? '<script src="https://js.stripe.com/v3/"></script>' : ''),
    bodyClass: `kind-${jar.kind}`,
  });
}

// Apple Pay / Google Pay through Stripe's Express Checkout Element in
// deferred-intent mode: the button renders before any PaymentIntent exists,
// follows the chosen amount, and the intent is created on confirm.
function liveScript(jar, kind, pk) {
  const apple = { piggy: 'add-money', tip: 'tip', plate: 'plain' }[jar.kind];
  return `
const stripe=Stripe(${json(pk)});
const dark=matchMedia('(prefers-color-scheme: dark)').matches;
const elements=stripe.elements({mode:'payment',amount,currency:JAR.currency,appearance:{theme:dark?'night':'stripe',variables:{colorPrimary:dark?'#e2606a':'#7a1014',borderRadius:'12px',fontFamily:'Inter, system-ui, sans-serif'}},fonts:[{cssSrc:'https://fonts.googleapis.com/css2?family=Inter:wght@400;600'}]});
const ex=elements.create('expressCheckout',{buttonHeight:56,buttonTheme:{applePay:dark?'white':'black',googlePay:dark?'white':'black'},buttonType:{applePay:${json(apple)},googlePay:'plain'},paymentMethods:{applePay:'always',googlePay:'always',link:'never',amazonPay:'never',paypal:'never'}});
ex.on('ready',({availablePaymentMethods})=>{if(!availablePaymentMethods){$('#express').style.display='none';$('#cardBox').open=true}});
ex.on('click',(ev)=>{F.sfx.pop();ev.resolve()});
ex.on('confirm',async(ev)=>{const ok=await pay();if(!ok)ev.paymentFailed({reason:'fail'})});
ex.mount('#express');
const pe=elements.create('payment',{layout:'tabs',wallets:{applePay:'never',googlePay:'never'}});pe.mount('#payEl');pe.on('ready',()=>{$('#cardGo').disabled=!valid});
$('#cardGo').onclick=async()=>{const b=$('#cardGo');b.disabled=true;await pay();b.disabled=!valid};
onAmount=(ok)=>{if(ok)elements.update({amount});$('#cardGo').disabled=!ok};
async function pay(){
  err();if(!valid){err('Pick an amount first');return false}
  try{
    const {error:se}=await elements.submit();if(se){err(se.message);return false}
    const pi=await api('/api/jars/'+JAR.slug+'/intents',{amount_cents:amount});
    const {error,paymentIntent}=await stripe.confirmPayment({elements,clientSecret:pi.client_secret,redirect:'if_required',confirmParams:{return_url:location.origin+location.pathname}});
    if(error){err(error.message);return false}
    finish(paymentIntent.id);return true;
  }catch(e){err(e.message);return false}
}
async function finish(id){
  for(let i=0;i<10;i++){const r=await api('/api/payments/'+id+'/sync',{since:since()});if(r.status==='succeeded'&&r.jar)return celebrate(r);if(r.status!=='processing')break;await new Promise((z)=>setTimeout(z,1200))}
  err('Payment is still processing. It will show up shortly.');
}
// Back from a redirect-based method (rare for wallets, possible for 3-D Secure).
const back=new URLSearchParams(location.search).get('payment_intent');if(back)finish(back).catch((e)=>err(e.message));`;
}

// ─── Display: the backlit balance on the bottom of the pig ──────────────────
const DISPLAY_CSS = `
body{background:#0e0908;color:#f6ece7;min-height:100vh;overflow-x:hidden}
.stage{max-width:560px;margin:0 auto;padding:22px 16px 40px;text-align:center;position:relative}
.stage .mascot{width:150px;height:142px;margin:6px auto -26px;position:relative;z-index:2}
.belly{position:relative;margin:0 auto;width:min(86vw,340px);aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 50% 40%,#f2b2a1,#d98a78 70%,#b8695a);box-shadow:inset 0 -18px 40px rgba(0,0,0,.25),0 20px 60px rgba(0,0,0,.5);display:grid;place-items:center}
.kind-tip .belly{background:radial-gradient(circle at 50% 40%,#f1f8fa,#c9e2ea 70%,#9cc7d6)}
.kind-plate .belly{background:radial-gradient(circle at 50% 45%,#8e2a31,#6d1b21 60%,#4a2416 61%,#7b4a2c 75%,#5a3420)}
.belly .foot{position:absolute;width:22%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 40% 35%,#5a3328,#2b1510);box-shadow:inset 0 -4px 8px rgba(0,0,0,.4)}
.kind-tip .foot,.kind-plate .foot{display:none}
.f1{top:6%;left:6%}.f2{top:6%;right:6%}.f3{bottom:6%;left:6%}.f4{bottom:6%;right:6%}
.digits{font:800 clamp(48px,16vw,84px)/1 Inter,system-ui,sans-serif;color:#ffcf73;text-shadow:0 0 12px rgba(255,170,60,.95),0 0 36px rgba(255,140,30,.7);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.pop{position:absolute;top:20%;left:50%;transform:translateX(-50%);font:800 30px Inter,sans-serif;color:#fff;text-shadow:0 0 14px #ffb547;opacity:0;pointer-events:none}
.pop.go{animation:popup 1.8s ease-out}
@keyframes popup{0%{opacity:0;transform:translate(-50%,20px) scale(.6)}15%{opacity:1;transform:translate(-50%,0) scale(1.2)}100%{opacity:0;transform:translate(-50%,-60px) scale(1)}}
.bump{animation:bump .5s}@keyframes bump{40%{transform:scale(1.14)}}
.flash{position:fixed;inset:0;background:radial-gradient(circle,rgba(255,200,120,.55),transparent 70%);opacity:0;pointer-events:none;z-index:1}
.flash.go{animation:flash 1s ease-out}@keyframes flash{15%{opacity:1}100%{opacity:0}}
h1{font-size:24px;margin:6px 0 0}.muted{color:#b19f99}
ul{list-style:none;padding:0;margin:22px auto 0;max-width:340px;text-align:left}
li{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #2c211f;font-size:15px}
li.new{animation:slidein .5s cubic-bezier(.3,1.5,.5,1)}@keyframes slidein{from{opacity:0;transform:translateX(-30px)}}
.milestone{display:inline-block;margin-top:14px;padding:8px 16px;border-radius:99px;background:#ffd76a;color:#5a2a00;font:800 18px Inter,sans-serif}
.cheer-float{position:fixed;left:50%;bottom:-120px;font-size:120px;z-index:65;pointer-events:none;transform:translateX(-50%)}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:22px}
.tap,.sound{display:inline-block;padding:12px 18px;border:1px solid #3a2d2a;border-radius:12px;color:#f6ece7;text-decoration:none;font:600 15px Inter,sans-serif;background:transparent;cursor:pointer}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#3ad07a;margin-right:6px;box-shadow:0 0 8px #3ad07a}`;

export function displayPage({ jar, kind, recent }) {
  const when = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const item = (p) => `<li><span>${money(p.amount_cents)}${p.cheer ? ` ${esc(p.cheer)}` : ''}${p.method ? ` <span class="muted">· ${esc(p.method.replace('_', ' '))}</span>` : ''}</span><span class="muted">${when(p.created_at)}</span></li>`;
  const body = `
<div class="flash" id="flash"></div>
<main class="stage">
  <span class="badge" style="color:#b19f99">${esc(kind.label)} · live display</span>
  <h1 class="serif">${esc(jar.name)}</h1>
  ${mascot(jar.kind, 'pig')}
  <div class="belly" id="belly"><i class="foot f1"></i><i class="foot f2"></i><i class="foot f3"></i><i class="foot f4"></i>
    <div class="digits" id="digits">$${Math.floor(jar.balance_cents / 100)}</div><div class="pop" id="pop"></div></div>
  <div class="muted" style="margin-top:14px"><span class="dot"></span>Live. Updates the moment a phone pays.</div>
  ${jar.goal_cents ? `<div class="muted" style="margin-top:6px" id="goal">${Math.floor((100 * jar.balance_cents) / jar.goal_cents)}% of the ${money(jar.goal_cents)} goal</div>` : ''}
  <div id="milestone" class="milestone" hidden></div>
  <ul id="list">${recent.map(item).join('')}</ul>
  <div class="row"><a class="tap" href="/j/${esc(jar.slug)}">Open the tap page →</a><button class="sound" id="sound" type="button">🔈 Turn on sound</button></div>
</main>`;
  const script = `
const JAR=${json(jar)},GOAL=JAR.goal_cents;const $=(s)=>document.querySelector(s);const F=window.Fun;
const fmt=(c)=>'$'+(c/100).toFixed(c%100?2:0);
F.setMuted(true);
$('#sound').onclick=()=>{F.setMuted(!F.muted);$('#sound').textContent=F.muted?'🔈 Turn on sound':'🔊 Sound on';if(!F.muted)F.sfx.coin()};
const pig=$('#pig');let shown=JAR.balance_cents,first=true,queue=Promise.resolve();
addEventListener('pointermove',(e)=>{const r=pig.getBoundingClientRect();const k=(v)=>Math.max(-3.5,Math.min(3.5,v*9)).toFixed(1);const dx=(e.clientX-(r.left+r.width/2))/r.width,dy=(e.clientY-(r.top+r.height/2))/r.height;document.querySelectorAll('#pig .pupil').forEach((p)=>p.style.transform='translate('+k(dx)+'px,'+k(dy)+'px)')});
async function payment(e){
  const before=shown;shown=e.balance_cents;
  const top=document.createElement('div');top.style.cssText='position:fixed;left:50%;top:-60px;width:1px;height:1px';document.body.appendChild(top);
  pig.dataset.mood='gulp';F.sfx.whoosh();
  await F.flyCoin(top,pig.querySelector('.slot'),{label:fmt(e.amount_cents),dur:700});top.remove();
  F.bounce(pig,1.28);F.sfx.coin();setTimeout(()=>JAR.kind==='plate'?F.sfx.chime():F.sfx.chaching(),110);
  pig.dataset.mood=JAR.kind==='plate'?'idle':'happy';pig.classList.add('glow');setTimeout(()=>{pig.classList.remove('glow');pig.dataset.mood='idle'},2600);
  $('#flash').classList.remove('go');void $('#flash').offsetWidth;$('#flash').classList.add('go');
  const b=$('#belly').getBoundingClientRect();
  if(JAR.kind==='plate')F.burst({x:b.left+b.width/2,y:b.top+b.height/2,count:50,kinds:['spark'],speed:[1,5],gravity:-.03,life:[100,170],size:[6,15]});
  else F.burst({x:b.left+b.width/2,y:b.top+b.height/2,count:Math.round(80*Math.min(3,1+e.amount_cents/500)),kinds:['confetti','coin'],speed:[6,16]});
  const p=$('#pop');p.textContent='+'+fmt(e.amount_cents);p.classList.remove('go');void p.offsetWidth;p.classList.add('go');
  const d=$('#digits');d.classList.remove('bump');void d.offsetWidth;d.classList.add('bump');
  await F.countUp(d,before,e.balance_cents,{fmt:(v)=>'$'+Math.floor(v/100),dur:1100});
  const li=document.createElement('li');li.className='new';li.innerHTML='<span>'+fmt(e.amount_cents)+'</span><span class="muted">just now</span>';$('#list').prepend(li);
  if(GOAL){
    const pb=100*before/GOAL,pa=100*e.balance_cents/GOAL;$('#goal').textContent=Math.floor(Math.min(100,pa))+'% of the '+fmt(GOAL)+' goal';
    const hit=[25,50,75,100].filter((m)=>pb<m&&pa>=m).pop();
    if(hit){const m=$('#milestone');m.textContent=hit===100?'🎯 Goal reached!':hit===50?'Halfway there!':hit+'% of the way!';m.hidden=false;F.sfx.fanfare();
      for(let i=0;i<5;i++)setTimeout(()=>F.burst({x:innerWidth*(.15+Math.random()*.7),y:innerHeight*(.1+Math.random()*.3),count:70,kinds:['confetti'],speed:[4,11]}),i*300);
      setTimeout(()=>{m.hidden=true},6000)}
  }
}
function cheer(e){
  const el=document.createElement('div');el.className='cheer-float';el.textContent=e.cheer;document.body.appendChild(el);
  el.animate([{transform:'translate(-50%,0) scale(.6)',opacity:0},{transform:'translate(-50%,-55vh) scale(1.3)',opacity:1,offset:.6},{transform:'translate(-50%,-80vh) scale(1)',opacity:0}],{duration:F.reduce?1:2600,easing:'cubic-bezier(.2,.8,.3,1)'}).finished.then(()=>el.remove());
  F.rain({kinds:['emoji'],text:e.cheer,duration:900,perFrame:1,gravity:.18});F.sfx.pop();
  const li=$('#list li');if(li)li.firstElementChild.append(' '+e.cheer);
  pig.dataset.mood='big';setTimeout(()=>{pig.dataset.mood='idle'},2200);
}
const es=new EventSource('/api/jars/'+JAR.slug+'/stream');
es.onmessage=(m)=>{const e=JSON.parse(m.data);
  if(first){first=false;shown=e.balance_cents;$('#digits').textContent='$'+Math.floor(e.balance_cents/100);return}
  queue=queue.then(()=>e.cheer?cheer(e):e.amount_cents?payment(e):null).catch(()=>{});
};`;
  return shell(`Display · ${jar.name}`, body + `<script src="/static/fun.js"></script><script>${script}</script>`, { css: MASCOT_CSS + DISPLAY_CSS, bodyClass: `kind-${jar.kind}` });
}

// ─── Home: the concept, with the three demo devices ─────────────────────────
const HOME_CSS = `
.wrap{max-width:880px}
.hero{padding:28px 0 10px}.hero h1{font-size:clamp(40px,9vw,68px);line-height:.95;margin:0;color:var(--brand)}
.hero p{font-size:19px;max-width:560px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:24px 0}
.step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.step b{display:block;font-family:Fraunces,serif;font-size:20px;margin-bottom:4px}
.jars{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:14px}
.jar{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:10px}
.jar h3{margin:0;font-family:Fraunces,serif;font-size:20px}
.row{display:flex;gap:8px}.row a{flex:1;text-align:center;padding:12px;border-radius:12px;text-decoration:none;font-weight:600}
.row .p{background:var(--brand);color:var(--brand-ink)}.row .s{border:1px solid var(--line);color:var(--ink)}
.mode{display:inline-block;padding:6px 10px;border-radius:99px;font-size:13px;font-weight:600;background:var(--line)}
pre{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;overflow:auto;font-size:13px}`;

export function homePage({ jars, live }) {
  const body = `
<main class="wrap">
  <section class="hero"><span class="mode">${live ? 'Live: Stripe connected' : 'Demo mode: no cards charged'}</span>
    <h1>Tap. Pick.<br>Drop it in.</h1>
    <p class="muted">A piggy bank, tip jar or collection plate that takes Apple Pay and Google Pay. Touch your phone to it, pick $1, $3, $5 or your own amount, and confirm with Face ID or your fingerprint. No app to install.</p></section>
  <div class="steps">
    <div class="step"><b>1. Tap</b><span class="muted">An NFC tag inside the jar (and a QR code on the bottom) opens its page in the phone's browser.</span></div>
    <div class="step"><b>2. Pick</b><span class="muted">$1, $3, $5 or Other. Amounts are set per jar.</span></div>
    <div class="step"><b>3. Pay</b><span class="muted">Apple Pay or Google Pay through Stripe. Card entry is a fallback.</span></div>
    <div class="step"><b>4. Glow</b><span class="muted">The jar's backlit display ticks up the moment the payment clears.</span></div>
  </div>
  <h2 class="serif">Try a device</h2>
  <p class="muted">Open “Display” on a laptop, then “Tap” on your phone (or the same screen). Each tap page is the URL you'd write to that device's NFC tag.</p>
  <div class="jars">${jars.map((j) => `
    <div class="jar"><div style="display:flex;gap:12px;align-items:center">${PIG}<div><span class="badge">${esc(j.label)}</span><h3>${esc(j.name)}</h3></div></div>
      <div class="muted">${esc(j.tagline || '')}</div>
      <div class="row"><a class="p" href="/j/${esc(j.slug)}">Tap</a><a class="s" href="/d/${esc(j.slug)}">Display</a></div></div>`).join('')}
  </div>
  <h2 class="serif" style="margin-top:36px">For the hardware</h2>
  <p class="muted">The jar's microcontroller polls its balance over Wi-Fi with the key it was provisioned with:</p>
  <pre>GET /api/device/&lt;slug&gt;
x-device-key: &lt;device key&gt;

{ "balance_cents": 7300, "display": "$73", "goal_cents": 15000,
  "last_payment": { "amount_cents": 500, "at": 1760000000000 } }</pre>
</main>`;
  return shell('Piggy · Tap to give', body, { css: HOME_CSS });
}

export const notFoundPage = () =>
  shell('Not found', `<main class="wrap" style="text-align:center;padding-top:80px">${PIG}<h1 class="serif">This jar isn't set up yet</h1><p class="muted">The tag you tapped doesn't point to an active jar.</p><a href="/">Go home</a></main>`);

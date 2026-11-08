// The Studio's latency budget: every main interaction on the picture, the flats and the panel, driven the way an iPad drives it (a Pencil
// sends 4 samples a frame) on a CPU slowed 4× (an older iPad), and each held to a budget (scripts/perf/budgets.json). It builds its own
// fixture: a graphic with layers (painted pictures, type, a shape) and a concept drawn from the sketch pack, so it needs only a server and a
// staff token.
//   per interaction:  main  = time the page's main thread spent per frame (scripting, style, layout, paint set-up): what the code controls
//                     frame = average time from frame to frame (includes drawing the pixels, which a test browser does in software and an
//                             iPad on its graphics chip, so its budget is looser)
//                     release = from lifting the Pencil to the frame after the settled picture
//   run:   node scripts/perf/studio-perf.mjs --base http://127.0.0.1:3200 --token <staff JWT>   (or npm run perf -- …)
//          PERF_JSON=out.json writes the numbers; --rate 1 runs at full speed; --only picture|flats|panel
//   exit:  1 when anything is over its budget, with the table saying which
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';

const BUDGETS = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));

// the in-page driver: pointer events at 4 a frame on an element, with the frames timed from rAF to rAF
const DRIVER = `window.__perfDrive=async(el,pts,{type='pen',multi=null,frames=30}={})=>{const fr=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));
  const ev=(t,x,y,id=7,o={})=>el.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,composed:true,pointerId:id,pointerType:type,isPrimary:id===7,clientX:x,clientY:y,pressure:.5,buttons:t==='pointerup'?0:1,...o}));
  await fr();await fr();const times=[];let last=await fr();ev('pointerdown',pts[0][0],pts[0][1]);if(multi)ev('pointerdown',multi[0][0],multi[0][1],8,{isPrimary:false});
  for(let f=1;f<=frames;f++){for(let k=0;k<4;k++){const i=Math.min(pts.length-1,Math.round((f-1+k/4)/frames*(pts.length-1)));ev('pointermove',pts[i][0],pts[i][1]);if(multi){const j=Math.min(multi.length-1,i);ev('pointermove',multi[j][0],multi[j][1],8,{isPrimary:false})}}const t=await fr();times.push(t-last);last=t}
  const t0=performance.now();ev('pointerup',pts.at(-1)[0],pts.at(-1)[1]);if(multi)ev('pointerup',multi.at(-1)[0],multi.at(-1)[1],8,{isPrimary:false});await fr();await fr();const rel=performance.now()-t0;
  return{frames:times.length,avg:times.reduce((s,x)=>s+x,0)/times.length,release:rel}};
window.__perfSlide=async(sel)=>{const i=document.querySelector(sel);if(!i)return null;const fr=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));const mn=+i.min,mx=+i.max;let last=await fr();const ts=[];
  for(let f=0;f<20;f++){i.value=String(mn+(mx-mn)*(f%10)/10);i.dispatchEvent(new Event('input',{bubbles:true}));const t=await fr();ts.push(t-last);last=t}i.dispatchEvent(new Event('change',{bubbles:true}));const t0=performance.now();await new Promise(r=>setTimeout(r,400));await fr();
  return{frames:ts.length,avg:ts.reduce((s,x)=>s+x,0)/ts.length,release:performance.now()-t0-400}};
window.__perfClick=async(sel)=>{const fr=()=>new Promise(r=>requestAnimationFrame(t=>r(t)));await fr();const t0=performance.now();document.querySelector(sel)?.click();await fr();await fr();return{once:performance.now()-t0}};`;
const line = (x0, y0, x1, y1, n = 40) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);

export async function runPerf({ base, token, playwright = null, rate = 4, only = '', gl = false, log = console.log } = {}) {
  const q = gl ? '&gl=1' : ''; // --gl 1: the picture on the graphics chip (on trial), for comparison
  playwright ||= createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
  const b = await playwright.chromium.launch(), results = [], errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
    await ctx.addInitScript(t => { try { localStorage.setItem('fb.admin.token', t); localStorage.setItem('fb.studio.names', '0'); } catch { /* fine */ } }, token);
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const cdp = await ctx.newCDPSession(p); await cdp.send('Performance.enable');
    const busy = async () => { const m = (await cdp.send('Performance.getMetrics')).metrics; return (m.find(x => x.name === 'TaskDuration')?.value || 0) * 1000; };
    // one measurement: main-thread time over the run divided by its frames
    const measure = async (group, name, fn, frame = p) => {
      if (!(await frame.evaluate(() => typeof window.__perfDrive === 'function'))) await frame.evaluate(DRIVER); // a new graphic is saved to its own address, which loads the page again
      const t0 = await busy(); const r = await frame.evaluate(fn.src, fn.arg); const t1 = await busy(); if (!r) { results.push({ group, name, skipped: true }); return; }
      const out = { group, name, main: r.frames ? (t1 - t0 - (r.release || 0)) / r.frames : null, frame: r.avg ?? null, release: r.release ?? null, once: r.once ?? null };
      for (const k of ['main', 'frame', 'release', 'once']) if (out[k] != null) out[k] = Math.round(out[k] * 10) / 10;
      results.push(out); await p.waitForTimeout(350);
    };
    const throttle = () => cdp.send('Emulation.setCPUThrottlingRate', { rate }), full = () => cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const drive = (sel, pts, o = {}) => ({ src: ([sel, pts, o]) => window.__perfDrive(document.querySelector(sel), pts, o), arg: [sel, pts, o] });

    // ---- the picture: a graphic with layers ----
    if (!only || only === 'picture' || only === 'panel') {
      await p.goto(`${base}/lab/studio?new=graphic${q}`, { waitUntil: 'load' }); await p.waitForFunction(() => typeof LAYERS !== 'undefined' && typeof W === 'number' && W > 0, null, { timeout: 30000 }); await p.waitForTimeout(1500);
      await p.evaluate(DRIVER);
      await p.evaluate(() => { // three painted pictures, two lines of type, a shape: a working graphic, not an empty page
        const paint = (w, h, seed) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); let s = seed; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
          for (let i = 0; i < 160; i++) { x.fillStyle = `hsla(${r() * 360},70%,${30 + r() * 40}%,.8)`; x.beginPath(); x.arc(r() * w, r() * h, 10 + r() * 80, 0, Math.PI * 2); x.fill(); } return c; };
        for (let i = 0; i < 3; i++) addLayer(fresh('image', { name: 'Picture ' + (i + 1), raster: stamp(paint(700, 520, 7 + i)), x: W * (.3 + i * .2), y: H * (.35 + i * .12), scale: .8 }), { silent: true });
        addLayer(fresh('text', { name: 'Type', x: W / 2, y: H * .2, text: 'FUTURE BASICS', font: 'grotesk', size: Math.round(W / 12), bold: true, italic: false, track: 4, lead: 1.1, align: 'center', arc: 0, color: '#141416', outline: 0, outlineColor: '#ffffff', case: '', stretch: 100, outline2: 0, outline2Color: '#141416', shadowKind: 'none', shadow: 0, shadowAngle: 135, shadowColor: '#141416', env: 'none', envK: 40 }), { silent: true });
        addLayer(fresh('shape', { name: 'Box', shape: 'rect', w: 260, h: 160, radius: 18, fill: true, fillColor: '#2a6df4', stroke: true, strokeW: 6, strokeColor: '#141416', x: W * .7, y: H * .75 }), { silent: true });
        commit(); paintPanels(); draw();
      });
      await p.waitForTimeout(800);
      const geo = await p.evaluate(() => { const r = document.querySelector('#view').getBoundingClientRect(), l = LAYERS.find(q => q.name === 'Picture 2'); SEL = l.id; setTool('select'); draw();
        const k = corners(l)[2], rk = rotKnob(l); return { C: [r.x + r.width / 2, r.y + r.height / 2], L: [r.x + sx(l.x), r.y + sy(l.y)], K: [r.x + sx(k[0]), r.y + sy(k[1])], R: [r.x + rk[0], r.y + rk[1]] }; });
      await throttle();
      if (!only || only === 'picture') {
        const C = geo.C, run = async (name, tool, pts, o) => { await p.evaluate(t => { setTool(t); }, tool); await measure('picture', name, drive('#view', pts, o)); };
        await run('brush stroke', 'brush', line(C[0] - 150, C[1] - 80, C[0] + 150, C[1] + 90));
        await run('eraser stroke', 'eraser', line(C[0] + 150, C[1] - 80, C[0] - 150, C[1] + 90));
        await p.evaluate(() => { const l = LAYERS.find(q => q.name === 'Picture 2'); SEL = l.id; draw(); });
        await run('move a layer', 'select', line(geo.L[0], geo.L[1], geo.L[0] + 120, geo.L[1] + 60));
        await p.evaluate(() => { const l = LAYERS.find(q => q.name === 'Picture 2'); SEL = l.id; l.x -= 0; draw(); });
        const g2 = await p.evaluate(() => { const r = document.querySelector('#view').getBoundingClientRect(), l = selected(), k = corners(l)[2], rk = rotKnob(l); return { K: [r.x + sx(k[0]), r.y + sy(k[1])], R: [r.x + rk[0], r.y + rk[1]] }; });
        await run('resize a layer', 'select', line(g2.K[0], g2.K[1], g2.K[0] + 80, g2.K[1] + 60));
        const g3 = await p.evaluate(() => { const r = document.querySelector('#view').getBoundingClientRect(), rk = rotKnob(selected()); return [r.x + rk[0], r.y + rk[1]]; });
        await run('turn a layer', 'select', line(g3[0], g3[1], g3[0] + 90, g3[1] + 40));
        await run('liquify', 'liquify', line(C[0] - 60, C[1], C[0] + 60, C[1] + 30));
        await run('pan the view', 'hand', line(C[0], C[1], C[0] - 200, C[1] - 100));
        await p.evaluate(() => fit());
        await measure('picture', 'pinch zoom', { src: ([C]) => window.__perfDrive(document.querySelector('#view'), Array.from({ length: 40 }, (_, i) => [C[0] - 40 - i * 3, C[1] - 40 - i * 2]), { type: 'touch', multi: Array.from({ length: 40 }, (_, i) => [C[0] + 40 + i * 3, C[1] + 40 + i * 2]) }), arg: [C] });
        await p.evaluate(() => { fit(); setTool('brush'); });
        await measure('picture', 'Pencil hover', { src: async ([C]) => { const v = document.querySelector('#view'), fr = () => new Promise(r => requestAnimationFrame(t => r(t))); await fr(); let last = await fr(); const ts = [];
          for (let f = 0; f < 30; f++) { for (let k = 0; k < 4; k++) v.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, pointerType: 'pen', clientX: C[0] + f * 5 + k, clientY: C[1] + f * 2, buttons: 0 })); const t = await fr(); ts.push(t - last); last = t; }
          return { frames: ts.length, avg: ts.reduce((s, x) => s + x, 0) / ts.length, release: 0 }; }, arg: [C] });
      }
      if (!only || only === 'panel') {
        await p.evaluate(() => { const l = LAYERS.find(q => q.name === 'Picture 2'); SEL = l.id; setTool('select'); paintPanels(); draw(); }); await p.waitForTimeout(600);
        for (const k of ['a.hue', 'a.sat', 'scale', 'rotd', 'opacity']) await measure('panel', `slider ${k}`, { src: s => window.__perfSlide(s), arg: `#pLayers input[type=range][data-p="${k}"]` });
        for (const t of ['add', 'make', 'layers']) await measure('panel', `tab ${t}`, { src: s => window.__perfClick(s), arg: `.tabs [data-tab=${t}]` });
      }
      await full();
    }

    // ---- the flats: a concept from the sketch pack ----
    if (!only || only === 'flats') {
      const api = async (path, body) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return r.json(); };
      const lib = await import(new URL('../../src/lab-flat-templates.js', import.meta.url)), tpl = lib.FLAT_TEMPLATES.find(t => /hoodie/i.test(t.label)) || lib.FLAT_TEMPLATES[0];
      const made = await api('/v1/lab/concepts/from-sketch', { template: tpl.id, name: 'Perf hoodie', colour: { hex: '#1f2a44', name: 'Navy' } }); const cid = made.concept?.id;
      if (cid) {
        await p.goto(`${base}/lab/studio?concept=${cid}&view=front${q}`, { waitUntil: 'load' }); await p.waitForTimeout(9000);
        const f = p.frames().find(x => /\/lab\/flats/.test(x.url()));
        if (f) {
          await f.evaluate(DRIVER); const fe = await f.frameElement(), fb = await fe.boundingBox();
          const sv = await f.evaluate(() => { const r = document.querySelector('#canvas svg').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, r.width, r.height]; });
          const fdrive = (sel, pts, o = {}) => ({ src: ([sel, pts, o]) => window.__perfDrive(document.querySelector(sel), pts, o), arg: [sel, pts, o] });
          await throttle();
          await p.evaluate(() => setTool('brush')); await p.waitForTimeout(300);
          await measure('flats', 'Pencil brush', fdrive('.mkw', line(sv[0] - 100, sv[1] - 50, sv[0] + 100, sv[1] + 60)), f);
          await p.evaluate(() => setTool('eraser')); await p.waitForTimeout(300);
          await measure('flats', 'eraser on the sketch lines', fdrive('.mkw', line(sv[0] - sv[2] * .3, sv[1] + sv[3] * .3, sv[0] + sv[2] * .3, sv[1] + sv[3] * .35)), f);
          await p.evaluate(() => setTool('hand')); await p.waitForTimeout(300);
          await measure('flats', 'pinch zoom', { src: ([C]) => window.__perfDrive(document.querySelector('#canvas'), Array.from({ length: 40 }, (_, i) => [C[0] - 40 - i * 3, C[1] - 40 - i * 2]), { type: 'touch', multi: Array.from({ length: 40 }, (_, i) => [C[0] + 40 + i * 3, C[1] + 40 + i * 2]) }), arg: [sv] }, f);
          await measure('flats', 'pan when zoomed', fdrive('#canvas', line(sv[0], sv[1], sv[0] - 120, sv[1] - 60), { type: 'touch' }), f);
          await full(); await p.evaluate(() => setTool('select'));
          await throttle();
          await measure('flats', 'view front→back', { src: s => window.__perfClick(s), arg: '#viewSeg [data-v=back]' }); await p.waitForTimeout(2500);
          await measure('flats', 'view back→board', { src: s => window.__perfClick(s), arg: '#viewSeg [data-v=board]' }); await p.waitForTimeout(2500);
          await full();
          void fb;
        } else results.push({ group: 'flats', name: 'the flats did not open', skipped: true });
      } else results.push({ group: 'flats', name: 'no concept could be made: ' + JSON.stringify(made).slice(0, 120), skipped: true });
    }
  } finally { await b.close(); }

  // ---- held to the budgets ----
  const over = [];
  for (const r of results) {
    if (r.skipped) continue; const bud = BUDGETS[r.group]?.[r.name] || BUDGETS[r.group]?.['*'] || {};
    r.over = Object.entries(bud).filter(([k, v]) => r[k] != null && r[k] > v).map(([k, v]) => `${k} ${r[k]} > ${v}`); if (r.over.length) over.push(r);
  }
  const pad = (s, n) => String(s ?? '').padEnd(n);
  log(`Studio latency at ${rate}× CPU slowdown${gl ? ', the picture on the graphics chip' : ''} (ms; main = main thread per frame, frame = frame to frame)`);
  log(pad('', 36) + pad('main', 8) + pad('frame', 8) + pad('release', 9) + pad('once', 8) + 'budget');
  for (const r of results) log(pad(`${r.group}: ${r.name}`, 36) + (r.skipped ? 'skipped' : pad(r.main, 8) + pad(r.frame, 8) + pad(r.release, 9) + pad(r.once, 8) + (r.over.length ? 'OVER ' + r.over.join(', ') : 'ok')));
  if (errors.length) log('page errors: ' + errors.slice(0, 5).join(' | '));
  return { results, over, errors };
}

// ---- run from the command line ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = k => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : ''; };
  const base = arg('base') || process.env.PERF_BASE || 'http://127.0.0.1:3000', token = arg('token') || process.env.PERF_TOKEN || '';
  if (!token) { console.error('studio-perf: a staff token is needed (--token or PERF_TOKEN)'); process.exit(2); }
  const r = await runPerf({ base, token, rate: Number(arg('rate')) || 4, only: arg('only'), gl: arg('gl') === '1' });
  if (process.env.PERF_JSON) writeFileSync(process.env.PERF_JSON, JSON.stringify(r, null, 1));
  if (r.over.length || r.errors.length) { console.error(`studio-perf: ${r.over.length} over budget${r.errors.length ? `, ${r.errors.length} page errors` : ''}`); process.exit(1); }
}

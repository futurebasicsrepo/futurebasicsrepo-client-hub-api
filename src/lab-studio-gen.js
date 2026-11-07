// Studio, the graphic generator (served as /lab/studio-gen.js, loaded after the Studio's script, whose state it shares). Graphics studio only.
//   Make     a brief, a season, a style, the inks and the engines: Claude, OpenAI and Google draw at once (src/lab-graphic-gen.js), and every answer
//            comes back traced into one vector layer per ink. One engine down does not stop the others.
//   Inks     each ink of the graphic as a swatch with its Pantone: recolour it, hide it, merge it into another, drop it; one ink fewer; a season's
//            palette; shuffle the colours round
//   Lines    trace again finer or bolder, thicken every line, a key line in the darkest ink, edit the points
//   Print    put it on the garment (or keep it), the separations, the vector as SVG, or as a PDF with a film page for every ink
(function () {
  if (typeof GMODE === 'undefined' || (!GMODE && !CID) || (typeof TAG !== 'undefined' && TAG)) return;
  const PIC = !GMODE; // on a concept's picture: the garment is the base layer, so the art is everything but it, and it goes onto the flats
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  let META = null, RES = [], RUN = null, WIDTH = 0;
  const ASK = { brief: '', words: '', season: '', style: '', inks: 3, count: 1, engines: null };
  try { Object.assign(ASK, JSON.parse(localStorage.getItem('fb.gen') || '{}')); } catch {}
  const keep = () => { try { localStorage.setItem('fb.gen', JSON.stringify({ season: ASK.season, style: ASK.style, inks: ASK.inks, count: ASK.count, engines: ASK.engines })); } catch {} };
  const css = document.createElement('style');
  css.textContent = `
  .gx textarea.t{min-height:56px;resize:vertical}
  .gchips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.gchips::-webkit-scrollbar{display:none}
  .gchips button,.geng button{flex:none;border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 11px;font:600 12.5px/1.2 inherit;cursor:pointer;white-space:nowrap;min-height:32px;display:inline-flex;align-items:center;gap:6px}
  .gchips button[aria-pressed=true],.geng button[aria-pressed=true]{background:var(--ink);color:#fff;border-color:var(--ink)}
  .gchips button i{display:inline-flex;gap:1px}.gchips button i b{width:7px;height:12px;border-radius:2px;display:block}
  .geng{display:flex;gap:6px;flex-wrap:wrap}.geng button:disabled{opacity:.45;cursor:not-allowed}
  .gdot{width:7px;height:7px;border-radius:50%;background:#b9bcc2}.gdot.on{background:#2f9e5b}.gdot.bad{background:#c4372c}
  .grow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.glab{font:500 10px 'IBM Plex Mono',monospace;letter-spacing:.1em;text-transform:uppercase;color:var(--dim);min-width:46px}
  .gstep{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;overflow:hidden}.gstep button{border:0;background:none;width:34px;height:32px;font-size:16px;cursor:pointer}.gstep b{min-width:18px;text-align:center;font-variant-numeric:tabular-nums}
  .ggrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .gcard{position:relative;border:1px solid var(--line);border-radius:10px;padding:0;background:repeating-conic-gradient(#f1f1f3 0 25%,#fff 0 50%) 0 0/16px 16px;cursor:pointer;aspect-ratio:1/1;overflow:hidden}
  .gcard img{width:100%;height:100%;object-fit:contain;display:block}.gcard:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
  .gcard[aria-current=true]{box-shadow:0 0 0 2px var(--ink)}
  .gbadge{position:absolute;left:6px;top:6px;background:rgba(20,20,22,.82);color:#fff;font:600 10px/1 'IBM Plex Mono',monospace;padding:4px 6px;border-radius:999px}
  .gdots{position:absolute;right:6px;bottom:6px;display:flex;gap:2px}.gdots i{width:10px;height:10px;border-radius:50%;border:1px solid rgba(255,255,255,.9)}
  .gwait{aspect-ratio:1/1;border-radius:10px;border:1px dashed var(--line);display:grid;place-items:center;color:var(--dim);font-size:12px;text-align:center;padding:6px}
  .gwait.bad{color:#b3261e;border-color:rgba(179,38,30,.4)}
  .gstat{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--dim)}.gstat span{display:inline-flex;align-items:center;gap:5px}
  .gink{display:grid;grid-template-columns:34px minmax(0,1fr) auto auto auto;align-items:center;gap:6px}
  .gsw{width:34px;height:34px;border-radius:8px;border:1px solid var(--line);position:relative;overflow:hidden;cursor:pointer}.gsw input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer;border:0;padding:0}
  .gname{font-size:12.5px;line-height:1.25;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gname small{display:block;color:var(--dim);font-size:11px}
  .gink select{max-width:84px;font-size:12px;min-height:32px}.gico{border:1px solid var(--line);background:#fff;border-radius:8px;width:32px;height:32px;cursor:pointer;display:grid;place-items:center}.gico[aria-pressed=false]{opacity:.45}
  .gpals{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.gpals button{flex:none;display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;padding:0;height:26px;cursor:pointer;background:#fff}.gpals button i{width:12px;height:100%;display:block}
  .gout{display:grid;grid-template-columns:1fr 1fr;gap:6px}.gout .btn{justify-content:center}.gout .wide{grid-column:1/-1}
  .gx input[type=range]{flex:1;min-width:110px}
  .gtee{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.gtee button,.gteec{border:1px solid var(--line);border-radius:10px;padding:0;background:#fff;cursor:pointer;overflow:hidden;display:grid;font-size:11px;position:relative}
  .gtee button img{width:100%;aspect-ratio:1/1;display:block}.gtee button span,.gteec span{padding:3px 0;text-align:center}.gtee button[aria-pressed=true]{box-shadow:0 0 0 2px var(--ink)}
  .gteec{place-items:center;background:conic-gradient(#e43,#fd3,#4c6,#3ae,#a4e,#e43);min-height:60px}.gteec span{background:#fff;border-radius:999px;padding:2px 8px}.gteec input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}
  .gteenote{font-size:12px;color:var(--dim);line-height:1.4}`;
  document.head.appendChild(css);

  const meta = async () => { if (!META) { META = await api('/v1/lab/library/studio/generate'); if (!Array.isArray(ASK.engines) || !ASK.engines.length) ASK.engines = META.engines.filter(e => e.ready).map(e => e.id); } return META; };
  const ready = () => (META?.engines || []).filter(e => e.ready && ASK.engines.includes(e.id));
  const svgUrl = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  const hex6 = (() => { const c = document.createElement('canvas').getContext('2d'); return v => { c.fillStyle = '#000'; c.fillStyle = String(v || '#000'); return /^#[0-9a-f]{6}$/i.test(c.fillStyle) ? c.fillStyle.toLowerCase() : '#000000'; }; })();
  const rgb = h => [1, 3, 5].map(i => parseInt(hex6(h).slice(i, i + 2), 16)), lum = h => { const [r, g, b] = rgb(h); return .2126 * r + .7152 * g + .0722 * b; };
  const dist = (a, b) => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
  const pms = h => (window.FBPantone ? window.FBPantone.code(h) || '' : '');
  const touched = l => { l._pc = null; l._pk = null; l.pv = (l.pv || 0) + 1; };
  const genLayers = () => LAYERS.filter(l => l.gen && window.VEC && VEC.isPath(l));

  // ---- a traced SVG (one <g data-pantone><path fill d/></g> per ink) as path layers, its art fitted into `box` (doc units) ----
  function bboxOf(list) { // doc-space bounds of path layers
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of list) for (const p of VEC.pathsOf(l)) for (const [a, b] of VEC.flat(p, 2)) { const [x, y] = VEC.toDoc(l, a, b); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return Number.isFinite(x0) ? { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } : null;
  }
  function layersOf(svg, r, box) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml'); if (doc.querySelector('parsererror')) return [];
    const els = [...doc.querySelectorAll('path')], parsed = els.map(el => ({ el, paths: VEC.parseD(el.getAttribute('d')) })).filter(p => p.paths);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of parsed) for (const s of p.paths) for (const [x, y] of VEC.flat(s, 2)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!Number.isFinite(x0)) return [];
    const cw = x1 - x0 || 1, ch = y1 - y0 || 1, t = box || (PIC ? { x: W * .34, y: H * .26, w: W * .32, h: W * .32 } : { x: W * .12, y: H * .12, w: W * .76, h: H * .76 }), k = Math.min(t.w / cw, t.h / ch), ox = t.x + (t.w - cw * k) / 2, oy = t.y + (t.h - ch * k) / 2;
    const out = [];
    parsed.forEach(({ el }, i) => {
      const l = VEC.fromSvg(el, null, svgAttr); if (!l) return;
      const src = hex6(el.getAttribute('fill')), code = el.parentNode?.getAttribute?.('data-pantone') || pms(src);
      l.x = ox - x0 * k; l.y = oy - y0 * k; l.scale = k; l.rot = 0; l.flip = false; l.opacity = 1; l.blend = 'source-over'; l.visible = true; l.locked = false;
      l.fillColor = src; l.name = code || src; l.gen = { art: r.art || null, engine: r.engine || '', title: r.title || '', src, inks: parsed.length, share: r.colours?.[i]?.share ?? 0 };
      VEC.normalize(l); touched(l); out.push(l);
    });
    return out;
  }

  // ---- Make ----
  const chip = (kind, s) => `<button type="button" data-g${kind}="${s.id}" aria-pressed="${ASK[kind] === s.id}">${kind === 'season' ? `<i>${s.palette.slice(0, 4).map(h => `<b style="background:${h}"></b>`).join('')}</i>` : ''}${esc(s.label)}</button>`;
  const cardHtml = (r, i) => `<button type="button" class="gcard" data-gi="${i}" title="${esc(r.title)} · tap to use"><img alt="${esc(r.title)}" src="${svgUrl(r.svg)}"><span class="gbadge">${esc(META.engines.find(e => e.id === r.engine)?.label || r.engine)}</span><span class="gdots">${r.colours.slice(0, 8).map(c => `<i style="background:${c.hex}"></i>`).join('')}</span></button>`;
  function paint() {
    const p = $('#pMake'); if (!p) return;
    if (!META) { p.innerHTML = '<span class="note">Loading…</span>'; meta().then(paint).catch(x => { p.innerHTML = `<p class="note">${esc(x.message)}</p>`; }); return; }
    const n = ready().length * ASK.count, none = !META.engines.some(e => e.ready);
    p.innerHTML = `<div class="sec gx"><h4>Make</h4>
      <textarea class="t" id="gBrief" maxlength="600" placeholder="What is it? Pumpkin patch crew, cracked arch type">${esc(ASK.brief)}</textarea>
      <input class="t" id="gWords" maxlength="60" placeholder="Words on it (optional)" value="${esc(ASK.words)}">
      <div class="gchips" role="group" aria-label="Season">${META.seasons.map(s => chip('season', s)).join('')}</div>
      <div class="gchips" role="group" aria-label="Style">${META.styles.map(s => chip('style', s)).join('')}</div>
      <div class="grow"><span class="glab">Inks</span><span class="gstep"><button type="button" data-ginks="-1" aria-label="One ink fewer">−</button><b>${ASK.inks}</b><button type="button" data-ginks="1" aria-label="One ink more">+</button></span>
        <span class="glab" style="min-width:0">Each</span><div class="seg">${[1, 2, 3].map(k => `<button type="button" data-gcount="${k}" aria-pressed="${ASK.count === k}">${k}</button>`).join('')}</div></div>
      <div class="geng" role="group" aria-label="Engines">${META.engines.map(e => `<button type="button" data-geng="${e.id}" aria-pressed="${e.ready && ASK.engines.includes(e.id)}" ${e.ready ? '' : 'disabled'} title="${esc(e.does)}${e.ready ? '' : ': not connected'}"><i class="gdot ${e.ready ? 'on' : ''}"></i>${esc(e.label)}</button>`).join('')}</div>
      <button class="btn go" type="button" id="gGo" ${n && !RUN ? '' : 'disabled'}>${RUN ? 'Generating…' : none ? 'No engine connected' : `Generate ${n}`}</button>
      <div class="gstat" id="gStat" role="status">${statHtml()}</div>
      <div class="gchips" role="group" aria-label="Type lockups"><span class="glab" style="align-self:center">Lockups</span>${[['badge', 'Badge'], ['varsity', 'Varsity'], ['stacked', 'Stacked'], ['script', 'Script + block']].map(([k, t]) => `<button type="button" data-glock="${k}" title="Set the words as a ${esc(t.toLowerCase())}">${esc(t)}</button>`).join('')}</div>
      <div class="ggrid" id="gRes">${RUN ? Array.from({ length: RUN.n }, () => '<div class="gwait">Drawing…</div>').join('') : ''}${RES.map(cardHtml).join('')}</div></div>
      <div class="sec" id="gInks"></div><div class="sec" id="gLines"></div><div class="sec" id="gOut"></div>`;
    paintInks();
  }
  let STAT = null;
  const statHtml = () => STAT ? STAT.map(s => `<span title="${esc(s.error || '')}"><i class="gdot ${s.ok ? 'on' : s.wanted ? 'bad' : ''}"></i>${esc(s.label)}${s.ok ? ` ${s.made}` : s.wanted ? ` · ${esc(s.error || 'no answer')}` : ' · off'}</span>`).join('') + (D.ai?.left != null ? `<span>${D.ai.left} left today</span>` : '') : '';
  async function go() {
    ASK.brief = $('#gBrief').value.trim(); ASK.words = $('#gWords').value.trim();
    if (ASK.brief.length < 3 && !ASK.season && !ASK.style) { toast('Say what it is, or pick a season or a style.'); $('#gBrief').focus(); return; }
    RUN = { n: ready().length * ASK.count }; paint();
    try {
      const r = await api('/v1/lab/library/studio/generate', { body: { brief: ASK.brief, words: ASK.words, season: ASK.season, style: ASK.style, inks: ASK.inks, count: ASK.count, engines: ASK.engines } });
      RES = [...r.results, ...RES].slice(0, 24); STAT = r.engines; if (D.ai) D.ai.left = r.left;
      const bad = r.engines.filter(e => e.wanted && !e.ok); if (bad.length) toast(`${bad.map(e => e.label).join(' and ')} did not answer; the others did.`);
    } catch (x) { STAT = null; toast(x.message); }
    finally { RUN = null; paint(); }
  }
  async function use(i) {
    const r = RES[i]; if (!r) return; await loadPantone();
    const old = genLayers(), box = old.length ? bboxOf(old) : null, ls = layersOf(r.svg, r, box);
    if (!ls.length) { toast('Nothing in that one could be brought in.'); return; }
    LAYERS = LAYERS.filter(l => !l.gen); LAYERS.push(...ls); SEL = ls[0].id;
    if (/^New graphic$/.test(D.concept.name)) { D.concept.name = r.title; $('#cName').textContent = r.title; }
    WIDTH = 0; commit(); paintPanels(); draw(); paint();
    $$('#gRes .gcard').forEach(b => b.setAttribute('aria-current', String(b.dataset.gi === String(i))));
    toast(`${ls.length} ink${ls.length === 1 ? '' : 's'} on the canvas, each its own layer. Undo takes it back.`);
  }

  // ---- Inks ----
  function inks() { const by = new Map(); for (const l of genLayers()) { const h = hex6(l.fillColor); if (!by.has(h)) by.set(h, { hex: h, layers: [], share: 0 }); const g = by.get(h); g.layers.push(l); g.share += l.gen.share || 0; } return [...by.values()].sort((a, b) => b.share - a.share); }
  const eye = on => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/>${on ? '<circle cx="12" cy="12" r="3" fill="currentColor"/>' : '<path d="M4 20L20 4" stroke="currentColor" stroke-width="1.8"/>'}</svg>`;
  function paintInks() {
    const box = $('#gInks'), lines = $('#gLines'); if (!box) return; const list = inks();
    if (!list.length) { box.innerHTML = ''; lines.innerHTML = ''; paintOut(); return; }
    box.innerHTML = `<h4>Inks · ${list.length}</h4>${list.map(k => { const on = k.layers.some(l => l.visible), code = pms(k.hex);
      return `<div class="gink"><label class="gsw" style="background:${k.hex}" title="Change this ink"><input type="color" value="${k.hex}" data-gcol="${k.hex}" aria-label="Colour of ${esc(code || k.hex)}"></label>
        <span class="gname">${esc((code || k.hex).replace(/^PANTONE\s+/i, ''))}<small>${k.hex}${k.share ? ` · ${Math.round(k.share * 100)}%` : ''}</small></span>
        <button type="button" class="gico" data-gvis="${k.hex}" aria-pressed="${on}" aria-label="${on ? 'Hide' : 'Show'} this ink">${eye(on)}</button>
        ${list.length > 1 ? `<select class="t" data-gmerge="${k.hex}" aria-label="Merge into another ink"><option value="">Merge</option>${list.filter(o => o.hex !== k.hex).map(o => `<option value="${o.hex}">→ ${esc(pms(o.hex) || o.hex)}</option>`).join('')}</select>` : '<span></span>'}
        <button type="button" class="gico" data-gdrop="${k.hex}" aria-label="Drop this ink">×</button></div>`; }).join('')}
      <div class="grow"><button class="btn sm q" type="button" data-gfewer ${list.length > 1 ? '' : 'disabled'}>One ink fewer</button><button class="btn sm q" type="button" data-gshuffle ${list.length > 1 ? '' : 'disabled'}>Shuffle</button></div>
      <div class="gchips" role="group" aria-label="Colour harmony">${HARMONY.map(([id, t]) => `<button type="button" data-gharm="${id}" title="Recolour the inks as ${esc(t.toLowerCase())} colours">${esc(t)}</button>`).join('')}</div>
      <div class="gpals" role="group" aria-label="Season palettes">${META.seasons.map(s => `<button type="button" data-gpal="${s.id}" title="${esc(s.label)}">${s.palette.map(h => `<i style="background:${h}"></i>`).join('')}</button>`).join('')}</div>`;
    const ls = genLayers(), w = ls[0]?.gen.weight || 0, key = Boolean(ls[0]?.gen.key);
    lines.innerHTML = `<h4>Lines</h4>
      <div class="grow"><span class="glab">Detail</span><div class="seg">${[['fine', 'Fine', .55], ['clean', 'Clean', 1.1], ['bold', 'Bold', 2.4]].map(([id, t, v]) => `<button type="button" data-gtrace="${v}" aria-pressed="${(ls[0]?.gen.tol || 1.1) === v}">${t}</button>`).join('')}</div></div>
      <label class="grow"><span class="glab">Weight</span><input type="range" min="0" max="24" step="1" value="${w}" id="gWeight" aria-label="Thicken every line"></label>
      <div class="grow"><button class="btn sm ${key ? '' : 'q'}" type="button" data-gkey aria-pressed="${key}">Key line</button><button class="btn sm q" type="button" data-gpoints>Edit points</button><button class="btn sm q" type="button" data-gmisreg title="Nudge each ink a little off, like a press out of register: the vintage look">Off register</button><button class="btn sm q" type="button" data-gemb title="Make every line at least 1.2 mm at the print width, so an embroidery machine can stitch it">Thicken for embroidery</button></div>`;
    paintOut();
  }
  function recolour(from, to, { live = false } = {}) { for (const l of genLayers()) if (hex6(l.fillColor) === from) { l.fillColor = to; if (l.stroke && !l.gen.key) l.strokeColor = to; touched(l); } keyLine(); draw(); if (!live) { commit(); paintPanels(); paintInks(); } }
  function weight(v) { for (const l of genLayers()) { l.gen.weight = v; if (v > 0 || l.gen.key) { l.stroke = true; l.strokeW = Math.max(v, l.gen.key ? 6 : 0) / (l.scale || 1); if (!l.gen.key) l.strokeColor = l.fillColor; } else l.stroke = false; touched(l); } keyLine(); draw(); }
  function keyLine() { const ls = genLayers(); if (!ls.length || !ls[0].gen.key) return; const dark = inks().map(k => k.hex).sort((a, b) => lum(a) - lum(b))[0]; for (const l of ls) { l.stroke = true; l.strokeColor = dark; l.strokeW = Math.max(l.gen.weight || 0, 6) / (l.scale || 1); touched(l); } }
  function palette(id) {
    const s = META.seasons.find(x => x.id === id); if (!s) return; const list = inks().sort((a, b) => lum(a.hex) - lum(b.hex)), pal = [...s.palette].sort((a, b) => lum(a) - lum(b));
    const to = list.map((k, i) => pal[list.length === 1 ? 0 : Math.round(i * (pal.length - 1) / (list.length - 1))]);
    const ls = genLayers(), was = new Map(ls.map(l => [l, hex6(l.fillColor)]));
    list.forEach((k, i) => { for (const l of ls) if (was.get(l) === k.hex) { l.fillColor = to[i]; if (l.stroke && !l.gen.key) l.strokeColor = to[i]; touched(l); } });
    keyLine(); commit(); paintPanels(); draw(); paintInks();
  }
  // colour harmonies, from the strongest coloured ink: each ink keeps its own lightness and strength and takes a hue the rule sets; near-greys
  // (black, white, grey) stay as they are, as a designer keeps the key line and the shirt-white
  const HARMONY = [['comp', 'Complement'], ['analog', 'Analogous'], ['triad', 'Triad'], ['split', 'Split'], ['mono', 'One hue']];
  const hsl = h => { let [r, g, b] = rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; if (mx === mn) return [0, 0, l]; const d = mx - mn, s2 = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [hh * 60, s2, l]; };
  const fromHsl = (h, s2, l) => { h = ((h % 360) + 360) % 360 / 360; const q = l < .5 ? l * (1 + s2) : l + s2 - l * s2, p2 = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p2 + (q - p2) * 6 * t : t < .5 ? q : t < 2 / 3 ? p2 + (q - p2) * (2 / 3 - t) * 6 : p2; }; return '#' + [f(h + 1 / 3), f(h), f(h - 1 / 3)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); };
  function harmony(id) {
    const list = inks(), coloured = list.filter(k => hsl(k.hex)[1] > .15 && hsl(k.hex)[2] > .08 && hsl(k.hex)[2] < .92); if (!coloured.length) { toast('Every ink is black, white or grey: there is no colour to build from.'); return; }
    const base = coloured.slice().sort((a, b) => hsl(b.hex)[1] * b.share - hsl(a.hex)[1] * a.share)[0], h0 = hsl(base.hex)[0];
    const offs = { comp: [0, 180], analog: [0, 30, -30, 60], triad: [0, 120, 240], split: [0, 150, 210], mono: [0] }[id];
    const ls = genLayers(), was = new Map(ls.map(l => [l, hex6(l.fillColor)]));
    coloured.forEach((k, i) => { const [, s2, l] = hsl(k.hex), to = id === 'mono' ? fromHsl(h0, s2, l) : fromHsl(h0 + offs[i % offs.length], s2, l); for (const q of ls) if (was.get(q) === k.hex) { q.fillColor = to; if (q.stroke && !q.gen.key) q.strokeColor = to; touched(q); } });
    keyLine(); commit(); paintPanels(); draw(); paintInks();
  }
  function shuffle() {
    const list = inks(), cols = list.map(k => k.hex); let p = cols.slice(); for (let t = 0; t < 8 && p.every((c, i) => c === cols[i]); t++) p = cols.slice().sort(() => Math.random() - .5);
    const ls = genLayers(), was = new Map(ls.map(l => [l, hex6(l.fillColor)]));
    cols.forEach((c, i) => { for (const l of ls) if (was.get(l) === c) { l.fillColor = p[i]; if (l.stroke && !l.gen.key) l.strokeColor = p[i]; touched(l); } });
    keyLine(); commit(); paintPanels(); draw(); paintInks();
  }
  function fewer() { const list = inks(); if (list.length < 2) return; let best = null; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const d = dist(list[i].hex, list[j].hex); if (!best || d < best.d) best = { d, a: list[i], b: list[j] }; } const [small, big] = best.a.share < best.b.share ? [best.a, best.b] : [best.b, best.a]; recolour(small.hex, big.hex); toast(`${pms(small.hex) || small.hex} is printed as ${pms(big.hex) || big.hex} now.`); }
  async function retrace(tol) {
    const ls = genLayers(), art = ls.find(l => l.gen.art)?.gen.art; if (!art) { toast('Only a generated graphic can be traced again.'); return; }
    const box = bboxOf(ls), map = new Map(ls.map(l => [l.gen.src, { fill: l.fillColor, visible: l.visible }])), g0 = ls[0].gen;
    busy('Tracing it again…');
    try {
      const r = await api('/v1/lab/studio/vector', { body: { art, tolerance: tol, max: g0.inks || map.size, maxSide: 1024, name: g0.title } });
      const nl = layersOf(r.svg, { art, engine: g0.engine, title: g0.title, colours: r.colours }, box).filter(l => { let near = null, d = Infinity; for (const s of map.keys()) { const e = dist(s, l.gen.src); if (e < d) { d = e; near = s; } } const m = map.get(near); if (!m) return false; l.fillColor = m.fill; l.visible = m.visible; l.gen.src = near; l.gen.tol = tol; l.gen.inks = g0.inks; l.gen.weight = g0.weight || 0; l.gen.key = g0.key; return true; });
      if (!nl.length) throw new Error('The trace came back empty.');
      LAYERS = LAYERS.filter(l => !l.gen); LAYERS.push(...nl); SEL = nl[0].id; weight(g0.weight || 0); commit(); paintPanels(); draw(); paintInks();
      toast(`Traced again: ${r.paths} shape${r.paths === 1 ? '' : 's'}.`);
    } catch (x) { toast(x.message); } finally { busy(); }
  }

  // ---- thick enough to stitch: the thinnest line measured at the print width (src/lab-filters.js thinnest), every ink thickened just enough
  // that nothing is under 1.2 mm (finer than that, a satin stitch will not hold) ----
  async function thickenForEmb() {
    const ls = genLayers(); if (!ls.length) { toast('Make or open a graphic first: this thickens its inks.'); return; }
    const F = await import('/lab/lab-filters.js'), a = whole(); if (!a) return; const img = new Image(); await new Promise(r => { img.onload = r; img.src = a.image; });
    const k = Math.min(1, 700 / Math.max(a.w, a.h)), w = Math.max(1, Math.round(a.w * k)), h = Math.max(1, Math.round(a.h * k)), c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 128 ? 1 : 0;
    const t = F.thinnest(m, w, h) / k, wIn = Number($('#gWidth')?.value) || widthIn(), ppi = a.w / wIn, mm = v => Math.round(v / ppi * 25.4 * 10) / 10, need = 1.2 / 25.4 * ppi;
    if (t >= need) { toast(`Already thick enough to stitch: the thinnest line is about ${mm(t)} mm at ${wIn} in wide.`); return; }
    const add = Math.ceil(need - t + 1), was = ls[0].gen.weight || 0; weight(was + add); commit(); paintPanels(); paintInks();
    toast(`The thinnest line was about ${mm(t)} mm at ${wIn} in wide; every line is at least 1.2 mm now, so it holds stitches. Small gaps may have closed up: check the details, or Undo.`);
  }
  // ---- Print: on the garment, separations, SVG, PDF ----
  function artCanvas(skip = () => false) { // the art at full size: on a picture, every visible layer but the garment (and any skipped)
    if (!PIC && !LAYERS.some(skip)) { compose(); return docC; }
    const c = canvas(W, H), x = c.getContext('2d'); for (const l of LAYERS) if (l.visible && !(PIC && l.kind === 'base') && !skip(l)) drawLayer(x, l); return c; }
  function whole() { // everything visible, trimmed to the art
    const docC = artCanvas(); const x = docC.getContext('2d', { willReadFrequently: true }), d = x.getImageData(0, 0, docC.width, docC.height).data; let x0 = docC.width, y0 = docC.height, x1 = -1, y1 = -1;
    for (let y = 0; y < docC.height; y += 2) for (let i = 0; i < docC.width; i += 2) if (d[(y * docC.width + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(docC.width - 1, x1 + 2); y1 = Math.min(docC.height - 1, y1 + 2);
    const c = canvas(x1 - x0 + 1, y1 - y0 + 1); c.getContext('2d').drawImage(docC, x0, y0, c.width, c.height, 0, 0, c.width, c.height); return { image: c.toDataURL('image/png'), w: c.width, h: c.height };
  }
  const widthIn = () => { if (WIDTH > 0) return WIDTH; const ls = genLayers(), b = ls.length ? bboxOf(ls) : null, w = b ? b.w : (whole()?.w || W); return Math.round(w / (PPI || W / 14) * 4) / 4 || 10; };
  function paintOut() {
    const o = $('#gOut'); if (!o) return; const put = PIC ? 'Put it on the garment' : $('#apply')?.textContent || 'Keep in the library';
    setTimeout(paintTees, 0);
    o.innerHTML = `<h4>Print</h4><label class="grow"><span class="glab">Width</span><input class="t" type="number" min="1" max="30" step=".25" id="gWidth" value="${widthIn()}" style="width:80px"> <span class="note">in</span></label>
      <h4 style="margin-top:6px">On garments</h4><div class="gtee" id="gTee"><span class="note">Drawing…</span></div><div class="gteenote" id="gTeeNote"></div>
      <div class="gout"><button class="btn go wide" type="button" data-gput>${esc(put)}</button><button class="btn sm" type="button" data-gsep>Separations</button><button class="btn sm" type="button" data-gsim title="Full-colour art in a few spot inks, as index dots, with a white underbase on a dark shirt">Simulated process</button><button class="btn sm" type="button" data-gsvg>Vector SVG</button><button class="btn sm wide" type="button" data-gpdf>Vector PDF + films</button></div>
      <h4 style="margin-top:6px">Stickers and patches</h4><label class="grow"><span class="glab">Border</span><input type="range" min=".05" max=".6" step=".05" value="${BORDER}" id="gBorder" aria-label="Border width"><span class="note" id="gBorderV">${BORDER} in</span></label>
      <div class="gout"><button class="btn sm" type="button" data-gsticker>Sticker border</button><button class="btn sm" type="button" data-gcut>Cut line</button></div>`;
  }
  // ---- a sticker's white border and a die cut line: everything visible grown by the border width and traced (src/lab-trace.js) ----
  let BORDER = .15;
  async function contour(kind) {
    const T = await import('/lab/lab-trace.js'); compose(); const k = Math.min(1, 640 / Math.max(W, H)), w = Math.round(W * k), h = Math.round(H * k), c = canvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(artCanvas(l => Boolean(l.contour)), 0, 0, w, h);
    const a = x.getImageData(0, 0, w, h).data, N = w * h; let m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = a[i * 4 + 3] > 24 ? 1 : 0;
    if (!m.some(v => v)) { toast('There is nothing on the canvas yet.'); return; }
    const r = Math.max(1, Math.round(BORDER * (PPI || W / 14) * k)); // grown by the border, a round step at a time (a disc, near enough)
    for (let pass = 0; pass < r; pass++) { const o = new Uint8Array(m), diag = pass % 2 === 1; for (let i = 0; i < N; i++) if (m[i]) { const px = i % w; if (px > 0) o[i - 1] = 1; if (px < w - 1) o[i + 1] = 1; if (i >= w) o[i - w] = 1; if (i < N - w) o[i + w] = 1; if (diag) { if (px > 0 && i >= w) o[i - w - 1] = 1; if (px < w - 1 && i >= w) o[i - w + 1] = 1; if (px > 0 && i < N - w) o[i + w - 1] = 1; if (px < w - 1 && i < N - w) o[i + w + 1] = 1; } } m = o; }
    // holes inside are filled: a sticker is one piece
    const out = new Uint8Array(N), st = []; for (let px = 0; px < w; px++) st.push(px, N - w + px); for (let py = 0; py < h; py++) st.push(py * w, py * w + w - 1);
    while (st.length) { const i = st.pop(); if (out[i] || m[i]) continue; out[i] = 1; const px = i % w; if (px > 0) st.push(i - 1); if (px < w - 1) st.push(i + 1); if (i >= w) st.push(i - w); if (i < N - w) st.push(i + w); }
    const rgba = new Uint8ClampedArray(N * 4); for (let i = 0; i < N; i++) if (!out[i]) { rgba[i * 4 + 3] = 255; }
    const ink = T.outlines(rgba, w, h, { level: 4 })[0]; if (!ink) return; const paths = VEC.parseD(ink.d); if (!paths) return;
    const np = paths.map(p => ({ closed: p.closed, nodes: p.nodes.map(n => n.map(v => v / k)) }));
    LAYERS = LAYERS.filter(l => l.contour !== kind);
    const l = fresh('shape', { name: kind === 'cut' ? 'Cut line' : 'Sticker border', shape: 'path', paths: np, fill: kind !== 'cut', fillColor: '#ffffff', stroke: kind === 'cut', strokeColor: '#ff00ff', strokeW: 2, radius: 0, w: 1, h: 1, x: 0, y: 0, scale: 1, rot: 0, flip: false });
    l.tint = { ...l.tint, amount: 0 }; l.contour = kind; VEC.normalize(l);
    if (kind === 'cut') LAYERS.push(l); else LAYERS.splice(Math.max(1, LAYERS.findIndex(q => q.kind !== 'base')), 0, l);
    SEL = l.id; commit(); paintPanels(); draw();
    toast(kind === 'cut' ? `Cut line ${BORDER} in out from the art, in magenta (the cutter's colour). It is its own layer: hide it for the print.` : `A ${BORDER} in white border behind the art: one piece to print and cut.`);
  }
  // ---- type lockups: the brief's words set as a badge, a varsity arch, a stacked block or script over block, as editable type and shapes ----
  const tx = o => fresh('text', { name: 'Type', font: 'grotesk', size: 80, bold: false, italic: false, track: 2, lead: 1, align: 'center', arc: 0, color: '#141416', outline: 0, outlineColor: '#ffffff', case: '', stretch: 100, outline2: 0, outline2Color: '#141416', shadowKind: 'none', shadow: 0, shadowAngle: 135, shadowColor: '#141416', env: 'none', envK: 0, x: W / 2, y: H / 2, ...o });
  function lockup(kind) {
    const words = (ASK.words || ASK.brief || 'Future Basics').trim().slice(0, 40), parts = words.split(/\s+/), pal = (META.seasons.find(x => x.id === ASK.season)?.palette || ['#141416', '#b5302b', '#f1e3c6']), ink = pal[0], acc = pal[1] || '#b5302b', light = pal[pal.length - 1];
    const year = String(new Date().getFullYear()), add = [];
    if (kind === 'badge') {
      add.push(fresh('shape', { name: 'Ring', shape: 'ellipse', w: 640, h: 640, radius: 0, fill: true, fillColor: light, stroke: true, strokeW: 16, strokeColor: ink, x: W / 2, y: H / 2 }),
        fresh('shape', { name: 'Inner ring', shape: 'ellipse', w: 560, h: 560, radius: 0, fill: false, fillColor: ink, stroke: true, strokeW: 4, strokeColor: ink, x: W / 2, y: H / 2 }),
        tx({ name: 'Top arc', text: words.toUpperCase(), font: 'g_oswald', bold: true, size: Math.max(30, Math.min(64, Math.round(820 / Math.max(8, words.length)))), track: 6, arc: Math.min(100, 40 + words.length * 3), color: ink, y: H / 2 - 168 }),
        tx({ name: 'Bottom arc', text: `EST. ${year}`, font: 'g_oswald', size: 40, track: 10, arc: -40, color: ink, y: H / 2 + 205 }),
        tx({ name: 'Centre', text: parts[0].slice(0, 10).toUpperCase(), font: 'g_alfa-slab-one', size: 120, color: acc, outline: 4, outlineColor: light, y: H / 2 }));
    } else if (kind === 'varsity') {
      add.push(tx({ name: 'Arch', text: words.toUpperCase(), font: 'g_graduate', size: 110, track: 4, arc: 38, color: acc, outline: 6, outlineColor: light, outline2: 6, outline2Color: ink, y: H / 2 - 120 }),
        tx({ name: 'Number', text: year.slice(-2), font: 'g_graduate', size: 300, color: acc, outline: 8, outlineColor: light, outline2: 8, outline2Color: ink, y: H / 2 + 130 }));
    } else if (kind === 'stacked') {
      add.push(tx({ name: 'Stacked', text: parts.join('\n').toUpperCase(), font: 'g_anton', size: 170, lead: .92, track: 0, color: ink, shadowKind: 'drop', shadow: 10, shadowColor: acc }));
    } else {
      add.push(tx({ name: 'Block', text: (parts.slice(1).join(' ') || parts[0]).toUpperCase(), font: 'g_bebas-neue', size: 230, track: 8, color: ink, y: H / 2 + 60 }),
        tx({ name: 'Script', text: parts[0], font: 'g_pacifico', size: 150, color: acc, outline: 8, outlineColor: light, case: 'title', y: H / 2 - 60 }));
    }
    LAYERS.push(...add); SEL = add[add.length - 1].id; commit(); tab('layers'); paintPanels(); draw();
    toast(`${{ badge: 'Badge', varsity: 'Varsity arch', stacked: 'Stacked block', script: 'Script over block' }[kind]} from "${words}": every part is its own layer to change.`);
  }
  async function putOnPiece() {
    const ls = genLayers().filter(l => l.visible); if (!ls.length) { toast('Make or open a graphic first.'); return; }
    const b = bboxOf(ls), pad = 4, c = canvas(b.w + pad * 2, b.h + pad * 2), x = c.getContext('2d'); x.translate(-b.x + pad, -b.y + pad); for (const l of ls) drawLayer(x, l);
    const name = (ls[0].gen.title || 'Graphic').slice(0, 40), keyOf = () => { const ids = (D.placements || []).map(p => p.id); return ids.includes('centre chest') ? 'centre chest' : ids[0] || undefined; };
    const n = fresh('image', { name, raster: stamp(c), src: null, dirty: true, x: b.x + b.w / 2, y: b.y + b.h / 2, scale: 1 }); n._srcRid = n.raster._rid; n.placement = keyOf();
    for (const l of ls) l.visible = false; LAYERS.push(n); SEL = n.id; commit(); tab('layers'); paintPanels(); draw();
    toast(`"${name}" is one graphic on the piece now${n.placement ? `, on the ${n.placement}` : ''}: choose where under Goes on, and saving puts it on the flats. Its inks are kept, hidden, to edit.`);
  }
  // ---- on garments: the graphic on each body colour, with what the printer does about it (an ink the colour of the shirt is knocked out;
  // a dark shirt takes a white underbase under the colours) ----
  const TEES = [['White', '#ffffff'], ['Natural', '#efe8d8'], ['Heather', '#b9b9b6'], ['Sand', '#d8c7a4'], ['Forest', '#2f4a3a'], ['Navy', '#1d2a44'], ['Red', '#a02a20'], ['Black', '#141416']];
  let TEE = null;
  function inkList() { const g = inks(); if (g.length) return g.map(k => k.hex);
    const a = whole(); if (!a) return []; const c = canvas(64, 64), x = c.getContext('2d', { willReadFrequently: true }), img = new Image(); return new Promise(res => { img.onload = () => { x.drawImage(img, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data, h = new Map(); let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n++; const k = hex6(`rgb(${d[i] & 0xe0},${d[i + 1] & 0xe0},${d[i + 2] & 0xe0})`); h.set(k, (h.get(k) || 0) + 1); }
      res([...h.entries()].filter(([, v]) => v > n * .03).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k)); }; img.src = a.image; }); }
  async function paintTees() {
    const box = $('#gTee'); if (!box) return; const a = whole(); if (!a) { box.innerHTML = '<span class="note">Nothing on the canvas yet.</span>'; $('#gTeeNote').textContent = ''; return; }
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = a.image; }); const inkHex = await inkList();
    box.innerHTML = TEES.map(([n, hex]) => { const c = canvas(120, 120), x = c.getContext('2d'); x.fillStyle = hex; x.fillRect(0, 0, 120, 120); const k = Math.min(84 / img.width, 84 / img.height); x.drawImage(img, 60 - img.width * k / 2, 60 - img.height * k / 2, img.width * k, img.height * k);
      return `<button type="button" data-gtee="${hex}" aria-pressed="${TEE === hex}" title="${esc(n)}"><img alt="On ${esc(n)}" src="${c.toDataURL('image/png')}"><span>${esc(n)}</span></button>`; }).join('') + `<label class="gteec" title="Another colour"><input type="color" data-gteec value="${TEE || '#3a5a8c'}"><span>Other</span></label>`;
    teeNote(TEE, inkHex);
  }
  function teeNote(hex, inkHex) {
    const n = $('#gTeeNote'); if (!n) return; if (!hex) { n.textContent = 'Tap a colour to see the art on it, with what the printer does.'; return; }
    const dark = lum(hex) < 120, ko = inkHex.filter(h => dist(h, hex) < 48), light = inkHex.filter(h => lum(h) > 150 && !ko.includes(h));
    const t = []; if (ko.length) t.push(`${ko.map(h => pms(h) || h).join(', ')} ${ko.length === 1 ? 'is' : 'are'} the shirt's own colour: knocked out, the shirt shows through (one screen fewer).`);
    if (dark) t.push(`A dark shirt: the colours print on a white underbase, so they stay bright (one more screen, flashed).`); else if (light.length && lum(hex) < 200) t.push('Light inks on a mid-tone shirt may need an underbase to stay bright.');
    if (!t.length) t.push('Prints as it is: no knockouts, no underbase.'); n.textContent = t.join(' ');
  }
  // the vector of what is on the canvas: exact from the paths when everything visible is a shape, else the whole picture traced on the server
  function vectorInks() {
    const vis = LAYERS.filter(l => l.visible && l.kind !== 'base'); if (!vis.length || !vis.every(l => l.kind === 'shape')) return null;
    const out = [], pts = [], r2 = v => Math.round(v * 100) / 100;
    for (const l of vis) {
      const paths = VEC.pathsOf(l).map(p => ({ closed: p.closed, nodes: p.nodes.map(n => { const a = VEC.toDoc(l, n[0], n[1]), b = VEC.toDoc(l, n[2], n[3]), c = VEC.toDoc(l, n[4], n[5]); return [a[0], a[1], b[0], b[1], c[0], c[1]].map(r2); }) }));
      const d = VEC.dOf(paths); if (!d) continue; const sw = l.stroke ? (l.strokeW || 0) * (l.scale || 1) : 0;
      for (const p of paths) for (const [x, y] of VEC.flat(p, 2)) pts.push([x, y, sw / 2]);
      const fill = l.fill !== false && l.shape !== 'line' ? hex6(l.fillColor) : null, sk = sw > 0 ? hex6(l.strokeColor) : null;
      if (fill) out.push({ hex: fill, pantone: pms(fill), fill: d, stroke: sk === fill ? { d, w: sw } : null });
      if (sk && sk !== fill) out.push({ hex: sk, pantone: pms(sk), fill: '', stroke: { d, w: sw } });
    }
    if (!out.length) return null;
    const x0 = Math.min(...pts.map(p => p[0] - p[2])), y0 = Math.min(...pts.map(p => p[1] - p[2])), x1 = Math.max(...pts.map(p => p[0] + p[2])), y1 = Math.max(...pts.map(p => p[1] + p[2]));
    return { inks: out, box: { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) } };
  }
  const inkCount = () => Math.max(1, inks().length || ASK.inks);
  function svgOf(v, w, name) {
    const by = new Map(); for (const k of v.inks) { if (!by.has(k.hex)) by.set(k.hex, []); by.get(k.hex).push(k); }
    const b = v.box, hIn = w * b.h / b.w, x = s => String(s).replace(/[<&>"]/g, '');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}" width="${w}in" height="${hIn.toFixed(3)}in">\n<title>${x(name)} · ${by.size} inks · Future Basics Design Lab</title>\n`
      + [...by.entries()].map(([hex, list]) => { const code = list[0].pantone || ''; return `<g id="${(code || hex.slice(1)).replace(/[^A-Za-z0-9]+/g, '_')}" data-pantone="${x(code)}">${list.map(k => (k.fill ? `<path fill="${hex}" fill-rule="evenodd" d="${k.fill}"/>` : '') + (k.stroke ? `<path fill="none" stroke="${hex}" stroke-width="${k.stroke.w.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" d="${k.stroke.d}"/>` : '')).join('')}</g>`; }).join('\n') + '\n</svg>\n';
  }
  const slug = () => fileBase();
  async function out(kind) {
    await loadPantone(); const w = Number($('#gWidth')?.value) || widthIn(), name = D.concept.name || 'Graphic', v = vectorInks();
    if (kind === 'put') { if (!PIC) { $('#apply')?.click(); return; } return putOnPiece(); }
    if (kind === 'sep') { const a = whole(); if (!a) { toast('There is nothing on the canvas yet.'); return; } return sepOpen(null, { image: a.image, widthIn: w, name }); }
    if (kind === 'sim') { const a = whole(); if (!a) { toast('There is nothing on the canvas yet.'); return; } if (!TEE) toast('Separated for a black shirt: tap a colour under On garments for another.'); return sepOpen(null, { image: a.image, widthIn: w, name, method: 'index', garment: TEE || '#141416', inks: 6 }); }
    busy(kind === 'pdf' ? 'Making the PDF…' : 'Making the vector…');
    try {
      if (kind === 'svg') {
        let svg; if (v) svg = svgOf(v, w, name); else { const a = whole(); if (!a) throw new Error('There is nothing on the canvas yet.'); svg = (await api('/v1/lab/studio/vector', { body: { image: a.image, widthIn: w, name, max: inkCount(), maxSide: 1024 } })).svg; }
        const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })); download(url, slug() + '-vector.svg'); setTimeout(() => URL.revokeObjectURL(url), 4000); toast(v ? 'The vector is downloading: one group per ink, named for its Pantone.' : 'Traced and downloading: one group per ink.');
      } else {
        const a = v ? null : whole(); if (!v && !a) throw new Error('There is nothing on the canvas yet.');
        const r = await fetch('/v1/lab/studio/vector.pdf', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' }, body: JSON.stringify(v ? { inks: v.inks, box: v.box, widthIn: w, name } : { image: a.image, max: inkCount(), widthIn: w, name }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'The PDF could not be made');
        const url = URL.createObjectURL(await r.blob()); download(url, slug() + '-vector.pdf'); setTimeout(() => URL.revokeObjectURL(url), 4000); toast('The PDF is downloading: the art, then a film page for every ink.');
      }
    } catch (x) { toast(x.message); } finally { busy(); }
  }

  // ---- events ----
  document.addEventListener('click', e => {
    const p = e.target.closest('#pMake'); if (!p) return; const b = e.target.closest('button'); if (!b || b.disabled) return; const d = b.dataset;
    const keepText = () => { const t = $('#gBrief'), w = $('#gWords'); if (t) ASK.brief = t.value; if (w) ASK.words = w.value; };
    if (d.gseason !== undefined) { keepText(); ASK.season = ASK.season === d.gseason ? '' : d.gseason; keep(); paint(); }
    else if (d.gstyle !== undefined) { keepText(); ASK.style = ASK.style === d.gstyle ? '' : d.gstyle; keep(); paint(); }
    else if (d.ginks) { keepText(); ASK.inks = clamp(ASK.inks + Number(d.ginks), 1, 8); keep(); paint(); }
    else if (d.gcount) { keepText(); ASK.count = Number(d.gcount); keep(); paint(); }
    else if (d.geng) { keepText(); ASK.engines = ASK.engines.includes(d.geng) ? ASK.engines.filter(x => x !== d.geng) : [...ASK.engines, d.geng]; keep(); paint(); }
    else if (b.id === 'gGo') go();
    else if (d.gi !== undefined) use(Number(d.gi));
    else if (d.gvis) { const ls = genLayers().filter(l => hex6(l.fillColor) === d.gvis), on = !ls.some(l => l.visible); ls.forEach(l => { l.visible = on; }); commit(); paintPanels(); draw(); paintInks(); }
    else if (d.gdrop) { const n = genLayers().filter(l => hex6(l.fillColor) === d.gdrop).length; LAYERS = LAYERS.filter(l => !(l.gen && hex6(l.fillColor) === d.gdrop)); if (!layerOf(SEL)) SEL = genLayers()[0]?.id || null; commit(); paintPanels(); draw(); paintInks(); toast(`Ink dropped (${n} layer${n === 1 ? '' : 's'}). Undo brings it back.`); }
    else if (d.gfewer !== undefined) fewer();
    else if (d.gshuffle !== undefined) shuffle();
    else if (d.gpal) palette(d.gpal);
    else if (d.gtrace) retrace(Number(d.gtrace));
    else if (d.gkey !== undefined) { const ls = genLayers(), on = !ls[0]?.gen.key; ls.forEach(l => { l.gen.key = on; }); weight(ls[0]?.gen.weight || 0); commit(); paintPanels(); paintInks(); }
    else if (d.gpoints !== undefined) { const l = genLayers().find(x => x.id === SEL) || genLayers()[0]; if (l) { SEL = l.id; setTool('node'); paintPanels(); draw(); toast('Drag a point or its handles; tap the line to add one.'); } }
    else if (d.gharm) harmony(d.gharm);
    else if (d.gemb !== undefined) thickenForEmb().catch(x => toast(x.message));
    else if (d.gmisreg !== undefined) { const list = inks(); if (list.length < 2) { toast('Off register needs two inks or more.'); return; } const step = Math.max(3, W / 180); list.slice(1).forEach((k, i) => { const a = (i * 2.4 + 1) % (Math.PI * 2); for (const l of k.layers) { l.x += Math.cos(a) * step; l.y += Math.sin(a) * step; touched(l); } }); commit(); paintPanels(); draw(); toast('Each ink nudged a little off its key. Undo puts them back.'); }
    else if (d.glock) { keepText(); lockup(d.glock); }
    else if (d.gsticker !== undefined) contour('sticker'); else if (d.gcut !== undefined) contour('cut');
    else if (d.gtee) { TEE = TEE === d.gtee ? null : d.gtee; if (!PIC) { window.PAGEBG = TEE || ''; draw(); } paintTees(); }
    else if (d.gput !== undefined) out('put'); else if (d.gsep !== undefined) out('sep'); else if (d.gsim !== undefined) out('sim'); else if (d.gsvg !== undefined) out('svg'); else if (d.gpdf !== undefined) out('pdf');
  });
  document.addEventListener('input', e => {
    if (e.target.dataset?.gcol) { recolour(hex6(e.target.dataset.gcol), hex6(e.target.value), { live: true }); e.target.dataset.gcol = hex6(e.target.value); e.target.parentNode.style.background = e.target.value; }
    else if (e.target.id === 'gWeight') weight(Number(e.target.value));
    else if (e.target.id === 'gWidth') WIDTH = Number(e.target.value) || 0;
    else if (e.target.id === 'gBorder') { BORDER = Number(e.target.value); const v = $('#gBorderV'); if (v) v.textContent = BORDER + ' in'; }
    else if (e.target.dataset?.gteec !== undefined) { TEE = hex6(e.target.value); if (!PIC) { window.PAGEBG = TEE; draw(); } }
  });
  document.addEventListener('change', e => {
    if (e.target.dataset?.gcol) { commit(); paintPanels(); paintInks(); }
    else if (e.target.id === 'gWeight') { commit(); paintPanels(); }
    else if (e.target.dataset?.gmerge && e.target.value) recolour(e.target.dataset.gmerge, e.target.value);
    else if (e.target.dataset?.gteec !== undefined) paintTees();
  });
  document.addEventListener('keydown', e => { if (e.target.id === 'gBrief' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
  window.GEN = { paint, inks: () => { if ($('#gInks')) paintInks(); }, layersOf, bboxOf, vectorInks, svgOf, results: () => RES };
})();

// Studio, the graphic generator (served as /lab/studio-gen.js, loaded after the Studio's script, whose state it shares). Graphics studio only.
//   Make     a brief, a season, a style, the inks and the engines: Claude, OpenAI and Google draw at once (src/lab-graphic-gen.js), and every answer
//            comes back traced into one vector layer per ink. One engine down does not stop the others.
//   Inks     each ink of the graphic as a swatch with its Pantone: recolour it, hide it, merge it into another, drop it; one ink fewer; a season's
//            palette; shuffle the colours round
//   Lines    trace again finer or bolder, thicken every line, a key line in the darkest ink, edit the points
//   Print    put it on the garment (or keep it), the separations, the vector as SVG, or as a PDF with a film page for every ink
(function () {
  if (typeof GMODE === 'undefined' || !GMODE) return;
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
  .gx input[type=range]{flex:1;min-width:110px}`;
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
    const cw = x1 - x0 || 1, ch = y1 - y0 || 1, t = box || { x: W * .12, y: H * .12, w: W * .76, h: H * .76 }, k = Math.min(t.w / cw, t.h / ch), ox = t.x + (t.w - cw * k) / 2, oy = t.y + (t.h - ch * k) / 2;
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
      <div class="gpals" role="group" aria-label="Season palettes">${META.seasons.map(s => `<button type="button" data-gpal="${s.id}" title="${esc(s.label)}">${s.palette.map(h => `<i style="background:${h}"></i>`).join('')}</button>`).join('')}</div>`;
    const ls = genLayers(), w = ls[0]?.gen.weight || 0, key = Boolean(ls[0]?.gen.key);
    lines.innerHTML = `<h4>Lines</h4>
      <div class="grow"><span class="glab">Detail</span><div class="seg">${[['fine', 'Fine', .55], ['clean', 'Clean', 1.1], ['bold', 'Bold', 2.4]].map(([id, t, v]) => `<button type="button" data-gtrace="${v}" aria-pressed="${(ls[0]?.gen.tol || 1.1) === v}">${t}</button>`).join('')}</div></div>
      <label class="grow"><span class="glab">Weight</span><input type="range" min="0" max="24" step="1" value="${w}" id="gWeight" aria-label="Thicken every line"></label>
      <div class="grow"><button class="btn sm ${key ? '' : 'q'}" type="button" data-gkey aria-pressed="${key}">Key line</button><button class="btn sm q" type="button" data-gpoints>Edit points</button></div>`;
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

  // ---- Print: on the garment, separations, SVG, PDF ----
  function whole() { // everything visible, trimmed to the art
    compose(); const x = docC.getContext('2d'), d = x.getImageData(0, 0, docC.width, docC.height).data; let x0 = docC.width, y0 = docC.height, x1 = -1, y1 = -1;
    for (let y = 0; y < docC.height; y += 2) for (let i = 0; i < docC.width; i += 2) if (d[(y * docC.width + i) * 4 + 3] > 8) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null; x0 = Math.max(0, x0 - 2); y0 = Math.max(0, y0 - 2); x1 = Math.min(docC.width - 1, x1 + 2); y1 = Math.min(docC.height - 1, y1 + 2);
    const c = canvas(x1 - x0 + 1, y1 - y0 + 1); c.getContext('2d').drawImage(docC, x0, y0, c.width, c.height, 0, 0, c.width, c.height); return { image: c.toDataURL('image/png'), w: c.width, h: c.height };
  }
  const widthIn = () => { if (WIDTH > 0) return WIDTH; const ls = genLayers(), b = ls.length ? bboxOf(ls) : null, w = b ? b.w : (whole()?.w || W); return Math.round(w / (PPI || W / 14) * 4) / 4 || 10; };
  function paintOut() {
    const o = $('#gOut'); if (!o) return; const put = $('#apply')?.textContent || 'Keep in the library';
    o.innerHTML = `<h4>Print</h4><label class="grow"><span class="glab">Width</span><input class="t" type="number" min="1" max="30" step=".25" id="gWidth" value="${widthIn()}" style="width:80px"> <span class="note">in</span></label>
      <div class="gout"><button class="btn go wide" type="button" data-gput>${esc(put)}</button><button class="btn sm" type="button" data-gsep>Separations</button><button class="btn sm" type="button" data-gsvg>Vector SVG</button><button class="btn sm wide" type="button" data-gpdf>Vector PDF + films</button></div>`;
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
    if (kind === 'put') { $('#apply')?.click(); return; }
    if (kind === 'sep') { const a = whole(); if (!a) { toast('There is nothing on the canvas yet.'); return; } return sepOpen(null, { image: a.image, widthIn: w, name }); }
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
    else if (d.gput !== undefined) out('put'); else if (d.gsep !== undefined) out('sep'); else if (d.gsvg !== undefined) out('svg'); else if (d.gpdf !== undefined) out('pdf');
  });
  document.addEventListener('input', e => {
    if (e.target.dataset?.gcol) { recolour(hex6(e.target.dataset.gcol), hex6(e.target.value), { live: true }); e.target.dataset.gcol = hex6(e.target.value); e.target.parentNode.style.background = e.target.value; }
    else if (e.target.id === 'gWeight') weight(Number(e.target.value));
    else if (e.target.id === 'gWidth') WIDTH = Number(e.target.value) || 0;
  });
  document.addEventListener('change', e => {
    if (e.target.dataset?.gcol) { commit(); paintPanels(); paintInks(); }
    else if (e.target.id === 'gWeight') { commit(); paintPanels(); }
    else if (e.target.dataset?.gmerge && e.target.value) recolour(e.target.dataset.gmerge, e.target.value);
  });
  document.addEventListener('keydown', e => { if (e.target.id === 'gBrief' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } });
  window.GEN = { paint, inks: () => { if ($('#gInks')) paintInks(); }, layersOf, bboxOf, vectorInks, svgOf, results: () => RES };
})();

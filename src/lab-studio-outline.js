// Studio, Outlines (served as /lab/studio-outline.js; shares the Studio's globals). A Pencil drawing, a painting layer or a picture layer, turned
// into clean vector outlines (src/lab-trace.js): one filled path layer per ink, editable point by point. Refine traces the same drawing again,
// a level cleaner each time (the grain closed up, specks gone, the line smoother); the drawing it came from is kept, hidden, under it.
// On the flats (Flat front, Flat back) the same buttons clean the drawing on the flat, in place.
(function () {
  let T = null; const lib = async () => T || (T = await import('/lab/lab-trace.js'));
  const st = document.createElement('style'); st.textContent = '.olbar{display:inline-flex;gap:6px;align-items:center;flex:none}'; document.head.appendChild(st);
  const MAX = 6, onFlats = () => VMODE === 'front' || VMODE === 'back';
  const group = id => LAYERS.filter(l => l.ol && l.ol.g === id);
  const srcOf = l => (l?.ol ? layerOf(l.ol.from) : l);
  const can = l => l && (l.kind === 'paint' || l.kind === 'image') && l.raster;
  // the selected drawing, or the outline made from it
  const target = () => { const l = selected(); if (l?.ol) return { src: layerOf(l.ol.from), level: l.ol.level, g: l.ol.g }; if (can(l)) return { src: l, level: 0, g: null }; return null; };

  async function run(t, level) {
    const L = await lib(), l = t.src; if (!l) { toast('The drawing it came from is gone, so it cannot be refined.'); return; }
    const a = artOf(l), k = Math.min(1, 1400 / Math.max(a.width, a.height)), c = canvas(a.width * k, a.height * k), x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(a, 0, 0, c.width, c.height); const px = x.getImageData(0, 0, c.width, c.height).data;
    const inks = L.outlines(px, c.width, c.height, { level }); if (!inks.length) { toast('There is nothing drawn on that layer yet.'); return; }
    const fx = fixed(l), pos = fx ? { x: W / 2, y: H / 2, scale: 1, rot: 0, flip: false } : { x: l.x, y: l.y, scale: l.scale, rot: l.rot, flip: l.flip }, g = t.g || ('o' + Math.random().toString(36).slice(2, 8));
    const made = [];
    for (const ink of inks) {
      const paths = VEC.parseD(ink.d); if (!paths) continue;
      // the trace's pixels → the layer's own frame (round its centre, at the raster's full size)
      const m = v => v / k, cx = c.width / 2, cy = c.height / 2;
      const np = paths.map(p => ({ closed: p.closed, nodes: p.nodes.map(n => [m(n[0] - cx), m(n[1] - cy), m(n[2] - cx), m(n[3] - cy), m(n[4] - cx), m(n[5] - cy)]) }));
      const o = fresh('shape', { name: `Outline · ${ink.hex}`, shape: 'path', paths: np, fill: true, fillColor: ink.hex, stroke: false, strokeColor: ink.hex, strokeW: 2, radius: 0, w: 1, h: 1, ...pos, opacity: l.opacity, blend: l.blend });
      o.tint = { ...o.tint, amount: 0 }; o.ol = { g, from: l.id, level }; VEC.normalize(o); made.push(o);
    }
    if (!made.length) { toast('The outline came back empty.'); return; }
    // in the drawing's place in the stack (or the old outline's), the drawing hidden under it
    const old = t.g ? group(t.g) : [], at = old.length ? LAYERS.indexOf(old[0]) : LAYERS.indexOf(l) + 1;
    LAYERS = LAYERS.filter(q => !old.includes(q)); LAYERS.splice(Math.min(at, LAYERS.length), 0, ...made); l.visible = false; SEL = made[made.length - 1].id;
    commit(); paintPanels(); draw(); paintOpts();
    const pts = made.reduce((s, o) => s + o.paths.reduce((t2, p) => t2 + p.nodes.length, 0), 0);
    toast(level === 1 ? `Outlined: ${made.length} ink${made.length === 1 ? '' : 's'}, ${pts} points. Refine makes it cleaner; Undo goes back.` : `Refined (${level} of ${MAX}): ${pts} points.`);
  }
  async function outline() {
    if (onFlats()) { const f = FF(); if (!f?.outline) { toast('The flats are still opening.'); return; } const r = await f.outline(1); toast(r?.message || ''); paintOpts(); return; }
    const t = target(); if (!t) { toast('Choose the drawing first: a painting or picture layer.'); return; }
    busy('Tracing the drawing…'); try { await run({ ...t, g: t.level ? t.g : null }, 1); } catch (x) { toast(x.message); } finally { busy(); }
  }
  async function refine() {
    if (onFlats()) { const f = FF(); const r = await f?.outline?.('more'); toast(r?.message || ''); paintOpts(); return; }
    const t = target(); if (!t) { toast('Choose the outline first.'); return; }
    if (!t.level) return outline(); if (t.level >= MAX) { toast('That is as clean as it gets. Edit points (A) for the rest.'); return; }
    busy('Refining…'); try { await run(t, t.level + 1); } catch (x) { toast(x.message); } finally { busy(); }
  }
  // the buttons, on the brush's bar and in the layer's settings
  const level = () => { if (onFlats()) return FF()?.outlineLevel?.() || 0; const t = target(); return t ? t.level : 0; };
  window.OUTL = {
    bar: () => { const lv = level(); return `<span class="olbar"><button class="btn sm" type="button" data-outl="go" title="Turn the drawing into clean vector outlines">Outlines</button>${lv ? `<button class="btn sm go" type="button" data-outl="more" title="Trace it again, cleaner">Refine${lv > 1 ? ` · ${lv}` : ''}</button>` : ''}</span>`; },
    fields: l => (can(l) || l?.ol ? `<div class="sec"><h4>Outlines</h4><div class="row">${l.ol ? `<button class="btn sm go" type="button" data-outl="more">Refine · ${l.ol.level} of ${MAX}</button><button class="btn sm q" type="button" data-outl="src">Show the drawing</button>` : '<button class="btn sm" type="button" data-outl="go">Turn into outlines</button>'}</div></div>` : ''),
    outline, refine
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-outl]'); if (!b) return; const a = b.dataset.outl;
    if (a === 'go') outline(); else if (a === 'more') refine();
    else if (a === 'src') { const s = srcOf(selected()); if (s) { s.visible = !s.visible; commit(); paintPanels(); draw(); } }
  });
})();

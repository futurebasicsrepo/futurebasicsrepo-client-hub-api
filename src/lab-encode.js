// A picture as a data: URL without stopping the page (served as /lab/lab-encode.js, for the Studio and the flats).
//   FBEnc.url(canvas, type = 'image/png', quality) → Promise<string>, the same string canvas.toDataURL gives
//   FBEnc.drawn(canvas) → Promise<string|null>: its PNG, or null when nothing is drawn on it (the check made in the worker too)
// The canvas is copied the moment this is called (an ImageBitmap), so drawing on it afterwards does not change what is saved; the PNG is
// made in a worker (lab-encode-worker.js). Where a browser has no OffscreenCanvas, the browser's own toBlob does it; if that fails too,
// toDataURL, as before.
(function () {
  let W = null, N = 0; const wait = new Map();
  const can = () => typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof createImageBitmap === 'function' && typeof FileReader === 'function';
  function worker() {
    if (W || W === false) return W;
    try {
      W = new Worker('/lab/lab-encode-worker.js');
      W.onmessage = e => { const { id, url, err, ink } = e.data || {}, p = wait.get(id); if (!p) return; wait.delete(id); if (url) p.ok(url); else if (ink === false) p.ok(null); else p.no(new Error(err || 'not encoded')); };
      W.onerror = () => { for (const p of wait.values()) p.no(new Error('the encoder stopped')); wait.clear(); W = false; };
    } catch { W = false; }
    return W;
  }
  const viaBlob = (c, type, q) => new Promise((ok, no) => {
    if (!c.toBlob) { no(new Error('no toBlob')); return; }
    c.toBlob(b => { if (!b) { no(new Error('no picture')); return; } const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => no(r.error); r.readAsDataURL(b); }, type, q);
  });
  async function url(c, type = 'image/png', q, ink = false) {
    if (!c || !c.width || !c.height) return c?.toDataURL ? c.toDataURL(type, q) : '';
    const w = can() ? worker() : false;
    if (w) {
      try {
        const bmp = createImageBitmap(c); // the copy is taken here, before any await
        const b = await bmp, id = ++N;
        return await new Promise((ok, no) => { wait.set(id, { ok, no }); w.postMessage({ id, bmp: b, type, quality: q, ink }, [b]); });
      } catch { /* the browser's own way, below */ }
    }
    if (ink && !anyInk(c)) return null;
    try { return await viaBlob(c, type, q); } catch { return c.toDataURL(type, q); }
  }
  function anyInk(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }
  window.FBEnc = { url: (c, type, q) => url(c, type, q), drawn: c => url(c, 'image/png', undefined, true) };
})();

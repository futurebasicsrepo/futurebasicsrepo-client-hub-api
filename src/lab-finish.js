// Design Lab finishes, drawn in the browser: how a graphic looks once it is embroidered, printed, transferred, patched or worn, so the studio and the
// technique library show it on the fabric straight away and for free. A finish is a recipe (see src/lab-library.js): an effect with a few settings, the
// blend and opacity, a distressing and a raise (the shadow of a raised stitch or puff). The AI is asked for the photographic version separately.
// Served as /lab/finish.js; it sets window.FBFinish.
(function () {
  'use strict';
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // the worn texture: specks and grain, cracks, or washed-out blotches, the same every time for the same seed
  const TEX = new Map();
  function texture(style, w, h, size, seed) {
    w = Math.round(w); h = Math.round(h); const key = [style, w, h, size, seed].join('|'); if (TEX.has(key)) return TEX.get(key);
    const c = canvas(w, h), x = c.getContext('2d'), r = rng(seed), s = Math.max(.2, size / 50), area = w * h;
    x.fillStyle = '#000'; x.strokeStyle = '#000';
    if (style === 'cracked') { x.lineCap = 'round'; const n = Math.round(area / (9000 * s * s)) + 6; for (let i = 0; i < n; i++) { let px = r() * w, py = r() * h, a = r() * Math.PI * 2; x.lineWidth = (.6 + r() * 2.2) * s; x.globalAlpha = .55 + r() * .45; x.beginPath(); x.moveTo(px, py); const steps = 4 + Math.floor(r() * 10); for (let k = 0; k < steps; k++) { a += (r() - .5) * 1.2; px += Math.cos(a) * (8 + r() * 26) * s; py += Math.sin(a) * (8 + r() * 26) * s; x.lineTo(px, py); } x.stroke(); } }
    if (style === 'faded') { const n = Math.round(area / (26000 * s * s)) + 5; for (let i = 0; i < n; i++) { const px = r() * w, py = r() * h, rad = (20 + r() * 90) * s, g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(0,0,0,' + (.25 + r() * .45) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalAlpha = 1; x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); } x.fillStyle = '#000'; }
    const specks = Math.round(area / ((style === 'worn' ? 260 : 900) * s * s)); for (let i = 0; i < specks; i++) { const rad = (r() ** 3 * 5 + .4) * s; x.globalAlpha = .35 + r() * .65; x.beginPath(); x.ellipse(r() * w, r() * h, rad, rad * (.4 + r() * .8), r() * 3, 0, Math.PI * 2); x.fill(); }
    const grain = Math.round(area / (40 * s)); x.globalAlpha = .22; for (let i = 0; i < grain; i++) x.fillRect(r() * w, r() * h, 1.2 * s, 1.2 * s);
    x.globalAlpha = 1; if (TEX.size > 40) TEX.delete(TEX.keys().next().value); TEX.set(key, c); return c;
  }

  // light from the top left: a lit rim on the upper edges and a shade on the lower ones, inside the shape only
  function bevel(c, d, blur, k) {
    if (k <= 0 || !d) return; // a negative depth lights it from below: pressed in, not raised
    const w = c.width, h = c.height, x = c.getContext('2d');
    for (const [col, ox] of [['#ffffff', 1], ['#000000', -1]]) {
      const t = canvas(w, h), tx = t.getContext('2d'); tx.drawImage(c, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = col; tx.fillRect(0, 0, w, h);
      tx.globalCompositeOperation = 'destination-out'; tx.filter = `blur(${blur}px)`; tx.drawImage(c, d * ox, d * ox); tx.filter = 'none';
      x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = k * (ox > 0 ? .75 : .6); x.drawImage(t, 0, 0); x.restore();
    }
  }
  // a repeating tile, laid over the colour (light and dark only), turned to the stitch direction
  function overlay(c, tile, angle, alpha, op = 'source-atop') {
    const x = c.getContext('2d'), p = x.createPattern(tile, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().rotate(angle || 0));
    x.save(); x.globalCompositeOperation = op; x.globalAlpha = alpha; x.fillStyle = p; x.fillRect(0, 0, c.width, c.height); x.restore();
  }
  function stitchTile(kind, u) {
    const s = Math.max(2, Math.round(3 * u));
    if (kind === 'chain') { const t = canvas(s * 4, s * 3), x = t.getContext('2d'); x.lineWidth = Math.max(1, s * .45); for (let i = 0; i < 2; i++) { x.strokeStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.ellipse(s * (1 + i * 2), s * 1.5, s * .95, s * .65, 0, 0, Math.PI * 2); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.ellipse(s * (1 + i * 2) - .5, s * 1.5 - .5, s * .6, s * .3, 0, Math.PI, Math.PI * 2); x.stroke(); } return t; }
    if (kind === 'fill') { const t = canvas(s * 6, s * 2), x = t.getContext('2d'); for (let row = 0; row < 2; row++) for (let i = 0; i < 2; i++) { const ox = (i * 3 + row * 1.5) * s, g = x.createLinearGradient(0, row * s, 0, row * s + s); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); x.fillStyle = g; x.fillRect(ox, row * s, s * 2.6, s * .92); } return t; }
    // satin: long parallel threads, lit in the middle and shaded at their edges
    const t = canvas(s, s * 8), x = t.getContext('2d'), g = x.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(0,0,0,.42)'); g.addColorStop(.35, 'rgba(255,255,255,.28)'); g.addColorStop(.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.42)'); x.fillStyle = g; x.fillRect(0, 0, s, s * 8); return t;
  }
  function noiseTile(u, seed, light = .35, dark = .35, n = 900) { const w = Math.max(32, Math.round(64 * u)), t = canvas(w, w), x = t.getContext('2d'), r = rng(seed); for (let i = 0; i < n; i++) { x.fillStyle = r() > .5 ? `rgba(255,255,255,${light * r()})` : `rgba(0,0,0,${dark * r()})`; const z = Math.max(1, u * (.6 + r() * 1.4)); x.fillRect(r() * w, r() * w, z, z); } return t; }
  function sheen(c, k, angle = 35) {
    if (k <= 0) return; const x = c.getContext('2d'), w = c.width, h = c.height, a = angle * Math.PI / 180, L = Math.hypot(w, h);
    const g = x.createLinearGradient(w / 2 - Math.cos(a) * L / 2, h / 2 - Math.sin(a) * L / 2, w / 2 + Math.cos(a) * L / 2, h / 2 + Math.sin(a) * L / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.38, `rgba(255,255,255,${.55 * k})`); g.addColorStop(.46, 'rgba(255,255,255,0)'); g.addColorStop(.62, `rgba(255,255,255,${.25 * k})`); g.addColorStop(.7, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (.12 * k) + ')');
    x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
  }
  function halftone(c, u) {
    const w = c.width, h = c.height, src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, cell = Math.max(4, Math.round(7 * u)), out = canvas(w, h), x = out.getContext('2d');
    for (let cy = 0; cy < h; cy += cell) for (let cx = 0; cx < w; cx += cell) {
      let r = 0, g = 0, b = 0, a = 0, n = 0; for (let yy = cy; yy < Math.min(h, cy + cell); yy += 2) for (let xx = cx; xx < Math.min(w, cx + cell); xx += 2) { const i = (yy * w + xx) * 4; a += src[i + 3]; if (src[i + 3] > 8) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; } }
      const cover = a / (Math.ceil(Math.min(cell, h - cy) / 2) * Math.ceil(Math.min(cell, w - cx) / 2) * 255); if (cover < .04 || !n) continue;
      const lum = (r + g + b) / (3 * n * 255), rad = cell * .62 * Math.sqrt(cover) * (1.05 - lum * .35);
      x.fillStyle = `rgb(${r / n | 0},${g / n | 0},${b / n | 0})`; x.beginPath(); x.arc(cx + cell / 2, cy + cell / 2, rad, 0, Math.PI * 2); x.fill();
    }
    const cx = c.getContext('2d'); cx.clearRect(0, 0, w, h); cx.drawImage(out, 0, 0);
  }
  const METAL = { gold: ['#7a5a12', '#f4dc8a', '#b8862b', '#fff3c4', '#8c6418'], silver: ['#6b6e74', '#f2f3f5', '#a3a7ae', '#ffffff', '#7b7f86'], copper: ['#6e3418', '#f3b48a', '#b0623a', '#ffd9c0', '#7a3a1c'] };
  function metal(c, kind, u) {
    const x = c.getContext('2d'), w = c.width, h = c.height, cols = METAL[kind] || METAL.gold, g = x.createLinearGradient(0, 0, w, h);
    cols.forEach((col, i) => g.addColorStop(i / (cols.length - 1), col)); x.save(); x.globalCompositeOperation = 'source-in'; x.fillStyle = g; x.fillRect(0, 0, w, h); x.restore();
    overlay(c, noiseTile(u, 7, .5, .3, 500), 0, .5);
  }

  // → a new canvas: the layer as it looks with the finish's effect (the distressing, the blend and the raise are applied by whoever draws it)
  // `u` is how many of the layer's own pixels make one pixel of a 1000-pixel-wide picture, so stitches and dots keep a real size whatever the zoom or scale
  function effect(src, f, u = 1, seed = 1) {
    const fx = f && f.effect; if (!fx || fx === 'none') return src;
    const c = canvas(src.width, src.height), x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const k = clamp(f.strength ?? .7, 0, 1), d = (n) => Math.max(1, n * u);
    if (fx === 'stitch') { overlay(c, stitchTile(f.stitch || 'satin', u), f.angle ?? 45, .55 + .45 * k); overlay(c, noiseTile(u, seed, .18, .18), 0, .6); bevel(c, d(1.6), d(2.2), .55 * k + .2); }
    if (fx === 'puff') { overlay(c, noiseTile(u, seed, .25, .15, 1400), 0, .5); x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = .12 * k; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); bevel(c, d(3.5), d(5), .6 + .4 * k); }
    if (fx === 'ink') { overlay(c, noiseTile(u, seed, .12, .2, 1200), 0, .7 * k + .2); sheen(c, (f.sheen ?? .15) * k); }
    if (fx === 'soak') { overlay(c, noiseTile(u, seed, .05, .3, 2000), 0, .8); x.save(); x.globalCompositeOperation = 'destination-out'; x.globalAlpha = .18 * k; x.drawImage(noiseTile(u, seed + 3, 0, 1, 2500), 0, 0, c.width, c.height); x.restore(); }
    if (fx === 'halftone') { halftone(c, u); }
    if (fx === 'foil') { metal(c, f.metal || 'gold', u); sheen(c, .8 * k, f.angle ?? 35); bevel(c, d(1), d(1.5), .4); }
    if (fx === 'film') { sheen(c, (f.sheen ?? .4) * (.5 + k / 2), f.angle ?? 35); bevel(c, d(1), d(1), .35 + .3 * k); }
    if (fx === 'rubber') { sheen(c, (f.sheen ?? .5), f.angle ?? 35); bevel(c, d(3), d(4), .7 + .3 * k); }
    if (fx === 'chenille') { overlay(c, noiseTile(u, seed, .45, .45, 2600), 0, .9); overlay(c, noiseTile(u * 1.7, seed + 1, .3, .35, 900), 30, .7); bevel(c, d(4), d(7), .55 + .35 * k); }
    if (fx === 'woven') { const s = Math.max(2, Math.round(2 * u)), t = canvas(s * 2, s * 2), tx = t.getContext('2d'); tx.fillStyle = 'rgba(0,0,0,.3)'; tx.fillRect(0, 0, s, s * .5); tx.fillRect(s, s, s * .5, s); tx.fillStyle = 'rgba(255,255,255,.22)'; tx.fillRect(s, 0, s, s * .5); tx.fillRect(0, s, s * .5, s); overlay(c, t, 0, .6 + .4 * k); bevel(c, d(1.2), d(1.5), .4); }
    if (fx === 'deboss') { x.save(); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = .3; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.restore(); bevel(c, -d(2), d(2.5), .8); }
    return c;
  }
  // the worn texture cut out of the layer
  function distress(c, dz, seed = 1) {
    if (!dz || !(dz.amount > 0)) return c; const x = c.getContext('2d');
    x.save(); x.globalCompositeOperation = 'destination-out'; x.globalAlpha = clamp(dz.amount, 0, 1); x.drawImage(texture(dz.style || 'worn', c.width, c.height, dz.size || 50, dz.seed ?? seed), 0, 0); x.restore(); return c;
  }
  // the shadow of a raised finish, in picture pixels (`u` as above, for a picture `scale` times its 1000-pixel width)
  const shadow = (f, scale = 1) => { const r = Number(f?.raise) || 0; return r > 0 ? { color: `rgba(0,0,0,${clamp(.18 + r * .04, .2, .45)})`, blur: r * 1.6 * scale, dx: r * .45 * scale, dy: r * .8 * scale } : null; };

  // a piece of fabric to try a finish on: jersey, fleece, twill, canvas or denim in a colour, with soft folds
  function fabric(w, h, color = '#d9d6cf', kind = 'jersey', seed = 3) {
    const c = canvas(w, h), x = c.getContext('2d'), r = rng(seed), u = w / 1000;
    x.fillStyle = color; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) { const px = r() * w, py = r() * h, rad = (120 + r() * 320) * u, g = x.createRadialGradient(px, py, 0, px, py, rad), dark = r() > .5; g.addColorStop(0, dark ? 'rgba(0,0,0,.10)' : 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); }
    const s = Math.max(2, Math.round((kind === 'canvas' || kind === 'denim' ? 4 : kind === 'fleece' ? 3 : 2.4) * u)), t = canvas(s * 2, s * 2), tx = t.getContext('2d');
    if (kind === 'jersey' || kind === 'fleece') { tx.strokeStyle = 'rgba(0,0,0,.12)'; tx.lineWidth = Math.max(1, s * .35); tx.beginPath(); tx.moveTo(0, 0); tx.lineTo(s, s * 2); tx.moveTo(s * 2, 0); tx.lineTo(s, s * 2); tx.stroke(); tx.strokeStyle = 'rgba(255,255,255,.08)'; tx.beginPath(); tx.moveTo(s * .5, 0); tx.lineTo(s * 1.2, s * 1.6); tx.stroke(); }
    else { tx.strokeStyle = 'rgba(0,0,0,.14)'; tx.lineWidth = Math.max(1, s * .5); for (let i = -2; i < 4; i++) { tx.beginPath(); tx.moveTo(i * s, s * 2); tx.lineTo(i * s + s * 2, 0); tx.stroke(); } if (kind === 'denim') { tx.strokeStyle = 'rgba(255,255,255,.12)'; tx.lineWidth = Math.max(1, s * .2); tx.beginPath(); tx.moveTo(0, s); tx.lineTo(s, 0); tx.stroke(); } }
    x.fillStyle = x.createPattern(t, 'repeat'); x.fillRect(0, 0, w, h);
    const n = noiseTile(u * 1.2, seed, kind === 'fleece' ? .18 : .08, kind === 'fleece' ? .18 : .1, 1800); x.fillStyle = x.createPattern(n, 'repeat'); x.fillRect(0, 0, w, h);
    return c;
  }
  // a graphic finished and laid on a piece of fabric, the way the library shows a technique
  function swatch(graphic, f, { w = 360, h = 300, color = '#d9d6cf', cloth = 'jersey', fill = .62, seed = 5 } = {}) {
    const c = fabric(w, h, color, cloth, seed), x = c.getContext('2d');
    if (!graphic) return c;
    const k = Math.min(w * fill / graphic.width, h * fill / graphic.height), gw = graphic.width * k, gh = graphic.height * k;
    let g = canvas(gw, gh); g.getContext('2d').drawImage(graphic, 0, 0, gw, gh);
    if (f?.sat != null && f.sat !== 100) { const t = canvas(gw, gh), tx = t.getContext('2d'); tx.filter = `saturate(${f.sat}%)`; tx.drawImage(g, 0, 0); g = t; }
    g = effect(g, f, w / 1000, seed); distress(g, f?.distress, seed);
    const sh = shadow(f, w / 1000); x.save(); x.globalAlpha = f?.opacity ?? 1; x.globalCompositeOperation = f?.blend || 'source-over';
    if (sh) { x.shadowColor = sh.color; x.shadowBlur = sh.blur; x.shadowOffsetX = sh.dx; x.shadowOffsetY = sh.dy; }
    x.drawImage(g, (w - gw) / 2, (h - gh) / 2); x.restore(); return c;
  }
  // a sample graphic for when no artwork is chosen: an arch of our name over a star, in two inks
  function sample(size = 600, inks = ['#1F3A5F', '#C8372D', '#F2EBDD']) {
    const c = canvas(size, size * .8), x = c.getContext('2d'), cx = size / 2;
    x.fillStyle = inks[0]; x.beginPath(); x.arc(cx, size * .46, size * .26, 0, Math.PI * 2); x.fill();
    x.fillStyle = inks[2]; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? size * .09 : size * .2; x.lineTo(cx + Math.cos(a) * r, size * .46 + Math.sin(a) * r); } x.closePath(); x.fill();
    x.fillStyle = inks[1]; x.font = `700 ${size * .085}px 'Space Grotesk',system-ui,sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    const word = 'FUTURE BASICS', R = size * .34, th = Math.PI * .75; let s = 0; const ws = [...word].map(ch => x.measureText(ch).width + size * .012), L = ws.reduce((a, b) => a + b, 0);
    [...word].forEach((ch, i) => { const phi = -th / 2 + (s + ws[i] / 2) / L * th; s += ws[i]; x.save(); x.translate(cx + R * Math.sin(phi), size * .46 - R * Math.cos(phi)); x.rotate(phi); x.fillText(ch, 0, 0); x.restore(); });
    return c;
  }
  window.FBFinish = { texture, effect, distress, shadow, fabric, swatch, sample, EFFECTS: ['none', 'stitch', 'puff', 'ink', 'soak', 'halftone', 'foil', 'film', 'rubber', 'chenille', 'woven', 'deboss'] };
})();

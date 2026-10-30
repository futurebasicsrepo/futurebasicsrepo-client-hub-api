// Design Lab engineering, drawn as the real thing: every part of an assembly built in three.js with the detail that says what it is, at the
// exact size the engineering uses (src/lab-assembly.js), with physically based materials. The page (src/lab-engineer.html) asks for one part
// at a time and places it; the files (STL, the exploded drawing) build the same parts on the server (src/lab-parts-mesh.js). The engineering's
// checks never read these meshes: its own boxes and shells stay the reference for fit, mass and cost.
//   - electronics by kind: chips with their marking and pins, radio modules under shield cans, the board with its traces, pads, silkscreen and
//     the small passives around the chips, USB-C, RCA, mains inlet, jack, tact switches, LEDs, encoders, a VFD and screens that glow, battery
//     pouches and AA cells, speaker drivers (basket, cone, surround, dust cap, spider, magnet), the class-D board with its heatsink, an open-frame
//     supply (transformer, capacitors, fuse), a CD loader (tray, disc, laser sled), a cassette transport with its cassette
//   - mechanical by shape and material: housings with bevelled edges and the bosses inside, clear parts that transmit, brushed and anodised
//     metal, painted steel, MDF with its grain, silicone and rubber, knurled knobs, screws with threads, grille cloth, keypads
// Conventions: a builder works in the part's own frame, its face (the side that shows, or the opening of a socket) toward +z, centred.
export function makeKit(THREE, { maxAniso = 8 } = {}) {
  const T = THREE, texCache = new Map(), PI = Math.PI;
  // ---- textures, drawn on canvases (no files to fetch) ----
  const canvasTex = (key, w, h, draw, { srgb = true, repeat = null } = {}) => {
    if (texCache.has(key)) return texCache.get(key);
    // on the server (the STL and the drawing) there is no canvas: the drawing runs against a stand-in that keeps its ground colour, so a
    // blank texture carries the colour the part reads as (the board's solder mask, a chip's epoxy) in userData.ink
    if (typeof document === 'undefined') { const t = new T.Texture(); t.userData.ink = groundOf(w, h, draw); if (repeat) t.repeat.set(repeat[0], repeat[1]); texCache.set(key, t); return t; }
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = maxAniso; if (srgb) t.colorSpace = T.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    texCache.set(key, t); return t;
  };
  const groundOf = (w, h, draw) => {
    let ink = null; const st = { fillStyle: '#000000', data: null }, any = () => ({ addColorStop() {}, width: 0, data: new Uint8ClampedArray(4) });
    const g = new Proxy(st, { get: (o, k) => k === 'fillRect' ? (x, y, ww, hh) => { if (!ink && typeof o.fillStyle === 'string' && ww * hh >= w * h * .5) ink = o.fillStyle; } : k in o ? o[k] : any, set: (o, k, v) => { o[k] = v; return true; } });
    try { draw(g, w, h); } catch { /* a drawing that needs a real canvas: no colour */ }
    return ink && /^#[0-9a-f]{6}$/i.test(ink) ? ink : null;
  };
  const rng = seed => { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
  const noiseTex = (key, { size = 256, amp = 40, base = 128, streak = 0 } = {}) => canvasTex(key, size, size, (g, w, h) => {
    const im = g.createImageData(w, h), r = rng(hashStr(key));
    if (streak) { const row = Array.from({ length: h }, () => r()); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = base + (row[y] - .5) * amp * 2 + (r() - .5) * amp * .4; const i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } }
    else for (let i = 0; i < w * h; i++) { const v = base + (r() - .5) * amp * 2; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0);
  }, { srgb: false, repeat: [1, 1] });
  const brushed = () => { const t = noiseTex('brushed', { size: 512, amp: 26, base: 120, streak: 1 }); t.repeat.set(1 / 60, 1 / 60); return t; };
  const grain = () => { const t = noiseTex('grain', { size: 256, amp: 30, base: 128 }); t.repeat.set(1 / 12, 1 / 12); return t; };
  const woodTex = () => canvasTex('wood', 1024, 1024, (g, w, h) => {
    const r = rng(7); g.fillStyle = '#b89a74'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const x = r() * w, y = r() * h, l = 4 + r() * 18; g.strokeStyle = `rgba(${90 + r() * 40},${66 + r() * 30},${40 + r() * 20},${.08 + r() * .12})`; g.lineWidth = .6 + r(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * (r() - .5) * .5, y + l); g.stroke(); }
  }, { repeat: [1 / 160, 1 / 160] });
  const fabricTex = () => canvasTex('fabric', 256, 256, (g, w, h) => {
    g.fillStyle = '#26272a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const o = ((x + y) / 4) % 2; g.fillStyle = o ? '#303135' : '#1e1f22'; g.fillRect(x, y, 3, 3); }
  }, { repeat: [1, 1] });
  // chip top: the maker's marking laser-etched into black epoxy, with the pin-1 dot
  const markTex = (text, sub = '') => canvasTex(`mark:${text}:${sub}`, 256, 256, (g, w, h) => {
    g.fillStyle = '#17181a'; g.fillRect(0, 0, w, h); const r = rng(hashStr(text)); for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(255,255,255,${r() * .03})`; g.fillRect(r() * w, r() * h, 1, 1); }
    g.fillStyle = '#8b8d90'; g.textAlign = 'center'; g.textBaseline = 'middle'; const fs = Math.min(46, 360 / Math.max(4, text.length)); g.font = `600 ${fs}px Helvetica, Arial, sans-serif`; g.fillText(text, w / 2, h / 2 - (sub ? 14 : 0));
    if (sub) { g.font = `500 ${fs * .55}px Helvetica, Arial, sans-serif`; g.fillText(sub, w / 2, h / 2 + fs * .55); }
    g.beginPath(); g.arc(30, 30, 9, 0, PI * 2); g.fillStyle = '#2a2b2e'; g.fill();
  });
  const labelTex = (key, w, h, draw) => canvasTex(`label:${key}`, w, h, draw);

  // ---- materials ----
  const std = o => new T.MeshPhysicalMaterial(o);
  const M = {
    epoxy: () => std({ color: '#1a1b1d', roughness: .55 }),
    tin: () => std({ color: '#d4d6d8', metalness: 1, roughness: .32 }),
    nickel: () => std({ color: '#c3c6c9', metalness: 1, roughness: .28, roughnessMap: brushed() }),
    stainless: () => std({ color: '#c9ccd0', metalness: 1, roughness: .24, roughnessMap: brushed() }),
    chrome: () => std({ color: '#e8eaec', metalness: 1, roughness: .06 }),
    gold: () => std({ color: '#e2b65a', metalness: 1, roughness: .22 }),
    copper: () => std({ color: '#c77a4a', metalness: 1, roughness: .3 }),
    brass: () => std({ color: '#c9a45c', metalness: 1, roughness: .3 }),
    zinc: () => std({ color: '#b8bcc0', metalness: .95, roughness: .42 }),
    blackMetal: () => std({ color: '#2a2b2d', metalness: .8, roughness: .45 }),
    steelBlack: () => std({ color: '#26272a', metalness: .3, roughness: .5, bumpMap: grain(), bumpScale: .4 }),
    rubber: (c = '#1d1e20') => std({ color: c, roughness: .92 }),
    plastic: (c = '#1f2023', r = .5) => std({ color: c, roughness: r }),
    white: () => std({ color: '#f1f0ec', roughness: .45 }),
    fr4: () => std({ color: '#c9b98a', roughness: .7 }),
    mask: (c = '#1d5a3b') => std({ color: c, roughness: .32, clearcoat: .6, clearcoatRoughness: .25 }),
    glass: (tint = '#ffffff', rough = .03) => std({ color: tint, transmission: 1, roughness: rough, ior: 1.5, thickness: 1.5, transparent: true }),
    paper: () => std({ color: '#2a2b2d', roughness: .95, bumpMap: grain(), bumpScale: .8 }),
    silk: () => std({ color: '#1e1f21', roughness: .8, sheen: 1, sheenColor: '#55585c', sheenRoughness: .5 }),
    ferrite: () => std({ color: '#2b2c2e', roughness: .85, bumpMap: grain(), bumpScale: .5 }),
    linen: () => std({ color: '#c8b07a', roughness: .9, side: T.DoubleSide }),
    kapton: () => std({ color: '#c97d1c', roughness: .35, transmission: .4, transparent: true, opacity: .9 })
  };
  const FINISH = { 'SPI A-2 (high gloss)': { r: .08, cc: .8 }, 'SPI B-1 (semi-gloss)': { r: .28, cc: .2 }, 'SPI C-1 (matte)': { r: .55 }, 'SPI D-2 (textured)': { r: .78, bump: 1.2 }, 'MT-11010 (fine texture)': { r: .7, bump: .7 }, 'soft-touch paint': { r: .88, sheen: .35 }, 'spray paint': { r: .4, cc: .25 }, 'pad print': { r: .45 }, 'anodised': { r: .34 }, 'brushed': { r: .3 }, 'none': { r: .5 } };
  const CLEAR = new Set(['PMMA (acrylic)', 'PC clear', 'Tritan', 'PETG']), RUBBER = new Set(['TPU', 'TPE', 'silicone (LSR)', 'EVA foam']);
  function matOf(p) {
    const f = FINISH[p.finish] || FINISH.none, c = p.colour;
    if (CLEAR.has(p.resin)) { const dark = /display window/i.test(p.name); return std({ color: dark ? '#3a4044' : c, transmission: dark ? .82 : .97, roughness: .03, ior: p.resin === 'PMMA (acrylic)' ? 1.49 : 1.58, thickness: Math.max(1, Math.min(...p.size)), transparent: true, clearcoat: 1, emissive: /light ring/i.test(p.name) ? '#7dffc0' : '#000000', emissiveIntensity: /light ring/i.test(p.name) ? .35 : 0 }); }
    if (RUBBER.has(p.resin)) return std({ color: c, roughness: p.resin === 'EVA foam' ? .97 : .88, bumpMap: p.resin === 'EVA foam' ? grain() : null, bumpScale: 1.5 });
    if (p.resin === 'aluminium 6061') return std({ color: c, metalness: 1, roughness: f.r ?? .34, roughnessMap: brushed() });
    if (p.resin === 'stainless 304') return M.stainless();
    if (p.resin === 'zinc (Zamak 3)') return M.zinc();
    if (p.resin === 'steel SPCC') return std({ color: c, metalness: .25, roughness: .48, bumpMap: grain(), bumpScale: .35, clearcoat: .15 });
    if (p.resin === 'MDF') { const m = std({ color: c, roughness: .62, map: woodTex() }); if (/paint/.test(p.finish)) { m.map = null; m.bumpMap = grain(); m.bumpScale = .2; m.color.set(c === '#b89a74' ? '#2b2b2d' : c); m.clearcoat = .1; } return m; }
    if (p.resin === 'bought in') return M.plastic(c, .5);
    return std({ color: c, roughness: f.r, clearcoat: f.cc || 0, clearcoatRoughness: .2, sheen: f.sheen || 0, sheenColor: '#ffffff', bumpMap: f.bump ? grain() : null, bumpScale: f.bump || 0 });
  }
  // ---- geometry helpers (mm, z up, centred) ----
  const rr = (w, d, r) => { const s = new T.Shape(); r = Math.max(0, Math.min(r, w / 2 - .005, d / 2 - .005)); const x = -w / 2, y = -d / 2;
    if (r <= .01) { s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + d); s.lineTo(x, y + d); s.closePath(); return s; }
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -PI / 2, 0, false); s.lineTo(x + w, y + d - r); s.absarc(x + w - r, y + d - r, r, 0, PI / 2, false); s.lineTo(x + r, y + d); s.absarc(x + r, y + d - r, r, PI / 2, PI, false); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, PI, PI * 1.5, false); return s; };
  const ell = (w, d) => { const s = new T.Shape(); s.absellipse(0, 0, w / 2, d / 2, 0, PI * 2, false, 0); return s; };
  const hole = sh => { const p = new T.Path(); p.setFromPoints(sh.getPoints(48)); return p; };
  function extrude(shape, h, bevel = 0) {
    const b = Math.max(0, Math.min(bevel, h / 2 - .01)), g = new T.ExtrudeGeometry(shape, { depth: Math.max(h - 2 * b, .01), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * .9, bevelOffset: -b * .9, bevelSegments: b > 0 ? 3 : 0, curveSegments: 24 });
    g.translate(0, 0, -(h - 2 * b) / 2); return g;
  }
  const rbox = (w, d, h, r = 0, bevel = 0) => extrude(rr(w, d, r), h, bevel);
  const rcyl = (w, d, h, bevel = 0) => extrude(ell(w, d), h, bevel);
  const lathe = (pts, seg = 64) => { const g = new T.LatheGeometry(pts.map(([r, z]) => new T.Vector2(Math.max(r, 0), z)), seg); g.rotateX(PI / 2); return g; };
  const mesh = (g, m, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const plane = (w, d, m, z) => { const o = new T.Mesh(new T.PlaneGeometry(w, d), m); o.position.z = z; o.receiveShadow = true; return o; };
  const between = (a, b, r, m) => { const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B), o = mesh(new T.CylinderGeometry(r, r, len, 12), m); o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return o; };
  function knurled(r, h, ridges = 90, depth = .04) {
    const g = new T.CylinderGeometry(r, r, h, ridges * 2, 1); const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), rad = Math.hypot(x, z); if (rad > r * .99) { const a = Math.atan2(z, x), k = Math.round((a + PI) / (PI * 2) * ridges * 2); const s = k % 2 ? 1 - depth : 1; pos.setX(i, x * s); pos.setZ(i, z * s); } }
    g.computeVertexNormals(); g.rotateX(PI / 2); return g;
  }
  const thread = (r, len, pitch) => { const pts = []; for (let z = 0; z <= len; z += pitch / 2) pts.push([((z / (pitch / 2)) % 2 ? r * .82 : r), -len / 2 + z]); return lathe(pts, 24); };
  const helix = (R, r, len, turns, m) => { const pts = []; for (let i = 0; i <= turns * 24; i++) { const a = i / 24 * PI * 2; pts.push(new T.Vector3(Math.cos(a) * R, Math.sin(a) * R, -len / 2 + len * i / (turns * 24))); } return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), turns * 24, r, 6), m); };
  const group = (...kids) => { const g = new T.Group(); for (const k of kids.flat()) if (k) g.add(k); return g; };

  // ---- the board: solder mask with the traces, pads, vias and silkscreen drawn under the real parts, and the passives around them ----
  const REF = { mcu: 'U', ble: 'U', wifi: 'U', dac: 'U', amp: 'U', amp2: 'U', charger: 'U', reg: 'U', preamp: 'U', hpamp: 'U', imu: 'U', env: 'U', mic: 'MK', usbc: 'J', rca: 'J', jack: 'J', iec: 'J', led: 'D', button: 'SW', encoder: 'SW', ir: 'U', pot: 'RV', antenna: 'AE' };
  function boardTex(id, w, d, comps, name) {
    return canvasTex(`board:${id}:${w}:${d}:${comps.map(c => [c.x, c.y, c.w, c.d, c.kind].map(v => typeof v === 'number' ? v.toFixed(1) : v).join(',')).join(';')}`, ...(() => { const k = Math.min(8, 2048 / Math.max(w, d)); return [Math.max(64, Math.round(w * k)), Math.max(64, Math.round(d * k))]; })(), (g, W, H) => {
      const k = W / w, X = x => (x + w / 2) * k, Y = y => (d / 2 - y) * k, r = rng(hashStr(id));
      g.fillStyle = '#1d5a3b'; g.fillRect(0, 0, W, H);
      // a ground pour, hatched lighter, inset from the edge
      g.fillStyle = 'rgba(80,160,110,.10)'; g.fillRect(1.2 * k, 1.2 * k, W - 2.4 * k, H - 2.4 * k);
      // traces: right-angled runs between neighbouring parts and out to the edge
      const pins = comps.map(c => [c.x, c.y]); g.strokeStyle = 'rgba(70,150,100,.85)'; g.lineCap = 'round';
      for (let i = 0; i < pins.length; i++) for (let n = 0; n < 3; n++) { const a = pins[i], b = pins[(i + 1 + n) % pins.length] || [w / 2 * (r() > .5 ? 1 : -1), (r() - .5) * d]; if (!b) continue; g.lineWidth = (.18 + r() * .25) * k; const o = (r() - .5) * 3; g.beginPath(); g.moveTo(X(a[0] + o), Y(a[1])); g.lineTo(X((a[0] + b[0]) / 2 + o), Y(a[1])); g.lineTo(X((a[0] + b[0]) / 2 + o), Y(b[1] + o)); g.lineTo(X(b[0]), Y(b[1] + o)); g.stroke(); }
      for (let i = 0; i < w * d / 25; i++) { const x = (r() - .5) * w * .9, y = (r() - .5) * d * .9; g.lineWidth = .15 * k; g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x + (r() - .5) * 12), Y(y)); g.lineTo(X(x + (r() - .5) * 12), Y(y + (r() - .5) * 8)); g.stroke(); }
      // vias
      for (let i = 0; i < w * d / 30; i++) { const x = X((r() - .5) * w * .92), y = Y((r() - .5) * d * .92); g.fillStyle = '#c9a44e'; g.beginPath(); g.arc(x, y, .32 * k, 0, PI * 2); g.fill(); g.fillStyle = '#123a26'; g.beginPath(); g.arc(x, y, .14 * k, 0, PI * 2); g.fill(); }
      // pads and silkscreen under each part
      const cnt = {}; g.font = `600 ${Math.max(7, 1.1 * k)}px Helvetica, Arial, sans-serif`;
      for (const c of comps) {
        const x0 = X(c.x - c.w / 2), y0 = Y(c.y + c.d / 2), cw = c.w * k, cd = c.d * k; g.fillStyle = '#d2ad57';
        if (['mcu', 'dac', 'amp', 'charger', 'preamp', 'hpamp', 'imu', 'env'].includes(c.kind)) { const n = Math.max(3, Math.round(c.w / .65)); for (let i = 0; i < n; i++) { const t = (i + .5) / n; g.fillRect(x0 + t * cw - .15 * k, y0 - .9 * k, .3 * k, .8 * k); g.fillRect(x0 + t * cw - .15 * k, y0 + cd + .1 * k, .3 * k, .8 * k); g.fillRect(x0 - .9 * k, y0 + t * cd - .15 * k, .8 * k, .3 * k); g.fillRect(x0 + cw + .1 * k, y0 + t * cd - .15 * k, .8 * k, .3 * k); } }
        else if (['ble', 'wifi'].includes(c.kind)) { const n = Math.max(4, Math.round(c.d / 1.27)); for (let i = 0; i < n; i++) { const t = (i + .5) / n; g.fillRect(x0 - .4 * k, y0 + t * cd - .4 * k, 1.1 * k, .8 * k); g.fillRect(x0 + cw - .7 * k, y0 + t * cd - .4 * k, 1.1 * k, .8 * k); } }
        else g.fillRect(x0 - .3 * k, y0 - .3 * k, cw + .6 * k, cd + .6 * k);
        g.strokeStyle = 'rgba(236,240,232,.85)'; g.lineWidth = .15 * k; g.strokeRect(x0 - 1.1 * k, y0 - 1.1 * k, cw + 2.2 * k, cd + 2.2 * k);
        const ref = REF[c.kind]; if (ref) { cnt[ref] = (cnt[ref] || 0) + 1; g.fillStyle = 'rgba(236,240,232,.9)'; g.fillText(`${ref}${cnt[ref]}`, x0, y0 - 1.6 * k); }
      }
      // mounting holes, plated, at the corners; the board's name in silkscreen
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { if (w < 20 || d < 20) break; const x = X(sx * (w / 2 - 3.2)), y = Y(sy * (d / 2 - 3.2)); g.fillStyle = '#d2ad57'; g.beginPath(); g.arc(x, y, 2.6 * k, 0, PI * 2); g.fill(); g.fillStyle = '#0d0e0f'; g.beginPath(); g.arc(x, y, 1.6 * k, 0, PI * 2); g.fill(); }
      g.fillStyle = 'rgba(236,240,232,.92)'; g.font = `600 ${Math.max(8, 1.5 * k)}px Helvetica, Arial, sans-serif`; g.fillText(`FUTURE BASICS · ${String(name || 'MAIN').toUpperCase().slice(0, 28)} · REV A`, X(-w / 2 + 4), Y(-d / 2 + 2.4));
    });
  }
  function passives(id, w, d, comps, zTop) {
    const r = rng(hashStr('p' + id)), n = Math.min(160, Math.round(w * d / 80)), out = [], busy = comps.map(c => [c.x - c.w / 2 - 1, c.x + c.w / 2 + 1, c.y - c.d / 2 - 1, c.y + c.d / 2 + 1]);
    for (let i = 0, tries = 0; i < n && tries < n * 8; tries++) { const big = r() < .3, L = big ? 1.6 : 1, Wd = big ? .8 : .5, x = (r() - .5) * (w - 6), y = (r() - .5) * (d - 6); if (busy.some(b => x > b[0] - L && x < b[1] + L && y > b[2] - L && y < b[3] + L)) continue; const near = comps.length ? comps.reduce((m, c) => Math.min(m, Math.hypot(c.x - x, c.y - y)), 1e9) : 0; if (comps.length && near > 14 && r() < .7) continue; out.push({ x, y, L, Wd, rot: r() < .5 ? 0 : PI / 2, cap: r() < .55 }); i++; }
    const g = new T.Group(); if (!out.length) return g;
    const body = new T.BoxGeometry(1, 1, 1), capM = std({ color: '#b39b74', roughness: .55 }), resM = std({ color: '#191a1b', roughness: .5 }), endM = M.tin();
    for (const [list, m] of [[out.filter(o => o.cap), capM], [out.filter(o => !o.cap), resM]]) {
      if (!list.length) continue; const im = new T.InstancedMesh(body, m, list.length), ends = new T.InstancedMesh(body, endM, list.length * 2), mt = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
      list.forEach((o, i) => { const h = o.Wd * .7; q.setFromEuler(e.set(0, 0, o.rot)); mt.compose(new T.Vector3(o.x, o.y, zTop + h / 2), q, new T.Vector3(o.L * .6, o.Wd, h)); im.setMatrixAt(i, mt);
        for (const s of [-1, 1]) { const off = new T.Vector3(s * o.L * .4, 0, 0).applyQuaternion(q); mt.compose(new T.Vector3(o.x + off.x, o.y + off.y, zTop + h / 2), q, new T.Vector3(o.L * .2, o.Wd * 1.02, h * 1.02)); ends.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), mt); } });
      im.castShadow = ends.castShadow = true; g.add(im, ends);
    }
    return g;
  }
  function pcb(p, [w, d, h], ctx) {
    const comps = ctx.comps || [], tex = boardTex(p.id, w, d, comps, ctx.name), top = std({ map: tex, roughness: .32, clearcoat: .7, clearcoatRoughness: .2 });
    // the mounting holes are cut through (M3 clearance, 3.2 mm) where the silkscreen rings are, each with a pan-head screw on a brass hex
    // standoff that the chassis boss would carry
    const holes = w >= 20 && d >= 20 ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * (w / 2 - 3.2), sy * (d / 2 - 3.2)]) : [];
    const outline = rr(w, d, p.r ?? .5); for (const [x, y] of holes) { const c = new T.Path(); c.absarc(x, y, 1.6, 0, PI * 2, true); outline.holes.push(c); }
    const g = group(mesh(extrude(outline, h, 0), [M.mask(), M.fr4()]), plane(w - .05, d - .05, top, h / 2 + .012), (() => { const b = plane(w - .05, d - .05, M.mask('#18492f'), -h / 2 - .012); b.rotation.x = PI; return b; })(), passives(p.id, w, d, comps, h / 2));
    for (const [x, y] of holes) g.add(mesh(lathe([[0, h / 2 + 1.7], [2.2, h / 2 + 1.7], [2.75, h / 2 + 1.1], [2.75, h / 2], [0, h / 2]], 32), M.zinc(), x, y, 0), mesh(new T.BoxGeometry(2.6, .5, .5), M.plastic('#050505', .9), x, y, h / 2 + 1.55), mesh(new T.BoxGeometry(.5, 2.6, .5), M.plastic('#050505', .9), x, y, h / 2 + 1.55), mesh(thread(1.45, h + 4, .5), M.zinc(), x, y, -2), mesh(new T.CylinderGeometry(2.75, 2.75, 5, 6).rotateX(PI / 2), M.brass(), x, y, -h / 2 - 2.5));
    return g;
  }
  // ---- the electronic parts ----
  const MARK = { mcu: ['STM32G0', '31K8U6'], ble: ['nRF52840', 'QIAA'], wifi: ['ESP32-S3', 'WROOM-1'], dac: ['PCM5102A', ''], amp: ['98357A', ''], amp2: ['TPA3116', 'D2'], charger: ['BQ25180', ''], reg: ['3V3', ''], preamp: ['TA7668', ''], hpamp: ['TPA6132', ''], imu: ['LSM6', ''], env: ['SHT40', ''], ir: ['', ''] };
  function chip(p, [w, d, h], kind) {
    const [a, b] = MARK[kind] || [kind.toUpperCase(), ''], bodyH = Math.max(.3, h * .85), g = group(mesh(rbox(w * .92, d * .92, bodyH, .15, Math.min(.12, bodyH / 4)), M.epoxy(), 0, 0, -h / 2 + bodyH / 2), plane(w * .9, d * .9, std({ map: markTex(a, b), roughness: .5 }), -h / 2 + bodyH + .005));
    if (kind === 'reg') { for (const [x, y] of [[-w * .3, -d / 2], [0, -d / 2], [w * .3, d / 2]]) g.add(mesh(new T.BoxGeometry(w * .14, d * .25, .15), M.tin(), x, y, -h / 2 + .1)); return g; }
    if (w >= 5 && kind === 'mcu') { const n = Math.max(6, Math.min(24, Math.round(w / .65) - 2)), m = M.tin(); for (let s = 0; s < 4; s++) for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) * (w * .8 / n), leg = mesh(new T.BoxGeometry(.2, .9, .15), m), foot = mesh(new T.BoxGeometry(.22, .45, .12), m); const ang = s * PI / 2; for (const [o, dz, dy] of [[leg, bodyH * .45, d * .46 + .45], [foot, .06, d * .46 + .95]]) { o.position.set(Math.cos(ang) * t - Math.sin(ang) * dy, Math.sin(ang) * t + Math.cos(ang) * dy, -h / 2 + dz); o.rotation.z = ang; g.add(o); } } }
    else { const m = M.tin(), n = Math.max(3, Math.round(w / .5)); for (let i = 0; i < n; i++) { const t = (i - (n - 1) / 2) * (w * .85 / n); g.add(mesh(new T.BoxGeometry(.22, .3, .08), m, t, d * .46, -h / 2 + .04), mesh(new T.BoxGeometry(.22, .3, .08), m, t, -d * .46, -h / 2 + .04)); } }
    return g;
  }
  function module_(p, [w, d, h], kind) {
    const [a, b] = MARK[kind], board = .8, canH = Math.max(.6, h - board), canW = w * .86, canD = d * .74, g = group();
    const antTex = canvasTex(`ant:${kind}`, 256, 128, (c, W, H) => { c.fillStyle = '#1e5c3a'; c.fillRect(0, 0, W, H); c.strokeStyle = '#d2ad57'; c.lineWidth = 6; c.beginPath(); c.moveTo(20, H - 20); for (let i = 0; i < 6; i++) { c.lineTo(20 + i * 36, 20); c.lineTo(38 + i * 36, 20); c.lineTo(38 + i * 36, H - 20); c.lineTo(56 + i * 36, H - 20); } c.stroke(); });
    g.add(mesh(rbox(w, d, board, .3), [M.mask('#1e5c3a'), M.fr4()], 0, 0, -h / 2 + board / 2));
    const ant = plane(w * .96, d * .2, std({ map: antTex, roughness: .35, clearcoat: .6 }), -h / 2 + board + .01); ant.position.y = d / 2 - d * .12; g.add(ant);
    g.add(mesh(rbox(canW, canD, canH, .4, .15), std({ color: '#cfd2d5', metalness: 1, roughness: .38, roughnessMap: brushed() }), 0, -d * .1, -h / 2 + board + canH / 2));
    const lbl = canvasTex(`can:${kind}`, 512, 384, (c, W, H) => { c.fillStyle = '#cfd2d5'; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(40,42,46,.85)'; c.font = '700 64px Helvetica, Arial'; c.fillText(a, 30, 120); c.font = '500 34px Helvetica, Arial'; c.fillText(b, 30, 175); c.fillText(kind === 'wifi' ? 'FCC ID: 2AC7Z-ESPS3' : 'FCC ID: 2ABCF-N52840', 30, 260); c.fillText('IC: 21098-ESPS3', 30, 310); });
    g.add(plane(canW * .9, canD * .85, std({ map: lbl, metalness: .9, roughness: .4 }), -h / 2 + board + canH + .005)).children.at(-1).position.y = -d * .1;
    return g;
  }
  function usbc(p, [w, d, h]) {
    const ow = Math.min(8.94, Math.max(w, d)), oh = Math.min(3.26, Math.min(w, d)), rot = d > w, shell = new T.Shape(); const o = rr(ow, oh, oh / 2), i = rr(ow - .5, oh - .5, (oh - .5) / 2); o.holes.push(hole(i));
    const g = group(mesh(extrude(o, h), M.stainless()), mesh(rbox(ow * .72, .7, h * .75, .1), M.plastic('#141416', .45), 0, 0, -h * .1), plane(ow * .6, .5, std({ map: canvasTex('usbpins', 256, 32, (c, W, H) => { c.fillStyle = '#141416'; c.fillRect(0, 0, W, H); c.fillStyle = '#e2b65a'; for (let k = 0; k < 12; k++) c.fillRect(6 + k * 20.5, 4, 12, H - 8); }), metalness: .6, roughness: .3 }), h * .28));
    g.children.at(-1).rotation.x = -PI / 2; g.children.at(-1).position.set(0, .36, h * .1);
    for (const s of [-1, 1]) g.add(mesh(new T.BoxGeometry(.6, 1.6, 1.2), M.tin(), s * (ow / 2 + .2), 0, -h / 2 + .6));
    if (rot) g.rotation.z = PI / 2; return g;
  }
  function tact(p, [w, d, h]) { const a = Math.min(w, d); return group(mesh(rbox(w, d, .5, .2), M.tin(), 0, 0, -h / 2 + .25), mesh(rbox(w * .86, d * .86, h * .45, .3, .1), M.plastic('#1b1c1e', .55), 0, 0, -h / 2 + .5 + h * .225), mesh(rcyl(a * .52, a * .52, h * .42, .15), M.plastic('#202124', .35), 0, 0, -h / 2 + .5 + h * .45 + h * .21), [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => mesh(new T.BoxGeometry(.7, .4, .5), M.tin(), x * (w / 2 + .1), y * d * .3, -h / 2 + .25))); }
  function led(p, [w, d, h]) { return group(mesh(rbox(w, d, h * .45, .1), M.white(), 0, 0, -h / 2 + h * .225), mesh(new T.SphereGeometry(Math.min(w, d) * .42, 24, 12, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), std({ color: '#f4fff8', transmission: .9, roughness: .05, ior: 1.5, thickness: .6, transparent: true, emissive: '#7dffc0', emissiveIntensity: .6 }), 0, 0, -h / 2 + h * .45)); }
  function mic(p, [w, d, h]) { return group(mesh(rbox(w, d, h * .3, .2), M.mask(), 0, 0, -h / 2 + h * .15), mesh(rbox(w * .92, d * .92, h * .7, .3, .08), M.tin(), 0, 0, -h / 2 + h * .3 + h * .35), mesh(new T.CircleGeometry(Math.min(w, d) * .12, 16), M.plastic('#050505', .9), 0, 0, h / 2 + .005)); }
  function pouch(p, [w, d, h]) {
    const g = group(mesh(rbox(w, d * .92, h, Math.min(w, d) * .05, h * .45), std({ color: '#c7c9cc', metalness: .7, roughness: .38, roughnessMap: brushed() }), 0, -d * .04, 0));
    const mah = p.elec?.mah || 1000, lbl = labelTex(`cell:${mah}`, 512, 512, (c, W, H) => { c.fillStyle = '#e9ebee'; c.fillRect(0, 0, W, H); c.fillStyle = '#2b2d31'; c.font = '700 54px Helvetica, Arial'; c.fillText('Li-ion Polymer', 36, 100); c.font = '600 72px Helvetica, Arial'; c.fillText(`3.7V ${mah}mAh`, 36, 200); c.font = '500 40px Helvetica, Arial'; c.fillText(`${(mah * 3.7 / 1000).toFixed(2)}Wh · 1S1P`, 36, 270); c.fillText('UN38.3 · IEC 62133-2', 36, 330); c.strokeStyle = '#2b2d31'; c.lineWidth = 6; c.strokeRect(36, 380, 90, 90); c.font = '700 60px Helvetica'; c.fillText('!', 70, 448); c.fillStyle = '#c0392b'; c.fillRect(W - 180, 400, 140, 50); });
    g.add(plane(w * .8, d * .7, std({ map: lbl, roughness: .45 }), h / 2 + .02)); g.children.at(-1).position.y = -d * .05;
    g.add(mesh(new T.BoxGeometry(w * .9, d * .08, h * .3), std({ color: '#d7c48f', roughness: .5 }), 0, d / 2 - d * .06, 0));
    g.add(mesh(rbox(w * .5, d * .06, 1, .3), M.mask(), 0, d / 2 - d * .03, h * .2), mesh(new T.BoxGeometry(w * .52, d * .065, .12), M.kapton(), 0, d / 2 - d * .03, h * .2 + .55));
    for (const s of [-1, 1]) g.add(mesh(new T.BoxGeometry(3, d * .1, .15), M.nickel(), s * w * .18, d / 2 - d * .02, h * .25));
    return g;
  }
  function aaHolder(p, [w, d, h]) {
    const along = d >= w ? 'y' : 'x', L = Math.max(w, d), Wd = Math.min(w, d), g = group(), tray = rr(along === 'y' ? w : w, along === 'y' ? d : d, 1); tray.holes.push(hole(rr(w - 1.6, d - 1.6, .6)));
    g.add(mesh(extrude(tray, h * .7), M.plastic('#1a1b1d', .55), 0, 0, -h * .15), mesh(rbox(w, d, 1, 1), M.plastic('#1a1b1d', .55), 0, 0, -h / 2 + .5));
    const cellR = Math.min(Wd / 4 - .2, h / 2 - .6), cellL = L - 6, wrap = labelTex('aa', 512, 256, (c, W, H) => { const gr = c.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#2b2d31'); gr.addColorStop(.62, '#2b2d31'); gr.addColorStop(.62, '#c9a24a'); gr.addColorStop(1, '#e2bf6a'); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.save(); c.translate(W * .3, H / 2); c.rotate(-PI / 2); c.fillStyle = '#e9e9e9'; c.font = '700 36px Helvetica'; c.textAlign = 'center'; c.fillText('AA 1.5V', 0, 0); c.font = '500 22px Helvetica'; c.fillText('LR6 ALKALINE', 0, 30); c.restore(); });
    for (const s of [-1, 1]) {
      const cell = group(mesh(new T.CylinderGeometry(cellR, cellR, cellL, 48, 1), std({ map: wrap, roughness: .35, clearcoat: .5 })), mesh(new T.CylinderGeometry(cellR * .35, cellR * .35, 1.2, 24), M.nickel(), 0, cellL / 2 + .6, 0), mesh(new T.CylinderGeometry(cellR * .98, cellR * .98, .4, 32), M.nickel(), 0, -cellL / 2 - .2, 0));
      cell.rotation.z = along === 'y' ? 0 : PI / 2; if (along === 'y') cell.rotation.x = 0; cell.position.set(along === 'y' ? s * Wd / 4 : 0, along === 'y' ? 0 : s * Wd / 4, -h / 2 + 1 + cellR); if (along === 'y') { cell.rotation.set(0, 0, 0); } g.add(cell);
      const spring = helix(cellR * .55, .25, 3, 4, M.nickel()); spring.rotation.x = PI / 2; spring.position.set(along === 'y' ? s * Wd / 4 : -L / 2 + 2.2, along === 'y' ? -L / 2 + 2.2 : s * Wd / 4, -h / 2 + 1 + cellR); if (along !== 'y') spring.rotation.set(0, PI / 2, 0); g.add(spring);
    }
    return g;
  }
  // a cone driver: basket, cone, rubber surround, dust cap, the yellow spider behind, a ferrite magnet with its plates, terminals
  function driver(p, [w, d, h], tweeter = false) {
    const R = Math.min(w, d) / 2, g = group(), z0 = h / 2;
    if (tweeter) {
      g.add(mesh(lathe([[R * .98, z0 - 3], [R, z0 - 1.2], [R * .92, z0], [R * .42, z0], [R * .38, z0 - 2], [R * .37, z0 - 3]], 96), M.plastic('#17181a', .45)));
      g.add(mesh(lathe([[R * .42, z0 - .2], [R * .34, z0 - 1.6], [R * .3, z0 - 1.7]]), M.plastic('#2a2b2e', .3)));
      g.add(mesh(new T.SphereGeometry(R * .3, 48, 16, 0, PI * 2, 0, PI / 2.6).rotateX(PI / 2), M.silk(), 0, 0, z0 - 1.8 - R * .3 * Math.cos(PI / 2.6)));
      g.add(mesh(rcyl(R * 1.1, R * 1.1, h * .45, .4), M.ferrite(), 0, 0, -h / 2 + h * .225), mesh(rcyl(R * 1.12, R * 1.12, 1, .2), M.chrome(), 0, 0, -h / 2 + h * .45));
      return g;
    }
    const cz = z0 - h * .38, mz = -h / 2 + h * .14;
    g.add(mesh(lathe([[R * .86, z0 - 1.4], [R, z0 - 1.4], [R, z0 - .2], [R * .97, z0], [R * .86, z0]], 96), M.blackMetal()));
    g.add(mesh(lathe([[R * .74, z0 - 1], ...Array.from({ length: 13 }, (_, i) => { const a = PI - i / 12 * PI; return [R * .8 + Math.cos(a) * R * .06, z0 - 1 + Math.sin(a) * R * .06]; }), [R * .86, z0 - 1]], 96), M.rubber('#1a1b1d')));
    const cone = mesh(lathe([[R * .74, z0 - 1.1], [R * .55, z0 - h * .15], [R * .36, cz + 2], [R * .3, cz]], 96), M.paper()); cone.material.side = T.DoubleSide; g.add(cone);
    g.add(mesh(new T.SphereGeometry(R * .34, 48, 16, 0, PI * 2, 0, PI / 3.2).rotateX(PI / 2), std({ color: '#26272a', roughness: .35, clearcoat: .6 }), 0, 0, cz + 1 - R * .34 * Math.cos(PI / 3.2)));
    g.add(mesh(lathe(Array.from({ length: 15 }, (_, i) => [R * .3 + i / 14 * R * .32, cz - 3 + (i % 2 ? .9 : 0)]), 64), M.linen()));
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; g.add(between([Math.cos(a) * R * .9, Math.sin(a) * R * .9, z0 - 1.6], [Math.cos(a) * R * .38, Math.sin(a) * R * .38, mz + h * .14], Math.max(.8, R * .045), M.blackMetal())); }
    g.add(mesh(lathe([[R * .3, mz + h * .14], [R * .5, mz + h * .14], [R * .5, mz + h * .15], [R * .3, mz + h * .15]], 64), M.blackMetal()));
    g.add(mesh(rcyl(R * .95, R * .95, h * .2, .6), M.ferrite(), 0, 0, mz), mesh(rcyl(R * .97, R * .97, 1.4, .2), M.zinc(), 0, 0, mz + h * .1 + .7), mesh(rcyl(R * .97, R * .97, 1.4, .2), M.zinc(), 0, 0, mz - h * .1 - .7));
    g.add(mesh(rcyl(R * .22, R * .22, 1.2, .2), M.chrome(), 0, 0, mz - h * .1 - 1.6));
    for (const [s, c] of [[-1, '#c0392b'], [1, '#141416']]) g.add(mesh(new T.BoxGeometry(2.5, 1.2, 4), std({ color: c, roughness: .4 }), s * R * .2, R * .86, z0 - 4));
    return g;
  }
  function amp2(p, [w, d, h]) {
    const b = 1.2, g = group(mesh(rbox(w, d, b, .4), [M.mask(), M.fr4()], 0, 0, -h / 2 + b / 2)), hz = -h / 2 + b, sinkH = h - b - 1.2, fins = Math.max(6, Math.round(w / 2.2)), sinkM = std({ color: '#1c1d20', metalness: .7, roughness: .45 });
    g.add(chip(p, [w * .32, d * .38, 1.2], 'amp2').translateZ(hz + .6 + h / 2 - 1.2 / 2 - (h / 2 - .6)).translateY(0));
    g.add(mesh(new T.BoxGeometry(w * .9, d * .6, 1.4), sinkM, 0, 0, hz + 1.2 + .7));
    for (let i = 0; i < fins; i++) g.add(mesh(new T.BoxGeometry(.9, d * .6, sinkH - 1.4), sinkM, -w * .45 + (i + .5) * (w * .9 / fins), 0, hz + 1.2 + 1.4 + (sinkH - 1.4) / 2));
    for (const s of [-1, 1]) g.add(mesh(rbox(5, 5, 3, .5, .3), M.plastic('#2d2e31', .5), s * w * .38, -d * .38, hz + 1.5));
    return g;
  }
  function psu(p, [w, d, h]) {
    const b = 1.6, z = -h / 2 + b, g = group(mesh(rbox(w, d, b, 1), [M.mask('#22543a'), M.fr4()], 0, 0, -h / 2 + b / 2));
    const tH = Math.min(h - b - 1, 22), tw = Math.min(w * .3, 26), td = Math.min(d * .45, 22);
    g.add(mesh(new T.BoxGeometry(tw, td * .55, tH), std({ color: '#5b5e62', metalness: .8, roughness: .5 }), -w * .12, 0, z + tH / 2));
    g.add(mesh(rbox(tw * .7, td, tH * .7, 1.5, .8), std({ color: '#e7c84a', roughness: .5 }), -w * .12, 0, z + tH * .55));
    const capTop = labelTex('captop', 128, 128, (c, W, H) => { c.fillStyle = '#c8cbcf'; c.fillRect(0, 0, W, H); c.strokeStyle = '#8d9196'; c.lineWidth = 6; c.beginPath(); c.moveTo(W / 2, 10); c.lineTo(W / 2, H - 10); c.moveTo(10, H / 2); c.lineTo(W - 10, H / 2); c.stroke(); });
    const sleeve = labelTex('capsleeve', 512, 128, (c, W, H) => { c.fillStyle = '#1b2a4a'; c.fillRect(0, 0, W, H); c.fillStyle = '#c9ced6'; c.fillRect(W * .82, 0, W * .08, H); c.font = '600 30px Helvetica'; c.fillText('470µF 25V 105°C', 30, H / 2 + 10); });
    for (const [x, y, r, hh] of [[w * .22, d * .22, 5, Math.min(h - b - 1, 16)], [w * .32, -d * .22, 4, Math.min(h - b - 1, 13)]]) { const cap = group(mesh(new T.CylinderGeometry(r, r, hh, 40), std({ map: sleeve, roughness: .35, clearcoat: .7 })), (() => { const t = mesh(new T.CircleGeometry(r * .98, 40), std({ map: capTop, metalness: .9, roughness: .3 })); t.rotation.x = -PI / 2; t.position.y = hh / 2 + .01; return t; })()); cap.rotation.x = PI / 2; cap.position.set(x, y, z + hh / 2); g.add(cap); }
    g.add(mesh(rcyl(7, 3, 6, .5), std({ color: '#2a5fa8', roughness: .4 }), w * .05, -d * .3, z + 3));
    const fuse = group(mesh(new T.CylinderGeometry(1.2, 1.2, 14, 24), M.glass('#ffffff')), mesh(new T.CylinderGeometry(1.3, 1.3, 3, 24), M.nickel(), 0, 6, 0), mesh(new T.CylinderGeometry(1.3, 1.3, 3, 24), M.nickel(), 0, -6, 0), mesh(new T.CylinderGeometry(.15, .15, 9, 8), M.copper()));
    fuse.rotation.z = PI / 2; fuse.position.set(-w * .38, -d * .32, z + 2); g.add(fuse);
    g.add(mesh(rbox(8, 6, 8, .4), std({ color: '#2f7d4a', roughness: .5 }), -w * .42, d * .3, z + 4));
    g.add(mesh(new T.BoxGeometry(2, d * .5, Math.min(h - b - 1, 14)), std({ color: '#b7bbc0', metalness: 1, roughness: .35, roughnessMap: brushed() }), w * .42, 0, z + Math.min(h - b - 1, 14) / 2));
    return g;
  }
  function iec(p, [w, d, h]) {
    const s = new T.Shape(); { const a = Math.min(w, d) * .28; s.absarc(-a * .55, 0, a * .55, PI / 2, PI * 1.5, false); s.lineTo(a * .55, -a * .55); s.absarc(a * .55, 0, a * .55, -PI / 2, PI / 2, false); s.closePath(); }
    return group(mesh(rbox(w * .8, d * .8, h * .8, 1.5, .5), M.plastic('#161718', .55), 0, 0, -h * .1), mesh(rbox(w, d, 1.6, 2, .4), M.plastic('#161718', .5), 0, 0, h / 2 - .8), mesh(extrude(s, 6), M.plastic('#0b0b0c', .9), 0, 0, h / 2 - 2.6), [-1, 1].map(k => mesh(new T.CylinderGeometry(.75, .75, 6, 16).rotateX(PI / 2), M.brass(), k * Math.min(w, d) * .155, 0, h / 2 - 3.5)));
  }
  function rca(p, [w, d, h]) {
    const along = w >= d ? 'x' : 'y', L = Math.max(w, d), g = group(mesh(rbox(w, d, h * .55, 1, .4), M.plastic('#141416', .5), 0, 0, -h / 2 + h * .275));
    [['#c0392b', -1], ['#f1f0ec', 1]].forEach(([c, s]) => { const x = along === 'x' ? s * L / 4 : 0, y = along === 'y' ? s * L / 4 : 0; const R = Math.min(L / 4 - .5, Math.min(w, d) / 2 - .3);
      g.add(mesh(rcyl(R * 2, R * 2, 1.2, .2), std({ color: c, roughness: .4 }), x, y, -h / 2 + h * .55 + .6));
      g.add(mesh(lathe([[R * .55, -h / 2 + h * .55], [R * .62, -h / 2 + h * .55], [R * .62, h / 2 - .4], [R * .56, h / 2], [R * .38, h / 2], [R * .36, h / 2 - 3]], 48), M.gold(), x, y, 0));
      g.add(mesh(new T.CylinderGeometry(R * .14, R * .14, h * .6, 16).rotateX(PI / 2), M.gold(), x, y, h * .1)); });
    return g;
  }
  function jack(p, [w, d, h]) { const R = Math.min(w, d) / 2; return group(mesh(rbox(w, d, h * .8, .6, .3), M.plastic('#141416', .5), 0, 0, -h * .1), mesh(lathe([[R * .4, h / 2 - h * .2], [R * .8, h / 2 - h * .2], [R * .8, h / 2], [R * .4, h / 2]], 32), M.nickel()), mesh(new T.CircleGeometry(R * .38, 24), M.plastic('#050505', .9), 0, 0, h / 2 + .01)); }
  function encoder(p, [w, d, h]) { const a = Math.min(w, d); return group(mesh(rbox(a, a, h * .35, .5), M.tin(), 0, 0, -h / 2 + h * .175), mesh(rbox(a * .9, a * .9, h * .15, .5), M.plastic('#1b1c1e', .5), 0, 0, -h / 2 + h * .42), mesh(thread(a * .3, h * .2, .7), M.nickel(), 0, 0, -h / 2 + h * .6), mesh(knurled(a * .22, h * .3, 18, .08), M.nickel(), 0, 0, h / 2 - h * .15)); }
  function wheel(p, [w, d, h]) { const R = Math.min(Math.max(w, d), h * 2) / 2, k = mesh(knurled(R, Math.min(w, d), 60, .05), M.plastic('#202124', .45)); k.rotation.y = PI / 2; return group(k); }
  function irRx(p, [w, d, h]) { return group(mesh(rbox(w * .9, d * .6, h * .8, .4, .2), M.plastic('#121314', .3), 0, -d * .1, -h * .1), mesh(new T.SphereGeometry(Math.min(w, h) * .25, 24, 12, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), M.plastic('#0d0e10', .15), 0, d * .2, 0), mesh(new T.BoxGeometry(w, .2, h * .9), M.tin(), 0, -d * .45, 0), [-1, 0, 1].map(k => mesh(new T.BoxGeometry(.4, .3, 2), M.tin(), k * w * .3, 0, -h / 2 - .6))); }
  const screenTex = (kind, title) => labelTex(`scr:${kind}:${title}`, 1024, 512, (c, W, H) => {
    c.fillStyle = '#050608'; c.fillRect(0, 0, W, H);
    if (kind === 'vfd') { c.fillStyle = '#1a3d38'; for (let x = 20; x < W - 20; x += 46) c.fillRect(x, 120, 38, 270); c.shadowColor = '#3ff2d0'; c.shadowBlur = 18; c.fillStyle = '#5ff7dc'; c.font = '600 190px "Courier New", monospace'; c.fillText('03 12:48', 40, 360); c.font = '600 60px Helvetica'; c.fillText('▶ PLAY  CD  TRACK', 40, 100); }
    else if (kind === 'oled') { c.fillStyle = '#e8f6ff'; c.font = '600 150px Helvetica'; c.fillText('12:48', 60, 220); c.font = '500 54px Helvetica'; c.fillText('Wed 30 Oct · 18°C', 60, 330); c.fillRect(60, 400, 600, 10); c.fillStyle = '#4bff9a'; c.fillRect(60, 400, 380, 10); }
    else { const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#1f3a5f'); gr.addColorStop(1, '#4bff9a'); c.fillStyle = gr; c.fillRect(30, 30, H - 60, H - 60); c.fillStyle = '#ffffff'; c.font = '700 64px Helvetica'; c.fillText(title || 'Now playing', H, 170); c.font = '500 44px Helvetica'; c.fillStyle = '#b8c4d0'; c.fillText('Future Basics · Side A', H, 250); c.fillStyle = '#3a4250'; c.fillRect(H, 330, 420, 10); c.fillStyle = '#ffffff'; c.fillRect(H, 330, 250, 10); }
  });
  function screen(p, [w, d, h], kind) {
    const g = group(), e = screenTex(kind, ''), glow = std({ color: '#000000', emissive: '#ffffff', emissiveMap: e, emissiveIntensity: kind === 'vfd' ? 1.4 : 1.1, roughness: .2 });
    if (kind === 'vfd') { g.add(mesh(rbox(w, d, h * .35, .6), M.plastic('#0c0d0e', .6), 0, 0, -h / 2 + h * .175), plane(w * .92, d * .8, glow, -h / 2 + h * .36), mesh(rbox(w, d, h * .65, d * .3, .6), std({ color: '#cfe8ff', transmission: .92, roughness: .04, ior: 1.5, thickness: 1, transparent: true, clearcoat: 1 }), 0, 0, h / 2 - h * .325)); for (let i = 0; i < 3; i++) g.add(between([-w * .46, -d * .25 + i * d * .25, -h / 2 + h * .5], [w * .46, -d * .25 + i * d * .25, -h / 2 + h * .5], .05, M.blackMetal())); return g; }
    g.add(mesh(rbox(w, d, h * .6, .6, .2), kind === 'lcd' ? M.stainless() : M.plastic('#0d0e10', .4), 0, 0, -h / 2 + h * .3), plane(w * .94, d * .9, glow, -h / 2 + h * .62), mesh(rbox(w * .98, d * .96, h * .3, .4, .05), std({ color: '#0a0b0c', transmission: .55, roughness: .02, clearcoat: 1, transparent: true, opacity: .55 }), 0, 0, h / 2 - h * .15), mesh(new T.BoxGeometry(w * .4, d * .3, .15), M.kapton(), 0, -d / 2 - d * .1, -h / 2 + .1));
    return g;
  }
  function motor(p, [w, d, h]) { const R = Math.min(w, d) / 2; return group(mesh(rcyl(R * 2, R * 2, h * .7, .3), M.nickel(), 0, 0, -h * .15), mesh(new T.CylinderGeometry(R * .9, R * .9, h * .25, 32, 1, false, 0, PI).rotateX(PI / 2), M.brass(), 0, 0, h / 2 - h * .125)); }
  // the tray (with the disc on it) slides out toward the product's front as the view pulls apart, so the laser sled on its rails shows
  function cdLoader(p, [w, d, h], ctx = {}) {
    const g = group(), fH = h * .55, frame = rr(w, d, 2); frame.holes.push(hole(rr(w - 3, d - 3, 1.2)));
    g.add(mesh(extrude(frame, fH, .3), M.zinc(), 0, 0, -h / 2 + fH / 2), mesh(rbox(w, d, 1, 2), M.zinc(), 0, 0, -h / 2 + .5));
    const trayG = new T.Group(), f = ctx.front || [0, -1, 0], along = Math.abs(f[0]) > Math.abs(f[1]) ? [Math.sign(f[0]), 0] : [0, Math.sign(f[1]) || -1], reach = (along[0] ? w : d) * .8;
    g.userData.explode = t => trayG.position.set(along[0] * reach * t, along[1] * reach * t, 0); g.add(trayG);
    const tray = rr(w * .9, d * .95, 3); trayG.add(mesh(extrude(tray, 4, .4), M.plastic('#141416', .45), 0, -d * .02, h / 2 - 6));
    const R = Math.min(60, Math.min(w, d) * .42), cx = 0, cy = -d * .02, cz = h / 2 - 3.4;
    trayG.add(mesh(lathe([[R + 1.5, cz - 1.8], [R + 1.5, cz - .6]], 96), M.plastic('#0b0b0c', .6), cx, cy, 0));
    const disc = mesh(lathe([[7.5, -.6], [R, -.6], [R, .6], [7.5, .6]], 128), std({ color: '#d9dde2', metalness: 1, roughness: .12, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessMinimum: 180, iridescenceThicknessMaximum: 620, clearcoat: 1 }), cx, cy, cz);
    const label = mesh(new T.RingGeometry(R * .38, R * .985, 128), std({ map: labelTex('cdlabel', 1024, 1024, (c, W, H) => { const gr = c.createRadialGradient(W / 2, H / 2, W * .18, W / 2, H / 2, W / 2); gr.addColorStop(0, '#141416'); gr.addColorStop(1, '#2a2d33'); c.fillStyle = gr; c.fillRect(0, 0, W, H); c.fillStyle = '#4bff9a'; c.font = '700 70px Helvetica'; c.textAlign = 'center'; c.fillText('FUTURE BASICS', W / 2, H * .3); c.fillStyle = '#c9ced6'; c.font = '500 40px Helvetica'; c.fillText('COMPACT DISC · DIGITAL AUDIO', W / 2, H * .78); }), roughness: .4 }), cx, cy, cz + .62);
    trayG.add(disc, label, mesh(rcyl(15, 15, 1.4, .3), M.glass('#ffffff', .1), cx, cy, cz));
    const sx = w * .32, rails = [-1, 1].map(s => between([sx + s * 7, -d * .4, -h / 2 + fH * .6], [sx + s * 7, d * .25, -h / 2 + fH * .6], .9, M.chrome()));
    g.add(...rails, mesh(rbox(16, 12, 6, 1, .3), M.plastic('#1b1c1e', .45), sx, -d * .18, -h / 2 + fH * .6 + 1.5), mesh(new T.SphereGeometry(2.4, 24, 12, 0, PI * 2, 0, PI / 2).rotateX(PI / 2), std({ color: '#2f5bd4', transmission: .7, roughness: .02, metalness: .3, ior: 1.7, thickness: 1, transparent: true }), sx, -d * .18, -h / 2 + fH * .6 + 4.6));
    g.add(mesh(rcyl(14, 14, 10, .4), M.nickel(), cx, cy, -h / 2 + 6), mesh(rcyl(18, 18, 2, .2), std({ color: '#f2f0ea', roughness: .5 }), -w * .36, d * .32, -h / 2 + fH - 3), mesh(new T.BoxGeometry(14, d * .5, .15), M.kapton(), -w * .3, -d * .05, -h / 2 + 1.2));
    return g;
  }
  function tapeTransport(p, [w, d, h]) {
    const g = group(), plateZ = -h / 2 + .5, cassH = Math.min(12, h * .7), cz = h / 2 - cassH / 2 - .5, cw = Math.min(w * .98, 100.4), cd = Math.min(d * .98, 63.8);
    g.add(mesh(rbox(w, d, 1, 2), M.zinc(), 0, 0, plateZ));
    const shell = mesh(rbox(cw, cd, cassH, 2, .6), std({ color: '#7d8a96', transmission: .9, roughness: .08, ior: 1.55, thickness: 1.2, transparent: true, clearcoat: 1 }), 0, 0, cz); g.add(shell);
    const lbl = labelTex('cassette', 1024, 640, (c, W, H) => { c.fillStyle = '#f1efe8'; c.fillRect(0, 0, W, H); c.fillStyle = '#4bff9a'; c.fillRect(0, 0, W, 90); c.fillStyle = '#141416'; c.font = '700 64px Helvetica'; c.fillText('A', 30, 70); c.font = '600 40px Helvetica'; c.fillText('C-60  ·  FUTURE BASICS MIX', 110, 66); c.strokeStyle = '#c9c4b8'; c.lineWidth = 3; for (let y = 160; y < 520; y += 60) { c.beginPath(); c.moveTo(40, y); c.lineTo(W - 40, y); c.stroke(); } c.clearRect(W * .18, 250, W * .64, 200); c.fillStyle = 'rgba(0,0,0,0)'; });
    const lp = plane(cw * .9, cd * .62, std({ map: lbl, roughness: .55, transparent: true, alphaTest: .5 }), cz + cassH / 2 + .01); lp.position.y = cd * .1; g.add(lp);
    for (const s of [-1, 1]) { const x = s * cw * .21, tape = mesh(rcyl(cw * (s < 0 ? .2 : .13), cw * (s < 0 ? .2 : .13), cassH * .55, .2), std({ color: '#3a2a1e', roughness: .25, metalness: .2 }), x, cd * .02, cz); const hub = mesh(lathe(Array.from({ length: 13 }, (_, i) => [i % 2 ? 4.2 : 5, -cassH * .3 + i * cassH * .05]), 6), M.white(), x, cd * .02, cz); g.add(tape, hub); }
    g.add(mesh(rbox(5, 3, 4, .5, .3), M.chrome(), 0, -cd / 2 - .5, cz - cassH * .2), mesh(rcyl(5, 5, 7, .4).rotateX(PI / 2), M.rubber(), cw * .3, -cd / 2 - 1.5, cz - cassH * .2), between([cw * .37, -cd / 2 - 1.5, cz - cassH / 2], [cw * .37, -cd / 2 - 1.5, cz + cassH * .1], .6, M.chrome()));
    g.add(mesh(rcyl(22, 22, 1.4, .3), M.brass(), cw * .3, cd * .25, plateZ - 1.2), mesh(rcyl(12, 12, 9, .4), M.nickel(), -cw * .36, -cd * .32, plateZ - 5));
    return g;
  }
  function antenna(p, [w, d, h]) { const R = Math.min(w, d) / 2; return group(mesh(lathe([[R * .75, -h / 2], [R * .75, -h / 2 + h * .2]], 6), M.gold()), mesh(rcyl(R * 1.1, R * 1.1, h * .12, .3), M.chrome(), 0, 0, -h / 2 + h * .26), mesh(lathe([[R * .9, -h / 2 + h * .32], [R * .8, h / 2 - R * .6], [R * .5, h / 2 - .4], [0, h / 2]], 48), M.rubber('#151618'))); }
  function screw(p, [w, d, h]) { const r = Math.min(w, d) / 2, hz = h / 2, head = mesh(lathe([[0, hz], [r * 1.6, hz], [r * 1.9, hz - r * .5], [r * 1.9, hz - r * .9], [r * .8, hz - r * .9]], 32), M.blackMetal()); return group(head, mesh(thread(r, h - r, Math.max(.35, r * .45)), M.blackMetal(), 0, 0, -r * .45), mesh(new T.BoxGeometry(r * 1.8, r * .35, r * .5), M.plastic('#050505', .9), 0, 0, hz - .2), mesh(new T.BoxGeometry(r * .35, r * 1.8, r * .5), M.plastic('#050505', .9), 0, 0, hz - .2)); }
  const ELEC = {
    ble: (p, s) => module_(p, s, 'ble'), wifi: (p, s) => module_(p, s, 'wifi'), mcu: (p, s) => chip(p, s, 'mcu'), dac: (p, s) => chip(p, s, 'dac'), amp: (p, s) => chip(p, s, 'amp'), charger: (p, s) => chip(p, s, 'charger'), reg: (p, s) => chip(p, s, 'reg'),
    preamp: (p, s) => chip(p, s, 'preamp'), hpamp: (p, s) => chip(p, s, 'hpamp'), imu: (p, s) => chip(p, s, 'imu'), env: (p, s) => chip(p, s, 'env'), usbc, led, button: tact, mic, battery: pouch, aa: aaHolder,
    speaker: (p, s) => driver(p, s), woofer: (p, s) => driver(p, s), tweeter: (p, s) => driver(p, s, true), amp2, psu, iec, rca, jack, encoder, pot: wheel, ir: irRx, vfd: (p, s) => screen(p, s, 'vfd'), oled: (p, s) => screen(p, s, 'oled'), lcd: (p, s) => screen(p, s, 'lcd'),
    motor, cdmech: (p, s, c) => cdLoader(p, s, c), tapemech: tapeTransport, antenna
  };
  // ---- the mechanical parts ----
  function housing(p, [w, d, h], m) {
    const round = ['cup', 'ring'].includes(p.shape), t = Math.min(p.wall || 2, Math.min(w, d) / 2 - .3), r = p.r ?? 2, out = round ? ell(w, d) : rr(w, d, r), inn = round ? ell(w - 2 * t, d - 2 * t) : rr(w - 2 * t, d - 2 * t, Math.max(r - t, .2));
    const ring = round ? ell(w, d) : rr(w, d, r); ring.holes.push(hole(inn)); const bev = Math.min(.8, t * .35), g = group(mesh(extrude(ring, h, bev), m));
    if (p.shape === 'ring') { if (/port/i.test(p.name)) g.add(mesh(lathe([[w / 2 - t, h / 2], [w / 2 + 4, h / 2 + .01], [w / 2 + 4, h / 2 - 1.5], [w / 2, h / 2 - 3]], 64), m)); return g; }
    const zf = p.open === '-' ? h / 2 - t / 2 : -h / 2 + t / 2; g.add(mesh(extrude(out, t, bev), m, 0, 0, zf));
    // the bosses and ribs a moulder puts inside a housing, so an exploded housing reads as moulded, not a box
    if (!round && w > 24 && d > 24 && h > 6 && p.process !== 'CNC routed' && !/grille/i.test(p.name)) { const bh = (h - t) * .65, sgn = p.open === '-' ? -1 : 1, z0 = zf + sgn * (t / 2 + bh / 2);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sx * (w / 2 - t - 4.5), y = sy * (d / 2 - t - 4.5); g.add(mesh(lathe([[1.1, -bh / 2], [2.6, -bh / 2], [2.4, bh / 2], [1.1, bh / 2]], 24), m, x, y, z0)); }
      g.add(mesh(new T.BoxGeometry(w - 2 * t, Math.max(.8, t * .55), bh * .6), m, 0, 0, zf + sgn * (t / 2 + bh * .3))); }
    return g;
  }
  function mech(p, dims) {
    const [w, d, h] = dims, m = matOf(p);
    if (/screw/i.test(p.name)) return screw(p, dims);
    if (/knob/i.test(p.name) && ['cyl'].includes(p.shape)) { const R = Math.min(w, d) / 2, k = mesh(knurled(R, h * .75, 120, .02), m, 0, 0, -h * .125), top = mesh(lathe([[0, h / 2], [R * .92, h / 2], [R, h / 2 - h * .25 + .2]], 96), std({ color: p.colour, metalness: 1, roughness: .18 })); return group(k, top, mesh(new T.BoxGeometry(.8, R * .5, .3), M.plastic('#ffffff', .4), 0, R * .55, h / 2 + .05)); }
    if (/grille/i.test(p.name)) { const g = housing(p, dims, M.plastic('#141416', .6)), f = std({ map: fabricTex(), roughness: 1, sheen: .6, sheenColor: '#6a6d72' }); f.map.repeat.set(w / 8, d / 8); const fw = w - 2 * (p.wall || 2), fd = d - 2 * (p.wall || 2), cloth = new T.Mesh(['cup', 'ring'].includes(p.shape) ? new T.CircleGeometry(.5, 96).scale(fw, fd, 1) : new T.PlaneGeometry(fw, fd), f); cloth.position.z = (p.open === '-' ? 1 : -1) * (h / 2 + .05); cloth.receiveShadow = true; g.add(cloth); if (p.open !== '-') g.children.at(-1).rotation.x = PI; return g; }
    if (/^keys$|keypad/i.test(p.name)) { const g = group(mesh(rbox(w, d, Math.min(1.2, h * .4), 1), m, 0, 0, -h / 2 + .6)), n = Math.max(2, Math.round(w / Math.max(d, 8))), rows = Math.max(1, Math.round(d / 12)), sym = ['▶', '■', '◀◀', '▶▶', '●', '❚❚'];
      for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) { const kw = w / n - 1.4, kd = d / rows - 1.4, x = -w / 2 + (i + .5) * w / n, y = -d / 2 + (r + .5) * d / rows; g.add(mesh(rbox(kw, kd, h * .75, Math.min(kw, kd) * .25, Math.min(.6, h * .2)), m, x, y, -h / 2 + 1.2 + h * .375 - .6)); const lab = plane(kw * .7, kd * .7, std({ map: labelTex(`key:${sym[(r * n + i) % sym.length]}`, 128, 128, (c, W, H) => { c.clearRect(0, 0, W, H); c.fillStyle = '#e8e8e4'; c.font = '700 64px Helvetica'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(sym[(r * n + i) % sym.length], W / 2, H / 2); }), transparent: true, roughness: .5 }), h / 2 + .02); lab.position.x = x; lab.position.y = y; g.add(lab); }
      return g; }
    if (p.shape === 'pcb') return null;
    if (['shell', 'cup', 'ring'].includes(p.shape)) return housing(p, dims, m);
    if (p.shape === 'ball') return group(mesh(new T.SphereGeometry(.5, 64, 32).scale(w, d, h), m));
    if (p.shape === 'cyl') { const b = Math.min(1, h / 4, Math.min(w, d) / 6); return group(mesh(rcyl(w, d, h, b), m)); }
    const b = Math.min(/panel|baffle|cabinet/i.test(p.name) ? 1.6 : .8, h / 4, Math.min(w, d) / 6); return group(mesh(rbox(w, d, h, p.r ?? 1, b), m));
  }
  // ---- placing a part: its own frame (face toward +z) turned into the world, at its centre ----
  function frameOf(p, face) {
    const ax = { x: 0, y: 1, z: 2 }, A = ['x', 'y', 'z'], Z = new T.Vector3(...[0, 1, 2].map(k => A[k] === face.axis ? face.sign : 0)), xi = A.find(a => a !== face.axis), X = new T.Vector3(...[0, 1, 2].map(k => A[k] === xi ? 1 : 0)), Y = new T.Vector3().crossVectors(Z, X);
    const m = new T.Matrix4().makeBasis(X, Y, Z), yi = [0, 1, 2].find(k => Math.abs(Y.getComponent(k)) > .5);
    return { m, dims: [p.size[ax[xi]], p.size[yi], p.size[ax[face.axis]]] };
  }
  function buildPart(p, ctx = {}) {
    const face = ctx.face || { axis: p.axis || 'z', sign: p.shape !== 'pcb' && p.open === '-' && !p.elec ? 1 : 1 }, { m, dims } = frameOf(p, face);
    let inner = null;
    if (p.shape === 'pcb') inner = pcb(p, dims, ctx);
    else if (p.elec && ELEC[p.elec.kind]) { const f = ctx.front && new T.Vector3(...ctx.front).applyMatrix4(new T.Matrix4().copy(m).invert()); inner = ELEC[p.elec.kind](p, dims, { front: f && [f.x, f.y, f.z] }); }
    if (!inner) inner = mech(p, dims) || group(mesh(rbox(...dims, 1), matOf(p)));
    inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const outer = new T.Group(); inner.setRotationFromMatrix(m); outer.add(inner); outer.userData.id = p.id; if (inner.userData.explode) outer.userData.explode = inner.userData.explode; return outer;
  }
  return { buildPart, matOf, dispose() { for (const t of texCache.values()) t.dispose(); texCache.clear(); } };
}

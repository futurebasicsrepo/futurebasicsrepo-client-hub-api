// Spot, the plush, in real 3D (WebGL, three.js). Minky fabric with a soft
// sheen at the edges, satin-stitched eye whites with glossy safety-eye
// pupils, an embroidered mouth and airbrushed cheeks, lit like a studio
// product shot. He breathes, blinks, looks
// at the pointer, waves, hops with the YES key and grins when it's pressed.
//
//   const spot = mountSpot3D(hostElement)   → null when WebGL isn't there
//   spot.happy(true|false) · spot.hop() · spot.destroy()
//
// Bundled into /assets/spot3d.js (npm run build:spot3d).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const ORANGE = '#ff5a2a';

// ── the body's surface: a plump ball, slightly squat, with soft seam pinches ──
const SQUASH = 0.94;
const SEAMS = [1.3, -1.3, 2.55, -2.55]; // azimuths of the side and back seams
function radius(az, lat) {
  let r = 1;
  for (const s of SEAMS) {
    let d = Math.atan2(Math.sin(az - s), Math.cos(az - s)) * Math.cos(lat);
    r -= 0.016 * Math.exp(-(d * d) / 0.0016) * Math.min(1, Math.cos(lat) * 1.6);
  }
  return r;
}
function bodyPoint(az, lat, lift = 0, out = new THREE.Vector3()) {
  const r = radius(az, lat) + lift;
  out.set(Math.cos(lat) * Math.sin(az) * r, Math.sin(lat) * r * SQUASH, Math.cos(lat) * Math.cos(az) * r);
  // a softly flattened bottom, so he sits
  if (out.y < -0.8) out.y = -0.8 + (out.y + 0.8) * 0.45;
  return out;
}
function bodyNormal(az, lat) {
  const e = 0.002;
  const p = bodyPoint(az, lat), a = bodyPoint(az + e, lat), b = bodyPoint(az, lat + e);
  return a.sub(p).cross(b.sub(p)).normalize();
}

// Lay a flat (or extruded) shape onto the body: x → azimuth, y → latitude,
// z → height off the fabric. Sizes are in body radii.
function onBody(geo, az0, lat0, lift) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const lat = lat0 + y, az = az0 + x / Math.cos(lat);
    bodyPoint(az, lat, lift + z, v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
function tubeOnBody(points2d, az0, lat0, lift, r) {
  const pts = points2d.map(([x, y]) => {
    const lat = lat0 + y;
    return bodyPoint(az0 + x / Math.cos(lat), lat, lift);
  });
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, r, 12, false);
}

// ── textures, made here so nothing extra is downloaded ──
function noiseHeight(n, seed, octaves) {
  // tileable value noise
  const h = new Float32Array(n * n);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let o = 0; o < octaves; o++) {
    const g = 4 << o, grid = Array.from({ length: g * g }, rnd), amp = 1 / (1 << o);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const fx = (x / n) * g, fy = (y / n) * g, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const at = (a, b) => grid[((b % g) * g) + (a % g)];
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const top = at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx, bot = at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx;
      h[y * n + x] += (top * (1 - sy) + bot * sy) * amp;
    }
  }
  return h;
}
function normalTexture(h, n, strength, repeatX, repeatY) {
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = h[y * n + ((x - 1 + n) % n)], r = h[y * n + ((x + 1) % n)], u = h[((y - 1 + n) % n) * n + x], d = h[((y + 1) % n) * n + x];
    const nx = (l - r) * strength, ny = (u - d) * strength, nz = 1, k = 1 / Math.hypot(nx, ny, nz), i = (y * n + x) * 4;
    data[i] = (nx * k * 0.5 + 0.5) * 255; data[i + 1] = (ny * k * 0.5 + 0.5) * 255; data[i + 2] = (nz * k * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// Minky: a fine, even pile with a whisper of larger variation.
function minkyNormal() {
  const n = 256, fine = noiseHeight(n, 7, 5), soft = noiseHeight(n, 19, 2);
  const h = fine.map((v, i) => v * 0.8 + soft[i] * 0.4);
  return normalTexture(h, n, 2.6, 18, 9);
}
// Satin stitches for the embroidered eye whites: close diagonal threads.
function satinNormal() {
  const n = 128, h = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = ((x + y) / n) * 16 * Math.PI * 2;
    h[y * n + x] = Math.pow(Math.abs(Math.sin(t / 2)), 0.6) * 0.5;
  }
  return normalTexture(h, n, 3.2, 1, 1);
}
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function mountSpot3D(host) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'spot3d';
  canvas.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0.45, 7.4);
  camera.lookAt(0, 0.02, 0);

  // a soft studio: warm key from upper left, cool rim from behind, warm bounce
  const key = new THREE.DirectionalLight('#fff0e2', 2.1);
  key.position.set(-3.2, 4.2, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 14;
  key.shadow.blurSamples = 16;
  key.shadow.bias = -0.0006;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 14 });
  scene.add(key);
  const rim = new THREE.DirectionalLight('#fff6f0', 2.4);
  rim.position.set(3.4, 2.4, -4);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight('#ffe2d0', 1.3);
  rim2.position.set(-3.6, 0.5, -3);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight('#fff7f0', '#f3c3a8', 0.55));

  // ── materials ──
  const minky = minkyNormal();
  const fabric = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0,
    sheen: 1, sheenColor: new THREE.Color('#ffb898'), sheenRoughness: 0.34,
    normalMap: minky, normalScale: new THREE.Vector2(0.6, 0.6),
  });
  const satin = satinNormal();
  satin.repeat.set(5, 5);
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: '#f6efe4', roughness: 0.62, sheen: 0.9, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.28, normalMap: satin, normalScale: new THREE.Vector2(0.9, 0.9) });
  const gloss = new THREE.MeshPhysicalMaterial({ color: '#140e0c', roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04, reflectivity: 0.6 });
  const thread = new THREE.MeshPhysicalMaterial({ color: '#2b1610', roughness: 0.48, sheen: 1, sheenColor: new THREE.Color('#8a5442'), sheenRoughness: 0.25 });
  const felt = new THREE.MeshPhysicalMaterial({ color: '#3a1810', roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color('#6a3428') });
  const tongueMat = new THREE.MeshPhysicalMaterial({ color: '#ff8c9a', roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color('#ffd0d6') });
  const blushTex = canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.55, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const blush = new THREE.MeshBasicMaterial({ color: '#ff5a6e', map: blushTex, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

  // Colour as an airbrush would: Spot orange, a little deeper underneath and
  // toward the seams, and two soft pink cheeks sprayed on.
  const base = new THREE.Color(ORANGE), deep = new THREE.Color('#d9401c'), cheek = new THREE.Color('#ff6f7a');
  function paint(geo, { cheeks = true } = {}) {
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = v.clone().normalize(), az = Math.atan2(n.x, n.z), lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
      c.copy(base).lerp(deep, Math.max(0, -Math.sin(lat) - 0.25) * 0.55 + (1 - Math.max(0, Math.cos(az))) * 0.12);
      if (cheeks) for (const s of [-1, 1]) {
        const d = Math.hypot((az - s * 0.6) * Math.cos(lat), lat + 0.2);
        c.lerp(cheek, Math.exp(-(d * d) / 0.014) * 0.6);
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  // ── the plush ──
  const spot = new THREE.Group(); // moves (hop, look)
  const squish = new THREE.Group(); // breathes and squashes
  spot.add(squish);
  scene.add(spot);

  // Short pile: see-through shells just above the fabric, each keeping fewer
  // fibres than the one below, so the surface and the silhouette fuzz. The
  // pile parts around the embroidery, as it does on a real plush.
  const dots = canvasTexture(256, 256, (g, w, h) => {
    const img = g.createImageData(w, h);
    let k = 99;
    const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    // three.js reads an alpha map from the green channel
    for (let i = 0; i < w * h; i++) { const v = Math.pow(rnd(), 1.5) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    g.putImageData(img, 0, 0);
  });
  dots.colorSpace = THREE.NoColorSpace;
  dots.wrapS = dots.wrapT = THREE.RepeatWrapping;
  dots.magFilter = THREE.NearestFilter;
  dots.minFilter = THREE.NearestFilter;
  dots.generateMipmaps = false;
  const pileMats = [];
  const pileMat = (f, repeat) => {
    const key = `${f.toFixed(3)}:${repeat}`;
    if (pileMats[key]) return pileMats[key];
    const map = dots.clone();
    map.repeat.set(repeat * 2, repeat);
    map.needsUpdate = true;
    return (pileMats[key] = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(1, 1, 1).lerp(new THREE.Color('#ffd9c6'), f * 0.22), vertexColors: true, roughness: 1,
      sheen: 1, sheenColor: new THREE.Color('#ffc2a6'), sheenRoughness: 0.3,
      alphaMap: map, alphaTest: 0.3 + f * 0.62,
    }));
  };
  // How much pile grows at a point of the body (0 where something is stitched on).
  const clearOf = (az, lat) => {
    let k = 1;
    for (const sd of [-1, 1]) {
      const ex = ((az - sd * 0.31) * Math.cos(lat)) / 0.23, ey = (lat - 0.1) / 0.27;
      k = Math.min(k, Math.min(1, Math.max(0, (Math.hypot(ex, ey) - 1) / 0.25)));
    }
    const mx = (az * Math.cos(lat)) / 0.27, my = (lat + 0.32) / 0.12;
    return Math.min(k, Math.min(1, Math.max(0, (Math.hypot(mx, my) - 1) / 0.4)));
  };
  function addPile(geo, parent, { layers = 8, depth = 0.022, repeat = 12, face = false } = {}) {
    const nrm = geo.attributes.normal, src = geo.attributes.position;
    const grow = new Float32Array(src.count).fill(1);
    if (face) for (let j = 0; j < src.count; j++) {
      const x = src.getX(j), y = src.getY(j), z = src.getZ(j), l = Math.hypot(x, y / SQUASH, z);
      grow[j] = clearOf(Math.atan2(x, z), Math.asin(Math.max(-1, Math.min(1, y / SQUASH / l))));
    }
    const shells = [];
    for (let i = 1; i <= layers; i++) {
      const f = i / layers;
      const shell = geo.clone();
      const pos = shell.attributes.position;
      for (let j = 0; j < pos.count; j++) {
        const d = grow[j] > 0.02 ? depth * f * grow[j] : -0.02; // tucked inside where it's cleared
        pos.setXYZ(j, src.getX(j) + nrm.getX(j) * d, src.getY(j) + nrm.getY(j) * d, src.getZ(j) + nrm.getZ(j) * d);
      }
      const sh = new THREE.Mesh(shell, pileMat(f, repeat));
      sh.renderOrder = i;
      parent.add(sh);
      shells.push(sh);
    }
    return shells;
  }

  const bodyGeo = new THREE.SphereGeometry(1, 180, 120);
  {
    const pos = bodyGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      bodyPoint(Math.atan2(v.x, v.z), Math.asin(Math.max(-1, Math.min(1, v.y))), 0, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    bodyGeo.computeVertexNormals();
  }
  paint(bodyGeo);
  const body = new THREE.Mesh(bodyGeo, fabric);
  body.castShadow = true;
  body.receiveShadow = true;
  squish.add(body);
  // Short pile: a few see-through shells just above the fabric, each keeping
  // fewer fibres than the one below, so the surface and the silhouette fuzz.
  addPile(bodyGeo, squish, { face: true });

  // feet, arms
  const footGeo = paint(new THREE.SphereGeometry(0.26, 64, 40), { cheeks: false });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(footGeo, fabric);
    f.scale.set(1.15, 0.62, 1.35);
    f.position.set(s * 0.36, -0.86, 0.36);
    f.castShadow = true;
    squish.add(f);
    for (const sh of addPile(footGeo, f, { layers: 6, depth: 0.022 / 1.15, repeat: 4 })) sh.castShadow = false;
  }
  const armGeo = paint(new THREE.CapsuleGeometry(0.17, 0.16, 12, 40), { cheeks: false });
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    bodyPoint(s * 1.32, -0.1, -0.1, pivot.position);
    const a = new THREE.Mesh(armGeo, fabric);
    a.position.y = -0.22;
    a.scale.set(1, 1, 0.9);
    a.castShadow = true;
    pivot.add(a);
    addPile(armGeo, a, { layers: 6, depth: 0.022, repeat: 4 });
    pivot.rotation.z = s * 0.42;
    pivot.rotation.x = 0.12;
    squish.add(pivot);
    return pivot;
  });


  // face: satin-stitched eye whites, glossy pupils, cheeks, mouth
  const face = new THREE.Group();
  squish.add(face);
  const EYE = { az: 0.31, lat: 0.1, rx: 0.185, ry: 0.228 };
  const eyeShape = new THREE.Shape();
  eyeShape.absellipse(0, 0, EYE.rx, EYE.ry, 0, Math.PI * 2, false, 0);
  const eyeGeo = new THREE.ExtrudeGeometry(eyeShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.026, bevelSize: 0.022, bevelSegments: 6, curveSegments: 64 });
  const open = new THREE.Group();
  face.add(open);
  const pupils = [];
  const pupilGeo = new THREE.SphereGeometry(0.112, 48, 32);
  for (const s of [-1, 1]) {
    const g = onBody(eyeGeo.clone(), s * EYE.az, EYE.lat, 0.006);
    const w = new THREE.Mesh(g, eyeWhite);
    w.castShadow = true;
    open.add(w);
    const p = new THREE.Mesh(pupilGeo, gloss);
    p.scale.set(1, 1.08, 0.5);
    p.userData.side = s;
    open.add(p);
    pupils.push(p);
  }
  const placePupils = (lx, ly) => {
    for (const p of pupils) {
      const lat = EYE.lat - 0.035 + ly, az = p.userData.side * EYE.az + lx / Math.cos(lat);
      bodyPoint(az, lat, 0.064, p.position);
      p.lookAt(p.position.clone().add(bodyNormal(az, lat)));
    }
  };
  placePupils(0, 0);

  // closed eyes: for blinks, and the happy squint
  const arc = (w, h, n = 24) => Array.from({ length: n }, (_, i) => { const t = (i / (n - 1)) * 2 - 1; return [t * w, h * (1 - t * t)]; });
  const shut = new THREE.Group();
  const happyEyes = new THREE.Group();
  for (const s of [-1, 1]) {
    shut.add(new THREE.Mesh(tubeOnBody(arc(0.16, -0.03), s * EYE.az, EYE.lat - 0.04, 0.028, 0.022), thread));
    happyEyes.add(new THREE.Mesh(tubeOnBody(arc(0.16, 0.1), s * EYE.az, EYE.lat - 0.08, 0.028, 0.026), thread));
  }
  shut.visible = false;
  happyEyes.visible = false;
  face.add(shut, happyEyes);

  const cheekGeo = new THREE.CircleGeometry(0.2, 48);
  // cheeks are airbrushed into the fabric (see paint)

  const smile = new THREE.Mesh(tubeOnBody(Array.from({ length: 24 }, (_, i) => { const t = (i / 23) * 2 - 1; return [t * 0.15, 0.055 * t * t]; }), 0, -0.3, 0.026, 0.026), thread);
  face.add(smile);
  const grin = new THREE.Group();
  {
    const d = new THREE.Shape();
    d.moveTo(-0.22, 0);
    d.lineTo(0.22, 0);
    d.bezierCurveTo(0.2, -0.24, -0.2, -0.24, -0.22, 0);
    grin.add(new THREE.Mesh(onBody(new THREE.ShapeGeometry(d, 32), 0, -0.25, 0.02), felt));
    const t = new THREE.Shape();
    t.absellipse(0, -0.12, 0.1, 0.05, 0, Math.PI * 2, false, 0);
    grin.add(new THREE.Mesh(onBody(new THREE.ShapeGeometry(t, 32), 0, -0.25, 0.024), tongueMat));
    const top = Array.from({ length: 12 }, (_, i) => [-0.22 + (0.44 * i) / 11, 0]);
    const bottom = Array.from({ length: 20 }, (_, i) => { const u = (i + 1) / 21; return [0.22 - 0.44 * u, -0.18 * Math.sin(Math.PI * u)]; });
    const rimPts = [...top, ...bottom].map(([x, y]) => { const lat = -0.25 + y; return bodyPoint(x / Math.cos(lat), lat, 0.026); });
    grin.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 96, 0.014, 10, true), thread));
  }
  grin.visible = false;
  face.add(grin);

  // the floor: a soft contact shadow (the key light still shades him where his arms meet his body)
  const contactTex = canvasTexture(128, 128, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(40,14,4,.55)'); r.addColorStop(0.5, 'rgba(40,14,4,.22)'); r.addColorStop(1, 'rgba(40,14,4,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.2), new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, -0.995, 0.12);
  scene.add(contact);

  // ── size ──
  const size = () => {
    const w = host.clientWidth || 200, h = Math.round(w * 1.12);
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.aspectRatio = `${w} / ${h}`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  size();
  host.appendChild(canvas);
  const ro = new ResizeObserver(size);
  ro.observe(host);

  // ── life ──
  let lookX = 0, lookY = 0, aimX = 0, aimY = 0;
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.45);
    aimX = Math.max(-1, Math.min(1, dx / 500));
    aimY = Math.max(-1, Math.min(1, dy / 420));
  };
  addEventListener('pointermove', onMove, { passive: true });

  let isHappy = false, hopAt = -10, blinkAt = 2.5, waveAt = 3.5;
  const t0 = performance.now();
  const clock = { getElapsedTime: () => (performance.now() - t0) / 1000 };
  let visible = true, raf = 0;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); });
  io.observe(canvas);

  const ease = (t) => t * t * (3 - 2 * t);
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const t = clock.getElapsedTime();

    // look: the whole plush turns a little, the pupils a little more
    lookX += (aimX - lookX) * 0.08;
    lookY += (aimY - lookY) * 0.08;
    spot.rotation.y = lookX * 0.32;
    spot.rotation.x = lookY * 0.12;
    placePupils(lookX * 0.06, -lookY * 0.05);

    // breathing
    const b = reduce ? 0 : Math.sin(t * 1.45) * 0.011;
    let sx = 1 - b * 0.6, sy = 1 + b, y = 0, tilt = 0;

    // the hop: down with the key, up, a soft landing, settle
    const h = t - hopAt;
    if (h >= 0 && h < 0.86) {
      const k = h / 0.86;
      if (k < 0.12) { const q = ease(k / 0.12); y = -0.09 * q; sx += 0.07 * q; sy -= 0.08 * q; }
      else if (k < 0.42) { const q = (k - 0.12) / 0.3, e = 1 - (1 - q) * (1 - q); y = -0.09 + 0.69 * e; sx += 0.07 - 0.11 * e; sy += -0.08 + 0.13 * e; tilt = -0.05 * e; }
      else if (k < 0.64) { const q = (k - 0.42) / 0.22, e = q * q; y = 0.6 * (1 - e); sx += -0.04 + 0.12 * e; sy += 0.05 - 0.13 * e; tilt = -0.05 * (1 - e); }
      else { const q = (k - 0.64) / 0.36, e = Math.sin(q * Math.PI) * (1 - q); y = 0.07 * e; sx += 0.08 * (1 - q) - 0.02 * e; sy += -0.08 * (1 - q) + 0.02 * e; }
    }
    spot.position.y = y;
    spot.rotation.z = tilt;
    squish.scale.set(sx, sy, sx);
    squish.position.y = -(1 - sy) * 0.9; // squash from the floor up
    contact.scale.setScalar(1 - Math.min(0.5, Math.max(0, y)) * 0.8);
    contact.material.opacity = 1 - Math.min(0.6, Math.max(0, y));

    // arms: a calm wave now and then, a cheer when happy
    const [l, r] = arms;
    if (isHappy) {
      const c = Math.sin(t * 15) * 0.18;
      l.rotation.z = -2.2 - c;
      r.rotation.z = 2.2 + c;
    } else {
      l.rotation.z += (-0.42 - l.rotation.z) * 0.2;
      const w = t - waveAt;
      let target = 0.42;
      if (w >= 0 && w < 1.8) target = 0.42 + Math.sin(Math.min(1, w / 0.35) * Math.PI / 2) * (1 - Math.max(0, (w - 1.4) / 0.4)) * (1.75 + Math.sin(w * 11) * 0.22);
      else if (w >= 1.8) waveAt = t + 4 + Math.random() * 4;
      r.rotation.z += (target - r.rotation.z) * 0.25;
    }

    // blinks
    if (!isHappy && !reduce && t > blinkAt) {
      open.visible = false;
      shut.visible = true;
      if (t > blinkAt + 0.12) { open.visible = true; shut.visible = false; blinkAt = t + 2.4 + Math.random() * 3; }
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });

  return {
    el: canvas,
    happy(on) {
      isHappy = Boolean(on);
      open.visible = !isHappy;
      shut.visible = false;
      happyEyes.visible = isHappy;
      smile.visible = !isHappy;
      grin.visible = isHappy;
    },
    hop() { hopAt = clock.getElapsedTime(); },
    // one frame now (for tests and stills)
    render() { renderer.render(scene, camera); },
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      ro.disconnect();
      io.disconnect();
      renderer.dispose();
      canvas.remove();
    },
  };
}

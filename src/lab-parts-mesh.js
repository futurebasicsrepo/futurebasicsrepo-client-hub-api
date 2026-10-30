// The real shapes of an assembly's parts for the files (STL and the exploded drawing): the same three.js parts the Engineering page shows
// (src/lab-parts3d.js), built on the server without textures, placed by the same rules (src/lab-assembly.js), and read back as triangles.
//   realMeshes(spec, { t }) → (a part that opens as the view pulls apart, a CD tray, is opened by t) { [part id]: [{ tri: Float32Array (x,y,z × 3 per triangle, mm, about the part's centre), colour: '#rrggbb' }] }
//   isoPicture(spec, { t, real }) → { href: a PNG data URL, box } for drawingSvg: the parts pulled apart by t, seen as the drawing sees
//     them, rendered with a depth buffer (so detail that pokes through another part is hidden properly), lit, with ink lines where one
//     part meets another or the surface steps away, on a clear ground; the cables (harnessOf) run between their parts as in the page
// Decals (printed labels and key symbols: transparent planes laid on a surface) carry no shape and are left out.
import * as THREE from 'three';
import { makeKit } from './lab-parts3d.js';
import sharp from 'sharp';
import { faceOfPart, compsOnBoard, frontOf, explodeOffsets, isoOf, isoDepth, harnessOf, cablePath, CABLE_INK } from './lab-assembly.js';

// a part's colour: its material's, tinted by the ground of its texture where it has one (the board's green, a chip's black)
const hex = m => { const c = new THREE.Color(m?.color ?? '#8a8d90'), ink = m?.map?.userData?.ink; if (ink) c.multiply(new THREE.Color(ink)); return '#' + c.getHexString(THREE.SRGBColorSpace); };
function trianglesOf(o, M) {
  const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(M); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}
export function realMeshes(s, { name = '', t = 0 } = {}) {
  const kit = makeKit(THREE), out = {}, front = frontOf(s), M = new THREE.Matrix4(), I = new THREE.Matrix4();
  try {
    for (const p of s.parts) {
      const node = kit.buildPart(p, { face: faceOfPart(s, p), comps: p.shape === 'pcb' ? compsOnBoard(s, p) : null, name: name || s.name, front });
      node.userData.explode?.(t); node.updateMatrixWorld(true); const list = [];
      node.traverse(o => {
        if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const mat = [].concat(o.material)[0]; if (mat?.transparent && mat.opacity >= .99 && mat.map) return; // a decal
        if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, I); list.push({ tri: trianglesOf(o, M.multiplyMatrices(o.matrixWorld, I)), colour: hex(mat) }); }
        else list.push({ tri: trianglesOf(o, o.matrixWorld), colour: hex(mat) });
      });
      out[p.id] = list;
    }
  } finally { kit.dispose(); }
  return out;
}

// ---- the drawing's picture ------------------------------------------------------------------------------------------------------------------------
const L1 = [-.45, -.35, .82], L2 = [.6, .7, .25], rgbOf = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const unit = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }, A = unit(L1), B = unit(L2);
// fit: the picture's size on the drawing in px (drawingSvg's area is about 520 × 530); it renders at 4× that and keeps 2× for print
export async function isoPicture(s, { t = 1, real = null, fit = [520, 530] } = {}) {
  real ||= realMeshes(s, { t }); const off = explodeOffsets(s, t), tris = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const zero = [0, 0, 0], runs = harnessOf(s).map(c => { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cablePath(s, c, off).map(q => new THREE.Vector3(...q))), 48, c.kind === 'mains' ? 2.2 : c.kind === 'ribbon' ? 1.1 : 1.3, c.kind === 'ribbon' ? 2 : 8, false); return { id: c.id, list: [{ tri: trianglesOf(new THREE.Mesh(g), new THREE.Matrix4()), colour: CABLE_INK[c.kind] || '#888888' }] }; });
  [...s.parts, ...runs].forEach((p, pi) => { const at = p.at ? p.at.map((v, k) => v + off[p.id][k]) : zero; for (const m of (p.list || real[p.id] || [])) { const c = rgbOf(m.colour), q = m.tri;
    for (let i = 0; i < q.length; i += 9) { const a = [q[i] + at[0], q[i + 1] + at[1], q[i + 2] + at[2]], b = [q[i + 3] + at[0], q[i + 4] + at[1], q[i + 5] + at[2]], d = [q[i + 6] + at[0], q[i + 7] + at[1], q[i + 8] + at[2]];
      const u = b.map((v, k) => v - a[k]), v = d.map((x, k) => x - a[k]), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n); if (l < 1e-12) continue;
      const nn = n.map(x => x / l), lit = .42 + .5 * Math.abs(nn[0] * A[0] + nn[1] * A[1] + nn[2] * A[2]) + .16 * Math.abs(nn[0] * B[0] + nn[1] * B[1] + nn[2] * B[2]);
      const P = [a, b, d].map(w => [...isoOf(w), isoDepth(w)]); for (const [x, y] of P) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      tris.push(P, c.map(ch => Math.min(255, ch * lit)), pi); } } });
  if (!tris.length) return null;
  const k = Math.min(fit[0] / (x1 - x0 || 1), fit[1] / (y1 - y0 || 1)), sc = k * 4, W = Math.ceil((x1 - x0) * sc) + 4, H = Math.ceil((y1 - y0) * sc) + 4;
  const Z = new Float32Array(W * H).fill(-Infinity), C = new Uint8ClampedArray(W * H * 4), ID = new Int32Array(W * H).fill(-1);
  for (let i = 0; i < tris.length; i += 3) {
    const [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] = tris[i], col = tris[i + 1], id = tris[i + 2];
    const X0 = (ax - x0) * sc + 2, Y0 = (ay - y0) * sc + 2, X1 = (bx - x0) * sc + 2, Y1 = (by - y0) * sc + 2, X2 = (cx - x0) * sc + 2, Y2 = (cy - y0) * sc + 2;
    const area = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0); if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(X0, X1, X2))), maxX = Math.min(W - 1, Math.ceil(Math.max(X0, X1, X2))), minY = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(Y0, Y1, Y2)));
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + .5, py = y + .5, w0 = ((X1 - px) * (Y2 - py) - (X2 - px) * (Y1 - py)) / area, w1 = ((X2 - px) * (Y0 - py) - (X0 - px) * (Y2 - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue; const z = w0 * az + w1 * bz + w2 * cz, j = y * W + x; if (z <= Z[j]) continue;
      Z[j] = z; ID[j] = id; C[j * 4] = col[0]; C[j * 4 + 1] = col[1]; C[j * 4 + 2] = col[2]; C[j * 4 + 3] = 255;
    }
  }
  // ink: the outline of each part and where the surface steps away (2 render px, 1 px once halved)
  const step = Math.max(1.2, 6 / sc), ink = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = y * W + x; for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= W || yy < 0 || yy >= H) continue; const q = yy * W + xx; if (ID[j] === ID[q] && (ID[j] < 0 || Math.abs(Z[j] - Z[q]) < step)) continue; ink[ID[j] < 0 || (ID[q] >= 0 && Z[q] > Z[j]) ? q : j] = 1; } }
  for (let j = 0; j < W * H; j++) if (ink[j]) { C[j * 4] = C[j * 4] * .25 + 20 * .75; C[j * 4 + 1] = C[j * 4 + 1] * .25 + 20 * .75; C[j * 4 + 2] = C[j * 4 + 2] * .25 + 22 * .75; C[j * 4 + 3] = 255; }
  const png = await sharp(Buffer.from(C.buffer), { raw: { width: W, height: H, channels: 4 } }).resize(Math.round(W / 2), Math.round(H / 2), { kernel: 'lanczos3' }).png({ compressionLevel: 9, palette: false }).toBuffer();
  const pad = 2 / sc; return { href: `data:image/png;base64,${png.toString('base64')}`, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], bytes: png.length };
}

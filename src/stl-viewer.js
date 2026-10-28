// A small STL viewer with no dependencies (the page's security policy allows no outside scripts). Reads binary and ASCII STL, smooths the shading
// where the surface is smooth and keeps edges crisp where it is not, and shows it with WebGL: drag to turn, scroll or pinch to zoom, right-drag or
// two fingers to move, double-click to start over.
//   FBStl.parse(arrayBuffer) -> { positions, normals, triangles, size, center }        (also used by the tests, in Node)
//   FBStl.parseGlb(arrayBuffer) -> the same, plus uvs and the texture picture (a glTF binary, as the 3D service makes for the Lab's try-on)
//   FBStl.mount(element, arrayBuffer, { upAxis }) -> { destroy(), reset(), setUp('y'|'z') }  or throws if WebGL is not available (STL or GLB: told apart by the file's first bytes)
(function (root) {
  'use strict';

  function parse(buf) {
    const dv = new DataView(buf), len = buf.byteLength;
    let tris = [];
    const binaryCount = len >= 84 ? dv.getUint32(80, true) : -1;
    let pos;
    if (len >= 84 && 84 + binaryCount * 50 === len && binaryCount > 0) {
      pos = new Float32Array(binaryCount * 9);
      for (let i = 0; i < binaryCount; i++) { const o = 84 + i * 50 + 12; for (let k = 0; k < 9; k++) pos[i * 9 + k] = dv.getFloat32(o + k * 4, true); }
    } else {
      const text = new TextDecoder('latin1').decode(buf), re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, v = [];
      let m; while ((m = re.exec(text))) v.push(+m[1], +m[2], +m[3]);
      if (!v.length || v.length % 9) throw new Error('This file is not a valid STL.');
      pos = new Float32Array(v);
    }
    const n = pos.length / 9;
    for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error('This file is not a valid STL.');
    // bounds
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { const x = pos[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const diag = Math.hypot(size[0], size[1], size[2]) || 1, q = diag / 20000;
    // face normals, and an angle-weighted sum per welded vertex
    // vertices are welded with an open-addressing hash on typed arrays (a big model has well over a million corners; a Map of them would run a phone out of memory)
    const face = new Float32Array(n * 3), ids = new Int32Array(n * 3);
    let cap = 1024; while (cap < n * 6) cap <<= 1;
    const mask = cap - 1, table = new Int32Array(cap).fill(-1), kx = new Int32Array(n * 3), ky = new Int32Array(n * 3), kz = new Int32Array(n * 3), acc = new Float32Array(n * 9);
    let next = 0;
    for (let t = 0; t < n; t++) {
      const o = t * 9, ax = pos[o], ay = pos[o + 1], az = pos[o + 2], bx = pos[o + 3] - ax, by = pos[o + 4] - ay, bz = pos[o + 5] - az, cx = pos[o + 6] - ax, cy = pos[o + 7] - ay, cz = pos[o + 8] - az;
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      face[t * 3] = nx; face[t * 3 + 1] = ny; face[t * 3 + 2] = nz;
      const fl0 = Math.hypot(nx, ny, nz) || 1, ux = nx / fl0, uy = ny / fl0, uz = nz / fl0;
      for (let c = 0; c < 3; c++) {
        // weight by the angle the triangle makes at this corner, so a vertex shared by many thin triangles does not outvote one big face
        const p0 = o + c * 3, p1 = o + ((c + 1) % 3) * 3, p2 = o + ((c + 2) % 3) * 3;
        const e1x = pos[p1] - pos[p0], e1y = pos[p1 + 1] - pos[p0 + 1], e1z = pos[p1 + 2] - pos[p0 + 2], e2x = pos[p2] - pos[p0], e2y = pos[p2 + 1] - pos[p0 + 1], e2z = pos[p2 + 2] - pos[p0 + 2];
        const l1 = Math.hypot(e1x, e1y, e1z) || 1, l2 = Math.hypot(e2x, e2y, e2z) || 1, ang = Math.acos(Math.max(-1, Math.min(1, (e1x * e2x + e1y * e2y + e1z * e2z) / (l1 * l2))));
        const ix = Math.round((pos[o + c * 3] - min[0]) / q), iy = Math.round((pos[o + c * 3 + 1] - min[1]) / q), iz = Math.round((pos[o + c * 3 + 2] - min[2]) / q);
        let h = (((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0) & mask, id;
        for (;;) { id = table[h]; if (id < 0) { id = next++; table[h] = id; kx[id] = ix; ky[id] = iy; kz[id] = iz; break; } if (kx[id] === ix && ky[id] === iy && kz[id] === iz) break; h = (h + 1) & mask; }
        ids[t * 3 + c] = id; acc[id * 3] += ux * ang; acc[id * 3 + 1] += uy * ang; acc[id * 3 + 2] += uz * ang;
      }
    }
    const normals = new Float32Array(n * 9), cosLimit = Math.cos(40 * Math.PI / 180);
    for (let t = 0; t < n; t++) {
      const fx = face[t * 3], fy = face[t * 3 + 1], fz = face[t * 3 + 2], fl = Math.hypot(fx, fy, fz) || 1;
      for (let c = 0; c < 3; c++) {
        const id = ids[t * 3 + c], ax = acc[id * 3], ay = acc[id * 3 + 1], az = acc[id * 3 + 2], al = Math.hypot(ax, ay, az) || 1;
        let x = ax / al, y = ay / al, z = az / al;
        if (x * fx / fl + y * fy / fl + z * fz / fl < cosLimit) { x = fx / fl; y = fy / fl; z = fz / fl; } // a real edge stays sharp
        const o = t * 9 + c * 3; normals[o] = x; normals[o + 1] = y; normals[o + 2] = z;
      }
    }
    return { positions: pos, normals, triangles: n, size, center, diag };
  }

  // ---- GLB: the JSON chunk says where the geometry and the picture sit in the binary chunk ----
  const isGlb = buf => buf && buf.byteLength > 20 && new DataView(buf).getUint32(0, true) === 0x46546c67;
  function parseGlb(buf) {
    const dv = new DataView(buf); if (!isGlb(buf)) throw new Error('This file is not a valid GLB.');
    let o = 12, json = null, bin = null;
    while (o + 8 <= buf.byteLength) { const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true); const body = buf.slice(o + 8, o + 8 + len); if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)); else if (type === 0x004e4942) bin = body; o += 8 + len; }
    if (!json || !Array.isArray(json.meshes)) throw new Error('This file is not a valid GLB.');
    const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const read = idx => { // one accessor as a flat Float32Array (or Uint32Array for indices), whatever its stride and type
      const a = json.accessors[idx], bv = json.bufferViews[a.bufferView], n = N[a.type], sz = SIZE[a.componentType], stride = bv.byteStride || n * sz, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
      if (!bin) throw new Error('This GLB keeps its data outside the file.');
      const out = a.componentType === 5125 || a.componentType === 5123 || a.componentType === 5121 ? new Uint32Array(a.count * n) : new Float32Array(a.count * n), v = new DataView(bin), norm = a.normalized;
      for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) { const p = base + i * stride + k * sz; let x;
        switch (a.componentType) { case 5126: x = v.getFloat32(p, true); break; case 5125: x = v.getUint32(p, true); break; case 5123: x = v.getUint16(p, true); if (norm) x /= 65535; break; case 5121: x = v.getUint8(p); if (norm) x /= 255; break; case 5122: x = v.getInt16(p, true); if (norm) x = Math.max(x / 32767, -1); break; default: x = v.getInt8(p); if (norm) x = Math.max(x / 127, -1); }
        out[i * n + k] = x; }
      return out;
    };
    // node transforms: a matrix, or translation·rotation·scale; children inherit
    const matOf = node => { if (node.matrix) return Float64Array.from(node.matrix); const t = node.translation || [0, 0, 0], q = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1], [x, y, z, w] = q;
      const r = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0, 2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0, 2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1];
      for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) r[c * 4 + k] *= s[c]; return r; };
    const mulM = (a, b) => { const out = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return out; };
    const prims = []; const walk = (ni, parent) => { const node = json.nodes[ni]; if (!node) return; const m = mulM(parent, matOf(node)); if (node.mesh != null) for (const p of json.meshes[node.mesh].primitives || []) prims.push({ p, m }); for (const c of node.children || []) walk(c, m); };
    const roots = json.scenes && json.scenes[json.scene || 0] ? json.scenes[json.scene || 0].nodes : json.nodes.map((_, i) => i);
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (const r of roots) walk(r, I);
    if (!prims.length) throw new Error('This GLB has no geometry.');
    // the picture: the first base-colour texture found
    let texture = null, texMat = -1;
    const imageOf = mi => { const m = json.materials && json.materials[mi], ti = m && m.pbrMetallicRoughness && m.pbrMetallicRoughness.baseColorTexture && m.pbrMetallicRoughness.baseColorTexture.index; if (ti == null) return null; const src = json.textures[ti] && json.textures[ti].source, im = src != null && json.images[src]; if (!im) return null;
      if (im.bufferView != null) { const bv = json.bufferViews[im.bufferView]; return { mime: im.mimeType || 'image/png', bytes: new Uint8Array(bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)) }; }
      if (im.uri && /^data:/.test(im.uri)) { const m2 = /^data:([^;]+);base64,(.*)$/.exec(im.uri); if (!m2) return null; const s = atob(m2[2]), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return { mime: m2[1], bytes: b }; }
      return null; };
    for (const { p } of prims) if (p.material != null && !texture) { texture = imageOf(p.material); if (texture) texMat = p.material; }
    const P = [], NN = [], UV = [];
    for (const { p, m } of prims) {
      if (p.mode != null && p.mode !== 4) continue; // triangles only
      const pos = read(p.attributes.POSITION), nor = p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : null, uv = p.attributes.TEXCOORD_0 != null ? read(p.attributes.TEXCOORD_0) : null;
      const idx = p.indices != null ? read(p.indices) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i), painted = texture && p.material === texMat && uv;
      const xf = (x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
      const xn = (x, y, z) => { const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z], l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const corners = [idx[t], idx[t + 1], idx[t + 2]].map(i => xf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
        let fn = null; if (!nor) { const [a, b, c] = corners, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1; fn = [nx / l, ny / l, nz / l]; }
        for (let c = 0; c < 3; c++) { const i = idx[t + c]; P.push(...corners[c]); NN.push(...(nor ? xn(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) : fn)); UV.push(painted ? uv[i * 2] : -1, painted ? uv[i * 2 + 1] : -1); }
      }
    }
    const positions = new Float32Array(P), normals = new Float32Array(NN), uvs = new Float32Array(UV), n = positions.length / 9;
    for (let i = 0; i < positions.length; i++) if (!Number.isFinite(positions[i])) throw new Error('This GLB has bad geometry.');
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const x = positions[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    return { positions, normals, uvs, triangles: n, size, center, diag: Math.hypot(size[0], size[1], size[2]) || 1, texture };
  }
  const parseAny = buf => (isGlb(buf) ? parseGlb(buf) : parse(buf));

  // ---- tiny matrix helpers (column-major, like WebGL wants) ----
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };

  const VS = 'attribute vec3 p;attribute vec3 n;attribute vec2 t;uniform mat4 mvp;uniform mat3 nm;varying vec3 vn;varying vec2 vt;void main(){vn=nm*n;vt=t;gl_Position=mvp*vec4(p,1.0);}';
  const FS = 'precision mediump float;varying vec3 vn;varying vec2 vt;uniform vec3 tint;uniform sampler2D tex;uniform float useTex;'
    + 'void main(){vec3 N=normalize(vn);if(!gl_FrontFacing)N=-N;'
    + 'float key=max(dot(N,normalize(vec3(-0.45,0.65,0.62))),0.0);float fill=max(dot(N,normalize(vec3(0.7,0.15,0.4))),0.0)*0.28;'
    + 'float rim=pow(1.0-max(N.z,0.0),3.0)*0.22;float sky=0.32+0.18*N.y;'
    + 'float on=useTex*step(0.0,vt.x);vec3 base=mix(tint,texture2D(tex,vt).rgb,on);'
    + 'vec3 c=base*(sky+key*mix(0.78,0.55,on)+fill)+vec3(rim*(1.0-on*0.6));gl_FragColor=vec4(pow(c,vec3(0.92)),1.0);}';

  function mount(el, buf, opts) {
    opts = opts || {};
    const model = buf && buf.positions ? buf : parseAny(buf);
    const canvas = document.createElement('canvas');
    canvas.className = 'stl-canvas'; canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', '3D model. Drag to turn it, scroll to zoom.');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none';
    canvas.tabIndex = 0;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('This browser cannot show 3D here.');
    el.appendChild(canvas);

    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('3D shader failed: ' + gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('3D program failed to link.');
    gl.useProgram(prog);
    const bufP = gl.createBuffer(), bufN = gl.createBuffer(), bufT = gl.createBuffer(), aP = gl.getAttribLocation(prog, 'p'), aN = gl.getAttribLocation(prog, 'n'), aT = gl.getAttribLocation(prog, 't');
    gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferData(gl.ARRAY_BUFFER, model.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufN); gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufT); gl.bufferData(gl.ARRAY_BUFFER, model.uvs || new Float32Array(model.triangles * 6).fill(-1), gl.STATIC_DRAW);
    const uMvp = gl.getUniformLocation(prog, 'mvp'), uNm = gl.getUniformLocation(prog, 'nm'), uTint = gl.getUniformLocation(prog, 'tint'), uTex = gl.getUniformLocation(prog, 'tex'), uUse = gl.getUniformLocation(prog, 'useTex');
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    gl.uniform3f(uTint, 0.86, 0.84, 0.80); gl.uniform1f(uUse, 0); gl.uniform1i(uTex, 0);
    // the picture painted on the model (a GLB with a texture): uploaded once it has loaded; until then the model shows plain
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([220, 215, 205, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    let textured = false;
    if (model.texture && model.texture.bytes && typeof URL !== 'undefined') {
      const url = URL.createObjectURL(new Blob([model.texture.bytes], { type: model.texture.mime || 'image/png' })), im = new Image();
      im.onload = () => { if (dead) return; gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.uniform1f(uUse, 1); textured = true; URL.revokeObjectURL(url); schedule(); };
      im.onerror = () => URL.revokeObjectURL(url); im.src = url;
    }

    // the model is centred and scaled to fit; "up" is the axis that points up on screen (Meshy models are Y-up, most CAD files are Z-up)
    let up = opts.upAxis === 'z' ? 'z' : 'y';
    const state = { yaw: 0.6, pitch: 0.28, dist: 1.5, panX: 0, panY: 0, auto: true }, home = { ...state };
    const scale = 1 / (model.diag || 1); // the model's bounding sphere has radius 0.5, so any shape fits whichever way it is turned
    let raf = 0, dead = false, dirty = true;

    function draw() {
      raf = 0; if (dead) return;
      const w = canvas.clientWidth, h = canvas.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!w || !h) { schedule(); return; }
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw), cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      // model matrix: move the centre to the origin, put the chosen axis up, scale
      const c = model.center, s = scale;
      const T = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -c[0], -c[1], -c[2], 1]);
      const Sc = new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]);
      const Up = up === 'z' ? new Float32Array([1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1]) : new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); // Z-up: turn Z onto Y
      const Ry = new Float32Array([cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1]), Rx = new Float32Array([1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1]);
      const d = state.dist * Math.max(1, h / w), V = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, state.panX, state.panY, -d, 1]);
      const M = mul(Sc, mul(Up, T)), MV = mul(V, mul(Rx, mul(Ry, M))), P = persp(0.8, w / h, 0.05, 50);
      gl.uniformMatrix4fv(uMvp, false, mul(P, MV));
      const R = mul(Rx, Ry), U3 = up === 'z' ? [1, 0, 0, 0, 0, -1, 0, 1, 0] : [1, 0, 0, 0, 1, 0, 0, 0, 1]; // normal matrix: the rotations (uniform scale drops out after normalise)
      const r3 = [R[0], R[1], R[2], R[4], R[5], R[6], R[8], R[9], R[10]], nm = new Float32Array(9);
      for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) { let sum = 0; for (let k = 0; k < 3; k++) sum += r3[k * 3 + row] * U3[col * 3 + k]; nm[col * 3 + row] = sum; }
      gl.uniformMatrix3fv(uNm, false, nm);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufN); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufT); gl.enableVertexAttribArray(aT); gl.vertexAttribPointer(aT, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.drawArrays(gl.TRIANGLES, 0, model.triangles * 3);
      dirty = false;
      if (state.auto) { state.yaw += 0.006; dirty = true; }
      if (dirty) schedule();
    }
    const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(draw); };
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; if (reduce) state.auto = false;

    // ---- input ----
    const pts = new Map(); let last = null, pinch = 0;
    const stop = () => { state.auto = false; };
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; pinch = 0; stop(); canvas.style.cursor = 'grabbing'; });
    canvas.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) { // two fingers: pinch to zoom, move to pan
        const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) state.dist = Math.min(5, Math.max(0.5, state.dist * pinch / d)); pinch = d;
        state.panX += (e.clientX - prev.x) / canvas.clientHeight * state.dist * 0.5; state.panY -= (e.clientY - prev.y) / canvas.clientHeight * state.dist * 0.5; schedule(); return;
      }
      const dx = e.clientX - last.x, dy = e.clientY - last.y; last.x = e.clientX; last.y = e.clientY;
      if (last.pan) { state.panX += dx / canvas.clientHeight * state.dist * 0.9; state.panY -= dy / canvas.clientHeight * state.dist * 0.9; }
      else { state.yaw += dx * 0.009; state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch + dy * 0.009)); }
      schedule();
    });
    const up_ = e => { pts.delete(e.pointerId); pinch = 0; canvas.style.cursor = 'grab'; if (pts.size === 1) { const [p] = [...pts.values()]; last = { x: p.x, y: p.y, pan: false }; } };
    canvas.addEventListener('pointerup', up_); canvas.addEventListener('pointercancel', up_);
    canvas.addEventListener('wheel', e => { e.preventDefault(); stop(); state.dist = Math.min(5, Math.max(0.5, state.dist * Math.exp(e.deltaY * 0.0012))); schedule(); }, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('dblclick', () => reset());
    canvas.addEventListener('keydown', e => { const k = e.key; if (k === 'ArrowLeft') state.yaw -= 0.12; else if (k === 'ArrowRight') state.yaw += 0.12; else if (k === 'ArrowUp') state.pitch = Math.min(1.45, state.pitch + 0.12); else if (k === 'ArrowDown') state.pitch = Math.max(-1.45, state.pitch - 0.12); else if (k === '+' || k === '=') state.dist = Math.max(0.5, state.dist * 0.9); else if (k === '-') state.dist = Math.min(5, state.dist * 1.1); else return; e.preventDefault(); stop(); schedule(); });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null; if (ro) ro.observe(canvas);
    canvas.addEventListener('webglcontextlost', e => e.preventDefault());

    function reset() { Object.assign(state, home, { auto: !reduce }); schedule(); }
    function setUp(axis) { up = axis === 'z' ? 'z' : 'y'; schedule(); return up; }
    schedule();
    return {
      reset, setUp, getUp: () => up, canvas, triangles: model.triangles, textured: () => textured,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } canvas.remove(); }
    };
  }

  const api = { parse, parseGlb, parseAny, isGlb, mount };
  root.FBStl = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

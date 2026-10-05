// A small STL viewer with no dependencies (the page's security policy allows no outside scripts). Reads binary and ASCII STL, smooths the shading
// where the surface is smooth and keeps edges crisp where it is not, and shows it with WebGL: drag to turn, scroll or pinch to zoom, right-drag or
// two fingers to move, double-click to start over.
//   FBStl.parse(arrayBuffer) -> { positions, normals, triangles, size, center }        (also used by the tests, in Node)
//   FBStl.mount(element, arrayBuffer, { upAxis }) -> { destroy(), reset(), setUp('y'|'z') }  or throws if WebGL is not available
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
    const face = new Float32Array(n * 3), ids = new Int32Array(n * 3), map = new Map();
    let next = 0;
    const acc = [];
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
        const key = (Math.round((pos[o + c * 3] - min[0]) / q) * 32768 + Math.round((pos[o + c * 3 + 1] - min[1]) / q)) * 32768 + Math.round((pos[o + c * 3 + 2] - min[2]) / q);
        let id = map.get(key); if (id === undefined) { id = next++; map.set(key, id); acc.push(0, 0, 0); }
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

  // ---- tiny matrix helpers (column-major, like WebGL wants) ----
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };

  const VS = 'attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat3 nm;varying vec3 vn;void main(){vn=nm*n;gl_Position=mvp*vec4(p,1.0);}';
  const FS = 'precision mediump float;varying vec3 vn;uniform vec3 tint;'
    + 'void main(){vec3 N=normalize(vn);if(!gl_FrontFacing)N=-N;'
    + 'float key=max(dot(N,normalize(vec3(-0.45,0.65,0.62))),0.0);float fill=max(dot(N,normalize(vec3(0.7,0.15,0.4))),0.0)*0.28;'
    + 'float rim=pow(1.0-max(N.z,0.0),3.0)*0.22;float sky=0.32+0.18*N.y;'
    + 'vec3 c=tint*(sky+key*0.78+fill)+vec3(rim);gl_FragColor=vec4(pow(c,vec3(0.92)),1.0);}';

  function mount(el, buf, opts) {
    opts = opts || {};
    const model = buf && buf.positions ? buf : parse(buf);
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
    const bufP = gl.createBuffer(), bufN = gl.createBuffer(), aP = gl.getAttribLocation(prog, 'p'), aN = gl.getAttribLocation(prog, 'n');
    gl.bindBuffer(gl.ARRAY_BUFFER, bufP); gl.bufferData(gl.ARRAY_BUFFER, model.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufN); gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);
    const uMvp = gl.getUniformLocation(prog, 'mvp'), uNm = gl.getUniformLocation(prog, 'nm'), uTint = gl.getUniformLocation(prog, 'tint');
    gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
    gl.uniform3f(uTint, 0.86, 0.84, 0.80);

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
      reset, setUp, getUp: () => up, canvas, triangles: model.triangles,
      destroy() { dead = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* ignore */ } canvas.remove(); }
    };
  }

  const api = { parse, mount };
  root.FBStl = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

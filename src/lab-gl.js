// The Studio's picture on the graphics chip (served as /lab/lab-gl.js): a WebGL2 canvas under the Studio's own canvas draws the page and the
// picture; the Studio's canvas above it keeps only what is drawn over the picture (handles, guides, the brush's circle). Each picture the
// Studio hands over (the whole picture put together, or while one layer moves: the layers under it, that layer, the layers over it) is a
// texture, sent to the chip only when it changes; every frame is then a handful of textured quads moved by one matrix each, which the chip
// does in a fraction of a millisecond whatever the zoom, turn or size. Where WebGL2 is missing, or the chip drops the context, the Studio
// draws as before (FBGL.ok is false).
//   FBGL.attach(viewCanvas) → creates the canvas under it
//   FBGL.frame({ w, h, dpr, view: {PX, PY, Z, VR}, page: {w, h, color}, items: [{ src, ver, m: [a,b,c,d,e,f], w, h, opacity, blend }], sharp })
//     m: the item's own placement on the page (as a 2D canvas transform), its quad (0,0)-(w,h) in its own units
(function () {
  const G = { ok: false, gl: null, cv: null, tex: new WeakMap(), lost: false };
  const VS = `#version 300 es
  in vec2 p; uniform mat3 M; out vec2 uv;
  void main(){ uv = p; vec3 q = M * vec3(p, 1.0); gl_Position = vec4(q.xy, 0.0, 1.0); }`;
  const FS = `#version 300 es
  precision mediump float; in vec2 uv; uniform sampler2D T; uniform float A; uniform vec4 C; uniform int solid; out vec4 o;
  void main(){ o = solid == 1 ? C : texture(T, uv) * A; }`;
  function attach(view) {
    if (G.cv || !view) return G.ok;
    // on by default; off where it was switched off (the Hand tool's bar keeps it per device) or with ?gl=0. No WebGL2: the canvas draws, as before
    try { if (/[?&]gl=0\b/.test(location.search) || (localStorage.getItem('fb.studio.gl') === '0' && !/[?&]gl=1\b/.test(location.search))) return false; } catch { /* storage closed: on */ }
    const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); cv.style.pointerEvents = 'none';
    const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, desynchronized: true, preserveDrawingBuffer: false });
    if (!gl) return false;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    try {
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr); const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      G.u = { M: gl.getUniformLocation(pr, 'M'), T: gl.getUniformLocation(pr, 'T'), A: gl.getUniformLocation(pr, 'A'), C: gl.getUniformLocation(pr, 'C'), solid: gl.getUniformLocation(pr, 'solid') };
      gl.uniform1i(G.u.T, 0); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.enable(gl.BLEND);
    } catch (e) { console.warn('studio: drawing on the graphics chip is off', e.message); return false; }
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); G.ok = false; G.lost = true; G.tex = new WeakMap(); cv.style.display = 'none'; window.dispatchEvent(new Event('fbgl-off')); });
    view.before(cv); G.cv = cv; G.gl = gl; G.ok = true; return true;
  }
  // a picture as a texture: sent again only when it changed (its version, or a new canvas)
  function texOf(src, ver, sharp) {
    const gl = G.gl; let t = G.tex.get(src);
    if (!t) { t = { tex: gl.createTexture(), ver: NaN, w: 0, h: 0, mip: false }; G.tex.set(src, t); }
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    if (t.ver !== ver || t.w !== src.width || t.h !== src.height) {
      if (t.w === src.width && t.h === src.height) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      t.ver = ver; t.w = src.width; t.h = src.height; t.mip = false;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // a picture shown smaller than it is: mipmaps (made once per change, and only for the sharp frame), so it reads cleanly
    if (sharp && !t.mip) { gl.generateMipmap(gl.TEXTURE_2D); t.mip = true; }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, t.mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  const BLEND = {
    'source-over': gl => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA),
    multiply: gl => gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA),
    screen: gl => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR),
  };
  const canBlend = b => !b || b in BLEND;
  // 2D affine [a,b,c,d,e,f] (as a canvas transform) times another
  const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
  function frame({ w, h, dpr, view, page, items, sharp }) {
    if (!G.ok) return false; const gl = G.gl, cv = G.cv, cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
    gl.viewport(0, 0, cw, ch); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // page units → the screen (moved, zoomed, turned about the middle) → clip space
    const a = (view.VR || 0) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
    let V = [view.Z, 0, 0, view.Z, view.PX, view.PY];
    if (a) V = mul([co, si, -si, co, w / 2 - co * w / 2 + si * h / 2, h / 2 - si * w / 2 - co * h / 2], V);
    V = mul([2 / w, 0, 0, -2 / h, -1, 1], V);
    const draw = (m, solid, color, alpha = 1) => { const M = mul(V, m); gl.uniformMatrix3fv(G.u.M, false, [M[0], M[1], 0, M[2], M[3], 0, M[4], M[5], 1]); gl.uniform1i(G.u.solid, solid ? 1 : 0); if (solid) gl.uniform4fv(G.u.C, color); else gl.uniform1f(G.u.A, alpha); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
    // the page
    BLEND['source-over'](gl); const c = page.color || [1, 1, 1, 1]; draw([page.w, 0, 0, page.h, 0, 0], true, [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]]);
    for (const it of items) {
      if (!it.src || !it.src.width || !it.src.height || it.opacity === 0) continue; texOf(it.src, it.ver ?? 0, sharp); gl.activeTexture(gl.TEXTURE0);
      (BLEND[it.blend] || BLEND['source-over'])(gl); draw(mul(it.m || [1, 0, 0, 1, 0, 0], [it.w ?? it.src.width, 0, 0, it.h ?? it.src.height, 0, 0]), false, null, it.opacity ?? 1);
    }
    return true;
  }
  function clear() { if (!G.ok) return; const gl = G.gl; gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  function off() { G.ok = false; if (G.cv) G.cv.style.display = 'none'; }
  window.FBGL = { attach, frame, canBlend, off, clear, get ok() { return G.ok; }, get canvas() { return G.cv; } };
})();

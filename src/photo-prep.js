// Shared photo preparation for the photo-start page and the client hub dialog: read the file, downscale to a sensible
// long edge, and trim app chrome (status bar, Instagram/Pinterest header, caption, tab bar) from screenshots.
(function () {
  const LONG_EDGE = 1600;
  function loadImage(file) { return new Promise((res, rej) => { const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not an image we can read')); }; img.src = url; }); }
  function toCanvas(img) { const r = Math.min(1, LONG_EDGE / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * r)); c.height = Math.max(1, Math.round(img.naturalHeight * r)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; }
  // Screenshot chrome rows are mostly one flat colour (with sparse text); the picture itself is not. Keep the longest run
  // of picture rows, then tighten the sides. Returns a trimmed canvas, or null when there is nothing worth trimming.
  function autoTrim(c) {
    const w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data;
    const flatness = (idx, n, step) => { const r0 = d[idx * 4], g0 = d[idx * 4 + 1], b0 = d[idx * 4 + 2]; let same = 0; for (let k = 0; k < n; k++) { const i = (idx + k * step) * 4; if (Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) < 30) same++; } return same / n; };
    const longest = (isPic, len, gap) => { let best = [0, -1], s = -1, miss = 0; for (let i = 0; i < len; i++) { if (isPic(i)) { if (s < 0) s = i; miss = 0; if (i - s > best[1] - best[0]) best = [s, i]; } else if (s >= 0 && ++miss > gap) { s = -1; miss = 0; } } return best; };
    const rowPic = new Array(h); for (let y = 0; y < h; y++) rowPic[y] = flatness(y * w, w, 1) < 0.88;
    let [top, bot] = longest(y => rowPic[y], h, Math.round(h * 0.02)); if (bot - top < h * 0.1) return null;
    const colPic = new Array(w); for (let x = 0; x < w; x++) { let k = 0, n = 0; for (let y = top; y <= bot; y += 2) { n++; const i = (y * w + x) * 4, j = (y * w) * 4; if (Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) >= 30) k++; } colPic[x] = k / n > 0.12; }
    let [left, right] = longest(x => colPic[x], w, Math.round(w * 0.02)); if (right - left < w * 0.3) { left = 0; right = w - 1; }
    const my = Math.round(h * 0.012), mx = Math.round(w * 0.012); top = Math.max(0, top - my); bot = Math.min(h - 1, bot + my); left = Math.max(0, left - mx); right = Math.min(w - 1, right + mx);
    if (top < 8 && h - 1 - bot < 8 && left < 8 && w - 1 - right < 8) return null;
    const o = document.createElement('canvas'); o.width = right - left + 1; o.height = bot - top + 1; o.getContext('2d').drawImage(c, left, top, o.width, o.height, 0, 0, o.width, o.height); return o;
  }
  const jpeg = c => c.toDataURL('image/jpeg', 0.86);
  // One prepared shot per image file: { name, original, trimmed|null, useTrim }
  async function prepare(file) { const img = await loadImage(file), c = toCanvas(img), t = autoTrim(c); return { name: file.name, original: jpeg(c), trimmed: t ? jpeg(t) : null, useTrim: Boolean(t) }; }
  const isImageFile = f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name);
  window.PhotoPrep = { loadImage, toCanvas, autoTrim, jpeg, prepare, isImageFile, LONG_EDGE };
})();

// Encodes pictures for the Studio and the flats off the page's own thread (served as /lab/lab-encode-worker.js): a PNG of a 2000 px picture
// takes a quarter of a second or more to make, and on the page that is a quarter of a second in which a Pencil stroke does not draw.
// In: { id, bmp: ImageBitmap, type, quality, ink }. Out: { id, url } (a data: URL, the same as canvas.toDataURL gives) or { id, err }.
// With ink: first whether anything is drawn on it at all ({ id, ink: false } and no picture when it is empty).
self.onmessage = async e => {
  const { id, bmp, type = 'image/png', quality, ink } = e.data || {};
  try {
    const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d');
    x.drawImage(bmp, 0, 0); bmp.close?.();
    if (ink) { const d = x.getImageData(0, 0, c.width, c.height).data; let any = false; for (let i = 3; i < d.length; i += 4) if (d[i]) { any = true; break; } if (!any) { self.postMessage({ id, ink: false }); return; } }
    const blob = await c.convertToBlob(quality == null ? { type } : { type, quality });
    const url = new FileReaderSync().readAsDataURL(blob);
    self.postMessage({ id, url, ink: true });
  } catch (err) { self.postMessage({ id, err: String(err?.message || err) }); }
};

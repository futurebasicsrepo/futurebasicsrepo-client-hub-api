// Finds a panel of the flat (the part a tap lands in, up to its seams) off the page's thread (served as /lab/lab-panels-worker.js, a module
// worker): on a big sketch it is a tenth of a second or more, a third of a second on an iPad, and on the page that is a frozen tap.
// In: { id, key, img?: { data, width, height }, at: [x, y] } — the sketch's pixels come once per sketch (key), then only the taps.
// Out: { id, panel } (what panelAt gives: null when the tap is not inside a panel) or { id, err }.
import { panelAt } from '/lab/lab-flat-panels.js';

let IMG = null, KEY = null;
self.onmessage = e => {
  const { id, key, img, at } = e.data || {};
  try {
    if (img) { IMG = img; KEY = key; }
    if (!IMG || key !== KEY) throw new Error('no sketch');
    self.postMessage({ id, panel: panelAt(IMG, at[0], at[1]) });
  } catch (err) { self.postMessage({ id, err: String(err?.message || err) }); }
};

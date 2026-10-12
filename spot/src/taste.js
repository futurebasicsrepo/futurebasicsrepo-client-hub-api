// Spot's read on a shopper's taste, learned from what they do on Spot:
// open a product (+1), watch it (+3), choose it to pay or ask (+5), say "not
// for me" (−4). The learning runs in the shopper's browser (client/home.js)
// and, signed in, is kept on their account so it follows them and shapes new
// searches: the AI gets a gentle line about it (promptLine). Here it's only
// checked, stored, and turned into words.
//
// taste = { v: 1, n, stores: { name: weight }, words: { word: weight },
//           price: { sum, w } }   (weights decay a little with every signal)
const MAX_STORES = 40;
const MAX_WORDS = 80;
const clamp = (x) => Math.max(-50, Math.min(50, Number(x) || 0));
const top = (o, n, cmp) => Object.entries(o || {}).filter(([, w]) => cmp(w)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, n).map(([k]) => k);

export function cleanTaste(t) {
  if (!t || typeof t !== 'object') return null;
  const map = (o, max, len) =>
    Object.fromEntries(
      Object.entries(o && typeof o === 'object' ? o : {})
        .filter(([k, w]) => typeof k === 'string' && k.trim() && k.length <= len && Number.isFinite(Number(w)))
        .map(([k, w]) => [k.trim().toLowerCase(), clamp(w)])
        .filter(([, w]) => Math.abs(w) >= 0.05)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, max),
    );
  const sum = Number(t.price?.sum);
  const w = Number(t.price?.w);
  return {
    v: 1,
    n: Math.max(0, Math.min(1e6, Math.round(Number(t.n) || 0))),
    stores: map(t.stores, MAX_STORES, 60),
    words: map(t.words, MAX_WORDS, 30),
    price: Number.isFinite(sum) && Number.isFinite(w) && w > 0 && sum > 0 && sum / w < 10_000_000 ? { sum, w } : { sum: 0, w: 0 },
  };
}

// What Spot has learned, in a few words: liked stores and words, the usual
// price band, and what they're not into.
export function summary(t) {
  if (!t) return null;
  const avg = t.price?.w > 0 ? t.price.sum / t.price.w : null;
  return {
    stores: top(t.stores, 4, (w) => w >= 1),
    words: top(t.words, 6, (w) => w >= 1),
    avoid_stores: top(t.stores, 3, (w) => w <= -1.5),
    avoid_words: top(t.words, 4, (w) => w <= -1.5),
    price: avg ? { low: Math.round((avg * 0.6) / 100) * 100, high: Math.round((avg * 1.5) / 100) * 100 } : null,
    n: t.n || 0,
  };
}

const dollars = (c) => `$${Math.round(c / 100)}`;

// A line for the lookup prompt, once there's enough to go on.
export function promptLine(t) {
  const s = summary(t);
  if (!s || s.n < 5) return '';
  const bits = [];
  if (s.stores.length) bits.push(`stores they like: ${s.stores.join(', ')}`);
  if (s.words.length) bits.push(`things they go for: ${s.words.join(', ')}`);
  if (s.price && s.price.high > 0) bits.push(`they usually spend about ${dollars(s.price.low)}–${dollars(s.price.high)}`);
  if (s.avoid_stores.length || s.avoid_words.length) bits.push(`not for them: ${[...s.avoid_stores, ...s.avoid_words].join(', ')}`);
  if (!bits.length) return '';
  return `What Spot has learned from what they open, watch and choose (a gentle hint for ranking only; what they typed always wins, and still show variety): ${bits.join('; ')}.`.replace(/["\n]/g, ' ').slice(0, 600);
}

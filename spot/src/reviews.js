// Fit and reviews, on a card: an AI reads what buyers say about a product
// (the store's own reviews first, then other places that review it) and
// boils it down to a rating, how it fits, two or three pros and a con. With
// the shopper's saved sizes, "runs half a size small" becomes "we'd get 10.5
// for you". Kept two weeks per product page; the source is always linked.
//
// digest = { rating, count, source_url, fit: 'small' | 'true' | 'large' | null,
//   advice: 'down' | 'half_down' | 'true' | 'half_up' | 'up' | null,
//   size_kind: 'shoes' | 'tops' | 'bottoms' | 'dresses' | null,
//   fit_note, pros: [], cons: [], summary }   or { none: true }
import { readJson } from './capture.js';
import { Anthropic, anthropicClient } from './anthropic.js';

const DAY = 86_400_000;
const TTL = 14 * DAY;
const RETRY = DAY;
const ADVICE = ['down', 'half_down', 'true', 'half_up', 'up'];
const KINDS = ['shoes', 'tops', 'bottoms', 'dresses'];
const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

const line = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

// The model's answer, checked: numbers in range, words from the lists,
// a real link, short lines.
export function digestFrom(v) {
  if (!v || typeof v !== 'object') return null;
  if (v.none === true) return { none: true };
  const rating = Number(v.rating);
  const count = Number(v.count);
  const src = line(v.source_url, 500);
  const out = {
    rating: rating >= 1 && rating <= 5 ? Math.round(rating * 10) / 10 : null,
    count: Number.isInteger(count) && count > 0 && count < 10_000_000 ? count : null,
    source_url: /^https:\/\/[^\s"'<>]+$/i.test(src) ? src : null,
    fit: ['small', 'true', 'large'].includes(v.fit) ? v.fit : null,
    advice: ADVICE.includes(v.advice) ? v.advice : null,
    size_kind: KINDS.includes(v.size_kind) ? v.size_kind : null,
    fit_note: line(v.fit_note, 120) || null,
    pros: (Array.isArray(v.pros) ? v.pros : []).map((x) => line(x, 60)).filter(Boolean).slice(0, 3),
    cons: (Array.isArray(v.cons) ? v.cons : []).map((x) => line(x, 60)).filter(Boolean).slice(0, 2),
    summary: line(v.summary, 160) || null,
  };
  // Nothing to stand on without where it came from.
  if (!out.source_url) return { none: true };
  if (out.rating == null) out.count = null;
  return out;
}

// Their saved size, moved the way reviewers say: 10 + half_up → 10.5,
// M + up → L. null when it can't be done honestly.
export function sizeFor(saved, advice) {
  if (!saved || !advice || advice === 'true') return advice === 'true' && saved ? String(saved) : null;
  const s = String(saved).trim();
  const num = s.match(/^(\D*?)(\d+(?:\.5)?)(\D*)$/);
  if (num) {
    const step = { down: -1, half_down: -0.5, half_up: 0.5, up: 1 }[advice];
    const n = Number(num[2]) + step;
    return n > 0 ? `${num[1]}${n % 1 ? n.toFixed(1) : n}${num[3]}`.trim() : null;
  }
  const i = LETTERS.indexOf(s.toUpperCase());
  if (i < 0) return null;
  const j = i + { down: -1, half_down: 0, half_up: 0, up: 1 }[advice];
  // Half a size on letter sizes: no smaller step to suggest.
  if (j === i || j < 0 || j >= LETTERS.length) return null;
  return LETTERS[j];
}

async function readReviews({ url, title, store }, { client, onUsage, onError } = {}) {
  const anthropic = client ?? anthropicClient();
  const q = (x) => String(x || '').replace(/[\n"]/g, ' ').slice(0, 160);
  const content = `What do buyers say about this product?
Product: "${q(title)}"${store ? ` from ${q(store)}` : ''}
Page: ${url}
Read its reviews: the store's own page first (web_fetch), then a search for other reviews of this exact product if the page has none. Don't guess, and don't use reviews of a different product.
Reply with ONLY this JSON:
{"rating": average stars out of 5 or null, "count": number of reviews or null, "source_url": "https address where you read the reviews",
 "fit": "small" | "true" | "large" | null, "advice": "down" | "half_down" | "true" | "half_up" | "up" | null (what size to order versus your usual, if reviewers agree),
 "size_kind": "shoes" | "tops" | "bottoms" | "dresses" | null,
 "fit_note": "a few words on fit, as reviewers put it, or empty",
 "pros": ["up to 3 things buyers love, a few words each"], "cons": ["up to 2 common complaints"],
 "summary": "one plain sentence"}
Or {"none": true} if you can't find reviews of this product.`;
  const messages = [{ role: 'user', content }];
  try {
    let response;
    for (let i = 0; i < 3; i++) {
      response = await anthropic.beta.messages.create({
        model: process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5',
        max_tokens: 2500,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low' },
        tools: [
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 3, max_content_tokens: 30000 },
          { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
        ],
        messages,
      });
      onUsage?.(response.model, response.usage);
      if (response.stop_reason !== 'pause_turn') break;
      messages.push({ role: 'assistant', content: response.content });
    }
    return digestFrom(readJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join('')));
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) return undefined;
    throw err;
  }
}

export function createReviews({ db, client = null, read = readReviews, onUsage, onError, log = console } = {}) {
  const inflight = new Map();
  async function digest(item, now = Date.now()) {
    const url = String(item.url);
    const got = db.reviews.get(url);
    if (got && now - got.at < (got.none ? RETRY : TTL)) return got;
    if (!inflight.has(url)) {
      inflight.set(
        url,
        read({ url, title: item.title, store: item.store }, { client, onUsage, onError })
          .then((d) => {
            if (d === undefined) return null;
            const doc = d || { none: true };
            db.reviews.set(url, doc, now); // the caller's clock, so a read that takes a moment does not shift when it expires
            return { ...doc, at: now };
          })
          .catch((err) => (log.warn?.({ err, url }, 'reviews read failed'), null))
          .finally(() => inflight.delete(url)),
      );
    }
    return inflight.get(url);
  }
  return {
    // The digest, with their size worked out when reviewers agree on fit.
    async forShopper(item, sizes = {}, now = Date.now()) {
      const d = await digest(item, now);
      if (!d) return null;
      if (d.none) return { none: true };
      const { at, ...rest } = d;
      const saved = d.size_kind ? sizes?.[d.size_kind] : null;
      return { ...rest, your_size: saved ? sizeFor(saved, d.advice) : null, saved_size: saved || null };
    },
  };
}

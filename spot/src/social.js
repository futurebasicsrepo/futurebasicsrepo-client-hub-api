// Links shared from social apps: a TikTok, an Instagram post, a Pin, a
// Facebook post. Spot can't check out inside those apps, so a shared post
// becomes a search: what the post says it is (its caption, from the app's
// public embed info or the page's share tags) → that product at the brand's
// own store, where Spot can buy it.
import { Anthropic, anthropicClient } from './anthropic.js';
import { IMAGE_TYPES, assertPublicHost, decode, readCapped, readMeta } from './capture.js';

const SITES = [
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)instagram\.com$|^instagr\.am$/, 'Instagram'],
  [/(^|\.)threads\.(net|com)$/, 'Threads'],
  [/(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me)$/, 'Facebook'],
  [/(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$|^pin\.it$/, 'Pinterest'],
  [/(^|\.)(youtube\.com|youtu\.be)$/, 'YouTube'],
  [/(^|\.)(x\.com|twitter\.com)$/, 'X'],
  [/(^|\.)snapchat\.com$/, 'Snapchat'],
];
// Apps with a public embed endpoint that names the post (no key needed).
const OEMBED = {
  TikTok: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  YouTube: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  Pinterest: (u) => `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(u)}`,
};
const TIMEOUT_MS = 6000; // the whole read: redirects, embed info and page
const MAX_HTML_BYTES = 2_000_000; // a Pin's page runs past 1MB before its share tags
const UA = 'Mozilla/5.0 (compatible; SpotBot/0.2; +https://spotmeplease.com/for-stores)';

// { name: 'TikTok', marketplace } for a link from a social app, else null.
export function socialOf(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const hit = SITES.find(([re]) => re.test(host));
  if (!hit) return null;
  return { name: hit[1], marketplace: hit[1] === 'Facebook' && /^\/marketplace\//i.test(u.pathname) };
}

// Share tags that say nothing about the post: the app's own name, a sign-in wall.
const EMPTY = /^(tiktok|instagram|threads|facebook|pinterest|youtube|x|twitter|snapchat)\b[^a-z]*(make your day|log ?in|sign ?up|home|video|photo|\.com)?[^a-z]*$|^(log ?in|sign ?up|page not found|error)\b/i;
const tidy = (s) =>
  decode(String(s || ''))
    .replace(/\s+/g, ' ')
    .trim();
// Instagram writes "1,234 likes, 56 comments - someone on October 1, 2026: "caption"".
const stripCounts = (s) => s.replace(/^[\d.,kKmM]+ (likes?|views?|reactions?)[^:]*?:\s*/i, '').replace(/^["“](.*)["”]\.?$/, '$1');
const useful = (s) => (s && s.length >= 4 && !EMPTY.test(s) ? s : '');

const httpUrl = (u) => (/^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u).slice(0, 1000) : '');

// What a shared post shows: { name, url, caption, author, image_url, marketplace }.
// caption is '' when the app wouldn't say (a sign-in wall); never throws.
export async function readPost(rawUrl, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  const site = socialOf(rawUrl);
  if (!site) return null;
  const post = { ...site, url: rawUrl, caption: '', author: '', image_url: '' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const get = (u, accept) => fetchImpl(u, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': UA, accept } });
  let res = null;
  try {
    // Short links (vm.tiktok.com, pin.it) redirect to the post itself; only
    // follow them while they stay on the app, each host checked like a store's.
    let url = new URL(rawUrl);
    for (let hop = 0; hop < 5; hop++) {
      if (!allowPrivate) await assertPublicHost(url.hostname);
      const r = await get(url, 'text/html');
      const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
      if (!loc) {
        res = r.ok ? r : null;
        break;
      }
      await r.body?.cancel?.().catch(() => {});
      const next = new URL(loc, url);
      if (!socialOf(next.href)) break;
      url = next;
      Object.assign(post, socialOf(url.href), { url: url.href });
    }
  } catch {
    res = null;
  }
  const embed = OEMBED[post.name];
  if (embed) {
    try {
      const r = await get(embed(post.url.replace(/[?#].*$/, '')), 'application/json');
      if (r.ok) {
        const j = await r.json();
        post.caption = useful(tidy(j.title));
        post.author = tidy(j.author_name);
        // Pinterest's embed photo is a 236px thumbnail; the same pin comes at 736px.
        post.image_url = httpUrl(j.thumbnail_url).replace(/(\/\/i\.pinimg\.com)\/236x\//, '$1/736x/');
      }
    } catch {}
  }
  if ((!post.caption || !post.image_url) && res) {
    try {
      const m = readMeta(await readCapped(res, MAX_HTML_BYTES));
      post.image_url ||= httpUrl(decode(m['og:image'] || m['twitter:image'] || ''));
      if (!post.caption) {
        const desc = useful(stripCounts(tidy(m['og:description'] || m.description || m['twitter:description'])));
        const title = useful(tidy(m['og:title'] || m['twitter:title']));
        // The longer of the two usually is the caption; the other the poster's name.
        post.caption = [desc, title].sort((a, b) => b.length - a.length)[0] || '';
        if (!post.author && title && title !== post.caption) post.author = title.replace(/ (on|\|) .*$/i, '');
      }
    } catch {}
  } else await res?.body?.cancel?.().catch(() => {});
  clearTimeout(timer);
  post.caption = post.caption.slice(0, 500);
  post.author = post.author.slice(0, 80);
  return post;
}

// What the post's photo shows, in a line ("Arc'teryx Beta jacket in black,
// hood up"), so a pin with no words or a caption of only hashtags still
// finds the product. '' when there's no product in it or no model to ask.
// Spot fetches the photo itself: the apps' image hosts (pinimg, TikTok's
// signed CDN) turn away the model's own fetch.
const MAX_PHOTO_BYTES = 5_000_000;
export async function fetchPhoto(u, { fetchImpl = fetch, allowPrivate = process.env.SPOT_ALLOW_PRIVATE_FETCH === '1' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = new URL(u);
    if (!allowPrivate) await assertPublicHost(url.hostname);
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'error', headers: { 'user-agent': UA, accept: 'image/*' } });
    const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !IMAGE_TYPES.includes(type)) return await res.body?.cancel?.().catch(() => {}), null;
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PHOTO_BYTES) return await reader.cancel().catch(() => {}), null;
      chunks.push(value);
    }
    return { media_type: type, data: Buffer.concat(chunks).toString('base64') };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function describePhoto(post, { client, onUsage, onError, fetchImpl, allowPrivate } = {}) {
  if (!post?.image_url || (!client && !process.env.ANTHROPIC_API_KEY)) return '';
  const photo = await fetchPhoto(post.image_url, { fetchImpl, allowPrivate });
  if (!photo) return console.error('post photo: could not fetch', post.name), '';
  const anthropic = client ?? anthropicClient();
  try {
    const response = await anthropic.beta.messages.create({
      model: process.env.SPOT_LOOKUP_MODEL || 'claude-sonnet-5-5',
      max_tokens: 300,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', ...photo } },
            {
              type: 'text',
              text: `This is the photo from a ${post.name} post${post.caption ? ` captioned "${post.caption.replace(/"/g, "'")}"` : ''}. What product in it would someone want to buy? Name the brand and model if a logo, tag or the caption shows it; otherwise describe it exactly (kind, colour, material, details). If it shows several, name the main ones. One line, under 30 words, nothing else. If it shows no product, reply NONE.`,
            },
          ],
        },
      ],
    });
    onUsage?.(response.model, response.usage);
    const line = tidy(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(' '));
    return /^none\b/i.test(line) || response.stop_reason === 'refusal' ? '' : line.slice(0, 300);
  } catch (err) {
    onError?.(err);
    if (err instanceof Anthropic.APIError) return console.error('post photo failed', err.status, err.message), ''; // the caption alone, then
    throw err;
  }
}

// The search for what a post shows (its caption, and its photo as `seen`),
// in the shopper's words if they added any ("this in black"). Holds no
// link, so the lookup searches instead of reading the app's page.
export function postAsk(post, said = '') {
  let words = String(said || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  // The app's own share text ("Check out Kai's video! #TikTok") says nothing.
  if (/^(check out|watch|look at|see) .*\b(video|post|pin|reel|tiktok|instagram)\b/i.test(words) || /^#?(tiktok|instagram|pinterest)\b/i.test(words)) words = '';
  const shows = [post.caption && `its caption says "${post.caption}"`, post.seen && `its photo shows ${post.seen}`].filter(Boolean).join(', and ');
  const what = post.marketplace
    ? `the item in this Facebook Marketplace listing (${shows}). Marketplace sellers are people, not stores, so find the same product new at stores that sell it.`
    : `the product in this ${post.name} post${post.author ? ` by ${post.author}` : ''} (${shows}). Find that exact product (same brand and model) at the brand's own online store first, then other stores that sell it, not on ${post.name}. If the post shows several things, find each.`;
  return `${words ? `${words.replace(/[.!?]+$/, '')}. ` : ''}Find ${what}`;
}

// When the app wouldn't say what's in the post.
export const postWarning = (post) =>
  `${post.name} didn’t show Spot what’s in that ${post.marketplace ? 'listing' : 'post'}. Screenshot it and drop the screenshot here, or say what it is`;

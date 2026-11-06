// Google's models through the Gemini API (Google AI Studio key): its image model for edits that must keep what they are given, and Veo for video.
//
// Which jobs go to Google (src/check.js imageConfig decides; IMAGE_EDIT_PROVIDER and IMAGE_GEN_PROVIDER override):
//   edits with reference pictures (a flat drawn as a photograph, an on-model view, a print laid on a garment, the picture redrawn from the flats,
//   the studio's AI changes): Google first. Its image model holds a garment, a logo and its proportions through an edit more faithfully.
//   a picture from words alone, or an edit inside a painted mask: OpenAI first (Google's API takes no mask).
//   Either way, if the first provider fails the other is tried once, so one provider's outage or refusal does not stop the work.
//   video (the walk): Veo, since OpenAI shut its video model (Sora) down.
//
// The key: GEMINI_API_KEY (or GOOGLE_AI_API_KEY), taken as set; or a looser name (google_ai_studio), used only when its value looks like a Google
// API key ("AIza…"), so a variable holding something else is never sent to Google.
import { trackedFetch } from './telemetry.js';

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
export const GOOGLE_KEY_VARS = ['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_GENAI_API_KEY', 'google_ai_studio', 'GOOGLE_AI_STUDIO'];
// a variable named for Gemini is taken as it is (Google's keys are not all "AIza…"), less any quotes pasted round it; a variable with a looser
// name is used only when its value looks like a Google API key
const EXPLICIT = new Set(['GEMINI_API_KEY', 'GOOGLE_AI_API_KEY', 'GOOGLE_GENAI_API_KEY']);
export function googleKey(env = process.env) {
  for (const k of GOOGLE_KEY_VARS) {
    const v = String(env[k] || '').trim().replace(/^(['"])(.*)\1$/, '$2').trim();
    if (EXPLICIT.has(k) ? /^[\x21-\x7e]{20,}$/.test(v) : /^AIza[0-9A-Za-z_-]{20,}$/.test(v)) return { key: v, from: k };
  }
  return null;
}
// what is wrong with a key that is set but not used: said at start, without the key
export function googleKeyProblem(env = process.env) {
  if (googleKey(env)) return null;
  const set = GOOGLE_KEY_VARS.filter(k => String(env[k] || '').trim());
  if (!set.length) return null;
  const v = String(env[set[0]]).trim();
  return `${set[0]} is set but is not used: ${v.length < 20 ? 'it is too short to be a key' : /\s/.test(v) ? 'it has spaces in it' : 'it does not look like a Google API key'} (${v.length} characters)`;
}
// one cheap call that says whether Google accepts the key (the list of models, one entry): { ok, status }
export async function checkGoogleKey(env = process.env, fetchImpl = fetch) {
  const k = googleKey(env); if (!k) return { ok: false, status: 0 };
  try { const r = await fetchImpl(`${GEMINI_ORIGIN(env)}/v1beta/models?pageSize=1`, { headers: { 'x-goog-api-key': k.key }, signal: AbortSignal.timeout(10000) }); return { ok: r.ok, status: r.status }; }
  catch (e) { return { ok: false, status: 0, error: String(e.message).slice(0, 120) }; }
}
export const GEMINI_ORIGIN = (env = process.env) => env.GEMINI_API_ORIGIN || 'https://generativelanguage.googleapis.com';
export function googleImageConfig(env = process.env) {
  const k = googleKey(env); if (!k) return { configured: false };
  return { configured: true, keyFrom: k.from, model: env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image-preview', fallbackModel: env.GEMINI_IMAGE_FALLBACK_MODEL || 'gemini-2.5-flash-image', imageSize: env.GEMINI_IMAGE_SIZE || '2K' };
}

// the size the rest of the service asks for ("1024x1536"), as the aspect ratio Google takes
export function aspectOf(size = '1024x1024') {
  const [w, h] = String(size).split('x').map(Number); if (!(w > 0 && h > 0)) return '1:1';
  const r = w / h, known = [['1:1', 1], ['2:3', 2 / 3], ['3:2', 3 / 2], ['3:4', .75], ['4:3', 4 / 3], ['9:16', 9 / 16], ['16:9', 16 / 9], ['4:5', .8], ['5:4', 1.25], ['21:9', 21 / 9]];
  return known.sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0];
}
const mimeOf = b => (b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : b[0] === 0x52 && b[1] === 0x49 ? 'image/webp' : 'image/jpeg');

// One picture from Google's image model: the prompt, and the reference pictures it must keep. → Buffer (PNG or JPEG as Google sends it)
export async function geminiImage({ prompt, images = [], size = '1024x1024', cfg = googleImageConfig(), env = process.env, fetchImpl = trackedFetch }) {
  const k = googleKey(env); if (!k || !cfg.configured) throw Object.assign(new Error('No Google AI key is set'), { status: 0 });
  const once = async model => {
    const parts = [{ text: prompt }, ...images.slice(0, 6).map(b => ({ inline_data: { mime_type: mimeOf(b), data: Buffer.from(b).toString('base64') } }))];
    const imageConfig = { aspectRatio: aspectOf(size), ...(/gemini-3/.test(model) && cfg.imageSize ? { imageSize: cfg.imageSize } : {}) };
    const res = await fetchImpl('imagegen', `${GEMINI_ORIGIN(env)}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': k.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['IMAGE'], imageConfig } }), signal: AbortSignal.timeout(180000)
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); throw Object.assign(new Error(`Google's image model refused the request (${res.status}): ${clip(t, 200)}`), { status: res.status }); }
    const j = await res.json(), c = j?.candidates?.[0], p = (c?.content?.parts || []).find(x => x.inlineData?.data || x.inline_data?.data);
    if (p) return Buffer.from((p.inlineData || p.inline_data).data, 'base64');
    const why = c?.finishReason || j?.promptFeedback?.blockReason || 'no image in the answer';
    throw Object.assign(new Error(`Google's image model returned no picture (${why})`), { status: 422, blocked: /SAFETY|BLOCK|PROHIBITED|IMAGE_OTHER/i.test(why) });
  };
  try { return await once(cfg.model); }
  catch (e) {
    // a model name this key does not know yet: the older image model, once
    if (cfg.fallbackModel && cfg.fallbackModel !== cfg.model && (e.status === 400 || e.status === 404) && /model|not found|unknown|unsupported|imageSize|image_size/i.test(e.message)) {
      console.warn(JSON.stringify({ level: 'warn', msg: 'Google image model refused, using the fallback', model: cfg.model, fallback: cfg.fallbackModel }));
      return once(cfg.fallbackModel);
    }
    throw e;
  }
}

// ---- video (Veo) ----
export function googleVideoConfig(env = process.env) {
  const k = googleKey(env); if (!k) return { configured: false };
  return { provider: 'google', configured: true, model: env.GEMINI_VIDEO_MODEL || 'veo-3.1-generate-preview', seconds: String([4, 6, 8].includes(Number(env.LAB_VIDEO_SECONDS)) ? env.LAB_VIDEO_SECONDS : 8), aspect: env.LAB_VIDEO_ASPECT || '9:16', origin: GEMINI_ORIGIN(env) };
}
// The Veo models a key can run (predictLongRunning), best first: the newest version, the full model before the fast one, a released model before
// a preview. Asked once a day and kept, so a renamed preview does not stop the walk.
export function rankVeo(names) {
  const ver = n => Number((/veo-(\d+(?:\.\d+)?)/.exec(n) || [])[1] || 0);
  return [...names].sort((a, b) => ver(b) - ver(a) || Number(/fast/.test(a)) - Number(/fast/.test(b)) || Number(/preview|exp/.test(a)) - Number(/preview|exp/.test(b)) || a.localeCompare(b));
}
let VEO = null, VEO_SEEN = null;
// what the last look at the key's models found, so a walk that cannot be made says why: { status, listed, veo: [names] }
export const veoSeen = () => VEO_SEEN;
export async function bestVeo({ origin, key, fetchImpl = fetch, not = '' }) {
  if (!VEO || Date.now() - VEO.at > 864e5) {
    const names = [], seen = { status: 0, listed: 0, veo: [] }; let page = '';
    for (let i = 0; i < 5; i++) {
      const r = await fetchImpl(`${origin}/v1beta/models?pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(20000) }).catch(() => null);
      seen.status = r?.status || 0; if (!r?.ok) break; const j = await r.json().catch(() => ({}));
      for (const m of j.models || []) { seen.listed++; const n = String(m.name || '').replace(/^models\//, ''); if (/veo/i.test(n)) { seen.veo.push(n); if ((m.supportedGenerationMethods || []).includes('predictLongRunning')) names.push(n); } }
      if (!j.nextPageToken) break; page = j.nextPageToken;
    }
    VEO_SEEN = seen; if (!names.length) return null; VEO = { at: Date.now(), list: rankVeo(names) };
  }
  return VEO.list.find(n => n !== not) || null;
}
// why no Veo model could be used, in words for the board
export function veoWhy(seen) {
  if (!seen) return '';
  if (!seen.status || seen.status >= 400) return ` The list of models this Google AI key can use could not be read (${seen.status || 'no answer'}).`;
  if (!seen.veo.length) return ` This Google AI key can use ${seen.listed} Google models but no Veo video model: Veo is offered only to keys on a paid Gemini API plan. Turn on billing for the key's Google Cloud project (Google AI Studio → API keys → the key's project → Billing), or make the key in a project that has it, then make the walk again.`;
  return ` The key lists ${seen.veo.join(', ')}, but none of them makes videos through the API (predictLongRunning).`;
}
export const _resetVeo = () => { VEO = null; VEO_SEEN = null; };
// A short clip from a prompt and (optionally) a first frame. Veo works as a long job: start it, ask how it is getting on, fetch the file.
// → { video: Buffer, mime, model }. `fetchImpl` and `sleep` are replaceable so this runs in tests without a network.
export async function veoVideo({ prompt, image = null, cfg: cfg0 = googleVideoConfig(), env = process.env, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const k = googleKey(env); if (!k) throw new Error('No Google AI key is set');
  let cfg = cfg0; const H = { 'x-goog-api-key': k.key, 'Content-Type': 'application/json' };
  const start = async withImage => fetchImpl(`${cfg.origin}/v1beta/models/${encodeURIComponent(cfg.model)}:predictLongRunning`, {
    method: 'POST', headers: H, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ instances: [{ prompt, ...(withImage && image ? { image: { bytesBase64Encoded: Buffer.from(image).toString('base64'), mimeType: mimeOf(image) } } : {}) }], parameters: { aspectRatio: cfg.aspect, durationSeconds: Number(cfg.seconds), ...(withImage && image ? { personGeneration: 'allow_adult' } : {}) } })
  });
  let r = await start(Boolean(image));
  // the model name retired or not offered to this key (Google renames the Veo previews): ask which Veo models the key has, take the best, try again
  let why = '';
  if (r.status === 404) { const best = await bestVeo({ origin: cfg.origin, key: k.key, fetchImpl, not: cfg.model }); if (best) { cfg = { ...cfg, model: best }; r = await start(Boolean(image)); } else why = veoWhy(veoSeen()); }
  // a first frame refused (a face, a policy): the clip is made from the words alone
  if (!r.ok && image && r.status >= 400 && r.status < 500 && r.status !== 401 && r.status !== 403 && r.status !== 429) r = await start(false);
  if (!r.ok) { const t = await r.text().catch(() => ''); let said = t; try { said = JSON.parse(t)?.error?.message || t; } catch { /* not JSON */ } throw new Error(why ? `Google has no video model for this key (${cfg.model} is not found).${why}` : `Google's video model (${cfg.model}) refused the request (${r.status}): ${clip(said, 160)}`); }
  let op = await r.json();
  for (let i = 0; i < 90 && !op.done; i++) {
    await sleep(Number(env.LAB_VIDEO_POLL_MS) || 10000);
    const q = await fetchImpl(`${cfg.origin}/v1beta/${op.name}`, { headers: H, signal: AbortSignal.timeout(60000) });
    if (!q.ok) throw new Error(`Google's video model could not be asked how it was getting on (${q.status})`);
    op = await q.json();
  }
  if (!op.done) throw new Error('The video model took too long. Try again.');
  if (op.error) throw new Error(`The video model could not make it: ${clip(op.error.message || 'no reason given', 160)}`);
  const sample = op.response?.generateVideoResponse?.generatedSamples?.[0] || op.response?.generatedVideos?.[0], uri = sample?.video?.uri;
  if (!uri) throw new Error(`The video model returned no clip${op.response?.generateVideoResponse?.raiMediaFilteredReasons ? `: ${clip(op.response.generateVideoResponse.raiMediaFilteredReasons.join(' '), 160)}` : ''}`);
  const dl = await fetchImpl(uri, { headers: { 'x-goog-api-key': k.key }, redirect: 'follow', signal: AbortSignal.timeout(180000) });
  if (!dl.ok) throw new Error(`The finished video could not be fetched (${dl.status})`);
  return { video: Buffer.from(await dl.arrayBuffer()), mime: 'video/mp4', model: cfg.model };
}

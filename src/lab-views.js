// The assortment board's pictures. A concept has one drawn picture; this makes the rest from it: the piece laid flat (front and back), the piece on a model
// (front, three-quarter, side, back, which the board can spin through) and, with a video model connected, a short walk. Every view is drawn from the concept's own
// picture as the reference, so the shape, colours, logo and graphics stay the ones the team approved. Nothing here names or copies another brand.
import sharp from 'sharp';
import { imageConfig, openaiEdit } from './check.js';
import { categoryLabel } from './lab.js';
import { norm } from './lab-concepts.js';

export const VIEW_KINDS = [
  { id: 'flat_front', label: 'Flat, front', group: 'flat' }, { id: 'flat_back', label: 'Flat, back', group: 'flat' },
  { id: 'model_front', label: 'On model, front', group: 'model' }, { id: 'model_34', label: 'On model, three-quarter', group: 'model' },
  { id: 'model_side', label: 'On model, side', group: 'model' }, { id: 'model_back', label: 'On model, back', group: 'model' }
];
export const SPIN_KINDS = ['model_front', 'model_34', 'model_side', 'model_back']; // the order the board turns through
export const KIND_IDS = VIEW_KINDS.map(k => k.id);
export const isKind = k => KIND_IDS.includes(k);
// a home or object has nobody to wear it, so it gets the flat views only
export const kindsFor = category => (category === 'home' ? VIEW_KINDS.filter(k => k.group === 'flat').map(k => k.id) : KIND_IDS);
export const canWalk = category => category !== 'home';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// How each kind of product is photographed on a person.
const FRAMING = {
  headwear: 'a head-and-shoulders photograph, the face partly in shadow under the brim so the cap is the subject',
  footwear: 'a photograph of the lower legs and feet only, standing on a plain floor, the shoes fully in frame',
  bags: 'a photograph from the knees up with the bag carried the way it is meant to be carried, the bag clearly in view',
  accessories: 'a close photograph of the piece being worn the way it is meant to be worn',
  bottoms: 'a full-length photograph from head to toe, standing',
  default: 'a full-length photograph from head to toe, standing relaxed'
};
const ANGLE = {
  model_front: 'seen straight from the front',
  model_34: 'seen from three-quarters front, turned about 45 degrees',
  model_side: 'seen from the side, turned 90 degrees',
  model_back: 'seen from directly behind'
};
const FLAT_SHOE = 'a single shoe in side profile, toe pointing left';

const KEEP = 'Keep the exact shape, proportions, fabric, colours, trims, logo and graphics of the reference: same artwork, in the same place, in the same colours. Ignore the small dark inset label card in a corner of the reference picture: do not draw it. Add no text, no lettering, no logos, no brand marks and no watermarks beyond what the reference piece itself shows.';

// → the prompt for one view. `refs` says what the pictures sent with it are, in order.
export function viewPrompt(concept, kind) {
  const cat = concept.category || 'other', name = clip(concept.name, 90), label = categoryLabel(cat).toLowerCase();
  if (kind === 'flat_front' || kind === 'flat_back') {
    const side = kind === 'flat_front' ? 'FRONT' : 'BACK';
    const shape = cat === 'footwear' ? FLAT_SHOE : cat === 'bags' || cat === 'headwear' || cat === 'accessories' ? `the item standing alone, ${kind === 'flat_front' ? 'seen from the front' : 'seen from the back'}` : `the piece laid flat and shot straight on, symmetrical, ${kind === 'flat_front' ? 'front' : 'back'} side up`;
    return [`The reference picture is a concept for a ${label} piece for a menswear and unisex brand: ${name}.`,
      `Draw the same piece as a clean flat product photograph on a seamless white background with soft, even light: ${shape}. This is the ${side} view.`,
      kind === 'flat_back' ? 'The back is plain except for details that continue logically from the front (seams, a yoke, a hood, a back pocket, a closure). Add no logo, graphic or text that the reference does not show on its back.' : '',
      'No hanger, no mannequin, no model, no hands.', KEEP].filter(Boolean).join('\n');
  }
  const framing = FRAMING[cat] || FRAMING.default, angle = ANGLE[kind];
  const first = kind === 'model_front';
  return [first
    ? `The reference pictures are a concept for a ${label} piece for a menswear and unisex brand (${name}) and the same piece laid flat. Draw ${framing}, of a man wearing exactly this piece, ${angle}.`
    : `The first reference picture is a man wearing a new ${label} piece (${name}); the others show the piece itself. Draw the very same man in the very same outfit, ${angle}, as ${framing}.`,
    'The model is an adult man with a natural, relaxed build, a neutral expression and a calm pose, in a simple outfit that lets the piece lead (plain, quiet, no other branded clothing). Plain mid-grey seamless studio background, soft natural light, a real photograph.',
    first ? '' : 'Same face, same hair, same clothes, same colours and the same lighting as the first picture: only the angle changes.',
    kind === 'model_back' ? 'The back shows only what continues from the front design (seams, yoke, hood, closure). Add no logo, graphic or text that the reference does not show on its back.' : '', KEEP].filter(Boolean).join('\n');
}

// The test placeholder: a plain coloured panel that says which view it is, so the board can be exercised without an image model.
const SWATCH = { navy: '#2f3b57', cream: '#e8dfc9', olive: '#6b6f3a', rust: '#a4502d', black: '#26262a', grey: '#7a7f88' };
export async function fixtureView(concept, kind) {
  const c = SWATCH[norm((concept.spec?.colors || [])[0])] || '#59606b', model = kind.startsWith('model'), shift = ({ model_front: 0, model_34: 36, model_side: 70, model_back: 0 })[kind] || 0;
  const body = model
    ? `<circle cx="512" cy="230" r="70" fill="#c6a98e"/><rect x="${352 + shift}" y="310" width="${320 - shift * 1.4}" height="330" rx="60" fill="${c}"/><rect x="${402 + shift / 2}" y="630" width="${100}" height="260" fill="#35363b"/><rect x="${522 + shift / 2}" y="630" width="${100}" height="260" fill="#35363b"/>`
    : `<rect x="232" y="250" width="560" height="520" rx="70" fill="${c}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${model ? '#c9ccd2' : '#ffffff'}"/>${body}<text x="512" y="960" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#555">TEST VIEW · ${kind.replace('_', ' ')} · ${String(concept.name).replace(/[<&>]/g, '').slice(0, 24)}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 86 }).toBuffer();
}

const tidy = async buf => {
  const image = await sharp(buf).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  return { image, thumb: await sharp(image).resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer() };
};

// Draw the wanted views for one concept from its picture. `have` holds views already made ({kind: Buffer}); `onView(kind, result|null, note)` is called as each one lands.
// The flats come first (they only need the concept's picture), then the front on-model view, then the other angles, which keep that man and outfit by taking it as a reference.
export async function makeViews({ concept, picture, kinds, have = {}, cfg = imageConfig(), onView = () => {}, edit = openaiEdit, pool = 2 }) {
  const want = kinds.filter(k => isKind(k) && kindsFor(concept.category).includes(k)), done = { ...have };
  const draw = async kind => {
    try {
      let buf;
      if (cfg.provider === 'fixture') buf = await fixtureView(concept, kind);
      else {
        const refs = kind.startsWith('flat') ? [picture] : kind === 'model_front' ? [picture, done.flat_front || picture].filter(Boolean) : [done.model_front, done.flat_front || picture].filter(Boolean);
        if (!kind.startsWith('flat') && kind !== 'model_front' && !done.model_front) throw new Error('The front view on the model has to be drawn first');
        buf = await edit({ images: refs, prompt: viewPrompt(concept, kind), cfg: { ...cfg, size: kind.startsWith('model') && cfg.provider === 'openai' ? (process.env.LAB_MODEL_SIZE || '1024x1536') : '1024x1024' } });
      }
      const r = await tidy(buf); done[kind] = r.image; await onView(kind, { ...r, model: cfg.model || cfg.provider }, ''); return r;
    } catch (e) { await onView(kind, null, `Could not be drawn: ${clip(e.message, 160)}`); return null; }
  };
  const batch = async list => { for (let i = 0; i < list.length; i += pool) await Promise.all(list.slice(i, i + pool).map(draw)); };
  await batch(want.filter(k => k.startsWith('flat') && !done[k]));
  if (want.includes('model_front') && !done.model_front) await draw('model_front');
  await batch(want.filter(k => k.startsWith('model') && k !== 'model_front' && !done[k]));
  return done;
}

// ---- the walk ---------------------------------------------------------------------------------------------------------------------------------
// A short fashion-film clip: the man in the front view walks toward the camera and turns. Made by a video model when one is connected (LAB_VIDEO_PROVIDER=openai
// and OPENAI_API_KEY; LAB_VIDEO_MODEL, LAB_VIDEO_SECONDS and LAB_VIDEO_SIZE tune it). Without one the board says so, and the spin of still views is what you get.
export function videoConfig(env = process.env) {
  if (env.LAB_VIDEO_PROVIDER === 'off') return { provider: 'off', configured: false, note: 'switched off (LAB_VIDEO_PROVIDER)' };
  if (env.LAB_VIDEO_PROVIDER === 'openai' && env.OPENAI_API_KEY) return { provider: 'openai', configured: true, model: env.LAB_VIDEO_MODEL || 'sora-2', seconds: String(env.LAB_VIDEO_SECONDS || '8'), size: env.LAB_VIDEO_SIZE || '720x1280', origin: env.OPENAI_VIDEO_ORIGIN || 'https://api.openai.com' };
  if (env.LAB_VIDEO_FIXTURE || env.AI_FIXTURE) return { provider: 'fixture', configured: true, model: 'fixture', note: 'test placeholder, not a real video model' };
  return { provider: 'none', configured: false, note: 'no video model is connected (set LAB_VIDEO_PROVIDER=openai with an OpenAI key)' };
}
export const walkPrompt = (concept, { reference = true } = {}) => [`A short fashion film, framed from the shoulders down so the face is never in the picture. ${reference ? 'The man in the reference photograph' : 'A man'}, wearing the ${categoryLabel(concept.category).toLowerCase()} piece "${clip(concept.name, 90)}", walks steadily toward the camera across a plain mid-grey seamless studio floor, then turns on the spot to show the back and the side, and turns to the front again.`,
  `Steady locked-off camera, soft studio light, natural cloth movement so the fabric and fit read clearly.${reference ? ' Keep his outfit, colours and every logo and graphic exactly as in the reference.' : ''} No text, no subtitles, no added logos, no music.`].join(' ');

// → { video: Buffer, mime }. `frame` is the front on-model picture. `fetchImpl` and `sleep` are replaceable so this can be tested without a network.
// the piece in words, for a walk made without the picture
const describe = c => { const sp = c.spec || {}; return clip([`He wears ${clip(c.name, 90)}`, sp.description, sp.fabric && `in ${sp.fabric}`, sp.colors?.length && `colour ${sp.colors.join(', ')}`].filter(Boolean).join(', ') + '.', 600); };
export async function makeWalk({ concept, frame, cfg = videoConfig(), fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), env = process.env }) {
  if (!cfg.configured) throw new Error(cfg.note || 'No video model is connected');
  if (cfg.provider === 'fixture') return { video: Buffer.from('FIXTURE-WALK-VIDEO'), mime: 'video/mp4', model: 'fixture' };
  // the video model refuses pictures with a person's face in them, so the reference is cropped from the shoulders down; if it is still refused, the walk is made from words alone
  const [w, h] = String(cfg.size).split('x').map(Number), meta = await sharp(frame).metadata(), cut = Math.round((meta.height || 0) * 0.2);
  const body = await sharp(frame).extract({ left: 0, top: cut, width: meta.width, height: Math.max(1, meta.height - cut) }).toBuffer();
  const ref = await sharp(body).resize(w, h, { fit: 'contain', background: '#c9ccd2' }).jpeg({ quality: 90 }).toBuffer();
  const auth = { Authorization: `Bearer ${env.OPENAI_API_KEY}` };
  const send = withRef => { const fd = new FormData(); fd.append('model', cfg.model); fd.append('prompt', withRef ? walkPrompt(concept) : `${walkPrompt(concept, { reference: false })} ${describe(concept)}`); fd.append('size', cfg.size); fd.append('seconds', cfg.seconds); if (withRef) fd.append('input_reference', new Blob([ref], { type: 'image/jpeg' }), 'model.jpg'); return fetchImpl(`${cfg.origin}/v1/videos`, { method: 'POST', headers: auth, body: fd, signal: AbortSignal.timeout(120000) }); };
  let start = await send(true);
  if (!start.ok && start.status >= 400 && start.status < 500 && start.status !== 401 && start.status !== 429) start = await send(false);
  // OpenAI shut its video API (Sora) down on 24 September 2026: every request now answers 404 with nothing in it
  if (start.status === 404 && /api\.openai\.com/.test(cfg.origin)) throw new Error('OpenAI has shut down its video model (Sora), so the walk cannot be made through OpenAI any more. Another video provider has to be connected.');
  if (!start.ok) throw new Error(`The video model refused the request (${start.status}): ${clip(await start.text().catch(() => ''), 200)}`);
  let job = await start.json();
  for (let i = 0; i < 90 && !['completed', 'failed'].includes(job.status); i++) {
    await sleep(Number(env.LAB_VIDEO_POLL_MS) || 8000);
    const r = await fetchImpl(`${cfg.origin}/v1/videos/${job.id}`, { headers: auth, signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`The video model could not be asked how it was getting on (${r.status})`);
    job = await r.json();
  }
  if (job.status === 'failed') throw new Error(`The video model could not make it: ${clip(job.error?.message || 'no reason given', 160)}`);
  if (job.status !== 'completed') throw new Error('The video model took too long. Try again.');
  const dl = await fetchImpl(`${cfg.origin}/v1/videos/${job.id}/content`, { headers: auth, signal: AbortSignal.timeout(180000) });
  if (!dl.ok) throw new Error(`The finished video could not be fetched (${dl.status})`);
  return { video: Buffer.from(await dl.arrayBuffer()), mime: 'video/mp4', model: cfg.model };
}

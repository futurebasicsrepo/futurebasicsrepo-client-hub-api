// A teammate's handwritten signature, signed in blue ink. Each person who signs for Future Basics keeps one signature (a picture they upload,
// or one drawn with a mouse, pen or finger on the My signature page, /signature). It is turned into ink (inkify): the paper is taken away, the
// strokes are coloured a ballpoint blue that is deeper where the line is heavy, with a fine grain and a little bleed at the edges.
//
// Every signature they give is a snapshot (signature_marks): a contract or a tech pack keeps the id of the mark it was signed with, so a
// signature changed later never changes a document already signed. A mark is served by its unguessable id only (GET /v1/public/signature-marks/:id),
// never listed, and marked private and noindex.
//
//   GET    /v1/me/signature           the signed-in teammate's current signature: { mark: { id, url, width, height } | null }
//   PUT    /v1/me/signature {image}   a picture (data URL) of the signature, on paper or drawn: turned into ink and kept → { mark }
//   POST   /v1/me/signature/preview {image}   the same, not kept → a PNG, so the page can show the ink before it is saved
//   DELETE /v1/me/signature          stop signing with it (documents signed with it keep theirs)
//   GET    /v1/public/signature-marks/:id    the ink, a transparent PNG
import sharp from 'sharp';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// the ink: a ballpoint blue, deeper where the stroke is heavy
const INK_LIGHT = [52, 86, 196], INK_DEEP = [16, 38, 118];
// a seeded value noise, so the grain is the same every time a signature is made
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const smooth = t => t * t * (3 - 2 * t);
function noise(x, y, s) { const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; }

export function pictureOf(image) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(image || '')); if (!m) return null;
  const buf = Buffer.from(m[2], 'base64'); return buf.length > 40 && buf.length < 12_000_000 ? buf : null;
}

// a picture of a signature (dark strokes on light paper, or on a clear background) → { png, width, height }, or null when nothing is drawn
export async function inkify(buf, { height = 300 } = {}) {
  // on a clear background (a drawing from the page), the strokes are what is not clear; on paper, what is darker than the paper
  const src = sharp(buf).rotate(), meta = await src.metadata();
  const flat = await src.clone().flatten({ background: '#ffffff' }).toColourspace('b-w').resize({ width: Math.min(meta.width || 1600, 1600), withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const { info: { width: W, height: H, channels: ch } } = flat, data = ch === 1 ? flat.data : Uint8Array.from({ length: W * H }, (_, i) => flat.data[i * ch]);
  // the paper's own shade: the bright end of the picture, so a grey photo of white paper still reads as paper
  const hist = new Uint32Array(256); for (const v of data) hist[v]++;
  let acc = 0, paper = 255; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= data.length * .5) { paper = v; break; } }
  const a = new Float32Array(W * H); let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (paper - data[y * W + x]) / Math.max(paper, 40), v = Math.min(1, Math.max(0, (d - .18) / .5)); a[y * W + x] = v;
    if (v > .25) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0 || (x1 - x0) * (y1 - y0) < 60) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * .04) + 4; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1, h = y1 - y0 + 1, k = Math.min(1, height / h), ow = Math.max(1, Math.round(w * k)), oh = Math.max(1, Math.round(h * k));
  // the stroke, cropped and sized; then a softened copy of it for the bleed at its edges
  const crop = Buffer.alloc(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) crop[y * w + x] = Math.round(a[(y + y0) * W + x + x0] * 255);
  // (sharp hands a one-channel picture back as three, so the first channel is taken)
  const one = async img => { const r = await img.toColourspace('b-w').raw().toBuffer({ resolveWithObject: true }), n = r.info.channels; return n === 1 ? r.data : Uint8Array.from({ length: r.info.width * r.info.height }, (_, i) => r.data[i * n]); };
  const core = await one(sharp(crop, { raw: { width: w, height: h, channels: 1 } }).resize(ow, oh, { kernel: 'lanczos3' }));
  const bleed = await one(sharp(Buffer.from(core), { raw: { width: ow, height: oh, channels: 1 } }).blur(Math.max(.6, oh / 260)));
  const out = Buffer.alloc(ow * oh * 4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i = y * ow + x, c = core[i] / 255, b = bleed[i] / 255; let al = Math.max(c, b * .55); if (al <= 0) continue;
    // grain: the ink lies a little unevenly along the line, and pools where the stroke is heavy
    const g = (.78 + .22 * noise(x, y, 1.8)) * (.8 + .2 * noise(x + 97, y + 31, 34)); al = Math.min(1, al * g);
    const t = Math.min(1, c * (.6 + .7 * noise(x + 11, y + 7, 22)));
    out[i * 4] = Math.round(INK_LIGHT[0] + (INK_DEEP[0] - INK_LIGHT[0]) * t); out[i * 4 + 1] = Math.round(INK_LIGHT[1] + (INK_DEEP[1] - INK_LIGHT[1]) * t); out[i * 4 + 2] = Math.round(INK_LIGHT[2] + (INK_DEEP[2] - INK_LIGHT[2]) * t); out[i * 4 + 3] = Math.round(al * 255);
  }
  const png = await sharp(out, { raw: { width: ow, height: oh, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { png, width: ow, height: oh };
}

export const markUrl = id => (UUID.test(String(id || '')) ? `/v1/public/signature-marks/${id}` : null);

export function registerSignatureRoutes(app, { pool, authenticate, adminOnly, log = console }) {
  const pre = [authenticate, adminOnly], bad = (reply, error, code = 422) => reply.code(code).send({ error });
  const view = r => (r ? { id: r.id, url: markUrl(r.id), width: r.width, height: r.height, at: r.created_at } : null);
  const current = async userId => (await pool.query(`select m.id, m.width, m.height, m.created_at from staff_signatures s join signature_marks m on m.id = s.mark_id where s.user_id = $1`, [userId])).rows[0] || null;

  app.get('/v1/me/signature', { preHandler: pre }, async req => ({ mark: view(await current(req.auth.sub)) }));
  app.post('/v1/me/signature/preview', { preHandler: pre, bodyLimit: 16_000_000 }, async (req, reply) => {
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send a picture of the signature');
    const ink = await inkify(buf).catch(() => null); if (!ink) return bad(reply, 'No signature found in that picture: sign in dark ink on light paper, or draw it');
    return reply.header('cache-control', 'no-store').type('image/png').send(ink.png);
  });
  app.put('/v1/me/signature', { preHandler: pre, bodyLimit: 16_000_000 }, async (req, reply) => {
    const buf = pictureOf(req.body?.image); if (!buf) return bad(reply, 'Send a picture of the signature');
    const ink = await inkify(buf).catch(e => { log.warn?.({ err: e.message }, 'signature not read'); return null; });
    if (!ink) return bad(reply, 'No signature found in that picture: sign in dark ink on light paper, or draw it');
    const m = (await pool.query(`insert into signature_marks(user_id, png, width, height) values($1,$2,$3,$4) returning id, width, height, created_at`, [req.auth.sub, ink.png, ink.width, ink.height])).rows[0];
    await pool.query(`insert into staff_signatures(user_id, mark_id, updated_at) values($1,$2,now()) on conflict (user_id) do update set mark_id = excluded.mark_id, updated_at = now()`, [req.auth.sub, m.id]);
    return { mark: view(m) };
  });
  app.delete('/v1/me/signature', { preHandler: pre }, async req => { await pool.query('delete from staff_signatures where user_id=$1', [req.auth.sub]); return { mark: null }; });
  // the ink itself: by its id only (it is printed on the documents it signed, which their readers already have)
  app.get('/v1/public/signature-marks/:id', async (req, reply) => {
    if (!UUID.test(req.params.id)) return reply.code(404).send({ error: 'Not found' });
    const r = (await pool.query('select png from signature_marks where id=$1', [req.params.id])).rows[0]; if (!r) return reply.code(404).send({ error: 'Not found' });
    return reply.header('cache-control', 'private, max-age=31536000, immutable').header('x-robots-tag', 'noindex, nofollow').type('image/png').send(r.png);
  });
  // the signer's current ink, for a document being signed now (its id goes into the signature record)
  return { markFor: async userId => (userId ? (await current(userId))?.id || null : null), pngOf: async id => (UUID.test(String(id || '')) ? (await pool.query('select png from signature_marks where id=$1', [id])).rows[0]?.png || null : null) };
}

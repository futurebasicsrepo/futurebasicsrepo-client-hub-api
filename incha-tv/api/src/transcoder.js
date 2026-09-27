// Background conversion of uploaded videos. One in-process queue; jobs survive restarts because
// the queue is rebuilt from posts still marked `processing` on boot.
import { stat } from 'node:fs/promises';
import * as storage from './storage.js';
import { planTranscode, posterFrame, probe, transcode } from './media.js';
import { randomId } from './lib.js';

export function createQueue(worker, concurrency = 1) {
  const pending = [];
  const queued = new Set();
  let active = 0;
  let idle = [];
  const pump = () => {
    while (active < concurrency && pending.length) {
      const id = pending.shift();
      active++;
      Promise.resolve(worker(id)).catch(() => {}).finally(() => {
        active--;
        queued.delete(id);
        pump();
      });
    }
    if (!active && !pending.length) { idle.forEach(resolve => resolve()); idle = []; }
  };
  return {
    push(id) { if (queued.has(id)) return; queued.add(id); pending.push(id); pump(); },
    // Resolves once every queued job has finished (used by tests and shutdown).
    drain: () => (active || pending.length ? new Promise(resolve => idle.push(resolve)) : Promise.resolve()),
    get size() { return active + pending.length; }
  };
}

export function createTranscoder({ pool, log, onReady = () => {} }) {
  async function work(id) {
    const { rows: [post] } = await pool.query(
      `select id, media_key, cover_key, trim_start, trim_end, match_id from posts where id = $1 and media_status = 'processing'`, [id]);
    if (!post) return;
    const outKey = `${randomId(24)}.mp4`;
    let posterKey = null;
    try {
      const info = await probe(storage.pathFor(post.media_key));
      const plan = planTranscode(info);
      if (plan.error) throw Object.assign(new Error(plan.error), { friendly: true });
      const started = Date.now();
      await transcode(plan, storage.pathFor(post.media_key), storage.pathFor(outKey));
      const out = await probe(storage.pathFor(outKey));
      const bytes = (await stat(storage.pathFor(outKey))).size;
      if (!post.cover_key) {
        posterKey = `${randomId(24)}.jpg`;
        const at = post.trim_start ?? Math.min(1, (out.duration || 0) / 3);
        await posterFrame(storage.pathFor(outKey), storage.pathFor(posterKey), at).catch(() => { posterKey = null; });
      }
      // Guard on media_key so a post deleted or replaced mid-job doesn't get resurrected.
      const { rows } = await pool.query(`
        update posts set media_key = $2, media_mime = 'video/mp4', media_bytes = $3, duration = coalesce($4, duration),
          width = $5, height = $6, media_status = 'ready', media_error = null,
          trim_end = case when $4::real is not null and trim_end > $4::real then null else trim_end end,
          cover_key = coalesce(cover_key, $7), cover_mime = case when cover_key is null and $7::text is not null then 'image/jpeg' else cover_mime end,
          updated_at = now()
        where id = $1 and media_key = $8 returning cover_key`,
        [post.id, outKey, bytes, out.duration, out.video?.width ?? null, out.video?.height ?? null, posterKey, post.media_key]);
      if (!rows[0]) { await Promise.all([storage.remove(outKey), storage.remove(posterKey)]); return; }
      if (posterKey && rows[0].cover_key !== posterKey) await storage.remove(posterKey);
      await storage.remove(post.media_key);
      log.info({ post: post.id, mode: plan.mode, ms: Date.now() - started }, 'video ready');
      onReady(post);
    } catch (error) {
      log.error({ post: post.id, err: error }, 'video conversion failed');
      await Promise.all([storage.remove(outKey), storage.remove(posterKey)]);
      await pool.query(`update posts set media_status = 'failed', media_error = $3, updated_at = now() where id = $1 and media_key = $2`,
        [post.id, post.media_key, error.friendly ? error.message : 'We couldn’t convert this video. Try exporting it again or uploading a different file.']);
    }
  }

  const queue = createQueue(work, Math.max(1, Number(process.env.TRANSCODE_CONCURRENCY) || 1));
  return {
    enqueue: id => queue.push(id),
    drain: () => queue.drain(),
    async resume() {
      const { rows } = await pool.query(`select id from posts where media_status = 'processing' order by created_at`);
      rows.forEach(row => queue.push(row.id));
      return rows.length;
    }
  };
}

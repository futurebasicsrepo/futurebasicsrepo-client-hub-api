// Automatic highlight reels: at full time, a match's fan clips are stitched (in minute order) behind a
// "FULL TIME" title card into one 16:9 video, published to the match and pushed to followers.
import { existsSync, mkdirSync } from 'node:fs';
import { rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as storage from './storage.js';
import { FFMPEG, posterFrame, probe, run } from './media.js';
import { createQueue } from './transcoder.js';
import { randomId } from './lib.js';

const WORK_DIR = resolve(process.env.REEL_DIR || join(process.env.MEDIA_DIR || './media', '..', 'reels'));
const FONT_CANDIDATES = [
  process.env.REEL_FONT,
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', // Alpine (font-dejavu)
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' // Debian/Ubuntu
].filter(Boolean);
export const REEL = { width: 1280, height: 720, fps: 30, maxClips: 12, maxClipSeconds: 20, titleSeconds: 3 };

/**
 * Which clips go in, and which part of each: the best-voted clips (up to 12), then back in match order.
 * Each plays its creator's trim window, capped at 20s (the last 20s, where the goal usually is).
 */
export function planReel(clips, { maxClips = REEL.maxClips, maxClipSeconds = REEL.maxClipSeconds } = {}) {
  const usable = clips.filter(c => (c.duration ?? 0) > 0.5);
  const picked = [...usable].sort((a, b) => b.score - a.score || Date.parse(a.published_at) - Date.parse(b.published_at)).slice(0, maxClips);
  return picked
    .sort((a, b) => (a.match_minute ?? 999) - (b.match_minute ?? 999) || Date.parse(a.published_at) - Date.parse(b.published_at))
    .map(c => {
      const from = Math.max(0, c.trim_start ?? 0);
      const to = Math.min(c.duration, c.trim_end ?? c.duration);
      const length = Math.max(0.5, to - from);
      const start = length > maxClipSeconds ? to - maxClipSeconds : from;
      return { id: c.id, mediaKey: c.media_key, start, length: Math.min(length, maxClipSeconds), caption: `${c.match_minute != null ? `${c.match_minute}'  ` : ''}@${c.handle}` };
    });
}

/** Font size that keeps a line inside the frame (DejaVu Sans Bold is ~0.62em per character). */
export const fitFont = (text, max, width = REEL.width - 100) => Math.max(22, Math.min(max, Math.floor(width / (Math.max(1, text.length) * 0.62))));

const findFont = () => FONT_CANDIDATES.find(path => existsSync(path)) || null;

// Text goes through files (textfile=, expansion=none) so names and handles never need filter escaping.
const drawtext = (font, file, opts) => `drawtext=${font ? `fontfile=${font}:` : ''}textfile=${file}:expansion=none:${opts}`;
const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-r', String(REEL.fps), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];

async function renderTitle(dir, font, match) {
  const lines = {
    top: 'FULL TIME',
    score: `${match.home_name}  ${match.home_score} – ${match.away_score}  ${match.away_name}`,
    sub: `${match.competition ? `${match.competition.toUpperCase()} · ` : ''}HIGHLIGHTS`
  };
  for (const [name, text] of Object.entries(lines)) await writeFile(join(dir, `${name}.txt`), text);
  const { width: W, height: H, titleSeconds: T } = REEL;
  const vf = [
    drawtext(font, join(dir, 'top.txt'), `fontcolor=0xff4a1c:fontsize=44:x=(w-text_w)/2:y=h/2-120`),
    drawtext(font, join(dir, 'score.txt'), `fontcolor=0xf3eee4:fontsize=${fitFont(lines.score, 58)}:x=(w-text_w)/2:y=(h-text_h)/2`),
    drawtext(font, join(dir, 'sub.txt'), `fontcolor=0xb9b3a8:fontsize=${fitFont(lines.sub, 28)}:x=(w-text_w)/2:y=h/2+80`),
    'format=yuv420p'
  ].join(',');
  const out = join(dir, 'part-000.mp4');
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=0x0c0c0d:s=${W}x${H}:r=${REEL.fps}:d=${T}`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', String(T), '-vf', vf, ...ENCODE, '-shortest', out], { timeoutMs: 120_000 });
  return out;
}

async function renderClip(dir, font, segment, index) {
  const src = storage.pathFor(segment.mediaKey);
  const info = await probe(src);
  const caption = join(dir, `cap-${index}.txt`);
  await writeFile(caption, segment.caption);
  await writeFile(join(dir, 'wm.txt'), 'INCHA.TV');
  const { width: W, height: H } = REEL;
  // Fit the clip inside 16:9 over a blurred, zoomed copy of itself (portrait phone clips look right).
  const graph = `[0:v]split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=20:2[bgb];`
    + `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,fps=${REEL.fps},setsar=1,format=yuv420p,`
    + `${drawtext(font, caption, 'fontcolor=white:fontsize=34:box=1:boxcolor=0x000000AA:boxborderw=12:x=36:y=h-text_h-40')},`
    + `${drawtext(font, join(dir, 'wm.txt'), 'fontcolor=white@0.8:fontsize=24:x=w-text_w-30:y=28')}[v]`;
  const out = join(dir, `part-${String(index).padStart(3, '0')}.mp4`);
  const silent = !info.audio;
  await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y',
    '-ss', segment.start.toFixed(2), '-t', segment.length.toFixed(2), '-i', src,
    ...(silent ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : []),
    '-filter_complex', graph, '-map', '[v]', '-map', silent ? '1:a' : '0:a:0', ...(silent ? ['-shortest'] : []),
    ...ENCODE, out], { timeoutMs: 5 * 60_000 });
  return out;
}

export function createReelBuilder({ pool, log, loadMatch, onReady = () => {} }) {
  mkdirSync(WORK_DIR, { recursive: true });

  async function work(matchId) {
    const match = await loadMatch(matchId);
    if (!match || match.period !== 'ft') return;
    const { rows: clips } = await pool.query(`
      select p.id, p.media_key, p.duration, p.trim_start, p.trim_end, p.match_minute, p.score, p.published_at, u.handle
      from posts p join users u on u.id = p.user_id
      where p.match_id = $1 and p.status = 'published' and p.visibility <> 'private' and p.media_status = 'ready'
        and p.media_kind = 'video' and not p.is_reel`, [matchId]);
    const plan = planReel(clips);
    if (!plan.length) {
      await pool.query(`update matches set reel_status = 'none' where id = $1`, [matchId]);
      return;
    }
    const dir = join(WORK_DIR, `${matchId}-${randomId(6)}`);
    mkdirSync(dir, { recursive: true });
    const key = `${randomId(24)}.mp4`;
    let coverKey = null;
    try {
      const font = findFont();
      if (!font) log.warn('highlight reels: no font found; captions use ffmpeg’s default');
      const parts = [await renderTitle(dir, font, match)];
      for (const [i, segment] of plan.entries()) {
        // A clip that won't render is skipped rather than sinking the whole reel.
        await renderClip(dir, font, segment, i + 1).then(p => parts.push(p), err => log.warn({ err, post: segment.id }, 'reel clip skipped'));
      }
      if (parts.length < 2) throw new Error('no clip could be rendered');
      await writeFile(join(dir, 'list.txt'), parts.map(p => `file '${p}'`).join('\n'));
      await run(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
        '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', storage.pathFor(key)], { timeoutMs: 5 * 60_000 });
      const info = await probe(storage.pathFor(key));
      coverKey = `${randomId(24)}.jpg`;
      coverKey = await posterFrame(storage.pathFor(key), storage.pathFor(coverKey), 1.2).then(() => coverKey, () => null);
      const bytes = (await stat(storage.pathFor(key))).size;
      const fresh = await loadMatch(matchId); // the score can't change after FT, but read the latest anyway
      const title = `Highlights · ${fresh.home_name} ${fresh.home_score}–${fresh.away_score} ${fresh.away_name}`.slice(0, 120);
      const visibility = fresh.visibility === 'public' && !fresh.youth ? 'public' : 'unlisted';
      const postId = randomId(10);
      const client = await pool.connect();
      let old;
      try {
        await client.query('begin');
        ({ rows: [old] } = await client.query(`select id, media_key, cover_key from posts where id = (select reel_post_id from matches where id = $1)`, [matchId]));
        await client.query(`
          insert into posts (id, user_id, title, description, media_kind, media_key, media_mime, media_bytes, cover_key, cover_mime,
            duration, width, height, media_status, match_id, status, visibility, published_at, is_reel)
          values ($1, $2, $3, $4, 'video', $5, 'video/mp4', $6, $7, $8, $9, $10, $11, 'ready', $12, 'published', $13, now(), true)`,
        [postId, fresh.created_by, title, `Made from ${plan.length} fan clip${plan.length === 1 ? '' : 's'} on incha.tv.`, key, bytes,
          coverKey, coverKey ? 'image/jpeg' : null, info.duration, info.video?.width ?? REEL.width, info.video?.height ?? REEL.height, matchId, visibility]);
        await client.query(`update matches set reel_status = 'ready', reel_post_id = $2 where id = $1`, [matchId, postId]);
        if (old) await client.query(`delete from posts where id = $1`, [old.id]);
        await client.query('commit');
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
      if (old) await Promise.all([storage.remove(old.media_key), storage.remove(old.cover_key)]);
      log.info({ match: matchId, clips: plan.length, seconds: Math.round(info.duration) }, 'highlight reel ready');
      onReady(fresh, postId, Boolean(old));
    } catch (error) {
      log.error({ err: error, match: matchId }, 'highlight reel failed');
      await Promise.all([storage.remove(key), storage.remove(coverKey)]);
      await pool.query(`update matches set reel_status = 'failed' where id = $1`, [matchId]);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  const queue = createQueue(work, 1);
  return {
    async enqueue(matchId) {
      await pool.query(`update matches set reel_status = 'building' where id = $1`, [matchId]);
      queue.push(matchId);
    },
    drain: () => queue.drain(),
    async resume() {
      const { rows } = await pool.query(`select id from matches where reel_status = 'building'`);
      rows.forEach(row => queue.push(row.id));
      return rows.length;
    }
  };
}

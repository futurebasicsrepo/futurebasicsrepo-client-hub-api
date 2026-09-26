// "Go live": a fan's phone records with MediaRecorder and posts one-second chunks here. Each stream
// gets an ffmpeg process that turns them into a rolling HLS playlist (what viewers watch, ~10s behind)
// and a recording that becomes a draft clip in the streamer's Studio when they stop.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createReadStream, mkdirSync } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as storage from './storage.js';
import { FFMPEG, faststart, ffmpegAvailable, posterFrame, probe } from './media.js';
import { matchClock } from './match.js';
import { createLimiter, randomId, POST_ID_RE } from './lib.js';

const LIVE_DIR = resolve(process.env.LIVE_DIR || join(process.env.MEDIA_DIR || './media', '..', 'live'));
const MAX_LIVE = Math.max(1, Number(process.env.MAX_LIVE_STREAMS) || 3);
const MAX_SECONDS = Number(process.env.MAX_LIVE_SECONDS) || 3 * 60 * 60;
const IDLE_MS = Number(process.env.LIVE_IDLE_MS) || 30_000;
const MAX_CHUNK = 8 * 1024 * 1024;
const LIVE_FILE_RE = /^(index\.m3u8|seg\d{5}\.ts)$/;
const SCALE_720 = `scale=w='if(gte(iw,ih),trunc(min(1280,iw)/2)*2,-2)':h='if(gte(iw,ih),-2,trunc(min(1280,ih)/2)*2)'`;

mkdirSync(LIVE_DIR, { recursive: true });

export function liveArgs(dir) {
  const hls = `[f=hls:hls_time=2:hls_list_size=8:hls_flags=delete_segments+independent_segments:hls_segment_filename=${dir}/seg%05d.ts]${dir}/index.m3u8`;
  const recording = `[f=mp4:movflags=frag_keyframe+empty_moov+default_base_moof]${dir}/rec.mp4`;
  return [
    '-hide_banner', '-loglevel', 'error', '-fflags', '+genpts', '-i', 'pipe:0',
    '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', `${SCALE_720},format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
    '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0', '-threads', '2',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-flags', '+global_header', '-f', 'tee', `${hls}|${recording}`
  ];
}

export function registerLive(app, { pool, fail, requireUser, matchCentre, baseUrl, log }) {
  const sessions = new Map(); // streamId -> { proc, dir, nextSeq, lastChunkAt, startedAt, closing }
  const startLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const finishing = new Map(); // streamId -> Promise of the finalize result

  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_CHUNK }, (_req, body, done) => done(null, body));

  const dirFor = id => join(LIVE_DIR, id);

  async function loadStream(id) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows } = await pool.query(`
      select s.*, u.handle, u.display_name, ht.name as home_name, aw.name as away_name
      from streams s join users u on u.id = s.user_id join matches m on m.id = s.match_id
      join teams ht on ht.id = m.home_team_id join teams aw on aw.id = m.away_team_id
      where s.id = $1`, [id]);
    return rows[0] || null;
  }

  function spawnEncoder(id, userId) {
    const dir = dirFor(id);
    mkdirSync(dir, { recursive: true });
    const proc = spawn(FFMPEG, liveArgs(dir), { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    proc.stdin.on('error', () => {}); // EPIPE if ffmpeg dies; handled by the close listener
    const session = { proc, dir, userId, nextSeq: 0, lastChunkAt: Date.now(), startedAt: Date.now(), closing: false };
    session.exited = once(proc, 'close').then(([code]) => {
      if (code && !session.closing) log.warn({ stream: id, code, stderr }, 'live encoder stopped');
      if (!session.closing) finish(id).catch(err => log.error(err));
    });
    sessions.set(id, session);
    return session;
  }

  // Ends a stream (idempotent): stops the encoder, saves the recording as a draft clip, tells viewers.
  function finish(id) {
    if (!finishing.has(id)) finishing.set(id, doFinish(id).finally(() => setTimeout(() => finishing.delete(id), 60_000)));
    return finishing.get(id);
  }

  async function doFinish(id) {
    const session = sessions.get(id);
    await pool.query(`update streams set status = 'ended', ended_at = coalesce(ended_at, now()) where id = $1`, [id]);
    const stream = await loadStream(id);
    if (stream) matchCentre.notify(stream.match_id).catch(() => {});
    if (session) {
      session.closing = true;
      session.proc.stdin.end();
      const timer = setTimeout(() => session.proc.kill('SIGKILL'), 60_000);
      await session.exited.catch(() => {});
      clearTimeout(timer);
      sessions.delete(id);
    }
    const postId = stream && !stream.post_id ? await saveRecording(stream).catch(err => { log.error({ stream: id, err }, 'saving live recording failed'); return null; }) : stream?.post_id ?? null;
    // Give viewers a moment to play out the last segments before the files go.
    setTimeout(() => rm(dirFor(id), { recursive: true, force: true }).catch(() => {}), 2 * 60 * 1000).unref();
    if (postId && stream) matchCentre.notify(stream.match_id).catch(() => {});
    return postId;
  }

  async function saveRecording(stream) {
    const rec = join(dirFor(stream.id), 'rec.mp4');
    const size = await stat(rec).then(s => s.size, () => 0);
    if (size < 1024) return null;
    const key = `${randomId(24)}.mp4`;
    await faststart(rec, storage.pathFor(key));
    let info;
    try {
      info = await probe(storage.pathFor(key));
      if (!info.video || !info.duration || info.duration < 1) throw new Error('recording too short');
    } catch (error) {
      await storage.remove(key);
      throw error;
    }
    const coverKey = `${randomId(24)}.jpg`;
    const cover = await posterFrame(storage.pathFor(key), storage.pathFor(coverKey), Math.min(2, info.duration / 2)).then(() => coverKey, () => null);
    const bytes = (await stat(storage.pathFor(key))).size;
    const postId = randomId(10);
    const title = `Live: ${stream.home_name} vs ${stream.away_name}`.slice(0, 120);
    try {
      await pool.query(`
        insert into posts (id, user_id, title, media_kind, media_key, media_mime, media_bytes, cover_key, cover_mime,
          duration, width, height, media_status, match_id, match_minute)
        values ($1, $2, $3, 'video', $4, 'video/mp4', $5, $6, $7, $8, $9, $10, 'ready', $11, $12)`,
        [postId, stream.user_id, title, key, bytes, cover, cover ? 'image/jpeg' : null, info.duration,
          info.video.width, info.video.height, stream.match_id, stream.match_minute]);
      await pool.query(`update streams set post_id = $2 where id = $1`, [stream.id, postId]);
    } catch (error) {
      await Promise.all([storage.remove(key), storage.remove(cover)]);
      throw error;
    }
    return postId;
  }

  const streamView = (req, row) => ({
    id: row.id,
    matchId: row.match_id,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    streamer: { handle: row.handle, displayName: row.display_name },
    hlsUrl: `${baseUrl(req)}/live/${row.id}/index.m3u8`,
    replayPostId: row.post_id,
    isOwner: Boolean(req.user && Number(row.user_id) === req.user.id)
  });

  app.post('/v1/matches/:id/streams', { preHandler: requireUser }, async (req, reply) => {
    const match = await matchCentre.loadMatch(req.params.id);
    if (!match) return fail(reply, 404, 'Match not found.');
    if (match.youth) return fail(reply, 403, 'Live video is off for youth matches to protect young players.');
    if (match.period === 'ft') return fail(reply, 400, 'This match has finished.');
    if (!(await ffmpegAvailable())) return fail(reply, 503, 'Live video isn’t available right now.');
    const { rows: [mine] } = await pool.query(`select id from streams where user_id = $1 and status = 'live'`, [req.user.id]);
    if (mine) {
      if (sessions.has(mine.id)) return fail(reply, 409, 'You’re already live on another match. End that stream first.');
      await finish(mine.id); // left over from a crash or restart
    }
    if (sessions.size >= MAX_LIVE) return fail(reply, 503, 'All live slots are busy right now. Try again in a few minutes.');
    if (!startLimiter(`live:${req.user.id}`)) return fail(reply, 429, 'Too many streams started. Try again later.');
    const id = randomId(10);
    const clock = matchClock({ period: match.period, periodStartedAt: match.period_started_at, halfLength: match.half_length });
    await pool.query(`insert into streams (id, match_id, user_id, match_minute) values ($1, $2, $3, $4)`,
      [id, match.id, req.user.id, clock?.minute ?? null]);
    spawnEncoder(id, req.user.id);
    matchCentre.notify(match.id).catch(() => {});
    return reply.code(201).send({ stream: streamView(req, await loadStream(id)) });
  });

  app.post('/v1/streams/:id/chunks', { preHandler: requireUser }, async (req, reply) => {
    const session = sessions.get(req.params.id);
    if (!session || session.userId !== req.user.id) return fail(reply, 404, 'This stream has ended.');
    if (session.closing) return fail(reply, 410, 'This stream has ended.');
    const seq = Number(req.query.seq);
    if (!Number.isInteger(seq) || seq < 0) return fail(reply, 400, 'Missing chunk sequence number.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) return fail(reply, 400, 'Empty chunk.');
    // Chunks must arrive in order; retries of one we already have are acknowledged and dropped.
    if (seq < session.nextSeq) return { next: session.nextSeq };
    if (seq > session.nextSeq) return reply.code(409).send({ error: 'Out of order.', next: session.nextSeq });
    session.nextSeq++;
    session.lastChunkAt = Date.now();
    if (!session.proc.stdin.write(req.body)) await Promise.race([once(session.proc.stdin, 'drain'), session.exited]);
    if (Date.now() - session.startedAt > MAX_SECONDS * 1000) {
      finish(req.params.id).catch(err => log.error(err));
      return reply.code(410).send({ error: 'Streams are limited to 3 hours.', next: session.nextSeq });
    }
    return { next: session.nextSeq };
  });

  app.post('/v1/streams/:id/end', { preHandler: requireUser }, async (req, reply) => {
    const stream = await loadStream(req.params.id);
    if (!stream || Number(stream.user_id) !== req.user.id) return fail(reply, 404, 'Stream not found.');
    const postId = await finish(stream.id);
    return { stream: streamView(req, await loadStream(stream.id)), replayPostId: postId };
  });

  app.get('/v1/streams/:id', async (req, reply) => {
    const stream = await loadStream(req.params.id);
    if (!stream) return fail(reply, 404, 'Stream not found.');
    return { stream: streamView(req, stream) };
  });

  // HLS for viewers. Stream ids are unguessable and youth matches never stream, so the link is the key.
  app.get('/live/:id/:file', async (req, reply) => {
    const { id, file } = req.params;
    if (!POST_ID_RE.test(id) || !LIVE_FILE_RE.test(file)) return fail(reply, 404, 'Not found.');
    const path = join(dirFor(id), file);
    const size = await stat(path).then(s => s.size, () => null);
    if (size === null) return fail(reply, 404, 'Not found.');
    const playlist = file.endsWith('.m3u8');
    reply
      .header('content-type', playlist ? 'application/vnd.apple.mpegurl' : 'video/mp2t')
      .header('cache-control', playlist ? 'no-cache, no-store' : 'public, max-age=60')
      .header('content-length', size);
    return reply.send(createReadStream(path));
  });

  // Streams whose phone went quiet (closed tab, lost signal) are ended and saved.
  const watchdog = setInterval(() => {
    for (const [id, session] of sessions) {
      if (!session.closing && Date.now() - session.lastChunkAt > IDLE_MS) finish(id).catch(err => log.error(err));
    }
  }, 5_000);
  watchdog.unref();

  app.addHook('onClose', async () => {
    clearInterval(watchdog);
    await Promise.all([...sessions.keys()].map(id => finish(id).catch(() => {})));
  });

  return {
    streamView,
    liveCount: () => sessions.size,
    // After a restart, any stream still marked live lost its encoder: close it out and keep what was recorded.
    async recover() {
      const { rows } = await pool.query(`select id from streams where status = 'live'`);
      await Promise.all(rows.map(row => finish(row.id).catch(err => log.error(err))));
      return rows.length;
    }
  };
}

// Video conversion and live streaming. The end-to-end part needs TEST_DATABASE_URL and ffmpeg on PATH.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { clipSegmentNames, planTranscode, summarizeProbe } from '../src/media.js';
import { uploadMime } from '../src/lib.js';

test('planTranscode remuxes web-safe files and re-encodes the rest', () => {
  const h264 = { format: 'mov,mp4,m4a,3gp,3g2,mj2', video: { codec: 'h264', pixFmt: 'yuv420p', width: 1080, height: 1920 }, audio: { codec: 'aac' } };
  assert.equal(planTranscode(h264).mode, 'remux');
  assert.equal(planTranscode({ ...h264, video: { ...h264.video, codec: 'hevc' } }).mode, 'transcode', 'iPhone HEVC');
  assert.equal(planTranscode({ ...h264, video: { ...h264.video, width: 3840, height: 2160 } }).mode, 'transcode', '4K is scaled down');
  assert.equal(planTranscode({ ...h264, video: { ...h264.video, pixFmt: 'yuv420p10le' } }).mode, 'transcode', '10-bit');
  assert.equal(planTranscode({ ...h264, format: 'matroska,webm' }).mode, 'transcode');
  const opus = planTranscode({ ...h264, audio: { codec: 'opus' } });
  assert.deepEqual([opus.copyVideo, opus.copyAudio], [true, false]);
  assert.equal(planTranscode({ ...h264, audio: null }).mode, 'remux');
  assert.ok(planTranscode({ format: 'mp3', video: null, audio: { codec: 'mp3' } }).error);
  assert.ok(planTranscode({ format: 'tty', video: { codec: 'ansi', pixFmt: 'pal8', width: 640, height: 400 }, audio: null }).error, 'junk bytes');
});

test('summarizeProbe reports display size after rotation', () => {
  const info = summarizeProbe({
    format: { format_name: 'mov,mp4', duration: '12.5' },
    streams: [
      { codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] },
      { codec_type: 'audio', codec_name: 'aac' }
    ]
  });
  assert.deepEqual(info.video, { codec: 'hevc', pixFmt: 'yuv420p', width: 1080, height: 1920 });
  assert.equal(info.duration, 12.5);
});

test('clipSegmentNames counts back 30s from the newest finished segment', () => {
  const playlist = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:40\n#EXTINF:2.000000,\nseg00040.ts\n#EXTINF:2.000000,\nseg00047.ts\n';
  const names = clipSegmentNames(playlist);
  assert.equal(names.length, 15);
  assert.equal(names[0], 'seg00033.ts', 'reaches past the playlist window into kept segments');
  assert.equal(names.at(-1), 'seg00047.ts');
  assert.deepEqual(clipSegmentNames('#EXTM3U\nseg00002.ts\n'), ['seg00000.ts', 'seg00001.ts', 'seg00002.ts'], 'early in a stream');
  assert.deepEqual(clipSegmentNames('#EXTM3U\n'), []);
});

test('uploadMime falls back to the file extension for generic types', () => {
  assert.equal(uploadMime('video/quicktime', 'x.mov'), 'video/quicktime');
  assert.equal(uploadMime('', 'IMG_0001.MOV'), 'video/quicktime');
  assert.equal(uploadMime('application/octet-stream', 'match.mkv'), 'video/x-matroska');
  assert.equal(uploadMime('application/x-sh', 'x.mp4'), null);
  assert.equal(uploadMime('', 'notes.txt'), null);
});

const dbUrl = process.env.TEST_DATABASE_URL;
let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version']); } catch { hasFfmpeg = false; }

test('video conversion and go-live flow', { skip: (!dbUrl && 'set TEST_DATABASE_URL to run') || (!hasFfmpeg && 'needs ffmpeg') }, async t => {
  const scratch = mkdtempSync(join(tmpdir(), 'incha-av-'));
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = join(scratch, 'media');
  process.env.LIVE_DIR = join(scratch, 'live');
  process.env.JWT_SECRET = 'test-jwt-secret';
  delete process.env.TRANSCODE;
  const ff = (...args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
  // A WebM like Chrome's MediaRecorder makes, and an H.264 MP4 that only needs remuxing.
  ff('-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '6',
    '-c:v', 'libvpx', '-deadline', 'realtime', '-b:v', '800k', '-c:a', 'libopus', join(scratch, 'clip.webm'));
  ff('-f', 'lavfi', '-i', 'testsrc2=size=360x640:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=330', '-t', '3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', join(scratch, 'clip.mp4'));

  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  t.after(async () => { await app.close(); await pool.end(); });

  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload, headers = {}) => app.inject({
    method, url, payload, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }
  });
  const upload = (token, name, type, bytes) => {
    const boundary = '----incha';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    return app.inject({ method: 'POST', url: '/v1/posts', payload: body, headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` } });
  };
  const token = json(await call('POST', '/v1/auth/signup', null, { email: 'cam@incha.tv', handle: 'cam_op', password: 'hinchada123' })).token;
  const other = json(await call('POST', '/v1/auth/signup', null, { email: 'fan@incha.tv', handle: 'fan', password: 'hinchada123' })).token;

  // --- conversion ---
  let res = await upload(token, 'terrace.webm', 'video/webm', readFileSync(join(scratch, 'clip.webm')));
  assert.equal(res.statusCode, 201);
  const webm = json(res).post;
  assert.equal(webm.mediaStatus, 'processing');
  res = await upload(token, 'IMG_2231.MOV', 'application/octet-stream', readFileSync(join(scratch, 'clip.mp4')));
  assert.equal(res.statusCode, 201, 'extension fallback for generic mime');
  const mov = json(res).post;
  res = await upload(token, 'broken.mp4', 'video/mp4', Buffer.alloc(4096, 9));
  const broken = json(res).post;

  // Published while still processing: stays out of the feed until it's playable.
  await call('PATCH', `/v1/posts/${webm.id}`, token, { title: 'Tifo reveal' });
  await call('POST', `/v1/posts/${webm.id}/publish`, token, { visibility: 'public' });
  await app.transcoder.drain();

  let post = json(await call('GET', `/v1/posts/${webm.id}`, token)).post;
  assert.equal(post.mediaStatus, 'ready');
  assert.equal(post.mediaMime, 'video/mp4');
  assert.match(post.mediaUrl, /\.mp4$/, 'public media is unsigned');
  assert.ok(post.coverUrl, 'poster frame generated');
  assert.ok(Math.abs(post.duration - 6) < 0.5, `duration ${post.duration}`);
  assert.deepEqual([post.width, post.height], [640, 360]);
  const media = await call('GET', new URL(post.mediaUrl).pathname);
  assert.equal(media.statusCode, 200);
  writeFileSync(join(scratch, 'served.mp4'), media.rawPayload);
  const probed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', join(scratch, 'served.mp4')]));
  assert.deepEqual(probed.streams.map(s => s.codec_name).sort(), ['aac', 'h264']);
  assert.equal(json(await call('GET', '/v1/posts')).posts.length, 1);

  post = json(await call('GET', `/v1/posts/${mov.id}`, token)).post;
  assert.equal(post.mediaStatus, 'ready');
  assert.deepEqual([post.width, post.height], [360, 640]);

  post = json(await call('GET', `/v1/posts/${broken.id}`, token)).post;
  assert.equal(post.mediaStatus, 'failed');
  assert.ok(post.mediaError);

  // --- go live ---
  res = await call('POST', '/v1/matches', token, { home: 'Kensington FC', away: 'Fishtown United' });
  const matchId = json(res).match.id;
  res = await call('POST', '/v1/matches', token, { home: 'U10 Reds', away: 'U10 Blues', youth: true });
  assert.equal((await call('POST', `/v1/matches/${json(res).match.id}/streams`, token)).statusCode, 403, 'no live video of youth matches');
  assert.equal((await call('POST', `/v1/matches/${matchId}/streams`)).statusCode, 401);

  res = await call('POST', `/v1/matches/${matchId}/streams`, token);
  assert.equal(res.statusCode, 201);
  const stream = json(res).stream;
  assert.match(stream.hlsUrl, new RegExp(`/live/${stream.id}/index\\.m3u8$`));
  assert.equal((await call('POST', `/v1/matches/${matchId}/streams`, token)).statusCode, 409, 'one stream per person');
  let snap = json(await call('GET', `/v1/matches/${matchId}`));
  assert.equal(snap.streams.length, 1);
  assert.equal(snap.match.liveStreams, 1);

  const bytes = readFileSync(join(scratch, 'clip.webm'));
  const size = 64 * 1024;
  const chunks = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size));
  const send = (seq, body, who = token) => call('POST', `/v1/streams/${stream.id}/chunks?seq=${seq}`, who, body, { 'content-type': 'application/octet-stream' });
  assert.equal((await send(0, chunks[0], other)).statusCode, 404, 'only the streamer can send');
  assert.equal((await send(1, chunks[1])).statusCode, 409, 'chunks arrive in order');
  for (let seq = 0; seq < chunks.length; seq++) {
    res = await send(seq, chunks[seq]);
    assert.equal(res.statusCode, 200);
    assert.equal(json(res).next, seq + 1);
  }
  assert.equal(json(await send(0, chunks[0])).next, chunks.length, 'retried chunk is acknowledged, not re-fed');

  // Viewers get an HLS playlist once the first segments are cut.
  let playlist;
  for (let i = 0; i < 50 && !(playlist?.statusCode === 200 && playlist.body.includes('.ts')); i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    playlist = await call('GET', `/live/${stream.id}/index.m3u8`);
  }
  assert.equal(playlist.statusCode, 200);
  assert.equal(playlist.headers['content-type'], 'application/vnd.apple.mpegurl');
  const segment = playlist.body.split('\n').find(line => line.endsWith('.ts'));
  res = await call('GET', `/live/${stream.id}/${segment}`);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'video/mp2t');
  assert.equal((await call('GET', `/live/${stream.id}/..%2Frec.mp4`)).statusCode, 404);

  // "Clip that": a viewer cuts the last 30s; it's published to the match, credited to the streamer.
  assert.equal((await call('POST', `/v1/streams/${stream.id}/clip`)).statusCode, 401);
  res = await call('POST', `/v1/streams/${stream.id}/clip`, other);
  assert.equal(res.statusCode, 201, res.body);
  const clip = json(res).post;
  assert.ok(clip.duration > 3 && clip.duration <= 31, `clip duration ${clip.duration}`);
  assert.equal(clip.visibility, 'public');
  assert.equal((await call('POST', `/v1/streams/${stream.id}/clip`, other)).statusCode, 429, 'one clip every few seconds');
  const clipPost = json(await call('GET', `/v1/posts/${clip.id}`)).post;
  assert.equal(clipPost.status, 'published');
  assert.equal(clipPost.mediaStatus, 'ready');
  assert.deepEqual(clipPost.clippedFrom, { handle: 'cam_op' });
  assert.equal(clipPost.match.id, matchId);
  assert.equal(clipPost.creator.handle, 'fan');
  assert.match(clipPost.title, /^Clip · Kensington FC vs Fishtown United/);
  assert.ok(clipPost.coverUrl);
  assert.ok(json(await call('GET', `/v1/matches/${matchId}`)).clips.some(c => c.id === clip.id), 'on the match timeline');
  res = await call('POST', `/v1/streams/${stream.id}/clip`, token);
  assert.equal(res.statusCode, 201, 'the streamer can clip too');
  assert.equal(json(await call('GET', `/v1/posts/${json(res).post.id}`)).post.clippedFrom, null, 'no self-credit');

  assert.equal((await call('POST', `/v1/streams/${stream.id}/end`, other)).statusCode, 404);
  res = await call('POST', `/v1/streams/${stream.id}/end`, token);
  assert.equal(res.statusCode, 200);
  const { replayPostId } = json(res);
  assert.equal(json(res).stream.status, 'ended');
  assert.ok(replayPostId, 'recording saved');
  assert.equal((await send(chunks.length, chunks[0])).statusCode, 404, 'no chunks after the end');
  assert.equal((await call('POST', `/v1/streams/${stream.id}/clip`, other)).statusCode, 410, 'clips come from live streams');

  // --- highlight reel at full time + following feed ---
  res = await call('POST', '/v1/matches', token, { home: 'La Barra Brava', away: 'Port Richmond', competition: 'Liga Latina' });
  const final = json(res).match;
  await call('PATCH', `/v1/posts/${webm.id}`, token, { matchId: final.id, matchMinute: 78 });
  await call('PATCH', `/v1/posts/${mov.id}`, token, { matchId: final.id, matchMinute: 12, title: 'Early header' });
  await call('POST', `/v1/posts/${mov.id}/publish`, token, { visibility: 'public' });
  await call('POST', `/v1/matches/${final.id}/events`, token, { type: 'kickoff' });
  await call('POST', `/v1/matches/${final.id}/events`, token, { type: 'goal', side: 'home' });
  assert.equal((await call('POST', `/v1/matches/${final.id}/reel`, token)).statusCode, 400, 'reels are made at full time');
  await call('POST', `/v1/matches/${final.id}/events`, token, { type: 'fulltime' });
  await new Promise(resolve => setTimeout(resolve, 50));
  await app.reels.drain();
  snap = json(await call('GET', `/v1/matches/${final.id}`));
  assert.equal(snap.match.reelStatus, 'ready');
  assert.ok(!snap.clips.some(c => c.id === snap.match.reelPostId), 'the reel is not one of its own clips');
  const reel = json(await call('GET', `/v1/posts/${snap.match.reelPostId}`)).post;
  assert.equal(reel.title, 'Highlights · La Barra Brava 1–0 Port Richmond');
  assert.equal(reel.status, 'published');
  assert.equal(reel.visibility, 'public');
  assert.equal(reel.creator.handle, 'cam_op');
  assert.deepEqual([reel.width, reel.height], [1280, 720]);
  assert.ok(reel.duration > 3 + 5 && reel.duration < 3 + 6 + 3 + 1.5, `reel duration ${reel.duration}`);
  assert.ok(reel.coverUrl);
  const reelFile = await call('GET', new URL(reel.mediaUrl).pathname);
  writeFileSync(join(scratch, 'reel.mp4'), reelFile.rawPayload);
  const reelStreams = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', join(scratch, 'reel.mp4')])).streams;
  assert.deepEqual(reelStreams.map(s => s.codec_name).sort(), ['aac', 'h264']);
  assert.equal((await call('POST', `/v1/matches/${final.id}/reel`, other)).statusCode, 404, 'only scorekeepers rebuild');
  assert.equal((await call('POST', `/v1/matches/${final.id}/reel`, token)).statusCode, 202);
  await new Promise(resolve => setTimeout(resolve, 50));
  await app.reels.drain();
  const rebuilt = json(await call('GET', `/v1/matches/${final.id}`)).match;
  assert.notEqual(rebuilt.reelPostId, reel.id, 'rebuild replaces the reel');
  assert.equal((await call('GET', `/v1/posts/${reel.id}`, token)).statusCode, 404, 'old reel removed');

  // Following feed: follow the match (or a team in a public match) and its clips + reel show up.
  assert.equal((await call('GET', '/v1/feed/following')).statusCode, 401);
  assert.deepEqual(json(await call('GET', '/v1/feed/following', other)).posts, []);
  await call('POST', `/v1/teams/port-richmond/follow`, other);
  let feed = json(await call('GET', '/v1/feed/following', other)).posts;
  assert.deepEqual(feed.map(p => p.id).sort(), [webm.id, mov.id, rebuilt.reelPostId].sort());
  assert.equal(feed[0].id, rebuilt.reelPostId, 'newest first');
  await call('DELETE', `/v1/teams/port-richmond/follow`, other);
  await call('POST', `/v1/matches/${final.id}/follow`, other);
  feed = json(await call('GET', '/v1/feed/following', other)).posts;
  assert.equal(feed.length, 3);

  const replay = json(await call('GET', `/v1/posts/${replayPostId}`, token)).post;
  assert.equal(replay.status, 'draft');
  assert.equal(replay.mediaStatus, 'ready');
  assert.equal(replay.match.id, matchId);
  assert.equal(replay.title, 'Live: Kensington FC vs Fishtown United');
  assert.ok(replay.duration > 4, `replay duration ${replay.duration}`);
  assert.ok(replay.coverUrl);
  assert.equal((await call('GET', `/v1/posts/${replayPostId}`, other)).statusCode, 404, 'replay starts as a private draft');
  snap = json(await call('GET', `/v1/matches/${matchId}`));
  assert.equal(snap.streams.length, 0);
  assert.equal(snap.match.liveStreams, 0);
});

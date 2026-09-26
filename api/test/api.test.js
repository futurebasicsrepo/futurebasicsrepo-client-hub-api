// End-to-end API test. Runs only when TEST_DATABASE_URL points at a disposable Postgres database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

test('incha.tv API flow', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-media-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off'; // fake media bytes here; real conversion is covered in media.test.js
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  t.after(async () => { await app.close(); await pool.end(); });

  const json = (res) => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({
    method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}
  });
  const upload = (url, token, { name, type, bytes }) => {
    const boundary = '----incha';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    return app.inject({ method: 'POST', url, payload: body, headers: {
      authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}`
    } });
  };

  // Accounts
  let res = await call('POST', '/v1/auth/signup', null, { email: 'sergio@incha.tv', handle: 'Sergio', password: 'hinchada123', displayName: 'Sergio' });
  assert.equal(res.statusCode, 201);
  const creator = json(res).token;
  res = await call('POST', '/v1/auth/signup', null, { email: 'fan@incha.tv', handle: 'sergio', password: 'hinchada123' });
  assert.equal(res.statusCode, 409);
  res = await call('POST', '/v1/auth/signup', null, { email: 'fan@incha.tv', handle: 'fan_one', password: 'hinchada123' });
  const fan = json(res).token;
  res = await call('POST', '/v1/auth/login', null, { login: '@SERGIO', password: 'hinchada123' });
  assert.equal(res.statusCode, 200);
  res = await call('POST', '/v1/auth/login', null, { login: 'sergio', password: 'nope' });
  assert.equal(res.statusCode, 401);

  // Upload → draft
  res = await upload('/v1/posts', creator, { name: 'exe.sh', type: 'application/x-sh', bytes: Buffer.from('#!') });
  assert.equal(res.statusCode, 415);
  const videoBytes = Buffer.alloc(4096, 7);
  res = await upload('/v1/posts', creator, { name: 'derby_day-goal.mp4', type: 'video/mp4', bytes: videoBytes });
  assert.equal(res.statusCode, 201);
  let post = json(res).post;
  assert.equal(post.status, 'draft');
  assert.equal(post.title, 'derby day goal');
  assert.match(post.mediaUrl, /\?exp=\d+&sig=/, 'draft media is signed');

  // Drafts are invisible to others
  assert.equal((await call('GET', `/v1/posts/${post.id}`, fan)).statusCode, 404);
  assert.equal((await call('GET', `/v1/posts/${post.id}`)).statusCode, 404);
  const mediaPath = new URL(post.mediaUrl).pathname;
  assert.equal((await call('GET', mediaPath)).statusCode, 403, 'unsigned draft media is blocked');
  const signed = new URL(post.mediaUrl);
  res = await call('GET', signed.pathname + signed.search);
  assert.equal(res.statusCode, 200);
  assert.equal(res.rawPayload.length, 4096);

  // Light edit
  res = await call('PATCH', `/v1/posts/${post.id}`, creator, { trimStart: 1, trimEnd: 0.2 });
  assert.equal(res.statusCode, 400);
  res = await call('PATCH', `/v1/posts/${post.id}`, creator, {
    title: 'Derby day: last-minute winner', description: 'Section 133 lost its mind', fandom: 'Philadelphia Union',
    duration: 30, trimStart: 2.5, trimEnd: 21, filter: 'floodlight'
  });
  assert.equal(res.statusCode, 200);
  post = json(res).post;
  assert.deepEqual(post.fandom, { slug: 'philadelphia-union', name: 'Philadelphia Union' });
  assert.equal(post.trimStart, 2.5);
  assert.equal(post.filter, 'floodlight');
  assert.equal((await call('PATCH', `/v1/posts/${post.id}`, fan, { title: 'hijack' })).statusCode, 404);

  // Cover
  res = await upload(`/v1/posts/${post.id}/cover`, creator, { name: 'cover.jpg', type: 'image/jpeg', bytes: Buffer.alloc(100, 1) });
  assert.equal(res.statusCode, 200);
  assert.ok(json(res).post.coverUrl);

  // Publish public → feed, unsigned media, range requests
  res = await call('POST', `/v1/posts/${post.id}/publish`, creator, { visibility: 'public' });
  post = json(res).post;
  assert.equal(post.status, 'published');
  assert.ok(!post.mediaUrl.includes('sig='));
  res = await call('GET', '/v1/posts?sort=new');
  assert.deepEqual(json(res).posts.map(p => p.id), [post.id]);
  res = await call('GET', '/v1/posts?fandom=philadelphia-union&sort=hot');
  assert.equal(json(res).posts.length, 1);
  res = await call('GET', '/v1/posts?q=winner');
  assert.equal(json(res).posts.length, 1);
  res = await app.inject({ method: 'GET', url: mediaPath, headers: { range: 'bytes=0-99' } });
  assert.equal(res.statusCode, 206);
  assert.equal(res.headers['content-range'], 'bytes 0-99/4096');
  assert.equal(res.rawPayload.length, 100);
  res = await app.inject({ method: 'GET', url: mediaPath, headers: { range: 'bytes=5000-' } });
  assert.equal(res.statusCode, 416);

  // Votes toggle and stay idempotent
  assert.equal((await call('POST', `/v1/posts/${post.id}/vote`, null, {})).statusCode, 401);
  res = await call('POST', `/v1/posts/${post.id}/vote`, fan, { value: 1 });
  assert.deepEqual(json(res), { score: 1, viewerHasVoted: true });
  res = await call('POST', `/v1/posts/${post.id}/vote`, fan, { value: 1 });
  assert.equal(json(res).score, 1);
  res = await call('POST', `/v1/posts/${post.id}/vote`, fan, {});
  assert.deepEqual(json(res), { score: 0, viewerHasVoted: false });
  await call('POST', `/v1/posts/${post.id}/vote`, fan, {});

  // Views dedupe per viewer
  await call('POST', `/v1/posts/${post.id}/view`, fan);
  await call('POST', `/v1/posts/${post.id}/view`, fan);
  res = await call('GET', `/v1/posts/${post.id}`, fan);
  assert.equal(json(res).post.viewCount, 1);
  assert.equal(json(res).post.viewerHasVoted, true);

  // Comments with one level of threading
  res = await call('POST', `/v1/posts/${post.id}/comments`, fan, { body: 'Unreal. Was there!' });
  assert.equal(res.statusCode, 201);
  const top = json(res).comment;
  res = await call('POST', `/v1/posts/${post.id}/comments`, creator, { body: 'Gracias 🙌', parentId: top.id });
  const reply = json(res).comment;
  assert.equal(reply.parentId, top.id);
  res = await call('POST', `/v1/posts/${post.id}/comments`, fan, { body: 'deep', parentId: reply.id });
  assert.equal(json(res).comment.parentId, top.id, 'nested replies flatten to the top-level thread');
  res = await call('GET', `/v1/posts/${post.id}/comments`);
  assert.equal(json(res).comments.length, 3);
  assert.equal((await call('DELETE', `/v1/comments/${top.id}`, creator)).statusCode, 204, 'post owner can moderate');
  res = await call('GET', `/v1/posts/${post.id}`);
  assert.equal(json(res).post.commentCount, 2);
  res = await call('GET', `/v1/posts/${post.id}/comments`);
  assert.equal(json(res).comments[0].deleted, true);
  assert.equal(json(res).comments[0].body, null);

  // Unlisted: link works, feed hides it, media gets signed
  res = await call('PATCH', `/v1/posts/${post.id}`, creator, { visibility: 'unlisted' });
  assert.match(json(res).post.mediaUrl, /sig=/);
  assert.equal((await call('GET', `/v1/posts/${post.id}`)).statusCode, 200);
  assert.equal(json(await call('GET', '/v1/posts')).posts.length, 0);
  assert.equal((await call('GET', mediaPath)).statusCode, 403);

  // Private: owner only
  await call('PATCH', `/v1/posts/${post.id}`, creator, { visibility: 'private' });
  assert.equal((await call('GET', `/v1/posts/${post.id}`, fan)).statusCode, 404);
  assert.equal((await call('GET', `/v1/posts/${post.id}`, creator)).statusCode, 200);
  assert.equal((await call('POST', `/v1/posts/${post.id}/comments`, fan, { body: 'hi' })).statusCode, 404);

  // Studio + profile + fandoms
  res = await call('GET', '/v1/me/posts', creator);
  assert.equal(json(res).posts.length, 1);
  res = await call('GET', '/v1/users/sergio');
  assert.equal(json(res).user.postCount, 0);
  assert.equal(json(res).user.id, undefined, 'profile hides internal id');
  res = await call('GET', '/v1/fandoms');
  assert.ok(json(res).fandoms.some(f => f.slug === 'argentina'));

  // Match centre: create, score live, stream updates, attach clips
  res = await call('POST', '/v1/matches', creator, { home: 'Rangers FC', away: 'Rangers FC' });
  assert.equal(res.statusCode, 400);
  res = await call('POST', '/v1/matches', creator, { home: 'Rangers FC', away: 'Kensington United', competition: 'Philly Sunday League', venue: 'Field 3', halfLength: 40 });
  assert.equal(res.statusCode, 201);
  const match = json(res).match;
  assert.equal(match.status, 'upcoming');
  assert.equal(match.canScore, true);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, fan)).match.canScore, false);
  assert.equal((await call('POST', `/v1/matches/${match.id}/events`, fan, { type: 'kickoff' })).statusCode, 404, 'only the scorekeeper can score');
  assert.equal((await call('POST', `/v1/matches/${match.id}/events`, creator, { type: 'goal', side: 'home' })).statusCode, 400);
  res = await call('POST', `/v1/matches/${match.id}/events`, creator, { type: 'kickoff' });
  assert.equal(json(res).match.status, 'live');
  assert.equal(json(await call('GET', '/v1/matches?filter=live')).matches.length, 1);

  // Live stream over a real socket
  await app.listen({ port: 0, host: '127.0.0.1' });
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const stream = await fetch(`${base}/v1/matches/${match.id}/stream`, { headers: { origin: 'http://localhost:3000' } });
  assert.equal(stream.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(stream.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const reader = stream.body.getReader();
  const nextUpdate = async () => {
    let buffer = '';
    while (!buffer.includes('\n\n')) buffer += new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(/data: (.*)/.exec(buffer)[1]);
  };
  assert.equal((await nextUpdate()).match.homeScore, 0);
  res = await call('POST', `/v1/matches/${match.id}/events`, creator, { type: 'goal', side: 'home', player: 'Marcus' });
  assert.equal(res.statusCode, 201);
  const live = await nextUpdate();
  assert.equal(live.match.homeScore, 1);
  assert.equal(live.events.at(-1).player, 'Marcus');
  assert.equal(live.events.at(-1).minute, 1);
  await reader.cancel();

  const goalId = json(res).events.at(-1).id;
  res = await call('DELETE', `/v1/matches/${match.id}/events/${goalId}`, creator);
  assert.equal(json(res).match.homeScore, 0, 'undoing a goal takes it off the board');
  await call('POST', `/v1/matches/${match.id}/events`, creator, { type: 'goal', side: 'away', minute: 34 });

  // Attach a clip at a minute
  res = await upload('/v1/posts', fan, { name: 'screamer.mp4', type: 'video/mp4', bytes: Buffer.alloc(2048, 3) });
  const clip = json(res).post;
  res = await call('PATCH', `/v1/posts/${clip.id}`, fan, { matchId: 'nope123456', title: 'x' });
  assert.equal(res.statusCode, 400);
  res = await call('PATCH', `/v1/posts/${clip.id}`, fan, { matchId: match.id, matchMinute: 34, title: 'Top bins from the halfway line' });
  assert.equal(json(res).post.match.id, match.id);
  assert.equal(json(res).post.matchMinute, 34);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`)).clips.length, 0, 'drafts stay off the match page');
  await call('POST', `/v1/posts/${clip.id}/publish`, fan, { visibility: 'public' });
  res = await call('GET', `/v1/matches/${match.id}`);
  assert.deepEqual(json(res).clips.map(c => [c.id, c.matchMinute]), [[clip.id, 34]]);
  assert.equal(json(res).match.awayScore, 1);

  for (const type of ['halftime', 'second_half', 'fulltime']) {
    assert.equal((await call('POST', `/v1/matches/${match.id}/events`, creator, { type })).statusCode, 201, type);
  }
  assert.equal(json(await call('GET', '/v1/matches?filter=recent')).matches[0].id, match.id);
  res = await call('GET', '/v1/teams/kensington-united');
  assert.deepEqual(json(res).record, { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 1, goalsAgainst: 0 });

  // Youth matches are never listed and their clips can't go public
  res = await call('POST', '/v1/matches', creator, { home: 'U12 Lions', away: 'U12 Tigers', youth: true });
  const youth = json(res).match;
  assert.equal(youth.visibility, 'unlisted');
  await call('POST', `/v1/matches/${youth.id}/events`, creator, { type: 'kickoff' });
  assert.ok(!json(await call('GET', '/v1/matches?filter=live')).matches.some(m => m.id === youth.id));
  res = await upload('/v1/posts', fan, { name: 'kid.mp4', type: 'video/mp4', bytes: Buffer.alloc(1024, 4) });
  const kidClip = json(res).post;
  await call('PATCH', `/v1/posts/${kidClip.id}`, fan, { matchId: youth.id, title: 'Great save' });
  assert.equal((await call('POST', `/v1/posts/${kidClip.id}/publish`, fan, { visibility: 'public' })).statusCode, 400);
  assert.equal((await call('POST', `/v1/posts/${kidClip.id}/publish`, fan, { visibility: 'unlisted' })).statusCode, 200);

  // Delete removes post and media
  assert.equal((await call('DELETE', `/v1/posts/${post.id}`, fan)).statusCode, 404);
  assert.equal((await call('DELETE', `/v1/posts/${post.id}`, creator)).statusCode, 204);
  assert.equal((await call('GET', `/v1/posts/${post.id}`, creator)).statusCode, 404);
  assert.equal((await call('GET', signed.pathname + signed.search)).statusCode, 404);
});

// Match centre: teams, live matches, scorekeeper events, and a Server-Sent Events stream.
import { AUTO_END, applyEvent, autoFullTime, matchStatus, normalizeMatchInput } from './match.js';
import { roundName } from './bracket.js';
import { createLimiter, randomId, slugify, POST_ID_RE } from './lib.js';

const MATCH_SELECT = `
  select m.*, ht.name as home_name, ht.slug as home_slug, aw.name as away_name, aw.slug as away_slug,
    u.handle as keeper_handle, u.display_name as keeper_name,
    (select count(*)::int from streams s where s.match_id = m.id and s.status = 'live') as live_streams,
    (select coalesce(array_agg(k.user_id::text), '{}') from match_keepers k where k.match_id = m.id) as keeper_ids,
    (select json_build_object('id', t.id, 'name', t.name, 'round', b.round, 'rounds', t.rounds)
      from bracket_slots b join tournaments t on t.id = b.tournament_id where b.match_id = m.id) as tournament_json
  from matches m
  join teams ht on ht.id = m.home_team_id
  join teams aw on aw.id = m.away_team_id
  join users u on u.id = m.created_by`;

export const matchRow = row => ({
  id: row.id,
  home: { name: row.home_name, slug: row.home_slug },
  away: { name: row.away_name, slug: row.away_slug },
  homeScore: row.home_score,
  awayScore: row.away_score,
  period: row.period,
  status: matchStatus(row.period),
  periodStartedAt: row.period_started_at,
  halfLength: row.half_length,
  kickoffAt: row.kickoff_at,
  venue: row.venue,
  competition: row.competition,
  youth: row.youth,
  visibility: row.visibility,
  scorekeeper: { handle: row.keeper_handle, displayName: row.keeper_name },
  liveStreams: row.live_streams ?? 0,
  reelStatus: row.reel_status ?? null,
  reelPostId: row.reel_post_id ?? null,
  autoEnded: Boolean(row.auto_ended_from),
  tournament: row.tournament_json
    ? { id: row.tournament_json.id, name: row.tournament_json.name, round: roundName(row.tournament_json.round, row.tournament_json.rounds) }
    : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const eventView = row => ({
  id: Number(row.id), type: row.type, side: row.side, minute: row.minute, stoppage: row.stoppage, player: row.player,
  playerId: row.player_id == null ? null : Number(row.player_id), createdAt: row.created_at
});

export const playerView = row => ({ id: Number(row.id), name: row.name, number: row.number, position: row.position });

const MAX_CO_KEEPERS = 3;
export const CHEERS = ['flare', 'clap', 'wow'];

// The match's creator and anyone they've added can run the scoreboard.
export const canKeep = (row, user) => Boolean(user && (Number(row.created_by) === user.id || (row.keeper_ids || []).includes(String(user.id))));

export function registerMatches(app, { pool, fail, requireUser, postView, POST_SELECT, streamView, notifier, hooks = {}, sweepMs = 60_000 }) {
  // Tell listeners (tournament brackets) that a match's score or period moved.
  const changed = (id, log = app.log) => Promise.resolve(hooks.matchChanged?.(id)).catch(err => log.error(err));
  const matchLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
  const subscribers = new Map(); // matchId -> Set<{ raw, req }>

  async function loadMatch(id) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows } = await pool.query(`${MATCH_SELECT} where m.id = $1`, [id]);
    return rows[0] || null;
  }

  // A team that has ever played a youth match stays youth: its roster is only shown to its managers.
  async function teamId(name, userId, youth = false) {
    const { rows } = await pool.query(
      `insert into teams (slug, name, created_by, youth) values ($1, $2, $3, $4)
       on conflict (slug) do update set youth = teams.youth or excluded.youth returning id`,
      [slugify(name) || randomId(8).toLowerCase(), name, userId, youth]);
    return rows[0].id;
  }

  async function snapshot(req, row) {
    const keeping = canKeep(row, req.user);
    const [{ rows: events }, { rows: clips }, { rows: streams }, { rows: keepers }, { rows: follow }, { rows: players }] = await Promise.all([
      pool.query(`select * from match_events where match_id = $1 order by created_at asc`, [row.id]),
      pool.query(`${POST_SELECT} where p.match_id = $2 and p.status = 'published' and p.visibility <> 'private' and p.media_status = 'ready' and not p.is_reel
        order by p.match_minute asc nulls last, p.published_at asc limit 200`, [req.user?.id ?? null, row.id]),
      pool.query(`select s.*, u.handle, u.display_name from streams s join users u on u.id = s.user_id
        where s.match_id = $1 and s.status = 'live' order by s.started_at asc`, [row.id]),
      pool.query(`select u.handle, u.display_name from match_keepers k join users u on u.id = k.user_id where k.match_id = $1 order by k.created_at`, [row.id]),
      req.user
        ? pool.query(`select exists(select 1 from match_follows where user_id = $1 and match_id = $2) as following`, [req.user.id, row.id])
        : Promise.resolve({ rows: [{ following: false }] }),
      // Scorekeepers pick scorers from the two squads.
      keeping
        ? pool.query(`select * from team_players where team_id = any($1) order by number asc nulls last, name asc`, [[row.home_team_id, row.away_team_id]])
        : Promise.resolve({ rows: [] })
    ]);
    const squad = teamId => players.filter(p => String(p.team_id) === String(teamId)).map(playerView);
    return {
      match: {
        ...matchRow(row),
        canScore: keeping,
        isOwner: Boolean(req.user && Number(row.created_by) === req.user.id),
        following: Boolean(follow[0]?.following),
        keepers: keepers.map(k => ({ handle: k.handle, displayName: k.display_name }))
      },
      events: events.map(eventView),
      ...(keeping ? { rosters: { home: squad(row.home_team_id), away: squad(row.away_team_id) } } : {}),
      clips: clips.map(clip => postView(req, clip)),
      streams: streams.map(stream => streamView(req, stream)),
      serverTime: new Date().toISOString()
    };
  }

  // ---- the crowd: who's watching, and cheers that float up everyone's screen ----
  const send = (matchId, event, data) => {
    const watchers = subscribers.get(matchId);
    if (!watchers?.size) return;
    const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const { raw } of watchers) raw.write(line);
  };
  // Watcher counts go out at most every 2s per match, so a busy match doesn't spam every join/leave.
  const crowdTimers = new Map();
  const announceCrowd = matchId => {
    if (crowdTimers.has(matchId)) return;
    crowdTimers.set(matchId, setTimeout(() => {
      crowdTimers.delete(matchId);
      send(matchId, 'crowd', { watching: subscribers.get(matchId)?.size ?? 0 });
    }, 2000));
  };
  // Cheers are pooled for 400ms and sent as counts, so a thousand taps are one small message.
  const cheerPools = new Map(); // matchId -> { counts, from: Set<cid>, timer }
  const cheerLimiter = createLimiter({ windowMs: 10_000, max: 25 });

  // Push the latest state to everyone watching a match. Stream viewers are anonymous.
  async function notify(matchId) {
    const watchers = subscribers.get(matchId);
    if (!matchId || !watchers?.size) return;
    const row = await loadMatch(matchId);
    if (!row) return;
    const first = [...watchers][0].req;
    const data = JSON.stringify(await snapshot({ user: null, protocol: first.protocol, host: first.host }, row));
    for (const { raw } of watchers) raw.write(`event: update\ndata: ${data}\n\n`);
  }

  const listQuery = where => `${MATCH_SELECT} where m.visibility = 'public' and not m.youth and ${where}`;

  app.get('/v1/matches', async req => {
    const filter = ['live', 'upcoming', 'recent'].includes(req.query.filter) ? req.query.filter : 'live';
    const params = [];
    let teamClause = '';
    if (req.query.team) { params.push(slugify(req.query.team)); teamClause = ` and (ht.slug = $1 or aw.slug = $1)`; }
    const sql = {
      live: listQuery(`m.period = any('{1h,ht,2h}')${teamClause}`) + ' order by m.period_started_at desc nulls last limit 50',
      upcoming: listQuery(`m.period = 'pre'${teamClause}`) + ' order by m.kickoff_at asc limit 50',
      recent: listQuery(`m.period = 'ft'${teamClause}`) + ' order by m.kickoff_at desc limit 50'
    }[filter];
    const { rows } = await pool.query(sql, params);
    return { matches: rows.map(matchRow), serverTime: new Date().toISOString() };
  });

  // Everything tying you to matches, for your profile: games you run or co-keep, and games you follow.
  app.get('/v1/me/matches', { preHandler: requireUser }, async req => {
    const [{ rows: running }, { rows: following }] = await Promise.all([
      pool.query(`${MATCH_SELECT}
        where m.created_by = $1 or exists(select 1 from match_keepers k where k.match_id = m.id and k.user_id = $1)
        order by m.kickoff_at desc limit 100`, [req.user.id]),
      pool.query(`${MATCH_SELECT}
        join match_follows f on f.match_id = m.id and f.user_id = $1
        where m.created_by <> $1 and not exists(select 1 from match_keepers k where k.match_id = m.id and k.user_id = $1)
        order by m.kickoff_at desc limit 100`, [req.user.id])
    ]);
    const role = row => (Number(row.created_by) === req.user.id ? 'scorekeeper' : 'co-keeper');
    return {
      matches: running.map(row => ({ ...matchRow(row), role: role(row) })),
      following: following.map(matchRow),
      serverTime: new Date().toISOString()
    };
  });

  // A person's public record: matches they kept score for (never youth or unlisted ones).
  app.get('/v1/users/:handle/matches', async (req, reply) => {
    const { rows: [user] } = await pool.query(`select id from users where handle = $1`, [String(req.params.handle).toLowerCase().replace(/^@/, '')]);
    if (!user) return fail(reply, 404, 'Creator not found.');
    const { rows } = await pool.query(`${MATCH_SELECT}
      where m.visibility = 'public' and not m.youth
        and (m.created_by = $1 or exists(select 1 from match_keepers k where k.match_id = m.id and k.user_id = $1))
      order by m.kickoff_at desc limit 50`, [user.id]);
    return { matches: rows.map(matchRow), serverTime: new Date().toISOString() };
  });

  app.post('/v1/matches', { preHandler: requireUser }, async (req, reply) => {
    if (!matchLimiter(`match:${req.user.id}`)) return fail(reply, 429, 'Match limit reached. Try again later.');
    const { values, errors } = normalizeMatchInput(req.body || {});
    if (errors.length) return fail(reply, 400, errors.join(' '));
    const id = randomId(10);
    const [home, away] = [await teamId(values.home, req.user.id, values.youth), await teamId(values.away, req.user.id, values.youth)];
    if (home === away) return fail(reply, 400, 'A team can’t play itself.');
    await pool.query(
      `insert into matches (id, home_team_id, away_team_id, half_length, kickoff_at, venue, competition, youth, visibility, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, home, away, values.halfLength, values.kickoffAt, values.venue, values.competition, values.youth, values.visibility, req.user.id]);
    // Whoever runs a match follows it, so they hear what co-scorekeepers log and when someone goes live.
    await pool.query(`insert into match_follows (user_id, match_id) values ($1, $2) on conflict do nothing`, [req.user.id, id]);
    return reply.code(201).send(await snapshot(req, await loadMatch(id)));
  });

  app.get('/v1/matches/:id', async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row) return fail(reply, 404, 'Match not found.');
    return snapshot(req, row);
  });

  app.post('/v1/matches/:id/events', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || !canKeep(row, req.user)) return fail(reply, 404, 'Match not found.');
    const state = { period: row.period, periodStartedAt: row.period_started_at, halfLength: row.half_length, homeScore: row.home_score, awayScore: row.away_score };
    const body = { ...(req.body || {}) };
    // A scorer picked from the squad: their name goes on the event, and the link counts toward their goals.
    let playerId = null;
    if (body.playerId != null && body.playerId !== '') {
      const teamOf = { home: row.home_team_id, away: row.away_team_id }[body.side];
      const { rows: [picked] } = teamOf
        ? await pool.query(`select id, name from team_players where id = $1 and team_id = $2`, [Number(body.playerId) || 0, teamOf])
        : { rows: [] };
      if (!picked) return fail(reply, 400, 'That player isn’t in this team’s squad.');
      playerId = picked.id;
      body.player = picked.name;
    }
    const { error, event, patch } = applyEvent(state, body);
    if (error) return fail(reply, 400, error);
    if (!['goal', 'yellow', 'red'].includes(event.type)) playerId = null;
    const client = await pool.connect();
    try {
      await client.query('begin');
      // Lock the row so two quick taps can't both apply against the same state.
      const { rows: [locked] } = await client.query(`select period from matches where id = $1 for update`, [row.id]);
      if (locked.period !== row.period) { await client.query('rollback'); return fail(reply, 409, 'The match changed. Try again.'); }
      await client.query(
        `insert into match_events (match_id, type, side, minute, stoppage, player, player_id, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, event.type, event.side, event.minute, event.stoppage, event.player, playerId, req.user.id]);
      await client.query(
        `update matches set period = $2, period_started_at = $3, home_score = home_score + $4, away_score = away_score + $5, updated_at = now() where id = $1`,
        [row.id, patch.period ?? row.period, 'periodStartedAt' in patch ? patch.periodStartedAt : row.period_started_at,
          'homeScore' in patch ? 1 : 0, 'awayScore' in patch ? 1 : 0]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    notify(row.id).catch(err => req.log.error(err));
    const updated = await loadMatch(row.id);
    notifier?.matchEvent(updated, event, req.user.id).catch(err => req.log.error(err));
    if (event.type === 'fulltime') Promise.resolve(hooks.fulltime?.(row.id)).catch(err => req.log.error(err));
    if (event.type === 'goal' || event.type === 'fulltime') await changed(row.id, req.log);
    return reply.code(201).send(await snapshot(req, updated));
  });

  // Undo a goal, card or note. Period changes are not undoable in v1.
  app.delete('/v1/matches/:id/events/:eventId', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || !canKeep(row, req.user)) return fail(reply, 404, 'Match not found.');
    const { rows: [event] } = await pool.query(`select * from match_events where id = $1 and match_id = $2`, [Number(req.params.eventId) || 0, row.id]);
    if (!event) return fail(reply, 404, 'Event not found.');
    if (!['goal', 'yellow', 'red', 'note'].includes(event.type)) return fail(reply, 400, 'Kick-off and period changes can’t be undone yet.');
    await pool.query(`delete from match_events where id = $1`, [event.id]);
    if (event.type === 'goal') {
      await pool.query(`update matches set ${event.side === 'home' ? 'home_score' : 'away_score'} = greatest(${event.side === 'home' ? 'home_score' : 'away_score'} - 1, 0), updated_at = now() where id = $1`, [row.id]);
      await changed(row.id, req.log);
    }
    notify(row.id).catch(err => req.log.error(err));
    return snapshot(req, await loadMatch(row.id));
  });

  // Rebuild the highlight reel (e.g. after more clips were posted). Scorekeepers only, after full time.
  app.post('/v1/matches/:id/reel', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || !canKeep(row, req.user)) return fail(reply, 404, 'Match not found.');
    if (row.period !== 'ft') return fail(reply, 400, 'Highlights are made at full time.');
    if (row.reel_status === 'building') return reply.code(202).send({ reelStatus: 'building' });
    await hooks.fulltime?.(row.id);
    notify(row.id).catch(() => {});
    return reply.code(202).send({ reelStatus: 'building' });
  });

  // Co-scorekeepers: only the match's creator adds or removes them.
  app.post('/v1/matches/:id/keepers', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || Number(row.created_by) !== req.user.id) return fail(reply, 404, 'Match not found.');
    const handle = String(req.body?.handle || '').trim().toLowerCase().replace(/^@/, '');
    const { rows: [user] } = await pool.query(`select id from users where handle = $1`, [handle]);
    if (!user) return fail(reply, 404, `There's no one called @${handle || '…'} on incha.tv.`);
    if (Number(user.id) === req.user.id) return fail(reply, 400, 'You already run this scoreboard.');
    if ((row.keeper_ids || []).length >= MAX_CO_KEEPERS && !(row.keeper_ids || []).includes(String(user.id))) {
      return fail(reply, 400, `A match can have up to ${MAX_CO_KEEPERS} co-scorekeepers.`);
    }
    await pool.query(`insert into match_keepers (match_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing`, [row.id, user.id, req.user.id]);
    await pool.query(`insert into match_follows (user_id, match_id) values ($1, $2) on conflict do nothing`, [user.id, row.id]);
    return reply.code(201).send(await snapshot(req, await loadMatch(row.id)));
  });

  app.delete('/v1/matches/:id/keepers/:handle', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    const handle = String(req.params.handle).toLowerCase();
    // The creator removes anyone; a co-keeper can step down themselves.
    if (!row || (Number(row.created_by) !== req.user.id && req.user.handle !== handle)) return fail(reply, 404, 'Match not found.');
    await pool.query(`delete from match_keepers k using users u where k.user_id = u.id and k.match_id = $1 and u.handle = $2`, [row.id, handle]);
    return snapshot(req, await loadMatch(row.id));
  });

  // A cheer from anyone watching a live match (no account needed; rate-limited per viewer).
  app.post('/v1/matches/:id/cheer', async (req, reply) => {
    const kind = String(req.body?.kind || '');
    if (!CHEERS.includes(kind)) return fail(reply, 400, 'Unknown cheer.');
    const row = await loadMatch(req.params.id);
    if (!row) return fail(reply, 404, 'Match not found.');
    if (!['1h', 'ht', '2h'].includes(row.period)) return fail(reply, 409, 'Cheers are for live matches.');
    if (!cheerLimiter(`cheer:${row.id}:${req.user?.id ?? req.ip}`)) return fail(reply, 429, 'Easy, ultra. Too many cheers.');
    let pool = cheerPools.get(row.id);
    if (!pool) {
      pool = { counts: {}, from: new Set(), timer: null };
      cheerPools.set(row.id, pool);
      pool.timer = setTimeout(() => {
        cheerPools.delete(row.id);
        send(row.id, 'cheer', { counts: pool.counts, from: [...pool.from] });
      }, 400);
    }
    pool.counts[kind] = (pool.counts[kind] || 0) + 1;
    // The sender's tab id, so it can skip its own cheers (it already launched them).
    const cid = String(req.body?.cid || '').slice(0, 24);
    if (cid) pool.from.add(cid);
    return reply.code(202).send({ ok: true });
  });

  app.get('/v1/matches/:id/stream', async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row) return fail(reply, 404, 'Match not found.');
    reply.hijack();
    reply.raw.writeHead(200, {
      ...reply.getHeaders(),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    });
    const initial = await snapshot({ user: null, protocol: req.protocol, host: req.host }, row);
    reply.raw.write(`retry: 3000\nevent: update\ndata: ${JSON.stringify(initial)}\n\n`);
    const watcher = { raw: reply.raw, req };
    if (!subscribers.has(row.id)) subscribers.set(row.id, new Set());
    subscribers.get(row.id).add(watcher);
    reply.raw.write(`event: crowd\ndata: ${JSON.stringify({ watching: subscribers.get(row.id).size })}\n\n`);
    announceCrowd(row.id);
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 25_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      const set = subscribers.get(row.id);
      set?.delete(watcher);
      if (set && !set.size) subscribers.delete(row.id);
      announceCrowd(row.id);
    });
  });

  // Undo an automatic full time (the match was still going, just quietly). Scorekeepers, for a couple of hours.
  app.post('/v1/matches/:id/resume', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || !canKeep(row, req.user)) return fail(reply, 404, 'Match not found.');
    if (row.period !== 'ft' || !row.auto_ended_from) return fail(reply, 400, 'Only a match that ended automatically can be resumed.');
    const { rows: [ended] } = await pool.query(`
      select id, created_at from match_events where match_id = $1 and type = 'fulltime' and created_by is null
      order by created_at desc limit 1`, [row.id]);
    if (ended && Date.now() - new Date(ended.created_at).getTime() > AUTO_END.undoHours * 3600_000) {
      return fail(reply, 400, 'This match ended too long ago to resume.');
    }
    const { rowCount } = await pool.query(
      `update matches set period = auto_ended_from, auto_ended_from = null, resumed_at = now(), updated_at = now() where id = $1 and period = 'ft' and auto_ended_from is not null`, [row.id]);
    if (!rowCount) return fail(reply, 409, 'The match changed. Try again.');
    if (ended) await pool.query(`delete from match_events where id = $1`, [ended.id]);
    await changed(row.id, req.log);
    notify(row.id).catch(err => req.log.error(err));
    return snapshot(req, await loadMatch(row.id));
  });

  // Calls full time on matches left running after the final whistle (see autoFullTime).
  async function sweepStaleMatches(now = Date.now()) {
    const { rows } = await pool.query(`
      select m.id, m.period, m.period_started_at, m.half_length, m.resumed_at,
        (select max(e.created_at) from match_events e where e.match_id = m.id and e.type = 'halftime') as halftime_at,
        (select max(e.created_at) from match_events e where e.match_id = m.id) as last_activity_at
      from matches m where m.period in ('1h','ht','2h') and m.period_started_at < $1`,
    [new Date(now - AUTO_END.secondHalf.past * 60_000)]);
    const ended = [];
    for (const row of rows) {
      const clock = autoFullTime({ period: row.period, periodStartedAt: row.period_started_at, halfLength: row.half_length,
        halftimeAt: row.halftime_at, lastActivityAt: row.last_activity_at, resumedAt: row.resumed_at }, now);
      if (!clock) continue;
      // Only if nobody touched the match since we looked (a scorekeeper may be pressing Full time right now).
      const { rowCount } = await pool.query(`
        with ended as (update matches set period = 'ft', auto_ended_from = period, updated_at = now() where id = $1 and period = $2 returning id)
        insert into match_events (match_id, type, minute, stoppage) select id, 'fulltime', $3, $4 from ended`,
      [row.id, row.period, clock.minute, clock.stoppage]);
      if (!rowCount) continue;
      const event = { type: 'fulltime', side: null, player: '', minute: clock.minute, stoppage: clock.stoppage };
      ended.push(row.id);
      notify(row.id).catch(err => app.log.error(err));
      const updated = await loadMatch(row.id);
      notifier?.matchEvent(updated, event, null).catch(err => app.log.error(err));
      await Promise.resolve(hooks.fulltime?.(row.id)).catch(err => app.log.error(err));
      await changed(row.id);
    }
    if (ended.length) app.log.info({ matches: ended }, 'called full time on quiet matches');
    return ended;
  }

  let sweeper = null;
  app.addHook('onReady', async () => {
    if (!sweepMs) return;
    const tick = () => sweepStaleMatches().catch(err => app.log.error({ err }, 'match sweep failed'));
    tick();
    sweeper = setInterval(tick, sweepMs);
    sweeper.unref();
  });

  app.addHook('onClose', async () => {
    clearInterval(sweeper);
    for (const timer of crowdTimers.values()) clearTimeout(timer);
    for (const pool of cheerPools.values()) clearTimeout(pool.timer);
    for (const set of subscribers.values()) for (const { raw } of set) raw.end();
    subscribers.clear();
  });

  return { loadMatch, notify, sweepStaleMatches, teamId, MATCH_SELECT };
}

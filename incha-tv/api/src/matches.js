// Match centre: teams, live matches, scorekeeper events, and a Server-Sent Events stream.
import { applyEvent, matchStatus, normalizeMatchInput } from './match.js';
import { createLimiter, randomId, slugify, POST_ID_RE } from './lib.js';

const MATCH_SELECT = `
  select m.*, ht.name as home_name, ht.slug as home_slug, aw.name as away_name, aw.slug as away_slug,
    u.handle as keeper_handle, u.display_name as keeper_name
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
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const eventView = row => ({
  id: Number(row.id), type: row.type, side: row.side, minute: row.minute, stoppage: row.stoppage, player: row.player, createdAt: row.created_at
});

export function registerMatches(app, { pool, fail, requireUser, postView, POST_SELECT }) {
  const matchLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
  const subscribers = new Map(); // matchId -> Set<{ raw, req }>

  async function loadMatch(id) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows } = await pool.query(`${MATCH_SELECT} where m.id = $1`, [id]);
    return rows[0] || null;
  }

  async function teamId(name, userId) {
    const { rows } = await pool.query(
      `insert into teams (slug, name, created_by) values ($1, $2, $3) on conflict (slug) do update set slug = excluded.slug returning id`,
      [slugify(name) || randomId(8).toLowerCase(), name, userId]);
    return rows[0].id;
  }

  async function snapshot(req, row) {
    const [{ rows: events }, { rows: clips }] = await Promise.all([
      pool.query(`select * from match_events where match_id = $1 order by created_at asc`, [row.id]),
      pool.query(`${POST_SELECT} where p.match_id = $2 and p.status = 'published' and p.visibility <> 'private'
        order by p.match_minute asc nulls last, p.published_at asc limit 200`, [req.user?.id ?? null, row.id])
    ]);
    return {
      match: { ...matchRow(row), canScore: Boolean(req.user && Number(row.created_by) === req.user.id) },
      events: events.map(eventView),
      clips: clips.map(clip => postView(req, clip)),
      serverTime: new Date().toISOString()
    };
  }

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

  app.get('/v1/me/matches', { preHandler: requireUser }, async req => {
    const { rows } = await pool.query(`${MATCH_SELECT} where m.created_by = $1 order by m.kickoff_at desc limit 100`, [req.user.id]);
    return { matches: rows.map(matchRow), serverTime: new Date().toISOString() };
  });

  app.post('/v1/matches', { preHandler: requireUser }, async (req, reply) => {
    if (!matchLimiter(`match:${req.user.id}`)) return fail(reply, 429, 'Match limit reached. Try again later.');
    const { values, errors } = normalizeMatchInput(req.body || {});
    if (errors.length) return fail(reply, 400, errors.join(' '));
    const id = randomId(10);
    const [home, away] = [await teamId(values.home, req.user.id), await teamId(values.away, req.user.id)];
    if (home === away) return fail(reply, 400, 'A team can’t play itself.');
    await pool.query(
      `insert into matches (id, home_team_id, away_team_id, half_length, kickoff_at, venue, competition, youth, visibility, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, home, away, values.halfLength, values.kickoffAt, values.venue, values.competition, values.youth, values.visibility, req.user.id]);
    return reply.code(201).send(await snapshot(req, await loadMatch(id)));
  });

  app.get('/v1/matches/:id', async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row) return fail(reply, 404, 'Match not found.');
    return snapshot(req, row);
  });

  app.post('/v1/matches/:id/events', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || Number(row.created_by) !== req.user.id) return fail(reply, 404, 'Match not found.');
    const state = { period: row.period, periodStartedAt: row.period_started_at, halfLength: row.half_length, homeScore: row.home_score, awayScore: row.away_score };
    const { error, event, patch } = applyEvent(state, req.body || {});
    if (error) return fail(reply, 400, error);
    const client = await pool.connect();
    try {
      await client.query('begin');
      // Lock the row so two quick taps can't both apply against the same state.
      const { rows: [locked] } = await client.query(`select period from matches where id = $1 for update`, [row.id]);
      if (locked.period !== row.period) { await client.query('rollback'); return fail(reply, 409, 'The match changed. Try again.'); }
      await client.query(
        `insert into match_events (match_id, type, side, minute, stoppage, player, created_by) values ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, event.type, event.side, event.minute, event.stoppage, event.player, req.user.id]);
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
    return reply.code(201).send(await snapshot(req, await loadMatch(row.id)));
  });

  // Undo a goal, card or note. Period changes are not undoable in v1.
  app.delete('/v1/matches/:id/events/:eventId', { preHandler: requireUser }, async (req, reply) => {
    const row = await loadMatch(req.params.id);
    if (!row || Number(row.created_by) !== req.user.id) return fail(reply, 404, 'Match not found.');
    const { rows: [event] } = await pool.query(`select * from match_events where id = $1 and match_id = $2`, [Number(req.params.eventId) || 0, row.id]);
    if (!event) return fail(reply, 404, 'Event not found.');
    if (!['goal', 'yellow', 'red', 'note'].includes(event.type)) return fail(reply, 400, 'Kick-off and period changes can’t be undone yet.');
    await pool.query(`delete from match_events where id = $1`, [event.id]);
    if (event.type === 'goal') {
      await pool.query(`update matches set ${event.side === 'home' ? 'home_score' : 'away_score'} = greatest(${event.side === 'home' ? 'home_score' : 'away_score'} - 1, 0), updated_at = now() where id = $1`, [row.id]);
    }
    notify(row.id).catch(err => req.log.error(err));
    return snapshot(req, await loadMatch(row.id));
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
    const heartbeat = setInterval(() => reply.raw.write(`: ping\n\n`), 25_000);
    req.raw.on('close', () => {
      clearInterval(heartbeat);
      const set = subscribers.get(row.id);
      set?.delete(watcher);
      if (set && !set.size) subscribers.delete(row.id);
    });
  });

  app.get('/v1/teams/:slug', async (req, reply) => {
    const { rows: [team] } = await pool.query(`select * from teams where slug = $1`, [slugify(req.params.slug)]);
    if (!team) return fail(reply, 404, 'Team not found.');
    const { rows } = await pool.query(
      `${MATCH_SELECT} where (m.home_team_id = $1 or m.away_team_id = $1) and m.visibility = 'public' and not m.youth order by m.kickoff_at desc limit 50`, [team.id]);
    const matches = rows.map(matchRow);
    const record = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    for (const m of matches) {
      if (m.period !== 'ft') continue;
      const home = m.home.slug === team.slug;
      const [gf, ga] = home ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
      record.played++; record.goalsFor += gf; record.goalsAgainst += ga;
      if (gf > ga) record.won++; else if (gf === ga) record.drawn++; else record.lost++;
    }
    return { team: { slug: team.slug, name: team.name }, record, matches, serverTime: new Date().toISOString() };
  });

  app.addHook('onClose', async () => {
    for (const set of subscribers.values()) for (const { raw } of set) raw.end();
    subscribers.clear();
  });

  return { loadMatch, notify };
}

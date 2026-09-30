// Tournament mode: an organizer opens registration, teams sign up with their rosters, and starting the
// tournament draws a single-elimination bracket. Every fixture with two known teams becomes a match that
// the organizer (and any co-scorekeepers they add) runs like any other. At full time the winner moves on;
// draws and forfeits are settled by the organizer.
import { MATCH_SELECT, matchRow } from './matches.js';
import {
  buildBracket, nextSlot, normalizeRoster, normalizeTournamentInput, roundName, shuffle, winnerByScore
} from './bracket.js';
import { POST_ID_RE, createLimiter, randomId, slugify } from './lib.js';

const TOURNAMENT_SELECT = `
  select t.*, u.handle as organizer_handle, u.display_name as organizer_name,
    c.slug as champion_slug, c.name as champion_name,
    (select count(*)::int from tournament_teams tt where tt.tournament_id = t.id) as team_count
  from tournaments t
  join users u on u.id = t.created_by
  left join teams c on c.id = t.champion_team_id`;

const tournamentView = row => ({
  id: row.id,
  name: row.name,
  description: row.description,
  venue: row.venue,
  startsAt: row.starts_at,
  halfLength: row.half_length,
  teamLimit: row.team_limit,
  teamCount: row.team_count ?? 0,
  youth: row.youth,
  visibility: row.visibility,
  status: row.status,
  champion: row.champion_slug ? { slug: row.champion_slug, name: row.champion_name } : null,
  organizer: { handle: row.organizer_handle, displayName: row.organizer_name },
  createdAt: row.created_at
});

class Conflict extends Error {}

export function registerTournaments(app, { pool, fail, requireUser, rosters, isStaff = async () => false, notifyMatch = () => {} }) {
  const createLimiterFor = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const registerLimiter = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });

  async function loadTournament(id, db = pool, lock = false) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows: [row] } = lock
      ? await db.query(`select * from tournaments where id = $1 for update`, [id])
      : await db.query(`${TOURNAMENT_SELECT} where t.id = $1`, [id]);
    return row || null;
  }

  const canOrganize = async (t, user) => Boolean(user) && (Number(t.created_by) === user.id || await isStaff(user));

  async function detail(req, t) {
    const [{ rows: teams }, { rows: fixtures }, { rows: matches }] = await Promise.all([
      pool.query(`
        select tt.seed, tt.created_at, tt.registered_by, tm.id as team_id, tm.slug, tm.name, u.handle as registered_handle,
          (select count(*)::int from team_players p where p.team_id = tm.id and p.removed_at is null) as player_count
        from tournament_teams tt join teams tm on tm.id = tt.team_id left join users u on u.id = tt.registered_by
        where tt.tournament_id = $1 order by tt.seed asc nulls last, tt.created_at asc`, [t.id]),
      pool.query(`
        select f.*, h.slug as home_slug, h.name as home_name, a.slug as away_slug, a.name as away_name, w.slug as winner_slug
        from tournament_fixtures f
        left join teams h on h.id = f.home_team_id left join teams a on a.id = f.away_team_id left join teams w on w.id = f.winner_team_id
        where f.tournament_id = $1 order by f.round, f.position`, [t.id]),
      pool.query(`${MATCH_SELECT} where m.tournament_id = $1`, [t.id])
    ]);
    const canManage = await canOrganize(t, req.user);
    const byMatch = new Map(matches.map(m => [m.id, matchRow(m)]));
    const rounds = fixtures.length ? Math.max(...fixtures.map(f => f.round)) : 0;
    const side = (slug, name) => (slug ? { slug, name } : null);
    return {
      tournament: { ...tournamentView(t), canManage },
      teams: teams.map(row => ({
        slug: row.slug,
        name: row.name,
        seed: row.seed,
        players: row.player_count,
        registeredBy: row.registered_handle,
        canWithdraw: t.status === 'registration' && Boolean(req.user) && (canManage || Number(row.registered_by) === req.user.id)
      })),
      rounds: Array.from({ length: rounds }, (_, i) => ({
        round: i + 1,
        name: roundName(i + 1, rounds),
        fixtures: fixtures.filter(f => f.round === i + 1).map(f => ({
          id: Number(f.id),
          position: f.position,
          home: side(f.home_slug, f.home_name),
          away: side(f.away_slug, f.away_name),
          winner: f.winner_slug,
          decided: f.decided,
          bye: f.bye,
          match: f.match_id ? byMatch.get(f.match_id) ?? null : null
        }))
      })),
      serverTime: new Date().toISOString()
    };
  }

  async function createFixtureMatch(db, t, fixture, rounds) {
    const id = randomId(10);
    const competition = `${t.name} · ${roundName(fixture.round, rounds)}`.slice(0, 80);
    const kickoff = new Date(Math.max(Date.parse(t.starts_at), Date.now()));
    await db.query(`
      insert into matches (id, home_team_id, away_team_id, half_length, kickoff_at, venue, competition, youth, visibility, created_by, tournament_id)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, fixture.home_team_id, fixture.away_team_id, t.half_length, kickoff, t.venue, competition, t.youth, t.visibility, t.created_by, t.id]);
    await db.query(`insert into match_follows (user_id, match_id) values ($1, $2) on conflict do nothing`, [t.created_by, id]);
    await db.query(`update tournament_fixtures set match_id = $2 where id = $1`, [fixture.id, id]);
  }

  // Record (or clear) a fixture's winner and carry it into the next round. Call inside a transaction
  // with the tournament row locked. Throws Conflict when the next round has already moved on.
  async function settle(db, t, fixture, winnerId, decided) {
    const { rows: [{ rounds: lastRound }] } = await db.query(`select max(round) as rounds from tournament_fixtures where tournament_id = $1`, [t.id]);
    const slot = nextSlot(fixture, lastRound);
    let next = null;
    if (slot) {
      ({ rows: [next] } = await db.query(`
        select f.*, m.period from tournament_fixtures f left join matches m on m.id = f.match_id
        where f.tournament_id = $1 and f.round = $2 and f.position = $3 for update of f`, [t.id, slot.round, slot.position]));
      const current = next[`${slot.side}_team_id`];
      const changing = String(current ?? '') !== String(winnerId ?? '');
      if (changing && (next.winner_team_id || (next.period && next.period !== 'pre'))) {
        throw new Conflict(`The ${roundName(slot.round, lastRound).toLowerCase()} match this feeds has already started.`);
      }
    }
    await db.query(`update tournament_fixtures set winner_team_id = $2, decided = $3 where id = $1`, [fixture.id, winnerId, winnerId ? decided : null]);
    if (!slot) {
      await db.query(`update tournaments set champion_team_id = $2, status = $3, updated_at = now() where id = $1`,
        [t.id, winnerId, winnerId ? 'finished' : 'in_progress']);
      return;
    }
    if (t.status === 'finished') await db.query(`update tournaments set champion_team_id = null, status = 'in_progress', updated_at = now() where id = $1`, [t.id]);
    const column = `${slot.side}_team_id`;
    await db.query(`update tournament_fixtures set ${column} = $2 where id = $1`, [next.id, winnerId]);
    next[column] = winnerId;
    if (next.match_id) {
      // Not kicked off yet (checked above): swap the team, or drop the match if the slot is empty again.
      if (winnerId) await db.query(`update matches set ${column} = $2, updated_at = now() where id = $1 and period = 'pre'`, [next.match_id, winnerId]);
      else {
        await db.query(`update tournament_fixtures set match_id = null where id = $1`, [next.id]);
        await db.query(`delete from matches where id = $1 and period = 'pre'`, [next.match_id]);
      }
    } else if (next.home_team_id && next.away_team_id) {
      await createFixtureMatch(db, t, next, lastRound);
    }
  }

  async function inTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const out = await fn(client);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  // hooks.result: a tournament match reached (or left) full time, or its score changed after it.
  async function onResult(matchId) {
    const { rows: [f] } = await pool.query(`
      select f.id, f.tournament_id, f.decided, f.winner_team_id, m.period, m.home_score, m.away_score, m.home_team_id, m.away_team_id
      from tournament_fixtures f join matches m on m.id = f.match_id where f.match_id = $1`, [matchId]);
    if (!f || f.decided === 'organizer') return; // the organizer's call stands until they change it
    const winner = f.period === 'ft'
      ? winnerByScore({ homeScore: f.home_score, awayScore: f.away_score, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id })
      : null;
    if (String(winner ?? '') === String(f.winner_team_id ?? '')) return;
    try {
      await inTransaction(async db => {
        const t = await loadTournament(f.tournament_id, db, true);
        const { rows: [fixture] } = await db.query(`select * from tournament_fixtures where id = $1 for update`, [f.id]);
        await settle(db, t, fixture, winner, 'score');
      });
    } catch (err) {
      if (err instanceof Conflict) { app.log.warn({ matchId, err: err.message }, 'tournament result not carried forward'); return; }
      throw err;
    }
  }

  // ---- browsing ----
  app.get('/v1/tournaments', async req => {
    if (req.query.mine && req.user) {
      const { rows } = await pool.query(`${TOURNAMENT_SELECT}
        where t.created_by = $1 or exists(select 1 from tournament_teams tt where tt.tournament_id = t.id and tt.registered_by = $1)
        order by t.starts_at desc limit 100`, [req.user.id]);
      return { tournaments: rows.map(tournamentView) };
    }
    const { rows } = await pool.query(`${TOURNAMENT_SELECT}
      where t.visibility = 'public' and not t.youth
      order by (t.status = 'finished') asc, t.starts_at desc limit 50`);
    return { tournaments: rows.map(tournamentView) };
  });

  app.get('/v1/tournaments/:id', async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t) return fail(reply, 404, 'Tournament not found.');
    return detail(req, t);
  });

  // ---- organizing ----
  app.post('/v1/tournaments', { preHandler: requireUser }, async (req, reply) => {
    if (!createLimiterFor(`tournament:${req.user.id}`)) return fail(reply, 429, 'Tournament limit reached. Try again later.');
    const { values, errors } = normalizeTournamentInput(req.body || {});
    if (errors.length) return fail(reply, 400, errors.join(' '));
    const id = randomId(10);
    await pool.query(`
      insert into tournaments (id, name, description, venue, starts_at, half_length, team_limit, youth, visibility, created_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [id, values.name, values.description, values.venue, values.startsAt, values.halfLength, values.teamLimit, values.youth, values.visibility, req.user.id]);
    return reply.code(201).send(await detail(req, await loadTournament(id)));
  });

  app.patch('/v1/tournaments/:id', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !(await canOrganize(t, req.user))) return fail(reply, 404, 'Tournament not found.');
    const { values, errors } = normalizeTournamentInput(req.body || {}, { partial: true });
    if (errors.length) return fail(reply, 400, errors.join(' '));
    if ('teamLimit' in values && t.status !== 'registration') return fail(reply, 409, 'The draw is done: the number of teams is set.');
    if ('teamLimit' in values && values.teamLimit < t.team_count) return fail(reply, 400, `${t.team_count} teams have already registered.`);
    if ('halfLength' in values && t.status !== 'registration') return fail(reply, 409, 'The draw is done: change half length on each match instead.');
    if (t.youth) delete values.visibility; // youth tournaments stay unlisted
    const columns = { name: 'name', description: 'description', venue: 'venue', startsAt: 'starts_at', halfLength: 'half_length', teamLimit: 'team_limit', visibility: 'visibility' };
    const keys = Object.keys(values).filter(k => k in columns);
    if (keys.length) {
      await pool.query(`update tournaments set ${keys.map((k, i) => `${columns[k]} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
        [t.id, ...keys.map(k => values[k])]);
    }
    return detail(req, await loadTournament(t.id));
  });

  app.delete('/v1/tournaments/:id', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !(await canOrganize(t, req.user))) return fail(reply, 404, 'Tournament not found.');
    if (t.status !== 'registration') return fail(reply, 409, 'A tournament that has started can’t be deleted.');
    await pool.query(`delete from tournaments where id = $1`, [t.id]);
    return reply.code(204).send();
  });

  // ---- registration ----
  app.post('/v1/tournaments/:id/teams', { preHandler: requireUser }, async (req, reply) => {
    if (!registerLimiter(`register:${req.user.id}`)) return fail(reply, 429, 'Too many registrations. Try again later.');
    const name = String(req.body?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const slug = slugify(name);
    if (!slug) return fail(reply, 400, 'Enter your team’s name.');
    const roster = normalizeRoster(req.body?.players);
    if (roster.error) return fail(reply, 400, roster.error);
    const staff = await isStaff(req.user);
    try {
      const id = await inTransaction(async db => {
        const t = await loadTournament(req.params.id, db, true);
        if (!t) throw Object.assign(new Conflict('Tournament not found.'), { status: 404 });
        if (t.status !== 'registration') throw new Conflict('Registration is closed.');
        const { rows: [{ count }] } = await db.query(`select count(*)::int from tournament_teams where tournament_id = $1`, [t.id]);
        if (count >= t.team_limit) throw new Conflict(`This tournament is full (${t.team_limit} teams).`);
        let { rows: [team] } = await db.query(`select * from teams where slug = $1 for update`, [slug]);
        if (!team) {
          ({ rows: [team] } = await db.query(`insert into teams (slug, name, created_by, youth) values ($1, $2, $3, $4) returning *`, [slug, name, req.user.id, t.youth]));
          await rosters.addManager(team.id, req.user.id, req.user.id, db);
        } else {
          const { rows: list } = await db.query(`select user_id from team_managers where team_id = $1`, [team.id]);
          if (!list.length) await rosters.addManager(team.id, req.user.id, req.user.id, db);
          else if (!staff && !list.some(m => Number(m.user_id) === req.user.id)) {
            throw new Conflict(`${team.name} is managed by someone else. Ask one of its managers to register, or to add you as a manager.`);
          }
          if (t.youth && !team.youth) await db.query(`update teams set youth = true where id = $1`, [team.id]);
        }
        const { rowCount } = await db.query(`
          insert into tournament_teams (tournament_id, team_id, registered_by) values ($1, $2, $3) on conflict do nothing`, [t.id, team.id, req.user.id]);
        if (!rowCount) throw new Conflict(`${team.name} is already registered.`);
        // Add the players the roster doesn't have yet (a returning team keeps its roster).
        const current = await rosters.players(team.id, db);
        const names = new Set(current.map(p => p.name.toLowerCase()));
        const numbers = new Set(current.map(p => p.number).filter(n => n !== null));
        const fresh = roster.players.filter(p => !names.has(p.name.toLowerCase()))
          .map(p => (p.number !== null && numbers.has(p.number) ? { ...p, number: null } : p))
          .slice(0, Math.max(0, 40 - current.length));
        await rosters.addPlayers(team.id, fresh, req.user.id, db);
        return t.id;
      });
      return reply.code(201).send(await detail(req, await loadTournament(id)));
    } catch (err) {
      if (err instanceof Conflict) return fail(reply, err.status || 409, err.message);
      throw err;
    }
  });

  app.delete('/v1/tournaments/:id/teams/:slug', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t) return fail(reply, 404, 'Tournament not found.');
    if (t.status !== 'registration') return fail(reply, 409, 'The draw is done. The organizer can give the other team the win instead.');
    const organizer = await canOrganize(t, req.user);
    const { rowCount } = await pool.query(`
      delete from tournament_teams tt using teams tm
      where tt.team_id = tm.id and tt.tournament_id = $1 and tm.slug = $2 and ($3 or tt.registered_by = $4)`,
    [t.id, slugify(req.params.slug), organizer, req.user.id]);
    if (!rowCount) return fail(reply, 404, 'Team not found in this tournament.');
    return detail(req, await loadTournament(t.id));
  });

  // ---- the draw ----
  app.post('/v1/tournaments/:id/start', { preHandler: requireUser }, async (req, reply) => {
    const found = await loadTournament(req.params.id);
    if (!found || !(await canOrganize(found, req.user))) return fail(reply, 404, 'Tournament not found.');
    const seeding = ['random', 'order'].includes(req.body?.seeding) ? req.body.seeding : 'registration';
    try {
      await inTransaction(async db => {
        const t = await loadTournament(found.id, db, true);
        if (t.status !== 'registration') throw new Conflict('This tournament has already started.');
        const { rows: teams } = await db.query(`
          select tm.id, tm.slug from tournament_teams tt join teams tm on tm.id = tt.team_id
          where tt.tournament_id = $1 order by tt.created_at`, [t.id]);
        if (teams.length < 2) throw new Conflict('At least two teams need to register first.');
        let seeded = teams;
        if (seeding === 'random') seeded = shuffle(teams);
        if (seeding === 'order') {
          const order = Array.isArray(req.body?.order) ? req.body.order.map(s => slugify(s)) : [];
          const bySlug = new Map(teams.map(team => [team.slug, team]));
          if (order.length !== teams.length || new Set(order).size !== order.length || !order.every(s => bySlug.has(s))) {
            throw Object.assign(new Conflict('Seed order must list every registered team once.'), { status: 400 });
          }
          seeded = order.map(s => bySlug.get(s));
        }
        for (const [i, team] of seeded.entries()) {
          await db.query(`update tournament_teams set seed = $3 where tournament_id = $1 and team_id = $2`, [t.id, team.id, i + 1]);
        }
        const { rounds, fixtures } = buildBracket(seeded.map(team => team.id));
        for (const f of fixtures) {
          const { rows: [row] } = await db.query(`
            insert into tournament_fixtures (tournament_id, round, position, home_team_id, away_team_id, bye, winner_team_id, decided)
            values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
          [t.id, f.round, f.position, f.home, f.away, f.bye, f.winner, f.bye ? 'bye' : null]);
          if (row.home_team_id && row.away_team_id && !row.bye) await createFixtureMatch(db, t, row, rounds);
        }
        await db.query(`update tournaments set status = 'in_progress', updated_at = now() where id = $1`, [t.id]);
      });
    } catch (err) {
      if (err instanceof Conflict) return fail(reply, err.status || 409, err.message);
      throw err;
    }
    return detail(req, await loadTournament(found.id));
  });

  // The organizer settles a fixture: a draw (penalties, coin toss), a forfeit, or a correction.
  // { team: slug } sets the winner; { team: null } hands it back to the score.
  app.post('/v1/tournaments/:id/fixtures/:fid/winner', { preHandler: requireUser }, async (req, reply) => {
    const found = await loadTournament(req.params.id);
    if (!found || !(await canOrganize(found, req.user))) return fail(reply, 404, 'Tournament not found.');
    const slug = req.body?.team == null || req.body.team === '' ? null : slugify(req.body.team);
    try {
      await inTransaction(async db => {
        const t = await loadTournament(found.id, db, true);
        const { rows: [fixture] } = await db.query(`
          select f.*, h.slug as home_slug, a.slug as away_slug, m.period, m.home_score, m.away_score
          from tournament_fixtures f left join teams h on h.id = f.home_team_id left join teams a on a.id = f.away_team_id
          left join matches m on m.id = f.match_id
          where f.id = $1 and f.tournament_id = $2 for update of f`, [Number(req.params.fid) || 0, t.id]);
        if (!fixture) throw Object.assign(new Conflict('Fixture not found.'), { status: 404 });
        if (fixture.bye) throw new Conflict('A bye has no match to decide.');
        if (slug === null) {
          const byScore = fixture.period === 'ft'
            ? winnerByScore({ homeScore: fixture.home_score, awayScore: fixture.away_score, homeTeamId: fixture.home_team_id, awayTeamId: fixture.away_team_id })
            : null;
          await settle(db, t, fixture, byScore, 'score');
          return;
        }
        const winner = slug === fixture.home_slug ? fixture.home_team_id : slug === fixture.away_slug ? fixture.away_team_id : null;
        if (!winner) throw Object.assign(new Conflict('Pick one of the two teams in this match.'), { status: 400 });
        await settle(db, t, fixture, winner, 'organizer');
      });
    } catch (err) {
      if (err instanceof Conflict) return fail(reply, err.status || 409, err.message);
      throw err;
    }
    const { rows: [f] } = await pool.query(`select match_id from tournament_fixtures where id = $1`, [Number(req.params.fid)]);
    if (f?.match_id) notifyMatch(f.match_id);
    return detail(req, await loadTournament(found.id));
  });

  return { onResult };
}

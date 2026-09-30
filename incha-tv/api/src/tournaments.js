// Tournaments: an organizer opens registration, managers enter their teams, the organizer approves them
// and starts a single-elimination bracket. Each tie becomes an ordinary match; full time moves the winner on.
import { buildBracket, matchWinner, nextSlot, roundName, MAX_TEAMS, MIN_TEAMS } from './bracket.js';
import { matchRow } from './matches.js';
import { createLimiter, randomId, slugify, POST_ID_RE } from './lib.js';

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** Validates the organizer's form. `partial` accepts a subset of fields (for edits). */
export function normalizeTournamentInput(body = {}, partial = false) {
  const errors = [];
  const values = {};
  const has = key => !partial || body[key] !== undefined;
  if (has('name')) {
    values.name = clean(body.name, 80);
    if (!values.name) errors.push('Give the tournament a name.');
  }
  if (has('description')) values.description = String(body.description ?? '').trim().slice(0, 2000);
  if (has('capacity')) {
    values.capacity = body.capacity === undefined || body.capacity === '' ? 8 : Number(body.capacity);
    if (!Number.isInteger(values.capacity) || values.capacity < MIN_TEAMS || values.capacity > MAX_TEAMS) errors.push(`Capacity must be ${MIN_TEAMS}–${MAX_TEAMS} teams.`);
  }
  if (has('approval')) values.approval = body.approval === 'auto' ? 'auto' : 'manual';
  if (has('halfLength')) {
    values.halfLength = body.halfLength === undefined || body.halfLength === '' ? 20 : Number(body.halfLength);
    if (!Number.isInteger(values.halfLength) || values.halfLength < 5 || values.halfLength > 60) errors.push('Half length must be 5–60 minutes.');
  }
  if (has('venue')) values.venue = clean(body.venue, 120);
  if (has('startsAt')) {
    values.startsAt = body.startsAt ? new Date(body.startsAt) : new Date();
    if (Number.isNaN(values.startsAt.getTime())) errors.push('Start date is not a valid date.');
  }
  if (!partial) {
    values.youth = Boolean(body.youth);
    values.visibility = values.youth ? 'unlisted' : body.visibility === 'unlisted' ? 'unlisted' : 'public';
  }
  return { errors, values };
}

const SIDE_COLUMN = { home: 'home_team_id', away: 'away_team_id' };

export function registerTournaments(app, { pool, fail, requireUser, MATCH_SELECT, teams, teamId }) {
  const createLimit = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
  const registerLimit = createLimiter({ windowMs: 60 * 60 * 1000, max: 30 });

  async function loadTournament(id, db = pool, lock = false) {
    if (!POST_ID_RE.test(String(id))) return null;
    const { rows: [t] } = await db.query(`select * from tournaments where id = $1${lock ? ' for update' : ''}`, [id]);
    return t || null;
  }
  const isOrganizer = (t, user) => Boolean(user && Number(t.created_by) === user.id);

  async function tx(fn) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  // ---- the bracket engine ----

  async function createSlotMatch(db, t, slot) {
    const id = randomId(10);
    const competition = `${t.name} · ${roundName(slot.round, t.rounds)}`.slice(0, 80);
    await db.query(
      `insert into matches (id, home_team_id, away_team_id, half_length, kickoff_at, venue, competition, youth, visibility, created_by)
       values ($1, $2, $3, $4, greatest($5::timestamptz, now()), $6, $7, $8, $9, $10)`,
      [id, slot.home_team_id, slot.away_team_id, t.half_length, t.starts_at, t.venue, competition, t.youth, t.visibility, t.created_by]);
    await db.query(`insert into match_follows (user_id, match_id) values ($1, $2) on conflict do nothing`, [t.created_by, id]);
    await db.query(`update bracket_slots set match_id = $2 where id = $1`, [slot.id, id]);
    return id;
  }

  /**
   * Records (or clears) a tie's winner and moves them into the next round. A result can still change
   * (a goal undone, a match resumed) until the next tie kicks off; after that the bracket holds.
   * Returns false when the next tie has already started.
   */
  async function setWinner(db, t, slot, winnerTeamId, decided, note = '') {
    if (String(slot.winner_team_id ?? '') === String(winnerTeamId ?? '') && slot.decided === decided) return true;
    const final = slot.round === t.rounds;
    let next = null;
    if (!final) {
      const to = nextSlot(slot.round, slot.slot);
      ({ rows: [next] } = await db.query(`select * from bracket_slots where tournament_id = $1 and round = $2 and slot = $3 for update`, [t.id, to.round, to.slot]));
      const { rows: [nextMatch] } = next.match_id ? await db.query(`select period from matches where id = $1`, [next.match_id]) : { rows: [] };
      if (next.winner_team_id || (nextMatch && nextMatch.period !== 'pre')) return false;
      next.side = to.side;
      next.period = nextMatch?.period;
    }
    await db.query(`update bracket_slots set winner_team_id = $2, decided = $3, note = $4 where id = $1`,
      [slot.id, winnerTeamId, winnerTeamId ? decided : null, winnerTeamId ? note : '']);
    if (final) {
      await db.query(`update tournaments set status = $2, champion_team_id = $3, updated_at = now() where id = $1`,
        [t.id, winnerTeamId ? 'finished' : 'running', winnerTeamId]);
      return true;
    }
    await db.query(`update bracket_slots set ${SIDE_COLUMN[next.side]} = $2 where id = $1`, [next.id, winnerTeamId]);
    next[SIDE_COLUMN[next.side]] = winnerTeamId;
    if (next.match_id) {
      // The next tie hasn't kicked off: swap the team in, or take the fixture down until both sides are known.
      if (winnerTeamId) await db.query(`update matches set ${SIDE_COLUMN[next.side]} = $2, updated_at = now() where id = $1`, [next.match_id, winnerTeamId]);
      else await db.query(`delete from matches where id = $1 and period = 'pre'`, [next.match_id]);
    } else if (next.home_team_id && next.away_team_id) {
      await createSlotMatch(db, t, next);
    }
    return true;
  }

  /** Called whenever a match's score or period changes. Does nothing for matches outside a bracket. */
  async function settle(matchId) {
    const { rows: [link] } = await pool.query(`select tournament_id from bracket_slots where match_id = $1`, [matchId]);
    if (!link) return;
    await tx(async db => {
      const t = await loadTournament(link.tournament_id, db, true);
      const { rows: [slot] } = await db.query(`select * from bracket_slots where match_id = $1 for update`, [matchId]);
      const { rows: [m] } = await db.query(`select * from matches where id = $1`, [matchId]);
      if (!t || !slot || !m) return;
      const side = matchWinner({ period: m.period, homeScore: m.home_score, awayScore: m.away_score });
      if (side) return setWinner(db, t, slot, side === 'home' ? slot.home_team_id : slot.away_team_id, 'score');
      // A draw at full time waits for the organizer (penalties); their call stands while it's still a draw.
      if (m.period === 'ft' && slot.decided === 'penalties') return;
      return setWinner(db, t, slot, null, null);
    });
  }

  // ---- views ----

  const teamView = row => (row ? { slug: row.slug, name: row.name } : null);

  async function view(req, t) {
    const organizer = isOrganizer(t, req.user);
    const [{ rows: [owner] }, { rows: entries }, { rows: slots }, { rows: [champion] }, { rows: mine }] = await Promise.all([
      pool.query(`select handle, display_name from users where id = $1`, [t.created_by]),
      pool.query(`
        select tt.*, tm.slug, tm.name, (select count(*)::int from team_players p where p.team_id = tm.id) as players
        from tournament_teams tt join teams tm on tm.id = tt.team_id where tt.tournament_id = $1
        order by tt.seed asc nulls last, tt.created_at asc`, [t.id]),
      pool.query(`
        select b.*, h.slug as home_slug, h.name as home_name, a.slug as away_slug, a.name as away_name
        from bracket_slots b left join teams h on h.id = b.home_team_id left join teams a on a.id = b.away_team_id
        where b.tournament_id = $1 order by b.round, b.slot`, [t.id]),
      t.champion_team_id ? pool.query(`select slug, name from teams where id = $1`, [t.champion_team_id]) : Promise.resolve({ rows: [] }),
      req.user
        ? pool.query(`select t.id from teams t where t.created_by = $1 or exists(select 1 from team_managers m where m.team_id = t.id and m.user_id = $1)`, [req.user.id])
        : Promise.resolve({ rows: [] })
    ]);
    const myTeamIds = new Set(mine.map(r => String(r.id)));
    const matchIds = slots.map(s => s.match_id).filter(Boolean);
    const { rows: matchRows } = matchIds.length ? await pool.query(`${MATCH_SELECT} where m.id = any($1)`, [matchIds]) : { rows: [] };
    const matches = new Map(matchRows.map(r => [r.id, matchRow(r)]));

    const bracket = t.rounds ? Array.from({ length: t.rounds }, (_, i) => ({ round: i + 1, name: roundName(i + 1, t.rounds), slots: [] })) : null;
    for (const s of slots) {
      const match = s.match_id ? matches.get(s.match_id) ?? null : null;
      const winner = !s.winner_team_id ? null : String(s.winner_team_id) === String(s.home_team_id) ? 'home' : 'away';
      bracket[s.round - 1].slots.push({
        id: Number(s.id), slot: s.slot,
        home: s.home_team_id ? teamView({ slug: s.home_slug, name: s.home_name }) : null,
        away: s.away_team_id ? teamView({ slug: s.away_slug, name: s.away_name }) : null,
        winner, bye: s.bye, decided: s.decided, note: s.note, match,
        awaitingDecision: Boolean(match && match.period === 'ft' && match.homeScore === match.awayScore && !winner)
      });
    }
    // The public sees who's in; organizers (and each team's own managers) also see pending and turned-down entries.
    const teams = entries
      .filter(e => e.status === 'approved' || organizer || myTeamIds.has(String(e.team_id)))
      .map(e => ({
        slug: e.slug, name: e.name, status: e.status, seed: e.seed, players: e.players,
        mine: myTeamIds.has(String(e.team_id)),
        ...(organizer || myTeamIds.has(String(e.team_id)) ? { note: e.note } : {})
      }));
    return {
      tournament: {
        id: t.id, name: t.name, description: t.description, status: t.status, capacity: t.capacity, approval: t.approval,
        halfLength: t.half_length, venue: t.venue, startsAt: t.starts_at, youth: t.youth, visibility: t.visibility,
        organizer: owner ? { handle: owner.handle, displayName: owner.display_name } : null,
        champion: teamView(champion),
        isOrganizer: organizer,
        counts: { approved: entries.filter(e => e.status === 'approved').length, pending: entries.filter(e => e.status === 'pending').length },
        createdAt: t.created_at
      },
      teams,
      bracket,
      serverTime: new Date().toISOString()
    };
  }

  const cardSelect = `
    select t.*, u.handle, u.display_name, c.slug as champion_slug, c.name as champion_name,
      (select count(*)::int from tournament_teams tt where tt.tournament_id = t.id and tt.status = 'approved') as approved
    from tournaments t join users u on u.id = t.created_by left join teams c on c.id = t.champion_team_id`;
  const cardView = r => ({
    id: r.id, name: r.name, status: r.status, capacity: r.capacity, approved: r.approved, venue: r.venue, startsAt: r.starts_at,
    youth: r.youth, organizer: { handle: r.handle, displayName: r.display_name }, champion: r.champion_slug ? { slug: r.champion_slug, name: r.champion_name } : null
  });

  // ---- routes ----

  app.get('/v1/tournaments', async (req, reply) => {
    const filter = ['open', 'running', 'finished', 'mine'].includes(req.query.filter) ? req.query.filter : 'open';
    if (filter === 'mine') {
      if (!req.user) return fail(reply, 401, 'Sign in to continue.');
      const { rows } = await pool.query(`${cardSelect}
        where t.created_by = $1 or exists(
          select 1 from tournament_teams tt join teams tm on tm.id = tt.team_id where tt.tournament_id = t.id
            and (tm.created_by = $1 or exists(select 1 from team_managers m where m.team_id = tm.id and m.user_id = $1)))
        order by t.starts_at desc limit 50`, [req.user.id]);
      return { tournaments: rows.map(cardView) };
    }
    const status = { open: 'registration', running: 'running', finished: 'finished' }[filter];
    const { rows } = await pool.query(`${cardSelect} where t.status = $1 and t.visibility = 'public' and not t.youth
      order by t.starts_at ${filter === 'finished' ? 'desc' : 'asc'} limit 50`, [status]);
    return { tournaments: rows.map(cardView) };
  });

  app.post('/v1/tournaments', { preHandler: requireUser }, async (req, reply) => {
    if (!createLimit(`tournament:${req.user.id}`)) return fail(reply, 429, 'Tournament limit reached. Try again later.');
    const { errors, values } = normalizeTournamentInput(req.body || {});
    if (errors.length) return fail(reply, 400, errors.join(' '));
    const id = randomId(10);
    await pool.query(
      `insert into tournaments (id, name, description, capacity, approval, half_length, venue, starts_at, youth, visibility, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, values.name, values.description, values.capacity, values.approval, values.halfLength, values.venue, values.startsAt, values.youth, values.visibility, req.user.id]);
    return reply.code(201).send(await view(req, await loadTournament(id)));
  });

  app.get('/v1/tournaments/:id', async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t) return fail(reply, 404, 'Tournament not found.');
    return view(req, t);
  });

  app.patch('/v1/tournaments/:id', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !isOrganizer(t, req.user)) return fail(reply, 404, 'Tournament not found.');
    const { errors, values } = normalizeTournamentInput(req.body || {}, true);
    if (errors.length) return fail(reply, 400, errors.join(' '));
    if (t.status !== 'registration') {
      // Once the bracket exists its shape is fixed; the words around it can still change.
      for (const key of ['capacity', 'approval', 'halfLength']) if (key in values) return fail(reply, 400, 'The bracket has started; only the name, description, venue and date can change.');
    }
    if ('capacity' in values) {
      const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from tournament_teams where tournament_id = $1 and status = 'approved'`, [t.id]);
      if (values.capacity < n) return fail(reply, 400, `${n} teams are already in. Capacity can’t go below that.`);
    }
    const columns = { name: 'name', description: 'description', capacity: 'capacity', approval: 'approval', halfLength: 'half_length', venue: 'venue', startsAt: 'starts_at' };
    const keys = Object.keys(values);
    if (keys.length) {
      await pool.query(`update tournaments set ${keys.map((k, i) => `${columns[k]} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
        [t.id, ...keys.map(k => values[k])]);
    }
    return view(req, await loadTournament(t.id));
  });

  // Enter a team: one you run, or a brand-new one (you become its owner).
  app.post('/v1/tournaments/:id/teams', { preHandler: requireUser }, async (req, reply) => {
    if (!registerLimit(`register:${req.user.id}`)) return fail(reply, 429, 'Too many registrations. Try again later.');
    const t = await loadTournament(req.params.id);
    if (!t) return fail(reply, 404, 'Tournament not found.');
    if (t.status !== 'registration') return fail(reply, 400, 'Registration is closed.');
    const name = clean(req.body?.name, 60);
    if (!name || !slugify(name)) return fail(reply, 400, 'Enter your team’s name.');
    const note = String(req.body?.note ?? '').trim().slice(0, 280);
    const existing = await teams.loadTeam(slugify(name));
    if (existing && !(await teams.canManage(existing, req.user))) {
      return fail(reply, 403, `${existing.name} is already on incha.tv. Ask one of its managers to enter it, or pick a different name.`);
    }
    const id = existing ? existing.id : await teamId(name, req.user.id, t.youth);
    if (existing && t.youth) await pool.query(`update teams set youth = true where id = $1`, [id]);
    const result = await tx(async db => {
      await loadTournament(t.id, db, true);
      const { rows: counts } = await db.query(`select status, count(*)::int as n from tournament_teams where tournament_id = $1 group by status`, [t.id]);
      const count = s => counts.find(c => c.status === s)?.n ?? 0;
      if (t.approval === 'auto' && count('approved') >= t.capacity) return { error: [400, 'The tournament is full.'] };
      if (count('pending') >= t.capacity * 2) return { error: [400, 'Too many teams are waiting for approval. Try again later.'] };
      const { rowCount } = await db.query(
        `insert into tournament_teams (tournament_id, team_id, status, note, registered_by) values ($1, $2, $3, $4, $5) on conflict do nothing`,
        [t.id, id, t.approval === 'auto' ? 'approved' : 'pending', note, req.user.id]);
      if (!rowCount) return { error: [409, 'That team is already entered.'] };
      return {};
    });
    if (result.error) return fail(reply, ...result.error);
    return reply.code(201).send(await view(req, t));
  });

  // The organizer approves or turns down an entry while registration is open.
  app.patch('/v1/tournaments/:id/teams/:slug', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !isOrganizer(t, req.user)) return fail(reply, 404, 'Tournament not found.');
    if (t.status !== 'registration') return fail(reply, 400, 'Registration is closed.');
    const status = req.body?.status;
    if (!['approved', 'rejected', 'pending'].includes(status)) return fail(reply, 400, 'Status must be approved, rejected or pending.');
    const result = await tx(async db => {
      await loadTournament(t.id, db, true);
      if (status === 'approved') {
        const { rows: [{ n }] } = await db.query(`select count(*)::int as n from tournament_teams where tournament_id = $1 and status = 'approved'`, [t.id]);
        if (n >= t.capacity) return { error: [400, `The tournament is full (${t.capacity} teams).`] };
      }
      const { rowCount } = await db.query(
        `update tournament_teams tt set status = $3 from teams tm where tm.id = tt.team_id and tt.tournament_id = $1 and tm.slug = $2`, [t.id, slugify(req.params.slug), status]);
      return rowCount ? {} : { error: [404, 'That team isn’t entered.'] };
    });
    if (result.error) return fail(reply, ...result.error);
    return view(req, t);
  });

  // A team's manager withdraws it, or the organizer removes it, before the bracket is drawn.
  app.delete('/v1/tournaments/:id/teams/:slug', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t) return fail(reply, 404, 'Tournament not found.');
    const team = await teams.loadTeam(req.params.slug);
    if (!team || !(isOrganizer(t, req.user) || (await teams.canManage(team, req.user)))) return fail(reply, 404, 'That team isn’t entered.');
    if (t.status !== 'registration') return fail(reply, 400, 'The bracket has been drawn. Ask the organizer to settle it as a walkover.');
    await pool.query(`delete from tournament_teams where tournament_id = $1 and team_id = $2`, [t.id, team.id]);
    return view(req, t);
  });

  // Close registration and draw the bracket: seeded in the order teams entered, or shuffled.
  app.post('/v1/tournaments/:id/start', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !isOrganizer(t, req.user)) return fail(reply, 404, 'Tournament not found.');
    const result = await tx(async db => {
      const locked = await loadTournament(t.id, db, true);
      if (locked.status !== 'registration') return { error: [409, 'The bracket has already been drawn.'] };
      const { rows: entries } = await db.query(
        `select team_id from tournament_teams where tournament_id = $1 and status = 'approved' order by created_at asc, team_id asc`, [t.id]);
      if (entries.length < MIN_TEAMS) return { error: [400, `Approve at least ${MIN_TEAMS} teams first.`] };
      const order = entries.map(e => e.team_id);
      if (req.body?.shuffle) {
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }
      for (const [i, teamId] of order.entries()) await db.query(`update tournament_teams set seed = $3 where tournament_id = $1 and team_id = $2`, [t.id, teamId, i + 1]);
      const { rounds, slots } = buildBracket(order);
      await db.query(`update tournaments set status = 'running', rounds = $2, updated_at = now() where id = $1`, [t.id, rounds]);
      for (const s of slots) {
        await db.query(
          `insert into bracket_slots (tournament_id, round, slot, home_team_id, away_team_id, winner_team_id, bye, decided) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [t.id, s.round, s.slot, s.home, s.away, s.winner, s.bye, s.bye ? 'bye' : null]);
      }
      // Every tie whose two teams are known becomes a match now; the rest appear as results come in.
      const fresh = await loadTournament(t.id, db);
      const { rows: ready } = await db.query(
        `select * from bracket_slots where tournament_id = $1 and home_team_id is not null and away_team_id is not null and winner_team_id is null`, [t.id]);
      for (const slot of ready) await createSlotMatch(db, fresh, slot);
      return {};
    });
    if (result.error) return fail(reply, ...result.error);
    return view(req, await loadTournament(t.id));
  });

  // The organizer settles a tie the score can't: a draw (penalties) or a match that won't be played (walkover).
  app.post('/v1/tournaments/:id/slots/:slotId/winner', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !isOrganizer(t, req.user)) return fail(reply, 404, 'Tournament not found.');
    const side = req.body?.side;
    if (side !== 'home' && side !== 'away') return fail(reply, 400, 'Pick the winning side.');
    const note = clean(req.body?.note, 80);
    const result = await tx(async db => {
      const locked = await loadTournament(t.id, db, true);
      const { rows: [slot] } = await db.query(`select * from bracket_slots where id = $1 and tournament_id = $2 for update`, [Number(req.params.slotId) || 0, t.id]);
      if (!slot) return { error: [404, 'Tie not found.'] };
      if (!slot.home_team_id || !slot.away_team_id) return { error: [400, 'Both teams need to be known first.'] };
      const { rows: [m] } = slot.match_id ? await db.query(`select period, home_score, away_score from matches where id = $1`, [slot.match_id]) : { rows: [] };
      let decided;
      if (!m || m.period === 'pre') decided = 'walkover';
      else if (m.period === 'ft' && m.home_score === m.away_score) decided = 'penalties';
      else return { error: [400, m.period === 'ft' ? 'The score already decided this tie.' : 'The match is still being played.'] };
      if (!(await setWinner(db, locked, slot, slot[SIDE_COLUMN[side]], decided, note))) return { error: [409, 'The next round has already kicked off.'] };
      // A walkover's fixture is never played.
      if (decided === 'walkover' && m) {
        await db.query(`update bracket_slots set match_id = null where id = $1`, [slot.id]);
        await db.query(`delete from matches where id = $1 and period = 'pre'`, [slot.match_id]);
      }
      return {};
    });
    if (result.error) return fail(reply, ...result.error);
    return view(req, await loadTournament(t.id));
  });

  return { settle, loadTournament };
}

// Tournaments: an organizer opens registration, managers enter their teams, the organizer approves them
// and starts a single-elimination bracket. Each tie becomes an ordinary match; full time moves the winner on.
import { buildBracket, matchWinner, nextSlot, roundName, MAX_TEAMS, MIN_TEAMS } from './bracket.js';
import { matchRow } from './matches.js';
import { createLimiter, randomId, slugify, POST_ID_RE } from './lib.js';

export const MAX_ENTRY_FEE_CENTS = 100_000;
// Entries that owe a fee: unpaid (nothing started), pending (checkout opened). Settled: paid or waived.
const SETTLED = ['paid', 'waived'];

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
  if (has('entryFee') && body.entryFee !== undefined) {
    // Dollars in ("25", 25, "12.50"), cents stored.
    const cents = body.entryFee === '' || body.entryFee === null ? 0 : Math.round(Number(body.entryFee) * 100);
    if (!Number.isInteger(cents) || cents < 0 || cents > MAX_ENTRY_FEE_CENTS) errors.push(`Entry fee must be $0–${MAX_ENTRY_FEE_CENTS / 100}.`);
    else values.entryFeeCents = cents;
  }
  if (!partial) {
    values.youth = Boolean(body.youth);
    values.visibility = values.youth ? 'unlisted' : body.visibility === 'unlisted' ? 'unlisted' : 'public';
  }
  return { errors, values };
}

const SIDE_COLUMN = { home: 'home_team_id', away: 'away_team_id' };

export function registerTournaments(app, { pool, fail, requireUser, MATCH_SELECT, teams, teamId, roleOf = async () => 'user', payments = null, siteUrl = '' }) {
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
      .map(e => {
        const insider = organizer || myTeamIds.has(String(e.team_id));
        return {
          slug: e.slug, name: e.name, status: e.status, seed: e.seed, players: e.players,
          mine: myTeamIds.has(String(e.team_id)),
          ...(insider ? {
            note: e.note,
            // Payment state is between the team and the organizer.
            payment: e.payment_status === 'none' ? null : {
              status: e.payment_status, amountCents: e.amount_cents, orderName: e.order_name, paidAt: e.paid_at, note: e.payment_note
            }
          } : {})
        };
      });
    return {
      tournament: {
        id: t.id, name: t.name, description: t.description, status: t.status, capacity: t.capacity, approval: t.approval,
        halfLength: t.half_length, venue: t.venue, startsAt: t.starts_at, youth: t.youth, visibility: t.visibility,
        organizer: owner ? { handle: owner.handle, displayName: owner.display_name } : null,
        champion: teamView(champion),
        isOrganizer: organizer,
        counts: { approved: entries.filter(e => e.status === 'approved').length, pending: entries.filter(e => e.status === 'pending').length },
        entryFeeCents: t.entry_fee_cents,
        currency: t.currency,
        // Whether "Pay now" can send teams to Shopify; otherwise the organizer records payments by hand.
        payOnline: Boolean(t.entry_fee_cents > 0 && payments?.configured),
        ...(organizer ? { collectedCents: entries.filter(e => e.payment_status === 'paid').reduce((sum, e) => sum + (e.amount_cents || 0), 0) } : {}),
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
    youth: r.youth, entryFeeCents: r.entry_fee_cents, currency: r.currency, organizer: { handle: r.handle, displayName: r.display_name }, champion: r.champion_slug ? { slug: r.champion_slug, name: r.champion_name } : null
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
    // Fees are paid into incha's own Shopify store, so only incha admins can charge them.
    if (values.entryFeeCents && (await roleOf(req.user)) !== 'admin') return fail(reply, 403, 'Only incha staff can charge an entry fee.');
    const id = randomId(10);
    await pool.query(
      `insert into tournaments (id, name, description, capacity, approval, half_length, venue, starts_at, youth, visibility, entry_fee_cents, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, values.name, values.description, values.capacity, values.approval, values.halfLength, values.venue, values.startsAt, values.youth, values.visibility, values.entryFeeCents ?? 0, req.user.id]);
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
      for (const key of ['capacity', 'approval', 'halfLength', 'entryFeeCents']) if (key in values) return fail(reply, 400, 'The bracket has started; only the name, description, venue and date can change.');
    }
    if ('entryFeeCents' in values && values.entryFeeCents !== t.entry_fee_cents) {
      if (values.entryFeeCents && (await roleOf(req.user)) !== 'admin') return fail(reply, 403, 'Only incha staff can charge an entry fee.');
      const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from tournament_teams where tournament_id = $1 and payment_status in ('pending','paid')`, [t.id]);
      if (n) return fail(reply, 400, 'Teams have already started paying. The fee can’t change now.');
    }
    if ('capacity' in values) {
      const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from tournament_teams where tournament_id = $1 and status = 'approved'`, [t.id]);
      if (values.capacity < n) return fail(reply, 400, `${n} teams are already in. Capacity can’t go below that.`);
    }
    const columns = { name: 'name', description: 'description', capacity: 'capacity', approval: 'approval', halfLength: 'half_length', venue: 'venue', startsAt: 'starts_at', entryFeeCents: 'entry_fee_cents' };
    const keys = Object.keys(values);
    if (keys.length) {
      await pool.query(`update tournaments set ${keys.map((k, i) => `${columns[k]} = $${i + 2}`).join(', ')}, updated_at = now() where id = $1`,
        [t.id, ...keys.map(k => values[k])]);
      // Entries still owing follow the new fee (or stop owing when it's dropped).
      if ('entryFeeCents' in values) {
        await pool.query(`
          update tournament_teams set
            payment_status = case when $2::int > 0 then 'unpaid' else 'none' end,
            amount_cents = nullif($2::int, 0), checkout_url = null, checkout_at = null,
            payment_ref = case when $2::int > 0 then coalesce(payment_ref, md5(random()::text || clock_timestamp()::text)) else null end
          where tournament_id = $1 and payment_status in ('none','unpaid')`, [t.id, values.entryFeeCents]);
      }
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
      // With a fee, nobody is in until they've paid: auto-approval happens when the payment lands.
      const fee = t.entry_fee_cents > 0;
      const { rowCount } = await db.query(
        `insert into tournament_teams (tournament_id, team_id, status, note, registered_by, payment_status, payment_ref, amount_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict do nothing`,
        [t.id, id, t.approval === 'auto' && !fee ? 'approved' : 'pending', note, req.user.id,
          fee ? 'unpaid' : 'none', fee ? randomId(16) : null, fee ? t.entry_fee_cents : null]);
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
        const { rows: [entry] } = await db.query(
          `select tt.payment_status from tournament_teams tt join teams tm on tm.id = tt.team_id where tt.tournament_id = $1 and tm.slug = $2`, [t.id, slugify(req.params.slug)]);
        if (entry && entry.payment_status !== 'none' && !SETTLED.includes(entry.payment_status)) {
          return { error: [400, 'This team hasn’t paid the entry fee yet. Mark it paid or waived first.'] };
        }
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
    // A paid entry keeps its record: the organizer declines it and refunds it in Shopify instead.
    const { rows: [entry] } = await pool.query(`select payment_status from tournament_teams where tournament_id = $1 and team_id = $2`, [t.id, team.id]);
    if (entry?.payment_status === 'paid' || entry?.payment_status === 'pending') {
      return fail(reply, 400, isOrganizer(t, req.user)
        ? 'This team has paid (or is paying). Decline it instead, and refund it in Shopify.'
        : 'Your entry fee is paid or in progress. Ask the organizer to take you out and refund you.');
    }
    await pool.query(`delete from tournament_teams where tournament_id = $1 and team_id = $2`, [t.id, team.id]);
    return view(req, t);
  });

  // ---- entry fees ----

  /** Marks an entry paid (from the webhook or the organizer) and lets it in if sign-ups are first come, first in. */
  async function settlePayment(db, t, entry, fields) {
    await db.query(`
      update tournament_teams set payment_status = $3, paid_at = coalesce(paid_at, now()), order_id = coalesce($4, order_id),
        order_name = coalesce($5, order_name), payment_note = coalesce($6, payment_note)
      where tournament_id = $1 and team_id = $2`,
    [t.id, entry.team_id, fields.status, fields.orderId ?? null, fields.orderName ?? null, fields.note ?? null]);
    if (t.approval === 'auto' && t.status === 'registration' && entry.status === 'pending') {
      const { rows: [{ n }] } = await db.query(`select count(*)::int as n from tournament_teams where tournament_id = $1 and status = 'approved'`, [t.id]);
      // Full by the time the money arrived: stays pending so the organizer sees it and can refund.
      if (n < t.capacity) await db.query(`update tournament_teams set status = 'approved' where tournament_id = $1 and team_id = $2`, [t.id, entry.team_id]);
    }
  }

  const entryFor = (db, t, slug, lock = false) => db.query(`
    select tt.*, tm.slug, tm.name from tournament_teams tt join teams tm on tm.id = tt.team_id
    where tt.tournament_id = $1 and tm.slug = $2${lock ? ' for update of tt' : ''}`, [t.id, slugify(String(slug))]).then(r => r.rows[0] || null);

  // A team's manager starts (or resumes) paying the entry fee: returns the Shopify checkout to send them to.
  app.post('/v1/tournaments/:id/teams/:slug/checkout', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    const team = t && (await teams.loadTeam(req.params.slug));
    if (!t || !team || !(await teams.canManage(team, req.user))) return fail(reply, 404, 'That team isn’t entered.');
    const entry = await entryFor(pool, t, team.slug);
    if (!entry) return fail(reply, 404, 'That team isn’t entered.');
    if (t.status !== 'registration') return fail(reply, 400, 'Registration is closed.');
    if (entry.payment_status === 'none') return fail(reply, 400, 'There’s no entry fee to pay.');
    if (SETTLED.includes(entry.payment_status)) return fail(reply, 409, 'Your entry fee is already settled.');
    if (entry.status === 'rejected') return fail(reply, 400, 'The organizer declined this entry.');
    if (!payments?.configured) return fail(reply, 503, 'Online payment isn’t set up yet. The organizer can take the fee another way and mark you paid.');
    // Reuse a recent checkout so a double tap doesn't create two orders.
    if (entry.checkout_url && entry.checkout_at && Date.now() - new Date(entry.checkout_at).getTime() < 24 * 3600_000) {
      return { url: entry.checkout_url, reused: true };
    }
    const { rows: [me] } = await pool.query(`select email from users where id = $1`, [req.user.id]);
    let checkout;
    try {
      checkout = await payments.createCheckout({
        reference: entry.payment_ref,
        title: `${t.name} · entry for ${team.name}`,
        amountCents: entry.amount_cents ?? t.entry_fee_cents,
        currency: t.currency,
        email: me?.email,
        note: `incha.tv tournament entry\n${siteUrl}/tournaments/${t.id}\nTeam: ${team.name} (${team.slug})\nEntered by @${req.user.handle}`
      });
    } catch (err) {
      req.log.error({ err }, 'shopify checkout failed');
      return fail(reply, err.statusCode || 502, err.message);
    }
    await pool.query(`update tournament_teams set payment_status = 'pending', checkout_url = $3, checkout_at = now() where tournament_id = $1 and team_id = $2`,
      [t.id, entry.team_id, checkout.url]);
    return { url: checkout.url };
  });

  // The organizer records a payment by hand: cash at the field, a comped team, or a refund done in Shopify.
  app.post('/v1/tournaments/:id/teams/:slug/payment', { preHandler: requireUser }, async (req, reply) => {
    const t = await loadTournament(req.params.id);
    if (!t || !isOrganizer(t, req.user)) return fail(reply, 404, 'Tournament not found.');
    const status = req.body?.status;
    if (!['paid', 'waived', 'unpaid', 'refunded'].includes(status)) return fail(reply, 400, 'Status must be paid, waived, unpaid or refunded.');
    const note = clean(req.body?.note, 120);
    const result = await tx(async db => {
      const locked = await loadTournament(t.id, db, true);
      const entry = await entryFor(db, locked, req.params.slug, true);
      if (!entry) return { error: [404, 'That team isn’t entered.'] };
      if (entry.payment_status === 'none') return { error: [400, 'This tournament has no entry fee for that team.'] };
      if (status === 'paid' || status === 'waived') {
        await settlePayment(db, locked, entry, { status, note: note || (status === 'paid' ? 'Recorded by organizer' : 'Waived by organizer') });
      } else {
        await db.query(`update tournament_teams set payment_status = $3, payment_note = $4, checkout_url = null, checkout_at = null where tournament_id = $1 and team_id = $2`,
          [t.id, entry.team_id, status, note]);
      }
      return {};
    });
    if (result.error) return fail(reply, ...result.error);
    return view(req, await loadTournament(t.id));
  });

  // Shopify calls this when an order is paid, cancelled or refunded. Signed with SHOPIFY_WEBHOOK_SECRET.
  app.register(async scope => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (_req, body, done) => done(null, body));
    scope.post('/v1/payments/shopify/webhook', async (req, reply) => {
      if (!payments?.verifyWebhook(req.body, req.headers['x-shopify-hmac-sha256'])) return fail(reply, 401, 'Bad signature.');
      const topic = String(req.headers['x-shopify-topic'] || '');
      let order;
      try { order = JSON.parse(req.body.toString('utf8')); } catch { return fail(reply, 400, 'Bad JSON.'); }
      // refunds/create sends a refund (pointing at its order); the other topics send the order itself.
      const info = topic === 'refunds/create'
        ? { reference: null, orderId: order?.order_id != null ? String(order.order_id) : null, refund: true }
        : payments.parseOrder(order);
      const eventId = String(req.headers['x-shopify-webhook-id'] || req.headers['x-shopify-event-id'] || `${topic}:${info.orderId}`);
      // Shopify retries deliveries; each one is handled once.
      const { rowCount } = await pool.query(
        `insert into payment_events (provider, external_id, topic, reference, payload) values ('shopify', $1, $2, $3, $4) on conflict do nothing`,
        [eventId, topic, info.reference, order]);
      if (!rowCount) return { ok: true, duplicate: true };
      let outcome;
      try {
        outcome = await handleOrderEvent(topic, info);
      } catch (err) {
        // Forget the delivery so Shopify's retry is processed rather than skipped as a duplicate.
        await pool.query(`delete from payment_events where provider = 'shopify' and external_id = $1`, [eventId]).catch(() => {});
        req.log.error({ err }, 'shopify webhook failed');
        throw err;
      }
      await pool.query(`update payment_events set outcome = $3 where provider = 'shopify' and external_id = $1 and topic = $2`, [eventId, topic, outcome]);
      return { ok: true, outcome };
    });
  });

  async function handleOrderEvent(topic, info) {
    let link;
    if (info.reference) {
      ({ rows: [link] } = await pool.query(`select tournament_id, team_id from tournament_teams where payment_ref = $1`, [info.reference]));
    } else if (info.refund && info.orderId) {
      // Orders are stored by their GraphQL id; refunds point at the numeric one.
      ({ rows: [link] } = await pool.query(`select tournament_id, team_id from tournament_teams where order_id = $1 or order_id = $2`,
        [info.orderId, `gid://shopify/Order/${info.orderId}`]));
    } else {
      return 'ignored: not an incha entry';
    }
    if (!link) return 'ignored: unknown reference';
    return tx(async db => {
      const t = await loadTournament(link.tournament_id, db, true);
      const { rows: [entry] } = await db.query(`select * from tournament_teams where tournament_id = $1 and team_id = $2 for update`, [link.tournament_id, link.team_id]);
      if (topic === 'orders/paid') {
        if (entry.payment_status === 'paid') return 'already paid';
        const owed = entry.amount_cents ?? t.entry_fee_cents;
        if (info.currency && info.currency !== t.currency) return `held: paid in ${info.currency}, expected ${t.currency}`;
        if (info.amountCents !== null && info.amountCents < owed) return `held: paid ${info.amountCents} of ${owed}`;
        await settlePayment(db, t, entry, { status: 'paid', orderId: info.orderId, orderName: info.orderName, note: 'Paid online' });
        return 'paid';
      }
      if (topic === 'orders/cancelled' || topic === 'refunds/create') {
        if (entry.payment_status !== 'paid' && entry.payment_status !== 'pending') return 'ignored: nothing to refund';
        await db.query(`update tournament_teams set payment_status = 'refunded', payment_note = $3,
          status = case when status = 'approved' and $4 = 'registration' then 'pending' else status end
          where tournament_id = $1 and team_id = $2`,
        [t.id, entry.team_id, topic === 'orders/cancelled' ? 'Order cancelled in Shopify' : 'Refunded in Shopify', t.status]);
        return 'refunded';
      }
      return `ignored: ${topic}`;
    });
  }

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

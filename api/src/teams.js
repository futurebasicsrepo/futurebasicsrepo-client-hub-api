// Team pages and rosters. Whoever first named a team owns it and can add up to a few managers;
// managers keep the squad list. Youth squads are only shown to their managers.
import { matchRow, playerView } from './matches.js';
import { slugify } from './lib.js';

export const MAX_MANAGERS = 5;
export const MAX_PLAYERS = 60;
export const POSITIONS = ['', 'GK', 'DF', 'MF', 'FW'];

const clean = (value, max) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/** Validates a squad entry. Returns { error } or { values }. */
export function normalizePlayer(body = {}) {
  const name = clean(body.name, 60);
  if (!name) return { error: 'Enter the player’s name.' };
  let number = null;
  if (body.number !== undefined && body.number !== null && body.number !== '') {
    number = Number(body.number);
    if (!Number.isInteger(number) || number < 0 || number > 99) return { error: 'Shirt number must be 0–99.' };
  }
  const position = String(body.position ?? '').toUpperCase();
  if (!POSITIONS.includes(position)) return { error: 'Position must be GK, DF, MF or FW.' };
  return { values: { name, number, position } };
}

export function registerTeams(app, { pool, fail, requireUser, MATCH_SELECT }) {
  async function loadTeam(slug) {
    const { rows: [team] } = await pool.query(`select * from teams where slug = $1`, [slugify(String(slug))]);
    return team || null;
  }

  /** The team's owner, or someone they made a manager. */
  async function canManage(team, user) {
    if (!team || !user) return false;
    if (Number(team.created_by) === user.id) return true;
    const { rows } = await pool.query(`select 1 from team_managers where team_id = $1 and user_id = $2`, [team.id, user.id]);
    return rows.length > 0;
  }

  async function roster(teamId) {
    const { rows } = await pool.query(`
      select p.*, (select count(*)::int from match_events e where e.player_id = p.id and e.type = 'goal') as goals
      from team_players p where p.team_id = $1 order by p.number asc nulls last, p.name asc`, [teamId]);
    return rows.map(row => ({ ...playerView(row), goals: row.goals }));
  }

  async function managers(team) {
    const { rows } = await pool.query(`
      select u.handle, u.display_name, (u.id = $2) as owner from users u
      where u.id = $2 or u.id in (select user_id from team_managers where team_id = $1)
      order by (u.id = $2) desc, u.handle`, [team.id, team.created_by]);
    return rows.map(r => ({ handle: r.handle, displayName: r.display_name, owner: r.owner }));
  }

  app.get('/v1/teams/:slug', async (req, reply) => {
    const team = await loadTeam(req.params.slug);
    if (!team) return fail(reply, 404, 'Team not found.');
    const [following, manage, { rows }, staff] = await Promise.all([
      req.user
        ? pool.query(`select exists(select 1 from team_follows where user_id = $1 and team_id = $2) as f`, [req.user.id, team.id]).then(r => r.rows[0].f)
        : false,
      canManage(team, req.user),
      pool.query(`${MATCH_SELECT} where (m.home_team_id = $1 or m.away_team_id = $1) and m.visibility = 'public' and not m.youth order by m.kickoff_at desc limit 50`, [team.id]),
      managers(team)
    ]);
    const matches = rows.map(matchRow);
    const record = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
    for (const m of matches) {
      if (m.period !== 'ft') continue;
      const home = m.home.slug === team.slug;
      const [gf, ga] = home ? [m.homeScore, m.awayScore] : [m.awayScore, m.homeScore];
      record.played++; record.goalsFor += gf; record.goalsAgainst += ga;
      if (gf > ga) record.won++; else if (gf === ga) record.drawn++; else record.lost++;
    }
    const players = await roster(team.id);
    const hidden = team.youth && !manage;
    return {
      team: { slug: team.slug, name: team.name, youth: team.youth },
      following, record, matches,
      canManage: manage,
      isOwner: Boolean(req.user && Number(team.created_by) === req.user.id),
      managers: staff,
      // A youth squad's names stay with its managers; everyone else sees how many.
      roster: hidden ? [] : players,
      rosterCount: players.length,
      rosterHidden: hidden,
      serverTime: new Date().toISOString()
    };
  });

  /** Teams the signed-in user runs, for "register a team" pickers. */
  app.get('/v1/me/teams', { preHandler: requireUser }, async req => {
    const { rows } = await pool.query(`
      select t.slug, t.name, (select count(*)::int from team_players p where p.team_id = t.id) as players from teams t
      where t.created_by = $1 or exists(select 1 from team_managers m where m.team_id = t.id and m.user_id = $1)
      order by t.name`, [req.user.id]);
    return { teams: rows.map(r => ({ slug: r.slug, name: r.name, players: r.players })) };
  });

  const managed = async (req, reply) => {
    const team = await loadTeam(req.params.slug);
    if (!team) { fail(reply, 404, 'Team not found.'); return null; }
    if (!(await canManage(team, req.user))) { fail(reply, 403, 'Only this team’s managers can change its squad.'); return null; }
    return team;
  };

  app.post('/v1/teams/:slug/players', { preHandler: requireUser }, async (req, reply) => {
    const team = await managed(req, reply);
    if (!team) return;
    const { error, values } = normalizePlayer(req.body);
    if (error) return fail(reply, 400, error);
    const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from team_players where team_id = $1`, [team.id]);
    if (n >= MAX_PLAYERS) return fail(reply, 400, `A squad can have up to ${MAX_PLAYERS} players.`);
    if (values.number != null) {
      const { rows: taken } = await pool.query(`select name from team_players where team_id = $1 and number = $2`, [team.id, values.number]);
      if (taken.length) return fail(reply, 409, `#${values.number} is already ${taken[0].name}’s.`);
    }
    const { rows: [row] } = await pool.query(
      `insert into team_players (team_id, name, number, position) values ($1, $2, $3, $4) returning *`,
      [team.id, values.name, values.number, values.position]);
    return reply.code(201).send({ player: { ...playerView(row), goals: 0 }, roster: await roster(team.id) });
  });

  app.patch('/v1/teams/:slug/players/:id', { preHandler: requireUser }, async (req, reply) => {
    const team = await managed(req, reply);
    if (!team) return;
    const { rows: [current] } = await pool.query(`select * from team_players where id = $1 and team_id = $2`, [Number(req.params.id) || 0, team.id]);
    if (!current) return fail(reply, 404, 'Player not found.');
    const { error, values } = normalizePlayer({ ...playerView(current), ...(req.body || {}) });
    if (error) return fail(reply, 400, error);
    if (values.number != null) {
      const { rows: taken } = await pool.query(`select name from team_players where team_id = $1 and number = $2 and id <> $3`, [team.id, values.number, current.id]);
      if (taken.length) return fail(reply, 409, `#${values.number} is already ${taken[0].name}’s.`);
    }
    await pool.query(`update team_players set name = $2, number = $3, position = $4 where id = $1`, [current.id, values.name, values.number, values.position]);
    return { roster: await roster(team.id) };
  });

  // Goals already logged keep the name on the timeline; they just stop counting toward a squad member.
  app.delete('/v1/teams/:slug/players/:id', { preHandler: requireUser }, async (req, reply) => {
    const team = await managed(req, reply);
    if (!team) return;
    const { rowCount } = await pool.query(`delete from team_players where id = $1 and team_id = $2`, [Number(req.params.id) || 0, team.id]);
    if (!rowCount) return fail(reply, 404, 'Player not found.');
    return { roster: await roster(team.id) };
  });

  // Youth teams hide their squad from the public. Once on, only the owner can turn it off.
  app.patch('/v1/teams/:slug', { preHandler: requireUser }, async (req, reply) => {
    const team = await managed(req, reply);
    if (!team) return;
    if (typeof req.body?.youth !== 'boolean') return fail(reply, 400, 'Nothing to change.');
    if (!req.body.youth && team.youth && Number(team.created_by) !== req.user.id) return fail(reply, 403, 'Only the team’s owner can turn off youth mode.');
    await pool.query(`update teams set youth = $2 where id = $1`, [team.id, req.body.youth]);
    return { team: { slug: team.slug, name: team.name, youth: req.body.youth } };
  });

  app.post('/v1/teams/:slug/managers', { preHandler: requireUser }, async (req, reply) => {
    const team = await loadTeam(req.params.slug);
    if (!team || Number(team.created_by) !== req.user.id) return fail(reply, 403, 'Only the team’s owner can add managers.');
    const handle = String(req.body?.handle || '').trim().toLowerCase().replace(/^@/, '');
    const { rows: [user] } = await pool.query(`select id from users where handle = $1`, [handle]);
    if (!user) return fail(reply, 404, `There's no one called @${handle || '…'} on incha.tv.`);
    if (Number(user.id) === req.user.id) return fail(reply, 400, 'You already run this team.');
    const { rows: [{ n }] } = await pool.query(`select count(*)::int as n from team_managers where team_id = $1`, [team.id]);
    if (n >= MAX_MANAGERS) return fail(reply, 400, `A team can have up to ${MAX_MANAGERS} managers.`);
    await pool.query(`insert into team_managers (team_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing`, [team.id, user.id, req.user.id]);
    return reply.code(201).send({ managers: await managers(team) });
  });

  app.delete('/v1/teams/:slug/managers/:handle', { preHandler: requireUser }, async (req, reply) => {
    const team = await loadTeam(req.params.slug);
    const handle = String(req.params.handle).toLowerCase();
    // The owner removes anyone; a manager can step down.
    if (!team || (Number(team.created_by) !== req.user.id && req.user.handle !== handle)) return fail(reply, 403, 'Only the team’s owner can remove managers.');
    await pool.query(`delete from team_managers m using users u where m.user_id = u.id and m.team_id = $1 and u.handle = $2`, [team.id, handle]);
    return { managers: await managers(team) };
  });

  return { loadTeam, canManage };
}

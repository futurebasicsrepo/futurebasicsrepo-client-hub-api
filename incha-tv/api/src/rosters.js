// Team rosters: players, the people who manage a team, and player stats from logged match events.
//
// Teams are shared by name across the site (anyone typing "Rangers FC" into a match gets the same team),
// so typing a team into a match doesn't make you its manager. A team with no managers can be claimed by
// any signed-in user; after that, its managers add each other. Moderators can manage any team.
// Youth rosters (and their stats) are only shown to the team's managers.
import { MAX_PLAYERS, findPlayer, normalizePlayer, playerLabel } from './bracket.js';
import { normalizeHandle, slugify } from './lib.js';

const MAX_MANAGERS = 5;

export const playerView = row => ({ id: Number(row.id), name: row.name, number: row.number, position: row.position });

export function createRosters({ pool, isStaff = async () => false }) {
  async function loadTeam(slug) {
    const { rows: [team] } = await pool.query(`select * from teams where slug = $1`, [slugify(slug)]);
    return team || null;
  }

  async function managers(teamId) {
    const { rows } = await pool.query(`
      select u.id, u.handle, u.display_name from team_managers tm join users u on u.id = tm.user_id
      where tm.team_id = $1 order by tm.created_at`, [teamId]);
    return rows;
  }

  async function isManager(teamId, user) {
    if (!user) return false;
    const { rows: [row] } = await pool.query(`select 1 from team_managers where team_id = $1 and user_id = $2`, [teamId, user.id]);
    return Boolean(row) || isStaff(user);
  }

  async function players(teamId, db = pool) {
    const { rows } = await db.query(`
      select * from team_players where team_id = $1 and removed_at is null
      order by number asc nulls last, lower(name) asc`, [teamId]);
    return rows.map(playerView);
  }

  // Goals and cards per player, from every match they were tagged in (hidden matches don't count).
  async function stats(teamId) {
    const { rows } = await pool.query(`
      select e.player_id,
        count(*) filter (where e.type = 'goal')::int as goals,
        count(*) filter (where e.type = 'yellow')::int as yellows,
        count(*) filter (where e.type = 'red')::int as reds,
        count(distinct e.match_id)::int as matches
      from match_events e join team_players p on p.id = e.player_id join matches m on m.id = e.match_id
      where p.team_id = $1 and m.hidden_at is null
      group by e.player_id`, [teamId]);
    return new Map(rows.map(r => [Number(r.player_id), { goals: r.goals, yellows: r.yellows, reds: r.reds, matches: r.matches }]));
  }

  async function addManager(teamId, userId, addedBy, db = pool) {
    await db.query(`insert into team_managers (team_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing`, [teamId, userId, addedBy]);
  }

  async function addPlayers(teamId, list, userId, db = pool) {
    for (const p of list) {
      await db.query(`insert into team_players (team_id, name, number, position, added_by) values ($1, $2, $3, $4, $5)`,
        [teamId, p.name, p.number, p.position, userId]);
    }
  }

  // Tie a logged goal or card to a roster player: by id when the scorekeeper picked one, or by
  // matching what they typed ("9", "#9 Diego", "Diego Ruiz"). Returns { error } or { playerId, label }.
  async function resolveEventPlayer(teamId, { playerId, typed }) {
    if (!teamId || (!playerId && !typed)) return { playerId: null, label: typed || '' };
    const roster = await players(teamId);
    if (playerId) {
      const found = roster.find(p => p.id === Number(playerId));
      if (!found) return { error: 'That player isn’t on this team’s roster.' };
      return { playerId: found.id, label: playerLabel(found) };
    }
    const found = findPlayer(roster, typed);
    return found ? { playerId: found.id, label: playerLabel(found) } : { playerId: null, label: typed };
  }

  // What the team page shows about the roster to this viewer.
  async function teamRoster(team, user) {
    const [canManage, list] = await Promise.all([isManager(team.id, user), managers(team.id)]);
    const hidden = team.youth && !canManage;
    const roster = hidden ? [] : await players(team.id);
    const byPlayer = hidden ? new Map() : await stats(team.id);
    const empty = { goals: 0, yellows: 0, reds: 0, matches: 0 };
    return {
      canManage,
      claimable: Boolean(user) && !list.length,
      managers: list.map(m => ({ handle: m.handle, displayName: m.display_name })),
      rosterHidden: hidden,
      players: roster.map(p => ({ ...p, stats: byPlayer.get(p.id) || empty }))
    };
  }

  return { loadTeam, managers, isManager, players, stats, addManager, addPlayers, resolveEventPlayer, teamRoster };
}

export function registerRosters(app, { pool, fail, requireUser, rosters }) {
  async function managedTeam(req, reply) {
    const team = await rosters.loadTeam(req.params.slug);
    if (!team) { fail(reply, 404, 'Team not found.'); return null; }
    if (!(await rosters.isManager(team.id, req.user))) { fail(reply, 403, 'Only this team’s managers can change its roster.'); return null; }
    return team;
  }

  const numberTaken = async (teamId, number, exceptId = 0) => {
    if (number === null) return false;
    const { rows } = await pool.query(`select 1 from team_players where team_id = $1 and number = $2 and removed_at is null and id <> $3`, [teamId, number, exceptId]);
    return rows.length > 0;
  };

  const rosterReply = async (req, team) => ({ team: { slug: team.slug, name: team.name, youth: team.youth }, ...(await rosters.teamRoster(team, req.user)) });

  app.get('/v1/teams/:slug/roster', async (req, reply) => {
    const team = await rosters.loadTeam(req.params.slug);
    if (!team) return fail(reply, 404, 'Team not found.');
    return rosterReply(req, team);
  });

  // Nobody manages this team yet: take it on.
  app.post('/v1/teams/:slug/claim', { preHandler: requireUser }, async (req, reply) => {
    const team = await rosters.loadTeam(req.params.slug);
    if (!team) return fail(reply, 404, 'Team not found.');
    const { rowCount } = await pool.query(`
      insert into team_managers (team_id, user_id, added_by)
      select $1, $2, $2 where not exists (select 1 from team_managers where team_id = $1)`, [team.id, req.user.id]);
    if (!rowCount) return fail(reply, 409, 'This team already has managers. Ask one of them to add you.');
    return reply.code(201).send(await rosterReply(req, team));
  });

  app.patch('/v1/teams/:slug', { preHandler: requireUser }, async (req, reply) => {
    const team = await managedTeam(req, reply);
    if (!team) return;
    if ('youth' in (req.body || {})) await pool.query(`update teams set youth = $2 where id = $1`, [team.id, Boolean(req.body.youth)]);
    return rosterReply(req, await rosters.loadTeam(team.slug));
  });

  app.post('/v1/teams/:slug/players', { preHandler: requireUser }, async (req, reply) => {
    const team = await managedTeam(req, reply);
    if (!team) return;
    const { error, player } = normalizePlayer(req.body || {});
    if (error) return fail(reply, 400, error);
    const { rows: [{ count }] } = await pool.query(`select count(*)::int from team_players where team_id = $1 and removed_at is null`, [team.id]);
    if (count >= MAX_PLAYERS) return fail(reply, 400, `A roster can have up to ${MAX_PLAYERS} players.`);
    if (await numberTaken(team.id, player.number)) return fail(reply, 409, `Someone already wears #${player.number}.`);
    await rosters.addPlayers(team.id, [player], req.user.id);
    return reply.code(201).send(await rosterReply(req, team));
  });

  app.patch('/v1/teams/:slug/players/:id', { preHandler: requireUser }, async (req, reply) => {
    const team = await managedTeam(req, reply);
    if (!team) return;
    const { rows: [current] } = await pool.query(`select * from team_players where id = $1 and team_id = $2 and removed_at is null`, [Number(req.params.id) || 0, team.id]);
    if (!current) return fail(reply, 404, 'Player not found.');
    const { error, player } = normalizePlayer({ ...playerView(current), ...(req.body || {}) });
    if (error) return fail(reply, 400, error);
    if (await numberTaken(team.id, player.number, current.id)) return fail(reply, 409, `Someone already wears #${player.number}.`);
    await pool.query(`update team_players set name = $2, number = $3, position = $4 where id = $1`, [current.id, player.name, player.number, player.position]);
    return rosterReply(req, team);
  });

  // Players leave the roster but keep their goals and cards in old matches.
  app.delete('/v1/teams/:slug/players/:id', { preHandler: requireUser }, async (req, reply) => {
    const team = await managedTeam(req, reply);
    if (!team) return;
    const { rowCount } = await pool.query(`update team_players set removed_at = now() where id = $1 and team_id = $2 and removed_at is null`, [Number(req.params.id) || 0, team.id]);
    if (!rowCount) return fail(reply, 404, 'Player not found.');
    return rosterReply(req, team);
  });

  app.post('/v1/teams/:slug/managers', { preHandler: requireUser }, async (req, reply) => {
    const team = await managedTeam(req, reply);
    if (!team) return;
    const handle = normalizeHandle(req.body?.handle);
    const { rows: [user] } = await pool.query(`select id from users where handle = $1`, [handle]);
    if (!user) return fail(reply, 404, `There's no one called @${handle || '…'} on incha.tv.`);
    const list = await rosters.managers(team.id);
    if (list.length >= MAX_MANAGERS && !list.some(m => Number(m.id) === Number(user.id))) return fail(reply, 400, `A team can have up to ${MAX_MANAGERS} managers.`);
    await rosters.addManager(team.id, user.id, req.user.id);
    return reply.code(201).send(await rosterReply(req, team));
  });

  // Managers remove each other; anyone can step down.
  app.delete('/v1/teams/:slug/managers/:handle', { preHandler: requireUser }, async (req, reply) => {
    const team = await rosters.loadTeam(req.params.slug);
    const handle = normalizeHandle(req.params.handle);
    if (!team || (handle !== req.user.handle && !(await rosters.isManager(team.id, req.user)))) return fail(reply, 404, 'Team not found.');
    await pool.query(`delete from team_managers tm using users u where tm.user_id = u.id and tm.team_id = $1 and u.handle = $2`, [team.id, handle]);
    return rosterReply(req, team);
  });
}

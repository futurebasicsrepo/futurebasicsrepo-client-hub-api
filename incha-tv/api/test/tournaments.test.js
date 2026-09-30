import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dbUrl = process.env.TEST_DATABASE_URL;

test('rosters and knockout tournaments', { skip: !dbUrl && 'set TEST_DATABASE_URL to run' }, async t => {
  process.env.DATABASE_URL = dbUrl;
  process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), 'incha-tournaments-'));
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.TRANSCODE = 'off';
  const { migrate, pool } = await import('../src/db.js');
  const { buildApp } = await import('../src/app.js');
  await pool.query('drop table if exists payment_events, bracket_slots, tournament_teams, tournaments, team_players, team_managers, mod_actions, reports, chat_messages, reply_votes, replies, thread_votes, threads, fandom_members, push_subscriptions, team_follows, match_follows, match_keepers, streams, match_events, comments, votes, posts, matches, teams, fandoms, users cascade');
  await migrate();
  const app = await buildApp({ logger: false });
  t.after(async () => { await app.close(); await pool.end(); });
  const json = res => JSON.parse(res.body || '{}');
  const call = (method, url, token, payload) => app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  const signup = async handle => json(await call('POST', '/v1/auth/signup', null, { email: `${handle}@x.tv`, handle, password: 'hinchada123' })).token;
  const [org, ana, ben, cat, dan, eve] = await Promise.all(['org', 'ana', 'ben', 'cat', 'dan', 'eve'].map(signup));

  // ---- rosters ----
  const { match } = json(await call('POST', '/v1/matches', ana, { home: 'Kensington FC', away: 'Fishtown United' }));
  let team = json(await call('GET', '/v1/teams/kensington-fc', ben));
  assert.equal(team.canManage, false);
  assert.deepEqual(team.roster, []);
  assert.equal((await call('POST', '/v1/teams/kensington-fc/players', ben, { name: 'Sneaky' })).statusCode, 403, 'only managers edit the squad');
  let res = await call('POST', '/v1/teams/kensington-fc/players', ana, { name: '  Maria  Lopez ', number: 9, position: 'fw' });
  assert.equal(res.statusCode, 201);
  const maria = json(res).player;
  assert.deepEqual({ ...maria, id: 0 }, { id: 0, name: 'Maria Lopez', number: 9, position: 'FW', goals: 0 });
  assert.equal((await call('POST', '/v1/teams/kensington-fc/players', ana, { name: 'Other', number: 9 })).statusCode, 409, 'shirt numbers are unique');
  assert.equal((await call('POST', '/v1/teams/kensington-fc/players', ana, { name: 'X', number: 100 })).statusCode, 400);
  assert.equal((await call('POST', '/v1/teams/kensington-fc/players', ana, { name: 'X', position: 'ST' })).statusCode, 400);
  const keeper = json(await call('POST', '/v1/teams/kensington-fc/players', ana, { name: 'Jo Keeper', number: 1, position: 'GK' })).player;
  res = await call('PATCH', `/v1/teams/kensington-fc/players/${keeper.id}`, ana, { number: 13 });
  assert.equal(json(res).roster.find(p => p.id === keeper.id).number, 13);
  // Managers: the owner adds ben, who can then edit.
  assert.equal((await call('POST', '/v1/teams/kensington-fc/managers', ben, { handle: 'ben' })).statusCode, 403);
  assert.equal((await call('POST', '/v1/teams/kensington-fc/managers', ana, { handle: 'ben' })).statusCode, 201);
  assert.equal((await call('POST', '/v1/teams/kensington-fc/players', ben, { name: 'Ben Added' })).statusCode, 201);
  team = json(await call('GET', '/v1/teams/kensington-fc', null));
  assert.equal(team.canManage, false);
  assert.deepEqual(team.managers.map(m => [m.handle, m.owner]), [['ana', true], ['ben', false]]);
  assert.equal(team.roster.length, 3);
  assert.deepEqual(json(await call('GET', '/v1/me/teams', ben)).teams.map(x => x.slug), ['kensington-fc']);

  // Scorekeepers see both squads and pick scorers from them.
  let snap = json(await call('GET', `/v1/matches/${match.id}`, ana));
  assert.equal(snap.rosters.home.length, 3);
  assert.deepEqual(snap.rosters.away, []);
  assert.equal(json(await call('GET', `/v1/matches/${match.id}`, null)).rosters, undefined, 'rosters are for scorekeepers');
  await call('POST', `/v1/matches/${match.id}/events`, ana, { type: 'kickoff' });
  assert.equal((await call('POST', `/v1/matches/${match.id}/events`, ana, { type: 'goal', side: 'away', playerId: maria.id })).statusCode, 400, 'wrong team');
  snap = json(await call('POST', `/v1/matches/${match.id}/events`, ana, { type: 'goal', side: 'home', playerId: maria.id }));
  const goal = snap.events.at(-1);
  assert.equal(goal.player, 'Maria Lopez');
  assert.equal(goal.playerId, maria.id);
  assert.equal(json(await call('GET', '/v1/teams/kensington-fc', null)).roster.find(p => p.id === maria.id).goals, 1);
  // Removing a player keeps the name on the timeline.
  await call('DELETE', `/v1/teams/kensington-fc/players/${maria.id}`, ana);
  const after = json(await call('GET', `/v1/matches/${match.id}`, null)).events.at(-1);
  assert.deepEqual([after.player, after.playerId], ['Maria Lopez', null]);

  // Youth squads stay with their managers.
  await call('POST', '/v1/matches', ana, { home: 'Kensington FC', away: 'Juniors United', youth: true });
  team = json(await call('GET', '/v1/teams/kensington-fc', null));
  assert.equal(team.rosterHidden, true);
  assert.deepEqual(team.roster, []);
  assert.equal(team.rosterCount, 2);
  assert.equal(json(await call('GET', '/v1/teams/kensington-fc', ben)).roster.length, 2);

  // ---- tournaments ----
  assert.equal((await call('POST', '/v1/tournaments', org, { name: '', capacity: 1 })).statusCode, 400);
  res = await call('POST', '/v1/tournaments', org, { name: 'Summer Cup', capacity: 5, halfLength: 15, venue: 'FDR Park' });
  assert.equal(res.statusCode, 201);
  let cup = json(res);
  const id = cup.tournament.id;
  assert.equal(cup.tournament.isOrganizer, true);
  assert.equal(cup.tournament.status, 'registration');
  assert.ok(json(await call('GET', '/v1/tournaments?filter=open', null)).tournaments.some(x => x.id === id));

  // Registration: an existing team only by its managers; a new name makes you its owner.
  res = await call('POST', `/v1/tournaments/${id}/teams`, cat, { name: 'Kensington FC' });
  assert.equal(res.statusCode, 403);
  assert.match(json(res).error, /already on incha\.tv/);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, ben, { name: 'Kensington FC', note: 'call 555' })).statusCode, 201);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, ana, { name: 'Kensington FC' })).statusCode, 409);
  for (const [token, name] of [[cat, 'Cat Rovers'], [dan, 'Dan Athletic'], [eve, 'Eve Wanderers'], [ana, 'Fishtown United']]) {
    assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, token, { name })).statusCode, 201, name);
  }
  assert.equal(json(await call('GET', '/v1/teams/cat-rovers', cat)).isOwner, true);
  cup = json(await call('GET', `/v1/tournaments/${id}`, null));
  assert.deepEqual(cup.teams, [], 'pending entries are private');
  cup = json(await call('GET', `/v1/tournaments/${id}`, cat));
  assert.deepEqual(cup.teams.map(x => [x.slug, x.status, x.mine]), [['cat-rovers', 'pending', true]]);
  cup = json(await call('GET', `/v1/tournaments/${id}`, org));
  assert.equal(cup.teams.length, 5);
  assert.equal(cup.teams[0].note, 'call 555');
  assert.equal((await call('POST', `/v1/tournaments/${id}/start`, org, {})).statusCode, 400, 'nobody approved yet');
  assert.equal((await call('PATCH', `/v1/tournaments/${id}/teams/cat-rovers`, cat, { status: 'approved' })).statusCode, 404, 'organizer only');
  for (const slug of ['kensington-fc', 'cat-rovers', 'dan-athletic', 'eve-wanderers', 'fishtown-united']) {
    assert.equal((await call('PATCH', `/v1/tournaments/${id}/teams/${slug}`, org, { status: 'approved' })).statusCode, 200, slug);
  }
  // Full: a sixth team waits, and can't be approved.
  const fay = await signup('fay');
  await call('POST', `/v1/tournaments/${id}/teams`, fay, { name: 'Fay Town' });
  assert.equal((await call('PATCH', `/v1/tournaments/${id}/teams/fay-town`, org, { status: 'approved' })).statusCode, 400);
  assert.equal((await call('DELETE', `/v1/tournaments/${id}/teams/fay-town`, fay)).statusCode, 200, 'withdraw');
  assert.equal((await call('PATCH', `/v1/tournaments/${id}`, org, { capacity: 4 })).statusCode, 400, 'capacity can’t drop below entries');

  // Draw: 5 teams → 8-slot bracket, seeds 1–3 get byes.
  res = await call('POST', `/v1/tournaments/${id}/start`, org, {});
  assert.equal(res.statusCode, 200);
  cup = json(res);
  assert.equal(cup.tournament.status, 'running');
  assert.deepEqual(cup.bracket.map(r => r.name), ['Quarter-finals', 'Semi-finals', 'Final']);
  const qf = cup.bracket[0].slots;
  assert.deepEqual(qf.map(s => [s.home?.slug ?? null, s.away?.slug ?? null, s.bye]),
    [['kensington-fc', null, true], ['eve-wanderers', 'fishtown-united', false], ['cat-rovers', null, true], ['dan-athletic', null, true]]);
  const sf = cup.bracket[1].slots;
  assert.equal(sf[0].match, null, 'waits for the qualifier');
  assert.deepEqual([sf[1].home.slug, sf[1].away.slug], ['cat-rovers', 'dan-athletic']);
  assert.ok(sf[1].match, 'two bye winners meet right away');
  assert.equal(sf[1].match.competition, 'Summer Cup · Semi-finals');
  assert.equal(sf[1].match.halfLength, 15);
  assert.equal((await call('POST', `/v1/tournaments/${id}/teams`, eve, { name: 'Late FC' })).statusCode, 400, 'registration closed');
  assert.equal((await call('POST', `/v1/tournaments/${id}/start`, org, {})).statusCode, 409);

  // The organizer keeps score; the qualifier's winner moves on at full time.
  const play = async (matchId, home, away) => {
    await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'kickoff' });
    for (let i = 0; i < home; i++) await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'goal', side: 'home' });
    for (let i = 0; i < away; i++) await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'goal', side: 'away' });
    return json(await call('POST', `/v1/matches/${matchId}/events`, org, { type: 'fulltime' }));
  };
  const qfMatch = qf[1].match.id;
  assert.equal(json(await call('GET', `/v1/matches/${qfMatch}`, null)).match.tournament.round, 'Quarter-finals');
  await play(qfMatch, 0, 2);
  cup = json(await call('GET', `/v1/tournaments/${id}`, null));
  assert.equal(cup.bracket[0].slots[1].winner, 'away');
  assert.deepEqual([cup.bracket[1].slots[0].home.slug, cup.bracket[1].slots[0].away.slug], ['kensington-fc', 'fishtown-united']);
  const sf1 = cup.bracket[1].slots[0].match.id;

  // Undoing a goal before the next tie kicks off changes who went through.
  const goals = json(await call('GET', `/v1/matches/${qfMatch}`, org)).events.filter(e => e.type === 'goal');
  await call('DELETE', `/v1/matches/${qfMatch}/events/${goals[0].id}`, org);
  await call('DELETE', `/v1/matches/${qfMatch}/events/${goals[1].id}`, org);
  cup = json(await call('GET', `/v1/tournaments/${id}`, org));
  assert.equal(cup.bracket[0].slots[1].winner, null);
  assert.equal(cup.bracket[0].slots[1].awaitingDecision, true, '0–0 at full time: the organizer decides');
  assert.equal(cup.bracket[1].slots[0].away, null);
  assert.equal(cup.bracket[1].slots[0].match, null, 'the unplayed semi comes down');
  assert.equal(json(await call('GET', `/v1/matches/${sf1}`, null)).error, 'Match not found.');
  // Penalties: the organizer picks the winner.
  const qfSlot = cup.bracket[0].slots[1].id;
  assert.equal((await call('POST', `/v1/tournaments/${id}/slots/${qfSlot}/winner`, eve, { side: 'home' })).statusCode, 404);
  cup = json(await call('POST', `/v1/tournaments/${id}/slots/${qfSlot}/winner`, org, { side: 'home', note: 'Penalties 4–3' }));
  assert.equal(cup.bracket[0].slots[1].winner, 'home');
  assert.equal(cup.bracket[0].slots[1].decided, 'penalties');
  assert.equal(cup.bracket[1].slots[0].away.slug, 'eve-wanderers');
  const semiA = cup.bracket[1].slots[0].match.id;

  // Walkover in the other semi, then the final.
  const semiBSlot = cup.bracket[1].slots[1].id;
  cup = json(await call('POST', `/v1/tournaments/${id}/slots/${semiBSlot}/winner`, org, { side: 'away' }));
  assert.equal(cup.bracket[1].slots[1].decided, 'walkover');
  assert.equal(cup.bracket[1].slots[1].match, null);
  assert.equal(cup.bracket[2].slots[0].away.slug, 'dan-athletic');
  await play(semiA, 3, 1);
  cup = json(await call('GET', `/v1/tournaments/${id}`, null));
  const final = cup.bracket[2].slots[0];
  assert.deepEqual([final.home.slug, final.away.slug], ['kensington-fc', 'dan-athletic']);
  // The semi's result is locked once the final kicks off.
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'kickoff' });
  const semiGoal = json(await call('GET', `/v1/matches/${semiA}`, org)).events.find(e => e.type === 'goal' && e.side === 'home');
  await call('DELETE', `/v1/matches/${semiA}/events/${semiGoal.id}`, org);
  await call('DELETE', `/v1/matches/${semiA}/events/${json(await call('GET', `/v1/matches/${semiA}`, org)).events.find(e => e.type === 'goal' && e.side === 'home').id}`, org);
  assert.equal(json(await call('GET', `/v1/tournaments/${id}`, null)).bracket[1].slots[0].winner, 'home', 'bracket holds after the next kick-off');
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'goal', side: 'away' });
  await call('POST', `/v1/matches/${final.match.id}/events`, org, { type: 'fulltime' });
  cup = json(await call('GET', `/v1/tournaments/${id}`, null));
  assert.equal(cup.tournament.status, 'finished');
  assert.deepEqual(cup.tournament.champion, { slug: 'dan-athletic', name: 'Dan Athletic' });
  assert.ok(json(await call('GET', '/v1/tournaments?filter=finished', null)).tournaments.some(x => x.id === id && x.champion.slug === 'dan-athletic'));
  assert.ok(json(await call('GET', '/v1/tournaments?filter=mine', ben)).tournaments.some(x => x.id === id), 'entered teams’ managers see it in mine');

  // Auto-approval fills up; youth tournaments are unlisted.
  const quick = json(await call('POST', '/v1/tournaments', org, { name: 'Quick Cup', capacity: 2, approval: 'auto', youth: true })).tournament;
  assert.equal(quick.visibility, 'unlisted');
  assert.equal((await call('POST', `/v1/tournaments/${quick.id}/teams`, cat, { name: 'Cat Rovers' })).statusCode, 201);
  assert.equal((await call('POST', `/v1/tournaments/${quick.id}/teams`, dan, { name: 'Dan Athletic' })).statusCode, 201);
  assert.equal((await call('POST', `/v1/tournaments/${quick.id}/teams`, eve, { name: 'Eve Wanderers' })).statusCode, 400, 'full');
  assert.equal(json(await call('GET', '/v1/teams/cat-rovers', null)).rosterHidden, true, 'youth tournament teams become youth');
  assert.ok(!json(await call('GET', '/v1/tournaments?filter=open', null)).tournaments.some(x => x.id === quick.id));
  const two = json(await call('POST', `/v1/tournaments/${quick.id}/start`, org, { shuffle: true }));
  assert.deepEqual(two.bracket.map(r => r.name), ['Final']);
  assert.equal(two.bracket[0].slots[0].match.youth, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldScores, groupScores, normalizeEvent, normalizeOdds } from '../src/worldscores.js';

const team = (name, abbr) => ({ displayName: name, shortDisplayName: name.split(' ')[0], abbreviation: abbr });
const event = (id, leagueId, state, { name = `STATUS_${state.toUpperCase()}`, detail = '', home = ['Philadelphia Union', 'PHI', '1'], away = ['Inter Miami CF', 'MIA', '0'], date = '2026-09-26T23:30Z', note } = {}) => ({
  id, uid: `s:600~l:${leagueId}~e:${id}`, date,
  status: { type: { state, name, shortDetail: detail, description: name === 'STATUS_POSTPONED' ? 'Postponed' : detail } },
  competitions: [{
    altGameNote: note,
    venue: { fullName: 'Subaru Park' },
    competitors: [
      { homeAway: 'home', score: home[2], winner: state === 'post' && home[2] > away[2], team: team(home[0], home[1]) },
      { homeAway: 'away', score: away[2], winner: state === 'post' && away[2] > home[2], team: team(away[0], away[1]) }
    ]
  }]
});
const LEAGUES = new Map([['770', { slug: 'usa.1', name: 'MLS' }], ['700', { slug: 'eng.1', name: 'English Premier League' }], ['5487', { slug: 'usa.ncaa.m.1', name: "NCAA Men's Soccer" }]]);

test('normalizeEvent maps live, finished, upcoming and postponed games', () => {
  const live = normalizeEvent(event('1', '770', 'in', { detail: "67'", name: 'STATUS_SECOND_HALF' }), LEAGUES);
  assert.deepEqual(live.league, { slug: 'usa.1', name: 'MLS' });
  assert.equal(live.state, 'in');
  assert.equal(live.detail, "67'");
  assert.deepEqual(live.home, { name: 'Philadelphia Union', short: 'Philadelphia', abbr: 'PHI', score: 1, winner: false, form: null });
  assert.equal(live.venue, 'Subaru Park');

  const ft = normalizeEvent(event('2', '700', 'post', { detail: 'FT', name: 'STATUS_FULL_TIME' }), LEAGUES);
  assert.equal(ft.detail, 'FT');
  assert.equal(ft.home.winner, true);

  const pre = normalizeEvent(event('3', '770', 'pre', { detail: '9/26 - 7:30 PM EDT', home: ['A', 'A', '0'], away: ['B', 'B', '0'] }), LEAGUES);
  assert.equal(pre.detail, null, 'kick-off time is formatted by the client');
  assert.equal(pre.home.score, null, 'no score before kick-off');

  const off = normalizeEvent(event('4', '770', 'post', { name: 'STATUS_POSTPONED' }), LEAGUES);
  assert.equal(off.state, 'off');
  assert.equal(off.detail, 'Postponed');

  const unknown = normalizeEvent(event('5', '99999', 'pre', { note: 'Copa Mundo, Group A' }), LEAGUES);
  assert.deepEqual(unknown.league, { slug: 'league-99999', name: 'Copa Mundo' });
});

test('groupScores puts marquee leagues first and live games first within a league', () => {
  const matches = [
    event('10', '5487', 'in', { detail: "12'" }), event('11', '5487', 'in', { detail: "30'" }),
    event('20', '770', 'post', { detail: 'FT' }), event('21', '770', 'in', { detail: "50'" }),
    event('22', '770', 'pre', { date: '2026-09-27T01:00Z' }), event('23', '770', 'pre', { date: '2026-09-26T20:00Z' }),
    event('30', '700', 'post', { detail: 'FT' })
  ].map(e => normalizeEvent(e, LEAGUES));
  const groups = groupScores(matches);
  assert.deepEqual(groups.map(g => g.slug), ['eng.1', 'usa.1', 'usa.ncaa.m.1'], 'priority beats live count');
  const mls = groups[1];
  assert.equal(mls.live, 1);
  assert.deepEqual(mls.matches.map(m => m.id), ['21', '23', '22', '20'], 'live, then upcoming by kick-off, then finished');
});

test('createWorldScores caches, coalesces requests and serves stale data when the feed fails', async () => {
  let clock = 1_000_000;
  let boardCalls = 0;
  let failBoard = false;
  let state = 'in';
  const fetchImpl = async url => {
    const json = body => ({ ok: true, json: async () => body });
    if (url.includes('/leagues?')) return json({ items: [{ $ref: 'http://core/leagues/usa.1' }] });
    if (url.startsWith('https://core/leagues/usa.1')) return json({ id: '770', slug: 'usa.1', name: 'MLS' });
    if (url.includes('/all/scoreboard')) {
      boardCalls++;
      if (failBoard) return { ok: false, status: 503 };
      return json({ events: [event('1', '770', state, { detail: "67'" })] });
    }
    throw new Error(`unexpected ${url}`);
  };
  const world = createWorldScores({ fetchImpl, now: () => clock, log: {} });

  const [a, b] = await Promise.all([world.scores(), world.scores()]);
  assert.equal(boardCalls, 1, 'concurrent requests share one fetch');
  assert.equal(a, b);
  assert.equal(a.live, 1);
  assert.equal(a.leagues[0].name, 'MLS');

  clock += 10_000;
  await world.scores();
  assert.equal(boardCalls, 1, 'fresh within the live TTL');
  clock += 15_000;
  state = 'post';
  const idle = await world.scores();
  assert.equal(boardCalls, 2, 'refetched after the live TTL');
  assert.equal(idle.live, 0);
  clock += 60_000;
  await world.scores();
  assert.equal(boardCalls, 2, 'longer TTL when nothing is live');

  clock += 200_000;
  failBoard = true;
  const stale = await world.scores();
  assert.equal(stale.stale, true, 'falls back to the last good board');
  assert.equal(stale.total, 1);
  await assert.rejects(world.scores('2026-09-25'), /503/, 'no stale copy for a new date');
});

// Trimmed from a real ESPN scoreboard entry (Albania at Finland, DraftKings), sportsbook links removed.
const DK = {
  overUnder: 2.5, provider: { id: '100', name: 'DraftKings', displayName: 'DraftKings' }, drawOdds: { moneyLine: 215 },
  total: { over: { open: { line: 'o2.5', odds: '+130' }, close: { line: 'o2.5', odds: '+135' } }, under: { open: { line: 'u2.5', odds: '-175' }, close: { line: 'u2.5', odds: '-170' } } },
  pointSpread: { home: { open: { line: '-0.5', odds: '+120' }, close: { line: '-0.5', odds: '+135' } }, away: { open: { line: '+0.5', odds: '-175' }, close: { line: '+0.5', odds: '-185' } } },
  moneyline: { home: { open: { odds: '+130' }, close: { odds: '+140' } }, away: { open: { odds: '+200' }, close: { odds: '+190' } }, draw: { open: { odds: '+215' }, close: { odds: '+215' } } },
  details: 'FIN +140',
  link: { href: 'https://sportsbook.draftkings.com/…' }
};

test('normalizeOdds keeps the lines and drops sportsbook links', () => {
  assert.deepEqual(normalizeOdds(DK), {
    provider: 'DraftKings',
    moneyline: { home: 140, draw: 215, away: 190 },
    open: { home: 130, draw: 215, away: 200 },
    total: { line: 2.5, over: 135, under: -170 },
    spread: { home: -0.5, homeOdds: 135, awayOdds: -185 }
  });
  assert.equal(JSON.stringify(normalizeOdds(DK)).includes('draftkings.com'), false);
  // Older shape: only per-team moneylines and a total.
  assert.deepEqual(normalizeOdds({ overUnder: 3, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 400 }, drawOdds: { moneyLine: 260 } }),
    { provider: null, moneyline: { home: -150, draw: 260, away: 400 }, open: null, total: { line: 3, over: null, under: null }, spread: null });
  assert.equal(normalizeOdds(null), null);
  assert.equal(normalizeOdds({ moneyline: { home: { close: { odds: 'OFF' } } } }), null, 'no usable prices');
});

test('events carry form and odds before and during play, not after', () => {
  const withOdds = (state, name) => {
    const e = event('7', '770', state, { name, detail: state === 'in' ? "12'" : 'FT' });
    e.competitions[0].odds = [DK];
    e.competitions[0].competitors[0].form = 'DWLLL';
    e.competitions[0].competitors[0].records = [{ type: 'total', summary: '1-1-0' }];
    e.competitions[0].competitors[1].form = 'bogus';
    return normalizeEvent(e, LEAGUES);
  };
  const pre = withOdds('pre');
  assert.equal(pre.odds.moneyline.home, 140);
  assert.deepEqual(pre.home.form, { form: 'DWLLL', record: '1-1-0' });
  assert.equal(pre.away.form, null, 'malformed form is dropped');
  assert.equal(withOdds('in', 'STATUS_FIRST_HALF').odds.total.line, 2.5);
  assert.equal(withOdds('post', 'STATUS_FULL_TIME').odds, null);
  assert.equal(withOdds('post', 'STATUS_POSTPONED').odds, null);
});

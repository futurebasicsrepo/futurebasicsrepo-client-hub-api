// World scores: pro and international football from ESPN's public scoreboard feed, fetched once
// server-side for every viewer and cached (short TTL while games are live).
//
// The feed is unofficial and undocumented. Everything provider-specific lives in this file, so a
// licensed provider can replace it by producing the same normalized shape.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const CORE = 'https://sports.core.api.espn.com/v2/sports/soccer';
const LIVE_TTL = 20_000;
const IDLE_TTL = 120_000;
const LEAGUE_TTL = 24 * 60 * 60 * 1000;

// Leagues fans most often look for come first; everything else follows by how many games are live.
export const PRIORITY = [
  'fifa.world', 'fifa.wwc', 'uefa.champions', 'uefa.europa', 'uefa.europa.conf', 'uefa.nations', 'conmebol.libertadores',
  'concacaf.champions', 'eng.1', 'esp.1', 'ger.1', 'ita.1', 'fra.1', 'usa.1', 'mex.1', 'usa.nwsl', 'eng.w.1',
  'ned.1', 'por.1', 'bra.1', 'arg.1', 'ksa.1', 'eng.2', 'eng.fa', 'esp.copa_del_rey', 'fifa.friendly', 'concacaf.nations.league',
  'caf.nations', 'caf.nations_qual', 'afc.asian.cup', 'conmebol.america', 'usa.usl.1'
];
const rank = slug => { const i = PRIORITY.indexOf(slug); return i === -1 ? PRIORITY.length : i; };

const STATE_ORDER = { in: 0, pre: 1, post: 2 };

// American odds ("+140", "-175", 215) → number, or null when missing or "OFF".
const american = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/^\+/, ''));
  return Number.isFinite(n) && n !== 0 && Math.abs(n) >= 100 ? n : null;
};
const line = value => {
  const n = Number(String(value ?? '').replace(/^[ou]/, ''));
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : n;
};

/**
 * The bookmaker's lines for a game (ESPN carries DraftKings'), trimmed to what a scorecard shows:
 * three-way moneyline (current and opening), the goals total, and the spread. Sportsbook links are dropped.
 */
export function normalizeOdds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const ml = raw.moneyline ?? {};
  const price = (side, when) => american(ml[side]?.[when]?.odds);
  const moneyline = {
    home: price('home', 'close') ?? american(raw.homeTeamOdds?.moneyLine),
    draw: price('draw', 'close') ?? american(raw.drawOdds?.moneyLine),
    away: price('away', 'close') ?? american(raw.awayTeamOdds?.moneyLine)
  };
  const open = { home: price('home', 'open'), draw: price('draw', 'open'), away: price('away', 'open') };
  const totalLine = line(raw.total?.over?.close?.line) ?? line(raw.overUnder);
  const total = totalLine === null ? null : {
    line: totalLine,
    over: american(raw.total?.over?.close?.odds),
    under: american(raw.total?.under?.close?.odds)
  };
  const spreadLine = line(raw.pointSpread?.home?.close?.line);
  const spread = spreadLine === null ? null : {
    home: spreadLine, homeOdds: american(raw.pointSpread?.home?.close?.odds), awayOdds: american(raw.pointSpread?.away?.close?.odds)
  };
  if (moneyline.home === null && moneyline.away === null && !total) return null;
  return {
    provider: raw.provider?.displayName || raw.provider?.name || null,
    moneyline,
    open: open.home === null && open.away === null ? null : open,
    total,
    spread
  };
}

// Last-five form ("WDLWW") and the season record ("W-D-L") where the feed has them.
const formOf = competitor => {
  const form = /^[WDL]{1,10}$/.test(competitor.form || '') ? competitor.form : null;
  const record = competitor.records?.find(r => r.type === 'total')?.summary ?? null;
  return form || record ? { form, record } : null;
};

export function normalizeEvent(event, leagues) {
  const comp = event.competitions?.[0] ?? {};
  const leagueId = /l:(\d+)/.exec(event.uid || '')?.[1];
  const league = leagues.get(leagueId) ?? { slug: `league-${leagueId ?? 'other'}`, name: comp.altGameNote?.split(',')[0] || 'Other competitions' };
  const type = event.status?.type ?? {};
  const side = homeAway => {
    const c = comp.competitors?.find(x => x.homeAway === homeAway) ?? {};
    return {
      name: c.team?.displayName ?? 'TBD',
      short: c.team?.shortDisplayName ?? c.team?.displayName ?? 'TBD',
      abbr: c.team?.abbreviation ?? '',
      score: type.state === 'pre' || c.score === undefined ? null : Number(c.score),
      winner: Boolean(c.winner),
      form: formOf(c)
    };
  };
  const postponed = /POSTPONED|CANCELED|SUSPENDED|ABANDONED/.test(type.name || '');
  return {
    id: String(event.id),
    league: { slug: league.slug, name: league.name },
    state: postponed ? 'off' : (type.state || 'pre'),
    // "67'", "45'+3'", "HT", "FT", "AET", "Postponed"…; kick-off time is formatted by the client.
    detail: postponed ? (type.description || 'Postponed') : type.state === 'pre' ? null : (type.shortDetail || type.detail || ''),
    kickoffAt: event.date,
    home: side('home'),
    away: side('away'),
    venue: comp.venue?.fullName ?? null,
    // Lines are shown before and during a game (as the pre-match line), not after it.
    odds: postponed || type.state === 'post' ? null : normalizeOdds(comp.odds?.[0])
  };
}

// Groups matches by competition: priority leagues first, then the busiest; live games lead each group.
export function groupScores(matches) {
  const groups = new Map();
  for (const match of matches) {
    if (!groups.has(match.league.slug)) groups.set(match.league.slug, { ...match.league, live: 0, matches: [] });
    const group = groups.get(match.league.slug);
    group.matches.push(match);
    if (match.state === 'in') group.live++;
  }
  const order = m => STATE_ORDER[m.state] ?? 3;
  for (const group of groups.values()) {
    group.matches.sort((a, b) => order(a) - order(b) || Date.parse(a.kickoffAt) - Date.parse(b.kickoffAt));
  }
  return [...groups.values()].sort((a, b) => rank(a.slug) - rank(b.slug) || b.live - a.live || b.matches.length - a.matches.length || a.name.localeCompare(b.name));
}

export function createWorldScores({ fetchImpl = globalThis.fetch, log = console, now = () => Date.now() } = {}) {
  const boards = new Map(); // dateKey -> { at, ttl, data }
  const inflight = new Map();
  let leagues = { at: 0, map: new Map() };
  let leaguesInflight = null;

  const getJson = async url => {
    const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return res.json();
  };

  // id → { slug, name }, refreshed daily. A failed refresh keeps the previous map.
  async function leagueMap() {
    if (now() - leagues.at < LEAGUE_TTL && leagues.map.size) return leagues.map;
    leaguesInflight ??= (async () => {
      try {
        const list = await getJson(`${CORE}/leagues?limit=500`);
        const refs = (list.items || []).map(item => item.$ref.replace(/^http:/, 'https:'));
        const map = new Map();
        let next = 0;
        const worker = async () => {
          while (next < refs.length) {
            const ref = refs[next++];
            try {
              const d = await getJson(ref);
              if (d.id) map.set(String(d.id), { slug: d.slug, name: d.name || d.abbreviation || d.slug });
            } catch { /* skip one league */ }
          }
        };
        await Promise.all(Array.from({ length: 10 }, worker));
        if (map.size) leagues = { at: now(), map };
      } catch (error) {
        log.warn?.({ err: error }, 'world scores: league list refresh failed');
      } finally {
        leaguesInflight = null;
      }
      return leagues.map;
    })();
    return leaguesInflight;
  }

  async function load(dateKey) {
    const [map, board] = await Promise.all([
      leagueMap(),
      getJson(`${BASE}/all/scoreboard?limit=1000${dateKey ? `&dates=${dateKey}` : ''}`)
    ]);
    const matches = (board.events || []).map(event => normalizeEvent(event, map));
    const live = matches.filter(m => m.state === 'in').length;
    return { updatedAt: new Date(now()).toISOString(), live, total: matches.length, leagues: groupScores(matches) };
  }

  return {
    // `date` is YYYY-MM-DD or undefined for "today". Serves stale data (flagged) if the provider is down.
    async scores(date) {
      const dateKey = date ? date.replaceAll('-', '') : '';
      const cached = boards.get(dateKey);
      if (cached && now() - cached.at < cached.ttl) return cached.data;
      if (!inflight.has(dateKey)) {
        inflight.set(dateKey, load(dateKey)
          .then(data => {
            boards.set(dateKey, { at: now(), ttl: data.live ? LIVE_TTL : IDLE_TTL, data });
            if (boards.size > 10) boards.delete(boards.keys().next().value);
            return data;
          })
          .finally(() => inflight.delete(dateKey)));
      }
      try {
        return await inflight.get(dateKey);
      } catch (error) {
        log.warn?.({ err: error }, 'world scores: fetch failed');
        if (cached) return { ...cached.data, stale: true };
        throw error;
      }
    }
  };
}

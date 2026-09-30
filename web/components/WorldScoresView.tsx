'use client';

import { useEffect, useMemo, useState } from 'react';
import type { WorldLeague } from '@/lib/api';
import { useWorldScores } from '@/lib/useWorldScores';
import WorldMatchRow from './WorldMatchRow';
import MatchesSwitch from './MatchesSwitch';

const FOLLOW_KEY = 'incha.followedLeagues';
const ODDS_KEY = 'incha.showOdds';
const localDay = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const DAYS = [{ offset: -1, label: 'Yesterday' }, { offset: 0, label: 'Today' }, { offset: 1, label: 'Tomorrow' }];

export default function WorldScoresView() {
  const [offset, setOffset] = useState(0);
  const [liveOnly, setLiveOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [followed, setFollowed] = useState<string[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // Odds are on by default; fans who don't bet can hide them (remembered on this device).
  const [showOdds, setShowOdds] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(ODDS_KEY) === 'off') setShowOdds(false); } catch { /* storage unavailable */ } }, []);
  const toggleOdds = () => setShowOdds(v => {
    try { localStorage.setItem(ODDS_KEY, v ? 'off' : 'on'); } catch { /* storage unavailable */ }
    return !v;
  });
  const { data, error } = useWorldScores(offset === 0 ? undefined : localDay(offset), offset === 0);

  // Followed leagues are a per-device convenience.
  useEffect(() => { try { setFollowed(JSON.parse(localStorage.getItem(FOLLOW_KEY) || '[]')); } catch { /* storage unavailable */ } }, []);
  const toggleFollow = (slug: string) => setFollowed(current => {
    const next = current.includes(slug) ? current.filter(s => s !== slug) : [...current, slug];
    try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
    return next;
  });

  const leagues = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const filtered: WorldLeague[] = [];
    for (const league of data.leagues) {
      const leagueHit = q && league.name.toLowerCase().includes(q);
      const matches = league.matches.filter(m =>
        (!liveOnly || m.state === 'in') &&
        (!q || leagueHit || m.home.name.toLowerCase().includes(q) || m.away.name.toLowerCase().includes(q)));
      if (matches.length) filtered.push({ ...league, matches });
    }
    return filtered.sort((a, b) => Number(followed.includes(b.slug)) - Number(followed.includes(a.slug)));
  }, [data, liveOnly, query, followed]);

  // Open by default: followed leagues, leagues with live games, and the top of the list.
  const isOpen = (league: WorldLeague, index: number) =>
    open[league.slug] ?? (!!query || liveOnly || followed.includes(league.slug) || league.live > 0 || index < 5);

  return (
    <div className="wrap world">
      <div className="world-head">
        <h1 className="display">Scores</h1>
        <MatchesSwitch active="world" />
      </div>

      <div className="world-controls">
        <div className="segmented" role="group" aria-label="Day">
          {DAYS.map(d => <button key={d.offset} aria-pressed={offset === d.offset} onClick={() => setOffset(d.offset)}>{d.label}</button>)}
        </div>
        {offset === 0 && (
          <button className={`chip live-chip${liveOnly ? ' active' : ''}`} aria-pressed={liveOnly} onClick={() => setLiveOnly(v => !v)}>
            <i aria-hidden="true" />Live{data ? ` · ${data.live}` : ''}
          </button>
        )}
        <button className={`chip${showOdds ? ' active' : ''}`} aria-pressed={showOdds} onClick={toggleOdds}>Odds</button>
        <input className="input world-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a team or league" aria-label="Find a team or league" />
      </div>

      {error && !data && <p className="error">{error}</p>}
      {data?.stale && <p className="hint">Showing the last scores we received; the feed is catching up.</p>}
      {!data && !error && <div className="stack">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>}
      {data && !leagues.length && (
        <div className="empty">
          <div className="display">{liveOnly ? 'Nothing live right now' : 'No matches found'}</div>
          <p>{liveOnly ? 'Check back at kick-off, or see today’s full schedule.' : 'Try another team, league or day.'}</p>
        </div>
      )}

      <div className="world-leagues">
        {leagues.map((league, i) => {
          const expanded = isOpen(league, i);
          const following = followed.includes(league.slug);
          return (
            <section key={league.slug} className="world-league">
              <header>
                <button className="world-league-title" aria-expanded={expanded} onClick={() => setOpen(o => ({ ...o, [league.slug]: !expanded }))}>
                  <span className="world-caret" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
                  <span className="world-league-name">{league.name}</span>
                  {league.live > 0 && <span className="world-live-count"><i aria-hidden="true" />{league.live} live</span>}
                  {!expanded && <span className="muted world-count">{league.matches.length}</span>}
                </button>
                <button className={`world-star${following ? ' on' : ''}`} onClick={() => toggleFollow(league.slug)} aria-pressed={following} aria-label={following ? `Unfollow ${league.name}` : `Follow ${league.name}`}>{following ? '★' : '☆'}</button>
              </header>
              {expanded && <div className="world-matches">{league.matches.map(m => <WorldMatchRow key={m.id} match={m} odds={showOdds} />)}</div>}
            </section>
          );
        })}
      </div>
      {showOdds && (
        <p className="hint world-credit odds-note">
          Odds are the bookmaker’s current prices (DraftKings via ESPN), shown for information only; they change quickly and may differ from your sportsbook.
          Trends are arithmetic on those prices and recent results, not predictions. 21+ where legal. Gambling problem? Call 1-800-GAMBLER.
        </p>
      )}
      <p className="hint world-credit">Pro and international scores via ESPN, updated every 20 seconds while games are live. Grassroots scores are kept by fans on incha.tv.</p>
    </div>
  );
}

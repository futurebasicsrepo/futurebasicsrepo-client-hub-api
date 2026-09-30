'use client';

import { useState } from 'react';
import type { WorldMatch } from '@/lib/api';
import { formatOdds, readOdds } from '@/lib/odds';

const kickoff = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function worldStatus(match: WorldMatch) {
  if (match.state === 'pre') return kickoff(match.kickoffAt);
  if (match.state === 'off') return match.detail === 'Postponed' ? 'PPD' : (match.detail || 'Off');
  return match.detail || (match.state === 'post' ? 'FT' : 'LIVE');
}

const pct = (p: number) => `${Math.round(p * 100)}%`;
const code = (team: WorldMatch['home']) => team.abbr || (team.short || team.name).slice(0, 3).toUpperCase();

/** Form as five little squares, oldest to newest as the feed gives them. */
function Form({ form }: { form: string }) {
  return <span className="wm-form" aria-label={`Form ${form}`}>{[...form].map((r, i) => <i key={i} className={r}>{r}</i>)}</span>;
}

/**
 * One pro/international fixture: status on the left, two team lines with scores. With `odds`, each team
 * line also shows its moneyline, and a tap opens the market read and form trends.
 */
export default function WorldMatchRow({ match, showLeague = false, odds = false }: { match: WorldMatch; showLeague?: boolean; odds?: boolean }) {
  const [open, setOpen] = useState(false);
  const done = match.state === 'post';
  const lines = odds ? match.odds : null;
  const side = (s: 'home' | 'away') => {
    const team = match[s];
    const other = match[s === 'home' ? 'away' : 'home'];
    const lost = done && other.winner && !team.winner;
    return (
      <div className={`wm-team${team.winner ? ' win' : ''}${lost ? ' lose' : ''}`}>
        <span className="wm-name">{team.name}</span>
        <span className="wm-score">{team.score ?? ''}</span>
        {lines && <span className="wm-price">{formatOdds(lines.moneyline[s])}</span>}
      </div>
    );
  };
  const read = lines && open ? readOdds(match) : null;
  return (
    <div className={`wm-row ${match.state}${lines ? ' has-odds' : ''}`}>
      <span className="wm-status">{match.state === 'in' && <i aria-hidden="true" />}{worldStatus(match)}</span>
      <div className="wm-teams">
        {showLeague && <span className="wm-league">{match.league.name}</span>}
        {side('home')}
        {side('away')}
        {lines && (
          <button className="wm-market" aria-expanded={open} onClick={() => setOpen(v => !v)}>
            <span>Draw {formatOdds(lines.moneyline.draw)}</span>
            {lines.total && <span>O/U {lines.total.line}</span>}
            {lines.spread && <span>Spread {lines.spread.home > 0 ? '+' : ''}{lines.spread.home}</span>}
            {match.state === 'in' && <span className="muted">pre-match</span>}
            <span className="wm-trends-toggle">{open ? 'Hide' : 'Trends'} {open ? '▴' : '▾'}</span>
          </button>
        )}
      </div>
      {read && (
        <div className="wm-read">
          {read.chances && (
            <div className="wm-chances" aria-label="Implied chances with the bookmaker’s margin removed">
              {(['home', 'draw', 'away'] as const).map(k => (
                <span key={k} className={`${k}${read.favorite === k ? ' fav' : ''}`} style={{ flexGrow: read.chances![k] }}>
                  <b>{pct(read.chances![k])}</b> {k === 'draw' ? 'Draw' : code(match[k])}
                </span>
              ))}
            </div>
          )}
          {(match.home.form?.form || match.away.form?.form) && (
            <div className="wm-forms">
              {(['home', 'away'] as const).map(k => match[k].form?.form && (
                <span key={k}><span className="muted">{code(match[k])}</span> <Form form={match[k].form!.form!} /></span>
              ))}
            </div>
          )}
          <ul className="wm-trend-list">{read.trends.map(t => <li key={t}>{t}</li>)}</ul>
          {lines?.total?.over != null && (
            <p className="wm-fine">Over {lines.total.line} {formatOdds(lines.total.over)} · Under {formatOdds(lines.total.under)}
              {lines.spread && <> · {code(match.home)} {lines.spread.home > 0 ? '+' : ''}{lines.spread.home} {formatOdds(lines.spread.homeOdds)}</>}
              {lines.provider && <> · via {lines.provider}</>}</p>
          )}
        </div>
      )}
    </div>
  );
}

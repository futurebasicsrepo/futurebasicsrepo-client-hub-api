// Betting lines, read for fans: no-vig probabilities, line movement, and form trends.
// Everything here is arithmetic on the bookmaker's prices and the teams' recent results — not tips.
import type { WorldMatch, WorldOdds } from './api';

type Side = 'home' | 'draw' | 'away';

/** "+140", "-170", "EVEN". */
export const formatOdds = (n: number | null | undefined) => (n == null ? '–' : n === 100 ? 'EVEN' : n > 0 ? `+${n}` : String(n));

/** The bookmaker's implied chance for American odds, before removing its margin. */
export const impliedProbability = (n: number) => (n > 0 ? 100 / (n + 100) : -n / (-n + 100));

/** Implied chances for a set of outcomes with the bookmaker's margin taken out, so they add up to 1. */
export function noVig<K extends string>(prices: Record<K, number | null>): Record<K, number> | null {
  const keys = Object.keys(prices) as K[];
  if (keys.some(k => prices[k] == null)) return null;
  const raw = keys.map(k => impliedProbability(prices[k] as number));
  const sum = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(keys.map((k, i) => [k, raw[i] / sum])) as Record<K, number>;
}

/** Points from a form string: 3 a win, 1 a draw. */
export const formPoints = (form: string) => [...form].reduce((pts, r) => pts + (r === 'W' ? 3 : r === 'D' ? 1 : 0), 0);
const tally = (form: string) => {
  const n = (r: string) => [...form].filter(x => x === r).length;
  return `${n('W')}W ${n('D')}D ${n('L')}L`;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export interface OddsRead {
  /** No-vig chances for home / draw / away. */
  chances: Record<Side, number> | null;
  favorite: Side | null;
  trends: string[];
}

/** Turns a game's lines and form into the handful of facts a bettor scans for. */
export function readOdds(match: Pick<WorldMatch, 'home' | 'away'> & { odds?: WorldOdds | null }): OddsRead {
  const odds = match.odds;
  const name = { home: match.home.short || match.home.name, away: match.away.short || match.away.name, draw: 'Draw' };
  const trends: string[] = [];
  const chances = odds ? noVig(odds.moneyline) : null;
  let favorite: Side | null = null;
  if (chances) {
    const [top, second] = (['home', 'draw', 'away'] as Side[]).sort((a, b) => chances[b] - chances[a]);
    favorite = top;
    if (top === 'draw' || chances[top] - chances[second] < 0.05) trends.push(`Market sees a toss-up (${name.home} ${pct(chances.home)}, draw ${pct(chances.draw)}, ${name.away} ${pct(chances.away)})`);
    else trends.push(`${name[top]} favored: ${pct(chances[top])} to win after the bookmaker’s margin`);
    // Line movement: which outcome has shortened most since the line opened.
    const opened = odds?.open ? noVig(odds.open) : null;
    if (opened) {
      const moves = (['home', 'draw', 'away'] as Side[]).map(s => ({ s, d: chances[s] - opened[s] })).sort((a, b) => b.d - a.d);
      if (moves[0].d >= 0.03) {
        trends.push(`Line moving toward ${moves[0].s === 'draw' ? 'the draw' : name[moves[0].s]}: ${pct(opened[moves[0].s])} at open → ${pct(chances[moves[0].s])} now`);
      }
    }
  }
  if (odds?.total) {
    const ou = odds.total.over != null && odds.total.under != null ? noVig({ over: odds.total.over, under: odds.total.under }) : null;
    if (ou && Math.abs(ou.over - 0.5) >= 0.03) trends.push(`Goals: market leans ${ou.over > 0.5 ? 'Over' : 'Under'} ${odds.total.line} (${pct(Math.max(ou.over, ou.under))})`);
    else trends.push(`Goals line ${odds.total.line}${ou ? ', close to a coin flip' : ''}`);
  }
  const homeForm = match.home.form?.form;
  const awayForm = match.away.form?.form;
  if (homeForm) trends.push(`${name.home} last ${homeForm.length}: ${tally(homeForm)}`);
  if (awayForm) trends.push(`${name.away} last ${awayForm.length}: ${tally(awayForm)}`);
  if (homeForm && awayForm && homeForm.length === awayForm.length) {
    const [h, a] = [formPoints(homeForm), formPoints(awayForm)];
    if (Math.abs(h - a) >= 5) {
      const better = h > a ? 'home' : 'away';
      trends.push(`${name[better]} in much better form: ${Math.max(h, a)} pts to ${Math.min(h, a)} from the last ${homeForm.length}`);
      // The interesting case: the market backs the side in worse form.
      if (favorite && favorite !== 'draw' && favorite !== better) trends.push(`Market favors ${name[favorite]} despite the weaker recent form`);
    }
  }
  return { chances, favorite, trends };
}

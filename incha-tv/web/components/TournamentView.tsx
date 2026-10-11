'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, SITE_URL, type BracketSlot, type PaymentStatus, type Team, type TournamentEntry, type TournamentView as View } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useNow } from '@/lib/useNow';
import { StatusPill } from './MatchCard';

export const cupDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const DECIDED: Record<string, string> = { penalties: 'pens', walkover: 'w/o', bye: 'bye' };

export const money = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

const PAY_LABEL: Record<PaymentStatus, string> = { unpaid: 'Fee due', pending: 'Paying…', paid: 'Paid', waived: 'Fee waived', refunded: 'Refunded' };
const PAY_CLASS: Record<PaymentStatus, string> = { unpaid: ' flare', pending: ' sky', paid: ' paid', waived: '', refunded: '' };

/** Payment state on an entry, with the right next step for whoever is looking. */
function EntryPayment({ entry, t, busy, pay, record }: {
  entry: TournamentEntry; t: View['tournament']; busy: boolean;
  pay: (entry: TournamentEntry) => void; record: (entry: TournamentEntry, status: PaymentStatus) => void;
}) {
  const p = entry.payment;
  if (!p) return null;
  const owed = p.status === 'unpaid' || p.status === 'pending' || p.status === 'refunded';
  return (
    <span className="cup-pay">
      <span className={`badge${PAY_CLASS[p.status]}`} title={p.note || undefined}>{PAY_LABEL[p.status]}{p.orderName ? ` · ${p.orderName}` : ''}</span>
      {entry.mine && owed && t.status === 'registration' && entry.status !== 'rejected' && (
        t.payOnline
          ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => pay(entry)}>{p.status === 'pending' ? 'Finish paying' : `Pay ${money(p.amountCents ?? t.entryFeeCents, t.currency)}`}</button>
          : !t.isOrganizer && <span className="hint">The organizer will collect the fee.</span>
      )}
      {t.isOrganizer && (
        <span className="cup-pay-admin">
          {owed && <button className="linkish" disabled={busy} onClick={() => record(entry, 'paid')}>Mark paid</button>}
          {owed && <button className="linkish" disabled={busy} onClick={() => record(entry, 'waived')}>Waive</button>}
          {p.status === 'paid' && <button className="linkish" disabled={busy} onClick={() => record(entry, 'refunded')}>Refunded</button>}
        </span>
      )}
    </span>
  );
}

/** One tie in the bracket: two team rows, the score, and the organizer's call on draws and walkovers. */
function Tie({ slot, organizer, decide }: { slot: BracketSlot; organizer: boolean; decide: (slot: BracketSlot, side: 'home' | 'away', note?: string) => void }) {
  const live = slot.match?.status === 'live';
  const now = useNow(live, 15_000);
  const [walkover, setWalkover] = useState(false);
  const row = (side: 'home' | 'away') => {
    const team: Team | null = slot[side];
    const score = slot.match && slot.match.period !== 'pre' ? (side === 'home' ? slot.match.homeScore : slot.match.awayScore) : null;
    return (
      <div className={`tie-team${slot.winner === side ? ' won' : slot.winner ? ' out' : ''}`}>
        <span>{team ? team.name : slot.bye ? <em className="muted">bye</em> : <em className="muted">TBD</em>}</span>
        {score != null && <strong>{score}</strong>}
      </div>
    );
  };
  const canWalkover = organizer && slot.home && slot.away && !slot.winner && (!slot.match || slot.match.period === 'pre');
  const body = (
    <>
      {row('home')}
      {row('away')}
      <div className="tie-foot">
        {slot.match && <StatusPill match={slot.match} now={now} />}
        {slot.decided && slot.decided !== 'score' && slot.decided !== 'bye' && <span className="mono muted">{DECIDED[slot.decided]}{slot.note ? ` · ${slot.note}` : ''}</span>}
      </div>
    </>
  );
  return (
    <div className={`tie${live ? ' live' : ''}${slot.awaitingDecision ? ' waiting' : ''}`}>
      {slot.match ? <Link href={`/m/${slot.match.id}`} className="tie-link">{body}</Link> : <div className="tie-link">{body}</div>}
      {organizer && slot.awaitingDecision && (
        <div className="tie-decide">
          <span className="hint">Level at full time. Who went through?</span>
          {(['home', 'away'] as const).map(side => (
            <button key={side} className="btn btn-sm" onClick={() => {
              const note = window.prompt(`${slot[side]!.name} win on penalties. Score (optional), e.g. 4–3`, '') ?? undefined;
              decide(slot, side, note ? `Penalties ${note}` : 'Penalties');
            }}>{slot[side]!.name}</button>
          ))}
        </div>
      )}
      {canWalkover && (walkover ? (
        <div className="tie-decide">
          <span className="hint">Walkover to:</span>
          {(['home', 'away'] as const).map(side => (
            <button key={side} className="btn btn-sm" onClick={() => window.confirm(`Send ${slot[side]!.name} through without playing?`) && decide(slot, side)}>{slot[side]!.name}</button>
          ))}
          <button className="linkish" onClick={() => setWalkover(false)}>Cancel</button>
        </div>
      ) : <button className="linkish tie-wo" onClick={() => setWalkover(true)}>Walkover…</button>)}
    </div>
  );
}

function Bracket({ data, decide }: { data: View; decide: (slot: BracketSlot, side: 'home' | 'away', note?: string) => void }) {
  if (!data.bracket) return null;
  return (
    <div className="bracket" role="list" aria-label="Bracket">
      {data.bracket.map(round => (
        <section key={round.round} className="bracket-round" role="listitem">
          <h3 className="mono muted">{round.name}</h3>
          <div className="bracket-ties">
            {round.slots.map(slot => <Tie key={slot.id} slot={slot} organizer={data.tournament.isOrganizer} decide={decide} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function TournamentView({ id }: { id: string }) {
  const { user, ready } = useAuth();
  const [data, setData] = useState<View | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [myTeams, setMyTeams] = useState<{ slug: string; name: string; players: number }[]>([]);
  const [teamName, setTeamName] = useState('');
  const [note, setNote] = useState('');
  const [shuffle, setShuffle] = useState(true);
  const [toast, setToast] = useState('');

  const load = useCallback(() => api<View>(`/v1/tournaments/${id}`).then(setData).catch(() => setMissing(true)), [id]);
  useEffect(() => { if (ready) load(); }, [ready, user, load]);
  useEffect(() => {
    if (!user) { setMyTeams([]); return; }
    api<{ teams: { slug: string; name: string; players: number }[] }>('/v1/me/teams').then(d => setMyTeams(d.teams)).catch(() => {});
  }, [user]);
  // Results arrive from the scorekeepers; keep the bracket fresh while it's being played.
  // While your own payment is going through, check more often: Shopify confirms it in the background.
  const paying = Boolean(data?.teams.some(e => e.mine && e.payment?.status === 'pending'));
  useEffect(() => {
    if (data?.tournament.status !== 'running' && !paying) return;
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, paying ? 8_000 : 20_000);
    return () => clearInterval(timer);
  }, [data?.tournament.status, paying, load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function act(path: string, method: string, body?: object, done?: string) {
    setBusy(true);
    setError('');
    try {
      setData(await api<View>(path, { method, body }));
      if (done) setToast(done);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (missing) return <div className="wrap"><div className="empty" style={{ marginTop: 48 }}><div className="display">No such tournament</div><Link href="/tournaments" className="btn">Browse tournaments</Link></div></div>;
  if (!data) return <div className="wrap"><div className="skeleton" style={{ height: 220, marginTop: 24 }} /></div>;

  const { tournament: t, teams } = data;
  const base = `/v1/tournaments/${t.id}`;
  const approved = teams.filter(e => e.status === 'approved');
  const pending = teams.filter(e => e.status === 'pending');
  const rejected = teams.filter(e => e.status === 'rejected');
  const entered = new Set(teams.map(e => e.slug));
  const open = t.status === 'registration';
  const full = t.counts.approved >= t.capacity;

  const fee = t.entryFeeCents > 0 ? money(t.entryFeeCents, t.currency) : '';
  async function register(event: React.FormEvent) {
    event.preventDefault();
    const done = fee ? `Entered. Pay ${fee} to lock your place.` : t.approval === 'auto' ? 'You’re in!' : 'Entered. The organizer will confirm.';
    if (await act(`${base}/teams`, 'POST', { name: teamName, note }, done)) {
      setTeamName('');
      setNote('');
      api<{ teams: typeof myTeams }>('/v1/me/teams').then(d => setMyTeams(d.teams)).catch(() => {});
    }
  }
  // Off to Shopify's checkout; the page picks up the payment when Shopify confirms it.
  async function pay(entry: TournamentEntry) {
    setBusy(true);
    setError('');
    try {
      const { url } = await api<{ url: string }>(`${base}/teams/${entry.slug}/checkout`, { method: 'POST' });
      window.location.href = url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  const record = (entry: TournamentEntry, status: PaymentStatus) => {
    const ask = { paid: `Record ${entry.name}’s fee as paid (cash, transfer…)?`, waived: `Let ${entry.name} in without paying?`, refunded: `Mark ${entry.name} refunded? Refund the order in Shopify too.` }[status as 'paid' | 'waived' | 'refunded'];
    if (ask && !window.confirm(ask)) return;
    act(`${base}/teams/${entry.slug}/payment`, 'POST', { status }, status === 'paid' ? 'Payment recorded' : undefined);
  };

  const url = `${SITE_URL}/tournaments/${t.id}`;
  const spots = Math.max(0, t.capacity - t.counts.approved);
  const invite = [
    `${t.name}: ${t.status === 'registration' ? 'sign-ups are open' : 'follow the bracket'} on incha.tv.`,
    `${cupDate(t.startsAt)}${t.venue ? ` at ${t.venue}` : ''}.`,
    t.status === 'registration' ? `${spots} of ${t.capacity} places left${fee ? `, ${fee} per team` : ''}.` : '',
    t.status === 'registration' ? `Enter your team: ${url}` : url
  ].filter(Boolean).join(' ');
  async function share() {
    if (typeof navigator.share === 'function') { navigator.share({ title: t.name, text: invite, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(invite); setToast('Invite copied'); } catch { window.prompt('Copy this invite', invite); }
  }
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setToast(done); } catch { window.prompt('Copy', text); }
  }
  const decide = (slot: BracketSlot, side: 'home' | 'away', why?: string) => act(`${base}/slots/${slot.id}/winner`, 'POST', { side, note: why });

  return (
    <div className="wrap cup-page">
      <section className="hero cup-hero">
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge${t.status === 'running' ? ' flare' : open ? ' sky' : ''}`}>{open ? 'Sign-ups open' : t.status === 'running' ? 'In progress' : 'Finished'}</span>
          {t.youth && <span className="badge sky">Youth · unlisted</span>}
          {!t.youth && t.visibility === 'unlisted' && <span className="badge">Unlisted</span>}
          {fee && <span className="badge">Entry {fee} / team</span>}
        </div>
        <h1 className="display">{t.name}</h1>
        <p className="cup-meta mono">{cupDate(t.startsAt)}{t.venue ? ` · ${t.venue}` : ''} · {t.halfLength}-min halves · knockout</p>
        {t.description && <p className="cup-desc">{t.description}</p>}
        {t.champion && (
          <div className="cup-champion">
            <span className="cup-trophy" aria-hidden="true">🏆</span>
            <div><span className="mono muted">Champions</span><Link href={`/t/${t.champion.slug}`} className="display">{t.champion.name}</Link></div>
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn btn-sm" onClick={share}>↗ Share</button>
          {t.organizer && <span className="muted" style={{ fontSize: 13 }}>Organized by <Link href={`/u/${t.organizer.handle}`}>@{t.organizer.handle}</Link></span>}
        </div>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {data.bracket && <Bracket data={data} decide={decide} />}

      {open && (
        <section className="cup-signup">
          <div className="row" style={{ alignItems: 'baseline' }}>
            <h2 className="display" style={{ fontSize: 28, margin: '24px 0 8px' }}>Teams</h2>
            <div className="spacer" />
            <span className="mono">{t.counts.approved}/{t.capacity}</span>
          </div>
          <div className="cup-fill big" aria-hidden="true"><i style={{ width: `${Math.min(100, (t.counts.approved / t.capacity) * 100)}%` }} /></div>

          {!user ? (
            <div className="panel" style={{ marginTop: 16 }}>
              <p style={{ marginTop: 0 }}>Managing a team? Sign in to enter it.</p>
              <Link href={`/login?next=/tournaments/${t.id}`} className="btn btn-primary">Sign in to register</Link>
            </div>
          ) : (
            <form className="panel stack cup-register" onSubmit={register} style={{ gap: 12, marginTop: 16 }}>
              <strong>Enter a team</strong>
              {full && t.approval === 'auto' ? <p className="muted" style={{ margin: 0 }}>The tournament is full.</p> : (
                <>
                  {myTeams.filter(m => !entered.has(m.slug)).length > 0 && (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                      {myTeams.filter(m => !entered.has(m.slug)).map(m => (
                        <button key={m.slug} type="button" className="chip" aria-pressed={teamName === m.name} onClick={() => setTeamName(m.name)}>{m.name}</button>
                      ))}
                    </div>
                  )}
                  <input className="input" value={teamName} onChange={e => setTeamName(e.target.value)} maxLength={60} placeholder="Team name" aria-label="Team name" required />
                  <input className="input" value={note} onChange={e => setNote(e.target.value)} maxLength={280} placeholder="Note for the organizer (contact, kit colour…)" aria-label="Note for the organizer" />
                  <span className="hint">A new name creates the team with you as its manager. Add your squad on the team page.
                    {fee && (t.payOnline ? ` Entry is ${fee}, paid securely through the incha shop after you enter.` : ` Entry is ${fee}; the organizer will tell you how to pay.`)}</span>
                  <button className="btn btn-primary" disabled={busy || !teamName.trim()}>{fee ? `Enter team · ${fee}` : t.approval === 'auto' ? 'Enter team' : 'Request a place'}</button>
                </>
              )}
            </form>
          )}

          <ul className="cup-entries">
            {approved.map(e => (
              <li key={e.slug}>
                <Link href={`/t/${e.slug}`}>{e.name}</Link>
                <span className="muted" style={{ fontSize: 13 }}>{e.players ? `${e.players} players` : 'no squad yet'}</span>
                {e.mine && <span className="badge sky">Yours</span>}
                <div className="spacer" />
                <EntryPayment entry={e} t={t} busy={busy} pay={pay} record={record} />
                {(t.isOrganizer || e.mine) && <button className="linkish" disabled={busy} onClick={() => window.confirm(`Take ${e.name} out of the tournament?`) && act(`${base}/teams/${e.slug}`, 'DELETE')}>{e.mine ? 'Withdraw' : 'Remove'}</button>}
                {t.isOrganizer && e.note && <p className="cup-note">“{e.note}”</p>}
              </li>
            ))}
            {!approved.length && <li className="muted">No teams in yet.</li>}
          </ul>

          {pending.length > 0 && (
            <>
              <h3 className="mono muted" style={{ marginTop: 20 }}>{fee ? 'Waiting for payment or approval' : 'Waiting for approval'}</h3>
              <ul className="cup-entries">
                {pending.map(e => (
                  <li key={e.slug}>
                    <Link href={`/t/${e.slug}`}>{e.name}</Link>
                    <span className="muted" style={{ fontSize: 13 }}>{e.players ? `${e.players} players` : 'no squad yet'}</span>
                    <div className="spacer" />
                    <EntryPayment entry={e} t={t} busy={busy} pay={pay} record={record} />
                    {t.isOrganizer ? (
                      <span className="cup-actions">
                        <button className="btn btn-sm btn-primary" disabled={busy || full || Boolean(e.payment && !['paid', 'waived'].includes(e.payment.status))} onClick={() => act(`${base}/teams/${e.slug}`, 'PATCH', { status: 'approved' })}>Approve</button>
                        <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => act(`${base}/teams/${e.slug}`, 'PATCH', { status: 'rejected' })}>Decline</button>
                      </span>
                    ) : e.mine && <button className="linkish" disabled={busy} onClick={() => act(`${base}/teams/${e.slug}`, 'DELETE')}>Withdraw</button>}
                    {e.note && <p className="cup-note">“{e.note}”</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
          {rejected.length > 0 && (
            <>
              <h3 className="mono muted" style={{ marginTop: 20 }}>Declined</h3>
              <ul className="cup-entries">
                {rejected.map(e => (
                  <li key={e.slug} className="muted">
                    {e.name}
                    <div className="spacer" />
                    {t.isOrganizer && <button className="linkish" disabled={busy} onClick={() => act(`${base}/teams/${e.slug}`, 'PATCH', { status: 'pending' })}>Reconsider</button>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {t.isOrganizer && (
            <div className="panel stack cup-invite" style={{ gap: 10, marginTop: 20 }}>
              <strong>Invite teams</strong>
              {fee && <p className="muted" style={{ margin: 0 }}>
                {t.payOnline ? `Teams pay ${fee} through the incha shop when they enter.` : `Entry is ${fee}. Online payment isn’t connected yet, so collect it yourself and tap “Mark paid”.`}
                {t.collectedCents ? ` Collected so far: ${money(t.collectedCents, t.currency)}.` : ''}
              </p>}
              <p className="cup-invite-text">{invite}</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-primary" onClick={() => copy(invite, 'Invite copied')}>Copy invite</button>
                <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(invite)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                <a className="btn btn-sm" href={`sms:?&body=${encodeURIComponent(invite)}`}>Text</a>
                <a className="btn btn-sm" href={`mailto:?subject=${encodeURIComponent(`Enter ${t.name}`)}&body=${encodeURIComponent(invite)}`}>Email</a>
                <button className="btn btn-sm btn-ghost" onClick={() => copy(url, 'Link copied')}>Copy link</button>
              </div>
            </div>
          )}

          {t.isOrganizer && (
            <div className="panel stack cup-draw" style={{ gap: 10, marginTop: 20 }}>
              <strong>Draw the bracket</strong>
              <p className="muted" style={{ margin: 0 }}>
                {t.counts.approved < 2 ? 'Approve at least two teams first.' : `Closes sign-ups and makes the first-round matches. ${t.counts.approved} teams${t.counts.approved & (t.counts.approved - 1) ? ', top seeds get byes' : ''}.`}
              </p>
              <label className="check">
                <input type="checkbox" checked={shuffle} onChange={e => setShuffle(e.target.checked)} />
                <span>Random draw <span className="muted">(off: seeded in the order teams entered)</span></span>
              </label>
              <button className="btn btn-primary" disabled={busy || t.counts.approved < 2}
                onClick={() => window.confirm('Close sign-ups and draw the bracket? This can’t be undone.') && act(`${base}/start`, 'POST', { shuffle }, 'Bracket drawn')}>
                Draw the bracket
              </button>
            </div>
          )}
        </section>
      )}

      {!open && approved.length > 0 && (
        <section style={{ paddingBottom: 48 }}>
          <h2 className="display" style={{ fontSize: 28, margin: '24px 0 8px' }}>Teams</h2>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {approved.map(e => <Link key={e.slug} href={`/t/${e.slug}`} className="chip">{e.seed ? <span className="mono muted">{e.seed}</span> : null} {e.name}</Link>)}
          </div>
          {t.isOrganizer && t.status === 'running' && <p className="hint" style={{ marginTop: 16 }}>You keep score in every tie. Add co-scorekeepers from each match page. Draws at full time wait for you to pick who won on penalties.</p>}
        </section>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

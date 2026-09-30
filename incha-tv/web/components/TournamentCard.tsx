import Link from 'next/link';
import type { Tournament } from '@/lib/api';

export const STATUS_TEXT: Record<Tournament['status'], string> = { registration: 'Registration open', in_progress: 'In progress', finished: 'Finished' };

export const dateText = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function TournamentCard({ tournament: t }: { tournament: Tournament }) {
  return (
    <Link href={`/tournaments/${t.id}`} className="tournament-card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="mono muted">{dateText(t.startsAt)}</span>
        <span className={`badge${t.status === 'registration' ? ' flare' : ''}`}>{STATUS_TEXT[t.status]}</span>
      </div>
      <h3 className="display">{t.name}</h3>
      <div className="row" style={{ gap: 8 }}>
        {t.champion ? <span>🏆 {t.champion.name}</span> : <span className="muted">{t.teamCount}/{t.teamLimit} teams</span>}
        {t.venue && <span className="muted" style={{ fontSize: 13 }}>· {t.venue}</span>}
        {t.youth && <span className="badge sky">Youth</span>}
      </div>
    </Link>
  );
}

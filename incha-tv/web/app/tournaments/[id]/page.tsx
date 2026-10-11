import type { Metadata } from 'next';
import { fetchPublicTournament, SITE_URL } from '@/lib/api';
import TournamentView from '@/components/TournamentView';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchPublicTournament(id);
  if (!data) return { title: 'Tournament', robots: { index: false } };
  const { tournament: t } = data;
  const fee = t.entryFeeCents ? ` · ${(t.entryFeeCents / 100).toLocaleString('en-US', { style: 'currency', currency: t.currency || 'USD' })} per team` : '';
  const state = t.champion ? `Won by ${t.champion.name}` : t.status === 'registration' ? `Sign-ups open · ${t.counts.approved}/${t.capacity} teams${fee}` : 'Knockout in progress';
  return {
    title: t.name,
    description: [state, t.venue, 'on incha.tv'].filter(Boolean).join(' · '),
    alternates: { canonical: `${SITE_URL}/tournaments/${t.id}` },
    robots: t.visibility === 'public' ? undefined : { index: false }
  };
}

export default async function TournamentPage({ params }: Params) {
  const { id } = await params;
  return <TournamentView id={id} />;
}

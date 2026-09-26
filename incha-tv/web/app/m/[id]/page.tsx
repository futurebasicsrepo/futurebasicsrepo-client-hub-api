import type { Metadata } from 'next';
import { fetchPublicMatch, SITE_URL } from '@/lib/api';
import MatchView from '@/components/MatchView';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const snap = await fetchPublicMatch(id);
  if (!snap) return { title: 'Match', robots: { index: false } };
  const { match } = snap;
  const score = match.period === 'pre' ? 'vs' : `${match.homeScore}–${match.awayScore}`;
  const state = { pre: 'Upcoming', '1h': 'LIVE', ht: 'Half time', '2h': 'LIVE', ft: 'Full time' }[match.period];
  const title = `${match.home.name} ${score} ${match.away.name} · ${state}`;
  const description = [match.competition, match.venue, 'Follow live on incha.tv'].filter(Boolean).join(' · ');
  const image = snap.clips.find(c => c.coverUrl && c.visibility === 'public')?.coverUrl ?? undefined;
  return {
    title,
    description,
    alternates: { canonical: `${SITE_URL}/m/${match.id}` },
    robots: match.visibility === 'public' && !match.youth ? undefined : { index: false },
    openGraph: { title, description, url: `${SITE_URL}/m/${match.id}`, images: image ? [image] : undefined },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description }
  };
}

export default async function MatchPage({ params }: Params) {
  const { id } = await params;
  return <MatchView id={id} />;
}

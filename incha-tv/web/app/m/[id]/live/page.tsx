import GoLive from '@/components/GoLive';

export const metadata = { title: 'Go live', robots: { index: false } };

export default async function GoLivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GoLive matchId={id} />;
}

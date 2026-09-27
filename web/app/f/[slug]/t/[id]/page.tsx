import ThreadView from '@/components/community/ThreadView';

export const metadata = { title: 'Thread' };

export default async function ThreadPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <ThreadView slug={slug} id={id} />;
}

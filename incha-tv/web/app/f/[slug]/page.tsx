import FandomView from '@/components/FandomView';

export default async function FandomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <FandomView slug={slug} />;
}

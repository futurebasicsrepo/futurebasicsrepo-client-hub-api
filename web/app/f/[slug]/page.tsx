import FandomView from '@/components/FandomView';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function FandomPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const channel = Array.isArray(query.c) ? query.c[0] : query.c;
  return <FandomView slug={slug} channel={channel} />;
}

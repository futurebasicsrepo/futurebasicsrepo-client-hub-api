import WatchFeed from '@/components/WatchFeed';

export const metadata = { title: 'Watch' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function WatchPage({ searchParams }: Props) {
  const query = await searchParams;
  return <WatchFeed sort={one(query.sort) ?? undefined} fandom={one(query.fandom)} startId={one(query.start)} />;
}

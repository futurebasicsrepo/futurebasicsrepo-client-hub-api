import Feed from '@/components/Feed';
import HomeScreen from '@/components/home/HomeScreen';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  if (q) return <div className="wrap"><Feed q={q} /></div>;
  return <HomeScreen />;
}

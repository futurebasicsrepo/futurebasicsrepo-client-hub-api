import GateForm from '@/components/GateForm';

export const metadata = { title: 'Private preview', robots: { index: false, follow: false } };

export default async function GatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = Array.isArray(query.next) ? query.next[0] : query.next;
  // Only same-site paths, so the gate can't be used to bounce people elsewhere.
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <GateForm next={safe} />;
}

import Link from 'next/link';

/** Toggle between fan-run grassroots matches, tournaments, and pro/international scores. */
export default function MatchesSwitch({ active }: { active: 'grassroots' | 'tournaments' | 'world' }) {
  return (
    <nav className="segmented matches-switch" aria-label="Match type">
      <Link href="/matches" aria-current={active === 'grassroots' ? 'page' : undefined}>Grassroots</Link>
      <Link href="/tournaments" aria-current={active === 'tournaments' ? 'page' : undefined}>Tournaments</Link>
      <Link href="/scores" aria-current={active === 'world' ? 'page' : undefined}>World</Link>
    </nav>
  );
}

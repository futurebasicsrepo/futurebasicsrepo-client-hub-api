import Link from 'next/link';

/** Toggle between fan-run grassroots matches and pro/international scores. */
export default function MatchesSwitch({ active }: { active: 'grassroots' | 'world' }) {
  return (
    <nav className="segmented matches-switch" aria-label="Match type">
      <Link href="/matches" aria-current={active === 'grassroots' ? 'page' : undefined}>Grassroots</Link>
      <Link href="/scores" aria-current={active === 'world' ? 'page' : undefined}>World</Link>
    </nav>
  );
}

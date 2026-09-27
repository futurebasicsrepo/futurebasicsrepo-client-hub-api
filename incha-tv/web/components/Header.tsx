'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Avatar from './Avatar';
import { SHOP_URL } from './TabBar';

export default function Header() {
  const { user, ready, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const current = (href: string) => (pathname === href ? 'page' : undefined);
  // The swipe feed and the go-live camera are full-screen.
  if (pathname?.startsWith('/watch') || /^\/m\/[^/]+\/live/.test(pathname || '')) return null;

  return (
    <header className="site-header">
      <div className="wrap">
        <Link href="/" className="logo" aria-label="incha.tv home">INCHA<span className="tv">.TV</span></Link>
        <nav className="nav hide-sm">
          <Link href="/" aria-current={current('/')} className="hide-sm">Feed</Link>
          <Link href="/watch" aria-current={current('/watch')}>Watch</Link>
          <Link href="/matches" aria-current={current('/matches')}>Matches</Link>
          <Link href="/scores" aria-current={current('/scores')}>Scores</Link>
          <Link href="/fandoms" aria-current={current('/fandoms')} className="hide-sm">Fandoms</Link>
          <a href={SHOP_URL} target="_blank" rel="noopener">Shop ↗</a>
          {user && <Link href={`/u/${user.handle}?tab=studio`} className="hide-sm">Studio</Link>}
        </nav>
        <form
          className="search"
          role="search"
          onSubmit={event => {
            event.preventDefault();
            const q = new FormData(event.currentTarget).get('q')?.toString().trim();
            router.push(q ? `/?q=${encodeURIComponent(q)}` : '/');
          }}
        >
          <input name="q" type="search" placeholder="Search clips, goals, tifos…" aria-label="Search" />
        </form>
        <div className="spacer" />
        {/* On phones the tab bar carries navigation, posting and the shop; the header keeps search and your profile. */}
        <Link href="/search" className="icon-btn show-sm" aria-label="Search">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </Link>
        {ready && (user ? (
          <div className="row header-actions">
            <Link href="/upload" className="btn btn-primary btn-sm hide-sm" aria-label="Upload">+ Upload</Link>
            <Link href={`/u/${user.handle}`} aria-label="Your profile"><Avatar name={user.displayName} size="sm" /></Link>
            <button className="linkish hide-sm" onClick={() => { signOut(); router.push('/'); }}>Sign out</button>
          </div>
        ) : (
          <div className="row header-actions">
            <Link href="/login" className="btn btn-ghost btn-sm hide-sm">Sign in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Join</Link>
          </div>
        ))}
      </div>
    </header>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import Avatar from './Avatar';

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
        <nav className="nav">
          <Link href="/" aria-current={current('/')} className="hide-sm">Feed</Link>
          <Link href="/watch" aria-current={current('/watch')}>Watch</Link>
          <Link href="/matches" aria-current={current('/matches')}>Matches</Link>
          <Link href="/fandoms" aria-current={current('/fandoms')} className="hide-sm">Fandoms</Link>
          {user && <Link href="/studio" aria-current={current('/studio')} className="hide-sm">Studio</Link>}
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
        {ready && (user ? (
          <div className="row header-actions">
            <Link href="/upload" className="btn btn-primary btn-sm" aria-label="Upload">+<span className="hide-sm"> Upload</span></Link>
            <Link href={`/u/${user.handle}`} aria-label="Your profile"><Avatar name={user.displayName} size="sm" /></Link>
            <button className="linkish hide-sm" onClick={() => { signOut(); router.push('/'); }}>Sign out</button>
          </div>
        ) : (
          <div className="row header-actions">
            <Link href="/login" className="btn btn-ghost btn-sm">Sign in</Link>
            <Link href="/signup" className="btn btn-primary btn-sm">Join</Link>
          </div>
        ))}
      </div>
    </header>
  );
}

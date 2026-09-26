'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const SHOP_URL = 'https://inchastudios.com/';

// Full-screen surfaces and screens with their own fixed bottom bar.
const HIDDEN = [/^\/watch/, /^\/m\/[^/]+\/live/, /^\/studio\/[^/]+/];

/** App-style bottom navigation on phones (hidden on larger screens via CSS). */
export default function TabBar() {
  const pathname = usePathname() || '/';
  if (HIDDEN.some(re => re.test(pathname))) return null;
  const on = (test: boolean) => (test ? 'page' : undefined);
  return (
    <nav className="tabbar" aria-label="Main">
      <Link href="/" aria-current={on(pathname === '/')}><Icon d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z" /><span>Home</span></Link>
      <Link href="/matches" aria-current={on(pathname.startsWith('/matches') || pathname.startsWith('/scores') || pathname.startsWith('/m/') || pathname.startsWith('/t/'))}>
        <Icon d="M3 6h18v12H3zM12 6v12M7.5 10v4M16.5 10v4" />
        <span>Matches</span>
      </Link>
      <Link href="/upload" className="tabbar-post" aria-label="Post a moment"><span>+</span></Link>
      <Link href="/watch" aria-current={on(pathname.startsWith('/watch'))}><Icon d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3.5 5v6l5-3z" /><span>Watch</span></Link>
      {/* The INCHA Studios shop opens in the browser, outside the app. */}
      <a href={SHOP_URL} target="_blank" rel="noopener"><Icon d="M5 8h14l-1.2 12H6.2zM9 8V7a3 3 0 0 1 6 0v1" /><span>Shop</span></a>
    </nav>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateOn, verifyGate } from '@/lib/gate';

// While the site is in private preview (GATE_EMAILS and/or GATE_HANDLES, plus GATE_SECRET), every page
// asks for sign-in at /gate first. Unset both lists to open the site to everyone.
export async function proxy(request: NextRequest) {
  if (!gateOn()) return NextResponse.next();
  if (await verifyGate(request.cookies.get(GATE_COOKIE)?.value)) {
    const res = NextResponse.next();
    res.headers.set('x-robots-tag', 'noindex, nofollow');
    return res;
  }
  const url = request.nextUrl.clone();
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = '/gate';
  url.search = next && next !== '/' ? `?next=${encodeURIComponent(next)}` : '';
  const res = NextResponse.redirect(url);
  res.headers.set('x-robots-tag', 'noindex, nofollow');
  return res;
}

export const config = {
  // Everything except the gate itself, its sign-in endpoint, and static assets the gate page needs.
  matcher: ['/((?!gate|api/gate|_next/|icons/|favicon|manifest|sw\\.js|robots\\.txt).*)']
};

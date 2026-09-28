import { NextResponse } from 'next/server';
import { API_URL } from '@/lib/api';
import { GATE_COOKIE, GATE_DAYS, gateIdentity, gateOn, signGate } from '@/lib/gate';

// Signs in against the API with the account's normal email/handle and password, and lets the
// person through only if that account's email (GATE_EMAILS) or handle (GATE_HANDLES) is on the list.
export async function POST(request: Request) {
  if (!gateOn()) return NextResponse.json({ ok: true, open: true });
  const body = await request.json().catch(() => ({}));
  const login = String(body.login || '').trim();
  const password = String(body.password || '');
  if (!login || !password) return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 });
  const res = await fetch(`${API_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? '' },
    body: JSON.stringify({ login, password }),
    cache: 'no-store'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: data.error || 'Wrong email or password.' }, { status: res.status === 429 ? 429 : 401 });
  const identity = gateIdentity(data.user ?? {});
  if (!identity) {
    return NextResponse.json({ error: 'incha.tv is in private preview. This account isn’t on the list yet.' }, { status: 403 });
  }
  const out = NextResponse.json({ ok: true, token: data.token, user: data.user });
  out.cookies.set(GATE_COOKIE, await signGate(identity), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: GATE_DAYS * 86_400
  });
  return out;
}

export async function DELETE() {
  const out = NextResponse.json({ ok: true });
  out.cookies.delete(GATE_COOKIE);
  return out;
}

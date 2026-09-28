// Private preview gate: while GATE_EMAILS and/or GATE_HANDLES are set, the site only opens for those accounts.
// A signed cookie (HMAC-SHA256 over "email|expiry") proves who passed the gate; the proxy checks it
// on every page request. Web Crypto only, so it runs in the proxy as well as in route handlers.

export const GATE_COOKIE = 'incha_gate';
export const GATE_DAYS = 30;

const list = (value: string | undefined) => (value || '').split(',').map(e => e.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
export const gateEmails = () => list(process.env.GATE_EMAILS);
export const gateHandles = () => list(process.env.GATE_HANDLES);
export const gateOn = () => (gateEmails().length > 0 || gateHandles().length > 0) && Boolean(process.env.GATE_SECRET);

/** Who the gate lets in: an account whose email or handle is on the list. The cookie records which. */
export function gateIdentity(user: { email?: string; handle?: string }) {
  const email = String(user.email || '').toLowerCase();
  const handle = String(user.handle || '').toLowerCase();
  if (email && gateEmails().includes(email)) return email;
  if (handle && gateHandles().includes(handle)) return `@${handle}`;
  return null;
}
const allowed = (identity: string) =>
  identity.startsWith('@') ? gateHandles().includes(identity.slice(1)) : gateEmails().includes(identity);

const encoder = new TextEncoder();
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(process.env.GATE_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function signGate(identity: string, now = Date.now()) {
  const payload = `${identity.toLowerCase()}|${now + GATE_DAYS * 86_400_000}`;
  return `${b64url(encoder.encode(payload))}.${await hmac(payload)}`;
}

/** Who a gate cookie was issued to (an email, or @handle), if it's genuine, unexpired and still on the list. */
export async function verifyGate(cookie: string | undefined, now = Date.now()) {
  if (!cookie) return null;
  const [data, sig] = cookie.split('.');
  if (!data || !sig) return null;
  let payload: string;
  try { payload = atob(data.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const expected = await hmac(payload);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i); // constant time
  if (diff) return null;
  const [identity, exp] = payload.split('|');
  if (!identity || !(Number(exp) > now) || !allowed(identity)) return null;
  return identity;
}

// Private preview gate: while GATE_EMAILS is set, the site only opens for those accounts.
// A signed cookie (HMAC-SHA256 over "email|expiry") proves who passed the gate; the proxy checks it
// on every page request. Web Crypto only, so it runs in the proxy as well as in route handlers.

export const GATE_COOKIE = 'incha_gate';
export const GATE_DAYS = 30;

export const gateEmails = () =>
  (process.env.GATE_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
export const gateOn = () => gateEmails().length > 0 && Boolean(process.env.GATE_SECRET);

const encoder = new TextEncoder();
const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(value: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(process.env.GATE_SECRET || ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

export async function signGate(email: string, now = Date.now()) {
  const payload = `${email.toLowerCase()}|${now + GATE_DAYS * 86_400_000}`;
  return `${b64url(encoder.encode(payload))}.${await hmac(payload)}`;
}

/** The email a gate cookie was issued to, if it's genuine, unexpired and still on the list. */
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
  const [email, exp] = payload.split('|');
  if (!email || !(Number(exp) > now) || !gateEmails().includes(email)) return null;
  return email;
}

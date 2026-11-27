// The captcha on the website's project brief form (POST /v1/public/intakes): Cloudflare Turnstile.
// It is on once both keys are set on the server: TURNSTILE_SITE_KEY (public; the form reads it from GET /v1/public/intake-config and
// shows the widget) and TURNSTILE_SECRET_KEY (private; used here to check each answer with Cloudflare). With either key missing the form
// shows no widget and nothing is checked, so the two always switch on together. The screening in src/intake-screen.js still runs after it.
// If Cloudflare cannot be reached the brief goes through to the screening rather than turning a real person away.
import { trackedFetch } from './telemetry.js';

export const CAPTCHA_FIELD = 'cf-turnstile-response';
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const CAPTCHA_WORDS = 'Please complete the security check above the button, then send your brief again.';

export function captchaConfig(env = process.env) {
  const siteKey = String(env.TURNSTILE_SITE_KEY || '').trim(), secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  return siteKey && secret ? { on: true, provider: 'turnstile', siteKey, secret } : { on: false };
}

// token: the form's cf-turnstile-response field. → { ok, error?, unchecked? }
export async function checkCaptcha(token, ip, { env = process.env, fetchImpl = (url, opts) => trackedFetch('turnstile', url, opts), log = null } = {}) {
  const cfg = captchaConfig(env);
  if (!cfg.on) return { ok: true, unchecked: true };
  const answer = String(token || '').trim();
  if (!answer || answer.length > 2048) return { ok: false, error: CAPTCHA_WORDS };
  const body = new URLSearchParams({ secret: cfg.secret, response: answer });
  if (ip) body.set('remoteip', String(ip));
  try {
    const res = await fetchImpl(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const out = await res.json();
    if (out?.success) return { ok: true };
    return { ok: false, error: CAPTCHA_WORDS, codes: out?.['error-codes'] || [] };
  } catch (e) {
    log?.warn?.({ err: e?.message || String(e) }, 'Turnstile could not be reached; the brief goes to the screening unchecked');
    return { ok: true, unchecked: true };
  }
}

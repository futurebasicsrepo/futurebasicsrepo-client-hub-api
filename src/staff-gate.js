// Staff network gate: staff tools answer only to requests that came through Cloudflare Access in front of the work console.
// Cloudflare signs every request it lets through with a short-lived JWT in the Cf-Access-Jwt-Assertion header; a request that
// reached Railway any other way (the hub domain, the *.up.railway.app address) has none, so a staff session alone is not enough.
// Client sessions are never touched: the hub and the storefronts stay public.
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const ACCESS_HEADER = 'cf-access-jwt-assertion';

// "futurebasics", "futurebasics.cloudflareaccess.com" and "https://futurebasics.cloudflareaccess.com/" all name the same team.
export function accessIssuer(team) {
  const host = String(team || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!host) return '';
  return `https://${host.includes('.') ? host : `${host}.cloudflareaccess.com`}`;
}

export function staffGateConfig(env = process.env) {
  const issuer = accessIssuer(env.CF_ACCESS_TEAM_DOMAIN), audience = String(env.CF_ACCESS_AUD || '').trim();
  const mode = String(env.CF_ACCESS_MODE || 'enforce').trim().toLowerCase() === 'log' ? 'log' : 'enforce';
  return { issuer, audience, mode, configured: Boolean(issuer && audience), partial: Boolean(issuer) !== Boolean(audience) };
}

// Returns null when the gate is not set up, so staff tools keep working exactly as before until both values are in place.
export function createStaffGate(env = process.env, { jwks, log = console } = {}) {
  const cfg = staffGateConfig(env);
  if (!cfg.configured) return null;
  const keys = jwks || createRemoteJWKSet(new URL(`${cfg.issuer}/cdn-cgi/access/certs`));
  const lastLogged = new Map();
  return {
    mode: cfg.mode,
    issuer: cfg.issuer,
    async check(req) {
      const assertion = req.headers?.[ACCESS_HEADER];
      if (!assertion) return { ok: false, reason: 'missing' };
      try {
        const { payload } = await jwtVerify(String(assertion), keys, { issuer: cfg.issuer, audience: cfg.audience });
        return { ok: true, email: payload.email || null };
      } catch (e) { return { ok: false, reason: e?.code === 'ERR_JWT_EXPIRED' ? 'expired' : 'invalid' }; }
    },
    // In log mode nothing is refused; each kind of miss is reported at most once a minute so a busy console does not flood the logs.
    report(req, reason) {
      const now = Date.now();
      if (now - (lastLogged.get(reason) || 0) < 60_000) return;
      lastLogged.set(reason, now);
      (req.log || log).warn?.({ staffGate: reason, path: req.routeOptions?.url || req.url, host: req.headers?.host }, 'staff request did not come through Cloudflare Access');
    }
  };
}

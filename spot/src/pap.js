// Personal Agent Protocol (PAP, draft 0.1 "Poppy", personalagentprotocol.org):
// lets any PAP personal agent find Spot, start a session and sign its person in.
//
//   GET /.well-known/poppy.json   → who Spot is, where to sign in, and the MCP API
//
// mcpauth.js does the OAuth parts. PAP agents are identified by an https
// client_id that serves their metadata (OAuth Client ID Metadata Document) and
// authenticate with private_key_jwt. A session starts with the JWT bearer grant
// (RFC 7523): a guest session can already ask a person to pay; signing in
// (authorization code + PKCE, the same consent page as Claude and ChatGPT)
// moves the session onto the person's account and their rules. Spot only
// offers an MCP API, so tokens are Bearer, as PAP allows for MCP.
import { createHash, createPublicKey, verify } from 'node:crypto';
import { assertPublicHost } from './capture.js';

export const PAP_VERSION = '0.1';
export const PAP_SCOPES = ['poppy:read', 'poppy:write'];
export const JWT_BEARER = 'urn:ietf:params:oauth:grant-type:jwt-bearer';
export const CLIENT_ASSERTION = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';
// Spot's own extension: who approved or paid, as a signed record.
export const APPROVALS_EXT = 'spotmeplease.com/approvals';

const ALGS = { ES256: 'sha256', ES384: 'sha384', EdDSA: null, RS256: 'sha256', PS256: 'sha256' };
const MAX_LIFE = 300; // seconds an assertion may live
const SKEW = 60;
const CACHE_MS = 10 * 60_000;
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');

export class PapError extends Error {}

export const domainOf = (origin) => new URL(origin).hostname.toLowerCase().replace(/^www\./, '');

// A PAP agent's client_id: an https URL with a path, no fragment or credentials.
export function isUrlClient(id) {
  if (typeof id !== 'string' || !id.startsWith('https://') || id.length > 500) return false;
  try {
    const u = new URL(id);
    return !u.hash && !u.username && !u.password && u.pathname.length > 1;
  } catch {
    return false;
  }
}

export function poppyJson(origin) {
  return {
    protocol_version: PAP_VERSION,
    organization: { name: 'Spot', domain: domainOf(origin) },
    auth: {
      issuer: origin,
      direct: { scopes: PAP_SCOPES },
    },
    apis: [
      {
        type: 'mcp',
        url: `${origin}/mcp`,
        resource: `${origin}/mcp`,
        description: 'Ask a person to approve or pay for what the agent picked (store carts, flights, trains), then track the ask and get a signed record of who said yes. Guests can send asks; signing in applies the person’s own rules, approver and saved card.',
      },
    ],
    extensions: {
      [APPROVALS_EXT]: { version: '1', keys: `${origin}/.well-known/spot-keys.json`, docs: `${origin}/integrations#trust` },
    },
  };
}

// GET a small JSON document from a public https host.
async function safeFetchJson(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new PapError('Must be https');
  await assertPublicHost(u.hostname).catch(() => {
    throw new PapError(`Can’t reach ${u.hostname}`);
  });
  const res = await fetch(u, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new PapError(`${u.hostname} answered ${res.status}`);
  const chunks = [];
  let size = 0;
  for await (const c of res.body || []) {
    size += c.length;
    if (size > 64 * 1024) throw new PapError('Document too large');
    chunks.push(Buffer.from(c));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Same domain: the same host, or one a subdomain of the other.
const sameHost = (a, b) => {
  try {
    const x = new URL(a).hostname;
    const y = new URL(b).hostname;
    return x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`);
  } catch {
    return false;
  }
};

function decode(jwt) {
  const parts = typeof jwt === 'string' ? jwt.split('.') : [];
  if (parts.length !== 3) throw new PapError('Not a JWT');
  try {
    return { header: JSON.parse(Buffer.from(parts[0], 'base64url')), payload: JSON.parse(Buffer.from(parts[1], 'base64url')), data: Buffer.from(`${parts[0]}.${parts[1]}`), sig: Buffer.from(parts[2], 'base64url') };
  } catch {
    throw new PapError('Not a JWT');
  }
}

export function createPap({ db, fetchJson = safeFetchJson, now = () => Date.now() }) {
  const cache = new Map();

  // The agent's metadata and keys, checked the way PAP says.
  async function client(clientId) {
    if (!isUrlClient(clientId)) throw new PapError('client_id must be an https URL');
    const hit = cache.get(clientId);
    if (hit && hit.until > now()) return hit.client;
    const doc = await fetchJson(clientId);
    if (!doc || doc.client_id !== clientId) throw new PapError('Metadata client_id doesn’t match its URL');
    if (doc.token_endpoint_auth_method && doc.token_endpoint_auth_method !== 'private_key_jwt') throw new PapError('Only private_key_jwt');
    const redirects = Array.isArray(doc.redirect_uris) ? doc.redirect_uris.map(String).slice(0, 10) : [];
    if (!redirects.every((r) => r.startsWith('https://') && sameHost(r, clientId))) throw new PapError('redirect_uris must be https on the client’s domain');
    let jwks = doc.jwks;
    if (doc.jwks_uri) {
      if (!sameHost(doc.jwks_uri, clientId)) throw new PapError('jwks_uri must be on the client’s domain');
      jwks = await fetchJson(doc.jwks_uri);
    }
    const keys = Array.isArray(jwks?.keys) ? jwks.keys.filter((k) => k && typeof k === 'object').slice(0, 20) : [];
    if (!keys.length) throw new PapError('No signing keys');
    const out = {
      client_id: clientId,
      client_name: String(doc.client_name || '').slice(0, 100) || new URL(clientId).hostname,
      logo_uri: typeof doc.logo_uri === 'string' ? doc.logo_uri : null,
      redirect_uris: redirects,
      keys,
      pap: true,
    };
    cache.set(clientId, { client: out, until: now() + CACHE_MS });
    if (cache.size > 500) for (const [k, v] of cache) if (v.until < now()) cache.delete(k);
    return out;
  }

  // A JWT the agent signed with one of its keys, short-lived and used once.
  function verifyJwt(jwt, keys, { iss, aud, sub }) {
    const { header, payload, data, sig } = decode(jwt);
    if (!(header.alg in ALGS)) throw new PapError(`Unsupported alg ${header.alg}`);
    const candidates = keys.filter((k) => (header.kid ? k.kid === header.kid : true) && (!k.alg || k.alg === header.alg) && (!k.use || k.use === 'sig'));
    const ok = candidates.some((jwk) => {
      try {
        const key = createPublicKey({ key: jwk, format: 'jwk' });
        const opts = header.alg.startsWith('ES') ? { key, dsaEncoding: 'ieee-p1363' } : header.alg === 'PS256' ? { key, padding: 6, saltLength: 32 } : key;
        return verify(ALGS[header.alg], data, opts, sig);
      } catch {
        return false;
      }
    });
    if (!ok) throw new PapError('Bad signature');
    const t = Math.floor(now() / 1000);
    if (payload.iss !== iss) throw new PapError('Wrong iss');
    if (sub !== undefined && payload.sub !== sub) throw new PapError('Wrong sub');
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.some((a) => aud.includes(a))) throw new PapError('Wrong aud');
    if (typeof payload.exp !== 'number' || payload.exp < t - SKEW) throw new PapError('Expired');
    if (payload.exp - t > MAX_LIFE) throw new PapError('Lives too long');
    if (typeof payload.iat === 'number' && payload.iat > t + SKEW) throw new PapError('Issued in the future');
    if (typeof payload.jti !== 'string' || payload.jti.length < 16 || payload.jti.length > 200) throw new PapError('Needs a random jti');
    const k = `pap_jti:${sha(`${iss}\n${payload.jti}`)}`;
    if (db.state.get(k)) throw new PapError('jti already used');
    db.state.set(k, { exp: payload.exp });
    return payload;
  }

  return { client, verifyJwt };
}

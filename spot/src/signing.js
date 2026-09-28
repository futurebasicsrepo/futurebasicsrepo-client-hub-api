// Spot's signatures: proof that something really came from Spot.
//
//  approvals  When a person approves a purchase (pays, or taps Place order),
//             Spot issues a signed approval: a JWS (EdDSA) over what exactly
//             was approved: store, items, amount, who, when, which AI asked.
//             Anyone can check it against /.well-known/spot-keys.json.
//  requests   Spot signs its requests to stores (UCP calls, product pages)
//             with HTTP Message Signatures (RFC 9421), the way the Web Bot
//             Auth drafts describe, so a store can tell Spot from other bots.
//             Keys are served at /.well-known/http-message-signatures-directory.
//
// Two Ed25519 keys, made once and kept in the database (settings), or set by
// SPOT_APPROVAL_KEY / SPOT_REQUEST_KEY (PKCS#8 PEM) to pin them.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as edSign, verify as edVerify } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function loadKey(db, env, name, envVar) {
  let pem = env[envVar];
  if (!pem) {
    pem = db.setting(`signing_key_${name}`, () => generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }
  const privateKey = createPrivateKey(pem);
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  // RFC 7638 thumbprint: the key's id everywhere.
  const kid = b64u(createHash('sha256').update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x })).digest());
  return { privateKey, jwk: { kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid, alg: 'EdDSA', use: 'sig' }, kid };
}

export function createSigning({ db, env = process.env, origin }) {
  const approvalKey = loadKey(db, env, 'approvals', 'SPOT_APPROVAL_KEY');
  const requestKey = loadKey(db, env, 'requests', 'SPOT_REQUEST_KEY');

  // Compact JWS, EdDSA.
  function jws(payload, typ) {
    const header = b64u(JSON.stringify({ alg: 'EdDSA', kid: approvalKey.kid, typ }));
    const body = b64u(JSON.stringify(payload));
    const sig = edSign(null, Buffer.from(`${header}.${body}`), approvalKey.privateKey);
    return `${header}.${body}.${b64u(sig)}`;
  }

  // RFC 9421 signature over @authority and signature-agent, tagged web-bot-auth.
  function signRequest(url, { now = Date.now(), tag = 'web-bot-auth' } = {}) {
    const u = new URL(url);
    const agent = `"${origin()}"`;
    const created = Math.floor(now / 1000);
    const params = `("@authority" "signature-agent");created=${created};expires=${created + 300};keyid="${requestKey.kid}";alg="ed25519";nonce="${randomBytes(16).toString('base64url')}";tag="${tag}"`;
    const base = `"@authority": ${u.host}\n"signature-agent": ${agent}\n"@signature-params": ${params}`;
    const sig = edSign(null, Buffer.from(base), requestKey.privateKey).toString('base64');
    return { 'signature-agent': agent, 'signature-input': `sig1=${params}`, signature: `sig1=:${sig}:` };
  }

  return {
    approvalKeys: () => ({ keys: [approvalKey.jwk] }),
    requestKeys: () => ({ keys: [{ ...requestKey.jwk, alg: undefined, use: undefined }] }),
    signApproval: (payload) => jws(payload, 'spot-approval+jwt'),
    signRequest,
    // The directory response itself is signed, so it can't be spoofed.
    signDirectory: (url) => signRequest(url, { tag: 'http-message-signatures-directory' }),
  };
}

// Check a Spot approval (also what a store or agent would do).
export function verifyApproval(token, jwks) {
  const [h, p, s] = String(token).split('.');
  if (!h || !p || !s) return null;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'EdDSA') return null;
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
  if (!edVerify(null, Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return null;
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}

// Check an RFC 9421 request signature made by signRequest (for tests, and
// for stores that want a reference implementation).
export function verifyRequest(headers, host, jwks) {
  const input = /^sig1=(.+)$/.exec(headers['signature-input'] || '')?.[1];
  const sig = /^sig1=:([^:]+):$/.exec(headers.signature || '')?.[1];
  if (!input || !sig) return false;
  const kid = /keyid="([^"]+)"/.exec(input)?.[1];
  const expires = Number(/expires=(\d+)/.exec(input)?.[1]);
  if (!expires || expires * 1000 < Date.now()) return false;
  const jwk = (jwks.keys || []).find((k) => k.kid === kid);
  if (!jwk) return false;
  const base = `"@authority": ${host}\n"signature-agent": ${headers['signature-agent']}\n"@signature-params": ${input}`;
  const key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: jwk.x }, format: 'jwk' });
  return edVerify(null, Buffer.from(base), key, Buffer.from(sig, 'base64'));
}

// Passkeys: sign in with Face ID, Touch ID, Windows Hello or a security key.
//
//   POST /v1/me/passkeys/options    → registration options (signed in)
//   POST /v1/me/passkeys            { challenge_id, response, name } → saves it
//   POST /v1/me/passkeys/:id/remove
//   POST /v1/auth/passkey/options   → sign-in options (discoverable, no email needed)
//   POST /v1/auth/passkey/verify    { challenge_id, response } → session
//
// Verification is SimpleWebAuthn's. Passkeys are bound to the site's domain,
// so ones made on the Railway address won't work on spotmeplease.com.
// Challenges are single use and expire after 5 minutes.
import { randomBytes } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { CartError } from './cart.js';
import { sessionUserId, startSession } from './accounts.js';

const b64 = (u8) => Buffer.from(u8).toString('base64url');
const unb64 = (s) => new Uint8Array(Buffer.from(String(s), 'base64url'));

export function registerPasskeys(app, { db, urlFor }) {
  const where = (req) => {
    const origin = urlFor(req, '');
    return { origin, rpID: new URL(origin).hostname };
  };
  const json = (req) => {
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new CartError('JSON only', 415);
  };
  const me = (req) => {
    const id = sessionUserId(db, req);
    const user = id && db.users.byId(id);
    if (!user) throw new CartError('Sign in first', 401);
    return user;
  };

  app.post('/v1/me/passkeys/options', async (req) => {
    json(req);
    const user = me(req);
    const { rpID } = where(req);
    const options = await generateRegistrationOptions({
      rpName: 'Spot',
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email || user.phone || 'Spot account',
      userDisplayName: user.name || user.email || user.phone || 'Spot',
      attestationType: 'none',
      excludeCredentials: db.passkeys.ofUser(user.id).map((p) => ({ id: p.id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = b64(randomBytes(16));
    db.challenges.put(challengeId, options.challenge, user.id);
    return { challenge_id: challengeId, options };
  });

  app.post('/v1/me/passkeys', async (req) => {
    json(req);
    const user = me(req);
    const ch = db.challenges.take(String(req.body?.challenge_id || ''));
    if (!ch || ch.user_id !== user.id) throw new CartError('That took too long. Try again.', 400);
    const { origin, rpID } = where(req);
    let result;
    try {
      result = await verifyRegistrationResponse({ response: req.body?.response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
    } catch (err) {
      throw new CartError(`That passkey didn’t work: ${err.message}`, 400);
    }
    if (!result.verified) throw new CartError('That passkey didn’t work. Try again.', 400);
    const c = result.registrationInfo.credential;
    if (db.passkeys.get(c.id)) throw new CartError('That passkey is already saved', 409);
    db.passkeys.add({ id: c.id, user_id: user.id, public_key: b64(c.publicKey), counter: c.counter, transports: JSON.stringify(c.transports || req.body?.response?.response?.transports || []), name: String(req.body?.name || 'Passkey').slice(0, 40) });
    return { passkeys: db.passkeys.ofUser(user.id) };
  });

  app.post('/v1/me/passkeys/:id/remove', async (req) => {
    json(req);
    const user = me(req);
    if (!db.passkeys.remove(user.id, req.params.id)) throw new CartError('No passkey with that id', 404);
    return { passkeys: db.passkeys.ofUser(user.id) };
  });

  app.post('/v1/auth/passkey/options', async (req) => {
    json(req);
    const { rpID } = where(req);
    // Discoverable credentials: the device offers its Spot passkeys, so
    // nobody has to type an email first.
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: [] });
    const challengeId = b64(randomBytes(16));
    db.challenges.put(challengeId, options.challenge, null);
    return { challenge_id: challengeId, options };
  });

  app.post('/v1/auth/passkey/verify', async (req, reply) => {
    json(req);
    const ch = db.challenges.take(String(req.body?.challenge_id || ''));
    if (!ch) throw new CartError('That took too long. Try again.', 400);
    const response = req.body?.response;
    const pk = response?.id && db.passkeys.get(String(response.id));
    if (!pk) throw new CartError('This device’s passkey isn’t linked to a Spot account. Sign in with a code, then add it from your account.', 401);
    const { origin, rpID } = where(req);
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: { id: pk.id, publicKey: unb64(pk.public_key), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined },
      });
    } catch {
      throw new CartError('That passkey didn’t work. Try again, or use a code.', 401);
    }
    if (!result.verified) throw new CartError('That passkey didn’t work. Try again, or use a code.', 401);
    db.passkeys.used(pk.id, result.authenticationInfo.newCounter);
    const user = db.users.byId(pk.user_id);
    if (!user) throw new CartError('That account no longer exists', 401);
    startSession(db, req, reply, urlFor, user.id);
    return { ok: true };
  });
}

// Browser side: the WebAuthn calls with base64url ⇄ bytes conversions,
// shared by the sign-in and account pages.
export const PASSKEY_JS = `
const pkB2a=s=>{s=String(s).replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0)).buffer};
const pkA2b=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
const pkJSON=c=>{const r=c.response,o={id:c.id,rawId:pkA2b(c.rawId),type:c.type,clientExtensionResults:c.getClientExtensionResults?c.getClientExtensionResults():{},authenticatorAttachment:c.authenticatorAttachment||undefined,response:{clientDataJSON:pkA2b(r.clientDataJSON)}};
  if(r.attestationObject){o.response.attestationObject=pkA2b(r.attestationObject);o.response.transports=r.getTransports?r.getTransports():[]}
  else{o.response.authenticatorData=pkA2b(r.authenticatorData);o.response.signature=pkA2b(r.signature);if(r.userHandle)o.response.userHandle=pkA2b(r.userHandle)}return o};
const pkOK=()=>typeof window.PublicKeyCredential==='function';
async function pkRegister(name){
  const {challenge_id,options:o}=await post('/v1/me/passkeys/options',{});
  const cred=await navigator.credentials.create({publicKey:{...o,challenge:pkB2a(o.challenge),user:{...o.user,id:pkB2a(o.user.id)},excludeCredentials:(o.excludeCredentials||[]).map(c=>({...c,id:pkB2a(c.id)}))}});
  return post('/v1/me/passkeys',{challenge_id,response:pkJSON(cred),name});
}
const pkOptions=()=>post('/v1/auth/passkey/options',{});
// Safari only shows Face ID if credentials.get() starts right in the tap, so
// a button passes options fetched ahead of time (pre) and nothing is awaited first.
async function pkSignIn(mediation,signal,pre){
  const {challenge_id,options:o}=pre||await pkOptions();
  const cred=await navigator.credentials.get({publicKey:{...o,challenge:pkB2a(o.challenge),allowCredentials:(o.allowCredentials||[]).map(c=>({...c,id:pkB2a(c.id)}))},...(mediation?{mediation}:{}),...(signal?{signal}:{})});
  if(!cred)throw new Error('cancelled');
  return post('/v1/auth/passkey/verify',{challenge_id,response:pkJSON(cred)});
}
const pkDeviceName=()=>{const u=navigator.userAgent;return /iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android phone':/Mac/.test(u)?'Mac':/Windows/.test(u)?'Windows PC':'This device'};
`;

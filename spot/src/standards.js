// /standards: the open protocols Spot speaks, in plain words, with the
// version and a live link anyone can open to check. "Supports" means Spot
// implements it today; it isn't a certification, and drafts are labeled.
import { PAP_VERSION } from './pap.js';
import { UCP_VERSION } from './fulfill/ucp.js';
import { SITE_JS, siteFooter, siteHead, siteNav } from './site.js';

// [name, status, version, for you, how Spot uses it, [[label, path], ...]]
export const STANDARDS = [
  [
    'Model Context Protocol (MCP)',
    'Supported',
    '2025-11-25',
    'Spot works inside Claude, ChatGPT and any app that speaks MCP. No plug-in to install.',
    'Spot is a remote MCP server: create_spot_ask, search_flights, create_flight_ask, create_train_ask, get_spot_ask, order_spot_ask, get_my_sizes.',
    [['MCP endpoint', '/mcp']],
  ],
  [
    'OAuth 2.1 sign-in for MCP',
    'Supported',
    'RFC 8414 · 9728 · 7591 · 7636',
    'You sign in to Spot and tap Allow. Your AI never gets your password or a card, and you can disconnect it any time.',
    'Authorization server and protected-resource metadata, dynamic client registration, authorization code with PKCE (S256), refresh and revocation.',
    [['Sign-in metadata', '/.well-known/oauth-authorization-server'], ['Resource metadata', '/.well-known/oauth-protected-resource']],
  ],
  [
    'Universal Commerce Protocol (UCP)',
    'Supported',
    UCP_VERSION,
    'At stores that support it, you pay the store on its own checkout: its receipt, its returns, no Spot fee.',
    'Spot is a UCP platform: it reads a store’s profile, builds the checkout with exactly your cart, and follows it to the order. Checkout, fulfillment and catalog lookup.',
    [['Spot’s UCP profile', '/.well-known/ucp']],
  ],
  [
    'Personal Agent Protocol (PAP)',
    `Draft ${PAP_VERSION}`,
    `draft ${PAP_VERSION}`,
    'Personal AI agents can find Spot, sign you in and ask on your behalf, under the same rules as Claude and ChatGPT.',
    'Discovery document, OAuth client ID metadata documents, private_key_jwt, JWT bearer grant (RFC 7523) for guest sessions, then sign-in to move onto your account.',
    [['Spot’s PAP document', '/.well-known/poppy.json']],
  ],
  [
    'HTTP Message Signatures (Web Bot Auth)',
    'Supported',
    'RFC 9421',
    'Stores can tell Spot from other bots, so a Spot order isn’t mistaken for a scraper.',
    'Spot signs its requests to stores with an Ed25519 key, tagged web-bot-auth, with a Signature-Agent header pointing at its key directory.',
    [['Spot’s request keys', '/.well-known/http-message-signatures-directory']],
  ],
  [
    'Signed approvals (JWS)',
    'Supported',
    'RFC 7515 · 7517',
    'Every yes is signed: what was bought, from which store, for how much, who said yes and which AI asked. Anyone can check it.',
    'A compact JWS (EdDSA) over the approved cart, linked from receipts and returned to your AI. Public keys as a JWK set.',
    [['Spot’s public keys', '/.well-known/spot-keys.json']],
  ],
  [
    'Passkeys (WebAuthn)',
    'Supported',
    'WebAuthn · FIDO2',
    'Sign in with Face ID, Touch ID or your phone instead of a code.',
    'Platform and cross-device passkeys, bound to spotmeplease.com.',
    [],
  ],
  [
    'Card payments through Stripe',
    'Supported',
    'PCI DSS via Stripe',
    'Your card number goes to Stripe, never to Spot. Stripe is a PCI DSS Level 1 service provider.',
    'Payments, Apple Pay and Google Pay through Stripe. Spot’s one-time cards are issued by Stripe with network-enforced limits: one store, capped at the order, then closed.',
    [],
  ],
  [
    'Texting rules (CTIA)',
    'Supported',
    'STOP · HELP',
    'Spot texts you only after you ask for it, and updates only go to a number you confirmed with a code. Reply STOP to stop, HELP for help.',
    'Opt-in with a one-time code, STOP and START honored on every number, and links only to confirmed numbers.',
    [['How texts work', '/texts']],
  ],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const STANDARDS_CSS = `
.stds{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px}
.std{background:var(--card);border:1.5px solid var(--line);border-radius:22px;padding:18px 18px 16px;display:grid;gap:8px;align-content:start}
.std h3{font-size:18px;margin:0;letter-spacing:-.01em}
.std .tags{display:flex;gap:6px;flex-wrap:wrap}
.std .tag{font-size:12px;font-weight:700;border-radius:999px;padding:3px 9px;border:1px solid var(--line);color:var(--muted)}
.std .tag.on{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 45%,transparent)}
.std .tag.draft{color:#a86400;border-color:color-mix(in srgb,#a86400 45%,transparent)}
.std p{margin:0;font-size:15px}
.std .how{color:var(--muted);font-size:14px}
.std .checks{display:flex;gap:6px 12px;flex-wrap:wrap;font-size:14px}
.std .checks a{color:var(--ink);font-weight:600}
.stdstrip{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}
.stdstrip a{display:inline-flex;gap:6px;align-items:center;text-decoration:none;color:var(--ink);background:var(--card);border:1.5px solid var(--line);border-radius:999px;padding:8px 13px;font-weight:700;font-size:14px}
.stdstrip a small{color:var(--muted);font-weight:600}
.stdstrip a:hover{border-color:var(--spot)}
`;

// The compact row for the home page's trust section.
export function standardsStrip() {
  const short = [
    ['MCP', '/standards#mcp'],
    ['OAuth 2.1', '/standards#oauth'],
    [`UCP <small>${esc(UCP_VERSION)}</small>`, '/standards#ucp'],
    [`PAP <small>draft ${esc(PAP_VERSION)}</small>`, '/standards#pap'],
    ['RFC 9421 signatures', '/standards#signatures'],
    ['Signed approvals (JWS)', '/standards#approvals'],
    ['Passkeys', '/standards#passkeys'],
  ];
  return `<div class="stdstrip" aria-label="Open standards Spot supports">${short.map(([l, h]) => `<a href="${h}">${l}</a>`).join('')}<a href="/standards">All standards →</a></div>`;
}

const IDS = ['mcp', 'oauth', 'ucp', 'pap', 'signatures', 'approvals', 'passkeys', 'stripe', 'texts'];

export function standardsPage({ origin }) {
  const card = ([name, status, version, you, how, checks], i) => `<article class="std" id="${IDS[i]}">
    <h3>${esc(name)}</h3>
    <div class="tags"><span class="tag ${status.startsWith('Draft') ? 'draft' : 'on'}">${status.startsWith('Draft') ? '◐' : '✓'} ${esc(status)}</span><span class="tag">${esc(version)}</span></div>
    <p>${esc(you)}</p>
    <p class="how">${esc(how)}</p>
    ${checks.length ? `<div class="checks">${checks.map(([l, p]) => `<a href="${p}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</div>` : ''}
  </article>`;
  return `${siteHead({ title: 'Open standards · Spot', desc: 'The open protocols Spot supports: MCP, OAuth 2.1, UCP, PAP, HTTP Message Signatures, signed approvals and passkeys, with live links to check each one.', origin, path: '/standards', extraCss: STANDARDS_CSS + '.stdp{padding:34px 0 70px}.stdp h1{font-size:clamp(34px,7vw,56px);letter-spacing:-.03em;line-height:1.02;margin:10px 0}.stdp .lead{color:var(--muted);max-width:640px;margin:0 0 26px}.stdp .note{color:var(--muted);font-size:14px;margin-top:22px}' })}
${siteNav('standards')}
<main class="stdp"><div class="wrap">
  <p class="kicker">Open standards</p>
  <h1>Built on protocols you can check</h1>
  <p class="lead">Spot isn’t a walled garden. It speaks the open standards AI apps, stores and banks use, so your AI, the store and you can each verify what happened. Every link below is live.</p>
  <div class="stds">${STANDARDS.map(card).join('')}</div>
  <p class="note">“Supported” means Spot implements it today. It isn’t a certification. Drafts can change; Spot follows them and this page shows the version in use. Questions about an integration? See the <a href="/integrations">integrations page</a>.</p>
</div></main>
${siteFooter()}
<script>(()=>{${SITE_JS}})();</script>
</body></html>`;
}

// Who on the team may open which part of the work console.
//
// Every @thefuturebasics.com sign-in is "staff". This decides what each of them can reach: Danielle and Kyle (the owners) turn modules on and off per person on
// the Team access page, and the work console only shows, and the API only serves, what a person has been given. The rules are here with no web server in them;
// staff-access-routes.js serves the owners' page and server.js asks `check` on every staff request.
//
// - Owners (the people named for Money: Danielle and Kyle, or ACCESS_ADMIN_EMAILS) always have everything and cannot be locked out.
// - Everyone else gets exactly the modules ticked for them. A person with no row yet is "new": they start with the owners' default for new people (nothing,
//   until the owners say otherwise), and the Team access page shows them as waiting.
// - "Paused" shuts a person out of the whole console without deleting anything.
// - Money and signing for Future Basics stay with MONEY_ACCESS_EMAILS (money.js) and are not a module.
import { moneyAccessList } from './money.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The modules, in the order the Team access page lists them.
export const MODULES = [
  { id: 'messages', label: 'Messages and chats', group: 'Inbox', hint: 'Client messages and the website chats' },
  { id: 'crm', label: 'Contacts and sales', group: 'People and sales', hint: 'Contacts, companies, pipeline, tasks, opportunities, sales email and templates' },
  { id: 'automations', label: 'Sales automations', group: 'People and sales', hint: 'Automatic follow-ups and sequences' },
  { id: 'press', label: 'Press', group: 'People and sales', hint: 'Releases, pitches, the media list and coverage' },
  { id: 'contracts', label: 'Contracts', group: 'People and sales', hint: 'Draft, send and track agreements (signing for Future Basics stays with the owners)' },
  { id: 'intel', label: 'Intelligence', group: 'People and sales', hint: 'Signals worth a look and the sources behind them' },
  { id: 'prototypes', label: 'Site prototypes', group: 'People and sales', hint: 'Prototypes for prospects and the lead finder' },
  { id: 'builds', label: 'Builds showcase', group: 'People and sales', hint: 'The showcase of what we build, its viewers and invites' },
  { id: 'clients', label: 'Clients and projects', group: 'Delivery', hint: 'Client rooms, projects, products and tech packs, approvals, production, quotes, files and assistant learning' },
  { id: 'factories', label: 'Factories', group: 'Delivery', hint: 'The factory list, map, skills and assigned work' },
  { id: 'platform', label: 'Platform health', group: 'Sites and health', hint: 'Health checks, connections and how the platform is being used' },
  { id: 'brand', label: 'Brand and assets', group: 'Brand', hint: 'Logos, fonts, colours and downloads' }
];
export const MODULE_IDS = MODULES.map(m => m.id);
const BY_ID = new Map(MODULES.map(m => [m.id, m]));
export const moduleLabel = id => BY_ID.get(id)?.label || id;

// Starting points for the Team access page: one click ticks the usual set for a role, and the boxes can still be changed.
export const PRESETS = [
  { id: 'sales', label: 'Sales', modules: ['messages', 'crm', 'automations', 'press', 'contracts', 'intel', 'prototypes', 'builds', 'brand'] },
  { id: 'delivery', label: 'Delivery', modules: ['messages', 'clients', 'factories', 'brand'] },
  { id: 'everything', label: 'Everything', modules: MODULE_IDS },
  { id: 'nothing', label: 'Nothing yet', modules: [] }
];

// Which module a staff request belongs to, from the route pattern ("/v1/sales/contacts/:id"), first match wins. null means no module is needed: My day,
// the person's own access, Money (which has its own list) and the client-side routes a signed-in person uses for themselves.
const RULES = [
  [/^\/v1\/staff-access/, null],
  // changing what the tech pack payment gate charges is for the owners (anyone with Clients and projects may still read it)
  [/^\/v1\/admin\/tech-pack-billing/, 'owner', ['PUT', 'POST', 'PATCH', 'DELETE']],
  [/^\/v1\/money/, null],
  [/^\/v1\/admin\/home/, null],
  [/^\/v1\/admin\/(message-center|notifications)/, 'messages'],
  [/^\/v1\/sales\/chats/, 'messages'],
  [/^\/v1\/admin\/(platform|shopify\/status|resend\/status)/, 'platform'],
  [/^\/v1\/admin\/factories/, 'factories'],
  [/^\/v1\/admin\/builds/, 'builds'],
  [/^\/v1\/admin\/prototypes/, 'prototypes'],
  [/^\/v1\/sales\/press/, 'press'],
  [/^\/v1\/sales\/(automations|runs)/, 'automations'],
  [/^\/v1\/sales\/contacts\/:id\/runs/, 'automations'],
  [/^\/v1\/sales/, 'crm'],
  [/^\/v1\/intel/, 'intel'],
  [/^\/v1\/contracts/, 'contracts'],
  [/^\/v1\/brand/, 'brand'],
  [/^\/v1\/admin/, 'clients'],
  // shared routes that clients use for their own room and that staff use to work in any room
  [/^\/v1\/(products|projects|room-files|project-files|pick-images|invoices|quotes|approvals|comments|asset-versions|requests|vendor|tech-packs|dashboard)(\/|$)/, 'clients']
];
export function moduleFor(pattern, method = 'GET') {
  const p = String(pattern || ''), m = String(method || 'GET').toUpperCase();
  for (const [re, id, methods] of RULES) if (re.test(p) && (!methods || methods.includes(m))) return id;
  return null;
}

// ---- who is an owner --------------------------------------------------------------------------------------------------------------------------
// ACCESS_ADMIN_EMAILS (comma separated) names the owners; with it unset the owners are the people named for Money, Danielle and Kyle.
export function ownerList(env = process.env) {
  const named = String(env.ACCESS_ADMIN_EMAILS || '').split(/[,\s;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  return named.length ? named : moneyAccessList(env);
}
export function isOwner(email, env = process.env) {
  const e = String(email || '').trim().toLowerCase(); if (!e) return false;
  return ownerList(env).some(a => (a.startsWith('@') ? e.endsWith(a) : e === a));
}

// Keeps only real module ids, once each, in the page's order.
export const cleanModules = list => { const want = new Set((Array.isArray(list) ? list : []).map(String)); return MODULE_IDS.filter(id => want.has(id)); };
// "all" / "everything", or a comma separated list, for the starting access of people with no row (STAFF_ACCESS_DEFAULT); anything else is nothing.
export const parseDefault = v => { const s = String(v ?? '').trim().toLowerCase(); return s === 'all' || s === 'everything' ? MODULE_IDS.slice() : cleanModules(s.split(/[,\s;]+/)); };

// One person's reach. `row` is their staff_access row (or null for someone new).
export function reach({ email, row = null, defaults = [], env = process.env }) {
  const owner = isOwner(email, env);
  if (owner) return { owner: true, blocked: false, configured: true, modules: MODULE_IDS.slice(), can: () => true };
  const modules = cleanModules(row ? row.modules : defaults), blocked = Boolean(row?.blocked), set = new Set(modules);
  return { owner: false, blocked, configured: Boolean(row), modules, can: id => !id || (!blocked && set.has(id)) };
}

// ---- the service ------------------------------------------------------------------------------------------------------------------------------
export function createStaffAccess({ pool, getSetting, setSetting, env = process.env, ttlMs = 10_000, now = () => Date.now() } = {}) {
  const cache = new Map();
  const forget = id => (id ? cache.delete(String(id)) : cache.clear());

  // The owners' default for people who have no row yet. Stored by the owners; STAFF_ACCESS_DEFAULT only sets where it starts.
  async function defaults() {
    const stored = await getSetting('staffAccessDefaults').catch(() => null);
    return Array.isArray(stored?.modules) ? cleanModules(stored.modules) : parseDefault(env.STAFF_ACCESS_DEFAULT);
  }
  async function setDefaults(modules) { const v = { modules: cleanModules(modules) }; await setSetting('staffAccessDefaults', v); forget(); return v.modules; }

  // The reach of whoever the token says. A session that is not a real user row (the staff preview) is not restricted: the server made it itself.
  async function reachOf(auth) {
    const sub = String(auth?.sub || '');
    if (!UUID.test(sub)) return { owner: true, blocked: false, configured: true, modules: MODULE_IDS.slice(), can: () => true, system: true };
    const hit = cache.get(sub); if (hit && now() - hit.at < ttlMs) return hit.v;
    const row = (await pool.query(`select u.email, sa.modules, sa.blocked from users u left join staff_access sa on sa.user_id=u.id where u.id=$1`, [sub])).rows[0];
    if (row && env.DEV_BYPASS_AUTH === 'true' && String(row.email).toLowerCase() === 'preview@thefuturebasics.com') { const v = reach({ email: row.email, env }); const full = { ...v, owner: true, blocked: false, modules: MODULE_IDS.slice(), can: () => true }; cache.set(sub, { at: now(), v: full }); return full; } // the local development sign-in
    const v = row ? reach({ email: row.email, row: row.modules ? { modules: row.modules, blocked: row.blocked } : null, defaults: await defaults(), env }) : reach({ email: auth?.email, defaults: await defaults(), env });
    cache.set(sub, { at: now(), v }); return v;
  }

  // Run for every signed-in staff request. Returns null to carry on, or { status, body } to refuse. Sets req.staff for routes that show less to some people.
  async function check(req) {
    const r = await reachOf(req.auth); req.staff = r;
    const pattern = req.routeOptions?.url || req.routerPath || '';
    if (r.blocked && !/^\/v1\/(staff-access\/me|session)/.test(pattern)) return { status: 403, body: { error: 'Your access to the work console is paused. Ask Kyle or Danielle.', code: 'STAFF_PAUSED' } };
    const id = moduleFor(pattern, req.method);
    if (id === 'owner' && !r.owner) return { status: 403, body: { error: 'Only Danielle and Kyle can change this.', code: 'OWNER_ONLY' } };
    if (id && id !== 'owner' && !r.can(id)) return { status: 403, body: { error: `You do not have access to ${moduleLabel(id)}. Ask Kyle or Danielle to turn it on.`, code: 'MODULE_ACCESS', module: id } };
    return null;
  }

  return { reachOf, check, defaults, setDefaults, forget };
}

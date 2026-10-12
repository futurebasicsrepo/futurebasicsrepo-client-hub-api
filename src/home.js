// The work console's home: what to do today to get more leads, build prototypes that close deals, and keep the projects in flight moving.
// The rules that need no database (see home-routes.js for the queries and work-home.html for the page).
import { stageOwner, stageLabel } from './software.js';

export const LEAD_SOURCES_EXCLUDED = ['hub', 'import']; // people who are already clients, or loaded in bulk, are not new leads

// A project as one row: who has the ball, and whether it is waiting on us.
export function projectRow(r, now = Date.now()) {
  const sw = r.kind === 'software', waitingOnUs = r.last_author === 'client';
  const owner = waitingOnUs ? 'us' : sw ? stageOwner(r.stage) : 'us';
  const quietDays = Math.floor((now - new Date(r.last_message_at || r.updated_at).getTime()) / 86400_000);
  return {
    id: r.id, clientId: r.client_id, clientName: r.client_name, accountOwner: r.account_owner || '', siteState: r.site_state || '', name: r.name, kind: sw ? 'software' : 'product', status: r.status,
    stage: sw ? r.stage || 'discovery' : null, stageLabel: sw ? stageLabel(r.stage || 'discovery') : String(r.milestone || ''),
    buildId: r.build_id || null, buildName: r.build_name || '', liveUrl: r.live_url || '', productCount: Number(r.product_count) || 0, targetDate: r.target_date || null,
    owner, waitingOnUs, quietDays: Number.isFinite(quietDays) ? Math.max(0, quietDays) : 0, updatedAt: r.updated_at
  };
}
// the ones waiting on us first, then the ones that have gone quiet the longest, then the rest by recency
export const orderProjects = rows => [...rows].sort((a, b) => (b.waitingOnUs - a.waitingOnUs) || ((b.owner === 'us') - (a.owner === 'us')) || (new Date(b.updatedAt) - new Date(a.updatedAt)));

// a prototype is a build that is not finished: how warm it is says whether to nudge someone
export function prototypeRow(r) {
  const lookers = Number(r.lookers7) || 0, invites = Number(r.invites) || 0;
  const next = lookers > 0 ? 'Someone is looking: say hello' : invites > 0 ? 'Invited, not opened yet: nudge them' : r.visibility === 'hidden' ? 'Only staff can see it: invite someone' : 'Not shared with anyone yet';
  return { id: r.id, slug: r.slug, name: r.name, tagline: r.tagline || '', status: r.status, visibility: r.visibility, liveUrl: r.live_url || '', stack: r.stack || [], hasCover: Boolean(r.has_cover), views7: Number(r.views7) || 0, lookers7: lookers, invites,
    lastLookAt: r.last_look || null, products: Number(r.products) || 0, clients: Array.isArray(r.clients) ? r.clients : [], warm: lookers > 0, next };
}

export const trend = (cur, prev) => (prev === 0 ? (cur > 0 ? { dir: 'up', text: 'new this week' } : { dir: 'flat', text: 'no change' }) : cur === prev ? { dir: 'flat', text: 'same as last week' } : { dir: cur > prev ? 'up' : 'down', text: `${cur > prev ? '+' : ''}${cur - prev} on last week` });
// The name a teammate is greeted by: the first word of their name, or, when the name is empty or just their address, the start of their email (colby@… and mary.jones@… become Colby and Mary).
export function firstName(name, email) {
  const clean = s => String(s || '').trim(), cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  let n = clean(name); if (n.includes('@')) n = '';
  let w = n.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, '');
  if (!w) w = clean(email).split('@')[0].split(/[._+\-0-9]/)[0].replace(/[^\p{L}]/gu, '');
  return w.length > 1 ? (w === w.toLowerCase() || w === w.toUpperCase() ? cap(w) : w) : '';
}
export const greeting = (hourUtc, offset = -4) => { const h = (hourUtc + offset + 24) % 24; return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };

// One account the signed-in teammate owns: what needs them, in words. Quiet ones sort last.
export function accountRow(r, now = Date.now()) {
  const last = r.last_message_at ? new Date(r.last_message_at).getTime() : null, quietDays = last ? Math.max(0, Math.floor((now - last) / 86400_000)) : null;
  const needs = [];
  if (r.waiting_on_us) needs.push(`${r.waiting_on_us} project${r.waiting_on_us === 1 ? '' : 's'} waiting on you`);
  if (r.approvals) needs.push(`${r.approvals} approval${r.approvals === 1 ? '' : 's'} waiting`);
  if (r.tasks_due) needs.push(`${r.tasks_due} task${r.tasks_due === 1 ? '' : 's'} due`);
  return { id: r.id, name: r.name, projects: Number(r.projects) || 0, waitingOnUs: Number(r.waiting_on_us) || 0, approvals: Number(r.approvals) || 0, tasksDue: Number(r.tasks_due) || 0, quietDays, needs, needsYou: needs.length > 0 };
}
export const orderAccounts = rows => rows.slice().sort((a, b) => Number(b.needsYou) - Number(a.needsYou) || (b.waitingOnUs - a.waitingOnUs) || (b.approvals - a.approvals) || (b.tasksDue - a.tasksDue) || String(a.name).localeCompare(String(b.name)));

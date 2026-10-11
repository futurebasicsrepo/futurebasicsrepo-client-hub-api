// The opportunity finder: who to talk to next, and why. The rules need no database (see sales-opportunities-routes.js for the questions put to the CRM).
// An opportunity is one reason to reach out to one person (or a company), with a plain-words reason, a score, and a task worth making. Staff can make the task,
// snooze it, or hide it; a person appears once, under their strongest reason.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const money = c => '$' + Math.round(Number(c || 0) / 100).toLocaleString('en-US');
const ago = days => days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;

export const OPP_TYPES = {
  chat_waiting: { label: 'Chat waiting', base: 95 },
  inbound_unanswered: { label: 'Wrote to us, no reply', base: 90 },
  opened_live: { label: 'Opened a live build', base: 85 },
  hot_no_deal: { label: 'Interested, no deal', base: 70 },
  deal_quiet: { label: 'Deal gone quiet', base: 60 },
  new_unworked: { label: 'New, untouched', base: 50 },
  account_expansion: { label: 'More at a customer', base: 45 },
  cross_sell_builds: { label: 'Tech pack customer, no builds', base: 40 },
  cross_sell_techpack: { label: 'Build customer, no tech pack', base: 40 },
  gone_cold: { label: 'Was warm, now quiet', base: 35 }
};
export const priority = score => (score >= 80 ? 'now' : score >= 60 ? 'week' : 'later');
export const PRIORITY_LABEL = { now: 'Now', week: 'This week', later: 'When there is time' };
export const oppKey = (type, id) => `${type}:${id}`;

// "dismissed", "snoozed" and "done" all hide an opportunity until a date; after it, if the reason is still true, it comes back.
export const HIDE_DAYS = { dismissed: 30, done: 14 };
export function hiddenUntil(state, now = Date.now(), days) {
  const d = state === 'snoozed' ? Math.max(1, Math.min(90, Math.round(Number(days) || 7))) : HIDE_DAYS[state];
  return d ? new Date(now + d * 86400_000) : null;
}
export const isHidden = (row, now = Date.now()) => Boolean(row && row.until && new Date(row.until).getTime() > now);

// facts → { score, reason, task }
export function describe(type, f = {}) {
  const who = clip(f.name, 80) || clip(f.email, 80) || 'This contact', co = clip(f.company, 80) ? ` at ${clip(f.company, 80)}` : '', build = clip(f.build, 80);
  const base = OPP_TYPES[type]?.base || 30; let score = base, reason = '', task = '';
  switch (type) {
    case 'chat_waiting':
      reason = `${who} is waiting in chat for a person${f.since ? ` (since ${ago(f.days || 0)})` : ''}.`; task = `Reply to ${who} in chat`; score += Math.min(4, f.days || 0); break;
    case 'inbound_unanswered':
      reason = `${who}${co} wrote to us ${ago(f.days || 0)}: “${clip(f.text, 90)}”. Nobody has answered.`; task = `Answer ${who}: “${clip(f.text, 60)}”`; score += Math.min(8, f.days || 0); break;
    case 'opened_live':
      reason = `${who}${co} opened ${build ? `the live build “${build}”` : 'a live build'} ${ago(f.days || 0)} and nobody has followed up.`; task = `Follow up with ${who}: they opened ${build || 'a live build'}`; score -= Math.min(10, Math.floor((f.days || 0) / 2)); break;
    case 'hot_no_deal':
      reason = `${who}${co} is ${f.level === 'hot' ? 'hot' : 'warm'} (${clip(f.signals, 100) || 'recent activity'}) and has no deal.`; task = `Start a deal with ${who}`; if (f.level !== 'hot') score -= 15; break;
    case 'deal_quiet':
      reason = `“${clip(f.dealTitle, 80)}”${f.value ? ` (${money(f.value)})` : ''} has had nothing for ${f.days} days at ${f.stage}.`; task = `Nudge ${who} about “${clip(f.dealTitle, 60)}”`; score += Math.min(10, Math.max(0, (f.days || 0) - 7)) + Math.min(20, Math.floor(Number(f.value || 0) / 100 / 1000) * 2); break;
    case 'new_unworked':
      reason = `${who}${co} arrived ${ago(f.days || 0)} (${clip(f.source, 30) || 'unknown source'}) and nobody has done anything yet.`; task = `Say hello to ${who}`; break;
    case 'account_expansion':
      reason = `${clip(f.company, 80)} is a customer${f.value ? ` (${money(f.value)} won)` : ''}. ${f.others} other ${f.others === 1 ? 'person' : 'people'} there ${f.others === 1 ? 'has' : 'have'} no deal, including ${who}.`; task = `Ask ${who} (${clip(f.company, 60)}) what they need`; score += Math.min(15, Math.floor(Number(f.value || 0) / 100 / 1000) * 2); break;
    case 'cross_sell_builds':
      reason = `${who}${co} makes tech packs with us but has not seen the builds.`; task = `Invite ${who} to the builds showcase`; break;
    case 'cross_sell_techpack':
      reason = `${who}${co} bought a build but has not tried a tech pack.`; task = `Tell ${who} about tech packs`; break;
    case 'gone_cold':
      reason = `${who}${co} was warm, but there has been nothing for ${f.days} days.`; task = `Check in with ${who}`; break;
    default: reason = clip(f.reason, 200); task = clip(f.task, 200);
  }
  return { score: Math.max(1, Math.min(100, Math.round(score))), reason, task: clip(task, 200) };
}

// → one opportunity per person (their strongest), highest first. `hidden` is a Map of key → { until } from what staff have already decided.
export function rank(list, { hidden = new Map(), now = Date.now(), limit = 60 } = {}) {
  const groups = new Map();
  for (const o of list) {
    if (isHidden(hidden.get(o.key), now)) continue; // a reason staff set aside is skipped, so the next reason for that person can show
    const k = o.contactId || o.key; (groups.get(k) || groups.set(k, []).get(k)).push(o);
  }
  return [...groups.values()].map(g => { g.sort((a, b) => b.score - a.score); return { ...g[0], also: g.slice(1).map(x => x.type) }; })
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name))).slice(0, limit)
    .map(o => ({ ...o, priority: priority(o.score), typeLabel: OPP_TYPES[o.type]?.label || o.type }));
}
export const countsByType = list => Object.fromEntries(Object.keys(OPP_TYPES).map(t => [t, list.filter(o => o.type === t).length]).filter(([, n]) => n));

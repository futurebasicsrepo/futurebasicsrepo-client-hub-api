// What the intelligence work is delivering, and who is doing what with it: the numbers teams are held to. Pure: give it the rows, get the figures back (see intel-routes.js for the queries).
// signals: rows found in the period (status, owner_id, found_at, first_action_at, claimed_at, relevant, score, service_line, source), plus the still-open ones for the backlog.
// events: rows in the period (signal_id, actor_id, kind, channel, value_cents, at).  usage: rows in the period (cost_cents).  staff: [{ id, name }].  settings: { minScore, slaHours, teams }.
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10; };
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const hours = (a, b) => (new Date(a) - new Date(b)) / 3600_000;

export function buildKpis({ signals = [], open = [], events = [], usage = [], staff = [], settings = {}, now = Date.now() } = {}) {
  const min = Number(settings.minScore ?? 40), sla = Number(settings.slaHours ?? 24), teams = settings.teams || {};
  const surfaced = signals.filter(s => s.relevant && Number(s.score) >= min);
  const ids = kind => new Set(events.filter(e => e.kind === kind).map(e => e.signal_id));
  const sets = { claimed: ids('claimed'), outreach: ids('outreach'), reply: ids('reply'), meeting: ids('meeting'), deal: ids('deal'), won: ids('won'), lost: ids('lost'), dismissed: ids('dismissed') };
  const firstHours = surfaced.filter(s => s.first_action_at).map(s => hours(s.first_action_at, s.found_at)).filter(h => h >= 0);
  const withinSla = surfaced.filter(s => s.first_action_at && hours(s.first_action_at, s.found_at) <= sla).length;
  const overdue = open.filter(s => s.status === 'new' && s.relevant && Number(s.score) >= min && hours(now, s.found_at) > sla);
  const won = events.filter(e => e.kind === 'won'), wonCents = won.reduce((n, e) => n + (Number(e.value_cents) || 0), 0);
  const costCents = Math.round(usage.reduce((n, u) => n + Number(u.cost_cents || 0), 0) * 100) / 100;
  const out = {
    funnel: { found: signals.length, surfaced: surfaced.length, actioned: sets.outreach.size, replied: sets.reply.size, meetings: sets.meeting.size, deals: sets.deal.size, won: sets.won.size },
    totals: { found: signals.length, relevant: signals.filter(s => s.relevant).length, surfaced: surfaced.length, unscored: signals.filter(s => !s.scored_at).length, dismissed: sets.dismissed.size, outreach: events.filter(e => e.kind === 'outreach').length,
      replies: sets.reply.size, meetings: sets.meeting.size, deals: sets.deal.size, won: sets.won.size, lost: sets.lost.size, wonCents },
    rates: { reviewedWithinSla: pct(withinSla, surfaced.length), reply: pct(sets.reply.size, sets.outreach.size), meeting: pct(sets.meeting.size, sets.outreach.size), win: pct(sets.won.size, sets.meeting.size), dismissed: pct(sets.dismissed.size, surfaced.length) },
    response: { medianHoursToFirstAction: median(firstHours.map(h => Math.round(h * 10) / 10)), withinSla, slaHours: sla, overdue: overdue.length, overdueOldestHours: overdue.length ? Math.round(Math.max(...overdue.map(s => hours(now, s.found_at)))) : 0 },
    cost: { cents: costCents, perSurfacedCents: surfaced.length ? Math.round((costCents / surfaced.length) * 100) / 100 : null, perMeetingCents: sets.meeting.size ? Math.round((costCents / sets.meeting.size) * 100) / 100 : null, perWinCents: sets.won.size ? Math.round((costCents / sets.won.size) * 100) / 100 : null }
  };
  // by person: what they did (events carry the person), and what is waiting on them
  const bySignal = new Map([...signals, ...open].map(s => [s.id, s]));
  const people = new Map(staff.map(p => [p.id, { id: p.id, name: p.name, team: teams[p.id] || '', claimed: 0, outreach: 0, replies: 0, meetings: 0, deals: 0, won: 0, wonCents: 0, dismissed: 0, owned: 0, overdue: 0, firstHours: [], withinSla: 0, claimedSurfaced: 0 }]));
  const person = id => { if (!id) return null; if (!people.has(id)) people.set(id, { id, name: 'Someone who has left', team: teams[id] || '', claimed: 0, outreach: 0, replies: 0, meetings: 0, deals: 0, won: 0, wonCents: 0, dismissed: 0, owned: 0, overdue: 0, firstHours: [], withinSla: 0, claimedSurfaced: 0 }); return people.get(id); };
  const field = { claimed: 'claimed', outreach: 'outreach', reply: 'replies', meeting: 'meetings', deal: 'deals', won: 'won', dismissed: 'dismissed' };
  for (const e of events) { const p = person(e.actor_id); if (p && field[e.kind]) { p[field[e.kind]]++; if (e.kind === 'won') p.wonCents += Number(e.value_cents) || 0; } }
  for (const s of open) { const p = person(s.owner_id); if (p && ['new', 'reviewing'].includes(s.status)) p.owned++; if (p && s.status === 'new' && s.relevant && Number(s.score) >= min && hours(now, s.found_at) > sla) p.overdue++; }
  for (const s of surfaced) { const p = person(s.owner_id); if (p && s.claimed_at) { p.claimedSurfaced++; const h = hours(s.claimed_at, s.found_at); if (h >= 0) p.firstHours.push(h); if (h <= sla) p.withinSla++; } }
  const rows = [...people.values()].map(p => ({ id: p.id, name: p.name, team: p.team, claimed: p.claimed, outreach: p.outreach, replies: p.replies, meetings: p.meetings, deals: p.deals, won: p.won, wonCents: p.wonCents, dismissed: p.dismissed, owned: p.owned, overdue: p.overdue,
    medianHoursToClaim: median(p.firstHours.map(h => Math.round(h * 10) / 10)), claimedWithinSlaPct: pct(p.withinSla, p.claimedSurfaced), replyRate: pct(p.replies, p.outreach) })).filter(p => p.claimed + p.outreach + p.replies + p.meetings + p.won + p.dismissed + p.owned > 0 || staff.some(x => x.id === p.id))
    .sort((a, b) => (b.won - a.won) || (b.meetings - a.meetings) || (b.outreach - a.outreach) || a.name.localeCompare(b.name));
  out.people = rows;
  const byTeam = new Map();
  for (const p of rows) { const k = p.team || 'No team'; const t = byTeam.get(k) || { team: k, people: 0, claimed: 0, outreach: 0, replies: 0, meetings: 0, won: 0, wonCents: 0, overdue: 0 }; t.people++; for (const f of ['claimed', 'outreach', 'replies', 'meetings', 'won', 'wonCents', 'overdue']) t[f] += p[f]; byTeam.set(k, t); }
  out.teams = [...byTeam.values()].map(t => ({ ...t, replyRate: pct(t.replies, t.outreach) })).sort((a, b) => b.wonCents - a.wonCents || b.meetings - a.meetings);
  // what is working: by service line and by source
  const group = key => { const m = new Map(); for (const s of signals) { const k = s[key] || 'none'; const g = m.get(k) || { key: k, found: 0, surfaced: 0, outreach: 0, replies: 0, meetings: 0, won: 0 }; g.found++; if (surfaced.includes(s)) g.surfaced++; if (sets.outreach.has(s.id)) g.outreach++; if (sets.reply.has(s.id)) g.replies++; if (sets.meeting.has(s.id)) g.meetings++; if (sets.won.has(s.id)) g.won++; m.set(k, g); } return [...m.values()].sort((a, b) => b.surfaced - a.surfaced); };
  out.byServiceLine = group('service_line').filter(g => g.key !== 'none' || g.found); out.bySource = group('source');
  void bySignal; return out;
}

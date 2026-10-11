// Sales automations: the rules that need no database or network (see sales-automations-engine.js for running them and sales-automations-routes.js for the staff pages).
// An automation is a trigger (something that happened to a contact) and a list of steps (wait, make a task, tag, send an email). It runs once per contact.
import { cleanTag } from './sales.js';
import { STAGES, STAGE_LABELS, SOURCES } from './sales.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const TRIGGER_TYPES = ['showcase_view', 'showcase_demo', 'contact_created', 'tag_added', 'deal_stage', 'email_in', 'deal_quiet'];
export const STEP_KINDS = ['wait', 'task', 'tag', 'email'];
export const MAX_STEPS = 12;
// what a task title may say about the contact (the same words as an email, minus the sender)
export const TASK_FIELDS = ['first_name', 'name', 'company', 'build'];

export function cleanTrigger(input = {}) {
  const i = input && typeof input === 'object' ? input : {}, type = i.type;
  if (!TRIGGER_TYPES.includes(type)) return { error: 'Choose what starts this automation' };
  const t = { type };
  if (type === 'tag_added') { t.tag = cleanTag(i.tag); if (!t.tag) return { error: 'Name the tag that starts this automation' }; }
  if (type === 'deal_stage') { if (!STAGES.includes(i.stage)) return { error: 'Choose the deal stage that starts this automation' }; t.stage = i.stage; }
  if (type === 'contact_created' && i.source) { if (!SOURCES.includes(i.source)) return { error: 'That is not a way a contact can arrive' }; t.source = i.source; }
  if (type === 'deal_quiet') { const d = Math.round(Number(i.days)); if (!Number.isFinite(d) || d < 2 || d > 90) return { error: 'A quiet deal is one with nothing for 2 to 90 days' }; t.days = d; }
  return { value: t };
}

// → { value: step } or { error }
export function cleanStep(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  switch (i.kind) {
    case 'wait': {
      const days = Math.round(Number(i.days) || 0), hours = Math.round(Number(i.hours) || 0);
      if (days < 0 || hours < 0 || hours > 23 || days > 60 || days * 24 + hours < 1 || days * 24 + hours > 60 * 24) return { error: 'Wait between an hour and 60 days' };
      return { value: { kind: 'wait', days, hours } };
    }
    case 'task': {
      const title = clip(i.title, 200); if (!title) return { error: 'A task step needs a title' };
      const dueDays = Math.round(Number(i.dueDays) || 0); if (dueDays < 0 || dueDays > 30) return { error: 'A task can be due 0 to 30 days after it is made' };
      const bad = [...title.matchAll(/\{\{\s*([a-z_]+)/gi)].map(m => m[1].toLowerCase()).find(k => !TASK_FIELDS.includes(k));
      if (bad) return { error: `{{${bad}}} is not something a task can say. You can use ${TASK_FIELDS.map(x => `{{${x}}}`).join(', ')}.` };
      return { value: { kind: 'task', title, dueDays } };
    }
    case 'tag': {
      const add = cleanTag(i.add), remove = cleanTag(i.remove); if (!add && !remove) return { error: 'A tag step needs a tag to add or to remove' };
      return { value: { kind: 'tag', ...(add ? { add } : {}), ...(remove ? { remove } : {}) } };
    }
    case 'email': {
      if (!UUID.test(String(i.templateId || ''))) return { error: 'Choose the email template to send' };
      return { value: { kind: 'email', templateId: String(i.templateId).toLowerCase() } };
    }
    default: return { error: 'Choose what this step does' };
  }
}

export function cleanAutomation(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const name = clip(i.name, 80); if (!name) return { error: 'Give the automation a name' };
  const trig = cleanTrigger(i.trigger); if (trig.error) return trig;
  const list = Array.isArray(i.steps) ? i.steps : []; if (!list.length) return { error: 'Add at least one step' };
  if (list.length > MAX_STEPS) return { error: `An automation can have up to ${MAX_STEPS} steps` };
  const steps = [];
  for (let n = 0; n < list.length; n++) { const s = cleanStep(list[n]); if (s.error) return { error: `Step ${n + 1}: ${s.error}` }; steps.push(s.value); }
  if (steps[steps.length - 1].kind === 'wait') return { error: 'The last step cannot be a wait; there would be nothing after it' };
  let reenter = null;
  if (i.reenterDays !== null && i.reenterDays !== undefined && i.reenterDays !== '' && i.reenterDays !== 'never') { reenter = Math.round(Number(i.reenterDays)); if (!Number.isFinite(reenter) || reenter < 1 || reenter > 365) return { error: 'Let someone go through it again after 1 to 365 days, or never' }; }
  return { value: { name, trigger: trig.value, steps, stop_on_reply: i.stopOnReply !== false && i.stopOnReply !== 'false', reenter_days: reenter } };
}

export const waitMs = step => ((step.days || 0) * 24 + (step.hours || 0)) * 3600_000;

// does this event start this automation?
export function matches(trigger, ev) {
  if (!trigger || !ev || trigger.type !== ev.type) return false;
  if (trigger.type === 'tag_added') return cleanTag(ev.tag) === trigger.tag;
  if (trigger.type === 'deal_stage') return ev.stage === trigger.stage;
  if (trigger.type === 'contact_created') return !trigger.source || ev.source === trigger.source;
  return true;
}

// ---------- when email may go: working hours, so nobody is written to at 3am ----------
export const DEFAULT_WINDOW = { startHour: 13, endHour: 22, weekdaysOnly: true, paused: false }; // 9am to 6pm US Eastern, in UTC hours
export function cleanWindow(input = {}, cur = DEFAULT_WINDOW) {
  const out = { ...cur }, i = input || {};
  if ('startHour' in i) { const n = Math.round(Number(i.startHour)); if (!Number.isFinite(n) || n < 0 || n > 23) return { error: 'The start hour is 0 to 23 (UTC)' }; out.startHour = n; }
  if ('endHour' in i) { const n = Math.round(Number(i.endHour)); if (!Number.isFinite(n) || n < 1 || n > 24) return { error: 'The end hour is 1 to 24 (UTC)' }; out.endHour = n; }
  if (out.endHour <= out.startHour) return { error: 'The window has to end after it starts' };
  if ('weekdaysOnly' in i) out.weekdaysOnly = i.weekdaysOnly === true || i.weekdaysOnly === 'true';
  if ('paused' in i) out.paused = i.paused === true || i.paused === 'true';
  return { value: out };
}
const dayOk = (d, w) => !w.weekdaysOnly || ![0, 6].includes(d.getUTCDay());
export function inSendWindow(at, w = DEFAULT_WINDOW) { const d = new Date(at), h = d.getUTCHours() + d.getUTCMinutes() / 60; return dayOk(d, w) && h >= w.startHour && h < w.endHour; }
// the first moment at or after `at` that email may go
export function nextSendTime(at, w = DEFAULT_WINDOW) {
  const d = new Date(at); if (inSendWindow(d, w)) return d;
  for (let n = 0; n < 9; n++) {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n, w.startHour, 0, 0));
    if (c.getTime() >= d.getTime() && dayOk(c, w)) return c;
  }
  return d;
}

// ---------- words for the page ----------
export const TRIGGER_LABEL = { showcase_view: 'Someone looks at a build', showcase_demo: 'Someone opens a live build', contact_created: 'A new contact is added', tag_added: 'A tag is added', deal_stage: 'A deal moves to a stage', email_in: 'A contact writes back', deal_quiet: 'A deal goes quiet' };
export function describeTrigger(t) {
  switch (t?.type) {
    case 'showcase_view': return 'When someone looks at a build in the showcase';
    case 'showcase_demo': return 'When someone opens a live build';
    case 'contact_created': return t.source ? `When a new contact arrives from “${t.source}”` : 'When a new contact is added by hand or from the website';
    case 'tag_added': return `When the tag “${t.tag}” is added`;
    case 'deal_stage': return `When a deal moves to ${STAGE_LABELS[t.stage] || t.stage}`;
    case 'email_in': return 'When a contact writes back';
    case 'deal_quiet': return `When an open deal has had nothing for ${t.days} days`;
    default: return '';
  }
}
export function describeStep(s, templates = {}) {
  switch (s?.kind) {
    case 'wait': return `Wait ${[s.days ? `${s.days} day${s.days === 1 ? '' : 's'}` : '', s.hours ? `${s.hours} hour${s.hours === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ')}`;
    case 'task': return `Make a task: ${s.title}${s.dueDays ? ` (due in ${s.dueDays} day${s.dueDays === 1 ? '' : 's'})` : ' (due today)'}`;
    case 'tag': return [s.add ? `Add the tag “${s.add}”` : '', s.remove ? `remove the tag “${s.remove}”` : ''].filter(Boolean).join(', ');
    case 'email': return `Send the email “${templates[s.templateId] || 'template'}”`;
    default: return '';
  }
}

// The starter automations: made switched off. Each one only writes to people who already know us (the email step checks that again every time).
export function starterAutomations(templateIdByName = {}) {
  const t = n => templateIdByName[n];
  return [
    { name: 'Follow up after someone looks at a build', trigger: { type: 'showcase_view' }, stopOnReply: true, steps: [
      { kind: 'wait', days: 1 }, ...(t('After they looked at a build') ? [{ kind: 'email', templateId: t('After they looked at a build') }] : []),
      { kind: 'wait', days: 4 }, { kind: 'task', title: 'Check in with {{name}}: they looked at {{build}} and have not written back', dueDays: 0 }] },
    { name: 'Someone opened a live build', trigger: { type: 'showcase_demo' }, stopOnReply: true, steps: [
      { kind: 'task', title: '{{name}} opened {{build}}: say hello today', dueDays: 0 },
      { kind: 'wait', days: 2 }, ...(t('After they opened the live build') ? [{ kind: 'email', templateId: t('After they opened the live build') }] : []),
      { kind: 'wait', days: 5 }, { kind: 'task', title: 'Still nothing from {{name}}: call or let it go', dueDays: 0 }] },
    { name: 'A deal has gone quiet', trigger: { type: 'deal_quiet', days: 7 }, stopOnReply: true, reenterDays: 30, steps: [
      { kind: 'task', title: 'Nudge {{name}} ({{company|their company}}): nothing for a week', dueDays: 0 }] },
    { name: 'New website lead', trigger: { type: 'contact_created', source: 'website' }, stopOnReply: false, steps: [
      { kind: 'task', title: 'Reply to {{name}} within the day', dueDays: 0 }] }
  ];
}

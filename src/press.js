// Press comms: the rules that need no database or network (see press-routes.js, press-draft.js).
// A press item is a release, a pitch or an announcement, written once and sent one person at a time to people on the media list (contacts tagged `press`).
import { cleanUrl } from './builds.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const clipBlock = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const KINDS = ['release', 'pitch', 'announcement'];
export const KIND_LABEL = { release: 'Press release', pitch: 'Pitch', announcement: 'Announcement' };
export const STATUSES = ['draft', 'ready', 'archived'];
export const MEDIA_TAG = 'press';
export const PITCH_BATCH = 25, DEFAULT_DAILY_CAP = 25;

export function cleanItem(input = {}) {
  const i = input && typeof input === 'object' ? input : {}, title = clip(i.title, 120);
  if (!title) return { error: 'Give it a title (only you see it)' };
  const subject = clip(i.subject, 200), body = clipBlock(i.body, 8000);
  const status = STATUSES.includes(i.status) ? i.status : 'draft';
  if (status === 'ready' && (!subject || !body)) return { error: 'A subject and a message are needed before it can be marked ready' };
  return { value: { title, kind: KINDS.includes(i.kind) ? i.kind : 'pitch', build_id: UUID.test(String(i.buildId || '')) ? i.buildId : null, subject, body, audience: clip(i.audience, 200), status } };
}

// "[QUOTE FROM KYLE]", "[DATE]", "[CONTACT]": the assistant leaves a bracket wherever it was not given a fact. Nothing goes out with one still in it.
export const placeholdersIn = text => [...new Set((String(text ?? '').match(/\[[A-Z][A-Z0-9 ,'’./:-]{2,60}\]/g) || []))];

export function cleanCoverage(input = {}) {
  const i = input && typeof input === 'object' ? input : {}, outlet = clip(i.outlet, 120);
  if (!outlet) return { error: 'Which outlet ran it?' };
  const url = cleanUrl(i.url); if (url === null) return { error: 'The link must be a web address (https://…)' };
  let day = null; if (i.publishedOn) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(i.publishedOn)); const d = m && new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`); if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${m[1]}-${m[2]}-${m[3]}`) return { error: 'The date should look like 2026-10-14' }; day = `${m[1]}-${m[2]}-${m[3]}`; }
  return { value: { outlet, title: clip(i.title, 200), url, published_on: day, note: clip(i.note, 500), item_id: UUID.test(String(i.itemId || '')) ? i.itemId : null, contact_id: UUID.test(String(i.contactId || '')) ? i.contactId : null } };
}

export const isMedia = tags => (tags || []).includes(MEDIA_TAG);
export const beatsOf = tags => (tags || []).filter(t => /^beat-/.test(t)).map(t => t.slice(5));

// Who a pitch goes to, and who it does not, and why. `people`: [{ id, name, email, tags, unsubscribed, suppressed }], `already`: Set of ids pitched this item, `left`: pitches still allowed today.
export function pitchPlan({ people = [], already = new Set(), left = DEFAULT_DAILY_CAP, batch = PITCH_BATCH } = {}) {
  const send = [], skip = []; let room = Math.max(0, Math.min(left, batch));
  for (const p of people) {
    const why = !isMedia(p.tags) ? 'They are not on the media list (tag them press first).' : !p.email ? 'They have no email address.' : p.suppressed ? ({ unsubscribed: 'They unsubscribed.', bounced: 'Mail to them bounced.', complained: 'They marked an email as spam.', manual: 'They are marked as not to be emailed.' }[p.suppressed] || 'They cannot be emailed.') : p.unsubscribed ? 'They are marked as not to be emailed.' : already.has(p.id) ? 'They were already sent this one.' : null;
    if (why) skip.push({ id: p.id, name: p.name, reason: why }); else if (room > 0) { send.push(p); room--; } else skip.push({ id: p.id, name: p.name, reason: left < batch ? 'Today’s pitch limit is reached. Try again tomorrow.' : `A batch is at most ${batch}. Send the rest in the next batch.` });
  }
  return { send, skip };
}

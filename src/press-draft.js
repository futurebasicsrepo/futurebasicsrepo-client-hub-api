// The assistant that drafts a press release, pitch or announcement for staff to edit. It writes only from the facts it is given and leaves a [BRACKET] wherever a real
// release needs something it was not told (a quote, a date, a contact), and press.js refuses to send anything that still has one. A person always reads it first.
import Anthropic from '@anthropic-ai/sdk';
import { COMPANY_FACTS } from './chat-assistant.js';

export const PRESS_MODEL = process.env.PRESS_MODEL || 'claude-sonnet-5-5';
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const OWN_HOST = /^https?:\/\/([a-z0-9-]+\.)*thefuturebasics\.com(\/|$)/i;

export function draftFacts({ build = null, angle = '', audience = '' } = {}) {
  const lines = [...COMPANY_FACTS];
  if (build) lines.push(`The build: ${clip(build.name, 80)}${build.sector ? ` (${clip(build.sector, 40)})` : ''}, ${build.status}. ${clip(build.tagline, 140)} ${clip(build.summary, 1200)} Key features: ${(build.highlights || []).map(h => `${clip(h.title, 80)}${h.text ? ' (' + clip(h.text, 200) + ')' : ''}`).join('; ') || 'none listed'}. Built with: ${(build.stack || []).join(', ') || 'not listed'}.`);
  if (clip(angle, 600)) lines.push(`The angle staff want: ${clip(angle, 600)}`);
  if (clip(audience, 200)) lines.push(`Who it is for: ${clip(audience, 200)}`);
  return lines.join('\n');
}

const LENGTH = { release: 'a press release: the subject is the headline; the body starts with a dateline [CITY, DATE], then three or four short paragraphs (what it is, why it matters, how it works), a quote paragraph, a short "About Future Basics", and "Media contact: [NAME, EMAIL]". Under 350 words.', pitch: 'a short personal pitch to one journalist: it begins "Hi {{first_name|there}}," and ends with the sign-off {{sender}}. One concrete hook, why it suits {{company|your outlet}}, and a light ask. Under 150 words. No hype.', announcement: 'a short announcement for a newsletter or social post: a plain subject and under 120 words.' };

export function draftSystem(kind, facts) {
  return `You draft ${LENGTH[kind] || LENGTH.pitch}

Rules:
- Use only the FACTS below. Never invent a quote, number, customer, partner, date, location, award, funding, press mention, price or claim.
- Wherever a real ${kind === 'pitch' ? 'pitch' : 'release'} would need something you were not given (a quote, a date, a place, a contact, a figure), write a bracketed placeholder in capitals, like [QUOTE FROM KYLE] or [DATE]. A person will fill them in.
- Plain text only: no markdown, no emoji, no exclamation marks, no superlatives you cannot support from the facts.
- The only merge fields you may use are {{first_name|there}}, {{name}}, {{company|your outlet}} and {{sender}}, and only in a pitch.
- Respond with a subject and a body.

FACTS:
${facts}`;
}

const SCHEMA = { type: 'object', additionalProperties: false, required: ['subject', 'body'], properties: { subject: { type: 'string' }, body: { type: 'string' } } };

export function cleanDraft(out, kind) {
  const strip = t => String(t ?? '').replace(/\r/g, '').replace(/\*\*|__|`/g, '').replace(/https?:\/\/[^\s)]+/gi, u => (OWN_HOST.test(u) ? u : '')).replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const subject = strip(out?.subject).replace(/\n/g, ' ').slice(0, 160);
  let body = strip(out?.body).slice(0, 6000);
  if (kind !== 'pitch') body = body.replace(/\{\{[^}]*\}\}/g, ''); // merge fields only make sense in a pitch
  return { subject, body };
}

// → { subject, body }. `ask` is injected so tests need no key.
export async function draftPress({ kind = 'pitch', build = null, angle = '', audience = '', ask = defaultAsk } = {}) {
  const k = ['release', 'pitch', 'announcement'].includes(kind) ? kind : 'pitch';
  const out = cleanDraft(await ask({ system: draftSystem(k, draftFacts({ build, angle, audience })), kind: k, build }), k);
  if (!out.subject || !out.body) throw new Error('The assistant did not write anything usable. Try again, or write it yourself.');
  return out;
}

export async function defaultAsk({ system, kind, build }) {
  if (process.env.AI_FIXTURE) return { subject: `Fixture ${kind} about ${build?.name || 'Future Basics'}`, body: `${kind === 'pitch' ? 'Hi {{first_name|there}},\n\n' : '[CITY, DATE]\n\n'}Fixture draft about ${build?.name || 'Future Basics'}.\n\n[QUOTE FROM KYLE]${kind === 'pitch' ? '\n\n{{sender}}' : ''}` };
  const client = new Anthropic(), base = { model: PRESS_MODEL, max_tokens: 1800, system, messages: [{ role: 'user', content: 'Write it now.' }] };
  let res;
  try { res = await client.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } } }); }
  catch (e) { if (!(e instanceof Anthropic.BadRequestError)) throw e; res = await client.messages.create({ ...base, system: system + '\n\nRespond with a single JSON object matching this JSON schema and nothing else:\n' + JSON.stringify(SCHEMA) }); }
  if (res.stop_reason === 'refusal') throw new Error('The assistant declined to write this.');
  if (res.stop_reason === 'max_tokens') throw new Error('The draft was cut off. Try a shorter angle.');
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
}

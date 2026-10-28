// Sales intelligence: the rules that need no database or network (see intel-engine.js to run them, intel-routes.js for the staff API).
// A signal is one public post, comment or story that suggests someone may need what we do. Nothing here posts, messages or emails anyone: the AI reads and suggests, a person sends.
export const SERVICE_LINES = { ai: 'AI transformation and implementation', apps: 'Digital apps and tool development', product: 'Product development' };
export const LINE_KEYS = Object.keys(SERVICE_LINES);
export const INTENTS = ['buying', 'hiring', 'pain', 'asking', 'discussion'];
export const INTENT_LABEL = { buying: 'Looking to buy', hiring: 'Hiring for it', pain: 'In pain with what they have', asking: 'Asking for advice', discussion: 'Talking about it' };
export const CHANNELS = ['public_reply', 'dm', 'email', 'linkedin', 'x', 'reddit', 'discord', 'call', 'other'];
export const STATUSES = ['new', 'reviewing', 'actioned', 'replied', 'meeting', 'won', 'lost', 'dismissed'];
export const DEFAULT_SETTINGS = { provider: 'anthropic', dailyScoreCap: 200, minScore: 40, slaHours: 24, ignoreHandles: [], ignoreDomains: [], retentionDays: 90, runEveryMinutes: 60, teams: {} };

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// → { value } or { error }
export function cleanSettings(input = {}, cur = DEFAULT_SETTINGS) {
  const i = input && typeof input === 'object' ? input : {}, o = { ...DEFAULT_SETTINGS, ...cur };
  if ('provider' in i) { if (!['anthropic', 'openai', 'xai'].includes(i.provider)) return { error: 'Choose Claude, ChatGPT or Grok' }; o.provider = i.provider; }
  if ('dailyScoreCap' in i) { const n = Math.round(Number(i.dailyScoreCap)); if (!Number.isFinite(n) || n < 0 || n > 5000) return { error: 'The daily AI reading limit is 0 to 5000' }; o.dailyScoreCap = n; }
  if ('minScore' in i) { const n = Math.round(Number(i.minScore)); if (!Number.isFinite(n) || n < 0 || n > 100) return { error: 'The score to surface is 0 to 100' }; o.minScore = n; }
  if ('slaHours' in i) { const n = Math.round(Number(i.slaHours)); if (!Number.isFinite(n) || n < 1 || n > 168) return { error: 'The time to first action is 1 to 168 hours' }; o.slaHours = n; }
  if ('retentionDays' in i) { const n = Math.round(Number(i.retentionDays)); if (!Number.isFinite(n) || n < 7 || n > 730) return { error: 'Keep post text for 7 to 730 days' }; o.retentionDays = n; }
  if ('runEveryMinutes' in i) { const n = Math.round(Number(i.runEveryMinutes)); if (!Number.isFinite(n) || n < 15 || n > 1440) return { error: 'Listen every 15 to 1440 minutes' }; o.runEveryMinutes = n; }
  const list = (v, re) => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map(x => String(x).trim().toLowerCase().replace(/^@/, '')).filter(x => x && re.test(x)).slice(0, 200);
  if ('ignoreHandles' in i) o.ignoreHandles = [...new Set(list(i.ignoreHandles, /^[a-z0-9_.-]{1,60}$/))];
  if ('ignoreDomains' in i) o.ignoreDomains = [...new Set(list(i.ignoreDomains, /^[a-z0-9.-]+\.[a-z]{2,}$/).map(d => d.replace(/^www\./, '')))];
  if ('teams' in i) { const t = {}; for (const [k, v] of Object.entries(i.teams && typeof i.teams === 'object' ? i.teams : {})) { const name = clip(v, 40); if (/^[0-9a-f-]{36}$/i.test(k) && name) t[k.toLowerCase()] = name; } o.teams = t; }
  return { value: o };
}

// A watch from the form → { value } or { error }. The query rules for each source live in intel-sources.js; here only that it is not empty.
export function cleanWatch(input = {}, kinds = []) {
  const i = input && typeof input === 'object' ? input : {}, name = clip(i.name, 80), query = clip(i.query, 500);
  if (!name) return { error: 'Give the watch a name' };
  if (!kinds.includes(i.kind)) return { error: 'Choose where to listen' };
  if (!query) return { error: 'Say what to listen for' };
  const line = i.serviceLine === undefined || i.serviceLine === '' ? 'any' : i.serviceLine; if (line !== 'any' && !LINE_KEYS.includes(line)) return { error: 'Choose one of our three services, or any' };
  return { value: { name, kind: i.kind, query, service_line: line, enabled: i.enabled !== false && i.enabled !== 'false' } };
}

// ---------- a cheap first look, so the AI is only asked about posts that could matter ----------
const LINE_WORDS = {
  ai: /\b(ai|a\.i\.|artificial intelligence|llm|llms|gpt|chatgpt|claude|openai|anthropic|copilot|agents?|automat\w+|machine learning|ml model|chatbot|rag|prompt|workflow)\b/i,
  apps: /\b(app|apps|web ?app|website|saas|dashboard|portal|mvp|integration|api|custom software|software|developer|developers|dev shop|no-?code|low-?code|shopify|storefront|platform|internal tool|crm|erp)\b/i,
  product: /\b(manufactur\w+|factory|factories|tech ?pack|samples?|prototype|prototyping|product design|sourcing|supplier|suppliers|apparel|footwear|garment|packaging|private label|cad|cmf|industrial design|hardware product|dtc)\b/i
};
export const ASK_WORDS = /\b(need|needs|needed|looking for|looking to|want to|wanting|hire|hiring|recommend\w*|anyone know|anybody know|suggest\w*|who can|who do you|help|how (do|can|should|would) (i|we)|struggl\w+|frustrat\w+|alternatives?|quote|budget|rfp|agency|agencies|consultant|consultants|freelanc\w+|contractor|co-?founder|outsourc\w+|build(ing)? (a|an|our|my)|ideas? for)\b/i;
export function prefilter(text) {
  const t = String(text || ''), lines = LINE_KEYS.filter(k => LINE_WORDS[k].test(t));
  return { pass: lines.length > 0 && ASK_WORDS.test(t), lines };
}

// Why a post was left unread by the cheap first look, in words a person can act on ('' when it would pass).
export function firstLookReason(text) {
  const t = String(text || ''), lines = LINE_KEYS.filter(k => LINE_WORDS[k].test(t));
  if (!lines.length) return 'It does not mention AI, apps or software, or product development, so the AI was not asked about it.';
  if (!ASK_WORDS.test(t)) return `It mentions ${lines.map(k => ({ ai: 'AI', apps: 'apps or software', product: 'product development' })[k]).join(' and ')} but does not sound like someone asking for help, hiring or looking for a quote.`;
  return '';
}

// What Future Basics should do next with a signal, from where it stands. A suggestion: a person does it.
export function nextStep({ status, intent, draftChannel, contactId } = {}) {
  if (['dismissed', 'won', 'lost'].includes(status)) return '';
  if (status === 'actioned') return 'Watch for a reply. If there is none in three days, follow up once, briefly.';
  if (status === 'replied') return 'Answer them and offer a call, then log “Meeting booked”.';
  if (status === 'meeting') return 'Prepare for the call. When it is decided, log Won or Lost.';
  const how = { public_reply: 'Reply in the thread with the draft below (read the community’s rules on promotion first)', dm: 'Send the draft as a direct message', email: 'Email them the draft' }[draftChannel] || 'Reach out with the draft below';
  const lead = { buying: 'They look ready to buy, so do this today. ', hiring: 'They are hiring for this, so offer us as the faster alternative to a hire. ', pain: 'They are unhappy with what they have, so lead with the problem, not with us. ', asking: 'They want advice, so be useful first and do not pitch. ' }[intent] || '';
  return `${lead}${how}, then log it with “I sent it”.${contactId ? '' : ' Add them to the CRM so the follow-up is tracked.'}`;
}

// 100 for something posted in the last 6 hours, falling to 0 at a week
export function freshness(postedAt, now = Date.now()) {
  const t = new Date(postedAt).getTime(); if (!Number.isFinite(t)) return 40;
  const h = Math.max(0, (now - t) / 3600_000); return h <= 6 ? 100 : h >= 168 ? 0 : Math.round(100 * (1 - (h - 6) / 162));
}
export function computeScore({ relevant, fit, urgency, postedAt }, now = Date.now()) {
  if (!relevant) return 0;
  return Math.min(100, Math.max(0, Math.round(int(fit, 0, 100, 0) * 0.55 + int(urgency, 0, 100, 0) * 0.35 + freshness(postedAt, now) * 0.10)));
}

// ---------- what the AI is told, and what we accept back ----------
export const systemPrompt = () => `You help the sales team at Future Basics find people who may need what we do. We sell three services:
1. AI transformation and implementation: helping a business work out where AI pays off, and building it in (automation, assistants, agents, data work).
2. Digital apps and tool development: websites, web apps, internal tools, integrations, storefronts and prototypes.
3. Product development: taking a physical product from idea to manufacturing (design, tech packs, sourcing, factories, samples).

You will be given one public post, comment or story. Decide whether the person or company behind it could plausibly buy one of those services, and how soon. Be strict: most posts are not opportunities, a vendor advertising itself is not one, and a student asking for homework help is not one.

Rules for what you write:
- Use only what is in the post. Never invent facts about the person, their company, or about us (no clients, results, prices, awards or capabilities beyond the three services above).
- The draft is a first reply for a person to edit and send themselves: warm, specific, short, useful before it sells. No links unless the post asks for one, no hype, no exclamation marks, no emoji, no "I hope this finds you well". If a community forbids promotion the draft must be a genuinely helpful answer with no pitch, and you say so in "risks".
- Say plainly in "risks" anything a person should check first (a promotion rule, a competitor, a very old post, a poster who may be a bot).
Answer with a JSON object with exactly these keys: relevant (boolean), serviceLine ("ai", "apps", "product" or "none"), intent ("buying", "hiring", "pain", "asking" or "discussion"), fit (0-100: how well this person's need matches what we do), urgency (0-100: how soon they need it), summary (one sentence: who they are and what they need), whyNow (one sentence: why this is worth a person's time today, or "" if it is not), angle (one sentence: the most useful thing to say), draft (the reply, or "" if not relevant), channel ("public_reply", "dm" or "none": where a reply belongs), risks (one sentence or "").`;
export const userPrompt = s => `Source: ${s.source}${s.watch ? ` (watch: ${s.watch})` : ''}\nPosted: ${s.posted_at ? new Date(s.posted_at).toISOString() : 'unknown'}\nAuthor: ${clip(s.author, 80) || 'unknown'}\nLink: ${s.url || 'none'}\n\nTitle: ${clip(s.title, 300) || '(none)'}\n\nText:\n${String(s.body || '').slice(0, 3500) || '(none)'}`;

export function cleanVerdict(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const relevant = r.relevant === true && LINE_KEYS.includes(r.serviceLine);
  return { relevant, serviceLine: relevant ? r.serviceLine : null, intent: INTENTS.includes(r.intent) ? r.intent : 'discussion', fit: relevant ? int(r.fit, 0, 100, 0) : 0, urgency: relevant ? int(r.urgency, 0, 100, 0) : 0,
    summary: clip(r.summary, 300), whyNow: relevant ? clip(r.whyNow, 300) : '', angle: relevant ? clip(r.angle, 300) : '', draft: relevant ? String(r.draft ?? '').replace(/\r/g, '').trim().slice(0, 2000) : '', channel: ['public_reply', 'dm', 'none'].includes(r.channel) ? r.channel : 'none', risks: clip(r.risks, 300) };
}

// The stand-in the journeys use when AI_FIXTURE is set: deterministic, and honest about being a stand-in.
export function fixtureVerdict({ user }) {
  const t = String(user), no = /NOFIT/.test(t), line = LINE_KEYS.find(k => LINE_WORDS[k].test(t)) || 'apps';
  return no ? { relevant: false, serviceLine: 'none', intent: 'discussion', fit: 0, urgency: 0, summary: 'Not an opportunity.', whyNow: '', angle: '', draft: '', channel: 'none', risks: '' }
    : { relevant: true, serviceLine: line, intent: /hiring|hire/i.test(t) ? 'hiring' : 'buying', fit: /STRONG/.test(t) ? 90 : 70, urgency: /URGENT/.test(t) ? 90 : 55, summary: 'Fixture: someone who needs help.', whyNow: 'Fixture: they asked today.', angle: 'Fixture: answer the question first.', draft: 'Fixture draft: happy to share how we would approach this.', channel: 'public_reply', risks: '' };
}

// should this author or address be left alone?
export function ignored(item, settings = DEFAULT_SETTINGS) {
  const handle = String(item.author || '').toLowerCase().replace(/^@/, ''); let host = ''; try { host = new URL(item.url).host.toLowerCase().replace(/^www\./, ''); } catch { /* no address */ }
  return (settings.ignoreHandles || []).includes(handle) || (settings.ignoreDomains || []).some(d => host === d || host.endsWith('.' + d));
}

// the next status for something staff did (one place for the rules)
export function nextStatus(cur, kind) {
  const open = ['new', 'reviewing'];
  switch (kind) {
    case 'claimed': case 'assigned': return open.includes(cur) ? 'reviewing' : cur;
    case 'released': return cur === 'reviewing' ? 'new' : cur;
    case 'outreach': return ['new', 'reviewing', 'actioned'].includes(cur) ? 'actioned' : cur;
    case 'reply': return ['new', 'reviewing', 'actioned'].includes(cur) ? 'replied' : cur;
    case 'meeting': return ['new', 'reviewing', 'actioned', 'replied'].includes(cur) ? 'meeting' : cur;
    case 'won': return 'won'; case 'lost': return 'lost'; case 'dismissed': return 'dismissed';
    case 'reopened': return ['dismissed', 'lost'].includes(cur) ? 'new' : cur;
    default: return cur;
  }
}

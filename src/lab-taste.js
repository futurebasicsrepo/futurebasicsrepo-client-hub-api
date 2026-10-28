// The Lab learns our taste from what gets approved and rejected. Every approval, rejection, client verdict and the reasons written with them are
// read into a short, honest picture of what we lean towards and what we turn down: fabrics, shapes, colours, details, categories and price bands,
// each with how often it was approved and how often it was rejected. The assistant is given that picture before it designs concepts or changes
// a range, so the next round starts from what we actually chose, not only from the brand code. Nothing here is a black box: the page shows
// every count, and the team can switch the learned taste off.
import { ask as realAsk, providerReady, costCents } from './intel-llm.js';
import { brandCodeWords, DEFAULT_BRAND_CODE, categoryLabel } from './lab.js';

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const low = s => clip(s, 60).toLowerCase().replace(/[.;:!]+$/, '');
export const TASTE_KINDS = { fabric: 'Fabric', silhouette: 'Shape', fit: 'Fit', colour: 'Colour', detail: 'Detail', category: 'Category', technique: 'Graphic technique', price: 'Price band' };
const band = cents => { if (cents == null) return ''; const d = cents / 100; return d < 40 ? 'under $40' : d < 80 ? '$40–80' : d < 150 ? '$80–150' : d < 300 ? '$150–300' : '$300 and up'; };

// the signals one concept gives: +1 for each approval (ours, the client's), -1 for each rejection or request for changes
export function signalsOf(c) {
  const up = (c.status === 'approved' || c.status === 'tech_pack' ? 1 : 0) + (c.client_verdict === 'approved' ? 1 : 0);
  const down = (c.status === 'rejected' ? 1 : 0) + (c.client_verdict === 'changes' ? 1 : 0);
  return { up, down };
}
// the traits one concept carries, as (kind, word) pairs
export function traitsOf(c) {
  const s = c.spec || {}, out = [];
  if (s.fabric) out.push(['fabric', low(s.fabric)]);
  if (s.silhouette) out.push(['silhouette', low(s.silhouette)]);
  if (s.fit) out.push(['fit', low(s.fit)]);
  for (const col of Array.isArray(s.colors) ? s.colors : []) if (col) out.push(['colour', low(col)]);
  for (const d of Array.isArray(s.details) ? s.details : []) if (d) out.push(['detail', low(d)]);
  for (const g of Array.isArray(s.graphics) ? s.graphics : []) if (g?.technique) out.push(['technique', low(g.technique)]);
  if (c.category) out.push(['category', categoryLabel(c.category).toLowerCase()]);
  const b = band(c.price_cents); if (b) out.push(['price', b]);
  return out;
}
// → what we lean towards and what we turn down, counted. `concepts` are rows with status, client_verdict, spec, category, price_cents, rejected_reason, client_note.
export function tasteStats(concepts = [], { now = new Date() } = {}) {
  const tally = new Map(); let approved = 0, rejected = 0, clientApproved = 0, clientChanges = 0; const reasons = [];
  for (const c of concepts) {
    const { up, down } = signalsOf(c); if (!up && !down) continue;
    if (c.status === 'approved' || c.status === 'tech_pack') approved++; if (c.status === 'rejected') rejected++;
    if (c.client_verdict === 'approved') clientApproved++; if (c.client_verdict === 'changes') clientChanges++;
    if (c.status === 'rejected' && c.rejected_reason) reasons.push({ about: clip(c.name, 60), why: clip(c.rejected_reason, 200), who: 'us' });
    if (c.client_verdict === 'changes' && c.client_note) reasons.push({ about: clip(c.name, 60), why: clip(c.client_note, 200), who: 'client' });
    for (const [kind, word] of new Map(traitsOf(c).map(t => [t.join(':'), t])).values()) {
      const k = `${kind}:${word}`, e = tally.get(k) || { kind, word, up: 0, down: 0 }; e.up += up; e.down += down; tally.set(k, e);
    }
  }
  const rows = [...tally.values()].map(e => ({ ...e, score: Math.round(((e.up + 1) / (e.up + e.down + 2)) * 100) / 100 }));
  const likes = rows.filter(e => e.up >= 2 && e.up > e.down).sort((a, b) => b.up - a.up || a.down - b.down || a.word.localeCompare(b.word)).slice(0, 16);
  const dislikes = rows.filter(e => e.down >= 2 && e.down >= e.up).sort((a, b) => b.down - a.down || a.up - b.up || a.word.localeCompare(b.word)).slice(0, 12);
  return { at: now.toISOString(), counts: { approved, rejected, clientApproved, clientChanges, read: approved + rejected }, likes, dislikes, reasons: reasons.slice(-12) };
}
// the learned taste as a paragraph for the assistant: '' when there is too little to go on
export function tasteWords(taste) {
  if (!taste || taste.use === false) return '';
  const c = taste.counts || {}; if ((c.read || 0) < 2 && !(taste.digest?.likes?.length)) return '';
  const say = e => `${TASTE_KINDS[e.kind] || e.kind} "${e.word}" (${e.up} for, ${e.down} against)`;
  const lines = [`What the team has approved and rejected so far (${c.approved || 0} approved, ${c.rejected || 0} rejected${c.clientApproved || c.clientChanges ? `; clients approved ${c.clientApproved || 0} and asked for changes on ${c.clientChanges || 0}` : ''}). Follow it unless the brief says otherwise.`];
  if (taste.digest?.summary) lines.push(clip(taste.digest.summary, 500));
  if (taste.digest?.likes?.length) lines.push(`We lean towards: ${taste.digest.likes.map(s => clip(s, 120)).join('; ')}.`);
  else if (taste.likes?.length) lines.push(`We lean towards: ${taste.likes.slice(0, 8).map(say).join('; ')}.`);
  if (taste.digest?.dislikes?.length) lines.push(`We turn down: ${taste.digest.dislikes.map(s => clip(s, 120)).join('; ')}.`);
  else if (taste.dislikes?.length) lines.push(`We turn down: ${taste.dislikes.slice(0, 6).map(say).join('; ')}.`);
  if (taste.reasons?.length) lines.push(`Reasons given when something was turned down: ${taste.reasons.slice(-5).map(r => `"${r.why}"`).join(' ')}`);
  return lines.join('\n').slice(0, 1800);
}
export function tasteFixture({ user }) {
  const likes = [...user.matchAll(/^- (?:Fabric|Shape|Fit|Colour|Detail|Category|Graphic technique|Price band) "([^"]+)" \((\d+) for, (\d+) against\)$/gm)].filter(m => Number(m[2]) > Number(m[3])).map(m => m[1]);
  return { summary: `Test fixture: the team approves quiet, well-cut pieces${likes.length ? ` and keeps coming back to ${likes[0]}` : ''}; loud colour and thin fabric are turned down.`, likes: likes.length ? likes.slice(0, 4).map(l => `${l}, again and again`) : ['quiet heritage shapes'], dislikes: ['thin fabric', 'loud trend colour'] };
}
// the assistant reads the counts and the reasons and writes the taste in a few plain lines (what the counts cannot say: why)
export async function tasteDigest({ stats, code = DEFAULT_BRAND_CODE, askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  if (!providerReady('anthropic', env)) throw Object.assign(new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)'), { status: 503 });
  const say = e => `- ${TASTE_KINDS[e.kind] || e.kind} "${e.word}" (${e.up} for, ${e.down} against)`;
  const system = `You are the design director's assistant at Future Basics. You read the record of which concepts the team and its clients approved and rejected, and write what that says about our taste: a short, specific, honest read that a designer can follow. Only say what the record supports. Never name another brand.\n${brandCodeWords(code)}`;
  const user = `Counts: ${stats.counts.approved} approved, ${stats.counts.rejected} rejected, clients approved ${stats.counts.clientApproved}, clients asked for changes on ${stats.counts.clientChanges}.\nTraits that were approved more than rejected:\n${stats.likes.map(say).join('\n') || '(none yet)'}\nTraits that were rejected more than approved:\n${stats.dislikes.map(say).join('\n') || '(none yet)'}\nReasons written when something was turned down:\n${stats.reasons.map(r => `- ${r.who === 'client' ? 'client' : 'we'} on "${r.about}": ${r.why}`).join('\n') || '(none)'}\n\nAnswer {"summary":"two or three sentences on our taste, as the record shows it","likes":["3-6 short, specific things we lean towards"],"dislikes":["2-5 short, specific things we turn down"]}`;
  const res = await askImpl({ provider: 'anthropic', system, user, json: true, maxTokens: 900, env, fetchImpl, fixture: tasteFixture });
  const j = res.json || {}, list = (v, n) => (Array.isArray(v) ? v : []).map(s => clip(s, 160)).filter(Boolean).slice(0, n);
  return { digest: { summary: clip(j.summary, 600), likes: list(j.likes, 6), dislikes: list(j.dislikes, 5), model: res.model || '' }, costCents: costCents('anthropic', res.usage?.input || 0, res.usage?.output || 0, env) };
}
// read the board, count, keep: the counts always, the assistant's read when asked for (it costs a call)
export async function learnTaste({ pool, getSetting, setSetting, withAi = false, code = null, askImpl = realAsk, env = process.env, fetchImpl = fetch } = {}) {
  const rows = (await pool.query(`select name, status, client_verdict, client_note, rejected_reason, spec, category, price_cents from lab_concepts where status in ('approved','rejected','tech_pack') or client_verdict in ('approved','changes') order by updated_at desc limit 600`)).rows;
  const prev = (await getSetting('labTaste').catch(() => null)) || {}, stats = tasteStats(rows);
  let next = { ...stats, use: prev.use !== false, digest: prev.digest || null, digestAt: prev.digestAt || null, costCents: 0 };
  if (withAi) { const d = await tasteDigest({ stats, code: code || DEFAULT_BRAND_CODE, askImpl, env, fetchImpl }); next = { ...next, digest: d.digest, digestAt: new Date().toISOString(), costCents: d.costCents }; }
  await setSetting('labTaste', next); return next;
}
export const cleanTasteUse = v => v !== false && v !== 'false' && v !== 0;

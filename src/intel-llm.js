// One way to ask Claude, OpenAI or Grok a question and get text or JSON back, with what it cost. Plain functions with the network passed in, so every rule is tested without a key.
//   Anthropic: the SDK, as the rest of the platform does.   OpenAI and xAI (Grok): their chat-completions API over fetch (xAI's is OpenAI-compatible).
// Keys come from the environment only (ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY) and are never stored, logged or sent to a browser.
import Anthropic from '@anthropic-ai/sdk';

export const PROVIDERS = ['anthropic', 'openai', 'xai'];
export const PROVIDER_LABEL = { anthropic: 'Claude (Anthropic)', openai: 'ChatGPT (OpenAI)', xai: 'Grok (xAI)' };
export const KEY_ENV = { anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', xai: 'XAI_API_KEY' };
// Defaults, all overridable: the model names below are the ones to change first if a provider answers "model not found".
export const DEFAULT_MODEL = { anthropic: 'claude-haiku-5-5', openai: 'gpt-5-mini', xai: 'grok-4' };
export const ORIGIN = { openai: 'https://api.openai.com', xai: 'https://api.x.ai' };
// Rough dollars per million tokens (input, output) so the page can say what listening costs. An estimate, not an invoice: override with INTEL_PRICES='{"openai":[0.25,2]}'.
export const PRICE = { anthropic: [1, 5], openai: [0.25, 2], xai: [3, 15] };

export const modelFor = (provider, env = process.env, override = '') => String(override || env[`INTEL_${provider.toUpperCase()}_MODEL`] || (provider === 'anthropic' ? env.INTEL_MODEL : '') || DEFAULT_MODEL[provider] || '');
export const originFor = (provider, env = process.env) => String(env[`${provider.toUpperCase()}_API_ORIGIN`] || ORIGIN[provider] || '').replace(/\/$/, '');
export function providerReady(provider, env = process.env) { return provider === 'anthropic' ? Boolean(env.ANTHROPIC_API_KEY || env.AI_FIXTURE) : Boolean(env[KEY_ENV[provider]]); }
export const providerStatus = (env = process.env) => PROVIDERS.map(p => ({ provider: p, label: PROVIDER_LABEL[p], ready: providerReady(p, env), model: modelFor(p, env), keyName: KEY_ENV[p] }));

export function costCents(provider, inTok, outTok, env = process.env) {
  let table = PRICE; try { if (env.INTEL_PRICES) table = { ...PRICE, ...JSON.parse(env.INTEL_PRICES) }; } catch { /* a bad override falls back to the defaults */ }
  const [i, o] = table[provider] || [0, 0]; return Math.round(((inTok * i + outTok * o) / 1_000_000) * 100 * 1000) / 1000;
}

// The first JSON object in a model's answer, however it was wrapped (a code fence, a sentence before it).
export function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('The model did not answer with JSON');
  try { return JSON.parse(t.slice(a, b + 1)); } catch { throw new Error('The model answered with broken JSON'); }
}

// → { text, json?, usage: { input, output }, model, provider }. `json` asks for a JSON object back (and parses it). `fixture` answers when AI_FIXTURE is set (the journeys).
export async function ask({ provider = 'anthropic', system = '', user = '', json = false, maxTokens = 900, model = '', env = process.env, fetchImpl = fetch, fixture = null } = {}) {
  if (!PROVIDERS.includes(provider)) throw new Error(`Unknown AI provider: ${provider}`);
  const m = modelFor(provider, env, model);
  if (provider === 'anthropic') {
    if (env.AI_FIXTURE && fixture) { const out = fixture({ system, user }); return { text: typeof out === 'string' ? out : JSON.stringify(out), json: typeof out === 'object' ? out : undefined, usage: { input: 0, output: 0 }, model: 'fixture', provider }; }
    if (!env.ANTHROPIC_API_KEY) throw new Error('Claude is not connected (the service needs ANTHROPIC_API_KEY)');
    const client = new Anthropic(), res = await client.messages.create({ model: m, max_tokens: maxTokens, system: json ? `${system}\n\nAnswer with one JSON object and nothing else.` : system, messages: [{ role: 'user', content: user }] });
    if (res.stop_reason === 'refusal') throw new Error('Claude declined to answer');
    if (json && res.stop_reason === 'max_tokens') throw new Error('The answer ran out of room before it was finished. Try again, or ask for fewer pieces.');
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return { text, ...(json ? { json: parseJson(text) } : {}), usage: { input: res.usage?.input_tokens || 0, output: res.usage?.output_tokens || 0 }, model: m, provider };
  }
  const key = env[KEY_ENV[provider]]; if (!key) throw new Error(`${PROVIDER_LABEL[provider]} is not connected (the service needs ${KEY_ENV[provider]})`);
  const res = await fetchImpl(`${originFor(provider, env)}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: m, messages: [{ role: 'system', content: json ? `${system}\n\nAnswer with one JSON object and nothing else.` : system }, { role: 'user', content: user }], ...(json ? { response_format: { type: 'json_object' } } : {}), max_completion_tokens: maxTokens }) }).catch(() => { throw new Error(`Could not reach ${PROVIDER_LABEL[provider]}`); });
  const j = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error(`${PROVIDER_LABEL[provider]} refused the key`), { refused: true });
  if (!res.ok) throw new Error(`${PROVIDER_LABEL[provider]} answered ${res.status}: ${String(j.error?.message || '').slice(0, 160)}`);
  const text = String(j.choices?.[0]?.message?.content || '').trim(); if (!text) throw new Error(`${PROVIDER_LABEL[provider]} sent an empty answer`);
  return { text, ...(json ? { json: parseJson(text) } : {}), usage: { input: j.usage?.prompt_tokens || 0, output: j.usage?.completion_tokens || 0 }, model: m, provider };
}

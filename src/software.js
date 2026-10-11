// Software development in a client's room: the rules that need no database or network.
// A project is either product development (tech packs, factories) or software development: a site or app we build for the client. A software project is tied to a
// build (the same record the builds showcase shows), moves through stages, and carries the client's choice of where they sell.
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PROJECT_KINDS = ['product', 'software'];
export const KIND_LABEL = { product: 'Product development', software: 'Software development' };

export const SW_STAGES = [
  { key: 'discovery', label: 'Discovery', hint: 'Agreeing what to build and for whom' },
  { key: 'prototype', label: 'Prototype', hint: 'A first version to react to' },
  { key: 'build', label: 'Build', hint: 'Making the real thing' },
  { key: 'review', label: 'Client review', hint: 'Waiting on the client to look and answer' },
  { key: 'launch', label: 'Launch', hint: 'Going live, handing over' },
  { key: 'live', label: 'Live', hint: 'Running for the client' },
  { key: 'maintenance', label: 'Support', hint: 'Keeping it healthy and improving it' }
];
export const STAGE_KEYS = SW_STAGES.map(s => s.key);
export const stageIndex = k => Math.max(0, STAGE_KEYS.indexOf(k));
export const stageLabel = k => SW_STAGES.find(s => s.key === k)?.label || '';
// who has the ball at a stage, in the words the queues use
export const stageOwner = k => (k === 'review' ? 'client' : k === 'live' || k === 'maintenance' ? 'none' : 'us');

export const COMMERCE_PLATFORMS = [
  { key: 'shopify', label: 'Shopify' },
  { key: 'square', label: 'Square' },
  { key: 'wix', label: 'Wix' },
  { key: 'other', label: 'Something else' }
];
export const platformLabel = k => COMMERCE_PLATFORMS.find(p => p.key === k)?.label || '';
// '' (not chosen) or a platform key; null when it is neither
export const cleanPlatform = v => { const s = String(v ?? '').trim().toLowerCase(); return s === '' ? '' : COMMERCE_PLATFORMS.some(p => p.key === s) ? s : null; };

// → { value } or { error }. `kind` decides what else is read: a software project can name its build and stage.
export function cleanProject(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const name = clip(i.name, 120); if (!name) return { error: 'Project name required' };
  const kind = i.kind === undefined || i.kind === '' ? 'product' : i.kind; if (!PROJECT_KINDS.includes(kind)) return { error: 'A project is product development or software development' };
  const v = { name, kind, build_id: null, stage: null };
  if (kind === 'software') {
    if (i.buildId) { if (!UUID.test(String(i.buildId))) return { error: 'Choose one of the builds' }; v.build_id = String(i.buildId); }
    const stage = i.stage === undefined || i.stage === '' ? 'discovery' : i.stage; if (!STAGE_KEYS.includes(stage)) return { error: 'That is not a stage a software project goes through' };
    v.stage = stage;
  }
  return { value: v };
}

// The picture a client or staff member sees of a software project: stage rail, build summary, where it sells. `build` is the row (or null).
export function softwareView(project, build = null) {
  const stage = STAGE_KEYS.includes(project?.stage) ? project.stage : 'discovery', at = stageIndex(stage);
  return {
    kind: 'software', stage, stageLabel: stageLabel(stage), stageHint: SW_STAGES[at].hint, owner: stageOwner(stage),
    rail: SW_STAGES.map((s, n) => ({ key: s.key, label: s.label, state: n < at ? 'done' : n === at ? 'now' : 'next' })),
    build: build ? { id: build.id, slug: build.slug, name: build.name, status: build.status, liveUrl: build.live_url || '', stack: build.stack || [], features: (build.highlights || []).map(h => h.title).filter(Boolean).slice(0, 6), tagline: build.tagline || '' } : null
  };
}

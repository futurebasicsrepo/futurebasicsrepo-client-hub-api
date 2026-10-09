// The product flow. Every product runs through the same eight milestones, and what actually happened moves it: a client
// submitting, Future Basics publishing a version, the client approving it, a quote accepted, the deposit paid, the factory
// countersigning, the sample approved, goods shipped. Each event names the milestone the product is now at and who it is
// waiting on (the milestone's responsible party), so the console, the hub and the queues all read one answer.
// Staff can still set a milestone by hand from the console; that override is logged with its note.
export const STAGES = ['Brief', 'Concept', 'Development', 'Sample', 'Approval', 'Production', 'Quality', 'Delivery'];
export const OWNERS = ['client', 'future-basics', 'factory'];
export const OWNER_LABELS = { client: 'the client', 'future-basics': 'Future Basics', factory: 'the factory' };
export const MILESTONE_STATUSES = ['upcoming', 'current', 'blocked', 'complete', 'skipped'];

// stage: the milestone that becomes current (null = every milestone complete). back: the event may move a product backwards
// (a new version or a change request reopens the spec); every other event only ever moves forward.
export const FLOW_EVENTS = {
  'product-created':        { stage: 'Brief',       owner: 'client',        label: 'Product added' },
  'pack-submitted':         { stage: 'Concept',     owner: 'future-basics', label: 'Tech pack submitted for review', back: true },
  'pack-returned':          { stage: 'Brief',       owner: 'client',        label: 'Draft returned to the client', back: true },
  'pack-published':         { stage: 'Concept',     owner: 'client',        label: 'New version published for approval', back: true },
  'pack-changes-requested': { stage: 'Concept',     owner: 'future-basics', label: 'Client asked for changes to the tech pack', back: true },
  'pack-approved':          { stage: 'Development', owner: 'future-basics', label: 'Client approved the tech pack' },
  'quote-issued':           { stage: 'Development', owner: 'client',        label: 'Quote issued' },
  'quote-declined':         { stage: 'Development', owner: 'future-basics', label: 'Client declined the quote' },
  'quote-accepted':         { stage: 'Development', owner: 'client',        label: 'Quote accepted, sample deposit due' },
  'deposit-paid':           { stage: 'Development', owner: 'future-basics', label: 'Sample deposit paid' },
  'pack-signed':            { stage: 'Development', owner: 'factory',       label: 'Future Basics signed, waiting on the factory' },
  'pack-locked':            { stage: 'Sample',      owner: 'factory',       label: 'Tech pack locked, factory sampling' },
  'sample-posted':          { stage: 'Approval',    owner: 'client',        label: 'Sample ready for the client to review' },
  'sample-changes':         { stage: 'Concept',     owner: 'future-basics', label: 'Client asked for changes to the sample', back: true },
  'sample-approved':        { stage: 'Production',  owner: 'future-basics', label: 'Client approved the sample' },
  'production-started':     { stage: 'Production',  owner: 'factory',       label: 'Production run started' },
  'qc-started':             { stage: 'Quality',     owner: 'future-basics', label: 'Quality check under way' },
  'qc-passed':              { stage: 'Delivery',    owner: 'factory',       label: 'Passed quality check, ready to ship' },
  'shipped':                { stage: 'Delivery',    owner: 'client',        label: 'Shipped' },
  'delivered':              { stage: null,          owner: null,            label: 'Delivered' },
  'reopened':               { stage: 'Delivery',    owner: 'future-basics', label: 'Reopened', back: true },
};

const idx = name => STAGES.findIndex(s => s.toLowerCase() === String(name || '').toLowerCase());
// The milestone a product is at: the first current or blocked one, else the first not finished, else past the end.
export function currentIndex(milestones) {
  const rows = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const open = rows.findIndex(m => m.status === 'current' || m.status === 'blocked');
  if (open >= 0) return idx(rows[open].name);
  const next = rows.findIndex(m => !['complete', 'skipped'].includes(m.status));
  return next >= 0 ? idx(rows[next].name) : STAGES.length;
}

// What each milestone should become for an event. Returns null when the event changes nothing (a forward-only event that
// arrives after the product has already moved past it). Skipped milestones (a rushed product skips Sample) stay skipped,
// and an event landing on one moves on to the next milestone that is not skipped.
export function planFlow(milestones, event, { owner } = {}) {
  const ev = FLOW_EVENTS[event]; if (!ev) throw new Error(`Unknown flow event: ${event}`);
  const rows = [...milestones].sort((a, b) => a.sort_order - b.sort_order);
  const byStage = new Map(rows.map(m => [idx(m.name), m]));
  let target = ev.stage === null ? STAGES.length : idx(ev.stage);
  while (target < STAGES.length && byStage.get(target)?.status === 'skipped') target++;
  const now = currentIndex(rows);
  if (target < now && !ev.back) return null;
  const who = owner || ev.owner;
  const updates = rows.map(m => {
    const i = idx(m.name);
    if (m.status === 'skipped') return { id: m.id, status: 'skipped' };
    if (i < target) return { id: m.id, status: 'complete' };
    if (i === target) return { id: m.id, status: 'current', responsibleParty: who };
    return { id: m.id, status: 'upcoming' };
  });
  return { stage: target < STAGES.length ? STAGES[target] : null, owner: target < STAGES.length ? who : null, label: ev.label, updates };
}

// The product's stage word as the rest of the console stores it (products.current_stage).
export const stageKey = stage => stage ? stage.toLowerCase() : 'delivered';

// Run an event against the database. q is a pool or a client inside a transaction. Missing milestones are created first.
export async function applyFlow(q, productId, event, { owner, actorId = null, note = null } = {}) {
  let rows = (await q.query('select id,name,status,sort_order from milestones where product_id=$1 order by sort_order', [productId])).rows;
  if (!rows.length) {
    rows = (await q.query(`insert into milestones(product_id,name,status,sort_order)
      select $1,m.name,case when m.n=1 then 'current' else 'upcoming' end,m.n from unnest($2::text[]) with ordinality m(name,n) returning id,name,status,sort_order`, [productId, STAGES])).rows;
  }
  const plan = planFlow(rows, event, { owner }); if (!plan) return { changed: false };
  for (const u of plan.updates) {
    await q.query(`update milestones set status=$2,responsible_party=coalesce($3,responsible_party),
      completed_at=case when $2='complete' then coalesce(completed_at,now()) when $2='skipped' then completed_at else null end where id=$1`,
      [u.id, u.status, u.responsibleParty || null]);
  }
  const product = (await q.query(`update products set current_stage=$2,waiting_on=$3,completed_at=case when $2='delivered' then coalesce(completed_at,now()) else null end,
    completed_by=case when $2='delivered' then completed_by else null end,updated_at=now() where id=$1 returning client_id,project_id,title`,
    [productId, stageKey(plan.stage), plan.owner])).rows[0];
  if (!product) return { changed: false };
  const summary = `${plan.label}${plan.stage ? ` · ${plan.stage}, waiting on ${OWNER_LABELS[plan.owner]}` : ' · every milestone complete'}${note ? ` · ${note}` : ''}`;
  await q.query(`insert into activities(client_id,product_id,actor_id,type,summary,metadata) values($1,$2,$3,'flow',$4,$5)`,
    [product.client_id, productId, actorId, summary, { event, stage: plan.stage, owner: plan.owner, note }]);
  if (product.project_id) await syncProjectMilestone(q, product.project_id);
  return { changed: true, stage: plan.stage, owner: plan.owner, label: plan.label };
}

// A project sits at the earliest milestone among its live products, and is complete once every product is delivered.
export async function syncProjectMilestone(q, projectId) {
  const rows = (await q.query(`select current_stage from products where project_id=$1 and coalesce(status,'') not in ('archive','archived')`, [projectId])).rows;
  if (!rows.length) return;
  const order = rows.map(r => r.current_stage === 'delivered' ? STAGES.length : idx(r.current_stage)).filter(i => i >= 0);
  if (!order.length) return;
  const min = Math.min(...order);
  if (min >= STAGES.length) await q.query(`update projects set milestone='Delivered',status=case when status in ('archive','archived') then status else 'complete' end,updated_at=now() where id=$1`, [projectId]);
  else await q.query(`update projects set milestone=$2,status=case when status='complete' then 'active' else status end,updated_at=now() where id=$1`, [projectId, STAGES[min]]);
}

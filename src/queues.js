// The console's three home sections, built from every work stream instead of one table each.
//
//   Waiting on approval   things where a person must approve, sign, publish or decide, grouped by whose move it is:
//                         on us, on the client, on the factory. Tech packs, quotes, asset approvals, new requests, website leads.
//   Production attention  things that are late, blocked or at risk: production runs, QC, shipments, samples, overdue invoices, flagged products.
//   Assistant             how the assistant is doing, what needs a re-run, and how much of its work survives people's edits.
//
// Every item has the same shape so the page renders them one way: { key, stream, owner, severity, clientId, clientName, productId,
// productTitle, title, detail, since }. `since` is when it started waiting; the page turns it into "waiting 3 days".

const LIVE_CLIENT = `c.archived_at is null and c.status not in ('archive','archived') and c.slug<>'future-basics'`;
const LIVE_PROJECT = a => `not exists(select 1 from projects ap where ap.id=${a}.project_id and (ap.archived_at is not null or ap.status in ('archive','archived')))`;
const DAY = 86400000;
const iso = v => (v ? new Date(v).toISOString() : null);
const clip = (s, n = 160) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const age = since => (since ? Date.now() - new Date(since).getTime() : 0);

// ---- Tech packs: the approval chain is submit → publish → client approves → we countersign → factory countersigns ----
export function packItems(rows) {
  const out = [];
  for (const r of rows) {
    const base = { stream: 'tech-pack', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title };
    const v = r.verification && typeof r.verification === 'object' ? r.verification : {};
    if (r.status === 'submitted' && !r.published_at) {
      const since = iso(r.submitted_at || r.updated_at);
      out.push({ ...base, key: `pack-review:${r.tp_id}`, kind: 'review', owner: 'us', severity: age(since) > 2 * DAY ? 'urgent' : 'normal', title: 'Submitted by the client: review it and publish v1', detail: r.ai_status === 'done' ? 'The assistant drafted it; check the numbers before it goes out.' : 'Drafted by hand.', since });
    } else if (r.published_at && !r.locked_at) {
      if (!v.clientSign) {
        const since = iso(r.published_at);
        out.push({ ...base, key: `pack-client:${r.tp_id}`, kind: 'client-approval', owner: 'client', severity: age(since) > 5 * DAY ? 'urgent' : 'info', title: `Waiting for the client to approve v${r.version}`, detail: age(since) > 5 * DAY ? 'Over five days. Worth a nudge.' : 'Published to their room.', since });
      } else if (!v.brandSign) {
        const since = iso(v.clientSign.at || r.published_at);
        out.push({ ...base, key: `pack-counter:${r.tp_id}`, kind: 'countersign', owner: 'us', severity: age(since) > 2 * DAY ? 'urgent' : 'normal', title: `The client approved v${r.version}: countersign it`, detail: `Signed by ${clip(v.clientSign.name, 60) || 'the client'}.`, since });
      } else if (!v.factorySign) {
        const since = iso(v.brandSign.at || v.clientSign?.at || r.published_at);
        out.push({ ...base, key: `pack-factory:${r.tp_id}`, kind: 'factory-signature', owner: 'factory', severity: age(since) > 7 * DAY ? 'urgent' : 'info', title: `Signed by both sides: waiting on the factory to countersign v${r.version}`, detail: 'Send the factory link if it has not gone out.', since });
      }
    }
  }
  return out;
}

export function assistantRerunItems(rows) {
  return rows.map(r => {
    const ours = !/could not make out a product|could not read enough detail|could not open this image|could not take this image|could not draft enough/i.test(r.ai_error || '') || /on our side/i.test(r.ai_error || '');
    const since = iso(r.ai_started_at || r.updated_at);
    return {
      key: `ai-failed:${r.tp_id}`, stream: 'assistant', kind: ours ? 'rerun' : 'photo', owner: ours ? 'us' : 'client', severity: ours ? (age(since) > DAY ? 'urgent' : 'normal') : 'info',
      clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title,
      title: ours ? 'The assistant could not run on this pack: re-run it' : 'The assistant could not read the photo: waiting on a clearer one from the client',
      detail: clip(r.ai_error, 140), since
    };
  });
}

const order = { urgent: 0, normal: 1, info: 2 };
export const sortItems = items => [...items].sort((a, b) => (order[a.severity] ?? 1) - (order[b.severity] ?? 1) || age(b.since) - age(a.since));

export async function buildQueues(pool, { learning = null } = {}) {
  const [packs, failedPacks, approvals, quotes, requests, leads, runs, qc, ships, samples, invoices, risky, ai] = await Promise.all([
    pool.query(`select tp.id tp_id,tp.status,tp.version,tp.submitted_at,tp.published_at,tp.locked_at,tp.verification,tp.ai_status,tp.updated_at,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id
      where ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} and (tp.status='submitted' or tp.published_at is not null)`),
    pool.query(`select tp.id tp_id,tp.ai_error,tp.ai_started_at,tp.updated_at,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from tech_packs tp join products p on p.id=tp.product_id join clients c on c.id=p.client_id
      where ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} and tp.ai_status='failed' and tp.published_at is null order by tp.ai_started_at desc nulls last limit 25`),
    pool.query(`select a.id,a.title,a.requested_at,ast.name asset_name,av.version asset_version,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from approvals a join products p on p.id=a.product_id join clients c on c.id=p.client_id left join asset_versions av on av.id=a.asset_version_id left join assets ast on ast.id=av.asset_id
      where a.status='pending' and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by a.requested_at`),
    pool.query(`select q.id,q.version,q.quantity,q.created_at,q.expires_at,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from quotes q join products p on p.id=q.product_id join clients c on c.id=p.client_id
      where q.status='issued' and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by q.created_at`),
    pool.query(`select r.id,r.title,r.type,r.created_at,c.id client_id,c.name client_name from requests r join clients c on c.id=r.client_id
      where r.status='submitted' and r.type<>'project-intake' and ${LIVE_CLIENT} order by r.created_at`),
    pool.query(`select c.id client_id,c.name client_name,c.created_at from clients c where c.status='lead' and c.archived_at is null and c.slug<>'future-basics' order by c.created_at`),
    pool.query(`select pr.id,pr.po_number,pr.status,pr.eta_date,pr.updated_at,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from production_runs pr join products p on p.id=pr.product_id join clients c on c.id=p.client_id
      where (pr.status in ('blocked','delayed') or (pr.eta_date is not null and pr.eta_date<current_date and pr.status not in ('complete','delivered','cancelled'))) and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by pr.eta_date nulls last`),
    pool.query(`select q.id,q.status,q.created_at,q.defect_units,q.inspected_units,pr.po_number,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from qc_inspections q join production_runs pr on pr.id=q.production_run_id join products p on p.id=pr.product_id join clients c on c.id=p.client_id
      where (q.status in ('failed','rejected','hold') or (q.status='pending' and q.created_at<now()-interval '3 days')) and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by q.created_at`),
    pool.query(`select s.id,s.status,s.eta_date,s.carrier,s.tracking_number,s.updated_at,pr.po_number,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from shipments s join production_runs pr on pr.id=s.production_run_id join products p on p.id=pr.product_id join clients c on c.id=p.client_id
      where (s.status in ('exception','delayed','returned') or (s.eta_date<current_date and s.delivered_at is null and s.status not in ('delivered','cancelled'))) and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by s.eta_date nulls last`),
    pool.query(`select pr.id,pr.po_number,pr.sample_status,pr.updated_at,p.id product_id,p.title product_title,c.id client_id,c.name client_name
      from production_runs pr join products p on p.id=pr.product_id join clients c on c.id=p.client_id
      where pr.sample_status in ('rejected','delayed','revise','revision') and ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} order by pr.updated_at`),
    pool.query(`select i.id,i.number,i.amount_cents,i.due_date,c.id client_id,c.name client_name from invoices i join clients c on c.id=i.client_id
      where i.status='due' and i.due_date<current_date and ${LIVE_CLIENT} order by i.due_date`),
    pool.query(`select p.id product_id,p.title product_title,p.risk_level,p.target_date,p.current_stage,p.updated_at,c.id client_id,c.name client_name
      from products p join clients c on c.id=p.client_id
      where ${LIVE_CLIENT} and ${LIVE_PROJECT('p')} and p.current_stage not in ('delivery','delivered','complete','archive')
        and (p.risk_level not in ('on-track') or (p.target_date is not null and p.target_date<current_date)) order by p.target_date nulls last limit 40`),
    pool.query(`select count(*) filter(where ai_status='done' and ai_completed_at>now()-interval '30 days')::int done30,
        count(*) filter(where ai_status='failed' and coalesce(ai_started_at,updated_at)>now()-interval '30 days')::int failed30,
        count(*) filter(where ai_draft is not null and published_at is null and status='draft')::int drafted_open,
        count(*) filter(where ai_draft is not null)::int drafted_total,
        count(*) filter(where ai_draft is null and initiated_by='client' and ai_status is null)::int blank_client
      from tech_packs`)
  ]);

  const A = []; // waiting on approval
  A.push(...packItems(packs.rows));
  for (const r of approvals.rows) A.push({ key: `approval:${r.id}`, stream: 'assets', kind: 'asset-approval', owner: 'client', severity: age(r.requested_at) > 5 * DAY ? 'urgent' : 'info', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: clip(r.title, 120), detail: r.asset_name ? `Locked to ${clip(r.asset_name, 60)} v${r.asset_version}` : 'Waiting for the client to decide.', since: iso(r.requested_at) });
  for (const r of quotes.rows) { const expired = r.expires_at && new Date(r.expires_at) < new Date(); A.push({ key: `quote:${r.id}`, stream: 'quotes', kind: 'quote', owner: 'client', severity: expired ? 'urgent' : age(r.created_at) > 7 * DAY ? 'normal' : 'info', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: `Quote v${r.version} for ${r.quantity} units is out`, detail: expired ? 'The quote has expired. Reissue it or follow up.' : r.expires_at ? `Valid until ${new Date(r.expires_at).toLocaleDateString('en-US')}.` : 'Waiting for the client to accept.', since: iso(r.created_at) }); }
  for (const r of requests.rows) A.push({ key: `request:${r.id}`, stream: 'requests', kind: 'request', owner: 'us', severity: age(r.created_at) > 2 * DAY ? 'urgent' : 'normal', clientId: r.client_id, clientName: r.client_name, productId: null, productTitle: '', title: `New request: ${clip(r.title, 100)}`, detail: clip(r.type, 40), since: iso(r.created_at) });
  for (const r of leads.rows) A.push({ key: `lead:${r.client_id}`, stream: 'leads', kind: 'lead', owner: 'us', severity: age(r.created_at) > 2 * DAY ? 'urgent' : 'normal', clientId: r.client_id, clientName: r.client_name, productId: null, productTitle: '', title: 'Website lead: activate the room', detail: 'They cannot sign in until you do.', since: iso(r.created_at) });

  const B = []; // production attention
  for (const r of runs.rows) B.push({ key: `run:${r.id}`, stream: 'production', kind: 'run', owner: 'us', severity: 'urgent', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: `${r.po_number || 'Production run'} is ${r.status === 'blocked' || r.status === 'delayed' ? r.status : 'past its ETA'}`, detail: r.eta_date ? `ETA ${new Date(r.eta_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : 'No ETA set.', since: iso(r.eta_date || r.updated_at) });
  for (const r of qc.rows) B.push({ key: `qc:${r.id}`, stream: 'quality', kind: 'qc', owner: 'us', severity: r.status === 'pending' ? 'normal' : 'urgent', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: r.status === 'pending' ? `QC on ${r.po_number || 'a run'} has been pending for days` : `QC ${r.status} on ${r.po_number || 'a run'}`, detail: r.inspected_units ? `${r.defect_units ?? 0} defects in ${r.inspected_units} units.` : '', since: iso(r.created_at) });
  for (const r of ships.rows) B.push({ key: `ship:${r.id}`, stream: 'shipping', kind: 'shipment', owner: 'us', severity: 'urgent', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: ['exception', 'delayed', 'returned'].includes(r.status) ? `Shipment ${r.status}` : 'Shipment is past its ETA', detail: [r.carrier, r.tracking_number, r.eta_date ? `ETA ${new Date(r.eta_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}` : ''].filter(Boolean).join(' · '), since: iso(r.eta_date || r.updated_at) });
  for (const r of samples.rows) B.push({ key: `sample:${r.id}`, stream: 'samples', kind: 'sample', owner: 'us', severity: 'normal', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: `Sample ${r.sample_status}${r.po_number ? ` on ${r.po_number}` : ''}`, detail: '', since: iso(r.updated_at) });
  for (const r of invoices.rows) B.push({ key: `invoice:${r.id}`, stream: 'money', kind: 'invoice', owner: 'client', severity: age(r.due_date) > 14 * DAY ? 'urgent' : 'normal', clientId: r.client_id, clientName: r.client_name, productId: null, productTitle: '', title: `Invoice ${r.number} is overdue`, detail: `$${(Number(r.amount_cents) / 100).toLocaleString('en-US')} was due ${new Date(r.due_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}.`, since: iso(r.due_date) });
  for (const r of risky.rows) { const late = r.target_date && new Date(r.target_date) < new Date(); B.push({ key: `risk:${r.product_id}`, stream: 'products', kind: 'risk', owner: 'us', severity: late ? 'urgent' : 'normal', clientId: r.client_id, clientName: r.client_name, productId: r.product_id, productTitle: r.product_title, title: late ? `Past its target date (${new Date(r.target_date).toLocaleDateString('en-US', { timeZone: 'UTC' })}), still in ${r.current_stage}` : `Flagged ${r.risk_level}`, detail: r.risk_level !== 'on-track' && late ? `Also flagged ${r.risk_level}.` : '', since: iso(late ? r.target_date : r.updated_at) }); }

  const a = ai.rows[0], done = a.done30, failed = a.failed30;
  const assistant = {
    done30: done, failed30: failed, successRate: done + failed ? done / (done + failed) : null,
    draftedOpen: a.drafted_open, draftedTotal: a.drafted_total, blankClient: a.blank_client,
    rerun: sortItems(assistantRerunItems(failedPacks.rows)),
    learning
  };
  return { approvals: sortItems(A), attention: sortItems(B), assistant };
}

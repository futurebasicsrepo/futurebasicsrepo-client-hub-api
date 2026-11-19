// Every quote and contract is a deal in Sales, so the pipeline's money is the money we have put in front of clients.
//
//   order quotes      sent → Proposal, accepted → Won (order-quote-routes.js keeps its own trackDeal; the deal is order_quotes.deal_id)
//   contracts         a draft → Meeting, sent or signed by the client → Proposal, signed by both or closed out → Won, declined, expired or voided → Lost
//   product quotes    (one product, the quotes table) issued → Proposal, accepted → Won, declined → Lost. Every version of a product's
//                     quote is the same deal, so a new version updates its value instead of adding a second deal.
//
// The rules (nextDeal):
//   - A deal's value is the total of the document that moved it. A document worth $0 (a contract with no fee yet) leaves the value alone.
//   - A won deal stays won: a later proposal only notes itself on it. A second signed document sets the won value.
//   - A draft never pulls a deal back (a deal at Proposal stays at Proposal when a contract draft is saved on it).
//   - A deal goes to Lost only when nothing else on it is still live: a newer contract version, a quote still out with the client.
//   - A lost deal reopens when a new document is sent on it.
// The note on the deal's timeline is written only when the stage or the value changes, so saving a draft twice says nothing twice.
import { fireTrigger } from './sales-automations-engine.js';

export const DEAL_RANK = { new: 0, contacted: 1, meeting: 2, proposal: 3, won: 4, lost: -1 };
const CONTRACT_STAGE = { draft: 'meeting', sent: 'proposal', signed_by_client: 'proposal', executed: 'won', closed: 'won', declined: 'lost', expired: 'lost', void: 'lost' };
const QUOTE_STAGE = { issued: 'proposal', accepted: 'won', declined: 'lost' };
export const contractStage = status => CONTRACT_STAGE[status] || null;
export const quoteStage = status => QUOTE_STAGE[status] || null;
// what a one-product quote is worth (the same sum the client is shown)
export const productQuoteCents = q => Number(q.quantity || 0) * Number(q.wholesale_cents || q.unit_cost_cents || 0) + Number(q.tooling_cents || 0) + Number(q.freight_cents || 0);

// cur: the deal as it stands ({ stage, value_cents }) or null. Returns { stage, valueCents } for the deal after this document.
export function nextDeal(cur, { stage, valueCents = 0, forwardOnly = false, otherLive = false }) {
  const value = Math.max(0, Math.round(Number(valueCents) || 0));
  if (!cur) return { stage, valueCents: value };
  const had = Number(cur.value_cents) || 0, keepOr = v => (v > 0 ? v : had);
  if (cur.stage === 'won') return { stage: 'won', valueCents: stage === 'won' ? keepOr(value) : had };
  if (stage === 'lost') return { stage: otherLive ? cur.stage : 'lost', valueCents: had };
  if (forwardOnly && cur.stage !== 'lost' && DEAL_RANK[cur.stage] > DEAL_RANK[stage]) return { stage: cur.stage, valueCents: keepOr(value) };
  return { stage, valueCents: keepOr(value) };
}

// Something else on the deal still in play, apart from the document being moved.
export async function otherLiveOnDeal(db, dealId, { contractId = null, quoteId = null, orderQuoteId = null } = {}) {
  if (!dealId) return false;
  const r = await db.query(`select exists(select 1 from contracts where deal_id=$1 and id is distinct from $2 and status in ('draft','sent','signed_by_client','executed'))
      or exists(select 1 from order_quotes where deal_id=$1 and id is distinct from $3 and status in ('sent','accepted','changes'))
      or exists(select 1 from quotes q where q.deal_id=$1 and q.id is distinct from $4 and q.status in ('issued','accepted') and not exists(select 1 from quotes n where n.product_id=q.product_id and n.version>q.version)) live`,
  [dealId, contractId, orderQuoteId, quoteId]);
  return !!r.rows[0]?.live;
}

// The client's company and contact in Sales (found, or made and tied to the room). Without a room, the company and signer named on the document.
export async function salesContact(db, { clientId = null, email = '', name = '', company = '', source = 'quote' } = {}) {
  const c = clientId ? (await db.query('select id, name, contact_email, contact_name, owner_id from clients where id=$1', [clientId])).rows[0] : null;
  const mail = String(email || c?.contact_email || '').toLowerCase().trim(), companyName = String(c?.name || company || '').trim().slice(0, 160);
  let co = null;
  if (companyName) {
    co = (await db.query('select id from sales_companies where lower(name)=lower($1)', [companyName])).rows[0]
      || (await db.query('insert into sales_companies(name) values($1) on conflict do nothing returning id', [companyName])).rows[0]
      || (await db.query('select id from sales_companies where lower(name)=lower($1)', [companyName])).rows[0] || null;
  }
  let ct = mail ? (await db.query('select id from sales_contacts where lower(email)=$1', [mail])).rows[0] : c ? (await db.query('select id from sales_contacts where client_id=$1 order by created_at limit 1', [c.id])).rows[0] : null;
  if (!ct && (mail || c)) {
    ct = (await db.query(`insert into sales_contacts(name,email,company_id,source,client_id,tags) values($1,$2,$3,$4,$5,$6) on conflict (lower(email)) where email is not null do nothing returning id`,
      [String(name || c?.contact_name || c?.name || companyName || mail).slice(0, 120), mail || null, co?.id || null, source, c?.id || null, c ? '{client}' : '{}'])).rows[0]
      || (mail ? (await db.query('select id from sales_contacts where lower(email)=$1', [mail])).rows[0] : null);
  }
  if (ct) await db.query('update sales_contacts set client_id=coalesce(client_id,$2), company_id=coalesce(company_id,$3), last_activity_at=now() where id=$1', [ct.id, c?.id || null, co?.id || null]);
  return { contactId: ct?.id || null, companyId: co?.id || null, ownerId: c?.owner_id || null, clientName: c?.name || companyName };
}

// Open or move the deal a document is. Returns { dealId, contactId, stage, changed } (dealId null only when it could not be tracked).
export async function linkDeal(db, { dealId = null, clientId = null, email = '', name = '', company = '', title = '', stage, valueCents = 0, projectId = null, expectedClose = null,
  source = 'contract', forwardOnly = false, live = {}, lostReason = '', text = '', meta = {}, actorId = null, log = console } = {}) {
  try {
    if (!stage) return { dealId: null };
    const who = await salesContact(db, { clientId, email, name, company, source });
    let cur = dealId ? (await db.query('select id, stage, value_cents, contact_id from sales_deals where id=$1', [dealId])).rows[0] : null;
    const otherLive = stage === 'lost' && cur ? await otherLiveOnDeal(db, cur.id, live) : false;
    const next = nextDeal(cur, { stage, valueCents, forwardOnly, otherLive });
    const closing = s => ['won', 'lost'].includes(s);
    if (!cur) {
      cur = (await db.query(`insert into sales_deals(contact_id,company_id,title,stage,value_cents,source,project_id,owner_id,expected_close,lost_reason,closed_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${closing(next.stage) ? 'now()' : 'null'}) returning id, contact_id`,
        [who.contactId, who.companyId, String(title || 'Deal').slice(0, 140), next.stage, next.valueCents, source, projectId, who.ownerId || actorId, expectedClose || null, next.stage === 'lost' ? String(lostReason).slice(0, 300) : ''])).rows[0];
      const contactId = cur.contact_id || who.contactId;
      if (contactId) await db.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,'stage',$3,$4::jsonb,$5)`, [contactId, cur.id, String(text || `Opened at ${next.stage}`).slice(0, 4000), JSON.stringify({ ...meta, to: next.stage, valueCents: next.valueCents }), actorId]);
      if (next.stage === 'won' && contactId) await fireTrigger(db, { type: 'deal_stage', contactId, dealId: cur.id, stage: 'won' }, { deliberate: true }).catch(() => {});
      return { dealId: cur.id, contactId, stage: next.stage, changed: true };
    }
    const moved = next.stage !== cur.stage, revalued = next.valueCents !== Number(cur.value_cents);
    const contactId = cur.contact_id || who.contactId;
    if (moved || revalued) {
      await db.query(`update sales_deals set stage=$2, value_cents=$3, contact_id=coalesce(contact_id,$4), company_id=coalesce(company_id,$5), project_id=coalesce(project_id,$6), expected_close=coalesce($7,expected_close),
          closed_at=case when $2 in ('won','lost') then coalesce(case when stage=$2 then closed_at end, now()) else null end, lost_reason=case when $2='lost' then $8 else '' end, last_activity_at=now(), updated_at=now() where id=$1`,
      [cur.id, next.stage, next.valueCents, who.contactId, who.companyId, projectId, expectedClose || null, String(lostReason).slice(0, 300)]);
      const said = text || (moved ? `Moved from ${cur.stage} to ${next.stage}` : `Value now $${(next.valueCents / 100).toFixed(2)}`);
      if (contactId) await db.query(`insert into sales_activities(contact_id,deal_id,kind,text,meta,actor_id) values($1,$2,'stage',$3,$4::jsonb,$5)`, [contactId, cur.id, String(said).slice(0, 4000), JSON.stringify({ ...meta, from: cur.stage, to: next.stage, valueCents: next.valueCents }), actorId]);
      if (moved && next.stage === 'won' && contactId) await fireTrigger(db, { type: 'deal_stage', contactId, dealId: cur.id, stage: 'won' }, { deliberate: true }).catch(() => {});
    } else {
      await db.query('update sales_deals set contact_id=coalesce(contact_id,$2), company_id=coalesce(company_id,$3), project_id=coalesce(project_id,$4) where id=$1', [cur.id, who.contactId, who.companyId, projectId]);
    }
    return { dealId: cur.id, contactId, stage: next.stage, changed: moved || revalued };
  } catch (e) { log.warn?.({ err: e.message, source }, 'deal not tracked'); return { dealId: null }; }
}

// ---- the documents --------------------------------------------------------------------------------------------------------------------------

const money = c => '$' + (Number(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const CONTRACT_WORDS = { draft: 'is being drafted', sent: 'was sent for signature', signed_by_client: 'was signed by the client', executed: 'was signed by both parties', closed: 'was closed out', declined: 'was declined', expired: 'expired unsigned', void: 'was voided' };

// A contract's deal follows the contract. Its deal (and contact) are written back on the contract, so its invoices carry the deal too.
export async function syncContractDeal(db, r, { actorId = null, log = console } = {}) {
  if (!r) return null;
  const stage = contractStage(r.status); if (!stage) return null;
  if (r.status === 'draft' && !r.deal_id && !(Number(r.total_cents) > 0)) return null; // a draft with no fee yet is not pipeline money: it opens a deal once it has one
  if (stage === 'lost' && !r.deal_id) return null; // one that ends before it was ever in the pipeline has nothing to close
  // a version replaced by a newer one hands its deal on and says nothing
  if (r.status === 'void' && /^Replaced by version/.test(r.void_reason || '')) return r.deal_id || null;
  const c = r.content || {}, company = c.client?.company || '';
  const reason = r.status === 'declined' ? `Declined ${r.number}${r.declined?.reason ? `: ${r.declined.reason}` : ''}` : r.status === 'expired' ? `${r.number} expired unsigned` : r.status === 'void' ? `${r.number} voided${r.void_reason ? `: ${r.void_reason}` : ''}` : '';
  const out = await linkDeal(db, {
    dealId: r.deal_id, clientId: r.client_id, email: c.client?.signerEmail, name: c.client?.signerName, company, source: 'contract',
    title: `${company || 'Contract'} · ${r.number}${r.title ? ' · ' + r.title : ''}`, stage, valueCents: r.total_cents, projectId: r.project_id,
    expectedClose: r.expires_at ? new Date(r.expires_at).toISOString().slice(0, 10) : null, forwardOnly: r.status === 'draft', live: { contractId: r.id }, lostReason: reason,
    text: `Agreement ${r.number} ${CONTRACT_WORDS[r.status] || r.status} (${money(r.total_cents)})`, meta: { contractId: r.id, number: r.number }, actorId, log
  });
  if (out.dealId && (out.dealId !== r.deal_id || (out.contactId && out.contactId !== r.contact_id))) {
    await db.query('update contracts set deal_id=$2, contact_id=coalesce(contact_id,$3) where id=$1', [r.id, out.dealId, out.contactId || null]).catch(() => {});
    r.deal_id = out.dealId; r.contact_id = r.contact_id || out.contactId || null;
  }
  return out.dealId;
}

// A one-product quote's deal: the deal of this product's earlier quotes, else a new one.
export async function syncProductQuoteDeal(db, quoteId, { actorId = null, log = console } = {}) {
  const q = (await db.query(`select q.*, p.title product_title, p.client_id, p.project_id, (select o.deal_id from quotes o where o.product_id=q.product_id and o.deal_id is not null order by o.version desc limit 1) prior_deal
      from quotes q join products p on p.id=q.product_id where q.id=$1`, [quoteId])).rows[0];
  if (!q) return null;
  const stage = quoteStage(q.status); if (!stage) return null;
  const total = productQuoteCents(q), client = (await db.query('select name from clients where id=$1', [q.client_id])).rows[0]?.name || '';
  const out = await linkDeal(db, {
    dealId: q.deal_id || q.prior_deal, clientId: q.client_id, source: 'quote', title: `${client} · ${q.product_title} quote`, stage, valueCents: total, projectId: q.project_id,
    expectedClose: q.expires_at ? new Date(q.expires_at).toISOString().slice(0, 10) : null, live: { quoteId: q.id }, lostReason: `Declined quote v${q.version} for ${q.product_title}${q.decision_notes ? `: ${q.decision_notes}` : ''}`,
    text: `Quote v${q.version} for ${q.product_title} ${q.status === 'issued' ? 'issued' : q.status} (${q.quantity} units, ${money(total)})`, meta: { quoteId: q.id, productId: q.product_id, version: q.version }, actorId, log
  });
  if (out.dealId && out.dealId !== q.deal_id) await db.query('update quotes set deal_id=$2 where id=$1', [q.id, out.dealId]).catch(() => {});
  return out.dealId;
}

// Ties in what was made before every document was a deal: contracts and the latest quote of each product with no deal yet, and contracts whose
// deal never heard they were sent or signed. Idempotent: a second run finds nothing to do. orderQuotes(q) tracks a sent or accepted order quote.
export async function reconcileDeals(db, { orderQuotes = null, log = console } = {}) {
  const out = { contracts: 0, quotes: 0, orderQuotes: 0 };
  // one that ended without a deal (declined, expired, voided) is left alone: there is nothing in the pipeline to close. A draft counts once it has
  // a fee, and only if someone worked on it in the last four months (an abandoned draft is not a deal).
  const contracts = (await db.query(`select * from contracts where (deal_id is not null and not (status='void' and void_reason like 'Replaced by version%'))
      or (deal_id is null and status in ('sent','signed_by_client','executed')) or (deal_id is null and status='draft' and total_cents > 0 and updated_at > now() - interval '120 days') order by created_at`)).rows;
  for (const r of contracts) {
    // the catch-up opens and moves deals forward; it never loses one. A deal is lost only when it happens (declined, voided, expired), so an old
    // voided contract cannot close a deal someone is still working.
    if (contractStage(r.status) === 'lost') continue;
    const before = r.deal_id; const cur = before ? (await db.query('select stage, value_cents from sales_deals where id=$1', [before])).rows[0] : null;
    if (before && cur) {
      const want = nextDeal(cur, { stage: contractStage(r.status), valueCents: r.total_cents, forwardOnly: r.status === 'draft' });
      if (want.stage === cur.stage && want.valueCents === Number(cur.value_cents)) continue;
    }
    if (await syncContractDeal(db, r, { log })) out.contracts++;
  }
  const quotes = (await db.query(`select q.id from quotes q where q.deal_id is null and q.status in ('issued','accepted') and not exists(select 1 from quotes n where n.product_id=q.product_id and n.version>q.version) order by q.created_at`)).rows;
  for (const q of quotes) if (await syncProductQuoteDeal(db, q.id, { log })) out.quotes++;
  if (orderQuotes) {
    const oq = (await db.query(`select * from order_quotes where deal_id is null and status in ('sent','accepted','changes') order by created_at`)).rows;
    for (const q of oq) if (await orderQuotes(q)) out.orderQuotes++;
  }
  return out;
}

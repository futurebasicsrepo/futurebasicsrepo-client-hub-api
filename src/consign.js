// Consignment / sell-to-us flow: validation + the offer state machine.
// Pure functions so the negotiation rules are unit-testable without a database.

export const CONDITIONS = ['deadstock', 'like_new', 'used_good', 'used_fair'];
export const DEAL_TYPES = ['either', 'cash', 'consign', 'trade'];
export const OPEN_STATUSES = ['submitted', 'reviewing', 'offered', 'countered'];
export const CLOSED_STATUSES = ['accepted', 'declined', 'withdrawn', 'paid'];

const text = (fields, name, max) => String(fields[name] ?? '').trim().slice(0, max);
const bad = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function normalizeSubmission(fields) {
  const sellerName = text(fields, 'seller_name', 120), sellerEmail = text(fields, 'seller_email', 200).toLowerCase();
  const itemTitle = text(fields, 'item_title', 140), brand = text(fields, 'brand', 80);
  if (sellerName.length < 2) throw bad('Tell us your name.');
  if (!/^\S+@\S+\.\S+$/.test(sellerEmail)) throw bad('A valid email is required so we can send your offer.');
  if (itemTitle.length < 3) throw bad('Give the item a title (brand + model + colorway).');
  const condition = text(fields, 'condition', 20);
  if (!CONDITIONS.includes(condition)) throw bad('Pick a condition.');
  const dealType = text(fields, 'deal_type', 20) || 'either';
  if (!DEAL_TYPES.includes(dealType)) throw bad('Pick a deal type.');
  const askingRaw = text(fields, 'asking_cents', 12);
  const askingCents = askingRaw ? Math.round(Number(askingRaw)) : null;
  if (askingRaw && (!Number.isFinite(askingCents) || askingCents < 100 || askingCents > 100_000_000)) throw bad('Asking price should be between $1 and $1,000,000.');
  return {
    seller_name: sellerName, seller_email: sellerEmail, seller_phone: text(fields, 'seller_phone', 40) || null,
    item_title: itemTitle, brand: brand || null, size: text(fields, 'size', 40) || null, condition, deal_type: dealType,
    asking_cents: askingCents, details: text(fields, 'details', 3000) || null
  };
}

export function normalizeAmount(value) {
  const cents = Math.round(Number(value));
  if (!Number.isFinite(cents) || cents < 100 || cents > 100_000_000) throw bad('Amount should be between $1 and $1,000,000.');
  return cents;
}

/**
 * Decide what a party's action does to a consignment.
 * @param {object} consignment  row with status
 * @param {object[]} offers     existing offers, oldest first
 * @param {{by:'store'|'seller', action:'offer'|'counter'|'accept'|'decline', amountCents?:number, note?:string}} move
 * @returns {{offer:object, closeOpen:null|{id:string,status:string}, patch:object}}
 */
export function nextOfferState(consignment, offers, move) {
  const { by, action } = move;
  if (!['store', 'seller'].includes(by)) throw bad('Unknown party.');
  if (CLOSED_STATUSES.includes(consignment.status)) throw bad(`This ticket is ${consignment.status}; no further offers.`, 409);
  const latestOpen = [...offers].reverse().find(o => o.status === 'open') || null;
  const note = String(move.note ?? '').trim().slice(0, 600) || null;

  if (action === 'offer' || action === 'counter') {
    if (action === 'offer' && by !== 'store') throw bad('Only the shop can open with an offer; use counter.');
    if (action === 'counter' && !latestOpen) throw bad('There is nothing to counter yet.');
    if (action === 'counter' && latestOpen.by === by) throw bad('You already have an offer on the table. Wait for a response.');
    const amount = normalizeAmount(move.amountCents);
    return {
      offer: { by, kind: action, amount_cents: amount, note, status: 'open' },
      closeOpen: latestOpen ? { id: latestOpen.id, status: 'superseded' } : null,
      patch: { status: by === 'store' ? 'offered' : 'countered', agreed_cents: null }
    };
  }
  if (action === 'accept') {
    if (!latestOpen || latestOpen.by === by) throw bad('There is no offer from the other side to accept.');
    return {
      offer: { by, kind: 'accept', amount_cents: latestOpen.amount_cents, note, status: 'accepted' },
      closeOpen: { id: latestOpen.id, status: 'accepted' },
      patch: { status: 'accepted', agreed_cents: latestOpen.amount_cents }
    };
  }
  if (action === 'decline') {
    return {
      offer: { by, kind: 'decline', amount_cents: latestOpen?.amount_cents ?? null, note, status: 'declined' },
      closeOpen: latestOpen ? { id: latestOpen.id, status: 'declined' } : null,
      patch: { status: 'declined', agreed_cents: null }
    };
  }
  throw bad('Unknown action.');
}

export function consignmentView(row, images, offers, imageUrl, { audience = 'seller' } = {}) {
  const base = {
    id: row.id, item_title: row.item_title, brand: row.brand, size: row.size, condition: row.condition, deal_type: row.deal_type,
    asking_cents: row.asking_cents, details: row.details, status: row.status, agreed_cents: row.agreed_cents,
    created_at: row.created_at, updated_at: row.updated_at,
    images: images.map(i => ({ id: i.id, url: imageUrl(i), original_name: i.original_name })),
    offers: offers.map(o => ({ id: o.id, by: o.by, kind: o.kind, amount_cents: o.amount_cents, note: o.note, status: o.status, created_at: o.created_at }))
  };
  if (audience === 'staff') Object.assign(base, { token: row.token, seller_name: row.seller_name, seller_email: row.seller_email, seller_phone: row.seller_phone, staff_notes: row.staff_notes, source: row.source });
  return base;
}

export const formatCents = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(cents || 0) / 100);

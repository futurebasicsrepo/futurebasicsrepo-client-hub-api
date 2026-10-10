// The Vendor Information Form, as a hub step: who we pay, how, and a signature that says the details are right.
// Everything a person types goes into one encrypted blob (src/vault.js); the columns next to it hold only what a list needs:
// the company, the method, the currency and the last four digits. A change is never an edit: it is a new, signed version.
export const METHODS = { ach: 'ACH (preferred)', wire: 'Wire transfer (international)', paypal: 'PayPal / Venmo' };
export const SECRET_KEYS = ['taxId', 'accountName', 'bankName', 'bankAddress', 'accountNumber', 'routing', 'swift', 'paypalEmail', 'venmo', 'bankContact'];
export const PUBLIC_KEYS = ['companyName', 'address', 'cityStateZip', 'vatNo', 'contactName', 'contactPhone', 'contactEmail'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max);
const alnum = v => String(v ?? '').replace(/[\s-]/g, '').toUpperCase();

// ABA routing numbers carry a checksum: 3(d1+d4+d7) + 7(d2+d5+d8) + (d3+d6+d9) is a multiple of 10.
export const abaOk = v => { const d = String(v).split('').map(Number); return /^\d{9}$/.test(v) && (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0; };

// input: the request body. Returns { errors: {field: message}, clean }. clean holds every field, trimmed; nothing is guessed.
export function validateVendor(input = {}) {
  const e = {}, c = {};
  const need = (k, label, max = 200) => { c[k] = text(input[k], max); if (!c[k]) e[k] = `${label} is required`; };
  need('companyName', 'Company name'); need('address', 'Company physical address'); need('cityStateZip', 'City, state and zip code', 120);
  need('contactName', 'Contact name', 120);
  c.taxId = text(input.taxId, 30); if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,29}$/.test(c.taxId)) e.taxId = 'Enter your tax ID number';
  c.vatNo = text(input.vatNo, 30);
  c.contactPhone = text(input.contactPhone, 40); if (c.contactPhone.replace(/\D/g, '').length < 6) e.contactPhone = 'Enter a phone number we can call';
  c.contactEmail = text(input.contactEmail, 200).toLowerCase(); if (!EMAIL.test(c.contactEmail)) e.contactEmail = 'Enter a valid email address';
  c.method = String(input.method || ''); if (!METHODS[c.method]) e.method = 'Choose how you want to be paid';
  c.currency = text(input.currency, 12).toUpperCase(); if (!/^[A-Z]{3}$/.test(c.currency)) e.currency = 'Enter a currency code, like USD, EUR or SGD';
  for (const k of ['accountName', 'bankName', 'bankAddress', 'accountNumber', 'routing', 'swift', 'paypalEmail', 'venmo', 'bankContact']) c[k] = text(input[k], 200);
  c.accountNumber = alnum(c.accountNumber); c.routing = c.routing.replace(/[\s-]/g, ''); c.swift = alnum(c.swift); c.paypalEmail = c.paypalEmail.toLowerCase();
  if (c.method === 'ach' || c.method === 'wire') {
    if (!c.accountName) e.accountName = 'Name as on the bank account is required';
    if (!c.bankName) e.bankName = 'Name of bank is required';
    if (!/^[A-Z0-9]{4,34}$/.test(c.accountNumber)) e.accountNumber = 'Enter the bank account number (or IBAN)';
  }
  if (c.method === 'ach') { if (!abaOk(c.routing)) e.routing = 'Enter the 9-digit ABA routing number (check it: it did not add up)'; }
  if (c.method === 'wire') {
    if (!c.bankAddress) e.bankAddress = 'Bank address is required for a wire';
    if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(c.swift)) e.swift = 'Enter the SWIFT / BIC code (8 or 11 characters)';
  }
  if (c.method === 'paypal') { if (!c.paypalEmail && !c.venmo) e.paypalEmail = 'Enter your PayPal email or your Venmo handle'; else if (c.paypalEmail && !EMAIL.test(c.paypalEmail)) e.paypalEmail = 'Enter a valid PayPal email'; }
  c.signedName = text(input.signedName, 120); if (!c.signedName) e.signedName = 'Type your name to sign';
  c.signedTitle = text(input.signedTitle, 120); if (!c.signedTitle) e.signedTitle = 'Type your title to sign';
  if (input.agree !== true) e.agree = 'Tick the box to confirm the details are accurate and complete';
  return { errors: e, clean: c };
}

export const last4 = v => { const s = String(v || ''); return s.length >= 4 ? s.slice(-4) : ''; };
export const maskEmail = v => { const [u, d] = String(v || '').split('@'); return d ? `${u.slice(0, 1)}••••@${d}` : ''; };
// What identifies the bank details for "did the account change?": the method and every number that moves money.
export const bankParts = c => [c.method, c.routing, c.accountNumber, c.swift, c.paypalEmail, c.venmo];
export const maskedBank = c => c.method === 'paypal' ? [c.paypalEmail ? maskEmail(c.paypalEmail) : '', c.venmo ? `Venmo ${String(c.venmo).slice(0, 2)}••••` : ''].filter(Boolean).join(' · ') : `••••${last4(c.accountNumber)}`;

// The row as the client sees it: nothing they typed in the secret fields comes back, only the masks.
export const clientView = r => r && ({
  id: r.id, version: r.version, status: r.status, companyName: r.company_name, method: r.method, methodLabel: METHODS[r.method] || r.method, currency: r.currency,
  bank: r.bank_mask || '', taxLast4: r.tax_last4 || '', signedName: r.signed_name, submittedAt: r.created_at, reviewedAt: r.reviewed_at,
  note: r.status === 'rejected' ? r.review_note || '' : ''
});
// The row as staff see it: the same, plus what they need to decide.
export const adminView = r => r && ({
  ...clientView(r), contactName: r.contact_name, contactEmail: r.contact_email, signedTitle: r.signed_title, signedAt: r.signed_at,
  bankChanged: Boolean(r.bank_changed), verifiedCall: Boolean(r.verified_call), reviewNote: r.review_note || '', reviewedBy: r.reviewer_name || '', taxFormId: r.tax_form_file_id || null,
  taxFormName: r.tax_form_name || ''
});

// Who may open the full bank details: only the people named in VENDOR_REVEAL_EMAILS (comma separated; "@domain.com" names a whole domain).
// Not set means nobody: everyone sees the last four digits and no more.
export const revealAllowed = (email, env = process.env) => {
  const e = String(email || '').trim().toLowerCase(); if (!e) return false;
  return String(env.VENDOR_REVEAL_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).some(x => x.startsWith('@') ? e.endsWith(x) : e === x);
};

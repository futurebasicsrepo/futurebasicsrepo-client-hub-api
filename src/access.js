// Client access rules for the hub. Pure functions so the lead → active client
// transition (and who may sign in) is decided in one place and unit-tested.

// Personal mailboxes: never grant a whole domain, grant the individual address instead.
export const PUBLIC_EMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'outlook.com', 'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'hey.com', 'fastmail.com', 'zoho.com', 'gmx.com', 'mail.com', 'duck.com']);
export const RESERVED_EMAIL_DOMAINS = new Set(['thefuturebasics.com']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isPublicEmailDomain = domain => PUBLIC_EMAIL_DOMAINS.has(String(domain || '').trim().toLowerCase());
export const emailDomain = email => String(email || '').trim().toLowerCase().split('@')[1] || '';
export const normalizeEmails = values => [...new Set((Array.isArray(values) ? values : String(values || '').split(','))
  .map(value => String(value || '').trim().toLowerCase()).filter(value => EMAIL_RE.test(value)))];

// Decide how a lead gets sign-in access when its room is activated.
export function planClientAccess(client, { domainTaken = false } = {}) {
  const email = String(client?.contact_email || '').trim().toLowerCase();
  const domain = emailDomain(email);
  const emailDomains = new Set(Array.isArray(client?.email_domains) ? client.email_domains : []);
  const allowedEmails = new Set(normalizeEmails(client?.allowed_emails || []));
  if (EMAIL_RE.test(email)) allowedEmails.add(email);
  const reason = !domain ? 'no-contact-email' : RESERVED_EMAIL_DOMAINS.has(domain) ? 'reserved-domain' : isPublicEmailDomain(domain) ? 'public-domain' : domainTaken ? 'domain-taken' : emailDomains.has(domain) ? 'already-granted' : 'ok';
  const domainAdded = reason === 'ok';
  if (domainAdded) emailDomains.add(domain);
  return { emailDomains: [...emailDomains], allowedEmails: [...allowedEmails], domainAdded, reason,
    summary: domainAdded ? `Anyone at @${domain} can sign in` : allowedEmails.size ? `Sign-in limited to ${[...allowedEmails].join(', ')}` : 'No sign-in access granted — add a contact email first' };
}

// Where a project sits on the development path, for the client's stage tracker.
export const PROJECT_STAGES = ['Brief', 'Concept', 'Development', 'Sample', 'Approval', 'Production', 'Quality', 'Delivery'];
export function projectStageIndex(project, products = []) {
  const milestone = String(project?.milestone || '').toLowerCase();
  let index = PROJECT_STAGES.findIndex(stage => milestone.startsWith(stage.toLowerCase()));
  if (index < 0) {
    const current = (Array.isArray(products) ? products : []).flatMap(p => Array.isArray(p.milestones) ? p.milestones : []).filter(m => m.status === 'current');
    index = Math.max(-1, ...current.map(m => PROJECT_STAGES.indexOf(m.name)));
  }
  return Math.max(0, index);
}

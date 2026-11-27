// Screening the website's project brief form (POST /v1/public/intakes) for fake prospects, and the leads already in the console.
// Two kinds come in: bots that fill every field with generated text (company names like "Torphy - Wisoky", the project left for us to
// call "<company> launch", the same filler line pasted into several fields, other people's email addresses), and people selling
// something to Future Basics through the form (data-collection "partnerships", SEO, lending). Each sign adds to a score; at SPAM or
// more the submission is held: no client room, no lead, and no email to the address it gave. A held submission can be let in.
export const SPAM = 4;

// company.name in the common fake-data generators: "Last - Last" and "Last, Last and Last"; and, weaker since real firms are named so too,
// "Last Inc", "Last LLC", "Last Group", "Last and Sons"
const GENERATED_COMPANY = [/^[A-Z][a-zA-Z']+ - [A-Z][a-zA-Z']+$/, /^[A-Z][a-zA-Z']+, [A-Z][a-zA-Z']+ and [A-Z][a-zA-Z']+$/];
const GENERATED_SUFFIX = /^[A-Z][a-zA-Z']+ (Inc|LLC|Group|and Sons)$/;
// a company field that names no company: someone offering their own services
const NOT_A_COMPANY = new Set(['self-employed', 'self employed', 'freelance', 'freelancer', 'n/a', 'na', 'none', 'individual', 'personal', 'independent']);
const FILLER = /\b(heard about (this|you|us) (on|from|at)|decided to give it a try|just (testing|checking)|test(ing)? (message|submission)|lorem ipsum)\b/i;
// what people selling to us write; each hit counts once
const PITCH = ['15-minute call', '15 minute call', 'quick call', 'book a call', 'schedule a call', 'per accepted hour', 'first-person video', 'ai labs', 'headset', 'your crew',
  'keyword', 'search pages', 'show up first', 'first page of google', 'rank higher', 'seo', 'backlink', 'lead generation', 'more leads', 'appointments booked',
  'funding', 'line of credit', 'lines of credit', 'merchant cash', 'working capital', 'pre-approved', 'approval in 24', 'loan', 'if it\'s not a fit', 'if its not a fit', 'reach out again', 'not interested, just reply',
  'we help businesses', 'most businesses struggle', 'data partners', 'licensing deal', 'pays businesses', 'paying businesses',
  'business inquiry', 'see my message', 'virtual assistant', 'open for discussion', 'we offer', 'our services', 'outsourc', 'white label', 'guest post'];
const TOPIC_NOT_PROJECT = new Set(['partnership', 'partnerships', 'collaboration', 'business opportunity', 'opportunity', 'funding', 'funding specialist', 'seo', 'marketing', 'advertising', 'investment', 'proposal',
  'business inquiry', 'business development', 'business development manager', 'sales', 'hiring', 'job', 'services']);
// addresses that only ever send pitches through forms
const SPAM_DOMAINS = new Set(['jmailservice.com']);

const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// d: the form's fields as saved on the intake (companyName, contactName, email, projectName, projectBrief, inspirationLinks, audience,
// notes, targetDate, ...). → { score, spam, reasons: [plain words, for the console] }
export function screenIntake(d = {}) {
  const reasons = [], add = (n, why) => { score += n; reasons.push(why); };
  let score = 0;
  const company = String(d.companyName || '').trim(), contact = norm(d.contactName), project = norm(d.projectName), brief = norm(d.projectBrief);
  if (GENERATED_COMPANY.some(re => re.test(company))) add(2, `"${company}" is the kind of name a fake-data generator makes`);
  else if (GENERATED_SUFFIX.test(company)) add(1, `"${company}" is the kind of name a fake-data generator makes`);
  if (NOT_A_COMPANY.has(norm(company))) add(2, `The company is "${company}", not a business`);
  if (project && project === norm(`${company} launch`)) add(1, 'No project name given (the form named it "… launch")');
  const others = ['inspirationLinks', 'audience', 'notes', 'channels'].map(k => norm(d[k])).filter(Boolean);
  if (brief.length >= 12 && others.includes(brief)) add(3, 'The same text is pasted into more than one field');
  if (FILLER.test(brief) || others.some(t => FILLER.test(t))) add(3, 'The brief is a filler line, not a project');
  const all = norm([d.projectBrief, d.inspirationLinks, d.notes, d.audience].join(' '));
  const hits = PITCH.filter(p => all.includes(p));
  if (hits.length) add(Math.min(4, hits.length), `Reads as a sales pitch to us (${hits.slice(0, 4).map(h => `"${h}"`).join(', ')})`);
  if (TOPIC_NOT_PROJECT.has(project)) add(2, `The project is "${d.projectName}", a topic, not something to make`);
  if (contact && (norm(company) === contact || project === contact)) add(2, 'The company or project is just the person\'s name');
  const year = Number(String(d.targetDate || '').match(/^(\d{4,6})-/)?.[1] || 0);
  if (year && (year > 2100 || year < 2000)) add(1, `The target date (${d.targetDate}) is not a real date`);
  const domain = String(d.email || '').toLowerCase().split('@')[1] || '';
  if (SPAM_DOMAINS.has(domain)) add(3, `${domain} is a mail service used for form spam`);
  return { score, spam: score >= SPAM, reasons };
}

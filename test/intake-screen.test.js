import test from 'node:test';
import assert from 'node:assert/strict';
import { screenIntake, SPAM } from '../src/intake-screen.js';

// shaped like the fake prospects the form took in (the bot's generated companies, and the pitches), with stand-in addresses
const BOT = (company, filler = 'heard about this on dance-rock radio, decided to give it a try.') => ({ companyName: company, contactName: 'Kaylie Marvin', email: 'someone@example.net', projectName: `${company} launch`, productCategory: 'Apparel', projectBrief: filler, inspirationLinks: filler });

test('the bot that fills the brief form with generated companies and a filler line is held', () => {
  for (const c of ['Torphy - Wisoky', 'Berge, Bechtelar and Ratke', 'Hettinger, Satterfield and Altenwerth', 'Keebler LLC', 'VonRueden and Sons']) {
    const r = screenIntake(BOT(c)); assert.ok(r.spam && r.score >= SPAM, `${c}: ${r.score} ${r.reasons}`);
  }
  // with any other filler, the same text pasted twice and no project name still gives it away
  const other = screenIntake(BOT('Keebler LLC', 'I would like to know more about your services please.'));
  assert.ok(other.spam, other.reasons.join(' / '));
  assert.ok(screenIntake(BOT('Torphy - Wisoky')).reasons.some(r => /fake-data generator/.test(r)), 'it says why, in words');
});

test('people selling to us through the brief form are held', () => {
  const data = screenIntake({ companyName: 'Some Data Partners', contactName: 'Mike Turner', email: 'mike@example.com', projectName: 'Partnerships',
    projectBrief: 'Hi Kyle, AI labs building robots are paying businesses each month for first-person video of their people at work. The rate is $10 per accepted hour. Nothing changes for your crew: they wear a light headset. Open to a 15-minute call? If it\'s not a fit, tell me and we won\'t reach out again.' });
  assert.ok(data.spam && data.reasons.some(r => /sales pitch/.test(r)) && data.reasons.some(r => /topic, not something to make/.test(r)), data.reasons.join(' / '));
  const seo = screenIntake({ companyName: 'Nate Brooks', contactName: 'Nate Brooks', email: 'nate@jmailservice.com', projectName: 'Nate Brooks', targetDate: '51201-02-02',
    projectBrief: 'Most businesses struggle to get noticed online. We put your brand above the competition on major search pages for the keywords your customers type.' });
  assert.ok(seo.spam && seo.score >= 8, seo.reasons.join(' / '));
  const lending = screenIntake({ companyName: 'QuickFund', contactName: 'Jamie Lee', email: 'jamie@example.com', projectName: 'Funding specialist', projectBrief: 'We offer working capital and lines of credit to growing brands, approval in 24 hours.' });
  assert.ok(lending.spam, lending.reasons.join(' / '));
});

test('real briefs go through, even short ones, ones with no project name, and ones that mention a partnership or a call', () => {
  const real = [
    { companyName: 'Comet over Delphi', contactName: 'Constance Laval', email: 'c@example.co', projectName: 'Spring merch', projectBrief: 'We need 300 embroidered dad hats and 200 heavyweight tees for our spring tour, with our logo on the front.', inspirationLinks: 'https://example.com/ref', targetDate: '2027-03-01' },
    { companyName: 'Hill Supply Co', contactName: 'Sam Hill', email: 'sam@example.com', projectName: 'Hill Supply Co launch', projectBrief: 'Looking to make a run of hoodies for our shop, about 100 units.' },
    { companyName: 'Brightside Collective', contactName: 'Lee Park', email: 'lee@example.co', projectName: 'Brand partnership drop', projectBrief: 'We are doing a partnership drop with a local cafe and need 150 tote bags and 100 mugs. Can we book a call to talk about samples?' },
    { companyName: 'Lead Co x1', contactName: 'Lee Lead', email: 'lead@example.com', projectBrief: 'A first collection of ten pieces for spring.' },
    { companyName: 'Smith - Jones Design', contactName: 'Ana Smith', email: 'ana@example.com', projectName: 'Capsule', projectBrief: 'A six-piece capsule of knitwear for our studio shop.', audience: 'Design-minded customers in their thirties' },
  ];
  for (const d of real) { const r = screenIntake(d); assert.equal(r.spam, false, `${d.companyName}: ${r.score} ${r.reasons}`); }
  assert.deepEqual(screenIntake({}), { score: 0, spam: false, reasons: [] }, 'nothing to go on is not spam');
});

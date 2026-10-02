import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planClientAccess, normalizeEmails, isPublicEmailDomain, projectStageIndex, PROJECT_STAGES } from '../src/access.js';

test('company mailboxes grant the whole domain plus the contact address', () => {
  const plan = planClientAccess({ contact_email: 'Ana@Acme.co', email_domains: [], allowed_emails: [] });
  assert.deepEqual(plan.emailDomains, ['acme.co']);
  assert.deepEqual(plan.allowedEmails, ['ana@acme.co']);
  assert.equal(plan.domainAdded, true);
  assert.equal(plan.reason, 'ok');
  assert.match(plan.summary, /@acme\.co/);
});

test('personal mailboxes grant only the individual address', () => {
  for (const email of ['founder@gmail.com', 'x@icloud.com', 'y@proton.me']) {
    const plan = planClientAccess({ contact_email: email });
    assert.deepEqual(plan.emailDomains, [], email);
    assert.deepEqual(plan.allowedEmails, [email]);
    assert.equal(plan.reason, 'public-domain');
  }
  assert.equal(isPublicEmailDomain('GMAIL.com'), true);
  assert.equal(isPublicEmailDomain('acme.co'), false);
});

test('a domain already owned by another client falls back to the address, and reserved domains are never granted', () => {
  const taken = planClientAccess({ contact_email: 'b@acme.co' }, { domainTaken: true });
  assert.deepEqual(taken.emailDomains, []);
  assert.equal(taken.reason, 'domain-taken');
  const reserved = planClientAccess({ contact_email: 'kyle@thefuturebasics.com' });
  assert.deepEqual(reserved.emailDomains, []);
  assert.equal(reserved.reason, 'reserved-domain');
  const none = planClientAccess({ contact_email: '' });
  assert.equal(none.reason, 'no-contact-email');
  assert.match(none.summary, /No sign-in access/);
});

test('existing access is preserved and de-duplicated', () => {
  const plan = planClientAccess({ contact_email: 'a@acme.co', email_domains: ['acme.co'], allowed_emails: ['A@acme.co', 'cfo@acme.co'] });
  assert.deepEqual(plan.emailDomains, ['acme.co']);
  assert.deepEqual(plan.allowedEmails, ['a@acme.co', 'cfo@acme.co']);
  assert.equal(plan.reason, 'already-granted');
});

test('normalizeEmails accepts arrays or comma lists and drops junk', () => {
  assert.deepEqual(normalizeEmails(' A@x.io, b@y.co ,, not-an-email, a@x.io'), ['a@x.io', 'b@y.co']);
  assert.deepEqual(normalizeEmails(['C@z.com']), ['c@z.com']);
  assert.deepEqual(normalizeEmails(undefined), []);
});

test('projectStageIndex reads the project milestone, then falls back to product milestones', () => {
  assert.equal(projectStageIndex({ milestone: 'Development — tech pack' }), 2);
  assert.equal(projectStageIndex({ milestone: 'In progress' }, [{ milestones: [{ name: 'Sample', status: 'current' }] }]), 3);
  assert.equal(projectStageIndex({ milestone: null }, []), 0);
  assert.equal(PROJECT_STAGES.length, 8);
});

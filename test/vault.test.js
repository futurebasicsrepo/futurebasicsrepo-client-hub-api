import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, vaultReady, fingerprint } from '../src/vault.js';
import { validateVendor, abaOk, maskedBank, clientView, revealAllowed } from '../src/vendor.js';

const KEY = { VENDOR_DATA_KEY: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff' };

test('sealed values come back, and look nothing like what went in', () => {
  const t = seal({ accountNumber: '1234567890' }, KEY);
  assert.ok(t.startsWith('v1:') && !t.includes('1234567890'));
  assert.deepEqual(open(t, KEY), { accountNumber: '1234567890' });
});
test('a tampered value, a wrong key and no key are all refused', () => {
  const t = seal({ a: 1 }, KEY), parts = t.split(':');
  assert.throws(() => open([parts[0], parts[1], parts[2], 'AAAA' + parts[3].slice(4)].join(':'), KEY));
  assert.throws(() => open(t, { VENDOR_DATA_KEY: 'ff'.repeat(32) }));
  assert.equal(vaultReady({}), false);
  assert.throws(() => seal({ a: 1 }, {}), /not set up/);
  assert.equal(vaultReady({ VENDOR_DATA_KEY: 'short' }), false);
  assert.equal(vaultReady({ VENDOR_DATA_KEY: Buffer.alloc(32, 7).toString('base64') }), true);
});
test('two seals of the same value differ, a fingerprint of the same details does not', () => {
  assert.notEqual(seal({ a: 1 }, KEY), seal({ a: 1 }, KEY));
  assert.equal(fingerprint(['ach', '021000021', '12 34-56'], KEY), fingerprint(['ach', '021000021', '123456'], KEY));
  assert.notEqual(fingerprint(['ach', '021000021', '123456'], KEY), fingerprint(['ach', '021000021', '123457'], KEY));
});

const good = { companyName: 'Mill Co', address: '1 Main St', cityStateZip: 'Austin, TX 78701', taxId: '12-3456789', contactName: 'Ann', contactPhone: '+1 512 555 0100', contactEmail: 'Ann@Mill.co',
  method: 'ach', currency: 'usd', accountName: 'Mill Co', bankName: 'First Bank', accountNumber: '000123456789', routing: '021000021', signedName: 'Ann Lee', signedTitle: 'Owner', agree: true };
test('a complete ACH form is clean, and the details are normalised', () => {
  const { errors, clean } = validateVendor(good);
  assert.deepEqual(errors, {}); assert.equal(clean.currency, 'USD'); assert.equal(clean.contactEmail, 'ann@mill.co');
  assert.equal(maskedBank(clean), '••••6789');
});
test('every way the form can be wrong is named', () => {
  assert.ok(abaOk('021000021') && !abaOk('021000022') && !abaOk('12345'));
  assert.ok(validateVendor({ ...good, routing: '021000022' }).errors.routing);
  assert.ok(validateVendor({ ...good, agree: false }).errors.agree);
  assert.ok(validateVendor({ ...good, signedName: ' ' }).errors.signedName);
  assert.ok(validateVendor({ ...good, taxId: '1' }).errors.taxId);
  assert.ok(validateVendor({ ...good, currency: 'DOLLARS' }).errors.currency);
  assert.ok(validateVendor({ ...good, method: 'cash' }).errors.method);
  assert.ok(validateVendor({ ...good, method: 'wire', swift: 'ABC', bankAddress: '' }).errors.swift);
  assert.equal(validateVendor({ ...good, method: 'wire', swift: 'chasus33', bankAddress: '1 Bank St', routing: '' }).errors.swift, undefined);
  assert.ok(validateVendor({ ...good, method: 'paypal', paypalEmail: '', venmo: '' }).errors.paypalEmail);
  assert.deepEqual(validateVendor({ ...good, method: 'paypal', paypalEmail: 'pay@mill.co', accountNumber: '', routing: '' }).errors, {});
});
test('the client view carries the masks and never a number', () => {
  const v = clientView({ id: 'x', version: 2, status: 'pending', company_name: 'Mill Co', method: 'ach', currency: 'USD', bank_mask: '••••6789', tax_last4: '6789', signed_name: 'Ann', data_enc: 'secret' });
  assert.equal(v.bank, '••••6789'); assert.ok(!JSON.stringify(v).includes('secret'));
});
test('only named finance users can open full bank details; nobody by default', () => {
  assert.equal(revealAllowed('ann@tfb.com', {}), false);
  const env = { VENDOR_REVEAL_EMAILS: 'Ann@TFB.com, @finance.example' };
  assert.equal(revealAllowed('ann@tfb.com', env), true); assert.equal(revealAllowed('bob@finance.example', env), true);
  assert.equal(revealAllowed('bob@tfb.com', env), false); assert.equal(revealAllowed('', env), false); assert.equal(revealAllowed('x@evilfinance.example', env), false);
});

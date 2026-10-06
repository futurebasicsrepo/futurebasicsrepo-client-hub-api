import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPartner, MAKES } from '../src/booth.js';

test('only the company is needed to save a factory met at a booth', () => {
  assert.match(cleanPartner({}).error, /company name/);
  const r = cleanPartner({ company: '  Mill A   Guangzhou ' }); assert.equal(r.p.company, 'Mill A Guangzhou'); assert.equal(r.p.email, null); assert.equal(r.p.lang, 'en');
});

test('what they make is a list of tags, from chips or text, without repeats', () => {
  assert.equal(cleanPartner({ company: 'A', makes: ['Footwear', 'Footwear', ' Bags '] }).p.makes, 'Footwear, Bags');
  assert.equal(cleanPartner({ company: 'A', makes: 'sneakers, EVA soles, sneakers' }).p.makes, 'sneakers, EVA soles');
  assert.ok(MAKES.includes('Electronics'));
});

test('rating is 1 to 5 or nothing; a bad email is sent back; a website gets its scheme; the language is one we have', () => {
  assert.equal(cleanPartner({ company: 'A', rating: 4 }).p.rating, 4); assert.equal(cleanPartner({ company: 'A', rating: 9 }).p.rating, null); assert.equal(cleanPartner({ company: 'A', rating: '' }).p.rating, null);
  assert.match(cleanPartner({ company: 'A', email: 'nope' }).error, /email/);
  assert.equal(cleanPartner({ company: 'A', email: 'LI@Mill.CN' }).p.email, 'li@mill.cn');
  assert.equal(cleanPartner({ company: 'A', website: 'www.mill.cn' }).p.website, 'https://www.mill.cn');
  assert.equal(cleanPartner({ company: 'A', lang: 'fr' }).p.lang, 'en'); assert.equal(cleanPartner({ company: 'A', lang: 'zh-hk' }).p.lang, 'zh-hk');
});
